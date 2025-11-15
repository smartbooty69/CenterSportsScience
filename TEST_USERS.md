# Test User Accounts

This document contains the test user credentials for accessing the different dashboards.

## Test User Credentials

### 1. Admin User
- **Email:** `admin@test.com`
- **Password:** `admin123`
- **Role:** Admin
- **Dashboard:** `/admin`
- **Access:** Full system access, user management, all features

### 2. Front Desk User
- **Email:** `frontdesk@test.com`
- **Password:** `frontdesk123`
- **Role:** FrontDesk
- **Dashboard:** `/frontdesk`
- **Access:** Patient registration, appointments, billing, reports

### 3. Clinical Team User
- **Email:** `clinical@test.com`
- **Password:** `clinical123`
- **Role:** ClinicalTeam
- **Dashboard:** `/clinical-team`
- **Access:** Patient management, calendar, reports, ROM assessments

## How to Create These Users

### Option 1: Manual Creation in Firebase Console (Recommended for Development)

Since Firebase Admin SDK requires service account credentials, the easiest way for development is to create users manually:

**For each test user (Admin, FrontDesk, ClinicalTeam):**

1. **Create Authentication User:**
   - Go to [Firebase Console](https://console.firebase.google.com) → Your Project → Authentication → Users
   - Click "Add user"
   - Enter the email and password from the table above
   - Click "Add user"
   - **Copy the User UID** (you'll need this for step 2)

2. **Create Firestore Profile:**
   - Go to Firestore Database → `users` collection
   - Click "Add document"
   - Set the Document ID to the User UID you copied
   - Add these fields:
     ```json
     {
       "email": "user@test.com",
       "displayName": "User Name",
       "userName": "User Name",
       "role": "RoleName",  // "Admin", "FrontDesk", or "ClinicalTeam"
       "status": "Active",
       "createdAt": "2025-01-15T00:00:00.000Z"
     }
     ```
   - Click "Save"

3. **Repeat for all 3 users:**
   - `admin@test.com` with role `Admin`
   - `frontdesk@test.com` with role `FrontDesk`
   - `clinical@test.com` with role `ClinicalTeam`

### Option 2: Using the Admin Dashboard (Requires Firebase Admin SDK Setup)

**Prerequisites:** You need to set up Firebase Admin SDK credentials first.

1. **Set up Firebase Admin SDK:**
   - Go to Firebase Console → Project Settings → Service Accounts
   - Click "Generate New Private Key"
   - Save the JSON file
   - Add to your `.env.local`:
     ```env
     FIREBASE_SERVICE_ACCOUNT_KEY='{"type":"service_account","project_id":"...","private_key":"...","client_email":"..."}'
     ```
     (The entire JSON as a single-line string, or use `GOOGLE_APPLICATION_CREDENTIALS` pointing to the file)

2. **Create an admin user manually** (see Option 1, step 1-2 for admin@test.com)

3. **Use the Seed page:**
   - Login with `admin@test.com` / `admin123`
   - Navigate to Admin Dashboard → Seed Data
   - Click "Create Test Users" button
   - The other 2 test users will be created automatically

## Quick Setup Guide

**Fastest way to get started (5 minutes):**

1. Open [Firebase Console](https://console.firebase.google.com) → Your Project
2. For each user below, follow these steps:

   **Step A: Create Auth User**
   - Go to Authentication → Users → "Add user"
   - Email: (from table below)
   - Password: (from table below)
   - Click "Add user" → **Copy the UID**

   **Step B: Create Firestore Profile**
   - Go to Firestore Database → `users` collection → "Add document"
   - Document ID: Paste the UID from Step A
   - Add fields:
     - `email`: (same as email used)
     - `displayName`: (from table below)
     - `userName`: (same as displayName)
     - `role`: (from table below)
     - `status`: `Active`
     - `createdAt`: `2025-01-15T00:00:00.000Z`
   - Click "Save"

3. Repeat for all 3 users:

| Email | Password | Display Name | Role |
|-------|----------|--------------|------|
| `admin@test.com` | `admin123` | Admin User | `Admin` |
| `frontdesk@test.com` | `frontdesk123` | Front Desk User | `FrontDesk` |
| `clinical@test.com` | `clinical123` | Clinical Team User | `ClinicalTeam` |

## Notes

- All test users have the status set to "Active"
- Passwords are simple for testing purposes - change them in production
- Users are automatically redirected to their appropriate dashboard based on role
- If a user tries to access a dashboard they don't have permission for, they'll be redirected to their own dashboard

## Troubleshooting

- **"Your account is missing a profile"**: Make sure the user document exists in the `users` collection
- **"Your account is inactive"**: Check that the `status` field is set to "Active"
- **"Your account does not have a role assigned"**: Ensure the `role` field is set correctly
- **Can't access dashboard**: Verify the role matches one of: `Admin`, `FrontDesk`, `ClinicalTeam`, `Physiotherapist`, or `StrengthAndConditioning`

