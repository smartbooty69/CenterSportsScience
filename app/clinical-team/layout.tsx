'use client';

import { useState, useEffect, useRef } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Sidebar, { type SidebarLink } from '@/components/Sidebar';
import Dashboard from '@/components/clinical-team/Dashboard';
import Calendar from '@/components/clinical-team/Calendar';
import EditReport from '@/components/clinical-team/EditReport';
import Availability from '@/components/clinical-team/Availability';
import Transfer from '@/components/clinical-team/Transfer';
import ROM from '@/components/clinical-team/ROM';
import { useAuth } from '@/contexts/AuthContext';

type ClinicalTeamPage = 'dashboard' | 'calendar' | 'edit-report' | 'availability' | 'transfer' | 'rom';

const clinicalTeamLinks: SidebarLink[] = [
	{ href: '#dashboard', label: 'Dashboard', icon: 'fas fa-dumbbell' },
	{ href: '#calendar', label: 'Calendar', icon: 'fas fa-calendar-week' },
	{ href: '#edit-report', label: 'View/Edit Reports', icon: 'fas fa-notes-medical' },
	{ href: '#rom', label: 'ROM Assessment', icon: 'fas fa-clipboard-check' },
	{ href: '#availability', label: 'My Availability', icon: 'fas fa-calendar-check' },
	{ href: '#transfer', label: 'Transfer Patients', icon: 'fas fa-exchange-alt' },
];

export default function ClinicalTeamLayout({ children }: { children: React.ReactNode }) {
	const { user, loading } = useAuth();
	const pathname = usePathname();
	const router = useRouter();
	const [activePage, setActivePage] = useState<ClinicalTeamPage>('dashboard');
	const isNavigatingRef = useRef(false);

	// Role-based access control
	useEffect(() => {
		if (loading) return; // Wait for auth to load

		if (!user) {
			// Not authenticated - redirect to login
			router.push('/login');
			return;
		}

		const userRole = user.role?.trim() ?? '';
		const allowedRoles = ['ClinicalTeam', 'Physiotherapist', 'StrengthAndConditioning'];
		
		// Check if user has a clinical team role
		if (!allowedRoles.includes(userRole)) {
			// Redirect to their appropriate dashboard based on role
			if (userRole === 'Admin') {
				router.push('/admin');
			} else if (userRole === 'FrontDesk') {
				router.push('/frontdesk');
			} else {
				// Unknown role - redirect to login
				router.push('/login');
			}
		}
	}, [user, loading, router]);

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
		} else if (pathname?.includes('/rom')) {
			setActivePage('rom');
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
			case 'rom':
				return <ROM />;
			case 'availability':
				return <Availability />;
			case 'transfer':
				return <Transfer />;
			default:
				return <Dashboard onNavigate={handleLinkClick} />;
		}
	};

	// Show loading state while checking authentication
	if (loading) {
		return (
			<div className="flex min-h-svh items-center justify-center bg-slate-50">
				<div className="text-center">
					<div className="mb-4 inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-sky-600 border-r-transparent"></div>
					<p className="text-sm text-slate-600">Loading...</p>
				</div>
			</div>
		);
	}

	// Don't render if user doesn't have access (will redirect)
	const userRole = user?.role?.trim() ?? '';
	const allowedRoles = ['ClinicalTeam', 'Physiotherapist', 'StrengthAndConditioning'];
	if (!user || !allowedRoles.includes(userRole)) {
		return null;
	}

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
