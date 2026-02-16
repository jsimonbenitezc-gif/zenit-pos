// ============================================
// MAIN.JS - PROCESO PRINCIPAL (FIX DE RUTAS)
// ============================================
const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');
const fs = require('fs');
const db = require('../database/db'); 

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
        icon: path.join(__dirname, 'graficos', 'zenitMontaÃ±a.ico'),
        webPreferences: {
            // Buscamos preload.js en la misma carpeta que main.js
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false
        }
    });
    // FIX AQUÃ: Forzamos a que busque index.html en la carpeta del script
    mainWindow.loadFile(path.join(__dirname, 'index.html'));
}

app.whenReady().then(createWindow);

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
        // Llamamos a la funciÃ³n de la base de datos que ya tienes configurada
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
        // Esta funciÃ³n busca los productos asociados al ID del pedido
        db.obtenerDetallesPedido(pedidoId, (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });
});

ipcMain.handle('obtener-clasificaciones-raw', async () => {
    return new Promise((res, rej) => db.obtenerClasificacionesRaw((err, rows) => err ? rej(err) : res(rows)));
});

ipcMain.handle('agregar-producto', async (_, p) => {
    return new Promise((res, rej) => db.agregarProducto(p, (err) => err ? rej(err) : res(true)));
});

ipcMain.handle('actualizar-producto', async (_, id, p) => {
    return new Promise((res, rej) => db.actualizarProducto(id, p, (err) => err ? rej(err) : res(true)));
});

ipcMain.handle('eliminar-producto', async (_, id) => {
    return new Promise((res, rej) => db.eliminarProducto(id, (err) => err ? rej(err) : res(true)));
});

ipcMain.handle('agregar-clasificacion', async (_, datos) => {
    return new Promise((resolve, reject) => {
        db.agregarClasificacion(datos, (err) => {
            if (err) reject(err);
            else resolve(true);
        });
    });
});

ipcMain.handle('editar-clasificacion', async (_, datos) => {
    return new Promise((resolve, reject) => {
        db.editarClasificacion(datos, (err) => {
            if (err) reject(err);
            else resolve(true);
        });
    });
});

ipcMain.handle('eliminar-clasificacion', async (_, id) => {
    return new Promise((resolve, reject) => {
        db.eliminarClasificacion(id, (err) => {
            if (err) reject(err);
            else resolve(true);
        });
    });
});

// âœ… VERSIÃ“N CORREGIDA - Solo una vez, con el parÃ¡metro metodoPago
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

// Nueva versiÃ³n que NO crea clientes automÃ¡ticamente
ipcMain.handle('crear-pedido-directo', async (_, datosPedido, items) => {
    return new Promise((resolve, reject) => {
        db.crearPedido(datosPedido, items, (err, pedidoId) => {
            if (err) reject(err);
            else resolve(pedidoId);
        });
    });
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
    
    // Crear carpeta de imÃ¡genes si no existe
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