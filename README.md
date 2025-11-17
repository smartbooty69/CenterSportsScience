# Center Sports Science - Clinical Management System

A comprehensive healthcare management system for physiotherapy and sports science clinics, built with Next.js, React, and Firebase.

## Features

### Clinical Team Dashboard

The Clinical Team dashboard provides a complete suite of tools for healthcare professionals to manage their patients, appointments, and schedules.

#### 1. Dashboard Overview
- **Statistics Cards**: Quick view of Active Caseload, Awaiting Start patients, Today's Sessions, and Completed appointments
- **Quick Actions**: Direct access to Calendar, Reports, Availability, and Patient Transfer
- **Daily Operations**: Today's timeline view and action items
- **Real-time Updates**: All data syncs automatically with Firestore

#### 2. Calendar & Appointments
- **Full Calendar View**: Month, Week, and Day views using FullCalendar
- **Patient Information**: Displays patient names and appointment times directly on calendar events
- **Availability Display**: Shows staff availability schedules on the calendar
- **Drag & Drop Rescheduling**: Easily reschedule appointments by dragging events
- **Appointment Details**: Click any appointment to view full details
- **Notification Center**: Upcoming appointment reminders

#### 3. View & Edit Reports
- **Patient Filtering**: Only shows patients assigned to the current staff member
- **Complete Physiotherapy Reports**: Comprehensive report forms including:
  - Patient history (present, past, surgical)
  - Medical investigations (X-ray, MRI, CT, Reports)
  - Personal history (smoking, drinking, sleep, hydration, nutrition)
  - Pain assessment (VAS scale, type, aggravating/relieving factors)
  - **Range of Motion (ROM) Assessment**: Full ROM evaluation for all joints
  - Manual Muscle Testing (MMT)
  - Treatment plans and follow-up visits
  - Clinical diagnosis and recommendations
- **PDF Generation**: Generate professional physiotherapy report PDFs
- **Auto-save**: Changes are saved automatically

#### 4. My Availability
- **Full Month Calendar View**: See and manage availability for entire months
- **Date-Specific Scheduling**: Set different availability for specific dates
- **Auto-save**: All changes save automatically to Firestore
- **Copy to Month**: Quickly copy a day's schedule to all days in the month
- **Remove Schedule**: Easily remove availability for specific dates

#### 5. Transfer Patients
- **Assigned Patients Only**: Shows only patients assigned to current staff member
- **Transfer to Other Therapists**: Transfer patient care to another clinician
- **Transfer History**: Track all patient transfers with timestamps and reasons
- **Status Filtering**: Filter by patient status (pending, ongoing, completed, cancelled)

### Front Desk Dashboard

Comprehensive front desk management system for patient registration, appointment scheduling, and administrative tasks.

### Admin Dashboard

Full administrative control panel for managing staff, patients, appointments, billing, and system configuration.

## Technology Stack

- **Framework**: Next.js 16.0.1 (with Turbopack)
- **UI Library**: React 18
- **Database**: Firebase Firestore
- **Authentication**: Firebase Auth
- **Calendar**: FullCalendar
- **Styling**: Tailwind CSS
- **PDF Generation**: jsPDF

## Key Features

### Real-time Data Synchronization
- All components use Firestore `onSnapshot` listeners for real-time updates
- Changes made by one user are immediately visible to others

### Role-Based Access Control
- **Clinical Team**: Access to patient care tools, reports, and schedules
- **Front Desk**: Patient registration and appointment management
- **Admin**: Full system access and configuration

### Patient Assignment System
- Patients are assigned to specific clinicians
- Clinical team members only see their assigned patients
- Easy patient transfer between clinicians

### Notification System
- Email notifications for appointment status changes
- SMS notifications for cancellations
- Notifications sent to both patients and staff members
- Automated appointment reminders (via API endpoint)

### Availability Management
- Date-specific availability scheduling
- Visual calendar display of availability
- Integration with appointment booking system

## Getting Started

### Prerequisites
- Node.js 18+ 
- npm or yarn
- Firebase project with Firestore enabled

### Installation

1. Clone the repository
```bash
git clone <repository-url>
cd CenterSportsScience
```

2. Install dependencies
```bash
npm install
```

3. Set up environment variables
Create a `.env.local` file with your Firebase configuration:
```
NEXT_PUBLIC_FIREBASE_API_KEY=your_api_key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your_auth_domain
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your_project_id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your_storage_bucket
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
NEXT_PUBLIC_FIREBASE_APP_ID=your_app_id

# Sentry Error Tracking (optional but recommended)
NEXT_PUBLIC_SENTRY_DSN=your_sentry_dsn
SENTRY_ORG=your_sentry_org
SENTRY_PROJECT=your_sentry_project
SENTRY_AUTH_TOKEN=your_sentry_auth_token
```

4. Run the development server
```bash
npm run dev
```

5. Open [http://localhost:3000](http://localhost:3000) in your browser

## Project Structure

```
├── app/                    # Next.js app directory
│   ├── clinical-team/     # Clinical team routes
│   ├── frontdesk/         # Front desk routes
│   └── admin/             # Admin routes
├── components/            # React components
│   ├── clinical-team/    # Clinical team components
│   ├── frontdesk/        # Front desk components
│   └── admin/            # Admin components
├── lib/                   # Utility functions
│   ├── firebase.ts       # Firebase configuration
│   ├── email.ts          # Email notification functions
│   ├── sms.ts            # SMS notification functions
│   └── pdfGenerator.ts   # PDF generation
└── contexts/             # React contexts
    └── AuthContext.tsx   # Authentication context
```

## Recent Updates

### Clinical Team Dashboard Enhancements
- ✅ Added full month view for availability scheduling
- ✅ Integrated availability display on calendar
- ✅ Added patient name and time display on calendar events
- ✅ Implemented notifications for completed/cancelled appointments
- ✅ Filtered reports and transfers to show only assigned patients
- ✅ Removed separate ROM Assessment section (now integrated in reports)
- ✅ Fixed remove schedule functionality
- ✅ Auto-save for all availability changes

### Admin Updates
- ✅ Audit Logs: Added Admin viewer at `/admin/audit` with filters and CSV export (actions logged: patients import/export, admin reset password, billing notifications)
- ✅ Billing: Cycle-level reporting view and Pending table CSV/Excel export
- ✅ Patients: Advanced filters (status, assigned doctor, registered date range, text search)
- ✅ Admin Reports: Download PDF and Print actions enabled

### What’s Pending
- Reports: Templates (save/load configurations)

### Quick Test Checklist
- Patients: search, status filter, date-from/to, doctor filter; CSV export; import and duplicate skipping; profile notes/attachments/history
- Billing: complete appointment → bill auto-sync by patient type rules; cycle reports update; pending export; notifications work and log
- Audit Logs: actions appear in `/admin/audit`; filters work; CSV export
- Guards: protected APIs require Authorization header and correct roles

## Contributing

This is a private project. For questions or issues, please contact the development team.

## License

Proprietary - All rights reserved
