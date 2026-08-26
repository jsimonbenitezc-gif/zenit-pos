// ============================================
// MÓDULO: Turnos / Corte de Caja
// ============================================

// `fmt` formatea moneda en toda esta vista. Estaba EN USO (14 llamadas) pero sin
// definir en ningún archivo cargado por index.html, así que `cargarVistaTurno()`
// reventaba con ReferenceError en la primera línea que lo usa (el fondo inicial) y
// la vista quedaba a medio pintar: sin totales del turno y sin historial, porque la
// excepción cortaba la función antes de llegar a ellos.
// Mismo formato que `_fmtMesa` en modulo-mesas.js.
function fmt(v) {
    return '$' + (parseFloat(v) || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ─── Helpers turno: cloud si está conectado, local si no ─────────────────────
async function _turnoGetActivo() {
    if (modoConectado && apiClient) return apiClient.getTurnoActivo(sucursalIdActual).catch(() => null);
    return window.api.obtenerTurnoActivo();
}
async function _turnoGetTotales(apertura, turnoId) {
    if (modoConectado && apiClient && turnoId) return apiClient.getTurnoTotales(turnoId);
    const totales = await window.api.calcularTotalesTurno(apertura);
    // El backend ya devuelve los movimientos de caja junto con las ventas; en modo
    // local se agregan aquí para que el resto de la vista no tenga que distinguir
    // el modo al calcular el efectivo esperado.
    if (turnoId) {
        try {
            const movs = await window.api.totalesMovimientosCaja(turnoId);
            totales.total_depositos = movs?.total_depositos || 0;
            totales.total_retiros   = movs?.total_retiros   || 0;
            totales.total_gastos    = movs?.total_gastos    || 0;
        } catch(e) { /* sin movimientos: los totales quedan en 0 */ }
    }
    return totales;
}

/**
 * Efectivo que debe haber en el cajón:
 *   fondo_inicial + ventas_efectivo + depósitos − retiros − gastos
 * Misma fórmula que utils/cashMovements.js en el backend (ver CLAUDE.md §28).
 */
function _efectivoEsperado(fondoInicial, totales) {
    return (parseFloat(fondoInicial) || 0)
         + (parseFloat(totales?.total_efectivo) || 0)
         + (parseFloat(totales?.total_depositos) || 0)
         - (parseFloat(totales?.total_retiros) || 0)
         - (parseFloat(totales?.total_gastos) || 0);
}
async function _turnoAbrir(nombre, rol, fondo) {
    if (modoConectado && apiClient) return apiClient.abrirTurno(nombre, rol, fondo, sucursalIdActual);
    return window.api.abrirTurno(nombre, rol, fondo);
}
async function _turnoCerrar(id, contado, notas) {
    if (modoConectado && apiClient) return apiClient.cerrarTurno(id, contado, notas);
    return window.api.cerrarTurno(id, contado, notas);
}
// ── Movimientos de caja (BLOQUE 7) ───────────────────────────────────────────
// Mismo patrón que el resto del turno: en modo conectado viven en el backend, en
// modo local en la SQLite. No se sincronizan entre sí, igual que los turnos.
async function _movGetLista(turnoId) {
    if (modoConectado && apiClient) {
        const r = await apiClient.getMovimientosCaja(turnoId);
        return { movimientos: r.movimientos || [], totales: r.totales || {} };
    }
    const movs = await window.api.obtenerMovimientosCaja(turnoId);
    const totales = await window.api.totalesMovimientosCaja(turnoId);
    // La SQLite usa nombres propios; se normalizan al formato del backend para que
    // el render sea uno solo.
    return {
        movimientos: (movs || []).map(m => ({
            id: m.id,
            tipo: m.tipo,
            monto: parseFloat(m.monto) || 0,
            motivo: m.motivo,
            employee_name: m.empleado_nombre,
            anulado: !!m.anulado,
            anulado_por_nombre: m.anulado_por_nombre,
            motivo_anulacion: m.motivo_anulacion,
            createdAt: m.fecha
        })),
        totales: totales || {}
    };
}

async function _movRegistrar(turnoId, datos) {
    if (modoConectado && apiClient) return apiClient.registrarMovimientoCaja(turnoId, datos);
    return window.api.registrarMovimientoCaja(turnoId, datos.tipo, datos.monto, datos.motivo, datos.employee_name);
}

async function _movAnular(turnoId, movId, datos) {
    if (modoConectado && apiClient) return apiClient.anularMovimientoCaja(turnoId, movId, datos);
    return window.api.anularMovimientoCaja(movId, datos.employee_name, datos.motivo);
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

        await cargarMovimientosCaja();
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

// ═══════════════════════════════════════════════════════════════════════════
// MOVIMIENTOS DE CAJA — UI (BLOQUE 7)
// ═══════════════════════════════════════════════════════════════════════════

const MOV_ETIQUETA = { retiro: 'Retiro', gasto: 'Gasto', deposito: 'Depósito' };
let _movTipoSeleccionado = 'retiro';
let _movGuardando = false;

/**
 * ¿Hay que pedir el PIN del puesto para sacar dinero?
 * Es una decisión del dueño (`movimientos_caja_pin`, ajuste de la CUENTA). Se lee
 * de la SQLite local para que funcione igual sin internet; el default es pedirlo.
 */
async function _movPinRequerido(tipo) {
    if (tipo === 'deposito') return false;
    try {
        const ajustes = await window.api.obtenerAjustes();
        return !(ajustes.movimientos_caja_pin === 'false' || ajustes.movimientos_caja_pin === false);
    } catch(e) {
        return true; // ante la duda, se pide
    }
}

async function cargarMovimientosCaja() {
    const contLista   = document.getElementById('turno-mov-lista');
    const contTotales = document.getElementById('turno-mov-totales');
    if (!contLista || !contTotales || !turnoActivo) return;

    try {
        const { movimientos, totales } = await _movGetLista(turnoActivo.id);

        contTotales.innerHTML = `
            <div class="turno-mov-total"><span>Depósitos</span><strong class="text-success">+${fmt(totales.total_depositos || 0)}</strong></div>
            <div class="turno-mov-total"><span>Retiros</span><strong class="text-danger">−${fmt(totales.total_retiros || 0)}</strong></div>
            <div class="turno-mov-total"><span>Gastos</span><strong class="text-danger">−${fmt(totales.total_gastos || 0)}</strong></div>
        `;

        if (!movimientos.length) {
            contLista.innerHTML = '<p class="turno-mov-vacio">Sin movimientos en este turno.</p>';
            return;
        }

        contLista.innerHTML = movimientos.map(m => {
            const signo  = m.tipo === 'deposito' ? '+' : '−';
            const color  = m.tipo === 'deposito' ? 'text-success' : 'text-danger';
            const hora   = m.createdAt ? new Date(m.createdAt).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' }) : '';
            const quien  = m.employee_name ? esc(m.employee_name) : 'Sin identificar';
            const motivo = m.motivo ? esc(m.motivo) : 'Sin motivo';
            const detalleAnulado = m.anulado
                ? `<div class="turno-mov-item-motivo">Anulado${m.anulado_por_nombre ? ' por ' + esc(m.anulado_por_nombre) : ''}${m.motivo_anulacion ? ' · ' + esc(m.motivo_anulacion) : ''}</div>`
                : '';
            return `
                <div class="turno-mov-item ${m.anulado ? 'anulado' : ''}">
                    <span class="turno-mov-badge">${MOV_ETIQUETA[m.tipo] || esc(m.tipo)}</span>
                    <div class="turno-mov-item-info">
                        <div>${motivo}</div>
                        <div class="turno-mov-item-motivo">${hora} · ${quien}</div>
                        ${detalleAnulado}
                    </div>
                    <span class="turno-mov-item-monto ${color}">${signo}${fmt(m.monto)}</span>
                    ${m.anulado ? '' : `<button class="btn-secondary small" onclick="anularMovimientoCajaUI(${m.id})" title="Anular movimiento">Anular</button>`}
                </div>`;
        }).join('');
    } catch(e) {
        console.error('Error cargando movimientos de caja:', e);
        contLista.innerHTML = '<p class="turno-mov-vacio">No se pudieron cargar los movimientos.</p>';
    }
}

async function abrirModalMovimientoCaja() {
    if (!turnoActivo) {
        mostrarNotificacionExito('Abre un turno para registrar movimientos de caja', 'Sin turno');
        return;
    }
    // Registrar aquí un movimiento mientras se mira otra sucursal cruzaría las
    // cajas de ambas (ver CLAUDE.md §24).
    if (typeof bloquearSiVistaAjena === 'function' && await bloquearSiVistaAjena()) return;

    document.getElementById('mov-caja-monto').value  = '';
    document.getElementById('mov-caja-motivo').value = '';
    const pinEl = document.getElementById('mov-caja-pin');
    if (pinEl) pinEl.value = '';
    document.getElementById('mov-caja-error').style.display = 'none';
    await seleccionarTipoMovimiento('retiro');
    document.getElementById('modal-movimiento-caja').classList.remove('hidden');
    setTimeout(() => document.getElementById('mov-caja-monto')?.focus(), 50);
}

function cerrarModalMovimientoCaja() {
    document.getElementById('modal-movimiento-caja').classList.add('hidden');
}

async function seleccionarTipoMovimiento(tipo) {
    _movTipoSeleccionado = tipo;
    document.querySelectorAll('.mov-tipo-btn').forEach(btn => {
        btn.classList.toggle('activo', btn.getAttribute('data-tipo') === tipo);
    });
    const titulo = document.getElementById('mov-caja-titulo');
    if (titulo) titulo.textContent = MOV_ETIQUETA[tipo] || 'Movimiento de Caja';

    // El campo de PIN aparece solo cuando de verdad hace falta.
    const grupoPin = document.getElementById('mov-caja-pin-group');
    if (grupoPin) grupoPin.style.display = (await _movPinRequerido(tipo)) ? '' : 'none';
}

function _movMostrarError(msg) {
    const el = document.getElementById('mov-caja-error');
    if (!el) return;
    el.textContent = msg;
    el.style.display = '';
}

/**
 * Valida el PIN del puesto activo contra el hash guardado en los ajustes locales.
 * Sin conexión es la única validación posible, y una caja no puede quedarse sin
 * poder registrar un gasto porque se cayó el internet.
 */
async function _movVerificarPinLocal(pin) {
    try {
        const ajustes = await window.api.obtenerAjustes();
        const guardados = JSON.parse(ajustes.permisos_roles || '{}');
        const efectivos = (sucursalIdActual && guardados[`__b_${sucursalIdActual}`])
            ? guardados[`__b_${sucursalIdActual}`]
            : Object.fromEntries(Object.entries(guardados).filter(([k]) => !k.startsWith('__b_')));
        const perfil = efectivos[rolActivo];
        // Puesto sin PIN configurado: no hay nada contra qué validar.
        if (!perfil?.pin_set || !perfil?.pin) return true;
        return (await hashPin(pin)) === perfil.pin;
    } catch(e) {
        return true;
    }
}

async function confirmarMovimientoCaja() {
    if (!turnoActivo || _movGuardando) return;

    const monto  = parseFloat(document.getElementById('mov-caja-monto')?.value);
    const motivo = document.getElementById('mov-caja-motivo')?.value?.trim() || '';
    const pin    = document.getElementById('mov-caja-pin')?.value || '';
    const tipo   = _movTipoSeleccionado;

    if (isNaN(monto) || monto <= 0) {
        _movMostrarError('Ingresa un monto mayor a cero');
        return;
    }
    const pinRequerido = await _movPinRequerido(tipo);
    if (pinRequerido && !pin) {
        _movMostrarError('Ingresa el PIN de tu puesto');
        return;
    }
    // En modo local el backend no está para validar el PIN: se valida contra el
    // hash del puesto guardado en los ajustes.
    if (pinRequerido && !(modoConectado && apiClient && tokenActual)) {
        if (!(await _movVerificarPinLocal(pin))) {
            _movMostrarError('PIN incorrecto');
            return;
        }
    }

    _movGuardando = true;
    const btn = document.getElementById('mov-caja-confirmar');
    if (btn) btn.disabled = true;

    try {
        await _movRegistrar(turnoActivo.id, {
            tipo,
            monto,
            motivo: motivo || null,
            role: rolActivo || null,
            pin: pinRequerido ? pin : undefined,
            employee_name: nombreActivo || '',
            // Idempotencia: si se pierde la respuesta, el reintento no saca el
            // dinero dos veces (ver CLAUDE.md §19.7).
            client_uuid: typeof _generarUuid === 'function' ? _generarUuid() : undefined
        });
        cerrarModalMovimientoCaja();
        await cargarMovimientosCaja();
        mostrarNotificacionExito(`${MOV_ETIQUETA[tipo]} de ${fmt(monto)} registrado`, '¡Listo!');
    } catch(e) {
        _movMostrarError(e.message || 'No se pudo registrar el movimiento');
    } finally {
        _movGuardando = false;
        if (btn) btn.disabled = false;
    }
}

// ── Anulación ───────────────────────────────────────────────────────────────
let _movAnularResolve = null;
let _movAnularId      = null;

/**
 * Anula un movimiento: queda visible, marcado, y deja de contar en el cierre.
 * Nunca se borra — un registro de dinero que se puede borrar sin rastro no sirve
 * como control.
 */
async function anularMovimientoCajaUI(movId) {
    if (!turnoActivo) return;
    if (typeof bloquearSiVistaAjena === 'function' && await bloquearSiVistaAjena()) return;

    _movAnularId = movId;
    const pinRequerido = await _movPinRequerido('retiro');
    document.getElementById('mov-anular-pin-group').style.display = pinRequerido ? '' : 'none';
    document.getElementById('mov-anular-pin').value    = '';
    document.getElementById('mov-anular-motivo').value = '';
    document.getElementById('mov-anular-error').style.display = 'none';
    document.getElementById('modal-anular-movimiento').classList.remove('hidden');
    setTimeout(() => document.getElementById(pinRequerido ? 'mov-anular-pin' : 'mov-anular-motivo')?.focus(), 50);
}

function cerrarModalAnularMovimiento() {
    document.getElementById('modal-anular-movimiento').classList.add('hidden');
    _movAnularId = null;
}

async function confirmarAnularMovimiento() {
    if (!turnoActivo || !_movAnularId) return;
    const pin    = document.getElementById('mov-anular-pin')?.value || '';
    const motivo = document.getElementById('mov-anular-motivo')?.value?.trim() || '';
    const errEl  = document.getElementById('mov-anular-error');

    const pinRequerido = await _movPinRequerido('retiro');
    if (pinRequerido && !pin) {
        errEl.textContent = 'Ingresa el PIN de tu puesto';
        errEl.style.display = '';
        return;
    }
    if (pinRequerido && !(modoConectado && apiClient && tokenActual) && !(await _movVerificarPinLocal(pin))) {
        errEl.textContent = 'PIN incorrecto';
        errEl.style.display = '';
        return;
    }

    try {
        await _movAnular(turnoActivo.id, _movAnularId, {
            role: rolActivo || null,
            pin: pinRequerido ? pin : undefined,
            employee_name: nombreActivo || '',
            motivo: motivo || null
        });
        cerrarModalAnularMovimiento();
        await cargarMovimientosCaja();
        mostrarNotificacionExito('Movimiento anulado', 'Listo');
    } catch(e) {
        errEl.textContent = e.message || 'No se pudo anular el movimiento';
        errEl.style.display = '';
    }
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

    // Un turno CERRADO guarda sus totales de movimientos congelados; uno abierto
    // los trae en vivo.
    const movs = turno.estado === 'cerrado'
        ? { total_depositos: turno.total_depositos, total_retiros: turno.total_retiros, total_gastos: turno.total_gastos }
        : totales;
    const esperado = _efectivoEsperado(turno.fondo_inicial, { ...totales, ...movs });
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
        if ((movs.total_depositos || 0) > 0) html += fila('+ Depósitos', fmtMonto(movs.total_depositos));
        if ((movs.total_retiros || 0)   > 0) html += fila('− Retiros',   fmtMonto(movs.total_retiros));
        if ((movs.total_gastos || 0)    > 0) html += fila('− Gastos',    fmtMonto(movs.total_gastos));
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
    const movs = turno.estado === 'cerrado'
        ? { total_depositos: turno.total_depositos, total_retiros: turno.total_retiros, total_gastos: turno.total_gastos }
        : totales;
    const esperado = _efectivoEsperado(turno.fondo_inicial, { ...totales, ...movs });
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
    ${(movs.total_depositos||0) > 0 ? fila('+ Depositos:', fmtMonto(movs.total_depositos)) : ''}
    ${(movs.total_retiros||0)   > 0 ? fila('- Retiros:',   fmtMonto(movs.total_retiros)) : ''}
    ${(movs.total_gastos||0)    > 0 ? fila('- Gastos:',    fmtMonto(movs.total_gastos)) : ''}
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

/**
 * Pide la contraseña de administrador para una acción de CONFIGURACIÓN
 * (hoy: cambiar la sucursal de este equipo). Reusa el modal de auth del turno.
 *
 * ⚠️ Con cuenta vinculada valida contra la contraseña de la CUENTA (backend), no
 * contra `app_password` de la SQLite local. Son dos contraseñas distintas: la local
 * es un cerrojo del equipo que se fija en Ajustes → "Contraseña del sistema" y NO se
 * entera cuando el dueño cambia la de su cuenta (desde el celular, o por el enlace de
 * recuperación). Validando contra la local, el equipo seguía aceptando la contraseña
 * vieja para siempre. Sin conexión (o en modo local puro) se cae a la local, que es
 * lo único disponible offline.
 *
 * @param {string} mensaje texto que explica para qué se pide
 * @returns {Promise<void>} resuelve si la contraseña es correcta, rechaza si cancela
 */
async function solicitarPasswordAdmin(mensaje) {
    const usarCuenta = !!(modoConectado && apiClient && tokenActual);

    return new Promise(async (resolve, reject) => {
        if (!usarCuenta) {
            const tienePass = await window.api.tienePasswordApp();
            if (!tienePass) { resolve(); return; } // equipo sin cerrojo local: nada que pedir
        }

        _turnoAuthResolve = resolve;
        _turnoAuthReject  = reject;
        _turnoAuthRol     = usarCuenta ? 'cuenta' : 'dueno';
        document.getElementById('auth-turno-titulo').textContent = 'Administrador';
        document.getElementById('auth-turno-label').textContent  =
            mensaje || 'Ingresa la contraseña de administrador para continuar.';
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
    if (_turnoAuthRol === 'cuenta') {
        // Contraseña de la cuenta Zenit (fuente de verdad). Si falla la red, se cae
        // a la contraseña local del equipo para no dejar al dueño encerrado.
        try {
            ok = await apiClient.verifyPassword(valor);
        } catch (e) {
            ok = await window.api.verificarPasswordApp(valor);
        }
    } else if (_turnoAuthRol === 'dueno') {
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
        mostrarNotificacionExito('Ingresa el nombre del cajero', 'Error');
        return;
    }

    // Un turno sin sucursal descuadra el cierre de caja (ver CLAUDE.md §24)
    if (!(await verificarSucursalParaRegistrar())) return;

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
        await registrarRolActivoEnMain(rolDeseado);
        const labels = { cajero: 'Cajero', encargado: 'Encargado', dueno: 'Admin' };
        const labelIcons = { cajero: 'user', encargado: 'briefcase', dueno: 'key-round' };
        const textoBtn = document.getElementById('texto-perfil-activo');
        if (textoBtn) textoBtn.innerHTML = `${svgIconHTML(labelIcons[rolDeseado] || 'user', 14)} ${labels[rolDeseado] || rolDeseado}`;

        aplicarPermisos();
        actualizarIndicadorTurnoSidebar();
        cargarVistaTurno();
        mostrarNotificacionExito(`Turno abierto — ${nombre}`, '¡Turno Abierto!');
    } catch(e) {
        mostrarNotificacionExito('Error al abrir turno', 'Error');
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
        const depositos      = totales.total_depositos || 0;
        const retiros        = totales.total_retiros || 0;
        const gastos         = totales.total_gastos || 0;
        const esperado       = _efectivoEsperado(fondoInicial, totales);

        document.getElementById('cierre-fondo').textContent           = fmt(fondoInicial);
        document.getElementById('cierre-efectivo-ventas').textContent = fmt(efectivoVentas);

        // Las filas de movimientos solo aparecen si hubo: un turno sin retiros ni
        // gastos ve exactamente el mismo cierre de siempre.
        const filaMov = (idFila, idValor, monto) => {
            const fila = document.getElementById(idFila);
            if (!fila) return;
            fila.style.display = monto > 0 ? '' : 'none';
            const el = document.getElementById(idValor);
            if (el) el.textContent = fmt(monto);
        };
        filaMov('cierre-depositos-row', 'cierre-depositos', depositos);
        filaMov('cierre-retiros-row',   'cierre-retiros',   retiros);
        filaMov('cierre-gastos-row',    'cierre-gastos',    gastos);

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
        mostrarNotificacionExito('Error al cargar datos de cierre', 'Error');
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
        mostrarNotificacionExito('Ingresa el efectivo contado', 'Error');
        return;
    }
    const notas = document.getElementById('cierre-notas')?.value || '';

    try {
        await _turnoCerrar(turnoActivo.id, contado, notas);
        document.getElementById('modal-movimiento-caja')?.classList.add('hidden');
        document.getElementById('modal-cierre-turno').classList.add('hidden');
        turnoActivo = null;
        aplicarPermisos();
        actualizarIndicadorTurnoSidebar();
        cargarVistaTurno();
        mostrarNotificacionExito('Turno cerrado correctamente', '¡Turno Cerrado!');
    } catch(e) {
        mostrarNotificacionExito('Error al cerrar turno', 'Error');
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
        mostrarNotificacionExito('Ingresa tu nombre para abrir el turno', 'Error');
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
        mostrarNotificacionExito('Error al abrir turno', 'Error');
        console.error(e);
    }
}
