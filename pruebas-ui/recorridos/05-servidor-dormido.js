// ============================================================================
// RECORRIDO 5 — EL SERVIDOR DORMIDO Y EL SERVIDOR CAÍDO
//
// Sale de una observación del dueño del producto (2026-09-05): *"la primera vez
// que se abre la app no carga nada, y después puedes abrirla y cerrarla tantas
// veces como quieras sin problema"*. El backend está en el plan **gratuito** de
// Render, que **duerme el servidor** tras un rato sin uso y tarda cerca de un
// minuto en despertar — más que los 30 s de timeout del cliente HTTP. O sea: la
// primera petición del día está condenada a fallar.
//
// Ese escenario era el hueco más grande del banco: los otros cuatro recorridos o
// no tienen cuenta, o hablan con un backend que ya está encendido.
//
// LO QUE SE EXIGE AQUÍ, y es lo que el usuario tiene derecho a esperar:
//   • que la espera SE VEA (un círculo girando, no una pantalla muerta),
//   • que sin servidor se enseñe lo que hay guardado en el equipo —los pedidos
//     de hoy y los de ayer— en vez de un mensaje rojo con la lista vacía, y
//   • que SE PUEDA SEGUIR VENDIENDO, que es la promesa entera del §13.
//
// ⚠️ Este es el ÚNICO recorrido que declara `consola.redSeCayo(true)`: desenchufar
// la red produce errores de red en la consola y eso no es un defecto. La ventana
// es estrecha y solo perdona mensajes con forma de fallo de red (lib/app.js); un
// ReferenceError durante esa ventana sigue tumbando el recorrido.
// ============================================================================

const net = require('net');

const {
    irA, crearCuenta, venderEnMostrador, apuntarAServidor,
    estadoDeConexionEnPantalla, esperarEstadoDeConexion, hayRuedaDeCarga, leerBase,
} = require('../lib/cajero');

const COCA = 25.00;
const HAMBURGUESA = 85.00;

const PUERTO_DORMIDO = 3097;   // acepta la conexión y no contesta NUNCA
const PUERTO_MUERTO  = 3096;   // no hay nadie escuchando

/** Un servidor que se comporta como uno dormido: acepta y se queda callado. */
function servidorQueNoContesta(puerto) {
    return new Promise((resolver, rechazar) => {
        const s = net.createServer(() => { /* silencio absoluto, a propósito */ });
        s.on('error', rechazar);
        s.listen(puerto, '127.0.0.1', () => resolver(s));
    });
}

module.exports = {
    nombre: 'Servidor dormido: la espera se ve y la caja sigue viva',
    etiqueta: 'dormido',
    necesitaBackend: true,

    async ejecutar({ app, af, backend }) {
        const w = app.ventana;
        const base = leerBase(app.perfil);
        const correo = 'dormido+' + Date.now() + '@zenit.pruebas';
        const contrasena = 'zenit-pruebas-2026';

        // ── 1. Un negocio normal, con su cuenta y sus ventas del día ────────
        await crearCuenta(app, { url: backend.api, nombre: 'Fonda del Banco', correo, contrasena });
        const venta1 = await venderEnMostrador(app, [{ nombre: 'Hamburguesa Clásica' }], { metodo: 'efectivo' });
        const venta2 = await venderEnMostrador(app, [{ nombre: 'Coca Cola' }], { metodo: 'tarjeta' });
        af.dinero('las dos ventas del día quedan cobradas', venta1.total + venta2.total, HAMBURGUESA + COCA);

        // ── 2. EL SERVIDOR SE DUERME ────────────────────────────────────────
        // Un socket que acepta y no responde es exactamente lo que se siente al
        // otro lado mientras Render despierta.
        app.consola.redSeCayo(true);
        const dormido = await servidorQueNoContesta(PUERTO_DORMIDO);
        try {
            await apuntarAServidor(app, 'http://127.0.0.1:' + PUERTO_DORMIDO + '/api');

            af.cierto('mientras se espera al servidor, SE VE que está buscando',
                await hayRuedaDeCarga(app),
                'la cabecera no enseñó ningún indicador de carga: el usuario ve una app ' +
                'que parece rota y concluye, con razón, que no funciona');
            af.igual('y la cabecera lo dice con palabras', await estadoDeConexionEnPantalla(app), 'Conectando…');

            // Lo importante: la app NO se queda congelada esperando. Se puede
            // navegar y trabajar mientras el servidor decide despertar.
            await irA(app, 'nueva-venta');
            af.cierto('con el servidor dormido, la pantalla de venta sigue usándose',
                await w.locator('#grid-venta .product-card').count() > 0,
                'el catálogo no se pintó: sin él no se puede cobrar');
        } finally {
            dormido.close();
        }

        // ── 3. EL SERVIDOR NO ESTÁ ──────────────────────────────────────────
        await apuntarAServidor(app, 'http://127.0.0.1:' + PUERTO_MUERTO + '/api');
        af.igual('la cabecera acaba avisando que no hay conexión',
            await esperarEstadoDeConexion(app, 'Sin conexión'), 'Sin conexión');

        // ── 4. LOS PEDIDOS DE HOY SIGUEN AHÍ ────────────────────────────────
        // Esto es lo que estaba mal: `obtenerPedidosWrapper` YA leía la SQLite
        // local cuando el backend fallaba, y la vista tiraba ese resultado para
        // pintar un mensaje rojo. El cajero se quedaba sin poder ver la venta que
        // acababa de cobrar, con la venta guardada a medio metro.
        await irA(app, 'pedidos');
        // La lista pregunta primero al servidor y cae a lo local cuando falla, así
        // que se espera a que termine de cargar en vez de adivinar un tiempo.
        await w.waitForFunction(
            () => !(document.getElementById('lista-pedidos')?.innerText || '').includes('Cargando'),
            null, { timeout: 40000 });
        const filas = await w.locator('#lista-pedidos tr').count();
        af.cierto('sin servidor, el historial ENSEÑA los pedidos guardados en el equipo',
            filas >= 2,
            'la lista salió con ' + filas + ' filas: la vista volvió a tirar los datos locales');

        const aviso = w.locator('#pedidos-aviso-offline');
        af.cierto('y avisa de dónde salen esos pedidos', await aviso.isVisible(),
            'no se mostró el aviso: enseñar datos parciales sin decirlo es peor que no enseñarlos');
        af.cierto('el aviso admite que puede faltar lo de otras cajas',
            (await aviso.innerText()).includes('otra caja'),
            'el aviso no dice que la lista puede estar incompleta');

        // ── 5. Y SE PUEDE SEGUIR VENDIENDO, que es la promesa del §13 ───────
        const venta3 = await venderEnMostrador(app, [{ nombre: 'Coca Cola', veces: 2 }], { metodo: 'efectivo' });
        af.dinero('sin servidor, la caja sigue cobrando', venta3.total, COCA * 2);

        const pedidos = await base.todas('SELECT id, total, pendiente_sync FROM pedidos ORDER BY id');
        af.igual('la venta sin conexión quedó guardada en el equipo', pedidos.length, 3);
        const sinSubir = pedidos.filter((p) => p.pendiente_sync === 1);
        af.cierto('y marcada como pendiente de subir', sinSubir.length >= 1,
            'ninguna venta quedó en la cola: al volver la conexión no subiría nada');

        app.consola.redSeCayo(false);
        await base.cerrar();
    },
};
