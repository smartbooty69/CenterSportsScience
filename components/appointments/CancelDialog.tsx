'use client';

import { useState } from 'react';

interface CancelDialogProps {
	isOpen: boolean;
	appointment: {
		id: string;
		appointmentId?: string;
		patient: string;
		doctor: string;
		date: string;
		time: string;
	} | null;
	onClose: () => void;
	onConfirm: (reason: string) => Promise<void>;
}

export default function CancelDialog({ isOpen, appointment, onClose, onConfirm }: CancelDialogProps) {
	const [reason, setReason] = useState('');
	const [saving, setSaving] = useState(false);

	if (!isOpen || !appointment) return null;

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		setSaving(true);
		try {
			await onConfirm(reason);
			setReason('');
			onClose();
		} catch (error) {
			console.error('Failed to cancel appointment:', error);
			alert('Failed to cancel appointment. Please try again.');
		} finally {
			setSaving(false);
		}
	};

	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
			<div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl">
				<div className="mb-4 flex items-center justify-between">
					<h2 className="text-xl font-semibold text-slate-900">Cancel Appointment</h2>
					<button
						type="button"
						onClick={onClose}
						className="text-slate-400 hover:text-slate-600"
						aria-label="Close"
					>
						<i className="fas fa-times" />
					</button>
				</div>

				<div className="mb-4 rounded-lg border border-slate-200 bg-slate-50 p-3">
					<p className="text-sm font-medium text-slate-700">Patient: {appointment.patient}</p>
					<p className="text-sm text-slate-600">Doctor: {appointment.doctor}</p>
					<p className="text-sm text-slate-600">
						Date: {appointment.date} at {appointment.time}
					</p>
				</div>

				<form onSubmit={handleSubmit} className="space-y-4">
					<div>
						<label className="block text-sm font-medium text-slate-700 mb-1">
							Cancellation Reason <span className="text-slate-400">(optional)</span>
						</label>
						<textarea
							value={reason}
							onChange={e => setReason(e.target.value)}
							placeholder="Enter reason for cancellation..."
							rows={3}
							className="input-base"
						/>
					</div>

					<div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700">
						<i className="fas fa-exclamation-triangle mr-2" />
						This action will cancel the appointment and notify the patient. This cannot be undone.
					</div>

					<div className="flex gap-3 justify-end">
						<button
							type="button"
							onClick={onClose}
							className="px-4 py-2 text-sm font-medium text-slate-700 hover:text-slate-900"
						>
							Keep Appointment
						</button>
						<button
							type="submit"
							disabled={saving}
							className="px-4 py-2 text-sm font-medium text-white bg-rose-600 rounded-lg hover:bg-rose-700 disabled:opacity-50"
						>
							{saving ? 'Cancelling...' : 'Cancel Appointment'}
						</button>
					</div>
				</form>
			</div>
		</div>
	);
}

