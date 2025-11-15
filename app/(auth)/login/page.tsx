'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';

export default function LoginPage() {
	const { user, loading } = useAuth();
	const router = useRouter();
	const [username, setUsername] = useState('');
	const [password, setPassword] = useState('');
	const [error, setError] = useState('');
	const [submitting, setSubmitting] = useState(false);

	// Redirect if already logged in
	useEffect(() => {
		if (loading) return; // Wait for auth to load

		if (user?.role) {
			const role = user.role.trim();
			// Redirect to appropriate dashboard based on role
			if (role === 'Admin') {
				router.push('/admin');
			} else if (role === 'FrontDesk') {
				router.push('/frontdesk');
			} else if (role === 'ClinicalTeam' || role === 'Physiotherapist' || role === 'StrengthAndConditioning') {
				router.push('/clinical-team');
			}
		}
	}, [user, loading, router]);

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		setError('');
		setSubmitting(true);

		// Basic validation
		if (!username.trim()) {
			setError('Please enter your email address.');
			setSubmitting(false);
			return;
		}

		if (!password.trim()) {
			setError('Please enter your password.');
			setSubmitting(false);
			return;
		}

		try {
			// Normalize email (trim whitespace and convert to lowercase)
			const email = username.trim().toLowerCase();
			// Trim password to remove any accidental whitespace
			const trimmedPassword = password.trim();
			
			// Validate email format
			const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
			if (!emailRegex.test(email)) {
				setError('Please enter a valid email address.');
				setSubmitting(false);
				return;
			}
			
			// Log in development mode only (for debugging)
			if (process.env.NODE_ENV === 'development') {
				console.log('Attempting login with email:', email);
			}
			
			const credential = await signInWithEmailAndPassword(auth, email, trimmedPassword);
			const user = credential.user;
			
			// Wait a bit for auth state to update
			await new Promise(resolve => setTimeout(resolve, 100));
			
			const profileSnap = await getDoc(doc(db, 'users', user.uid));

			if (!profileSnap.exists()) {
				setError('Your account is missing a profile. Contact an administrator.');
				await signOut(auth);
				setSubmitting(false);
				return;
			}

			const profile = profileSnap.data() as { role?: string; status?: string };
			if (profile.status && profile.status !== 'Active') {
				setError('Your account is inactive. Contact an administrator.');
				await signOut(auth);
				setSubmitting(false);
				return;
			}

			const role = profile.role?.trim() ?? '';
			if (!role) {
				setError('Your account does not have a role assigned.');
				await signOut(auth);
				setSubmitting(false);
				return;
			}

			// Navigate based on role
			if (role === 'Admin') {
				router.push('/admin');
				// Don't set submitting to false here - let navigation happen
				return;
			}

			if (role === 'ClinicalTeam' || role === 'Physiotherapist' || role === 'StrengthAndConditioning') {
				router.push('/clinical-team');
				return;
			}

			if (role === 'FrontDesk') {
				router.push('/frontdesk');
				return;
			}

			setError(`Unsupported role: ${role}. Contact an administrator.`);
			await signOut(auth);
			setSubmitting(false);
		} catch (err: any) {
			const code = err?.code || '';
			const message = err?.message || '';
			
			// Log detailed error in development mode only
			if (process.env.NODE_ENV === 'development') {
				// Safely serialize error for logging
				const errorDetails: any = {
					code,
					message,
					email: username.trim().toLowerCase(),
				};
				
				// Add error properties safely
				if (err) {
					if (err.code) errorDetails.code = err.code;
					if (err.message) errorDetails.message = err.message;
					if (err.stack) errorDetails.stack = err.stack;
					// Try to get string representation
					try {
						errorDetails.errorString = String(err);
						errorDetails.errorType = err.constructor?.name || typeof err;
					} catch (e) {
						errorDetails.errorString = '[Unable to stringify error]';
					}
				} else {
					errorDetails.error = 'Error object is null or undefined';
				}
				
				console.error('Login error details:', errorDetails);
				// Also log the raw error separately for debugging
				console.error('Raw error object:', err);
			}
			
			// Handle Firebase Auth errors with specific messages
			if (code === 'auth/invalid-credential') {
				setError('Invalid email or password. Please check your credentials and try again.');
			} else if (code === 'auth/user-not-found') {
				setError('No account found with this email address. Please check your email and try again.');
			} else if (code === 'auth/wrong-password') {
				setError('Incorrect password. Please try again or reset your password.');
			} else if (code === 'auth/invalid-email') {
				setError('Please enter a valid email address.');
			} else if (code === 'auth/user-disabled') {
				setError('This account has been disabled. Contact an administrator.');
			} else if (code === 'auth/too-many-requests') {
				setError('Too many failed login attempts. Please try again later.');
			} else if (code === 'auth/network-request-failed') {
				setError('Network error. Please check your connection and try again.');
			} else if (code === 'auth/weak-password') {
				setError('Password is too weak.');
			} else if (code === 'auth/operation-not-allowed') {
				setError('Email/password authentication is not enabled. Contact an administrator.');
			} else if (message.includes('Firebase')) {
				setError('Authentication service error. Please try again later.');
			} else {
				// Generic error message - don't expose internal error details to users
				setError('Sign-in failed. Please check your credentials and try again.');
			}
			setSubmitting(false);
		}
	};

	// Show loading state while checking authentication
	if (loading) {
		return (
			<div className="flex min-h-svh items-center justify-center bg-gray-50 px-4 py-10">
				<div className="text-center">
					<div className="mb-4 inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-gray-900 border-r-transparent"></div>
					<p className="text-sm text-gray-600">Loading...</p>
				</div>
			</div>
		);
	}

	// Don't show login form if already authenticated (will redirect)
	if (user?.role) {
		return null;
	}

	return (
		<div className="flex min-h-svh items-center justify-center bg-gray-50 px-4 py-10">
			<div className="w-full max-w-md">
				<div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
					<h2 className="mb-6 text-center text-xl font-semibold text-gray-900">Login</h2>
					<form onSubmit={handleSubmit} noValidate className="space-y-4">
						<div className="space-y-2">
							<label htmlFor="username" className="block text-sm font-medium text-gray-700">Email Address</label>
							<input
								id="username"
								type="email"
								autoComplete="email"
								className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 outline-none ring-0 transition placeholder:text-gray-400 focus:border-gray-400"
								value={username}
								onChange={e => setUsername(e.target.value)}
								placeholder="Enter your email"
								required
								disabled={submitting}
							/>
						</div>
						<div className="space-y-2">
							<label htmlFor="password" className="block text-sm font-medium text-gray-700">Password</label>
							<input
								id="password"
								type="password"
								autoComplete="current-password"
								className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 outline-none ring-0 transition placeholder:text-gray-400 focus:border-gray-400"
								value={password}
								onChange={e => setPassword(e.target.value)}
								placeholder="Enter your password"
								required
								disabled={submitting}
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

