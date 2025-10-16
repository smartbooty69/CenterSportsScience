document.addEventListener("DOMContentLoaded", () => {
  const params = new URLSearchParams(window.location.search);
  const patientId = params.get("patientId");
  if (!patientId) { alert("Invalid patient ID."); return; }
  let patients = JSON.parse(localStorage.getItem("patients")) || [];
  const patientIndex = patients.findIndex(p => p.patientId === patientId);
  if (patientIndex === -1) { alert("Patient not found."); return; }
  const patient = patients[patientIndex];

  const allFields = [
    "fullName", "age", "gender", "sport", "playLevel",
    "complaints", "presentHistory", "pastHistory",
    "med_xray", "med_mri", "med_report", "med_ct", "surgicalHistory",
    "per_smoking", "per_drinking", "per_alcohol", "per_drugs", "drugsText",
    "sleepCycle", "hydration", "nutrition",
    "siteSide", "onset", "duration", "natureOfInjury", "typeOfPain",
    "vasScale", "aggravatingFactor", "relievingFactor",
    "previousInjuries", "surgeries", "medications", "allergies",
    "modalities", "exercises", "sessionsPrescribed", "sessionsCompleted",
    "physioNotes", "patientExperience", "clinicalOutcomes", "returnToPlay", "planAhead",
    "built",
    "posture_manual", "posture_kinetisense",
    "posture_manual_text", "posture_kinetisense_file",
    "gait_manual", "gait_optagait",
    "gait_manual_text", "gait_optagait_file",
    "mobilityAids", "localObservation", "swelling", "muscleWashing",
    "tenderness", "warmth", "scar", "crepitus", "odema",
    "mmt_manual", "mmt_manual_text", "mmt_kpush", "mmt_kpush_file",
    // Limb Length
    "limbSelect", "limbRightTrue", "limbRightApparent", "limbLeftTrue", "limbLeftApparent",
    // Muscle Girth
    "girthSelect", "girthRight", "girthLeft"
  ];

  // ROM configs
  const ROM_MOTIONS = {
    Neck: ["Flexion", "Extension", "Lateral Flexion", "Rotation"],
    Hip: ["Flexion", "Extension", "Abduction", "Adduction", "Internal Rotation", "External Rotation"],
    Shoulder: ["Flexion", "Extension", "Abduction", "Adduction", "Internal Rotation", "External Rotation"],
    Elbow: ["Flexion", "Extension"],
    Forearm: ["Supination", "Pronation"],
    Wrist: ["Flexion", "Extension", "Radial Deviation", "Ulnar Deviation"],
    Knee: ["Flexion", "Extension"],
    Ankle: ["Dorsiflexion", "Plantarflexion", "Inversion", "Eversion"],
    Toes: ["Flexion", "Extension"]
  };
  const ROM_HAS_SIDE = {
    Shoulder: true, Elbow: true, Forearm: true, Wrist: true,
    Knee: true, Ankle: true, Toes: true, Hip: true
  };

  window.patientROM = (patient.rom && typeof patient.rom === "object") ? patient.rom : {};

  // Load all fields (text/checkbox)
  allFields.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    if (el.type === "checkbox") el.checked = !!patient[id];
    else el.value = patient[id] || "";
  });

  // Drugs toggler
  const drugsCb = document.getElementById('per_drugs');
  const drugsTx = document.getElementById('drugsText');
  if (drugsCb && drugsTx) {
    drugsTx.style.display = drugsCb.checked ? "inline-block" : "none";
    drugsCb.addEventListener('change', () => {
      drugsTx.style.display = drugsCb.checked ? "inline-block" : "none";
    });
  }

  // Examination toggles: MMT, Posture, GAIT
  function setupToggle(checkboxManualId, checkboxOtherId, manualInputId, fileInputId) {
    const cbManual = document.getElementById(checkboxManualId);
    const cbOther = document.getElementById(checkboxOtherId);
    const manualInput = document.getElementById(manualInputId);
    const fileInput = document.getElementById(fileInputId);

    if (!cbManual || !cbOther || !manualInput || !fileInput) return;

    function updateVisibility() {
      manualInput.style.display = cbManual.checked ? "block" : "none";
      fileInput.style.display = cbOther.checked ? "block" : "none";
    }
    cbManual.addEventListener("change", () => {
      if (cbManual.checked) cbOther.checked = false;
      updateVisibility();
    });
    cbOther.addEventListener("change", () => {
      if (cbOther.checked) cbManual.checked = false;
      updateVisibility();
    });
    updateVisibility();
  }
  setupToggle("posture_manual", "posture_kinetisense", "posture_manual_text", "posture_kinetisense_file");
  setupToggle("gait_manual", "gait_optagait", "gait_manual_text", "gait_optagait_file");
  setupToggle("mmt_manual", "mmt_kpush", "mmt_manual_text", "mmt_kpush_file");

  // Limb Length table show/hide
  const limbSelect = document.getElementById("limbSelect");
  const limbTableArea = document.getElementById("limbTableArea");
  if (limbSelect && limbTableArea) {
    limbTableArea.style.display = limbSelect.value ? 'block' : 'none';
    limbSelect.addEventListener("change", function() {
      limbTableArea.style.display = limbSelect.value ? 'block' : 'none';
    });
  }

  // Muscle Girth table show/hide
  const girthSelect = document.getElementById('girthSelect');
  const girthTableArea = document.getElementById('girthTableArea');
  if (girthSelect && girthTableArea) {
    girthTableArea.style.display = girthSelect.value ? 'block' : 'none';
    girthSelect.addEventListener('change', function() {
      girthTableArea.style.display = girthSelect.value ? 'block' : 'none';
    });
  }

  // ROM rendering
  function renderROMSection() {
    const area = document.getElementById('romTableArea');
    if (!area) return;
    area.innerHTML = '';
    Object.keys(window.patientROM).forEach(joint => {
      area.appendChild(renderJointROMTable(joint, window.patientROM[joint]));
    });
  }
  function renderJointROMTable(joint, data = {}) {
    const section = document.createElement('section');
    section.className = 'mb-4';
    let html = `<h6 class="text-primary mb-2">${joint}</h6>`;
    if (!ROM_HAS_SIDE[joint]) {
      html += '<table class="table table-bordered"><thead><tr><th>Motion</th><th>Value</th></tr></thead><tbody>';
      ROM_MOTIONS[joint].forEach(motion => {
        html += `<tr><td>${motion}</td><td><input type="text" class="form-control form-control-sm" data-j="${joint}" data-m="${motion}" value="${(data[motion]||'')}"></td></tr>`;
      });
      html += '</tbody></table>';
    } else {
      html += '<table class="table table-bordered"><thead><tr><th colspan="2">Left</th><th colspan="2">Right</th></tr><tr><th>Motion</th><th>Value</th><th>Motion</th><th>Value</th></tr></thead><tbody>';
      ROM_MOTIONS[joint].forEach(motion => {
        html += `<tr>
          <td>${motion}</td><td><input type="text" class="form-control form-control-sm" data-j="${joint}" data-m="${motion}" data-s="left" value="${(data.left||{})[motion]||''}"></td>
          <td>${motion}</td><td><input type="text" class="form-control form-control-sm" data-j="${joint}" data-m="${motion}" data-s="right" value="${(data.right||{})[motion]||''}"></td>
        </tr>`;
      });
      html += '</tbody></table>';
    }
    section.innerHTML = html;
    return section;
  }
  const addRomJointBtn = document.getElementById('addRomJointBtn');
  if (addRomJointBtn) {
    addRomJointBtn.onclick = () => {
      const sel = document.getElementById('romJointSelect');
      const joint = sel.value;
      if (!joint) return;
      if (!window.patientROM[joint]) {
        window.patientROM[joint] = ROM_HAS_SIDE[joint] ? {left: {}, right: {}} : {};
      }
      renderROMSection();
      sel.value = '';
    };
  }
  const romTableArea = document.getElementById('romTableArea');
  if (romTableArea) {
    romTableArea.addEventListener('input', e => {
      if (e.target.tagName !== 'INPUT') return;
      const jt = e.target.dataset.j, mo = e.target.dataset.m, s = e.target.dataset.s;
      if (ROM_HAS_SIDE[jt]) {
        if (!window.patientROM[jt]) window.patientROM[jt] = {left: {}, right: {}};
        if (!window.patientROM[jt][s]) window.patientROM[jt][s] = {};
        window.patientROM[jt][s][mo] = e.target.value;
      } else {
        if (!window.patientROM[jt]) window.patientROM[jt] = {};
        window.patientROM[jt][mo] = e.target.value;
      }
    });
  }
  const medTab = document.getElementById('medical-tab');
  if (medTab) medTab.addEventListener('shown.bs.tab', renderROMSection);
  renderROMSection();

  // VAS slider emoji logic
  const vasScale = document.getElementById('vasScale');
  const vasEmoji = document.getElementById('vasEmoji');
  const emojis = ['😢', '😟', '😔', '😕', '😐', '🙂', '😊', '😃', '😁', '😄'];
  function updateEmoji() {
    const val = +vasScale.value;
    vasEmoji.textContent = emojis[val - 1];
    const sliderWidth = vasScale.offsetWidth;
    const emojiWidth = vasEmoji.offsetWidth || 20;
    const positionPercent = (val - vasScale.min) / (vasScale.max - vasScale.min);
    let offset = positionPercent * sliderWidth - emojiWidth / 2;
    offset = Math.min(Math.max(0, offset), sliderWidth - emojiWidth);
    vasEmoji.style.left = offset + 'px';
  }
  vasScale.addEventListener('input', updateEmoji);
  setTimeout(updateEmoji, 200);

  // Only Next button tab change allowed
  let tabs = [...document.querySelectorAll('#reportTabs button[data-bs-toggle="tab"]')];
  let nextButtons = [...document.querySelectorAll('.next-button')];
  tabs.forEach(tabBtn => tabBtn.addEventListener('click', e => e.preventDefault()));
  nextButtons.forEach((btn, i) => {
    btn.addEventListener('click', () => {
      allFields.forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        if (el.type === "checkbox") patient[id] = el.checked;
        else patient[id] = el.value.trim();
      });
      if (tabs[i].id === 'medical-tab') {
        patient.rom = window.patientROM;
      }
      patients[patientIndex] = patient;
      localStorage.setItem('patients', JSON.stringify(patients));
      if (i + 1 < tabs.length) {
        let nextTab = tabs[i + 1];
        new bootstrap.Tab(nextTab).show();
        tabs.forEach((tab, idx) => {
          tab.tabIndex = idx === (i + 1) ? 0 : -1;
        });
        nextTab.focus();
      }
    });
  });
  tabs.forEach((tab, idx) => {
    tab.tabIndex = idx === 0 ? 0 : -1;
  });
});
