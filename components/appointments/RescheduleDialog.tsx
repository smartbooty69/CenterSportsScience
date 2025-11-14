'use client';

import { useState, useEffect } from 'react';
import { checkAppointmentConflict } from '@/lib/appointmentUtils';

interface RescheduleDialogProps {
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
	onConfirm: (newDate: string, newTime: string) => Promise<void>;
	allAppointments: Array<{
		id: string;
		appointmentId?: string;
		patient: string;
		doctor: string;
		date: string;
		time: string;
		status?: string;
	}>;
}

export default function RescheduleDialog({
	isOpen,
	appointment,
	onClose,
	onConfirm,
	allAppointments,
}: RescheduleDialogProps) {
	const [newDate, setNewDate] = useState('');
	const [newTime, setNewTime] = useState('');
	const [conflict, setConflict] = useState<{ hasConflict: boolean; conflictingAppointments: any[] } | null>(null);
	const [checkingConflict, setCheckingConflict] = useState(false);
	const [saving, setSaving] = useState(false);

	useEffect(() => {
		if (isOpen && appointment) {
			setNewDate(appointment.date);
			setNewTime(appointment.time);
			setConflict(null);
		}
	}, [isOpen, appointment]);

	useEffect(() => {
		if (!isOpen || !appointment || !newDate || !newTime) {
			setConflict(null);
			return;
		}

		// Debounce conflict check
		const timeoutId = setTimeout(async () => {
			if (newDate === appointment.date && newTime === appointment.time) {
				setConflict(null);
				return;
			}

			setCheckingConflict(true);
			try {
				const conflictResult = checkAppointmentConflict(
					allAppointments,
					{
						id: appointment.id,
						doctor: appointment.doctor,
						date: newDate,
						time: newTime,
					},
					30
				);
				setConflict(conflictResult);
			} catch (error) {
				console.error('Error checking conflict:', error);
			} finally {
				setCheckingConflict(false);
			}
		}, 500);

		return () => clearTimeout(timeoutId);
	}, [newDate, newTime, appointment, allAppointments, isOpen]);

	if (!isOpen || !appointment) return null;

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		if (conflict?.hasConflict) {
			alert('Cannot reschedule: There is a conflict with another appointment. Please choose a different time.');
			return;
		}

		setSaving(true);
		try {
			await onConfirm(newDate, newTime);
			onClose();
		} catch (error) {
			console.error('Failed to reschedule:', error);
			alert('Failed to reschedule appointment. Please try again.');
		} finally {
			setSaving(false);
		}
	};

	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
			<div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl">
				<div className="mb-4 flex items-center justify-between">
					<h2 className="text-xl font-semibold text-slate-900">Reschedule Appointment</h2>
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
						Current: {appointment.date} at {appointment.time}
					</p>
				</div>

				<form onSubmit={handleSubmit} className="space-y-4">
					<div>
						<label className="block text-sm font-medium text-slate-700 mb-1">New Date</label>
						<input
							type="date"
							value={newDate}
							onChange={e => setNewDate(e.target.value)}
							required
							min={new Date().toISOString().split('T')[0]}
							className="input-base"
						/>
					</div>

					<div>
						<label className="block text-sm font-medium text-slate-700 mb-1">New Time</label>
						<input
							type="time"
							value={newTime}
							onChange={e => setNewTime(e.target.value)}
							required
							className="input-base"
						/>
					</div>

					{checkingConflict && (
						<div className="text-sm text-slate-500">
							<i className="fas fa-spinner fa-spin mr-2" />
							Checking for conflicts...
						</div>
					)}

					{conflict?.hasConflict && (
						<div className="rounded-lg border border-rose-200 bg-rose-50 p-3">
							<p className="text-sm font-medium text-rose-700 mb-2">
								<i className="fas fa-exclamation-triangle mr-2" />
								Conflict detected!
							</p>
							<ul className="text-xs text-rose-600 space-y-1">
								{conflict.conflictingAppointments.map(apt => (
									<li key={apt.id}>
										{apt.patient} - {apt.date} at {apt.time}
									</li>
								))}
							</ul>
						</div>
					)}

					{conflict && !conflict.hasConflict && newDate !== appointment.date && (
						<div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
							<i className="fas fa-check-circle mr-2" />
							No conflicts detected
						</div>
					)}

					<div className="flex gap-3 justify-end">
						<button
							type="button"
							onClick={onClose}
							className="px-4 py-2 text-sm font-medium text-slate-700 hover:text-slate-900"
						>
							Cancel
						</button>
						<button
							type="submit"
							disabled={saving || conflict?.hasConflict || checkingConflict}
							className="btn-primary"
						>
							{saving ? 'Rescheduling...' : 'Reschedule'}
						</button>
					</div>
				</form>
			</div>
		</div>
	);
}

