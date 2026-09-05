// ============================================================================
// pruebas-ui/lib/guardas.js — LA BASE DEL USUARIO NO SE TOCA JAMÁS
//
// El desktop guarda TODO en `app.getPath('userData')/ventas.db`: el catálogo, los
// pedidos, los turnos y los ajustes del negocio. En una máquina de desarrollo esa
// carpeta es la del Zenit REAL del dueño, con sus ventas de verdad.
//
// Este banco arranca la app y le vende, le cancela pedidos y le cierra turnos.
// Si apuntara a esa base, una corrida le metería ventas falsas al negocio y —peor
// todavía— el recorrido de "borrar datos locales" le vaciaría el historial. Es el
// mismo riesgo que en el backend resolvió `pruebas-postgres/lib/guardas.js` con
// una base desechable (CLAUDE.md §38.2), y aquí se resuelve igual: una carpeta de
// perfil NUEVA por corrida, que se destruye al terminar.
//
// La defensa es el interruptor `--user-data-dir` de Chromium, que Electron respeta
// para `app.getPath('userData')` — comprobado: con él, `ventas.db` aparece dentro
// de la carpeta temporal y la real no se abre siquiera. Pero un interruptor que se
// olvida de pasar no protege de nada, así que estas funciones EXIGEN que el perfil
// sea temporal y esté vacío antes de dejar arrancar la app.
// ============================================================================

const fs = require('fs');
const os = require('os');
const path = require('path');

class ErrorDeGuarda extends Error {}

/** Normaliza para comparar rutas en Windows (mayúsculas y barras dan igual). */
function normalizar(p) {
    return path.resolve(p).replace(/[\/]+$/, '').toLowerCase();
}

/**
 * Crea una carpeta de perfil desechable y comprueba que NO es la del usuario.
 *
 * Las tres condiciones son independientes a propósito: si alguna se relaja por
 * accidente, las otras dos siguen en pie.
 */
function crearPerfilDesechable(etiqueta = 'recorrido') {
    const perfil = fs.mkdtempSync(path.join(os.tmpdir(), 'zenit-ui-' + etiqueta + '-'));

    // 1. Tiene que estar DENTRO del temporal del sistema.
    if (!normalizar(perfil).startsWith(normalizar(os.tmpdir()))) {
        throw new ErrorDeGuarda('El perfil de pruebas no quedó dentro del temporal: ' + perfil);
    }

    // 2. No puede ser la carpeta real de la app instalada, en ningún sistema.
    for (const real of carpetasRealesConocidas()) {
        if (normalizar(perfil) === normalizar(real)) {
            throw new ErrorDeGuarda('El perfil de pruebas apunta a los datos REALES: ' + perfil);
        }
    }

    // 3. Tiene que estar vacía: si trae un ventas.db, es una base de alguien.
    const contenido = fs.readdirSync(perfil);
    if (contenido.length > 0) {
        throw new ErrorDeGuarda('El perfil de pruebas nació con archivos dentro: ' + contenido.join(', '));
    }

    return perfil;
}

/** Dónde guardaría sus datos un Zenit instalado, según el sistema. */
function carpetasRealesConocidas() {
    const nombre = 'zenit-pos';
    const rutas = [];
    if (process.env.APPDATA) rutas.push(path.join(process.env.APPDATA, nombre));
    if (process.env.HOME) {
        rutas.push(path.join(process.env.HOME, 'Library', 'Application Support', nombre));
        rutas.push(path.join(process.env.HOME, '.config', nombre));
    }
    return rutas;
}

/**
 * Comprobación EMPÍRICA, la que de verdad cierra el asunto: se le pregunta al
 * proceso de Electron ya arrancado dónde está escribiendo. Las dos anteriores
 * comprueban lo que pedimos; ésta comprueba lo que pasó. Si `--user-data-dir`
 * dejara de funcionar en una versión futura de Electron, aquí se nota al instante
 * y no cuando falte un historial de ventas.
 */
async function comprobarQueEscribeEnElPerfil(appElectron, perfil) {
    const real = await appElectron.evaluate(async ({ app }) => app.getPath('userData'));
    if (normalizar(real) !== normalizar(perfil)) {
        throw new ErrorDeGuarda(
            'La app NO está escribiendo en el perfil desechable.\n' +
            '   pedido:   ' + perfil + '\n' +
            '   real:     ' + real + '\n' +
            '   Se aborta: con esta ruta, el recorrido escribiría en la base de alguien.'
        );
    }
    return real;
}

/** Borra el perfil. Nunca lanza: no vale la pena tumbar una corrida por esto. */
function destruirPerfil(perfil) {
    try {
        fs.rmSync(perfil, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
        return true;
    } catch {
        return false;
    }
}

module.exports = {
    ErrorDeGuarda,
    crearPerfilDesechable,
    comprobarQueEscribeEnElPerfil,
    destruirPerfil,
    carpetasRealesConocidas,
};
