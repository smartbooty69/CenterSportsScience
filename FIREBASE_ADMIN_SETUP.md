# Firebase Admin SDK Setup Guide

This guide will help you set up Firebase Admin SDK so that user creation from the Admin Dashboard is **automatic** - no more manual steps!

## Step 1: Get Service Account Key from Firebase Console

1. Go to [Firebase Console](https://console.firebase.google.com) → Your Project
2. Click the **⚙️ Settings** icon (top left) → **Project settings**
3. Go to the **Service accounts** tab
4. Click **"Generate new private key"** button
5. A dialog will appear - click **"Generate key"**
6. A JSON file will download (e.g., `centersportsscience-5be86-firebase-adminsdk-xxxxx.json`)

## Step 2: Add to Environment Variables

1. Open the downloaded JSON file in a text editor
2. Copy the **entire contents** of the JSON file
3. In your project root, create or edit `.env.local` file
4. Add this line (replace with your actual JSON content):

```env
FIREBASE_SERVICE_ACCOUNT_KEY='{"type":"service_account","project_id":"centersportsscience-5be86","private_key_id":"...","private_key":"-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n","client_email":"...","client_id":"...","auth_uri":"...","token_uri":"...","auth_provider_x509_cert_url":"...","client_x509_cert_url":"..."}'
```

**Important Notes:**
- The entire JSON must be on **one line**
- Keep the single quotes around the JSON
- Make sure all quotes inside the JSON are properly escaped (they should be double quotes)
- The `private_key` field contains newlines (`\n`) - keep them as `\n` in the string

### Alternative: Using a File Path (Windows)

If you prefer to keep the JSON file separate:

1. Save the JSON file in your project root (e.g., `firebase-service-account.json`)
2. Add to `.env.local`:
   ```env
   GOOGLE_APPLICATION_CREDENTIALS=./firebase-service-account.json
   ```
3. **Important:** Add `firebase-service-account.json` to `.gitignore` to keep it secure!

## Step 3: Restart Your Development Server

1. Stop your current dev server (Ctrl+C)
2. Start it again:
   ```bash
   npm run dev
   ```

## Step 4: Test Automatic User Creation

1. Log in to Admin Dashboard with `admin@test.com` / `admin123`
2. Go to **Employee Management** → **Add Employee**
3. Fill in the form:
   - Name: `Test User`
   - Email: `test@example.com`
   - Role: `Front Desk` or `Clinical Team`
   - Password: `test123`
4. Click **Save**

**Expected Result:** 
- ✅ User created successfully with no errors
- ✅ Firebase Authentication user is created automatically
- ✅ User profile in `users` collection is created automatically
- ✅ Staff record in `staff` collection is created automatically

## Troubleshooting

### Error: "Failed to parse FIREBASE_SERVICE_ACCOUNT_KEY"
- Make sure the JSON is on one line
- Check that all quotes are properly escaped
- Verify the JSON is valid (you can test it at jsonlint.com)

### Error: "Could not load the default credentials"
- Make sure you've restarted the dev server after adding the environment variable
- Check that `.env.local` is in the project root (same folder as `package.json`)
- Verify the JSON content is correct

### Error: "Network timeout" or "ETIMEDOUT"
This error occurs when the Firebase Admin SDK cannot connect to Google's servers to verify tokens. Common causes:

1. **IPv6 Connectivity Issues** (Most Common):
   - Windows may have IPv6 connectivity problems
   - Try disabling IPv6 or forcing IPv4:
     - Open PowerShell as Administrator
     - Run: `netsh interface ipv6 set global randomizeidentifiers=disabled`
     - Or disable IPv6 in your network adapter settings

2. **Firewall/Network Blocking**:
   - Check if your firewall is blocking outbound HTTPS connections
   - Ensure ports 443 (HTTPS) are open
   - Check if your network requires a proxy

3. **Proxy Settings**:
   - If behind a corporate proxy, configure Node.js to use it:
     ```bash
     set HTTP_PROXY=http://proxy.example.com:8080
     set HTTPS_PROXY=http://proxy.example.com:8080
     ```

4. **Temporary Network Issues**:
   - Try again after a few minutes
   - Check your internet connection
   - Verify you can access `https://www.googleapis.com` in a browser

**Quick Fix**: If you're on Windows and experiencing IPv6 issues, you can try:
- Restart your network adapter
- Use a VPN if your network blocks Google services
- Contact your network administrator if on a corporate network

### Still seeing manual creation errors?
- Check the terminal/console for specific error messages
- Make sure the service account key has the correct permissions in Firebase Console
- Verify your Firebase project ID matches in both `.env.local` and Firebase Console

## Security Note

⚠️ **Never commit `.env.local` or the service account JSON file to Git!**

The `.gitignore` file should already include `.env.local`, but double-check that your service account key is not committed to version control.

