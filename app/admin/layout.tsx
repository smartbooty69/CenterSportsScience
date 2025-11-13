'use client';

import { useState } from 'react';
import Sidebar, { type SidebarLink } from '@/components/Sidebar';
import Dashboard from './components/Dashboard';
import Users from './components/Users';
import Patients from './components/Patients';
import Appointments from './components/Appointments';
import Billing from './components/Billing';
import Reports from './components/Reports';
import Seed from './components/Seed';

type AdminPage = 'dashboard' | 'users' | 'patients' | 'appointments' | 'billing' | 'reports' | 'seed';

const adminLinks: SidebarLink[] = [
	{ href: '#dashboard', label: 'Dashboard', icon: 'fas fa-columns' },
	{ href: '#users', label: 'Employee Management', icon: 'fas fa-users-cog' },
	{ href: '#patients', label: 'Patient Management', icon: 'fas fa-user-injured' },
	{ href: '#appointments', label: 'Appointments', icon: 'fas fa-calendar-alt' },
	{ href: '#billing', label: 'Billing & Payments', icon: 'fas fa-file-invoice-dollar' },
	{ href: '#reports', label: 'Reports & Analytics', icon: 'fas fa-chart-pie' },
	{ href: '#seed', label: 'Seed Data', icon: 'fas fa-database' },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
	const [activePage, setActivePage] = useState<AdminPage>('dashboard');

	const handleLinkClick = (href: string) => {
		const page = href.replace('#', '') as AdminPage;
		setActivePage(page);
	};

	const renderPage = () => {
		switch (activePage) {
			case 'dashboard':
				return <Dashboard onNavigate={handleLinkClick} />;
			case 'users':
				return <Users />;
			case 'patients':
				return <Patients />;
			case 'appointments':
				return <Appointments />;
			case 'billing':
				return <Billing />;
			case 'reports':
				return <Reports />;
			case 'seed':
				return <Seed />;
			default:
				return <Dashboard onNavigate={handleLinkClick} />;
		}
	};

	return (
		<div className="min-h-svh bg-slate-50">
			<Sidebar 
				title="Admin" 
				links={adminLinks} 
				onLinkClick={handleLinkClick}
				activeHref={`#${activePage}`}
			/>
			<main className="ml-64 min-h-svh overflow-y-auto bg-white">{renderPage()}</main>
		</div>
	);
}

