'use server';

import { NextRequest } from 'next/server';
import { authAdmin, dbAdmin } from '@/lib/firebaseAdmin';

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
		const action: string = String(body?.action || '').trim();
		const ids: string[] = Array.isArray(body?.ids) ? (body.ids as string[]) : [];
		if (!action || !ids.length) {
			return new Response(JSON.stringify({ status: 'error', message: 'action and ids required' }), { status: 400 });
		}

		if (action === 'deactivate') {
			const chunks: string[][] = [];
			for (let i = 0; i < ids.length; i += 300) chunks.push(ids.slice(i, i + 300));
			let updated = 0;
			for (const group of chunks) {
				const batch = dbAdmin.batch();
				group.forEach(id => {
					const ref = dbAdmin.collection('patients').doc(id);
					batch.set(ref, { status: 'cancelled' }, { merge: true });
				});
				await batch.commit();
				updated += group.length;
			}
			return new Response(JSON.stringify({ status: 'ok', updated }), { status: 200 });
		}

		if (action === 'merge') {
			// Simple merge: keep targetId, delete sourceIds, merge provided fields
			const targetId: string = String(body?.targetId || '').trim();
			const mergeFields: Record<string, unknown> = (body?.mergeFields as Record<string, unknown>) || {};
			if (!targetId) {
				return new Response(JSON.stringify({ status: 'error', message: 'targetId required for merge' }), {
					status: 400,
				});
			}
			const batch = dbAdmin.batch();
			const targetRef = dbAdmin.collection('patients').doc(targetId);
			batch.set(targetRef, mergeFields, { merge: true });
			const sourceIds = ids.filter(id => id !== targetId);
			sourceIds.forEach(id => {
				const ref = dbAdmin.collection('patients').doc(id);
				batch.delete(ref);
			});
			await batch.commit();
			return new Response(JSON.stringify({ status: 'ok', mergedInto: targetId, removed: sourceIds.length }), {
				status: 200,
			});
		}

		return new Response(JSON.stringify({ status: 'error', message: `Unsupported action: ${action}` }), {
			status: 400,
		});
	} catch (err: any) {
		console.error('POST /api/patients/bulk failed', err);
		return new Response(JSON.stringify({ status: 'error', message: err?.message || 'Bulk action failed' }), {
			status: 500,
		});
	}
}


