// ============================================
// MÓDULO: Pagos divididos (BLOQUE 10)
// ============================================
//
// Espejo EXACTO de `utils/pagos.js` del backend. El servidor revalida el reparto
// de toda venta y RECHAZA (400) el que no cuadre, así que si esta copia se
// desviara el cajero armaría una división que el backend le rebota.
// ⚠️ Si cambias la fórmula, cámbiala en los TRES lugares: backend, desktop y mobile.
//
// LA REGLA DE ORO: LOS PAGOS REPARTEN EL TOTAL, NO LO AUMENTAN.
//   • `suma(pagos.monto) === total`. Un pago no agrega dinero a la venta.
//   • La PROPINA de cada pago va aparte de su monto: lo que el cliente entrega
//     en ese pago es `monto + propina`. El invariante del BLOQUE 9 (la propina
//     fuera del total) y el del BLOQUE 8 (total = subtotal + impuesto) quedan
//     intactos.
//   • Con varios métodos, el pedido se guarda como 'multiple' y el desglose real
//     vive en los pagos. Con uno solo, se guarda ese método de siempre.
//
// POR QUÉ IMPORTA: antes, una venta de $500 pagada $300 en efectivo y $200 con
// tarjeta se registraba entera por un solo método, así que el corte de caja le
// exigía al cajero $200 que nunca estuvieron en el cajón.

const PAGO_METODOS = ['efectivo', 'tarjeta', 'transferencia'];
const PAGO_TOLERANCIA = 0.01;   // un centavo de redondeo al dividir
const PAGO_MAX = 20;            // una cuenta se divide entre comensales, no multitudes

function _redondearPago(n) {
    return parseFloat((Math.round((n + Number.EPSILON) * 100) / 100).toFixed(2));
}

/** Método de un pago; cae a 'efectivo' si no es uno de los tres válidos. */
function metodoDePago(valor) {
    const candidato = typeof valor === 'string' ? valor.toLowerCase().trim() : '';
    return PAGO_METODOS.includes(candidato) ? candidato : 'efectivo';
}

/** 'multiple' cuando hay más de un método distinto; si no, ese método. */
function metodoResumenPagos(pagos) {
    if (!Array.isArray(pagos) || pagos.length === 0) return null;
    const distintos = [...new Set(pagos.map(p => metodoDePago(p.method)))];
    return distintos.length === 1 ? distintos[0] : 'multiple';
}

/**
 * ¿Cuánto falta por cubrir? Es lo que el modal de cobro pinta en vivo mientras
 * el cajero teclea. Positivo = falta; negativo = se pasó.
 */
function faltantePago(pagos, total) {
    const suma = (pagos || []).reduce((a, p) => a + (parseFloat(p.amount) || 0), 0);
    return _redondearPago((parseFloat(total) || 0) - suma);
}

/** ¿La división cuadra con la cuenta? (con el mismo centavo de tolerancia). */
function pagosCuadran(pagos, total) {
    return Math.abs(faltantePago(pagos, total)) <= PAGO_TOLERANCIA + 1e-9;
}

/**
 * Valida el reparto antes de mandarlo. Devuelve `{ ok, error }` con el MISMO
 * mensaje que daría el backend, para que el cajero lea lo mismo venga de donde
 * venga el rechazo.
 */
function validarPagos(pagos, total) {
    if (!Array.isArray(pagos) || pagos.length === 0) {
        return { ok: false, error: 'No se recibió ningún pago.' };
    }
    if (pagos.length > PAGO_MAX) {
        return { ok: false, error: `Una venta admite como máximo ${PAGO_MAX} pagos.` };
    }
    for (const p of pagos) {
        const monto = parseFloat(p && p.amount);
        if (!Number.isFinite(monto) || monto <= 0) {
            return { ok: false, error: 'Cada pago debe tener un monto mayor a cero.' };
        }
    }
    const suma = _redondearPago((pagos).reduce((a, p) => a + _redondearPago(parseFloat(p.amount)), 0));
    const objetivo = _redondearPago(parseFloat(total) || 0);
    if (Math.abs(suma - objetivo) > PAGO_TOLERANCIA + 1e-9) {
        return {
            ok: false,
            error: `Los pagos suman ${suma.toFixed(2)} y la cuenta es ${objetivo.toFixed(2)}. `
                 + `Ajusta los montos para que cuadren.`,
        };
    }
    return { ok: true };
}

/**
 * Divide una cuenta en N partes IGUALES, repartiendo los centavos sobrantes.
 * Los primeros comensales pagan el centavo de más — es lo que hace cualquiera
 * al dividir a mano, y garantiza que la suma dé exactamente el total.
 */
function dividirEnPartes(total, partes) {
    const n = Math.max(1, parseInt(partes) || 1);
    const centavos = Math.round((parseFloat(total) || 0) * 100);
    const base = Math.floor(centavos / n);
    const resto = centavos - base * n;
    const montos = [];
    for (let i = 0; i < n; i++) {
        montos.push(_redondearPago((base + (i < resto ? 1 : 0)) / 100));
    }
    return montos;
}

/**
 * Cuánto suma un grupo de items (para dividir la cuenta POR ITEMS).
 *
 * ⚠️ Se reparte sobre el TOTAL de la cuenta, no sobre la suma cruda de los
 * items: el total ya trae el impuesto y ya tiene restados los descuentos. Si se
 * sumaran los precios de lista, cada comensal pagaría de más o de menos y la
 * división nunca cuadraría con lo que hay que cobrar.
 *
 * @param {Array}  items      items del pedido (con `subtotal` o precio × cantidad)
 * @param {Array}  idsGrupo   ids de los items que paga este comensal
 * @param {number} totalCuenta total real a cobrar
 */
function montoDeItems(items, idsGrupo, totalCuenta) {
    const todos = items || [];
    const bruto = todos.reduce((a, i) => a + _montoItem(i), 0);
    if (bruto <= 0) return 0;

    const grupo = todos.filter(i => idsGrupo.includes(_idItem(i)));
    const brutoGrupo = grupo.reduce((a, i) => a + _montoItem(i), 0);

    // Proporción del grupo sobre la cuenta real (con impuesto y descuentos).
    return _redondearPago((parseFloat(totalCuenta) || 0) * (brutoGrupo / bruto));
}

function _montoItem(i) {
    if (i == null) return 0;
    const sub = parseFloat(i.subtotal);
    if (Number.isFinite(sub) && sub > 0) return sub;
    const precio = parseFloat(i.unit_price != null ? i.unit_price : i.precio) || 0;
    const cant = parseFloat(i.quantity != null ? i.quantity : i.cantidad) || 0;
    return precio * cant;
}

function _idItem(i) {
    return i && i.id != null ? i.id : null;
}

/**
 * Ajusta el ÚLTIMO pago para que la suma dé exactamente el total.
 *
 * Al dividir por items, las proporciones dejan centavos sueltos. En vez de
 * rechazar la división (que es legítima), se le carga el resto al último grupo,
 * igual que hace el backend con el pago más grande.
 */
function cuadrarUltimoPago(pagos, total) {
    if (!Array.isArray(pagos) || pagos.length === 0) return pagos;
    const falta = faltantePago(pagos, total);
    if (falta === 0) return pagos;
    const ultimo = pagos[pagos.length - 1];
    ultimo.amount = _redondearPago((parseFloat(ultimo.amount) || 0) + falta);
    return pagos;
}

/** Etiqueta legible del método, para pintar el ticket y el historial. */
function etiquetaMetodoPago(metodo) {
    switch (metodoDePago(metodo)) {
        case 'tarjeta': return 'Tarjeta';
        case 'transferencia': return 'Transferencia';
        default: return 'Efectivo';
    }
}

/**
 * Parsea el `pagos_raw` que arma la base local ("metodo|monto|propina;;...").
 *
 * SQLite no tiene JSON_AGG, así que el listado local agrega los pagos como texto
 * y se desarman aquí. Un pedido sin pagos devuelve [] y el ticket lo imprime
 * como una venta de un solo método, igual que antes del bloque.
 */
function parsearPagosLocales(pagosRaw) {
    if (!pagosRaw || typeof pagosRaw !== 'string') return [];
    return pagosRaw.split(';;').filter(Boolean).map(fila => {
        const [metodo, monto, propina] = fila.split('|');
        return {
            method: metodoDePago(metodo),
            amount: parseFloat(monto) || 0,
            tip_amount: parseFloat(propina) || 0,
        };
    });
}

/**
 * Pagos de un pedido, venga del backend (`payments`) o de la base local
 * (`pagos_raw`). Es lo que usan el ticket y el detalle del pedido.
 */
function pagosDePedido(pedido) {
    if (!pedido) return [];
    if (Array.isArray(pedido.payments) && pedido.payments.length) return pedido.payments;
    if (Array.isArray(pedido.pagos) && pedido.pagos.length) return pedido.pagos;
    return parsearPagosLocales(pedido.pagos_raw);
}

/**
 * Reparto de un pedido por método, para el ticket y el corte local.
 * Sin pagos, el total entra entero por su método — como antes del bloque.
 */
function repartoDePedido(pedido) {
    const r = { efectivo: 0, tarjeta: 0, transferencia: 0 };
    const pagos = pagosDePedido(pedido);
    if (Array.isArray(pagos) && pagos.length > 0) {
        for (const p of pagos) r[metodoDePago(p.method || p.metodo)] += parseFloat(p.amount || p.monto) || 0;
    } else if (pedido) {
        r[metodoDePago(pedido.payment_method || pedido.metodo_pago)] += parseFloat(pedido.total) || 0;
    }
    r.efectivo = _redondearPago(r.efectivo);
    r.tarjeta = _redondearPago(r.tarjeta);
    r.transferencia = _redondearPago(r.transferencia);
    return r;
}
