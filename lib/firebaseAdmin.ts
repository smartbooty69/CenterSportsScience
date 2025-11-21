import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import type { App } from 'firebase-admin/app';
import type { Auth } from 'firebase-admin/auth';
import type { Firestore } from 'firebase-admin/firestore';

let app: App | null = null;
let authAdmin: Auth;
let dbAdmin: Firestore;

// Determine environment (staging or production)
// Note: NODE_ENV can only be 'development', 'production', or 'test', so we only check NEXT_PUBLIC_ENVIRONMENT for staging
const isStaging = process.env.NEXT_PUBLIC_ENVIRONMENT === 'staging';

// Debug logging (server-side)
if (process.env.NODE_ENV === 'development') {
	console.log('🔍 [ADMIN SDK] Environment Check:');
	console.log('  NEXT_PUBLIC_ENVIRONMENT:', process.env.NEXT_PUBLIC_ENVIRONMENT);
	console.log('  NODE_ENV:', process.env.NODE_ENV);
	console.log('  isStaging:', isStaging);
}

// Get project ID based on environment
const getProjectId = () => {
	if (isStaging) {
		const stagingId = process.env.NEXT_PUBLIC_FIREBASE_STAGING_PROJECT_ID || 
			process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
		if (process.env.NODE_ENV === 'development') {
			console.log('  [ADMIN SDK] Using staging project ID:', stagingId);
		}
		return stagingId;
	}
	const prodId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
	if (process.env.NODE_ENV === 'development') {
		console.log('  [ADMIN SDK] Using production project ID:', prodId);
	}
	return prodId;
};

// Initialize Firebase Admin SDK
if (getApps().length === 0) {
	// Method 1: Try using file path (GOOGLE_APPLICATION_CREDENTIALS or default location)
	// For staging, try staging-specific file first
	const stagingCredentialsPath = isStaging 
		? (process.env.GOOGLE_APPLICATION_CREDENTIALS_STAGING || 
		   (process.cwd() ? join(process.cwd(), 'firebase-service-account-staging.json') : null))
		: null;
	
	const credentialsPath = stagingCredentialsPath || 
		process.env.GOOGLE_APPLICATION_CREDENTIALS || 
		(process.cwd() ? join(process.cwd(), 'firebase-service-account.json') : null);
	
	if (credentialsPath) {
		try {
			const filePath = credentialsPath.startsWith('/') || credentialsPath.match(/^[A-Z]:/) 
				? credentialsPath 
				: join(process.cwd(), credentialsPath);
			const serviceAccountKey = JSON.parse(readFileSync(filePath, 'utf8'));
			console.log(`✅ Firebase Admin SDK: Loaded credentials from file (${isStaging ? 'STAGING' : 'PRODUCTION'}):`, filePath);
			app = initializeApp({
				credential: cert(serviceAccountKey),
				projectId: getProjectId() || serviceAccountKey.project_id,
			});
		} catch (error: any) {
			// File doesn't exist or can't be read - that's okay, try other methods
			if (error.code !== 'ENOENT') {
				console.error('❌ Failed to load credentials from file:', error.message);
			}
		}
	}
	
	// Method 2: Try using JSON string from environment variable
	// For staging, try staging-specific key first
	if (!app) {
		let serviceAccount = isStaging
			? (process.env.FIREBASE_SERVICE_ACCOUNT_KEY_STAGING || process.env.FIREBASE_SERVICE_ACCOUNT_KEY)
			: process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
		
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
				console.log(`✅ Firebase Admin SDK: Successfully loaded service account credentials from env var (${isStaging ? 'STAGING' : 'PRODUCTION'})`);
				app = initializeApp({
					credential: cert(serviceAccountKey),
					projectId: getProjectId() || serviceAccountKey.project_id,
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
				projectId: getProjectId(),
			});
			console.warn('⚠️ Firebase Admin SDK initialized without explicit credentials (may fail on admin operations)');
		} catch (error) {
			console.error('❌ Failed to initialize Firebase Admin:', error);
			// Create a minimal app for development (will fail on actual admin operations)
			app = initializeApp({
				projectId: getProjectId() || 'centersportsscience-5be86',
			}, 'admin');
			console.warn('⚠️ Created minimal Firebase Admin app (admin operations will fail)');
		}
	}
} else {
	app = getApps()[0] || null;
}

// Final safety check to satisfy TypeScript definite assignment
if (!app) {
	app = getApps()[0] || initializeApp({ projectId: getProjectId() || 'centersportsscience-5be86' });
}

authAdmin = getAuth(app as App);
dbAdmin = getFirestore(app as App);

// Log initialization status
const hasCredentials = !!(
	(isStaging ? process.env.FIREBASE_SERVICE_ACCOUNT_KEY_STAGING : null) ||
	process.env.FIREBASE_SERVICE_ACCOUNT_KEY || 
	(isStaging ? process.env.GOOGLE_APPLICATION_CREDENTIALS_STAGING : null) ||
	process.env.GOOGLE_APPLICATION_CREDENTIALS ||
	(process.cwd() && existsSync(join(process.cwd(), isStaging ? 'firebase-service-account-staging.json' : 'firebase-service-account.json')))
);

if (hasCredentials) {
	console.log(`✅ Firebase Admin SDK initialized successfully (${isStaging ? 'STAGING' : 'PRODUCTION'})`);
	console.log('   Project ID:', app?.options?.projectId || getProjectId() || 'not set');
} else {
	console.warn('⚠️ Firebase Admin SDK initialized but credentials may be missing');
	console.warn(`   Set FIREBASE_SERVICE_ACCOUNT_KEY${isStaging ? '_STAGING' : ''} or GOOGLE_APPLICATION_CREDENTIALS${isStaging ? '_STAGING' : ''} in .env.local`);
}

export { authAdmin, dbAdmin };

