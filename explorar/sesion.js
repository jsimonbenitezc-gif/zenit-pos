#!/usr/bin/env node
// ============================================================================
// explorar/sesion.js — ABRE EL ZENIT DE ESCRITORIO Y LO DEJA A MANO
//
//     npm run explorar                 (déjalo corriendo en su terminal)
//     node explorar/z.js ver           (desde otra terminal, o desde un agente)
//
// QUÉ ES ESTO Y EN QUÉ SE DIFERENCIA DEL BANCO (§46).
// `npm run probar:ui` es un guion DETERMINISTA: sabe de antemano qué va a hacer
// y qué tiene que salir. Sirve para que lo ya arreglado no se vuelva a romper,
// y no puede encontrar nada que nadie haya pensado antes.
//
// Esto es lo contrario: no sabe qué va a hacer. Abre la app de verdad sobre un
// negocio realista y la deja disponible COMANDO A COMANDO, para que quien
// explore —una persona o un agente— improvise: cobrar una mesa vacía, teclear
// un precio negativo, cancelar dos veces seguidas, dividir una cuenta entre
// diez. Es el BLOQUE 17 del PLAN_ARREGLOS_V5.
//
// ⚠️ NUNCA TOCA LA BASE DEL USUARIO. Se reutilizan tal cual las guardas del
// banco (pruebas-ui/lib/guardas.js): perfil desechable, comprobado
// EMPÍRICAMENTE preguntándole al proceso de Electron dónde está escribiendo,
// antes de mandar un solo clic. Esta sesión vende, cancela y cierra turnos: con
// la base real, una tarde de exploración le metería ventas falsas al negocio.
//
// Banderas:
//   --sembrar=completo|minimo|ninguno   qué negocio dejar montado (def. completo)
//   --verboso                           vuelca en vivo lo que la app escribe
//   --conservar                         no borra el perfil temporal al salir
// ============================================================================

const fs = require('fs');
const net = require('net');
const path = require('path');

const { abrirApp, esperarArranque } = require('../pruebas-ui/lib/app');
const { leerBase } = require('../pruebas-ui/lib/cajero');
const { ErrorDeGuarda } = require('../pruebas-ui/lib/guardas');
const { COMANDOS, AYUDA } = require('./lib/comandos');
const { sembrar } = require('./lib/sembrar');

const ARCHIVO_SESION = path.join(__dirname, '.sesion.json');
const CARPETA_FOTOS = path.join(__dirname, 'capturas');

const args = process.argv.slice(2);
const bandera = (n, def) => {
    const f = args.find((a) => a.startsWith('--' + n + '='));
    return f ? f.split('=').slice(1).join('=') : def;
};
const VERBOSO = args.includes('--verboso');
const CONSERVAR = args.includes('--conservar');
const NIVEL = bandera('sembrar', 'completo');

let app = null;
let servidor = null;
let cerrando = false;

/**
 * Un cursor sobre la consola de la app.
 *
 * Los errores salen SOLOS al final de cada comando, no solo cuando alguien
 * pregunta por ellos: olvidarse de mirar la consola es exactamente como se
 * pierden estas cosas, y el §46.3 ya estableció que en este proyecto un aviso
 * es un defecto (un SVG mal formado significa un icono que no se dibuja).
 */
function crearCursor(consola) {
    let leidos = 0;
    return {
        get mensajes() { return consola.mensajes; },
        /** Lo aparecido desde la última lectura; avanza el cursor. */
        leerNuevos() {
            const nuevos = consola.mensajes.slice(leidos);
            leidos = consola.mensajes.length;
            return nuevos;
        },
        /** Marca dónde empieza un comando, para poder contar lo que provocó. */
        marca() { return consola.mensajes.length; },
        problemasDesde(marca) {
            return consola.mensajes.slice(marca).filter(
                (m) => m.tipo === 'error' || m.tipo === 'warning' || m.tipo === 'pageerror'
            );
        },
        avanzarHasta(n) { if (n > leidos) leidos = n; },
    };
}

async function ejecutar(ctx, cmd, args) {
    const fn = COMANDOS[cmd];
    if (!fn) {
        return '❌ No existe el comando "' + cmd + '".\n\n' + AYUDA;
    }
    const marca = ctx.consola.marca();
    let texto;
    try {
        texto = await fn(ctx, ...args);
    } catch (e) {
        texto = '❌ El comando reventó: ' + String(e.message).split('\n')[0];
    }

    // Lo que la app escribió MIENTRAS corría este comando, pegado a la
    // respuesta. Así el que explora ve la causa junto al efecto, en vez de
    // encontrársela media hora después mezclada con todo lo demás.
    const problemas = ctx.consola.problemasDesde(marca);
    ctx.consola.avanzarHasta(ctx.consola.mensajes.length);
    if (problemas.length) {
        texto += '\n\n🔴 LA APP ESCRIBIÓ ESTO EN CONSOLA DURANTE ESTE COMANDO:\n' +
            problemas.slice(0, 12).map((p) => '   [' + p.tipo + '] ' + p.texto.slice(0, 300)).join('\n') +
            (problemas.length > 12 ? '\n   …y ' + (problemas.length - 12) + ' más' : '');
    }
    return texto;
}

async function principal() {
    if (fs.existsSync(ARCHIVO_SESION)) {
        const vieja = JSON.parse(fs.readFileSync(ARCHIVO_SESION, 'utf8'));
        let viva = false;
        try { process.kill(vieja.pid, 0); viva = true; } catch { viva = false; }
        if (viva) {
            throw new Error(
                'Ya hay una sesión de exploración abierta (pid ' + vieja.pid + ').\n' +
                '   Ciérrala con:  node explorar/z.js cerrar'
            );
        }
        fs.unlinkSync(ARCHIVO_SESION);   // quedó un archivo de una sesión muerta
    }

    console.log('');
    console.log('══════════════════════════════════════════════════════════════');
    console.log('  SESIÓN DE EXPLORACIÓN — el desktop, abierto y a mano');
    console.log('══════════════════════════════════════════════════════════════');
    process.stdout.write('· Abriendo la app en un perfil desechable... ');

    app = await abrirApp({ etiqueta: 'explorar', verboso: VERBOSO });
    console.log('lista.');
    console.log('  perfil: ' + app.perfil);

    process.stdout.write('· Sembrando el negocio (' + NIVEL + ')... ');
    const siembra = await sembrar(app.ventana, { nivel: NIVEL });
    await esperarArranque(app.ventana);
    console.log('listo.');
    for (const h of siembra.hecho) console.log('    ✓ ' + h);
    for (const f of siembra.fallos) console.log('    ✗ ' + f);
    if (siembra.fallos.length) {
        console.log('  ⚠️ El escenario quedó INCOMPLETO. Tenlo en cuenta antes de');
        console.log('     achacarle a la app una pantalla vacía.');
    }

    const ctx = {
        w: app.ventana,
        electron: app.electron,
        perfil: app.perfil,
        carpetaFotos: CARPETA_FOTOS,
        inicio: Date.now(),
        sembrado: NIVEL,
        consola: crearCursor(app.consola),
        esperarArranque,
        abrirBase: () => leerBase(app.perfil),
    };

    servidor = net.createServer((socket) => {
        let acumulado = '';
        socket.on('data', async (trozo) => {
            acumulado += trozo.toString('utf8');
            const linea = acumulado.indexOf('\n');
            if (linea === -1) return;
            const crudo = acumulado.slice(0, linea);
            acumulado = acumulado.slice(linea + 1);

            let peticion;
            try { peticion = JSON.parse(crudo); }
            catch { socket.end(JSON.stringify({ ok: false, texto: '❌ Petición ilegible.' }) + '\n'); return; }

            if (peticion.cmd === 'cerrar') {
                socket.end(JSON.stringify({ ok: true, texto: 'cerrando la sesión…' }) + '\n');
                setTimeout(() => apagar(0), 150);
                return;
            }

            const texto = await ejecutar(ctx, peticion.cmd, peticion.args || []);
            socket.end(JSON.stringify({ ok: true, texto }) + '\n');
        });
        socket.on('error', () => { /* el cliente se fue; no es asunto nuestro */ });
    });

    await new Promise((res) => servidor.listen(0, '127.0.0.1', res));
    const puerto = servidor.address().port;

    fs.writeFileSync(ARCHIVO_SESION, JSON.stringify({
        puerto, perfil: app.perfil, pid: process.pid, inicio: Date.now(), sembrado: NIVEL,
    }, null, 2));

    console.log('');
    console.log('  Sesión ABIERTA. Desde otra terminal:');
    console.log('');
    console.log('      node explorar/z.js ver');
    console.log('      node explorar/z.js ayuda');
    console.log('      node explorar/z.js cerrar        ← al terminar, SIEMPRE');
    console.log('');
    console.log('  (Ctrl+C aquí también la cierra y borra el perfil temporal.)');
    console.log('');
}

async function apagar(codigo) {
    if (cerrando) return;
    cerrando = true;
    try { if (servidor) servidor.close(); } catch { /* da igual */ }
    try { fs.unlinkSync(ARCHIVO_SESION); } catch { /* ya no estaba */ }
    if (app) {
        if (CONSERVAR) {
            await app.cerrar();
            console.log('\n· Perfil CONSERVADO en: ' + app.perfil);
        } else {
            await app.destruir();
            console.log('\n· Perfil temporal destruido.');
        }
    }
    process.exit(codigo);
}

process.on('SIGINT', () => apagar(0));
process.on('SIGTERM', () => apagar(0));

principal().catch(async (err) => {
    console.error('\n❌ ' + (err instanceof ErrorDeGuarda ? '' : 'Error: ') + err.message);
    if (VERBOSO && err.stack) console.error(err.stack);
    await apagar(1);
});
