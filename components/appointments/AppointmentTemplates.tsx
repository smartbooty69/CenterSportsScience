'use client';

import { useState, useEffect } from 'react';

interface AppointmentTemplate {
	id?: string;
	name: string;
	doctor: string;
	time: string;
	duration: number;
	notes?: string;
	createdBy: string;
	createdAt: string;
}

interface AppointmentTemplatesProps {
	doctor?: string;
	onSelectTemplate: (template: AppointmentTemplate) => void;
}

export default function AppointmentTemplates({ doctor, onSelectTemplate }: AppointmentTemplatesProps) {
	const [templates, setTemplates] = useState<AppointmentTemplate[]>([]);
	const [loading, setLoading] = useState(true);
	const [showCreate, setShowCreate] = useState(false);
	const [formData, setFormData] = useState({
		name: '',
		doctor: doctor || '',
		time: '',
		duration: 30,
		notes: '',
	});
	const [saving, setSaving] = useState(false);

	useEffect(() => {
		fetchTemplates();
	}, [doctor]);

	const fetchTemplates = async () => {
		setLoading(true);
		try {
			const url = doctor
				? `/api/appointments/templates?doctor=${encodeURIComponent(doctor)}`
				: '/api/appointments/templates';
			const response = await fetch(url);
			const result = await response.json();
			if (result.success) {
				setTemplates(result.data);
			}
		} catch (error) {
			console.error('Failed to fetch templates:', error);
		} finally {
			setLoading(false);
		}
	};

	const handleCreateTemplate = async (e: React.FormEvent) => {
		e.preventDefault();
		setSaving(true);
		try {
			const response = await fetch('/api/appointments/templates', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(formData),
			});
			const result = await response.json();
			if (result.success) {
				setTemplates([...templates, result.data]);
				setFormData({ name: '', doctor: doctor || '', time: '', duration: 30, notes: '' });
				setShowCreate(false);
			} else {
				alert(result.message || 'Failed to create template');
			}
		} catch (error) {
			console.error('Failed to create template:', error);
			alert('Failed to create template');
		} finally {
			setSaving(false);
		}
	};

	const handleDeleteTemplate = async (id: string) => {
		if (!window.confirm('Delete this template?')) return;
		try {
			const response = await fetch(`/api/appointments/templates?id=${id}`, {
				method: 'DELETE',
			});
			const result = await response.json();
			if (result.success) {
				setTemplates(templates.filter(t => t.id !== id));
			} else {
				alert(result.message || 'Failed to delete template');
			}
		} catch (error) {
			console.error('Failed to delete template:', error);
			alert('Failed to delete template');
		}
	};

	if (loading) {
		return (
			<div className="text-sm text-slate-500">
				<i className="fas fa-spinner fa-spin mr-2" />
				Loading templates...
			</div>
		);
	}

	return (
		<div className="space-y-4">
			<div className="flex items-center justify-between">
				<h3 className="text-sm font-semibold text-slate-700">Appointment Templates</h3>
				<button
					type="button"
					onClick={() => setShowCreate(!showCreate)}
					className="text-xs font-medium text-sky-600 hover:text-sky-700"
				>
					<i className="fas fa-plus mr-1" />
					{showCreate ? 'Cancel' : 'New Template'}
				</button>
			</div>

			{showCreate && (
				<form onSubmit={handleCreateTemplate} className="rounded-lg border border-slate-200 bg-slate-50 p-4 space-y-3">
					<div>
						<label className="block text-xs font-medium text-slate-700 mb-1">Template Name</label>
						<input
							type="text"
							value={formData.name}
							onChange={e => setFormData({ ...formData, name: e.target.value })}
							required
							placeholder="e.g., Initial Consultation"
							className="input-base text-sm"
						/>
					</div>
					<div className="grid grid-cols-2 gap-3">
						<div>
							<label className="block text-xs font-medium text-slate-700 mb-1">Time</label>
							<input
								type="time"
								value={formData.time}
								onChange={e => setFormData({ ...formData, time: e.target.value })}
								required
								className="input-base text-sm"
							/>
						</div>
						<div>
							<label className="block text-xs font-medium text-slate-700 mb-1">Duration (min)</label>
							<input
								type="number"
								value={formData.duration}
								onChange={e => setFormData({ ...formData, duration: parseInt(e.target.value) || 30 })}
								min={15}
								step={15}
								className="input-base text-sm"
							/>
						</div>
					</div>
					<div>
						<label className="block text-xs font-medium text-slate-700 mb-1">Notes</label>
						<textarea
							value={formData.notes}
							onChange={e => setFormData({ ...formData, notes: e.target.value })}
							rows={2}
							className="input-base text-sm"
						/>
					</div>
					<button type="submit" disabled={saving} className="btn-primary text-sm w-full">
						{saving ? 'Saving...' : 'Save Template'}
					</button>
				</form>
			)}

			{templates.length === 0 ? (
				<p className="text-sm text-slate-400 italic">No templates saved</p>
			) : (
				<div className="space-y-2">
					{templates.map(template => (
						<div
							key={template.id}
							className="flex items-center justify-between rounded-lg border border-slate-200 bg-white p-3 hover:border-sky-300"
						>
							<div className="flex-1">
								<p className="text-sm font-medium text-slate-900">{template.name}</p>
								<p className="text-xs text-slate-500">
									{template.time} • {template.duration} min • {template.doctor}
								</p>
							</div>
							<div className="flex gap-2">
								<button
									type="button"
									onClick={() => onSelectTemplate(template)}
									className="text-xs font-medium text-sky-600 hover:text-sky-700"
								>
									Use
								</button>
								<button
									type="button"
									onClick={() => template.id && handleDeleteTemplate(template.id)}
									className="text-xs font-medium text-rose-600 hover:text-rose-700"
								>
									<i className="fas fa-trash" />
								</button>
							</div>
						</div>
					))}
				</div>
			)}
		</div>
	);
}

