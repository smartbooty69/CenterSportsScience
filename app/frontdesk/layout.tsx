'use client';

import { useState } from 'react';
import Sidebar, { type SidebarLink } from '@/components/Sidebar';
import Dashboard from './components/Dashboard';
import Register from './components/Register';
import Appointments from './components/Appointments';
import Billing from './components/Billing';
import Reports from './components/Reports';

type FrontdeskPage = 'dashboard' | 'register' | 'appointments' | 'billing' | 'reports';

const frontdeskLinks: SidebarLink[] = [
	{ href: '#dashboard', label: 'Dashboard', icon: 'fas fa-home' },
	{ href: '#register', label: 'Register Patient', icon: 'fas fa-user-plus' },
	{ href: '#appointments', label: 'Appointments', icon: 'fas fa-calendar-check' },
	{ href: '#billing', label: 'Billing', icon: 'fas fa-file-invoice-dollar' },
	{ href: '#reports', label: 'Reports', icon: 'fas fa-chart-line' },
];

export default function FrontdeskLayout({ children }: { children: React.ReactNode }) {
	const [activePage, setActivePage] = useState<FrontdeskPage>('dashboard');

	const handleLinkClick = (href: string) => {
		const page = href.replace('#', '') as FrontdeskPage;
		setActivePage(page);
	};

	const renderPage = () => {
		switch (activePage) {
			case 'dashboard':
				return <Dashboard onNavigate={handleLinkClick} />;
			case 'register':
				return <Register />;
			case 'appointments':
				return <Appointments />;
			case 'billing':
				return <Billing />;
			case 'reports':
				return <Reports />;
			default:
				return <Dashboard onNavigate={handleLinkClick} />;
		}
	};

	return (
		<div className="min-h-svh bg-slate-50">
			<Sidebar
				title="Front Desk"
				links={frontdeskLinks}
				onLinkClick={handleLinkClick}
				activeHref={`#${activePage}`}
			/>
			<main className="ml-64 min-h-svh overflow-y-auto bg-white">{renderPage()}</main>
		</div>
	);
}
