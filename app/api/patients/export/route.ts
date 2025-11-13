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
		const role = (decoded as any).role || (decoded as any).claims?.role;
		if (role !== 'admin') {
			return { ok: false, status: 403, message: 'Forbidden: admin role required' as const };
		}
		return { ok: true as const, uid: decoded.uid };
	} catch (err) {
		console.error('verifyIdToken failed', err);
		return { ok: false, status: 401, message: 'Invalid token' as const };
	}
}

function toCsv(rows: Record<string, unknown>[]): string {
	if (!rows.length) return '';
	const headers = Object.keys(rows[0]);
	const escape = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
	const lines = [headers.join(',')];
	for (const row of rows) {
		lines.push(headers.map(h => escape(row[h])).join(','));
	}
	return lines.join('\n');
}

export async function GET(request: NextRequest) {
	const gate = await requireAdmin(request);
	if (!gate.ok) {
		return new Response(JSON.stringify({ status: 'error', message: gate.message }), { status: gate.status });
	}
	try {
		const { searchParams } = new URL(request.url);
		const limitParam = Number(searchParams.get('limit') || 1000);
		const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(limitParam, 5000) : 1000;
		// Future filters can be added here

		const snap = await dbAdmin.collection('patients').limit(limit).get();
		const rows = snap.docs.map(d => {
			const data = d.data() as Record<string, unknown>;
			return {
				id: d.id,
				patientId: data.patientId ?? '',
				name: data.name ?? '',
				email: data.email ?? '',
				phone: data.phone ?? '',
				dob: data.dob ?? '',
				address: data.address ?? '',
				gender: data.gender ?? '',
				status: data.status ?? '',
				registeredAt: data.registeredAt ?? '',
			};
		});

		const csv = toCsv(rows);
		const filename = `patients_${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.csv`;
		return new Response(csv, {
			status: 200,
			headers: {
				'Content-Type': 'text/csv; charset=utf-8',
				'Content-Disposition': `attachment; filename="${filename}"`,
			},
		});
	} catch (err: any) {
		console.error('GET /api/patients/export failed', err);
		return new Response(JSON.stringify({ status: 'error', message: err?.message || 'Failed to export patients' }), {
			status: 500,
		});
	}
}


