(() => {
  // Session check: ensure user is logged in as Physio
  const currentUser = JSON.parse(localStorage.getItem('currentUser') || '{}');
  if (!currentUser.role || currentUser.role !== 'Physio') {
    alert('Unauthorized access. Please log in as Physio.');
    window.location.href = 'index.html'; // Redirect to login page
    return;
  }

  const physioName = currentUser.name || 'Dr. Arun';

  const pendingList = document.getElementById('pendingList');
  const ongoingList = document.getElementById('ongoingList');
  const completedList = document.getElementById('completedList');

  const modal = new bootstrap.Modal(document.getElementById('treatmentModal'));
  const treatmentForm = document.getElementById('treatmentForm');
  const patientNameField = document.getElementById('patientName');
  const treatmentProcedureField = document.getElementById('treatmentProcedure');
  const treatmentPlanField = document.getElementById('treatmentPlan');

  let selectedPatientIndex = null;

  document.getElementById('physioNameDisplay').textContent = physioName;

  function loadPatients() {
    const patients = JSON.parse(localStorage.getItem('patients')) || [];
    const filteredPatients = patients.filter(p => p.assignedDoctor === physioName);

    pendingList.innerHTML = '';
    ongoingList.innerHTML = '';
    completedList.innerHTML = '';

    let pendingCount = 0, ongoingCount = 0, completedCount = 0;

    filteredPatients.forEach((p, i) => {
      const li = document.createElement('li');
      li.className = 'list-group-item d-flex justify-content-between align-items-center';

      const span = document.createElement('span');
      span.textContent = p.name || 'Unnamed Patient';

      const editBtn = document.createElement('button');
      editBtn.className = 'btn btn-sm btn-outline-primary';
      editBtn.textContent = 'Edit Report';
      editBtn.addEventListener('click', () => {
        window.location.href = `edit-report.html?patientId=${encodeURIComponent(p.patientId)}`;
      });

      const treatmentBtn = document.createElement('button');
      treatmentBtn.className = 'btn btn-sm btn-outline-success ms-2';
      treatmentBtn.textContent = 'Fill Treatment Plan';
      treatmentBtn.style.display = (p.status === 'ongoing' || p.status === 'pending') ? 'inline-block' : 'none';
      treatmentBtn.addEventListener('click', () => openTreatmentModal(i, p));

      li.appendChild(span);
      li.appendChild(editBtn);
      li.appendChild(treatmentBtn);

      if (p.status === 'pending') {
        pendingList.appendChild(li);
        pendingCount++;
      } else if (p.status === 'ongoing') {
        ongoingList.appendChild(li);
        ongoingCount++;
      } else if (p.status === 'completed') {
        completedList.appendChild(li);
        completedCount++;
      } else {
        pendingList.appendChild(li);
        pendingCount++;
      }
    });

    document.getElementById('pendingCount').textContent = pendingCount;
    document.getElementById('ongoingCount').textContent = ongoingCount;
    document.getElementById('completedCount').textContent = completedCount;

    drawPhysioEarningsChart(physioName);
  }

  function openTreatmentModal(patientIndex, patient) {
    selectedPatientIndex = patientIndex;
    patientNameField.value = patient.name || '';
    treatmentProcedureField.value = patient.treatmentProcedure || '';
    treatmentPlanField.value = patient.treatmentPlan || '';
    modal.show();
  }

  treatmentForm.addEventListener('submit', e => {
    e.preventDefault();
    if (selectedPatientIndex === null) {
      alert('No patient selected!');
      return;
    }
    const patients = JSON.parse(localStorage.getItem('patients')) || [];
    if (!patients[selectedPatientIndex]) {
      alert('Patient data not found!');
      modal.hide();
      loadPatients();
      return;
    }

    const treatmentProcedure = treatmentProcedureField.value.trim();
    const treatmentPlan = treatmentPlanField.value.trim();

    patients[selectedPatientIndex].treatmentProcedure = treatmentProcedure;
    patients[selectedPatientIndex].treatmentPlan = treatmentPlan;
    patients[selectedPatientIndex].status = 'completed';

    if (!patients[selectedPatientIndex].billing) {
      patients[selectedPatientIndex].billing = {
        amount: null,
        date: null,
        pending: true,
      };
    }

    localStorage.setItem('patients', JSON.stringify(patients));

    alert('Treatment plan saved! Patient marked as completed and billing pending.');

    modal.hide();
    loadPatients();
  });

  function renderCalendar() {
    const calendarEl = document.getElementById('calendar');
    const patients = JSON.parse(localStorage.getItem('patients')) || [];
    const appointments = JSON.parse(localStorage.getItem('appointments')) || [];

    const physioPatientIds = patients.filter(p => p.assignedDoctor === physioName).map(p => p.patientId);
    const upcomingAppts = appointments.filter(a => physioPatientIds.includes(a.patientId));

    const events = upcomingAppts.map((appt, idx) => ({
      id: idx,
      title: `${appt.patient || 'Unknown Patient'} • ${appt.doctor || ''}`,
      start: appt.date,
      extendedProps: { ...appt },
    }));

    const calendar = new FullCalendar.Calendar(calendarEl, {
      initialView: 'dayGridMonth',
      height: 600,
      headerToolbar: { left: 'prev,next today', center: 'title', right: '' },
      events,
      dateClick(info) {
        showAppointmentsByDate(info.dateStr, upcomingAppts);
      },
      eventClick(info) {
        info.jsEvent.preventDefault();
        const pid = info.event.extendedProps.patientId;
        if (pid) {
          window.location.href = `edit-report.html?patientId=${encodeURIComponent(pid)}`;
        } else {
          alert('Patient ID is missing for this appointment.');
        }
      },
      fixedWeekCount: false,
    });
    calendar.render();
  }

  function showAppointmentsByDate(dateStr, appts) {
    const filteredAppts = appts.filter(a => a.date === dateStr);
    if (filteredAppts.length === 0) {
      alert('No appointments on this date.');
      return;
    }
    let message = `Appointments on ${dateStr}:\n\n`;
    filteredAppts.forEach((a, i) => {
      message += `${i + 1}. Patient: ${a.patient}\n     Doctor: ${a.doctor}\n     Time: ${a.time ?? 'N/A'}\n\n`;
    });
    alert(message);
  }

  function drawPhysioEarningsChart(doctorName) {
    const patients = JSON.parse(localStorage.getItem('patients')) || [];
    const earningsPerMonth = {};
    patients.forEach(p => {
      if (p.assignedDoctor !== doctorName) return;
      if (!p.billing || !p.billing.amount || !p.billing.date) return;

      const dt = new Date(p.billing.date);
      if (isNaN(dt)) return;
      const month = dt.toLocaleString('default', { month: 'short', year: 'numeric' });

      if (!earningsPerMonth[month]) earningsPerMonth[month] = 0;
      earningsPerMonth[month] += parseFloat(p.billing.amount);
    });

    const labels = Object.keys(earningsPerMonth);
    const data = Object.values(earningsPerMonth);

    const ctx = document.getElementById('physioEarningsChart').getContext('2d');
    if (window.physioChart) window.physioChart.destroy();

    window.physioChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [{
          label: 'Earnings (₹)',
          data,
          borderColor: 'green',
          backgroundColor: 'rgba(0,128,0,0.2)',
          tension: 0.4,
        }],
      },
      options: {
        responsive: true,
        plugins: {
          legend: { display: true },
          title: { display: true, text: 'Monthly Earnings' },
        },
      },
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    loadPatients();
    renderCalendar();
  });
})();
