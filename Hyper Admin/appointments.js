(() => {
  // Load patients and all appointments from localStorage 
  let patients = JSON.parse(localStorage.getItem('patients')) || [];
  let appointments = JSON.parse(localStorage.getItem('appointments')) || [];

  // For fast lookup of patient info
  let patientMap = {};
  patients.forEach(p => patientMap[p.patientId] = p);

  // Render appointments table
  function renderTable() {
    const tbody = document.getElementById('appointmentsTable');
    tbody.innerHTML = '';
    if (!appointments.length) {
      tbody.innerHTML = `<tr><td colspan="8" class="text-center text-muted">No Appointments Found</td></tr>`;
      return;
    }
    appointments.forEach((a, idx) => {
      let badge = 'bg-secondary';
      if (a.status === 'pending') badge = 'bg-warning text-dark';
      else if (a.status === 'completed') badge = 'bg-success';
      else if (a.status === 'ongoing') badge = 'bg-info';
      else if (a.status === 'cancelled') badge = 'bg-danger';
      let patient = patientMap[a.patientId] || {};
      let patName = a.patient || patient.name || a.patientId || 'N/A';
      let doctor = a.doctor || '';
      tbody.innerHTML += `
        <tr>
          <td>${idx + 1}</td>
          <td>${patName}</td>
          <td>${a.patientId || ''}</td>
          <td>${doctor}</td>
          <td>${a.date || ''}</td>
          <td>${a.time || ''}</td>
          <td><span class="badge ${badge}">${a.status ? a.status.charAt(0).toUpperCase() + a.status.slice(1) : ''}</span></td>
          <td class="table-actions">
            <button class="btn btn-sm btn-outline-primary edit-btn" data-idx="${idx}" title="Assign/Edit Doctor"><i class="fas fa-pen"></i></button>
          </td>
        </tr>
      `;
    });
    attachEditHandler();
  }

  // Assign Doctor Modal logic
  let editingIdx = null;
  function attachEditHandler() {
    document.querySelectorAll('.edit-btn').forEach(btn => {
      btn.onclick = function () {
        editingIdx = +btn.getAttribute('data-idx');
        const a = appointments[editingIdx];
        const p = patientMap[a.patientId] || {};
        document.getElementById('assignPatientName').value = p.name || a.patient || a.patientId || 'N/A';
        document.getElementById('assignDoctor').value = a.doctor || '';
        new bootstrap.Modal(document.getElementById('assignDoctorModal')).show();
      };
    });
  }

  document.getElementById('assignDoctorForm').onsubmit = function (e) {
    e.preventDefault();
    if (editingIdx === null) return;
    const select = document.getElementById('assignDoctor');
    const doctor = select.value;
    if (!doctor) return;
    // Update appointment
    appointments[editingIdx].doctor = doctor;
    // Optionally, update status to 'ongoing' if doctor assigned and status was 'pending'
    if (!appointments[editingIdx].status || appointments[editingIdx].status === 'pending')
      appointments[editingIdx].status = 'ongoing';
    // Save and refresh
    localStorage.setItem('appointments', JSON.stringify(appointments));
    bootstrap.Modal.getOrCreateInstance(document.getElementById('assignDoctorModal')).hide();
    renderTable();
  };

  renderTable();
})();
