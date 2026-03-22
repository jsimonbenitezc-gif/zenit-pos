// ============================================
// MÓDULO: Turnos / Corte de Caja
// ============================================

// ─── Helpers turno: cloud si está conectado, local si no ─────────────────────
async function _turnoGetActivo() {
    if (modoConectado && apiClient) return apiClient.getTurnoActivo(sucursalIdActual).catch(() => null);
    return window.api.obtenerTurnoActivo();
}
async function _turnoGetTotales(apertura, turnoId) {
    if (modoConectado && apiClient && turnoId) return apiClient.getTurnoTotales(turnoId);
    return window.api.calcularTotalesTurno(apertura);
}
async function _turnoAbrir(nombre, rol, fondo) {
    if (modoConectado && apiClient) return apiClient.abrirTurno(nombre, rol, fondo, sucursalIdActual);
    return window.api.abrirTurno(nombre, rol, fondo);
}
async function _turnoCerrar(id, contado, notas) {
    if (modoConectado && apiClient) return apiClient.cerrarTurno(id, contado, notas);
    return window.api.cerrarTurno(id, contado, notas);
}
async function _turnoGetHistorial() {
    if (modoConectado && apiClient) return apiClient.getHistorialTurnos(sucursalIdActual).catch(() => []);
    return window.api.obtenerTurnos();
}
// ─────────────────────────────────────────────────────────────────────────────

async function inicializarTurno() {
    turnoActivo = await _turnoGetActivo();
    // Si hay un turno activo, restaurar nombre del cajero
    if (turnoActivo) {
        nombreActivo = turnoActivo.cajero_nombre || '';
    }
    // rolActivo ya fue establecido por inicializarPerfil(), no sobreescribir
    aplicarPermisos();
    actualizarIndicadorTurnoSidebar();
}

async function aplicarPermisos() {
    if (rolActivo === 'dueno') {
        // El dueño ve todo — restaurar todos los botones
        document.querySelectorAll('.menu-item').forEach(btn => btn.classList.remove('hidden'));
        return;
    }
    let permisos;
    if (_permisosRolCache && _permisosRolCache[rolActivo]) {
        permisos = _permisosRolCache[rolActivo];
    } else {
        permisos = PERMISOS_DEFAULT[rolActivo] || {};
        try {
            const ajustes = await window.api.obtenerAjustes();
            const guardados = JSON.parse(ajustes.permisos_roles || '{}');
            let efectivos;
            if (sucursalIdActual && guardados[`__b_${sucursalIdActual}`]) {
                efectivos = guardados[`__b_${sucursalIdActual}`];
            } else {
                efectivos = Object.fromEntries(Object.entries(guardados).filter(([k]) => !k.startsWith('__b_')));
            }
            if (efectivos[rolActivo]) permisos = { ...permisos, ...efectivos[rolActivo] };
        } catch(e) { /* usa defaults */ }
    }

    const mapa = {
        ver_dashboard:   'dashboard',
        ver_nueva_venta: 'nueva-venta',
        ver_pedidos:     'pedidos',
        ver_turno:       'turno',
        ver_mesas:       'mesas',
        ver_productos:   'productos',
        ver_clientes:    'clientes',
        ver_ofertas:     'ofertas',
        ver_inventario:  'inventario',
        ver_ajustes:     'ajustes'
    };

    // Restaurar todos primero
    document.querySelectorAll('.menu-item').forEach(btn => btn.classList.remove('hidden'));

    // Ocultar según permisos
    Object.entries(mapa).forEach(([permiso, vista]) => {
        const btn = document.querySelector(`[data-view="${vista}"]`);
        if (btn) btn.classList.toggle('hidden', permisos[permiso] === false);
    });
}

function navegarAPrimeraVistaDisponible() {
    const primerBtn = document.querySelector('.menu-item:not(.hidden)');
    if (primerBtn) {
        const vista = primerBtn.getAttribute('data-view');
        if (vista) cambiarVista(vista);
    }
}

function actualizarIndicadorTurnoSidebar() {
    const btnTurno = document.getElementById('menu-turno');
    if (!btnTurno) return;
    if (turnoActivo) {
        btnTurno.classList.add('menu-turno-activo');
    } else {
        btnTurno.classList.remove('menu-turno-activo');
    }
}

async function cargarVistaTurno() {
    const panelSin    = document.getElementById('turno-sin-turno');
    const panelActivo = document.getElementById('turno-activo');

    if (turnoActivo) {
        panelSin.classList.add('hidden');
        panelActivo.classList.remove('hidden');

        // Poblar datos del turno
        document.getElementById('turno-act-nombre').textContent   = turnoActivo.cajero_nombre;
        document.getElementById('turno-act-rol').textContent      = turnoActivo.rol.charAt(0).toUpperCase() + turnoActivo.rol.slice(1);
        document.getElementById('turno-act-apertura').textContent = new Date(turnoActivo.apertura).toLocaleString('es-MX');
        document.getElementById('turno-act-fondo').textContent    = fmt(turnoActivo.fondo_inicial);

        // Totales en tiempo real
        try {
            const totales = await _turnoGetTotales(turnoActivo.apertura, turnoActivo.id);
            document.getElementById('turno-total-ventas').textContent        = fmt(totales.total_ventas || 0);
            document.getElementById('turno-total-pedidos').textContent       = totales.total_pedidos || 0;
            document.getElementById('turno-total-efectivo').textContent      = fmt(totales.total_efectivo || 0);
            document.getElementById('turno-total-tarjeta').textContent       = fmt(totales.total_tarjeta || 0);
            document.getElementById('turno-total-transferencia').textContent = fmt(totales.total_transferencia || 0);
        } catch(e) { console.error('Error calculando totales turno:', e); }
    } else {
        panelSin.classList.remove('hidden');
        panelActivo.classList.add('hidden');
        // Pre-llenar el rol con el perfil activo
        const selectRol = document.getElementById('turno-rol');
        if (selectRol && rolActivo) selectRol.value = rolActivo;
    }

    // Cargar historial
    await cargarHistorialTurnos();
}

async function cargarHistorialTurnos() {
    const tbody = document.getElementById('turno-historial-body');
    if (!tbody) return;
    try {
        const turnos = await _turnoGetHistorial();
        if (!turnos.length) {
            tbody.innerHTML = '<tr><td colspan="10" style="text-align:center;color:var(--text-muted);">Sin turnos registrados</td></tr>';
            return;
        }
        tbody.innerHTML = turnos.map(t => `
            <tr>
                <td>#${t.id}</td>
                <td>${esc(t.cajero_nombre)}</td>
                <td>${esc(t.rol.charAt(0).toUpperCase() + t.rol.slice(1))}</td>
                <td>${new Date(t.apertura).toLocaleString('es-MX')}</td>
                <td>${t.cierre ? new Date(t.cierre).toLocaleString('es-MX') : '—'}</td>
                <td>${fmt(t.total_ventas)}</td>
                <td>${fmt(t.total_efectivo)}</td>
                <td class="${t.diferencia < 0 ? 'text-danger' : t.diferencia > 0 ? 'text-success' : ''}">${fmt(t.diferencia)}</td>
                <td><span class="badge-${t.estado}">${t.estado === 'abierto' ? 'Abierto' : 'Cerrado'}</span></td>
                <td><button class="btn-secondary small" onclick="verReporteTurno(${t.id})" title="Ver reporte"><svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><line x1="10" y1="9" x2="8" y2="9"/></svg></button></td>
            </tr>
        `).join('');
    } catch(e) {
        console.error('Error cargando historial turnos:', e);
    }
}

// --- Reporte de Turno ---
let _turnoReporteData = null;

async function verReporteTurno(id) {
    const turnos = await _turnoGetHistorial();
    // Si el turno es el activo (abierto), buscarlo ahí también
    const turno = turnos.find(t => t.id === id) || (turnoActivo?.id === id ? turnoActivo : null);
    if (!turno) return;

    let totales = {
        total_pedidos:      turno.total_pedidos,
        total_ventas:       turno.total_ventas,
        total_efectivo:     turno.total_efectivo,
        total_tarjeta:      turno.total_tarjeta,
        total_transferencia:turno.total_transferencia,
    };
    if (turno.estado === 'abierto') {
        try {
            const live = await _turnoGetTotales(turno.apertura, turno.id);
            if (live) totales = live;
        } catch(e) { console.warn('Error calculando totales live:', e); }
    }

    _turnoReporteData = { turno, totales };

    const rolLabel = { cajero: 'Cajero', encargado: 'Encargado', dueno: 'Administrador' };
    const fmtFecha = (d) => d ? new Date(d).toLocaleString('es-MX', { dateStyle:'short', timeStyle:'short' }) : null;
    const fmtMonto = (v) => '$' + parseFloat(v || 0).toLocaleString('es-MX', { minimumFractionDigits:2, maximumFractionDigits:2 });
    const fila = (lbl, val, color='') =>
        `<div style="display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid #f3f4f6;">
            <span style="color:#6b7280;font-size:0.9em;">${lbl}</span>
            <strong style="color:${color||'#111827'};font-size:0.9em;">${val}</strong>
        </div>`;
    const seccion = (titulo) =>
        `<p style="font-weight:700;font-size:0.8em;text-transform:uppercase;letter-spacing:.05em;color:#6b7280;margin:16px 0 6px;">${titulo}</p>`;

    const esperado = (turno.fondo_inicial || 0) + (totales.total_efectivo || 0);
    const difColor = (turno.diferencia || 0) < 0 ? '#ef4444' : (turno.diferencia || 0) > 0 ? '#10b981' : '#111827';

    let html = seccion('Información del turno');
    html += fila('# Turno', `#${turno.id}`);
    html += fila('Cajero', turno.cajero_nombre);
    html += fila('Rol', rolLabel[turno.rol] || turno.rol);
    html += fila('Apertura', fmtFecha(turno.apertura));
    html += fila('Cierre', turno.cierre ? fmtFecha(turno.cierre) : '— Turno en curso');

    html += seccion('Resumen de ventas');
    html += fila('Pedidos', totales.total_pedidos || 0);
    html += fila('Total vendido', fmtMonto(totales.total_ventas));
    html += fila('Efectivo', fmtMonto(totales.total_efectivo));
    if ((totales.total_tarjeta || 0) > 0)       html += fila('Tarjeta / Débito', fmtMonto(totales.total_tarjeta));
    if ((totales.total_transferencia || 0) > 0) html += fila('Transferencia', fmtMonto(totales.total_transferencia));

    if (turno.estado === 'cerrado') {
        html += seccion('Corte de caja');
        html += fila('Fondo inicial', fmtMonto(turno.fondo_inicial));
        html += fila('Efectivo en ventas', fmtMonto(totales.total_efectivo));
        html += fila('Efectivo esperado', fmtMonto(esperado));
        html += fila('Efectivo contado', fmtMonto(turno.efectivo_contado));
        html += fila('Diferencia', fmtMonto(turno.diferencia), difColor);
    }

    if (turno.notas) {
        html += seccion('Notas');
        html += `<p style="font-size:0.9em;color:#374151;background:#f9fafb;padding:8px;border-radius:6px;margin-top:4px;">${esc(turno.notas)}</p>`;
    }

    document.getElementById('rpt-titulo').textContent = `Reporte de Turno #${turno.id}`;
    document.getElementById('rpt-cuerpo').innerHTML = html;
    document.getElementById('modal-reporte-turno').classList.remove('hidden');
}

function verReporteTurnoActivo() {
    if (!turnoActivo) return;
    verReporteTurno(turnoActivo.id);
}

function cerrarReporteTurno() {
    document.getElementById('modal-reporte-turno').classList.add('hidden');
    _turnoReporteData = null;
}

async function imprimirReporteTurno() {
    if (!_turnoReporteData) return;
    const { turno, totales } = _turnoReporteData;

    const ajustes = await window.api.obtenerAjustes();
    const negocio = ajustes.business_name || 'Mi Negocio';
    const impresora = ajustes.impresora || '';

    const rolLabel = { cajero: 'Cajero', encargado: 'Encargado', dueno: 'Administrador' };
    const fmtFecha = (d) => d ? new Date(d).toLocaleString('es-MX', { dateStyle:'short', timeStyle:'short' }) : '—';
    const fmtMonto = (v) => '$' + parseFloat(v || 0).toLocaleString('es-MX', { minimumFractionDigits:2, maximumFractionDigits:2 });
    const sep = '─'.repeat(32);
    const esperado = (turno.fondo_inicial || 0) + (totales.total_efectivo || 0);
    const difColor = (turno.diferencia || 0) < 0 ? '#ef4444' : (turno.diferencia || 0) > 0 ? '#10b981' : '#000';

    const fila = (lbl, val, bold=false, color='#000') =>
        `<div style="display:flex;justify-content:space-between;margin:2px 0;">
            <span>${lbl}</span>
            <span style="font-weight:${bold?'700':'400'};color:${color};">${val}</span>
        </div>`;

    let html = `<!DOCTYPE html><html><head><meta charset="utf-8">
    <style>
        * { margin:0; padding:0; box-sizing:border-box; }
        body { font-family: 'Courier New', monospace; font-size: 12px; width: 350px; padding: 12px; color: #000; }
        .centro { text-align:center; }
        .sep { border-top:1px dashed #999; margin:8px 0; }
        .titulo-sec { font-weight:700; font-size:11px; text-transform:uppercase; margin:8px 0 4px; }
        @media print { body { width:100%; } }
    </style></head><body>
    <div class="centro"><strong style="font-size:14px;">${negocio}</strong></div>
    <div class="sep"></div>
    <div class="centro"><strong>REPORTE DE TURNO #${turno.id}</strong></div>
    <div class="sep"></div>
    ${fila('Cajero:', esc(turno.cajero_nombre))}
    ${fila('Rol:', esc(rolLabel[turno.rol] || turno.rol))}
    ${fila('Apertura:', fmtFecha(turno.apertura))}
    ${fila('Cierre:', turno.cierre ? fmtFecha(turno.cierre) : 'En curso')}
    <div class="sep"></div>
    <div class="titulo-sec">Ventas</div>
    ${fila('Pedidos:', totales.total_pedidos || 0)}
    ${fila('Total:', fmtMonto(totales.total_ventas), true)}
    ${fila('Efectivo:', fmtMonto(totales.total_efectivo))}
    ${(totales.total_tarjeta||0)>0 ? fila('Tarjeta:', fmtMonto(totales.total_tarjeta)) : ''}
    ${(totales.total_transferencia||0)>0 ? fila('Transfer.:', fmtMonto(totales.total_transferencia)) : ''}
    ${turno.estado === 'cerrado' ? `
    <div class="sep"></div>
    <div class="titulo-sec">Corte de Caja</div>
    ${fila('Fondo inicial:', fmtMonto(turno.fondo_inicial))}
    ${fila('Efvo. ventas:', fmtMonto(totales.total_efectivo))}
    ${fila('Esperado:', fmtMonto(esperado))}
    ${fila('Contado:', fmtMonto(turno.efectivo_contado))}
    ${fila('DIFERENCIA:', fmtMonto(turno.diferencia), true, difColor)}
    ` : ''}
    ${turno.notas ? `<div class="sep"></div><div class="titulo-sec">Notas</div><p style="font-size:11px;">${esc(turno.notas)}</p>` : ''}
    <div class="sep"></div>
    <div class="centro" style="font-size:10px;color:#666;">Impreso: ${new Date().toLocaleString('es-MX')}</div>
    </body></html>`;

    await window.api.imprimirTicket(html, impresora);
}

// --- Autenticación al cambiar rol en turno ---
let _turnoAuthResolve = null;
let _turnoAuthReject  = null;
let _turnoAuthRol     = null;

async function solicitarAuthTurno(rol) {
    return new Promise(async (resolve, reject) => {
        if (rol === 'dueno') {
            const tienePass = await window.api.tienePasswordApp();
            if (!tienePass) { resolve(); return; }
        } else {
            const ajustes = await window.api.obtenerAjustes();
            const permisosData = ajustes.permisos_roles ? JSON.parse(ajustes.permisos_roles) : {};
            const permisos = permisosData[rol] || {};
            if (!permisos.pin_set) { resolve(); return; }
        }
        _turnoAuthResolve = resolve;
        _turnoAuthReject  = reject;
        _turnoAuthRol     = rol;
        const labels = { cajero: 'Cajero', encargado: 'Encargado', dueno: 'Administrador' };
        const tipo   = rol === 'dueno' ? 'contraseña' : 'PIN';
        document.getElementById('auth-turno-titulo').textContent = labels[rol] || rol;
        document.getElementById('auth-turno-label').textContent  =
            `Ingresa la ${tipo} de ${labels[rol] || rol} para continuar.`;
        document.getElementById('auth-turno-input').value = '';
        document.getElementById('auth-turno-error').style.display = 'none';
        document.getElementById('modal-auth-turno').classList.remove('hidden');
        setTimeout(() => document.getElementById('auth-turno-input').focus(), 50);
    });
}

async function confirmarAuthTurno() {
    const valor = document.getElementById('auth-turno-input').value;
    if (!valor) return;
    let ok = false;
    if (_turnoAuthRol === 'dueno') {
        ok = await window.api.verificarPasswordApp(valor);
    } else {
        const ajustes = await window.api.obtenerAjustes();
        const permisosData = ajustes.permisos_roles ? JSON.parse(ajustes.permisos_roles) : {};
        const permisos = permisosData[_turnoAuthRol] || {};
        if (!permisos.pin_set) { ok = true; }
        else {
            const hash = await hashPin(valor);
            ok = (hash === permisos.pin);
        }
    }
    if (ok) {
        document.getElementById('modal-auth-turno').classList.add('hidden');
        _turnoAuthResolve && _turnoAuthResolve();
    } else {
        document.getElementById('auth-turno-error').style.display = '';
        document.getElementById('auth-turno-input').value = '';
        document.getElementById('auth-turno-input').focus();
    }
}

function cancelarAuthTurno() {
    document.getElementById('modal-auth-turno').classList.add('hidden');
    _turnoAuthReject && _turnoAuthReject();
}

async function abrirTurno() {
    const nombre     = document.getElementById('turno-nombre')?.value?.trim();
    const rolDeseado = document.getElementById('turno-rol')?.value || 'cajero';
    const fondo      = parseFloat(document.getElementById('turno-fondo')?.value) || 0;

    if (!nombre) {
        mostrarNotificacionExito('Ingresa el nombre del cajero', '⚠️ Error');
        return;
    }

    // Si el rol elegido es diferente al actual, pedir autenticación
    if (rolDeseado !== rolActivo) {
        try {
            await solicitarAuthTurno(rolDeseado);
        } catch (e) {
            return; // El usuario canceló
        }
    }

    try {
        nombreActivo = nombre;
        await _turnoAbrir(nombre, rolDeseado, fondo);
        turnoActivo = await _turnoGetActivo();

        // Switch completo de sesión
        rolActivo = rolDeseado;
        await window.api.establecerRolActivo(rolDeseado);
        const labels = { cajero: '🧑‍💼 Cajero', encargado: '👔 Encargado', dueno: '🔑 Admin' };
        const textoBtn = document.getElementById('texto-perfil-activo');
        if (textoBtn) textoBtn.textContent = labels[rolDeseado] || rolDeseado;

        aplicarPermisos();
        actualizarIndicadorTurnoSidebar();
        cargarVistaTurno();
        mostrarNotificacionExito(`Turno abierto — ${nombre}`, '¡Turno Abierto!');
    } catch(e) {
        mostrarNotificacionExito('Error al abrir turno', '⚠️ Error');
        console.error(e);
    }
}

async function abrirModalCierre() {
    if (!turnoActivo) return;
    try {
        const totales = await _turnoGetTotales(turnoActivo.apertura, turnoActivo.id);
        const fondoInicial   = turnoActivo.fondo_inicial || 0;
        const efectivoVentas = totales.total_efectivo || 0;
        const tarjeta        = totales.total_tarjeta || 0;
        const transferencia  = totales.total_transferencia || 0;
        const esperado       = fondoInicial + efectivoVentas;

        document.getElementById('cierre-fondo').textContent           = fmt(fondoInicial);
        document.getElementById('cierre-efectivo-ventas').textContent = fmt(efectivoVentas);
        document.getElementById('cierre-esperado').textContent        = fmt(esperado);
        document.getElementById('cierre-efectivo-contado').value      = '';
        document.getElementById('cierre-diferencia').textContent      = '$0.00';
        document.getElementById('cierre-notas').value                 = '';

        // Mostrar sección de pagos digitales solo si hay alguno
        const hayDigitales = tarjeta > 0 || transferencia > 0;
        const seccion = document.getElementById('cierre-digitales-section');
        if (seccion) seccion.style.display = hayDigitales ? '' : 'none';

        const rowTarjeta = document.getElementById('cierre-tarjeta-row');
        if (rowTarjeta) {
            rowTarjeta.style.display = tarjeta > 0 ? '' : 'none';
            document.getElementById('cierre-tarjeta').textContent = fmt(tarjeta);
        }
        const rowTransferencia = document.getElementById('cierre-transferencia-row');
        if (rowTransferencia) {
            rowTransferencia.style.display = transferencia > 0 ? '' : 'none';
            document.getElementById('cierre-transferencia').textContent = fmt(transferencia);
        }

        document.getElementById('modal-cierre-turno').classList.remove('hidden');
    } catch(e) {
        mostrarNotificacionExito('Error al cargar datos de cierre', '⚠️ Error');
    }
}

function actualizarDiferencia() {
    const contado  = parseFloat(document.getElementById('cierre-efectivo-contado')?.value) || 0;
    const esperado = parseFloat(document.getElementById('cierre-esperado')?.textContent?.replace(/[^0-9.-]/g, '')) || 0;
    const dif      = contado - esperado;
    const el       = document.getElementById('cierre-diferencia');
    el.textContent = fmt(dif);
    el.style.color = dif < 0 ? '#ef4444' : dif > 0 ? '#22c55e' : 'inherit';
}

async function confirmarCierreTurno() {
    if (!turnoActivo) return;
    const contado = parseFloat(document.getElementById('cierre-efectivo-contado')?.value);
    if (isNaN(contado) || contado < 0) {
        mostrarNotificacionExito('Ingresa el efectivo contado', '⚠️ Error');
        return;
    }
    const notas = document.getElementById('cierre-notas')?.value || '';

    try {
        await _turnoCerrar(turnoActivo.id, contado, notas);
        document.getElementById('modal-cierre-turno').classList.add('hidden');
        turnoActivo = null;
        aplicarPermisos();
        actualizarIndicadorTurnoSidebar();
        cargarVistaTurno();
        mostrarNotificacionExito('Turno cerrado correctamente', '¡Turno Cerrado!');
    } catch(e) {
        mostrarNotificacionExito('Error al cerrar turno', '⚠️ Error');
        console.error(e);
    }
}

// --- Modal Turno desde Venta ---
// MODAL TURNO DESDE NUEVA VENTA
// ============================================

function cerrarModalTurnoVenta() {
    document.getElementById('modal-turno-venta').classList.add('hidden');
    // Si no hay turno abierto, redirigir a la pantalla de Turno en lugar de dejar al usuario en Nueva Venta sin turno
    if (!turnoActivo) {
        cambiarVista('turno');
    }
}

// ============================================

// --- Abrir turno desde modal de venta ---
async function abrirTurnoDesdeVenta() {
    const nombre = document.getElementById('tv-nombre')?.value?.trim();
    const fondo  = parseFloat(document.getElementById('tv-fondo')?.value) || 0;

    if (!nombre) {
        mostrarNotificacionExito('Ingresa tu nombre para abrir el turno', '⚠️ Error');
        return;
    }

    try {
        nombreActivo = nombre;
        await _turnoAbrir(nombre, rolActivo || 'cajero', fondo);
        turnoActivo = await _turnoGetActivo();
        actualizarIndicadorTurnoSidebar();
        document.getElementById('modal-turno-venta').classList.add('hidden');
        mostrarNotificacionExito(`Turno abierto — ${nombre}`, '¡Turno Abierto!');
    } catch(e) {
        mostrarNotificacionExito('Error al abrir turno', '⚠️ Error');
        console.error(e);
    }
}
