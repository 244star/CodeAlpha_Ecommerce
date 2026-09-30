const fallbackProducts = [
  { id: "mug", name: "Sunday ceramic cup", category: "Home", price: 28, stock: 18, tag: "Bestseller", color: "Oat", image_url: "https://images.unsplash.com/photo-1514228742587-6b1558fcca3d?auto=format&fit=crop&w=900&q=85", description: "A hand-finished stoneware cup with a gentle curve, a comfortable weight, and just enough room for the first coffee of the day." },
  { id: "tote", name: "Daily carry tote", category: "Everyday", price: 42, stock: 14, tag: "Everyday essential", color: "Natural", image_url: "https://images.unsplash.com/photo-1590874103328-eac38a683ce7?auto=format&fit=crop&w=900&q=85", description: "An easy, sturdy carryall in heavyweight cotton canvas. Room for the market, the library, or whatever the day brings." },
  { id: "vase", name: "Sunday stem vase", category: "Home", price: 36, stock: 9, tag: "Small batch", color: "Chalk", image_url: "https://images.unsplash.com/photo-1578500494198-246f612d3b3d?auto=format&fit=crop&w=900&q=85", description: "A softly sculptural ceramic vase that makes a single stem feel like a considered arrangement." },
  { id: "notebook", name: "The daily notebook", category: "Desk", price: 18, stock: 32, tag: "Made to use", color: "Moss", image_url: "https://images.unsplash.com/photo-1531346878377-a5be20888e57?auto=format&fit=crop&w=900&q=85", description: "A cloth-bound notebook with 160 uncoated pages for lists, loose thoughts, and plans worth keeping." },
  { id: "bowl", name: "Everyday serving bowl", category: "Home", price: 48, stock: 7, tag: "Small batch", color: "Terracotta", image_url: "https://images.unsplash.com/photo-1603199506016-b9a594b593c0?auto=format&fit=crop&w=900&q=85", description: "A generously sized, wheel-thrown stoneware bowl for shared meals and the very good peaches on the counter." },
  { id: "bottle", name: "Still water bottle", category: "Everyday", price: 32, stock: 22, tag: "Take it along", color: "Forest", image_url: "https://images.unsplash.com/photo-1602143407151-7111542de6e8?auto=format&fit=crop&w=900&q=85", description: "A double-wall stainless bottle that keeps drinks cool and slips into a tote without a second thought." },
  { id: "tray", name: "Catchall, in oak", category: "Desk", price: 34, stock: 11, tag: "Good wood", color: "Natural oak", image_url: "https://images.unsplash.com/photo-1618221195710-dd6b41faaea6?auto=format&fit=crop&w=900&q=85", description: "A small solid-oak tray for the things that deserve a place: keys, rings, and the day's loose ends." },
  { id: "candle", name: "Late afternoon candle", category: "Home", price: 26, stock: 16, tag: "A slower hour", color: "Cedar + fig", image_url: "https://images.unsplash.com/photo-1603006905003-be475563bc59?auto=format&fit=crop&w=900&q=85", description: "A clean-burning soy candle with notes of cedar, fig, and open windows. Poured by hand in a reusable glass vessel." }
];

const money = (amount) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(amount));
const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
const $ = (selector) => document.querySelector(selector);
const productGrid = $("#product-grid");
const state = {
  products: fallbackProducts,
  category: "All",
  search: "",
  sort: "featured",
  cart: readStorage("morrow-cart", []),
  token: localStorage.getItem("morrow-token"),
  user: readStorage("morrow-user", null),
  toastTimer: null
};

function readStorage(key, fallback) {
  try {
    const value = JSON.parse(localStorage.getItem(key));
    return value ?? fallback;
  } catch {
    return fallback;
  }
}

async function api(path, options = {}) {
  const headers = { "Content-Type": "application/json", ...options.headers };
  if (state.token) headers.Authorization = `Bearer ${state.token}`;
  const response = await fetch(path, { ...options, headers });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || "Something went wrong. Please try again.");
  return payload;
}

function persistCart() {
  localStorage.setItem("morrow-cart", JSON.stringify(state.cart));
  renderCart();
}

function filteredProducts() {
  const needle = state.search.trim().toLowerCase();
  const results = state.products.filter((product) => {
    const matchesCategory = state.category === "All" || product.category === state.category;
    const matchesSearch = !needle || `${product.name} ${product.description} ${product.category} ${product.color || ""}`.toLowerCase().includes(needle);
    return matchesCategory && matchesSearch;
  });
  if (state.sort === "price-asc") results.sort((a, b) => Number(a.price) - Number(b.price));
  if (state.sort === "price-desc") results.sort((a, b) => Number(b.price) - Number(a.price));
  if (state.sort === "name") results.sort((a, b) => a.name.localeCompare(b.name));
  return results;
}

function renderProducts() {
  const products = filteredProducts();
  $("#results-line").textContent = `${String(products.length).padStart(2, "0")} pieces · Selected with a little thought`;
  $("#empty-state").hidden = products.length > 0;
  productGrid.innerHTML = products.map((product, index) => `
    <article class="product-card" style="animation-delay:${Math.min(index * 55, 220)}ms">
      <div class="product-image-wrap">
        <img class="product-image" src="${escapeHtml(product.image_url)}" alt="${escapeHtml(product.name)} in ${escapeHtml(product.color || product.category)}" data-product="${escapeHtml(product.id)}" loading="lazy">
        <span class="product-tag">${escapeHtml(product.tag || product.category)}</span>
        <button class="quick-add" type="button" data-add="${escapeHtml(product.id)}">Add to bag · ${money(product.price)}</button>
      </div>
      <div class="product-info"><h3 class="product-name">${escapeHtml(product.name)}</h3><p class="product-price">${money(product.price)}</p></div>
      <p class="product-meta">${escapeHtml(product.color || product.category)} · ${Number(product.stock) > 0 ? "In stock" : "Sold out"}</p>
    </article>`).join("");
}

async function loadProducts() {
  const query = new URLSearchParams();
  if (state.search) query.set("search", state.search);
  if (state.category !== "All") query.set("category", state.category);
  try {
    const products = await api(`/api/products${query.size ? `?${query}` : ""}`);
    if (Array.isArray(products) && products.length) state.products = products;
    else if (!state.search && state.category === "All") state.products = fallbackProducts;
  } catch {
    state.products = fallbackProducts;
  }
  renderProducts();
}

function showToast(message) {
  const toast = $("#toast");
  toast.textContent = message;
  toast.classList.add("is-visible");
  clearTimeout(state.toastTimer);
  state.toastTimer = setTimeout(() => toast.classList.remove("is-visible"), 2500);
}

function addToCart(productId) {
  const product = state.products.find((item) => String(item.id) === String(productId)) || fallbackProducts.find((item) => String(item.id) === String(productId));
  if (!product || Number(product.stock) < 1) return showToast("This piece is currently sold out.");
  const existing = state.cart.find((item) => String(item.product.id) === String(productId));
  if (existing) existing.quantity = Math.min(existing.quantity + 1, Number(product.stock));
  else state.cart.push({ product, quantity: 1 });
  persistCart();
  showToast(`${product.name} added to your bag`);
}

function cartCount() {
  return state.cart.reduce((total, item) => total + item.quantity, 0);
}

function renderCart() {
  const count = cartCount();
  $("#bag-count").textContent = count;
  $("#drawer-count").textContent = `(${count})`;
  $("#cart-empty").hidden = count > 0;
  $("#cart-footer").hidden = count === 0;
  $("#cart-items").hidden = count === 0;
  $("#cart-items").innerHTML = state.cart.map(({ product, quantity }) => `
    <article class="cart-row">
      <img src="${escapeHtml(product.image_url)}" alt="${escapeHtml(product.name)}">
      <div><h3>${escapeHtml(product.name)}</h3><p>${escapeHtml(product.color || product.category || "Morrow Supply")}</p>
        <div class="quantity-control" aria-label="Quantity for ${escapeHtml(product.name)}">
          <button type="button" data-quantity="${escapeHtml(product.id)}" data-change="-1" aria-label="Decrease quantity">−</button><span>${quantity}</span><button type="button" data-quantity="${escapeHtml(product.id)}" data-change="1" aria-label="Increase quantity">+</button>
        </div><button type="button" class="remove-link" data-remove="${escapeHtml(product.id)}">Remove</button>
      </div><span class="cart-row-price">${money(Number(product.price) * quantity)}</span>
    </article>`).join("");
  const subtotal = state.cart.reduce((total, item) => total + Number(item.product.price) * item.quantity, 0);
  $("#cart-subtotal").textContent = money(subtotal);
}

function setCartQuantity(productId, change) {
  const item = state.cart.find((entry) => String(entry.product.id) === String(productId));
  if (!item) return;
  item.quantity += Number(change);
  if (item.quantity < 1) state.cart = state.cart.filter((entry) => String(entry.product.id) !== String(productId));
  else item.quantity = Math.min(item.quantity, Number(item.product.stock || 99));
  persistCart();
}

function openCart() {
  $("#drawer-backdrop").hidden = false;
  $("#cart-drawer").hidden = false;
  document.body.style.overflow = "hidden";
  $("[data-close-drawer]")?.focus();
}

function closeCart() {
  $("#drawer-backdrop").hidden = true;
  $("#cart-drawer").hidden = true;
  document.body.style.overflow = "";
}

function openProduct(productId) {
  const product = state.products.find((item) => String(item.id) === String(productId)) || fallbackProducts.find((item) => String(item.id) === String(productId));
  if (!product) return;
  const dialog = $("#product-dialog");
  dialog.innerHTML = `<article class="product-detail"><img src="${escapeHtml(product.image_url)}" alt="${escapeHtml(product.name)}"><div class="product-detail-copy"><button class="close-button" type="button" data-close-product aria-label="Close details">×</button><p class="eyebrow">${escapeHtml(product.category)} · ${escapeHtml(product.color || "Thoughtfully made")}</p><h2>${escapeHtml(product.name)}</h2><p class="detail-price">${money(product.price)}</p><p class="detail-description">${escapeHtml(product.description || "Made with care, chosen to be useful, and ready to become part of your everyday.")}</p><p class="detail-stock">${Number(product.stock) > 0 ? `${product.stock} available` : "Currently sold out"}</p><button class="button button-dark" type="button" data-detail-add="${escapeHtml(product.id)}" ${Number(product.stock) < 1 ? "disabled" : ""}>Add to bag <span>${money(product.price)}</span></button></div></article>`;
  dialog.showModal();
}

function renderAccount(error = "", mode = "login") {
  const dialog = $("#account-dialog");
  if (state.user) {
    dialog.innerHTML = `<section class="form-panel"><button class="close-button" type="button" data-close-account aria-label="Close account">×</button><p class="eyebrow">Your Morrow account</p><h2>Hello, ${escapeHtml(state.user.name.split(" ")[0])}.</h2><p class="form-intro">Your account is ready. See what you have ordered or sign out on this device.</p><button class="button button-dark" type="button" data-show-orders>View your orders <span>↗</span></button><p class="form-switch"><button type="button" data-sign-out>Sign out</button></p></section>`;
  } else {
    const registering = mode === "register";
    dialog.innerHTML = `<form class="form-panel" id="account-form" data-mode="${registering ? "register" : "login"}"><button class="close-button" type="button" data-close-account aria-label="Close account">×</button><p class="eyebrow">${registering ? "A place of your own" : "Welcome back"}</p><h2 id="account-title">${registering ? "Join the everyday." : "Come on in."}</h2><p class="form-intro">${registering ? "Make an account to keep your orders in one place." : "Sign in to check out and see your order history."}</p>${registering ? `<label class="form-field">Your name<input name="name" autocomplete="name" required minlength="2"></label>` : ""}<label class="form-field">Email address<input name="email" type="email" autocomplete="email" required></label><label class="form-field">Password<input name="password" type="password" autocomplete="${registering ? "new-password" : "current-password"}" minlength="8" required></label><p class="form-error" aria-live="polite">${escapeHtml(error)}</p><button class="button button-dark" type="submit">${registering ? "Create account" : "Sign in"}<span>↗</span></button><p class="form-switch">${registering ? "Already have an account?" : "New around here?"} <button type="button" data-switch-mode="${registering ? "login" : "register"}">${registering ? "Sign in" : "Create an account"}</button></p></form>`;
  }
  if (!dialog.open) dialog.showModal();
}

function renderCheckout() {
  const dialog = $("#checkout-dialog");
  const subtotal = state.cart.reduce((total, item) => total + Number(item.product.price) * item.quantity, 0);
  const rows = state.cart.map(({ product, quantity }) => `<div class="order-entry"><span>${quantity} × ${escapeHtml(product.name)}</span><strong>${money(Number(product.price) * quantity)}</strong></div>`).join("");
  dialog.innerHTML = `<section class="form-panel"><button class="close-button" type="button" data-close-checkout aria-label="Close checkout">×</button><p class="eyebrow">A final look</p><h2 id="checkout-title">Ready when you are.</h2><p class="form-intro">Your order will be placed under ${escapeHtml(state.user?.email || "your account")}. No payment is collected in this demo.</p><div class="order-list">${rows}</div><div class="order-entry"><strong>Order total</strong><strong>${money(subtotal)}</strong></div><p class="form-error" id="checkout-error" aria-live="polite"></p><button class="button button-dark" id="place-order" type="button">Place your order <span>↗</span></button></section>`;
  dialog.showModal();
}

async function showOrders() {
  const dialog = $("#orders-dialog");
  dialog.innerHTML = `<section class="form-panel"><button class="close-button" type="button" data-close-orders aria-label="Close orders">×</button><p class="eyebrow">The things you've chosen</p><h2 id="orders-title">Your orders.</h2><p class="form-intro">Gathering your order history…</p></section>`;
  $("#account-dialog").close();
  dialog.showModal();
  try {
    const orders = await api("/api/orders");
    const entries = orders.map((order) => `<div class="order-entry"><div><strong>Order #${escapeHtml(order.id)}</strong><br><span>${new Date(order.created_at).toLocaleDateString()} · ${escapeHtml(order.status)}</span><br><span>${Number(order.item_count || 0)} pieces</span></div><strong>${money(order.total)}</strong></div>`).join("");
    dialog.querySelector(".form-intro").textContent = orders.length ? "A little history, all in one place." : "Nothing here just yet. Your next good thing is waiting.";
    dialog.querySelector(".order-list")?.remove();
    dialog.querySelector(".form-panel").insertAdjacentHTML("beforeend", `<div class="order-list">${entries || ""}</div>`);
  } catch (error) {
    dialog.querySelector(".form-intro").textContent = error.message;
  }
}

function setUser(user, token) {
  state.user = user;
  state.token = token;
  localStorage.setItem("morrow-user", JSON.stringify(user));
  localStorage.setItem("morrow-token", token);
  $("#account-button").textContent = "My account";
}

productGrid.addEventListener("click", (event) => {
  const addButton = event.target.closest("[data-add]");
  const image = event.target.closest("[data-product]");
  if (addButton) addToCart(addButton.dataset.add);
  else if (image) openProduct(image.dataset.product);
});

document.addEventListener("click", async (event) => {
  const target = event.target.closest("button, a");
  if (!target) return;
  if (target.matches("#open-cart")) openCart();
  if (target.matches("[data-close-drawer]")) closeCart();
  if (target.matches("[data-quantity]")) setCartQuantity(target.dataset.quantity, target.dataset.change);
  if (target.matches("[data-remove]")) {
    state.cart = state.cart.filter((item) => String(item.product.id) !== String(target.dataset.remove));
    persistCart();
  }
  if (target.matches("[data-category], [data-nav-category]")) {
    state.category = target.dataset.category || target.dataset.navCategory;
    document.querySelectorAll("[data-category]").forEach((button) => button.classList.toggle("is-active", button.dataset.category === state.category));
    loadProducts();
  }
  if (target.matches("[data-close-product]")) $("#product-dialog").close();
  if (target.matches("[data-detail-add]")) {
    addToCart(target.dataset.detailAdd);
    $("#product-dialog").close();
  }
  if (target.matches("#account-button")) state.user ? renderAccount() : renderAccount();
  if (target.matches("[data-close-account]")) $("#account-dialog").close();
  if (target.matches("[data-switch-mode]")) renderAccount("", target.dataset.switchMode);
  if (target.matches("[data-show-orders]")) showOrders();
  if (target.matches("[data-sign-out]")) {
    state.user = null;
    state.token = null;
    localStorage.removeItem("morrow-user");
    localStorage.removeItem("morrow-token");
    $("#account-button").textContent = "Sign in";
    $("#account-dialog").close();
    showToast("You have signed out.");
  }
  if (target.matches("#checkout-button")) {
    closeCart();
    if (!state.cart.length) return;
    if (!state.token) renderAccount("Sign in or create an account before placing your order.");
    else renderCheckout();
  }
  if (target.matches("[data-close-checkout]")) $("#checkout-dialog").close();
  if (target.matches("[data-close-orders]")) $("#orders-dialog").close();
  if (target.matches("#place-order")) {
    const button = target;
    button.disabled = true;
    button.textContent = "Placing your order…";
    try {
      const order = await api("/api/orders", {
        method: "POST",
        body: JSON.stringify({ items: state.cart.map(({ product, quantity }) => ({ productId: product.id, quantity })) })
      });
      state.cart = [];
      persistCart();
      $("#checkout-dialog").close();
      showToast(`Order #${order.id} is on its way to the good-things list.`);
    } catch (error) {
      const errorElement = $("#checkout-error");
      if (errorElement) errorElement.textContent = error.message;
      button.disabled = false;
      button.innerHTML = "Place your order <span>↗</span>";
    }
  }
});

document.addEventListener("submit", async (event) => {
  if (event.target.matches("#account-form")) {
    event.preventDefault();
    const form = event.target;
    const formData = new FormData(form);
    const mode = form.dataset.mode;
    const payload = Object.fromEntries(formData.entries());
    const submitButton = form.querySelector("[type=submit]");
    submitButton.disabled = true;
    submitButton.textContent = mode === "register" ? "Making your account…" : "Signing you in…";
    try {
      const result = await api(`/api/auth/${mode}`, { method: "POST", body: JSON.stringify(payload) });
      setUser(result.user, result.token);
      $("#account-dialog").close();
      showToast(`Good to have you, ${result.user.name.split(" ")[0]}.`);
      if (state.cart.length) renderCheckout();
    } catch (error) {
      renderAccount(error.message, mode);
      const email = $("#account-dialog [name=email]");
      if (email) email.value = payload.email;
    }
  }
  if (event.target.matches("#newsletter-form")) {
    event.preventDefault();
    $("#newsletter-message").textContent = "You're on the list. Talk soon.";
    event.target.reset();
  }
});

$("#search-input").addEventListener("input", (event) => {
  state.search = event.target.value;
  renderProducts();
});
$("#sort-select").addEventListener("change", (event) => {
  state.sort = event.target.value;
  renderProducts();
});
$("#drawer-backdrop").addEventListener("click", closeCart);
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closeCart();
});

if (state.user && state.token) $("#account-button").textContent = "My account";
renderCart();
loadProducts();