(async function loadProductsFromApi() {
  const productContainers = document.querySelectorAll('[data-products], #products-list, .products-grid');
  const detailContainer = document.querySelector('[data-product-detail]');

  function money(value) {
    return new Intl.NumberFormat('fa-IR').format(Number(value || 0)) + ' تومان';
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

  function productCard(product) {
    const title = product.title || product.name;
    return `
      <article class="product-card" data-product-id="${escapeHtml(product._id)}">
        <a href="/product-detail.html?id=${encodeURIComponent(product._id)}">
          <img src="${escapeHtml(product.image || '/images/placeholder.png')}" alt="${escapeHtml(title)}" loading="lazy">
          <h3>${escapeHtml(title)}</h3>
          <p>${escapeHtml(product.category || '')}</p>
          <strong>${money(product.price)}</strong>
        </a>
      </article>
    `;
  }

  async function fetchJson(url) {
    const response = await fetch(url);
    const data = await response.json();
    if (!response.ok || data.success === false) throw new Error(data.message || 'خطا در دریافت محصولات');
    return data;
  }

  if (productContainers.length) {
    try {
      const data = await fetchJson('/api/products');
      productContainers.forEach((container) => {
        container.innerHTML = data.products.map(productCard).join('');
      });
      window.hamgamProducts = data.products;
      document.dispatchEvent(new CustomEvent('hamgam:products-loaded', { detail: data.products }));
    } catch (error) {
      console.error(error);
    }
  }

  if (detailContainer) {
    const id = new URLSearchParams(location.search).get('id');
    if (!id) return;
    try {
      const { product } = await fetchJson(`/api/products/${encodeURIComponent(id)}`);
      const title = product.title || product.name;
      detailContainer.innerHTML = `
        <div class="product-detail-media"><img src="${escapeHtml(product.image || '/images/placeholder.png')}" alt="${escapeHtml(title)}"></div>
        <div class="product-detail-info">
          <h1>${escapeHtml(title)}</h1>
          <p>${escapeHtml(product.description || '')}</p>
          <strong>${money(product.price)}</strong>
          <span>${product.stock > 0 ? 'موجود' : 'ناموجود'}</span>
        </div>
      `;
      window.hamgamProduct = product;
      document.dispatchEvent(new CustomEvent('hamgam:product-loaded', { detail: product }));
    } catch (error) {
      detailContainer.innerHTML = '<p>محصول پیدا نشد.</p>';
      console.error(error);
    }
  }
})();
