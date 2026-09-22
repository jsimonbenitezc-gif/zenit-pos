/**
 * SMOKE: la promo en el DESKTOP — carrito, subida, mesas y base local
 * (PLAN_OFERTAS_V1, Bloque 2).
 *
 *     node scripts/smoke-promos.js
 *
 * La regla del precio ya la compara `smoke-promos-gemelas.js` contra el
 * servidor. Esto prueba lo que es SOLO del desktop, y que es donde se pierde el
 * dinero sin que ninguna fórmula esté mal:
 *   · que el renglón del carrito, al guardarse y al subirse, conserve lo cobrado;
 *   · que el descuento de la cuenta use la MISMA base que el servidor (§3.4);
 *   · que la promo fuera de su día NO se ofrezca, y la agotada tampoco (trampa 8);
 *   · que la clave del carrito de mesa no funda una promo con un taco suelto
 *     (trampa 2), que el nombre de la promo sobreviva al GROUP_CONCAT (trampa 3)
 *     y que quitar un taco de la promo quite la promo entera (trampa 4);
 *   · que dividir la cuenta no parta la promo (trampa 5);
 *   · que la sincronización guarde la forma nueva sin romper la vieja (trampa 1).
 *
 * Se cargan los archivos REALES (pos/modulo-promos.js entero, funciones de
 * pos/modulo-mesas.js, y database/db.js contra una SQLite de verdad en una
 * carpeta temporal). Si algo se renombra, falla en vez de pasar en falso.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');

const RAIZ = path.join(__dirname, '..');
let fallos = 0, ok = 0;
function comprobar(desc, real, esperado) {
    const iguales = JSON.stringify(real) === JSON.stringify(esperado);
    if (iguales) { ok++; console.log('  ✓ ' + desc); }
    else { fallos++; console.log('  ✗ ' + desc + '\n      esperado: ' + JSON.stringify(esperado) + '\n      real:     ' + JSON.stringify(real)); }
}

function extraer(archivo, nombres) {
    const src = fs.readFileSync(path.join(RAIZ, 'pos', archivo), 'utf8');
    let out = '';
    for (const n of nombres) {
        const marca = 'function ' + n + '(';
        const i = src.indexOf(marca);
        if (i < 0) throw new Error('No existe ' + n + '() en ' + archivo + ' (¿se renombró?)');
        let j = src.indexOf('{', src.indexOf(')', i)), prof = 0, fin = -1;
        for (let k = j; k < src.length; k++) {
            if (src[k] === '{') prof++;
            else if (src[k] === '}') { prof--; if (prof === 0) { fin = k + 1; break; } }
        }
        out += src.slice(i, fin) + '\n';
    }
    return out;
}

// ── El negocio de prueba: una taquería con precios que no dividen bonito ─────
const TACOS = 1, BEBIDAS = 2;
const PRODUCTOS = [
    { id: 10, nombre: 'Pastor',    precio: 25, clasificacion_id: TACOS,   stock: null },
    { id: 11, nombre: 'Arrachera', precio: 35, clasificacion_id: TACOS,   stock: null },
    { id: 12, nombre: 'Suadero',   precio: 28, clasificacion_id: TACOS,   stock: 0 },   // agotado
    { id: 20, nombre: 'Refresco',  precio: 20, clasificacion_id: BEBIDAS, stock: 5 },
];
const HOY = new Date();
const MANANA = new Date(HOY.getTime() + 86400000);
const PROMO_2X1 = {
    id: 7, name: '2x1 | tacos; ~martes', tipo: 'regalar_mas_barato', price: 0, paga: 1, lleva: 2,
    calendario: { dias: [HOY.getDay()] }, active: true,
    huecos: [{ quantity: 2, product_ids: [], category_id: TACOS }],
};

let contadorUuid = 0;
const sb = {
    console, Date, Math, JSON, Intl, Set, Map,
    productosGlobales: PRODUCTOS.map(p => ({ ...p })),
    clasificaciones: [{ id: TACOS, nombre: 'Tacos', productos: [] }, { id: BEBIDAS, nombre: 'Bebidas', productos: [] }],
    carrito: [],
    _generarUuid: () => 'uuid-' + (++contadorUuid),
    puedeAccederPremium: () => true,
    esc: (t) => String(t == null ? '' : t),
    window: { api: {} },
};
vm.createContext(sb);
vm.runInContext(fs.readFileSync(path.join(RAIZ, 'pos', 'modulo-modificadores.js'), 'utf8'), sb);
vm.runInContext(fs.readFileSync(path.join(RAIZ, 'pos', 'modulo-promos.js'), 'utf8') +
    '\n;this.__fijarPromos = (l) => { promosNegocio = l; }; this.__fijarAcum = (v) => { ofertasAcumulables = v; };', sb);
vm.runInContext(
    'const _fmtMesa = (v) => "$" + parseFloat(v || 0).toFixed(2);\n' +
    extraer('modulo-mesas.js', [
        '_escaparMods', '_desescaparMods', '_parsearItemsMesa', '_normalizarPedidoApi',
        '_claveCarritoMesa', '_claveCarritoPromoMesa', '_unidadesDeLaCuenta',
        '_filasTicketMesa', '_filaAhorroMesa',
    ]), sb);
sb.__fijarPromos([PROMO_2X1]);

const pastor = { id: 10, nombre: 'Pastor', precio: 25, modificadores: [] };
const arrachera = { id: 11, nombre: 'Arrachera', precio: 35, modificadores: [] };
const quesoExtra = [{ option_id: 3, group_id: 1, group: 'Extras', name: 'Queso extra', price_delta: 10 }];

console.log('\n── 1. El renglón del carrito ──');
const renglon = sb.armarRenglonPromo(PROMO_2X1, [pastor, arrachera]);
comprobar('un 2x1 de pastor $25 + arrachera $35 cobra $35', renglon.precio, 35);
comprobar('repartido 14.58 + 20.42, en proporción a su precio', renglon.productos.map(p => p.parte), [14.58, 20.42]);
comprobar('y dice cuánto ahorra el cliente', renglon.ahorro, 25);
const conQueso = sb.armarRenglonPromo(PROMO_2X1, [{ ...pastor, modificadores: quesoExtra }, arrachera]);
comprobar('el queso extra del taco regalado SE COBRA, completo, encima', conQueso.precio, 45);
comprobar('sin mover la parte del reparto', conQueso.productos.map(p => [p.parte, p.precio]), [[14.58, 24.58], [20.42, 20.42]]);
const otra = sb.armarRenglonPromo(PROMO_2X1, [pastor, arrachera]);
comprobar('dos 2x1 iguales son dos GRUPOS distintos', renglon.promo_group !== otra.promo_group, true);

console.log('\n── 2. Guardado (un renglón por producto) y subida (UN renglón de promo) ──');
const refresco = { id: 20, nombre: 'Refresco', precio: 20, precio_base: 20, modificadores: [], nota: '' };
const plano = sb.aplanarCarrito([conQueso, refresco]);
comprobar('la promo se guarda como dos renglones + el refresco suelto', plano.length, 3);
comprobar('cada renglón de la promo lleva su grupo, su nombre y su precio de lista',
    plano.slice(0, 2).map(p => [p.promo_group === conQueso.promo_group, p.promo_name, p.precio_lista, p.precio_base, p.precio]),
    [[true, PROMO_2X1.name, 25, 14.58, 24.58], [true, PROMO_2X1.name, 35, 20.42, 20.42]]);
comprobar('el suelto NO lleva nada de promo', plano[2].promo_group, undefined);
// Como los lee modulo-sync de la SQLite (nombres de columna).
const filas = plano.map(p => ({
    producto_id: p.id, cantidad: 1, precio_unitario: p.precio, precio_base: p.precio_base, subtotal: p.subtotal,
    nota_item: p.nota, modificadores: p.modificadores.length ? JSON.stringify(p.modificadores) : null,
    promo_id: p.promo_id, promo_group: p.promo_group, promo_name: p.promo_name, precio_lista: p.precio_lista,
}));
const subida = sb.renglonesParaSubir(filas, (i) => ({ product_id: i.producto_id, quantity: i.cantidad, unit_price: i.precio_base }));
comprobar('sube UN renglón de promo y uno suelto, en ese orden', subida.map(r => r.promo_id ? 'promo' : 'suelto'), ['promo', 'suelto']);
comprobar('🔴 lo que se cobró de la promo (sin extras) es promo_price = $35', subida[0].promo_price, 35);
comprobar('con el precio de lista de cada taco y sus extras congelados',
    subida[0].productos.map(p => [p.product_id, p.list_price, (p.modifiers || []).length]), [[10, 25, 1], [11, 35, 0]]);

// Y el servidor, con eso, reparte EXACTAMENTE igual (venta diferida, §26).
const RUTA_SERVIDOR = path.join(RAIZ, '..', 'zenit-pos-backend', 'utils', 'promos.js');
if (fs.existsSync(RUTA_SERVIDOR)) {
    const servidor = require(RUTA_SERVIDOR);
    const armadaServidor = servidor.armarPromo(
        { tipo: 'regalar_mas_barato', paga: 1 },
        subida[0].productos.map(p => ({ precio: p.list_price, delta: sb.deltaDeModificadores(p.modifiers) })),
        subida[0].promo_price
    );
    comprobar('el servidor saca las MISMAS partes y el mismo total con lo que sube el desktop',
        [armadaServidor.renglones.map(r => r.unit_price), armadaServidor.total],
        [conQueso.productos.map(p => p.precio), conQueso.precio]);
} else {
    console.log('  ⏭️  (sin el repo del backend al lado: no se compara el reparto del servidor)');
}

console.log('\n── 3. Ticket, historial y "Ahorraste" ──');
const grupos = sb.agruparRenglones(filas);
comprobar('el ticket junta la promo en UN renglón y deja el refresco aparte',
    grupos.map(g => g.promo ? ['promo', g.promo.total, g.items.length] : ['item', g.item.producto_id]),
    [['promo', 45, 2], ['item', 20]]);
comprobar('"Ahorraste" = precio de lista − lo cobrado por la promo (los extras no cuentan)', sb.ahorroDePromos(filas), 25);
comprobar('una venta sin promos no ahorra nada', sb.ahorroDePromos(filas.slice(2)), 0);

console.log('\n── 4. Juntar ofertas: la base del descuento (§3.4) ──');
const carritoMixto = [renglon, refresco];
sb.__fijarAcum(false);
comprobar('apagado (de fábrica): el 10% solo alcanza al refresco → base $20', sb.baseDescuentoDe(carritoMixto), 20);
sb.__fijarAcum(true);
comprobar('encendido: alcanza a toda la cuenta → base $55', sb.baseDescuentoDe(carritoMixto), 55);
sb.__fijarAcum(false);

console.log('\n── 5. Qué se ofrece AHORA ──');
comprobar('la promo del día de hoy se ofrece', sb.promosActivasAhora(HOY).map(p => p.id), [7]);
comprobar('🔴 mañana ya NO existe en la pantalla', sb.promosActivasAhora(MANANA).map(p => p.id), []);
comprobar('en la hoja de elección no sale el suadero agotado (trampa 8)',
    sb.productosDelHueco(PROMO_2X1.huecos[0]).map(p => p.nombre), ['Pastor', 'Arrachera']);
comprobar('pero un producto SIN control de existencias sí sale (NULL no es cero)',
    sb.productosDelHueco(PROMO_2X1.huecos[0]).some(p => p.stock === null), true);
const soloAgotados = { ...PROMO_2X1, id: 8, huecos: [{ quantity: 2, product_ids: [12], category_id: null }] };
sb.__fijarPromos([PROMO_2X1, soloAgotados]);
comprobar('una promo en la que ya no queda nada elegible no se enseña', sb.promosActivasAhora(HOY).map(p => p.id), [7]);
const malArmada = { ...PROMO_2X1, id: 9, paga: 2 };
sb.__fijarPromos([PROMO_2X1, malArmada]);
comprobar('un "2x1" que cobra 2 de 2 no se ofrece', sb.promosActivasAhora(HOY).map(p => p.id), [7]);
sb.__fijarPromos([PROMO_2X1]);
comprobar('un descuento "los lunes" solo vale el lunes',
    [sb.descuentoVigenteLocal({ calendario: JSON.stringify({ dias: [HOY.getDay()] }) }, HOY),
     sb.descuentoVigenteLocal({ calendario: JSON.stringify({ dias: [HOY.getDay()] }) }, MANANA),
     sb.descuentoVigenteLocal({ calendario: null }, MANANA)],
    [true, false, true]);

console.log('\n── 6. La sugerencia "¿Convertir a 2x1?" ──');
const suelto = (p) => ({ id: p.id, nombre: p.nombre, precio: p.precio, precio_base: p.precio, modificadores: [], nota: '' });
const cSug = [suelto(PRODUCTOS[0]), suelto(PRODUCTOS[3]), suelto(PRODUCTOS[1])];
const sug = sb.sugerirPromo(cSug);
comprobar('con pastor + refresco + arrachera sueltos, sugiere el 2x1 y ahorra $25',
    sug && [sug.promo.id, sug.indices.slice().sort(), sug.ahorro], [7, [0, 2], 25]);
comprobar('con un solo taco no sugiere nada', sb.sugerirPromo([suelto(PRODUCTOS[0]), suelto(PRODUCTOS[3])]), null);
comprobar('ni cuando la promo no está en su día', sb.sugerirPromo(cSug, sb.promosActivasAhora(MANANA)), null);
const cTres = [suelto(PRODUCTOS[0]), suelto(PRODUCTOS[1]), suelto(PRODUCTOS[1])];
comprobar('con tres tacos elige la pareja que MÁS le ahorra al cliente (arrachera + arrachera)',
    sb.sugerirPromo(cTres).ahorro, 35);
const convertido = sb.convertirEnPromo(cSug, sug);
comprobar('convertir deja el refresco suelto y UNA promo de $35',
    convertido.map(i => i.tipo === 'promo' ? ['promo', i.precio] : ['suelto', i.id]), [['suelto', 20], ['promo', 35]]);
comprobar('y ya no sugiere otra vez lo mismo', sb.sugerirPromo(convertido), null);

console.log('\n── 7. Mesas: la clave del carrito, el GROUP_CONCAT y la división ──');
comprobar('🔴 la promo NO comparte clave con el taco suelto (trampa 2)',
    sb._claveCarritoPromoMesa(renglon) !== sb._claveCarritoMesa(10, []) &&
    sb._claveCarritoPromoMesa(renglon) !== sb._claveCarritoPromoMesa(otra), true);
// Lo que armaría el SQL de obtenerPedidoAbiertoPorMesa, con el nombre del dueño
// cargado de separadores a propósito.
const apiOrder = {
    id: 1, items: [
        { id: 101, product: { id: 10, name: 'Pastor' }, quantity: 1, unit_price: 14.58, subtotal: 14.58, base_unit_price: 14.58, promo_group: 'g-1', promo_name: PROMO_2X1.name, list_price: 25, promo_id: 7 },
        { id: 102, product: { id: 11, name: 'Arrachera' }, quantity: 1, unit_price: 20.42, subtotal: 20.42, base_unit_price: 20.42, promo_group: 'g-1', promo_name: PROMO_2X1.name, list_price: 35, promo_id: 7 },
        { id: 103, product: { id: 20, name: 'Refresco' }, quantity: 2, unit_price: 20, subtotal: 40 },
    ],
};
const itemsMesa = sb._parsearItemsMesa(sb._normalizarPedidoApi(apiOrder).items_raw);
comprobar('el nombre con "|", ";" y "~" vuelve EXACTO del items_raw (trampa 3)',
    itemsMesa.map(i => i.promo_name), [PROMO_2X1.name, PROMO_2X1.name, null]);
comprobar('y cada renglón conserva su grupo, su lista y su promo',
    itemsMesa.map(i => [i.id, i.promo_group, i.precio_lista, i.promo_id]),
    [[101, 'g-1', 25, 7], [102, 'g-1', 35, 7], [103, null, null, null]]);
sb._itemsDeLaCuenta = () => itemsMesa;
const unidades = sb._unidadesDeLaCuenta();
comprobar('al dividir, la promo es UNA unidad de $35 y va entera a un pago (trampa 5)',
    unidades.filter(u => u.item_ids).map(u => [u.subtotal, u.item_ids]), [[35, [101, 102]]]);
comprobar('y los dos refrescos siguen siendo dos unidades', unidades.filter(u => !u.item_ids).length, 2);
comprobar('el ticket de la mesa dice "Ahorraste $25"', /Ahorraste.*\$25\.00/.test(sb._filaAhorroMesa(itemsMesa)), true);
comprobar('y enseña la promo como UN renglón de $35', /1× 2x1 \| tacos; ~martes[\s\S]*\$35\.00/.test(sb._filasTicketMesa(itemsMesa)), true);

// ═══════════════════════════════════════════════════════════════════════════
// 8. Contra una SQLite de VERDAD, con el esquema de verdad
// ═══════════════════════════════════════════════════════════════════════════
const perfil = fs.mkdtempSync(path.join(os.tmpdir(), 'zenit-smoke-promos-'));
process.env.ZENIT_TEST_USERDATA = perfil;
const Module = require('module');
const cargarOriginal = Module._load;
Module._load = function (peticion) {
    if (peticion === 'electron') return { app: { getPath: () => perfil, isPackaged: false }, ipcMain: { handle: () => {} } };
    return cargarOriginal.apply(this, arguments);
};
const db = require(path.join(RAIZ, 'database', 'db.js'));
Module._load = cargarOriginal;
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
const cb = (fn) => new Promise((res, rej) => fn((err, dato) => (err ? rej(err) : res(dato))));
const run = (sql, p = []) => new Promise((res, rej) => db.db.run(sql, p, function (e) { e ? rej(e) : res(this); }));
const all = (sql, p = []) => new Promise((res, rej) => db.db.all(sql, p, (e, r) => (e ? rej(e) : res(r))));

async function conBase() {
    await esperar(2500);   // inicializarTablas + datos de ejemplo
    for (const p of PRODUCTOS) {
        await run('INSERT OR REPLACE INTO productos (id, nombre, precio, stock, clasificacion_id, activo) VALUES (?, ?, ?, ?, ?, 1)',
            [p.id, p.nombre, p.precio, p.stock, p.clasificacion_id]);
    }

    console.log('\n── 8. La base local ──');
    // Venta de mostrador guardada y leída como la lee la subida.
    const pedidoId = await cb((c) => db.crearPedido({ total: 65, metodo_pago: 'efectivo', tipo_pedido: 'comer' },
        plano.map(p => ({ ...p, cantidad: 1 })), c, { skipStock: true }));
    const guardados = await cb((c) => db.obtenerItemsPedido(pedidoId, c));
    comprobar('crearPedido guarda el grupo, el nombre y el precio de lista de la promo',
        guardados.map(g => [g.promo_group === conQueso.promo_group, g.promo_name, g.precio_lista, g.precio_base]),
        [[true, PROMO_2X1.name, 25, 14.58], [true, PROMO_2X1.name, 35, 20.42], [false, null, null, 20]]);
    const deVuelta = sb.renglonesParaSubir(guardados, (i) => ({ product_id: i.producto_id }));
    comprobar('lo que se sube desde la base sigue siendo UNA promo de $35', [deVuelta.length, deVuelta[0].promo_price], [2, 35]);
    const detalle = await cb((c) => db.obtenerDetallesPedido(pedidoId, c));
    comprobar('el detalle del ticket trae lo que necesita el "Ahorraste"', sb.ahorroDePromos(detalle), 25);

    // Mesa en modo local: agregar la promo, leerla, quitarla.
    const mesa = await run("INSERT INTO mesas (nombre, zona, capacidad) VALUES ('M1', 'Interior', 4)");
    const pedidoMesa = await cb((c) => db.abrirPedidoMesa(mesa.lastID, 'M1', 'Lupita', 2, null, { tasa: 0, incluido: true }, c));
    for (const p of plano.slice(0, 2)) {
        await cb((c) => db.agregarItemMesa(pedidoMesa, p.id, 1, p.precio, null, c, p.modificadores, p.precio_base,
            { promo_id: p.promo_id, promo_group: p.promo_group, promo_name: p.promo_name, precio_lista: p.precio_lista }));
    }
    await cb((c) => db.agregarItemMesa(pedidoMesa, 20, 1, 20, null, c, [], 20));
    const abierta = await cb((c) => db.obtenerPedidoAbiertoPorMesa(mesa.lastID, c));
    const itemsSql = sb._parsearItemsMesa(abierta.items_raw);
    comprobar('🔴 el nombre de la promo sale ENTERO del GROUP_CONCAT real (trampa 3)',
        itemsSql.filter(i => i.promo_group).map(i => i.promo_name), [PROMO_2X1.name, PROMO_2X1.name]);
    comprobar('y el refresco sigue leyéndose bien detrás', itemsSql.filter(i => !i.promo_group).map(i => [i.nombre, i.subtotal]), [['Refresco', 20]]);
    comprobar('la cuenta de la mesa suma la promo con su extra + el refresco', abierta.total, 65);

    const unTaco = itemsSql.find(i => i.promo_group && i.producto_id === 11);
    await cb((c) => db.eliminarItemMesa(unTaco.id, pedidoMesa, c));
    const tras = sb._parsearItemsMesa((await cb((c) => db.obtenerPedidoAbiertoPorMesa(mesa.lastID, c))).items_raw);
    comprobar('🔴 quitar UN taco de la promo quita la promo ENTERA (trampa 4)', tras.map(i => i.nombre), ['Refresco']);
    const trasTotal = await all('SELECT total FROM pedidos WHERE id = ?', [pedidoMesa]);
    comprobar('y la cuenta queda en lo que queda: $20', trasTotal[0].total, 20);
    await cb((c) => db.eliminarItemMesa(tras[0].id, pedidoMesa, c));
    comprobar('quitar un producto SUELTO sigue quitando solo ese',
        (await all('SELECT COUNT(*) AS n FROM pedido_items WHERE pedido_id = ?', [pedidoMesa]))[0].n, 0);

    // La sincronización: la forma nueva en `slots`, y la vieja no se rompe.
    await cb((c) => db.syncCombos([
        { id: 7, name: '2x1 tacos', price: 0, active: true, tipo: 'regalar_mas_barato', paga: 1,
          calendario: { dias: [2] }, items: [], slots: [{ id: 1, quantity: 2, product_ids: [], category_id: TACOS }] },
        { id: 8, name: 'Combo viejo', price: 50, active: true, tipo: 'precio_fijo',
          items: [{ product_id: 20, quantity: 1 }, { product_id: null, quantity: 1 }],
          slots: [{ id: 2, quantity: 1, product_ids: [20], category_id: null }] },
    ], c));
    const promosBase = (await cb((c) => db.obtenerPromosVenta(c))).map(sb.promoDeFila);
    comprobar('syncCombos guarda el tipo, cuánto se paga, el calendario y los huecos',
        promosBase.find(p => p.id === 7) && [promosBase.find(p => p.id === 7).tipo, promosBase.find(p => p.id === 7).paga,
            promosBase.find(p => p.id === 7).calendario, promosBase.find(p => p.id === 7).huecos],
        ['regalar_mas_barato', 1, { dias: [2] }, [{ quantity: 2, product_ids: [], category_id: TACOS }]]);
    comprobar('un renglón sin producto fijo no revienta combo_items (trampa 1)',
        (await all('SELECT COUNT(*) AS n FROM combo_items WHERE combo_id = 8'))[0].n, 1);

    // Un producto del servidor SIN control de existencias baja como NULL, no
    // como cero: con cero, el equipo lo daba por agotado y la promo no lo ofrecía.
    await cb((c) => db.syncProductos([
        { id: 10, name: 'Pastor', price: 25, stock: null, category_id: TACOS, active: true },
        { id: 20, name: 'Refresco', price: 20, stock: 5, category_id: BEBIDAS, active: true },
    ], c));
    comprobar('🔴 syncProductos guarda "sin control" como NULL, no como agotado',
        (await all('SELECT id, stock FROM productos WHERE id IN (10, 20) ORDER BY id')).map(r => r.stock), [null, 5]);

    await cb((c) => db.syncDescuentos([
        { id: 1, name: 'Lunes 10%', type: 'percentage', value: 10, active: true, calendario: { dias: [1] } },
        { id: 2, name: 'Siempre', type: 'fixed', value: 5, active: true, calendario: null },
    ], c));
    const descuentos = await cb((c) => db.obtenerDescuentos(c));
    comprobar('syncDescuentos guarda el calendario del descuento',
        descuentos.map(d => [d.nombre, d.calendario]), [['Lunes 10%', '{"dias":[1]}'], ['Siempre', null]]);
}

conBase().then(() => {
    console.log('\n' + (fallos ? '❌ ' + fallos + ' de ' + (ok + fallos) + ' comprobaciones FALLARON.' : '✅ ' + ok + ' comprobaciones.'));
    try { db.db.close(); } catch { /* ya */ }
    setTimeout(() => { try { fs.rmSync(perfil, { recursive: true, force: true }); } catch { /* Windows */ } process.exit(fallos ? 1 : 0); }, 200);
}).catch((e) => {
    console.error('❌ El smoke se interrumpió:', e && e.stack || e);
    process.exit(1);
});
