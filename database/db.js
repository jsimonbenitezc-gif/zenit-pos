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
    
  // 9. MIGRACIÓN AUTOMÁTICA: 
    const columnasNuevas = [
        "ALTER TABLE pedidos ADD COLUMN tipo_pedido TEXT DEFAULT 'comer'",
        "ALTER TABLE pedidos ADD COLUMN referencia TEXT",
        "ALTER TABLE pedidos ADD COLUMN direccion_domicilio TEXT",
        "ALTER TABLE pedidos ADD COLUMN link_maps TEXT"
    ];

// Migración: agregar campo para info de cliente temporal
    db.run("ALTER TABLE pedidos ADD COLUMN info_cliente_temp TEXT", () => {});

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
    obtenerProductos: (cb) => db.all('SELECT * FROM productos WHERE activo = 1', cb),
}