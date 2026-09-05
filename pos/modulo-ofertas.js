// ============================================
// MÓDULO: Ofertas (Descuentos + Combos)
// ============================================

// ============================================

let descuentosCache = [];
let combosCache = [];
let descuentoEditandoId = null;
let comboEditandoId = null;

async function cargarOfertas() {
    _mostrarTabOfertasPorDefecto();
    try {
        descuentosCache = await window.api.obtenerDescuentos();
        combosCache = await window.api.obtenerCombos();
        // También recargar productos para el selector de combos
        if (!productosGlobales.length) {
            const agrupados = await obtenerProductosAgrupadosWrapper();
            productosGlobales = [];
            agrupados.forEach(cat => cat.productos.forEach(p => productosGlobales.push({...p, categoria: cat.nombre})));
        }
        renderizarTablaDescuentos();
        renderizarTablaCombos();
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
        <td><strong>${esc(d.nombre)}</strong></td>
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
    try {
        const datos = { nombre, tipo, valor, requires_pin: requiresPin };
        if (modoConectado && apiClient && tokenActual) {
            const tipoBackend = tipo === 'porcentaje' ? 'percentage' : 'fixed';
            const body = { name: nombre, type: tipoBackend, value: valor, applies_to: 'all', requires_pin: requiresPin };
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

// --- COMBOS ---
function renderizarTablaCombos() {
    const tbody = document.getElementById('tabla-combos');
    if (!combosCache.length) {
        tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:30px; color:#9ca3af;">
            Sin combos. Crea uno agrupando productos con un precio especial.
        </td></tr>`;
        return;
    }
    tbody.innerHTML = combosCache.map(c => `<tr>
        <td><strong>${esc(c.nombre)}</strong></td>
        <td style="color:#6b7280;">${esc(c.descripcion || '—')}</td>
        <td style="font-weight:700; color:#10b981;">$${parseFloat(c.precio_especial).toFixed(2)}</td>
        <td><span id="combo-count-${c.id}" class="badge-info">...</span></td>
        <td>
            <div style="display:flex; gap:6px;">
                <button class="btn-secondary small" onclick="editarCombo(${c.id})" style="display:inline-flex;align-items:center;gap:4px;">
                    <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/><path d="m15 5 4 4"/></svg>
                    Editar
                </button>
                <button class="btn-secondary small" onclick="confirmarEliminarCombo(${c.id}, '${esc(c.nombre)}')" style="color:#ef4444; display:inline-flex;align-items:center;gap:4px;">
                    <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 11v6"/><path d="M14 11v6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                </button>
            </div>
        </td>
    </tr>`).join('');

    combosCache.forEach(c => {
        window.api.obtenerItemsCombo(c.id).then(items => {
            const el = document.getElementById(`combo-count-${c.id}`);
            if (el) el.innerText = `${items.length} producto${items.length !== 1 ? 's' : ''}`;
        });
    });
}

function abrirModalNuevoCombo(combo = null) {
    comboEditandoId = combo ? combo.id : null;
    document.getElementById('modal-combo-titulo').innerText = combo ? 'Editar Combo' : 'Nuevo Combo';
    document.getElementById('ncombo-nombre').value = combo ? combo.nombre : '';
    document.getElementById('ncombo-precio').value = combo ? combo.precio_especial : '';
    document.getElementById('ncombo-descripcion').value = combo ? combo.descripcion || '' : '';
    document.getElementById('combo-items-lista').innerHTML = '';
    document.getElementById('combo-precio-ref').innerText = '';

    if (combo) {
        window.api.obtenerItemsCombo(combo.id).then(items => {
            items.forEach(item => agregarLineaCombo(item));
            calcularPrecioReferenciaCombo();
        });
    } else {
        agregarLineaCombo();
    }
    document.getElementById('modal-nuevo-combo').classList.remove('hidden');
}

function cerrarModalNuevoCombo() {
    document.getElementById('modal-nuevo-combo').classList.add('hidden');
    comboEditandoId = null;
}

function agregarLineaCombo(itemExistente = null) {
    const lista = document.getElementById('combo-items-lista');
    const div = document.createElement('div');
    div.className = 'receta-linea';
    const opciones = productosGlobales.map(p =>
        `<option value="${p.id}" data-precio="${p.precio}" ${itemExistente && itemExistente.producto_id === p.id ? 'selected' : ''}>${p.nombre} — $${p.precio.toFixed(2)}</option>`
    ).join('');
    div.innerHTML = `
        <select style="flex:3;" onchange="calcularPrecioReferenciaCombo()">
            ${opciones || '<option>Sin productos</option>'}
        </select>
        <input type="number" placeholder="Cant." min="1" step="1" value="${itemExistente ? itemExistente.cantidad : 1}" style="flex:0.6;" oninput="calcularPrecioReferenciaCombo()">
        <button class="btn-quitar" onclick="this.parentElement.remove(); calcularPrecioReferenciaCombo();" title="Quitar">
            <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 11v6"/><path d="M14 11v6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
        </button>
    `;
    lista.appendChild(div);
}

function calcularPrecioReferenciaCombo() {
    let total = 0;
    document.querySelectorAll('#combo-items-lista .receta-linea').forEach(linea => {
        const sel = linea.querySelector('select');
        const inp = linea.querySelector('input');
        const precio = parseFloat(sel.selectedOptions[0]?.dataset.precio) || 0;
        const cant = parseInt(inp?.value) || 1;
        total += precio * cant;
    });
    const ref = document.getElementById('combo-precio-ref');
    if (ref) ref.innerHTML = total > 0
        ? `Precio normal: <strong>$${total.toFixed(2)}</strong> — El combo debería costar menos que esto`
        : '';
}

async function guardarCombo() {
    const nombre = document.getElementById('ncombo-nombre').value.trim();
    const precio_especial = parseFloat(document.getElementById('ncombo-precio').value);
    const descripcion = document.getElementById('ncombo-descripcion').value.trim();
    if (!nombre || isNaN(precio_especial) || precio_especial <= 0) {
        alertaZenit('El nombre y el precio especial son obligatorios.');
        return;
    }
    const items = [];
    document.querySelectorAll('#combo-items-lista .receta-linea').forEach(linea => {
        const sel = linea.querySelector('select');
        const inp = linea.querySelector('input');
        if (sel?.value && inp?.value) {
            items.push({ producto_id: parseInt(sel.value), cantidad: parseInt(inp.value) || 1 });
        }
    });
    if (items.length === 0) { alertaZenit('Agrega al menos un producto al combo.'); return; }
    try {
        const datos = { nombre, descripcion, precio_especial };
        const itemsBackend = items.map(i => ({ product_id: i.producto_id, quantity: i.cantidad }));
        if (modoConectado && apiClient && tokenActual) {
            if (comboEditandoId) {
                await apiClient.request(`/offers/combos/${comboEditandoId}`, { method: 'PUT', body: { name: nombre, description: descripcion, price: precio_especial } });
                await apiClient.request(`/offers/combos/${comboEditandoId}/items`, { method: 'POST', body: { items: itemsBackend } });
                await window.api.actualizarCombo(comboEditandoId, datos);
                await window.api.guardarItemsCombo(comboEditandoId, items);
            } else {
                const creado = await apiClient.request('/offers/combos', { method: 'POST', body: { name: nombre, description: descripcion, price: precio_especial } });
                await apiClient.request(`/offers/combos/${creado.id}/items`, { method: 'POST', body: { items: itemsBackend } });
                await window.api.agregarComboConId(creado.id, datos);
                await window.api.guardarItemsCombo(creado.id, items);
            }
        } else {
            if (comboEditandoId) {
                await window.api.actualizarCombo(comboEditandoId, datos);
                await window.api.guardarItemsCombo(comboEditandoId, items);
            } else {
                const nuevoId = await window.api.agregarCombo(datos);
                await window.api.guardarItemsCombo(nuevoId, items);
            }
        }
        cerrarModalNuevoCombo();
        combosCache = await window.api.obtenerCombos();
        renderizarTablaCombos();
        mostrarNotificacionExito('Combo guardado correctamente', '¡Combo Guardado!');
    } catch(e) { console.error(e); alertaZenit('Error al guardar el combo'); }
}

async function editarCombo(id) {
    const combo = combosCache.find(c => c.id === id);
    if (combo) abrirModalNuevoCombo(combo);
}

async function confirmarEliminarCombo(id, nombre) {
    if (await confirmarZenit(`Se eliminará el combo "${nombre}".`, '¿Eliminar combo?', { textoOk: 'Eliminar', peligro: true })) {
        if (modoConectado && apiClient && tokenActual) {
            try { await apiClient.request(`/offers/combos/${id}`, { method: 'DELETE' }); } catch(e) { console.warn('Error al eliminar combo en backend:', e.message); }
        }
        await window.api.eliminarCombo(id);
        combosCache = await window.api.obtenerCombos();
        renderizarTablaCombos();
        mostrarNotificacionExito('Combo eliminado', '¡Eliminado!');
    }
}
