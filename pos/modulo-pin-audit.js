// ============================================
// MÓDULO: PIN de Empleado + Auditoría
// ============================================

// ============================================
// SISTEMA DE AUTORIZACIÓN CON PIN DE EMPLEADO
// ============================================

let _pinEmpleadoPendiente = null;

/**
 * Muestra el modal de PIN de empleado antes de ejecutar una acción sensible.
 * En modo local (sin conexión) ejecuta la acción directamente sin pedir PIN.
 */
function pedirPinEmpleado(mensaje, onConfirm) {
    if (!modoConectado || !apiClient || !tokenActual) {
        onConfirm(null, null);
        return;
    }
    _pinEmpleadoPendiente = onConfirm;
    const msgEl = document.getElementById('modal-pin-empleado-msg');
    if (msgEl) msgEl.textContent = mensaje || 'Esta acción requiere autorización. Ingresa tu PIN.';
    const inputEl = document.getElementById('input-pin-empleado');
    if (inputEl) inputEl.value = '';
    const errEl = document.getElementById('pin-empleado-error');
    if (errEl) errEl.style.display = 'none';
    document.getElementById('modal-pin-empleado').classList.remove('hidden');
    setTimeout(() => { if (inputEl) inputEl.focus(); }, 100);
}

async function confirmarPinEmpleado() {
    if (!_pinEmpleadoPendiente) return;
    const pin   = document.getElementById('input-pin-empleado').value;
    const errEl = document.getElementById('pin-empleado-error');
    const btnEl = document.getElementById('btn-confirmar-pin-empleado');

    // Bloqueo por intentos fallidos
    const minRestantes = pinBloqueadoRestanteMin();
    if (minRestantes > 0) {
        if (errEl) {
            errEl.textContent = `Demasiados intentos fallidos. Espera ${minRestantes} minuto(s).`;
            errEl.style.display = '';
        }
        return;
    }

    if (btnEl) btnEl.disabled = true;
    try {
        // Leer permisos efectivos del perfil activo (respetando sucursal)
        let permisosEfectivos = {};
        try {
            const ajustes = await window.api.obtenerAjustes();
            const guardados = JSON.parse(ajustes.permisos_roles || '{}');
            if (sucursalIdActual && guardados[`__b_${sucursalIdActual}`]) {
                permisosEfectivos = guardados[`__b_${sucursalIdActual}`];
            } else {
                permisosEfectivos = Object.fromEntries(Object.entries(guardados).filter(([k]) => !k.startsWith('__b_')));
            }
        } catch(e) {}

        const perfilActual = permisosEfectivos[rolActivo];
        if (perfilActual?.pin_set && perfilActual?.pin) {
            // Perfil con PIN configurado: verificar contra el PIN local del perfil
            if (!pin) {
                if (errEl) { errEl.textContent = 'Ingresa tu PIN'; errEl.style.display = ''; }
                if (btnEl) btnEl.disabled = false;
                return;
            }
            const pinHash = await hashPin(pin);
            if (perfilActual.pin !== pinHash) {
                registrarFalloPin();
                const minBloqueo = pinBloqueadoRestanteMin();
                if (errEl) {
                    errEl.textContent = minBloqueo > 0
                        ? `Demasiados intentos fallidos. Espera ${minBloqueo} minuto(s).`
                        : 'PIN incorrecto';
                    errEl.style.display = '';
                }
                if (btnEl) btnEl.disabled = false;
                return;
            }
            resetearFallosPin();
        }

        // PIN válido (o perfil sin PIN — solo requiere confirmar).
        //
        // ⚠️ EL PIN SE PASA AL CALLBACK, no `null`. La validación de arriba es
        // LOCAL: sirve para dar respuesta inmediata y para el bloqueo por
        // intentos, pero el backend tiene que poder verificarlo él mismo, o
        // cualquiera podría llamar al API sin PIN. Antes se mandaba `null` y el
        // backend respondía 400: por eso ningún cajero podía cancelar un pedido
        // ni editar un cliente (CLAUDE.md §12.2).
        const meData = await apiClient.request('/auth/me', { method: 'GET' }).catch(() => null);
        document.getElementById('modal-pin-empleado').classList.add('hidden');
        const cb = _pinEmpleadoPendiente;
        _pinEmpleadoPendiente = null;
        cb(meData?.id || null, pin || null, nombreActivo || '', rolActivo || '');
    } catch(e) {
        if (errEl) { errEl.textContent = e.message || 'Error al verificar PIN'; errEl.style.display = ''; }
        if (btnEl) btnEl.disabled = false;
    }
}

function cancelarPinEmpleado() {
    _pinEmpleadoPendiente = null;
    document.getElementById('modal-pin-empleado').classList.add('hidden');
}

// ============================================
// AUDITORÍA — Cargar logs en dashboard
// ============================================

async function cargarAuditLog() {
    const lista = document.getElementById('alertas-audit-list');
    if (!lista) return;

    if (!modoConectado || !apiClient || !tokenActual) {
        lista.innerHTML = '';
        return;
    }

    try {
        const data = await apiClient.getAuditLogs({ limit: 20 });
        const logs = data.data || [];

        if (!logs.length) {
            lista.innerHTML = '';
            return;
        }

        const TIPOS = {
            cancel_order:         { icon: '🔴', label: 'Pedido cancelado' },
            edit_customer:        { icon: svgIconHTML('document-text', 16), label: 'Cliente editado' },
            inventory_adjustment: { icon: svgIconHTML('package', 16), label: 'Ajuste de inventario' },
            apply_discount:       { icon: svgIconHTML('tag', 16), label: 'Descuento aplicado' }
        };

        // Guardar logs en cache para modal de reporte
        window._auditLogsCache = logs;

        lista.innerHTML = `<div style="margin-top:8px; padding-top:8px; border-top:1px solid #e5e7eb;">
            <div style="font-size:0.8em; font-weight:600; color:#6b7280; margin-bottom:6px; display:flex; align-items:center; gap:5px;">
                <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/></svg>
                Acciones sensibles realizadas (todas las sucursales)
            </div>
            ${logs.map((log, idx) => {
                const tipo  = TIPOS[log.action_type] || { icon: '🔒', label: log.action_type };
                const fecha = new Date(log.createdAt).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' });
                return `<div style="display:flex;align-items:center;gap:8px;padding:6px 10px;border-radius:7px;margin-bottom:4px;background:#f8fafc;border-left:3px solid #6366f1;font-size:0.82em;">
                    <span style="font-size:1em;flex-shrink:0;">${tipo.icon}</span>
                    <div style="flex:1;min-width:0;">
                        <div style="font-weight:600;color:#374151;">${tipo.label}</div>
                        <div style="color:#6b7280;">${esc(log.target_description || '')} — ${esc(log.employee_name)}</div>
                    </div>
                    <div style="flex-shrink:0;text-align:right;">
                        <div style="color:#9ca3af;font-size:0.9em;">${fecha}</div>
                        <button onclick="abrirReporteAudit(${idx})" style="font-size:0.8em;padding:2px 7px;border:1px solid #d1d5db;border-radius:4px;background:white;color:#374151;cursor:pointer;margin-top:2px;">Ver</button>
                    </div>
                </div>`;
            }).join('')}
        </div>`;
    } catch(e) {
        lista.innerHTML = '';
    }
}

// ============================================
// MODAL DE REPORTE DE AUDITORÍA
// ============================================

function abrirReporteAudit(idx) {
    const log = window._auditLogsCache?.[idx];
    if (!log) return;

    const TIPOS = {
        cancel_order:         { icon: '🔴', label: 'Pedido cancelado' },
        edit_customer:        { icon: svgIconHTML('document-text', 16), label: 'Cliente editado' },
        inventory_adjustment: { icon: svgIconHTML('package', 16), label: 'Ajuste de inventario' },
        apply_discount:       { icon: svgIconHTML('tag', 16), label: 'Descuento aplicado' }
    };
    const tipo    = TIPOS[log.action_type] || { icon: '🔒', label: log.action_type };
    const sucursal = log.branch?.name || 'Sucursal principal';
    const fecha   = new Date(log.createdAt).toLocaleString('es-MX', {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
        hour: '2-digit', minute: '2-digit', second: '2-digit'
    });

    let before = null, after = null;
    try { before = log.before_data ? JSON.parse(log.before_data) : null; } catch {}
    try { after  = log.after_data  ? JSON.parse(log.after_data)  : null; } catch {}

    const formatObj = (obj) => {
        if (!obj) return '<em style="color:#9ca3af;">Sin datos</em>';
        return Object.entries(obj).map(([k, v]) =>
            `<div style="margin-bottom:4px;"><span style="color:#6b7280;font-size:0.85em;">${esc(k)}:</span> <strong>${esc(String(v ?? ''))}</strong></div>`
        ).join('');
    };

    // Crear/reutilizar modal
    let modal = document.getElementById('modal-reporte-audit');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'modal-reporte-audit';
        modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px;';
        document.body.appendChild(modal);
    }

    modal.innerHTML = `
        <div style="background:white;border-radius:12px;padding:24px;max-width:560px;width:100%;max-height:80vh;overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,0.3);">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:16px;">
                <div>
                    <div style="font-size:1.4em; margin-bottom:4px;">${tipo.icon} <strong>${tipo.label}</strong></div>
                    <div style="color:#6b7280; font-size:0.9em;">${esc(log.target_description || '')}</div>
                </div>
                <button onclick="document.getElementById('modal-reporte-audit').style.display='none'"
                    style="font-size:1.3em;border:none;background:none;cursor:pointer;color:#9ca3af;padding:0 4px;">✕</button>
            </div>

            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px;">
                <div style="background:#f9fafb;border-radius:8px;padding:12px;">
                    <div style="font-size:0.75em;color:#9ca3af;margin-bottom:6px;font-weight:600;">EMPLEADO</div>
                    <div style="font-weight:600;">${esc(log.employee_name)}</div>
                </div>
                <div style="background:#f9fafb;border-radius:8px;padding:12px;">
                    <div style="font-size:0.75em;color:#9ca3af;margin-bottom:6px;font-weight:600;">SUCURSAL</div>
                    <div style="font-weight:600;">${svgIconHTML('map-pin', 14)} ${esc(sucursal)}</div>
                </div>
            </div>

            <div style="background:#f9fafb;border-radius:8px;padding:12px;margin-bottom:16px;">
                <div style="font-size:0.75em;color:#9ca3af;margin-bottom:4px;font-weight:600;">FECHA Y HORA</div>
                <div style="font-weight:500;font-size:0.9em;">${esc(fecha)}</div>
            </div>

            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
                <div style="background:#fef2f2;border-radius:8px;padding:12px;">
                    <div style="font-size:0.75em;color:#ef4444;margin-bottom:8px;font-weight:700;">ANTES</div>
                    ${formatObj(before)}
                </div>
                <div style="background:#f0fdf4;border-radius:8px;padding:12px;">
                    <div style="font-size:0.75em;color:#16a34a;margin-bottom:8px;font-weight:700;">DESPUÉS</div>
                    ${formatObj(after)}
                </div>
            </div>
        </div>`;
    modal.style.display = 'flex';
    modal.onclick = (e) => { if (e.target === modal) modal.style.display = 'none'; };
}
