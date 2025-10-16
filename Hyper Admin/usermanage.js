// Helper to get all users from localStorage
function getUsers() {
  return JSON.parse(localStorage.getItem('users') || '[]');
}

// Helper to save all users to localStorage
function saveUsers(users) {
  localStorage.setItem('users', JSON.stringify(users));
}

// Render user list table with search filter
function renderUsers(filter = "") {
  const tbody = document.getElementById('userTableBody');
  const users = getUsers();
  let filtered = users;
  if (filter) {
    const f = filter.toLowerCase();
    filtered = users.filter(u =>
      u.userEmail.toLowerCase().includes(f) ||
      u.userName.toLowerCase().includes(f) ||
      u.userRole.toLowerCase().includes(f)
    );
  }
  tbody.innerHTML = "";
  filtered.forEach((u, i) => {
    tbody.innerHTML += `<tr>
      <td>${i + 1}</td>
      <td>${u.userName}</td>
      <td>${u.userEmail}</td>
      <td>${u.userRole}</td>
      <td><span class="badge ${u.userStatus === 'Active' ? 'bg-success' : 'bg-secondary'}">${u.userStatus}</span></td>
      <td><span class="small text-muted">${u.createdAt ? u.createdAt.slice(0, 10) : ''}</span></td>
      <td>
        <button class="btn btn-sm btn-primary me-2" onclick="editUser(${i})"><i class="fas fa-pen"></i></button>
        <button class="btn btn-sm btn-danger" onclick="deleteUser(${i})"><i class="fas fa-trash"></i></button>
      </td>
    </tr>`;
  });
}

// Show modal for adding new user
document.getElementById('addUserBtn').onclick = function() {
  document.getElementById('editIndex').value = "";
  document.getElementById('userForm').reset();
  document.getElementById('userModalLabel').textContent = "Add User";
  new bootstrap.Modal(document.getElementById('userModal')).show();
};

// Fill modal form for editing user
window.editUser = function (idx) {
  const users = getUsers();
  const u = users[idx];
  document.getElementById('userName').value = u.userName;
  document.getElementById('userEmail').value = u.userEmail;
  document.getElementById('userPassword').value = u.userPassword;
  document.getElementById('userRole').value = u.userRole;
  document.getElementById('userStatus').value = u.userStatus;
  document.getElementById('editIndex').value = idx;
  document.getElementById('userModalLabel').textContent = "Edit User";
  new bootstrap.Modal(document.getElementById('userModal')).show();
};

// Delete user confirmation and removal
window.deleteUser = function(idx) {
  if (!confirm("Are you sure you want to permanently delete this user?")) return;
  let users = getUsers();
  users.splice(idx, 1);
  saveUsers(users);
  renderUsers(document.getElementById('userSearch').value);
};

// Handle form submit for add/edit user
document.getElementById('userForm').onsubmit = function(e) {
  e.preventDefault();
  const userName = document.getElementById('userName').value.trim();
  const userEmail = document.getElementById('userEmail').value.trim();
  const userPassword = document.getElementById('userPassword').value;
  const userRole = document.getElementById('userRole').value;
  const userStatus = document.getElementById('userStatus').value;
  const editIndex = document.getElementById('editIndex').value;

  if (!userName || !userEmail || !userPassword || !userRole) {
    alert('Please fill all required fields.');
    return;
  }

  const users = getUsers();

  if(editIndex) {
    // Editing existing user
    if(users.some((u, ix) => u.userEmail === userEmail && ix != editIndex)) {
      alert('Another user with this email/login already exists!');
      return;
    }
    users[editIndex] = {
      userName,
      userEmail,
      userPassword,
      userRole,
      userStatus,
      createdAt: users[editIndex].createdAt || new Date().toISOString(),
    };
    alert('User updated!');
  } else {
    // Adding new user
    if(users.some(u => u.userEmail === userEmail)) {
      alert('Email/Login already exists!');
      return;
    }
    users.push({
      userName,
      userEmail,
      userPassword,
      userRole,
      userStatus,
      createdAt: new Date().toISOString(),
    });
    alert('User added!');
  }

  saveUsers(users);
  bootstrap.Modal.getInstance(document.getElementById('userModal')).hide();
  renderUsers(document.getElementById('userSearch').value);
  document.getElementById('userForm').reset();
  document.getElementById('editIndex').value = "";
};

// Search filter input
document.getElementById('userSearch').oninput = function() {
  renderUsers(this.value);
};

// Initial rendering of users
renderUsers();
