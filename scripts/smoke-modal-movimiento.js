/**
 * SMOKE: abrir el modal de movimiento de caja NO borra lo que ya se escribió
 * (§51.4 del CLAUDE.md).
 *
 *     node scripts/smoke-modal-movimiento.js
 *
 * El banco de la interfaz lo veía de vez en cuando: el cajero (o el banco)
 * escribía el monto y el motivo, y al confirmar salía "Ingresa un monto mayor
 * a cero" con el modal abierto y los dos campos VACÍOS. `abrirModalMovimientoCaja`
 * limpiaba los campos y luego esperaba dos `await`; una segunda llamada —un
 * doble clic, o un clic mientras la primera esperaba— los limpiaba otra vez
 * encima de lo escrito.
 *
 * Carga la función REAL de `pos/modulo-turno.js` sobre un DOM de mentira.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const POS = path.join(__dirname, '..', 'pos');
const src = fs.readFileSync(path.join(POS, 'modulo-turno.js'), 'utf8');

function extraer(nombre) {
    let i = src.indexOf('function ' + nombre + '(');
    if (i < 0) throw new Error('No existe ' + nombre + '() en modulo-turno.js (¿se renombró?)');
    if (src.slice(Math.max(0, i - 6), i) === 'async ') i -= 6;
    let j = src.indexOf('{', i), prof = 0;
    for (let k = j; k < src.length; k++) {
        if (src[k] === '{') prof++;
        else if (src[k] === '}') { prof--; if (prof === 0) return src.slice(i, k + 1); }
    }
    throw new Error('No pude cerrar ' + nombre + '()');
}

let fallos = 0, ok = 0;
function comprobar(desc, real, esperado) {
    const bien = JSON.stringify(real) === JSON.stringify(esperado);
    console.log('  ' + (bien ? '✓' : '✗') + ' ' + desc + (bien ? '' : `\n      esperado: ${JSON.stringify(esperado)}\n      real:     ${JSON.stringify(real)}`));
    bien ? ok++ : fallos++;
}

function montar() {
    const el = (extra = {}) => ({ value: '', style: {}, focus() {}, ...extra });
    const clases = new Set(['hidden']);
    const dom = {
        'modal-movimiento-caja': { classList: { contains: (c) => clases.has(c), remove: (c) => clases.delete(c), add: (c) => clases.add(c) } },
        'mov-caja-monto': el(),
        'mov-caja-motivo': el(),
        'mov-caja-pin': el(),
        'mov-caja-error': el(),
    };
    const puertas = [];
    const caja = {
        document: { getElementById: (id) => dom[id] || null },
        turnoActivo: { id: 1 },
        setTimeout: (fn) => fn(),
        mostrarNotificacionExito() {},
        // Cada apertura se queda esperando aquí hasta que la prueba la suelte:
        // así se puede escribir "a media apertura", que es lo que hace un cajero.
        bloquearSiVistaAjena: () => new Promise((r) => puertas.push(() => r(false))),
        seleccionaciones: 0,
        seleccionarTipoMovimiento: async function () { caja.seleccionaciones++; },
    };
    vm.createContext(caja);
    const decl = /let _movAbriendo\s*=\s*false;/.test(src) ? 'let _movAbriendo = false;\n' : '';
    vm.runInContext(decl + extraer('abrirModalMovimientoCaja') + '\nthis.abrir = abrirModalMovimientoCaja;', caja);
    return { caja, dom, puertas, visible: () => !clases.has('hidden') };
}
const tic = () => new Promise((r) => setImmediate(r));

async function principal() {
    console.log('\nAbrir el modal de movimiento de caja');

    {
        const { caja, dom, puertas, visible } = montar();
        const a = caja.abrir();
        await tic();
        puertas.shift()();
        await a;
        comprobar('la primera apertura enseña el modal', visible(), true);
        dom['mov-caja-monto'].value = '50';
        dom['mov-caja-motivo'].value = 'cilantro';
        // Un segundo clic con el modal ya abierto (doble clic, o el mismo botón otra vez).
        const b = caja.abrir();
        await tic();
        if (puertas.length) puertas.shift()();
        await b;
        comprobar('🔴 un segundo clic con el modal abierto NO borra el monto ni el motivo',
            [dom['mov-caja-monto'].value, dom['mov-caja-motivo'].value], ['50', 'cilantro']);
    }

    {
        const { caja, dom, puertas, visible } = montar();
        const a = caja.abrir();
        await tic();
        const b = caja.abrir();              // llega mientras la primera espera
        await tic();
        comprobar('dos clics seguidos: la segunda apertura no arranca otra vez', puertas.length, 1);
        puertas.shift()();
        await a; await b;
        dom['mov-caja-monto'].value = '80';
        while (puertas.length) { puertas.shift()(); await tic(); }
        await tic();
        comprobar('y lo escrito tras abrir se queda', dom['mov-caja-monto'].value, '80');
        comprobar('el modal quedó abierto, una sola vez', [visible(), caja.seleccionaciones], [true, 1]);
    }

    {
        const { caja, dom, puertas } = montar();
        dom['mov-caja-monto'].value = '999';         // lo que quedó de la vez anterior
        dom['mov-caja-error'].style.display = '';
        const a = caja.abrir();
        await tic();
        puertas.shift()();
        await a;
        comprobar('al abrir de cero, los campos de la vez anterior sí se limpian',
            [dom['mov-caja-monto'].value, dom['mov-caja-error'].style.display], ['', 'none']);
    }

    console.log('');
    if (fallos === 0) console.log('✅ ' + ok + ' comprobaciones del modal de movimiento de caja.');
    else console.log('❌ ' + fallos + ' de ' + (ok + fallos) + ' comprobaciones FALLARON.');
    process.exit(fallos ? 1 : 0);
}

principal().catch((e) => { console.error('\n❌ El smoke test reventó: ' + e.message); process.exit(1); });
