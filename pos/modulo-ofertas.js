// ============================================
// MÓDULO: Ofertas (Descuentos + Combos)
// ============================================

// ============================================

let descuentosCache = [];
let descuentoEditandoId = null;

async function cargarOfertas() {
    _mostrarTabOfertasPorDefecto();
    try {
        descuentosCache = await window.api.obtenerDescuentos();
        // El catálogo (productos Y categorías) para el "¿qué lleva?" de las promos
        // y su vista previa. Del equipo, que es un espejo de la nube.
        // Siempre: el menú pudo cambiar desde la última vez (otra caja, el celular).
        {
            const agrupados = await window.api.obtenerProductosAgrupados();
            clasificaciones = agrupados || [];
            productosGlobales = [];
            (agrupados || []).forEach(cat => (cat.productos || []).forEach(p => productosGlobales.push({...p, categoria: cat.nombre})));
        }
        await cargarPromosLocales();
        renderizarTablaDescuentos();
        renderizarTablaCombos();
        // Y la lista fresca del servidor, sin esperarla: otra caja o el celular
        // pudieron cambiar una promo.
        if (_hayConexionParaPromos()) {
            refrescarPromosDesdeServidor().catch(e => console.warn('Promos desde la nube:', e && e.message));
        }
    } catch(e) { console.error('Error al cargar ofertas:', e); }
}

function cambiarTabOfertas(tab, btn) {
    // Acotado a esta vista por el mismo motivo que en Inventario: las clases
    // .inv-tab / .inv-panel se comparten entre las dos y un selector global
    // apaga las pestañas de la otra.
    const vista = document.getElementById('view-ofertas');
    if (vista) vista.querySelectorAll('.inv-tab').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('oferta-panel-descuentos').style.display = tab === 'descuentos' ? 'block' : 'none';
    document.getElementById('oferta-panel-combos').style.display = tab === 'combos' ? 'block' : 'none';
}

// La vista arranca con Descuentos visible, pero basta con que otra vista haya
// apagado estos paneles para que quede en blanco. Se restablece al entrar en
// vez de confiar en el estado que dejó quien pasó antes.
function _mostrarTabOfertasPorDefecto() {
    const vista = document.getElementById('view-ofertas');
    if (!vista) return;
    const botones = vista.querySelectorAll('.inv-tab');
    const activo = vista.querySelector('.inv-tab.active') || botones[0];
    const esCombos = activo && /combos/i.test(activo.textContent || '');
    botones.forEach(b => b.classList.toggle('active', b === activo));
    const pDesc = document.getElementById('oferta-panel-descuentos');
    const pCombos = document.getElementById('oferta-panel-combos');
    if (pDesc) pDesc.style.display = esCombos ? 'none' : 'block';
    if (pCombos) pCombos.style.display = esCombos ? 'block' : 'none';
}

// --- DESCUENTOS ---
function renderizarTablaDescuentos() {
    const tbody = document.getElementById('tabla-descuentos');
    if (!descuentosCache.length) {
        tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; padding:30px; color:#9ca3af;">
            Sin descuentos. Crea uno con el botón de arriba — aparecerán en el modal de cobro de Nueva Venta.
        </td></tr>`;
        return;
    }
    tbody.innerHTML = descuentosCache.map(d => `<tr>
        <td><strong>${esc(d.nombre)}</strong>${PromosRegla.leerCalendario(d.calendario)
            ? '<br><span style="color:#6b7280;font-size:0.8em;">' + esc(textoCalendario(d.calendario)) + '</span>' : ''}</td>
        <td><span class="badge-info">${d.tipo === 'porcentaje' ? 'Porcentaje' : 'Monto fijo'}</span></td>
        <td style="font-weight:600; color:#2563eb;">${d.tipo === 'porcentaje' ? d.valor + '%' : '$' + parseFloat(d.valor).toFixed(2)}</td>
        <td>
            <div style="display:flex; gap:6px;">
                <button class="btn-secondary small" onclick="editarDescuento(${d.id})" style="display:inline-flex;align-items:center;gap:4px;">
                    <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/><path d="m15 5 4 4"/></svg>
                    Editar
                </button>
                <button class="btn-secondary small" onclick="confirmarEliminarDescuento(${d.id}, '${esc(d.nombre)}')" style="color:#ef4444; display:inline-flex;align-items:center;gap:4px;">
                    <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 11v6"/><path d="M14 11v6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                </button>
            </div>
        </td>
    </tr>`).join('');
}

function abrirModalNuevoDescuento(d = null) {
    descuentoEditandoId = d ? d.id : null;
    document.getElementById('modal-desc-titulo').innerText = d ? 'Editar Descuento' : 'Nuevo Descuento';
    document.getElementById('ndesc-nombre').value = d ? d.nombre : '';
    document.getElementById('ndesc-tipo').value = d ? d.tipo : 'porcentaje';
    document.getElementById('ndesc-valor').value = d ? d.valor : '';
    const cbPin = document.getElementById('ndesc-requires-pin');
    if (cbPin) cbPin.checked = d ? !!d.requires_pin : false;
    // "10% los lunes" (PLAN_OFERTAS_V1 §3.3): el mismo calendario que las promos.
    pintarEditorCalendario('dcal', d ? d.calendario : null);
    actualizarLabelDescuento();
    document.getElementById('modal-nuevo-descuento').classList.remove('hidden');
}

function cerrarModalNuevoDescuento() {
    document.getElementById('modal-nuevo-descuento').classList.add('hidden');
    descuentoEditandoId = null;
}

function actualizarLabelDescuento() {
    const tipo = document.getElementById('ndesc-tipo').value;
    document.getElementById('ndesc-valor-label').innerText = tipo === 'porcentaje' ? 'Valor (%)' : 'Valor ($)';
}

async function guardarDescuento() {
    const nombre      = document.getElementById('ndesc-nombre').value.trim();
    const tipo        = document.getElementById('ndesc-tipo').value;
    const valor       = parseFloat(document.getElementById('ndesc-valor').value);
    const requiresPin = document.getElementById('ndesc-requires-pin')?.checked === true;
    if (!nombre || isNaN(valor) || valor <= 0) { alertaZenit('Completa todos los campos correctamente.'); return; }
    // ⚠️ AQUÍ SÍ ES UN TOPE, NO UN AVISO — y es la excepción a la regla del §37.
    // Un descuento de más del 100 % no significa nada: no existe cobrar menos que
    // gratis. Es distinto de una merma mayor que el stock (F-1) o de un retiro
    // mayor que el cajón (F-2), que sí pueden haber ocurrido de verdad y por eso
    // solo avisan. Guardarlo dejaba un "150 %" en la lista de descuentos rápidos
    // del cobro (BLOQUE 17, roce F-7).
    if (tipo === 'porcentaje' && valor > 100) {
        alertaZenit(
            'Un descuento en porcentaje no puede pasar de 100 %: eso sería cobrar menos que gratis.\n\n' +
            'Si quieres regalar el producto, usa 100 %. Para una cantidad fija en pesos, ' +
            'cambia el tipo a "Monto fijo".',
            'Porcentaje fuera de rango'
        );
        return;
    }
    const cal = leerEditorCalendario('dcal');
    if (!cal.ok) { alertaZenit(cal.error, 'Revisa el calendario'); return; }
    try {
        const datos = { nombre, tipo, valor, requires_pin: requiresPin, calendario: cal.calendario };
        if (modoConectado && apiClient && tokenActual) {
            const tipoBackend = tipo === 'porcentaje' ? 'percentage' : 'fixed';
            const body = { name: nombre, type: tipoBackend, value: valor, applies_to: 'all', requires_pin: requiresPin, calendario: cal.calendario };
            if (descuentoEditandoId) {
                await apiClient.request(`/offers/discounts/${descuentoEditandoId}`, { method: 'PUT', body });
                await window.api.actualizarDescuento(descuentoEditandoId, datos);
            } else {
                const creado = await apiClient.request('/offers/discounts', { method: 'POST', body });
                await window.api.agregarDescuentoConId(creado.id, { ...datos, requires_pin: requiresPin });
            }
        } else {
            if (descuentoEditandoId) {
                await window.api.actualizarDescuento(descuentoEditandoId, datos);
            } else {
                await window.api.agregarDescuento(datos);
            }
        }
        cerrarModalNuevoDescuento();
        await cargarOfertas();
        mostrarNotificacionExito('Descuento guardado', '¡Guardado!');
    } catch(e) { console.error(e); alertaZenit('Error al guardar el descuento'); }
}

function editarDescuento(id) {
    const d = descuentosCache.find(x => x.id === id);
    if (d) abrirModalNuevoDescuento(d);
}

async function confirmarEliminarDescuento(id, nombre) {
    if (await confirmarZenit(`Se eliminará el descuento "${nombre}".`, '¿Eliminar descuento?', { textoOk: 'Eliminar', peligro: true })) {
        if (modoConectado && apiClient && tokenActual) {
            try { await apiClient.request(`/offers/discounts/${id}`, { method: 'DELETE' }); } catch(e) { console.warn('Error al eliminar descuento en backend:', e.message); }
        }
        await window.api.eliminarDescuento(id);
        descuentosCache = await window.api.obtenerDescuentos();
        renderizarTablaDescuentos();
        mostrarNotificacionExito('Descuento eliminado', '¡Eliminado!');
    }
}

// --- PROMOS (PLAN_OFERTAS_V1, Bloque 2) ---
//
// Sustituye a la pantalla de combos: un combo es una promo de precio fijo.
// Tres preguntas —¿qué lleva?, ¿cuánto se cobra?, ¿cuándo?— y una VISTA
// PREVIA con los productos reales del negocio, que es la que evita el error:
// el dueño ve lo que va a cobrar antes de guardar (§3.5 del plan).
//
// ⚠️ CREAR O CAMBIAR UNA PROMO NECESITA CONEXIÓN (trampa 9), igual que la
// biblioteca de modificadores (§32.9): los ids son los del servidor. Venderla
// no: la caja la lee de su SQLite.

let promoEditandoId = null;

function _hayConexionParaPromos() {
    return Boolean(modoConectado && apiClient && tokenActual);
}

function renderizarTablaCombos() {
    const tbody = document.getElementById('tabla-combos');
    if (!tbody) return;
    const acum = document.getElementById('adj-ofertas-acumulables');
    if (acum) acum.checked = ofertasAcumulables === true;

    const lista = promosNegocio.filter(p => p.active);
    if (!lista.length) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:30px; color:#9ca3af;">
            Sin promos. Crea un "2x1 los martes" con el botón de arriba: aparecerá en Nueva Venta solo en su día y su hora.
        </td></tr>`;
        return;
    }
    const activas = new Set(promosActivasAhora().map(p => p.id));
    tbody.innerHTML = lista.map(p => `<tr data-promo-id="${p.id}">
        <td><strong>${esc(p.name)}</strong>${promoBienConfigurada(p) ? '' : '<br><span style="color:#b45309;font-size:0.8em;">Revisa cuántos lleva y cuántos cobra</span>'}</td>
        <td style="color:#374151;">${esc(textoHuecos(p) || '—')}</td>
        <td style="font-weight:700; color:#10b981;">${esc(textoCobro(p))}</td>
        <td style="color:#6b7280;">${esc(textoCalendario(p.calendario))}</td>
        <td>${activas.has(p.id)
            ? '<span class="promo-estado si">Activa ahora</span>'
            : '<span class="promo-estado no">Fuera de horario</span>'}</td>
        <td>
            <div style="display:flex; gap:6px;">
                <button class="btn-secondary small" onclick="editarCombo(${p.id})" style="display:inline-flex;align-items:center;gap:4px;">
                    <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/><path d="m15 5 4 4"/></svg>
                    Editar
                </button>
                <button class="btn-secondary small" onclick="confirmarEliminarCombo(${p.id})" style="color:#ef4444; display:inline-flex;align-items:center;gap:4px;">
                    <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 11v6"/><path d="M14 11v6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                </button>
            </div>
        </td>
    </tr>`).join('');
}

/** Opciones del "¿qué lleva?": categorías primero (lo normal: "2 de Tacos"), productos después. */
function _opcionesHuecoPromo(seleccion) {
    const cats = (clasificaciones || []).filter(c => c.id !== null && (c.productos || []).length);
    const optCats = cats.map(c =>
        `<option value="c:${c.id}" ${seleccion === 'c:' + c.id ? 'selected' : ''}>${esc(c.nombre)} (cualquiera)</option>`).join('');
    const optProds = productosGlobales.map(p =>
        `<option value="p:${p.id}" ${seleccion === 'p:' + p.id ? 'selected' : ''}>${esc(p.nombre)} — $${(parseFloat(p.precio) || 0).toFixed(2)}</option>`).join('');
    return `<optgroup label="Categorías">${optCats}</optgroup><optgroup label="Productos">${optProds}</optgroup>`;
}

function agregarHuecoPromo(cantidad = 1, seleccion = null) {
    const lista = document.getElementById('npromo-huecos');
    const div = document.createElement('div');
    div.className = 'receta-linea npromo-hueco';
    div.innerHTML = `
        <input type="number" class="npromo-cant" min="1" max="20" step="1" value="${cantidad}" style="flex:0.5;" oninput="pintarVistaPreviaPromo()">
        <span style="align-self:center;color:#6b7280;">de</span>
        <select class="npromo-que" style="flex:3;" onchange="pintarVistaPreviaPromo()">${_opcionesHuecoPromo(seleccion)}</select>
        <button class="btn-quitar" type="button" onclick="this.parentElement.remove(); pintarVistaPreviaPromo();" title="Quitar">
            <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 11v6"/><path d="M14 11v6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
        </button>`;
    lista.appendChild(div);
    pintarVistaPreviaPromo();
}

/** Las plantillas llenan todo lo de abajo; el dueño solo corrige lo que cambie. */
function aplicarPlantillaPromo(cual) {
    document.querySelectorAll('.promo-plantillas button').forEach(b => b.classList.toggle('activa', b.dataset.plantilla === cual));
    const lista = document.getElementById('npromo-huecos');
    // Se conserva lo que el dueño ya eligió en el primer renglón.
    const primera = lista.querySelector('.npromo-que');
    const que = primera ? primera.value : null;
    lista.innerHTML = '';
    if (cual === 'combo') {
        agregarHuecoPromo(1, que);
        agregarHuecoPromo(1, null);
        document.getElementById('npromo-cobro-fijo').checked = true;
    } else {
        const lleva = cual === '3x2' ? 3 : 2;
        agregarHuecoPromo(lleva, que);
        document.getElementById('npromo-cobro-regalar').checked = true;
        document.getElementById('npromo-paga').value = lleva - 1;
        const nombre = document.getElementById('npromo-nombre');
        if (nombre && !nombre.value.trim()) nombre.value = cual + ' en ' + (primera ? (primera.selectedOptions[0]?.textContent || '').replace(/\s*\(cualquiera\)|\s*—.*$/g, '') : '');
    }
    pintarVistaPreviaPromo();
}

/** Lo que el formulario dice, como promo plana (la misma forma que usa la venta). */
function _leerFormularioPromo() {
    const huecos = [...document.querySelectorAll('#npromo-huecos .npromo-hueco')].map(fila => {
        const que = fila.querySelector('.npromo-que').value || '';
        const cant = Math.max(1, parseInt(fila.querySelector('.npromo-cant').value, 10) || 1);
        const id = parseInt(que.slice(2), 10);
        return que.startsWith('c:')
            ? { quantity: cant, product_ids: [], category_id: id }
            : { quantity: cant, product_ids: [id], category_id: null };
    }).filter(h => h.category_id !== null ? Number.isInteger(h.category_id) : Number.isInteger(h.product_ids[0]));
    const regalar = document.getElementById('npromo-cobro-regalar').checked;
    return {
        id: promoEditandoId,
        name: document.getElementById('npromo-nombre').value.trim(),
        tipo: regalar ? 'regalar_mas_barato' : 'precio_fijo',
        price: regalar ? 0 : (parseFloat(document.getElementById('npromo-precio').value) || 0),
        paga: regalar ? (parseInt(document.getElementById('npromo-paga').value, 10) || 0) : null,
        lleva: PromosRegla.productosQueLleva(huecos),
        huecos,
        active: true,
    };
}

/**
 * La vista previa, con productos REALES: "Pastor $25 + Arrachera $35 → cobras
 * $35". Para cada hueco toma productos distintos (así se ve qué se regala), y
 * avisa en ámbar si la promo cuesta MÁS que los sueltos (trampa 7): se permite
 * —el dueño manda—, pero que lo vea.
 */
function pintarVistaPreviaPromo() {
    const el = document.getElementById('npromo-vista');
    if (!el || !document.getElementById('npromo-huecos')) return;
    const promo = _leerFormularioPromo();
    el.classList.remove('ambar');
    if (!promo.huecos.length) { el.textContent = 'Agrega qué lleva la promo.'; return; }

    const muestra = [];
    for (const h of promo.huecos) {
        const elegibles = productosDelHueco(h).slice().sort((a, b) => (parseFloat(b.precio) || 0) - (parseFloat(a.precio) || 0));
        if (!elegibles.length) {
            el.classList.add('ambar');
            el.textContent = 'Ningún producto a la venta entra en "' + nombreDeHueco(h) + '": así no se va a poder vender.';
            return;
        }
        for (let i = 0; i < h.quantity; i++) muestra.push(elegibles[i % elegibles.length]);
    }
    if (promo.tipo === 'regalar_mas_barato' && !promoBienConfigurada(promo)) {
        el.classList.add('ambar');
        el.textContent = 'Esta promo lleva ' + promo.lleva + ': tiene que cobrar menos que eso (en un 2x1 se cobra 1).';
        return;
    }
    const precios = muestra.map(p => parseFloat(p.precio) || 0);
    const cobra = PromosRegla.precioPromo(promo, precios);
    const suma = precios.reduce((s, p) => s + p, 0);
    const detalle = muestra.map(p => esc(p.nombre) + ' $' + (parseFloat(p.precio) || 0).toFixed(2)).join(' + ');
    let html = 'Ejemplo: ' + detalle + ' → <strong>cobras $' + cobra.toFixed(2) + '</strong>';
    if (cobra > suma + 0.004) {
        el.classList.add('ambar');
        html += '<br>Esta promo cuesta MÁS que los productos sueltos ($' + suma.toFixed(2) + ').';
    } else if (suma - cobra > 0.004) {
        html += ' · el cliente ahorra $' + (suma - cobra).toFixed(2);
    }
    el.innerHTML = html;
}

function abrirModalPromo(promo = null) {
    if (!_hayConexionParaPromos()) {
        alertaZenit('Crear o cambiar una promo necesita conexión con tu cuenta Zenit. Vender las que ya existen, no.', 'Sin conexión');
        return;
    }
    promoEditandoId = promo ? promo.id : null;
    document.getElementById('modal-promo-titulo').innerText = promo ? 'Editar promo' : 'Nueva promo';
    document.getElementById('npromo-nombre').value = promo ? promo.name : '';
    document.querySelectorAll('.promo-plantillas button').forEach(b => b.classList.remove('activa'));
    const lista = document.getElementById('npromo-huecos');
    lista.innerHTML = '';
    if (promo) {
        document.getElementById('npromo-cobro-regalar').checked = promo.tipo === 'regalar_mas_barato';
        document.getElementById('npromo-cobro-fijo').checked = promo.tipo !== 'regalar_mas_barato';
        document.getElementById('npromo-paga').value = promo.paga || 1;
        document.getElementById('npromo-precio').value = promo.tipo === 'precio_fijo' ? promo.price : '';
        promo.huecos.forEach(h => {
            const que = h.category_id !== null ? 'c:' + h.category_id : 'p:' + h.product_ids[0];
            agregarHuecoPromo(h.quantity, que);
        });
        pintarEditorCalendario('pcal', promo.calendario);
    } else {
        document.getElementById('npromo-precio').value = '';
        pintarEditorCalendario('pcal', null);
        aplicarPlantillaPromo('2x1');
    }
    pintarVistaPreviaPromo();
    document.getElementById('modal-promo').classList.remove('hidden');
}

function cerrarModalPromo() {
    document.getElementById('modal-promo').classList.add('hidden');
    promoEditandoId = null;
}

// Mantiene los nombres que ya usaba la pantalla vieja (y el HTML de la tabla).
function abrirModalNuevoCombo() { abrirModalPromo(); }
function editarCombo(id) {
    const promo = promosNegocio.find(p => p.id === id);
    if (promo) abrirModalPromo(promo);
}

/** Baja las promos del servidor a la SQLite y relee. Es lo que ve la caja. */
async function refrescarPromosDesdeServidor() {
    const combos = await apiClient.request('/offers/combos');
    await window.api.syncCombos(combos || []);
    await cargarPromosLocales();
    renderizarTablaCombos();
    if (typeof renderizarPromosVenta === 'function') renderizarPromosVenta();
}

async function guardarPromo() {
    if (!_hayConexionParaPromos()) {
        alertaZenit('Crear o cambiar una promo necesita conexión con tu cuenta Zenit.', 'Sin conexión');
        return;
    }
    const promo = _leerFormularioPromo();
    if (!promo.name) { alertaZenit('Ponle nombre a la promo: es lo que verá la cajera en el botón.'); return; }
    if (!promo.huecos.length) { alertaZenit('Di qué lleva la promo.'); return; }
    if (promo.tipo === 'precio_fijo' && !(promo.price > 0)) { alertaZenit('Escribe cuánto se cobra la promo.'); return; }
    if (promo.tipo === 'regalar_mas_barato' && !promoBienConfigurada(promo)) {
        alertaZenit('Esta promo lleva ' + promo.lleva + ': tiene que cobrar menos que eso (en un 2x1 se cobra 1).');
        return;
    }
    const cal = leerEditorCalendario('pcal');
    if (!cal.ok) { alertaZenit(cal.error, 'Revisa el calendario'); return; }

    const cuerpo = {
        name: promo.name, tipo: promo.tipo, calendario: cal.calendario,
        ...(promo.tipo === 'precio_fijo' ? { price: promo.price } : { paga: promo.paga }),
    };
    const items = promo.huecos.map(h => h.category_id !== null
        ? { category_id: h.category_id, quantity: h.quantity }
        : { product_id: h.product_ids[0], quantity: h.quantity });

    const btn = document.getElementById('npromo-guardar');
    if (btn) btn.disabled = true;
    try {
        if (promoEditandoId) {
            const id = promoEditandoId;
            // El servidor revisa "cobra menos de lo que lleva" contra lo que YA
            // tiene guardado, así que el orden importa: al pasar de 3x2 a 2x1 va
            // primero la regla; al pasar de 2x1 a 3x2, primero los productos.
            try {
                await apiClient.request(`/offers/combos/${id}`, { method: 'PUT', body: cuerpo });
                await apiClient.request(`/offers/combos/${id}/items`, { method: 'POST', body: { items } });
            } catch (e) {
                await apiClient.request(`/offers/combos/${id}/items`, { method: 'POST', body: { items } });
                await apiClient.request(`/offers/combos/${id}`, { method: 'PUT', body: cuerpo });
            }
        } else {
            const creado = await apiClient.request('/offers/combos', { method: 'POST', body: cuerpo });
            try {
                await apiClient.request(`/offers/combos/${creado.id}/items`, { method: 'POST', body: { items } });
            } catch (e) {
                // Una promo sin productos no se puede vender y confunde en la lista.
                await apiClient.request(`/offers/combos/${creado.id}`, { method: 'DELETE' }).catch(() => {});
                throw e;
            }
        }
        cerrarModalPromo();
        await refrescarPromosDesdeServidor();
        mostrarNotificacionExito('La promo ya aparece en Nueva Venta en su día y su hora', '¡Promo guardada!');
    } catch (e) {
        console.error('Error al guardar la promo:', e);
        alertaZenit('No se pudo guardar la promo: ' + (e && e.message ? e.message : 'error desconocido'));
    } finally {
        if (btn) btn.disabled = false;
    }
}

async function confirmarEliminarCombo(id) {
    const promo = promosNegocio.find(p => p.id === id);
    if (!promo) return;
    if (!_hayConexionParaPromos()) {
        alertaZenit('Quitar una promo necesita conexión con tu cuenta Zenit.', 'Sin conexión');
        return;
    }
    // Borrado SUAVE (trampa 6): los tickets ya cobrados conservan su nombre y
    // su precio porque van congelados en cada venta.
    if (await confirmarZenit(`La promo "${promo.name}" dejará de aparecer en la venta. Los tickets ya cobrados no cambian.`, '¿Quitar la promo?', { textoOk: 'Quitar', peligro: true })) {
        try {
            await apiClient.request(`/offers/combos/${id}`, { method: 'DELETE' });
            await refrescarPromosDesdeServidor();
            mostrarNotificacionExito('Promo quitada', '¡Listo!');
        } catch (e) {
            alertaZenit('No se pudo quitar la promo: ' + (e && e.message ? e.message : 'error desconocido'));
        }
    }
}

/**
 * El interruptor de juntar ofertas (§3.4). Es del DUEÑO: el servidor responde
 * 403 a cualquier otro puesto, y entonces el interruptor vuelve a su lugar.
 */
async function guardarOfertasAcumulables(valor) {
    const el = document.getElementById('adj-ofertas-acumulables');
    if (!_hayConexionParaPromos()) {
        if (el) el.checked = ofertasAcumulables;
        alertaZenit('Cambiar esto necesita conexión con tu cuenta Zenit.', 'Sin conexión');
        return;
    }
    try {
        await apiClient.saveSettings({ ofertas_acumulables: valor === true });
        await window.api.guardarAjuste('ofertas_acumulables', valor === true ? 'true' : 'false');
        ofertasAcumulables = valor === true;
        if (typeof renderizarCarrito === 'function' && Array.isArray(carrito) && carrito.length) renderizarCarrito();
        mostrarNotificacionExito(valor ? 'Los descuentos alcanzan también a las promos' : 'Los descuentos ya no tocan las promos', 'Guardado');
    } catch (e) {
        if (el) el.checked = ofertasAcumulables;
        alertaZenit('No se pudo guardar: ' + (e && e.message ? e.message : 'error desconocido'));
    }
}
