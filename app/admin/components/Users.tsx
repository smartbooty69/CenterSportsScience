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

import { db } from '@/lib/firebase';
import PageHeader from '@/components/PageHeader';

type EmployeeRole = 'FrontDesk' | 'ClinicalTeam' | 'Admin';
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
	userRole: Extract<EmployeeRole, 'FrontDesk' | 'ClinicalTeam'>;
	userStatus: EmployeeStatus;
	password: string;
}

const ROLE_LABELS: Record<EmployeeRole, string> = {
	Admin: 'Admin',
	FrontDesk: 'Front Desk',
	ClinicalTeam: 'Clinical Team',
};

const ROLE_OPTIONS: Array<{ value: FormState['userRole']; label: string }> = [
	{ value: 'FrontDesk', label: 'Front Desk' },
	{ value: 'ClinicalTeam', label: 'Clinical Team (Physiotherapist & Strength Conditioning)' },
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
	const [employees, setEmployees] = useState<Employee[]>([]);
	const [loading, setLoading] = useState(true);
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [searchTerm, setSearchTerm] = useState('');

	const [isDialogOpen, setIsDialogOpen] = useState(false);
	const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
	const [formState, setFormState] = useState<FormState>(INITIAL_FORM);

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
					.filter(record => record.role === 'FrontDesk' || record.role === 'ClinicalTeam')
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
		if (!searchTerm.trim()) return employees;
		const query = searchTerm.trim().toLowerCase();
		return employees.filter(employee => {
			return (
				employee.userName.toLowerCase().includes(query) ||
				employee.userEmail.toLowerCase().includes(query) ||
				ROLE_LABELS[employee.role].toLowerCase().includes(query)
			);
		});
	}, [employees, searchTerm]);

	const openCreateDialog = () => {
		setEditingEmployee(null);
		setFormState(INITIAL_FORM);
		setIsDialogOpen(true);
		setError(null);
	};

	const openEditDialog = (employee: Employee) => {
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

		setSaving(true);
		try {
			if (editingEmployee) {
				await updateDoc(doc(db, 'staff', editingEmployee.id), {
					userName: trimmedName,
					role: formState.userRole,
					status: formState.userStatus,
				});
			} else {
				await addDoc(collection(db, 'staff'), {
					userName: trimmedName,
					userEmail: trimmedEmail,
					role: formState.userRole,
					status: formState.userStatus,
					createdAt: serverTimestamp(),
				});
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

	return (
		<div className="min-h-svh bg-slate-50 px-6 py-10">
			<div className="mx-auto max-w-6xl space-y-10">
				<PageHeader
					badge="Admin"
					title="Employee Management"
					description="Register and manage Front Desk and Clinical Team staff members."
				/>

				<div className="border-t border-slate-200" />

				<section className="rounded-2xl border-2 border-sky-600 bg-white px-6 py-6 shadow-[0_10px_35px_rgba(20,90,150,0.12)] sm:flex sm:items-center sm:justify-between sm:space-x-6">
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
									<th className="px-4 py-3 font-semibold text-right">Actions</th>
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
											<td className="px-4 py-4 text-right text-sm">
												<button
													type="button"
													onClick={() => openEditDialog(employee)}
													className="inline-flex items-center rounded-full border border-sky-200 px-3 py-1 text-xs font-semibold text-sky-700 transition hover:border-sky-400 hover:text-sky-800 focus-visible:border-sky-400 focus-visible:text-sky-800 focus-visible:outline-none"
												>
													<i className="fas fa-pen mr-1 text-[11px]" aria-hidden="true" />
													Edit
												</button>
												<button
													type="button"
													onClick={() => handleDelete(employee)}
													className="ml-2 inline-flex items-center rounded-full border border-rose-200 px-3 py-1 text-xs font-semibold text-rose-600 transition hover:border-rose-400 hover:text-rose-700 focus-visible:border-rose-400 focus-visible:text-rose-700 focus-visible:outline-none"
													disabled={saving}
												>
													<i className="fas fa-trash mr-1 text-[11px]" aria-hidden="true" />
													Delete
												</button>
											</td>
										</tr>
									))
								)}
							</tbody>
						</table>
					</div>
				)}
			</section>

			{isDialogOpen && (
				<div
					role="dialog"
					aria-modal="true"
					className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 px-4 py-6"
				>
					<div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl">
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
									/>
									<p className="mt-1 text-xs text-slate-500">
										The employee should change this password after first login.
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

