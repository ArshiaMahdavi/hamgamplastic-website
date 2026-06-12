/**
 * @file اسکریپت عمومی وبسایت همگام پلاستیک
 * @description This file contains shared logic for cart management and UI updates (header).
 * @version 3.0.0 (Premium UI + Cart Reliability)
 */

document.addEventListener('DOMContentLoaded', () => {

    // --- Global App Object ---
    const App = {
        utils: {
            safeJsonParse(value, fallback) {
                try {
                    return value ? JSON.parse(value) : fallback;
                } catch (error) {
                    console.warn('خطا در خواندن داده ذخیره‌شده:', error);
                    return fallback;
                }
            },
            escapeHTML(value = '') {
                return String(value).replace(/[&<>"']/g, char => ({
                    '&': '&amp;',
                    '<': '&lt;',
                    '>': '&gt;',
                    '"': '&quot;',
                    "'": '&#039;'
                }[char]));
            },
            formatPrice(price) {
                return (Number(price) || 0).toLocaleString('fa-IR') + ' تومان';
            }
        },

        // --- Cart Logic ---
        cart: {
            get: () => App.utils.safeJsonParse(localStorage.getItem('shoppingCart'), []),
            save(cartData) {
                const normalized = Array.isArray(cartData) ? cartData.filter(item => item && item.id) : [];
                localStorage.setItem('shoppingCart', JSON.stringify(normalized));
                this.updateCounter();
            },
            add(product, quantity = 1) {
                if (!product || !product.id) return;
                let currentCart = this.get();
                const existingProduct = currentCart.find(item => item.id === product.id);
                const nextQuantity = Math.max(1, Number.parseInt(quantity, 10) || 1);
                const safeProduct = {
                    id: String(product.id),
                    name: String(product.name || 'محصول همگام پلاستیک'),
                    price: Number(product.price) || 0,
                    category: String(product.category || ''),
                    image: String(product.image || ''),
                    rating: Number(product.rating) || 0,
                    stock: product.stock !== false,
                    description: String(product.description || '')
                };
                if (existingProduct) {
                    existingProduct.quantity += nextQuantity;
                } else {
                    currentCart.push({ ...safeProduct, quantity: nextQuantity });
                }
                this.save(currentCart);
                this.showNotification('محصول به سبد خرید اضافه شد.');
            },
            updateQuantity(productId, quantity) {
                const nextQuantity = Number.parseInt(quantity, 10);
                const currentCart = this.get();
                const updatedCart = currentCart
                    .map(item => item.id === productId ? { ...item, quantity: Math.max(1, nextQuantity || 1) } : item)
                    .filter(item => item.quantity > 0);
                this.save(updatedCart);
            },
            remove(productId) {
                this.save(this.get().filter(item => item.id !== productId));
                this.showNotification('محصول از سبد خرید حذف شد.');
            },
            clear() {
                localStorage.removeItem('shoppingCart');
                this.updateCounter();
            },
            updateCounter() {
                const totalItems = this.get().reduce((sum, item) => sum + (Number(item.quantity) || 0), 0);
                const counterEl = document.getElementById('cart-counter');
                if(counterEl) {
                    counterEl.textContent = totalItems;
                    counterEl.style.display = totalItems > 0 ? 'flex' : 'none';
                    counterEl.setAttribute('aria-label', `${totalItems.toLocaleString('fa-IR')} کالا در سبد خرید`);
                }
            },
            showNotification(message) {
                const notification = document.getElementById('cart-notification');
                if (notification) {
                    const messageEl = notification.querySelector('span');
                    if (messageEl && message) messageEl.textContent = message;
                    notification.classList.add('show');
                    setTimeout(() => {
                        notification.classList.remove('show');
                    }, 2500);
                }
            }
        },

        // --- Auth Logic ---
        auth: {
            checkLoginStatus() {
                const userDisplay = document.getElementById('user-display');
                const token = localStorage.getItem('auth-token');
                const username = localStorage.getItem('username');
                
                if (token && username && userDisplay) {
                    const safeUsername = App.utils.escapeHTML(username);
                    const firstLetter = safeUsername.charAt(0).toUpperCase();
                    userDisplay.innerHTML = `
                        <div class="flex items-center space-x-2 space-x-reverse text-slate-200">
                            <a href="my-account.html" class="flex items-center group p-1 rounded-full hover:bg-slate-700/50 transition-colors duration-300">
                                <div class="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-amber-400 flex items-center justify-center font-bold text-slate-900 text-lg flex-shrink-0 group-hover:ring-2 group-hover:ring-amber-300 transition-all">
                                    ${firstLetter}
                                </div>
                                <span class="hidden sm:block font-bold text-sm text-white mr-2 group-hover:text-amber-300 transition-colors">${safeUsername}</span>
                            </a>
                            
                            <!-- Logout Button -->
                            <button id="logout-btn" class="text-xl text-slate-400 hover:text-amber-300 transition-colors" title="خروج">
                                <i class="fas fa-sign-out-alt"></i>
                            </button>
                        </div>
                    `;

                    const logoutHandler = () => {
                        localStorage.removeItem('auth-token');
                        localStorage.removeItem('username');
                        window.location.reload();
                    };

                    const logoutBtn = document.getElementById('logout-btn');
                    if(logoutBtn) logoutBtn.addEventListener('click', logoutHandler);

                } else if (userDisplay) {
                    // Fallback to the login button if not logged in
                    userDisplay.innerHTML = `<a href="login.html" id="login-btn" class="btn-primary !py-1.5 !px-4 sm:!py-2 sm:!px-6 text-sm">ورود</a>`;
                }
            }
        },
        
        // --- Mobile Menu Logic (Robust and Simplified) ---
        menu: {
            init() {
                const mobileMenu = document.getElementById('mobile-menu');
                const mobileToggle = document.getElementById('mobile-toggle');
                const mobileClose = document.getElementById('mobile-close');
                const mobileLinks = document.querySelectorAll('.mobile-link');
                if (!mobileMenu || !mobileToggle) return;

                mobileToggle.setAttribute('aria-controls', 'mobile-menu');
                mobileToggle.setAttribute('aria-expanded', 'false');

                function toggleMenu() {
                    const isOpening = !document.body.classList.contains('menu-open');
                    
                    if (isOpening) {
                        // Prepare to open: remove 'hidden' to make it part of the layout
                        if (mobileMenu) {
                            mobileMenu.classList.remove('hidden');
                        }
                        
                        // Wait a tiny moment for the browser to register the display change, then trigger the animation
                        setTimeout(() => {
                            document.body.classList.add('menu-open');
                            mobileToggle.setAttribute('aria-expanded', 'true');
                        }, 10);
                    } else {
                        // Start closing animation
                        document.body.classList.remove('menu-open');
                        mobileToggle.setAttribute('aria-expanded', 'false');
                        
                        // Wait for the animation to finish (300ms from CSS), then hide the element completely
                        if (mobileMenu) {
                           setTimeout(() => {
                                // Only hide if the menu wasn't re-opened in the meantime
                                if (!document.body.classList.contains('menu-open')) {
                                    mobileMenu.classList.add('hidden');
                                }
                            }, 300); // This duration must match the CSS transition duration
                        }
                    }
                }

                if (mobileToggle) mobileToggle.addEventListener('click', toggleMenu);
                if (mobileClose) mobileClose.addEventListener('click', toggleMenu);
                if (mobileLinks) mobileLinks.forEach(link => {
                    link.addEventListener('click', toggleMenu);
                });
                document.addEventListener('keydown', (event) => {
                    if (event.key === 'Escape' && document.body.classList.contains('menu-open')) {
                        toggleMenu();
                    }
                });
            }
        },

        // --- Initializer ---
        init() {
            this.cart.updateCounter();
            this.auth.checkLoginStatus();
            this.menu.init();
        }
    };

    // Make App object globally accessible
    window.App = App;

    // Run the app
    App.init();

});
