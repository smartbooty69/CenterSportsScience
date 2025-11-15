'use client';

import { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot, type QuerySnapshot, type Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import PageHeader from '@/components/PageHeader';
import { generatePhysiotherapyReportPDF } from '@/lib/pdfGenerator';
import type { PatientRecordFull } from '@/lib/types';

type PatientRecord = Omit<PatientRecordFull, 'id' | 'status'> & { id?: string; status?: string };

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

export default function Reports() {
	const [patients, setPatients] = useState<PatientRecord[]>([]);
	const [loading, setLoading] = useState(true);
	const [selectedPatientId, setSelectedPatientId] = useState<string | null>(null);
	const [showModal, setShowModal] = useState(false);
	const [savedMessage, setSavedMessage] = useState(false);

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
						dob: data.dob ? String(data.dob) : '',
						assignedDoctor: data.assignedDoctor ? String(data.assignedDoctor) : undefined,
						status: data.status ? String(data.status) : undefined,
						complaints: data.complaints ? String(data.complaints) : undefined,
						presentHistory: data.presentHistory ? String(data.presentHistory) : undefined,
						pastHistory: data.pastHistory ? String(data.pastHistory) : undefined,
						med_xray: data.med_xray ? Boolean(data.med_xray) : undefined,
						med_mri: data.med_mri ? Boolean(data.med_mri) : undefined,
						med_report: data.med_report ? Boolean(data.med_report) : undefined,
						med_ct: data.med_ct ? Boolean(data.med_ct) : undefined,
						surgicalHistory: data.surgicalHistory ? String(data.surgicalHistory) : undefined,
						per_smoking: data.per_smoking ? Boolean(data.per_smoking) : undefined,
						per_drinking: data.per_drinking ? Boolean(data.per_drinking) : undefined,
						per_alcohol: data.per_alcohol ? Boolean(data.per_alcohol) : undefined,
						per_drugs: data.per_drugs ? Boolean(data.per_drugs) : undefined,
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
						rom: data.rom as Record<string, any> | undefined,
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
						treatmentPlan: data.treatmentPlan as Array<{ therapy: string; frequency: string; remarks: string }> | undefined,
						followUpVisits: data.followUpVisits as Array<{ visitDate: string; painLevel: string; findings: string }> | undefined,
						currentPainStatus: data.currentPainStatus ? String(data.currentPainStatus) : undefined,
						currentRom: data.currentRom ? String(data.currentRom) : undefined,
						currentStrength: data.currentStrength ? String(data.currentStrength) : undefined,
						currentFunctionalAbility: data.currentFunctionalAbility ? String(data.currentFunctionalAbility) : undefined,
						complianceWithHEP: data.complianceWithHEP ? String(data.complianceWithHEP) : undefined,
						recommendations: data.recommendations ? String(data.recommendations) : undefined,
						physiotherapistRemarks: data.physiotherapistRemarks ? String(data.physiotherapistRemarks) : undefined,
						built: data.built ? String(data.built) : undefined,
						posture: data.posture ? String(data.posture) : undefined,
						gaitAnalysis: data.gaitAnalysis ? String(data.gaitAnalysis) : undefined,
						mobilityAids: data.mobilityAids ? String(data.mobilityAids) : undefined,
						localObservation: data.localObservation ? String(data.localObservation) : undefined,
						swelling: data.swelling ? String(data.swelling) : undefined,
						muscleWasting: data.muscleWasting ? String(data.muscleWasting) : undefined,
						postureManualNotes: data.postureManualNotes ? String(data.postureManualNotes) : undefined,
						postureFileName: data.postureFileName ? String(data.postureFileName) : undefined,
						postureFileData: data.postureFileData ? String(data.postureFileData) : undefined,
						gaitManualNotes: data.gaitManualNotes ? String(data.gaitManualNotes) : undefined,
						gaitFileName: data.gaitFileName ? String(data.gaitFileName) : undefined,
						gaitFileData: data.gaitFileData ? String(data.gaitFileData) : undefined,
						tenderness: data.tenderness ? String(data.tenderness) : undefined,
						warmth: data.warmth ? String(data.warmth) : undefined,
						scar: data.scar ? String(data.scar) : undefined,
						crepitus: data.crepitus ? String(data.crepitus) : undefined,
						odema: data.odema ? String(data.odema) : undefined,
						mmt: data.mmt as Record<string, any> | undefined,
						specialTest: data.specialTest ? String(data.specialTest) : undefined,
						differentialDiagnosis: data.differentialDiagnosis ? String(data.differentialDiagnosis) : undefined,
						finalDiagnosis: data.finalDiagnosis ? String(data.finalDiagnosis) : undefined,
						shortTermGoals: data.shortTermGoals ? String(data.shortTermGoals) : undefined,
						longTermGoals: data.longTermGoals ? String(data.longTermGoals) : undefined,
						rehabProtocol: data.rehabProtocol ? String(data.rehabProtocol) : undefined,
						advice: data.advice ? String(data.advice) : undefined,
						managementRemarks: data.managementRemarks ? String(data.managementRemarks) : undefined,
						nextFollowUpDate: data.nextFollowUpDate ? String(data.nextFollowUpDate) : undefined,
						nextFollowUpTime: data.nextFollowUpTime ? String(data.nextFollowUpTime) : undefined,
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

	const selectedPatient = useMemo(() => {
		if (!selectedPatientId) return null;
		return patients.find(p => p.patientId === selectedPatientId) || null;
	}, [patients, selectedPatientId]);

	const handleView = (patientId: string) => {
		setSelectedPatientId(patientId);
		setShowModal(true);
		setSavedMessage(false);
	};

	const handleDelete = (patientId: string) => {
		if (window.confirm('Are you sure you want to delete this report? This will remove all report data for this patient.')) {
			// Note: In a real app, you might want to mark as deleted rather than actually deleting
			// For now, we'll just remove it from the view by filtering
			// In production, you'd use updateDoc to set a deleted flag or actually delete the document
			console.warn('Delete functionality should be implemented with proper Firestore delete or soft delete');
		}
	};

	const handlePrint = async () => {
		if (!selectedPatient) return;

		const age = selectedPatient.dob ? new Date().getFullYear() - new Date(selectedPatient.dob).getFullYear() : undefined;
		await generatePhysiotherapyReportPDF({
			patientName: selectedPatient.name,
			patientId: selectedPatient.patientId,
			referredBy: selectedPatient.assignedDoctor || selectedPatient.referredBy || '',
			age: age ? String(age) : '',
			gender: '',
			dateOfConsultation: selectedPatient.dateOfConsultation || new Date().toISOString().split('T')[0],
			contact: '',
			email: '',
			complaints: selectedPatient.complaints || '',
			presentHistory: selectedPatient.presentHistory || '',
			pastHistory: selectedPatient.pastHistory || '',
			surgicalHistory: selectedPatient.surgicalHistory || '',
			medicalHistory: getMedicalHistoryText(selectedPatient),
			sleepCycle: selectedPatient.sleepCycle || '',
			hydration: selectedPatient.hydration || '4',
			nutrition: selectedPatient.nutrition || '',
			chiefComplaint: selectedPatient.chiefComplaint || selectedPatient.complaints || '',
			onsetType: selectedPatient.onsetType || '',
			duration: selectedPatient.duration || '',
			mechanismOfInjury: selectedPatient.mechanismOfInjury || '',
			painType: selectedPatient.painType || selectedPatient.typeOfPain || '',
			painIntensity: selectedPatient.painIntensity || selectedPatient.vasScale || '',
			aggravatingFactor: selectedPatient.aggravatingFactor || '',
			relievingFactor: selectedPatient.relievingFactor || '',
			siteSide: selectedPatient.siteSide || '',
			onset: selectedPatient.onset || '',
			natureOfInjury: selectedPatient.natureOfInjury || '',
			typeOfPain: selectedPatient.typeOfPain || '',
			vasScale: selectedPatient.vasScale || '5',
			rom: selectedPatient.rom || {},
			mmt: selectedPatient.mmt || {},
			built: selectedPatient.built || '',
			posture: selectedPatient.posture || '',
			postureManualNotes: selectedPatient.postureManualNotes || '',
			postureFileName: selectedPatient.postureFileName || '',
			gaitAnalysis: selectedPatient.gaitAnalysis || '',
			gaitManualNotes: selectedPatient.gaitManualNotes || '',
			gaitFileName: selectedPatient.gaitFileName || '',
			mobilityAids: selectedPatient.mobilityAids || '',
			localObservation: selectedPatient.localObservation || '',
			swelling: selectedPatient.swelling || '',
			muscleWasting: selectedPatient.muscleWasting || '',
			tenderness: selectedPatient.tenderness || '',
			warmth: selectedPatient.warmth || '',
			scar: selectedPatient.scar || '',
			crepitus: selectedPatient.crepitus || '',
			odema: selectedPatient.odema || '',
			specialTest: selectedPatient.specialTest || '',
			differentialDiagnosis: selectedPatient.differentialDiagnosis || '',
			finalDiagnosis: selectedPatient.finalDiagnosis || '',
			shortTermGoals: selectedPatient.shortTermGoals || '',
			longTermGoals: selectedPatient.longTermGoals || '',
			rehabProtocol: selectedPatient.rehabProtocol || '',
			advice: selectedPatient.advice || '',
			managementRemarks: selectedPatient.managementRemarks || '',
			nextFollowUpDate: selectedPatient.nextFollowUpDate || '',
			nextFollowUpTime: selectedPatient.nextFollowUpTime || '',
			followUpVisits: selectedPatient.followUpVisits || [],
			currentPainStatus: selectedPatient.currentPainStatus || '',
			currentRom: selectedPatient.currentRom || '',
			currentStrength: selectedPatient.currentStrength || '',
			currentFunctionalAbility: selectedPatient.currentFunctionalAbility || '',
			complianceWithHEP: selectedPatient.complianceWithHEP || '',
			physioName: selectedPatient.physioName || '',
			physioRegNo: selectedPatient.physioId || '',
		});
		// Note: The PDF will be downloaded. Users can open it and print from their PDF viewer.
	};

	function renderRomPrintTable(joint: string, data: any): string {
		let html = `<h5>${joint}</h5><table style="border-collapse:collapse;width:95%;margin-bottom:15px;" border="1"><thead>`;
		if (!ROM_HAS_SIDE[joint]) {
			html += '<tr><th>Motion</th><th>Value</th></tr></thead><tbody>';
			ROM_MOTIONS[joint].forEach(({ motion }) => {
				const val = data[motion];
				if (val) html += `<tr><td>${motion}</td><td>${val}</td></tr>`;
			});
			html += '</tbody>';
		} else {
			html += '<tr><th colspan="2">Left</th><th colspan="2">Right</th></tr>';
			html += '<tr><th>Motion</th><th>Value</th><th>Motion</th><th>Value</th></tr></thead><tbody>';
			ROM_MOTIONS[joint].forEach(({ motion }) => {
				const left = data.left?.[motion] || '';
				const right = data.right?.[motion] || '';
				if (left || right) html += `<tr><td>${motion}</td><td>${left}</td><td>${motion}</td><td>${right}</td></tr>`;
			});
			html += '</tbody>';
		}
		html += '</table>';
		return html;
	}

	function renderRomView(romData: Record<string, any> | undefined) {
		if (!romData || !Object.keys(romData).length) {
			return <p className="text-sm italic text-slate-500">No ROM joints recorded.</p>;
		}

		return (
			<div className="space-y-4">
				{Object.keys(romData).map(joint => (
					<div key={joint} className="rounded-lg border border-slate-200 bg-slate-50 p-4">
						<h6 className="mb-3 text-sm font-semibold text-sky-600">{joint}</h6>
						{renderRomTable(joint, romData[joint])}
					</div>
				))}
			</div>
		);
	}

	function renderRomTable(joint: string, data: any) {
		if (!ROM_HAS_SIDE[joint]) {
			return (
				<table className="min-w-full divide-y divide-slate-200 border border-slate-300 text-left text-sm">
					<thead className="bg-slate-100">
						<tr>
							<th className="px-3 py-2 font-semibold text-slate-700">Motion</th>
							<th className="px-3 py-2 font-semibold text-slate-700">Value</th>
						</tr>
					</thead>
					<tbody className="divide-y divide-slate-200 bg-white">
						{ROM_MOTIONS[joint].map(({ motion }) => {
							const val = data[motion];
							if (!val) return null;
							return (
								<tr key={motion}>
									<td className="px-3 py-2 text-slate-700">{motion}</td>
									<td className="px-3 py-2 font-medium text-slate-900">{val}</td>
								</tr>
							);
						})}
					</tbody>
				</table>
			);
		}

		return (
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
					{ROM_MOTIONS[joint].map(({ motion }) => {
						const lv = data.left?.[motion] || '';
						const rv = data.right?.[motion] || '';
						if (!lv && !rv) return null;
						return (
							<tr key={motion}>
								<td className="px-3 py-2 text-slate-700">{motion}</td>
								<td className="px-3 py-2 font-medium text-slate-900">{lv}</td>
								<td className="px-3 py-2 text-slate-700">{motion}</td>
								<td className="px-3 py-2 font-medium text-slate-900">{rv}</td>
							</tr>
						);
					})}
				</tbody>
			</table>
		);
	}

	const handleDownloadPDF = async (patient: PatientRecord) => {
		const age = patient.dob ? new Date().getFullYear() - new Date(patient.dob).getFullYear() : undefined;
		await generatePhysiotherapyReportPDF({
			patientName: patient.name,
			patientId: patient.patientId,
			referredBy: patient.assignedDoctor || patient.referredBy || '',
			age: age ? String(age) : '',
			gender: '',
			dateOfConsultation: patient.dateOfConsultation || new Date().toISOString().split('T')[0],
			contact: '',
			email: '',
			complaints: patient.complaints || '',
			presentHistory: patient.presentHistory || '',
			pastHistory: patient.pastHistory || '',
			surgicalHistory: patient.surgicalHistory || '',
			medicalHistory: getMedicalHistoryText(patient),
			sleepCycle: patient.sleepCycle || '',
			hydration: patient.hydration || '4',
			nutrition: patient.nutrition || '',
			chiefComplaint: patient.chiefComplaint || patient.complaints || '',
			onsetType: patient.onsetType || '',
			duration: patient.duration || '',
			mechanismOfInjury: patient.mechanismOfInjury || '',
			painType: patient.painType || patient.typeOfPain || '',
			painIntensity: patient.painIntensity || patient.vasScale || '',
			aggravatingFactor: patient.aggravatingFactor || '',
			relievingFactor: patient.relievingFactor || '',
			siteSide: patient.siteSide || '',
			onset: patient.onset || '',
			natureOfInjury: patient.natureOfInjury || '',
			typeOfPain: patient.typeOfPain || '',
			vasScale: patient.vasScale || '5',
			rom: patient.rom || {},
			mmt: patient.mmt || {},
			built: patient.built || '',
			posture: patient.posture || '',
			postureManualNotes: patient.postureManualNotes || '',
			postureFileName: patient.postureFileName || '',
			gaitAnalysis: patient.gaitAnalysis || '',
			gaitManualNotes: patient.gaitManualNotes || '',
			gaitFileName: patient.gaitFileName || '',
			mobilityAids: patient.mobilityAids || '',
			localObservation: patient.localObservation || '',
			swelling: patient.swelling || '',
			muscleWasting: patient.muscleWasting || '',
			tenderness: patient.tenderness || '',
			warmth: patient.warmth || '',
			scar: patient.scar || '',
			crepitus: patient.crepitus || '',
			odema: patient.odema || '',
			specialTest: patient.specialTest || '',
			differentialDiagnosis: patient.differentialDiagnosis || '',
			finalDiagnosis: patient.finalDiagnosis || '',
			shortTermGoals: patient.shortTermGoals || '',
			longTermGoals: patient.longTermGoals || '',
			rehabProtocol: patient.rehabProtocol || '',
			advice: patient.advice || '',
			managementRemarks: patient.managementRemarks || '',
			nextFollowUpDate: patient.nextFollowUpDate || '',
			nextFollowUpTime: patient.nextFollowUpTime || '',
			followUpVisits: patient.followUpVisits || [],
			currentPainStatus: patient.currentPainStatus || '',
			currentRom: patient.currentRom || '',
			currentStrength: patient.currentStrength || '',
			currentFunctionalAbility: patient.currentFunctionalAbility || '',
			complianceWithHEP: patient.complianceWithHEP || '',
			physioName: patient.physioName || '',
			physioRegNo: patient.physioId || '',
		});
	};

	return (
		<div className="min-h-svh bg-slate-50 px-6 py-10">
			<div className="mx-auto max-w-6xl space-y-10">
				<PageHeader
					badge="Front Desk"
					title="Patient Reports"
					description="View and manage comprehensive physiotherapy reports with ROM assessments for all registered patients."
				/>

				<div className="border-t border-slate-200" />

				<section className="section-card">
				{loading ? (
					<div className="py-12 text-center text-sm text-slate-500">
						<div className="loading-spinner" aria-hidden="true" />
						<span className="ml-3 align-middle">Loading reports…</span>
					</div>
				) : patients.length === 0 ? (
					<div className="py-12 text-center text-sm text-slate-500">
						<p className="font-medium text-slate-700">No patient reports found.</p>
						<p className="mt-1">Register patients to start generating reports.</p>
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
								{patients.map(patient => (
									<tr key={patient.id || patient.patientId}>
										<td className="px-4 py-4 text-sm font-medium text-slate-800">{patient.patientId || '—'}</td>
										<td className="px-4 py-4 text-sm text-slate-700">{patient.name || 'Unnamed'}</td>
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
												{patient.status || 'pending'}
											</span>
										</td>
										<td className="px-4 py-4 text-sm text-slate-600">{patient.assignedDoctor || 'Unassigned'}</td>
										<td className="px-4 py-4 text-right">
											<div className="inline-flex items-center gap-2">
												<button
													type="button"
													onClick={() => handleView(patient.patientId)}
													className="inline-flex items-center rounded-lg border border-sky-200 px-3 py-1.5 text-xs font-semibold text-sky-700 transition hover:border-sky-300 hover:text-sky-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-200"
												>
													View
												</button>
												<button
													type="button"
													onClick={() => handleDelete(patient.patientId)}
													className="inline-flex items-center rounded-lg border border-rose-200 px-3 py-1.5 text-xs font-semibold text-rose-600 transition hover:border-rose-300 hover:text-rose-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-200"
												>
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
			</section>

			{/* Report Modal */}
			{showModal && selectedPatient && (
				<div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 px-4 py-6">
					<div className="flex w-full max-w-5xl max-h-[90vh] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
						<header className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
							<h2 className="text-lg font-semibold text-slate-900">Physiotherapy Clinic Patient Report</h2>
							<button
								type="button"
								onClick={() => setShowModal(false)}
								className="rounded-full p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 focus-visible:outline-none"
								aria-label="Close"
							>
								<i className="fas fa-times" aria-hidden="true" />
							</button>
						</header>
						<div className="flex-1 overflow-y-auto px-6 py-6">
							<div className="section-card">
								<div className="mb-6 flex items-start justify-between border-b border-slate-200 pb-4">
									<h3 className="text-xl font-bold text-sky-600">Physiotherapy Report</h3>
									<div className="text-right text-sm text-slate-600">
										<div>
											<b>Clinic:</b> Centre For Sports Science, Kanteerava Stadium
										</div>
										<div>
											<b>Date:</b> {new Date().toLocaleDateString()}
										</div>
									</div>
								</div>

								<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
									<div>
										<label className="block text-xs font-medium text-slate-500">Patient Name</label>
										<input
											type="text"
											value={selectedPatient.name || ''}
											readOnly
											className="mt-1 w-full rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800"
										/>
									</div>
									<div>
										<label className="block text-xs font-medium text-slate-500">Patient ID</label>
										<input
											type="text"
											value={selectedPatient.patientId || ''}
											readOnly
											className="mt-1 w-full rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800"
										/>
									</div>
									<div>
										<label className="block text-xs font-medium text-slate-500">Date of Birth</label>
										<input
											type="date"
											value={selectedPatient.dob || ''}
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

								<div className="mt-6">
									<p className="text-sm font-semibold text-sky-600">Assessment</p>
									<div className="mt-4 grid gap-4 sm:grid-cols-2">
										<div>
											<label className="block text-xs font-medium text-slate-500">Complaints</label>
											<input
												type="text"
												value={selectedPatient.complaints || ''}
												readOnly
												className="mt-1 w-full rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800"
											/>
										</div>
										<div>
											<label className="block text-xs font-medium text-slate-500">Present History</label>
											<input
												type="text"
												value={selectedPatient.presentHistory || ''}
												readOnly
												className="mt-1 w-full rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800"
											/>
										</div>
										<div>
											<label className="block text-xs font-medium text-slate-500">Past History</label>
											<input
												type="text"
												value={selectedPatient.pastHistory || ''}
												readOnly
												className="mt-1 w-full rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800"
											/>
										</div>
										<div>
											<label className="block text-xs font-medium text-slate-500">Medical History</label>
											<input
												type="text"
												value={getMedicalHistoryText(selectedPatient)}
												readOnly
												className="mt-1 w-full rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800"
											/>
										</div>
										<div>
											<label className="block text-xs font-medium text-slate-500">Surgical History</label>
											<input
												type="text"
												value={selectedPatient.surgicalHistory || ''}
												readOnly
												className="mt-1 w-full rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800"
											/>
										</div>
										<div>
											<label className="block text-xs font-medium text-slate-500">Personal History</label>
											<input
												type="text"
												value={getPersonalHistoryText(selectedPatient)}
												readOnly
												className="mt-1 w-full rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800"
											/>
										</div>
										<div>
											<label className="block text-xs font-medium text-slate-500">Sleep Cycle</label>
											<input
												type="text"
												value={selectedPatient.sleepCycle || ''}
												readOnly
												className="mt-1 w-full rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800"
											/>
										</div>
										<div>
											<label className="block text-xs font-medium text-slate-500">Hydration</label>
											<input
												type="text"
												value={selectedPatient.hydration || ''}
												readOnly
												className="mt-1 w-full rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800"
											/>
										</div>
										<div>
											<label className="block text-xs font-medium text-slate-500">Nutrition</label>
											<input
												type="text"
												value={selectedPatient.nutrition || ''}
												readOnly
												className="mt-1 w-full rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800"
											/>
										</div>
									</div>
								</div>

								{/* Pain Assessment */}
								<div className="mt-6">
									<h4 className="mb-4 text-base font-semibold text-sky-600">Pain Assessment</h4>
									<div className="grid gap-4 sm:grid-cols-2">
										<div>
											<label className="block text-xs font-medium text-slate-500">Site and Side</label>
											<input
												type="text"
												value={selectedPatient.siteSide || ''}
												readOnly
												className="mt-1 w-full rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800"
											/>
										</div>
										<div>
											<label className="block text-xs font-medium text-slate-500">Onset</label>
											<input
												type="text"
												value={selectedPatient.onset || ''}
												readOnly
												className="mt-1 w-full rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800"
											/>
										</div>
										<div>
											<label className="block text-xs font-medium text-slate-500">Duration</label>
											<input
												type="text"
												value={selectedPatient.duration || ''}
												readOnly
												className="mt-1 w-full rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800"
											/>
										</div>
										<div>
											<label className="block text-xs font-medium text-slate-500">Nature of Injury</label>
											<input
												type="text"
												value={selectedPatient.natureOfInjury || ''}
												readOnly
												className="mt-1 w-full rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800"
											/>
										</div>
										<div>
											<label className="block text-xs font-medium text-slate-500">Type of Pain</label>
											<input
												type="text"
												value={selectedPatient.typeOfPain || ''}
												readOnly
												className="mt-1 w-full rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800"
											/>
										</div>
										<div>
											<label className="block text-xs font-medium text-slate-500">VAS Scale</label>
											<input
												type="text"
												value={selectedPatient.vasScale || ''}
												readOnly
												className="mt-1 w-full rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800"
											/>
										</div>
										<div>
											<label className="block text-xs font-medium text-slate-500">Aggravating Factor</label>
											<input
												type="text"
												value={selectedPatient.aggravatingFactor || ''}
												readOnly
												className="mt-1 w-full rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800"
											/>
										</div>
										<div>
											<label className="block text-xs font-medium text-slate-500">Relieving Factor</label>
											<input
												type="text"
												value={selectedPatient.relievingFactor || ''}
												readOnly
												className="mt-1 w-full rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800"
											/>
										</div>
									</div>
								</div>

								{/* On Observation */}
								<div className="mt-6">
									<h4 className="mb-4 text-base font-semibold text-sky-600">On Observation</h4>
									<div className="grid gap-4 sm:grid-cols-2">
										<div>
											<label className="block text-xs font-medium text-slate-500">Built</label>
											<input
												type="text"
												value={selectedPatient.built || ''}
												readOnly
												className="mt-1 w-full rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800"
											/>
										</div>
										<div>
											<label className="block text-xs font-medium text-slate-500">Posture</label>
											<div className="mt-1">
												<input
													type="text"
													value={selectedPatient.posture || ''}
													readOnly
													className="mb-2 w-full rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800"
												/>
												{selectedPatient.posture === 'Manual' && selectedPatient.postureManualNotes && (
													<textarea
														value={selectedPatient.postureManualNotes}
														readOnly
														rows={2}
														className="w-full rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800"
													/>
												)}
												{selectedPatient.posture === 'Kinetisense' && selectedPatient.postureFileName && selectedPatient.postureFileData && (
													<div className="flex items-center gap-2">
														<span className="text-xs text-slate-600">{selectedPatient.postureFileName}</span>
														<button
															type="button"
															onClick={() => {
																if (selectedPatient.postureFileData) {
																	const viewWindow = window.open();
																	if (viewWindow) {
																		viewWindow.document.write(`
																			<html>
																				<head>
																					<title>${selectedPatient.postureFileName}</title>
																					<style>
																						body { margin: 0; padding: 0; }
																						iframe { width: 100%; height: 100vh; border: none; }
																					</style>
																				</head>
																				<body>
																					<iframe src="${selectedPatient.postureFileData}"></iframe>
																				</body>
																			</html>
																		`);
																		viewWindow.document.close();
																	}
																}
															}}
															className="inline-flex items-center gap-1 rounded-md bg-sky-100 px-2 py-1 text-xs font-semibold text-sky-700 transition hover:bg-sky-200"
														>
															<i className="fas fa-eye" />
															View PDF
														</button>
													</div>
												)}
											</div>
										</div>
										<div>
											<label className="block text-xs font-medium text-slate-500">GAIT Analysis</label>
											<div className="mt-1">
												<input
													type="text"
													value={selectedPatient.gaitAnalysis || ''}
													readOnly
													className="mb-2 w-full rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800"
												/>
												{selectedPatient.gaitAnalysis === 'Manual' && selectedPatient.gaitManualNotes && (
													<textarea
														value={selectedPatient.gaitManualNotes}
														readOnly
														rows={2}
														className="w-full rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800"
													/>
												)}
												{selectedPatient.gaitAnalysis === 'OptaGAIT' && selectedPatient.gaitFileName && selectedPatient.gaitFileData && (
													<div className="flex items-center gap-2">
														<span className="text-xs text-slate-600">{selectedPatient.gaitFileName}</span>
														<button
															type="button"
															onClick={() => {
																if (selectedPatient.gaitFileData) {
																	const viewWindow = window.open();
																	if (viewWindow) {
																		viewWindow.document.write(`
																			<html>
																				<head>
																					<title>${selectedPatient.gaitFileName}</title>
																					<style>
																						body { margin: 0; padding: 0; }
																						iframe { width: 100%; height: 100vh; border: none; }
																					</style>
																				</head>
																				<body>
																					<iframe src="${selectedPatient.gaitFileData}"></iframe>
																				</body>
																			</html>
																		`);
																		viewWindow.document.close();
																	}
																}
															}}
															className="inline-flex items-center gap-1 rounded-md bg-sky-100 px-2 py-1 text-xs font-semibold text-sky-700 transition hover:bg-sky-200"
														>
															<i className="fas fa-eye" />
															View PDF
														</button>
													</div>
												)}
											</div>
										</div>
										<div>
											<label className="block text-xs font-medium text-slate-500">Mobility Aids</label>
											<input
												type="text"
												value={selectedPatient.mobilityAids || ''}
												readOnly
												className="mt-1 w-full rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800"
											/>
										</div>
										<div>
											<label className="block text-xs font-medium text-slate-500">Local Observation</label>
											<textarea
												value={selectedPatient.localObservation || ''}
												readOnly
												rows={2}
												className="mt-1 w-full rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800"
											/>
										</div>
										<div>
											<label className="block text-xs font-medium text-slate-500">Swelling</label>
											<input
												type="text"
												value={selectedPatient.swelling || ''}
												readOnly
												className="mt-1 w-full rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800"
											/>
										</div>
										<div>
											<label className="block text-xs font-medium text-slate-500">Muscle Wasting</label>
											<input
												type="text"
												value={selectedPatient.muscleWasting || ''}
												readOnly
												className="mt-1 w-full rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800"
											/>
										</div>
									</div>
								</div>

								{/* On Palpation */}
								<div className="mt-6">
									<h4 className="mb-4 text-base font-semibold text-sky-600">On Palpation</h4>
									<div className="grid gap-4 sm:grid-cols-2">
										<div>
											<label className="block text-xs font-medium text-slate-500">Tenderness</label>
											<input
												type="text"
												value={selectedPatient.tenderness || ''}
												readOnly
												className="mt-1 w-full rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800"
											/>
										</div>
										<div>
											<label className="block text-xs font-medium text-slate-500">Warmth</label>
											<input
												type="text"
												value={selectedPatient.warmth || ''}
												readOnly
												className="mt-1 w-full rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800"
											/>
										</div>
										<div>
											<label className="block text-xs font-medium text-slate-500">Scar</label>
											<input
												type="text"
												value={selectedPatient.scar || ''}
												readOnly
												className="mt-1 w-full rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800"
											/>
										</div>
										<div>
											<label className="block text-xs font-medium text-slate-500">Crepitus</label>
											<input
												type="text"
												value={selectedPatient.crepitus || ''}
												readOnly
												className="mt-1 w-full rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800"
											/>
										</div>
										<div>
											<label className="block text-xs font-medium text-slate-500">Odema</label>
											<input
												type="text"
												value={selectedPatient.odema || ''}
												readOnly
												className="mt-1 w-full rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800"
											/>
										</div>
									</div>
								</div>

								<div className="mt-6">
									<p className="text-sm font-semibold text-sky-600">Range of Motion (ROM) Assessed</p>
									<div className="mt-4">{renderRomView(selectedPatient.rom)}</div>
								</div>

								<div className="mt-6">
									<p className="text-sm font-semibold text-sky-600">Treatment Provided</p>
									<textarea
										value={selectedPatient.treatmentProvided || ''}
										readOnly
										rows={3}
										className="mt-2 w-full rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800"
									/>
								</div>

								<div className="mt-6">
									<p className="text-sm font-semibold text-sky-600">Progress Notes</p>
									<textarea
										value={selectedPatient.progressNotes || ''}
										readOnly
										rows={3}
										className="mt-2 w-full rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800"
									/>
								</div>

								<div className="mt-6 grid gap-4 sm:grid-cols-2">
									<div>
										<label className="block text-xs font-medium text-slate-500">Physio Name</label>
										<input
											type="text"
											value={selectedPatient.physioName || ''}
											readOnly
											className="mt-1 w-full rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800"
										/>
									</div>
									<div>
										<label className="block text-xs font-medium text-slate-500">Signature / ID</label>
										<input
											type="text"
											value={selectedPatient.physioId || ''}
											readOnly
											className="mt-1 w-full rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800"
										/>
									</div>
								</div>
							</div>
						</div>
						<footer className="flex items-center justify-end gap-3 border-t border-slate-200 px-6 py-4">
							<button
								type="button"
								onClick={() => selectedPatient && handleDownloadPDF(selectedPatient)}
								className="inline-flex items-center rounded-lg border border-sky-600 px-4 py-2 text-sm font-semibold text-sky-600 transition hover:bg-sky-50 focus-visible:outline-none"
							>
								<i className="fas fa-download mr-2" aria-hidden="true" />
								Download PDF
							</button>
							<button
								type="button"
								onClick={handlePrint}
								className="inline-flex items-center rounded-lg border border-sky-600 px-4 py-2 text-sm font-semibold text-sky-600 transition hover:bg-sky-50 focus-visible:outline-none"
							>
								<i className="fas fa-print mr-2" aria-hidden="true" />
								Print Report
							</button>
							<button
								type="button"
								onClick={() => setShowModal(false)}
								className="inline-flex items-center rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition hover:border-slate-300 hover:text-slate-800 focus-visible:outline-none"
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
