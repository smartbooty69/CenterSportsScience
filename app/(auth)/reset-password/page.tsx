'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';

function ResetPasswordForm() {
	const searchParams = useSearchParams();
	const router = useRouter();
	const token = searchParams.get('token');

	const [password, setPassword] = useState('');
	const [confirmPassword, setConfirmPassword] = useState('');
	const [error, setError] = useState<string | null>(null);
	const [success, setSuccess] = useState<string | null>(null);
	const [submitting, setSubmitting] = useState(false);
	const [validating, setValidating] = useState(true);
	const [tokenValid, setTokenValid] = useState(false);

	useEffect(() => {
		if (!token) {
			setError('No reset token provided. Please use the link from your email.');
			setValidating(false);
			return;
		}
		// Token validation will happen on submit, so we can proceed
		setTokenValid(true);
		setValidating(false);
	}, [token]);

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		setError(null);
		setSuccess(null);

		if (!token) {
			setError('No reset token provided. Please use the link from your email.');
			return;
		}

		if (!password.trim()) {
			setError('Please enter a new password.');
			return;
		}

		if (password.length < 6) {
			setError('Password must be at least 6 characters long.');
			return;
		}

		if (password !== confirmPassword) {
			setError('Passwords do not match.');
			return;
		}

		setSubmitting(true);
		try {
			const response = await fetch('/api/auth/reset-password', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({
					token,
					password: password.trim(),
				}),
			});

			const data = await response.json();

			if (!response.ok) {
				setError(data.error || 'Failed to reset password. Please try again.');
			} else {
				setSuccess('Password has been reset successfully! Redirecting to login...');
				// Redirect to login after 2 seconds
				setTimeout(() => {
					router.push('/login');
				}, 2000);
			}
		} catch (err: any) {
			console.error('Password reset error:', err);
			setError('Network error. Please try again.');
		} finally {
			setSubmitting(false);
		}
	};

	if (validating) {
		return (
			<div className="flex min-h-svh items-center justify-center bg-gray-50 px-4 py-10">
				<div className="w-full max-w-md">
					<div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
						<p className="text-center text-gray-600">Validating reset token...</p>
					</div>
				</div>
			</div>
		);
	}

	if (!token || !tokenValid) {
		return (
			<div className="flex min-h-svh items-center justify-center bg-gray-50 px-4 py-10">
				<div className="w-full max-w-md">
					<div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
						<h2 className="mb-4 text-center text-xl font-semibold text-gray-900">Invalid Reset Link</h2>
						{error && (
							<div className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
								{error}
							</div>
						)}
						<p className="mb-4 text-center text-sm text-gray-600">
							This reset link is invalid or has expired. Please request a new password reset link.
						</p>
						<div className="text-center">
							<Link href="/forgot-password" className="text-sm text-gray-600 hover:text-gray-900">
								Request new reset link
							</Link>
						</div>
					</div>
				</div>
			</div>
		);
	}

	return (
		<div className="flex min-h-svh items-center justify-center bg-gray-50 px-4 py-10">
			<div className="w-full max-w-md">
				<div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
					<h2 className="mb-6 text-center text-xl font-semibold text-gray-900">Reset Your Password</h2>
					<form onSubmit={handleSubmit} noValidate className="space-y-4">
						<div className="space-y-2">
							<label htmlFor="password" className="block text-sm font-medium text-gray-700">
								New Password
							</label>
							<input
								id="password"
								type="password"
								autoComplete="new-password"
								className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 outline-none ring-0 transition placeholder:text-gray-400 focus:border-gray-400"
								value={password}
								onChange={e => setPassword(e.target.value)}
								placeholder="Enter your new password"
								required
								disabled={submitting}
								minLength={6}
							/>
							<p className="text-xs text-gray-500">Password must be at least 6 characters long.</p>
						</div>
						<div className="space-y-2">
							<label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700">
								Confirm Password
							</label>
							<input
								id="confirmPassword"
								type="password"
								autoComplete="new-password"
								className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 outline-none ring-0 transition placeholder:text-gray-400 focus:border-gray-400"
								value={confirmPassword}
								onChange={e => setConfirmPassword(e.target.value)}
								placeholder="Confirm your new password"
								required
								disabled={submitting}
								minLength={6}
							/>
						</div>
						{error && (
							<div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
								{error}
							</div>
						)}
						{success && (
							<div className="rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700" role="status">
								{success}
							</div>
						)}
						<button
							type="submit"
							className="inline-flex w-full items-center justify-center rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-70"
							disabled={submitting}
						>
							{submitting ? 'Resetting...' : 'Reset Password'}
						</button>
					</form>
					<div className="mt-4 text-center">
						<Link href="/login" className="text-sm text-gray-600 hover:text-gray-900">Back to login</Link>
					</div>
				</div>
			</div>
		</div>
	);
}

export default function ResetPasswordPage() {
	return (
		<Suspense fallback={
			<div className="flex min-h-svh items-center justify-center bg-gray-50 px-4 py-10">
				<div className="w-full max-w-md">
					<div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
						<p className="text-center text-gray-600">Loading...</p>
					</div>
				</div>
			</div>
		}>
			<ResetPasswordForm />
		</Suspense>
	);
}

