// ======================= js/app.js =======================
const App = (() => {
  const MONEY = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP' });
  const $  = sel => document.querySelector(sel);
  const $$ = sel => Array.from(document.querySelectorAll(sel));

  const db   = firebase.firestore();
  const auth = firebase.auth();

  const LS = {
    get(key, fb){ try{ return JSON.parse(localStorage.getItem(key)) ?? fb }catch{ return fb } },
    set(key, value){ localStorage.setItem(key, JSON.stringify(value)) }
  };

  // ---------- Estado ----------
  let PRODUCTS = [];
  let cart = LS.get('ec_cart_v1', []);
  let sessionUser = null;

  // Filtros de catálogo
  const CAT_FILTERS = { q: '', cat: '__all__' };

  // ---------- OBSERVADOR DE AUTENTICACIÓN (base) ----------
  auth.onAuthStateChanged(user => {
    const btn = $('#btn-login-toggle');

    if (user) {
      sessionUser = { email: user.email, uid: user.uid };
      if (btn) btn.textContent = 'Logout';
    } else {
      sessionUser = null;
      if (btn){ btn.textContent = 'Login'; btn.setAttribute('href', 'login.html'); }
    }

    // Banners en pantallas que lo usen
    const needLoginCheckout = $('#checkout-need-login');
    if (needLoginCheckout) needLoginCheckout.classList.toggle('hidden', !!sessionUser);

    const needLoginOrders = $('#orders-need-login');
    if (needLoginOrders) needLoginOrders.classList.toggle('hidden', !!sessionUser);
  });

  // ---------- Utils ----------
  const debounce = (fn, ms=300) => { let t; return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a), ms);} };

  function updateCartBadge(){
    const count = cart.reduce((s, x) => s + x.qty, 0);
    const el = $('#nav-cart');
    if (el) el.setAttribute('data-badge', String(count));
  }

  function initBase(){
    updateCartBadge();
    const btn = $('#btn-login-toggle');
    if (btn) {
      btn.addEventListener('click', (e) => {
        // Si está logueado y el botón apunta a login, interpretamos como "Logout"
        if (sessionUser && (btn.getAttribute('href') || '').endsWith('login.html')) {
          e.preventDefault();
          if (confirm('¿Cerrar sesión?')) {
            auth.signOut().then(() => { window.location.href = 'login.html'; });
          }
        }
      });
    }
  }

  // ==================== CATÁLOGO ====================

function getCategory(p){
  return p.categoria || p.category || p.tipo || p.rubro || 'Sin categoría';
}

// Selector robusto de imagen
function pickImage(p){
  var url = '';

  if (p && typeof p === 'object') {
    // 1) campos comunes
    var candidates = [];
    if (typeof p.img === 'string'    && p.img.trim())    candidates.push(p.img.trim());
    if (typeof p.image === 'string'  && p.image.trim())  candidates.push(p.image.trim());
    if (typeof p.imagen === 'string' && p.imagen.trim()) candidates.push(p.imagen.trim());
    if (typeof p.foto === 'string'   && p.foto.trim())   candidates.push(p.foto.trim());
    if (Array.isArray(p.images) && p.images.length && String(p.images[0]).trim()) {
      candidates.push(String(p.images[0]).trim());
    }
    if (candidates.length) url = candidates[0];

    // 2) forzar https si venía http
    if (url && url.indexOf('http://') === 0) url = 'https://' + url.slice(7);

    // 3) fallback a archivo local por SKU o ID
    if (!url) {
      var name = String(p.sku || p.id || '');
      if (name) url = 'assets/products/' + name + '.jpg'; // sin "/" inicial
    }
  }

  // 4) último recurso: placeholder
  if (!url) {
    var txt = encodeURIComponent((p && p.nombre) ? p.nombre : 'Producto');
    url = 'https://via.placeholder.com/400x300.png?text=' + txt;
  }
  return url;
}

function cardHTML(p){
  var imgURL = pickImage(p);
  var ph = 'https://via.placeholder.com/400x300.png?text=' + encodeURIComponent(p && p.nombre ? p.nombre : 'Producto');

  return (
    '<article class="product">' +
      '<img src="' + imgURL + '" alt="' + (p.nombre || 'Producto') + '"' +
           ' onerror="this.onerror=null;this.src=\'' + ph + '\';" />' +
      '<div style="display:flex; justify-content:space-between; align-items:center; gap:8px;">' +
        '<div>' +
          '<div style="font-weight:800">' + (p.nombre || '') + '</div>' +
          '<div class="price">' + MONEY.format(Number(p.precio) || 0) + '</div>' +
        '</div>' +
        '<button class="btn" data-add="' + p.id + '">Agregar</button>' +
      '</div>' +
    '</article>'
  );
}


  function paintFlat(list){
    const grid = $('#catalog');
    const grouped = $('#catalog-grouped');
    if (!grid || !grouped) return;
    grouped.innerHTML = '';
    grouped.style.display = 'none';
    grid.innerHTML = list.map(cardHTML).join('');
    grid.style.display = 'grid';
    $$('button[data-add]').forEach(b => b.addEventListener('click', () => addToCart(b.getAttribute('data-add'))));
  }

  function paintGrouped(list){
    const grid = $('#catalog');
    const grouped = $('#catalog-grouped');
    if (!grid || !grouped) return;
    grid.innerHTML = '';
    grid.style.display = 'none';

    const groups = list.reduce((acc,p)=>{ (acc[getCategory(p)] ||= []).push(p); return acc; }, {});
    const frag = document.createDocumentFragment();

    Object.keys(groups).sort((a,b)=>a.localeCompare(b,'es')).forEach(cat=>{
      const sec = document.createElement('div');
      sec.className = 'cat-section';
      sec.innerHTML = `<h3>${cat}</h3><div class="catalog-grid">${groups[cat].map(cardHTML).join('')}</div>`;
      frag.appendChild(sec);
    });

    grouped.innerHTML = '';
    grouped.appendChild(frag);
    grouped.style.display = 'block';
    $$('button[data-add]').forEach(b => b.addEventListener('click', () => addToCart(b.getAttribute('data-add'))));
  }

  function applyFilters(){
    let list = PRODUCTS.slice();
    const q = CAT_FILTERS.q.trim().toLowerCase();
    if (q){
      list = list.filter(p=>{
        const hay = [p.nombre,p.descripcion,p.sku,p.marca,p.model].filter(Boolean).join(' ').toLowerCase();
        return hay.includes(q);
      });
    }
    if (CAT_FILTERS.cat && CAT_FILTERS.cat !== '__all__'){
      list = list.filter(p => getCategory(p) === CAT_FILTERS.cat);
    }
    $('#cat-count')?.replaceChildren(document.createTextNode(`${list.length} producto${list.length!==1?'s':''}`));
    if (!q && (CAT_FILTERS.cat === '__all__')) paintGrouped(list);
    else paintFlat(list);
  }

  function fillCategorySelect(){
    const sel = $('#cat-category');
    if (!sel) return;
    const cats = Array.from(new Set(PRODUCTS.map(getCategory))).sort((a,b)=>a.localeCompare(b,'es'));
    sel.innerHTML = `<option value="__all__">Todas las categorías</option>` + cats.map(c=>`<option value="${c}">${c}</option>`).join('');
  }

  async function renderCatalog(){
    const grid = $('#catalog');
    const grouped = $('#catalog-grouped');
    const count = $('#cat-count');
    if (count) count.textContent = '0 productos';
    if (!grid || !grouped) return;

    grid.innerHTML = '<p>Cargando productos...</p>';
    grouped.innerHTML = '';

    try {
      const snapshot = await db.collection('productos').get();
      PRODUCTS = [];
      snapshot.forEach(doc => {
        const p = { id: doc.id, ...doc.data() };
        p.precio = Number(p.precio) || 0;
        PRODUCTS.push(p);
      });
      fillCategorySelect();
      applyFilters();
    } catch (err) {
      console.error("[Catalog] Error:", err);
      grid.innerHTML = '<p>Error al cargar productos. Intenta de nuevo.</p>';
      grouped.innerHTML = '';
    }
  }

  function bindCatalogFilters(){
    const q = $('#cat-search');
    const sel = $('#cat-category');
    if (q){
      q.addEventListener('input', debounce(()=>{
        CAT_FILTERS.q = q.value || '';
        applyFilters();
      }, 250));
    }
    if (sel){
      sel.addEventListener('change', ()=>{
        CAT_FILTERS.cat = sel.value || '__all__';
        applyFilters();
      });
    }
  }

  function addToCart(id){
    const p = PRODUCTS.find(x => x.id === id);
    if (!p) return;

    const found = cart.find(x => x.id === id);
    if (found) found.qty += 1;
    else cart.push({ id: p.id, nombre: p.nombre, precio: Number(p.precio) || 0, qty: 1 });

    LS.set('ec_cart_v1', cart);
    updateCartBadge();
    alert('Producto agregado');
  }

  // ==================== CARRITO ====================
  function renderCart(){
    const empty  = $('#cart-empty');
    const wrap   = $('#cart-wrap');
    const body   = $('#cart-body');
    const totalEl= $('#cart-total');
    if (!body || !totalEl) return;

    if (cart.length === 0){
      if (empty) empty.classList.remove('hidden');
      if (wrap)  wrap.classList.add('hidden');
      updateCartBadge();
      return;
    }
    if (empty) empty.classList.add('hidden');
    if (wrap)  wrap.classList.remove('hidden');

    body.innerHTML = '';
    let total = 0;

    cart.forEach(item => {
      const subtotal = (Number(item.precio) || 0) * item.qty;
      total += subtotal;

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${item.nombre}</td>
        <td class="right">${MONEY.format(Number(item.precio) || 0)}</td>
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
    if (bc) bc.onclick = clearCart;

    updateCartBadge();
  }

  function changeQty(id, delta){
    const it = cart.find(x => x.id === id);
    if (!it) return;
    it.qty = Math.max(1, it.qty + delta);
    LS.set('ec_cart_v1', cart);
    renderCart();
  }

  function setQty(id, newQty){
    let q = parseInt(newQty, 10);
    if (isNaN(q) || q < 1) q = 1;
    const it = cart.find(x => x.id === id);
    if (!it) return;
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
    if (confirm('¿Vaciar carrito?')){
      cart = [];
      LS.set('ec_cart_v1', cart);
      renderCart();
    }
  }

  // ==================== CHECKOUT ====================
  function renderCheckout(){
    const sEmpty   = $('#summary-empty');
    const sWrap    = $('#summary-wrap');
    const sBody    = $('#summary-body');
    const sTotal   = $('#summary-total');
    const needLogin= $('#checkout-need-login');
    const form     = $('#form-checkout');
    const msg      = $('#checkout-msg');

    if (!sBody || !sTotal) return;
    if (msg) msg.classList.add('hidden');

    if (cart.length === 0){
      if (sEmpty) sEmpty.classList.remove('hidden');
      if (sWrap)  sWrap.classList.add('hidden');
      if (form)   form.querySelector('button[type="submit"]').disabled = true;
    } else {
      if (sEmpty) sEmpty.classList.add('hidden');
      if (sWrap)  sWrap.classList.remove('hidden');
      if (form)   form.querySelector('button[type="submit"]').disabled = false;
    }

    sBody.innerHTML = '';
    let total = 0;

    cart.forEach(item => {
      const subtotal = (Number(item.precio) || 0) * item.qty;
      total += subtotal;
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${item.nombre}</td>
        <td class="right">${item.qty}</td>
        <td class="right">${MONEY.format(subtotal)}</td>
      `;
      sBody.appendChild(tr);
    });

    sTotal.textContent = MONEY.format(total);
    if (needLogin) needLogin.classList.toggle('hidden', !!sessionUser);
  }

  function bindCheckout(){
    const form = $('#form-checkout');
    if (!form) return;

    form.addEventListener('submit', async (e) => {
      e.preventDefault();

      if (!sessionUser) { alert('Necesitas iniciar sesión para completar el pago.'); return; }
      if (cart.length === 0) { alert('Tu carrito está vacío.'); return; }

      const name = $('#co-name')?.value.trim();
      const addr = $('#co-address')?.value.trim();
      const city = $('#co-city')?.value.trim();
      const pay  = $('#co-pay')?.value;

      if (!name || !addr || !city || !pay) { alert('Completa todos los campos del formulario.'); return; }

      try {
        form.querySelector('button[type="submit"]').disabled = true;
        const total = cart.reduce((s, item) => s + ((Number(item.precio) || 0) * item.qty), 0);

        const orden = {
          usuarioId: sessionUser.uid,
          fechaOrden: firebase.firestore.FieldValue.serverTimestamp(),
          estado: "Pendiente",
          entregado: false,
          items: cart,
          total: total,
          envio: {
            direccion: addr,
            ciudad: city,
            nombreCompleto: name,
            transportadora: null,
            fechaEntrega: null
          },
          pago: {
            metodo: pay,
            referencia: null,
            txn: null
          }
        };

        await db.collection('ordenes').add(orden);

        const msg = $('#checkout-msg');
        if (msg) msg.classList.remove('hidden');

        cart = [];
        LS.set('ec_cart_v1', cart);
        updateCartBadge();
        renderCheckout();

      } catch (err) {
        console.error("[Checkout] Error:", err);
        alert("Hubo un error al procesar tu pedido. Intenta de nuevo.");
        form.querySelector('button[type="submit"]').disabled = false;
      }
    });
  }

  // ==================== LOGIN ====================
  function bindLogin(){
    const btn = $('#btn-login');
    if (!btn) return;

    btn.addEventListener('click', async (e) => {
      e.preventDefault();

      const email  = $('#login-email')?.value.trim();
      const pass   = $('#login-pass')?.value.trim();
      const status = $('#login-status');

      if (!email || !pass) {
        if (status) { status.className = 'msg bad'; status.textContent = 'Completa email y contraseña.'; }
        return;
      }

      try {
        if (status) { status.className = 'msg'; status.textContent = 'Iniciando...'; }
        const cred = await auth.signInWithEmailAndPassword(email, pass);
        if (status) { status.className = 'msg ok'; status.textContent = 'Sesión iniciada: ' + cred.user.email; }
        setTimeout(() => { window.location.href = 'checkout.html'; }, 600);
      } catch (err) {
        console.error("[Login] Error:", err.code, err.message);
        let m = 'Error al iniciar sesión';
        if (err.code === 'auth/user-not-found') m = 'Usuario no encontrado';
        if (err.code === 'auth/wrong-password') m = 'Contraseña incorrecta';
        if (err.code === 'auth/invalid-email')  m = 'Email inválido';
        if (status) { status.className = 'msg bad'; status.textContent = `${m}. (${err.code})`; }
      }
    });
  }

  // ==================== REGISTRO ====================
  function bindRegister(){
    const btn = $('#btn-register');
    if (!btn) return;

    btn.addEventListener('click', async (e) => {
      e.preventDefault();

      const name   = $('#reg-name')?.value.trim();
      const email  = $('#reg-email')?.value.trim();
      const phone  = $('#reg-phone')?.value.trim();        // obligatorio
      const pass   = $('#reg-pass')?.value.trim();
      const city   = $('#reg-city') ? $('#reg-city').value : '';
      const depto  = $('#reg-depto') ? $('#reg-depto').value : '';
      const pais   = $('#reg-pais') ? $('#reg-pais').value : 'Colombia';
      const status = $('#reg-status');

      if (!name){  if (status){ status.className='msg bad'; status.textContent='Escribe tu nombre.'; } return; }
      if (!email){ if (status){ status.className='msg bad'; status.textContent='Escribe tu email.'; } return; }
      if (!phone){ if (status){ status.className='msg bad'; status.textContent='Escribe tu teléfono.'; } return; }
      if (!pass || pass.length < 6){
        if (status){ status.className='msg bad'; status.textContent='La contraseña debe tener al menos 6 caracteres.'; }
        return;
      }
      if (!depto || !city || !pais){
        if (status){ status.className='msg bad'; status.textContent='Completa país, departamento y ciudad.'; }
        return;
      }

      try {
        if (status){ status.className='msg'; status.textContent='Creando cuenta...'; }

        const cred = await auth.createUserWithEmailAndPassword(email, pass);
        const uid  = cred.user.uid;

        await db.collection('usuarios').doc(uid).set({
          Nombre: name,
          Email: email,
          Telefono: phone,
          fechaRegistro: firebase.firestore.FieldValue.serverTimestamp(),
          marketingOptIn: false,
          Direccion: { ciudad: city, departamento: depto, pais: pais },
          credencial: "password"
        });

        if (status){ status.className='msg ok'; status.textContent='¡Cuenta creada! Redirigiendo...'; }
        setTimeout(() => { window.location.href = 'index.html'; }, 1000);

      } catch (err) {
        console.error("[Register] Error:", err.code, err.message);
        let m = 'Error al crear la cuenta';
        if (err.code === 'auth/email-already-in-use') m = 'Ese email ya está registrado';
        if (err.code === 'auth/invalid-email')      m = 'Email inválido';
        if (err.code === 'auth/weak-password')      m = 'Contraseña muy débil';
        if (err.code === 'permission-denied')       m = 'Permiso denegado por reglas de Firestore';
        if (status){ status.className='msg bad'; status.textContent = `${m}. (${err.code})`; }
      }
    });
  }

  // ==================== MIS PEDIDOS (versión que tenías) ====================
  function bindOrders(){
    const body   = $('#orders-body');
    const wrap   = $('#orders-wrap');
    const empty  = $('#orders-empty');
    const needLg = $('#orders-need-login');

    if (!body || !wrap || !empty) return;

    // Estado inicial
    body.innerHTML = '';
    empty.classList.add('hidden');
    wrap.classList.add('hidden');
    if (needLg) needLg.classList.add('hidden');

    const renderRows = (docs) => {
      body.innerHTML = '';
      if (!docs || docs.length === 0) {
        empty.classList.remove('hidden');
        wrap.classList.add('hidden');
        return;
      }
      empty.classList.add('hidden');
      wrap.classList.remove('hidden');

      docs.forEach(d => {
        const o = d.data ? d.data() : d; // por si viene de fallback
        const ts = o.fechaOrden && o.fechaOrden.toDate ? o.fechaOrden.toDate() :
                   (o.fechaOrden && o.fechaOrden.seconds ? new Date(o.fechaOrden.seconds*1000) : new Date());
        const fecha = ts.toLocaleString('es-CO', { dateStyle:'medium', timeStyle:'short' });
        const total = MONEY.format(Number(o.total) || 0);
        const items = Array.isArray(o.items) ? o.items.reduce((s,i)=>s + (i.qty||0), 0) : 0;

        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td>${fecha}</td>
          <td>${o.estado ?? '—'}</td>
          <td>${total}</td>
          <td>${items}</td>
        `;
        body.appendChild(tr);
      });
    };

    const showError = (msg='Error al cargar pedidos. Intenta de nuevo.')=>{
      empty.textContent = msg;
      empty.classList.remove('hidden');
      wrap.classList.add('hidden');
    };

    // Reacciona a la sesión
    auth.onAuthStateChanged(async (user) => {
      if (!user) {
        if (needLg) needLg.classList.remove('hidden');
        empty.classList.add('hidden'); // no mostrar "aún no tienes" si no está logueado
        wrap.classList.add('hidden');
        return;
      }
      if (needLg) needLg.classList.add('hidden');

      try {
        // intento con orderBy (requiere índice)
        let snap;
        try {
          snap = await db.collection('ordenes')
            .where('usuarioId', '==', user.uid)
            .orderBy('fechaOrden', 'desc')
            .get();
        } catch (err) {
          // si falta índice, hacemos fallback sin orderBy
          if (err && (err.code === 'failed-precondition' || /index/i.test(err.message||''))) {
            console.warn('[Orders] Faltó índice, usando fallback sin orderBy.');
            snap = await db.collection('ordenes')
              .where('usuarioId', '==', user.uid)
              .get();

            const docs = snap.docs
              .map(d => d)
              .sort((a,b) => {
                const ta = a.data().fechaOrden?.seconds || 0;
                const tb = b.data().fechaOrden?.seconds || 0;
                return tb - ta;
              });
            renderRows(docs);
            return;
          }
          throw err;
        }

        renderRows(snap.docs);
      } catch (err) {
        console.error('[Orders] Error:', err);
        showError('Error al cargar pedidos. Intenta de nuevo.');
      }
    });
  }

  // ---------- API pública ----------
  return {
    initBase,
    // Catálogo
    renderCatalog,
    bindCatalogFilters,
    // Carrito
    renderCart,
    // Checkout
    renderCheckout,
    bindCheckout,
    // Auth
    bindLogin,
    bindRegister,
    // Pedidos
    bindOrders
  };
})();
