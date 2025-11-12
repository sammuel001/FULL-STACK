const App = (() => {
  const MONEY = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP' });
  const $ = sel => document.querySelector(sel);
  const $$ = sel => Array.from(document.querySelectorAll(sel));

  // Conexión a  Firebase ---------
  // se accede al objeto global 'firebase' inicializado antes en el HTML
  const db = firebase.firestore();
  const auth = firebase.auth();
  // --- Fin de la conexión ---

  
  const LS = {
    get(key, fallback){ try{ return JSON.parse(localStorage.getItem(key)) ?? fallback }catch{ return fallback } },
    set(key, value){ localStorage.setItem(key, JSON.stringify(value)) }
  };

  // Products
  // Vamos a traer los productos desde firestore
  let PRODUCTS = [];

  let cart = LS.get('ec_cart_v1', []);


  let sessionUser = null; // <-- Manejo con Firebase

  // -- OBSERVADOR de Autenticación --
  // Este es el "corazón" de la sesión. Se ejecuta al cargar
  // y cada vez que el usuario inicia o cierra sesión.

  auth.onAuthStateChanged(user => {
    const btn = $('#btn-login-toggle');
    if(user){
      // El usuario si esta registrado
      sessionUser = {email: user.email, uid: user.uid};
      console.log("Usuario logueado:", sessionUser.email);
      if(btn) btn.textContent = 'Logout';

      // Si esta en checkout, se oculta el aviso
      const needLogin = $('#checkout-need-login');
      if(needLogin) needLogin.classList.add('hidden');

    }else {
      // El usuario No está logueado
      sessionUser = null;
      console.log("Usuario no logueado.");
      if(btn){
        btn.textContent = 'Login';
        btn.setAttribute('href', 'login.html');
      }
    }
    // Si estamos en checkout, mostramos el aviso
    const needLogin = $('#checkout-need-login');
    if(needLogin) needLogin.classList.remove('hidden');
  })


  function updateCartBadge(){
    const count = cart.reduce((s, x) => s + x.qty, 0);
    const el = $('#nav-cart');
    if(el) el.setAttribute('data-badge', String(count));
  }


// initBase ahora solo maneja el clic de logout
  function initBase(){
    updateCartBadge();
    const btn = $('#btn-login-toggle');
    if(btn){
      // El observer de arriba ya pone "Login" o "Logout"
      // Solo necesitamos manejar el clic para CERRAR sesión
      btn.addEventListener('click', (e) => {
        // Si el usuario está logueado y el botón parece un link de login...
        if(sessionUser && (btn.getAttribute('href') || '').endsWith('login.html')){
          e.preventDefault(); // Prevenimos ir a login.html
          if(confirm('¿Cerrar sesión?')){
            // ¡NUEVO! Usar Firebase Auth para salir
            auth.signOut().then(() => {
              // El observer se encargará de poner sessionUser = null
              window.location.href = 'login.html'; // Redirigimos a login
            });
          }
        }
      });
    }
  }

// ----- Catalog
  //Ahora lee de Firestore y usa los nombres de campos
  async function renderCatalog(){ // <-- async
    const wrap = $('#catalog');
    if(!wrap) return;
    wrap.innerHTML = '<p>Cargando productos...</p>';

    try {
      // 1. Hacemos la consulta a la colección "productos"
      const snapshot = await db.collection('productos').get();

      // ------
      console.log("¡Conexión a Firestore EXITOSA!");
      console.log("Total de productos encontrados:", snapshot.size);
      // ---------------------
      
      PRODUCTS = []; 
      wrap.innerHTML = ''; 

      // 2. Llenamos el array PRODUCTS y renderizamos
      snapshot.forEach(doc => {
        // Esto mostrará el contenido de CADA producto que trajo
        console.log(doc.id, " => ", doc.data());
        const p = { ...doc.data(), id: doc.id }; // p.nombre, p.precio, p.marca, etc.
        PRODUCTS.push(p); 
        
        const card = document.createElement('article');
        card.className = 'product';
        
        // ¡OJO! La DB no tiene un campo 'img'. 
        // Toca agregar un campo 'img' en Firestore con la URL de la imagen.
        // Mientras tanto, se usa un placeholder.
        const imgURL = p.img || `https://via.placeholder.com/400x300.png?text=${p.nombre}`;

        card.innerHTML = `
          <img src="${imgURL}" alt="${p.nombre}"/>
          <div style="display:flex; justify-content:space-between; align-items:center; gap:8px;">
            <div>
              <div style="font-weight:800">${p.nombre}</div>
              <div class="price">${MONEY.format(p.precio)}</div>
            </div>
            <button class="btn" data-add="${p.id}">Agregar</button>
          </div>`;
        wrap.appendChild(card);
      });

      // 4. Re-adjuntamos los listeners
      $$('button[data-add]').forEach(b => b.addEventListener('click', () => addToCart(b.getAttribute('data-add'))));

    } catch (err) {
// --- SI ALGO FALLA---
      console.error("¡FALLO LA CONEXIÓN O CONSULTA! Error:", err);
      // ---------------------------------
      wrap.innerHTML = '<p>Error al cargar productos. Intenta de nuevo.</p>';
    }
  }


  function addToCart(id){
    const p = PRODUCTS.find(x => x.id === id);
    if(!p) return;
    const found = cart.find(x => x.id === id);
    if(found) found.qty += 1;
    else cart.push({ id: p.id, nombre: p.nombre, precio: p.precio, qty: 1 });
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
      const subtotal = item.precio * item.qty;
      total += subtotal;
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${item.nombre}</td>
        <td class="right">${MONEY.format(item.precio)}</td>
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
      const subtotal = item.precio * item.qty;
      total += subtotal;
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${item.nombre}</td><td class="right">${item.qty}</td><td class="right">${MONEY.format(subtotal)}</td>`;
      sBody.appendChild(tr);
    });
    sTotal.textContent = MONEY.format(total);
    if(needLogin) needLogin.classList.toggle('hidden', !!sessionUser);
  }

// ¡MODIFICADO! bindCheckout ahora guarda en "ordenes" con TU estructura
  function bindCheckout(){
    const form = $('#form-checkout');
    if(!form) return;
    
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      // ... (Validaciones de sessionUser y carrito vacío se quedan igual) ...
      if(!sessionUser){ /* ... */ }
      if(cart.length === 0){ /* ... */ }

      // ... (Obtención de campos del formulario se queda igual) ...
      const name = $('#co-name')?.value.trim();
      const addr = $('#co-address')?.value.trim();
      const city = $('#co-city')?.value.trim();
      const pay = $('#co-pay')?.value;
      if(!name || !addr || !city || !pay){ alert('Completa todos los campos...'); return; }

      // --- ¡NUEVO! Guardar en Firestore con TU estructura ---
      try {
        form.querySelector('button[type="submit"]').disabled = true;
        const total = cart.reduce((s, item) => s + (item.precio * item.qty), 0);

        // 1. Creamos el objeto de la orden IGUAL a tu DB
        const orden = {
          usuarioId: sessionUser.uid, // Coincide con tu campo 'usuarioId'
          fechaOrden: firebase.firestore.FieldValue.serverTimestamp(), // Coincide con 'fechaOrden'
          estado: "Pendiente",  // Un estado inicial, ya que 'entregado' es false
          entregado: false,
          items: cart,          // Guardamos el array del carrito
          total: total,         // Guardamos el total
          
          // Objeto 'envio' como en tu DB
          envio: {
            direccion: addr,
            ciudad: city,
            nombreCompleto: name,
            transportadora: null, // Aún no asignada
            fechaEntrega: null
          },
          
          // Objeto 'pago' como en tu DB
          pago: {
            metodo: pay, // El valor de tu formulario (ej. "PSE", "TC")
            referencia: null, // Esto vendría de una pasarela de pagos real
            txn: null         // Esto vendría de una pasarela de pagos real
          }
        };

        // 2. Guardamos en TU colección "ordenes"
        await db.collection('ordenes').add(orden);

        // 3. ¡Éxito! Limpiamos todo (tu código de antes)
        const msg = $('#checkout-msg');
        if(msg) msg.classList.remove('hidden');
        cart = [];
        LS.set('ec_cart_v1', cart);
        updateCartBadge();
        renderCheckout();

      } catch (err) {
        console.error("Error al guardar la orden: ", err);
        alert("Hubo un error al procesar tu pago. Intenta de nuevo.");
        form.querySelector('button[type="submit"]').disabled = false;
      }
    });
  }

// ¡MODIFICADO! bindLogin ahora usa Firebase Auth
  function bindLogin(){
    const btn = $('#btn-login');
    if(!btn) return;

    // ¡NUEVO! Hacemos el listener asíncrono
    btn.addEventListener('click', async () => {
      const email = $('#login-email').value.trim();
      const pass = $('#login-pass').value.trim();
      const status = $('#login-status');
      
      if(!email || !pass){
        // ... (tu código de validación se queda igual)
        return;
      }

      // --- ¡NUEVO! Login con Firebase ---
      try {
        if(status){ status.className = 'msg'; status.textContent = 'Iniciando...'; }

        // 1. Intentamos iniciar sesión
        const userCredential = await auth.signInWithEmailAndPassword(email, pass);
        
        // 2. ¡Éxito!
        // El "observer" que pusimos al inicio se encargará
        // de poner sessionUser y actualizar el header.
        if(status){ status.classList.add('ok'); status.textContent = 'Sesión iniciada: ' + userCredential.user.email; }
        
        // Redirigimos a checkout (tu código de antes)
        setTimeout(() => { window.location.href = 'checkout.html'; }, 600);

      } catch (err) {
        // 3. Error
        console.error("Error de login: ", err.code);
        if(status){ status.classList.add('bad'); status.textContent = `Error: ${err.message}`; }
      }
      // --- Fin de la lógica de Login ---
    });
  }


  async function bindRegister(){
    const btn = $('#btn-register'); // Asumiendo un botón en register.html
    if(!btn) return;
    
    btn.addEventListener('click', async () => {
      // Asumiendo campos de un formulario de registro
      const email = $('#reg-email').value.trim();
      const pass = $('#reg-pass').value.trim();
      const name = $('#reg-name').value.trim(); // Tu campo 'Nombre'
      const phone = $('#reg-phone').value.trim(); // Tu campo 'Telefono'
      const status = $('#reg-status'); // Un <p> para mensajes
      
      if(!email || !pass || !name){
        if(status) { status.className = 'msg bad'; status.textContent = 'Email, contraseña y nombre son requeridos.'; }
        return;
      }
      
      try {
        if(status) { status.className = 'msg'; status.textContent = 'Creando cuenta...'; }

        // 1. Crear el usuario en Firebase Authentication
        const userCredential = await auth.createUserWithEmailAndPassword(email, pass);
        const user = userCredential.user;

        // 2. Crear el documento en TU colección 'usuarios'
        // Usamos .doc(user.uid).set() para usar el ID de Auth como ID del documento
        await db.collection('usuarios').doc(user.uid).set({
          Nombre: name,    // Coincide con tu DB
          Email: email,    // Coincide con tu DB
          Telefono: phone, // Coincide con tu DB
          fecharegistro: firebase.firestore.FieldValue.serverTimestamp(),
          marketingOptin: true, // O leerlo de un checkbox
          Direccion: { // Objeto por defecto como en tu DB
            ciudad: null,
            departamento: null,
            pais: "Colombia"
          }
        });

        // 3. ¡Éxito!
        if(status) { status.className = 'msg ok'; status.textContent = '¡Cuenta creada! Redirigiendo...'; }
        // El observer de auth se activará y lo logueará automáticamente
        setTimeout(() => { window.location.href = 'index.html'; }, 1000); // Lo mandamos al inicio

      } catch (err) {
        // Manejo de errores (ej. email ya existe, contraseña débil)
        console.error("Error de registro: ", err.code, err.message);
        if(status) { status.className = 'msg bad'; status.textContent = `Error: ${err.message}`; }
      }
    });
  }

  return { initBase, renderCatalog, renderCart, renderCheckout, bindCheckout, bindLogin, bindRegister };
})();
