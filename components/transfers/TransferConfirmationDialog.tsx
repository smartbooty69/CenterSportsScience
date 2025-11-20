'use client';

interface AppointmentConflict {
	appointmentId: string;
	date: string;
	time: string;
	conflictReason: 'no_availability' | 'slot_unavailable' | 'already_booked';
}

interface AvailabilityCheck {
	appointments: Array<{ id: string; date: string; time: string; status: string; duration?: number }>;
	conflicts: AppointmentConflict[];
	hasConflicts: boolean;
}

interface TransferConfirmationDialogProps {
	isOpen: boolean;
	patientName: string;
	patientId: string;
	currentTherapist?: string;
	newTherapist: string;
	onConfirm: () => void;
	onCancel: () => void;
	transferring?: boolean;
	availabilityCheck?: AvailabilityCheck;
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
	availabilityCheck,
}: TransferConfirmationDialogProps) {
	if (!isOpen) return null;

	const formatDate = (dateString: string): string => {
		if (!dateString) return '—';
		const date = new Date(dateString + 'T00:00:00');
		if (Number.isNaN(date.getTime())) return dateString;
		return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(date);
	};

	const getConflictReasonText = (reason: AppointmentConflict['conflictReason']): string => {
		switch (reason) {
			case 'no_availability':
				return 'Therapist not available on this date';
			case 'slot_unavailable':
				return 'Time slot not available';
			case 'already_booked':
				return 'Therapist already has an appointment at this time';
			default:
				return 'Conflict detected';
		}
	};

	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
			<div className="w-full max-w-2xl max-h-[90vh] rounded-2xl border border-slate-200 bg-white shadow-xl overflow-hidden flex flex-col">
				<div className="p-6 overflow-y-auto flex-1">
					<div className="mb-4 flex items-start gap-4">
						<div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-amber-100">
							<i className="fas fa-exclamation-triangle text-xl text-amber-600" aria-hidden="true" />
						</div>
						<div className="flex-1">
							<h3 className="text-lg font-semibold text-slate-900">Confirm Patient Transfer Request</h3>
							<p className="mt-1 text-sm text-slate-600">
								Please review the transfer details and availability information. The receiving therapist will be notified and must accept the request before the transfer is completed.
							</p>
						</div>
					</div>

					<div className="mb-4 rounded-lg border border-slate-200 bg-slate-50 p-4">
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

					{availabilityCheck && availabilityCheck.appointments.length > 0 && (
						<div className="mb-4">
							<div className="mb-2 text-sm font-medium text-slate-700">
								Patient's Upcoming Appointments ({availabilityCheck.appointments.length}):
							</div>
							<div className="rounded-lg border border-slate-200 bg-slate-50 p-3 max-h-40 overflow-y-auto">
								<div className="space-y-2 text-sm">
									{availabilityCheck.appointments.map((apt, idx) => (
										<div key={apt.id || idx} className="flex items-center justify-between">
											<span className="text-slate-700">
												{formatDate(apt.date)} at {apt.time}
											</span>
											<span className="text-xs px-2 py-0.5 rounded bg-slate-200 text-slate-700">
												{apt.status}
											</span>
										</div>
									))}
								</div>
							</div>
						</div>
					)}

					{availabilityCheck && availabilityCheck.hasConflicts && (
						<div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-4">
							<div className="mb-2 flex items-center gap-2">
								<i className="fas fa-exclamation-triangle text-red-600" aria-hidden="true" />
								<strong className="text-sm font-semibold text-red-800">
									Availability Conflicts Detected ({availabilityCheck.conflicts.length})
								</strong>
							</div>
							<p className="mb-3 text-xs text-red-700">
								The following appointment conflicts have been detected. The receiving therapist will need to handle these when accepting the transfer.
							</p>
							<div className="space-y-2 max-h-40 overflow-y-auto">
								{availabilityCheck.conflicts.map((conflict, idx) => (
									<div key={idx} className="rounded border border-red-200 bg-white p-2 text-xs">
										<div className="font-medium text-red-900">
											{formatDate(conflict.date)} at {conflict.time}
										</div>
										<div className="text-red-700 mt-1">
											{getConflictReasonText(conflict.conflictReason)}
										</div>
									</div>
								))}
							</div>
						</div>
					)}

					{availabilityCheck && !availabilityCheck.hasConflicts && availabilityCheck.appointments.length > 0 && (
						<div className="mb-4 rounded-lg border border-green-200 bg-green-50 p-3">
							<div className="flex items-center gap-2 text-sm text-green-800">
								<i className="fas fa-check-circle" aria-hidden="true" />
								<strong>All appointments are compatible with the therapist's schedule.</strong>
							</div>
						</div>
					)}

					{availabilityCheck && availabilityCheck.appointments.length === 0 && (
						<div className="mb-4 rounded-lg border border-blue-200 bg-blue-50 p-3">
							<div className="flex items-center gap-2 text-sm text-blue-800">
								<i className="fas fa-info-circle" aria-hidden="true" />
								<strong>No upcoming appointments found for this patient.</strong>
							</div>
						</div>
					)}

					<div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
						<i className="fas fa-info-circle mr-2" aria-hidden="true" />
						<strong>Note:</strong> The receiving therapist ({newTherapist}) will be notified and must accept the request before the transfer is completed. If there are conflicts, they will need to resolve them when accepting.
					</div>
				</div>

				<div className="flex items-center justify-end gap-3 border-t border-slate-200 p-6 bg-slate-50">
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
								Sending Request...
							</>
						) : (
							<>
								<i className="fas fa-paper-plane text-xs" aria-hidden="true" />
								Confirm & Send Request
							</>
						)}
					</button>
				</div>
			</div>
		</div>
	);
}

