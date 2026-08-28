// ============================================
// MÓDULO: Mesas
// ============================================

// ============================================

let _mesasData = [];
let _pedidosMesa = {};        // { mesa_id: pedido | null }
let _mesaActivaId = null;
let _pedidoMesaActivo = null;
let _zonaActivaMesas = 'Todas';
let _carritoMesa = {};        // { producto_id: { nombre, precio, cantidad } }
let _notasDebounceTimer = null;
let _categoriaActivaMesa = null;
// Idempotencia (BLOQUE 5). Un uuid por INTENCIÓN, no por clic: sobrevive a los
// reintentos del mismo envío para que el backend los reconozca, y se descarta
// en cuanto la acción se completa o el contenido cambia.
let _uuidAperturaMesa = {};   // { mesa_id: uuid } — abrir mesa
let _uuidEnvioMesa = null;    // lote de productos que se está agregando
let _abriendoMesa = false;
let _enviandoItemsMesa = false;

const _fmtMesa = (v) => '$' + parseFloat(v || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// ── Escapado de los modificadores dentro de items_raw (BLOQUE 11) ───────────
// `items_raw` separa campos con '|' y renglones con ';;', así que el JSON de los
// modificadores no puede llevar ninguno de los dos crudos: una opción llamada
// "Mitad | mitad" partiría el renglón y la mesa mostraría basura.
//
// Los marcadores no contienen '|' ni ';' a propósito (un '&#124;' se habría
// comido a sí mismo al escapar el ';' que lleva dentro), y el propio '~' se
// escapa primero para que la vuelta sea exacta. El desescapado va en ORDEN
// INVERSO. La ida la hace SQL (obtenerPedidoAbiertoPorMesa) y también
// `_normalizarPedidoApi`, para que el parser sea uno solo.
function _escaparMods(texto) {
    return String(texto || '')
        .replace(/~/g, '~T~')
        .replace(/\|/g, '~P~')
        .replace(/;/g, '~S~');
}

function _desescaparMods(texto) {
    return String(texto || '')
        .replace(/~P~/g, '|')
        .replace(/~S~/g, ';')
        .replace(/~T~/g, '~');
}

// Parsea el campo items_raw del GROUP_CONCAT
function _parsearItemsMesa(items_raw) {
    if (!items_raw) return [];
    return items_raw.split(';;').filter(Boolean).map(s => {
        const p = s.split('|');
        return {
            id:             parseInt(p[0]),
            producto_id:    parseInt(p[1]),
            cantidad:       parseFloat(p[2]),
            precio_unitario:parseFloat(p[3]),
            subtotal:       parseFloat(p[4]),
            nota_item:      p[5] || '',
            nombre:         p[6] || 'Producto',
            // Modificadores (BLOQUE 11). Llegan con los separadores escapados
            // desde SQL (ver obtenerPedidoAbiertoPorMesa); un JSON roto no debe
            // dejar la mesa en blanco, así que `leerModificadores` cae a [].
            modificadores:  leerModificadores(_desescaparMods(p[7])),
            // Precio del catálogo antes de los extras. Es el que sube al backend.
            precio_base:    p[8] !== undefined && p[8] !== '' ? parseFloat(p[8]) : parseFloat(p[3]),
        };
    });
}

// Calcula tiempo transcurrido desde una fecha string (CURRENT_TIMESTAMP format)
function _tiempoEnMesa(fechaStr) {
    if (!fechaStr) return '';
    // SQLite: '2024-01-01 10:00:00' → añadir 'T' y 'Z'
    // ISO backend: '2024-01-01T10:00:00.000Z' → usar directamente
    const inicio = fechaStr.includes('T') ? new Date(fechaStr) : new Date(fechaStr.replace(' ', 'T') + 'Z');
    const diff = Math.floor((Date.now() - inicio.getTime()) / 60000);
    if (diff < 0) return '0min';
    if (diff < 60) return `${diff}min`;
    const h = Math.floor(diff / 60);
    const m = diff % 60;
    return `${h}h ${m}m`;
}

// Convierte la respuesta del backend al formato que usa el desktop
function _normalizarMesasApi(tables) {
    return tables.map(t => ({
        id: t.id,
        nombre: t.name,
        zona: t.zone || 'General',
        capacidad: t.capacity || 4,
    }));
}

/**
 * Desglose del impuesto de la cuenta de una mesa (BLOQUE 8).
 *
 * ⚠️ ESTA FUNCIÓN FALTABA. El Bloque 8 la referenció en cinco lugares
 * (`_renderizarPanelMesa`, el ticket, `abrirCobrar`, `confirmarCobrarMesa` y el
 * total de la cuenta) pero nunca se escribió, así que TODA la vista de mesas
 * reventaba con "ReferenceError: _desgloseMesa is not defined" en cuanto había
 * un producto en la mesa — con el impuesto encendido o apagado, da igual.
 *
 * La tasa sale CONGELADA del pedido (§29): si el dueño cambia el impuesto a
 * media comida, la cuenta que el cliente ya vio no se mueve. Solo cuando el
 * pedido no la trae (mesa abierta antes del bloque) se cae a la del negocio.
 *
 * @param {Array} items items de la mesa (`_parsearItemsMesa`)
 * @returns {{suma:number, subtotal:number, impuesto:number, total:number, cfg:object}}
 *          `suma` = precios de lista sumados. En modo INCLUIDO esa suma YA es lo
 *          que se cobra; en AGREGADO el impuesto se le suma encima. Es la misma
 *          fórmula que `_recalcularTotalesMesa` de db.js: si se separaran, el
 *          panel mostraría un número y la base guardaría otro.
 */
function _cfgImpuestoMesa() {
    const pedido = _pedidoMesaActivo;
    const tasaCongelada = pedido == null
        ? null
        : normalizarTasaImpuesto(pedido.tasa_impuesto ?? pedido.tax_rate);

    // Sin tasa congelada (mesa vieja o pedido sin el dato) se usa la del negocio.
    if (tasaCongelada === null) return configImpuesto;

    const incluidoCrudo = pedido.impuesto_incluido ?? pedido.tax_included;
    return {
        activo: tasaCongelada > 0,
        tasa: tasaCongelada,
        tasaConfigurada: tasaCongelada,
        incluido: incluidoCrudo === undefined || incluidoCrudo === null || incluidoCrudo === ''
            ? configImpuesto.incluido
            : (incluidoCrudo === true || incluidoCrudo === 'true' || incluidoCrudo === 1 || incluidoCrudo === '1'),
        nombre: configImpuesto.nombre,
    };
}

function _desgloseMesa(items) {
    const suma = parseFloat(
        ((items || []).reduce((s, i) => s + (parseFloat(i.subtotal) || 0), 0)).toFixed(2)
    );
    const cfg = _cfgImpuestoMesa();
    const d = desglosarImpuesto(suma, cfg);
    return { suma, subtotal: d.subtotal, impuesto: d.impuesto, total: d.total, cfg };
}

function _normalizarPedidoApi(order) {
    if (!order) return null;
    const items_raw = (order.items || []).map(item =>
        [item.id, item.product?.id || 0, item.quantity,
         // ⚠️ El precio del RENGLÓN, no el del catálogo. Antes se leía
         // `product.price`, así que la cuenta mostraba el precio de hoy en vez
         // del que se cobró — y con modificadores (BLOQUE 11) el renglón
         // mostraría $100 mientras el total cobra $110.
         parseFloat(item.unit_price != null ? item.unit_price : (item.product?.price || 0)),
         parseFloat(item.subtotal || 0),
         item.notes || '',
         item.product?.name || 'Producto',
         // Mismo escapado que hace SQL, para que el parser sea uno solo.
         _escaparMods(item.modifiers),
         parseFloat(item.base_unit_price != null ? item.base_unit_price
                                                 : (item.unit_price != null ? item.unit_price : 0)),
        ].join('|')
    ).join(';;');
    return {
        id: order.id,
        cliente_id: order.customer_id || null,
        total: parseFloat(order.total || 0),
        // Impuesto CONGELADO de la cuenta (BLOQUE 8). Sin esto, una mesa abierta
        // en modo conectado se desglosaba con la tasa de HOY en vez de con la que
        // tenía al abrirse, así que cambiar el impuesto a media comida movía la
        // cuenta que el cliente ya había visto.
        subtotal: order.subtotal !== undefined && order.subtotal !== null ? parseFloat(order.subtotal) : null,
        impuesto: parseFloat(order.tax_amount || 0),
        tasa_impuesto: order.tax_rate !== undefined && order.tax_rate !== null ? parseFloat(order.tax_rate) : null,
        impuesto_incluido: order.tax_included,
        // Reparto por método de pago (BLOQUE 10), para el ticket de la cuenta.
        payments: Array.isArray(order.payments) ? order.payments : [],
        fecha_pedido: order.createdAt,
        comensales: order.guests || 0,
        notas_generales: order.notes || null,
        items_raw,
        _isApiOrder: true,
    };
}

async function cargarVistaMesas() {
    // Tabs de sucursal + aviso de solo-lectura (el mismo control del dashboard).
    // Sustituye al aviso propio que se inyectaba a mano y que además mentía: decía
    // que las mesas eran las de este dispositivo aunque el backend las devolvía
    // todas, porque las mesas no tenían sucursal.
    renderizarTabsSucursal('mesas');
    const _avisoViejo = document.getElementById('mesas-otra-sucursal-aviso');
    if (_avisoViejo) _avisoViejo.remove();

    try {
        if (modoConectado && apiClient && tokenActual) {
            const tables = await apiClient.getTables(sucursalParaConsultar());
            _mesasData = _normalizarMesasApi(tables);
            _pedidosMesa = {};
            for (const t of tables) {
                _pedidosMesa[t.id] = t.open_order ? _normalizarPedidoApi(t.open_order) : null;
            }
        } else {
            _mesasData = await window.api.obtenerMesas(sucursalIdActual);
            _pedidosMesa = {};
            await Promise.all(_mesasData.map(async m => {
                _pedidosMesa[m.id] = await window.api.obtenerPedidoMesa(m.id) || null;
            }));
        }
        _renderizarZonasMesas();
        _renderizarTarjetasMesas();
        // Si había mesa seleccionada, refrescar panel
        if (_mesaActivaId !== null) {
            const pedido = _pedidosMesa[_mesaActivaId];
            if (pedido) {
                _pedidoMesaActivo = pedido;
                _renderizarPanelMesa();
            } else {
                cerrarPanelMesa();
            }
        }
    } catch(e) {
        console.error('Error cargando mesas:', e);
    }
}

function _renderizarZonasMesas() {
    const el = document.getElementById('mesas-zonas-tabs');
    if (!el) return;
    const zonas = ['Todas', ...new Set(_mesasData.map(m => m.zona || 'General'))];
    el.innerHTML = zonas.map(z =>
        `<button onclick="_filtrarZonaMesas('${z}')"
            style="padding:5px 14px;border-radius:20px;border:1px solid ${z === _zonaActivaMesas ? '#4f46e5' : '#d1d5db'};
                   background:${z === _zonaActivaMesas ? '#4f46e5' : '#fff'};
                   color:${z === _zonaActivaMesas ? '#fff' : '#374151'};
                   cursor:pointer;font-size:0.85em;font-weight:500;">${z}</button>`
    ).join('');
}

function _filtrarZonaMesas(zona) {
    _zonaActivaMesas = zona;
    _renderizarZonasMesas();
    _renderizarTarjetasMesas();
}

function _renderizarTarjetasMesas() {
    const el = document.getElementById('mesas-grid');
    if (!el) return;
    let mesas = _mesasData;
    if (_zonaActivaMesas !== 'Todas') {
        mesas = mesas.filter(m => (m.zona || 'General') === _zonaActivaMesas);
    }
    if (mesas.length === 0) {
        el.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:40px;color:#9ca3af;">
            ${_mesasData.length === 0
                ? 'No hay mesas configuradas. Usa el botón <b>Configurar</b> para agregar mesas.'
                : 'No hay mesas en esta zona.'}
        </div>`;
        return;
    }
    el.innerHTML = mesas.map(m => {
        const pedido = _pedidosMesa[m.id];
        const ocupada = !!pedido;
        const bg = ocupada ? '#fff3e0' : '#f0fdf4';
        const border = ocupada ? '#f59e0b' : '#22c55e';
        const dot = ocupada ? '#f59e0b' : '#22c55e';
        const items = ocupada ? _parsearItemsMesa(pedido.items_raw) : [];
        const total = ocupada ? parseFloat(pedido.total || 0) : 0;
        const tiempo = ocupada ? _tiempoEnMesa(pedido.fecha_pedido) : '';
        const comensales = ocupada && pedido.comensales ? `${svgIconHTML('users', 14, '#6b7280')} ${pedido.comensales}` : `${svgIconHTML('users', 14, '#6b7280')} ${m.capacidad}`;
        return `<div onclick="${ocupada ? `abrirPanelMesa(${m.id})` : `seleccionarMesaLibre(${m.id})`}"
            style="background:${bg};border:2px solid ${border};border-radius:10px;padding:14px;cursor:pointer;
                   display:flex;flex-direction:column;gap:6px;min-height:110px;position:relative;
                   transition:box-shadow 0.15s;" onmouseover="this.style.boxShadow='0 2px 8px rgba(0,0,0,0.12)'" onmouseout="this.style.boxShadow=''">
            <div style="display:flex;align-items:center;justify-content:space-between;">
                <span style="font-weight:700;font-size:1em;">${esc(m.nombre)}</span>
                <span style="width:10px;height:10px;border-radius:50%;background:${dot};display:inline-block;"></span>
            </div>
            <div style="font-size:0.78em;color:#6b7280;">${esc(m.zona || 'General')} · ${comensales}</div>
            ${ocupada ? `<div style="font-size:0.85em;font-weight:600;color:#d97706;">${_fmtMesa(total)}</div>
                <div style="font-size:0.75em;color:#9ca3af;">${items.length} producto${items.length !== 1 ? 's' : ''} · ${tiempo}</div>`
            : `<div style="font-size:0.78em;color:#16a34a;margin-top:auto;">Libre</div>`}
        </div>`;
    }).join('');
}

function seleccionarMesaLibre(mesa_id) {
    _mesaActivaId = mesa_id;
    const mesa = _mesasData.find(m => m.id === mesa_id);
    document.getElementById('modal-abrir-mesa-titulo').textContent = `Abrir ${mesa?.nombre || 'Mesa'}`;
    document.getElementById('mesa-comensales').value = mesa?.capacidad || 2;
    document.getElementById('mesa-notas-apertura').value = '';
    document.getElementById('modal-abrir-mesa').classList.remove('hidden');
}

function cerrarModalAbrirMesa() {
    // El uuid de idempotencia vale solo mientras esta apertura sigue en curso. Si
    // se guardara para siempre, reabrir la misma mesa mañana con ese uuid haría
    // que el backend devolviera el pedido viejo en vez de abrir uno nuevo.
    if (_mesaActivaId) delete _uuidAperturaMesa[_mesaActivaId];
    document.getElementById('modal-abrir-mesa').classList.add('hidden');
}

async function confirmarAbrirMesa() {
    if (!_mesaActivaId) return;
    if (_abriendoMesa) return; // doble clic mientras la primera apertura va en camino
    // Abrir mesa crea un pedido: aplica la misma regla de sucursal que una venta
    if (await bloquearSiVistaAjena()) return;
    if (!(await verificarSucursalParaRegistrar())) return;
    const comensales = parseInt(document.getElementById('mesa-comensales').value) || 1;
    const notas = document.getElementById('mesa-notas-apertura').value.trim();
    const mesaId = _mesaActivaId;
    _abriendoMesa = true;
    try {
        const mesaAbrir = _mesasData.find(m => m.id === mesaId);
        if (modoConectado && apiClient && tokenActual) {
            // Mismo uuid mientras se sigue intentando abrir ESTA mesa: si la
            // respuesta se pierde pero el pedido sí se creó, el reintento
            // devuelve ese pedido en vez de abrir una segunda comanda.
            if (!_uuidAperturaMesa[mesaId]) _uuidAperturaMesa[mesaId] = _generarUuid();
            const order = await apiClient.openTableOrder(mesaId, comensales, notas || null, sucursalIdActual, _uuidAperturaMesa[mesaId]);
            _pedidosMesa[mesaId] = _normalizarPedidoApi(order);
            delete _uuidAperturaMesa[mesaId];
        } else {
            // La mesa congela el impuesto vigente al abrirse (BLOQUE 8).
            await window.api.abrirPedidoMesa(
                mesaId, mesaAbrir?.nombre || '', nombreActivo || 'Cajero', comensales, notas || null,
                { tasa: configImpuesto.tasa || 0, incluido: !!configImpuesto.incluido }
            );
        }
        cerrarModalAbrirMesa();
        await cargarVistaMesas();
        // Abrir panel de la mesa recién abierta
        abrirPanelMesa(mesaId);
    } catch(e) {
        console.error('Error abriendo mesa:', e);
        mostrarNotificacionExito('Error al abrir la mesa', 'Error');
    } finally {
        _abriendoMesa = false;
    }
}

async function abrirPanelMesa(mesa_id) {
    _mesaActivaId = mesa_id;
    const pedido = _pedidosMesa[mesa_id];
    if (!pedido) return seleccionarMesaLibre(mesa_id);
    _pedidoMesaActivo = pedido;
    const mesa = _mesasData.find(m => m.id === mesa_id);
    const panel = document.getElementById('mesa-panel');
    panel.classList.remove('hidden');
    document.getElementById('mesa-panel-titulo').textContent = mesa?.nombre || 'Mesa';
    const comensales = pedido.comensales ? `${svgIconHTML('users', 14, '#6b7280')} ${pedido.comensales} comensales · ` : '';
    document.getElementById('mesa-panel-info').innerHTML = `${comensales}Desde ${_tiempoEnMesa(pedido.fecha_pedido)}`;
    document.getElementById('mesa-notas-input').value = pedido.notas_generales || '';
    _renderizarPanelMesa();
}

function cerrarPanelMesa() {
    _mesaActivaId = null;
    _pedidoMesaActivo = null;
    document.getElementById('mesa-panel').classList.add('hidden');
}

function _renderizarPanelMesa() {
    const el = document.getElementById('mesa-panel-items');
    if (!el || !_pedidoMesaActivo) return;
    const items = _parsearItemsMesa(_pedidoMesaActivo.items_raw);
    if (items.length === 0) {
        el.innerHTML = `<div style="text-align:center;padding:20px;color:#9ca3af;font-size:0.9em;">Sin productos aún</div>`;
        return;
    }
    // `_d` se usa más abajo en la plantilla: el Bloque 8 lo dejó sin declarar y
    // el panel entero reventaba. El total a mostrar es el del desglose, no la
    // suma cruda: en modo AGREGADO son números distintos.
    const _d = _desgloseMesa(items);
    const total = _d.total;
    el.innerHTML = items.map(it => `
        <div style="display:flex;align-items:center;gap:8px;padding:8px 16px;border-bottom:1px solid #f3f4f6;">
            <div style="flex:1;min-width:0;">
                <div style="font-size:0.9em;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${esc(it.nombre)}</div>
                ${resumenModificadores(it.modificadores)
                    ? `<div style="font-size:0.78em;color:#b45309;font-weight:600;">${esc(resumenModificadores(it.modificadores))}</div>` : ''}
                ${it.nota_item ? `<div style="font-size:0.75em;color:#6b7280;">${esc(it.nota_item)}</div>` : ''}
                <div style="font-size:0.8em;color:#6b7280;">${it.cantidad} × ${_fmtMesa(it.precio_unitario)}</div>
            </div>
            <div style="font-weight:600;font-size:0.9em;">${_fmtMesa(it.subtotal)}</div>
            <button onclick="eliminarItemDeMesa(${it.id})" title="Eliminar"
                style="background:none;border:none;cursor:pointer;color:#ef4444;padding:4px;flex-shrink:0;">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
            </button>
        </div>
    `).join('') + `${_d.impuesto > 0 ? `<div style="padding:6px 16px 0;text-align:right;font-size:0.82em;color:#6b7280;">
        Subtotal: ${_fmtMesa(_d.cfg.incluido ? _d.total : _d.suma)} · ${esc(_d.cfg.nombre)} (${_d.cfg.tasa}%)${_d.cfg.incluido ? ' incl.' : ''}: ${_fmtMesa(_d.impuesto)}
    </div>` : ''}<div style="padding:8px 16px;text-align:right;font-weight:700;font-size:1em;border-top:2px solid #e5e7eb;margin-top:4px;">
        Total: ${_fmtMesa(total)}
    </div>`;
}

async function enviarMesaACocina() {
    if (!_pedidoMesaActivo) return;
    const items = _parsearItemsMesa(_pedidoMesaActivo.items_raw);
    if (items.length === 0) return;
    const mesa = _mesasData.find(m => m.id === _mesaActivaId);
    // Marcar ANTES de enviar al KDS para que el polling no lo reenvíe
    if (_pedidoMesaActivo.id) {
        const itemIds = (_pedidoMesaActivo.items_raw || '').split(';;')
            .map(r => parseInt(r.split('|')[0])).filter(Boolean);
        _kdsTracked.set(_pedidoMesaActivo.id, {
            updatedAt: null,
            itemIds: new Set(itemIds),
        });
    }
    await window.api.kdsNuevoPedido({
        pedidoId: _pedidoMesaActivo.id || null,
        tipo: 'mesa',
        mesa: mesa?.nombre || `Mesa ${_mesaActivaId}`,
        notas: _pedidoMesaActivo.notas_generales || null,
        // La cocina necesita los extras (BLOQUE 11): un 'sin cebolla' que no
        // llega al pasador se convierte en un plato devuelto.
        items: items.map(i => ({
            nombre: i.nombre,
            cantidad: i.cantidad,
            modificadores: resumenModificadores(i.modificadores),
            notas: i.nota_item || '',
        }))
    }).catch(() => {});
    mostrarNotificacionExito('Comanda enviada a cocina', '');
}

async function eliminarItemDeMesa(item_id) {
    if (!_pedidoMesaActivo) return;
    try {
        if (modoConectado && apiClient && tokenActual) {
            const updated = await apiClient.removeOrderItem(_pedidoMesaActivo.id, item_id);
            _pedidosMesa[_mesaActivaId] = _normalizarPedidoApi(updated);
        } else {
            await window.api.eliminarItemMesa(item_id, _pedidoMesaActivo.id);
            _pedidosMesa[_mesaActivaId] = await window.api.obtenerPedidoMesa(_mesaActivaId) || null;
        }
        _pedidoMesaActivo = _pedidosMesa[_mesaActivaId];
        if (_pedidoMesaActivo) {
            _renderizarPanelMesa();
            const info = document.getElementById('mesa-panel-info');
            if (info) {
                const comensales = _pedidoMesaActivo.comensales ? `${svgIconHTML('users', 14, '#6b7280')} ${_pedidoMesaActivo.comensales} comensales · ` : '';
                info.innerHTML = `${comensales}Desde ${_tiempoEnMesa(_pedidoMesaActivo.fecha_pedido)}`;
            }
        }
        _renderizarTarjetasMesas();
    } catch(e) {
        console.error('Error eliminando item:', e);
    }
}

function guardarNotasMesaDebounced(notas) {
    clearTimeout(_notasDebounceTimer);
    _notasDebounceTimer = setTimeout(async () => {
        if (!_pedidoMesaActivo) return;
        try { await window.api.actualizarNotasMesa(_pedidoMesaActivo.id, notas); } catch(e) {}
    }, 800);
}

// ---- Modal Agregar Productos ----

async function abrirModalAgregarProductosMesa() {
    _carritoMesa = {};
    document.getElementById('mesa-prod-busqueda').value = '';
    _categoriaActivaMesa = null;
    // Cargar catálogo si aún no se ha visitado Nueva Venta
    if (productosGlobales.length === 0) {
        try {
            const grupos = await obtenerProductosAgrupadosWrapper();
            productosGlobales = [];
            grupos.forEach(c => c.productos.forEach(p => productosGlobales.push({ ...p, categoria: c.nombre })));
        } catch(e) { console.error('Error cargando productos para mesa:', e); }
    }
    _renderizarProductoresMesa(productosGlobales);
    _renderizarCategoriasMesa();
    _actualizarResumenCarritoMesa();
    document.getElementById('modal-agregar-productos-mesa').classList.remove('hidden');
}

function cerrarModalAgregarProductosMesa() {
    document.getElementById('modal-agregar-productos-mesa').classList.add('hidden');
    _carritoMesa = {};
    _uuidEnvioMesa = null; // el carrito se vació: el próximo envío es otro lote
}

function _renderizarCategoriasMesa() {
    const el = document.getElementById('mesa-prod-categorias');
    if (!el) return;
    const cats = [...new Set(productosGlobales.map(p => p.categoria).filter(Boolean))];
    el.innerHTML = ['Todos', ...cats].map(c =>
        `<button onclick="_filtrarCategoriaMesa('${c}')"
            style="padding:3px 10px;border-radius:12px;border:1px solid ${c === (_categoriaActivaMesa || 'Todos') ? '#4f46e5' : '#d1d5db'};
                   background:${c === (_categoriaActivaMesa || 'Todos') ? '#4f46e5' : '#fff'};
                   color:${c === (_categoriaActivaMesa || 'Todos') ? '#fff' : '#374151'};
                   cursor:pointer;font-size:0.8em;">${c}</button>`
    ).join('');
}

function _filtrarCategoriaMesa(cat) {
    _categoriaActivaMesa = cat === 'Todos' ? null : cat;
    filtrarProductosMesa(document.getElementById('mesa-prod-busqueda')?.value || '');
    _renderizarCategoriasMesa();
}

function filtrarProductosMesa(busqueda) {
    let lista = productosGlobales;
    if (_categoriaActivaMesa) lista = lista.filter(p => p.categoria === _categoriaActivaMesa);
    if (busqueda) {
        const q = busqueda.toLowerCase();
        lista = lista.filter(p => p.nombre.toLowerCase().includes(q));
    }
    _renderizarProductoresMesa(lista);
}

function _renderizarProductoresMesa(lista) {
    const el = document.getElementById('mesa-prod-grid');
    if (!el) return;
    if (lista.length === 0) {
        el.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:20px;color:#9ca3af;">Sin resultados</div>`;
        return;
    }
    const mostrarStock = document.getElementById('adj-mostrar-stock')?.checked;
    el.innerHTML = lista.map(p => {
        const en_carrito = _cantidadEnCarritoMesa(p.id);
        return `<div id="mesa-pcard-${p.id}" style="border:2px solid ${en_carrito > 0 ? '#4f46e5' : '#e5e7eb'};border-radius:8px;padding:10px;cursor:pointer;text-align:center;background:${en_carrito > 0 ? '#f0f0ff' : '#fff'};"
            onclick="_toggleProductoMesa(${p.id}, '${esc(p.nombre || '')}', ${p.precio})">
            <div style="font-size:1.3em;">${renderIcono(p.emoji || 'svg:utensils', 20)}</div>
            <div style="font-size:0.8em;font-weight:500;margin:4px 0;line-height:1.2;">${esc(p.nombre)}</div>
            <div style="font-size:0.85em;color:#4f46e5;font-weight:600;">${_fmtMesa(p.precio)}</div>
            ${mostrarStock ? `<div id="mesa-stock-${p.id}" style="font-size:0.72em;color:#9ca3af;margin-top:3px;">...</div>` : ''}
            ${en_carrito > 0 ? `<div style="font-size:0.75em;color:#fff;background:#4f46e5;border-radius:10px;padding:1px 8px;margin-top:4px;">×${en_carrito}</div>` : ''}
        </div>`;
    }).join('');

    if (mostrarStock) {
        lista.forEach(p => {
            window.api.calcularStockProducto(p.id).then(stock => {
                const el = document.getElementById(`mesa-stock-${p.id}`);
                if (!el) return;
                if (stock === null) {
                    el.innerHTML = '';
                } else if (stock === 0) {
                    el.innerHTML = '<span style="color:#ef4444;font-weight:600;">Sin stock</span>';
                    document.getElementById(`mesa-pcard-${p.id}`)?.style.setProperty('opacity', '0.5');
                } else if (stock <= 3) {
                    el.innerHTML = `<span style="color:#f59e0b;font-weight:600;">${svgIconHTML('triangle-alert', 14, '#f59e0b')} ${stock} disponibles</span>`;
                } else {
                    el.innerHTML = `<span style="color:#10b981;">${stock} disponibles</span>`;
                }
            }).catch(() => {});
        });
    }
}

// MODIFICADORES (BLOQUE 11). La clave del carrito de mesa deja de ser el id del
// producto y pasa a ser "producto + extras elegidos": dos tacos, uno con extra
// queso y otro sin él, son renglones DISTINTOS y se cobran distinto. Con la
// clave vieja el segundo se habría fundido con el primero y habría heredado sus
// extras (y su precio).
function _claveCarritoMesa(productoId, modificadores) {
    const firma = (modificadores || [])
        .map(m => m.option_id)
        .filter(Boolean)
        .sort((a, b) => a - b)
        .join('-');
    return firma ? `${productoId}|${firma}` : String(productoId);
}

/** Cuántas unidades de un producto hay en el carrito, sumando todas sus variantes. */
function _cantidadEnCarritoMesa(productoId) {
    return Object.values(_carritoMesa)
        .filter(v => v.producto_id === productoId)
        .reduce((s, v) => s + v.cantidad, 0);
}

function _toggleProductoMesa(id, nombre, precio) {
    const producto = { id, nombre, precio };
    abrirModalModificadores(producto, (modificadores) => {
        const clave = _claveCarritoMesa(id, modificadores);
        if (!_carritoMesa[clave]) {
            _carritoMesa[clave] = {
                producto_id: id,
                nombre,
                // Lo que se cobra por unidad de ESTE renglón (base + extras).
                precio: precioConModificadores(precio, modificadores),
                precio_base: precio,
                modificadores,
                cantidad: 0,
            };
        }
        _carritoMesa[clave].cantidad++;
        _uuidEnvioMesa = null; // el envío cambió: ya no es el mismo lote
        _actualizarResumenCarritoMesa();
        filtrarProductosMesa(document.getElementById('mesa-prod-busqueda')?.value || '');
    });
}

function _quitarProductoMesa(clave) {
    if (!_carritoMesa[clave]) return;
    _carritoMesa[clave].cantidad--;
    if (_carritoMesa[clave].cantidad <= 0) delete _carritoMesa[clave];
    _uuidEnvioMesa = null;
    _actualizarResumenCarritoMesa();
    filtrarProductosMesa(document.getElementById('mesa-prod-busqueda')?.value || '');
}

/**
 * El "+" del resumen suma otra unidad del renglón EXACTO, con los extras que ya
 * tenía. Antes llamaba a `_toggleProductoMesa`, que ahora vuelve a preguntar los
 * modificadores — y eso convertiría "uno más de lo mismo" en un interrogatorio.
 */
function _sumarUnoCarritoMesa(clave) {
    if (!_carritoMesa[clave]) return;
    _carritoMesa[clave].cantidad++;
    _uuidEnvioMesa = null;
    _actualizarResumenCarritoMesa();
    filtrarProductosMesa(document.getElementById('mesa-prod-busqueda')?.value || '');
}

function _actualizarResumenCarritoMesa() {
    const el = document.getElementById('mesa-carrito-resumen');
    if (!el) return;
    const items = Object.entries(_carritoMesa).filter(([,v]) => v.cantidad > 0);
    if (items.length === 0) {
        el.innerHTML = '<span style="color:#9ca3af;font-size:0.85em;">Ningún producto seleccionado</span>';
        return;
    }
    const total = items.reduce((s, [,i]) => s + i.precio * i.cantidad, 0);
    el.innerHTML = `
        <div style="max-height:130px;overflow-y:auto;margin-bottom:6px;">
            ${items.map(([clave, item]) => {
                // Los extras se listan bajo el nombre: dos renglones del mismo
                // producto solo se distinguen por ellos.
                const textoMods = resumenModificadores(item.modificadores);
                return `
                <div style="display:flex;align-items:center;gap:5px;padding:3px 0;border-bottom:1px solid #f3f4f6;">
                    <span style="flex:1;font-size:0.82em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${esc(item.nombre)}${textoMods ? `<br><span style="font-size:0.85em;color:#b45309;">${esc(textoMods)}</span>` : ''}</span>
                    <button onclick="_quitarProductoMesa('${esc(clave)}')" title="Quitar uno"
                        style="width:22px;height:22px;border:1px solid #fca5a5;border-radius:4px;background:#fef2f2;cursor:pointer;font-size:14px;color:#ef4444;line-height:1;flex-shrink:0;">−</button>
                    <span style="min-width:18px;text-align:center;font-weight:700;font-size:0.85em;">${item.cantidad}</span>
                    <button onclick="_sumarUnoCarritoMesa('${esc(clave)}')" title="Agregar uno"
                        style="width:22px;height:22px;border:1px solid #a5b4fc;border-radius:4px;background:#eef2ff;cursor:pointer;font-size:14px;color:#4f46e5;line-height:1;flex-shrink:0;">+</button>
                    <span style="font-size:0.82em;color:#6b7280;min-width:52px;text-align:right;">${_fmtMesa(item.precio * item.cantidad)}</span>
                </div>
            `; }).join('')}
        </div>
        <div style="text-align:right;font-weight:700;font-size:0.88em;color:#374151;">Total: ${_fmtMesa(total)}</div>
    `;
}

async function confirmarAgregarProductosMesa() {
    if (!_pedidoMesaActivo) return;
    if (_enviandoItemsMesa) return; // doble clic: la primera comanda ya va en camino
    const items = Object.entries(_carritoMesa).filter(([,v]) => v.cantidad > 0);
    if (items.length === 0) { cerrarModalAgregarProductosMesa(); return; }
    _enviandoItemsMesa = true;
    try {
        // `updated` declarado aquí (fuera del if) para que esté en scope al marcar el tracker
        let updated = null;
        if (modoConectado && apiClient && tokenActual) {
            const apiItems = items.map(([, item]) => ({
                product_id: item.producto_id,
                quantity: item.cantidad,
                // El backend resuelve el delta contra su propia base: aquí solo
                // viaja QUÉ se eligió, nunca cuánto cuesta (BLOQUE 11).
                ...(item.modificadores && item.modificadores.length
                    ? { modifiers: item.modificadores }
                    : {}),
            }));
            // Un uuid por LOTE, estable mientras el carrito no cambie: si el envío
            // se corta después de que el backend lo guardó, reintentar no duplica
            // los productos de la mesa ni descuenta los insumos dos veces.
            if (!_uuidEnvioMesa) _uuidEnvioMesa = _generarUuid();
            updated = await apiClient.addItemsToOrder(_pedidoMesaActivo.id, apiItems, _uuidEnvioMesa);
            // Marcar inmediatamente (antes de kdsNuevoPedido) para que el polling no reenvíe
            _kdsMarcarEnviado(updated.id, updated.updatedAt, updated.items);
            _pedidosMesa[_mesaActivaId] = _normalizarPedidoApi(updated);
        } else {
            for (const [, item] of items) {
                // `item.precio` ya trae los extras sumados; `precio_base` es el
                // del catálogo, para poder desglosarlo en la cuenta.
                await window.api.agregarItemMesa(
                    _pedidoMesaActivo.id, item.producto_id, item.cantidad, item.precio, null,
                    item.modificadores || [], item.precio_base
                );
            }
            _pedidosMesa[_mesaActivaId] = await window.api.obtenerPedidoMesa(_mesaActivaId) || null;
        }
        cerrarModalAgregarProductosMesa();
        _pedidoMesaActivo = _pedidosMesa[_mesaActivaId];
        if (_pedidoMesaActivo) _renderizarPanelMesa();
        _renderizarTarjetasMesas();
        // Enviar comanda al KDS con solo los items recién agregados
        const mesaKds = _mesasData.find(m => m.id === _mesaActivaId);
        window.api.kdsNuevoPedido({
            pedidoId: _pedidoMesaActivo?.id || null,
            tipo: 'mesa',
            mesa: mesaKds?.nombre || `Mesa ${_mesaActivaId}`,
            notas: null,
            items: items.map(([, item]) => ({
                nombre: item.nombre,
                cantidad: item.cantidad,
                modificadores: resumenModificadores(item.modificadores),
                notas: '',
            }))
        }).catch(() => {});
        mostrarNotificacionExito('Comanda enviada a cocina', 'Enviado');
        // Refrescar badges de stock tras descontar insumos (local e inmediato, sin esperar SSE)
        _refrescarStockBadges();
        _uuidEnvioMesa = null; // lote cerrado: el próximo envío es otro
    } catch(e) {
        console.error('Error agregando productos a mesa:', e);
        mostrarNotificacionExito('Error al agregar productos', 'Error');
        // El uuid NO se limpia: si el envío sí llegó, el reintento lo deduplica.
    } finally {
        _enviandoItemsMesa = false;
    }
}

// ---- Imprimir cuenta ----

async function imprimirCuentaMesa() {
    if (!_pedidoMesaActivo) return;
    const mesa = _mesasData.find(m => m.id === _mesaActivaId);
    const items = _parsearItemsMesa(_pedidoMesaActivo.items_raw);
    const _d = _desgloseMesa(items);
    const total = _d.total;
    const ajustes = await window.api.obtenerAjustes();
    const negocio = ajustes.nombre_negocio || 'Negocio';
    const impresora = ajustes.impresora || '';
    const ahora = new Date().toLocaleString('es-MX');
    const itemsHtml = items.map(it =>
        `<tr><td>${it.cantidad}× ${esc(it.nombre)}${resumenModificadores(it.modificadores) ? `<br><span style="color:#555;font-size:0.92em">${esc(resumenModificadores(it.modificadores))}</span>` : ''}</td><td style="text-align:right">${_fmtMesa(it.subtotal)}</td></tr>`
    ).join('');
    const html = `<html><head><style>
        body{font-family:monospace;font-size:12px;width:300px;margin:0;padding:8px;}
        h1{font-size:13px;text-align:center;margin:4px 0;}
        .centro{text-align:center;}
        .linea{border-top:1px dashed #000;margin:6px 0;}
        table{width:100%;border-collapse:collapse;}
        td{padding:1px 0;}
        .total{font-weight:bold;font-size:13px;}
    </style></head><body>
        <h1>${esc(negocio)}</h1>
        <div class="linea"></div>
        <div class="centro"><b>CUENTA — ${esc(mesa?.nombre || 'Mesa')}</b></div>
        ${_pedidoMesaActivo.comensales ? `<div class="centro">Comensales: ${_pedidoMesaActivo.comensales}</div>` : ''}
        <div class="linea"></div>
        <table>${itemsHtml}</table>
        <div class="linea"></div>
        ${_d.impuesto > 0 ? `<table>
            <tr><td>Subtotal</td><td style="text-align:right">${_fmtMesa(_d.cfg.incluido ? _d.total : _d.suma)}</td></tr>
            <tr><td>${esc(_d.cfg.nombre)} (${_d.cfg.tasa}%)${_d.cfg.incluido ? ' incl.' : ''}</td><td style="text-align:right">${_fmtMesa(_d.impuesto)}</td></tr>
        </table>` : ''}
        <table><tr><td class="total">TOTAL</td><td style="text-align:right" class="total">${_fmtMesa(total)}</td></tr></table>
        <div class="linea"></div>
        <div class="centro" style="font-size:11px;">Impreso: ${ahora}</div>
    </body></html>`;
    try {
        await window.api.imprimirTicket(html, impresora);
    } catch(e) {
        console.error('Error imprimiendo cuenta:', e);
        mostrarNotificacionExito('Error al imprimir', 'Error');
    }
}

// ---- Modal Cobrar ----

// ── PROPINA DE LA MESA (BLOQUE 9) ───────────────────────────────────────────
// Espejo de la lógica de modulo-venta.js, con su propio estado porque el cobro de
// mesa es un modal distinto y los dos pueden estar abiertos en momentos distintos.
// ⚠️ La propina NO entra en el total de la cuenta: la mesa consumió lo que
// consumió. Lo que el cliente entrega es cuenta + propina.
let propinaMesaActual = 0;
let propinaMesaMetodo = null;

function _resetearPropinaMesa() {
    propinaMesaActual = 0;
    propinaMesaMetodo = null;
    const input = document.getElementById('propina-mesa-input');
    if (input) input.value = '';
}

/** Total de la mesa que se está cobrando, para calcular los porcentajes. */
function _totalMesaEnCobro() {
    if (!_pedidoMesaActivo) return 0;
    return _desgloseMesa(_parsearItemsMesa(_pedidoMesaActivo.items_raw)).total;
}

function _renderizarSeccionPropinaMesa(total = _totalMesaEnCobro()) {
    const seccion = document.getElementById('seccion-propina-mesa');
    if (!seccion) return;

    if (!hayPropinas()) {
        seccion.classList.add('hidden');
        _resetearPropinaMesa();
        return;
    }
    seccion.classList.remove('hidden');

    const contenedor = document.getElementById('propina-mesa-botones');
    if (contenedor) {
        const botones = (configPropina.sugerencias || []).map(pct => {
            const monto = propinaPorPorcentaje(total, pct);
            const activo = propinaMesaActual > 0 && Math.abs(propinaMesaActual - monto) < 0.005;
            return `<button type="button" onclick="aplicarPropinaMesaPorcentaje(${pct})"
                        style="flex:1;min-width:64px;padding:8px 6px;border-radius:8px;cursor:pointer;font-size:0.86em;font-weight:600;
                               border:2px solid ${activo ? '#16a34a' : '#d1d5db'};
                               background:${activo ? '#16a34a' : 'white'};color:${activo ? 'white' : '#374151'};">
                        ${pct}%<br><span style="font-size:0.85em;font-weight:500;opacity:0.85;">${_fmtMesa(monto)}</span>
                    </button>`;
        }).join('');
        const sinPropina = propinaMesaActual <= 0;
        contenedor.innerHTML = botones + `
            <button type="button" onclick="quitarPropinaMesa()"
                    style="flex:1;min-width:64px;padding:8px 6px;border-radius:8px;cursor:pointer;font-size:0.86em;font-weight:600;
                           border:2px solid ${sinPropina ? '#6b7280' : '#d1d5db'};
                           background:${sinPropina ? '#6b7280' : 'white'};color:${sinPropina ? 'white' : '#374151'};">
                    Sin<br><span style="font-size:0.85em;font-weight:500;opacity:0.85;">propina</span>
            </button>`;
    }
    _actualizarDisplayPropinaMesa(total);
}

function _actualizarDisplayPropinaMesa(total = _totalMesaEnCobro()) {
    const display = document.getElementById('propina-mesa-monto-display');
    if (display) display.textContent = _fmtMesa(propinaMesaActual);

    const metodoPago = document.getElementById('cobrar-mesa-metodo')?.value || 'efectivo';
    const selMetodo = document.getElementById('propina-mesa-metodo');
    if (selMetodo) {
        selMetodo.value = normalizarMetodoPropina(propinaMesaMetodo, metodoPago);
        selMetodo.style.display = propinaMesaActual > 0 ? '' : 'none';
    }

    const fila = document.getElementById('propina-mesa-entrega');
    const monto = document.getElementById('propina-mesa-entrega-monto');
    if (fila && monto) {
        if (propinaMesaActual > 0) {
            fila.classList.remove('hidden');
            monto.textContent = _fmtMesa(totalConPropina(total, propinaMesaActual));
        } else {
            fila.classList.add('hidden');
        }
    }
}

function aplicarPropinaMesaPorcentaje(pct) {
    const total = _totalMesaEnCobro();
    propinaMesaActual = propinaPorPorcentaje(total, pct);
    const input = document.getElementById('propina-mesa-input');
    if (input) input.value = propinaMesaActual > 0 ? propinaMesaActual.toFixed(2) : '';
    _renderizarSeccionPropinaMesa(total);
}

function quitarPropinaMesa() {
    _resetearPropinaMesa();
    _renderizarSeccionPropinaMesa();
}

function alCambiarPropinaMesaManual() {
    const input = document.getElementById('propina-mesa-input');
    if (!input) return;
    const limpio = input.value.replace(/[^\d.]/g, '');
    if (limpio !== input.value) input.value = limpio;
    propinaMesaActual = normalizarPropina(limpio);
    _renderizarSeccionPropinaMesa();
}

function alCambiarMetodoPropinaMesa() {
    const sel = document.getElementById('propina-mesa-metodo');
    if (sel) propinaMesaMetodo = sel.value;
}

async function abrirModalCobrarMesa() {
    if (!_pedidoMesaActivo) return;
    const items = _parsearItemsMesa(_pedidoMesaActivo.items_raw);
    // Lo que se cobra ya trae el impuesto: el cajero debe pedir ese monto exacto.
    const total = _desgloseMesa(items).total;
    document.getElementById('cobrar-mesa-total').textContent = _fmtMesa(total);
    document.getElementById('cobrar-mesa-metodo').value = 'efectivo';
    // La propina y la división arrancan en cero en cada cobro: no se heredan de
    // la mesa anterior (un reparto viejo cobraría mal la cuenta nueva).
    _resetearPropinaMesa();
    _resetearDivisionMesa();
    _renderizarSeccionPropinaMesa(total);
    _actualizarBotonCobrarMesa();
    document.getElementById('modal-cobrar-mesa').classList.remove('hidden');

    // Mostrar puntos a ganar si el sistema está activo
    try {
        const aj = await window.api.obtenerAjustes();
        const elPts = document.getElementById('cobrar-mesa-puntos-info');
        if (elPts) {
            if (aj.puntos_activos === 'true') {
                const pts = await calcularPuntosGanados(total);
                elPts.innerHTML = `${svgIconHTML('star', 14, '#7c3aed')} Esta compra genera ${pts} puntos`;
                elPts.style.display = '';
            } else {
                elPts.style.display = 'none';
            }
        }
    } catch(e) { /* ignorar */ }
}

function cerrarModalCobrarMesa() {
    // Si el modal está en estado de "cobrado", restaurarlo antes de ocultar
    if (_cobroMesaSnap) { _cerrarCobrarMesaFinal(); return; }
    document.getElementById('modal-cobrar-mesa').classList.add('hidden');
}

// ════════════════════════════════════════════════════════════════════════════
// DIVIDIR LA CUENTA (BLOQUE 10)
// ════════════════════════════════════════════════════════════════════════════
//
// Dos formas, las dos válidas:
//   • POR ITEMS  — cada comensal paga lo que consumió. Es lo que más se pide.
//   • PARTES IGUALES — se parte la cuenta en N y listo.
//
// ⚠️ En los dos casos los pagos REPARTEN el total, no lo aumentan: la suma tiene
// que dar exactamente la cuenta o el backend rechaza el cobro (400). El botón de
// confirmar queda bloqueado hasta que cuadre, para que el cajero lo vea antes.
//
// El monto de un grupo de items se calcula sobre el TOTAL REAL de la cuenta, no
// sobre la suma de los precios de lista: el total ya trae el impuesto y ya tiene
// restados los descuentos, así que sumar precios sueltos cobraría de más o de
// menos y la división nunca cuadraría (ver montoDeItems en modulo-pagos.js).

let divisionMesaActiva = false;
let modoDivisionMesa = 'items';   // 'items' | 'partes'
let pagosMesa = [];               // [{ method, amount, tip_amount, item_ids }]
let asignacionItems = {};         // { itemId: indiceDePago }

function _resetearDivisionMesa() {
    divisionMesaActiva = false;
    modoDivisionMesa = 'items';
    pagosMesa = [];
    asignacionItems = {};
    const seccion = document.getElementById('seccion-division-mesa');
    if (seccion) seccion.classList.add('hidden');
    const btn = document.getElementById('btn-dividir-mesa');
    if (btn) btn.innerText = 'Dividir la cuenta';
}

function alternarDivisionMesa() {
    divisionMesaActiva = !divisionMesaActiva;
    const seccion = document.getElementById('seccion-division-mesa');
    const btn = document.getElementById('btn-dividir-mesa');

    if (divisionMesaActiva) {
        if (pagosMesa.length === 0) {
            // Se arranca con dos pagos vacíos y todos los items en el primero:
            // el cajero solo mueve los que cambian de dueño.
            pagosMesa = [
                { method: 'efectivo', amount: 0, tip_amount: 0, item_ids: [] },
                { method: 'efectivo', amount: 0, tip_amount: 0, item_ids: [] },
            ];
            asignacionItems = {};
            for (const it of _itemsDeLaCuenta()) asignacionItems[it.id] = 0;
        }
        if (seccion) seccion.classList.remove('hidden');
        if (btn) btn.innerText = 'Cancelar la división';
        cambiarModoDivisionMesa(modoDivisionMesa);
    } else {
        pagosMesa = [];
        asignacionItems = {};
        if (seccion) seccion.classList.add('hidden');
        if (btn) btn.innerText = 'Dividir la cuenta';
    }
    _actualizarBotonCobrarMesa();
}

function cambiarModoDivisionMesa(modo) {
    modoDivisionMesa = modo;
    const panelItems = document.getElementById('division-mesa-items');
    const panelPartes = document.getElementById('division-mesa-partes');
    const tabItems = document.getElementById('tab-division-items');
    const tabPartes = document.getElementById('tab-division-partes');

    const activo = 'background:#1e40af;color:#fff;';
    const inactivo = 'background:#fff;color:#1e40af;';
    const base = 'flex:1;padding:7px;border:1px solid #bfdbfe;border-radius:8px;font-size:0.85em;font-weight:600;cursor:pointer;';

    if (modo === 'items') {
        if (panelItems) panelItems.classList.remove('hidden');
        if (panelPartes) panelPartes.classList.add('hidden');
        if (tabItems) tabItems.style.cssText = base + activo;
        if (tabPartes) tabPartes.style.cssText = base + inactivo;
        _recalcularPagosPorItems();
    } else {
        if (panelItems) panelItems.classList.add('hidden');
        if (panelPartes) panelPartes.classList.remove('hidden');
        if (tabItems) tabItems.style.cssText = base + inactivo;
        if (tabPartes) tabPartes.style.cssText = base + activo;
    }
    _renderizarDivisionMesa();
}

/** Items de la cuenta abierta, con un id estable para asignarlos. */
function _itemsDeLaCuenta() {
    if (!_pedidoMesaActivo) return [];
    return _parsearItemsMesa(_pedidoMesaActivo.items_raw) || [];
}

function _totalDeLaCuenta() {
    return _desgloseMesa(_itemsDeLaCuenta()).total;
}

function dividirMesaEnPartes(n) {
    const montos = dividirEnPartes(_totalDeLaCuenta(), n);
    pagosMesa = montos.map(monto => ({
        method: 'efectivo', amount: monto, tip_amount: 0, item_ids: [],
    }));
    // En partes iguales la asignación por items deja de tener sentido.
    asignacionItems = {};
    _renderizarDivisionMesa();
    _actualizarBotonCobrarMesa();
}

function agregarPagoMesa() {
    if (pagosMesa.length >= PAGO_MAX) {
        alertaZenit('Una cuenta admite como máximo ' + PAGO_MAX + ' pagos.');
        return;
    }
    const falta = faltantePago(pagosMesa, _totalDeLaCuenta());
    pagosMesa.push({
        method: 'efectivo',
        amount: modoDivisionMesa === 'items' ? 0 : (falta > 0 ? falta : 0),
        tip_amount: 0,
        item_ids: [],
    });
    _renderizarDivisionMesa();
    _actualizarBotonCobrarMesa();
}

function quitarPagoMesa(indice) {
    if (pagosMesa.length <= 1) { alternarDivisionMesa(); return; }
    pagosMesa.splice(indice, 1);
    // Los items que pagaba ese comensal pasan al primero, y los índices de los
    // que estaban después se corren: si no, quedarían apuntando al pago equivocado.
    for (const id of Object.keys(asignacionItems)) {
        if (asignacionItems[id] === indice) asignacionItems[id] = 0;
        else if (asignacionItems[id] > indice) asignacionItems[id] -= 1;
    }
    if (modoDivisionMesa === 'items') _recalcularPagosPorItems();
    _renderizarDivisionMesa();
    _actualizarBotonCobrarMesa();
}

function alAsignarItemDivision(itemId, indicePago) {
    asignacionItems[itemId] = parseInt(indicePago) || 0;
    _recalcularPagosPorItems();
    _renderizarDivisionMesa();
    _actualizarBotonCobrarMesa();
}

function alCambiarPagoMesa(indice, campo, valor) {
    if (!pagosMesa[indice]) return;
    if (campo === 'method') {
        pagosMesa[indice].method = metodoDePago(valor);
    } else {
        const limpio = String(valor || '').replace(/[^\d.]/g, '');
        pagosMesa[indice][campo] = parseFloat(limpio) || 0;
    }
    _actualizarResumenDivisionMesa();
    _actualizarBotonCobrarMesa();
}

/** Reparte el total entre los pagos según qué items le tocó pagar a cada uno. */
function _recalcularPagosPorItems() {
    const items = _itemsDeLaCuenta();
    const total = _totalDeLaCuenta();

    for (let i = 0; i < pagosMesa.length; i++) {
        const idsGrupo = items
            .filter(it => (asignacionItems[it.id] || 0) === i)
            .map(it => it.id);
        pagosMesa[i].item_ids = idsGrupo;
        pagosMesa[i].amount = montoDeItems(items, idsGrupo, total);
    }
    // Las proporciones dejan centavos sueltos: se le cargan al último pago para
    // que la suma dé exactamente la cuenta (el backend exige que cuadre).
    cuadrarUltimoPago(pagosMesa, total);
}

function _renderizarDivisionMesa() {
    const listaItems = document.getElementById('lista-items-division');
    if (listaItems && modoDivisionMesa === 'items') {
        const items = _itemsDeLaCuenta();
        listaItems.innerHTML = items.map(it => {
            const opciones = pagosMesa.map((_, i) =>
                '<option value="' + i + '"' + ((asignacionItems[it.id] || 0) === i ? ' selected' : '') + '>Pago ' + (i + 1) + '</option>'
            ).join('');
            return '<div style="display:flex;gap:6px;align-items:center;font-size:0.85em;">' +
                '<span style="flex:1;color:#334155;">' + (it.cantidad || 1) + '× ' + (it.nombre || 'Producto') + '</span>' +
                '<span style="color:#64748b;">' + _fmtMesa(it.subtotal || 0) + '</span>' +
                '<select onchange="alAsignarItemDivision(' + it.id + ', this.value)"' +
                ' style="padding:4px 6px;border:1px solid #d1d5db;border-radius:6px;font-size:0.9em;">' + opciones + '</select>' +
            '</div>';
        }).join('');
    }

    const listaPagos = document.getElementById('lista-pagos-mesa');
    if (listaPagos) {
        const conPropina = hayPropinas();
        const porItems = modoDivisionMesa === 'items';

        listaPagos.innerHTML = pagosMesa.map((pago, i) => {
            const inputPropina = conPropina
                ? '<input type="text" inputmode="decimal" value="' + ((pago.tip_amount || 0) > 0 ? pago.tip_amount.toFixed(2) : '') + '"' +
                  ' oninput="alCambiarPagoMesa(' + i + ', \'tip_amount\', this.value)" placeholder="Propina"' +
                  ' title="Propina de este pago. Va aparte del monto."' +
                  ' style="flex:0.9;padding:8px;border:1px solid #bbf7d0;border-radius:8px;font-size:0.85em;text-align:right;background:#f0fdf4;">'
                : '';
            // En modo POR ITEMS el monto lo calcula la asignación, así que se
            // muestra en solo lectura: editarlo a mano descuadraría la división
            // sin que el cajero entienda por qué.
            const inputMonto = porItems
                ? '<span style="flex:1;padding:8px;text-align:right;font-weight:600;color:#1e40af;font-size:0.88em;">' + _fmtMesa(pago.amount || 0) + '</span>'
                : '<input type="text" inputmode="decimal" value="' + (pago.amount || 0).toFixed(2) + '"' +
                  ' oninput="alCambiarPagoMesa(' + i + ', \'amount\', this.value)" placeholder="Monto"' +
                  ' style="flex:1;padding:8px;border:1px solid #d1d5db;border-radius:8px;font-size:0.88em;text-align:right;">';

            return '<div style="display:flex;gap:6px;align-items:center;">' +
                '<span style="font-size:0.78em;color:#64748b;min-width:46px;">Pago ' + (i + 1) + '</span>' +
                '<select onchange="alCambiarPagoMesa(' + i + ', \'method\', this.value)"' +
                ' style="flex:1.1;padding:8px;border:1px solid #d1d5db;border-radius:8px;font-size:0.85em;">' +
                    '<option value="efectivo"' + (pago.method === 'efectivo' ? ' selected' : '') + '>Efectivo</option>' +
                    '<option value="tarjeta"' + (pago.method === 'tarjeta' ? ' selected' : '') + '>Tarjeta</option>' +
                    '<option value="transferencia"' + (pago.method === 'transferencia' ? ' selected' : '') + '>Transf.</option>' +
                '</select>' +
                inputMonto + inputPropina +
                '<button type="button" onclick="quitarPagoMesa(' + i + ')" title="Quitar este pago"' +
                ' style="padding:8px 10px;border:none;border-radius:8px;background:#fee2e2;color:#b91c1c;font-weight:700;cursor:pointer;">×</button>' +
            '</div>';
        }).join('');
    }

    _actualizarResumenDivisionMesa();
}

function _actualizarResumenDivisionMesa() {
    const total = _totalDeLaCuenta();
    const falta = faltantePago(pagosMesa, total);

    const elTotal = document.getElementById('division-mesa-total');
    if (elTotal) elTotal.textContent = _fmtMesa(total);

    const elFalta = document.getElementById('division-mesa-faltante');
    if (elFalta) {
        if (Math.abs(falta) <= PAGO_TOLERANCIA + 1e-9) {
            elFalta.textContent = 'Cuadra ✓';
            elFalta.style.color = '#16a34a';
        } else if (falta > 0) {
            elFalta.textContent = 'Falta ' + _fmtMesa(falta);
            elFalta.style.color = '#1e40af';
        } else {
            elFalta.textContent = 'Sobra ' + _fmtMesa(Math.abs(falta));
            elFalta.style.color = '#dc2626';
        }
    }

    // Con la cuenta dividida, la propina de la mesa es la suma de las de cada pago.
    if (divisionMesaActiva && hayPropinas()) {
        propinaMesaActual = pagosMesa.reduce((a, p) => a + (parseFloat(p.tip_amount) || 0), 0);
        propinaMesaActual = parseFloat(propinaMesaActual.toFixed(2));
        _actualizarDisplayPropinaMesa();
    }
}

/** Bloquea el cobro mientras la división no cuadre con la cuenta. */
function _actualizarBotonCobrarMesa() {
    const btn = document.getElementById('btn-confirmar-cobrar-mesa');
    if (!btn) return;
    const ok = !divisionMesaActiva || (pagosMesa.length > 0 && pagosCuadran(pagosMesa, _totalDeLaCuenta()));
    btn.disabled = !ok;
    btn.classList.toggle('disabled', !ok);
}

async function confirmarCobrarMesa() {
    if (!_pedidoMesaActivo) return;

    // Con la cuenta dividida el método sale del reparto ('multiple' si hay
    // varios); el selector de arriba deja de mandar. Se valida ANTES de cobrar
    // para que el cajero vea el problema aquí y no como un 400 del backend.
    let pagosSnap = null;
    if (divisionMesaActiva) {
        const v = validarPagos(pagosMesa, _totalDeLaCuenta());
        if (!v.ok) { alertaZenit(v.error); return; }
        pagosSnap = pagosMesa.map(pago => ({
            method: pago.method,
            amount: pago.amount,
            tip_amount: pago.tip_amount || 0,
            item_ids: pago.item_ids || [],
        }));
    }

    const metodo = divisionMesaActiva
        ? metodoResumenPagos(pagosMesa)
        : document.getElementById('cobrar-mesa-metodo').value;
    const pedidoSnap = { ..._pedidoMesaActivo };
    const itemsSnap  = _parsearItemsMesa(_pedidoMesaActivo.items_raw);
    const desgloseSnap = _desgloseMesa(itemsSnap);
    const totalSnap  = desgloseSnap.total;
    // Propina del cobro (BLOQUE 9). Va APARTE del total: la cuenta es lo que se
    // consumió y la propina es lo que el cliente dejó de más.
    const propinaSnap = hayPropinas() ? (propinaMesaActual || 0) : 0;
    const propinaMetodoSnap = propinaSnap > 0
        ? normalizarMetodoPropina(propinaMesaMetodo, metodo)
        : null;
    try {
        if (modoConectado && apiClient && tokenActual) {
            // BLOQUE 10 — `pagosSnap` es el desglose de la cuenta dividida. Va
            // null en un cobro normal, y entonces el backend se comporta como
            // siempre (un solo método, sin filas de pago).
            await apiClient.closeTableOrder(pedidoSnap.id, metodo, propinaSnap, propinaMetodoSnap, pagosSnap);
        } else {
            await window.api.cerrarPedidoMesa(pedidoSnap.id, metodo, propinaSnap, propinaMetodoSnap);

            // Sincronizar al backend si está conectado (modo local con sync)
            try {
                await apiClient?.createOrder({
                    total: totalSnap,
                    // Tasa con la que se cobró la mesa (BLOQUE 8). El backend solo
                    // la acepta si la venta llega como diferida; en este camino
                    // recalcula con la config del negocio, que es la misma salvo
                    // que el dueño la haya cambiado con la mesa ya abierta.
                    tax_rate: desgloseSnap.cfg.tasa || 0,
                    tax_included: !!desgloseSnap.cfg.incluido,
                    // Propina (BLOQUE 9): aparte del total, igual que en la venta
                    // de mostrador. El backend la descarta si están apagadas.
                    tip_amount: propinaSnap,
                    tip_method: propinaMetodoSnap,
                    // Reparto de la cuenta dividida (BLOQUE 10). Los item_ids no
                    // viajan por este camino: la venta se crea de cero en el
                    // backend y sus items todavía no tienen id allá. El cuadre
                    // lo hacen los montos, que es lo que importa para la caja.
                    ...(pagosSnap ? {
                        payments: pagosSnap.map(pago => ({
                            method: pago.method,
                            amount: pago.amount,
                            tip_amount: pago.tip_amount || 0,
                        })),
                    } : {}),
                    payment_method: metodo,
                    order_type: 'comer',
                    notes: pedidoSnap.notas_generales || null,
                    customer_temp_info: pedidoSnap.info_cliente_temp || null,
                    status: 'completado'
                }, itemsSnap.map(it => ({
                    product_id: it.producto_id,
                    quantity: it.cantidad,
                    // El precio BASE, sin extras: el backend suma los
                    // modificadores por su cuenta (BLOQUE 11).
                    unit_price: it.precio_base != null ? it.precio_base : it.precio_unitario,
                    base_unit_price: it.precio_base != null ? it.precio_base : it.precio_unitario,
                    modifiers: it.modificadores && it.modificadores.length ? it.modificadores : undefined,
                    subtotal: it.subtotal,
                    notes: it.nota_item || null
                })));
                await window.api.marcarPedidoSincronizado(pedidoSnap.id);
            } catch(e) {
                console.warn('Pedido de mesa guardado local, sin sync al backend:', e);
            }
        }

        // Sumar puntos si hay cliente registrado en el pedido
        if (pedidoSnap.cliente_id) {
            const puntosGanados = await calcularPuntosGanados(totalSnap);
            if (puntosGanados > 0) {
                if (!modoConectado) {
                    await window.api.actualizarPuntosCliente(pedidoSnap.cliente_id, puntosGanados).catch(() => {});
                }
                syncLoyaltyBackend(pedidoSnap.cliente_id, { points_delta: puntosGanados });
                mostrarNotificacionExito(`+${puntosGanados} puntos acumulados`, 'Puntos');
            }
        }

        // Mostrar estado de éxito con botón de imprimir
        document.getElementById('cobrar-mesa-total').textContent = _fmtMesa(totalSnap);
        const footer = document.querySelector('#modal-cobrar-mesa .modal-footer');
        if (footer) {
            footer.innerHTML = `
                <button class="btn-secondary" onclick="_cerrarCobrarMesaFinal()">Cerrar</button>
                <button class="btn-primary" onclick="imprimirCuentaMesaFinal()">
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;margin-right:4px;"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect width="12" height="8" x="6" y="14"/></svg>
                    Imprimir ticket
                </button>`;
        }
        const body = document.querySelector('#modal-cobrar-mesa .modal-body');
        if (body) {
            const metodosLabel = { efectivo: 'Efectivo', tarjeta: 'Tarjeta', transferencia: 'Transferencia' };
            body.innerHTML = `
                <div style="text-align:center;padding:8px 0;">
                    <div style="font-size:2.5em;margin-bottom:6px;">✓</div>
                    <div style="font-weight:700;font-size:1.1em;color:#16a34a;margin-bottom:4px;">¡Cobrado!</div>
                    <div style="font-size:1.8em;font-weight:700;">${_fmtMesa(totalSnap)}</div>
                    <div style="color:#6b7280;font-size:0.9em;margin-top:4px;">${metodosLabel[metodo] || metodo}</div>
                </div>`;
        }
        document.querySelector('#modal-cobrar-mesa .modal-header h2').textContent = 'Pago completado';

        // Guardar snapshot para imprimir
        // La propina entra al snapshot para poder imprimirla en el ticket (BLOQUE 9).
        _cobroMesaSnap = { pedido: pedidoSnap, items: itemsSnap, total: totalSnap, metodo, propina: propinaSnap };

        cerrarPanelMesa();
        await cargarVistaMesas();
    } catch(e) {
        console.error('Error cobrando mesa:', e);
        mostrarNotificacionExito('Error al cobrar la mesa', 'Error');
    }
}

let _cobroMesaSnap = null;

function _cerrarCobrarMesaFinal() {
    _cobroMesaSnap = null; // Limpiar PRIMERO para romper el ciclo de recursión
    // Restaurar modal a su estado original
    const footer = document.querySelector('#modal-cobrar-mesa .modal-footer');
    if (footer) footer.innerHTML = `
        <button class="btn-secondary" onclick="cerrarModalCobrarMesa()">Cancelar</button>
        <button class="btn-primary" onclick="confirmarCobrarMesa()">Cobrar</button>`;
    const body = document.querySelector('#modal-cobrar-mesa .modal-body');
    if (body) body.innerHTML = `
        <div style="text-align:center;margin-bottom:16px;">
            <div style="font-size:0.9em;color:#6b7280;margin-bottom:4px;">Total a cobrar</div>
            <div id="cobrar-mesa-total" style="font-size:2em;font-weight:700;color:#111827;">$0.00</div>
        </div>
        <div class="form-group">
            <label>Método de pago</label>
            <select id="cobrar-mesa-metodo" style="width:100%;padding:8px;border:1px solid #d1d5db;border-radius:6px;font-size:1em;box-sizing:border-box;">
                <option value="efectivo">Efectivo</option>
                <option value="tarjeta">Tarjeta</option>
                <option value="transferencia">Transferencia</option>
            </select>
        </div>`;
    const h2 = document.querySelector('#modal-cobrar-mesa .modal-header h2');
    if (h2) h2.textContent = 'Cobrar mesa';
    // Ocultar directamente sin llamar cerrarModalCobrarMesa() para evitar recursión
    document.getElementById('modal-cobrar-mesa').classList.add('hidden');
}

async function imprimirCuentaMesaFinal() {
    if (!_cobroMesaSnap) return;
    const { pedido, items, total, metodo, propina } = _cobroMesaSnap;
    const ajustes = await window.api.obtenerAjustes();
    const negocio = ajustes.nombre_negocio || 'Negocio';
    const impresora = ajustes.impresora || '';
    const ahora = new Date().toLocaleString('es-MX');
    const metodosLabel = { efectivo: 'Efectivo', tarjeta: 'Tarjeta', transferencia: 'Transferencia' };
    const itemsHtml = items.map(it =>
        `<tr><td>${it.cantidad}× ${esc(it.nombre)}${resumenModificadores(it.modificadores) ? `<br><span style="color:#555;font-size:0.92em">${esc(resumenModificadores(it.modificadores))}</span>` : ''}${it.nota_item ? ` <span style="color:#888">(${esc(it.nota_item)})</span>` : ''}</td><td style="text-align:right">${_fmtMesa(it.subtotal)}</td></tr>`
    ).join('');
    const html = `<html><head><style>
        body{font-family:monospace;font-size:12px;width:300px;margin:0;padding:8px;}
        h1{font-size:13px;text-align:center;margin:4px 0;}
        .centro{text-align:center;}
        .linea{border-top:1px dashed #000;margin:6px 0;}
        table{width:100%;border-collapse:collapse;}
        td{padding:1px 0;}
        .total{font-weight:bold;font-size:13px;}
    </style></head><body>
        <h1>${esc(negocio)}</h1>
        <div class="linea"></div>
        <div class="centro"><b>TICKET DE VENTA</b></div>
        ${pedido.notas_generales ? `<div class="centro" style="font-size:11px;color:#666;">${esc(pedido.notas_generales)}</div>` : ''}
        <div class="linea"></div>
        <table>${itemsHtml}</table>
        <div class="linea"></div>
        <table>
            <tr><td class="total">TOTAL</td><td style="text-align:right" class="total">${_fmtMesa(total)}</td></tr>
            ${(propina || 0) > 0 ? `<tr><td>Propina</td><td style="text-align:right">${_fmtMesa(propina)}</td></tr>
            <tr><td class="total">TOTAL PAGADO</td><td style="text-align:right" class="total">${_fmtMesa(total + propina)}</td></tr>` : ''}
            <tr><td style="color:#555;">Pago</td><td style="text-align:right;color:#555;">${metodosLabel[metodo] || metodo}</td></tr>
        </table>
        <div class="linea"></div>
        <div class="centro" style="font-size:11px;">Impreso: ${ahora}</div>
    </body></html>`;
    try {
        await window.api.imprimirTicket(html, impresora);
    } catch(e) {
        console.error('Error imprimiendo ticket:', e);
    }
}

// ---- Modal Transferir ----

function abrirModalTransferirMesa() {
    if (!_pedidoMesaActivo) return;
    const libres = _mesasData.filter(m => m.id !== _mesaActivaId && !_pedidosMesa[m.id]);
    const el = document.getElementById('transferir-mesas-lista');
    if (libres.length === 0) {
        el.innerHTML = `<div style="text-align:center;padding:16px;color:#9ca3af;">No hay mesas libres disponibles.</div>`;
    } else {
        el.innerHTML = libres.map(m =>
            `<button onclick="confirmarTransferirMesa(${m.id})" class="btn-secondary"
                style="text-align:left;padding:10px 14px;">
                <b>${esc(m.nombre)}</b> <span style="color:#6b7280;font-size:0.85em;">${esc(m.zona || 'General')} · ${svgIconHTML('users', 14, '#6b7280')} ${m.capacidad}</span>
            </button>`
        ).join('');
    }
    document.getElementById('modal-transferir-mesa').classList.remove('hidden');
}

function cerrarModalTransferirMesa() {
    document.getElementById('modal-transferir-mesa').classList.add('hidden');
}

async function confirmarTransferirMesa(nueva_mesa_id) {
    if (!_pedidoMesaActivo) return;
    try {
        await window.api.transferirMesa(_pedidoMesaActivo.id, nueva_mesa_id);
        cerrarModalTransferirMesa();
        cerrarPanelMesa();
        mostrarNotificacionExito('Pedido transferido', '¡Listo!');
        await cargarVistaMesas();
    } catch(e) {
        console.error('Error transfiriendo mesa:', e);
        mostrarNotificacionExito('Error al transferir', 'Error');
    }
}

// ---- Configurar Mesas ----

async function abrirModalConfigurarMesas() {
    await _cargarConfigMesas();
    document.getElementById('modal-configurar-mesas').classList.remove('hidden');
}

function cerrarModalConfigurarMesas() {
    document.getElementById('modal-configurar-mesas').classList.add('hidden');
    cargarVistaMesas();
}

async function _cargarConfigMesas() {
    // Configurar mesas siempre trabaja sobre la sucursal de ESTE equipo: se crean
    // y editan las mesas del local donde está la caja, no las que se estén mirando.
    const raw = (modoConectado && apiClient && tokenActual)
        ? await apiClient.getTables(sucursalIdActual)
        : await window.api.obtenerMesas(sucursalIdActual);
    const todasMesas = (modoConectado && apiClient && tokenActual) ? _normalizarMesasApi(raw) : raw;
    const el = document.getElementById('config-mesas-lista');
    if (!el) return;
    if (todasMesas.length === 0) {
        el.innerHTML = `<div style="text-align:center;padding:16px;color:#9ca3af;">Aún no hay mesas creadas.</div>`;
        return;
    }
    el.innerHTML = todasMesas.map(m => `
        <div style="display:flex;align-items:center;gap:8px;padding:8px 0;border-bottom:1px solid #f3f4f6;">
            <div style="flex:1;">
                <span style="font-weight:600;">${esc(m.nombre)}</span>
                <span style="color:#6b7280;font-size:0.85em;margin-left:8px;">${esc(m.zona || 'General')} · ${svgIconHTML('users', 14, '#6b7280')} ${m.capacidad}</span>
            </div>
            <button class="btn-secondary" style="padding:4px 10px;font-size:0.8em;"
                onclick="_eliminarMesaConfig(${m.id}, '${esc(m.nombre || '')}')">Eliminar</button>
        </div>
    `).join('');
}

async function crearMesaConfig() {
    const nombre = document.getElementById('config-mesa-nombre').value.trim();
    const zona   = document.getElementById('config-mesa-zona').value.trim() || 'General';
    const cap    = parseInt(document.getElementById('config-mesa-capacidad').value) || 4;
    if (!nombre) { mostrarNotificacionExito('Escribe un nombre para la mesa', 'Error'); return; }
    try {
        if (modoConectado && apiClient && tokenActual) {
            await apiClient.createTable({ name: nombre, zone: zona, capacity: cap, branch_id: sucursalIdActual || undefined });
        } else {
            await window.api.crearMesa(nombre, zona, cap, sucursalIdActual);
        }
        document.getElementById('config-mesa-nombre').value = '';
        await _cargarConfigMesas();
        mostrarNotificacionExito(`Mesa "${nombre}" creada`, '¡Listo!');
    } catch(e) {
        console.error('Error creando mesa:', e);
        mostrarNotificacionExito('Error al crear la mesa', 'Error');
    }
}

async function _eliminarMesaConfig(id, nombre) {
    if (!(await confirmarZenit(`Se eliminará la mesa "${nombre}".`, '¿Eliminar mesa?', { textoOk: 'Eliminar', peligro: true }))) return;
    try {
        if (modoConectado && apiClient && tokenActual) {
            await apiClient.deleteTable(id);
        } else {
            await window.api.eliminarMesa(id);
        }
        await _cargarConfigMesas();
        mostrarNotificacionExito(`Mesa eliminada`, '¡Listo!');
    } catch(e) {
        mostrarNotificacionExito('Error al eliminar la mesa', 'Error');
    }
}
