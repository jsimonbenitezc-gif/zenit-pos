// ============================================
// MÓDULO: Plan de Suscripción + Fidelidad
// ============================================

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
        alertaZenit('Conéctate a tu cuenta Zenit primero.');
        return;
    }
    const btn = document.getElementById('btn-iniciar-trial');
    if (btn) { btn.disabled = true; btn.textContent = 'Activando...'; }
    try {
        await apiClient.request('/billing/start-trial', { method: 'POST' });
        await cargarPlanInfo();
        mostrarNotificacionExito('Prueba de 30 días activada', '¡Disfruta Premium!');
    } catch (e) {
        alertaZenit(e.message || 'No se pudo activar la prueba. Intenta de nuevo.');
    } finally {
        if (btn) { btn.disabled = false; btn.textContent = 'Iniciar prueba gratuita (30 días)'; }
    }
}

let _planPollingInterval = null;

async function abrirCheckoutStripe() {
    if (!modoConectado || !apiClient) {
        alertaZenit('Conéctate a tu cuenta Zenit primero.');
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
        alertaZenit(e.message || 'No se pudo iniciar el proceso de pago. Intenta de nuevo.');
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
        alertaZenit(e.message || 'No se pudo abrir el portal de facturación.');
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
    // La función se llama `cambiarVista` (render.js). `mostrarVista` no existe:
    // el enlace "ir a planes" desde el bloqueo premium reventaba con ReferenceError.
    cambiarVista('ajustes');
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
        descuentoPuntosVenta = 0;
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
        // El canje va en su propia variable (NO en descuentoActual): el backend trata
        // el descuento de empleado y el canje de puntos como cosas distintas — el
        // primero exige autorización, el segundo no. Se topa a lo que queda por pagar.
        descuentoPuntosVenta = Math.min(descMax, Math.max(0, subtotal - descuentoActual));
        if (btn) {
            btn.style.background = '#7c3aed';
            btn.style.color = 'white';
            btn.style.borderColor = '#6d28d9';
            btn.innerHTML = '<span>✓ Descuento de puntos activo</span><span style="font-size:1.15em;line-height:1;">●</span>';
        }
    } else {
        // Desactivar: solo se quita el canje de puntos, NO un descuento de
        // promoción que el cajero haya aplicado aparte.
        puntosUsadosVenta = 0;
        descuentoPuntosVenta = 0;
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
                <td style="color:#6b7280;">${svgIconHTML('smartphone', 14, '#6b7280')} ${esc(c.telefono)}</td>
                <td style="color:#7c3aed;font-weight:600;">${svgIconHTML('star', 14, '#7c3aed')} ${c.puntos || 0} pts</td>
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
        mostrarNotificacionExito(`${nombre} inscrito al programa de fidelidad`, 'Fidelidad');
    }
    // Limpiar búsqueda y recargar lista
    const inputBuscar = document.getElementById('buscar-inscribir-fidelidad');
    if (inputBuscar) inputBuscar.value = '';
    document.getElementById('resultados-inscribir-fidelidad').innerHTML = '';
    cargarProgramaFidelidad();
}
