'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';

export default function LoginPage() {
	const router = useRouter();
	const [username, setUsername] = useState('');
	const [password, setPassword] = useState('');
	const [error, setError] = useState('');
	const [submitting, setSubmitting] = useState(false);

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		setError('');
		setSubmitting(true);
		try {
			const credential = await signInWithEmailAndPassword(auth, username, password);
			const user = credential.user;
			const profileSnap = await getDoc(doc(db, 'users', user.uid));

			if (!profileSnap.exists()) {
				setError('Your account is missing a profile. Contact an administrator.');
				await signOut(auth);
				return;
			}

			const profile = profileSnap.data() as { role?: string; status?: string };
			if (profile.status && profile.status !== 'Active') {
				setError('Your account is inactive. Contact an administrator.');
				await signOut(auth);
				return;
			}

			const role = profile.role?.trim() ?? '';
			if (!role) {
				setError('Your account does not have a role assigned.');
				await signOut(auth);
				return;
			}

			if (role === 'Admin') {
				router.push('/admin/dashboard');
				return;
			}

			if (role === 'ClinicalTeam' || role === 'Physiotherapist' || role === 'StrengthAndConditioning') {
				router.push('/clinical-team/dashboard');
				return;
			}

			if (role === 'FrontDesk') {
				router.push('/frontdesk/dashboard');
				return;
			}

			setError(`Unsupported role: ${role}. Contact an administrator.`);
			await signOut(auth);
			return;
		} catch (err: any) {
			const code = err?.code || '';
			if (code === 'auth/invalid-credential' || code === 'auth/invalid-email' || code === 'auth/wrong-password') {
				setError('Invalid email or password.');
			} else if (code === 'auth/user-disabled') {
				setError('This user is disabled.');
			} else if (code === 'auth/too-many-requests') {
				setError('Too many attempts. Try again later.');
			} else {
				setError('Sign-in failed. Please try again.');
			}
		} finally {
			setSubmitting(false);
		}
	};

	return (
		<div className="flex min-h-svh items-center justify-center bg-gray-50 px-4 py-10">
			<div className="w-full max-w-md">
				<div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
					<h2 className="mb-6 text-center text-xl font-semibold text-gray-900">Login</h2>
					<form onSubmit={handleSubmit} noValidate className="space-y-4">
						<div className="space-y-2">
							<label htmlFor="username" className="block text-sm font-medium text-gray-700">Username (Email/Login)</label>
							<input
								id="username"
								type="text"
								className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 outline-none ring-0 transition placeholder:text-gray-400 focus:border-gray-400"
								value={username}
								onChange={e => setUsername(e.target.value)}
								required
							/>
						</div>
						<div className="space-y-2">
							<label htmlFor="password" className="block text-sm font-medium text-gray-700">Password</label>
							<input
								id="password"
								type="password"
								className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 outline-none ring-0 transition placeholder:text-gray-400 focus:border-gray-400"
								value={password}
								onChange={e => setPassword(e.target.value)}
								required
							/>
						</div>
						{error && (
							<div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
								{error}
							</div>
						)}
						<button
							type="submit"
							className="inline-flex w-full items-center justify-center rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-70"
							disabled={submitting}
						>
							{submitting ? 'Signing in...' : 'Login'}
						</button>
					</form>
				</div>
			</div>
		</div>
	);
}

