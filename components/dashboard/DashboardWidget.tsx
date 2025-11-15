'use client';

import { useState, ReactNode } from 'react';

interface DashboardWidgetProps {
	title: string;
	icon?: string;
	children: ReactNode;
	className?: string;
	onRemove?: () => void;
	collapsible?: boolean;
}

export default function DashboardWidget({
	title,
	icon,
	children,
	className = '',
	onRemove,
	collapsible = false,
}: DashboardWidgetProps) {
	const [collapsed, setCollapsed] = useState(false);

	return (
		<div className={`rounded-xl border border-slate-200 bg-white p-6 shadow-sm ${className}`}>
			<div className="mb-4 flex items-center justify-between">
				<div className="flex items-center gap-2">
					{icon && <i className={`${icon} text-sky-600`} />}
					<h3 className="text-lg font-semibold text-slate-900">{title}</h3>
				</div>
				<div className="flex items-center gap-2">
					{collapsible && (
						<button
							type="button"
							onClick={() => setCollapsed(!collapsed)}
							className="text-slate-400 hover:text-slate-600"
							aria-label={collapsed ? 'Expand' : 'Collapse'}
						>
							<i className={`fas fa-chevron-${collapsed ? 'down' : 'up'}`} />
						</button>
					)}
					{onRemove && (
						<button
							type="button"
							onClick={onRemove}
							className="text-slate-400 hover:text-rose-600"
							aria-label="Remove widget"
						>
							<i className="fas fa-times" />
						</button>
					)}
				</div>
			</div>
			{!collapsed && <div>{children}</div>}
		</div>
	);
}

