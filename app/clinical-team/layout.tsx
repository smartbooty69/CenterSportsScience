'use client';

import { useState, useEffect, useRef } from 'react';
import { usePathname, useRouter } from 'next/navigation';
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
	const pathname = usePathname();
	const router = useRouter();
	const [activePage, setActivePage] = useState<ClinicalTeamPage>('dashboard');
	const isNavigatingRef = useRef(false);

	// Detect route from pathname
	useEffect(() => {
		// Don't override if we're intentionally navigating
		if (isNavigatingRef.current) {
			isNavigatingRef.current = false;
			return;
		}

		if (pathname?.includes('/edit-report')) {
			setActivePage('edit-report');
		} else if (pathname?.includes('/calendar')) {
			setActivePage('calendar');
		} else if (pathname?.includes('/availability')) {
			setActivePage('availability');
		} else if (pathname?.includes('/transfer')) {
			setActivePage('transfer');
		}
		// Don't set to dashboard when on base route - let hash navigation handle it
	}, [pathname]);

	const handleLinkClick = (href: string) => {
		const page = href.replace('#', '') as ClinicalTeamPage;
		
		// If we're on a direct route, navigate back to base route first
		if (pathname !== '/clinical-team') {
			isNavigatingRef.current = true;
			setActivePage(page);
			router.push('/clinical-team');
		} else {
			setActivePage(page);
		}
	};

	const renderPage = () => {
		// If we're on a direct route (children exists and is not null), render children
		// Otherwise use hash-based navigation
		if (children && pathname !== '/clinical-team') {
			return children;
		}

		switch (activePage) {
			case 'dashboard':
				return <Dashboard onNavigate={handleLinkClick} />;
			case 'calendar':
				return <Calendar />;
			case 'edit-report':
				return <EditReport />;
			case 'availability':
				return <Availability />;
			case 'transfer':
				return <Transfer />;
			default:
				return <Dashboard onNavigate={handleLinkClick} />;
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
