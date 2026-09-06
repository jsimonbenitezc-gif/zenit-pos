#!/usr/bin/env node
// ============================================================================
// explorar/z.js — UN COMANDO CONTRA LA SESIÓN ABIERTA
//
//     node explorar/z.js ver
//     node explorar/z.js clic "boton:Cobrar"
//     node explorar/z.js sql "SELECT id, total FROM pedidos ORDER BY id DESC LIMIT 5"
//     node explorar/z.js cerrar
//
// Se llama UNA VEZ POR ACCIÓN y termina. Es a propósito: así explorar es una
// conversación de idas y vueltas —mirar, tocar, volver a mirar— y no un guion
// escrito de antemano, que es justo lo que ya cubre `npm run probar:ui` (§46).
//
// La app vive en el proceso de `explorar/sesion.js`; aquí solo se le habla por
// un socket local. Si no hay sesión abierta, se dice cómo abrirla.
// ============================================================================

const fs = require('fs');
const net = require('net');
const path = require('path');

const ARCHIVO_SESION = path.join(__dirname, '.sesion.json');

function leerSesion() {
    if (!fs.existsSync(ARCHIVO_SESION)) {
        console.error('No hay ninguna sesión de exploración abierta.');
        console.error('');
        console.error('  Ábrela en otra terminal y déjala corriendo:');
        console.error('      npm run explorar');
        console.error('');
        process.exit(2);
    }
    return JSON.parse(fs.readFileSync(ARCHIVO_SESION, 'utf8'));
}

async function principal() {
    const [cmd, ...args] = process.argv.slice(2);
    if (!cmd) {
        console.log(require('./lib/comandos').AYUDA);
        return 0;
    }

    const sesion = leerSesion();

    const respuesta = await new Promise((resolver, rechazar) => {
        const socket = net.connect(sesion.puerto, '127.0.0.1');
        let acumulado = '';

        // Un comando puede tardar: `esperar 20000`, un cierre de turno, una
        // recarga. El tope está por encima del más lento a propósito — cortar
        // antes deja la app a medio camino y el siguiente comando ve un estado
        // que nadie pidió, que es la peor manera de explorar.
        socket.setTimeout(120000);

        socket.on('connect', () => socket.write(JSON.stringify({ cmd, args }) + '\n'));
        socket.on('data', (t) => {
            acumulado += t.toString('utf8');
            const fin = acumulado.indexOf('\n');
            if (fin !== -1) { resolver(JSON.parse(acumulado.slice(0, fin))); socket.end(); }
        });
        socket.on('timeout', () => { socket.destroy(); rechazar(new Error('la sesión no contestó en 120 s')); });
        socket.on('error', (e) => rechazar(new Error(
            e.code === 'ECONNREFUSED'
                ? 'hay un .sesion.json pero nadie escucha en el puerto ' + sesion.puerto +
                  '.\n   La sesión anterior murió: borra explorar/.sesion.json y vuelve a abrirla.'
                : e.message
        )));
        socket.on('close', () => { if (!acumulado) rechazar(new Error('la sesión cerró sin contestar')); });
    });

    console.log(respuesta.texto);
    return respuesta.ok ? 0 : 1;
}

principal()
    .then((c) => process.exit(c))
    .catch((e) => { console.error('❌ ' + e.message); process.exit(1); });
