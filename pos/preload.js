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
    eliminarRecetaProducto: (id) => ipcRenderer.invoke('eliminar-receta-producto', id),
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

// BACKUPS
    crearBackupManual: () => ipcRenderer.invoke('crear-backup-manual'),
    listarBackups: () => ipcRenderer.invoke('listar-backups'),
    obtenerRutaBackups: () => ipcRenderer.invoke('obtener-ruta-backups'),
    abrirCarpetaBackups: () => ipcRenderer.invoke('abrir-carpeta-backups'),

    // IMPRESIÓN
    imprimirTicket: (html, impresora) => ipcRenderer.invoke('imprimir-ticket', html, impresora),

    limpiarDatosLocales: () => ipcRenderer.invoke('limpiar-datos-locales'),

    agregarInsumoConId: (id, datos) => ipcRenderer.invoke('agregar-insumo-con-id', id, datos),
    agregarPreparacionConId: (id, datos) => ipcRenderer.invoke('agregar-preparacion-con-id', id, datos),
    agregarDescuentoConId: (id, datos) => ipcRenderer.invoke('agregar-descuento-con-id', id, datos),
    agregarComboConId: (id, datos) => ipcRenderer.invoke('agregar-combo-con-id', id, datos),

    // SYNC
    syncClasificaciones: (datos) => ipcRenderer.invoke('sync-clasificaciones', datos),
    syncProductos: (datos) => ipcRenderer.invoke('sync-productos', datos),
    syncClientes: (datos) => ipcRenderer.invoke('sync-clientes', datos),
    syncInsumos: (datos) => ipcRenderer.invoke('sync-insumos', datos),
    syncPreparaciones: (datos) => ipcRenderer.invoke('sync-preparaciones', datos),
    syncRecetas: (datos) => ipcRenderer.invoke('sync-recetas', datos),
    syncDescuentos: (datos) => ipcRenderer.invoke('sync-descuentos', datos),
    syncCombos: (datos) => ipcRenderer.invoke('sync-combos', datos),
    syncPedidos: (datos) => ipcRenderer.invoke('sync-pedidos', datos),
    obtenerPedidosPendientes: () => ipcRenderer.invoke('obtener-pedidos-pendientes'),
    obtenerItemsPedido: (id) => ipcRenderer.invoke('obtener-items-pedido', id),
    marcarPedidoSincronizado: (id) => ipcRenderer.invoke('marcar-pedido-sincronizado', id),

    // LOGIN
    tienePasswordApp: () => ipcRenderer.invoke('tiene-password-app'),
    verificarPasswordApp: (password) => ipcRenderer.invoke('verificar-password-app', password),
    establecerPasswordApp: (password) => ipcRenderer.invoke('establecer-password-app', password),

    // TOKEN SEGURO (cifrado con safeStorage del sistema operativo)
    guardarTokenSeguro: (token) => ipcRenderer.invoke('guardar-token-seguro', token),
    obtenerTokenSeguro: () => ipcRenderer.invoke('obtener-token-seguro'),

    // ABRIR URL EN NAVEGADOR EXTERNO
    abrirEnNavegador: (url) => ipcRenderer.invoke('abrir-en-navegador', url),

    // EVENTO: ventana recupera foco (para re-verificar plan tras Stripe Checkout)
    onWindowFocus: (cb) => ipcRenderer.on('window-focused', () => cb()),

    // ROL ACTIVO (para validación de permisos)
    establecerRolActivo: (rol) => ipcRenderer.invoke('establecer-rol-activo', rol),

    // TURNOS
    abrirTurno: (nombre, rol, fondo) => ipcRenderer.invoke('abrir-turno', nombre, rol, fondo),
    obtenerTurnoActivo: () => ipcRenderer.invoke('obtener-turno-activo'),
    obtenerTurnos: () => ipcRenderer.invoke('obtener-turnos'),
    calcularTotalesTurno: (fecha) => ipcRenderer.invoke('calcular-totales-turno', fecha),
    cerrarTurno: (id, efectivo, notas) => ipcRenderer.invoke('cerrar-turno', id, efectivo, notas),

    // ALERTAS
    calcularAlertas: () => ipcRenderer.invoke('calcular-alertas'),

    // MESAS
    obtenerMesas:        (branchId)               => ipcRenderer.invoke('obtener-mesas', branchId),
    crearMesa:           (n, z, c, branchId)     => ipcRenderer.invoke('crear-mesa', n, z, c, branchId),
    actualizarMesa:      (id, n, z, c)           => ipcRenderer.invoke('actualizar-mesa', id, n, z, c),
    eliminarMesa:        (id)                    => ipcRenderer.invoke('eliminar-mesa', id),
    obtenerPedidoMesa:   (mesa_id)               => ipcRenderer.invoke('obtener-pedido-mesa', mesa_id),
    abrirPedidoMesa:     (m, nom, caj, com, not)  => ipcRenderer.invoke('abrir-pedido-mesa', m, nom, caj, com, not),
    agregarItemMesa:     (ped, prod, cant, px, n) => ipcRenderer.invoke('agregar-item-mesa', ped, prod, cant, px, n),
    eliminarItemMesa:    (item, ped)              => ipcRenderer.invoke('eliminar-item-mesa', item, ped),
    cerrarPedidoMesa:    (ped, metodo)            => ipcRenderer.invoke('cerrar-pedido-mesa', ped, metodo),
    transferirMesa:      (ped, nueva)             => ipcRenderer.invoke('transferir-mesa', ped, nueva),
    actualizarNotasMesa: (ped, notas)             => ipcRenderer.invoke('actualizar-notas-mesa', ped, notas),
    actualizarPuntosCliente: (id, delta)          => ipcRenderer.invoke('actualizar-puntos-cliente', id, delta),
    toggleFidelidad:         (id, valor)          => ipcRenderer.invoke('toggle-fidelidad', id, valor),
    obtenerClientesFidelidad: ()                  => ipcRenderer.invoke('obtener-clientes-fidelidad'),
    registrarLogDescuento:   (datos)              => ipcRenderer.invoke('registrar-log-descuento', datos),
    obtenerLogDescuentos:    ()                   => ipcRenderer.invoke('obtener-log-descuentos'),
    // KDS
    kdsNuevoPedido:          (orden)              => ipcRenderer.invoke('kds-nuevo-pedido', orden),
    kdsGetUrl:               ()                   => ipcRenderer.invoke('kds-get-url'),
    onKdsEstadoCambio:       (cb)                 => ipcRenderer.on('kds-estado-cambio', (_, data) => cb(data)),
});