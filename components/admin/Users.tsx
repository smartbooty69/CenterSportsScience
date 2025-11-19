'use client';

import { useEffect, useMemo, useState } from 'react';
import {
	addDoc,
	collection,
	deleteDoc,
	doc,
	onSnapshot,
	serverTimestamp,
	updateDoc,
} from 'firebase/firestore';

import { db, auth } from '@/lib/firebase';
import PageHeader from '@/components/PageHeader';
import { useAuth } from '@/contexts/AuthContext';

type EmployeeRole = 'FrontDesk' | 'ClinicalTeam' | 'Physiotherapist' | 'StrengthAndConditioning' | 'Admin';
type EmployeeStatus = 'Active' | 'Inactive';

interface Employee {
	id: string;
	userName: string;
	userEmail: string;
	role: EmployeeRole;
	status: EmployeeStatus;
	createdAt?: string | null;
}

interface FormState {
	userName: string;
	userEmail: string;
	userRole: Extract<EmployeeRole, 'FrontDesk' | 'ClinicalTeam' | 'Physiotherapist' | 'StrengthAndConditioning'>;
	userStatus: EmployeeStatus;
	password: string;
}

const ROLE_LABELS: Record<EmployeeRole, string> = {
	Admin: 'Admin',
	FrontDesk: 'Front Desk',
	ClinicalTeam: 'Clinical Team',
	Physiotherapist: 'Physiotherapist',
	StrengthAndConditioning: 'Strength & Conditioning',
};

const ROLE_OPTIONS: Array<{ value: FormState['userRole']; label: string }> = [
	{ value: 'FrontDesk', label: 'Front Desk' },
	{ value: 'ClinicalTeam', label: 'Clinical Team' },
	{ value: 'Physiotherapist', label: 'Physiotherapist' },
	{ value: 'StrengthAndConditioning', label: 'Strength & Conditioning' },
];

const INITIAL_FORM: FormState = {
	userName: '',
	userEmail: '',
	userRole: 'FrontDesk',
	userStatus: 'Active',
	password: '',
};

function formatDate(iso?: string | null) {
	if (!iso) return '—';
	try {
		return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(
			new Date(iso)
		);
	} catch {
		return '—';
	}
}

export default function Users() {
	const { user } = useAuth();
	const [employees, setEmployees] = useState<Employee[]>([]);
	const [loading, setLoading] = useState(true);
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [searchTerm, setSearchTerm] = useState('');
	const [roleFilter, setRoleFilter] = useState<'all' | EmployeeRole>('all');

	const [isDialogOpen, setIsDialogOpen] = useState(false);
	const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
	const [formState, setFormState] = useState<FormState>(INITIAL_FORM);
	const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
	const [activityDraft, setActivityDraft] = useState('');
	const [activityNotes, setActivityNotes] = useState<Record<
		string,
		Array<{ id: string; text: string; createdAt: Date }>
	>>({});

	useEffect(() => {
		setLoading(true);

		const unsubscribe = onSnapshot(
			collection(db, 'staff'),
			snapshot => {
				const records: Employee[] = snapshot.docs
					.map(docSnap => {
						const data = docSnap.data() as Record<string, unknown>;
						const created = (data.createdAt as { toDate?: () => Date } | undefined)?.toDate?.();
						return {
							id: docSnap.id,
							userName: String(data.userName ?? ''),
							userEmail: String(data.userEmail ?? ''),
							role: (data.role as EmployeeRole) ?? 'FrontDesk',
							status: (data.status as EmployeeStatus) ?? 'Active',
							createdAt: created
								? created.toISOString()
								: typeof data.createdAt === 'string'
									? (data.createdAt as string)
									: null,
						};
					})
					.filter(record => 
						record.role === 'FrontDesk' || 
						record.role === 'ClinicalTeam' || 
						record.role === 'Physiotherapist' || 
						record.role === 'StrengthAndConditioning'
					)
					.sort((a, b) => a.userName.localeCompare(b.userName));

				setEmployees(records);
				setLoading(false);
			},
			err => {
				console.error('Failed to load employees', err);
				setError('Unable to load employees. Please try again later.');
				setLoading(false);
			}
		);

		return () => unsubscribe();
	}, []);

	const filteredEmployees = useMemo(() => {
		const query = searchTerm.trim().toLowerCase();
		return employees.filter(employee => {
			const matchesSearch =
				!query ||
				employee.userName.toLowerCase().includes(query) ||
				employee.userEmail.toLowerCase().includes(query) ||
				ROLE_LABELS[employee.role].toLowerCase().includes(query);

			const matchesRole = roleFilter === 'all' || employee.role === roleFilter;

			return matchesSearch && matchesRole;
		});
	}, [employees, searchTerm, roleFilter]);

	const analytics = useMemo(() => {
		const total = employees.length;
		const active = employees.filter(emp => emp.status === 'Active').length;
		const inactive = total - active;
		const frontDesk = employees.filter(emp => emp.role === 'FrontDesk').length;
		const clinical = employees.filter(emp => emp.role === 'ClinicalTeam').length;
		const adminCount = employees.filter(emp => emp.role === 'Admin').length;

		return { total, active, inactive, frontDesk, clinical, adminCount };
	}, [employees]);

	const openCreateDialog = () => {
		setEditingEmployee(null);
		setFormState(INITIAL_FORM);
		setIsDialogOpen(true);
		setError(null);
	};

	const openEditDialog = (employee: Employee | null) => {
		if (!employee) return;
		setEditingEmployee(employee);
		setFormState({
			userName: employee.userName,
			userEmail: employee.userEmail,
			userRole: employee.role === 'Admin' ? 'FrontDesk' : (employee.role as FormState['userRole']),
			userStatus: employee.status,
			password: '',
		});
		setIsDialogOpen(true);
		setError(null);
	};

	const closeDialog = () => {
		if (saving) return;
		setIsDialogOpen(false);
		setEditingEmployee(null);
		setFormState(INITIAL_FORM);
		// Don't close the view profile when closing edit dialog
	};

	const handleDelete = async (employee: Employee) => {
		const confirmed = window.confirm(
			`Are you sure you want to remove ${employee.userName || employee.userEmail}?`
		);
		if (!confirmed) return;

		setSaving(true);
		setError(null);
		try {
			await deleteDoc(doc(db, 'staff', employee.id));
		} catch (err) {
			console.error('Failed to delete employee', err);
			setError('Unable to delete employee. Please try again.');
		} finally {
			setSaving(false);
		}
	};

	const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		setError(null);

		const trimmedName = formState.userName.trim();
		const trimmedEmail = formState.userEmail.trim().toLowerCase();
		const trimmedPassword = formState.password.trim();

		if (!trimmedName || !trimmedEmail) {
			setError('Name and email are required.');
			return;
		}

		if (!editingEmployee && !trimmedPassword) {
			setError('Password is required when creating a new employee.');
			return;
		}

		// Validate password length (Firebase requires at least 6 characters)
		if (!editingEmployee && trimmedPassword.length < 6) {
			setError('Password must be at least 6 characters long.');
			return;
		}

		setSaving(true);
		try {
			if (editingEmployee) {
				// Update existing employee
				await updateDoc(doc(db, 'staff', editingEmployee.id), {
					userName: trimmedName,
					role: formState.userRole,
					status: formState.userStatus,
				});
			} else {
				// Create new employee - need to create auth user and user profile first
				try {
					// Get admin token for API call - force refresh to ensure we have a valid token
					const token = await auth.currentUser?.getIdToken(true);
					if (!token) {
						throw new Error('Unable to get authentication token. Please log in again.');
					}

					// Create Firebase Authentication user and user profile via API
					const response = await fetch('/api/admin/users', {
						method: 'POST',
						headers: {
							'Content-Type': 'application/json',
							Authorization: `Bearer ${token}`,
						},
						body: JSON.stringify({
							email: trimmedEmail,
							password: trimmedPassword,
							displayName: trimmedName,
							role: formState.userRole,
							requestingUserRole: user?.role || 'Admin',
						}),
					});

					const result = await response.json();

					if (!response.ok) {
						// Check if user already exists
						if (result.message?.includes('already exists') || result.message?.includes('email')) {
							// User exists, continue to create staff record
							console.warn('User already exists in Firebase Auth, creating staff record only');
						} else {
							// Throw error with the specific message from the API
							const errorMessage = result.message || result.error || 'Failed to create user account';
							const apiError = new Error(errorMessage);
							(apiError as any).apiResponse = result;
							throw apiError;
						}
					}

					// Create staff record in Firestore
					await addDoc(collection(db, 'staff'), {
						userName: trimmedName,
						userEmail: trimmedEmail,
						role: formState.userRole,
						status: formState.userStatus,
						createdAt: serverTimestamp(),
					});
				} catch (apiError: any) {
					// If API fails (e.g., Admin SDK not configured), fall back to creating staff record only
					// and show a warning that user needs to be created manually
					console.warn('Failed to create auth user via API, creating staff record only:', apiError);
					
					// Extract the error message - check multiple possible locations
					const errorMessage = apiError?.message || 
						apiError?.apiResponse?.message || 
						apiError?.apiResponse?.error || 
						'Unknown error';
					
					// Still create the staff record
					await addDoc(collection(db, 'staff'), {
						userName: trimmedName,
						userEmail: trimmedEmail,
						role: formState.userRole,
						status: formState.userStatus,
						createdAt: serverTimestamp(),
					});

					// Show warning about manual user creation with specific error details
					const isConfigError = errorMessage.includes('Firebase Admin SDK') || 
						errorMessage.includes('FIREBASE_SERVICE_ACCOUNT') ||
						errorMessage.includes('GOOGLE_APPLICATION_CREDENTIALS') ||
						errorMessage.includes('configuration');
					
					const isNetworkError = errorMessage.includes('Network timeout') || 
						errorMessage.includes('ETIMEDOUT') ||
						errorMessage.includes('timeout') ||
						errorMessage.includes('Unable to connect');
					
					let userMessage = `Staff record created, but user account could not be created automatically. `;
					
					if (isNetworkError) {
						userMessage += `\n\n⚠️ Network Connectivity Issue:\n` +
							`Your server cannot connect to Google's servers to verify authentication tokens. ` +
							`This is likely due to:\n` +
							`- Network firewall blocking Google services\n` +
							`- IPv6 connectivity issues (common on Windows)\n` +
							`- Corporate network restrictions\n` +
							`- Proxy configuration needed\n\n` +
							`Solutions:\n` +
							`1. Check if you can access https://www.googleapis.com in a browser\n` +
							`2. Try using a VPN or different network\n` +
							`3. Configure proxy settings if on a corporate network\n` +
							`4. See FIREBASE_ADMIN_SETUP.md for detailed troubleshooting\n\n`;
					} else if (isConfigError) {
						userMessage += `\n\nConfiguration Issue: ${errorMessage}\n\n` +
							`Please set up Firebase Admin SDK credentials in your environment variables. ` +
							`See FIREBASE_ADMIN_SETUP.md for instructions.\n\n`;
					}
					
					userMessage += `📝 Manual User Creation Required:\n\n` +
						`1. Go to Firebase Console → Authentication → Users → "Add user"\n` +
						`   - Email: ${trimmedEmail}\n` +
						`   - Password: ${trimmedPassword}\n` +
						`   - Click "Add user" and copy the User UID\n\n` +
						`2. Go to Firestore Database → 'users' collection → "Add document"\n` +
						`   - Document ID: Paste the User UID from step 1\n` +
						`   - Add fields:\n` +
						`     • email: ${trimmedEmail}\n` +
						`     • displayName: ${trimmedName}\n` +
						`     • userName: ${trimmedName}\n` +
						`     • role: ${formState.userRole}\n` +
						`     • status: Active\n` +
						`   - Click "Save"\n\n` +
						`Error details: ${errorMessage}`;

					setError(userMessage);
					// Don't close dialog so user can see the error
					return;
				}
			}
			closeDialog();
		} catch (err) {
			console.error('Failed to save employee', err);
			setError(
				err instanceof Error
					? err.message
					: 'Unable to save employee. Please check the details and try again.'
			);
		} finally {
			setSaving(false);
		}
	};

	// Accept nullable since we call these with selectedEmployee which can be null
	const handleResetPassword = async (employee: Employee | null) => {
		if (!employee) return;
		// Create a temp password and show to admin — replace with API call to update in Auth if needed
		const tempPassword = Math.random().toString(36).slice(-8);
		alert(`Temporary password for ${employee.userEmail}: ${tempPassword}\n\n(Show this to the user and/or update the Auth account through your admin API.)`);
	};

	const handleSendResetEmail = async (employee: Employee | null) => {
		if (!employee) return;
		// Placeholder behavior: show an alert. Replace with real sendPasswordResetEmail(auth, email) call if you want.
		alert(`A password reset email would be sent to ${employee.userEmail} (placeholder).`);
	};

	const handleToggleStatus = async (employee: Employee) => {
		const nextStatus: EmployeeStatus = employee.status === 'Active' ? 'Inactive' : 'Active';
		try {
			await updateDoc(doc(db, 'staff', employee.id), { status: nextStatus });
			alert(`${employee.userName} is now ${nextStatus}.`);
		} catch (err) {
			console.error('Failed to toggle status', err);
			alert('Unable to update status. Please try again.');
		}
	};

	const handleAddActivity = () => {
		if (!selectedEmployee || !activityDraft.trim()) return;
		const entry = {
			id: typeof crypto !== 'undefined' && (crypto as any).randomUUID ? (crypto as any).randomUUID() : Math.random().toString(36).slice(2),
			text: activityDraft.trim(),
			createdAt: new Date(),
		};
		setActivityNotes(prev => ({
			...prev,
			[selectedEmployee.id]: [entry, ...(prev[selectedEmployee.id] ?? [])],
		}));
		setActivityDraft('');
	};

	const rolePresets: Record<
		EmployeeRole,
		Array<{ title: string; description: string; allowed: boolean }>
	> = {
		Admin: [
			{ title: 'Global settings', description: 'Manage platform-level configuration and teams', allowed: true },
			{ title: 'Billing dashboards', description: 'Approve billing cycles and refunds', allowed: true },
			{ title: 'Clinical data', description: 'Read/write all reports and assessments', allowed: true },
		],
		FrontDesk: [
			{ title: 'Patient check-in', description: 'Register new patients and create appointments', allowed: true },
			{ title: 'Billing dashboards', description: 'Create invoices and mark payments', allowed: true },
			{ title: 'Clinical data', description: 'Read-only access to assigned patients', allowed: false },
		],
		ClinicalTeam: [
			{ title: 'Clinical data', description: 'Create and edit treatment notes and reports', allowed: true },
			{ title: 'Availability management', description: 'Update consultation slots and coverage', allowed: true },
			{ title: 'Billing dashboards', description: 'Cannot edit billing entries', allowed: false },
		],
		Physiotherapist: [
			{ title: 'Clinical data', description: 'Create and edit physio treatment notes and reports', allowed: true },
			{ title: 'Availability management', description: 'Update consultation slots and coverage', allowed: true },
			{ title: 'Billing dashboards', description: 'Cannot edit billing entries', allowed: false },
		],
		StrengthAndConditioning: [
			{ title: 'Training plans', description: 'Create and edit S&C programs and notes', allowed: true },
			{ title: 'Availability management', description: 'Update session availability', allowed: true },
			{ title: 'Clinical data', description: 'Read-only access to assigned patients', allowed: false },
		],
	};

	return (
		<div className="min-h-svh bg-slate-50 px-6 py-10">
			<div className="mx-auto max-w-6xl space-y-10">
				<PageHeader
					badge="Admin"
					title="Employee Management"
					description="Register and manage Front Desk and Clinical Team staff members."
				/>

				<div className="border-t border-slate-200" />

				<section className="rounded-2xl border-2 border-sky-600 bg-white px-6 py-6 shadow-[0_10px_35px_rgba(20,90,150,0.12)] space-y-4">
					<div className="sm:flex sm:items-center sm:justify-between sm:space-x-6">
						<div>
							<h2 className="text-xl font-semibold text-sky-700">All Employees</h2>
							<p className="mt-1 text-sm text-sky-700/80">
								Search the directory or create a new employee profile.
							</p>
						</div>
						<div className="mt-4 flex flex-col items-center justify-end gap-3 sm:mt-0 sm:flex-row">
							<input
								type="search"
								value={searchTerm}
								onChange={event => setSearchTerm(event.target.value)}
								placeholder="Search employees…"
								className="w-full min-w-[220px] rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 transition focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-200 sm:w-auto"
							/>
							<button
								type="button"
								onClick={openCreateDialog}
								className="inline-flex items-center rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-md transition hover:bg-emerald-500 focus-visible:bg-emerald-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600"
							>
								<i className="fas fa-user-plus mr-2 text-sm" aria-hidden="true" />
								Add New Employee
							</button>
						</div>
					</div>
					<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
						<div>
							<label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">Filter by role</label>
							<select
								value={roleFilter}
								onChange={event => setRoleFilter(event.target.value as 'all' | EmployeeRole)}
								className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 transition focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-200"
							>
								<option value="all">All roles</option>
								<option value="FrontDesk">Front Desk</option>
								<option value="ClinicalTeam">Clinical Team</option>
								<option value="Admin">Admin</option>
							</select>
						</div>
					</div>
					<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
						<div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
							<p className="text-xs uppercase tracking-wide text-slate-500">Total staff</p>
							<p className="mt-2 text-2xl font-semibold text-slate-900">{analytics.total}</p>
						</div>
						<div className="rounded-xl border border-slate-200 bg-emerald-50 p-4">
							<p className="text-xs uppercase tracking-wide text-emerald-700">Active</p>
							<p className="mt-2 text-2xl font-semibold text-emerald-800">{analytics.active}</p>
						</div>
						<div className="rounded-xl border border-slate-200 bg-slate-100 p-4">
							<p className="text-xs uppercase tracking-wide text-slate-600">Inactive</p>
							<p className="mt-2 text-2xl font-semibold text-slate-800">{analytics.inactive}</p>
						</div>
						<div className="rounded-xl border border-slate-200 bg-sky-50 p-4">
							<p className="text-xs uppercase tracking-wide text-sky-700">Front desk</p>
							<p className="mt-2 text-2xl font-semibold text-sky-900">{analytics.frontDesk}</p>
						</div>
						<div className="rounded-xl border border-slate-200 bg-indigo-50 p-4">
							<p className="text-xs uppercase tracking-wide text-indigo-700">Clinical team</p>
							<p className="mt-2 text-2xl font-semibold text-indigo-900">{analytics.clinical}</p>
						</div>
					</div>
				</section>

			{error && (
				<div className="mx-auto mt-6 max-w-5xl rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
					{error}
				</div>
			)}

			<section className="mx-auto mt-8 max-w-6xl rounded-2xl bg-white p-6 shadow-[0_12px_28px_rgba(15,23,42,0.08)]">
				{loading ? (
					<div className="py-10 text-center text-sm text-slate-500">Loading employees…</div>
				) : (
					<div className="overflow-x-auto">
						<table className="min-w-full divide-y divide-slate-200 text-left text-sm text-slate-700">
							<thead className="bg-sky-50 text-xs uppercase tracking-wide text-sky-700">
								<tr>
									<th className="px-4 py-3 font-semibold">#</th>
									<th className="px-4 py-3 font-semibold">Name</th>
									<th className="px-4 py-3 font-semibold">Email/Login</th>
									<th className="px-4 py-3 font-semibold">Role</th>
									<th className="px-4 py-3 font-semibold">Status</th>
									<th className="px-4 py-3 font-semibold">Created</th>
									<th className="px-4 py-3 font-semibold text-center">Actions</th>
								</tr>
							</thead>
							<tbody className="divide-y divide-slate-100">
								{filteredEmployees.length === 0 ? (
									<tr>
										<td colSpan={7} className="px-4 py-8 text-center text-sm text-slate-500">
											No employees found. Adjust your search or add someone new.
										</td>
									</tr>
								) : (
									filteredEmployees.map((employee, index) => (
										<tr key={employee.id}>
											<td className="px-4 py-4 text-sm text-slate-500">{index + 1}</td>
											<td className="px-4 py-4 font-medium text-slate-800">{employee.userName}</td>
											<td className="px-4 py-4 text-slate-600">{employee.userEmail}</td>
											<td className="px-4 py-4">
												<span className="inline-flex items-center rounded-full bg-sky-100 px-3 py-1 text-xs font-semibold text-sky-700">
													<i className="fas fa-user-shield mr-1 text-[11px]" aria-hidden="true" />
													{ROLE_LABELS[employee.role]}
												</span>
											</td>
											<td className="px-4 py-4">
												<span
													className={[
														'inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold',
														employee.status === 'Active'
															? 'bg-emerald-100 text-emerald-700'
															: 'bg-slate-200 text-slate-600',
													].join(' ')}
												>
													{employee.status}
												</span>
											</td>
											<td className="px-4 py-4 text-sm text-slate-500">{formatDate(employee.createdAt)}</td>
											<td className="px-4 py-4 text-center text-sm">
												<div className="flex flex-wrap justify-center gap-2">
													{/* VIEW PROFILE */}
													<button
														type="button"
														onClick={() => setSelectedEmployee(employee)}
														className="inline-flex items-center rounded-full border border-sky-200 px-3 py-1 text-xs font-semibold text-sky-700 transition hover:border-sky-400 hover:text-sky-800 focus-visible:border-sky-400 focus-visible:text-sky-800 focus-visible:outline-none"
													>
														<i className="fas fa-id-badge mr-1 text-[11px]" aria-hidden="true" />
														View profile
													</button>

													{/* DELETE */}
													<button
														type="button"
														onClick={() => handleDelete(employee)}
														className="inline-flex items-center rounded-full border border-rose-200 px-3 py-1 text-xs font-semibold text-rose-600 transition hover:border-rose-400 hover:text-rose-700 focus-visible:border-rose-400 focus-visible:text-rose-700 focus-visible:outline-none"
														disabled={saving}
													>
														<i className="fas fa-trash mr-1 text-[11px]" aria-hidden="true" />
														Delete
													</button>
												</div>
											</td>
										</tr>
									))
								)}
							</tbody>
						</table>
					</div>
				)}
			</section>

			{selectedEmployee && (
				<div
					className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 px-4 py-6"
					onClick={() => setSelectedEmployee(null)}
					role="dialog"
					aria-modal="true"
				>
					<div
						className="w-full max-w-3xl max-h-[90vh] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
						onClick={event => event.stopPropagation()}
					>
						<header className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
							<div>
								<h3 className="text-lg font-semibold text-slate-900">{selectedEmployee.userName}</h3>
								<p className="text-xs text-slate-500">{selectedEmployee.userEmail}</p>
							</div>
							<button
								type="button"
								onClick={() => setSelectedEmployee(null)}
								className="rounded-full p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
								aria-label="Close profile"
							>
								<i className="fas fa-times" aria-hidden="true" />
							</button>
						</header>

						<div className="grid max-h-[calc(90vh-56px)] gap-4 overflow-y-auto px-6 py-6 lg:grid-cols-[1.2fr,0.8fr]">
							<section className="space-y-4">
								<div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
									<h4 className="text-sm font-semibold text-slate-800">Profile overview</h4>
									<dl className="mt-3 grid gap-2 text-xs text-slate-600 sm:grid-cols-2">
										<div>
											<dt className="font-semibold text-slate-500">Role</dt>
											<dd>{ROLE_LABELS[selectedEmployee.role]}</dd>
										</div>
										<div>
											<dt className="font-semibold text-slate-500">Status</dt>
											<dd>{selectedEmployee.status}</dd>
										</div>
										<div>
											<dt className="font-semibold text-slate-500">Joined</dt>
											<dd>{formatDate(selectedEmployee.createdAt)}</dd>
										</div>
										<div>
											<dt className="font-semibold text-slate-500">Permissions</dt>
											<dd>Preset: {ROLE_LABELS[selectedEmployee.role]} defaults</dd>
										</div>
									</dl>
								</div>

								<div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
									<h4 className="text-sm font-semibold text-slate-800">Role permissions</h4>
									<ul className="mt-3 space-y-2 text-xs">
										{(rolePresets[selectedEmployee.role] ?? []).map(permission => (
											<li
												key={permission.title}
												className="flex items-start gap-3 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2"
											>
												<span
													className={`mt-0.5 inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-semibold ${
														permission.allowed
															? 'bg-emerald-100 text-emerald-700'
															: 'bg-slate-200 text-slate-500'
													}`}
												>
													{permission.allowed ? <i className="fas fa-check" /> : <i className="fas fa-minus" />}
												</span>
												<div>
													<p className="font-semibold text-slate-700">{permission.title}</p>
													<p className="text-slate-500">{permission.description}</p>
												</div>
											</li>
										))}
									</ul>
								</div>

								<div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
									<h4 className="text-sm font-semibold text-slate-800">Activity log</h4>
									{(activityNotes[selectedEmployee.id]?.length ?? 0) === 0 ? (
										<p className="mt-3 text-xs text-slate-500">No activity notes yet.</p>
									) : (
										<ul className="mt-3 space-y-2 text-xs text-slate-600">
											{activityNotes[selectedEmployee.id]?.map(entry => (
												<li key={entry.id} className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2">
													{entry.text}
													<p className="text-[10px] text-slate-400">{entry.createdAt.toLocaleString()}</p>
												</li>
											))}
										</ul>
									)}
									<div className="mt-3 space-y-2">
										<textarea
											value={activityDraft}
											onChange={event => setActivityDraft(event.target.value)}
											placeholder="Add internal note..."
											className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-700 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-200"
											rows={3}
										/>
										<div className="flex justify-end">
											<button type="button" onClick={handleAddActivity} className="btn-primary text-xs">
												Log activity
											</button>
										</div>
									</div>
								</div>
							</section>

							<aside className="space-y-4">
								<div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
									<h4 className="text-sm font-semibold text-slate-800">Quick actions</h4>
									<div className="mt-3 space-y-2 text-xs">
										{/* Send reset email (placeholder) */}
										<button
											type="button"
											onClick={() => handleSendResetEmail(selectedEmployee)}
											className="btn-tertiary w-full justify-start"
										>
											<i className="fas fa-envelope text-xs" aria-hidden="true" />
											Send reset email
										</button>

										{/* Reset password (temporary password generator / placeholder) */}
										<button
											type="button"
											onClick={() => handleResetPassword(selectedEmployee)}
											className="btn-tertiary w-full justify-start"
										>
											<i className="fas fa-key text-xs" aria-hidden="true" />
											Reset password
										</button>

										{/* Toggle status & edit remain available in modal */}
										<button
											type="button"
											onClick={() => handleToggleStatus(selectedEmployee)}
											className="btn-tertiary w-full justify-start"
										>
											<i className="fas fa-power-off text-xs" aria-hidden="true" />
											{selectedEmployee.status === 'Active' ? 'Deactivate user' : 'Activate user'}
										</button>
										<button
											type="button"
											onClick={() => {
												openEditDialog(selectedEmployee);
											}}
											className="btn-tertiary w-full justify-start"
										>
											<i className="fas fa-edit text-xs" aria-hidden="true" />
											Edit details
										</button>
									</div>
								</div>
								<div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
									<h4 className="text-sm font-semibold text-slate-800">Summary</h4>
									<ul className="mt-3 space-y-1 text-xs text-slate-600">
										<li className="flex items-center justify-between">
											<span>Role</span>
											<span className="font-semibold">{ROLE_LABELS[selectedEmployee.role]}</span>
										</li>
										<li className="flex items-center justify-between">
											<span>Status</span>
											<span className="font-semibold">{selectedEmployee.status}</span>
										</li>
										<li className="flex items-center justify-between">
											<span>Created</span>
											<span className="font-semibold">{formatDate(selectedEmployee.createdAt)}</span>
										</li>
									</ul>
								</div>
							</aside>
						</div>
					</div>
				</div>
			)}

			{isDialogOpen && (
				<div
					role="dialog"
					aria-modal="true"
					className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/60 px-4 py-6"
					onClick={closeDialog}
				>
					<div 
						className="w-full max-w-lg rounded-2xl bg-white shadow-2xl"
						onClick={event => event.stopPropagation()}
					>
						<header className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
							<h2 className="text-lg font-semibold text-slate-900">
								{editingEmployee ? 'Edit Employee' : 'Add Employee'}
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
						<form onSubmit={handleSubmit} className="space-y-4 px-6 py-6">
							<div>
								<label className="block text-sm font-medium text-slate-700">Full Name</label>
								<input
									type="text"
									value={formState.userName}
									onChange={event => setFormState(current => ({ ...current, userName: event.target.value }))}
									className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-800 transition focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-200"
									required
								/>
							</div>
							<div>
								<label className="block text-sm font-medium text-slate-700">Email (Login)</label>
								<input
									type="email"
									value={formState.userEmail}
									onChange={event => setFormState(current => ({ ...current, userEmail: event.target.value }))}
									disabled={Boolean(editingEmployee)}
									className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-800 transition focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-200 disabled:cursor-not-allowed disabled:bg-slate-100"
									required
								/>
							</div>
							{!editingEmployee && (
								<div>
									<label className="block text-sm font-medium text-slate-700">Temporary Password</label>
									<input
										type="password"
										value={formState.password}
										onChange={event => setFormState(current => ({ ...current, password: event.target.value }))}
										className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-800 transition focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-200"
										required
										minLength={6}
									/>
									<p className="mt-1 text-xs text-slate-500">
										Must be at least 6 characters. The employee should change this password after first login.
									</p>
								</div>
							)}
							<div>
								<label className="block text-sm font-medium text-slate-700">Role</label>
								<select
									value={formState.userRole}
									onChange={event =>
										setFormState(current => ({
											...current,
											userRole: event.target.value as FormState['userRole'],
										}))
									}
									className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-800 transition focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-200"
									required
								>
									{ROLE_OPTIONS.map(option => (
										<option key={option.value} value={option.value}>
											{option.label}
										</option>
									))}
								</select>
							</div>
							<div>
								<label className="block text-sm font-medium text-slate-700">Status</label>
								<select
									value={formState.userStatus}
									onChange={event =>
										setFormState(current => ({
											...current,
											userStatus: event.target.value as EmployeeStatus,
										}))
									}
									className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-800 transition focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-200"
									required
								>
									<option value="Active">Active</option>
									<option value="Inactive">Inactive</option>
								</select>
							</div>
							<footer className="flex items-center justify-end gap-3 pt-2">
								<button
									type="button"
									onClick={closeDialog}
									disabled={saving}
									className="inline-flex items-center rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition hover:border-slate-300 hover:text-slate-800 focus-visible:border-slate-300 focus-visible:text-slate-800 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-70"
								>
									Cancel
								</button>
								<button
									type="submit"
									disabled={saving}
									className="inline-flex items-center rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sky-500 focus-visible:bg-sky-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600 disabled:cursor-not-allowed disabled:opacity-70"
								>
									{saving ? 'Saving…' : 'Save Employee'}
								</button>
							</footer>
						</form>
					</div>
				</div>
			)}
			</div>
		</div>
	);
}
