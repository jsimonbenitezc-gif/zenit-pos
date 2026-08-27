// ============================================
// MÓDULO: Propinas (BLOQUE 9)
// ============================================
//
// Espejo EXACTO de `utils/propinas.js` del backend. El servidor revalida la
// propina de toda venta, así que si esta copia se desviara el cajero cobraría un
// número y el corte de caja le exigiría otro.
// ⚠️ Si cambias la fórmula, cámbiala en los TRES lugares: backend, desktop y mobile.
//
// LA REGLA DE ORO: LA PROPINA NO ES UNA VENTA.
//   • No entra en el total del pedido ni paga impuesto: es dinero del cliente
//     para el empleado que solo pasa por la caja.
//   • Lo que el cliente ENTREGA es `total + propina`. Lo que el negocio VENDIÓ
//     sigue siendo `total`. El ticket muestra los dos números.
//   • El invariante del BLOQUE 8 (total = subtotal + impuesto) queda intacto.
//
// DONDE SÍ CUENTA: EL CAJÓN. La propina en efectivo está físicamente ahí, así
// que el efectivo esperado del corte la suma (modulo-turno.js). Si no, cada
// propina en efectivo saldría como un SOBRANTE. La de tarjeta no entra: llega en
// la liquidación del banco. Cuando se le entrega al empleado sale como un
// `retiro` del BLOQUE 7 (motivo "pago de propinas").
//
// INTERRUPTOR (`propinas_activas`): nace APAGADO, igual que el impuesto. Un
// negocio que no recibe propinas no ve un solo renglón extra.

// Config vigente del negocio. Vive en los ajustes LOCALES (SQLite) para que la
// caja siga pidiendo propina sin internet; se refresca al sincronizar y por SSE.
let configPropina = { activo: false, sugerencias: [10, 15, 20] };

const PROPINA_SUGERENCIAS_DEFAULT = [10, 15, 20];
const PROPINA_MAX_SUGERENCIAS = 4;
const PROPINA_TOPE = 1000000;
const PROPINA_METODOS = ['efectivo', 'tarjeta', 'transferencia'];

function _redondearProp(n) {
    return parseFloat((Math.round((n + Number.EPSILON) * 100) / 100).toFixed(2));
}

/** Los ajustes locales guardan todo como texto: 'true' cuenta como true. */
function _boolProp(valor) {
    return valor === true || valor === 'true' || valor === 1 || valor === '1';
}

/**
 * Normaliza el monto de propina. Devuelve 0 —nunca un error— ante cualquier
 * valor inservible: una venta jamás debe fallar por una propina mal tecleada.
 */
function normalizarPropina(valor) {
    if (valor === undefined || valor === null || valor === '') return 0;
    const monto = parseFloat(valor);
    if (!Number.isFinite(monto) || monto <= 0 || monto > PROPINA_TOPE) return 0;
    return _redondearProp(monto);
}

/** Método de la propina; cae al del pago si no viene o no es válido. */
function normalizarMetodoPropina(metodoPropina, metodoPago) {
    const candidato = typeof metodoPropina === 'string' ? metodoPropina.toLowerCase().trim() : '';
    if (PROPINA_METODOS.includes(candidato)) return candidato;
    const pago = typeof metodoPago === 'string' ? metodoPago.toLowerCase().trim() : '';
    return PROPINA_METODOS.includes(pago) ? pago : 'efectivo';
}

/** Normaliza los porcentajes sugeridos. Acepta array o el texto "10,15,20". */
function normalizarSugerenciasPropina(valor) {
    let crudas = valor;
    if (typeof crudas === 'string') {
        try {
            const parseado = JSON.parse(crudas);
            crudas = Array.isArray(parseado) ? parseado : crudas.split(',');
        } catch {
            crudas = crudas.split(',');
        }
    }
    if (!Array.isArray(crudas)) return [...PROPINA_SUGERENCIAS_DEFAULT];

    const limpias = [];
    for (const cruda of crudas) {
        const pct = parseFloat(cruda);
        if (!Number.isFinite(pct) || pct <= 0 || pct > 100) continue;
        const redondeado = parseFloat(pct.toFixed(2));
        if (!limpias.includes(redondeado)) limpias.push(redondeado);
        if (limpias.length >= PROPINA_MAX_SUGERENCIAS) break;
    }
    return limpias.length ? limpias : [...PROPINA_SUGERENCIAS_DEFAULT];
}

/** Lee la config de propinas de un objeto de ajustes (local o de la nube). */
function leerConfigPropina(ajustes = {}) {
    return {
        activo: _boolProp(ajustes.propinas_activas),
        sugerencias: normalizarSugerenciasPropina(ajustes.propina_sugerencias),
    };
}

/**
 * Refresca la config desde los ajustes locales. Se llama al arrancar, al
 * sincronizar y cuando llega un cambio de ajustes por SSE.
 */
async function cargarConfigPropina() {
    try {
        const ajustes = await window.api.obtenerAjustes();
        configPropina = leerConfigPropina(ajustes || {});
    } catch {
        // Sin ajustes legibles se cobra SIN propina: es el estado neutro.
        configPropina = { activo: false, sugerencias: [...PROPINA_SUGERENCIAS_DEFAULT] };
    }
    return configPropina;
}

/** ¿Este negocio recibe propinas? Apagado, la UI no muestra ningún renglón. */
function hayPropinas(cfg = configPropina) {
    return !!cfg?.activo;
}

/** Monto que corresponde a un porcentaje sobre el total de la venta. */
function propinaPorPorcentaje(total, porcentaje) {
    const base = parseFloat(total) || 0;
    const pct = parseFloat(porcentaje) || 0;
    if (base <= 0 || pct <= 0) return 0;
    return _redondearProp(base * pct / 100);
}

/**
 * Lo que el cliente ENTREGA: la venta más la propina.
 * ⚠️ No es la venta del negocio. Este número solo se usa para pedir el dinero,
 * calcular el cambio e imprimirlo en el ticket; nunca se guarda como total.
 */
function totalConPropina(total, propina) {
    return _redondearProp((parseFloat(total) || 0) + (parseFloat(propina) || 0));
}

/** Propina de un pedido YA guardado (local o de la nube), para el ticket. */
function propinaDePedido(pedido = {}) {
    const monto = parseFloat(pedido.propina ?? pedido.tip_amount ?? 0) || 0;
    if (monto <= 0) return { monto: 0, metodo: null };
    const metodo = pedido.propina_metodo ?? pedido.tip_method ?? null;
    return {
        monto: _redondearProp(monto),
        metodo: normalizarMetodoPropina(metodo, pedido.metodo_pago ?? pedido.payment_method),
    };
}
