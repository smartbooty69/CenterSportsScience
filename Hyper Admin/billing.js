function getAppointments() {
  return JSON.parse(localStorage.getItem('appointments') || '[]');
}
function getPatients() {
  return JSON.parse(localStorage.getItem('patients') || '[]');
}
function getUsers() {
  return JSON.parse(localStorage.getItem('users') || '[]');
}
function saveAppointments(appts) {
  localStorage.setItem('appointments', JSON.stringify(appts));
}

function parseDate(dateStr) {
  // Parses YYYY-MM-DD or other ISO format to Date object
  if (!dateStr) return null;
  const d = new Date(dateStr);
  return isNaN(d) ? null : d;
}
function dateWithinDays(date, days) {
  if (!date) return false;
  const now = new Date();
  const pastLimit = new Date(now.getTime() - days * 24*60*60*1000);
  return date >= pastLimit && date <= now;
}

// Populate doctor dropdown filter
function populateDoctorFilter() {
  const select = document.getElementById('doctorFilter');
  const users = getUsers();
  const doctors = users.filter(u =>
    (u.role === "Doctor" || u.role === "Doctor/Physio") &&
    (u.status === "Active" || !u.status) &&
    u.name
  );
  select.innerHTML = '<option value="all">All Doctors</option>' +
    doctors.map(doc => `<option value="${doc.name}">${doc.name}</option>`).join('');
}

function renderBilling() {
  const appointments = getAppointments();
  const patients = getPatients();
  const patMap = {};
  patients.forEach(p => patMap[p.patientId] = p);

  // Get filter values
  const selectedDoctor = document.getElementById('doctorFilter').value;
  const pendingPeriod = document.getElementById('pendingDateFilter').value;
  const completedPeriod = document.getElementById('completedDateFilter').value;

  const pendingTbody = document.getElementById('pendingBillingBody');
  const histTbody = document.getElementById('billingHistoryBody');
  const totalCollectionsEl = document.getElementById('collectionSummary');
  const pendingCountEl = document.getElementById('pendingCount');
  const historyCountEl = document.getElementById('historyCount');

  pendingTbody.innerHTML = '';
  histTbody.innerHTML = '';

  let totalCollection = 0;
  let billingHistoryCount = 0;
  let pendingBillingCount = 0;

  // --- Pending Billing ---
  appointments.forEach((appt, idx) => {
    if (appt.status === 'Completed' && !appt.billing) {
      if (selectedDoctor !== 'all' && appt.doctor !== selectedDoctor) return;

      // Check date filter for pending billing using appointment date
      if (pendingPeriod !== 'all') {
        const apptDate = parseDate(appt.date);
        if (!apptDate || !dateWithinDays(apptDate, parseInt(pendingPeriod))) return;
      }

      let patient = patMap[appt.patientId] || {};
      let tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${patient.name || appt.patient || appt.patientId || 'N/A'}</td>
        <td>${appt.doctor || 'N/A'}</td>
        <td>${appt.date || ''}</td>
        <td><input type="number" value="" min="0" class="form-control form-control-sm billing-amt" style="width:90px"></td>
        <td><input type="date" value="${new Date().toISOString().slice(0,10)}" class="form-control form-control-sm billing-date" style="width:140px"></td>
        <td>
          <button class="btn btn-sm btn-success save-bill-btn" data-idx="${idx}">Save</button>
        </td>
      `;
      pendingTbody.appendChild(tr);
      pendingBillingCount++;
    }
  });

  // --- Billing History ---
  appointments.forEach((appt) => {
    if (appt.billing && appt.billing.amount) {
      if (selectedDoctor !== 'all' && appt.doctor !== selectedDoctor) return;

      // Check date filter for completed billing using billing date
      if (completedPeriod !== 'all') {
        const billingDate = parseDate(appt.billing.date);
        if (!billingDate || !dateWithinDays(billingDate, parseInt(completedPeriod))) return;
      }

      totalCollection += parseFloat(appt.billing.amount) || 0;
      billingHistoryCount++;

      let patient = patMap[appt.patientId] || {};
      let tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${patient.name || appt.patient || appt.patientId || 'N/A'}</td>
        <td>${appt.doctor || 'N/A'}</td>
        <td>${appt.date || ''}</td>
        <td>₹${parseFloat(appt.billing.amount).toFixed(2)}</td>
        <td>${appt.billing.date || ''}</td>
        <td>
          <button class="btn btn-sm btn-outline-primary invoice-btn" 
            data-amt="${appt.billing.amount}" 
            data-date="${appt.billing.date}" 
            data-patient="${patient.name || ''}" 
            data-doctor="${appt.doctor || ''}" 
            data-apptid="${appt.patientId || ''}">
            Invoice
          </button>
        </td>
      `;
      histTbody.appendChild(tr);
    }
  });

  totalCollectionsEl.textContent = `Total Collections: ₹${totalCollection.toFixed(2)}`;
  pendingCountEl.textContent = pendingBillingCount;
  historyCountEl.textContent = billingHistoryCount;

  attachBillingEvents();
}

function attachBillingEvents() {
  // Save billing
  document.querySelectorAll('.save-bill-btn').forEach(btn => {
    btn.onclick = function() {
      const idx = btn.getAttribute('data-idx');
      const appts = getAppointments();
      if (!appts[idx]) return;
      const row = btn.closest('tr');
      const amount = row.querySelector('.billing-amt').value;
      const billdate = row.querySelector('.billing-date').value;
      if (!amount || parseFloat(amount) <= 0 || !billdate) {
        alert('Fill valid amount and billing date.');
        return;
      }
      appts[idx].billing = {
        amount: parseFloat(amount).toFixed(2),
        date: billdate
      };
      saveAppointments(appts);
      renderBilling();
    };
  });

  // Print invoice
  document.querySelectorAll('.invoice-btn').forEach(btn => {
    btn.onclick = function() {
      const patient = btn.getAttribute('data-patient');
      const doctor = btn.getAttribute('data-doctor');
      const amt = parseFloat(btn.getAttribute('data-amt')).toFixed(2);
      const date = btn.getAttribute('data-date');
      const apptid = btn.getAttribute('data-apptid');
      document.getElementById('invoiceBody').innerHTML = `
        <div>
          <h4 style="color:#057;">Patient Billing Invoice</h4>
          <table class="table table-borderless">
            <tr><td><b>Patient:</b></td><td>${patient}</td></tr>
            <tr><td><b>Appointment ID:</b></td><td>${apptid}</td></tr>
            <tr><td><b>Doctor:</b></td><td>${doctor}</td></tr>
            <tr><td><b>Billing Date:</b></td><td>${date}</td></tr>
            <tr><td><b>Amount:</b></td><td>₹${amt}</td></tr>
          </table>
          <hr>
          <p>Thank you for your payment!</p>
        </div>
      `;
      new bootstrap.Modal(document.getElementById('invoiceModal')).show();
    };
  });

  // Print handler
  document.getElementById('printInvoiceBtn').onclick = function() {
    const printContents = document.getElementById('invoiceBody').innerHTML;
    const printWindow = window.open('', '', 'width=700,height=700');
    printWindow.document.write('<html><head><title>Invoice</title>');
    printWindow.document.write('<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css">');
    printWindow.document.write('</head><body class="p-4">' + printContents + '</body></html>');
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  };
}

document.addEventListener('DOMContentLoaded', () => {
  populateDoctorFilter();

  // Re-render table on filter changes
  document.getElementById('doctorFilter').addEventListener('change', renderBilling);
  document.getElementById('pendingDateFilter').addEventListener('change', renderBilling);
  document.getElementById('completedDateFilter').addEventListener('change', renderBilling);

  // Export CSV for billing history
  document.getElementById('exportCsvBtn').onclick = function() {
    const appointments = getAppointments();
    const patients = getPatients();
    const patMap = {};
    patients.forEach(p => patMap[p.patientId] = p);
    const selectedDoctor = document.getElementById('doctorFilter').value;
    const completedPeriod = document.getElementById('completedDateFilter').value;
    const rows = [
      ['Patient ID', 'Patient Name', 'Doctor', 'Appointment Date', 'Billing Amount (₹)', 'Billing Date'].join(',')
    ];
    appointments.forEach(appt => {
      if (!appt.billing || !appt.billing.amount) return;
      if (selectedDoctor !== 'all' && appt.doctor !== selectedDoctor) return;
      if (completedPeriod !== 'all') {
        const billingDate = parseDate(appt.billing.date);
        if (!billingDate || !dateWithinDays(billingDate, parseInt(completedPeriod))) return;
      }
      const patient = patMap[appt.patientId] || {};
      rows.push([
        appt.patientId || '',
        (patient.name || appt.patient || appt.patientId || ''),
        appt.doctor || '',
        appt.date || '',
        parseFloat(appt.billing.amount).toFixed(2) || '',
        appt.billing.date || ''
      ].map(val => `"${(val+"").replace(/"/g, '""')}"`).join(','));
    });

    if (rows.length === 1) {
      alert("No billing history to export.");
      return;
    }
    const csv = rows.join("\n");
    const a = document.createElement('a');
    a.href = "data:text/csv;charset=utf-8," + encodeURIComponent(csv);
    a.download = "billing_history.csv";
    a.click();
  };

  renderBilling();
});
