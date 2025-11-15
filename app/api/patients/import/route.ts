'use server';

import { NextRequest } from 'next/server';
import { authAdmin, dbAdmin } from '@/lib/firebaseAdmin';

type IncomingRow = {
	fullName?: string;
	name?: string;
	email?: string;
	phone?: string;
	dob?: string;
	address?: string;
	gender?: string;
	notes?: string;
	[key: string]: unknown;
};

function normalizeDob(dob?: string): string | undefined {
	if (!dob) return undefined;
	const trimmed = dob.trim();
	// Accept formats like YYYY-MM-DD, DD/MM/YYYY, MM/DD/YYYY
	const isoLike = /^\d{4}-\d{2}-\d{2}$/;
	if (isoLike.test(trimmed)) return trimmed;
	const partsSlash = trimmed.split('/');
	if (partsSlash.length === 3) {
		// Try DD/MM/YYYY then MM/DD/YYYY if invalid
		const [a, b, c] = partsSlash;
		const tryDdMmYyyy = new Date(Number(c), Number(b) - 1, Number(a));
		if (!Number.isNaN(tryDdMmYyyy.getTime())) {
			const m = String(tryDdMmYyyy.getMonth() + 1).padStart(2, '0');
			const d = String(tryDdMmYyyy.getDate()).padStart(2, '0');
			return `${tryDdMmYyyy.getFullYear()}-${m}-${d}`;
		}
		const tryMmDdYyyy = new Date(Number(c), Number(a) - 1, Number(b));
		if (!Number.isNaN(tryMmDdYyyy.getTime())) {
			const m = String(tryMmDdYyyy.getMonth() + 1).padStart(2, '0');
			const d = String(tryMmDdYyyy.getDate()).padStart(2, '0');
			return `${tryMmDdYyyy.getFullYear()}-${m}-${d}`;
		}
	}
	// Fallback: try Date parse
	const parsed = new Date(trimmed);
	if (!Number.isNaN(parsed.getTime())) {
		const m = String(parsed.getMonth() + 1).padStart(2, '0');
		const d = String(parsed.getDate()).padStart(2, '0');
		return `${parsed.getFullYear()}-${m}-${d}`;
	}
	return undefined;
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
		const rows: IncomingRow[] = Array.isArray(body?.rows) ? (body.rows as IncomingRow[]) : [];
		const skipDuplicates: boolean = Boolean(body?.skipDuplicates);
		if (!rows.length) {
			return new Response(JSON.stringify({ status: 'error', message: 'rows array required' }), { status: 400 });
		}

		// Validate and normalize
		const validRows: Array<{
			fullName: string;
			email?: string;
			phone?: string;
			dob?: string;
			address?: string;
			gender?: string;
			notes?: string;
		}> = [];
		const errors: Array<{ index: number; error: string }> = [];

		rows.forEach((r, idx) => {
			const fullName = String((r.fullName || r.name || '') as string).trim();
			const email = r.email ? String(r.email).trim().toLowerCase() : undefined;
			const phone = r.phone ? String(r.phone).trim() : undefined;
			const dob = normalizeDob(r.dob ? String(r.dob) : undefined);
			const address = r.address ? String(r.address) : undefined;
			const gender = r.gender ? String(r.gender) : undefined;
			const notes = r.notes ? String(r.notes) : undefined;
			if (!fullName) {
				errors.push({ index: idx, error: 'Missing fullName/name' });
				return;
			}
			if (!email && !phone) {
				errors.push({ index: idx, error: 'At least one of email or phone is required' });
				return;
			}
			validRows.push({ fullName, email, phone, dob, address, gender, notes });
		});

		// Duplicate detection by email/phone
		let skipped = 0;
		let imported = 0;

		// Prepare query sets
		const emails = new Set(validRows.map(r => r.email).filter(Boolean) as string[]);
		const phones = new Set(validRows.map(r => r.phone).filter(Boolean) as string[]);

		const existingByEmail = new Set<string>();
		const existingByPhone = new Set<string>();

		// Query by email in chunks of 10 (Firestore 'in' max 10 values)
		const chunk = <T,>(arr: T[], size: number) => {
			const out: T[][] = [];
			for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
			return out;
		};

		for (const c of chunk(Array.from(emails), 10)) {
			const snap = await dbAdmin.collection('patients').where('email', 'in', c).get().catch(() => null);
			if (snap?.empty === false) {
				snap.docs.forEach(d => existingByEmail.add(String(d.get('email')).toLowerCase()));
			}
		}
		for (const c of chunk(Array.from(phones), 10)) {
			const snap = await dbAdmin.collection('patients').where('phone', 'in', c).get().catch(() => null);
			if (snap?.empty === false) {
				snap.docs.forEach(d => existingByPhone.add(String(d.get('phone'))));
			}
		}

		const toWrite = validRows.filter(row => {
			const isDup = (row.email && existingByEmail.has(row.email.toLowerCase())) || (row.phone && existingByPhone.has(row.phone));
			if (isDup && skipDuplicates) {
				skipped += 1;
				return false;
			}
			return true;
		});

		// Batch writes (max 300 per batch)
		const batches = chunk(toWrite, 300);
		for (const group of batches) {
			const batch = dbAdmin.batch();
			group.forEach(row => {
				const ref = dbAdmin.collection('patients').doc();
				batch.set(ref, {
					name: row.fullName,
					email: row.email || '',
					phone: row.phone || '',
					dob: row.dob || '',
					address: row.address || '',
					gender: row.gender || '',
					notes: row.notes || '',
					status: 'pending',
					registeredAt: new Date().toISOString(),
				});
			});
			await batch.commit();
			imported += group.length;
		}

		return new Response(
			JSON.stringify({
				status: 'ok',
				imported,
				skipped,
				errors,
			}),
			{ status: 200 }
		);
	} catch (err: any) {
		console.error('POST /api/patients/import failed', err);
		return new Response(JSON.stringify({ status: 'error', message: err?.message || 'Failed to import patients' }), {
			status: 500,
		});
	}
}


