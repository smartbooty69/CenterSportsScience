'use client';

import { useEffect, useState, useMemo, useRef } from 'react';
import { collection, doc, getDoc, getDocs, query, setDoc, updateDoc, where, onSnapshot, serverTimestamp, deleteField } from 'firebase/firestore';
import { useAuth } from '@/contexts/AuthContext';
import { db } from '@/lib/firebase';

interface TimeSlot {
	start: string;
	end: string;
}

interface DayAvailability {
	enabled: boolean;
	slots: TimeSlot[];
}

interface DateSpecificAvailability {
	[date: string]: DayAvailability; // date in YYYY-MM-DD format
}

const BUTTON_DANGER =
	'inline-flex items-center gap-2 rounded-lg border border-rose-200 px-3 py-1.5 text-xs font-semibold text-rose-600 transition hover:border-rose-300 hover:text-rose-700 focus-visible:border-rose-300 focus-visible:text-rose-700 focus-visible:outline-none';

// Helper to format date as YYYY-MM-DD in local timezone
const formatDateKey = (date: Date): string => {
	const year = date.getFullYear();
	const month = String(date.getMonth() + 1).padStart(2, '0');
	const day = String(date.getDate()).padStart(2, '0');
	return `${year}-${month}-${day}`;
};

export default function Availability() {
	const { user } = useAuth();
	
	const [dateSpecific, setDateSpecific] = useState<DateSpecificAvailability>({});
	const [loading, setLoading] = useState(true);
	const [saving, setSaving] = useState(false);
	const [savedMessage, setSavedMessage] = useState(false);
	const [staffDocId, setStaffDocId] = useState<string | null>(null);
	const isSavingRef = useRef(false);

	// Date-specific scheduling state
	const [selectedMonth, setSelectedMonth] = useState<string>(() => {
		const today = new Date();
		const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
		return formatDateKey(firstDay);
	});
	const [selectedDate, setSelectedDate] = useState<string | null>(null);
	const [editingDateSchedule, setEditingDateSchedule] = useState<DayAvailability | null>(null);
	const [appointmentsForDate, setAppointmentsForDate] = useState<Array<{ time: string; patient: string; status: string }>>([]);
	const [loadingAppointments, setLoadingAppointments] = useState(false);
	const [currentStaffUserName, setCurrentStaffUserName] = useState<string | null>(null);

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
					const data = staffDoc.data();
					setStaffDocId(staffDoc.id);
					setCurrentStaffUserName(data.userName ? String(data.userName) : null);
					
					// Set up real-time listener for this staff document
					const staffRef = doc(db, 'staff', staffDoc.id);
					unsubscribe = onSnapshot(
						staffRef,
						snapshot => {
							// Don't update if we're currently saving (to avoid race conditions)
							if (isSavingRef.current) {
								return;
							}

							if (snapshot.exists()) {
								const data = snapshot.data();
								setCurrentStaffUserName(data.userName ? String(data.userName) : null);
								const loadedDateSpecific = data.dateSpecificAvailability as DateSpecificAvailability | undefined;

								if (loadedDateSpecific) {
									console.log('📅 Availability updated from Firestore:', Object.keys(loadedDateSpecific));
									setDateSpecific(loadedDateSpecific);
								} else {
									setDateSpecific({});
								}
							} else {
								setDateSpecific({});
								setCurrentStaffUserName(null);
							}
							setLoading(false);
						},
						error => {
							console.error('Failed to load availability', error);
							setDateSpecific({});
							setCurrentStaffUserName(null);
							setLoading(false);
						}
					);
				} else {
					console.warn('No staff document found for user email:', user.email);
					setDateSpecific({});
					setCurrentStaffUserName(null);
					setLoading(false);
				}
			} catch (error) {
				console.error('Failed to find staff document', error);
				setDateSpecific({});
				setCurrentStaffUserName(null);
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

	// Date-specific handlers
	const getMonthDates = (monthStart: string): string[] => {
		const start = new Date(monthStart + 'T00:00:00'); // Parse as local time
		const year = start.getFullYear();
		const month = start.getMonth();
		
		// Get first day of month and what day of week it is
		const firstDay = new Date(year, month, 1);
		const lastDay = new Date(year, month + 1, 0); // Last day of month
		const daysInMonth = lastDay.getDate();
		const startDayOfWeek = firstDay.getDay(); // 0 = Sunday, 1 = Monday, etc.
		
		const dates: string[] = [];
		
		// Add days from previous month to fill the first week
		const prevMonthLastDay = new Date(year, month, 0).getDate();
		for (let i = startDayOfWeek - 1; i >= 0; i--) {
			const date = new Date(year, month - 1, prevMonthLastDay - i);
			dates.push(formatDateKey(date));
		}
		
		// Add all days of current month
		for (let day = 1; day <= daysInMonth; day++) {
			const date = new Date(year, month, day);
			dates.push(formatDateKey(date));
		}
		
		// Add days from next month to fill the last week (to make 6 rows = 42 days)
		const totalDays = dates.length;
		const remainingDays = 42 - totalDays; // 6 weeks * 7 days = 42
		for (let day = 1; day <= remainingDays; day++) {
			const date = new Date(year, month + 1, day);
			dates.push(formatDateKey(date));
		}
		
		return dates;
	};

	const getDayName = (date: string): string => {
		// Parse date as local time to avoid timezone issues
		const d = new Date(date + 'T00:00:00');
		const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
		return dayNames[d.getDay()];
	};

	const getDateSchedule = (date: string): DayAvailability => {
		// Return date-specific schedule if exists, otherwise return default (not available)
		if (dateSpecific[date]) {
			return dateSpecific[date];
		}
		return { enabled: false, slots: [{ start: '09:00', end: '17:00' }] };
	};

	// Check if a time slot has appointments
	const hasAppointmentsInSlot = (slot: TimeSlot, date: string): boolean => {
		return appointmentsForDate.some(apt => {
			if (apt.status === 'cancelled') return false;
			
			const [aptHours, aptMinutes] = apt.time.split(':').map(Number);
			const [slotStartHours, slotStartMinutes] = slot.start.split(':').map(Number);
			const [slotEndHours, slotEndMinutes] = slot.end.split(':').map(Number);
			
			const aptTime = aptHours * 60 + aptMinutes;
			const slotStart = slotStartHours * 60 + slotStartMinutes;
			let slotEnd = slotEndHours * 60 + slotEndMinutes;
			
			// Handle slots that span midnight
			if (slotEnd <= slotStart) {
				slotEnd += 24 * 60; // Add 24 hours
			}
			
			// Check if appointment time is within the slot
			return aptTime >= slotStart && aptTime < slotEnd;
		});
	};

	// Load appointments for a specific date with real-time updates
	// Use userName from staff document (which is what appointments use) instead of displayName
	useEffect(() => {
		if (!selectedDate || !currentStaffUserName) {
			setAppointmentsForDate([]);
			return;
		}

		setLoadingAppointments(true);
		const appointmentsQuery = query(
			collection(db, 'appointments'),
			where('doctor', '==', currentStaffUserName),
			where('date', '==', selectedDate)
		);

		const unsubscribe = onSnapshot(
			appointmentsQuery,
			(snapshot) => {
				const appointments = snapshot.docs.map(doc => ({
					time: doc.data().time as string,
					patient: doc.data().patient as string,
					status: doc.data().status as string,
				}));
				setAppointmentsForDate(appointments);
				setLoadingAppointments(false);
			},
			(error) => {
				console.error('Failed to load appointments for date', error);
				setAppointmentsForDate([]);
				setLoadingAppointments(false);
			}
		);

		return () => unsubscribe();
	}, [selectedDate, currentStaffUserName]);

	// Imperative loader for appointments on a specific date (used before destructive actions)
	const loadAppointmentsForDate = async (date: string) => {
		if (!currentStaffUserName) {
			setAppointmentsForDate([]);
			return;
		}
		setLoadingAppointments(true);
		try {
			const appointmentsQuery = query(
				collection(db, 'appointments'),
				where('doctor', '==', currentStaffUserName),
				where('date', '==', date)
			);
			const snapshot = await getDocs(appointmentsQuery);
			const appointments = snapshot.docs.map(doc => ({
				time: doc.data().time as string,
				patient: doc.data().patient as string,
				status: doc.data().status as string,
			}));
			setAppointmentsForDate(appointments);
		} catch (error) {
			console.error('Failed to load appointments for date', error);
			setAppointmentsForDate([]);
		} finally {
			setLoadingAppointments(false);
		}
	};

	const handleDateClick = async (date: string) => {
		setSelectedDate(date);
		const currentSchedule = getDateSchedule(date);
		setEditingDateSchedule({
			enabled: currentSchedule.enabled,
			slots: currentSchedule.slots.map(slot => ({ ...slot })),
		});
		// Appointments will be loaded automatically via useEffect when selectedDate changes
	};

	const saveDateSchedule = async () => {
		if (!selectedDate || !editingDateSchedule || !staffDocId) return;

		// Check if any slots have appointments
		const slotsWithAppointments = editingDateSchedule.slots.filter(slot => 
			hasAppointmentsInSlot(slot, selectedDate)
		);

		if (slotsWithAppointments.length > 0) {
			alert('Cannot modify availability for time slots that have appointments assigned. Please transfer or cancel appointments first.');
			return;
		}

		const updatedSchedule = {
			...dateSpecific,
			[selectedDate]: editingDateSchedule,
		};

		// Update local state immediately for better UX
		setDateSpecific(updatedSchedule);
		setSelectedDate(null);
		setEditingDateSchedule(null);

		// Auto-save to Firestore
		isSavingRef.current = true;
		try {
			const staffRef = doc(db, 'staff', staffDocId);
			await setDoc(
				staffRef,
				{
					dateSpecificAvailability: updatedSchedule,
					availabilityUpdatedAt: serverTimestamp(),
				},
				{ merge: true }
			);
			console.log('✅ Saved schedule for', selectedDate);
			setSavedMessage(true);
			setTimeout(() => setSavedMessage(false), 3000);
		} catch (error) {
			console.error('Failed to save schedule', error);
			alert('Failed to save schedule. Please try again.');
			// Revert on error
			setDateSpecific(dateSpecific);
		} finally {
			// Allow listener to update after a short delay
			setTimeout(() => {
				isSavingRef.current = false;
			}, 500);
		}
	};

	const removeDateSchedule = async (date: string) => {
		if (!window.confirm('Remove schedule for this date?') || !staffDocId) return;

		// Load appointments for this date to check
		await loadAppointmentsForDate(date);
		
		// Check if any slots have appointments
		const schedule = getDateSchedule(date);
		const hasAppointments = schedule.slots.some(slot => hasAppointmentsInSlot(slot, date));
		
		if (hasAppointments) {
			alert('Cannot remove schedule for this date because it has appointments assigned. Please transfer or cancel appointments first.');
			return;
		}

		const updatedSchedule = { ...dateSpecific };
		delete updatedSchedule[date];

		// Update local state immediately
		setDateSpecific(updatedSchedule);

		// Auto-save to Firestore
		isSavingRef.current = true;
		try {
			const staffRef = doc(db, 'staff', staffDocId);
			
			// Use updateDoc to properly replace the entire dateSpecificAvailability object
			// This ensures that deleted dates are actually removed from Firestore
			await updateDoc(
				staffRef,
				{
					dateSpecificAvailability: updatedSchedule,
					availabilityUpdatedAt: serverTimestamp(),
				}
			);
			
			console.log('✅ Removed schedule for', date);
			console.log('📅 Updated schedule:', updatedSchedule);
			console.log('📅 Remaining dates:', Object.keys(updatedSchedule));
			setSavedMessage(true);
			setTimeout(() => setSavedMessage(false), 3000);
		} catch (error) {
			console.error('Failed to remove schedule', error);
			alert('Failed to remove schedule. Please try again.');
			// Revert on error
			setDateSpecific(dateSpecific);
		} finally {
			// Allow listener to update after a short delay
			setTimeout(() => {
				isSavingRef.current = false;
			}, 500);
		}
	};

	const handleDateSlotChange = (slotIndex: number, field: 'start' | 'end', value: string) => {
		if (!editingDateSchedule || !selectedDate) return;

		// Check if this slot has appointments
		const currentSlot = editingDateSchedule.slots[slotIndex];
		if (hasAppointmentsInSlot(currentSlot, selectedDate)) {
			alert('Cannot modify this time slot because it has appointments assigned. Please transfer or cancel appointments first.');
			return;
		}

		const newSlots = [...editingDateSchedule.slots];
		const updatedSlot = { ...newSlots[slotIndex], [field]: value };

		if (field === 'start' && updatedSlot.end && value >= updatedSlot.end) {
			const [hours, minutes] = value.split(':').map(Number);
			const startDate = new Date();
			startDate.setHours(hours, minutes, 0, 0);
			startDate.setHours(startDate.getHours() + 1);
			const newEndTime = `${String(startDate.getHours()).padStart(2, '0')}:${String(startDate.getMinutes()).padStart(2, '0')}`;
			updatedSlot.end = newEndTime;
		} else if (field === 'end' && updatedSlot.start && value <= updatedSlot.start) {
			const [hours, minutes] = value.split(':').map(Number);
			const endDate = new Date();
			endDate.setHours(hours, minutes, 0, 0);
			endDate.setHours(endDate.getHours() - 1);
			const newStartTime = `${String(endDate.getHours()).padStart(2, '0')}:${String(endDate.getMinutes()).padStart(2, '0')}`;
			updatedSlot.start = newStartTime;
		}

		newSlots[slotIndex] = updatedSlot;
		setEditingDateSchedule({
			...editingDateSchedule,
			slots: newSlots,
		});
	};

	const handleDateAddSlot = () => {
		if (!editingDateSchedule) return;
		setEditingDateSchedule({
			...editingDateSchedule,
			slots: [...editingDateSchedule.slots, { start: '09:00', end: '17:00' }],
		});
	};

	const handleDateRemoveSlot = (slotIndex: number) => {
		if (!editingDateSchedule || editingDateSchedule.slots.length <= 1 || !selectedDate) return;

		// Check if this slot has appointments
		const slotToRemove = editingDateSchedule.slots[slotIndex];
		if (hasAppointmentsInSlot(slotToRemove, selectedDate)) {
			alert('Cannot remove this time slot because it has appointments assigned. Please transfer or cancel appointments first.');
			return;
		}
		setEditingDateSchedule({
			...editingDateSchedule,
			slots: editingDateSchedule.slots.filter((_, idx) => idx !== slotIndex),
		});
	};

	const copyDayToMonth = async (sourceDate: string) => {
		if (!staffDocId) return;
		
		const monthDates = getMonthDates(selectedMonth);
		const sourceSchedule = getDateSchedule(sourceDate);
		
		// Filter to only current month dates (not previous/next month padding)
		const currentMonth = new Date(selectedMonth + 'T00:00:00');
		const year = currentMonth.getFullYear();
		const month = currentMonth.getMonth();
		const currentMonthDates = monthDates.filter(date => {
			const d = new Date(date + 'T00:00:00');
			return d.getFullYear() === year && d.getMonth() === month;
		});
		
		if (!window.confirm(`Copy schedule from ${formatDateDisplay(sourceDate)} to all days in this month?`)) return;

		const newDateSpecific = { ...dateSpecific };
		
		currentMonthDates.forEach(date => {
			newDateSpecific[date] = {
				enabled: sourceSchedule.enabled,
				slots: sourceSchedule.slots.map(slot => ({ ...slot })),
			};
		});

		// Update local state immediately
		setDateSpecific(newDateSpecific);

		// Auto-save to Firestore
		isSavingRef.current = true;
		try {
			const staffRef = doc(db, 'staff', staffDocId);
			await setDoc(
				staffRef,
				{
					dateSpecificAvailability: newDateSpecific,
					availabilityUpdatedAt: serverTimestamp(),
				},
				{ merge: true }
			);
			console.log('✅ Copied schedule to month');
			setSavedMessage(true);
			setTimeout(() => setSavedMessage(false), 3000);
		} catch (error) {
			console.error('Failed to copy schedule', error);
			alert('Failed to copy schedule. Please try again.');
		} finally {
			// Allow listener to update after a short delay
			setTimeout(() => {
				isSavingRef.current = false;
			}, 500);
		}
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
			
			// Log what we're saving
			console.log('💾 Saving availability:', dateSpecific);
			console.log('💾 Dates being saved:', Object.keys(dateSpecific));
			Object.entries(dateSpecific).forEach(([date, schedule]) => {
				console.log(`  - ${date}: enabled=${schedule.enabled}, slots=${schedule.slots?.length || 0}`);
			});
			
			await setDoc(
				staffRef,
				{
					dateSpecificAvailability: dateSpecific,
					availabilityUpdatedAt: serverTimestamp(),
				},
				{ merge: true }
			);

			const verifyDoc = await getDoc(staffRef);
			if (!verifyDoc.exists()) {
				throw new Error('Staff document was not found in Firestore');
			}

			const savedData = verifyDoc.data();
			console.log('✅ Saved successfully. Verified data:', savedData.dateSpecificAvailability);

			setSavedMessage(true);
			setTimeout(() => setSavedMessage(false), 3000);
		} catch (error) {
			console.error('Failed to save availability', error);
			const errorMessage = error instanceof Error ? error.message : 'Unknown error';
			alert(`Failed to save availability: ${errorMessage}`);
		} finally {
			setSaving(false);
		}
	};

	const monthDates = useMemo(() => getMonthDates(selectedMonth), [selectedMonth]);
	
	const getMonthName = (dateString: string) => {
		const date = new Date(dateString + 'T00:00:00');
		return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
	};
	
	const isCurrentMonth = (date: string) => {
		const d = new Date(date + 'T00:00:00');
		const monthStart = new Date(selectedMonth + 'T00:00:00');
		return d.getFullYear() === monthStart.getFullYear() && d.getMonth() === monthStart.getMonth();
	};

	const formatDateDisplay = (date: string) => {
		const d = new Date(date);
		return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
	};

	if (loading) {
		return (
			<div className="min-h-svh bg-slate-50 px-6 py-10">
				<div className="mx-auto max-w-4xl">
					<div className="py-12 text-center text-sm text-slate-500">
						<div className="loading-spinner" aria-hidden="true" />
						<span className="ml-3 align-middle">Loading availability…</span>
					</div>
				</div>
			</div>
		);
	}

	return (
		<div className="min-h-svh bg-slate-50 px-6 py-10">
			<div className="mx-auto max-w-6xl">
				<header className="mb-8">
					<p className="text-sm font-semibold uppercase tracking-wide text-sky-600">Clinical Team</p>
					<h1 className="mt-1 text-3xl font-semibold text-slate-900">My Availability</h1>
					<p className="mt-2 text-sm text-slate-600">
						Schedule your availability by date. Click on any date to set your available hours for that day.
					</p>
				</header>

				{savedMessage && (
					<div className="mb-6 alert-success">
						<i className="fas fa-check mr-2" aria-hidden="true" />
						Changes saved successfully!
					</div>
				)}

				{/* Month Selector */}
				<div className="mb-6 section-card">
					<div className="mb-4 flex items-center justify-between">
						<h3 className="text-lg font-semibold text-slate-900">{getMonthName(selectedMonth)}</h3>
						<div className="flex items-center gap-3">
							<button
								type="button"
								onClick={() => {
									const current = new Date(selectedMonth + 'T00:00:00');
									current.setMonth(current.getMonth() - 1);
									setSelectedMonth(formatDateKey(current));
								}}
								className="btn-secondary"
							>
								<i className="fas fa-chevron-left" aria-hidden="true" />
							</button>
							<input
								type="month"
								value={selectedMonth.substring(0, 7)}
								onChange={e => {
									const newDate = new Date(e.target.value + '-01T00:00:00');
									setSelectedMonth(formatDateKey(newDate));
								}}
								className="input-base"
							/>
							<button
								type="button"
								onClick={() => {
									const current = new Date(selectedMonth + 'T00:00:00');
									current.setMonth(current.getMonth() + 1);
									setSelectedMonth(formatDateKey(current));
								}}
								className="btn-secondary"
							>
								<i className="fas fa-chevron-right" aria-hidden="true" />
							</button>
							<button
								type="button"
								onClick={() => {
									const today = new Date();
									const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
									setSelectedMonth(formatDateKey(firstDay));
								}}
								className="btn-secondary text-xs"
							>
								This Month
							</button>
						</div>
					</div>
				</div>

				{/* Month Calendar Grid */}
				<div className="mb-6">
					{/* Day headers */}
					<div className="mb-2 grid grid-cols-7 gap-2">
						{['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
							<div key={day} className="text-center text-xs font-semibold text-slate-600">
								{day}
							</div>
						))}
					</div>
					{/* Calendar days */}
					<div className="grid grid-cols-7 gap-2">
						{monthDates.map((date, index) => {
							const dayName = getDayName(date);
							const dateSchedule = getDateSchedule(date);
							const hasSchedule = !!dateSpecific[date];
							const today = new Date();
							const todayKey = formatDateKey(today);
							const isToday = date === todayKey;
							const isCurrentMonthDay = isCurrentMonth(date);
							
							return (
								<div
									key={date}
									className={`rounded-xl border-2 p-3 transition min-h-[120px] ${
										!isCurrentMonthDay
											? 'border-slate-100 bg-slate-50 opacity-50'
											: isToday
											? 'border-sky-400 bg-sky-50'
											: hasSchedule
											? 'border-emerald-300 bg-emerald-50'
											: 'border-slate-200 bg-white'
									}`}
								>
									<div className="mb-2 flex items-center justify-between">
										<div>
											<p className={`text-xs font-medium ${!isCurrentMonthDay ? 'text-slate-400' : 'text-slate-500'}`}>
												{isCurrentMonthDay ? dayName.substring(0, 3) : ''}
											</p>
											<p className={`text-sm font-semibold ${!isCurrentMonthDay ? 'text-slate-400' : isToday ? 'text-sky-700' : 'text-slate-900'}`}>
												{new Date(date + 'T00:00:00').getDate()}
											</p>
										</div>
										{hasSchedule && isCurrentMonthDay && (
											<button
												type="button"
												onClick={() => removeDateSchedule(date)}
												className="text-xs text-rose-600 hover:text-rose-700"
												title="Remove schedule"
											>
												<i className="fas fa-times" aria-hidden="true" />
											</button>
										)}
									</div>
									{isCurrentMonthDay && (
										<>
											{dateSchedule.enabled ? (
												<div className="space-y-1 mb-2">
													{dateSchedule.slots.slice(0, 2).map((slot, slotIdx) => (
														<div key={slotIdx} className="text-xs text-slate-600">
															{slot.start} - {slot.end}
														</div>
													))}
													{dateSchedule.slots.length > 2 && (
														<div className="text-xs text-slate-500">
															+{dateSchedule.slots.length - 2} more
														</div>
													)}
												</div>
											) : hasSchedule ? (
												<p className="text-xs italic text-slate-400 mb-2">Not available</p>
											) : (
												<p className="text-xs italic text-slate-400 mb-2">Not scheduled</p>
											)}
											<div className="mt-auto flex gap-1">
												<button
													type="button"
													onClick={() => handleDateClick(date)}
													className="flex-1 rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-700 transition hover:border-sky-400 hover:bg-sky-50 hover:text-sky-700"
												>
													{hasSchedule ? 'Edit' : 'Set'}
												</button>
												{hasSchedule && (
													<button
														type="button"
														onClick={() => copyDayToMonth(date)}
														className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-700 transition hover:border-sky-400 hover:bg-sky-50 hover:text-sky-700"
														title="Copy to all days in month"
													>
														<i className="fas fa-copy" aria-hidden="true" />
													</button>
												)}
											</div>
										</>
									)}
								</div>
							);
						})}
					</div>
				</div>

				{/* Date Edit Modal */}
				{selectedDate && editingDateSchedule && (
					<div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 backdrop-blur-sm px-4 py-6">
						<div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white shadow-2xl">
							<header className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
								<h3 className="text-lg font-semibold text-slate-900">
									Schedule for {formatDateDisplay(selectedDate)}
								</h3>
								<button
									type="button"
									onClick={() => {
										setSelectedDate(null);
										setEditingDateSchedule(null);
										setAppointmentsForDate([]);
									}}
									className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
								>
									<i className="fas fa-times" aria-hidden="true" />
								</button>
							</header>
							<div className="px-6 py-4">
								{loadingAppointments ? (
									<div className="py-4 text-center text-sm text-slate-500">
										Loading appointments...
									</div>
								) : appointmentsForDate.length > 0 && (
									<div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
										<i className="fas fa-info-circle mr-2" />
										<strong>Note:</strong> Some time slots have appointments assigned. These slots cannot be modified until appointments are transferred or cancelled.
									</div>
								)}
								<div className="space-y-3">
									{editingDateSchedule.slots.map((slot, slotIndex) => {
										const hasAppointments = selectedDate ? hasAppointmentsInSlot(slot, selectedDate) : false;
										const slotAppointments = selectedDate ? appointmentsForDate.filter(apt => {
											if (apt.status === 'cancelled') return false;
											const [aptHours, aptMinutes] = apt.time.split(':').map(Number);
											const [slotStartHours, slotStartMinutes] = slot.start.split(':').map(Number);
											const [slotEndHours, slotEndMinutes] = slot.end.split(':').map(Number);
											const aptTime = aptHours * 60 + aptMinutes;
											const slotStart = slotStartHours * 60 + slotStartMinutes;
											let slotEnd = slotEndHours * 60 + slotEndMinutes;
											if (slotEnd <= slotStart) slotEnd += 24 * 60;
											return aptTime >= slotStart && aptTime < slotEnd;
										}) : [];
										
										return (
											<div 
												key={slotIndex} 
												className={`flex items-center gap-3 rounded-lg border p-3 ${
													hasAppointments 
														? 'border-amber-300 bg-amber-50' 
														: 'border-slate-200 bg-slate-50'
												}`}
											>
												<div className="flex-1">
													<label className="block text-xs font-medium text-slate-500">
														Start Time
														{hasAppointments && <span className="ml-1 text-amber-600">(Has appointments)</span>}
													</label>
													<input
														type="time"
														value={slot.start}
														onChange={e => handleDateSlotChange(slotIndex, 'start', e.target.value)}
														className="input-base"
														disabled={hasAppointments}
													/>
													{hasAppointments && slotAppointments.length > 0 && (
														<div className="mt-1 text-xs text-amber-700">
															{slotAppointments.map((apt, idx) => (
																<div key={idx}>
																	{apt.time} - {apt.patient}
																</div>
															))}
														</div>
													)}
												</div>
												<div className="flex-1">
													<label className="block text-xs font-medium text-slate-500">End Time</label>
													<input
														type="time"
														value={slot.end}
														onChange={e => handleDateSlotChange(slotIndex, 'end', e.target.value)}
														className="input-base"
														disabled={hasAppointments}
													/>
												</div>
												<div className="flex items-end">
													{editingDateSchedule.slots.length > 1 && (
														<button
															type="button"
															onClick={() => handleDateRemoveSlot(slotIndex)}
															className={BUTTON_DANGER}
															disabled={hasAppointments}
															title={hasAppointments ? 'Cannot remove slot with appointments' : 'Remove slot'}
														>
															<span className="text-lg leading-none" aria-hidden="true">-</span>
														</button>
													)}
												</div>
											</div>
										);
									})}
									<button
										type="button"
										onClick={handleDateAddSlot}
										className="w-full rounded-lg border-2 border-dashed border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-600 transition hover:border-sky-300 hover:text-sky-600"
									>
										<i className="fas fa-plus mr-2 text-xs" aria-hidden="true" />
										Add another time slot
									</button>
								</div>

								<div className="mt-6 border-t border-slate-200 pt-4">
									{(() => {
										const hasAnyAppointments = selectedDate && editingDateSchedule.slots.some(slot => 
											hasAppointmentsInSlot(slot, selectedDate)
										);
										return (
											<label className="flex items-center gap-3">
												<input
													type="checkbox"
													checked={editingDateSchedule.enabled}
													onChange={e => {
														if (hasAnyAppointments) {
															alert('Cannot change availability status when there are appointments assigned. Please transfer or cancel appointments first.');
															return;
														}
														setEditingDateSchedule({
															...editingDateSchedule,
															enabled: e.target.checked,
														});
													}}
													disabled={!!hasAnyAppointments}
													className="h-5 w-5 rounded border-slate-300 text-sky-600 focus:ring-sky-200 disabled:opacity-50 disabled:cursor-not-allowed"
												/>
												<span className={`text-sm font-medium ${hasAnyAppointments ? 'text-slate-400' : 'text-slate-700'}`}>
													Available on this date
													{hasAnyAppointments && <span className="ml-1 text-xs text-amber-600">(Has appointments)</span>}
												</span>
											</label>
										);
									})()}
									<p className="mt-1 text-xs text-slate-500">
										Check this box to confirm you're available on this date with the time slots above.
									</p>
								</div>
							</div>
							<footer className="flex items-center justify-end gap-3 border-t border-slate-200 px-6 py-4">
								<button
									type="button"
									onClick={() => {
										setSelectedDate(null);
										setEditingDateSchedule(null);
										setAppointmentsForDate([]);
									}}
									className="btn-secondary"
								>
									Cancel
								</button>
								<button type="button" onClick={saveDateSchedule} className="btn-primary">
									Save
								</button>
							</footer>
						</div>
					</div>
				)}


				<div className="mt-6 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-700">
					<i className="fas fa-info-circle mr-2" aria-hidden="true" />
					<strong>Tip:</strong> Click on any date to set your availability. Use the copy button to quickly apply a day's schedule to the entire week.
				</div>
			</div>
		</div>
	);
}
