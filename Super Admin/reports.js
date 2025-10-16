document.addEventListener('DOMContentLoaded', function () {
  const reportTable = document.getElementById('reportTable');
  const reportModalEl = document.getElementById('reportModal');
  const reportForm = document.getElementById('reportForm');
  const modalSavedMsg = document.getElementById('modalSavedMsg');

  let patients = JSON.parse(localStorage.getItem('patients') || '[]');

  // Populate table with patient reports
  function loadReports() {
    reportTable.innerHTML = '';
    patients.forEach((p, idx) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${p.patientId || ''}</td>
        <td>${p.name || ''}</td>
        <td>${p.status || ''}</td>
        <td>${p.assignedDoctor || ''}</td>
        <td>
          <button class="btn btn-sm btn-primary me-1" type="button" onclick="viewPatient(${idx})">View</button>
          <button class="btn btn-sm btn-danger" type="button" onclick="deletePatient(${idx})">Delete</button>
        </td>
      `;
      reportTable.appendChild(tr);
    });
  }

  function clearSavedMessage() {
    modalSavedMsg.classList.add('d-none');
  }

  window.viewPatient = function (index) {
    clearSavedMessage();
    const p = patients[index];
    if (!p) return;

    document.getElementById('modalPatientName').value = p.name || '';
    document.getElementById('modalPatientId').value = p.patientId || '';
    document.getElementById('modalPatientDob').value = p.dob || '';
    document.getElementById('modalDoctor').value = p.assignedDoctor || '';

    document.getElementById('modalComplaint').value = p.complaints || '';
    document.getElementById('modalPresentHistory').value = p.presentHistory || '';
    document.getElementById('modalPastHistory').value = p.pastHistory || '';
    document.getElementById('modalMedicalHistory').value = getMedicalHistoryText(p);
    document.getElementById('modalSurgicalHistory').value = p.surgicalHistory || '';
    document.getElementById('modalPersonalHistory').value = getPersonalHistoryText(p);
    document.getElementById('modalSleepCycle').value = p.sleepCycle || '';
    document.getElementById('modalHydration').value = p.hydration || '';
    document.getElementById('modalNutrition').value = p.nutrition || '';

    document.getElementById('modalSiteSide').value = p.siteSide || '';
    document.getElementById('modalOnset').value = p.onset || '';
    document.getElementById('modalDuration').value = p.duration || '';
    document.getElementById('modalNatureOfInjury').value = p.natureOfInjury || '';
    document.getElementById('modalTypeOfPain').value = p.typeOfPain || '';
    document.getElementById('modalVASScale').value = p.vasScale || '';

    document.getElementById('modalAggravatingFactor').value = p.aggravatingFactor || '';
    document.getElementById('modalRelievingFactor').value = p.relievingFactor || '';

    renderRomView(p.rom || {});

    document.getElementById('modalTreatment').value = p.treatmentProvided || '';
    document.getElementById('modalProgress').value = p.progressNotes || '';
    document.getElementById('modalPhysioName').value = p.physioName || '';
    document.getElementById('modalPhysioId').value = p.physioId || '';

    document.getElementById('modalReportDate').textContent = new Date().toLocaleDateString();

    const bsModal = bootstrap.Modal.getOrCreateInstance(reportModalEl);
    bsModal.show();

    reportForm.dataset.editIndex = index;
  };

  function getMedicalHistoryText(p) {
    let items = [];
    if (p.med_xray) items.push("X RAYS");
    if (p.med_mri) items.push("MRI");
    if (p.med_report) items.push("Reports");
    if (p.med_ct) items.push("CT Scans");
    return items.join(', ') || 'N/A';
  }

  function getPersonalHistoryText(p) {
    let items = [];
    if (p.per_smoking) items.push("Smoking");
    if (p.per_drinking) items.push("Drinking");
    if (p.per_alcohol) items.push("Alcohol");
    if (p.per_drugs) {
      items.push("Drugs: " + (p.drugsText || ''));
    }
    return items.join(', ') || 'N/A';
  }

  window.deletePatient = function (index) {
    if (confirm('Are you sure you want to delete this report?')) {
      patients.splice(index, 1);
      localStorage.setItem('patients', JSON.stringify(patients));
      loadReports();
    }
  };

  reportForm.addEventListener('submit', function (e) {
    e.preventDefault();
    const idx = parseInt(reportForm.dataset.editIndex, 10);
    if (isNaN(idx)) return;

    patients[idx] = {
      ...patients[idx],
      name: document.getElementById('modalPatientName').value.trim(),
      patientId: document.getElementById('modalPatientId').value.trim(),
      dob: document.getElementById('modalPatientDob').value.trim(),
      assignedDoctor: document.getElementById('modalDoctor').value.trim(),
      complaints: document.getElementById('modalComplaint').value.trim(),
      presentHistory: document.getElementById('modalPresentHistory').value.trim(),
      pastHistory: document.getElementById('modalPastHistory').value.trim(),
      surgicalHistory: document.getElementById('modalSurgicalHistory').value.trim(),
      sleepCycle: document.getElementById('modalSleepCycle').value.trim(),
      hydration: document.getElementById('modalHydration').value.trim(),
      nutrition: document.getElementById('modalNutrition').value.trim(),
      siteSide: document.getElementById('modalSiteSide').value.trim(),
      onset: document.getElementById('modalOnset').value.trim(),
      duration: document.getElementById('modalDuration').value.trim(),
      natureOfInjury: document.getElementById('modalNatureOfInjury').value.trim(),
      typeOfPain: document.getElementById('modalTypeOfPain').value.trim(),
      vasScale: document.getElementById('modalVASScale').value.trim(),
      aggravatingFactor: document.getElementById('modalAggravatingFactor').value.trim(),
      relievingFactor: document.getElementById('modalRelievingFactor').value.trim(),
      rom: patients[idx].rom || {}, // Keep ROM unchanged here
      treatmentProvided: document.getElementById('modalTreatment').value.trim(),
      progressNotes: document.getElementById('modalProgress').value.trim(),
      physioName: document.getElementById('modalPhysioName').value.trim(),
      physioId: document.getElementById('modalPhysioId').value.trim(),
      status: patients[idx].status || 'Ongoing'
    };

    localStorage.setItem('patients', JSON.stringify(patients));
    loadReports();

    modalSavedMsg.classList.remove('d-none');
    setTimeout(() => modalSavedMsg.classList.add('d-none'), 2000);
  });

  // Render ROM view section in modal report
  const ROM_MOTIONS = {
    Neck: [{motion: "Flexion"}, {motion: "Extension"}, {motion: "Lateral Flexion"}, {motion: "Rotation"}],
    Hip: [{motion: "Flexion"}, {motion: "Extension"}, {motion: "Abduction"}, {motion: "Adduction"}, {motion: "Internal Rotation"}, {motion: "External Rotation"}],
    Shoulder: [{motion: "Flexion"}, {motion: "Extension"}, {motion: "Abduction"}, {motion: "Adduction"}, {motion: "Internal Rotation"}, {motion: "External Rotation"}],
    Elbow: [{motion: "Flexion"}, {motion: "Extension"}],
    Forearm: [{motion: "Supination"}, {motion: "Pronation"}],
    Wrist: [{motion: "Flexion"}, {motion: "Extension"}, {motion: "Radial Deviation"}, {motion: "Ulnar Deviation"}],
    Knee: [{motion: "Flexion"}, {motion: "Extension"}],
    Ankle: [{motion: "Dorsiflexion"}, {motion: "Plantarflexion"}, {motion: "Inversion"}, {motion: "Eversion"}],
    Toes: [{motion: "Flexion"}, {motion: "Extension"}]
  };

  const ROM_HAS_SIDE = {Shoulder: true, Elbow: true, Forearm: true, Wrist: true, Knee: true, Ankle: true, Toes: true};

  function renderRomView(romData) {
    const area = document.getElementById('modalRomView');
    area.innerHTML = '';
    if (!romData || !Object.keys(romData).length) {
      area.innerHTML = '<em>No ROM joints recorded.</em>';
      return;
    }
    Object.keys(romData).forEach(joint => {
      area.appendChild(renderRomTable(joint, romData[joint]));
    });
  }

  function renderRomTable(joint, data) {
    const div = document.createElement('section');
    let h = `<h6 class="text-primary mb-2">${joint}</h6>`;
    let t = '';
    if (!ROM_HAS_SIDE[joint]) {
      t += `<table class="table table-bordered"><thead>
        <tr><th>Motion</th><th>Value</th></tr></thead><tbody>`;
      ROM_MOTIONS[joint].forEach(({motion}) => {
        let val = data[motion] || '';
        if (val) t += `<tr><td>${motion}</td><td>${val}</td></tr>`;
      });
      t += '</tbody></table>';
    } else {
      t += `<table class="table table-bordered"><thead>
        <tr><th colspan="2" class="text-center">Left</th><th colspan="2" class="text-center">Right</th></tr>
        <tr><th>Motion</th><th>Value</th><th>Motion</th><th>Value</th></tr></thead><tbody>`;
      ROM_MOTIONS[joint].forEach(({motion}) => {
        let lv = data.left ? data.left[motion] : '', rv = data.right ? data.right[motion] : '';
        if (lv || rv)
          t += `<tr>
            <td>${motion}</td><td>${lv || ''}</td>
            <td>${motion}</td><td>${rv || ''}</td>
          </tr>`;
      });
      t += '</tbody></table>';
    }
    div.innerHTML = h + t;
    return div;
  }

  // Print report handler
  document.getElementById('printReportBtn').addEventListener('click', function () {
    const idx = parseInt(reportForm.dataset.editIndex, 10);
    if (isNaN(idx)) return;

    const p = patients[idx];
    const today = new Date().toLocaleDateString();

    // Compose ROM print HTML
    let romPrintHtml = '';
    if (p.rom && Object.keys(p.rom).length) {
      romPrintHtml += '<h4 style="margin-top:18px;">Range of Motion (ROM) Assessed</h4>';
      Object.keys(p.rom).forEach(joint => {
        romPrintHtml += renderRomPrintTable(joint, p.rom[joint]);
      });
    }

    // Compose full print HTML
    const printHtml = `
    <h2 style="margin-bottom:10px;">Physiotherapy Clinic Patient Report</h2>
    <div style="margin-bottom:12px;"><b>Clinic:</b> Centre For Sports Science, Kanteerava Stadium</div>
    <div style="margin-bottom:12px;"><b>Date:</b> ${today}</div>
    <table style="width:100%; margin-bottom:15px; font-size:1.1rem;" border="1" cellspacing="0" cellpadding="6">
      <tr><td><b>Patient Name:</b></td><td>${p.name || 'N/A'}</td><td><b>Patient ID:</b></td><td>${p.patientId || 'N/A'}</td></tr>
      <tr><td><b>Date of Birth:</b></td><td>${p.dob || 'N/A'}</td><td><b>Assigned Doctor:</b></td><td>${p.assignedDoctor || 'N/A'}</td></tr>
    </table>
    <h3>Assessment</h3>
    <table style="width:100%; margin-bottom:15px; font-size:1.05rem;" border="1" cellspacing="0" cellpadding="6">
      <tr><td><b>Complaints:</b></td><td>${p.complaints || 'N/A'}</td></tr>
      <tr><td><b>Present History:</b></td><td>${p.presentHistory || 'N/A'}</td></tr>
      <tr><td><b>Past History:</b></td><td>${p.pastHistory || 'N/A'}</td></tr>
      <tr><td><b>Medical History:</b></td><td>${getMedicalHistoryText(p)}</td></tr>
      <tr><td><b>Surgical History:</b></td><td>${p.surgicalHistory || 'N/A'}</td></tr>
      <tr><td><b>Personal History:</b></td><td>${getPersonalHistoryText(p)}</td></tr>
      <tr><td><b>Sleep Cycle:</b></td><td>${p.sleepCycle || 'N/A'}</td></tr>
      <tr><td><b>Hydration:</b></td><td>${p.hydration || 'N/A'}</td></tr>
      <tr><td><b>Nutrition:</b></td><td>${p.nutrition || 'N/A'}</td></tr>
      <tr><td><b>Site and Side:</b></td><td>${p.siteSide || 'N/A'}</td></tr>
      <tr><td><b>Onset:</b></td><td>${p.onset || 'N/A'}</td></tr>
      <tr><td><b>Duration:</b></td><td>${p.duration || 'N/A'}</td></tr>
      <tr><td><b>Nature of Injury:</b></td><td>${p.natureOfInjury || 'N/A'}</td></tr>
      <tr><td><b>Type of Pain:</b></td><td>${p.typeOfPain || 'N/A'}</td></tr>
      <tr><td><b>VAS Scale:</b></td><td>${p.vasScale || 'N/A'}</td></tr>
      <tr><td><b>Aggravating Factor:</b></td><td>${p.aggravatingFactor || 'N/A'}</td></tr>
      <tr><td><b>Relieving Factor:</b></td><td>${p.relievingFactor || 'N/A'}</td></tr>
    </table>
    ${romPrintHtml}
    <h3>Treatment Provided</h3>
    <div>${p.treatmentProvided || 'N/A'}</div>
    <h3>Progress Notes</h3>
    <div>${p.progressNotes || 'N/A'}</div>
    <h3>Physiotherapist</h3>
    <div>${p.physioName || 'N/A'} (${p.physioId || 'N/A'})</div>
    `;

    const printWindow = window.open('', '', 'width=800,height=900');
    printWindow.document.write(`
    <html>
      <head>
        <title>Print Report</title>
        <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" rel="stylesheet"/>
        <style>
          body { font-family: Arial, sans-serif; padding: 20px; }
          h2, h3 { color: #0d6efd; }
          table { border-collapse: collapse; width: 100%; margin-bottom: 12px; }
          td, th { border: 1px solid #ddd; padding: 8px; }
          th { background-color: #e7f1ff; font-weight: bold; }
        </style>
      </head>
      <body>
        ${printHtml}
      </body>
    </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
    printWindow.close();
  });

  function renderRomPrintTable(joint, data) {
    let html = `<h5>${joint}</h5><table style="border-collapse:collapse;width:95%;margin-bottom:15px;" border="1"><thead>`;
    if (!ROM_HAS_SIDE[joint]) {
      html += '<tr><th>Motion</th><th>Value</th></tr></thead><tbody>';
      ROM_MOTIONS[joint].forEach(({motion}) => {
        const val = data[motion];
        if (val) html += `<tr><td>${motion}</td><td>${val}</td></tr>`;
      });
      html += '</tbody>';
    } else {
      html += '<tr><th colspan="2">Left</th><th colspan="2">Right</th></tr>';
      html += '<tr><th>Motion</th><th>Value</th><th>Motion</th><th>Value</th></tr></thead><tbody>';
      ROM_MOTIONS[joint].forEach(({motion}) => {
        const left = data.left?.[motion] || '';
        const right = data.right?.[motion] || '';
        if (left || right) html += `<tr><td>${motion}</td><td>${left}</td><td>${motion}</td><td>${right}</td></tr>`;
      });
      html += '</tbody>';
    }
    html += '</table>';
    return html;
  }

  // Initialize patient reports table at page load
  loadReports();
});
