console.log("âœ… PRELOAD CARGADO CORRECTAMENTE");

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
    // DASHBOARD
    obtenerEstadisticas: () => ipcRenderer.invoke('obtener-estadisticas'),

    // PEDIDOS
    obtenerPedidos: (filtro) => ipcRenderer.invoke('obtener-pedidos', filtro),
    obtenerDetallePedido: (id) => ipcRenderer.invoke('obtener-detalle-pedido', id),
    crearPedido: (telefono, items, total, metodo) => 
        ipcRenderer.invoke('crear-pedido', telefono, items, total, metodo),
    actualizarEstadoPedido: (id, estado) => ipcRenderer.invoke('actualizar-estado-pedido', id, estado),
    crearPedidoDirecto: (datosPedido, items) => ipcRenderer.invoke('crear-pedido-directo', datosPedido, items),

    // PRODUCTOS Y CLASIFICACIONES
    obtenerProductosAgrupados: () => ipcRenderer.invoke('obtener-productos-agrupados'),
    obtenerClasificacionesRaw: () => ipcRenderer.invoke('obtener-clasificaciones-raw'),
    agregarProducto: (producto) => ipcRenderer.invoke('agregar-producto', producto),
    actualizarProducto: (id, producto) => ipcRenderer.invoke('actualizar-producto', id, producto),
    eliminarProducto: (id) => ipcRenderer.invoke('eliminar-producto', id),

    // CLIENTES
    obtenerClientes: () => ipcRenderer.invoke('obtener-clientes'),
    crearCliente: (datos) => ipcRenderer.invoke('crear-cliente', datos),
    obtenerEstadisticasClientes: () => ipcRenderer.invoke('obtener-estadisticas-clientes'),
    obtenerClientesConCompras: () => ipcRenderer.invoke('obtener-clientes-con-compras'),
    actualizarCliente: (id, datos) => ipcRenderer.invoke('actualizar-cliente', id, datos),
    eliminarCliente: (id) => ipcRenderer.invoke('eliminar-cliente', id),

    // Acciones Clasificaciones
    agregarClasificacion: (data) => ipcRenderer.invoke('agregar-clasificacion', data),
    editarClasificacion: (data) => ipcRenderer.invoke('editar-clasificacion', data),
    eliminarClasificacion: (id) => ipcRenderer.invoke('eliminar-clasificacion', id),

    // AJUSTES
    guardarAjuste: (clave, valor) => ipcRenderer.invoke('guardar-ajuste', clave, valor),
    obtenerAjustes: () => ipcRenderer.invoke('obtener-ajustes'),
    obtenerImpresoras: () => ipcRenderer.invoke('obtener-impresoras'),

    // ACTUALIZACIONES
    checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
    downloadUpdate: () => ipcRenderer.invoke('download-update'),
    installUpdate: () => ipcRenderer.invoke('install-update'),
    getAppVersion: () => ipcRenderer.invoke('get-app-version'),
    
    // Listeners para actualizaciones
    onUpdateAvailable: (callback) => ipcRenderer.on('update-available', (_, info) => callback(info)),
    onDownloadProgress: (callback) => ipcRenderer.on('download-progress', (_, progress) => callback(progress)),
    onUpdateDownloaded: (callback) => ipcRenderer.on('update-downloaded', (_, info) => callback(info)),
    
    // Utils y Logo
    seleccionarImagen: () => ipcRenderer.invoke('seleccionar-imagen'),
    obtenerRutaLogo: () => {
        return "./assets/logo/montana.png"; 
    },
    // INVENTARIO
    obtenerInsumos: () => ipcRenderer.invoke('obtener-insumos'),
    agregarInsumo: (d) => ipcRenderer.invoke('agregar-insumo', d),
    actualizarInsumo: (id, d) => ipcRenderer.invoke('actualizar-insumo', id, d),
    eliminarInsumo: (id) => ipcRenderer.invoke('eliminar-insumo', id),
    obtenerPreparaciones: () => ipcRenderer.invoke('obtener-preparaciones'),
    agregarPreparacion: (d) => ipcRenderer.invoke('agregar-preparacion', d),
    actualizarPreparacion: (id, d) => ipcRenderer.invoke('actualizar-preparacion', id, d),
    eliminarPreparacion: (id) => ipcRenderer.invoke('eliminar-preparacion', id),
    obtenerItemsPreparacion: (id) => ipcRenderer.invoke('obtener-items-preparacion', id),
    guardarItemsPreparacion: (id, items) => ipcRenderer.invoke('guardar-items-preparacion', id, items),
    obtenerRecetaProducto: (id) => ipcRenderer.invoke('obtener-receta-producto', id),
    guardarRecetaProducto: (id, items) => ipcRenderer.invoke('guardar-receta-producto', id, items),
    calcularStockPreparacion: (id) => ipcRenderer.invoke('calcular-stock-preparacion', id),
    calcularStockProducto: (id) => ipcRenderer.invoke('calcular-stock-producto', id),
    registrarEntradaInsumo: (datos) => ipcRenderer.invoke('registrar-entrada-insumo', datos),
    obtenerEntradasInsumo: (id) => ipcRenderer.invoke('obtener-entradas-insumo', id),
    registrarSalidaInsumo: (datos) => ipcRenderer.invoke('registrar-salida-insumo', datos),
    obtenerSalidasInsumo: (id) => ipcRenderer.invoke('obtener-salidas-insumo', id),

// OFERTAS — DESCUENTOS
    obtenerDescuentos: () => ipcRenderer.invoke('obtener-descuentos'),
    agregarDescuento: (d) => ipcRenderer.invoke('agregar-descuento', d),
    actualizarDescuento: (id, d) => ipcRenderer.invoke('actualizar-descuento', id, d),
    eliminarDescuento: (id) => ipcRenderer.invoke('eliminar-descuento', id),
    // OFERTAS — COMBOS
    obtenerCombos: () => ipcRenderer.invoke('obtener-combos'),
    agregarCombo: (d) => ipcRenderer.invoke('agregar-combo', d),
    actualizarCombo: (id, d) => ipcRenderer.invoke('actualizar-combo', id, d),
    eliminarCombo: (id) => ipcRenderer.invoke('eliminar-combo', id),
    obtenerItemsCombo: (id) => ipcRenderer.invoke('obtener-items-combo', id),
    guardarItemsCombo: (id, items) => ipcRenderer.invoke('guardar-items-combo', id, items),

});