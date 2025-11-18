'use client';

import { useEffect, useMemo, useState } from 'react';
import { collection, doc, onSnapshot, updateDoc, deleteDoc, query, where, getDocs, writeBatch, type QuerySnapshot, type Timestamp } from 'firebase/firestore';

import {
	type AdminGenderOption,
	type AdminPatientStatus,
} from '@/lib/adminMockData';
import { db } from '@/lib/firebase';
import PageHeader from '@/components/PageHeader';

type PaymentTypeOption = 'with' | 'without';
type PatientTypeOption = 'DYES' | 'VIP' | 'GETHNA' | 'PAID' | '';

interface FrontdeskPatient {
	id?: string;
	patientId: string;
	name: string;
	dob: string;
	gender: AdminGenderOption;
	phone: string;
	email?: string;
	address?: string;
	complaint?: string;
	status: AdminPatientStatus;
	registeredAt: string;
	patientType: PatientTypeOption;
	paymentType: PaymentTypeOption;
	paymentDescription?: string;
	assignedDoctor?: string;
}

const STATUS_BADGES: Record<AdminPatientStatus, string> = {
	pending: 'status-badge-pending',
	ongoing: 'status-badge-ongoing',
	completed: 'status-badge-completed',
	cancelled: 'status-badge-cancelled',
};

const STATUS_OPTIONS: Array<{ value: AdminPatientStatus; label: string }> = [
	{ value: 'pending', label: 'Pending' },
	{ value: 'ongoing', label: 'Ongoing' },
	{ value: 'completed', label: 'Completed' },
	{ value: 'cancelled', label: 'Cancelled' },
];

const STATUS_FILTER_OPTIONS: Array<{ value: 'all' | AdminPatientStatus; label: string }> = [
	{ value: 'all', label: 'All statuses' },
	...STATUS_OPTIONS,
];

const GENDER_OPTIONS: Array<{ value: AdminGenderOption; label: string }> = [
	{ value: '', label: 'Select' },
	{ value: 'Male', label: 'Male' },
	{ value: 'Female', label: 'Female' },
	{ value: 'Other', label: 'Other' },
];

const PATIENT_TYPE_OPTIONS: Array<{ value: PatientTypeOption; label: string }> = [
	{ value: 'DYES', label: 'DYES' },
	{ value: 'VIP', label: 'VIP' },
	{ value: 'PAID', label: 'PAID' },
	{ value: 'GETHNA', label: 'GETHNA' },
];

const PAYMENT_OPTIONS: Array<{ value: PaymentTypeOption; label: string }> = [
	{ value: 'with', label: 'With Concession' },
	{ value: 'without', label: 'Without Concession' },
];

const PHONE_REGEX = /^[0-9]{10,15}$/;

function formatDateLabel(value: string) {
	if (!value) return '—';
	const parsed = new Date(value);
	if (Number.isNaN(parsed.getTime())) return value;
	return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(parsed);
}

export default function Patients() {
	const [patients, setPatients] = useState<FrontdeskPatient[]>([]);
	const [loading, setLoading] = useState(true);
	const [searchTerm, setSearchTerm] = useState('');
	const [statusFilter, setStatusFilter] = useState<'all' | AdminPatientStatus>('all');
	const [editingId, setEditingId] = useState<string | null>(null);
	const [deletingId, setDeletingId] = useState<string | null>(null);
	const [isDialogOpen, setIsDialogOpen] = useState(false);
	const [formState, setFormState] = useState<Omit<FrontdeskPatient, 'id' | 'registeredAt'>>({
		patientId: '',
		name: '',
		dob: '',
		gender: '',
		phone: '',
		email: '',
		address: '',
		complaint: '',
		status: 'pending',
		patientType: '',
		paymentType: 'without',
		paymentDescription: '',
		assignedDoctor: '',
	});
	const [formErrors, setFormErrors] = useState<Partial<Record<keyof typeof formState, string>>>({});

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
						email: data.email ? String(data.email) : undefined,
						address: data.address ? String(data.address) : undefined,
						complaint: data.complaint ? String(data.complaint) : undefined,
						status: (data.status as AdminPatientStatus) ?? 'pending',
						registeredAt: created ? created.toISOString() : (data.registeredAt as string | undefined) || new Date().toISOString(),
						patientType: (data.patientType as PatientTypeOption) || '',
						paymentType: (data.paymentType as PaymentTypeOption) || 'without',
						paymentDescription: data.paymentDescription ? String(data.paymentDescription) : undefined,
						assignedDoctor: data.assignedDoctor ? String(data.assignedDoctor) : undefined,
					} as FrontdeskPatient;
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
		return patients.filter(patient => {
			const matchesSearch =
				!query ||
				(patient.name || '').toLowerCase().includes(query) ||
				(patient.patientId || '').toLowerCase().includes(query) ||
				(patient.phone || '').toLowerCase().includes(query) ||
				(patient.email || '').toLowerCase().includes(query);
			const matchesStatus = statusFilter === 'all' || patient.status === statusFilter;
			return matchesSearch && matchesStatus;
		});
	}, [patients, searchTerm, statusFilter]);

	const openDialogForEdit = (id: string) => {
		const patient = patients.find(p => p.id === id);
		if (!patient) return;
		setEditingId(id);
		setFormState({
			patientId: patient.patientId,
			name: patient.name,
			dob: patient.dob,
			gender: patient.gender,
			phone: patient.phone,
			email: patient.email || '',
			address: patient.address || '',
			complaint: patient.complaint || '',
			status: patient.status,
			patientType: patient.patientType,
			paymentType: patient.paymentType,
			paymentDescription: patient.paymentDescription || '',
			assignedDoctor: patient.assignedDoctor || '',
		});
		setFormErrors({});
		setIsDialogOpen(true);
	};

	const closeDialog = () => {
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
			patientType: '',
			paymentType: 'without',
			paymentDescription: '',
			assignedDoctor: '',
		});
		setFormErrors({});
	};

	const validateForm = () => {
		const errors: Partial<Record<keyof typeof formState, string>> = {};
		if (!formState.name.trim()) {
			errors.name = 'Please enter the patient\'s full name.';
		}
		if (!formState.dob) {
			errors.dob = 'Please provide the date of birth.';
		}
		if (!formState.gender) {
			errors.gender = 'Please select gender.';
		}
		if (!formState.phone.trim()) {
			errors.phone = 'Please enter a valid phone number (10-15 digits).';
		} else if (!PHONE_REGEX.test(formState.phone.trim())) {
			errors.phone = 'Please enter a valid phone number (10-15 digits).';
		}
		if (formState.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formState.email)) {
			errors.email = 'Please enter a valid email address.';
		}
		if (!formState.patientType) {
			errors.patientType = 'Please select Type of Organization.';
		}
		if (formState.patientType === 'PAID' && !formState.paymentType) {
			errors.paymentType = 'Please select payment type.';
		}

		setFormErrors(errors);
		return Object.keys(errors).length === 0;
	};

	const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		if (!validateForm() || !editingId) return;

		try {
			const patientData = {
				patientId: formState.patientId.trim(),
				name: formState.name.trim(),
				dob: formState.dob,
				gender: formState.gender,
				phone: formState.phone.trim(),
				email: formState.email?.trim() || null,
				address: formState.address?.trim() || null,
				complaint: formState.complaint?.trim() || null,
				status: formState.status,
				patientType: formState.patientType,
				paymentType: formState.patientType === 'PAID' ? formState.paymentType : 'without',
				paymentDescription: formState.patientType === 'PAID' ? (formState.paymentDescription?.trim() || null) : null,
				assignedDoctor: formState.assignedDoctor?.trim() || null,
			};

			await updateDoc(doc(db, 'patients', editingId), patientData);
			closeDialog();
			alert(`Patient "${formState.name.trim()}" has been updated successfully!`);
		} catch (error) {
			console.error('Failed to update patient', error);
			alert(`Failed to update patient: ${error instanceof Error ? error.message : 'Unknown error'}`);
		}
	};

	const handleDelete = async (id: string) => {
		const patient = patients.find(p => p.id === id);
		if (!patient) return;

		const confirmed = window.confirm(
			`Delete patient "${patient.name}" (ID: ${patient.patientId})? This will also delete all appointments for this patient. This action cannot be undone.`
		);
		if (!confirmed) return;

		setDeletingId(id);
		try {
			// First, delete all appointments for this patient (query by patientId)
			const appointmentsQuery = query(
				collection(db, 'appointments'),
				where('patientId', '==', patient.patientId)
			);
			const appointmentsSnapshot = await getDocs(appointmentsQuery);
			
			// Also check for appointments by patient name (fallback)
			const appointmentsByNameQuery = query(
				collection(db, 'appointments'),
				where('patient', '==', patient.name)
			);
			const appointmentsByNameSnapshot = await getDocs(appointmentsByNameQuery);
			
			// Combine and deduplicate appointment references
			const allAppointmentRefs = new Set<string>();
			appointmentsSnapshot.docs.forEach(doc => allAppointmentRefs.add(doc.id));
			appointmentsByNameSnapshot.docs.forEach(doc => allAppointmentRefs.add(doc.id));
			
			if (allAppointmentRefs.size > 0) {
				// Use batch write for better performance and atomicity
				// Firestore batch limit is 500, so we may need multiple batches
				const appointmentIds = Array.from(allAppointmentRefs);
				const batchSize = 500;
				
				for (let i = 0; i < appointmentIds.length; i += batchSize) {
					const batch = writeBatch(db);
					const batchIds = appointmentIds.slice(i, i + batchSize);
					
					batchIds.forEach(appointmentId => {
						batch.delete(doc(db, 'appointments', appointmentId));
					});
					
					await batch.commit();
				}
				
				console.log(`Deleted ${allAppointmentRefs.size} appointment(s) for patient ${patient.patientId} (${patient.name})`);
			}

			// Then delete the patient
			await deleteDoc(doc(db, 'patients', id));
			alert(`Patient "${patient.name}" and all associated appointments have been deleted successfully.`);
		} catch (error) {
			console.error('Failed to delete patient', error);
			alert(`Failed to delete patient: ${error instanceof Error ? error.message : 'Unknown error'}`);
		} finally {
			setDeletingId(null);
		}
	};

	const handleFormChange = (field: keyof typeof formState) => (
		event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
	) => {
		const value = event.target.value;
		setFormState(prev => ({
			...prev,
			[field]: value,
		}));
		setFormErrors(prev => ({
			...prev,
			[field]: undefined,
		}));
	};

	return (
		<div className="min-h-svh bg-slate-50 px-6 py-10">
			<div className="mx-auto max-w-6xl space-y-10">
				<PageHeader
					badge="Front Desk"
					title="Patient Management"
					description="View, edit, and manage patient records. Update patient information and remove records as needed."
				/>

				<div className="border-t border-slate-200" />

				<section className="card-container">
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
									placeholder="Filter by name, ID, phone, or email"
									autoComplete="off"
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
								{STATUS_FILTER_OPTIONS.map(option => (
									<option key={option.value} value={option.value}>
										{option.label}
									</option>
								))}
							</select>
						</div>
					</div>
					<div className="flex flex-col gap-3 sm:flex-row sm:items-center">
						<button type="button" onClick={() => { setSearchTerm(''); setStatusFilter('all'); }} className="btn-secondary">
							<i className="fas fa-eraser text-xs" aria-hidden="true" />
							Clear filters
						</button>
						<span className="text-xs text-slate-500">
							Showing <span className="font-semibold text-slate-700">{filteredPatients.length}</span> of{' '}
							<span className="font-semibold text-slate-700">{patients.length}</span> patients
						</span>
					</div>
				</section>

				<section className="section-card">
					<header className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
						<div>
							<h2 className="text-lg font-semibold text-slate-900">Patient List</h2>
							<p className="text-sm text-slate-500">
								{filteredPatients.length} patient{filteredPatients.length === 1 ? '' : 's'} found
							</p>
						</div>
					</header>

					{loading ? (
						<div className="empty-state-container">
							<div className="loading-spinner" aria-hidden="true" />
							<span className="ml-3 align-middle">Loading patients…</span>
						</div>
					) : filteredPatients.length === 0 ? (
						<div className="empty-state-container">
							No patients match your filters. Try adjusting your search or status filter.
						</div>
					) : (
						<div className="overflow-x-auto">
							<table className="min-w-full divide-y divide-slate-200 text-left text-sm text-slate-700">
								<thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
									<tr>
										<th className="px-4 py-3 font-semibold">Patient ID</th>
										<th className="px-4 py-3 font-semibold">Name</th>
										<th className="px-4 py-3 font-semibold">Phone</th>
										<th className="px-4 py-3 font-semibold">Email</th>
										<th className="px-4 py-3 font-semibold">Status</th>
										<th className="px-4 py-3 font-semibold">Type</th>
										<th className="px-4 py-3 font-semibold">Registered</th>
										<th className="px-4 py-3 font-semibold text-right">Actions</th>
									</tr>
								</thead>
								<tbody className="divide-y divide-slate-100">
									{filteredPatients.map(patient => (
										<tr key={patient.id}>
											<td className="px-4 py-4 text-sm font-medium text-slate-800">{patient.patientId || '—'}</td>
											<td className="px-4 py-4 text-sm text-slate-700">{patient.name || 'Unnamed'}</td>
											<td className="px-4 py-4 text-sm text-slate-600">{patient.phone || '—'}</td>
											<td className="px-4 py-4 text-sm text-slate-600">{patient.email || '—'}</td>
											<td className="px-4 py-4">
												<span
													className={`badge-base px-3 py-1 ${STATUS_BADGES[patient.status]}`}
												>
													{patient.status.charAt(0).toUpperCase() + patient.status.slice(1)}
												</span>
											</td>
											<td className="px-4 py-4 text-sm text-slate-600">{patient.patientType || '—'}</td>
											<td className="px-4 py-4 text-xs text-slate-500">{formatDateLabel(patient.registeredAt)}</td>
											<td className="px-4 py-4 text-right">
												<div className="inline-flex items-center gap-2">
													<button
														type="button"
														onClick={() => openDialogForEdit(patient.id!)}
														className="inline-flex items-center gap-1 rounded-full border border-sky-200 px-3 py-1 text-xs font-semibold text-sky-600 transition hover:border-sky-300 hover:text-sky-700 focus-visible:border-sky-300 focus-visible:text-sky-700 focus-visible:outline-none"
													>
														<i className="fas fa-edit text-[10px]" aria-hidden="true" />
														Edit
													</button>
													<button
														type="button"
														onClick={() => handleDelete(patient.id!)}
														disabled={deletingId === patient.id}
														className="inline-flex items-center gap-1 rounded-full border border-rose-200 px-3 py-1 text-xs font-semibold text-rose-600 transition hover:border-rose-300 hover:text-rose-700 focus-visible:border-rose-300 focus-visible:text-rose-700 focus-visible:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
													>
														<i className="fas fa-trash text-[10px]" aria-hidden="true" />
														{deletingId === patient.id ? 'Deleting...' : 'Delete'}
													</button>
												</div>
											</td>
										</tr>
									))}
								</tbody>
							</table>
						</div>
					)}
				</section>
			</div>

			{/* Edit Dialog */}
			{isDialogOpen && (
				<div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 px-4 py-6">
					<div className="w-full max-w-3xl rounded-2xl border border-slate-200 bg-white shadow-2xl max-h-[90vh] overflow-hidden flex flex-col">
						<header className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
							<div>
								<h2 className="text-lg font-semibold text-slate-900">Edit Patient</h2>
								<p className="text-xs text-slate-500">Update patient information</p>
							</div>
							<button
								type="button"
								onClick={closeDialog}
								className="rounded-full p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 focus-visible:bg-slate-100 focus-visible:text-slate-600 focus-visible:outline-none"
								aria-label="Close dialog"
							>
								<i className="fas fa-times" aria-hidden="true" />
							</button>
						</header>
						<form id="patient-edit-form" onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-6 py-4">
							<div className="space-y-4">
								{/* Row 1: Full Name (6 cols), DOB (3 cols), Gender (3 cols) */}
								<div className="grid gap-4 md:grid-cols-12">
									<div className="md:col-span-6">
										<label className="block text-sm font-medium text-slate-700">
											Full Name <span className="text-rose-600">*</span>
										</label>
										<input
											type="text"
											value={formState.name}
											onChange={handleFormChange('name')}
											className="input-base"
											placeholder="Patient name"
											required
										/>
										{formErrors.name && <p className="mt-1 text-xs text-rose-500">{formErrors.name}</p>}
									</div>
									<div className="md:col-span-3">
										<label className="block text-sm font-medium text-slate-700">
											Date of Birth <span className="text-rose-600">*</span>
										</label>
										<input
											type="date"
											value={formState.dob}
											onChange={handleFormChange('dob')}
											className="input-base"
											required
										/>
										{formErrors.dob && <p className="mt-1 text-xs text-rose-500">{formErrors.dob}</p>}
									</div>
									<div className="md:col-span-3">
										<label className="block text-sm font-medium text-slate-700">
											Gender <span className="text-rose-600">*</span>
										</label>
										<select
											value={formState.gender}
											onChange={handleFormChange('gender')}
											className="select-base"
											required
										>
											{GENDER_OPTIONS.map(option => (
												<option key={option.value} value={option.value}>
													{option.label}
												</option>
											))}
										</select>
										{formErrors.gender && <p className="mt-1 text-xs text-rose-500">{formErrors.gender}</p>}
									</div>
								</div>

								{/* Row 2: Phone (3 cols), Email (6 cols), Status (3 cols) */}
								<div className="grid gap-4 md:grid-cols-12">
									<div className="md:col-span-3">
										<label className="block text-sm font-medium text-slate-700">
											Phone Number <span className="text-rose-600">*</span>
										</label>
										<input
											type="tel"
											value={formState.phone}
											onChange={handleFormChange('phone')}
											className="input-base"
											placeholder="10-15 digits"
											required
										/>
										{formErrors.phone && <p className="mt-1 text-xs text-rose-500">{formErrors.phone}</p>}
									</div>
									<div className="md:col-span-6">
										<label className="block text-sm font-medium text-slate-700">Email</label>
										<input
											type="email"
											value={formState.email}
											onChange={handleFormChange('email')}
											className="input-base"
											placeholder="name@example.com"
										/>
										{formErrors.email && <p className="mt-1 text-xs text-rose-500">{formErrors.email}</p>}
									</div>
									<div className="md:col-span-3">
										<label className="block text-sm font-medium text-slate-700">Status</label>
										<select
											value={formState.status}
											onChange={handleFormChange('status')}
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

								{/* Row 3: Address */}
								<div className="grid gap-4 md:grid-cols-12">
									<div className="md:col-span-12">
										<label className="block text-sm font-medium text-slate-700">Address</label>
										<textarea
											value={formState.address}
											onChange={handleFormChange('address')}
											className="textarea-base"
											placeholder="Street, city, postal code"
											rows={2}
										/>
									</div>
								</div>

								{/* Row 4: Type of Organization */}
								<div className="grid gap-4 md:grid-cols-12">
									<div className="md:col-span-12">
										<label className="block text-sm font-medium text-slate-700">
											Type of Organization <span className="text-rose-600">*</span>
										</label>
										<div className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
											{(['DYES', 'VIP', 'GETHNA', 'PAID'] as const).map(type => (
												<label key={type} className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-3 transition hover:border-sky-300 hover:bg-sky-50 cursor-pointer">
													<input
														type="radio"
														name="patientType"
														value={type}
														checked={formState.patientType === type}
														onChange={() => {
															setFormState(prev => ({
																...prev,
																patientType: type,
																paymentType: type === 'PAID' ? prev.paymentType : 'without',
															}));
															setFormErrors(prev => ({
																...prev,
																patientType: undefined,
															}));
														}}
														className="h-4 w-4 border-slate-300 text-sky-600 focus:ring-sky-200"
													/>
													<span className="text-sm font-medium text-slate-700">{type}</span>
												</label>
											))}
										</div>
										{formErrors.patientType && <p className="mt-1 text-xs text-rose-500">{formErrors.patientType}</p>}
									</div>
								</div>

								{/* Row 5: Payment Type and Description - Only visible when patientType is 'PAID' */}
								{formState.patientType === 'PAID' && (
									<div className="grid gap-4 md:grid-cols-12">
										<div className="md:col-span-6">
											<label className="block text-sm font-medium text-slate-700">
												Type of Payment <span className="text-rose-600">*</span>
											</label>
											<select
												value={formState.paymentType}
												onChange={handleFormChange('paymentType')}
												className="select-base"
												required
											>
												{PAYMENT_OPTIONS.map(option => (
													<option key={option.value} value={option.value}>
														{option.label}
													</option>
												))}
											</select>
											{formErrors.paymentType && <p className="mt-1 text-xs text-rose-500">{formErrors.paymentType}</p>}
										</div>
										<div className="md:col-span-6">
											<label className="block text-sm font-medium text-slate-700">
												Payment Description / Concession Reason
											</label>
											<input
												type="text"
												value={formState.paymentDescription}
												onChange={handleFormChange('paymentDescription')}
												className="input-base"
												placeholder="Enter details (if any)"
											/>
										</div>
									</div>
								)}

								{/* Row 6: Complaint */}
								<div className="grid gap-4 md:grid-cols-12">
									<div className="md:col-span-12">
										<label className="block text-sm font-medium text-slate-700">Complaint</label>
										<textarea
											value={formState.complaint}
											onChange={handleFormChange('complaint')}
											className="textarea-base"
											placeholder="Patient complaint or notes"
											rows={3}
										/>
									</div>
								</div>

								{/* Row 7: Assigned Doctor */}
								<div className="grid gap-4 md:grid-cols-12">
									<div className="md:col-span-6">
										<label className="block text-sm font-medium text-slate-700">Assigned Doctor</label>
										<input
											type="text"
											value={formState.assignedDoctor}
											onChange={handleFormChange('assignedDoctor')}
											className="input-base"
											placeholder="Doctor name"
										/>
									</div>
								</div>
							</div>
						</form>
						<footer className="flex items-center justify-end gap-3 border-t border-slate-200 px-6 py-4">
							<button type="button" onClick={closeDialog} className="btn-secondary">
								Cancel
							</button>
							<button type="submit" form="patient-edit-form" className="btn-primary">
								<i className="fas fa-save text-xs" aria-hidden="true" />
								Save Changes
							</button>
						</footer>
					</div>
				</div>
			)}
		</div>
	);
}

