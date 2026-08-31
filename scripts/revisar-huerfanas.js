#!/usr/bin/env node
/**
 * Busca funciones LLAMADAS pero nunca DEFINIDAS en el desktop.
 *
 * ─── POR QUÉ EXISTE ──────────────────────────────────────────────────────────
 * El desktop NO tiene pruebas ni paso de compilación, así que una función que se
 * referencia y nunca se escribe no se nota hasta que alguien abre esa vista.
 * Ya pasó TRES veces:
 *
 *   · `fmt()`            — usada 14 veces en modulo-turno.js, definida en ninguna.
 *                          La vista de Turno quedaba a medio pintar (CLAUDE.md §28).
 *   · `_desgloseMesa()`  — referenciada en 5 lugares por el Bloque 8 y nunca escrita.
 *                          Reventaba la vista de mesas ENTERA (§29).
 *   · 4 botones muertos  — eliminarProductoAdmin, eliminarCategoriaAdmin,
 *                          mostrarVista, mostrarToast (2026-08-26).
 *   · buscarClientePorTelefono — llamada en modulo-clientes.js y ausente de
 *                          preload.js, main.js y db.js. El autocompletado del
 *                          pedido a domicilio nunca funcionó (§36, 2026-08-28).
 *                          La PARTE 2 de este script existe por ese caso.
 *
 * Las tres se descubrieron por accidente. Este script las encuentra en un segundo.
 *
 * ─── ESTADO ──────────────────────────────────────────────────────────────────
 * Funciona y no da falsos positivos (2026-08-27). Verificado en los dos sentidos:
 * sobre el código actual reporta CERO, y sobre `modulo-mesas.js` de antes del
 * arreglo detecta `_desgloseMesa` — el bug real que tuvo la vista de mesas rota
 * un mes. Sale con código 1 si encuentra algo, así que sirve como puerta.
 *
 * Uso:  npm run revisar
 *       node scripts/revisar-huerfanas.js
 */
const fs = require('fs');
const path = require('path');

/**
 * ¿El `/` que hay en `i` empieza una expresión regular, o es una división?
 *
 * Se decide por el último carácter significativo: tras un operador, una coma,
 * un paréntesis de apertura o una palabra clave, lo que sigue es un valor —y por
 * tanto una regex—; tras un identificador, un número o un cierre, es división.
 */
function empiezaRegex(src, i) {
    let j = i - 1;
    while (j >= 0 && /\s/.test(src[j])) j--;
    if (j < 0) return true;
    const c = src[j];
    if ('(,=:[!&|?{};+-*~^%<>'.includes(c)) return true;
    // `return /re/`, `typeof /re/`, `case /re/`… (palabra clave pegada al slash)
    const palabra = src.slice(Math.max(0, j - 9), j + 1).match(/[A-Za-z_$][\w$]*$/);
    return palabra ? ['return', 'typeof', 'case', 'in', 'of', 'new', 'delete', 'void', 'do', 'else', 'instanceof']
        .includes(palabra[0]) : false;
}

/**
 * Quita comentarios, literales de cadena y expresiones regulares, para no contar
 * palabras de prosa como si fueran código.
 *
 * ⚠️ Las EXPRESIONES REGULARES hay que saltarlas de verdad, no solo las cadenas:
 * `render.js` tiene `.replace(/"/g, …)` y `.replace(/'/g, …)` en las líneas 14-15,
 * y un limpiador que solo entiende cadenas toma esas comillas como apertura y se
 * come el resto del archivo. Resultado: TODO lo definido en render.js
 * (`alertaZenit`, `confirmarZenit`, `mostrarNotificacionExito`…) salía como
 * "llamada sin definición" — 24 falsos positivos que hacían inservible el reporte.
 *
 * ⚠️ Y las PLANTILLAS ANIDADAS también: `modulo-turno.js` arma HTML con
 * `${cond ? `<div>Propinas (no son ventas)</div>` : ''}`. Sin llevar una pila, el
 * texto de la plantilla interior se cuela como si fuera código y "Propinas ("
 * parece una llamada a función.
 */
/**
 * @param {boolean} conservarCadenas  Con `true` se mantiene el TEXTO de las cadenas
 *   (se siguen quitando comentarios y expresiones regulares). Lo necesita la PARTE 2:
 *   los canales de IPC SON cadenas, y con el borrado normal ipcMain.handle('x')
 *   quedaba en ipcMain.handle("") y no se encontraba ni un canal.
 */
function limpiar(src, conservarCadenas = false) {
    let out = '';
    let i = 0;
    const n = src.length;

    // Pila para plantillas anidadas. Cada nivel es o bien 'texto' (dentro de las
    // comillas invertidas, donde nada es código) o un número de llaves abiertas
    // dentro de un `${...}` (donde SÍ es código y hay que seguir analizándolo).
    const pila = [];
    const enTexto = () => pila.length > 0 && pila[pila.length - 1] === 'texto';

    while (i < n) {
        const c = src[i], d = src[i + 1];

        // ── Dentro del texto de una plantilla: solo importan ` y ${ ──────────
        if (enTexto()) {
            if (c === '\\') { i += 2; continue; }
            if (c === '`') { pila.pop(); i++; out += ' '; continue; }
            if (c === '$' && d === '{') { pila.push(0); i += 2; out += ' '; continue; }
            i++; out += ' ';
            continue;
        }

        // ── Modo código ──────────────────────────────────────────────────────
        if (c === '/' && d === '/') { while (i < n && src[i] !== '\n') i++; continue; }
        if (c === '/' && d === '*') { i += 2; while (i < n && !(src[i] === '*' && src[i + 1] === '/')) i++; i += 2; continue; }
        if (c === '/' && empiezaRegex(src, i)) {
            i++;
            let enClase = false;
            while (i < n) {
                if (src[i] === '\\') { i += 2; continue; }
                if (src[i] === '[') enClase = true;
                else if (src[i] === ']') enClase = false;
                else if (src[i] === '/' && !enClase) { i++; break; }
                else if (src[i] === '\n') break;   // regex sin cerrar: era división
                i++;
            }
            while (i < n && /[gimsuyd]/.test(src[i])) i++;   // banderas
            out += ' ';
            continue;
        }
        if (c === '"' || c === "'") {
            const q = c; const desde = i; i++;
            while (i < n && src[i] !== q) { if (src[i] === '\\') i++; i++; }
            i++;
            out += conservarCadenas ? src.slice(desde, i) : '""';
            continue;
        }
        if (c === '`') { pila.push('texto'); i++; out += ' '; continue; }

        // Llaves: cierran la interpolación y devuelven al texto de la plantilla.
        if (pila.length > 0 && typeof pila[pila.length - 1] === 'number') {
            if (c === '{') { pila[pila.length - 1]++; }
            else if (c === '}') {
                if (pila[pila.length - 1] === 0) { pila.pop(); i++; out += ' '; continue; }
                pila[pila.length - 1]--;
            }
        }

        out += c; i++;
    }
    return out;
}

const RAIZ = fs.existsSync('index.html') ? '.' : path.join(__dirname, '..', 'pos');
const html = fs.readFileSync(path.join(RAIZ, 'index.html'), 'utf8');

// Se analizan los scripts en el MISMO orden en que los carga index.html.
const archivos = [...html.matchAll(/<script src="([^"]+\.js)"><\/script>/g)]
    .map(m => m[1])
    .filter(f => fs.existsSync(path.join(RAIZ, f)));

let fuente = '';
for (const f of archivos) fuente += '\n' + limpiar(fs.readFileSync(path.join(RAIZ, f), 'utf8'));

const definidas = new Set();
for (const m of fuente.matchAll(/\bfunction\s*\*?\s*([A-Za-z_$][\w$]*)\s*\(/g)) definidas.add(m[1]);
for (const m of fuente.matchAll(/\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=/g)) definidas.add(m[1]);
for (const m of fuente.matchAll(/\bclass\s+([A-Za-z_$][\w$]*)/g)) definidas.add(m[1]);
for (const m of fuente.matchAll(/^\s*(?:async\s+)?([A-Za-z_$][\w$]*)\s*\([^)]*\)\s*\{/gm)) definidas.add(m[1]);
for (const m of fuente.matchAll(/([A-Za-z_$][\w$]*)\s*:\s*(?:async\s*)?(?:function|\()/g)) definidas.add(m[1]);
for (const m of fuente.matchAll(/\((?:async\s*)?([^)]*)\)\s*=>/g)) {
    for (const parte of m[1].split(',')) {
        const nombre = parte.trim().split('=')[0].trim().replace(/^\.\.\./, '');
        if (/^[A-Za-z_$][\w$]*$/.test(nombre)) definidas.add(nombre);
    }
}
for (const m of fuente.matchAll(/\bfunction\s*\*?\s*[A-Za-z_$]*\s*\(([^)]*)\)/g)) {
    for (const parte of m[1].split(',')) {
        const nombre = parte.trim().split('=')[0].trim().replace(/^\.\.\./, '');
        if (/^[A-Za-z_$][\w$]*$/.test(nombre)) definidas.add(nombre);
    }
}
for (const m of fuente.matchAll(/\b(?:const|let|var)\s*\{([^}]*)\}\s*=/g)) {
    for (const parte of m[1].split(',')) {
        const nombre = parte.split(':').pop().trim().split('=')[0].trim();
        if (/^[A-Za-z_$][\w$]*$/.test(nombre)) definidas.add(nombre);
    }
}

const GLOBALES = new Set([
    'window', 'document', 'console', 'JSON', 'Math', 'Date', 'Number', 'String', 'Boolean',
    'Array', 'Object', 'Promise', 'Set', 'Map', 'WeakMap', 'RegExp', 'Error', 'parseInt',
    'parseFloat', 'isNaN', 'isFinite', 'setTimeout', 'setInterval', 'clearTimeout',
    'clearInterval', 'requestAnimationFrame', 'fetch', 'localStorage', 'sessionStorage',
    'alert', 'confirm', 'prompt', 'encodeURIComponent', 'decodeURIComponent', 'Intl', 'URL',
    'URLSearchParams', 'Blob', 'FileReader', 'Image', 'EventSource', 'FormData', 'navigator',
    'location', 'history', 'CustomEvent', 'Event', 'Symbol', 'BigInt', 'Proxy', 'Reflect',
    'structuredClone', 'require', 'module', 'exports', 'process', 'Buffer', 'queueMicrotask',
    'AbortController', 'TextEncoder', 'TextDecoder', 'btoa', 'atob', 'crypto', 'performance',
    'getComputedStyle', 'MutationObserver', 'IntersectionObserver', 'ResizeObserver', 'Element',
    'HTMLElement', 'Node', 'DOMParser', 'Audio', 'Uint8Array', 'Chart',
    // Palabras que la expresión de abajo confunde con llamadas.
    'if', 'for', 'while', 'switch', 'catch', 'return', 'typeof', 'function', 'super', 'this',
    'new', 'do', 'else', 'try', 'await', 'of', 'in', 'not', 'var', 'async', 'constructor',
    'key', 'value', 'item', 'index', 'callback', 'resolve', 'reject',
]);

const llamadas = new Map();
const re = /(^|[^.\w$])([A-Za-z_$][\w$]*)\s*\(/g;
let m;
while ((m = re.exec(fuente)) !== null) {
    const nombre = m[2];
    if (GLOBALES.has(nombre) || definidas.has(nombre)) continue;
    llamadas.set(nombre, (llamadas.get(nombre) || 0) + 1);
}

const sospechosas = [...llamadas.entries()].sort((a, b) => b[1] - a[1]);

// ════════════════════════════════════════════════════════════════════════════
// PARTE 1 — Funciones llamadas y nunca definidas.
// ════════════════════════════════════════════════════════════════════════════
let hayProblemas = false;

console.log(`Scripts analizados: ${archivos.length}`);
if (sospechosas.length === 0) {
    console.log('✅ Ninguna función llamada sin definir.');
} else {
    hayProblemas = true;
    console.log('\n⚠️  LLAMADAS SIN DEFINICIÓN — alguien las usa y nadie las escribió:\n');
    for (const [nombre, veces] of sospechosas) {
        console.log(`   ${nombre.padEnd(34)} ${veces} uso${veces === 1 ? '' : 's'}`);
    }
    console.log('\nComprueba cada una desde zenit-pos-desktop/pos con:');
    console.log("   PowerShell:  Select-String 'function NOMBRE' *.js");
    console.log("   Bash:        grep -rn 'function NOMBRE' *.js");
}

// ════════════════════════════════════════════════════════════════════════════
// PARTE 2 — El PUENTE renderer ↔ main: window.api → preload → ipcMain.
//
// ─── POR QUÉ EXISTE ─────────────────────────────────────────────────────────
// La parte 1 solo mira funciones GLOBALES, así que se le escapa entera la otra
// mitad del desktop: los métodos que el renderer invoca a través del preload.
// Un `window.api.loQueSea()` que nadie expuso no es una función indefinida —es
// una propiedad `undefined` de un objeto que sí existe—, y revienta igual con
// un TypeError en cuanto alguien abre esa pantalla.
//
// Pasó de verdad: `buscarClientePorTelefono` llevaba MESES llamada en
// modulo-clientes.js sin estar en preload.js, sin handler en main.js y sin
// función en db.js (CLAUDE.md §36). El autocompletado del pedido a domicilio
// nunca funcionó y `npm run revisar` daba verde.
//
// Se comprueban los tres eslabones de la cadena:
//   A) `window.api.X` usado en pos/ pero NO expuesto en preload.js  → TypeError.
//   B) preload hace `invoke('canal')` y main.js no lo atiende       → promesa rechazada.
//   C) preload escucha `on('canal')` y main.js nunca lo emite       → callback muerto.
//
// El inventario de preload se saca EJECUTÁNDOLO con un `electron` de mentira y
// leyendo las claves reales del objeto, no con una expresión regular: así da
// igual cómo esté formateado el archivo.
// ════════════════════════════════════════════════════════════════════════════
console.log('');

const rutaPreload = path.join(RAIZ, 'preload.js');
const rutaMain = path.join(RAIZ, 'main.js');

let expuestos = null;
if (fs.existsSync(rutaPreload)) {
    const fuentePreload = fs.readFileSync(rutaPreload, 'utf8');
    const nulo = () => {};
    const electronFalso = {
        contextBridge: { exposeInMainWorld: (nombre, obj) => { if (nombre === 'api') expuestos = obj; } },
        ipcRenderer: { invoke: nulo, on: nulo, once: nulo, send: nulo, removeListener: nulo },
    };
    try {
        // eslint-disable-next-line no-new-func
        new Function('require', 'console', 'module', 'exports', fuentePreload)(
            (n) => { if (n === 'electron') return electronFalso; throw new Error('preload requiere ' + n); },
            { log: nulo, warn: nulo, error: nulo },
            { exports: {} }, {}
        );
    } catch (e) {
        console.log(`⚠️  No se pudo leer preload.js (${e.message}); se omite la revisión del puente.`);
    }
}

if (!expuestos) {
    console.log('⚠️  preload.js no expuso `api`; se omite la revisión del puente.');
} else {
    const claves = new Set(Object.keys(expuestos));

    // ── A) window.api.X sin exponer ──────────────────────────────────────────
    // Se busca sobre la fuente YA LIMPIADA: si no, el `window.api.X` de un
    // comentario que explica esta misma revisión saldría como fallo.
    const usados = new Map();
    for (const m of fuente.matchAll(/window\s*\.\s*api\s*\??\s*\.\s*([A-Za-z_$][\w$]*)/g)) {
        if (!claves.has(m[1])) usados.set(m[1], (usados.get(m[1]) || 0) + 1);
    }

    if (usados.size === 0) {
        console.log(`✅ Los ${claves.size} métodos de window.api usados están expuestos en preload.js.`);
    } else {
        hayProblemas = true;
        console.log('\n⚠️  window.api SIN EXPONER — el renderer los llama y preload.js no los tiene:\n');
        for (const [nombre, veces] of [...usados.entries()].sort((a, b) => b[1] - a[1])) {
            console.log(`   window.api.${nombre.padEnd(30)} ${veces} uso${veces === 1 ? '' : 's'}`);
        }
        console.log('\nCada uno necesita los TRES eslabones: función en database/db.js,');
        console.log('`ipcMain.handle` en pos/main.js y la entrada en pos/preload.js.');
    }

    // ── B) y C) canales de IPC sin la otra punta ─────────────────────────────
    if (fs.existsSync(rutaMain)) {
        const fuenteMain = limpiar(fs.readFileSync(rutaMain, 'utf8'), true);
        const fuentePreloadLimpia = limpiar(fs.readFileSync(rutaPreload, 'utf8'), true);

        const atendidos = new Set();
        for (const m of fuenteMain.matchAll(/ipcMain\s*\.\s*(?:handle|handleOnce|on|once)\s*\(\s*["']([^"']+)["']/g)) atendidos.add(m[1]);
        const emitidos = new Set();
        for (const m of fuenteMain.matchAll(/\.\s*send\s*\(\s*["']([^"']+)["']/g)) emitidos.add(m[1]);

        const sinHandler = new Set();
        for (const m of fuentePreloadLimpia.matchAll(/ipcRenderer\s*\.\s*(?:invoke|send)\s*\(\s*["']([^"']+)["']/g)) {
            if (!atendidos.has(m[1])) sinHandler.add(m[1]);
        }
        const sinEmisor = new Set();
        for (const m of fuentePreloadLimpia.matchAll(/ipcRenderer\s*\.\s*(?:on|once)\s*\(\s*["']([^"']+)["']/g)) {
            if (!emitidos.has(m[1])) sinEmisor.add(m[1]);
        }

        if (sinHandler.size === 0 && sinEmisor.size === 0) {
            console.log(`✅ Los ${atendidos.size} canales de IPC del preload tienen su contraparte en main.js.`);
        }
        if (sinHandler.size > 0) {
            hayProblemas = true;
            console.log('\n⚠️  CANALES SIN HANDLER — preload los invoca y main.js no los atiende:\n');
            for (const canal of sinHandler) console.log(`   ${canal}`);
            console.log("\nFalta un `ipcMain.handle('canal', ...)` en pos/main.js.");
        }
        if (sinEmisor.size > 0) {
            hayProblemas = true;
            console.log('\n⚠️  ESCUCHAS SIN EMISOR — preload escucha canales que main.js nunca manda:\n');
            for (const canal of sinEmisor) console.log(`   ${canal}`);
            console.log('\nO sobra la escucha, o falta el `webContents.send` en pos/main.js.');
        }
    }
}

// Código 1 para que sirva como puerta antes de compilar (CLAUDE.md §21).
process.exit(hayProblemas ? 1 : 0);
