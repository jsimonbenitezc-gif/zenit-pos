// ============================================================================
// RECORRIDO 1 — LA PRIMERA VEZ QUE ALGUIEN ABRE ZENIT
//
// Es el recorrido más barato y el que más ha valido: instalación recién hecha,
// base vacía, y lo primero que hace cualquiera —mirar las pantallas y cobrar algo.
//
// ✅ AQUÍ SE ENCONTRÓ EL DEFECTO QUE JUSTIFICA EL BLOQUE (2026-09-05). En una
// instalación NUEVA, la tabla `pedidos` nacía sin sus nueve columnas de los
// bloques 8-10: `inicializarTablas()` lanzaba sus 49 ALTER TABLE en modo PARALELO
// (el de node-sqlite3 por defecto), así que algunos se ejecutaban antes del CREATE
// TABLE de su propia tabla, fallaban con "no such table" y su callback `() => {}`
// se tragaba el error (§44.1). Consecuencias en el primer arranque, todas reales:
//   • el tablero decía "Error al cargar dashboard",
//   • la lista de pedidos tampoco cargaba, y
//   • LA PRIMERA VENTA NO SE PODÍA REGISTRAR ("table pedidos has no column named
//     descuento_id"): el cajero veía "Error al guardar" y el pedido no existía.
// Al segundo arranque la tabla ya existía, los ALTER pasaban y todo se "arreglaba"
// solo. Por eso llevaba ahí desde el BLOQUE 8 sin que nadie lo viera: no hay forma
// de tropezarse con esto salvo instalando de cero, y quien programa nunca lo hace.
//
// Las tres comprobaciones de abajo son su guardia permanente. Si alguien quita el
// `db.serialize` de `database/db.js`, este recorrido falla en la primera venta.
// ============================================================================

const { irA, venderEnMostrador, leerBase, activarPremiumDePrueba } = require('../lib/cajero');

// Las 11 vistas del menú, con algo que solo existe si la vista se pintó de verdad.
// `premium: true` = en modo local (sin cuenta) la vista sale con el candado, que
// es lo correcto (§8): ahí lo que se comprueba es que el candado esté puesto.
const VISTAS = [
    { vista: 'dashboard',    vital: '#dash-ventas-hoy' },
    { vista: 'pedidos',      vital: '#resumen-pedidos' },
    { vista: 'turno',        vital: '#turno-sin-turno' },
    { vista: 'productos',    vital: '#lista-productos' },
    { vista: 'nueva-venta',  vital: '#grid-venta .product-card' },
    { vista: 'mesas',        vital: '#mesas-grid' },
    { vista: 'clientes',     vital: '#lista-clientes-body' },
    { vista: 'ofertas',      vital: '#tabla-descuentos' },
    { vista: 'inventario',   vital: '#tabla-insumos',  premium: true },
    { vista: 'rentabilidad', vital: '#rent-ingreso',   premium: true },
    { vista: 'ajustes',      vital: '#adj-nombre-negocio' },
];

// Las columnas que los bloques 8, 9 y 10 le agregaron a `pedidos`. Si falta una
// sola, no se puede vender: es la lista exacta que estaba vacía antes del arreglo.
const COLUMNAS_DE_PEDIDOS = [
    'descuento_id', 'descuento_puntos_monto', 'puntos_usados',
    'mesa_id', 'comensales',
    'subtotal', 'impuesto', 'tasa_impuesto', 'impuesto_incluido',
    'propina', 'propina_metodo',
];

module.exports = {
    nombre: 'Primer arranque: todas las vistas y la primera venta',
    etiqueta: 'arranque',

    async ejecutar({ app, af }) {
        const w = app.ventana;

        // ── 1. El esquema se construyó ENTERO ───────────────────────────────
        // Se comprueba ANTES de tocar nada: si falta una columna, todo lo demás
        // va a fallar por rebote y el reporte señalaría el síntoma, no la causa.
        const base = leerBase(app.perfil);
        const columnas = await base.columnas('pedidos');
        const faltan = COLUMNAS_DE_PEDIDOS.filter((c) => !columnas.includes(c));
        af.cierto(
            'la tabla `pedidos` nace con sus ' + COLUMNAS_DE_PEDIDOS.length + ' columnas de los bloques 8-10',
            faltan.length === 0,
            'faltan ' + faltan.length + ': ' + faltan.join(', ') +
            ' — mira si alguien quitó el db.serialize de inicializarTablas() (§46)'
        );

        // ── 2. Sin cuenta, la app entra sola y como dueño ───────────────────
        // Es el modo local puro: no hay puestos configurados, así que no debe
        // aparecer ni la pantalla de perfiles ni la de bloqueo de sesión (§7).
        af.igual('entra sin pedir cuenta ni perfil', await w.locator('#perfil-screen').isVisible(), false);
        af.igual('no aparece la pantalla de sesión expirada',
            await w.locator('#bloqueo-sesion-zenit').count(), 0);

        // ── 3. Las 11 vistas del menú se abren y se pintan ──────────────────
        for (const v of VISTAS) {
            await irA(app, v.vista);
            const activa = await w.locator('#view-' + v.vista + '.view.active').count();
            af.igual('la vista ' + v.vista + ' queda activa', activa, 1);

            if (v.premium) {
                // Sin cuenta el plan es `free`, así que la vista tiene que salir
                // con el candado. Que se viera abierta sería un hueco de dinero (§8).
                const candado = await w.locator('#view-' + v.vista + ' .premium-lock-overlay').count();
                af.cierto('la vista ' + v.vista + ' está bloqueada por premium', candado > 0,
                    'no se pintó el candado: sin cuenta esta sección no debería verse');
            } else {
                af.cierto('la vista ' + v.vista + ' pintó su contenido (' + v.vital + ')',
                    await w.locator(v.vital).count() > 0,
                    'el elemento no existe: la vista quedó a medio construir');
            }
        }

        // ── 4. La secuencia que rompía Ofertas (§44.3) ──────────────────────
        // `cambiarTabInventario()` usaba un querySelectorAll GLOBAL, así que tocar
        // una pestaña en Inventario apagaba los paneles de Ofertas, que comparten
        // las clases (.inv-tab / .inv-panel). El bug SOLO aparece en esta SECUENCIA:
        // mirar cada vista por separado la daba por sana. Por eso se recorren en
        // orden y arrastrando el estado, que es la diferencia entre un guion y
        // alguien usando la app.
        //
        // Hace falta premium para entrar a Inventario, así que primero se siembra
        // el plan — es la misma situación del dueño el día que lo encontró.
        await activarPremiumDePrueba(app);

        // La afirmación es la INVARIANTE, no un panel concreto: una vista con
        // pestañas siempre enseña EXACTAMENTE UNO de sus paneles. Comprobar "el
        // panel de descuentos está visible" habría sido un falso positivo en cuanto
        // el recorrido dejara la otra vista en su segunda pestaña — que es
        // legítimo, y no tiene nada que ver con el bug.
        const panelesVisibles = async (vista) =>
            w.locator('#view-' + vista + ' .inv-panel:visible').count();

        await irA(app, 'inventario');
        af.igual('con plan premium, Inventario ya no sale con candado',
            await w.locator('#view-inventario .premium-lock-overlay').count(), 0);
        await w.click('#view-inventario .inv-tab >> nth=1');
        await w.waitForTimeout(400);
        af.igual('Inventario enseña un panel y solo uno', await panelesVisibles('inventario'), 1);

        await irA(app, 'ofertas');
        af.igual('Ofertas sigue enseñando su panel tras pasar por Inventario',
            await panelesVisibles('ofertas'), 1);

        // Y la contaminación tampoco puede ir al revés.
        await w.click('#view-ofertas .inv-tab >> nth=1');
        await w.waitForTimeout(400);
        af.igual('Ofertas cambió de pestaña sin apagarse', await panelesVisibles('ofertas'), 1);
        await irA(app, 'inventario');
        af.igual('Inventario sigue enseñando su panel tras tocar una pestaña de Ofertas',
            await panelesVisibles('inventario'), 1);

        // ── 5. LA PRIMERA VENTA ─────────────────────────────────────────────
        // Una Coca Cola de $25 en efectivo. Es lo mínimo que hace cualquiera al
        // instalar, y es lo que estaba roto.
        const venta = await venderEnMostrador(app, [{ nombre: 'Coca Cola' }], { metodo: 'efectivo' });
        af.dinero('la pantalla cobró la Coca Cola', venta.total, 25);
        af.cierto('la venta devolvió un folio', Number.isInteger(venta.pedidoId),
            'no salió el número de venta: el pedido no llegó a guardarse');

        const pedidos = await base.todas('SELECT id, total, estado, metodo_pago, subtotal, impuesto FROM pedidos');
        af.igual('quedó UN pedido guardado en la primera sesión', pedidos.length, 1);
        if (pedidos.length) {
            af.dinero('el pedido guardado vale lo que se cobró', pedidos[0].total, 25);
            af.igual('el pedido guardó su método de pago', pedidos[0].metodo_pago, 'efectivo');
            af.invarianteImpuesto('el pedido cuadra', pedidos[0]);
        }

        // ── 6. La venta se ve donde el dueño la busca ───────────────────────
        await irA(app, 'pedidos');
        const filas = await w.locator('#lista-pedidos tr').count();
        af.cierto('la venta aparece en el historial de pedidos', filas > 0,
            'la lista de pedidos salió vacía tras vender');

        await irA(app, 'dashboard');
        af.dineroEnPantalla('el tablero ya cuenta la venta del día',
            await w.locator('#dash-ventas-hoy').innerText(), 25);

        await base.cerrar();
    },
};
