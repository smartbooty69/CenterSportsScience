# Staging Database Setup & Usage Guide

Complete guide for setting up and using the staging database environment.

## Overview

The application supports environment-based database configuration:
- **Production Database**: Default Firebase project (used when `NEXT_PUBLIC_ENVIRONMENT` is not set)
- **Staging Database**: Separate Firebase project for testing (used when `NEXT_PUBLIC_ENVIRONMENT=staging`)

## Quick Start

```bash
# Use staging database
npm run dev:staging

# Use production database (default)
npm run dev
```

## Part 1: Initial Setup

### Step 1: Create Staging Firebase Project

1. Go to [Firebase Console](https://console.firebase.google.com)
2. Click **"Add project"** → Name it `centersportsscience-staging`
3. Enable required services:
   - **Firestore Database** (Start in test mode)
   - **Authentication** (Email/Password)
   - **Storage** (if used)

### Step 2: Get Firebase Configuration

1. Firebase Console → Staging project → **Settings** → **Project settings**
2. Scroll to **"Your apps"** → Add web app if needed
3. Copy config values: `apiKey`, `authDomain`, `projectId`, `storageBucket`, `messagingSenderId`, `appId`

### Step 3: Configure Environment Variables

Add staging variables to `.env.local`:

```env
# Staging Firebase Configuration
NEXT_PUBLIC_FIREBASE_STAGING_API_KEY=your_staging_api_key
NEXT_PUBLIC_FIREBASE_STAGING_AUTH_DOMAIN=centersportsscience-staging.firebaseapp.com
NEXT_PUBLIC_FIREBASE_STAGING_PROJECT_ID=centersportsscience-staging
NEXT_PUBLIC_FIREBASE_STAGING_STORAGE_BUCKET=centersportsscience-staging.appspot.com
NEXT_PUBLIC_FIREBASE_STAGING_MESSAGING_SENDER_ID=your_staging_sender_id
NEXT_PUBLIC_FIREBASE_STAGING_APP_ID=your_staging_app_id

# Staging Service Account
GOOGLE_APPLICATION_CREDENTIALS_STAGING=./firebase-service-account-staging.json
```

**Note:** Next.js only loads `.env.local`, not `.env.staging.local`. All variables must be in `.env.local`.

### Step 4: Get Service Account Key

1. Firebase Console → Staging project → **Settings** → **Service accounts**
2. Click **"Generate new private key"**
3. Save as `firebase-service-account-staging.json` in project root

### Step 5: Deploy Firestore Rules & Indexes

```bash
# Switch to staging project
firebase use centersportsscience-staging

# Deploy rules
firebase deploy --only firestore:rules

# Deploy indexes
firebase deploy --only firestore:indexes

# Switch back to production
firebase use centersportsscience-5be86
```

## Part 2: Creating Test Users

### Option A: Using Admin Dashboard (Recommended)

1. **Create admin user manually** in Firebase Console:
   - Authentication → Users → "Add user"
   - Email: `admin@test.com`, Password: `admin123`
   - Copy the **UID**

2. **Create user profile in Firestore**:
   - Firestore Database → `users` collection
   - Add document with **Document ID = UID**
   - Add fields:
     ```json
     {
       "email": "admin@test.com",
       "displayName": "Admin User",
       "userName": "Admin User",
       "role": "Admin",
       "status": "Active",
       "createdAt": "2025-11-20T00:00:00.000Z"
     }
     ```

3. **Login and create other users**:
   - Start: `npm run dev:staging`
   - Login: `admin@test.com` / `admin123`
   - Admin Dashboard → Seed Data → "Create Test Users"

### Option B: Manual Creation

For each test user:

1. **Create Auth User**: Firebase Console → Authentication → Add user
2. **Create Firestore Profile**: 
   - Firestore → `users` collection
   - Document ID = Auth UID
   - Fields: `email`, `displayName`, `userName`, `role`, `status`, `createdAt`
3. **Create Staff Record** (for Clinical Team/Therapist only):
   - Firestore → `staff` collection
   - Fields: `userEmail`, `userName`, `role`, `status`, `createdAt`

**Test User Credentials:**

| Email | Password | Role |
|-------|----------|------|
| `admin@test.com` | `admin123` | Admin |
| `frontdesk@test.com` | `frontdesk123` | FrontDesk |
| `clinical@test.com` | `clinical123` | ClinicalTeam |
| `therapist@test.com` | `therapist123` | Physiotherapist |

## Part 3: Seeding Test Data

1. Login as `admin@test.com` / `admin123`
2. Go to Admin Dashboard → Seed Data
3. Click **"Seed All"** to create:
   - 7 staff members
   - 20+ patients
   - 10+ appointments

Or seed individually: Staff, Patients, or Appointments.

## Part 4: Usage

### Local Development

```bash
# Staging database
npm run dev:staging

# Production database
npm run dev
```

### Verify Which Database

Check console output:
```
🔧 Firebase initialized for: STAGING
   Project ID: centersportsscience-staging
```

### Vercel Deployment

**Production:**
- Don't set `NEXT_PUBLIC_ENVIRONMENT` in Vercel
- Uses production database ✅

**Staging (Optional):**
- Create separate Vercel project
- Set `NEXT_PUBLIC_ENVIRONMENT=staging`
- Add staging Firebase variables

## Troubleshooting

### Still Using Production Database?

1. **Check environment variable:**
   ```bash
   # Should show "staging"
   npm run dev:staging
   # Check console: NEXT_PUBLIC_ENVIRONMENT: staging
   ```

2. **Check staging variables are set:**
   - Verify `NEXT_PUBLIC_FIREBASE_STAGING_*` in `.env.local`
   - Not in `.env.staging.local` (Next.js doesn't load it)

3. **Clear Next.js cache:**
   ```bash
   rmdir /s /q .next
   npm run dev:staging
   ```

### Staging Variables Not Found?

- All staging variables must be in `.env.local`
- Next.js only loads `.env.local`, not `.env.staging.local`
- Copy staging variables from `.env.staging.local` to `.env.local`

### Wrong Project ID?

Check console logs:
- Should show: `Staging Project ID: centersportsscience-staging`
- If shows "NOT SET", staging variables are missing from `.env.local`

## Important Notes

1. **Production is Safe**: Staging setup doesn't affect production deployments
2. **Environment Variable Controls Everything**: `NEXT_PUBLIC_ENVIRONMENT=staging` switches to staging
3. **All Variables in .env.local**: Next.js doesn't load `.env.staging.local`
4. **Separate Databases**: Staging and production are completely isolated

## Quick Reference

| Command | Database | Environment Variable |
|---------|----------|---------------------|
| `npm run dev` | Production | Not set |
| `npm run dev:staging` | Staging | `staging` |
| Vercel Production | Production | Not set (default) |

## Files Reference

- `firestore.staging.rules` - Staging Firestore security rules
- `env.staging.example` - Template for staging variables
- `.env.local` - Contains both production and staging variables

