// calendar.js

// Data helpers
function getAppointments() {
  return JSON.parse(localStorage.getItem('appointments')) || [];
}
function getPatients() {
  return JSON.parse(localStorage.getItem('patients')) || [];
}
function getUsers() {
  return JSON.parse(localStorage.getItem('users')) || [];
}

// Utility functions
function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d)) return dateStr;
  return d.toLocaleDateString('en-IN', { year:'numeric', month:'short', day:'numeric' });
}
function capitalize(str) {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

function renderCalendar() {
  const appts = getAppointments();
  const pats = getPatients();
  const patMap = {};
  pats.forEach(p => patMap[p.patientId] = p);

  // Prepare events for FullCalendar
  const events = appts.map((appt, idx) => {
    const patient = patMap[appt.patientId] || {};
    return {
      id: idx,
      title: `${patient.name || appt.patient || 'Unknown'} • ${appt.doctor || '-'}`,
      start: appt.date,
      extendedProps: {...appt, patientName: patient.name || appt.patient || '', patientId: patient.patientId || appt.patientId, idx}
    };
  });

  // Fetch active doctors from users
  const users = getUsers();
  const doctors = users.filter(u =>
    (u.role === "Doctor" || u.role === "Doctor/Physio") &&
    (u.status === "Active" || !u.status) &&
    u.name
  );

  // Populate doctor dropdown helper
  function populateDoctorDropdown(select) {
    select.innerHTML = '<option value="all">All Doctors</option>' +
      doctors.map(doc => `<option value="${doc.name}">${doc.name}</option>`).join('');
  }

  // FullCalendar initialization
  const calendarEl = document.getElementById('calendar');
  const calendar = new FullCalendar.Calendar(calendarEl, {
    initialView: 'dayGridMonth',
    headerToolbar: { left: 'prev,next today', center: 'title', right: '' },
    events,
    fixedWeekCount: false,
    eventDisplay: 'block',
    editable: false,
    dateClick(info) {
      showAppointmentsForDate(info.dateStr);
    },
    eventClick(info) {
      info.jsEvent.preventDefault(); // Prevent default navigation
      openAppointmentDetails(info.event.extendedProps);
    }
  });
  calendar.render();

  // Show appointment list modal for a given date
  function showAppointmentsForDate(dateStr) {
    const appts = getAppointments();
    const pats = getPatients();
    const patMap = {};
    pats.forEach(p => patMap[p.patientId] = p);

    const modal = new bootstrap.Modal(document.getElementById('eventListModal'));
    document.getElementById('modalDateString').textContent = formatDate(dateStr);

    const doctorFilter = document.getElementById('modalDoctorFilter');
    const statusFilter = document.getElementById('modalStatusFilter');
    populateDoctorDropdown(doctorFilter);

    function renderEventList() {
      let eventsForDay = appts.filter(a => a.date === dateStr);
      if (doctorFilter.value !== 'all')
        eventsForDay = eventsForDay.filter(a => a.doctor === doctorFilter.value);
      if (statusFilter.value !== 'all')
        eventsForDay = eventsForDay.filter(a => (a.status || 'pending').toLowerCase() === statusFilter.value);

      const ul = document.getElementById('modalEventList');
      ul.innerHTML = '';

      if (eventsForDay.length === 0) {
        ul.innerHTML = `<li class="list-group-item text-muted">No appointments found for selected criteria.</li>`;
        return;
      }

      eventsForDay.forEach((a) => {
        const patient = patMap[a.patientId] || {};
        ul.innerHTML += `
          <li class="list-group-item d-flex justify-content-between" data-idx="${a.idx}" style="cursor:pointer">
            <div>
              <span class="fw-bold">${patient.name || a.patient || a.patientId || 'N/A'}</span>
              <small class="text-muted d-block">${a.doctor || '-'} • <span class="text-capitalize">${capitalize(a.status) || 'Pending'}</span></small>
              ${a.time ? `<span class="badge bg-info text-dark mt-1">${a.time}</span>` : ''}
            </div>
            <div>
              <span class="badge rounded-pill 
                ${a.status === 'completed' ? 'bg-success' : 
                  a.status === 'pending' ? 'bg-warning text-dark' :
                  a.status === 'ongoing' ? 'bg-info' :
                  a.status === 'cancelled' ? 'bg-danger' : 'bg-secondary'}">${capitalize(a.status) || 'Pending'}</span>
            </div>
          </li>`;
      });

      // Add click handlers to open detailed modal on list item click
      document.querySelectorAll('#modalEventList li[data-idx]').forEach(li => {
        li.onclick = () => {
          const idx = parseInt(li.getAttribute('data-idx'));
          if (!isNaN(idx)) {
            openAppointmentDetails(appts[idx]);
            bootstrap.Modal.getInstance(document.getElementById('eventListModal')).hide();
          }
        };
      });
    }

    doctorFilter.onchange = statusFilter.onchange = renderEventList;

    renderEventList();
    modal.show();
  }

  // Open detailed appointment modal
  function openAppointmentDetails(appt) {
    const pats = getPatients();
    const patMap = {};
    pats.forEach(p => patMap[p.patientId] = p);
    const patient = patMap[appt.patientId] || {};

    document.getElementById('detailPatientName').textContent = patient.name || appt.patient || 'N/A';
    document.getElementById('detailPatientId').textContent = appt.patientId || '';
    document.getElementById('detailDate').textContent = formatDate(appt.date) || '';
    document.getElementById('detailTime').textContent = appt.time || '';
    document.getElementById('detailDoctor').textContent = appt.doctor || '';
    document.getElementById('detailStatus').textContent = capitalize(appt.status) || '';
    document.getElementById('detailComplaint').textContent = patient.complaint || patient.medicalHistory || '';
    document.getElementById('detailNotes').textContent = appt.notes || '';

    const detailsModalEl = document.getElementById('appointmentDetailsModal');
    const detailsModal = bootstrap.Modal.getOrCreateInstance(detailsModalEl);
    detailsModal.show();
  }

  // Render notifications sidebar - upcoming appointments within next 24 hours
  function renderNotifications() {
    const appts = getAppointments();
    const pats = getPatients();
    const patMap = {};
    pats.forEach(p => patMap[p.patientId] = p);

    const now = new Date();
    const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    const upcoming = appts.filter(a => {
      const dt = a.date && new Date(a.date);
      return dt && dt >= now && dt <= tomorrow;
    }).sort((a, b) => {
      let d1 = new Date(a.date);
      let d2 = new Date(b.date);
      if (a.time && b.time) {
        d1 = new Date(`${a.date}T${a.time}:00`);
        d2 = new Date(`${b.date}T${b.time}:00`);
      }
      return d1 - d2;
    });

    const container = document.getElementById('notificationsList');
    container.innerHTML = '';

    if (upcoming.length === 0) {
      container.innerHTML = '<div class="text-muted">No upcoming appointments in the next 24 hours.</div>';
      return;
    }

    upcoming.forEach(a => {
      const patient = patMap[a.patientId] || {};
      container.innerHTML += `
        <div class="noti-appt mb-2 pb-1 border-bottom">
          <b>${patient.name || a.patient || a.patientId || 'N/A'}</b> with <span>${a.doctor || '-'}</span><br/>
          <span class="text-secondary">${a.date} ${a.time || ''}</span>
          <span class="badge 
            ${a.status === 'completed' ? 'bg-success' :
             a.status === 'pending' ? 'bg-warning text-dark' :
             a.status === 'ongoing' ? 'bg-info' :
             a.status === 'cancelled' ? 'bg-danger' : 'bg-secondary'} ms-2">${capitalize(a.status) || 'Pending'}</span>
        </div>`;
    });
  }

  // Initial render notifications
  renderNotifications();
}

document.addEventListener('DOMContentLoaded', renderCalendar);