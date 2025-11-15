import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';
import { join } from 'path';
import type { App } from 'firebase-admin/app';
import type { Auth } from 'firebase-admin/auth';
import type { Firestore } from 'firebase-admin/firestore';

let app: App;
let authAdmin: Auth;
let dbAdmin: Firestore;

// Initialize Firebase Admin SDK
if (getApps().length === 0) {
	// Method 1: Try using file path (GOOGLE_APPLICATION_CREDENTIALS or default location)
	const credentialsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS || 
		(process.cwd() ? join(process.cwd(), 'firebase-service-account.json') : null);
	if (credentialsPath) {
		try {
			const filePath = credentialsPath.startsWith('/') || credentialsPath.match(/^[A-Z]:/) 
				? credentialsPath 
				: join(process.cwd(), credentialsPath);
			const serviceAccountKey = JSON.parse(readFileSync(filePath, 'utf8'));
			console.log('✅ Firebase Admin SDK: Loaded credentials from file:', filePath);
			app = initializeApp({
				credential: cert(serviceAccountKey),
				projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || serviceAccountKey.project_id,
			});
		} catch (error: any) {
			// File doesn't exist or can't be read - that's okay, try other methods
			if (error.code !== 'ENOENT') {
				console.error('❌ Failed to load credentials from file:', error.message);
			}
		}
	}
	
	// Method 2: Try using JSON string from environment variable
	if (!app) {
		let serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
		
		if (serviceAccount) {
			// Remove surrounding single or double quotes if present
			serviceAccount = serviceAccount.trim();
			if ((serviceAccount.startsWith("'") && serviceAccount.endsWith("'")) || 
			    (serviceAccount.startsWith('"') && serviceAccount.endsWith('"'))) {
				serviceAccount = serviceAccount.slice(1, -1);
			}
			
			// Parse the service account key (it should be a JSON string)
			try {
				const serviceAccountKey = JSON.parse(serviceAccount);
				console.log('✅ Firebase Admin SDK: Successfully loaded service account credentials from env var');
				app = initializeApp({
					credential: cert(serviceAccountKey),
					projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || serviceAccountKey.project_id,
				});
			} catch (error) {
				console.error('❌ Failed to parse FIREBASE_SERVICE_ACCOUNT_KEY:', error);
				console.error('Service account string length:', serviceAccount.length);
				console.error('First 100 chars:', serviceAccount.substring(0, 100));
			}
		}
	}
	
	// Method 3: Fallback to Application Default Credentials
	if (!app) {
		// No service account key provided - use Application Default Credentials
		// This works if running on Google Cloud or if GOOGLE_APPLICATION_CREDENTIALS is set
		console.warn('⚠️ FIREBASE_SERVICE_ACCOUNT_KEY not found. Attempting to use Application Default Credentials...');
		try {
			app = initializeApp({
				projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
			});
			console.warn('⚠️ Firebase Admin SDK initialized without explicit credentials (may fail on admin operations)');
		} catch (error) {
			console.error('❌ Failed to initialize Firebase Admin:', error);
			// Create a minimal app for development (will fail on actual admin operations)
			app = initializeApp({
				projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'centersportsscience-5be86',
			}, 'admin');
			console.warn('⚠️ Created minimal Firebase Admin app (admin operations will fail)');
		}
	}
} else {
	app = getApps()[0];
}

authAdmin = getAuth(app);
dbAdmin = getFirestore(app);

export { authAdmin, dbAdmin };

