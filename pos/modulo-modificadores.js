// ============================================
// MÓDULO: Modificadores de producto (BLOQUE 11)
// ============================================
//
// La primera mitad es el espejo EXACTO de `utils/modificadores.js` del backend.
// El servidor recalcula el precio de toda venta, así que si esta copia se
// desviara el cajero cobraría un número y el ticket saldría con otro.
// ⚠️ Si cambias la fórmula, cámbiala en los TRES lugares: backend, desktop y mobile.
//
// LA REGLA DE ORO: LOS MODIFICADORES AJUSTAN EL PRECIO UNITARIO.
//   • El precio del renglón es `precio del catálogo + suma de los deltas`. Todo
//     lo que ya existía (impuesto, descuentos, pagos divididos, corte de caja)
//     sigue leyendo ese precio y no necesita enterarse de que hay extras.
//   • Lo elegido se CONGELA en el renglón: reimprimir un ticket viejo muestra lo
//     que se cobró, aunque el extra haya cambiado de precio después.
//
// LA BIBLIOTECA es del negocio, no del producto: "Extras" se configura una vez y
// se engancha a los 30 tacos que lo usan.

// ─────────────────────────────────────────────────────────────────────────────
// PARTE 1 — LA FÓRMULA (espejo del backend)
// ─────────────────────────────────────────────────────────────────────────────

const MODS_MAX_POR_ITEM = 30;
const MODS_MAX_DELTA = 1000000;
const MODS_NOMBRE_MAX = 60;

function _redondearMod(n) {
    return parseFloat((Math.round((n + Number.EPSILON) * 100) / 100).toFixed(2));
}

function _textoMod(valor, max = MODS_NOMBRE_MAX) {
    if (typeof valor !== 'string') return '';
    return valor.trim().slice(0, max);
}

/** @returns {number|null} null = valor inservible. */
function normalizarDeltaModificador(valor) {
    if (valor === undefined || valor === null || valor === '') return 0;
    const delta = parseFloat(valor);
    if (!Number.isFinite(delta) || Math.abs(delta) > MODS_MAX_DELTA) return null;
    return _redondearMod(delta);
}

function deltaDeModificadores(modificadores) {
    if (!Array.isArray(modificadores) || modificadores.length === 0) return 0;
    let suma = 0;
    for (const m of modificadores) {
        const delta = normalizarDeltaModificador(m && m.price_delta);
        if (delta !== null) suma += delta;
    }
    return _redondearMod(suma);
}

/**
 * Precio unitario final: base del catálogo + extras.
 * Nunca baja de 0: un precio negativo convertiría una venta en una devolución
 * silenciosa. Se cobra 0 y el renglón queda visible para corregir la config.
 */
function precioConModificadores(precioBase, modificadores) {
    const base = parseFloat(precioBase);
    if (!Number.isFinite(base)) return 0;
    return Math.max(0, _redondearMod(base + deltaDeModificadores(modificadores)));
}

/** Texto de la línea de extras del ticket, el carrito y el KDS. */
function resumenModificadores(modificadores) {
    if (!Array.isArray(modificadores) || modificadores.length === 0) return '';
    return modificadores.map(m => _textoMod(m && m.name)).filter(Boolean).join(', ');
}

/** Deja la selección en la forma congelada que se guarda con el renglón. */
function normalizarSeleccionModificadores(modificadores) {
    if (!Array.isArray(modificadores)) return [];
    const limpios = [];
    for (const crudo of modificadores.slice(0, MODS_MAX_POR_ITEM)) {
        if (!crudo || typeof crudo !== 'object') continue;
        const nombre = _textoMod(crudo.name || crudo.nombre);
        if (!nombre) continue;
        const delta = normalizarDeltaModificador(crudo.price_delta !== undefined ? crudo.price_delta : crudo.delta);
        if (delta === null) continue;
        const optionId = parseInt(crudo.option_id !== undefined ? crudo.option_id : crudo.id);
        const groupId = parseInt(crudo.group_id);
        limpios.push({
            option_id: Number.isInteger(optionId) ? optionId : null,
            group_id: Number.isInteger(groupId) ? groupId : null,
            group: _textoMod(crudo.group || crudo.grupo),
            name: nombre,
            price_delta: delta,
        });
    }
    return limpios;
}

/** Lee el JSON congelado de un renglón sin reventar nunca. */
function leerModificadores(valor) {
    if (!valor) return [];
    if (Array.isArray(valor)) return valor;
    try {
        const parsed = JSON.parse(valor);
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// PARTE 2 — EL CATÁLOGO EN MEMORIA
// ─────────────────────────────────────────────────────────────────────────────
//
// Se llena al arrancar y al sincronizar. En modo conectado baja del backend y se
// guarda en la SQLite local; en modo local sale directamente de la SQLite. Así
// la caja puede armar un carrito con extras SIN internet, igual que el impuesto
// (§29) y las propinas (§30).

let catalogoModificadores = { grupos: [], porProducto: new Map(), opciones: new Map() };

/** Reconstruye los índices a partir de la lista plana de grupos y enlaces. */
function _indexarCatalogoModificadores(grupos, enlaces) {
    const porProducto = new Map();
    const opciones = new Map();
    const porId = new Map();

    for (const g of grupos || []) {
        porId.set(g.id, g);
        for (const o of g.options || []) opciones.set(o.id, { ...o, group_id: g.id, group: g.name });
    }
    for (const e of enlaces || []) {
        if (!porId.has(e.group_id)) continue;
        if (!porProducto.has(e.product_id)) porProducto.set(e.product_id, []);
        porProducto.get(e.product_id).push(porId.get(e.group_id));
    }

    catalogoModificadores = { grupos: grupos || [], porProducto, opciones };
}

/**
 * Carga el catálogo. `origen`:
 *   'backend' → lo baja de la nube (lo llama el sync)
 *   'local'   → lo lee de la SQLite (modo local puro, o sin internet)
 */
async function cargarCatalogoModificadores() {
    // ⚠️ PRIMERO LO LOCAL, Y LA NUBE DESPUÉS SIN BLOQUEAR.
    //
    // Antes era al revés: en modo conectado se esperaba a `getModifiers()` y solo
    // se caía al respaldo local si fallaba. Como esta función va DENTRO de la
    // cadena del arranque (render.js), un servidor dormido —el caso normal con el
    // plan gratuito de Render, que tarda cerca de un minuto en despertar y agota
    // los 30 s de timeout— dejaba la app colgada ahí: sin menú cableado, sin vista
    // inicial y sin el indicador de conexión. Lo encontró el recorrido `dormido`
    // de pruebas-ui (§46).
    //
    // El catálogo local es un espejo fiel del de la nube (§32), así que pintarlo
    // primero deja la caja lista para vender en el acto; cuando el servidor
    // conteste, se reindexa con lo de arriba y se vuelve a guardar.
    try {
        const local = await window.api.obtenerCatalogoModificadores();
        _indexarCatalogoModificadores(local.groups, local.product_groups);
    } catch (e) {
        console.warn('Catálogo de modificadores local:', e && e.message);
        catalogoModificadores = { grupos: [], porProducto: new Map(), opciones: new Map() };
    }

    if (modoConectado && apiClient && tokenActual) {
        apiClient.getModifiers()
            .then(async (data) => {
                _indexarCatalogoModificadores(data.groups, data.product_groups);
                // Se guarda local para poder vender sin internet.
                await window.api.guardarCatalogoModificadores(data).catch(() => {});
            })
            .catch((e) => console.warn('Catálogo de modificadores desde la nube:', e && e.message));
    }
}

/** Grupos que ofrece un producto, en el orden configurado. */
function gruposDeProducto(productoId) {
    return catalogoModificadores.porProducto.get(parseInt(productoId)) || [];
}

/** ¿Este producto tiene modificadores que preguntar al agregarlo al carrito? */
function productoTieneModificadores(productoId) {
    const grupos = gruposDeProducto(productoId);
    return grupos.some(g => (g.options || []).length > 0);
}

// ─────────────────────────────────────────────────────────────────────────────
// PARTE 3 — MODAL DE SELECCIÓN
// ─────────────────────────────────────────────────────────────────────────────

// Estado del modal abierto. `_modsCallback` recibe la selección congelada.
let _modsProducto = null;
let _modsSeleccion = new Map();   // groupId → Set(optionId)
let _modsCallback = null;

/**
 * Abre el selector de modificadores para un producto.
 * Si el producto no tiene ninguno, llama al callback con [] sin mostrar nada:
 * un negocio sin extras no debe ver un paso de más al vender.
 */
function abrirModalModificadores(producto, callback, seleccionPrevia = []) {
    const grupos = gruposDeProducto(producto.id).filter(g => (g.options || []).length > 0);
    if (grupos.length === 0) { callback([]); return; }

    _modsProducto = producto;
    _modsCallback = callback;
    _modsSeleccion = new Map();
    // Reabrir para EDITAR un renglón del carrito: se marca lo que ya tenía.
    for (const m of seleccionPrevia || []) {
        if (!m || !m.group_id || !m.option_id) continue;
        if (!_modsSeleccion.has(m.group_id)) _modsSeleccion.set(m.group_id, new Set());
        _modsSeleccion.get(m.group_id).add(m.option_id);
    }

    document.getElementById('mods-titulo').innerText = producto.nombre || 'Producto';
    _renderizarModalModificadores();
    document.getElementById('modalModificadores').classList.remove('hidden');
}

function _renderizarModalModificadores() {
    const grupos = gruposDeProducto(_modsProducto.id).filter(g => (g.options || []).length > 0);
    const cont = document.getElementById('mods-grupos');

    cont.innerHTML = grupos.map(g => {
        const elegidas = _modsSeleccion.get(g.id) || new Set();
        // max_select 1 → botones de una sola opción; más de uno → casillas.
        const unaSola = g.max_select === 1;
        const requerido = (g.min_select || 0) > 0;
        const pista = requerido
            ? '<span class="mods-obligatorio">Obligatorio</span>'
            : (g.max_select ? `<span class="mods-pista">Hasta ${g.max_select}</span>` : '');

        const opciones = (g.options || []).map(o => {
            const marcada = elegidas.has(o.id);
            const delta = parseFloat(o.price_delta) || 0;
            const etiquetaPrecio = delta === 0
                ? ''
                : `<span class="mods-delta ${delta < 0 ? 'negativo' : ''}">${delta > 0 ? '+' : '−'}$${Math.abs(delta).toFixed(2)}</span>`;
            return `
                <button type="button" class="mods-opcion ${marcada ? 'activa' : ''}"
                        onclick="alternarOpcionModificador(${g.id}, ${o.id})">
                    <span class="mods-check">${marcada ? '✓' : ''}</span>
                    <span class="mods-nombre">${esc(o.name)}</span>
                    ${etiquetaPrecio}
                </button>`;
        }).join('');

        return `
            <div class="mods-grupo" data-unica="${unaSola ? 1 : 0}">
                <div class="mods-grupo-titulo">${esc(g.name)} ${pista}</div>
                <div class="mods-opciones">${opciones}</div>
            </div>`;
    }).join('');

    _actualizarTotalModalModificadores();
}

/**
 * Marca o desmarca una opción. Con `max_select: 1` elegir otra REEMPLAZA la
 * anterior (es un "tamaño", no una lista); con varios, se topa en el máximo.
 */
function alternarOpcionModificador(grupoId, opcionId) {
    const grupo = gruposDeProducto(_modsProducto.id).find(g => g.id === grupoId);
    if (!grupo) return;

    if (!_modsSeleccion.has(grupoId)) _modsSeleccion.set(grupoId, new Set());
    const elegidas = _modsSeleccion.get(grupoId);

    if (elegidas.has(opcionId)) {
        elegidas.delete(opcionId);
    } else if (grupo.max_select === 1) {
        elegidas.clear();
        elegidas.add(opcionId);
    } else {
        const tope = grupo.max_select;
        if (tope && elegidas.size >= tope) {
            // El backend responde 400 con este mismo mensaje: mejor decirlo aquí,
            // antes de que el cajero llegue a cobrar.
            alertaZenit(`En "${grupo.name}" solo puedes elegir ${tope} ${tope === 1 ? 'opción' : 'opciones'}.`);
            return;
        }
        elegidas.add(opcionId);
    }
    _renderizarModalModificadores();
}

/** La selección actual, ya congelada (mismo shape que guarda el backend). */
function _seleccionActualModificadores() {
    const seleccion = [];
    for (const grupo of gruposDeProducto(_modsProducto.id)) {
        const elegidas = _modsSeleccion.get(grupo.id);
        if (!elegidas) continue;
        for (const opcion of grupo.options || []) {
            if (!elegidas.has(opcion.id)) continue;
            seleccion.push({
                option_id: opcion.id,
                group_id: grupo.id,
                group: grupo.name,
                name: opcion.name,
                price_delta: _redondearMod(parseFloat(opcion.price_delta) || 0),
            });
        }
    }
    return seleccion;
}

function _actualizarTotalModalModificadores() {
    const seleccion = _seleccionActualModificadores();
    const precio = precioConModificadores(_modsProducto.precio, seleccion);
    const el = document.getElementById('mods-total');
    if (el) el.innerText = `$${precio.toFixed(2)}`;

    // Los grupos obligatorios se avisan aquí, no en el backend (§ modificadores:
    // el servidor no valida min_select para no romper binarios viejos).
    const faltan = gruposDeProducto(_modsProducto.id).filter(g => {
        const min = g.min_select || 0;
        if (min <= 0) return false;
        return (_modsSeleccion.get(g.id) || new Set()).size < min;
    });
    const btn = document.getElementById('mods-confirmar');
    const aviso = document.getElementById('mods-aviso');
    if (btn) btn.disabled = faltan.length > 0;
    if (aviso) {
        aviso.innerText = faltan.length
            ? `Falta elegir: ${faltan.map(g => g.name).join(', ')}`
            : '';
    }
}

function confirmarModificadores() {
    const seleccion = _seleccionActualModificadores();
    const cb = _modsCallback;
    cerrarModalModificadores();
    if (cb) cb(seleccion);
}

function cerrarModalModificadores() {
    document.getElementById('modalModificadores').classList.add('hidden');
    _modsProducto = null;
    _modsCallback = null;
    _modsSeleccion = new Map();
}

// ─────────────────────────────────────────────────────────────────────────────
// PARTE 4 — LA BIBLIOTECA (administración)
// ─────────────────────────────────────────────────────────────────────────────
//
// ⚠️ CONFIGURAR la biblioteca requiere conexión, a propósito. Los ids de grupos y
// opciones son los del BACKEND: si el desktop los creara offline tendría que
// inventarse ids y luego reconciliarlos, como pasa con los descuentos. USARLOS
// sí funciona sin internet — que es lo que le importa a la caja.

/** ¿Se puede editar la biblioteca ahora mismo? */
function _puedeEditarModificadores() {
    return Boolean(modoConectado && apiClient && tokenActual);
}

async function abrirBibliotecaModificadores() {
    if (!_puedeEditarModificadores()) {
        alertaZenit(
            'Los modificadores se configuran con la cuenta en línea. Conéctate para crearlos; una vez creados, se pueden usar sin internet.',
            'Sin conexión'
        );
        return;
    }
    document.getElementById('modalBibliotecaMods').classList.remove('hidden');
    await _renderizarBibliotecaModificadores();
}

function cerrarBibliotecaModificadores() {
    document.getElementById('modalBibliotecaMods').classList.add('hidden');
}

async function _renderizarBibliotecaModificadores() {
    const cont = document.getElementById('bibmods-lista');
    cont.innerHTML = '<p style="color:#9ca3af;">Cargando…</p>';
    try {
        const data = await apiClient.getModifiers();
        _indexarCatalogoModificadores(data.groups, data.product_groups);
        await window.api.guardarCatalogoModificadores(data).catch(() => {});
    } catch (e) {
        cont.innerHTML = '<p style="color:#ef4444;">No se pudo cargar la biblioteca.</p>';
        return;
    }

    const grupos = catalogoModificadores.grupos;
    if (grupos.length === 0) {
        cont.innerHTML = `<p style="color:#9ca3af;padding:12px 0;">
            Todavía no hay grupos. Crea uno ("Extras", "Tamaño") y engánchalo a tus productos.
        </p>`;
        return;
    }

    cont.innerHTML = grupos.map(g => `
        <div style="border:1px solid #e5e7eb;border-radius:10px;padding:12px;margin-bottom:10px;">
            <div style="display:flex;gap:8px;align-items:center;margin-bottom:8px;">
                <input value="${esc(g.name)}" id="bibmods-nombre-${g.id}"
                       style="flex:1;padding:6px 8px;border:1px solid #d1d5db;border-radius:6px;font-weight:600;">
                <label style="font-size:0.8em;color:#6b7280;">Máx.
                    <input type="number" min="1" placeholder="∞" value="${g.max_select === null ? '' : g.max_select}"
                           id="bibmods-max-${g.id}" style="width:52px;padding:4px;border:1px solid #d1d5db;border-radius:6px;">
                </label>
                <label style="font-size:0.8em;color:#6b7280;display:flex;align-items:center;gap:4px;">
                    <input type="checkbox" id="bibmods-req-${g.id}" ${(g.min_select || 0) > 0 ? 'checked' : ''}>
                    Obligatorio
                </label>
                <button class="btn-secondary small" onclick="guardarGrupoModificador(${g.id})" title="Guardar">✓</button>
                <button class="btn-secondary small" style="color:#ef4444;" onclick="eliminarGrupoModificador(${g.id}, '${esc(g.name)}')" title="Eliminar">×</button>
            </div>
            <div style="padding-left:8px;">
                ${(g.options || []).map(o => `
                    <div style="display:flex;gap:6px;align-items:center;margin-bottom:5px;">
                        <input value="${esc(o.name)}" id="bibmods-opnombre-${o.id}"
                               style="flex:1;padding:5px 8px;border:1px solid #e5e7eb;border-radius:6px;font-size:0.9em;">
                        <input type="number" step="0.01" value="${parseFloat(o.price_delta) || 0}" id="bibmods-opdelta-${o.id}"
                               style="width:84px;padding:5px;border:1px solid #e5e7eb;border-radius:6px;font-size:0.9em;text-align:right;">
                        <button class="btn-secondary small" onclick="guardarOpcionModificador(${o.id})" title="Guardar">✓</button>
                        <button class="btn-secondary small" style="color:#ef4444;" onclick="eliminarOpcionModificador(${o.id}, '${esc(o.name)}')" title="Eliminar">×</button>
                    </div>
                `).join('')}
                <div style="display:flex;gap:6px;align-items:center;margin-top:6px;">
                    <input placeholder="Nueva opción (ej. Extra queso)" id="bibmods-nueva-nombre-${g.id}"
                           style="flex:1;padding:5px 8px;border:1px dashed #d1d5db;border-radius:6px;font-size:0.9em;">
                    <input type="number" step="0.01" placeholder="0.00" id="bibmods-nueva-delta-${g.id}"
                           style="width:84px;padding:5px;border:1px dashed #d1d5db;border-radius:6px;font-size:0.9em;text-align:right;">
                    <button class="btn-secondary small" onclick="agregarOpcionModificador(${g.id})">+</button>
                </div>
            </div>
        </div>
    `).join('');
}

async function nuevoGrupoModificador() {
    try {
        await apiClient.createModifierGroup({ name: 'Nuevo grupo', min_select: 0, max_select: 1 });
        await _renderizarBibliotecaModificadores();
    } catch (e) {
        alertaZenit(e.message || 'No se pudo crear el grupo');
    }
}

async function guardarGrupoModificador(id) {
    const nombre = document.getElementById(`bibmods-nombre-${id}`)?.value?.trim();
    const maxCrudo = document.getElementById(`bibmods-max-${id}`)?.value;
    const requerido = document.getElementById(`bibmods-req-${id}`)?.checked;
    if (!nombre) { alertaZenit('El grupo necesita un nombre'); return; }
    try {
        await apiClient.updateModifierGroup(id, {
            name: nombre,
            // Vacío = sin límite. Es un caso normal ("Extras").
            max_select: maxCrudo === '' ? null : parseInt(maxCrudo),
            min_select: requerido ? 1 : 0,
        });
        await _renderizarBibliotecaModificadores();
        mostrarNotificacionExito('Grupo actualizado', 'Modificadores');
    } catch (e) {
        alertaZenit(e.message || 'No se pudo guardar el grupo');
    }
}

async function eliminarGrupoModificador(id, nombre) {
    const ok = await confirmarZenit(
        `Se quitará "${nombre}" de todos los productos que lo usan. Los tickets ya cobrados no cambian.`,
        '¿Eliminar el grupo?', { textoOk: 'Eliminar', peligro: true }
    );
    if (!ok) return;
    try {
        await apiClient.deleteModifierGroup(id);
        await _renderizarBibliotecaModificadores();
    } catch (e) {
        alertaZenit(e.message || 'No se pudo eliminar el grupo');
    }
}

async function agregarOpcionModificador(grupoId) {
    const nombre = document.getElementById(`bibmods-nueva-nombre-${grupoId}`)?.value?.trim();
    const delta = document.getElementById(`bibmods-nueva-delta-${grupoId}`)?.value;
    if (!nombre) { alertaZenit('La opción necesita un nombre'); return; }
    try {
        await apiClient.createModifierOption(grupoId, {
            name: nombre,
            price_delta: delta === '' ? 0 : parseFloat(delta),
        });
        await _renderizarBibliotecaModificadores();
    } catch (e) {
        alertaZenit(e.message || 'No se pudo crear la opción');
    }
}

async function guardarOpcionModificador(id) {
    const nombre = document.getElementById(`bibmods-opnombre-${id}`)?.value?.trim();
    const delta = document.getElementById(`bibmods-opdelta-${id}`)?.value;
    if (!nombre) { alertaZenit('La opción necesita un nombre'); return; }
    try {
        await apiClient.updateModifierOption(id, {
            name: nombre,
            price_delta: delta === '' ? 0 : parseFloat(delta),
        });
        await _renderizarBibliotecaModificadores();
        mostrarNotificacionExito('Opción actualizada', 'Modificadores');
    } catch (e) {
        alertaZenit(e.message || 'No se pudo guardar la opción');
    }
}

async function eliminarOpcionModificador(id, nombre) {
    const ok = await confirmarZenit(
        `"${nombre}" dejará de poder elegirse. Los tickets ya cobrados no cambian.`,
        '¿Eliminar la opción?', { textoOk: 'Eliminar', peligro: true }
    );
    if (!ok) return;
    try {
        await apiClient.deleteModifierOption(id);
        await _renderizarBibliotecaModificadores();
    } catch (e) {
        alertaZenit(e.message || 'No se pudo eliminar la opción');
    }
}

// ── Enganchar grupos a UN producto ──────────────────────────────────────────

let _prodModsId = null;

async function abrirModificadoresDeProducto(productoId, nombreProducto) {
    if (!_puedeEditarModificadores()) {
        alertaZenit(
            'Los modificadores se configuran con la cuenta en línea. Conéctate para engancharlos a este producto.',
            'Sin conexión'
        );
        return;
    }
    _prodModsId = productoId;
    document.getElementById('prodmods-titulo').innerText = `Modificadores de ${nombreProducto || 'producto'}`;

    const cont = document.getElementById('prodmods-lista');
    cont.innerHTML = '<p style="color:#9ca3af;">Cargando…</p>';
    document.getElementById('modalProductoMods').classList.remove('hidden');

    try {
        const [data, enlaces] = await Promise.all([
            apiClient.getModifiers(),
            apiClient.getProductModifiers(productoId),
        ]);
        _indexarCatalogoModificadores(data.groups, data.product_groups);
        const activos = new Set((enlaces || []).map(e => e.group_id));

        if (!data.groups.length) {
            cont.innerHTML = `<p style="color:#9ca3af;">
                Todavía no hay grupos. Crea uno desde el botón "Modificadores" de esta pantalla.
            </p>`;
            return;
        }
        cont.innerHTML = data.groups.map(g => `
            <label style="display:flex;align-items:center;gap:8px;padding:8px 4px;border-bottom:1px solid #f3f4f6;cursor:pointer;">
                <input type="checkbox" class="prodmods-check" value="${g.id}" ${activos.has(g.id) ? 'checked' : ''}>
                <span style="flex:1;">${esc(g.name)}</span>
                <span style="color:#9ca3af;font-size:0.85em;">${(g.options || []).length} opciones</span>
            </label>
        `).join('');
    } catch (e) {
        cont.innerHTML = '<p style="color:#ef4444;">No se pudieron cargar los grupos.</p>';
    }
}

function cerrarModificadoresDeProducto() {
    document.getElementById('modalProductoMods').classList.add('hidden');
    _prodModsId = null;
}

async function guardarModificadoresDeProducto() {
    if (!_prodModsId) return;
    const ids = Array.from(document.querySelectorAll('.prodmods-check'))
        .filter(el => el.checked)
        .map(el => parseInt(el.value));
    try {
        await apiClient.setProductModifiers(_prodModsId, ids);
        // Se refresca el catálogo local: el cajero tiene que ver el cambio en la
        // siguiente venta, no en la siguiente sincronización.
        await cargarCatalogoModificadores();
        cerrarModificadoresDeProducto();
        mostrarNotificacionExito('Modificadores del producto guardados', 'Productos');
    } catch (e) {
        alertaZenit(e.message || 'No se pudieron guardar los modificadores');
    }
}
