'use client';

import { useEffect, useMemo, useState } from 'react';
import { collection, doc, onSnapshot, updateDoc, serverTimestamp, type QuerySnapshot, type Timestamp } from 'firebase/firestore';
import { useRouter } from 'next/navigation';

import { db } from '@/lib/firebase';
import type { AdminGenderOption, AdminPatientStatus } from '@/lib/adminMockData';
import { generatePhysiotherapyReportPDF, type PatientReportData } from '@/lib/pdfGenerator';

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
	
	// New fields for On Observation
	built?: string;
	posture?: 'Manual' | 'Kinetisense';
	gaitAnalysis?: 'Manual' | 'OptaGAIT';
	mobilityAids?: string;
	localObservation?: string;
	swelling?: string;
	muscleWasting?: string;
	postureManualNotes?: string;
	postureFileName?: string;
	postureFileData?: string;
	gaitManualNotes?: string;
	gaitFileName?: string;
	gaitFileData?: string;
	
	// New fields for On Palpation
	tenderness?: string;
	warmth?: string;
	scar?: string;
	crepitus?: string;
	odema?: string;

	// Manual Muscle Testing
	mmt?: Record<string, any>;

	// Special assessments & diagnoses
	specialTest?: string;
	differentialDiagnosis?: string;
	finalDiagnosis?: string;

	// Physiotherapy management
	shortTermGoals?: string;
	longTermGoals?: string;
	rehabProtocol?: string;
	advice?: string;
	managementRemarks?: string;

	nextFollowUpDate?: string;
	nextFollowUpTime?: string;
}

const VAS_EMOJIS = ['😀','😁','🙂','😊','😌','😟','😣','😢','😭','😱'];
const HYDRATION_EMOJIS = ['😄','😃','🙂','😐','😕','😟','😢','😭'];

const ROM_MOTIONS: Record<string, Array<{ motion: string }>> = {
	Neck: [
		{ motion: 'Flexion' }, 
		{ motion: 'Extension' }, 
		{ motion: 'Lateral Flexion Left' }, 
		{ motion: 'Lateral Flexion Right' }
	],
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
	'Tarsal Joint': [{ motion: 'Flexion' }, { motion: 'Extension' }],
	Finger: [{ motion: 'Flexion' }, { motion: 'Extension' }],
};

const ROM_HAS_SIDE: Record<string, boolean> = {
	Shoulder: true,
	Elbow: true,
	Forearm: true,
	Wrist: true,
	Knee: true,
	Ankle: true,
	'Tarsal Joint': true,
	Finger: true,
};

const ROM_JOINTS = Object.keys(ROM_MOTIONS);

const MOTION_TO_MMT: Record<string, string> = {
	Flexion: 'Flexors',
	Extension: 'Extensors',
	Abduction: 'Abductors',
	Adduction: 'Adductors',
	'Dorsiflexion': 'Dorsiflexors',
	'Plantarflexion': 'Plantarflexors',
	'Radial Deviation': 'Radial Deviators',
	'Ulnar Deviation': 'Ulnar Deviators',
	Inversion: 'Invertors',
	Eversion: 'Evertors',
	'Supination': 'Supinators',
	'Pronation': 'Pronators',
	'Internal Rotation': 'Internal Rotators',
	'External Rotation': 'External Rotators',
	'Lateral Flexion Left': 'Left Lateral Flexors',
	'Lateral Flexion Right': 'Right Lateral Flexors',
	'Flexion Left': 'Left Flexors',
	'Flexion Right': 'Right Flexors',
	'Extension Left': 'Left Extensors',
	'Extension Right': 'Right Extensors',
	FlexionLeft: 'Left Flexors',
	FlexionRight: 'Right Flexors',
	FlexionLeftRight: 'Lateral Flexors',
	FingerFlexion: 'Finger Flexors',
	FingerExtension: 'Finger Extensors',
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
	const [selectedMmtJoint, setSelectedMmtJoint] = useState('');
	const [formData, setFormData] = useState<Partial<PatientRecord>>({});
	const vasValue = Number(formData.vasScale || '5');
	const vasEmoji = VAS_EMOJIS[Math.min(VAS_EMOJIS.length - 1, Math.max(1, vasValue) - 1)];
	const hydrationValue = Number(formData.hydration || '4');
	const hydrationEmoji =
		HYDRATION_EMOJIS[Math.min(HYDRATION_EMOJIS.length - 1, Math.max(1, hydrationValue) - 1)];

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
						mmt: (data.mmt as Record<string, any>) || {},
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

	const handleMmtChange = (joint: string, motion: string, side: 'left' | 'right' | 'none', value: string) => {
		setFormData(prev => {
			const mmt = { ...(prev.mmt || {}) };
			if (!mmt[joint]) {
				mmt[joint] = ROM_HAS_SIDE[joint] ? { left: {}, right: {} } : {};
			}

			if (side === 'none') {
				mmt[joint][motion] = value;
			} else {
				if (!mmt[joint][side]) {
					mmt[joint][side] = {};
				}
				mmt[joint][side][motion] = value;
			}

			return { ...prev, mmt };
		});
	};

	const handleAddMmtJoint = () => {
		if (!selectedMmtJoint || !formData.mmt?.[selectedMmtJoint]) {
			setFormData(prev => {
				const mmt = { ...(prev.mmt || {}) };
				if (!mmt[selectedMmtJoint]) {
					mmt[selectedMmtJoint] = ROM_HAS_SIDE[selectedMmtJoint] ? { left: {}, right: {} } : {};
				}
				return { ...prev, mmt };
			});
		}
		setSelectedMmtJoint('');
	};

	const handleRemoveRomJoint = (joint: string) => {
		setFormData(prev => {
			if (!prev.rom) return prev;
			const rom = { ...prev.rom };
			delete rom[joint];
			return { ...prev, rom };
		});
	};

	const handleRemoveMmtJoint = (joint: string) => {
		setFormData(prev => {
			if (!prev.mmt) return prev;
			const mmt = { ...prev.mmt };
			delete mmt[joint];
			return { ...prev, mmt };
		});
	};

	const handleFileUpload = (dataField: keyof PatientRecord, nameField: keyof PatientRecord, file: File | null) => {
		if (!file) {
			setFormData(prev => ({ ...prev, [dataField]: '', [nameField]: '' }));
			return;
		}

		const reader = new FileReader();
		reader.onload = event => {
			const result = event.target?.result;
			if (typeof result === 'string') {
				setFormData(prev => ({ ...prev, [dataField]: result, [nameField]: file.name }));
			}
		};
		reader.readAsDataURL(file);
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
				built: formData.built || '',
				posture: formData.posture || '',
				gaitAnalysis: formData.gaitAnalysis || '',
				mobilityAids: formData.mobilityAids || '',
				localObservation: formData.localObservation || '',
				swelling: formData.swelling || '',
				muscleWasting: formData.muscleWasting || '',
				postureManualNotes: formData.postureManualNotes || '',
				postureFileName: formData.postureFileName || '',
				postureFileData: formData.postureFileData || '',
				gaitManualNotes: formData.gaitManualNotes || '',
				gaitFileName: formData.gaitFileName || '',
				gaitFileData: formData.gaitFileData || '',
				tenderness: formData.tenderness || '',
				warmth: formData.warmth || '',
				scar: formData.scar || '',
				crepitus: formData.crepitus || '',
				odema: formData.odema || '',
				mmt: formData.mmt || {},
				specialTest: formData.specialTest || '',
				differentialDiagnosis: formData.differentialDiagnosis || '',
				finalDiagnosis: formData.finalDiagnosis || '',
				shortTermGoals: formData.shortTermGoals || '',
				longTermGoals: formData.longTermGoals || '',
				rehabProtocol: formData.rehabProtocol || '',
				advice: formData.advice || '',
				managementRemarks: formData.managementRemarks || '',
				nextFollowUpDate: formData.nextFollowUpDate || '',
				nextFollowUpTime: formData.nextFollowUpTime || '',
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

	const formatMmtLabel = (motion: string) => {
		const direct = MOTION_TO_MMT[motion];
		if (direct) return direct;
		let label = motion;
		const replacements: Array<[RegExp, string]> = [
			[/Flexion/gi, 'Flexors'],
			[/Extension/gi, 'Extensors'],
			[/Abduction/gi, 'Abductors'],
			[/Adduction/gi, 'Adductors'],
			[/Dorsiflexion/gi, 'Dorsiflexors'],
			[/Plantarflexion/gi, 'Plantarflexors'],
		];
		replacements.forEach(([regex, replacement]) => {
			label = label.replace(regex, replacement);
		});
		return label;
	};

	const renderRomTable = (joint: string, data: any) => {
		if (!ROM_HAS_SIDE[joint] && joint !== 'Neck') {
			return (
				<div key={joint} className="relative mb-6 rounded-lg border border-slate-200 bg-slate-50 p-4">
					<button
						type="button"
						onClick={() => handleRemoveRomJoint(joint)}
						className="absolute right-3 top-3 text-slate-400 transition hover:text-rose-500"
						aria-label={`Remove ${joint}`}
					>
						<i className="fas fa-times" />
					</button>
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

		// Special handling for Neck with Lateral Flexion Left/Right
		if (joint === 'Neck') {
			return (
				<div key={joint} className="relative mb-6 rounded-lg border border-slate-200 bg-slate-50 p-4">
					<button
						type="button"
						onClick={() => handleRemoveRomJoint(joint)}
						className="absolute right-3 top-3 text-slate-400 transition hover:text-rose-500"
						aria-label="Remove Neck"
					>
						<i className="fas fa-times" />
					</button>
					<h6 className="mb-3 text-sm font-semibold text-sky-600">{joint}</h6>
					<table className="min-w-full divide-y divide-slate-200 border border-slate-300 text-left text-sm">
						<thead className="bg-slate-100">
							<tr>
								<th className="px-3 py-2 font-semibold text-slate-700">Motion</th>
								<th className="px-3 py-2 font-semibold text-slate-700">Value</th>
							</tr>
						</thead>
						<tbody className="divide-y divide-slate-200 bg-white">
							{ROM_MOTIONS[joint].map(({ motion }) => {
								if (motion.includes('Lateral Flexion')) {
									const side = motion.includes('Left') ? 'left' : 'right';
									const baseMotion = 'Lateral Flexion';
									return (
										<tr key={motion}>
											<td className="px-3 py-2 text-slate-700">{motion}</td>
											<td className="px-3 py-2">
												<input
													type="text"
													value={data?.[side]?.[baseMotion] || ''}
													onChange={e => handleRomChange(joint, baseMotion, side, e.target.value)}
													className="w-full rounded-md border border-slate-300 px-2 py-1 text-xs"
													placeholder="Enter value"
												/>
											</td>
										</tr>
									);
								} else {
									return (
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
									);
								}
							})}
						</tbody>
					</table>
				</div>
			);
		}

		return (
			<div key={joint} className="relative mb-6 rounded-lg border border-slate-200 bg-slate-50 p-4">
				<button
					type="button"
					onClick={() => handleRemoveRomJoint(joint)}
					className="absolute right-3 top-3 text-slate-400 transition hover:text-rose-500"
					aria-label={`Remove ${joint}`}
				>
					<i className="fas fa-times" />
				</button>
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

	const renderMmtTable = (joint: string, data: any) => {
		const motions = ROM_MOTIONS[joint] || [];

		if (!ROM_HAS_SIDE[joint]) {
			return (
				<div key={joint} className="relative mb-6 rounded-lg border border-violet-200 bg-violet-50/60 p-4">
					<button
						type="button"
						onClick={() => handleRemoveMmtJoint(joint)}
						className="absolute right-3 top-3 text-slate-400 transition hover:text-rose-500"
						aria-label={`Remove ${joint} MMT`}
					>
						<i className="fas fa-times" />
					</button>
					<h6 className="mb-3 text-sm font-semibold text-violet-700">{joint}</h6>
					<table className="min-w-full divide-y divide-slate-200 border border-slate-300 text-left text-sm">
						<thead className="bg-slate-100">
							<tr>
								<th className="px-3 py-2 font-semibold text-slate-700">Muscle Group</th>
								<th className="px-3 py-2 font-semibold text-slate-700">Grade</th>
							</tr>
						</thead>
						<tbody className="divide-y divide-slate-200 bg-white">
							{motions.map(({ motion }) => {
								const label = formatMmtLabel(motion);
								return (
									<tr key={motion}>
										<td className="px-3 py-2 text-slate-700">{label}</td>
										<td className="px-3 py-2">
											<input
												type="text"
												value={data?.[motion] || ''}
												onChange={e => handleMmtChange(joint, motion, 'none', e.target.value)}
												className="w-full rounded-md border border-slate-300 px-2 py-1 text-xs"
												placeholder="Grade"
											/>
										</td>
									</tr>
								);
							})}
						</tbody>
					</table>
				</div>
			);
		}

		return (
			<div key={joint} className="relative mb-6 rounded-lg border border-violet-200 bg-violet-50/60 p-4">
				<button
					type="button"
					onClick={() => handleRemoveMmtJoint(joint)}
					className="absolute right-3 top-3 text-slate-400 transition hover:text-rose-500"
					aria-label={`Remove ${joint} MMT`}
				>
					<i className="fas fa-times" />
				</button>
				<h6 className="mb-3 text-sm font-semibold text-violet-700">{joint}</h6>
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
							<th className="px-3 py-2 font-semibold text-slate-700">Muscle Group</th>
							<th className="px-3 py-2 font-semibold text-slate-700">Grade</th>
							<th className="px-3 py-2 font-semibold text-slate-700">Muscle Group</th>
							<th className="px-3 py-2 font-semibold text-slate-700">Grade</th>
						</tr>
					</thead>
					<tbody className="divide-y divide-slate-200 bg-white">
						{motions.map(({ motion }) => {
							const label = formatMmtLabel(motion);
							return (
								<tr key={motion}>
									<td className="px-3 py-2 text-slate-700">{label}</td>
									<td className="px-3 py-2">
										<input
											type="text"
											value={data?.left?.[motion] || ''}
											onChange={e => handleMmtChange(joint, motion, 'left', e.target.value)}
											className="w-full rounded-md border border-slate-300 px-2 py-1 text-xs"
											placeholder="Grade"
										/>
									</td>
									<td className="px-3 py-2 text-slate-700">{label}</td>
									<td className="px-3 py-2">
										<input
											type="text"
											value={data?.right?.[motion] || ''}
											onChange={e => handleMmtChange(joint, motion, 'right', e.target.value)}
											className="w-full rounded-md border border-slate-300 px-2 py-1 text-xs"
											placeholder="Grade"
										/>
									</td>
								</tr>
							);
						})}
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

	const buildReportPayload = (): PatientReportData | null => {
		if (!selectedPatient) return null;
		const age = selectedPatient.dob ? new Date().getFullYear() - new Date(selectedPatient.dob).getFullYear() : undefined;

		return {
			patientName: selectedPatient.name,
			patientId: selectedPatient.patientId,
			referredBy: selectedPatient.assignedDoctor || formData.referredBy || '',
			age: age ? String(age) : '',
			gender: selectedPatient.gender || '',
			dateOfConsultation: formData.dateOfConsultation || new Date().toISOString().split('T')[0],
			contact: selectedPatient.phone || '',
			email: selectedPatient.email || '',
			complaints: formData.complaints || '',
			presentHistory: formData.presentHistory || '',
			pastHistory: formData.pastHistory || '',
			surgicalHistory: formData.surgicalHistory || '',
			medicalHistory: getMedicalHistoryText(selectedPatient),
			sleepCycle: formData.sleepCycle || '',
			hydration: formData.hydration || '4',
			nutrition: formData.nutrition || '',
			chiefComplaint: formData.chiefComplaint || formData.complaints || '',
			onsetType: formData.onsetType || '',
			duration: formData.duration || '',
			mechanismOfInjury: formData.mechanismOfInjury || '',
			painType: formData.painType || formData.typeOfPain || '',
			painIntensity: formData.painIntensity || formData.vasScale || '',
			aggravatingFactor: formData.aggravatingFactor || '',
			relievingFactor: formData.relievingFactor || '',
			siteSide: formData.siteSide || '',
			onset: formData.onset || '',
			natureOfInjury: formData.natureOfInjury || '',
			typeOfPain: formData.typeOfPain || '',
			vasScale: formData.vasScale || '5',
			rom: formData.rom || {},
			mmt: formData.mmt || {},
			built: formData.built || '',
			posture: formData.posture || '',
			postureManualNotes: formData.postureManualNotes || '',
			postureFileName: formData.postureFileName || '',
			gaitAnalysis: formData.gaitAnalysis || '',
			gaitManualNotes: formData.gaitManualNotes || '',
			gaitFileName: formData.gaitFileName || '',
			mobilityAids: formData.mobilityAids || '',
			localObservation: formData.localObservation || '',
			swelling: formData.swelling || '',
			muscleWasting: formData.muscleWasting || '',
			tenderness: formData.tenderness || '',
			warmth: formData.warmth || '',
			scar: formData.scar || '',
			crepitus: formData.crepitus || '',
			odema: formData.odema || '',
			followUpVisits: formData.followUpVisits || [],
			currentPainStatus: formData.currentPainStatus || '',
			currentRom: formData.currentRom || '',
			currentStrength: formData.currentStrength || '',
			currentFunctionalAbility: formData.currentFunctionalAbility || '',
			complianceWithHEP: formData.complianceWithHEP || '',
			specialTest: formData.specialTest || '',
			differentialDiagnosis: formData.differentialDiagnosis || '',
			finalDiagnosis: formData.finalDiagnosis || '',
			shortTermGoals: formData.shortTermGoals || '',
			longTermGoals: formData.longTermGoals || '',
			rehabProtocol: formData.rehabProtocol || '',
			advice: formData.advice || '',
			managementRemarks: formData.managementRemarks || '',
			nextFollowUpDate: formData.nextFollowUpDate || '',
			nextFollowUpTime: formData.nextFollowUpTime || '',
			physioName: formData.physioName || '',
			physioRegNo: formData.physioId || '',
		} as PatientReportData;
	};

	const handleDownloadPDF = () => {
		const payload = buildReportPayload();
		if (!payload) return;
		generatePhysiotherapyReportPDF(payload);
	};

	const handlePrint = async () => {
		const payload = buildReportPayload();
		if (!payload) return;

		const pdfDataUrl = await generatePhysiotherapyReportPDF(payload, { forPrint: true });
		if (!pdfDataUrl) return;

		// Open PDF in new window for printing
		const printWindow = window.open();
		if (!printWindow) {
			alert('Please allow pop-ups to print the report');
			return;
		}

		printWindow.document.write(`
			<html>
				<head>
					<title>Print Report</title>
					<style>
						body { margin: 0; padding: 0; }
						iframe { width: 100%; height: 100vh; border: none; }
					</style>
				</head>
				<body>
					<iframe src="${pdfDataUrl}"></iframe>
					<script>
						window.onload = function() {
							setTimeout(function() {
								window.print();
							}, 500);
						};
					</script>
				</body>
			</html>
		`);
		printWindow.document.close();
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
								<label className="block text-xs font-medium text-slate-500 mb-2">Hydration</label>
								<div className="flex items-center gap-2">
									<span className="text-xs font-semibold text-slate-500">1</span>
									<input
										type="range"
										min="1"
										max="8"
										value={hydrationValue}
										onChange={e => handleFieldChange('hydration', e.target.value)}
										className="flex-1 h-2 bg-gradient-to-r from-emerald-400 via-amber-400 to-rose-500 rounded-lg appearance-none cursor-pointer"
									/>
									<span className="text-xs font-semibold text-slate-500">8</span>
								</div>
								<div className="mt-3 flex items-center justify-center gap-2">
									<span className="text-3xl transition-transform duration-200" style={{ transform: 'scale(1.2)' }}>
										{hydrationEmoji}
									</span>
									<span className="text-xs text-slate-600 font-medium">{hydrationValue}/8</span>
								</div>
								<div className="mt-2 grid grid-cols-8 text-[10px] text-center text-slate-400">
									{HYDRATION_EMOJIS.map((emoji, idx) => (
										<span
											key={`hydration-${emoji}-${idx}`}
											className={`transition-transform duration-200 ${idx + 1 === hydrationValue ? 'scale-110' : 'scale-90'}`}
										>
											{emoji}
										</span>
									))}
								</div>
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
						</div>
					</div>

					{/* Pain Assessment Section */}
					<div className="mb-8">
						<h3 className="mb-4 text-lg font-semibold text-sky-600 border-b border-sky-200 pb-2">Pain Assessment</h3>
						<div className="grid gap-4 sm:grid-cols-2">
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
								<label className="block text-xs font-medium text-slate-500 mb-2">VAS Scale</label>
								<div className="flex items-center gap-2">
									<span className="text-xs font-semibold text-slate-500">1</span>
									<input
										type="range"
										min="1"
										max="10"
										value={vasValue}
										onChange={e => handleFieldChange('vasScale', e.target.value)}
										className="flex-1 h-2 bg-gradient-to-r from-emerald-400 via-amber-400 to-rose-500 rounded-lg appearance-none cursor-pointer"
									/>
									<span className="text-xs font-semibold text-slate-500">10</span>
								</div>
								<div className="mt-3 flex items-center justify-center gap-2">
									<span
										className="text-3xl transition-transform duration-200"
										style={{ transform: 'scale(1.2)' }}
										role="img"
										aria-label="Pain emoji"
									>
										{vasEmoji}
									</span>
									<span className="text-xs text-slate-600 font-medium">{vasValue}/10</span>
								</div>
								<div className="mt-2 grid grid-cols-10 text-[10px] text-center text-slate-400">
									{VAS_EMOJIS.map((emoji, idx) => (
										<span
											key={emoji + idx}
											className={`transition-transform duration-200 ${idx + 1 === vasValue ? 'scale-110' : 'scale-90'}`}
										>
											{emoji}
										</span>
									))}
								</div>
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

					{/* On Observation Section */}
					<div className="mb-8">
						<h3 className="mb-4 text-lg font-semibold text-sky-600 border-b border-sky-200 pb-2">On Observation</h3>
						<div className="grid gap-4 sm:grid-cols-2">
							<div>
								<label className="block text-xs font-medium text-slate-500">Built</label>
								<input
									type="text"
									value={formData.built || ''}
									onChange={e => handleFieldChange('built', e.target.value)}
									className="input-base"
								/>
							</div>
							<div>
								<label className="block text-xs font-medium text-slate-500 mb-2">Posture</label>
								<div className="flex gap-4">
									<label className="flex items-center gap-2">
										<input
											type="radio"
											name="posture"
											value="Manual"
											checked={formData.posture === 'Manual'}
											onChange={e => handleFieldChange('posture', e.target.value)}
											className="text-sky-600"
										/>
										<span className="text-sm">Manual</span>
									</label>
									<label className="flex items-center gap-2">
										<input
											type="radio"
											name="posture"
											value="Kinetisense"
											checked={formData.posture === 'Kinetisense'}
											onChange={e => handleFieldChange('posture', e.target.value)}
											className="text-sky-600"
										/>
										<span className="text-sm">Kinetisense</span>
									</label>
								</div>
								{formData.posture === 'Manual' && (
									<textarea
										className="mt-2 textarea-base"
										rows={2}
										placeholder="Add manual posture notes"
										value={formData.postureManualNotes || ''}
										onChange={e => handleFieldChange('postureManualNotes', e.target.value)}
									/>
								)}
								{formData.posture === 'Kinetisense' && (
									<div className="mt-2 space-y-2">
										<input
											type="file"
											accept=".pdf,.jpg,.jpeg,.png"
											onChange={e => handleFileUpload('postureFileData', 'postureFileName', e.target.files?.[0] || null)}
											className="block w-full text-xs text-slate-600 file:mr-4 file:rounded-full file:border-0 file:bg-sky-50 file:px-3 file:py-1 file:text-sm file:font-semibold file:text-sky-700 hover:file:bg-sky-100"
										/>
										{formData.postureFileName && (
											<div className="flex items-center gap-2">
												<span className="text-xs text-slate-600">{formData.postureFileName}</span>
												<button
													type="button"
													onClick={() => {
														if (formData.postureFileData) {
															const viewWindow = window.open();
															if (viewWindow) {
																viewWindow.document.write(`
																	<html>
																		<head>
																			<title>${formData.postureFileName}</title>
																			<style>
																				body { margin: 0; padding: 0; }
																				iframe { width: 100%; height: 100vh; border: none; }
																			</style>
																		</head>
																		<body>
																			<iframe src="${formData.postureFileData}"></iframe>
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
								)}
							</div>
							<div>
								<label className="block text-xs font-medium text-slate-500 mb-2">GAIT Analysis</label>
								<div className="flex gap-4">
									<label className="flex items-center gap-2">
										<input
											type="radio"
											name="gaitAnalysis"
											value="Manual"
											checked={formData.gaitAnalysis === 'Manual'}
											onChange={e => handleFieldChange('gaitAnalysis', e.target.value)}
											className="text-sky-600"
										/>
										<span className="text-sm">Manual</span>
									</label>
									<label className="flex items-center gap-2">
										<input
											type="radio"
											name="gaitAnalysis"
											value="OptaGAIT"
											checked={formData.gaitAnalysis === 'OptaGAIT'}
											onChange={e => handleFieldChange('gaitAnalysis', e.target.value)}
											className="text-sky-600"
										/>
										<span className="text-sm">OptaGAIT</span>
									</label>
								</div>
								{formData.gaitAnalysis === 'Manual' && (
									<textarea
										className="mt-2 textarea-base"
										rows={2}
										placeholder="Manual GAIT analysis notes"
										value={formData.gaitManualNotes || ''}
										onChange={e => handleFieldChange('gaitManualNotes', e.target.value)}
									/>
								)}
								{formData.gaitAnalysis === 'OptaGAIT' && (
									<div className="mt-2 space-y-2">
										<input
											type="file"
											accept=".pdf,.jpg,.jpeg,.png"
											onChange={e => handleFileUpload('gaitFileData', 'gaitFileName', e.target.files?.[0] || null)}
											className="block w-full text-xs text-slate-600 file:mr-4 file:rounded-full file:border-0 file:bg-sky-50 file:px-3 file:py-1 file:text-sm file:font-semibold file:text-sky-700 hover:file:bg-sky-100"
										/>
										{formData.gaitFileName && (
											<div className="flex items-center gap-2">
												<span className="text-xs text-slate-600">{formData.gaitFileName}</span>
												<button
													type="button"
													onClick={() => {
														if (formData.gaitFileData) {
															const viewWindow = window.open();
															if (viewWindow) {
																viewWindow.document.write(`
																	<html>
																		<head>
																			<title>${formData.gaitFileName}</title>
																			<style>
																				body { margin: 0; padding: 0; }
																				iframe { width: 100%; height: 100vh; border: none; }
																			</style>
																		</head>
																		<body>
																			<iframe src="${formData.gaitFileData}"></iframe>
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
								)}
							</div>
							<div>
								<label className="block text-xs font-medium text-slate-500">Mobility Aids</label>
								<input
									type="text"
									value={formData.mobilityAids || ''}
									onChange={e => handleFieldChange('mobilityAids', e.target.value)}
									className="input-base"
								/>
							</div>
							<div>
								<label className="block text-xs font-medium text-slate-500">Local Observation</label>
								<textarea
									value={formData.localObservation || ''}
									onChange={e => handleFieldChange('localObservation', e.target.value)}
									className="textarea-base"
									rows={2}
								/>
							</div>
							<div>
								<label className="block text-xs font-medium text-slate-500">Swelling</label>
								<input
									type="text"
									value={formData.swelling || ''}
									onChange={e => handleFieldChange('swelling', e.target.value)}
									className="input-base"
								/>
							</div>
							<div>
								<label className="block text-xs font-medium text-slate-500">Muscle Wasting</label>
								<input
									type="text"
									value={formData.muscleWasting || ''}
									onChange={e => handleFieldChange('muscleWasting', e.target.value)}
									className="input-base"
								/>
							</div>
						</div>
					</div>

					{/* On Palpation Section */}
					<div className="mb-8">
						<h3 className="mb-4 text-lg font-semibold text-sky-600 border-b border-sky-200 pb-2">On Palpation</h3>
						<div className="grid gap-4 sm:grid-cols-2">
							<div>
								<label className="block text-xs font-medium text-slate-500">Tenderness</label>
								<input
									type="text"
									value={formData.tenderness || ''}
									onChange={e => handleFieldChange('tenderness', e.target.value)}
									className="input-base"
								/>
							</div>
							<div>
								<label className="block text-xs font-medium text-slate-500">Warmth</label>
								<input
									type="text"
									value={formData.warmth || ''}
									onChange={e => handleFieldChange('warmth', e.target.value)}
									className="input-base"
								/>
							</div>
							<div>
								<label className="block text-xs font-medium text-slate-500">Scar</label>
								<input
									type="text"
									value={formData.scar || ''}
									onChange={e => handleFieldChange('scar', e.target.value)}
									className="input-base"
								/>
							</div>
							<div>
								<label className="block text-xs font-medium text-slate-500">Crepitus</label>
								<input
									type="text"
									value={formData.crepitus || ''}
									onChange={e => handleFieldChange('crepitus', e.target.value)}
									className="input-base"
								/>
							</div>
							<div>
								<label className="block text-xs font-medium text-slate-500">Odema</label>
								<input
									type="text"
									value={formData.odema || ''}
									onChange={e => handleFieldChange('odema', e.target.value)}
									className="input-base"
								/>
							</div>
						</div>
					</div>

					{/* On Examination Section - ROM Assessment */}
					<div className="mb-8">
						<h3 className="mb-4 text-lg font-semibold text-sky-600 border-b border-sky-200 pb-2">On Examination</h3>
						<div className="mb-4">
							<h4 className="mb-3 text-sm font-semibold text-slate-700">i) Range of Motion Assessment</h4>
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
						<div className="mt-8">
							<h4 className="mb-3 text-sm font-semibold text-slate-700">ii) Manual Muscle Testing</h4>
							<div className="mb-4 flex items-center gap-3">
								<select
									value={selectedMmtJoint}
									onChange={e => setSelectedMmtJoint(e.target.value)}
									className="select-base"
									style={{ maxWidth: '220px' }}
								>
									<option value="">--Select Joint--</option>
									{ROM_JOINTS.map(joint => (
										<option key={`mmt-${joint}`} value={joint}>
											{joint}
										</option>
									))}
								</select>
								<button
									type="button"
									onClick={handleAddMmtJoint}
									className="btn-primary"
									disabled={!selectedMmtJoint}
								>
									<i className="fas fa-plus text-xs" aria-hidden="true" />
									Add Joint
								</button>
							</div>
							{formData.mmt && Object.keys(formData.mmt).length > 0 ? (
								<div>
									{Object.keys(formData.mmt).map(joint => renderMmtTable(joint, formData.mmt![joint]))}
								</div>
							) : (
								<p className="text-sm italic text-slate-500">
									No manual muscle testing recorded. Select a joint and click "Add Joint" to begin.
								</p>
							)}
						</div>
						<div className="mt-8 grid gap-4">
							<div>
								<h4 className="mb-2 text-sm font-semibold text-slate-700">iii) Special Tests</h4>
								<textarea
									value={formData.specialTest || ''}
									onChange={e => handleFieldChange('specialTest', e.target.value)}
									className="textarea-base"
									rows={3}
									placeholder="Describe special test findings"
								/>
							</div>
							<div>
								<h4 className="mb-2 text-sm font-semibold text-slate-700">iv) Differential Diagnosis</h4>
								<textarea
									value={formData.differentialDiagnosis || ''}
									onChange={e => handleFieldChange('differentialDiagnosis', e.target.value)}
									className="textarea-base"
									rows={3}
									placeholder="Possible differentials"
								/>
							</div>
							<div>
								<h4 className="mb-2 text-sm font-semibold text-slate-700">v) Diagnosis</h4>
								<textarea
									value={formData.finalDiagnosis || ''}
									onChange={e => handleFieldChange('finalDiagnosis', e.target.value)}
									className="textarea-base"
									rows={3}
									placeholder="Final working diagnosis"
								/>
							</div>
						</div>
					</div>

					{/* Physiotherapy Management */}
					<div className="mb-10">
						<h3 className="mb-4 text-lg font-semibold text-sky-600 border-b border-sky-200 pb-2">Physiotherapy Management</h3>
						<div className="space-y-4">
							<div>
								<label className="block text-xs font-medium text-slate-500">i) Short Term Goals</label>
								<textarea
									value={formData.shortTermGoals || ''}
									onChange={e => handleFieldChange('shortTermGoals', e.target.value)}
									className="textarea-base"
									rows={3}
								/>
							</div>
							<div>
								<label className="block text-xs font-medium text-slate-500">ii) Long Term Goals</label>
								<textarea
									value={formData.longTermGoals || ''}
									onChange={e => handleFieldChange('longTermGoals', e.target.value)}
									className="textarea-base"
									rows={3}
								/>
							</div>
							<div>
								<label className="block text-xs font-medium text-slate-500">iii) Rehab Protocol</label>
								<textarea
									value={formData.rehabProtocol || ''}
									onChange={e => handleFieldChange('rehabProtocol', e.target.value)}
									className="textarea-base"
									rows={3}
								/>
							</div>
							<div>
								<label className="block text-xs font-medium text-slate-500">iv) Advice</label>
								<textarea
									value={formData.advice || ''}
									onChange={e => handleFieldChange('advice', e.target.value)}
									className="textarea-base"
									rows={3}
								/>
							</div>
							<div>
								<label className="block text-xs font-medium text-slate-500">v) Remarks</label>
								<textarea
									value={formData.managementRemarks || ''}
									onChange={e => handleFieldChange('managementRemarks', e.target.value)}
									className="textarea-base"
									rows={3}
								/>
							</div>
						</div>
					</div>

					{/* Follow-Up Visit Summary */}
					<div className="mb-8">
						<h3 className="mb-4 text-sm font-semibold text-sky-600">Follow-Up Visit Summary</h3>
						<table className="min-w-full divide-y divide-slate-200 border border-slate-300 text-left text-sm">
							<thead className="bg-slate-100">
								<tr>
									<th className="px-3 py-2 font-semibold text-slate-700">Visit</th>
									<th className="px-3 py-2 font-semibold text-slate-700">Pain Level (VAS)</th>
									<th className="px-3 py-2 font-semibold text-slate-700">Findings / Progress</th>
								</tr>
							</thead>
							<tbody className="divide-y divide-slate-200 bg-white">
								{[1, 2, 3, 4].map(index => {
									const visit = formData.followUpVisits?.[index - 1] || { visitDate: '', painLevel: '', findings: '' };
									return (
										<tr key={`visit-${index}`}>
											<td className="px-3 py-2">
												<input
													type="date"
													value={visit.visitDate}
													onChange={e => {
														const newVisits = [...(formData.followUpVisits || [])];
														newVisits[index - 1] = { ...visit, visitDate: e.target.value };
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
														newVisits[index - 1] = { ...visit, painLevel: e.target.value };
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
														newVisits[index - 1] = { ...visit, findings: e.target.value };
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
						<h3 className="mb-4 text-sm font-semibold text-sky-600">Current Status (as on last visit)</h3>
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
							<div className="grid gap-2 sm:col-span-2 sm:grid-cols-2">
								<div>
									<label className="block text-xs font-medium text-slate-500">Next Follow-Up Date</label>
									<input
										type="date"
										value={formData.nextFollowUpDate || ''}
										onChange={e => handleFieldChange('nextFollowUpDate', e.target.value)}
										className="input-base"
									/>
								</div>
								<div>
									<label className="block text-xs font-medium text-slate-500">Next Follow-Up Time</label>
									<input
										type="time"
										value={formData.nextFollowUpTime || ''}
										onChange={e => handleFieldChange('nextFollowUpTime', e.target.value)}
										className="input-base"
									/>
								</div>
							</div>
						</div>
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
							onClick={handlePrint}
							className="btn-secondary"
							disabled={!selectedPatient}
						>
							<i className="fas fa-print text-xs" aria-hidden="true" />
							Print Report
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
