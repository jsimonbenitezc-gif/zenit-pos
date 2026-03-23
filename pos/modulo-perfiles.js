// ============================================
// MÓDULO: Sistema de Perfiles
// ============================================

// ============================================
// ============================================

async function inicializarPerfil() {
    return new Promise(async (resolve) => {
        const screen = document.getElementById('perfil-screen');
        if (!screen) return resolve();

        // Leer permisos filtrados por sucursal activa (igual que cargarPermisosAjustes)
        let permisos = { cajero: { ...PERMISOS_DEFAULT.cajero }, encargado: { ...PERMISOS_DEFAULT.encargado } };
        try {
            const ajustes = await window.api.obtenerAjustes();
            const guardados = JSON.parse(ajustes.permisos_roles || '{}');
            // Aplicar filtro por sucursal: si hay sucursal activa, usar su config específica
            let efectivos;
            if (sucursalIdActual) {
                efectivos = guardados[`__b_${sucursalIdActual}`]
                    ? guardados[`__b_${sucursalIdActual}`]
                    : { cajero: guardados.cajero || {}, encargado: guardados.encargado || {} };
            } else {
                efectivos = Object.fromEntries(Object.entries(guardados).filter(([k]) => !k.startsWith('__b_')));
            }
            if (efectivos.cajero)    permisos.cajero    = { ...permisos.cajero,    ...efectivos.cajero };
            if (efectivos.encargado) permisos.encargado = { ...permisos.encargado, ...efectivos.encargado };
            // Incluir puestos custom de esta sucursal
            Object.keys(efectivos).forEach(k => {
                if (efectivos[k]?._custom === true) permisos[k] = { ...efectivos[k] };
            });
        } catch(e) { /* usa defaults */ }

        // Qué puestos están activos (cualquiera que no sea dueno)
        const puestosActivos = Object.keys(permisos).filter(k => permisos[k].enabled === true);

        // Si ningún perfil adicional está activo, saltar y entrar como Administrador
        if (puestosActivos.length === 0) {
            rolActivo = 'dueno';
            return resolve();
        }

        // Mostrar/ocultar botones builtin
        const btnCajero    = document.getElementById('perfil-btn-cajero');
        const btnEncargado = document.getElementById('perfil-btn-encargado');
        if (btnCajero)    btnCajero.style.display    = permisos.cajero?.enabled    === true ? '' : 'none';
        if (btnEncargado) btnEncargado.style.display = permisos.encargado?.enabled === true ? '' : 'none';

        // Limpiar botones custom anteriores y agregar los actuales
        const grid    = document.getElementById('perfiles-grid-container');
        const btnDueno = document.getElementById('perfil-btn-dueno');
        if (grid) {
            grid.querySelectorAll('[data-custom-perfil]').forEach(b => b.remove());
            Object.keys(permisos).forEach(k => {
                if (permisos[k]?._custom !== true || permisos[k].enabled !== true) return;
                const p = permisos[k];
                const btn = document.createElement('button');
                btn.className = 'perfil-btn';
                btn.dataset.customPerfil = k;
                btn.onclick = () => seleccionarPerfil(k);
                btn.innerHTML = `
                    <div class="perfil-icon">👤</div>
                    <div class="perfil-nombre">${esc(p._label || k)}</div>
                    <div class="perfil-desc">${esc(p.nombre || '')}</div>`;
                if (btnDueno) grid.insertBefore(btn, btnDueno);
                else grid.appendChild(btn);
            });
        }

        screen.style.display = 'flex';
        window._resolverPerfil = resolve;
    });
}

let _perfilPendiente = null; // rol esperando verificación de PIN

async function seleccionarPerfil(rol) {
    // Si el perfil tiene PIN configurado, pedir verificación primero
    if (rol !== 'dueno') {
        let permisos = {};
        try {
            const ajustes = await window.api.obtenerAjustes();
            const guardados = JSON.parse(ajustes.permisos_roles || '{}');
            if (sucursalIdActual && guardados[`__b_${sucursalIdActual}`]) {
                permisos = guardados[`__b_${sucursalIdActual}`];
            } else {
                permisos = Object.fromEntries(Object.entries(guardados).filter(([k]) => !k.startsWith('__b_')));
            }
        } catch(e) {}

        // Pre-rellenar nombre guardado en el input de la pantalla de perfil
        const nombreGuardado = permisos[rol]?.nombre || '';
        const inputNombre = document.getElementById('perfil-nombre-input');
        if (inputNombre && nombreGuardado) inputNombre.value = nombreGuardado;

        if (permisos[rol]?.pin_set && permisos[rol]?.pin) {
            _perfilPendiente = rol;
            const labels = { cajero: '🧑‍💼 Cajero', encargado: '👔 Encargado' };
            document.getElementById('pin-perfil-label').textContent = labels[rol] || rol;
            document.getElementById('pin-perfil-input').value = '';
            document.getElementById('pin-perfil-error').style.display = 'none';
            // Ocultar pantalla de perfiles para que el modal se vea claramente
            const screen = document.getElementById('perfil-screen');
            if (screen) screen.style.display = 'none';
            document.getElementById('modal-pin-perfil').classList.remove('hidden');
            setTimeout(() => document.getElementById('pin-perfil-input')?.focus(), 100);
            return;
        }
    }
    completarSeleccionPerfil(rol);
}

async function confirmarPinPerfil() {
    const pinIngresado = document.getElementById('pin-perfil-input')?.value;
    if (!pinIngresado) return;

    let permisos = {};
    try {
        const ajustes = await window.api.obtenerAjustes();
        const guardados = JSON.parse(ajustes.permisos_roles || '{}');
        if (sucursalIdActual && guardados[`__b_${sucursalIdActual}`]) {
            permisos = guardados[`__b_${sucursalIdActual}`];
        } else {
            permisos = Object.fromEntries(Object.entries(guardados).filter(([k]) => !k.startsWith('__b_')));
        }
    } catch(e) {}

    let pinValido = false;

    // Verificar PIN vía backend (soporta bcrypt + auto-migra SHA-256)
    if (modoConectado && apiClient && tokenActual) {
        try {
            const result = await apiClient.request('/settings/verify-pin', {
                method: 'POST',
                body: { role: _perfilPendiente, pin: pinIngresado }
            });
            pinValido = result.valid === true;
        } catch (e) {
            // Sin conexión: fallback a verificación local SHA-256
            const pinHash = await hashPin(pinIngresado);
            pinValido = permisos[_perfilPendiente]?.pin === pinHash;
        }
    } else {
        // Modo offline: verificación local SHA-256
        const pinHash = await hashPin(pinIngresado);
        pinValido = permisos[_perfilPendiente]?.pin === pinHash;
    }

    if (pinValido) {
        document.getElementById('modal-pin-perfil').classList.add('hidden');
        completarSeleccionPerfil(_perfilPendiente);
        _perfilPendiente = null;
    } else {
        document.getElementById('pin-perfil-error').style.display = '';
        document.getElementById('pin-perfil-input').value = '';
        document.getElementById('pin-perfil-input').focus();
    }
}

function cancelarSeleccionPerfil() {
    document.getElementById('modal-pin-perfil').classList.add('hidden');
    // Volver a mostrar la pantalla de perfiles si todavía estamos esperando selección
    if (window._resolverPerfil) {
        const screen = document.getElementById('perfil-screen');
        if (screen) screen.style.display = 'flex';
    }
    _perfilPendiente = null;
}

function completarSeleccionPerfil(rol) {
    rolActivo = rol;
    nombreActivo = document.getElementById('perfil-nombre-input')?.value?.trim() || '';
    // Comunicar el rol al proceso principal para validación de permisos en IPC
    window.api.establecerRolActivo(rol);
    const screen = document.getElementById('perfil-screen');
    if (screen) screen.style.display = 'none';
    // Actualizar botón en header con nombre del perfil activo
    const labels = { cajero: '🧑‍💼 Cajero', encargado: '👔 Encargado', dueno: '🔑 Admin' };
    const textoBtn = document.getElementById('texto-perfil-activo');
    if (textoBtn) textoBtn.textContent = labels[rol] || rol;
    const btnCambiar = document.getElementById('btn-cambiar-perfil');
    if (btnCambiar) btnCambiar.style.display = 'flex';
    // Si no es admin, mostrar el app directamente y ocultar la pantalla de login
    if (rol !== 'dueno') {
        const appDiv = document.querySelector('.app');
        if (appDiv) appDiv.style.display = '';
        const loginScreen = document.getElementById('login-screen');
        if (loginScreen) loginScreen.style.display = 'none';
    }
    if (window._resolverPerfil) {
        window._resolverPerfil();
        window._resolverPerfil = null;
    }
}

async function hashPin(pin) {
    const encoder = new TextEncoder();
    const data = encoder.encode(pin);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function actualizarVisibilidadBtnCambiarPerfil() {
    // Revisar CUALQUIER puesto activo (no solo builtin)
    const hayAlgunActivo = !!document.querySelector('#puestos-container input[data-permiso="enabled"]:checked');
    const btnCambiar = document.getElementById('btn-cambiar-perfil');
    if (btnCambiar) btnCambiar.style.display = hayAlgunActivo ? 'flex' : 'none';
}

function volverAPantallaPerfiles() {
    rolActivo = 'dueno';
    nombreActivo = '';
    const input = document.getElementById('perfil-nombre-input');
    if (input) input.value = '';
    const btnCambiar = document.getElementById('btn-cambiar-perfil');
    if (btnCambiar) btnCambiar.style.display = 'none';
    inicializarPerfil().then(async () => {
        // Si el usuario eligió Admin, verificar contraseña antes de dejar entrar
        if (rolActivo === 'dueno') {
            await inicializarLogin();
        }
        await aplicarPermisos();
        actualizarIndicadorTurnoSidebar();
        navegarAPrimeraVistaDisponible();
    });
}

// ============================================
// TURNOS — CORTE DE CAJA
// ============================================
