'use client';

import { useEffect, useState } from 'react';
import { collection, doc, getDoc, getDocs, query, setDoc, where, onSnapshot, serverTimestamp } from 'firebase/firestore';
import { useAuth } from '@/contexts/AuthContext';
import { db } from '@/lib/firebase';

type DayOfWeek = 'Monday' | 'Tuesday' | 'Wednesday' | 'Thursday' | 'Friday' | 'Saturday' | 'Sunday';

interface TimeSlot {
	start: string;
	end: string;
}

interface DayAvailability {
	enabled: boolean;
	slots: TimeSlot[];
}

interface AvailabilitySchedule {
	[day: string]: DayAvailability;
}

const DAYS_OF_WEEK: DayOfWeek[] = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

const BUTTON_DANGER =
	'inline-flex items-center gap-2 rounded-lg border border-rose-200 px-3 py-1.5 text-xs font-semibold text-rose-600 transition hover:border-rose-300 hover:text-rose-700 focus-visible:border-rose-300 focus-visible:text-rose-700 focus-visible:outline-none';

const DEFAULT_AVAILABILITY: AvailabilitySchedule = {
	Monday: { enabled: false, slots: [{ start: '09:00', end: '17:00' }] },
	Tuesday: { enabled: false, slots: [{ start: '09:00', end: '17:00' }] },
	Wednesday: { enabled: false, slots: [{ start: '09:00', end: '17:00' }] },
	Thursday: { enabled: false, slots: [{ start: '09:00', end: '17:00' }] },
	Friday: { enabled: false, slots: [{ start: '09:00', end: '17:00' }] },
	Saturday: { enabled: false, slots: [{ start: '09:00', end: '17:00' }] },
	Sunday: { enabled: false, slots: [{ start: '09:00', end: '17:00' }] },
};

export default function Availability() {
	const { user } = useAuth();
	const [schedule, setSchedule] = useState<AvailabilitySchedule>(DEFAULT_AVAILABILITY);
	const [loading, setLoading] = useState(true);
	const [saving, setSaving] = useState(false);
	const [savedMessage, setSavedMessage] = useState(false);
	const [staffDocId, setStaffDocId] = useState<string | null>(null);
	const [showTemplates, setShowTemplates] = useState(false);
	const [templates, setTemplates] = useState<Array<{ id?: string; name: string; schedule: AvailabilitySchedule }>>([]);
	const [templateName, setTemplateName] = useState('');

	// Find staff document by user email
	useEffect(() => {
		if (!user?.email) {
			setLoading(false);
			return;
		}

		let unsubscribe: (() => void) | null = null;

		const loadStaffDoc = async () => {
			try {
				const staffQuery = query(collection(db, 'staff'), where('userEmail', '==', user.email?.toLowerCase()));
				const querySnapshot = await getDocs(staffQuery);
				
				if (!querySnapshot.empty) {
					const staffDoc = querySnapshot.docs[0];
					setStaffDocId(staffDoc.id);
					
					// Set up real-time listener for this staff document
					const staffRef = doc(db, 'staff', staffDoc.id);
					unsubscribe = onSnapshot(
						staffRef,
						snapshot => {
							if (snapshot.exists()) {
								const data = snapshot.data();
								const loadedSchedule = data.availability as AvailabilitySchedule | undefined;
								if (loadedSchedule) {
									// Merge with defaults to ensure all days are present
									const merged: AvailabilitySchedule = { ...DEFAULT_AVAILABILITY };
									DAYS_OF_WEEK.forEach(day => {
										if (loadedSchedule[day]) {
											merged[day] = {
												enabled: loadedSchedule[day].enabled ?? false,
												slots: loadedSchedule[day].slots?.length > 0 ? loadedSchedule[day].slots : [{ start: '09:00', end: '17:00' }],
											};
										}
									});
									setSchedule(merged);
								} else {
									setSchedule(DEFAULT_AVAILABILITY);
								}
							} else {
								setSchedule(DEFAULT_AVAILABILITY);
							}
							setLoading(false);
						},
						error => {
							console.error('Failed to load availability', error);
							setSchedule(DEFAULT_AVAILABILITY);
							setLoading(false);
						}
					);
				} else {
					console.warn('No staff document found for user email:', user.email);
					setSchedule(DEFAULT_AVAILABILITY);
					setLoading(false);
				}
			} catch (error) {
				console.error('Failed to find staff document', error);
				setSchedule(DEFAULT_AVAILABILITY);
				setLoading(false);
			}
		};

		loadStaffDoc();

		return () => {
			if (unsubscribe) {
				unsubscribe();
			}
		};
	}, [user?.email]);

	const handleDayToggle = (day: DayOfWeek) => {
		setSchedule(prev => ({
			...prev,
			[day]: {
				...prev[day],
				enabled: !prev[day].enabled,
			},
		}));
	};

	const handleSlotChange = (day: DayOfWeek, slotIndex: number, field: 'start' | 'end', value: string) => {
		setSchedule(prev => {
			const newSchedule = { ...prev };
			const newSlots = [...newSchedule[day].slots];
			const updatedSlot = { ...newSlots[slotIndex], [field]: value };

			// Validate that end time is after start time
			if (field === 'start' && updatedSlot.end && value >= updatedSlot.end) {
				// If start time is after or equal to end time, adjust end time to be 1 hour later
				const [hours, minutes] = value.split(':').map(Number);
				const startDate = new Date();
				startDate.setHours(hours, minutes, 0, 0);
				startDate.setHours(startDate.getHours() + 1);
				const newEndTime = `${String(startDate.getHours()).padStart(2, '0')}:${String(startDate.getMinutes()).padStart(2, '0')}`;
				updatedSlot.end = newEndTime;
			} else if (field === 'end' && updatedSlot.start && value <= updatedSlot.start) {
				// If end time is before or equal to start time, adjust start time to be 1 hour earlier
				const [hours, minutes] = value.split(':').map(Number);
				const endDate = new Date();
				endDate.setHours(hours, minutes, 0, 0);
				endDate.setHours(endDate.getHours() - 1);
				const newStartTime = `${String(endDate.getHours()).padStart(2, '0')}:${String(endDate.getMinutes()).padStart(2, '0')}`;
				updatedSlot.start = newStartTime;
			}

			newSlots[slotIndex] = updatedSlot;
			newSchedule[day] = { ...newSchedule[day], slots: newSlots };
			return newSchedule;
		});
	};

	const handleAddSlot = (day: DayOfWeek) => {
		setSchedule(prev => {
			const newSchedule = { ...prev };
			newSchedule[day] = {
				...newSchedule[day],
				slots: [...newSchedule[day].slots, { start: '09:00', end: '17:00' }],
			};
			return newSchedule;
		});
	};

	const handleRemoveSlot = (day: DayOfWeek, slotIndex: number) => {
		setSchedule(prev => {
			const newSchedule = { ...prev };
			if (newSchedule[day].slots.length > 1) {
				const newSlots = newSchedule[day].slots.filter((_, idx) => idx !== slotIndex);
				newSchedule[day] = { ...newSchedule[day], slots: newSlots };
			}
			return newSchedule;
		});
	};

	const handleSave = async () => {
		if (saving) return;

		if (!staffDocId) {
			alert('Staff profile not found. Please contact an administrator.');
			return;
		}

		setSaving(true);
		try {
			const staffRef = doc(db, 'staff', staffDocId);
			
			// Update the availability field in the staff document (merge to preserve other fields)
			await setDoc(
				staffRef,
				{
					availability: schedule,
					availabilityUpdatedAt: serverTimestamp(),
				},
				{ merge: true }
			);

			// Verify the save by reading back the document
			const verifyDoc = await getDoc(staffRef);
			if (!verifyDoc.exists()) {
				throw new Error('Staff document was not found in Firestore');
			}

			const savedData = verifyDoc.data();
			console.log('✅ Availability saved successfully to Firestore:', {
				collection: 'staff',
				documentId: staffDocId,
				savedAvailability: savedData.availability,
			});

			setSavedMessage(true);
			setTimeout(() => setSavedMessage(false), 3000);
		} catch (error) {
			console.error('❌ Failed to save availability to Firestore:', error);
			const errorMessage = error instanceof Error ? error.message : 'Unknown error';
			console.error('Error details:', {
				collection: 'staff',
				documentId: staffDocId,
				error: errorMessage,
				schedule: schedule,
			});
			alert(`Failed to save availability: ${errorMessage}\n\nCheck the browser console for more details.`);
		} finally {
			setSaving(false);
		}
	};

	const handleCopyDay = (sourceDay: DayOfWeek) => {
		const sourceSchedule = schedule[sourceDay];
		const targetDays = DAYS_OF_WEEK.filter(day => day !== sourceDay);

		if (window.confirm(`Copy ${sourceDay} schedule to all other days?`)) {
			setSchedule(prev => {
				const newSchedule = { ...prev };
				targetDays.forEach(day => {
					newSchedule[day] = {
						enabled: sourceSchedule.enabled,
						slots: sourceSchedule.slots.map(slot => ({ ...slot })),
					};
				});
				return newSchedule;
			});
		}
	};

	const loadTemplates = async () => {
		try {
			const response = await fetch('/api/availability/templates');
			const result = await response.json();
			if (result.success) {
				setTemplates(result.data);
			}
		} catch (error) {
			console.error('Failed to load templates:', error);
		}
	};

	const saveAsTemplate = async () => {
		if (!templateName.trim()) {
			alert('Please enter a template name');
			return;
		}
		try {
			const response = await fetch('/api/availability/templates', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ name: templateName.trim(), schedule }),
			});
			const result = await response.json();
			if (result.success) {
				alert('Template saved successfully!');
				setTemplateName('');
				await loadTemplates();
			} else {
				alert(result.message || 'Failed to save template');
			}
		} catch (error) {
			console.error('Failed to save template:', error);
			alert('Failed to save template');
		}
	};

	const loadTemplate = (template: { schedule: AvailabilitySchedule }) => {
		setSchedule(template.schedule);
		setShowTemplates(false);
	};

	const deleteTemplate = async (id: string) => {
		if (!window.confirm('Delete this template?')) return;
		try {
			const response = await fetch(`/api/availability/templates?id=${id}`, {
				method: 'DELETE',
			});
			const result = await response.json();
			if (result.success) {
				await loadTemplates();
			} else {
				alert(result.message || 'Failed to delete template');
			}
		} catch (error) {
			console.error('Failed to delete template:', error);
			alert('Failed to delete template');
		}
	};

	useEffect(() => {
		if (showTemplates) {
			loadTemplates();
		}
	}, [showTemplates]);

	if (loading) {
		return (
			<div className="min-h-svh bg-slate-50 px-6 py-10">
				<div className="mx-auto max-w-4xl">
					<div className="py-12 text-center text-sm text-slate-500">
						<div className="inline-flex h-8 w-8 items-center justify-center rounded-full border-2 border-slate-200 border-t-sky-500 animate-spin" aria-hidden="true" />
						<span className="ml-3 align-middle">Loading availability…</span>
					</div>
				</div>
			</div>
		);
	}


	return (
		<div className="min-h-svh bg-slate-50 px-6 py-10">
			<div className="mx-auto max-w-4xl">
				<header className="mb-8">
					<p className="text-sm font-semibold uppercase tracking-wide text-sky-600">Clinical Team</p>
					<h1 className="mt-1 text-3xl font-semibold text-slate-900">My Availability</h1>
					<p className="mt-2 text-sm text-slate-600">
						Set your available time slots for each day of the week. This helps the front desk schedule appointments
						when you're available.
					</p>
				</header>

				{savedMessage && (
					<div className="mb-6 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
						<i className="fas fa-check mr-2" aria-hidden="true" />
						Availability saved successfully!
					</div>
				)}

				<div className="grid gap-6 sm:grid-cols-1 md:grid-cols-2">
					{DAYS_OF_WEEK.map(day => (
						<div key={day} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
							<div className="mb-4 flex items-center justify-between">
								<div className="flex items-center gap-3">
									<label className="flex items-center gap-3">
										<input
											type="checkbox"
											checked={schedule[day].enabled}
											onChange={() => handleDayToggle(day)}
											className="h-5 w-5 rounded border-slate-300 text-sky-600 focus:ring-sky-200"
										/>
										<span className="text-lg font-semibold text-slate-900">{day}</span>
									</label>
								</div>
								<button
									type="button"
									onClick={() => handleCopyDay(day)}
									className="text-xs font-medium text-slate-500 hover:text-slate-700"
									title={`Copy ${day} schedule to all other days`}
								>
									<i className="fas fa-copy mr-1" aria-hidden="true" />
									Copy to all days
								</button>
							</div>

							{schedule[day].enabled ? (
								<div className="space-y-3">
									{schedule[day].slots.map((slot, slotIndex) => (
										<div key={slotIndex} className="flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
											<div className="flex-1">
												<label className="block text-xs font-medium text-slate-500">Start Time</label>
												<input
													type="time"
													value={slot.start}
													onChange={e => handleSlotChange(day, slotIndex, 'start', e.target.value)}
													className="input-base"
												/>
											</div>
											<div className="flex-1">
												<label className="block text-xs font-medium text-slate-500">End Time</label>
												<input
													type="time"
													value={slot.end}
													onChange={e => handleSlotChange(day, slotIndex, 'end', e.target.value)}
													className="input-base"
												/>
											</div>
											<div className="flex items-end">
												{schedule[day].slots.length > 1 && (
													<button
														type="button"
														onClick={() => handleRemoveSlot(day, slotIndex)}
														className={BUTTON_DANGER}
														title="Remove time slot"
													>
														<i className="fas fa-trash text-xs" aria-hidden="true" />
													</button>
												)}
											</div>
										</div>
									))}
									<button
										type="button"
										onClick={() => handleAddSlot(day)}
										className="w-full rounded-lg border-2 border-dashed border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-600 transition hover:border-sky-300 hover:text-sky-600"
									>
										<i className="fas fa-plus mr-2 text-xs" aria-hidden="true" />
										Add another time slot
									</button>
								</div>
							) : (
								<p className="text-sm italic text-slate-400">Not available on this day</p>
							)}
						</div>
					))}
				</div>

				<div className="mt-8 flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
					<button
						type="button"
						onClick={() => setShowTemplates(!showTemplates)}
						className="btn-secondary"
					>
						<i className="fas fa-bookmark text-xs" aria-hidden="true" />
						{showTemplates ? 'Hide Templates' : 'Templates'}
					</button>
					<button type="button" onClick={handleSave} className="btn-primary" disabled={saving}>
						<i className="fas fa-save text-xs" aria-hidden="true" />
						{saving ? 'Saving...' : 'Save Availability'}
					</button>
				</div>

				{showTemplates && (
					<div className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
						<h3 className="mb-4 text-lg font-semibold text-slate-900">Availability Templates</h3>
						
						{/* Save Current as Template */}
						<div className="mb-6 rounded-lg border border-slate-200 bg-slate-50 p-4">
							<label className="block text-sm font-medium text-slate-700 mb-2">Save Current Schedule as Template</label>
							<div className="flex gap-2">
								<input
									type="text"
									value={templateName}
									onChange={e => setTemplateName(e.target.value)}
									placeholder="Template name (e.g., Standard Schedule)"
									className="input-base flex-1"
								/>
								<button type="button" onClick={saveAsTemplate} className="btn-primary">
									Save Template
								</button>
							</div>
						</div>

						{/* Load Templates */}
						<div>
							<label className="block text-sm font-medium text-slate-700 mb-2">Load Saved Template</label>
							{templates.length === 0 ? (
								<p className="text-sm text-slate-400 italic">No templates saved</p>
							) : (
								<div className="space-y-2">
									{templates.map(template => (
										<div
											key={template.id}
											className="flex items-center justify-between rounded-lg border border-slate-200 bg-white p-3 hover:border-sky-300"
										>
											<span className="text-sm font-medium text-slate-900">{template.name}</span>
											<div className="flex gap-2">
												<button
													type="button"
													onClick={() => loadTemplate(template)}
													className="text-xs font-medium text-sky-600 hover:text-sky-700"
												>
													Load
												</button>
												{template.id && (
													<button
														type="button"
														onClick={() => deleteTemplate(template.id!)}
														className="text-xs font-medium text-rose-600 hover:text-rose-700"
													>
														<i className="fas fa-trash" />
													</button>
												)}
											</div>
										</div>
									))}
								</div>
							)}
						</div>
					</div>
				)}

				<div className="mt-6 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-700">
					<i className="fas fa-info-circle mr-2" aria-hidden="true" />
					<strong>Tip:</strong> Your availability will be used by the front desk when scheduling appointments. Make sure to
					keep it updated if your schedule changes.
				</div>
			</div>
		</div>
	);
}

