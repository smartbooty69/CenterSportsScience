import { NextRequest, NextResponse } from 'next/server';
import { authAdmin, dbAdmin } from '@/lib/firebaseAdmin';

export async function POST(request: NextRequest) {
	try {
		const body = await request.json();
		const token = String(body?.token || '').trim();
		const newPassword = String(body?.password || '').trim();

		if (!token) {
			return NextResponse.json(
				{ error: 'Reset token is required' },
				{ status: 400 }
			);
		}

		if (!newPassword) {
			return NextResponse.json(
				{ error: 'New password is required' },
				{ status: 400 }
			);
		}

		// Validate password strength
		if (newPassword.length < 6) {
			return NextResponse.json(
				{ error: 'Password must be at least 6 characters long' },
				{ status: 400 }
			);
		}

		// Get reset token from Firestore
		const tokenDoc = await dbAdmin.collection('passwordResets').doc(token).get();

		if (!tokenDoc.exists) {
			return NextResponse.json(
				{ error: 'Invalid or expired reset token' },
				{ status: 400 }
			);
		}

		const tokenData = tokenDoc.data()!;

		// Check if token has been used
		if (tokenData.used) {
			return NextResponse.json(
				{ error: 'This reset link has already been used' },
				{ status: 400 }
			);
		}

		// Check if token has expired
		const expiresAt = tokenData.expiresAt.toDate();
		if (expiresAt < new Date()) {
			// Mark as used and delete expired token
			await dbAdmin.collection('passwordResets').doc(token).delete();
			return NextResponse.json(
				{ error: 'This reset link has expired. Please request a new one.' },
				{ status: 400 }
			);
		}

		// Update user password
		try {
			await authAdmin.updateUser(tokenData.uid, {
				password: newPassword,
			});
		} catch (error: any) {
			console.error('Failed to update password:', error);
			return NextResponse.json(
				{ error: 'Failed to update password. Please try again.' },
				{ status: 500 }
			);
		}

		// Mark token as used
		await dbAdmin.collection('passwordResets').doc(token).update({
			used: true,
			usedAt: new Date(),
		});

		// Delete the token document after successful use
		await dbAdmin.collection('passwordResets').doc(token).delete();

		return NextResponse.json({
			success: true,
			message: 'Password has been reset successfully'
		});
	} catch (error) {
		console.error('Password reset error:', error);
		return NextResponse.json(
			{ error: 'An error occurred while resetting your password' },
			{ status: 500 }
		);
	}
}

