'use client';

import { useState } from 'react';
import Sidebar, { type SidebarLink } from '@/components/Sidebar';
import Dashboard from './components/Dashboard';
import Calendar from './components/Calendar';
import EditReport from './components/EditReport';
import Availability from './components/Availability';
import Transfer from './components/Transfer';

type ClinicalTeamPage = 'dashboard' | 'calendar' | 'edit-report' | 'availability' | 'transfer';

const clinicalTeamLinks: SidebarLink[] = [
	{ href: '#dashboard', label: 'Dashboard', icon: 'fas fa-dumbbell' },
	{ href: '#calendar', label: 'Calendar', icon: 'fas fa-calendar-week' },
	{ href: '#edit-report', label: 'View/Edit Reports', icon: 'fas fa-notes-medical' },
	{ href: '#availability', label: 'My Availability', icon: 'fas fa-calendar-check' },
	{ href: '#transfer', label: 'Transfer Patients', icon: 'fas fa-exchange-alt' },
];

export default function ClinicalTeamLayout({ children }: { children: React.ReactNode }) {
	const [activePage, setActivePage] = useState<ClinicalTeamPage>('dashboard');

	const handleLinkClick = (href: string) => {
		const page = href.replace('#', '') as ClinicalTeamPage;
		setActivePage(page);
	};

	const renderPage = () => {
		switch (activePage) {
			case 'dashboard':
				return <Dashboard />;
			case 'calendar':
				return <Calendar />;
			case 'edit-report':
				return <EditReport />;
			case 'availability':
				return <Availability />;
			case 'transfer':
				return <Transfer />;
			default:
				return <Dashboard />;
		}
	};

	return (
		<div className="min-h-svh bg-slate-50">
			<Sidebar
				title="Clinical Team"
				links={clinicalTeamLinks}
				onLinkClick={handleLinkClick}
				activeHref={`#${activePage}`}
			/>
			<main className="ml-64 min-h-svh overflow-y-auto bg-white">{renderPage()}</main>
		</div>
	);
}
