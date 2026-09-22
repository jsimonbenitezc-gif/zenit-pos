/**
 * SMOKE: las DOS copias de la regla de las promos dan lo mismo (PLAN_OFERTAS_V1).
 *
 *     node scripts/smoke-promos-gemelas.js
 *
 * La regla de la promo (el precio, el reparto a centavos, el calendario con su
 * medianoche y qué cabe en cada hueco) vive en el backend (`utils/promos.js` +
 * `utils/ventanas.js`) y COPIADA en `pos/modulo-promos.js`. El desktop sube
 * TODAS sus ventas como diferidas y el servidor respeta el precio que cobró:
 * si la copia se desvía un centavo, el ticket dice un número, el servidor
 * reparte otro y la venta se audita como sospechosa sin que nadie hiciera nada.
 *
 * Aquí se cargan LAS DOS —la del backend con `require`, la del desktop tal cual
 * la carga el navegador— y se comparan miles de casos. No se compara el texto:
 * se compara lo que DEVUELVEN, que es lo que importa y lo que un cambio de
 * formato no puede engañar.
 *
 * Si el repo del backend no está al lado de éste, se SALTA con un aviso: no es
 * un defecto del desktop, y ponerse rojo por eso enseña a ignorar la prueba.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

// El reloj del proceso en la zona del negocio: así se puede comparar la hora
// "del equipo" del desktop con la "de la zona" del servidor (§37.6).
process.env.TZ = 'America/Mexico_City';

const RAIZ = path.join(__dirname, '..');
const BACKEND = process.env.ZENIT_BACKEND || path.join(RAIZ, '..', 'zenit-pos-backend');
const RUTA_SERVIDOR = path.join(BACKEND, 'utils', 'promos.js');

if (!fs.existsSync(RUTA_SERVIDOR)) {
    console.log('⏭️  No encontré ' + RUTA_SERVIDOR + ': comparación SALTADA.');
    console.log('   (clona zenit-pos-backend como carpeta hermana, o apunta ZENIT_BACKEND a él)');
    process.exit(0);
}

const servidor = require(RUTA_SERVIDOR);

// La copia del desktop, cargada como la carga el navegador: el archivo entero.
const sandbox = { console, Date, Math, JSON, Intl };
vm.createContext(sandbox);
vm.runInContext(
    fs.readFileSync(path.join(RAIZ, 'pos', 'modulo-promos.js'), 'utf8') +
    '\n;this.__R = PromosRegla; this.__localDelEquipo = localDelEquipo;',
    sandbox
);
const escritorio = sandbox.__R;

let casos = 0, fallos = 0;
const ejemplos = [];
function igual(desc, a, b) {
    casos++;
    const ja = JSON.stringify(a), jb = JSON.stringify(b);
    if (ja !== jb) {
        fallos++;
        if (ejemplos.length < 8) ejemplos.push(desc + '\n      servidor: ' + ja + '\n      desktop:  ' + jb);
    }
}

// Azar DETERMINISTA: si algo falla, falla igual en la siguiente corrida.
let semilla = 20260921;
const azar = () => (semilla = (semilla * 1103515245 + 12345) % 2147483648) / 2147483648;
const entero = (a, b) => a + Math.floor(azar() * (b - a + 1));
const precio = () => {
    const r = azar();
    if (r < 0.08) return 0;
    if (r < 0.2) return 33.33;
    if (r < 0.3) return 24.5;
    return Math.round(azar() * 40000) / 100;
};

console.log('\n── 1. El calendario: validar lo que manda el dueño ──');
const calendariosCrudos = [
    null, undefined, '', 'basura', '{"dias":[2]}', '{', 42, [], [1, 2],
    {}, { dias: [] }, { dias: [7] }, { dias: [-1] }, { dias: ['2'] }, { dias: [2, 2, 3] },
    { dias: [0, 1, 2, 3, 4, 5, 6] }, { dias: [6, 0] }, { dias: [1.5] },
    { desde: '18:00' }, { hasta: '20:00' }, { desde: '18:00', hasta: '20:00' },
    { desde: '22:00', hasta: '02:00' }, { desde: '8:00', hasta: '10:00' }, { desde: '24:00', hasta: '01:00' },
    { desde: '18:00', hasta: '18:00' }, { desde: ' 18:00 ', hasta: '20:00 ' },
    { fecha_inicio: '2026-10-01' }, { fecha_fin: '2026-10-31' },
    { fecha_inicio: '2026-10-31', fecha_fin: '2026-10-01' }, { fecha_inicio: '2026-13-01' },
    { fecha_inicio: '2026-10-01T05:00:00Z' }, { fecha_inicio: '01/10/2026' },
    { dias: [2], desde: '18:00', hasta: '20:00', fecha_inicio: '2026-10-01', fecha_fin: '2026-10-31' },
    { dias: [5], desde: '22:00', hasta: '02:00', fecha_fin: '2026-10-31' },
    { dias: null, desde: null, hasta: null }, { dias: [3], desde: '', hasta: '' },
];
for (const c of calendariosCrudos) {
    igual('normalizarCalendario(' + JSON.stringify(c) + ')', servidor.normalizarCalendario(c), escritorio.normalizarCalendario(c));
    igual('leerCalendario(' + JSON.stringify(c) + ')', servidor.leerCalendario(c), escritorio.leerCalendario(c));
}

console.log('── 2. El calendario: ¿vale en este minuto? (con la medianoche) ──');
const calendarios = [
    null,
    { dias: [2] },
    { dias: [1, 2, 3, 4], desde: '18:00', hasta: '20:00' },
    { dias: [5], desde: '22:00', hasta: '02:00' },
    { desde: '23:30', hasta: '00:30' },
    { dias: [0], desde: '12:00', hasta: '12:00' },
    { fecha_inicio: '2026-10-01', fecha_fin: '2026-10-31' },
    { dias: [6], desde: '22:00', hasta: '03:00', fecha_inicio: '2026-10-03', fecha_fin: '2026-10-31' },
    { dias: [4], desde: '20:00', hasta: '01:00', fecha_fin: '2026-10-29' },
    { dias: [0, 6] },
    { desde: '00:00', hasta: '06:00' },
    { dias: [3], fecha_inicio: '2026-12-30' },
];
// Una semana de octubre (con su fin de mes) cada 37 minutos, más la vuelta del año.
const inicios = [Date.UTC(2026, 9, 26, 6, 0), Date.UTC(2026, 11, 27, 6, 0), Date.UTC(2026, 8, 28, 6, 0)];
for (const cal of calendarios) {
    for (const t0 of inicios) {
        for (let t = t0; t < t0 + 8 * 86400000; t += 37 * 60000) {
            const local = servidor.localEnZona('America/Mexico_City', new Date(t));
            igual('calendarioVigente(' + JSON.stringify(cal) + ', ' + JSON.stringify(local) + ')',
                servidor.calendarioVigente(cal, local), escritorio.calendarioVigente(cal, local));
        }
    }
}

console.log('── 3. La hora del EQUIPO del desktop = la hora de la ZONA del servidor ──');
for (let t = Date.UTC(2026, 0, 1, 5, 30); t < Date.UTC(2027, 0, 1); t += 7 * 3600000 + 13 * 60000) {
    igual('local en ' + new Date(t).toISOString(),
        servidor.localEnZona('America/Mexico_City', new Date(t)), JSON.parse(JSON.stringify(sandbox.__localDelEquipo(new Date(t)))));
}
for (let i = 0; i < 200; i++) {
    const partes = { year: entero(2025, 2028), month: entero(1, 12), day: entero(1, 28), hour: entero(0, 23), minute: entero(0, 59) };
    igual('localDesdePartes(' + JSON.stringify(partes) + ')', servidor.localDesdePartes(partes), escritorio.localDesdePartes(partes));
}

console.log('── 4. El precio, el reparto y los extras ──');
for (let i = 0; i < 1500; i++) {
    const n = entero(1, 6);
    const precios = Array.from({ length: n }, precio);
    const tipo = azar() < 0.5 ? 'precio_fijo' : 'regalar_mas_barato';
    const promo = tipo === 'precio_fijo'
        ? { tipo, price: azar() < 0.1 ? precio() * 5 : precio() }
        : { tipo, paga: entero(0, n) };
    const elegidos = precios.map(p => ({ precio: p, delta: azar() < 0.3 ? Math.round((azar() * 30 - 5) * 100) / 100 : 0 }));
    const forzado = azar() < 0.25 ? precio() : null;
    igual('tipoDePromo', servidor.tipoDePromo(promo), escritorio.tipoDePromo(promo));
    igual('precioPromo(' + JSON.stringify(promo) + ', ' + JSON.stringify(precios) + ')',
        servidor.precioPromo(promo, precios), escritorio.precioPromo(promo, precios));
    const p = servidor.precioPromo(promo, precios);
    igual('repartir(' + p + ', ' + JSON.stringify(precios) + ')', servidor.repartir(p, precios), escritorio.repartir(p, precios));
    igual('armarPromo(' + JSON.stringify(promo) + ', ' + JSON.stringify(elegidos) + ', ' + forzado + ')',
        servidor.armarPromo(promo, elegidos, forzado), escritorio.armarPromo(promo, elegidos, forzado));
}
// Los casos que el plan nombra con todas sus letras.
for (const [promo, precios] of [
    [{ tipo: 'regalar_mas_barato', paga: 1 }, [25, 35]],
    [{ tipo: 'precio_fijo', price: 100 }, [33.33, 33.33, 33.33]],
    [{ tipo: 'regalar_mas_barato', paga: 2 }, [10, 20, 30]],
    [{ tipo: 'precio_fijo', price: 99.99 }, [0, 0, 0]],
    [{ tipo: 'precio_fijo', price: 0.01 }, [10, 10, 10]],
]) {
    igual('armarPromo del plan ' + JSON.stringify([promo, precios]),
        servidor.armarPromo(promo, precios.map(x => ({ precio: x, delta: 0 }))),
        escritorio.armarPromo(promo, precios.map(x => ({ precio: x, delta: 0 }))));
}

console.log('── 5. Qué cabe en cada hueco ──');
for (let i = 0; i < 800; i++) {
    const huecos = Array.from({ length: entero(1, 3) }, () => azar() < 0.5
        ? { quantity: entero(1, 3), product_ids: [], category_id: entero(1, 3) }
        : { quantity: entero(1, 3), product_ids: Array.from({ length: entero(1, 3) }, () => entero(1, 8)), category_id: null });
    const total = servidor.productosQueLleva(huecos);
    const cuantos = azar() < 0.7 ? total : entero(0, total + 2);
    const productos = Array.from({ length: cuantos }, () => ({ id: entero(1, 8), category_id: entero(1, 3) }));
    igual('productosQueLleva', total, escritorio.productosQueLleva(huecos));
    igual('eleccionCabe(' + JSON.stringify(huecos) + ', ' + JSON.stringify(productos) + ')',
        servidor.eleccionCabe(huecos, productos), escritorio.eleccionCabe(huecos, productos));
    for (const pr of productos.slice(0, 2)) {
        igual('cabeEnHueco', servidor.cabeEnHueco(huecos[0], pr), escritorio.cabeEnHueco(huecos[0], pr));
    }
}

console.log('');
if (fallos) {
    console.log('❌ ' + fallos + ' de ' + casos + ' casos DIFIEREN entre el servidor y el desktop:');
    for (const e of ejemplos) console.log('    · ' + e);
    console.log('\n   La copia de pos/modulo-promos.js ya no es la de utils/promos.js: cambia las dos.');
    process.exit(1);
}
console.log('✅ ' + casos + ' casos: la regla del desktop da EXACTAMENTE lo mismo que la del servidor.');
