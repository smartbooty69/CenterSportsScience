# Email, SMS & WhatsApp Notifications Setup Guide

This application includes email, SMS, and WhatsApp notification functionality for patient registration, appointment scheduling, and appointment updates.

## Features

The notification system sends automated emails, SMS, and WhatsApp messages for:

1. **Patient Registration** - Welcome email/SMS/WhatsApp with Patient ID when a new patient is registered
2. **Appointment Created** - Confirmation email/SMS/WhatsApp when an appointment is scheduled
3. **Appointment Reminder** - 24-hour reminder email/SMS/WhatsApp sent the day before appointments
4. **Appointment Updated** - Notification when appointment details (date, time, doctor) are changed
5. **Appointment Status Changed** - Notification when appointment status is updated
6. **Appointment Cancelled** - Notification when an appointment is cancelled

**Note:** The system will send notifications via all available methods (email, SMS, and WhatsApp) if contact information is available for the patient.

## Setup Instructions

### 1. Email Setup - Get Resend API Key

1. Sign up for a free account at [Resend](https://resend.com)
2. Navigate to your API Keys section
3. Create a new API key
4. Copy the API key

### 2. SMS & WhatsApp Setup - Get Twilio Credentials

**Note:** Twilio handles both SMS and WhatsApp, so you only need one Twilio account for both services.

1. Sign up for a free account at [Twilio](https://www.twilio.com)
2. Navigate to your Console Dashboard
3. Get your **Account SID** and **Auth Token** from the dashboard
4. Get a phone number for SMS:
   - Go to Phone Numbers → Buy a Number
   - Choose a number (free trial numbers are available)
   - Copy the phone number (format: +1234567890)
5. Enable WhatsApp (optional but recommended):
   - Go to Messaging → Try it out → Send a WhatsApp message
   - Follow the setup wizard to enable WhatsApp
   - You'll get a WhatsApp sender number (format: whatsapp:+14155238886 for sandbox, or your own number once approved)
   - **Sandbox mode**: For testing, you can use Twilio's WhatsApp sandbox. Recipients need to join by sending a code to Twilio
   - **Production**: Apply for WhatsApp Business API access in Twilio console for production use

### 3. Configure Environment Variables

Create or update your `.env.local` file in the root of your project:

```env
# Resend Email Service Configuration
RESEND_API_KEY=re_xxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# Optional: Customize sender information
RESEND_FROM_EMAIL=noreply@yourdomain.com
RESEND_FROM_NAME=Centre For Sports Science

# Twilio SMS & WhatsApp Service Configuration
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=your_auth_token_here
TWILIO_PHONE_NUMBER=+1234567890

# WhatsApp Configuration (optional - uses TWILIO_PHONE_NUMBER if not set)
# For sandbox: Use whatsapp:+14155238886
# For production: Use your approved WhatsApp Business number
TWILIO_WHATSAPP_NUMBER=whatsapp:+1234567890

# Optional: Clinic contact information (used in email/SMS footers)
NEXT_PUBLIC_CLINIC_EMAIL=info@centersportsscience.com
NEXT_PUBLIC_CLINIC_PHONE=+1 (555) 123-4567
```

### 4. Verify Domain (Production - Email)

For production use, you'll need to:

1. Add your domain in Resend dashboard
2. Verify domain ownership via DNS records
3. Update `RESEND_FROM_EMAIL` to use your verified domain

**Note:** In development, Resend provides a default sender email (`onboarding@resend.dev`) that works for testing.

### 5. Verify Phone Number (Production - SMS & WhatsApp)

For production SMS:
1. Your Twilio phone number is automatically verified
2. For testing, Twilio provides a trial number that can only send to verified phone numbers
3. To send to any number, upgrade your Twilio account or verify recipient numbers in the Twilio console

For production WhatsApp:
1. **Sandbox Mode (Testing)**: 
   - Recipients must join your sandbox by sending a code to Twilio
   - Format: Send "join [your-code]" to +1 415 523 8886
   - Limited to 24-hour messaging window after recipient joins
2. **Production Mode**:
   - Apply for WhatsApp Business API access in Twilio console
   - Requires business verification
   - Can send to any WhatsApp number
   - No 24-hour window restriction

**Note:** In development without `TWILIO_ACCOUNT_SID`, SMS and WhatsApp messages are logged to console instead of being sent.

### 6. Test Notifications

1. Start your development server: `npm run dev`
2. Register a new patient with email and phone number
3. Create an appointment for that patient
4. Check the patient's:
   - Email inbox for confirmation
   - Phone for SMS confirmation
   - WhatsApp for WhatsApp confirmation (if enabled and recipient has joined sandbox)

## Email, SMS & WhatsApp Templates

The system includes the following notification templates (available for email, SMS, and WhatsApp):

- `patient-registered` - Welcome message for new patients
- `appointment-created` - Appointment confirmation
- `appointment-reminder` - 24-hour reminder (requires scheduled job)
- `appointment-updated` - Appointment details changed
- `appointment-status-changed` - Status update notification
- `appointment-cancelled` - Cancellation notification

**Email templates** are HTML-formatted with responsive design and include clinic branding.

**SMS templates** are concise text messages optimized for mobile devices (160 characters or less where possible).

**WhatsApp templates** use emojis and formatting for better readability on WhatsApp (supports longer messages than SMS).

## How It Works

### Email Notifications
1. **Client-side**: Components call `sendEmailNotification()` from `lib/email.ts`
2. **API Route**: `/app/api/email/route.ts` handles email sending via Resend
3. **Email Service**: Resend API sends the email to the patient

### SMS Notifications
1. **Client-side**: Components call `sendSMSNotification()` from `lib/sms.ts`
2. **API Route**: `/app/api/sms/route.ts` handles SMS sending via Twilio
3. **SMS Service**: Twilio API sends the SMS to the patient's phone

### WhatsApp Notifications
1. **Client-side**: Components call `sendWhatsAppNotification()` from `lib/whatsapp.ts`
2. **API Route**: `/app/api/whatsapp/route.ts` handles WhatsApp sending via Twilio
3. **WhatsApp Service**: Twilio WhatsApp API sends the message to the patient's WhatsApp

### Phone Number Formatting
- The system automatically formats phone numbers to E.164 format (e.g., +1234567890)
- US numbers: Automatically adds +1 prefix if missing
- International numbers: Should include country code (e.g., +44 for UK)
- Invalid numbers are skipped with error logging

## Error Handling

- Email, SMS, and WhatsApp failures are logged but don't prevent the main operation (registration, appointment creation, etc.)
- In development mode:
  - Without `RESEND_API_KEY`, emails are logged to console instead of being sent
  - Without `TWILIO_ACCOUNT_SID`, SMS and WhatsApp messages are logged to console instead of being sent
- Check browser console and server logs for notification-related errors
- If one notification method fails, the others will still be attempted
- The system tries all available methods (email, SMS, WhatsApp) and reports which ones succeeded

## Appointment Reminders Setup

The system includes an automated reminder system that sends email and SMS reminders 24 hours before appointments.

### How It Works

1. **API Endpoint**: `/api/reminders` checks for appointments scheduled for tomorrow
2. **Dual Notifications**: Sends both email and SMS reminders if both contact methods are available
3. **Automatic Tracking**: Prevents duplicate reminders by tracking when each reminder was sent
4. **Smart Filtering**: Only sends reminders for appointments with status `pending` or `ongoing`

### Setting Up Automated Reminders

#### Option 1: Vercel Cron (Recommended for Vercel deployments)

If you're deploying to Vercel, the `vercel.json` file is already configured. The cron job will automatically run daily at 9 AM UTC.

**No additional setup required** - just deploy to Vercel!

#### Option 2: External Cron Service

Use any cron service to call the API endpoint daily:

1. **Cron-job.org** (Free):
   - URL: `https://your-domain.com/api/reminders`
   - Schedule: Daily at 9:00 AM (your timezone)
   - Method: GET

2. **EasyCron**:
   - URL: `https://your-domain.com/api/reminders`
   - Schedule: `0 9 * * *` (9 AM daily)
   - Method: GET

3. **GitHub Actions** (if using GitHub):
   ```yaml
   # .github/workflows/reminders.yml
   name: Send Appointment Reminders
   on:
     schedule:
       - cron: '0 9 * * *'  # 9 AM UTC daily
   jobs:
     send-reminders:
       runs-on: ubuntu-latest
       steps:
         - name: Trigger reminders
           run: |
             curl -X GET https://your-domain.com/api/reminders
   ```

#### Option 3: Manual Testing

You can manually trigger reminders for testing:

```bash
# Send reminders for tomorrow's appointments
curl https://your-domain.com/api/reminders

# Send reminders for a specific date
curl "https://your-domain.com/api/reminders?date=2024-12-25"
```

Or use POST request:
```bash
curl -X POST https://your-domain.com/api/reminders \
  -H "Content-Type: application/json" \
  -d '{"date": "2024-12-25"}'
```

### Reminder API Response

The API returns detailed information about reminders sent:

```json
{
  "success": true,
  "date": "2024-12-25",
  "totalAppointments": 5,
  "remindersSent": 4,
  "remindersFailed": 0,
  "remindersSkipped": 1,
  "details": [
    {
      "appointmentId": "APT123",
      "patient": "John Doe",
      "status": "sent"
    },
    {
      "appointmentId": "APT124",
      "patient": "Jane Smith",
      "status": "skipped",
      "reason": "No email address"
    }
  ]
}
```

### Reminder Tracking

The system automatically tracks which reminders have been sent:
- Each appointment gets a `reminderSent` timestamp field
- Reminders are only sent once per day per appointment
- If an appointment is rescheduled, a new reminder will be sent for the new date
- Both email and SMS are sent if available (at least one must succeed to mark as sent)

### Testing Reminders Locally

1. Create an appointment for tomorrow
2. Make sure the patient has both email address and phone number
3. Call the API endpoint:
   ```bash
   curl http://localhost:3000/api/reminders
   ```
4. Check the response - it will show which notifications were sent (email, SMS, or both)
5. Verify the email was received and SMS was received

## Troubleshooting

### Emails not sending

1. Check that `RESEND_API_KEY` is set in `.env.local`
2. Verify the API key is valid in Resend dashboard
3. Check server logs for error messages
4. Ensure patient email addresses are valid

### SMS not sending

1. Check that `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, and `TWILIO_PHONE_NUMBER` are set in `.env.local`
2. Verify credentials are valid in Twilio dashboard
3. Check server logs for error messages
4. Ensure patient phone numbers are in valid format (include country code)
5. **Trial accounts**: Can only send to verified phone numbers. Upgrade account or verify numbers in Twilio console

### WhatsApp not sending

1. Check that `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` are set in `.env.local`
2. Check `TWILIO_WHATSAPP_NUMBER` is set (or it will use `TWILIO_PHONE_NUMBER` with `whatsapp:` prefix)
3. **Sandbox mode**: Recipient must join your sandbox first by sending "join [code]" to +1 415 523 8886
4. **24-hour window**: In sandbox, you can only message recipients within 24 hours of their last message
5. **Production**: Apply for WhatsApp Business API access for unlimited messaging
6. Verify credentials are valid in Twilio dashboard
7. Check server logs for error messages

### Phone number format issues

- Phone numbers must include country code (e.g., +1 for US, +44 for UK)
- US numbers: Can be entered as 10 digits (e.g., 5551234567) - system will add +1
- Invalid formats are automatically skipped with error logging
- Check server logs to see which numbers were skipped and why

### Development mode

In development:
- Without `RESEND_API_KEY`, emails are logged to console instead of being sent
- Without `TWILIO_ACCOUNT_SID`, SMS messages are logged to console instead of being sent
- This allows you to test the flow without sending actual notifications

### Rate Limits

**Resend free tier:**
- 3,000 emails per month
- 100 emails per day

**Twilio free trial:**
- Limited credits for testing
- SMS: Can only send to verified phone numbers
- WhatsApp: Sandbox mode - recipients must join sandbox, 24-hour messaging window
- Upgrade for production use (unlimited SMS, WhatsApp Business API access)

For higher limits, upgrade your service plans.

## Support

For issues with:
- **Resend service**: Check [Resend Documentation](https://resend.com/docs)
- **Application code**: Review error logs and check component implementations

