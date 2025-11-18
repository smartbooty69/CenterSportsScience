/* eslint-disable react-hooks/exhaustive-deps */
'use client';

import { useEffect, useMemo, useState, useRef } from 'react';
import {
	collection,
	doc,
	onSnapshot,
	addDoc,
	updateDoc,
	deleteDoc,
	serverTimestamp,
	writeBatch,
	getDocs,
	type QuerySnapshot,
	type Timestamp,
} from 'firebase/firestore';
// @ts-ignore - papaparse types may not be available
import Papa from 'papaparse';

import {
	type AdminGenderOption,
	type AdminPatientRecord,
	type AdminPatientStatus,
} from '@/lib/adminMockData';
import { db } from '@/lib/firebase';
import PageHeader from '@/components/PageHeader';

const genderOptions: Array<{ value: AdminGenderOption; label: string }> = [
	{ value: '', label: 'Select' },
	{ value: 'Male', label: 'Male' },
	{ value: 'Female', label: 'Female' },
	{ value: 'Other', label: 'Other' },
];

const statusOptions: Array<{ value: AdminPatientStatus; label: string }> = [
	{ value: 'pending', label: 'Pending' },
	{ value: 'ongoing', label: 'Ongoing' },
	{ value: 'completed', label: 'Completed' },
	{ value: 'cancelled', label: 'Cancelled' },
];

const statusFilterOptions: Array<{ value: 'all' | AdminPatientStatus; label: string }> = [
	{ value: 'all', label: 'All statuses' },
	...statusOptions,
];

const formatDate = (iso: string) => {
	if (!iso) return '—';
	try {
		return new Intl.DateTimeFormat('en-US', {
			month: 'short',
			day: 'numeric',
			year: 'numeric',
		}).format(new Date(iso));
	} catch {
		return '—';
	}
};

const formatDateTime = (iso: string) => {
	if (!iso) return '—';
	try {
		return new Intl.DateTimeFormat('en-US', {
			month: 'short',
			day: 'numeric',
			year: 'numeric',
			hour: 'numeric',
			minute: '2-digit',
		}).format(new Date(iso));
	} catch {
		return '—';
	}
};

function normalizeDateInput(raw?: string) {
	if (!raw) return '';
	const trimmed = raw.trim();
	if (!trimmed) return '';

	// direct parse first
	const direct = Date.parse(trimmed);
	if (!Number.isNaN(direct)) {
		return new Date(direct).toISOString();
	}

	// handle common dd/MM/yyyy or MM/dd/yyyy formats
	const parts = trimmed.split(/[\/\-\.]/);
	if (parts.length === 3) {
		let [a, b, c] = parts.map(part => part.trim());

		// ensure year is four digits (fallback if 2 digits)
		if (c.length === 2) {
			c = Number(c) > 50 ? `19${c}` : `20${c}`;
		}

		const numA = Number(a);
		const numB = Number(b);
		const year = Number(c);

		if (!Number.isNaN(numA) && !Number.isNaN(numB) && !Number.isNaN(year)) {
			const isDayFirst = numA > 12 || (numA <= 12 && numB <= 12 && numA > numB);
			const day = isDayFirst ? numA : numB;
			const month = isDayFirst ? numB : numA;
			const parsed = new Date(year, month - 1, day);
			if (!Number.isNaN(parsed.getTime())) {
				return parsed.toISOString();
			}
		}
	}

	// fallback: store as-is (formatDate will show raw string)
	return trimmed;
}

interface PatientNote {
	id: string;
	content: string;
	createdAt: string;
}

interface PatientAttachment {
	id: string;
	fileName: string;
	sizeLabel: string;
	url?: string;
	createdAt: string;
}

interface PatientHistory {
	id: string;
	text: string;
	createdAt: string;
}

interface PatientExtras {
	notes: PatientNote[];
	attachments: PatientAttachment[];
	history: PatientHistory[];
}

export default function Patients() {
	const [patients, setPatients] = useState<AdminPatientRecord[]>([]);
	const [loading, setLoading] = useState(true);
	const [searchTerm, setSearchTerm] = useState('');
	const [statusFilter, setStatusFilter] = useState<'all' | AdminPatientStatus>('all');
	const [dateFrom, setDateFrom] = useState('');
	const [dateTo,   setDateTo]   = useState('');
	const [doctorFilter, setDoctorFilter] = useState<'all' | string>('all');
	const [selectedPatientIds, setSelectedPatientIds] = useState<Set<string>>(new Set());
	const [isImportOpen, setIsImportOpen] = useState(false);
	const [importFile, setImportFile] = useState<File | null>(null);
	const [importPreview, setImportPreview] = useState<any[]>([]);
	const [selectedPatientId, setSelectedPatientId] = useState<string | null>(null);
	const [patientExtras, setPatientExtras] = useState<Record<string, PatientExtras>>({});
	const [loadingExtras, setLoadingExtras] = useState<Record<string, boolean>>({});
	const [isDialogOpen, setIsDialogOpen] = useState(false);
	const [editingId, setEditingId] = useState<string | null>(null);
	const [noteContent, setNoteContent] = useState('');
	const [isAddingNote, setIsAddingNote] = useState(false);
	const fileInputRef = useRef<HTMLInputElement>(null);
	const [formState, setFormState] = useState<Omit<AdminPatientRecord, 'registeredAt'>>({
		patientId: '',
		name: '',
		dob: '',
		gender: '',
		phone: '',
		email: '',
		address: '',
		complaint: '',
		status: 'pending',
	});

	// Load patients from Firestore
	useEffect(() => {
		const unsubscribe = onSnapshot(
			collection(db, 'patients'),
			(snapshot: QuerySnapshot) => {
				const mapped = snapshot.docs.map(docSnap => {
					const data = docSnap.data() as Record<string, unknown>;
					const created = (data.registeredAt as Timestamp | undefined)?.toDate?.();
					return {
						id: docSnap.id,
						patientId: data.patientId ? String(data.patientId) : '',
						name: data.name ? String(data.name) : '',
						dob: data.dob ? String(data.dob) : '',
						gender: (data.gender as AdminGenderOption) || '',
						phone: data.phone ? String(data.phone) : '',
						email: data.email ? String(data.email) : '',
						address: data.address ? String(data.address) : '',
						complaint: data.complaint ? String(data.complaint) : '',
						status: (data.status as AdminPatientStatus) ?? 'pending',
						registeredAt: created ? created.toISOString() : (data.registeredAt as string | undefined) || new Date().toISOString(),
					} as AdminPatientRecord & { id: string };
				});
				setPatients(mapped);
				setLoading(false);
			},
			error => {
				console.error('Failed to load patients', error);
				setPatients([]);
				setLoading(false);
			}
		);

		return () => unsubscribe();
	}, []);

	const doctorOptions = useMemo(() => {
		const doctors = new Set<string>();
		patients.forEach(patient => {
			const candidate = (patient as AdminPatientRecord & { assignedDoctor?: string }).assignedDoctor;
			if (candidate) doctors.add(candidate);
		});
		return Array.from(doctors);
	}, [patients]);

	const filteredPatients = useMemo(() => {
		const query = searchTerm.trim().toLowerCase();
		return patients
			.map((patient, index) => ({ patient, index, id: (patient as AdminPatientRecord & { id?: string }).id || '' }))
			.filter(({ patient }) => {
				const matchesSearch =
					!query ||
					(patient.name || '').toLowerCase().includes(query) ||
					(patient.patientId || '').toLowerCase().includes(query) ||
					(patient.phone || '').toLowerCase().includes(query) ||
					(patient.email || '').toLowerCase().includes(query);
				const matchesStatus = statusFilter === 'all' || patient.status === statusFilter;
				const registeredAt = patient.registeredAt ? new Date(patient.registeredAt) : null;
				const matchesDateFrom = dateFrom
					? (registeredAt ? registeredAt >= new Date(`${dateFrom}T00:00:00`) : false)
					: true;
				const matchesDateTo = dateTo
					? (registeredAt ? registeredAt <= new Date(`${dateTo}T23:59:59`) : false)
					: true;
				const assignedDoctor = (patient as AdminPatientRecord & { assignedDoctor?: string }).assignedDoctor || '';
				const matchesDoctor = doctorFilter === 'all' || assignedDoctor === doctorFilter;
				return matchesSearch && matchesStatus && matchesDateFrom && matchesDateTo && matchesDoctor;
			});
	}, [patients, searchTerm, statusFilter, dateFrom, dateTo, doctorFilter]);

	// Presets removed per request

	const selectedPatient = useMemo(() => {
		if (!selectedPatientId) return null;
		return patients.find(patient => (patient as AdminPatientRecord & { id?: string }).id === selectedPatientId) || null;
	}, [patients, selectedPatientId]);

	useEffect(() => {
		if (selectedPatient) {
			const previous = document.body.style.overflow;
			document.body.style.overflow = 'hidden';
			return () => {
				document.body.style.overflow = previous;
			};
		}
		return;
	}, [selectedPatient]);

	useEffect(() => {
		if (!selectedPatient) return;
		const handler = (event: KeyboardEvent) => {
			if (event.key === 'Escape') {
				closeProfile();
			}
		};
		window.addEventListener('keydown', handler);
		return () => window.removeEventListener('keydown', handler);
	}, [selectedPatient]);

	const closeProfile = () => setSelectedPatientId(null);

	// Load patient extras (notes, attachments, history)
	useEffect(() => {
		if (!selectedPatientId) return;
		const patientId = selectedPatientId;
		
		if (patientExtras[patientId]) return; // Already loaded
		
		setLoadingExtras(prev => ({ ...prev, [patientId]: true }));
		
		const loadExtras = async () => {
			try {
				const [notesSnap, attachmentsSnap, historySnap] = await Promise.all([
					getDocs(collection(db, 'patients', patientId, 'notes')),
					getDocs(collection(db, 'patients', patientId, 'attachments')),
					getDocs(collection(db, 'patients', patientId, 'history')),
				]);
				
				const notes: PatientNote[] = notesSnap.docs.map(d => {
					const data = d.data();
					const createdAt = (data.createdAt as Timestamp)?.toDate?.()?.toISOString() || data.createdAt || new Date().toISOString();
					return {
						id: d.id,
						content: data.content || '',
						createdAt,
					};
				});
				
				const attachments: PatientAttachment[] = attachmentsSnap.docs.map(d => {
					const data = d.data();
					const createdAt = (data.createdAt as Timestamp)?.toDate?.()?.toISOString() || data.createdAt || new Date().toISOString();
					return {
						id: d.id,
						fileName: data.fileName || '',
						sizeLabel: data.sizeLabel || '',
						url: data.url,
						createdAt,
					};
				});
				
				const history: PatientHistory[] = historySnap.docs.map(d => {
					const data = d.data();
					const createdAt = (data.createdAt as Timestamp)?.toDate?.()?.toISOString() || data.createdAt || new Date().toISOString();
					return {
						id: d.id,
						text: data.text || '',
						createdAt,
					};
				});
				
				setPatientExtras(prev => ({
					...prev,
					[patientId]: { notes, attachments, history },
				}));
			} catch (error) {
				console.error('Failed to load patient extras', error);
				setPatientExtras(prev => ({
					...prev,
					[patientId]: { notes: [], attachments: [], history: [] },
				}));
			} finally {
				setLoadingExtras(prev => ({ ...prev, [patientId]: false }));
			}
		};
		
		loadExtras();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [selectedPatientId]);

	const handleToggleSelection = (patientId: string) => {
		setSelectedPatientIds(prev => {
			const next = new Set(prev);
			if (next.has(patientId)) {
				next.delete(patientId);
			} else {
				next.add(patientId);
			}
			return next;
		});
	};

	const handleSelectAll = () => {
		if (selectedPatientIds.size === filteredPatients.length) {
			setSelectedPatientIds(new Set());
		} else {
			setSelectedPatientIds(new Set(filteredPatients.map(({ id }) => id)));
		}
	};

	const handleImportClick = () => {
		setIsImportOpen(true);
	};

	// download template CSV (headers exactly as requested)
	function downloadTemplate() {
		const headers = ['Name', 'Dob', 'Gender', 'Phoneno', 'Email', 'Address', 'DoctorName', 'RegisteredAt', 'Complaint'];
		const csv = headers.join(',') + '\n';
		const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = 'patients_template.csv';
		a.click();
		URL.revokeObjectURL(url);
	}

	const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
		const file = event.target.files?.[0];
		if (!file) return;
		
		setImportFile(file);
		Papa.parse(file, {
			header: true,
			complete: (results: { data: any[] }) => {
				setImportPreview((results.data || []).slice(0, 50)); // Preview first 50 rows
			},
			error: (error: Error) => {
				alert(`Failed to parse CSV: ${error.message}`);
			},
		});
	};

	const handleImportConfirm = async () => {
		if (!importFile) return;
		
		try {
			Papa.parse(importFile, {
				header: true,
				complete: async (results: { data: any[] }) => {
					let batch = writeBatch(db);
					let count = 0;
					
					for (const rawRow of (results.data as any[]) || []) {
						// build case-insensitive map of row keys
						const row: Record<string, string> = {};
						for (const k of Object.keys(rawRow || {})) {
							row[k.toLowerCase().trim()] = rawRow[k];
						}

						// read template headers or common aliases
						const name = (row['name'] || row['fullname'] || row['full name'] || row['fullname'.toLowerCase()] || '').trim();
						const dob = (row['dob'] || row['dateofbirth'] || row['date_of_birth'] || '').trim();
						const gender = (row['gender'] || '').trim();
						const phoneno = (row['phoneno'] || row['phone'] || '').trim();
						const email = (row['email'] || '').trim();
						const address = (row['address'] || '').trim();
						const doctorName = (row['doctorname'] || row['doctor'] || '').trim();
						const registeredAtRaw = (row['registeredat'] || row['registered_at'] || '').trim();
						const complaint = (row['complaint'] || row['notes'] || '').trim();

						// Basic skip rules (same as original)
						if (!name) continue;
						if (!email && !phoneno) continue;

						const patientData = {
							patientId: row['patientid'] || `CSS${Date.now()}${Math.random().toString(36).substr(2, 9)}`,
							name: String(name),
							email: String(email),
							phone: String(phoneno),
							dob: normalizeDateInput(dob),
							address: String(address),
							gender: String(gender) as AdminGenderOption,
							complaint: String(complaint),
							status: 'pending' as AdminPatientStatus,
							// store registeredAt as string (ISO or raw CSV value)
							registeredAt: registeredAtRaw || new Date().toISOString(),
							assignedDoctor: String(doctorName) || undefined,
						};
						
						const docRef = doc(collection(db, 'patients'));
						batch.set(docRef, patientData);
						count++;
						
						if (count % 500 === 0) {
							await batch.commit();
							batch = writeBatch(db);
						}
					}
					
					// commit any remaining
					try {
						await batch.commit();
					} catch (err) {
						if (count > 0) console.error('Final batch commit failed', err);
					}
					
					alert(`Successfully imported ${count} patients.`);
					setIsImportOpen(false);
					setImportFile(null);
					setImportPreview([]);
				},
				error: (err: Error) => {
					console.error('Parsing error', err);
					alert('Failed to parse CSV. Please check the file.');
				}
			});
		} catch (error) {
			console.error('Import failed', error);
			alert('Failed to import patients. Please try again.');
		}
	};

	const handleBulkDeactivate = async () => {
		if (selectedPatientIds.size === 0) {
			alert('Please select at least one patient to deactivate.');
			return;
		}
		
		const confirmed = window.confirm(
			`Are you sure you want to deactivate ${selectedPatientIds.size} patient(s)?`
		);
		if (!confirmed) return;
		
		try {
			const batch = writeBatch(db);
			for (const patientId of selectedPatientIds) {
				const patientRef = doc(db, 'patients', patientId);
				batch.update(patientRef, { status: 'cancelled' });
			}
			await batch.commit();
			alert(`Successfully deactivated ${selectedPatientIds.size} patient(s).`);
			setSelectedPatientIds(new Set());
		} catch (error) {
			console.error('Bulk deactivate failed', error);
			alert('Failed to deactivate patients. Please try again.');
		}
	};

	const handleAddNote = async () => {
		if (!selectedPatientId || !noteContent.trim()) return;
		
		setIsAddingNote(true);
		try {
			const noteData = {
				content: noteContent.trim(),
				createdAt: serverTimestamp(),
			};
			
			await addDoc(collection(db, 'patients', selectedPatientId, 'notes'), noteData);
			
			// Also add to history
			await addDoc(collection(db, 'patients', selectedPatientId, 'history'), {
				text: 'Note added',
				createdAt: serverTimestamp(),
			});
			
			// Clear cached extras to trigger reload
			setPatientExtras(prev => {
				const next = { ...prev };
				delete next[selectedPatientId];
				return next;
			});
			
			setNoteContent('');
			alert('Note added successfully.');
		} catch (error) {
			console.error('Failed to add note', error);
			alert('Failed to add note. Please try again.');
		} finally {
			setIsAddingNote(false);
		}
	};

	const handleUploadAttachment = async (event: React.ChangeEvent<HTMLInputElement>) => {
		const file = event.target.files?.[0];
		if (!file || !selectedPatientId) return;
		
		try {
			const attachmentData = {
				fileName: file.name,
				sizeLabel: `${(file.size / 1024).toFixed(2)} KB`,
				createdAt: serverTimestamp(),
			};
			
			await addDoc(collection(db, 'patients', selectedPatientId, 'attachments'), attachmentData);
			
			// Also add to history
			await addDoc(collection(db, 'patients', selectedPatientId, 'history'), {
				text: `Attachment uploaded: ${file.name}`,
				createdAt: serverTimestamp(),
			});
			
			// Clear cached extras to trigger reload
			setPatientExtras(prev => {
				const next = { ...prev };
				delete next[selectedPatientId];
				return next;
			});
			
			alert('Attachment uploaded successfully.');
		} catch (error) {
			console.error('Failed to upload attachment', error);
			alert('Failed to upload attachment. Please try again.');
		}
	};

	const handleLogActivity = async () => {
		if (!selectedPatientId) return;
		
		const activity = prompt('Enter activity description:');
		if (!activity?.trim()) return;
		
		try {
			await addDoc(collection(db, 'patients', selectedPatientId, 'history'), {
				text: activity.trim(),
				createdAt: serverTimestamp(),
			});
			
			// Clear cached extras to trigger reload
			setPatientExtras(prev => {
				const next = { ...prev };
				delete next[selectedPatientId];
				return next;
			});
			
			alert('Activity logged successfully.');
		} catch (error) {
			console.error('Failed to log activity', error);
			alert('Failed to log activity. Please try again.');
		}
	};

	const handleProfileAction = (action: string) => () => {
		if (action === 'Schedule follow-up' || action === 'Share report' || action === 'Transfer patient') {
			alert(`${action} – functionality coming soon.`);
		}
	};

	const openDialogForCreate = () => {
		setEditingId(null);
		setFormState({
			patientId: '',
			name: '',
			dob: '',
			gender: '',
			phone: '',
			email: '',
			address: '',
			complaint: '',
			status: 'pending',
		});
		setIsDialogOpen(true);
	};

	const openDialogForEdit = (id: string) => {
		const patient = patients.find(p => (p as AdminPatientRecord & { id?: string }).id === id);
		if (!patient) return;
		setEditingId(id);
		setFormState({
			patientId: patient.patientId,
			name: patient.name,
			dob: patient.dob,
			gender: patient.gender,
			phone: patient.phone,
			email: patient.email,
			address: patient.address,
			complaint: patient.complaint,
			status: patient.status,
		});
		setIsDialogOpen(true);
	};

	const closeDialog = () => {
		setIsDialogOpen(false);
		setEditingId(null);
	};

	const handleDelete = async (id: string) => {
		const confirmed = window.confirm('Delete this patient? This cannot be undone.');
		if (!confirmed) return;
		try {
			await deleteDoc(doc(db, 'patients', id));
		} catch (error) {
			console.error('Failed to delete patient', error);
			alert('Failed to delete patient. Please try again.');
		}
	};

	const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
		event.preventDefault();

		const trimmedId = formState.patientId.trim();
		const trimmedName = formState.name.trim();
		const trimmedPhone = formState.phone.trim();
		const trimmedEmail = formState.email.trim();

		if (!trimmedId || !trimmedName) {
			alert('Patient ID and name are required.');
			return;
		}

		// Check for duplicate patient ID
		const duplicateId = patients.some(record => {
			if (editingId && (record as AdminPatientRecord & { id?: string }).id === editingId) return false;
			return record.patientId.toLowerCase() === trimmedId.toLowerCase();
		});
		if (duplicateId) {
			alert('Another patient already uses this ID.');
			return;
		}

		try {
			const patientData = {
				patientId: trimmedId,
				name: trimmedName,
				dob: normalizeDateInput(formState.dob) || '',
				gender: formState.gender || '',
				phone: trimmedPhone || '',
				email: trimmedEmail || '',
				address: formState.address || '',
				complaint: formState.complaint || '',
				status: formState.status,
				registeredAt: editingId ? undefined : serverTimestamp(),
			};

			console.log('Saving patient...', { editingId, patientData });

			if (editingId) {
				// Update existing patient
				await updateDoc(doc(db, 'patients', editingId), patientData);
				console.log('Patient updated successfully');
			} else {
				// Create new patient
				const docRef = await addDoc(collection(db, 'patients'), patientData);
				console.log('Patient created successfully with document ID:', docRef.id);
			}

			// Close dialog and reset form
			setIsDialogOpen(false);
			setEditingId(null);
			setFormState({
				patientId: '',
				name: '',
				dob: '',
				gender: '',
				phone: '',
				email: '',
				address: '',
				complaint: '',
				status: 'pending',
			});

			// Show success message
			if (!editingId) {
				// Small delay to ensure dialog closes before showing alert
				setTimeout(() => {
					alert(`Patient "${trimmedName}" (ID: ${trimmedId}) has been added successfully!`);
				}, 100);
			}
		} catch (error) {
			console.error('Failed to save patient', error);
			const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
			console.error('Error details:', {
				message: errorMessage,
				error,
				formData: formState,
				editingId,
			});
			alert(`Failed to save patient: ${errorMessage}. Please check the console for details.`);
		}
	};

	const handleExportCsv = () => {
		if (!patients.length) {
			alert('No patients found to export.');
			return;
		}

		const headers = [
			'patientId',
			'name',
			'dob',
			'gender',
			'phone',
			'email',
			'address',
			'complaint',
			'status',
			'registeredAt',
		] as const;

		const rows = patients.map(patient =>
			headers
				.map(key => {
					const value = patient[key] ?? '';
					return `"${String(value).replace(/"/g, '""')}"`;
				})
				.join(',')
		);

		const csvContent = [headers.join(','), ...rows].join('\n');
		const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
		const url = URL.createObjectURL(blob);

		const tempLink = document.createElement('a');
		tempLink.href = url;
		tempLink.setAttribute('download', `patients-${new Date().toISOString().slice(0, 10)}.csv`);
		document.body.appendChild(tempLink);
		tempLink.click();
		document.body.removeChild(tempLink);
		URL.revokeObjectURL(url);
	};

	return (
		<div className="min-h-svh bg-slate-50 px-6 py-10">
			<div className="mx-auto max-w-6xl space-y-10">
				<PageHeader
					badge="Admin"
					title="Patient Registry"
					description="Search, export, and maintain the mock patient directory used for demos and QA flows."
				/>

				<div className="border-t border-slate-200" />

				<section>
					<div className="card-container">
						<div className="flex w-full flex-col gap-3 md:flex-row md:items-end md:gap-4">
							<div className="w-full md:w-[360px]">
								<label className="block text-sm font-medium text-slate-700">Search patients</label>
								<div className="relative mt-2">
									<i className="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-xs text-slate-400" aria-hidden="true" />
									<input
										type="search"
										value={searchTerm}
										onChange={event => setSearchTerm(event.target.value)}
										className="w-full rounded-lg border border-slate-300 pl-9 pr-3 py-2 text-sm text-slate-700 transition focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-200"
										placeholder="Filter by name, ID, or phone"
									/>
								</div>
							</div>
							<div className="w-full md:w-40">
								<label className="block text-sm font-medium text-slate-700">Status filter</label>
								<select
									value={statusFilter}
									onChange={event => setStatusFilter(event.target.value as 'all' | AdminPatientStatus)}
									className="select-base"
								>
									{statusFilterOptions.map(option => (
										<option key={option.value} value={option.value}>
											{option.label}
										</option>
									))}
								</select>
							</div>
						</div>

						{/* Registered date filter */}
						<div className="mt-4">
							<label className="block text-sm font-medium text-slate-700">Registered</label>
							<div className="mt-2 flex items-center gap-2">
								<input
									type="date"
									value={dateFrom}
									onChange={e => setDateFrom(e.target.value)}
									className="w-full max-w-[180px] rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 transition focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-200"
								/>
								<span className="text-xs text-slate-500">to</span>
								<input
									type="date"
									value={dateTo}
									onChange={e => setDateTo(e.target.value)}
									className="w-full max-w-[180px] rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 transition focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-200"
								/>
							</div>
						</div>

						{/* Doctor filter */}
						<div className="mt-4">
								<label className="block text-sm font-medium text-slate-700">Assigned doctor</label>
								<select
									value={doctorFilter}
									onChange={event => setDoctorFilter(event.target.value as 'all' | string)}
									className="select-base mt-2 w-full md:w-40 lg:w-48"
								>
									<option value="all">All doctors</option>
									{doctorOptions.map(option => (
										<option key={option} value={option}>
											{option}
										</option>
									))}
								</select>
							</div>
						</div>

						<div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end sm:gap-4 mt-4">
							<button type="button" onClick={handleExportCsv} className="btn-tertiary">
								<i className="fas fa-file-export text-xs" aria-hidden="true" />
								Export CSV
							</button>
							<button
								type="button"
								onClick={handleImportClick}
								className="inline-flex items-center gap-2 rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-sky-500 focus-visible:bg-sky-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600"
							>
								<i className="fas fa-file-import text-xs" aria-hidden="true" />
								Import CSV
							</button>
							<button
								type="button"
								onClick={handleBulkDeactivate}
								className="inline-flex items-center gap-2 rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-amber-400 focus-visible:bg-amber-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-600"
							>
								<i className="fas fa-user-slash text-xs" aria-hidden="true" />
								Bulk deactivate
							</button>
							<button
								type="button"
								onClick={openDialogForCreate}
								className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-500 focus-visible:bg-emerald-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600"
							>
								<i className="fas fa-user-plus text-xs" aria-hidden="true" />
								Add patient
							</button>
						</div>
				</section>

				<section className="mx-auto mt-8 max-w-6xl">
					<div className="section-card">
						{loading ? (
							<div className="py-12 text-center text-sm text-slate-500">
								<div className="loading-spinner h-10 w-10" aria-hidden="true" />
								<span className="ml-3 align-middle">Loading patients…</span>
							</div>
						) : filteredPatients.length === 0 ? (
							<div className="py-12 text-center text-sm text-slate-500">
								<p className="font-medium text-slate-700">No patients match your filters.</p>
								<p className="mt-1">Try adjusting the search or add a new profile to keep testing data fresh.</p>
							</div>
						) : (
							<div className="overflow-x-auto">
								<table className="min-w-full divide-y divide-slate-200 text-left text-sm text-slate-700">
									<thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
										<tr>
											<th className="px-4 py-3 font-semibold">
												<input
													type="checkbox"
													checked={selectedPatientIds.size === filteredPatients.length && filteredPatients.length > 0}
													onChange={handleSelectAll}
													className="rounded border-slate-300 text-sky-600 focus:ring-sky-500"
												/>
											</th>
											<th className="px-4 py-3 font-semibold">#</th>
											<th className="px-4 py-3 font-semibold">Patient ID</th>
											<th className="px-4 py-3 font-semibold">Name</th>
											<th className="px-4 py-3 font-semibold">Date of birth</th>
											<th className="px-4 py-3 font-semibold">Gender</th>
											<th className="px-4 py-3 font-semibold">Phone</th>
											<th className="px-4 py-3 font-semibold">Email</th>
											<th className="px-4 py-3 font-semibold">Status</th>
											<th className="px-4 py-3 font-semibold">Registered</th>
											<th className="px-4 py-3 font-semibold text-center">Actions</th>
										</tr>
									</thead>
									<tbody className="divide-y divide-slate-100">
										{filteredPatients.map(({ patient, index, id }, row) => (
											<tr key={`${patient.patientId}-${id}`}>
												<td className="px-4 py-4">
													<input
														type="checkbox"
														checked={selectedPatientIds.has(id)}
														onChange={() => handleToggleSelection(id)}
														className="rounded border-slate-300 text-sky-600 focus:ring-sky-500"
													/>
												</td>
												<td className="px-4 py-4 text-xs text-slate-500">{row + 1}</td>
												<td className="px-4 py-4 text-sm font-semibold text-slate-800">{patient.patientId || '—'}</td>
												<td className="px-4 py-4 text-sm text-slate-700">{patient.name || 'Unnamed patient'}</td>
												<td className="px-4 py-4 text-sm text-slate-600">{formatDate(patient.dob)}</td>
												<td className="px-4 py-4 text-sm text-slate-600">{patient.gender || '—'}</td>
												<td className="px-4 py-4 text-sm text-slate-600">{patient.phone || '—'}</td>
												<td className="px-4 py-4 text-sm text-slate-600">{patient.email || '—'}</td>
												<td className="px-4 py-4">
													<span
														className={[
															'badge-base px-3 py-1',
															patient.status === 'completed'
															? 'bg-emerald-100 text-emerald-700'
															: patient.status === 'ongoing'
																? 'bg-sky-100 text-sky-700'
																: patient.status === 'cancelled'
																	? 'bg-rose-100 text-rose-600'
																	: 'bg-amber-100 text-amber-700',
														].join(' ')}
													>
														{patient.status.charAt(0).toUpperCase() + patient.status.slice(1)}
													</span>
												</td>
												<td className="px-4 py-4 text-xs text-slate-500">{formatDateTime(patient.registeredAt)}</td>
												<td className="px-4 py-4 text-center">
													<div className="inline-flex items-center gap-2">
														<button
															type="button"
															onClick={() => setSelectedPatientId(id)}
															className="inline-flex items-center gap-2 rounded-full border border-sky-200 px-3 py-1 text-xs font-semibold text-sky-700 transition hover:border-sky-300 hover:text-sky-800 focus-visible:border-sky-300 focus-visible:text-sky-800 focus-visible:outline-none"
														>
															<i className="fas fa-user text-[10px]" aria-hidden="true" />
															View profile
														</button>
														<button
															type="button"
															onClick={() => openDialogForEdit(id)}
															className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600 transition hover:border-slate-300 hover:text-slate-800 focus-visible:border-slate-300 focus-visible:text-slate-800 focus-visible:outline-none"
														>
															<i className="fas fa-pen text-[10px]" aria-hidden="true" />
															Edit
														</button>
														<button
															type="button"
															onClick={() => handleDelete(id)}
															className="inline-flex items-center gap-2 rounded-full border border-rose-200 px-3 py-1 text-xs font-semibold text-rose-600 transition hover:border-rose-300 hover:text-rose-700 focus-visible:border-rose-300 focus-visible:text-rose-700 focus-visible:outline-none"
														>
															<i className="fas fa-trash text-[10px]" aria-hidden="true" />
															Delete
														</button>
													</div>
												</td>
											</tr>
										))}
									</tbody>
								</table>
							</div>
						)}
					</div>
				</section>

				{/* Selected patient profile modal */}
				{selectedPatient && (
					<div
						className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 px-4 py-6"
						onClick={closeProfile}
						role="dialog"
						aria-modal="true"
					>
						<div
							className="w-full max-w-4xl max-h-[85vh] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
							onClick={event => event.stopPropagation()}
						>
							<header className="flex items-center justify-between border-b border-slate-200 px-6 py-4 sticky top-0 bg-white z-10">
								<div>
									<h2 className="text-lg font-semibold text-slate-900">Patient profile</h2>
									<p className="text-xs text-slate-500">ID: {(selectedPatient as any).patientId || '—'}</p>
								</div>
								<button
									type="button"
									onClick={closeProfile}
									className="rounded-full p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 focus-visible:bg-slate-100 focus-visible:text-slate-600 focus-visible:outline-none"
									aria-label="Close profile"
								>
									<i className="fas fa-times" aria-hidden="true" />
								</button>
							</header>

							<div className="grid max-h-[calc(85vh-56px)] gap-4 overflow-y-auto px-6 py-6 lg:grid-cols-[1.2fr,0.8fr]">
								<section className="space-y-4">
									<div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
										<h3 className="text-sm font-semibold text-slate-800">Personal details</h3>
										<dl className="mt-3 grid gap-2 text-xs text-slate-600 sm:grid-cols-2">
											<div>
												<dt className="font-semibold text-slate-500">Name</dt>
												<dd>{selectedPatient.name || '—'}</dd>
											</div>
											<div>
												<dt className="font-semibold text-slate-500">Patient ID</dt>
												<dd>{selectedPatient.patientId || '—'}</dd>
											</div>
											<div>
												<dt className="font-semibold text-slate-500">Date of birth</dt>
												<dd>{formatDate(selectedPatient.dob)}</dd>
											</div>
											<div>
												<dt className="font-semibold text-slate-500">Gender</dt>
												<dd>{selectedPatient.gender || '—'}</dd>
											</div>
											<div>
												<dt className="font-semibold text-slate-500">Phone</dt>
												<dd>{selectedPatient.phone || '—'}</dd>
											</div>
											<div>
												<dt className="font-semibold text-slate-500">Email</dt>
												<dd>{selectedPatient.email || '—'}</dd>
											</div>
											<div className="sm:col-span-2">
												<dt className="font-semibold text-slate-500">Address</dt>
												<dd>{selectedPatient.address || '—'}</dd>
											</div>
										</dl>
									</div>

									{/* Notes & attachments */}
									<div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
										<h3 className="text-sm font-semibold text-slate-800">Notes & attachments</h3>
										{loadingExtras[selectedPatientId!] ? (
											<p className="mt-3 text-xs text-slate-500">Loading...</p>
										) : (
											<>
												{patientExtras[selectedPatientId!]?.notes.length > 0 && (
													<div className="mt-3 space-y-2">
														{patientExtras[selectedPatientId!].notes.map(note => (
															<div key={note.id} className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-xs text-slate-600">
																<p>{note.content}</p>
																<p className="mt-1 text-[10px] text-slate-400">{formatDateTime(note.createdAt)}</p>
															</div>
														))}
													</div>
												)}
												{patientExtras[selectedPatientId!]?.attachments.length > 0 && (
													<div className="mt-3 space-y-2">
														{patientExtras[selectedPatientId!].attachments.map(att => (
															<div key={att.id} className="flex items-center justify-between rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-xs text-slate-600">
																<span>
																	<i className="fas fa-paperclip mr-2" aria-hidden="true" />
																	{att.fileName} ({att.sizeLabel})
																</span>
																<span className="text-[10px] text-slate-400">{formatDate(att.createdAt)}</span>
															</div>
														))}
													</div>
												)}
												{(!patientExtras[selectedPatientId!] || 
													(patientExtras[selectedPatientId!].notes.length === 0 && 
													 patientExtras[selectedPatientId!].attachments.length === 0)) && (
													<p className="mt-3 rounded-lg border border-dashed border-slate-300 bg-slate-50 px-3 py-4 text-xs text-slate-500">
														No notes or attachments yet.
													</p>
												)}
												<div className="mt-3 flex flex-wrap gap-2">
													<button 
														type="button" 
														onClick={() => setIsAddingNote(!isAddingNote)} 
														className="btn-tertiary"
													>
														<i className="fas fa-sticky-note text-xs" aria-hidden="true" />
														Add note
													</button>
													<button 
														type="button" 
														onClick={() => fileInputRef.current?.click()} 
														className="btn-tertiary"
													>
														<i className="fas fa-paperclip text-xs" aria-hidden="true" />
														Upload attachment
													</button>
													<input
														ref={fileInputRef}
														type="file"
														className="hidden"
														onChange={handleUploadAttachment}
													/>
												</div>

												{isAddingNote && (
													<div className="mt-3 space-y-2">
														<textarea
															value={noteContent}
															onChange={e => setNoteContent(e.target.value)}
															placeholder="Enter note content..."
															className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-700 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-200"
															rows={3}
														/>
														<div className="flex gap-2">
															<button
																type="button"
																onClick={handleAddNote}
																disabled={isAddingNote && !noteContent.trim()}
																className="btn-primary text-xs"
															>
																Save
															</button>
															<button
																type="button"
																onClick={() => {
																	setIsAddingNote(false);
																	setNoteContent('');
																}}
																className="btn-secondary text-xs"
															>
																Cancel
															</button>
														</div>
													</div>
												)}
											</>
										)}
									</div>

									{/* History */}
									<div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
										<h3 className="text-sm font-semibold text-slate-800">History timeline</h3>
										{loadingExtras[selectedPatientId!] ? (
											<p className="mt-3 text-xs text-slate-500">Loading...</p>
										) : (
											<>
												{patientExtras[selectedPatientId!]?.history.length > 0 ? (
													<ul className="mt-3 space-y-2 text-xs text-slate-600">
														{patientExtras[selectedPatientId!].history
															.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
															.map(entry => (
																<li key={entry.id} className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2">
																	<i className="fas fa-clock mr-2 text-slate-400" aria-hidden="true" />
																	{entry.text}
																	<p className="mt-1 text-[10px] text-slate-400">{formatDateTime(entry.createdAt)}</p>
																</li>
															))}
													</ul>
												) : (
													<p className="mt-3 rounded-lg border border-dashed border-slate-300 bg-slate-50 px-3 py-4 text-xs text-slate-500">
														No history entries yet.
													</p>
												)}
												<button
													type="button"
													onClick={handleLogActivity}
													className="mt-3 inline-flex items-center rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600 transition hover:border-slate-300 hover:text-slate-800 focus-visible:border-slate-300 focus-visible:text-slate-800 focus-visible:outline-none"
												>
													<i className="fas fa-pen text-[10px]" aria-hidden="true" />
													Log activity
												</button>
											</>
										)}
									</div>
								</section>

								{/* Sidebar */}
								<aside className="space-y-4">
									<div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
										<h3 className="text-sm font-semibold text-slate-800">Session overview</h3>
										<p className="mt-2 text-xs text-slate-600">
											Summary cards and charts will appear here once appointments are connected.
										</p>
										<div className="mt-4 grid gap-3 text-center sm:grid-cols-2">
											<div className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
												<p className="text-[11px] font-semibold text-slate-500">Completed</p>
												<p className="mt-1 text-xl font-bold text-slate-900">—</p>
											</div>
											<div className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
												<p className="text-[11px] font-semibold text-slate-500">Upcoming</p>
												<p className="mt-1 text-xl font-bold text-slate-900">—</p>
											</div>
										</div>
									</div>

									<div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
										<h3 className="text-sm font-semibold text-slate-800">Quick actions</h3>
										<div className="mt-3 space-y-2">
											<button type="button" onClick={handleProfileAction('Schedule follow-up')} className="btn-tertiary w-full justify-start">
												<i className="fas fa-calendar-plus text-xs" aria-hidden="true" />
												Schedule follow-up
											</button>
											<button type="button" onClick={handleProfileAction('Share report')} className="btn-tertiary w-full justify-start">
												<i className="fas fa-share text-xs" aria-hidden="true" />
												Share report
											</button>
											<button type="button" onClick={handleProfileAction('Transfer patient')} className="btn-tertiary w-full justify-start">
												<i className="fas fa-exchange-alt text-xs" aria-hidden="true" />
												Transfer patient
											</button>
										</div>
									</div>
								</aside>
							</div>

							<footer className="flex justify-end gap-3 border-t border-slate-200 bg-white px-6 py-4 sticky bottom-0">
								<button
									type="button"
									onClick={closeProfile}
									className="inline-flex items-center rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition hover:border-slate-300 hover:text-slate-800"
								>
									Close
								</button>
							</footer>
						</div>
					</div>
				)}

				{/* Create / Edit dialog */}
				{isDialogOpen && (
					<div
						role="dialog"
						aria-modal="true"
						className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 px-4 py-6"
					>
						<div className="w-full max-w-2xl rounded-2xl border border-slate-200 bg-white shadow-2xl">
							<header className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
								<h2 className="text-lg font-semibold text-slate-900">
									{editingId !== null ? 'Edit Patient' : 'Add Patient'}
								</h2>
								<button
									type="button"
									onClick={closeDialog}
									className="rounded-full p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 focus-visible:bg-slate-100 focus-visible:text-slate-600 focus-visible:outline-none"
									aria-label="Close dialog"
								>
									<i className="fas fa-times" aria-hidden="true" />
								</button>
							</header>

							<form onSubmit={handleSubmit} className="grid gap-4 px-6 py-6 sm:grid-cols-2">
								<div>
									<label className="block text-sm font-medium text-slate-700">Patient ID *</label>
									<input
										type="text"
										value={formState.patientId}
										onChange={event =>
											setFormState(current => ({ ...current, patientId: event.target.value }))
										}
										className="input-base"
										required
									/>
								</div>
								<div>
									<label className="block text-sm font-medium text-slate-700">Full name *</label>
									<input
										type="text"
										value={formState.name}
										onChange={event =>
											setFormState(current => ({ ...current, name: event.target.value }))
										}
										className="input-base"
										required
									/>
								</div>
								<div>
									<label className="block text-sm font-medium text-slate-700">Date of birth</label>
									<input
										type="date"
										value={formState.dob}
										onChange={event =>
											setFormState(current => ({ ...current, dob: event.target.value }))
										}
										className="input-base"
									/>
								</div>
								<div>
									<label className="block text-sm font-medium text-slate-700">Gender</label>
									<select
										value={formState.gender}
										onChange={event =>
											setFormState(current => ({
												...current,
												gender: event.target.value as AdminGenderOption,
											}))
										}
										className="select-base"
									>
										{genderOptions.map(option => (
											<option key={option.value} value={option.value}>
												{option.label}
											</option>
										))}
									</select>
								</div>
								<div>
									<label className="block text-sm font-medium text-slate-700">Phone</label>
									<input
										type="tel"
										value={formState.phone}
										onChange={event =>
											setFormState(current => ({ ...current, phone: event.target.value }))
										}
										className="input-base"
									/>
								</div>
								<div>
									<label className="block text-sm font-medium text-slate-700">Email</label>
									<input
										type="email"
										value={formState.email}
										onChange={event =>
											setFormState(current => ({ ...current, email: event.target.value }))
										}
										className="input-base"
									/>
								</div>
								<div>
									<label className="block text-sm font-medium text-slate-700">Status</label>
									<select
										value={formState.status}
										onChange={event =>
											setFormState(current => ({ ...current, status: event.target.value as AdminPatientStatus }))
										}
										className="select-base"
									>
										{statusOptions.map(option => (
											<option key={option.value} value={option.value}>
												{option.label}
											</option>
										))}
									</select>
								</div>
								<div className="sm:col-span-2">
									<label className="block text-sm font-medium text-slate-700">Address</label>
									<input
										type="text"
										value={formState.address}
										onChange={event =>
											setFormState(current => ({ ...current, address: event.target.value }))
										}
										className="input-base"
									/>
								</div>
								<div className="sm:col-span-2">
									<label className="block text-sm font-medium text-slate-700">Medical complaint</label>
									<textarea
										value={formState.complaint}
										onChange={event =>
											setFormState(current => ({ ...current, complaint: event.target.value }))
										}
										className="textarea-base min-h-[96px]"
									/>
								</div>
								<footer className="sm:col-span-2 flex items-center justify-end gap-3 pt-2">
									<button type="button" onClick={closeDialog} className="btn-secondary">
										Cancel
									</button>
									<button type="submit" className="btn-primary">
										{editingId !== null ? 'Save changes' : 'Add patient'}
									</button>
								</footer>
							</form>
						</div>
					</div>
				)}

				{/* Import modal */}
				{isImportOpen && (
					<div
						className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 px-4 py-6"
						onClick={() => {
							setIsImportOpen(false);
							setImportFile(null);
							setImportPreview([]);
						}}
						role="dialog"
						aria-modal="true"
					>
						<div
							className="w-full max-w-4xl max-h-[85vh] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
							onClick={e => e.stopPropagation()}
						>
							<header className="flex items-center justify-between border-b border-slate-200 px-6 py-4 sticky top-0 bg-white z-10">
								<h2 className="text-lg font-semibold text-slate-900">Import Patients from CSV</h2>
								<button
									type="button"
									onClick={() => {
										setIsImportOpen(false);
										setImportFile(null);
										setImportPreview([]);
									}}
									className="rounded-full p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
									aria-label="Close"
								>
									<i className="fas fa-times" aria-hidden="true" />
								</button>
							</header>

							<div className="max-h-[calc(85vh-120px)] overflow-y-auto px-6 py-6">
								<div className="space-y-4">
									<div>
										<label className="block text-sm font-medium text-slate-700 mb-2">
											Select CSV file
										</label>
										<input
											type="file"
											accept=".csv,.xlsx,.xls"
											onChange={handleFileSelect}
											className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700"
										/>
										{/* helper text removed as requested */}
									</div>

									{importPreview.length > 0 && (
										<div>
											<h3 className="text-sm font-semibold text-slate-800 mb-2">
												Preview (first {importPreview.length} rows)
											</h3>
											<div className="overflow-x-auto rounded-lg border border-slate-200">
												<table className="min-w-full text-xs">
													<thead className="bg-slate-50">
														<tr>
															{Object.keys(importPreview[0] || {}).map(key => (
																<th key={key} className="px-3 py-2 text-left font-semibold text-slate-700">
																	{key}
																</th>
															))}
														</tr>
													</thead>
													<tbody className="divide-y divide-slate-100">
														{importPreview.slice(0, 10).map((row, idx) => (
															<tr key={idx}>
																{Object.values(row).map((val: any, i) => (
																	<td key={i} className="px-3 py-2 text-slate-600">
																		{String(val || '—')}
																	</td>
																))}
															</tr>
														))}
													</tbody>
												</table>
											</div>
										</div>
									)}
								</div>
							</div>

							<footer className="flex justify-end gap-3 border-t border-slate-200 bg-white px-6 py-4 sticky bottom-0">
								<button
									type="button"
									onClick={() => {
										setIsImportOpen(false);
										setImportFile(null);
										setImportPreview([]);
									}}
									className="btn-secondary"
								>
									Cancel
								</button>

								{/* Download template inside modal */}
								<button
									type="button"
									onClick={downloadTemplate}
									className="btn-secondary"
								>
									<i className="fas fa-download mr-2" />
									Download Template
								</button>

								<button
									type="button"
									onClick={handleImportConfirm}
									disabled={!importFile}
									className="btn-primary"
								>
									Import {importPreview.length > 0 ? `${importPreview.length} patients` : 'CSV'}
								</button>
							</footer>
						</div>
					</div>
				)}
			</div>
		</div>
	);
}
