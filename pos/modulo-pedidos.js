// ============================================
// MÓDULO: Historial de Pedidos
// ============================================

async function cargarPedidos() {
    const contenedor = document.getElementById('lista-pedidos');
    if (!contenedor) return;

    contenedor.innerHTML = '<tr><td colspan="7" style="text-align:center;">Cargando pedidos...</td></tr>';

    try {
        const resultado = await obtenerPedidosWrapper({ ...filtroActual, pagina: paginaPedidos, limite: 50 });
        const pedidos = resultado.data || [];
        const pag = resultado.pagination || {};

        if (resultado._backendError) {
            contenedor.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:20px;color:#dc2626;">Error de conexión con el servidor. Tus pedidos están guardados en la nube, revisa tu conexión e intenta de nuevo.</td></tr>';
            return;
        }
        if (pedidos.length === 0 && paginaPedidos === 1) {
            contenedor.innerHTML = '<tr><td colspan="7" style="text-align:center; padding: 20px;">No hay ventas registradas todavía.</td></tr>';
            renderizarControlPaginacion(pag);
            return;
        }

        // Limpiamos y llenamos la tabla
        contenedor.innerHTML = '';

        pedidos.forEach(p => {
    // FIX PARA FECHA: Si la fecha existe, reemplazamos el espacio por una 'T'
    // para que el formato sea ISO (ej: 2023-10-25T14:30:00) y JS lo entienda.
    let fechaTxt = "Sin fecha";
    if (p.fecha) {
        const fechaISO = p.fecha.replace(" ", "T");
        const objFecha = new Date(fechaISO);
        if (!isNaN(objFecha)) {
            fechaTxt = objFecha.toLocaleString('es-MX', {
                dateStyle: 'short',
                timeStyle: 'short'
            });
        }
    }

    const fila = document.createElement('tr');
    fila.innerHTML = `
        <td><strong>#${p.id}</strong></td>
        <td style="font-size:13px;color:var(--text-muted);">${esc(p.cajero || '—')}</td>
        <td>${esc(p.telefono || 'General')}</td>
        <td>${fechaTxt}</td>
        <td style="text-transform: capitalize;">${esc(p.metodo_pago)}</td>
        <td><strong>$${parseFloat(p.total).toFixed(2)}</strong></td>
        <td>${renderizarEstadoPedido(p.id, p.estado)}</td>
        <td>
            <button class="btn-secondary small" onclick="verDetallePedido(${p.id}, '${esc(p.telefono || 'General')}', ${p.total}, '${esc(p.metodo_pago)}')" style="display:inline-flex; align-items:center; gap:5px;">
    <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0"/><circle cx="12" cy="12" r="3"/></svg>
    Ver
</button>
<button class="btn-icon" onclick="imprimirTicket(${p.id})" title="Imprimir ticket" style="margin-left: 5px; display:inline-flex; align-items:center;">
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><path d="M6 9V3a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v6"/><rect x="6" y="14" width="12" height="8" rx="1"/></svg>
</button>
        </td>
    `;
    contenedor.appendChild(fila);
});

        renderizarControlPaginacion(pag);
        renderizarResumenPedidos(resultado.resumen);

    } catch (error) {
        console.error("Error al cargar pedidos:", error);
        contenedor.innerHTML = '<tr><td colspan="7" style="text-align:center; color:red;">Error al cargar los datos.</td></tr>';
    }
}

function renderizarResumenPedidos(resumen) {
    const el = document.getElementById('resumen-pedidos');
    if (!el) return;
    const r = resumen || { total_pedidos: 0, total_ventas: 0, efectivo: 0, tarjeta: 0, transferencia: 0 };
    const f = (v) => '$' + parseFloat(v || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const tarjeta = (r.tarjeta || 0) + (r.debito || 0) + (r.credito || 0);
    const card = (icono, label, valor, color) =>
        `<div style="display:flex;flex-direction:column;align-items:center;background:${color};border-radius:8px;padding:8px 16px;min-width:110px;gap:2px;">
            <span style="font-size:0.75em;color:#6b7280;font-weight:500;">${icono} ${label}</span>
            <span style="font-size:1.05em;font-weight:700;color:#111827;">${valor}</span>
        </div>`;
    let html = card('📋', 'Pedidos', r.total_pedidos, '#e5e7eb')
             + card('💰', 'Total', f(r.total_ventas), '#bbf7d0')
             + card('💵', 'Efectivo', f(r.efectivo), '#fde68a');
    if (tarjeta > 0) html += card('💳', 'Tarjeta', f(tarjeta), '#bfdbfe');
    if ((r.transferencia || 0) > 0) html += card('🏦', 'Transferencia', f(r.transferencia), '#ddd6fe');
    el.innerHTML = html;
    el.style.display = 'flex';
}

function aplicarFiltrosPedidos() {
    const nuevo = {
        date_from:   document.getElementById('filtro-fecha-desde')?.value || undefined,
        date_to:     document.getElementById('filtro-fecha-hasta')?.value || undefined,
        metodo_pago: document.getElementById('filtro-metodo')?.value || undefined,
        status:      document.getElementById('filtro-estado')?.value || undefined,
    };
    filtroActual = Object.fromEntries(Object.entries(nuevo).filter(([, v]) => v));
    paginaPedidos = 1;
    cargarPedidos();
}

function limpiarFiltrosPedidos() {
    filtroActual = {};
    paginaPedidos = 1;
    ['filtro-fecha-desde', 'filtro-fecha-hasta', 'filtro-metodo', 'filtro-estado']
        .forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
    cargarPedidos();
}

function filtroRapido(tipo) {
    const hoy = new Date();
    const pad = n => String(n).padStart(2, '0');
    const fmt = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
    const hasta = fmt(hoy);
    let desde;
    if (tipo === 'hoy') {
        desde = hasta;
    } else if (tipo === 'semana') {
        const inicio = new Date(hoy);
        const dia = hoy.getDay();
        inicio.setDate(hoy.getDate() - (dia === 0 ? 6 : dia - 1)); // lunes de esta semana
        desde = fmt(inicio);
    } else if (tipo === 'mes') {
        desde = `${hoy.getFullYear()}-${pad(hoy.getMonth()+1)}-01`;
    }
    const inputDesde = document.getElementById('filtro-fecha-desde');
    const inputHasta = document.getElementById('filtro-fecha-hasta');
    if (inputDesde) inputDesde.value = desde;
    if (inputHasta) inputHasta.value = hasta;
    aplicarFiltrosPedidos();
}

async function exportarCSV() {
    try {
        const resultado = await obtenerPedidosWrapper({ ...filtroActual, limite: 10000, pagina: 1 });
        const filas = resultado.data || resultado;
        if (!filas || filas.length === 0) { alertaZenit('No hay pedidos para exportar con los filtros actuales.'); return; }

        const cabecera = ['ID', 'Cajero', 'Cliente', 'Fecha', 'Método de Pago', 'Total', 'Estado'];
        const lineas = filas.map(p => {
            const fecha = p.fecha ? new Date(p.fecha.replace(' ', 'T')).toLocaleString('es-MX') : '';
            return [
                p.id,
                p.cajero || '',
                (p.telefono || 'General').replace(/,/g, ' '),
                fecha,
                p.metodo_pago || '',
                parseFloat(p.total || 0).toFixed(2),
                p.estado || ''
            ].join(',');
        });

        const csv = [cabecera.join(','), ...lineas].join('\n');
        const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `ventas_${new Date().toISOString().slice(0, 10)}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    } catch (e) {
        console.error('Error al exportar CSV:', e);
        alertaZenit('Error al exportar. Intenta de nuevo.');
    }
}

async function calcularAlertasWrapper() {
    let alertas = [];
    try {
        if (apiClient && apiClient.token) {
            const res = await apiClient.getAlerts();
            alertas = res.alertas || [];
        } else {
            alertas = await window.api.calcularAlertas();
        }
    } catch (e) {
        try { alertas = await window.api.calcularAlertas(); } catch (e2) { alertas = []; }
    }
    renderizarAlertas(alertas);
}

function renderizarAlertas(alertas) {
    const container = document.getElementById('alertas-stock-list') || document.getElementById('alertas-dashboard');
    if (!container) return;
    if (!alertas || alertas.length === 0) {
        container.innerHTML = `<p style="color:#10b981;font-size:0.85em;">${svgIconHTML('circle-check', 14, '#10b981')} Sin alertas activas</p>`;
        return;
    }
    const colores = {
        peligro:    { bg: '#fee2e2', border: '#ef4444', texto: '#991b1b' },
        advertencia:{ bg: '#fef3c7', border: '#f59e0b', texto: '#92400e' },
        info:       { bg: '#dbeafe', border: '#3b82f6', texto: '#1e40af' }
    };
    container.innerHTML = alertas.map(a => {
        const c = colores[a.nivel] || colores.info;
        return `<div style="display:flex;align-items:center;gap:10px;padding:8px 12px;border-radius:8px;margin-bottom:6px;background:${c.bg};border-left:3px solid ${c.border};color:${c.texto};font-size:0.85em;">
            <span style="font-size:1.1em;flex-shrink:0;">${a.icono}</span>
            <span>${esc(a.mensaje)}</span>
        </div>`;
    }).join('');
}

function renderizarControlPaginacion(pag) {
    let ctrl = document.getElementById('ctrl-paginacion-pedidos');
    if (!ctrl) {
        const wrapper = document.querySelector('#view-pedidos .table-wrapper');
        if (!wrapper) return;
        ctrl = document.createElement('div');
        ctrl.id = 'ctrl-paginacion-pedidos';
        ctrl.style.cssText = 'display:flex;align-items:center;justify-content:flex-end;gap:10px;padding:12px 16px;border-top:1px solid var(--border-color, #e5e7eb);font-size:0.9em;';
        wrapper.after(ctrl);
    }

    const total = pag.total || 0;
    const paginas = pag.pages || pag.paginas || 1;
    const pagActual = pag.page || pag.pagina || 1;
    const limite = pag.limit || pag.limite || 50;
    const desde = total === 0 ? 0 : (pagActual - 1) * limite + 1;
    const hasta = Math.min(pagActual * limite, total);

    ctrl.innerHTML = `
        <span style="color:var(--text-muted,#6b7280);">${desde}–${hasta} de ${total}</span>
        <button onclick="cambiarPaginaPedidos(-1)" ${pagActual <= 1 ? 'disabled' : ''} class="btn-secondary small" style="padding:4px 10px;">← Anterior</button>
        <button onclick="cambiarPaginaPedidos(1)" ${pagActual >= paginas ? 'disabled' : ''} class="btn-secondary small" style="padding:4px 10px;">Siguiente →</button>
    `;
}

function cambiarPaginaPedidos(delta) {
    paginaPedidos = Math.max(1, paginaPedidos + delta);
    cargarPedidos();
}

function renderizarEstadoPedido(pedidoId, estadoActual) {
    const estados = {
        'registrado':    { color: '#10b981', bg: '#d1fae5', texto: 'Registrado' },
        'en_preparacion':{ color: '#f59e0b', bg: '#fef3c7', texto: 'En preparación' },
        'completado':    { color: '#3b82f6', bg: '#dbeafe', texto: 'Completado' },
        'entregado':     { color: '#6366f1', bg: '#e0e7ff', texto: 'Entregado' },
        'cancelado':     { color: '#ef4444', bg: '#fee2e2', texto: 'Cancelado' }
    };

    const estado = estados[estadoActual] || estados['registrado'];

    return `
        <select onchange="cambiarEstadoPedido(${pedidoId}, this.value, this)"
                style="background: ${estado.bg}; color: ${estado.color}; border: 1px solid ${estado.color};
                       padding: 4px 8px; border-radius: 12px; font-size: 0.8em; font-weight: 600; cursor: pointer;">
            <option value="registrado"     ${estadoActual === 'registrado'     ? 'selected' : ''}>🟢 Registrado</option>
            <option value="en_preparacion" ${estadoActual === 'en_preparacion' ? 'selected' : ''}>🟡 En preparación</option>
            <option value="completado"     ${estadoActual === 'completado'     ? 'selected' : ''}>🔵 Completado</option>
            <option value="entregado"      ${estadoActual === 'entregado'      ? 'selected' : ''}>🟣 Entregado</option>
            <option value="cancelado"      ${estadoActual === 'cancelado'      ? 'selected' : ''}>🔴 Cancelado</option>
        </select>
    `;
}

async function _cambiarEstadoPedidoBase(pedidoId, nuevoEstado, selectElement) {
    try {
        await window.api.actualizarEstadoPedido(pedidoId, nuevoEstado);

        // Actualizar el color del select en tiempo real
        const estados = {
            'registrado':    { color: '#10b981', bg: '#d1fae5' },
            'en_preparacion':{ color: '#f59e0b', bg: '#fef3c7' },
            'completado':    { color: '#3b82f6', bg: '#dbeafe' },
            'entregado':     { color: '#6366f1', bg: '#e0e7ff' },
            'cancelado':     { color: '#ef4444', bg: '#fee2e2' }
        };

        const estado = estados[nuevoEstado];
        selectElement.style.background = estado.bg;
        selectElement.style.color = estado.color;
        selectElement.style.borderColor = estado.color;

        mostrarNotificacionExito(`Estado actualizado a: ${nuevoEstado}`, '¡Estado Actualizado!');
    } catch (error) {
        console.error("Error al cambiar estado:", error);
        alertaZenit("Error al actualizar el estado");
        cargarPedidos();
    }
}
async function verDetallePedido(id, cliente, total, metodo) {
    document.getElementById('detalle-titulo').innerText = `Pedido #${id}`;
    document.getElementById('detalle-info-cliente').innerText = `Cliente: ${cliente}`;
    document.getElementById('detalle-total').innerText = `$${total.toFixed(2)}`;
    document.getElementById('detalle-metodo').innerText = metodo;

    const lista = document.getElementById('detalle-lista-productos');
    lista.innerHTML = 'Cargando detalles...';

    try {
        const productos = await obtenerDetallePedidoWrapper(id);
        lista.innerHTML = productos.map(item => `
            <div class="item-detalle">
                <div class="info-prod">
                    <span><strong>${item.cantidad || 1}x</strong> ${esc(item.nombre)}</span>
                    ${item.nota ? `<span class="nota-prod">Nota: ${esc(item.nota)}</span>` : ''}
                </div>
                <span>$${(item.precio * (item.cantidad || 1)).toFixed(2)}</span>
            </div>
        `).join('');

        document.getElementById('modalDetallePedido').classList.remove('hidden');
    } catch (error) {
        console.error("Error al obtener detalles:", error);
        alertaZenit("No se pudieron cargar los productos del pedido.");
    }
}

function cerrarModalDetalle() {
    document.getElementById('modalDetallePedido').classList.add('hidden');
}

// --- Integración: Cancelar pedido con PIN ---
async function cambiarEstadoPedido(pedidoId, nuevoEstado, selectElement) {
    if (nuevoEstado === 'cancelado' && modoConectado && apiClient && tokenActual) {
        pedirPinEmpleado(
            `Cancelar pedido #${pedidoId}. Esta acción quedará registrada. Ingresa tu PIN para confirmar.`,
            async (employeeId, pin, employeeName, employeeRole) => {
                try {
                    if (employeeId) {
                        await apiClient.cancelOrder(pedidoId, employeeId, null, employeeName || '');
                    } else {
                        await window.api.actualizarEstadoPedido(pedidoId, 'cancelado');
                    }
                    if (selectElement) {
                        selectElement.style.background  = '#fee2e2';
                        selectElement.style.color       = '#ef4444';
                        selectElement.style.borderColor = '#ef4444';
                    }
                    mostrarNotificacionExito(`Pedido #${pedidoId} cancelado`, '¡Cancelado!');
                    cargarPedidos();
                } catch(e) {
                    alertaZenit('Error al cancelar: ' + (e.message || 'Error desconocido'));
                    cargarPedidos();
                }
            }
        );
        return;
    }
    return _cambiarEstadoPedidoBase(pedidoId, nuevoEstado, selectElement);
}
