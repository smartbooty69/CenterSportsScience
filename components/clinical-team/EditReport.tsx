'use client';

import { useEffect, useMemo, useState } from 'react';
import { collection, doc, onSnapshot, updateDoc, addDoc, deleteDoc, query, where, orderBy, getDocs, serverTimestamp, type QuerySnapshot, type Timestamp } from 'firebase/firestore';
import { useRouter } from 'next/navigation';

import { db } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import type { AdminGenderOption, AdminPatientStatus } from '@/lib/adminMockData';
import { generatePhysiotherapyReportPDF, type PatientReportData } from '@/lib/pdfGenerator';
import type { PatientRecordFull } from '@/lib/types';

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

const STATUS_OPTIONS: Array<{ value: AdminPatientStatus; label: string }> = [
	{ value: 'pending', label: 'Pending' },
	{ value: 'ongoing', label: 'Ongoing' },
	{ value: 'completed', label: 'Completed' },
	{ value: 'cancelled', label: 'Cancelled' },
];

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


function getMedicalHistoryText(p: PatientRecordFull): string {
	const items: string[] = [];
	if (p.med_xray) items.push('X RAYS');
	if (p.med_mri) items.push('MRI');
	if (p.med_report) items.push('Reports');
	if (p.med_ct) items.push('CT Scans');
	return items.join(', ') || 'N/A';
}

function getPersonalHistoryText(p: PatientRecordFull): string {
	const items: string[] = [];
	if (p.per_smoking) items.push('Smoking');
	if (p.per_drinking) items.push('Drinking');
	if (p.per_alcohol) items.push('Alcohol');
	if (p.per_drugs) {
		items.push('Drugs: ' + (p.drugsText || ''));
	}
	return items.join(', ') || 'N/A';
}

function normalize(value?: string | null) {
	return value?.trim().toLowerCase() ?? '';
}

// Remove undefined values from an object (Firestore doesn't allow undefined)
function removeUndefined<T extends Record<string, any>>(obj: T): Partial<T> {
	const cleaned: Partial<T> = {};
	for (const key in obj) {
		const value = obj[key];
		if (value !== undefined) {
			// Handle nested objects
			if (value !== null && typeof value === 'object' && !Array.isArray(value) && !((value as any) instanceof Date)) {
				const cleanedNested = removeUndefined(value);
				// Only include if nested object has at least one property
				if (Object.keys(cleanedNested).length > 0) {
					cleaned[key] = cleanedNested as any;
				}
			} else {
				cleaned[key] = value;
			}
		}
	}
	return cleaned;
}

export default function EditReport() {
	const router = useRouter();
	const { user } = useAuth();
	const [patientIdParam, setPatientIdParam] = useState<string | null>(null);

	const [patients, setPatients] = useState<PatientRecordFull[]>([]);
	const [selectedPatient, setSelectedPatient] = useState<PatientRecordFull | null>(null);
	const [loading, setLoading] = useState(true);
	const [saving, setSaving] = useState(false);
	const [savedMessage, setSavedMessage] = useState(false);
	const [updatingStatus, setUpdatingStatus] = useState<Record<string, boolean>>({});
	const [searchTerm, setSearchTerm] = useState('');
	const [selectedRomJoint, setSelectedRomJoint] = useState('');
	const [selectedMmtJoint, setSelectedMmtJoint] = useState('');
	const [formData, setFormData] = useState<Partial<PatientRecordFull>>({});
	const [showVersionHistory, setShowVersionHistory] = useState(false);
	const [versionHistory, setVersionHistory] = useState<Array<{
		id: string;
		version: number;
		createdAt: string;
		createdBy: string;
		data: Partial<PatientRecordFull>;
	}>>([]);
	const [loadingVersions, setLoadingVersions] = useState(false);
	const [viewingVersion, setViewingVersion] = useState<typeof versionHistory[0] | null>(null);
	const vasValue = Number(formData.vasScale || '5');
	const vasEmoji = VAS_EMOJIS[Math.min(VAS_EMOJIS.length - 1, Math.max(1, vasValue) - 1)];
	const hydrationValue = Number(formData.hydration || '4');
	const hydrationEmoji =
		HYDRATION_EMOJIS[Math.min(HYDRATION_EMOJIS.length - 1, Math.max(1, hydrationValue) - 1)];

	const clinicianName = useMemo(() => normalize(user?.displayName ?? ''), [user?.displayName]);

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
					} as PatientRecordFull;
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
		// Debug logging in development
		if (process.env.NODE_ENV === 'development') {
			console.log('EditReport - Filtering patients:', {
				totalPatients: patients.length,
				clinicianName,
				userDisplayName: user?.displayName,
				sampleAssignedDoctors: patients.slice(0, 5).map(p => ({
					patientId: p.patientId,
					assignedDoctor: p.assignedDoctor,
					normalized: normalize(p.assignedDoctor)
				}))
			});
		}

		// First filter by assigned doctor (only show patients assigned to current staff member)
		let assignedPatients: PatientRecordFull[];
		
		if (!clinicianName) {
			// If no clinician name, show all patients
			assignedPatients = patients;
		} else {
			// Filter by assigned doctor
			assignedPatients = patients.filter(patient => {
				const normalizedAssigned = normalize(patient.assignedDoctor);
				return normalizedAssigned === clinicianName;
			});
			
			// If no patients match the assigned doctor filter, show all patients
			// This handles cases where patients might not have assignedDoctor set
			// or where the name matching isn't working correctly
			if (assignedPatients.length === 0 && patients.length > 0) {
				if (process.env.NODE_ENV === 'development') {
					console.warn('EditReport - No patients matched assignedDoctor filter. Showing all patients.', {
						clinicianName,
						totalPatients: patients.length,
						uniqueAssignedDoctors: [...new Set(patients.map(p => p.assignedDoctor).filter(Boolean))]
					});
				}
				assignedPatients = patients;
			}
		}

		// Then filter by search term
		const query = searchTerm.trim().toLowerCase();
		if (!query) return assignedPatients;
		
		return assignedPatients.filter(patient => {
			return (
				(patient.name || '').toLowerCase().includes(query) ||
				(patient.patientId || '').toLowerCase().includes(query) ||
				(patient.phone || '').toLowerCase().includes(query)
			);
		});
	}, [patients, searchTerm, clinicianName, user?.displayName]);

	const handleSelectPatient = (patient: PatientRecordFull) => {
		setSelectedPatient(patient);
		setFormData(patient);
		router.push(`/clinical-team/edit-report?patientId=${patient.patientId}`);
	};

	const handleFieldChange = (field: keyof PatientRecordFull, value: any) => {
		setFormData(prev => ({ ...prev, [field]: value }));
	};

	const handleCheckboxChange = (field: keyof PatientRecordFull, checked: boolean) => {
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

	const handleFileUpload = (dataField: keyof PatientRecordFull, nameField: keyof PatientRecordFull, file: File | null) => {
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

	const handleStatusChange = async (patientId: string, newStatus: AdminPatientStatus) => {
		if (!patientId || updatingStatus[patientId]) return;

		setUpdatingStatus(prev => ({ ...prev, [patientId]: true }));
		try {
			const patientRef = doc(db, 'patients', patientId);
			await updateDoc(patientRef, {
				status: newStatus,
			});
			// Update local state
			setPatients(prev => prev.map(p => p.id === patientId ? { ...p, status: newStatus } : p));
			if (selectedPatient?.id === patientId) {
				setSelectedPatient(prev => prev ? { ...prev, status: newStatus } : null);
				setFormData(prev => ({ ...prev, status: newStatus }));
			}
		} catch (error) {
			console.error('Failed to update patient status', error);
			alert(`Failed to update patient status: ${error instanceof Error ? error.message : 'Unknown error'}`);
		} finally {
			setUpdatingStatus(prev => ({ ...prev, [patientId]: false }));
		}
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

			// Create report snapshot before updating
			// Get current report data from selectedPatient to create a snapshot
			const currentReportData: Partial<PatientRecordFull> = {
				complaints: selectedPatient.complaints,
				presentHistory: selectedPatient.presentHistory,
				pastHistory: selectedPatient.pastHistory,
				med_xray: selectedPatient.med_xray,
				med_mri: selectedPatient.med_mri,
				med_report: selectedPatient.med_report,
				med_ct: selectedPatient.med_ct,
				surgicalHistory: selectedPatient.surgicalHistory,
				per_smoking: selectedPatient.per_smoking,
				per_drinking: selectedPatient.per_drinking,
				per_alcohol: selectedPatient.per_alcohol,
				per_drugs: selectedPatient.per_drugs,
				drugsText: selectedPatient.drugsText,
				sleepCycle: selectedPatient.sleepCycle,
				hydration: selectedPatient.hydration,
				nutrition: selectedPatient.nutrition,
				siteSide: selectedPatient.siteSide,
				onset: selectedPatient.onset,
				duration: selectedPatient.duration,
				natureOfInjury: selectedPatient.natureOfInjury,
				typeOfPain: selectedPatient.typeOfPain,
				vasScale: selectedPatient.vasScale,
				aggravatingFactor: selectedPatient.aggravatingFactor,
				relievingFactor: selectedPatient.relievingFactor,
				rom: selectedPatient.rom,
				treatmentProvided: selectedPatient.treatmentProvided,
				progressNotes: selectedPatient.progressNotes,
				physioName: selectedPatient.physioName,
				physioId: selectedPatient.physioId,
				dateOfConsultation: selectedPatient.dateOfConsultation,
				referredBy: selectedPatient.referredBy,
				chiefComplaint: selectedPatient.chiefComplaint,
				onsetType: selectedPatient.onsetType,
				mechanismOfInjury: selectedPatient.mechanismOfInjury,
				painType: selectedPatient.painType,
				painIntensity: selectedPatient.painIntensity,
				clinicalDiagnosis: selectedPatient.clinicalDiagnosis,
				treatmentPlan: selectedPatient.treatmentPlan,
				followUpVisits: selectedPatient.followUpVisits,
				currentPainStatus: selectedPatient.currentPainStatus,
				currentRom: selectedPatient.currentRom,
				currentStrength: selectedPatient.currentStrength,
				currentFunctionalAbility: selectedPatient.currentFunctionalAbility,
				complianceWithHEP: selectedPatient.complianceWithHEP,
				recommendations: selectedPatient.recommendations,
				physiotherapistRemarks: selectedPatient.physiotherapistRemarks,
				built: selectedPatient.built,
				posture: selectedPatient.posture,
				gaitAnalysis: selectedPatient.gaitAnalysis,
				mobilityAids: selectedPatient.mobilityAids,
				localObservation: selectedPatient.localObservation,
				swelling: selectedPatient.swelling,
				muscleWasting: selectedPatient.muscleWasting,
				postureManualNotes: selectedPatient.postureManualNotes,
				postureFileName: selectedPatient.postureFileName,
				postureFileData: selectedPatient.postureFileData,
				gaitManualNotes: selectedPatient.gaitManualNotes,
				gaitFileName: selectedPatient.gaitFileName,
				gaitFileData: selectedPatient.gaitFileData,
				tenderness: selectedPatient.tenderness,
				warmth: selectedPatient.warmth,
				scar: selectedPatient.scar,
				crepitus: selectedPatient.crepitus,
				odema: selectedPatient.odema,
				mmt: selectedPatient.mmt,
				specialTest: selectedPatient.specialTest,
				differentialDiagnosis: selectedPatient.differentialDiagnosis,
				finalDiagnosis: selectedPatient.finalDiagnosis,
				shortTermGoals: selectedPatient.shortTermGoals,
				longTermGoals: selectedPatient.longTermGoals,
				rehabProtocol: selectedPatient.rehabProtocol,
				advice: selectedPatient.advice,
				managementRemarks: selectedPatient.managementRemarks,
				nextFollowUpDate: selectedPatient.nextFollowUpDate,
				nextFollowUpTime: selectedPatient.nextFollowUpTime,
			};

			// Check if there's any existing report data to save as previous report
			const hasReportData = Object.values(currentReportData).some(val => 
				val !== undefined && val !== null && val !== '' && 
				!(Array.isArray(val) && val.length === 0) &&
				!(typeof val === 'object' && Object.keys(val).length === 0)
			);

			// Create report snapshot if there's existing report data
			if (hasReportData) {
				// Get the latest report number for this patient
				const versionsQuery = query(
					collection(db, 'reportVersions'),
					where('patientId', '==', selectedPatient.patientId),
					orderBy('version', 'desc')
				);
				const versionsSnapshot = await getDocs(versionsQuery);
				const nextVersion = versionsSnapshot.docs.length > 0 
					? (versionsSnapshot.docs[0].data().version as number) + 1 
					: 1;

				// Save report snapshot (remove undefined values for Firestore)
				await addDoc(collection(db, 'reportVersions'), {
					patientId: selectedPatient.patientId,
					patientName: selectedPatient.name,
					version: nextVersion,
					reportData: removeUndefined(currentReportData),
					createdBy: user?.displayName || user?.email || 'Unknown',
					createdById: user?.uid || '',
					createdAt: serverTimestamp(),
				});
			}

			// Update the patient document with new report data
			await updateDoc(patientRef, reportData);

			// Update selectedPatient state to reflect the new data
			setSelectedPatient(prev => prev ? { ...prev, ...reportData } : null);

			setSavedMessage(true);
			setTimeout(() => setSavedMessage(false), 3000);
		} catch (error) {
			console.error('Failed to save report', error);
			alert('Failed to save report. Please try again.');
		} finally {
			setSaving(false);
		}
	};

	const loadVersionHistory = async () => {
		if (!selectedPatient?.patientId) return;

		setLoadingVersions(true);
		try {
			const versionsQuery = query(
				collection(db, 'reportVersions'),
				where('patientId', '==', selectedPatient.patientId),
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

	const handleViewVersionHistory = async () => {
		setShowVersionHistory(true);
		await loadVersionHistory();
	};

	const handleDeleteVersion = async (version: typeof versionHistory[0]) => {
		if (!confirm(`Are you sure you want to delete Report #${version.version}? This action cannot be undone.`)) {
			return;
		}

		try {
			const versionRef = doc(db, 'reportVersions', version.id);
			await deleteDoc(versionRef);
			
			// Reload report history
			await loadVersionHistory();
			
			alert(`Report #${version.version} has been deleted successfully.`);
		} catch (error) {
			console.error('Failed to delete report', error);
			alert('Failed to delete report. Please try again.');
		}
	};

	const handleRestoreVersion = async (version: typeof versionHistory[0]) => {
		if (!selectedPatient?.id || !confirm(`Are you sure you want to load Report #${version.version}? This will replace the current report data and save the current state as a new report.`)) {
			return;
		}

		setSaving(true);
		try {
			const patientRef = doc(db, 'patients', selectedPatient.id);

			// Create a report snapshot of current data before loading previous report
			const currentReportData: Partial<PatientRecordFull> = {
				complaints: selectedPatient.complaints,
				presentHistory: selectedPatient.presentHistory,
				pastHistory: selectedPatient.pastHistory,
				med_xray: selectedPatient.med_xray,
				med_mri: selectedPatient.med_mri,
				med_report: selectedPatient.med_report,
				med_ct: selectedPatient.med_ct,
				surgicalHistory: selectedPatient.surgicalHistory,
				per_smoking: selectedPatient.per_smoking,
				per_drinking: selectedPatient.per_drinking,
				per_alcohol: selectedPatient.per_alcohol,
				per_drugs: selectedPatient.per_drugs,
				drugsText: selectedPatient.drugsText,
				sleepCycle: selectedPatient.sleepCycle,
				hydration: selectedPatient.hydration,
				nutrition: selectedPatient.nutrition,
				siteSide: selectedPatient.siteSide,
				onset: selectedPatient.onset,
				duration: selectedPatient.duration,
				natureOfInjury: selectedPatient.natureOfInjury,
				typeOfPain: selectedPatient.typeOfPain,
				vasScale: selectedPatient.vasScale,
				aggravatingFactor: selectedPatient.aggravatingFactor,
				relievingFactor: selectedPatient.relievingFactor,
				rom: selectedPatient.rom,
				treatmentProvided: selectedPatient.treatmentProvided,
				progressNotes: selectedPatient.progressNotes,
				physioName: selectedPatient.physioName,
				physioId: selectedPatient.physioId,
				dateOfConsultation: selectedPatient.dateOfConsultation,
				referredBy: selectedPatient.referredBy,
				chiefComplaint: selectedPatient.chiefComplaint,
				onsetType: selectedPatient.onsetType,
				mechanismOfInjury: selectedPatient.mechanismOfInjury,
				painType: selectedPatient.painType,
				painIntensity: selectedPatient.painIntensity,
				clinicalDiagnosis: selectedPatient.clinicalDiagnosis,
				treatmentPlan: selectedPatient.treatmentPlan,
				followUpVisits: selectedPatient.followUpVisits,
				currentPainStatus: selectedPatient.currentPainStatus,
				currentRom: selectedPatient.currentRom,
				currentStrength: selectedPatient.currentStrength,
				currentFunctionalAbility: selectedPatient.currentFunctionalAbility,
				complianceWithHEP: selectedPatient.complianceWithHEP,
				recommendations: selectedPatient.recommendations,
				physiotherapistRemarks: selectedPatient.physiotherapistRemarks,
				built: selectedPatient.built,
				posture: selectedPatient.posture,
				gaitAnalysis: selectedPatient.gaitAnalysis,
				mobilityAids: selectedPatient.mobilityAids,
				localObservation: selectedPatient.localObservation,
				swelling: selectedPatient.swelling,
				muscleWasting: selectedPatient.muscleWasting,
				postureManualNotes: selectedPatient.postureManualNotes,
				postureFileName: selectedPatient.postureFileName,
				postureFileData: selectedPatient.postureFileData,
				gaitManualNotes: selectedPatient.gaitManualNotes,
				gaitFileName: selectedPatient.gaitFileName,
				gaitFileData: selectedPatient.gaitFileData,
				tenderness: selectedPatient.tenderness,
				warmth: selectedPatient.warmth,
				scar: selectedPatient.scar,
				crepitus: selectedPatient.crepitus,
				odema: selectedPatient.odema,
				mmt: selectedPatient.mmt,
				specialTest: selectedPatient.specialTest,
				differentialDiagnosis: selectedPatient.differentialDiagnosis,
				finalDiagnosis: selectedPatient.finalDiagnosis,
				shortTermGoals: selectedPatient.shortTermGoals,
				longTermGoals: selectedPatient.longTermGoals,
				rehabProtocol: selectedPatient.rehabProtocol,
				advice: selectedPatient.advice,
				managementRemarks: selectedPatient.managementRemarks,
				nextFollowUpDate: selectedPatient.nextFollowUpDate,
				nextFollowUpTime: selectedPatient.nextFollowUpTime,
			};

			// Check if there's current report data to save as previous report
			const hasCurrentData = Object.values(currentReportData).some(val => 
				val !== undefined && val !== null && val !== '' && 
				!(Array.isArray(val) && val.length === 0) &&
				!(typeof val === 'object' && Object.keys(val).length === 0)
			);

			// Save current state as report before loading previous report
			if (hasCurrentData) {
				const versionsQuery = query(
					collection(db, 'reportVersions'),
					where('patientId', '==', selectedPatient.patientId),
					orderBy('version', 'desc')
				);
				const versionsSnapshot = await getDocs(versionsQuery);
				const nextVersion = versionsSnapshot.docs.length > 0 
					? (versionsSnapshot.docs[0].data().version as number) + 1 
					: 1;

				await addDoc(collection(db, 'reportVersions'), {
					patientId: selectedPatient.patientId,
					patientName: selectedPatient.name,
					version: nextVersion,
					reportData: removeUndefined(currentReportData),
					createdBy: user?.displayName || user?.email || 'Unknown',
					createdById: user?.uid || '',
					createdAt: serverTimestamp(),
					restoredFrom: version.version, // Track that this was created from a restore
				});
			}

			// Load the version data into the form
			setFormData(version.data);
			
			// Update the patient document with restored data
			const reportData: Record<string, any> = {
				...version.data,
				updatedAt: serverTimestamp(),
			};
			await updateDoc(patientRef, reportData);

			// Update selectedPatient state
			setSelectedPatient(prev => prev ? { ...prev, ...reportData } : null);

			// Reload report history to show the new report
			await loadVersionHistory();

			alert(`Report #${version.version} has been loaded successfully.`);
		} catch (error) {
			console.error('Failed to load report', error);
			alert('Failed to load report. Please try again.');
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

					<section className="section-card">
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
								<div className="loading-spinner" aria-hidden="true" />
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
													<div className="flex items-center gap-2">
														<select
															value={patient.status}
															onChange={event => handleStatusChange(patient.id, event.target.value as AdminPatientStatus)}
															disabled={updatingStatus[patient.id]}
															className="select-base text-xs py-1 px-2 min-w-[120px]"
														>
															{STATUS_OPTIONS.map(option => (
																<option key={option.value} value={option.value}>
																	{option.label}
																</option>
															))}
														</select>
														{updatingStatus[patient.id] && (
															<div className="h-4 w-4 animate-spin rounded-full border-2 border-sky-600 border-t-transparent" />
														)}
													</div>
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

		// Generate and download the PDF (print from viewer if needed)
		await generatePhysiotherapyReportPDF(payload);
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
							setFormData({});
							setPatientIdParam(null);
							setShowVersionHistory(false);
							router.replace('/clinical-team/edit-report');
						}}
						className="btn-secondary"
					>
						<i className="fas fa-arrow-left text-xs" aria-hidden="true" />
						Back to List
					</button>
				</header>

				{savedMessage && (
					<div className="mb-6 alert-success">
						<i className="fas fa-check mr-2" aria-hidden="true" />
						Report saved successfully!
					</div>
				)}

				<div className="section-card">
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
						<button 
							type="button" 
							onClick={handleViewVersionHistory} 
							className="btn-secondary" 
							disabled={!selectedPatient}
						>
							<i className="fas fa-history text-xs" aria-hidden="true" />
							Report History
						</button>
						<button type="button" onClick={handleSave} className="btn-primary" disabled={saving}>
							<i className="fas fa-save text-xs" aria-hidden="true" />
							{saving ? 'Saving...' : 'Save Report'}
						</button>
					</div>
				</div>
			</div>

			{/* Report History Modal */}
			{showVersionHistory && (
				<div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 px-4 py-6">
					<div className="bg-white rounded-lg shadow-xl max-w-4xl w-full mx-4 max-h-[95vh] overflow-hidden flex flex-col">
						<div className="flex items-center justify-between p-6 border-b border-slate-200">
							<h2 className="text-xl font-semibold text-slate-900">
								Report History - {selectedPatient?.name} ({selectedPatient?.patientId})
							</h2>
							<button
								type="button"
								onClick={() => setShowVersionHistory(false)}
								className="text-slate-400 hover:text-slate-600 transition"
								aria-label="Close"
							>
								<i className="fas fa-times text-xl" />
							</button>
						</div>
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
									{versionHistory.map((version) => (
										<div
											key={version.id}
											className="border border-slate-200 rounded-lg p-4 hover:bg-slate-50 transition"
										>
											<div className="flex items-center justify-between mb-3">
												<div>
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
											</div>
											<div className="text-xs text-slate-500 space-y-1 mb-3">
												{version.data.dateOfConsultation && (
													<p>Consultation Date: {version.data.dateOfConsultation}</p>
												)}
												{version.data.chiefComplaint && (
													<p>Chief Complaint: {version.data.chiefComplaint}</p>
												)}
												{version.data.clinicalDiagnosis && (
													<p>Diagnosis: {version.data.clinicalDiagnosis}</p>
												)}
											</div>
											<button
												type="button"
												onClick={() => setViewingVersion(version)}
												className="px-4 py-2 text-sm font-medium text-sky-600 bg-sky-50 border border-sky-200 rounded-md hover:bg-sky-100 transition"
											>
												<i className="fas fa-eye mr-2" />
												View Full Report
											</button>
										</div>
									))}
								</div>
							)}
						</div>
						<div className="flex items-center justify-end p-6 border-t border-slate-200">
							<button
								type="button"
								onClick={() => setShowVersionHistory(false)}
								className="px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 rounded-md hover:bg-slate-200 transition"
							>
								Close
							</button>
						</div>
					</div>
				</div>
			)}

			{/* View Report Modal */}
			{viewingVersion && selectedPatient && (
				<div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 px-4 py-6">
					<div className="bg-white rounded-lg shadow-xl max-w-6xl w-full mx-4 max-h-[95vh] overflow-hidden flex flex-col">
						<div className="flex items-center justify-between p-6 border-b border-slate-200">
							<h2 className="text-xl font-semibold text-slate-900">
								Report #{viewingVersion.version} - {selectedPatient.name} ({selectedPatient.patientId})
							</h2>
							<button
								type="button"
								onClick={() => setViewingVersion(null)}
								className="text-slate-400 hover:text-slate-600 transition"
								aria-label="Close"
							>
								<i className="fas fa-times text-xl" />
							</button>
						</div>
						<div className="flex-1 overflow-y-auto p-6">
							<div className="section-card">
								{/* Patient Information */}
								<div className="mb-8 border-b border-slate-200 pb-6">
									<h2 className="mb-4 text-xl font-bold text-sky-600">Physiotherapy Report</h2>
									<div className="mb-4 text-right text-sm text-slate-600">
										<div>
											<b>Clinic:</b> Centre For Sports Science, Kanteerava Stadium
										</div>
										<div>
											<b>Report Date:</b> {viewingVersion.data.dateOfConsultation || new Date(viewingVersion.createdAt).toLocaleDateString()}
										</div>
										<div>
											<b>Saved:</b> {new Date(viewingVersion.createdAt).toLocaleString()} by {viewingVersion.createdBy}
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

								{/* Assessment Section - Read Only */}
								<div className="space-y-6">
									{viewingVersion.data.dateOfConsultation && (
										<div>
											<label className="block text-xs font-medium text-slate-500 mb-1">Date of Consultation</label>
											<div className="text-sm text-slate-800 bg-slate-50 border border-slate-200 rounded-md px-3 py-2">
												{viewingVersion.data.dateOfConsultation}
											</div>
										</div>
									)}

									{viewingVersion.data.complaints && (
										<div>
											<label className="block text-xs font-medium text-slate-500 mb-1">Complaints</label>
											<div className="text-sm text-slate-800 bg-slate-50 border border-slate-200 rounded-md px-3 py-2 whitespace-pre-wrap">
												{viewingVersion.data.complaints}
											</div>
										</div>
									)}

									{viewingVersion.data.chiefComplaint && (
										<div>
											<label className="block text-xs font-medium text-slate-500 mb-1">Chief Complaint</label>
											<div className="text-sm text-slate-800 bg-slate-50 border border-slate-200 rounded-md px-3 py-2 whitespace-pre-wrap">
												{viewingVersion.data.chiefComplaint}
											</div>
										</div>
									)}

									{viewingVersion.data.presentHistory && (
										<div>
											<label className="block text-xs font-medium text-slate-500 mb-1">Present History</label>
											<div className="text-sm text-slate-800 bg-slate-50 border border-slate-200 rounded-md px-3 py-2 whitespace-pre-wrap">
												{viewingVersion.data.presentHistory}
											</div>
										</div>
									)}

									{viewingVersion.data.pastHistory && (
										<div>
											<label className="block text-xs font-medium text-slate-500 mb-1">Past History</label>
											<div className="text-sm text-slate-800 bg-slate-50 border border-slate-200 rounded-md px-3 py-2 whitespace-pre-wrap">
												{viewingVersion.data.pastHistory}
											</div>
										</div>
									)}

									{((viewingVersion.data.med_xray || viewingVersion.data.med_mri || viewingVersion.data.med_report || viewingVersion.data.med_ct) || viewingVersion.data.surgicalHistory) && (
										<div className="grid gap-4 sm:grid-cols-2">
											{(viewingVersion.data.med_xray || viewingVersion.data.med_mri || viewingVersion.data.med_report || viewingVersion.data.med_ct) && (
												<div>
													<label className="block text-xs font-medium text-slate-500 mb-1">Medical History</label>
													<div className="text-sm text-slate-800 bg-slate-50 border border-slate-200 rounded-md px-3 py-2">
														{[
															viewingVersion.data.med_xray && 'X-RAYS',
															viewingVersion.data.med_mri && 'MRI',
															viewingVersion.data.med_report && 'Reports',
															viewingVersion.data.med_ct && 'CT Scans'
														].filter(Boolean).join(', ') || '—'}
													</div>
												</div>
											)}
											{viewingVersion.data.surgicalHistory && (
												<div>
													<label className="block text-xs font-medium text-slate-500 mb-1">Surgical History</label>
													<div className="text-sm text-slate-800 bg-slate-50 border border-slate-200 rounded-md px-3 py-2 whitespace-pre-wrap">
														{viewingVersion.data.surgicalHistory}
													</div>
												</div>
											)}
										</div>
									)}

									{((viewingVersion.data.per_smoking || viewingVersion.data.per_drinking || viewingVersion.data.per_alcohol || viewingVersion.data.per_drugs) || viewingVersion.data.sleepCycle || viewingVersion.data.hydration || viewingVersion.data.nutrition) && (
										<div className="grid gap-4 sm:grid-cols-2">
											{(viewingVersion.data.per_smoking || viewingVersion.data.per_drinking || viewingVersion.data.per_alcohol || viewingVersion.data.per_drugs) && (
												<div>
													<label className="block text-xs font-medium text-slate-500 mb-1">Personal History</label>
													<div className="text-sm text-slate-800 bg-slate-50 border border-slate-200 rounded-md px-3 py-2">
														{[
															viewingVersion.data.per_smoking && 'Smoking',
															viewingVersion.data.per_drinking && 'Drinking',
															viewingVersion.data.per_alcohol && 'Alcohol',
															viewingVersion.data.per_drugs && `Drugs${viewingVersion.data.drugsText ? ` (${viewingVersion.data.drugsText})` : ''}`
														].filter(Boolean).join(', ') || '—'}
													</div>
												</div>
											)}
											{viewingVersion.data.sleepCycle && (
												<div>
													<label className="block text-xs font-medium text-slate-500 mb-1">Sleep Cycle</label>
													<div className="text-sm text-slate-800 bg-slate-50 border border-slate-200 rounded-md px-3 py-2">
														{viewingVersion.data.sleepCycle}
													</div>
												</div>
											)}
											{viewingVersion.data.hydration && (
												<div>
													<label className="block text-xs font-medium text-slate-500 mb-1">Hydration</label>
													<div className="text-sm text-slate-800 bg-slate-50 border border-slate-200 rounded-md px-3 py-2">
														{viewingVersion.data.hydration}/8 {HYDRATION_EMOJIS[Math.min(HYDRATION_EMOJIS.length - 1, Math.max(1, Number(viewingVersion.data.hydration)) - 1)]}
													</div>
												</div>
											)}
											{viewingVersion.data.nutrition && (
												<div>
													<label className="block text-xs font-medium text-slate-500 mb-1">Nutrition</label>
													<div className="text-sm text-slate-800 bg-slate-50 border border-slate-200 rounded-md px-3 py-2">
														{viewingVersion.data.nutrition}
													</div>
												</div>
											)}
										</div>
									)}

									{(viewingVersion.data.siteSide || viewingVersion.data.onset || viewingVersion.data.duration || viewingVersion.data.natureOfInjury || viewingVersion.data.typeOfPain || viewingVersion.data.aggravatingFactor || viewingVersion.data.relievingFactor) && (
										<div>
											<h3 className="text-sm font-semibold text-sky-600 mb-3 border-b border-sky-200 pb-2">Pain Assessment</h3>
											<div className="grid gap-4 sm:grid-cols-2">
												{viewingVersion.data.siteSide && (
													<div>
														<label className="block text-xs font-medium text-slate-500 mb-1">Site and Side</label>
														<div className="text-sm text-slate-800 bg-slate-50 border border-slate-200 rounded-md px-3 py-2">
															{viewingVersion.data.siteSide}
														</div>
													</div>
												)}
												{viewingVersion.data.onset && (
													<div>
														<label className="block text-xs font-medium text-slate-500 mb-1">Onset</label>
														<div className="text-sm text-slate-800 bg-slate-50 border border-slate-200 rounded-md px-3 py-2">
															{viewingVersion.data.onset}
														</div>
													</div>
												)}
												{viewingVersion.data.duration && (
													<div>
														<label className="block text-xs font-medium text-slate-500 mb-1">Duration</label>
														<div className="text-sm text-slate-800 bg-slate-50 border border-slate-200 rounded-md px-3 py-2">
															{viewingVersion.data.duration}
														</div>
													</div>
												)}
												{viewingVersion.data.natureOfInjury && (
													<div>
														<label className="block text-xs font-medium text-slate-500 mb-1">Nature of Injury</label>
														<div className="text-sm text-slate-800 bg-slate-50 border border-slate-200 rounded-md px-3 py-2">
															{viewingVersion.data.natureOfInjury}
														</div>
													</div>
												)}
												{viewingVersion.data.typeOfPain && (
													<div>
														<label className="block text-xs font-medium text-slate-500 mb-1">Type of Pain</label>
														<div className="text-sm text-slate-800 bg-slate-50 border border-slate-200 rounded-md px-3 py-2">
															{viewingVersion.data.typeOfPain}
														</div>
													</div>
												)}
												{viewingVersion.data.aggravatingFactor && (
													<div>
														<label className="block text-xs font-medium text-slate-500 mb-1">Aggravating Factor</label>
														<div className="text-sm text-slate-800 bg-slate-50 border border-slate-200 rounded-md px-3 py-2 whitespace-pre-wrap">
															{viewingVersion.data.aggravatingFactor}
														</div>
													</div>
												)}
												{viewingVersion.data.relievingFactor && (
													<div>
														<label className="block text-xs font-medium text-slate-500 mb-1">Relieving Factor</label>
														<div className="text-sm text-slate-800 bg-slate-50 border border-slate-200 rounded-md px-3 py-2 whitespace-pre-wrap">
															{viewingVersion.data.relievingFactor}
														</div>
													</div>
												)}
											</div>
										</div>
									)}

									{viewingVersion.data.clinicalDiagnosis && (
										<div>
											<label className="block text-xs font-medium text-slate-500 mb-1">Clinical Diagnosis</label>
											<div className="text-sm text-slate-800 bg-slate-50 border border-slate-200 rounded-md px-3 py-2 whitespace-pre-wrap">
												{viewingVersion.data.clinicalDiagnosis}
											</div>
										</div>
									)}

									{viewingVersion.data.vasScale && (
										<div>
											<label className="block text-xs font-medium text-slate-500 mb-1">VAS Scale</label>
											<div className="text-sm text-slate-800 bg-slate-50 border border-slate-200 rounded-md px-3 py-2">
												{viewingVersion.data.vasScale} {VAS_EMOJIS[Math.min(VAS_EMOJIS.length - 1, Math.max(1, Number(viewingVersion.data.vasScale)) - 1)]}
											</div>
										</div>
									)}

									{viewingVersion.data.rom && Object.keys(viewingVersion.data.rom).length > 0 && (
										<div>
											<label className="block text-xs font-medium text-slate-500 mb-2">ROM (Range of Motion)</label>
											<div className="bg-slate-50 border border-slate-200 rounded-md p-4">
												{Object.entries(viewingVersion.data.rom).map(([joint, data]: [string, any]) => (
													<div key={joint} className="mb-4 last:mb-0">
														<h6 className="text-sm font-semibold text-sky-600 mb-2">{joint}</h6>
														{data && typeof data === 'object' && (
															<div className="text-xs text-slate-700 space-y-1 ml-4">
																{Object.entries(data).map(([motion, value]: [string, any]) => (
																	<div key={motion}>
																		<span className="font-medium">{motion}:</span> {String(value || '—')}
																	</div>
																))}
															</div>
														)}
													</div>
												))}
											</div>
										</div>
									)}

									{viewingVersion.data.mmt && Object.keys(viewingVersion.data.mmt).length > 0 && (
										<div>
											<label className="block text-xs font-medium text-slate-500 mb-2">MMT (Manual Muscle Testing)</label>
											<div className="bg-slate-50 border border-slate-200 rounded-md p-4">
												{Object.entries(viewingVersion.data.mmt).map(([joint, data]: [string, any]) => (
													<div key={joint} className="mb-4 last:mb-0">
														<h6 className="text-sm font-semibold text-sky-600 mb-2">{joint}</h6>
														{data && typeof data === 'object' && (
															<div className="text-xs text-slate-700 space-y-1 ml-4">
																{Object.entries(data).map(([motion, value]: [string, any]) => (
																	<div key={motion}>
																		<span className="font-medium">{motion}:</span> {String(value || '—')}
																	</div>
																))}
															</div>
														)}
													</div>
												))}
											</div>
										</div>
									)}

									{viewingVersion.data.recommendations && (
										<div>
											<label className="block text-xs font-medium text-slate-500 mb-1">Recommendations</label>
											<div className="text-sm text-slate-800 bg-slate-50 border border-slate-200 rounded-md px-3 py-2 whitespace-pre-wrap">
												{viewingVersion.data.recommendations}
											</div>
										</div>
									)}

									{viewingVersion.data.physiotherapistRemarks && (
										<div>
											<label className="block text-xs font-medium text-slate-500 mb-1">Physiotherapist Remarks</label>
											<div className="text-sm text-slate-800 bg-slate-50 border border-slate-200 rounded-md px-3 py-2 whitespace-pre-wrap">
												{viewingVersion.data.physiotherapistRemarks}
											</div>
										</div>
									)}

									{viewingVersion.data.nextFollowUpDate && (
										<div className="grid gap-4 sm:grid-cols-2">
											<div>
												<label className="block text-xs font-medium text-slate-500 mb-1">Next Follow-up Date</label>
												<div className="text-sm text-slate-800 bg-slate-50 border border-slate-200 rounded-md px-3 py-2">
													{viewingVersion.data.nextFollowUpDate}
												</div>
											</div>
											{viewingVersion.data.nextFollowUpTime && (
												<div>
													<label className="block text-xs font-medium text-slate-500 mb-1">Next Follow-up Time</label>
													<div className="text-sm text-slate-800 bg-slate-50 border border-slate-200 rounded-md px-3 py-2">
														{viewingVersion.data.nextFollowUpTime}
													</div>
												</div>
											)}
										</div>
									)}
								</div>
							</div>
						</div>
						<div className="flex items-center justify-end p-6 border-t border-slate-200">
							<button
								type="button"
								onClick={() => setViewingVersion(null)}
								className="px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 rounded-md hover:bg-slate-200 transition"
							>
								Close
							</button>
						</div>
					</div>
				</div>
			)}
		</div>
	);
}
