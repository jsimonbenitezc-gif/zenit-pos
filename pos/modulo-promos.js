// ============================================================================
// MÓDULO: Promos (PLAN_OFERTAS_V1, Bloque 2)
//
// "Martes 2x1 en tacos": la promo es un PRODUCTO que se vende. La cajera toca
// el botón, elige dos tacos y entra al carrito como UN renglón; en la base se
// guarda un renglón por taco, con su parte del precio (§3.1 del plan). Así
// cocina, inventario, rentabilidad, impuesto y corte de caja ven productos
// normales sin cambiar una línea.
//
// 🔴 LA PARTE 1 (el bloque `PromosRegla`) ES UNA COPIA de `utils/ventanas.js`
// y de la PARTE 1 de `utils/promos.js` del backend, y habrá una tercera en el
// celular. El desktop sube TODAS sus ventas como diferidas y el servidor
// respeta el precio que cobró, así que si esta copia se desvía el ticket dice
// un número y el reporte otro. Si cambias una, cambia las otras:
// `scripts/smoke-promos-gemelas.js` carga las dos y compara cientos de casos.
//
// Va dentro de una función para que sus nombres (`r2`, `TIPOS`…) no choquen con
// los globales de los demás módulos del renderer.
// ============================================================================

const PromosRegla = (function () {
    // ── utils/ventanas.js ──

    const RE_HORA = /^([01]\d|2[0-3]):([0-5]\d)$/;

    /** 'HH:MM' → minutos desde medianoche. null si no tiene ese formato. */
    function minutosDeHora(texto) {
        const m = RE_HORA.exec(String(texto || '').trim());
        if (!m) return null;
        return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
    }

    /**
     * ¿Qué ventana está viva en el día `dow` al minuto `minutos`?
     * Devuelve 'hoy' (la ventana del propio día), 'ayer' (la de ayer, que cruzó la
     * medianoche y aún no cierra) o null. Saber CUÁL importa: la promo del viernes
     * de 22:00 a 02:00 que se evalúa el sábado a la 1:30 es la del VIERNES, y es la
     * fecha del viernes la que cuenta para "entre fechas".
     */
    function ventanaViva(semana, dow, minutos) {
        if (!Array.isArray(semana) || semana.length !== 7) return null;

        const hoy = semana[dow];
        if (hoy && !hoy.cerrado) {
            const abre = minutosDeHora(hoy.abre);
            const cierra = minutosDeHora(hoy.cierra);
            if (abre !== null && cierra !== null) {
                if (abre === cierra) return 'hoy';                              // 24 h
                if (cierra > abre) { if (minutos >= abre && minutos < cierra) return 'hoy'; }
                else if (minutos >= abre) return 'hoy';                        // cruza: la parte de hoy
            }
        }

        const ayer = semana[(dow + 6) % 7];
        if (ayer && !ayer.cerrado) {
            const abre = minutosDeHora(ayer.abre);
            const cierra = minutosDeHora(ayer.cierra);
            if (abre !== null && cierra !== null && cierra < abre && minutos < cierra) return 'ayer';
        }

        return null;
    }

    // ── utils/promos.js, PARTE 1 ──

    const TIPOS = ['precio_fijo', 'regalar_mas_barato'];
    const RE_FECHA = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
    // Una promo de más de 20 productos no es una promo, es un error de captura.
    const MAX_PRODUCTOS_PROMO = 20;

    const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
    const _centavos = (n) => Math.round((Number(n) || 0) * 100);

    // ── El calendario ────────────────────────────────────────────────────────────
    //
    //   null                                  → siempre
    //   { dias: [2],                          → 0 = domingo … 6 = sábado
    //     desde: '18:00', hasta: '20:00',     → opcional; si hasta < desde, cruza la medianoche
    //     fecha_inicio: '2026-10-01',         → opcional, fechas LOCALES del negocio
    //     fecha_fin: '2026-10-31' }             (la fecha fin cuenta entera)

    /**
     * Valida lo que llega del dueño. `{ ok, calendario }` (null = siempre) o
     * `{ ok: false, error }`. Un calendario basura se RECHAZA: caer a "siempre" en
     * silencio dejaría el 2x1 del martes cobrándose el miércoles.
     */
    function normalizarCalendario(valor) {
        if (valor === null || valor === undefined || valor === '') return { ok: true, calendario: null };
        let c = valor;
        if (typeof c === 'string') {
            try { c = JSON.parse(c); } catch { return { ok: false, error: 'El calendario no tiene un formato válido' }; }
        }
        if (c === null) return { ok: true, calendario: null };
        if (typeof c !== 'object' || Array.isArray(c)) return { ok: false, error: 'El calendario no tiene un formato válido' };

        const out = {};
        if (c.dias !== undefined && c.dias !== null) {
            if (!Array.isArray(c.dias) || c.dias.length === 0) {
                return { ok: false, error: 'Elige al menos un día de la semana' };
            }
            const dias = [];
            for (const d of c.dias) {
                const n = Number(d);
                if (!Number.isInteger(n) || n < 0 || n > 6) return { ok: false, error: 'Los días van de 0 (domingo) a 6 (sábado)' };
                if (!dias.includes(n)) dias.push(n);
            }
            // Los siete días es lo mismo que no filtrar por día.
            if (dias.length < 7) out.dias = dias.sort((a, b) => a - b);
        }

        const tieneDesde = c.desde !== undefined && c.desde !== null && c.desde !== '';
        const tieneHasta = c.hasta !== undefined && c.hasta !== null && c.hasta !== '';
        if (tieneDesde !== tieneHasta) return { ok: false, error: 'El horario necesita hora de inicio y de fin' };
        if (tieneDesde) {
            if (minutosDeHora(c.desde) === null || minutosDeHora(c.hasta) === null) {
                return { ok: false, error: 'Las horas van en formato HH:MM (por ejemplo 18:00)' };
            }
            out.desde = String(c.desde).trim();
            out.hasta = String(c.hasta).trim();
        }

        for (const k of ['fecha_inicio', 'fecha_fin']) {
            if (c[k] === undefined || c[k] === null || c[k] === '') continue;
            const f = String(c[k]).trim().slice(0, 10);
            if (!RE_FECHA.test(f)) return { ok: false, error: 'Las fechas van en formato AAAA-MM-DD' };
            out[k] = f;
        }
        if (out.fecha_inicio && out.fecha_fin && out.fecha_inicio > out.fecha_fin) {
            return { ok: false, error: 'La fecha de inicio es posterior a la de fin' };
        }

        return { ok: true, calendario: Object.keys(out).length ? out : null };
    }

    /** Lee un calendario ya guardado (TEXT o objeto) sin lanzar nunca. */
    function leerCalendario(valor) {
        const r = normalizarCalendario(valor);
        return r.ok ? r.calendario : null;
    }

    /**
     * ¿El calendario está vigente en este momento LOCAL?
     * `local` = { dow, minutos, fecha: 'YYYY-MM-DD', fechaAyer: 'YYYY-MM-DD' }.
     *
     * Se arma una semana con las ventanas del calendario y se le pregunta a
     * `ventanaViva`, la misma de los horarios (§37). Si la ventana viva es la de
     * AYER (un happy hour que cruzó la medianoche), la fecha que cuenta para
     * "entre fechas" es la de ayer: el 31 de octubre de 22:00 a 02:00 sigue siendo
     * del 31 a la 1 de la mañana del 1 de noviembre.
     */
    function calendarioVigente(calendario, local) {
        const c = leerCalendario(calendario);
        if (!c) return true;
        if (!local) return false;

        const ventanaDelDia = c.desde ? { abre: c.desde, cierra: c.hasta } : { abre: '00:00', cierra: '00:00' };
        const semana = Array.from({ length: 7 }, (_, d) =>
            (!c.dias || c.dias.includes(d)) ? ventanaDelDia : { cerrado: true }
        );

        const cual = ventanaViva(semana, local.dow, local.minutos);
        if (!cual) return false;

        const fechaRef = cual === 'ayer' ? local.fechaAyer : local.fecha;
        if (c.fecha_inicio && fechaRef < c.fecha_inicio) return false;
        if (c.fecha_fin && fechaRef > c.fecha_fin) return false;
        return true;
    }

    /**
     * Las partes locales que necesita el calendario, a partir de una hora local
     * ya conocida (año, mes 1-12, día, hora, minuto). Los clientes la llaman con
     * el reloj del equipo, que ya es la hora del negocio.
     */
    function localDesdePartes({ year, month, day, hour, minute }) {
        const pad = (n) => String(n).padStart(2, '0');
        const hoy = new Date(Date.UTC(year, month - 1, day));
        const ayer = new Date(Date.UTC(year, month - 1, day - 1));
        const iso = (d) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
        return { dow: hoy.getUTCDay(), minutos: hour * 60 + minute, fecha: iso(hoy), fechaAyer: iso(ayer) };
    }

    // ── El precio y el reparto ───────────────────────────────────────────────────

    /** Tipo de cobro con su default: lo viejo (combos de precio fijo) es 'precio_fijo'. */
    function tipoDePromo(promo) {
        return promo && TIPOS.includes(promo.tipo) ? promo.tipo : 'precio_fijo';
    }

    /**
     * Lo que cuesta la promo con estos productos, ANTES de extras.
     * `precios` = precio de lista de cada producto elegido.
     *   precio fijo            → P
     *   regalar el más barato  → suma − los (lleva − paga) más baratos
     */
    function precioPromo(promo, precios) {
        const lista = (precios || []).map(p => Math.max(0, r2(p)));
        if (tipoDePromo(promo) === 'precio_fijo') return Math.max(0, r2(promo.price));

        const lleva = lista.length;
        const paga = Math.max(0, Math.min(lleva, parseInt(promo.paga, 10) || 0));
        const gratis = lleva - paga;
        const ordenados = [...lista].sort((a, b) => a - b);
        const suma = lista.reduce((s, p) => s + _centavos(p), 0);
        const regalado = ordenados.slice(0, gratis).reduce((s, p) => s + _centavos(p), 0);
        return (suma - regalado) / 100;
    }

    /**
     * Reparte `precio` entre los productos en proporción a su precio de lista.
     * Devuelve las partes en el MISMO orden que `precios`. A centavos, con el
     * residuo del redondeo en el más caro (el primero, si hay empate): la suma de
     * las partes es exactamente `precio`.
     */
    function repartir(precio, precios) {
        const n = (precios || []).length;
        if (n === 0) return [];
        const total = _centavos(Math.max(0, r2(precio)));
        const lista = precios.map(p => Math.max(0, _centavos(p)));
        const suma = lista.reduce((s, c) => s + c, 0);

        // Sin precios de lista (todo a $0): partes iguales.
        const partes = lista.map(c => suma > 0 ? Math.round(total * c / suma) : Math.floor(total / n));
        let masCaro = 0;
        for (let i = 1; i < n; i++) if (lista[i] > lista[masCaro]) masCaro = i;
        partes[masCaro] += total - partes.reduce((s, c) => s + c, 0);
        return partes.map(c => c / 100);
    }

    /**
     * Los renglones de una promo vendida. `elegidos` = [{ precio, delta }] con el
     * precio de lista de cada producto y la suma de sus extras.
     * Devuelve { precio, renglones: [{ parte, unit_price }], total, ahorro }.
     */
    function armarPromo(promo, elegidos, precioForzado = null) {
        const precios = elegidos.map(e => e.precio);
        const precio = precioForzado !== null && precioForzado !== undefined
            ? Math.max(0, r2(precioForzado))
            : precioPromo(promo, precios);
        const partes = repartir(precio, precios);
        const renglones = elegidos.map((e, i) => ({
            parte: partes[i],
            unit_price: r2(partes[i] + (Number(e.delta) || 0)),
        }));
        const total = renglones.reduce((s, r) => s + _centavos(r.unit_price), 0) / 100;
        const lista = precios.reduce((s, p) => s + _centavos(p), 0) / 100;
        return { precio, renglones, total, ahorro: r2(lista - precio) };
    }

    // ── Qué se puede elegir ──────────────────────────────────────────────────────
    //
    // Un "hueco" (slot) de la promo es "N de [estos productos]" o "N de [esta
    // categoría]". Un combo viejo —producto fijo con cantidad— es un hueco de un
    // solo producto. La elección cabe si cada producto elegido se puede sentar en
    // un hueco y cada hueco queda exactamente lleno.

    /** ¿Este producto entra en este hueco? `producto` = { id, category_id }. */
    function cabeEnHueco(hueco, producto) {
        if (!hueco || !producto) return false;
        const ids = Array.isArray(hueco.product_ids) ? hueco.product_ids.map(Number) : [];
        if (ids.length) return ids.includes(Number(producto.id));
        if (hueco.category_id !== null && hueco.category_id !== undefined) {
            return Number(hueco.category_id) === Number(producto.category_id);
        }
        return false;
    }

    /** Cuántos productos lleva la promo en total (suma de los huecos). */
    function productosQueLleva(huecos) {
        return (huecos || []).reduce((s, h) => s + Math.max(0, parseInt(h.quantity, 10) || 0), 0);
    }

    /**
     * ¿La elección cabe en la promo? Asignación con vuelta atrás: dos huecos de la
     * misma categoría ("1 de Tacos + 1 de Tacos o Quesadillas") no se pueden llenar
     * a lo primero que caiga. Con 20 productos como máximo sobra.
     */
    function eleccionCabe(huecos, productos) {
        const total = productosQueLleva(huecos);
        if (!Array.isArray(productos) || productos.length !== total || total === 0) return false;
        const libres = huecos.map(h => Math.max(0, parseInt(h.quantity, 10) || 0));

        const sentar = (i) => {
            if (i === productos.length) return libres.every(n => n === 0);
            for (let h = 0; h < huecos.length; h++) {
                if (libres[h] > 0 && cabeEnHueco(huecos[h], productos[i])) {
                    libres[h]--;
                    if (sentar(i + 1)) return true;
                    libres[h]++;
                }
            }
            return false;
        };
        return sentar(0);
    }

    return {
        RE_HORA, minutosDeHora, ventanaViva,
        TIPOS, MAX_PRODUCTOS_PROMO,
        normalizarCalendario, leerCalendario, calendarioVigente, localDesdePartes,
        tipoDePromo, precioPromo, repartir, armarPromo,
        cabeEnHueco, productosQueLleva, eleccionCabe,
    };
})();

// ════════════════════════════════════════════════════════════════════════════
// PARTE 2 — SOLO DEL DESKTOP: las promos del negocio, el carrito y la pantalla
// ════════════════════════════════════════════════════════════════════════════

const _r2Promo = (n) => Math.round((Number(n) || 0) * 100) / 100;
const _cPromo = (n) => Math.round((Number(n) || 0) * 100);

// Las promos del negocio, leídas de la SQLite (espejo de GET /offers/combos).
// Se leen de ahí también con internet: es un espejo fiel y así la caja tiene
// sus promos aunque el servidor esté dormido (§47).
let promosNegocio = [];
// ¿Los descuentos de la cuenta alcanzan también a lo que ya está en promo?
// (settings.ofertas_acumulables, §3.4 del plan). Apagado de fábrica.
let ofertasAcumulables = false;

/**
 * Las partes locales del instante `fecha`, con el reloj del EQUIPO. El reloj
 * del equipo ya es la hora del negocio (mismo criterio que los horarios, §37.6):
 * aquí no hay zona que convertir, y usar `getUTC…` correría el martes a las
 * 6 p. m. del lunes.
 */
function localDelEquipo(fecha = new Date()) {
    const d = new Date(fecha);
    return PromosRegla.localDesdePartes({
        year: d.getFullYear(), month: d.getMonth() + 1, day: d.getDate(),
        hour: d.getHours(), minute: d.getMinutes(),
    });
}

/** Una fila de `combos` de la SQLite (con sus `items`) como la usa la venta. */
function promoDeFila(fila) {
    let huecos = [];
    try { huecos = fila.slots ? JSON.parse(fila.slots) : []; } catch { huecos = []; }
    // Un combo de antes de este bloque no trae `slots`: sus productos fijos son
    // huecos de un solo producto, igual que en el servidor (huecoDeRenglon).
    if (!Array.isArray(huecos) || huecos.length === 0) {
        huecos = (fila.items || []).map(it => ({
            quantity: it.cantidad || 1, product_ids: [it.producto_id], category_id: null,
        }));
    }
    huecos = huecos.map(h => ({
        quantity: Math.max(1, parseInt(h.quantity, 10) || 1),
        product_ids: Array.isArray(h.product_ids) ? h.product_ids.map(Number).filter(Number.isInteger) : [],
        category_id: h.category_id !== undefined && h.category_id !== null && h.category_id !== ''
            ? Number(h.category_id) : null,
    })).filter(h => h.product_ids.length || h.category_id !== null);
    return {
        id: fila.id,
        name: fila.nombre,
        descripcion: fila.descripcion || '',
        tipo: PromosRegla.tipoDePromo(fila),
        price: parseFloat(fila.precio_especial) || 0,
        paga: fila.paga !== null && fila.paga !== undefined ? parseInt(fila.paga, 10) : null,
        lleva: PromosRegla.productosQueLleva(huecos),
        calendario: PromosRegla.leerCalendario(fila.calendario),
        active: !(fila.activo === 0 || fila.activo === false),
        huecos,
    };
}

/** Relee las promos y el interruptor de la SQLite. Nunca lanza. */
async function cargarPromosLocales() {
    try {
        const filas = await window.api.obtenerPromosVenta();
        promosNegocio = (filas || []).map(promoDeFila);
    } catch (e) {
        console.warn('No se pudieron leer las promos locales:', e && e.message);
        promosNegocio = [];
    }
    try {
        const aj = await window.api.obtenerAjustes();
        ofertasAcumulables = Boolean(aj && aj.ofertas_acumulables === 'true');
    } catch {
        // Falla segura: nunca apilar descuentos por accidente.
        ofertasAcumulables = false;
    }
    return promosNegocio;
}

/** Un 2x1 que lleva 1 y cobra 1 no es una promo: el servidor lo rechazaría. */
function promoBienConfigurada(promo) {
    if (!promo || !Array.isArray(promo.huecos) || promo.huecos.length === 0) return false;
    if (promo.tipo === 'regalar_mas_barato') return promo.paga >= 1 && promo.paga < promo.lleva;
    return true;
}

function _productoParaPromo(pr) {
    return { id: pr.id, category_id: pr.clasificacion_id !== undefined ? pr.clasificacion_id : pr.category_id };
}

/** ¿Este producto está agotado? `stock` NULL es "sin control" (§19.38), no cero. */
function _agotado(pr) {
    return pr && pr.stock !== null && pr.stock !== undefined && pr.stock !== '' && Number(pr.stock) <= 0;
}

/**
 * Los productos que se pueden elegir para un hueco. Uno agotado no aparece
 * (trampa 8 del plan): ofrecerlo es prometer algo que la cocina no tiene.
 */
function productosDelHueco(hueco, productos = (typeof productosGlobales !== 'undefined' ? productosGlobales : [])) {
    return (productos || []).filter(pr => !_agotado(pr) && PromosRegla.cabeEnHueco(hueco, _productoParaPromo(pr)));
}

function promoSePuedeVender(promo, productos) {
    return promoBienConfigurada(promo) && promo.huecos.every(h => productosDelHueco(h, productos).length > 0);
}

/**
 * Las promos que la caja enseña AHORA: activas, bien armadas, con algo que
 * elegir y dentro de su calendario. Fuera de horario la promo NO EXISTE en la
 * pantalla — así nadie la cobra por error el miércoles.
 */
function promosActivasAhora(fecha = new Date(), productos) {
    if (typeof puedeAccederPremium === 'function' && !puedeAccederPremium()) return [];
    const local = localDelEquipo(fecha);
    return promosNegocio.filter(p =>
        p.active && promoSePuedeVender(p, productos) && PromosRegla.calendarioVigente(p.calendario, local)
    );
}

/** ¿El descuento de la tabla `promociones` vale ahora? (su calendario, §3.3). */
function descuentoVigenteLocal(descuento, fecha = new Date()) {
    if (!descuento) return false;
    return PromosRegla.calendarioVigente(descuento.calendario, localDelEquipo(fecha));
}

// ── El renglón del carrito ──────────────────────────────────────────────────

/**
 * Arma el renglón de carrito de una promo vendida.
 * `elegidos` = [{ id, nombre, precio (de lista), modificadores, nota }].
 *
 * `precio` es lo que cobra el renglón ENTERO (partes + extras): todo lo que ya
 * sumaba `carrito[i].precio` —impuesto, pagos, total— sigue sin enterarse.
 */
function armarRenglonPromo(promo, elegidos, grupo) {
    const armada = PromosRegla.armarPromo(promo, elegidos.map(e => ({
        precio: e.precio, delta: deltaDeModificadores(e.modificadores),
    })));
    return {
        tipo: 'promo',
        promo_id: promo.id,
        // uuid de ESTA promo vendida: dos 2x1 iguales son dos grupos, o quitar
        // uno se llevaría el otro.
        promo_group: grupo || _generarUuid(),
        nombre: promo.name,
        precio: armada.total,
        precio_promo: armada.precio,
        ahorro: armada.ahorro,
        cantidad: 1,
        nota: '',
        productos: elegidos.map((e, i) => ({
            id: e.id,
            nombre: e.nombre,
            precio_lista: _r2Promo(e.precio),
            parte: armada.renglones[i].parte,
            precio: armada.renglones[i].unit_price,
            modificadores: e.modificadores || [],
            nota: e.nota || '',
        })),
    };
}

/**
 * El carrito como renglones de la base: una promo se vuelve UN renglón por
 * producto (§3.1), con su parte del precio y la marca de su grupo.
 */
function aplanarCarrito(lista) {
    const out = [];
    for (const i of lista || []) {
        if (i && i.tipo === 'promo') {
            for (const p of i.productos) {
                out.push({
                    id: p.id, nombre: p.nombre, cantidad: 1,
                    precio: p.precio, precio_base: p.parte, subtotal: p.precio,
                    modificadores: p.modificadores || [], nota: p.nota || '',
                    promo_id: i.promo_id, promo_group: i.promo_group,
                    promo_name: i.nombre, precio_lista: p.precio_lista,
                });
            }
        } else if (i) {
            out.push({
                id: i.id, nombre: i.nombre, cantidad: 1,
                precio: i.precio,
                precio_base: i.precio_base != null ? i.precio_base : i.precio,
                subtotal: i.precio,
                modificadores: i.modificadores || [], nota: i.nota || '',
            });
        }
    }
    return out;
}

/**
 * Los renglones de un pedido guardado, en la forma de POST /orders. Lo suelto
 * lo arma `mapearSuelto` (cada llamador sabe de dónde saca sus campos); lo que
 * es promo se junta en `{ promo_id, promo_group, promo_price, productos }`.
 *
 * `promo_price` es la suma de las PARTES, sin extras: es lo que el servidor
 * reparte en una venta diferida. `list_price` es el precio de lista con el que
 * se repartió aquí; con los dos, el servidor saca exactamente las mismas partes.
 */
function renglonesParaSubir(items, mapearSuelto) {
    const out = [];
    const grupos = new Map();
    for (const it of items || []) {
        const grupo = it && it.promo_group ? String(it.promo_group) : null;
        if (!grupo) { out.push(mapearSuelto(it)); continue; }
        let r = grupos.get(grupo);
        if (!r) {
            r = {
                promo_id: it.promo_id !== null && it.promo_id !== undefined ? Number(it.promo_id) : null,
                promo_group: grupo,
                promo_name: it.promo_name || null,
                promo_price: 0,
                productos: [],
            };
            grupos.set(grupo, r);
            out.push(r);
        }
        const parte = it.precio_base !== null && it.precio_base !== undefined ? it.precio_base : it.precio_unitario;
        r.promo_price = (_cPromo(r.promo_price) + _cPromo(parte)) / 100;
        const mods = leerModificadores(it.modificadores);
        const lista = parseFloat(it.precio_lista);
        r.productos.push({
            product_id: it.producto_id,
            ...(mods.length ? { modifiers: mods } : {}),
            notes: it.nota_item || it.nota || '',
            ...(Number.isFinite(lista) ? { list_price: lista } : {}),
        });
    }
    return out;
}

/** Los campos de promo de un renglón, venga de la SQLite o del servidor. */
function camposPromoDeRenglon(it) {
    const primero = (...v) => v.find(x => x !== undefined && x !== null && x !== '');
    return {
        grupo: primero(it.promo_group) || null,
        nombre: primero(it.promo_name) || 'Promo',
        subtotal: parseFloat(primero(it.subtotal, it.precio)) || 0,
        parte: parseFloat(primero(it.precio_base, it.base_unit_price, it.parte, it.precio_unitario, it.unit_price)) || 0,
        lista: parseFloat(primero(it.precio_lista, it.list_price)) || 0,
    };
}

/**
 * Junta los renglones de cada promo para enseñarlos como UNO (ticket, cuenta,
 * historial). Lo que no es promo pasa tal cual y en su orden.
 * Devuelve [{ item }] y [{ promo: { grupo, nombre, total, ahorro }, items }].
 */
function agruparRenglones(items) {
    const out = [];
    const grupos = new Map();
    for (const it of items || []) {
        const c = camposPromoDeRenglon(it);
        if (!c.grupo) { out.push({ promo: null, item: it }); continue; }
        let g = grupos.get(c.grupo);
        if (!g) {
            g = { promo: { grupo: c.grupo, nombre: c.nombre, total: 0, ahorro: 0 }, items: [] };
            grupos.set(c.grupo, g);
            out.push(g);
        }
        g.items.push(it);
        g.promo.total = (_cPromo(g.promo.total) + _cPromo(c.subtotal)) / 100;
        g.promo.ahorro = (_cPromo(g.promo.ahorro) + _cPromo(c.lista) - _cPromo(c.parte)) / 100;
    }
    for (const g of out) if (g.promo && g.promo.ahorro < 0) g.promo.ahorro = 0;
    return out;
}

/** Lo que el cliente se ahorró en promos (para "Ahorraste $X" al pie del ticket). */
function ahorroDePromos(items) {
    return agruparRenglones(items).reduce((s, g) => s + (g.promo ? _cPromo(g.promo.ahorro) : 0), 0) / 100;
}

// ── Juntar ofertas (§3.4) ───────────────────────────────────────────────────

/**
 * Sobre qué se calcula un descuento de la cuenta. Apagado el interruptor —el de
 * fábrica— la promo no lleva descuento: una promo de $35 y un refresco de $20
 * con un 10% descuentan $2, no $5.50. Es la MISMA base que usa el servidor
 * (`baseDescuento` de routes/orders.js): si no, cada venta con descuento se
 * auditaría como sospechosa.
 */
function baseDescuentoDe(lista, acumulables = ofertasAcumulables) {
    const suma = (lista || []).reduce((s, i) => s + _cPromo(i && i.precio), 0);
    if (acumulables) return suma / 100;
    const promos = (lista || []).filter(i => i && i.tipo === 'promo').reduce((s, i) => s + _cPromo(i.precio), 0);
    return Math.max(0, suma - promos) / 100;
}

// ── La sugerencia: "¿Convertir a 2x1?" ──────────────────────────────────────

function _categoriaDeProducto(id) {
    const pr = (typeof productosGlobales !== 'undefined' ? productosGlobales : []).find(p => p.id === id);
    return pr ? pr.clasificacion_id : null;
}

/**
 * Si en el carrito hay productos SUELTOS que llenan una promo activa, la
 * sugerencia con más ahorro. Nunca convierte sola (§1 del plan: cambiar un
 * cobro sin que la cajera lo vea termina en reclamo): solo sugiere.
 * Devuelve { promo, indices, ahorro } o null.
 */
function sugerirPromo(lista, activas = promosActivasAhora()) {
    const sueltos = (lista || []).map((it, idx) => ({ it, idx }))
        .filter(x => x.it && x.it.tipo !== 'promo');
    let mejor = null;
    for (const promo of activas || []) {
        const cabe = (x) => ({ id: x.it.id, category_id: _categoriaDeProducto(x.it.id) });
        // Los caros primero: en un 2x1 se regala el más barato, así que la
        // pareja más cara es la que más le ahorra al cliente.
        const cand = sueltos
            .filter(x => promo.huecos.some(h => PromosRegla.cabeEnHueco(h, cabe(x))))
            .sort((a, b) => _precioLista(b.it) - _precioLista(a.it))
            .slice(0, 12);
        if (cand.length < promo.lleva) continue;

        const elegidos = [];
        const buscar = (desde) => {
            if (elegidos.length === promo.lleva) return PromosRegla.eleccionCabe(promo.huecos, elegidos.map(cabe));
            for (let i = desde; i < cand.length; i++) {
                elegidos.push(cand[i]);
                if (buscar(i + 1)) return true;
                elegidos.pop();
            }
            return false;
        };
        if (!buscar(0)) continue;

        const listas = elegidos.map(x => _precioLista(x.it));
        const suma = listas.reduce((s, p) => s + _cPromo(p), 0);
        const ahorro = (suma - _cPromo(PromosRegla.precioPromo(promo, listas))) / 100;
        if (ahorro > 0.004 && (!mejor || ahorro > mejor.ahorro)) {
            mejor = { promo, indices: elegidos.map(x => x.idx), ahorro };
        }
    }
    return mejor;
}

function _precioLista(it) {
    return parseFloat(it.precio_base != null ? it.precio_base : it.precio) || 0;
}

/** El carrito con esos productos sueltos convertidos en la promo. */
function convertirEnPromo(lista, sugerencia) {
    const quitar = new Set(sugerencia.indices);
    const elegidos = sugerencia.indices.map(i => lista[i]).map(it => ({
        id: it.id, nombre: it.nombre, precio: _precioLista(it),
        modificadores: it.modificadores || [], nota: it.nota || '',
    }));
    const nuevo = lista.filter((_, i) => !quitar.has(i));
    nuevo.push(armarRenglonPromo(sugerencia.promo, elegidos));
    return nuevo;
}

// ── Textos para la pantalla ─────────────────────────────────────────────────

const _DIAS_PROMO = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

function textoCalendario(calendario) {
    const c = PromosRegla.leerCalendario(calendario);
    if (!c) return 'Siempre';
    const partes = [];
    if (c.dias) partes.push(c.dias.map(d => _DIAS_PROMO[d]).join(', '));
    if (c.desde) partes.push(c.desde + '–' + c.hasta);
    if (c.fecha_inicio && c.fecha_fin) partes.push('del ' + c.fecha_inicio + ' al ' + c.fecha_fin);
    else if (c.fecha_inicio) partes.push('desde el ' + c.fecha_inicio);
    else if (c.fecha_fin) partes.push('hasta el ' + c.fecha_fin);
    return partes.join(' · ') || 'Siempre';
}

function nombreDeHueco(hueco) {
    if (hueco.product_ids && hueco.product_ids.length) {
        const nombres = hueco.product_ids.map(id => {
            const pr = (typeof productosGlobales !== 'undefined' ? productosGlobales : []).find(p => p.id === id);
            return pr ? pr.nombre : ('producto ' + id);
        });
        return nombres.length > 3 ? nombres.slice(0, 3).join(', ') + '…' : nombres.join(' o ');
    }
    const cats = typeof clasificaciones !== 'undefined' ? clasificaciones : [];
    const cat = (cats || []).find(c => c.id === hueco.category_id);
    return cat ? cat.nombre : 'la categoría';
}

function textoHuecos(promo) {
    return (promo.huecos || []).map(h => h.quantity + ' de ' + nombreDeHueco(h)).join(' + ');
}

function textoCobro(promo) {
    if (promo.tipo === 'regalar_mas_barato') return 'Lleva ' + promo.lleva + ', paga ' + promo.paga;
    return '$' + (parseFloat(promo.price) || 0).toFixed(2);
}

// ════════════════════════════════════════════════════════════════════════════
// LA HOJA DE ELECCIÓN — "Elige 2 tacos · 1 de 2"
// ════════════════════════════════════════════════════════════════════════════

let _eleccionPromo = null;   // { promo, elegidos: [{ hueco, id, nombre, precio, modificadores }], alListo }

/** Abre la hoja. `alListo(renglon)` recibe el renglón de carrito ya armado. */
function abrirEleccionPromo(promo, alListo) {
    _eleccionPromo = { promo, elegidos: [], alListo };
    const titulo = document.getElementById('promo-eleccion-titulo');
    if (titulo) titulo.textContent = promo.name;
    _pintarEleccionPromo();
    document.getElementById('modal-promo-eleccion').classList.remove('hidden');
}

function cerrarEleccionPromo() {
    document.getElementById('modal-promo-eleccion').classList.add('hidden');
    _eleccionPromo = null;
}

/** El primer hueco que todavía no está lleno, o -1 si ya están todos. */
function _huecoPendientePromo() {
    const e = _eleccionPromo;
    if (!e) return -1;
    return e.promo.huecos.findIndex((h, i) => e.elegidos.filter(x => x.hueco === i).length < h.quantity);
}

function _pintarEleccionPromo() {
    const e = _eleccionPromo;
    if (!e) return;
    const promo = e.promo;
    const h = _huecoPendientePromo();

    const paso = document.getElementById('promo-eleccion-paso');
    if (paso) {
        paso.textContent = h === -1
            ? 'Listo: ' + promo.lleva + ' de ' + promo.lleva
            : 'Elige ' + promo.huecos[h].quantity + ' de ' + nombreDeHueco(promo.huecos[h]) +
              ' · ' + (e.elegidos.length + 1) + ' de ' + promo.lleva;
    }

    const lista = document.getElementById('promo-eleccion-elegidos');
    if (lista) {
        lista.innerHTML = e.elegidos.map((x, i) => {
            const extras = resumenModificadores(x.modificadores);
            return '<div class="promo-elegido">' +
                '<span>' + esc(x.nombre) + (extras ? ' <em>' + esc(extras) + '</em>' : '') + '</span>' +
                '<button type="button" title="Quitar" onclick="quitarElegidoPromo(' + i + ')">×</button>' +
            '</div>';
        }).join('');
    }

    const grid = document.getElementById('promo-eleccion-grid');
    if (grid) {
        grid.innerHTML = h === -1 ? '' : productosDelHueco(promo.huecos[h]).map(pr =>
            '<button type="button" class="promo-eleccion-prod" data-id="' + pr.id + '" onclick="elegirProductoPromo(' + pr.id + ')">' +
                '<span>' + renderIcono(pr.emoji || 'svg:package', 22) + '</span>' +
                '<strong>' + esc(pr.nombre) + '</strong>' +
                '<small>$' + (parseFloat(pr.precio) || 0).toFixed(2) + '</small>' +
            '</button>'
        ).join('');
    }

    const btn = document.getElementById('promo-eleccion-listo');
    const resumen = document.getElementById('promo-eleccion-resumen');
    const completa = h === -1 && PromosRegla.eleccionCabe(promo.huecos, e.elegidos.map(x => ({ id: x.id, category_id: _categoriaDeProducto(x.id) })));
    if (btn) { btn.disabled = !completa; btn.classList.toggle('disabled', !completa); }
    if (resumen) {
        if (completa) {
            const r = armarRenglonPromo(promo, e.elegidos, 'vista');
            resumen.innerHTML = 'Cobras <strong>$' + r.precio.toFixed(2) + '</strong>' +
                (r.ahorro > 0 ? ' · el cliente ahorra $' + r.ahorro.toFixed(2) : '');
        } else {
            resumen.textContent = '';
        }
    }
}

function elegirProductoPromo(id) {
    const e = _eleccionPromo;
    if (!e) return;
    const h = _huecoPendientePromo();
    if (h === -1) return;
    const producto = productosGlobales.find(p => p.id === id);
    if (!producto) return;
    // Los extras (§32) se eligen igual que en un producto suelto, y se COBRAN:
    // el taco de la promo es gratis, su queso extra no.
    abrirModalModificadores(producto, (modificadores) => {
        if (!_eleccionPromo) return;
        _eleccionPromo.elegidos.push({
            hueco: h, id: producto.id, nombre: producto.nombre,
            precio: parseFloat(producto.precio) || 0, modificadores: modificadores || [],
        });
        _pintarEleccionPromo();
    });
}

function quitarElegidoPromo(indice) {
    if (!_eleccionPromo) return;
    _eleccionPromo.elegidos.splice(indice, 1);
    _pintarEleccionPromo();
}

function confirmarEleccionPromo() {
    const e = _eleccionPromo;
    if (!e || _huecoPendientePromo() !== -1) return;
    const renglon = armarRenglonPromo(e.promo, e.elegidos);
    const alListo = e.alListo;
    cerrarEleccionPromo();
    if (typeof alListo === 'function') alListo(renglon);
}

// ════════════════════════════════════════════════════════════════════════════
// VENTA DE MOSTRADOR: los botones de promo y la sugerencia
// ════════════════════════════════════════════════════════════════════════════

let _relojPromosVenta = null;

/** Pinta los botones de promo arriba de los productos (solo las activas). */
function renderizarPromosVenta() {
    const cont = document.getElementById('promos-venta');
    if (!cont) return;
    const activas = promosActivasAhora();
    if (!activas.length) {
        cont.innerHTML = '';
        cont.classList.add('hidden');
    } else {
        cont.classList.remove('hidden');
        cont.innerHTML = activas.map(p =>
            '<button type="button" class="promo-card" data-promo-id="' + p.id + '" onclick="venderPromo(' + p.id + ')">' +
                '<span class="promo-card-icono">🎁</span>' +
                '<span class="promo-card-nombre">' + esc(p.name) + '</span>' +
                '<small>' + esc(textoHuecos(p)) + ' · ' + esc(textoCobro(p)) + '</small>' +
            '</button>'
        ).join('');
    }
    // A la hora en que la promo termina, el botón tiene que irse solo.
    if (!_relojPromosVenta) {
        _relojPromosVenta = setInterval(() => {
            const vista = document.getElementById('view-nueva-venta');
            if (vista && vista.classList.contains('active')) { renderizarPromosVenta(); renderizarCarrito(); }
        }, 60000);
    }
}

function venderPromo(id) {
    const promo = promosNegocio.find(p => p.id === id);
    if (!promo) return;
    abrirEleccionPromo(promo, (renglon) => {
        carrito.push(renglon);
        renderizarCarrito();
    });
}

/** Pinta (o esconde) el aviso "¿Convertir a 2x1?" bajo el carrito. */
function pintarSugerenciaPromo() {
    const el = document.getElementById('promo-sugerencia');
    if (!el) return;
    const s = sugerirPromo(carrito);
    if (!s) { el.classList.add('hidden'); el.innerHTML = ''; return; }
    el.classList.remove('hidden');
    el.innerHTML = '<span>¿Convertir a <strong>' + esc(s.promo.name) + '</strong>? Ahorra $' + s.ahorro.toFixed(2) + '</span>' +
        '<button type="button" onclick="aplicarSugerenciaPromo()">Convertir</button>';
}

function aplicarSugerenciaPromo() {
    const s = sugerirPromo(carrito);
    if (!s) return;
    carrito = convertirEnPromo(carrito, s);
    renderizarCarrito();
}

// ════════════════════════════════════════════════════════════════════════════
// EL EDITOR DE CALENDARIO (promos y descuentos lo comparten)
// ════════════════════════════════════════════════════════════════════════════
//
// El marcado vive en index.html con un prefijo (`pcal-` para promos, `dcal-`
// para descuentos): `-siempre` / `-con` (radios), `-dia-0` … `-dia-6`,
// `-desde`, `-hasta`, `-inicio`, `-fin` y el contenedor `-detalle`.

function pintarEditorCalendario(pref, calendario) {
    const c = PromosRegla.leerCalendario(calendario);
    const $ = (s) => document.getElementById(pref + s);
    if ($('-siempre')) $('-siempre').checked = !c;
    if ($('-con')) $('-con').checked = Boolean(c);
    for (let d = 0; d < 7; d++) {
        const cb = $('-dia-' + d);
        if (cb) cb.checked = !c || !c.dias || c.dias.includes(d);
    }
    if ($('-desde')) $('-desde').value = (c && c.desde) || '';
    if ($('-hasta')) $('-hasta').value = (c && c.hasta) || '';
    if ($('-inicio')) $('-inicio').value = (c && c.fecha_inicio) || '';
    if ($('-fin')) $('-fin').value = (c && c.fecha_fin) || '';
    alternarEditorCalendario(pref);
}

function alternarEditorCalendario(pref) {
    const det = document.getElementById(pref + '-detalle');
    const con = document.getElementById(pref + '-con');
    if (det) det.style.display = con && con.checked ? 'flex' : 'none';
}

/** `{ ok, calendario }` o `{ ok: false, error }`, con la validación de la PARTE 1. */
function leerEditorCalendario(pref) {
    const $ = (s) => document.getElementById(pref + s);
    if (!$('-con') || !$('-con').checked) return { ok: true, calendario: null };
    const dias = [];
    for (let d = 0; d < 7; d++) if ($('-dia-' + d) && $('-dia-' + d).checked) dias.push(d);
    const bruto = { dias };
    if ($('-desde').value || $('-hasta').value) { bruto.desde = $('-desde').value; bruto.hasta = $('-hasta').value; }
    if ($('-inicio').value) bruto.fecha_inicio = $('-inicio').value;
    if ($('-fin').value) bruto.fecha_fin = $('-fin').value;
    return PromosRegla.normalizarCalendario(bruto);
}
