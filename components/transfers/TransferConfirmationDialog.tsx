'use client';

interface TransferConfirmationDialogProps {
	isOpen: boolean;
	patientName: string;
	patientId: string;
	currentTherapist?: string;
	newTherapist: string;
	onConfirm: () => void;
	onCancel: () => void;
	transferring?: boolean;
}

export default function TransferConfirmationDialog({
	isOpen,
	patientName,
	patientId,
	currentTherapist,
	newTherapist,
	onConfirm,
	onCancel,
	transferring = false,
}: TransferConfirmationDialogProps) {
	if (!isOpen) return null;

	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
			<div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl">
				<div className="mb-4 flex items-start gap-4">
					<div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-amber-100">
						<i className="fas fa-exclamation-triangle text-xl text-amber-600" aria-hidden="true" />
					</div>
					<div className="flex-1">
						<h3 className="text-lg font-semibold text-slate-900">Confirm Patient Transfer</h3>
						<p className="mt-1 text-sm text-slate-600">
							Are you sure you want to transfer this patient to a different therapist?
						</p>
					</div>
				</div>

				<div className="mb-6 rounded-lg border border-slate-200 bg-slate-50 p-4">
					<div className="space-y-2 text-sm">
						<div>
							<span className="font-medium text-slate-700">Patient:</span>{' '}
							<span className="text-slate-900">{patientName}</span>
						</div>
						<div>
							<span className="font-medium text-slate-700">Patient ID:</span>{' '}
							<code className="rounded bg-white px-1.5 py-0.5 text-xs text-slate-700">{patientId}</code>
						</div>
						{currentTherapist && (
							<div>
								<span className="font-medium text-slate-700">Current Therapist:</span>{' '}
								<span className="text-slate-900">{currentTherapist}</span>
							</div>
						)}
						{!currentTherapist && (
							<div>
								<span className="font-medium text-slate-700">Current Status:</span>{' '}
								<span className="text-amber-600">Unassigned</span>
							</div>
						)}
						<div>
							<span className="font-medium text-slate-700">New Therapist:</span>{' '}
							<span className="font-semibold text-sky-600">{newTherapist}</span>
						</div>
					</div>
				</div>

				<div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
					<i className="fas fa-info-circle mr-2" aria-hidden="true" />
					Both therapists will be notified of this transfer.
				</div>

				<div className="mt-6 flex items-center justify-end gap-3">
					<button
						type="button"
						onClick={onCancel}
						disabled={transferring}
						className="btn-secondary"
					>
						Cancel
					</button>
					<button
						type="button"
						onClick={onConfirm}
						disabled={transferring}
						className="btn-primary"
					>
						{transferring ? (
							<>
								<div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
								Transferring...
							</>
						) : (
							<>
								<i className="fas fa-check text-xs" aria-hidden="true" />
								Confirm Transfer
							</>
						)}
					</button>
				</div>
			</div>
		</div>
	);
}

