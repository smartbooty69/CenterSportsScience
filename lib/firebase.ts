import { initializeApp, getApps } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

// Determine environment (staging or production)
// Note: NODE_ENV can only be 'development', 'production', or 'test', so we only check NEXT_PUBLIC_ENVIRONMENT for staging
const isStaging = process.env.NEXT_PUBLIC_ENVIRONMENT === 'staging';

// Debug logging (server-side)
if (typeof window === 'undefined' && process.env.NODE_ENV === 'development') {
	console.log('🔍 [SERVER] Environment Check:');
	console.log('  NEXT_PUBLIC_ENVIRONMENT:', process.env.NEXT_PUBLIC_ENVIRONMENT);
	console.log('  NODE_ENV:', process.env.NODE_ENV);
	console.log('  isStaging:', isStaging);
	console.log('  Staging Project ID:', process.env.NEXT_PUBLIC_FIREBASE_STAGING_PROJECT_ID || 'NOT SET');
	console.log('  Production Project ID:', process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'NOT SET');
}

// Use staging-specific variables if in staging, otherwise use production variables
const firebaseConfig = {
	apiKey: isStaging 
		? (process.env.NEXT_PUBLIC_FIREBASE_STAGING_API_KEY || process.env.NEXT_PUBLIC_FIREBASE_API_KEY)
		: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
	authDomain: isStaging
		? (process.env.NEXT_PUBLIC_FIREBASE_STAGING_AUTH_DOMAIN || process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN)
		: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
	projectId: isStaging
		? (process.env.NEXT_PUBLIC_FIREBASE_STAGING_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID)
		: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
	storageBucket: isStaging
		? (process.env.NEXT_PUBLIC_FIREBASE_STAGING_STORAGE_BUCKET || process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET)
		: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
	messagingSenderId: isStaging
		? (process.env.NEXT_PUBLIC_FIREBASE_STAGING_MESSAGING_SENDER_ID || process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID)
		: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
	appId: isStaging
		? (process.env.NEXT_PUBLIC_FIREBASE_STAGING_APP_ID || process.env.NEXT_PUBLIC_FIREBASE_APP_ID)
		: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

// Validate Firebase configuration in development
if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
	const missingVars: string[] = [];
	if (!firebaseConfig.apiKey) missingVars.push(isStaging ? 'NEXT_PUBLIC_FIREBASE_STAGING_API_KEY' : 'NEXT_PUBLIC_FIREBASE_API_KEY');
	if (!firebaseConfig.authDomain) missingVars.push(isStaging ? 'NEXT_PUBLIC_FIREBASE_STAGING_AUTH_DOMAIN' : 'NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN');
	if (!firebaseConfig.projectId) missingVars.push(isStaging ? 'NEXT_PUBLIC_FIREBASE_STAGING_PROJECT_ID' : 'NEXT_PUBLIC_FIREBASE_PROJECT_ID');
	
	if (missingVars.length > 0) {
		console.warn(`⚠️ Missing Firebase environment variables (${isStaging ? 'STAGING' : 'PRODUCTION'}):`, missingVars.join(', '));
		console.warn('Please check your .env.local file and ensure all Firebase config variables are set.');
	}
}

// Log which environment is being used
if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
	console.log(`🔧 Firebase initialized for: ${isStaging ? 'STAGING' : 'PRODUCTION'}`);
	console.log(`   Project ID: ${firebaseConfig.projectId || 'not set'}`);
}

const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);

