'use client';

import { useEffect, useMemo, useState } from 'react';
import { collection, doc, onSnapshot, updateDoc, deleteDoc, type QuerySnapshot, type Timestamp } from 'firebase/firestore';

import { db } from '@/lib/firebase';
import PageHeader from '@/components/PageHeader';
import type { AdminAppointmentStatus } from '@/lib/adminMockData';
import { sendEmailNotification } from '@/lib/email';
import { sendSMSNotification, isValidPhoneNumber } from '@/lib/sms';

type AppointmentStatusFilter = 'all' | AdminAppointmentStatus;

interface FrontdeskAppointment {
	id: string;
	appointmentId: string;
	patientId: string;
	patient: string;
	doctor: string;
	date: string;
	time: string;
	status: AdminAppointmentStatus;
	createdAt: string;
	notes?: string;
}


const STATUS_BADGES: Record<AdminAppointmentStatus, string> = {
	pending: 'bg-amber-100 text-amber-700',
	ongoing: 'bg-sky-100 text-sky-700',
	completed: 'bg-emerald-100 text-emerald-700',
	cancelled: 'bg-rose-100 text-rose-600',
};

const STATUS_OPTIONS: Array<{ value: AppointmentStatusFilter; label: string }> = [
	{ value: 'all', label: 'All appointments' },
	{ value: 'pending', label: 'Pending' },
	{ value: 'ongoing', label: 'Ongoing' },
	{ value: 'completed', label: 'Completed' },
	{ value: 'cancelled', label: 'Cancelled' },
];

interface PatientRecord {
	id: string;
	patientId: string;
	name: string;
	phone?: string;
	email?: string;
}

function formatDateLabel(value: string) {
	if (!value) return '—';
	const parsed = new Date(value);
	if (Number.isNaN(parsed.getTime())) return value;
	return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(parsed);
}

export default function Appointments() {
	const [appointments, setAppointments] = useState<FrontdeskAppointment[]>([]);
	const [patients, setPatients] = useState<PatientRecord[]>([]);
	const [loading, setLoading] = useState(true);
	const [statusFilter, setStatusFilter] = useState<AppointmentStatusFilter>('all');
	const [searchTerm, setSearchTerm] = useState('');
	const [editingId, setEditingId] = useState<string | null>(null);
	const [notesDraft, setNotesDraft] = useState('');
	const [updating, setUpdating] = useState<Record<string, boolean>>({});

	// Load appointments from Firestore
	useEffect(() => {
		const unsubscribe = onSnapshot(
			collection(db, 'appointments'),
			(snapshot: QuerySnapshot) => {
				const mapped = snapshot.docs.map(docSnap => {
					const data = docSnap.data() as Record<string, unknown>;
					const created = (data.createdAt as Timestamp | undefined)?.toDate?.();
					return {
						id: docSnap.id,
						appointmentId: data.appointmentId ? String(data.appointmentId) : '',
						patientId: data.patientId ? String(data.patientId) : '',
						patient: data.patient ? String(data.patient) : '',
						doctor: data.doctor ? String(data.doctor) : '',
						date: data.date ? String(data.date) : '',
						time: data.time ? String(data.time) : '',
						status: (data.status as AdminAppointmentStatus) ?? 'pending',
						notes: data.notes ? String(data.notes) : undefined,
						createdAt: created ? created.toISOString() : (data.createdAt as string | undefined) || new Date().toISOString(),
					} as FrontdeskAppointment;
				});
				setAppointments(mapped);
				setLoading(false);
			},
			error => {
				console.error('Failed to load appointments', error);
				setAppointments([]);
				setLoading(false);
			}
		);

		return () => unsubscribe();
	}, []);

	// Load patients from Firestore for patient details
	useEffect(() => {
		const unsubscribe = onSnapshot(
			collection(db, 'patients'),
			(snapshot: QuerySnapshot) => {
				const mapped = snapshot.docs.map(docSnap => {
					const data = docSnap.data() as Record<string, unknown>;
					return {
						id: docSnap.id,
						patientId: data.patientId ? String(data.patientId) : '',
						name: data.name ? String(data.name) : '',
						phone: data.phone ? String(data.phone) : undefined,
						email: data.email ? String(data.email) : undefined,
					} as PatientRecord;
				});
				setPatients(mapped);
			},
			error => {
				console.error('Failed to load patients', error);
				setPatients([]);
			}
		);

		return () => unsubscribe();
	}, []);

	const filtered = useMemo(() => {
		const query = searchTerm.trim().toLowerCase();
		return appointments
			.filter(appointment => {
				const matchesStatus = statusFilter === 'all' || appointment.status === statusFilter;
				const matchesQuery =
					!query ||
					appointment.patient.toLowerCase().includes(query) ||
					appointment.patientId.toLowerCase().includes(query) ||
					appointment.doctor.toLowerCase().includes(query) ||
					appointment.appointmentId.toLowerCase().includes(query);
				return matchesStatus && matchesQuery;
			})
			.sort((a, b) => {
				const aDate = new Date(`${a.date}T${a.time}`).getTime();
				const bDate = new Date(`${b.date}T${b.time}`).getTime();
				return bDate - aDate;
			});
	}, [appointments, searchTerm, statusFilter]);

	const pendingCount = appointments.filter(appointment => appointment.status === 'pending').length;
	const ongoingCount = appointments.filter(appointment => appointment.status === 'ongoing').length;
	const completedCount = appointments.filter(appointment => appointment.status === 'completed').length;

	const handleStatusChange = async (appointmentId: string, status: AdminAppointmentStatus) => {
		const appointment = appointments.find(a => a.appointmentId === appointmentId);
		if (!appointment) return;

		const oldStatus = appointment.status;
		const patientDetails = patients.find(p => p.patientId === appointment.patientId);

		setUpdating(prev => ({ ...prev, [appointment.id]: true }));
		try {
			const appointmentRef = doc(db, 'appointments', appointment.id);
			await updateDoc(appointmentRef, {
				status,
			});

			// Send email notification if status changed and patient has email
			if (oldStatus !== status && patientDetails?.email) {
				try {
					const template = status === 'cancelled' ? 'appointment-cancelled' : 'appointment-status-changed';
					await sendEmailNotification({
						to: patientDetails.email,
						subject: status === 'cancelled' 
							? `Appointment Cancelled - ${appointment.date}`
							: `Appointment Status Update - ${status}`,
						template,
						data: {
							patientName: appointment.patient,
							patientEmail: patientDetails.email,
							patientId: appointment.patientId,
							doctor: appointment.doctor,
							date: appointment.date,
							time: appointment.time,
							appointmentId: appointment.appointmentId,
							status: status.charAt(0).toUpperCase() + status.slice(1),
						},
					});
				} catch (emailError) {
					// Log error but don't fail status update
					console.error('Failed to send status change email:', emailError);
				}
			}

			// Send SMS notification if status changed and patient has valid phone
			if (oldStatus !== status && patientDetails?.phone && isValidPhoneNumber(patientDetails.phone)) {
				try {
					if (status === 'cancelled') {
						// Send cancellation SMS
						await sendSMSNotification({
							to: patientDetails.phone,
							template: 'appointment-cancelled',
							data: {
								patientName: appointment.patient,
								patientPhone: patientDetails.phone,
								patientId: appointment.patientId,
								doctor: appointment.doctor,
								date: appointment.date,
								time: appointment.time,
								appointmentId: appointment.appointmentId,
							},
						});
					}
					// Note: We don't have an SMS template for other status changes (ongoing, completed)
					// Only sending SMS for cancellations as per available templates
				} catch (smsError) {
					// Log error but don't fail status update
					console.error('Failed to send status change SMS:', smsError);
				}
			}
		} catch (error) {
			console.error('Failed to update appointment status', error);
			alert(`Failed to update appointment status: ${error instanceof Error ? error.message : 'Unknown error'}`);
		} finally {
			setUpdating(prev => ({ ...prev, [appointment.id]: false }));
		}
	};

	const handleRemove = async (appointmentId: string) => {
		if (!window.confirm('Delete this appointment? This action cannot be undone.')) return;

		const appointment = appointments.find(a => a.appointmentId === appointmentId);
		if (!appointment) return;

		setUpdating(prev => ({ ...prev, [appointment.id]: true }));
		try {
			const appointmentRef = doc(db, 'appointments', appointment.id);
			await deleteDoc(appointmentRef);
		} catch (error) {
			console.error('Failed to delete appointment', error);
			alert(`Failed to delete appointment: ${error instanceof Error ? error.message : 'Unknown error'}`);
		} finally {
			setUpdating(prev => ({ ...prev, [appointment.id]: false }));
		}
	};

	const handleEditNotes = (appointment: FrontdeskAppointment) => {
		setEditingId(appointment.appointmentId);
		setNotesDraft(appointment.notes ?? '');
	};

	const handleSaveNotes = async () => {
		if (!editingId) return;

		const appointment = appointments.find(a => a.appointmentId === editingId);
		if (!appointment) return;

		setUpdating(prev => ({ ...prev, [appointment.id]: true }));
		try {
			const appointmentRef = doc(db, 'appointments', appointment.id);
			await updateDoc(appointmentRef, {
				notes: notesDraft.trim() || null,
			});
			setEditingId(null);
			setNotesDraft('');
		} catch (error) {
			console.error('Failed to update appointment notes', error);
			alert(`Failed to update notes: ${error instanceof Error ? error.message : 'Unknown error'}`);
		} finally {
			setUpdating(prev => ({ ...prev, [appointment.id]: false }));
		}
	};

	const handleCancelEditing = () => {
		setEditingId(null);
		setNotesDraft('');
	};

	return (
		<div className="min-h-svh bg-slate-50 px-6 py-10">
			<div className="mx-auto max-w-6xl space-y-10">
				<PageHeader
					badge="Front Desk"
					title="Appointments"
					description="Review scheduled visits, update statuses in real time, and manage front desk hand-offs with the same layout used in the legacy Super Admin console."
				/>

				<div className="border-t border-slate-200" />

				<section className="card-container">
				<div className="flex w-full flex-col gap-3 md:flex-row md:items-end md:gap-4">
					<div className="flex-1">
						<label className="block text-sm font-medium text-slate-700">Search appointments</label>
						<div className="relative mt-2">
							<i className="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-xs text-slate-400" aria-hidden="true" />
							<input
								type="search"
								value={searchTerm}
								onChange={event => setSearchTerm(event.target.value)}
								className="w-full rounded-lg border border-slate-300 pl-9 pr-3 py-2 text-sm text-slate-700 transition focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-200"
								placeholder="Filter by patient, ID, doctor, or appointment ID"
								autoComplete="off"
							/>
						</div>
					</div>
					<div className="w-full md:w-48">
						<label className="block text-sm font-medium text-slate-700">Status filter</label>
						<select
							value={statusFilter}
							onChange={event => setStatusFilter(event.target.value as AppointmentStatusFilter)}
							className="select-base"
						>
							{STATUS_OPTIONS.map(option => (
								<option key={option.value} value={option.value}>
									{option.label}
								</option>
							))}
						</select>
					</div>
				</div>
				<div className="flex flex-col gap-3 sm:flex-row sm:items-center">
					<button type="button" onClick={() => setSearchTerm('')} className="btn-secondary">
						<i className="fas fa-eraser text-xs" aria-hidden="true" />
						Clear filters
					</button>
					<span className="text-xs text-slate-500">
						Pending: <span className="font-semibold text-slate-700">{pendingCount}</span> · Ongoing:{' '}
						<span className="font-semibold text-slate-700">{ongoingCount}</span> · Completed:{' '}
						<span className="font-semibold text-slate-700">{completedCount}</span>
					</span>
				</div>
			</section>

				<section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
					<header className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
						<div>
							<h2 className="text-lg font-semibold text-slate-900">Appointment queue</h2>
							<p className="text-sm text-slate-500">
								{filtered.length} appointment{filtered.length === 1 ? '' : 's'} scheduled
							</p>
						</div>
					</header>

					{loading ? (
						<div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
							<div className="inline-flex h-8 w-8 items-center justify-center rounded-full border-2 border-slate-200 border-t-sky-500 animate-spin" aria-hidden="true" />
							<span className="ml-3 align-middle">Loading appointments…</span>
						</div>
					) : filtered.length === 0 ? (
						<div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
							No appointments match your filters. Try another search or create a booking from the register page.
						</div>
					) : (
						<div className="overflow-x-auto">
							<table className="min-w-full divide-y divide-slate-200 text-left text-sm text-slate-700">
								<thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
									<tr>
										<th className="px-4 py-3 font-semibold">Appointment</th>
										<th className="px-4 py-3 font-semibold">Patient</th>
										<th className="px-4 py-3 font-semibold">Clinician</th>
										<th className="px-4 py-3 font-semibold">When</th>
										<th className="px-4 py-3 font-semibold">Status</th>
										<th className="px-4 py-3 font-semibold">Notes</th>
										<th className="px-4 py-3 font-semibold text-right">Actions</th>
									</tr>
								</thead>
								<tbody className="divide-y divide-slate-100">
									{filtered.map(appointment => {
										const patientDetails = patients.find(p => p.patientId === appointment.patientId);
										const isEditing = editingId === appointment.appointmentId;
										const isUpdating = updating[appointment.id] || false;

										return (
											<tr key={appointment.appointmentId}>
												<td className="px-4 py-4">
													<p className="font-semibold text-slate-900">{appointment.appointmentId}</p>
													<p className="text-xs text-slate-500">
														Booked {formatDateLabel(appointment.createdAt)}
													</p>
												</td>
												<td className="px-4 py-4">
													<p className="text-sm font-medium text-slate-800">{appointment.patient}</p>
													<p className="text-xs text-slate-500">
														<span className="font-semibold text-slate-600">ID:</span> {appointment.patientId}
													</p>
													<p className="text-xs text-slate-500">
														{patientDetails?.phone ? `Phone: ${patientDetails.phone}` : 'Phone not provided'}
													</p>
												</td>
												<td className="px-4 py-4 text-sm text-slate-600">{appointment.doctor || 'Not assigned'}</td>
												<td className="px-4 py-4 text-sm text-slate-600">
													{formatDateLabel(appointment.date)} at {appointment.time || '—'}
												</td>
												<td className="px-4 py-4">
													<select
														value={appointment.status}
														onChange={event =>
															handleStatusChange(
																appointment.appointmentId,
																event.target.value as AdminAppointmentStatus,
															)
														}
														disabled={isUpdating}
														className="select-base"
													>
														<option value="pending">Pending</option>
														<option value="ongoing">Ongoing</option>
														<option value="completed">Completed</option>
														<option value="cancelled">Cancelled</option>
													</select>
												</td>
												<td className="px-4 py-4">
													{isEditing ? (
														<div className="space-y-2">
															<textarea
																value={notesDraft}
																onChange={event => setNotesDraft(event.target.value)}
																className="input-base"
																rows={2}
															/>
															<div className="flex items-center gap-2">
																<button
																	type="button"
																	onClick={handleSaveNotes}
																	disabled={isUpdating}
																	className="btn-primary"
																>
																	{isUpdating ? 'Saving...' : 'Save'}
																</button>
																<button
																	type="button"
																	onClick={handleCancelEditing}
																	disabled={isUpdating}
																	className="btn-secondary"
																>
																	Cancel
																</button>
															</div>
														</div>
													) : (
														<div className="space-y-2">
															<p className="text-sm text-slate-600">{appointment.notes || 'No notes added.'}</p>
															<button
																type="button"
																onClick={() => handleEditNotes(appointment)}
																className="text-xs font-semibold text-sky-600 hover:text-sky-500"
															>
																Edit notes
															</button>
														</div>
													)}
												</td>
												<td className="px-4 py-4 text-right">
													<div className="inline-flex items-center gap-2">
														<span
															className={`inline-flex items-center rounded-full px-3 py-1 text-[11px] font-semibold ${STATUS_BADGES[appointment.status]}`}
														>
															{appointment.status.charAt(0).toUpperCase() + appointment.status.slice(1)}
														</span>
														<button
															type="button"
															onClick={() => handleRemove(appointment.appointmentId)}
															disabled={isUpdating}
															className="inline-flex items-center gap-1 rounded-full border border-rose-200 px-3 py-1 text-xs font-semibold text-rose-600 transition hover:border-rose-300 hover:text-rose-700 focus-visible:border-rose-300 focus-visible:text-rose-700 focus-visible:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
														>
															<i className="fas fa-trash text-[10px]" aria-hidden="true" />
															Delete
														</button>
													</div>
												</td>
											</tr>
										);
									})}
								</tbody>
							</table>
						</div>
					)}
				</section>
			</div>
		</div>
	);
}

