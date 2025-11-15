'use client';

import { useEffect, useMemo, useState } from 'react';
import { collection, doc, onSnapshot, updateDoc, serverTimestamp, type QuerySnapshot, type Timestamp } from 'firebase/firestore';

import { db } from '@/lib/firebase';
import type { AdminGenderOption, AdminPatientStatus } from '@/lib/adminMockData';

interface PatientRecord {
	id: string;
	patientId: string;
	name: string;
	dob: string;
	gender: AdminGenderOption;
	phone?: string;
	email?: string;
	status: AdminPatientStatus;
	assignedDoctor?: string;
	rom?: Record<string, any>;
}

// ROM Constants - same as in EditReport
const ROM_MOTIONS: Record<string, Array<{ motion: string }>> = {
	Neck: [{ motion: 'Flexion' }, { motion: 'Extension' }, { motion: 'Lateral Flexion' }, { motion: 'Rotation' }],
	Hip: [
		{ motion: 'Flexion' },
		{ motion: 'Extension' },
		{ motion: 'Abduction' },
		{ motion: 'Adduction' },
		{ motion: 'Internal Rotation' },
		{ motion: 'External Rotation' },
	],
	Shoulder: [
		{ motion: 'Flexion' },
		{ motion: 'Extension' },
		{ motion: 'Abduction' },
		{ motion: 'Adduction' },
		{ motion: 'Internal Rotation' },
		{ motion: 'External Rotation' },
	],
	Elbow: [{ motion: 'Flexion' }, { motion: 'Extension' }],
	Forearm: [{ motion: 'Supination' }, { motion: 'Pronation' }],
	Wrist: [
		{ motion: 'Flexion' },
		{ motion: 'Extension' },
		{ motion: 'Radial Deviation' },
		{ motion: 'Ulnar Deviation' },
	],
	Knee: [{ motion: 'Flexion' }, { motion: 'Extension' }],
	Ankle: [
		{ motion: 'Dorsiflexion' },
		{ motion: 'Plantarflexion' },
		{ motion: 'Inversion' },
		{ motion: 'Eversion' },
	],
	Toes: [{ motion: 'Flexion' }, { motion: 'Extension' }],
};

const ROM_HAS_SIDE: Record<string, boolean> = {
	Shoulder: true,
	Elbow: true,
	Forearm: true,
	Wrist: true,
	Knee: true,
	Ankle: true,
	Toes: true,
};

const ROM_JOINTS = Object.keys(ROM_MOTIONS);

export default function ROM() {
	const [patients, setPatients] = useState<PatientRecord[]>([]);
	const [selectedPatient, setSelectedPatient] = useState<PatientRecord | null>(null);
	const [loading, setLoading] = useState(true);
	const [saving, setSaving] = useState(false);
	const [savedMessage, setSavedMessage] = useState(false);
	const [searchTerm, setSearchTerm] = useState('');
	const [selectedRomJoint, setSelectedRomJoint] = useState('');
	const [romData, setRomData] = useState<Record<string, any>>({});

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
						phone: data.phone ? String(data.phone) : undefined,
						email: data.email ? String(data.email) : undefined,
						status: (data.status as AdminPatientStatus) ?? 'pending',
						assignedDoctor: data.assignedDoctor ? String(data.assignedDoctor) : undefined,
						rom: (data.rom as Record<string, any>) || {},
					} as PatientRecord;
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

	// Update ROM data when patient is selected
	useEffect(() => {
		if (selectedPatient) {
			setRomData(selectedPatient.rom || {});
		} else {
			setRomData({});
		}
	}, [selectedPatient]);

	const filteredPatients = useMemo(() => {
		const query = searchTerm.trim().toLowerCase();
		return patients.filter(patient => {
			if (!query) return true;
			return (
				(patient.name || '').toLowerCase().includes(query) ||
				(patient.patientId || '').toLowerCase().includes(query) ||
				(patient.phone || '').toLowerCase().includes(query)
			);
		});
	}, [patients, searchTerm]);

	const handleSelectPatient = (patient: PatientRecord) => {
		setSelectedPatient(patient);
		setRomData(patient.rom || {});
	};

	const handleRomChange = (joint: string, motion: string, side: 'left' | 'right' | 'none', value: string) => {
		setRomData(prev => {
			const rom = { ...prev };
			if (!rom[joint]) {
				rom[joint] = ROM_HAS_SIDE[joint] ? { left: {}, right: {} } : {};
			}

			if (side === 'none') {
				rom[joint][motion] = value;
			} else {
				if (!rom[joint][side]) {
					rom[joint][side] = {};
				}
				rom[joint][side][motion] = value;
			}

			return rom;
		});
	};

	const handleAddRomJoint = () => {
		if (!selectedRomJoint) return;
		
		if (!romData[selectedRomJoint]) {
			setRomData(prev => {
				const rom = { ...prev };
				rom[selectedRomJoint] = ROM_HAS_SIDE[selectedRomJoint] ? { left: {}, right: {} } : {};
				return rom;
			});
		}
		setSelectedRomJoint('');
	};

	const handleRemoveRomJoint = (joint: string) => {
		setRomData(prev => {
			const rom = { ...prev };
			delete rom[joint];
			return rom;
		});
	};

	const handleSave = async () => {
		if (!selectedPatient?.id || saving) return;

		setSaving(true);
		try {
			const patientRef = doc(db, 'patients', selectedPatient.id);
			await updateDoc(patientRef, {
				rom: romData,
				updatedAt: serverTimestamp(),
			});

			setSavedMessage(true);
			setTimeout(() => setSavedMessage(false), 3000);
			
			// Update selected patient with new ROM data
			setSelectedPatient(prev => prev ? { ...prev, rom: romData } : null);
		} catch (error) {
			console.error('Failed to save ROM assessment', error);
			alert('Failed to save ROM assessment. Please try again.');
		} finally {
			setSaving(false);
		}
	};

	const renderRomTable = (joint: string, data: any) => {
		if (!ROM_HAS_SIDE[joint]) {
			return (
				<div key={joint} className="mb-6 rounded-lg border border-slate-200 bg-slate-50 p-4">
					<div className="mb-3 flex items-center justify-between">
						<h6 className="text-sm font-semibold text-sky-600">{joint}</h6>
						<button
							type="button"
							onClick={() => handleRemoveRomJoint(joint)}
							className="text-xs text-rose-600 hover:text-rose-700"
							title="Remove joint"
						>
							<i className="fas fa-times" aria-hidden="true" />
						</button>
					</div>
					<table className="min-w-full divide-y divide-slate-200 border border-slate-300 text-left text-sm">
						<thead className="bg-slate-100">
							<tr>
								<th className="px-3 py-2 font-semibold text-slate-700">Motion</th>
								<th className="px-3 py-2 font-semibold text-slate-700">Value (°)</th>
							</tr>
						</thead>
						<tbody className="divide-y divide-slate-200 bg-white">
							{ROM_MOTIONS[joint].map(({ motion }) => (
								<tr key={motion}>
									<td className="px-3 py-2 text-slate-700">{motion}</td>
									<td className="px-3 py-2">
										<input
											type="text"
											value={data?.[motion] || ''}
											onChange={e => handleRomChange(joint, motion, 'none', e.target.value)}
											className="w-full rounded-md border border-slate-300 px-2 py-1 text-xs"
											placeholder="Enter value"
										/>
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			);
		}

		return (
			<div key={joint} className="mb-6 rounded-lg border border-slate-200 bg-slate-50 p-4">
				<div className="mb-3 flex items-center justify-between">
					<h6 className="text-sm font-semibold text-sky-600">{joint}</h6>
					<button
						type="button"
						onClick={() => handleRemoveRomJoint(joint)}
						className="text-xs text-rose-600 hover:text-rose-700"
						title="Remove joint"
					>
						<i className="fas fa-times" aria-hidden="true" />
					</button>
				</div>
				<table className="min-w-full divide-y divide-slate-200 border border-slate-300 text-left text-sm">
					<thead className="bg-slate-100">
						<tr>
							<th colSpan={2} className="px-3 py-2 text-center font-semibold text-slate-700">
								Left
							</th>
							<th colSpan={2} className="px-3 py-2 text-center font-semibold text-slate-700">
								Right
							</th>
						</tr>
						<tr>
							<th className="px-3 py-2 font-semibold text-slate-700">Motion</th>
							<th className="px-3 py-2 font-semibold text-slate-700">Value (°)</th>
							<th className="px-3 py-2 font-semibold text-slate-700">Motion</th>
							<th className="px-3 py-2 font-semibold text-slate-700">Value (°)</th>
						</tr>
					</thead>
					<tbody className="divide-y divide-slate-200 bg-white">
						{ROM_MOTIONS[joint].map(({ motion }) => (
							<tr key={motion}>
								<td className="px-3 py-2 text-slate-700">{motion}</td>
								<td className="px-3 py-2">
									<input
										type="text"
										value={data?.left?.[motion] || ''}
										onChange={e => handleRomChange(joint, motion, 'left', e.target.value)}
										className="w-full rounded-md border border-slate-300 px-2 py-1 text-xs"
										placeholder="Left"
									/>
								</td>
								<td className="px-3 py-2 text-slate-700">{motion}</td>
								<td className="px-3 py-2">
									<input
										type="text"
										value={data?.right?.[motion] || ''}
										onChange={e => handleRomChange(joint, motion, 'right', e.target.value)}
										className="w-full rounded-md border border-slate-300 px-2 py-1 text-xs"
										placeholder="Right"
									/>
								</td>
							</tr>
						))}
					</tbody>
				</table>
			</div>
		);
	};

	if (!selectedPatient) {
		return (
			<div className="min-h-svh bg-slate-50 px-6 py-10">
				<div className="mx-auto max-w-6xl">
					<header className="mb-8">
						<p className="text-sm font-semibold uppercase tracking-wide text-sky-600">Clinical Team</p>
						<h1 className="mt-1 text-3xl font-semibold text-slate-900">ROM Assessment</h1>
						<p className="mt-2 text-sm text-slate-600">
							Select a patient to record their Range of Motion (ROM) measurements.
						</p>
					</header>

					<section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
						<div className="mb-4">
							<label className="block text-sm font-medium text-slate-700">Search patients</label>
							<input
								type="search"
								value={searchTerm}
								onChange={e => setSearchTerm(e.target.value)}
								className="input-base"
								placeholder="Search by name, ID, or phone"
							/>
						</div>

						{loading ? (
							<div className="py-12 text-center text-sm text-slate-500">
								<div className="inline-flex h-8 w-8 items-center justify-center rounded-full border-2 border-slate-200 border-t-sky-500 animate-spin" aria-hidden="true" />
								<span className="ml-3 align-middle">Loading patients…</span>
							</div>
						) : filteredPatients.length === 0 ? (
							<div className="py-12 text-center text-sm text-slate-500">
								<p className="font-medium text-slate-700">No patients found.</p>
								<p className="mt-1">Try adjusting your search or register a new patient.</p>
							</div>
						) : (
							<div className="overflow-x-auto">
								<table className="min-w-full divide-y divide-slate-200 text-left text-sm">
									<thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
										<tr>
											<th className="px-4 py-3 font-semibold">Patient ID</th>
											<th className="px-4 py-3 font-semibold">Name</th>
											<th className="px-4 py-3 font-semibold">Status</th>
											<th className="px-4 py-3 font-semibold">Assigned Doctor</th>
											<th className="px-4 py-3 font-semibold text-right">Actions</th>
										</tr>
									</thead>
									<tbody className="divide-y divide-slate-100">
										{filteredPatients.map(patient => (
											<tr key={patient.id}>
												<td className="px-4 py-4 text-sm font-medium text-slate-800">{patient.patientId}</td>
												<td className="px-4 py-4 text-sm text-slate-700">{patient.name}</td>
												<td className="px-4 py-4">
													<span
														className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${
															patient.status === 'completed'
																? 'bg-emerald-100 text-emerald-700'
																: patient.status === 'ongoing'
																	? 'bg-sky-100 text-sky-700'
																	: 'bg-amber-100 text-amber-700'
														}`}
													>
														{patient.status}
													</span>
												</td>
												<td className="px-4 py-4 text-sm text-slate-600">{patient.assignedDoctor || 'Unassigned'}</td>
												<td className="px-4 py-4 text-right">
													<button
														type="button"
														onClick={() => handleSelectPatient(patient)}
														className="btn-primary"
													>
														<i className="fas fa-clipboard-check text-xs" aria-hidden="true" />
														Assess ROM
													</button>
												</td>
											</tr>
										))}
									</tbody>
								</table>
							</div>
						)}
					</section>
				</div>
			</div>
		);
	}

	return (
		<div className="min-h-svh bg-slate-50 px-6 py-10">
			<div className="mx-auto max-w-5xl">
				<header className="mb-8 flex items-center justify-between">
					<div>
						<p className="text-sm font-semibold uppercase tracking-wide text-sky-600">Clinical Team</p>
						<h1 className="mt-1 text-3xl font-semibold text-slate-900">ROM Assessment</h1>
						<p className="mt-2 text-sm text-slate-600">
							Recording ROM measurements for {selectedPatient.name} ({selectedPatient.patientId})
						</p>
					</div>
					<button
						type="button"
						onClick={() => {
							setSelectedPatient(null);
							setRomData({});
							setSelectedRomJoint('');
						}}
						className="btn-secondary"
					>
						<i className="fas fa-arrow-left text-xs" aria-hidden="true" />
						Back to List
					</button>
				</header>

				{savedMessage && (
					<div className="mb-6 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
						<i className="fas fa-check mr-2" aria-hidden="true" />
						ROM assessment saved successfully!
					</div>
				)}

				<div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
					{/* Patient Information */}
					<div className="mb-8 border-b border-slate-200 pb-6">
						<h2 className="mb-4 text-xl font-bold text-sky-600">Patient Information</h2>
						<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
							<div>
								<label className="block text-xs font-medium text-slate-500">Patient Name</label>
								<input
									type="text"
									value={selectedPatient.name}
									readOnly
									className="mt-1 w-full rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800"
								/>
							</div>
							<div>
								<label className="block text-xs font-medium text-slate-500">Patient ID</label>
								<input
									type="text"
									value={selectedPatient.patientId}
									readOnly
									className="mt-1 w-full rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800"
								/>
							</div>
							<div>
								<label className="block text-xs font-medium text-slate-500">Date of Birth</label>
								<input
									type="date"
									value={selectedPatient.dob}
									readOnly
									className="mt-1 w-full rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800"
								/>
							</div>
							<div>
								<label className="block text-xs font-medium text-slate-500">Assigned Doctor</label>
								<input
									type="text"
									value={selectedPatient.assignedDoctor || ''}
									readOnly
									className="mt-1 w-full rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800"
								/>
							</div>
						</div>
					</div>

					{/* ROM Section */}
					<div className="mb-8">
						<h3 className="mb-4 text-sm font-semibold text-sky-600">Range of Motion (ROM) Assessment</h3>
						<p className="mb-4 text-xs text-slate-600">
							Select a joint to assess and record the range of motion measurements in degrees (°).
						</p>
						<div className="mb-4 flex items-center gap-3">
							<select
								value={selectedRomJoint}
								onChange={e => setSelectedRomJoint(e.target.value)}
								className="select-base"
								style={{ maxWidth: '220px' }}
							>
								<option value="">--Select Joint--</option>
								{ROM_JOINTS.map(joint => (
									<option key={joint} value={joint}>
										{joint}
									</option>
								))}
							</select>
							<button
								type="button"
								onClick={handleAddRomJoint}
								className="btn-primary"
								disabled={!selectedRomJoint}
							>
								<i className="fas fa-plus text-xs" aria-hidden="true" />
								Add Joint
							</button>
						</div>
						{Object.keys(romData).length > 0 ? (
							<div>
								{Object.keys(romData).map(joint => renderRomTable(joint, romData[joint]))}
							</div>
						) : (
							<p className="text-sm italic text-slate-500">
								No ROM joints recorded. Select a joint and click "Add Joint" to start.
							</p>
						)}
					</div>

					{/* Save Button */}
					<div className="flex items-center justify-end gap-3 border-t border-slate-200 pt-6">
						<button
							type="button"
							onClick={() => {
								setSelectedPatient(null);
								setRomData({});
								setSelectedRomJoint('');
							}}
							className="btn-secondary"
						>
							Cancel
						</button>
						<button type="button" onClick={handleSave} className="btn-primary" disabled={saving}>
							<i className="fas fa-save text-xs" aria-hidden="true" />
							{saving ? 'Saving...' : 'Save ROM Assessment'}
						</button>
					</div>
				</div>
			</div>
		</div>
	);
}

