'use client';

import { useEffect, useMemo, useState } from 'react';
import { collection, doc, onSnapshot, updateDoc, serverTimestamp, type QuerySnapshot, type Timestamp } from 'firebase/firestore';
import { useRouter } from 'next/navigation';

import { db } from '@/lib/firebase';
import type { AdminGenderOption, AdminPatientStatus } from '@/lib/adminMockData';
import { generatePhysiotherapyReportPDF } from '@/lib/pdfGenerator';

interface PatientRecord {
	id: string;
	patientId: string;
	name: string;
	dob: string;
	gender: AdminGenderOption;
	phone?: string;
	email?: string;
	address?: string;
	complaint?: string;
	status: AdminPatientStatus;
	registeredAt: string;
	assignedDoctor?: string;
	// Report fields
	complaints?: string;
	presentHistory?: string;
	pastHistory?: string;
	med_xray?: boolean;
	med_mri?: boolean;
	med_report?: boolean;
	med_ct?: boolean;
	surgicalHistory?: string;
	per_smoking?: boolean;
	per_drinking?: boolean;
	per_alcohol?: boolean;
	per_drugs?: boolean;
	drugsText?: string;
	sleepCycle?: string;
	hydration?: string;
	nutrition?: string;
	siteSide?: string;
	onset?: string;
	duration?: string;
	natureOfInjury?: string;
	typeOfPain?: string;
	vasScale?: string;
	aggravatingFactor?: string;
	relievingFactor?: string;
	rom?: Record<string, any>;
	treatmentProvided?: string;
	progressNotes?: string;
	physioName?: string;
	physioId?: string;

	// New fields from the image form
	dateOfConsultation?: string;
	referredBy?: string;
	chiefComplaint?: string;
	onsetType?: 'Acute' | 'Chronic' | 'Post-surgical' | 'Traumatic';
	mechanismOfInjury?: string;
	painType?: string; // Sharp/Dull/Burning
	painIntensity?: string; // VAS/NPRS
	clinicalDiagnosis?: string;
	
	// Treatment Plan (table data)
	treatmentPlan?: Array<{
		therapy: string;
		frequency: string;
		remarks: string;
	}>;
	
	// Follow-Up Visits (table data)
	followUpVisits?: Array<{
		visitDate: string;
		painLevel: string;
		findings: string;
	}>;
	
	// Current Status
	currentPainStatus?: 'Improved' | 'Same' | 'Worsened';
	currentRom?: string; // "Improved by _*"
	currentStrength?: string; // "_% improvement noted"
	currentFunctionalAbility?: 'Improved' | 'Restricted';
	complianceWithHEP?: 'Excellent' | 'Moderate' | 'Poor';
	
	// Recommendations
	recommendations?: string;
	physiotherapistRemarks?: string;
}

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


function getMedicalHistoryText(p: PatientRecord): string {
	const items: string[] = [];
	if (p.med_xray) items.push('X RAYS');
	if (p.med_mri) items.push('MRI');
	if (p.med_report) items.push('Reports');
	if (p.med_ct) items.push('CT Scans');
	return items.join(', ') || 'N/A';
}

function getPersonalHistoryText(p: PatientRecord): string {
	const items: string[] = [];
	if (p.per_smoking) items.push('Smoking');
	if (p.per_drinking) items.push('Drinking');
	if (p.per_alcohol) items.push('Alcohol');
	if (p.per_drugs) {
		items.push('Drugs: ' + (p.drugsText || ''));
	}
	return items.join(', ') || 'N/A';
}

export default function EditReport() {
	const router = useRouter();
	const [patientIdParam, setPatientIdParam] = useState<string | null>(null);

	const [patients, setPatients] = useState<PatientRecord[]>([]);
	const [selectedPatient, setSelectedPatient] = useState<PatientRecord | null>(null);
	const [loading, setLoading] = useState(true);
	const [saving, setSaving] = useState(false);
	const [savedMessage, setSavedMessage] = useState(false);
	const [searchTerm, setSearchTerm] = useState('');
	const [selectedRomJoint, setSelectedRomJoint] = useState('');
	const [formData, setFormData] = useState<Partial<PatientRecord>>({});

	// Get patientId from URL on client side
	useEffect(() => {
		if (typeof window !== 'undefined') {
			const params = new URLSearchParams(window.location.search);
			setPatientIdParam(params.get('patientId'));
		}
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
						gender: (data.gender as AdminGenderOption) || '',
						phone: data.phone ? String(data.phone) : undefined,
						email: data.email ? String(data.email) : undefined,
						address: data.address ? String(data.address) : undefined,
						complaint: data.complaint ? String(data.complaint) : undefined,
						status: (data.status as AdminPatientStatus) ?? 'pending',
						registeredAt: created ? created.toISOString() : (data.registeredAt as string | undefined) || new Date().toISOString(),
						assignedDoctor: data.assignedDoctor ? String(data.assignedDoctor) : undefined,
						complaints: data.complaints ? String(data.complaints) : undefined,
						presentHistory: data.presentHistory ? String(data.presentHistory) : undefined,
						pastHistory: data.pastHistory ? String(data.pastHistory) : undefined,
						med_xray: data.med_xray === true,
						med_mri: data.med_mri === true,
						med_report: data.med_report === true,
						med_ct: data.med_ct === true,
						surgicalHistory: data.surgicalHistory ? String(data.surgicalHistory) : undefined,
						per_smoking: data.per_smoking === true,
						per_drinking: data.per_drinking === true,
						per_alcohol: data.per_alcohol === true,
						per_drugs: data.per_drugs === true,
						drugsText: data.drugsText ? String(data.drugsText) : undefined,
						sleepCycle: data.sleepCycle ? String(data.sleepCycle) : undefined,
						hydration: data.hydration ? String(data.hydration) : undefined,
						nutrition: data.nutrition ? String(data.nutrition) : undefined,
						siteSide: data.siteSide ? String(data.siteSide) : undefined,
						onset: data.onset ? String(data.onset) : undefined,
						duration: data.duration ? String(data.duration) : undefined,
						natureOfInjury: data.natureOfInjury ? String(data.natureOfInjury) : undefined,
						typeOfPain: data.typeOfPain ? String(data.typeOfPain) : undefined,
						vasScale: data.vasScale ? String(data.vasScale) : undefined,
						aggravatingFactor: data.aggravatingFactor ? String(data.aggravatingFactor) : undefined,
						relievingFactor: data.relievingFactor ? String(data.relievingFactor) : undefined,
						rom: (data.rom as Record<string, any>) || {},
						treatmentProvided: data.treatmentProvided ? String(data.treatmentProvided) : undefined,
						progressNotes: data.progressNotes ? String(data.progressNotes) : undefined,
						physioName: data.physioName ? String(data.physioName) : undefined,
						physioId: data.physioId ? String(data.physioId) : undefined,
						dateOfConsultation: data.dateOfConsultation ? String(data.dateOfConsultation) : undefined,
						referredBy: data.referredBy ? String(data.referredBy) : undefined,
						chiefComplaint: data.chiefComplaint ? String(data.chiefComplaint) : undefined,
						onsetType: data.onsetType ? String(data.onsetType) : undefined,
						mechanismOfInjury: data.mechanismOfInjury ? String(data.mechanismOfInjury) : undefined,
						painType: data.painType ? String(data.painType) : undefined,
						painIntensity: data.painIntensity ? String(data.painIntensity) : undefined,
						clinicalDiagnosis: data.clinicalDiagnosis ? String(data.clinicalDiagnosis) : undefined,
						treatmentPlan: data.treatmentPlan ? (data.treatmentPlan as Array<any>) : undefined,
						followUpVisits: data.followUpVisits ? (data.followUpVisits as Array<any>) : undefined,
						currentPainStatus: data.currentPainStatus ? String(data.currentPainStatus) : undefined,
						currentRom: data.currentRom ? String(data.currentRom) : undefined,
						currentStrength: data.currentStrength ? String(data.currentStrength) : undefined,
						currentFunctionalAbility: data.currentFunctionalAbility ? String(data.currentFunctionalAbility) : undefined,
						complianceWithHEP: data.complianceWithHEP ? String(data.complianceWithHEP) : undefined,
						recommendations: data.recommendations ? String(data.recommendations) : undefined,
						physiotherapistRemarks: data.physiotherapistRemarks ? String(data.physiotherapistRemarks) : undefined,
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

	// Select patient when patientIdParam changes
	useEffect(() => {
		if (patientIdParam && patients.length > 0 && !selectedPatient) {
			const patient = patients.find(p => p.patientId === patientIdParam);
			if (patient) {
				setSelectedPatient(patient);
				setFormData(patient);
			}
		}
	}, [patientIdParam, patients, selectedPatient]);

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
		setFormData(patient);
		router.push(`/clinical-team/edit-report?patientId=${patient.patientId}`);
	};

	const handleFieldChange = (field: keyof PatientRecord, value: any) => {
		setFormData(prev => ({ ...prev, [field]: value }));
	};

	const handleCheckboxChange = (field: keyof PatientRecord, checked: boolean) => {
		setFormData(prev => ({ ...prev, [field]: checked }));
	};

	const handleRomChange = (joint: string, motion: string, side: 'left' | 'right' | 'none', value: string) => {
		setFormData(prev => {
			const rom = { ...(prev.rom || {}) };
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

			return { ...prev, rom };
		});
	};

	const handleAddRomJoint = () => {
		if (!selectedRomJoint || !formData.rom?.[selectedRomJoint]) {
			setFormData(prev => {
				const rom = { ...(prev.rom || {}) };
				if (!rom[selectedRomJoint]) {
					rom[selectedRomJoint] = ROM_HAS_SIDE[selectedRomJoint] ? { left: {}, right: {} } : {};
				}
				return { ...prev, rom };
			});
		}
		setSelectedRomJoint('');
	};

	const handleSave = async () => {
		if (!selectedPatient?.id || saving) return;

		setSaving(true);
		try {
			const patientRef = doc(db, 'patients', selectedPatient.id);
			
			// Only save report-related fields, not patient demographics
			const reportData: Record<string, any> = {
				complaints: formData.complaints || '',
				presentHistory: formData.presentHistory || '',
				pastHistory: formData.pastHistory || '',
				med_xray: formData.med_xray || false,
				med_mri: formData.med_mri || false,
				med_report: formData.med_report || false,
				med_ct: formData.med_ct || false,
				surgicalHistory: formData.surgicalHistory || '',
				per_smoking: formData.per_smoking || false,
				per_drinking: formData.per_drinking || false,
				per_alcohol: formData.per_alcohol || false,
				per_drugs: formData.per_drugs || false,
				drugsText: formData.drugsText || '',
				sleepCycle: formData.sleepCycle || '',
				hydration: formData.hydration || '',
				nutrition: formData.nutrition || '',
				siteSide: formData.siteSide || '',
				onset: formData.onset || '',
				duration: formData.duration || '',
				natureOfInjury: formData.natureOfInjury || '',
				typeOfPain: formData.typeOfPain || '',
				vasScale: formData.vasScale || '',
				aggravatingFactor: formData.aggravatingFactor || '',
				relievingFactor: formData.relievingFactor || '',
				rom: formData.rom || {},
				treatmentProvided: formData.treatmentProvided || '',
				progressNotes: formData.progressNotes || '',
				physioName: formData.physioName || '',
				physioId: formData.physioId || '',
				dateOfConsultation: formData.dateOfConsultation || '',
				referredBy: formData.referredBy || '',
				chiefComplaint: formData.chiefComplaint || '',
				onsetType: formData.onsetType || '',
				mechanismOfInjury: formData.mechanismOfInjury || '',
				painType: formData.painType || '',
				painIntensity: formData.painIntensity || '',
				clinicalDiagnosis: formData.clinicalDiagnosis || '',
				treatmentPlan: formData.treatmentPlan || [],
				followUpVisits: formData.followUpVisits || [],
				currentPainStatus: formData.currentPainStatus || '',
				currentRom: formData.currentRom || '',
				currentStrength: formData.currentStrength || '',
				currentFunctionalAbility: formData.currentFunctionalAbility || '',
				complianceWithHEP: formData.complianceWithHEP || '',
				recommendations: formData.recommendations || '',
				physiotherapistRemarks: formData.physiotherapistRemarks || '',
				updatedAt: serverTimestamp(),
			};

			await updateDoc(patientRef, reportData);

			setSavedMessage(true);
			setTimeout(() => setSavedMessage(false), 3000);
		} catch (error) {
			console.error('Failed to save report', error);
			alert('Failed to save report. Please try again.');
		} finally {
			setSaving(false);
		}
	};

	const renderRomTable = (joint: string, data: any) => {
		if (!ROM_HAS_SIDE[joint]) {
			return (
				<div key={joint} className="mb-6 rounded-lg border border-slate-200 bg-slate-50 p-4">
					<h6 className="mb-3 text-sm font-semibold text-sky-600">{joint}</h6>
					<table className="min-w-full divide-y divide-slate-200 border border-slate-300 text-left text-sm">
						<thead className="bg-slate-100">
							<tr>
								<th className="px-3 py-2 font-semibold text-slate-700">Motion</th>
								<th className="px-3 py-2 font-semibold text-slate-700">Value</th>
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
				<h6 className="mb-3 text-sm font-semibold text-sky-600">{joint}</h6>
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
							<th className="px-3 py-2 font-semibold text-slate-700">Value</th>
							<th className="px-3 py-2 font-semibold text-slate-700">Motion</th>
							<th className="px-3 py-2 font-semibold text-slate-700">Value</th>
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
						<h1 className="mt-1 text-3xl font-semibold text-slate-900">View & Edit Reports</h1>
						<p className="mt-2 text-sm text-slate-600">
							Select a patient to view and edit their physiotherapy report.
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
														<i className="fas fa-edit text-xs" aria-hidden="true" />
														Edit Report
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

	const handleDownloadPDF = () => {
		if (!selectedPatient) return;
		
		generatePhysiotherapyReportPDF({
			patientName: selectedPatient.name,
			patientId: selectedPatient.patientId,
			referredBy: selectedPatient.assignedDoctor || formData.referredBy || '',
			age: selectedPatient.dob ? new Date().getFullYear() - new Date(selectedPatient.dob).getFullYear() + '' : '',
			gender: selectedPatient.gender || '',
			dateOfConsultation: formData.dateOfConsultation || new Date().toISOString().split('T')[0],
			contact: selectedPatient.phone || '',
			email: selectedPatient.email || '',
			chiefComplaint: formData.chiefComplaint || formData.complaints || '',
			onsetType: formData.onsetType || '',
			duration: formData.duration || '',
			mechanismOfInjury: formData.mechanismOfInjury || '',
			painType: formData.painType || formData.typeOfPain || '',
			painIntensity: formData.painIntensity || formData.vasScale || '',
			aggravatingFactor: formData.aggravatingFactor || '',
			relievingFactor: formData.relievingFactor || '',
			medicalHistory: getMedicalHistoryText(selectedPatient),
			surgicalHistory: formData.surgicalHistory || '',
			medications: formData.drugsText || '',
			clinicalDiagnosis: formData.clinicalDiagnosis || '',
			treatmentPlan: formData.treatmentPlan || [],
			followUpVisits: formData.followUpVisits || [],
			currentPainStatus: formData.currentPainStatus || '',
			currentRom: formData.currentRom || '',
			currentStrength: formData.currentStrength || '',
			currentFunctionalAbility: formData.currentFunctionalAbility || '',
			complianceWithHEP: formData.complianceWithHEP || '',
			recommendations: formData.recommendations || '',
			physiotherapistRemarks: formData.physiotherapistRemarks || formData.progressNotes || '',
			physioName: formData.physioName || '',
			physioRegNo: formData.physioId || '',
		});
	};

	return (
		<div className="min-h-svh bg-slate-50 px-6 py-10">
			<div className="mx-auto max-w-5xl">
				<header className="mb-8 flex items-center justify-between">
					<div>
						<p className="text-sm font-semibold uppercase tracking-wide text-sky-600">Clinical Team</p>
						<h1 className="mt-1 text-3xl font-semibold text-slate-900">Physiotherapy Report</h1>
						<p className="mt-2 text-sm text-slate-600">
							Editing report for {selectedPatient.name} ({selectedPatient.patientId})
						</p>
					</div>
					<button
						type="button"
						onClick={() => {
							setSelectedPatient(null);
							router.push('/clinical-team/edit-report');
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
						Report saved successfully!
					</div>
				)}

				<div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
					{/* Patient Information */}
					<div className="mb-8 border-b border-slate-200 pb-6">
						<h2 className="mb-4 text-xl font-bold text-sky-600">Physiotherapy Report</h2>
						<div className="mb-4 text-right text-sm text-slate-600">
							<div>
								<b>Clinic:</b> Centre For Sports Science, Kanteerava Stadium
							</div>
							<div>
								<b>Date:</b> {new Date().toLocaleDateString()}
							</div>
						</div>
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

					{/* Assessment Section */}
					<div className="mb-8">
						<h3 className="mb-4 text-sm font-semibold text-sky-600">Assessment</h3>
						<div className="grid gap-4 sm:grid-cols-2">
							<div>
								<label className="block text-xs font-medium text-slate-500">Complaints</label>
								<textarea
									value={formData.complaints || ''}
									onChange={e => handleFieldChange('complaints', e.target.value)}
									className="textarea-base"
									rows={2}
								/>
							</div>
							<div>
								<label className="block text-xs font-medium text-slate-500">Present History</label>
								<textarea
									value={formData.presentHistory || ''}
									onChange={e => handleFieldChange('presentHistory', e.target.value)}
									className="textarea-base"
									rows={2}
								/>
							</div>
							<div>
								<label className="block text-xs font-medium text-slate-500">Past History</label>
								<textarea
									value={formData.pastHistory || ''}
									onChange={e => handleFieldChange('pastHistory', e.target.value)}
									className="textarea-base"
									rows={2}
								/>
							</div>
							<div>
								<label className="block text-xs font-medium text-slate-500">Medical History</label>
								<div className="mt-2 space-y-2">
									<label className="flex items-center gap-2 text-sm text-slate-700">
										<input
											type="checkbox"
											checked={formData.med_xray || false}
											onChange={e => handleCheckboxChange('med_xray', e.target.checked)}
											className="rounded border-slate-300 text-sky-600 focus:ring-sky-200"
										/>
										X RAYS
									</label>
									<label className="flex items-center gap-2 text-sm text-slate-700">
										<input
											type="checkbox"
											checked={formData.med_mri || false}
											onChange={e => handleCheckboxChange('med_mri', e.target.checked)}
											className="rounded border-slate-300 text-sky-600 focus:ring-sky-200"
										/>
										MRI
									</label>
									<label className="flex items-center gap-2 text-sm text-slate-700">
										<input
											type="checkbox"
											checked={formData.med_report || false}
											onChange={e => handleCheckboxChange('med_report', e.target.checked)}
											className="rounded border-slate-300 text-sky-600 focus:ring-sky-200"
										/>
										Reports
									</label>
									<label className="flex items-center gap-2 text-sm text-slate-700">
										<input
											type="checkbox"
											checked={formData.med_ct || false}
											onChange={e => handleCheckboxChange('med_ct', e.target.checked)}
											className="rounded border-slate-300 text-sky-600 focus:ring-sky-200"
										/>
										CT Scans
									</label>
								</div>
							</div>
							<div>
								<label className="block text-xs font-medium text-slate-500">Surgical History</label>
								<textarea
									value={formData.surgicalHistory || ''}
									onChange={e => handleFieldChange('surgicalHistory', e.target.value)}
									className="textarea-base"
									rows={2}
								/>
							</div>
							<div>
								<label className="block text-xs font-medium text-slate-500">Personal History</label>
								<div className="mt-2 space-y-2">
									<label className="flex items-center gap-2 text-sm text-slate-700">
										<input
											type="checkbox"
											checked={formData.per_smoking || false}
											onChange={e => handleCheckboxChange('per_smoking', e.target.checked)}
											className="rounded border-slate-300 text-sky-600 focus:ring-sky-200"
										/>
										Smoking
									</label>
									<label className="flex items-center gap-2 text-sm text-slate-700">
										<input
											type="checkbox"
											checked={formData.per_drinking || false}
											onChange={e => handleCheckboxChange('per_drinking', e.target.checked)}
											className="rounded border-slate-300 text-sky-600 focus:ring-sky-200"
										/>
										Drinking
									</label>
									<label className="flex items-center gap-2 text-sm text-slate-700">
										<input
											type="checkbox"
											checked={formData.per_alcohol || false}
											onChange={e => handleCheckboxChange('per_alcohol', e.target.checked)}
											className="rounded border-slate-300 text-sky-600 focus:ring-sky-200"
										/>
										Alcohol
									</label>
									<label className="flex items-center gap-2 text-sm text-slate-700">
										<input
											type="checkbox"
											checked={formData.per_drugs || false}
											onChange={e => handleCheckboxChange('per_drugs', e.target.checked)}
											className="rounded border-slate-300 text-sky-600 focus:ring-sky-200"
										/>
										Drugs
									</label>
									{formData.per_drugs && (
										<input
											type="text"
											value={formData.drugsText || ''}
											onChange={e => handleFieldChange('drugsText', e.target.value)}
											className="input-base"
											placeholder="Which drug?"
										/>
									)}
								</div>
							</div>
							<div>
								<label className="block text-xs font-medium text-slate-500">Sleep Cycle</label>
								<input
									type="text"
									value={formData.sleepCycle || ''}
									onChange={e => handleFieldChange('sleepCycle', e.target.value)}
									className="input-base"
								/>
							</div>
							<div>
								<label className="block text-xs font-medium text-slate-500">Hydration</label>
								<input
									type="text"
									value={formData.hydration || ''}
									onChange={e => handleFieldChange('hydration', e.target.value)}
									className="input-base"
								/>
							</div>
							<div>
								<label className="block text-xs font-medium text-slate-500">Nutrition</label>
								<input
									type="text"
									value={formData.nutrition || ''}
									onChange={e => handleFieldChange('nutrition', e.target.value)}
									className="input-base"
								/>
							</div>
							<div>
								<label className="block text-xs font-medium text-slate-500">Site and Side</label>
								<input
									type="text"
									value={formData.siteSide || ''}
									onChange={e => handleFieldChange('siteSide', e.target.value)}
									className="input-base"
								/>
							</div>
							<div>
								<label className="block text-xs font-medium text-slate-500">Onset</label>
								<input
									type="text"
									value={formData.onset || ''}
									onChange={e => handleFieldChange('onset', e.target.value)}
									className="input-base"
								/>
							</div>
							<div>
								<label className="block text-xs font-medium text-slate-500">Duration</label>
								<input
									type="text"
									value={formData.duration || ''}
									onChange={e => handleFieldChange('duration', e.target.value)}
									className="input-base"
								/>
							</div>
							<div>
								<label className="block text-xs font-medium text-slate-500">Nature of Injury</label>
								<input
									type="text"
									value={formData.natureOfInjury || ''}
									onChange={e => handleFieldChange('natureOfInjury', e.target.value)}
									className="input-base"
								/>
							</div>
							<div>
								<label className="block text-xs font-medium text-slate-500">Type of Pain</label>
								<input
									type="text"
									value={formData.typeOfPain || ''}
									onChange={e => handleFieldChange('typeOfPain', e.target.value)}
									className="input-base"
								/>
							</div>
							<div>
								<label className="block text-xs font-medium text-slate-500">VAS Scale</label>
								<input
									type="text"
									value={formData.vasScale || ''}
									onChange={e => handleFieldChange('vasScale', e.target.value)}
									className="input-base"
									placeholder="1-10"
								/>
							</div>
							<div>
								<label className="block text-xs font-medium text-slate-500">Aggravating Factor</label>
								<input
									type="text"
									value={formData.aggravatingFactor || ''}
									onChange={e => handleFieldChange('aggravatingFactor', e.target.value)}
									className="input-base"
								/>
							</div>
							<div>
								<label className="block text-xs font-medium text-slate-500">Relieving Factor</label>
								<input
									type="text"
									value={formData.relievingFactor || ''}
									onChange={e => handleFieldChange('relievingFactor', e.target.value)}
									className="input-base"
								/>
							</div>
						</div>
					</div>

					{/* ROM Section */}
					<div className="mb-8">
						<h3 className="mb-4 text-sm font-semibold text-sky-600">Range of Motion (ROM) Assessment</h3>
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
						{formData.rom && Object.keys(formData.rom).length > 0 ? (
							<div>
								{Object.keys(formData.rom).map(joint => renderRomTable(joint, formData.rom![joint]))}
							</div>
						) : (
							<p className="text-sm italic text-slate-500">No ROM joints recorded. Select a joint and click "Add Joint" to start.</p>
						)}
					</div>

					{/* Treatment Section */}
					<div className="mb-8">
						<h3 className="mb-4 text-sm font-semibold text-sky-600">Treatment Provided</h3>
						<textarea
							value={formData.treatmentProvided || ''}
							onChange={e => handleFieldChange('treatmentProvided', e.target.value)}
							className="textarea-base"
							rows={3}
						/>
					</div>

					{/* Progress Notes Section */}
					<div className="mb-8">
						<h3 className="mb-4 text-sm font-semibold text-sky-600">Progress Notes</h3>
						<textarea
							value={formData.progressNotes || ''}
							onChange={e => handleFieldChange('progressNotes', e.target.value)}
							className="textarea-base"
							rows={3}
						/>
					</div>

					{/* Physiotherapist Section */}
					<div className="mb-8">
						<h3 className="mb-4 text-sm font-semibold text-sky-600">Physiotherapist Details</h3>
						<div className="grid gap-4 sm:grid-cols-2">
							<div>
								<label className="block text-xs font-medium text-slate-500">Physio Name</label>
								<input
									type="text"
									value={formData.physioName || ''}
									onChange={e => handleFieldChange('physioName', e.target.value)}
									className="input-base"
								/>
							</div>
							<div>
								<label className="block text-xs font-medium text-slate-500">Physio ID / Signature</label>
								<input
									type="text"
									value={formData.physioId || ''}
									onChange={e => handleFieldChange('physioId', e.target.value)}
									className="input-base"
								/>
							</div>
						</div>
					</div>

					{/* New Section: Clinical History - Detailed */}
					<div className="mb-8">
						<h3 className="mb-4 text-sm font-semibold text-sky-600">1. Clinical History (Detailed)</h3>
						<div className="grid gap-4 sm:grid-cols-2">
							<div>
								<label className="block text-xs font-medium text-slate-500">Chief Complaint</label>
								<textarea
									value={formData.chiefComplaint || ''}
									onChange={e => handleFieldChange('chiefComplaint', e.target.value)}
									className="textarea-base"
									rows={2}
								/>
							</div>
							<div>
								<label className="block text-xs font-medium text-slate-500">Onset & Duration</label>
								<select
									value={formData.onsetType || ''}
									onChange={e => handleFieldChange('onsetType', e.target.value)}
									className="select-base"
								>
									<option value="">Select type</option>
									<option value="Acute">Acute</option>
									<option value="Chronic">Chronic</option>
									<option value="Post-surgical">Post-surgical</option>
									<option value="Traumatic">Traumatic</option>
								</select>
								<input
									type="text"
									value={formData.duration || ''}
									onChange={e => handleFieldChange('duration', e.target.value)}
									className="input-base mt-2"
									placeholder="Duration details"
								/>
							</div>
							<div>
								<label className="block text-xs font-medium text-slate-500">Mechanism of Injury</label>
								<textarea
									value={formData.mechanismOfInjury || ''}
									onChange={e => handleFieldChange('mechanismOfInjury', e.target.value)}
									className="textarea-base"
									rows={2}
									placeholder="Describe activity, posture, incident."
								/>
							</div>
							<div>
								<label className="block text-xs font-medium text-slate-500">Pain Characteristics</label>
								<input
									type="text"
									value={formData.painType || ''}
									onChange={e => handleFieldChange('painType', e.target.value)}
									className="input-base mb-2"
									placeholder="Type (Sharp/Dull/Burning)"
								/>
								<input
									type="text"
									value={formData.painIntensity || ''}
									onChange={e => handleFieldChange('painIntensity', e.target.value)}
									className="input-base"
									placeholder="Intensity (VAS/NPRS)"
								/>
							</div>
						</div>
					</div>

					{/* Diagnosis Section */}
					<div className="mb-8">
						<h3 className="mb-4 text-sm font-semibold text-sky-600">3. Diagnosis/Impression</h3>
						<div>
							<label className="block text-xs font-medium text-slate-500">Clinical Diagnosis</label>
							<textarea
								value={formData.clinicalDiagnosis || ''}
								onChange={e => handleFieldChange('clinicalDiagnosis', e.target.value)}
								className="textarea-base"
								rows={2}
							/>
						</div>
					</div>

					{/* Treatment Plan Section */}
					<div className="mb-8">
						<h3 className="mb-4 text-sm font-semibold text-sky-600">4. Treatment Plan - Initial Consultation</h3>
						<table className="min-w-full divide-y divide-slate-200 border border-slate-300 text-left text-sm">
							<thead className="bg-slate-100">
								<tr>
									<th className="px-3 py-2 font-semibold text-slate-700">Therapy / Modality</th>
									<th className="px-3 py-2 font-semibold text-slate-700">Frequency / Duration</th>
									<th className="px-3 py-2 font-semibold text-slate-700">Remarks</th>
								</tr>
							</thead>
							<tbody className="divide-y divide-slate-200 bg-white">
								{['IF1 / TENS / Ultrasound', 'Manual Therapy / Mobilization', 'Stretching / Strengthening', 'Posture Correction / Ergonomics', 'Home Exercise Program (HEP)'].map((therapy, idx) => {
									const planItem = formData.treatmentPlan?.[idx] || { therapy, frequency: '', remarks: '' };
									return (
										<tr key={idx}>
											<td className="px-3 py-2 text-slate-700">{therapy}</td>
											<td className="px-3 py-2">
												<input
													type="text"
													value={planItem.frequency}
													onChange={e => {
														const newPlan = [...(formData.treatmentPlan || [])];
														newPlan[idx] = { ...planItem, frequency: e.target.value };
														handleFieldChange('treatmentPlan', newPlan);
													}}
													className="w-full rounded-md border border-slate-300 px-2 py-1 text-xs"
												/>
											</td>
											<td className="px-3 py-2">
												<input
													type="text"
													value={planItem.remarks}
													onChange={e => {
														const newPlan = [...(formData.treatmentPlan || [])];
														newPlan[idx] = { ...planItem, remarks: e.target.value };
														handleFieldChange('treatmentPlan', newPlan);
													}}
													className="w-full rounded-md border border-slate-300 px-2 py-1 text-xs"
												/>
											</td>
										</tr>
									);
								})}
							</tbody>
						</table>
					</div>

					{/* Follow-Up Visit Summary */}
					<div className="mb-8">
						<h3 className="mb-4 text-sm font-semibold text-sky-600">5. Follow-Up Visit Summary</h3>
						<table className="min-w-full divide-y divide-slate-200 border border-slate-300 text-left text-sm">
							<thead className="bg-slate-100">
								<tr>
									<th className="px-3 py-2 font-semibold text-slate-700">Visit Date</th>
									<th className="px-3 py-2 font-semibold text-slate-700">Pain Level (VAS)</th>
									<th className="px-3 py-2 font-semibold text-slate-700">Findings/Progress</th>
								</tr>
							</thead>
							<tbody className="divide-y divide-slate-200 bg-white">
								{[1, 2, 3, 4].map((visitNum) => {
									const visit = formData.followUpVisits?.[visitNum - 1] || { visitDate: '', painLevel: '', findings: '' };
									return (
										<tr key={visitNum}>
											<td className="px-3 py-2">
												<input
													type="date"
													value={visit.visitDate}
													onChange={e => {
														const newVisits = [...(formData.followUpVisits || [])];
														newVisits[visitNum - 1] = { ...visit, visitDate: e.target.value };
														handleFieldChange('followUpVisits', newVisits);
													}}
													className="w-full rounded-md border border-slate-300 px-2 py-1 text-xs"
												/>
											</td>
											<td className="px-3 py-2">
												<input
													type="text"
													value={visit.painLevel}
													onChange={e => {
														const newVisits = [...(formData.followUpVisits || [])];
														newVisits[visitNum - 1] = { ...visit, painLevel: e.target.value };
														handleFieldChange('followUpVisits', newVisits);
													}}
													className="w-full rounded-md border border-slate-300 px-2 py-1 text-xs"
												/>
											</td>
											<td className="px-3 py-2">
												<input
													type="text"
													value={visit.findings}
													onChange={e => {
														const newVisits = [...(formData.followUpVisits || [])];
														newVisits[visitNum - 1] = { ...visit, findings: e.target.value };
														handleFieldChange('followUpVisits', newVisits);
													}}
													className="w-full rounded-md border border-slate-300 px-2 py-1 text-xs"
												/>
											</td>
										</tr>
									);
								})}
							</tbody>
						</table>
					</div>

					{/* Current Status */}
					<div className="mb-8">
						<h3 className="mb-4 text-sm font-semibold text-sky-600">6. Current Status (as on last visit)</h3>
						<div className="grid gap-4 sm:grid-cols-2">
							<div>
								<label className="block text-xs font-medium text-slate-500">Pain</label>
								<select
									value={formData.currentPainStatus || ''}
									onChange={e => handleFieldChange('currentPainStatus', e.target.value)}
									className="select-base"
								>
									<option value="">Select</option>
									<option value="Improved">Improved</option>
									<option value="Same">Same</option>
									<option value="Worsened">Worsened</option>
								</select>
							</div>
							<div>
								<label className="block text-xs font-medium text-slate-500">ROM</label>
								<input
									type="text"
									value={formData.currentRom || ''}
									onChange={e => handleFieldChange('currentRom', e.target.value)}
									className="input-base"
									placeholder="Improved by _*"
								/>
							</div>
							<div>
								<label className="block text-xs font-medium text-slate-500">Strength</label>
								<input
									type="text"
									value={formData.currentStrength || ''}
									onChange={e => handleFieldChange('currentStrength', e.target.value)}
									className="input-base"
									placeholder="_% improvement noted"
								/>
							</div>
							<div>
								<label className="block text-xs font-medium text-slate-500">Functional Ability</label>
								<select
									value={formData.currentFunctionalAbility || ''}
									onChange={e => handleFieldChange('currentFunctionalAbility', e.target.value)}
									className="select-base"
								>
									<option value="">Select</option>
									<option value="Improved">Improved</option>
									<option value="Restricted">Restricted</option>
								</select>
							</div>
							<div>
								<label className="block text-xs font-medium text-slate-500">Compliance with HEP</label>
								<select
									value={formData.complianceWithHEP || ''}
									onChange={e => handleFieldChange('complianceWithHEP', e.target.value)}
									className="select-base"
								>
									<option value="">Select</option>
									<option value="Excellent">Excellent</option>
									<option value="Moderate">Moderate</option>
									<option value="Poor">Poor</option>
								</select>
							</div>
						</div>
					</div>

					{/* Recommendations */}
					<div className="mb-8">
						<h3 className="mb-4 text-sm font-semibold text-sky-600">7. Recommendations</h3>
						<textarea
							value={formData.recommendations || ''}
							onChange={e => handleFieldChange('recommendations', e.target.value)}
							className="textarea-base"
							rows={3}
							placeholder="• Continue therapy for _ more sessions&#10;• Add strengthening for _&#10;• Avoid _ activities"
						/>
					</div>

					{/* Physiotherapist's Remarks */}
					<div className="mb-8">
						<h3 className="mb-4 text-sm font-semibold text-sky-600">8. Physiotherapist's Remarks</h3>
						<textarea
							value={formData.physiotherapistRemarks || ''}
							onChange={e => handleFieldChange('physiotherapistRemarks', e.target.value)}
							className="textarea-base"
							rows={4}
						/>
					</div>

					{/* Save Button */}
					<div className="flex items-center justify-end gap-3 border-t border-slate-200 pt-6">
						<button
							type="button"
							onClick={() => {
								setSelectedPatient(null);
								router.push('/clinical-team/edit-report');
							}}
							className="btn-secondary"
						>
							Cancel
						</button>
						<button
							type="button"
							onClick={handleDownloadPDF}
							className="btn-secondary"
							disabled={!selectedPatient}
						>
							<i className="fas fa-download text-xs" aria-hidden="true" />
							Download PDF
						</button>
						<button type="button" onClick={handleSave} className="btn-primary" disabled={saving}>
							<i className="fas fa-save text-xs" aria-hidden="true" />
							{saving ? 'Saving...' : 'Save Report'}
						</button>
					</div>
				</div>
			</div>
		</div>
	);
}
