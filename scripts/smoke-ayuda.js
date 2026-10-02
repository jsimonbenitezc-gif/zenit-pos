/**
 * SMOKE: las burbujas de ayuda (?) dicen LO MISMO en el desktop y en el celular
 * (PLAN_AYUDA_V1, IDEA 10).
 *
 *     npm run smoke:ayuda
 *
 * Los textos viven en `pos/ayuda-textos.js`, COPIADO de
 * `zenit-pos-mobile/src/ayuda/textos.js` (misma regla que la lista de monedas,
 * §51.2). Si uno cambia y el otro no, la caja y el celular explican la misma
 * pantalla de dos maneras sin que nadie lo note. Aquí se comprueba:
 *   1. los dos archivos DEVUELVEN el mismo objeto (no se compara el texto);
 *   2. cada texto está completo: título, texto, negritas cerradas, corto;
 *   3. cada (?) del desktop apunta a una llave que existe, y cada llave se usa
 *      (salvo las de SIN_LUGAR, con su motivo).
 *
 * Si el repo del celular no está al lado de éste, la comparación se SALTA con un
 * aviso (como smoke-iconos-gemelos): no es un defecto del desktop.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const RAIZ = path.join(__dirname, '..');
const MOBILE = process.env.ZENIT_MOBILE || path.join(RAIZ, '..', 'zenit-pos-mobile');
const M_TEXTOS = path.join(MOBILE, 'src', 'ayuda', 'textos.js');

// Llaves que el desktop todavía no usa, con el porqué. Si una se coloca, quítala
// de aquí (el smoke avisa).
const SIN_LUGAR = {};

let ok = 0, mal = 0;
const fallas = [];
function check(cond, msg) {
    if (cond) { ok++; return; }
    mal++;
    fallas.push(msg);
}
const leer = (p) => fs.readFileSync(p, 'utf8');

// ── El desktop, cargado como lo carga el navegador ──
const D = {};
vm.createContext(D);
vm.runInContext(leer(path.join(RAIZ, 'pos', 'ayuda-textos.js')) + '\n;this.__T = TEXTOS_AYUDA;', D);
const escritorio = JSON.parse(JSON.stringify(D.__T));

// ── 1. Iguales al celular ──
if (fs.existsSync(M_TEXTOS)) {
    const C = {};
    vm.createContext(C);
    vm.runInContext(leer(M_TEXTOS).replace(/^export /gm, '') + '\n;this.__T = TEXTOS_AYUDA;', C);
    const celular = JSON.parse(JSON.stringify(C.__T));
    const llaves = new Set([...Object.keys(celular), ...Object.keys(escritorio)]);
    for (const k of llaves) {
        const a = JSON.stringify(celular[k]), b = JSON.stringify(escritorio[k]);
        check(a === b, `"${k}" es distinto:\n      celular: ${a}\n      desktop: ${b}`);
    }
} else {
    console.log('⏭️  No encontré ' + M_TEXTOS + ': comparación con el celular SALTADA.');
    console.log('   (clona zenit-pos-mobile como carpeta hermana, o apunta ZENIT_MOBILE a él)');
}

// ── 2. Cada texto, completo ──
for (const [k, t] of Object.entries(escritorio)) {
    check(/^[a-z]+$/.test(k), `la llave "${k}" debe ser minúsculas sin espacios`);
    check(typeof t.titulo === 'string' && t.titulo.trim(), `"${k}" no tiene título`);
    check(typeof t.texto === 'string' && t.texto.trim(), `"${k}" no tiene texto`);
    for (const campo of ['titulo', 'texto', 'ejemplo']) {
        const v = t[campo] || '';
        check((v.match(/\*\*/g) || []).length % 2 === 0, `"${k}".${campo} tiene unas ** sin cerrar`);
    }
    const largo = (t.texto || '').length + (t.ejemplo || '').length;
    check(largo <= 280, `"${k}" mide ${largo} letras: una burbuja es de 2–3 líneas (máx. 280)`);
}

// ── 3. Cada (?) apunta a una llave que existe; cada llave se usa ──
const usadas = new Set();
const html = leer(path.join(RAIZ, 'pos', 'index.html'));
for (const m of html.matchAll(/data-ayuda="([^"]*)"/g)) usadas.add(m[1]);
for (const f of fs.readdirSync(path.join(RAIZ, 'pos')).filter((f) => f.endsWith('.js'))) {
    for (const m of leer(path.join(RAIZ, 'pos', f)).matchAll(/botonAyuda\(\s*['"`]([^'"`]*)['"`]\s*\)/g)) usadas.add(m[1]);
}
for (const k of usadas) check(k in escritorio, `hay un (?) con la llave "${k}", que no está en ayuda-textos.js`);
for (const k of Object.keys(escritorio)) {
    if (SIN_LUGAR[k]) check(!usadas.has(k), `"${k}" ya se usa: quítala de SIN_LUGAR`);
    else check(usadas.has(k), `la llave "${k}" no se usa en ninguna pantalla del desktop`);
}
for (const k of Object.keys(SIN_LUGAR)) check(k in escritorio, `SIN_LUGAR nombra "${k}", que no existe`);

// Los dos scripts cargan antes que los módulos que pintan con botonAyuda().
const iTextos = html.indexOf('<script src="ayuda-textos.js">');
const iAyuda = html.indexOf('<script src="modulo-ayuda.js">');
const iRender = html.indexOf('<script src="render.js">');
check(iTextos > 0 && iTextos < iAyuda && iAyuda < iRender, 'index.html debe cargar ayuda-textos.js y luego modulo-ayuda.js, antes de render.js');

console.log(`\n${mal ? '❌' : '✅'} Ayuda (?): ${ok} comprobaciones bien, ${mal} mal · ${usadas.size} llaves en pantalla`);
if (mal) {
    console.log('\n  - ' + fallas.join('\n  - '));
    process.exit(1);
}
