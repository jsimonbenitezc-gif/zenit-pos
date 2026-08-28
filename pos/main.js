// ============================================
// MAIN.JS - PROCESO PRINCIPAL (FIX DE RUTAS)
// ============================================
const { app, BrowserWindow, ipcMain, dialog, safeStorage } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');
const fs = require('fs');
const db = require('../database/db');
const { crearBackup, listarBackups, restaurarBackup } = require('./backup');

let mainWindow;

// ============================================
// CONFIGURACIÓN DE ACTUALIZACIONES AUTOMÁTICAS
// ============================================

// Configurar para desarrollo (desactiva actualizaciones en dev)
autoUpdater.autoDownload = false;
autoUpdater.autoInstallOnAppQuit = true;

// Logs para debugging
autoUpdater.logger = require('electron-log');
autoUpdater.logger.transports.file.level = 'info';

// Eventos del actualizador
autoUpdater.on('checking-for-update', () => {
    console.log('🔍 Verificando actualizaciones...');
});

autoUpdater.on('update-available', (info) => {
    console.log('✅ Actualización disponible:', info.version);
    mainWindow.webContents.send('update-available', info);
});

autoUpdater.on('update-not-available', () => {
    console.log('✅ El software está actualizado');
});

autoUpdater.on('error', (err) => {
    console.error('❌ Error en actualización:', err);
});

autoUpdater.on('download-progress', (progressObj) => {
    mainWindow.webContents.send('download-progress', progressObj);
});

autoUpdater.on('update-downloaded', (info) => {
    console.log('✅ Actualización descargada');
    mainWindow.webContents.send('update-downloaded', info);
});

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1300,
        height: 850,
        icon: path.join(__dirname, 'graficos', 'zenitMontaña.ico'),
        webPreferences: {
            // Buscamos preload.js en la misma carpeta que main.js
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
            // Sin DevTools en producción: evita que un empleado invoque
            // window.api.* directamente desde la consola.
            devTools: !app.isPackaged
        }
    });
    // FIX AQUÍ: Forzamos a que busque index.html en la carpeta del script
    mainWindow.loadFile(path.join(__dirname, 'index.html'));
    mainWindow.maximize(); // Abre la ventana maximizada por defecto

    // Notificar al renderer cuando la ventana recupera el foco
    // (útil para refrescar el plan después de Stripe Checkout en el navegador)
    mainWindow.on('focus', () => {
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('window-focused');
        }
    });
}

app.whenReady().then(() => {
    createWindow();

// Backup automático al iniciar la app
    crearBackup().catch(err => console.error('Error en backup automático:', err));

    // Red de seguridad para el equipo que nunca se apaga: sin esto, un POS abierto
    // toda la semana se quedaba con UN solo respaldo, el del día que lo encendieron.
    // El respaldo "de verdad" es el de cerrar turno (fin del día); este cubre al
    // negocio que no cierra caja o que deja la caja abierta varios días.
    const HORAS_ENTRE_RESPALDOS = 12;
    setInterval(() => {
        crearBackup().catch(err => console.error('Error en backup periódico:', err));
    }, HORAS_ENTRE_RESPALDOS * 60 * 60 * 1000);
    
    if (app.isPackaged) {
        setTimeout(() => {
            autoUpdater.checkForUpdates();
        }, 3000);
    }
});

// ============================================
// HANDLERS DE ACTUALIZACIÓN
// ============================================

ipcMain.handle('check-for-updates', async () => {
    if (!app.isPackaged) {
        return { available: false, message: 'Modo desarrollo' };
    }
    const result = await autoUpdater.checkForUpdates();
    return result;
});

ipcMain.handle('download-update', async () => {
    await autoUpdater.downloadUpdate();
});

ipcMain.handle('install-update', () => {
    autoUpdater.quitAndInstall(false, true);
});

ipcMain.handle('get-app-version', () => {
    return app.getVersion();
});

// ============================================
// CANALES IPC
// ============================================

ipcMain.handle('obtener-productos-agrupados', async () => {
    return await db.obtenerProductosAgrupados();
});

ipcMain.handle('obtener-pedidos', async (event, filtro) => {
    return new Promise((resolve, reject) => {
        // Llamamos a la función de la base de datos que ya tienes configurada
        db.obtenerPedidos(filtro, (err, rows) => {
            if (err) {
                console.error("Error en DB al obtener pedidos:", err);
                reject(err);
            } else {
                resolve(rows);
            }
        });
    });
});

ipcMain.handle('obtener-detalle-pedido', async (event, pedidoId) => {
    return new Promise((resolve, reject) => {
        // Esta función busca los productos asociados al ID del pedido
        db.obtenerDetallesPedido(pedidoId, (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });
});

ipcMain.handle('obtener-clasificaciones-raw', async () => {
    return new Promise((res, rej) => db.obtenerClasificacionesRaw((err, rows) => err ? rej(err) : res(rows)));
});

// Helper: verificar si el rol activo tiene permiso para gestionar el catálogo
// (productos y clasificaciones). 'dueno' y 'encargado' pasan siempre; los puestos
// personalizados sólo si su configuración incluye ver_productos.
function verificarPermisoAdmin() {
    if (rolActivoEnMain === 'dueno' || rolActivoEnMain === 'encargado') return;
    if (permisosRolActivoEnMain?.ver_productos === true) return;
    throw new Error('Permiso denegado: el perfil actual no puede realizar esta acción.');
}

// Helper: operaciones que sólo el dueño puede ejecutar (borrar datos, contraseña de la app).
function verificarPermisoDueno() {
    if (rolActivoEnMain !== 'dueno') {
        throw new Error('Permiso denegado: sólo el administrador puede realizar esta acción.');
    }
}

ipcMain.handle('agregar-producto', async (_, p) => {
    verificarPermisoAdmin();
    return new Promise((res, rej) => db.agregarProducto(p, (err) => err ? rej(err) : res(true)));
});

ipcMain.handle('actualizar-producto', async (_, id, p) => {
    verificarPermisoAdmin();
    return new Promise((res, rej) => db.actualizarProducto(id, p, (err) => err ? rej(err) : res(true)));
});

ipcMain.handle('eliminar-producto', async (_, id) => {
    verificarPermisoAdmin();
    return new Promise((res, rej) => db.eliminarProducto(id, (err) => err ? rej(err) : res(true)));
});

ipcMain.handle('agregar-clasificacion', async (_, datos) => {
    verificarPermisoAdmin();
    return new Promise((resolve, reject) => {
        db.agregarClasificacion(datos, (err) => {
            if (err) reject(err);
            else resolve(true);
        });
    });
});

ipcMain.handle('editar-clasificacion', async (_, datos) => {
    verificarPermisoAdmin();
    return new Promise((resolve, reject) => {
        db.editarClasificacion(datos, (err) => {
            if (err) reject(err);
            else resolve(true);
        });
    });
});

ipcMain.handle('eliminar-clasificacion', async (_, id) => {
    verificarPermisoAdmin();
    return new Promise((resolve, reject) => {
        db.eliminarClasificacion(id, (err) => {
            if (err) reject(err);
            else resolve(true);
        });
    });
});

// ✅ VERSIÓN CORREGIDA - Solo una vez, con el parámetro metodoPago
ipcMain.handle('crear-pedido', async (_, telefono, items, total, metodoPago) => {
    return new Promise((resolve, reject) => {
        db.obtenerOCrearCliente(telefono, (err, cliente) => {
            if (err) return reject(err);
            
            const datosPedido = {
                cliente_id: cliente.id,
                total: total,
                metodo_pago: metodoPago || 'efectivo', // Usamos el que viene del modal
                notas_generales: ''
            };
            
            const itemsParaDB = items.map(i => ({
                id: i.id,
                cantidad: 1,
                precio: i.precio,
                subtotal: i.precio,
                nota: i.nota || ''
            }));
            
            db.crearPedido(datosPedido, itemsParaDB, (err, pedidoId) => {
                if (err) reject(err);
                else resolve(pedidoId);
            });
        });
    });
});

// Nueva versión que NO crea clientes automáticamente
ipcMain.handle('crear-pedido-directo', async (_, datosPedido, items, opciones) => {
    return new Promise((resolve, reject) => {
        db.crearPedido(datosPedido, items, (err, pedidoId) => {
            if (err) reject(err);
            else resolve(pedidoId);
        }, opciones);
    });
});

// BLOQUE 12 — Rentabilidad calculada en la base LOCAL. La usa el desktop en
// modo local y cuando no hay internet: si el reporte solo viviera en la nube,
// la caja se quedaría sin él justo el día que se cae la conexión.
ipcMain.handle('obtener-rentabilidad', async (_e, opciones) => {
    return new Promise((res, rej) => db.obtenerRentabilidad(opciones || {}, (err, r) => err ? rej(err) : res(r)));
});

ipcMain.handle('obtener-estadisticas', async () => {
    return new Promise((res, rej) => db.obtenerEstadisticas((err, stats) => err ? rej(err) : res(stats)));
});

ipcMain.handle('seleccionar-imagen', async () => {
    const result = await dialog.showOpenDialog({
        properties: ['openFile'],
        filters: [{ name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'gif', 'webp'] }]
    });
    
    if (result.canceled || result.filePaths.length === 0) {
        return null;
    }
    
    const rutaOriginal = result.filePaths[0];
    const extension = path.extname(rutaOriginal);
    const nombreUnico = `img_${Date.now()}${extension}`;
    
    // Crear carpeta de imágenes si no existe
    const userDataPath = app.getPath('userData');
    const carpetaImagenes = path.join(userDataPath, 'imagenes');
    
    if (!fs.existsSync(carpetaImagenes)) {
        fs.mkdirSync(carpetaImagenes, { recursive: true });
    }
    
    // Copiar imagen a la carpeta del proyecto
    const rutaDestino = path.join(carpetaImagenes, nombreUnico);
    
    try {
        fs.copyFileSync(rutaOriginal, rutaDestino);
        return rutaDestino; // Devolver la nueva ruta
    } catch (error) {
        console.error('Error al copiar imagen:', error);
        return null;
    }
});

// Selección de imagen como data URI (base64). El renderer la comprime con
// canvas y la guarda en la nube para que sea visible en todos los dispositivos.
ipcMain.handle('seleccionar-imagen-datauri', async () => {
    const result = await dialog.showOpenDialog({
        properties: ['openFile'],
        filters: [{ name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'gif', 'webp'] }]
    });
    if (result.canceled || result.filePaths.length === 0) return null;

    const ruta = result.filePaths[0];
    try {
        const stats = fs.statSync(ruta);
        if (stats.size > 15 * 1024 * 1024) {
            return { error: 'La imagen es demasiado grande (máximo 15 MB).' };
        }
        const ext = path.extname(ruta).toLowerCase().replace('.', '');
        const mime = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp' }[ext] || 'image/png';
        const base64 = fs.readFileSync(ruta).toString('base64');
        return { dataUri: `data:${mime};base64,${base64}` };
    } catch (e) {
        console.error('Error leyendo imagen:', e);
        return { error: 'No se pudo leer la imagen.' };
    }
});

// Lee una imagen local guardada previamente (rutas legacy) como data URI,
// para poder migrarla a la nube al editar el producto/categoría.
ipcMain.handle('leer-imagen-datauri', async (_, ruta) => {
    try {
        if (typeof ruta !== 'string' || !ruta) return null;
        // Sólo permitir lecturas dentro de la carpeta de imágenes de la app
        const carpetaImagenes = path.join(app.getPath('userData'), 'imagenes');
        const normalizada = path.resolve(ruta);
        if (!normalizada.startsWith(carpetaImagenes)) return null;
        if (!fs.existsSync(normalizada)) return null;
        const ext = path.extname(normalizada).toLowerCase().replace('.', '');
        const mime = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp' }[ext] || 'image/png';
        return `data:${mime};base64,${fs.readFileSync(normalizada).toString('base64')}`;
    } catch (e) {
        return null;
    }
});

ipcMain.handle('obtener-clientes', async () => {
    return new Promise((resolve, reject) => {
        db.obtenerClientes((err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });
});

ipcMain.handle('obtener-estadisticas-clientes', async () => {
    return new Promise((resolve, reject) => {
        db.obtenerEstadisticasClientes((err, stats) => {
            if (err) reject(err);
            else resolve(stats);
        });
    });
});

ipcMain.handle('obtener-clientes-con-compras', async () => {
    return new Promise((resolve, reject) => {
        db.obtenerClientesConCompras((err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });
});

ipcMain.handle('actualizar-cliente', async (_, id, datos) => {
    return new Promise((resolve, reject) => {
        db.actualizarCliente(id, datos, (err) => {
            if (err) reject(err);
            else resolve(true);
        });
    });
});

ipcMain.handle('eliminar-cliente', async (_, id) => {
    return new Promise((resolve, reject) => {
        db.eliminarCliente(id, (err) => {
            if (err) reject(err);
            else resolve(true);
        });
    });
});

ipcMain.handle('actualizar-estado-pedido', async (_, id, estado) => {
    return new Promise((resolve, reject) => {
        db.actualizarEstadoPedido(id, estado, (err) => {
            if (err) reject(err);
            else resolve(true);
        });
    });
});

ipcMain.handle('crear-cliente', async (_, datos) => {
    return new Promise((resolve, reject) => {
        db.crearCliente(datos, (err) => {
            if (err) reject(err);
            else resolve(true);
        });
    });
});

// Manejo de Ajustes
ipcMain.handle('guardar-ajuste', async (_, clave, valor) => {
    return new Promise((resolve, reject) => {
        db.guardarAjuste(clave, valor, (err) => {
            if (err) reject(err);
            else resolve(true);
        });
    });
});

ipcMain.handle('obtener-ajustes', async () => {
    return new Promise((resolve, reject) => {
        db.obtenerAjustes((err, ajustes) => {
            if (err) reject(err);
            else resolve(ajustes);
        });
    });
});

// Obtener impresoras del sistema
ipcMain.handle('obtener-impresoras', async () => {
    return await mainWindow.webContents.getPrintersAsync();
});

// ============================================
// INVENTARIO — HANDLERS
// ============================================

ipcMain.handle('obtener-insumos', async () => {
    return new Promise((res, rej) => db.obtenerInsumos((err, rows) => err ? rej(err) : res(rows)));
});
ipcMain.handle('agregar-insumo', async (_, d) => {
    return new Promise((res, rej) => db.agregarInsumo(d, (err) => err ? rej(err) : res(true)));
});
ipcMain.handle('actualizar-insumo', async (_, id, d) => {
    return new Promise((res, rej) => db.actualizarInsumo(id, d, (err) => err ? rej(err) : res(true)));
});
ipcMain.handle('eliminar-insumo', async (_, id) => {
    return new Promise((res, rej) => db.eliminarInsumo(id, (err) => err ? rej(err) : res(true)));
});
ipcMain.handle('obtener-preparaciones', async () => {
    return new Promise((res, rej) => db.obtenerPreparaciones((err, rows) => err ? rej(err) : res(rows)));
});
ipcMain.handle('agregar-preparacion', async (_, d) => {
    return new Promise((res, rej) => db.agregarPreparacion(d, (err) => err ? rej(err) : res(true)));
});
ipcMain.handle('actualizar-preparacion', async (_, id, d) => {
    return new Promise((res, rej) => db.actualizarPreparacion(id, d, (err) => err ? rej(err) : res(true)));
});
ipcMain.handle('eliminar-preparacion', async (_, id) => {
    return new Promise((res, rej) => db.eliminarPreparacion(id, (err) => err ? rej(err) : res(true)));
});
ipcMain.handle('obtener-items-preparacion', async (_, id) => {
    return new Promise((res, rej) => db.obtenerItemsPreparacion(id, (err, rows) => err ? rej(err) : res(rows)));
});
ipcMain.handle('guardar-items-preparacion', async (_, id, items) => {
    return new Promise((res, rej) => db.guardarItemsPreparacion(id, items, (err) => err ? rej(err) : res(true)));
});
ipcMain.handle('obtener-receta-producto', async (_, id) => {
    return new Promise((res, rej) => db.obtenerRecetaProducto(id, (err, rows) => err ? rej(err) : res(rows)));
});
ipcMain.handle('guardar-receta-producto', async (_, id, items) => {
    return new Promise((res, rej) => db.guardarRecetaProducto(id, items, (err) => err ? rej(err) : res(true)));
});
ipcMain.handle('eliminar-receta-producto', async (_, id) => db.eliminarRecetaProducto(id));

ipcMain.handle('calcular-stock-preparacion', async (_, id) => {
    return new Promise((res, rej) => db.calcularStockPreparacion(id, (err, stock) => err ? rej(err) : res(stock)));
});
ipcMain.handle('calcular-stock-producto', async (_, id) => {
    return new Promise((res, rej) => db.calcularStockProducto(id, (err, stock) => err ? rej(err) : res(stock)));
});
ipcMain.handle('registrar-entrada-insumo', async (_, datos) => {
    return new Promise((res, rej) => db.registrarEntradaInsumo(datos, (err) => err ? rej(err) : res(true)));
});
ipcMain.handle('obtener-entradas-insumo', async (_, id) => {
    return new Promise((res, rej) => db.obtenerEntradasInsumo(id, (err, rows) => err ? rej(err) : res(rows)));
});

ipcMain.handle('registrar-salida-insumo', async (_, datos) => {
    return new Promise((res, rej) => db.registrarSalidaInsumo(datos, (err) => err ? rej(err) : res(true)));
});
ipcMain.handle('obtener-salidas-insumo', async (_, id) => {
    return new Promise((res, rej) => db.obtenerSalidasInsumo(id, (err, rows) => err ? rej(err) : res(rows)));
});

// ============================================
// OFERTAS — HANDLERS
// ============================================
ipcMain.handle('obtener-descuentos', async () => {
    return new Promise((res, rej) => db.obtenerDescuentos((err, rows) => err ? rej(err) : res(rows)));
});
ipcMain.handle('agregar-descuento', async (_, d) => {
    return new Promise((res, rej) => db.agregarDescuento(d, (err) => err ? rej(err) : res(true)));
});
ipcMain.handle('actualizar-descuento', async (_, id, d) => {
    return new Promise((res, rej) => db.actualizarDescuento(id, d, (err) => err ? rej(err) : res(true)));
});
ipcMain.handle('eliminar-descuento', async (_, id) => {
    return new Promise((res, rej) => db.eliminarDescuento(id, (err) => err ? rej(err) : res(true)));
});
ipcMain.handle('eliminar-descuento-definitivo', async (_, id) => {
    return new Promise((res, rej) => db.eliminarDescuentoDefinitivo(id, (err) => err ? rej(err) : res(true)));
});
ipcMain.handle('obtener-combos', async () => {
    return new Promise((res, rej) => db.obtenerCombos((err, rows) => err ? rej(err) : res(rows)));
});
ipcMain.handle('agregar-combo', async (_, d) => {
    return new Promise((res, rej) => db.agregarCombo(d, (err, id) => err ? rej(err) : res(id)));
});
ipcMain.handle('actualizar-combo', async (_, id, d) => {
    return new Promise((res, rej) => db.actualizarCombo(id, d, (err) => err ? rej(err) : res(true)));
});
ipcMain.handle('eliminar-combo', async (_, id) => {
    return new Promise((res, rej) => db.eliminarCombo(id, (err) => err ? rej(err) : res(true)));
});
ipcMain.handle('obtener-items-combo', async (_, id) => {
    return new Promise((res, rej) => db.obtenerItemsCombo(id, (err, rows) => err ? rej(err) : res(rows)));
});
ipcMain.handle('guardar-items-combo', async (_, id, items) => {
    return new Promise((res, rej) => db.guardarItemsCombo(id, items, (err) => err ? rej(err) : res(true)));
});

ipcMain.handle('crear-backup-manual', async () => {
    try {
        await crearBackup();
        const backups = listarBackups();
        return { ok: true, total: backups.length, ultimo: backups[0] || null };
    } catch(e) {
        return { ok: false, error: e.message };
    }
});

ipcMain.handle('listar-backups', async () => {
    try {
        return listarBackups();
    } catch(e) {
        return [];
    }
});

// Restaurar un respaldo. Es una acción de DUEÑO: reemplaza toda la base local
// (ventas, turnos, inventario) del equipo. Antes de pisarla se guarda una copia
// de lo que hay ahora, y al terminar la app se reinicia porque la conexión SQLite
// queda cerrada y los módulos tendrían datos viejos en memoria.
ipcMain.handle('restaurar-backup', async (_, nombre) => {
    try {
        verificarPermisoDueno();
        const resultado = await restaurarBackup(nombre);
        // Margen para que el renderer alcance a mostrar el aviso antes del reinicio.
        setTimeout(() => { app.relaunch(); app.exit(0); }, 1200);
        return { ok: true, ...resultado };
    } catch (e) {
        return { ok: false, error: e.message };
    }
});

ipcMain.handle('obtener-ruta-backups', async () => {
    const { app } = require('electron');
    const path = require('path');
    return path.join(app.getPath('userData'), 'backups');
});

ipcMain.handle('abrir-carpeta-backups', async () => {
    const { shell } = require('electron');
    const path = require('path');
    const { app } = require('electron');
    const ruta = path.join(app.getPath('userData'), 'backups');
    shell.openPath(ruta);
});

// IMPRESIÓN DIRECTA — Sin ventana emergente
ipcMain.handle('imprimir-ticket', async (event, htmlContent, nombreImpresora) => {
    return new Promise((resolve) => {
        const tempPath = path.join(app.getPath('temp'), 'zenit-ticket-' + Date.now() + '.html');
        fs.writeFileSync(tempPath, htmlContent, 'utf8');

        const printWindow = new BrowserWindow({
            show: false,
            webPreferences: { nodeIntegration: false, contextIsolation: true }
        });

        printWindow.loadFile(tempPath);

        printWindow.webContents.on('did-finish-load', () => {
            setTimeout(() => {
                printWindow.webContents.print({
                    silent: !!nombreImpresora,
                    printBackground: true,
                    deviceName: nombreImpresora || '',
                    margins: { marginType: 'printableArea' }
                }, (success, reason) => {
                    printWindow.destroy();
                    try { fs.unlinkSync(tempPath); } catch (e) {}
                    resolve({ success, reason: reason || '' });
                });
            }, 500);
        });

        printWindow.webContents.on('did-fail-load', () => {
            printWindow.destroy();
            try { fs.unlinkSync(tempPath); } catch (e) {}
            resolve({ success: false, reason: 'load-failed' });
        });
    });
});

// LOGIN — Contraseña de acceso al app
ipcMain.handle('tiene-password-app', () => {
    return new Promise((resolve) => {
        db.tienePasswordApp((err, tiene) => resolve(tiene));
    });
});

ipcMain.handle('verificar-password-app', (event, password) => {
    return new Promise((resolve) => {
        db.verificarPasswordApp(password, (err, valido) => resolve(valido));
    });
});

ipcMain.handle('establecer-password-app', (event, password) => {
    verificarPermisoDueno();
    return new Promise((resolve) => {
        db.establecerPasswordApp(password, (err) => resolve(!err));
    });
});

ipcMain.handle('limpiar-datos-locales', () => {
    verificarPermisoDueno();
    return new Promise((resolve) => {
        db.limpiarDatosLocales((err) => resolve(!err));
    });
});

// Borra los ajustes de cuenta al cerrar sesión (conserva los de dispositivo).
ipcMain.handle('limpiar-ajustes-cuenta', () => {
    return new Promise((resolve) => {
        db.limpiarAjustesCuenta((err) => resolve(!err));
    });
});

// Limpieza automática al arrancar cuando el modo conectado quedó sin sesión.
// No exige rol porque main verifica por sí mismo que no exista ningún token guardado.
ipcMain.handle('limpiar-datos-si-sin-sesion', () => {
    return new Promise((resolve) => {
        db.db.get("SELECT valor FROM ajustes WHERE clave IN ('api_token_enc','api_token') AND valor != '' LIMIT 1", [], (err, row) => {
            if (row) return resolve(false); // hay sesión guardada → no limpiar
            db.limpiarDatosLocales((err2) => resolve(!err2));
        });
    });
});

ipcMain.handle('agregar-insumo-con-id', (_, id, datos) => {
    return new Promise((res, rej) => db.agregarInsumoConId(id, datos, (err) => err ? rej(err) : res(true)));
});
ipcMain.handle('agregar-preparacion-con-id', (_, id, datos) => {
    return new Promise((res, rej) => db.agregarPreparacionConId(id, datos, (err) => err ? rej(err) : res(true)));
});
ipcMain.handle('agregar-descuento-con-id', (_, id, datos) => {
    return new Promise((res, rej) => db.agregarDescuentoConId(id, datos, (err) => err ? rej(err) : res(true)));
});
ipcMain.handle('agregar-combo-con-id', (_, id, datos) => {
    return new Promise((res, rej) => db.agregarComboConId(id, datos, (err) => err ? rej(err) : res(true)));
});

// SYNC — Guardar datos del backend en SQLite local
ipcMain.handle('sync-clasificaciones', (_, datos) => {
    return new Promise((res, rej) => db.syncClasificaciones(datos, (err) => err ? rej(err) : res(true)));
});
ipcMain.handle('sync-productos', (_, datos) => {
    return new Promise((res, rej) => db.syncProductos(datos, (err) => err ? rej(err) : res(true)));
});
ipcMain.handle('sync-clientes', (_, datos) => {
    return new Promise((res, rej) => db.syncClientes(datos, (err) => err ? rej(err) : res(true)));
});
ipcMain.handle('sync-insumos', (_, datos) => {
    return new Promise((res, rej) => db.syncInsumos(datos, (err) => err ? rej(err) : res(true)));
});
ipcMain.handle('sync-preparaciones', (_, datos) => {
    return new Promise((res, rej) => db.syncPreparaciones(datos, (err) => err ? rej(err) : res(true)));
});
ipcMain.handle('sync-recetas', (_, datos) => {
    return new Promise((res, rej) => db.syncRecetasProducto(datos, (err) => err ? rej(err) : res(true)));
});
ipcMain.handle('sync-descuentos', (_, datos) => {
    return new Promise((res, rej) => db.syncDescuentos(datos, (err) => err ? rej(err) : res(true)));
});
ipcMain.handle('sync-combos', (_, datos) => {
    return new Promise((res, rej) => db.syncCombos(datos, (err) => err ? rej(err) : res(true)));
});
ipcMain.handle('sync-pedidos', (_, datos) => {
    return new Promise((res, rej) => db.syncPedidos(datos, (err) => err ? rej(err) : res(true)));
});
ipcMain.handle('obtener-pedidos-pendientes', () => {
    return new Promise((res, rej) => db.obtenerPedidosPendientes((err, rows) => err ? rej(err) : res(rows)));
});
ipcMain.handle('obtener-items-pedido', (_, id) => {
    return new Promise((res, rej) => db.obtenerItemsPedido(id, (err, rows) => err ? rej(err) : res(rows)));
});
ipcMain.handle('obtener-pagos-pedido', (_, id) => {
    return new Promise((res, rej) => db.obtenerPagosPedido(id, (err, rows) => err ? rej(err) : res(rows)));
});
// MODIFICADORES (BLOQUE 11) — espejo local de la biblioteca del negocio.
// Guardar el catálogo NO es una operación de dueño: lo escribe el sync con lo
// que ya bajó del backend, igual que el catálogo de productos.
ipcMain.handle('guardar-catalogo-modificadores', (_, data) => {
    return new Promise((res, rej) => db.guardarCatalogoModificadores(data, (err) => err ? rej(err) : res(true)));
});
ipcMain.handle('obtener-catalogo-modificadores', () => {
    return new Promise((res, rej) => db.obtenerCatalogoModificadores((err, data) => err ? rej(err) : res(data)));
});
ipcMain.handle('marcar-pedido-sincronizado', (_, id) => {
    return new Promise((res, rej) => db.marcarPedidoSincronizado(id, (err) => err ? rej(err) : res(true)));
});

// TURNOS — Corte de caja
ipcMain.handle('abrir-turno', (event, nombre, rol, fondoInicial) => {
    return new Promise((resolve, reject) => {
        db.abrirTurno(nombre, rol, fondoInicial, (err, id) => {
            if (err) reject(err); else resolve(id);
        });
    });
});

ipcMain.handle('obtener-turno-activo', () => {
    return new Promise((resolve) => {
        db.obtenerTurnoActivo((err, turno) => resolve(turno || null));
    });
});

ipcMain.handle('obtener-turnos', () => {
    return new Promise((resolve) => {
        db.obtenerTurnos((err, turnos) => resolve(turnos || []));
    });
});

ipcMain.handle('calcular-totales-turno', (event, fechaApertura) => {
    return new Promise((resolve) => {
        db.calcularTotalesTurno(fechaApertura, (err, rows) => resolve(rows?.[0] || {}));
    });
});

// MOVIMIENTOS DE CAJA (BLOQUE 7) — retiros, gastos y depósitos del turno.
// La autorización (PIN) la resuelve el renderer antes de llamar aquí, igual que
// el resto de acciones privilegiadas del modo local.
ipcMain.handle('registrar-movimiento-caja', (event, turnoId, tipo, monto, motivo, empleado) => {
    return new Promise((resolve, reject) => {
        db.registrarMovimientoCaja(turnoId, tipo, monto, motivo, empleado, (err, id) => {
            if (err) reject(err); else resolve(id);
        });
    });
});

ipcMain.handle('obtener-movimientos-caja', (event, turnoId) => {
    return new Promise((resolve) => {
        db.obtenerMovimientosCaja(turnoId, (err, movs) => resolve(movs || []));
    });
});

ipcMain.handle('anular-movimiento-caja', (event, id, empleado, motivo) => {
    return new Promise((resolve, reject) => {
        db.anularMovimientoCaja(id, empleado, motivo, (err) => {
            if (err) reject(err); else resolve(true);
        });
    });
});

ipcMain.handle('totales-movimientos-caja', (event, turnoId) => {
    return new Promise((resolve) => {
        db.totalesMovimientosCaja(turnoId, (err, totales) =>
            resolve(totales || { total_depositos: 0, total_retiros: 0, total_gastos: 0, neto: 0 }));
    });
});

ipcMain.handle('cerrar-turno', (event, id, efectivoContado, notas) => {
    return new Promise((resolve, reject) => {
        db.cerrarTurno(id, efectivoContado, notas, (err) => {
            if (err) return reject(err);
            // Respaldo al cerrar caja: es el momento natural de "fin del día" y
            // asegura una copia diaria aunque el equipo nunca se reinicie.
            // No bloquea el cierre: si el respaldo falla, el turno igual se cierra.
            crearBackup().catch(e => console.error('Error en backup tras cerrar turno:', e));
            resolve(true);
        });
    });
});

// ============================================
// TOKEN SEGURO — Cifrado con safeStorage (OS-level encryption)
// ============================================

ipcMain.handle('guardar-token-seguro', (event, token) => {
    try {
        if (!token) {
            // Borrar el token cifrado
            return db.guardarAjuste('api_token_enc', '', () => {});
        }
        if (safeStorage.isEncryptionAvailable()) {
            const cifrado = safeStorage.encryptString(token).toString('base64');
            return new Promise((resolve, reject) => {
                db.guardarAjuste('api_token_enc', cifrado, (err) => err ? reject(err) : resolve(true));
            });
        } else {
            // Fallback: guardar sin cifrar si el OS no soporta safeStorage
            return new Promise((resolve, reject) => {
                db.guardarAjuste('api_token', token, (err) => err ? reject(err) : resolve(true));
            });
        }
    } catch (err) {
        console.error('Error al guardar token seguro:', err);
        return false;
    }
});

// REFRESH TOKEN — mismo esquema de cifrado que el access token.
// Permite renovar la sesión sin pedir login durante 30 días.
ipcMain.handle('guardar-refresh-seguro', (event, token) => {
    try {
        if (!token) {
            return new Promise((resolve) => {
                db.guardarAjuste('api_refresh_enc', '', () => resolve(true));
            });
        }
        if (safeStorage.isEncryptionAvailable()) {
            const cifrado = safeStorage.encryptString(token).toString('base64');
            return new Promise((resolve, reject) => {
                db.guardarAjuste('api_refresh_enc', cifrado, (err) => err ? reject(err) : resolve(true));
            });
        } else {
            return new Promise((resolve, reject) => {
                db.guardarAjuste('api_refresh', token, (err) => err ? reject(err) : resolve(true));
            });
        }
    } catch (err) {
        console.error('Error al guardar refresh token seguro:', err);
        return false;
    }
});

ipcMain.handle('obtener-refresh-seguro', () => {
    return new Promise((resolve) => {
        db.db.get("SELECT valor FROM ajustes WHERE clave = 'api_refresh_enc'", [], (err, row) => {
            if (!err && row && row.valor && safeStorage.isEncryptionAvailable()) {
                try {
                    const buffer = Buffer.from(row.valor, 'base64');
                    return resolve(safeStorage.decryptString(buffer));
                } catch (e) { /* cae al fallback */ }
            }
            db.db.get("SELECT valor FROM ajustes WHERE clave = 'api_refresh'", [], (err2, row2) => {
                resolve(row2?.valor || null);
            });
        });
    });
});

ipcMain.handle('obtener-token-seguro', () => {
    return new Promise((resolve) => {
        // Intentar obtener token cifrado primero
        db.db.get("SELECT valor FROM ajustes WHERE clave = 'api_token_enc'", [], (err, row) => {
            if (!err && row && row.valor && safeStorage.isEncryptionAvailable()) {
                try {
                    const buffer = Buffer.from(row.valor, 'base64');
                    const token = safeStorage.decryptString(buffer);
                    return resolve(token);
                } catch (e) {
                    // Si falla el descifrado, intentar con el campo sin cifrar
                }
            }
            // Fallback: token sin cifrar (compatibilidad hacia atrás)
            db.db.get("SELECT valor FROM ajustes WHERE clave = 'api_token'", [], (err2, row2) => {
                resolve(row2?.valor || null);
            });
        });
    });
});

// ============================================
// ABRIR URL EN NAVEGADOR EXTERNO
// ============================================

ipcMain.handle('abrir-en-navegador', async (event, url) => {
    const { shell } = require('electron');
    // Validar que la URL sea http o https para evitar esquemas peligrosos (file:, javascript:, etc.)
    if (typeof url !== 'string') {
        throw new Error('URL inválida');
    }
    let parsed;
    try {
        parsed = new URL(url);
    } catch (e) {
        throw new Error('URL inválida');
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        throw new Error('Protocolo no permitido');
    }
    await shell.openExternal(parsed.toString());
    return true;
});

// ============================================
// ROL ACTIVO — Para validación de permisos en IPC
// ============================================

let rolActivoEnMain = 'dueno'; // Cache del rol actual
let permisosRolActivoEnMain = null; // Permisos efectivos del rol activo (para puestos personalizados)

// Lee y decodifica el payload del JWT almacenado (sin verificar firma — sólo para leer claims locales).
// Se usa para validar que el rol solicitado desde el renderer corresponda a la sesión real del servidor.
async function obtenerRolDelTokenAlmacenado() {
    return new Promise((resolve) => {
        const leerToken = (cb) => {
            db.db.get("SELECT valor FROM ajustes WHERE clave = 'api_token_enc'", [], (err, row) => {
                if (!err && row && row.valor && safeStorage.isEncryptionAvailable()) {
                    try {
                        const buffer = Buffer.from(row.valor, 'base64');
                        return cb(safeStorage.decryptString(buffer));
                    } catch (e) { /* cae al fallback */ }
                }
                db.db.get("SELECT valor FROM ajustes WHERE clave = 'api_token'", [], (err2, row2) => {
                    cb(row2?.valor || null);
                });
            });
        };
        leerToken((token) => {
            if (!token || typeof token !== 'string') return resolve(null);
            const partes = token.split('.');
            if (partes.length !== 3) return resolve(null);
            try {
                const payloadB64 = partes[1].replace(/-/g, '+').replace(/_/g, '/');
                const padded = payloadB64 + '='.repeat((4 - payloadB64.length % 4) % 4);
                const payload = JSON.parse(Buffer.from(padded, 'base64').toString('utf8'));
                resolve(payload?.role || null);
            } catch (e) {
                resolve(null);
            }
        });
    });
}

ipcMain.handle('establecer-rol-activo', async (event, rol, permisos) => {
    // Se aceptan los roles built-in y también las claves de puestos personalizados
    // (restringidos según los permisos que acompañan al registro).
    if (typeof rol !== 'string' || !rol || rol.length > 60) {
        return false;
    }
    // El rol 'dueno' (admin) sólo se acepta si el JWT almacenado corresponde a un owner.
    // Si no hay token (modo offline inicial), se permite por compatibilidad.
    // Para los demás roles (cajero/encargado) la validación se hace con PIN en el flujo de perfiles.
    if (rol === 'dueno') {
        const rolToken = await obtenerRolDelTokenAlmacenado();
        if (rolToken !== null && rolToken !== 'owner') {
            throw new Error('Permiso denegado: la sesión actual no corresponde al dueño del negocio.');
        }
    }
    rolActivoEnMain = rol;
    permisosRolActivoEnMain = (permisos && typeof permisos === 'object') ? permisos : null;
    return true;
});

ipcMain.handle('calcular-alertas', () => {
    return new Promise((resolve) => {
        db.calcularAlertas((err, alertas) => resolve(alertas || []));
    });
});

// MESAS
ipcMain.handle('obtener-mesas', (_, branchId) =>
    new Promise((res, rej) => db.obtenerMesas(branchId || null, (e, r) => e ? rej(e) : res(r))));
ipcMain.handle('crear-mesa', (_, n, z, c, branchId) =>
    new Promise((res, rej) => db.crearMesa(n, z, c, branchId || null, (e) => e ? rej(e) : res(true))));
ipcMain.handle('actualizar-mesa', (_, id, n, z, c) =>
    new Promise((res, rej) => db.actualizarMesa(id, n, z, c, (e) => e ? rej(e) : res(true))));
ipcMain.handle('eliminar-mesa', (_, id) =>
    new Promise((res, rej) => db.eliminarMesa(id, (e) => e ? rej(e) : res(true))));
ipcMain.handle('obtener-pedido-mesa', (_, mesa_id) =>
    new Promise((res, rej) => db.obtenerPedidoAbiertoPorMesa(mesa_id, (e, r) => e ? rej(e) : res(r))));
ipcMain.handle('abrir-pedido-mesa', (_, mesa_id, mesa_nombre, cajero, comensales, notas, impuesto) =>
    new Promise((res, rej) => db.abrirPedidoMesa(mesa_id, mesa_nombre, cajero, comensales, notas, impuesto, (e, id) => e ? rej(e) : res(id))));
// `precio` llega YA con los modificadores sumados (BLOQUE 11); `modificadores`
// es la selección congelada y `precioBase` el precio del catálogo.
ipcMain.handle('agregar-item-mesa', (_, pedido_id, producto_id, cantidad, precio, nota, modificadores, precioBase) =>
    new Promise((res, rej) => db.agregarItemMesa(pedido_id, producto_id, cantidad, precio, nota, (e) => e ? rej(e) : res(true), modificadores, precioBase)));
ipcMain.handle('eliminar-item-mesa', (_, item_id, pedido_id) =>
    new Promise((res, rej) => db.eliminarItemMesa(item_id, pedido_id, (e) => e ? rej(e) : res(true))));
ipcMain.handle('cerrar-pedido-mesa', (_, pedido_id, metodo, propina, propinaMetodo) =>
    new Promise((res, rej) => db.cerrarPedidoMesa(pedido_id, metodo, propina, propinaMetodo, (e) => e ? rej(e) : res(true))));
ipcMain.handle('transferir-mesa', (_, pedido_id, nueva_mesa_id) =>
    new Promise((res, rej) => db.transferirMesa(pedido_id, nueva_mesa_id, (e) => e ? rej(e) : res(true))));
ipcMain.handle('actualizar-notas-mesa', (_, pedido_id, notas) =>
    new Promise((res, rej) => db.actualizarNotasMesa(pedido_id, notas, (e) => e ? rej(e) : res(true))));
ipcMain.handle('actualizar-puntos-cliente', (_, cliente_id, delta) =>
    new Promise((res, rej) => db.actualizarPuntosCliente(cliente_id, delta, (e) => e ? rej(e) : res(true))));
ipcMain.handle('toggle-fidelidad', (_, cliente_id, valor) =>
    new Promise((res, rej) => db.toggleFidelidad(cliente_id, valor, (e) => e ? rej(e) : res(true))));
ipcMain.handle('obtener-clientes-fidelidad', () =>
    new Promise((res, rej) => db.obtenerClientesFidelidad((e, r) => e ? rej(e) : res(r))));
ipcMain.handle('registrar-log-descuento', (_, datos) =>
    new Promise((res, rej) => db.registrarLogDescuento(datos, (e) => e ? rej(e) : res(true))));
ipcMain.handle('obtener-log-descuentos', () =>
    new Promise((res, rej) => db.obtenerLogDescuentos(50, (e, r) => e ? rej(e) : res(r))));

// ============================================
// SERVIDOR KDS (Kitchen Display System)
// ============================================
const http = require('http');
const os   = require('os');

let kdsClients      = [];
let kdsPendingOrders = [];
let kdsCounter      = 0;

function getLocalIP() {
    const nets = os.networkInterfaces();
    for (const name of Object.keys(nets)) {
        for (const net of nets[name]) {
            if (net.family === 'IPv4' && !net.internal) return net.address;
        }
    }
    return '127.0.0.1';
}

function broadcastKDS(data) {
    const msg = `data: ${JSON.stringify(data)}\n\n`;
    kdsClients = kdsClients.filter(c => !c.destroyed);
    kdsClients.forEach(c => { try { c.write(msg); } catch(e) {} });
}

// Pendientes de aprobación: IP → { res, userAgent, timeout }
const kdsPendingApprovals = new Map();

function getClientIP(req) {
    // Sólo la dirección real del socket. Nunca confiar en headers como
    // X-Forwarded-For: los controla el cliente y permitirían suplantar
    // una IP local para saltarse la aprobación de dispositivos.
    return req.socket.remoteAddress?.replace('::ffff:', '') || '0.0.0.0';
}

// Verifica si un dispositivo está autorizado (promesa)
function checkDeviceTrust(ip) {
    return new Promise((resolve) => {
        db.buscarDispositivoKDS(ip, (err, row) => {
            if (err || !row) return resolve(null);
            resolve(row);
        });
    });
}

const KDS_PORT = 3001;

// Verifica si una dirección IP pertenece a redes locales/privadas (loopback, RFC1918, link-local).
function esIPPrivada(ip) {
    if (!ip) return false;
    if (ip === '127.0.0.1' || ip === '::1' || ip === 'localhost') return true;
    if (ip.startsWith('10.')) return true;
    if (ip.startsWith('192.168.')) return true;
    if (ip.startsWith('169.254.')) return true;
    const m172 = ip.match(/^172\.(\d+)\./);
    if (m172) {
        const seg = parseInt(m172[1], 10);
        if (seg >= 16 && seg <= 31) return true;
    }
    // IPv6 privada (fc00::/7) o link-local (fe80::/10)
    if (/^(fc|fd)[0-9a-f]{2}:/i.test(ip)) return true;
    if (/^fe80:/i.test(ip)) return true;
    return false;
}

// Devuelve el origen permitido para CORS a partir del header Origin,
// sólo si corresponde a una IP/hostname de la red local.
function origenPermitidoKDS(originHeader) {
    if (!originHeader) return null;
    try {
        const u = new URL(originHeader);
        const host = u.hostname;
        if (host === 'localhost' || esIPPrivada(host)) return originHeader;
    } catch (e) { /* origen inválido */ }
    return null;
}

const kdsServer = http.createServer(async (req, res) => {
    const clientIP = getClientIP(req);
    const isLocal = clientIP === '127.0.0.1' || clientIP === '::1' || clientIP === 'localhost';

    // CORS restringido: sólo se refleja el Origin si proviene de la red local/privada.
    const origenPermitido = origenPermitidoKDS(req.headers.origin);
    if (origenPermitido) {
        res.setHeader('Access-Control-Allow-Origin', origenPermitido);
        res.setHeader('Vary', 'Origin');
    }
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST');

    // Rechazar conexiones desde IPs públicas (defensa en profundidad aunque escuche en 0.0.0.0).
    if (!isLocal && !esIPPrivada(clientIP)) {
        res.writeHead(403); res.end('Origen no permitido');
        return;
    }

    if (req.method === 'GET' && (req.url === '/' || req.url === '/kds')) {
        // Servir kds.html: los dispositivos no confiables también ven la página
        // (pero no podrán conectarse a /events)
        fs.readFile(path.join(__dirname, 'kds.html'), (err, data) => {
            if (err) { res.writeHead(500); res.end('Error'); return; }
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(data);
        });
    } else if (req.method === 'GET' && req.url === '/events') {
        // Verificar confianza del dispositivo (localhost siempre permitido)
        if (!isLocal) {
            const device = await checkDeviceTrust(clientIP);
            if (device && device.confianza === 0) {
                // Dispositivo bloqueado
                res.writeHead(403); res.end('Dispositivo bloqueado');
                return;
            }
            if (!device) {
                // Dispositivo nuevo: pedir aprobación al usuario desktop
                if (mainWindow && !mainWindow.isDestroyed()) {
                    mainWindow.webContents.send('kds-dispositivo-nuevo', {
                        ip: clientIP,
                        userAgent: req.headers['user-agent'] || 'Desconocido'
                    });
                }
                // Mientras tanto, no conectar al SSE — responder con 403 pending
                res.writeHead(403, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'pending_approval', message: 'Esperando aprobación del administrador' }));
                return;
            }
            // Dispositivo confiable → continuar
        }
        res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive'
        });
        res.write(`data: ${JSON.stringify({ type: 'init', orders: kdsPendingOrders })}\n\n`);
        kdsClients.push(res);
        req.on('close', () => { kdsClients = kdsClients.filter(c => c !== res); });
    } else if (req.method === 'POST' && req.url.startsWith('/status/')) {
        const kdsId = req.url.replace('/status/', '');
        const order = kdsPendingOrders.find(o => String(o.kdsId) === kdsId);
        if (order) {
            order.estado = 'preparando';
            broadcastKDS({ type: 'status', kdsId, status: 'preparando' });
            if (order.pedidoId && mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('kds-estado-cambio', { pedidoId: order.pedidoId, estado: 'en_preparacion' });
            }
        }
        res.writeHead(200); res.end('OK');
    } else if (req.method === 'POST' && req.url.startsWith('/done/')) {
        const kdsId = req.url.replace('/done/', '');
        const order = kdsPendingOrders.find(o => String(o.kdsId) === kdsId);
        kdsPendingOrders = kdsPendingOrders.filter(o => String(o.kdsId) !== kdsId);
        broadcastKDS({ type: 'done', kdsId });
        if (order && order.pedidoId && mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('kds-estado-cambio', { pedidoId: order.pedidoId, estado: 'completado' });
        }
        res.writeHead(200); res.end('OK');
    } else {
        res.writeHead(404); res.end();
    }
});

kdsServer.on('error', e => console.error('KDS server error:', e.message));
kdsServer.listen(KDS_PORT, '0.0.0.0', () =>
    console.log(`✅ KDS server en http://localhost:${KDS_PORT}`));

ipcMain.handle('kds-nuevo-pedido', (_, orden) => {
    kdsCounter++;
    const entry = { ...orden, kdsId: String(kdsCounter), hora: Date.now() };
    kdsPendingOrders.push(entry);
    broadcastKDS({ type: 'nuevo', order: entry });
    return true;
});

ipcMain.handle('kds-get-url', () => ({
    local: `http://localhost:${KDS_PORT}`,
    red:   `http://${getLocalIP()}:${KDS_PORT}`,
    ip:    getLocalIP(),
    port:  KDS_PORT
}));

// ── KDS: Gestión de dispositivos de confianza ──────────────────────────
ipcMain.handle('kds-aprobar-dispositivo', (_, { ip, userAgent, nombre }) => {
    return new Promise((resolve, reject) => {
        db.agregarDispositivoKDS(ip, userAgent, nombre || ip, (err, id) => {
            if (err) return reject(err);
            resolve({ id, ip, nombre: nombre || ip });
        });
    });
});

ipcMain.handle('kds-rechazar-dispositivo', (_, { ip, userAgent }) => {
    return new Promise((resolve, reject) => {
        db.bloquearDispositivoKDS(ip, userAgent, (err) => {
            if (err) return reject(err);
            resolve(true);
        });
    });
});

ipcMain.handle('kds-obtener-dispositivos', () => {
    return new Promise((resolve, reject) => {
        db.obtenerDispositivosKDS((err, rows) => {
            if (err) return reject(err);
            resolve(rows || []);
        });
    });
});

ipcMain.handle('kds-eliminar-dispositivo', (_, id) => {
    return new Promise((resolve, reject) => {
        db.eliminarDispositivoKDS(id, (err) => {
            if (err) return reject(err);
            resolve(true);
        });
    });
});