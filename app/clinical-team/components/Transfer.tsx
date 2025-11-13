'use client';

import { useEffect, useMemo, useState } from 'react';
import { collection, doc, onSnapshot, updateDoc, serverTimestamp, type QuerySnapshot, type Timestamp } from 'firebase/firestore';

import { db } from '@/lib/firebase';
import PageHeader from '@/components/PageHeader';
import type { AdminPatientStatus } from '@/lib/adminMockData';

interface PatientRecord {
	id: string;
	patientId: string;
	name: string;
	assignedDoctor?: string;
	status: AdminPatientStatus;
}

interface Therapist {
	id: string;
	name: string;
	role: string;
}


const STATUS_BADGES: Record<AdminPatientStatus, string> = {
	pending: 'bg-amber-100 text-amber-700 ring-1 ring-amber-200',
	ongoing: 'bg-sky-100 text-sky-700 ring-1 ring-sky-200',
	completed: 'bg-emerald-100 text-emerald-700 ring-1 ring-emerald-200',
	cancelled: 'bg-rose-100 text-rose-600 ring-1 ring-rose-200',
};

export default function Transfer() {
	const [patients, setPatients] = useState<PatientRecord[]>([]);
	const [therapists, setTherapists] = useState<Therapist[]>([]);
	const [loading, setLoading] = useState(true);
	const [searchTerm, setSearchTerm] = useState('');
	const [statusFilter, setStatusFilter] = useState<AdminPatientStatus | 'all'>('all');
	const [therapistFilter, setTherapistFilter] = useState<string>('all');
	const [transferring, setTransferring] = useState<Record<string, boolean>>({});
	const [successMessage, setSuccessMessage] = useState<string | null>(null);
	const [selectedTherapists, setSelectedTherapists] = useState<Record<string, string>>({});

	// Load patients from Firestore
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
						assignedDoctor: data.assignedDoctor ? String(data.assignedDoctor) : undefined,
						status: (data.status as AdminPatientStatus) ?? 'pending',
					} as PatientRecord;
				});
				setPatients(mapped);
				
				// Initialize selected therapists with current assignments
				const initialSelections: Record<string, string> = {};
				mapped.forEach(patient => {
					if (patient.assignedDoctor) {
						initialSelections[patient.id] = patient.assignedDoctor;
					}
				});
				setSelectedTherapists(prev => ({ ...prev, ...initialSelections }));
				
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

	// Load therapists from staff collection
	useEffect(() => {
		const unsubscribe = onSnapshot(
			collection(db, 'staff'),
			(snapshot: QuerySnapshot) => {
				const mapped = snapshot.docs
					.map(docSnap => {
						const data = docSnap.data();
						return {
							id: docSnap.id,
							name: data.userName as string,
							role: data.role as string,
							status: data.status as string,
						};
					})
					.filter(
						staff =>
							['Physiotherapist', 'StrengthAndConditioning', 'ClinicalTeam'].includes(staff.role || '') &&
							staff.status === 'Active' &&
							Boolean(staff.name)
					)
					.map(staff => ({
						id: staff.id,
						name: staff.name,
						role: staff.role,
					}));

				setTherapists(mapped);
			},
			error => {
				console.error('Failed to load staff', error);
				setTherapists([]);
			}
		);

		return () => unsubscribe();
	}, []);

	const filteredPatients = useMemo(() => {
		const query = searchTerm.trim().toLowerCase();
		return patients.filter(patient => {
			const matchesSearch =
				!query ||
				patient.name.toLowerCase().includes(query) ||
				patient.patientId.toLowerCase().includes(query);
			const matchesStatus = statusFilter === 'all' || patient.status === statusFilter;
			const matchesTherapist =
				therapistFilter === 'all' ||
				(therapistFilter === 'unassigned' && !patient.assignedDoctor) ||
				patient.assignedDoctor === therapistFilter;

			return matchesSearch && matchesStatus && matchesTherapist;
		});
	}, [patients, searchTerm, statusFilter, therapistFilter]);

	const handleTransfer = async (patient: PatientRecord, newTherapistName: string) => {
		if (!newTherapistName || newTherapistName === patient.assignedDoctor) {
			return;
		}

		setTransferring(prev => ({ ...prev, [patient.id]: true }));

		try {
			const patientRef = doc(db, 'patients', patient.id);
			await updateDoc(patientRef, {
				assignedDoctor: newTherapistName,
				transferredAt: serverTimestamp(),
			});

			setSuccessMessage(`Successfully transferred ${patient.name} to ${newTherapistName}`);
			setTimeout(() => setSuccessMessage(null), 3000);
		} catch (error) {
			console.error('Failed to transfer patient', error);
			alert(`Failed to transfer patient: ${error instanceof Error ? error.message : 'Unknown error'}`);
		} finally {
			setTransferring(prev => ({ ...prev, [patient.id]: false }));
		}
	};

	return (
		<div className="min-h-svh bg-slate-50 px-6 py-10">
			<div className="mx-auto max-w-6xl space-y-10">
				<PageHeader
					badge="Clinical Team"
					title="Transfer Patients"
					description="Reassign patients between therapists. Select a new therapist from the dropdown and click Transfer to update the assignment."
				/>

				<div className="border-t border-slate-200" />

				{successMessage && (
					<div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
						<i className="fas fa-check-circle mr-2" aria-hidden="true" />
						{successMessage}
					</div>
				)}

				<section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
					<div className="grid gap-4 sm:grid-cols-1 md:grid-cols-3">
						<div>
							<label htmlFor="search-patients" className="block text-sm font-medium text-slate-700">
								Search Patients
							</label>
							<input
								type="search"
								id="search-patients"
								value={searchTerm}
								onChange={event => setSearchTerm(event.target.value)}
								placeholder="Search by name or ID"
								className="input-base"
							/>
						</div>
						<div>
							<label htmlFor="status-filter" className="block text-sm font-medium text-slate-700">
								Status Filter
							</label>
							<select
								id="status-filter"
								value={statusFilter}
								onChange={event => setStatusFilter(event.target.value as AdminPatientStatus | 'all')}
								className="select-base"
							>
								<option value="all">All Statuses</option>
								<option value="pending">Pending</option>
								<option value="ongoing">Ongoing</option>
								<option value="completed">Completed</option>
								<option value="cancelled">Cancelled</option>
							</select>
						</div>
						<div>
							<label htmlFor="therapist-filter" className="block text-sm font-medium text-slate-700">
								Filter by Therapist
							</label>
							<select
								id="therapist-filter"
								value={therapistFilter}
								onChange={event => setTherapistFilter(event.target.value)}
								className="select-base"
							>
								<option value="all">All Therapists</option>
								<option value="unassigned">Unassigned</option>
								{therapists.map(therapist => (
									<option key={therapist.id} value={therapist.name}>
										{therapist.name}
									</option>
								))}
							</select>
						</div>
					</div>
				</section>

				<section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
					<header className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
						<div>
							<h2 className="text-lg font-semibold text-slate-900">Patient Transfers</h2>
							<p className="text-sm text-slate-500">
								{filteredPatients.length} patient{filteredPatients.length === 1 ? '' : 's'} found
							</p>
						</div>
						<button
							type="button"
							onClick={() => {
								setSearchTerm('');
								setStatusFilter('all');
								setTherapistFilter('all');
							}}
							className="btn-secondary"
						>
							<i className="fas fa-eraser text-xs" aria-hidden="true" />
							Clear filters
						</button>
					</header>

					{loading ? (
						<div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
							<div className="inline-flex h-8 w-8 items-center justify-center rounded-full border-2 border-slate-200 border-t-sky-500 animate-spin" aria-hidden="true" />
							<span className="ml-3 align-middle">Loading patients…</span>
						</div>
					) : filteredPatients.length === 0 ? (
						<div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
							No patients match your filters. Try adjusting your search criteria.
						</div>
					) : (
						<div className="space-y-4">
							{filteredPatients.map(patient => {
								const isTransferring = transferring[patient.id] || false;
								const selectedTherapist = selectedTherapists[patient.id] || patient.assignedDoctor || '';

								return (
									<div
										key={patient.id}
										className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-slate-50 p-4 sm:flex-row sm:items-center sm:justify-between"
									>
										<div className="flex-1">
											<div className="flex items-center gap-3">
												<h3 className="text-base font-semibold text-slate-900">{patient.name}</h3>
												<span
													className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold ${STATUS_BADGES[patient.status]}`}
												>
													{patient.status.charAt(0).toUpperCase() + patient.status.slice(1)}
												</span>
											</div>
											<p className="mt-1 text-sm text-slate-600">
												<span className="font-medium text-slate-700">Patient ID:</span>{' '}
												<code className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-700">
													{patient.patientId}
												</code>
											</p>
											{patient.assignedDoctor && (
												<p className="mt-1 text-xs text-slate-500">
													<span className="font-medium">Currently assigned to:</span> {patient.assignedDoctor}
												</p>
											)}
											{!patient.assignedDoctor && (
												<p className="mt-1 text-xs text-amber-600">
													<i className="fas fa-exclamation-circle mr-1" aria-hidden="true" />
													Not assigned to any therapist
												</p>
											)}
										</div>
										<div className="flex flex-col gap-3 sm:flex-row sm:items-end">
											<div className="min-w-[200px]">
												<label className="block text-xs font-medium text-slate-700">Select Therapist</label>
												<select
													value={selectedTherapist}
													onChange={event =>
														setSelectedTherapists(prev => ({
															...prev,
															[patient.id]: event.target.value,
														}))
													}
													disabled={isTransferring}
													className="select-base"
												>
													<option value="">Select Therapist</option>
													{therapists.map(therapist => (
														<option key={therapist.id} value={therapist.name}>
															{therapist.name} ({therapist.role === 'ClinicalTeam' ? 'Clinical Team' : therapist.role})
														</option>
													))}
												</select>
											</div>
											<button
												type="button"
												onClick={() => handleTransfer(patient, selectedTherapist)}
												disabled={isTransferring || !selectedTherapist || selectedTherapist === patient.assignedDoctor}
												className="btn-primary"
											>
												{isTransferring ? (
													<>
														<div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
														Transferring...
													</>
												) : (
													<>
														<i className="fas fa-exchange-alt text-xs" aria-hidden="true" />
														Transfer
													</>
												)}
											</button>
										</div>
									</div>
								);
							})}
						</div>
					)}
				</section>
			</div>
		</div>
	);
}
