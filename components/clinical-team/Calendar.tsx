'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import type { EventClickArg, EventChangeArg, ViewMountArg } from '@fullcalendar/core';
import { collection, doc, onSnapshot, updateDoc, query, where, getDocs, type QuerySnapshot } from 'firebase/firestore';

import { db } from '@/lib/firebase';
import PageHeader from '@/components/PageHeader';
import NotificationCenter, { type UpcomingReminder } from '@/components/notifications/NotificationCenter';
import { useAuth } from '@/contexts/AuthContext';
import type { PatientRecordBasic, PatientStatus } from '@/lib/types';

interface AppointmentRecord {
	id: string;
	patientId?: string;
	patient?: string;
	doctor?: string;
	date?: string;
	time?: string;
	duration?: number;
	status?: string;
	notes?: string;
}

interface CalendarEvent {
	id: string;
	appointment: AppointmentRecord;
	patient: PatientRecordBasic | undefined;
	dateKey: string;
}

interface StaffMember {
	id: string;
	userName: string;
	role: string;
	status: string;
}

interface TimeSlot {
	start: string;
	end: string;
}

interface DayAvailability {
	enabled: boolean;
	slots: TimeSlot[];
}

interface AvailabilitySchedule {
	[day: string]: DayAvailability;
}

interface DateSpecificAvailability {
	[date: string]: DayAvailability; // date in YYYY-MM-DD format
}

const statusColors: Record<string, string> = {
	pending: 'bg-amber-400',
	ongoing: 'bg-sky-500',
	completed: 'bg-emerald-500',
	cancelled: 'bg-rose-500',
};

const SLOT_INTERVAL_MINUTES = 30;


const formatDateTime = (date?: string, time?: string) => {
	if (!date) return '';
	const isoString = time ? `${date}T${time}` : date;
	const parsed = new Date(isoString);
	if (Number.isNaN(parsed.getTime())) return date;
	return new Intl.DateTimeFormat('en-US', {
		month: 'short',
		day: 'numeric',
		year: 'numeric',
		hour: time ? 'numeric' : undefined,
		minute: time ? '2-digit' : undefined,
	}).format(parsed);
};

const toDateKey = (value: string) => value;

const capitalize = (str?: string) => {
	if (!str) return '';
	return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
};

function normalize(value?: string | null) {
	return value?.trim().toLowerCase() ?? '';
}

export default function Calendar() {
	const { user } = useAuth();
	const [appointments, setAppointments] = useState<AppointmentRecord[]>([]);
	const [patients, setPatients] = useState<PatientRecordBasic[]>([]);
	const [staff, setStaff] = useState<StaffMember[]>([]);
	const [dateSpecificAvailability, setDateSpecificAvailability] = useState<DateSpecificAvailability | null>(null);

	const [currentView, setCurrentView] = useState<string>('dayGridMonth');
	const [isRescheduling, setIsRescheduling] = useState<string | null>(null);
	const [loading, setLoading] = useState(true);

	const [detailEvent, setDetailEvent] = useState<CalendarEvent | null>(null);
	const calendarRef = useRef<FullCalendar>(null);

	const clinicianName = useMemo(() => normalize(user?.displayName ?? ''), [user?.displayName]);
	const isMountedRef = useRef(true);

	useEffect(() => {
		isMountedRef.current = true;
		let appointmentsLoaded = false;
		let patientsLoaded = false;
		let staffLoaded = false;
		let unsubscribed = false;
		let unsubscribeAvailability: (() => void) | null = null;

		const checkAllLoaded = () => {
			if (!isMountedRef.current || unsubscribed) return;
			if (appointmentsLoaded && patientsLoaded && staffLoaded) {
				setLoading(false);
			}
		};

		const safeSetState = <T,>(setter: (value: T) => void, value: T) => {
			if (isMountedRef.current && !unsubscribed) {
				setter(value);
			}
		};

		const unsubscribePatients = onSnapshot(
			collection(db, 'patients'),
			(snapshot: QuerySnapshot) => {
				if (!isMountedRef.current || unsubscribed) return;
				
				try {
					const mapped = snapshot.docs.map(docSnap => {
						const data = docSnap.data() as Record<string, unknown>;
						const created = (data.registeredAt as { toDate?: () => Date } | undefined)?.toDate?.();
						return {
							id: docSnap.id,
							patientId: data.patientId ? String(data.patientId) : undefined,
							name: data.name ? String(data.name) : undefined,
							dob: data.dob ? String(data.dob) : undefined,
							gender: data.gender ? String(data.gender) : undefined,
							phone: data.phone ? String(data.phone) : undefined,
							email: data.email ? String(data.email) : undefined,
							address: data.address ? String(data.address) : undefined,
							complaint: data.complaint ? String(data.complaint) : undefined,
							status: (data.status as PatientStatus) ?? 'pending',
							assignedDoctor: data.assignedDoctor ? String(data.assignedDoctor) : undefined,
							registeredAt: created ? created.toISOString() : (data.registeredAt as string | undefined),
						};
					});
					safeSetState(setPatients, mapped);
					patientsLoaded = true;
					checkAllLoaded();
				} catch (error) {
					console.error('Error processing patients snapshot', error);
					if (isMountedRef.current && !unsubscribed) {
						safeSetState(setPatients, []);
						patientsLoaded = true;
						checkAllLoaded();
					}
				}
			},
			error => {
				if (unsubscribed) return;
				console.error('Failed to load patients', error);
				if (isMountedRef.current) {
					safeSetState(setPatients, []);
					patientsLoaded = true;
					checkAllLoaded();
				}
			}
		);

		const unsubscribeAppointments = onSnapshot(
			collection(db, 'appointments'),
			(snapshot: QuerySnapshot) => {
				if (!isMountedRef.current || unsubscribed) return;
				
				try {
					const mapped = snapshot.docs.map(docSnap => {
						const data = docSnap.data() as Record<string, unknown>;
						return {
							id: docSnap.id,
							patientId: data.patientId ? String(data.patientId) : undefined,
							patient: data.patient ? String(data.patient) : undefined,
							doctor: data.doctor ? String(data.doctor) : undefined,
							date: data.date ? String(data.date) : undefined,
							time: data.time ? String(data.time) : undefined,
							duration: typeof data.duration === 'number' ? data.duration : undefined,
							status: data.status ? String(data.status) : undefined,
							notes: data.notes ? String(data.notes) : undefined,
						};
					});
					safeSetState(setAppointments, mapped);
					appointmentsLoaded = true;
					checkAllLoaded();
				} catch (error) {
					console.error('Error processing appointments snapshot', error);
					if (isMountedRef.current && !unsubscribed) {
						safeSetState(setAppointments, []);
						appointmentsLoaded = true;
						checkAllLoaded();
					}
				}
			},
			error => {
				if (unsubscribed) return;
				console.error('Failed to load appointments', error);
				if (isMountedRef.current) {
					safeSetState(setAppointments, []);
					appointmentsLoaded = true;
					checkAllLoaded();
				}
			}
		);

		const unsubscribeStaff = onSnapshot(
			collection(db, 'staff'),
			(snapshot: QuerySnapshot) => {
				if (!isMountedRef.current || unsubscribed) return;
				
				try {
					const mapped = snapshot.docs.map(docSnap => {
						const data = docSnap.data() as Record<string, unknown>;
						return {
							id: docSnap.id,
							userName: data.userName ? String(data.userName) : '',
							role: data.role ? String(data.role) : '',
							status: data.status ? String(data.status) : '',
						};
					});
					safeSetState(setStaff, mapped);
					staffLoaded = true;
					checkAllLoaded();
				} catch (error) {
					console.error('Error processing staff snapshot', error);
					if (isMountedRef.current && !unsubscribed) {
						safeSetState(setStaff, []);
						staffLoaded = true;
						checkAllLoaded();
					}
				}
			},
			error => {
				if (unsubscribed) return;
				console.error('Failed to load staff', error);
				if (isMountedRef.current) {
					safeSetState(setStaff, []);
					staffLoaded = true;
					checkAllLoaded();
				}
			}
		);

		// Load availability schedule for current user with real-time updates
		const loadAvailability = async () => {
			if (!user?.email) return;
			
			try {
				const staffQuery = query(collection(db, 'staff'), where('userEmail', '==', user.email.toLowerCase()));
				const querySnapshot = await getDocs(staffQuery);
				
				if (!querySnapshot.empty && !unsubscribed) {
					const staffDoc = querySnapshot.docs[0];
					const staffRef = doc(db, 'staff', staffDoc.id);
					
					// Set up real-time listener for availability changes
					unsubscribeAvailability = onSnapshot(
						staffRef,
						snapshot => {
							if (!isMountedRef.current || unsubscribed) return;
							
							if (snapshot.exists()) {
								const data = snapshot.data();
								const loadedDateSpecific = data.dateSpecificAvailability as DateSpecificAvailability | undefined;

								if (loadedDateSpecific) {
									console.log('📅 Loaded availability:', loadedDateSpecific);
									console.log('📅 Available dates:', Object.keys(loadedDateSpecific));
									// Log each date's schedule
									Object.entries(loadedDateSpecific).forEach(([date, schedule]) => {
										console.log(`  - ${date}: enabled=${schedule.enabled}, slots=${schedule.slots?.length || 0}`);
									});
									safeSetState(setDateSpecificAvailability, loadedDateSpecific);
								} else {
									console.log('📅 No availability data found');
									safeSetState(setDateSpecificAvailability, null);
								}
							} else {
								safeSetState(setDateSpecificAvailability, null);
							}
						},
						error => {
							if (unsubscribed) return;
							console.error('Failed to load availability', error);
							if (isMountedRef.current) {
								safeSetState(setDateSpecificAvailability, null);
							}
						}
					);
				}
			} catch (error) {
				if (unsubscribed) return;
				console.error('Failed to find staff document for availability', error);
				if (isMountedRef.current) {
					safeSetState(setDateSpecificAvailability, null);
				}
			}
		};

		loadAvailability();

		// Fallback timeout to ensure loading completes even if something goes wrong
		const timeout = setTimeout(() => {
			if (isMountedRef.current && !unsubscribed) {
				setLoading(false);
			}
		}, 5000);

		return () => {
			unsubscribed = true;
			isMountedRef.current = false;
			clearTimeout(timeout);
			
			// Unsubscribe in a try-catch to prevent errors during cleanup
			try {
				unsubscribePatients();
			} catch (error) {
				console.error('Error unsubscribing patients', error);
			}
			try {
				unsubscribeAppointments();
			} catch (error) {
				console.error('Error unsubscribing appointments', error);
			}
			try {
				unsubscribeStaff();
			} catch (error) {
				console.error('Error unsubscribing staff', error);
			}
			try {
				if (unsubscribeAvailability) {
					unsubscribeAvailability();
				}
			} catch (error) {
				console.error('Error unsubscribing availability', error);
			}
		};
	}, [user?.email]);

	const patientLookup = useMemo(() => {
		const map = new Map<string, PatientRecordBasic>();
		for (const patient of patients) {
			if (patient.patientId) {
				map.set(patient.patientId, patient);
			}
		}
		return map;
	}, [patients]);

	// Filter appointments by current clinician only (show only their schedule)
	const assignedAppointments = useMemo(() => {
		if (!clinicianName) {
			return [];
		}
		return appointments.filter(appointment => normalize(appointment.doctor) === clinicianName);
	}, [appointments, clinicianName]);

	const events = useMemo<CalendarEvent[]>(() => {
		return assignedAppointments.map(appointment => {
			const patient = appointment.patientId ? patientLookup.get(appointment.patientId) : undefined;
			return {
				id: appointment.id,
				appointment,
				patient,
				dateKey: appointment.date || '',
			};
		});
	}, [assignedAppointments, patientLookup]);


	const upcomingReminders = useMemo<UpcomingReminder[]>(() => {
		const now = new Date();
		const limit = new Date(now.getTime() + 24 * 60 * 60 * 1000);

		const reminders: UpcomingReminder[] = [];

		for (const event of events) {
			if (!event.appointment.date) continue;

			const scheduledAt = event.appointment.time
				? new Date(`${event.appointment.date}T${event.appointment.time}`)
				: new Date(event.appointment.date);

			if (Number.isNaN(scheduledAt.getTime())) continue;
			if (scheduledAt < now || scheduledAt > limit) continue;

			const title =
				event.patient?.name || event.appointment.patient || event.appointment.patientId || 'Appointment';

			const subtitleParts: string[] = [];
			if (event.appointment.doctor) {
				subtitleParts.push(`with ${event.appointment.doctor}`);
			}
			if (event.patient?.complaint) {
				subtitleParts.push(event.patient.complaint);
			} else if (event.appointment.notes) {
				subtitleParts.push(event.appointment.notes);
			}

			reminders.push({
				id: event.id,
				title,
				subtitle: subtitleParts.length ? subtitleParts.join(' · ') : undefined,
				scheduledAt,
				status: event.appointment.status ?? 'pending',
				source: 'Calendar',
			});
		}

		return reminders.sort((a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime());
	}, [events]);


	const handleToday = () => {
		const calendarApi = calendarRef.current?.getApi();
		if (calendarApi) {
			calendarApi.today();
		}
	};


	const handleEventClick = (clickInfo: EventClickArg) => {
		clickInfo.jsEvent.preventDefault();
		const eventData = clickInfo.event.extendedProps as {
			appointment: AppointmentRecord;
			patient: PatientRecordBasic | undefined;
		};
		if (eventData) {
			const event: CalendarEvent = {
				id: clickInfo.event.id,
				appointment: eventData.appointment,
				patient: eventData.patient,
				dateKey: eventData.appointment.date || '',
			};
			openDetail(event);
		}
	};


	const openDetail = (event: CalendarEvent) => {
		setDetailEvent(event);
	};

	const closeDetail = () => {
		setDetailEvent(null);
	};

	// Helper to format date as YYYY-MM-DD in local timezone
	const formatDateKey = (date: Date): string => {
		const year = date.getFullYear();
		const month = String(date.getMonth() + 1).padStart(2, '0');
		const day = String(date.getDate()).padStart(2, '0');
		return `${year}-${month}-${day}`;
	};

	// Generate availability events from date-specific schedule
	const availabilityEvents = useMemo(() => {
		if (!dateSpecificAvailability || Object.keys(dateSpecificAvailability).length === 0) {
			return [];
		}
		
		const events: Array<{
			id: string;
			title: string;
			start: string;
			end: string;
			backgroundColor: string;
			borderColor: string;
			display: 'background' | 'block';
			editable: boolean;
			startEditable: boolean;
			durationEditable: boolean;
			extendedProps: { type: 'availability' };
		}> = [];
		
		// Generate events for the next 6 months
		// Start from 3 months ago to catch any past dates that might be scheduled
		const today = new Date();
		today.setHours(0, 0, 0, 0); // Reset to start of day (local time)
		const startDate = new Date(today);
		startDate.setMonth(today.getMonth() - 3); // Look back 3 months
		const endDate = new Date(today);
		endDate.setMonth(today.getMonth() + 6);
		
		const currentDate = new Date(startDate);
		
		console.log('📅 Generating events from', formatDateKey(startDate), 'to', formatDateKey(endDate));
		
		while (currentDate <= endDate) {
			const dateKey = formatDateKey(currentDate);
			
			// Check for date-specific schedule
			const daySchedule = dateSpecificAvailability[dateKey];
			
			// Debug: log if we find a schedule
			if (daySchedule) {
				console.log(`📅 Found schedule for ${dateKey}:`, daySchedule);
			}
			
			if (daySchedule?.enabled && daySchedule.slots && daySchedule.slots.length > 0) {
				console.log(`✅ Creating events for ${dateKey} with ${daySchedule.slots.length} slot(s)`);
				for (const slot of daySchedule.slots) {
					if (!slot.start || !slot.end) continue;
					
					const [startHours, startMinutes] = slot.start.split(':').map(Number);
					const [endHours, endMinutes] = slot.end.split(':').map(Number);
					
					if (isNaN(startHours) || isNaN(startMinutes) || isNaN(endHours) || isNaN(endMinutes)) {
						continue;
					}
					
					const startDateTime = new Date(currentDate);
					startDateTime.setHours(startHours, startMinutes, 0, 0);
					
					const endDateTime = new Date(currentDate);
					endDateTime.setHours(endHours, endMinutes, 0, 0);
					
					// If end time is before start time, it means it's the next day
					if (endDateTime <= startDateTime) {
						endDateTime.setDate(endDateTime.getDate() + 1);
					}
					
					events.push({
						id: `availability-${dateKey}-${slot.start}-${slot.end}`,
						title: 'Available',
						start: startDateTime.toISOString(),
						end: endDateTime.toISOString(),
						backgroundColor: '#e0f2fe',
						borderColor: '#0ea5e9',
						display: 'block',
						editable: false,
						startEditable: false,
						durationEditable: false,
						extendedProps: { type: 'availability' },
					});
				}
			}
			
			currentDate.setDate(currentDate.getDate() + 1);
		}
		
		console.log('📅 Generated availability events:', events.length, 'events');
		return events;
	}, [dateSpecificAvailability]);

	const calendarEvents = useMemo(() => {
		const appointmentEvents = events
			.filter(event => {
				// Filter out events without valid dates
				if (!event.appointment.date) return false;
				
				// Validate date format (should be YYYY-MM-DD)
				const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
				if (!dateRegex.test(event.appointment.date)) return false;
				
				return true;
			})
			.map(event => {
				// Format date and time for FullCalendar
				let startDateObj: Date | null = null;
				const durationMinutes = Math.max(
					SLOT_INTERVAL_MINUTES,
					event.appointment.duration ?? SLOT_INTERVAL_MINUTES
				);
				
				if (event.appointment.time) {
					let timeStr = event.appointment.time.trim();
					
					// Ensure seconds are present for ISO format
					const timeParts = timeStr.split(':');
					if (timeParts.length === 2) {
						timeStr = `${timeStr}:00`;
					} else if (timeParts.length === 1) {
						timeStr = `${timeStr}:00:00`;
					}
					
					startDateObj = new Date(`${event.appointment.date}T${timeStr}`);
					if (Number.isNaN(startDateObj.getTime())) {
						startDateObj = null;
					}
				} else if (event.appointment.date) {
					const potentialDate = new Date(event.appointment.date);
					if (!Number.isNaN(potentialDate.getTime())) {
						startDateObj = potentialDate;
				}
				}

				if (!startDateObj) {
					// Skip malformed events
					return null;
				}

				const endDateObj = new Date(startDateObj.getTime() + durationMinutes * 60000);
				
				// Extract color class name to actual color value
				const statusColorClass = statusColors[(event.appointment.status ?? 'pending') as string] || statusColors.pending;
				const colorMap: Record<string, string> = {
					'bg-amber-400': '#fbbf24',
					'bg-sky-500': '#0ea5e9',
					'bg-emerald-500': '#10b981',
					'bg-rose-500': '#f43f5e',
				};
				const backgroundColor = colorMap[statusColorClass] || '#fbbf24';
				const borderColor = colorMap[statusColorClass] || '#fbbf24';
				
				// Format patient name for display
				const patientName = event.patient?.name || event.appointment.patient || event.appointment.patientId || 'Patient';
				
				// Format time for display (if available)
				let timeDisplay = '';
				if (event.appointment.time) {
					const timeStr = event.appointment.time.trim();
					const timeParts = timeStr.split(':');
					if (timeParts.length >= 2) {
						const hours = parseInt(timeParts[0], 10);
						const minutes = timeParts[1];
						const ampm = hours >= 12 ? 'PM' : 'AM';
						const displayHours = hours % 12 || 12;
						timeDisplay = ` ${displayHours}:${minutes} ${ampm}`;
					}
				}
				
				// Create title with patient name and time
				const eventTitle = timeDisplay ? `${patientName}${timeDisplay}` : patientName;
				
				return {
					id: event.id,
					title: eventTitle,
					start: startDateObj,
					end: endDateObj,
					extendedProps: {
						appointment: event.appointment,
						patient: event.patient,
						type: 'appointment',
						patientName: patientName, // Store for easy access
					},
					backgroundColor,
					borderColor,
					editable: true,
					startEditable: true,
					durationEditable: false,
				};
			})
			.filter(Boolean) as Array<
				{
					id: string;
					title: string;
					start: Date;
					end: Date;
					extendedProps: {
						appointment: AppointmentRecord;
						patient: PatientRecordBasic | undefined;
						type: 'appointment';
						patientName: string;
					};
					backgroundColor: string;
					borderColor: string;
					editable: boolean;
					startEditable: boolean;
					durationEditable: boolean;
				}
			>;
		
		// Combine appointment events with availability events
		return [...availabilityEvents, ...appointmentEvents];
	}, [events, availabilityEvents]);

	const handleViewChange = (view: ViewMountArg) => {
		setCurrentView(view.view.type);
	};

	const handlePrev = () => {
		const calendarApi = calendarRef.current?.getApi();
		if (calendarApi) {
			calendarApi.prev();
		}
	};

	const handleNext = () => {
		const calendarApi = calendarRef.current?.getApi();
		if (calendarApi) {
			calendarApi.next();
		}
	};

	// Auto-navigate to the month with the earliest appointment
	useEffect(() => {
		if (calendarEvents.length > 0 && calendarRef.current) {
			const calendarApi = calendarRef.current.getApi();
			const earliestEvent = calendarEvents.reduce((earliest, event) => {
				const eventDate = new Date(event.start);
				const earliestDate = new Date(earliest.start);
				return eventDate < earliestDate ? event : earliest;
			}, calendarEvents[0]);

			if (earliestEvent) {
				const eventDate = new Date(earliestEvent.start);
				const currentDate = calendarApi.getDate();
				
				const currentMonth = currentDate.getMonth();
				const currentYear = currentDate.getFullYear();
				const eventMonth = eventDate.getMonth();
				const eventYear = eventDate.getFullYear();

				const hasEventsInCurrentMonth = calendarEvents.some(event => {
					const evtDate = new Date(event.start);
					return evtDate.getMonth() === currentMonth && evtDate.getFullYear() === currentYear;
				});

				if (!hasEventsInCurrentMonth) {
					calendarApi.gotoDate(eventDate);
				}
			}
		}
	}, [calendarEvents]);

	const handleEventDrop = async (changeInfo: EventChangeArg) => {
		const eventId = changeInfo.event.id;
		const newStart = changeInfo.event.start;
		
		if (!newStart) {
			changeInfo.revert();
			return;
		}

		// Extract date and time from the new start (using local time)
		const year = newStart.getFullYear();
		const month = String(newStart.getMonth() + 1).padStart(2, '0');
		const day = String(newStart.getDate()).padStart(2, '0');
		const hours = String(newStart.getHours()).padStart(2, '0');
		const minutes = String(newStart.getMinutes()).padStart(2, '0');
		
		const newDate = `${year}-${month}-${day}`;
		const newTime = `${hours}:${minutes}`;

		setIsRescheduling(eventId);
		
		try {
			const appointmentRef = doc(db, 'appointments', eventId);
			await updateDoc(appointmentRef, {
				date: newDate,
				time: newTime,
			});
		} catch (error) {
			console.error('Failed to reschedule appointment', error);
			alert('Failed to reschedule appointment. Please try again.');
			changeInfo.revert();
		} finally {
			setIsRescheduling(null);
		}
	};

	if (loading) {
		return (
			<div className="min-h-svh bg-slate-50 px-6 py-10">
				<div className="mx-auto max-w-6xl">
					<div className="py-12 text-center text-sm text-slate-500">
						<div className="loading-spinner" aria-hidden="true" />
						<span className="ml-3 align-middle">Loading calendar...</span>
					</div>
				</div>
			</div>
		);
	}

	return (
		<div className="min-h-svh bg-slate-50 px-6 py-10">
			<div className="mx-auto max-w-6xl space-y-10">
				<PageHeader
					badge="Clinical Team"
					title="My Calendar & Notifications"
					description="View your scheduled appointments and manage upcoming reminders and notifications."
				/>

				{!clinicianName && (
					<div className="rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
						No clinician name found. Appointments are filtered by your display name.
					</div>
				)}

				{assignedAppointments.length === 0 && appointments.length > 0 && (
					<div className="rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
						No appointments found for your schedule. Make sure your display name matches the doctor name in appointments.
					</div>
				)}

				{calendarEvents.length > 0 && (
					<div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-emerald-200 bg-gradient-to-r from-emerald-50 to-sky-50 px-5 py-4">
						<div className="flex items-center gap-3">
							<div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
								<i className="fas fa-calendar-check text-sm" aria-hidden="true" />
							</div>
							<div>
								<p className="text-sm font-semibold text-slate-900">
									Showing {calendarEvents.length} appointment{calendarEvents.length !== 1 ? 's' : ''} on your schedule
								</p>
								<p className="text-xs text-slate-600">Your upcoming appointments</p>
							</div>
						</div>
						<div className="flex items-center gap-3">
							<div className="flex items-center gap-2 text-xs">
								<div className="h-3 w-3 rounded-full bg-amber-400" />
								<span className="text-slate-600">Pending</span>
							</div>
							<div className="flex items-center gap-2 text-xs">
								<div className="h-3 w-3 rounded-full bg-sky-500" />
								<span className="text-slate-600">Ongoing</span>
							</div>
							<div className="flex items-center gap-2 text-xs">
								<div className="h-3 w-3 rounded-full bg-emerald-500" />
								<span className="text-slate-600">Completed</span>
							</div>
							<div className="flex items-center gap-2 text-xs">
								<div className="h-3 w-3 rounded-full bg-rose-500" />
								<span className="text-slate-600">Cancelled</span>
							</div>
							<div className="flex items-center gap-2 text-xs">
								<div className="h-3 w-3 rounded-full bg-sky-200 border border-sky-400" />
								<span className="text-slate-600">Available</span>
							</div>
						</div>
					</div>
				)}

				<div className="border-t border-slate-200" />

				<section className="flex flex-col gap-6 lg:flex-row">
					<div className="flex-1 rounded-2xl border border-slate-200 bg-white p-6 shadow-lg">
						<div className="mb-6 flex flex-wrap items-center justify-between gap-4">
							<div className="flex items-center gap-2">
								<button
									type="button"
									onClick={handlePrev}
									className="inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white p-2.5 text-xl font-semibold text-slate-700 shadow-sm transition hover:border-sky-400 hover:bg-sky-50 hover:text-sky-700 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-2"
									aria-label="Previous"
								>
									<i className="fas fa-arrow-left" aria-hidden="true" />
								</button>
								<button
									type="button"
									onClick={handleNext}
									className="inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white p-2.5 text-xl font-semibold text-slate-700 shadow-sm transition hover:border-sky-400 hover:bg-sky-50 hover:text-sky-700 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-2"
									aria-label="Next"
								>
									<i className="fas fa-arrow-right" aria-hidden="true" />
								</button>
								<button
									type="button"
									onClick={handleToday}
									className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:border-sky-400 hover:bg-sky-50 hover:text-sky-700 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-2"
								>
									<i className="fas fa-calendar-day text-xs" aria-hidden="true" />
									Today
								</button>
								<div className="flex items-center gap-1 rounded-lg border border-slate-300 bg-slate-50 p-1 shadow-sm">
									<button
										type="button"
										onClick={() => {
											const calendarApi = calendarRef.current?.getApi();
											if (calendarApi) {
												calendarApi.changeView('dayGridMonth');
												setCurrentView('dayGridMonth');
											}
										}}
										className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-all ${
											currentView === 'dayGridMonth'
												? 'bg-white text-sky-700 shadow-sm'
												: 'text-slate-600 hover:bg-white/50'
										}`}
									>
										<i className="fas fa-calendar-alt text-[10px]" aria-hidden="true" />
										Month
									</button>
									<button
										type="button"
										onClick={() => {
											const calendarApi = calendarRef.current?.getApi();
											if (calendarApi) {
												calendarApi.changeView('timeGridWeek');
												setCurrentView('timeGridWeek');
											}
										}}
										className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-all ${
											currentView === 'timeGridWeek'
												? 'bg-white text-sky-700 shadow-sm'
												: 'text-slate-600 hover:bg-white/50'
										}`}
									>
										<i className="fas fa-calendar-week text-[10px]" aria-hidden="true" />
										Week
									</button>
									<button
										type="button"
										onClick={() => {
											const calendarApi = calendarRef.current?.getApi();
											if (calendarApi) {
												calendarApi.changeView('timeGridDay');
												setCurrentView('timeGridDay');
											}
										}}
										className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-all ${
											currentView === 'timeGridDay'
												? 'bg-white text-sky-700 shadow-sm'
												: 'text-slate-600 hover:bg-white/50'
										}`}
									>
										<i className="fas fa-calendar-day text-[10px]" aria-hidden="true" />
										Day
									</button>
								</div>
							</div>
						</div>
					<div className="[&_.fc-toolbar-title]:text-xl [&_.fc-toolbar-title]:font-bold [&_.fc-toolbar-title]:text-slate-800 [&_.fc-button]:border-slate-300 [&_.fc-button]:bg-white [&_.fc-button]:text-slate-700 [&_.fc-button]:font-medium [&_.fc-button:hover]:border-sky-400 [&_.fc-button:hover]:bg-sky-50 [&_.fc-button:hover]:text-sky-700 [&_.fc-button-active]:bg-sky-100 [&_.fc-button-active]:border-sky-400 [&_.fc-button-active]:text-sky-700 [&_.fc-button-active]:shadow-sm [&_.fc-daygrid-day-number]:text-slate-700 [&_.fc-daygrid-day-number]:font-medium [&_.fc-col-header-cell]:bg-gradient-to-b [&_.fc-col-header-cell]:from-slate-50 [&_.fc-col-header-cell]:to-slate-100 [&_.fc-col-header-cell]:text-slate-700 [&_.fc-col-header-cell]:font-semibold [&_.fc-col-header-cell]:py-3 [&_.fc-day-today]:bg-gradient-to-br [&_.fc-day-today]:from-sky-50 [&_.fc-day-today]:to-blue-50 [&_.fc-day-today]:border-2 [&_.fc-day-today]:border-sky-300 [&_.fc-timegrid-slot]:min-h-[2.5em] [&_.fc-event]:cursor-pointer [&_.fc-event]:transition-all [&_.fc-event:hover]:shadow-md [&_.fc-event:hover]:scale-[1.02] [&_.fc-event-title]:font-medium [&_.fc-event-title]:px-1 [&_.fc-event-title]:text-sm [&_.fc-event-title]:font-semibold [&_.fc-daygrid-event]:text-white [&_.fc-timegrid-event]:text-white">
						<FullCalendar
							ref={calendarRef}
							plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
							initialView="dayGridMonth"
							headerToolbar={{
								left: '',
								center: 'title',
								right: '',
							}}
							views={{
								dayGridMonth: {
									dayMaxEvents: 3,
								},
								timeGridWeek: {
									slotMinTime: '08:00:00',
									slotMaxTime: '20:00:00',
								},
								timeGridDay: {
									slotMinTime: '08:00:00',
									slotMaxTime: '20:00:00',
								},
							}}
							events={calendarEvents}
							eventClick={(clickInfo) => {
								// Only handle clicks on appointment events, not availability
								const eventType = clickInfo.event.extendedProps?.type;
								if (eventType === 'availability') {
									return; // Don't open detail modal for availability events
								}
								handleEventClick(clickInfo);
							}}
							eventDrop={handleEventDrop}
							viewDidMount={handleViewChange}
							fixedWeekCount={false}
							height="auto"
							eventDisplay="block"
							editable={true}
							droppable={false}
							selectable={false}
							dayMaxEvents={true}
							weekNumbers={false}
							nowIndicator={true}
							slotDuration="00:30:00"
							slotLabelInterval="01:00:00"
							timeZone="local"
						/>
					</div>
						{isRescheduling && (
							<div className="mt-4 flex items-center gap-3 rounded-lg border border-amber-200 bg-gradient-to-r from-amber-50 to-yellow-50 px-4 py-3 shadow-sm">
								<div className="h-5 w-5 animate-spin rounded-full border-2 border-amber-600 border-t-transparent" />
								<p className="text-sm font-medium text-amber-800">Updating appointment...</p>
							</div>
						)}
					</div>

				<NotificationCenter
					userId={user?.uid}
					upcomingReminders={upcomingReminders}
					className="h-fit w-full lg:w-[320px]"
					emptyStateHint="New notifications will appear here as appointments and system alerts are generated."
				/>
			</section>

			{detailEvent && (
				<div
					role="dialog"
					aria-modal="true"
					className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 backdrop-blur-sm px-4 py-6"
				>
					<div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white shadow-2xl">
						<header className="flex items-center justify-between border-b border-slate-200 bg-gradient-to-r from-slate-50 to-white px-6 py-5">
							<h2 className="text-xl font-bold text-slate-900">
								<i className="fas fa-info-circle mr-2 text-sky-600" aria-hidden="true" />
								Appointment Details
							</h2>
							<button
								type="button"
								onClick={closeDetail}
								className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 focus-visible:bg-slate-100 focus-visible:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
								aria-label="Close dialog"
							>
								<i className="fas fa-times text-lg" aria-hidden="true" />
							</button>
						</header>
						<div className="space-y-4 px-6 py-6">
							<div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
								<div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
									<p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Patient</p>
									<p className="mt-1 text-sm font-semibold text-slate-900">
										{detailEvent.patient?.name ||
											detailEvent.appointment.patient ||
											detailEvent.appointment.patientId}
									</p>
								</div>
								<div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
									<p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Patient ID</p>
									<p className="mt-1 text-sm font-semibold text-slate-900">{detailEvent.appointment.patientId || '—'}</p>
								</div>
								<div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
									<p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Date</p>
									<p className="mt-1 text-sm font-semibold text-slate-900">{formatDateTime(detailEvent.appointment.date)}</p>
								</div>
								<div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
									<p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Time</p>
									<p className="mt-1 text-sm font-semibold text-slate-900">{detailEvent.appointment.time || 'All-day'}</p>
								</div>
								<div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
									<p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Status</p>
									<span
										className={`mt-1 inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold text-white ${statusColors[(detailEvent.appointment.status ?? 'pending') as string] || statusColors.pending}`}
									>
										{capitalize(detailEvent.appointment.status ?? 'pending')}
									</span>
								</div>
							</div>
							{(detailEvent.patient?.complaint || detailEvent.appointment.notes) && (
								<div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
									{detailEvent.patient?.complaint && (
										<div className="mb-3">
											<p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Complaint</p>
											<p className="mt-1 text-sm text-slate-900">{detailEvent.patient.complaint}</p>
										</div>
									)}
									{detailEvent.appointment.notes && (
										<div>
											<p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Notes</p>
											<p className="mt-1 text-sm text-slate-900">{detailEvent.appointment.notes}</p>
										</div>
									)}
								</div>
							)}
						</div>
						<footer className="flex items-center justify-end border-t border-slate-200 bg-slate-50 px-6 py-4">
							<button
								type="button"
								onClick={closeDetail}
								className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-sky-400 hover:bg-sky-50 hover:text-sky-700 focus-visible:border-sky-400 focus-visible:text-sky-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
							>
								<i className="fas fa-times text-xs" aria-hidden="true" />
								Close
							</button>
						</footer>
					</div>
				</div>
			)}
			</div>
		</div>
	);
}

