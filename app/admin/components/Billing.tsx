'use client';

import { useEffect, useMemo, useState } from 'react';
import { collection, doc, onSnapshot, updateDoc, type QuerySnapshot, type Timestamp } from 'firebase/firestore';

import {
	type AdminAppointmentRecord,
	type AdminPatientRecord,
} from '@/lib/adminMockData';
import { db } from '@/lib/firebase';
import PageHeader from '@/components/PageHeader';

interface StaffMember {
	id: string;
	userName: string;
	role: string;
	status: string;
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
	const [appointments, setAppointments] = useState<(AdminAppointmentRecord & { id: string })[]>([]);
	const [patients, setPatients] = useState<(AdminPatientRecord & { id?: string })[]>([]);
	const [staff, setStaff] = useState<StaffMember[]>([]);

	const [doctorFilter, setDoctorFilter] = useState<'all' | string>('all');
	const [pendingWindow, setPendingWindow] = useState<DateFilter>('all');
	const [completedWindow, setCompletedWindow] = useState<DateFilter>('all');

	const [pendingDrafts, setPendingDrafts] = useState<Record<string, PendingDraft>>({});
	const [isInvoiceOpen, setIsInvoiceOpen] = useState(false);
	const [invoiceDetails, setInvoiceDetails] = useState<InvoiceDetails | null>(null);

	const [defaultBillingDate] = useState(() => new Date().toISOString().slice(0, 10));

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
						createdAt: created ? created.toISOString() : (data.createdAt as string | undefined) || new Date().toISOString(),
					} as AdminAppointmentRecord & { id: string };
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
				return { ...entry, patientName };
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

		try {
			await updateDoc(doc(db, 'appointments', appointmentId), {
				status: 'completed',
				billing: {
					amount: amountValue.toFixed(2),
					date: draft.date,
				},
			});

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

	const handleExportHistory = () => {
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
	};

	return (
		<div className="min-h-svh bg-slate-50 px-6 py-10">
			<div className="mx-auto max-w-6xl space-y-10">
				<PageHeader
					badge="Admin"
					title="Billing & Payments"
					description="Track outstanding invoices, post collections, and generate payment receipts."
					actions={
						<button
							type="button"
							onClick={handleExportHistory}
							className="inline-flex items-center rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white shadow-md transition hover:bg-sky-500 focus-visible:bg-sky-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600"
						>
							<i className="fas fa-file-csv mr-2 text-sm" aria-hidden="true" />
							Export CSV
						</button>
					}
				/>

				<div className="border-t border-slate-200" />

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
						<span className="inline-flex h-7 min-w-8 items-center justify-center rounded-full bg-amber-500 px-2 text-xs font-semibold text-white">
							{pendingRows.length}
						</span>
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
												<td className="px-3 py-3 font-medium text-slate-800">{row.patientName}</td>
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



