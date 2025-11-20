'use client';

import { useEffect, useState, useRef } from 'react';
import { collection, doc, query, where, getDocs, onSnapshot, orderBy, type Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { generatePhysiotherapyReportPDF, generateStrengthConditioningPDF, type StrengthConditioningData, type ReportSection } from '@/lib/pdfGenerator';
import type { PatientRecordFull } from '@/lib/types';

// ROM constants for report display
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

// Helper functions for report display
function getMedicalHistoryText(p: any): string {
	const items: string[] = [];
	if (p.med_xray) items.push('X RAYS');
	if (p.med_mri) items.push('MRI');
	if (p.med_report) items.push('Reports');
	if (p.med_ct) items.push('CT Scans');
	return items.join(', ') || 'N/A';
}

function getPersonalHistoryText(p: any): string {
	const items: string[] = [];
	if (p.per_smoking) items.push('Smoking');
	if (p.per_drinking) items.push('Drinking');
	if (p.per_alcohol) items.push('Alcohol');
	if (p.per_drugs) {
		items.push('Drugs: ' + (p.drugsText || ''));
	}
	return items.join(', ') || 'N/A';
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
					{ROM_MOTIONS[joint]?.map(({ motion }) => {
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
				{ROM_MOTIONS[joint]?.map(({ motion }) => {
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

function renderMmtView(mmtData: Record<string, any> | undefined) {
	if (!mmtData || !Object.keys(mmtData).length) {
		return <p className="text-sm italic text-slate-500">No MMT data recorded.</p>;
	}

	return (
		<div className="space-y-4">
			{Object.keys(mmtData).map((muscle) => {
				const muscleData = mmtData[muscle];
				if (!muscleData) return null;

				if (typeof muscleData === 'object' && muscleData !== null && (muscleData.left || muscleData.right)) {
					return (
						<div key={muscle} className="rounded-lg border border-slate-200 bg-slate-50 p-4">
							<h6 className="mb-3 text-sm font-semibold text-sky-600">{muscle}</h6>
							<div className="grid grid-cols-2 gap-4">
								<div>
									<p className="text-xs font-medium text-slate-500 mb-1">Left</p>
									<p className="text-sm text-slate-900">{muscleData.left || '—'}</p>
								</div>
								<div>
									<p className="text-xs font-medium text-slate-500 mb-1">Right</p>
									<p className="text-sm text-slate-900">{muscleData.right || '—'}</p>
								</div>
							</div>
						</div>
					);
				}

				return (
					<div key={muscle} className="rounded-lg border border-slate-200 bg-slate-50 p-4">
						<h6 className="mb-2 text-sm font-semibold text-sky-600">{muscle}</h6>
						<p className="text-sm text-slate-900">{String(muscleData) || '—'}</p>
					</div>
				);
			})}
		</div>
	);
}

interface EditReportModalProps {
	isOpen: boolean;
	patientId: string | null;
	initialTab?: 'report' | 'strength-conditioning';
	onClose: () => void;
}

export default function EditReportModal({ isOpen, patientId, initialTab = 'report', onClose }: EditReportModalProps) {
	const [activeReportTab, setActiveReportTab] = useState<'report' | 'strength-conditioning'>(initialTab);
	const [reportPatientData, setReportPatientData] = useState<any>(null);
	const [strengthConditioningData, setStrengthConditioningData] = useState<any>(null);
	const [loadingReport, setLoadingReport] = useState(false);
	const [loadingStrengthConditioning, setLoadingStrengthConditioning] = useState(false);
	const strengthConditioningUnsubscribeRef = useRef<(() => void) | null>(null);
	
	// Version history state
	const [showVersionHistory, setShowVersionHistory] = useState(false);
	const [versionHistory, setVersionHistory] = useState<Array<{
		id: string;
		version: number;
		createdAt: string;
		createdBy: string;
		data: Partial<PatientRecordFull>;
	}>>([]);
	const [loadingVersions, setLoadingVersions] = useState(false);
	const [viewingVersionData, setViewingVersionData] = useState<Partial<PatientRecordFull> | null>(null);
	const [expandedVersionId, setExpandedVersionId] = useState<string | null>(null);
	
	// Crisp report state
	const [showCrispReportModal, setShowCrispReportModal] = useState(false);
	const [selectedSections, setSelectedSections] = useState<ReportSection[]>([
		'patientInformation',
		'assessmentOverview',
		'painAssessment',
		'onObservation',
		'onPalpation',
		'rom',
		'mmt',
		'advancedAssessment',
		'physiotherapyManagement',
		'followUpVisits',
		'currentStatus',
		'nextFollowUp',
		'signature',
	]);

	// Reset state when modal closes
	useEffect(() => {
		if (!isOpen) {
			setReportPatientData(null);
			setStrengthConditioningData(null);
			setViewingVersionData(null);
			setActiveReportTab(initialTab);
			if (strengthConditioningUnsubscribeRef.current) {
				strengthConditioningUnsubscribeRef.current();
				strengthConditioningUnsubscribeRef.current = null;
			}
		}
	}, [isOpen, initialTab]);

	// Load data when modal opens
	useEffect(() => {
		if (!isOpen || !patientId) return;

		const loadData = async () => {
			setLoadingReport(true);
			setLoadingStrengthConditioning(true);
			setReportPatientData(null);
			setStrengthConditioningData(null);

			// Load regular report data
			try {
				const patientSnap = await getDocs(query(collection(db, 'patients'), where('patientId', '==', patientId)));
				if (!patientSnap.empty) {
					const patientData = patientSnap.docs[0].data();
					setReportPatientData(patientData);
				}
			} catch (error) {
				console.error('Failed to load patient report:', error);
			} finally {
				setLoadingReport(false);
			}

			// Load strength and conditioning report
			try {
				const patientSnap = await getDocs(query(collection(db, 'patients'), where('patientId', '==', patientId)));
				if (!patientSnap.empty) {
					const patientDoc = patientSnap.docs[0];
					const documentId = patientDoc.id || patientId;
					
					const reportRef = doc(db, 'strengthConditioningReports', documentId);
					const unsubscribe = onSnapshot(reportRef, (docSnap) => {
						if (docSnap.exists()) {
							setStrengthConditioningData(docSnap.data());
						} else {
							setStrengthConditioningData(null);
						}
						setLoadingStrengthConditioning(false);
					}, (error) => {
						console.error('Error loading strength and conditioning report:', error);
						setStrengthConditioningData(null);
						setLoadingStrengthConditioning(false);
					});
					
					strengthConditioningUnsubscribeRef.current = unsubscribe;
				}
			} catch (error) {
				console.error('Failed to load strength and conditioning report', error);
				setStrengthConditioningData(null);
				setLoadingStrengthConditioning(false);
			}
		};

		loadData();
	}, [isOpen, patientId]);

	// Handle PDF download for report
	// Helper function to build report data
	const buildReportData = () => {
		if (!reportPatientData) return null;
		
		const age = reportPatientData.dob ? new Date().getFullYear() - new Date(reportPatientData.dob).getFullYear() : undefined;
		return {
			patientName: reportPatientData.name,
			patientId: reportPatientData.patientId,
			referredBy: reportPatientData.assignedDoctor || reportPatientData.referredBy || '',
			age: age ? String(age) : '',
			gender: reportPatientData.gender || '',
			dateOfConsultation: reportPatientData.dateOfConsultation || new Date().toISOString().split('T')[0],
			contact: reportPatientData.phone || '',
			email: reportPatientData.email || '',
			totalSessionsRequired: reportPatientData.totalSessionsRequired,
			remainingSessions: reportPatientData.remainingSessions,
			complaints: reportPatientData.complaints || '',
			presentHistory: reportPatientData.presentHistory || '',
			pastHistory: reportPatientData.pastHistory || '',
			surgicalHistory: reportPatientData.surgicalHistory || '',
			medicalHistory: getMedicalHistoryText(reportPatientData),
			sleepCycle: reportPatientData.sleepCycle || '',
			hydration: reportPatientData.hydration || '4',
			nutrition: reportPatientData.nutrition || '',
			chiefComplaint: reportPatientData.chiefComplaint || reportPatientData.complaints || '',
			onsetType: reportPatientData.onsetType || '',
			duration: reportPatientData.duration || '',
			mechanismOfInjury: reportPatientData.mechanismOfInjury || '',
			painType: reportPatientData.painType || reportPatientData.typeOfPain || '',
			painIntensity: reportPatientData.painIntensity || reportPatientData.vasScale || '',
			aggravatingFactor: reportPatientData.aggravatingFactor || '',
			relievingFactor: reportPatientData.relievingFactor || '',
			siteSide: reportPatientData.siteSide || '',
			onset: reportPatientData.onset || '',
			natureOfInjury: reportPatientData.natureOfInjury || '',
			typeOfPain: reportPatientData.typeOfPain || '',
			vasScale: reportPatientData.vasScale || '5',
			rom: reportPatientData.rom || {},
			mmt: reportPatientData.mmt || {},
			built: reportPatientData.built || '',
			posture: reportPatientData.posture || '',
			postureManualNotes: reportPatientData.postureManualNotes || '',
			postureFileName: reportPatientData.postureFileName || '',
			gaitAnalysis: reportPatientData.gaitAnalysis || '',
			gaitManualNotes: reportPatientData.gaitManualNotes || '',
			gaitFileName: reportPatientData.gaitFileName || '',
			mobilityAids: reportPatientData.mobilityAids || '',
			localObservation: reportPatientData.localObservation || '',
			swelling: reportPatientData.swelling || '',
			muscleWasting: reportPatientData.muscleWasting || '',
			tenderness: reportPatientData.tenderness || '',
			warmth: reportPatientData.warmth || '',
			scar: reportPatientData.scar || '',
			crepitus: reportPatientData.crepitus || '',
			odema: reportPatientData.odema || '',
			specialTest: reportPatientData.specialTest || '',
			differentialDiagnosis: reportPatientData.differentialDiagnosis || '',
			finalDiagnosis: reportPatientData.finalDiagnosis || '',
			shortTermGoals: reportPatientData.shortTermGoals || '',
			longTermGoals: reportPatientData.longTermGoals || '',
			rehabProtocol: reportPatientData.rehabProtocol || '',
			advice: reportPatientData.advice || '',
			managementRemarks: reportPatientData.managementRemarks || '',
			nextFollowUpDate: reportPatientData.nextFollowUpDate || '',
			nextFollowUpTime: reportPatientData.nextFollowUpTime || '',
			followUpVisits: reportPatientData.followUpVisits || [],
			currentPainStatus: reportPatientData.currentPainStatus || '',
			currentRom: reportPatientData.currentRom || '',
			currentStrength: reportPatientData.currentStrength || '',
			currentFunctionalAbility: reportPatientData.currentFunctionalAbility || '',
			complianceWithHEP: reportPatientData.complianceWithHEP || '',
			physioName: reportPatientData.physioName || '',
			physioRegNo: reportPatientData.physioId || '',
			patientType: reportPatientData.patientType || '',
		};
	};

	const handleDownloadReportPDF = async (sections?: ReportSection[]) => {
		try {
			const reportData = buildReportData();
			if (!reportData) {
				alert('No patient data available. Please try again.');
				return;
			}
			await generatePhysiotherapyReportPDF(reportData, sections ? { sections } : undefined);
		} catch (error) {
			console.error('Error downloading PDF:', error);
			alert('Failed to download PDF. Please try again.');
		}
	};

	// Handle PDF download for strength and conditioning
	const handleDownloadStrengthConditioningPDF = async () => {
		try {
			if (!reportPatientData || !strengthConditioningData) {
				alert('No patient or strength conditioning data available. Please try again.');
				return;
			}
			
			await generateStrengthConditioningPDF({
				patient: {
					name: reportPatientData.name,
					patientId: reportPatientData.patientId,
					dob: reportPatientData.dob || '',
					gender: reportPatientData.gender || '',
					phone: reportPatientData.phone || '',
					email: reportPatientData.email || '',
				},
				formData: strengthConditioningData as StrengthConditioningData,
			});
		} catch (error) {
			console.error('Error downloading PDF:', error);
			alert('Failed to download PDF. Please try again.');
		}
	};

	// Handle print - generates and prints the same PDF that gets downloaded
	const handlePrintReport = async (sections?: ReportSection[]) => {
		try {
			if (activeReportTab === 'report') {
				const reportData = buildReportData();
				if (!reportData) {
					alert('No patient data available. Please try again.');
					return;
				}
				
				// Generate PDF and open print window
				await generatePhysiotherapyReportPDF(reportData, { forPrint: true, sections });
			} else if (activeReportTab === 'strength-conditioning') {
				if (!reportPatientData || !strengthConditioningData) {
					alert('No patient or strength conditioning data available. Please try again.');
					return;
				}
				
				await generateStrengthConditioningPDF({
					patient: {
						name: reportPatientData.name,
						patientId: reportPatientData.patientId,
						dob: reportPatientData.dob || '',
						gender: reportPatientData.gender || '',
						phone: reportPatientData.phone || '',
						email: reportPatientData.email || '',
					},
					formData: strengthConditioningData as StrengthConditioningData,
				}, { forPrint: true });
			}
		} catch (error) {
			console.error('Error printing PDF:', error);
			alert('Failed to print PDF. Please try again.');
		}
	};

	// Load version history
	const loadVersionHistory = async () => {
		if (!patientId || !reportPatientData?.patientId) return;

		setLoadingVersions(true);
		try {
			const versionsQuery = query(
				collection(db, 'reportVersions'),
				where('patientId', '==', reportPatientData.patientId),
				orderBy('version', 'desc')
			);
			const versionsSnapshot = await getDocs(versionsQuery);
			const versions = versionsSnapshot.docs.map(doc => {
				const data = doc.data();
				const createdAt = (data.createdAt as Timestamp | undefined)?.toDate?.();
				return {
					id: doc.id,
					version: data.version as number,
					createdAt: createdAt ? createdAt.toISOString() : new Date().toISOString(),
					createdBy: (data.createdBy as string) || 'Unknown',
					data: (data.reportData as Partial<PatientRecordFull>) || {},
				};
			});
			setVersionHistory(versions);
		} catch (error) {
			console.error('Failed to load report history', error);
			alert('Failed to load report history. Please try again.');
		} finally {
			setLoadingVersions(false);
		}
	};

	// Handle view version history
	const handleViewVersionHistory = async () => {
		setShowVersionHistory(true);
		setViewingVersionData(null);
		await loadVersionHistory();
	};

	// Toggle expanded version
	const toggleVersionExpansion = (versionId: string) => {
		setExpandedVersionId(expandedVersionId === versionId ? null : versionId);
	};

	// Crisp report handlers
	const handleCrispReport = () => {
		setShowCrispReportModal(true);
	};

	const handleCrispReportPrint = async () => {
		setShowCrispReportModal(false);
		await handlePrintReport(selectedSections);
	};

	const handleCrispReportDownload = async () => {
		if (!reportPatientData) return;
		setShowCrispReportModal(false);
		await handleDownloadReportPDF(selectedSections);
	};

	const allSections: Array<{ key: ReportSection; label: string }> = [
		{ key: 'patientInformation', label: 'Patient Information' },
		{ key: 'assessmentOverview', label: 'Assessment Overview' },
		{ key: 'painAssessment', label: 'Pain Assessment' },
		{ key: 'onObservation', label: 'On Observation' },
		{ key: 'onPalpation', label: 'On Palpation' },
		{ key: 'rom', label: 'ROM (Range of Motion)' },
		{ key: 'mmt', label: 'Manual Muscle Testing' },
		{ key: 'advancedAssessment', label: 'Advanced Assessment' },
		{ key: 'physiotherapyManagement', label: 'Physiotherapy Management' },
		{ key: 'followUpVisits', label: 'Follow-Up Visits' },
		{ key: 'currentStatus', label: 'Current Status' },
		{ key: 'nextFollowUp', label: 'Next Follow-Up Details' },
		{ key: 'signature', label: 'Physiotherapist Signature' },
	];

	const toggleSection = (section: ReportSection) => {
		setSelectedSections(prev =>
			prev.includes(section)
				? prev.filter(s => s !== section)
				: [...prev, section]
		);
	};

	const handleClose = () => {
		setViewingVersionData(null);
		if (strengthConditioningUnsubscribeRef.current) {
			strengthConditioningUnsubscribeRef.current();
			strengthConditioningUnsubscribeRef.current = null;
		}
		onClose();
	};

	if (!isOpen || !patientId) return null;

	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 px-4 py-6">
			<div className="flex w-full max-w-5xl max-h-[90vh] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
				<header className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
					<h2 className="text-lg font-semibold text-slate-900">Edit Patient Report</h2>
					<button
						type="button"
						onClick={handleClose}
						className="rounded-full p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 focus-visible:outline-none"
						aria-label="Close"
					>
						<i className="fas fa-times" aria-hidden="true" />
					</button>
				</header>
				
				{/* Tab Navigation */}
				<div className="border-b border-slate-200 px-6">
					<nav className="flex gap-4" aria-label="Report tabs">
						<button
							type="button"
							onClick={() => setActiveReportTab('report')}
							className={`px-4 py-3 text-sm font-medium transition border-b-2 ${
								activeReportTab === 'report'
									? 'border-sky-600 text-sky-600'
									: 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
							}`}
						>
							<i className="fas fa-file-medical mr-2" aria-hidden="true" />
							Report
						</button>
						<button
							type="button"
							onClick={() => setActiveReportTab('strength-conditioning')}
							className={`px-4 py-3 text-sm font-medium transition border-b-2 ${
								activeReportTab === 'strength-conditioning'
									? 'border-sky-600 text-sky-600'
									: 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
							}`}
						>
							<i className="fas fa-dumbbell mr-2" aria-hidden="true" />
							Strength and Conditioning
						</button>
					</nav>
				</div>

				<div className="flex-1 overflow-y-auto px-6 py-6">
					{/* TODO: Add editable form fields here */}
					{loadingReport ? (
						<div className="text-center py-12">
							<div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-slate-900 border-r-transparent"></div>
							<p className="mt-4 text-sm text-slate-600">Loading report data...</p>
						</div>
					) : reportPatientData ? (
						<div className="text-center py-12">
							<p className="text-slate-600">Edit form will be implemented here.</p>
							<p className="text-sm text-slate-500 mt-2">Patient: {reportPatientData.name} ({reportPatientData.patientId})</p>
						</div>
					) : (
						<div className="text-center py-12">
							<p className="text-slate-600">No report data available for this patient.</p>
						</div>
					)}
				</div>
				
				{/* Footer */}
				<footer className="flex items-center justify-between border-t border-slate-200 px-6 py-4">
					{activeReportTab === 'report' && reportPatientData && (
						<button
							type="button"
							onClick={handleViewVersionHistory}
							className="inline-flex items-center rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-400 hover:bg-slate-50 focus-visible:outline-none"
						>
							<i className="fas fa-history mr-2" aria-hidden="true" />
							View Versions
						</button>
					)}
					<div className="flex items-center gap-3">
						{activeReportTab === 'report' && reportPatientData && (
							<>
								<button
									type="button"
									onClick={handleCrispReport}
									className="inline-flex items-center rounded-lg border border-slate-600 px-4 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 focus-visible:outline-none"
								>
									<i className="fas fa-file-alt mr-2" aria-hidden="true" />
									Crisp Report
								</button>
								<button
									type="button"
									onClick={() => handleDownloadReportPDF()}
									className="inline-flex items-center rounded-lg border border-sky-600 px-4 py-2 text-sm font-semibold text-sky-600 transition hover:bg-sky-50 focus-visible:outline-none"
								>
									<i className="fas fa-download mr-2" aria-hidden="true" />
									Download PDF
								</button>
								<button
									type="button"
									onClick={() => handlePrintReport()}
									className="inline-flex items-center rounded-lg border border-sky-600 px-4 py-2 text-sm font-semibold text-sky-600 transition hover:bg-sky-50 focus-visible:outline-none"
								>
									<i className="fas fa-print mr-2" aria-hidden="true" />
									Print Report
								</button>
							</>
						)}
						{activeReportTab === 'strength-conditioning' && strengthConditioningData && Object.keys(strengthConditioningData).length > 0 && (
							<>
								<button
									type="button"
									onClick={handleDownloadStrengthConditioningPDF}
									className="inline-flex items-center rounded-lg border border-sky-600 px-4 py-2 text-sm font-semibold text-sky-600 transition hover:bg-sky-50 focus-visible:outline-none"
								>
									<i className="fas fa-download mr-2" aria-hidden="true" />
									Download PDF
								</button>
								<button
									type="button"
									onClick={() => handlePrintReport()}
									className="inline-flex items-center rounded-lg border border-sky-600 px-4 py-2 text-sm font-semibold text-sky-600 transition hover:bg-sky-50 focus-visible:outline-none"
								>
									<i className="fas fa-print mr-2" aria-hidden="true" />
									Print Report
								</button>
							</>
						)}
						<button
							type="button"
							onClick={handleClose}
							className="inline-flex items-center rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition hover:border-slate-300 hover:text-slate-800 focus-visible:outline-none"
						>
							Close
						</button>
					</div>
				</footer>
			</div>
			
			{/* Crisp Report Modal */}
			{showCrispReportModal && (
				<div className="fixed inset-0 z-60 flex items-center justify-center bg-black bg-opacity-50 px-4 py-6">
					<div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-hidden flex flex-col">
						<div className="flex items-center justify-between p-6 border-b border-slate-200">
							<h2 className="text-xl font-semibold text-slate-900">Select Report Sections</h2>
							<button
								type="button"
								onClick={() => setShowCrispReportModal(false)}
								className="text-slate-400 hover:text-slate-600 transition"
								aria-label="Close"
							>
								<i className="fas fa-times text-xl" />
							</button>
						</div>
						<div className="flex-1 overflow-y-auto p-6">
							<div className="space-y-3">
								{allSections.map(section => (
									<label
										key={section.key}
										className="flex items-center gap-3 p-3 rounded-lg border border-slate-200 hover:bg-slate-50 cursor-pointer"
									>
										<input
											type="checkbox"
											checked={selectedSections.includes(section.key)}
											onChange={() => toggleSection(section.key)}
											className="h-4 w-4 border-slate-300 text-sky-600 focus:ring-sky-200 rounded"
										/>
										<span className="text-sm font-medium text-slate-700">{section.label}</span>
									</label>
								))}
							</div>
						</div>
						<div className="flex items-center justify-end gap-3 border-t border-slate-200 p-6">
							<button
								type="button"
								onClick={() => setShowCrispReportModal(false)}
								className="inline-flex items-center rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition hover:border-slate-300 hover:text-slate-800 focus-visible:outline-none"
							>
								Cancel
							</button>
							<button
								type="button"
								onClick={handleCrispReportDownload}
								className="inline-flex items-center rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition hover:border-slate-300 hover:text-slate-800 focus-visible:outline-none"
								disabled={selectedSections.length === 0 || !reportPatientData}
							>
								<i className="fas fa-download text-xs mr-2" aria-hidden="true" />
								Download PDF
							</button>
							<button
								type="button"
								onClick={handleCrispReportPrint}
								className="inline-flex items-center rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sky-700 focus-visible:outline-none"
								disabled={selectedSections.length === 0 || !reportPatientData}
							>
								<i className="fas fa-print text-xs mr-2" aria-hidden="true" />
								Print
							</button>
						</div>
					</div>
				</div>
			)}

			{/* Version History Modal - Same structure as ReportModal */}
			{showVersionHistory && reportPatientData && (
				<div className="fixed inset-0 z-60 flex items-center justify-center bg-slate-900/60 px-4 py-6">
					<div className="flex w-full max-w-4xl max-h-[90vh] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
						<header className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
							<h2 className="text-lg font-semibold text-slate-900">
								Report Versions - {reportPatientData.name} ({reportPatientData.patientId})
							</h2>
							<button
								type="button"
								onClick={() => {
									setShowVersionHistory(false);
									setViewingVersionData(null);
								}}
								className="rounded-full p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 focus-visible:outline-none"
								aria-label="Close"
							>
								<i className="fas fa-times" aria-hidden="true" />
							</button>
						</header>
						<div className="flex-1 overflow-y-auto p-6">
							{loadingVersions ? (
								<div className="text-center py-12">
									<div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-slate-900 border-r-transparent"></div>
									<p className="mt-4 text-sm text-slate-600">Loading report history...</p>
								</div>
							) : versionHistory.length === 0 ? (
								<div className="text-center py-12">
									<p className="text-slate-600">No report history available for this patient.</p>
									<p className="text-sm text-slate-500 mt-2">Previous reports will appear here when you save changes to the report.</p>
								</div>
							) : (
								<div className="space-y-4">
									{versionHistory.map((version) => {
										const isExpanded = expandedVersionId === version.id;
										const versionData = reportPatientData ? { ...reportPatientData, ...version.data } : version.data;
										return (
											<div
												key={version.id}
												className="border border-slate-200 rounded-lg overflow-hidden"
											>
												<div className="p-4 hover:bg-slate-50 transition">
													<div className="flex items-center justify-between">
														<div className="flex-1">
															<div className="flex items-center gap-2">
																<span className="font-semibold text-slate-900">Report #{version.version}</span>
																{version.version === versionHistory[0]?.version && (
																	<span className="px-2 py-1 text-xs font-medium bg-sky-100 text-sky-700 rounded">
																		Latest
																	</span>
																)}
															</div>
															<p className="text-sm text-slate-600 mt-1">
																Saved by {version.createdBy} on{' '}
																{new Date(version.createdAt).toLocaleString()}
															</p>
														</div>
														<div className="ml-4">
															<button
																type="button"
																onClick={() => toggleVersionExpansion(version.id)}
																className="inline-flex items-center rounded-lg border border-sky-600 px-3 py-1.5 text-xs font-semibold text-sky-600 transition hover:bg-sky-50 focus-visible:outline-none"
															>
																<i className={`fas ${isExpanded ? 'fa-chevron-up' : 'fa-chevron-down'} mr-1.5`} aria-hidden="true" />
																{isExpanded ? 'Hide Report' : 'Show Full Report'}
															</button>
														</div>
													</div>
												</div>
												{isExpanded && (
													<div className="border-t border-slate-200 bg-slate-50 p-6 max-h-[70vh] overflow-y-auto">
														<p className="text-sm text-slate-600">Full report view can be implemented here using the same structure as ReportModal.</p>
													</div>
												)}
											</div>
										);
									})}
								</div>
							)}
						</div>
						<footer className="flex items-center justify-end gap-3 border-t border-slate-200 px-6 py-4">
							<button
								type="button"
								onClick={() => {
									setShowVersionHistory(false);
									setViewingVersionData(null);
								}}
								className="inline-flex items-center rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition hover:border-slate-300 hover:text-slate-800 focus-visible:outline-none"
							>
								Close
							</button>
						</footer>
					</div>
				</div>
			)}
		</div>
	);
}

