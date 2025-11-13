'use client';

import { useEffect, useMemo, useState } from 'react';
import { collection, doc, onSnapshot, updateDoc, type QuerySnapshot, type Timestamp } from 'firebase/firestore';

import {
	type AdminAppointmentRecord,
	type AdminAppointmentStatus,
	type AdminPatientRecord,
} from '@/lib/adminMockData';
import { db } from '@/lib/firebase';
import PageHeader from '@/components/PageHeader';
import { sendEmailNotification } from '@/lib/email';
import { sendSMSNotification, isValidPhoneNumber } from '@/lib/sms';

const statusLabels: Record<AdminAppointmentStatus, string> = {
	pending: 'Pending',
	ongoing: 'Ongoing',
	completed: 'Completed',
	cancelled: 'Cancelled',
};

const statusChipClasses: Record<AdminAppointmentStatus, string> = {
	pending: 'bg-amber-100 text-amber-700',
	ongoing: 'bg-sky-100 text-sky-700',
	completed: 'bg-emerald-100 text-emerald-700',
	cancelled: 'bg-rose-100 text-rose-600',
};

interface StaffMember {
	id: string;
	userName: string;
	role: string;
	status: string;
}

type FirestoreAppointmentRecord = AdminAppointmentRecord & {
	id: string;
	appointmentId?: string;
	notes?: string;
	createdAt?: string;
};

export default function Appointments() {
	const [appointments, setAppointments] = useState<FirestoreAppointmentRecord[]>([]);
	const [patients, setPatients] = useState<(AdminPatientRecord & { id?: string })[]>([]);
	const [staff, setStaff] = useState<StaffMember[]>([]);

	const [isDialogOpen, setIsDialogOpen] = useState(false);
	const [editingId, setEditingId] = useState<string | null>(null);
	const [formData, setFormData] = useState({
		doctor: '',
		date: '',
		time: '',
		status: 'pending' as AdminAppointmentStatus,
		notes: '',
	});

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
						billing: data.billing ? (data.billing as { amount?: string; date?: string }) : undefined,
						createdAt: created ? created.toISOString() : (data.createdAt as string | undefined) || new Date().toISOString(),
					} as FirestoreAppointmentRecord;
				});
				setAppointments(mapped);
			},
			error => {
				console.error('Failed to load appointments', error);
				setAppointments([]);
			}
		);

		return () => unsubscribe();
	}, []);

	// Load patients from Firestore
	useEffect(() => {
		const unsubscribe = onSnapshot(
			collection(db, 'patients'),
			(snapshot: QuerySnapshot) => {
				const mapped = snapshot.docs.map(docSnap => {
					const data = docSnap.data() as Record<string, unknown>;
					const created = (data.registeredAt as Timestamp | undefined)?.toDate?.();
					return {
						id: docSnap.id,
						patientId: data.patientId ? String(data.patientId) : '',
						name: data.name ? String(data.name) : '',
						dob: data.dob ? String(data.dob) : '',
						gender: data.gender ? String(data.gender) : '',
						phone: data.phone ? String(data.phone) : '',
						email: data.email ? String(data.email) : '',
						address: data.address ? String(data.address) : '',
						complaint: data.complaint ? String(data.complaint) : '',
						status: (data.status as string) ?? 'pending',
						registeredAt: created ? created.toISOString() : (data.registeredAt as string | undefined) || new Date().toISOString(),
					} as AdminPatientRecord & { id: string };
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

	// Load staff from Firestore
	useEffect(() => {
		const unsubscribe = onSnapshot(
			collection(db, 'staff'),
			(snapshot: QuerySnapshot) => {
				const mapped = snapshot.docs.map(docSnap => {
					const data = docSnap.data() as Record<string, unknown>;
					return {
						id: docSnap.id,
						userName: data.userName ? String(data.userName) : '',
						role: data.role ? String(data.role) : '',
						status: data.status ? String(data.status) : '',
					} as StaffMember;
				});
				setStaff(mapped);
			},
			error => {
				console.error('Failed to load staff', error);
				setStaff([]);
			}
		);

		return () => unsubscribe();
	}, []);

	const patientLookup = useMemo(() => {
		const map = new Map<string, AdminPatientRecord>();
		for (const patient of patients) {
			map.set(patient.patientId, patient);
		}
		return map;
	}, [patients]);

	const doctorOptions = useMemo(() => {
		return staff
			.filter(member => member.role === 'ClinicalTeam' && member.status !== 'Inactive')
			.map(member => member.userName)
			.filter(Boolean)
			.sort((a, b) => a.localeCompare(b));
	}, [staff]);

	const openDialog = (id: string) => {
		const appointment = appointments.find(a => a.id === id);
		if (!appointment) return;
		setEditingId(id);
		setFormData({
			doctor: appointment.doctor ?? '',
			date: appointment.date ?? '',
			time: appointment.time ?? '',
			status: appointment.status ?? 'pending',
			notes: (appointment as AdminAppointmentRecord & { notes?: string }).notes ?? '',
		});
		setIsDialogOpen(true);
	};

	const closeDialog = () => {
		setIsDialogOpen(false);
		setEditingId(null);
		setFormData({
			doctor: '',
			date: '',
			time: '',
			status: 'pending',
			notes: '',
		});
	};

	const handleSave = async (event: React.FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		if (editingId === null) return;

		// Validation
		if (!formData.date) {
			alert('Please select a date.');
			return;
		}
		if (!formData.time) {
			alert('Please select a time.');
			return;
		}

		try {
			const appointment = appointments.find(a => a.id === editingId);
			if (!appointment) {
				console.error(`Appointment with id ${editingId} not found in local state.`);
				alert('Unable to locate the selected appointment. Please refresh and try again.');
				return;
			}

			const oldAppointment = { ...appointment };
			const patient = appointment.patientId ? patientLookup.get(appointment.patientId) : undefined;

			const updateData: Record<string, unknown> = {
				doctor: formData.doctor || null,
				date: formData.date,
				time: formData.time,
				status: formData.status,
				notes: formData.notes.trim() || null,
			};

			await updateDoc(doc(db, 'appointments', editingId), updateData);

			// Send email notification if patient has email and details changed
			if (patient?.email && oldAppointment) {
				const dateChanged = oldAppointment.date !== formData.date;
				const timeChanged = oldAppointment.time !== formData.time;
				const statusChanged = oldAppointment.status !== formData.status;
				const doctorChanged = oldAppointment.doctor !== formData.doctor;

				if (dateChanged || timeChanged || doctorChanged) {
					// Appointment details updated
					try {
						await sendEmailNotification({
							to: patient.email,
							subject: `Appointment Updated - ${formData.date} at ${formData.time}`,
							template: 'appointment-updated',
							data: {
								patientName: appointment.patient || patient.name,
								patientEmail: patient.email,
								patientId: appointment.patientId,
								doctor: formData.doctor,
								date: formData.date,
								time: formData.time,
								appointmentId: appointment.appointmentId,
								notes: formData.notes.trim() || undefined,
							},
						});
					} catch (emailError) {
						console.error('Failed to send appointment update email:', emailError);
					}
				} else if (statusChanged) {
					// Only status changed
					const template = formData.status === 'cancelled' ? 'appointment-cancelled' : 'appointment-status-changed';
					try {
						await sendEmailNotification({
							to: patient.email,
							subject: formData.status === 'cancelled'
								? `Appointment Cancelled - ${formData.date}`
								: `Appointment Status Update - ${formData.status}`,
							template,
							data: {
								patientName: appointment.patient || patient.name,
								patientEmail: patient.email,
								patientId: appointment.patientId,
								doctor: formData.doctor || appointment.doctor,
								date: formData.date,
								time: formData.time,
								appointmentId: appointment.appointmentId,
								status: formData.status.charAt(0).toUpperCase() + formData.status.slice(1),
							},
						});
					} catch (emailError) {
						console.error('Failed to send status change email:', emailError);
					}
				}
			}

			// Send SMS notification if patient has valid phone and details changed
			if (patient?.phone && isValidPhoneNumber(patient.phone) && oldAppointment) {
				const dateChanged = oldAppointment.date !== formData.date;
				const timeChanged = oldAppointment.time !== formData.time;
				const statusChanged = oldAppointment.status !== formData.status;
				const doctorChanged = oldAppointment.doctor !== formData.doctor;

				try {
					if (dateChanged || timeChanged || doctorChanged) {
						// Appointment details updated - send update SMS
						await sendSMSNotification({
							to: patient.phone,
							template: 'appointment-updated',
							data: {
								patientName: appointment.patient || patient.name,
								patientPhone: patient.phone,
								patientId: appointment.patientId,
								doctor: formData.doctor,
								date: formData.date,
								time: formData.time,
								appointmentId: appointment.appointmentId,
							},
						});
					} else if (statusChanged && formData.status === 'cancelled') {
						// Appointment cancelled - send cancellation SMS
						await sendSMSNotification({
							to: patient.phone,
							template: 'appointment-cancelled',
							data: {
								patientName: appointment.patient || patient.name,
								patientPhone: patient.phone,
								patientId: appointment.patientId,
								doctor: formData.doctor || appointment.doctor,
								date: formData.date,
								time: formData.time,
								appointmentId: appointment.appointmentId,
							},
						});
					}
				} catch (smsError) {
					// Log error but don't fail appointment update
					console.error('Failed to send appointment update SMS:', smsError);
				}
			}

			closeDialog();
		} catch (error) {
			console.error('Failed to update appointment', error);
			alert('Failed to update appointment. Please try again.');
		}
	};

	return (
		<div className="min-h-svh bg-slate-50 px-6 py-10">
			<div className="mx-auto max-w-6xl space-y-10">
				<PageHeader
					badge="Admin"
					title="Appointments"
					description="Monitor upcoming visits and assign clinical team members to each patient."
				/>

				<div className="border-t border-slate-200" />

				<section className="rounded-2xl bg-white p-6 shadow-[0_18px_40px_rgba(15,23,42,0.07)]">
				<div className="overflow-x-auto">
					<table className="min-w-full divide-y divide-slate-200 text-left text-sm text-slate-700">
						<thead className="bg-sky-50 text-xs uppercase tracking-wide text-sky-700">
							<tr>
								<th className="px-4 py-3 font-semibold">#</th>
								<th className="px-4 py-3 font-semibold">Patient</th>
								<th className="px-4 py-3 font-semibold">Patient ID</th>
								<th className="px-4 py-3 font-semibold">Clinician</th>
								<th className="px-4 py-3 font-semibold">Date</th>
								<th className="px-4 py-3 font-semibold">Time</th>
								<th className="px-4 py-3 font-semibold">Status</th>
								<th className="px-4 py-3 font-semibold text-right">Action</th>
							</tr>
						</thead>
						<tbody className="divide-y divide-slate-100">
							{appointments.length === 0 ? (
								<tr>
									<td colSpan={8} className="px-4 py-8 text-center text-sm text-slate-500">
										No appointments found.
									</td>
								</tr>
							) : (
								appointments.map((appointment, index) => {
									const patient = appointment.patientId
										? patientLookup.get(appointment.patientId)
										: undefined;
									const patientName = appointment.patient || patient?.name || appointment.patientId || 'N/A';
									return (
										<tr key={appointment.id}>
											<td className="px-4 py-4 text-sm text-slate-500">{index + 1}</td>
											<td className="px-4 py-4 font-medium text-slate-800">{patientName}</td>
											<td className="px-4 py-4 text-slate-600">{appointment.patientId || '—'}</td>
											<td className="px-4 py-4 text-slate-600">
												{appointment.doctor ? (
													<span className="inline-flex items-center rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-700">
														<i className="fas fa-user-md mr-1 text-[11px]" aria-hidden="true" />
														{appointment.doctor}
													</span>
												) : (
													<span className="text-sm text-slate-400">Unassigned</span>
												)}
											</td>
											<td className="px-4 py-4 text-slate-600">{appointment.date}</td>
											<td className="px-4 py-4 text-slate-600">{appointment.time}</td>
											<td className="px-4 py-4">
												<span
													className={[
														'inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold',
														statusChipClasses[appointment.status],
													].join(' ')}
												>
													{statusLabels[appointment.status]}
												</span>
											</td>
											<td className="px-4 py-4 text-right text-sm">
												<button
													type="button"
													onClick={() => openDialog(appointment.id)}
													className="inline-flex items-center rounded-full border border-sky-200 px-3 py-1 text-xs font-semibold text-sky-700 transition hover:border-sky-400 hover:text-sky-800 focus-visible:border-sky-400 focus-visible:text-sky-800 focus-visible:outline-none"
												>
													<i className="fas fa-pen mr-1 text-[11px]" aria-hidden="true" />
													Edit
												</button>
											</td>
										</tr>
									);
								})
							)}
						</tbody>
					</table>
				</div>
			</section>

			{isDialogOpen && editingId !== null && (
				<div
					role="dialog"
					aria-modal="true"
					className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 px-4 py-6"
				>
					<div className="w-full max-w-2xl rounded-2xl bg-white shadow-2xl">
						<header className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
							<h2 className="text-lg font-semibold text-slate-900">Edit Appointment</h2>
							<button
								type="button"
								onClick={closeDialog}
								className="rounded-full p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 focus-visible:bg-slate-100 focus-visible:text-slate-600 focus-visible:outline-none"
								aria-label="Close dialog"
							>
								<i className="fas fa-times" aria-hidden="true" />
							</button>
						</header>
						<form onSubmit={handleSave} className="space-y-5 px-6 py-6">
							<div>
								<label className="block text-sm font-medium text-slate-700">Patient</label>
								<div className="mt-1 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
									{(() => {
										const appointment = appointments.find(a => a.id === editingId);
										if (!appointment) return 'N/A';
										const patient = appointment.patientId ? patientLookup.get(appointment.patientId) : undefined;
										return appointment.patient || (patient ? patient.name : undefined) || appointment.patientId || 'N/A';
									})()}
								</div>
							</div>

							<div className="grid grid-cols-2 gap-4">
								<div>
									<label className="block text-sm font-medium text-slate-700">
										Date <span className="text-rose-500">*</span>
									</label>
									<input
										type="date"
										value={formData.date}
										onChange={event => setFormData(prev => ({ ...prev, date: event.target.value }))}
										className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-800 transition focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-200"
										required
									/>
								</div>
								<div>
									<label className="block text-sm font-medium text-slate-700">
										Time <span className="text-rose-500">*</span>
									</label>
									<input
										type="time"
										value={formData.time}
										onChange={event => setFormData(prev => ({ ...prev, time: event.target.value }))}
										className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-800 transition focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-200"
										required
									/>
								</div>
							</div>

							<div className="grid grid-cols-2 gap-4">
								<div>
									<label className="block text-sm font-medium text-slate-700">
										Clinician
									</label>
									<select
										value={formData.doctor}
										onChange={event => setFormData(prev => ({ ...prev, doctor: event.target.value }))}
										className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-800 transition focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-200"
									>
										<option value="">— Unassigned —</option>
										{doctorOptions.length === 0 ? (
											<option value="" disabled>
												No clinical team members available
											</option>
										) : (
											doctorOptions.map(option => (
												<option key={option} value={option}>
													{option}
												</option>
											))
										)}
									</select>
								</div>
								<div>
									<label className="block text-sm font-medium text-slate-700">
										Status <span className="text-rose-500">*</span>
									</label>
									<select
										value={formData.status}
										onChange={event => setFormData(prev => ({ ...prev, status: event.target.value as AdminAppointmentStatus }))}
										className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-800 transition focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-200"
										required
									>
										<option value="pending">Pending</option>
										<option value="ongoing">Ongoing</option>
										<option value="completed">Completed</option>
										<option value="cancelled">Cancelled</option>
									</select>
								</div>
							</div>

							<div>
								<label className="block text-sm font-medium text-slate-700">Notes</label>
								<textarea
									value={formData.notes}
									onChange={event => setFormData(prev => ({ ...prev, notes: event.target.value }))}
									rows={4}
									className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-800 transition focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-200"
									placeholder="Add appointment notes or special instructions..."
								/>
							</div>

							<footer className="flex items-center justify-end gap-3 pt-2">
								<button
									type="button"
									onClick={closeDialog}
									className="inline-flex items-center rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition hover:border-slate-300 hover:text-slate-800 focus-visible:border-slate-300 focus-visible:text-slate-800 focus-visible:outline-none"
								>
									Cancel
								</button>
								<button
									type="submit"
									className="inline-flex items-center rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sky-500 focus-visible:bg-sky-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600"
								>
									<i className="fas fa-save mr-2 text-xs" aria-hidden="true" />
									Save Changes
								</button>
							</footer>
						</form>
					</div>
				</div>
			)}
			</div>
		</div>
	);
}


