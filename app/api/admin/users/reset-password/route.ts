'use server';

import { NextRequest } from 'next/server';
import { authAdmin } from '@/lib/firebaseAdmin';
import { requireRole } from '@/lib/authz';
import { logAudit } from '@/lib/audit';

function randomPassword(length = 10) {
	const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
	let out = '';
	for (let i = 0; i < length; i++) {
		out += chars[Math.floor(Math.random() * chars.length)];
	}
	return out;
}

export async function POST(request: NextRequest) {
	const gate = await requireRole(request, ['Admin']);
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

		// audit
		await logAudit({
			action: 'user-reset-password',
			userId: (gate as any).uid,
			resourceType: 'user',
			resourceId: uid,
			metadata: { method: 'temp-password' },
		});

		return new Response(JSON.stringify({ status: 'ok', uid, tempPwd }), { status: 200 });
	} catch (err: any) {
		console.error('POST /api/admin/users/reset-password failed', err);
		return new Response(JSON.stringify({ status: 'error', message: err?.message || 'Failed to reset password' }), {
			status: 500,
		});
	}
}


