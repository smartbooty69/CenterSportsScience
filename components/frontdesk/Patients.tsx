'use client';

import { useEffect, useMemo, useState } from 'react';
import { collection, doc, onSnapshot, updateDoc, deleteDoc, query, where, getDocs, writeBatch, addDoc, serverTimestamp, type QuerySnapshot, type Timestamp } from 'firebase/firestore';

import {
	type AdminGenderOption,
	type AdminPatientStatus,
	type AdminAppointmentStatus,
} from '@/lib/adminMockData';
import { db } from '@/lib/firebase';
import PageHeader from '@/components/PageHeader';
import { sendEmailNotification } from '@/lib/email';
import { sendSMSNotification, isValidPhoneNumber } from '@/lib/sms';
import { checkAppointmentConflict } from '@/lib/appointmentUtils';
import { createInitialSessionAllowance } from '@/lib/sessionAllowance';

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
	totalSessionsRequired?: number;
	remainingSessions?: number;
}

interface DayAvailability {
	enabled: boolean;
	slots: Array<{ start: string; end: string }>;
}

interface DateSpecificAvailability {
	[date: string]: DayAvailability;
}

interface StaffMember {
	id: string;
	userName: string;
	role: string;
	status: string;
	userEmail?: string;
	availability?: Record<string, DayAvailability>;
	dateSpecificAvailability?: DateSpecificAvailability;
}

interface AppointmentRecord {
	id: string;
	appointmentId: string;
	patientId: string;
	patient?: string;
	doctor: string;
	date: string;
	time: string;
	duration?: number;
	status: AdminAppointmentStatus;
}

interface BookingFormState {
	patientId: string;
	doctor: string;
	date: string;
	time: string;
	duration: number;
	notes?: string;
}

interface RegisterFormState {
	fullName: string;
	dob: string;
	gender: AdminGenderOption;
	phone: string;
	email: string;
	address: string;
	patientType: PatientTypeOption;
	paymentType: PaymentTypeOption | '';
	paymentDescription: string;
}

interface RegisterNotice {
	type: 'success' | 'error';
	message: string;
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
const SLOT_INTERVAL_MINUTES = 30;
const MAX_BLOCK_DURATION_MINUTES = 120;

const REGISTER_FORM_INITIAL_STATE: RegisterFormState = {
	fullName: '',
	dob: '',
	gender: '' as AdminGenderOption,
	phone: '',
	email: '',
	address: '',
	patientType: '' as PatientTypeOption,
	paymentType: '',
	paymentDescription: '',
};

async function generatePatientId(): Promise<string> {
	const prefix = 'CSS';
	const year = new Date().getFullYear();
	const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

	const patientsSnapshot = await getDocs(collection(db, 'patients'));
	const existingIds = new Set(patientsSnapshot.docs.map(docSnap => docSnap.data().patientId).filter(Boolean));

	let candidate = '';
	do {
		let randomPart = '';
		for (let index = 0; index < 7; index += 1) {
			randomPart += alphabet.charAt(Math.floor(Math.random() * alphabet.length));
		}
		candidate = `${prefix}${year}${randomPart}`;
	} while (existingIds.has(candidate));

	return candidate;
}

function formatDateLabel(value: string) {
	if (!value) return '—';
	const parsed = new Date(value);
	if (Number.isNaN(parsed.getTime())) return value;
	return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(parsed);
}

function timeStringToMinutes(time: string) {
	const [hours, minutes] = time.split(':').map(Number);
	if (Number.isNaN(hours) || Number.isNaN(minutes)) return 0;
	return hours * 60 + minutes;
}

function minutesToTimeString(totalMinutes: number) {
	const normalized = ((totalMinutes % (24 * 60)) + 24 * 60) % (24 * 60);
	const hours = Math.floor(normalized / 60);
	const minutes = normalized % 60;
	return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

function formatDurationLabel(minutes: number) {
	if (minutes % 60 === 0) {
		const hours = minutes / 60;
		return hours === 1 ? '1 hr' : `${hours} hrs`;
	}
	if (minutes > 60) {
		const hours = Math.floor(minutes / 60);
		const remaining = minutes % 60;
		return `${hours} hr ${remaining} min`;
	}
	return `${minutes} min`;
}

export default function Patients() {
	const [patients, setPatients] = useState<FrontdeskPatient[]>([]);
	const [appointments, setAppointments] = useState<AppointmentRecord[]>([]);
	const [staff, setStaff] = useState<StaffMember[]>([]);
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
	const [bookingForm, setBookingForm] = useState<BookingFormState>({
		patientId: '',
		doctor: '',
		date: '',
		time: '',
		duration: 0,
		notes: '',
	});
	const [selectedSlots, setSelectedSlots] = useState<string[]>([]);
	const [bookingLoading, setBookingLoading] = useState(false);
	const [showBookingModal, setShowBookingModal] = useState(false);
	const [showRegisterModal, setShowRegisterModal] = useState(false);
	const [registerForm, setRegisterForm] = useState<RegisterFormState>(REGISTER_FORM_INITIAL_STATE);
	const [registerFormErrors, setRegisterFormErrors] = useState<Partial<Record<keyof RegisterFormState, string>>>({});
	const [registerSubmitting, setRegisterSubmitting] = useState(false);
	const [registerNotice, setRegisterNotice] = useState<RegisterNotice | null>(null);
	const [openMenuId, setOpenMenuId] = useState<string | null>(null);

	useEffect(() => {
		function handleGlobalClick(event: MouseEvent) {
			const target = event.target as HTMLElement | null;
			if (!target?.closest('[data-patient-actions]')) {
				setOpenMenuId(null);
			}
		}

		document.addEventListener('mousedown', handleGlobalClick);
		return () => document.removeEventListener('mousedown', handleGlobalClick);
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
						totalSessionsRequired:
							typeof data.totalSessionsRequired === 'number'
								? data.totalSessionsRequired
								: data.totalSessionsRequired
									? Number(data.totalSessionsRequired)
									: undefined,
						remainingSessions:
							typeof data.remainingSessions === 'number'
								? data.remainingSessions
								: data.remainingSessions
									? Number(data.remainingSessions)
									: undefined,
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

	// Load appointments to check which patients have appointments
	useEffect(() => {
		const unsubscribe = onSnapshot(
			collection(db, 'appointments'),
			(snapshot: QuerySnapshot) => {
				const mapped = snapshot.docs.map(docSnap => {
					const data = docSnap.data();
					return {
						id: docSnap.id,
						appointmentId: data.appointmentId ? String(data.appointmentId) : '',
						patientId: data.patientId ? String(data.patientId) : '',
						patient: data.patient ? String(data.patient) : undefined,
						doctor: data.doctor ? String(data.doctor) : '',
						date: data.date ? String(data.date) : '',
						time: data.time ? String(data.time) : '',
						duration: typeof data.duration === 'number' ? data.duration : undefined,
						status: (data.status as AdminAppointmentStatus) ?? 'pending',
					} as AppointmentRecord;
				});
				setAppointments(mapped);
			},
			error => {
				console.error('Failed to load appointments', error);
				setAppointments([]);
			}
		);

		return () => unsubscribe();
	}, []);

	// Load staff for booking options
	useEffect(() => {
		const unsubscribe = onSnapshot(
			collection(db, 'staff'),
			(snapshot: QuerySnapshot) => {
				const mapped = snapshot.docs.map(docSnap => {
					const data = docSnap.data() as Record<string, unknown>;
					return {
						id: docSnap.id,
						userName: data.userName ? String(data.userName) : '',
						role: data.role ? String(data.role) : '',
						status: data.status ? String(data.status) : '',
						userEmail: data.userEmail ? String(data.userEmail) : undefined,
						availability: data.availability as Record<string, DayAvailability> | undefined,
						dateSpecificAvailability: data.dateSpecificAvailability as DateSpecificAvailability | undefined,
					} as StaffMember;
				});
				setStaff(
					mapped.filter(
						member =>
							member.status === 'Active' &&
							['Physiotherapist', 'StrengthAndConditioning', 'ClinicalTeam'].includes(member.role)
					)
				);
			},
			error => {
				console.error('Failed to load staff', error);
				setStaff([]);
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

	// Check if patient has any appointments (for first booking check)
	// Button should only show for patients who haven't done their first booking
	const patientHasAppointments = (patientId: string) => {
		return appointments.some(apt => apt.patientId === patientId);
	};

	const selectedBookingPatient = useMemo(() => {
		if (!bookingForm.patientId) return null;
		return patients.find(patient => patient.patientId === bookingForm.patientId) ?? null;
	}, [patients, bookingForm.patientId]);

	const doctorOptions = useMemo(() => {
		return staff
			.filter(
				member =>
					member.status === 'Active' &&
					['Physiotherapist', 'StrengthAndConditioning', 'ClinicalTeam'].includes(member.role)
			)
			.map(member => member.userName)
			.filter(Boolean)
			.sort((a, b) => a.localeCompare(b));
	}, [staff]);

	const availableSlots = useMemo<string[]>(() => {
		if (!bookingForm.date || !bookingForm.doctor) {
			return [];
		}

		const staffMember = staff.find(member => member.userName === bookingForm.doctor);
		if (!staffMember) {
			return [];
		}

		const dayAvailability = staffMember.dateSpecificAvailability?.[bookingForm.date];
		if (!dayAvailability || !dayAvailability.enabled || !dayAvailability.slots || dayAvailability.slots.length === 0) {
			return [];
		}

		const relevantAppointments = appointments.filter(
			appointment =>
				appointment.doctor === bookingForm.doctor &&
				appointment.date === bookingForm.date &&
				appointment.status !== 'cancelled'
		);

		const bookedSlotSet = new Set<string>();
		relevantAppointments.forEach(appointment => {
			if (!appointment.time) return;
			const durationMinutes = Math.max(SLOT_INTERVAL_MINUTES, appointment.duration ?? SLOT_INTERVAL_MINUTES);
			const blocks = Math.ceil(durationMinutes / SLOT_INTERVAL_MINUTES);
			const startMinutes = timeStringToMinutes(appointment.time);
			for (let block = 0; block < blocks; block += 1) {
				const blockStartMinutes = startMinutes + block * SLOT_INTERVAL_MINUTES;
				bookedSlotSet.add(minutesToTimeString(blockStartMinutes));
			}
		});

		const now = new Date();
		const selectedDate = new Date(`${bookingForm.date}T00:00:00`);
		const isToday = selectedDate.toDateString() === now.toDateString();
		const currentTimeMinutes = now.getHours() * 60 + now.getMinutes();

		const slots: string[] = [];

		dayAvailability.slots.forEach(slot => {
			if (!slot.start || !slot.end) return;

			const [startHour, startMinute] = slot.start.split(':').map(Number);
			const [endHour, endMinute] = slot.end.split(':').map(Number);

			if ([startHour, startMinute, endHour, endMinute].some(value => Number.isNaN(value))) {
				return;
			}

			const slotStart = new Date(selectedDate);
			slotStart.setHours(startHour, startMinute, 0, 0);
			const slotEnd = new Date(selectedDate);
			slotEnd.setHours(endHour, endMinute, 0, 0);

			if (slotEnd <= slotStart) {
				slotEnd.setDate(slotEnd.getDate() + 1);
			}

			const current = new Date(slotStart);
			while (current < slotEnd) {
				const timeString = `${String(current.getHours()).padStart(2, '0')}:${String(current.getMinutes()).padStart(2, '0')}`;

				if (bookedSlotSet.has(timeString)) {
					current.setMinutes(current.getMinutes() + SLOT_INTERVAL_MINUTES);
					continue;
				}

				if (isToday) {
					const minutesFromMidnight = current.getHours() * 60 + current.getMinutes();
					if (minutesFromMidnight < currentTimeMinutes) {
						current.setMinutes(current.getMinutes() + SLOT_INTERVAL_MINUTES);
						continue;
					}
				}

				slots.push(timeString);
				current.setMinutes(current.getMinutes() + SLOT_INTERVAL_MINUTES);
			}
		});

		return [...new Set(slots)].sort();
	}, [appointments, bookingForm.date, bookingForm.doctor, staff]);

	useEffect(() => {
		if (!bookingForm.doctor) return;
		if (!doctorOptions.includes(bookingForm.doctor)) {
			setBookingForm(prev => ({ ...prev, doctor: '', date: '', time: '', duration: 0 }));
			setSelectedSlots([]);
		}
	}, [bookingForm.doctor, doctorOptions]);

	useEffect(() => {
		setSelectedSlots(prevSelected => {
			if (prevSelected.length === 0) return prevSelected;
			const filtered = prevSelected.filter(slot => availableSlots.includes(slot));
			if (filtered.length === prevSelected.length) return prevSelected;
			setBookingForm(prev => ({
				...prev,
				time: filtered[0] ?? '',
				duration: filtered.length > 0 ? filtered.length * SLOT_INTERVAL_MINUTES : 0,
			}));
			return filtered;
		});
	}, [availableSlots]);

	const handleSlotToggle = (slot: string) => {
		setSelectedSlots(prevSelected => {
			let nextSelection: string[];
			if (prevSelected.includes(slot)) {
				nextSelection = prevSelected.filter(item => item !== slot);
			} else {
				nextSelection = [...prevSelected, slot];
			}

			nextSelection = [...nextSelection].sort((a, b) => a.localeCompare(b));

			if (nextSelection.length > 1) {
				const isContiguous = nextSelection.every((time, index) => {
					if (index === 0) return true;
					const previousTime = nextSelection[index - 1];
					return (
						timeStringToMinutes(time) - timeStringToMinutes(previousTime) === SLOT_INTERVAL_MINUTES
					);
				});

				if (!isContiguous) {
					nextSelection = [slot];
				}
			}

			const maxSlots = Math.max(1, Math.floor(MAX_BLOCK_DURATION_MINUTES / SLOT_INTERVAL_MINUTES));
			if (nextSelection.length > maxSlots) {
				nextSelection = nextSelection.slice(-maxSlots);
			}

			setBookingForm(prev => ({
				...prev,
				time: nextSelection[0] ?? '',
				duration: nextSelection.length > 0 ? nextSelection.length * SLOT_INTERVAL_MINUTES : 0,
			}));

			return nextSelection;
		});
	};

	const handleBookFirstAppointment = (patientId: string) => {
		if (patientHasAppointments(patientId)) {
			alert(
				'This patient already has an appointment. Subsequent appointments should be booked through the Clinical Dashboard.'
			);
			return;
		}
		setBookingForm({
			patientId,
			doctor: '',
			date: '',
			time: '',
			duration: 0,
			notes: '',
		});
		setSelectedSlots([]);
		setShowBookingModal(true);
		setOpenMenuId(null);
	};

	const handleCloseBookingModal = () => {
		setShowBookingModal(false);
		setBookingForm({
			patientId: '',
			doctor: '',
			date: '',
			time: '',
			duration: 0,
			notes: '',
		});
		setSelectedSlots([]);
	};

const handleOpenRegisterModal = () => {
	setRegisterForm(REGISTER_FORM_INITIAL_STATE);
	setRegisterFormErrors({});
	setShowRegisterModal(true);
};

const handleCloseRegisterModal = () => {
	setShowRegisterModal(false);
	setRegisterFormErrors({});
};

const handleRegisterFormChange =
	(field: keyof RegisterFormState) =>
	(event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
		const value = event.target.value;
		setRegisterForm(prev => ({
			...prev,
			[field]: value,
		}));
		setRegisterFormErrors(prev => ({
			...prev,
			[field]: undefined,
		}));
	};

const validateRegisterForm = () => {
	const errors: Partial<Record<keyof RegisterFormState, string>> = {};
	if (!registerForm.fullName.trim()) {
		errors.fullName = "Please enter the patient's full name.";
	}
	if (!registerForm.dob) {
		errors.dob = 'Please provide the date of birth.';
	}
	if (!registerForm.gender) {
		errors.gender = 'Please select gender.';
	}
	if (!registerForm.phone.trim()) {
		errors.phone = 'Please enter a valid phone number (10-15 digits).';
	} else if (!PHONE_REGEX.test(registerForm.phone.trim())) {
		errors.phone = 'Please enter a valid phone number (10-15 digits).';
	}
	if (registerForm.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(registerForm.email.trim())) {
		errors.email = 'Please enter a valid email address.';
	}
	if (!registerForm.patientType) {
		errors.patientType = 'Please select Type of Organization.';
	}
	if (registerForm.patientType === 'PAID' && !registerForm.paymentType) {
		errors.paymentType = 'Please select payment type.';
	}

	setRegisterFormErrors(errors);
	return Object.keys(errors).length === 0;
};

const handleRegisterPatient = async (event: React.FormEvent<HTMLFormElement>) => {
	event.preventDefault();
	if (!validateRegisterForm() || registerSubmitting) return;

	setRegisterSubmitting(true);
	try {
		const patientId = await generatePatientId();
		const trimmedEmail = registerForm.email.trim();
		const trimmedPhone = registerForm.phone.trim();

		const patientData = {
			patientId,
			name: registerForm.fullName.trim(),
			dob: registerForm.dob,
			gender: registerForm.gender,
			phone: trimmedPhone,
			email: trimmedEmail || null,
			address: registerForm.address.trim() || null,
			complaint: '',
			status: 'pending' as AdminPatientStatus,
			registeredAt: serverTimestamp(),
			patientType: registerForm.patientType as PatientTypeOption,
			paymentType:
				registerForm.patientType === 'PAID'
					? (registerForm.paymentType as PaymentTypeOption)
					: ('without' as PaymentTypeOption),
			paymentDescription:
				registerForm.patientType === 'PAID' ? registerForm.paymentDescription.trim() || null : null,
			sessionAllowance: registerForm.patientType === 'DYES' ? createInitialSessionAllowance() : null,
		};

		await addDoc(collection(db, 'patients'), patientData);

		let emailSent = false;
		if (trimmedEmail) {
			try {
				const emailResult = await sendEmailNotification({
					to: trimmedEmail,
					subject: `Welcome to Centre For Sports Science - Patient ID: ${patientId}`,
					template: 'patient-registered',
					data: {
						patientName: registerForm.fullName.trim(),
						patientEmail: trimmedEmail,
						patientId,
					},
				});
				emailSent = emailResult.success;
			} catch (emailError) {
				console.error('Failed to send registration email:', emailError);
			}
		}

		let smsSent = false;
		if (trimmedPhone && isValidPhoneNumber(trimmedPhone)) {
			try {
				const smsResult = await sendSMSNotification({
					to: trimmedPhone,
					template: 'patient-registered',
					data: {
						patientName: registerForm.fullName.trim(),
						patientPhone: trimmedPhone,
						patientId,
					},
				});
				smsSent = smsResult.success;
			} catch (smsError) {
				console.error('Failed to send registration SMS:', smsError);
			}
		}

		const confirmations: string[] = [];
		if (emailSent) confirmations.push('email');
		if (smsSent) confirmations.push('SMS');
		const confirmationText = confirmations.length ? ` Confirmation sent via ${confirmations.join(' and ')}.` : '';

		setRegisterNotice({
			type: 'success',
			message: `${registerForm.fullName.trim()} registered with ID ${patientId}.${confirmationText}`,
		});
		setRegisterForm(REGISTER_FORM_INITIAL_STATE);
		handleCloseRegisterModal();
	} catch (error) {
		console.error('Failed to register patient', error);
		setRegisterNotice({
			type: 'error',
			message: 'Failed to register patient. Please try again.',
		});
	} finally {
		setRegisterSubmitting(false);
	}
};

	const handleCreateAppointment = async () => {
		if (
			!bookingForm.patientId ||
			!bookingForm.doctor ||
			!bookingForm.date ||
			!bookingForm.time ||
			!bookingForm.duration
		) {
			alert('Please select clinician, date, and a time slot duration for the appointment.');
			return;
		}

		const selectedPatient = patients.find(p => p.patientId === bookingForm.patientId);
		const staffMember = staff.find(member => member.userName === bookingForm.doctor);

		if (!selectedPatient) {
			alert('Unable to find the selected patient.');
			return;
		}

		if (patientHasAppointments(selectedPatient.patientId)) {
			alert('This patient already has an appointment. Please use the Clinical Dashboard for future bookings.');
			return;
		}

		if (!staffMember) {
			alert('Unable to find the selected clinician.');
			return;
		}

		const conflict = checkAppointmentConflict(
			appointments.map(appointment => ({
				id: appointment.id,
				appointmentId: appointment.appointmentId,
				patient: appointment.patient || '',
				doctor: appointment.doctor,
				date: appointment.date,
				time: appointment.time,
				duration: appointment.duration,
				status: appointment.status,
			})),
			{
				doctor: bookingForm.doctor,
				date: bookingForm.date,
				time: bookingForm.time,
				duration: bookingForm.duration,
			}
		);

		if (conflict.hasConflict) {
			const proceed = window.confirm(
				`Warning: ${bookingForm.doctor} already has an appointment at this time.\nProceed anyway?`
			);
			if (!proceed) {
				return;
			}
		}

		setBookingLoading(true);
		try {
			const appointmentId = `APT${Date.now()}${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
			await addDoc(collection(db, 'appointments'), {
				appointmentId,
				patientId: selectedPatient.patientId,
				patient: selectedPatient.name,
				doctor: bookingForm.doctor,
				staffId: staffMember.id,
				date: bookingForm.date,
				time: bookingForm.time,
				duration: bookingForm.duration,
				status: 'pending' as AdminAppointmentStatus,
				notes: bookingForm.notes?.trim() || null,
				createdAt: serverTimestamp(),
			});

			if (typeof selectedPatient.totalSessionsRequired === 'number') {
				const completedCount = appointments.filter(
					a => a.patientId === bookingForm.patientId && a.status === 'completed'
				).length;
				const newRemaining = Math.max(0, selectedPatient.totalSessionsRequired - 1 - completedCount);

				if (selectedPatient.id) {
					const patientRef = doc(db, 'patients', selectedPatient.id);
					await updateDoc(patientRef, {
						remainingSessions: newRemaining,
					});
				}

				setPatients(prev =>
					prev.map(p =>
						p.id === selectedPatient.id ? { ...p, remainingSessions: newRemaining } : p
					)
				);
			}

			if (selectedPatient.id) {
				try {
					const patientRef = doc(db, 'patients', selectedPatient.id);
					const patientUpdate: Record<string, unknown> = {
						assignedDoctor: bookingForm.doctor,
					};
					if (!selectedPatient.status || selectedPatient.status === 'pending') {
						patientUpdate.status = 'ongoing';
					}

					await updateDoc(patientRef, patientUpdate);
				} catch (patientUpdateError) {
					console.error('Failed to update patient assignment', patientUpdateError);
				}
			}

			if (selectedPatient.email) {
				try {
					await sendEmailNotification({
						to: selectedPatient.email,
						subject: `Appointment Scheduled - ${bookingForm.date}`,
						template: 'appointment-created',
						data: {
							patientName: selectedPatient.name,
							patientEmail: selectedPatient.email,
							patientId: selectedPatient.patientId,
							doctor: bookingForm.doctor,
							date: bookingForm.date,
							time: bookingForm.time,
							appointmentId,
						},
					});
				} catch (emailError) {
					console.error('Failed to send confirmation email to patient:', emailError);
				}
			}

			if (selectedPatient.phone && isValidPhoneNumber(selectedPatient.phone)) {
				try {
					await sendSMSNotification({
						to: selectedPatient.phone,
						template: 'appointment-created',
						data: {
							patientName: selectedPatient.name,
							patientPhone: selectedPatient.phone,
							patientId: selectedPatient.patientId,
							doctor: bookingForm.doctor,
							date: bookingForm.date,
							time: bookingForm.time,
							appointmentId,
						},
					});
				} catch (smsError) {
					console.error('Failed to send confirmation SMS:', smsError);
				}
			}

			if (staffMember.userEmail) {
				try {
					await sendEmailNotification({
						to: staffMember.userEmail,
						subject: `New Appointment - ${selectedPatient.name} on ${bookingForm.date}`,
						template: 'appointment-created',
						data: {
							patientName: selectedPatient.name,
							patientEmail: selectedPatient.email || staffMember.userEmail,
							patientId: selectedPatient.patientId,
							doctor: bookingForm.doctor,
							date: bookingForm.date,
							time: bookingForm.time,
							appointmentId,
						},
					});
				} catch (emailError) {
					console.error('Failed to notify staff member:', emailError);
				}
			}

			alert('Appointment booked successfully.');
			handleCloseBookingModal();
		} catch (error) {
			console.error('Failed to create appointment', error);
			alert(`Failed to create appointment: ${error instanceof Error ? error.message : 'Unknown error'}`);
		} finally {
			setBookingLoading(false);
		}
	};

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
			const deleteDocsByQuery = async (targetQuery: any) => {
				const snapshot = await getDocs(targetQuery);
				if (snapshot.empty) return 0;
				const docs = snapshot.docs;
				const batchSize = 500;
				for (let index = 0; index < docs.length; index += batchSize) {
					const batch = writeBatch(db);
					docs.slice(index, index + batchSize).forEach(docSnap => {
						batch.delete(docSnap.ref);
					});
					await batch.commit();
				}
				return docs.length;
			};

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

			const collectAppointmentRefs = (docs: typeof appointmentsSnapshot.docs) => {
				docs.forEach(docSnap => {
					allAppointmentRefs.add(docSnap.id);
				});
			};

			collectAppointmentRefs(appointmentsSnapshot.docs);
			collectAppointmentRefs(appointmentsByNameSnapshot.docs);
			
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

			// Delete reports, transfer records, and notifications tied to this patient
			await Promise.all([
				deleteDocsByQuery(query(collection(db, 'reportVersions'), where('patientId', '==', patient.patientId))),
				deleteDocsByQuery(query(collection(db, 'transferRequests'), where('patientId', '==', patient.patientId))),
				deleteDocsByQuery(query(collection(db, 'transferHistory'), where('patientId', '==', patient.patientId))),
				deleteDocsByQuery(query(collection(db, 'notifications'), where('metadata.patientId', '==', patient.patientId))),
			]);

			// Delete patient subcollections (notes, attachments, history)
			if (patient.id) {
				const subcollections = ['notes', 'attachments', 'history'];
				for (const subcollectionName of subcollections) {
					await deleteDocsByQuery(query(collection(db, 'patients', patient.id, subcollectionName)));
				}
			}

			// Then delete the patient
			await deleteDoc(doc(db, 'patients', id));
			alert(`Patient "${patient.name}" and all associated records have been deleted successfully.`);
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
					actions={
						<div className="flex w-full justify-center mt-12 md:mt-0">
							<button type="button" onClick={handleOpenRegisterModal} className="btn-primary">
								<i className="fas fa-user-plus text-xs" aria-hidden="true" />
								Register Patient
							</button>
						</div>
					}
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
					<div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
						<div className="flex flex-col gap-3 sm:flex-row sm:items-center">
							<button type="button" onClick={() => { setSearchTerm(''); setStatusFilter('all'); }} className="btn-secondary">
								<i className="fas fa-eraser text-xs" aria-hidden="true" />
								Clear filters
							</button>
						</div>
						<span className="text-xs text-slate-500">
							Showing <span className="font-semibold text-slate-700">{filteredPatients.length}</span> of{' '}
							<span className="font-semibold text-slate-700">{patients.length}</span> patients
						</span>
					</div>
				</section>

				{registerNotice && (
					<div
						className={`flex items-start justify-between gap-4 rounded-xl border px-4 py-3 text-sm ${
							registerNotice.type === 'success'
								? 'border-emerald-200 bg-emerald-50 text-emerald-700'
								: 'border-rose-200 bg-rose-50 text-rose-700'
						}`}
					>
						<p>{registerNotice.message}</p>
						<button
							type="button"
							onClick={() => setRegisterNotice(null)}
							className="rounded-full p-2 text-current transition hover:bg-white/40 focus-visible:outline-none"
							aria-label="Dismiss message"
						>
							<i className="fas fa-times" aria-hidden="true" />
						</button>
					</div>
				)}

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
									{filteredPatients.map(patient => {
										const hasExistingAppointment = patientHasAppointments(patient.patientId);
										const bookingButtonClasses = [
											'inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-semibold',
											hasExistingAppointment
												? 'border-slate-200 bg-slate-100 text-slate-400 cursor-not-allowed'
												: 'border-emerald-200 bg-emerald-50 text-emerald-700 transition hover:border-emerald-300 hover:bg-emerald-100 focus-visible:border-emerald-300 focus-visible:bg-emerald-100 focus-visible:outline-none',
										].join(' ');

										return (
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
												<div className="flex items-center justify-end gap-2" data-patient-actions>
													<button
														type="button"
														onClick={() => handleBookFirstAppointment(patient.patientId)}
														className={bookingButtonClasses}
														disabled={hasExistingAppointment}
													>
														<i className="fas fa-calendar-plus text-[10px]" aria-hidden="true" />
														{hasExistingAppointment ? 'Booked' : 'Book'}
													</button>
													<div className="relative">
														<button
															type="button"
															onClick={event => {
																event.stopPropagation();
																setOpenMenuId(current => (current === patient.id ? null : patient.id ?? null));
															}}
															className="inline-flex items-center justify-center rounded-full border border-slate-200 p-2 text-slate-500 transition hover:border-slate-300 hover:text-slate-700 focus-visible:border-sky-300 focus-visible:text-slate-700 focus-visible:outline-none"
															aria-haspopup="menu"
															aria-expanded={openMenuId === patient.id}
															aria-label="More actions"
														>
															<svg
																xmlns="http://www.w3.org/2000/svg"
																viewBox="0 0 20 20"
																fill="currentColor"
																className="h-4 w-4"
															>
																<path d="M6 10a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0Zm5.5 0a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0ZM17 10a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0Z" />
															</svg>
														</button>
														{openMenuId === patient.id && (
															<div className="absolute right-0 z-20 mt-2 w-44 rounded-lg border border-slate-200 bg-white py-2 text-left text-sm shadow-lg">
																<button
																	type="button"
																	onClick={event => {
																		event.stopPropagation();
																		setOpenMenuId(null);
																		openDialogForEdit(patient.id!);
																	}}
																	className="flex w-full items-center gap-2 px-4 py-2 text-slate-600 transition hover:bg-slate-50 hover:text-slate-900"
																>
																	<i className="fas fa-edit text-xs" aria-hidden="true" />
																	Edit
																</button>
																<button
																	type="button"
																	onClick={event => {
																		event.stopPropagation();
																		setOpenMenuId(null);
																		handleDelete(patient.id!);
																	}}
																	disabled={deletingId === patient.id}
																	className="flex w-full items-center gap-2 px-4 py-2 text-rose-600 transition hover:bg-rose-50 hover:text-rose-700 disabled:cursor-not-allowed disabled:opacity-60"
																>
																	<i className="fas fa-trash text-xs" aria-hidden="true" />
																	{deletingId === patient.id ? 'Deleting…' : 'Delete'}
																</button>
															</div>
														)}
													</div>
												</div>
											</td>
										</tr>
									);
									})}
								</tbody>
							</table>
						</div>
					)}
				</section>
			</div>

			{/* Register Patient Modal */}
			{showRegisterModal && (
				<div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 px-4 py-6">
					<div className="w-full max-w-4xl rounded-2xl border border-slate-200 bg-white shadow-2xl">
						<header className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
							<div>
								<h2 className="text-lg font-semibold text-slate-900">Register Patient</h2>
								<p className="text-xs text-slate-500">Capture details and generate an ID instantly</p>
							</div>
							<button
								type="button"
								onClick={handleCloseRegisterModal}
								className="rounded-full p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 focus-visible:bg-slate-100 focus-visible:text-slate-600 focus-visible:outline-none"
								aria-label="Close dialog"
								disabled={registerSubmitting}
							>
								<i className="fas fa-times" aria-hidden="true" />
							</button>
						</header>
						<form onSubmit={handleRegisterPatient} className="max-h-[70vh] overflow-y-auto px-6 py-4 space-y-4">
							<div className="grid gap-4 md:grid-cols-12">
								<div className="md:col-span-6">
									<label className="block text-sm font-medium text-slate-700">
										Full Name <span className="text-rose-600">*</span>
									</label>
									<input
										type="text"
										value={registerForm.fullName}
										onChange={handleRegisterFormChange('fullName')}
										className="input-base"
										placeholder="Patient name"
										autoComplete="name"
										required
									/>
									{registerFormErrors.fullName && (
										<p className="mt-1 text-xs text-rose-500">{registerFormErrors.fullName}</p>
									)}
								</div>
								<div className="md:col-span-3">
									<label className="block text-sm font-medium text-slate-700">
										Date of Birth <span className="text-rose-600">*</span>
									</label>
									<input
										type="date"
										value={registerForm.dob}
										onChange={handleRegisterFormChange('dob')}
										className="input-base"
										required
									/>
									{registerFormErrors.dob && <p className="mt-1 text-xs text-rose-500">{registerFormErrors.dob}</p>}
								</div>
								<div className="md:col-span-3">
									<label className="block text-sm font-medium text-slate-700">
										Gender <span className="text-rose-600">*</span>
									</label>
									<select
										value={registerForm.gender}
										onChange={handleRegisterFormChange('gender')}
										className="select-base"
										required
									>
										{GENDER_OPTIONS.map(option => (
											<option key={option.value} value={option.value}>
												{option.label}
											</option>
										))}
									</select>
									{registerFormErrors.gender && (
										<p className="mt-1 text-xs text-rose-500">{registerFormErrors.gender}</p>
									)}
								</div>
							</div>

							<div className="grid gap-4 md:grid-cols-12">
								<div className="md:col-span-3">
									<label className="block text-sm font-medium text-slate-700">
										Phone Number <span className="text-rose-600">*</span>
									</label>
									<input
										type="tel"
										value={registerForm.phone}
										onChange={handleRegisterFormChange('phone')}
										className="input-base"
										placeholder="10-15 digits"
										pattern="[0-9]{10,15}"
										required
									/>
									{registerFormErrors.phone && <p className="mt-1 text-xs text-rose-500">{registerFormErrors.phone}</p>}
								</div>
								<div className="md:col-span-6">
									<label className="block text-sm font-medium text-slate-700">Email</label>
									<input
										type="email"
										value={registerForm.email}
										onChange={handleRegisterFormChange('email')}
										className="input-base"
										placeholder="name@example.com"
										autoComplete="email"
									/>
									{registerFormErrors.email && <p className="mt-1 text-xs text-rose-500">{registerFormErrors.email}</p>}
								</div>
							</div>

							<div className="grid gap-4 md:grid-cols-12">
								<div className="md:col-span-12">
									<label className="block text-sm font-medium text-slate-700">Address</label>
									<textarea
										value={registerForm.address}
										onChange={handleRegisterFormChange('address')}
										className="textarea-base"
										placeholder="Street, city, postal code"
										rows={2}
										autoComplete="street-address"
									/>
								</div>
							</div>

							<div className="grid gap-4 md:grid-cols-12">
								<div className="md:col-span-12">
									<label className="block text-sm font-medium text-slate-700">
										Type of Organization <span className="text-rose-600">*</span>
									</label>
									<div className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
										{(['DYES', 'VIP', 'GETHNA', 'PAID'] as const).map(type => (
											<label
												key={type}
												className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-3 transition hover:border-sky-300 hover:bg-sky-50 cursor-pointer"
											>
												<input
													type="radio"
													name="registerPatientType"
													value={type}
													checked={registerForm.patientType === type}
													onChange={() => {
														setRegisterForm(prev => ({
															...prev,
															patientType: type,
															paymentType: type === 'PAID' ? prev.paymentType : '',
															paymentDescription: type === 'PAID' ? prev.paymentDescription : '',
														}));
														setRegisterFormErrors(prev => ({
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
									{registerFormErrors.patientType && (
										<p className="mt-1 text-xs text-rose-500">{registerFormErrors.patientType}</p>
									)}
								</div>
							</div>

							{registerForm.patientType === 'PAID' && (
								<div className="grid gap-4 md:grid-cols-12">
									<div className="md:col-span-6">
										<label className="block text-sm font-medium text-slate-700">
											Type of Payment <span className="text-rose-600">*</span>
										</label>
										<select
											value={registerForm.paymentType}
											onChange={handleRegisterFormChange('paymentType')}
											className="select-base"
											required
										>
											<option value="">Select</option>
											{PAYMENT_OPTIONS.map(option => (
												<option key={option.value} value={option.value}>
													{option.label}
												</option>
											))}
										</select>
										{registerFormErrors.paymentType && (
											<p className="mt-1 text-xs text-rose-500">{registerFormErrors.paymentType}</p>
										)}
									</div>
									<div className="md:col-span-6">
										<label className="block text-sm font-medium text-slate-700">
											Payment Description / Concession Reason
										</label>
										<input
											type="text"
											value={registerForm.paymentDescription}
											onChange={handleRegisterFormChange('paymentDescription')}
											className="input-base"
											placeholder="Enter details (if any)"
										/>
									</div>
								</div>
							)}

							<footer className="flex items-center justify-end gap-3 border-t border-slate-200 pt-4">
								<button type="button" onClick={handleCloseRegisterModal} className="btn-secondary" disabled={registerSubmitting}>
									Cancel
								</button>
								<button type="submit" className="btn-primary" disabled={registerSubmitting}>
									{registerSubmitting ? (
										<>
											<div className="mr-2 inline-flex h-4 w-4 items-center justify-center rounded-full border-2 border-white border-t-transparent animate-spin" />
											Registering...
										</>
									) : (
										<>
											<i className="fas fa-user-plus text-xs" aria-hidden="true" />
											Register Patient
										</>
									)}
								</button>
							</footer>
						</form>
					</div>
				</div>
			)}

			{/* Booking Modal */}
			{showBookingModal && (
				<div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 px-4 py-6">
					<div className="w-full max-w-xl rounded-2xl border border-slate-200 bg-white shadow-2xl">
						<header className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
							<div>
								<h2 className="text-lg font-semibold text-slate-900">Book Appointment</h2>
								{selectedBookingPatient ? (
									<p className="text-xs text-slate-500">
										Booking first appointment for {selectedBookingPatient.name} (
										{selectedBookingPatient.patientId})
									</p>
								) : (
									<p className="text-xs text-rose-500">Selected patient is no longer available.</p>
								)}
							</div>
							<button
								type="button"
								onClick={handleCloseBookingModal}
								className="rounded-full p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 focus-visible:bg-slate-100 focus-visible:text-slate-600 focus-visible:outline-none"
								aria-label="Close dialog"
								disabled={bookingLoading}
							>
								<i className="fas fa-times" aria-hidden="true" />
							</button>
						</header>
						<div className="max-h-[70vh] overflow-y-auto px-6 py-4">
							<div className="space-y-4">
								<div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
									<p className="font-semibold text-slate-800">Patient Details</p>
									<p>{selectedBookingPatient?.name ?? 'Not available'}</p>
									<p>ID: {selectedBookingPatient?.patientId ?? '—'}</p>
									<p>Phone: {selectedBookingPatient?.phone ?? '—'}</p>
									<p>Email: {selectedBookingPatient?.email ?? '—'}</p>
								</div>

								<div className="grid gap-4 sm:grid-cols-2">
									<div>
										<label className="block text-sm font-medium text-slate-700">
											Clinician <span className="text-rose-500">*</span>
										</label>
										<select
											value={bookingForm.doctor}
											onChange={event => {
												setBookingForm(prev => ({
													...prev,
													doctor: event.target.value,
													date: '',
													time: '',
													duration: 0,
												}));
												setSelectedSlots([]);
											}}
											className="select-base mt-2"
											disabled={bookingLoading}
											required
										>
											<option value="">{doctorOptions.length ? 'Select clinician' : 'No clinicians available'}</option>
											{doctorOptions.map(option => (
												<option key={option} value={option}>
													{option}
												</option>
											))}
										</select>
										{doctorOptions.length === 0 && (
											<p className="mt-1 text-xs text-amber-600">No active clinicians are available right now.</p>
										)}
									</div>
									<div>
										<label className="block text-sm font-medium text-slate-700">
											Date <span className="text-rose-500">*</span>
										</label>
										<input
											type="date"
											className="input-base mt-2"
											value={bookingForm.date}
											onChange={event => {
												setBookingForm(prev => ({
													...prev,
													date: event.target.value,
													time: '',
													duration: 0,
												}));
												setSelectedSlots([]);
											}}
											min={new Date().toISOString().split('T')[0]}
											disabled={!bookingForm.doctor || bookingLoading}
											required
										/>
										{!bookingForm.doctor && (
											<p className="mt-1 text-xs text-slate-500">Pick a clinician to enable date selection.</p>
										)}
									</div>
								</div>

								<div>
									<label className="block text-sm font-medium text-slate-700">
										Time Slot <span className="text-rose-500">*</span>
									</label>
									{!bookingForm.doctor ? (
										<p className="mt-2 text-xs text-slate-500">Choose a clinician to see their available dates and slots.</p>
									) : !bookingForm.date ? (
										<p className="mt-2 text-xs text-slate-500">Select a date to view available time slots.</p>
									) : availableSlots.length === 0 ? (
										<div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
											No slots available for {bookingForm.doctor} on {bookingForm.date}. Pick another date or clinician.
										</div>
									) : (
										<div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
											{availableSlots.map(slot => {
												const slotEnd = minutesToTimeString(timeStringToMinutes(slot) + SLOT_INTERVAL_MINUTES);
												const isSelected = selectedSlots.includes(slot);
												return (
													<button
														type="button"
														key={slot}
														onClick={() => handleSlotToggle(slot)}
														className={`rounded-xl border px-3 py-2 text-sm font-medium shadow-sm transition ${
															isSelected
																? 'border-sky-500 bg-sky-50 text-sky-800 ring-2 ring-sky-200'
																: 'border-slate-200 bg-white text-slate-700 hover:border-sky-300 hover:bg-sky-50'
														}`}
														aria-pressed={isSelected}
														disabled={bookingLoading}
													>
														<div className="flex items-center justify-between">
															<div>
																<p className="font-semibold">{slot} – {slotEnd}</p>
																<p className="text-xs text-slate-500">30 minutes</p>
															</div>
															<span className={`text-xs ${isSelected ? 'text-sky-600' : 'text-slate-400'}`}>
																<i
																	className={`fas ${isSelected ? 'fa-check-circle' : 'fa-clock'}`}
																	aria-hidden="true"
																/>
															</span>
														</div>
													</button>
												);
											})}
										</div>
									)}
									{selectedSlots.length > 0 && (
										<p className="mt-2 text-xs font-medium text-slate-600">
											Selected duration:{' '}
											<span className="text-slate-900">{formatDurationLabel(selectedSlots.length * SLOT_INTERVAL_MINUTES)}</span>
										</p>
									)}
									{selectedSlots.length <= 1 && (
										<p className="mt-1 text-xs text-slate-500">
											Select consecutive slots to automatically combine them into longer appointments.
										</p>
									)}
								</div>

								<div>
									<label className="block text-sm font-medium text-slate-700">Notes (optional)</label>
									<textarea
										className="input-base mt-2"
										rows={3}
										value={bookingForm.notes}
										onChange={event => setBookingForm(prev => ({ ...prev, notes: event.target.value }))}
										placeholder="Add any notes for the clinician..."
									/>
								</div>
							</div>
						</div>
						<footer className="flex items-center justify-end gap-3 border-t border-slate-200 px-6 py-4">
							<button type="button" onClick={handleCloseBookingModal} className="btn-secondary" disabled={bookingLoading}>
								Cancel
							</button>
							<button
								type="button"
								onClick={handleCreateAppointment}
								className="btn-primary"
								disabled={
									bookingLoading ||
									!bookingForm.patientId ||
									!bookingForm.doctor ||
									!bookingForm.date ||
									!bookingForm.time ||
									!bookingForm.duration ||
									!selectedBookingPatient
								}
							>
								{bookingLoading ? (
									<>
										<div className="mr-2 inline-flex h-4 w-4 items-center justify-center rounded-full border-2 border-white border-t-transparent animate-spin" />
										Booking...
									</>
								) : (
									<>
										<i className="fas fa-check text-xs" aria-hidden="true" />
										Create Appointment
									</>
								)}
							</button>
						</footer>
					</div>
				</div>
			)}

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

