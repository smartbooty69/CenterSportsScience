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
This error occurs when the Firebase Admin SDK cannot connect to Google's servers to verify tokens.

**🚀 Quick Fix (Try This First):**
1. Run the connectivity test: `npm run test:firebase-connectivity`
2. Add to `.env.local`: `NODE_OPTIONS=--dns-result-order=ipv4first`
3. Restart your development server
4. Try creating the user again

**If that doesn't work, see detailed troubleshooting below:**

Common causes:

1. **IPv6 Connectivity Issues** (Most Common on Windows):
   - Windows may have IPv6 connectivity problems that prevent connections to Google's servers
   - **Solution 1 - Disable IPv6 Randomization**:
     - Open PowerShell as Administrator
     - Run: `netsh interface ipv6 set global randomizeidentifiers=disabled`
     - Restart your computer
   - **Solution 2 - Disable IPv6 Completely** (if Solution 1 doesn't work):
     - Open Network Connections (Win + R, type `ncpa.cpl`)
     - Right-click your active network adapter → Properties
     - Uncheck "Internet Protocol Version 6 (TCP/IPv6)"
     - Click OK and restart your computer
   - **Solution 3 - Force IPv4 for Node.js**:
     - Add to your `.env.local`:
       ```env
       NODE_OPTIONS=--dns-result-order=ipv4first
       ```
     - Restart your development server

2. **Firewall/Network Blocking**:
   - Check if Windows Firewall or antivirus is blocking Node.js
   - Ensure ports 443 (HTTPS) are open for outbound connections
   - Temporarily disable firewall/antivirus to test (re-enable after testing)
   - Check if your network requires a proxy

3. **Proxy Settings** (Corporate Networks):
   - If behind a corporate proxy, configure Node.js to use it:
     - Add to `.env.local`:
       ```env
       HTTP_PROXY=http://proxy.example.com:8080
       HTTPS_PROXY=http://proxy.example.com:8080
       NO_PROXY=localhost,127.0.0.1
       ```
     - Or set environment variables in your terminal:
       ```bash
       # Windows CMD
       set HTTP_PROXY=http://proxy.example.com:8080
       set HTTPS_PROXY=http://proxy.example.com:8080
       
       # Windows PowerShell
       $env:HTTP_PROXY="http://proxy.example.com:8080"
       $env:HTTPS_PROXY="http://proxy.example.com:8080"
       ```
   - Contact your IT department for the correct proxy settings

4. **Test Network Connectivity**:
   - **Quick Test Script** (Recommended):
     ```bash
     npm run test:firebase-connectivity
     ```
     This script will test DNS resolution, HTTPS connectivity, IPv6 configuration, and proxy settings.
   
   - **Manual Browser Test**:
     - Open a browser and verify you can access:
       - `https://www.googleapis.com`
       - `https://www.google.com`
   
   - **Manual Command Line Test**:
     ```bash
     # Windows PowerShell
     Test-NetConnection www.googleapis.com -Port 443
     
     # Or use curl (if installed)
     curl -I https://www.googleapis.com
     ```

5. **Temporary Network Issues**:
   - Try again after a few minutes
   - Check your internet connection
   - Restart your router/modem
   - Try using a different network (mobile hotspot, different WiFi)

6. **DNS Issues**:
   - Try using Google's DNS servers:
     - Open Network Connections → Your adapter → Properties → IPv4 Properties
     - Use DNS: `8.8.8.8` and `8.8.4.4`
   - Or flush DNS cache:
     ```bash
     ipconfig /flushdns
     ```

**Quick Fix Checklist**:
1. ✅ Check if you can access `https://www.googleapis.com` in a browser
2. ✅ Try disabling IPv6 (see Solution 2 above)
3. ✅ Add `NODE_OPTIONS=--dns-result-order=ipv4first` to `.env.local` and restart server
4. ✅ Try using a VPN or different network
5. ✅ Check firewall/antivirus settings
6. ✅ Configure proxy if on corporate network
7. ✅ Contact network administrator if issue persists

### Still seeing manual creation errors?
- Check the terminal/console for specific error messages
- Make sure the service account key has the correct permissions in Firebase Console
- Verify your Firebase project ID matches in both `.env.local` and Firebase Console

## Security Note

⚠️ **Never commit `.env.local` or the service account JSON file to Git!**

The `.gitignore` file should already include `.env.local`, but double-check that your service account key is not committed to version control.

