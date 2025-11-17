import { NextRequest } from 'next/server';
import { authAdmin, dbAdmin } from '@/lib/firebaseAdmin';

export type AppRole = 'Admin' | 'FrontDesk' | 'ClinicalTeam' | 'Physiotherapist' | 'StrengthAndConditioning';

export interface RequireRoleOk {
	ok: true;
	uid: string;
	role: AppRole | string;
}

export interface RequireRoleErr {
	ok: false;
	status: number;
	message: string;
}

/**
 * Minimal server-side authorization helper.
 * - Verifies Firebase ID token from Authorization: Bearer <idToken>
 * - Resolves role from custom claims; if missing, looks up Firestore users/<uid>.role
 * - Checks role is in allowed list (case-sensitive AppRole labels used in app)
 */
export async function requireRole(
	request: NextRequest,
	allowedRoles: ReadonlyArray<AppRole>
): Promise<RequireRoleOk | RequireRoleErr> {
	const authHeader = request.headers.get('authorization') || request.headers.get('Authorization');
	if (!authHeader || !authHeader.startsWith('Bearer ')) {
		return { ok: false, status: 401, message: 'Missing Authorization header' };
	}
	const token = authHeader.slice('Bearer '.length).trim();
	try {
		const decoded = await authAdmin.verifyIdToken(token);
		let role: string | undefined =
			(decoded as any).role || (decoded as any).claims?.role || (decoded as any).customClaims?.role;

		if (!role) {
			try {
				const userDoc = await dbAdmin.collection('users').doc(decoded.uid).get();
				if (userDoc.exists) {
					role = (userDoc.data() as any)?.role;
				}
			} catch {
				// ignore lookup error; will fall through to forbidden if role is still missing
			}
		}

		if (!role || !allowedRoles.includes(role as AppRole)) {
			return { ok: false, status: 403, message: 'Forbidden' };
		}

		return { ok: true, uid: decoded.uid, role };
	} catch (err) {
		return { ok: false, status: 401, message: 'Invalid token' };
	}
}


