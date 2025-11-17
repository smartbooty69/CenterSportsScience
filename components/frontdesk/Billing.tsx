'use client';

import { useEffect, useMemo, useState } from 'react';
import { collection, doc, onSnapshot, addDoc, updateDoc, query, where, getDocs, getDoc, setDoc, serverTimestamp, type QuerySnapshot, type Timestamp } from 'firebase/firestore';
import * as XLSX from 'xlsx';
import { auth, db } from '@/lib/firebase';
import PageHeader from '@/components/PageHeader';
import { sendEmailNotification } from '@/lib/email';
import { sendSMSNotification, isValidPhoneNumber } from '@/lib/sms';
import { getCurrentBillingCycle, getNextBillingCycle, getBillingCycleId, getMonthName, type BillingCycle } from '@/lib/billingUtils';
import { type AdminPatientRecord } from '@/lib/adminMockData';
import { getRemainingFreeSessions, normalizeSessionAllowance } from '@/lib/sessionAllowance';
import { recordSessionUsageForAppointment } from '@/lib/sessionAllowanceClient';
import type { RecordSessionUsageResult } from '@/lib/sessionAllowanceClient';
import type { SessionAllowance } from '@/lib/types';

type BillingPatientRecord = AdminPatientRecord & {
	id?: string;
	assignedDoctor?: string;
	diagnosis?: string;
	treatmentProvided?: string;
	progressNotes?: string;
	referredBy?: string;
	patientType?: string;
	sessionAllowance?: SessionAllowance | null;
};

interface BillingRecord {
	id?: string;
	billingId: string;
	appointmentId?: string;
	patient: string;
	patientId: string;
	doctor?: string;
	amount: number;
	date: string;
	status: 'Pending' | 'Completed';
	paymentMode?: string;
	utr?: string;
	createdAt?: string;
	updatedAt?: string;
}

function getCurrentMonthYear() {
	const now = new Date();
	return `${now.getFullYear()}-${now.getMonth() + 1}`;
}

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

function numberToWords(num: number): string {
	const a = [
		'',
		'one',
		'two',
		'three',
		'four',
		'five',
		'six',
		'seven',
		'eight',
		'nine',
		'ten',
		'eleven',
		'twelve',
		'thirteen',
		'fourteen',
		'fifteen',
		'sixteen',
		'seventeen',
		'eighteen',
		'nineteen',
	];
	const b = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
	if (num === 0) return 'zero';
	if (num < 20) return a[num];
	if (num < 100) return b[Math.floor(num / 10)] + (num % 10 ? ' ' + a[num % 10] : '');
	if (num < 1000)
		return a[Math.floor(num / 100)] + ' hundred ' + (num % 100 !== 0 ? numberToWords(num % 100) : '');
	if (num < 100000)
		return (
			numberToWords(Math.floor(num / 1000)) +
			' thousand ' +
			(num % 1000 !== 0 ? numberToWords(num % 1000) : '')
		);
	if (num < 10000000)
		return (
			numberToWords(Math.floor(num / 100000)) +
			' lakh ' +
			(num % 100000 !== 0 ? numberToWords(num % 100000) : '')
		);
	return num.toString();
}

export default function Billing() {
	const [billing, setBilling] = useState<BillingRecord[]>([]);
	const [appointments, setAppointments] = useState<any[]>([]);
	const [patients, setPatients] = useState<BillingPatientRecord[]>([]);
	const [staff, setStaff] = useState<StaffMember[]>([]);
	const [loading, setLoading] = useState(true);
	const [filterRange, setFilterRange] = useState<string>('30');
	const [doctorFilter, setDoctorFilter] = useState<'all' | string>('all');
	const [pendingWindow, setPendingWindow] = useState<DateFilter>('all');
	const [completedWindow, setCompletedWindow] = useState<DateFilter>('all');
	const [selectedBill, setSelectedBill] = useState<BillingRecord | null>(null);
	const [showPayModal, setShowPayModal] = useState(false);
	const [showReportModal, setShowReportModal] = useState(false);
	const [showPaymentSlipModal, setShowPaymentSlipModal] = useState(false);
	const [paymentMode, setPaymentMode] = useState<'Cash' | 'UPI/Card'>('Cash');
	const [utr, setUtr] = useState('');
	const [selectedPatientId, setSelectedPatientId] = useState<string>('');
	const [syncing, setSyncing] = useState(false);
	const [resettingCycle, setResettingCycle] = useState(false);
	const [sendingNotifications, setSendingNotifications] = useState(false);
	const [currentCycle, setCurrentCycle] = useState(() => getCurrentBillingCycle());
	const [billingCycles, setBillingCycles] = useState<BillingCycle[]>([]);
	const [selectedCycleId, setSelectedCycleId] = useState<string | 'current'>('current');
	const [pendingDrafts, setPendingDrafts] = useState<Record<string, PendingDraft>>({});
	const [isInvoiceOpen, setIsInvoiceOpen] = useState(false);
	const [invoiceDetails, setInvoiceDetails] = useState<InvoiceDetails | null>(null);
	const [defaultBillingDate] = useState(() => new Date().toISOString().slice(0, 10));
	const [billingSettings, setBillingSettings] = useState({ defaultAmount: 1200, concessionDiscount: 0.8 });
	const [showSettingsModal, setShowSettingsModal] = useState(false);
	const [savingSettings, setSavingSettings] = useState(false);
	const [settingsDraft, setSettingsDraft] = useState({ defaultAmount: '1200', discountPercent: '20' });

	// Load billing records from Firestore
	useEffect(() => {
		const unsubscribe = onSnapshot(
			collection(db, 'billing'),
			(snapshot: QuerySnapshot) => {
				const mapped = snapshot.docs.map(docSnap => {
					const data = docSnap.data() as Record<string, unknown>;
					const created = (data.createdAt as Timestamp | undefined)?.toDate?.();
					const updated = (data.updatedAt as Timestamp | undefined)?.toDate?.();
					return {
						id: docSnap.id,
						billingId: data.billingId ? String(data.billingId) : '',
						appointmentId: data.appointmentId ? String(data.appointmentId) : undefined,
						patient: data.patient ? String(data.patient) : '',
						patientId: data.patientId ? String(data.patientId) : '',
						doctor: data.doctor ? String(data.doctor) : undefined,
						amount: data.amount ? Number(data.amount) : 0,
						date: data.date ? String(data.date) : '',
						status: (data.status as 'Pending' | 'Completed') || 'Pending',
						paymentMode: data.paymentMode ? String(data.paymentMode) : undefined,
						utr: data.utr ? String(data.utr) : undefined,
						createdAt: created ? created.toISOString() : undefined,
						updatedAt: updated ? updated.toISOString() : undefined,
					} as BillingRecord;
				});
				setBilling(mapped);
				setLoading(false);
			},
			error => {
				console.error('Failed to load billing', error);
				setBilling([]);
				setLoading(false);
			}
		);

		return () => unsubscribe();
	}, []);

	// Load appointments from Firestore for syncing
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
					};
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

	// Load billing settings from Firestore
	useEffect(() => {
		const loadBillingSettings = async () => {
			try {
				const settingsRef = doc(db, 'billingSettings', 'default');
				const settingsDoc = await getDoc(settingsRef);
				
				if (settingsDoc.exists()) {
					const settingsData = settingsDoc.data();
					const defaultAmount = settingsData.defaultAmount ? Number(settingsData.defaultAmount) : 1200;
					const discountPercent = settingsData.discountPercent ? Number(settingsData.discountPercent) : 20;
					setBillingSettings({
						defaultAmount,
						concessionDiscount: 1 - (discountPercent / 100),
					});
					setSettingsDraft({
						defaultAmount: defaultAmount.toString(),
						discountPercent: discountPercent.toString(),
					});
				}
			} catch (error) {
				console.error('Failed to load billing settings', error);
			}
		};

		loadBillingSettings();
	}, []);

	// Sync completed appointments to billing
	useEffect(() => {
		if (loading || syncing || appointments.length === 0) return;

		const syncAppointmentsToBilling = async () => {
			setSyncing(true);
			try {
				const completedAppointments = appointments.filter(appt => appt.status === 'completed');
				const existingBillingIds = new Set(billing.map(b => b.appointmentId).filter(Boolean));

				for (const appt of completedAppointments) {
					if (!appt.appointmentId || existingBillingIds.has(appt.appointmentId)) continue;

					// Check if billing record already exists
					const existingQuery = query(collection(db, 'billing'), where('appointmentId', '==', appt.appointmentId));
					const existingSnapshot = await getDocs(existingQuery);
					if (!existingSnapshot.empty) continue;

					// Fetch patient document to get patientType
					const patientQuery = query(collection(db, 'patients'), where('patientId', '==', appt.patientId));
					const patientSnapshot = await getDocs(patientQuery);
					
					if (patientSnapshot.empty) {
						console.warn(`Patient not found for appointment ${appt.appointmentId}`);
						continue;
					}

					const patientData = patientSnapshot.docs[0].data();
					const patientType = (patientData.patientType as string) || '';
					const paymentType = (patientData.paymentType as string) || 'without';
					const standardAmount = appt.amount || billingSettings.defaultAmount;

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
							// Apply concession discount from settings
							billAmount = standardAmount * billingSettings.concessionDiscount;
						} else {
							// Without concession: standard amount
							billAmount = standardAmount;
						}
					} else if (patientType === 'Dyes') {
						// Dyes: Only create bill if count >= 500
						const billingQuery = query(collection(db, 'billing'), where('patientId', '==', appt.patientId));
						const billingSnapshot = await getDocs(billingQuery);
						const existingBillCount = billingSnapshot.size;
						
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

					// Create billing record if rules allow
					if (shouldCreateBill) {
						const billingId = 'BILL-' + (appt.appointmentId || Date.now().toString());
						await addDoc(collection(db, 'billing'), {
							billingId,
							appointmentId: appt.appointmentId,
							patient: appt.patient || '',
							patientId: appt.patientId || '',
							doctor: appt.doctor || '',
							amount: billAmount,
							date: appt.date || new Date().toISOString().split('T')[0],
							status: 'Pending',
							paymentMode: null,
							utr: null,
							createdAt: serverTimestamp(),
							updatedAt: serverTimestamp(),
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
	}, [appointments.length, billing.length, billingSettings]);

	const filteredBilling = useMemo(() => {
		if (filterRange === 'all') return billing;
		const days = parseInt(filterRange, 10);
		const now = new Date();
		return billing.filter(b => {
			const d = new Date(b.date);
			return (now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24) <= days;
		});
	}, [billing, filterRange]);

	const monthlyTotal = useMemo(() => {
		return filteredBilling
			.filter(b => b.status === 'Completed')
			.reduce((sum, bill) => sum + (bill.amount || 0), 0);
	}, [filteredBilling]);

	const pending = useMemo(() => filteredBilling.filter(b => b.status === 'Pending'), [filteredBilling]);
	const completed = useMemo(() => filteredBilling.filter(b => b.status === 'Completed'), [filteredBilling]);

	const handlePay = (bill: BillingRecord) => {
		setSelectedBill(bill);
		setPaymentMode('Cash');
		setUtr('');
		setShowPayModal(true);
	};

	const handleSubmitPayment = async () => {
		if (!selectedBill || !selectedBill.id) return;

		try {
			const billingRef = doc(db, 'billing', selectedBill.id);
			await updateDoc(billingRef, {
				status: 'Completed',
				paymentMode,
				utr: paymentMode === 'UPI/Card' ? utr : null,
				updatedAt: serverTimestamp(),
			});
			setShowPayModal(false);
			setSelectedBill(null);
			setPaymentMode('Cash');
			setUtr('');
		} catch (error) {
			console.error('Failed to update payment', error);
			alert(`Failed to process payment: ${error instanceof Error ? error.message : 'Unknown error'}`);
		}
	};

	const handleViewReport = (patientId: string) => {
		setSelectedPatientId(patientId);
		setShowReportModal(true);
	};

	const handleViewPaymentSlip = (bill: BillingRecord) => {
		setSelectedBill(bill);
		setShowPaymentSlipModal(true);
	};

	const handlePrintReport = () => {
		const reportCard = document.getElementById('reportCard');
		if (!reportCard) return;
		const printWindow = window.open('', '', 'width=800,height=600');
		if (!printWindow) return;
		printWindow.document.write(`
			<html>
				<head>
					<title>Print Report</title>
					<link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" rel="stylesheet"/>
				</head>
				<body>${reportCard.innerHTML}</body>
			</html>
		`);
		printWindow.document.close();
		printWindow.focus();
		printWindow.print();
		printWindow.close();
	};

	const handlePrintPaymentSlip = () => {
		const slipCard = document.getElementById('paymentSlipCard');
		if (!slipCard) return;
		const printWindow = window.open('', '', 'width=600,height=700');
		if (!printWindow) return;
		printWindow.document.write(`
			<html>
				<head>
					<title>Payment Slip</title>
					<link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" rel="stylesheet"/>
				</head>
				<body style="padding:24px;">${slipCard.innerHTML}</body>
			</html>
		`);
		printWindow.document.close();
		printWindow.focus();
		printWindow.print();
		printWindow.close();
	};

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
						assignedDoctor: data.assignedDoctor ? String(data.assignedDoctor) : undefined,
						diagnosis: data.diagnosis ? String(data.diagnosis) : undefined,
						treatmentProvided: data.treatmentProvided ? String(data.treatmentProvided) : undefined,
						progressNotes: data.progressNotes ? String(data.progressNotes) : undefined,
						referredBy: data.referredBy ? String(data.referredBy) : undefined,
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
						registeredAt: created ? created.toISOString() : (data.registeredAt as string | undefined) || new Date().toISOString(),
						patientType: data.patientType ? String(data.patientType) : undefined,
						sessionAllowance: data.sessionAllowance
							? normalizeSessionAllowance(data.sessionAllowance as Record<string, unknown>)
							: undefined,
					} as BillingPatientRecord;
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

	const selectedPatient = useMemo(() => {
		return patients.find((p: any) => p.patientId === selectedPatientId);
	}, [patients, selectedPatientId]);

	const handleExportBilling = (format: 'csv' | 'excel' = 'csv') => {
		if (!filteredBilling.length) {
			alert('No billing records to export.');
			return;
		}

		const rows = [
			['Bill ID', 'Patient ID', 'Patient Name', 'Appointment ID', 'Doctor', 'Amount', 'Date', 'Status', 'Payment Mode', 'UTR'],
			...filteredBilling.map(bill => [
				bill.billingId || '',
				bill.patientId || '',
				bill.patient || '',
				bill.appointmentId || '',
				bill.doctor || '',
				bill.amount || 0,
				bill.date || '',
				bill.status || '',
				bill.paymentMode || '',
				bill.utr || '',
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
			link.setAttribute('download', `billing-export-${new Date().toISOString().slice(0, 10)}.csv`);
			document.body.appendChild(link);
			link.click();
			document.body.removeChild(link);
			URL.revokeObjectURL(url);
		} else {
			// Excel export
			const ws = XLSX.utils.aoa_to_sheet(rows);
			const wb = XLSX.utils.book_new();
			XLSX.utils.book_append_sheet(wb, ws, 'Billing Records');
			
			// Set column widths
			ws['!cols'] = [
				{ wch: 15 }, // Bill ID
				{ wch: 15 }, // Patient ID
				{ wch: 25 }, // Patient Name
				{ wch: 15 }, // Appointment ID
				{ wch: 20 }, // Doctor
				{ wch: 12 }, // Amount
				{ wch: 12 }, // Date
				{ wch: 12 }, // Status
				{ wch: 15 }, // Payment Mode
				{ wch: 20 }, // UTR
			];

			XLSX.writeFile(wb, `billing-export-${new Date().toISOString().slice(0, 10)}.xlsx`);
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

	// Admin features: Patient lookup and doctor options
	const patientLookup = useMemo(() => {
		const map = new Map<string, AdminPatientRecord>();
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

	// Admin features: Pending rows from appointments (with billing field)
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

	// Admin features: Billing history rows from appointments
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

	// Admin features: Pending drafts management
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

	// Admin features: Invoice management
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

	// Admin features: Export history
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

	// Admin features: Export pending
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

	// Admin features: Cycle reports
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

	// Handle billing settings save
	const handleSaveSettings = async () => {
		const defaultAmountValue = Number(settingsDraft.defaultAmount);
		const discountPercentValue = Number(settingsDraft.discountPercent);

		if (Number.isNaN(defaultAmountValue) || defaultAmountValue <= 0) {
			alert('Please enter a valid default amount.');
			return;
		}

		if (Number.isNaN(discountPercentValue) || discountPercentValue < 0 || discountPercentValue > 100) {
			alert('Please enter a valid discount percentage (0-100).');
			return;
		}

		setSavingSettings(true);
		try {
			const settingsRef = doc(db, 'billingSettings', 'default');
			const settingsDoc = await getDoc(settingsRef);
			
			if (settingsDoc.exists()) {
				// Update existing document
				await updateDoc(settingsRef, {
					defaultAmount: defaultAmountValue,
					discountPercent: discountPercentValue,
					updatedAt: serverTimestamp(),
				});
			} else {
				// Create new document
				await setDoc(settingsRef, {
					defaultAmount: defaultAmountValue,
					discountPercent: discountPercentValue,
					createdAt: serverTimestamp(),
					updatedAt: serverTimestamp(),
				});
			}

			setBillingSettings({
				defaultAmount: defaultAmountValue,
				concessionDiscount: 1 - (discountPercentValue / 100),
			});

			setShowSettingsModal(false);
			alert('Billing settings saved successfully!');
		} catch (error) {
			console.error('Failed to save billing settings', error);
			alert('Failed to save billing settings. Please try again.');
		} finally {
			setSavingSettings(false);
		}
	};

	const openSettingsModal = () => {
		setSettingsDraft({
			defaultAmount: billingSettings.defaultAmount.toString(),
			discountPercent: ((1 - billingSettings.concessionDiscount) * 100).toString(),
		});
		setShowSettingsModal(true);
	};

	return (
		<div className="min-h-svh bg-slate-50 px-6 py-10">
			<div className="mx-auto max-w-6xl space-y-10">
				<PageHeader
					badge="Front Desk"
					title="Billing & Payments"
					description="Track invoices, process payments, and generate receipts for completed appointments."
					statusCard={{
						label: 'Monthly Total',
						value: `₹${monthlyTotal.toFixed(2)}`,
						subtitle: 'Completed payments this month',
					}}
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

				{/* Billing Settings */}
				<section className="rounded-2xl bg-white p-6 shadow-[0_18px_40px_rgba(15,23,42,0.07)]">
					<div className="mb-4 flex items-center justify-between">
						<div>
							<h3 className="text-lg font-semibold text-slate-900">Billing Configuration</h3>
							<p className="text-sm text-slate-600">
								Configure default billing amount and concession discount percentage.
							</p>
						</div>
						<button
							type="button"
							onClick={openSettingsModal}
							className="inline-flex items-center rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white shadow-md transition hover:bg-sky-500 focus-visible:bg-sky-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600"
						>
							<i className="fas fa-cog mr-2 text-sm" aria-hidden="true" />
							Configure Settings
						</button>
					</div>
					<div className="grid gap-4 sm:grid-cols-2">
						<div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
							<p className="text-xs uppercase tracking-wide text-slate-500">Default Amount</p>
							<p className="mt-2 text-2xl font-semibold text-slate-900">{rupee(billingSettings.defaultAmount)}</p>
							<p className="mt-1 text-xs text-slate-600">Used when appointment amount is not set</p>
						</div>
						<div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
							<p className="text-xs uppercase tracking-wide text-slate-500">Concession Discount</p>
							<p className="mt-2 text-2xl font-semibold text-slate-900">{((1 - billingSettings.concessionDiscount) * 100).toFixed(0)}%</p>
							<p className="mt-1 text-xs text-slate-600">Applied to Paid patients with concession</p>
						</div>
					</div>
				</section>

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
												? 'bg-emerald-100 text-emerald-800'
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

				<section className="section-card">
				<div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
					<div>
						<label htmlFor="billingFilter" className="block text-sm font-medium text-slate-700">
							Show records from:
						</label>
						<select
							id="billingFilter"
							value={filterRange}
							onChange={e => setFilterRange(e.target.value)}
							className="mt-2 rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 transition focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-200"
						>
							<option value="15">Last 15 days</option>
							<option value="30">Last 1 month</option>
							<option value="90">Last 3 months</option>
							<option value="180">Last 6 months</option>
							<option value="all">All time</option>
						</select>
					</div>
					<div className="flex gap-2">
						<button
							type="button"
							onClick={() => handleExportBilling('csv')}
							className="inline-flex items-center rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white shadow-md transition hover:bg-sky-500 focus-visible:bg-sky-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600"
						>
							<i className="fas fa-file-csv mr-2 text-sm" aria-hidden="true" />
							Export CSV
						</button>
						<button
							type="button"
							onClick={() => handleExportBilling('excel')}
							className="inline-flex items-center rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-md transition hover:bg-emerald-500 focus-visible:bg-emerald-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600"
						>
							<i className="fas fa-file-excel mr-2 text-sm" aria-hidden="true" />
							Export Excel
						</button>
					</div>
				</div>
			</section>

			{loading ? (
				<section className="mx-auto mt-8 max-w-6xl section-card">
					<div className="py-12 text-center text-sm text-slate-500">
						<div className="loading-spinner" aria-hidden="true" />
						<span className="ml-3 align-middle">Loading billing records…</span>
					</div>
				</section>
			) : (
				<>
			{/* Admin-style Pending Billing and History from Appointments */}
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

			{/* Existing Frontdesk Billing Tables */}
			<section className="mx-auto mt-8 grid max-w-6xl gap-6 lg:grid-cols-2">
				<div className="rounded-2xl border border-amber-200 bg-white shadow-sm">
					<div className="border-b border-amber-200 bg-amber-50 px-6 py-4">
						<h2 className="text-lg font-semibold text-slate-900">
							Pending Payments <span className="ml-2 rounded-full bg-amber-600 px-2.5 py-0.5 text-xs font-semibold text-white">{pending.length}</span>
						</h2>
					</div>
					<div className="p-6">
						{pending.length === 0 ? (
							<p className="py-8 text-center text-sm text-slate-500">No pending payments.</p>
						) : (
							<div className="overflow-x-auto">
								<table className="min-w-full divide-y divide-slate-200 text-left text-sm">
									<thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
										<tr>
											<th className="px-3 py-2 font-semibold">Bill ID</th>
											<th className="px-3 py-2 font-semibold">Patient</th>
											<th className="px-3 py-2 font-semibold">Amount</th>
											<th className="px-3 py-2 font-semibold">Date</th>
											<th className="px-3 py-2 font-semibold text-right">Action</th>
										</tr>
									</thead>
									<tbody className="divide-y divide-slate-100">
										{pending.map(bill => (
											<tr key={bill.billingId}>
												<td className="px-3 py-3 text-sm font-medium text-slate-800">{bill.billingId}</td>
												<td className="px-3 py-3 text-sm text-slate-600">{bill.patient}</td>
												<td className="px-3 py-3 text-sm font-semibold text-slate-900">₹{bill.amount}</td>
												<td className="px-3 py-3 text-sm text-slate-600">{bill.date}</td>
												<td className="px-3 py-3 text-right">
													<button
														type="button"
														onClick={() => handlePay(bill)}
														className="inline-flex items-center rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-amber-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-200"
													>
														Pay
													</button>
												</td>
											</tr>
										))}
									</tbody>
								</table>
							</div>
						)}
					</div>
				</div>

				<div className="rounded-2xl border border-emerald-200 bg-white shadow-sm">
					<div className="border-b border-emerald-200 bg-emerald-50 px-6 py-4">
						<h2 className="text-lg font-semibold text-slate-900">
							Completed Payments <span className="ml-2 rounded-full bg-emerald-600 px-2.5 py-0.5 text-xs font-semibold text-white">{completed.length}</span>
						</h2>
					</div>
					<div className="p-6">
						{completed.length === 0 ? (
							<p className="py-8 text-center text-sm text-slate-500">No completed payments.</p>
						) : (
							<div className="overflow-x-auto">
								<table className="min-w-full divide-y divide-slate-200 text-left text-sm">
									<thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
										<tr>
											<th className="px-3 py-2 font-semibold">Bill ID</th>
											<th className="px-3 py-2 font-semibold">Patient</th>
											<th className="px-3 py-2 font-semibold">Amount</th>
											<th className="px-3 py-2 font-semibold">Paid By</th>
											<th className="px-3 py-2 font-semibold">Actions</th>
										</tr>
									</thead>
									<tbody className="divide-y divide-slate-100">
										{completed.map(bill => (
											<tr key={bill.billingId}>
												<td className="px-3 py-3 text-sm font-medium text-slate-800">{bill.billingId}</td>
												<td className="px-3 py-3 text-sm text-slate-600">{bill.patient}</td>
												<td className="px-3 py-3 text-sm font-semibold text-slate-900">₹{bill.amount}</td>
												<td className="px-3 py-3 text-sm text-slate-600">{bill.paymentMode || '—'}</td>
												<td className="px-3 py-3">
													<div className="flex items-center justify-end gap-2">
														<button
															type="button"
															onClick={() => handleViewReport(bill.patientId)}
															className="inline-flex items-center rounded-lg border border-sky-200 px-2.5 py-1 text-xs font-semibold text-sky-700 transition hover:border-sky-300 hover:text-sky-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-200"
														>
															View Report
														</button>
														<button
															type="button"
															onClick={() => handleViewPaymentSlip(bill)}
															className="inline-flex items-center rounded-lg bg-emerald-600 px-2.5 py-1 text-xs font-semibold text-white transition hover:bg-emerald-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-200"
														>
															Receipt
														</button>
													</div>
												</td>
											</tr>
										))}
									</tbody>
								</table>
							</div>
						)}
					</div>
				</div>
			</section>
				</>
			)}

			{/* Payment Modal */}
			{showPayModal && selectedBill && (
				<div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 px-4 py-6">
					<div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white shadow-2xl">
						<header className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
							<h2 className="text-lg font-semibold text-slate-900">Mark Payment for {selectedBill.patient}</h2>
							<button
								type="button"
								onClick={() => setShowPayModal(false)}
								className="rounded-full p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 focus-visible:outline-none"
								aria-label="Close"
							>
								<i className="fas fa-times" aria-hidden="true" />
							</button>
						</header>
						<div className="px-6 py-6">
							<div className="space-y-3 text-sm">
								<div>
									<span className="font-semibold text-slate-700">Billing ID:</span> <span className="text-slate-600">{selectedBill.billingId}</span>
								</div>
								<div>
									<span className="font-semibold text-slate-700">Amount:</span> <span className="text-slate-600">₹{selectedBill.amount}</span>
								</div>
								<div>
									<span className="font-semibold text-slate-700">Date:</span> <span className="text-slate-600">{selectedBill.date}</span>
								</div>
								<div className="pt-3">
									<label className="block text-sm font-medium text-slate-700">Mode of Payment</label>
									<div className="mt-2 space-y-2">
										<label className="flex items-center">
											<input
												type="radio"
												name="paymode"
												value="Cash"
												checked={paymentMode === 'Cash'}
												onChange={() => setPaymentMode('Cash')}
												className="mr-2"
											/>
											<span className="text-sm text-slate-700">Cash</span>
										</label>
										<label className="flex items-center">
											<input
												type="radio"
												name="paymode"
												value="UPI/Card"
												checked={paymentMode === 'UPI/Card'}
												onChange={() => setPaymentMode('UPI/Card')}
												className="mr-2"
											/>
											<span className="text-sm text-slate-700">Card / UPI</span>
										</label>
									</div>
									{paymentMode === 'UPI/Card' && (
										<input
											type="text"
											value={utr}
											onChange={e => setUtr(e.target.value)}
											placeholder="Txn ID / UTR Number"
											className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-800 transition focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-200"
										/>
									)}
								</div>
							</div>
						</div>
						<footer className="flex items-center justify-end gap-3 border-t border-slate-200 px-6 py-4">
							<button
								type="button"
								onClick={() => setShowPayModal(false)}
								className="inline-flex items-center rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition hover:border-slate-300 hover:text-slate-800 focus-visible:outline-none"
							>
								Cancel
							</button>
							<button
								type="button"
								onClick={handleSubmitPayment}
								className="inline-flex items-center rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-200"
							>
								Submit Payment
							</button>
						</footer>
					</div>
				</div>
			)}

			{/* Report Modal */}
			{showReportModal && selectedPatient && (
				<div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 px-4 py-6">
					<div className="w-full max-w-5xl rounded-2xl border border-slate-200 bg-white shadow-2xl">
						<header className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
							<h2 className="text-lg font-semibold text-slate-900">Physiotherapy Report</h2>
							<button
								type="button"
								onClick={() => setShowReportModal(false)}
								className="rounded-full p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 focus-visible:outline-none"
								aria-label="Close"
							>
								<i className="fas fa-times" aria-hidden="true" />
							</button>
						</header>
						<div className="max-h-[600px] overflow-y-auto px-6 py-6">
							<div id="reportCard" className="section-card">
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
									<div>
										<label className="block text-xs font-medium text-slate-500">Total Sessions Required</label>
										<input
											type="text"
											value={
												typeof selectedPatient.totalSessionsRequired === 'number'
													? String(selectedPatient.totalSessionsRequired)
													: ''
											}
											readOnly
											className="mt-1 w-full rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800"
										/>
									</div>
									<div>
										<label className="block text-xs font-medium text-slate-500">Remaining Sessions</label>
										<input
											type="text"
											value={
												typeof selectedPatient.remainingSessions === 'number'
													? String(selectedPatient.remainingSessions)
													: ''
											}
											readOnly
											className="mt-1 w-full rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800"
										/>
									</div>
								</div>
								<div className="mt-6">
									<p className="text-sm font-semibold text-sky-600">Assessment</p>
									<div className="mt-2 grid gap-4 sm:grid-cols-2">
										<div>
											<label className="block text-xs font-medium text-slate-500">Presenting Complaint</label>
											<input
												type="text"
												value={selectedPatient.complaint || ''}
												readOnly
												className="mt-1 w-full rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800"
											/>
										</div>
										<div>
											<label className="block text-xs font-medium text-slate-500">Diagnosis</label>
											<input
												type="text"
												value={selectedPatient.diagnosis || ''}
												readOnly
												className="mt-1 w-full rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800"
											/>
										</div>
									</div>
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
							</div>
						</div>
						<footer className="flex items-center justify-end gap-3 border-t border-slate-200 px-6 py-4">
							<button
								type="button"
								onClick={handlePrintReport}
								className="inline-flex items-center rounded-lg border border-sky-600 px-4 py-2 text-sm font-semibold text-sky-600 transition hover:bg-sky-50 focus-visible:outline-none"
							>
								Download/Print
							</button>
							<button
								type="button"
								onClick={() => setShowReportModal(false)}
								className="inline-flex items-center rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition hover:border-slate-300 hover:text-slate-800 focus-visible:outline-none"
							>
								Close
							</button>
						</footer>
					</div>
				</div>
			)}

			{/* Payment Slip Modal */}
			{showPaymentSlipModal && selectedBill && (
				<div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 px-4 py-6">
					<div className="w-full max-w-2xl rounded-2xl border border-slate-200 bg-white shadow-2xl">
						<header className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
							<h2 className="text-lg font-semibold text-slate-900">Payment Receipt / Acknowledgement</h2>
							<button
								type="button"
								onClick={() => setShowPaymentSlipModal(false)}
								className="rounded-full p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 focus-visible:outline-none"
								aria-label="Close"
							>
								<i className="fas fa-times" aria-hidden="true" />
							</button>
						</header>
						<div className="px-6 py-6">
							<div
								id="paymentSlipCard"
								className="rounded-lg border-2 border-amber-400 bg-white p-6"
							>
								<div className="text-center">
									<div className="text-lg font-bold text-sky-600">CENTRE FOR SPORTS SCIENCE</div>
									<div className="text-sm">SPORTS BUSINESS SOLUTIONS PVT. LTD.</div>
								</div>
								<div className="mt-4 mb-3 grid grid-cols-2 gap-4 text-sm">
									<div>
										<b>Receipt No:</b> <span>{selectedBill.billingId}</span>
									</div>
									<div className="text-right">
										<b>Date:</b> <span>{selectedBill.date}</span>
									</div>
								</div>
								<hr className="my-3" />
								<div className="space-y-2 text-sm">
									<div>
										<b>Received with thanks from:</b> <span>{selectedBill.patient}</span>
									</div>
									<div>
										<b>The sum of Rupees:</b> ₹<span>{selectedBill.amount}</span> (
										<span className="italic">{numberToWords(selectedBill.amount)} only</span>)
									</div>
									<div>
										<b>Towards:</b> <span>Inter Clinic</span>
									</div>
									<div>
										<b>Mode of Payment:</b> <span>{selectedBill.paymentMode || 'Cash'}</span>
									</div>
								</div>
								<div className="mt-8 text-right text-sm">
									<div>For CENTRE FOR SPORTS SCIENCE</div>
									<div className="italic">(Signature)</div>
								</div>
							</div>
						</div>
						<footer className="flex items-center justify-end gap-3 border-t border-slate-200 px-6 py-4">
							<button
								type="button"
								onClick={handlePrintPaymentSlip}
								className="inline-flex items-center rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sky-500 focus-visible:outline-none"
							>
								Download / Print
							</button>
							<button
								type="button"
								onClick={() => setShowPaymentSlipModal(false)}
								className="inline-flex items-center rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition hover:border-slate-300 hover:text-slate-800 focus-visible:outline-none"
							>
								Close
							</button>
						</footer>
					</div>
				</div>
			)}

			{/* Billing Settings Modal */}
			{showSettingsModal && (
				<div
					role="dialog"
					aria-modal="true"
					className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 px-4 py-6"
				>
					<div className="w-full max-w-md rounded-2xl bg-white shadow-2xl">
						<header className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
							<h2 className="text-lg font-semibold text-slate-900">Billing Configuration</h2>
							<button
								type="button"
								onClick={() => setShowSettingsModal(false)}
								className="rounded-full p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 focus-visible:bg-slate-100 focus-visible:text-slate-600 focus-visible:outline-none"
								aria-label="Close dialog"
							>
								<i className="fas fa-times" aria-hidden="true" />
							</button>
						</header>
						<div className="px-6 py-6">
							<div className="space-y-4">
								<div>
									<label className="block text-sm font-medium text-slate-700 mb-2">
										Default Billing Amount (₹)
									</label>
									<input
										type="number"
										min="0"
										step="0.01"
										value={settingsDraft.defaultAmount}
										onChange={e => setSettingsDraft(prev => ({ ...prev, defaultAmount: e.target.value }))}
										className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800 transition focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-200"
										placeholder="1200"
									/>
									<p className="mt-1 text-xs text-slate-500">
										This amount will be used when an appointment doesn't have a specific amount set.
									</p>
								</div>
								<div>
									<label className="block text-sm font-medium text-slate-700 mb-2">
										Concession Discount (%)
									</label>
									<input
										type="number"
										min="0"
										max="100"
										step="0.1"
										value={settingsDraft.discountPercent}
										onChange={e => setSettingsDraft(prev => ({ ...prev, discountPercent: e.target.value }))}
										className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800 transition focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-200"
										placeholder="20"
									/>
									<p className="mt-1 text-xs text-slate-500">
										Discount percentage applied to Paid patients with concession. Example: 20% means they pay 80% of the amount.
									</p>
									{settingsDraft.discountPercent && !Number.isNaN(Number(settingsDraft.discountPercent)) && !Number.isNaN(Number(settingsDraft.defaultAmount)) && (
										<div className="mt-2 rounded-lg bg-sky-50 p-3 text-xs text-sky-700">
											<p>
												<strong>Preview:</strong> If amount is {rupee(Number(settingsDraft.defaultAmount))}, with {settingsDraft.discountPercent}% discount, 
												the patient will pay{' '}
												<strong>
													{rupee(Number(settingsDraft.defaultAmount) * (1 - Number(settingsDraft.discountPercent) / 100))}
												</strong>
											</p>
										</div>
									)}
								</div>
							</div>
						</div>
						<footer className="flex items-center justify-end gap-3 border-t border-slate-200 px-6 py-4">
							<button
								type="button"
								onClick={() => setShowSettingsModal(false)}
								className="inline-flex items-center rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition hover:border-slate-300 hover:text-slate-800 focus-visible:border-slate-300 focus-visible:text-slate-800 focus-visible:outline-none"
							>
								Cancel
							</button>
							<button
								type="button"
								onClick={handleSaveSettings}
								disabled={savingSettings}
								className="inline-flex items-center rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sky-500 focus-visible:bg-sky-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600 disabled:opacity-50 disabled:cursor-not-allowed"
							>
								<i className={`fas ${savingSettings ? 'fa-spinner fa-spin' : 'fa-save'} mr-2 text-sm`} aria-hidden="true" />
								{savingSettings ? 'Saving...' : 'Save Settings'}
							</button>
						</footer>
					</div>
				</div>
			)}

			{/* Invoice Modal */}
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
