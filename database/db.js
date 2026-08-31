// ============================================
// CONFIGURACIÓN DE BASE DE DATOS SQLite
// ============================================

const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const { app } = require('electron');
const fs = require('fs');

const userDataPath = app.getPath('userData');
const dbPath = path.join(userDataPath, 'ventas.db');

if (!fs.existsSync(userDataPath)) {
    fs.mkdirSync(userDataPath, { recursive: true });
}

const db = new sqlite3.Database(dbPath, (err) => {
    if (err) console.error('❌ Error DB:', err);
    else {
        console.log('✅ Base de datos conectada');
        inicializarTablas();
        crearDatosEjemplo();
    }
});

// Wrappers basados en Promesas para poder encadenar operaciones
// dentro de transacciones sin perder el orden de ejecución.
function runAsync(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.run(sql, params, function(err) {
            if (err) return reject(err);
            resolve(this);
        });
    });
}

function getAsync(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.get(sql, params, (err, row) => {
            if (err) return reject(err);
            resolve(row);
        });
    });
}

function allAsync(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.all(sql, params, (err, rows) => {
            if (err) return reject(err);
            resolve(rows);
        });
    });
}

// ============================================
// TABLAS Y ESTRUCTURA
// ============================================
function inicializarTablas() {
    
    // 1. PRODUCTOS
    db.run(`CREATE TABLE IF NOT EXISTS productos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nombre TEXT NOT NULL,
        descripcion TEXT,
        precio REAL NOT NULL,
        stock INTEGER DEFAULT 0,
        clasificacion_id INTEGER,
        emoji TEXT, 
        imagen TEXT,
        activo INTEGER DEFAULT 1,
        fecha_creacion DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // 2. CLASIFICACIONES (Categorías)
    db.run(`CREATE TABLE IF NOT EXISTS clasificaciones (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nombre TEXT NOT NULL,
        emoji TEXT DEFAULT '📦',
        imagen TEXT,
        orden INTEGER DEFAULT 0,
        activa INTEGER DEFAULT 1
    )`);

    // 3. CLIENTES
   db.run(`CREATE TABLE IF NOT EXISTS clientes (
        id INTEGER PRIMARY KEY AUTOINCREMENT, 
        telefono TEXT UNIQUE NOT NULL, 
        nombre TEXT, 
        direccion TEXT, 
        notas TEXT, 
        fecha_registro DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

// 4. AJUSTES DEL SISTEMA
    db.run(`CREATE TABLE IF NOT EXISTS ajustes (
        clave TEXT PRIMARY KEY,
        valor TEXT
    )`);

    // 5. PEDIDOS (Cabecera de la venta)
    db.run(`CREATE TABLE IF NOT EXISTS pedidos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        cliente_id INTEGER,
        total REAL NOT NULL,
        estado TEXT DEFAULT 'pendiente',
        metodo_pago TEXT,
        tipo_pedido TEXT DEFAULT 'comer',
        referencia TEXT,
        direccion_domicilio TEXT,
        link_maps TEXT,
        notas_generales TEXT,
        info_cliente_temp TEXT,
        cajero TEXT,
        pendiente_sync INTEGER DEFAULT 0,
        client_uuid TEXT,
        descuento_monto REAL DEFAULT 0,
        fecha_pedido DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (cliente_id) REFERENCES clientes(id)
    )`);

    // 6. PEDIDO ITEMS (Detalle de la venta - AHORA CON NOTAS INDIVIDUALES)
    db.run(`CREATE TABLE IF NOT EXISTS pedido_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT, 
        pedido_id INTEGER, 
        producto_id INTEGER, 
        cantidad INTEGER NOT NULL, 
        precio_unitario REAL NOT NULL, 
        subtotal REAL NOT NULL,
        nota_item TEXT, 
        FOREIGN KEY (pedido_id) REFERENCES pedidos(id), 
        FOREIGN KEY (producto_id) REFERENCES productos(id)
    )`);

    // 7. PROMOCIONES Y DESCUENTOS (Nueva)
    db.run(`CREATE TABLE IF NOT EXISTS promociones (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nombre TEXT NOT NULL,       -- Ej: "Descuento Empleado"
        tipo TEXT DEFAULT 'porcentaje', -- 'porcentaje' o 'monto_fijo'
        valor REAL NOT NULL,        -- Ej: 10 (para 10%) o 50 (para $50 pesos)
        activa INTEGER DEFAULT 1
    )`);

    // 8. MERMAS (Nueva)
    db.run(`CREATE TABLE IF NOT EXISTS mermas (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        producto_id INTEGER,
        cantidad INTEGER NOT NULL,
        motivo TEXT,                -- Ej: "Caducidad", "Accidente", "Calidad"
        usuario_responsable TEXT,
        fecha DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (producto_id) REFERENCES productos(id)
    )`);

// 9. INSUMOS (Materias primas)
    db.run(`CREATE TABLE IF NOT EXISTS insumos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nombre TEXT NOT NULL,
        unidad TEXT NOT NULL DEFAULT 'kg',
        stock_actual REAL DEFAULT 0,
        stock_minimo REAL DEFAULT 0,
        activo INTEGER DEFAULT 1,
        tipo TEXT DEFAULT 'ingrediente',
        contenido_cantidad REAL,
        contenido_unidad TEXT
    )`);

    // 10. PREPARACIONES (Mezclas o concentrados hechos en cocina)
    db.run(`CREATE TABLE IF NOT EXISTS preparaciones (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nombre TEXT NOT NULL,
        descripcion TEXT,
        activo INTEGER DEFAULT 1
    )`);

    // 11. ITEMS DE PREPARACIÓN (Insumos que componen una preparación)
    db.run(`CREATE TABLE IF NOT EXISTS preparacion_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        preparacion_id INTEGER NOT NULL,
        insumo_id INTEGER NOT NULL,
        cantidad REAL NOT NULL,
        unidad_receta TEXT,
        FOREIGN KEY (preparacion_id) REFERENCES preparaciones(id),
        FOREIGN KEY (insumo_id) REFERENCES insumos(id)
    )`);

    // 12. RECETAS (Qué insumos/preparaciones usa cada producto del menú)
    db.run(`CREATE TABLE IF NOT EXISTS receta_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        producto_id INTEGER NOT NULL,
        tipo TEXT NOT NULL,
        referencia_id INTEGER NOT NULL,
        cantidad REAL NOT NULL,
        FOREIGN KEY (producto_id) REFERENCES productos(id)
    )`);

// 13. ENTRADAS DE INSUMOS (registro de abastecimiento)
    db.run(`CREATE TABLE IF NOT EXISTS entradas_insumos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        insumo_id INTEGER NOT NULL,
        cantidad REAL NOT NULL,
        notas TEXT,
        fecha DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (insumo_id) REFERENCES insumos(id)
    )`);

// 14. COMBOS (Paquetes con precio especial)
    db.run(`CREATE TABLE IF NOT EXISTS combos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nombre TEXT NOT NULL,
        descripcion TEXT,
        precio_especial REAL NOT NULL,
        activo INTEGER DEFAULT 1
    )`);

    // 15. ITEMS DE COMBO
    db.run(`CREATE TABLE IF NOT EXISTS combo_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        combo_id INTEGER NOT NULL,
        producto_id INTEGER NOT NULL,
        cantidad INTEGER DEFAULT 1,
        FOREIGN KEY (combo_id) REFERENCES combos(id),
        FOREIGN KEY (producto_id) REFERENCES productos(id)
    )`);
    
  // 9. MIGRACIÓN AUTOMÁTICA: 
    const columnasNuevas = [
        "ALTER TABLE pedidos ADD COLUMN tipo_pedido TEXT DEFAULT 'comer'",
        "ALTER TABLE pedidos ADD COLUMN referencia TEXT",
        "ALTER TABLE pedidos ADD COLUMN direccion_domicilio TEXT",
        "ALTER TABLE pedidos ADD COLUMN link_maps TEXT"
    ];

// Migración: agregar campo para info de cliente temporal
    db.run("ALTER TABLE pedidos ADD COLUMN info_cliente_temp TEXT", () => {});
    db.run("ALTER TABLE pedidos ADD COLUMN cajero TEXT", () => {});
    db.run("ALTER TABLE pedidos ADD COLUMN pendiente_sync INTEGER DEFAULT 0", () => {});
    db.run("ALTER TABLE pedidos ADD COLUMN client_uuid TEXT", () => {});
    db.run("ALTER TABLE pedidos ADD COLUMN descuento_monto REAL DEFAULT 0", () => {});
    // Autorización del descuento y canje de puntos (Bloque 1, seguridad de dinero):
    // el backend exige que un descuento venga respaldado por un Discount configurado
    // (descuento_id) o por PIN. Guardamos el id para que la venta encolada offline
    // pueda autorizarse al subir SIN tener que almacenar el PIN en claro.
    db.run("ALTER TABLE pedidos ADD COLUMN descuento_id INTEGER", () => {});
    db.run("ALTER TABLE pedidos ADD COLUMN descuento_puntos_monto REAL DEFAULT 0", () => {});
    db.run("ALTER TABLE pedidos ADD COLUMN puntos_usados INTEGER DEFAULT 0", () => {});
    db.run("ALTER TABLE insumos ADD COLUMN tipo TEXT DEFAULT 'ingrediente'", () => {});
    db.run("ALTER TABLE insumos ADD COLUMN contenido_cantidad REAL", () => {});
    db.run("ALTER TABLE insumos ADD COLUMN contenido_unidad TEXT", () => {});
    db.run("ALTER TABLE receta_items ADD COLUMN unidad_receta TEXT", () => {});
    db.run("ALTER TABLE preparacion_items ADD COLUMN unidad_receta TEXT", () => {});
    db.run("ALTER TABLE mesas ADD COLUMN branch_id INTEGER", () => {});
    db.run("ALTER TABLE pedidos ADD COLUMN mesa_id INTEGER", () => {});
    db.run("ALTER TABLE pedidos ADD COLUMN comensales INTEGER DEFAULT 0", () => {});
    // Impuesto (BLOQUE 8). Igual que en el backend: total = subtotal + impuesto.
    // `tasa_impuesto` e `impuesto_incluido` quedan CONGELADOS con lo que tenía el
    // equipo al cobrar, para que la venta que sube tarde conserve su desglose.
    db.run("ALTER TABLE pedidos ADD COLUMN subtotal REAL", () => {});
    db.run("ALTER TABLE pedidos ADD COLUMN impuesto REAL DEFAULT 0", () => {});
    db.run("ALTER TABLE pedidos ADD COLUMN tasa_impuesto REAL DEFAULT 0", () => {});
    db.run("ALTER TABLE pedidos ADD COLUMN impuesto_incluido INTEGER DEFAULT 0", () => {});
    // Propina (BLOQUE 9). NO entra en `total`: es dinero del cliente para el
    // empleado que solo pasa por la caja. Lo que se entregó fue total + propina.
    db.run("ALTER TABLE pedidos ADD COLUMN propina REAL DEFAULT 0", () => {});
    db.run("ALTER TABLE pedidos ADD COLUMN propina_metodo TEXT", () => {});

    // Pagos divididos (BLOQUE 10). Los pagos REPARTEN el total del pedido, no lo
    // aumentan: SUM(monto) = pedidos.total. Un pedido SIN filas aquí es un pedido
    // de un solo método (todos los anteriores al bloque) y su `metodo_pago` sigue
    // siendo la verdad — por eso no hay nada que migrar.
    // ⚠️ `fecha` sin DEFAULT CURRENT_TIMESTAMP: en SQLite eso es UTC y esta base
    // compara todo en hora local (CLAUDE.md §26). Se escribe con datetime('now','localtime').
    db.run(`CREATE TABLE IF NOT EXISTS pagos_pedido (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        pedido_id INTEGER NOT NULL,
        metodo TEXT NOT NULL,
        monto REAL NOT NULL,
        propina REAL DEFAULT 0,
        item_ids TEXT,
        fecha DATETIME,
        FOREIGN KEY (pedido_id) REFERENCES pedidos(id)
    )`);
    db.run('CREATE INDEX IF NOT EXISTS idx_pagos_pedido ON pagos_pedido(pedido_id)', () => {});

    // Modificadores de producto (BLOQUE 11). Espejo local de la biblioteca del
    // negocio, para poder armar un carrito con extras SIN internet — igual que
    // el impuesto (§29) y las propinas (§30).
    //
    // ⚠️ Los ids son los del BACKEND, no autoincrementales: el catálogo se
    // reemplaza entero al sincronizar y los renglones de una venta encolada
    // guardan el `option_id` real, que es lo que el backend necesita para
    // resolverla al subir.
    db.run(`CREATE TABLE IF NOT EXISTS modificador_grupos (
        id INTEGER PRIMARY KEY,
        nombre TEXT NOT NULL,
        min_select INTEGER DEFAULT 0,
        max_select INTEGER,
        orden INTEGER DEFAULT 0
    )`);
    db.run(`CREATE TABLE IF NOT EXISTS modificador_opciones (
        id INTEGER PRIMARY KEY,
        grupo_id INTEGER NOT NULL,
        nombre TEXT NOT NULL,
        price_delta REAL DEFAULT 0,
        orden INTEGER DEFAULT 0
    )`);
    db.run(`CREATE TABLE IF NOT EXISTS producto_modificadores (
        producto_id INTEGER NOT NULL,
        grupo_id INTEGER NOT NULL,
        orden INTEGER DEFAULT 0,
        PRIMARY KEY (producto_id, grupo_id)
    )`);
    // Ajuste de receta de una opción. `cantidad` NEGATIVA devuelve al inventario
    // lo que la receta base descontó ("sin cebolla").
    db.run(`CREATE TABLE IF NOT EXISTS modificador_receta (
        id INTEGER PRIMARY KEY,
        opcion_id INTEGER NOT NULL,
        tipo TEXT NOT NULL,
        referencia_id INTEGER NOT NULL,
        cantidad REAL NOT NULL,
        unidad_receta TEXT
    )`);
    db.run('CREATE INDEX IF NOT EXISTS idx_mod_opciones ON modificador_opciones(grupo_id)', () => {});
    db.run('CREATE INDEX IF NOT EXISTS idx_mod_receta ON modificador_receta(opcion_id)', () => {});

    // Lo elegido en cada renglón, CONGELADO (JSON) + el precio del catálogo antes
    // de los extras. `precio_unitario` sigue siendo lo que se cobró por unidad,
    // así que todo lo que ya leía ese campo sigue igual.
    db.run("ALTER TABLE pedido_items ADD COLUMN modificadores TEXT", () => {});
    db.run("ALTER TABLE pedido_items ADD COLUMN precio_base REAL", () => {});

    // BLOQUE 12 — Costo por unidad del insumo. Sin este dato la rentabilidad
    // no existe: el costo de un platillo se DERIVA de su receta y de este
    // número. Hasta ahora solo se podía capturar desde el mobile.
    db.run("ALTER TABLE insumos ADD COLUMN costo_unitario REAL DEFAULT 0", () => {});

    // Rinde de la preparación: cuántas unidades produce UNA tanda de la receta.
    // Sin este dato el desktop descontaba la tanda completa por cada unidad
    // pedida (ver _fraccionDeTanda). Default 1 = el comportamiento de siempre.
    db.run("ALTER TABLE preparaciones ADD COLUMN rinde REAL DEFAULT 1", () => {});
    db.run("ALTER TABLE clientes ADD COLUMN puntos INTEGER DEFAULT 0", () => {});
    db.run("ALTER TABLE clientes ADD COLUMN en_fidelidad INTEGER DEFAULT 0", () => {});
    db.run("ALTER TABLE promociones ADD COLUMN requires_pin INTEGER DEFAULT 0", () => {});

    db.run(`CREATE TABLE IF NOT EXISTS log_descuentos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        fecha DATETIME DEFAULT CURRENT_TIMESTAMP,
        cajero TEXT,
        descuento_nombre TEXT,
        monto_descuento REAL,
        total_antes REAL
    )`, () => {});

    db.run(`CREATE TABLE IF NOT EXISTS salidas_insumos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        insumo_id INTEGER NOT NULL,
        cantidad REAL NOT NULL,
        motivo TEXT DEFAULT 'merma',
        notas TEXT,
        fecha DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (insumo_id) REFERENCES insumos(id)
    )`);

    columnasNuevas.forEach(sql => {
        db.run(sql, (err) => { /* Ignoramos error si la columna ya existe */ });
    });

    // MESAS
    db.run(`CREATE TABLE IF NOT EXISTS mesas (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nombre TEXT NOT NULL,
        zona TEXT DEFAULT 'General',
        capacidad INTEGER DEFAULT 4,
        activa INTEGER DEFAULT 1
    )`);

    // TURNOS — Corte de caja
    db.run(`CREATE TABLE IF NOT EXISTS turnos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        cajero_nombre TEXT NOT NULL,
        rol TEXT DEFAULT 'cajero',
        fondo_inicial REAL DEFAULT 0,
        apertura DATETIME DEFAULT CURRENT_TIMESTAMP,
        cierre DATETIME,
        total_efectivo REAL DEFAULT 0,
        total_tarjeta REAL DEFAULT 0,
        total_transferencia REAL DEFAULT 0,
        total_pedidos INTEGER DEFAULT 0,
        total_ventas REAL DEFAULT 0,
        efectivo_contado REAL DEFAULT 0,
        diferencia REAL DEFAULT 0,
        estado TEXT DEFAULT 'abierto',
        notas TEXT
    )`);

    // MOVIMIENTOS DE CAJA — Retiros, gastos y depósitos durante el turno (BLOQUE 7)
    // `fecha` NO lleva DEFAULT CURRENT_TIMESTAMP: en SQLite eso es UTC, y toda esta
    // base guarda y compara en hora LOCAL (ver CLAUDE.md §26). Se escribe siempre
    // con datetime('now','localtime').
    db.run(`CREATE TABLE IF NOT EXISTS movimientos_caja (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        turno_id INTEGER NOT NULL,
        tipo TEXT NOT NULL,
        monto REAL NOT NULL,
        motivo TEXT,
        empleado_nombre TEXT,
        anulado INTEGER DEFAULT 0,
        anulado_por_nombre TEXT,
        anulado_at DATETIME,
        motivo_anulacion TEXT,
        fecha DATETIME,
        FOREIGN KEY (turno_id) REFERENCES turnos(id)
    )`);
    db.run('CREATE INDEX IF NOT EXISTS idx_mov_caja_turno ON movimientos_caja(turno_id)', () => {});

    // Totales de movimientos congelados en el turno cerrado (mismo criterio que el
    // backend: el reporte de un turno viejo no cambia si después se anula algo).
    db.run('ALTER TABLE turnos ADD COLUMN total_depositos REAL DEFAULT 0', () => {});
    db.run('ALTER TABLE turnos ADD COLUMN total_retiros REAL DEFAULT 0', () => {});
    db.run('ALTER TABLE turnos ADD COLUMN total_gastos REAL DEFAULT 0', () => {});
    // Impuesto recaudado en el turno (BLOQUE 8). Congelado al cerrar, igual que
    // los movimientos: es la cifra que el dueño leyó en ese corte.
    db.run('ALTER TABLE turnos ADD COLUMN total_impuesto REAL DEFAULT 0', () => {});
    // Propinas del turno (BLOQUE 9). Se congelan al cerrar, igual que lo anterior.
    // NO están dentro de total_ventas: son dinero del cliente para el empleado.
    // Solo la de EFECTIVO entra al efectivo esperado (está en el cajón).
    db.run('ALTER TABLE turnos ADD COLUMN total_propinas REAL DEFAULT 0', () => {});
    db.run('ALTER TABLE turnos ADD COLUMN total_propinas_efectivo REAL DEFAULT 0', () => {});
    db.run('ALTER TABLE turnos ADD COLUMN total_propinas_tarjeta REAL DEFAULT 0', () => {});
    db.run('ALTER TABLE turnos ADD COLUMN total_propinas_transferencia REAL DEFAULT 0', () => {});

    // KDS — Dispositivos de confianza
    //
    // ⚠️ `fecha_conexion DATETIME DEFAULT CURRENT_TIMESTAMP` es un error heredado:
    // en SQLite eso es UTC y toda esta base compara en hora LOCAL (§26). Las
    // columnas nuevas de abajo se escriben siempre con datetime('now','localtime').
    db.run(`CREATE TABLE IF NOT EXISTS kds_trusted_devices (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ip TEXT NOT NULL,
        user_agent TEXT,
        nombre TEXT,
        confianza INTEGER DEFAULT 1,
        fecha_conexion DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // BLOQUE 13 — La identidad de una pantalla de cocina es un SECRETO, no su IP.
    //
    // La lista de IPs de arriba prometía un control que no daba: las IPs las
    // reparte el router y rotan, así que la tablet aprobada volvía a pedir
    // permiso al día siguiente y —peor— el celular de un cliente podía heredar
    // una IP ya aprobada y entrar sin que nadie se enterara. Tampoco quedaba
    // registro de QUIÉN autorizó el equipo.
    db.run('ALTER TABLE kds_trusted_devices ADD COLUMN secret_hash TEXT', () => {});
    db.run("ALTER TABLE kds_trusted_devices ADD COLUMN estado TEXT DEFAULT 'pendiente'", () => {});
    db.run('ALTER TABLE kds_trusted_devices ADD COLUMN aprobado_por_nombre TEXT', () => {});
    db.run('ALTER TABLE kds_trusted_devices ADD COLUMN aprobado_por_rol TEXT', () => {});
    db.run('ALTER TABLE kds_trusted_devices ADD COLUMN aprobado_en DATETIME', () => {});
    db.run('ALTER TABLE kds_trusted_devices ADD COLUMN revocado_por_nombre TEXT', () => {});
    db.run('ALTER TABLE kds_trusted_devices ADD COLUMN revocado_en DATETIME', () => {});
    db.run('ALTER TABLE kds_trusted_devices ADD COLUMN ultimo_acceso DATETIME', () => {});
    // Los registros viejos no tienen secreto, así que ya no pueden identificar a
    // nadie. Se marcan como 'legacy' —no como 'revocado', que implicaría que
    // alguien les quitó el permiso— y la lista explica que hay que volver a
    // emparejar esos equipos. Es una molestia de una sola vez.
    db.run("UPDATE kds_trusted_devices SET estado = 'legacy' WHERE secret_hash IS NULL AND (estado IS NULL OR estado != 'legacy')", () => {});
    db.run('CREATE INDEX IF NOT EXISTS idx_kds_secret ON kds_trusted_devices(secret_hash)', () => {});
}

function crearDatosEjemplo() {
    db.serialize(() => {
        db.get('SELECT COUNT(*) as total FROM clasificaciones', (err, row) => {
            if (!err && row.total === 0) {
                console.log('✨ Creando datos de ejemplo...');
                
                // Categorías
                const stmtCat = db.prepare('INSERT INTO clasificaciones (nombre, emoji) VALUES (?, ?)');
                stmtCat.run('Alimentos', '🍔'); 
                stmtCat.run('Bebidas', '🥤');  
                stmtCat.run('Extras', '🥓'); // Nueva categoría sugerida
                stmtCat.finalize();

                // Promociones ejemplo
                db.run("INSERT INTO promociones (nombre, tipo, valor) VALUES ('Descuento 10%', 'porcentaje', 10)");
                db.run("INSERT INTO promociones (nombre, tipo, valor) VALUES ('Cortesía $50', 'monto_fijo', 50)");

                // Productos
                setTimeout(() => {
                    const stmtProd = db.prepare('INSERT INTO productos (nombre, precio, stock, clasificacion_id, emoji, descripcion) VALUES (?, ?, ?, ?, ?, ?)');
                    stmtProd.run('Hamburguesa Clásica', 85.00, 50, 1, '🍔', 'Carne, queso, lechuga');
                    stmtProd.run('Pizza Pepperoni', 120.00, 20, 1, '🍕', '8 rebanadas');
                    stmtProd.run('Coca Cola', 25.00, 100, 2, '🥤', 'Lata 355ml');
                    stmtProd.run('Tocino Extra', 15.00, 50, 3, '🥓', 'Porción de 50g');
                    stmtProd.finalize();
                }, 1000);
            }
        });
    });
}

// ============================================
// FUNCIONES LÓGICAS (API)
// ============================================

// --- PRODUCTOS ---
function obtenerProductosAgrupados() {
    return new Promise((resolve, reject) => {
        db.all("SELECT * FROM clasificaciones WHERE activa = 1 ORDER BY orden ASC, id ASC", [], (err, cats) => {
            if (err) return reject(err);
            db.all("SELECT * FROM productos WHERE activo = 1", [], (err, prods) => {
                if (err) return reject(err);
                
                const resultado = cats.map(c => ({ ...c, productos: [] }));
                const sinCategoria = { id: null, nombre: 'Sin Categoría', emoji: '⚠️', productos: [] };

                prods.forEach(p => {
                    if (p.clasificacion_id) {
                        const cat = resultado.find(c => c.id === p.clasificacion_id);
                        cat ? cat.productos.push(p) : sinCategoria.productos.push(p);
                    } else {
                        sinCategoria.productos.push(p);
                    }
                });
                resultado.push(sinCategoria);
                resolve(resultado);
            });
        });
    });
}

function obtenerClasificacionesRaw(callback) { db.all("SELECT * FROM clasificaciones WHERE activa = 1", callback); }
function agregarClasificacion(d, cb) { db.run("INSERT INTO clasificaciones (nombre, emoji, imagen) VALUES (?, ?, ?)", [d.nombre, d.emoji, d.imagen], cb); }
function editarClasificacion(d, cb) { db.run("UPDATE clasificaciones SET nombre = ?, emoji = ?, imagen = ? WHERE id = ?", [d.nombre, d.emoji, d.imagen, d.id], cb); }
function eliminarClasificacion(id, cb) { 
    db.run("UPDATE clasificaciones SET activa = 0 WHERE id = ?", [id], (err) => {
        if(err) return cb(err);
        db.run("UPDATE productos SET clasificacion_id = NULL WHERE clasificacion_id = ?", [id], cb);
    }); 
}

function agregarProducto(p, cb) {
    db.run(`INSERT INTO productos (nombre, descripcion, precio, stock, clasificacion_id, emoji, imagen) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [p.nombre, p.descripcion, p.precio, p.stock, p.clasificacion_id, p.emoji, p.imagen], cb);
}
function actualizarProducto(id, p, cb) {
    db.run(`UPDATE productos SET nombre = ?, descripcion = ?, precio = ?, stock = ?, clasificacion_id = ?, emoji = ?, imagen = ? WHERE id = ?`,
        [p.nombre, p.descripcion, p.precio, p.stock, p.clasificacion_id, p.emoji, p.imagen, id], cb);
}
function eliminarProducto(id, cb) { db.run('UPDATE productos SET activo = 0 WHERE id = ?', [id], cb); }

// Convierte una cantidad de unidad_receta a la unidad nativa del insumo
const FACTORES_CONVERSION = {
    'g_kg':   0.001,    'kg_g':   1000,
    'ml_l':   0.001,    'l_ml':   1000,
    'ml_gal': 0.000264, 'gal_ml': 3785.41,
    'l_gal':  0.26417,  'gal_l':  3.78541,
};

function convertirUnidad(cantidad, unidadReceta, insumo) {
    if (!unidadReceta || unidadReceta === insumo.unidad) return cantidad;

    // 1. Equivalencia natural directa (g→kg, ml→l, gal→l, etc.)
    const claveNatural = `${unidadReceta}_${insumo.unidad}`;
    if (FACTORES_CONVERSION[claveNatural]) {
        return cantidad * FACTORES_CONVERSION[claveNatural];
    }

    // 2. Conversión a través de presentación (latas con kg definido)
    if (insumo.contenido_cantidad && insumo.contenido_unidad) {
        // Receta en la misma unidad de contenido (kg en latas-con-kg)
        if (unidadReceta === insumo.contenido_unidad) {
            return cantidad / insumo.contenido_cantidad;
        }
        // Receta en equivalente de la unidad de contenido (g cuando contenido es kg)
        const claveHaciaContenido = `${unidadReceta}_${insumo.contenido_unidad}`;
        if (FACTORES_CONVERSION[claveHaciaContenido]) {
            const enContenidoUnidad = cantidad * FACTORES_CONVERSION[claveHaciaContenido];
            return enContenidoUnidad / insumo.contenido_cantidad;
        }
    }

    // 3. Sin conversión conocida — devolver tal cual
    return cantidad;
}

/**
 * Aplica la receta de un producto al inventario local.
 *
 * `signo`: -1 al VENDER (descuenta), +1 al DESHACER (devuelve). Misma convención
 * y misma aritmética que el backend (`stock + signo * delta`), a propósito: son
 * la pareja `descontarIngredientesDeReceta` / `restaurarIngredientesDeReceta`, y
 * el mismo patrón con signo que usan los modificadores (§32.6).
 *
 * ⚠️ El SQL suma (`stock_actual + ?`), no resta. El signo ya viene aplicado en el
 * delta: si además se restara, vender un insumo lo AUMENTARÍA (dos negaciones).
 */
async function aplicarRecetaDeVentaLocal(productoId, cantidadVendida, signo = -1) {
    const recetaItems = await allAsync(
        "SELECT ri.*, i.unidad, i.contenido_cantidad, i.contenido_unidad FROM receta_items ri LEFT JOIN insumos i ON ri.tipo='insumo' AND ri.referencia_id=i.id WHERE ri.producto_id = ?",
        [productoId]
    );
    if (!recetaItems || recetaItems.length === 0) return;
    for (const ri of recetaItems) {
        if (ri.tipo === 'insumo') {
            const delta = convertirUnidad(ri.cantidad, ri.unidad_receta, ri) * cantidadVendida * signo;
            await runAsync(
                "UPDATE insumos SET stock_actual = MAX(0, stock_actual + ?) WHERE id = ?",
                [delta, ri.referencia_id]
            );
        } else if (ri.tipo === 'preparacion') {
            const prep = await getAsync("SELECT rinde FROM preparaciones WHERE id = ?", [ri.referencia_id]);
            const cantPrep = _fraccionDeTanda(ri.cantidad, prep && prep.rinde) * cantidadVendida * signo;
            const prepItems = await allAsync(
                "SELECT pi.*, i.unidad, i.contenido_cantidad, i.contenido_unidad FROM preparacion_items pi JOIN insumos i ON pi.insumo_id=i.id WHERE pi.preparacion_id = ?",
                [ri.referencia_id]
            );
            if (!prepItems) continue;
            for (const pi of prepItems) {
                const delta = convertirUnidad(pi.cantidad, pi.unidad_receta, pi) * cantPrep;
                await runAsync(
                    "UPDATE insumos SET stock_actual = MAX(0, stock_actual + ?) WHERE id = ?",
                    [delta, pi.insumo_id]
                );
            }
        }
    }
}

/**
 * ¿Qué fracción de la TANDA de una preparación consume una receta?
 *
 * Una preparación RINDE una cantidad: "Salsa, rinde 4" produce 4 porciones por
 * tanda. Una receta que pide 0.5 usa **0.5/4 = 1/8 de la tanda**, no media tanda.
 * Ignorar el rinde descontaba 8 veces el insumo que debía.
 *
 * ⚠️ Espejo de `fraccionDeTanda()` en `utils/preparaciones.js` del backend. Si
 * cambias una, cambia la otra o el stock local y el de la nube se separarán.
 * Un rinde ausente, cero o negativo cae a 1 (el comportamiento anterior): nunca
 * se divide entre cero ni se tumba una venta por un dato mal capturado.
 */
function _fraccionDeTanda(cantidadEnReceta, rinde) {
    const cantidad = parseFloat(cantidadEnReceta);
    if (!isFinite(cantidad)) return 0;
    const r = parseFloat(rinde);
    if (!isFinite(r) || r <= 0) return cantidad;
    return cantidad / r;
}

/** Vender: descuenta los insumos de la receta. */
async function descontarInsumosDeVenta(productoId, cantidadVendida) {
    return aplicarRecetaDeVentaLocal(productoId, cantidadVendida, -1);
}

/** Deshacer: devuelve al inventario los insumos que la venta descontó. */
async function restaurarInsumosDeVenta(productoId, cantidadVendida) {
    return aplicarRecetaDeVentaLocal(productoId, cantidadVendida, +1);
}

/**
 * MODIFICADORES (BLOQUE 11) — ajuste de inventario de un renglón.
 *
 * Todo se expresa como un DELTA con signo, así que una sola fórmula sirve para
 * los dos casos ("extra queso" suma consumo, "sin cebolla" lo devuelve) y para
 * los dos sentidos:
 *     vender   → stock − delta   (signo = -1)
 *     cancelar → stock + delta   (signo = +1)
 * Es exactamente lo que hace `aplicarRecetaDeModificadores` en el backend.
 *
 * ⚠️ El SQL SUMA (`stock_actual + ?`), no resta: el signo ya viene aplicado en el
 * delta. Restarlo ADEMÁS invertiría todo — vender "extra queso" aumentaría el
 * queso en vez de gastarlo. Es la aritmética del backend (`stock + signo * delta`)
 * escrita en SQL, y el smoke test de modo local existe justamente para fijarla.
 */
async function aplicarRecetaModificadoresLocal(modificadores, cantidadVendida, signo) {
    let lista = modificadores;
    if (typeof lista === 'string') {
        try { lista = JSON.parse(lista); } catch { return; }
    }
    if (!Array.isArray(lista) || lista.length === 0) return;

    for (const m of lista) {
        const opcionId = parseInt(m && m.option_id);
        if (!Number.isInteger(opcionId)) continue;

        const ajustes = await allAsync(
            `SELECT mr.*, i.unidad, i.contenido_cantidad, i.contenido_unidad
             FROM modificador_receta mr
             LEFT JOIN insumos i ON mr.tipo='insumo' AND mr.referencia_id = i.id
             WHERE mr.opcion_id = ?`,
            [opcionId]
        );
        if (!ajustes || ajustes.length === 0) continue;

        for (const a of ajustes) {
            if (a.tipo === 'insumo') {
                const delta = convertirUnidad(a.cantidad, a.unidad_receta, a) * cantidadVendida * signo;
                await runAsync(
                    'UPDATE insumos SET stock_actual = MAX(0, stock_actual + ?) WHERE id = ?',
                    [delta, a.referencia_id]
                );
            } else if (a.tipo === 'preparacion') {
                const prep = await getAsync("SELECT rinde FROM preparaciones WHERE id = ?", [a.referencia_id]);
                const cantPrep = _fraccionDeTanda(a.cantidad, prep && prep.rinde) * cantidadVendida * signo;
                const prepItems = await allAsync(
                    `SELECT pi.*, i.unidad, i.contenido_cantidad, i.contenido_unidad
                     FROM preparacion_items pi JOIN insumos i ON pi.insumo_id = i.id
                     WHERE pi.preparacion_id = ?`,
                    [a.referencia_id]
                );
                for (const pi of prepItems || []) {
                    const delta = convertirUnidad(pi.cantidad, pi.unidad_receta, pi) * cantPrep;
                    await runAsync(
                        'UPDATE insumos SET stock_actual = MAX(0, stock_actual + ?) WHERE id = ?',
                        [delta, pi.insumo_id]
                    );
                }
            }
        }
    }
}

/**
 * Reemplaza el catálogo local con el que bajó de la nube. Se hace ENTERO y en
 * una transacción: un catálogo a medias haría que el cajero viera extras que el
 * backend ya no reconoce y su venta rebotara con 400.
 */
function guardarCatalogoModificadores(data, callback) {
    const grupos = (data && data.groups) || [];
    const enlaces = (data && data.product_groups) || [];

    db.serialize(() => {
        db.run('BEGIN');
        db.run('DELETE FROM modificador_grupos');
        db.run('DELETE FROM modificador_opciones');
        db.run('DELETE FROM producto_modificadores');

        for (const g of grupos) {
            db.run(
                'INSERT OR REPLACE INTO modificador_grupos (id, nombre, min_select, max_select, orden) VALUES (?,?,?,?,?)',
                [g.id, g.name, g.min_select || 0, g.max_select === null ? null : g.max_select, g.sort_order || 0]
            );
            for (const o of g.options || []) {
                db.run(
                    'INSERT OR REPLACE INTO modificador_opciones (id, grupo_id, nombre, price_delta, orden) VALUES (?,?,?,?,?)',
                    [o.id, g.id, o.name, parseFloat(o.price_delta) || 0, o.sort_order || 0]
                );
            }
        }
        for (const e of enlaces) {
            db.run(
                'INSERT OR REPLACE INTO producto_modificadores (producto_id, grupo_id, orden) VALUES (?,?,?)',
                [e.product_id, e.group_id, e.sort_order || 0]
            );
        }
        db.run('COMMIT', (err) => callback && callback(err));
    });
}

/** El catálogo local, en el MISMO shape que devuelve `GET /api/modifiers`. */
async function obtenerCatalogoModificadores(callback) {
    try {
        const grupos = await allAsync('SELECT * FROM modificador_grupos ORDER BY orden, id');
        const opciones = await allAsync('SELECT * FROM modificador_opciones ORDER BY orden, id');
        const enlaces = await allAsync('SELECT * FROM producto_modificadores ORDER BY orden');

        const porGrupo = new Map();
        for (const o of opciones) {
            if (!porGrupo.has(o.grupo_id)) porGrupo.set(o.grupo_id, []);
            porGrupo.get(o.grupo_id).push({
                id: o.id, group_id: o.grupo_id, name: o.nombre,
                price_delta: parseFloat(o.price_delta) || 0, sort_order: o.orden,
            });
        }

        callback(null, {
            groups: grupos.map(g => ({
                id: g.id, name: g.nombre,
                min_select: g.min_select || 0,
                max_select: g.max_select === null ? null : g.max_select,
                sort_order: g.orden,
                options: porGrupo.get(g.id) || [],
            })),
            product_groups: enlaces.map(e => ({
                product_id: e.producto_id, group_id: e.grupo_id, sort_order: e.orden,
            })),
        });
    } catch (err) {
        callback(err);
    }
}

// --- VENTAS Y PEDIDOS ---

async function crearPedido(datos, items, callback, opciones) {
    const sqlPedido = `
        INSERT INTO pedidos (
            cliente_id,
            total,
            estado,
            metodo_pago,
            tipo_pedido,
            referencia,
            direccion_domicilio,
            link_maps,
            notas_generales,
            info_cliente_temp,
            cajero,
            pendiente_sync,
            client_uuid,
            descuento_monto,
            descuento_id,
            descuento_puntos_monto,
            puntos_usados,
            subtotal,
            impuesto,
            tasa_impuesto,
            impuesto_incluido,
            propina,
            propina_metodo,
            fecha_pedido
        )
        VALUES (?, ?, 'registrado', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now','localtime'))
    `;

    const skipStock = opciones && opciones.skipStock;
    let enTransaccion = false;

    try {
        await runAsync('BEGIN');
        enTransaccion = true;

        const resultadoPedido = await runAsync(sqlPedido, [
            datos.cliente_id,
            datos.total,
            datos.metodo_pago,
            datos.tipo_pedido,
            datos.referencia,
            datos.direccion_domicilio,
            datos.link_maps,
            datos.notas_generales,
            datos.info_cliente_temp || null,
            datos.cajero || null,
            datos.pendiente_sync || 0,
            datos.client_uuid || null,
            datos.descuento_monto || 0,
            datos.descuento_id || null,
            datos.descuento_puntos_monto || 0,
            datos.puntos_usados || 0,
            // Un pedido sin impuesto guarda subtotal = total: el invariante
            // total = subtotal + impuesto se cumple también en la base local.
            datos.subtotal !== undefined && datos.subtotal !== null ? datos.subtotal : datos.total,
            datos.impuesto || 0,
            datos.tasa_impuesto || 0,
            datos.impuesto_incluido ? 1 : 0,
            // La propina se guarda APARTE del total (BLOQUE 9): `total` es la venta.
            datos.propina || 0,
            datos.propina > 0 ? (datos.propina_metodo || datos.metodo_pago || 'efectivo') : null
        ]);
        const pedidoId = resultadoPedido.lastID;

        // PAGOS DIVIDIDOS (BLOQUE 10). Van en la MISMA transacción que la venta:
        // un pedido cuyo reparto se perdiera a medias descuadraría el corte de
        // caja sin que nadie pudiera notarlo.
        if (Array.isArray(datos.pagos) && datos.pagos.length > 0) {
            for (const pago of datos.pagos) {
                await runAsync(
                    `INSERT INTO pagos_pedido (pedido_id, metodo, monto, propina, item_ids, fecha)
                     VALUES (?, ?, ?, ?, ?, datetime('now','localtime'))`,
                    [
                        pedidoId,
                        pago.metodo || pago.method || 'efectivo',
                        pago.monto != null ? pago.monto : pago.amount,
                        pago.propina != null ? pago.propina : (pago.tip_amount || 0),
                        Array.isArray(pago.item_ids) && pago.item_ids.length
                            ? JSON.stringify(pago.item_ids) : null,
                    ]
                );
            }
        }

        for (const item of items) {
            // MODIFICADORES (BLOQUE 11): `precio` ya viene con los extras sumados
            // (es lo que el cliente paga por unidad) y `precio_base` guarda de
            // dónde partió, para poder desglosarlo en el ticket.
            const modsJson = Array.isArray(item.modificadores) && item.modificadores.length
                ? JSON.stringify(item.modificadores)
                : null;
            await runAsync(
                `INSERT INTO pedido_items
                    (pedido_id, producto_id, cantidad, precio_unitario, subtotal, nota_item, modificadores, precio_base)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    pedidoId, item.id, item.cantidad, item.precio, item.subtotal, item.nota || '',
                    modsJson,
                    item.precio_base !== undefined && item.precio_base !== null ? item.precio_base : item.precio,
                ]
            );
            if (!skipStock) {
                // Descontar insumos según la receta del producto (si tiene receta)
                await descontarInsumosDeVenta(item.id, item.cantidad);
                // …y el ajuste de los extras: el queso adicional sale del
                // inventario, y la cebolla que no se puso vuelve a él.
                await aplicarRecetaModificadoresLocal(item.modificadores, item.cantidad, -1);
            }
        }

        await runAsync('COMMIT');
        enTransaccion = false;
        callback(null, pedidoId);
    } catch (err) {
        if (enTransaccion) {
            try { await runAsync('ROLLBACK'); } catch (_) { /* ignorar */ }
        }
        callback(err);
    }
}

/**
 * Pagos de un pedido (BLOQUE 10). Los usa el sync para mandarle el reparto al
 * backend y el ticket para imprimir cómo se dividió la cuenta.
 */
function obtenerPagosPedido(pedidoId, callback) {
    db.all(
        'SELECT * FROM pagos_pedido WHERE pedido_id = ? ORDER BY id',
        [pedidoId],
        callback
    );
}

function obtenerPedidos(filtro, callback) {
    const limite = Math.min(Math.max(parseInt((filtro && (filtro.limite || filtro.limit)) || 50), 1), 200);
    const pagina = Math.max(parseInt((filtro && (filtro.pagina || filtro.page)) || 1), 1);
    const offset = (pagina - 1) * limite;

    const conditions = [];
    const params = [];
    if (filtro && filtro.status)      { conditions.push('p.estado = ?');        params.push(filtro.status); }
    else                              { conditions.push("p.estado != 'abierto'"); } // excluir mesas abiertas
    if (filtro && filtro.metodo_pago) { conditions.push('p.metodo_pago = ?');   params.push(filtro.metodo_pago); }
    if (filtro && filtro.date_from)   { conditions.push("DATE(p.fecha_pedido, 'localtime') >= ?"); params.push(filtro.date_from); }
    if (filtro && filtro.date_to)     { conditions.push("DATE(p.fecha_pedido, 'localtime') <= ?"); params.push(filtro.date_to); }
    const whereSql = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

    const countSql = `SELECT COUNT(*) as total FROM pedidos p ${whereSql}`;
    const resumenSql = `
        SELECT
            COUNT(*) as total_pedidos,
            COALESCE(SUM(p.total), 0) as total_ventas,
            -- BLOQUE 10: un pedido dividido se reparte por sus pagos reales; uno
            -- sin pagos entra entero por su metodo, como antes del bloque.
            COALESCE(SUM(CASE
                WHEN EXISTS (SELECT 1 FROM pagos_pedido pp WHERE pp.pedido_id = p.id)
                    THEN (SELECT COALESCE(SUM(pp.monto), 0) FROM pagos_pedido pp
                          WHERE pp.pedido_id = p.id AND pp.metodo = 'efectivo')
                WHEN p.metodo_pago = 'efectivo' THEN p.total ELSE 0 END), 0) as efectivo,
            COALESCE(SUM(CASE
                WHEN EXISTS (SELECT 1 FROM pagos_pedido pp WHERE pp.pedido_id = p.id)
                    THEN (SELECT COALESCE(SUM(pp.monto), 0) FROM pagos_pedido pp
                          WHERE pp.pedido_id = p.id AND pp.metodo IN ('tarjeta','debito','credito'))
                WHEN p.metodo_pago IN ('tarjeta','debito','credito') THEN p.total ELSE 0 END), 0) as tarjeta,
            COALESCE(SUM(CASE
                WHEN EXISTS (SELECT 1 FROM pagos_pedido pp WHERE pp.pedido_id = p.id)
                    THEN (SELECT COALESCE(SUM(pp.monto), 0) FROM pagos_pedido pp
                          WHERE pp.pedido_id = p.id AND pp.metodo = 'transferencia')
                WHEN p.metodo_pago = 'transferencia' THEN p.total ELSE 0 END), 0) as transferencia
        FROM pedidos p ${whereSql}
    `;
    const sql = `
        SELECT
            p.id,
            p.cajero,
            p.tipo_pedido,
            CASE
                WHEN p.tipo_pedido = 'mesa' AND m.nombre IS NOT NULL THEN 'Mesa: ' || m.nombre
                WHEN p.tipo_pedido = 'mesa' AND p.info_cliente_temp IS NOT NULL THEN p.info_cliente_temp
                WHEN p.tipo_pedido = 'mesa' THEN 'Mesa'
                WHEN c.nombre IS NOT NULL THEN c.nombre || ' - ' || c.telefono
                WHEN p.info_cliente_temp IS NOT NULL THEN p.info_cliente_temp
                ELSE 'General'
            END as telefono,
            p.total,
            -- Desglose del impuesto y descuento (BLOQUE 8): el ticket los imprime,
            -- y en modo local esta consulta es la única fuente que tiene.
            p.subtotal,
            p.impuesto,
            p.tasa_impuesto,
            p.impuesto_incluido,
            -- Propina (BLOQUE 9): el ticket la imprime bajo el total, como lo que
            -- el cliente entregó de más. No forma parte de la venta.
            p.propina,
            p.propina_metodo,
            p.descuento_monto,
            p.metodo_pago,
            -- Reparto por metodo (BLOQUE 10). Se agrega como texto
            -- "metodo|monto|propina;;..." porque SQLite no tiene JSON_AGG; el
            -- cliente lo parsea con _parsearPagosPedido. Vacio = pago simple.
            (SELECT GROUP_CONCAT(pp.metodo || '|' || pp.monto || '|' || COALESCE(pp.propina, 0), ';;')
               FROM pagos_pedido pp WHERE pp.pedido_id = p.id) as pagos_raw,
            p.estado,
            p.fecha_pedido as fecha
        FROM pedidos p
        LEFT JOIN clientes c ON p.cliente_id = c.id
        LEFT JOIN mesas m ON p.mesa_id = m.id
        ${whereSql}
        ORDER BY p.id DESC
        LIMIT ? OFFSET ?
    `;

    db.get(countSql, params, (err, countRow) => {
        if (err) return callback(err, null);
        db.get(resumenSql, params, (err, resumen) => {
            if (err) return callback(err, null);
            db.all(sql, [...params, limite, offset], (err, rows) => {
                if (err) return callback(err, null);
                callback(null, {
                    data: rows,
                    paginacion: {
                        total: countRow.total,
                        pagina,
                        limite,
                        paginas: Math.ceil(countRow.total / limite)
                    },
                    resumen
                });
            });
        });
    });
}

function obtenerDetallesPedido(pedidoId, callback) {
    const sql = `
        SELECT 
            pi.cantidad,
            pi.subtotal AS precio,
            pi.nota_item AS nota,
            -- Modificadores congelados del renglón (BLOQUE 11), para el ticket.
            pi.modificadores,
            pi.precio_base,
            p.nombre,
            p.emoji
        FROM pedido_items pi
        JOIN productos p ON pi.producto_id = p.id
        WHERE pi.pedido_id = ?
    `;
    
    db.all(sql, [pedidoId], (err, rows) => {
        if (err) {
            console.error("Error al obtener detalles del pedido:", err);
            callback(err, null);
        } else {
            callback(null, rows);
        }
    });
}

function actualizarEstadoPedido(pedidoId, nuevoEstado, callback) {
    db.run('UPDATE pedidos SET estado = ? WHERE id = ?', [nuevoEstado, pedidoId], callback);
}

// --- MERMAS (Funciones base para el futuro) ---
function registrarMerma(item, callback) {
    // item: { producto_id, cantidad, motivo }
    db.run('INSERT INTO mermas (producto_id, cantidad, motivo) VALUES (?, ?, ?)', 
        [item.producto_id, item.cantidad, item.motivo], 
        function(err) {
            if(err) return callback(err);
            // Restar stock también en mermas
            db.run('UPDATE productos SET stock = stock - ? WHERE id = ?', [item.cantidad, item.producto_id], callback);
        }
    );
}

// --- DASHBOARD ---
function obtenerEstadisticasDashboard(callback) {
    const stats = {};
    
    // 1. VENTAS DE HOY
    db.get(`
        SELECT 
            COUNT(*) as total_pedidos, 
            COALESCE(SUM(total), 0) as monto_total,
            COALESCE(AVG(total), 0) as ticket_promedio,
            -- BLOQUE 8: impuesto recaudado hoy. monto_total sigue siendo lo COBRADO
            -- (el número que el dueño ya conoce) y de ahí sale lo neto.
            COALESCE(SUM(impuesto), 0) as impuesto_total,
            COALESCE(SUM(total), 0) - COALESCE(SUM(impuesto), 0) as monto_neto
        FROM pedidos 
        WHERE DATE(fecha_pedido) = DATE('now', 'localtime')
    `, (err, hoy) => {
        if (err) return callback(err);
        stats.ventasHoy = hoy;
        
        // 2. VENTAS DE AYER (para comparación)
        db.get(`
            SELECT 
                COUNT(*) as total_pedidos,
                COALESCE(SUM(total), 0) as monto_total
            FROM pedidos 
            WHERE DATE(fecha_pedido) = DATE('now', '-1 day', 'localtime')
        `, (err, ayer) => {
            if (err) return callback(err);
            stats.ventasAyer = ayer;
            
            // 3. VENTAS ÚLTIMOS 7 DÍAS (para gráfica)
            db.all(`
                SELECT 
                    DATE(fecha_pedido) as fecha,
                    COALESCE(SUM(total), 0) as monto,
                    COUNT(*) as pedidos
                FROM pedidos 
                WHERE DATE(fecha_pedido) >= DATE('now', '-6 days', 'localtime')
                GROUP BY DATE(fecha_pedido)
                ORDER BY fecha ASC
            `, (err, ultimos7) => {
                if (err) return callback(err);
                stats.ultimos7Dias = ultimos7;
                
                // 4. ITEMS VENDIDOS HOY
                db.get(`
                    SELECT COALESCE(SUM(pi.cantidad), 0) as total_items
                    FROM pedido_items pi
                    JOIN pedidos p ON pi.pedido_id = p.id
                    WHERE DATE(p.fecha_pedido) = DATE('now', 'localtime')
                `, (err, items) => {
                    if (err) return callback(err);
                    stats.itemsVendidosHoy = items.total_items;
                    
                    // 5. PRODUCTOS CON STOCK BAJO (menos de 10)
                    db.get(`
                        SELECT COUNT(*) as total
                        FROM insumos
                        WHERE activo = 1
                          AND stock_actual <= stock_minimo
                          AND COALESCE(stock_minimo, 0) > 0
                    `, (err, stockBajo) => {
                        if (err) return callback(err);
                        stats.productosStockBajo = stockBajo.total;
                        
                        // 6. CLIENTES ÚNICOS HOY
                        db.get(`
                            SELECT COUNT(DISTINCT cliente_id) as total
                            FROM pedidos 
                            WHERE DATE(fecha_pedido) = DATE('now', 'localtime')
                            AND cliente_id IS NOT NULL
                        `, (err, clientes) => {
                            if (err) return callback(err);
                            stats.clientesHoy = clientes.total;
                            
                            // 7. TOP 5 PRODUCTOS MÁS VENDIDOS (últimos 7 días)
                            db.all(`
                                SELECT 
                                    p.nombre,
                                    p.emoji,
                                    SUM(pi.cantidad) as total_vendido
                                FROM pedido_items pi
                                JOIN productos p ON pi.producto_id = p.id
                                JOIN pedidos ped ON pi.pedido_id = ped.id
                                WHERE DATE(ped.fecha_pedido) >= DATE('now', '-6 days', 'localtime')
                                GROUP BY p.id
                                ORDER BY total_vendido DESC
                                LIMIT 5
                            `, (err, topProductos) => {
                                if (err) return callback(err);
                                stats.topProductos = topProductos;
                                
                                // 8. ÚLTIMAS 5 VENTAS
                                db.all(`
                                    SELECT 
                                        p.id,
                                        p.total,
                                        p.fecha_pedido,
                                        COALESCE(c.nombre, p.info_cliente_temp, 'General') as cliente
                                    FROM pedidos p
                                    LEFT JOIN clientes c ON p.cliente_id = c.id
                                    ORDER BY p.id DESC
                                    LIMIT 5
                                `, (err, ultimasVentas) => {
                                    if (err) return callback(err);
                                    stats.ultimasVentas = ultimasVentas;
                                    
                                    // 9. CLIENTES VIP QUE COMPRARON HOY
                                    db.all(`
                                        SELECT DISTINCT
                                            c.nombre,
                                            c.telefono
                                        FROM pedidos p
                                        JOIN clientes c ON p.cliente_id = c.id
                                        WHERE DATE(p.fecha_pedido) = DATE('now', 'localtime')
                                        AND c.id IN (
                                            SELECT cliente_id 
                                            FROM pedidos 
                                            WHERE cliente_id IS NOT NULL
                                            GROUP BY cliente_id 
                                            HAVING COUNT(*) >= 3
                                        )
                                    `, (err, clientesVIP) => {
                                        if (err) return callback(err);
                                        stats.clientesVIPHoy = clientesVIP;
                                        
                                        // 10. VENTAS POR HORA HOY (para gráfica de actividad)
                                        db.all(`
                                            SELECT 
                                                strftime('%H', fecha_pedido) as hora,
                                                COUNT(*) as pedidos,
                                                SUM(total) as monto
                                            FROM pedidos
                                            WHERE DATE(fecha_pedido) = DATE('now', 'localtime')
                                            GROUP BY hora
                                            ORDER BY hora
                                        `, (err, ventasPorHora) => {
                                            if (err) return callback(err);
                                            stats.ventasPorHora = ventasPorHora;
                                            
                                            callback(null, stats);
                                        });
                                    });
                                });
                            });
                        });
                    });
                });
            });
        });
    });
}

// --- UTILS ---
function obtenerOCrearCliente(telefono, callback) {
    db.get('SELECT * FROM clientes WHERE telefono = ?', [telefono], (err, row) => {
        if (err) return callback(err);
        if (row) return callback(null, row);
        db.run('INSERT INTO clientes (telefono, nombre) VALUES (?, ?)', [telefono, 'Cliente Nuevo'], function (err) {
            if (err) callback(err);
            else db.get('SELECT * FROM clientes WHERE id = ?', [this.lastID], callback);
        });
    });
}

/**
 * Busca UN cliente por su teléfono. Devuelve null si no existe (no es un error:
 * un teléfono desconocido es el caso normal de un cliente nuevo).
 *
 * ⚠️ Lee SIEMPRE la SQLite local, también en modo conectado, y es a propósito:
 *   · `syncClientes()` baja los clientes del backend con SUS MISMOS ids, así que
 *     la tabla local es un espejo fiel de la nube, no una copia divergente.
 *   · Es la misma fuente que usa el buscador de la pantalla de venta
 *     (`buscarClientesVenta` en modulo-venta.js). Si esta consulta fuera al backend,
 *     teclear el mismo teléfono en dos campos podría dar dos respuestas distintas.
 *   · El backend NO tiene búsqueda por teléfono: `GET /api/customers?search=` filtra
 *     por NOMBRE. Usarlo exigiría un endpoint nuevo y un despliegue coordinado.
 *   · Y así el autocompletado funciona SIN INTERNET, que es cuando más falta hace.
 *
 * El teléfono se compara exacto y también ignorando separadores (espacios, guiones,
 * paréntesis, puntos y el +): el cliente pudo quedar guardado como "55 1234 5678"
 * y el cajero teclea los diez dígitos seguidos.
 */
function buscarClientePorTelefono(telefono, callback) {
    const texto = String(telefono || '').trim();
    if (!texto) return callback(null, null);
    const soloDigitos = texto.replace(/\D/g, '');
    if (!soloDigitos) return callback(null, null);

    db.get(
        `SELECT * FROM clientes
         WHERE telefono = ?
            OR REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(telefono,' ',''),'-',''),'(',''),')',''),'.',''),'+','') = ?
         LIMIT 1`,
        [texto, soloDigitos],
        (err, row) => {
            if (err) return callback(err);
            callback(null, row || null);
        }
    );
}

function obtenerClientes(callback) {
    db.all("SELECT * FROM clientes ORDER BY nombre ASC", [], callback);
}

function actualizarCliente(id, datos, callback) {
    db.run(
        "UPDATE clientes SET nombre = ?, telefono = ?, direccion = ?, notas = ? WHERE id = ?",
        [datos.nombre, datos.telefono, datos.direccion, datos.notas, id],
        callback
    );
}

function crearCliente(datos, callback) {
    db.run(
        'INSERT INTO clientes (telefono, nombre, direccion, notas) VALUES (?, ?, ?, ?)',
        [datos.telefono, datos.nombre, datos.direccion, datos.notas || ''],
        callback
    );
}

function eliminarCliente(id, callback) {
    // Eliminar completamente sin verificación
    db.run('DELETE FROM clientes WHERE id = ?', [id], callback);
}

function obtenerEstadisticasClientes(callback) {
    const stats = {};
    const fechaMesAtras = new Date();
    fechaMesAtras.setMonth(fechaMesAtras.getMonth() - 1);
    const fechaISO = fechaMesAtras.toISOString().split('T')[0];

    // Total de clientes
    db.get("SELECT COUNT(*) as total FROM clientes", (err, row) => {
        if (err) return callback(err);
        stats.totalClientes = row.total;

        // Clientes frecuentes (2+ compras este mes)
        db.get(`
            SELECT COUNT(DISTINCT cliente_id) as total 
            FROM pedidos 
            WHERE DATE(fecha_pedido) >= DATE('now', '-1 month')
            GROUP BY cliente_id
            HAVING COUNT(*) >= 2
        `, (err, row) => {
            stats.clientesFrecuentes = row ? row.total : 0;

            // Clientes nuevos este mes
            db.get(`
                SELECT COUNT(*) as total 
                FROM clientes 
                WHERE DATE(fecha_registro) >= DATE('now', '-1 month')
            `, (err, row) => {
                if (err) return callback(err);
                stats.clientesNuevos = row ? row.total : 0;

                // Top 3 clientes del mes (por número de compras)
                db.all(`
                    SELECT 
                        c.id,
                        c.nombre,
                        c.telefono,
                        COUNT(p.id) as total_pedidos,
                        SUM(p.total) as monto_total
                    FROM clientes c
                    INNER JOIN pedidos p ON c.id = p.cliente_id
                    WHERE DATE(p.fecha_pedido) >= DATE('now', '-1 month')
                    GROUP BY c.id
                    ORDER BY total_pedidos DESC, monto_total DESC
                    LIMIT 3
                `, (err, rows) => {
                    if (err) return callback(err);
                    stats.topClientesMes = rows || [];
                    callback(null, stats);
                });
            });
        });
    });
}

function obtenerClientesConCompras(callback) {
    db.all(`
        SELECT 
            c.*,
            COUNT(p.id) as total_compras,
            SUM(p.total) as monto_total
        FROM clientes c
        LEFT JOIN pedidos p ON c.id = p.cliente_id
        GROUP BY c.id
        ORDER BY c.nombre ASC
    `, callback);
}

function guardarAjuste(clave, valor, callback) {
    db.run(`INSERT OR REPLACE INTO ajustes (clave, valor) VALUES (?, ?)`, [clave, valor], callback);
}

function obtenerAjustes(callback) {
    db.all(`SELECT * FROM ajustes`, (err, rows) => {
        if (err) return callback(err);
        const ajustes = {};
        rows.forEach(row => ajustes[row.clave] = row.valor);
        callback(null, ajustes);
    });
}

// ============================================
// INVENTARIO — INSUMOS
// ============================================
function obtenerInsumos(callback) {
    db.all("SELECT * FROM insumos WHERE activo = 1 ORDER BY nombre ASC", [], callback);
}
function agregarInsumo(d, cb) {
    db.run("INSERT INTO insumos (nombre, unidad, stock_actual, stock_minimo, contenido_cantidad, contenido_unidad, costo_unitario) VALUES (?, ?, ?, ?, ?, ?, ?)",
        [d.nombre, d.unidad, d.stock_actual || 0, d.stock_minimo || 0, d.contenido_cantidad || null, d.contenido_unidad || null, d.costo_unitario || 0], cb);
}
function actualizarInsumo(id, d, cb) {
    db.run("UPDATE insumos SET nombre=?, unidad=?, stock_actual=?, stock_minimo=?, contenido_cantidad=?, contenido_unidad=?, costo_unitario=? WHERE id=?",
        [d.nombre, d.unidad, d.stock_actual, d.stock_minimo, d.contenido_cantidad || null, d.contenido_unidad || null, d.costo_unitario || 0, id], cb);
}
function eliminarInsumo(id, cb) {
    db.run("UPDATE insumos SET activo = 0 WHERE id = ?", [id], cb);
}

// ============================================
// INVENTARIO — PREPARACIONES
// ============================================
function obtenerPreparaciones(callback) {
    db.all("SELECT * FROM preparaciones WHERE activo = 1 ORDER BY nombre ASC", [], callback);
}
function agregarPreparacion(d, cb) {
    db.run("INSERT INTO preparaciones (nombre, descripcion) VALUES (?, ?)",
        [d.nombre, d.descripcion || ''], cb);
}
function actualizarPreparacion(id, d, cb) {
    db.run("UPDATE preparaciones SET nombre=?, descripcion=? WHERE id=?",
        [d.nombre, d.descripcion || '', id], cb);
}
function eliminarPreparacion(id, cb) {
    db.run("UPDATE preparaciones SET activo = 0 WHERE id = ?", [id], (err) => {
        if (err) return cb(err);
        db.run("DELETE FROM preparacion_items WHERE preparacion_id = ?", [id], cb);
    });
}
function obtenerItemsPreparacion(preparacionId, callback) {
    db.all(`
        SELECT pi.*, i.nombre as insumo_nombre, i.unidad
        FROM preparacion_items pi
        JOIN insumos i ON pi.insumo_id = i.id
        WHERE pi.preparacion_id = ?
    `, [preparacionId], callback);
}
function guardarItemsPreparacion(preparacionId, items, cb) {
    db.run("DELETE FROM preparacion_items WHERE preparacion_id = ?", [preparacionId], (err) => {
        if (err) return cb(err);
        if (!items || items.length === 0) return cb(null);
        const stmt = db.prepare("INSERT INTO preparacion_items (preparacion_id, insumo_id, cantidad, unidad_receta) VALUES (?, ?, ?, ?)");
        items.forEach(item => stmt.run(preparacionId, item.insumo_id, item.cantidad, item.unidad_receta || null));
        stmt.finalize(cb);
    });
}

// ============================================
// INVENTARIO — RECETAS
// ============================================
function obtenerRecetaProducto(productoId, callback) {
    db.all(`
        SELECT 
            ri.*,
            CASE ri.tipo
                WHEN 'insumo' THEN i.nombre
                WHEN 'preparacion' THEN pr.nombre
            END as nombre_ref,
            CASE ri.tipo
                WHEN 'insumo' THEN i.unidad
                ELSE 'porción'
            END as unidad_ref
        FROM receta_items ri
        LEFT JOIN insumos i ON ri.tipo = 'insumo' AND ri.referencia_id = i.id
        LEFT JOIN preparaciones pr ON ri.tipo = 'preparacion' AND ri.referencia_id = pr.id
        WHERE ri.producto_id = ?
    `, [productoId], callback);
}
function eliminarRecetaProducto(productoId) {
    return new Promise((resolve, reject) => {
        db.run("DELETE FROM receta_items WHERE producto_id = ?", [productoId], err => err ? reject(err) : resolve());
    });
}

function guardarRecetaProducto(productoId, items, cb) {
    db.run("DELETE FROM receta_items WHERE producto_id = ?", [productoId], (err) => {
        if (err) return cb(err);
        if (!items || items.length === 0) return cb(null);
        const stmt = db.prepare("INSERT INTO receta_items (producto_id, tipo, referencia_id, cantidad, unidad_receta) VALUES (?, ?, ?, ?, ?)");
        items.forEach(item => stmt.run(productoId, item.tipo, item.referencia_id, item.cantidad, item.unidad_receta || null));
        stmt.finalize(cb);
    });
}

// Calcula cuántas "porciones" de una preparación se pueden hacer con el stock actual
function calcularStockPreparacion(preparacionId, callback) {
    db.all(`SELECT pi.cantidad, pi.unidad_receta, i.stock_actual, i.unidad, i.contenido_cantidad, i.contenido_unidad
            FROM preparacion_items pi 
            JOIN insumos i ON pi.insumo_id = i.id 
            WHERE pi.preparacion_id = ?`, [preparacionId], (err, items) => {
        if (err || !items || items.length === 0) return callback(null, null);
        let min = Infinity;
        items.forEach(item => {
            const req = convertirUnidad(item.cantidad, item.unidad_receta, item);
            const posible = item.stock_actual / req;
            if (posible < min) min = posible;
        });
        // `min` son TANDAS posibles; cada tanda produce `rinde` porciones.
        db.get("SELECT COALESCE(rinde, 1) AS rinde FROM preparaciones WHERE id = ?", [preparacionId], (e2, pr) => {
            const rinde = (!e2 && pr && parseFloat(pr.rinde) > 0) ? parseFloat(pr.rinde) : 1;
            const porciones = min === Infinity ? 0 : min * rinde;
            callback(null, Math.floor(porciones * 100) / 100);
        });
    });
}

// Calcula cuántas unidades de un producto se pueden preparar según sus insumos
function calcularStockProducto(productoId, callback) {
    db.all("SELECT ri.*, i.unidad, i.stock_actual as ins_stock, i.contenido_cantidad, i.contenido_unidad, pr.rinde as _rinde FROM receta_items ri LEFT JOIN insumos i ON ri.tipo='insumo' AND ri.referencia_id=i.id LEFT JOIN preparaciones pr ON ri.tipo='preparacion' AND ri.referencia_id=pr.id WHERE ri.producto_id = ?", [productoId], (err, recetaItems) => {
        if (err || !recetaItems || recetaItems.length === 0) return callback(null, null);
        let min = Infinity;
        let pendientes = recetaItems.length;
        recetaItems.forEach(ri => {
           if (ri.tipo === 'insumo') {
                db.get("SELECT stock_actual, unidad, contenido_cantidad, contenido_unidad FROM insumos WHERE id = ?", [ri.referencia_id], (err, ins) => {
                    if (!err && ins) {
                        const cantConvertida = convertirUnidad(ri.cantidad, ri.unidad_receta, ins);
                        const posible = Math.floor(ins.stock_actual / cantConvertida);
                        if (posible < min) min = posible;
                    }
                    pendientes--;
                    if (pendientes === 0) callback(null, min === Infinity ? 0 : min);
                });
            } else if (ri.tipo === 'preparacion') {
                db.all(`SELECT pi.cantidad, pi.unidad_receta, i.stock_actual, i.unidad, i.contenido_cantidad, i.contenido_unidad
                        FROM preparacion_items pi 
                        JOIN insumos i ON pi.insumo_id = i.id 
                        WHERE pi.preparacion_id = ?`, [ri.referencia_id], (err, prepItems) => {
                    if (!err && prepItems && prepItems.length > 0) {
                        let minPrep = Infinity;
                        prepItems.forEach(pi => {
                            const req = convertirUnidad(pi.cantidad, pi.unidad_receta, pi);
                            const dp = pi.stock_actual / req;
                            if (dp < minPrep) minPrep = dp;
                        });
                        // minPrep = tandas posibles; cada tanda rinde `rinde`
                        // unidades, y la receta pide `ri.cantidad` de ellas.
                        const fraccion = _fraccionDeTanda(ri.cantidad, ri._rinde);
                        const posible = fraccion > 0 ? Math.floor(minPrep / fraccion) : Infinity;
                        if (posible < min) min = posible;
                    }
                    pendientes--;
                    if (pendientes === 0) callback(null, min === Infinity ? 0 : min);
                });
            }
        });
    });
}

// Registro de entrada de insumos (abastecimiento)
function registrarEntradaInsumo(datos, callback) {
    db.run("INSERT INTO entradas_insumos (insumo_id, cantidad, notas) VALUES (?, ?, ?)",
        [datos.insumo_id, datos.cantidad, datos.notas || ''], function(err) {
            if (err) return callback(err);
            db.run("UPDATE insumos SET stock_actual = COALESCE(stock_actual, 0) + ? WHERE id = ?",
                [datos.cantidad, datos.insumo_id], callback);
        });
}

function obtenerEntradasInsumo(insumoId, callback) {
    const sql = insumoId
        ? `SELECT e.*, i.nombre as insumo_nombre, i.unidad 
           FROM entradas_insumos e 
           JOIN insumos i ON e.insumo_id = i.id 
           WHERE e.insumo_id = ? 
           ORDER BY e.fecha DESC LIMIT 50`
        : `SELECT e.*, i.nombre as insumo_nombre, i.unidad 
           FROM entradas_insumos e 
           JOIN insumos i ON e.insumo_id = i.id 
           ORDER BY e.fecha DESC LIMIT 100`;
    const params = insumoId ? [insumoId] : [];
    db.all(sql, params, callback);
}

function registrarSalidaInsumo(datos, callback) {
    db.run("INSERT INTO salidas_insumos (insumo_id, cantidad, motivo, notas) VALUES (?, ?, ?, ?)",
        [datos.insumo_id, datos.cantidad, datos.motivo || 'merma', datos.notas || ''], function(err) {
            if (err) return callback(err);
            db.run("UPDATE insumos SET stock_actual = MAX(0, COALESCE(stock_actual, 0) - ?) WHERE id = ?",
                [datos.cantidad, datos.insumo_id], callback);
        });
}

function obtenerSalidasInsumo(insumoId, callback) {
    const sql = insumoId
        ? `SELECT s.*, i.nombre as insumo_nombre, i.unidad FROM salidas_insumos s JOIN insumos i ON s.insumo_id = i.id WHERE s.insumo_id = ? ORDER BY s.fecha DESC LIMIT 50`
        : `SELECT s.*, i.nombre as insumo_nombre, i.unidad FROM salidas_insumos s JOIN insumos i ON s.insumo_id = i.id ORDER BY s.fecha DESC LIMIT 100`;
    db.all(sql, insumoId ? [insumoId] : [], callback);
}

// ============================================
// OFERTAS — DESCUENTOS
// ============================================
function obtenerDescuentos(callback) {
    db.all("SELECT * FROM promociones WHERE activa = 1 ORDER BY nombre ASC", [], callback);
}
function agregarDescuento(d, cb) {
    db.run("INSERT INTO promociones (nombre, tipo, valor, requires_pin) VALUES (?, ?, ?, ?)",
        [d.nombre, d.tipo, d.valor, d.requires_pin ? 1 : 0], cb);
}
function actualizarDescuento(id, d, cb) {
    db.run("UPDATE promociones SET nombre=?, tipo=?, valor=?, requires_pin=? WHERE id=?",
        [d.nombre, d.tipo, d.valor, d.requires_pin ? 1 : 0, id], cb);
}
function eliminarDescuento(id, cb) {
    db.run("UPDATE promociones SET activa = 0 WHERE id = ?", [id], cb);
}
// Borrado real (no solo desactivar). Se usa al reconciliar un descuento local con
// el backend: la fila con el id viejo se elimina tras reinsertarla con el id real.
function eliminarDescuentoDefinitivo(id, cb) {
    db.run("DELETE FROM promociones WHERE id = ?", [id], cb);
}

// ============================================
// OFERTAS — COMBOS
// ============================================
function obtenerCombos(callback) {
    db.all("SELECT * FROM combos WHERE activo = 1 ORDER BY nombre ASC", [], callback);
}
function agregarCombo(d, cb) {
    db.run("INSERT INTO combos (nombre, descripcion, precio_especial) VALUES (?, ?, ?)",
        [d.nombre, d.descripcion || '', d.precio_especial], function(err) {
            if (err) return cb(err);
            cb(null, this.lastID);
        });
}
function actualizarCombo(id, d, cb) {
    db.run("UPDATE combos SET nombre=?, descripcion=?, precio_especial=? WHERE id=?",
        [d.nombre, d.descripcion || '', d.precio_especial, id], cb);
}
function eliminarCombo(id, cb) {
    db.run("UPDATE combos SET activo = 0 WHERE id = ?", [id], (err) => {
        if (err) return cb(err);
        db.run("DELETE FROM combo_items WHERE combo_id = ?", [id], cb);
    });
}
function obtenerItemsCombo(comboId, callback) {
    db.all(`
        SELECT ci.*, p.nombre as producto_nombre, p.precio, p.emoji
        FROM combo_items ci
        JOIN productos p ON ci.producto_id = p.id
        WHERE ci.combo_id = ?
    `, [comboId], callback);
}
function guardarItemsCombo(comboId, items, cb) {
    db.run("DELETE FROM combo_items WHERE combo_id = ?", [comboId], (err) => {
        if (err) return cb(err);
        if (!items || items.length === 0) return cb(null);
        const stmt = db.prepare("INSERT INTO combo_items (combo_id, producto_id, cantidad) VALUES (?, ?, ?)");
        items.forEach(item => stmt.run(comboId, item.producto_id, item.cantidad || 1));
        stmt.finalize(cb);
    });
}

// ============================================
// SISTEMA DE AJUSTES
// ============================================

function guardarAjuste(clave, valor, callback) {
    db.run(
        'INSERT OR REPLACE INTO ajustes (clave, valor) VALUES (?, ?)',
        [clave, valor],
        callback
    );
}

function obtenerAjustes(callback) {
    db.all('SELECT clave, valor FROM ajustes', (err, rows) => {
        if (err) return callback(err);
        const ajustes = {};
        rows.forEach(row => {
            ajustes[row.clave] = row.valor;
        });
        callback(null, ajustes);
    });
}

// LOGIN — Contraseña de acceso al app
function tienePasswordApp(cb) {
    db.get('SELECT valor FROM ajustes WHERE clave = ?', ['app_password'], (err, row) => {
        cb(err, !!row);
    });
}

function establecerPasswordApp(password, cb) {
    const crypto = require('crypto');
    const salt = crypto.randomBytes(16).toString('hex');
    // PBKDF2: algoritmo fuerte con 100,000 iteraciones (mucho más seguro que SHA-256)
    const hash = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
    const valor = 'pbkdf2:' + salt + ':' + hash;
    db.run('INSERT OR REPLACE INTO ajustes (clave, valor) VALUES (?, ?)', ['app_password', valor], cb);
}

function verificarPasswordApp(password, cb) {
    const crypto = require('crypto');
    db.get('SELECT valor FROM ajustes WHERE clave = ?', ['app_password'], (err, row) => {
        if (err || !row) return cb(err, false);
        const valor = row.valor;

        if (valor.startsWith('pbkdf2:')) {
            // Formato nuevo: pbkdf2:salt:hash
            const parts = valor.split(':');
            const salt = parts[1];
            const hash = parts[2];
            const hashInput = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
            cb(null, hash === hashInput);
        } else {
            // Formato viejo: salt:sha256hash — verificar y migrar automáticamente
            const parts = valor.split(':');
            const salt = parts[0];
            const hash = parts[1];
            const hashInput = crypto.createHash('sha256').update(salt + password).digest('hex');
            const valido = hash === hashInput;
            if (valido) {
                // Migrar silenciosamente a PBKDF2 para la próxima vez
                establecerPasswordApp(password, () => {});
            }
            cb(null, valido);
        }
    });
}

// ============================================
// TURNOS — CORTE DE CAJA
// ============================================

function abrirTurno(cajeroNombre, rol, fondoInicial, cb) {
    db.run(
        "INSERT INTO turnos (cajero_nombre, rol, fondo_inicial, apertura) VALUES (?, ?, ?, datetime('now','localtime'))",
        [cajeroNombre, rol, fondoInicial],
        function(err) { cb(err, this?.lastID); }
    );
}

function obtenerTurnoActivo(cb) {
    db.get("SELECT * FROM turnos WHERE estado = 'abierto' ORDER BY apertura DESC LIMIT 1", cb);
}

function obtenerTurnos(cb) {
    db.all('SELECT * FROM turnos ORDER BY apertura DESC LIMIT 50', cb);
}

function calcularTotalesTurno(fechaApertura, cb) {
    db.all(`
        SELECT
            COUNT(*) as total_pedidos,
            COALESCE(SUM(total), 0) as total_ventas,
            -- BLOQUE 10: un pedido con pagos divididos se reparte por su desglose
            -- real; uno sin pagos entra entero por su metodo_pago, como siempre.
            -- Sin esto, una venta mitad efectivo / mitad tarjeta le exigiría al
            -- cajero un efectivo que nunca entró al cajón.
            COALESCE(SUM(CASE
                WHEN EXISTS (SELECT 1 FROM pagos_pedido pp WHERE pp.pedido_id = pedidos.id)
                    THEN (SELECT COALESCE(SUM(pp.monto), 0) FROM pagos_pedido pp
                          WHERE pp.pedido_id = pedidos.id AND pp.metodo = 'efectivo')
                WHEN metodo_pago = 'efectivo' THEN total ELSE 0 END), 0) as total_efectivo,
            COALESCE(SUM(CASE
                WHEN EXISTS (SELECT 1 FROM pagos_pedido pp WHERE pp.pedido_id = pedidos.id)
                    THEN (SELECT COALESCE(SUM(pp.monto), 0) FROM pagos_pedido pp
                          WHERE pp.pedido_id = pedidos.id AND pp.metodo IN ('debito','credito','tarjeta'))
                WHEN metodo_pago IN ('debito','credito','tarjeta') THEN total ELSE 0 END), 0) as total_tarjeta,
            COALESCE(SUM(CASE
                WHEN EXISTS (SELECT 1 FROM pagos_pedido pp WHERE pp.pedido_id = pedidos.id)
                    THEN (SELECT COALESCE(SUM(pp.monto), 0) FROM pagos_pedido pp
                          WHERE pp.pedido_id = pedidos.id AND pp.metodo = 'transferencia')
                WHEN metodo_pago = 'transferencia' THEN total ELSE 0 END), 0) as total_transferencia,
            -- BLOQUE 8: el impuesto va DENTRO del total cobrado, así que no cambia
            -- el efectivo esperado; es informativo para el administrador.
            COALESCE(SUM(impuesto), 0) as total_impuesto,
            COALESCE(SUM(total), 0) - COALESCE(SUM(impuesto), 0) as total_ventas_netas,
            -- BLOQUE 9: las propinas van APARTE de las ventas (no son ingreso del
            -- negocio) y se separan por método porque solo la de efectivo está en
            -- el cajón. La columna propina_metodo es NULL en los pedidos sin propina
            -- y en los anteriores al bloque, así que hereda el método del pago.
            -- BLOQUE 10: con pagos divididos, cada pago lleva SU propina, así que
            -- propina_metodo (que solo alcanza para una) deja de ser la verdad.
            -- Una propina en efectivo dejada sobre una cuenta pagada con tarjeta
            -- tiene que entrar al cajón, o volvería a aparecer como sobrante.
            COALESCE(SUM(propina), 0) as total_propinas,
            COALESCE(SUM(CASE
                WHEN EXISTS (SELECT 1 FROM pagos_pedido pp WHERE pp.pedido_id = pedidos.id)
                    THEN (SELECT COALESCE(SUM(pp.propina), 0) FROM pagos_pedido pp
                          WHERE pp.pedido_id = pedidos.id AND pp.metodo = 'efectivo')
                WHEN COALESCE(propina_metodo, metodo_pago) = 'efectivo' THEN propina ELSE 0 END), 0) as total_propinas_efectivo,
            COALESCE(SUM(CASE
                WHEN EXISTS (SELECT 1 FROM pagos_pedido pp WHERE pp.pedido_id = pedidos.id)
                    THEN (SELECT COALESCE(SUM(pp.propina), 0) FROM pagos_pedido pp
                          WHERE pp.pedido_id = pedidos.id AND pp.metodo IN ('debito','credito','tarjeta'))
                WHEN COALESCE(propina_metodo, metodo_pago) IN ('debito','credito','tarjeta') THEN propina ELSE 0 END), 0) as total_propinas_tarjeta,
            COALESCE(SUM(CASE
                WHEN EXISTS (SELECT 1 FROM pagos_pedido pp WHERE pp.pedido_id = pedidos.id)
                    THEN (SELECT COALESCE(SUM(pp.propina), 0) FROM pagos_pedido pp
                          WHERE pp.pedido_id = pedidos.id AND pp.metodo = 'transferencia')
                WHEN COALESCE(propina_metodo, metodo_pago) = 'transferencia' THEN propina ELSE 0 END), 0) as total_propinas_transferencia
        FROM pedidos
        WHERE fecha_pedido >= ? AND estado != 'cancelado'
    `, [fechaApertura], cb);
}

// ── RENTABILIDAD POR PRODUCTO (BLOQUE 12) ───────────────────────────────────
//
// Espejo local del endpoint `GET /api/stats/profitability`. Existe porque el
// desktop tiene que funcionar SIN internet y porque en modo local puro no hay
// backend al que preguntarle: si el reporte solo viviera en la nube, la caja se
// quedaría sin él justo el día que se cae la conexión.
//
// ⚠️ LA FÓRMULA ESTÁ DUPLICADA con `utils/costos.js` + `routes/stats.js` del
// backend. Si cambias una, cambia la otra: el dueño compararía el mismo periodo
// desde dos pantallas y vería dos márgenes distintos. (Mismo criterio que el
// impuesto §29, las propinas §30, los pagos §31 y los modificadores §32.)
//
// Las tres reglas son las mismas que en el backend:
//   1. Sin receta el costo es NULL, no cero (un margen del 100% inventado es
//      peor que un hueco visible).
//   2. Un insumo sin precio marca el costo como NO confiable y se denuncia.
//   3. El ingreso es NETO: se le quitan impuesto y descuentos con el factor
//      `subtotal del pedido / suma de los renglones`.

// Convierte la cantidad de una receta a la unidad en la que se guarda el insumo.
// Espeja a utils/unidades.js del backend.
const FACTORES_CONVERSION_LOCAL = {
    'kg_g': 1000, 'g_kg': 0.001,
    'l_ml': 1000, 'ml_l': 0.001,
    'ml_gal': 0.000264, 'gal_ml': 3785.41,
    'l_gal': 0.26417, 'gal_l': 3.78541,
};
function _convertirCantidadLocal(cantidad, unidadOrigen, unidadDestino) {
    if (!unidadOrigen || !unidadDestino || unidadOrigen === unidadDestino) return cantidad;
    const f = FACTORES_CONVERSION_LOCAL[`${unidadOrigen}_${unidadDestino}`];
    return f ? cantidad * f : cantidad;
}

const _centavos = (n) => Math.round((Number(n) || 0) * 100) / 100;

/**
 * Costo de todos los productos y de todas las opciones de modificador, a partir
 * de las recetas locales.
 * @returns {Promise<{productos: Map, opciones: Map}>}
 */
function _mapaDeCostosLocal() {
    return new Promise((resolve, reject) => {
        const q = (sql, params = []) => new Promise((ok, ko) =>
            db.all(sql, params, (e, r) => e ? ko(e) : ok(r || [])));

        Promise.all([
            q('SELECT id, nombre, unidad, COALESCE(costo_unitario, 0) AS costo FROM insumos'),
            q('SELECT preparacion_id, insumo_id, cantidad, unidad_receta FROM preparacion_items'),
            q('SELECT id, COALESCE(rinde, 1) AS rinde FROM preparaciones'),
            q('SELECT producto_id, tipo, referencia_id, cantidad FROM receta_items'),
            q('SELECT opcion_id, tipo, referencia_id, cantidad, unidad_receta FROM modificador_receta'),
            q('SELECT id FROM productos'),
        ]).then(([insumos, prepItems, rindes, recetas, modRecetas, productos]) => {
            const rindePorPrep = new Map();
            rindes.forEach(r => rindePorPrep.set(Number(r.id), r.rinde));
            const insumoPorId = new Map();
            insumos.forEach(i => insumoPorId.set(Number(i.id), i));

            // Costo de una línea de receta, con los insumos que no tienen precio.
            const costoDeLinea = (tipo, referenciaId, cantidad, unidadReceta, prepCosto) => {
                const cant = parseFloat(cantidad);
                if (!isFinite(cant)) return { costo: 0, faltantes: [] };
                const esInsumo = tipo === 'insumo' || tipo === 'ingrediente' || tipo === 'ingredient';
                if (esInsumo) {
                    const ing = insumoPorId.get(Number(referenciaId));
                    if (!ing) return { costo: 0, faltantes: ['(insumo eliminado)'] };
                    const precio = parseFloat(ing.costo) || 0;
                    const q2 = _convertirCantidadLocal(cant, unidadReceta, ing.unidad);
                    return { costo: q2 * precio, faltantes: precio > 0 ? [] : [ing.nombre] };
                }
                const prep = prepCosto.get(Number(referenciaId));
                if (!prep) return { costo: 0, faltantes: ['(preparación eliminada)'] };
                // `prep.costo` es el de la TANDA COMPLETA; el rinde dice qué
                // fracción de esa tanda pide la receta (mismo criterio que el
                // descuento de inventario).
                const fraccion = _fraccionDeTanda(cant, rindePorPrep.get(Number(referenciaId)));
                return { costo: prep.costo * fraccion, faltantes: prep.faltantes };
            };

            // Preparaciones: se expanden a insumos, igual que el descuento de stock.
            const prepCosto = new Map();
            const porPrep = new Map();
            prepItems.forEach(it => {
                const arr = porPrep.get(Number(it.preparacion_id)) || [];
                arr.push(it);
                porPrep.set(Number(it.preparacion_id), arr);
            });
            for (const [prepId, items] of porPrep) {
                let costo = 0; const faltantes = new Set();
                items.forEach(it => {
                    const r = costoDeLinea('insumo', it.insumo_id, it.cantidad, it.unidad_receta, prepCosto);
                    costo += r.costo; r.faltantes.forEach(f => faltantes.add(f));
                });
                prepCosto.set(prepId, { costo, faltantes: [...faltantes] });
            }

            // Productos.
            const porProducto = new Map();
            recetas.forEach(r => {
                const arr = porProducto.get(Number(r.producto_id)) || [];
                arr.push(r);
                porProducto.set(Number(r.producto_id), arr);
            });
            const mapaProductos = new Map();
            productos.forEach(p => {
                const lineas = porProducto.get(Number(p.id));
                if (!lineas || !lineas.length) {
                    mapaProductos.set(Number(p.id), { costo: null, completo: false, faltantes: [], sin_receta: true });
                    return;
                }
                let costo = 0; const faltantes = new Set();
                lineas.forEach(l => {
                    const r = costoDeLinea(l.tipo, l.referencia_id, l.cantidad, l.unidad_receta, prepCosto);
                    costo += r.costo; r.faltantes.forEach(f => faltantes.add(f));
                });
                mapaProductos.set(Number(p.id), {
                    costo, completo: faltantes.size === 0, faltantes: [...faltantes], sin_receta: false,
                });
            });

            // Opciones de modificador (BLOQUE 11). Su cantidad puede ser NEGATIVA
            // ("sin cebolla" devuelve insumo), así que su costo también.
            const porOpcion = new Map();
            modRecetas.forEach(m => {
                const arr = porOpcion.get(Number(m.opcion_id)) || [];
                arr.push(m);
                porOpcion.set(Number(m.opcion_id), arr);
            });
            const mapaOpciones = new Map();
            for (const [opcionId, lineas] of porOpcion) {
                let costo = 0; const faltantes = new Set();
                lineas.forEach(l => {
                    const r = costoDeLinea(l.tipo, l.referencia_id, l.cantidad, l.unidad_receta, prepCosto);
                    costo += r.costo; r.faltantes.forEach(f => faltantes.add(f));
                });
                mapaOpciones.set(opcionId, { costo, faltantes: [...faltantes] });
            }

            resolve({ productos: mapaProductos, opciones: mapaOpciones });
        }).catch(reject);
    });
}

/**
 * Reporte de rentabilidad del periodo, calculado en la base local.
 * @param {{desde?: string, hasta?: string, orden?: string}} opciones fechas 'YYYY-MM-DD'
 */
function obtenerRentabilidad(opciones, callback) {
    const o = opciones || {};
    // Por defecto los últimos 30 días, igual que el backend.
    const desde = o.desde || null;
    const hasta = o.hasta || null;
    const cond = [
        // Mismo criterio de "venta contable" que el backend: fuera canceladas,
        // devueltas y mesas todavía abiertas.
        "p.estado NOT IN ('cancelado', 'devuelto', 'abierto')",
    ];
    const params = [];
    if (desde) { cond.push("DATE(p.fecha_pedido) >= DATE(?)"); params.push(desde); }
    else { cond.push("DATE(p.fecha_pedido) >= DATE('now', '-29 days', 'localtime')"); }
    if (hasta) { cond.push("DATE(p.fecha_pedido) <= DATE(?)"); params.push(hasta); }

    const sql = `
        SELECT pi.pedido_id, pi.producto_id, pi.cantidad, pi.subtotal, pi.modificadores,
               p.subtotal AS pedido_subtotal, p.total AS pedido_total,
               pr.nombre AS producto_nombre, pr.emoji AS producto_icono
        FROM pedido_items pi
        JOIN pedidos p ON p.id = pi.pedido_id
        LEFT JOIN productos pr ON pr.id = pi.producto_id
        WHERE ${cond.join(' AND ')}
    `;

    db.all(sql, params, (err, renglones) => {
        if (err) return callback(err);
        _mapaDeCostosLocal().then(costos => {
            // Factor neto por pedido: le quita impuesto y descuentos al ingreso.
            const bruto = new Map();
            (renglones || []).forEach(r => {
                const id = Number(r.pedido_id);
                bruto.set(id, (bruto.get(id) || 0) + (parseFloat(r.subtotal) || 0));
            });
            const factor = new Map();
            (renglones || []).forEach(r => {
                const id = Number(r.pedido_id);
                if (factor.has(id)) return;
                const b = bruto.get(id) || 0;
                const neto = (r.pedido_subtotal !== null && r.pedido_subtotal !== undefined)
                    ? parseFloat(r.pedido_subtotal)
                    : parseFloat(r.pedido_total);
                factor.set(id, (b > 0 && isFinite(neto)) ? neto / b : 1);
            });

            const acumulado = new Map();
            (renglones || []).forEach(r => {
                const pid = Number(r.producto_id);
                const qty = parseInt(r.cantidad) || 0;
                let fila = acumulado.get(pid);
                if (!fila) {
                    const info = costos.productos.get(pid) ||
                        { costo: null, completo: false, faltantes: [], sin_receta: true };
                    fila = {
                        product_id: pid,
                        nombre: r.producto_nombre || 'Producto eliminado',
                        emoji: r.producto_icono || '',
                        unidades: 0, ingreso: 0, costo: 0,
                        sin_receta: info.sin_receta,
                        costo_confiable: info.sin_receta ? false : info.completo,
                        insumos_sin_costo: new Set(info.faltantes),
                        _costoUnitario: info.costo,
                    };
                    acumulado.set(pid, fila);
                }
                fila.unidades += qty;
                fila.ingreso += (parseFloat(r.subtotal) || 0) * (factor.get(Number(r.pedido_id)) || 1);
                if (!fila.sin_receta) {
                    fila.costo += (fila._costoUnitario || 0) * qty;
                    // Extras del renglón: cobran y consumen (BLOQUE 11).
                    let elegidas = [];
                    try { elegidas = JSON.parse(r.modificadores || '[]') || []; } catch (e) { elegidas = []; }
                    if (Array.isArray(elegidas)) {
                        elegidas.forEach(m => {
                            const info = costos.opciones.get(Number(m && m.option_id));
                            if (!info) return;
                            fila.costo += info.costo * qty;
                            if (info.faltantes.length) {
                                info.faltantes.forEach(f => fila.insumos_sin_costo.add(f));
                                fila.costo_confiable = false;
                            }
                        });
                    }
                }
            });

            const productos = [...acumulado.values()].map(f => {
                const ingreso = _centavos(f.ingreso);
                if (f.sin_receta) {
                    return {
                        product_id: f.product_id, nombre: f.nombre, emoji: f.emoji,
                        unidades: f.unidades, ingreso,
                        costo: null, costo_unitario: null, margen: null, margen_pct: null,
                        sin_receta: true, costo_confiable: false, insumos_sin_costo: [],
                    };
                }
                const costo = _centavos(f.costo);
                const margen = _centavos(ingreso - costo);
                return {
                    product_id: f.product_id, nombre: f.nombre, emoji: f.emoji,
                    unidades: f.unidades, ingreso, costo,
                    costo_unitario: _centavos(f._costoUnitario || 0),
                    margen,
                    margen_pct: ingreso > 0 ? Math.round((margen / ingreso) * 1000) / 10 : null,
                    sin_receta: false,
                    costo_confiable: f.costo_confiable,
                    insumos_sin_costo: [...f.insumos_sin_costo],
                };
            });

            const criterios = {
                margen: (a, b) => (b.margen === null ? -Infinity : b.margen) - (a.margen === null ? -Infinity : a.margen),
                margen_pct: (a, b) => (b.margen_pct === null ? -Infinity : b.margen_pct) - (a.margen_pct === null ? -Infinity : a.margen_pct),
                ingreso: (a, b) => b.ingreso - a.ingreso,
                unidades: (a, b) => b.unidades - a.unidades,
            };
            productos.sort(criterios[o.orden] || criterios.margen);

            const conCosto = productos.filter(p => !p.sin_receta);
            const insumosSinCosto = new Set();
            conCosto.forEach(p => p.insumos_sin_costo.forEach(i => insumosSinCosto.add(i)));
            const ingresoTotal = _centavos(conCosto.reduce((s, p) => s + p.ingreso, 0));
            const costoTotal = _centavos(conCosto.reduce((s, p) => s + p.costo, 0));
            const margenTotal = _centavos(ingresoTotal - costoTotal);

            callback(null, {
                periodo: { desde, hasta },
                resumen: {
                    ingreso: ingresoTotal,
                    costo: costoTotal,
                    margen: margenTotal,
                    margen_pct: ingresoTotal > 0 ? Math.round((margenTotal / ingresoTotal) * 1000) / 10 : null,
                    productos_con_receta: conCosto.length,
                    productos_sin_receta: productos.length - conCosto.length,
                    insumos_sin_costo: [...insumosSinCosto],
                },
                productos,
            });
        }).catch(callback);
    });
}

// ── Movimientos de caja (BLOQUE 7) ──────────────────────────────────────────
// Espejo local de `cash_movements` del backend. No se sincronizan: igual que los
// turnos, en modo conectado viven en el backend y en modo local en esta base.

function registrarMovimientoCaja(turnoId, tipo, monto, motivo, empleadoNombre, cb) {
    db.run(
        "INSERT INTO movimientos_caja (turno_id, tipo, monto, motivo, empleado_nombre, fecha) VALUES (?, ?, ?, ?, ?, datetime('now','localtime'))",
        [turnoId, tipo, monto, motivo || null, empleadoNombre || null],
        function(err) { cb(err, this?.lastID); }
    );
}

function obtenerMovimientosCaja(turnoId, cb) {
    db.all('SELECT * FROM movimientos_caja WHERE turno_id = ? ORDER BY fecha ASC, id ASC', [turnoId], cb);
}

/** Anula (nunca borra): el movimiento queda visible y deja de contar en el cierre. */
function anularMovimientoCaja(id, anuladoPorNombre, motivoAnulacion, cb) {
    db.run(
        `UPDATE movimientos_caja
            SET anulado = 1,
                anulado_por_nombre = ?,
                anulado_at = datetime('now','localtime'),
                motivo_anulacion = ?
          WHERE id = ? AND anulado = 0`,
        [anuladoPorNombre || null, motivoAnulacion || null, id],
        function(err) {
            if (err) return cb(err);
            if (this.changes === 0) return cb(new Error('Movimiento no encontrado o ya anulado'));
            cb(null);
        }
    );
}

/** Suma los movimientos VIGENTES de un turno. `neto` = lo que le suman al esperado. */
function totalesMovimientosCaja(turnoId, cb) {
    db.get(`
        SELECT
            COALESCE(SUM(CASE WHEN tipo = 'deposito' THEN monto ELSE 0 END), 0) as total_depositos,
            COALESCE(SUM(CASE WHEN tipo = 'retiro'   THEN monto ELSE 0 END), 0) as total_retiros,
            COALESCE(SUM(CASE WHEN tipo = 'gasto'    THEN monto ELSE 0 END), 0) as total_gastos
        FROM movimientos_caja
        WHERE turno_id = ? AND anulado = 0
    `, [turnoId], (err, row) => {
        if (err) return cb(err);
        const t = row || { total_depositos: 0, total_retiros: 0, total_gastos: 0 };
        t.neto = t.total_depositos - t.total_retiros - t.total_gastos;
        cb(null, t);
    });
}

function cerrarTurno(id, efectivoContado, notas, cb) {
    db.get("SELECT * FROM turnos WHERE id = ?", [id], (err, turno) => {
        if (err || !turno) return cb(err || new Error('Turno no encontrado'));
        calcularTotalesTurno(turno.apertura, (err2, rows) => {
            if (err2) return cb(err2);
            const totales = rows[0];
            totalesMovimientosCaja(id, (err3, movs) => {
                if (err3) return cb(err3);
                // BLOQUE 7 — El efectivo que debe haber en el cajón cuenta también lo
                // que entró y salió por fuera de las ventas. Antes, cada gasto del
                // turno aparecía como un faltante.
                // BLOQUE 9 — La propina en EFECTIVO también está en el cajón: sin
                // sumarla, cada propina saldría como un SOBRANTE al contar el dinero.
                // La de tarjeta no entra (llega en la liquidación del banco).
                const efectivoEsperado = turno.fondo_inicial + totales.total_efectivo
                    + (totales.total_propinas_efectivo || 0) + movs.neto;
                const diferencia = efectivoContado - efectivoEsperado;
                db.run(
                    `UPDATE turnos SET
                        -- Hora LOCAL: 'apertura' se guarda con datetime('now','localtime'),
                        -- así que con CURRENT_TIMESTAMP (UTC) la duración del turno salía
                        -- desfasada tantas horas como el huso del negocio.
                        cierre = datetime('now','localtime'),
                        efectivo_contado = ?,
                        diferencia = ?,
                        total_pedidos = ?,
                        total_ventas = ?,
                        total_efectivo = ?,
                        total_tarjeta = ?,
                        total_transferencia = ?,
                        total_depositos = ?,
                        total_retiros = ?,
                        total_gastos = ?,
                        total_impuesto = ?,
                        total_propinas = ?,
                        total_propinas_efectivo = ?,
                        total_propinas_tarjeta = ?,
                        total_propinas_transferencia = ?,
                        notas = ?,
                        estado = 'cerrado'
                    WHERE id = ?`,
                    [efectivoContado, diferencia, totales.total_pedidos, totales.total_ventas,
                     totales.total_efectivo, totales.total_tarjeta, totales.total_transferencia,
                     movs.total_depositos, movs.total_retiros, movs.total_gastos,
                     totales.total_impuesto || 0,
                     totales.total_propinas || 0,
                     totales.total_propinas_efectivo || 0,
                     totales.total_propinas_tarjeta || 0,
                     totales.total_propinas_transferencia || 0,
                     notas, id],
                    cb
                );
            });
        });
    });
}

// ============================================
// SYNC — Funciones para sincronización con backend
// ============================================

// Wrapper: envuelve una operación de sync en una transacción SQLite.
// Si la operación falla, ROLLBACK deshace todos los cambios (DELETE + INSERT).
// Esto evita pérdida de datos si la inserción falla a mitad del proceso.
function syncConTransaccion(operacion, cb) {
    db.run('BEGIN TRANSACTION', (err) => {
        if (err) return cb(err);
        operacion((error) => {
            if (error) {
                db.run('ROLLBACK', () => cb(error));
            } else {
                db.run('COMMIT', cb);
            }
        });
    });
}

function syncClasificaciones(datos, cb) {
    if (!datos || datos.length === 0) return cb(null); // Sin datos: no borrar nada
    syncConTransaccion((done) => {
        db.serialize(() => {
            const stmt = db.prepare('INSERT OR REPLACE INTO clasificaciones (id, nombre, emoji, imagen, activa) VALUES (?, ?, ?, ?, ?)');
            datos.forEach(d => stmt.run(d.id, d.name, d.emoji || '📦', d.image || null, d.active ? 1 : 0));
            const placeholders = datos.map(() => '?').join(',');
            const ids = datos.map(d => d.id);
            stmt.finalize(() => db.run(`DELETE FROM clasificaciones WHERE id NOT IN (${placeholders})`, ids, done));
        });
    }, cb);
}

function syncProductos(datos, cb) {
    if (!datos || datos.length === 0) return cb(null); // Sin datos: no borrar nada
    syncConTransaccion((done) => {
        db.serialize(() => {
            const stmt = db.prepare('INSERT OR REPLACE INTO productos (id, nombre, descripcion, precio, stock, clasificacion_id, emoji, imagen, activo) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
            datos.forEach(d => stmt.run(
                d.id, d.name, d.description || null, d.price,
                d.stock || 0, d.category_id || null, d.emoji || null, d.image || null, d.active ? 1 : 0
            ));
            const placeholders = datos.map(() => '?').join(',');
            const ids = datos.map(d => d.id);
            stmt.finalize(() => db.run(`DELETE FROM productos WHERE id NOT IN (${placeholders})`, ids, done));
        });
    }, cb);
}

function syncClientes(datos, cb) {
    if (!datos || datos.length === 0) return cb(null); // Sin datos: no borrar nada
    syncConTransaccion((done) => {
        db.serialize(() => {
            datos.forEach(d => {
                // INSERT OR REPLACE sincroniza todos los datos del backend incluyendo puntos y fidelidad
                db.run(
                    'INSERT OR REPLACE INTO clientes (id, nombre, telefono, direccion, notas, puntos, en_fidelidad) VALUES (?, ?, ?, ?, ?, ?, ?)',
                    [d.id, d.name || null, d.phone || null, d.address || null, d.notes || null,
                     d.loyalty_points || 0, d.in_loyalty ? 1 : 0]
                );
            });
            const placeholders = datos.map(() => '?').join(',');
            const ids = datos.map(d => d.id);
            // Nunca eliminar clientes inscritos en fidelidad aunque no vengan del backend
            db.run(`DELETE FROM clientes WHERE en_fidelidad = 0 AND id NOT IN (${placeholders})`, ids, done);
        });
    }, cb);
}

function syncInsumos(datos, cb) {
    // Red de seguridad: tolerar respuestas paginadas ({ data, pagination }).
    // Si llega un objeto no-array, un forEach lanzaría dentro del callback de
    // SQLite y la promesa del IPC nunca respondería ("reply was never sent").
    if (datos && !Array.isArray(datos) && Array.isArray(datos.data)) datos = datos.data;
    if (!datos || datos.length === 0) return cb(null); // Sin datos: no borrar nada
    syncConTransaccion((done) => {
        db.serialize(() => {
            const stmt = db.prepare('INSERT OR REPLACE INTO insumos (id, nombre, unidad, stock_actual, stock_minimo, activo, tipo, contenido_cantidad, contenido_unidad, costo_unitario) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
            datos.forEach(d => stmt.run(
                d.id, d.name, d.unit, d.stock || 0, d.min_stock || 0,
                d.active ? 1 : 0, d.type || 'ingrediente', d.content_amount || null, d.content_unit || null,
                d.cost_per_unit || 0
            ));
            const placeholders = datos.map(() => '?').join(',');
            const ids = datos.map(d => d.id);
            stmt.finalize(() => db.run(`DELETE FROM insumos WHERE id NOT IN (${placeholders})`, ids, done));
        });
    }, cb);
}

function syncPreparaciones(datos, cb) {
    if (!datos || datos.length === 0) return cb(null); // Sin datos: no borrar nada
    syncConTransaccion((done) => {
        db.serialize(() => {
            // El rinde viene del backend (el mobile sí lo deja editar): sin él, el
            // desktop descontaría una cantidad y la nube otra.
            const stmtPrep = db.prepare('INSERT OR REPLACE INTO preparaciones (id, nombre, activo, rinde) VALUES (?, ?, ?, ?)');
            datos.forEach(d => stmtPrep.run(d.id, d.name, d.active ? 1 : 0, parseFloat(d.yield_quantity) > 0 ? parseFloat(d.yield_quantity) : 1));
            const placeholders = datos.map(() => '?').join(',');
            const ids = datos.map(d => d.id);
            stmtPrep.finalize(() => {
                // Cache de unidades previas para no perderlas si backend no trae unit_recipe
                db.all('SELECT preparacion_id, insumo_id, unidad_receta FROM preparacion_items', [], (err, rows) => {
                    const prevMap = new Map();
                    if (!err && rows) {
                        rows.forEach(r => prevMap.set(`${r.preparacion_id}:${r.insumo_id}`, r.unidad_receta));
                    }
                    // Borrar items de preparaciones que ya no existen
                    db.run(`DELETE FROM preparacion_items WHERE preparacion_id NOT IN (${placeholders})`, ids, () => {
                        // Reemplazar items de las preparaciones que sí vienen
                        datos.forEach(d => {
                            db.run('DELETE FROM preparacion_items WHERE preparacion_id = ?', [d.id]);
                            if (d.items && d.items.length > 0) {
                                const stmtItems = db.prepare('INSERT INTO preparacion_items (preparacion_id, insumo_id, cantidad, unidad_receta) VALUES (?, ?, ?, ?)');
                                d.items.forEach(item => {
                                    const fallbackUnit = prevMap.get(`${d.id}:${item.ingredient_id}`) || null;
                                    const unit = item.unit_recipe || fallbackUnit;
                                    stmtItems.run(d.id, item.ingredient_id, item.quantity, unit);
                                });
                                stmtItems.finalize();
                            }
                        });
                        db.run(`DELETE FROM preparaciones WHERE id NOT IN (${placeholders})`, ids, done);
                    });
                });
            });
        });
    }, cb);
}

function syncRecetasProducto(datos, cb) {
    if (!datos || datos.length === 0) return cb(null); // Sin datos: no borrar nada
    db.serialize(() => {
        // Transacción: si la inserción falla, el DELETE se deshace automáticamente.
        // A diferencia de las otras funciones sync que usan DELETE WHERE id NOT IN (...),
        // aquí se usa DELETE sin WHERE porque las recetas son datos derivados del backend
        // (no se crean localmente), así que siempre se reemplazan por completo.
        db.run('BEGIN TRANSACTION');
        db.run('DELETE FROM receta_items', (err) => {
            if (err) {
                return db.run('ROLLBACK', () => cb(err));
            }
            const stmt = db.prepare('INSERT INTO receta_items (producto_id, tipo, referencia_id, cantidad, unidad_receta) VALUES (?, ?, ?, ?, ?)');
            let insertError = null;
            datos.forEach(d => {
                const tipoLocal = d.item_type === 'ingredient' ? 'insumo' : 'preparacion';
                stmt.run(d.product_id, tipoLocal, d.item_id, d.quantity, d.unit_recipe || null, (e) => {
                    if (e && !insertError) insertError = e;
                });
            });
            stmt.finalize((err2) => {
                if (err2 || insertError) {
                    return db.run('ROLLBACK', () => cb(err2 || insertError));
                }
                db.run('COMMIT', cb);
            });
        });
    });
}

function syncDescuentos(datos, cb) {
    if (!datos || datos.length === 0) return cb(null); // Sin datos: no borrar nada
    syncConTransaccion((done) => {
        db.serialize(() => {
            const stmt = db.prepare('INSERT OR REPLACE INTO promociones (id, nombre, tipo, valor, activa, requires_pin) VALUES (?, ?, ?, ?, ?, ?)');
            datos.forEach(d => {
                const tipo = d.type === 'percentage' ? 'porcentaje' : 'monto_fijo';
                stmt.run(d.id, d.name, tipo, d.value, d.active ? 1 : 0, d.requires_pin ? 1 : 0);
            });
            const placeholders = datos.map(() => '?').join(',');
            const ids = datos.map(d => d.id);
            stmt.finalize(() => db.run(`DELETE FROM promociones WHERE id NOT IN (${placeholders})`, ids, done));
        });
    }, cb);
}

function syncCombos(datos, cb) {
    if (!datos || datos.length === 0) return cb(null); // Sin datos: no borrar nada
    syncConTransaccion((done) => {
        db.serialize(() => {
            const stmtCombo = db.prepare('INSERT OR REPLACE INTO combos (id, nombre, descripcion, precio_especial, activo) VALUES (?, ?, ?, ?, ?)');
            datos.forEach(d => stmtCombo.run(d.id, d.name, d.description || null, d.price, d.active ? 1 : 0));
            const placeholders = datos.map(() => '?').join(',');
            const ids = datos.map(d => d.id);
            stmtCombo.finalize(() => {
                db.run(`DELETE FROM combo_items WHERE combo_id NOT IN (${placeholders})`, ids, () => {
                    datos.forEach(d => {
                        db.run('DELETE FROM combo_items WHERE combo_id = ?', [d.id]);
                        if (d.items && d.items.length > 0) {
                            const stmtItems = db.prepare('INSERT INTO combo_items (combo_id, producto_id, cantidad) VALUES (?, ?, ?)');
                            d.items.forEach(item => stmtItems.run(d.id, item.product_id, item.quantity || 1));
                            stmtItems.finalize();
                        }
                    });
                    db.run(`DELETE FROM combos WHERE id NOT IN (${placeholders})`, ids, done);
                });
            });
        });
    }, cb);
}

function agregarInsumoConId(id, datos, cb) {
    db.run(
        `INSERT OR REPLACE INTO insumos (id, nombre, unidad, stock_actual, stock_minimo, activo, tipo, contenido_cantidad, contenido_unidad, costo_unitario) VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, ?)`,
        [id, datos.nombre, datos.unidad, datos.stock_actual || 0, datos.stock_minimo || 0,
         datos.tipo || 'ingrediente', datos.contenido_cantidad || null, datos.contenido_unidad || null,
         datos.costo_unitario || 0],
        cb
    );
}

function agregarPreparacionConId(id, datos, cb) {
    db.run(
        `INSERT OR REPLACE INTO preparaciones (id, nombre, descripcion, activo) VALUES (?, ?, ?, 1)`,
        [id, datos.nombre, datos.descripcion || null],
        cb
    );
}

function agregarDescuentoConId(id, datos, cb) {
    db.run(
        `INSERT OR REPLACE INTO promociones (id, nombre, tipo, valor, activa, requires_pin) VALUES (?, ?, ?, ?, 1, ?)`,
        [id, datos.nombre, datos.tipo, datos.valor, datos.requires_pin ? 1 : 0],
        cb
    );
}

function agregarComboConId(id, datos, cb) {
    db.run(
        `INSERT OR REPLACE INTO combos (id, nombre, descripcion, precio_especial, activo) VALUES (?, ?, ?, ?, 1)`,
        [id, datos.nombre, datos.descripcion || null, datos.precio_especial],
        cb
    );
}

// ============================================
// SISTEMA DE MESAS
// ============================================

function obtenerMesas(branchId, cb) {
    if (branchId) {
        db.all("SELECT * FROM mesas WHERE activa=1 AND (branch_id=? OR branch_id IS NULL) ORDER BY zona, nombre", [branchId], cb);
    } else {
        db.all("SELECT * FROM mesas WHERE activa=1 ORDER BY zona, nombre", cb);
    }
}

function crearMesa(nombre, zona, capacidad, branchId, cb) {
    db.run("INSERT INTO mesas (nombre, zona, capacidad, branch_id) VALUES (?, ?, ?, ?)",
        [nombre, zona || 'General', capacidad || 4, branchId || null], cb);
}

function actualizarMesa(id, nombre, zona, capacidad, cb) {
    db.run("UPDATE mesas SET nombre=?, zona=?, capacidad=? WHERE id=?",
        [nombre, zona, capacidad, id], cb);
}

function eliminarMesa(id, cb) {
    db.run("UPDATE mesas SET activa=0 WHERE id=?", [id], cb);
}

function obtenerPedidoAbiertoPorMesa(mesa_id, cb) {
    db.get(
        `SELECT p.*,
            GROUP_CONCAT(
                pi.id || '|' || pi.producto_id || '|' || pi.cantidad || '|' ||
                pi.precio_unitario || '|' || pi.subtotal || '|' || COALESCE(pi.nota_item, '') ||
                '|' || COALESCE(pr.nombre, 'Producto') ||
                -- Modificadores (BLOQUE 11). El JSON viaja con los DOS separadores
                -- de este formato escapados: una opción llamada "Mitad | mitad"
                -- partiría el renglón en dos y la mesa mostraría basura.
                --
                -- ⚠️ Los marcadores NO pueden contener '|' ni ';', o el escapado se
                -- come a sí mismo. Y el propio '~' se escapa PRIMERO para que el
                -- desescapado sea reversible; el renderer lo deshace en orden
                -- inverso (_parsearItemsMesa).
                '|' || REPLACE(REPLACE(REPLACE(COALESCE(pi.modificadores, ''),
                        '~', '~T~'), '|', '~P~'), ';', '~S~') ||
                -- Precio del catálogo antes de los extras. Es el que sube al
                -- backend: mandarle el precio ya con extras le haría sumar los
                -- deltas DOS veces. Un renglón anterior al bloque no lo tiene y
                -- cae al precio_unitario, que ahí es el precio base.
                '|' || COALESCE(pi.precio_base, pi.precio_unitario)
            , ';;') as items_raw
         FROM pedidos p
         LEFT JOIN pedido_items pi ON pi.pedido_id = p.id
         LEFT JOIN productos pr ON pr.id = pi.producto_id
         WHERE p.mesa_id=? AND p.estado='abierto'
         GROUP BY p.id`,
        [mesa_id], cb
    );
}

function abrirPedidoMesa(mesa_id, mesa_nombre, cajero, comensales, notas, impuesto, cb) {
    const infoCliente = mesa_nombre ? `Mesa: ${mesa_nombre}` : null;
    // Impuesto CONGELADO al abrir la mesa (BLOQUE 8): si el dueño cambia la tasa a
    // media comida, la cuenta que el cliente ya vio no se mueve. Sin esto, una
    // mesa en modo local se cobraba SIN impuesto mientras la venta de mostrador de
    // al lado sí lo llevaba.
    const tasa = parseFloat(impuesto?.tasa) || 0;
    const incluido = impuesto?.incluido ? 1 : 0;
    db.run(
        // fecha_pedido explícita en hora LOCAL: el DEFAULT de la columna es
        // CURRENT_TIMESTAMP (UTC) y dejaba la mesa "abierta hace 6 horas" en México,
        // además de mandar una hora equivocada al sincronizar. Todo el POS local
        // guarda y consulta en hora local (ver crearPedido y las stats con 'localtime').
        `INSERT INTO pedidos (mesa_id, total, subtotal, impuesto, tasa_impuesto, impuesto_incluido, estado, tipo_pedido, cajero, comensales, notas_generales, pendiente_sync, info_cliente_temp, fecha_pedido)
         VALUES (?, 0, 0, 0, ?, ?, 'abierto', 'mesa', ?, ?, ?, 0, ?, datetime('now','localtime'))`,
        [mesa_id, tasa, incluido, cajero, comensales || 0, notas || null, infoCliente],
        function(err) { cb(err, this?.lastID); }
    );
}

/**
 * Recalcula subtotal, impuesto y total de una mesa a partir de sus items y de la
 * tasa CONGELADA del pedido. Misma fórmula que utils/impuestos.js del backend y
 * modulo-impuestos.js del renderer (BLOQUE 8): si alguna se desvía, la cuenta que
 * ve el cliente y la que registra el sistema dejan de coincidir.
 */
function _recalcularTotalesMesa(pedido_id, cb) {
    db.get(
        `SELECT
            COALESCE(p.tasa_impuesto, 0)     AS tasa,
            COALESCE(p.impuesto_incluido, 0) AS incluido,
            (SELECT COALESCE(SUM(subtotal), 0) FROM pedido_items WHERE pedido_id = p.id) AS suma
         FROM pedidos p WHERE p.id = ?`,
        [pedido_id],
        (err, row) => {
            if (err || !row) return cb(err || null);
            const r2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
            const suma = r2(parseFloat(row.suma) || 0);
            const tasa = parseFloat(row.tasa) || 0;

            let subtotal = suma, impuesto = 0, total = suma;
            if (tasa > 0 && suma > 0) {
                if (row.incluido) {
                    impuesto = r2(suma - suma / (1 + tasa / 100));
                    subtotal = r2(suma - impuesto);
                    total    = suma;
                } else {
                    impuesto = r2(suma * tasa / 100);
                    subtotal = suma;
                    total    = r2(suma + impuesto);
                }
            }
            db.run(
                'UPDATE pedidos SET total = ?, subtotal = ?, impuesto = ? WHERE id = ?',
                [total, subtotal, impuesto, pedido_id], cb
            );
        }
    );
}

// `precio` llega YA con los extras sumados (BLOQUE 11), así que el recálculo de
// la mesa —que suma los `subtotal` de los renglones— cuadra sin tocarlo.
function agregarItemMesa(pedido_id, producto_id, cantidad, precio, nota, cb, modificadores, precioBase) {
    const modsJson = Array.isArray(modificadores) && modificadores.length
        ? JSON.stringify(modificadores)
        : null;
    db.run(
        `INSERT INTO pedido_items
            (pedido_id, producto_id, cantidad, precio_unitario, subtotal, nota_item, modificadores, precio_base)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
            pedido_id, producto_id, cantidad, precio, precio * cantidad, nota || null,
            modsJson,
            precioBase !== undefined && precioBase !== null ? precioBase : precio,
        ],
        function(err) {
            if (err) return cb(err);
            // Descontar insumos según la receta del producto (igual que en Nueva Venta)
            descontarInsumosDeVenta(producto_id, cantidad).catch(() => { /* ignorar: mantiene comportamiento fire-and-forget */ });
            aplicarRecetaModificadoresLocal(modificadores, cantidad, -1).catch(() => { /* ignorar, igual que arriba */ });
            _recalcularTotalesMesa(pedido_id, cb);
        }
    );
}

function eliminarItemMesa(item_id, pedido_id, cb) {
    // DEVOLVER LOS INSUMOS AL INVENTARIO.
    //
    // `agregarItemMesa` los descontó, así que quitar el renglón tiene que
    // devolverlos. Sin esto, un mesero que se equivoca de plato y lo quita deja
    // esos insumos descontados PARA SIEMPRE: el stock se va desviando en
    // silencio, un plato a la vez.
    //
    // El renglón se lee ANTES de borrarlo — después ya no habría de dónde sacar
    // el producto, la cantidad ni los modificadores.
    db.get(
        "SELECT producto_id, cantidad, modificadores FROM pedido_items WHERE id=?",
        [item_id],
        (errLectura, item) => {
            db.run("DELETE FROM pedido_items WHERE id=?", [item_id], (err) => {
                if (err) return cb(err);

                if (!errLectura && item) {
                    // Fire-and-forget, igual que al agregar: el inventario no debe
                    // impedir que la mesa se corrija.
                    restaurarInsumosDeVenta(item.producto_id, item.cantidad).catch(() => {});
                    // Y el ajuste de los extras (§32.6) con el signo invertido.
                    aplicarRecetaModificadoresLocal(item.modificadores, item.cantidad, +1).catch(() => {});
                }

                _recalcularTotalesMesa(pedido_id, cb);
            });
        }
    );
}

function cerrarPedidoMesa(pedido_id, metodo_pago, propina, propina_metodo, cb) {
    // La propina (BLOQUE 9) se decide AL COBRAR, no al abrir la mesa, así que se
    // escribe aquí. NO toca el total: la cuenta es lo que se consumió.
    db.run(
        // Hora LOCAL, igual que crearPedido. Con CURRENT_TIMESTAMP (UTC) la venta de
        // la mesa quedaba fechada horas en el futuro respecto al resto del día y
        // viajaba así al backend al sincronizar.
        "UPDATE pedidos SET estado='completado', metodo_pago=?, propina=?, propina_metodo=?, pendiente_sync=1, fecha_pedido=datetime('now','localtime') WHERE id=?",
        [metodo_pago, propina || 0, (propina > 0 ? (propina_metodo || metodo_pago) : null), pedido_id], cb
    );
}

function transferirMesa(pedido_id, nueva_mesa_id, cb) {
    db.run("UPDATE pedidos SET mesa_id=? WHERE id=?", [nueva_mesa_id, pedido_id], cb);
}

function actualizarNotasMesa(pedido_id, notas, cb) {
    db.run("UPDATE pedidos SET notas_generales=? WHERE id=?", [notas, pedido_id], cb);
}

function actualizarPuntosCliente(cliente_id, puntos_delta, cb) {
    db.run(
        "UPDATE clientes SET puntos = MAX(0, COALESCE(puntos, 0) + ?) WHERE id = ?",
        [puntos_delta, cliente_id],
        cb
    );
}

function toggleFidelidad(cliente_id, valor, cb) {
    db.run("UPDATE clientes SET en_fidelidad = ? WHERE id = ?", [valor, cliente_id], cb);
}

function obtenerClientesFidelidad(cb) {
    db.all("SELECT * FROM clientes WHERE en_fidelidad = 1 ORDER BY nombre ASC", [], cb);
}

function registrarLogDescuento(datos, cb) {
    db.run(
        "INSERT INTO log_descuentos (cajero, descuento_nombre, monto_descuento, total_antes) VALUES (?, ?, ?, ?)",
        [datos.cajero, datos.descuento_nombre, datos.monto_descuento, datos.total_antes],
        cb
    );
}

function obtenerLogDescuentos(limit, cb) {
    db.all("SELECT * FROM log_descuentos ORDER BY id DESC LIMIT ?", [limit || 50], cb);
}

function obtenerPedidosPendientes(cb) {
    db.all('SELECT * FROM pedidos WHERE pendiente_sync = 1 ORDER BY fecha_pedido ASC', [], cb);
}

function obtenerItemsPedido(pedidoId, cb) {
    db.all('SELECT * FROM pedido_items WHERE pedido_id = ?', [pedidoId], cb);
}

function marcarPedidoSincronizado(pedidoId, cb) {
    db.run('UPDATE pedidos SET pendiente_sync = 0 WHERE id = ?', [pedidoId], cb);
}

module.exports = {
    db, 
    obtenerProductosAgrupados, 
    obtenerClasificacionesRaw, 
    agregarClasificacion, 
    editarClasificacion, 
    eliminarClasificacion,
    agregarProducto, 
    actualizarProducto, 
    eliminarProducto, 
    obtenerOCrearCliente, 
    crearPedido, 
    obtenerPedidos, 
    obtenerDetallesPedido,
    actualizarEstadoPedido,
    obtenerEstadisticas: obtenerEstadisticasDashboard,
    obtenerEstadisticasDashboard,
    registrarMerma,
    obtenerClientes,
    buscarClientePorTelefono,
    actualizarCliente,
    obtenerEstadisticasClientes,
    crearCliente, 
    obtenerClientesConCompras,
    eliminarCliente,
    guardarAjuste,
    obtenerAjustes,
    obtenerInsumos,
    agregarInsumo,
    actualizarInsumo,
    eliminarInsumo,
    obtenerPreparaciones,
    agregarPreparacion,
    actualizarPreparacion,
    eliminarPreparacion,
    obtenerItemsPreparacion,
    guardarItemsPreparacion,
    obtenerRecetaProducto,
    eliminarRecetaProducto,
    guardarRecetaProducto,
    calcularStockPreparacion,
    calcularStockProducto,
    registrarEntradaInsumo,
    obtenerEntradasInsumo,   
    registrarSalidaInsumo,
    obtenerSalidasInsumo,
    obtenerDescuentos,
    agregarDescuento,
    actualizarDescuento,
    eliminarDescuento,
    eliminarDescuentoDefinitivo,
    obtenerCombos,
    agregarCombo,
    actualizarCombo,
    eliminarCombo,
    obtenerItemsCombo,
    guardarItemsCombo,     
    obtenerProductos: (cb) => db.all('SELECT * FROM productos WHERE activo = 1', cb),
    tienePasswordApp,
    verificarPasswordApp,
    establecerPasswordApp,
    abrirTurno,
    obtenerTurnoActivo,
    obtenerTurnos,
    calcularTotalesTurno,
    cerrarTurno,
    registrarMovimientoCaja,
    obtenerMovimientosCaja,
    anularMovimientoCaja,
    totalesMovimientosCaja,
    limpiarDatosLocales,
    limpiarAjustesCuenta,
    agregarInsumoConId,
    agregarPreparacionConId,
    agregarDescuentoConId,
    agregarComboConId,
    syncClasificaciones,
    syncProductos,
    syncClientes,
    syncInsumos,
    syncPreparaciones,
    syncRecetasProducto,
    syncDescuentos,
    syncCombos,
    obtenerPedidosPendientes,
    obtenerItemsPedido,
    obtenerPagosPedido,
    // Modificadores de producto (BLOQUE 11)
    guardarCatalogoModificadores,
    obtenerCatalogoModificadores,
    aplicarRecetaModificadoresLocal,
    // Inventario: la pareja descontar/restaurar de una receta (mismo signo que §32.6)
    restaurarInsumosDeVenta,
    marcarPedidoSincronizado,
    obtenerRentabilidad,
    calcularAlertas,
    syncPedidos,
    obtenerMesas,
    crearMesa,
    actualizarMesa,
    eliminarMesa,
    obtenerPedidoAbiertoPorMesa,
    abrirPedidoMesa,
    agregarItemMesa,
    eliminarItemMesa,
    cerrarPedidoMesa,
    transferirMesa,
    actualizarNotasMesa,
    actualizarPuntosCliente,
    toggleFidelidad,
    obtenerClientesFidelidad,
    registrarLogDescuento,
    obtenerLogDescuentos,
    obtenerDispositivosKDS,
    buscarDispositivoKDSPorSecreto,
    registrarDispositivoKDSPendiente,
    aprobarDispositivoKDSLocal,
    revocarDispositivoKDSLocal,
    tocarAccesoKDS,
    eliminarDispositivoKDS,
}

function syncPedidos(datos, cb) {
    // Si no hay datos, limpiar pedidos ya sincronizados (sucursal nueva sin historial)
    if (!datos || datos.length === 0) {
        return db.run(`DELETE FROM pedidos WHERE pendiente_sync = 0`, cb);
    }
    syncConTransaccion((done) => {
        db.serialize(() => {
            const stmtPedido = db.prepare(
                `INSERT OR IGNORE INTO pedidos
                 (id, cliente_id, total, estado, metodo_pago, tipo_pedido, referencia,
                  direccion_domicilio, link_maps, notas_generales, info_cliente_temp,
                  cajero, pendiente_sync, fecha_pedido)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`
            );
            const stmtItem = db.prepare(
                `INSERT OR IGNORE INTO pedido_items
                 (id, pedido_id, producto_id, cantidad, precio_unitario, subtotal, nota_item)
                 VALUES (?, ?, ?, ?, ?, ?, ?)`
            );
            datos.forEach(d => {
                stmtPedido.run(
                    d.id, d.customer_id || null, d.total, d.status || 'completado',
                    d.payment_method || null, d.order_type || 'comer', d.reference || null,
                    d.delivery_address || null, d.maps_link || null, d.notes || null,
                    d.customer_temp_info || null, null,
                    d.createdAt || null
                );
                if (d.items && d.items.length > 0) {
                    d.items.forEach(item => {
                        stmtItem.run(
                            item.id, item.order_id, item.product_id,
                            item.quantity, item.unit_price, item.subtotal, item.notes || null
                        );
                    });
                }
            });
            stmtPedido.finalize(() => stmtItem.finalize(() => {
                // Borrar pedidos viejos (ya sincronizados) que no vienen en los datos nuevos
                // pendiente_sync=1 = aún no subido, no borrar
                const ids = datos.map(d => d.id);
                const placeholders = ids.map(() => '?').join(',');
                db.run(`DELETE FROM pedidos WHERE pendiente_sync = 0 AND id NOT IN (${placeholders})`, ids, done);
            }));
        });
    }, cb);
}

function calcularAlertas(callback) {
    const alertas = [];
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    const hoyStr = hoy.toISOString().slice(0, 10);
    let pendientes = 5;

    function terminar() {
        pendientes--;
        if (pendientes === 0) callback(null, alertas);
    }

    // 1. Stock crítico
    db.all(`SELECT nombre, stock_actual as stock, stock_minimo FROM insumos WHERE activo = 1 AND stock_actual <= stock_minimo AND COALESCE(stock_minimo,0) > 0`, [], (err, rows) => {
        if (!err && rows) {
            rows.forEach(p => {
                if (p.stock <= 0) {
                    alertas.push({ tipo: 'stock', nivel: 'peligro', icono: '🔴', mensaje: `Sin stock: "${p.nombre}"` });
                } else {
                    alertas.push({ tipo: 'stock', nivel: 'advertencia', icono: '🟡', mensaje: `Stock bajo (${p.stock}): "${p.nombre}"` });
                }
            });
        }
        terminar();
    });

    // 2. Cancelaciones hoy
    db.all(`SELECT estado, COUNT(*) as cnt FROM pedidos WHERE fecha_pedido >= ? GROUP BY estado`, [hoyStr], (err, rows) => {
        if (!err && rows && rows.length > 0) {
            const total = rows.reduce((s, r) => s + r.cnt, 0);
            const cancelados = (rows.find(r => r.estado === 'cancelado') || {}).cnt || 0;
            const ratio = total > 0 ? cancelados / total : 0;
            if (ratio > 0.4) {
                alertas.push({ tipo: 'cancelaciones', nivel: 'peligro', icono: '🔴', mensaje: `Alta tasa de cancelaciones hoy: ${cancelados} de ${total} pedidos (${Math.round(ratio * 100)}%)` });
            } else if (ratio > 0.2) {
                alertas.push({ tipo: 'cancelaciones', nivel: 'advertencia', icono: '🟡', mensaje: `Cancelaciones elevadas hoy: ${cancelados} de ${total} pedidos (${Math.round(ratio * 100)}%)` });
            }
        }
        terminar();
    });

    // 3. Diferencia de caja en último turno cerrado
    db.get(`SELECT diferencia, cajero_nombre FROM turnos WHERE estado = 'cerrado' ORDER BY cierre DESC LIMIT 1`, [], (err, row) => {
        if (!err && row && row.diferencia != null) {
            const dif = parseFloat(row.diferencia);
            if (dif < -500) {
                alertas.push({ tipo: 'caja', nivel: 'peligro', icono: '🔴', mensaje: `Diferencia de caja alta: $${Math.abs(dif).toFixed(2)} faltante en turno de ${row.cajero_nombre || 'cajero'}` });
            } else if (dif < -100) {
                alertas.push({ tipo: 'caja', nivel: 'advertencia', icono: '🟡', mensaje: `Diferencia de caja: $${Math.abs(dif).toFixed(2)} faltante en turno de ${row.cajero_nombre || 'cajero'}` });
            }
        }
        terminar();
    });

    // 4. Ventas fuera de horario hoy (11pm–6am)
    db.get(`
        SELECT COUNT(*) as cnt FROM pedidos
        WHERE fecha_pedido >= ? AND (
            CAST(strftime('%H', fecha_pedido) AS INTEGER) >= 23 OR
            CAST(strftime('%H', fecha_pedido) AS INTEGER) < 6
        )
    `, [hoyStr], (err, row) => {
        if (!err && row && row.cnt > 0) {
            alertas.push({ tipo: 'horario', nivel: 'info', icono: '🔵', mensaje: `${row.cnt} venta(s) registradas fuera de horario habitual (11pm–6am)` });
        }
        terminar();
    });

    // 5. Descuentos aplicados hoy
    db.all(`SELECT cajero, descuento_nombre, monto_descuento FROM log_descuentos WHERE fecha >= ?`, [hoyStr], (err, rows) => {
        if (!err && rows && rows.length > 0) {
            rows.forEach(r => {
                alertas.push({ tipo: 'descuento', nivel: 'advertencia', icono: '🏷️', mensaje: `Descuento "${r.descuento_nombre}" (-$${parseFloat(r.monto_descuento || 0).toFixed(2)}) aplicado por ${r.cajero || 'cajero'}` });
            });
        }
        terminar();
    });
}

// ============================================
// KDS — DISPOSITIVOS DE CONFIANZA
// ============================================

function obtenerDispositivosKDS(cb) {
    db.all('SELECT * FROM kds_trusted_devices ORDER BY id DESC', cb);
}

/**
 * BUSCA POR SECRETO, no por IP (BLOQUE 13). Es la única forma de identificar de
 * verdad a una pantalla: la IP cambia sola y puede acabar en otro aparato.
 */
function buscarDispositivoKDSPorSecreto(secretHash, cb) {
    db.get('SELECT * FROM kds_trusted_devices WHERE secret_hash = ?', [secretHash], cb);
}

/** Una pantalla nueva se anota como PENDIENTE: registrada, pero sin ver nada. */
function registrarDispositivoKDSPendiente({ secretHash, ip, userAgent, nombre }, cb) {
    db.run(
        `INSERT INTO kds_trusted_devices (ip, user_agent, nombre, confianza, secret_hash, estado, fecha_conexion)
         VALUES (?, ?, ?, 0, ?, 'pendiente', datetime('now','localtime'))`,
        [ip || '', userAgent || '', nombre || 'Pantalla de cocina', secretHash],
        function (err) { cb(err, this ? this.lastID : null); }
    );
}

/**
 * Aprueba una pantalla y deja escrito QUIÉN lo hizo. Antes solo se guardaba la
 * IP y un nombre: si aparecía un equipo de más, no había forma de saber quién lo
 * había dejado entrar ni cuándo.
 */
function aprobarDispositivoKDSLocal({ id, nombre, aprobadoPorNombre, aprobadoPorRol }, cb) {
    db.run(
        `UPDATE kds_trusted_devices
            SET estado = 'activo', confianza = 1,
                nombre = COALESCE(NULLIF(?, ''), nombre),
                aprobado_por_nombre = ?, aprobado_por_rol = ?,
                aprobado_en = datetime('now','localtime')
          WHERE id = ?`,
        [nombre || '', aprobadoPorNombre || 'Sin identificar', aprobadoPorRol || '', id],
        function (err) { cb(err); }
    );
}

/**
 * Revocar (o rechazar). NO se borra la fila: el registro es la auditoría, igual
 * que con los movimientos de caja (§28.5). Quitarla de la lista es otra acción.
 */
function revocarDispositivoKDSLocal({ id, revocadoPorNombre }, cb) {
    db.run(
        `UPDATE kds_trusted_devices
            SET estado = 'revocado', confianza = 0,
                revocado_por_nombre = ?, revocado_en = datetime('now','localtime')
          WHERE id = ?`,
        [revocadoPorNombre || 'Sin identificar', id],
        function (err) { cb(err); }
    );
}

/** Informativo: "última conexión hace 3 min" ayuda a reconocer un equipo. */
function tocarAccesoKDS(id) {
    db.run("UPDATE kds_trusted_devices SET ultimo_acceso = datetime('now','localtime') WHERE id = ?", [id], () => {});
}

function eliminarDispositivoKDS(id, cb) {
    // Nunca se borra una pantalla ACTIVA: dejaría el equipo con acceso y sin
    // rastro de que alguna vez se le dio. Primero se revoca.
    db.run("DELETE FROM kds_trusted_devices WHERE id = ? AND estado != 'activo'", [id], function (err) {
        if (err) return cb(err);
        if (this.changes === 0) return cb(new Error('Revoca el dispositivo antes de quitarlo de la lista'));
        cb(null);
    });
}

function limpiarDatosLocales(cb) {
    const tablas = [
        'pedido_items', 'mermas', 'receta_items', 'combo_items',
        'preparacion_items', 'entradas_insumos', 'pedidos', 'clientes',
        'combos', 'preparaciones', 'insumos', 'promociones',
        'productos', 'clasificaciones'
    ];
    db.serialize(() => {
        db.run('PRAGMA foreign_keys = OFF');
        let pendientes = tablas.length;
        tablas.forEach(tabla => {
            db.run(`DELETE FROM ${tabla}`, () => {
                pendientes--;
                if (pendientes === 0) {
                    db.run('PRAGMA foreign_keys = ON');
                    if (cb) cb(null);
                }
            });
        });
    });
}

// Borra los ajustes de CUENTA (plan, negocio, permisos_roles, tokens, etc.) al
// cerrar sesión, conservando solo los de DISPOSITIVO: la URL del backend, la
// contraseña de bloqueo de la app y la configuración de impresora. Se usa una
// lista blanca (borrar todo lo demás) para que cualquier ajuste de cuenta nuevo
// se limpie solo, sin tener que actualizar esta función. currency_symbol se
// conserva porque es cosmético y NO se re-descarga del backend en el re-login.
// Los datos de cuenta (permisos_roles, plan, etc.) se restauran solos al iniciar
// sesión (sincronizarDesdeBackend baja /settings; el plan vuelve por el login).
function limpiarAjustesCuenta(cb) {
    db.run(
        `DELETE FROM ajustes
         WHERE clave NOT IN ('api_url', 'app_password', 'currency_symbol')
           AND clave NOT LIKE 'impresora%'`,
        (err) => { if (cb) cb(err); }
    );
}
