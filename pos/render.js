// ============================================
// RENDER.JS - VERSIÓN INTEGRAL (VENTA DESAGRUPADA)
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
        modoSoloOnline = ajustes.modo_solo_online === 'true';

        // Cargar plan desde ajustes guardados (funciona offline)
        cargarPlanDesdeAjustes(ajustes);

        // Si está conectado, refrescar plan desde el backend
        if (modoConectado && tokenActual) {
            cargarPlanInfo().catch(() => {});
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
        iconoModo.innerHTML = '<path d="M2 20h20"/><path d="m9 10 2 2 4-4"/><rect x="3" y="4" width="18" height="12" rx="2"/>';
        textoModo.innerText = 'Modo Local';
    }
}

/* ============================================
   SISTEMA DE PLAN / SUSCRIPCIÓN
   ============================================ */

// Carga plan desde ajustes locales (offline-safe)
function cargarPlanDesdeAjustes(ajustes) {
    const plan = ajustes.plan || 'free';
    const expiresAt = ajustes.plan_expires_at ? new Date(ajustes.plan_expires_at) : null;
    // 7 días de gracia después de expirar
    const gracePeriodMs = 7 * 24 * 60 * 60 * 1000;
    const now = new Date();
    const isPremium = (plan === 'premium' || plan === 'trial') && expiresAt && (expiresAt.getTime() + gracePeriodMs) > now.getTime();
    const daysLeft = expiresAt ? Math.max(0, Math.ceil((expiresAt - now) / 86400000)) : 0;
    planActual = { plan, isPremium, daysLeft, expiresAt };
    actualizarUIsegunPlan();
}

// Consulta el plan actual al backend y actualiza el estado
async function cargarPlanInfo() {
    if (!modoConectado || !apiClient || !tokenActual) return;
    try {
        const info = await apiClient.request('/billing/sync');
        console.log('📋 billing/sync response:', JSON.stringify(info));
        planActual = {
            plan: info.plan,
            isPremium: info.is_premium,
            daysLeft: info.days_left,
            expiresAt: info.plan_expires_at ? new Date(info.plan_expires_at) : null
        };
        // Guardar en ajustes para uso offline
        await window.api.guardarAjuste('plan', info.plan);
        await window.api.guardarAjuste('plan_expires_at', info.plan_expires_at || '');
        actualizarUIsegunPlan();
        actualizarCardMiPlan();
        // Si el plan se activó, limpiar overlays de bloqueo en vistas que estén abiertas
        if (planActual.isPremium) {
            document.querySelectorAll('.premium-lock-overlay').forEach(o => o.remove());
        }
    } catch (e) {
        console.error('❌ billing/sync error:', e.message, e);
    }
}

// Actualiza el sidebar y vistas según el plan
function actualizarUIsegunPlan() {
    // Badges PRO en el sidebar
    const vistasPremium = ['ofertas', 'inventario'];
    vistasPremium.forEach(vista => {
        const btn = document.querySelector(`.menu-item[data-view="${vista}"]`);
        if (!btn) return;
        const badge = btn.querySelector('.badge-premium');
        if (!planActual.isPremium) {
            if (!badge) {
                const b = document.createElement('span');
                b.className = 'badge-premium';
                b.textContent = 'PRO';
                b.style.cssText = 'margin-left:auto;font-size:0.65em;background:#f59e0b;color:#fff;padding:2px 5px;border-radius:4px;font-weight:700;';
                btn.style.position = 'relative';
                btn.appendChild(b);
            }
        } else {
            if (badge) badge.remove();
        }
    });

    // Bloquear o desbloquear cards premium en Ajustes y Clientes
    const cardsPremium = ['card-sucursal', 'card-kds', 'card-fidelidad', 'card-puntos'];
    cardsPremium.forEach(cardId => {
        const el = document.getElementById(cardId);
        if (!el) return;
        if (!planActual.isPremium) {
            mostrarBloqueCard(cardId);
        } else {
            el.querySelector('.premium-lock-overlay')?.remove();
        }
    });
}

// Actualiza la card "Mi Plan" en Ajustes
function actualizarCardMiPlan() {
    const el = document.getElementById('plan-estado-texto');
    const elDias = document.getElementById('plan-dias-restantes');
    const btnTrial = document.getElementById('btn-iniciar-trial');
    const btnUpgrade = document.getElementById('btn-upgrade-premium');
    const btnPortal = document.getElementById('btn-portal-stripe');
    if (!el) return;

    if (!modoConectado) {
        el.textContent = 'Conecta tu cuenta para ver el estado de tu plan.';
        if (btnTrial) btnTrial.style.display = 'none';
        if (btnUpgrade) btnUpgrade.style.display = 'none';
        if (btnPortal) btnPortal.style.display = 'none';
        return;
    }

    const { plan, isPremium, daysLeft } = planActual;

    if (plan === 'premium' && isPremium) {
        el.innerHTML = '<span style="color:#10b981;font-weight:700;">Premium activo</span>';
        if (elDias) elDias.textContent = `Válido por ${daysLeft} días más`;
        if (btnTrial) btnTrial.style.display = 'none';
        if (btnUpgrade) btnUpgrade.style.display = 'none';
        if (btnPortal) btnPortal.style.display = '';
    } else if (plan === 'trial' && isPremium) {
        el.innerHTML = `<span style="color:#f59e0b;font-weight:700;">Prueba gratuita</span>`;
        if (elDias) elDias.textContent = `${daysLeft} días restantes`;
        if (btnTrial) btnTrial.style.display = 'none';
        if (btnUpgrade) btnUpgrade.style.display = '';
        if (btnPortal) btnPortal.style.display = 'none';
    } else {
        el.innerHTML = '<span style="color:#6b7280;font-weight:600;">Plan Gratuito</span>';
        if (elDias) elDias.textContent = 'Inventario, KDS, Ofertas y más requieren Premium.';
        const trialUsado = plan !== 'free' || planActual.expiresAt;
        if (btnTrial) btnTrial.style.display = trialUsado ? 'none' : '';
        if (btnUpgrade) btnUpgrade.style.display = '';
        if (btnPortal) btnPortal.style.display = 'none';
    }
}

async function iniciarPruebaPremium() {
    if (!modoConectado || !apiClient) {
        alert('Conéctate a tu cuenta Zenit primero.');
        return;
    }
    const btn = document.getElementById('btn-iniciar-trial');
    if (btn) { btn.disabled = true; btn.textContent = 'Activando...'; }
    try {
        await apiClient.request('/billing/start-trial', { method: 'POST' });
        await cargarPlanInfo();
        mostrarNotificacionExito('Prueba de 30 días activada', '¡Disfruta Premium!');
    } catch (e) {
        alert(e.message || 'No se pudo activar la prueba. Intenta de nuevo.');
    } finally {
        if (btn) { btn.disabled = false; btn.textContent = 'Iniciar prueba gratuita (30 días)'; }
    }
}

let _planPollingInterval = null;

async function abrirCheckoutStripe() {
    if (!modoConectado || !apiClient) {
        alert('Conéctate a tu cuenta Zenit primero.');
        return;
    }
    const btn = document.getElementById('btn-upgrade-premium');
    if (btn) { btn.disabled = true; btn.textContent = 'Preparando pago...'; }
    try {
        const data = await apiClient.request('/billing/create-checkout', { method: 'POST' });
        if (data.url) {
            await window.api.abrirEnNavegador(data.url);
            // Iniciar polling: verificar plan cada 6 seg por 3 minutos
            iniciarPollingPlan();
        }
    } catch (e) {
        alert(e.message || 'No se pudo iniciar el proceso de pago. Intenta de nuevo.');
    } finally {
        if (btn) { btn.disabled = false; btn.textContent = 'Actualizar a Premium — $499 MXN/mes'; }
    }
}

function iniciarPollingPlan() {
    if (_planPollingInterval) clearInterval(_planPollingInterval);
    const msg = document.getElementById('plan-polling-msg');
    if (msg) { msg.style.display = ''; msg.textContent = 'Esperando confirmación de pago...'; }
    let intentos = 0;
    const planAntes = planActual.plan;
    _planPollingInterval = setInterval(async () => {
        intentos++;
        try {
            const info = await apiClient.request('/billing/sync');
            if (info.plan === 'premium' && info.is_premium) {
                clearInterval(_planPollingInterval);
                _planPollingInterval = null;
                if (msg) msg.style.display = 'none';
                planActual = { plan: info.plan, isPremium: true, daysLeft: info.days_left, expiresAt: info.plan_expires_at ? new Date(info.plan_expires_at) : null };
                await window.api.guardarAjuste('plan', info.plan);
                await window.api.guardarAjuste('plan_expires_at', info.plan_expires_at || '');
                actualizarUIsegunPlan();
                actualizarCardMiPlan();
                document.querySelectorAll('.premium-lock-overlay').forEach(o => o.remove());
                mostrarNotificacionExito('¡Plan Premium activado!', 'Todas las funciones están disponibles');
                return;
            }
        } catch (e) { console.error('❌ Polling plan error:', e.message, e); }
        if (intentos >= 30) { // 3 minutos (30 × 6 seg)
            clearInterval(_planPollingInterval);
            _planPollingInterval = null;
            if (msg) { msg.textContent = 'No se detectó el pago. Usa "Ya pagué / Refrescar" si completaste el pago.'; }
        }
    }, 6000);
}

async function refrescarPlanManual() {
    if (_planPollingInterval) { clearInterval(_planPollingInterval); _planPollingInterval = null; }
    const msg = document.getElementById('plan-polling-msg');
    if (msg) msg.style.display = 'none';
    const btn = document.getElementById('btn-refrescar-plan');
    if (btn) { btn.textContent = 'Verificando...'; btn.style.pointerEvents = 'none'; }
    await cargarPlanInfo();
    if (btn) { btn.textContent = 'Ya pagué / Refrescar estado'; btn.style.pointerEvents = ''; }
    if (!planActual.isPremium) {
        mostrarNotificacionExito('Plan verificado', 'No se detectó un plan Premium activo aún.');
    }
}

async function abrirPortalStripe() {
    if (!modoConectado || !apiClient) return;
    const btn = document.getElementById('btn-portal-stripe');
    if (btn) { btn.disabled = true; btn.textContent = 'Abriendo...'; }
    try {
        const data = await apiClient.request('/billing/portal', { method: 'POST' });
        if (data.url) await window.api.abrirEnNavegador(data.url);
    } catch (e) {
        alert(e.message || 'No se pudo abrir el portal de facturación.');
    } finally {
        if (btn) { btn.disabled = false; btn.textContent = 'Gestionar suscripción'; }
    }
}

// Verifica si el usuario puede acceder a una vista premium
function puedeAccederPremium() {
    return planActual.isPremium;
}

const _LOCK_SVG_LG = `<svg xmlns="http://www.w3.org/2000/svg" width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>`;
const _LOCK_SVG_MD = `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>`;

function _irAPlanes() {
    mostrarVista('ajustes');
    setTimeout(() => document.getElementById('card-mi-plan')?.scrollIntoView({ behavior: 'smooth' }), 300);
}

// Overlay de bloqueo sobre una vista completa
function mostrarBloquePremium(containerId) {
    const el = document.getElementById(containerId);
    if (!el) return;
    if (el.querySelector('.premium-lock-overlay')) return;
    const overlay = document.createElement('div');
    overlay.className = 'premium-lock-overlay';
    overlay.style.cssText = 'position:absolute;inset:0;background:linear-gradient(180deg, rgba(255,255,255,0.45) 0%, rgba(255,255,255,0.72) 100%);backdrop-filter:blur(2px) saturate(0.95);display:flex;flex-direction:column;align-items:center;justify-content:center;z-index:10;text-align:center;padding:40px;border-radius:12px;';
    overlay.innerHTML = `
        <div style="background:rgba(255,255,255,0.92);border:1px solid rgba(209,213,219,0.9);border-radius:12px;padding:18px 20px;box-shadow:0 10px 24px rgba(0,0,0,0.08);max-width:360px;">
            <div style="margin-bottom:12px;">${_LOCK_SVG_LG}</div>
            <h3 style="margin:0 0 8px;color:#374151;">Función Premium</h3>
            <p style="margin:0 0 18px;font-size:0.95em;color:#6b7280;">Esta sección requiere un plan Premium activo.</p>
            <button class="btn-primary" onclick="_irAPlanes()">Ver planes</button>
        </div>
    `;
    el.style.position = 'relative';
    el.appendChild(overlay);
}

// Overlay de bloqueo sobre una card de Ajustes
function mostrarBloqueCard(cardId) {
    const el = document.getElementById(cardId);
    if (!el) return;
    if (el.querySelector('.premium-lock-overlay')) return;
    // Calcula dónde termina el h3 para que el título quede visible
    const h3 = el.querySelector('h3');
    const topOffset = h3 ? (h3.offsetTop + h3.offsetHeight + 8) : 0;
    const overlay = document.createElement('div');
    overlay.className = 'premium-lock-overlay';
    overlay.style.cssText = `position:absolute;left:0;right:0;bottom:0;top:${topOffset}px;background:linear-gradient(180deg, rgba(255,255,255,0.35) 0%, rgba(255,255,255,0.78) 100%);backdrop-filter:blur(1.5px) saturate(0.95);display:flex;flex-direction:column;align-items:center;justify-content:center;z-index:10;text-align:center;padding:24px;border-radius:0 0 12px 12px;`;
    overlay.innerHTML = `
        <div style="background:rgba(255,255,255,0.92);border:1px solid rgba(209,213,219,0.9);border-radius:10px;padding:12px 14px;box-shadow:0 8px 18px rgba(0,0,0,0.06);">
            <div style="margin-bottom:8px;">${_LOCK_SVG_MD}</div>
            <p style="margin:0 0 10px;font-size:0.85em;color:#6b7280;">Requiere plan Premium</p>
            <button class="btn-primary" style="font-size:0.82em;padding:7px 14px;" onclick="_irAPlanes()">Ver planes</button>
        </div>
    `;
    el.style.position = 'relative';
    el.appendChild(overlay);
}

/* ============================================
   SISTEMA DE PUNTOS
   ============================================ */

let puntosUsadosVenta = 0;

async function calcularPuntosGanados(total) {
    const aj = await window.api.obtenerAjustes();
    if (aj.puntos_activos !== 'true') return 0;
    const rate = parseFloat(aj.puntos_por_peso ?? '0.1');  // mismo default que la UI
    const bono = parseInt(aj.puntos_bono_pedido || '0');
    return Math.floor(total * rate) + bono;
}

async function actualizarPanelPuntosVenta() {
    const panel = document.getElementById('panel-puntos-venta');
    if (!panel) return;
    if (!puedeAccederPremium()) { panel.style.display = 'none'; return; }
    if (!clienteSeleccionadoVenta || !clienteSeleccionadoVenta.enFidelidad) {
        panel.style.display = 'none';
        puntosUsadosVenta = 0;
        return;
    }
    const aj = await window.api.obtenerAjustes().catch(() => ({}));
    if (aj.puntos_activos !== 'true') {
        panel.style.display = 'none';
        return;
    }
    const puntos = clienteSeleccionadoVenta.puntos || 0;
    const valorPunto = parseFloat(aj.puntos_valor || '0.10');
    const descuentoMax = parseFloat((puntos * valorPunto).toFixed(2));
    const subtotal = carrito.reduce((s, i) => s + i.precio, 0);
    const ptsGanar = await calcularPuntosGanados(subtotal);

    document.getElementById('puntos-balance-venta').textContent = puntos;
    document.getElementById('puntos-valor-display').textContent = descuentoMax.toFixed(2);
    const elGanar = document.getElementById('puntos-a-ganar-venta');
    if (elGanar) elGanar.textContent = puntosUsadosVenta > 0
        ? 'No ganas puntos si los usas en esta compra'
        : ptsGanar > 0 ? `+${ptsGanar} puntos con esta compra` : 'Agrega productos para ver puntos a ganar';

    // Ocultar botón de canjear si no tiene puntos disponibles
    const btnUsar = document.getElementById('btn-usar-puntos');
    if (btnUsar) btnUsar.style.display = puntos > 0 ? '' : 'none';

    panel.style.display = ''; // Siempre visible para clientes inscritos con puntos activos
}

async function toggleUsarPuntosVenta() {
    if (!clienteSeleccionadoVenta?.enFidelidad) return;
    const aj = await window.api.obtenerAjustes().catch(() => ({}));
    const valorPunto = parseFloat(aj.puntos_valor || '0.10');
    const btn = document.getElementById('btn-usar-puntos');

    if (puntosUsadosVenta === 0) {
        // Activar: usar todos los puntos disponibles (cap al total del carrito)
        const puntos = clienteSeleccionadoVenta.puntos || 0;
        const subtotal = carrito.reduce((s, i) => s + i.precio, 0);
        const descMax = parseFloat((puntos * valorPunto).toFixed(2));
        puntosUsadosVenta = puntos;
        descuentoActual = Math.min(descMax, subtotal);
        if (btn) {
            btn.style.background = '#7c3aed';
            btn.style.color = 'white';
            btn.style.borderColor = '#6d28d9';
            btn.innerHTML = '<span>✓ Descuento de puntos activo</span><span style="font-size:1.15em;line-height:1;">●</span>';
        }
    } else {
        // Desactivar
        puntosUsadosVenta = 0;
        descuentoActual = 0;
        if (btn) {
            btn.style.background = 'white';
            btn.style.color = '#7c3aed';
            btn.style.borderColor = '#7c3aed';
            btn.innerHTML = '<span>Aplicar descuento de puntos</span><span style="font-size:1.15em;line-height:1;">○</span>';
        }
    }
    renderizarCarrito();
    actualizarPanelPuntosVenta();
}

/* ============================================
   PROGRAMA DE FIDELIDAD
   ============================================ */

async function cargarProgramaFidelidad() {
    const tbody = document.getElementById('lista-fidelidad-body');
    if (!tbody) return;
    try {
        const inscritos = await window.api.obtenerClientesFidelidad();
        if (!inscritos || inscritos.length === 0) {
            tbody.innerHTML = `<tr><td colspan="4" style="color:#9ca3af;text-align:center;padding:12px;">Ningún cliente inscrito aún. Usa el buscador de arriba para inscribir.</td></tr>`;
            return;
        }
        tbody.innerHTML = inscritos.map(c => `
            <tr>
                <td><strong>${esc(c.nombre)}</strong></td>
                <td style="color:#6b7280;">📱 ${esc(c.telefono)}</td>
                <td style="color:#7c3aed;font-weight:600;">⭐ ${c.puntos || 0} pts</td>
                <td>
                    <button class="btn-secondary small" style="color:#ef4444;font-size:0.82em;"
                        onclick="toggleClienteFidelidad(${c.id}, '${esc(c.nombre)}', 1)">
                        Quitar
                    </button>
                </td>
            </tr>
        `).join('');
    } catch (e) {
        tbody.innerHTML = `<tr><td colspan="4" style="color:#ef4444;">Error al cargar</td></tr>`;
    }
}

async function buscarClienteParaFidelidad(texto) {
    const contenedor = document.getElementById('resultados-inscribir-fidelidad');
    if (!contenedor) return;
    if (!texto || texto.trim().length < 2) {
        contenedor.innerHTML = '';
        return;
    }
    const busqueda = texto.trim().toLowerCase();
    try {
        const todos = await window.api.obtenerClientesConCompras();
        const resultados = todos
            .filter(c => !c.en_fidelidad && (
                c.nombre.toLowerCase().includes(busqueda) ||
                (c.telefono || '').includes(busqueda)
            ))
            .slice(0, 5);
        if (resultados.length === 0) {
            contenedor.innerHTML = `<p style="color:#9ca3af;font-size:0.85em;margin-top:4px;">No se encontraron clientes (o ya están inscritos)</p>`;
            return;
        }
        contenedor.innerHTML = resultados.map(c => `
            <div style="display:flex;justify-content:space-between;align-items:center;padding:6px 10px;background:#f9fafb;border-radius:6px;margin-bottom:4px;border:1px solid #e5e7eb;">
                <span><strong>${esc(c.nombre)}</strong> — ${esc(c.telefono)}</span>
                <button class="btn-primary small" style="font-size:0.8em;"
                    onclick="toggleClienteFidelidad(${c.id}, '${esc(c.nombre)}', 0)">
                    + Inscribir
                </button>
            </div>
        `).join('');
    } catch (e) {
        contenedor.innerHTML = `<p style="color:#ef4444;font-size:0.85em;">Error al buscar</p>`;
    }
}

// Sincroniza cambios de fidelidad/puntos al backend si hay conexión
async function syncLoyaltyBackend(clienteId, payload) {
    if (modoConectado && apiClient && tokenActual) {
        apiClient.request(`/customers/${clienteId}/loyalty`, {
            method: 'PATCH', body: payload
        }).catch(e => console.warn('No se pudo sincronizar fidelidad al backend:', e.message));
    }
}

async function toggleClienteFidelidad(id, nombre, enFidelidad) {
    const nuevoValor = enFidelidad === 1 ? 0 : 1;
    await window.api.toggleFidelidad(id, nuevoValor).catch(() => {});
    syncLoyaltyBackend(id, { in_loyalty: nuevoValor === 1 });
    if (nuevoValor === 1) {
        mostrarNotificacionExito(`${nombre} inscrito al programa de fidelidad`, '⭐ Fidelidad');
    }
    // Limpiar búsqueda y recargar lista
    const inputBuscar = document.getElementById('buscar-inscribir-fidelidad');
    if (inputBuscar) inputBuscar.value = '';
    document.getElementById('resultados-inscribir-fidelidad').innerHTML = '';
    cargarProgramaFidelidad();
}

/* ============================================
   WRAPPER LAYER - Abstracción de Modo
   ============================================ */

// PRODUCTOS
async function obtenerProductosAgrupadosWrapper() {
    if (modoConectado && apiClient && tokenActual) {
        try {
            const productos = await apiClient.getProductsGrouped();
            return productos.map(cat => ({
                id: cat.id,
                nombre: cat.nombre || cat.name,
                emoji: cat.emoji,
                imagen: cat.image || cat.imagen,
                productos: (cat.productos || cat.products || []).map(p => ({
                    id: p.id,
                    nombre: p.nombre || p.name,
                    descripcion: p.descripcion || p.description,
                    precio: parseFloat(p.precio || p.price),
                    stock: p.stock,
                    emoji: p.emoji,
                    imagen: p.imagen || p.image,
                    activo: p.activo !== undefined ? p.activo : p.active
                }))
            }));
        } catch (error) {
            console.error('Error al obtener productos del backend:', error);
            return await window.api.obtenerProductosAgrupados();
        }
    } else {
        return await window.api.obtenerProductosAgrupados();
    }
}

async function agregarProductoWrapper(producto) {
    if (modoConectado && apiClient && tokenActual) {
        try {
            const resultado = await apiClient.createProduct({
                name: producto.nombre,
                description: producto.descripcion,
                price: producto.precio,
                stock: producto.stock,
                category_id: producto.clasificacion_id,
                emoji: producto.emoji,
                image: producto.imagen
            });
            await window.api.agregarProducto(producto);
            return resultado;
        } catch (error) {
            console.error('Error al crear producto en backend:', error);
            return await window.api.agregarProducto(producto);
        }
    } else {
        return await window.api.agregarProducto(producto);
    }
}

async function actualizarProductoWrapper(id, producto) {
    if (modoConectado && apiClient && tokenActual) {
        try {
            const resultado = await apiClient.updateProduct(id, {
                name: producto.nombre,
                description: producto.descripcion,
                price: producto.precio,
                stock: producto.stock,
                category_id: producto.clasificacion_id,
                emoji: producto.emoji,
                image: producto.imagen,
                active: producto.activo
            });
            await window.api.actualizarProducto(id, producto);
            return resultado;
        } catch (error) {
            console.error('Error al actualizar producto en backend:', error);
            return await window.api.actualizarProducto(id, producto);
        }
    } else {
        return await window.api.actualizarProducto(id, producto);
    }
}

// PEDIDOS
async function crearPedidoWrapper(datosPedido, items) {
    if (modoConectado && apiClient && tokenActual) {
        try {
            // Traducir campos español → inglés para el backend
            const datosAPI = {
                customer_id: datosPedido.cliente_id || null,
                customer_temp_info: datosPedido.info_cliente_temp || null,
                total: datosPedido.total,
                payment_method: datosPedido.metodo_pago,
                order_type: datosPedido.tipo_pedido || 'comer',
                reference: datosPedido.referencia || null,
                delivery_address: datosPedido.direccion_domicilio || null,
                maps_link: datosPedido.link_maps || null,
                notes: datosPedido.notas_generales || null,
                branch_id: sucursalIdActual || null
            };
            const itemsAPI = items.map(i => ({
                product_id: i.id,
                quantity: i.cantidad || 1,
                unit_price: i.precio,
                subtotal: i.subtotal,
                notes: i.nota || ''
            }));
            const resultado = await apiClient.createOrder(datosAPI, itemsAPI);
            await window.api.crearPedidoDirecto(datosPedido, items);
            return resultado.id;
        } catch (error) {
            console.error('Error al crear pedido en backend:', error);
            // Guardar localmente y marcar para subir cuando vuelva la conexión
            return await window.api.crearPedidoDirecto({ ...datosPedido, pendiente_sync: 1 }, items);
        }
    } else {
        return await window.api.crearPedidoDirecto(datosPedido, items);
    }
}

async function obtenerPedidosWrapper(filtro) {
    if (modoConectado && apiClient && tokenActual) {
        try {
            const filtroBackend = { ...filtro };
            if (filtro.date_from) filtroBackend.date_from = new Date(filtro.date_from + 'T00:00:00').toISOString();
            if (filtro.date_to)   filtroBackend.date_to   = new Date(filtro.date_to   + 'T23:59:59').toISOString();
            // Filtrar por sucursal de este dispositivo si está asignada
            if (sucursalIdActual) filtroBackend.branch_id = sucursalIdActual;
            const result = await apiClient.getOrders(filtroBackend);
            const rawOrders = result.data || result;
            const pag = result.pagination || { total: rawOrders.length, page: 1, limit: rawOrders.length, pages: 1 };
            const data = rawOrders.map(o => ({
                id: o.id,
                cliente_id: o.customer_id,
                total: parseFloat(o.total),
                estado: o.status,
                metodo_pago: o.payment_method,
                tipo_pedido: o.order_type,
                referencia: o.reference,
                direccion_domicilio: o.delivery_address,
                notas_generales: o.notes,
                info_cliente_temp: o.customer_temp_info,
                cajero: null,
                fecha: o.createdAt,
                telefono: o.customer ? o.customer.name : (o.customer_temp_info || null),
                _items: o.items
            }));
            // Safety net: agregar órdenes locales que no se sincronizaron al backend
            try {
                const pendientes = await window.api.obtenerPedidosPendientes();
                const noSinc = (pendientes || []).filter(p => p.estado === 'completado');
                if (noSinc.length > 0) {
                    const backendIds = new Set(data.map(o => o.id));
                    noSinc.forEach(p => {
                        if (!backendIds.has(p.id)) {
                            data.unshift({
                                id: p.id,
                                cajero: p.cajero,
                                telefono: p.info_cliente_temp || null,
                                total: p.total,
                                metodo_pago: p.metodo_pago,
                                estado: p.estado,
                                tipo_pedido: p.tipo_pedido,
                                referencia: p.referencia,
                                fecha: p.fecha_pedido
                            });
                        }
                    });
                }
            } catch (e) { /* ignorar errores del fallback local */ }
            // Ordenar por fecha descendente después de mezclar local + backend
            data.sort((a, b) => new Date(b.fecha || 0) - new Date(a.fecha || 0));
            const resumen = {
                total_pedidos: pag.total || data.length,
                total_ventas:  data.reduce((s, o) => s + o.total, 0),
                efectivo:      data.filter(o => o.metodo_pago === 'efectivo').reduce((s, o) => s + o.total, 0),
                tarjeta:       data.filter(o => ['tarjeta','debito','credito'].includes(o.metodo_pago)).reduce((s, o) => s + o.total, 0),
                transferencia: data.filter(o => o.metodo_pago === 'transferencia').reduce((s, o) => s + o.total, 0),
            };
            return { data, pagination: pag, resumen };
        } catch (error) {
            console.error('Error al obtener pedidos del backend:', error);
            // Marcar que hubo error para mostrar aviso en la UI
            const localResult = await window.api.obtenerPedidos(filtro);
            const result = (() => {
                if (localResult && localResult.data) return { data: localResult.data, pagination: localResult.paginacion || {}, resumen: localResult.resumen };
                return { data: localResult || [], pagination: {} };
            })();
            result._backendError = true;
            return result;
        }
    } else {
        const localResult = await window.api.obtenerPedidos(filtro);
        if (localResult && localResult.data) return { data: localResult.data, pagination: localResult.paginacion || {}, resumen: localResult.resumen };
        return { data: localResult || [], pagination: {} };
    }
}

async function obtenerDetallePedidoWrapper(id) {
    if (modoConectado && apiClient && tokenActual) {
        try {
            const order = await apiClient.getOrderDetails(id);
            return (order.items || []).map(item => ({
                cantidad: item.quantity,
                nombre: item.product ? item.product.name : `Producto ${item.product_id}`,
                precio: parseFloat(item.unit_price),
                nota: item.notes || null,
                subtotal: parseFloat(item.subtotal)
            }));
        } catch (error) {
            console.error('Error al obtener detalle pedido del backend:', error);
            return await window.api.obtenerDetallePedido(id);
        }
    } else {
        return await window.api.obtenerDetallePedido(id);
    }
}

// CLIENTES
async function obtenerClientesWrapper() {
    if (modoConectado && apiClient && tokenActual) {
        try {
            const clientes = await apiClient.getCustomersWithStats();
            // Traducir campos inglés → español para compatibilidad con el resto del frontend
            return clientes.map(c => ({
                id: c.id,
                telefono: c.phone,
                nombre: c.name,
                direccion: c.address,
                notas: c.notes,
                fecha_registro: c.createdAt,
                total_compras: parseInt(c.total_compras) || 0,
                monto_total: parseFloat(c.monto_total) || 0
            }));
        } catch (error) {
            console.error('Error al obtener clientes del backend:', error);
            return await window.api.obtenerClientesConCompras();
        }
    } else {
        return await window.api.obtenerClientesConCompras();
    }
}

async function crearClienteWrapper(datos) {
    if (modoConectado && apiClient && tokenActual) {
        try {
            const resultado = await apiClient.createCustomer({
                phone: datos.telefono,
                name: datos.nombre,
                address: datos.direccion,
                notes: datos.notas
            });
            await window.api.crearCliente(datos);
            return resultado;
        } catch (error) {
            console.error('Error al crear cliente en backend:', error);
            return await window.api.crearCliente(datos);
        }
    } else {
        return await window.api.crearCliente(datos);
    }
}

// ESTADÍSTICAS
async function obtenerEstadisticasWrapper(branchId) {
    if (modoConectado && apiClient && tokenActual) {
        try {
            const qs = branchId ? `?branch_id=${branchId}` : '';
            return await apiClient.request(`/stats/dashboard${qs}`);
        } catch (error) {
            console.error('Error al obtener estadísticas del backend:', error);
            return await window.api.obtenerEstadisticas();
        }
    } else {
        return await window.api.obtenerEstadisticas();
    }
}
 

// Variables de Administración
let productoEditandoId = null;
let categoriaEditandoId = null;
let rutaImagenTemporal = null;
let emojiSeleccionado = '📦';

// Variables de Pago y Descuento
let metodoSeleccionado = null;
let descuentoActual = 0;

const EMOJIS_DISPONIBLES = [
    '🍔','🍕','🍟','🌭','🌮','🌯','🥙','🥪','🥗','🥩','🍗','🥓','🥖','🥯','🥞','🧇','🧀','🍞',
    '🥤','☕','🍵','🥛','🍺','🍷','🍹','🍸','🍾','🧊','🍩','🍪','🎂','🍰','🧁','🥧','🍫','🍬','🍭','🍮',
    '🍅','🥒','🥬','🥦','🥕','🌽','🌶️','🥔','🍇','🍈','🍉','🍊','🍋','🍌','🍍','🍎','🍏','🍐','🍑','🍒','🍓',
    '📦','🛒','🛍️','🏷️','🔥','⭐','✨','💡','🖍️','🖊️','✂️','📌'
];

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
            // 1. Actualizar SQLite local
            await window.api.actualizarEstadoPedido(pedidoId, estado);
            // 2. Actualizar backend si está conectado (para que persista al reiniciar)
            if (modoConectado && apiClient && tokenActual) {
                apiClient.request(`/orders/${pedidoId}/status`, {
                    method: 'PUT',
                    body: { status: estado }
                }).catch(e => console.warn('kds backend status update:', e));
            }
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

function cambiarVista(vista) {
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

/* ============================================
   LÓGICA DE VENTAS (CARRITO DESAGRUPADO)
   ============================================ */

async function cargarCatalogoVenta() {
    try {
        clasificaciones = await obtenerProductosAgrupadosWrapper();
        productosGlobales = [];
        clasificaciones.forEach(c => {
            c.productos.forEach(p => productosGlobales.push({...p, categoria: c.nombre}));
        });
        renderizarFiltrosCategorias();
        renderizarGridVenta(productosGlobales);
        renderizarCarrito();
    } catch (e) { console.error(e); }
}

function renderizarFiltrosCategorias() {
    const contenedor = document.getElementById('filtros-categorias');
    contenedor.innerHTML = `<button class="filter-btn active" onclick="filtrarCategoria('todas', this)">Todo</button>`;
    clasificaciones.forEach(c => {
        if(c.id !== null && c.productos.length > 0) {
            contenedor.innerHTML += `<button class="filter-btn" onclick="filtrarCategoria(${c.id}, this)">${c.emoji} ${c.nombre}</button>`;
        }
    });
}

let clienteSeleccionadoVenta = null;

async function buscarClientesVenta(e, tipo) {
    const busqueda = e.target.value.trim().toLowerCase();
    const dropdownId = tipo === 'nombre' ? 'sugerencias-nombre' : 'sugerencias-telefono';
    const dropdown = document.getElementById(dropdownId);
    
    if (busqueda.length < 2) {
        dropdown.classList.add('hidden');
        return;
    }
    
    try {
        // Usar SQLite local siempre: tiene en_fidelidad y puntos (locales) + está sincronizado con backend al inicio
        const clientes = await window.api.obtenerClientesConCompras();
        let resultados;

        if (tipo === 'nombre') {
            resultados = clientes.filter(c =>
                c.nombre && c.nombre.toLowerCase().includes(busqueda)
            ).slice(0, 5);
        } else {
            resultados = clientes.filter(c =>
                c.telefono && c.telefono.includes(busqueda)
            ).slice(0, 5);
        }

        if (resultados.length === 0) {
            dropdown.classList.add('hidden');
            return;
        }

        dropdown.innerHTML = resultados.map(c => `
            <div class="sugerencia-item"
                data-id="${esc(c.id)}"
                data-nombre="${esc(c.nombre)}"
                data-telefono="${esc(c.telefono)}"
                data-direccion="${esc(c.direccion || '')}"
                data-puntos="${c.puntos || 0}"
                data-fidelidad="${c.en_fidelidad || 0}">
                <div class="sugerencia-nombre">${esc(c.nombre)}${c.en_fidelidad ? ' ⭐' : ''}</div>
                <div class="sugerencia-tel">📱 ${esc(c.telefono)}</div>
                ${c.direccion ? `<div class="sugerencia-direccion">📍 ${esc(c.direccion)}</div>` : ''}
            </div>
        `).join('');
        // Registrar click usando data attributes (evita inyección en onclick)
        dropdown.querySelectorAll('.sugerencia-item').forEach(el => {
            el.onclick = () => seleccionarClienteVenta(
                parseInt(el.dataset.id),
                el.dataset.nombre,
                el.dataset.telefono,
                el.dataset.direccion,
                parseInt(el.dataset.puntos || '0'),
                parseInt(el.dataset.fidelidad || '0')
            );
        });
        
        dropdown.classList.remove('hidden');
        
    } catch (error) {
        console.error("Error al buscar clientes:", error);
    }
}

function seleccionarClienteVenta(id, nombre, telefono, direccion, puntos, enFidelidad) {
    clienteSeleccionadoVenta = { id, nombre, telefono, direccion, puntos: puntos || 0, enFidelidad: enFidelidad || 0 };

    // Autocompletar ambos campos
    document.getElementById('nombre-cliente').value = nombre;
    document.getElementById('telefono-cliente').value = telefono;

    // Cerrar sugerencias
    document.getElementById('sugerencias-nombre').classList.add('hidden');
    document.getElementById('sugerencias-telefono').classList.add('hidden');

    // Mostrar panel de puntos si el cliente está en el programa de fidelidad
    actualizarPanelPuntosVenta();
}

function actualizarInfoClientePago() {
    const inputNombre = document.getElementById('nombre-cliente').value.trim();
    const inputTelefono = document.getElementById('telefono-cliente').value.trim();
    const btnRegistrar = document.getElementById('btn-registrar-cliente-venta');
    
    if (clienteSeleccionadoVenta) {
        // Cliente ya registrado seleccionado
        document.getElementById('display-tel-pago').innerText = clienteSeleccionadoVenta.telefono;
        document.getElementById('display-nombre-pago').innerText = clienteSeleccionadoVenta.nombre;
        document.getElementById('display-dir-pago').innerText = clienteSeleccionadoVenta.direccion || 'Sin dirección';
        btnRegistrar.style.display = 'none';
    } else if (inputNombre && inputTelefono) {
        // Hay nombre Y teléfono pero no es un cliente registrado
        document.getElementById('display-tel-pago').innerText = inputTelefono;
        document.getElementById('display-nombre-pago').innerText = inputNombre;
        document.getElementById('display-dir-pago').innerText = '-';
        btnRegistrar.style.display = 'inline-block';
    } else if (inputNombre || inputTelefono) {
        // Solo hay uno de los dos
        document.getElementById('display-tel-pago').innerText = inputTelefono || '-';
        document.getElementById('display-nombre-pago').innerText = inputNombre || 'Datos incompletos';
        document.getElementById('display-dir-pago').innerText = '-';
        btnRegistrar.style.display = 'none';
    } else {
        // Sin información de cliente
        document.getElementById('display-tel-pago').innerText = 'Venta sin cliente (Público general)';
        document.getElementById('display-nombre-pago').innerText = '-';
        document.getElementById('display-dir-pago').innerText = '-';
        btnRegistrar.style.display = 'none';
    }
}

function manejarBusquedaNombre(e) {
    buscarClientesVenta(e, 'nombre');
}

function manejarFocusNombre(e) {
    if (e.target.value.length >= 2) {
        buscarClientesVenta(e, 'nombre');
    }
}

function manejarBusquedaTelefono(e) {
    buscarClientesVenta(e, 'telefono');
}

function manejarFocusTelefono(e) {
    if (e.target.value.length >= 2) {
        buscarClientesVenta(e, 'telefono');
    }
}

function registrarClienteDesdeVenta() {
    const nombre = document.getElementById('nombre-cliente').value.trim();
    const telefono = document.getElementById('telefono-cliente').value.trim();
    
    // Prellenar el modal
    document.getElementById('cli-nombre').value = nombre;
    document.getElementById('cli-telefono').value = telefono;
    document.getElementById('cli-direccion').value = '';
    
    document.getElementById('modal-cliente').classList.remove('hidden');
}

function filtrarCategoria(catId, btnElement) {
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    btnElement.classList.add('active');
    if (catId === 'todas') renderizarGridVenta(productosGlobales);
    else {
        const cat = clasificaciones.find(c => c.id === catId);
        renderizarGridVenta(cat ? cat.productos : []);
    }
}

function filtrarProductosVenta(texto) {
    const filtrados = productosGlobales.filter(p => p.nombre.toLowerCase().includes(texto.toLowerCase()));
    renderizarGridVenta(filtrados);
}

function renderizarGridVenta(listaProductos) {
    const grid = document.getElementById('grid-venta');
    if (listaProductos.length === 0) {
        grid.innerHTML = '<p style="color:#9ca3af; text-align:center; width:100%;">No hay productos</p>';
        return;
    }
    const mostrarStock = document.getElementById('adj-mostrar-stock')?.checked;

    grid.innerHTML = listaProductos.map(p => {
        const imgUrl = urlImagenSegura(p.imagen);
        const visual = imgUrl
            ? `<img src="${imgUrl}" class="product-img-display" onerror="this.style.display='none';this.nextElementSibling.style.display=''"><span class="product-emoji" style="display:none">${esc(p.emoji || '📦')}</span>`
            : `<span class="product-emoji">${esc(p.emoji || '📦')}</span>`;
        return `
        <div class="product-card" onclick="agregarAlCarrito(${p.id})" id="pcard-${p.id}">
            <div class="product-visual">${visual}</div>
            <h4>${esc(p.nombre)}</h4>
            <p class="precio">$${p.precio.toFixed(2)}</p>
            ${mostrarStock ? `<div id="stock-badge-${p.id}" style="font-size:0.75em; color:#9ca3af; margin-top:3px;">...</div>` : ''}
        </div>`;
    }).join('');

    if (mostrarStock) {
        listaProductos.forEach(p => {
            window.api.calcularStockProducto(p.id).then(stock => {
                const el = document.getElementById(`stock-badge-${p.id}`);
                if (!el) return;
                if (stock === null) {
                    el.innerHTML = '';
                } else if (stock === 0) {
                    el.innerHTML = '<span style="color:#ef4444; font-weight:600;">Sin stock</span>';
                    document.getElementById(`pcard-${p.id}`)?.style.setProperty('opacity', '0.5');
                } else if (stock <= 3) {
                    el.innerHTML = `<span style="color:#f59e0b; font-weight:600;">⚠ ${stock} disponibles</span>`;
                } else {
                    el.innerHTML = `<span style="color:#10b981;">${stock} disponibles</span>`;
                }
            }).catch(() => {});
        });
    }
}

// --- CARRITO ---
function agregarAlCarrito(productoId) {
    const producto = productosGlobales.find(p => p.id === productoId);
    if (!producto) return;

    // Se agrega como item único (desagrupado)
    carrito.push({
        id: producto.id,
        nombre: producto.nombre,
        precio: producto.precio,
        cantidad: 1,
        nota: ''
    });
    renderizarCarrito();
}

function renderizarCarrito() {
    const contenedor = document.getElementById('carrito-items');
    const subtotalEl = document.getElementById('subtotal-venta');
    const descuentoEl = document.getElementById('descuento-aplicado');
    const totalEl = document.getElementById('total-venta');
    
    if (carrito.length === 0) {
        contenedor.innerHTML = '<div class="empty-cart-msg">El carrito está vacío</div>';
        if (subtotalEl) subtotalEl.innerText = '$0.00';
        if (descuentoEl) descuentoEl.innerText = '-$0.00';
        totalEl.innerText = '$0.00';
        return;
    }

    let subtotal = 0;
    contenedor.innerHTML = carrito.map((item, index) => {
        subtotal += item.precio;
        return `
        <div class="cart-item">
            <div class="cart-qty">1</div>
            <div class="cart-info">
                <h5>${esc(item.nombre)}</h5>
                <div class="cart-price">$${item.precio.toFixed(2)}</div>
                ${item.nota ? `<span class="cart-note">📝 ${esc(item.nota)}</span>` : ''}
            </div>
            <div class="cart-actions">
    <button class="btn-ticket-action" onclick="abrirModalNotas(${index})" title="Agregar nota" style="display:flex; align-items:center; justify-content:center; color:#6b7280;">
        <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/><path d="m15 5 4 4"/></svg>
    </button>
    <button class="btn-ticket-action" onclick="eliminarDelCarrito(${index})" title="Eliminar" style="display:flex; align-items:center; justify-content:center; color:#ef4444;">
        <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 11v6"/><path d="M14 11v6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
    </button>
</div>
        </div>`;
    }).join('');
    
    // Actualizar subtotal, descuento y total
    const totalFinal = subtotal - descuentoActual;
    if (subtotalEl) subtotalEl.innerText = `$${subtotal.toFixed(2)}`;
    if (descuentoEl) descuentoEl.innerText = `-$${descuentoActual.toFixed(2)}`;
    totalEl.innerText = `$${totalFinal.toFixed(2)}`;

    // Actualizar panel de puntos si hay cliente inscrito
    if (clienteSeleccionadoVenta?.enFidelidad) actualizarPanelPuntosVenta();
}

function eliminarDelCarrito(index) {
    carrito.splice(index, 1);
    renderizarCarrito();
}

function limpiarCarrito() {
    if (carrito.length === 0) return;
    
    if (confirm('¿Vaciar el carrito?')) {
        carrito = [];
        descuentoActual = 0;
        clienteSeleccionadoVenta = null;
        
        // Limpiar campos de cliente
        document.getElementById('nombre-cliente').value = '';
        document.getElementById('telefono-cliente').value = '';
        
        // Cerrar sugerencias si están abiertas
        document.getElementById('sugerencias-nombre')?.classList.add('hidden');
        document.getElementById('sugerencias-telefono')?.classList.add('hidden');

        // Ocultar panel de puntos y resetear canje
        const elPts = document.getElementById('panel-puntos-venta');
        if (elPts) elPts.style.display = 'none';
        puntosUsadosVenta = 0;

        renderizarCarrito();
    }
}

// --- NOTAS ---
function abrirModalNotas(index) {
    itemNotaEditandoIndex = index;
    document.getElementById('nota-producto-nombre').innerText = `Nota para: ${carrito[index].nombre}`;
    document.getElementById('texto-nota').value = carrito[index].nota || '';
    document.getElementById('modalNotas').classList.remove('hidden');
}

function agregarTagNota(tag) {
    const txt = document.getElementById('texto-nota');
    txt.value += (txt.value ? ' ' : '') + tag + ' ';
    txt.focus();
}

function guardarNota() {
    if (itemNotaEditandoIndex !== null) {
        carrito[itemNotaEditandoIndex].nota = document.getElementById('texto-nota').value.trim();
        renderizarCarrito();
    }
    cerrarModalNotas();
}

function cerrarModalNotas() { 
    document.getElementById('modalNotas').classList.add('hidden'); 
    itemNotaEditandoIndex = null;
}

/* ============================================
   NUEVAS FUNCIONES DE VENTA Y PAGO
   ============================================ */

// --- PROCESAR VENTA (ABRE EL MODAL DE PAGO) ---
function procesarVenta() {
    if (carrito.length === 0) {
        alert('El carrito está vacío');
        return;
    }
    
    const total = carrito.reduce((sum, i) => sum + i.precio, 0) - descuentoActual;
    document.getElementById('pago-total-display').innerText = `$${total.toFixed(2)}`;
    
    // Mostrar información del cliente en el modal
    actualizarInfoClientePago();
    
    resetearModalPago();
    document.getElementById('modalPago').classList.remove('hidden');
}

// --- SELECCIONAR MÉTODO DE PAGO ---
function seleccionarMetodo(metodo) {
    metodoSeleccionado = metodo;
    
    // Quitar selección de todos los botones
    document.querySelectorAll('.method-btn').forEach(btn => {
        btn.classList.remove('selected');
    });
    
    // Marcar el botón seleccionado
    document.getElementById(`method-${metodo}`).classList.add('selected');
    
    // Mostrar u ocultar calculadora de cambio
    const calcSection = document.getElementById('cambio-section');
    const btnConfirmar = document.getElementById('btn-confirmar-final');
    
    if (metodo === 'efectivo') {
        calcSection.classList.remove('hidden');
        btnConfirmar.classList.add('disabled');
        btnConfirmar.disabled = true;
        
        // Limpiar el input de efectivo
        document.getElementById('efectivo-recibido').value = '';
        document.getElementById('cambio-monto').innerText = '$0.00';
    } else {
        calcSection.classList.add('hidden');
        btnConfirmar.classList.remove('disabled');
        btnConfirmar.disabled = false;
    }
}

// --- CALCULAR CAMBIO EN TIEMPO REAL ---
function calcularCambio() {
    const total = carrito.reduce((sum, i) => sum + i.precio, 0) - descuentoActual;
    const inputRecibido = document.getElementById('efectivo-recibido').value;
    
    // Limpiar el valor: permitir solo números y punto decimal
    const valorLimpio = inputRecibido.replace(/[^\d.]/g, '');
    const recibido = parseFloat(valorLimpio) || 0;
    
    const cambio = recibido - total;
    
    const display = document.getElementById('cambio-monto');
    if (display) {
        const cambioFinal = cambio > 0 ? cambio : 0;
        display.innerText = `$${cambioFinal.toFixed(2)}`;
        display.style.color = cambio >= 0 ? '#10b981' : '#ef4444';
    }

    // Habilitar/deshabilitar botón según el pago
    const btnConfirmar = document.getElementById('btn-confirmar-final');
    if (btnConfirmar) {
        if (recibido >= total) {
            btnConfirmar.classList.remove('disabled');
            btnConfirmar.disabled = false;
        } else {
            btnConfirmar.classList.add('disabled');
            btnConfirmar.disabled = true;
        }
    }
}

// --- EJECUTAR VENTA (CONFIRMAR Y REGISTRAR) ---
async function ejecutarVenta() {
    if (!metodoSeleccionado) {
        alert('Selecciona un método de pago');
        return;
    }

    const btnFinal = document.getElementById('btn-confirmar-final');
    if (btnFinal) btnFinal.disabled = true;
    
    const total = carrito.reduce((sum, i) => sum + i.precio, 0) - descuentoActual;
    
    // Determinar el cliente_id (solo si hay un cliente seleccionado Y REGISTRADO)
    let clienteId = null;
    let infoClienteTemp = null;
    
    if (clienteSeleccionadoVenta && clienteSeleccionadoVenta.id) {
        clienteId = clienteSeleccionadoVenta.id;
    } else {
        // Si hay nombre o teléfono pero no está registrado, guardar como temporal
        const nombre = document.getElementById('nombre-cliente').value.trim();
        const telefono = document.getElementById('telefono-cliente').value.trim();
        if (nombre || telefono) {
            infoClienteTemp = `${nombre}${nombre && telefono ? ' - ' : ''}${telefono}`;
        }
    }
    
    try {
        const datosPedido = {
            cliente_id: clienteId,
            total: total,
            metodo_pago: metodoSeleccionado,
            tipo_pedido: tipoPedidoActual || 'comer',
            referencia: document.getElementById('pedido-referencia')?.value || '',
            direccion_domicilio: document.getElementById('dom-direccion')?.value || '',
            link_maps: document.getElementById('dom-link')?.value || '',
            notas_generales: '',
            info_cliente_temp: infoClienteTemp,
            cajero: nombreActivo || null
        };
        
        const itemsParaDB = carrito.map(i => ({
            id: i.id,
            cantidad: 1,
            precio: i.precio,
            subtotal: i.precio,
            nota: i.nota || ''
        }));
        
        const pedidoId = await crearPedidoWrapper(datosPedido, itemsParaDB);

        // Enviar comanda al KDS
        window.api.kdsNuevoPedido({
            pedidoId: pedidoId || null,
            tipo: datosPedido.tipo_pedido === 'domicilio' ? 'delivery' : 'mostrador',
            mesa: null,
            notas: datosPedido.notas_generales || null,
            items: carrito.map(i => ({ nombre: i.nombre, cantidad: 1, notas: i.nota || '' }))
        }).catch(() => {});

        // Guardar ID del pedido para impresión
        window.ultimoPedidoId = pedidoId;

        // Puntos: solo aplica a clientes inscritos en programa de fidelidad
        if (clienteSeleccionadoVenta?.id && clienteSeleccionadoVenta.enFidelidad === 1) {
            if (puntosUsadosVenta > 0) {
                // Canjear puntos: descontar del balance
                await window.api.actualizarPuntosCliente(clienteSeleccionadoVenta.id, -puntosUsadosVenta).catch(() => {});
                syncLoyaltyBackend(clienteSeleccionadoVenta.id, { points_delta: -puntosUsadosVenta });
            } else {
                // Ganar puntos normalmente
                const puntosGanados = await calcularPuntosGanados(total);
                if (puntosGanados > 0) {
                    await window.api.actualizarPuntosCliente(clienteSeleccionadoVenta.id, puntosGanados).catch(() => {});
                    syncLoyaltyBackend(clienteSeleccionadoVenta.id, { points_delta: puntosGanados });
                    mostrarNotificacionExito(`+${puntosGanados} puntos acumulados`, '⭐ Puntos');
                }
            }
        }
        puntosUsadosVenta = 0;

        cerrarModalPago();

        mostrarNotificacionExito(`Venta registrada - Total: $${total.toFixed(2)}`, '¡Venta Exitosa!');
        
        // Preguntar si quiere imprimir el ticket
        mostrarModalImpresion(pedidoId);
        
        // Limpiar todo
        carrito = [];
        metodoSeleccionado = null;
        descuentoActual = 0;
        clienteSeleccionadoVenta = null;
        document.getElementById('telefono-cliente').value = '';
        document.getElementById('nombre-cliente').value = '';
        const elPanelPuntos = document.getElementById('panel-puntos-venta');
        if (elPanelPuntos) elPanelPuntos.style.display = 'none';
        renderizarCarrito();
        
    } catch (e) {
        console.error(e);
        alert("Error al guardar: " + e);
        const btnFinal = document.getElementById('btn-confirmar-final');
        if (btnFinal) btnFinal.disabled = false;
    }
}
        

// --- CERRAR MODAL DE PAGO ---
function cerrarModalPago() {
    document.getElementById('modalPago').classList.add('hidden');
    metodoSeleccionado = null;
}

// --- APLICAR DESCUENTO ---
let _pendienteDescuento = null; // guarda descuento esperando PIN

async function abrirModalDescuento() {
    // Cargar descuentos predefinidos (solo pre-creados en Ofertas)
    const contenedor = document.getElementById('descuentos-rapidos');
    try {
        const descuentos = await window.api.obtenerDescuentos();
        if (!descuentos || !descuentos.length) {
            contenedor.innerHTML = `<div style="color:#9ca3af;font-size:0.85em;padding:8px;">
                No tienes descuentos creados. Ve a <strong>Ofertas → Descuentos</strong> para crearlos.
            </div>`;
        } else {
            const subtotal = carrito.reduce((sum, i) => sum + i.precio, 0);
            contenedor.innerHTML = descuentos.map(d => {
                const montoCalc = d.tipo === 'porcentaje'
                    ? (subtotal * d.valor / 100).toFixed(2)
                    : parseFloat(d.valor).toFixed(2);
                const pct = d.tipo === 'porcentaje' ? d.valor : 0;
                const mnto = d.tipo === 'monto_fijo' ? d.valor : 0;
                return `<button onclick="aplicarDescuentoRapido(${pct}, ${mnto}, '${esc(d.nombre)}')"
                    style="background:#eff6ff; border:1px solid #bfdbfe; color:#1d4ed8; padding:8px 14px; border-radius:8px; cursor:pointer; font-size:0.85em; font-weight:600; transition:0.2s;"
                    onmouseover="this.style.background='#dbeafe'" onmouseout="this.style.background='#eff6ff'">
                    ${esc(d.nombre)}<br><span style="font-weight:400; color:#6b7280;">-$${montoCalc}</span>
                </button>`;
            }).join('');
        }
    } catch(e) {
        contenedor.innerHTML = '<span style="color:#9ca3af; font-size:0.85em;">No se pudieron cargar.</span>';
    }

    document.getElementById('modal-descuento').classList.remove('hidden');
}

async function aplicarDescuentoRapido(pct, monto, nombre) {
    const aj = await window.api.obtenerAjustes().catch(() => ({}));
    if (aj.requiere_pin_descuentos === 'true') {
        // Guardar pendiente y mostrar modal de PIN
        _pendienteDescuento = { pct, monto, nombre };
        document.getElementById('input-pin-descuento').value = '';
        document.getElementById('modal-pin-descuento').classList.remove('hidden');
        cerrarModalDescuento();
        return;
    }
    _aplicarDescuentoFinal(pct, monto, nombre);
}

async function _aplicarDescuentoFinal(pct, monto, nombre) {
    const subtotal = carrito.reduce((sum, i) => sum + i.precio, 0);
    descuentoActual = pct > 0 ? (subtotal * pct / 100) : monto;
    cerrarModalDescuento();
    renderizarCarrito();
    // Registrar en log
    await window.api.registrarLogDescuento({
        cajero: nombreActivo || 'cajero',
        descuento_nombre: nombre,
        monto_descuento: descuentoActual,
        total_antes: subtotal
    }).catch(() => {});
    // Refrescar alertas del dashboard si está activo
    if (document.getElementById('view-dashboard')?.classList.contains('active')) {
        calcularAlertasWrapper();
    }
}

async function confirmarPinDescuento() {
    if (!_pendienteDescuento) return;
    const pinIngresado = document.getElementById('input-pin-descuento').value;
    const aj = await window.api.obtenerAjustes().catch(() => ({}));
    if (pinIngresado !== (aj.pin_descuentos || '')) {
        document.getElementById('input-pin-descuento').style.borderColor = '#ef4444';
        setTimeout(() => { document.getElementById('input-pin-descuento').style.borderColor = ''; }, 1500);
        return;
    }
    document.getElementById('modal-pin-descuento').classList.add('hidden');
    const { pct, monto, nombre } = _pendienteDescuento;
    _pendienteDescuento = null;
    _aplicarDescuentoFinal(pct, monto, nombre);
}

function cancelarPinDescuento() {
    _pendienteDescuento = null;
    document.getElementById('input-pin-descuento').value = '';
    document.getElementById('modal-pin-descuento').classList.add('hidden');
}

function cerrarModalDescuento() {
    document.getElementById('modal-descuento').classList.add('hidden');
}

function quitarDescuento() {
    descuentoActual = 0;
    cerrarModalDescuento();
    renderizarCarrito();
}

// --- MOSTRAR NOTIFICACIÓN DE ÉXITO ---
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

function mostrarModalImpresion(pedidoId) {
    const modal = document.getElementById('modal-imprimir-ticket');
    if (!modal) return;

    document.getElementById('print-confirm-sub').textContent = `Venta #${pedidoId} registrada correctamente`;
    modal.classList.remove('hidden');

    const btnSi = document.getElementById('btn-si-imprimir');
    const btnNo = document.getElementById('btn-no-imprimir');

    const autoClose = setTimeout(() => modal.classList.add('hidden'), 8000);

    const cerrar = () => {
        clearTimeout(autoClose);
        modal.classList.add('hidden');
        btnSi.onclick = null;
        btnNo.onclick = null;
    };

    btnSi.onclick = () => { cerrar(); imprimirTicket(pedidoId); };
    btnNo.onclick = () => cerrar();
}

/* ============================================
   ADMINISTRACIÓN (PRODUCTOS Y DASHBOARD)
   ============================================ */

async function cargarDashboard() {
    try {
        const stats = await obtenerEstadisticasWrapper(sucursalVistaActual);
        console.log('📊 Stats completos:', stats); // ⬅️ LÍNEA TEMPORAL DE DEBUG
        
        // ============ KPIs PRINCIPALES ============
        
        // Ventas Hoy
        const ventasHoy = stats.ventasHoy.monto_total || 0;
        const ventasAyer = stats.ventasAyer.monto_total || 0;
        const pedidosHoy = stats.ventasHoy.total_pedidos || 0;
        
        document.getElementById('dash-ventas-hoy').innerText = `$${ventasHoy.toFixed(2)}`;
        document.getElementById('dash-ventas-count').innerText = `${pedidosHoy} ${pedidosHoy === 1 ? 'pedido' : 'pedidos'}`;
        
        // Comparación con ayer
        if (ventasAyer > 0) {
            const cambio = ((ventasHoy - ventasAyer) / ventasAyer * 100).toFixed(1);
            const badge = document.getElementById('dash-ventas-comp');
            if (cambio > 0) {
                badge.innerText = `↗️ +${cambio}%`;
                badge.className = 'kpi-badge positive';
            } else if (cambio < 0) {
                badge.innerText = `↘️ ${cambio}%`;
                badge.className = 'kpi-badge negative';
            } else {
                badge.innerText = '→ 0%';
                badge.className = 'kpi-badge';
            }
        } else {
            document.getElementById('dash-ventas-comp').innerText = 'Primer día';
        }
        
        // Ticket Promedio
        const ticketProm = stats.ventasHoy.ticket_promedio || 0;
        document.getElementById('dash-ticket-prom').innerText = `$${ticketProm.toFixed(2)}`;
        
        // Items Vendidos
        document.getElementById('dash-items').innerText = stats.itemsVendidosHoy || 0;
        
        // Alerta de Stock Bajo
        const stockBajo = stats.productosStockBajo || 0;
        const stockAlerta = document.getElementById('dash-stock-alerta');
        if (stockBajo > 0) {
            stockAlerta.innerText = `⚠️ ${stockBajo} con stock bajo`;
            stockAlerta.style.color = '#ef4444';
        } else {
            stockAlerta.innerText = '✅ Stock normal';
            stockAlerta.style.color = '#10b981';
        }
        
        // Clientes Activos
        document.getElementById('dash-clientes').innerText = stats.clientesHoy || 0;
        const vipHoy = stats.clientesVIPHoy?.length || 0;
        document.getElementById('dash-clientes-vip').innerText = `${vipHoy} VIP hoy`;
        
        // ============ GRÁFICA VENTAS 7 DÍAS ============
        
        renderizarGraficaVentas(stats.ultimos7Dias || []);
        // Gráfica de 24 horas
        renderizarGrafica24Horas(stats.ventasPorHora || []);
        
        // ============ TOP 5 PRODUCTOS ============
        
        const topContainer = document.getElementById('top-productos-lista');
        if (!stats.topProductos || stats.topProductos.length === 0) {
            topContainer.innerHTML = '<p style="text-align: center; color: #9ca3af; padding: 40px;">Sin datos aún</p>';
        } else {
            const medallas = ['🥇', '🥈', '🥉'];
            const clases = ['gold', 'silver', 'bronze'];
            
            topContainer.innerHTML = stats.topProductos.map((prod, index) => `
                <div class="top-producto-item">
                    <div class="top-producto-rank ${clases[index] || ''}">${index + 1}</div>
                    <div class="top-producto-emoji">${prod.emoji || '📦'}</div>
                    <div class="top-producto-info">
                        <div class="top-producto-nombre">${prod.nombre}</div>
                        <div class="top-producto-cantidad">Últimos 7 días</div>
                    </div>
                    <div class="top-producto-badge">${prod.total_vendido}</div>
                </div>
            `).join('');
        }
        
        // ============ ÚLTIMAS VENTAS ============
        
        const ventasContainer = document.getElementById('ultimas-ventas-lista');
        if (!stats.ultimasVentas || stats.ultimasVentas.length === 0) {
            ventasContainer.innerHTML = '<p style="text-align: center; color: #9ca3af; padding: 20px;">Sin ventas registradas</p>';
        } else {
            ventasContainer.innerHTML = stats.ultimasVentas.map(venta => {
                const fecha = new Date(venta.fecha_pedido);
                const hora = fecha.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
                
                return `
                    <div class="activity-item">
                        <div class="activity-time">${hora}</div>
                        <div class="activity-cliente">${venta.cliente}</div>
                        <div class="activity-monto">$${venta.total.toFixed(2)}</div>
                    </div>
                `;
            }).join('');
        }
        
        // ============ CLIENTES VIP HOY ============
        
        const vipContainer = document.getElementById('clientes-vip-hoy');
        if (!stats.clientesVIPHoy || stats.clientesVIPHoy.length === 0) {
            vipContainer.innerHTML = '<p style="color: #9ca3af; font-size: 0.85em;">Ninguno aún</p>';
        } else {
            vipContainer.innerHTML = stats.clientesVIPHoy.map(cliente => `
                <div class="vip-item">
                    <div class="vip-item-icon">⭐</div>
                    <div class="vip-item-info">
                        <div class="vip-item-nombre">${cliente.nombre}</div>
                        <div class="vip-item-tel">${cliente.telefono}</div>
                    </div>
                </div>
            `).join('');
        }
        
        // ============ ALERTAS ============
        calcularAlertasWrapper();
        
    } catch (e) {
        console.error('Error al cargar dashboard:', e);
    }
}

// Función auxiliar para la gráfica
let chartVentas = null; // Variable global para almacenar la instancia del chart

function renderizarGraficaVentas(datos) {
    const canvas = document.getElementById('chart-ventas-7dias');
    if (!canvas) {
        console.error('Canvas no encontrado');
        return;
    }
    
    // Destruir chart anterior si existe
    if (chartVentas) {
        chartVentas.destroy();
    }
    
    // Generar últimos 7 días SIEMPRE (aunque no haya datos)
    const labels = [];
    const valores = [];
    const hoy = new Date();
    
    for (let i = 6; i >= 0; i--) {
        const fecha = new Date(hoy);
        fecha.setDate(fecha.getDate() - i);
        const fechaStr = fecha.toISOString().split('T')[0];
        
        const dia = fecha.toLocaleDateString('es-MX', { weekday: 'short' });
        labels.push(dia.charAt(0).toUpperCase() + dia.slice(1));
        
        const dato = datos.find(d => d.fecha === fechaStr);
        valores.push(dato ? dato.monto : 0);
    }
    
    const ctx = canvas.getContext('2d');
    
    // Verificar si Chart está disponible
    if (typeof Chart === 'undefined') {
        console.error('Chart.js no está cargado');
        canvas.parentElement.innerHTML = '<p style="color: #ef4444; text-align: center; padding: 40px;">Error: Chart.js no cargado</p>';
        return;
    }
    
    chartVentas = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Ventas ($)',
                data: valores,
                borderColor: '#2563eb',
                backgroundColor: 'rgba(37, 99, 235, 0.1)',
                borderWidth: 3,
                tension: 0.4,
                fill: true,
                pointBackgroundColor: '#2563eb',
                pointBorderColor: '#fff',
                pointBorderWidth: 2,
                pointRadius: 5,
                pointHoverRadius: 7
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            aspectRatio: 2.5,
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    backgroundColor: 'rgba(0, 0, 0, 0.8)',
                    padding: 12,
                    titleColor: '#fff',
                    bodyColor: '#fff',
                    callbacks: {
                        label: function(context) {
                            return '$' + context.parsed.y.toFixed(2);
                        }
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        callback: function(value) {
                            return '$' + value;
                        }
                    },
                    grid: {
                        color: '#f3f4f6'
                    }
                },
                x: {
                    grid: {
                        display: false
                    }
                }
            }
        }
    });
}

let chart24Horas = null;

function renderizarGrafica24Horas(datos) {
    const canvas = document.getElementById('chart-24horas');
    if (!canvas) return;
    
    // Destruir chart anterior si existe
    if (chart24Horas) {
        chart24Horas.destroy();
    }
    
    // Generar todas las horas (0-23)
    const labels = [];
    const valores = [];
    
    for (let h = 0; h < 24; h++) {
        const horaStr = h.toString().padStart(2, '0');
        labels.push(`${horaStr}:00`);
        
        const dato = datos.find(d => parseInt(d.hora) === h);
        valores.push(dato ? dato.pedidos : 0);
    }
    
    if (typeof Chart === 'undefined') {
        console.error('Chart.js no está cargado');
        return;
    }
    
    const ctx = canvas.getContext('2d');
    chart24Horas = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Pedidos',
                data: valores,
                backgroundColor: 'rgba(37, 99, 235, 0.6)',
                borderColor: '#2563eb',
                borderWidth: 2,
                borderRadius: 6
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            aspectRatio: 3,
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    backgroundColor: 'rgba(0, 0, 0, 0.8)',
                    padding: 12,
                    callbacks: {
                        label: function(context) {
                            return context.parsed.y + ' pedidos';
                        }
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        stepSize: 1
                    },
                    grid: {
                        color: '#f3f4f6'
                    }
                },
                x: {
                    grid: {
                        display: false
                    }
                }
            }
        }
    });
}

// --- MODALES ADMIN ---
function cargarSelectorEmojis(tipo) {
    const cont = document.getElementById(`${tipo}EmojiPicker`);
    if (cont) {
        cont.innerHTML = EMOJIS_DISPONIBLES.map(e => 
            `<div class="emoji-btn" onclick="seleccionarEmoji('${tipo}','${e}')">${e}</div>`
        ).join('');
    }
}

function seleccionarEmoji(tipo, e) {
    emojiSeleccionado = e;
    const display = document.getElementById(`${tipo}EmojiDisplay`);
    if (display) {
        display.innerText = e;
    }
    const picker = document.getElementById(`${tipo}EmojiPicker`);
    if (picker) {
        picker.style.display = 'none';
    }
}

function toggleEmojiPicker(tipo) {
    const el = document.getElementById(`${tipo}EmojiPicker`);
    if (el) {
        el.style.display = el.style.display === 'none' ? 'grid' : 'none';
    }
}

async function seleccionarImagenProducto() {
    const rutaImagen = await window.api.seleccionarImagen();
    if (rutaImagen) {
        rutaImagenTemporal = rutaImagen;
        document.getElementById('prodImagenRuta').value = rutaImagen;
        document.getElementById('prodEmojiDisplay').style.display = 'none';
        const preview = document.getElementById('prodImagenPreview');
        preview.src = 'file://' + rutaImagen;
        preview.style.display = 'block';
    }
}

async function seleccionarImagenCategoria() {
    const rutaImagen = await window.api.seleccionarImagen();
    if (rutaImagen) {
        document.getElementById('catImagenRuta').value = rutaImagen;
        document.getElementById('catEmojiDisplay').style.display = 'none';
        const preview = document.getElementById('catImagenPreview');
        preview.src = 'file://' + rutaImagen;
        preview.style.display = 'block';
    }
}

async function cargarProductosAdmin() {
    try {
        clasificaciones = await obtenerProductosAgrupadosWrapper();
        const contenedor = document.getElementById('lista-productos');
        
        if (!contenedor) return;
        
        contenedor.innerHTML = clasificaciones.map(cat => `
            <div class="clasificacion-bloque">
                <div class="clasificacion-header">
                    <h3>
                        ${cat.imagen 
                            ? `<img src="file://${cat.imagen}" style="width: 30px; height: 30px; border-radius: 6px; object-fit: cover; margin-right: 8px; vertical-align: middle;">` 
                            : `${cat.emoji || '📦'}`
                        } 
                        ${cat.nombre}
                    </h3>
                    ${cat.id ? `
                        <div>
                            <button class="btn-secondary small" onclick="editarCategoria(${cat.id},'${cat.nombre}','${cat.emoji}','${cat.imagen || ''}')">✏️</button>
                        </div>
                    ` : ''}
                </div>
                <div class="productos-grid">
                    ${cat.productos.length > 0 ? cat.productos.map(p => `
                        <div class="product-card" onclick="editarProducto(${p.id})">
                            <div class="product-visual">
                                ${p.imagen
                                    ? `<img src="file://${p.imagen}" class="product-img-display" onerror="this.style.display='none';this.nextElementSibling.style.display=''"><span class="product-emoji" style="display:none">${p.emoji || '📦'}</span>`
                                    : `<span class="product-emoji">${p.emoji || '📦'}</span>`
                                }
                            </div>
                            <h4>${p.nombre}</h4>
                            <p class="precio">$${p.precio.toFixed(2)}</p>
                        </div>
                    `).join('') : '<p style="color: #9ca3af; padding: 20px;">No hay productos en esta categoría</p>'}
                </div>
            </div>
        `).join('');
    } catch (e) {
        console.error('Error al cargar productos:', e);
    }
}

async function abrirModalProducto(p = null) {
    productoEditandoId = p ? p.id : null;
    emojiSeleccionado = p ? p.emoji : '📦';
    
    document.getElementById('prodNombre').value = p ? p.nombre : '';
    document.getElementById('prodDescripcion').value = p ? p.descripcion : '';
    document.getElementById('prodPrecio').value = p ? p.precio : '';
    document.getElementById('prodStock').value = p ? p.stock : '';
    document.getElementById('prodEmojiDisplay').innerText = emojiSeleccionado;
    
    const cats = await window.api.obtenerClasificacionesRaw();
    const sel = document.getElementById('prodCategoria');
    sel.innerHTML = '<option value="">Sin Categoría</option>' + 
        cats.map(c => `<option value="${c.id}" ${p && p.clasificacion_id==c.id ? 'selected':''}>${c.nombre}</option>`).join('');
    

// Resetear estado de imagen siempre al abrir
    rutaImagenTemporal = null;
    document.getElementById('prodImagenRuta').value = '';
    
    if (p && p.imagen) {
        // Producto existente CON imagen: mostrar imagen, ocultar emoji
        const preview = document.getElementById('prodImagenPreview');
        preview.src = 'file://' + p.imagen;
        preview.style.display = 'block';
        document.getElementById('prodEmojiDisplay').style.display = 'none';
    } else {
        // Producto nuevo O existente sin imagen: mostrar emoji, ocultar imagen
        document.getElementById('prodImagenPreview').style.display = 'none';
        document.getElementById('prodImagenPreview').src = '';
        document.getElementById('prodEmojiDisplay').style.display = 'inline';
        document.getElementById('prodEmojiDisplay').innerText = emojiSeleccionado;
    }

    document.getElementById('modalProducto').classList.remove('hidden');
}

function cerrarModalProducto() { 
    document.getElementById('modalProducto').classList.add('hidden'); 
    productoEditandoId = null;
}

async function guardarProducto() {
    const imagenRuta = document.getElementById('prodImagenRuta').value;
    
    const p = {
        nombre: document.getElementById('prodNombre').value,
        descripcion: document.getElementById('prodDescripcion').value,
        precio: parseFloat(document.getElementById('prodPrecio').value),
        stock: parseInt(document.getElementById('prodStock').value),
        clasificacion_id: parseInt(document.getElementById('prodCategoria').value) || null,
        emoji: imagenRuta ? '' : emojiSeleccionado,  // Si hay imagen, no guardar emoji
        imagen: imagenRuta || rutaImagenTemporal
    };
    
    if (!p.nombre || !p.precio) {
        alert('Nombre y precio son obligatorios');
        return;
    }
    
    try {
        if (productoEditandoId) {
            await actualizarProductoWrapper(productoEditandoId, p);
        } else {
            await agregarProductoWrapper(p);
        }
        mostrarNotificacionExito('Producto guardado correctamente', '¡Producto Guardado!');
        cerrarModalProducto();
        cargarProductosAdmin();
    } catch (e) {
        console.error(e);
        alert('Error al guardar producto');
    }
}

async function editarProducto(id) {
    let encontrado = null;
    clasificaciones.forEach(c => {
        let p = c.productos.find(prod => prod.id === id);
        if (p) encontrado = {...p, clasificacion_id: c.id};
    });
    if (encontrado) abrirModalProducto(encontrado);
}

// --- CATEGORÍAS ---
function abrirModalCategoria(cat = null) {
    categoriaEditandoId = cat ? cat.id : null;
    emojiSeleccionado = cat ? cat.emoji : '📦';
    
    document.getElementById('catNombre').value = cat ? cat.nombre : '';
    document.getElementById('catEmojiDisplay').innerText = emojiSeleccionado;
    document.getElementById('modalCatTitulo').innerText = cat ? 'Editar Categoría' : 'Nueva Categoría';
    
    document.getElementById('modalCategoria').classList.remove('hidden');
}

function cerrarModalCategoria() { 
    document.getElementById('modalCategoria').classList.add('hidden'); 
    categoriaEditandoId = null;
}

async function guardarCategoria() {
    const nombre = document.getElementById('catNombre').value.trim();
    const imagenRuta = document.getElementById('catImagenRuta')?.value || '';
    
    if (!nombre) {
        alert('El nombre es obligatorio');
        return;
    }
    
    try {
        const datos = {
            nombre: nombre,
            emoji: imagenRuta ? '' : emojiSeleccionado,  // Si hay imagen, no usar emoji
            imagen: imagenRuta
        };
        
        if (categoriaEditandoId) {
            datos.id = categoriaEditandoId;
            await window.api.editarClasificacion(datos);
        } else {
            await window.api.agregarClasificacion(datos);
        }
        
        mostrarNotificacionExito('Categoría guardada', '¡Categoría Guardada!');
        cerrarModalCategoria();
        cargarProductosAdmin();
    } catch (e) {
        console.error(e);
        alert('Error al guardar categoría');
    }
}

function editarCategoria(id, nombre, emoji) {
    abrirModalCategoria({ id, nombre, emoji });
}
async function cargarPedidos() {
    const contenedor = document.getElementById('lista-pedidos');
    if (!contenedor) return;

    contenedor.innerHTML = '<tr><td colspan="7" style="text-align:center;">Cargando pedidos...</td></tr>';

    try {
        const resultado = await obtenerPedidosWrapper({ ...filtroActual, pagina: paginaPedidos, limite: 50 });
        const pedidos = resultado.data || [];
        const pag = resultado.pagination || {};

        if (resultado._backendError) {
            contenedor.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:20px;color:#dc2626;">⚠️ Error de conexión con el servidor. Tus pedidos están guardados en la nube, revisa tu conexión e intenta de nuevo.</td></tr>';
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
        <td style="font-size:13px;color:var(--text-muted);">${p.cajero || '—'}</td>
        <td>${p.telefono || 'General'}</td>
        <td>${fechaTxt}</td>
        <td style="text-transform: capitalize;">${p.metodo_pago}</td>
        <td><strong>$${parseFloat(p.total).toFixed(2)}</strong></td>
        <td>${renderizarEstadoPedido(p.id, p.estado)}</td>
        <td>
            <button class="btn-secondary small" onclick="verDetallePedido(${p.id}, '${p.telefono || 'General'}', ${p.total}, '${p.metodo_pago}')" style="display:inline-flex; align-items:center; gap:5px;">
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
        if (!filas || filas.length === 0) { alert('No hay pedidos para exportar con los filtros actuales.'); return; }

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
        alert('Error al exportar. Intenta de nuevo.');
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
    const container = document.getElementById('alertas-dashboard');
    if (!container) return;
    if (!alertas || alertas.length === 0) {
        container.innerHTML = '<p style="color:#10b981;font-size:0.85em;">✅ Sin alertas activas</p>';
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
            <span>${a.mensaje}</span>
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

async function cambiarEstadoPedido(pedidoId, nuevoEstado, selectElement) {
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
        alert("Error al actualizar el estado");
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
                    <span><strong>${item.cantidad || 1}x</strong> ${item.nombre}</span>
                    ${item.nota ? `<span class="nota-prod">Nota: ${item.nota}</span>` : ''}
                </div>
                <span>$${(item.precio * (item.cantidad || 1)).toFixed(2)}</span>
            </div>
        `).join('');
        
        document.getElementById('modalDetallePedido').classList.remove('hidden');
    } catch (error) {
        console.error("Error al obtener detalles:", error);
        alert("No se pudieron cargar los productos del pedido.");
    }
}

function cerrarModalDetalle() {
    document.getElementById('modalDetallePedido').classList.add('hidden');
}

let tipoPedidoActual = 'comer';

function seleccionarTipoPedido(tipo, btn) {
    tipoPedidoActual = tipo;
    
    // Cambiar estado visual de botones
    document.querySelectorAll('.tipo-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    
    const contenedor = document.getElementById('campos-dinamicos');
    contenedor.innerHTML = ''; // Limpiar

    if (tipo === 'comer') {
        contenedor.innerHTML = `
            <div class="campo-grupo">
                <label>Mesa # o Nombre</label>
                <input type="text" id="pedido-referencia" placeholder="Ej: Mesa 5">
            </div>
        `;
    } else if (tipo === 'llevar') {
        contenedor.innerHTML = `
            <div class="campo-grupo">
                <label>Nombre del Cliente (Opcional)</label>
                <input type="text" id="pedido-referencia" placeholder="Ej: Juan Perez">
            </div>
        `;
    } else if (tipo === 'domicilio') {
        // Prellenar con datos del cliente si está seleccionado
        let nombrePrellenado = '';
        let direccionPrellenada = '';
        
        if (clienteSeleccionadoVenta) {
            nombrePrellenado = clienteSeleccionadoVenta.nombre;
            direccionPrellenada = clienteSeleccionadoVenta.direccion || '';
        }
        
        contenedor.innerHTML = `
            <div class="campo-grupo">
                <label>Nombre (Opcional)</label>
                <input type="text" id="dom-nombre" placeholder="Nombre completo" value="${nombrePrellenado}">
            </div>
            <div class="campo-grupo">
                <label>Dirección (Opcional)</label>
                <input type="text" id="dom-direccion" placeholder="Calle, número, colonia" value="${direccionPrellenada}">
            </div>
            <div class="campo-grupo">
                <label>Link de Ubicación (Maps)</label>
                <input type="text" id="dom-link" placeholder="Pegar link de Google Maps">
            </div>
        `;
    }
}

// Inicializar el primer estado al cargar
// Llama a esto cuando abras el modal de pago
function resetearModalPago() {
    // Resetear tipo de pedido
    seleccionarTipoPedido('comer', document.querySelector('.tipo-btn'));
    
    // ✅ LIMPIAR MÉTODO DE PAGO SELECCIONADO
    metodoSeleccionado = null;
    document.querySelectorAll('.method-btn').forEach(btn => {
        btn.classList.remove('selected');
    });
    
    // Ocultar calculadora y deshabilitar botón
    document.getElementById('cambio-section').classList.add('hidden');
    const btnConfirmar = document.getElementById('btn-confirmar-final');
    btnConfirmar.classList.add('disabled');
    btnConfirmar.disabled = true;
}

async function cargarClientes() {
    const contenedor = document.getElementById('lista-clientes-body');
    if (!contenedor) return;

    try {
        // Obtener estadísticas y clientes
        const stats = await window.api.obtenerEstadisticasClientes();
        const clientes = await obtenerClientesWrapper();
        
        // Actualizar estadísticas
        document.getElementById('total-clientes-count').innerText = stats.totalClientes;
        document.getElementById('clientes-frecuentes').innerText = stats.clientesFrecuentes;
        document.getElementById('clientes-nuevos-mes').innerText = stats.clientesNuevos;

        // Renderizar Top 3 del mes
        const topLista = document.getElementById('top-clientes-lista');
        if (stats.topClientesMes.length === 0) {
            topLista.innerHTML = `
                <div style="text-align: center; padding: 40px 20px; color: #9ca3af;">
                    <div style="font-size: 2em; margin-bottom: 10px;">📊</div>
                    <p style="font-size: 0.9em;">Aún no hay compras este mes</p>
                </div>
            `;
        } else {
            const medallas = ['🥇', '🥈', '🥉'];
            topLista.innerHTML = stats.topClientesMes.map((cliente, index) => `
                <div class="top-cliente-item">
                    <div class="top-cliente-medal">${medallas[index]}</div>
                    <div class="top-cliente-info">
                        <div class="top-cliente-nombre">${cliente.nombre}</div>
                        <div class="top-cliente-stats">
                            ${cliente.total_pedidos} ${cliente.total_pedidos === 1 ? 'compra' : 'compras'} • $${cliente.monto_total.toFixed(2)}
                        </div>
                    </div>
                    <div class="top-cliente-badge">${cliente.total_pedidos}</div>
                </div>
            `).join('');
        }

        // Si no hay clientes
        if (clientes.length === 0) {
            contenedor.innerHTML = `
                <tr>
                    <td colspan="6" style="text-align: center; padding: 40px;">
                        <div style="color: #9ca3af;">
                            <div style="font-size: 3em; margin-bottom: 10px;">👥</div>
                            <p style="font-size: 1.1em; margin-bottom: 5px;">No hay clientes registrados</p>
                            <p style="font-size: 0.9em;">Agrega tu primer cliente usando el botón "Nuevo Cliente"</p>
                        </div>
                    </td>
                </tr>
            `;
            return;
        }

        // Renderizar tabla de clientes
        contenedor.innerHTML = '';
        clientes.forEach(c => {
            let fechaRegistro = 'N/A';
            if (c.fecha_registro) {
                const fecha = new Date(c.fecha_registro);
                if (!isNaN(fecha)) {
                    fechaRegistro = fecha.toLocaleDateString('es-MX', { 
                        year: 'numeric', 
                        month: 'short', 
                        day: 'numeric' 
                    });
                }
            }

            const fila = document.createElement('tr');
            fila.innerHTML = `
                <td>
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <strong style="color: #111827;">${c.nombre}</strong>
                        ${(c.total_compras || 0) >= 3 ? '<span style="color: #f59e0b;">⭐</span>' : ''}
                    </div>
                </td>
                <td>
                    <span style="color: #6b7280;">📱 ${c.telefono}</span>
                </td>
                <td>
                    ${c.direccion 
                        ? `<span style="color: #374151;">${c.direccion}</span>` 
                        : '<span class="text-muted">Sin dirección</span>'}
                </td>
                <td>
                    <span style="font-weight: 600; color: #2563eb;">
                        ${c.total_compras || 0} ${(c.total_compras || 0) === 1 ? 'compra' : 'compras'}
                    </span>
                </td>
                <td>
                    <span style="color: #7c3aed; font-weight: 600; font-size: 0.88em;">⭐ ${c.puntos || 0} pts</span>
                </td>
                <td>
                    <span style="color: #6b7280; font-size: 0.9em;">${fechaRegistro}</span>
                </td>
                  <td>
                    <div style="display: flex; gap: 5px;">
                        <button class="btn-secondary small" onclick="verDetalleCliente(${c.id})"             title="Ver Detalles">
                            👁️ Ver
                        </button>
                        <button class="btn-secondary small" onclick="editarCliente(${c.id})" title="Editar">
                            ✏️ Editar
                        </button>
                        <button class="btn-secondary small" onclick="confirmarEliminarCliente(${c.id}, '${c.nombre}')" 
                                style="color: #ef4444;" title="Eliminar">
                            🗑️
                        </button>
                    </div>
                </td>
            `;
            contenedor.appendChild(fila);
        });

        // Configurar buscador
        configurarBuscadorClientes(clientes);

        // Cargar programa de fidelidad
        cargarProgramaFidelidad();

    } catch (err) {
        console.error("Error al cargar clientes:", err);
        contenedor.innerHTML = `
            <tr>
                <td colspan="6" style="text-align: center; padding: 40px; color: #ef4444;">
                    ❌ Error al cargar los clientes. Por favor intenta de nuevo.
                </td>
            </tr>
        `;
    }
}

// Función para el buscador de clientes
function configurarBuscadorClientes(clientes) {
    const inputBuscar = document.getElementById('buscar-cliente');
    if (!inputBuscar) return;

    inputBuscar.addEventListener('input', (e) => {
        const busqueda = e.target.value.toLowerCase().trim();
        const tbody = document.getElementById('lista-clientes-body');
        
        if (busqueda === '') {
            // Si no hay búsqueda, mostrar todos
            cargarClientes();
            return;
        }

        const clientesFiltrados = clientes.filter(c => 
            c.nombre.toLowerCase().includes(busqueda) || 
            c.telefono.includes(busqueda)
        );

        // Renderizar resultados filtrados
        tbody.innerHTML = '';
        if (clientesFiltrados.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="6" style="text-align: center; padding: 40px; color: #9ca3af;">
                        🔍 No se encontraron clientes que coincidan con "${busqueda}"
                    </td>
                </tr>
            `;
            return;
        }

        clientesFiltrados.forEach(c => {
            let fechaRegistro = 'N/A';
            if (c.fecha_registro) {
                const fecha = new Date(c.fecha_registro);
                if (!isNaN(fecha)) {
                    fechaRegistro = fecha.toLocaleDateString('es-MX', { 
                        year: 'numeric', 
                        month: 'short', 
                        day: 'numeric' 
                    });
                }
            }

            const fila = document.createElement('tr');
            fila.innerHTML = `
                <td>
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <strong style="color: #111827;">${c.nombre}</strong>
                        ${(c.total_compras || 0) >= 3 ? '<span style="color: #f59e0b;">⭐</span>' : ''}
                    </div>
                </td>
                <td>
                    <span style="color: #6b7280;">📱 ${c.telefono}</span>
                </td>
                <td>
                    ${c.direccion 
                        ? `<span style="color: #374151;">${c.direccion}</span>` 
                        : '<span class="text-muted">Sin dirección</span>'}
                </td>
                <td>
                    <span style="font-weight: 600; color: #2563eb;">
                        ${c.total_compras || 0} ${(c.total_compras || 0) === 1 ? 'compra' : 'compras'}
                    </span>
                </td>
                <td>
                    <span style="color: #7c3aed; font-weight: 600; font-size: 0.88em;">⭐ ${c.puntos || 0} pts</span>
                </td>
                <td>
                    <span style="color: #6b7280; font-size: 0.9em;">${fechaRegistro}</span>
                </td>
               <td>
                    <div style="display: flex; gap: 5px;">
                        <button class="btn-secondary small" onclick="verDetalleCliente(${c.id})" title="Ver Detalles">
                            👁️ Ver
                        </button>
                        <button class="btn-secondary small" onclick="editarCliente(${c.id})" title="Editar">
                            ✏️ Editar
                        </button>
                        <button class="btn-secondary small" onclick="confirmarEliminarCliente(${c.id}, '${c.nombre}')"
                                style="color: #ef4444;" title="Eliminar">
                            🗑️
                        </button>
                    </div>
                </td>
            `;
            tbody.appendChild(fila);
        });
    });
}

async function buscarYAutocompletarCliente(telefono) {
    if (telefono.length >= 10) {
        const cliente = await window.api.buscarClientePorTelefono(telefono);
        if (cliente) {
            // Si el cliente existe, llenamos los campos de domicilio automáticamente
            if (document.getElementById('dom-nombre')) {
                document.getElementById('dom-nombre').value = cliente.nombre;
                document.getElementById('dom-direccion').value = cliente.direccion || '';
                mostrarToast("✅ Cliente reconocido: " + cliente.nombre);
            }
        }
    }
}

function abrirModalCliente() {
    // Limpiar campos antes de abrir
    document.getElementById('cli-telefono').value = '';
    document.getElementById('cli-nombre').value = '';
    document.getElementById('cli-direccion').value = '';
    
    // Asegurar que los campos estén habilitados
    document.getElementById('cli-telefono').disabled = false;
    document.getElementById('cli-nombre').disabled = false;
    document.getElementById('cli-direccion').disabled = false;
    
    // Asegurar que esté en modo "Nuevo Cliente"
    document.querySelector('#modal-cliente .modal-header h3').innerText = 'Registrar Nuevo Cliente';
    const btnGuardar = document.querySelector('#modal-cliente .btn-confirm-payment');
    btnGuardar.onclick = guardarCliente;
    btnGuardar.innerText = 'Guardar Cliente';
    
    // Abrir modal
    document.getElementById('modal-cliente').classList.remove('hidden');
}
function cerrarModalCliente() {
    // Cerrar el modal
    document.getElementById('modal-cliente').classList.add('hidden');
    
    // ✅ LIMPIEZA COMPLETA: Restaurar todos los campos
    document.getElementById('cli-telefono').value = '';
    document.getElementById('cli-nombre').value = '';
    document.getElementById('cli-direccion').value = '';
    
    // ✅ RESTAURAR: Volver el modal a modo "Nuevo Cliente"
    document.querySelector('#modal-cliente .modal-header h3').innerText = 'Registrar Nuevo Cliente';
    
    // ✅ RESTAURAR: Volver el botón a su función original
    const btnGuardar = document.querySelector('#modal-cliente .btn-confirm-payment');
    btnGuardar.onclick = guardarCliente;
    btnGuardar.innerText = 'Guardar Cliente';
    
    // ✅ IMPORTANTE: Habilitar los campos por si quedaron deshabilitados
    document.getElementById('cli-telefono').disabled = false;
    document.getElementById('cli-nombre').disabled = false;
    document.getElementById('cli-direccion').disabled = false;
}

async function guardarCliente() {
    const telefono = document.getElementById('cli-telefono').value.trim();
    const nombre = document.getElementById('cli-nombre').value.trim();
    const direccion = document.getElementById('cli-direccion').value.trim();

    if (!telefono || !nombre) {
        alert("El teléfono y el nombre son obligatorios.");
        return;
    }

    const btnGuardar = document.querySelector('#modal-cliente .btn-confirm-payment');
    if (btnGuardar) btnGuardar.disabled = true;

    try {
        await crearClienteWrapper({
            telefono: telefono,
            nombre: nombre,
            direccion: direccion,
            notas: ''
        });

        mostrarNotificacionExito('Cliente guardado correctamente', '¡Cliente Guardado!');
        cerrarModalCliente();
        cargarClientes();
    } catch (error) {
        console.error("Error al guardar cliente:", error);
        alert("Error al guardar el cliente");
        if (btnGuardar) btnGuardar.disabled = false;
    }
}

function editarCliente(id) {
    // Buscar el cliente en la lista
    window.api.obtenerClientesConCompras().then(clientes => {
        const cliente = clientes.find(c => c.id === id);
        if (!cliente) {
            alert("Cliente no encontrado");
            return;
        }

        // Asegurar que los campos estén habilitados
        document.getElementById('cli-telefono').disabled = false;
        document.getElementById('cli-nombre').disabled = false;
        document.getElementById('cli-direccion').disabled = false;

        // Llenar el modal con los datos del cliente
        document.getElementById('cli-telefono').value = cliente.telefono;
        document.getElementById('cli-nombre').value = cliente.nombre;
        document.getElementById('cli-direccion').value = cliente.direccion || '';

        // Cambiar el título del modal
        document.querySelector('#modal-cliente .modal-header h3').innerText = 'Editar Cliente';

        // Cambiar el comportamiento del botón guardar temporalmente
        const btnGuardar = document.querySelector('#modal-cliente .btn-confirm-payment');
        btnGuardar.onclick = () => actualizarClienteExistente(id);
        btnGuardar.innerText = 'Actualizar Cliente';

        // Abrir modal
        document.getElementById('modal-cliente').classList.remove('hidden');
    }).catch(error => {
        console.error("Error al cargar cliente para editar:", error);
        alert("Error al cargar los datos del cliente");
    });
}
async function actualizarClienteExistente(id) {
    const telefono = document.getElementById('cli-telefono').value.trim();
    const nombre = document.getElementById('cli-nombre').value.trim();
    const direccion = document.getElementById('cli-direccion').value.trim();

    if (!telefono || !nombre) {
        alert("El teléfono y el nombre son obligatorios.");
        return;
    }

    try {
        await window.api.actualizarCliente(id, {
            telefono,
            nombre,
            direccion,
            notas: ''
        });

        // En modo conectado, también guardar en el backend
        if (modoConectado && apiClient && tokenActual) {
            await apiClient.updateCustomer(id, { phone: telefono, name: nombre, address: direccion }).catch(() => {});
        }

        mostrarNotificacionExito('Cliente actualizado correctamente', '¡Cliente Actualizado!');

        cerrarModalCliente();
        cargarClientes(); // Recargar la lista

    } catch (error) {
        console.error("Error al actualizar cliente:", error);
        alert("Error al actualizar el cliente");
    }
}

function confirmarEliminarCliente(id, nombre) {
    if (confirm(`¿Estás seguro de eliminar al cliente "${nombre}"?\n\nSi tiene pedidos asociados, se marcará como eliminado pero no se borrará completamente.`)) {
        window.api.eliminarCliente(id).then(() => {
            mostrarNotificacionExito('Cliente eliminado correctamente', '¡Cliente Eliminado!');
            cargarClientes();  // Recargar la lista
        }).catch(error => {
            console.error("Error al eliminar cliente:", error);
            alert("Error al eliminar el cliente");
        });
    }
}

function verDetalleCliente(id) {
    obtenerClientesWrapper().then(clientes => {
        const cliente = clientes.find(c => c.id === id);
        if (!cliente) {
            alert("Cliente no encontrado");
            return;
        }

        // Llenar modal con datos
        document.getElementById('ver-cli-nombre').innerText = cliente.nombre;
        document.getElementById('ver-cli-telefono').innerText = cliente.telefono;
        document.getElementById('ver-cli-direccion').innerText = cliente.direccion || 'Sin dirección registrada';
        document.getElementById('ver-cli-compras').innerText = cliente.total_compras || 0;
        document.getElementById('ver-cli-monto').innerText = `$${(cliente.monto_total || 0).toFixed(2)}`;
        const elPuntos = document.getElementById('ver-cli-puntos');
        if (elPuntos) elPuntos.innerText = `${cliente.puntos || 0} pts`;
        
        // Formatear fecha
        let fechaRegistro = 'No disponible';
        if (cliente.fecha_registro) {
            const fecha = new Date(cliente.fecha_registro);
            if (!isNaN(fecha)) {
                fechaRegistro = fecha.toLocaleDateString('es-MX', { 
                    weekday: 'long',
                    year: 'numeric', 
                    month: 'long', 
                    day: 'numeric' 
                });
            }
        }
        document.getElementById('ver-cli-fecha').innerText = fechaRegistro;

        // Abrir modal
        document.getElementById('modal-ver-cliente').classList.remove('hidden');
    }).catch(error => {
        console.error("Error al cargar cliente:", error);
        alert("Error al cargar los datos del cliente");
    });
}

function cerrarModalVerCliente() {
    document.getElementById('modal-ver-cliente').classList.add('hidden');
}

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

    const btnTodas = document.createElement('button');
    btnTodas.className = 'branch-tab active';
    btnTodas.textContent = 'Todas';
    btnTodas.onclick = () => cambiarSucursalVista(null, btnTodas, container);
    container.appendChild(btnTodas);

    branches.forEach(b => {
        const btn = document.createElement('button');
        btn.className = 'branch-tab';
        btn.textContent = b.name;
        btn.onclick = () => cambiarSucursalVista(b.id, btn, container);
        container.appendChild(btn);
    });
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
                ? ' <span style="background:#ede9fe;color:#7c3aed;font-size:0.75em;padding:2px 6px;border-radius:10px;font-weight:600;">📍 Este dispositivo</span>'
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

async function cargarAjustesInstalados() {
    try {
        console.log("Sincronizando ajustes...");
        const ajustes = await window.api.obtenerAjustes();
        
        // Información del negocio
        if(ajustes.business_name && document.getElementById('adj-nombre-negocio')) 
            document.getElementById('adj-nombre-negocio').value = ajustes.business_name;
        if(ajustes.business_address && document.getElementById('adj-direccion-negocio')) 
            document.getElementById('adj-direccion-negocio').value = ajustes.business_address;
        if(ajustes.business_phone && document.getElementById('adj-telefono-negocio')) 
            document.getElementById('adj-telefono-negocio').value = ajustes.business_phone;
        
        // Ajustes de ticket
        if(ajustes.show_logo && document.getElementById('adj-show-logo')) 
            document.getElementById('adj-show-logo').checked = (ajustes.show_logo === 'true');
        if(ajustes.show_phone && document.getElementById('adj-show-phone')) 
            document.getElementById('adj-show-phone').checked = (ajustes.show_phone === 'true');
        if(ajustes.show_direccion && document.getElementById('adj-show-direccion')) 
            document.getElementById('adj-show-direccion').checked = (ajustes.show_direccion === 'true');
        
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
        ventaSinTurno = (ajustes.venta_sin_turno !== 'false');
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

        // Permisos por rol (solo dueño)
        cargarPermisosAjustes();

        // Sistema de puntos
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

        console.log("Ajustes cargados con éxito.");
    } catch (error) {
        console.error("Error cargando ajustes:", error);
    }
}

// Función para agregar listeners de guardado automático
function agregarListenersGuardadoAjustes() {
    // Información del negocio
    const nombreNegocio = document.getElementById('adj-nombre-negocio');
    const telefonoNegocio = document.getElementById('adj-telefono-negocio');
    const direccionNegocio = document.getElementById('adj-direccion-negocio');
    
    if (nombreNegocio) {
        nombreNegocio.addEventListener('blur', async () => {
            await window.api.guardarAjuste('business_name', nombreNegocio.value);
        });
    }
    
    if (telefonoNegocio) {
        telefonoNegocio.addEventListener('blur', async () => {
            await window.api.guardarAjuste('business_phone', telefonoNegocio.value);
        });
    }
    
    if (direccionNegocio) {
        direccionNegocio.addEventListener('blur', async () => {
            await window.api.guardarAjuste('business_address', direccionNegocio.value);
        });
    }
    
    // Checkboxes de ticket
    const showLogo = document.getElementById('adj-show-logo');
    const showPhone = document.getElementById('adj-show-phone');
    const showDireccion = document.getElementById('adj-show-direccion');
    
    if (showLogo) {
        showLogo.addEventListener('change', async () => {
            await window.api.guardarAjuste('show_logo', showLogo.checked ? 'true' : 'false');
        });
    }
    
    if (showPhone) {
        showPhone.addEventListener('change', async () => {
            await window.api.guardarAjuste('show_phone', showPhone.checked ? 'true' : 'false');
        });
    }
    
    if (showDireccion) {
        showDireccion.addEventListener('change', async () => {
            await window.api.guardarAjuste('show_direccion', showDireccion.checked ? 'true' : 'false');
        });
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
        });
    }

    // Sistema de puntos
    const elPuntosActivos = document.getElementById('aj-puntos-activos');
    if (elPuntosActivos) {
        elPuntosActivos.addEventListener('change', () =>
            window.api.guardarAjuste('puntos_activos', elPuntosActivos.checked ? 'true' : 'false'));
    }
    const elPuntosPeso = document.getElementById('aj-puntos-por-peso');
    if (elPuntosPeso) {
        elPuntosPeso.addEventListener('change', () =>
            window.api.guardarAjuste('puntos_por_peso', elPuntosPeso.value));
    }
    const elPuntosBono = document.getElementById('aj-puntos-bono');
    if (elPuntosBono) {
        elPuntosBono.addEventListener('change', () =>
            window.api.guardarAjuste('puntos_bono_pedido', elPuntosBono.value));
    }
    const elPuntosValor = document.getElementById('aj-puntos-valor');
    if (elPuntosValor) {
        elPuntosValor.addEventListener('change', () =>
            window.api.guardarAjuste('puntos_valor', elPuntosValor.value));
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

        // 2. Obtener ajustes
        const ajustes = await window.api.obtenerAjustes().catch(() => ({}));
        const nombreNegocio = ajustes.business_name || 'Mi Negocio';
        const telefonoNegocio = ajustes.business_phone || '';
        const direccionNegocio = ajustes.business_address || '';
        const mostrarLogo = ajustes.show_logo === 'true';
        const mostrarTelefono = ajustes.show_phone === 'true';
        const mostrarDireccion = ajustes.show_direccion === 'true';
        const moneda = ajustes.currency_symbol || '$';
        const rutaLogo = ajustes.logo_path || './assets/logo/montana.png';

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
                        ${logoBase64 ? `<img src="${logoBase64}" alt="Logo" class="logo">` : ''}
                        <div class="negocio">${nombreNegocio}</div>
                        ${mostrarDireccion && direccionNegocio ? `<div class="info-line">${direccionNegocio}</div>` : ''}
                        ${mostrarTelefono && telefonoNegocio ? `<div class="info-line">Tel: ${telefonoNegocio}</div>` : ''}
                        <div class="separator"></div>
                        <div class="info-line"><strong>Ticket #${pedido.id}</strong></div>
                        <div class="info-line">${fechaFormateada}</div>
                        ${nombreClienteTicket ? `<div class="info-line">Cliente: ${nombreClienteTicket}</div>` : ''}
                        ${pedido.tipo_pedido ? `<div class="info-line">Tipo: ${pedido.tipo_pedido.toUpperCase()}</div>` : ''}
                    </div>

                    <div class="items">
                        ${detalles.map(item => `
                            <div class="item">
                                <span class="item-name">${item.nombre}</span>
                                <span class="item-qty">x${item.cantidad}</span>
                                <span class="item-price">${moneda}${item.precio.toFixed(2)}</span>
                            </div>
                            ${item.nota ? `<div class="nota">* ${item.nota}</div>` : ''}
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
                            <span>${pedido.metodo_pago || 'N/A'}</span>
                        </div>
                    </div>

                    ${(ajustes.puntos_activos === 'true' && nombreClienteTicket) ? `
                    <div class="separator"></div>
                    <div style="text-align:center;font-size:11px;margin:6px 0;">
                        <div>⭐ Puntos ganados: <b>+${Math.floor(pedido.total * parseFloat(ajustes.puntos_por_peso || '0')) + parseInt(ajustes.puntos_bono_pedido || '0')}</b></div>
                    </div>` : ''}

                    <div class="footer">
                        <div class="gracias">¡Gracias por tu compra!</div>
                        <div style="margin-top: 6px;">Vuelve pronto</div>
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
            alert('✅ Logo actualizado correctamente');
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
        btn.innerText = '⏳ Verificando...';
        btn.disabled = true;
        
        const result = await window.api.checkForUpdates();
        
        if (result && result.updateInfo) {
            alert(`✅ Actualización disponible: v${result.updateInfo.version}\n\nLa descarga comenzará automáticamente.`);
        } else {
            alert('✅ Ya estás usando la versión más reciente');
        }
        
    } catch (error) {
        console.error('Error al verificar actualizaciones:', error);
        alert('❌ No se pudo verificar actualizaciones. Verifica tu conexión a internet.');
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

// ============================================
// MÓDULO DE INVENTARIO
// ============================================

let insumosCache = [];
let preparacionesCache = [];
let productosRecetaCache = [];
let insumoEditandoId = null;
let preparacionEditandoId = null;
let productoRecetaActual = null;

async function cargarInventario() {
    try {
        insumosCache = await window.api.obtenerInsumos();
        preparacionesCache = await window.api.obtenerPreparaciones();
        const agrupados = await obtenerProductosAgrupadosWrapper();
        productosRecetaCache = [];
        agrupados.forEach(cat => {
            cat.productos.forEach(p => {
                productosRecetaCache.push({ ...p, categoria: cat.nombre });
            });
        });
        renderizarTablaInsumos();
        renderizarTablaPreparaciones();
        renderizarTablaRecetas();
    } catch (e) {
        console.error('Error al cargar inventario:', e);
    }
}

function cambiarTabInventario(tab, btn) {
    document.querySelectorAll('.inv-tab').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    document.querySelectorAll('.inv-panel').forEach(p => p.style.display = 'none');
    document.getElementById(`inv-panel-${tab}`).style.display = 'block';
    if (tab === 'entradas') cargarTablaEntradas();
    if (tab === 'salidas') cargarTablaSalidas();
}

// --- INSUMOS ---
function renderizarTablaInsumos() {
    const tbody = document.getElementById('tabla-insumos');
    if (!insumosCache.length) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:30px; color:#9ca3af;">
            Aún no has registrado insumos. Haz clic en "+ Agregar Insumo" para comenzar.
        </td></tr>`;
        return;
    }
    tbody.innerHTML = insumosCache.map(ins => {
        let estadoBadge, estadoClase;
        if (ins.stock_actual <= 0) {
            estadoBadge = 'Sin stock'; estadoClase = 'badge-stock-cero';
        } else if (ins.stock_minimo > 0 && ins.stock_actual <= ins.stock_minimo) {
            estadoBadge = 'Stock bajo'; estadoClase = 'badge-stock-bajo';
        } else {
            estadoBadge = 'Normal'; estadoClase = 'badge-stock-ok';
        }
        return `<tr>
            <td><strong>${ins.nombre}</strong></td>
            <td><span class="badge-info">${ins.unidad}</span></td>
            <td class="${ins.stock_actual <= 0 ? 'stock-cero' : ins.stock_actual <= ins.stock_minimo && ins.stock_minimo > 0 ? 'stock-bajo' : 'stock-ok'}">
                ${ins.stock_actual} ${ins.unidad}
            </td>
            <td style="color:#6b7280;">${ins.stock_minimo > 0 ? ins.stock_minimo + ' ' + ins.unidad : '—'}</td>
            <td><span class="${estadoClase}">${estadoBadge}</span></td>
            <td>
                <div style="display:flex; gap:6px;">
                    <button class="btn-secondary small" onclick="editarInsumo(${ins.id})" style="display:inline-flex;align-items:center;gap:4px;">
                        <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/><path d="m15 5 4 4"/></svg>
                        Editar
                    </button>
                    <button class="btn-secondary small" onclick="confirmarEliminarInsumo(${ins.id}, '${ins.nombre}')" style="color:#ef4444; display:inline-flex;align-items:center;gap:4px;">
                        <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 11v6"/><path d="M14 11v6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                    </button>
                </div>
            </td>
        </tr>`;
    }).join('');
}

// Unidades que necesitan conversión (no son nativas de peso/volumen)
const UNIDADES_CON_CONVERSION = ['pzas', 'latas', 'bolsas', 'porciones'];

function abrirModalInsumo(ins = null) {
    insumoEditandoId = ins ? ins.id : null;
    document.getElementById('modal-insumo-titulo').innerText = ins ? 'Editar Insumo' : 'Nuevo Insumo';
    document.getElementById('ins-nombre').value = ins ? ins.nombre : '';
    document.getElementById('ins-unidad').value = ins ? ins.unidad : 'kg';
    document.getElementById('ins-stock').value = ins ? ins.stock_actual : '';
    document.getElementById('ins-minimo').value = ins ? ins.stock_minimo : '';

    // Mostrar/ocultar bloque de conversión según unidad
    const unidad = ins ? ins.unidad : 'kg';
    const bloqueConv = document.getElementById('bloque-conversion');
    if (UNIDADES_CON_CONVERSION.includes(unidad)) {
        bloqueConv.style.display = 'block';
        document.getElementById('conv-unidad-label').innerText = unidad;
        document.getElementById('ins-contenido-cantidad').value = ins ? ins.contenido_cantidad || '' : '';
        document.getElementById('ins-contenido-unidad').value = ins ? ins.contenido_unidad || 'g' : 'g';
    } else {
        bloqueConv.style.display = 'none';
    }

    // Listener para que el bloque aparezca/desaparezca al cambiar la unidad
    document.getElementById('ins-unidad').onchange = function() {
        const u = this.value;
        document.getElementById('conv-unidad-label').innerText = u;
        document.getElementById('bloque-conversion').style.display =
            UNIDADES_CON_CONVERSION.includes(u) ? 'block' : 'none';
    };

    document.getElementById('modal-insumo').classList.remove('hidden');
}

function cerrarModalInsumo() {
    document.getElementById('modal-insumo').classList.add('hidden');
    insumoEditandoId = null;
}

async function guardarInsumo() {
    const nombre = document.getElementById('ins-nombre').value.trim();
    const unidad = document.getElementById('ins-unidad').value;
    const stock_actual = parseFloat(document.getElementById('ins-stock').value) || 0;
    const stock_minimo = parseFloat(document.getElementById('ins-minimo').value) || 0;
    if (!nombre) { alert('El nombre es obligatorio'); return; }
    try {
        const contenido_cantidad = parseFloat(document.getElementById('ins-contenido-cantidad').value) || null;
        const contenido_unidad = document.getElementById('ins-contenido-unidad').value || null;
        const datos = { nombre, unidad, stock_actual, stock_minimo, contenido_cantidad, contenido_unidad };
        const datosAPI = { name: nombre, unit: unidad, stock: stock_actual, min_stock: stock_minimo,
                           content_amount: contenido_cantidad, content_unit: contenido_unidad };
        if (modoConectado && apiClient && tokenActual) {
            if (insumoEditandoId) {
                await apiClient.request(`/inventory/ingredients/${insumoEditandoId}`, { method: 'PUT', body: datosAPI });
                await window.api.actualizarInsumo(insumoEditandoId, datos);
            } else {
                const nuevo = await apiClient.request('/inventory/ingredients', { method: 'POST', body: datosAPI });
                await window.api.agregarInsumoConId(nuevo.id, datos);
            }
        } else {
            if (insumoEditandoId) {
                await window.api.actualizarInsumo(insumoEditandoId, datos);
            } else {
                await window.api.agregarInsumo(datos);
            }
        }
        cerrarModalInsumo();
        insumosCache = await window.api.obtenerInsumos();
        renderizarTablaInsumos();
        mostrarNotificacionExito('Insumo guardado', '¡Guardado!');
    } catch (e) { console.error(e); alert('Error al guardar el insumo'); }
}

function editarInsumo(id) {
    const ins = insumosCache.find(i => i.id === id);
    if (ins) abrirModalInsumo(ins);
}

async function confirmarEliminarInsumo(id, nombre) {
    if (confirm(`¿Eliminar el insumo "${nombre}"?\n\nSe eliminará de todas las preparaciones y recetas donde aparezca.`)) {
        if (modoConectado && apiClient && tokenActual) {
            try { await apiClient.request(`/inventory/ingredients/${id}`, { method: 'DELETE' }); }
            catch (e) { console.warn('No se pudo eliminar insumo en backend:', e.message); }
        }
        await window.api.eliminarInsumo(id);
        insumosCache = await window.api.obtenerInsumos();
        renderizarTablaInsumos();
        mostrarNotificacionExito('Insumo eliminado', '¡Eliminado!');
    }
}

// --- PREPARACIONES ---
function renderizarTablaPreparaciones() {
    const tbody = document.getElementById('tabla-preparaciones');
    if (!preparacionesCache.length) {
        tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; padding:30px; color:#9ca3af;">
            Aún no hay preparaciones. Úsalas para modelar mezclas o concentrados hechos en cocina.
        </td></tr>`;
        return;
    }
    tbody.innerHTML = preparacionesCache.map(prep => `<tr>
        <td><strong>${prep.nombre}</strong></td>
        <td style="color:#6b7280;">${prep.descripcion || '—'}</td>
        <td>
            <span class="badge-info" id="prep-count-${prep.id}">...</span>
            <span id="prep-stock-${prep.id}" style="display:block; font-size:0.8em; margin-top:4px; color:#9ca3af;">...</span>
        </td>
        <td>
            <div style="display:flex; gap:6px;">
                <button class="btn-secondary small" onclick="editarPreparacion(${prep.id})" style="display:inline-flex;align-items:center;gap:4px;">
                    <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/><path d="m15 5 4 4"/></svg>
                    Editar
                </button>
                <button class="btn-secondary small" onclick="confirmarEliminarPreparacion(${prep.id}, '${prep.nombre}')" style="color:#ef4444; display:inline-flex;align-items:center;gap:4px;">
                    <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 11v6"/><path d="M14 11v6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                </button>
            </div>
        </td>
    </tr>`).join('');

    // Cargar conteo de items por preparación
    preparacionesCache.forEach(prep => {
        window.api.obtenerItemsPreparacion(prep.id).then(items => {
            const el = document.getElementById(`prep-count-${prep.id}`);
            if (el) el.innerText = `${items.length} insumo${items.length !== 1 ? 's' : ''}`;
        });
        window.api.calcularStockPreparacion(prep.id).then(stock => {
            const el = document.getElementById(`prep-stock-${prep.id}`);
            if (!el) return;
            if (stock === null) { el.innerText = ''; return; }
            if (stock === 0) {
                el.innerHTML = '<span style="color:#ef4444; font-weight:600;">Sin stock para preparar</span>';
            } else {
                el.innerHTML = `<span style="color:#10b981; font-weight:600;">✓ ${stock} porción${stock !== 1 ? 'es' : ''} posibles</span>`;
            }
        }).catch(() => {});
    });
}

function abrirModalPreparacion(prep = null) {
    preparacionEditandoId = prep ? prep.id : null;
    document.getElementById('modal-prep-titulo').innerText = prep ? 'Editar Preparación' : 'Nueva Preparación';
    document.getElementById('prep-nombre').value = prep ? prep.nombre : '';
    document.getElementById('prep-descripcion').value = prep ? prep.descripcion || '' : '';
    document.getElementById('prep-items-lista').innerHTML = '';

    if (prep) {
        window.api.obtenerItemsPreparacion(prep.id).then(items => {
            items.forEach(item => agregarLineaPrep(item));
        });
    } else {
        agregarLineaPrep();
    }
    document.getElementById('modal-preparacion').classList.remove('hidden');
}

function cerrarModalPreparacion() {
    document.getElementById('modal-preparacion').classList.add('hidden');
    preparacionEditandoId = null;
}

function agregarLineaPrep(itemExistente = null) {
    const lista = document.getElementById('prep-items-lista');
    const div = document.createElement('div');
    div.className = 'receta-linea';
    const opcionesInsumos = insumosCache.map(i =>
        `<option value="${i.id}" ${itemExistente && itemExistente.insumo_id === i.id ? 'selected' : ''}>${i.nombre} (${i.unidad})</option>`
    ).join('');
    div.innerHTML = `
        <select>${insumosCache.length ? opcionesInsumos : '<option value="">— Sin insumos —</option>'}</select>
        <input type="number" placeholder="Cantidad" min="0" step="0.01" value="${itemExistente ? itemExistente.cantidad : ''}">
        <button class="btn-quitar" onclick="this.parentElement.remove()" title="Quitar">
            <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 11v6"/><path d="M14 11v6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
        </button>
    `;
    lista.appendChild(div);
}

async function guardarPreparacion() {
    const nombre = document.getElementById('prep-nombre').value.trim();
    if (!nombre) { alert('El nombre es obligatorio'); return; }
    const items = [];
    document.querySelectorAll('#prep-items-lista .receta-linea').forEach(linea => {
        const sel = linea.querySelector('select');
        const inp = linea.querySelector('input[type="number"]');
        if (sel && sel.value && inp && inp.value) {
            items.push({ insumo_id: parseInt(sel.value), cantidad: parseFloat(inp.value) });
        }
    });
    try {
        const datos = { nombre, descripcion: document.getElementById('prep-descripcion').value.trim() };
        if (modoConectado && apiClient && tokenActual) {
            const itemsAPI = items.map(i => ({ ingredient_id: i.insumo_id, quantity: i.cantidad }));
            if (preparacionEditandoId) {
                await apiClient.request(`/inventory/preparations/${preparacionEditandoId}`, { method: 'PUT', body: { name: nombre } });
                if (itemsAPI.length > 0) await apiClient.request(`/inventory/preparations/${preparacionEditandoId}/recipe`, { method: 'POST', body: { items: itemsAPI } });
                await window.api.actualizarPreparacion(preparacionEditandoId, datos);
                await window.api.guardarItemsPreparacion(preparacionEditandoId, items);
            } else {
                const nueva = await apiClient.request('/inventory/preparations', { method: 'POST', body: { name: nombre, unit: 'porcion', yield_quantity: 1 } });
                if (itemsAPI.length > 0) await apiClient.request(`/inventory/preparations/${nueva.id}/recipe`, { method: 'POST', body: { items: itemsAPI } });
                await window.api.agregarPreparacionConId(nueva.id, datos);
                await window.api.guardarItemsPreparacion(nueva.id, items);
            }
        } else {
            if (preparacionEditandoId) {
                await window.api.actualizarPreparacion(preparacionEditandoId, datos);
                await window.api.guardarItemsPreparacion(preparacionEditandoId, items);
            } else {
                await window.api.agregarPreparacion(datos);
                const preps = await window.api.obtenerPreparaciones();
                const nueva = preps[preps.length - 1];
                await window.api.guardarItemsPreparacion(nueva.id, items);
            }
        }
        cerrarModalPreparacion();
        preparacionesCache = await window.api.obtenerPreparaciones();
        renderizarTablaPreparaciones();
        mostrarNotificacionExito('Preparación guardada', '¡Guardado!');
    } catch (e) { console.error(e); alert('Error al guardar la preparación'); }
}

async function editarPreparacion(id) {
    const prep = preparacionesCache.find(p => p.id === id);
    if (prep) abrirModalPreparacion(prep);
}

async function confirmarEliminarPreparacion(id, nombre) {
    if (confirm(`¿Eliminar la preparación "${nombre}"?`)) {
        if (modoConectado && apiClient && tokenActual) {
            try { await apiClient.request(`/inventory/preparations/${id}`, { method: 'DELETE' }); }
            catch (e) { console.warn('No se pudo eliminar preparación en backend:', e.message); }
        }
        await window.api.eliminarPreparacion(id);
        preparacionesCache = await window.api.obtenerPreparaciones();
        renderizarTablaPreparaciones();
        mostrarNotificacionExito('Preparación eliminada', '¡Eliminado!');
    }
}

// --- RECETAS ---
function renderizarTablaRecetas() {
    const tbody = document.getElementById('tabla-recetas');
    if (!productosRecetaCache.length) {
        tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; padding:30px; color:#9ca3af;">No hay productos en el menú.</td></tr>`;
        return;
    }
    tbody.innerHTML = productosRecetaCache.map(p => `<tr>
        <td>
            <div style="display:flex; align-items:center; gap:8px;">
                <span>${p.emoji || '📦'}</span>
                <strong>${p.nombre}</strong>
            </div>
        </td>
        <td><span class="badge-info">${p.categoria || '—'}</span></td>
        <td><span id="receta-count-${p.id}" style="color:#6b7280; font-size:0.9em;">Cargando...</span></td>
        <td>
            <button class="btn-secondary small" onclick="abrirModalReceta(${p.id}, '${p.nombre.replace(/'/g,'')}')" style="display:inline-flex;align-items:center;gap:4px;">
                <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/><path d="m15 5 4 4"/></svg>
                Editar receta
            </button>
        </td>
    </tr>`).join('');

    productosRecetaCache.forEach(p => {
        window.api.obtenerRecetaProducto(p.id).then(items => {
            const el = document.getElementById(`receta-count-${p.id}`);
            if (el) el.innerText = items.length > 0
                ? `${items.length} ingrediente${items.length !== 1 ? 's' : ''}`
                : 'Sin receta';
        });
    });
}

async function abrirModalReceta(productoId, nombre) {
    productoRecetaActual = productoId;
    document.getElementById('modal-receta-titulo').innerText = `Receta: ${nombre}`;
    document.getElementById('receta-items-lista').innerHTML = '';
    const items = await window.api.obtenerRecetaProducto(productoId);
    if (items.length > 0) {
        items.forEach(item => agregarLineaReceta(item));
    } else {
        agregarLineaReceta();
    }
    document.getElementById('modal-receta').classList.remove('hidden');
}

function cerrarModalReceta() {
    document.getElementById('modal-receta').classList.add('hidden');
    productoRecetaActual = null;
}

function agregarLineaReceta(itemExistente = null) {
    const lista = document.getElementById('receta-items-lista');
    const div = document.createElement('div');
    div.className = 'receta-linea';

    const opcionesInsumos = insumosCache.map(i =>
        `<option value="insumo_${i.id}" ${itemExistente && itemExistente.tipo === 'insumo' && itemExistente.referencia_id === i.id ? 'selected' : ''}>🧂 ${i.nombre} (${i.unidad})</option>`
    ).join('');
    const opcionesPrep = preparacionesCache.map(p =>
        `<option value="preparacion_${p.id}" ${itemExistente && itemExistente.tipo === 'preparacion' && itemExistente.referencia_id === p.id ? 'selected' : ''}>🧪 ${p.nombre}</option>`
    ).join('');

    div.innerHTML = `
        <select class="sel-ingrediente" onchange="actualizarUnidadReceta(this)">
            <optgroup label="Insumos">${opcionesInsumos || '<option disabled>Sin insumos</option>'}</optgroup>
            <optgroup label="Preparaciones">${opcionesPrep || '<option disabled>Sin preparaciones</option>'}</optgroup>
        </select>
        <input type="number" placeholder="Cantidad" min="0" step="0.01" value="${itemExistente ? itemExistente.cantidad : ''}">
        <select class="sel-unidad-receta" style="flex:1; min-width:60px;">
            <option value="">—</option>
        </select>
        <button class="btn-quitar" onclick="this.parentElement.remove()" title="Quitar">
            <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 11v6"/><path d="M14 11v6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
        </button>
    `;
    lista.appendChild(div);

    // Inicializar unidades al cargar
    const selIngrediente = div.querySelector('.sel-ingrediente');
    actualizarUnidadReceta(selIngrediente, itemExistente ? itemExistente.unidad_receta : null);
}

// Equivalencias automáticas entre unidades del mismo tipo
const EQUIVALENCIAS_UNIDAD = {
    'kg':     [{ unidad: 'g',   factor: 1000,    label: 'g (gramos)' }],
    'g':      [{ unidad: 'kg',  factor: 0.001,   label: 'kg (kilogramos)' }],
    'l':      [{ unidad: 'ml',  factor: 1000,    label: 'ml (mililitros)' },
               { unidad: 'gal', factor: 0.26417, label: 'gal (galones)' }],
    'ml':     [{ unidad: 'l',   factor: 0.001,   label: 'l (litros)' }],
    'gal':    [{ unidad: 'l',   factor: 3.78541, label: 'l (litros)' },
               { unidad: 'ml',  factor: 3785.41, label: 'ml (mililitros)' }],
    'latas':  [],
    'bolsas': [],
    'pzas':   [],
    'porciones': [],
};

// Unidades compatibles entre sí para conversiones cruzadas
const FAMILIAS_UNIDAD = {
    peso:   ['kg', 'g'],
    volumen: ['l', 'ml', 'gal'],
};

function obtenerUnidadesCompatibles(unidadNativa, contenidoUnidad) {
    // Todas las unidades que el usuario puede elegir en la receta
    const opciones = new Set([unidadNativa]);

    // Equivalencias directas de la unidad nativa
    (EQUIVALENCIAS_UNIDAD[unidadNativa] || []).forEach(eq => opciones.add(eq.unidad));

    // Si el insumo tiene conversión de presentación (latas→kg, bolsas→ml etc.)
    if (contenidoUnidad) {
        opciones.add(contenidoUnidad);
        // Y también las equivalencias de esa unidad de contenido (si es kg, agregar g; si es l, agregar ml)
        (EQUIVALENCIAS_UNIDAD[contenidoUnidad] || []).forEach(eq => opciones.add(eq.unidad));
    }

    return [...opciones];
}

function actualizarUnidadReceta(selectIngrediente, unidadGuardada = null) {
    const linea = selectIngrediente.closest('.receta-linea');
    const selUnidad = linea.querySelector('.sel-unidad-receta');
    const val = selectIngrediente.value;

    if (!val || val.startsWith('preparacion_')) {
        selUnidad.innerHTML = '<option value="">—</option>';
        selUnidad.style.display = 'none';
        return;
    }

    const insumoId = parseInt(val.replace('insumo_', ''));
    const insumo = insumosCache.find(i => i.id === insumoId);
    if (!insumo) { selUnidad.innerHTML = '<option value="">—</option>'; return; }

    selUnidad.style.display = 'inline-block';

    const unidadesDisponibles = obtenerUnidadesCompatibles(insumo.unidad, insumo.contenido_unidad);

    // Etiquetas amigables para cada unidad
    const etiquetas = {
        'kg': 'kg', 'g': 'g', 'l': 'l', 'ml': 'ml', 'gal': 'gal',
        'latas': 'latas', 'bolsas': 'bolsas', 'pzas': 'pzas', 'porciones': 'porciones'
    };

    selUnidad.innerHTML = unidadesDisponibles.map(u => {
        let label = etiquetas[u] || u;
        // Si es la unidad de contenido, mostrar la conversión como referencia
        if (u === insumo.contenido_unidad && insumo.contenido_cantidad && u !== insumo.unidad) {
            label += ` (1 ${insumo.unidad} = ${insumo.contenido_cantidad}${u})`;
        }
        const selected = (unidadGuardada === u) || (!unidadGuardada && u === insumo.unidad) ? 'selected' : '';
        return `<option value="${u}" ${selected}>${label}</option>`;
    }).join('');
}

async function guardarReceta() {
    const items = [];
   document.querySelectorAll('#receta-items-lista .receta-linea').forEach(linea => {
        const sel = linea.querySelector('.sel-ingrediente');
        const inp = linea.querySelector('input[type="number"]');
        const selUnidad = linea.querySelector('.sel-unidad-receta');
        if (sel && sel.value && inp && inp.value) {
            const [tipo, idStr] = sel.value.split('_');
            const unidad_receta = (selUnidad && selUnidad.value && selUnidad.value !== '—')
                ? selUnidad.value
                : null;
            items.push({ tipo, referencia_id: parseInt(idStr), cantidad: parseFloat(inp.value), unidad_receta });
        }
    });
    try {
        if (modoConectado && apiClient && tokenActual) {
            try {
                const itemsAPI = items.map(i => ({ item_type: i.tipo, item_id: i.referencia_id, quantity: i.cantidad }));
                await apiClient.request(`/inventory/products/${productoRecetaActual}/recipe`, { method: 'POST', body: { items: itemsAPI } });
            } catch (e) { console.warn('No se pudo guardar receta en backend:', e.message); }
        }
        await window.api.guardarRecetaProducto(productoRecetaActual, items);
        cerrarModalReceta();
        renderizarTablaRecetas();
        mostrarNotificacionExito('Receta guardada', '¡Guardado!');
    } catch (e) { alert('Error al guardar la receta'); }
}

function guardarAjusteDirecto(clave, valor) {
    window.api.guardarAjuste(clave, String(valor));
}

// ============================================
// INVENTARIO — ENTRADAS DE INSUMOS
// ============================================

async function cargarTablaEntradas() {
    const tbody = document.getElementById('tabla-entradas');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding:20px; color:#9ca3af;">Cargando...</td></tr>';
    try {
        const entradas = await window.api.obtenerEntradasInsumo(null);
        if (!entradas.length) {
            tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding:30px; color:#9ca3af;">Aún no hay entradas registradas. Usa "+ Registrar Entrada" para iniciar el historial.</td></tr>';
            return;
        }
        tbody.innerHTML = entradas.map(e => {
            const fecha = new Date(e.fecha.replace(' ', 'T')).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' });
            return `<tr>
                <td><strong>${e.insumo_nombre}</strong></td>
                <td><span style="color:#10b981; font-weight:600;">+${e.cantidad} ${e.unidad}</span></td>
                <td style="color:#6b7280;">${e.notas || '—'}</td>
                <td style="color:#9ca3af; font-size:0.9em;">${fecha}</td>
            </tr>`;
        }).join('');
    } catch(e) { console.error(e); }
}

function abrirModalEntrada() {
    const select = document.getElementById('entrada-insumo-id');
    select.innerHTML = insumosCache.map(i => `<option value="${i.id}">${i.nombre} (${i.unidad}) — Stock actual: ${i.stock_actual}</option>`).join('');
    document.getElementById('entrada-cantidad').value = '';
    document.getElementById('entrada-notas').value = '';
    document.getElementById('modal-entrada').classList.remove('hidden');
}

function cerrarModalEntrada() {
    document.getElementById('modal-entrada').classList.add('hidden');
}

async function guardarEntrada() {
    const insumo_id = parseInt(document.getElementById('entrada-insumo-id').value);
    const cantidad = parseFloat(document.getElementById('entrada-cantidad').value);
    const notas = document.getElementById('entrada-notas').value.trim();
    if (!insumo_id || !cantidad || cantidad <= 0) { alert('Selecciona un insumo y escribe una cantidad válida.'); return; }
    try {
        await window.api.registrarEntradaInsumo({ insumo_id, cantidad, notas });
        cerrarModalEntrada();
        insumosCache = await window.api.obtenerInsumos();
        renderizarTablaInsumos();
        renderizarTablaPreparaciones();
        cargarTablaEntradas();
        mostrarNotificacionExito(`+${cantidad} registrado correctamente`, '¡Entrada Registrada!');
    } catch(e) { alert('Error al registrar la entrada'); }
}

// ============================================
// INVENTARIO — SALIDAS DE INSUMOS
// ============================================

async function cargarTablaSalidas() {
    const tbody = document.getElementById('tabla-salidas');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:20px; color:#9ca3af;">Cargando...</td></tr>';
    try {
        const salidas = await window.api.obtenerSalidasInsumo(null);
        if (!salidas.length) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:30px; color:#9ca3af;">Sin salidas registradas.</td></tr>';
            return;
        }
        const motivos = { merma:'Merma', caducidad:'Caducidad', accidente:'Accidente', robo:'Pérdida/Robo', ajuste:'Ajuste', otro:'Otro' };
        tbody.innerHTML = salidas.map(s => {
            const fecha = new Date(s.fecha.replace(' ','T')).toLocaleString('es-MX', { dateStyle:'short', timeStyle:'short' });
            return `<tr>
                <td><strong>${s.insumo_nombre}</strong></td>
                <td><span style="color:#ef4444; font-weight:600;">−${s.cantidad} ${s.unidad}</span></td>
                <td><span class="badge-info">${motivos[s.motivo] || s.motivo}</span></td>
                <td style="color:#6b7280;">${s.notas || '—'}</td>
                <td style="color:#9ca3af; font-size:0.9em;">${fecha}</td>
            </tr>`;
        }).join('');
    } catch(e) { console.error(e); }
}

function abrirModalSalida() {
    const select = document.getElementById('salida-insumo-id');
    select.innerHTML = insumosCache.map(i =>
        `<option value="${i.id}">${i.nombre} (${i.unidad}) — Stock: ${i.stock_actual}</option>`
    ).join('');
    document.getElementById('salida-cantidad').value = '';
    document.getElementById('salida-notas').value = '';
    document.getElementById('modal-salida').classList.remove('hidden');
}

function cerrarModalSalida() {
    document.getElementById('modal-salida').classList.add('hidden');
}

async function guardarSalida() {
    const insumo_id = parseInt(document.getElementById('salida-insumo-id').value);
    const cantidad = parseFloat(document.getElementById('salida-cantidad').value);
    const motivo = document.getElementById('salida-motivo').value;
    const notas = document.getElementById('salida-notas').value.trim();
    if (!insumo_id || !cantidad || cantidad <= 0) { alert('Selecciona un insumo y escribe una cantidad válida.'); return; }
    try {
        await window.api.registrarSalidaInsumo({ insumo_id, cantidad, motivo, notas });
        cerrarModalSalida();
        insumosCache = await window.api.obtenerInsumos();
        renderizarTablaInsumos();
        renderizarTablaPreparaciones();
        cargarTablaSalidas();
        mostrarNotificacionExito(`−${cantidad} registrado`, '¡Salida Registrada!');
    } catch(e) { alert('Error al registrar la salida'); }
}

// ============================================
// MÓDULO DE OFERTAS
// ============================================

let descuentosCache = [];
let combosCache = [];
let descuentoEditandoId = null;
let comboEditandoId = null;

async function cargarOfertas() {
    try {
        descuentosCache = await window.api.obtenerDescuentos();
        combosCache = await window.api.obtenerCombos();
        // También recargar productos para el selector de combos
        if (!productosGlobales.length) {
            const agrupados = await obtenerProductosAgrupadosWrapper();
            productosGlobales = [];
            agrupados.forEach(cat => cat.productos.forEach(p => productosGlobales.push({...p, categoria: cat.nombre})));
        }
        renderizarTablaDescuentos();
        renderizarTablaCombos();
    } catch(e) { console.error('Error al cargar ofertas:', e); }
}

function cambiarTabOfertas(tab, btn) {
    document.querySelectorAll('.inv-tabs .inv-tab').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('oferta-panel-descuentos').style.display = tab === 'descuentos' ? 'block' : 'none';
    document.getElementById('oferta-panel-combos').style.display = tab === 'combos' ? 'block' : 'none';
}

// --- DESCUENTOS ---
function renderizarTablaDescuentos() {
    const tbody = document.getElementById('tabla-descuentos');
    if (!descuentosCache.length) {
        tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; padding:30px; color:#9ca3af;">
            Sin descuentos. Crea uno con el botón de arriba — aparecerán en el modal de cobro de Nueva Venta.
        </td></tr>`;
        return;
    }
    tbody.innerHTML = descuentosCache.map(d => `<tr>
        <td><strong>${d.nombre}</strong></td>
        <td><span class="badge-info">${d.tipo === 'porcentaje' ? 'Porcentaje' : 'Monto fijo'}</span></td>
        <td style="font-weight:600; color:#2563eb;">${d.tipo === 'porcentaje' ? d.valor + '%' : '$' + parseFloat(d.valor).toFixed(2)}</td>
        <td>
            <div style="display:flex; gap:6px;">
                <button class="btn-secondary small" onclick="editarDescuento(${d.id})" style="display:inline-flex;align-items:center;gap:4px;">
                    <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/><path d="m15 5 4 4"/></svg>
                    Editar
                </button>
                <button class="btn-secondary small" onclick="confirmarEliminarDescuento(${d.id}, '${d.nombre}')" style="color:#ef4444; display:inline-flex;align-items:center;gap:4px;">
                    <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 11v6"/><path d="M14 11v6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                </button>
            </div>
        </td>
    </tr>`).join('');
}

function abrirModalNuevoDescuento(d = null) {
    descuentoEditandoId = d ? d.id : null;
    document.getElementById('modal-desc-titulo').innerText = d ? 'Editar Descuento' : 'Nuevo Descuento';
    document.getElementById('ndesc-nombre').value = d ? d.nombre : '';
    document.getElementById('ndesc-tipo').value = d ? d.tipo : 'porcentaje';
    document.getElementById('ndesc-valor').value = d ? d.valor : '';
    actualizarLabelDescuento();
    document.getElementById('modal-nuevo-descuento').classList.remove('hidden');
}

function cerrarModalNuevoDescuento() {
    document.getElementById('modal-nuevo-descuento').classList.add('hidden');
    descuentoEditandoId = null;
}

function actualizarLabelDescuento() {
    const tipo = document.getElementById('ndesc-tipo').value;
    document.getElementById('ndesc-valor-label').innerText = tipo === 'porcentaje' ? 'Valor (%)' : 'Valor ($)';
}

async function guardarDescuento() {
    const nombre = document.getElementById('ndesc-nombre').value.trim();
    const tipo = document.getElementById('ndesc-tipo').value;
    const valor = parseFloat(document.getElementById('ndesc-valor').value);
    if (!nombre || isNaN(valor) || valor <= 0) { alert('Completa todos los campos correctamente.'); return; }
    try {
        const datos = { nombre, tipo, valor };
        if (modoConectado && apiClient && tokenActual) {
            const tipoBackend = tipo === 'porcentaje' ? 'percentage' : 'fixed';
            if (descuentoEditandoId) {
                await apiClient.request(`/offers/discounts/${descuentoEditandoId}`, { method: 'PUT', body: { name: nombre, type: tipoBackend, value: valor, applies_to: 'all' } });
                await window.api.actualizarDescuento(descuentoEditandoId, datos);
            } else {
                const creado = await apiClient.request('/offers/discounts', { method: 'POST', body: { name: nombre, type: tipoBackend, value: valor, applies_to: 'all' } });
                await window.api.agregarDescuentoConId(creado.id, datos);
            }
        } else {
            if (descuentoEditandoId) {
                await window.api.actualizarDescuento(descuentoEditandoId, datos);
            } else {
                await window.api.agregarDescuento(datos);
            }
        }
        cerrarModalNuevoDescuento();
        descuentosCache = await window.api.obtenerDescuentos();
        renderizarTablaDescuentos();
        mostrarNotificacionExito('Descuento guardado', '¡Guardado!');
    } catch(e) { console.error(e); alert('Error al guardar el descuento'); }
}

function editarDescuento(id) {
    const d = descuentosCache.find(x => x.id === id);
    if (d) abrirModalNuevoDescuento(d);
}

async function confirmarEliminarDescuento(id, nombre) {
    if (confirm(`¿Eliminar el descuento "${nombre}"?`)) {
        if (modoConectado && apiClient && tokenActual) {
            try { await apiClient.request(`/offers/discounts/${id}`, { method: 'DELETE' }); } catch(e) { console.warn('Error al eliminar descuento en backend:', e.message); }
        }
        await window.api.eliminarDescuento(id);
        descuentosCache = await window.api.obtenerDescuentos();
        renderizarTablaDescuentos();
        mostrarNotificacionExito('Descuento eliminado', '¡Eliminado!');
    }
}

// --- COMBOS ---
function renderizarTablaCombos() {
    const tbody = document.getElementById('tabla-combos');
    if (!combosCache.length) {
        tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:30px; color:#9ca3af;">
            Sin combos. Crea uno agrupando productos con un precio especial.
        </td></tr>`;
        return;
    }
    tbody.innerHTML = combosCache.map(c => `<tr>
        <td><strong>${c.nombre}</strong></td>
        <td style="color:#6b7280;">${c.descripcion || '—'}</td>
        <td style="font-weight:700; color:#10b981;">$${parseFloat(c.precio_especial).toFixed(2)}</td>
        <td><span id="combo-count-${c.id}" class="badge-info">...</span></td>
        <td>
            <div style="display:flex; gap:6px;">
                <button class="btn-secondary small" onclick="editarCombo(${c.id})" style="display:inline-flex;align-items:center;gap:4px;">
                    <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/><path d="m15 5 4 4"/></svg>
                    Editar
                </button>
                <button class="btn-secondary small" onclick="confirmarEliminarCombo(${c.id}, '${c.nombre}')" style="color:#ef4444; display:inline-flex;align-items:center;gap:4px;">
                    <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 11v6"/><path d="M14 11v6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                </button>
            </div>
        </td>
    </tr>`).join('');

    combosCache.forEach(c => {
        window.api.obtenerItemsCombo(c.id).then(items => {
            const el = document.getElementById(`combo-count-${c.id}`);
            if (el) el.innerText = `${items.length} producto${items.length !== 1 ? 's' : ''}`;
        });
    });
}

function abrirModalNuevoCombo(combo = null) {
    comboEditandoId = combo ? combo.id : null;
    document.getElementById('modal-combo-titulo').innerText = combo ? 'Editar Combo' : 'Nuevo Combo';
    document.getElementById('ncombo-nombre').value = combo ? combo.nombre : '';
    document.getElementById('ncombo-precio').value = combo ? combo.precio_especial : '';
    document.getElementById('ncombo-descripcion').value = combo ? combo.descripcion || '' : '';
    document.getElementById('combo-items-lista').innerHTML = '';
    document.getElementById('combo-precio-ref').innerText = '';

    if (combo) {
        window.api.obtenerItemsCombo(combo.id).then(items => {
            items.forEach(item => agregarLineaCombo(item));
            calcularPrecioReferenciaCombo();
        });
    } else {
        agregarLineaCombo();
    }
    document.getElementById('modal-nuevo-combo').classList.remove('hidden');
}

function cerrarModalNuevoCombo() {
    document.getElementById('modal-nuevo-combo').classList.add('hidden');
    comboEditandoId = null;
}

function agregarLineaCombo(itemExistente = null) {
    const lista = document.getElementById('combo-items-lista');
    const div = document.createElement('div');
    div.className = 'receta-linea';
    const opciones = productosGlobales.map(p =>
        `<option value="${p.id}" data-precio="${p.precio}" ${itemExistente && itemExistente.producto_id === p.id ? 'selected' : ''}>${p.emoji || '📦'} ${p.nombre} — $${p.precio.toFixed(2)}</option>`
    ).join('');
    div.innerHTML = `
        <select style="flex:3;" onchange="calcularPrecioReferenciaCombo()">
            ${opciones || '<option>Sin productos</option>'}
        </select>
        <input type="number" placeholder="Cant." min="1" step="1" value="${itemExistente ? itemExistente.cantidad : 1}" style="flex:0.6;" oninput="calcularPrecioReferenciaCombo()">
        <button class="btn-quitar" onclick="this.parentElement.remove(); calcularPrecioReferenciaCombo();" title="Quitar">
            <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 11v6"/><path d="M14 11v6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
        </button>
    `;
    lista.appendChild(div);
}

function calcularPrecioReferenciaCombo() {
    let total = 0;
    document.querySelectorAll('#combo-items-lista .receta-linea').forEach(linea => {
        const sel = linea.querySelector('select');
        const inp = linea.querySelector('input');
        const precio = parseFloat(sel.selectedOptions[0]?.dataset.precio) || 0;
        const cant = parseInt(inp?.value) || 1;
        total += precio * cant;
    });
    const ref = document.getElementById('combo-precio-ref');
    if (ref) ref.innerHTML = total > 0
        ? `Precio normal: <strong>$${total.toFixed(2)}</strong> — El combo debería costar menos que esto`
        : '';
}

async function guardarCombo() {
    const nombre = document.getElementById('ncombo-nombre').value.trim();
    const precio_especial = parseFloat(document.getElementById('ncombo-precio').value);
    const descripcion = document.getElementById('ncombo-descripcion').value.trim();
    if (!nombre || isNaN(precio_especial) || precio_especial <= 0) {
        alert('El nombre y el precio especial son obligatorios.');
        return;
    }
    const items = [];
    document.querySelectorAll('#combo-items-lista .receta-linea').forEach(linea => {
        const sel = linea.querySelector('select');
        const inp = linea.querySelector('input');
        if (sel?.value && inp?.value) {
            items.push({ producto_id: parseInt(sel.value), cantidad: parseInt(inp.value) || 1 });
        }
    });
    if (items.length === 0) { alert('Agrega al menos un producto al combo.'); return; }
    try {
        const datos = { nombre, descripcion, precio_especial };
        const itemsBackend = items.map(i => ({ product_id: i.producto_id, quantity: i.cantidad }));
        if (modoConectado && apiClient && tokenActual) {
            if (comboEditandoId) {
                await apiClient.request(`/offers/combos/${comboEditandoId}`, { method: 'PUT', body: { name: nombre, description: descripcion, price: precio_especial } });
                await apiClient.request(`/offers/combos/${comboEditandoId}/items`, { method: 'POST', body: { items: itemsBackend } });
                await window.api.actualizarCombo(comboEditandoId, datos);
                await window.api.guardarItemsCombo(comboEditandoId, items);
            } else {
                const creado = await apiClient.request('/offers/combos', { method: 'POST', body: { name: nombre, description: descripcion, price: precio_especial } });
                await apiClient.request(`/offers/combos/${creado.id}/items`, { method: 'POST', body: { items: itemsBackend } });
                await window.api.agregarComboConId(creado.id, datos);
                await window.api.guardarItemsCombo(creado.id, items);
            }
        } else {
            if (comboEditandoId) {
                await window.api.actualizarCombo(comboEditandoId, datos);
                await window.api.guardarItemsCombo(comboEditandoId, items);
            } else {
                const nuevoId = await window.api.agregarCombo(datos);
                await window.api.guardarItemsCombo(nuevoId, items);
            }
        }
        cerrarModalNuevoCombo();
        combosCache = await window.api.obtenerCombos();
        renderizarTablaCombos();
        mostrarNotificacionExito('Combo guardado correctamente', '¡Combo Guardado!');
    } catch(e) { console.error(e); alert('Error al guardar el combo'); }
}

async function editarCombo(id) {
    const combo = combosCache.find(c => c.id === id);
    if (combo) abrirModalNuevoCombo(combo);
}

async function confirmarEliminarCombo(id, nombre) {
    if (confirm(`¿Eliminar el combo "${nombre}"?`)) {
        if (modoConectado && apiClient && tokenActual) {
            try { await apiClient.request(`/offers/combos/${id}`, { method: 'DELETE' }); } catch(e) { console.warn('Error al eliminar combo en backend:', e.message); }
        }
        await window.api.eliminarCombo(id);
        combosCache = await window.api.obtenerCombos();
        renderizarTablaCombos();
        mostrarNotificacionExito('Combo eliminado', '¡Eliminado!');
    }
}

// ============================================
// BACKUPS
// ============================================
async function crearRespaldoAhora() {
    const btn = event.currentTarget;
    const textoOriginal = btn.innerText;
    btn.disabled = true;
    btn.innerText = 'Creando respaldo...';
    try {
        const resultado = await window.api.crearBackupManual();
        if (resultado.ok) {
            const nombre = resultado.ultimo || 'backup creado';
            document.getElementById('last-backup').innerText = nombre.replace('backup-', '').replace('.db', '').replace(/T/, ' ').replace(/-/g, ':').substring(0, 19);
            mostrarNotificacionExito(`Respaldo guardado (${resultado.total} en total)`, '¡Respaldo Creado!');
        } else {
            alert('Error al crear el respaldo: ' + resultado.error);
        }
    } catch(e) {
        alert('No se pudo crear el respaldo');
    } finally {
        btn.disabled = false;
        btn.innerText = textoOriginal;
    }
}

async function abrirCarpetaBackups() {
    await window.api.abrirCarpetaBackups();
}

// ============================================
// SINCRONIZACIÓN LOCAL → NUBE
// ============================================
async function syncLocalToCloud() {
    const resultadoDiv = document.getElementById('resultado-conexion');
    const msg = (texto) => { if (resultadoDiv) resultadoDiv.innerHTML = texto; };

    try {
        // 1. CATEGORÍAS — emparejar por nombre
        msg('⏳ Sincronizando categorías...');
        const localCats = await window.api.obtenerClasificacionesRaw();
        const cloudCats = await apiClient.getCategories();
        const catIdMap = {}; // local_id → cloud_id

        for (const cat of localCats) {
            const match = cloudCats.find(c =>
                c.name.toLowerCase().trim() === cat.nombre.toLowerCase().trim()
            );
            if (match) {
                catIdMap[cat.id] = match.id;
            } else {
                try {
                    const created = await apiClient.createCategory({ name: cat.nombre, emoji: cat.emoji });
                    catIdMap[cat.id] = created.id;
                } catch(e) { console.warn('Sync cat skip:', cat.nombre, e.message); }
            }
        }

        // 2. PRODUCTOS — emparejar por nombre
        msg('⏳ Sincronizando productos...');
        const localCatsConProds = await window.api.obtenerProductosAgrupados();
        const localProds = localCatsConProds.flatMap(cat => cat.productos || []);
        const cloudProds = await apiClient.getProducts();
        const prodIdMap = {}; // local_id → cloud_id

        for (const prod of localProds) {
            if (!prod.nombre || !prod.precio) continue;
            const match = cloudProds.find(p =>
                p.name.toLowerCase().trim() === prod.nombre.toLowerCase().trim()
            );
            if (match) {
                prodIdMap[prod.id] = match.id;
            } else {
                try {
                    const created = await apiClient.createProduct({
                        name: prod.nombre,
                        description: prod.descripcion || '',
                        price: prod.precio,
                        stock: prod.stock || 0,
                        category_id: prod.clasificacion_id ? (catIdMap[prod.clasificacion_id] || null) : null,
                        emoji: prod.emoji || '📦'
                    });
                    prodIdMap[prod.id] = created.id;
                } catch(e) { console.warn('Sync prod skip:', prod.nombre, e.message); }
            }
        }

        // 3. CLIENTES — emparejar por teléfono
        msg('⏳ Sincronizando clientes...');
        const localClientes = await window.api.obtenerClientes();
        const cloudClientes = await apiClient.getCustomers();

        for (const cust of localClientes) {
            if (!cust.telefono || !cust.nombre) continue;
            const match = cloudClientes.find(c => c.phone === cust.telefono);
            if (!match) {
                try {
                    await apiClient.createCustomer({
                        phone: cust.telefono,
                        name: cust.nombre,
                        address: cust.direccion || '',
                        notes: cust.notas || ''
                    });
                } catch(e) { console.warn('Sync cliente skip:', cust.telefono, e.message); }
            }
        }

        console.log(`✅ Sync completado: ${Object.keys(catIdMap).length} categorías, ${Object.keys(prodIdMap).length} productos, ${localClientes.length} clientes procesados`);

    } catch (error) {
        console.error('Error durante sincronización:', error);
        msg('⚠️ Sincronización parcial. Algunos datos podrían no haberse subido.');
        await new Promise(r => setTimeout(r, 1500));
    }
}

// ============================================
// SINCRONIZACIÓN BACKEND → LOCAL
// ============================================

async function sincronizarDesdeBackend() {
    if (!modoConectado || !apiClient || !tokenActual) return;
    if (modoSoloOnline) return; // En modo solo online no se descarga nada localmente
    console.log('🔄 Sincronizando datos del backend...');
    try {
        // 1. Categorías
        const cats = await apiClient.getCategories();
        await window.api.syncClasificaciones(cats);

        // 2. Productos (lista plana)
        const prods = await apiClient.getProducts();
        await window.api.syncProductos(prods);

        // 3. Clientes
        const clientes = await apiClient.getCustomers();
        await window.api.syncClientes(clientes);

        // 4-6. Inventario (solo Premium)
        if (puedeAccederPremium()) {
            await subirInventarioLocalAlBackend();
            const insumosBackend = await apiClient.request('/inventory/ingredients');
            if (insumosBackend && insumosBackend.length > 0) {
                await window.api.syncInsumos(insumosBackend);
                const preps = await apiClient.request('/inventory/preparations');
                await window.api.syncPreparaciones(preps);
                const recetas = await apiClient.request('/inventory/all-recipes');
                await window.api.syncRecetas(recetas);
            }
        }

        // 7-8. Ofertas (solo Premium)
        if (puedeAccederPremium()) {
            await subirOfertasLocalesAlBackend();
            const descuentos = await apiClient.request('/offers/discounts');
            await window.api.syncDescuentos(descuentos);
            const combos = await apiClient.request('/offers/combos');
            await window.api.syncCombos(combos);
        }

        // 9. Ajustes del negocio (PINs y permisos)
        try {
            const ajustesNegocio = await apiClient.request('/settings');
            if (ajustesNegocio.permisos_roles) {
                await window.api.guardarAjuste('permisos_roles', JSON.stringify(ajustesNegocio.permisos_roles));
            }
        } catch (e) {
            console.warn('No se pudieron sincronizar ajustes de negocio:', e.message);
        }

        // 10. Pedidos recientes (para consulta offline)
        try {
            const branchQuery = sucursalIdActual ? `&branch_id=${sucursalIdActual}` : '';
            const pedidosBackend = await apiClient.request(`/orders?limit=200&page=1${branchQuery}`);
            // Siempre sincronizar (incluso con 0 resultados limpia pedidos de otra sucursal)
            await window.api.syncPedidos((pedidosBackend && pedidosBackend.data) ? pedidosBackend.data : []);
        } catch (e) {
            console.warn('No se pudieron sincronizar pedidos:', e.message);
        }

        console.log('✅ Sincronización desde backend completada');
    } catch (error) {
        console.error('⚠️ Error en sincronización desde backend:', error);
    }
}

async function subirPedidosPendientes() {
    if (!modoConectado || !apiClient || !tokenActual) return;
    try {
        const pendientes = await window.api.obtenerPedidosPendientes();
        if (!pendientes || pendientes.length === 0) return;
        console.log(`📤 Subiendo ${pendientes.length} pedido(s) pendiente(s)...`);
        for (const pedido of pendientes) {
            try {
                const items = await window.api.obtenerItemsPedido(pedido.id);
                const datosAPI = {
                    customer_id: pedido.cliente_id || null,
                    customer_temp_info: pedido.info_cliente_temp || null,
                    total: pedido.total,
                    payment_method: pedido.metodo_pago,
                    order_type: (pedido.tipo_pedido === 'mesa' ? 'comer' : pedido.tipo_pedido) || 'comer',
                    reference: pedido.referencia || null,
                    delivery_address: pedido.direccion_domicilio || null,
                    maps_link: pedido.link_maps || null,
                    notes: pedido.notas_generales || null,
                    branch_id: sucursalIdActual || null
                };
                const itemsAPI = items.map(i => ({
                    product_id: i.producto_id,
                    quantity: i.cantidad,
                    unit_price: i.precio_unitario,
                    subtotal: i.subtotal,
                    notes: i.nota_item || ''
                }));
                await apiClient.createOrder(datosAPI, itemsAPI);
                await window.api.marcarPedidoSincronizado(pedido.id);
            } catch (e) {
                console.warn(`No se pudo subir pedido ${pedido.id}:`, e.message);
            }
        }
        console.log('✅ Pedidos pendientes sincronizados');
    } catch (error) {
        console.error('Error al subir pedidos pendientes:', error);
    }
}

async function subirInventarioLocalAlBackend() {
    if (!modoConectado || !apiClient || !tokenActual) return;
    try {
        // Verificar si el backend ya tiene inventario
        const insumosBackend = await apiClient.request('/inventory/ingredients');
        if (insumosBackend && insumosBackend.length > 0) return; // Ya tiene datos, no sobreescribir

        const insumosLocales = await window.api.obtenerInsumos();
        if (!insumosLocales || insumosLocales.length === 0) return;
        console.log(`📤 Subiendo ${insumosLocales.length} insumo(s) al backend...`);

        // Mapa: id local → id backend
        const mapaInsumos = {};
        for (const insumo of insumosLocales) {
            try {
                const creado = await apiClient.request('/inventory/ingredients', { method: 'POST', body: {
                    name: insumo.nombre, unit: insumo.unidad,
                    stock: insumo.stock_actual || 0, min_stock: insumo.stock_minimo || 0
                } });
                mapaInsumos[insumo.id] = creado.id;
            } catch (e) { console.warn(`No se pudo subir insumo ${insumo.nombre}:`, e.message); }
        }

        // Subir preparaciones
        const prepsLocales = await window.api.obtenerPreparaciones();
        const mapaPreps = {};
        for (const prep of (prepsLocales || [])) {
            try {
                const creado = await apiClient.request('/inventory/preparations', { method: 'POST', body: {
                    name: prep.nombre, unit: 'unidad', yield_quantity: 1, notes: prep.descripcion || ''
                } });
                mapaPreps[prep.id] = creado.id;
                // Subir items de esta preparación
                const items = await window.api.obtenerItemsPreparacion(prep.id);
                if (items && items.length > 0) {
                    const itemsMapeados = items
                        .filter(it => mapaInsumos[it.insumo_id])
                        .map(it => ({ ingredient_id: mapaInsumos[it.insumo_id], quantity: it.cantidad }));
                    if (itemsMapeados.length > 0) {
                        await apiClient.request(`/inventory/preparations/${creado.id}/recipe`, { method: 'POST', body: { items: itemsMapeados } });
                    }
                }
            } catch (e) { console.warn(`No se pudo subir preparación ${prep.nombre}:`, e.message); }
        }

        // Subir recetas de productos (receta_items)
        const productosLocales = await window.api.obtenerProductosAgrupados();
        const todosProductos = (productosLocales || []).flatMap(c => c.productos || []);
        for (const prod of todosProductos) {
            try {
                const receta = await window.api.obtenerRecetaProducto(prod.id);
                if (!receta || receta.length === 0) continue;
                const itemsMapeados = receta.map(it => {
                    const backendId = it.tipo === 'ingrediente' ? mapaInsumos[it.referencia_id] : mapaPreps[it.referencia_id];
                    if (!backendId) return null;
                    return { item_type: it.tipo === 'ingrediente' ? 'ingredient' : 'preparation', item_id: backendId, quantity: it.cantidad };
                }).filter(Boolean);
                if (itemsMapeados.length > 0) {
                    await apiClient.request(`/inventory/products/${prod.id}/recipe`, { method: 'POST', body: { items: itemsMapeados } });
                }
            } catch (e) { console.warn(`No se pudo subir receta del producto ${prod.id}:`, e.message); }
        }

        console.log('✅ Inventario local subido al backend');
        // Re-sincronizar para que los IDs locales queden iguales a los del backend
        const insumosNuevos = await apiClient.request('/inventory/ingredients');
        await window.api.syncInsumos(insumosNuevos);
        const prepsNuevos = await apiClient.request('/inventory/preparations');
        await window.api.syncPreparaciones(prepsNuevos);
        const recetasNuevas = await apiClient.request('/inventory/all-recipes');
        await window.api.syncRecetas(recetasNuevas);
    } catch (error) {
        console.error('Error al subir inventario al backend:', error);
    }
}

async function subirOfertasLocalesAlBackend() {
    if (!modoConectado || !apiClient || !tokenActual) return;
    try {
        // Descuentos
        const descBackend = await apiClient.request('/offers/discounts');
        if (!descBackend || descBackend.length === 0) {
            const descLocales = await window.api.obtenerDescuentos();
            for (const d of (descLocales || [])) {
                try {
                    const tipoBackend = d.tipo === 'porcentaje' ? 'percentage' : 'fixed';
                    const creado = await apiClient.request('/offers/discounts', { method: 'POST', body: { name: d.nombre, type: tipoBackend, value: d.valor, applies_to: 'all' } });
                    await window.api.agregarDescuentoConId(creado.id, d);
                    await window.api.eliminarDescuento(d.id);
                } catch (e) { console.warn(`No se pudo subir descuento ${d.nombre}:`, e.message); }
            }
        }

        // Combos
        const combosBackend = await apiClient.request('/offers/combos');
        if (!combosBackend || combosBackend.length === 0) {
            const combosLocales = await window.api.obtenerCombos();
            for (const c of (combosLocales || [])) {
                try {
                    const creado = await apiClient.request('/offers/combos', { method: 'POST', body: { name: c.nombre, description: c.descripcion || '', price: c.precio_especial } });
                    const items = await window.api.obtenerItemsCombo(c.id);
                    if (items && items.length > 0) {
                        const itemsBackend = items.map(i => ({ product_id: i.producto_id, quantity: i.cantidad }));
                        await apiClient.request(`/offers/combos/${creado.id}/items`, { method: 'POST', body: { items: itemsBackend } });
                    }
                    await window.api.agregarComboConId(creado.id, c);
                    await window.api.guardarItemsCombo(creado.id, items || []);
                    await window.api.eliminarCombo(c.id);
                } catch (e) { console.warn(`No se pudo subir combo ${c.nombre}:`, e.message); }
            }
        }
    } catch (error) {
        console.error('Error al subir ofertas al backend:', error);
    }
}

// ============================================
// PERFIL — SELECCIÓN AL INICIO
// ============================================

async function inicializarPerfil() {
    return new Promise(async (resolve) => {
        const screen = document.getElementById('perfil-screen');
        if (!screen) return resolve();

        // Leer permisos guardados para saber qué perfiles están activos
        let permisos = { cajero: { ...PERMISOS_DEFAULT.cajero }, encargado: { ...PERMISOS_DEFAULT.encargado } };
        try {
            const ajustes = await window.api.obtenerAjustes();
            const guardados = JSON.parse(ajustes.permisos_roles || '{}');
            if (guardados.cajero)    permisos.cajero    = { ...permisos.cajero,    ...guardados.cajero };
            if (guardados.encargado) permisos.encargado = { ...permisos.encargado, ...guardados.encargado };
        } catch(e) { /* usa defaults */ }

        const cajeroActivo    = permisos.cajero.enabled    === true;
        const encargadoActivo = permisos.encargado.enabled === true;

        // Si ningún perfil adicional está activo, saltar pantalla y entrar como Administrador
        if (!cajeroActivo && !encargadoActivo) {
            rolActivo = 'dueno';
            return resolve();
        }

        // Mostrar solo los botones de perfiles activos
        const btnCajero    = document.getElementById('perfil-btn-cajero');
        const btnEncargado = document.getElementById('perfil-btn-encargado');
        if (btnCajero)    btnCajero.style.display    = cajeroActivo    ? '' : 'none';
        if (btnEncargado) btnEncargado.style.display = encargadoActivo ? '' : 'none';

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
            permisos = JSON.parse(ajustes.permisos_roles || '{}');
        } catch(e) {}

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
        permisos = JSON.parse(ajustes.permisos_roles || '{}');
    } catch(e) {}

    const pinHash = await hashPin(pinIngresado);
    if (permisos[_perfilPendiente]?.pin === pinHash) {
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
    const cajeroEnabled    = document.getElementById('puesto-enabled-cajero')?.checked;
    const encargadoEnabled = document.getElementById('puesto-enabled-encargado')?.checked;
    const btnCambiar = document.getElementById('btn-cambiar-perfil');
    if (btnCambiar && (cajeroEnabled || encargadoEnabled)) {
        btnCambiar.style.display = 'flex';
    }
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

const fmt = (v) => '$' + parseFloat(v || 0).toFixed(2);

async function inicializarTurno() {
    turnoActivo = await window.api.obtenerTurnoActivo();
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
    let permisos = PERMISOS_DEFAULT[rolActivo] || {};
    try {
        const ajustes = await window.api.obtenerAjustes();
        const guardados = JSON.parse(ajustes.permisos_roles || '{}');
        if (guardados[rolActivo]) permisos = guardados[rolActivo];
    } catch(e) { /* usa defaults */ }

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
            const totales = await window.api.calcularTotalesTurno(turnoActivo.apertura);
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
        const turnos = await window.api.obtenerTurnos();
        if (!turnos.length) {
            tbody.innerHTML = '<tr><td colspan="10" style="text-align:center;color:var(--text-muted);">Sin turnos registrados</td></tr>';
            return;
        }
        tbody.innerHTML = turnos.map(t => `
            <tr>
                <td>#${t.id}</td>
                <td>${t.cajero_nombre}</td>
                <td>${t.rol.charAt(0).toUpperCase() + t.rol.slice(1)}</td>
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
    const turnos = await window.api.obtenerTurnos();
    const turno = turnos.find(t => t.id === id);
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
            const live = await window.api.calcularTotalesTurno(turno.apertura);
            if (live && live[0]) totales = live[0];
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
        html += `<p style="font-size:0.9em;color:#374151;background:#f9fafb;padding:8px;border-radius:6px;margin-top:4px;">${turno.notas}</p>`;
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
    ${fila('Cajero:', turno.cajero_nombre)}
    ${fila('Rol:', rolLabel[turno.rol] || turno.rol)}
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
    ${turno.notas ? `<div class="sep"></div><div class="titulo-sec">Notas</div><p style="font-size:11px;">${turno.notas}</p>` : ''}
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
        await window.api.abrirTurno(nombre, rolDeseado, fondo);
        turnoActivo = await window.api.obtenerTurnoActivo();

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
        const totales = await window.api.calcularTotalesTurno(turnoActivo.apertura);
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
        await window.api.cerrarTurno(turnoActivo.id, contado, notas);
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

// ============================================
// PERMISOS POR ROL (en Ajustes)
// ============================================

async function cargarPermisosAjustes() {
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
            // Usar config de la nube como fuente principal
            const cloudSettings = await apiClient.getSettings();
            guardados = cloudSettings.permisos_roles || {};
            // Mantener copia local sincronizada
            if (Object.keys(guardados).length > 0) {
                window.api.guardarAjuste('permisos_roles', JSON.stringify(guardados)).catch(() => {});
            }
        } else {
            const ajustes = await window.api.obtenerAjustes();
            guardados = JSON.parse(ajustes.permisos_roles || '{}');
        }
        if (guardados.cajero)    permisos.cajero    = { ...permisos.cajero,    ...guardados.cajero };
        if (guardados.encargado) permisos.encargado = { ...permisos.encargado, ...guardados.encargado };
    } catch(e) { /* usa defaults */ }

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

    const roles = [
        { key: 'cajero',    label: 'Cajero',    icon: '<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>' },
        { key: 'encargado', label: 'Encargado', icon: '<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/><line x1="12" x2="12" y1="12" y2="16"/><line x1="10" x2="14" y1="14" y2="14"/></svg>' }
    ];

    const container = document.getElementById('puestos-container');
    container.innerHTML = roles.map(r => {
        const activo = permisos[r.key].enabled === true;
        const funcs = secciones.map(s => `
            <div class="puesto-funcion-item">
                <span>${s.label}</span>
                <label class="switch switch-sm">
                    <input type="checkbox" data-rol="${r.key}" data-permiso="${s.clave}"
                        ${permisos[r.key][s.clave] !== false ? 'checked' : ''}
                        onchange="guardarPermisosRol()">
                    <span class="slider"></span>
                </label>
            </div>`).join('');

        const tienePin = permisos[r.key].pin_set === true;

        return `
        <div class="puesto-row" id="puesto-row-${r.key}">
            <div class="puesto-header">
                <div style="display:flex;align-items:center;gap:10px;">
                    <span style="display:flex;align-items:center;color:#374151;">${r.icon}</span>
                    <div>
                        <strong>${r.label}</strong>
                        <div id="puesto-estado-${r.key}" style="font-size:12px;color:var(--text-muted);">${activo ? 'Activo' : 'Desactivado'}</div>
                    </div>
                </div>
                <label class="switch">
                    <input type="checkbox" id="puesto-enabled-${r.key}" data-rol="${r.key}" data-permiso="enabled"
                        ${activo ? 'checked' : ''}
                        onchange="togglePuestoEnabled('${r.key}', this.checked)">
                    <span class="slider"></span>
                </label>
            </div>
            <div class="puesto-funciones" id="puesto-funciones-${r.key}" style="${activo ? '' : 'display:none;'}">
                <p style="font-size:12px;color:var(--text-muted);margin-bottom:10px;">Secciones visibles para este puesto:</p>
                ${funcs}
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
                        Quitar PIN de ${r.label}
                    </button>` : ''}
                </div>
            </div>
        </div>`;
    }).join('');

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

async function guardarPermisosRol() {
    // Cargar permisos existentes primero (para no perder PINs guardados)
    let permisos = {
        cajero:    { ...PERMISOS_DEFAULT.cajero },
        encargado: { ...PERMISOS_DEFAULT.encargado }
    };
    try {
        const ajustes = await window.api.obtenerAjustes();
        const guardados = JSON.parse(ajustes.permisos_roles || '{}');
        // Preservar PIN y pin_set de los datos guardados
        if (guardados.cajero)    permisos.cajero    = { ...permisos.cajero,    ...guardados.cajero };
        if (guardados.encargado) permisos.encargado = { ...permisos.encargado, ...guardados.encargado };
    } catch(e) {}

    // Leer estado actual de los checkboxes
    document.querySelectorAll('#puestos-container input[data-rol]').forEach(cb => {
        const rol     = cb.dataset.rol;
        const permiso = cb.dataset.permiso;
        if (permisos[rol]) permisos[rol][permiso] = cb.checked;
    });

    try {
        await window.api.guardarAjuste('permisos_roles', JSON.stringify(permisos));
        if (modoConectado && apiClient && tokenActual) {
            apiClient.saveSettings({ permisos_roles: permisos }).catch(() => {});
        }
        if (turnoActivo) aplicarPermisos();
    } catch(e) {
        mostrarNotificacionExito('Error guardando configuración', '⚠️ Error');
    }
}

async function guardarPinPerfil(rol) {
    const input = document.getElementById(`puesto-pin-${rol}`);
    const pin = input?.value?.trim();

    if (!pin || pin.length < 4) {
        mostrarNotificacionExito('El PIN debe tener al menos 4 dígitos', '⚠️ Error');
        return;
    }
    if (!/^\d+$/.test(pin)) {
        mostrarNotificacionExito('El PIN solo puede contener números', '⚠️ Error');
        return;
    }

    let permisos = { cajero: { ...PERMISOS_DEFAULT.cajero }, encargado: { ...PERMISOS_DEFAULT.encargado } };
    try {
        const ajustes = await window.api.obtenerAjustes();
        const guardados = JSON.parse(ajustes.permisos_roles || '{}');
        if (guardados.cajero)    permisos.cajero    = { ...permisos.cajero,    ...guardados.cajero };
        if (guardados.encargado) permisos.encargado = { ...permisos.encargado, ...guardados.encargado };
    } catch(e) {}

    permisos[rol].pin     = await hashPin(pin);
    permisos[rol].pin_set = true;

    try {
        await window.api.guardarAjuste('permisos_roles', JSON.stringify(permisos));
        if (modoConectado && apiClient && tokenActual) {
            apiClient.saveSettings({ permisos_roles: permisos }).catch(() => {});
        }
        mostrarNotificacionExito(`PIN de ${rol} configurado`, '¡Listo!');
        cargarPermisosAjustes();
    } catch(e) {
        mostrarNotificacionExito('Error guardando PIN', '⚠️ Error');
    }
}

async function quitarPinPerfil(rol) {
    let permisos = { cajero: { ...PERMISOS_DEFAULT.cajero }, encargado: { ...PERMISOS_DEFAULT.encargado } };
    try {
        const ajustes = await window.api.obtenerAjustes();
        const guardados = JSON.parse(ajustes.permisos_roles || '{}');
        if (guardados.cajero)    permisos.cajero    = { ...permisos.cajero,    ...guardados.cajero };
        if (guardados.encargado) permisos.encargado = { ...permisos.encargado, ...guardados.encargado };
    } catch(e) {}

    delete permisos[rol].pin;
    permisos[rol].pin_set = false;

    try {
        await window.api.guardarAjuste('permisos_roles', JSON.stringify(permisos));
        if (modoConectado && apiClient && tokenActual) {
            apiClient.saveSettings({ permisos_roles: permisos }).catch(() => {});
        }
        mostrarNotificacionExito(`PIN de ${rol} eliminado`, '¡Listo!');
        cargarPermisosAjustes();
    } catch(e) {
        mostrarNotificacionExito('Error guardando cambios', '⚠️ Error');
    }
}

// ============================================
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
// SISTEMA DE MESAS
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
        const comensales = ocupada && pedido.comensales ? `👥 ${pedido.comensales}` : `👥 ${m.capacidad}`;
        return `<div onclick="${ocupada ? `abrirPanelMesa(${m.id})` : `seleccionarMesaLibre(${m.id})`}"
            style="background:${bg};border:2px solid ${border};border-radius:10px;padding:14px;cursor:pointer;
                   display:flex;flex-direction:column;gap:6px;min-height:110px;position:relative;
                   transition:box-shadow 0.15s;" onmouseover="this.style.boxShadow='0 2px 8px rgba(0,0,0,0.12)'" onmouseout="this.style.boxShadow=''">
            <div style="display:flex;align-items:center;justify-content:space-between;">
                <span style="font-weight:700;font-size:1em;">${m.nombre}</span>
                <span style="width:10px;height:10px;border-radius:50%;background:${dot};display:inline-block;"></span>
            </div>
            <div style="font-size:0.78em;color:#6b7280;">${m.zona || 'General'} · ${comensales}</div>
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
            const order = await apiClient.openTableOrder(_mesaActivaId, comensales, notas || null);
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
        mostrarNotificacionExito('Error al abrir la mesa', '⚠️ Error');
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
    const comensales = pedido.comensales ? `👥 ${pedido.comensales} comensales · ` : '';
    document.getElementById('mesa-panel-info').textContent = `${comensales}Desde ${_tiempoEnMesa(pedido.fecha_pedido)}`;
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
                <div style="font-size:0.9em;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${it.nombre}</div>
                ${it.nota_item ? `<div style="font-size:0.75em;color:#6b7280;">${it.nota_item}</div>` : ''}
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
    </div>
    <div style="padding:8px 16px;">
        <button onclick="enviarMesaACocina()" style="width:100%;padding:10px;background:#f97316;color:#fff;border:none;border-radius:8px;font-weight:700;font-size:0.95em;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:6px;">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 13.87A4 4 0 0 1 7.41 6a5.11 5.11 0 0 1 1.05-1.54 5 5 0 0 1 7.08 0A5.11 5.11 0 0 1 16.59 6 4 4 0 0 1 18 13.87V21H6Z"/><line x1="6" x2="18" y1="17" y2="17"/></svg>
            Enviar a cocina
        </button>
    </div>`;
}

async function enviarMesaACocina() {
    if (!_pedidoMesaActivo) return;
    const items = _parsearItemsMesa(_pedidoMesaActivo.items_raw);
    if (items.length === 0) return;
    const mesa = _mesasData.find(m => m.id === _mesaActivaId);
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
                const comensales = _pedidoMesaActivo.comensales ? `👥 ${_pedidoMesaActivo.comensales} comensales · ` : '';
                info.textContent = `${comensales}Desde ${_tiempoEnMesa(_pedidoMesaActivo.fecha_pedido)}`;
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
    el.innerHTML = lista.map(p => {
        const en_carrito = _carritoMesa[p.id]?.cantidad || 0;
        return `<div style="border:2px solid ${en_carrito > 0 ? '#4f46e5' : '#e5e7eb'};border-radius:8px;padding:10px;cursor:pointer;text-align:center;background:${en_carrito > 0 ? '#f0f0ff' : '#fff'};"
            onclick="_toggleProductoMesa(${p.id}, '${(p.nombre||'').replace(/'/g,'&apos;')}', ${p.precio})">
            <div style="font-size:1.3em;">${p.emoji || '🍽️'}</div>
            <div style="font-size:0.8em;font-weight:500;margin:4px 0;line-height:1.2;">${p.nombre}</div>
            <div style="font-size:0.85em;color:#4f46e5;font-weight:600;">${_fmtMesa(p.precio)}</div>
            ${en_carrito > 0 ? `<div style="font-size:0.75em;color:#fff;background:#4f46e5;border-radius:10px;padding:1px 8px;margin-top:4px;">×${en_carrito}</div>` : ''}
        </div>`;
    }).join('');
}

function _toggleProductoMesa(id, nombre, precio) {
    if (!_carritoMesa[id]) _carritoMesa[id] = { nombre, precio, cantidad: 0 };
    _carritoMesa[id].cantidad++;
    _actualizarResumenCarritoMesa();
    filtrarProductosMesa(document.getElementById('mesa-prod-busqueda')?.value || '');
}

function _actualizarResumenCarritoMesa() {
    const el = document.getElementById('mesa-carrito-resumen');
    if (!el) return;
    const items = Object.values(_carritoMesa).filter(i => i.cantidad > 0);
    if (items.length === 0) { el.textContent = 'Ningún producto seleccionado'; return; }
    const total = items.reduce((s, i) => s + i.precio * i.cantidad, 0);
    el.innerHTML = items.map(i => `${i.cantidad}× ${i.nombre}`).join(', ') + ` — <b>${_fmtMesa(total)}</b>`;
}

async function confirmarAgregarProductosMesa() {
    if (!_pedidoMesaActivo) return;
    const items = Object.entries(_carritoMesa).filter(([,v]) => v.cantidad > 0);
    if (items.length === 0) { cerrarModalAgregarProductosMesa(); return; }
    try {
        if (modoConectado && apiClient && tokenActual) {
            const apiItems = items.map(([prod_id, item]) => ({
                product_id: parseInt(prod_id),
                quantity: item.cantidad,
            }));
            const updated = await apiClient.addItemsToOrder(_pedidoMesaActivo.id, apiItems);
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
    } catch(e) {
        console.error('Error agregando productos a mesa:', e);
        mostrarNotificacionExito('Error al agregar productos', '⚠️ Error');
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
        `<tr><td>${it.cantidad}× ${it.nombre}</td><td style="text-align:right">${_fmtMesa(it.subtotal)}</td></tr>`
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
        <h1>${negocio}</h1>
        <div class="linea"></div>
        <div class="centro"><b>CUENTA — ${mesa?.nombre || 'Mesa'}</b></div>
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
        mostrarNotificacionExito('Error al imprimir', '⚠️ Error');
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
                elPts.textContent = `⭐ Esta compra genera ${pts} puntos`;
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

        // Sumar puntos si hay cliente registrado en el pedido (solo modo local)
        if (!modoConectado && pedidoSnap.cliente_id) {
            const puntosGanados = await calcularPuntosGanados(totalSnap);
            if (puntosGanados > 0) {
                await window.api.actualizarPuntosCliente(pedidoSnap.cliente_id, puntosGanados).catch(() => {});
                syncLoyaltyBackend(pedidoSnap.cliente_id, { points_delta: puntosGanados });
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
        mostrarNotificacionExito('Error al cobrar la mesa', '⚠️ Error');
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
        `<tr><td>${it.cantidad}× ${it.nombre}${it.nota_item ? ` <span style="color:#888">(${it.nota_item})</span>` : ''}</td><td style="text-align:right">${_fmtMesa(it.subtotal)}</td></tr>`
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
        <h1>${negocio}</h1>
        <div class="linea"></div>
        <div class="centro"><b>TICKET DE VENTA</b></div>
        ${pedido.notas_generales ? `<div class="centro" style="font-size:11px;color:#666;">${pedido.notas_generales}</div>` : ''}
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
                <b>${m.nombre}</b> <span style="color:#6b7280;font-size:0.85em;">${m.zona || 'General'} · 👥 ${m.capacidad}</span>
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
        mostrarNotificacionExito('Error al transferir', '⚠️ Error');
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
                <span style="font-weight:600;">${m.nombre}</span>
                <span style="color:#6b7280;font-size:0.85em;margin-left:8px;">${m.zona || 'General'} · 👥 ${m.capacidad}</span>
            </div>
            <button class="btn-secondary" style="padding:4px 10px;font-size:0.8em;"
                onclick="_eliminarMesaConfig(${m.id}, '${(m.nombre||'').replace(/'/g,'&apos;')}')">Eliminar</button>
        </div>
    `).join('');
}

async function crearMesaConfig() {
    const nombre = document.getElementById('config-mesa-nombre').value.trim();
    const zona   = document.getElementById('config-mesa-zona').value.trim() || 'General';
    const cap    = parseInt(document.getElementById('config-mesa-capacidad').value) || 4;
    if (!nombre) { mostrarNotificacionExito('Escribe un nombre para la mesa', '⚠️ Error'); return; }
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
        mostrarNotificacionExito('Error al crear la mesa', '⚠️ Error');
    }
}

async function _eliminarMesaConfig(id, nombre) {
    if (!confirm(`¿Eliminar la mesa "${nombre}"?`)) return;
    try {
        if (modoConectado && apiClient && tokenActual) {
            await apiClient.deleteTable(id);
        } else {
            await window.api.eliminarMesa(id);
        }
        await _cargarConfigMesas();
        mostrarNotificacionExito(`Mesa eliminada`, '¡Listo!');
    } catch(e) {
        mostrarNotificacionExito('Error al eliminar la mesa', '⚠️ Error');
    }
}

async function abrirTurnoDesdeVenta() {
    const nombre = document.getElementById('tv-nombre')?.value?.trim();
    const fondo  = parseFloat(document.getElementById('tv-fondo')?.value) || 0;

    if (!nombre) {
        mostrarNotificacionExito('Ingresa tu nombre para abrir el turno', '⚠️ Error');
        return;
    }

    try {
        nombreActivo = nombre;
        await window.api.abrirTurno(nombre, rolActivo || 'cajero', fondo);
        turnoActivo = await window.api.obtenerTurnoActivo();
        actualizarIndicadorTurnoSidebar();
        document.getElementById('modal-turno-venta').classList.add('hidden');
        mostrarNotificacionExito(`Turno abierto — ${nombre}`, '¡Turno Abierto!');
    } catch(e) {
        mostrarNotificacionExito('Error al abrir turno', '⚠️ Error');
        console.error(e);
    }
}
