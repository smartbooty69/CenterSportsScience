'use client';

import { useEffect, useMemo, useState } from 'react';
import { collection, doc, onSnapshot, updateDoc, query, where, getDocs, addDoc, serverTimestamp, type QuerySnapshot, type Timestamp } from 'firebase/firestore';
import * as XLSX from 'xlsx';

import {
	type AdminAppointmentRecord,
	type AdminPatientRecord,
} from '@/lib/adminMockData';
import { auth, db } from '@/lib/firebase';
import PageHeader from '@/components/PageHeader';
import { sendEmailNotification } from '@/lib/email';
import { sendSMSNotification, isValidPhoneNumber } from '@/lib/sms';
import { getCurrentBillingCycle, getNextBillingCycle, getBillingCycleId, getMonthName, type BillingCycle } from '@/lib/billingUtils';
import { getRemainingFreeSessions, normalizeSessionAllowance } from '@/lib/sessionAllowance';
import { recordSessionUsageForAppointment } from '@/lib/sessionAllowanceClient';
import type { RecordSessionUsageResult } from '@/lib/sessionAllowanceClient';
import type { SessionAllowance } from '@/lib/types';

interface StaffMember {
	id: string;
	userName: string;
	role: string;
	status: string;
	userEmail?: string;
}

type DateFilter = 'all' | '15' | '30' | '180' | '365';

interface PendingDraft {
	amount: string;
	date: string;
}

interface InvoiceDetails {
	patient: string;
	appointmentId: string;
	doctor: string;
	billingDate: string;
	amount: string;
}

const dateOptions: Array<{ label: string; value: DateFilter }> = [
	{ value: 'all', label: 'All Time' },
	{ value: '15', label: 'Last 15 Days' },
	{ value: '30', label: 'Last 1 Month' },
	{ value: '180', label: 'Last 6 Months' },
	{ value: '365', label: 'Last 1 Year' },
];

const rupee = (value: number) =>
	new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(value);

const parseDate = (value?: string) => {
	if (!value) return null;
	const parsed = new Date(value);
	return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const isWithinDays = (value: string | undefined, window: DateFilter) => {
	if (window === 'all') return true;
	const target = parseDate(value);
	if (!target) return false;
	const now = new Date();
	const days = Number(window);
	const past = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
	return target >= past && target <= now;
};

export default function Billing() {
	const [appointments, setAppointments] = useState<(AdminAppointmentRecord & { id: string; amount?: number })[]>([]);
	const [patients, setPatients] = useState<(AdminPatientRecord & { id?: string; patientType?: string; sessionAllowance?: SessionAllowance })[]>([]);
	const [staff, setStaff] = useState<StaffMember[]>([]);

	const [doctorFilter, setDoctorFilter] = useState<'all' | string>('all');
	const [pendingWindow, setPendingWindow] = useState<DateFilter>('all');
	const [completedWindow, setCompletedWindow] = useState<DateFilter>('all');

	const [pendingDrafts, setPendingDrafts] = useState<Record<string, PendingDraft>>({});
	const [isInvoiceOpen, setIsInvoiceOpen] = useState(false);
	const [invoiceDetails, setInvoiceDetails] = useState<InvoiceDetails | null>(null);
	const [syncing, setSyncing] = useState(false);
	const [loading, setLoading] = useState(true);
	const [sendingNotifications, setSendingNotifications] = useState(false);
	const [resettingCycle, setResettingCycle] = useState(false);

	const [defaultBillingDate] = useState(() => new Date().toISOString().slice(0, 10));
	const [currentCycle, setCurrentCycle] = useState(() => getCurrentBillingCycle());
	const [billingCycles, setBillingCycles] = useState<BillingCycle[]>([]);
	const [selectedCycleId, setSelectedCycleId] = useState<string | 'current'>('current');

	// Load appointments from Firestore
	useEffect(() => {
		const unsubscribe = onSnapshot(
			collection(db, 'appointments'),
			(snapshot: QuerySnapshot) => {
				const mapped = snapshot.docs.map(docSnap => {
					const data = docSnap.data() as Record<string, unknown>;
					const created = (data.createdAt as Timestamp | undefined)?.toDate?.();
					return {
						id: docSnap.id,
						appointmentId: data.appointmentId ? String(data.appointmentId) : '',
						patientId: data.patientId ? String(data.patientId) : '',
						patient: data.patient ? String(data.patient) : '',
						doctor: data.doctor ? String(data.doctor) : '',
						date: data.date ? String(data.date) : '',
						time: data.time ? String(data.time) : '',
						status: (data.status as string) ?? 'pending',
						billing: data.billing ? (data.billing as { amount?: string; date?: string }) : undefined,
						amount: data.amount ? Number(data.amount) : 1200,
						createdAt: created ? created.toISOString() : (data.createdAt as string | undefined) || new Date().toISOString(),
					} as AdminAppointmentRecord & { id: string; amount?: number };
				});
				setAppointments(mapped);
				setLoading(false);
			},
			error => {
				console.error('Failed to load appointments', error);
				setAppointments([]);
				setLoading(false);
			}
		);

		return () => unsubscribe();
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
						gender: data.gender ? String(data.gender) : '',
						phone: data.phone ? String(data.phone) : '',
						email: data.email ? String(data.email) : '',
						address: data.address ? String(data.address) : '',
						complaint: data.complaint ? String(data.complaint) : '',
						status: (data.status as string) ?? 'pending',
						registeredAt: created ? created.toISOString() : (data.registeredAt as string | undefined) || new Date().toISOString(),
						patientType: data.patientType ? String(data.patientType) : undefined,
						sessionAllowance: data.sessionAllowance
							? normalizeSessionAllowance(data.sessionAllowance as Record<string, unknown>)
							: undefined,
					} as AdminPatientRecord & { id: string };
				});
				setPatients(mapped);
			},
			error => {
				console.error('Failed to load patients', error);
				setPatients([]);
			}
		);

		return () => unsubscribe();
	}, []);

	// Load staff from Firestore
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
					} as StaffMember;
				});
				setStaff(mapped);
			},
			error => {
				console.error('Failed to load staff', error);
				setStaff([]);
			}
		);

		return () => unsubscribe();
	}, []);

	// Load billing cycles from Firestore
	useEffect(() => {
		const unsubscribe = onSnapshot(
			collection(db, 'billingCycles'),
			(snapshot: QuerySnapshot) => {
				const mapped = snapshot.docs.map(docSnap => {
					const data = docSnap.data();
					const created = (data.createdAt as Timestamp | undefined)?.toDate?.();
					const closed = (data.closedAt as Timestamp | undefined)?.toDate?.();
					return {
						id: docSnap.id,
						startDate: data.startDate ? String(data.startDate) : '',
						endDate: data.endDate ? String(data.endDate) : '',
						month: data.month ? Number(data.month) : 1,
						year: data.year ? Number(data.year) : new Date().getFullYear(),
						status: (data.status as 'active' | 'closed' | 'pending') || 'pending',
						createdAt: created ? created.toISOString() : new Date().toISOString(),
						closedAt: closed ? closed.toISOString() : undefined,
					} as BillingCycle;
				});
				setBillingCycles(mapped);
			},
			error => {
				console.error('Failed to load billing cycles', error);
				setBillingCycles([]);
			}
		);

		return () => unsubscribe();
	}, []);

	// Sync completed appointments to billing
	useEffect(() => {
		if (loading || syncing || appointments.length === 0 || patients.length === 0) return;

		const syncAppointmentsToBilling = async () => {
			setSyncing(true);
			try {
				const completedAppointments = appointments.filter(
					appt => appt.status === 'completed' && !appt.billing
				);

				if (completedAppointments.length === 0) {
					setSyncing(false);
					return;
				}

				for (const appt of completedAppointments) {
					if (!appt.appointmentId || !appt.patientId) continue;

					// Get patient data
					const patient = patients.find(p => p.patientId === appt.patientId);
					if (!patient) {
						console.warn(`Patient not found for appointment ${appt.appointmentId}`);
						continue;
					}

					// Fetch patient document to get patientType and paymentType
					const patientQuery = query(collection(db, 'patients'), where('patientId', '==', appt.patientId));
					const patientSnapshot = await getDocs(patientQuery);
					
					if (patientSnapshot.empty) {
						console.warn(`Patient document not found for appointment ${appt.appointmentId}`);
						continue;
					}

					const patientData = patientSnapshot.docs[0].data();
					const patientType = (patientData.patientType as string) || '';
					const paymentType = (patientData.paymentType as string) || 'without';
					const standardAmount = appt.amount || 1200;

					// Apply billing rules based on patient type
					let shouldCreateBill = false;
					let billAmount = standardAmount;

					if (patientType === 'VIP') {
						// VIP: Create bill for every completed session as normal
						shouldCreateBill = true;
						billAmount = standardAmount;
					} else if (patientType === 'Paid') {
						// Paid: Check paymentType
						shouldCreateBill = true;
						if (paymentType === 'with') {
							// Apply concession discount (assuming 20% discount, adjust as needed)
							billAmount = standardAmount * 0.8;
						} else {
							// Without concession: standard amount
							billAmount = standardAmount;
						}
					} else if (patientType === 'Dyes') {
						// Dyes: Only create bill if count >= 500
						// Count existing billing records for this patient (appointments with billing info)
						const existingBillCount = appointments.filter(
							a => a.patientId === appt.patientId && a.billing
						).length;
						
						if (existingBillCount >= 500) {
							shouldCreateBill = true;
							billAmount = standardAmount;
						} else {
							// Skip creating bill if count < 500
							console.log(`Skipping bill for Dyes patient ${appt.patientId}: count is ${existingBillCount} (< 500)`);
							continue;
						}
					} else if (patientType === 'Gethhma') {
						// Gethhma: Treat as "Paid" without concession
						shouldCreateBill = true;
						billAmount = standardAmount;
					} else {
						// Unknown patient type: default behavior (create bill)
						shouldCreateBill = true;
						billAmount = standardAmount;
					}

					// Update appointment with billing info if rules allow
					if (shouldCreateBill) {
						await updateDoc(doc(db, 'appointments', appt.id), {
							billing: {
								amount: billAmount.toFixed(2),
								date: defaultBillingDate,
							},
						});
					}
				}
			} catch (error) {
				console.error('Failed to sync appointments to billing', error);
			} finally {
				setSyncing(false);
			}
		};

		syncAppointmentsToBilling();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [appointments.length, patients.length, loading]);

	const patientLookup = useMemo(() => {
		const map = new Map<string, AdminPatientRecord & { id?: string; patientType?: string; sessionAllowance?: SessionAllowance }>();
		for (const patient of patients) {
			map.set(patient.patientId, patient);
		}
		return map;
	}, [patients]);

	const doctorOptions = useMemo(() => {
		const set = new Set<string>();
		staff.forEach(member => {
			if (member.role === 'ClinicalTeam' && member.status !== 'Inactive' && member.userName) {
				set.add(member.userName);
			}
		});
		appointments.forEach(appointment => {
			if (appointment.doctor) set.add(appointment.doctor);
		});
		return Array.from(set).sort((a, b) => a.localeCompare(b));
	}, [staff, appointments]);

	const pendingRows = useMemo(() => {
		return appointments
			.map(appointment => ({ appointment }))
			.filter(entry => entry.appointment.status === 'completed' && !entry.appointment.billing)
			.filter(entry => (doctorFilter === 'all' ? true : entry.appointment.doctor === doctorFilter))
			.filter(entry => isWithinDays(entry.appointment.date, pendingWindow))
			.map(entry => {
				const patient = entry.appointment.patientId
					? patientLookup.get(entry.appointment.patientId)
					: undefined;
				const patientName =
					entry.appointment.patient || (patient ? patient.name : undefined) || entry.appointment.patientId || 'N/A';
				return { ...entry, patientName, patientRecord: patient };
			});
	}, [appointments, doctorFilter, pendingWindow, patientLookup]);

	const billingHistoryRows = useMemo(() => {
		return appointments
			.map(appointment => ({ appointment }))
			.filter(entry => entry.appointment.billing && entry.appointment.billing.amount)
			.filter(entry => (doctorFilter === 'all' ? true : entry.appointment.doctor === doctorFilter))
			.filter(entry => isWithinDays(entry.appointment.billing?.date, completedWindow))
			.map(entry => {
				const patient = entry.appointment.patientId
					? patientLookup.get(entry.appointment.patientId)
					: undefined;
				const patientName =
					entry.appointment.patient || (patient ? patient.name : undefined) || entry.appointment.patientId || 'N/A';
				const amount = Number(entry.appointment.billing?.amount ?? 0);
				return { ...entry, patientName, amount };
			});
	}, [appointments, doctorFilter, completedWindow, patientLookup]);

	const totalCollections = useMemo(
		() => billingHistoryRows.reduce((sum, row) => sum + (Number.isFinite(row.amount) ? row.amount : 0), 0),
		[billingHistoryRows]
	);

	useEffect(() => {
		setPendingDrafts(prev => {
			const next: Record<string, PendingDraft> = {};
			let changed = false;
			for (const row of pendingRows) {
				const appointmentId = row.appointment.id;
				const existing = prev[appointmentId];
				if (existing) {
					next[appointmentId] = existing;
				} else {
					next[appointmentId] = { amount: '', date: defaultBillingDate };
					changed = true;
				}
			}
			changed = changed || Object.keys(prev).length !== Object.keys(next).length;
			return changed ? next : prev;
		});
	}, [pendingRows, defaultBillingDate]);

	const handlePendingDraftChange = (appointmentId: string, field: keyof PendingDraft, value: string) => {
		setPendingDrafts(prev => ({
			...prev,
			[appointmentId]: {
				...(prev[appointmentId] ?? { amount: '', date: defaultBillingDate }),
				[field]: value,
			},
		}));
	};

	const handleSaveBilling = async (appointmentId: string) => {
		const draft = pendingDrafts[appointmentId] ?? { amount: '', date: defaultBillingDate };
		const amountValue = Number(draft.amount);
		if (!draft.amount || Number.isNaN(amountValue) || amountValue <= 0) {
			alert('Please enter a valid amount.');
			return;
		}
		if (!draft.date) {
			alert('Please select a billing date.');
			return;
		}

		const appointment = appointments.find(a => a.id === appointmentId);
		if (!appointment) {
			alert('Appointment not found.');
			return;
		}

		const wasAlreadyCompleted = appointment.status === 'completed';
		const patient = appointment.patientId ? patientLookup.get(appointment.patientId) : undefined;
		const staffMember = staff.find(s => s.userName === appointment.doctor);

		let sessionUsageResult: RecordSessionUsageResult | null = null;

		try {
			await updateDoc(doc(db, 'appointments', appointmentId), {
				status: 'completed',
				billing: {
					amount: amountValue.toFixed(2),
					date: draft.date,
				},
			});

			// Send notifications only if status changed from non-completed to completed
			if (!wasAlreadyCompleted) {
				if (patient?.id) {
					try {
						sessionUsageResult = await recordSessionUsageForAppointment({
							patientDocId: patient.id,
							patientType: patient.patientType,
							appointmentId,
							sessionCost: amountValue,
						});
					} catch (sessionError) {
						console.error('Failed to record DYES session usage:', sessionError);
					}
				}

				// Send notification to patient
				if (patient?.email) {
					try {
						await sendEmailNotification({
							to: patient.email,
							subject: `Appointment Completed - ${appointment.date}`,
							template: 'appointment-status-changed',
							data: {
								patientName: appointment.patient || patient.name,
								patientEmail: patient.email,
								patientId: appointment.patientId,
								doctor: appointment.doctor,
								date: appointment.date,
								time: appointment.time,
								appointmentId: appointment.appointmentId,
								status: 'Completed',
							},
						});
					} catch (emailError) {
						console.error('Failed to send completion email to patient:', emailError);
					}
				}

				// Send notification to staff member
				if (staffMember?.userEmail) {
					try {
						await sendEmailNotification({
							to: staffMember.userEmail,
							subject: `Appointment Completed - ${appointment.patient} on ${appointment.date}`,
							template: 'appointment-status-changed',
							data: {
								patientName: appointment.patient || patient?.name,
								patientEmail: staffMember.userEmail,
								patientId: appointment.patientId,
								doctor: appointment.doctor,
								date: appointment.date,
								time: appointment.time,
								appointmentId: appointment.appointmentId,
								status: 'Completed',
							},
						});
					} catch (emailError) {
						console.error('Failed to send completion email to staff:', emailError);
					}
				}

				if (sessionUsageResult && !sessionUsageResult.wasFree && patient?.email) {
					try {
						await sendEmailNotification({
							to: patient.email,
							subject: `Session Balance Update - ${appointment.patient || patient.name}`,
							template: 'session-balance',
							data: {
								recipientName: appointment.patient || patient.name,
								recipientType: 'patient',
								patientName: appointment.patient || patient.name,
								patientEmail: patient.email,
								patientId: appointment.patientId,
								appointmentDate: appointment.date,
								appointmentTime: appointment.time,
								freeSessionsRemaining: sessionUsageResult.remainingFreeSessions,
								pendingPaidSessions: sessionUsageResult.allowance.pendingPaidSessions,
								pendingChargeAmount: sessionUsageResult.allowance.pendingChargeAmount,
							},
						});
					} catch (sessionEmailError) {
						console.error('Failed to send session balance email to patient:', sessionEmailError);
					}
				}

				if (sessionUsageResult && !sessionUsageResult.wasFree && staffMember?.userEmail) {
					try {
						await sendEmailNotification({
							to: staffMember.userEmail,
							subject: `Pending Sessions Alert - ${appointment.patient || patient?.name}`,
							template: 'session-balance',
							data: {
								recipientName: staffMember.userName,
								recipientType: 'therapist',
								patientName: appointment.patient || patient?.name || 'Patient',
								patientEmail: staffMember.userEmail,
								patientId: appointment.patientId,
								appointmentDate: appointment.date,
								appointmentTime: appointment.time,
								freeSessionsRemaining: sessionUsageResult.remainingFreeSessions,
								pendingPaidSessions: sessionUsageResult.allowance.pendingPaidSessions,
								pendingChargeAmount: sessionUsageResult.allowance.pendingChargeAmount,
							},
						});
					} catch (sessionEmailError) {
						console.error('Failed to send session balance email to staff:', sessionEmailError);
					}
				}
			}

			setPendingDrafts(prev => {
				const next = { ...prev };
				delete next[appointmentId];
				return next;
			});
		} catch (error) {
			console.error('Failed to save billing', error);
			alert('Failed to save billing. Please try again.');
		}
	};

	const openInvoice = (details: InvoiceDetails) => {
		setInvoiceDetails(details);
		setIsInvoiceOpen(true);
	};

	const closeInvoice = () => {
		setInvoiceDetails(null);
		setIsInvoiceOpen(false);
	};

	const handlePrintInvoice = () => {
		if (!invoiceDetails) return;
		const win = window.open('', '', 'width=720,height=720');
		if (!win) return;
		win.document.write(`<html><head><title>Invoice</title>
			<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" />
		</head><body class="p-4">
		<h4 style="color:#045a9c;">Clinical Billing Invoice</h4>
		<table class="table table-borderless">
			<tr><td><strong>Patient:</strong></td><td>${invoiceDetails.patient}</td></tr>
			<tr><td><strong>Appointment ID:</strong></td><td>${invoiceDetails.appointmentId}</td></tr>
			<tr><td><strong>Clinician:</strong></td><td>${invoiceDetails.doctor}</td></tr>
			<tr><td><strong>Billing Date:</strong></td><td>${invoiceDetails.billingDate}</td></tr>
			<tr><td><strong>Amount:</strong></td><td>${rupee(Number(invoiceDetails.amount))}</td></tr>
		</table>
		<hr />
		<p>Thank you for your payment!</p>
		</body></html>`);
		win.document.close();
		win.focus();
		win.print();
	};

	const handleExportHistory = (format: 'csv' | 'excel' = 'csv') => {
		if (!billingHistoryRows.length) {
			alert('No billing history to export.');
			return;
		}
		const rows = [
			['Patient ID', 'Patient Name', 'Clinician', 'Appointment Date', 'Billing Amount', 'Billing Date'],
			...billingHistoryRows.map(row => [
				row.appointment.patientId ?? '',
				row.patientName ?? '',
				row.appointment.doctor ?? '',
				row.appointment.date ?? '',
				Number(row.amount).toFixed(2),
				row.appointment.billing?.date ?? '',
			]),
		];

		if (format === 'csv') {
			const csv = rows
				.map(line => line.map(value => `"${String(value).replace(/"/g, '""')}"`).join(','))
				.join('\n');

			const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
			const url = URL.createObjectURL(blob);

			const link = document.createElement('a');
			link.href = url;
			link.setAttribute('download', `billing-history-${new Date().toISOString().slice(0, 10)}.csv`);
			document.body.appendChild(link);
			link.click();
			document.body.removeChild(link);
			URL.revokeObjectURL(url);
		} else {
			// Excel export
			const ws = XLSX.utils.aoa_to_sheet(rows);
			const wb = XLSX.utils.book_new();
			XLSX.utils.book_append_sheet(wb, ws, 'Billing History');
			
			// Set column widths
			ws['!cols'] = [
				{ wch: 15 }, // Patient ID
				{ wch: 25 }, // Patient Name
				{ wch: 20 }, // Clinician
				{ wch: 18 }, // Appointment Date
				{ wch: 15 }, // Billing Amount
				{ wch: 15 }, // Billing Date
			];

			XLSX.writeFile(wb, `billing-history-${new Date().toISOString().slice(0, 10)}.xlsx`);
		}
	};

	const handleMonthlyReset = async () => {
		if (!confirm('Are you sure you want to close the current billing cycle and start a new one? This action cannot be undone.')) {
			return;
		}

		setResettingCycle(true);
		try {
			// Close current cycle
			const currentCycleId = getBillingCycleId(currentCycle.month, currentCycle.year);
			const existingCycle = billingCycles.find(c => 
				c.month === currentCycle.month && c.year === currentCycle.year
			);

			if (existingCycle && existingCycle.status === 'active') {
				await updateDoc(doc(db, 'billingCycles', existingCycle.id), {
					status: 'closed',
					closedAt: serverTimestamp(),
				});
			}

			// Create new cycle (next month)
			const nextCycle = getNextBillingCycle();
			const newCycleId = getBillingCycleId(nextCycle.month, nextCycle.year);
			
			// Check if next cycle already exists
			const nextCycleExists = billingCycles.find(c => 
				c.month === nextCycle.month && c.year === nextCycle.year
			);

			if (!nextCycleExists) {
				await addDoc(collection(db, 'billingCycles'), {
					id: newCycleId,
					startDate: nextCycle.startDate,
					endDate: nextCycle.endDate,
					month: nextCycle.month,
					year: nextCycle.year,
					status: 'active',
					createdAt: serverTimestamp(),
				});
			} else {
				await updateDoc(doc(db, 'billingCycles', nextCycleExists.id), {
					status: 'active',
				});
			}

			setCurrentCycle(nextCycle);
			alert('Billing cycle reset successfully!');
		} catch (error) {
			console.error('Failed to reset billing cycle', error);
			alert('Failed to reset billing cycle. Please try again.');
		} finally {
			setResettingCycle(false);
		}
	};

	const handleSendBillingNotifications = async () => {
		if (!confirm('Send billing notifications to all patients with pending bills older than 3 days?')) {
			return;
		}

		setSendingNotifications(true);
		try {
			const user = auth.currentUser;
			if (!user) throw new Error('Not authenticated');
			const token = await user.getIdToken();
			const response = await fetch('/api/billing/notifications?days=3', {
				headers: { Authorization: `Bearer ${token}` },
			});
			const result = await response.json();

			if (result.success) {
				alert(`Notifications sent successfully!\n\nEmails: ${result.emailsSent}\nSMS: ${result.smsSent}\nBills notified: ${result.billsNotified}`);
			} else {
				alert(`Failed to send notifications: ${result.message || 'Unknown error'}`);
			}
		} catch (error) {
			console.error('Failed to send billing notifications', error);
			alert('Failed to send billing notifications. Please try again.');
		} finally {
			setSendingNotifications(false);
		}
	};

	const handleExportPending = (format: 'csv' | 'excel' = 'csv') => {
		if (pendingRows.length === 0) {
			alert('No pending items to export.');
		 return;
		}
		const rows = [
			['Patient', 'Clinician', 'Visit Date', 'Draft Amount (₹)', 'Draft Billing Date'],
			...pendingRows.map(row => {
				const draft = pendingDrafts[row.appointment.id] ?? { amount: '', date: defaultBillingDate };
				return [
					row.patientName || '',
					row.appointment.doctor || '',
					row.appointment.date || '',
					draft.amount || '',
					draft.date || '',
				];
			}),
		];
		if (format === 'csv') {
			const csv = rows.map(line => line.map(value => `"${String(value).replace(/"/g, '""')}"`).join(',')).join('\n');
			const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
			const url = URL.createObjectURL(blob);
			const link = document.createElement('a');
			link.href = url;
			link.setAttribute('download', `pending-billing-${new Date().toISOString().slice(0, 10)}.csv`);
			document.body.appendChild(link);
			link.click();
			document.body.removeChild(link);
			URL.revokeObjectURL(url);
		} else {
			const ws = XLSX.utils.aoa_to_sheet(rows);
			const wb = XLSX.utils.book_new();
			XLSX.utils.book_append_sheet(wb, ws, 'Pending Billing');
			ws['!cols'] = [
				{ wch: 25 }, // Patient
				{ wch: 20 }, // Clinician
				{ wch: 14 }, // Visit Date
				{ wch: 16 }, // Draft Amount
				{ wch: 16 }, // Draft Billing Date
			];
			XLSX.writeFile(wb, `pending-billing-${new Date().toISOString().slice(0, 10)}.xlsx`);
		}
	};

	const isWithinCycle = (dateIso: string | undefined, cycle?: { startDate?: string; endDate?: string }) => {
		if (!dateIso || !cycle?.startDate || !cycle?.endDate) return false;
		const d = new Date(dateIso);
		if (Number.isNaN(d.getTime())) return false;
		const start = new Date(cycle.startDate);
		const end = new Date(cycle.endDate);
		return d >= start && d <= end;
	};

	const selectedCycle = useMemo(() => {
		if (selectedCycleId === 'current') return currentCycle;
		return billingCycles.find(c => c.id === selectedCycleId) || currentCycle;
	}, [selectedCycleId, billingCycles, currentCycle]);

	const cycleSummary = useMemo(() => {
		const cycle = selectedCycle;
		if (!cycle) {
			return {
				pendingCount: 0,
				completedCount: 0,
				collectedAmount: 0,
				byClinician: [] as Array<{ doctor: string; amount: number }>,
			};
		}
		let pendingCount = 0;
		let completedCount = 0;
		let collectedAmount = 0;
		const byClinicianMap = new Map<string, number>();

		for (const appt of appointments) {
			// Pending within cycle = completed appointment with no billing, visit date within cycle
			if (appt.status === 'completed' && !appt.billing && isWithinCycle(appt.date, cycle)) {
				pendingCount += 1;
			}
			// Collections within cycle = billing date within cycle
			const billDate = appt.billing?.date;
			const billAmount = Number(appt.billing?.amount ?? 0);
			if (billDate && isWithinCycle(billDate, cycle)) {
				completedCount += 1;
				collectedAmount += Number.isFinite(billAmount) ? billAmount : 0;
				const key = appt.doctor || 'Unassigned';
				byClinicianMap.set(key, (byClinicianMap.get(key) || 0) + (Number.isFinite(billAmount) ? billAmount : 0));
			}
		}

		const byClinician = Array.from(byClinicianMap.entries())
			.map(([doctor, amount]) => ({ doctor, amount }))
			.sort((a, b) => b.amount - a.amount);

		return { pendingCount, completedCount, collectedAmount, byClinician };
	}, [appointments, selectedCycle]);

	return (
		<div className="min-h-svh bg-slate-50 px-6 py-10">
			<div className="mx-auto max-w-6xl space-y-10">
				<PageHeader
					badge="Admin"
					title="Billing & Payments"
					description="Track outstanding invoices, post collections, and generate payment receipts."
					actions={
						<div className="flex gap-2">
							<button
								type="button"
								onClick={() => handleExportHistory('csv')}
								className="inline-flex items-center rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white shadow-md transition hover:bg-sky-500 focus-visible:bg-sky-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600"
							>
								<i className="fas fa-file-csv mr-2 text-sm" aria-hidden="true" />
								Export CSV
							</button>
							<button
								type="button"
								onClick={() => handleExportHistory('excel')}
								className="inline-flex items-center rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-md transition hover:bg-emerald-500 focus-visible:bg-emerald-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600"
							>
								<i className="fas fa-file-excel mr-2 text-sm" aria-hidden="true" />
								Export Excel
							</button>
						</div>
					}
				/>

				<div className="border-t border-slate-200" />

				{/* Billing Cycle Management */}
				<section className="rounded-2xl bg-white p-6 shadow-[0_18px_40px_rgba(15,23,42,0.07)]">
					<div className="mb-4 flex items-center justify-between">
						<div>
							<h3 className="text-lg font-semibold text-slate-900">Billing Cycle Management</h3>
							<p className="text-sm text-slate-600">
								Current Cycle: <span className="font-medium">{getMonthName(currentCycle.month)} {currentCycle.year}</span>
								{' '}({currentCycle.startDate} to {currentCycle.endDate})
							</p>
						</div>
						<div className="flex gap-2">
							<button
								type="button"
								onClick={handleSendBillingNotifications}
								disabled={sendingNotifications}
								className="inline-flex items-center rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white shadow-md transition hover:bg-amber-500 focus-visible:bg-amber-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-600 disabled:opacity-50 disabled:cursor-not-allowed"
							>
								<i className={`fas ${sendingNotifications ? 'fa-spinner fa-spin' : 'fa-bell'} mr-2 text-sm`} aria-hidden="true" />
								{sendingNotifications ? 'Sending...' : 'Send Notifications'}
							</button>
							<button
								type="button"
								onClick={handleMonthlyReset}
								disabled={resettingCycle}
								className="inline-flex items-center rounded-lg bg-purple-600 px-4 py-2 text-sm font-semibold text-white shadow-md transition hover:bg-purple-500 focus-visible:bg-purple-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-purple-600 disabled:opacity-50 disabled:cursor-not-allowed"
							>
								<i className={`fas ${resettingCycle ? 'fa-spinner fa-spin' : 'fa-sync-alt'} mr-2 text-sm`} aria-hidden="true" />
								{resettingCycle ? 'Resetting...' : 'Reset Monthly Cycle'}
							</button>
						</div>
					</div>
					{billingCycles.length > 0 && (
						<div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-4">
							<p className="mb-2 text-sm font-medium text-slate-700">Recent Billing Cycles:</p>
							<div className="flex flex-wrap gap-2">
								{billingCycles.slice(-6).reverse().map(cycle => (
									<span
										key={cycle.id}
										className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ${
											cycle.status === 'active'
												? 'bg-green-100 text-green-800'
												: cycle.status === 'closed'
												? 'bg-slate-100 text-slate-800'
												: 'bg-amber-100 text-amber-800'
										}`}
									>
										{getMonthName(cycle.month)} {cycle.year} ({cycle.status})
									</span>
								))}
							</div>
						</div>
					)}
				</section>

				{/* Cycle Reports */}
				<section className="rounded-2xl bg-white p-6 shadow-[0_18px_40px_rgba(15,23,42,0.07)]">
					<div className="mb-4 flex flex-wrap items-end justify-between gap-3">
						<div>
							<h3 className="text-lg font-semibold text-slate-900">Cycle Reports</h3>
							<p className="text-sm text-slate-600">Summary of pending and collections within a selected billing cycle.</p>
						</div>
						<div className="min-w-[220px]">
							<label className="block text-sm font-medium text-slate-700">Select Cycle</label>
							<select
								value={selectedCycleId}
								onChange={e => setSelectedCycleId(e.target.value as any)}
								className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 transition focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-200"
							>
								<option value="current">Current ({getMonthName(currentCycle.month)} {currentCycle.year})</option>
								{billingCycles.slice().reverse().map(cycle => (
									<option key={cycle.id} value={cycle.id}>
										{getMonthName(cycle.month)} {cycle.year} ({cycle.startDate} → {cycle.endDate})
									</option>
								))}
							</select>
						</div>
					</div>
					<div className="grid gap-4 sm:grid-cols-3">
						<div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
							<p className="text-xs uppercase tracking-wide text-slate-500">Pending (in cycle)</p>
							<p className="mt-2 text-2xl font-semibold text-slate-900">{cycleSummary.pendingCount}</p>
						</div>
						<div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
							<p className="text-xs uppercase tracking-wide text-slate-500">Bills Completed (in cycle)</p>
							<p className="mt-2 text-2xl font-semibold text-slate-900">{cycleSummary.completedCount}</p>
						</div>
						<div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
							<p className="text-xs uppercase tracking-wide text-slate-500">Collections (in cycle)</p>
							<p className="mt-2 text-2xl font-semibold text-slate-900">{rupee(cycleSummary.collectedAmount)}</p>
						</div>
					</div>
					{cycleSummary.byClinician.length > 0 && (
						<div className="mt-6 overflow-x-auto">
							<table className="min-w-full divide-y divide-slate-200 text-left text-sm text-slate-700">
								<thead className="bg-slate-100 text-xs uppercase tracking-wide text-slate-600">
									<tr>
										<th className="px-4 py-2 font-semibold">Clinician</th>
										<th className="px-4 py-2 font-semibold">Collections (₹)</th>
									</tr>
								</thead>
								<tbody className="divide-y divide-slate-100">
									{cycleSummary.byClinician.map(row => (
										<tr key={row.doctor}>
											<td className="px-4 py-2">{row.doctor}</td>
											<td className="px-4 py-2">{rupee(row.amount)}</td>
										</tr>
									))}
								</tbody>
							</table>
						</div>
					)}
				</section>

				<section className="flex flex-wrap gap-4 rounded-2xl bg-white p-6 shadow-[0_18px_40px_rgba(15,23,42,0.07)]">
				<div className="min-w-[220px] flex-1">
					<label className="block text-sm font-medium text-slate-700">Filter by Clinician</label>
					<select
						value={doctorFilter}
						onChange={event => setDoctorFilter(event.target.value)}
						className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 transition focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-200"
					>
						<option value="all">All Clinicians</option>
						{doctorOptions.map(option => (
							<option key={option} value={option}>
								{option}
							</option>
						))}
					</select>
				</div>
				<div className="min-w-[200px]">
					<label className="block text-sm font-medium text-slate-700">Pending Billing Period</label>
					<select
						value={pendingWindow}
						onChange={event => setPendingWindow(event.target.value as DateFilter)}
						className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 transition focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-200"
					>
						{dateOptions.map(option => (
							<option key={option.value} value={option.value}>
								{option.label}
							</option>
						))}
					</select>
				</div>
				<div className="min-w-[200px]">
					<label className="block text-sm font-medium text-slate-700">Completed Payments Period</label>
					<select
						value={completedWindow}
						onChange={event => setCompletedWindow(event.target.value as DateFilter)}
						className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 transition focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-200"
					>
						{dateOptions.map(option => (
							<option key={option.value} value={option.value}>
								{option.label}
							</option>
						))}
					</select>
				</div>
			</section>

			<p className="mx-auto mt-6 max-w-6xl text-sm font-medium text-sky-700">
				Total Collections (filtered): <span className="font-semibold">{rupee(totalCollections)}</span>
			</p>

			<section className="mx-auto mt-4 grid max-w-6xl gap-6 lg:grid-cols-2">
				<article className="rounded-2xl bg-white shadow-[0_18px_40px_rgba(15,23,42,0.07)]">
					<header className="flex items-center justify-between rounded-t-2xl bg-amber-100 px-5 py-4 text-amber-900">
						<div>
							<h2 className="text-lg font-semibold">Pending Billing</h2>
							<p className="text-xs text-amber-800/80">
								Completed appointments awaiting a recorded payment.
							</p>
						</div>
						<div className="flex items-center gap-2">
							<button
								type="button"
								onClick={() => handleExportPending('csv')}
								className="inline-flex items-center rounded-full border border-amber-300 px-3 py-1 text-xs font-semibold text-amber-900 transition hover:border-amber-400 focus-visible:outline-none"
							>
								<i className="fas fa-file-csv mr-1 text-[11px]" aria-hidden="true" />
								Export CSV
							</button>
							<button
								type="button"
								onClick={() => handleExportPending('excel')}
								className="inline-flex items-center rounded-full border border-amber-300 px-3 py-1 text-xs font-semibold text-amber-900 transition hover:border-amber-400 focus-visible:outline-none"
							>
								<i className="fas fa-file-excel mr-1 text-[11px]" aria-hidden="true" />
								Export Excel
							</button>
						<span className="inline-flex h-7 min-w-8 items-center justify-center rounded-full bg-amber-500 px-2 text-xs font-semibold text-white">
							{pendingRows.length}
						</span>
						</div>
					</header>
					<div className="overflow-x-auto px-5 pb-5 pt-3">
						<table className="min-w-full divide-y divide-amber-200 text-left text-sm text-slate-700">
							<thead className="bg-amber-50 text-xs uppercase tracking-wide text-amber-700">
								<tr>
									<th className="px-3 py-2 font-semibold">Patient</th>
									<th className="px-3 py-2 font-semibold">Clinician</th>
									<th className="px-3 py-2 font-semibold">Visit Date</th>
									<th className="px-3 py-2 font-semibold">Amount (₹)</th>
									<th className="px-3 py-2 font-semibold">Billing Date</th>
									<th className="px-3 py-2 font-semibold text-right">Action</th>
								</tr>
							</thead>
							<tbody className="divide-y divide-amber-100">
								{pendingRows.length === 0 ? (
									<tr>
										<td colSpan={6} className="px-3 py-6 text-center text-sm text-slate-500">
											No pending billing items for the selected filters.
										</td>
									</tr>
								) : (
									pendingRows.map(row => {
										const draft = pendingDrafts[row.appointment.id] ?? {
											amount: '',
											date: defaultBillingDate,
										};
										return (
											<tr key={row.appointment.id}>
												<td className="px-3 py-3 font-medium text-slate-800">
													<div>{row.patientName}</div>
													{row.patientRecord?.patientType === 'DYES' && (
														<p className="mt-0.5 text-xs text-amber-600">
															Pending sessions:{' '}
															{row.patientRecord.sessionAllowance?.pendingPaidSessions ?? 0}
															{row.patientRecord.sessionAllowance
																? ` · Free left: ${getRemainingFreeSessions(row.patientRecord.sessionAllowance)}`
																: ''}
														</p>
													)}
												</td>
												<td className="px-3 py-3 text-slate-600">{row.appointment.doctor || '—'}</td>
												<td className="px-3 py-3 text-slate-600">{row.appointment.date || '—'}</td>
												<td className="px-3 py-3">
													<input
														type="number"
														min="0"
														step="0.01"
														value={draft.amount}
														onChange={event =>
															handlePendingDraftChange(row.appointment.id, 'amount', event.target.value)
														}
														className="w-28 rounded border border-amber-200 px-2 py-1 text-sm text-slate-700 focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-200"
													/>
												</td>
												<td className="px-3 py-3">
													<input
														type="date"
														value={draft.date}
														onChange={event =>
															handlePendingDraftChange(row.appointment.id, 'date', event.target.value)
														}
														className="w-36 rounded border border-amber-200 px-2 py-1 text-sm text-slate-700 focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-200"
													/>
												</td>
												<td className="px-3 py-3 text-right">
													<button
														type="button"
														onClick={() => handleSaveBilling(row.appointment.id)}
														className="inline-flex items-center rounded-full bg-emerald-500 px-3 py-1 text-xs font-semibold text-white transition hover:bg-emerald-400 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-emerald-500"
													>
														<i className="fas fa-save mr-1 text-[11px]" aria-hidden="true" />
														Save
													</button>
												</td>
											</tr>
										);
									})
								)}
							</tbody>
						</table>
					</div>
				</article>

				<article className="rounded-2xl bg-white shadow-[0_18px_40px_rgba(15,23,42,0.07)]">
					<header className="flex items-center justify-between rounded-t-2xl bg-sky-500 px-5 py-4 text-white">
						<div>
							<h2 className="text-lg font-semibold">Billing History</h2>
							<p className="text-xs text-sky-100">Recorded invoices that have been completed.</p>
						</div>
						<span className="inline-flex h-7 min-w-8 items-center justify-center rounded-full bg-sky-700 px-2 text-xs font-semibold text-white">
							{billingHistoryRows.length}
						</span>
					</header>
					<div className="overflow-x-auto px-5 pb-5 pt-3">
						<table className="min-w-full divide-y divide-sky-200 text-left text-sm text-slate-700">
							<thead className="bg-sky-50 text-xs uppercase tracking-wide text-sky-700">
								<tr>
									<th className="px-3 py-2 font-semibold">Patient</th>
									<th className="px-3 py-2 font-semibold">Clinician</th>
									<th className="px-3 py-2 font-semibold">Visit Date</th>
									<th className="px-3 py-2 font-semibold">Amount (₹)</th>
									<th className="px-3 py-2 font-semibold">Billing Date</th>
									<th className="px-3 py-2 font-semibold text-right">Receipt</th>
								</tr>
							</thead>
							<tbody className="divide-y divide-sky-100">
								{billingHistoryRows.length === 0 ? (
									<tr>
										<td colSpan={6} className="px-3 py-6 text-center text-sm text-slate-500">
											No billing history for the selected filters.
										</td>
									</tr>
								) : (
									billingHistoryRows.map(row => (
										<tr key={row.appointment.id}>
											<td className="px-3 py-3 font-medium text-slate-800">{row.patientName}</td>
											<td className="px-3 py-3 text-slate-600">{row.appointment.doctor || '—'}</td>
											<td className="px-3 py-3 text-slate-600">{row.appointment.date || '—'}</td>
											<td className="px-3 py-3 text-slate-700">
												{rupee(Number(row.appointment.billing?.amount ?? 0))}
											</td>
											<td className="px-3 py-3 text-slate-600">{row.appointment.billing?.date || '—'}</td>
											<td className="px-3 py-3 text-right">
												<button
													type="button"
													onClick={() =>
														openInvoice({
															patient: row.patientName,
															appointmentId: row.appointment.appointmentId || row.appointment.patientId,
															doctor: row.appointment.doctor ?? '—',
															billingDate: row.appointment.billing?.date ?? '',
															amount: row.appointment.billing?.amount ?? '0',
														})
													}
													className="inline-flex items-center rounded-full border border-sky-200 px-3 py-1 text-xs font-semibold text-sky-700 transition hover:border-sky-400 hover:text-sky-800 focus-visible:border-sky-400 focus-visible:text-sky-800 focus-visible:outline-none"
												>
													<i className="fas fa-receipt mr-1 text-[11px]" aria-hidden="true" />
													Invoice
												</button>
											</td>
										</tr>
									))
								)}
							</tbody>
						</table>
					</div>
				</article>
			</section>

			{isInvoiceOpen && invoiceDetails && (
				<div
					role="dialog"
					aria-modal="true"
					className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 px-4 py-6"
				>
					<div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl">
						<header className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
							<h2 className="text-lg font-semibold text-slate-900">Invoice</h2>
							<button
								type="button"
								onClick={closeInvoice}
								className="rounded-full p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 focus-visible:bg-slate-100 focus-visible:text-slate-600 focus-visible:outline-none"
								aria-label="Close dialog"
							>
								<i className="fas fa-times" aria-hidden="true" />
							</button>
						</header>
						<div className="px-6 py-6">
							<h3 className="text-lg font-semibold text-sky-700">Clinical Billing Invoice</h3>
							<table className="mt-4 w-full text-sm text-slate-700">
								<tbody>
									<tr>
										<td className="py-1 font-medium text-slate-600">Patient</td>
										<td className="py-1 text-slate-800">{invoiceDetails.patient}</td>
									</tr>
									<tr>
										<td className="py-1 font-medium text-slate-600">Appointment ID</td>
										<td className="py-1 text-slate-800">{invoiceDetails.appointmentId}</td>
									</tr>
									<tr>
										<td className="py-1 font-medium text-slate-600">Clinician</td>
										<td className="py-1 text-slate-800">{invoiceDetails.doctor}</td>
									</tr>
									<tr>
										<td className="py-1 font-medium text-slate-600">Billing Date</td>
										<td className="py-1 text-slate-800">{invoiceDetails.billingDate}</td>
									</tr>
									<tr>
										<td className="py-1 font-medium text-slate-600">Amount</td>
										<td className="py-1 text-slate-800">{rupee(Number(invoiceDetails.amount))}</td>
									</tr>
								</tbody>
							</table>
							<p className="mt-6 text-sm text-slate-500">
								Thank you for your payment. Please keep this invoice for your records.
							</p>
						</div>
						<footer className="flex items-center justify-end gap-3 border-t border-slate-200 px-6 py-4">
							<button
								type="button"
								onClick={handlePrintInvoice}
								className="inline-flex items-center rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sky-500 focus-visible:bg-sky-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600"
							>
								<i className="fas fa-print mr-2 text-sm" aria-hidden="true" />
								Print
							</button>
							<button
								type="button"
								onClick={closeInvoice}
								className="inline-flex items-center rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition hover:border-slate-300 hover:text-slate-800 focus-visible:border-slate-300 focus-visible:text-slate-800 focus-visible:outline-none"
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



