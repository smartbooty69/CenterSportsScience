'use client';

import { onAuthStateChanged, signOut, type User as FirebaseUser } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { auth, db } from '@/lib/firebase';

export interface AuthUser {
	uid: string;
	email: string | null;
	displayName: string | null;
	role: string | null;
	status?: string;
}

interface AuthContextValue {
	user: AuthUser | null;
	loading: boolean;
	error: string | null;
	refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
	user: null,
	loading: true,
	error: null,
	refresh: async () => {
		/* noop */
	},
});

async function fetchUserProfile(firebaseUser: FirebaseUser): Promise<AuthUser | null> {
	try {
		const snap = await getDoc(doc(db, 'users', firebaseUser.uid));
		if (!snap.exists()) {
			return {
				uid: firebaseUser.uid,
				email: firebaseUser.email,
				displayName: firebaseUser.displayName,
				role: null,
			};
		}
		const data = snap.data() as { role?: string; status?: string; userName?: string };
		return {
			uid: firebaseUser.uid,
			email: firebaseUser.email,
			displayName: data.userName ?? firebaseUser.displayName ?? null,
			role: data.role ?? null,
			status: data.status,
		};
	} catch (error) {
		console.error('Failed to load user profile', error);
		return {
			uid: firebaseUser.uid,
			email: firebaseUser.email,
			displayName: firebaseUser.displayName,
			role: null,
		};
	}
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
	const [user, setUser] = useState<AuthUser | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	const loadProfile = async (firebaseUser: FirebaseUser | null) => {
		if (!firebaseUser) {
			setUser(null);
			return;
	}
		setLoading(true);
		try {
			const profile = await fetchUserProfile(firebaseUser);
			if (profile?.status === 'Inactive') {
				setError('Your account is inactive.');
				await signOut(auth);
				setUser(null);
				return;
			}
			setUser(profile);
			setError(null);
		} finally {
			setLoading(false);
		}
	};

	useEffect(() => {
		const unsubscribe = onAuthStateChanged(auth, currentUser => {
			setLoading(true);
			if (!currentUser) {
				setUser(null);
				setError(null);
				setLoading(false);
				return;
			}
			loadProfile(currentUser).catch(err => {
				console.error('Error loading profile', err);
				setError('Unable to load profile.');
				setLoading(false);
			});
		});

		return () => unsubscribe();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	const refresh = async () => {
		const currentUser = auth.currentUser;
		if (!currentUser) {
			setUser(null);
			return;
		}
		await loadProfile(currentUser);
	};

	const value = useMemo(
		() => ({
			user,
			loading,
			error,
			refresh,
		}),
		[user, loading, error]
	);

	return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
	return useContext(AuthContext);
}

