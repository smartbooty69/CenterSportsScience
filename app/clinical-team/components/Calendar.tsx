'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import type { DateSelectArg, EventClickArg, EventChangeArg, ViewApi } from '@fullcalendar/core';
import { collection, doc, onSnapshot, updateDoc, type QuerySnapshot } from 'firebase/firestore';

import { db } from '@/lib/firebase';
import PageHeader from '@/components/PageHeader';
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
	const [doctorFilter, setDoctorFilter] = useState<'all' | string>('all');
	const [currentView, setCurrentView] = useState<string>('dayGridMonth');
	const [isRescheduling, setIsRescheduling] = useState<string | null>(null);

	const [detailEvent, setDetailEvent] = useState<CalendarEvent | null>(null);
	const calendarRef = useRef<FullCalendar>(null);

	const clinicianName = useMemo(() => normalize(user?.displayName ?? ''), [user?.displayName]);

	useEffect(() => {
		const unsubscribePatients = onSnapshot(
			collection(db, 'patients'),
			(snapshot: QuerySnapshot) => {
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
				setPatients(mapped);
			},
			error => {
				console.error('Failed to load patients', error);
				setPatients([]);
			}
		);

		const unsubscribeAppointments = onSnapshot(
			collection(db, 'appointments'),
			(snapshot: QuerySnapshot) => {
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
				setAppointments(mapped);
			},
			error => {
				console.error('Failed to load appointments', error);
				setAppointments([]);
			}
		);

		const unsubscribeStaff = onSnapshot(
			collection(db, 'staff'),
			(snapshot: QuerySnapshot) => {
				const mapped = snapshot.docs.map(docSnap => {
					const data = docSnap.data() as Record<string, unknown>;
					return {
						id: docSnap.id,
						userName: data.userName ? String(data.userName) : '',
						role: data.role ? String(data.role) : '',
						status: data.status ? String(data.status) : '',
					};
				});
				setStaff(mapped);
			},
			error => {
				console.error('Failed to load staff', error);
				setStaff([]);
			}
		);

		return () => {
			unsubscribePatients();
			unsubscribeAppointments();
			unsubscribeStaff();
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

	// Get unique doctors from appointments for filter
	const doctorOptions = useMemo(() => {
		const set = new Set<string>();
		appointments.forEach(appointment => {
			if (appointment.doctor) {
				set.add(appointment.doctor);
			}
		});
		return Array.from(set).sort();
	}, [appointments]);

	// Filter appointments by doctor and clinician
	const assignedAppointments = useMemo(() => {
		let filtered = appointments;
		
		// Filter by current clinician if name is available
		if (clinicianName) {
			filtered = filtered.filter(appointment => normalize(appointment.doctor) === clinicianName);
		}
		
		// Apply doctor filter if set
		if (doctorFilter !== 'all') {
			filtered = filtered.filter(appointment => normalize(appointment.doctor) === normalize(doctorFilter));
		}
		
		return filtered;
	}, [appointments, clinicianName, doctorFilter]);

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

	const notifications = useMemo(() => {
		const now = new Date();
		const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);

		return events
			.filter(event => {
				if (!event.appointment.date) return false;
				const dateTime = event.appointment.time
					? new Date(`${event.appointment.date}T${event.appointment.time}`)
					: new Date(event.appointment.date);
				if (Number.isNaN(dateTime.getTime())) return false;
				return dateTime >= now && dateTime <= tomorrow;
			})
			.sort((a, b) => {
				const dateA = a.appointment.time
					? new Date(`${a.appointment.date}T${a.appointment.time}`)
					: new Date(a.appointment.date || '');
				const dateB = b.appointment.time
					? new Date(`${b.appointment.date}T${b.appointment.time}`)
					: new Date(b.appointment.date || '');
				return dateA.getTime() - dateB.getTime();
			});
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
		return events.map(event => {
			const startDateTime = event.appointment.time
				? `${event.appointment.date}T${event.appointment.time}`
				: event.appointment.date;
			
			return {
				id: event.id,
				title: `${event.patient?.name || event.appointment.patient || 'Patient'}`,
				start: startDateTime,
				extendedProps: {
					appointment: event.appointment,
					patient: event.patient,
				},
				backgroundColor: statusColors[(event.appointment.status ?? 'pending') as string] || statusColors.pending,
				borderColor: statusColors[(event.appointment.status ?? 'pending') as string] || statusColors.pending,
				editable: true,
				startEditable: true,
				durationEditable: false,
			};
		});
	}, [events]);

	const handleViewChange = (view: ViewApi) => {
		setCurrentView(view.type);
	};

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

	return (
		<div className="min-h-svh bg-slate-50 px-6 py-10">
			<div className="mx-auto max-w-6xl space-y-10">
				<PageHeader
					badge="Clinical Team"
					title="My Calendar & Notifications"
					description="View your scheduled appointments and upcoming notifications in the next 24 hours."
				/>

				{!clinicianName && (
					<div className="rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
						No clinician name found. Appointments are filtered by your display name.
					</div>
				)}

				<div className="border-t border-slate-200" />

				<section className="flex flex-col gap-6 lg:flex-row">
				<div className="flex-1 rounded-2xl bg-white p-6 shadow-[0_18px_40px_rgba(15,23,42,0.07)]">
					<div className="mb-4 flex flex-wrap items-center justify-between gap-3">
						<div className="flex items-center gap-3">
							<button
								type="button"
								onClick={handleToday}
								className="rounded-full border border-slate-200 px-4 py-1.5 text-sm font-medium text-slate-600 transition hover:border-slate-300 hover:text-slate-800"
							>
								Today
							</button>
							<div className="flex items-center gap-1 rounded-lg border border-slate-200 p-1">
								<button
									type="button"
									onClick={() => {
										const calendarApi = calendarRef.current?.getApi();
										if (calendarApi) {
											calendarApi.changeView('dayGridMonth');
											setCurrentView('dayGridMonth');
										}
									}}
									className={`rounded px-3 py-1 text-xs font-medium transition ${
										currentView === 'dayGridMonth'
											? 'bg-sky-100 text-sky-700'
											: 'text-slate-600 hover:bg-slate-50'
									}`}
								>
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
									className={`rounded px-3 py-1 text-xs font-medium transition ${
										currentView === 'timeGridWeek'
											? 'bg-sky-100 text-sky-700'
											: 'text-slate-600 hover:bg-slate-50'
									}`}
								>
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
									className={`rounded px-3 py-1 text-xs font-medium transition ${
										currentView === 'timeGridDay'
											? 'bg-sky-100 text-sky-700'
											: 'text-slate-600 hover:bg-slate-50'
									}`}
								>
									Day
								</button>
							</div>
						</div>
						<div className="flex items-center gap-2">
							<label htmlFor="doctor-filter" className="text-sm font-medium text-slate-700">
								Doctor:
							</label>
							<select
								id="doctor-filter"
								value={doctorFilter}
								onChange={event => setDoctorFilter(event.target.value)}
								className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700 transition focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-200"
							>
								<option value="all">All Doctors</option>
								{doctorOptions.map(doctor => (
									<option key={doctor} value={doctor}>
										{doctor}
									</option>
								))}
							</select>
						</div>
					</div>
					<div className="[&_.fc-toolbar-title]:text-lg [&_.fc-button]:border-slate-300 [&_.fc-button]:text-slate-700 [&_.fc-button:hover]:border-slate-400 [&_.fc-button:hover]:bg-slate-50 [&_.fc-button-active]:bg-sky-100 [&_.fc-button-active]:border-sky-300 [&_.fc-button-active]:text-sky-700 [&_.fc-daygrid-day-number]:text-slate-700 [&_.fc-col-header-cell]:bg-slate-50 [&_.fc-col-header-cell]:text-slate-600 [&_.fc-day-today]:bg-sky-50 [&_.fc-timegrid-slot]:min-h-[2.5em]">
						<FullCalendar
							ref={calendarRef}
							plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
							initialView="dayGridMonth"
							headerToolbar={{
								left: 'prev,next',
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
							dateClick={handleDateSelect}
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
						/>
					</div>
					{isRescheduling && (
						<div className="mt-3 rounded-md bg-amber-50 px-4 py-2 text-sm text-amber-800">
							Updating appointment...
						</div>
					)}
				</div>

				<aside className="h-fit w-full rounded-2xl bg-white p-6 shadow-[0_18px_40px_rgba(15,23,42,0.07)] lg:w-[280px]">
					<h3 className="flex items-center gap-2 text-base font-semibold text-slate-900">
						<i className="fas fa-bell text-amber-500" aria-hidden="true" />
						Upcoming (24h)
					</h3>
					<div className="mt-4 space-y-4 text-sm">
						{notifications.length === 0 ? (
							<p className="text-slate-500">No upcoming appointments in the next 24 hours.</p>
						) : (
							notifications.map(event => (
								<div key={`notification-${event.id}`} className="border-b border-slate-100 pb-3 last:border-b-0">
									<p className="font-semibold text-slate-800">
										{event.patient?.name || event.appointment.patient || event.appointment.patientId}
									</p>
									<p className="text-xs text-slate-500">
										{formatDateTime(event.appointment.date, event.appointment.time)}
									</p>
									<span
										className={`mt-2 inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold text-white ${statusColors[(event.appointment.status ?? 'pending') as string] || statusColors.pending}`}
									>
										{(event.appointment.status ?? 'pending').toUpperCase()}
									</span>
								</div>
							))
						)}
					</div>
				</aside>
			</section>

			{selectedDate && (
				<div
					role="dialog"
					aria-modal="true"
					className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 px-4 py-6"
				>
					<div className="w-full max-w-3xl rounded-2xl bg-white shadow-2xl">
						<header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-6 py-4">
							<div>
								<h2 className="text-lg font-semibold text-slate-900">
									Appointments for {formatDateLong(selectedDate)}
								</h2>
								<p className="text-sm text-slate-500">
									Filter by status to focus the list.
								</p>
							</div>
							<button
								type="button"
								onClick={closeDayModal}
								className="rounded-full p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 focus-visible:bg-slate-100 focus-visible:text-slate-600 focus-visible:outline-none"
								aria-label="Close dialog"
							>
								<i className="fas fa-times" aria-hidden="true" />
							</button>
						</header>
						<div className="border-b border-slate-200 px-6 py-4">
							<div className="flex flex-wrap items-center gap-3">
								<select
									value={modalStatus}
									onChange={event => setModalStatus(event.target.value)}
									className="w-full max-w-[160px] rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 transition focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-200"
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
											className="flex items-start justify-between rounded-xl border border-slate-200 px-4 py-3 hover:border-sky-300"
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
													className="inline-flex items-center rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600 transition hover:border-slate-300 hover:text-slate-800 focus-visible:border-slate-300 focus-visible:text-slate-800 focus-visible:outline-none"
												>
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
					className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 px-4 py-6"
				>
					<div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl">
						<header className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
							<h2 className="text-lg font-semibold text-slate-900">Appointment Details</h2>
							<button
								type="button"
								onClick={closeDetail}
								className="rounded-full p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 focus-visible:bg-slate-100 focus-visible:text-slate-600 focus-visible:outline-none"
								aria-label="Close dialog"
							>
								<i className="fas fa-times" aria-hidden="true" />
							</button>
						</header>
						<div className="space-y-3 px-6 py-6 text-sm text-slate-700">
							<p>
								<strong>Patient:</strong>{' '}
								{detailEvent.patient?.name ||
									detailEvent.appointment.patient ||
									detailEvent.appointment.patientId}
							</p>
							<p>
								<strong>Patient ID:</strong> {detailEvent.appointment.patientId || '—'}
							</p>
							<p>
								<strong>Date:</strong> {formatDateTime(detailEvent.appointment.date)}
							</p>
							<p>
								<strong>Time:</strong> {detailEvent.appointment.time || 'All-day'}
							</p>
							<p>
								<strong>Status:</strong>{' '}
								{capitalize(detailEvent.appointment.status ?? 'pending')}
							</p>
							<p>
								<strong>Complaint:</strong> {detailEvent.patient?.complaint || '—'}
							</p>
							<p>
								<strong>Notes:</strong> {detailEvent.appointment.notes || '—'}
							</p>
						</div>
						<footer className="flex items-center justify-end border-t border-slate-200 px-6 py-4">
							<button
								type="button"
								onClick={closeDetail}
								className="inline-flex items-center rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition hover:border-slate-300 hover:text-slate-800 focus-visible:border-slate-300 focus-visible:text-slate-800 focus-visible:outline-none"
							>
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

