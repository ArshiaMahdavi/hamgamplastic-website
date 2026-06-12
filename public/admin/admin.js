const ADMIN_API = '/api/admin';
const tokenKey = 'adminToken';

const nav = [
  ['dashboard', 'داشبورد', '/admin/dashboard'],
  ['products', 'محصولات', '/admin/products'],
  ['orders', 'سفارش‌ها', '/admin/orders'],
  ['users', 'کاربران', '/admin/users'],
  ['discounts', 'تخفیف‌ها', '/admin/discounts'],
  ['settings', 'تنظیمات', '/admin/settings'],
];

const toman = new Intl.NumberFormat('fa-IR');

function token() {
  return localStorage.getItem(tokenKey);
}

async function api(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (!(options.body instanceof FormData)) headers['Content-Type'] = 'application/json';
  if (token()) headers.Authorization = `Bearer ${token()}`;

  const response = await fetch(`${ADMIN_API}${path}`, { ...options, headers });
  if (response.status === 401 || response.status === 403) {
    localStorage.removeItem(tokenKey);
    location.href = '/admin/login';
    throw new Error('unauthorized');
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.success === false) throw new Error(data.message || 'خطا در ارتباط با سرور');
  return data;
}

function valueOf(item, keys, fallback = '-') {
  for (const key of keys) {
    if (item && item[key] !== undefined && item[key] !== null && item[key] !== '') return item[key];
  }
  return fallback;
}

function money(value) {
  return `${toman.format(Number(value || 0))} تومان`;
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  }[char]));
}

function shell(page, user) {
  document.body.innerHTML = `
    <div class="admin-shell">
      <aside class="sidebar">
        <div class="sidebar-brand">
          <div class="brand-mark">HP</div>
          <div><strong>همگام پلاستیک</strong><span>پنل مدیریت</span></div>
        </div>
        <nav class="nav-list">
          ${nav.map(([key, label, href]) => `<a class="nav-link ${key === page ? 'active' : ''}" href="${href}">${label}</a>`).join('')}
          <a class="nav-link" href="/" target="_blank">مشاهده سایت</a>
        </nav>
      </aside>
      <main class="main">
        <header class="topbar glass">
          <div class="page-title">
            <h1>${nav.find(([key]) => key === page)?.[1] || 'پنل مدیریت'}</h1>
            <p>مدیریت امن داده‌های فروشگاه بدون تغییر در تجربه عمومی سایت.</p>
          </div>
          <div class="admin-user">
            <div class="avatar">${escapeHtml((user?.name || user?.email || 'A').slice(0, 1))}</div>
            <span>${escapeHtml(user?.name || user?.email || 'مدیر')}</span>
            <button id="logout" class="ghost-btn">خروج</button>
          </div>
        </header>
        <section id="page-content" class="content-grid"></section>
      </main>
    </div>
  `;
  document.getElementById('logout').addEventListener('click', () => {
    localStorage.removeItem(tokenKey);
    location.href = '/admin/login';
  });
}

async function initProtectedPage() {
  const page = document.body.dataset.page;
  if (!page) return;
  if (!token()) return location.replace('/admin/login');
  const { user } = await api('/me');
  shell(page, user);
  const renderers = { dashboard, products, orders, users, discounts, settings };
  renderers[page]?.();
}

async function handleLogin() {
  const form = document.getElementById('admin-login-form');
  if (!form) return;
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const message = document.getElementById('login-message');
    message.textContent = 'در حال ورود...';
    const payload = Object.fromEntries(new FormData(form));
    const candidates = ['/api/auth/login', '/api/users/login', '/api/login'];

    for (const url of candidates) {
      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: payload.identifier,
            phone: payload.identifier,
            identifier: payload.identifier,
            password: payload.password,
          }),
        });
        const data = await response.json().catch(() => ({}));
        const nextToken = data.token || data.accessToken || data.jwt || data.user?.token;
        if (response.ok && nextToken) {
          localStorage.setItem(tokenKey, nextToken);
          await api('/me');
          location.href = '/admin/dashboard';
          return;
        }
      } catch (error) {
        // Try next known endpoint.
      }
    }
    message.textContent = 'ورود ناموفق بود یا حساب شما دسترسی مدیریت ندارد.';
  });
}

function content() {
  return document.getElementById('page-content');
}

async function dashboard() {
  const root = content();
  root.innerHTML = '<div class="panel">در حال دریافت آمار...</div>';
  const { stats } = await api('/stats');
  const latestOrders = stats.latestOrders || [];
  const latestUsers = stats.latestUsers || [];
  const maxSale = Math.max(1, ...(stats.monthlySales || []).map((item) => item.total || 0));

  root.innerHTML = `
    <div class="stats-grid">
      ${stat('کل محصولات', stats.totalProducts, 'blue')}
      ${stat('کل سفارش‌ها', stats.totalOrders, 'gold')}
      ${stat('کل کاربران', stats.totalUsers, 'teal')}
      ${stat('درآمد کل', money(stats.totalRevenue), 'green')}
      ${stat('در انتظار', stats.pendingOrders, 'warn')}
      ${stat('تکمیل شده', stats.completedOrders, 'success')}
    </div>
    <div class="split-panels">
      <section class="panel">
        <div class="panel-header"><h2 class="panel-title">فروش ماهانه</h2><span class="table-meta">۱۲ بازه اخیر</span></div>
        <div class="chart-bars">
          ${(stats.monthlySales || []).map((item) => `<div class="bar" title="${money(item.total)}" style="height:${Math.max(8, (item.total / maxSale) * 100)}%"></div>`).join('') || '<span class="mini-text">داده‌ای موجود نیست.</span>'}
        </div>
      </section>
      <section class="panel">
        <div class="panel-header"><h2 class="panel-title">پرفروش‌ترین‌ها</h2></div>
        ${(stats.bestSellingProducts || []).map((item) => `<p><span class="badge success">${toman.format(item.quantity || 0)}</span> ${escapeHtml(item.title || item._id || 'محصول')}</p>`).join('') || '<p class="mini-text">هنوز فروشی ثبت نشده است.</p>'}
      </section>
    </div>
    <div class="split-panels">
      ${tablePanel('آخرین سفارش‌ها', ['کد', 'مبلغ', 'وضعیت'], latestOrders.map((item) => [shortId(item), money(valueOf(item, ['totalPrice', 'total'], 0)), statusBadge(item.status)]))}
      ${tablePanel('آخرین کاربران', ['نام', 'ایمیل/موبایل', 'نقش'], latestUsers.map((item) => [escapeHtml(item.name || '-'), escapeHtml(item.email || item.phone || '-'), roleBadge(item.role)]))}
    </div>
  `;
}

function stat(label, value) {
  return `<div class="stat-card"><span>${label}</span><strong>${escapeHtml(value)}</strong></div>`;
}

function tablePanel(title, heads, rows) {
  return `
    <section class="panel">
      <div class="panel-header"><h2 class="panel-title">${title}</h2></div>
      <div class="table-wrap"><table><thead><tr>${heads.map((h) => `<th>${h}</th>`).join('')}</tr></thead><tbody>
        ${rows.map((row) => `<tr>${row.map((cell) => `<td>${cell}</td>`).join('')}</tr>`).join('') || `<tr><td colspan="${heads.length}">داده‌ای موجود نیست.</td></tr>`}
      </tbody></table></div>
    </section>
  `;
}

async function products() {
  const root = content();
  root.innerHTML = `
    <section class="panel">
      <div class="panel-header"><h2 class="panel-title" id="product-form-title">افزودن محصول</h2><input id="product-search" placeholder="جستجوی محصول"></div>
      <form id="product-form" class="admin-form">
        <input type="hidden" name="_id">
        <div class="form-grid">
          <label>عنوان<input name="name" required></label>
          <label>دسته‌بندی<input name="category"></label>
          <label>قیمت<input name="price" type="number" min="0" required></label>
          <label>موجودی<input name="stock" type="number" min="0" value="0"></label>
          <label>امتیاز<input name="rating" type="number" min="0" max="5" step="0.1" value="0"></label>
          <label>عکس محصول<input name="imageFile" type="file" accept="image/*"></label>
        </div>
        <label>توضیحات<textarea name="description"></textarea></label>
        <div class="actions">
          <button class="primary-btn">ذخیره محصول</button>
          <button class="ghost-btn" type="button" id="product-form-reset">محصول جدید</button>
        </div>
      </form>
    </section>
    <section class="panel"><div id="products-table"></div></section>
  `;
  document.getElementById('product-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const formData = new FormData(event.target);
    const id = formData.get('_id');
    if (!formData.get('imageFile')?.size) formData.delete('imageFile');
    if (id) {
      await api(`/products/${id}`, { method: 'PUT', body: formData });
    } else {
      formData.delete('_id');
      await api('/products', { method: 'POST', body: formData });
    }
    resetProductForm();
    loadProducts();
  });
  document.getElementById('product-form-reset').addEventListener('click', resetProductForm);
  document.getElementById('product-search').addEventListener('input', debounce(loadProducts, 350));
  loadProducts();
}

async function loadProducts() {
  const q = document.getElementById('product-search')?.value || '';
  const { products: list } = await api(`/products?search=${encodeURIComponent(q)}`);
  window.adminProducts = list;
  document.getElementById('products-table').innerHTML = table(['عکس', 'عنوان', 'دسته', 'قیمت', 'موجودی', 'وضعیت', 'عملیات'], list.map((item) => [
    `<img class="product-thumb" src="${escapeHtml(item.image || '/images/placeholder.png')}" alt="${escapeHtml(valueOf(item, ['title', 'name']))}">`,
    escapeHtml(valueOf(item, ['title', 'name'])),
    escapeHtml(item.category || '-'),
    money(item.price),
    escapeHtml(valueOf(item, ['stock', 'inventory'], 0)),
    item.isActive === false ? statusBadge('inactive') : statusBadge('active'),
    `<div class="actions"><button class="ghost-btn" data-edit-product="${item._id}">ویرایش</button><button class="danger-btn" data-delete-product="${item._id}">حذف</button></div>`,
  ]));
  document.querySelectorAll('[data-edit-product]').forEach((button) => button.addEventListener('click', () => {
    const product = window.adminProducts.find((item) => item._id === button.dataset.editProduct);
    fillProductForm(product);
  }));
  document.querySelectorAll('[data-delete-product]').forEach((button) => button.addEventListener('click', async () => {
    if (confirm('محصول حذف شود؟')) {
      await api(`/products/${button.dataset.deleteProduct}`, { method: 'DELETE' });
      loadProducts();
    }
  }));
}

function fillProductForm(product) {
  if (!product) return;
  const form = document.getElementById('product-form');
  form.elements._id.value = product._id || '';
  form.elements.name.value = product.name || product.title || '';
  form.elements.category.value = product.category || '';
  form.elements.price.value = product.price || 0;
  form.elements.stock.value = product.stock ?? 0;
  form.elements.rating.value = product.rating ?? 0;
  form.elements.description.value = product.description || '';
  form.elements.imageFile.value = '';
  document.getElementById('product-form-title').textContent = 'ویرایش محصول';
  form.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function resetProductForm() {
  const form = document.getElementById('product-form');
  form.reset();
  form.elements._id.value = '';
  form.elements.stock.value = 0;
  form.elements.rating.value = 0;
  document.getElementById('product-form-title').textContent = 'افزودن محصول';
}

async function orders() {
  content().innerHTML = '<section class="panel"><div id="orders-table">در حال دریافت سفارش‌ها...</div></section>';
  const { orders: list } = await api('/orders');
  document.getElementById('orders-table').innerHTML = table(['کد', 'مشتری', 'مبلغ', 'پرداخت', 'وضعیت سفارش'], list.map((item) => [
    shortId(item),
    escapeHtml(item.customerName || item.user?.name || item.phone || '-'),
    money(valueOf(item, ['totalPrice', 'total'], 0)),
    statusBadge(item.paymentStatus || (item.isPaid ? 'paid' : 'pending')),
    `<select data-order="${item._id}">${['pending', 'processing', 'paid', 'shipped', 'delivered', 'cancelled'].map((s) => `<option value="${s}" ${item.status === s ? 'selected' : ''}>${statusFa(s)}</option>`).join('')}</select>`,
  ]));
  document.querySelectorAll('[data-order]').forEach((select) => select.addEventListener('change', async () => {
    await api(`/orders/${select.dataset.order}/status`, { method: 'PUT', body: JSON.stringify({ status: select.value }) });
  }));
}

async function users() {
  const root = content();
  root.innerHTML = '<section class="panel"><div class="panel-header"><h2 class="panel-title">کاربران</h2><input id="user-search" placeholder="جستجوی کاربر"></div><div id="users-table"></div></section>';
  document.getElementById('user-search').addEventListener('input', debounce(loadUsers, 350));
  loadUsers();
}

async function loadUsers() {
  const q = document.getElementById('user-search')?.value || '';
  const { users: list } = await api(`/users?search=${encodeURIComponent(q)}`);
  document.getElementById('users-table').innerHTML = table(['نام', 'ایمیل/موبایل', 'نقش', 'وضعیت', 'عملیات'], list.map((item) => [
    escapeHtml(item.name || '-'),
    escapeHtml(item.email || item.phone || '-'),
    `<select data-role="${item._id}">${['user', 'admin', 'superAdmin'].map((role) => `<option value="${role}" ${item.role === role ? 'selected' : ''}>${roleFa(role)}</option>`).join('')}</select>`,
    item.isBlocked ? statusBadge('blocked') : statusBadge('active'),
    `<button class="ghost-btn" data-block="${item._id}" data-state="${!item.isBlocked}">${item.isBlocked ? 'رفع مسدودی' : 'مسدود کردن'}</button>`,
  ]));
  document.querySelectorAll('[data-role]').forEach((select) => select.addEventListener('change', async () => {
    await api(`/users/${select.dataset.role}/role`, { method: 'PUT', body: JSON.stringify({ role: select.value }) });
  }));
  document.querySelectorAll('[data-block]').forEach((button) => button.addEventListener('click', async () => {
    await api(`/users/${button.dataset.block}/block`, { method: 'PUT', body: JSON.stringify({ blocked: button.dataset.state === 'true' }) });
    loadUsers();
  }));
}

async function discounts() {
  const root = content();
  root.innerHTML = `
    <section class="panel">
      <div class="panel-header"><h2 class="panel-title">کد تخفیف جدید</h2></div>
      <form id="discount-form" class="admin-form">
        <div class="form-grid">
          <label>کد<input name="code" required></label>
          <label>عنوان<input name="title"></label>
          <label>نوع<select name="type"><option value="percentage">درصدی</option><option value="fixed">مبلغ ثابت</option></select></label>
          <label>مقدار<input name="value" type="number" min="0" required></label>
          <label>تاریخ انقضا<input name="expiresAt" type="date"></label>
          <label>سقف استفاده<input name="usageLimit" type="number" min="0" value="0"></label>
        </div>
        <button class="primary-btn">ایجاد تخفیف</button>
      </form>
    </section>
    <section class="panel"><div id="discounts-table"></div></section>
  `;
  document.getElementById('discount-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    await api('/discounts', { method: 'POST', body: JSON.stringify(Object.fromEntries(new FormData(event.target))) });
    event.target.reset();
    loadDiscounts();
  });
  loadDiscounts();
}

async function loadDiscounts() {
  const { discounts: list } = await api('/discounts');
  document.getElementById('discounts-table').innerHTML = table(['کد', 'نوع', 'مقدار', 'استفاده', 'وضعیت', 'عملیات'], list.map((item) => [
    escapeHtml(item.code),
    item.type === 'percentage' ? 'درصدی' : 'ثابت',
    item.type === 'percentage' ? `${toman.format(item.value)}٪` : money(item.value),
    `${toman.format(item.usedCount || 0)} / ${toman.format(item.usageLimit || 0)}`,
    item.isActive ? statusBadge('active') : statusBadge('inactive'),
    `<button class="danger-btn" data-delete-discount="${item._id}">حذف</button>`,
  ]));
  document.querySelectorAll('[data-delete-discount]').forEach((button) => button.addEventListener('click', async () => {
    await api(`/discounts/${button.dataset.deleteDiscount}`, { method: 'DELETE' });
    loadDiscounts();
  }));
}

async function settings() {
  const { settings: data } = await api('/settings');
  content().innerHTML = `
    <section class="panel">
      <div class="panel-header"><h2 class="panel-title">تنظیمات سایت</h2><span id="settings-message" class="form-message"></span></div>
      <form id="settings-form" class="admin-form">
        <div class="form-grid">
          <label>نام شرکت<input name="companyName" value="${escapeHtml(data.companyName)}"></label>
          <label>تلفن<input name="phone" value="${escapeHtml(data.phone)}"></label>
          <label>ایمیل<input name="email" value="${escapeHtml(data.email)}"></label>
          <label>مسیر لوگو<input name="logoPath" value="${escapeHtml(data.logoPath)}"></label>
          <label>عنوان سئو<input name="seoTitle" value="${escapeHtml(data.seoTitle)}"></label>
          <label>اینستاگرام<input name="socialLinks.instagram" value="${escapeHtml(data.socialLinks?.instagram)}"></label>
        </div>
        <label>آدرس<textarea name="address">${escapeHtml(data.address)}</textarea></label>
        <label>توضیحات سئو<textarea name="seoDescription">${escapeHtml(data.seoDescription)}</textarea></label>
        <div class="actions"><button class="primary-btn">ذخیره تنظیمات</button></div>
      </form>
    </section>
    <section class="panel">
      <div class="panel-header"><h2 class="panel-title">آپلود تصویر</h2><span id="upload-result" class="mini-text"></span></div>
      <form id="upload-form" class="admin-form"><input type="file" name="image" accept="image/*"><button class="ghost-btn">آپلود</button></form>
    </section>
  `;
  document.getElementById('settings-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const raw = Object.fromEntries(new FormData(event.target));
    const payload = { ...raw, socialLinks: { instagram: raw['socialLinks.instagram'] } };
    delete payload['socialLinks.instagram'];
    await api('/settings', { method: 'PUT', body: JSON.stringify(payload) });
    document.getElementById('settings-message').textContent = 'ذخیره شد.';
  });
  document.getElementById('upload-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = new FormData(event.target);
    const data = await api('/media', { method: 'POST', body: form });
    document.getElementById('upload-result').textContent = data.path;
  });
}

function table(heads, rows) {
  return `<div class="table-wrap"><table><thead><tr>${heads.map((h) => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.map((row) => `<tr>${row.map((cell) => `<td>${cell}</td>`).join('')}</tr>`).join('') || `<tr><td colspan="${heads.length}">داده‌ای موجود نیست.</td></tr>`}</tbody></table></div>`;
}

function statusFa(status) {
  return {
    pending: 'در انتظار',
    processing: 'در حال پردازش',
    paid: 'پرداخت شده',
    shipped: 'ارسال شده',
    delivered: 'تحویل شده',
    cancelled: 'لغو شده',
    active: 'فعال',
    inactive: 'غیرفعال',
    blocked: 'مسدود',
  }[status] || status || '-';
}

function statusBadge(status) {
  const cls = ['paid', 'delivered', 'active'].includes(status) ? 'success' : ['pending', 'processing', 'shipped'].includes(status) ? 'warn' : ['cancelled', 'inactive', 'blocked'].includes(status) ? 'danger' : '';
  return `<span class="badge ${cls}">${escapeHtml(statusFa(status))}</span>`;
}

function roleFa(role) {
  return { user: 'کاربر', admin: 'مدیر', superAdmin: 'مدیر ارشد' }[role] || role || 'کاربر';
}

function roleBadge(role) {
  return `<span class="badge">${roleFa(role)}</span>`;
}

function shortId(item) {
  return escapeHtml(item.orderNumber || item.invoiceNumber || String(item._id || '').slice(-8));
}

function debounce(fn, wait) {
  let timeout;
  return (...args) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => fn(...args), wait);
  };
}

handleLogin();
initProtectedPage().catch((error) => {
  console.error(error);
  if (content()) content().innerHTML = `<section class="panel">${escapeHtml(error.message || 'خطا رخ داد.')}</section>`;
});
