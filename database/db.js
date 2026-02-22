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
        activo INTEGER DEFAULT 1
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
    db.run("ALTER TABLE insumos ADD COLUMN tipo TEXT DEFAULT 'ingrediente'", () => {});
    db.run("ALTER TABLE insumos ADD COLUMN contenido_cantidad REAL", () => {});
    db.run("ALTER TABLE insumos ADD COLUMN contenido_unidad TEXT", () => {});
    db.run("ALTER TABLE receta_items ADD COLUMN unidad_receta TEXT", () => {});

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

function descontarInsumosDeVenta(productoId, cantidadVendida) {
    db.all("SELECT ri.*, i.unidad, i.contenido_cantidad, i.contenido_unidad FROM receta_items ri LEFT JOIN insumos i ON ri.tipo='insumo' AND ri.referencia_id=i.id WHERE ri.producto_id = ?", [productoId], (err, recetaItems) => {
        if (err || !recetaItems || recetaItems.length === 0) return;
        recetaItems.forEach(ri => {
            if (ri.tipo === 'insumo') {
                const cantConvertida = convertirUnidad(ri.cantidad, ri.unidad_receta, ri) * cantidadVendida;
                db.run("UPDATE insumos SET stock_actual = MAX(0, stock_actual - ?) WHERE id = ?",
                    [cantConvertida, ri.referencia_id]);
            } else if (ri.tipo === 'preparacion') {
                const cantPrep = ri.cantidad * cantidadVendida;
                db.all("SELECT pi.*, i.unidad, i.contenido_cantidad, i.contenido_unidad FROM preparacion_items pi JOIN insumos i ON pi.insumo_id=i.id WHERE pi.preparacion_id = ?",
                    [ri.referencia_id], (err, prepItems) => {
                        if (err || !prepItems) return;
                        prepItems.forEach(pi => {
                            const cantConvertida = convertirUnidad(pi.cantidad, pi.unidad_receta, pi) * cantPrep;
                            db.run("UPDATE insumos SET stock_actual = MAX(0, stock_actual - ?) WHERE id = ?",
                                [cantConvertida, pi.insumo_id]);
                        });
                    });
            }
        });
    });
}

// --- VENTAS Y PEDIDOS ---

function crearPedido(datos, items, callback) {
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
            fecha_pedido
        )
        VALUES (?, ?, 'registrado', ?, ?, ?, ?, ?, ?, ?, datetime('now','localtime'))
    `;

    db.run(sqlPedido, [
        datos.cliente_id, 
        datos.total, 
        datos.metodo_pago,
        datos.tipo_pedido,
        datos.referencia,
        datos.direccion_domicilio,
        datos.link_maps, 
        datos.notas_generales,
        datos.info_cliente_temp || null
    ], function(err) {
        if (err) return callback(err);
        
        const pedidoId = this.lastID;
        const stmt = db.prepare('INSERT INTO pedido_items (pedido_id, producto_id, cantidad, precio_unitario, subtotal, nota_item) VALUES (?, ?, ?, ?, ?, ?)');
        
        items.forEach(item => {
            stmt.run(pedidoId, item.id, item.cantidad, item.precio, item.subtotal, item.nota || '');
            db.run('UPDATE productos SET stock = stock - ? WHERE id = ?', [item.cantidad, item.id]);
            descontarInsumosDeVenta(item.id, item.cantidad);
        });
        
        stmt.finalize();
        callback(null, pedidoId);
    });
}

function obtenerPedidos(filtro, callback) {
    const sql = `
        SELECT 
            p.id, 
            CASE 
                WHEN c.nombre IS NOT NULL THEN c.nombre || ' - ' || c.telefono
                WHEN p.info_cliente_temp IS NOT NULL THEN p.info_cliente_temp
                ELSE 'General'
            END as telefono,
            p.total, 
            p.metodo_pago, 
            p.estado, 
            p.fecha_pedido as fecha 
        FROM pedidos p
        LEFT JOIN clientes c ON p.cliente_id = c.id
        ORDER BY p.id DESC
    `;
    db.all(sql, [], callback);
}

function obtenerDetallesPedido(pedidoId, callback) {
    const sql = `
        SELECT 
            pi.cantidad, 
            pi.subtotal AS precio, 
            pi.nota_item AS nota, 
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
            COALESCE(AVG(total), 0) as ticket_promedio
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
                        FROM productos 
                        WHERE stock < 10 AND activo = 1
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
    db.run("INSERT INTO insumos (nombre, unidad, stock_actual, stock_minimo, contenido_cantidad, contenido_unidad) VALUES (?, ?, ?, ?, ?, ?)",
        [d.nombre, d.unidad, d.stock_actual || 0, d.stock_minimo || 0, d.contenido_cantidad || null, d.contenido_unidad || null], cb);
}
function actualizarInsumo(id, d, cb) {
    db.run("UPDATE insumos SET nombre=?, unidad=?, stock_actual=?, stock_minimo=?, contenido_cantidad=?, contenido_unidad=? WHERE id=?",
        [d.nombre, d.unidad, d.stock_actual, d.stock_minimo, d.contenido_cantidad || null, d.contenido_unidad || null, id], cb);
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
        const stmt = db.prepare("INSERT INTO preparacion_items (preparacion_id, insumo_id, cantidad) VALUES (?, ?, ?)");
        items.forEach(item => stmt.run(preparacionId, item.insumo_id, item.cantidad));
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
function guardarRecetaProducto(productoId, items, cb) {
    db.run("DELETE FROM receta_items WHERE producto_id = ?", [productoId], (err) => {
        if (err) return cb(err);
        if (!items || items.length === 0) return cb(null);
        const stmt = db.prepare("INSERT INTO receta_items (producto_id, tipo, referencia_id, cantidad) VALUES (?, ?, ?, ?)");
        items.forEach(item => stmt.run(productoId, item.tipo, item.referencia_id, item.cantidad));
        stmt.finalize(cb);
    });
}

// Calcula cuántas "porciones" de una preparación se pueden hacer con el stock actual
function calcularStockPreparacion(preparacionId, callback) {
    db.all(`SELECT pi.cantidad, i.stock_actual 
            FROM preparacion_items pi 
            JOIN insumos i ON pi.insumo_id = i.id 
            WHERE pi.preparacion_id = ?`, [preparacionId], (err, items) => {
        if (err || !items || items.length === 0) return callback(null, null);
        let min = Infinity;
        items.forEach(item => {
            const posible = item.stock_actual / item.cantidad;
            if (posible < min) min = posible;
        });
        callback(null, min === Infinity ? 0 : Math.floor(min * 100) / 100);
    });
}

// Calcula cuántas unidades de un producto se pueden preparar según sus insumos
function calcularStockProducto(productoId, callback) {
    db.all("SELECT ri.*, i.unidad, i.stock_actual as ins_stock, i.contenido_cantidad, i.contenido_unidad FROM receta_items ri LEFT JOIN insumos i ON ri.tipo='insumo' AND ri.referencia_id=i.id WHERE ri.producto_id = ?", [productoId], (err, recetaItems) => {
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
                db.all(`SELECT pi.cantidad, i.stock_actual 
                        FROM preparacion_items pi 
                        JOIN insumos i ON pi.insumo_id = i.id 
                        WHERE pi.preparacion_id = ?`, [ri.referencia_id], (err, prepItems) => {
                    if (!err && prepItems && prepItems.length > 0) {
                        let minPrep = Infinity;
                        prepItems.forEach(pi => {
                            const dp = pi.stock_actual / pi.cantidad;
                            if (dp < minPrep) minPrep = dp;
                        });
                        const posible = Math.floor(minPrep / ri.cantidad);
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
            db.run("UPDATE insumos SET stock_actual = stock_actual + ? WHERE id = ?",
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
            db.run("UPDATE insumos SET stock_actual = MAX(0, stock_actual - ?) WHERE id = ?",
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
    db.run("INSERT INTO promociones (nombre, tipo, valor) VALUES (?, ?, ?)",
        [d.nombre, d.tipo, d.valor], cb);
}
function actualizarDescuento(id, d, cb) {
    db.run("UPDATE promociones SET nombre=?, tipo=?, valor=? WHERE id=?",
        [d.nombre, d.tipo, d.valor, id], cb);
}
function eliminarDescuento(id, cb) {
    db.run("UPDATE promociones SET activa = 0 WHERE id = ?", [id], cb);
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
    obtenerCombos,
    agregarCombo,
    actualizarCombo,
    eliminarCombo,
    obtenerItemsCombo,
    guardarItemsCombo,     
    obtenerProductos: (cb) => db.all('SELECT * FROM productos WHERE activo = 1', cb),
}