'use client';

import { type ReactNode } from 'react';

interface StatusCardProps {
	label: string;
	value: string | ReactNode;
	subtitle?: string | ReactNode;
}

interface PageHeaderProps {
	badge?: string;
	title: string;
	description?: string;
	statusCard?: StatusCardProps;
	actions?: ReactNode;
	className?: string;
}

export default function PageHeader({
	badge,
	title,
	description,
	statusCard,
	actions,
	className = '',
}: PageHeaderProps) {
	return (
		<header className={`flex flex-col gap-3 md:flex-row md:items-start md:justify-between ${className}`}>
			<div className="flex-1">
				{badge ? (
					<p className="text-sm font-semibold uppercase tracking-wide text-sky-600">{badge}</p>
				) : (
					<div className="h-5" aria-hidden="true" />
				)}
				<h1 className="mt-1 text-3xl font-semibold text-slate-900">{title}</h1>
				{description && (
					<p className="mt-2 text-sm text-slate-600 md:max-w-2xl">{description}</p>
				)}
			</div>
			{(statusCard || actions) && (
				<div className="flex flex-col items-end gap-2">
					{actions && <div className="flex items-center gap-2">{actions}</div>}
					{statusCard && (
						<div className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
							<p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
								{statusCard.label}
							</p>
							<p className="mt-1 text-sm font-medium text-slate-700">{statusCard.value}</p>
							{statusCard.subtitle && (
								<p className="text-xs text-slate-500">{statusCard.subtitle}</p>
							)}
						</div>
					)}
				</div>
			)}
		</header>
	);
}

