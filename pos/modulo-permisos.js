// ============================================
// MÓDULO: Permisos y Roles
// ============================================

// ============================================
// PERMISOS POR ROL (en Ajustes)
// ============================================

// ─── Catálogo de iconos disponibles para puestos ─────────────────────────────
const PUESTOS_ICONOS = {
    person:    '<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>',
    briefcase: '<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/><line x1="12" x2="12" y1="12" y2="16"/><line x1="10" x2="14" y1="14" y2="14"/></svg>',
    chef:      '<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 13a6 6 0 1 1 12 0v1H6v-1z"/><rect x="6" y="14" width="12" height="7" rx="1"/><line x1="9" x2="9" y1="14" y2="21"/><line x1="15" x2="15" y1="14" y2="21"/></svg>',
    utensils:  '<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2"/><path d="M7 2v20"/><path d="M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3z"/></svg>',
    delivery:  '<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="3" width="15" height="13" rx="1"/><path d="M16 8h4l3 3v5h-7V8z"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>',
    star:      '<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>',
    shield:    '<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>',
    clipboard: '<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="2" width="6" height="4" rx="1"/><rect x="3" y="5" width="18" height="17" rx="2"/><path d="M9 12h6"/><path d="M9 16h6"/></svg>',
    cash:      '<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2"/><path d="M6 12h.01M18 12h.01"/></svg>',
    headset:   '<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-5zm14 0h3v5a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2z"/><path d="M5 11V9a7 7 0 0 1 14 0v2"/></svg>',
    wrench:    '<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>',
    scissors:  '<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><line x1="20" x2="8.12" y1="4" y2="15.88"/><line x1="14.47" x2="8.12" y1="14.48" y2="20.12"/><line x1="20" x2="13.53" y1="20" y2="13.53"/></svg>',
};

let _iconPickerSeleccionado = 'person';
let _permisosRolCache     = null; // Cache de permisos efectivos (solo la parte activa)
let _permisosRolFullCache = null; // Cache completo incluyendo keys __b_* de otras sucursales
let _branchActualData     = null; // Datos de la sucursal activa {id, phone, address, ...}

// Construye el objeto de permisos_roles completo para guardar,
// preservando las otras sucursales (keys __b_*) y usando la key correcta según sucursalIdActual.
function _buildFullPermisosDesktop(permisos) {
    const full = _permisosRolFullCache ? JSON.parse(JSON.stringify(_permisosRolFullCache)) : {};
    if (sucursalIdActual) {
        full[`__b_${sucursalIdActual}`] = permisos;
        return full;
    } else {
        // Guardar globalmente, preservando keys de otras sucursales
        const branchKeys = {};
        Object.keys(full).filter(k => k.startsWith('__b_')).forEach(k => { branchKeys[k] = full[k]; });
        return { ...permisos, ...branchKeys };
    }
}

async function cargarPermisosAjustes(preloadedSettings = null) {
    const cardPermisos = document.getElementById('card-permisos-rol');
    if (!cardPermisos) return;

    // Solo visible para administrador
    if (rolActivo !== 'dueno') {
        cardPermisos.classList.add('hidden');
        return;
    }
    cardPermisos.classList.remove('hidden');

    let permisos = {
        cajero:    { ...PERMISOS_DEFAULT.cajero },
        encargado: { ...PERMISOS_DEFAULT.encargado }
    };
    try {
        let guardados = {};
        if (modoConectado && apiClient && tokenActual) {
            const cloudSettings = preloadedSettings || await apiClient.getSettings();
            guardados = cloudSettings.permisos_roles || {};
            console.log('[Puestos] fuente=nube preloaded=', !!preloadedSettings, 'permisos_roles=', JSON.stringify(guardados).substring(0, 120));
            if (Object.keys(guardados).length > 0) {
                await window.api.guardarAjuste('permisos_roles', JSON.stringify(guardados)).catch(() => {});
            }
        } else {
            const ajustes = await window.api.obtenerAjustes();
            guardados = JSON.parse(ajustes.permisos_roles || '{}');
            console.log('[Puestos] fuente=SQLite modoConectado=', modoConectado, 'token=', !!tokenActual);
        }
        _permisosRolFullCache = JSON.parse(JSON.stringify(guardados));
        // Usar config de la sucursal activa si existe
        // Si hay sucursal pero sin config propia: solo puestos base sin custom roles de otras sucursales
        let efectivos;
        if (sucursalIdActual) {
            efectivos = guardados[`__b_${sucursalIdActual}`]
                ? guardados[`__b_${sucursalIdActual}`]
                : { cajero: guardados.cajero || {}, encargado: guardados.encargado || {} };
        } else {
            efectivos = Object.fromEntries(Object.entries(guardados).filter(([k]) => !k.startsWith('__b_')));
        }
        Object.keys(efectivos).forEach(k => {
            permisos[k] = { ...(permisos[k] || {}), ...efectivos[k] };
        });
    } catch(e) {
        console.error('[Puestos] error nube:', e.message, '— usando SQLite como respaldo');
        // Nube falló — intentar leer del SQLite local como respaldo
        try {
            const ajustes = await window.api.obtenerAjustes();
            const guardadosLocal = JSON.parse(ajustes.permisos_roles || '{}');
            _permisosRolFullCache = JSON.parse(JSON.stringify(guardadosLocal));
            let efectivosLocal;
            if (sucursalIdActual) {
                efectivosLocal = guardadosLocal[`__b_${sucursalIdActual}`]
                    ? guardadosLocal[`__b_${sucursalIdActual}`]
                    : { cajero: guardadosLocal.cajero || {}, encargado: guardadosLocal.encargado || {} };
            } else {
                efectivosLocal = Object.fromEntries(Object.entries(guardadosLocal).filter(([k]) => !k.startsWith('__b_')));
            }
            Object.keys(efectivosLocal).forEach(k => {
                permisos[k] = { ...(permisos[k] || {}), ...efectivosLocal[k] };
            });
        } catch { /* usa defaults */ }
    }
    // Guardar en memoria para que guardarPermisosRol use datos frescos
    _permisosRolCache = JSON.parse(JSON.stringify(permisos));

    const secciones = [
        { clave: 'ver_dashboard',   label: 'Dashboard' },
        { clave: 'ver_nueva_venta', label: 'Nueva Venta' },
        { clave: 'ver_pedidos',     label: 'Pedidos' },
        { clave: 'ver_turno',       label: 'Turno / Caja' },
        { clave: 'ver_mesas',       label: 'Mesas' },
        { clave: 'ver_productos',   label: 'Productos' },
        { clave: 'ver_clientes',    label: 'Clientes' },
        { clave: 'ver_ofertas',     label: 'Ofertas' },
        { clave: 'ver_inventario',  label: 'Inventario' },
        { clave: 'ver_ajustes',     label: 'Ajustes' },
    ];

    // Roles fijos + roles custom guardados
    const rolesBuiltin = [
        { key: 'cajero',    label: 'Cajero',    iconKey: 'person'    },
        { key: 'encargado', label: 'Encargado', iconKey: 'briefcase' },
    ];
    const rolesCustom = Object.keys(permisos)
        .filter(k => permisos[k]._custom === true)
        .map(k => ({ key: k, label: permisos[k]._label || k, iconKey: permisos[k]._icon || 'person', custom: true }));
    const roles = [...rolesBuiltin, ...rolesCustom];

    function _renderPuestoRow(r) {
        const p = permisos[r.key] || {};
        const activo   = p.enabled === true;
        const tienePin = p.pin_set === true;
        const nombreGuardado = p.nombre || '';
        const iconSvg  = PUESTOS_ICONOS[r.iconKey] || PUESTOS_ICONOS.person;
        const funcs = secciones.map(s => `
            <div class="puesto-funcion-item">
                <span>${s.label}</span>
                <label class="switch switch-sm">
                    <input type="checkbox" data-rol="${r.key}" data-permiso="${s.clave}"
                        ${p[s.clave] !== false ? 'checked' : ''}
                        onchange="guardarPermisosRol()">
                    <span class="slider"></span>
                </label>
            </div>`).join('');

        const btnEliminar = r.custom ? `
            <button onclick="eliminarPuestoCustom('${r.key}', '${esc(r.label).replace(/'/g, "\\'")}')"
                    title="Eliminar puesto"
                    style="background:none;border:none;cursor:pointer;color:#9ca3af;padding:4px;margin-left:4px;display:flex;align-items:center;"
                    onmouseover="this.style.color='#ef4444'" onmouseout="this.style.color='#9ca3af'">
                <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
            </button>` : '';

        return `
        <div class="puesto-row" id="puesto-row-${r.key}">
            <div class="puesto-header">
                <div style="display:flex;align-items:center;gap:10px;">
                    <span style="display:flex;align-items:center;color:#374151;">${iconSvg}</span>
                    <div>
                        <strong>${esc(r.label)}</strong>
                        <div id="puesto-estado-${r.key}" style="font-size:12px;color:var(--text-muted);">${activo ? 'Activo' : 'Desactivado'}</div>
                    </div>
                </div>
                <div style="display:flex;align-items:center;">
                    ${btnEliminar}
                    <label class="switch">
                        <input type="checkbox" id="puesto-enabled-${r.key}" data-rol="${r.key}" data-permiso="enabled"
                            ${activo ? 'checked' : ''}
                            onchange="togglePuestoEnabled('${r.key}', this.checked)">
                        <span class="slider"></span>
                    </label>
                </div>
            </div>
            <div class="puesto-funciones" id="puesto-funciones-${r.key}" style="${activo ? '' : 'display:none;'}">
                <div style="margin-bottom:14px;">
                    <label style="font-size:13px;font-weight:600;display:block;margin-bottom:6px;">Nombre de la persona</label>
                    <input type="text" id="puesto-nombre-${r.key}" value="${esc(nombreGuardado)}"
                           placeholder="Ej: María, Juan..."
                           style="width:100%;padding:8px 12px;border:1px solid var(--border);border-radius:8px;font-size:14px;box-sizing:border-box;"
                           onblur="guardarNombrePuesto('${r.key}', this.value)">
                    <p style="font-size:12px;color:var(--text-muted);margin:4px 0 0;">Se usa para identificar el turno y la pantalla de selección de perfil.</p>
                </div>
                <div class="permisos-collapsible">
                    <div class="permisos-collapsible-header" onclick="togglePermisosCollapsible(this)">
                        <span style="font-size:12px;color:var(--text-muted);">Secciones visibles para este puesto</span>
                        <svg class="permisos-chevron" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
                    </div>
                    <div class="permisos-collapsible-body" style="display:none;">
                        ${funcs}
                    </div>
                </div>
                <div class="puesto-pin-section">
                    <strong style="font-size:13px;">PIN de acceso</strong>
                    <p style="font-size:12px;color:var(--text-muted);margin:3px 0 10px;display:flex;align-items:center;gap:5px;">
                        ${tienePin
                            ? '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#16a34a" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg><span style="color:#16a34a;">PIN configurado.</span>'
                            : 'Sin PIN — cualquiera puede seleccionar este perfil.'}
                    </p>
                    <div style="display:flex;gap:8px;align-items:center;">
                        <input type="password" id="puesto-pin-${r.key}" placeholder="${tienePin ? 'Nuevo PIN para reemplazar' : '4-8 dígitos'}"
                               inputmode="numeric" maxlength="8"
                               style="flex:1;padding:8px 12px;border:1px solid var(--border);border-radius:8px;font-size:14px;">
                        <button class="btn-primary" style="white-space:nowrap;" onclick="guardarPinPerfil('${r.key}')">
                            ${tienePin ? 'Cambiar' : 'Guardar PIN'}
                        </button>
                    </div>
                    ${tienePin ? `
                    <button class="btn-secondary" onclick="quitarPinPerfil('${r.key}')"
                            style="margin-top:8px;width:100%;color:#ef4444;border-color:#fecaca;display:flex;align-items:center;justify-content:center;gap:6px;">
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
                        Quitar PIN de ${esc(r.label)}
                    </button>` : ''}
                </div>
            </div>
        </div>`;
    }

    const container = document.getElementById('puestos-container');
    container.innerHTML = roles.map(_renderPuestoRow).join('');

    // Administrador siempre al final
    container.innerHTML += `
        <div class="puesto-row puesto-row-admin">
            <div class="puesto-header">
                <div style="display:flex;align-items:center;gap:10px;">
                    <span style="display:flex;align-items:center;color:#374151;"><svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/><polyline points="16 11 17.5 12.5 21 9"/></svg></span>
                    <div>
                        <strong>Administrador</strong>
                        <div style="font-size:12px;color:var(--text-muted);">Siempre activo — acceso completo</div>
                    </div>
                </div>
                <label class="switch" style="opacity:0.5;pointer-events:none;">
                    <input type="checkbox" checked disabled>
                    <span class="slider"></span>
                </label>
            </div>
        </div>

        <button id="btn-nuevo-puesto" onclick="mostrarFormNuevoPuesto()"
                style="width:100%;margin-top:16px;padding:10px;border:2px dashed #d1d5db;border-radius:10px;background:none;cursor:pointer;color:#6b7280;font-size:0.9em;display:flex;align-items:center;justify-content:center;gap:8px;transition:border-color 0.15s,color 0.15s;"
                onmouseover="this.style.borderColor='#4f46e5';this.style.color='#4f46e5'" onmouseout="this.style.borderColor='#d1d5db';this.style.color='#6b7280'">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" x2="12" y1="5" y2="19"/><line x1="5" x2="19" y1="12" y2="12"/></svg>
            Nuevo puesto
        </button>

        <div id="form-nuevo-puesto" style="display:none;margin-top:12px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:10px;padding:16px;">
            <p style="font-weight:600;margin:0 0 12px;font-size:0.9em;">Nuevo puesto</p>
            <div class="input-group" style="margin-bottom:14px;">
                <label style="font-size:13px;">Nombre del puesto</label>
                <input type="text" id="nuevo-puesto-nombre" placeholder="Ej: Cocinero, Mesero, Bartender..."
                       style="padding:8px 12px;border:1px solid #d1d5db;border-radius:6px;width:100%;box-sizing:border-box;font-size:14px;">
            </div>
            <div class="input-group" style="margin-bottom:14px;">
                <label style="font-size:13px;display:block;margin-bottom:8px;">Icono</label>
                <div id="icono-picker-grid" style="display:grid;grid-template-columns:repeat(6,1fr);gap:8px;"></div>
            </div>
            <div style="display:flex;gap:8px;">
                <button class="btn-primary" style="flex:1;" onclick="crearNuevoPuesto()">Crear puesto</button>
                <button class="btn-secondary" onclick="cancelarFormNuevoPuesto()">Cancelar</button>
            </div>
        </div>`;
}

function togglePuestoEnabled(rol, activo) {
    const funciones = document.getElementById(`puesto-funciones-${rol}`);
    const subtitulo = document.getElementById(`puesto-estado-${rol}`);
    if (funciones) funciones.style.display = activo ? '' : 'none';
    if (subtitulo) subtitulo.textContent = activo ? 'Activo' : 'Desactivado';
    guardarPermisosRol();
    actualizarVisibilidadBtnCambiarPerfil();
}

function togglePermisosCollapsible(header) {
    const body = header.nextElementSibling;
    const chevron = header.querySelector('.permisos-chevron');
    const abierto = body.style.display !== 'none';
    body.style.display = abierto ? 'none' : '';
    chevron.classList.toggle('permisos-chevron-open', !abierto);
}

async function guardarPermisosRol() {
    // Usar cache en memoria (cargado desde nube/local en cargarPermisosAjustes)
    // para no perder datos de otra plataforma por leer SQLite obsoleto
    let permisos;
    if (_permisosRolCache) {
        permisos = JSON.parse(JSON.stringify(_permisosRolCache));
    } else {
        permisos = {
            cajero:    { ...PERMISOS_DEFAULT.cajero },
            encargado: { ...PERMISOS_DEFAULT.encargado }
        };
        try {
            const ajustes = await window.api.obtenerAjustes();
            const guardados = JSON.parse(ajustes.permisos_roles || '{}');
            let efectivos;
            if (sucursalIdActual && guardados[`__b_${sucursalIdActual}`]) {
                efectivos = guardados[`__b_${sucursalIdActual}`];
            } else {
                efectivos = Object.fromEntries(Object.entries(guardados).filter(([k]) => !k.startsWith('__b_')));
            }
            Object.keys(efectivos).forEach(k => {
                permisos[k] = { ...(permisos[k] || {}), ...efectivos[k] };
            });
        } catch(e) {}
    }

    document.querySelectorAll('#puestos-container input[data-rol]').forEach(cb => {
        const rol     = cb.dataset.rol;
        const permiso = cb.dataset.permiso;
        if (!permisos[rol]) permisos[rol] = {};
        permisos[rol][permiso] = cb.checked;
    });

    const toSave = _buildFullPermisosDesktop(permisos);
    try {
        await window.api.guardarAjuste('permisos_roles', JSON.stringify(toSave));
        _permisosRolCache     = JSON.parse(JSON.stringify(permisos));
        _permisosRolFullCache = JSON.parse(JSON.stringify(toSave));
        if (modoConectado && apiClient && tokenActual) {
            apiClient.saveSettings({ permisos_roles: toSave }).catch(() => {});
        }
        if (turnoActivo) aplicarPermisos();
    } catch(e) {
        mostrarNotificacionExito('Error guardando configuración', 'Error');
    }
}

async function guardarPinPerfil(rol) {
    const input = document.getElementById(`puesto-pin-${rol}`);
    const pin = input?.value?.trim();

    if (!pin || pin.length < 4) {
        mostrarNotificacionExito('El PIN debe tener al menos 4 dígitos', 'Error');
        return;
    }
    if (!/^\d+$/.test(pin)) {
        mostrarNotificacionExito('El PIN solo puede contener números', 'Error');
        return;
    }

    let permisos;
    if (_permisosRolCache) {
        permisos = JSON.parse(JSON.stringify(_permisosRolCache));
    } else {
        permisos = { cajero: { ...PERMISOS_DEFAULT.cajero }, encargado: { ...PERMISOS_DEFAULT.encargado } };
        try {
            const ajustes = await window.api.obtenerAjustes();
            const guardados = JSON.parse(ajustes.permisos_roles || '{}');
            let efectivos;
            if (sucursalIdActual && guardados[`__b_${sucursalIdActual}`]) {
                efectivos = guardados[`__b_${sucursalIdActual}`];
            } else {
                efectivos = Object.fromEntries(Object.entries(guardados).filter(([k]) => !k.startsWith('__b_')));
            }
            Object.keys(efectivos).forEach(k => { permisos[k] = { ...(permisos[k] || {}), ...efectivos[k] }; });
        } catch(e) {}
    }

    if (!permisos[rol]) permisos[rol] = {};

    // Intentar hash bcrypt vía backend (más seguro); fallback a SHA-256 local si no hay conexión
    if (modoConectado && apiClient && tokenActual) {
        try {
            const { hash } = await apiClient.hashPin(pin);
            permisos[rol].pin_bcrypt = hash;
            permisos[rol].pin = hash; // también guardar en pin para compatibilidad
        } catch (e) {
            // Sin conexión: fallback a SHA-256 local
            permisos[rol].pin = await hashPin(pin);
        }
    } else {
        permisos[rol].pin = await hashPin(pin);
    }
    permisos[rol].pin_set = true;

    const toSave = _buildFullPermisosDesktop(permisos);
    try {
        await window.api.guardarAjuste('permisos_roles', JSON.stringify(toSave));
        _permisosRolCache     = JSON.parse(JSON.stringify(permisos));
        _permisosRolFullCache = JSON.parse(JSON.stringify(toSave));
        if (modoConectado && apiClient && tokenActual) {
            apiClient.saveSettings({ permisos_roles: toSave }).catch(() => {});
        }
        mostrarNotificacionExito(`PIN de ${rol} configurado`, '¡Listo!');
        cargarPermisosAjustes();
    } catch(e) {
        mostrarNotificacionExito('Error guardando PIN', 'Error');
    }
}

async function quitarPinPerfil(rol) {
    let permisos;
    if (_permisosRolCache) {
        permisos = JSON.parse(JSON.stringify(_permisosRolCache));
    } else {
        permisos = { cajero: { ...PERMISOS_DEFAULT.cajero }, encargado: { ...PERMISOS_DEFAULT.encargado } };
        try {
            const ajustes = await window.api.obtenerAjustes();
            const guardados = JSON.parse(ajustes.permisos_roles || '{}');
            let efectivos;
            if (sucursalIdActual && guardados[`__b_${sucursalIdActual}`]) {
                efectivos = guardados[`__b_${sucursalIdActual}`];
            } else {
                efectivos = Object.fromEntries(Object.entries(guardados).filter(([k]) => !k.startsWith('__b_')));
            }
            Object.keys(efectivos).forEach(k => { permisos[k] = { ...(permisos[k] || {}), ...efectivos[k] }; });
        } catch(e) {}
    }

    if (permisos[rol]) { delete permisos[rol].pin; permisos[rol].pin_set = false; }

    const toSave = _buildFullPermisosDesktop(permisos);
    try {
        await window.api.guardarAjuste('permisos_roles', JSON.stringify(toSave));
        _permisosRolCache     = JSON.parse(JSON.stringify(permisos));
        _permisosRolFullCache = JSON.parse(JSON.stringify(toSave));
        if (modoConectado && apiClient && tokenActual) {
            apiClient.saveSettings({ permisos_roles: toSave }).catch(() => {});
        }
        mostrarNotificacionExito(`PIN de ${rol} eliminado`, '¡Listo!');
        cargarPermisosAjustes();
    } catch(e) {
        mostrarNotificacionExito('Error guardando cambios', 'Error');
    }
}

async function guardarNombrePuesto(rol, nombre) {
    const nombreLimpio = (nombre || '').trim();
    // Actualizar cache en memoria
    if (_permisosRolCache) {
        if (!_permisosRolCache[rol]) _permisosRolCache[rol] = {};
        _permisosRolCache[rol].nombre = nombreLimpio;
    }
    // Leer permisos completos y guardar
    let permisos;
    if (_permisosRolCache) {
        permisos = JSON.parse(JSON.stringify(_permisosRolCache));
    } else {
        permisos = { cajero: { ...PERMISOS_DEFAULT.cajero }, encargado: { ...PERMISOS_DEFAULT.encargado } };
        try {
            const ajustes = await window.api.obtenerAjustes();
            const guardados = JSON.parse(ajustes.permisos_roles || '{}');
            Object.keys(guardados).forEach(k => { permisos[k] = { ...(permisos[k] || {}), ...guardados[k] }; });
        } catch(e) {}
    }
    if (!permisos[rol]) permisos[rol] = {};
    permisos[rol].nombre = nombreLimpio;
    const toSave = _buildFullPermisosDesktop(permisos);
    try {
        await window.api.guardarAjuste('permisos_roles', JSON.stringify(toSave));
        _permisosRolCache     = JSON.parse(JSON.stringify(permisos));
        _permisosRolFullCache = JSON.parse(JSON.stringify(toSave));
        if (modoConectado && apiClient && tokenActual) {
            apiClient.saveSettings({ permisos_roles: toSave }).catch(() => {});
        }
    } catch(e) {
        mostrarNotificacionExito('Error guardando nombre', 'Error');
    }
}

// ─── Nuevo puesto ────────────────────────────────────────────────────────────

function mostrarFormNuevoPuesto() {
    document.getElementById('btn-nuevo-puesto').style.display = 'none';
    const form = document.getElementById('form-nuevo-puesto');
    form.style.display = '';
    document.getElementById('nuevo-puesto-nombre').value = '';
    _iconPickerSeleccionado = 'person';

    // Renderizar el picker de iconos
    const grid = document.getElementById('icono-picker-grid');
    if (grid) {
        grid.innerHTML = Object.keys(PUESTOS_ICONOS).map(key => `
            <div id="icono-pick-${key}" onclick="seleccionarIconoPuesto('${key}')"
                 title="${key}"
                 style="border:2px solid ${key === _iconPickerSeleccionado ? '#4f46e5' : '#e5e7eb'};
                        background:${key === _iconPickerSeleccionado ? '#ede9fe' : '#fff'};
                        border-radius:8px;padding:8px;cursor:pointer;
                        display:flex;align-items:center;justify-content:center;
                        color:${key === _iconPickerSeleccionado ? '#4f46e5' : '#374151'};
                        transition:border-color 0.1s,background 0.1s;">
                ${PUESTOS_ICONOS[key]}
            </div>`).join('');
    }
    document.getElementById('nuevo-puesto-nombre').focus();
}

function cancelarFormNuevoPuesto() {
    document.getElementById('form-nuevo-puesto').style.display = 'none';
    document.getElementById('btn-nuevo-puesto').style.display = '';
}

function seleccionarIconoPuesto(key) {
    _iconPickerSeleccionado = key;
    Object.keys(PUESTOS_ICONOS).forEach(k => {
        const el = document.getElementById(`icono-pick-${k}`);
        if (!el) return;
        const sel = k === key;
        el.style.borderColor  = sel ? '#4f46e5' : '#e5e7eb';
        el.style.background   = sel ? '#ede9fe' : '#fff';
        el.style.color        = sel ? '#4f46e5' : '#374151';
    });
}

async function crearNuevoPuesto() {
    const nombre = document.getElementById('nuevo-puesto-nombre').value.trim();
    if (!nombre) {
        mostrarNotificacionExito('Escribe un nombre para el puesto', 'Error');
        return;
    }
    const key = 'custom_' + Date.now();
    let permisos = { cajero: { ...PERMISOS_DEFAULT.cajero }, encargado: { ...PERMISOS_DEFAULT.encargado } };
    try {
        const ajustes = await window.api.obtenerAjustes();
        const guardados = JSON.parse(ajustes.permisos_roles || '{}');
        Object.keys(guardados).forEach(k => { permisos[k] = { ...(permisos[k] || {}), ...guardados[k] }; });
    } catch(e) {}

    permisos[key] = {
        _custom: true,
        _label:  nombre,
        _icon:   _iconPickerSeleccionado,
        enabled: true,
        ver_dashboard:   false,
        ver_nueva_venta: true,
        ver_pedidos:     true,
        ver_turno:       false,
        ver_mesas:       true,
        ver_productos:   false,
        ver_clientes:    false,
        ver_ofertas:     false,
        ver_inventario:  false,
        ver_ajustes:     false,
    };

    try {
        await window.api.guardarAjuste('permisos_roles', JSON.stringify(permisos));
        if (modoConectado && apiClient && tokenActual) {
            apiClient.saveSettings({ permisos_roles: permisos }).catch(() => {});
        }
        mostrarNotificacionExito(`Puesto "${nombre}" creado`, '¡Listo!');
        cargarPermisosAjustes();
    } catch(e) {
        mostrarNotificacionExito('Error al crear el puesto', 'Error');
    }
}

async function eliminarPuestoCustom(key, label) {
    if (!(await confirmarZenit(`Se eliminará el puesto "${label}" y su configuración de permisos.`, '¿Eliminar puesto?', { textoOk: 'Eliminar', peligro: true }))) return;
    let permisos = { cajero: { ...PERMISOS_DEFAULT.cajero }, encargado: { ...PERMISOS_DEFAULT.encargado } };
    try {
        const ajustes = await window.api.obtenerAjustes();
        const guardados = JSON.parse(ajustes.permisos_roles || '{}');
        Object.keys(guardados).forEach(k => { permisos[k] = { ...(permisos[k] || {}), ...guardados[k] }; });
    } catch(e) {}

    delete permisos[key];

    try {
        await window.api.guardarAjuste('permisos_roles', JSON.stringify(permisos));
        if (modoConectado && apiClient && tokenActual) {
            apiClient.saveSettings({ permisos_roles: permisos }).catch(() => {});
        }
        mostrarNotificacionExito(`Puesto "${label}" eliminado`, '');
        cargarPermisosAjustes();
    } catch(e) {
        mostrarNotificacionExito('Error al eliminar el puesto', 'Error');
    }
}
