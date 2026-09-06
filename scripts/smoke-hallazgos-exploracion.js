/**
 * SMOKE: los cuatro defectos que encontró la primera SESIÓN DE EXPLORACIÓN
 * (BLOQUE 17, 2026-09-05). Detalle y pasos para reproducirlos a mano:
 * `explorar/HALLAZGOS.md`.
 *
 *   E-1  un descuento fijo mayor que el ticket registraba una venta con total
 *        NEGATIVO (−$25.50), y el corte de caja quedaba con un sobrante
 *        fantasma de ese importe.
 *   E-2  cancelar una venta en modo local NO devolvía los insumos: el
 *        inventario se desviaba en silencio, una cancelación a la vez.
 *   E-3  una mesa recién abierta decía llevar 5 h ocupada (el huso entero).
 *   E-4  el historial de entradas y salidas de inventario se fechaba en UTC,
 *        5–6 horas en el futuro.
 *
 * Se cargan las funciones REALES (`pos/modulo-venta.js`, `pos/modulo-mesas.js`)
 * y se trabaja contra una SQLite de verdad con el esquema de verdad, no con
 * copias: si algo se renombra, este script falla en vez de pasar en falso.
 *
 * ⚠️ COMPROBADO CON DIENTES. Con los cuatro arreglos deshechos, fallan 9 de las
 * comprobaciones de abajo. Una prueba que pasa con y sin el arreglo no prueba
 * nada (§44.1, §46.5).
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');

const RAIZ = path.join(__dirname, '..');
const POS = path.join(RAIZ, 'pos');
let fallos = 0, ok = 0;

function comprobar(desc, real, esperado) {
    const iguales = JSON.stringify(real) === JSON.stringify(esperado);
    if (iguales) { ok++; console.log('  ✓ ' + desc); }
    else {
        fallos++;
        console.log('  ✗ ' + desc +
            '\n      esperado: ' + JSON.stringify(esperado) +
            '\n      real:     ' + JSON.stringify(real));
    }
}

/** Extrae del archivo REAL el cuerpo completo de unas funciones. */
function extraer(archivo, nombres) {
    const src = fs.readFileSync(path.join(POS, archivo), 'utf8');
    let out = '';
    for (const n of nombres) {
        let i = src.indexOf('function ' + n + '(');
        if (i < 0) throw new Error('No existe ' + n + '() en ' + archivo + ' (¿se renombró?)');
        // Si viene declarada `async function`, hay que llevarse el `async`: sin él
        // el cuerpo extraído usa `await` dentro de una función normal y revienta.
        if (src.slice(Math.max(0, i - 6), i) === 'async ') i -= 6;
        let j = src.indexOf('{', i), prof = 0, fin = -1;
        for (let k = j; k < src.length; k++) {
            if (src[k] === '{') prof++;
            else if (src[k] === '}') { prof--; if (prof === 0) { fin = k + 1; break; } }
        }
        if (fin < 0) throw new Error('No pude cerrar ' + n + '()');
        out += src.slice(i, fin) + '\n';
    }
    return out;
}

// ═══════════════════════════════════════════════════════════════════════════
// E-1 · El descuento nunca puede dejar el ticket en negativo
// ═══════════════════════════════════════════════════════════════════════════
console.log('\nE-1 · un descuento mayor que el ticket NO produce un total negativo');

const codigoVenta = extraer('modulo-venta.js', ['_descuentosDelCarrito', '_baseGravableCarrito']);

function baseCon({ precios, promocion = 0, puntos = 0 }) {
    const caja = {
        carrito: precios.map((p) => ({ precio: p })),
        descuentoActual: promocion,
        descuentoPuntosVenta: puntos,
        Math,
    };
    vm.createContext(caja);
    vm.runInContext(codigoVenta, caja);
    return {
        base: caja._baseGravableCarrito(),
        d: caja._descuentosDelCarrito(),
    };
}

// El caso exacto que se encontró: "Cortesía $50" —que Zenit siembra en TODA
// instalación nueva— sobre un taco de $24.50.
const cortesia = baseCon({ precios: [24.5], promocion: 50 });
comprobar('la base gravable no baja de cero', cortesia.base, 0);
comprobar('el descuento efectivo se acota al ticket', cortesia.d.promocion, 24.5);
comprobar('el renglón visible del descuento coincide con lo descontado', cortesia.d.visible, 24.5);

// Un descuento normal sigue comportándose igual que siempre.
const normal = baseCon({ precios: [100, 50], promocion: 20 });
comprobar('un descuento que sí cabe no se toca', [normal.base, normal.d.promocion], [130, 20]);

// Los PUNTOS son dinero del cliente ya comprometido: se aplican primero y es la
// PROMOCIÓN la que absorbe el recorte. Quemar puntos para nada sería peor.
const mixto = baseCon({ precios: [30], promocion: 50, puntos: 10 });
comprobar('con puntos + cupón grande, los puntos se respetan enteros', mixto.d.puntos, 10);
comprobar('y el cupón absorbe el recorte', mixto.d.promocion, 20);
comprobar('la base sigue sin ser negativa', mixto.base, 0);

// Un descuento negativo (dato corrupto) no puede INFLAR la venta.
const corrupto = baseCon({ precios: [40], promocion: -100 });
comprobar('un descuento negativo no aumenta el total', corrupto.base, 40);

// ═══════════════════════════════════════════════════════════════════════════
// E-3 · El tiempo en mesa se lee en hora LOCAL, que es como se guarda
// ═══════════════════════════════════════════════════════════════════════════
console.log('\nE-3 · una mesa recién abierta no dice llevar horas');

const codigoMesas = extraer('modulo-mesas.js', ['_tiempoEnMesa']);
const cajaMesas = { Date, Math };
vm.createContext(cajaMesas);
vm.runInContext(codigoMesas, cajaMesas);

/** Lo mismo que escribe la SQLite: 'YYYY-MM-DD HH:MM:SS' en hora local. */
function comoLoGuardaSqlite(fecha) {
    const dd = (n) => String(n).padStart(2, '0');
    return fecha.getFullYear() + '-' + dd(fecha.getMonth() + 1) + '-' + dd(fecha.getDate()) +
        ' ' + dd(fecha.getHours()) + ':' + dd(fecha.getMinutes()) + ':' + dd(fecha.getSeconds());
}

comprobar('recién abierta → 0min (no el huso entero)',
    cajaMesas._tiempoEnMesa(comoLoGuardaSqlite(new Date())), '0min');
comprobar('abierta hace 90 minutos → 1h 30m',
    cajaMesas._tiempoEnMesa(comoLoGuardaSqlite(new Date(Date.now() - 90 * 60000))), '1h 30m');
// Del BACKEND llega en ISO CON zona: ése sí se interpreta como UTC.
comprobar('una fecha ISO del backend se sigue interpretando con su zona',
    cajaMesas._tiempoEnMesa(new Date(Date.now() - 45 * 60000).toISOString()), '45min');

// ═══════════════════════════════════════════════════════════════════════════
// F-1 y F-2 · Los dos guardas de dinero AVISAN, y solo cuando toca
//
// Los cinco roces de la sesión (explorar/HALLAZGOS.md) se arreglaron con avisos,
// nunca con candados (§37, §19.19). Aquí se fijan los dos que tocan dinero: que
// pregunten cuando el importe se pasa, que NO pregunten cuando cabe, y —lo más
// importante— que un "no" DETENGA la operación.
// ═══════════════════════════════════════════════════════════════════════════
const codigoSalida = extraer('modulo-inventario.js', ['_confirmarSalidaMayorQueStock']);
const codigoRetiro = extraer('modulo-turno.js', ['_efectivoEsperado', '_confirmarSalidaMayorQueLaCaja']);

/** Monta el guarda REAL con un `confirmarZenit` que contesta lo que se le diga. */
function montarGuarda(codigo, extras, respuestaDelUsuario) {
    let preguntado = null;
    const caja = Object.assign({
        Math, JSON, parseFloat, isNaN, console,
        confirmarZenit: async (mensaje) => { preguntado = mensaje; return respuestaDelUsuario; },
        fmt: (n) => '$' + Number(n).toFixed(2),
    }, extras);
    vm.createContext(caja);
    vm.runInContext(codigo, caja);
    return { caja, pregunto: () => preguntado !== null, mensaje: () => preguntado || '' };
}

const INSUMOS = [{ id: 7, nombre: 'Carne al pastor', unidad: 'kg', stock_actual: 11.84 }];

async function probarSalida(cantidad, respuesta) {
    const g = montarGuarda(codigoSalida, { insumosCache: INSUMOS }, respuesta);
    const sigue = await g.caja._confirmarSalidaMayorQueStock({ insumo_id: 7, cantidad });
    return { sigue, pregunto: g.pregunto(), mensaje: g.mensaje() };
}

async function probarMovimiento(tipo, monto, respuesta, { totalesRotos = false } = {}) {
    const g = montarGuarda(codigoRetiro, {
        turnoActivo: { id: 1, apertura: 'x', fondo_inicial: 1000 },
        _turnoGetTotales: async () => {
            if (totalesRotos) throw new Error('sin conexión');
            return { total_efectivo: 0 };
        },
    }, respuesta);
    const sigue = await g.caja._confirmarSalidaMayorQueLaCaja(tipo, monto);
    return { sigue, pregunto: g.pregunto() };
}

// ═══════════════════════════════════════════════════════════════════════════
// E-2 y E-4 · Contra una SQLite de verdad, con el esquema de verdad
// ═══════════════════════════════════════════════════════════════════════════
const perfil = fs.mkdtempSync(path.join(os.tmpdir(), 'zenit-smoke-explora-'));
process.env.ZENIT_TEST_USERDATA = perfil;

// `database/db.js` cuelga de Electron para saber dónde escribir. Se le da un
// Electron de mentira que apunta a una carpeta temporal: la base del usuario no
// se toca, igual que en el banco de la interfaz (§46.2).
const Module = require('module');
const cargarOriginal = Module._load;
Module._load = function (peticion, padre, esPrincipal) {
    if (peticion === 'electron') {
        return { app: { getPath: () => perfil, isPackaged: false }, ipcMain: { handle: () => {} } };
    }
    return cargarOriginal.apply(this, arguments);
};

const db = require(path.join(RAIZ, 'database', 'db.js'));
Module._load = cargarOriginal;

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
const conCallback = (fn) => new Promise((res, rej) => fn((err, dato) => (err ? rej(err) : res(dato))));

async function principal() {
    console.log('\nF-1 y F-2 · los guardas avisan cuando el importe se pasa, y no cuando cabe');

    // ── F-1 · salida de inventario mayor que el stock ──────────────────────
    const salidaNormal = await probarSalida(3, true);
    comprobar('una salida que cabe NO pregunta nada', [salidaNormal.pregunto, salidaNormal.sigue], [false, true]);

    const salidaEnorme = await probarSalida(5000, true);
    comprobar('una salida de 5000 sobre 11.84 sí pregunta', salidaEnorme.pregunto, true);
    comprobar('y el aviso dice los DOS números',
        /5000/.test(salidaEnorme.mensaje) && /11\.84/.test(salidaEnorme.mensaje), true);
    comprobar('si la persona dice que sí, se registra igual (avisa, no prohíbe)', salidaEnorme.sigue, true);

    const salidaCancelada = await probarSalida(5000, false);
    comprobar('si dice que no, la salida NO se registra', salidaCancelada.sigue, false);

    // ── F-2 · retiro mayor que el efectivo del cajón ───────────────────────
    const retiroNormal = await probarMovimiento('retiro', 200, true);
    comprobar('un retiro que cabe en la caja NO pregunta', [retiroNormal.pregunto, retiroNormal.sigue], [false, true]);

    const retiroEnorme = await probarMovimiento('retiro', 999999, true);
    comprobar('un retiro de $999,999 sobre $1,000 sí pregunta', retiroEnorme.pregunto, true);
    comprobar('y se registra si la persona lo confirma', retiroEnorme.sigue, true);

    const retiroCancelado = await probarMovimiento('retiro', 999999, false);
    comprobar('si dice que no, el retiro NO se registra', retiroCancelado.sigue, false);

    // Un DEPÓSITO mete dinero, no lo saca: preguntar ahí sería solo estorbo.
    const depositoEnorme = await probarMovimiento('deposito', 999999, false);
    comprobar('un depósito enorme nunca pregunta', [depositoEnorme.pregunto, depositoEnorme.sigue], [false, true]);

    // Si los totales no se pueden leer, se sigue SIN preguntar: un aviso jamás
    // puede impedir que se registre el dinero que ya salió del cajón.
    const sinTotales = await probarMovimiento('retiro', 999999, false, { totalesRotos: true });
    comprobar('si no se pueden leer los totales, no estorba', [sinTotales.pregunto, sinTotales.sigue], [false, true]);

    // `inicializarTablas` corre al importar; hay que darle su turno (crea las
    // tablas y siembra los datos de ejemplo con un setTimeout de 1 s).
    await esperar(2500);

    // ── E-4 · las fechas del inventario se escriben en hora LOCAL ──────────
    console.log('\nE-4 · el historial de inventario se fecha en hora local, no en UTC');

    const insumo = await conCallback((cb) =>
        db.agregarInsumo({ nombre: 'Tortilla', unidad: 'pzas', stock_actual: 100, stock_minimo: 10, costo_unitario: 1.2 }, cb));
    const insumos = await conCallback((cb) => db.obtenerInsumos(cb));
    const tortilla = insumos.find((i) => i.nombre === 'Tortilla');

    await conCallback((cb) => db.registrarEntradaInsumo({ insumo_id: tortilla.id, cantidad: 10, notas: '' }, cb));
    await conCallback((cb) => db.registrarSalidaInsumo({ insumo_id: tortilla.id, cantidad: 3, motivo: 'merma', notas: '' }, cb));

    const desfase = (guardada) => {
        // Cuánto se separa la fecha guardada de la hora local de este equipo.
        // Con el defecto era el huso entero (5 h en Cancún, 6 en CDMX).
        const leida = new Date(String(guardada).replace(' ', 'T'));
        return Math.abs(Date.now() - leida.getTime()) / 60000;   // minutos
    };

    const entrada = await conCallback((cb) => db.obtenerEntradasInsumo(tortilla.id, cb));
    const salida = await conCallback((cb) => db.obtenerSalidasInsumo(tortilla.id, cb));

    comprobar('la ENTRADA queda fechada en hora local (menos de 5 min de desfase)',
        desfase(entrada[0].fecha) < 5, true);
    comprobar('la SALIDA queda fechada en hora local (menos de 5 min de desfase)',
        desfase(salida[0].fecha) < 5, true);

    // ── E-2 · cancelar devuelve los insumos ────────────────────────────────
    console.log('\nE-2 · cancelar una venta devuelve los insumos que consumió');

    const grupos = await conCallback((cb) => db.obtenerProductosAgrupados().then((g) => cb(null, g), cb));
    const productos = grupos.reduce((s, g) => s.concat(g.productos), []);
    const taco = productos[0];
    await conCallback((cb) => db.guardarRecetaProducto(taco.id,
        [{ tipo: 'insumo', referencia_id: tortilla.id, cantidad: 2, unidad_receta: 'pzas' }], cb));

    const stockDe = async () => (await conCallback((cb) => db.obtenerInsumos(cb)))
        .find((i) => i.id === tortilla.id).stock_actual;

    const antes = await stockDe();
    const pedidoId = await conCallback((cb) => db.crearPedido(
        { total: taco.precio * 3, metodo_pago: 'efectivo', tipo_pedido: 'comer' },
        [{ id: taco.id, cantidad: 3, precio: taco.precio, subtotal: taco.precio * 3 }],
        cb));

    const trasVender = await stockDe();
    comprobar('vender 3 unidades descuenta 6 tortillas', +(antes - trasVender).toFixed(4), 6);

    await conCallback((cb) => db.actualizarEstadoPedido(pedidoId, 'cancelado', cb));
    const trasCancelar = await stockDe();
    comprobar('cancelar las devuelve todas', +(trasCancelar).toFixed(4), +antes.toFixed(4));

    // Cancelar dos veces NO puede devolver el doble: la clave es que solo se
    // restaura al ENTRAR a 'cancelado' desde un estado que no lo era.
    await conCallback((cb) => db.actualizarEstadoPedido(pedidoId, 'cancelado', cb));
    comprobar('cancelar dos veces no devuelve el doble', +(await stockDe()).toFixed(4), +antes.toFixed(4));

    // Y un cambio de estado que NO es cancelar no toca el inventario.
    const otro = await conCallback((cb) => db.crearPedido(
        { total: taco.precio, metodo_pago: 'efectivo', tipo_pedido: 'comer' },
        [{ id: taco.id, cantidad: 1, precio: taco.precio, subtotal: taco.precio }],
        cb));
    const trasSegundaVenta = await stockDe();
    await conCallback((cb) => db.actualizarEstadoPedido(otro, 'completado', cb));
    comprobar('pasar a "completado" no devuelve nada', +(await stockDe()).toFixed(4), +trasSegundaVenta.toFixed(4));

    // ── Cierre ─────────────────────────────────────────────────────────────
    console.log('');
    if (fallos === 0) {
        console.log('✅ ' + ok + ' comprobaciones de los hallazgos de exploración, todas en verde.');
    } else {
        console.log('❌ ' + fallos + ' de ' + (ok + fallos) + ' comprobaciones FALLARON.');
    }
    try { fs.rmSync(perfil, { recursive: true, force: true, maxRetries: 3 }); } catch { /* da igual */ }
    process.exit(fallos ? 1 : 0);
}

principal().catch((e) => {
    console.error('\n❌ El smoke test reventó: ' + e.message);
    console.error(e.stack);
    try { fs.rmSync(perfil, { recursive: true, force: true, maxRetries: 3 }); } catch { /* da igual */ }
    process.exit(1);
});
