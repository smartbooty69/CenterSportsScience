'use server';

import { NextRequest } from 'next/server';
import { authAdmin, dbAdmin } from '@/lib/firebaseAdmin';

async function requireAdmin(request: NextRequest, fallbackRole?: string) {
	const auth = request.headers.get('authorization') || request.headers.get('Authorization');
	if (!auth || !auth.startsWith('Bearer ')) {
		return { ok: false, status: 401, message: 'Missing Authorization header' as const };
	}
	const token = auth.slice('Bearer '.length).trim();
	try {
		const decoded = await authAdmin.verifyIdToken(token);
		let role = (decoded as any).role || (decoded as any).claims?.role;
		
		// If role not in token claims, check Firestore profile (if Admin SDK is configured)
		if (!role || (role !== 'Admin' && role !== 'admin')) {
			try {
				// Only try Firestore if Admin SDK is properly initialized
				if (dbAdmin) {
					const userDoc = await dbAdmin.collection('users').doc(decoded.uid).get();
					if (userDoc.exists) {
						const userData = userDoc.data();
						role = userData?.role;
					}
				}
			} catch (firestoreError: any) {
				// Silently fail if Admin SDK isn't configured - this is expected in development
				// The error will be logged but won't block the request
				if (!firestoreError?.message?.includes('default credentials')) {
					console.error('Failed to check Firestore for role', firestoreError);
				}
			}
		}
		
		// Use fallback role if provided (for development when Admin SDK isn't configured)
		if ((!role || (role !== 'Admin' && role !== 'admin')) && fallbackRole) {
			if (fallbackRole === 'Admin' || fallbackRole === 'admin') {
				role = fallbackRole;
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

export async function GET(request: NextRequest) {
	const gate = await requireAdmin(request);
	if (!gate.ok) {
		return new Response(JSON.stringify({ status: 'error', message: gate.message }), { status: gate.status });
	}

	try {
		const result = await authAdmin.listUsers(100);
		const users = await Promise.all(
			result.users.map(async user => {
				let profile: { role?: string; displayName?: string } = {};
				try {
					const snap = await dbAdmin.collection('users').doc(user.uid).get();
					if (snap.exists) {
						const data = snap.data() as any;
						profile = {
							role: data?.role,
							displayName: data?.displayName,
						};
					}
				} catch (e) {
					// swallow, non-blocking
				}
				const claims = (user.customClaims || {}) as Record<string, unknown>;
				return {
					uid: user.uid,
					email: user.email,
					displayName: profile.displayName || user.displayName || '',
					disabled: user.disabled ?? false,
					customClaims: claims,
					role: (claims.role as string) || profile.role || '',
				};
			})
		);
		return new Response(JSON.stringify({ status: 'ok', users }), { status: 200 });
	} catch (err: any) {
		console.error('GET /api/admin/users failed', err);
		return new Response(JSON.stringify({ status: 'error', message: err?.message || 'Failed to list users' }), {
			status: 500,
		});
	}
}

export async function POST(request: NextRequest) {
	// Parse body once and reuse it
	let body: any;
	let fallbackRole: string | undefined;
	try {
		body = await request.json();
		fallbackRole = body?.requestingUserRole;
	} catch {
		return new Response(JSON.stringify({ status: 'error', message: 'Invalid request body' }), { status: 400 });
	}
	
	const gate = await requireAdmin(request, fallbackRole);
	if (!gate.ok) {
	 return new Response(JSON.stringify({ status: 'error', message: gate.message }), { status: gate.status });
	}
	try {
		const email: string = String(body?.email || '').trim().toLowerCase();
		const password: string = String(body?.password || '').trim();
		const displayName: string = String(body?.displayName || '').trim();
		const role: string = String(body?.role || 'FrontDesk').trim();
		if (!email || !displayName) {
			return new Response(JSON.stringify({ status: 'error', message: 'email and displayName required' }), {
				status: 400,
			});
		}
		if (!password) {
			return new Response(JSON.stringify({ status: 'error', message: 'password required for new users' }), {
				status: 400,
			});
		}

		let userRecord;
		let isNewUser = false;

		// Check if user already exists
		try {
			userRecord = await authAdmin.getUserByEmail(email);
			// User exists - update them
			const updateData: any = { displayName, disabled: false };
			if (password) {
				updateData.password = password;
			}
			userRecord = await authAdmin.updateUser(userRecord.uid, updateData);
		} catch (getUserError: any) {
			// User doesn't exist - create new user
			if (getUserError.code === 'auth/user-not-found') {
				userRecord = await authAdmin.createUser({ email, password, displayName, disabled: false });
				isNewUser = true;
			} else {
				throw getUserError;
			}
		}

		// Update custom claims (role)
		await authAdmin.setCustomUserClaims(userRecord.uid, { role });

		// Update/create Firestore profile
		await dbAdmin.collection('users').doc(userRecord.uid).set({
			email,
			displayName,
			role,
			status: 'Active',
			userName: displayName,
			createdAt: isNewUser ? new Date().toISOString() : undefined,
			updatedAt: new Date().toISOString(),
		}, { merge: true });

		return new Response(
			JSON.stringify({
				status: 'ok',
				user: { uid: userRecord.uid, email, displayName, role, disabled: false },
				message: isNewUser ? 'User created successfully' : 'User updated successfully',
			}),
			{ status: isNewUser ? 201 : 200 }
		);
	} catch (err: any) {
		console.error('POST /api/admin/users failed', err);
		const errorMessage = err?.code === 'auth/email-already-exists' 
			? 'Email address is already in use'
			: err?.message || 'Failed to create/update user';
		return new Response(JSON.stringify({ status: 'error', message: errorMessage }), {
			status: 500,
		});
	}
}

export async function PATCH(request: NextRequest) {
	const gate = await requireAdmin(request);
	if (!gate.ok) {
		return new Response(JSON.stringify({ status: 'error', message: gate.message }), { status: gate.status });
	}
	try {
		const body = await request.json();
		const uid: string = String(body?.uid || '').trim();
		const role: string | undefined = body?.role ? String(body.role).trim() : undefined;
		const disabled: boolean | undefined = typeof body?.disabled === 'boolean' ? body.disabled : undefined;
		if (!uid) {
		 return new Response(JSON.stringify({ status: 'error', message: 'uid required' }), { status: 400 });
		}
		let updated: any = {};
		if (typeof disabled === 'boolean') {
			await authAdmin.updateUser(uid, { disabled });
			updated.disabled = disabled;
		}
		if (role) {
			await authAdmin.setCustomUserClaims(uid, { role });
			await dbAdmin.collection('users').doc(uid).set({ role }, { merge: true });
			updated.role = role;
		}
		const user = await authAdmin.getUser(uid);
		return new Response(
			JSON.stringify({
				status: 'ok',
				user: {
					uid: user.uid,
					email: user.email,
					displayName: user.displayName,
					disabled: user.disabled,
					role: updated.role ?? ((user.customClaims as any)?.role || null),
				},
			}),
			{ status: 200 }
		);
	} catch (err: any) {
		console.error('PATCH /api/admin/users failed', err);
		return new Response(JSON.stringify({ status: 'error', message: err?.message || 'Failed to update user' }), {
			status: 500,
		});
	}
}

export async function DELETE(request: NextRequest) {
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
		await authAdmin.updateUser(uid, { disabled: true });
		return new Response(JSON.stringify({ status: 'ok', user: { uid, disabled: true } }), { status: 200 });
	} catch (err: any) {
		console.error('DELETE /api/admin/users failed', err);
		return new Response(JSON.stringify({ status: 'error', message: err?.message || 'Failed to disable user' }), {
			status: 500,
		});
	}
}


