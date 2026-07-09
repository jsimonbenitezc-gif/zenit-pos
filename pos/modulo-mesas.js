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

const _fmtMesa = (v) => '$' + parseFloat(v || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

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
            nombre:         p[6] || 'Producto'
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

function _normalizarPedidoApi(order) {
    if (!order) return null;
    const items_raw = (order.items || []).map(item =>
        [item.id, item.product?.id || 0, item.quantity,
         parseFloat(item.product?.price || 0),
         parseFloat(item.subtotal || 0),
         item.notes || '',
         item.product?.name || 'Producto'].join('|')
    ).join(';;');
    return {
        id: order.id,
        cliente_id: order.customer_id || null,
        total: parseFloat(order.total || 0),
        fecha_pedido: order.createdAt,
        comensales: order.guests || 0,
        notas_generales: order.notes || null,
        items_raw,
        _isApiOrder: true,
    };
}

async function cargarVistaMesas() {
    // Si el dueño está viendo otra sucursal en el dashboard, mostrar aviso
    if (sucursalVistaActual !== null && sucursalVistaActual !== sucursalIdActual) {
        const cont = document.getElementById('mesas-grid-container') || document.querySelector('#view-mesas .view-header');
        const aviso = document.getElementById('mesas-otra-sucursal-aviso');
        if (!aviso && cont) {
            const div = document.createElement('div');
            div.id = 'mesas-otra-sucursal-aviso';
            div.style.cssText = 'background:#fef9c3;border:1px solid #fde047;border-radius:8px;padding:12px 16px;margin:16px 20px;font-size:0.9em;color:#92400e;';
            div.textContent = 'Estás viendo el dashboard de otra sucursal. Las mesas mostradas pertenecen a este dispositivo.';
            cont.parentElement.insertBefore(div, cont);
        }
    } else {
        const aviso = document.getElementById('mesas-otra-sucursal-aviso');
        if (aviso) aviso.remove();
    }
    try {
        if (modoConectado && apiClient && tokenActual) {
            const tables = await apiClient.getTables();
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
    document.getElementById('modal-abrir-mesa').classList.add('hidden');
}

async function confirmarAbrirMesa() {
    if (!_mesaActivaId) return;
    const comensales = parseInt(document.getElementById('mesa-comensales').value) || 1;
    const notas = document.getElementById('mesa-notas-apertura').value.trim();
    try {
        const mesaAbrir = _mesasData.find(m => m.id === _mesaActivaId);
        if (modoConectado && apiClient && tokenActual) {
            const order = await apiClient.openTableOrder(_mesaActivaId, comensales, notas || null, sucursalIdActual);
            _pedidosMesa[_mesaActivaId] = _normalizarPedidoApi(order);
        } else {
            await window.api.abrirPedidoMesa(_mesaActivaId, mesaAbrir?.nombre || '', nombreActivo || 'Cajero', comensales, notas || null);
        }
        cerrarModalAbrirMesa();
        await cargarVistaMesas();
        // Abrir panel de la mesa recién abierta
        abrirPanelMesa(_mesaActivaId);
    } catch(e) {
        console.error('Error abriendo mesa:', e);
        mostrarNotificacionExito('Error al abrir la mesa', 'Error');
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
    const total = items.reduce((s, i) => s + i.subtotal, 0);
    el.innerHTML = items.map(it => `
        <div style="display:flex;align-items:center;gap:8px;padding:8px 16px;border-bottom:1px solid #f3f4f6;">
            <div style="flex:1;min-width:0;">
                <div style="font-size:0.9em;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${esc(it.nombre)}</div>
                ${it.nota_item ? `<div style="font-size:0.75em;color:#6b7280;">${esc(it.nota_item)}</div>` : ''}
                <div style="font-size:0.8em;color:#6b7280;">${it.cantidad} × ${_fmtMesa(it.precio_unitario)}</div>
            </div>
            <div style="font-weight:600;font-size:0.9em;">${_fmtMesa(it.subtotal)}</div>
            <button onclick="eliminarItemDeMesa(${it.id})" title="Eliminar"
                style="background:none;border:none;cursor:pointer;color:#ef4444;padding:4px;flex-shrink:0;">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
            </button>
        </div>
    `).join('') + `<div style="padding:8px 16px;text-align:right;font-weight:700;font-size:1em;border-top:2px solid #e5e7eb;margin-top:4px;">
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
        items: items.map(i => ({ nombre: i.nombre, cantidad: i.cantidad, notas: i.nota_item || '' }))
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
        const en_carrito = _carritoMesa[p.id]?.cantidad || 0;
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

function _toggleProductoMesa(id, nombre, precio) {
    if (!_carritoMesa[id]) _carritoMesa[id] = { nombre, precio, cantidad: 0 };
    _carritoMesa[id].cantidad++;
    _actualizarResumenCarritoMesa();
    filtrarProductosMesa(document.getElementById('mesa-prod-busqueda')?.value || '');
}

function _quitarProductoMesa(id) {
    if (!_carritoMesa[id]) return;
    _carritoMesa[id].cantidad--;
    if (_carritoMesa[id].cantidad <= 0) delete _carritoMesa[id];
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
            ${items.map(([id, item]) => `
                <div style="display:flex;align-items:center;gap:5px;padding:3px 0;border-bottom:1px solid #f3f4f6;">
                    <span style="flex:1;font-size:0.82em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${esc(item.nombre)}</span>
                    <button onclick="_quitarProductoMesa(${id})" title="Quitar uno"
                        style="width:22px;height:22px;border:1px solid #fca5a5;border-radius:4px;background:#fef2f2;cursor:pointer;font-size:14px;color:#ef4444;line-height:1;flex-shrink:0;">−</button>
                    <span style="min-width:18px;text-align:center;font-weight:700;font-size:0.85em;">${item.cantidad}</span>
                    <button onclick="_toggleProductoMesa(${id}, '${esc(item.nombre)}', ${item.precio})" title="Agregar uno"
                        style="width:22px;height:22px;border:1px solid #a5b4fc;border-radius:4px;background:#eef2ff;cursor:pointer;font-size:14px;color:#4f46e5;line-height:1;flex-shrink:0;">+</button>
                    <span style="font-size:0.82em;color:#6b7280;min-width:52px;text-align:right;">${_fmtMesa(item.precio * item.cantidad)}</span>
                </div>
            `).join('')}
        </div>
        <div style="text-align:right;font-weight:700;font-size:0.88em;color:#374151;">Total: ${_fmtMesa(total)}</div>
    `;
}

async function confirmarAgregarProductosMesa() {
    if (!_pedidoMesaActivo) return;
    const items = Object.entries(_carritoMesa).filter(([,v]) => v.cantidad > 0);
    if (items.length === 0) { cerrarModalAgregarProductosMesa(); return; }
    try {
        // `updated` declarado aquí (fuera del if) para que esté en scope al marcar el tracker
        let updated = null;
        if (modoConectado && apiClient && tokenActual) {
            const apiItems = items.map(([prod_id, item]) => ({
                product_id: parseInt(prod_id),
                quantity: item.cantidad,
            }));
            updated = await apiClient.addItemsToOrder(_pedidoMesaActivo.id, apiItems);
            // Marcar inmediatamente (antes de kdsNuevoPedido) para que el polling no reenvíe
            _kdsMarcarEnviado(updated.id, updated.updatedAt, updated.items);
            _pedidosMesa[_mesaActivaId] = _normalizarPedidoApi(updated);
        } else {
            for (const [prod_id, item] of items) {
                await window.api.agregarItemMesa(_pedidoMesaActivo.id, parseInt(prod_id), item.cantidad, item.precio, null);
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
            items: items.map(([, item]) => ({ nombre: item.nombre, cantidad: item.cantidad, notas: '' }))
        }).catch(() => {});
        mostrarNotificacionExito('Comanda enviada a cocina', 'Enviado');
        // Refrescar badges de stock tras descontar insumos (local e inmediato, sin esperar SSE)
        _refrescarStockBadges();
    } catch(e) {
        console.error('Error agregando productos a mesa:', e);
        mostrarNotificacionExito('Error al agregar productos', 'Error');
    }
}

// ---- Imprimir cuenta ----

async function imprimirCuentaMesa() {
    if (!_pedidoMesaActivo) return;
    const mesa = _mesasData.find(m => m.id === _mesaActivaId);
    const items = _parsearItemsMesa(_pedidoMesaActivo.items_raw);
    const total = items.reduce((s, i) => s + i.subtotal, 0);
    const ajustes = await window.api.obtenerAjustes();
    const negocio = ajustes.nombre_negocio || 'Negocio';
    const impresora = ajustes.impresora || '';
    const ahora = new Date().toLocaleString('es-MX');
    const itemsHtml = items.map(it =>
        `<tr><td>${it.cantidad}× ${esc(it.nombre)}</td><td style="text-align:right">${_fmtMesa(it.subtotal)}</td></tr>`
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

async function abrirModalCobrarMesa() {
    if (!_pedidoMesaActivo) return;
    const items = _parsearItemsMesa(_pedidoMesaActivo.items_raw);
    const total = items.reduce((s, i) => s + i.subtotal, 0);
    document.getElementById('cobrar-mesa-total').textContent = _fmtMesa(total);
    document.getElementById('cobrar-mesa-metodo').value = 'efectivo';
    document.getElementById('modal-cobrar-mesa').classList.remove('hidden');

    // Mostrar puntos a ganar si el sistema está activo
    try {
        const aj = await window.api.obtenerAjustes();
        const elPts = document.getElementById('cobrar-mesa-puntos-info');
        if (elPts) {
            if (aj.puntos_activos === 'true') {
                const pts = await calcularPuntosGanados(total);
                elPts.innerHTML = `${svgIconHTML('star', 14, '#f59e0b')} Esta compra genera ${pts} puntos`;
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

async function confirmarCobrarMesa() {
    if (!_pedidoMesaActivo) return;
    const metodo = document.getElementById('cobrar-mesa-metodo').value;
    const pedidoSnap = { ..._pedidoMesaActivo };
    const itemsSnap  = _parsearItemsMesa(_pedidoMesaActivo.items_raw);
    const totalSnap  = itemsSnap.reduce((s, i) => s + i.subtotal, 0);
    try {
        if (modoConectado && apiClient && tokenActual) {
            await apiClient.closeTableOrder(pedidoSnap.id, metodo);
        } else {
            await window.api.cerrarPedidoMesa(pedidoSnap.id, metodo);

            // Sincronizar al backend si está conectado (modo local con sync)
            try {
                await apiClient?.createOrder({
                    total: totalSnap,
                    payment_method: metodo,
                    order_type: 'comer',
                    notes: pedidoSnap.notas_generales || null,
                    customer_temp_info: pedidoSnap.info_cliente_temp || null,
                    status: 'completado'
                }, itemsSnap.map(it => ({
                    product_id: it.producto_id,
                    quantity: it.cantidad,
                    unit_price: it.precio_unitario,
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
        _cobroMesaSnap = { pedido: pedidoSnap, items: itemsSnap, total: totalSnap, metodo };

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
    const { pedido, items, total, metodo } = _cobroMesaSnap;
    const ajustes = await window.api.obtenerAjustes();
    const negocio = ajustes.nombre_negocio || 'Negocio';
    const impresora = ajustes.impresora || '';
    const ahora = new Date().toLocaleString('es-MX');
    const metodosLabel = { efectivo: 'Efectivo', tarjeta: 'Tarjeta', transferencia: 'Transferencia' };
    const itemsHtml = items.map(it =>
        `<tr><td>${it.cantidad}× ${esc(it.nombre)}${it.nota_item ? ` <span style="color:#888">(${esc(it.nota_item)})</span>` : ''}</td><td style="text-align:right">${_fmtMesa(it.subtotal)}</td></tr>`
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
    const raw = (modoConectado && apiClient && tokenActual)
        ? await apiClient.getTables()
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
            await apiClient.createTable({ name: nombre, zone: zona, capacity: cap });
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
