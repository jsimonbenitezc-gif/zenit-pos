// ============================================================================
// explorar/lib/sembrar.js — UN NEGOCIO REALISTA, LISTO PARA EXPLORAR
//
// Una instalación nueva trae 4 productos de ejemplo y nada más: ni mesas, ni
// insumos con costo, ni clientes, ni plan premium. Explorar sobre eso descubre
// sobre todo pantallas vacías, que es lo que menos falla.
//
// Aquí se deja un negocio con volumen y con DECIMALES INCÓMODOS a propósito
// ($24.50, recetas en gramos sobre insumos en kilos), que es donde salen los
// redondeos — el mismo criterio que el banco del BLOQUE 15 (CLAUDE.md §38.4).
//
// ⚠️ ESTO ES SIEMBRA, Y ES LA ÚNICA PARTE DEL ARNÉS QUE ESCRIBE POR DENTRO.
// El resto se hace a clics, por la razón del §46.2: los cuatro fantasmas del
// desktop eran funciones que existían y no estaban cableadas a ningún botón.
// Aquí se usa `window.api` porque es preparar el escenario, no probarlo — y
// porque ponerse premium NO tiene pantalla en modo local (el plan lo trae el
// backend). Si algún día alguien quiere probar el ALTA de un producto, que la
// haga a clics: eso es exploración, no siembra.
// ============================================================================

const CATALOGO = {
    categorias: [
        { nombre: 'Tacos', emoji: '🌮' },
        { nombre: 'Postres', emoji: '🍮' },
    ],
    // Precios con centavos y no redondos: es donde aparecen los descuadres.
    productos: [
        { nombre: 'Taco al pastor',   precio: 24.50, stock: null, emoji: '🌮', categoria: 'Tacos' },
        { nombre: 'Taco de suadero',  precio: 26.00, stock: null, emoji: '🌮', categoria: 'Tacos' },
        { nombre: 'Quesadilla',       precio: 42.50, stock: null, emoji: '🫓', categoria: 'Tacos' },
        { nombre: 'Agua de horchata', precio: 28.00, stock: 40,   emoji: '🥛', categoria: 'Bebidas' },
        { nombre: 'Flan casero',      precio: 45.00, stock: 12,   emoji: '🍮', categoria: 'Postres' },
    ],
    // Recetas en GRAMOS sobre insumos en KILOS: la conversión es justo donde
    // vive el hueco abierto del §45, así que conviene tenerla en el escenario.
    insumos: [
        { nombre: 'Tortilla',        unidad: 'pzas', stock_actual: 900, stock_minimo: 200, costo_unitario: 1.20 },
        { nombre: 'Carne al pastor', unidad: 'kg',   stock_actual: 12,  stock_minimo: 3,   costo_unitario: 182.00 },
        { nombre: 'Queso',           unidad: 'kg',   stock_actual: 6,   stock_minimo: 2,   costo_unitario: 148.50 },
        { nombre: 'Horchata',        unidad: 'l',    stock_actual: 25,  stock_minimo: 8,   costo_unitario: 21.00 },
        // Sin costo A PROPÓSITO: la vista de Rentabilidad tiene que denunciarlo
        // por su nombre en vez de inventarse un margen (§33, regla 2).
        { nombre: 'Cebolla',         unidad: 'kg',   stock_actual: 4,   stock_minimo: 1,   costo_unitario: 0 },
    ],
    recetas: {
        'Taco al pastor':  [{ insumo: 'Tortilla', cantidad: 2, unidad: 'pzas' },
                            { insumo: 'Carne al pastor', cantidad: 80, unidad: 'g' },
                            { insumo: 'Cebolla', cantidad: 15, unidad: 'g' }],
        'Taco de suadero': [{ insumo: 'Tortilla', cantidad: 2, unidad: 'pzas' },
                            { insumo: 'Carne al pastor', cantidad: 85, unidad: 'g' }],
        'Quesadilla':      [{ insumo: 'Tortilla', cantidad: 1, unidad: 'pzas' },
                            { insumo: 'Queso', cantidad: 60, unidad: 'g' }],
        // "Agua de horchata" y "Flan casero" se quedan SIN receta a propósito:
        // un producto sin receta debe salir con costo NULL, nunca con 0 (§33).
    },
    mesas: [
        { nombre: 'Mesa 1', zona: 'Interior', capacidad: 4 },
        { nombre: 'Mesa 2', zona: 'Interior', capacidad: 4 },
        { nombre: 'Mesa 3', zona: 'Interior', capacidad: 2 },
        { nombre: 'Terraza 1', zona: 'Terraza', capacidad: 6 },
        { nombre: 'Terraza 2', zona: 'Terraza', capacidad: 6 },
        { nombre: 'Barra', zona: 'Barra', capacidad: 3 },
    ],
    clientes: [
        { nombre: 'Doña Carmen',   telefono: '5512345678', direccion: 'Av. Hidalgo 24, int. 3' },
        { nombre: 'Luis Ramírez',  telefono: '55 9876-5432', direccion: 'Calle Morelos 118' },
        { nombre: 'Oficina Zenit', telefono: '5555000111', direccion: 'Reforma 900, piso 4' },
    ],
};

/**
 * Deja el escenario listo. Devuelve la lista de lo que hizo y de lo que falló:
 * un sembrado a medias tiene que DECIRLO, o la exploración achacaría a la app
 * lo que en realidad no se llegó a crear.
 */
async function sembrar(ventana, { nivel = 'completo' } = {}) {
    const hecho = [];
    const fallos = [];

    const paso = async (que, fn) => {
        try {
            const r = await fn();
            hecho.push(que + (r ? ' (' + r + ')' : ''));
        } catch (e) {
            fallos.push(que + ': ' + String(e.message).split('\n')[0]);
        }
    };

    if (nivel === 'ninguno') return { hecho: ['(sin sembrar: instalación recién abierta)'], fallos };

    // ── Plan premium ────────────────────────────────────────────────────────
    // Sin esto, Inventario, Ofertas y Rentabilidad salen bloqueadas y tres de
    // las once vistas no se pueden explorar. No hay pantalla para activarlo en
    // modo local: el plan lo trae el backend (§8).
    await paso('plan premium (30 días)', async () => {
        const vence = new Date(Date.now() + 30 * 86400000).toISOString();
        await ventana.evaluate(async (v) => {
            await window.api.guardarAjuste('plan', 'premium');
            await window.api.guardarAjuste('plan_expires_at', v);
        }, vence);
    });

    await paso('nombre del negocio', () => ventana.evaluate(async () => {
        await window.api.guardarAjuste('nombre_negocio', 'Taquería El Zenit');
        await window.api.guardarAjuste('currency_symbol', '$');
    }));

    if (nivel === 'minimo') {
        await ventana.reload();
        return { hecho, fallos };
    }

    // ── Impuesto y propinas ENCENDIDOS ──────────────────────────────────────
    // Nacen apagados (§29, §30) y con ellos apagados no se ejercita ni el
    // desglose, ni la propina en el cajón, ni el "total pagado" del ticket —
    // que es media docena de las reglas de dinero del sistema. Se encienden en
    // el escenario y quien explore puede apagarlos desde Ajustes, que también
    // es un camino que conviene recorrer.
    await paso('impuesto IVA 16% incluido', () => ventana.evaluate(async () => {
        await window.api.guardarAjuste('tax_enabled', 'true');
        await window.api.guardarAjuste('tax_rate', '16');
        await window.api.guardarAjuste('tax_included', 'true');
        await window.api.guardarAjuste('tax_name', 'IVA');
    }));

    await paso('propinas activas (10/15/20 %)', () => ventana.evaluate(async () => {
        await window.api.guardarAjuste('propinas_activas', 'true');
        await window.api.guardarAjuste('propina_sugerencias', JSON.stringify([10, 15, 20]));
    }));

    // ── Catálogo ────────────────────────────────────────────────────────────
    await paso('categorías', async () => {
        const n = await ventana.evaluate(async (cats) => {
            for (const c of cats) await window.api.agregarClasificacion({ nombre: c.nombre, emoji: c.emoji, imagen: null });
            const todas = await window.api.obtenerClasificacionesRaw();
            return todas.length;
        }, CATALOGO.categorias);
        return n + ' en total';
    });

    await paso('productos', async () => {
        const n = await ventana.evaluate(async (cat) => {
            const cats = await window.api.obtenerClasificacionesRaw();
            const id = (nombre) => (cats.find((c) => c.nombre === nombre) || {}).id || null;
            for (const p of cat.productos) {
                await window.api.agregarProducto({
                    nombre: p.nombre, descripcion: '', precio: p.precio, stock: p.stock,
                    clasificacion_id: id(p.categoria), emoji: p.emoji, imagen: null,
                });
            }
            const grupos = await window.api.obtenerProductosAgrupados();
            return grupos.reduce((s, g) => s + g.productos.length, 0);
        }, CATALOGO);
        return n + ' en el menú';
    });

    // ── Inventario con costos ───────────────────────────────────────────────
    await paso('insumos con costo', async () => {
        const n = await ventana.evaluate(async (cat) => {
            for (const i of cat.insumos) await window.api.agregarInsumo(i);
            return (await window.api.obtenerInsumos()).length;
        }, CATALOGO);
        return n;
    });

    await paso('recetas', async () => {
        const n = await ventana.evaluate(async (cat) => {
            const insumos = await window.api.obtenerInsumos();
            const grupos = await window.api.obtenerProductosAgrupados();
            const productos = grupos.reduce((s, g) => s.concat(g.productos), []);
            let puestas = 0;
            for (const [nombreProd, items] of Object.entries(cat.recetas)) {
                const prod = productos.find((p) => p.nombre === nombreProd);
                if (!prod) continue;
                const filas = items.map((it) => {
                    const ins = insumos.find((x) => x.nombre === it.insumo);
                    return ins ? { tipo: 'insumo', referencia_id: ins.id, cantidad: it.cantidad, unidad_receta: it.unidad } : null;
                }).filter(Boolean);
                if (filas.length) { await window.api.guardarRecetaProducto(prod.id, filas); puestas++; }
            }
            return puestas;
        }, CATALOGO);
        return n + ' productos con receta';
    });

    // ── Sala y clientes ─────────────────────────────────────────────────────
    await paso('mesas', async () => {
        const n = await ventana.evaluate(async (cat) => {
            for (const m of cat.mesas) await window.api.crearMesa(m.nombre, m.zona, m.capacidad, null);
            return (await window.api.obtenerMesas()).length;
        }, CATALOGO);
        return n;
    });

    await paso('clientes', async () => {
        const n = await ventana.evaluate(async (cat) => {
            for (const c of cat.clientes) await window.api.crearCliente(c);
            return (await window.api.obtenerClientes()).length;
        }, CATALOGO);
        return n;
    });

    // El renderer cachea ajustes y catálogo al arrancar; sin recargar seguiría
    // mostrando el negocio vacío de antes de sembrar.
    await ventana.reload();

    return { hecho, fallos };
}

module.exports = { sembrar, CATALOGO };
