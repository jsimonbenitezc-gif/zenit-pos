// ============================================================================
// MÓDULO: EL MENÚ DESDE UNA FOTO (IDEA 1 — §57)
//
// El negocio elige la foto de su menú (o su PDF) y Zenit da de alta los
// productos solos. Dar de alta 60 productos a mano son dos horas de teclear
// antes de cobrar el primer peso: es la pared más alta del producto.
//
// 🔴 LA REGLA, heredada del bot (§52.1): EL MODELO PROPONE; EL CÓDIGO Y EL
// USUARIO DECIDEN. Esta pantalla NO es un "importar y listo": es una revisión.
// Un precio mal leído ($2450 por $24.50) son cien ventas cobradas mal antes de
// que alguien lo note, así que lo dudoso se marca, se pone ARRIBA y todo es
// editable antes de crear nada.
//
// El servidor hace dos pasos a propósito: `leer` NO escribe nada, y solo
// `confirmar` toca el catálogo (y vuelve a validar cada renglón como si nunca
// lo hubiera visto, porque aquí se puede cambiar).
//
// ⚠️ LA REDUCCIÓN DE LA IMAGEN NO ES COSMÉTICA (trampa 7 de la idea): una foto
// de celular pesa de 3 a 8 MB y base64 infla un 33%. Aquí se reduce ANTES de
// mandarla — para leer precios nadie necesita doce megapíxeles— y además abarata
// la llamada, que se paga por tokens de imagen.
// ============================================================================

const MENUFOTO_MAX_ARCHIVOS = 6;          // el tope del servidor; un menú son 2 a 6 páginas
const MENUFOTO_MAX_LADO = 1600;           // px del lado mayor: de sobra para leer precios
const MENUFOTO_CALIDAD = 0.82;            // JPEG; por encima solo pesa más
const MENUFOTO_MAX_BYTES = 6 * 1024 * 1024;

let menuFotoArchivos = [];    // [{nombre, mime, datos(base64), bytes}]
let menuFotoPropuesta = null; // lo que devolvió el servidor, ya editable

// ── Por dónde se llega (2026-09-19) ──────────────────────────────────────────
//
// El dueño del producto abrió la app y NO encontró el botón: era gris, pesaba lo
// mismo que "Modificadores" y vivía solo en Productos. Para un negocio que
// empieza es la forma PRINCIPAL de cargar el menú, así que ahora hay tres
// entradas, y cada una tiene su motivo:
//
//   · Productos → el botón, destacado y el PRIMERO de la fila. Es donde se
//     busca. Aquí NO va el aviso: la primera versión lo ponía y quedaban dos
//     botones idénticos a 80 px uno del otro, que es ruido, no ayuda.
//   · Dashboard → un aviso que EXPLICA qué hace, SOLO mientras el catálogo es
//     chico. Una instalación nueva ya trae 4 productos de ejemplo, así que
//     "catálogo vacío" no ocurre nunca: por eso se mira el tamaño, no el cero.
//   · Ajustes → una tarjeta fija, para quien lo busca después de haber ocultado
//     el aviso.
//
// ⚠️ El aviso se puede OCULTAR y se queda oculto. Un aviso que no se puede
// quitar deja de leerse a la tercera vez (§41.4d): la gracia es que aparezca
// cuando ahorra dos horas, no que acompañe al negocio para siempre.

const MENUFOTO_CATALOGO_CHICO = 12;                     // hasta aquí, casi seguro no ha cargado su menú
const MENUFOTO_AVISO_OCULTO = 'zenit_menufoto_aviso_oculto';

function _menuFotoAvisoOculto() {
    try { return localStorage.getItem(MENUFOTO_AVISO_OCULTO) === '1'; } catch { return false; }
}

function ocultarAvisoMenuFoto() {
    try { localStorage.setItem(MENUFOTO_AVISO_OCULTO, '1'); } catch { /* sin almacenamiento: se oculta solo esta vez */ }
    document.querySelectorAll('.menufoto-aviso').forEach(el => el.classList.add('hidden'));
}

/** Cuántos productos tiene el equipo. Lo LOCAL, que es instantáneo (§19.36). */
async function _menuFotoCuantosProductos() {
    try {
        const cats = await window.api.obtenerProductosAgrupados();
        return (cats || []).reduce((n, c) => n + ((c && c.productos) || []).length, 0);
    } catch {
        return Infinity; // si no se puede saber, no se molesta a nadie
    }
}

const _MENUFOTO_ICONO = `
    <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3"/>
    </svg>`;

/**
 * Pinta las entradas al importador en la vista que se esté viendo.
 * No lanza nunca: una invitación que falla no puede estorbar a nadie.
 */
async function pintarEntradasMenuFoto() {
    try {
        const esDueno = (typeof rolActivo === 'undefined') || rolActivo === 'dueno';

        // La tarjeta de Ajustes: siempre para el dueño. En modo local el botón
        // explica que hace falta la cuenta, que es justo lo que hay que saber.
        const tarjeta = document.getElementById('card-menu-foto');
        if (tarjeta) tarjeta.classList.toggle('hidden', !esDueno);

        const avisos = document.querySelectorAll('.menufoto-aviso');
        if (!avisos.length) return;

        const mostrar = esDueno
            && _menuFotoDisponible()
            && !_menuFotoAvisoOculto()
            && (await _menuFotoCuantosProductos()) <= MENUFOTO_CATALOGO_CHICO;

        avisos.forEach(el => {
            if (mostrar && !el.dataset.pintado) {
                el.innerHTML = `
                    <div class="menufoto-aviso-icono">${_MENUFOTO_ICONO}</div>
                    <div class="menufoto-aviso-texto">
                        <strong>Carga tu menú desde una foto</strong>
                        <span>Zenit lee la foto o el PDF de tu menú y da de alta tus productos. Tú revisas todo antes de guardar.</span>
                    </div>
                    <button class="btn-primary" onclick="abrirImportarMenu()">Importar menú</button>
                    <button class="menufoto-aviso-cerrar" onclick="ocultarAvisoMenuFoto()"
                            aria-label="Ocultar este aviso" title="Ocultar este aviso">×</button>`;
                el.dataset.pintado = '1';
            }
            el.classList.toggle('hidden', !mostrar);
        });
    } catch (e) {
        console.warn('No se pudo pintar la invitación a importar el menú:', e && e.message);
    }
}

// ── Entrar ───────────────────────────────────────────────────────────────────

function _menuFotoDisponible() {
    return Boolean(modoConectado && apiClient && tokenActual);
}

async function abrirImportarMenu() {
    // Decidido el 2026-09-18: solo con cuenta. La clave del lector vive en el
    // servidor, y una puerta sin credencial que cuesta dinero es más fácil de
    // abrir ahora que de cerrar después.
    if (!_menuFotoDisponible()) {
        alertaZenit(
            'Para leer tu menú desde una foto hace falta la cuenta en línea: la lectura la hace el servidor.\n\n' +
            'Conéctate y vuelve a intentarlo.',
            'Sin conexión'
        );
        return;
    }
    // El servidor solo se lo permite al dueño (cambia lo que se le cobra al
    // cliente). Se dice aquí para no pedirle al cajero que mande 6 fotos y
    // reciba un 403 después de esperar un minuto.
    if (typeof rolActivo !== 'undefined' && rolActivo !== 'dueno') {
        alertaZenit('Solo el dueño puede importar el menú.', 'Sin permiso');
        return;
    }

    menuFotoArchivos = [];
    menuFotoPropuesta = null;
    document.getElementById('modalMenuFoto').classList.remove('hidden');
    _menuFotoPaso('elegir');
    _menuFotoPintarArchivos();
    const texto = document.getElementById('menufoto-texto');
    if (texto) texto.value = '';
}

function cerrarImportarMenu() {
    document.getElementById('modalMenuFoto').classList.add('hidden');
    menuFotoArchivos = [];
    menuFotoPropuesta = null;
}

/** Enseña uno de los tres pasos del modal y esconde los otros. */
function _menuFotoPaso(cual) {
    ['elegir', 'leyendo', 'revisar', 'listo'].forEach(p => {
        const el = document.getElementById(`menufoto-paso-${p}`);
        if (el) el.classList.toggle('hidden', p !== cual);
    });
}

// ── Elegir archivos ──────────────────────────────────────────────────────────

function menuFotoElegirArchivos() {
    document.getElementById('menufoto-input').click();
}

async function menuFotoArchivosElegidos(input) {
    const elegidos = Array.from(input.files || []);
    input.value = ''; // permite volver a elegir el MISMO archivo si lo quitó

    for (const file of elegidos) {
        if (menuFotoArchivos.length >= MENUFOTO_MAX_ARCHIVOS) {
            alertaZenit(
                `Máximo ${MENUFOTO_MAX_ARCHIVOS} archivos por vez. Si tu menú tiene más páginas, mándalas en dos tandas.`,
                'Demasiados archivos'
            );
            break;
        }
        const preparado = await _menuFotoPreparar(file);
        if (preparado.error) {
            await alertaZenit(preparado.error, 'No se puede usar ese archivo');
            continue;
        }
        menuFotoArchivos.push(preparado.archivo);
    }
    _menuFotoPintarArchivos();
}

function menuFotoQuitarArchivo(i) {
    menuFotoArchivos.splice(i, 1);
    _menuFotoPintarArchivos();
}

/**
 * Deja el archivo listo para viajar: las imágenes se REDUCEN, los PDF van tal cual.
 * Devuelve { archivo } o { error } con un mensaje que diga qué hacer.
 */
async function _menuFotoPreparar(file) {
    const mime = String(file.type || '').toLowerCase();
    const nombre = file.name || 'archivo';

    if (mime === 'application/pdf' || /\.pdf$/i.test(nombre)) {
        if (file.size > MENUFOTO_MAX_BYTES) {
            return { error: `"${nombre}" pesa ${_menuFotoPeso(file.size)} y el máximo son 6 MB.\n\nSi es un PDF de varias páginas, prueba con una captura de pantalla de cada página.` };
        }
        const datos = await _menuFotoBase64(file);
        return { archivo: { nombre, mime: 'application/pdf', datos, bytes: file.size } };
    }

    // HEIC (la cámara del iPhone): ni el navegador lo dibuja ni el lector lo lee.
    // Se dice qué hacer en vez de "formato no soportado".
    if (mime === 'image/heic' || mime === 'image/heif' || /\.hei[cf]$/i.test(nombre)) {
        return { error: 'Las fotos de iPhone (HEIC) no se pueden leer todavía.\n\nMándala como captura de pantalla, o cambia la cámara a "Más compatible" en Ajustes → Cámara → Formatos.' };
    }
    if (!mime.startsWith('image/')) {
        return { error: `"${nombre}" no es una foto ni un PDF.` };
    }

    try {
        const reducida = await _menuFotoReducir(file);
        return { archivo: { nombre, mime: 'image/jpeg', datos: reducida.datos, bytes: reducida.bytes } };
    } catch (e) {
        return { error: `No se pudo leer "${nombre}". Puede estar dañada o en un formato que esta app no dibuja.` };
    }
}

/**
 * Reduce la imagen al lado mayor de MENUFOTO_MAX_LADO y la pasa a JPEG.
 * Una foto de 8 MB acaba pesando unos 300 KB, y se lee exactamente igual.
 */
async function _menuFotoReducir(file) {
    const bitmap = await createImageBitmap(file);
    const escala = Math.min(1, MENUFOTO_MAX_LADO / Math.max(bitmap.width, bitmap.height));
    const ancho = Math.max(1, Math.round(bitmap.width * escala));
    const alto = Math.max(1, Math.round(bitmap.height * escala));

    const lienzo = document.createElement('canvas');
    lienzo.width = ancho;
    lienzo.height = alto;
    const ctx = lienzo.getContext('2d');
    // Un menú fotografiado casi siempre es texto oscuro sobre papel claro: el
    // fondo blanco evita que un PNG con transparencia acabe en negro sobre negro.
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, ancho, alto);
    ctx.drawImage(bitmap, 0, 0, ancho, alto);
    bitmap.close && bitmap.close();

    const dataUrl = lienzo.toDataURL('image/jpeg', MENUFOTO_CALIDAD);
    const datos = dataUrl.split(',')[1] || '';
    return { datos, bytes: Math.round(datos.length * 0.75) };
}

function _menuFotoBase64(file) {
    return new Promise((resolve, reject) => {
        const lector = new FileReader();
        lector.onload = () => resolve(String(lector.result || '').split(',')[1] || '');
        lector.onerror = () => reject(new Error('no se pudo leer'));
        lector.readAsDataURL(file);
    });
}

function _menuFotoPrecio(n) {
    // El desktop no tiene un formateador de moneda global: modulo-productos.js
    // imprime el signo a mano, y aquí se hace igual para no inventar una función.
    return `${Number(n || 0).toFixed(2)}`;
}

function _menuFotoPeso(bytes) {
    if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function _menuFotoPintarArchivos() {
    const cont = document.getElementById('menufoto-lista-archivos');
    if (!cont) return;
    if (!menuFotoArchivos.length) {
        cont.innerHTML = '';
    } else {
        cont.innerHTML = menuFotoArchivos.map((a, i) => `
            <div style="display:flex;align-items:center;gap:8px;padding:6px 10px;background:#f3f4f6;border-radius:8px;margin-bottom:6px;">
                <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(a.nombre)}</span>
                <span style="color:#6b7280;font-size:0.85em;">${_menuFotoPeso(a.bytes)}</span>
                <button class="btn-secondary small" onclick="menuFotoQuitarArchivo(${i})" title="Quitar">×</button>
            </div>
        `).join('');
    }
    const btn = document.getElementById('menufoto-btn-leer');
    const texto = document.getElementById('menufoto-texto');
    const hayTexto = Boolean(texto && texto.value.trim());
    if (btn) btn.disabled = !menuFotoArchivos.length && !hayTexto;
}

// ── Leer ─────────────────────────────────────────────────────────────────────

async function menuFotoLeer() {
    const texto = (document.getElementById('menufoto-texto').value || '').trim();
    if (!menuFotoArchivos.length && !texto) return;

    _menuFotoPaso('leyendo');
    const aviso = document.getElementById('menufoto-leyendo-detalle');
    const cuantos = menuFotoArchivos.length + (texto ? 1 : 0);
    if (aviso) {
        aviso.textContent = cuantos === 1
            ? 'Esto tarda unos segundos.'
            : `Son ${cuantos} lecturas, una por archivo. Puede tardar un minuto.`;
    }

    try {
        const propuesta = await apiClient.leerMenuDeFoto({
            archivos: menuFotoArchivos.map(a => ({ mime: a.mime, datos: a.datos })),
            texto
        });
        menuFotoPropuesta = propuesta;
        _menuFotoPintarPropuesta();
        _menuFotoPaso('revisar');
    } catch (e) {
        _menuFotoPaso('elegir');
        alertaZenit(e.message || 'No se pudo leer el menú.', 'No se pudo leer');
    }
}

// ── Revisar ──────────────────────────────────────────────────────────────────

const MENUFOTO_MOTIVOS = {
    sin_precio: 'no le vi precio',
    varios_precios: 'tiene más de un precio',
    lectura_dudosa: 'no lo leí con claridad',
    precio_raro: 'precio fuera de lo normal',
    duplicado_con_otro_precio: 'aparece dos veces con precios distintos',
    nota: 'lleva una nota',
    ya_existe: 'ya lo tienes'
};

/** La explicación larga de por qué un renglón está marcado, con SUS números. */
function _menuFotoPorQue(p) {
    const partes = [];
    if (p.motivos.includes('precio_raro')) {
        const mediana = p.mediana_del_menu !== undefined ? ` (los demás rondan ${_menuFotoPrecio(p.mediana_del_menu)})` : '';
        partes.push(`Leí ${_menuFotoPrecio(p.precio)}${mediana}. Revisa el punto decimal.`);
    }
    if (p.motivos.includes('varios_precios') && Array.isArray(p.precios_alternos) && p.precios_alternos.length) {
        partes.push(`También vi: ${p.precios_alternos.map(x => _menuFotoPrecio(x)).join(', ')}. Elige uno, o créalo dos veces.`);
    }
    if (p.motivos.includes('duplicado_con_otro_precio') && p.otro_precio_leido !== undefined) {
        partes.push(`En otra parte del menú aparece a ${_menuFotoPrecio(p.otro_precio_leido)}.`);
    }
    if (p.motivos.includes('nota') && p.nota) partes.push(`Dice: "${p.nota}".`);
    if (p.motivos.includes('sin_precio')) partes.push('Escríbele el precio para poder crearlo.');
    if (p.motivos.includes('ya_existe')) partes.push('Ya hay un producto con ese nombre; no se va a duplicar.');
    return partes.join(' ');
}

function _menuFotoCategorias() {
    const cats = (typeof clasificaciones !== 'undefined' && Array.isArray(clasificaciones)) ? clasificaciones : [];
    return cats.filter(c => c && c.id).map(c => ({ id: c.id, nombre: c.nombre }));
}

function _menuFotoPintarPropuesta() {
    const p = menuFotoPropuesta;
    const cont = document.getElementById('menufoto-lista');
    const resumen = document.getElementById('menufoto-resumen');
    if (!p || !cont) return;

    const r = p.resumen || {};
    resumen.innerHTML = `
        Leí <strong>${r.total || 0}</strong> productos.
        ${r.dudosos ? `<span style="color:#b45309;">${r.dudosos} necesitan que los revises</span> —salen primero—.` : 'Ninguno me dejó dudas, pero revísalos igual.'}
        ${r.ya_existen ? `<br><span style="color:#6b7280;">${r.ya_existen} ya los tienes en tu catálogo y vienen desmarcados.</span>` : ''}
    `;

    // Los dudosos ARRIBA — pero eso ya lo decidió el SERVIDOR (`armarPropuesta`),
    // así que aquí solo se respeta el orden en el que llegan. Volver a ordenarlo
    // aquí sería una segunda opinión sobre lo mismo, que es exactamente cómo
    // nacen las divergencias que este proyecto lleva documentando desde el §29.
    const orden = (p.productos || []).map((prod, i) => ({ prod, i }));

    const cats = _menuFotoCategorias();

    cont.innerHTML = orden.map(({ prod, i }) => {
        const opciones = [
            `<option value="">Sin categoría</option>`,
            ...cats.map(c => `<option value="${c.id}" ${prod.categoria_id === c.id ? 'selected' : ''}>${esc(c.nombre)}</option>`),
            prod.categoria_nueva
                ? `<option value="nueva" selected>+ ${esc(prod.categoria_nueva)} (nueva)</option>`
                : ''
        ].join('');

        const etiquetas = (prod.motivos || [])
            .filter(m => MENUFOTO_MOTIVOS[m])
            .map(m => `<span style="background:${m === 'ya_existe' ? '#e5e7eb' : '#fef3c7'};color:${m === 'ya_existe' ? '#4b5563' : '#92400e'};border-radius:999px;padding:1px 8px;font-size:0.75em;margin-right:4px;">${MENUFOTO_MOTIVOS[m]}</span>`)
            .join('');

        const porQue = _menuFotoPorQue(prod);

        return `
        <div style="border:1px solid ${prod.dudoso ? '#fcd34d' : '#e5e7eb'};background:${prod.dudoso ? '#fffbeb' : '#fff'};border-radius:10px;padding:10px;margin-bottom:8px;">
            <div style="display:flex;gap:8px;align-items:center;">
                <input type="checkbox" id="mf-inc-${i}" ${prod.incluir ? 'checked' : ''}
                       onchange="menuFotoContar()" style="width:18px;height:18px;flex:none;">
                <input id="mf-nom-${i}" value="${esc(prod.nombre || '')}" placeholder="Nombre"
                       style="flex:2;min-width:120px;padding:6px 8px;border:1px solid #d1d5db;border-radius:6px;">
                <input id="mf-pre-${i}" type="number" step="0.01" min="0"
                       value="${prod.precio === null || prod.precio === undefined ? '' : prod.precio}"
                       placeholder="Precio" onchange="menuFotoPrecioTocado(${i})"
                       style="width:100px;flex:none;padding:6px 8px;border:1px solid #d1d5db;border-radius:6px;text-align:right;">
                <select id="mf-cat-${i}" style="flex:1;min-width:110px;padding:6px 8px;border:1px solid #d1d5db;border-radius:6px;">
                    ${opciones}
                </select>
            </div>
            ${etiquetas || porQue ? `
                <div style="margin:6px 0 0 26px;">
                    ${etiquetas}
                    ${porQue ? `<div style="color:#6b7280;font-size:0.82em;margin-top:3px;">${esc(porQue)}</div>` : ''}
                </div>` : ''}
        </div>`;
    }).join('');

    menuFotoContar();
}

/** Escribirle el precio a un renglón que no lo tenía lo vuelve creable. */
function menuFotoPrecioTocado(i) {
    const precio = parseFloat(document.getElementById(`mf-pre-${i}`).value);
    const casilla = document.getElementById(`mf-inc-${i}`);
    if (casilla && !casilla.checked && precio > 0) casilla.checked = true;
    menuFotoContar();
}

function menuFotoContar() {
    const total = (menuFotoPropuesta && menuFotoPropuesta.productos || []).length;
    let n = 0;
    for (let i = 0; i < total; i++) {
        const c = document.getElementById(`mf-inc-${i}`);
        if (c && c.checked) n++;
    }
    const btn = document.getElementById('menufoto-btn-crear');
    if (btn) {
        btn.disabled = n === 0;
        btn.textContent = n === 0 ? 'Crear productos' : (n === 1 ? 'Crear 1 producto' : `Crear ${n} productos`);
    }
}

function menuFotoMarcarTodos(valor) {
    const total = (menuFotoPropuesta && menuFotoPropuesta.productos || []).length;
    for (let i = 0; i < total; i++) {
        const c = document.getElementById(`mf-inc-${i}`);
        const precio = parseFloat(document.getElementById(`mf-pre-${i}`).value);
        // Marcar "todos" no puede marcar lo que no se puede crear: un producto sin
        // precio se quedaría fuera de todas formas, y el número mentiría.
        if (c) c.checked = valor && precio > 0;
    }
    menuFotoContar();
}

// ── Confirmar ────────────────────────────────────────────────────────────────

async function menuFotoConfirmar() {
    const productos = [];
    const lista = (menuFotoPropuesta && menuFotoPropuesta.productos) || [];

    for (let i = 0; i < lista.length; i++) {
        const casilla = document.getElementById(`mf-inc-${i}`);
        if (!casilla || !casilla.checked) continue;

        const nombre = (document.getElementById(`mf-nom-${i}`).value || '').trim();
        const precio = parseFloat(document.getElementById(`mf-pre-${i}`).value);
        if (!nombre) {
            alertaZenit('Hay un producto marcado sin nombre. Escríbelo o desmárcalo.', 'Falta el nombre');
            return;
        }
        if (!(precio > 0)) {
            alertaZenit(`"${nombre}" está marcado pero no tiene precio. Escríbelo o desmárcalo.`, 'Falta el precio');
            return;
        }

        const cat = document.getElementById(`mf-cat-${i}`).value;
        productos.push({
            nombre,
            precio,
            descripcion: lista[i].descripcion || null,
            categoria_id: cat && cat !== 'nueva' ? parseInt(cat, 10) : null,
            categoria_nueva: cat === 'nueva' ? lista[i].categoria_nueva : null
        });
    }

    if (!productos.length) return;

    const btn = document.getElementById('menufoto-btn-crear');
    const textoPrevio = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Creando…';

    try {
        const r = await apiClient.confirmarMenuLeido(productos);
        // Todo o nada, en una transacción: si llegamos aquí, están creados.
        // Se bajan al SQLite local para poder venderlos sin internet.
        await sincronizarDesdeBackend().catch(() => {});
        await cargarProductosAdmin().catch(() => {});
        // Con el menú ya cargado, el catálogo deja de ser "chico" y la
        // invitación se retira sola: ya cumplió.
        pintarEntradasMenuFoto();
        _menuFotoResultado(r);
        _menuFotoPaso('listo');
    } catch (e) {
        btn.disabled = false;
        btn.textContent = textoPrevio;
        alertaZenit(e.message || 'No se pudieron crear los productos.', 'No se guardó nada');
    }
}

function _menuFotoResultado(r) {
    const cont = document.getElementById('menufoto-resultado');
    const creados = (r && r.creados) || [];
    const omitidos = (r && r.omitidos) || [];
    const cats = (r && r.categorias_creadas) || [];

    const motivos = {
        ya_existe: 'ya lo tenías',
        sin_nombre: 'se quedó sin nombre',
        precio_invalido: 'el precio no era válido',
        repetido: 'venía repetido'
    };

    cont.innerHTML = `
        <div style="font-size:1.1em;margin-bottom:8px;">
            Se crearon <strong>${creados.length}</strong> producto${creados.length === 1 ? '' : 's'}.
        </div>
        ${cats.length ? `<div style="color:#6b7280;margin-bottom:8px;">Categorías nuevas: ${cats.map(c => esc(c)).join(', ')}.</div>` : ''}
        ${omitidos.length ? `
            <div style="background:#f3f4f6;border-radius:8px;padding:10px;">
                <div style="margin-bottom:4px;">No se crearon ${omitidos.length}:</div>
                ${omitidos.map(o => `<div style="color:#6b7280;font-size:0.88em;">• ${esc(o.nombre || 'sin nombre')} — ${motivos[o.motivo] || esc(o.motivo || '')}</div>`).join('')}
            </div>` : ''}
        <div style="color:#6b7280;font-size:0.88em;margin-top:10px;">
            Una foto no sabe de recetas, costos ni existencias: eso se captura aparte.
        </div>
    `;
}
