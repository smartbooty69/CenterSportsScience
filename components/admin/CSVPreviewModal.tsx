'use client';

import { useMemo } from 'react';

interface CSVPreviewModalProps<Row> {
	title?: string;
	rows: Row[];
	errors: Array<{ index: number; error: string }>;
	onClose: () => void;
	onConfirm: () => void;
	maxPreview?: number;
}

export default function CSVPreviewModal<Row extends Record<string, unknown>>({
	title = 'CSV Preview',
	rows,
	errors,
	onClose,
	onConfirm,
	maxPreview = 50,
}: CSVPreviewModalProps<Row>) {
	const headers = useMemo(() => {
		const first = rows[0] || {};
		return Object.keys(first);
	}, [rows]);

	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 px-4 py-6">
			<div className="w-full max-w-5xl rounded-2xl border border-slate-200 bg-white shadow-2xl">
				<header className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
					<h2 className="text-lg font-semibold text-slate-900">{title}</h2>
					<button
						type="button"
						onClick={onClose}
						className="rounded-full p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 focus-visible:bg-slate-100 focus-visible:text-slate-600 focus-visible:outline-none"
						aria-label="Close dialog"
					>
						<i className="fas fa-times" aria-hidden="true" />
					</button>
				</header>
				<div className="max-h-[60vh] overflow-y-auto px-6 py-4">
					{rows.length === 0 ? (
						<p className="py-10 text-center text-sm text-slate-500">No rows parsed.</p>
					) : (
						<div className="overflow-x-auto">
							<table className="min-w-full divide-y divide-slate-200 text-left text-sm text-slate-700">
								<thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
									<tr>
										<th className="px-3 py-2 font-semibold">#</th>
										{headers.map(h => (
											<th key={h} className="px-3 py-2 font-semibold">
												{h}
											</th>
										))}
										<th className="px-3 py-2 font-semibold">Errors</th>
									</tr>
								</thead>
								<tbody className="divide-y divide-slate-100">
									{rows.slice(0, maxPreview).map((row, idx) => {
										const err = errors.find(e => e.index === idx);
										return (
											<tr key={idx}>
												<td className="px-3 py-2 text-xs text-slate-500">{idx + 1}</td>
												{headers.map(h => (
													<td key={h} className="px-3 py-2 text-sm text-slate-700">
														{String((row as any)[h] ?? '')}
													</td>
												))}
												<td className="px-3 py-2 text-xs">
													{err ? (
														<span className="inline-flex items-center rounded-full bg-rose-100 px-2 py-1 font-medium text-rose-700">
															{err.error}
														</span>
													) : (
														<span className="inline-flex items-center rounded-full bg-emerald-100 px-2 py-1 font-medium text-emerald-700">
															OK
														</span>
													)}
												</td>
											</tr>
										);
									})}
								</tbody>
							</table>
						</div>
					)}
				</div>
				<footer className="flex items-center justify-end gap-3 border-t border-slate-200 px-6 py-4">
					<button
						type="button"
						onClick={onClose}
						className="inline-flex items-center rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition hover:border-slate-300 hover:text-slate-800 focus-visible:border-slate-300 focus-visible:text-slate-800 focus-visible:outline-none"
					>
						Cancel
					</button>
					<button
						type="button"
						onClick={onConfirm}
						className="inline-flex items-center rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sky-500 focus-visible:bg-sky-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600"
					>
						Import
					</button>
				</footer>
			</div>
		</div>
	);
}


