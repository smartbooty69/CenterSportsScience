'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import type { DateSelectArg, EventClickArg, EventChangeArg, ViewApi, ViewMountArg } from '@fullcalendar/core';
import { collection, doc, onSnapshot, updateDoc, type QuerySnapshot } from 'firebase/firestore';

import { db } from '@/lib/firebase';
import PageHeader from '@/components/PageHeader';
import NotificationCenter, { type UpcomingReminder } from '@/components/notifications/NotificationCenter';
import { useAuth } from '@/contexts/AuthContext';

type PatientStatus = 'pending' | 'ongoing' | 'completed' | 'cancelled' | string;

interface PatientRecord {
	id: string;
	patientId?: string;
	name?: string;
	dob?: string;
	gender?: string;
	phone?: string;
	email?: string;
	address?: string;
	complaint?: string;
	status?: PatientStatus;
	assignedDoctor?: string;
	registeredAt?: string;
}

interface AppointmentRecord {
	id: string;
	patientId?: string;
	patient?: string;
	doctor?: string;
	date?: string;
	time?: string;
	status?: string;
	notes?: string;
}

interface CalendarEvent {
	id: string;
	appointment: AppointmentRecord;
	patient: PatientRecord | undefined;
	dateKey: string;
}

interface StaffMember {
	id: string;
	userName: string;
	role: string;
	status: string;
}

const statusColors: Record<string, string> = {
	pending: 'bg-amber-400',
	ongoing: 'bg-sky-500',
	completed: 'bg-emerald-500',
	cancelled: 'bg-rose-500',
};

const statusOptions: Array<{ value: 'all' | string; label: string }> = [
	{ value: 'all', label: 'All Status' },
	{ value: 'pending', label: 'Pending' },
	{ value: 'ongoing', label: 'Ongoing' },
	{ value: 'completed', label: 'Completed' },
	{ value: 'cancelled', label: 'Cancelled' },
];

const formatDateLong = (value: string) =>
	new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric', year: 'numeric' }).format(
		new Date(value)
	);

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
	const [patients, setPatients] = useState<PatientRecord[]>([]);
	const [staff, setStaff] = useState<StaffMember[]>([]);

	const [selectedDate, setSelectedDate] = useState<string | null>(null);
	const [modalStatus, setModalStatus] = useState<'all' | string>('all');
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
		};
	}, []);

	const patientLookup = useMemo(() => {
		const map = new Map<string, PatientRecord>();
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

	const eventsByDate = useMemo(() => {
		const map = new Map<string, CalendarEvent[]>();
		for (const event of events) {
			if (!event.dateKey) continue;
			const key = toDateKey(event.dateKey);
			if (!map.has(key)) {
				map.set(key, []);
			}
			map.get(key)!.push(event);
		}
		return map;
	}, [events]);

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

	const modalEvents = useMemo(() => {
		if (!selectedDate) return [];
		const list = eventsByDate.get(selectedDate) ?? [];
		return list.filter(event => {
			if (modalStatus !== 'all' && (event.appointment.status ?? 'pending') !== modalStatus) return false;
			return true;
		});
	}, [eventsByDate, modalStatus, selectedDate]);

	const handleToday = () => {
		const calendarApi = calendarRef.current?.getApi();
		if (calendarApi) {
			calendarApi.today();
		}
	};

	const handleDateSelect = (selectInfo: DateSelectArg) => {
		const key = toDateKey(selectInfo.startStr);
		setSelectedDate(key);
		setModalStatus('all');
		selectInfo.view.calendar.unselect();
	};

	const handleEventClick = (clickInfo: EventClickArg) => {
		clickInfo.jsEvent.preventDefault();
		const eventData = clickInfo.event.extendedProps as {
			appointment: AppointmentRecord;
			patient: PatientRecord | undefined;
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

	const closeDayModal = () => {
		setSelectedDate(null);
	};

	const openDetail = (event: CalendarEvent) => {
		setDetailEvent(event);
	};

	const closeDetail = () => {
		setDetailEvent(null);
	};

	const calendarEvents = useMemo(() => {
		return events
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
				let startDateTime: string;
				
				if (event.appointment.time) {
					let timeStr = event.appointment.time.trim();
					
					// If time doesn't have seconds, add them for ISO format
					const timeParts = timeStr.split(':');
					if (timeParts.length === 2) {
						timeStr = `${timeStr}:00`;
					} else if (timeParts.length === 1) {
						timeStr = `${timeStr}:00:00`;
					}
					
					startDateTime = `${event.appointment.date}T${timeStr}`;
				} else {
					startDateTime = event.appointment.date || '';
				}
				
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
				
				return {
					id: event.id,
					title: `${event.patient?.name || event.appointment.patient || 'Patient'}`,
					start: startDateTime,
					extendedProps: {
						appointment: event.appointment,
						patient: event.patient,
					},
					backgroundColor,
					borderColor,
					editable: true,
					startEditable: true,
					durationEditable: false,
				};
			});
	}, [events]);

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
						<div className="inline-flex h-8 w-8 items-center justify-center rounded-full border-2 border-slate-200 border-t-sky-500 animate-spin" aria-hidden="true" />
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
					<div className="[&_.fc-toolbar-title]:text-xl [&_.fc-toolbar-title]:font-bold [&_.fc-toolbar-title]:text-slate-800 [&_.fc-button]:border-slate-300 [&_.fc-button]:bg-white [&_.fc-button]:text-slate-700 [&_.fc-button]:font-medium [&_.fc-button:hover]:border-sky-400 [&_.fc-button:hover]:bg-sky-50 [&_.fc-button:hover]:text-sky-700 [&_.fc-button-active]:bg-sky-100 [&_.fc-button-active]:border-sky-400 [&_.fc-button-active]:text-sky-700 [&_.fc-button-active]:shadow-sm [&_.fc-daygrid-day-number]:text-slate-700 [&_.fc-daygrid-day-number]:font-medium [&_.fc-col-header-cell]:bg-gradient-to-b [&_.fc-col-header-cell]:from-slate-50 [&_.fc-col-header-cell]:to-slate-100 [&_.fc-col-header-cell]:text-slate-700 [&_.fc-col-header-cell]:font-semibold [&_.fc-col-header-cell]:py-3 [&_.fc-day-today]:bg-gradient-to-br [&_.fc-day-today]:from-sky-50 [&_.fc-day-today]:to-blue-50 [&_.fc-day-today]:border-2 [&_.fc-day-today]:border-sky-300 [&_.fc-timegrid-slot]:min-h-[2.5em] [&_.fc-event]:cursor-pointer [&_.fc-event]:transition-all [&_.fc-event:hover]:shadow-md [&_.fc-event:hover]:scale-[1.02] [&_.fc-event-title]:font-medium [&_.fc-event-title]:px-1">
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
							select={handleDateSelect}
							eventClick={handleEventClick}
							eventDrop={handleEventDrop}
							viewDidMount={handleViewChange}
							fixedWeekCount={false}
							height="auto"
							eventDisplay="block"
							editable={true}
							droppable={false}
							selectable={true}
							selectMirror={true}
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

			{selectedDate && (
				<div
					role="dialog"
					aria-modal="true"
					className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 backdrop-blur-sm px-4 py-6"
				>
					<div className="w-full max-w-3xl rounded-2xl border border-slate-200 bg-white shadow-2xl">
						<header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-gradient-to-r from-slate-50 to-white px-6 py-5">
							<div>
								<h2 className="text-xl font-bold text-slate-900">
									<i className="fas fa-calendar-day mr-2 text-sky-600" aria-hidden="true" />
									Appointments for {formatDateLong(selectedDate)}
								</h2>
								<p className="mt-1 text-sm text-slate-600">
									Filter by status to focus the list.
								</p>
							</div>
							<button
								type="button"
								onClick={closeDayModal}
								className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 focus-visible:bg-slate-100 focus-visible:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
								aria-label="Close dialog"
							>
								<i className="fas fa-times text-lg" aria-hidden="true" />
							</button>
						</header>
						<div className="border-b border-slate-200 bg-slate-50 px-6 py-4">
							<div className="flex flex-wrap items-center gap-3">
								<label className="text-sm font-medium text-slate-700">Filter by status:</label>
								<select
									value={modalStatus}
									onChange={event => setModalStatus(event.target.value)}
									className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:border-sky-400 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-1"
								>
									{statusOptions.map(option => (
										<option key={option.value} value={option.value}>
											{option.label}
										</option>
									))}
								</select>
							</div>
						</div>
						<div className="max-h-[420px] overflow-y-auto px-6 py-4">
							{modalEvents.length === 0 ? (
								<p className="py-10 text-center text-sm text-slate-500">
									No appointments found for the selected criteria.
								</p>
							) : (
								<ul className="space-y-3">
									{modalEvents.map(event => (
										<li
											key={`modal-${event.id}`}
											className="group flex items-start justify-between rounded-xl border border-slate-200 bg-white px-5 py-4 shadow-sm transition-all hover:border-sky-300 hover:shadow-md"
										>
											<div>
												<p className="text-sm font-semibold text-slate-800">
													{event.patient?.name || event.appointment.patient || event.appointment.patientId}
												</p>
												<p className="text-xs text-slate-500">
													{event.appointment.time || 'All-day'}
												</p>
												<p className="mt-2 text-xs text-slate-500">
													{event.patient?.complaint || 'No notes on file.'}
												</p>
											</div>
											<div className="flex flex-col items-end gap-2">
												<span
													className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold text-white ${statusColors[(event.appointment.status ?? 'pending') as string] || statusColors.pending}`}
												>
													{(event.appointment.status ?? 'pending').toUpperCase()}
												</span>
												<button
													type="button"
													onClick={() => openDetail(event)}
													className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 shadow-sm transition hover:border-sky-400 hover:bg-sky-50 hover:text-sky-700 focus-visible:border-sky-400 focus-visible:text-sky-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
												>
													<i className="fas fa-eye text-[10px]" aria-hidden="true" />
													View Details
												</button>
											</div>
										</li>
									))}
								</ul>
							)}
						</div>
					</div>
				</div>
			)}

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

