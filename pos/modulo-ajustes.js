// ============================================
// MÓDULO: Ajustes, Cuenta Zenit, Sucursales
// ============================================

/* ============================================
   CUENTA ZENIT — Registro y sesión
   ============================================ */

function mostrarLoginZenit() {
    document.getElementById('zenit-form-registro').style.display = 'none';
    document.getElementById('zenit-form-login').style.display = '';
}

function mostrarRegistroZenit() {
    document.getElementById('zenit-form-login').style.display = 'none';
    document.getElementById('zenit-form-registro').style.display = '';
}

async function cargarCuentaZenitAjustes() {
    const ajustes = await window.api.obtenerAjustes();
    const token = await window.api.obtenerTokenSeguro();
    const nombre = ajustes.zenit_user_name;
    const email = ajustes.zenit_user_email;

    const sinCuenta = document.getElementById('zenit-sin-cuenta');
    const conCuenta = document.getElementById('zenit-con-cuenta');
    if (!sinCuenta) return;

    if (token && nombre) {
        sinCuenta.style.display = 'none';
        conCuenta.style.display = '';
        document.getElementById('zenit-nombre-mostrar').textContent = nombre;
        document.getElementById('zenit-email-mostrar').textContent = email || '';
    } else {
        sinCuenta.style.display = '';
        conCuenta.style.display = 'none';
    }
    actualizarCardMiPlan();
}

async function registrarCuentaZenit() {
    const nombre = document.getElementById('zenit-nombre').value.trim();
    const email = document.getElementById('zenit-email').value.trim();
    const password = document.getElementById('zenit-password').value;
    const errorDiv = document.getElementById('zenit-error-registro');

    errorDiv.style.display = 'none';

    if (!nombre || !email || !password) {
        errorDiv.textContent = 'Completa todos los campos.';
        errorDiv.style.display = '';
        return;
    }
    if (password.length < 6) {
        errorDiv.textContent = 'La contraseña debe tener al menos 6 caracteres.';
        errorDiv.style.display = '';
        return;
    }

    const btn = document.querySelector('#zenit-form-registro .btn-primary');
    if (btn) { btn.disabled = true; btn.textContent = 'Creando cuenta...'; }

    try {
        const ajustes = await window.api.obtenerAjustes();
        const backendUrl = ajustes.api_url || 'https://zenit-pos-backend.onrender.com/api';
        if (!apiClient) window.apiClient = new APIClient(backendUrl);
        apiClient.setBaseURL(backendUrl);

        const response = await apiClient.register(nombre, email, password);

        await window.api.guardarTokenSeguro(response.token); // Token cifrado
        await window.api.guardarAjuste('api_url', backendUrl);
        await window.api.guardarAjuste('zenit_user_name', response.user.name);
        await window.api.guardarAjuste('zenit_user_email', email);
        await window.api.guardarAjuste('plan', response.user.plan || 'free');
        await window.api.guardarAjuste('plan_expires_at', response.user.plan_expires_at || '');

        await window.api.guardarAjuste('modo_conectado', 'true');

        apiClient.setToken(response.token);
        tokenActual = response.token;
        modoConectado = true;

        await window.api.guardarAjuste('pedir_password_inicio', 'true');
        const switchPwd = document.getElementById('adj-pedir-password');
        if (switchPwd) switchPwd.checked = true;

        await syncLocalToCloud();
        await cargarPlanInfo();
        await cargarCuentaZenitAjustes();
        mostrarNotificacionExito('Cuenta creada y datos sincronizados', '¡Bienvenido a Zenit!');
    } catch (error) {
        errorDiv.textContent = error.message || 'Error al crear la cuenta. Intenta de nuevo.';
        errorDiv.style.display = '';
    } finally {
        if (btn) { btn.disabled = false; btn.textContent = 'Crear cuenta'; }
    }
}

async function iniciarSesionZenitAjustes() {
    const email = document.getElementById('zenit-email-login').value.trim();
    const password = document.getElementById('zenit-password-login').value;
    const errorDiv = document.getElementById('zenit-error-login');

    errorDiv.style.display = 'none';

    if (!email || !password) {
        errorDiv.textContent = 'Ingresa tu email y contraseña.';
        errorDiv.style.display = '';
        return;
    }

    const btn = document.querySelector('#zenit-form-login .btn-primary');
    if (btn) { btn.disabled = true; btn.textContent = 'Conectando...'; }

    try {
        const ajustes = await window.api.obtenerAjustes();
        const backendUrl = ajustes.api_url || 'https://zenit-pos-backend.onrender.com/api';
        if (!apiClient) window.apiClient = new APIClient(backendUrl);
        apiClient.setBaseURL(backendUrl);

        // Verificar si hay pedidos locales "anónimos" antes de iniciar sesión
        const pendientesLocales = await window.api.obtenerPedidosPendientes();
        let subirAnonimos = false;
        if (pendientesLocales && pendientesLocales.length > 0) {
            subirAnonimos = confirm(
                `Tienes ${pendientesLocales.length} pedido(s) registrado(s) sin cuenta.\n\n` +
                '¿Subirlos a tu cuenta?\n\n' +
                'Acepta → se suben a tu cuenta\n' +
                'Cancela → se descartan (no se pierden del historial local hasta cerrar sesión)'
            );
        }

        const response = await apiClient.login(email, password);

        await window.api.guardarTokenSeguro(response.token); // Token cifrado
        await window.api.guardarAjuste('api_url', backendUrl);
        await window.api.guardarAjuste('zenit_user_name', response.user.name);
        await window.api.guardarAjuste('zenit_user_email', email);
        await window.api.guardarAjuste('plan', response.user.plan || 'free');
        await window.api.guardarAjuste('plan_expires_at', response.user.plan_expires_at || '');

        await window.api.guardarAjuste('modo_conectado', 'true');

        apiClient.setToken(response.token);
        tokenActual = response.token;
        modoConectado = true;
        actualizarIndicadorModo();

        if (subirAnonimos) {
            await subirPedidosPendientes();
        } else if (pendientesLocales && pendientesLocales.length > 0) {
            // Marcar como sincronizados para que no se suban automáticamente al arrancar
            for (const p of pendientesLocales) {
                await window.api.marcarPedidoSincronizado(p.id);
            }
        }

        // Sincronizar todos los datos del backend
        sincronizarDesdeBackend().catch(e => console.warn('syncDesdeBackend:', e));
        cargarPlanInfo().catch(() => {});
        iniciarKDSPolling();
        iniciarSyncInventario();

        await cargarCuentaZenitAjustes();
        mostrarNotificacionExito('Sesión iniciada', '¡Bienvenido!');
    } catch (error) {
        errorDiv.textContent = error.message || 'Email o contraseña incorrectos.';
        errorDiv.style.display = '';
    } finally {
        if (btn) { btn.disabled = false; btn.textContent = 'Iniciar sesión'; }
    }
}

async function cerrarSesionZenit() {
    if (!confirm('¿Cerrar sesión? Los datos se sincronizarán con tu cuenta antes de salir.')) return;

    // Detener SSE y polling para evitar fugas y requests huérfanos durante el cierre de sesión
    try { detenerSyncInventario(); } catch {}
    try { detenerKDSPolling(); } catch {}

    // 1. Subir pedidos pendientes ANTES de limpiar local
    try {
        const pendientes = await window.api.obtenerPedidosPendientes();
        if (pendientes && pendientes.length > 0) {
            mostrarNotificacionExito('Sincronizando...', `Subiendo ${pendientes.length} pedido(s) antes de cerrar sesión`);
            await subirPedidosPendientes();
        }
    } catch (e) {
        console.warn('Error al subir pedidos antes de cerrar sesión:', e);
    }

    // 2. Limpiar credenciales y datos locales (ahora están seguros en la nube)
    await window.api.guardarTokenSeguro('');
    await window.api.guardarAjuste('api_token', '');
    await window.api.guardarAjuste('modo_conectado', 'false');
    await window.api.guardarAjuste('pedir_password_inicio', 'false');
    await window.api.guardarAjuste('zenit_user_name', '');
    await window.api.guardarAjuste('zenit_user_email', '');
    await window.api.limpiarDatosLocales();
    location.reload();
}

function mostrarCambiarPasswordApp() {
    const form = document.getElementById('form-cambiar-password');
    if (!form) return;
    const visible = form.style.display !== 'none';
    form.style.display = visible ? 'none' : 'block';
    if (!visible) document.getElementById('nueva-password-app')?.focus();
}

async function guardarNuevaPasswordApp() {
    const nueva = document.getElementById('nueva-password-app').value;
    const confirmar = document.getElementById('confirm-password-app').value;
    if (nueva.length < 4) { alert('La contraseña debe tener al menos 4 caracteres'); return; }
    if (nueva !== confirmar) { alert('Las contraseñas no coinciden'); return; }
    await window.api.establecerPasswordApp(nueva);
    document.getElementById('form-cambiar-password').style.display = 'none';
    document.getElementById('nueva-password-app').value = '';
    document.getElementById('confirm-password-app').value = '';
    mostrarNotificacionExito('Contraseña del sistema actualizada', '¡Listo!');
}

// ==========================================
// SUCURSALES
// ==========================================

async function guardarYRecargarSucursal() {
    const sel = document.getElementById('aj-sucursal-id');
    const valor = sel ? sel.value : '';
    sucursalIdActual = parseInt(valor) || null;
    await window.api.guardarAjuste('sucursal_id', valor);
    mostrarNotificacionExito('Sucursal guardada', 'Actualizando datos...');
    // Re-sincronizar pedidos y datos con el filtro de la nueva sucursal
    await sincronizarDesdeBackend();
    // Recargar permisos de empleados y teléfono/dirección de la nueva sucursal
    cargarPermisosAjustes().catch(() => {});
    if (sucursalIdActual && modoConectado && apiClient) {
        apiClient.getBranches().then(branches => {
            const b = (branches || []).find(x => x.id === sucursalIdActual) || null;
            _branchActualData = b;
            if (b) {
                const _set = (id, val) => { const el = document.getElementById(id); if (el && val !== undefined) el.value = val || ''; };
                if (b.phone   != null) _set('adj-telefono-negocio',  b.phone);
                if (b.address != null) _set('adj-direccion-negocio', b.address);
            }
        }).catch(() => {});
    } else {
        _branchActualData = null;
    }
    // Refrescar vista de mesas si está abierta
    const vistaActiva = document.querySelector('.view.active');
    if (vistaActiva && vistaActiva.id === 'view-mesas') {
        await cargarVistaMesas();
    }
}

async function cargarSucursalesAjustes() {
    if (!modoConectado || !apiClient || !tokenActual) return;
    const sel = document.getElementById('aj-sucursal-id');
    if (!sel) return;
    try {
        let branches = await apiClient.request('/branches');
        // Si no hay ninguna sucursal, crear la primera automáticamente
        if (!branches || branches.length === 0) {
            const nueva = await apiClient.request('/branches', {
                method: 'POST',
                body: { name: 'Esta sucursal' }
            });
            branches = [nueva];
        }
        // Si hay exactamente una sucursal y este dispositivo no tiene ninguna asignada, asignarla automáticamente
        if (branches.length === 1 && !sucursalIdActual) {
            sucursalIdActual = branches[0].id;
            await window.api.guardarAjuste('sucursal_id', String(sucursalIdActual));
        }
        // Limpiar opciones excepto la primera (sin sucursal)
        while (sel.options.length > 1) sel.remove(1);
        (branches || []).forEach(b => {
            const opt = document.createElement('option');
            opt.value = b.id;
            opt.textContent = b.name;
            if (sucursalIdActual === b.id) opt.selected = true;
            sel.appendChild(opt);
        });
        sel.addEventListener('change', async () => {
            sucursalIdActual = parseInt(sel.value) || null;
            await window.api.guardarAjuste('sucursal_id', sel.value);
            // Recargar permisos de empleados y teléfono/dirección para la nueva sucursal
            const _set = (id, val) => { const el = document.getElementById(id); if (el && val !== undefined) el.value = val || ''; };
            if (sucursalIdActual) {
                const b = (branches || []).find(x => x.id === sucursalIdActual) || null;
                _branchActualData = b;
                if (b) {
                    if (b.phone   != null) _set('adj-telefono-negocio',  b.phone);
                    if (b.address != null) _set('adj-direccion-negocio', b.address);
                }
            } else {
                _branchActualData = null;
            }
            cargarPermisosAjustes().catch(() => {});
        });
        await cargarTabsSucursales(branches);
    } catch (e) {
        console.error('Error cargando sucursales:', e);
    }
}

async function cargarTabsSucursales(branches) {
    const container = document.getElementById('branch-tabs-container');
    if (!container) return;
    if (!branches || branches.length <= 1) {
        container.style.display = 'none';
        return;
    }
    container.innerHTML = '';
    container.style.display = 'flex';

    // Inicializar vista a la sucursal activa de este dispositivo si aún no se eligió nada
    if (sucursalVistaActual === null && sucursalIdActual) {
        sucursalVistaActual = sucursalIdActual;
    }

    // Orden: sucursal activa primero, luego las demás, "Todas" al final
    const sorted = [...branches].sort((a, b) => {
        if (a.id === sucursalIdActual) return -1;
        if (b.id === sucursalIdActual) return 1;
        return 0;
    });

    sorted.forEach(b => {
        const btn = document.createElement('button');
        btn.className = 'branch-tab' + (b.id === sucursalVistaActual ? ' active' : '');
        btn.textContent = b.name;
        btn.onclick = () => cambiarSucursalVista(b.id, btn, container);
        container.appendChild(btn);
    });

    const btnTodas = document.createElement('button');
    btnTodas.className = 'branch-tab' + (sucursalVistaActual === null ? ' active' : '');
    btnTodas.textContent = 'Todas';
    btnTodas.onclick = () => cambiarSucursalVista(null, btnTodas, container);
    container.appendChild(btnTodas);
}

async function cambiarSucursalVista(branchId, activeBtn, container) {
    sucursalVistaActual = branchId;
    if (container) {
        container.querySelectorAll('.branch-tab').forEach(b => b.classList.remove('active'));
    }
    if (activeBtn) activeBtn.classList.add('active');
    await cargarDashboard();
}

async function abrirGestorSucursales() {
    const modal = document.getElementById('modal-gestor-sucursales');
    if (!modal) return;
    modal.classList.remove('hidden');
    await recargarListaSucursales();
}

async function recargarListaSucursales() {
    const tbody = document.getElementById('lista-sucursales-body');
    if (!tbody) return;
    try {
        const branches = await apiClient.request('/branches');
        tbody.innerHTML = '';
        (branches || []).forEach(b => {
            const esEsteDispositivo = sucursalIdActual === b.id;
            const tr = document.createElement('tr');
            const badge = esEsteDispositivo
                ? ` <span style="background:#ede9fe;color:#7c3aed;font-size:0.75em;padding:2px 6px;border-radius:10px;font-weight:600;">${svgIconHTML('map-pin', 12)} Este dispositivo</span>`
                : '';
            const btnEliminar = esEsteDispositivo ? '' : `<button class="btn-danger small" onclick="desactivarSucursal(${b.id}, '${(b.name||'').replace(/'/g,"\\'")}')">Eliminar</button>`;
            const svgLapiz = '<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:4px;vertical-align:middle;"><path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/><path d="m15 5 4 4"/></svg>';
            tr.innerHTML = `<td>${b.name}${badge}</td><td>${b.address || '—'}</td><td>Activa</td>
                <td><div style="display:flex;gap:6px;align-items:center;">
                <button class="btn-secondary small" style="display:inline-flex;align-items:center;" onclick="editarSucursal(${b.id}, '${(b.name||'').replace(/'/g,"\\'")}', '${(b.address||'').replace(/'/g,"\\'")}', '${(b.phone||'').replace(/'/g,"\\'")}')"><span style="display:flex;align-items:center;gap:4px;">${svgLapiz}Editar</span></button>
                ${btnEliminar}</div></td>`;
            tbody.appendChild(tr);
        });
    } catch (e) {
        console.error('Error cargando sucursales:', e);
    }
}

function mostrarFormNuevaSucursal() {
    const f = document.getElementById('form-nueva-sucursal');
    if (f) f.style.display = '';
}

function ocultarFormNuevaSucursal() {
    const f = document.getElementById('form-nueva-sucursal');
    if (f) f.style.display = 'none';
    ['ns-nombre','ns-direccion','ns-telefono'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });
}

async function guardarNuevaSucursal() {
    const nombre = document.getElementById('ns-nombre')?.value?.trim();
    if (!nombre) { alert('El nombre de la sucursal es requerido'); return; }
    const direccion = document.getElementById('ns-direccion')?.value?.trim() || '';
    const telefono = document.getElementById('ns-telefono')?.value?.trim() || '';
    const checkboxes = document.querySelectorAll('#form-nueva-sucursal input[type="checkbox"][value]');
    const clone_options = [...checkboxes].filter(c => c.checked).map(c => c.value);
    try {
        await apiClient.request('/branches', {
            method: 'POST',
            body: { name: nombre, address: direccion, phone: telefono, clone_options }
        });
        ocultarFormNuevaSucursal();
        await recargarListaSucursales();
        await cargarSucursalesAjustes();
        mostrarNotificacionExito('Sucursal creada correctamente', '¡Listo!');
    } catch (e) {
        alert('Error al crear la sucursal: ' + (e.message || 'Error desconocido'));
    }
}

async function desactivarSucursal(id, nombre) {
    if (!confirm(`¿Eliminar la sucursal "${nombre}"?\n\nSus pedidos no se borran, pero esta sucursal dejará de aparecer.`)) return;
    try {
        await apiClient.request(`/branches/${id}`, { method: 'DELETE' });
        await recargarListaSucursales();
        await cargarSucursalesAjustes();
    } catch (e) {
        alert('Error al desactivar la sucursal');
    }
}

function editarSucursal(id, nombre, direccion) {
    document.getElementById('es-id').value = id;
    document.getElementById('es-nombre').value = nombre;
    document.getElementById('es-direccion').value = direccion;
    document.getElementById('form-nueva-sucursal').style.display = 'none';
    document.getElementById('form-editar-sucursal').style.display = '';
    document.getElementById('es-nombre').focus();
}

function cerrarFormEditarSucursal() {
    document.getElementById('form-editar-sucursal').style.display = 'none';
}

async function guardarEditarSucursal() {
    const id = document.getElementById('es-id').value;
    const nombre = document.getElementById('es-nombre').value.trim();
    const direccion = document.getElementById('es-direccion').value.trim();
    if (!nombre) { alert('El nombre es requerido'); return; }
    try {
        await apiClient.request(`/branches/${id}`, {
            method: 'PUT',
            body: { name: nombre, address: direccion }
        });
        cerrarFormEditarSucursal();
        await recargarListaSucursales();
        await cargarSucursalesAjustes();
        mostrarNotificacionExito('Sucursal actualizada', '¡Listo!');
    } catch (e) {
        alert('Error al actualizar la sucursal');
    }
}

async function cargarUrlKDS() {
    try {
        const urls = await window.api.kdsGetUrl();
        const elUrls = document.getElementById('kds-urls');
        const elNo   = document.getElementById('kds-no-disponible');
        if (!elUrls || !elNo) return;
        if (urls && urls.local) {
            document.getElementById('kds-url-local').textContent = urls.local;
            const lanUrl = urls.red || urls.local;
            document.getElementById('kds-url-lan').textContent = lanUrl;

            // QR code via servicio público (requiere internet en la red)
            const qrImg = document.getElementById('kds-qr-img');
            if (qrImg && lanUrl !== urls.local) {
                const qrSrc = `https://api.qrserver.com/v1/create-qr-code/?size=100x100&data=${encodeURIComponent(lanUrl)}`;
                qrImg.src = qrSrc;
                qrImg.style.display = 'block';
                document.getElementById('kds-qr-fallback').style.display = 'none';
            }

            elUrls.style.display = 'block';
            elNo.style.display   = 'none';
        }
    } catch (e) {
        console.warn('cargarUrlKDS:', e);
    }
}

function abrirKDSLocal() {
    const url = document.getElementById('kds-url-local')?.textContent;
    if (url) window.open(url, '_blank');
}

function toggleKdsQr() {
    const container = document.getElementById('kds-qr-container');
    const btn       = document.getElementById('kds-qr-toggle');
    if (!container) return;
    const visible = container.style.display === 'flex';
    container.style.display = visible ? 'none' : 'flex';
    if (btn) {
        const svgIcon = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="3" height="3"/></svg>';
        btn.innerHTML = svgIcon + (visible ? ' Mostrar QR' : ' Ocultar QR');
    }
}

function copiarUrl(elementId) {
    const texto = document.getElementById(elementId)?.textContent;
    if (!texto) return;
    navigator.clipboard.writeText(texto).then(() => {
        mostrarNotificacionExito('URL copiada al portapapeles', '');
    }).catch(() => {
        // Fallback para Electron
        const el = document.createElement('textarea');
        el.value = texto;
        document.body.appendChild(el);
        el.select();
        document.execCommand('copy');
        document.body.removeChild(el);
        mostrarNotificacionExito('URL copiada al portapapeles', '');
    });
}

// ── KDS: Dispositivos de confianza ──────────────────────────────────────────
let _kdsDispositivoPendiente = null;

async function cargarDispositivosKDS() {
    try {
        const dispositivos = await window.api.kdsObtenerDispositivos();
        const contenedor = document.getElementById('kds-dispositivos-lista');
        if (!contenedor) return;
        if (!dispositivos || dispositivos.length === 0) {
            contenedor.innerHTML = '<span style="color:#9ca3af;">No hay dispositivos registrados.</span>';
            return;
        }
        const confianza = dispositivos.filter(d => d.confianza === 1);
        const bloqueados = dispositivos.filter(d => d.confianza === 0);
        let html = '';
        if (confianza.length > 0) {
            html += confianza.map(d => `
                <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 0;border-bottom:1px solid #f3f4f6;">
                    <div>
                        <span style="font-weight:600;color:#111827;">${escapeHTML(d.nombre || d.ip)}</span>
                        <span style="color:#9ca3af;margin-left:6px;font-size:0.82em;">${escapeHTML(d.ip)}</span>
                        <div style="font-size:0.75em;color:#9ca3af;">${d.fecha_conexion ? new Date(d.fecha_conexion).toLocaleDateString() : ''}</div>
                    </div>
                    <button onclick="eliminarDispositivoKDS(${d.id})" style="background:none;border:1px solid #fca5a5;color:#dc2626;padding:4px 10px;border-radius:6px;font-size:0.78em;cursor:pointer;">Eliminar</button>
                </div>
            `).join('');
        }
        if (bloqueados.length > 0) {
            html += '<div style="margin-top:8px;font-size:0.78em;color:#9ca3af;">Bloqueados:</div>';
            html += bloqueados.map(d => `
                <div style="display:flex;align-items:center;justify-content:space-between;padding:6px 0;border-bottom:1px solid #f3f4f6;opacity:0.6;">
                    <span>${escapeHTML(d.ip)}</span>
                    <button onclick="eliminarDispositivoKDS(${d.id})" style="background:none;border:1px solid #d1d5db;color:#6b7280;padding:3px 8px;border-radius:6px;font-size:0.75em;cursor:pointer;">Quitar</button>
                </div>
            `).join('');
        }
        contenedor.innerHTML = html;
    } catch (e) {
        console.warn('cargarDispositivosKDS:', e);
    }
}

function escapeHTML(str) {
    const div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
}

function mostrarModalDispositivoKDS(data) {
    _kdsDispositivoPendiente = data;
    const modal = document.getElementById('modal-kds-dispositivo');
    if (!modal) return;
    document.getElementById('kds-nuevo-ip').textContent = data.ip;
    document.getElementById('kds-nuevo-ua').textContent = (data.userAgent || '').substring(0, 120);
    document.getElementById('kds-nuevo-nombre').value = '';
    modal.style.display = 'flex';
}

async function aprobarDispositivoKDS() {
    if (!_kdsDispositivoPendiente) return;
    const nombre = document.getElementById('kds-nuevo-nombre')?.value?.trim() || _kdsDispositivoPendiente.ip;
    try {
        await window.api.kdsAprobarDispositivo({
            ip: _kdsDispositivoPendiente.ip,
            userAgent: _kdsDispositivoPendiente.userAgent,
            nombre
        });
        mostrarNotificacionExito('Dispositivo aprobado', `${nombre} puede conectarse al KDS`);
    } catch (e) {
        console.error('Error aprobando dispositivo:', e);
    }
    document.getElementById('modal-kds-dispositivo').style.display = 'none';
    _kdsDispositivoPendiente = null;
    cargarDispositivosKDS();
}

async function rechazarDispositivoKDS() {
    if (!_kdsDispositivoPendiente) return;
    try {
        await window.api.kdsRechazarDispositivo({
            ip: _kdsDispositivoPendiente.ip,
            userAgent: _kdsDispositivoPendiente.userAgent
        });
    } catch (e) {
        console.error('Error rechazando dispositivo:', e);
    }
    document.getElementById('modal-kds-dispositivo').style.display = 'none';
    _kdsDispositivoPendiente = null;
    cargarDispositivosKDS();
}

async function eliminarDispositivoKDS(id) {
    try {
        await window.api.kdsEliminarDispositivo(id);
        cargarDispositivosKDS();
    } catch (e) {
        console.error('Error eliminando dispositivo KDS:', e);
    }
}

function toggleKdsNotificaciones(checked) {
    if (window.api && window.api.guardarAjuste) {
        window.api.guardarAjuste('kds_notif_nuevos', checked ? '1' : '0');
    }
}

// Inicializar listener de dispositivos nuevos
if (window.api && window.api.onKdsDispositivoNuevo) {
    window.api.onKdsDispositivoNuevo((data) => {
        // Siempre mostrar modal cuando llega un dispositivo nuevo
        mostrarModalDispositivoKDS(data);

        // Toast opcional si toggle activo
        const toggle = document.getElementById('kds-notif-toggle');
        if (toggle && toggle.checked) {
            mostrarNotificacionExito('Dispositivo nuevo', `IP: ${data.ip} quiere conectarse al KDS`);
        }
    });
}

async function cargarAjustesInstalados() {
    try {
        console.log("Sincronizando ajustes...");
        let ajustes = await window.api.obtenerAjustes();

        // Si está conectado, traer datos frescos de la nube (fuente de verdad compartida)
        let _cloudSettingsCache = null;
        if (modoConectado && apiClient && tokenActual) {
            try {
                _cloudSettingsCache = await apiClient.getSettings();
                ajustes = { ...ajustes, ..._cloudSettingsCache };
            } catch { /* sin conexión: usar SQLite local */ }
        }

        // Información del negocio — campos básicos
        const _set = (id, val) => { const el = document.getElementById(id); if (el && val !== undefined) el.value = val || ''; };
        _set('adj-nombre-negocio',    ajustes.business_name);
        _set('adj-telefono-negocio',  ajustes.business_phone);
        _set('adj-email-negocio',     ajustes.business_email);
        _set('adj-website-negocio',   ajustes.business_website);
        _set('adj-rfc-negocio',       ajustes.business_rfc);
        _set('adj-instagram-negocio', ajustes.business_instagram);
        _set('adj-ciudad-negocio',    ajustes.business_city);
        _set('adj-estado-negocio',    ajustes.business_state);
        _set('adj-direccion-negocio', ajustes.business_address);
        _set('adj-ticket-footer',     ajustes.ticket_footer);
        // Si hay sucursal activa, sobrescribir teléfono y dirección con los de la sucursal
        if (sucursalIdActual && modoConectado && apiClient && tokenActual) {
            apiClient.getBranches().then(branches => {
                _branchActualData = (branches || []).find(b => b.id === sucursalIdActual) || null;
                if (_branchActualData) {
                    if (_branchActualData.phone    != null) _set('adj-telefono-negocio',  _branchActualData.phone);
                    if (_branchActualData.address  != null) _set('adj-direccion-negocio', _branchActualData.address);
                }
            }).catch(() => {});
        } else {
            _branchActualData = null;
        }
        const tipoEl = document.getElementById('adj-tipo-negocio');
        if (tipoEl && ajustes.business_tipo !== undefined) tipoEl.value = ajustes.business_tipo || '';

        // Ajustes de ticket — checkboxes
        const _chk = (id, val, defaultVal = false) => { const el = document.getElementById(id); if (el) el.checked = val !== undefined ? (val === true || val === 'true') : defaultVal; };
        _chk('adj-show-logo',      ajustes.show_logo,      true);
        _chk('adj-show-phone',     ajustes.show_phone,     true);
        _chk('adj-show-direccion', ajustes.show_direccion, true);
        _chk('adj-show-email',     ajustes.show_email);
        _chk('adj-show-website',   ajustes.show_website);
        _chk('adj-show-instagram', ajustes.show_instagram);
        _chk('adj-show-rfc',       ajustes.show_rfc);

        // Moneda
        if(ajustes.currency_symbol && document.getElementById('adj-moneda'))
            document.getElementById('adj-moneda').value = ajustes.currency_symbol;

        // Logo
        if(ajustes.logo_path && document.getElementById('adj-logo-path')) {
            document.getElementById('adj-logo-path').value = ajustes.logo_path;
            if(document.getElementById('preview-logo-ajustes')) {
                document.getElementById('preview-logo-ajustes').src = ajustes.logo_path;
            }
        }

        // Stock en Nueva Venta
        if(document.getElementById('adj-mostrar-stock'))
            document.getElementById('adj-mostrar-stock').checked = (ajustes.mostrar_stock_venta === 'true');

        // Venta sin turno (default activo — solo se desactiva si el usuario lo apagó explícitamente)
        ventaSinTurno = !(ajustes.venta_sin_turno === false || ajustes.venta_sin_turno === 'false');
        if(document.getElementById('adj-venta-sin-turno'))
            document.getElementById('adj-venta-sin-turno').checked = ventaSinTurno;

        // Modo oscuro
        if(ajustes.dark_mode === 'true') {
            const checkDark = document.getElementById('adj-darkmode');
            if(checkDark) checkDark.checked = true;
            document.body.classList.add('dark-mode');
        }

        // Impresoras
        const selectImp = document.getElementById('adj-impresora');
        if (selectImp) {
            // Limpiar opciones existentes (excepto la primera que es "Impresora del Sistema")
            while (selectImp.options.length > 1) {
                selectImp.remove(1);
            }

            const impresoras = await window.api.obtenerImpresoras().catch(() => []);
            impresoras.forEach(imp => {
                const opt = document.createElement('option');
                opt.value = imp.name;
                opt.innerText = imp.name;
                if(ajustes.impresora === imp.name) opt.selected = true;
                selectImp.appendChild(opt);
            });
        }

        // Agregar event listeners para guardar automáticamente
        agregarListenersGuardadoAjustes();

        // Permisos por rol (solo dueño) — pasamos la nube ya descargada para evitar doble llamada
        cargarPermisosAjustes(_cloudSettingsCache);

        // Sistema de puntos — usar los ajustes de nube ya descargados si los hay
        // También guardar en SQLite para que actualizarPanelPuntosVenta() los lea correctamente
        if (_cloudSettingsCache) {
            const bs = _cloudSettingsCache;
            if (bs.puntos_activos !== undefined) {
                ajustes.puntos_activos = bs.puntos_activos ? 'true' : 'false';
                window.api.guardarAjuste('puntos_activos', ajustes.puntos_activos);
            }
            if (bs.puntos_por_peso  !== undefined) {
                ajustes.puntos_por_peso = String(bs.puntos_por_peso);
                window.api.guardarAjuste('puntos_por_peso', ajustes.puntos_por_peso);
            }
            if (bs.puntos_bono_pedido !== undefined) {
                ajustes.puntos_bono_pedido = String(bs.puntos_bono_pedido);
                window.api.guardarAjuste('puntos_bono_pedido', ajustes.puntos_bono_pedido);
            }
            if (bs.puntos_valor !== undefined) {
                ajustes.puntos_valor = String(bs.puntos_valor);
                window.api.guardarAjuste('puntos_valor', ajustes.puntos_valor);
            }
        }
        const elPuntosActivos = document.getElementById('aj-puntos-activos');
        if (elPuntosActivos) elPuntosActivos.checked = (ajustes.puntos_activos === 'true');
        const elPuntosPeso = document.getElementById('aj-puntos-por-peso');
        if (elPuntosPeso) elPuntosPeso.value = ajustes.puntos_por_peso || '0.1';
        const elPuntosBono = document.getElementById('aj-puntos-bono');
        if (elPuntosBono) elPuntosBono.value = ajustes.puntos_bono_pedido || '0';
        const elPuntosValor = document.getElementById('aj-puntos-valor');
        if (elPuntosValor) elPuntosValor.value = ajustes.puntos_valor || '0.10';

        // PIN de descuentos
        const elReqPin = document.getElementById('aj-requiere-pin-descuento');
        if (elReqPin) {
            elReqPin.checked = (ajustes.requiere_pin_descuentos === 'true');
            const grupoPin = document.getElementById('grupo-pin-descuento');
            if (grupoPin) grupoPin.style.display = elReqPin.checked ? '' : 'none';
        }
        const elPinVal = document.getElementById('aj-pin-descuento');
        if (elPinVal) elPinVal.value = ajustes.pin_descuentos || '';

        // Switch pedir contraseña al iniciar
        const switchPwd = document.getElementById('adj-pedir-password');
        if (switchPwd) switchPwd.checked = (ajustes.pedir_password_inicio !== 'false');

        // Cuenta Zenit
        await cargarCuentaZenitAjustes();

        // Modo solo online
        const elModoOnline = document.getElementById('aj-modo-solo-online');
        if (elModoOnline) elModoOnline.checked = (ajustes.modo_solo_online === 'true');

        // Sucursales
        await cargarSucursalesAjustes();

        // KDS
        cargarUrlKDS();
        cargarDispositivosKDS();

        // Restaurar toggle de notificaciones KDS
        const kdsNotifToggle = document.getElementById('kds-notif-toggle');
        if (kdsNotifToggle && ajustes && ajustes.kds_notif_nuevos !== undefined) {
            kdsNotifToggle.checked = ajustes.kds_notif_nuevos !== '0';
        }

        console.log("Ajustes cargados con éxito.");
    } catch (error) {
        console.error("Error cargando ajustes:", error);
    }
}

// Función para agregar listeners de guardado automático
function agregarListenersGuardadoAjustes() {
    // Helper: guarda en SQLite local Y envía a la nube si está conectado
    const _guardar = async (key, value) => {
        await window.api.guardarAjuste(key, String(value));
        if (modoConectado && apiClient && tokenActual) {
            apiClient.saveSettings({ [key]: value }).catch(() => {});
        }
    };

    // Campos de texto de negocio (se guardan al salir del campo)
    const textoCampos = [
        ['adj-nombre-negocio',    'business_name'],
        ['adj-telefono-negocio',  'business_phone'],
        ['adj-email-negocio',     'business_email'],
        ['adj-website-negocio',   'business_website'],
        ['adj-rfc-negocio',       'business_rfc'],
        ['adj-instagram-negocio', 'business_instagram'],
        ['adj-ciudad-negocio',    'business_city'],
        ['adj-estado-negocio',    'business_state'],
        ['adj-direccion-negocio', 'business_address'],
        ['adj-ticket-footer',     'ticket_footer'],
    ];
    // Campos que se guardan en la sucursal activa (no en settings globales) cuando hay sucursal
    const camposPorSucursal = {
        'adj-telefono-negocio':  'phone',
        'adj-direccion-negocio': 'address',
    };
    for (const [id, key] of textoCampos) {
        const el = document.getElementById(id);
        if (!el) continue;
        el.addEventListener('blur', () => {
            const branchField = camposPorSucursal[id];
            if (branchField && sucursalIdActual && modoConectado && apiClient && tokenActual) {
                // Guardar en la sucursal específica
                apiClient.updateBranch(sucursalIdActual, { [branchField]: el.value }).catch(() => {});
            } else {
                _guardar(key, el.value);
            }
        });
    }

    // Select de tipo de negocio
    const tipoNeg = document.getElementById('adj-tipo-negocio');
    if (tipoNeg) tipoNeg.addEventListener('change', () => _guardar('business_tipo', tipoNeg.value));

    // Checkboxes de ticket (se guardan inmediatamente al cambiar)
    const checkboxCampos = [
        ['adj-show-logo',      'show_logo'],
        ['adj-show-phone',     'show_phone'],
        ['adj-show-direccion', 'show_direccion'],
        ['adj-show-email',     'show_email'],
        ['adj-show-website',   'show_website'],
        ['adj-show-instagram', 'show_instagram'],
        ['adj-show-rfc',       'show_rfc'],
    ];
    for (const [id, key] of checkboxCampos) {
        const el = document.getElementById(id);
        if (el) el.addEventListener('change', () => _guardar(key, el.checked ? 'true' : 'false'));
    }

    // Moneda
    const moneda = document.getElementById('adj-moneda');
    if (moneda) {
        moneda.addEventListener('change', async () => {
            await window.api.guardarAjuste('currency_symbol', moneda.value);
        });
    }

    // Impresora
    const impresora = document.getElementById('adj-impresora');
    if (impresora) {
        impresora.addEventListener('change', async () => {
            await window.api.guardarAjuste('impresora', impresora.value);
        });
    }

    // Venta sin turno
    const ventaSinTurnoEl = document.getElementById('adj-venta-sin-turno');
    if (ventaSinTurnoEl) {
        ventaSinTurnoEl.addEventListener('change', async () => {
            ventaSinTurno = ventaSinTurnoEl.checked;
            await window.api.guardarAjuste('venta_sin_turno', ventaSinTurnoEl.checked ? 'true' : 'false');
            if (modoConectado && apiClient && tokenActual) {
                apiClient.saveSettings({ venta_sin_turno: ventaSinTurnoEl.checked }).catch(() => {});
            }
        });
    }

    // Sistema de puntos
    const elPuntosActivos = document.getElementById('aj-puntos-activos');
    if (elPuntosActivos) {
        elPuntosActivos.addEventListener('change', () => {
            const val = elPuntosActivos.checked;
            window.api.guardarAjuste('puntos_activos', val ? 'true' : 'false');
            if (modoConectado) apiClient.saveSettings({ puntos_activos: val }).catch(() => {});
        });
    }
    const elPuntosPeso = document.getElementById('aj-puntos-por-peso');
    if (elPuntosPeso) {
        elPuntosPeso.addEventListener('change', () => {
            window.api.guardarAjuste('puntos_por_peso', elPuntosPeso.value);
            if (modoConectado) apiClient.saveSettings({ puntos_por_peso: parseFloat(elPuntosPeso.value) || 0 }).catch(() => {});
        });
    }
    const elPuntosBono = document.getElementById('aj-puntos-bono');
    if (elPuntosBono) {
        elPuntosBono.addEventListener('change', () => {
            window.api.guardarAjuste('puntos_bono_pedido', elPuntosBono.value);
            if (modoConectado) apiClient.saveSettings({ puntos_bono_pedido: parseInt(elPuntosBono.value, 10) || 0 }).catch(() => {});
        });
    }
    const elPuntosValor = document.getElementById('aj-puntos-valor');
    if (elPuntosValor) {
        elPuntosValor.addEventListener('change', () => {
            window.api.guardarAjuste('puntos_valor', elPuntosValor.value);
            if (modoConectado) apiClient.saveSettings({ puntos_valor: parseFloat(elPuntosValor.value) || 0 }).catch(() => {});
        });
    }

    // PIN de descuentos
    const elReqPin = document.getElementById('aj-requiere-pin-descuento');
    if (elReqPin) {
        elReqPin.addEventListener('change', () => {
            window.api.guardarAjuste('requiere_pin_descuentos', elReqPin.checked ? 'true' : 'false');
            const grupoPin = document.getElementById('grupo-pin-descuento');
            if (grupoPin) grupoPin.style.display = elReqPin.checked ? '' : 'none';
        });
    }
    const elPinVal = document.getElementById('aj-pin-descuento');
    if (elPinVal) {
        elPinVal.addEventListener('change', () =>
            window.api.guardarAjuste('pin_descuentos', elPinVal.value));
    }

    // Modo Solo Online
    const elModoOnline = document.getElementById('aj-modo-solo-online');
    if (elModoOnline) {
        elModoOnline.addEventListener('change', () => {
            modoSoloOnline = elModoOnline.checked;
            window.api.guardarAjuste('modo_solo_online', modoSoloOnline ? 'true' : 'false');
        });
    }
}

function toggleDarkMode(isChecked) {
    if (isChecked) {
        document.body.classList.add('dark');
        localStorage.setItem('darkMode', 'true');
    } else {
        document.body.classList.remove('dark');
        localStorage.setItem('darkMode', 'false');
    }
}

(function () {
    const darkGuardado = localStorage.getItem('darkMode') === 'true';

    if (darkGuardado) {
        document.body.classList.add('dark');
    }

    const toggle = document.querySelector('[onchange*="toggleDarkMode"]');

    if (toggle) {
        toggle.checked = darkGuardado;
    }
})();

// ==========================================
// SISTEMA DE IMPRESIÓN DE TICKETS
// ==========================================

async function imprimirTicket(pedidoId) {
    try {
        // 1. Obtener datos del pedido
        const detalles = await obtenerDetallePedidoWrapper(pedidoId);
        const pedidosResult = await obtenerPedidosWrapper({ limit: 1000 });
        const pedido = (pedidosResult.data || pedidosResult).find(p => p.id === pedidoId);

        if (!pedido || !detalles) {
            alert('No se pudo cargar la información del pedido');
            return;
        }

        // 2. Obtener ajustes (preferir nube si conectado)
        let ajustes = await window.api.obtenerAjustes().catch(() => ({}));
        if (modoConectado && apiClient && tokenActual) {
            try { const cs = await apiClient.getSettings(); ajustes = { ...ajustes, ...cs }; } catch {}
        }
        const nombreNegocio   = ajustes.business_name     || 'Mi Negocio';
        const telefonoNegocio = ajustes.business_phone    || '';
        const emailNegocio    = ajustes.business_email    || '';
        const websiteNegocio  = ajustes.business_website  || '';
        const rfcNegocio      = ajustes.business_rfc      || '';
        const instagramNeg    = ajustes.business_instagram|| '';
        const ciudadNegocio   = ajustes.business_city     || '';
        const estadoNegocio   = ajustes.business_state    || '';
        const direccionNegocio = ajustes.business_address || '';
        const ticketFooter    = ajustes.ticket_footer     || '¡Gracias por tu compra!';
        const mostrarLogo     = ajustes.show_logo      === 'true' || ajustes.show_logo      === true;
        const mostrarTelefono = ajustes.show_phone     === 'true' || ajustes.show_phone     === true;
        const mostrarDireccion= ajustes.show_direccion === 'true' || ajustes.show_direccion === true;
        const mostrarEmail    = ajustes.show_email     === 'true' || ajustes.show_email     === true;
        const mostrarWebsite  = ajustes.show_website   === 'true' || ajustes.show_website   === true;
        const mostrarInstagram= ajustes.show_instagram === 'true' || ajustes.show_instagram === true;
        const mostrarRfc      = ajustes.show_rfc       === 'true' || ajustes.show_rfc       === true;
        const moneda = ajustes.currency_symbol || '$';
        const rutaLogo = ajustes.logo_path || './assets/logo/montana.png';
        const ubicacion = [ciudadNegocio, estadoNegocio].filter(Boolean).join(', ');

        // 3. Convertir logo a base64 si existe
        let logoBase64 = '';
        if (mostrarLogo) {
            try {
                // Intentar cargar la imagen como base64
                const img = new Image();
                img.crossOrigin = 'anonymous';
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');

                await new Promise((resolve, reject) => {
                    img.onload = () => {
                        canvas.width = img.width;
                        canvas.height = img.height;
                        ctx.drawImage(img, 0, 0);
                        logoBase64 = canvas.toDataURL('image/png');
                        resolve();
                    };
                    img.onerror = () => resolve(); // Si falla, continuar sin logo
                    img.src = rutaLogo;
                });
            } catch (e) {
                console.log('No se pudo cargar el logo:', e);
            }
        }

        // 4. Formatear fecha correctamente
        let fechaFormateada = 'Fecha no disponible';
        try {
            // La fecha viene de SQLite como "fecha"
            const fechaStr = pedido.fecha;
            if (fechaStr) {
                // Reemplazar espacio con 'T' para que sea compatible con Date
                const fechaISO = fechaStr.replace(' ', 'T');
                const fecha = new Date(fechaISO);

                if (!isNaN(fecha.getTime())) {
                    fechaFormateada = fecha.toLocaleString('es-MX', {
                        year: 'numeric',
                        month: '2-digit',
                        day: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                        hour12: true
                    });
                }
            }
        } catch (e) {
            console.error('Error al formatear fecha:', e);
        }

// 4.5 Extraer solo el nombre del cliente (sin el teléfono)
        let nombreClienteTicket = '';
        if (pedido.telefono && pedido.telefono !== 'General') {
            // Toma lo que está antes del ' - ' (el nombre) y descarta el número
            nombreClienteTicket = pedido.telefono.split(' - ')[0];
        }

        // 5. Crear HTML del ticket mejorado
        const ticketHTML = `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <title>Ticket #${pedido.id}</title>
                <style>
                    @page {
                        size: 80mm auto;
                        margin: 0;
                    }
                    * {
                        margin: 0;
                        padding: 0;
                        box-sizing: border-box;
                    }
                    body {
                        font-family: 'Courier New', monospace;
                        font-size: 12px;
                        line-height: 1.4;
                        padding: 10px;
                        width: 80mm;
                    }
                    .ticket {
                        width: 100%;
                    }
                    .header {
                        text-align: center;
                        margin-bottom: 10px;
                        border-bottom: 1px dashed #000;
                        padding-bottom: 10px;
                    }
                    .logo {
                        width: 240px;
                        height: auto;
                        max-height: 240px;
                        margin: 0 auto 2px;
                        display: block;
                        object-fit: contain;
                    }
                    .negocio {
                        font-weight: bold;
                        font-size: 14px;
                        margin-bottom: 4px;
                    }
                    .info-line {
                        font-size: 10px;
                        margin: 2px 0;
                    }
                    .items {
                        margin: 10px 0;
                    }
                    .item {
                        display: flex;
                        justify-content: space-between;
                        margin: 4px 0;
                        font-size: 11px;
                    }
                    .item-name {
                        flex: 1;
                    }
                    .item-qty {
                        width: 30px;
                        text-align: center;
                    }
                    .item-price {
                        width: 60px;
                        text-align: right;
                    }
                    .nota {
                        font-size: 10px;
                        color: #666;
                        margin-left: 10px;
                        font-style: italic;
                    }
                    .separator {
                        border-top: 1px dashed #000;
                        margin: 8px 0;
                    }
                    .totales {
                        margin-top: 10px;
                    }
                    .total-line {
                        display: flex;
                        justify-content: space-between;
                        margin: 4px 0;
                        font-size: 12px;
                    }
                    .total-line.final {
                        font-weight: bold;
                        font-size: 14px;
                        margin-top: 6px;
                        padding-top: 6px;
                        border-top: 2px solid #000;
                    }
                    .footer {
                        text-align: center;
                        margin-top: 15px;
                        font-size: 11px;
                        border-top: 1px dashed #000;
                        padding-top: 10px;
                    }
                    .gracias {
                        font-weight: bold;
                        margin-top: 8px;
                    }
                    .powered-by {
                        font-size: 8px;
                        color: #999;
                        margin-top: 10px;
                    }
                    @media print {
                        body { margin: 0; }
                    }
                </style>
            </head>
            <body>
                <div class="ticket">
                    <div class="header">
                        ${mostrarLogo && logoBase64 ? `<img src="${logoBase64}" alt="Logo" class="logo">` : ''}
                        <div class="negocio">${nombreNegocio}</div>
                        ${mostrarRfc && rfcNegocio ? `<div class="info-line">RFC: ${rfcNegocio}</div>` : ''}
                        ${ubicacion ? `<div class="info-line">${ubicacion}</div>` : ''}
                        ${mostrarDireccion && direccionNegocio ? `<div class="info-line">${direccionNegocio}</div>` : ''}
                        ${mostrarTelefono && telefonoNegocio ? `<div class="info-line">Tel: ${telefonoNegocio}</div>` : ''}
                        ${mostrarEmail && emailNegocio ? `<div class="info-line">${emailNegocio}</div>` : ''}
                        ${mostrarWebsite && websiteNegocio ? `<div class="info-line">${websiteNegocio}</div>` : ''}
                        ${mostrarInstagram && instagramNeg ? `<div class="info-line">IG: ${instagramNeg}</div>` : ''}
                        <div class="separator"></div>
                        <div class="info-line"><strong>Ticket #${pedido.id}</strong></div>
                        <div class="info-line">${fechaFormateada}</div>
                        ${nombreClienteTicket ? `<div class="info-line">Cliente: ${nombreClienteTicket}</div>` : ''}
                        ${pedido.tipo_pedido ? `<div class="info-line">Tipo: ${pedido.tipo_pedido.toUpperCase()}</div>` : ''}
                    </div>

                    <div class="items">
                        ${detalles.map(item => `
                            <div class="item">
                                <span class="item-name">${esc(item.nombre)}</span>
                                <span class="item-qty">x${item.cantidad}</span>
                                <span class="item-price">${moneda}${item.precio.toFixed(2)}</span>
                            </div>
                            ${item.nota ? `<div class="nota">* ${esc(item.nota)}</div>` : ''}
                        `).join('')}
                    </div>

                    <div class="separator"></div>

                    <div class="totales">
                        <div class="total-line final">
                            <span>TOTAL:</span>
                            <span>${moneda}${pedido.total.toFixed(2)}</span>
                        </div>
                        <div class="total-line">
                            <span>Método de pago:</span>
                            <span>${esc(pedido.metodo_pago || 'N/A')}</span>
                        </div>
                    </div>

                    ${(ajustes.puntos_activos === 'true' && nombreClienteTicket) ? `
                    <div class="separator"></div>
                    <div style="text-align:center;font-size:11px;margin:6px 0;">
                        <div>${svgIconHTML('star', 14, '#f59e0b')} Puntos ganados: <b>+${Math.floor(pedido.total * parseFloat(ajustes.puntos_por_peso || '0')) + parseInt(ajustes.puntos_bono_pedido || '0')}</b></div>
                    </div>` : ''}

                    <div class="footer">
                        <div class="gracias">${ticketFooter}</div>
                        <div class="powered-by">Powered by Zenit POS</div>
                    </div>
                </div>
            </body>
            </html>
        `;

        // 6. Enviar a imprimir directamente (sin ventana emergente)
        const ajusteImpresora = await window.api.obtenerAjustes().catch(() => ({}));
        const nombreImpresora = ajusteImpresora.impresora || '';
        await window.api.imprimirTicket(ticketHTML, nombreImpresora);

    } catch (error) {
        console.error('Error al imprimir ticket:', error);
        alert('Error al generar el ticket de impresión');
    }
}

// Función auxiliar para imprimir el último pedido creado
function imprimirUltimoTicket() {
    if (window.ultimoPedidoId) {
        imprimirTicket(window.ultimoPedidoId);
    }
}

// ==========================================
// FUNCIÓN PARA SELECCIONAR LOGO
// ==========================================

async function seleccionarLogoNegocio() {
    try {
        const ruta = await window.api.seleccionarImagen();
        if (ruta) {
            // Actualizar preview
            document.getElementById('preview-logo-ajustes').src = ruta;
            document.getElementById('adj-logo-path').value = ruta;

            // Guardar en ajustes
            await window.api.guardarAjuste('logo_path', ruta);
            alert('Logo actualizado correctamente');
        }
    } catch (error) {
        console.error('Error al seleccionar logo:', error);
        alert('Error al cargar la imagen');
    }
}

// ==========================================
// VERIFICACIÓN MANUAL DE ACTUALIZACIONES
// ==========================================

async function verificarActualizacionManual() {
    const btn = document.getElementById('btn-verificar-update');
    const textOriginal = btn.innerText;

    try {
        btn.innerText = 'Verificando...';
        btn.disabled = true;

        const result = await window.api.checkForUpdates();

        // En desarrollo, checkForUpdates devuelve { available: false }
        if (result && result.available === false) {
            alert('Las actualizaciones automáticas no están disponibles en modo desarrollo.');
            return;
        }

        const versionActual = await window.api.getAppVersion();
        const versionDisponible = result && result.updateInfo && result.updateInfo.version;

        if (versionDisponible && versionDisponible !== versionActual) {
            const descargar = confirm(`Nueva versión disponible: v${versionDisponible}\nTienes instalada: v${versionActual}\n\n¿Descargar ahora? La app se reiniciará al terminar.`);
            if (descargar) {
                btn.innerText = 'Descargando...';
                await window.api.downloadUpdate();
                // El evento update-downloaded en render.js mostrará el modal de instalación
            }
        } else {
            alert(`Ya tienes la versión más reciente (v${versionActual})`);
        }

    } catch (error) {
        console.error('Error al verificar actualizaciones:', error);
        alert('No se pudo verificar actualizaciones. Verifica tu conexión a internet.');
    } finally {
        btn.innerText = textOriginal;
        btn.disabled = false;
    }
}

// Cargar versión actual al entrar a ajustes
document.addEventListener('DOMContentLoaded', async () => {
    try {
        const version = await window.api.getAppVersion();
        const versionSpan = document.getElementById('version-actual');
        if (versionSpan) {
            versionSpan.innerText = `v${version}`;
        }
        const sidebarVersion = document.getElementById('sidebar-version');
        if (sidebarVersion) {
            sidebarVersion.innerText = `v${version}`;
        }
    } catch (error) {
        console.log('No se pudo obtener la versión');
    }
});

// ==========================================
// GUARDAR TODOS LOS AJUSTES (BOTÓN MANUAL)
// ==========================================
function guardarTodosLosAjustes() {
    // Esto quita el foco de donde estés escribiendo para forzar el autoguardado del sistema
    if (document.activeElement) {
        document.activeElement.blur();
    }
    // Muestra el mensaje de éxito en pantalla
    mostrarNotificacionExito('Los ajustes se han guardado correctamente', '¡Ajustes Guardados!');
}
