'use client';

import { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot, type QuerySnapshot } from 'firebase/firestore';

import { db } from '@/lib/firebase';
import PageHeader from '@/components/PageHeader';

type PatientStatus = 'pending' | 'ongoing' | 'completed' | 'cancelled' | string;

interface PatientRecord {
	id: string;
	patientId?: string;
	name?: string;
	dob?: string;
	gender?: string;
	phone?: string;
	email?: string;
	address?: string;
	complaint?: string;
	status?: PatientStatus;
	assignedDoctor?: string;
	registeredAt?: string;
}

const STATUS_BADGES: Record<'pending' | 'ongoing' | 'completed' | 'cancelled', string> = {
	pending: 'bg-amber-100 text-amber-700 ring-1 ring-amber-200',
	ongoing: 'bg-sky-100 text-sky-700 ring-1 ring-sky-200',
	completed: 'bg-emerald-100 text-emerald-700 ring-1 ring-emerald-200',
	cancelled: 'bg-rose-100 text-rose-600 ring-1 ring-rose-200',
};

type ModalType = 'patients' | 'pending' | 'ongoing' | 'completed' | null;

interface DashboardCardConfig {
	key: Exclude<ModalType, null>;
	title: string;
	subtitle: string;
	icon: string;
	accent: string;
	count: number;
}


interface DashboardProps {
	onNavigate?: (page: string) => void;
}

export default function Dashboard({ onNavigate }: DashboardProps) {
	const [patients, setPatients] = useState<PatientRecord[]>([]);
	const [modal, setModal] = useState<ModalType>(null);

	useEffect(() => {
		const unsubscribe = onSnapshot(
			collection(db, 'patients'),
			(snapshot: QuerySnapshot) => {
				const mapped = snapshot.docs.map(docSnap => {
					const data = docSnap.data() as Record<string, unknown>;
					const created = (data.registeredAt as { toDate?: () => Date } | undefined)?.toDate?.();
					return {
						id: docSnap.id,
						patientId: data.patientId ? String(data.patientId) : undefined,
						name: data.name ? String(data.name) : undefined,
						dob: data.dob ? String(data.dob) : undefined,
						gender: data.gender ? String(data.gender) : undefined,
						phone: data.phone ? String(data.phone) : undefined,
						email: data.email ? String(data.email) : undefined,
						address: data.address ? String(data.address) : undefined,
						complaint: data.complaint ? String(data.complaint) : undefined,
						status: (data.status as PatientStatus) ?? 'pending',
						assignedDoctor: data.assignedDoctor ? String(data.assignedDoctor) : undefined,
						registeredAt: created ? created.toISOString() : (data.registeredAt as string | undefined),
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

	const stats = useMemo(() => {
		const pending = patients.filter(p => (p.status ?? 'pending') === 'pending');
		const ongoing = patients.filter(p => p.status === 'ongoing');
		const completed = patients.filter(p => p.status === 'completed');

		return {
			total: patients.length,
			pending,
			ongoing,
			completed,
		};
	}, [patients]);

	const modalTitle = useMemo(() => {
		switch (modal) {
			case 'patients':
				return 'All Registered Patients';
			case 'pending':
				return 'Pending Appointments';
			case 'ongoing':
				return 'Ongoing Appointments';
			case 'completed':
				return 'Completed Treatments';
			default:
				return '';
		}
	}, [modal]);

	const modalRows = useMemo<PatientRecord[]>(() => {
		switch (modal) {
			case 'patients':
				return patients;
			case 'pending':
				return stats.pending;
			case 'ongoing':
				return stats.ongoing;
			case 'completed':
				return stats.completed;
			default:
				return [];
		}
	}, [modal, patients, stats]);

	const dashboardCards: DashboardCardConfig[] = [
		{
			key: 'patients',
			title: 'Total Registered',
			subtitle: 'View full registry',
			icon: 'fas fa-clipboard-list',
			accent: 'bg-sky-100 text-sky-600',
			count: stats.total,
		},
		{
			key: 'pending',
			title: 'Pending',
			subtitle: 'Awaiting confirmation',
			icon: 'fas fa-hourglass-half',
			accent: 'bg-amber-100 text-amber-600',
			count: stats.pending.length,
		},
		{
			key: 'ongoing',
			title: 'Ongoing',
			subtitle: 'Currently in progress',
			icon: 'fas fa-stethoscope',
			accent: 'bg-sky-100 text-sky-600',
			count: stats.ongoing.length,
		},
		{
			key: 'completed',
			title: 'Completed',
			subtitle: 'Ready for billing',
			icon: 'fas fa-check-circle',
			accent: 'bg-emerald-100 text-emerald-600',
			count: stats.completed.length,
		},
	];

	const quickLinks = [
		{
			href: '#register',
			icon: 'fas fa-user-plus',
			title: 'Register Patient',
			summary: 'Add new patients to the system.',
		},
		{
			href: '#appointments',
			icon: 'fas fa-calendar-check',
			title: 'Appointments',
			summary: 'Schedule and manage appointments.',
		},
		{
			href: '#billing',
			icon: 'fas fa-file-invoice-dollar',
			title: 'Billing',
			summary: 'Process payments and invoices.',
		},
		{
			href: '#reports',
			icon: 'fas fa-chart-line',
			title: 'Reports',
			summary: 'View and export patient reports.',
		},
	];

	const handleQuickLinkClick = (href: string) => {
		if (onNavigate) {
			onNavigate(href);
		}
	};

	const ICON_WRAPPER =
		'flex h-12 w-12 items-center justify-center rounded-xl bg-sky-100 text-sky-600 transition group-hover:bg-sky-600 group-hover:text-white group-focus-visible:bg-sky-600 group-focus-visible:text-white';

	return (
		<div className="min-h-svh bg-slate-50 px-6 py-10">
			<div className="mx-auto max-w-6xl space-y-10">
				<PageHeader
					badge="Front Desk"
					title="Front Desk Dashboard"
					description="Stay on top of patient flow. Use the cards below to drill into the latest registries and statuses in seconds."
					statusCard={{
						label: 'Active Patients',
						value: `${stats.total} records synced from the registry.`,
						subtitle: (
							<>
								Pending today: <span className="font-semibold">{stats.pending.length}</span>
							</>
						),
					}}
				/>

				{/* Divider */}
				<div className="border-t border-slate-200" />

				{/* Statistics Overview Section */}
				<section>
					<div className="mb-6">
						<h2 className="text-xl font-semibold text-slate-900">Overview</h2>
						<p className="mt-1 text-sm text-slate-500">
							Quick access to patient statistics and status breakdowns
						</p>
					</div>
					<div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
						{dashboardCards.map(card => (
							<button
								key={card.key}
								type="button"
								onClick={() => setModal(card.key)}
								className="group card-base"
							>
								<div className="flex items-center justify-between">
									<span
										className={`flex h-12 w-12 items-center justify-center rounded-xl ${card.accent}`}
										aria-hidden="true"
									>
										<i className={card.icon} />
									</span>
									<span className="text-3xl font-bold text-slate-900">{card.count}</span>
								</div>
								<div>
									<p className="text-sm font-semibold text-slate-900">{card.title}</p>
									<p className="mt-1 text-xs text-slate-500">{card.subtitle}</p>
								</div>
								<span className="mt-auto inline-flex items-center text-sm font-semibold text-sky-600 group-hover:text-sky-700 group-focus-visible:text-sky-700">
									View details <i className="fas fa-arrow-right ml-2 text-xs" aria-hidden="true" />
								</span>
							</button>
						))}
					</div>
				</section>

				{/* Divider */}
				<div className="border-t border-slate-200" />

				{/* Quick Actions Section */}
				{onNavigate && (
					<section>
						<div className="mb-6">
							<h2 className="text-xl font-semibold text-slate-900">Quick Actions</h2>
							<p className="mt-1 text-sm text-slate-500">
								Access core front desk tools and functions
							</p>
						</div>
						<div
							className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
							aria-label="Front desk quick actions"
						>
							{quickLinks.map(link => (
								<button
									key={link.href}
									type="button"
									onClick={() => handleQuickLinkClick(link.href)}
									className="group card-base gap-3"
								>
									<span className={ICON_WRAPPER} aria-hidden="true">
										<i className={link.icon} />
									</span>
									<div>
										<h3 className="text-lg font-semibold text-slate-900">{link.title}</h3>
										<p className="mt-1 text-sm text-slate-500">{link.summary}</p>
									</div>
									<span className="mt-auto inline-flex items-center text-sm font-semibold text-sky-600 group-hover:text-sky-700 group-focus-visible:text-sky-700">
										Open <i className="fas fa-arrow-right ml-2 text-xs" aria-hidden="true" />
									</span>
								</button>
							))}
						</div>
					</section>
				)}

				{/* Divider */}
				<div className="border-t border-slate-200" />

				{/* Daily Operations Section */}
				<section>
					<div className="mb-6">
						<h2 className="text-xl font-semibold text-slate-900">Daily Operations</h2>
						<p className="mt-1 text-sm text-slate-500">
							Monitor today&apos;s activity and access helpful resources
						</p>
					</div>
					<div className="grid gap-6 lg:grid-cols-[2fr,1fr]">
						<div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
							<h3 className="text-lg font-semibold text-slate-900">Today&apos;s Snapshot</h3>
							<p className="mt-1 text-sm text-slate-500">
								Breakdown of active cases by status to help balance your day.
							</p>
							<div className="mt-6 space-y-3">
								{(['pending', 'ongoing', 'completed'] as Array<'pending' | 'ongoing' | 'completed'>).map(key => (
									<div
										key={key}
										className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50 px-4 py-3"
									>
										<div>
											<p className="text-sm font-semibold text-slate-800">
												{key === 'pending' ? 'Pending' : key === 'ongoing' ? 'Ongoing' : 'Completed'}
											</p>
											<p className="text-xs text-slate-500">
												{key === 'pending'
													? 'Waiting for confirmation or scheduling'
													: key === 'ongoing'
														? 'In session or scheduled today'
														: 'Ready for follow-up or discharge'}
											</p>
										</div>
										<div className="flex items-center gap-3">
											<span className="text-2xl font-bold text-slate-900">
												{key === 'pending'
													? stats.pending.length
													: key === 'ongoing'
														? stats.ongoing.length
														: stats.completed.length}
											</span>
											<button
												type="button"
												onClick={() => setModal(key)}
												className="text-xs font-semibold text-sky-600 hover:text-sky-500"
											>
												View
											</button>
										</div>
									</div>
								))}
							</div>
						</div>

						<div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
							<h3 className="text-lg font-semibold text-slate-900">Quick Tips</h3>
							<ul className="mt-4 space-y-3 text-sm text-slate-600">
								<li>Confirm pending appointments by noon to keep the clinical team&apos;s schedule accurate.</li>
								<li>Mark treatments as completed once documentation is received so billing can proceed without delay.</li>
								<li>Export the latest roster before end-of-day reporting to catch outstanding paperwork.</li>
							</ul>
						</div>
					</div>
				</section>
			</div>

			{modal && (
				<div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 px-4 py-6">
					<div className="w-full max-w-5xl rounded-2xl border border-slate-200 bg-white shadow-2xl">
						<header className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
							<div>
								<h2 className="text-lg font-semibold text-slate-900">{modalTitle}</h2>
								<p className="text-xs text-slate-500">
									Showing {modalRows.length} record{modalRows.length === 1 ? '' : 's'}.
								</p>
							</div>
							<button
								type="button"
								onClick={() => setModal(null)}
								className="rounded-full p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 focus-visible:bg-slate-100 focus-visible:text-slate-600 focus-visible:outline-none"
								aria-label="Close dialog"
							>
								<i className="fas fa-times" aria-hidden="true" />
							</button>
						</header>
						<div className="max-h-[480px] overflow-y-auto px-6 py-4">
							{modalRows.length === 0 ? (
								<p className="py-10 text-center text-sm text-slate-500">No records available.</p>
							) : (
								<div className="overflow-x-auto">
									<table className="min-w-full divide-y divide-slate-200 text-left text-sm text-slate-700">
										<thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
											<tr>
												<th className="px-3 py-2 font-semibold">#</th>
												<th className="px-3 py-2 font-semibold">Patient ID</th>
												<th className="px-3 py-2 font-semibold">Name</th>
												<th className="px-3 py-2 font-semibold">Status</th>
												<th className="px-3 py-2 font-semibold">Assigned Clinician</th>
												<th className="px-3 py-2 font-semibold">Phone</th>
												<th className="px-3 py-2 font-semibold">Email</th>
											</tr>
										</thead>
										<tbody className="divide-y divide-slate-100">
											{modalRows.map((patient, index) => {
												const status = (patient.status ?? 'pending') as PatientStatus;
												const badgeClass =
													STATUS_BADGES[
														status === 'pending' || status === 'ongoing' || status === 'completed' || status === 'cancelled'
															? status
															: 'pending'
													];

												return (
													<tr key={patient.id}>
														<td className="px-3 py-3 text-xs text-slate-500">{index + 1}</td>
														<td className="px-3 py-3 text-sm font-medium text-slate-800">
															{patient.patientId || '—'}
														</td>
														<td className="px-3 py-3 text-sm text-slate-700">{patient.name || '—'}</td>
														<td className="px-3 py-3">
															<span
																className={`inline-flex items-center rounded-full px-3 py-1 text-[11px] font-semibold ${badgeClass}`}
															>
																{status.toString().charAt(0).toUpperCase() + status.toString().slice(1)}
															</span>
														</td>
														<td className="px-3 py-3 text-sm text-slate-600">
															{patient.assignedDoctor || '—'}
														</td>
														<td className="px-3 py-3 text-sm text-slate-600">{patient.phone || '—'}</td>
														<td className="px-3 py-3 text-sm text-slate-600">{patient.email || '—'}</td>
													</tr>
												);
											})}
										</tbody>
									</table>
								</div>
							)}
						</div>
					</div>
				</div>
			)}
		</div>
	);
}
