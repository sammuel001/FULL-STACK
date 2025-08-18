
// Shared App for multi-page version
const App = (() => {
  const MONEY = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP' });
  const $ = sel => document.querySelector(sel);
  const $$ = sel => Array.from(document.querySelectorAll(sel));
  const LS = {
    get(key, fallback){ try{ return JSON.parse(localStorage.getItem(key)) ?? fallback }catch{ return fallback } },
    set(key, value){ localStorage.setItem(key, JSON.stringify(value)) }
  };

  // Products
  const PRODUCTS = [
    { id:'p1', name:'producto 1', price: 69000, img:'https://picsum.photos/seed/tee/400/300' },
    { id:'p2', name:'producto 2', price: 129000, img:'https://picsum.photos/seed/jeans/400/300' },
    { id:'p3', name:'producto 3', price: 199000, img:'https://picsum.photos/seed/sneakers/400/300' },
    { id:'p4', name:'producto 4', price: 49000, img:'https://picsum.photos/seed/cap/400/300' },
    { id:'p5', name:'producto 5', price: 149000, img:'https://picsum.photos/seed/hoodie/400/300' },
    { id:'p6', name:'producto 6', price: 29000, img:'https://picsum.photos/seed/socks/400/300' }
  ];

  let cart = LS.get('ec_cart_v1', []);
  let sessionUser = LS.get('ec_user_v1', null);

  function updateCartBadge(){
    const count = cart.reduce((s, x) => s + x.qty, 0);
    const el = $('#nav-cart');
    if(el) el.setAttribute('data-badge', String(count));
  }

  function initBase(){
    updateCartBadge();
    const btn = $('#btn-login-toggle');
    if(btn){
      if(sessionUser){ btn.textContent = 'Logout'; }
      btn.addEventListener('click', (e) => {
        // if header link was clicked and we're logged in, turn it into logout
        if(sessionUser && (btn.getAttribute('href') || '').endsWith('login.html')){
          e.preventDefault();
          if(confirm('¿Cerrar sesión?')){
            sessionUser = null;
            localStorage.removeItem('ec_user_v1');
            btn.textContent = 'Login';
            window.location.href = 'login.html';
          }
        }
      });
    }
  }

  // ----- Catalog 
  function renderCatalog(){
    const wrap = $('#catalog');
    if(!wrap) return;
    wrap.innerHTML = '';
    PRODUCTS.forEach(p => {
      const card = document.createElement('article');
      card.className = 'product';
      card.innerHTML = `
        <img src="${p.img}" alt="${p.name}"/>
        <div style="display:flex; justify-content:space-between; align-items:center; gap:8px;">
          <div>
            <div style="font-weight:800">${p.name}</div>
            <div class="price">${MONEY.format(p.price)}</div>
          </div>
          <button class="btn" data-add="${p.id}">Agregar</button>
        </div>`;
      wrap.appendChild(card);
    });
    $$('button[data-add]').forEach(b => b.addEventListener('click', () => addToCart(b.getAttribute('data-add'))));
  }
  function addToCart(id){
    const p = PRODUCTS.find(x => x.id === id);
    if(!p) return;
    const found = cart.find(x => x.id === id);
    if(found) found.qty += 1;
    else cart.push({ id: p.id, name: p.name, price: p.price, qty: 1 });
    LS.set('ec_cart_v1', cart);
    updateCartBadge();
    alert('Producto agregado');
  }

  // ----- Cart (Persona 2)
  function renderCart(){
    const empty = $('#cart-empty');
    const wrap = $('#cart-wrap');
    const body = $('#cart-body');
    const totalEl = $('#cart-total');
    if(!body || !totalEl) return;

    if(cart.length === 0){
      if(empty) empty.classList.remove('hidden');
      if(wrap) wrap.classList.add('hidden');
      updateCartBadge();
      return;
    }
    if(empty) empty.classList.add('hidden');
    if(wrap) wrap.classList.remove('hidden');

    body.innerHTML = '';
    let total = 0;
    cart.forEach(item => {
      const subtotal = item.price * item.qty;
      total += subtotal;
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${item.name}</td>
        <td class="right">${MONEY.format(item.price)}</td>
        <td class="right">${MONEY.format(subtotal)}</td>
        <td class="right qty">
          <button class="qtybtn" data-dec="${item.id}">-</button>
          <input type="number" min="1" value="${item.qty}" style="width:56px; text-align:center;" data-qty="${item.id}"/>
          <button class="qtybtn" data-inc="${item.id}">+</button>
        </td>
        <td class="right"><button class="btn light" data-del="${item.id}">Eliminar</button></td>
      `;
      body.appendChild(tr);
    });
    totalEl.textContent = MONEY.format(total);
    $$('button[data-inc]').forEach(b => b.addEventListener('click', () => changeQty(b.getAttribute('data-inc'), +1)));
    $$('button[data-dec]').forEach(b => b.addEventListener('click', () => changeQty(b.getAttribute('data-dec'), -1)));
    $$('input[data-qty]').forEach(i => i.addEventListener('change', () => setQty(i.getAttribute('data-qty'), i.value)));
    $$('button[data-del]').forEach(b => b.addEventListener('click', () => removeItem(b.getAttribute('data-del'))));
    const bc = $('#btn-clear');
    if(bc) bc.onclick = clearCart;
    updateCartBadge();
  }
  function changeQty(id, delta){
    const it = cart.find(x => x.id === id);
    if(!it) return;
    it.qty = Math.max(1, it.qty + delta);
    LS.set('ec_cart_v1', cart);
    renderCart();
  }
  function setQty(id, newQty){
    let q = parseInt(newQty, 10);
    if(isNaN(q) || q < 1) q = 1;
    const it = cart.find(x => x.id === id);
    if(!it) return;
    it.qty = q;
    LS.set('ec_cart_v1', cart);
    renderCart();
  }
  function removeItem(id){
    cart = cart.filter(x => x.id !== id);
    LS.set('ec_cart_v1', cart);
    renderCart();
  }
  function clearCart(){
    if(confirm('¿Vaciar carrito?')){
      cart = [];
      LS.set('ec_cart_v1', cart);
      renderCart();
    }
  }

  // ----- Checkout/Login (Persona 3)
  function renderCheckout(){
    const sEmpty = $('#summary-empty');
    const sWrap = $('#summary-wrap');
    const sBody = $('#summary-body');
    const sTotal = $('#summary-total');
    const needLogin = $('#checkout-need-login');
    const form = $('#form-checkout');
    const msg = $('#checkout-msg');

    if(!sBody || !sTotal) return;
    if(msg) msg.classList.add('hidden');

    if(cart.length === 0){
      if(sEmpty) sEmpty.classList.remove('hidden');
      if(sWrap) sWrap.classList.add('hidden');
      if(form) form.querySelector('button[type="submit"]').disabled = true;
    }else{
      if(sEmpty) sEmpty.classList.add('hidden');
      if(sWrap) sWrap.classList.remove('hidden');
      if(form) form.querySelector('button[type="submit"]').disabled = false;
    }

    sBody.innerHTML = '';
    let total = 0;
    cart.forEach(item => {
      const subtotal = item.price * item.qty;
      total += subtotal;
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${item.name}</td><td class="right">${item.qty}</td><td class="right">${MONEY.format(subtotal)}</td>`;
      sBody.appendChild(tr);
    });
    sTotal.textContent = MONEY.format(total);
    if(needLogin) needLogin.classList.toggle('hidden', !!sessionUser);
  }

  function bindCheckout(){
    const form = $('#form-checkout');
    if(!form) return;
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      if(!sessionUser){
        const warn = $('#checkout-need-login');
        if(warn) warn.classList.remove('hidden');
        window.location.href = 'login.html';
        return;
      }
      if(cart.length === 0){ alert('Tu carrito está vacío.'); return; }
      const name = $('#co-name')?.value.trim();
      const addr = $('#co-address')?.value.trim();
      const city = $('#co-city')?.value.trim();
      const pay  = $('#co-pay')?.value;
      if(!name || !addr || !city || !pay){ alert('Completa todos los campos del checkout.'); return; }
      const msg = $('#checkout-msg');
      if(msg) msg.classList.remove('hidden');
      cart = [];
      LS.set('ec_cart_v1', cart);
      updateCartBadge();
      renderCheckout();
    });
  }

  function bindLogin(){
    const btn = $('#btn-login');
    if(!btn) return;
    btn.addEventListener('click', () => {
      const email = $('#login-email').value.trim();
      const pass = $('#login-pass').value.trim();
      const status = $('#login-status');
      if(!email || !pass){
        if(status){ status.classList.remove('hidden'); status.classList.add('msg','bad'); status.textContent = 'Ingresa email y contraseña.'; }
        return;
      }
      sessionUser = { email };
      LS.set('ec_user_v1', sessionUser);
      if(status){ status.classList.remove('hidden'); status.classList.add('msg','ok'); status.textContent = 'Sesión iniciada: ' + email; }
      const btnToggle = $('#btn-login-toggle');
      if(btnToggle) btnToggle.textContent = 'Logout';
      setTimeout(() => { window.location.href = 'checkout.html'; }, 600);
    });
  }

  return { initBase, renderCatalog, renderCart, renderCheckout, bindCheckout, bindLogin };
})();
