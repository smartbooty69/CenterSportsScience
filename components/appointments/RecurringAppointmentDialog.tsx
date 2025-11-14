'use client';

import { useState } from 'react';

interface RecurringAppointmentDialogProps {
	isOpen: boolean;
	patientId: string;
	patient: string;
	doctor: string;
	onClose: () => void;
	onConfirm: (data: {
		startDate: string;
		time: string;
		frequency: 'daily' | 'weekly' | 'biweekly' | 'monthly';
		count: number;
		notes?: string;
	}) => Promise<void>;
}

export default function RecurringAppointmentDialog({
	isOpen,
	patientId,
	patient,
	doctor,
	onClose,
	onConfirm,
}: RecurringAppointmentDialogProps) {
	const [formData, setFormData] = useState({
		startDate: '',
		time: '',
		frequency: 'weekly' as 'daily' | 'weekly' | 'biweekly' | 'monthly',
		count: 4,
		notes: '',
	});
	const [saving, setSaving] = useState(false);

	if (!isOpen) return null;

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		setSaving(true);
		try {
			await onConfirm(formData);
			setFormData({
				startDate: '',
				time: '',
				frequency: 'weekly',
				count: 4,
				notes: '',
			});
			onClose();
		} catch (error) {
			console.error('Failed to create recurring appointments:', error);
			alert('Failed to create recurring appointments. Please try again.');
		} finally {
			setSaving(false);
		}
	};

	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
			<div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl">
				<div className="mb-4 flex items-center justify-between">
					<h2 className="text-xl font-semibold text-slate-900">Create Recurring Appointments</h2>
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
					<p className="text-sm font-medium text-slate-700">Patient: {patient}</p>
					<p className="text-sm text-slate-600">Doctor: {doctor}</p>
				</div>

				<form onSubmit={handleSubmit} className="space-y-4">
					<div>
						<label className="block text-sm font-medium text-slate-700 mb-1">Start Date</label>
						<input
							type="date"
							value={formData.startDate}
							onChange={e => setFormData({ ...formData, startDate: e.target.value })}
							required
							min={new Date().toISOString().split('T')[0]}
							className="input-base"
						/>
					</div>

					<div>
						<label className="block text-sm font-medium text-slate-700 mb-1">Time</label>
						<input
							type="time"
							value={formData.time}
							onChange={e => setFormData({ ...formData, time: e.target.value })}
							required
							className="input-base"
						/>
					</div>

					<div>
						<label className="block text-sm font-medium text-slate-700 mb-1">Frequency</label>
						<select
							value={formData.frequency}
							onChange={e =>
								setFormData({
									...formData,
									frequency: e.target.value as 'daily' | 'weekly' | 'biweekly' | 'monthly',
								})
							}
							required
							className="input-base"
						>
							<option value="daily">Daily</option>
							<option value="weekly">Weekly</option>
							<option value="biweekly">Bi-weekly</option>
							<option value="monthly">Monthly</option>
						</select>
					</div>

					<div>
						<label className="block text-sm font-medium text-slate-700 mb-1">Number of Appointments</label>
						<input
							type="number"
							value={formData.count}
							onChange={e => setFormData({ ...formData, count: parseInt(e.target.value) || 1 })}
							required
							min={1}
							max={52}
							className="input-base"
						/>
					</div>

					<div>
						<label className="block text-sm font-medium text-slate-700 mb-1">Notes (optional)</label>
						<textarea
							value={formData.notes}
							onChange={e => setFormData({ ...formData, notes: e.target.value })}
							rows={3}
							className="input-base"
						/>
					</div>

					<div className="rounded-lg border border-sky-200 bg-sky-50 p-3 text-sm text-sky-700">
						<i className="fas fa-info-circle mr-2" />
						This will create {formData.count} appointment{formData.count !== 1 ? 's' : ''} starting from{' '}
						{formData.startDate || 'selected date'}.
					</div>

					<div className="flex gap-3 justify-end">
						<button
							type="button"
							onClick={onClose}
							className="px-4 py-2 text-sm font-medium text-slate-700 hover:text-slate-900"
						>
							Cancel
						</button>
						<button type="submit" disabled={saving} className="btn-primary">
							{saving ? 'Creating...' : `Create ${formData.count} Appointments`}
						</button>
					</div>
				</form>
			</div>
		</div>
	);
}

