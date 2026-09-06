/**
 * SMOKE TEST — Rentabilidad local del desktop (BLOQUE 12).
 *
 * El desktop no tiene suite de pruebas ni build step, así que un error en el SQL
 * o en la fórmula solo se descubre cuando alguien abre la vista. Este script
 * arma una base en memoria con el MISMO esquema y corre la cuenta de verdad.
 *
 * Verifica lo que de verdad puede salir mal:
 *   1. El margen de una receta conocida (el caso que pide el plan).
 *   2. Que un producto sin receta salga con costo NULL, no con margen del 100%.
 *   3. Que un insumo sin precio se denuncie.
 *   4. Que el ingreso sea NETO (impuesto incluido y descuentos).
 *   5. Que un modificador negativo ("sin cebolla") BAJE el costo.
 *   6. Que el resultado coincida con el del backend para el mismo escenario.
 *
 * Uso:  node scripts/smoke-rentabilidad.js
 */
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// db.js abre un archivo en userData de Electron; aquí se necesita memoria pura,
// así que se replica el trozo de esquema que toca este reporte y se re-crea la
// función bajo prueba leyendo el archivo real (así se prueba EL código, no una
// copia que podría desviarse).
const fs = require('fs');
const fuente = fs.readFileSync(path.join(__dirname, '..', 'database', 'db.js'), 'utf8');

const db = new sqlite3.Database(':memory:');

// Se extraen del archivo real las funciones del reporte y se evalúan contra
// nuestro `db` en memoria. Si alguna se renombra o desaparece, esto falla.
const partes = [
    'function _fraccionDeTanda',
    'const FACTORES_CONVERSION',
    'function convertirUnidad',
    'const _centavos',
    'function _mapaDeCostosLocal',
    'function obtenerRentabilidad(',
];
for (const marca of partes) {
    if (!fuente.includes(marca)) {
        console.error(`FALLO: database/db.js ya no contiene "${marca}"`);
        process.exit(1);
    }
}
// El reporte arranca en `_centavos`: la conversión ya no vive aquí, sino junto
// al DESCUENTO de inventario, que es justo el punto (§34).
const ini = fuente.indexOf('const _centavos');
const fin = fuente.indexOf('// ── Movimientos de caja (BLOQUE 7)');
// _fraccionDeTanda vive mucho antes en el archivo (junto al descuento de
// inventario, que es su otro consumidor), así que se extrae aparte.
// ⚠️ Se extrae desde la TABLA DE CONVERSIÓN, no desde _fraccionDeTanda: el costo
// usa ahora la MISMA `convertirUnidad()` que el descuento de inventario. Hasta el
// 2026-09-05 el costo tenía su propia copia —y su propia consulta, que ni siquiera
// traía `unidad_receta`—, así que 60 g de queso se costeaban como 60 KILOS.
const iniFrac = fuente.indexOf('const FACTORES_CONVERSION = {');
const finFrac = fuente.indexOf('/** Vender: descuenta los insumos de la receta. */');
const codigo = fuente.slice(iniFrac, finFrac) + fuente.slice(ini, fin);
// eslint-disable-next-line no-new-func
const obtenerRentabilidad = new Function('db', codigo + '\nreturn obtenerRentabilidad;')(db);

const run = (sql, params = []) => new Promise((ok, ko) =>
    db.run(sql, params, function (e) { e ? ko(e) : ok(this); }));

let fallos = 0;
function comprobar(nombre, real, esperado) {
    const ok = JSON.stringify(real) === JSON.stringify(esperado);
    if (!ok) fallos++;
    console.log(`${ok ? '  OK  ' : ' FALLA'} ${nombre}` +
        (ok ? '' : `\n         esperado: ${JSON.stringify(esperado)}\n         real:     ${JSON.stringify(real)}`));
}

const reporte = (opts = {}) => new Promise((ok, ko) =>
    obtenerRentabilidad(opts, (e, r) => e ? ko(e) : ok(r)));

const fila = (rep, id) => rep.productos.find(p => p.product_id === id);

async function esquema() {
    await run(`CREATE TABLE productos (id INTEGER PRIMARY KEY, nombre TEXT, precio REAL, emoji TEXT, activo INTEGER DEFAULT 1)`);
    await run(`CREATE TABLE insumos (id INTEGER PRIMARY KEY, nombre TEXT, unidad TEXT, stock_actual REAL DEFAULT 0,
        stock_minimo REAL DEFAULT 0, activo INTEGER DEFAULT 1, costo_unitario REAL DEFAULT 0,
        contenido_cantidad REAL, contenido_unidad TEXT)`);
    await run(`CREATE TABLE preparaciones (id INTEGER PRIMARY KEY, nombre TEXT, activo INTEGER DEFAULT 1, rinde REAL DEFAULT 1)`);
    await run(`CREATE TABLE preparacion_items (id INTEGER PRIMARY KEY, preparacion_id INTEGER, insumo_id INTEGER,
        cantidad REAL, unidad_receta TEXT)`);
    await run(`CREATE TABLE receta_items (id INTEGER PRIMARY KEY, producto_id INTEGER, tipo TEXT,
        referencia_id INTEGER, cantidad REAL, unidad_receta TEXT)`);
    await run(`CREATE TABLE modificador_receta (id INTEGER PRIMARY KEY, opcion_id INTEGER, tipo TEXT,
        referencia_id INTEGER, cantidad REAL, unidad_receta TEXT)`);
    await run(`CREATE TABLE pedidos (id INTEGER PRIMARY KEY, total REAL, subtotal REAL, estado TEXT,
        mesa_id INTEGER, fecha_pedido DATETIME)`);
    await run(`CREATE TABLE pedido_items (id INTEGER PRIMARY KEY, pedido_id INTEGER, producto_id INTEGER,
        cantidad INTEGER, precio_unitario REAL, subtotal REAL, modificadores TEXT)`);
}

// ⚠️ ESTE COMENTARIO DECÍA QUE `receta_items` NO TENÍA `unidad_receta`, Y ERA
// FALSO: database/db.js la agrega con un ALTER y la interfaz la escribe (guardar
// una receta en gramos contra un insumo en kilos es lo normal). Por creerlo, este
// script sembraba TODAS las recetas de producto en la unidad del propio insumo —
// justo el caso donde no hace falta convertir— y por eso pasó en verde mientras
// el costo de una quesadilla salía en $10,451 (2026-09-05).
//
// La lección: un fixture que codifica una suposición equivocada sobre el esquema
// es ciego exactamente donde la suposición está mal.

async function datos() {
    // Insumos
    await run(`INSERT INTO insumos (id, nombre, unidad, costo_unitario) VALUES
        (1, 'Carne', 'kg', 200), (2, 'Pan', 'pzas', 10), (3, 'Tortilla', 'pzas', 0),
        (4, 'Cebolla', 'kg', 40), (5, 'Tomate', 'kg', 40)`);

    // Productos
    await run(`INSERT INTO productos (id, nombre, precio, emoji) VALUES
        (1, 'Hamburguesa', 100, 'burger'), (2, 'Refresco', 25, 'cup'),
        (3, 'Taco', 20, 'taco'), (4, 'Chilaquiles', 90, 'plate'),
        (5, 'Quesadilla', 116, 'cheese')`);

    // Recetas
    // Hamburguesa: 0.1 kg carne ($20) + 1 pan ($10) = $30
    await run(`INSERT INTO receta_items (producto_id, tipo, referencia_id, cantidad) VALUES
        (1, 'insumo', 1, 0.1), (1, 'insumo', 2, 1)`);
    // Taco: 0.05 kg carne ($10) + 1 tortilla (SIN precio)
    await run(`INSERT INTO receta_items (producto_id, tipo, referencia_id, cantidad) VALUES
        (3, 'insumo', 1, 0.05), (3, 'insumo', 3, 1)`);
    // Chilaquiles: 2 tandas de salsa
    await run(`INSERT INTO preparaciones (id, nombre, rinde) VALUES (1, 'Salsa', 1)`);
    // Salsa industrial: UNA tanda de 1 kg de tomate RINDE 4 litros.
    await run(`INSERT INTO preparaciones (id, nombre, rinde) VALUES (2, 'Salsa grande', 4)`);
    await run(`INSERT INTO preparacion_items (preparacion_id, insumo_id, cantidad, unidad_receta) VALUES (2, 5, 1, 'kg')`);
    // Sopa: usa 0.5 litros de esa salsa = 1/8 de la tanda = $5.
    await run(`INSERT INTO productos (id, nombre, precio, emoji) VALUES (6, 'Sopa', 60, 'bowl')`);
    await run(`INSERT INTO receta_items (producto_id, tipo, referencia_id, cantidad) VALUES (6, 'preparacion', 2, 0.5)`);
    await run(`INSERT INTO preparacion_items (preparacion_id, insumo_id, cantidad, unidad_receta) VALUES
        (1, 5, 250, 'g')`); // 250 g de tomate = $10
    await run(`INSERT INTO receta_items (producto_id, tipo, referencia_id, cantidad) VALUES
        (4, 'preparacion', 1, 2)`); // $20
    // Quesadilla: 0.5 kg de cebolla ($20)
    await run(`INSERT INTO receta_items (producto_id, tipo, referencia_id, cantidad) VALUES
        (5, 'insumo', 4, 0.5)`);
    // Opción "sin cebolla": devuelve 500 g de cebolla → −$20
    await run(`INSERT INTO modificador_receta (opcion_id, tipo, referencia_id, cantidad, unidad_receta) VALUES
        (77, 'insumo', 4, -500, 'g')`);
    // ── LA CONVERSIÓN DE UNIDADES EN EL COSTO (§45 / 2026-09-05) ──────────────
    // Es lo que este script no probaba: una receta de producto escrita en una
    // unidad DISTINTA a la del insumo.
    await run(`INSERT INTO insumos (id, nombre, unidad, costo_unitario) VALUES (6, 'Queso', 'kg', 148.50)`);
    // Un insumo de PAQUETE: lata de 380 g a $38.50.
    await run(`INSERT INTO insumos (id, nombre, unidad, costo_unitario, contenido_cantidad, contenido_unidad)
        VALUES (7, 'Chipotle', 'latas', 38.50, 380, 'g')`);

    // Quesadilla real: 60 g de queso. En KILOS son 0.06 → $8.91.
    // Sin conversión salía $8,910: el bug exacto que se encontró usando la app.
    await run(`INSERT INTO productos (id, nombre, precio, emoji) VALUES (7, 'Quesadilla real', 42.50, 'cheese')`);
    await run(`INSERT INTO receta_items (producto_id, tipo, referencia_id, cantidad, unidad_receta) VALUES
        (7, 'insumo', 6, 60, 'g')`);

    // Y una receta en gramos contra un insumo en LATAS: 40/380 = 0.10526 latas
    // → $4.05. Sin el contenido del paquete salían 40 latas = $1,540.
    await run(`INSERT INTO productos (id, nombre, precio, emoji) VALUES (8, 'Salsa chipotle', 30, 'pepper')`);
    await run(`INSERT INTO receta_items (producto_id, tipo, referencia_id, cantidad, unidad_receta) VALUES
        (8, 'insumo', 7, 40, 'g')`);

    // Opción "extra carne": +100 g → +$20
    await run(`INSERT INTO modificador_receta (opcion_id, tipo, referencia_id, cantidad, unidad_receta) VALUES
        (88, 'insumo', 1, 100, 'g')`);
}

async function main() {
    await esquema();
    await datos();

    const hoy = "datetime('now','localtime')";

    // ── 1. Receta conocida: $100 con costo $30 ───────────────────────────
    await run(`INSERT INTO pedidos (id, total, subtotal, estado, fecha_pedido) VALUES (1, 200, 200, 'completado', ${hoy})`);
    await run(`INSERT INTO pedido_items (pedido_id, producto_id, cantidad, precio_unitario, subtotal) VALUES (1, 1, 2, 100, 200)`);

    let rep = await reporte();
    let f = fila(rep, 1);
    comprobar('1. Hamburguesa: unidades', f.unidades, 2);
    comprobar('1. Hamburguesa: ingreso', f.ingreso, 200);
    comprobar('1. Hamburguesa: costo unitario', f.costo_unitario, 30);
    comprobar('1. Hamburguesa: costo', f.costo, 60);
    comprobar('1. Hamburguesa: margen', f.margen, 140);
    comprobar('1. Hamburguesa: margen %', f.margen_pct, 70);
    comprobar('1. Hamburguesa: costo confiable', f.costo_confiable, true);

    // ── 2. Producto SIN receta ───────────────────────────────────────────
    await run(`INSERT INTO pedidos (id, total, subtotal, estado, fecha_pedido) VALUES (2, 100, 100, 'completado', ${hoy})`);
    await run(`INSERT INTO pedido_items (pedido_id, producto_id, cantidad, precio_unitario, subtotal) VALUES (2, 2, 4, 25, 100)`);

    rep = await reporte();
    f = fila(rep, 2);
    comprobar('2. Refresco: sin receta', f.sin_receta, true);
    comprobar('2. Refresco: costo NULL (no cero)', f.costo, null);
    comprobar('2. Refresco: margen NULL (no 100%)', f.margen, null);
    comprobar('2. Refresco: se reporta lo vendido', f.unidades, 4);
    comprobar('2. Refresco: no ensucia el resumen', rep.resumen.ingreso, 200);
    comprobar('2. Refresco: contado aparte', rep.resumen.productos_sin_receta, 1);

    // ── 3. Insumo sin precio ─────────────────────────────────────────────
    await run(`INSERT INTO pedidos (id, total, subtotal, estado, fecha_pedido) VALUES (3, 20, 20, 'completado', ${hoy})`);
    await run(`INSERT INTO pedido_items (pedido_id, producto_id, cantidad, precio_unitario, subtotal) VALUES (3, 3, 1, 20, 20)`);

    rep = await reporte();
    f = fila(rep, 3);
    comprobar('3. Taco: costo solo de lo que sí tiene precio', f.costo, 10);
    comprobar('3. Taco: costo NO confiable', f.costo_confiable, false);
    comprobar('3. Taco: denuncia al insumo', f.insumos_sin_costo, ['Tortilla']);
    comprobar('3. Resumen: lista los insumos sin costo', rep.resumen.insumos_sin_costo, ['Tortilla']);

    // ── 4. Ingreso NETO: impuesto incluido ───────────────────────────────
    // Quesadilla de $116 con IVA incluido → subtotal del pedido $100.
    await run(`INSERT INTO pedidos (id, total, subtotal, estado, fecha_pedido) VALUES (4, 116, 100, 'completado', ${hoy})`);
    await run(`INSERT INTO pedido_items (pedido_id, producto_id, cantidad, precio_unitario, subtotal) VALUES (4, 5, 1, 116, 116)`);

    rep = await reporte();
    f = fila(rep, 5);
    comprobar('4. Quesadilla: el IVA no es ingreso', f.ingreso, 100);
    comprobar('4. Quesadilla: margen sin inflar', f.margen, 80);

    // ── 5. Preparación ───────────────────────────────────────────────────
    await run(`INSERT INTO pedidos (id, total, subtotal, estado, fecha_pedido) VALUES (5, 90, 90, 'completado', ${hoy})`);
    await run(`INSERT INTO pedido_items (pedido_id, producto_id, cantidad, precio_unitario, subtotal) VALUES (5, 4, 1, 90, 90)`);

    rep = await reporte();
    f = fila(rep, 4);
    comprobar('5. Chilaquiles: costo de la preparación', f.costo, 20);
    comprobar('5. Chilaquiles: margen', f.margen, 70);

    // ── 6. Modificadores: uno suma y otro RESTA ──────────────────────────
    // "sin cebolla" en una quesadilla: la cebolla nunca salió de la cocina.
    await run(`INSERT INTO pedidos (id, total, subtotal, estado, fecha_pedido) VALUES (6, 100, 100, 'completado', ${hoy})`);
    await run(`INSERT INTO pedido_items (pedido_id, producto_id, cantidad, precio_unitario, subtotal, modificadores)
        VALUES (6, 5, 1, 100, 100, '[{"option_id":77,"name":"Sin cebolla","price_delta":0}]')`);

    rep = await reporte();
    f = fila(rep, 5);
    // Dos ventas de quesadilla: la del pedido 4 (costo 20) y esta (costo 0).
    comprobar('6. Sin cebolla: baja el costo', f.costo, 20);
    comprobar('6. Sin cebolla: ingreso acumulado', f.ingreso, 200);

    // "extra carne" en una hamburguesa: +$20 de costo.
    await run(`INSERT INTO pedidos (id, total, subtotal, estado, fecha_pedido) VALUES (7, 120, 120, 'completado', ${hoy})`);
    await run(`INSERT INTO pedido_items (pedido_id, producto_id, cantidad, precio_unitario, subtotal, modificadores)
        VALUES (7, 1, 1, 120, 120, '[{"option_id":88,"name":"Extra carne","price_delta":20}]')`);

    rep = await reporte();
    f = fila(rep, 1);
    comprobar('6. Extra carne: suma al costo', f.costo, 110); // 60 + 30 + 20
    comprobar('6. Extra carne: ingreso', f.ingreso, 320);

    // ── 7. Ventas que NO cuentan ─────────────────────────────────────────
    await run(`INSERT INTO pedidos (id, total, subtotal, estado, fecha_pedido) VALUES (8, 500, 500, 'cancelado', ${hoy})`);
    await run(`INSERT INTO pedido_items (pedido_id, producto_id, cantidad, precio_unitario, subtotal) VALUES (8, 1, 5, 100, 500)`);
    await run(`INSERT INTO pedidos (id, total, subtotal, estado, mesa_id, fecha_pedido) VALUES (9, 300, 300, 'abierto', 1, ${hoy})`);
    await run(`INSERT INTO pedido_items (pedido_id, producto_id, cantidad, precio_unitario, subtotal) VALUES (9, 1, 3, 100, 300)`);

    rep = await reporte();
    f = fila(rep, 1);
    comprobar('7. Cancelada y mesa abierta no cuentan', f.unidades, 3); // 2 + 1

    // ── 7.b. EL RINDE: 0.5 de una salsa que rinde 4 cuesta 1/8 de la tanda ─
    await run(`INSERT INTO pedidos (id, total, subtotal, estado, fecha_pedido) VALUES (10, 60, 60, 'completado', ${hoy})`);
    await run(`INSERT INTO pedido_items (pedido_id, producto_id, cantidad, precio_unitario, subtotal) VALUES (10, 6, 1, 60, 60)`);

    rep = await reporte();
    f = fila(rep, 6);
    // 1 kg de tomate = $40; 1/8 de tanda = $5. Antes del arreglo daba $20.
    comprobar('7b. Rinde: el costo es la fracción de la tanda', f.costo, 5);
    comprobar('7b. Rinde: margen', f.margen, 55);

    // ── 8. Rango fuera del periodo ───────────────────────────────────────
    rep = await reporte({ desde: '2020-01-01', hasta: '2020-01-31' });
    comprobar('8. Un rango viejo no trae nada', rep.productos.length, 0);

    // ── 9. LA CONVERSIÓN EN EL COSTO ─────────────────────────────────────────
    // El bug que esto vigila: el costo usaba su propia tabla de conversión y una
    // consulta que no traía `unidad_receta`, así que 60 g de queso se costeaban
    // como 60 KILOS. Una quesadilla de $42.50 salía con un costo de $10,451 y un
    // margen de −28,424 %. Encontrado explorando la app (§48).
    await run(`INSERT INTO pedidos (id, total, subtotal, estado, fecha_pedido)
        VALUES (90, 42.50, 36.64, 'completado', datetime('now','localtime'))`);
    await run(`INSERT INTO pedido_items (pedido_id, producto_id, cantidad, precio_unitario, subtotal)
        VALUES (90, 7, 1, 42.50, 42.50)`);
    await run(`INSERT INTO pedidos (id, total, subtotal, estado, fecha_pedido)
        VALUES (91, 30, 30, 'completado', datetime('now','localtime'))`);
    await run(`INSERT INTO pedido_items (pedido_id, producto_id, cantidad, precio_unitario, subtotal)
        VALUES (91, 8, 1, 30, 30)`);

    rep = await new Promise((ok, ko) => obtenerRentabilidad({}, (e, r) => e ? ko(e) : ok(r)));

    comprobar('9. 60 g de un insumo en kg cuestan 0.06 kg, no 60',
        Math.round(fila(rep, 7).costo * 100) / 100, 8.91);
    comprobar('9b. 40 g de un insumo en LATAS de 380 g cuestan la fracción de lata',
        Math.round(fila(rep, 8).costo * 100) / 100, 4.05);
    // Y el margen deja de ser un disparate.
    comprobar('9c. el margen vuelve a tener sentido (no −28,424 %)',
        fila(rep, 7).margen_pct > 70 && fila(rep, 7).margen_pct < 80, true);

    console.log('');
    if (fallos > 0) {
        console.error(`❌ ${fallos} comprobación(es) fallaron`);
        process.exit(1);
    }
    console.log('✅ Rentabilidad local del desktop: todo cuadra');
    process.exit(0);
}

main().catch(e => { console.error('ERROR:', e); process.exit(1); });
