/**
 * SMOKE: existencias POR UNIDADES en el modo local (§19.38, 2026-09-17).
 *
 * `productos.stock` se capturaba en el formulario y no hacía NADA: con 5 en
 * existencia se vendían 10 y seguía en 5. Venía del 2026-03-20, cuando se
 * desconectó entero (commit bed4bcd del backend) y se llevó por delante la
 * parte que sí tenía sentido: la de los productos SIN receta — la reventa, y
 * todo el plan free, que no tiene inventario de insumos.
 *
 * Aquí se prueba el ESPEJO LOCAL del desktop, contra SQLite de verdad y con el
 * esquema de verdad, cargando `database/db.js` REAL. Lo que tiene que cumplirse:
 *
 *   · un producto SIN receta descuenta al vender;
 *   · un producto CON receta NO se toca: lo mandan sus insumos, que ya se
 *     descontaron en la línea de arriba (contarlo dos veces sería contar mal);
 *   · `stock = NULL` es SIN CONTROL y no se mueve nunca;
 *   · nunca queda NEGATIVO (en producción quedaron productos en −20);
 *   · descontar y devolver son SIMÉTRICOS (§19.28).
 *
 * ⚠️ COMPROBADO CON DIENTES: ver el final del archivo.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

const RAIZ = path.join(__dirname, '..');
let fallos = 0, ok = 0;

function comprobar(desc, real, esperado) {
    if (JSON.stringify(real) === JSON.stringify(esperado)) { ok++; console.log('  ✓ ' + desc); }
    else {
        fallos++;
        console.log('  ✗ ' + desc +
            '\n      esperado: ' + JSON.stringify(esperado) +
            '\n      real:     ' + JSON.stringify(real));
    }
}

// El db.js real, con un Electron de mentira y un perfil desechable: la base del
// usuario no se toca jamás (§46.2).
const perfil = fs.mkdtempSync(path.join(os.tmpdir(), 'zenit-smoke-stock-'));
const Module = require('module');
const cargarOriginal = Module._load;
Module._load = function (peticion) {
    if (peticion === 'electron') {
        return { app: { getPath: () => perfil, isPackaged: false }, ipcMain: { handle: () => {} } };
    }
    return cargarOriginal.apply(this, arguments);
};
const db = require(path.join(RAIZ, 'database', 'db.js'));
Module._load = cargarOriginal;

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
const conCallback = (fn) => new Promise((res, rej) => fn((err, dato) => (err ? rej(err) : res(dato))));
// Un INSERT devuelve su id en this.lastID, que solo existe si el callback es
// una funcion normal: con una flecha se pierde y el id llega undefined.
const insertar = (fn) => new Promise((res, rej) => fn(function (err) { if (err) rej(err); else res(this.lastID); }));

async function stockDe(id) {
    const grupos = await db.obtenerProductosAgrupados();
    for (const g of grupos) for (const p of g.productos) if (p.id === id) return p.stock;
    return undefined;
}

async function principal() {
    await esperar(2500);   // inicializarTablas + los datos de ejemplo

    console.log('\n── Existencias por unidades (modo local) ──\n');

    // ── Un producto de REVENTA: sin receta, con existencias contadas ────────
    const refrescoId = await insertar((cb) => db.agregarProducto(
        { nombre: 'Refresco 600 ml', descripcion: '', precio: 27.5, stock: 10, clasificacion_id: null, emoji: '🥤', imagen: null }, cb));

    comprobar('el producto nace con las existencias que se capturaron', await stockDe(refrescoId), 10);

    await db.moverUnidadesDeProducto(refrescoId, 3, -1);
    comprobar('vender 3 deja 7', await stockDe(refrescoId), 7);

    await db.moverUnidadesDeProducto(refrescoId, 3, +1);
    comprobar('🔒 devolver esas 3 deja otra vez 10 (simetría, §19.28)', await stockDe(refrescoId), 10);

    await db.moverUnidadesDeProducto(refrescoId, 999, -1);
    comprobar('🔒 vender más de lo que hay NUNCA deja negativo', await stockDe(refrescoId), 0);

    // ── Uno SIN CONTROL: null no se mueve ───────────────────────────────────
    const servicioId = await insertar((cb) => db.agregarProducto(
        { nombre: 'Servicio a domicilio', descripcion: '', precio: 40, stock: null, clasificacion_id: null, emoji: '🛵', imagen: null }, cb));
    comprobar('un producto sin existencias capturadas nace en NULL', await stockDe(servicioId), null);
    await db.moverUnidadesDeProducto(servicioId, 5, -1);
    comprobar('🔒 NULL es SIN CONTROL: vender no lo mueve', await stockDe(servicioId), null);

    // ── Uno CON RECETA: lo mandan sus insumos ───────────────────────────────
    const platoId = await insertar((cb) => db.agregarProducto(
        { nombre: 'Hamburguesa', descripcion: '', precio: 89, stock: 12, clasificacion_id: null, emoji: '🍔', imagen: null }, cb));
    await conCallback((cb) => db.agregarInsumo(
        { nombre: 'Carne', unidad: 'kg', stock_actual: 50, stock_minimo: 1, costo_unitario: 212 }, cb));
    const insumos = await conCallback((cb) => db.obtenerInsumos(cb));
    const carne = insumos.find((i) => i.nombre === 'Carne');
    await conCallback((cb) => db.guardarRecetaProducto(platoId,
        [{ tipo: 'insumo', referencia_id: carne.id, cantidad: 0.2, unidad_receta: 'kg' }], cb));

    await db.moverUnidadesDeProducto(platoId, 4, -1);
    comprobar('🔒 un producto CON receta NO descuenta unidades: mandan sus insumos', await stockDe(platoId), 12);

    // ── Y la venta de verdad, por el camino que usa la caja ─────────────────
    const antesRefresco = await stockDe(refrescoId);
    comprobar('(punto de partida del refresco)', antesRefresco, 0);
    await db.moverUnidadesDeProducto(refrescoId, 25, +1);   // llega mercancía

    const pedidoId = await conCallback((cb) => db.crearPedido(
        { total: 110, metodo_pago: 'efectivo', tipo_pedido: 'mostrador' },
        [{ id: refrescoId, cantidad: 4, precio: 27.5, subtotal: 110 }],
        cb
    ));
    comprobar('🔒 registrar una venta descuenta las unidades', await stockDe(refrescoId), 21);

    await conCallback((cb) => db.actualizarEstadoPedido(pedidoId, 'cancelado', cb));
    await esperar(300);
    comprobar('🔒 cancelarla las devuelve', await stockDe(refrescoId), 25);

    console.log('');
    if (fallos) {
        console.log('❌ ' + fallos + ' de ' + (ok + fallos) + ' comprobaciones FALLARON.\n');
        process.exit(1);
    }
    console.log('✅ ' + ok + ' comprobaciones de las existencias por unidades, todas en verde.\n');
    process.exit(0);
}

principal().catch((e) => {
    console.error('\n❌ ' + (e && e.stack ? e.stack : e) + '\n');
    process.exit(1);
});
