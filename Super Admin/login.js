document.getElementById('loginForm').addEventListener('submit', function(e) {
  e.preventDefault();
  const role = document.getElementById('role').value;
  const username = document.getElementById('username').value.trim();
  const password = document.getElementById('password').value;

  if (!role || !username || !password) {
    alert('All fields are required!');
    return;
  }

  const users = JSON.parse(localStorage.getItem('users') || '[]');
  const user = users.find(u =>
    u.userEmail.toLowerCase() === username.toLowerCase() &&
    u.userPassword === password &&
    u.userRole === role &&
    u.userStatus === 'Active'
  );

  if (!user) {
    alert('Invalid credentials or inactive account.');
    return;
  }

  // Save user session in localStorage
  localStorage.setItem('currentUser', JSON.stringify({
    username: user.userEmail,
    role: user.userRole,
    name: user.userName
  }));

  // Redirect to dashboard based on role
  switch (user.userRole) {
    case 'SuperAdmin':
      window.location.href = 'superadmin-dashboard.html';
      break;
    case 'Admin':
      window.location.href = 'admin-dashboard.html';
      break;
    case 'Physio':
      window.location.href = 'physio-dashboard.html';
      break;
    case 'HyperAdmin':
      window.location.href = 'hyperadmin-dashboard.html';
      break;
    case 'StrengthAndConditioning':
      window.location.href = 'strengthandconditioning-dashboard.html';
      break;
    default:
      alert('Role not recognized.');
  }
});
