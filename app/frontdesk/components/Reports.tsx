'use client';

import { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot, type QuerySnapshot, type Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import PageHeader from '@/components/PageHeader';

interface PatientRecord {
	patientId: string;
	name: string;
	dob: string;
	assignedDoctor?: string;
	status?: string;
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

	const handlePrint = () => {
		if (!selectedPatient) return;

		let romPrintHtml = '';
		if (selectedPatient.rom && Object.keys(selectedPatient.rom).length) {
			romPrintHtml += '<h4 style="margin-top:18px;">Range of Motion (ROM) Assessed</h4>';
			Object.keys(selectedPatient.rom).forEach(joint => {
				romPrintHtml += renderRomPrintTable(joint, selectedPatient.rom![joint]);
			});
		}

		const today = new Date().toLocaleDateString();
		const printHtml = `
			<h2 style="margin-bottom:10px;">Physiotherapy Clinic Patient Report</h2>
			<div style="margin-bottom:12px;"><b>Clinic:</b> Centre For Sports Science, Kanteerava Stadium</div>
			<div style="margin-bottom:12px;"><b>Date:</b> ${today}</div>
			<table style="width:100%; margin-bottom:15px; font-size:1.1rem;" border="1" cellspacing="0" cellpadding="6">
				<tr><td><b>Patient Name:</b></td><td>${selectedPatient.name || 'N/A'}</td><td><b>Patient ID:</b></td><td>${selectedPatient.patientId || 'N/A'}</td></tr>
				<tr><td><b>Date of Birth:</b></td><td>${selectedPatient.dob || 'N/A'}</td><td><b>Assigned Doctor:</b></td><td>${selectedPatient.assignedDoctor || 'N/A'}</td></tr>
			</table>
			<h3>Assessment</h3>
			<table style="width:100%; margin-bottom:15px; font-size:1.05rem;" border="1" cellspacing="0" cellpadding="6">
				<tr><td><b>Complaints:</b></td><td>${selectedPatient.complaints || 'N/A'}</td></tr>
				<tr><td><b>Present History:</b></td><td>${selectedPatient.presentHistory || 'N/A'}</td></tr>
				<tr><td><b>Past History:</b></td><td>${selectedPatient.pastHistory || 'N/A'}</td></tr>
				<tr><td><b>Medical History:</b></td><td>${getMedicalHistoryText(selectedPatient)}</td></tr>
				<tr><td><b>Surgical History:</b></td><td>${selectedPatient.surgicalHistory || 'N/A'}</td></tr>
				<tr><td><b>Personal History:</b></td><td>${getPersonalHistoryText(selectedPatient)}</td></tr>
				<tr><td><b>Sleep Cycle:</b></td><td>${selectedPatient.sleepCycle || 'N/A'}</td></tr>
				<tr><td><b>Hydration:</b></td><td>${selectedPatient.hydration || 'N/A'}</td></tr>
				<tr><td><b>Nutrition:</b></td><td>${selectedPatient.nutrition || 'N/A'}</td></tr>
				<tr><td><b>Site and Side:</b></td><td>${selectedPatient.siteSide || 'N/A'}</td></tr>
				<tr><td><b>Onset:</b></td><td>${selectedPatient.onset || 'N/A'}</td></tr>
				<tr><td><b>Duration:</b></td><td>${selectedPatient.duration || 'N/A'}</td></tr>
				<tr><td><b>Nature of Injury:</b></td><td>${selectedPatient.natureOfInjury || 'N/A'}</td></tr>
				<tr><td><b>Type of Pain:</b></td><td>${selectedPatient.typeOfPain || 'N/A'}</td></tr>
				<tr><td><b>VAS Scale:</b></td><td>${selectedPatient.vasScale || 'N/A'}</td></tr>
				<tr><td><b>Aggravating Factor:</b></td><td>${selectedPatient.aggravatingFactor || 'N/A'}</td></tr>
				<tr><td><b>Relieving Factor:</b></td><td>${selectedPatient.relievingFactor || 'N/A'}</td></tr>
			</table>
			${romPrintHtml}
			<h3>Treatment Provided</h3>
			<div>${selectedPatient.treatmentProvided || 'N/A'}</div>
			<h3>Progress Notes</h3>
			<div>${selectedPatient.progressNotes || 'N/A'}</div>
			<h3>Physiotherapist</h3>
			<div>${selectedPatient.physioName || 'N/A'} (${selectedPatient.physioId || 'N/A'})</div>
		`;

		const printWindow = window.open('', '', 'width=800,height=900');
		if (!printWindow) return;
		printWindow.document.write(`
			<html>
				<head>
					<title>Print Report</title>
					<link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" rel="stylesheet"/>
					<style>
						body { font-family: Arial, sans-serif; padding: 20px; }
						h2, h3 { color: #0d6efd; }
						table { border-collapse: collapse; width: 100%; margin-bottom: 12px; }
						td, th { border: 1px solid #ddd; padding: 8px; }
						th { background-color: #e7f1ff; font-weight: bold; }
					</style>
				</head>
				<body>
					${printHtml}
				</body>
			</html>
		`);
		printWindow.document.close();
		printWindow.focus();
		printWindow.print();
		printWindow.close();
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

	return (
		<div className="min-h-svh bg-slate-50 px-6 py-10">
			<div className="mx-auto max-w-6xl space-y-10">
				<PageHeader
					badge="Front Desk"
					title="Patient Reports"
					description="View and manage comprehensive physiotherapy reports with ROM assessments for all registered patients."
				/>

				<div className="border-t border-slate-200" />

				<section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
				{loading ? (
					<div className="py-12 text-center text-sm text-slate-500">
						<div className="inline-flex h-8 w-8 items-center justify-center rounded-full border-2 border-slate-200 border-t-sky-500 animate-spin" aria-hidden="true" />
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
									<tr key={patient.patientId}>
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
					<div className="w-full max-w-5xl rounded-2xl border border-slate-200 bg-white shadow-2xl">
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
						<div className="max-h-[600px] overflow-y-auto px-6 py-6">
							<div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
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
							{savedMessage && (
								<span className="mr-auto text-sm font-medium text-emerald-600">
									<i className="fas fa-check mr-2" aria-hidden="true" />
									Saved!
								</span>
							)}
							<button
								type="button"
								onClick={handlePrint}
								className="inline-flex items-center rounded-lg border border-sky-600 px-4 py-2 text-sm font-semibold text-sky-600 transition hover:bg-sky-50 focus-visible:outline-none"
							>
								Print
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
