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
        // Movido adentro de la API para que sea accesible
        return "./assets/logo/montana.png"; 
    }
});