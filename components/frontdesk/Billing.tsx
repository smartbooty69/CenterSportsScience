'use client';

import { useEffect, useMemo, useState } from 'react';
import {
	collection,
	doc,
	onSnapshot,
	addDoc,
	updateDoc,
	query,
	where,
	getDocs,
	serverTimestamp,
	orderBy,
	type QuerySnapshot,
	type Timestamp,
} from 'firebase/firestore';
import * as XLSX from 'xlsx';
import { db } from '@/lib/firebase';
import PageHeader from '@/components/PageHeader';
import {
	getCurrentBillingCycle,
	getNextBillingCycle,
	getBillingCycleId,
	getMonthName,
	type BillingCycle,
} from '@/lib/billingUtils';

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
	createdAt?: string | Timestamp;
	updatedAt?: string | Timestamp;

	// Invoice-related fields (may or may not exist in Firestore)
	invoiceNo?: string;
	invoiceGeneratedAt?: string;
}

function getCurrentMonthYear() {
	const now = new Date();
	return `${now.getFullYear()}-${now.getMonth() + 1}`;
}

/* --------------------------------------------------------
	NEW NUMBER → WORDS (INDIAN SYSTEM, RUPEES + PAISE)
---------------------------------------------------------- */
function numberToWords(num: number): string {
	const a = [
		'',
		'One',
		'Two',
		'Three',
		'Four',
		'Five',
		'Six',
		'Seven',
		'Eight',
		'Nine',
		'Ten',
		'Eleven',
		'Twelve',
		'Thirteen',
		'Fourteen',
		'Fifteen',
		'Sixteen',
		'Seventeen',
		'Eighteen',
		'Nineteen',
	];
	const b = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

	function inWords(n: number): string {
		if (n < 20) return a[n];
		if (n < 100) return b[Math.floor(n / 10)] + (n % 10 ? ' ' + a[n % 10] : '');
		if (n < 1000) return a[Math.floor(n / 100)] + ' Hundred' + (n % 100 ? ' ' + inWords(n % 100) : '');
		if (n < 100000)
			return inWords(Math.floor(n / 1000)) + ' Thousand' + (n % 1000 ? ' ' + inWords(n % 1000) : '');
		if (n < 10000000)
			return inWords(Math.floor(n / 100000)) + ' Lakh' + (n % 100000 ? ' ' + inWords(n % 100000) : '');
		return inWords(Math.floor(n / 10000000)) + ' Crore' + (n % 10000000 ? ' ' + inWords(n % 10000000) : '');
	}

	const rupees = Math.floor(num);
	const paise = Math.round((num - rupees) * 100);

	const rupeesWords = rupees ? inWords(rupees) + ' Rupees' : '';
	const paiseWords = paise ? (rupees ? ' and ' : '') + inWords(paise) + ' Paise' : '';

	const result = (rupeesWords + paiseWords).trim();
	return result || 'Zero Rupees';
}

/* --------------------------------------------------------
	ESCAPE HTML FOR SAFE INJECTION INTO INVOICE HTML
---------------------------------------------------------- */
function escapeHtml(unsafe: any) {
	return String(unsafe || '')
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;');
}

/* --------------------------------------------------------
	GENERATE PRINTABLE INVOICE HTML
---------------------------------------------------------- */
function generateInvoiceHtml(bill: BillingRecord, invoiceNo: string) {
	const amount = Number(bill.amount || 0).toFixed(2);
	const words = numberToWords(Number(bill.amount || 0));
	const showDate = bill.date || new Date().toLocaleDateString();

	// Show last 5 digits of UTR if payment mode is UPI / Online
	let paymentModeDisplay = bill.paymentMode || '';
	const modeLower = paymentModeDisplay.toLowerCase();

	if ((modeLower.includes('upi') || modeLower.includes('online')) && bill.utr) {
		const lastFive = bill.utr.slice(-5);
		paymentModeDisplay += ` (…${lastFive})`;
	}

	return `
		<div style="font-family:Arial;width:820px;margin:0 auto;padding:16px;color:#000;">
			<div style="border:1px solid #222;padding:18px;">

				<div style="display:flex;justify-content:space-between;">
					<div>
						<div style="font-size:20px;font-weight:700;">CENTRE FOR SPORTS SCIENCE</div>
						<div style="font-size:12px;">Sports Business Solutions Pvt. Ltd.</div>
						<div style="font-size:12px;">Sri Kanteerava Outdoor Stadium, Bangalore</div>
						<div style="font-size:12px;">Phone: +91 97311 28396</div>
					</div>

					<div style="text-align:right;">
						<div style="font-size:18px;font-weight:700;">RECEIPT</div>
						<div style="font-size:12px;">Receipt No: <b>${invoiceNo}</b></div>
						<div style="font-size:12px;">Date: <b>${showDate}</b></div>
					</div>
				</div>

				<hr/>

				<div style="display:flex;justify-content:space-between;margin-top:8px;">
					<div>
						<div style="font-size:13px;">Received from:</div>
						<div style="font-size:16px;font-weight:700;">${escapeHtml(bill.patient)}</div>
						<div style="font-size:12px;">Patient ID: ${escapeHtml(bill.patientId)}</div>
					</div>

					<div style="text-align:right;">
						<div style="font-size:12px;">Amount</div>
						<div style="font-size:18px;font-weight:700;">₹${amount}</div>
					</div>
				</div>

				<div style="font-size:12px;margin-top:8px;">
					<b>Amount in words:</b> ${escapeHtml(words)}
				</div>

				<div style="border:1px solid #666;padding:12px;margin-top:10px;">
					<b>For:</b> ${escapeHtml(bill.appointmentId || '')}<br/>
					${bill.doctor ? `Doctor: ${escapeHtml(bill.doctor)}<br/>` : ''}
					${paymentModeDisplay ? `Payment Mode: ${escapeHtml(paymentModeDisplay)}<br/>` : ''}

					<div style="margin-top:18px;text-align:center;font-weight:700;">
						Digitally Signed
					</div>
				</div>

				<div style="text-align:right;margin-top:20px;">
					For CENTRE FOR SPORTS SCIENCE
				</div>

				<div style="font-size:10px;margin-top:12px;">Computer generated receipt.</div>
			</div>
		</div>
	`;
}

/* --------------------------------------------------------
	GENERATE INVOICE & UPDATE FIRESTORE
---------------------------------------------------------- */
async function handleGenerateInvoice(bill: BillingRecord) {
	try {
		const invoiceNo = bill.invoiceNo || bill.billingId || `INV-${bill.id?.slice(0, 8) || 'NA'}`;

		const html = generateInvoiceHtml(bill, invoiceNo);
		const printWindow = window.open('', '_blank');

		if (!printWindow) {
			alert('Please allow pop-ups to generate the invoice.');
			return;
		}

		printWindow.document.write(`<html><body>${html}</body></html>`);
		printWindow.document.close();
		printWindow.print();

		if (bill.id) {
			await updateDoc(doc(db, 'billing', bill.id), {
				invoiceNo,
				invoiceGeneratedAt: new Date().toISOString(),
			});
		}
	} catch (error) {
		console.error('Invoice generation error:', error);
		alert('Failed to generate invoice. Please try again.');
	}
}

export default function Billing() {
	const [billing, setBilling] = useState<BillingRecord[]>([]);
	const [appointments, setAppointments] = useState<any[]>([]);
	const [loading, setLoading] = useState(true);
	const [filterRange, setFilterRange] = useState<string>('30');
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
	const [patients, setPatients] = useState<any[]>([]);

	// Load billing records from Firestore (ordered by createdAt desc)
	useEffect(() => {
		const q = query(collection(db, 'billing'), orderBy('createdAt', 'desc'));

		const unsubscribe = onSnapshot(
			q,
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
						invoiceNo: data.invoiceNo ? String(data.invoiceNo) : undefined,
						invoiceGeneratedAt: data.invoiceGeneratedAt ? String(data.invoiceGeneratedAt) : undefined,
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
					const data = docSnap.data();
					return {
						id: docSnap.id,
						appointmentId: data.appointmentId ? String(data.appointmentId) : '',
						patientId: data.patientId ? String(data.patientId) : '',
						patient: data.patient ? String(data.patient) : '',
						doctor: data.doctor ? String(data.doctor) : '',
						date: data.date ? String(data.date) : '',
						status: data.status ? String(data.status) : '',
						amount: data.amount ? Number(data.amount) : 1200,
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
	}, [appointments.length, billing.length]);

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
					const data = docSnap.data();
					return {
						id: docSnap.id,
						patientId: data.patientId ? String(data.patientId) : '',
						name: data.name ? String(data.name) : '',
						dob: data.dob ? String(data.dob) : '',
						gender: data.gender ? String(data.gender) : '',
						phone: data.phone ? String(data.phone) : '',
						email: data.email ? String(data.email) : '',
						address: data.address ? String(data.address) : '',
						assignedDoctor: data.assignedDoctor ? String(data.assignedDoctor) : '',
						complaint: data.complaint ? String(data.complaint) : '',
						diagnosis: data.diagnosis ? String(data.diagnosis) : '',
						treatmentProvided: data.treatmentProvided ? String(data.treatmentProvided) : '',
						progressNotes: data.progressNotes ? String(data.progressNotes) : '',
					};
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
		if (
			!confirm(
				'Are you sure you want to close the current billing cycle and start a new one? This action cannot be undone.'
			)
		) {
			return;
		}

		setResettingCycle(true);
		try {
			// Close current cycle
			const currentCycleId = getBillingCycleId(currentCycle.month, currentCycle.year);
			const existingCycle = billingCycles.find(
				c => c.month === currentCycle.month && c.year === currentCycle.year
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
			const nextCycleExists = billingCycles.find(
				c => c.month === nextCycle.month && c.year === nextCycle.year
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
			const response = await fetch('/api/billing/notifications?days=3');
			const result = await response.json();

			if (result.success) {
				alert(
					`Notifications sent successfully!\n\nEmails: ${result.emailsSent}\nSMS: ${result.smsSent}\nBills notified: ${result.billsNotified}`
				);
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
				/>

				<div className="border-t border-slate-200" />

				{/* Billing Cycle Management */}
				<section className="rounded-2xl bg-white p-6 shadow-[0_18px_40px_rgba(15,23,42,0.07)]">
					<div className="mb-4 flex items-center justify-between">
						<div>
							<h3 className="text-lg font-semibold text-slate-900">Billing Cycle Management</h3>
							<p className="text-sm text-slate-600">
								Current Cycle:{' '}
								<span className="font-medium">
									{getMonthName(currentCycle.month)} {currentCycle.year}
								</span>{' '}
								({currentCycle.startDate} to {currentCycle.endDate})
							</p>
						</div>
						<div className="flex gap-2">
							<button
								type="button"
								onClick={handleSendBillingNotifications}
								disabled={sendingNotifications}
								className="inline-flex items-center rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white shadow-md transition hover:bg-amber-500 focus-visible:bg-amber-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-600 disabled:cursor-not-allowed disabled:opacity-50"
							>
								<i
									className={`fas ${sendingNotifications ? 'fa-spinner fa-spin' : 'fa-bell'} mr-2 text-sm`}
									aria-hidden="true"
								/>
								{sendingNotifications ? 'Sending...' : 'Send Notifications'}
							</button>
							<button
								type="button"
								onClick={handleMonthlyReset}
								disabled={resettingCycle}
								className="inline-flex items-center rounded-lg bg-purple-600 px-4 py-2 text-sm font-semibold text-white shadow-md transition hover:bg-purple-500 focus-visible:bg-purple-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-purple-600 disabled:cursor-not-allowed disabled:opacity-50"
							>
								<i
									className={`fas ${
										resettingCycle ? 'fa-spinner fa-spin' : 'fa-sync-alt'
									} mr-2 text-sm`}
									aria-hidden="true"
								/>
								{resettingCycle ? 'Resetting...' : 'Reset Monthly Cycle'}
							</button>
						</div>
					</div>
					{billingCycles.length > 0 && (
						<div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-4">
							<p className="mb-2 text-sm font-medium text-slate-700">Recent Billing Cycles:</p>
							<div className="flex flex-wrap gap-2">
								{billingCycles
									.slice(-6)
									.reverse()
									.map(cycle => (
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
					<section className="section-card mx-auto mt-8 max-w-6xl">
						<div className="py-12 text-center text-sm text-slate-500">
							<div className="loading-spinner" aria-hidden="true" />
							<span className="ml-3 align-middle">Loading billing records…</span>
						</div>
					</section>
				) : (
					<>
						<section className="section-card mx-auto mt-8 grid max-w-6xl gap-6 lg:grid-cols-2">
							{/* Pending Payments */}
							<div className="rounded-2xl border border-amber-200 bg-white shadow-sm">
								<div className="border-b border-amber-200 bg-amber-50 px-6 py-4">
									<h2 className="text-lg font-semibold text-slate-900">
										Pending Payments{' '}
										<span className="ml-2 rounded-full bg-amber-600 px-2.5 py-0.5 text-xs font-semibold text-white">
											{pending.length}
										</span>
									</h2>
								</div>
								<div className="p-6">
									{pending.length === 0 ? (
										<p className="py-8 text-center text-sm text-slate-500">
											No pending payments.
										</p>
									) : (
										<div className="overflow-x-auto">
											<table className="min-w-full divide-y divide-slate-200 text-left text-sm">
												<thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
													<tr>
														<th className="px-3 py-2 font-semibold">Bill ID</th>
														<th className="px-3 py-2 font-semibold">Patient</th>
														<th className="px-3 py-2 font-semibold">Amount</th>
														<th className="px-3 py-2 font-semibold">Date</th>
														<th className="px-3 py-2 text-right font-semibold">
															Action
														</th>
													</tr>
												</thead>
												<tbody className="divide-y divide-slate-100">
													{pending.map(bill => (
														<tr key={bill.billingId}>
															<td className="px-3 py-3 text-sm font-medium text-slate-800">
																{bill.billingId}
															</td>
															<td className="px-3 py-3 text-sm text-slate-600">
																{bill.patient}
															</td>
															<td className="px-3 py-3 text-sm font-semibold text-slate-900">
																₹{bill.amount}
															</td>
															<td className="px-3 py-3 text-sm text-slate-600">
																{bill.date}
															</td>
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

							{/* Completed Payments */}
							<div className="rounded-2xl border border-emerald-200 bg-white shadow-sm">
								<div className="border-b border-emerald-200 bg-emerald-50 px-6 py-4">
									<h2 className="text-lg font-semibold text-slate-900">
										Completed Payments{' '}
										<span className="ml-2 rounded-full bg-emerald-600 px-2.5 py-0.5 text-xs font-semibold text-white">
											{completed.length}
										</span>
									</h2>
								</div>
								<div className="p-6">
									{completed.length === 0 ? (
										<p className="py-8 text-center text-sm text-slate-500">
											No completed payments.
										</p>
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
															<td className="px-3 py-3 text-sm font-medium text-slate-800">
																{bill.billingId}
															</td>
															<td className="px-3 py-3 text-sm text-slate-600">
																{bill.patient}
															</td>
															<td className="px-3 py-3 text-sm font-semibold text-slate-900">
																₹{bill.amount}
															</td>
															<td className="px-3 py-3 text-sm text-slate-600">
																{bill.paymentMode || '—'}
															</td>
															<td className="px-3 py-3">
																<div className="flex items-center justify-end gap-2">
																	<button
																		type="button"
																		onClick={() =>
																			handleViewReport(bill.patientId)
																		}
																		className="inline-flex items-center rounded-lg border border-sky-200 px-2.5 py-1 text-xs font-semibold text-sky-700 transition hover:border-sky-300 hover:text-sky-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-200"
																	>
																		View Report
																	</button>
																	<button
																		type="button"
																		onClick={() =>
																			handleViewPaymentSlip(bill)
																		}
																		className="inline-flex items-center rounded-lg bg-emerald-600 px-2.5 py-1 text-xs font-semibold text-white transition hover:bg-emerald-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-200"
																	>
																		Receipt
																	</button>
																	<button
																		type="button"
																		onClick={() => handleGenerateInvoice(bill)}
																		className="inline-flex items-center rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-200"
																	>
																		Invoice
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
								<h2 className="text-lg font-semibold text-slate-900">
									Mark Payment for {selectedBill.patient}
								</h2>
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
										<span className="font-semibold text-slate-700">Billing ID:</span>{' '}
										<span className="text-slate-600">{selectedBill.billingId}</span>
									</div>
									<div>
										<span className="font-semibold text-slate-700">Amount:</span>{' '}
										<span className="text-slate-600">₹{selectedBill.amount}</span>
									</div>
									<div>
										<span className="font-semibold text-slate-700">Date:</span>{' '}
										<span className="text-slate-600">{selectedBill.date}</span>
									</div>
									<div className="pt-3">
										<label className="block text-sm font-medium text-slate-700">
											Mode of Payment
										</label>
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
										<h3 className="text-xl font-bold text-sky-600">
											Physiotherapy Report
										</h3>
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
											<label className="block text-xs font-medium text-slate-500">
												Patient Name
											</label>
											<input
												type="text"
												value={selectedPatient.name || ''}
												readOnly
												className="mt-1 w-full rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800"
											/>
										</div>
										<div>
											<label className="block text-xs font-medium text-slate-500">
												Patient ID
											</label>
											<input
												type="text"
												value={selectedPatient.patientId || ''}
												readOnly
												className="mt-1 w-full rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800"
											/>
										</div>
										<div>
											<label className="block text-xs font-medium text-slate-500">
												Date of Birth
											</label>
											<input
												type="date"
												value={selectedPatient.dob || ''}
												readOnly
												className="mt-1 w-full rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800"
											/>
										</div>
										<div>
											<label className="block text-xs font-medium text-slate-500">
												Assigned Doctor
											</label>
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
										<div className="mt-2 grid gap-4 sm:grid-cols-2">
											<div>
												<label className="block text-xs font-medium text-slate-500">
													Presenting Complaint
												</label>
												<input
													type="text"
													value={selectedPatient.complaint || ''}
													readOnly
													className="mt-1 w-full rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800"
												/>
											</div>
											<div>
												<label className="block text-xs font-medium text-slate-500">
													Diagnosis
												</label>
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
										<p className="text-sm font-semibold text-sky-600">
											Treatment Provided
										</p>
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
								<h2 className="text-lg font-semibold text-slate-900">
									Payment Receipt / Acknowledgement
								</h2>
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
										<div className="text-lg font-bold text-sky-600">
											CENTRE FOR SPORTS SCIENCE
										</div>
										<div className="text-sm">
											SPORTS BUSINESS SOLUTIONS PVT. LTD.
										</div>
									</div>
									<div className="mt-4 mb-3 grid grid-cols-2 gap-4 text-sm">
										<div>
											<b>Receipt No:</b>{' '}
											<span>{selectedBill.billingId}</span>
										</div>
										<div className="text-right">
											<b>Date:</b> <span>{selectedBill.date}</span>
										</div>
									</div>
									<hr className="my-3" />
									<div className="space-y-2 text-sm">
										<div>
											<b>Received with thanks from:</b>{' '}
											<span>{selectedBill.patient}</span>
										</div>
										<div>
											<b>The sum of Rupees:</b> ₹
											<span>{selectedBill.amount}</span>{' '}
											(
											<span className="italic">
												{numberToWords(selectedBill.amount)} only
											</span>
											)
										</div>
										<div>
											<b>Towards:</b> <span>Inter Clinic</span>
										</div>
										<div>
											<b>Mode of Payment:</b>{' '}
											<span>{selectedBill.paymentMode || 'Cash'}</span>
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
			</div>
		</div>
	);
}
