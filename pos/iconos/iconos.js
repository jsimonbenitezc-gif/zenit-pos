/* ============================================================
 *  iconos/iconos.js — Los iconos de color (PLAN_REDISENO_V1, Bloque 4)
 *
 *  COPIA de zenit-pos-mobile/src/iconos/index.js + normalizar.js, escrita como
 *  script clásico. `npm run smoke:iconos` compara lo que DEVUELVEN las dos:
 *  si cambias una, cambia la otra (CLAUDE.md §66).
 *
 *  Un producto guarda en `emoji` una de tres cosas, y ninguna se migra:
 *    '🌮'          → el dibujo de Fluent de ese emoji; las apps viejas ven el emoji
 *    'svg:z-torta' → un icono PROPIO (sin emoji); apps viejas: una caja
 *    'svg:burger'  → un icono de LÍNEA de siempre (svg-icons.js); no pasa por aquí
 *  Necesita catalogo.js cargado antes.
 * ============================================================ */

// La LLAVE de un emoji: quita lo que no cambia el dibujo (FE0E/FE0F y los cinco
// tonos de piel) y conserva el ZWJ, que sí lo cambia (🧑‍🍳 ≠ 🧑).
const _ICONOS_SOBRANTES = new Set([0xfe0e, 0xfe0f, 0x1f3fb, 0x1f3fc, 0x1f3fd, 0x1f3fe, 0x1f3ff]);

function llaveEmoji(texto) {
    if (typeof texto !== 'string') return '';
    const puntos = [];
    for (const c of texto.trim()) {
        const cp = c.codePointAt(0);
        if (!_ICONOS_SOBRANTES.has(cp)) puntos.push(cp.toString(16));
    }
    // Un ZWJ que quedó al final (p. ej. "🧑‍" suelto) no une nada.
    while (puntos.length && puntos[puntos.length - 1] === '200d') puntos.pop();
    return puntos.join('-');
}

const ICONOS_GRUPOS = CATALOGO_ICONOS.grupos;
const ICONOS_COLOR = CATALOGO_ICONOS.iconos;
const _ICONOS_POR_ID = new Map(ICONOS_COLOR.map(i => [i.id, i]));
const _ICONOS_POR_LLAVE = new Map(ICONOS_COLOR.filter(i => i.llave).map(i => [i.llave, i]));

/** La entrada del catálogo de un valor guardado, o null (emoji fuera de la lista, línea, vacío). */
function iconoDeValor(valor) {
    if (typeof valor !== 'string' || !valor) return null;
    if (valor.startsWith('svg:z-')) return _ICONOS_POR_ID.get('z_' + valor.slice(6)) || null;
    if (valor.startsWith('svg:')) return null;
    return _ICONOS_POR_LLAVE.get(llaveEmoji(valor)) || null;
}

/** La ruta del PNG de un valor guardado (relativa a index.html), o null. */
function archivoDeValor(valor) {
    const i = iconoDeValor(valor);
    return i ? 'iconos/png/' + i.id + '.png' : null;
}

/** Lo que se guarda en el producto al elegir un icono del catálogo. */
function valorDeIcono(icono) {
    return icono.valor || icono.emoji;
}

/** Los grupos con los del tipo de negocio PRIMERO (el resto conserva su orden). */
function gruposParaTipo(tipo) {
    if (!tipo) return ICONOS_GRUPOS;
    const suyos = ICONOS_GRUPOS.filter(g => g.tipos[0] === tipo);
    const tambien = ICONOS_GRUPOS.filter(g => g.tipos[0] !== tipo && g.tipos.includes(tipo) && g.id !== 'general');
    const resto = ICONOS_GRUPOS.filter(g => !suyos.includes(g) && !tambien.includes(g));
    return [...suyos, ...tambien, ...resto];
}

const _iconosSinAcentos = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();

/** Busca por nombre o sinónimo en español, sin acentos ("cafe" encuentra ☕). Nombre primero. */
function buscarIconos(texto) {
    const q = _iconosSinAcentos(texto);
    if (!q) return [];
    const porNombre = [], porSinonimo = [];
    for (const i of ICONOS_COLOR) {
        if (_iconosSinAcentos(i.nombre).includes(q)) porNombre.push(i);
        else if (i.buscar.some(s => _iconosSinAcentos(s).includes(q))) porSinonimo.push(i);
    }
    return [...porNombre, ...porSinonimo];
}

function iconoPorId(id) {
    return _ICONOS_POR_ID.get(id) || null;
}
