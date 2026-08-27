#!/usr/bin/env node
/**
 * PROTOTIPO — Busca funciones LLAMADAS pero nunca DEFINIDAS en el desktop.
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
 * ─── ESTADO: PROTOTIPO, NO TERMINADO ─────────────────────────────────────────
 * ⚠️ El limpiador de cadenas se atraganta con `render.js` (probablemente una
 * expresión regular con comillas dentro), así que reporta como "sin definir"
 * cosas que SÍ existen ahí: `alertaZenit`, `confirmarZenit`,
 * `mostrarNotificacionExito` y compañía. **Arreglar eso antes de darlo por bueno
 * y de engancharlo a `npm run revisar`.** Es la tarea 2 del BLOQUE 16
 * (`PLAN_ARREGLOS_V5.md`).
 *
 * Mientras tanto sirve igual: si aparece un nombre que NO está en render.js, es
 * un bug de verdad. Así se encontraron los cuatro botones muertos.
 *
 * Uso:  node scripts/revisar-huerfanas.js     (desde zenit-pos-desktop/pos)
 */
const fs = require('fs');
const path = require('path');

/** Quita comentarios y literales de cadena para no contar palabras de prosa. */
function limpiar(src) {
    let out = '';
    let i = 0;
    const n = src.length;
    while (i < n) {
        const c = src[i], d = src[i + 1];
        if (c === '/' && d === '/') { while (i < n && src[i] !== '\n') i++; continue; }
        if (c === '/' && d === '*') { i += 2; while (i < n && !(src[i] === '*' && src[i + 1] === '/')) i++; i += 2; continue; }
        if (c === '"' || c === "'") {
            const q = c; i++;
            while (i < n && src[i] !== q) { if (src[i] === '\\') i++; i++; }
            i++; out += '""'; continue;
        }
        if (c === '`') {
            // Las plantillas SÍ importan: `${loQueSea()}` es código real. Se
            // conserva solo el interior de las interpolaciones.
            i++;
            let prof = 0;
            while (i < n) {
                if (src[i] === '\\') { i += 2; continue; }
                if (src[i] === '`' && prof === 0) { i++; break; }
                if (src[i] === '$' && src[i + 1] === '{') { prof++; i += 2; out += ' '; continue; }
                if (prof > 0) {
                    if (src[i] === '{') prof++;
                    else if (src[i] === '}') { prof--; out += ' '; i++; continue; }
                    out += src[i];
                }
                i++;
            }
            continue;
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

console.log('\n⚠️  LLAMADAS SIN DEFINICIÓN (revisa a mano: hay falsos positivos de render.js):\n');
for (const [nombre, veces] of sospechosas) {
    console.log(`   ${nombre.padEnd(34)} ${veces} uso${veces === 1 ? '' : 's'}`);
}
console.log('\nComprueba cada una desde zenit-pos-desktop/pos con:');
console.log("   PowerShell:  Select-String 'function NOMBRE' *.js");
console.log("   Bash:        grep -rn 'function NOMBRE' *.js");
// Todavía NO se sale con código 1: el prototipo da falsos positivos y rompería
// cualquier automatización. Cambiarlo al cerrar la tarea 2 del BLOQUE 16.
process.exit(0);
