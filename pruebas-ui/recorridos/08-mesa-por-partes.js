// ============================================================================
// RECORRIDO 8 — COBRAR UNA MESA EN 3 PARTES (PLAN_CUENTAS_V1, §70)
//
// El mesero va comensal por comensal: "¿qué pagas tú?" → cobra → "¿y tú?".
// Mesa de 3 Coca Colas y una hamburguesa ($160):
//   Parte 1: una Coca (toca "Coca Cola" UNA vez: 1 de 3), en efectivo → $25
//   Parte 2: la hamburguesa, mitad efectivo y mitad tarjeta          → $85
//   El resto: las 2 Cocas, con "Cobrar y cerrar" de siempre           → $50
//
// Se mira la PANTALLA (lo que dice "Esta parte" / "Queda en la mesa", el renglón
// "Ya pagaron") y el SERVIDOR (tres ventas que suman $160, la mesa libre, el
// rastro en auditoría). Solo existe CONECTADO: sin red el botón no sale.
//
// De paso cubre un arreglo: la ventana de cobro se rearmaba incompleta tras el
// primer "¡Cobrado!" (sin "Dividir la cuenta" ni el id del botón). Aquí se cobra
// TRES veces seguidas en la misma ventana; la segunda usa la división.
// ============================================================================

const {
    crearCuenta, estaConectado, crearMesas, abrirMesa, agregarProductosAMesa,
    cobrarParteDeMesa, cobrarMesa,
} = require('../lib/cajero');

const HAMBURGUESA = 85.00;
const COCA = 25.00;

module.exports = {
    nombre: 'Mesa por partes: cobrar comensal por comensal',
    etiqueta: 'partes',
    necesitaBackend: true,

    async ejecutar({ app, af, backend }) {
        const w = app.ventana;
        const correo = 'partes+' + Date.now() + '@zenit.pruebas';
        const contrasena = 'zenit-pruebas-2026';

        await crearCuenta(app, { url: backend.api, nombre: 'Fonda del Banco', correo, contrasena });
        af.cierto('el equipo queda en modo conectado', await estaConectado(app),
            'la app siguió en modo local después de crear la cuenta');
        const api = await backend.comoNegocio(correo, contrasena);

        await crearMesas(app, [{ nombre: 'Mesa 4', zona: 'Interior', capacidad: 4 }]);
        await abrirMesa(app, 'Mesa 4', 3);
        await agregarProductosAMesa(app, 'Mesa 4', [
            { nombre: 'Coca Cola', veces: 3 }, { nombre: 'Hamburguesa Clásica' },
        ]);

        af.cierto('con internet sale "Cobrar una parte"',
            await w.locator('#btn-cobrar-parte-mesa').isVisible(),
            'el botón no apareció en el panel de la mesa');

        // ── Parte 1: una Coca ───────────────────────────────────────────────
        const p1 = await cobrarParteDeMesa(app, { productos: [{ nombre: 'Coca Cola' }], metodo: 'efectivo', foto: 'partes-elegir' });
        af.dinero('"Esta parte" dice una Coca', p1.parte, COCA);
        af.dinero('"Queda en la mesa" dice el resto', p1.queda, HAMBURGUESA + 2 * COCA);
        af.igual('el cobro se titula "Cobrar una parte"', p1.titulo, 'Cobrar una parte');
        af.dinero('y cobra solo la parte', p1.total, COCA);
        af.cierto('la parte 1 llegó al "¡Cobrado!"', p1.cobrado, 'no apareció el ¡Cobrado!');

        const panel1 = await w.locator('#mesa-panel').innerText();
        af.cierto('la mesa sigue abierta con lo que falta', /Total:\s*\$135\.00/.test(panel1),
            'el panel no muestra $135.00: ' + JSON.stringify(panel1.slice(0, 200)));
        af.cierto('"Ya pagaron: 1 parte"', panel1.includes('Ya pagaron: 1 parte'),
            'no apareció el renglón de lo ya pagado');

        // ── Parte 2: la hamburguesa, mitad y mitad ──────────────────────────
        const p2 = await cobrarParteDeMesa(app, {
            productos: [{ nombre: 'Hamburguesa Clásica' }],
            division: { partes: 2, metodos: ['efectivo', 'tarjeta'] },
        });
        af.dinero('la parte 2 cobra la hamburguesa', p2.total, HAMBURGUESA);
        af.igual('con internet la división ya no ofrece "Por items"', p2.porItemsVisible, false);
        af.cierto('la parte 2 llegó al "¡Cobrado!"', p2.cobrado, 'no apareció el ¡Cobrado!');
        const panel2 = await w.locator('#mesa-panel').innerText();
        af.cierto('"Ya pagaron: 2 partes · $110.00"', panel2.includes('Ya pagaron: 2 partes · $110.00'),
            'el renglón dice: ' + JSON.stringify(panel2.slice(0, 200)));

        await app.foto('partes-panel');

        // Elegir TODO lo que queda no separa nada: es el cobro normal.
        await w.click('#btn-cobrar-parte-mesa');
        await w.waitForSelector('#modal-parte-mesa:not(.hidden)', { timeout: 10000 });
        await w.click('#parte-mesa-lista .parte-fila:has(.parte-fila-nombre:has-text("Coca Cola"))');
        await w.click('#parte-mesa-lista .parte-fila:has(.parte-fila-nombre:has-text("Coca Cola"))');
        af.igual('elegir todo lo que queda es "toda la cuenta"',
            (await w.locator('#btn-cobrar-esta-parte').innerText()).trim(), 'Es toda la cuenta: cobrar');
        await w.click('#modal-parte-mesa button:has-text("Cancelar")');
        await w.waitForTimeout(300);

        // ── El resto, con el cobro de siempre ───────────────────────────────
        const resto = await cobrarMesa(app, { metodo: 'efectivo' });
        af.dinero('el resto son las 2 Cocas', resto.total, 2 * COCA);
        af.cierto('el resto llegó al "¡Cobrado!"', resto.cobrado, 'no apareció el ¡Cobrado!');

        // ── El servidor ─────────────────────────────────────────────────────
        const pedidos = await api.exigir('GET', '/api/orders?limit=50');
        const ventas = (pedidos.data || []).filter((o) => o.table_id && o.status === 'completado');
        af.igual('el servidor tiene 3 ventas de la mesa', ventas.length, 3);
        const suma = ventas.reduce((s, o) => s + Math.round(parseFloat(o.total) * 100), 0) / 100;
        af.dinero('que suman la cuenta entera', suma, HAMBURGUESA + 3 * COCA);
        af.igual('2 de ellas son partes de la mesa', ventas.filter((o) => o.parent_order_id).length, 2);
        const mitadYMitad = ventas.find((o) => Math.abs(parseFloat(o.total) - HAMBURGUESA) < 0.01);
        af.igual('la hamburguesa se pagó con dos métodos', mitadYMitad && mitadYMitad.payment_method, 'multiple');

        const mesas = await api.exigir('GET', '/api/tables');
        af.igual('la mesa quedó libre', (mesas.find((m) => m.name === 'Mesa 4') || {}).open_order, null);

        const auditoria = await api.exigir('GET', '/api/audit');
        const partes = (auditoria.data || auditoria).filter((l) => l.action_type === 'separar_cuenta');
        af.igual('cada parte dejó rastro en auditoría', partes.length, 2);
    },
};
