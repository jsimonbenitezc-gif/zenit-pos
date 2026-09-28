/**
 * SMOKE: los iconos de color del desktop son LOS MISMOS del celular (PLAN_REDISENO_V1, Bloque 4).
 *
 *     npm run smoke:iconos
 *
 * El catálogo se genera en zenit-pos-mobile y se copia aquí con
 * `node scripts/copiar-iconos.js`. La lógica (la llave del emoji, qué dibujo le
 * toca a un valor guardado, el orden por tipo de negocio y el buscador) está
 * COPIADA en `pos/iconos/iconos.js`. Si se desvían, el mismo producto se ve con
 * un dibujo en el celular y con otro —o con el emoji del sistema— en la caja,
 * sin que nadie lo note. Aquí se comprueba:
 *   1. catálogo, PNG (byte por byte) y licencia idénticos, sin huecos ni sobrantes;
 *   2. las dos lógicas DEVUELVEN lo mismo en miles de casos (no se compara el texto);
 *   3. `renderIcono` respeta la prioridad: color > línea > emoji del sistema > caja.
 *
 * Si el repo del celular no está al lado de éste, se SALTA con un aviso (como
 * smoke-promos-gemelas): no es un defecto del desktop.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');

const RAIZ = path.join(__dirname, '..');
const MOBILE = process.env.ZENIT_MOBILE || path.join(RAIZ, '..', 'zenit-pos-mobile');
const M_CAT = path.join(MOBILE, 'src', 'iconos', 'catalogo.json');

if (!fs.existsSync(M_CAT)) {
    console.log('⏭️  No encontré ' + M_CAT + ': comparación SALTADA.');
    console.log('   (clona zenit-pos-mobile como carpeta hermana, o apunta ZENIT_MOBILE a él)');
    process.exit(0);
}

let ok = 0, mal = 0;
const ejemplos = [];
function check(cond, msg) {
    if (cond) { ok++; return; }
    mal++;
    if (ejemplos.length < 12) ejemplos.push(msg);
}
const igual = (desc, a, b) => {
    const ja = JSON.stringify(a), jb = JSON.stringify(b);
    check(ja === jb, desc + '\n      celular: ' + ja + '\n      desktop: ' + jb);
};
const leer = (p) => fs.readFileSync(p, 'utf8');
const hash = (p) => crypto.createHash('sha1').update(fs.readFileSync(p)).digest('hex');

// ── El desktop, cargado como lo carga el navegador: los archivos enteros ──
const D = { console };
vm.createContext(D);
for (const f of ['iconos/catalogo.js', 'iconos/iconos.js', 'iconos/licencia.js', 'svg-icons.js']) {
    vm.runInContext(leer(path.join(RAIZ, 'pos', f)), D, { filename: f });
}
vm.runInContext(`this.__D = { CATALOGO_ICONOS, LICENCIA_FLUENT, llaveEmoji, iconoDeValor, archivoDeValor,
    valorDeIcono, gruposParaTipo, buscarIconos, iconoPorId, renderIcono };`, D);
const escritorio = D.__D;

// ── El celular: sus módulos con los import/export quitados, y su tabla de require ──
const catalogoCel = JSON.parse(leer(M_CAT));
const archivosTexto = leer(path.join(MOBILE, 'src', 'iconos', 'archivos.js'));
const ARCHIVOS = {};
for (const m of archivosTexto.matchAll(/^\s*(\w+): require\('([^']+)'\)/gm)) {
    ARCHIVOS[m[1]] = path.resolve(MOBILE, 'src', 'iconos', m[2]);
}
const sinModulos = (t) => t.replace(/^import .*$/gm, '').replace(/^export /gm, '');
const C = { console };
vm.createContext(C);
C.catalogo = catalogoCel;
C.ARCHIVOS = ARCHIVOS;
vm.runInContext(
    sinModulos(leer(path.join(MOBILE, 'src', 'iconos', 'normalizar.js'))) + '\n' +
    sinModulos(leer(path.join(MOBILE, 'src', 'iconos', 'index.js'))) +
    `\n;this.__C = { llaveEmoji, iconoDeValor, archivoDeValor, valorDeIcono, gruposParaTipo, buscarIconos, iconoPorId };`,
    C, { filename: 'mobile/src/iconos/index.js' }
);
const celular = C.__C;

// ── 1. Los archivos ──
igual('catálogo', catalogoCel, JSON.parse(JSON.stringify(escritorio.CATALOGO_ICONOS)));
check(escritorio.LICENCIA_FLUENT === leer(path.join(MOBILE, 'assets', 'iconos', 'LICENSE-fluentui-emoji.txt')),
    'la licencia del desktop no es la del celular');
check(fs.existsSync(path.join(RAIZ, 'pos', 'iconos', 'LICENSE-fluentui-emoji.txt')), 'falta pos/iconos/LICENSE-fluentui-emoji.txt');

const PNG_D = path.join(RAIZ, 'pos', 'iconos', 'png');
const ids = new Set(catalogoCel.iconos.map(i => i.id));
for (const id of ids) {
    const d = path.join(PNG_D, id + '.png');
    const c = ARCHIVOS[id];
    check(!!c && fs.existsSync(c), `el celular no tiene el PNG de ${id}`);
    check(fs.existsSync(d), `el desktop no tiene pos/iconos/png/${id}.png`);
    if (c && fs.existsSync(c) && fs.existsSync(d)) check(hash(c) === hash(d), `${id}.png es distinto en los dos repos`);
}
for (const f of fs.readdirSync(PNG_D)) {
    check(ids.has(f.replace(/\.png$/, '')), `pos/iconos/png/${f} sobra (no está en el catálogo)`);
}
for (const g of catalogoCel.grupos) {
    for (const id of g.iconos) check(ids.has(id), `el grupo ${g.id} nombra ${id}, que no existe`);
}

// ── 2. Las dos lógicas devuelven lo mismo ──
const idDe = (i) => (i ? i.id : null);
const TONO = String.fromCodePoint(0x1f3fd);
const FE0F = String.fromCodePoint(0xfe0f);
const valores = ['', null, undefined, 42, 'svg:burger', 'svg:package', 'svg:z-no-existe', 'svg:z-',
    '🛸', '🧑', '🧑‍', '  🌮  ', '👍' + TONO];
for (const i of catalogoCel.iconos) {
    const v = celular.valorDeIcono(i);
    igual('valorDeIcono ' + i.id, v, escritorio.valorDeIcono(i));
    valores.push(v);
    if (i.emoji) {
        const [primero, ...resto] = [...i.emoji];
        valores.push(i.emoji + FE0F, i.emoji.split(FE0F).join(''), primero + TONO + resto.join(''));
    }
}
for (const v of valores) {
    igual('llaveEmoji ' + JSON.stringify(v), celular.llaveEmoji(v), escritorio.llaveEmoji(v));
    igual('iconoDeValor ' + JSON.stringify(v), idDe(celular.iconoDeValor(v)), idDe(escritorio.iconoDeValor(v)));
    const c = celular.archivoDeValor(v);
    const d = escritorio.archivoDeValor(v);
    igual('archivoDeValor ' + JSON.stringify(v),
        c ? path.basename(c) : null, d ? path.basename(d) : null);
}
// Cada icono del catálogo se encuentra por su propio valor (si no, sale el emoji del sistema).
for (const i of catalogoCel.iconos) {
    check(idDe(escritorio.iconoDeValor(escritorio.valorDeIcono(i))) === i.id, `el valor de ${i.id} no vuelve a ${i.id}`);
}

const TIPOS = ['', null, 'restaurante', 'tienda', 'ropa', 'salon', 'farmacia', 'ferreteria', 'electronica', 'panaderia', 'otro', 'inventado'];
for (const t of TIPOS) {
    igual('gruposParaTipo ' + t, celular.gruposParaTipo(t).map(g => g.id), escritorio.gruposParaTipo(t).map(g => g.id));
}

const consultas = ['', '   ', 'cafe', 'café', 'CAFÉ', 'pina', 'piña', 'platano', 'plátano', 'pastor', 'zzz', 'a', 'ta'];
for (const i of catalogoCel.iconos) {
    consultas.push(i.nombre, i.nombre.slice(0, 3), ...i.buscar);
}
for (const q of consultas) {
    igual('buscarIconos ' + JSON.stringify(q), celular.buscarIconos(q).map(idDe), escritorio.buscarIconos(q).map(idDe));
}
// Quitar acentos de verdad: "pina" y "platano" solo se resuelven así (§66.3).
check(escritorio.buscarIconos('pina').some(i => /pi[ñn]a/i.test(i.nombre)), '"pina" no encuentra la piña');
check(escritorio.buscarIconos('platano').some(i => /pl[aá]tano/i.test(i.nombre)), '"platano" no encuentra el plátano');

// ── 3. renderIcono: color > línea > emoji del sistema > caja ──
const r = escritorio.renderIcono;
const propio = catalogoCel.iconos.find(i => i.valor && i.valor.startsWith('svg:z-'));
check(/<img[^>]+iconos\/png\/taco\.png/.test(r('🌮', 30)), '🌮 no se dibuja con taco.png');
check(/<img[^>]+iconos\/png\/taco\.png/.test(r('🌮' + FE0F, 30)), '🌮 con FE0F no se dibuja con taco.png');
check(!!propio && r(propio.valor, 30).includes(`iconos/png/${propio.id}.png`), 'un propio svg:z- no se dibuja con su PNG');
check(r('svg:burger', 30).startsWith('<svg') && !r('svg:burger').includes('<img'), 'svg:burger no es de línea');
check(r('svg:z-no-existe', 30) === r(null, 30), 'un propio desconocido no sale como caja');
check(r('svg:z-no-existe', 30).startsWith('<svg'), 'un propio desconocido deja un hueco');
check(r('🛸', 30).includes('🛸') && !r('🛸').includes('<img'), 'un emoji fuera de la lista no sale como emoji del sistema');
check(r('', 30).startsWith('<svg'), 'el vacío no sale como caja');
check(/width="35" height="35"/.test(r('🌮', 35)), 'el icono de color no respeta el tamaño');
for (const i of catalogoCel.iconos) {
    check(r(escritorio.valorDeIcono(i), 24).includes(`iconos/png/${i.id}.png`), `renderIcono no dibuja ${i.id} de color`);
}

console.log(`\n${mal ? '❌' : '✅'} Iconos gemelos: ${ok} comprobaciones bien, ${mal} mal`);
if (mal) {
    console.log('\nEjemplos:\n  - ' + ejemplos.join('\n  - '));
    console.log('\nSi el catálogo cambió en el celular: node scripts/copiar-iconos.js');
    process.exit(1);
}
