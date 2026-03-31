// ============================================
// RENDER.JS - NÚCLEO
// Variables globales, inicialización, SSE, navegación.
// La lógica de cada pantalla está en modulo-*.js
// ============================================

// --- SEGURIDAD: Escapar HTML para prevenir XSS ---
function esc(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// --- SEGURIDAD: Validar rutas de imagen para prevenir path traversal ---
function urlImagenSegura(ruta) {
    if (!ruta) return null;
    const normalizada = ruta.replace(/\\/g, '/');
    // Solo permitir rutas dentro de la carpeta 'imagenes' del app y sin saltos de directorio (..)
    if (!normalizada.includes('/imagenes/') || normalizada.includes('..')) return null;
    return 'file://' + ruta;
}

let clasificaciones = [];
let productosGlobales = []; 
let carrito = [];
let itemNotaEditandoIndex = null; 
let filtroActual = {}; // Filtros para pedidos
let paginaPedidos = 1; // Página actual del historial de ventas
let turnoActivo = null;
let rolActivo = 'dueno'; // 'cajero' | 'encargado' | 'dueno'
let ventaSinTurno = true; // si true, permite vender sin haber abierto turno (default: activo)

const PERMISOS_DEFAULT = {
    cajero:    { enabled: false, ver_dashboard: false, ver_nueva_venta: true,  ver_pedidos: true,  ver_turno: true,  ver_mesas: true,  ver_productos: false, ver_clientes: true,  ver_ofertas: false, ver_inventario: false, ver_ajustes: false },
    encargado: { enabled: false, ver_dashboard: true,  ver_nueva_venta: true,  ver_pedidos: true,  ver_turno: true,  ver_mesas: true,  ver_productos: true,  ver_clientes: true,  ver_ofertas: true,  ver_inventario: true,  ver_ajustes: false },
    dueno:     { enabled: true,  ver_dashboard: true,  ver_nueva_venta: true,  ver_pedidos: true,  ver_turno: true,  ver_mesas: true,  ver_productos: true,  ver_clientes: true,  ver_ofertas: true,  ver_inventario: true,  ver_ajustes: true  }
};

let nombreActivo = '';

/* ============================================
   SISTEMA DE MODO (LOCAL vs CONECTADO)
   ============================================ */

let modoConectado = false;
let apiClient = null;
let tokenActual = null;
let sucursalIdActual = null;
let modoSoloOnline = false;
let sucursalVistaActual = null;

// Plan de suscripción (se carga al arrancar y después del login)
let planActual = { plan: 'free', isPremium: false, daysLeft: 0, expiresAt: null };

// Inicializar API Client
if (typeof APIClient !== 'undefined') {
    apiClient = new APIClient('http://localhost:3000/api');
}

// Cargar configuración de modo al inicio
async function cargarConfiguracionModo() {
    try {
        const ajustes = await window.api.obtenerAjustes();
        modoConectado = ajustes.modo_conectado === 'true';
        
        if (modoConectado && ajustes.api_url) {
            apiClient.setBaseURL(ajustes.api_url);
        }
        
        if (modoConectado) {
            // Obtener token usando almacenamiento cifrado
            const token = await window.api.obtenerTokenSeguro();
            if (token) {
                apiClient.setToken(token);
                tokenActual = token;
            } else {
                // Modo conectado activo pero sin sesión → limpiar datos cloud y volver a local
                modoConectado = false;
                await window.api.guardarAjuste('modo_conectado', 'false');
                await window.api.limpiarDatosLocales();
            }
        }
        
        sucursalIdActual = parseInt(ajustes.sucursal_id) || null;
        sucursalVistaActual = sucursalIdActual; // el dashboard inicia en la sucursal activa de este dispositivo
        modoSoloOnline = ajustes.modo_solo_online === 'true';

        // Cargar plan desde ajustes guardados (funciona offline)
        cargarPlanDesdeAjustes(ajustes);

        // Si está conectado, refrescar plan desde el backend e iniciar polling
        if (modoConectado && tokenActual) {
            cargarPlanInfo().catch(() => {});
            iniciarKDSPolling();
            iniciarSyncInventario();
        }

        // Actualizar indicador visual
        actualizarIndicadorModo();

        console.log(`🔧 Modo: ${modoConectado ? 'CONECTADO' : 'LOCAL'}`);
    } catch (error) {
        console.error('Error al cargar configuración:', error);
        modoConectado = false;
        actualizarIndicadorModo();
    }
}

function actualizarIndicadorModo() {
    const iconoModo = document.getElementById('icono-modo');
    const textoModo = document.getElementById('texto-modo');
    
    if (!iconoModo || !textoModo) return;
    
    if (modoConectado) {
        iconoModo.innerHTML = '<path d="M2 20h20"/><path d="m9 10 2 2 4-4"/><rect x="3" y="4" width="18" height="12" rx="2"/>';
        textoModo.innerText = 'Modo Conectado';
    } else {
        iconoModo.innerHTML = '<path d="M2 20h20"/><path d="m15 9-6 6m0-6 6 6"/><rect x="3" y="4" width="18" height="12" rx="2"/>';
        textoModo.innerText = 'Modo Local';
    }
}


// ============================================
// SISTEMA DE ACTUALIZACIONES
// ============================================

// Configurar listeners de actualización cuando carga la página
if (window.api) {
    // Verificar versión actual
    window.api.getAppVersion().then(version => {
        console.log(`📦 Versión actual: ${version}`);
    });
    
    // Listener: Actualización disponible
    window.api.onUpdateAvailable((info) => {
        document.getElementById('update-version').innerText = `Versión ${info.version}`;
        document.getElementById('modal-actualizacion').classList.remove('hidden');
    });
    
    // Listener: Progreso de descarga
    window.api.onDownloadProgress((progress) => {
        const percent = Math.round(progress.percent);
        document.getElementById('download-progress-bar').style.width = percent + '%';
        document.getElementById('download-progress-text').innerText = `Descargando... ${percent}%`;
    });
    
    // Listener: Descarga completada
    window.api.onUpdateDownloaded((info) => {
        document.getElementById('download-progress-container').style.display = 'none';
        document.getElementById('btn-download-update').style.display = 'none';
        document.getElementById('btn-install-update').style.display = 'block';
        document.getElementById('update-message').innerText = '¡Actualización lista para instalar!';
    });

    // Listener: ventana recupera foco → re-verificar plan (ej. después de Stripe Checkout)
    window.api.onWindowFocus(() => {
        if (modoConectado && apiClient && tokenActual) {
            cargarPlanInfo().catch(() => {});
        }
    });

    // Listener: KDS cambió estado de un pedido
    window.api.onKdsEstadoCambio(async ({ pedidoId, estado }) => {
        if (!pedidoId) return;
        const colores = {
            'registrado':    { color: '#10b981', bg: '#d1fae5' },
            'en_preparacion':{ color: '#f59e0b', bg: '#fef3c7' },
            'completado':    { color: '#3b82f6', bg: '#dbeafe' },
            'entregado':     { color: '#6366f1', bg: '#e0e7ff' },
            'cancelado':     { color: '#ef4444', bg: '#fee2e2' }
        };
        try {
            // 1. Actualizar SQLite local (solo para display en pantalla Pedidos)
            await window.api.actualizarEstadoPedido(pedidoId, estado);
            // 2. NO actualizar el backend desde KDS:
            //    "Listo en cocina" ≠ "Cobrado". El backend mantiene status='registrado'
            //    hasta que el cajero confirme el cobro. De lo contrario la mesa se
            //    marcaría como libre antes de que se procese el pago.
            // 3. Parchear el select en pantalla si Pedidos está abierto
            const select = document.querySelector(`select[onchange*="cambiarEstadoPedido(${pedidoId},"]`);
            if (select) {
                const c = colores[estado];
                // Reemplazar innerHTML garantiza que todas las opciones existen
                select.innerHTML = `
                    <option value="registrado"     ${estado==='registrado'?'selected':''}>🟢 Registrado</option>
                    <option value="en_preparacion" ${estado==='en_preparacion'?'selected':''}>🟡 En preparación</option>
                    <option value="completado"     ${estado==='completado'?'selected':''}>🔵 Completado</option>
                    <option value="entregado"      ${estado==='entregado'?'selected':''}>🟣 Entregado</option>
                    <option value="cancelado"      ${estado==='cancelado'?'selected':''}>🔴 Cancelado</option>
                `;
                if (c) { select.style.background = c.bg; select.style.color = c.color; select.style.borderColor = c.color; }
            }
        } catch(err) { console.warn('kds-estado-cambio error:', err); }
    });
}

function descargarActualizacion() {
    document.getElementById('btn-download-update').disabled = true;
    document.getElementById('download-progress-container').style.display = 'block';
    window.api.downloadUpdate();
}

function instalarActualizacion() {
    window.api.installUpdate();
}

function cerrarModalActualizacion() {
    document.getElementById('modal-actualizacion').classList.add('hidden');
}

/* ============================================
   LOGIN — Contraseña de acceso al app
   ============================================ */
async function inicializarLogin() {
    const ajustesPwd = await window.api.obtenerAjustes();

    // Pedir contraseña si el switch está activado (es seguridad local, no requiere backend)
    if (ajustesPwd.pedir_password_inicio === 'true') {
        const tienePass = await window.api.tienePasswordApp();
        if (tienePass) {
            await new Promise((resolve) => {
                const screen = document.getElementById('login-screen');
                const input = document.getElementById('login-password');
                const btn = document.getElementById('login-btn');
                const error = document.getElementById('login-error');
                const subtitle = document.getElementById('login-subtitle');
                const confirmInput = document.getElementById('login-password-confirm');

                if (!screen || !input || !btn) { resolve(); return; }

                screen.style.display = 'flex';
                if (subtitle) subtitle.textContent = 'Ingresa tu contraseña para continuar';
                if (confirmInput) confirmInput.style.display = 'none';
                input.value = '';
                if (error) error.textContent = '';
                setTimeout(() => input.focus(), 100);

                const verificar = async () => {
                    const password = input.value;
                    if (!password) return;
                    btn.disabled = true;
                    const valido = await window.api.verificarPasswordApp(password);
                    btn.disabled = false;
                    if (valido) {
                        screen.style.display = 'none';
                        resolve();
                    } else {
                        if (error) error.textContent = 'Contraseña incorrecta. Intenta de nuevo.';
                        input.value = '';
                        input.focus();
                    }
                };

                btn.addEventListener('click', verificar);
                input.addEventListener('keypress', (e) => {
                    if (e.key === 'Enter') verificar();
                });
            });
        }
    }

    // Validar token usando el sistema seguro (cifrado tiene precedencia sobre legacy)
    const token = await window.api.obtenerTokenSeguro();
    if (!token) {
        // Sin token → asegurar que el modo conectado esté desactivado
        await window.api.guardarAjuste('modo_conectado', 'false');
        return;
    }

    try {
        const backendUrl = ajustesPwd.api_url || 'https://zenit-pos-backend.onrender.com/api';
        apiClient.setBaseURL(backendUrl);
        apiClient.setToken(token);
        await apiClient.request('/auth/me');
        // Token válido — mantener sesión
    } catch (e) {
        // Token inválido o expirado — limpiar sesión completamente
        await window.api.guardarTokenSeguro(null);
        await window.api.guardarAjuste('api_token', '');
        await window.api.guardarAjuste('modo_conectado', 'false');
    }
}

document.addEventListener('DOMContentLoaded', async () => {

    // ── PERFIL (primero) ────────────────────────────────
    try { await inicializarPerfil(); } catch(e) { console.error('Error inicializarPerfil:', e); }
    // ───────────────────────────────────────────────────

    // ── LOGIN (solo Administrador) ──────────────────────
    if (rolActivo === 'dueno') {
        try { await inicializarLogin(); } catch(e) { console.error('Error inicializarLogin:', e); }
    }
    // ───────────────────────────────────────────────────

    // ── TURNO ──────────────────────────────────────────
    try { await inicializarTurno(); } catch(e) { console.error('Error inicializarTurno:', e); }
    // ───────────────────────────────────────────────────

    // Cargar configuración de modo
    try { await cargarConfiguracionModo(); } catch(e) { console.error('Error cargarConfiguracionModo:', e); }

    // Sincronizar desde backend si hay sesión activa
    if (modoConectado) {
        subirPedidosPendientes().catch(e => console.warn('subirPendientes:', e));
        sincronizarDesdeBackend().catch(e => console.warn('syncDesdeBackend:', e));
        cargarSucursalesAjustes().catch(e => console.warn('cargarSucursales:', e));
    }

    const logo = document.getElementById('brand-logo');
    if (logo && window.api?.obtenerRutaLogo) {
        logo.src = window.api.obtenerRutaLogo();
    }

    configurarMenu();
    configurarBotones();
    configurarModales();
    navegarAPrimeraVistaDisponible();
    cargarSelectorEmojis('prod');
    cargarSelectorEmojis('cat');
    
    document.getElementById('buscador-venta')?.addEventListener('input', (e) => {
        filtrarProductosVenta(e.target.value);
    });

// Configurar buscadores de clientes en Nueva Venta (solo una vez)
    const inputNombre = document.getElementById('nombre-cliente');
    const inputTelefono = document.getElementById('telefono-cliente');
    
    if (inputNombre) {
        inputNombre.addEventListener('input', manejarBusquedaNombre);
        inputNombre.addEventListener('focus', manejarFocusNombre);
    }
    
    if (inputTelefono) {
        inputTelefono.addEventListener('input', manejarBusquedaTelefono);
        inputTelefono.addEventListener('focus', manejarFocusTelefono);
    }
    
cargarAjustesInstalados();

    // Cerrar sugerencias al hacer click fuera
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.cliente-selector-dual')) {
            document.getElementById('sugerencias-nombre')?.classList.add('hidden');
            document.getElementById('sugerencias-telefono')?.classList.add('hidden');
        }
    });



});

   // Listener para resize de ventana (redimensionar gráficas)
    window.addEventListener('resize', () => {
        // Solo si estamos en el dashboard
        const dashboardActivo = document.getElementById('view-dashboard')?.classList.contains('active');
        if (dashboardActivo) {
            setTimeout(() => {
                if (chartVentas) chartVentas.resize();
                if (chart24Horas) chart24Horas.resize();
            }, 100);
        }
    });

/* ============================================
   CONFIGURACIÓN DE MODALES (CERRAR AL CLICKEAR FUERA)
   ============================================ */
function configurarModales() {
    const modales = ['modalProducto', 'modalCategoria', 'modalNotas', 'modalPago'];
    
    modales.forEach(modalId => {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.addEventListener('click', (e) => {
                // Si el click fue en el fondo oscuro (no en el contenido)
                if (e.target === modal) {
                    cerrarModal(modalId);
                }
            });
        }
    });
}

function cerrarModal(modalId) {
    const funciones = {
        'modalProducto': cerrarModalProducto,
        'modalCategoria': cerrarModalCategoria,
        'modalNotas': cerrarModalNotas,
        'modalPago': cerrarModalPago
    };
    
    if (funciones[modalId]) {
        funciones[modalId]();
    }
}

/* NAVEGACIÓN */
function configurarMenu() {
    document.querySelectorAll('.menu-item').forEach(btn => {
        btn.addEventListener('click', () => cambiarVista(btn.dataset.view));
    });
}

let _mesasAutoRefreshInterval = null;

// ─── Sync de Inventario y Ajustes en tiempo real (modo conectado) ─────────────
  let _invSyncInterval  = null;
  let _invEventSource   = null;
  let _settingsEventSource = null;
  let _turnoEventSource = null;
  let _auditEventSource = null;
  let _backendProdIdCache = null; // nombre_normalizado -> id_backend
  let _backendProdIdCacheAt = 0;

// Descarga stocks actualizados del backend y actualiza SQLite local + re-renderiza si la vista está abierta.
let _inventarioSyncEnCurso = false;
  async function _actualizarInventarioDesdeBackend() {
      if (_inventarioSyncEnCurso) return; // evitar ejecuciones concurrentes que duplican receta_items
      if (!modoConectado || !apiClient || !tokenActual || modoSoloOnline) return;
      _inventarioSyncEnCurso = true;
      try {
          const branchQ = sucursalIdActual ? `?branch_id=${sucursalIdActual}` : '';
          const [insumos, preps, recetas] = await Promise.all([
              apiClient.request(`/inventory/ingredients${branchQ}`).catch(() => null),
              apiClient.request('/inventory/preparations').catch(() => null),
              apiClient.request('/inventory/all-recipes').catch(() => null),
          ]);
          if (insumos && insumos.length > 0) await window.api.syncInsumos(insumos);
          if (preps  && preps.length  > 0) await window.api.syncPreparaciones(preps);
          if (recetas) await window.api.syncRecetas(recetas);

          // Re-renderizar si la vista de inventario está activa
          if (!document.getElementById('view-inventario')?.classList.contains('hidden')) {
              insumosCache = await window.api.obtenerInsumos();
              renderizarTablaInsumos?.();
              renderizarTablaPreparaciones?.();
              renderizarTablaRecetas?.();
          }
          // Refrescar badges de stock en Nueva Venta y Mesas si están visibles
          _refrescarStockBadges();
      } catch(e) {
          console.warn('Sync inventario backend→local:', e.message);
      } finally {
          _inventarioSyncEnCurso = false;
      }
  }

function _conectarSSEInventario() {
    if (_invEventSource) { _invEventSource.close(); _invEventSource = null; }
    if (!modoConectado || !tokenActual) return;
    const sseUrl = `${apiClient.baseURL}/inventory/events?token=${tokenActual}`;
    _invEventSource = new EventSource(sseUrl);
    _invEventSource.onmessage = () => _actualizarInventarioDesdeBackend();
    _invEventSource.onerror = () => {
        _invEventSource?.close();
        _invEventSource = null;
        // Reconectar SSE tras 10s sin tocar el intervalo de polling
        setTimeout(() => { if (modoConectado && tokenActual) _conectarSSEInventario(); }, 10000);
    };
}

// Recarga ajustes de negocio desde la nube y actualiza la UI (si el tab está abierto)
async function _sincronizarAjustesDesdeCloud() {
    if (!modoConectado || !apiClient || !tokenActual) return;
    try {
        const s = await apiClient.getSettings();
        // Campos de negocio
        const campos = {
            'adj-nombre-negocio':   s.business_name,
            // Teléfono y dirección solo se actualizan desde settings globales si NO hay sucursal activa
            ...(!sucursalIdActual ? {
                'adj-telefono-negocio': s.business_phone,
                'adj-direccion-negocio':s.business_address,
            } : {}),
            'adj-email-negocio':    s.business_email,
            'adj-website-negocio':  s.business_website,
            'adj-rfc-negocio':      s.business_rfc,
            'adj-instagram-negocio':s.business_instagram,
            'adj-ciudad-negocio':   s.business_city,
            'adj-estado-negocio':   s.business_state,
            'adj-ticket-footer':    s.ticket_footer,
        };
        for (const [id, val] of Object.entries(campos)) {
            const el = document.getElementById(id);
            if (el && val !== undefined) el.value = val || '';
        }
        const tipo = document.getElementById('adj-tipo-negocio');
        if (tipo && s.business_tipo !== undefined) tipo.value = s.business_tipo || '';
        // Checkboxes de ticket
        const checks = {
            'adj-show-logo':      s.show_logo,
            'adj-show-phone':     s.show_phone,
            'adj-show-direccion': s.show_direccion,
            'adj-show-email':     s.show_email,
            'adj-show-website':   s.show_website,
            'adj-show-instagram': s.show_instagram,
            'adj-show-rfc':       s.show_rfc,
        };
        for (const [id, val] of Object.entries(checks)) {
            const el = document.getElementById(id);
            if (el && val !== undefined) el.checked = (val === true || val === 'true');
        }
        // Venta sin turno (también sincronizar variable global)
        if (s.venta_sin_turno !== undefined) {
            ventaSinTurno = !(s.venta_sin_turno === false || s.venta_sin_turno === 'false');
            const elVst = document.getElementById('adj-venta-sin-turno');
            if (elVst) elVst.checked = ventaSinTurno;
        }
        // Guardar en SQLite local los campos simples
        const guardables = {
            business_name: s.business_name, business_phone: s.business_phone,
            business_email: s.business_email, business_website: s.business_website,
            business_rfc: s.business_rfc, business_instagram: s.business_instagram,
            business_city: s.business_city, business_state: s.business_state,
            business_address: s.business_address, business_tipo: s.business_tipo,
            ticket_footer: s.ticket_footer,
            show_logo: s.show_logo, show_phone: s.show_phone, show_direccion: s.show_direccion,
            show_email: s.show_email, show_website: s.show_website,
            show_instagram: s.show_instagram, show_rfc: s.show_rfc,
            venta_sin_turno: s.venta_sin_turno,
        };
        for (const [k, v] of Object.entries(guardables)) {
            if (v !== undefined) window.api.guardarAjuste(k, String(v)).catch(() => {});
        }
        // También actualizar permisos de puestos si el tab está abierto
        // Pasamos los ajustes ya descargados para evitar una segunda llamada a la nube
        if (s.permisos_roles) {
            window.api.guardarAjuste('permisos_roles', JSON.stringify(s.permisos_roles)).catch(() => {});
        }
        cargarPermisosAjustes(s).catch(() => {});
    } catch { /* sin conexión */ }
}

function _conectarSSESettings() {
    if (_settingsEventSource) { _settingsEventSource.close(); _settingsEventSource = null; }
    if (!modoConectado || !tokenActual) return;
    const sseUrl = `${apiClient.baseURL}/settings/events?token=${tokenActual}`;
    _settingsEventSource = new EventSource(sseUrl);
    _settingsEventSource.onmessage = () => _sincronizarAjustesDesdeCloud();
    _settingsEventSource.onerror = () => {
        _settingsEventSource?.close();
        _settingsEventSource = null;
        setTimeout(() => { if (modoConectado && tokenActual) _conectarSSESettings(); }, 10000);
    };
}

function _conectarSSETurno() {
    if (_turnoEventSource) { _turnoEventSource.close(); _turnoEventSource = null; }
    if (!modoConectado || !tokenActual) return;
    const sseUrl = `${apiClient.baseURL}/turnos/events?token=${tokenActual}`;
    _turnoEventSource = new EventSource(sseUrl);
    _turnoEventSource.onmessage = async () => {
        turnoActivo = await apiClient.getTurnoActivo().catch(() => null);
        actualizarIndicadorTurnoSidebar();
        // Si el usuario está viendo la pantalla de turno, refrescar
        if (document.getElementById('turno-activo')?.closest('.vista-activa')) {
            cargarVistaTurno();
        }
    };
    _turnoEventSource.onerror = () => {
        _turnoEventSource?.close();
        _turnoEventSource = null;
        setTimeout(() => { if (modoConectado && tokenActual) _conectarSSETurno(); }, 10000);
    };
}

function _conectarSSEAudit() {
    if (_auditEventSource) { _auditEventSource.close(); _auditEventSource = null; }
    if (!modoConectado || !tokenActual) return;
    const sseUrl = `${apiClient.baseURL}/audit/events?token=${tokenActual}`;
    _auditEventSource = new EventSource(sseUrl);
    _auditEventSource.onmessage = async () => {
        // Recargar audit log si el dashboard está activo
        if (document.getElementById('view-dashboard')?.classList.contains('active')) {
            cargarAuditLog().catch(() => {});
        }
        // Mostrar notificación toast
        mostrarNotificacionExito('Se registró una nueva acción autorizada', '🔒 Acción sensible');
    };
    _auditEventSource.onerror = () => {
        _auditEventSource?.close();
        _auditEventSource = null;
        setTimeout(() => { if (modoConectado && tokenActual) _conectarSSEAudit(); }, 10000);
    };
}

function iniciarSyncInventario() {
    detenerSyncInventario();
    if (!modoConectado || !tokenActual) return;
    // Polling cada 15s garantizado (independiente del SSE)
    _invSyncInterval = setInterval(_actualizarInventarioDesdeBackend, 15000);
    // SSE para actualizaciones inmediatas (complementa el polling)
    _conectarSSEInventario();
    // SSE para ajustes del negocio en tiempo real
    _conectarSSESettings();
    // SSE para turno en tiempo real
    _conectarSSETurno();
    // SSE para auditoría de acciones sensibles en tiempo real
    _conectarSSEAudit();
    // Primera actualización inmediata al conectar
    _actualizarInventarioDesdeBackend();
}

  function detenerSyncInventario() {
      clearInterval(_invSyncInterval); _invSyncInterval = null;
      _invEventSource?.close();        _invEventSource  = null;
      _settingsEventSource?.close();   _settingsEventSource = null;
      _turnoEventSource?.close();      _turnoEventSource = null;
      _auditEventSource?.close();      _auditEventSource = null;
  }

  function _normalizarNombreProducto(nombre) {
      return (nombre || '').toLowerCase().trim();
  }

  async function _obtenerNombreProductoLocal(productoId) {
      const local = productosRecetaCache?.find(p => p.id === productoId);
      if (local?.nombre || local?.name) return local.nombre || local.name;
      try {
          const grupos = await window.api.obtenerProductosAgrupados();
          const todos = (grupos || []).flatMap(c => c.productos || []);
          const encontrado = todos.find(p => p.id === productoId);
          return encontrado?.nombre || encontrado?.name || null;
      } catch {
          return null;
      }
  }

  async function _obtenerMapaProductosBackend() {
      if (!modoConectado || !apiClient || !tokenActual) return null;
      const ahora = Date.now();
      if (_backendProdIdCache && (ahora - _backendProdIdCacheAt) < 60000) return _backendProdIdCache;
      const cloudProds = await apiClient.getProducts();
      const map = new Map();
      (cloudProds || []).forEach(p => {
          map.set(_normalizarNombreProducto(p.name), p.id);
      });
      _backendProdIdCache = map;
      _backendProdIdCacheAt = ahora;
      return map;
  }

  async function _resolverProductoBackendId(productoIdLocal) {
      const nombre = await _obtenerNombreProductoLocal(productoIdLocal);
      if (!nombre) return null;
      const map = await _obtenerMapaProductosBackend();
      return map?.get(_normalizarNombreProducto(nombre)) || null;
  }

  async function _obtenerConteoRecetaProducto(productoId) {
      try {
          const itemsLocal = await window.api.obtenerRecetaProducto(productoId);
          if (itemsLocal && itemsLocal.length > 0) return itemsLocal.length;
      } catch {}
      if (modoConectado && apiClient && tokenActual) {
          try {
              const backendProdId = await _resolverProductoBackendId(productoId);
              if (!backendProdId) return 0;
              const itemsBackend = await apiClient.request(`/inventory/products/${backendProdId}/recipe`);
              return itemsBackend?.length || 0;
          } catch {}
      }
      return 0;
  }

// Sube recetas de productos locales al backend (para las creadas en modo offline).
// Solo sube las que el backend aún no tiene. Asume que local ID = backend ID (válido
// cuando los insumos/prods ya están sincronizados en modo conectado).
  async function _sincronizarRecetasAlBackend() {
      if (!modoConectado || !apiClient || !tokenActual) return;
      try {
          const agrupados  = await window.api.obtenerProductosAgrupados();
          const todosProds = (agrupados || []).flatMap(c => c.productos || []);
          for (const prod of todosProds) {
              const backendProdId = await _resolverProductoBackendId(prod.id);
              if (!backendProdId) continue;
              const receta = await window.api.obtenerRecetaProducto(prod.id);
              if (!receta || receta.length === 0) continue;
              const items = receta.map(it => ({
                  // 'tipo' en SQLite local es 'insumo'/'preparacion'. Del backend llega 'ingredient'/'preparation'.
                  item_type: (it.tipo === 'insumo' || it.tipo === 'ingrediente' || it.tipo === 'ingredient') ? 'ingredient' : 'preparation',
                  item_id:      it.referencia_id,
                  quantity:     it.cantidad,
                  unit_recipe:  it.unidad_receta || null,
              })).filter(it => it.item_id);
              if (items.length > 0) {
                  await apiClient.request(`/inventory/products/${backendProdId}/recipe`, {
                      method: 'POST', body: { items }
                  }).catch(e => console.warn(`No se pudo sync receta prod ${prod.id}:`, e.message));
              }
          }
      } catch(e) {
          console.warn('Error sincronizando recetas al backend:', e.message);
    }
}

// ─── KDS Polling (modo conectado) ─────────────────────────────────────────────
// Sincroniza órdenes del backend al KDS local, incluyendo las de mobile.
// Rastrea por (orderId → { updatedAt, itemIds:Set }) para detectar solo items nuevos.
let _kdsPollingInterval = null;
const _kdsTracked       = new Map(); // orderId → { updatedAt, itemIds: Set<itemId> }
let   _kdsSeeded        = false;     // true tras la primera consulta (siembra)

// Marcar una orden como ya enviada al KDS (con el estado actual de sus items).
// Llamar después de enviar explícitamente al KDS desde el desktop,
// para evitar que el polling la reenvíe.
function _kdsMarcarEnviado(orderId, updatedAt, items) {
    if (!orderId) return;
    _kdsTracked.set(orderId, {
        updatedAt: updatedAt || null,
        itemIds:   new Set((items || []).map(i => i.id)),
    });
}

async function _kdsBackendPoll() {
    if (!modoConectado || !apiClient || !tokenActual) return;
    try {
        const kdsParams = { status: 'registrado', limit: 50 };
        if (sucursalIdActual) kdsParams.branch_id = sucursalIdActual;
        const data    = await apiClient.getOrders(kdsParams);
        const ordenes = data?.data || data?.rows || (Array.isArray(data) ? data : []);

        if (!_kdsSeeded) {
            // Primera ejecución: registrar lo que ya existe sin enviar al KDS.
            for (const o of ordenes) {
                _kdsTracked.set(o.id, {
                    updatedAt: o.updatedAt,
                    itemIds:   new Set((o.items || []).map(i => i.id)),
                });
            }
            _kdsSeeded = true;
            return;
        }

        for (const o of ordenes) {
            const stored = _kdsTracked.get(o.id);

            if (stored && stored.updatedAt === o.updatedAt) continue; // sin cambios

            const currentItemIds = new Set((o.items || []).map(i => i.id));

            // Determinar qué items son nuevos (no estaban en el último snapshot)
            const itemsNuevos = (o.items || []).filter(i => !stored?.itemIds?.has(i.id));

            // Actualizar tracker con estado actual
            _kdsTracked.set(o.id, { updatedAt: o.updatedAt, itemIds: currentItemIds });

            if (itemsNuevos.length === 0) continue; // cambio sin items nuevos (ej: nota editada)

            const mesa = o.table?.name || null;
            window.api.kdsNuevoPedido({
                pedidoId: o.id,
                tipo:     mesa ? 'mesa' : (o.order_type === 'domicilio' ? 'delivery' : 'mostrador'),
                mesa,
                notas:    o.notes || null,
                items:    itemsNuevos.map(i => ({
                    nombre:   i.product?.name || 'Producto',
                    cantidad: i.quantity || 1,
                    notas:    i.notes || '',
                })),
            }).catch(() => {});
        }
    } catch { /* ignorar errores de red */ }
}

function iniciarKDSPolling() {
    if (_kdsPollingInterval) return;
    _kdsBackendPoll(); // primera consulta inmediata (siembra)
    _kdsPollingInterval = setInterval(_kdsBackendPoll, 8000);
}

function detenerKDSPolling() {
    clearInterval(_kdsPollingInterval);
    _kdsPollingInterval = null;
    _kdsTracked.clear();
    _kdsSeeded = false;
}

function cambiarVista(vista) {
    // Limpiar auto-refresh de mesas al cambiar de vista
    clearInterval(_mesasAutoRefreshInterval);
    _mesasAutoRefreshInterval = null;

    // 1. Actualizar botones de la sidebar
    document.querySelectorAll('.menu-item').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.view === vista);
    });

    // 2. Ocultar todas las vistas y mostrar la seleccionada
    document.querySelectorAll('.view').forEach(v => {
        v.classList.toggle('active', v.id === `view-${vista}`);
    });

    // 3. ACTUALIZACIÓN: Lógica específica por vista
    if (vista === 'dashboard') {
        cargarDashboard();
setTimeout(() => {
            if (chartVentas) chartVentas.resize();
            if (chart24Horas) chart24Horas.resize();
        }, 100);
    } else if (vista === 'productos') {
        cargarProductosAdmin();
    } else if (vista === 'pedidos') {
        cargarPedidos();
    } else if (vista === 'nueva-venta') {
        cargarCatalogoVenta();
        if (!turnoActivo && !ventaSinTurno) {
            setTimeout(() => {
                const modal = document.getElementById('modal-turno-venta');
                if (modal) modal.classList.remove('hidden');
            }, 150);
        }
    } else if (vista === 'clientes') {
        cargarClientes();
    } else if (vista === 'ofertas') {
        if (modoConectado && !puedeAccederPremium()) {
            mostrarBloquePremium('view-ofertas');
        } else {
            document.querySelector('#view-ofertas .premium-lock-overlay')?.remove();
            cargarOfertas();
        }
    } else if (vista === 'inventario') {
        if (modoConectado && !puedeAccederPremium()) {
            mostrarBloquePremium('view-inventario');
        } else {
            document.querySelector('#view-inventario .premium-lock-overlay')?.remove();
            cargarInventario();
        }
    } else if (vista === 'ajustes') {
        cargarAjustesInstalados();
    } else if (vista === 'turno') {
        cargarVistaTurno();
    } else if (vista === 'mesas') {
        cargarVistaMesas();
        _mesasAutoRefreshInterval = setInterval(cargarVistaMesas, 20000);
        if (!turnoActivo && !ventaSinTurno) {
            setTimeout(() => {
                const modal = document.getElementById('modal-turno-venta');
                if (modal) modal.classList.remove('hidden');
            }, 150);
        }
    }


    // Actualizar el título de la cabecera
    const titulos = {
    dashboard: 'Dashboard',
    pedidos: 'Pedidos',
    productos: 'Productos',
    'nueva-venta': 'Nueva Venta',
    mesas: 'Mesas',
    clientes: 'Clientes',
    ofertas: 'Ofertas',
    inventario: 'Inventario',
    ajustes: 'Configuración ⚙️',
    turno: 'Turno / Corte de Caja'
};

    document.getElementById('page-title').innerText = titulos[vista] || 'Zenit POS';
}

function configurarBotones() {
    document.getElementById('btnNuevoProducto').addEventListener('click', () => abrirModalProducto());
    document.getElementById('btnNuevaCategoria').addEventListener('click', () => abrirModalCategoria());
}

function mostrarNotificacionExito(mensaje, titulo = '¡Operación Exitosa!') {
    const toast = document.getElementById('toast-success');
    const tituloEl = toast.querySelector('.toast-msg strong');
    const subtextEl = document.getElementById('toast-subtext');
    
    if (tituloEl) {
        tituloEl.innerText = titulo;
    }
    
    if (subtextEl) {
        subtextEl.innerText = mensaje;
    }
    
    if (toast) {
        toast.classList.remove('hidden');
        toast.classList.add('show-toast');
        
        setTimeout(() => {
            toast.classList.remove('show-toast');
            setTimeout(() => toast.classList.add('hidden'), 500);
        }, 3000);
    }
}
