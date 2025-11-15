# SMS Testing Guide

This guide explains how to test the SMS functionality in your application.

## Prerequisites

1. **Environment Variables**: Make sure you have the following variables set in your `.env.local` file:
   ```
   TWILIO_ACCOUNT_SID=your_account_sid
   TWILIO_AUTH_TOKEN=your_auth_token
   TWILIO_PHONE_NUMBER=+1234567890
   ```

2. **Development Server**: Make sure your Next.js development server is running:
   ```bash
   npm run dev
   ```

## Testing Methods

### Method 1: Browser Test Page (Recommended)

1. Start your development server:
   ```bash
   npm run dev
   ```

2. Navigate to: `http://localhost:3000/test-sms`

3. Enter a phone number (with country code, e.g., `+1234567890`)

4. Select a template from the dropdown

5. Click "Send Test SMS"

6. Check the result - you should see either:
   - ✅ Success message with Message ID and status
   - ❌ Error message with details

### Method 2: Command Line Script

1. Make sure your dev server is running

2. Run the test script:
   ```bash
   node test-sms.js +1234567890
   ```
   
   Or run without arguments to be prompted:
   ```bash
   node test-sms.js
   ```

### Method 3: Direct API Call (cURL)

```bash
curl -X POST http://localhost:3000/api/sms \
  -H "Content-Type: application/json" \
  -d '{
    "to": "+1234567890",
    "template": "patient-registered",
    "data": {
      "patientName": "Test Patient",
      "patientPhone": "+1234567890",
      "patientId": "TEST-12345"
    }
  }'
```

## Available SMS Templates

1. **patient-registered** - Welcome message for new patients
2. **appointment-created** - Confirmation when appointment is scheduled
3. **appointment-reminder** - 24-hour reminder before appointment
4. **appointment-updated** - Notification when appointment details change
5. **appointment-cancelled** - Notification when appointment is cancelled

## Phone Number Format

- **Required**: Include country code
- **US Numbers**: `+1234567890` or `1234567890` (will auto-add +1)
- **International**: `+441234567890` (UK example)
- **Format**: E.164 format (e.g., +[country code][number])

## Troubleshooting

### "SMS service not configured"
- Check that all Twilio environment variables are set in `.env.local`
- Restart your development server after adding environment variables

### "Invalid phone number format"
- Make sure the phone number includes country code
- Try formatting as: `+1234567890`

### "ECONNREFUSED" error
- Make sure your Next.js dev server is running (`npm run dev`)
- Check that the server is running on port 3000

### Trial Account Limitations
- Twilio trial accounts can only send SMS to verified phone numbers
- Verify your phone number in the Twilio Console
- Or upgrade your Twilio account to send to any number

## Expected Response

**Success Response:**
```json
{
  "success": true,
  "messageId": "SM1234567890abcdef",
  "status": "queued"
}
```

**Development Mode (without Twilio configured):**
```json
{
  "success": true,
  "message": "SMS logged (development mode)",
  "preview": "Welcome to Centre For Sports Science, Test Patient!..."
}
```

**Error Response:**
```json
{
  "error": "Error message here"
}
```


