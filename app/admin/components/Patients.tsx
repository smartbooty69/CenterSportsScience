/* eslint-disable react-hooks/exhaustive-deps */
'use client';

import { useEffect, useMemo, useState } from 'react';
import { collection, doc, onSnapshot, addDoc, updateDoc, deleteDoc, serverTimestamp, type QuerySnapshot, type Timestamp } from 'firebase/firestore';

import {
	type AdminGenderOption,
	type AdminPatientRecord,
	type AdminPatientStatus,
} from '@/lib/adminMockData';
import { db } from '@/lib/firebase';
import PageHeader from '@/components/PageHeader';

const genderOptions: Array<{ value: AdminGenderOption; label: string }> = [
	{ value: '', label: 'Select' },
	{ value: 'Male', label: 'Male' },
	{ value: 'Female', label: 'Female' },
	{ value: 'Other', label: 'Other' },
];

const statusOptions: Array<{ value: AdminPatientStatus; label: string }> = [
	{ value: 'pending', label: 'Pending' },
	{ value: 'ongoing', label: 'Ongoing' },
	{ value: 'completed', label: 'Completed' },
	{ value: 'cancelled', label: 'Cancelled' },
];

const statusFilterOptions: Array<{ value: 'all' | AdminPatientStatus; label: string }> = [
	{ value: 'all', label: 'All statuses' },
	...statusOptions,
];


const formatDate = (iso: string) => {
	if (!iso) return '—';
	try {
		return new Intl.DateTimeFormat('en-US', {
			month: 'short',
			day: 'numeric',
			year: 'numeric',
		}).format(new Date(iso));
	} catch {
		return '—';
	}
};

const formatDateTime = (iso: string) => {
	if (!iso) return '—';
	try {
		return new Intl.DateTimeFormat('en-US', {
			month: 'short',
			day: 'numeric',
			year: 'numeric',
			hour: 'numeric',
			minute: '2-digit',
		}).format(new Date(iso));
	} catch {
		return '—';
	}
};

export default function Patients() {
	const [patients, setPatients] = useState<AdminPatientRecord[]>([]);
	const [loading, setLoading] = useState(true);
	const [searchTerm, setSearchTerm] = useState('');
	const [statusFilter, setStatusFilter] = useState<'all' | AdminPatientStatus>('all');
	const [isDialogOpen, setIsDialogOpen] = useState(false);
	const [editingId, setEditingId] = useState<string | null>(null);
	const [formState, setFormState] = useState<Omit<AdminPatientRecord, 'registeredAt'>>({
		patientId: '',
		name: '',
		dob: '',
		gender: '',
		phone: '',
		email: '',
		address: '',
		complaint: '',
		status: 'pending',
	});

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
						gender: (data.gender as AdminGenderOption) || '',
						phone: data.phone ? String(data.phone) : '',
						email: data.email ? String(data.email) : '',
						address: data.address ? String(data.address) : '',
						complaint: data.complaint ? String(data.complaint) : '',
						status: (data.status as AdminPatientStatus) ?? 'pending',
						registeredAt: created ? created.toISOString() : (data.registeredAt as string | undefined) || new Date().toISOString(),
					} as AdminPatientRecord & { id: string };
				});
				setPatients(mapped);
				setLoading(false);
			},
			error => {
				console.error('Failed to load patients', error);
				setPatients([]);
				setLoading(false);
			}
		);

		return () => unsubscribe();
	}, []);

	const filteredPatients = useMemo(() => {
		const query = searchTerm.trim().toLowerCase();
		return patients
			.map((patient, index) => ({ patient, index, id: (patient as AdminPatientRecord & { id?: string }).id || '' }))
			.filter(({ patient }) => {
				const matchesSearch =
					!query ||
					(patient.name || '').toLowerCase().includes(query) ||
					(patient.patientId || '').toLowerCase().includes(query) ||
					(patient.phone || '').toLowerCase().includes(query);
				const matchesStatus = statusFilter === 'all' || patient.status === statusFilter;
				return matchesSearch && matchesStatus;
			});
	}, [patients, searchTerm, statusFilter]);

	const openDialogForCreate = () => {
		setEditingId(null);
		setFormState({
			patientId: '',
			name: '',
			dob: '',
			gender: '',
			phone: '',
			email: '',
			address: '',
			complaint: '',
			status: 'pending',
		});
		setIsDialogOpen(true);
	};

	const openDialogForEdit = (id: string) => {
		const patient = patients.find(p => (p as AdminPatientRecord & { id?: string }).id === id);
		if (!patient) return;
		setEditingId(id);
		setFormState({
			patientId: patient.patientId,
			name: patient.name,
			dob: patient.dob,
			gender: patient.gender,
			phone: patient.phone,
			email: patient.email,
			address: patient.address,
			complaint: patient.complaint,
			status: patient.status,
		});
		setIsDialogOpen(true);
	};

	const closeDialog = () => {
		setIsDialogOpen(false);
		setEditingId(null);
	};

	const handleDelete = async (id: string) => {
		const confirmed = window.confirm('Delete this patient? This cannot be undone.');
		if (!confirmed) return;
		try {
			await deleteDoc(doc(db, 'patients', id));
		} catch (error) {
			console.error('Failed to delete patient', error);
			alert('Failed to delete patient. Please try again.');
		}
	};

	const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
		event.preventDefault();

		const trimmedId = formState.patientId.trim();
		const trimmedName = formState.name.trim();
		const trimmedPhone = formState.phone.trim();
		const trimmedEmail = formState.email.trim();

		if (!trimmedId || !trimmedName) {
			alert('Patient ID and name are required.');
			return;
		}

		// Check for duplicate patient ID
		const duplicateId = patients.some(record => {
			if (editingId && (record as AdminPatientRecord & { id?: string }).id === editingId) return false;
			return record.patientId.toLowerCase() === trimmedId.toLowerCase();
		});
		if (duplicateId) {
			alert('Another patient already uses this ID.');
			return;
		}

		try {
			const patientData = {
				patientId: trimmedId,
				name: trimmedName,
				dob: formState.dob || '',
				gender: formState.gender || '',
				phone: trimmedPhone || '',
				email: trimmedEmail || '',
				address: formState.address || '',
				complaint: formState.complaint || '',
				status: formState.status,
				registeredAt: editingId ? undefined : serverTimestamp(),
			};

			if (editingId) {
				// Update existing patient
				await updateDoc(doc(db, 'patients', editingId), patientData);
			} else {
				// Create new patient
				await addDoc(collection(db, 'patients'), patientData);
			}

			setIsDialogOpen(false);
			setEditingId(null);
			setFormState({
				patientId: '',
				name: '',
				dob: '',
				gender: '',
				phone: '',
				email: '',
				address: '',
				complaint: '',
				status: 'pending',
			});
		} catch (error) {
			console.error('Failed to save patient', error);
			alert('Failed to save patient. Please try again.');
		}
	};

	const handleExportCsv = () => {
		if (!patients.length) {
			alert('No patients found to export.');
			return;
		}

		const headers = [
			'patientId',
			'name',
			'dob',
			'gender',
			'phone',
			'email',
			'address',
			'complaint',
			'status',
			'registeredAt',
		] as const;

		const rows = patients.map(patient =>
			headers
				.map(key => {
					const value = patient[key] ?? '';
					return `"${String(value).replace(/"/g, '""')}"`;
				})
				.join(',')
		);

		const csvContent = [headers.join(','), ...rows].join('\n');
		const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
		const url = URL.createObjectURL(blob);

		const tempLink = document.createElement('a');
		tempLink.href = url;
		tempLink.setAttribute('download', `patients-${new Date().toISOString().slice(0, 10)}.csv`);
		document.body.appendChild(tempLink);
		tempLink.click();
		document.body.removeChild(tempLink);
		URL.revokeObjectURL(url);
	};

	return (
		<div className="min-h-svh bg-slate-50 px-6 py-10">
			<div className="mx-auto max-w-6xl space-y-10">
				<PageHeader
					badge="Admin"
					title="Patient Registry"
					description="Search, export, and maintain the mock patient directory used for demos and QA flows."
				/>

				<div className="border-t border-slate-200" />

				<section>
				<div className="card-container">
					<div className="flex w-full flex-col gap-3 md:flex-row md:items-end md:gap-4">
						<div className="flex-1">
							<label className="block text-sm font-medium text-slate-700">Search patients</label>
							<div className="relative mt-2">
								<i className="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-xs text-slate-400" aria-hidden="true" />
								<input
									type="search"
									value={searchTerm}
									onChange={event => setSearchTerm(event.target.value)}
									className="w-full rounded-lg border border-slate-300 pl-9 pr-3 py-2 text-sm text-slate-700 transition focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-200"
									placeholder="Filter by name, ID, or phone"
								/>
							</div>
						</div>
						<div className="w-full md:w-48">
							<label className="block text-sm font-medium text-slate-700">Status filter</label>
							<select
								value={statusFilter}
								onChange={event => setStatusFilter(event.target.value as 'all' | AdminPatientStatus)}
								className="select-base"
							>
								{statusFilterOptions.map(option => (
									<option key={option.value} value={option.value}>
										{option.label}
									</option>
								))}
							</select>
						</div>
					</div>
					<div className="flex flex-col gap-3 sm:flex-row sm:items-center">
						<button type="button" onClick={handleExportCsv} className="btn-tertiary">
							<i className="fas fa-file-export text-xs" aria-hidden="true" />
							Export CSV
						</button>
						<button
							type="button"
							onClick={openDialogForCreate}
							className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-500 focus-visible:bg-emerald-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600"
						>
							<i className="fas fa-user-plus text-xs" aria-hidden="true" />
							Add patient
						</button>
					</div>
					<div className="rounded-xl bg-sky-50 px-4 py-3 text-xs text-sky-700">
						<i className="fas fa-info-circle mr-2" aria-hidden="true" />
						Patient data is synced in real-time from Firebase. Use the export button for quick CSV snapshots.
					</div>
				</div>
			</section>

			<section className="mx-auto mt-8 max-w-6xl">
				<div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
					{loading ? (
						<div className="py-12 text-center text-sm text-slate-500">
							<div className="inline-flex h-10 w-10 items-center justify-center rounded-full border-2 border-slate-200 border-t-sky-500 animate-spin" aria-hidden="true" />
							<span className="ml-3 align-middle">Loading patients…</span>
						</div>
					) : filteredPatients.length === 0 ? (
						<div className="py-12 text-center text-sm text-slate-500">
							<p className="font-medium text-slate-700">No patients match your filters.</p>
							<p className="mt-1">Try adjusting the search or add a new profile to keep testing data fresh.</p>
						</div>
					) : (
						<div className="overflow-x-auto">
							<table className="min-w-full divide-y divide-slate-200 text-left text-sm text-slate-700">
								<thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
									<tr>
										<th className="px-4 py-3 font-semibold">#</th>
										<th className="px-4 py-3 font-semibold">Patient ID</th>
										<th className="px-4 py-3 font-semibold">Name</th>
										<th className="px-4 py-3 font-semibold">Date of birth</th>
										<th className="px-4 py-3 font-semibold">Gender</th>
										<th className="px-4 py-3 font-semibold">Phone</th>
										<th className="px-4 py-3 font-semibold">Email</th>
										<th className="px-4 py-3 font-semibold">Status</th>
										<th className="px-4 py-3 font-semibold">Registered</th>
										<th className="px-4 py-3 font-semibold text-right">Actions</th>
									</tr>
								</thead>
								<tbody className="divide-y divide-slate-100">
									{filteredPatients.map(({ patient, index, id }, row) => (
										<tr key={`${patient.patientId}-${id}`}>
											<td className="px-4 py-4 text-xs text-slate-500">{row + 1}</td>
											<td className="px-4 py-4 text-sm font-semibold text-slate-800">{patient.patientId || '—'}</td>
											<td className="px-4 py-4 text-sm text-slate-700">{patient.name || 'Unnamed patient'}</td>
											<td className="px-4 py-4 text-sm text-slate-600">{formatDate(patient.dob)}</td>
											<td className="px-4 py-4 text-sm text-slate-600">{patient.gender || '—'}</td>
											<td className="px-4 py-4 text-sm text-slate-600">{patient.phone || '—'}</td>
											<td className="px-4 py-4 text-sm text-slate-600">{patient.email || '—'}</td>
											<td className="px-4 py-4">
												<span
													className={[
														'inline-flex items-center rounded-full px-3 py-1 text-[11px] font-semibold',
														patient.status === 'completed'
															? 'bg-emerald-100 text-emerald-700'
															: patient.status === 'ongoing'
																? 'bg-sky-100 text-sky-700'
																: patient.status === 'cancelled'
																	? 'bg-rose-100 text-rose-600'
																	: 'bg-amber-100 text-amber-700',
													].join(' ')}
												>
													{patient.status.charAt(0).toUpperCase() + patient.status.slice(1)}
												</span>
											</td>
											<td className="px-4 py-4 text-xs text-slate-500">{formatDateTime(patient.registeredAt)}</td>
											<td className="px-4 py-4 text-right">
												<div className="inline-flex items-center gap-2">
													<button
														type="button"
														onClick={() => openDialogForEdit(id)}
														className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600 transition hover:border-slate-300 hover:text-slate-800 focus-visible:border-slate-300 focus-visible:text-slate-800 focus-visible:outline-none"
													>
														<i className="fas fa-pen text-[10px]" aria-hidden="true" />
														Edit
													</button>
													<button
														type="button"
														onClick={() => handleDelete(id)}
														className="inline-flex items-center gap-2 rounded-full border border-rose-200 px-3 py-1 text-xs font-semibold text-rose-600 transition hover:border-rose-300 hover:text-rose-700 focus-visible:border-rose-300 focus-visible:text-rose-700 focus-visible:outline-none"
													>
														<i className="fas fa-trash text-[10px]" aria-hidden="true" />
														Delete
													</button>
												</div>
											</td>
										</tr>
									))}
								</tbody>
							</table>
						</div>
					)}
				</div>
			</section>

			{isDialogOpen && (
				<div
					role="dialog"
					aria-modal="true"
					className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 px-4 py-6"
				>
					<div className="w-full max-w-2xl rounded-2xl border border-slate-200 bg-white shadow-2xl">
							<header className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
							<h2 className="text-lg font-semibold text-slate-900">
								{editingId !== null ? 'Edit Patient' : 'Add Patient'}
							</h2>
							<button
								type="button"
								onClick={closeDialog}
								className="rounded-full p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 focus-visible:bg-slate-100 focus-visible:text-slate-600 focus-visible:outline-none"
								aria-label="Close dialog"
							>
								<i className="fas fa-times" aria-hidden="true" />
							</button>
						</header>
						<form onSubmit={handleSubmit} className="grid gap-4 px-6 py-6 sm:grid-cols-2">
							<div>
								<label className="block text-sm font-medium text-slate-700">Patient ID *</label>
								<input
									type="text"
									value={formState.patientId}
									onChange={event =>
										setFormState(current => ({ ...current, patientId: event.target.value }))
									}
									className="input-base"
									required
								/>
							</div>
							<div>
								<label className="block text-sm font-medium text-slate-700">Full name *</label>
								<input
									type="text"
									value={formState.name}
									onChange={event =>
										setFormState(current => ({ ...current, name: event.target.value }))
									}
									className="input-base"
									required
								/>
							</div>
							<div>
								<label className="block text-sm font-medium text-slate-700">Date of birth</label>
								<input
									type="date"
									value={formState.dob}
									onChange={event =>
										setFormState(current => ({ ...current, dob: event.target.value }))
									}
									className="input-base"
								/>
							</div>
							<div>
								<label className="block text-sm font-medium text-slate-700">Gender</label>
								<select
									value={formState.gender}
									onChange={event =>
										setFormState(current => ({
											...current,
											gender: event.target.value as AdminGenderOption,
										}))
									}
									className="select-base"
								>
									{genderOptions.map(option => (
										<option key={option.value} value={option.value}>
											{option.label}
										</option>
									))}
								</select>
							</div>
							<div>
								<label className="block text-sm font-medium text-slate-700">Phone</label>
								<input
									type="tel"
									value={formState.phone}
									onChange={event =>
										setFormState(current => ({ ...current, phone: event.target.value }))
									}
									className="input-base"
								/>
							</div>
							<div>
								<label className="block text-sm font-medium text-slate-700">Email</label>
								<input
									type="email"
									value={formState.email}
									onChange={event =>
										setFormState(current => ({ ...current, email: event.target.value }))
									}
									className="input-base"
								/>
							</div>
							<div>
								<label className="block text-sm font-medium text-slate-700">Status</label>
								<select
									value={formState.status}
									onChange={event =>
										setFormState(current => ({
											...current,
											status: event.target.value as AdminPatientStatus,
										}))
									}
									className="select-base"
								>
									{statusOptions.map(option => (
										<option key={option.value} value={option.value}>
											{option.label}
										</option>
									))}
								</select>
							</div>
							<div className="sm:col-span-2">
								<label className="block text-sm font-medium text-slate-700">Address</label>
								<input
									type="text"
									value={formState.address}
									onChange={event =>
										setFormState(current => ({ ...current, address: event.target.value }))
									}
									className="input-base"
								/>
							</div>
							<div className="sm:col-span-2">
								<label className="block text-sm font-medium text-slate-700">Medical complaint</label>
								<textarea
									value={formState.complaint}
									onChange={event =>
										setFormState(current => ({ ...current, complaint: event.target.value }))
									}
									className="textarea-base min-h-[96px]"
								/>
							</div>
							<footer className="sm:col-span-2 flex items-center justify-end gap-3 pt-2">
								<button type="button" onClick={closeDialog} className="btn-secondary">
									Cancel
								</button>
								<button type="submit" className="btn-primary">
									{editingId !== null ? 'Save changes' : 'Add patient'}
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

