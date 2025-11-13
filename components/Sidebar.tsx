'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { signOut } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { useCallback } from 'react';

export type SidebarLink = { href: string; label: string; icon: string };

interface SidebarProps {
	title: string;
	links: SidebarLink[];
	onLinkClick?: (href: string) => void;
	activeHref?: string;
}

export default function Sidebar({ title, links, onLinkClick, activeHref }: SidebarProps) {
	const pathname = usePathname();
	const router = useRouter();

	const handleLogout = useCallback(async () => {
		try {
			// Prefer Firebase signOut when available
			if (auth) {
				await signOut(auth);
			}
		} catch {
			// ignore Firebase errors; still proceed to local cleanup
		} finally {
			try {
				localStorage.removeItem('currentUser');
			} catch {
				// ignore storage errors
			}
			router.replace('/login');
		}
	}, [router]);

	return (
		<nav
			className="fixed left-0 top-0 z-40 flex h-svh w-64 flex-col bg-blue-700 text-white shadow-lg"
			aria-label="Sidebar Navigation"
			suppressHydrationWarning
		>
			<div className="px-5 py-4 border-b border-white/10">
				<h4 className="flex items-center text-lg font-semibold">
					<i className="fas fa-house-medical mr-2" aria-hidden="true" />
					{title}
				</h4>
			</div>

			<ul className="flex-1 space-y-1 px-2 py-3 overflow-y-auto" role="menu">
				{links.map(link => {
					const isActive = activeHref
						? activeHref === link.href
						: pathname === link.href ||
						  (pathname?.startsWith(link.href) && link.href !== '/');
					
					if (onLinkClick) {
						return (
							<li key={link.href} role="none">
								<button
									type="button"
									onClick={() => onLinkClick(link.href)}
									role="menuitem"
									className={[
										'flex w-full items-center rounded-md px-3 py-2 text-sm transition text-left',
										isActive
											? 'bg-blue-600 text-white'
											: 'text-blue-50 hover:bg-blue-600/70 hover:text-white',
									].join(' ')}
									aria-current={isActive ? 'page' : undefined}
								>
									<i className={`${link.icon} mr-2 text-sm`} aria-hidden="true" />
									<span>{link.label}</span>
								</button>
							</li>
						);
					}
					
					return (
						<li key={link.href} role="none">
							<Link
								href={link.href}
								role="menuitem"
								className={[
									'flex items-center rounded-md px-3 py-2 text-sm transition',
									isActive
										? 'bg-blue-600 text-white'
										: 'text-blue-50 hover:bg-blue-600/70 hover:text-white',
								].join(' ')}
								aria-current={isActive ? 'page' : undefined}
							>
								<i className={`${link.icon} mr-2 text-sm`} aria-hidden="true" />
								<span>{link.label}</span>
							</Link>
						</li>
					);
				})}
			</ul>

			<div className="mt-auto border-t border-white/10 px-2 py-3">
				<button
					type="button"
					onClick={handleLogout}
					className="flex w-full items-center justify-center rounded-md bg-white/10 px-3 py-2 text-sm font-medium text-red-100 hover:bg-white/15"
				>
					<i className="fas fa-sign-out-alt mr-2" aria-hidden="true" />
					Logout
				</button>
			</div>
		</nav>
	);
}

