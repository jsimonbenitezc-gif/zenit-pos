// ============================================
// MÓDULO: Impuesto configurable (BLOQUE 8)
// ============================================
//
// Espejo EXACTO de `utils/impuestos.js` del backend. El servidor recalcula el
// impuesto de toda venta, así que si esta fórmula se desviara el cajero vería un
// total en el carrito y el ticket saldría con otro.
// ⚠️ Si cambias la fórmula, cámbiala en los TRES lugares: backend, desktop y mobile.
//
// INTERRUPTOR (`tax_enabled`): el impuesto se enciende y se apaga sin perder la
// tasa configurada. Apagado es el default: la mayoría de los negocios no cobra
// impuesto y no debe ver un solo renglón extra.
//
// DOS MODOS (`tax_included`):
//   • INCLUIDO (DEFAULT) — el precio ya lo trae; el ticket lo desglosa hacia atrás.
//                          Es el estándar en México (precio exhibido con IVA).
//   • AGREGADO           — el precio es la base; el impuesto se SUMA al cobrar.
//
// El descuento (y el canje de puntos) baja la BASE GRAVABLE: se descuenta primero
// y el impuesto se calcula sobre lo que realmente se cobra.
//
// INVARIANTE: total = subtotal + impuesto.

// Config vigente del negocio. Vive en los ajustes LOCALES (SQLite) para que la
// caja siga cobrando bien sin internet; se refresca al sincronizar y por SSE.
let configImpuesto = { activo: false, tasa: 0, tasaConfigurada: 0, incluido: true, nombre: 'IVA' };

const IMPUESTO_NOMBRE_DEFAULT = 'IVA';
const IMPUESTO_NOMBRE_MAX = 20;

function _redondearImp(n) {
    return parseFloat((Math.round((n + Number.EPSILON) * 100) / 100).toFixed(2));
}

/** Normaliza la tasa. Devuelve null si el valor no sirve (→ tratar como 0). */
function normalizarTasaImpuesto(valor) {
    if (valor === undefined || valor === null || valor === '') return null;
    const tasa = parseFloat(valor);
    if (!Number.isFinite(tasa) || tasa < 0 || tasa > 100) return null;
    return parseFloat(tasa.toFixed(2));
}

/** Los ajustes locales guardan todo como texto: 'true' cuenta como true. */
function _incluidoImp(valor) {
    return valor === true || valor === 'true' || valor === 1 || valor === '1';
}

/**
 * Lee la config de impuesto de un objeto de ajustes (local o de la nube).
 * `tasa` es la EFECTIVA (0 si el impuesto está apagado) y es la única que debe
 * usarse para cobrar; `tasaConfigurada` es la guardada, para que apagar y volver
 * a encender no le borre su 16% al dueño.
 */
function leerConfigImpuesto(ajustes = {}) {
    const nombre = typeof ajustes.tax_name === 'string' && ajustes.tax_name.trim()
        ? ajustes.tax_name.trim().slice(0, IMPUESTO_NOMBRE_MAX)
        : IMPUESTO_NOMBRE_DEFAULT;
    const tasaConfigurada = normalizarTasaImpuesto(ajustes.tax_rate) ?? 0;
    const valorActivo = ajustes.tax_enabled;
    const activo = (valorActivo === undefined || valorActivo === null || valorActivo === '')
        ? tasaConfigurada > 0                       // config anterior al interruptor
        : _incluidoImp(valorActivo);                // acepta true/'true'
    // El modo por defecto es INCLUIDO: en México el precio exhibido ya trae IVA.
    const modo = ajustes.tax_included;
    const incluido = (modo === undefined || modo === null || modo === '')
        ? true
        : _incluidoImp(modo);
    return { activo, tasa: activo ? tasaConfigurada : 0, tasaConfigurada, incluido, nombre };
}

/**
 * Refresca la config desde los ajustes locales. Se llama al arrancar, al
 * sincronizar y cuando llega un cambio de ajustes por SSE.
 */
async function cargarConfigImpuesto() {
    try {
        const ajustes = await window.api.obtenerAjustes();
        configImpuesto = leerConfigImpuesto(ajustes || {});
    } catch {
        // Sin ajustes legibles se vende SIN impuesto: cobrar de más por un error
        // de lectura sería peor que no desglosar.
        configImpuesto = { activo: false, tasa: 0, tasaConfigurada: 0, incluido: true, nombre: IMPUESTO_NOMBRE_DEFAULT };
    }
    return configImpuesto;
}

/** ¿Este negocio cobra impuesto? Con tasa 0 la UI no muestra ningún renglón extra. */
function hayImpuesto(cfg = configImpuesto) {
    return (cfg?.tasa || 0) > 0;
}

/** Etiqueta del renglón: "IVA (16%)" o "IVA (16%) incluido". */
function etiquetaImpuesto(cfg = configImpuesto) {
    const nombre = cfg?.nombre || IMPUESTO_NOMBRE_DEFAULT;
    const tasa = cfg?.tasa || 0;
    const tasaTexto = Number.isInteger(tasa) ? String(tasa) : String(tasa);
    return `${nombre} (${tasaTexto}%)${cfg?.incluido ? ' incluido' : ''}`;
}

/**
 * Desglosa una venta.
 * @param {number} base  AGREGADO: suma de items − descuentos (sin impuesto).
 *                       INCLUIDO: lo que se cobra (ya trae el impuesto).
 * @returns {{subtotal:number, impuesto:number, total:number}}
 */
function desglosarImpuesto(base, cfg = configImpuesto) {
    const monto = _redondearImp(parseFloat(base) || 0);
    const tasa = normalizarTasaImpuesto(cfg?.tasa) ?? 0;

    if (tasa <= 0 || monto <= 0) {
        return { subtotal: monto, impuesto: 0, total: monto };
    }

    if (cfg?.incluido) {
        // El subtotal se define como (cobrado − impuesto) para que el invariante
        // se cumpla al centavo exacto y el ticket sume.
        const impuesto = _redondearImp(monto - monto / (1 + tasa / 100));
        return { subtotal: _redondearImp(monto - impuesto), impuesto, total: monto };
    }

    const impuesto = _redondearImp(monto * tasa / 100);
    return { subtotal: monto, impuesto, total: _redondearImp(monto + impuesto) };
}

/**
 * Desglose de un pedido YA guardado (local o de la nube), para el ticket y los
 * reportes. Un pedido anterior al bloque no tiene desglose: su total ES lo que
 * se cobró, y se muestra sin renglón de impuesto.
 */
function desgloseDePedido(pedido = {}) {
    const total = parseFloat(pedido.total ?? pedido.total_pedido ?? 0) || 0;
    const impuesto = parseFloat(pedido.impuesto ?? pedido.tax_amount ?? 0) || 0;
    const subtotalGuardado = pedido.subtotal ?? pedido.subtotal_pedido;
    const subtotal = subtotalGuardado === undefined || subtotalGuardado === null
        ? _redondearImp(total - impuesto)
        : parseFloat(subtotalGuardado) || 0;
    const tasa = normalizarTasaImpuesto(pedido.tasa_impuesto ?? pedido.tax_rate) ?? 0;
    const incluido = _incluidoImp(pedido.impuesto_incluido ?? pedido.tax_included);
    return { subtotal, impuesto, total, tasa, incluido, nombre: configImpuesto.nombre };
}
