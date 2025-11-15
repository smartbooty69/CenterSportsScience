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

### Option 1: Using the Admin Dashboard (Recommended)

1. **First, create an admin user manually in Firebase Console:**
   - Go to Firebase Console → Authentication → Users
   - Click "Add user"
   - Email: `admin@test.com`
   - Password: `admin123`
   - Click "Add user"

2. **Create the user profile in Firestore:**
   - Go to Firestore Database
   - Create a document in the `users` collection with ID = the user's UID
   - Add these fields:
     ```json
     {
       "email": "admin@test.com",
       "displayName": "Admin User",
       "userName": "Admin User",
       "role": "Admin",
       "status": "Active",
       "createdAt": "2025-01-15T00:00:00.000Z"
     }
     ```

3. **Login as admin and use the Seed page:**
   - Login with `admin@test.com` / `admin123`
   - Navigate to Admin Dashboard → Seed Data
   - Click "Create Test Users" button
   - The other 2 test users will be created automatically

### Option 2: Manual Creation in Firebase Console

For each test user:

1. **Create Authentication User:**
   - Go to Firebase Console → Authentication → Users
   - Click "Add user"
   - Enter email and password
   - Click "Add user"
   - Copy the User UID

2. **Create Firestore Profile:**
   - Go to Firestore Database
   - Navigate to `users` collection
   - Create a new document with the User UID as the document ID
   - Add these fields:
     ```json
     {
       "email": "user@test.com",
       "displayName": "User Name",
       "userName": "User Name",
       "role": "RoleName",
       "status": "Active",
       "createdAt": "2025-01-15T00:00:00.000Z"
     }
     ```

3. **Set Custom Claims (Optional but recommended):**
   - You can set custom claims using Firebase Admin SDK or Functions
   - This helps with server-side role verification

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

