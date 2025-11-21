'use client';

import { useAuth } from '@/contexts/AuthContext';
import PageHeader from '@/components/PageHeader';
import NotificationCenter from '@/components/notifications/NotificationCenter';

export default function Notifications() {
	const { user } = useAuth();

	return (
		<div className="min-h-screen bg-slate-50 p-6">
			<PageHeader
				title="Notifications"
				description="View and manage your notifications and reminders"
			/>
			<div className="mt-6">
				<NotificationCenter userId={user?.id || null} />
			</div>
		</div>
	);
}

