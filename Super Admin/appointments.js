document.addEventListener('DOMContentLoaded', () => {
  const appointmentList = document.getElementById('appointmentList');

  // Load appointments from localStorage or empty array
  const appointments = JSON.parse(localStorage.getItem('appointments') || '[]');

  function renderAppointments() {
    if (!appointments.length) {
      appointmentList.innerHTML = '<p>No appointments found.</p>';
      return;
    }

    const table = document.createElement('table');
    table.className = 'table table-striped';

    const thead = document.createElement('thead');
    thead.innerHTML = `
      <tr>
        <th>Appointment ID</th>
        <th>Patient Name</th>
        <th>Doctor</th>
        <th>Date</th>
        <th>Time</th>
        <th>Status</th>
        <th>Actions</th>
      </tr>
    `;
    table.appendChild(thead);

    const tbody = document.createElement('tbody');

    appointments.forEach((appt, i) => {
      const row = document.createElement('tr');

      row.innerHTML = `
        <td>${appt.appointmentId || '-'}</td>
        <td>${appt.patient || '-'}</td>
        <td>${appt.doctor || '-'}</td>
        <td>${appt.date || '-'}</td>
        <td>${appt.time || '-'}</td>
        <td>${appt.status || '-'}</td>
        <td>
          <button class="btn btn-sm btn-primary edit-btn" data-index="${i}">Edit</button>
          <button class="btn btn-sm btn-danger delete-btn" data-index="${i}">Delete</button>
        </td>
      `;

      tbody.appendChild(row);
    });
    table.appendChild(tbody);

    appointmentList.innerHTML = '';
    appointmentList.appendChild(table);

    // Attach event listeners
    Array.from(document.querySelectorAll('.edit-btn')).forEach(btn => {
      btn.addEventListener('click', e => {
        const idx = e.target.dataset.index;
        alert(`Edit Appointment feature not yet implemented for appointment #${appointments[idx].appointmentId}`);
        // Implement your edit logic here
      });
    });

    Array.from(document.querySelectorAll('.delete-btn')).forEach(btn => {
      btn.addEventListener('click', e => {
        const idx = e.target.dataset.index;
        if (confirm(`Are you sure you want to delete appointment #${appointments[idx].appointmentId}?`)) {
          appointments.splice(idx, 1);
          localStorage.setItem('appointments', JSON.stringify(appointments));
          renderAppointments();
        }
      });
    });
  }

  renderAppointments();

  // Logout handler
  document.getElementById('logoutBtn').onclick = () => {
    localStorage.removeItem('currentUser');
    window.location.href = 'index.html';
  };
});
