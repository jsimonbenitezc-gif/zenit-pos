// ============================================================================
// pruebas-ui/lib/app.js — abre el Zenit de escritorio DE VERDAD y lo vigila
//
// Se lanza el mismo Electron que `npm start`, con el mismo `pos/main.js`, el
// mismo preload y la misma SQLite. Lo único que cambia es DÓNDE escribe: un
// perfil desechable (lib/guardas.js).
//
// ⚠️ POR QUÉ SE HACE CLIC Y NO SE LLAMAN LAS FUNCIONES. Se puede llamar a
// `ejecutarVenta()` desde `win.evaluate` y ahorrarse media docena de clics. No se
// hace, y no es purismo: los cuatro fantasmas del desktop —`fmt()` (§28),
// `_desgloseMesa()` (§29), los cuatro botones muertos, `buscarClientePorTelefono`
// (§36)— eran justamente funciones que EXISTÍAN en un archivo y no estaban
// cableadas a nada. Llamarlas a mano las habría dado por buenas. Hay que tocar el
// botón que toca el cajero.
//
// LA CONSOLA ES PARTE DE LA PRUEBA. El BLOQUE 16 pide "fallar ante cualquier error
// en la consola", y hoy eso es exigible: en una instalación nueva las 11 vistas
// arrancan con CERO errores y CERO avisos. Nada de listas de "ruido conocido": una
// lista así crece sola y acaba tapando el error de verdad.
// ============================================================================

const path = require('path');
const fs = require('fs');
const { _electron } = require('playwright-core');

const { crearPerfilDesechable, comprobarQueEscribeEnElPerfil, destruirPerfil } = require('./guardas');

const RAIZ = path.join(__dirname, '..', '..');

/**
 * Todo lo que la app escribió en consola, con el momento del recorrido en el que
 * lo escribió. Sin ese "dónde", un error suelto al final del reporte no dice en
 * qué pantalla apareció y hay que volver a correrlo entero para encontrarlo.
 */
/**
 * Lo que se le perdona a un recorrido que DESENCHUFA la red a propósito.
 *
 * Es la única excepción del banco y está acotada al mínimo: solo aplica dentro de
 * una ventana que el recorrido declara (`consola.redSeCayo(true)`) y solo a
 * mensajes con forma de fallo de red. Un ReferenceError durante esa ventana sigue
 * tumbando el recorrido, que es justo lo que interesa: la pregunta es si la app
 * SE PORTA BIEN sin servidor, no si se calla.
 */
const RUIDO_DE_RED = [
    /Failed to load resource/i,
    /net::ERR_/i,
    /Failed to fetch/i,
    /API Request Error/i,
    /tardó demasiado en responder/i,
    /del backend/i,
    /sincronización desde backend/i,
    /syncDesdeBackend|subirPendientes|cargarSucursales/i,
    /validar la sesión/i,
    /billing.sync/i,
    /error nube/i,
    /Cat.logo de (modificadores|venta)/i,
    /Error cargando sucursales/i,
];

class Consola {
    constructor() {
        this.mensajes = [];
        this.paso = 'arranque';
        this.redCaida = false;
    }

    enPaso(nombre) { this.paso = nombre; }

    /** Abre o cierra la ventana en la que se espera que la red falle. */
    redSeCayo(valor) { this.redCaida = Boolean(valor); }

    anotar(tipo, texto) {
        this.mensajes.push({ tipo, texto, paso: this.paso, redCaida: this.redCaida });
    }

    /** Errores y avisos: los dos son defectos. Un aviso de Chromium sobre un SVG
     *  roto significa que un icono no se dibuja, y eso lo ve el usuario. */
    get problemas() {
        return this.mensajes.filter((m) => {
            if (m.tipo !== 'error' && m.tipo !== 'warning' && m.tipo !== 'pageerror') return false;
            if (m.redCaida && RUIDO_DE_RED.some((r) => r.test(m.texto))) return false;
            return true;
        });
    }
}

/**
 * Abre la app y espera a que termine de arrancar.
 *
 * @param {object} opciones
 * @param {string} opciones.etiqueta   nombre del recorrido (va en la carpeta temporal)
 * @param {string=} opciones.perfil    reusar un perfil ya creado (segundo arranque)
 * @param {boolean=} opciones.verboso  volcar lo que la app escribe en consola
 */
async function abrirApp({ etiqueta = 'recorrido', perfil = null, verboso = false } = {}) {
    const carpeta = perfil || crearPerfilDesechable(etiqueta);
    const consola = new Consola();

    const electron = await _electron.launch({
        args: [RAIZ, '--user-data-dir=' + carpeta],
        executablePath: require(path.join(RAIZ, 'node_modules', 'electron')),
        cwd: RAIZ,
        timeout: 60000,
    });

    // La guarda empírica va ANTES de tocar nada: si la app resultó estar escribiendo
    // en otra parte, no se le manda ni un clic.
    await comprobarQueEscribeEnElPerfil(electron, carpeta);

    const ventana = await electron.firstWindow();
    ventana.on('console', (m) => {
        consola.anotar(m.type(), m.text());
        if (verboso) console.log('        [' + m.type() + '] ' + m.text());
    });
    ventana.on('pageerror', (e) => {
        consola.anotar('pageerror', e.message);
        if (verboso) console.log('        [pageerror] ' + e.message);
    });

    await ventana.waitForLoadState('domcontentloaded');
    await esperarArranque(ventana);

    return {
        electron,
        ventana,
        consola,
        perfil: carpeta,

        /** Cierra la app conservando el perfil (para volver a abrirla). */
        async cerrar() {
            try { await electron.close(); } catch { /* ya se había ido */ }
        },

        /** Cierra y destruye el perfil. */
        async destruir() {
            await this.cerrar();
            destruirPerfil(carpeta);
        },

        /** Foto de la pantalla, para poder MIRAR un fallo sin re-ejecutar. */
        async foto(nombre) {
            const destino = path.join(__dirname, '..', 'capturas', nombre + '.png');
            fs.mkdirSync(path.dirname(destino), { recursive: true });
            try { await ventana.screenshot({ path: destino }); return destino; } catch { return null; }
        },
    };
}

/**
 * Espera a que el arranque del renderer termine.
 *
 * `render.js` encadena en su DOMContentLoaded el bloqueo de sesión, el perfil, el
 * turno y cinco cargas de configuración; y `crearDatosEjemplo` inserta los
 * productos de ejemplo un segundo DESPUÉS de abrir la base. Empezar a hacer clic
 * antes de eso produce fallos que no son de la app, sino de la prisa.
 */
async function esperarArranque(ventana) {
    await ventana.waitForSelector('.menu-item[data-view="dashboard"]', { state: 'visible', timeout: 30000 });
    // El tablero es lo primero que se pinta; su KPI deja de ser el "$0.00" del HTML
    // en cuanto la consulta responde. Si el negocio no vendió nada, se queda en
    // $0.00 igual, así que esto no puede ser una espera dura: es un margen.
    await ventana.waitForTimeout(2500);
}

module.exports = { abrirApp, esperarArranque, RAIZ };
