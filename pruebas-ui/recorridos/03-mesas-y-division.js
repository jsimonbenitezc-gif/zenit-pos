// ============================================================================
// RECORRIDO 3 — LA MESA: ABRIR, AGREGAR, DIVIDIR LA CUENTA Y COBRAR
//
// La vista de Mesas es la que más veces se ha roto entera en este repo: en el
// BLOQUE 8 se referenció `_desgloseMesa()` en cinco sitios sin escribirla nunca y
// la vista reventaba con un ReferenceError en cuanto una mesa tenía un producto
// (§29). No llegó a un usuario solo porque ese commit jamás se recompiló. Es
// también la vista con más estado: un pedido abierto que se va llenando, un panel
// lateral, y un cobro que puede repartirse entre varios comensales.
//
// Aquí se cubre el ciclo entero y, de paso, dos reglas que se pagan en dinero:
//   • los pagos REPARTEN el total de la cuenta, nunca lo aumentan (§31), y
//   • un pedido CANCELADO no cuenta para el corte (§1).
// ============================================================================

const {
    irA, abrirTurno, crearMesas, abrirMesa, agregarProductosAMesa, cobrarMesa,
    venderEnMostrador, cancelarPedido, estadoDePedido, leerTotalesTurno, cerrarTurno,
    leerBase,
} = require('../lib/cajero');
const { LibroDeCaja } = require('../lib/libro');

const FONDO_INICIAL = 800.00;
const PIZZA = 120.00;
const COCA = 25.00;

module.exports = {
    nombre: 'Mesas: abrir, agregar, dividir la cuenta y cobrar',
    etiqueta: 'mesas',

    async ejecutar({ app, af }) {
        const w = app.ventana;
        const libro = new LibroDeCaja(FONDO_INICIAL);
        const base = leerBase(app.perfil);

        await abrirTurno(app, { nombre: 'Beto', fondo: FONDO_INICIAL });

        // ── Configurar el comedor ───────────────────────────────────────────
        // Una instalación nueva no trae mesas: la vista lo dice y manda a
        // "Configurar". Eso también es parte del recorrido de alguien que estrena.
        await irA(app, 'mesas');
        af.cierto('una instalación nueva avisa que no hay mesas configuradas',
            (await w.locator('#mesas-grid').innerText()).includes('No hay mesas configuradas'),
            'el comedor vacío no explicó qué hacer');

        await crearMesas(app, [{ nombre: 'Mesa 1', zona: 'Interior', capacidad: 4 }]);
        af.igual('la mesa nueva aparece en el comedor',
            await w.locator('#mesas-grid > div:has(span:text-is("Mesa 1"))').count(), 1);

        // ── Abrir la mesa y servir ──────────────────────────────────────────
        await abrirMesa(app, 'Mesa 1', 4);
        await agregarProductosAMesa(app, 'Mesa 1', [
            { nombre: 'Pizza Pepperoni', veces: 2 },
            { nombre: 'Coca Cola', veces: 4 },
        ]);

        const cuenta = PIZZA * 2 + COCA * 4;   // 340.00
        const panel = await w.locator('#mesa-panel-items').innerText();
        af.cierto('el panel de la mesa lista lo que se sirvió',
            panel.includes('Pizza Pepperoni') && panel.includes('Coca Cola'),
            'el panel no muestra los productos agregados: ' + JSON.stringify(panel.slice(0, 120)));

        const pedidoMesa = await base.una('SELECT id, total, comensales FROM pedidos WHERE mesa_id IS NOT NULL');
        af.cierto('la mesa abrió su comanda', Boolean(pedidoMesa), 'no se creó ningún pedido con mesa');
        if (pedidoMesa) {
            af.dinero('la comanda suma las dos pizzas y los cuatro refrescos', pedidoMesa.total, cuenta);
            af.igual('la comanda guardó los comensales', pedidoMesa.comensales, 4);
        }

        // ── Cobrar dividiendo entre dos ─────────────────────────────────────
        // Dos parejas: una paga en efectivo y la otra con tarjeta. Es el caso
        // corriente de un restaurante, y el que descuadraba la caja antes del
        // BLOQUE 10 (todo se registraba con un solo método).
        const cobro = await cobrarMesa(app, {
            division: { modo: 'partes', partes: 2, metodos: ['efectivo', 'tarjeta'] },
        });
        af.dinero('el modal de cobro muestra la cuenta completa', cobro.total, cuenta);
        af.cierto('el modal confirma el cobro antes de cerrarse', cobro.cobrado,
            'el modal no llegó a mostrar el "¡Cobrado!"');
        libro.venta({
            pagos: [{ metodo: 'efectivo', monto: cuenta / 2 }, { metodo: 'tarjeta', monto: cuenta / 2 }],
            concepto: 'mesa 1 dividida entre dos',
        });

        const pagos = await base.todas('SELECT metodo, monto FROM pagos_pedido ORDER BY id');
        af.igual('la cuenta quedó repartida en dos pagos', pagos.length, 2);
        af.dinero('los pagos suman EXACTAMENTE la cuenta, no más',
            pagos.reduce((a, p) => a + parseFloat(p.monto), 0), cuenta);
        af.cierto('los dos métodos quedaron guardados',
            pagos.map((p) => p.metodo).sort().join(',') === 'efectivo,tarjeta',
            'los métodos guardados fueron: ' + pagos.map((p) => p.metodo).join(', '));

        await irA(app, 'mesas');
        af.cierto('la mesa vuelve a estar libre después de cobrar',
            (await w.locator('#mesas-grid').innerText()).includes('Mesa 1'),
            'la mesa desapareció del comedor tras el cobro');

        // ── Una venta CANCELADA no cuenta para el corte (§1) ─────────────────
        const venta = await venderEnMostrador(app, [{ nombre: 'Coca Cola', veces: 2 }], { metodo: 'efectivo' });
        af.dinero('la venta que se va a cancelar cobra dos refrescos', venta.total, COCA * 2);
        await cancelarPedido(app, venta.pedidoId);
        libro.ventaQueNoCuenta('venta #' + venta.pedidoId + ' cancelada');

        af.igual('el pedido quedó marcado como cancelado',
            await estadoDePedido(app, venta.pedidoId), 'cancelado');

        const totales = await leerTotalesTurno(app);
        af.dinero('el turno NO cuenta la venta cancelada', totales.ventas, libro.totalVentas);
        af.dinero('y su efectivo tampoco entró al cajón', totales.efectivo, libro.totalEfectivo);
        af.igual('el turno cuenta un solo pedido: el de la mesa', totales.pedidos, libro.pedidosContables);

        // ── El corte, otra vez, tiene que dar cero ──────────────────────────
        const cierre = await cerrarTurno(app, { contado: libro.efectivoEnCajon });
        af.dinero('el efectivo esperado coincide con el libro', cierre.esperado, libro.efectivoEnCajon);
        af.dinero('LA DIFERENCIA DEL CORTE ES CERO', cierre.diferencia, 0);

        await base.cerrar();
    },
};
