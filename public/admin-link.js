(async function showAdminMenuLink() {
  const link = document.getElementById('admin-menu-link');
  if (!link) return;

  const token = localStorage.getItem('token') || localStorage.getItem('adminToken');
  if (!token) return;

  try {
    const response = await fetch('/api/admin/me', {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) return;

    const data = await response.json();
    if (['admin', 'superAdmin'].includes(data.user?.role)) {
      link.style.display = '';
    }
  } catch (error) {
    link.style.display = 'none';
  }
})();
