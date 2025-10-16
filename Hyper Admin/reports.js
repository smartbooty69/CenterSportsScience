(() => {
  // Utility functions
  function getPatients() {
    return JSON.parse(localStorage.getItem('patients') || '[]');
  }
  function getAppointments() {
    return JSON.parse(localStorage.getItem('appointments') || '[]');
  }
  function getUsers() {
    return JSON.parse(localStorage.getItem('users') || '[]');
  }

  function calculateAge(dob) {
    if (!dob) return "";
    const birthDate = new Date(dob);
    if (isNaN(birthDate)) return "";
    const diff = Date.now() - birthDate.getTime();
    const ageDt = new Date(diff);
    return Math.abs(ageDt.getUTCFullYear() - 1970);
  }

  function capitalize(str) {
    if (!str) return "";
    return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
  }

  function dateWithinDays(dateStr, days) {
    if (!dateStr || days === 'all') return true;
    const d = new Date(dateStr);
    if (isNaN(d)) return false;
    const now = new Date();
    const diffDays = (now - d) / (1000 * 60 * 60 * 24);
    return diffDays <= Number(days);
  }

  // Fill doctor filter dropdown dynamically from active doctors
  function populateDoctorFilter() {
    const doctorFilter = document.getElementById('doctorFilter');
    const users = getUsers();
    const doctors = users.filter(u =>
      (u.role === 'Doctor' || u.role === 'Doctor/Physio') &&
      (u.status === 'Active' || !u.status) &&
      u.name
    );
    doctorFilter.innerHTML = '<option value="all" selected>All Doctors</option>';
    doctors.forEach(doc => {
      const option = document.createElement('option');
      option.value = doc.name;
      option.textContent = doc.name;
      doctorFilter.appendChild(option);
    });
  }

  // Render patient summary cards
  function updateSummaryCards(filteredPatients) {
    document.getElementById('totalPatients').textContent = filteredPatients.length;
    document.getElementById('pendingCount').textContent = filteredPatients.filter(p => (p.status || 'pending').toLowerCase() === 'pending').length;
    document.getElementById('ongoingCount').textContent = filteredPatients.filter(p => (p.status || '').toLowerCase() === 'ongoing').length;
    document.getElementById('completedCount').textContent = filteredPatients.filter(p => (p.status || '').toLowerCase() === 'completed').length;
  }

  // Render status chart
  let chartInstance = null;
  function renderStatusChart(filteredPatients) {
    const pending = filteredPatients.filter(p => (p.status || 'pending').toLowerCase() === 'pending').length;
    const ongoing = filteredPatients.filter(p => (p.status || '').toLowerCase() === 'ongoing').length;
    const completed = filteredPatients.filter(p => (p.status || '').toLowerCase() === 'completed').length;

    const ctx = document.getElementById('statusChart').getContext('2d');
    if (chartInstance) chartInstance.destroy();

    chartInstance = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: ['Pending', 'Ongoing', 'Completed'],
        datasets: [{
          label: 'Patients',
          data: [pending, ongoing, completed],
          backgroundColor: ['#ffc107', '#17a2b8', '#28a745'],
        }],
      },
      options: {
        responsive: true,
        plugins: { legend: { display: false } },
        scales: {
          y: { beginAtZero: true, precision: 0 }
        }
      },
    });
  }

  // Render patients table with filtering
  function renderReport() {
    const patients = getPatients();
    const appointments = getAppointments();
    const statusFilterValue = document.getElementById('statusFilter').value;
    const doctorFilterValue = document.getElementById('doctorFilter').value;
    const dateRangeValue = document.getElementById('dateRangeFilter').value;
    const searchValue = document.getElementById('searchInput').value.trim().toLowerCase();

    // Map patientId to appointments (get distinct doctors)
    const patientAppointmentsMap = {};
    appointments.forEach(appt => {
      if (!appt.patientId) return;
      if (!patientAppointmentsMap[appt.patientId]) patientAppointmentsMap[appt.patientId] = [];
      patientAppointmentsMap[appt.patientId].push(appt);
    });

    // Filtered patients (by status, doctor, date range, search)
    const filtered = patients.filter(p => {
      const pStatus = (p.status || 'pending').toLowerCase();
      if (statusFilterValue !== 'all' && pStatus !== statusFilterValue) return false;

      // Doctor filter - patient has at least one appointment with that doctor
      const appts = patientAppointmentsMap[p.patientId] || [];
      const doctorsForPatient = [...new Set(appts.map(a => a.doctor).filter(Boolean))];
      if (doctorFilterValue !== 'all' && !doctorsForPatient.map(d => d.toLowerCase()).includes(doctorFilterValue.toLowerCase())) return false;

      // Date range filter (based on latest appointment date)
      if (dateRangeValue !== 'all') {
        // Check if any appointment in range
        const inDateRange = appts.some(a => dateWithinDays(a.date, dateRangeValue));
        if (!inDateRange) return false;
      }

      // Search in name/id/phone
      if (searchValue) {
        const nameMatch = (p.name || '').toLowerCase().includes(searchValue);
        const idMatch = (p.patientId || '').toLowerCase().includes(searchValue);
        const phoneMatch = (p.phone || '').toLowerCase().includes(searchValue);
        if (!(nameMatch || idMatch || phoneMatch)) return false;
      }

      return true;
    });

    const tbody = document.getElementById('reportTableBody');
    tbody.innerHTML = '';

    filtered.forEach((p, idx) => {
      const appts = patientAppointmentsMap[p.patientId] || [];
      const doctorsForPatient = [...new Set(appts.map(a => a.doctor).filter(Boolean))];

      tbody.insertAdjacentHTML('beforeend', `
        <tr>
          <td>${p.patientId || ''}</td>
          <td>${p.name || ''}</td>
          <td>${calculateAge(p.dob) || ''}</td>
          <td>${p.gender || p.sex || ''}</td>
          <td>${p.complaint || p.medicalHistory || ''}</td>
          <td><span class="badge-status badge-${(p.status || 'pending').toLowerCase()}">${capitalize(p.status)}</span></td>
          <td>${doctorsForPatient.length ? doctorsForPatient.map(doc => `<span title="${doc}">${doc}</span>`).join(', ') : 'N/A'}</td>
          <td>
            <button class="btn btn-sm btn-outline-primary me-1" onclick="viewPatient(${idx})" title="View Details">
              <i class="fas fa-eye"></i>
            </button>
            <button class="btn btn-sm btn-outline-danger" onclick="deletePatient(${idx})" title="Delete Patient">
              <i class="fas fa-trash"></i>
            </button>
          </td>
        </tr>
      `);
    });

    updateSummaryCards(filtered);
    renderStatusChart(filtered);
  }

  // View patient modal show
  window.viewPatient = function(index) {
    const patients = getPatients();
    const appointments = getAppointments();
    const users = getUsers();
    if (!patients[index]) return;
    const p = patients[index];

    document.getElementById('modalPatientId').textContent = p.patientId || '';
    document.getElementById('modalPatientName').textContent = p.name || '';
    document.getElementById('modalPatientAge').textContent = calculateAge(p.dob) || '';
    document.getElementById('modalPatientGender').textContent = p.gender || p.sex || '';
    document.getElementById('modalPatientComplaint').textContent = p.complaint || p.medicalHistory || '';
    document.getElementById('modalPatientStatus').textContent = capitalize(p.status) || 'Pending';

    // Doctors assigned (unique doctor names from appointments for this patient)
    const appts = appointments.filter(a => a.patientId === p.patientId);
    const doctorsForPatient = [...new Set(appts.map(a => a.doctor).filter(Boolean))];

    const modalDoctorSpan = document.getElementById('modalPatientDoctors');
    modalDoctorSpan.innerHTML = doctorsForPatient.length
      ? doctorsForPatient.map(d => `<span>${d}</span>`).join(', ')
      : 'N/A';

    const modalEl = document.getElementById('viewPatientModal');
    const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
    modal.show();
  };

  // Delete patient handler
  window.deletePatient = function(index) {
    const patients = getPatients();
    if (!patients[index]) return;
    if (!confirm(`Are you sure you want to delete patient: ${patients[index].name || patients[index].patientId}? This action cannot be undone.`)) {
      return;
    }
    patients.splice(index, 1);
    localStorage.setItem('patients', JSON.stringify(patients));

    // Also optionally delete all related appointments? (Uncomment if required)
    /*
    let appointments = getAppointments();
    appointments = appointments.filter(a => a.patientId !== patients[index].patientId);
    localStorage.setItem('appointments', JSON.stringify(appointments));
    */

    renderReport();
  };

  // Export filtered report as CSV
  document.getElementById('exportReportsBtn').addEventListener('click', () => {
    const patients = getPatients();
    const appointments = getAppointments();
    const users = getUsers();

    const statusFilterValue = document.getElementById('statusFilter').value;
    const doctorFilterValue = document.getElementById('doctorFilter').value;
    const dateRangeValue = document.getElementById('dateRangeFilter').value;
    const searchValue = document.getElementById('searchInput').value.trim().toLowerCase();

    // Map patientId => their appointments
    const patientAppointmentsMap = {};
    appointments.forEach(appt => {
      if (!appt.patientId) return;
      if (!patientAppointmentsMap[appt.patientId]) patientAppointmentsMap[appt.patientId] = [];
      patientAppointmentsMap[appt.patientId].push(appt);
    });

    // Prepare filtered patients same as on display
    const filteredPatients = patients.filter(p => {
      const pStatus = (p.status || 'pending').toLowerCase();
      if (statusFilterValue !== 'all' && pStatus !== statusFilterValue) return false;

      const appts = patientAppointmentsMap[p.patientId] || [];
      const doctorsForPatient = [...new Set(appts.map(a => a.doctor).filter(Boolean))];
      if (doctorFilterValue !== 'all' && !doctorsForPatient.map(d => d.toLowerCase()).includes(doctorFilterValue.toLowerCase())) return false;

      if (dateRangeValue !== 'all') {
        const inDateRange = appts.some(a => dateWithinDays(a.date, dateRangeValue));
        if (!inDateRange) return false;
      }

      if (searchValue) {
        const nameMatch = (p.name || '').toLowerCase().includes(searchValue);
        const idMatch = (p.patientId || '').toLowerCase().includes(searchValue);
        const phoneMatch = (p.phone || '').toLowerCase().includes(searchValue);
        if (!(nameMatch || idMatch || phoneMatch)) return false;
      }
      return true;
    });

    // CSV header & rows
    const csvRows = [
      ['Patient ID', 'Name', 'Age', 'Gender', 'Complaint', 'Status', 'Doctors'].join(',')
    ];

    filteredPatients.forEach(p => {
      const appts = patientAppointmentsMap[p.patientId] || [];
      const doctorsForPatient = [...new Set(appts.map(a => a.doctor).filter(Boolean))];

      const row = [
        p.patientId || '',
        p.name || '',
        calculateAge(p.dob) || '',
        p.gender || p.sex || '',
        p.complaint || p.medicalHistory || '',
        capitalize(p.status),
        doctorsForPatient.join('; ')
      ].map(val => `"${(val || '').toString().replace(/"/g, '""')}"`).join(',');
      csvRows.push(row);
    });

    if (csvRows.length === 1) {
      alert('No data to export for the current filters.');
      return;
    }

    const csvStr = csvRows.join('\n');
    const a = document.createElement('a');
    a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csvStr);
    a.download = 'patient_reports.csv';
    a.click();
  });

  // Attach change event listeners for filters and search
  ['statusFilter', 'doctorFilter', 'dateRangeFilter', 'searchInput'].forEach(id => {
    const elem = document.getElementById(id);
    if (elem) elem.addEventListener('input', renderReport);
  });

  // Initial setup
  document.addEventListener('DOMContentLoaded', () => {
    populateDoctorFilter();
    renderReport();
  });
})();