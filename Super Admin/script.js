// ===========================
// Login Handling
// ===========================
document.getElementById("loginForm")?.addEventListener("submit", function (e) {
  e.preventDefault();
  const role = document.getElementById("role").value;
  localStorage.setItem("role", role);
  window.location.href = "dashboard.html";
});

// ===========================
// Register Patient Handling
// ===========================
document.getElementById("patientForm")?.addEventListener("submit", function (e) {
  e.preventDefault();

  const form = e.target;
  const patient = {
    id: Date.now(),
    name: form.name.value,
    dob: form.dob.value,
    gender: form.gender.value,
    phone: form.phone.value,
    email: form.email.value,
    address: form.address.value,
    medicalHistory: form.medicalHistory.value,
    treatmentPlan: form.treatmentPlan.value,
    status: "pending",
    registeredAt: new Date().toLocaleString(),
  };

  let patients = JSON.parse(localStorage.getItem("patients")) || [];
  patients.push(patient);
  localStorage.setItem("patients", JSON.stringify(patients));

  alert("Patient registered successfully.");
  form.reset();
});

// ===========================
// Logout Handling
// ===========================
window.logout = function () {
  localStorage.clear();
  window.location.href = "index.html";
};
