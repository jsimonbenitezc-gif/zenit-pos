/**
 * SMOKE: EL CONTENIDO DEL PAQUETE (§45, arreglo del 2026-09-05).
 *
 * El orégano se compra en bolsas de 50 g y la receta está escrita en gramos:
 * "18 g" son 18/50 = 0.36 bolsas. El desktop ya lo hacía bien en modo LOCAL; el
 * backend descontaba 18 BOLSAS, cincuenta veces de más. Ahora los dos convierten
 * igual, y este script existe para que sigan haciéndolo.
 *
 * Tres partes:
 *   1. LAS DOS IMPLEMENTACIONES, comparadas caso por caso. Es lo que impide que
 *      vuelvan a separarse — y separadas es exactamente como nació el defecto:
 *      la misma venta descontaba una cosa sin internet y otra con él.
 *   2. El puente `recetasQueUsanInsumo`, contra SQLite real. Es lo que alimenta
 *      el aviso de "cambiar la unidad afecta a estas recetas".
 *   3. Una unidad de receta que ya no encaja se CONSERVA marcada, no se cambia
 *      sola por la primera de la lista (que era el tercer medio bug del §45).
 *
 * ⚠️ Si el repo del backend no está al lado, la parte 1 se SALTA con un aviso en
 * vez de fallar: no es un defecto del desktop, y un banco que se pone rojo por
 * algo así deja de mirarse a la semana (mismo criterio que pruebas-ui).
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
    else {
        fallos++;
        console.log('  ✗ ' + desc +
            '\n      esperado: ' + JSON.stringify(esperado) +
            '\n      real:     ' + JSON.stringify(real));
    }
}

/** Extrae del archivo REAL el cuerpo completo de unas funciones o constantes. */
function extraer(archivo, nombres) {
    const src = fs.readFileSync(archivo, 'utf8');
    let out = '';
    for (const n of nombres) {
        let i = src.indexOf('function ' + n + '(');
        if (i < 0) i = src.indexOf('const ' + n + ' = {');
        if (i < 0) throw new Error('No existe ' + n + ' en ' + path.basename(archivo) + ' (¿se renombró?)');
        if (src.slice(Math.max(0, i - 6), i) === 'async ') i -= 6;
        let j = src.indexOf('{', i), prof = 0, fin = -1;
        for (let k = j; k < src.length; k++) {
            if (src[k] === '{') prof++;
            else if (src[k] === '}') { prof--; if (prof === 0) { fin = k + 1; break; } }
        }
        if (fin < 0) throw new Error('No pude cerrar ' + n);
        out += src.slice(i, fin) + '\n';
    }
    return out;
}

// ═══════════════════════════════════════════════════════════════════════════
// 1. LAS DOS IMPLEMENTACIONES CONVIERTEN IGUAL
// ═══════════════════════════════════════════════════════════════════════════
console.log('\n1 · el desktop y el backend convierten IGUAL');

const codigoDesktop = extraer(path.join(RAIZ, 'database', 'db.js'), ['FACTORES_CONVERSION', 'convertirUnidad']);
const cajaDesktop = { Math, parseFloat, isFinite };
vm.createContext(cajaDesktop);
vm.runInContext(codigoDesktop, cajaDesktop);

const RUTA_BACKEND = process.env.ZENIT_BACKEND || path.join(RAIZ, '..', 'zenit-pos-backend');
const hayBackend = fs.existsSync(path.join(RUTA_BACKEND, 'utils', 'unidades.js'));

// Los casos: la unidad de la receta, la cantidad y cómo está guardado el insumo.
// Se incluyen a propósito los DATOS SUCIOS, que es donde una copia se desvía de
// la otra sin que nadie lo note.
const CASOS = [
    // [cantidad, unidadReceta, {unidad, contenido_cantidad, contenido_unidad}]
    [18,   'g',       { unidad: 'bolsas', contenido_cantidad: 50,   contenido_unidad: 'g' }],
    [100,  'g',       { unidad: 'bolsas', contenido_cantidad: 50,   contenido_unidad: 'g' }],
    [1,    'kg',      { unidad: 'bolsas', contenido_cantidad: 50,   contenido_unidad: 'g' }],
    [3,    'bolsas',  { unidad: 'bolsas', contenido_cantidad: 50,   contenido_unidad: 'g' }],
    [380,  'g',       { unidad: 'latas',  contenido_cantidad: 380,  contenido_unidad: 'g' }],
    [0.5,  'l',       { unidad: 'pzas',   contenido_cantidad: 250,  contenido_unidad: 'ml' }],
    [500,  'g',       { unidad: 'kg',     contenido_cantidad: 1000, contenido_unidad: 'g' }],
    [2,    'l',       { unidad: 'ml',     contenido_cantidad: null, contenido_unidad: null }],
    [18,   'g',       { unidad: 'bolsas', contenido_cantidad: null, contenido_unidad: null }],
    [18,   'g',       { unidad: 'bolsas', contenido_cantidad: 0,    contenido_unidad: 'g' }],
    [18,   'g',       { unidad: 'bolsas', contenido_cantidad: -50,  contenido_unidad: 'g' }],
    [18,   'g',       { unidad: 'bolsas', contenido_cantidad: 'x',  contenido_unidad: 'g' }],
    [18,   null,      { unidad: 'bolsas', contenido_cantidad: 50,   contenido_unidad: 'g' }],
    [7,    'pzas',    { unidad: 'kg',     contenido_cantidad: null, contenido_unidad: null }],
    [1,    'gal',     { unidad: 'l',      contenido_cantidad: null, contenido_unidad: null }],
];

// El caso del §45, primero y por su nombre: es el que hay que reconocer de un
// vistazo si algún día vuelve a fallar.
comprobar('el caso del §45: 18 g de un insumo en bolsas de 50 g = 0.36 bolsas',
    Math.round(cajaDesktop.convertirUnidad(18, 'g', CASOS[0][2]) * 1e6) / 1e6, 0.36);

if (!hayBackend) {
    console.log('  ⏭️  comparación con el backend SALTADA: no encontré el repo zenit-pos-backend');
    console.log('      al lado de éste (clónalo como carpeta hermana, o apunta ZENIT_BACKEND a él).');
} else {
    const { convertirParaInsumo } = require(path.join(RUTA_BACKEND, 'utils', 'unidades.js'));
    let divergencias = [];
    for (const [cantidad, unidadReceta, insumo] of CASOS) {
        const aquiEl = cajaDesktop.convertirUnidad(cantidad, unidadReceta, insumo);
        // El backend nombra los campos en inglés; es el MISMO dato.
        const alla = convertirParaInsumo(cantidad, unidadReceta, {
            unit: insumo.unidad,
            content_amount: insumo.contenido_cantidad,
            content_unit: insumo.contenido_unidad,
        });
        const iguales = Math.abs(aquiEl - alla) < 1e-9;
        if (!iguales) {
            divergencias.push(`${cantidad} ${unidadReceta} → ${insumo.unidad}: desktop ${aquiEl}, backend ${alla}`);
        }
    }
    comprobar('las ' + CASOS.length + ' conversiones coinciden entre desktop y backend',
        divergencias, []);
}

// ═══════════════════════════════════════════════════════════════════════════
// 3. LA UNIDAD DE RECETA QUE YA NO ENCAJA (va antes del bloque asíncrono)
// ═══════════════════════════════════════════════════════════════════════════
console.log('\n3 · una unidad de receta que ya no encaja se marca, no se cambia sola');

const codigoUnidades = extraer(path.join(RAIZ, 'pos', 'modulo-inventario.js'),
    ['obtenerUnidadesCompatibles', 'actualizarUnidadReceta']);

/**
 * Monta `actualizarUnidadReceta` sobre un DOM de mentira mínimo y devuelve las
 * opciones que pintó y cuál quedó marcada.
 */
function pintarSelector(insumo, unidadGuardada) {
    const selUnidad = { innerHTML: '', style: {}, title: '' };
    const linea = { querySelector: () => selUnidad };
    const selectIngrediente = { closest: () => linea, value: 'insumo_' + insumo.id };

    const caja = {
        console,
        EQUIVALENCIAS_UNIDAD: {
            kg: [{ unidad: 'g' }], g: [{ unidad: 'kg' }],
            l: [{ unidad: 'ml' }], ml: [{ unidad: 'l' }],
        },
        insumosCache: [insumo],
        preparacionesCache: [],
        esc: (s) => String(s),
    };
    vm.createContext(caja);
    vm.runInContext(codigoUnidades, caja);
    caja.actualizarUnidadReceta(selectIngrediente, unidadGuardada);

    const html = selUnidad.innerHTML;
    const valores = [...html.matchAll(/value="([^"]*)"/g)].map(m => m[1]);
    const marcada = (html.match(/value="([^"]*)"\s+selected/) || [])[1] || null;
    return { valores, marcada, avisa: /ya no aplica/.test(html), borde: selUnidad.style.borderColor };
}

const enBolsas = { id: 1, nombre: 'Orégano', unidad: 'bolsas', contenido_cantidad: 50, contenido_unidad: 'g' };
const enKg = { id: 1, nombre: 'Orégano', unidad: 'kg', contenido_cantidad: null, contenido_unidad: null };

// Caso normal: la unidad guardada sigue siendo compatible.
const normal = pintarSelector(enBolsas, 'g');
comprobar('una unidad compatible queda marcada y sin aviso',
    [normal.marcada, normal.avisa], ['g', false]);

// Caso del §45: el insumo pasó a kg y la receta seguía en 'bolsas'.
const rota = pintarSelector(enKg, 'bolsas');
comprobar('una unidad que ya no encaja SE CONSERVA en la lista',
    rota.valores.includes('bolsas'), true);
comprobar('…y queda MARCADA, no se cae a la primera de la lista', rota.marcada, 'bolsas');
comprobar('…y se avisa de que ya no aplica', rota.avisa, true);
comprobar('…y la línea se pinta en ámbar', rota.borde, '#f59e0b');

// ═══════════════════════════════════════════════════════════════════════════
// 2. EL PUENTE recetasQueUsanInsumo, contra SQLite real
// ═══════════════════════════════════════════════════════════════════════════
const perfil = fs.mkdtempSync(path.join(os.tmpdir(), 'zenit-smoke-unidades-'));
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

async function principal() {
    await esperar(2500);
    console.log('\n2 · el aviso sabe QUÉ recetas usan el insumo');

    await conCallback((cb) => db.agregarInsumo(
        { nombre: 'Orégano', unidad: 'g', stock_actual: 287, stock_minimo: 20, costo_unitario: 0.24 }, cb));
    const insumos = await conCallback((cb) => db.obtenerInsumos(cb));
    const oregano = insumos.find(i => i.nombre === 'Orégano');

    const grupos = await db.obtenerProductosAgrupados();
    const productos = grupos.reduce((s, g) => s.concat(g.productos), []);
    const plato = productos[0];

    // Sin recetas todavía: el aviso no debe salir por nada.
    comprobar('un insumo sin recetas no dispara el aviso',
        (await conCallback((cb) => db.recetasQueUsanInsumo(oregano.id, cb))).length, 0);

    await conCallback((cb) => db.guardarRecetaProducto(plato.id,
        [{ tipo: 'insumo', referencia_id: oregano.id, cantidad: 18, unidad_receta: 'g' }], cb));

    const usan = await conCallback((cb) => db.recetasQueUsanInsumo(oregano.id, cb));
    comprobar('encuentra la receta del producto', usan.length, 1);
    comprobar('…con el nombre, la cantidad y la unidad en la que está escrita',
        [usan[0].origen, usan[0].nombre, usan[0].cantidad, usan[0].unidad_receta],
        ['producto', plato.nombre, 18, 'g']);

    // Y las PREPARACIONES cuentan igual: consumen insumos y se olvidan con la
    // misma facilidad que los productos.
    await conCallback((cb) => db.agregarPreparacion({ nombre: 'Salsa verde', unidad: 'l', rinde: 4 }, cb));
    const preps = await conCallback((cb) => db.obtenerPreparaciones(cb));
    const salsa = preps.find(p => p.nombre === 'Salsa verde');
    await conCallback((cb) => db.guardarItemsPreparacion(salsa.id,
        [{ insumo_id: oregano.id, cantidad: 5, unidad_receta: 'g' }], cb));

    const conPrep = await conCallback((cb) => db.recetasQueUsanInsumo(oregano.id, cb));
    comprobar('también encuentra la receta de la PREPARACIÓN', conPrep.length, 2);
    comprobar('…y la distingue del producto',
        conPrep.filter(r => r.origen === 'preparacion').map(r => r.nombre), ['Salsa verde']);

    // ── Cierre ─────────────────────────────────────────────────────────────
    console.log('');
    if (fallos === 0) {
        console.log('✅ ' + ok + ' comprobaciones del contenido de paquete (§45), todas en verde.');
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
