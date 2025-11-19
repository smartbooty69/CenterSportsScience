import { NextRequest, NextResponse } from 'next/server';
import { authAdmin, dbAdmin } from '@/lib/firebaseAdmin';
import { sendEmailNotification } from '@/lib/email';
import { randomBytes } from 'crypto';

export async function POST(request: NextRequest) {
	try {
		let body;
		try {
			body = await request.json();
		} catch (jsonError) {
			console.error('Invalid JSON in request:', jsonError);
			return NextResponse.json(
				{ error: 'Invalid request format' },
				{ status: 400 }
			);
		}

		const email = String(body?.email || '').trim().toLowerCase();

		if (!email) {
			return NextResponse.json(
				{ error: 'Email is required' },
				{ status: 400 }
			);
		}

		// Validate email format
		const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
		if (!emailRegex.test(email)) {
			return NextResponse.json(
				{ error: 'Invalid email address' },
				{ status: 400 }
			);
		}

		// Check if user exists in Firebase Auth
		let userRecord;
		try {
			userRecord = await authAdmin.getUserByEmail(email);
		} catch (error: any) {
			// User doesn't exist - don't reveal this for security
			// Return success anyway to prevent email enumeration
			return NextResponse.json({
				success: true,
				message: 'If an account exists for that email, a reset link has been sent.'
			});
		}

		// Get user profile from Firestore for display name
		let userName = 'User';
		try {
			const userDoc = await dbAdmin.collection('users').doc(userRecord.uid).get();
			if (userDoc.exists) {
				const userData = userDoc.data();
				userName = userData?.displayName || userData?.userName || 'User';
			}
		} catch (error) {
			// Continue with default name if Firestore lookup fails
			console.warn('Could not fetch user profile:', error);
		}

		// Generate secure reset token
		const resetToken = randomBytes(32).toString('hex');
		const expiresAt = new Date();
		expiresAt.setHours(expiresAt.getHours() + 1); // Token expires in 1 hour

		// Store token in Firestore
		await dbAdmin.collection('passwordResets').doc(resetToken).set({
			uid: userRecord.uid,
			email: email,
			expiresAt: expiresAt,
			createdAt: new Date(),
			used: false,
		});

		// Generate reset link
		const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 
			(process.env.NODE_ENV === 'production' 
				? 'https://yourdomain.com' 
				: 'http://localhost:3000');
		const resetLink = `${baseUrl}/reset-password?token=${resetToken}`;

		// Send email via Resend
		const emailResult = await sendEmailNotification({
			to: email,
			template: 'password-reset',
			subject: 'Reset Your Password - Centre For Sports Science',
			data: {
				userName,
				userEmail: email,
				resetLink,
			},
		});

		if (!emailResult.success) {
			console.error('Failed to send password reset email:', emailResult.error);
			// Still return success to prevent email enumeration
			return NextResponse.json({
				success: true,
				message: 'If an account exists for that email, a reset link has been sent.'
			});
		}

		return NextResponse.json({
			success: true,
			message: 'If an account exists for that email, a reset link has been sent.'
		});
	} catch (error) {
		console.error('Password reset request error:', error);
		// Return success to prevent email enumeration
		return NextResponse.json({
			success: true,
			message: 'If an account exists for that email, a reset link has been sent.'
		});
	}
}

