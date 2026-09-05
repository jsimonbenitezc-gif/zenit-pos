// ============================================================================
// RECORRIDO 2 — UN DÍA COMPLETO DE CAJA, Y LA DIFERENCIA TIENE QUE SER CERO
//
// El equivalente en la pantalla del recorrido que justifica el banco del backend
// (CLAUDE.md §38): abrir turno → vender en efectivo, con tarjeta y con la cuenta
// repartida → dejar propinas → sacar un gasto y un retiro → meter un depósito →
// cerrar la caja y contar. Todo a clics, en el Zenit de escritorio de verdad.
//
// ⚠️ POR QUÉ ESTO NO ES CIRCULAR. El recorrido NO lee de la pantalla cuánto
// efectivo espera la app para después teclear ese mismo número: lleva su propio
// libro (lib/libro.js), suma peso a peso lo que él mismo hizo y teclea ESE número
// en "efectivo contado". Si la fórmula del desktop se desvía un centavo, la
// diferencia deja de ser cero y el recorrido dice cuánto sobra o falta.
//
// Y por qué vale la pena tenerlo también aquí, teniéndolo ya en el backend: el
// desktop **calcula su caja por su cuenta** cuando está en modo local. Son dos
// implementaciones distintas de las mismas reglas (§28, §29, §30, §31), y esta es
// la que usan los negocios que trabajan sin cuenta.
// ============================================================================

const {
    irA, venderEnMostrador, abrirTurno, leerTotalesTurno,
    registrarMovimiento, cerrarTurno, configurarImpuesto, configurarPropinas,
    leerBase,
} = require('../lib/cajero');
const { LibroDeCaja, desglosar } = require('../lib/libro');

const FONDO_INICIAL = 1500.00;
const TASA = 16;          // IVA mexicano
const INCLUIDO = true;    // el precio del catálogo YA lo trae (el modo por defecto, §29)

// Precios del catálogo de ejemplo que siembra `crearDatosEjemplo` (database/db.js).
const HAMBURGUESA = 85.00;
const PIZZA = 120.00;
const COCA = 25.00;
const TOCINO = 15.00;

module.exports = {
    nombre: 'Un día de caja: la diferencia del corte es CERO',
    etiqueta: 'caja',

    async ejecutar({ app, af }) {
        const libro = new LibroDeCaja(FONDO_INICIAL);
        const base = leerBase(app.perfil);

        // ── Ajustes del negocio ─────────────────────────────────────────────
        // Las propinas y el impuesto nacen APAGADOS (§29, §30). Sin encenderlos,
        // el recorrido probaría lo contrario de lo que dice probar.
        await configurarImpuesto(app, { activo: true, tasa: TASA, incluido: INCLUIDO });
        await configurarPropinas(app, { activo: true });

        await abrirTurno(app, { nombre: 'Lupita', fondo: FONDO_INICIAL });

        // ── Venta 1 — dos hamburguesas en efectivo, con propina en efectivo ──
        const v1 = HAMBURGUESA * 2;
        const venta1 = await venderEnMostrador(app,
            [{ nombre: 'Hamburguesa Clásica', veces: 2 }],
            { metodo: 'efectivo', propina: 20, propinaMetodo: 'efectivo' });
        af.dinero('la venta 1 cobra las dos hamburguesas', venta1.total, v1);
        libro.venta({
            pagos: [{ metodo: 'efectivo', monto: v1 }],
            propinas: [{ metodo: 'efectivo', monto: 20 }],
            impuesto: desglosar({ base: v1, tasa: TASA, incluido: INCLUIDO }).impuesto,
            concepto: 'venta 1',
        });

        // ── Venta 2 — pizza con tarjeta y propina TAMBIÉN con tarjeta ───────
        // La propina de tarjeta NO entra al cajón: llega en la liquidación del
        // banco (§30). Si el desktop la sumara al efectivo esperado, el cierre le
        // exigiría al cajero $30 que nunca tuvo.
        const venta2 = await venderEnMostrador(app,
            [{ nombre: 'Pizza Pepperoni' }],
            { metodo: 'tarjeta', propina: 30, propinaMetodo: 'tarjeta' });
        af.dinero('la venta 2 cobra la pizza', venta2.total, PIZZA);
        libro.venta({
            pagos: [{ metodo: 'tarjeta', monto: PIZZA }],
            propinas: [{ metodo: 'tarjeta', monto: 30 }],
            impuesto: desglosar({ base: PIZZA, tasa: TASA, incluido: INCLUIDO }).impuesto,
            concepto: 'venta 2',
        });

        // ── Venta 3 — la cuenta repartida entre dos métodos (§31) ───────────
        const v3 = COCA + TOCINO;
        const venta3 = await venderEnMostrador(app,
            [{ nombre: 'Coca Cola' }, { nombre: 'Tocino Extra' }],
            { pagos: [{ metodo: 'efectivo', monto: 25 }, { metodo: 'transferencia', monto: 15 }] });
        af.dinero('la venta 3 cobra el refresco y el tocino', venta3.total, v3);
        libro.venta({
            pagos: [{ metodo: 'efectivo', monto: 25 }, { metodo: 'transferencia', monto: 15 }],
            impuesto: desglosar({ base: v3, tasa: TASA, incluido: INCLUIDO }).impuesto,
            concepto: 'venta 3',
        });

        // ── Movimientos de caja (§28) ───────────────────────────────────────
        // El gasto es el caso que dio origen al bloque 7: sin registrarlo, esos
        // $50 aparecían como un FALTANTE al cerrar.
        const gasto = await registrarMovimiento(app, { tipo: 'gasto', monto: 50, motivo: 'Compra de cilantro' });
        libro.movimiento('gasto', 50);
        af.igual('sin cuenta vinculada, el gasto no pide un PIN que no existe', gasto.pidioPin, false);

        await registrarMovimiento(app, { tipo: 'retiro', monto: 200, motivo: 'A la caja fuerte' });
        libro.movimiento('retiro', 200);

        await registrarMovimiento(app, { tipo: 'deposito', monto: 100, motivo: 'Más cambio' });
        libro.movimiento('deposito', 100);

        // ── Lo que la app muestra en vivo, contra el libro ───────────────────
        const totales = await leerTotalesTurno(app);
        af.dinero('el turno reparte bien el efectivo',      totales.efectivo,      libro.totalEfectivo);
        af.dinero('el turno reparte bien la tarjeta',       totales.tarjeta,       libro.totalTarjeta);
        af.dinero('el turno reparte bien la transferencia', totales.transferencia, libro.totalTransferencia);
        af.dinero('el turno suma bien las ventas',          totales.ventas,        libro.totalVentas);
        af.igual('el turno cuenta los tres pedidos',        totales.pedidos,       libro.pedidosContables);

        // ── Lo que quedó GUARDADO, que es lo que sobrevive al reinicio ───────
        const pedidos = await base.todas(
            'SELECT id, total, subtotal, impuesto, metodo_pago, propina, propina_metodo FROM pedidos ORDER BY id');
        af.igual('quedaron tres pedidos en la base', pedidos.length, 3);
        for (const p of pedidos) af.invarianteImpuesto('el pedido #' + p.id + ' cuadra', p);

        const sumaImpuesto = pedidos.reduce((a, p) => a + (parseFloat(p.impuesto) || 0), 0);
        af.dinero('el impuesto guardado es el del 16% incluido', sumaImpuesto, libro.totalImpuesto);

        const conPropina = pedidos.filter((p) => (parseFloat(p.propina) || 0) > 0);
        af.igual('dos ventas guardaron propina', conPropina.length, 2);
        af.dinero('las propinas guardadas suman lo dejado',
            conPropina.reduce((a, p) => a + parseFloat(p.propina), 0), libro.totalPropinas);

        // El reparto de la venta 3 tiene que estar en `pagos_pedido`, y sumar
        // EXACTAMENTE el total del pedido: los pagos reparten, no aumentan (§31).
        const pagos = await base.todas('SELECT pedido_id, metodo, monto FROM pagos_pedido ORDER BY id');
        af.igual('la venta repartida dejó sus dos filas de pago', pagos.length, 2);
        af.dinero('los dos pagos suman el total de la cuenta',
            pagos.reduce((a, p) => a + parseFloat(p.monto), 0), v3);
        const multiple = pedidos.find((p) => p.metodo_pago === 'multiple');
        af.cierto('la venta repartida quedó marcada como "multiple"', Boolean(multiple),
            'ninguno de los tres pedidos guardó payment_method = multiple');

        // ── EL CIERRE ───────────────────────────────────────────────────────
        // Se teclea lo que dice el LIBRO, no lo que dice la pantalla.
        const cierre = await cerrarTurno(app, { contado: libro.efectivoEnCajon });
        af.dinero('el efectivo esperado del cierre coincide con el libro', cierre.esperado, libro.efectivoEnCajon);
        af.dinero('LA DIFERENCIA DEL CORTE ES CERO', cierre.diferencia, 0);
        console.log('\n        ── el libro del banco ──\n        ' + libro.resumen() + '\n');

        const turnos = await base.todas(
            'SELECT id, cierre, efectivo_contado, diferencia, total_gastos, total_retiros, total_depositos FROM turnos');
        af.igual('el turno quedó cerrado en la base', turnos.length, 1);
        if (turnos.length) {
            af.cierto('el turno guardó su hora de cierre', Boolean(turnos[0].cierre), 'cierre quedó nulo');
            af.dinero('el turno congeló los gastos',    turnos[0].total_gastos,    libro.gastos);
            af.dinero('el turno congeló los retiros',   turnos[0].total_retiros,   libro.retiros);
            af.dinero('el turno congeló los depósitos', turnos[0].total_depositos, libro.depositos);
            af.dinero('el turno guardó diferencia cero', turnos[0].diferencia, 0);
        }

        // Tras cerrar, la vista vuelve a ofrecer abrir uno nuevo: es lo que ve el
        // cajero del siguiente turno, y comprobarlo cuesta un clic.
        await irA(app, 'turno');
        af.cierto('la vista de turno vuelve a ofrecer abrir caja',
            await app.ventana.locator('#turno-sin-turno').isVisible(),
            'la vista quedó atascada en el turno ya cerrado');

        await base.cerrar();
    },
};
