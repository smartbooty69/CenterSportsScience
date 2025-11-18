'use client';

import { useEffect, useMemo, useState } from 'react';
import { collection, doc, onSnapshot, updateDoc, query, where, getDocs, addDoc, serverTimestamp, orderBy, type QuerySnapshot, type Timestamp } from 'firebase/firestore';
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
	invoiceNo?: string;
	invoiceGeneratedAt?: string;
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

/* --------------------------------------------------------
	NEW NUMBER -> WORDS (INDIAN SYSTEM, RUPEES + PAISE)
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
	GENERATE PRINTABLE INVOICE HTML (INDIAN GST FORMAT)
---------------------------------------------------------- */
function generateInvoiceHtml(bill: BillingRecord, invoiceNo: string) {
	const taxableValue = Number(bill.amount || 0);
	const taxRate = 5; // 5% CGST + 5% SGST = 10% total
	const cgstAmount = Number((taxableValue * (taxRate / 100)).toFixed(2));
	const sgstAmount = cgstAmount;
	const grandTotal = Number((taxableValue + cgstAmount + sgstAmount).toFixed(2));
	
	const words = numberToWords(grandTotal);
	const taxWords = numberToWords(cgstAmount + sgstAmount);
	const showDate = bill.date || new Date().toLocaleDateString('en-IN');
	
	const paymentModeDisplay = bill.paymentMode || 'Cash';
	const buyerName = escapeHtml(bill.patient);
	const buyerAddress = `Patient ID: ${escapeHtml(bill.patientId)}`;
	const buyerCity = bill.doctor ? `Doctor: ${escapeHtml(bill.doctor)}` : '';
	
	// Get the base URL for the logo (works in both dev and production)
	const logoUrl = typeof window !== 'undefined' ? `${window.location.origin}/logo.jpg` : '/logo.jpg';

	return `
		<!DOCTYPE html>
		<html lang="en">
		<head>
			<meta charset="UTF-8">
			<meta name="viewport" content="width=device-width, initial-scale=1.0">
			<title>Tax Invoice</title>
			<style>
				@page { size: A4; margin: 0; }
				body {
					font-family: Arial, sans-serif;
					font-size: 12px;
					margin: 0;
					padding: 20px;
					background: #fff;
				}
				.container {
					width: 210mm;
					max-width: 100%;
					margin: 0 auto;
					border: 1px solid #000;
				}
				.text-right { text-align: right; }
				.text-center { text-align: center; }
				.bold { font-weight: bold; }
				.uppercase { text-transform: uppercase; }
				table {
					width: 100%;
					border-collapse: collapse;
				}
				td, th {
					border: 1px solid #000;
					padding: 4px;
					vertical-align: top;
				}
				.header-left { width: 50%; }
				.header-right { width: 50%; padding: 0; }
				.nested-table td {
					border-top: none;
					border-left: none;
					border-right: none;
					border-bottom: 1px solid #000;
				}
				.nested-table tr:last-child td { border-bottom: none; }
				.items-table th { background-color: #f0f0f0; text-align: center; }
				.items-table td { height: 20px; }
				.spacer-row td { height: 100px; border-bottom: none; border-top: none; }
				.footer-table td { border: 1px solid #000; }
			</style>
		</head>
		<body>
		<div class="container">
			<div class="text-center bold" style="border-bottom: 1px solid #000; padding: 5px; font-size: 14px;">TAX INVOICE</div>

			<table>
				<tr>
					<td class="header-left">
						<div style="display: flex; gap: 10px; align-items: flex-start;">
							<img src="${logoUrl}" alt="Company Logo" style="width: 100px; height: auto; flex-shrink: 0;">
							<div>
								<span class="bold" style="font-size: 14px;">SIXS SPORTS AND BUSINESS SOLUTIONS INC</span><br>
								Blr: No.503, 5th Floor Donata Marvel Apartment,<br>
								Gokula Extension, Mattikere, Bangalore-560054<br>
								<strong>Del:</strong> 1st Floor, No.99 Block S/F, Bharat Road, Darya Ganja, New Delhi-110002<br>
								<strong>GSTIN/UIN:</strong> 07ADZFS3168H1ZC<br>
								State Name: Karnataka, Code: 29<br>
								Contact: +91-9731128398 / 9916509206<br>
								E-Mail: sportsixs2019@gmail.com
							</div>
						</div>
					</td>
					<td class="header-right">
						<table class="nested-table">
							<tr>
								<td width="50%"><strong>Invoice No.</strong><br>${escapeHtml(invoiceNo)}</td>
								<td width="50%"><strong>Dated</strong><br>${escapeHtml(showDate)}</td>
							</tr>
							<tr>
								<td><strong>Delivery Note</strong><br>&nbsp;</td>
								<td><strong>Mode/Terms of Payment</strong><br>${escapeHtml(paymentModeDisplay)}</td>
							</tr>
							<tr>
								<td><strong>Reference No. & Date</strong><br>${escapeHtml(bill.appointmentId || '')}</td>
								<td><strong>Other References</strong><br>&nbsp;</td>
							</tr>
							<tr>
								<td><strong>Buyer's Order No.</strong><br>&nbsp;</td>
								<td><strong>Dated</strong><br>&nbsp;</td>
							</tr>
							<tr>
								<td><strong>Dispatch Doc No.</strong><br>&nbsp;</td>
								<td><strong>Delivery Note Date</strong><br>&nbsp;</td>
							</tr>
							<tr>
								<td><strong>Dispatched through</strong><br>&nbsp;</td>
								<td><strong>Destination</strong><br>&nbsp;</td>
							</tr>
							<tr>
								<td colspan="2" style="height: 30px;"><strong>Terms of Delivery</strong><br>&nbsp;</td>
							</tr>
						</table>
					</td>
				</tr>

				<tr>
					<td colspan="2">
						<strong>Consignee (Ship to)</strong><br>
						${buyerName}<br>
						${buyerAddress}
					</td>
				</tr>

				<tr>
					<td colspan="2">
						<strong>Buyer (Bill to)</strong><br>
						${buyerName}<br>
						${buyerAddress}<br>
						${buyerCity}
					</td>
				</tr>
			</table>

			<table class="items-table" style="border-top: none;">
				<thead>
					<tr>
						<th width="5%">SI No.</th>
						<th width="40%">Description of Services</th>
						<th width="10%">HSN/SAC</th>
						<th width="10%">Quantity</th>
						<th width="10%">Rate</th>
						<th width="5%">per</th>
						<th width="20%">Amount</th>
					</tr>
				</thead>
				<tbody>
					<tr>
						<td class="text-center">1</td>
						<td>Physiotherapy / Strength & Conditioning Sessions</td>
						<td>9993</td>
						<td>1</td>
						<td>${taxableValue.toFixed(2)}</td>
						<td>Session</td>
						<td class="text-right">${taxableValue.toFixed(2)}</td>
					</tr>

					<tr class="spacer-row">
						<td style="border-bottom: 1px solid #000;"></td>
						<td style="border-bottom: 1px solid #000;">
							<br><br>
							<div class="text-right" style="padding-right: 10px;">
								CGST @ ${taxRate}%<br>
								SGST @ ${taxRate}%
							</div>
						</td>
						<td style="border-bottom: 1px solid #000;"></td>
						<td style="border-bottom: 1px solid #000;"></td>
						<td style="border-bottom: 1px solid #000;">
							<br><br><br>
							<div class="text-center">${taxRate}%<br>${taxRate}%</div>
						</td>
						<td style="border-bottom: 1px solid #000;">
							<br><br><br>
							<div class="text-center">%<br>%</div>
						</td>
						<td style="border-bottom: 1px solid #000;" class="text-right">
							<br><br>
							${cgstAmount.toFixed(2)}<br>
							${sgstAmount.toFixed(2)}
						</td>
					</tr>
					
					<tr class="bold">
						<td colspan="6" class="text-right">Total</td>
						<td class="text-right">${grandTotal.toFixed(2)}</td>
					</tr>
				</tbody>
			</table>

			<div style="border: 1px solid #000; border-top: none; padding: 5px;">
				<strong>Amount Chargeable (in words):</strong><br>
				${escapeHtml(words.toUpperCase())} ONLY
			</div>

			<table class="text-center" style="border-top: none;">
				<tr>
					<td rowspan="2">HSN/SAC</td>
					<td rowspan="2">Taxable Value</td>
					<td colspan="2">CGST</td>
					<td colspan="2">SGST</td>
					<td rowspan="2">Total Tax Amount</td>
				</tr>
				<tr>
					<td>Rate</td>
					<td>Amount</td>
					<td>Rate</td>
					<td>Amount</td>
				</tr>
				<tr>
					<td>9993</td>
					<td>${taxableValue.toFixed(2)}</td>
					<td>${taxRate}%</td>
					<td>${cgstAmount.toFixed(2)}</td>
					<td>${taxRate}%</td>
					<td>${sgstAmount.toFixed(2)}</td>
					<td>${(cgstAmount + sgstAmount).toFixed(2)}</td>
				</tr>
				<tr class="bold">
					<td class="text-right">Total</td>
					<td>${taxableValue.toFixed(2)}</td>
					<td></td>
					<td>${cgstAmount.toFixed(2)}</td>
					<td></td>
					<td>${sgstAmount.toFixed(2)}</td>
					<td>${(cgstAmount + sgstAmount).toFixed(2)}</td>
				</tr>
			</table>

			<div style="border: 1px solid #000; border-top: none; padding: 5px;">
				<strong>Tax Amount (In words):</strong> ${escapeHtml(taxWords.toUpperCase())} ONLY
			</div>

			<table style="border-top: none;">
				<tr>
					<td width="50%" style="border-right: 1px solid #000;">
						Company's PAN: <strong>ADZF83168H</strong><br><br>
						<span class="bold" style="text-decoration: underline;">Declaration</span><br>
						We declare that this invoice shows the actual price of the goods described and that all particulars are true and correct.<br><br>
						
						<div style="margin-top: 20px; border: 1px solid #ccc; padding: 10px; display: inline-block;">
							Customer's Seal and Signature
						</div>
					</td>
					<td width="50%">
						<strong>Company's Bank Details</strong><br>
						A/c Holder's Name: Six Sports & Business Solutions INC<br>
						Bank Name: Canara Bank<br>
						A/c No.: 0284201007444<br>
						Branch & IFS Code: CNRB0000444<br><br>
						
						<div class="text-right" style="margin-top: 20px;">
							for <strong>SIXS SPORTS AND BUSINESS SOLUTIONS INC</strong><br><br><br>
							Authorised Signatory
						</div>
					</td>
				</tr>
			</table>
		</div>
		</body>
		</html>
	`;
}

/* --------------------------------------------------------
	GENERATE RECEIPT HTML (MATCHING RECEIPT IMAGE FORMAT)
---------------------------------------------------------- */
function generateReceiptHtml(bill: BillingRecord, receiptNo: string) {
	const amount = Number(bill.amount || 0).toFixed(2);
	const words = numberToWords(Number(bill.amount || 0));
	const showDate = bill.date || new Date().toLocaleDateString('en-IN');
	
	const paymentModeDisplay = bill.paymentMode || 'Cash';
	const logoUrl = typeof window !== 'undefined' ? `${window.location.origin}/logo.jpg` : '/logo.jpg';

	return `
		<!DOCTYPE html>
		<html lang="en">
		<head>
			<meta charset="UTF-8">
			<meta name="viewport" content="width=device-width, initial-scale=1.0">
			<title>Receipt</title>
			<style>
				body {
					font-family: 'Arial', sans-serif;
					background-color: #f5f5f5;
					display: flex;
					justify-content: center;
					padding-top: 40px;
					margin: 0;
				}
				.receipt-box {
					width: 800px;
					background: white;
					border: 1px solid #333;
					padding: 20px 30px;
					box-sizing: border-box;
					position: relative;
				}
				.header {
					display: flex;
					justify-content: space-between;
					align-items: flex-start;
					margin-bottom: 10px;
				}
				.header-left {
					display: flex;
					align-items: flex-start;
					gap: 15px;
				}
				.company-info h2 {
					margin: 0;
					font-size: 22px;
					text-transform: uppercase;
					color: #000;
					font-weight: bold;
				}
				.company-info p {
					margin: 2px 0;
					font-size: 12px;
					color: #000;
				}
				.header-right {
					text-align: right;
				}
				.header-right h2 {
					margin: 0 0 5px 0;
					font-size: 20px;
					text-transform: uppercase;
					font-weight: bold;
					color: #000;
				}
				.header-right p {
					margin: 2px 0;
					font-size: 12px;
					font-weight: bold;
					color: #000;
				}
				hr {
					border: 0;
					border-top: 1px solid #000;
					margin: 15px 0;
				}
				.info-section {
					display: flex;
					justify-content: space-between;
					margin-bottom: 15px;
				}
				.info-left {
					font-size: 14px;
					color: #000;
				}
				.info-left strong {
					font-size: 18px;
					display: block;
					margin-top: 5px;
					color: #000;
				}
				.info-left .id-text {
					font-size: 12px;
					color: #000;
					margin-top: 2px;
				}
				.amount-right {
					text-align: right;
				}
				.amount-right span {
					font-size: 12px;
					display: block;
					color: #000;
				}
				.amount-right strong {
					font-size: 24px;
					color: #000;
				}
				.words-row {
					font-size: 14px;
					margin-bottom: 20px;
					font-weight: bold;
					color: #000;
				}
				.details-box {
					border: 1px solid #000;
					padding: 15px;
					height: 120px;
					position: relative;
					font-size: 14px;
					line-height: 1.5;
					color: #000;
				}
				.details-box strong {
					display: block;
					margin-bottom: 5px;
					color: #000;
				}
				.digitally-signed {
					position: absolute;
					bottom: 10px;
					left: 0;
					right: 0;
					text-align: center;
					font-weight: bold;
					font-size: 12px;
					color: #000;
				}
				.footer {
					margin-top: 15px;
					display: flex;
					justify-content: space-between;
					font-size: 10px;
					color: #000;
				}
			</style>
		</head>
		<body>
			<div class="receipt-box">
				<div class="header">
					<div class="header-left">
						<img src="${logoUrl}" alt="Company Logo" style="width: 100px; height: auto;">
						<div class="company-info">
							<h2>Centre For Sports Science</h2>
							<p>Sports & Business Solutions Pvt. Ltd.</p>
							<p>Sri Kanteerava Outdoor Stadium · Bangalore · +91 97311 28396</p>
						</div>
					</div>
					<div class="header-right">
						<h2>Receipt</h2>
						<p>Receipt No: ${escapeHtml(receiptNo)}</p>
						<p>Date: ${escapeHtml(showDate)}</p>
					</div>
				</div>
				<hr>
				<div class="info-section">
					<div class="info-left">
						Received from:
						<strong>${escapeHtml(bill.patient)}</strong>
						<div class="id-text">ID: ${escapeHtml(bill.patientId)}</div>
					</div>
					<div class="amount-right">
						<span>Amount</span>
						<strong>Rs. ${amount}</strong>
					</div>
				</div>
				<div class="words-row">
					Amount in words: <span style="font-weight: normal;">${escapeHtml(words)}</span>
				</div>
				<div class="details-box">
					<strong>For</strong>
					${escapeHtml(bill.appointmentId || '')}<br>
					${bill.doctor ? `Doctor: ${escapeHtml(bill.doctor)}<br>` : ''}
					Payment Mode: ${escapeHtml(paymentModeDisplay)}
					<div class="digitally-signed">Digitally Signed</div>
				</div>
				<div class="footer">
					<div>Computer generated receipt.</div>
					<div style="text-transform: uppercase;">For Centre For Sports Science</div>
				</div>
			</div>
		</body>
		</html>
	`;
}

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
	
	// Billing collection state
	const [billing, setBilling] = useState<BillingRecord[]>([]);
	const [selectedBill, setSelectedBill] = useState<BillingRecord | null>(null);
	const [showPayModal, setShowPayModal] = useState(false);
	const [showPaymentSlipModal, setShowPaymentSlipModal] = useState(false);
	const [paymentMode, setPaymentMode] = useState<'Cash' | 'UPI/Card'>('Cash');
	const [utr, setUtr] = useState('');
	const [filterRange, setFilterRange] = useState<string>('30');

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
			},
			error => {
				console.error('Failed to load billing', error);
				setBilling([]);
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

					// Create billing record if rules allow
					if (shouldCreateBill) {
						// Check if billing record already exists
						const existingQuery = query(collection(db, 'billing'), where('appointmentId', '==', appt.appointmentId));
						const existingSnapshot = await getDocs(existingQuery);
						if (!existingSnapshot.empty) continue;

						const billingId = 'BILL-' + (appt.appointmentId || Date.now().toString());
						
						// Create billing record in billing collection
						await addDoc(collection(db, 'billing'), {
							billingId,
							appointmentId: appt.appointmentId,
							patient: appt.patient || '',
							patientId: appt.patientId || '',
							doctor: appt.doctor || '',
							amount: billAmount,
							date: appt.date || defaultBillingDate,
							status: 'Pending',
							paymentMode: null,
							utr: null,
							createdAt: serverTimestamp(),
							updatedAt: serverTimestamp(),
						});

						// Also update appointment with billing info
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
			// Update appointment
			await updateDoc(doc(db, 'appointments', appointmentId), {
				status: 'completed',
				billing: {
					amount: amountValue.toFixed(2),
					date: draft.date,
				},
			});

			// Update or create billing record
			const billingQuery = query(collection(db, 'billing'), where('appointmentId', '==', appointment.appointmentId));
			const billingSnapshot = await getDocs(billingQuery);
			if (!billingSnapshot.empty) {
				await updateDoc(doc(db, 'billing', billingSnapshot.docs[0].id), {
					amount: amountValue,
					date: draft.date,
					updatedAt: serverTimestamp(),
				});
			} else {
				const billingId = 'BILL-' + (appointment.appointmentId || Date.now().toString());
				await addDoc(collection(db, 'billing'), {
					billingId,
					appointmentId: appointment.appointmentId,
					patient: appointment.patient || '',
					patientId: appointment.patientId || '',
					doctor: appointment.doctor || '',
					amount: amountValue,
					date: draft.date,
					status: 'Pending',
					paymentMode: null,
					utr: null,
					createdAt: serverTimestamp(),
					updatedAt: serverTimestamp(),
				});
			}

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
			<tr><td><strong>Amount:</strong></td><td>Rs. ${Number(invoiceDetails.amount).toFixed(2)}</td></tr>
		</table>
		<hr />
		<p>Thank you for your payment!</p>
		</body></html>`);
		win.document.close();
		win.focus();
		win.print();
	};

	const handlePay = (bill: BillingRecord) => {
		setSelectedBill(bill);
		setShowPayModal(true);
		setPaymentMode('Cash');
		setUtr('');
	};

	const handleSubmitPayment = async () => {
		if (!selectedBill) return;
		if (paymentMode === 'UPI/Card' && !utr.trim()) {
			alert('Please enter UTR/Transaction ID for UPI/Card payment.');
			return;
		}

		try {
			await updateDoc(doc(db, 'billing', selectedBill.id!), {
				status: 'Completed',
				paymentMode: paymentMode,
				utr: paymentMode === 'UPI/Card' ? utr.trim() : null,
				updatedAt: serverTimestamp(),
			});

			// Also update appointment billing status if linked
			if (selectedBill.appointmentId) {
				const appointmentQuery = query(collection(db, 'appointments'), where('appointmentId', '==', selectedBill.appointmentId));
				const appointmentSnapshot = await getDocs(appointmentQuery);
				if (!appointmentSnapshot.empty) {
					await updateDoc(doc(db, 'appointments', appointmentSnapshot.docs[0].id), {
						'billing.status': 'Completed',
						'billing.paymentMode': paymentMode,
						'billing.utr': paymentMode === 'UPI/Card' ? utr.trim() : null,
					});
				}
			}

			setShowPayModal(false);
			setSelectedBill(null);
			setPaymentMode('Cash');
			setUtr('');
		} catch (error) {
			console.error('Failed to update payment', error);
			alert(`Failed to process payment: ${error instanceof Error ? error.message : 'Unknown error'}`);
		}
	};

	const handleViewPaymentSlip = (bill: BillingRecord) => {
		setSelectedBill(bill);
		setShowPaymentSlipModal(true);
	};

	const handlePrintPaymentSlip = () => {
		if (!selectedBill) return;
		
		const receiptNo = selectedBill.billingId || `BILL-${selectedBill.id?.slice(0, 8) || 'NA'}`;
		const html = generateReceiptHtml(selectedBill, receiptNo);
		const printWindow = window.open('', '_blank');
		if (!printWindow) return;
		printWindow.document.write(html);
		printWindow.document.close();
		printWindow.focus();
		printWindow.print();
	};

	const handleGenerateInvoice = (bill: BillingRecord) => {
		const invoiceNo = bill.invoiceNo || `INV-${bill.billingId || bill.id?.slice(0, 8) || Date.now().toString()}`;
		const html = generateInvoiceHtml(bill, invoiceNo);
		const printWindow = window.open('', '_blank');
		if (!printWindow) return;
		printWindow.document.write(html);
		printWindow.document.close();
		printWindow.focus();
		printWindow.print();

		// Update invoice number if not set
		if (!bill.invoiceNo && bill.id) {
			updateDoc(doc(db, 'billing', bill.id), {
				invoiceNo: invoiceNo,
				invoiceGeneratedAt: new Date().toISOString(),
			}).catch(err => console.error('Failed to update invoice number', err));
		}
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

		// Use billing collection for cycle summary
		for (const bill of billing) {
			const billDate = bill.date;
			const billAmount = Number(bill.amount ?? 0);
			if (billDate && isWithinCycle(billDate, cycle)) {
				if (bill.status === 'Pending') {
					pendingCount += 1;
				} else if (bill.status === 'Completed') {
					completedCount += 1;
					collectedAmount += Number.isFinite(billAmount) ? billAmount : 0;
					const key = bill.doctor || 'Unassigned';
					byClinicianMap.set(key, (byClinicianMap.get(key) || 0) + (Number.isFinite(billAmount) ? billAmount : 0));
				}
			}
		}

		const byClinician = Array.from(byClinicianMap.entries())
			.map(([doctor, amount]) => ({ doctor, amount }))
			.sort((a, b) => b.amount - a.amount);

		return { pendingCount, completedCount, collectedAmount, byClinician };
	}, [billing, selectedCycle]);

	// Pending payments from billing collection
	const pending = useMemo(() => {
		return billing.filter(b => b.status === 'Pending');
	}, [billing]);

	// Completed payments from billing collection
	const completed = useMemo(() => {
		return billing.filter(b => b.status === 'Completed');
	}, [billing]);

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

			{/* Pending Payments Section */}
			<section className="mx-auto mt-6 grid max-w-6xl gap-6">
				<article className="rounded-2xl bg-white shadow-[0_18px_40px_rgba(15,23,42,0.07)]">
					<header className="flex items-center justify-between rounded-t-2xl bg-amber-100 px-5 py-4 text-amber-900">
						<div>
							<h2 className="text-lg font-semibold">Pending Payments</h2>
							<p className="text-xs text-amber-800/80">
								Bills awaiting payment confirmation.
							</p>
						</div>
						<span className="inline-flex h-7 min-w-8 items-center justify-center rounded-full bg-amber-500 px-2 text-xs font-semibold text-white">
							{pending.length}
						</span>
					</header>
					<div className="overflow-x-auto px-5 pb-5 pt-3">
						<table className="min-w-full divide-y divide-amber-200 text-left text-sm text-slate-700">
							<thead className="bg-amber-50 text-xs uppercase tracking-wide text-amber-700">
								<tr>
									<th className="px-3 py-2 font-semibold">Patient</th>
									<th className="px-3 py-2 font-semibold">Patient ID</th>
									<th className="px-3 py-2 font-semibold">Doctor</th>
									<th className="px-3 py-2 font-semibold">Amount (₹)</th>
									<th className="px-3 py-2 font-semibold">Date</th>
									<th className="px-3 py-2 font-semibold text-right">Action</th>
								</tr>
							</thead>
							<tbody className="divide-y divide-amber-100">
								{pending.length === 0 ? (
									<tr>
										<td colSpan={6} className="px-3 py-6 text-center text-sm text-slate-500">
											No pending payments.
										</td>
									</tr>
								) : (
									pending.map(bill => (
										<tr key={bill.id}>
											<td className="px-3 py-3 font-medium text-slate-800">{bill.patient}</td>
											<td className="px-3 py-3 text-slate-600">{bill.patientId}</td>
											<td className="px-3 py-3 text-slate-600">{bill.doctor || '—'}</td>
											<td className="px-3 py-3 text-slate-700">Rs. {bill.amount.toFixed(2)}</td>
											<td className="px-3 py-3 text-slate-600">{bill.date || '—'}</td>
											<td className="px-3 py-3 text-right">
												<button
													type="button"
													onClick={() => handlePay(bill)}
													className="inline-flex items-center rounded-lg bg-emerald-600 px-2.5 py-1 text-xs font-semibold text-white transition hover:bg-emerald-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-200"
												>
													Pay
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

			{/* Completed Payments Section */}
			<section className="mx-auto mt-6 grid max-w-6xl gap-6">
				<article className="rounded-2xl bg-white shadow-[0_18px_40px_rgba(15,23,42,0.07)]">
					<header className="flex items-center justify-between rounded-t-2xl bg-emerald-100 px-5 py-4 text-emerald-900">
						<div>
							<h2 className="text-lg font-semibold">Completed Payments</h2>
							<p className="text-xs text-emerald-800/80">
								Payments that have been completed.
							</p>
						</div>
						<span className="inline-flex h-7 min-w-8 items-center justify-center rounded-full bg-emerald-500 px-2 text-xs font-semibold text-white">
							{completed.length}
						</span>
					</header>
					<div className="overflow-x-auto px-5 pb-5 pt-3">
						<table className="min-w-full divide-y divide-emerald-200 text-left text-sm text-slate-700">
							<thead className="bg-emerald-50 text-xs uppercase tracking-wide text-emerald-700">
								<tr>
									<th className="px-3 py-2 font-semibold">Patient</th>
									<th className="px-3 py-2 font-semibold">Patient ID</th>
									<th className="px-3 py-2 font-semibold">Doctor</th>
									<th className="px-3 py-2 font-semibold">Amount (₹)</th>
									<th className="px-3 py-2 font-semibold">Payment Mode</th>
									<th className="px-3 py-2 font-semibold text-right">Actions</th>
								</tr>
							</thead>
							<tbody className="divide-y divide-emerald-100">
								{completed.length === 0 ? (
									<tr>
										<td colSpan={6} className="px-3 py-6 text-center text-sm text-slate-500">
											No completed payments.
										</td>
									</tr>
								) : (
									completed.map(bill => (
										<tr key={bill.id}>
											<td className="px-3 py-3 font-medium text-slate-800">{bill.patient}</td>
											<td className="px-3 py-3 text-slate-600">{bill.patientId}</td>
											<td className="px-3 py-3 text-slate-600">{bill.doctor || '—'}</td>
											<td className="px-3 py-3 text-slate-700">Rs. {bill.amount.toFixed(2)}</td>
											<td className="px-3 py-3 text-slate-600">{bill.paymentMode || '—'}</td>
											<td className="px-3 py-3">
												<div className="flex items-center justify-end gap-2">
													<button
														type="button"
														onClick={() => handleViewPaymentSlip(bill)}
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
									))
								)}
							</tbody>
						</table>
					</div>
				</article>
			</section>

			{/* Payment Modal */}
			{showPayModal && selectedBill && (
				<div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 px-4 py-6">
					<div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white shadow-2xl">
						<header className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
							<h2 className="text-lg font-semibold text-slate-900">Mark Payment as Completed</h2>
							<button
								type="button"
								onClick={() => {
									setShowPayModal(false);
									setSelectedBill(null);
								}}
								className="rounded-full p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 focus-visible:outline-none"
								aria-label="Close"
							>
								<i className="fas fa-times" aria-hidden="true" />
							</button>
						</header>
						<div className="px-6 py-6">
							<div className="mb-4">
								<label className="block text-sm font-medium text-slate-700 mb-2">Payment Mode</label>
								<select
									value={paymentMode}
									onChange={e => setPaymentMode(e.target.value as 'Cash' | 'UPI/Card')}
									className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 transition focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-200"
								>
									<option value="Cash">Cash</option>
									<option value="UPI/Card">UPI/Card</option>
								</select>
							</div>
							{paymentMode === 'UPI/Card' && (
								<div className="mb-4">
									<label className="block text-sm font-medium text-slate-700 mb-2">UTR/Transaction ID</label>
									<input
										type="text"
										value={utr}
										onChange={e => setUtr(e.target.value)}
										placeholder="Enter UTR/Transaction ID"
										className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 transition focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-200"
									/>
								</div>
							)}
							<div className="rounded-lg bg-slate-50 p-4">
								<p className="text-sm text-slate-600">Patient: <span className="font-medium text-slate-900">{selectedBill.patient}</span></p>
								<p className="text-sm text-slate-600 mt-1">Amount: <span className="font-medium text-slate-900">Rs. {selectedBill.amount.toFixed(2)}</span></p>
							</div>
						</div>
						<footer className="flex items-center justify-end gap-3 border-t border-slate-200 px-6 py-4">
							<button
								type="button"
								onClick={() => {
									setShowPayModal(false);
									setSelectedBill(null);
								}}
								className="inline-flex items-center rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition hover:border-slate-300 hover:text-slate-800 focus-visible:outline-none"
							>
								Cancel
							</button>
							<button
								type="button"
								onClick={handleSubmitPayment}
								className="inline-flex items-center rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-200"
							>
								Confirm Payment
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
							<h2 className="text-lg font-semibold text-slate-900">Payment Receipt</h2>
							<button
								type="button"
								onClick={() => {
									setShowPaymentSlipModal(false);
									setSelectedBill(null);
								}}
								className="rounded-full p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 focus-visible:outline-none"
								aria-label="Close"
							>
								<i className="fas fa-times" aria-hidden="true" />
							</button>
						</header>
						<div className="px-6 py-6">
							<div dangerouslySetInnerHTML={{ __html: generateReceiptHtml(selectedBill, selectedBill.billingId || `BILL-${selectedBill.id?.slice(0, 8) || 'NA'}`) }} />
						</div>
						<footer className="flex items-center justify-end gap-3 border-t border-slate-200 px-6 py-4">
							<button
								type="button"
								onClick={handlePrintPaymentSlip}
								className="inline-flex items-center rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-200"
							>
								<i className="fas fa-print mr-2 text-sm" aria-hidden="true" />
								Print
							</button>
							<button
								type="button"
								onClick={() => {
									setShowPaymentSlipModal(false);
									setSelectedBill(null);
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
		</div>
	);
}



