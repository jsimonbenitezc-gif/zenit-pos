/**
 * SMOKE TEST — Impresión automática del ticket (Ajustes → Impresora).
 *
 * QUÉ RESUELVE. Hasta ahora, cada venta terminaba con un modal preguntando
 * "¿imprimir el ticket?". Para un negocio que SIEMPRE imprime, eso es un clic
 * extra en cada venta y en plena hora pico: fricción pura (§1), y a las diez
 * veces se cierra por reflejo. El interruptor nuevo (`impresora_auto`) hace que
 * el ticket salga solo.
 *
 * POR QUÉ ES UN SMOKE TEST Y NO UN RECORRIDO DE LA UI. El banco de la interfaz
 * (§46) abre la app de verdad, pero no puede ejercitar la rama encendida sin una
 * IMPRESORA REAL conectada: mandaría un trabajo de impresión a la máquina de
 * quien corra las pruebas. Aquí se carga la función REAL de `modulo-venta.js`
 * sobre un DOM y un `window.api` de mentira, y se comprueba a cuál de las dos
 * ramas entra sin imprimir nada.
 *
 * Lo que se comprueba:
 *   1. Con el ajuste ENCENDIDO se imprime solo y NO se muestra el modal.
 *   2. Con el ajuste APAGADO se muestra el modal, como siempre (default).
 *   3. Sin el ajuste guardado (instalación nueva) también se muestra el modal:
 *      un equipo recién instalado no puede ponerse a imprimir sin que nadie lo
 *      haya pedido.
 *   4. El valor es la CADENA 'true', no el booleano: los ajustes se guardan como
 *      texto en la SQLite, y comparar contra `true` daría siempre falso.
 *   5. Si el puente falla, se cae al modal en vez de tumbar nada — la venta ya
 *      está registrada cuando se llega aquí (mismo criterio que §32.12).
 *
 * Uso:  node scripts/smoke-impresion-automatica.js
 */
const path = require('path');
const fs = require('fs');

let fallos = 0;
let total = 0;
const ok = (descripcion, condicion, detalle = '') => {
    total++;
    console.log(`  ${condicion ? '✓' : '✗'} ${descripcion}${condicion || !detalle ? '' : ' → ' + detalle}`);
    if (!condicion) fallos++;
};

// ── Se extrae del modulo-venta.js REAL la función bajo prueba ───────────────
// Si alguien la renombra o la borra, este script falla en vez de pasar en verde
// probando una copia que ya no se parece a lo que corre.
const fuente = fs.readFileSync(path.join(__dirname, '..', 'pos', 'modulo-venta.js'), 'utf8');
const MARCA = 'async function mostrarModalImpresion(pedidoId) {';
if (!fuente.includes(MARCA)) {
    console.error('FALLO: pos/modulo-venta.js ya no contiene mostrarModalImpresion (¿se renombró?)');
    process.exit(1);
}
const ini = fuente.indexOf(MARCA);
const fin = fuente.indexOf('\nlet tipoPedidoActual', ini);
if (fin === -1) {
    console.error('FALLO: no se pudo delimitar mostrarModalImpresion en modulo-venta.js');
    process.exit(1);
}
const codigoReal = fuente.slice(ini, fin);

// ── Escenario: un DOM y un window.api mínimos ───────────────────────────────
function montar({ ajustes, fallaElPuente = false }) {
    const registro = { imprimio: null, modalVisible: false };

    const clases = (inicial) => {
        const set = new Set(inicial);
        return {
            add: (c) => set.add(c),
            remove: (c) => set.delete(c),
            contains: (c) => set.has(c),
        };
    };

    const modal = { classList: clases(['hidden']) };
    const elementos = {
        'modal-imprimir-ticket': modal,
        'print-confirm-sub': { textContent: '' },
        'btn-si-imprimir': { onclick: null },
        'btn-no-imprimir': { onclick: null },
    };

    const contexto = {
        document: { getElementById: (id) => elementos[id] || null },
        window: {
            api: {
                obtenerAjustes: async () => {
                    if (fallaElPuente) throw new Error('puente caído');
                    return ajustes;
                },
            },
        },
        imprimirTicket: (id) => { registro.imprimio = id; },
        setTimeout: () => 0,
        clearTimeout: () => {},
        console: { warn: () => {} },
    };
    contexto.globalThis = contexto;

    // eslint-disable-next-line no-new-func
    const fabricar = new Function(
        'document', 'window', 'imprimirTicket', 'setTimeout', 'clearTimeout', 'console',
        codigoReal + '\nreturn mostrarModalImpresion;'
    );
    const fn = fabricar(
        contexto.document, contexto.window, contexto.imprimirTicket,
        contexto.setTimeout, contexto.clearTimeout, contexto.console
    );

    return { ejecutar: () => fn(77), registro, modal };
}

(async () => {
    console.log('\n── Impresión automática del ticket ──\n');

    // 1. Encendido: imprime solo, sin preguntar.
    {
        const e = montar({ ajustes: { impresora_auto: 'true' } });
        await e.ejecutar();
        ok('con el ajuste ENCENDIDO, el ticket se imprime solo', e.registro.imprimio === 77,
            `imprimió: ${e.registro.imprimio}`);
        ok('...y NO se muestra el modal de preguntar', e.modal.classList.contains('hidden'));
    }

    // 2. Apagado: el comportamiento de siempre.
    {
        const e = montar({ ajustes: { impresora_auto: 'false' } });
        await e.ejecutar();
        ok('con el ajuste APAGADO, se pregunta como siempre', !e.modal.classList.contains('hidden'));
        ok('...y no se imprime nada por su cuenta', e.registro.imprimio === null);
    }

    // 3. Instalación nueva: el ajuste no existe todavía.
    {
        const e = montar({ ajustes: {} });
        await e.ejecutar();
        ok('🔒 en una instalación NUEVA se pregunta (no imprime sin que nadie lo pida)',
            !e.modal.classList.contains('hidden') && e.registro.imprimio === null);
    }

    // 4. El valor es texto, no booleano: los ajustes viven como cadenas en SQLite.
    {
        const e = montar({ ajustes: { impresora_auto: true } });
        await e.ejecutar();
        ok('🔒 un booleano `true` NO enciende la impresión (se guarda como texto)',
            e.registro.imprimio === null,
            'si esto falla, alguien comparó contra el tipo equivocado en algún lado');
    }

    // 5. Un fallo del puente no puede frenar nada.
    {
        const e = montar({ ajustes: {}, fallaElPuente: true });
        let reventó = false;
        try { await e.ejecutar(); } catch { reventó = true; }
        ok('si el puente falla, no lanza: la venta ya está registrada', !reventó);
        ok('...y cae al modal de siempre', !e.modal.classList.contains('hidden'));
    }

    // 6. La otra mitad: cobrar una MESA usa el mismo ajuste.
    {
        const mesas = fs.readFileSync(path.join(__dirname, '..', 'pos', 'modulo-mesas.js'), 'utf8');
        ok('cobrar una mesa lee el MISMO ajuste del equipo',
            /impresora_auto/.test(mesas) && /imprimirCuentaMesaFinal\(\)/.test(mesas));
    }

    // 7. El interruptor existe en Ajustes y se guarda con la clave correcta.
    {
        const html = fs.readFileSync(path.join(__dirname, '..', 'pos', 'index.html'), 'utf8');
        const ajustesJs = fs.readFileSync(path.join(__dirname, '..', 'pos', 'modulo-ajustes.js'), 'utf8');
        ok('el interruptor está en la pantalla de Ajustes',
            /id="adj-impresora-auto"/.test(html) && /guardarAjusteDirecto\('impresora_auto'/.test(html));
        ok('y se relee al abrir Ajustes (si no, siempre saldría apagado)',
            /adj-impresora-auto/.test(ajustesJs) && /ajustes\.impresora_auto === 'true'/.test(ajustesJs));
        // Se llama `impresora_auto` para caer en la lista blanca `impresora%` de
        // limpiarAjustesCuenta: es del EQUIPO y debe sobrevivir al cerrar sesión.
        const db = fs.readFileSync(path.join(__dirname, '..', 'database', 'db.js'), 'utf8');
        ok('🔒 sobrevive al cerrar sesión (es un ajuste del equipo, no de la cuenta)',
            /clave NOT LIKE 'impresora%'/.test(db));
    }

    console.log(
        `\n${fallos === 0 ? '✅' : '❌'} ${total - fallos} de ${total} comprobaciones de la impresión automática.\n`
    );
    process.exit(fallos === 0 ? 0 : 1);
})();
