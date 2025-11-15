'use server';

import { NextRequest } from 'next/server';
import { authAdmin } from '@/lib/firebaseAdmin';

function randomPassword(length = 10) {
	const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
	let out = '';
	for (let i = 0; i < length; i++) {
		out += chars[Math.floor(Math.random() * chars.length)];
	}
	return out;
}

async function requireAdmin(request: NextRequest) {
	const auth = request.headers.get('authorization') || request.headers.get('Authorization');
	if (!auth || !auth.startsWith('Bearer ')) {
		return { ok: false, status: 401, message: 'Missing Authorization header' as const };
	}
	const token = auth.slice('Bearer '.length).trim();
	try {
		const decoded = await authAdmin.verifyIdToken(token);
		let role = (decoded as any).role || (decoded as any).claims?.role;
		
		// If role not in token claims, check Firestore profile
		if (!role || (role !== 'Admin' && role !== 'admin')) {
			try {
				const userDoc = await dbAdmin.collection('users').doc(decoded.uid).get();
				if (userDoc.exists) {
					const userData = userDoc.data();
					role = userData?.role;
				}
			} catch (firestoreError) {
				console.error('Failed to check Firestore for role', firestoreError);
			}
		}
		
		// Check for 'Admin' (capitalized) to match the app's role naming convention
		if (role !== 'Admin' && role !== 'admin') {
			return { ok: false, status: 403, message: 'Forbidden: admin role required' as const };
		}
		return { ok: true as const, uid: decoded.uid };
	} catch (err) {
		console.error('verifyIdToken failed', err);
	 return { ok: false, status: 401, message: 'Invalid token' as const };
	}
}

export async function POST(request: NextRequest) {
	const gate = await requireAdmin(request);
	if (!gate.ok) {
		return new Response(JSON.stringify({ status: 'error', message: gate.message }), { status: gate.status });
	}
	try {
		const body = await request.json();
		const uid: string = String(body?.uid || '').trim();
		if (!uid) {
			return new Response(JSON.stringify({ status: 'error', message: 'uid required' }), { status: 400 });
		}
		const tempPwd = randomPassword(12);
		await authAdmin.updateUser(uid, { password: tempPwd });
		// TODO: send email to user with reset instructions
		return new Response(JSON.stringify({ status: 'ok', uid, tempPwd }), { status: 200 });
	} catch (err: any) {
		console.error('POST /api/admin/users/reset-password failed', err);
		return new Response(JSON.stringify({ status: 'error', message: err?.message || 'Failed to reset password' }), {
			status: 500,
		});
	}
}


