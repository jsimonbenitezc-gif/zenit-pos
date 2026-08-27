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
function limpiar(src) {
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
            const q = c; i++;
            while (i < n && src[i] !== q) { if (src[i] === '\\') i++; i++; }
            i++; out += '""'; continue;
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

console.log(`Scripts analizados: ${archivos.length}`);
if (sospechosas.length === 0) {
    console.log('✅ Ninguna función llamada sin definir.');
    process.exit(0);
}

console.log('\n⚠️  LLAMADAS SIN DEFINICIÓN — alguien las usa y nadie las escribió:\n');
for (const [nombre, veces] of sospechosas) {
    console.log(`   ${nombre.padEnd(34)} ${veces} uso${veces === 1 ? '' : 's'}`);
}
console.log('\nComprueba cada una desde zenit-pos-desktop/pos con:');
console.log("   PowerShell:  Select-String 'function NOMBRE' *.js");
console.log("   Bash:        grep -rn 'function NOMBRE' *.js");
// Código 1 para que sirva como puerta antes de compilar (CLAUDE.md §21).
process.exit(1);
