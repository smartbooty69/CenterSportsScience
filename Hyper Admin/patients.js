(() => {
  const patientsPerPage = 10;
  let patients = [];
  let filteredPatients = [];
  let currentPage = 1;

  const tbody = document.getElementById('patientTableBody');
  const searchInput = document.getElementById('searchInput');
  const paginationContainer = document.getElementById('pagination');
  const exportCsvBtn = document.getElementById('exportCsvBtn');

  function formatDate(dateStr) {
    if (!dateStr) return 'N/A';
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-IN', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  function renderPatientsList() {
    tbody.innerHTML = '';

    if (filteredPatients.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="9" class="text-center text-muted">No patients found.</td>
        </tr>
      `;
      paginationContainer.innerHTML = '';
      return;
    }

    const start = (currentPage - 1) * patientsPerPage;
    const end = Math.min(start + patientsPerPage, filteredPatients.length);
    for (let i = start; i < end; i++) {
      const p = filteredPatients[i];
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${i + 1}</td>
        <td>${p.patientId || ''}</td>
        <td>${p.name || ''}</td>
        <td>${p.dob || ''}</td>
        <td>${p.gender || ''}</td>
        <td>${p.phone || ''}</td>
        <td>${p.email || ''}</td>
        <td>${formatDate(p.registeredAt)}</td>
        <td>
          <button class="btn btn-sm btn-outline-primary view-btn" data-idx="${i}" title="View Details">
            <i class="fas fa-eye"></i>
          </button>
          <button class="btn btn-sm btn-outline-warning edit-btn" data-idx="${i}" title="Edit Patient">
            <i class="fas fa-pen"></i>
          </button>
          <button class="btn btn-sm btn-outline-danger delete-btn" data-idx="${i}" title="Delete Patient">
            <i class="fas fa-trash"></i>
          </button>
        </td>
      `;
      tbody.appendChild(tr);
    }

    renderPagination();
    attachActionHandlers();
  }

  function renderPagination() {
    const totalPages = Math.ceil(filteredPatients.length / patientsPerPage);
    if (totalPages <= 1) {
      paginationContainer.innerHTML = '';
      return;
    }

    let html = '';

    // Previous
    html += `<li class="page-item ${currentPage === 1 ? 'disabled' : ''}">
      <button class="page-link" aria-label="Previous" data-page="${currentPage - 1}">&laquo;</button>
    </li>`;

    for (let i = 1; i <= totalPages; i++) {
      html += `<li class="page-item ${i === currentPage ? 'active' : ''}">
        <button class="page-link" data-page="${i}">${i}</button>
      </li>`;
    }

    // Next
    html += `<li class="page-item ${currentPage === totalPages ? 'disabled' : ''}">
      <button class="page-link" aria-label="Next" data-page="${currentPage + 1}">&raquo;</button>
    </li>`;

    paginationContainer.innerHTML = html;

    paginationContainer.querySelectorAll('button.page-link').forEach(btn => {
      btn.addEventListener('click', () => {
        const page = parseInt(btn.getAttribute('data-page'));
        if (!isNaN(page) && page >= 1 && page <= totalPages) {
          currentPage = page;
          renderPatientsList();
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }
      });
    });
  }

  function attachActionHandlers() {
    // View button
    tbody.querySelectorAll('.view-btn').forEach(btn => {
      btn.addEventListener('click', e => {
        const idx = parseInt(e.currentTarget.getAttribute('data-idx'));
        if (isNaN(idx)) return;
        const patient = filteredPatients[idx];
        alert(`Patient Details:\n\nName: ${patient.name}\nID: ${patient.patientId}\nDOB: ${patient.dob}\nGender: ${patient.gender}\nPhone: ${patient.phone}\nEmail: ${patient.email}`);
        // You can replace alert with a modal or redirect as per your design
      });
    });

    // Edit button
    tbody.querySelectorAll('.edit-btn').forEach(btn => {
      btn.addEventListener('click', e => {
        const idx = parseInt(e.currentTarget.getAttribute('data-idx'));
        if (isNaN(idx)) return;
        const patient = filteredPatients[idx];
        alert(`Edit Patient feature coming soon for:\n\n${patient.name} (${patient.patientId})`);
        // Integrate your patient edit page or modal here
      });
    });

    // Delete button
    tbody.querySelectorAll('.delete-btn').forEach(btn => {
      btn.addEventListener('click', e => {
        const idx = parseInt(e.currentTarget.getAttribute('data-idx'));
        if (isNaN(idx)) return;
        const patient = filteredPatients[idx];
        if (!confirm(`Are you sure you want to delete patient "${patient.name}"? This cannot be undone.`)) return;

        // Remove from original patients array by patientId
        patients = patients.filter(p => p.patientId !== patient.patientId);
        localStorage.setItem('patients', JSON.stringify(patients));
        filterPatients();
      });
    });
  }

  function filterPatients() {
    const query = searchInput.value.trim().toLowerCase();
    if (!query) {
      filteredPatients = [...patients];
    } else {
      filteredPatients = patients.filter(p => 
        (p.name || '').toLowerCase().includes(query) ||
        (p.patientId || '').toLowerCase().includes(query) ||
        (p.phone || '').toLowerCase().includes(query)
      );
    }
    currentPage = 1;
    renderPatientsList();
  }

  function exportToCsv() {
    if (patients.length === 0) {
      alert('No patients to export.');
      return;
    }

    const headers = ['Patient ID', 'Name', 'Date of Birth', 'Gender', 'Phone', 'Email', 'Registered At'];
    const csvRows = [
      headers.join(',')
    ];

    patients.forEach(p => {
      const row = [
        `"${p.patientId || ''}"`,
        `"${p.name || ''}"`,
        `"${p.dob || ''}"`,
        `"${p.gender || ''}"`,
        `"${p.phone || ''}"`,
        `"${p.email || ''}"`,
        `"${formatDate(p.registeredAt)}"`
      ];
      csvRows.push(row.join(','));
    });

    const csvString = csvRows.join('\n');
    const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = `patients_${new Date().toISOString().split('T')[0]}.csv`;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();

    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 100);
  }

  // Initialize
  function init() {
    patients = JSON.parse(localStorage.getItem('patients')) || [];
    filterPatients();
  }

  searchInput.addEventListener('input', filterPatients);
  exportCsvBtn.addEventListener('click', exportToCsv);

  init();
})();