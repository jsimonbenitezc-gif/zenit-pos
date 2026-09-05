#!/usr/bin/env node
// ============================================================================
// pruebas-ui/correr.js — EL BANCO DE PRUEBAS DE LA INTERFAZ DEL DESKTOP
//
//     npm run probar:ui
//
// Qué es: un guion DETERMINISTA (sin LLM, sin tokens) que abre el Zenit de
// escritorio DE VERDAD —el mismo Electron de `npm start`, el mismo preload, la
// misma SQLite— y lo usa clic por clic como lo usaría un cajero.
//
// POR QUÉ EXISTE (PLAN_ARREGLOS_V5 → BLOQUE 16). El desktop no tiene ni una sola
// prueba y no tiene paso de compilación, así que una función que se llama y nunca
// se escribió no se nota hasta que alguien abre esa vista. Ya pasó CUATRO veces:
// `fmt()` dejó la vista de Turno a medias (§28), `_desgloseMesa()` reventaba la de
// Mesas entera (§29), cuatro botones no hacían nada (2026-08-26) y
// `buscarClientePorTelefono` nunca existió (§36). Las cuatro se descubrieron por
// accidente. `npm run revisar` cubre desde entonces las funciones que faltan y el
// puente window.api/preload/ipcMain; lo que no cubre —y esto sí— es lo que solo se
// ve MIRANDO LA PANTALLA: un cálculo que sale mal, un modal que no cierra, una
// vista que se apaga porque otra le pisó las clases (§44.3).
//
// ⚠️ NUNCA TOCA LA BASE DEL USUARIO. Cada recorrido abre la app con
// `--user-data-dir` apuntando a una carpeta temporal recién creada, y se comprueba
// —preguntándole al proceso de Electron, no suponiéndolo— que de verdad está
// escribiendo ahí antes de mandarle un solo clic. Ver lib/guardas.js.
//
// Banderas:
//   --recorrido=caja        corre solo ése (por etiqueta); admite varias con coma
//   --verboso               vuelca lo que la app escribe en consola, en vivo
//   --conservar-perfil      no borra las carpetas temporales (para inspeccionarlas)
// ============================================================================

const fs = require('fs');
const path = require('path');

const { abrirApp } = require('./lib/app');
const { Afirmador } = require('./lib/afirmar');
const { ErrorDeGuarda } = require('./lib/guardas');
const { hayBackendDisponible, arrancarBackendDePruebas } = require('./lib/backend');

const args = process.argv.slice(2);
const bandera = (nombre, porDefecto) => {
    const encontrada = args.find((a) => a.startsWith('--' + nombre + '='));
    return encontrada ? encontrada.split('=').slice(1).join('=') : porDefecto;
};
const VERBOSO = args.includes('--verboso');
const CONSERVAR = args.includes('--conservar-perfil');
const SOLO = bandera('recorrido', null);

function cargarRecorridos() {
    const carpeta = path.join(__dirname, 'recorridos');
    const todos = fs.readdirSync(carpeta)
        .filter((f) => f.endsWith('.js'))
        .sort()
        .map((f) => Object.assign({ archivo: f }, require(path.join(carpeta, f))));

    if (!SOLO) return todos;
    const pedidos = SOLO.split(',').map((s) => s.trim()).filter(Boolean);
    const elegidos = todos.filter((r) => pedidos.includes(r.etiqueta));
    if (!elegidos.length) {
        throw new Error(
            'Ningún recorrido con etiqueta "' + SOLO + '". Disponibles: ' +
            todos.map((r) => r.etiqueta).join(', ')
        );
    }
    return elegidos;
}

/**
 * La consola de la app es parte de la prueba, y la comprueba el RUNNER: así ningún
 * recorrido puede olvidarse de mirarla, que es exactamente como se pierden estas
 * cosas. No hay lista de "ruido tolerado" a propósito: en una instalación nueva las
 * 11 vistas arrancan hoy con cero errores y cero avisos, así que cualquier mensaje
 * es una novedad. Una lista de excepciones crece sola y acaba tapando el de verdad.
 */
function revisarConsola(af, consola) {
    const problemas = consola.problemas;
    if (problemas.length === 0) {
        af.cierto('la app no escribió ni un error ni un aviso en consola', true);
        return;
    }
    const porPaso = problemas.map((p) => '[' + p.paso + '] ' + p.tipo + ': ' + p.texto);
    af._fallo(
        'la app escribió ' + problemas.length + ' mensaje(s) en consola',
        porPaso.join('\n        ')
    );
}

// Vive fuera de principal() para poder apagarlo también si algo revienta por
// arriba: un PostgreSQL desechable que se queda encendido ocupa el puerto y hace
// fallar la corrida siguiente por un motivo que no tiene nada que ver.
let backend = null;

async function principal() {
    console.log('');
    console.log('══════════════════════════════════════════════════════════════');
    console.log('  BANCO DE PRUEBAS DE LA INTERFAZ — el desktop, usado a clics');
    console.log('══════════════════════════════════════════════════════════════');

    const recorridos = cargarRecorridos();
    const resultados = [];
    const saltados = [];
    let salida = 0;

    for (const recorrido of recorridos) {
        // Un recorrido de modo conectado necesita un backend, y ése vive en el OTRO
        // repo (lib/backend.js). Si no está al lado, se salta con un aviso: no es
        // un defecto del desktop y ponerse rojo por eso enseña a ignorar el banco.
        if (recorrido.necesitaBackend && !hayBackendDisponible()) {
            saltados.push({
                recorrido,
                motivo: 'no encontré el repo zenit-pos-backend al lado de éste ' +
                        '(clónalo como carpeta hermana, o apunta ZENIT_BACKEND a él)',
            });
            continue;
        }

        console.log('\n──────────────────────────────────────────────────────────────');
        console.log('  ' + recorrido.nombre + '   [' + recorrido.etiqueta + ']');
        console.log('──────────────────────────────────────────────────────────────');

        const af = new Afirmador(recorrido.nombre);
        const inicio = Date.now();
        let app = null;

        try {
            if (recorrido.necesitaBackend && !backend) {
                process.stdout.write('  · Levantando PostgreSQL y el backend de pruebas... ');
                backend = await arrancarBackendDePruebas({ verboso: VERBOSO });
                console.log('listo (' + backend.url + ', ' + backend.motor + ')');
            }
            app = await abrirApp({ etiqueta: recorrido.etiqueta, verboso: VERBOSO });
            await recorrido.ejecutar({ app, af, abrirApp, backend });
            revisarConsola(af, app.consola);
        } catch (err) {
            af._fallo('el recorrido se interrumpió', err.message.split('\n')[0]);
            if (app) {
                const foto = await app.foto('fallo-' + recorrido.etiqueta);
                if (foto) console.log('        (foto de la pantalla: ' + foto + ')');
                revisarConsola(af, app.consola);
            }
            if (VERBOSO && err.stack) console.log(err.stack);
        } finally {
            if (app) {
                if (CONSERVAR) { await app.cerrar(); console.log('        (perfil conservado: ' + app.perfil + ')'); }
                else await app.destruir();
            }
        }

        const ms = Date.now() - inicio;
        resultados.push({ recorrido, af, ms });
        console.log(
            '\n  ' + (af.paso ? '✅ PASÓ' : '❌ FALLÓ') +
            ' · ' + af.comprobaciones + ' comprobaciones · ' + (ms / 1000).toFixed(1) + 's'
        );
    }

    console.log('\n══════════════════════════════════════════════════════════════');
    console.log('  RESUMEN');
    console.log('══════════════════════════════════════════════════════════════');

    let comprobaciones = 0;
    let fallos = 0;
    for (const r of resultados) {
        comprobaciones += r.af.comprobaciones;
        fallos += r.af.fallos.length;
        console.log(
            '  ' + (r.af.paso ? '✅' : '❌') + '  ' + r.recorrido.nombre.padEnd(46) +
            String(r.af.comprobaciones).padStart(3) + ' comprobaciones'
        );
    }

    for (const s of saltados) {
        console.log('  ⏭️  ' + s.recorrido.nombre.padEnd(46) + ' SALTADO');
        console.log('      ' + s.motivo);
    }

    console.log('');
    if (fallos === 0) {
        console.log('  ' + comprobaciones + ' comprobaciones sobre la interfaz REAL; ninguna regresión.');
    } else {
        console.log('  ' + fallos + ' de ' + comprobaciones + ' comprobaciones FALLARON:');
        for (const r of resultados) {
            for (const f of r.af.fallos) {
                console.log('    · [' + r.recorrido.etiqueta + '] ' + f.descripcion);
                console.log('      ' + f.detalle);
            }
        }
        salida = 1;
    }
    console.log('');

    return salida;
}

async function apagarBackend() {
    if (!backend) return;
    process.stdout.write('· Limpiando el backend de pruebas... ');
    await backend.detener().catch(() => {});
    backend = null;
    console.log('base desechable destruida.');
}

principal()
    .then(async (codigo) => { await apagarBackend(); process.exit(codigo); })
    .catch((err) => {
        console.error('\n❌ ' + (err instanceof ErrorDeGuarda ? '' : 'Error: ') + err.message);
        if (VERBOSO && err.stack) console.error(err.stack);
        process.exit(1);
    });
