import PageHeader from '@/components/PageHeader';

interface DashboardProps {
	onNavigate?: (page: string) => void;
}

export default function Dashboard({ onNavigate }: DashboardProps) {
	const quickLinks = [
		{
			href: '#users',
			icon: 'fas fa-users-cog',
			title: 'Employee Management',
			summary: 'Register Front Desk & Clinical Team staff.',
		},
		{
			href: '#patients',
			icon: 'fas fa-user-injured',
			title: 'Patient Management',
			summary: 'Search, add, and export patient records.',
		},
		{
			href: '#appointments',
			icon: 'fas fa-calendar-alt',
			title: 'Appointments',
			summary: 'Coordinate schedules and manage bookings.',
		},
		{
			href: '#billing',
			icon: 'fas fa-file-invoice-dollar',
			title: 'Billing & Payments',
			summary: 'Track invoices and payment status.',
		},
		{
			href: '#reports',
			icon: 'fas fa-chart-bar',
			title: 'Reports & Analytics',
			summary: 'Monitor performance trends and exports.',
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
					badge="Admin"
					title="Admin Dashboard"
					description="Manage staff, monitor operations, and jump into core tooling without leaving this workspace."
					statusCard={{
						label: 'Status',
						value: 'All systems operational.',
						subtitle: (
							<>
								Last sync: <span className="font-semibold">~2 mins ago</span>
							</>
						),
					}}
				/>

				{/* Divider */}
				<div className="border-t border-slate-200" />

				{/* Quick Actions Section */}
				<section>
					<div className="mb-6">
						<h2 className="text-xl font-semibold text-slate-900">Quick Actions</h2>
						<p className="mt-1 text-sm text-slate-500">
							Access core management tools and system functions
						</p>
					</div>
					<div
						className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3"
						aria-label="Admin quick actions"
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

				{/* Divider */}
				<div className="border-t border-slate-200" />

				{/* Operations & Resources Section */}
				<section>
					<div className="mb-6">
						<h2 className="text-xl font-semibold text-slate-900">Operations & Resources</h2>
						<p className="mt-1 text-sm text-slate-500">
							Monitor daily operations and access helpful resources
						</p>
					</div>
					<div className="grid gap-6 lg:grid-cols-[2fr,1fr]">
						<div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
							<h3 className="text-lg font-semibold text-slate-900">Operational Snapshot</h3>
							<p className="mt-1 text-sm text-slate-500">
								Keep tabs on the day-to-day so handoffs stay smooth across teams.
							</p>
							<ul className="mt-4 space-y-3 text-sm text-slate-600">
								<li className="flex items-start gap-2">
									<i className="fas fa-user-shield mt-1 text-sky-500" aria-hidden="true" />
									<span>Review pending staff invites to ensure new hires have access on day one.</span>
								</li>
								<li className="flex items-start gap-2">
									<i className="fas fa-file-alt mt-1 text-sky-500" aria-hidden="true" />
									<span>Export the latest patient roster before daily stand-up for quick reference.</span>
								</li>
								<li className="flex items-start gap-2">
									<i className="fas fa-bell mt-1 text-sky-500" aria-hidden="true" />
									<span>Check calendar notifications for schedule conflicts flagged overnight.</span>
								</li>
							</ul>
						</div>
						<div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
							<h3 className="text-lg font-semibold text-slate-900">Need A Quick Link?</h3>
							<ul className="mt-4 space-y-3 text-sm text-slate-600">
								<li>
									<button
										type="button"
										onClick={() => handleQuickLinkClick('#reports')}
										className="inline-flex items-center text-sky-600 hover:text-sky-500"
									>
										<i className="fas fa-chart-line mr-2 text-xs" aria-hidden="true" />
										View performance overview
									</button>
								</li>
								<li>
									<button
										type="button"
										onClick={() => handleQuickLinkClick('#billing')}
										className="inline-flex items-center text-sky-600 hover:text-sky-500"
									>
										<i className="fas fa-wallet mr-2 text-xs" aria-hidden="true" />
										Reconcile outstanding invoices
									</button>
								</li>
							</ul>
						</div>
					</div>
				</section>
			</div>
		</div>
	);
}

