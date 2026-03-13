// ============================================
// MAIN.JS - PROCESO PRINCIPAL (FIX DE RUTAS)
// ============================================
const { app, BrowserWindow, ipcMain, dialog, safeStorage } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');
const fs = require('fs');
const db = require('../database/db');
const { crearBackup, listarBackups } = require('./backup'); 

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
    crearBackup();
    
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

// Helper: verificar si el rol activo tiene permiso para operaciones de administrador
function verificarPermisoAdmin() {
    if (rolActivoEnMain === 'cajero') {
        throw new Error('Permiso denegado: el perfil Cajero no puede realizar esta acción.');
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
        crearBackup();
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
    return new Promise((resolve) => {
        db.establecerPasswordApp(password, (err) => resolve(!err));
    });
});

ipcMain.handle('limpiar-datos-locales', () => {
    return new Promise((resolve) => {
        db.limpiarDatosLocales((err) => resolve(!err));
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

ipcMain.handle('cerrar-turno', (event, id, efectivoContado, notas) => {
    return new Promise((resolve, reject) => {
        db.cerrarTurno(id, efectivoContado, notas, (err) => {
            if (err) reject(err); else resolve(true);
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
    await shell.openExternal(url);
    return true;
});

// ============================================
// ROL ACTIVO — Para validación de permisos en IPC
// ============================================

let rolActivoEnMain = 'dueno'; // Cache del rol actual

ipcMain.handle('establecer-rol-activo', (event, rol) => {
    const rolesValidos = ['cajero', 'encargado', 'dueno'];
    if (rolesValidos.includes(rol)) {
        rolActivoEnMain = rol;
    }
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
ipcMain.handle('abrir-pedido-mesa', (_, mesa_id, mesa_nombre, cajero, comensales, notas) =>
    new Promise((res, rej) => db.abrirPedidoMesa(mesa_id, mesa_nombre, cajero, comensales, notas, (e, id) => e ? rej(e) : res(id))));
ipcMain.handle('agregar-item-mesa', (_, pedido_id, producto_id, cantidad, precio, nota) =>
    new Promise((res, rej) => db.agregarItemMesa(pedido_id, producto_id, cantidad, precio, nota, (e) => e ? rej(e) : res(true))));
ipcMain.handle('eliminar-item-mesa', (_, item_id, pedido_id) =>
    new Promise((res, rej) => db.eliminarItemMesa(item_id, pedido_id, (e) => e ? rej(e) : res(true))));
ipcMain.handle('cerrar-pedido-mesa', (_, pedido_id, metodo) =>
    new Promise((res, rej) => db.cerrarPedidoMesa(pedido_id, metodo, (e) => e ? rej(e) : res(true))));
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

const KDS_PORT = 3001;
const kdsServer = http.createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST');

    if (req.method === 'GET' && (req.url === '/' || req.url === '/kds')) {
        fs.readFile(path.join(__dirname, 'kds.html'), (err, data) => {
            if (err) { res.writeHead(500); res.end('Error'); return; }
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(data);
        });
    } else if (req.method === 'GET' && req.url === '/events') {
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