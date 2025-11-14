# Integration Guide - New Appointment Features

This guide shows how to integrate the new appointment features into your existing components.

## Features Implemented

1. ✅ **Appointment Conflict Detection** - Utility and API
2. ✅ **Appointment Rescheduling** - Dedicated workflow component
3. ✅ **Appointment Cancellation** - Enhanced workflow with notifications
4. ✅ **Appointment Templates** - Save/load/reuse templates
5. ✅ **Recurring Appointments** - Create appointment series
6. ✅ **Dashboard Analytics Charts** - Chart.js integration
7. ✅ **Dashboard Widgets** - Reusable widget components
8. ✅ **Availability Templates** - Save/load availability schedules
9. ✅ **Availability Conflict Detection** - Check conflicts when setting availability

## Integration Examples

### 1. Adding Reschedule and Cancel to Appointments Component

```typescript
import RescheduleDialog from '@/components/appointments/RescheduleDialog';
import CancelDialog from '@/components/appointments/CancelDialog';
import { updateDoc, doc } from 'firebase/firestore';
import { db } from '@/lib/firebase';

// In your component:
const [rescheduleDialog, setRescheduleDialog] = useState<{isOpen: boolean; appointment: any}>({
  isOpen: false,
  appointment: null
});
const [cancelDialog, setCancelDialog] = useState<{isOpen: boolean; appointment: any}>({
  isOpen: false,
  appointment: null
});

// Add buttons to your appointment row:
<button onClick={() => setRescheduleDialog({isOpen: true, appointment: apt})}>
  Reschedule
</button>
<button onClick={() => setCancelDialog({isOpen: true, appointment: apt})}>
  Cancel
</button>

// Add handlers:
const handleReschedule = async (newDate: string, newTime: string) => {
  if (!rescheduleDialog.appointment) return;
  await updateDoc(doc(db, 'appointments', rescheduleDialog.appointment.id), {
    date: newDate,
    time: newTime,
  });
  // Send notifications...
};

const handleCancel = async (reason: string) => {
  if (!cancelDialog.appointment) return;
  await updateDoc(doc(db, 'appointments', cancelDialog.appointment.id), {
    status: 'cancelled',
    cancellationReason: reason,
    cancelledAt: new Date().toISOString(),
  });
  // Send notifications...
};

// Add dialogs to JSX:
<RescheduleDialog
  isOpen={rescheduleDialog.isOpen}
  appointment={rescheduleDialog.appointment}
  onClose={() => setRescheduleDialog({isOpen: false, appointment: null})}
  onConfirm={handleReschedule}
  allAppointments={appointments}
/>

<CancelDialog
  isOpen={cancelDialog.isOpen}
  appointment={cancelDialog.appointment}
  onClose={() => setCancelDialog({isOpen: false, appointment: null})}
  onConfirm={handleCancel}
/>
```

### 2. Adding Appointment Templates

```typescript
import AppointmentTemplates from '@/components/appointments/AppointmentTemplates';

// In your booking form:
const [selectedTemplate, setSelectedTemplate] = useState(null);

// When template is selected:
const handleTemplateSelect = (template) => {
  setFormData({
    ...formData,
    doctor: template.doctor,
    time: template.time,
    notes: template.notes || '',
  });
};

// Add to your form:
<AppointmentTemplates
  doctor={formData.doctor}
  onSelectTemplate={handleTemplateSelect}
/>
```

### 3. Adding Recurring Appointments

```typescript
import RecurringAppointmentDialog from '@/components/appointments/RecurringAppointmentDialog';

const [recurringDialog, setRecurringDialog] = useState(false);

const handleCreateRecurring = async (data) => {
  const response = await fetch('/api/appointments/recurring', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      patientId: selectedPatient.id,
      patient: selectedPatient.name,
      doctor: selectedDoctor,
      ...data,
    }),
  });
  const result = await response.json();
  if (result.success) {
    alert(`Created ${result.data.count} appointments`);
  }
};

<RecurringAppointmentDialog
  isOpen={recurringDialog}
  patientId={selectedPatient.id}
  patient={selectedPatient.name}
  doctor={selectedDoctor}
  onClose={() => setRecurringDialog(false)}
  onConfirm={handleCreateRecurring}
/>
```

### 4. Adding Conflict Detection to Appointment Creation

```typescript
import { checkAppointmentConflict } from '@/lib/appointmentUtils';

const handleCreateAppointment = async () => {
  // Check for conflicts before creating
  const conflict = checkAppointmentConflict(
    appointments,
    {
      doctor: formData.doctor,
      date: formData.date,
      time: formData.time,
    }
  );

  if (conflict.hasConflict) {
    const confirm = window.confirm(
      `Conflict detected with ${conflict.conflictingAppointments.length} appointment(s). Continue anyway?`
    );
    if (!confirm) return;
  }

  // Proceed with creation...
};
```

### 5. Adding Dashboard Charts

```typescript
import StatsChart from '@/components/dashboard/StatsChart';
import DashboardWidget from '@/components/dashboard/DashboardWidget';

// Prepare chart data
const appointmentChartData = {
  labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
  datasets: [{
    label: 'Appointments',
    data: [5, 8, 6, 10, 7, 4, 3],
    borderColor: 'rgb(14, 165, 233)',
    backgroundColor: 'rgba(14, 165, 233, 0.1)',
  }],
};

// Use in dashboard:
<DashboardWidget title="Weekly Appointments" icon="fas fa-chart-line">
  <StatsChart type="line" data={appointmentChartData} />
</DashboardWidget>
```

### 6. Adding Availability Templates

```typescript
// In Availability component, add template management:

const [templates, setTemplates] = useState([]);
const [showTemplates, setShowTemplates] = useState(false);

const loadTemplates = async () => {
  const response = await fetch('/api/availability/templates');
  const result = await response.json();
  if (result.success) {
    setTemplates(result.data);
  }
};

const saveAsTemplate = async (name: string) => {
  const response = await fetch('/api/availability/templates', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, schedule }),
  });
  if (response.ok) {
    await loadTemplates();
  }
};

const loadTemplate = (template) => {
  setSchedule(template.schedule);
};
```

## API Endpoints

### Appointment Conflict Check
- `POST /api/appointments/check-conflict`
- Body: `{ doctor, date, time, duration?, appointmentId? }`
- Returns: `{ success, data: { hasConflict, conflictingAppointments } }`

### Appointment Templates
- `GET /api/appointments/templates?doctor=...` - List templates
- `POST /api/appointments/templates` - Create template
- `DELETE /api/appointments/templates?id=...` - Delete template

### Recurring Appointments
- `POST /api/appointments/recurring`
- Body: `{ patientId, patient, doctor, startDate, time, frequency, count, notes? }`
- Returns: `{ success, data: { count, appointments } }`

### Availability Templates
- `GET /api/availability/templates` - List templates
- `POST /api/availability/templates` - Create template
- `DELETE /api/availability/templates?id=...` - Delete template

## Utility Functions

### `checkAppointmentConflict(appointments, newAppointment, defaultDuration?)`
Checks if a new appointment conflicts with existing ones.

### `checkAvailabilityConflict(availability, date, time, duration?)`
Checks if an appointment time is within staff availability.

### `generateRecurringDates(startDate, frequency, count)`
Generates an array of dates for recurring appointments.

## Next Steps

1. Integrate these components into your existing appointment management pages
2. Add conflict detection to appointment creation flows
3. Enhance dashboards with charts and widgets
4. Add availability template management to the Availability component
5. Test all features thoroughly

