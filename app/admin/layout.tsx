'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Sidebar, { type SidebarLink } from '@/components/Sidebar';
import Dashboard from '@/components/admin/Dashboard';
import Users from '@/components/admin/Users';
import Patients from '@/components/admin/Patients';
import Appointments from '@/components/admin/Appointments';
import Billing from '@/components/admin/Billing';
import Reports from '@/components/admin/Reports';
import Seed from '@/components/admin/Seed';
import { useAuth } from '@/contexts/AuthContext';

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
	const { user, loading } = useAuth();
	const router = useRouter();
	const [activePage, setActivePage] = useState<AdminPage>('dashboard');

	// Role-based access control
	useEffect(() => {
		if (loading) return; // Wait for auth to load

		if (!user) {
			// Not authenticated - redirect to login
			router.push('/login');
			return;
		}

		const userRole = user.role?.trim() ?? '';
		
		// Check if user has Admin role
		if (userRole !== 'Admin') {
			// Redirect to their appropriate dashboard based on role
			if (userRole === 'FrontDesk') {
				router.push('/frontdesk');
			} else if (userRole === 'ClinicalTeam' || userRole === 'Physiotherapist' || userRole === 'StrengthAndConditioning') {
				router.push('/clinical-team');
			} else {
				// Unknown role - redirect to login
				router.push('/login');
			}
		}
	}, [user, loading, router]);

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
	if (!user || user.role?.trim() !== 'Admin') {
		return null;
	}

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

