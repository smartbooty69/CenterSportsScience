// Utility: Generate Patient ID
function generatePatientId() {
  const prefix = "CSS";
  const year = new Date().getFullYear();
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let randomPart = "";
  for (let i = 0; i < 7; i++) {
    randomPart += alphabet.charAt(Math.floor(Math.random() * alphabet.length));
  }
  return `${prefix}${year}${randomPart}`;
}

// Patient registration handler
(function () {
  "use strict";
  const form = document.getElementById("registerForm");
  const idDisplay = document.getElementById("patientIdDisplay");

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    if (!form.checkValidity()) {
      form.classList.add("was-validated");
      return;
    }
    let patients = JSON.parse(localStorage.getItem("patients")) || [];
    const patientId = generatePatientId();

    const newPatient = {
      patientId,
      name: form.fullName.value.trim(),
      dob: form.dob.value.trim(),
      gender: form.gender.value,
      phone: form.phone.value.trim(),
      email: form.email.value.trim(),
      address: form.address.value.trim(),
      paymentType: form.paymentType.value,
      paymentDescription: form.paymentDescription.value.trim(),
      status: "pending",
      registeredAt: new Date().toISOString()
    };

    patients.push(newPatient);
    localStorage.setItem("patients", JSON.stringify(patients));

    document.getElementById("modalPatientId").textContent = patientId;
    const registrationModal = new bootstrap.Modal(
      document.getElementById("registrationModal")
    );
    registrationModal.show();

    idDisplay.style.display = "none";
    form.reset();
    form.classList.remove("was-validated");
    renderResults(getPatientsFiltered(document.getElementById('searchInput').value));
  });
})();

// Patient search + "Give Appointment" logic
(function patientSearchSection() {
  const searchInput = document.getElementById("searchInput");
  const searchResults = document.getElementById("searchResults");

  function getPatients() {
    return JSON.parse(localStorage.getItem("patients")) || [];
  }
  function getPatientsFiltered(query) {
    const q = (query || "").toLowerCase();
    const patients = getPatients();
    return q ? patients.filter(
      p => (p.name || "").toLowerCase().includes(q) || (p.patientId || "").toLowerCase().includes(q)
    ) : patients;
  }

  function renderResults(filtered) {
    searchResults.innerHTML = "";
    if (!filtered.length) {
      searchResults.innerHTML = "<div class='text-muted'>No patient found.</div>";
      return;
    }
    filtered.forEach(p => {
      const div = document.createElement('div');
      div.className = "card mb-3";
      div.innerHTML = `
        <div class="card-body d-flex justify-content-between align-items-center flex-wrap gap-2">
          <div>
            <h5 class="mb-1">${p.name}</h5>
            <small class="text-muted">Patient ID: <code>${p.patientId || "-"}</code></small><br>
            <small class="text-muted">DOB: ${p.dob || "---"}</small>
          </div>
          <button class="btn btn-primary btn-sm give-appointment-btn" data-id="${p.patientId}">
            Give Appointment
          </button>
        </div>
      `;
      searchResults.appendChild(div);
    });
    searchResults.querySelectorAll('.give-appointment-btn').forEach(btn => {
      btn.onclick = function() {
        giveAppointmentForPatient(btn.getAttribute("data-id"));
      };
    });
  }

  window.giveAppointmentForPatient = function(patientId) {
    const patients = getPatients();
    const users = JSON.parse(localStorage.getItem("users")) || [];
    const doctors = users.filter(u => 
      u.userRole && 
      (
        u.userRole === "Doctor" || 
        u.userRole === "Doctor/Physio" || 
        u.userRole === "Physio"
      ) && 
      u.userStatus === "Active"
    );
    const thisPatient = patients.find(p => p.patientId === patientId);
    if (!thisPatient) return alert("Patient not found!");

    document.getElementById("modalPatientId").value = thisPatient.patientId;
    document.getElementById("modalPatientName").value = thisPatient.name;
    document.getElementById("modalDoctorSelect").innerHTML =
      '<option value="">Select Doctor</option>' +
      doctors.map(d => `<option value="${d.userName}">${d.userName}</option>`).join("");
    document.getElementById("modalApptDate").value = "";
    document.getElementById("modalApptTime").value = "";

    new bootstrap.Modal(document.getElementById('assignDoctorModal')).show();
  };

  document.getElementById("assignDoctorForm").onsubmit = function(e) {
    e.preventDefault();
    const patientId = document.getElementById("modalPatientId").value;
    const doctor = document.getElementById("modalDoctorSelect").value;
    const date = document.getElementById("modalApptDate").value;
    const time = document.getElementById("modalApptTime").value;
    if (!patientId || !doctor || !date || !time) {
      alert("Please fill all appointment details.");
      return;
    }
    let appointments = JSON.parse(localStorage.getItem("appointments")) || [];
    const patients = getPatients();
    const thisPatient = patients.find(p => p.patientId === patientId);

    appointments.push({
      patientId,
      patient: thisPatient?.name || "",
      doctor,
      date,
      time,
      status: "ongoing",
      createdAt: new Date().toISOString()
    });
    localStorage.setItem("appointments", JSON.stringify(appointments));

    bootstrap.Modal.getOrCreateInstance(document.getElementById("assignDoctorModal")).hide();
    alert(`Appointment started for ${thisPatient?.name || patientId} with ${doctor} (Status: ongoing).`);
  };

  searchInput.addEventListener("input", function() {
    renderResults(getPatientsFiltered(searchInput.value));
  });
  renderResults(getPatientsFiltered(""));
})();
