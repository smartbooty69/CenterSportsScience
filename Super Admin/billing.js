document.addEventListener('DOMContentLoaded', () => {
  const billingList = document.getElementById('billingList');
  const billingFilter = document.getElementById('billingFilter');

  function getCurrentMonthYear() {
    const now = new Date();
    return `${now.getFullYear()}-${now.getMonth() + 1}`;
  }

  function resetMonthlyTotalIfNeeded() {
    const lastResetMonth = localStorage.getItem('billingLastResetMonth');
    const currentMonth = getCurrentMonthYear();
    if (lastResetMonth !== currentMonth) {
      localStorage.setItem('billingTotalForMonth', '0');
      localStorage.setItem('billingLastResetMonth', currentMonth);
    }
  }

  function updateBillingTotal() {
    resetMonthlyTotalIfNeeded();

    const billing = JSON.parse(localStorage.getItem('billing') || '[]');
    const total = billing.reduce((sum, bill) => {
      if (bill.status === 'Completed') {
        return sum + (parseFloat(bill.amount) || 0);
      }
      return sum;
    }, 0);

    localStorage.setItem('billingTotalForMonth', total.toString());

    const totalElem = document.getElementById('billingTotal');
    if (totalElem) {
      totalElem.textContent = `Total Collection this Month: ₹${total.toFixed(2)}`;
    }
  }

  function syncAppointmentsToBilling() {
    const appointments = JSON.parse(localStorage.getItem('appointments') || '[]');
    let billing = JSON.parse(localStorage.getItem('billing') || '[]');
    const alreadyBilled = billing.map(b => b.appointmentId);

    appointments.forEach(appt => {
      if (appt.status === "Completed" && !alreadyBilled.includes(appt.appointmentId)) {
        billing.push({
          billingId: "BILL-" + appt.appointmentId,
          appointmentId: appt.appointmentId,
          patient: appt.patient,
          patientId: appt.patientId,
          doctor: appt.doctor,
          amount: appt.amount || 1200,
          date: appt.date,
          status: "Pending",
          paymentMode: "",
          utr: ""
        });
      }
    });
    localStorage.setItem('billing', JSON.stringify(billing));
  }

  function filterRecords(records, range) {
    if (range === "all") return records;
    const days = parseInt(range, 10);
    const now = new Date();
    return records.filter(b => {
      const d = new Date(b.date);
      return (now - d) / (1000 * 60 * 60 * 24) <= days;
    });
  }

  function renderBilling() {
    syncAppointmentsToBilling();
    let billing = JSON.parse(localStorage.getItem('billing') || '[]');
    billing = filterRecords(billing, billingFilter.value);
    const pending = billing.filter(b => b.status === "Pending");
    const completed = billing.filter(b => b.status === "Completed");
    billingList.innerHTML = `
      <div class="row mb-4">
        <div class="col-md-6">
          <div class="card border-warning mb-3">
            <div class="card-header bg-warning text-dark">
              Pending Payments <span class="badge bg-dark">${pending.length}</span>
            </div>
            <div class="card-body">${renderTable(pending, true)}</div>
          </div>
        </div>
        <div class="col-md-6">
          <div class="card border-success mb-3">
            <div class="card-header bg-success text-white">
              Completed Payments <span class="badge bg-light text-success">${completed.length}</span>
            </div>
            <div class="card-body">${renderTable(completed, false)}</div>
          </div>
        </div>
      </div>
    `;

    updateBillingTotal();
    setupPayHandlers(pending);
    setupReportHandlers(completed);
  }

  function renderTable(records, isPending) {
    if (!records.length) return '<p>No entries found.</p>';
    return `
      <table class="table table-striped">
        <thead>
          <tr>
            <th>Bill ID</th>
            <th>Patient</th>
            <th>Doctor</th>
            <th>Amount</th>
            <th>Date</th>
            ${isPending ?
            '<th>Action</th>' :
            '<th>Paid By</th><th>Txn/UTR</th><th>Report</th>'}
          </tr>
        </thead>
        <tbody>
          ${records.map((b, i) => `
            <tr>
              <td>${b.billingId}</td>
              <td>${b.patient}</td>
              <td>${b.doctor || "-"}</td>
              <td>₹${b.amount}</td>
              <td>${b.date}</td>
              ${isPending
                ? `<td><button class="btn btn-warning btn-sm pay-btn" data-idx="${i}">Pay</button></td>`
                : `<td>${b.paymentMode || "-"}</td>
                   <td>${b.utr || "-"}</td>
                   <td>
                     <button class="btn btn-outline-primary btn-sm view-report-btn" data-patientid="${b.patientId}">View</button>
                     <button class="btn btn-success btn-sm ack-btn" data-idx="${i}">Acknowledgement</button>
                     <button class="btn btn-outline-success btn-sm download-report-btn" data-patientid="${b.patientId}">Download</button>
                   </td>`
              }
            </tr>`).join('')}
        </tbody>
      </table>
    `;
  }

  function setupPayHandlers(records) {
    document.querySelectorAll('.pay-btn').forEach(btn => {
      btn.onclick = function () {
        const idx = btn.dataset.idx;
        const rec = records[idx];
        showPayModal(rec);
      };
    });
  }

  function setupReportHandlers(records) {
    document.querySelectorAll('.view-report-btn').forEach(btn => {
      btn.onclick = function () {
        showReportModal(btn.dataset.patientid);
      };
    });
    document.querySelectorAll('.download-report-btn').forEach(btn => {
      btn.onclick = function () {
        showReportModal(btn.dataset.patientid, true);
      };
    });
    document.querySelectorAll('.ack-btn').forEach(btn => {
      btn.onclick = function () {
        const idx = btn.dataset.idx;
        showPaymentSlip(records[idx]);
      };
    });
  }

  function showPayModal(rec) {
    const modal = document.createElement('div');
    modal.className = 'modal fade';
    modal.innerHTML = `
      <div class="modal-dialog">
        <form class="modal-content" id="payForm">
          <div class="modal-header">
            <h5 class="modal-title">Mark Payment for ${rec.patient}</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
          </div>
          <div class="modal-body">
            <b>Billing ID:</b> ${rec.billingId}<br>
            <b>Amount:</b> ₹${rec.amount}<br>
            <b>Date:</b> ${rec.date}<br>
            <div class="mt-3 mb-2"><b>Mode of Payment:</b></div>
            <label><input type="radio" name="paymode" value="Cash" checked> Cash</label>
            &nbsp;
            <label><input type="radio" name="paymode" value="UPI/Card"> Card / UPI</label>
            <div id="utrBox" style="display:none;" class="mt-2">
              <input type="text" class="form-control" placeholder="Txn ID / UTR Number" id="utrInput">
            </div>
          </div>
          <div class="modal-footer">
            <button type="submit" class="btn btn-success">Submit</button>
            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
          </div>
        </form>
      </div>`;
    document.body.appendChild(modal);

    modal.querySelectorAll('input[name="paymode"]').forEach(radio => {
      radio.onchange = function () {
        modal.querySelector('#utrBox').style.display = this.value === "UPI/Card" ? "block" : "none";
      };
    });

    modal.querySelector('#payForm').onsubmit = (e) => {
      e.preventDefault();
      let bills = JSON.parse(localStorage.getItem('billing') || '[]');
      const idx = bills.findIndex(b => b.billingId === rec.billingId);
      const mode = modal.querySelector('input[name="paymode"]:checked').value;
      const utr = modal.querySelector('#utrInput').value;
      bills[idx].status = "Completed";
      bills[idx].paymentMode = mode;
      if (mode === "UPI/Card") bills[idx].utr = utr;
      localStorage.setItem('billing', JSON.stringify(bills));
      bootstrap.Modal.getOrCreateInstance(modal).hide();
      setTimeout(() => modal.remove(), 500);
      renderBilling();
    };

    bootstrap.Modal.getOrCreateInstance(modal).show();
  }

  function showReportModal(patientId, triggerPrint = false) {
    const patients = JSON.parse(localStorage.getItem('patients') || '[]');
    const p = patients.find(x => x.patientId === patientId);
    if (!p) return;

    document.getElementById('modalPatientName').value = p.name || '';
    document.getElementById('modalPatientId').value = p.patientId || '';
    document.getElementById('modalPatientDob').value = p.dob || '';
    document.getElementById('modalDoctor').value = p.assignedDoctor || '';
    document.getElementById('modalComplaint').value = p.complaint || '';
    document.getElementById('modalDiagnosis').value = p.diagnosis || '';
    document.getElementById('modalFindings').value = p.clinicalFindings || '';
    document.getElementById('modalHistory').value = p.medicalHistory || '';
    document.getElementById('modalTreatment').value = p.treatmentProvided || '';
    document.getElementById('modalProgress').value = p.progressNotes || '';
    document.getElementById('modalPhysioName').value = p.physioName || '';
    document.getElementById('modalPhysioId').value = p.physioId || '';
    document.getElementById('modalReportDate').textContent = new Date().toLocaleDateString();

    const modalEl = document.getElementById('reportModal');
    const bsModal = bootstrap.Modal.getOrCreateInstance(modalEl);
    bsModal.show();

    document.getElementById('printReportBtn').onclick = function () {
      const reportCard = modalEl.querySelector('.report-card').cloneNode(true);
      const printWindow = window.open('', '', 'width=800,height=600');
      printWindow.document.write(`<html><head>
        <title>Print Report</title>
        <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" rel="stylesheet"/>
        </head><body>${reportCard.outerHTML}</body></html>`);
      printWindow.document.close();
      printWindow.focus();
      printWindow.print();
      printWindow.close();
    };

    if (triggerPrint) {
      setTimeout(() => document.getElementById('printReportBtn').click(), 700);
    }
  }

  // Utility to convert number to suitable words (simple version for INR)
  function numberToWords(num) {
    const a = [
      '', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve',
      'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'
    ];
    const b = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
    if (num === 0) return 'zero';
    if (num < 20) return a[num];
    if (num < 100) return b[Math.floor(num / 10)] + (num % 10 ? ' ' + a[num % 10] : '');
    if (num < 1000) return a[Math.floor(num / 100)] + ' hundred ' + (num % 100 !== 0 ? numberToWords(num % 100) : '');
    if (num < 100000) return numberToWords(Math.floor(num / 1000)) + ' thousand ' + (num % 1000 !== 0 ? numberToWords(num % 1000) : '');
    if (num < 10000000) return numberToWords(Math.floor(num / 100000)) + ' lakh ' + (num % 100000 !== 0 ? numberToWords(num % 100000) : '');
    return num.toString();
  }

  function showPaymentSlip(bill) {
    document.getElementById('slipReceiptId').textContent = bill.billingId || '';
    document.getElementById('slipDate').textContent = bill.date || '';
    document.getElementById('slipPatient').textContent = bill.patient || '';
    document.getElementById('slipAmount').textContent = bill.amount || '';
    document.getElementById('slipAmountWords').textContent = numberToWords(Number(bill.amount)) + " only";
    document.getElementById('slipPurpose').textContent = "Inter Clinic"; // or adapt as needed
    document.getElementById('slipPaymentMode').textContent = bill.paymentMode || "Cash";

    let paymentSlipModal = bootstrap.Modal.getOrCreateInstance(document.getElementById('paymentSlipModal'));
    paymentSlipModal.show();

    document.getElementById('downloadSlipBtn').onclick = function () {
      let card = document.getElementById('paymentSlipCard').cloneNode(true);
      let win = window.open('', '', 'width=600,height=700');
      win.document.write(
        `<html><head><title>Payment Slip</title>
        <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" rel="stylesheet"/>
        </head><body style="padding:24px;">${card.outerHTML}</body></html>`
      );
      win.document.close();
      win.focus();
      win.print();
      win.close();
    };
  }

  billingFilter.onchange = renderBilling;
  renderBilling();
});
