'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Sidebar, { type SidebarLink } from '@/components/Sidebar';
import Dashboard from '@/components/frontdesk/Dashboard';
import Patients from '@/components/frontdesk/Patients';
import Billing from '@/components/frontdesk/Billing';
import Reports from '@/components/frontdesk/Reports';
import Calendar from '@/components/frontdesk/Calendar';
import { useAuth } from '@/contexts/AuthContext';

type FrontdeskPage = 'dashboard' | 'patients' | 'billing' | 'reports' | 'calendar';

const frontdeskLinks: SidebarLink[] = [
	{ href: '#dashboard', label: 'Dashboard', icon: 'fas fa-home' },
	{ href: '#patients', label: 'Patient Management', icon: 'fas fa-users' },
	{ href: '#calendar', label: 'Calendar', icon: 'fas fa-calendar-alt' },
	{ href: '#billing', label: 'Billing', icon: 'fas fa-file-invoice-dollar' },
	{ href: '#reports', label: 'Reports', icon: 'fas fa-chart-line' },
];

export default function FrontdeskLayout({ children }: { children: React.ReactNode }) {
	const { user, loading } = useAuth();
	const router = useRouter();
	const [activePage, setActivePage] = useState<FrontdeskPage>('dashboard');

	// Role-based access control
	useEffect(() => {
		if (loading) return; // Wait for auth to load

		if (!user) {
			// Not authenticated - redirect to login
			router.push('/login');
			return;
		}

		const userRole = user.role?.trim() ?? '';
		
		// Check if user has FrontDesk role
		if (userRole !== 'FrontDesk') {
			// Redirect to their appropriate dashboard based on role
			if (userRole === 'Admin') {
				router.push('/admin');
			} else if (userRole === 'ClinicalTeam' || userRole === 'Physiotherapist' || userRole === 'StrengthAndConditioning') {
				router.push('/clinical-team');
			} else {
				// Unknown role - redirect to login
				router.push('/login');
			}
		}
	}, [user, loading, router]);

	const handleLinkClick = (href: string) => {
		const page = href.replace('#', '') as FrontdeskPage;
		setActivePage(page);
	};

	// Listen for hash changes and navigation events
	useEffect(() => {
		const handleHashChange = () => {
			const hash = window.location.hash.replace('#', '');
			if (hash && ['dashboard', 'patients', 'calendar', 'billing', 'reports'].includes(hash)) {
				setActivePage(hash as FrontdeskPage);
			}
		};

		// Check initial hash
		handleHashChange();

		// Listen for hash changes
		window.addEventListener('hashchange', handleHashChange);
		
		// Listen for custom navigation events
		const handleCustomNav = (event: CustomEvent) => {
			const page = event.detail?.page;
			if (page && ['dashboard', 'patients', 'calendar', 'billing', 'reports'].includes(page)) {
				setActivePage(page as FrontdeskPage);
			}
		};
		
		window.addEventListener('navigateToPage', handleCustomNav as EventListener);

		return () => {
			window.removeEventListener('hashchange', handleHashChange);
			window.removeEventListener('navigateToPage', handleCustomNav as EventListener);
		};
	}, []);

	const renderPage = () => {
		switch (activePage) {
			case 'dashboard':
				return <Dashboard onNavigate={handleLinkClick} />;
			case 'patients':
				return <Patients />;
			case 'calendar':
				return <Calendar />;
			case 'billing':
				return <Billing />;
			case 'reports':
				return <Reports />;
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
	if (!user || user.role?.trim() !== 'FrontDesk') {
		return null;
	}

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
