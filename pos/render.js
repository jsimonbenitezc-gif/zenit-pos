// ============================================
// RENDER.JS - VERSIÓN INTEGRAL (VENTA DESAGRUPADA)
// ============================================
let clasificaciones = [];
let productosGlobales = []; 
let carrito = [];
let itemNotaEditandoIndex = null; 
let filtroActual = {}; // Filtros para pedidos
let turnoActivo = null;
let rolActivo = 'dueno'; // 'cajero' | 'encargado' | 'dueno'
let ventaSinTurno = true; // si true, permite vender sin haber abierto turno (default: activo)

const PERMISOS_DEFAULT = {
    cajero:    { enabled: false, ver_dashboard: false, ver_nueva_venta: true,  ver_pedidos: true,  ver_turno: true,  ver_productos: false, ver_clientes: true,  ver_ofertas: false, ver_inventario: false, ver_ajustes: false },
    encargado: { enabled: false, ver_dashboard: true,  ver_nueva_venta: true,  ver_pedidos: true,  ver_turno: true,  ver_productos: true,  ver_clientes: true,  ver_ofertas: true,  ver_inventario: true,  ver_ajustes: false },
    dueno:     { enabled: true,  ver_dashboard: true,  ver_nueva_venta: true,  ver_pedidos: true,  ver_turno: true,  ver_productos: true,  ver_clientes: true,  ver_ofertas: true,  ver_inventario: true,  ver_ajustes: true  }
};

let nombreActivo = '';

/* ============================================
   SISTEMA DE MODO (LOCAL vs CONECTADO)
   ============================================ */

let modoConectado = false;
let apiClient = null;
let tokenActual = null;

// Inicializar API Client
if (typeof APIClient !== 'undefined') {
    apiClient = new APIClient('http://localhost:3000/api');
}

// Cargar configuración de modo al inicio
async function cargarConfiguracionModo() {
    try {
        const ajustes = await window.api.obtenerAjustes();
        modoConectado = ajustes.modo_conectado === 'true';
        
        if (modoConectado && ajustes.api_url) {
            apiClient.setBaseURL(ajustes.api_url);
        }
        
        if (modoConectado && ajustes.api_token) {
            apiClient.setToken(ajustes.api_token);
            tokenActual = ajustes.api_token;
        }
        
        // Actualizar indicador visual
        actualizarIndicadorModo();
        
        console.log(`🔧 Modo: ${modoConectado ? 'CONECTADO' : 'LOCAL'}`);
    } catch (error) {
        console.error('Error al cargar configuración:', error);
        modoConectado = false;
        actualizarIndicadorModo();
    }
}

function actualizarIndicadorModo() {
    const iconoModo = document.getElementById('icono-modo');
    const textoModo = document.getElementById('texto-modo');
    
    if (!iconoModo || !textoModo) return;
    
    if (modoConectado) {
        iconoModo.innerHTML = '<path d="M2 20h20"/><path d="m9 10 2 2 4-4"/><rect x="3" y="4" width="18" height="12" rx="2"/>';
        textoModo.innerText = 'Modo Conectado';
    } else {
        iconoModo.innerHTML = '<path d="M2 20h20"/><path d="m9 10 2 2 4-4"/><rect x="3" y="4" width="18" height="12" rx="2"/>';
        textoModo.innerText = 'Modo Local';
    }
}

/* ============================================
   WRAPPER LAYER - Abstracción de Modo
   ============================================ */

// PRODUCTOS
async function obtenerProductosAgrupadosWrapper() {
    if (modoConectado && apiClient && tokenActual) {
        try {
            const productos = await apiClient.getProductsGrouped();
            return productos.map(cat => ({
                id: cat.id,
                nombre: cat.nombre || cat.name,
                emoji: cat.emoji,
                imagen: cat.image || cat.imagen,
                productos: (cat.productos || cat.products || []).map(p => ({
                    id: p.id,
                    nombre: p.nombre || p.name,
                    descripcion: p.descripcion || p.description,
                    precio: parseFloat(p.precio || p.price),
                    stock: p.stock,
                    emoji: p.emoji,
                    imagen: p.imagen || p.image,
                    activo: p.activo !== undefined ? p.activo : p.active
                }))
            }));
        } catch (error) {
            console.error('Error al obtener productos del backend:', error);
            return await window.api.obtenerProductosAgrupados();
        }
    } else {
        return await window.api.obtenerProductosAgrupados();
    }
}

async function agregarProductoWrapper(producto) {
    if (modoConectado && apiClient && tokenActual) {
        try {
            const resultado = await apiClient.createProduct({
                name: producto.nombre,
                description: producto.descripcion,
                price: producto.precio,
                stock: producto.stock,
                category_id: producto.clasificacion_id,
                emoji: producto.emoji,
                image: producto.imagen
            });
            await window.api.agregarProducto(producto);
            return resultado;
        } catch (error) {
            console.error('Error al crear producto en backend:', error);
            return await window.api.agregarProducto(producto);
        }
    } else {
        return await window.api.agregarProducto(producto);
    }
}

async function actualizarProductoWrapper(id, producto) {
    if (modoConectado && apiClient && tokenActual) {
        try {
            const resultado = await apiClient.updateProduct(id, {
                name: producto.nombre,
                description: producto.descripcion,
                price: producto.precio,
                stock: producto.stock,
                category_id: producto.clasificacion_id,
                emoji: producto.emoji,
                image: producto.imagen,
                active: producto.activo
            });
            await window.api.actualizarProducto(id, producto);
            return resultado;
        } catch (error) {
            console.error('Error al actualizar producto en backend:', error);
            return await window.api.actualizarProducto(id, producto);
        }
    } else {
        return await window.api.actualizarProducto(id, producto);
    }
}

// PEDIDOS
async function crearPedidoWrapper(datosPedido, items) {
    if (modoConectado && apiClient && tokenActual) {
        try {
            // Traducir campos español → inglés para el backend
            const datosAPI = {
                customer_id: datosPedido.cliente_id || null,
                customer_temp_info: datosPedido.info_cliente_temp || null,
                total: datosPedido.total,
                payment_method: datosPedido.metodo_pago,
                order_type: datosPedido.tipo_pedido || 'comer',
                reference: datosPedido.referencia || null,
                delivery_address: datosPedido.direccion_domicilio || null,
                maps_link: datosPedido.link_maps || null,
                notes: datosPedido.notas_generales || null
            };
            const itemsAPI = items.map(i => ({
                product_id: i.id,
                quantity: i.cantidad || 1,
                unit_price: i.precio,
                subtotal: i.subtotal,
                notes: i.nota || ''
            }));
            const resultado = await apiClient.createOrder(datosAPI, itemsAPI);
            await window.api.crearPedidoDirecto(datosPedido, items);
            return resultado.id;
        } catch (error) {
            console.error('Error al crear pedido en backend:', error);
            // Guardar localmente y marcar para subir cuando vuelva la conexión
            return await window.api.crearPedidoDirecto({ ...datosPedido, pendiente_sync: 1 }, items);
        }
    } else {
        return await window.api.crearPedidoDirecto(datosPedido, items);
    }
}

async function obtenerPedidosWrapper(filtro) {
    if (modoConectado && apiClient && tokenActual) {
        try {
            const orders = await apiClient.getOrders(filtro);
            // Traducir campos inglés → español para compatibilidad con el frontend
            return orders.map(o => ({
                id: o.id,
                cliente_id: o.customer_id,
                total: parseFloat(o.total),
                estado: o.status,
                metodo_pago: o.payment_method,
                tipo_pedido: o.order_type,
                referencia: o.reference,
                direccion_domicilio: o.delivery_address,
                notas_generales: o.notes,
                info_cliente_temp: o.customer_temp_info,
                cajero: null,
                fecha: o.createdAt,
                telefono: o.customer ? o.customer.name : (o.customer_temp_info || null),
                _items: o.items  // guardar items para verDetallePedido
            }));
        } catch (error) {
            console.error('Error al obtener pedidos del backend:', error);
            return await window.api.obtenerPedidos(filtro);
        }
    } else {
        return await window.api.obtenerPedidos(filtro);
    }
}

async function obtenerDetallePedidoWrapper(id) {
    if (modoConectado && apiClient && tokenActual) {
        try {
            const order = await apiClient.getOrderDetails(id);
            return (order.items || []).map(item => ({
                cantidad: item.quantity,
                nombre: item.product ? item.product.name : `Producto ${item.product_id}`,
                precio: parseFloat(item.unit_price),
                nota: item.notes || null,
                subtotal: parseFloat(item.subtotal)
            }));
        } catch (error) {
            console.error('Error al obtener detalle pedido del backend:', error);
            return await window.api.obtenerDetallePedido(id);
        }
    } else {
        return await window.api.obtenerDetallePedido(id);
    }
}

// CLIENTES
async function obtenerClientesWrapper() {
    if (modoConectado && apiClient && tokenActual) {
        try {
            const clientes = await apiClient.getCustomersWithStats();
            // Traducir campos inglés → español para compatibilidad con el resto del frontend
            return clientes.map(c => ({
                id: c.id,
                telefono: c.phone,
                nombre: c.name,
                direccion: c.address,
                notas: c.notes,
                fecha_registro: c.createdAt,
                total_compras: parseInt(c.total_compras) || 0,
                monto_total: parseFloat(c.monto_total) || 0
            }));
        } catch (error) {
            console.error('Error al obtener clientes del backend:', error);
            return await window.api.obtenerClientesConCompras();
        }
    } else {
        return await window.api.obtenerClientesConCompras();
    }
}

async function crearClienteWrapper(datos) {
    if (modoConectado && apiClient && tokenActual) {
        try {
            const resultado = await apiClient.createCustomer({
                phone: datos.telefono,
                name: datos.nombre,
                address: datos.direccion,
                notes: datos.notas
            });
            await window.api.crearCliente(datos);
            return resultado;
        } catch (error) {
            console.error('Error al crear cliente en backend:', error);
            return await window.api.crearCliente(datos);
        }
    } else {
        return await window.api.crearCliente(datos);
    }
}

// ESTADÍSTICAS
async function obtenerEstadisticasWrapper() {
    if (modoConectado && apiClient && tokenActual) {
        try {
            return await apiClient.getDashboardStats();
        } catch (error) {
            console.error('Error al obtener estadísticas del backend:', error);
            return await window.api.obtenerEstadisticas();
        }
    } else {
        return await window.api.obtenerEstadisticas();
    }
}
 

// Variables de Administración
let productoEditandoId = null;
let categoriaEditandoId = null;
let rutaImagenTemporal = null;
let emojiSeleccionado = '📦';

// Variables de Pago y Descuento
let metodoSeleccionado = null;
let descuentoActual = 0;

const EMOJIS_DISPONIBLES = [
    '🍔','🍕','🍟','🌭','🌮','🌯','🥙','🥪','🥗','🥩','🍗','🥓','🥖','🥯','🥞','🧇','🧀','🍞',
    '🥤','☕','🍵','🥛','🍺','🍷','🍹','🍸','🍾','🧊','🍩','🍪','🎂','🍰','🧁','🥧','🍫','🍬','🍭','🍮',
    '🍅','🥒','🥬','🥦','🥕','🌽','🌶️','🥔','🍇','🍈','🍉','🍊','🍋','🍌','🍍','🍎','🍏','🍐','🍑','🍒','🍓',
    '📦','🛒','🛍️','🏷️','🔥','⭐','✨','💡','🖍️','🖊️','✂️','📌'
];

// ============================================
// SISTEMA DE ACTUALIZACIONES
// ============================================

// Configurar listeners de actualización cuando carga la página
if (window.api) {
    // Verificar versión actual
    window.api.getAppVersion().then(version => {
        console.log(`📦 Versión actual: ${version}`);
    });
    
    // Listener: Actualización disponible
    window.api.onUpdateAvailable((info) => {
        document.getElementById('update-version').innerText = `Versión ${info.version}`;
        document.getElementById('modal-actualizacion').classList.remove('hidden');
    });
    
    // Listener: Progreso de descarga
    window.api.onDownloadProgress((progress) => {
        const percent = Math.round(progress.percent);
        document.getElementById('download-progress-bar').style.width = percent + '%';
        document.getElementById('download-progress-text').innerText = `Descargando... ${percent}%`;
    });
    
    // Listener: Descarga completada
    window.api.onUpdateDownloaded((info) => {
        document.getElementById('download-progress-container').style.display = 'none';
        document.getElementById('btn-download-update').style.display = 'none';
        document.getElementById('btn-install-update').style.display = 'block';
        document.getElementById('update-message').innerText = '¡Actualización lista para instalar!';
    });
}

function descargarActualizacion() {
    document.getElementById('btn-download-update').disabled = true;
    document.getElementById('download-progress-container').style.display = 'block';
    window.api.downloadUpdate();
}

function instalarActualizacion() {
    window.api.installUpdate();
}

function cerrarModalActualizacion() {
    document.getElementById('modal-actualizacion').classList.add('hidden');
}

/* ============================================
   LOGIN — Contraseña de acceso al app
   ============================================ */
async function inicializarLogin() {
    // Solo valida el token guardado. Si es inválido, limpia la sesión.
    // No hay contraseña local — la seguridad es la cuenta Zenit.
    const ajustesPwd = await window.api.obtenerAjustes();
    if (!ajustesPwd.api_token) return;
    try {
        const backendUrl = ajustesPwd.api_url || 'https://zenit-pos-backend.onrender.com/api';
        if (!apiClient) window.apiClient = new APIClient(backendUrl);
        apiClient.setBaseURL(backendUrl);
        apiClient.setToken(ajustesPwd.api_token);
        await apiClient.request('/auth/me');
    } catch (e) {
        // Token inválido o expirado — limpiar sesión
        await window.api.guardarAjuste('api_token', '');
        await window.api.guardarAjuste('modo_conectado', 'false');
    }
}

document.addEventListener('DOMContentLoaded', async () => {

    // ── PERFIL (primero) ────────────────────────────────
    // Si hay perfiles activos → muestra pantalla de selección.
    // Cajero/Encargado → verifican PIN y entran directamente.
    // Administrador → pasa al login. Si no hay perfiles → va directo al login.
    await inicializarPerfil();
    // ───────────────────────────────────────────────────

    // ── LOGIN (solo Administrador) ──────────────────────
    if (rolActivo === 'dueno') {
        await inicializarLogin();
    }
    // ───────────────────────────────────────────────────

    // ── TURNO ──────────────────────────────────────────
    await inicializarTurno();
    // ───────────────────────────────────────────────────

    // Cargar configuración de modo
    await cargarConfiguracionModo();

    // Sincronizar desde backend si hay sesión activa
    if (modoConectado) {
        subirPedidosPendientes().catch(e => console.warn('subirPendientes:', e));
        sincronizarDesdeBackend().catch(e => console.warn('syncDesdeBackend:', e));
    }

    const logo = document.getElementById('brand-logo');
    if (logo && window.api?.obtenerRutaLogo) {
        logo.src = window.api.obtenerRutaLogo();
    }

    configurarMenu();
    configurarBotones();
    configurarModales();
    navegarAPrimeraVistaDisponible();
    cargarSelectorEmojis('prod');
    cargarSelectorEmojis('cat');
    
    document.getElementById('buscador-venta')?.addEventListener('input', (e) => {
        filtrarProductosVenta(e.target.value);
    });

// Configurar buscadores de clientes en Nueva Venta (solo una vez)
    const inputNombre = document.getElementById('nombre-cliente');
    const inputTelefono = document.getElementById('telefono-cliente');
    
    if (inputNombre) {
        inputNombre.addEventListener('input', manejarBusquedaNombre);
        inputNombre.addEventListener('focus', manejarFocusNombre);
    }
    
    if (inputTelefono) {
        inputTelefono.addEventListener('input', manejarBusquedaTelefono);
        inputTelefono.addEventListener('focus', manejarFocusTelefono);
    }
    
cargarAjustesInstalados();

    // Cerrar sugerencias al hacer click fuera
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.cliente-selector-dual')) {
            document.getElementById('sugerencias-nombre')?.classList.add('hidden');
            document.getElementById('sugerencias-telefono')?.classList.add('hidden');
        }
    });

    // Configurar botón de modo de conexión
    const btnModoConexion = document.getElementById('btn-modo-conexion');
    if (btnModoConexion) {
        btnModoConexion.addEventListener('click', window.abrirModalConfiguracionConexion);
        console.log('✅ Event listener del botón configurado');
    }

    // Cerrar modal de configuración al hacer click fuera
    const modalConfig = document.getElementById('modal-configuracion-conexion');
    if (modalConfig) {
        modalConfig.addEventListener('click', function(e) {
            if (e.target === this) {
                window.cerrarModalConfiguracionConexion();
            }
        });
    }

});

   // Listener para resize de ventana (redimensionar gráficas)
    window.addEventListener('resize', () => {
        // Solo si estamos en el dashboard
        const dashboardActivo = document.getElementById('view-dashboard')?.classList.contains('active');
        if (dashboardActivo) {
            setTimeout(() => {
                if (chartVentas) chartVentas.resize();
                if (chart24Horas) chart24Horas.resize();
            }, 100);
        }
    });

/* ============================================
   CONFIGURACIÓN DE MODALES (CERRAR AL CLICKEAR FUERA)
   ============================================ */
function configurarModales() {
    const modales = ['modalProducto', 'modalCategoria', 'modalNotas', 'modalPago'];
    
    modales.forEach(modalId => {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.addEventListener('click', (e) => {
                // Si el click fue en el fondo oscuro (no en el contenido)
                if (e.target === modal) {
                    cerrarModal(modalId);
                }
            });
        }
    });
}

function cerrarModal(modalId) {
    const funciones = {
        'modalProducto': cerrarModalProducto,
        'modalCategoria': cerrarModalCategoria,
        'modalNotas': cerrarModalNotas,
        'modalPago': cerrarModalPago
    };
    
    if (funciones[modalId]) {
        funciones[modalId]();
    }
}

/* NAVEGACIÓN */
function configurarMenu() {
    document.querySelectorAll('.menu-item').forEach(btn => {
        btn.addEventListener('click', () => cambiarVista(btn.dataset.view));
    });
}

function cambiarVista(vista) {
    // 1. Actualizar botones de la sidebar
    document.querySelectorAll('.menu-item').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.view === vista);
    });

    // 2. Ocultar todas las vistas y mostrar la seleccionada
    document.querySelectorAll('.view').forEach(v => {
        v.classList.toggle('active', v.id === `view-${vista}`);
    });

    // 3. ACTUALIZACIÓN: Lógica específica por vista
    if (vista === 'dashboard') {
        cargarDashboard();
setTimeout(() => {
            if (chartVentas) chartVentas.resize();
            if (chart24Horas) chart24Horas.resize();
        }, 100);
    } else if (vista === 'productos') {
        cargarProductosAdmin();
    } else if (vista === 'pedidos') {
        cargarPedidos();
    } else if (vista === 'nueva-venta') {
        cargarCatalogoVenta();
        if (!turnoActivo && !ventaSinTurno) {
            setTimeout(() => {
                const modal = document.getElementById('modal-turno-venta');
                if (modal) modal.classList.remove('hidden');
            }, 150);
        }
    } else if (vista === 'clientes') {
        cargarClientes();
    } else if (vista === 'ofertas') {
        cargarOfertas();
    } else if (vista === 'inventario') {
        cargarInventario();
    } else if (vista === 'ajustes') {
        cargarAjustesInstalados();
    } else if (vista === 'turno') {
        cargarVistaTurno();
    }

    
    // Actualizar el título de la cabecera
    const titulos = {
    dashboard: 'Dashboard',
    pedidos: 'Pedidos',
    productos: 'Productos',
    'nueva-venta': 'Nueva Venta',
    clientes: 'Clientes',
    ofertas: 'Ofertas',
    inventario: 'Inventario',
    ajustes: 'Configuración ⚙️',
    turno: 'Turno / Corte de Caja'
};

    document.getElementById('page-title').innerText = titulos[vista] || 'Zenit POS';
}

function configurarBotones() {
    document.getElementById('btnNuevoProducto').addEventListener('click', () => abrirModalProducto());
    document.getElementById('btnNuevaCategoria').addEventListener('click', () => abrirModalCategoria());
}

/* ============================================
   LÓGICA DE VENTAS (CARRITO DESAGRUPADO)
   ============================================ */

async function cargarCatalogoVenta() {
    try {
        clasificaciones = await obtenerProductosAgrupadosWrapper();
        productosGlobales = [];
        clasificaciones.forEach(c => {
            c.productos.forEach(p => productosGlobales.push({...p, categoria: c.nombre}));
        });
        renderizarFiltrosCategorias();
        renderizarGridVenta(productosGlobales);
        renderizarCarrito();
    } catch (e) { console.error(e); }
}

function renderizarFiltrosCategorias() {
    const contenedor = document.getElementById('filtros-categorias');
    contenedor.innerHTML = `<button class="filter-btn active" onclick="filtrarCategoria('todas', this)">Todo</button>`;
    clasificaciones.forEach(c => {
        if(c.id !== null && c.productos.length > 0) {
            contenedor.innerHTML += `<button class="filter-btn" onclick="filtrarCategoria(${c.id}, this)">${c.emoji} ${c.nombre}</button>`;
        }
    });
}

let clienteSeleccionadoVenta = null;

async function buscarClientesVenta(e, tipo) {
    const busqueda = e.target.value.trim().toLowerCase();
    const dropdownId = tipo === 'nombre' ? 'sugerencias-nombre' : 'sugerencias-telefono';
    const dropdown = document.getElementById(dropdownId);
    
    if (busqueda.length < 2) {
        dropdown.classList.add('hidden');
        return;
    }
    
    try {
        const clientes = await obtenerClientesWrapper();
        let resultados;
        
        if (tipo === 'nombre') {
            resultados = clientes.filter(c => 
                c.nombre.toLowerCase().includes(busqueda)
            ).slice(0, 5);
        } else {
            resultados = clientes.filter(c => 
                c.telefono.includes(busqueda)
            ).slice(0, 5);
        }
        
        if (resultados.length === 0) {
            dropdown.classList.add('hidden');
            return;
        }
        
        dropdown.innerHTML = resultados.map(c => `
            <div class="sugerencia-item" onclick="seleccionarClienteVenta(${c.id}, '${c.nombre}', '${c.telefono}', '${c.direccion || ''}')">
                <div class="sugerencia-nombre">${c.nombre}</div>
                <div class="sugerencia-tel">📱 ${c.telefono}</div>
                ${c.direccion ? `<div class="sugerencia-direccion">📍 ${c.direccion}</div>` : ''}
            </div>
        `).join('');
        
        dropdown.classList.remove('hidden');
        
    } catch (error) {
        console.error("Error al buscar clientes:", error);
    }
}

function seleccionarClienteVenta(id, nombre, telefono, direccion) {
    clienteSeleccionadoVenta = { id, nombre, telefono, direccion };
    
    // Autocompletar ambos campos
    document.getElementById('nombre-cliente').value = nombre;
    document.getElementById('telefono-cliente').value = telefono;
    
    // Cerrar sugerencias
    document.getElementById('sugerencias-nombre').classList.add('hidden');
    document.getElementById('sugerencias-telefono').classList.add('hidden');
}

function actualizarInfoClientePago() {
    const inputNombre = document.getElementById('nombre-cliente').value.trim();
    const inputTelefono = document.getElementById('telefono-cliente').value.trim();
    const btnRegistrar = document.getElementById('btn-registrar-cliente-venta');
    
    if (clienteSeleccionadoVenta) {
        // Cliente ya registrado seleccionado
        document.getElementById('display-tel-pago').innerText = clienteSeleccionadoVenta.telefono;
        document.getElementById('display-nombre-pago').innerText = clienteSeleccionadoVenta.nombre;
        document.getElementById('display-dir-pago').innerText = clienteSeleccionadoVenta.direccion || 'Sin dirección';
        btnRegistrar.style.display = 'none';
    } else if (inputNombre && inputTelefono) {
        // Hay nombre Y teléfono pero no es un cliente registrado
        document.getElementById('display-tel-pago').innerText = inputTelefono;
        document.getElementById('display-nombre-pago').innerText = inputNombre;
        document.getElementById('display-dir-pago').innerText = '-';
        btnRegistrar.style.display = 'inline-block';
    } else if (inputNombre || inputTelefono) {
        // Solo hay uno de los dos
        document.getElementById('display-tel-pago').innerText = inputTelefono || '-';
        document.getElementById('display-nombre-pago').innerText = inputNombre || 'Datos incompletos';
        document.getElementById('display-dir-pago').innerText = '-';
        btnRegistrar.style.display = 'none';
    } else {
        // Sin información de cliente
        document.getElementById('display-tel-pago').innerText = 'Venta sin cliente (Público general)';
        document.getElementById('display-nombre-pago').innerText = '-';
        document.getElementById('display-dir-pago').innerText = '-';
        btnRegistrar.style.display = 'none';
    }
}

function manejarBusquedaNombre(e) {
    buscarClientesVenta(e, 'nombre');
}

function manejarFocusNombre(e) {
    if (e.target.value.length >= 2) {
        buscarClientesVenta(e, 'nombre');
    }
}

function manejarBusquedaTelefono(e) {
    buscarClientesVenta(e, 'telefono');
}

function manejarFocusTelefono(e) {
    if (e.target.value.length >= 2) {
        buscarClientesVenta(e, 'telefono');
    }
}

function registrarClienteDesdeVenta() {
    const nombre = document.getElementById('nombre-cliente').value.trim();
    const telefono = document.getElementById('telefono-cliente').value.trim();
    
    // Prellenar el modal
    document.getElementById('cli-nombre').value = nombre;
    document.getElementById('cli-telefono').value = telefono;
    document.getElementById('cli-direccion').value = '';
    
    document.getElementById('modal-cliente').classList.remove('hidden');
}

function filtrarCategoria(catId, btnElement) {
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    btnElement.classList.add('active');
    if (catId === 'todas') renderizarGridVenta(productosGlobales);
    else {
        const cat = clasificaciones.find(c => c.id === catId);
        renderizarGridVenta(cat ? cat.productos : []);
    }
}

function filtrarProductosVenta(texto) {
    const filtrados = productosGlobales.filter(p => p.nombre.toLowerCase().includes(texto.toLowerCase()));
    renderizarGridVenta(filtrados);
}

function renderizarGridVenta(listaProductos) {
    const grid = document.getElementById('grid-venta');
    if (listaProductos.length === 0) {
        grid.innerHTML = '<p style="color:#9ca3af; text-align:center; width:100%;">No hay productos</p>';
        return;
    }
    const mostrarStock = document.getElementById('adj-mostrar-stock')?.checked;

    grid.innerHTML = listaProductos.map(p => `
        <div class="product-card" onclick="agregarAlCarrito(${p.id})" id="pcard-${p.id}">
            <div class="product-visual">${p.imagen ? `<img src="file://${p.imagen}" class="product-img-display" onerror="this.style.display='none';this.nextElementSibling.style.display=''"><span class="product-emoji" style="display:none">${p.emoji || '📦'}</span>` : `<span class="product-emoji">${p.emoji || '📦'}</span>`}</div>
            <h4>${p.nombre}</h4>
            <p class="precio">$${p.precio.toFixed(2)}</p>
            ${mostrarStock ? `<div id="stock-badge-${p.id}" style="font-size:0.75em; color:#9ca3af; margin-top:3px;">...</div>` : ''}
        </div>`).join('');

    if (mostrarStock) {
        listaProductos.forEach(p => {
            window.api.calcularStockProducto(p.id).then(stock => {
                const el = document.getElementById(`stock-badge-${p.id}`);
                if (!el) return;
                if (stock === null) {
                    el.innerHTML = '';
                } else if (stock === 0) {
                    el.innerHTML = '<span style="color:#ef4444; font-weight:600;">Sin stock</span>';
                    document.getElementById(`pcard-${p.id}`)?.style.setProperty('opacity', '0.5');
                } else if (stock <= 3) {
                    el.innerHTML = `<span style="color:#f59e0b; font-weight:600;">⚠ ${stock} disponibles</span>`;
                } else {
                    el.innerHTML = `<span style="color:#10b981;">${stock} disponibles</span>`;
                }
            }).catch(() => {});
        });
    }
}

// --- CARRITO ---
function agregarAlCarrito(productoId) {
    const producto = productosGlobales.find(p => p.id === productoId);
    if (!producto) return;

    // Se agrega como item único (desagrupado)
    carrito.push({
        id: producto.id,
        nombre: producto.nombre,
        precio: producto.precio,
        cantidad: 1,
        nota: ''
    });
    renderizarCarrito();
}

function renderizarCarrito() {
    const contenedor = document.getElementById('carrito-items');
    const subtotalEl = document.getElementById('subtotal-venta');
    const descuentoEl = document.getElementById('descuento-aplicado');
    const totalEl = document.getElementById('total-venta');
    
    if (carrito.length === 0) {
        contenedor.innerHTML = '<div class="empty-cart-msg">El carrito está vacío</div>';
        if (subtotalEl) subtotalEl.innerText = '$0.00';
        if (descuentoEl) descuentoEl.innerText = '-$0.00';
        totalEl.innerText = '$0.00';
        return;
    }

    let subtotal = 0;
    contenedor.innerHTML = carrito.map((item, index) => {
        subtotal += item.precio;
        return `
        <div class="cart-item">
            <div class="cart-qty">1</div>
            <div class="cart-info">
                <h5>${item.nombre}</h5>
                <div class="cart-price">$${item.precio.toFixed(2)}</div>
                ${item.nota ? `<span class="cart-note">📝 ${item.nota}</span>` : ''}
            </div>
            <div class="cart-actions">
    <button class="btn-ticket-action" onclick="abrirModalNotas(${index})" title="Agregar nota" style="display:flex; align-items:center; justify-content:center; color:#6b7280;">
        <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/><path d="m15 5 4 4"/></svg>
    </button>
    <button class="btn-ticket-action" onclick="eliminarDelCarrito(${index})" title="Eliminar" style="display:flex; align-items:center; justify-content:center; color:#ef4444;">
        <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 11v6"/><path d="M14 11v6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
    </button>
</div>
        </div>`;
    }).join('');
    
    // Actualizar subtotal, descuento y total
    const totalFinal = subtotal - descuentoActual;
    if (subtotalEl) subtotalEl.innerText = `$${subtotal.toFixed(2)}`;
    if (descuentoEl) descuentoEl.innerText = `-$${descuentoActual.toFixed(2)}`;
    totalEl.innerText = `$${totalFinal.toFixed(2)}`;
}

function eliminarDelCarrito(index) {
    carrito.splice(index, 1);
    renderizarCarrito();
}

function limpiarCarrito() {
    if (carrito.length === 0) return;
    
    if (confirm('¿Vaciar el carrito?')) {
        carrito = [];
        descuentoActual = 0;
        clienteSeleccionadoVenta = null;
        
        // Limpiar campos de cliente
        document.getElementById('nombre-cliente').value = '';
        document.getElementById('telefono-cliente').value = '';
        
        // Cerrar sugerencias si están abiertas
        document.getElementById('sugerencias-nombre')?.classList.add('hidden');
        document.getElementById('sugerencias-telefono')?.classList.add('hidden');
        
        renderizarCarrito();
    }
}

// --- NOTAS ---
function abrirModalNotas(index) {
    itemNotaEditandoIndex = index;
    document.getElementById('nota-producto-nombre').innerText = `Nota para: ${carrito[index].nombre}`;
    document.getElementById('texto-nota').value = carrito[index].nota || '';
    document.getElementById('modalNotas').classList.remove('hidden');
}

function agregarTagNota(tag) {
    const txt = document.getElementById('texto-nota');
    txt.value += (txt.value ? ' ' : '') + tag + ' ';
    txt.focus();
}

function guardarNota() {
    if (itemNotaEditandoIndex !== null) {
        carrito[itemNotaEditandoIndex].nota = document.getElementById('texto-nota').value.trim();
        renderizarCarrito();
    }
    cerrarModalNotas();
}

function cerrarModalNotas() { 
    document.getElementById('modalNotas').classList.add('hidden'); 
    itemNotaEditandoIndex = null;
}

/* ============================================
   NUEVAS FUNCIONES DE VENTA Y PAGO
   ============================================ */

// --- PROCESAR VENTA (ABRE EL MODAL DE PAGO) ---
function procesarVenta() {
    if (carrito.length === 0) {
        alert('El carrito está vacío');
        return;
    }
    
    const total = carrito.reduce((sum, i) => sum + i.precio, 0) - descuentoActual;
    document.getElementById('pago-total-display').innerText = `$${total.toFixed(2)}`;
    
    // Mostrar información del cliente en el modal
    actualizarInfoClientePago();
    
    resetearModalPago();
    document.getElementById('modalPago').classList.remove('hidden');
}

// --- SELECCIONAR MÉTODO DE PAGO ---
function seleccionarMetodo(metodo) {
    metodoSeleccionado = metodo;
    
    // Quitar selección de todos los botones
    document.querySelectorAll('.method-btn').forEach(btn => {
        btn.classList.remove('selected');
    });
    
    // Marcar el botón seleccionado
    document.getElementById(`method-${metodo}`).classList.add('selected');
    
    // Mostrar u ocultar calculadora de cambio
    const calcSection = document.getElementById('cambio-section');
    const btnConfirmar = document.getElementById('btn-confirmar-final');
    
    if (metodo === 'efectivo') {
        calcSection.classList.remove('hidden');
        btnConfirmar.classList.add('disabled');
        btnConfirmar.disabled = true;
        
        // Limpiar el input de efectivo
        document.getElementById('efectivo-recibido').value = '';
        document.getElementById('cambio-monto').innerText = '$0.00';
    } else {
        calcSection.classList.add('hidden');
        btnConfirmar.classList.remove('disabled');
        btnConfirmar.disabled = false;
    }
}

// --- CALCULAR CAMBIO EN TIEMPO REAL ---
function calcularCambio() {
    const total = carrito.reduce((sum, i) => sum + i.precio, 0) - descuentoActual;
    const inputRecibido = document.getElementById('efectivo-recibido').value;
    
    // Limpiar el valor: permitir solo números y punto decimal
    const valorLimpio = inputRecibido.replace(/[^\d.]/g, '');
    const recibido = parseFloat(valorLimpio) || 0;
    
    const cambio = recibido - total;
    
    const display = document.getElementById('cambio-monto');
    if (display) {
        const cambioFinal = cambio > 0 ? cambio : 0;
        display.innerText = `$${cambioFinal.toFixed(2)}`;
        display.style.color = cambio >= 0 ? '#10b981' : '#ef4444';
    }

    // Habilitar/deshabilitar botón según el pago
    const btnConfirmar = document.getElementById('btn-confirmar-final');
    if (btnConfirmar) {
        if (recibido >= total) {
            btnConfirmar.classList.remove('disabled');
            btnConfirmar.disabled = false;
        } else {
            btnConfirmar.classList.add('disabled');
            btnConfirmar.disabled = true;
        }
    }
}

// --- EJECUTAR VENTA (CONFIRMAR Y REGISTRAR) ---
async function ejecutarVenta() {
    if (!metodoSeleccionado) {
        alert('Selecciona un método de pago');
        return;
    }

    const btnFinal = document.getElementById('btn-confirmar-final');
    if (btnFinal) btnFinal.disabled = true;
    
    const total = carrito.reduce((sum, i) => sum + i.precio, 0) - descuentoActual;
    
    // Determinar el cliente_id (solo si hay un cliente seleccionado Y REGISTRADO)
    let clienteId = null;
    let infoClienteTemp = null;
    
    if (clienteSeleccionadoVenta && clienteSeleccionadoVenta.id) {
        clienteId = clienteSeleccionadoVenta.id;
    } else {
        // Si hay nombre o teléfono pero no está registrado, guardar como temporal
        const nombre = document.getElementById('nombre-cliente').value.trim();
        const telefono = document.getElementById('telefono-cliente').value.trim();
        if (nombre || telefono) {
            infoClienteTemp = `${nombre}${nombre && telefono ? ' - ' : ''}${telefono}`;
        }
    }
    
    try {
        const datosPedido = {
            cliente_id: clienteId,
            total: total,
            metodo_pago: metodoSeleccionado,
            tipo_pedido: tipoPedidoActual || 'comer',
            referencia: document.getElementById('pedido-referencia')?.value || '',
            direccion_domicilio: document.getElementById('dom-direccion')?.value || '',
            link_maps: document.getElementById('dom-link')?.value || '',
            notas_generales: '',
            info_cliente_temp: infoClienteTemp,
            cajero: nombreActivo || null
        };
        
        const itemsParaDB = carrito.map(i => ({
            id: i.id,
            cantidad: 1,
            precio: i.precio,
            subtotal: i.precio,
            nota: i.nota || ''
        }));
        
        const pedidoId = await crearPedidoWrapper(datosPedido, itemsParaDB);
        
        // Guardar ID del pedido para impresión
        window.ultimoPedidoId = pedidoId;
        
        cerrarModalPago();
        
        mostrarNotificacionExito(`Venta registrada - Total: $${total.toFixed(2)}`, '¡Venta Exitosa!');
        
        // Preguntar si quiere imprimir el ticket
        mostrarModalImpresion(pedidoId);
        
        // Limpiar todo
        carrito = [];
        metodoSeleccionado = null;
        descuentoActual = 0;
        clienteSeleccionadoVenta = null;
        document.getElementById('telefono-cliente').value = '';
        document.getElementById('nombre-cliente').value = '';
        renderizarCarrito();
        
    } catch (e) {
        console.error(e);
        alert("Error al guardar: " + e);
        const btnFinal = document.getElementById('btn-confirmar-final');
        if (btnFinal) btnFinal.disabled = false;
    }
}
        

// --- CERRAR MODAL DE PAGO ---
function cerrarModalPago() {
    document.getElementById('modalPago').classList.add('hidden');
    metodoSeleccionado = null;
}

// --- APLICAR DESCUENTO ---
async function abrirModalDescuento() {
    const inputMonto = document.getElementById('desc-monto-custom');
    const inputPct = document.getElementById('desc-pct-custom');
    if (inputMonto) inputMonto.value = descuentoActual > 0 ? descuentoActual : '';
    if (inputPct) inputPct.value = '';
    
    // Cargar descuentos predefinidos
    const contenedor = document.getElementById('descuentos-rapidos');
    try {
        const descuentos = await window.api.obtenerDescuentos();
        if (!descuentos.length) {
            contenedor.innerHTML = '<span style="color:#9ca3af; font-size:0.85em;">Sin descuentos predefinidos. Créalos en la sección Ofertas.</span>';
        } else {
            const subtotal = carrito.reduce((sum, i) => sum + i.precio, 0);
            contenedor.innerHTML = descuentos.map(d => {
                const montoCalc = d.tipo === 'porcentaje'
                    ? (subtotal * d.valor / 100).toFixed(2)
                    : parseFloat(d.valor).toFixed(2);
                return `<button onclick="aplicarDescuentoRapido(${d.tipo === 'porcentaje' ? d.valor : 0}, ${d.tipo === 'monto_fijo' ? d.valor : 0})"
                    style="background:#eff6ff; border:1px solid #bfdbfe; color:#1d4ed8; padding:8px 14px; border-radius:8px; cursor:pointer; font-size:0.85em; font-weight:600; transition:0.2s;"
                    onmouseover="this.style.background='#dbeafe'" onmouseout="this.style.background='#eff6ff'">
                    ${d.nombre}<br><span style="font-weight:400; color:#6b7280;">-$${montoCalc}</span>
                </button>`;
            }).join('');
        }
    } catch(e) {
        contenedor.innerHTML = '<span style="color:#9ca3af; font-size:0.85em;">No se pudieron cargar.</span>';
    }

    actualizarPreviewDescuento();
    document.getElementById('modal-descuento').classList.remove('hidden');
}

function aplicarDescuentoRapido(pct, monto) {
    const subtotal = carrito.reduce((sum, i) => sum + i.precio, 0);
    descuentoActual = pct > 0 ? (subtotal * pct / 100) : monto;
    cerrarModalDescuento();
    renderizarCarrito();
}

function cerrarModalDescuento() {
    document.getElementById('modal-descuento').classList.add('hidden');
}

function actualizarPreviewDescuento() {
    const subtotal = carrito.reduce((sum, i) => sum + i.precio, 0);
    const pct = parseFloat(document.getElementById('desc-pct-custom')?.value) || 0;
    const monto = parseFloat(document.getElementById('desc-monto-custom')?.value) || 0;
    const descPreview = pct > 0 ? (subtotal * pct / 100) : monto;
    const totalPreview = Math.max(0, subtotal - descPreview);
    const el = document.getElementById('desc-preview-total');
    if (el) el.innerText = `$${totalPreview.toFixed(2)}`;
}

function aplicarDescuentoModal() {
    const subtotal = carrito.reduce((sum, i) => sum + i.precio, 0);
    const pct = parseFloat(document.getElementById('desc-pct-custom').value) || 0;
    const monto = parseFloat(document.getElementById('desc-monto-custom').value) || 0;
    descuentoActual = pct > 0 ? (subtotal * pct / 100) : monto;
    if (descuentoActual < 0) descuentoActual = 0;
    if (descuentoActual > subtotal) descuentoActual = subtotal;
    cerrarModalDescuento();
    renderizarCarrito();
}

function quitarDescuento() {
    descuentoActual = 0;
    cerrarModalDescuento();
    renderizarCarrito();
}

// --- MOSTRAR NOTIFICACIÓN DE ÉXITO ---
function mostrarNotificacionExito(mensaje, titulo = '¡Operación Exitosa!') {
    const toast = document.getElementById('toast-success');
    const tituloEl = toast.querySelector('.toast-msg strong');
    const subtextEl = document.getElementById('toast-subtext');
    
    if (tituloEl) {
        tituloEl.innerText = titulo;
    }
    
    if (subtextEl) {
        subtextEl.innerText = mensaje;
    }
    
    if (toast) {
        toast.classList.remove('hidden');
        toast.classList.add('show-toast');
        
        setTimeout(() => {
            toast.classList.remove('show-toast');
            setTimeout(() => toast.classList.add('hidden'), 500);
        }, 3000);
    }
}

function mostrarModalImpresion(pedidoId) {
    const modal = document.getElementById('modal-imprimir-ticket');
    if (!modal) return;

    document.getElementById('print-confirm-sub').textContent = `Venta #${pedidoId} registrada correctamente`;
    modal.classList.remove('hidden');

    const btnSi = document.getElementById('btn-si-imprimir');
    const btnNo = document.getElementById('btn-no-imprimir');

    const autoClose = setTimeout(() => modal.classList.add('hidden'), 8000);

    const cerrar = () => {
        clearTimeout(autoClose);
        modal.classList.add('hidden');
        btnSi.onclick = null;
        btnNo.onclick = null;
    };

    btnSi.onclick = () => { cerrar(); imprimirTicket(pedidoId); };
    btnNo.onclick = () => cerrar();
}

/* ============================================
   ADMINISTRACIÓN (PRODUCTOS Y DASHBOARD)
   ============================================ */

async function cargarDashboard() {
    try {
        const stats = await obtenerEstadisticasWrapper();
        console.log('📊 Stats completos:', stats); // ⬅️ LÍNEA TEMPORAL DE DEBUG
        
        // ============ KPIs PRINCIPALES ============
        
        // Ventas Hoy
        const ventasHoy = stats.ventasHoy.monto_total || 0;
        const ventasAyer = stats.ventasAyer.monto_total || 0;
        const pedidosHoy = stats.ventasHoy.total_pedidos || 0;
        
        document.getElementById('dash-ventas-hoy').innerText = `$${ventasHoy.toFixed(2)}`;
        document.getElementById('dash-ventas-count').innerText = `${pedidosHoy} ${pedidosHoy === 1 ? 'pedido' : 'pedidos'}`;
        
        // Comparación con ayer
        if (ventasAyer > 0) {
            const cambio = ((ventasHoy - ventasAyer) / ventasAyer * 100).toFixed(1);
            const badge = document.getElementById('dash-ventas-comp');
            if (cambio > 0) {
                badge.innerText = `↗️ +${cambio}%`;
                badge.className = 'kpi-badge positive';
            } else if (cambio < 0) {
                badge.innerText = `↘️ ${cambio}%`;
                badge.className = 'kpi-badge negative';
            } else {
                badge.innerText = '→ 0%';
                badge.className = 'kpi-badge';
            }
        } else {
            document.getElementById('dash-ventas-comp').innerText = 'Primer día';
        }
        
        // Ticket Promedio
        const ticketProm = stats.ventasHoy.ticket_promedio || 0;
        document.getElementById('dash-ticket-prom').innerText = `$${ticketProm.toFixed(2)}`;
        
        // Items Vendidos
        document.getElementById('dash-items').innerText = stats.itemsVendidosHoy || 0;
        
        // Alerta de Stock Bajo
        const stockBajo = stats.productosStockBajo || 0;
        const stockAlerta = document.getElementById('dash-stock-alerta');
        if (stockBajo > 0) {
            stockAlerta.innerText = `⚠️ ${stockBajo} con stock bajo`;
            stockAlerta.style.color = '#ef4444';
        } else {
            stockAlerta.innerText = '✅ Stock normal';
            stockAlerta.style.color = '#10b981';
        }
        
        // Clientes Activos
        document.getElementById('dash-clientes').innerText = stats.clientesHoy || 0;
        const vipHoy = stats.clientesVIPHoy?.length || 0;
        document.getElementById('dash-clientes-vip').innerText = `${vipHoy} VIP hoy`;
        
        // ============ GRÁFICA VENTAS 7 DÍAS ============
        
        renderizarGraficaVentas(stats.ultimos7Dias || []);
        // Gráfica de 24 horas
        renderizarGrafica24Horas(stats.ventasPorHora || []);
        
        // ============ TOP 5 PRODUCTOS ============
        
        const topContainer = document.getElementById('top-productos-lista');
        if (!stats.topProductos || stats.topProductos.length === 0) {
            topContainer.innerHTML = '<p style="text-align: center; color: #9ca3af; padding: 40px;">Sin datos aún</p>';
        } else {
            const medallas = ['🥇', '🥈', '🥉'];
            const clases = ['gold', 'silver', 'bronze'];
            
            topContainer.innerHTML = stats.topProductos.map((prod, index) => `
                <div class="top-producto-item">
                    <div class="top-producto-rank ${clases[index] || ''}">${index + 1}</div>
                    <div class="top-producto-emoji">${prod.emoji || '📦'}</div>
                    <div class="top-producto-info">
                        <div class="top-producto-nombre">${prod.nombre}</div>
                        <div class="top-producto-cantidad">Últimos 7 días</div>
                    </div>
                    <div class="top-producto-badge">${prod.total_vendido}</div>
                </div>
            `).join('');
        }
        
        // ============ ÚLTIMAS VENTAS ============
        
        const ventasContainer = document.getElementById('ultimas-ventas-lista');
        if (!stats.ultimasVentas || stats.ultimasVentas.length === 0) {
            ventasContainer.innerHTML = '<p style="text-align: center; color: #9ca3af; padding: 20px;">Sin ventas registradas</p>';
        } else {
            ventasContainer.innerHTML = stats.ultimasVentas.map(venta => {
                const fecha = new Date(venta.fecha_pedido);
                const hora = fecha.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
                
                return `
                    <div class="activity-item">
                        <div class="activity-time">${hora}</div>
                        <div class="activity-cliente">${venta.cliente}</div>
                        <div class="activity-monto">$${venta.total.toFixed(2)}</div>
                    </div>
                `;
            }).join('');
        }
        
        // ============ CLIENTES VIP HOY ============
        
        const vipContainer = document.getElementById('clientes-vip-hoy');
        if (!stats.clientesVIPHoy || stats.clientesVIPHoy.length === 0) {
            vipContainer.innerHTML = '<p style="color: #9ca3af; font-size: 0.85em;">Ninguno aún</p>';
        } else {
            vipContainer.innerHTML = stats.clientesVIPHoy.map(cliente => `
                <div class="vip-item">
                    <div class="vip-item-icon">⭐</div>
                    <div class="vip-item-info">
                        <div class="vip-item-nombre">${cliente.nombre}</div>
                        <div class="vip-item-tel">${cliente.telefono}</div>
                    </div>
                </div>
            `).join('');
        }
        
        // ============ ALERTAS ============
        
        const alertasContainer = document.getElementById('alertas-dashboard');
        const alertas = [];
        
        if (stockBajo > 0) {
            alertas.push(`
                <div class="alerta-item">
                    <div class="alerta-item-icon">⚠️</div>
                    <div>${stockBajo} producto${stockBajo > 1 ? 's' : ''} con stock bajo</div>
                </div>
            `);
        }
        
        if (pedidosHoy === 0) {
            alertas.push(`
                <div class="alerta-item">
                    <div class="alerta-item-icon">📊</div>
                    <div>Sin ventas registradas hoy</div>
                </div>
            `);
        }
        
        if (alertas.length === 0) {
            alertasContainer.innerHTML = '<p style="color: #10b981; font-size: 0.85em;">✅ Todo en orden</p>';
        } else {
            alertasContainer.innerHTML = alertas.join('');
        }
        
    } catch (e) {
        console.error('Error al cargar dashboard:', e);
    }
}

// Función auxiliar para la gráfica
let chartVentas = null; // Variable global para almacenar la instancia del chart

function renderizarGraficaVentas(datos) {
    const canvas = document.getElementById('chart-ventas-7dias');
    if (!canvas) {
        console.error('Canvas no encontrado');
        return;
    }
    
    // Destruir chart anterior si existe
    if (chartVentas) {
        chartVentas.destroy();
    }
    
    // Generar últimos 7 días SIEMPRE (aunque no haya datos)
    const labels = [];
    const valores = [];
    const hoy = new Date();
    
    for (let i = 6; i >= 0; i--) {
        const fecha = new Date(hoy);
        fecha.setDate(fecha.getDate() - i);
        const fechaStr = fecha.toISOString().split('T')[0];
        
        const dia = fecha.toLocaleDateString('es-MX', { weekday: 'short' });
        labels.push(dia.charAt(0).toUpperCase() + dia.slice(1));
        
        const dato = datos.find(d => d.fecha === fechaStr);
        valores.push(dato ? dato.monto : 0);
    }
    
    const ctx = canvas.getContext('2d');
    
    // Verificar si Chart está disponible
    if (typeof Chart === 'undefined') {
        console.error('Chart.js no está cargado');
        canvas.parentElement.innerHTML = '<p style="color: #ef4444; text-align: center; padding: 40px;">Error: Chart.js no cargado</p>';
        return;
    }
    
    chartVentas = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Ventas ($)',
                data: valores,
                borderColor: '#2563eb',
                backgroundColor: 'rgba(37, 99, 235, 0.1)',
                borderWidth: 3,
                tension: 0.4,
                fill: true,
                pointBackgroundColor: '#2563eb',
                pointBorderColor: '#fff',
                pointBorderWidth: 2,
                pointRadius: 5,
                pointHoverRadius: 7
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            aspectRatio: 2.5,
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    backgroundColor: 'rgba(0, 0, 0, 0.8)',
                    padding: 12,
                    titleColor: '#fff',
                    bodyColor: '#fff',
                    callbacks: {
                        label: function(context) {
                            return '$' + context.parsed.y.toFixed(2);
                        }
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        callback: function(value) {
                            return '$' + value;
                        }
                    },
                    grid: {
                        color: '#f3f4f6'
                    }
                },
                x: {
                    grid: {
                        display: false
                    }
                }
            }
        }
    });
}

let chart24Horas = null;

function renderizarGrafica24Horas(datos) {
    const canvas = document.getElementById('chart-24horas');
    if (!canvas) return;
    
    // Destruir chart anterior si existe
    if (chart24Horas) {
        chart24Horas.destroy();
    }
    
    // Generar todas las horas (0-23)
    const labels = [];
    const valores = [];
    
    for (let h = 0; h < 24; h++) {
        const horaStr = h.toString().padStart(2, '0');
        labels.push(`${horaStr}:00`);
        
        const dato = datos.find(d => parseInt(d.hora) === h);
        valores.push(dato ? dato.pedidos : 0);
    }
    
    if (typeof Chart === 'undefined') {
        console.error('Chart.js no está cargado');
        return;
    }
    
    const ctx = canvas.getContext('2d');
    chart24Horas = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Pedidos',
                data: valores,
                backgroundColor: 'rgba(37, 99, 235, 0.6)',
                borderColor: '#2563eb',
                borderWidth: 2,
                borderRadius: 6
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            aspectRatio: 3,
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    backgroundColor: 'rgba(0, 0, 0, 0.8)',
                    padding: 12,
                    callbacks: {
                        label: function(context) {
                            return context.parsed.y + ' pedidos';
                        }
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        stepSize: 1
                    },
                    grid: {
                        color: '#f3f4f6'
                    }
                },
                x: {
                    grid: {
                        display: false
                    }
                }
            }
        }
    });
}

// --- MODALES ADMIN ---
function cargarSelectorEmojis(tipo) {
    const cont = document.getElementById(`${tipo}EmojiPicker`);
    if (cont) {
        cont.innerHTML = EMOJIS_DISPONIBLES.map(e => 
            `<div class="emoji-btn" onclick="seleccionarEmoji('${tipo}','${e}')">${e}</div>`
        ).join('');
    }
}

function seleccionarEmoji(tipo, e) {
    emojiSeleccionado = e;
    const display = document.getElementById(`${tipo}EmojiDisplay`);
    if (display) {
        display.innerText = e;
    }
    const picker = document.getElementById(`${tipo}EmojiPicker`);
    if (picker) {
        picker.style.display = 'none';
    }
}

function toggleEmojiPicker(tipo) {
    const el = document.getElementById(`${tipo}EmojiPicker`);
    if (el) {
        el.style.display = el.style.display === 'none' ? 'grid' : 'none';
    }
}

async function seleccionarImagenProducto() {
    const rutaImagen = await window.api.seleccionarImagen();
    if (rutaImagen) {
        rutaImagenTemporal = rutaImagen;
        document.getElementById('prodImagenRuta').value = rutaImagen;
        document.getElementById('prodEmojiDisplay').style.display = 'none';
        const preview = document.getElementById('prodImagenPreview');
        preview.src = 'file://' + rutaImagen;
        preview.style.display = 'block';
    }
}

async function seleccionarImagenCategoria() {
    const rutaImagen = await window.api.seleccionarImagen();
    if (rutaImagen) {
        document.getElementById('catImagenRuta').value = rutaImagen;
        document.getElementById('catEmojiDisplay').style.display = 'none';
        const preview = document.getElementById('catImagenPreview');
        preview.src = 'file://' + rutaImagen;
        preview.style.display = 'block';
    }
}

async function cargarProductosAdmin() {
    try {
        clasificaciones = await obtenerProductosAgrupadosWrapper();
        const contenedor = document.getElementById('lista-productos');
        
        if (!contenedor) return;
        
        contenedor.innerHTML = clasificaciones.map(cat => `
            <div class="clasificacion-bloque">
                <div class="clasificacion-header">
                    <h3>
                        ${cat.imagen 
                            ? `<img src="file://${cat.imagen}" style="width: 30px; height: 30px; border-radius: 6px; object-fit: cover; margin-right: 8px; vertical-align: middle;">` 
                            : `${cat.emoji || '📦'}`
                        } 
                        ${cat.nombre}
                    </h3>
                    ${cat.id ? `
                        <div>
                            <button class="btn-secondary small" onclick="editarCategoria(${cat.id},'${cat.nombre}','${cat.emoji}','${cat.imagen || ''}')">✏️</button>
                        </div>
                    ` : ''}
                </div>
                <div class="productos-grid">
                    ${cat.productos.length > 0 ? cat.productos.map(p => `
                        <div class="product-card" onclick="editarProducto(${p.id})">
                            <div class="product-visual">
                                ${p.imagen
                                    ? `<img src="file://${p.imagen}" class="product-img-display" onerror="this.style.display='none';this.nextElementSibling.style.display=''"><span class="product-emoji" style="display:none">${p.emoji || '📦'}</span>`
                                    : `<span class="product-emoji">${p.emoji || '📦'}</span>`
                                }
                            </div>
                            <h4>${p.nombre}</h4>
                            <p class="precio">$${p.precio.toFixed(2)}</p>
                        </div>
                    `).join('') : '<p style="color: #9ca3af; padding: 20px;">No hay productos en esta categoría</p>'}
                </div>
            </div>
        `).join('');
    } catch (e) {
        console.error('Error al cargar productos:', e);
    }
}

async function abrirModalProducto(p = null) {
    productoEditandoId = p ? p.id : null;
    emojiSeleccionado = p ? p.emoji : '📦';
    
    document.getElementById('prodNombre').value = p ? p.nombre : '';
    document.getElementById('prodDescripcion').value = p ? p.descripcion : '';
    document.getElementById('prodPrecio').value = p ? p.precio : '';
    document.getElementById('prodStock').value = p ? p.stock : '';
    document.getElementById('prodEmojiDisplay').innerText = emojiSeleccionado;
    
    const cats = await window.api.obtenerClasificacionesRaw();
    const sel = document.getElementById('prodCategoria');
    sel.innerHTML = '<option value="">Sin Categoría</option>' + 
        cats.map(c => `<option value="${c.id}" ${p && p.clasificacion_id==c.id ? 'selected':''}>${c.nombre}</option>`).join('');
    

// Resetear estado de imagen siempre al abrir
    rutaImagenTemporal = null;
    document.getElementById('prodImagenRuta').value = '';
    
    if (p && p.imagen) {
        // Producto existente CON imagen: mostrar imagen, ocultar emoji
        const preview = document.getElementById('prodImagenPreview');
        preview.src = 'file://' + p.imagen;
        preview.style.display = 'block';
        document.getElementById('prodEmojiDisplay').style.display = 'none';
    } else {
        // Producto nuevo O existente sin imagen: mostrar emoji, ocultar imagen
        document.getElementById('prodImagenPreview').style.display = 'none';
        document.getElementById('prodImagenPreview').src = '';
        document.getElementById('prodEmojiDisplay').style.display = 'inline';
        document.getElementById('prodEmojiDisplay').innerText = emojiSeleccionado;
    }

    document.getElementById('modalProducto').classList.remove('hidden');
}

function cerrarModalProducto() { 
    document.getElementById('modalProducto').classList.add('hidden'); 
    productoEditandoId = null;
}

async function guardarProducto() {
    const imagenRuta = document.getElementById('prodImagenRuta').value;
    
    const p = {
        nombre: document.getElementById('prodNombre').value,
        descripcion: document.getElementById('prodDescripcion').value,
        precio: parseFloat(document.getElementById('prodPrecio').value),
        stock: parseInt(document.getElementById('prodStock').value),
        clasificacion_id: parseInt(document.getElementById('prodCategoria').value) || null,
        emoji: imagenRuta ? '' : emojiSeleccionado,  // Si hay imagen, no guardar emoji
        imagen: imagenRuta || rutaImagenTemporal
    };
    
    if (!p.nombre || !p.precio) {
        alert('Nombre y precio son obligatorios');
        return;
    }
    
    try {
        if (productoEditandoId) {
            await actualizarProductoWrapper(productoEditandoId, p);
        } else {
            await agregarProductoWrapper(p);
        }
        mostrarNotificacionExito('Producto guardado correctamente', '¡Producto Guardado!');
        cerrarModalProducto();
        cargarProductosAdmin();
    } catch (e) {
        console.error(e);
        alert('Error al guardar producto');
    }
}

async function editarProducto(id) {
    let encontrado = null;
    clasificaciones.forEach(c => {
        let p = c.productos.find(prod => prod.id === id);
        if (p) encontrado = {...p, clasificacion_id: c.id};
    });
    if (encontrado) abrirModalProducto(encontrado);
}

// --- CATEGORÍAS ---
function abrirModalCategoria(cat = null) {
    categoriaEditandoId = cat ? cat.id : null;
    emojiSeleccionado = cat ? cat.emoji : '📦';
    
    document.getElementById('catNombre').value = cat ? cat.nombre : '';
    document.getElementById('catEmojiDisplay').innerText = emojiSeleccionado;
    document.getElementById('modalCatTitulo').innerText = cat ? 'Editar Categoría' : 'Nueva Categoría';
    
    document.getElementById('modalCategoria').classList.remove('hidden');
}

function cerrarModalCategoria() { 
    document.getElementById('modalCategoria').classList.add('hidden'); 
    categoriaEditandoId = null;
}

async function guardarCategoria() {
    const nombre = document.getElementById('catNombre').value.trim();
    const imagenRuta = document.getElementById('catImagenRuta')?.value || '';
    
    if (!nombre) {
        alert('El nombre es obligatorio');
        return;
    }
    
    try {
        const datos = {
            nombre: nombre,
            emoji: imagenRuta ? '' : emojiSeleccionado,  // Si hay imagen, no usar emoji
            imagen: imagenRuta
        };
        
        if (categoriaEditandoId) {
            datos.id = categoriaEditandoId;
            await window.api.editarClasificacion(datos);
        } else {
            await window.api.agregarClasificacion(datos);
        }
        
        mostrarNotificacionExito('Categoría guardada', '¡Categoría Guardada!');
        cerrarModalCategoria();
        cargarProductosAdmin();
    } catch (e) {
        console.error(e);
        alert('Error al guardar categoría');
    }
}

function editarCategoria(id, nombre, emoji) {
    abrirModalCategoria({ id, nombre, emoji });
}
async function cargarPedidos() {
    const contenedor = document.getElementById('lista-pedidos');
    if (!contenedor) return;

    contenedor.innerHTML = '<tr><td colspan="7" style="text-align:center;">Cargando pedidos...</td></tr>';

    try {
        const pedidos = await obtenerPedidosWrapper(filtroActual);
        
        if (pedidos.length === 0) {
            contenedor.innerHTML = '<tr><td colspan="7" style="text-align:center; padding: 20px;">No hay ventas registradas todavía.</td></tr>';
            return;
        }

        // Limpiamos y llenamos la tabla
        contenedor.innerHTML = '';
        
        // Los ordenamos para que el más reciente salga arriba (.reverse)
        pedidos.forEach(p => {
    // FIX PARA FECHA: Si la fecha existe, reemplazamos el espacio por una 'T' 
    // para que el formato sea ISO (ej: 2023-10-25T14:30:00) y JS lo entienda.
    let fechaTxt = "Sin fecha";
    if (p.fecha) {
        const fechaISO = p.fecha.replace(" ", "T");
        const objFecha = new Date(fechaISO);
        if (!isNaN(objFecha)) {
            fechaTxt = objFecha.toLocaleString('es-MX', {
                dateStyle: 'short',
                timeStyle: 'short'
            });
        }
    }

    const fila = document.createElement('tr');
    fila.innerHTML = `
        <td><strong>#${p.id}</strong></td>
        <td style="font-size:13px;color:var(--text-muted);">${p.cajero || '—'}</td>
        <td>${p.telefono || 'General'}</td>
        <td>${fechaTxt}</td>
        <td style="text-transform: capitalize;">${p.metodo_pago}</td>
        <td><strong>$${parseFloat(p.total).toFixed(2)}</strong></td>
        <td>${renderizarEstadoPedido(p.id, p.estado)}</td>
        <td>
            <button class="btn-secondary small" onclick="verDetallePedido(${p.id}, '${p.telefono || 'General'}', ${p.total}, '${p.metodo_pago}')" style="display:inline-flex; align-items:center; gap:5px;">
    <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0"/><circle cx="12" cy="12" r="3"/></svg>
    Ver
</button>
<button class="btn-icon" onclick="imprimirTicket(${p.id})" title="Imprimir ticket" style="margin-left: 5px; display:inline-flex; align-items:center;">
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><path d="M6 9V3a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v6"/><rect x="6" y="14" width="12" height="8" rx="1"/></svg>
</button>
        </td>
    `;
    contenedor.appendChild(fila);
});

    } catch (error) {
        console.error("Error al cargar pedidos:", error);
        contenedor.innerHTML = '<tr><td colspan="7" style="text-align:center; color:red;">Error al cargar los datos.</td></tr>';
    }
}

function renderizarEstadoPedido(pedidoId, estadoActual) {
    const estados = {
        'registrado': { color: '#10b981', bg: '#d1fae5', texto: 'Registrado' },
        'completado': { color: '#3b82f6', bg: '#dbeafe', texto: 'Completado' },
        'entregado': { color: '#6366f1', bg: '#e0e7ff', texto: 'Entregado' },
        'cancelado': { color: '#ef4444', bg: '#fee2e2', texto: 'Cancelado' }
    };
    
    const estado = estados[estadoActual] || estados['registrado'];
    
    return `
        <select onchange="cambiarEstadoPedido(${pedidoId}, this.value, this)" 
                style="background: ${estado.bg}; color: ${estado.color}; border: 1px solid ${estado.color}; 
                       padding: 4px 8px; border-radius: 12px; font-size: 0.8em; font-weight: 600; cursor: pointer;">
            <option value="registrado" ${estadoActual === 'registrado' ? 'selected' : ''}>🟢 Registrado</option>
            <option value="completado" ${estadoActual === 'completado' ? 'selected' : ''}>🔵 Completado</option>
            <option value="entregado" ${estadoActual === 'entregado' ? 'selected' : ''}>🟣 Entregado</option>
            <option value="cancelado" ${estadoActual === 'cancelado' ? 'selected' : ''}>🔴 Cancelado</option>
        </select>
    `;
}

async function cambiarEstadoPedido(pedidoId, nuevoEstado, selectElement) {
    try {
        await window.api.actualizarEstadoPedido(pedidoId, nuevoEstado);
        
        // Actualizar el color del select en tiempo real
        const estados = {
            'registrado': { color: '#10b981', bg: '#d1fae5' },
            'completado': { color: '#3b82f6', bg: '#dbeafe' },
            'entregado': { color: '#6366f1', bg: '#e0e7ff' },
            'cancelado': { color: '#ef4444', bg: '#fee2e2' }
        };
        
        const estado = estados[nuevoEstado];
        selectElement.style.background = estado.bg;
        selectElement.style.color = estado.color;
        selectElement.style.borderColor = estado.color;
        
        mostrarNotificacionExito(`Estado actualizado a: ${nuevoEstado}`, '¡Estado Actualizado!');
    } catch (error) {
        console.error("Error al cambiar estado:", error);
        alert("Error al actualizar el estado");
        cargarPedidos();
    }
}
async function verDetallePedido(id, cliente, total, metodo) {
    document.getElementById('detalle-titulo').innerText = `Pedido #${id}`;
    document.getElementById('detalle-info-cliente').innerText = `Cliente: ${cliente}`;
    document.getElementById('detalle-total').innerText = `$${total.toFixed(2)}`;
    document.getElementById('detalle-metodo').innerText = metodo;

    const lista = document.getElementById('detalle-lista-productos');
    lista.innerHTML = 'Cargando detalles...';

    try {
        const productos = await obtenerDetallePedidoWrapper(id);
        lista.innerHTML = productos.map(item => `
            <div class="item-detalle">
                <div class="info-prod">
                    <span><strong>${item.cantidad || 1}x</strong> ${item.nombre}</span>
                    ${item.nota ? `<span class="nota-prod">Nota: ${item.nota}</span>` : ''}
                </div>
                <span>$${(item.precio * (item.cantidad || 1)).toFixed(2)}</span>
            </div>
        `).join('');
        
        document.getElementById('modalDetallePedido').classList.remove('hidden');
    } catch (error) {
        console.error("Error al obtener detalles:", error);
        alert("No se pudieron cargar los productos del pedido.");
    }
}

function cerrarModalDetalle() {
    document.getElementById('modalDetallePedido').classList.add('hidden');
}

let tipoPedidoActual = 'comer';

function seleccionarTipoPedido(tipo, btn) {
    tipoPedidoActual = tipo;
    
    // Cambiar estado visual de botones
    document.querySelectorAll('.tipo-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    
    const contenedor = document.getElementById('campos-dinamicos');
    contenedor.innerHTML = ''; // Limpiar

    if (tipo === 'comer') {
        contenedor.innerHTML = `
            <div class="campo-grupo">
                <label>Mesa # o Nombre</label>
                <input type="text" id="pedido-referencia" placeholder="Ej: Mesa 5">
            </div>
        `;
    } else if (tipo === 'llevar') {
        contenedor.innerHTML = `
            <div class="campo-grupo">
                <label>Nombre del Cliente (Opcional)</label>
                <input type="text" id="pedido-referencia" placeholder="Ej: Juan Perez">
            </div>
        `;
    } else if (tipo === 'domicilio') {
        // Prellenar con datos del cliente si está seleccionado
        let nombrePrellenado = '';
        let direccionPrellenada = '';
        
        if (clienteSeleccionadoVenta) {
            nombrePrellenado = clienteSeleccionadoVenta.nombre;
            direccionPrellenada = clienteSeleccionadoVenta.direccion || '';
        }
        
        contenedor.innerHTML = `
            <div class="campo-grupo">
                <label>Nombre (Opcional)</label>
                <input type="text" id="dom-nombre" placeholder="Nombre completo" value="${nombrePrellenado}">
            </div>
            <div class="campo-grupo">
                <label>Dirección (Opcional)</label>
                <input type="text" id="dom-direccion" placeholder="Calle, número, colonia" value="${direccionPrellenada}">
            </div>
            <div class="campo-grupo">
                <label>Link de Ubicación (Maps)</label>
                <input type="text" id="dom-link" placeholder="Pegar link de Google Maps">
            </div>
        `;
    }
}

// Inicializar el primer estado al cargar
// Llama a esto cuando abras el modal de pago
function resetearModalPago() {
    // Resetear tipo de pedido
    seleccionarTipoPedido('comer', document.querySelector('.tipo-btn'));
    
    // ✅ LIMPIAR MÉTODO DE PAGO SELECCIONADO
    metodoSeleccionado = null;
    document.querySelectorAll('.method-btn').forEach(btn => {
        btn.classList.remove('selected');
    });
    
    // Ocultar calculadora y deshabilitar botón
    document.getElementById('cambio-section').classList.add('hidden');
    const btnConfirmar = document.getElementById('btn-confirmar-final');
    btnConfirmar.classList.add('disabled');
    btnConfirmar.disabled = true;
}

async function cargarClientes() {
    const contenedor = document.getElementById('lista-clientes-body');
    if (!contenedor) return;

    try {
        // Obtener estadísticas y clientes
        const stats = await window.api.obtenerEstadisticasClientes();
        const clientes = await obtenerClientesWrapper();
        
        // Actualizar estadísticas
        document.getElementById('total-clientes-count').innerText = stats.totalClientes;
        document.getElementById('clientes-frecuentes').innerText = stats.clientesFrecuentes;
        document.getElementById('clientes-nuevos-mes').innerText = stats.clientesNuevos;

        // Renderizar Top 3 del mes
        const topLista = document.getElementById('top-clientes-lista');
        if (stats.topClientesMes.length === 0) {
            topLista.innerHTML = `
                <div style="text-align: center; padding: 40px 20px; color: #9ca3af;">
                    <div style="font-size: 2em; margin-bottom: 10px;">📊</div>
                    <p style="font-size: 0.9em;">Aún no hay compras este mes</p>
                </div>
            `;
        } else {
            const medallas = ['🥇', '🥈', '🥉'];
            topLista.innerHTML = stats.topClientesMes.map((cliente, index) => `
                <div class="top-cliente-item">
                    <div class="top-cliente-medal">${medallas[index]}</div>
                    <div class="top-cliente-info">
                        <div class="top-cliente-nombre">${cliente.nombre}</div>
                        <div class="top-cliente-stats">
                            ${cliente.total_pedidos} ${cliente.total_pedidos === 1 ? 'compra' : 'compras'} • $${cliente.monto_total.toFixed(2)}
                        </div>
                    </div>
                    <div class="top-cliente-badge">${cliente.total_pedidos}</div>
                </div>
            `).join('');
        }

        // Si no hay clientes
        if (clientes.length === 0) {
            contenedor.innerHTML = `
                <tr>
                    <td colspan="6" style="text-align: center; padding: 40px;">
                        <div style="color: #9ca3af;">
                            <div style="font-size: 3em; margin-bottom: 10px;">👥</div>
                            <p style="font-size: 1.1em; margin-bottom: 5px;">No hay clientes registrados</p>
                            <p style="font-size: 0.9em;">Agrega tu primer cliente usando el botón "Nuevo Cliente"</p>
                        </div>
                    </td>
                </tr>
            `;
            return;
        }

        // Renderizar tabla de clientes
        contenedor.innerHTML = '';
        clientes.forEach(c => {
            let fechaRegistro = 'N/A';
            if (c.fecha_registro) {
                const fecha = new Date(c.fecha_registro);
                if (!isNaN(fecha)) {
                    fechaRegistro = fecha.toLocaleDateString('es-MX', { 
                        year: 'numeric', 
                        month: 'short', 
                        day: 'numeric' 
                    });
                }
            }

            const fila = document.createElement('tr');
            fila.innerHTML = `
                <td>
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <strong style="color: #111827;">${c.nombre}</strong>
                        ${(c.total_compras || 0) >= 3 ? '<span style="color: #f59e0b;">⭐</span>' : ''}
                    </div>
                </td>
                <td>
                    <span style="color: #6b7280;">📱 ${c.telefono}</span>
                </td>
                <td>
                    ${c.direccion 
                        ? `<span style="color: #374151;">${c.direccion}</span>` 
                        : '<span class="text-muted">Sin dirección</span>'}
                </td>
                <td>
                    <span style="font-weight: 600; color: #2563eb;">
                        ${c.total_compras || 0} ${(c.total_compras || 0) === 1 ? 'compra' : 'compras'}
                    </span>
                </td>
                <td>
                    <span style="color: #6b7280; font-size: 0.9em;">${fechaRegistro}</span>
                </td>
                  <td>
                    <div style="display: flex; gap: 5px;">
                        <button class="btn-secondary small" onclick="verDetalleCliente(${c.id})"             title="Ver Detalles">
                            👁️ Ver
                        </button>
                        <button class="btn-secondary small" onclick="editarCliente(${c.id})" title="Editar">
                            ✏️ Editar
                        </button>
                        <button class="btn-secondary small" onclick="confirmarEliminarCliente(${c.id}, '${c.nombre}')" 
                                style="color: #ef4444;" title="Eliminar">
                            🗑️
                        </button>
                    </div>
                </td>
            `;
            contenedor.appendChild(fila);
        });

        // Configurar buscador
        configurarBuscadorClientes(clientes);

    } catch (err) {
        console.error("Error al cargar clientes:", err);
        contenedor.innerHTML = `
            <tr>
                <td colspan="6" style="text-align: center; padding: 40px; color: #ef4444;">
                    ❌ Error al cargar los clientes. Por favor intenta de nuevo.
                </td>
            </tr>
        `;
    }
}

// Función para el buscador de clientes
function configurarBuscadorClientes(clientes) {
    const inputBuscar = document.getElementById('buscar-cliente');
    if (!inputBuscar) return;

    inputBuscar.addEventListener('input', (e) => {
        const busqueda = e.target.value.toLowerCase().trim();
        const tbody = document.getElementById('lista-clientes-body');
        
        if (busqueda === '') {
            // Si no hay búsqueda, mostrar todos
            cargarClientes();
            return;
        }

        const clientesFiltrados = clientes.filter(c => 
            c.nombre.toLowerCase().includes(busqueda) || 
            c.telefono.includes(busqueda)
        );

        // Renderizar resultados filtrados
        tbody.innerHTML = '';
        if (clientesFiltrados.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="6" style="text-align: center; padding: 40px; color: #9ca3af;">
                        🔍 No se encontraron clientes que coincidan con "${busqueda}"
                    </td>
                </tr>
            `;
            return;
        }

        clientesFiltrados.forEach(c => {
            let fechaRegistro = 'N/A';
            if (c.fecha_registro) {
                const fecha = new Date(c.fecha_registro);
                if (!isNaN(fecha)) {
                    fechaRegistro = fecha.toLocaleDateString('es-MX', { 
                        year: 'numeric', 
                        month: 'short', 
                        day: 'numeric' 
                    });
                }
            }

            const fila = document.createElement('tr');
            fila.innerHTML = `
                <td>
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <strong style="color: #111827;">${c.nombre}</strong>
                        ${(c.total_compras || 0) >= 3 ? '<span style="color: #f59e0b;">⭐</span>' : ''}
                    </div>
                </td>
                <td>
                    <span style="color: #6b7280;">📱 ${c.telefono}</span>
                </td>
                <td>
                    ${c.direccion 
                        ? `<span style="color: #374151;">${c.direccion}</span>` 
                        : '<span class="text-muted">Sin dirección</span>'}
                </td>
                <td>
                    <span style="font-weight: 600; color: #2563eb;">
                        ${c.total_compras || 0} ${(c.total_compras || 0) === 1 ? 'compra' : 'compras'}
                    </span>
                </td>
                <td>
                    <span style="color: #6b7280; font-size: 0.9em;">${fechaRegistro}</span>
                </td>
               <td>
                    <div style="display: flex; gap: 5px;">
                        <button class="btn-secondary small" onclick="verDetalleCliente(${c.id})" title="Ver Detalles">
                            👁️ Ver
                        </button>
                        <button class="btn-secondary small" onclick="editarCliente(${c.id})" title="Editar">
                            ✏️ Editar
                        </button>
                        <button class="btn-secondary small" onclick="confirmarEliminarCliente(${c.id}, '${c.nombre}')" 
                                style="color: #ef4444;" title="Eliminar">
                            🗑️
                        </button>
                    </div>
                </td>
            `;
            tbody.appendChild(fila);
        });
    });
}

async function buscarYAutocompletarCliente(telefono) {
    if (telefono.length >= 10) {
        const cliente = await window.api.buscarClientePorTelefono(telefono);
        if (cliente) {
            // Si el cliente existe, llenamos los campos de domicilio automáticamente
            if (document.getElementById('dom-nombre')) {
                document.getElementById('dom-nombre').value = cliente.nombre;
                document.getElementById('dom-direccion').value = cliente.direccion || '';
                mostrarToast("✅ Cliente reconocido: " + cliente.nombre);
            }
        }
    }
}

function abrirModalCliente() {
    // Limpiar campos antes de abrir
    document.getElementById('cli-telefono').value = '';
    document.getElementById('cli-nombre').value = '';
    document.getElementById('cli-direccion').value = '';
    
    // Asegurar que los campos estén habilitados
    document.getElementById('cli-telefono').disabled = false;
    document.getElementById('cli-nombre').disabled = false;
    document.getElementById('cli-direccion').disabled = false;
    
    // Asegurar que esté en modo "Nuevo Cliente"
    document.querySelector('#modal-cliente .modal-header h3').innerText = 'Registrar Nuevo Cliente';
    const btnGuardar = document.querySelector('#modal-cliente .btn-confirm-payment');
    btnGuardar.onclick = guardarCliente;
    btnGuardar.innerText = 'Guardar Cliente';
    
    // Abrir modal
    document.getElementById('modal-cliente').classList.remove('hidden');
}
function cerrarModalCliente() {
    // Cerrar el modal
    document.getElementById('modal-cliente').classList.add('hidden');
    
    // ✅ LIMPIEZA COMPLETA: Restaurar todos los campos
    document.getElementById('cli-telefono').value = '';
    document.getElementById('cli-nombre').value = '';
    document.getElementById('cli-direccion').value = '';
    
    // ✅ RESTAURAR: Volver el modal a modo "Nuevo Cliente"
    document.querySelector('#modal-cliente .modal-header h3').innerText = 'Registrar Nuevo Cliente';
    
    // ✅ RESTAURAR: Volver el botón a su función original
    const btnGuardar = document.querySelector('#modal-cliente .btn-confirm-payment');
    btnGuardar.onclick = guardarCliente;
    btnGuardar.innerText = 'Guardar Cliente';
    
    // ✅ IMPORTANTE: Habilitar los campos por si quedaron deshabilitados
    document.getElementById('cli-telefono').disabled = false;
    document.getElementById('cli-nombre').disabled = false;
    document.getElementById('cli-direccion').disabled = false;
}

async function guardarCliente() {
    const telefono = document.getElementById('cli-telefono').value.trim();
    const nombre = document.getElementById('cli-nombre').value.trim();
    const direccion = document.getElementById('cli-direccion').value.trim();

    if (!telefono || !nombre) {
        alert("El teléfono y el nombre son obligatorios.");
        return;
    }

    const btnGuardar = document.querySelector('#modal-cliente .btn-confirm-payment');
    if (btnGuardar) btnGuardar.disabled = true;

    try {
        await crearClienteWrapper({
            telefono: telefono,
            nombre: nombre,
            direccion: direccion,
            notas: ''
        });

        mostrarNotificacionExito('Cliente guardado correctamente', '¡Cliente Guardado!');
        cerrarModalCliente();
        cargarClientes();
    } catch (error) {
        console.error("Error al guardar cliente:", error);
        alert("Error al guardar el cliente");
        if (btnGuardar) btnGuardar.disabled = false;
    }
}

function editarCliente(id) {
    // Buscar el cliente en la lista
    window.api.obtenerClientesConCompras().then(clientes => {
        const cliente = clientes.find(c => c.id === id);
        if (!cliente) {
            alert("Cliente no encontrado");
            return;
        }

        // Asegurar que los campos estén habilitados
        document.getElementById('cli-telefono').disabled = false;
        document.getElementById('cli-nombre').disabled = false;
        document.getElementById('cli-direccion').disabled = false;

        // Llenar el modal con los datos del cliente
        document.getElementById('cli-telefono').value = cliente.telefono;
        document.getElementById('cli-nombre').value = cliente.nombre;
        document.getElementById('cli-direccion').value = cliente.direccion || '';

        // Cambiar el título del modal
        document.querySelector('#modal-cliente .modal-header h3').innerText = 'Editar Cliente';

        // Cambiar el comportamiento del botón guardar temporalmente
        const btnGuardar = document.querySelector('#modal-cliente .btn-confirm-payment');
        btnGuardar.onclick = () => actualizarClienteExistente(id);
        btnGuardar.innerText = 'Actualizar Cliente';

        // Abrir modal
        document.getElementById('modal-cliente').classList.remove('hidden');
    }).catch(error => {
        console.error("Error al cargar cliente para editar:", error);
        alert("Error al cargar los datos del cliente");
    });
}
async function actualizarClienteExistente(id) {
    const telefono = document.getElementById('cli-telefono').value.trim();
    const nombre = document.getElementById('cli-nombre').value.trim();
    const direccion = document.getElementById('cli-direccion').value.trim();

    if (!telefono || !nombre) {
        alert("El teléfono y el nombre son obligatorios.");
        return;
    }

    try {
        await window.api.actualizarCliente(id, {
            telefono,
            nombre,
            direccion,
            notas: ''
        });

        // ✅ CORREGIDO: Usar mostrarNotificacionExito en lugar de mostrarToast
        mostrarNotificacionExito('Cliente actualizado correctamente', '¡Cliente Actualizado!');
        
        cerrarModalCliente();
        cargarClientes(); // Recargar la lista
        
    } catch (error) {
        console.error("Error al actualizar cliente:", error);
        alert("Error al actualizar el cliente");
    }
}

function confirmarEliminarCliente(id, nombre) {
    if (confirm(`¿Estás seguro de eliminar al cliente "${nombre}"?\n\nSi tiene pedidos asociados, se marcará como eliminado pero no se borrará completamente.`)) {
        window.api.eliminarCliente(id).then(() => {
            mostrarNotificacionExito('Cliente eliminado correctamente', '¡Cliente Eliminado!');
            cargarClientes();  // Recargar la lista
        }).catch(error => {
            console.error("Error al eliminar cliente:", error);
            alert("Error al eliminar el cliente");
        });
    }
}

function verDetalleCliente(id) {
    obtenerClientesWrapper().then(clientes => {
        const cliente = clientes.find(c => c.id === id);
        if (!cliente) {
            alert("Cliente no encontrado");
            return;
        }

        // Llenar modal con datos
        document.getElementById('ver-cli-nombre').innerText = cliente.nombre;
        document.getElementById('ver-cli-telefono').innerText = cliente.telefono;
        document.getElementById('ver-cli-direccion').innerText = cliente.direccion || 'Sin dirección registrada';
        document.getElementById('ver-cli-compras').innerText = cliente.total_compras || 0;
        document.getElementById('ver-cli-monto').innerText = `$${(cliente.monto_total || 0).toFixed(2)}`;
        
        // Formatear fecha
        let fechaRegistro = 'No disponible';
        if (cliente.fecha_registro) {
            const fecha = new Date(cliente.fecha_registro);
            if (!isNaN(fecha)) {
                fechaRegistro = fecha.toLocaleDateString('es-MX', { 
                    weekday: 'long',
                    year: 'numeric', 
                    month: 'long', 
                    day: 'numeric' 
                });
            }
        }
        document.getElementById('ver-cli-fecha').innerText = fechaRegistro;

        // Abrir modal
        document.getElementById('modal-ver-cliente').classList.remove('hidden');
    }).catch(error => {
        console.error("Error al cargar cliente:", error);
        alert("Error al cargar los datos del cliente");
    });
}

function cerrarModalVerCliente() {
    document.getElementById('modal-ver-cliente').classList.add('hidden');
}

/* ============================================
   CUENTA ZENIT — Registro y sesión
   ============================================ */

function mostrarLoginZenit() {
    document.getElementById('zenit-form-registro').style.display = 'none';
    document.getElementById('zenit-form-login').style.display = '';
}

function mostrarRegistroZenit() {
    document.getElementById('zenit-form-login').style.display = 'none';
    document.getElementById('zenit-form-registro').style.display = '';
}

async function cargarCuentaZenitAjustes() {
    const ajustes = await window.api.obtenerAjustes();
    const token = ajustes.api_token;
    const nombre = ajustes.zenit_user_name;
    const email = ajustes.zenit_user_email;

    const sinCuenta = document.getElementById('zenit-sin-cuenta');
    const conCuenta = document.getElementById('zenit-con-cuenta');
    if (!sinCuenta) return;

    if (token && nombre) {
        sinCuenta.style.display = 'none';
        conCuenta.style.display = '';
        document.getElementById('zenit-nombre-mostrar').textContent = nombre;
        document.getElementById('zenit-email-mostrar').textContent = email || '';
    } else {
        sinCuenta.style.display = '';
        conCuenta.style.display = 'none';
    }
}

async function registrarCuentaZenit() {
    const nombre = document.getElementById('zenit-nombre').value.trim();
    const email = document.getElementById('zenit-email').value.trim();
    const password = document.getElementById('zenit-password').value;
    const errorDiv = document.getElementById('zenit-error-registro');

    errorDiv.style.display = 'none';

    if (!nombre || !email || !password) {
        errorDiv.textContent = 'Completa todos los campos.';
        errorDiv.style.display = '';
        return;
    }
    if (password.length < 6) {
        errorDiv.textContent = 'La contraseña debe tener al menos 6 caracteres.';
        errorDiv.style.display = '';
        return;
    }

    const btn = document.querySelector('#zenit-form-registro .btn-primary');
    if (btn) { btn.disabled = true; btn.textContent = 'Creando cuenta...'; }

    try {
        const ajustes = await window.api.obtenerAjustes();
        const backendUrl = ajustes.api_url || 'https://zenit-pos-backend.onrender.com/api';
        if (!apiClient) window.apiClient = new APIClient(backendUrl);
        apiClient.setBaseURL(backendUrl);

        const response = await apiClient.register(nombre, email, password);

        await window.api.guardarAjuste('api_token', response.token);
        await window.api.guardarAjuste('api_url', backendUrl);
        await window.api.guardarAjuste('zenit_user_name', response.user.name);
        await window.api.guardarAjuste('zenit_user_email', email);

        await window.api.guardarAjuste('modo_conectado', 'true');

        apiClient.setToken(response.token);
        tokenActual = response.token;
        modoConectado = true;

        await window.api.guardarAjuste('pedir_password_inicio', 'false');
        const switchPwd = document.getElementById('adj-pedir-password');
        if (switchPwd) switchPwd.checked = false;

        await syncLocalToCloud();
        await cargarCuentaZenitAjustes();
        mostrarNotificacionExito('Cuenta creada y datos sincronizados', '¡Bienvenido a Zenit!');
    } catch (error) {
        errorDiv.textContent = error.message || 'Error al crear la cuenta. Intenta de nuevo.';
        errorDiv.style.display = '';
    } finally {
        if (btn) { btn.disabled = false; btn.textContent = 'Crear cuenta'; }
    }
}

async function iniciarSesionZenitAjustes() {
    const email = document.getElementById('zenit-email-login').value.trim();
    const password = document.getElementById('zenit-password-login').value;
    const errorDiv = document.getElementById('zenit-error-login');

    errorDiv.style.display = 'none';

    if (!email || !password) {
        errorDiv.textContent = 'Ingresa tu email y contraseña.';
        errorDiv.style.display = '';
        return;
    }

    const btn = document.querySelector('#zenit-form-login .btn-primary');
    if (btn) { btn.disabled = true; btn.textContent = 'Conectando...'; }

    try {
        const ajustes = await window.api.obtenerAjustes();
        const backendUrl = ajustes.api_url || 'https://zenit-pos-backend.onrender.com/api';
        if (!apiClient) window.apiClient = new APIClient(backendUrl);
        apiClient.setBaseURL(backendUrl);

        const response = await apiClient.login(email, password);

        await window.api.guardarAjuste('api_token', response.token);
        await window.api.guardarAjuste('api_url', backendUrl);
        await window.api.guardarAjuste('zenit_user_name', response.user.name);
        await window.api.guardarAjuste('zenit_user_email', email);

        await window.api.guardarAjuste('modo_conectado', 'true');

        apiClient.setToken(response.token);
        tokenActual = response.token;
        modoConectado = true;

        await window.api.guardarAjuste('pedir_password_inicio', 'false');
        const switchPwd = document.getElementById('adj-pedir-password');
        if (switchPwd) switchPwd.checked = false;

        // Sincronizar todos los datos del backend
        sincronizarDesdeBackend().catch(e => console.warn('syncDesdeBackend:', e));

        await cargarCuentaZenitAjustes();
        mostrarNotificacionExito('Sesión iniciada', '¡Bienvenido!');
    } catch (error) {
        errorDiv.textContent = error.message || 'Email o contraseña incorrectos.';
        errorDiv.style.display = '';
    } finally {
        if (btn) { btn.disabled = false; btn.textContent = 'Iniciar sesión'; }
    }
}

async function cerrarSesionZenit() {
    if (!confirm('¿Cerrar sesión?')) return;
    await window.api.guardarAjuste('api_token', '');
    await window.api.guardarAjuste('modo_conectado', 'false');
    await window.api.guardarAjuste('pedir_password_inicio', 'false');
    await window.api.guardarAjuste('zenit_user_name', '');
    await window.api.guardarAjuste('zenit_user_email', '');
    await window.api.limpiarDatosLocales();
    location.reload();
}

function mostrarCambiarPasswordApp() {
    const form = document.getElementById('form-cambiar-password');
    if (form) form.style.display = form.style.display === 'none' ? '' : 'none';
}

async function guardarNuevaPasswordApp() {
    const nueva = document.getElementById('nueva-password-app').value;
    const confirmar = document.getElementById('confirm-password-app').value;
    if (nueva.length < 4) { alert('La contraseña debe tener al menos 4 caracteres'); return; }
    if (nueva !== confirmar) { alert('Las contraseñas no coinciden'); return; }
    await window.api.establecerPasswordApp(nueva);
    document.getElementById('form-cambiar-password').style.display = 'none';
    document.getElementById('nueva-password-app').value = '';
    document.getElementById('confirm-password-app').value = '';
    mostrarNotificacionExito('Contraseña del sistema actualizada', '¡Listo!');
}

async function cargarAjustesInstalados() {
    try {
        console.log("Sincronizando ajustes...");
        const ajustes = await window.api.obtenerAjustes();
        
        // Información del negocio
        if(ajustes.business_name && document.getElementById('adj-nombre-negocio')) 
            document.getElementById('adj-nombre-negocio').value = ajustes.business_name;
        if(ajustes.business_address && document.getElementById('adj-direccion-negocio')) 
            document.getElementById('adj-direccion-negocio').value = ajustes.business_address;
        if(ajustes.business_phone && document.getElementById('adj-telefono-negocio')) 
            document.getElementById('adj-telefono-negocio').value = ajustes.business_phone;
        
        // Ajustes de ticket
        if(ajustes.show_logo && document.getElementById('adj-show-logo')) 
            document.getElementById('adj-show-logo').checked = (ajustes.show_logo === 'true');
        if(ajustes.show_phone && document.getElementById('adj-show-phone')) 
            document.getElementById('adj-show-phone').checked = (ajustes.show_phone === 'true');
        if(ajustes.show_direccion && document.getElementById('adj-show-direccion')) 
            document.getElementById('adj-show-direccion').checked = (ajustes.show_direccion === 'true');
        
        // Moneda
        if(ajustes.currency_symbol && document.getElementById('adj-moneda')) 
            document.getElementById('adj-moneda').value = ajustes.currency_symbol;
        
        // Logo
        if(ajustes.logo_path && document.getElementById('adj-logo-path')) {
            document.getElementById('adj-logo-path').value = ajustes.logo_path;
            if(document.getElementById('preview-logo-ajustes')) {
                document.getElementById('preview-logo-ajustes').src = ajustes.logo_path;
            }
        }   

        // Stock en Nueva Venta
        if(document.getElementById('adj-mostrar-stock'))
            document.getElementById('adj-mostrar-stock').checked = (ajustes.mostrar_stock_venta === 'true');

        // Venta sin turno (default activo — solo se desactiva si el usuario lo apagó explícitamente)
        ventaSinTurno = (ajustes.venta_sin_turno !== 'false');
        if(document.getElementById('adj-venta-sin-turno'))
            document.getElementById('adj-venta-sin-turno').checked = ventaSinTurno;

        // Modo oscuro
        if(ajustes.dark_mode === 'true') {
            const checkDark = document.getElementById('adj-darkmode');
            if(checkDark) checkDark.checked = true;
            document.body.classList.add('dark-mode');
        }

        // Impresoras
        const selectImp = document.getElementById('adj-impresora');
        if (selectImp) {
            // Limpiar opciones existentes (excepto la primera que es "Impresora del Sistema")
            while (selectImp.options.length > 1) {
                selectImp.remove(1);
            }
            
            const impresoras = await window.api.obtenerImpresoras().catch(() => []);
            impresoras.forEach(imp => {
                const opt = document.createElement('option');
                opt.value = imp.name;
                opt.innerText = imp.name;
                if(ajustes.impresora === imp.name) opt.selected = true;
                selectImp.appendChild(opt);
            });
        }
        
        // Agregar event listeners para guardar automáticamente
        agregarListenersGuardadoAjustes();

        // Permisos por rol (solo dueño)
        cargarPermisosAjustes();

        // Switch pedir contraseña al iniciar
        const switchPwd = document.getElementById('adj-pedir-password');
        if (switchPwd) switchPwd.checked = (ajustes.pedir_password_inicio !== 'false');

        // Cuenta Zenit
        await cargarCuentaZenitAjustes();

        console.log("Ajustes cargados con éxito.");
    } catch (error) {
        console.error("Error cargando ajustes:", error);
    }
}

// Función para agregar listeners de guardado automático
function agregarListenersGuardadoAjustes() {
    // Información del negocio
    const nombreNegocio = document.getElementById('adj-nombre-negocio');
    const telefonoNegocio = document.getElementById('adj-telefono-negocio');
    const direccionNegocio = document.getElementById('adj-direccion-negocio');
    
    if (nombreNegocio) {
        nombreNegocio.addEventListener('blur', async () => {
            await window.api.guardarAjuste('business_name', nombreNegocio.value);
        });
    }
    
    if (telefonoNegocio) {
        telefonoNegocio.addEventListener('blur', async () => {
            await window.api.guardarAjuste('business_phone', telefonoNegocio.value);
        });
    }
    
    if (direccionNegocio) {
        direccionNegocio.addEventListener('blur', async () => {
            await window.api.guardarAjuste('business_address', direccionNegocio.value);
        });
    }
    
    // Checkboxes de ticket
    const showLogo = document.getElementById('adj-show-logo');
    const showPhone = document.getElementById('adj-show-phone');
    const showDireccion = document.getElementById('adj-show-direccion');
    
    if (showLogo) {
        showLogo.addEventListener('change', async () => {
            await window.api.guardarAjuste('show_logo', showLogo.checked ? 'true' : 'false');
        });
    }
    
    if (showPhone) {
        showPhone.addEventListener('change', async () => {
            await window.api.guardarAjuste('show_phone', showPhone.checked ? 'true' : 'false');
        });
    }
    
    if (showDireccion) {
        showDireccion.addEventListener('change', async () => {
            await window.api.guardarAjuste('show_direccion', showDireccion.checked ? 'true' : 'false');
        });
    }
    
    // Moneda
    const moneda = document.getElementById('adj-moneda');
    if (moneda) {
        moneda.addEventListener('change', async () => {
            await window.api.guardarAjuste('currency_symbol', moneda.value);
        });
    }
    
    // Impresora
    const impresora = document.getElementById('adj-impresora');
    if (impresora) {
        impresora.addEventListener('change', async () => {
            await window.api.guardarAjuste('impresora', impresora.value);
        });
    }

    // Venta sin turno
    const ventaSinTurnoEl = document.getElementById('adj-venta-sin-turno');
    if (ventaSinTurnoEl) {
        ventaSinTurnoEl.addEventListener('change', async () => {
            ventaSinTurno = ventaSinTurnoEl.checked;
            await window.api.guardarAjuste('venta_sin_turno', ventaSinTurnoEl.checked ? 'true' : 'false');
        });
    }
}

function toggleDarkMode(isChecked) {
    if (isChecked) {
        document.body.classList.add('dark');
        localStorage.setItem('darkMode', 'true');
    } else {
        document.body.classList.remove('dark');
        localStorage.setItem('darkMode', 'false');
    }
}

(function () {
    const darkGuardado = localStorage.getItem('darkMode') === 'true';

    if (darkGuardado) {
        document.body.classList.add('dark');
    }

    const toggle = document.querySelector('[onchange*="toggleDarkMode"]');

    if (toggle) {
        toggle.checked = darkGuardado;
    }
})();

// ==========================================
// SISTEMA DE IMPRESIÓN DE TICKETS
// ==========================================

async function imprimirTicket(pedidoId) {
    try {
        // 1. Obtener datos del pedido
        const detalles = await obtenerDetallePedidoWrapper(pedidoId);
        const pedidos = await obtenerPedidosWrapper({ limit: 1000 });
        const pedido = pedidos.find(p => p.id === pedidoId);
        
        if (!pedido || !detalles) {
            alert('No se pudo cargar la información del pedido');
            return;
        }

        // 2. Obtener ajustes
        const ajustes = await window.api.obtenerAjustes().catch(() => ({}));
        const nombreNegocio = ajustes.business_name || 'Mi Negocio';
        const telefonoNegocio = ajustes.business_phone || '';
        const direccionNegocio = ajustes.business_address || '';
        const mostrarLogo = ajustes.show_logo === 'true';
        const mostrarTelefono = ajustes.show_phone === 'true';
        const mostrarDireccion = ajustes.show_direccion === 'true';
        const moneda = ajustes.currency_symbol || '$';
        const rutaLogo = ajustes.logo_path || './assets/logo/montana.png';

        // 3. Convertir logo a base64 si existe
        let logoBase64 = '';
        if (mostrarLogo) {
            try {
                // Intentar cargar la imagen como base64
                const img = new Image();
                img.crossOrigin = 'anonymous';
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                
                await new Promise((resolve, reject) => {
                    img.onload = () => {
                        canvas.width = img.width;
                        canvas.height = img.height;
                        ctx.drawImage(img, 0, 0);
                        logoBase64 = canvas.toDataURL('image/png');
                        resolve();
                    };
                    img.onerror = () => resolve(); // Si falla, continuar sin logo
                    img.src = rutaLogo;
                });
            } catch (e) {
                console.log('No se pudo cargar el logo:', e);
            }
        }

        // 4. Formatear fecha correctamente
        let fechaFormateada = 'Fecha no disponible';
        try {
            // La fecha viene de SQLite como "fecha"
            const fechaStr = pedido.fecha;
            if (fechaStr) {
                // Reemplazar espacio con 'T' para que sea compatible con Date
                const fechaISO = fechaStr.replace(' ', 'T');
                const fecha = new Date(fechaISO);
                
                if (!isNaN(fecha.getTime())) {
                    fechaFormateada = fecha.toLocaleString('es-MX', {
                        year: 'numeric',
                        month: '2-digit',
                        day: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                        hour12: true
                    });
                }
            }
        } catch (e) {
            console.error('Error al formatear fecha:', e);
        }

// 4.5 Extraer solo el nombre del cliente (sin el teléfono)
        let nombreClienteTicket = '';
        if (pedido.telefono && pedido.telefono !== 'General') {
            // Toma lo que está antes del ' - ' (el nombre) y descarta el número
            nombreClienteTicket = pedido.telefono.split(' - ')[0]; 
        }

        // 5. Crear HTML del ticket mejorado
        const ticketHTML = `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <title>Ticket #${pedido.id}</title>
                <style>
                    @page {
                        size: 80mm auto;
                        margin: 0;
                    }
                    * {
                        margin: 0;
                        padding: 0;
                        box-sizing: border-box;
                    }
                    body {
                        font-family: 'Courier New', monospace;
                        font-size: 12px;
                        line-height: 1.4;
                        padding: 10px;
                        width: 80mm;
                    }
                    .ticket {
                        width: 100%;
                    }
                    .header {
                        text-align: center;
                        margin-bottom: 10px;
                        border-bottom: 1px dashed #000;
                        padding-bottom: 10px;
                    }
                    .logo {
                        width: 240px;
                        height: auto;
                        max-height: 240px;
                        margin: 0 auto 2px;
                        display: block;
                        object-fit: contain;
                    }
                    .negocio {
                        font-weight: bold;
                        font-size: 14px;
                        margin-bottom: 4px;
                    }
                    .info-line {
                        font-size: 10px;
                        margin: 2px 0;
                    }
                    .items {
                        margin: 10px 0;
                    }
                    .item {
                        display: flex;
                        justify-content: space-between;
                        margin: 4px 0;
                        font-size: 11px;
                    }
                    .item-name {
                        flex: 1;
                    }
                    .item-qty {
                        width: 30px;
                        text-align: center;
                    }
                    .item-price {
                        width: 60px;
                        text-align: right;
                    }
                    .nota {
                        font-size: 10px;
                        color: #666;
                        margin-left: 10px;
                        font-style: italic;
                    }
                    .separator {
                        border-top: 1px dashed #000;
                        margin: 8px 0;
                    }
                    .totales {
                        margin-top: 10px;
                    }
                    .total-line {
                        display: flex;
                        justify-content: space-between;
                        margin: 4px 0;
                        font-size: 12px;
                    }
                    .total-line.final {
                        font-weight: bold;
                        font-size: 14px;
                        margin-top: 6px;
                        padding-top: 6px;
                        border-top: 2px solid #000;
                    }
                    .footer {
                        text-align: center;
                        margin-top: 15px;
                        font-size: 11px;
                        border-top: 1px dashed #000;
                        padding-top: 10px;
                    }
                    .gracias {
                        font-weight: bold;
                        margin-top: 8px;
                    }
                    .powered-by {
                        font-size: 8px;
                        color: #999;
                        margin-top: 10px;
                    }
                    @media print {
                        body { margin: 0; }
                    }
                </style>
            </head>
            <body>
                <div class="ticket">
                    <div class="header">
                        ${logoBase64 ? `<img src="${logoBase64}" alt="Logo" class="logo">` : ''}
                        <div class="negocio">${nombreNegocio}</div>
                        ${mostrarDireccion && direccionNegocio ? `<div class="info-line">${direccionNegocio}</div>` : ''}
                        ${mostrarTelefono && telefonoNegocio ? `<div class="info-line">Tel: ${telefonoNegocio}</div>` : ''}
                        <div class="separator"></div>
                        <div class="info-line"><strong>Ticket #${pedido.id}</strong></div>
                        <div class="info-line">${fechaFormateada}</div>
                        ${nombreClienteTicket ? `<div class="info-line">Cliente: ${nombreClienteTicket}</div>` : ''}
                        ${pedido.tipo_pedido ? `<div class="info-line">Tipo: ${pedido.tipo_pedido.toUpperCase()}</div>` : ''}
                    </div>

                    <div class="items">
                        ${detalles.map(item => `
                            <div class="item">
                                <span class="item-name">${item.nombre}</span>
                                <span class="item-qty">x${item.cantidad}</span>
                                <span class="item-price">${moneda}${item.precio.toFixed(2)}</span>
                            </div>
                            ${item.nota ? `<div class="nota">* ${item.nota}</div>` : ''}
                        `).join('')}
                    </div>

                    <div class="separator"></div>

                    <div class="totales">
                        <div class="total-line final">
                            <span>TOTAL:</span>
                            <span>${moneda}${pedido.total.toFixed(2)}</span>
                        </div>
                        <div class="total-line">
                            <span>Método de pago:</span>
                            <span>${pedido.metodo_pago || 'N/A'}</span>
                        </div>
                    </div>

                    <div class="footer">
                        <div class="gracias">¡Gracias por tu compra!</div>
                        <div style="margin-top: 6px;">Vuelve pronto</div>
                        <div class="powered-by">Powered by Zenit POS</div>
                    </div>
                </div>
            </body>
            </html>
        `;

        // 6. Enviar a imprimir directamente (sin ventana emergente)
        const ajusteImpresora = await window.api.obtenerAjustes().catch(() => ({}));
        const nombreImpresora = ajusteImpresora.impresora || '';
        await window.api.imprimirTicket(ticketHTML, nombreImpresora);

    } catch (error) {
        console.error('Error al imprimir ticket:', error);
        alert('Error al generar el ticket de impresión');
    }
}

// Función auxiliar para imprimir el último pedido creado
function imprimirUltimoTicket() {
    if (window.ultimoPedidoId) {
        imprimirTicket(window.ultimoPedidoId);
    }
}

// ==========================================
// FUNCIÓN PARA SELECCIONAR LOGO
// ==========================================

async function seleccionarLogoNegocio() {
    try {
        const ruta = await window.api.seleccionarImagen();
        if (ruta) {
            // Actualizar preview
            document.getElementById('preview-logo-ajustes').src = ruta;
            document.getElementById('adj-logo-path').value = ruta;
            
            // Guardar en ajustes
            await window.api.guardarAjuste('logo_path', ruta);
            alert('✅ Logo actualizado correctamente');
        }
    } catch (error) {
        console.error('Error al seleccionar logo:', error);
        alert('Error al cargar la imagen');
    }
}

// ==========================================
// VERIFICACIÓN MANUAL DE ACTUALIZACIONES
// ==========================================

async function verificarActualizacionManual() {
    const btn = document.getElementById('btn-verificar-update');
    const textOriginal = btn.innerText;
    
    try {
        btn.innerText = '⏳ Verificando...';
        btn.disabled = true;
        
        const result = await window.api.checkForUpdates();
        
        if (result && result.updateInfo) {
            alert(`✅ Actualización disponible: v${result.updateInfo.version}\n\nLa descarga comenzará automáticamente.`);
        } else {
            alert('✅ Ya estás usando la versión más reciente');
        }
        
    } catch (error) {
        console.error('Error al verificar actualizaciones:', error);
        alert('❌ No se pudo verificar actualizaciones. Verifica tu conexión a internet.');
    } finally {
        btn.innerText = textOriginal;
        btn.disabled = false;
    }
}

// Cargar versión actual al entrar a ajustes
document.addEventListener('DOMContentLoaded', async () => {
    try {
        const version = await window.api.getAppVersion();
        const versionSpan = document.getElementById('version-actual');
        if (versionSpan) {
            versionSpan.innerText = `v${version}`;
        }
        const sidebarVersion = document.getElementById('sidebar-version');
        if (sidebarVersion) {
            sidebarVersion.innerText = `v${version}`;
        }
    } catch (error) {
        console.log('No se pudo obtener la versión');
    }
});

// ==========================================
// GUARDAR TODOS LOS AJUSTES (BOTÓN MANUAL)
// ==========================================
function guardarTodosLosAjustes() {
    // Esto quita el foco de donde estés escribiendo para forzar el autoguardado del sistema
    if (document.activeElement) {
        document.activeElement.blur();
    }
    // Muestra el mensaje de éxito en pantalla
    mostrarNotificacionExito('Los ajustes se han guardado correctamente', '¡Ajustes Guardados!');
}

// ============================================
// MÓDULO DE INVENTARIO
// ============================================

let insumosCache = [];
let preparacionesCache = [];
let productosRecetaCache = [];
let insumoEditandoId = null;
let preparacionEditandoId = null;
let productoRecetaActual = null;

async function cargarInventario() {
    try {
        insumosCache = await window.api.obtenerInsumos();
        preparacionesCache = await window.api.obtenerPreparaciones();
        const agrupados = await obtenerProductosAgrupadosWrapper();
        productosRecetaCache = [];
        agrupados.forEach(cat => {
            cat.productos.forEach(p => {
                productosRecetaCache.push({ ...p, categoria: cat.nombre });
            });
        });
        renderizarTablaInsumos();
        renderizarTablaPreparaciones();
        renderizarTablaRecetas();
    } catch (e) {
        console.error('Error al cargar inventario:', e);
    }
}

function cambiarTabInventario(tab, btn) {
    document.querySelectorAll('.inv-tab').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    document.querySelectorAll('.inv-panel').forEach(p => p.style.display = 'none');
    document.getElementById(`inv-panel-${tab}`).style.display = 'block';
    if (tab === 'entradas') cargarTablaEntradas();
    if (tab === 'salidas') cargarTablaSalidas();
}

// --- INSUMOS ---
function renderizarTablaInsumos() {
    const tbody = document.getElementById('tabla-insumos');
    if (!insumosCache.length) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:30px; color:#9ca3af;">
            Aún no has registrado insumos. Haz clic en "+ Agregar Insumo" para comenzar.
        </td></tr>`;
        return;
    }
    tbody.innerHTML = insumosCache.map(ins => {
        let estadoBadge, estadoClase;
        if (ins.stock_actual <= 0) {
            estadoBadge = 'Sin stock'; estadoClase = 'badge-stock-cero';
        } else if (ins.stock_minimo > 0 && ins.stock_actual <= ins.stock_minimo) {
            estadoBadge = 'Stock bajo'; estadoClase = 'badge-stock-bajo';
        } else {
            estadoBadge = 'Normal'; estadoClase = 'badge-stock-ok';
        }
        return `<tr>
            <td><strong>${ins.nombre}</strong></td>
            <td><span class="badge-info">${ins.unidad}</span></td>
            <td class="${ins.stock_actual <= 0 ? 'stock-cero' : ins.stock_actual <= ins.stock_minimo && ins.stock_minimo > 0 ? 'stock-bajo' : 'stock-ok'}">
                ${ins.stock_actual} ${ins.unidad}
            </td>
            <td style="color:#6b7280;">${ins.stock_minimo > 0 ? ins.stock_minimo + ' ' + ins.unidad : '—'}</td>
            <td><span class="${estadoClase}">${estadoBadge}</span></td>
            <td>
                <div style="display:flex; gap:6px;">
                    <button class="btn-secondary small" onclick="editarInsumo(${ins.id})" style="display:inline-flex;align-items:center;gap:4px;">
                        <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/><path d="m15 5 4 4"/></svg>
                        Editar
                    </button>
                    <button class="btn-secondary small" onclick="confirmarEliminarInsumo(${ins.id}, '${ins.nombre}')" style="color:#ef4444; display:inline-flex;align-items:center;gap:4px;">
                        <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 11v6"/><path d="M14 11v6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                    </button>
                </div>
            </td>
        </tr>`;
    }).join('');
}

// Unidades que necesitan conversión (no son nativas de peso/volumen)
const UNIDADES_CON_CONVERSION = ['pzas', 'latas', 'bolsas', 'porciones'];

function abrirModalInsumo(ins = null) {
    insumoEditandoId = ins ? ins.id : null;
    document.getElementById('modal-insumo-titulo').innerText = ins ? 'Editar Insumo' : 'Nuevo Insumo';
    document.getElementById('ins-nombre').value = ins ? ins.nombre : '';
    document.getElementById('ins-unidad').value = ins ? ins.unidad : 'kg';
    document.getElementById('ins-stock').value = ins ? ins.stock_actual : '';
    document.getElementById('ins-minimo').value = ins ? ins.stock_minimo : '';

    // Mostrar/ocultar bloque de conversión según unidad
    const unidad = ins ? ins.unidad : 'kg';
    const bloqueConv = document.getElementById('bloque-conversion');
    if (UNIDADES_CON_CONVERSION.includes(unidad)) {
        bloqueConv.style.display = 'block';
        document.getElementById('conv-unidad-label').innerText = unidad;
        document.getElementById('ins-contenido-cantidad').value = ins ? ins.contenido_cantidad || '' : '';
        document.getElementById('ins-contenido-unidad').value = ins ? ins.contenido_unidad || 'g' : 'g';
    } else {
        bloqueConv.style.display = 'none';
    }

    // Listener para que el bloque aparezca/desaparezca al cambiar la unidad
    document.getElementById('ins-unidad').onchange = function() {
        const u = this.value;
        document.getElementById('conv-unidad-label').innerText = u;
        document.getElementById('bloque-conversion').style.display =
            UNIDADES_CON_CONVERSION.includes(u) ? 'block' : 'none';
    };

    document.getElementById('modal-insumo').classList.remove('hidden');
}

function cerrarModalInsumo() {
    document.getElementById('modal-insumo').classList.add('hidden');
    insumoEditandoId = null;
}

async function guardarInsumo() {
    const nombre = document.getElementById('ins-nombre').value.trim();
    const unidad = document.getElementById('ins-unidad').value;
    const stock_actual = parseFloat(document.getElementById('ins-stock').value) || 0;
    const stock_minimo = parseFloat(document.getElementById('ins-minimo').value) || 0;
    if (!nombre) { alert('El nombre es obligatorio'); return; }
    try {
        const contenido_cantidad = parseFloat(document.getElementById('ins-contenido-cantidad').value) || null;
        const contenido_unidad = document.getElementById('ins-contenido-unidad').value || null;
        const datos = { nombre, unidad, stock_actual, stock_minimo, contenido_cantidad, contenido_unidad };
        if (insumoEditandoId) {
            await window.api.actualizarInsumo(insumoEditandoId, datos);
        } else {
            await window.api.agregarInsumo(datos);
        }
        cerrarModalInsumo();
        insumosCache = await window.api.obtenerInsumos();
        renderizarTablaInsumos();
        mostrarNotificacionExito('Insumo guardado', '¡Guardado!');
    } catch (e) { alert('Error al guardar el insumo'); }
}

function editarInsumo(id) {
    const ins = insumosCache.find(i => i.id === id);
    if (ins) abrirModalInsumo(ins);
}

async function confirmarEliminarInsumo(id, nombre) {
    if (confirm(`¿Eliminar el insumo "${nombre}"?\n\nSe eliminará de todas las preparaciones y recetas donde aparezca.`)) {
        await window.api.eliminarInsumo(id);
        insumosCache = await window.api.obtenerInsumos();
        renderizarTablaInsumos();
        mostrarNotificacionExito('Insumo eliminado', '¡Eliminado!');
    }
}

// --- PREPARACIONES ---
function renderizarTablaPreparaciones() {
    const tbody = document.getElementById('tabla-preparaciones');
    if (!preparacionesCache.length) {
        tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; padding:30px; color:#9ca3af;">
            Aún no hay preparaciones. Úsalas para modelar mezclas o concentrados hechos en cocina.
        </td></tr>`;
        return;
    }
    tbody.innerHTML = preparacionesCache.map(prep => `<tr>
        <td><strong>${prep.nombre}</strong></td>
        <td style="color:#6b7280;">${prep.descripcion || '—'}</td>
        <td>
            <span class="badge-info" id="prep-count-${prep.id}">...</span>
            <span id="prep-stock-${prep.id}" style="display:block; font-size:0.8em; margin-top:4px; color:#9ca3af;">...</span>
        </td>
        <td>
            <div style="display:flex; gap:6px;">
                <button class="btn-secondary small" onclick="editarPreparacion(${prep.id})" style="display:inline-flex;align-items:center;gap:4px;">
                    <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/><path d="m15 5 4 4"/></svg>
                    Editar
                </button>
                <button class="btn-secondary small" onclick="confirmarEliminarPreparacion(${prep.id}, '${prep.nombre}')" style="color:#ef4444; display:inline-flex;align-items:center;gap:4px;">
                    <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 11v6"/><path d="M14 11v6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                </button>
            </div>
        </td>
    </tr>`).join('');

    // Cargar conteo de items por preparación
    preparacionesCache.forEach(prep => {
        window.api.obtenerItemsPreparacion(prep.id).then(items => {
            const el = document.getElementById(`prep-count-${prep.id}`);
            if (el) el.innerText = `${items.length} insumo${items.length !== 1 ? 's' : ''}`;
        });
        window.api.calcularStockPreparacion(prep.id).then(stock => {
            const el = document.getElementById(`prep-stock-${prep.id}`);
            if (!el) return;
            if (stock === null) { el.innerText = ''; return; }
            if (stock === 0) {
                el.innerHTML = '<span style="color:#ef4444; font-weight:600;">Sin stock para preparar</span>';
            } else {
                el.innerHTML = `<span style="color:#10b981; font-weight:600;">✓ ${stock} porción${stock !== 1 ? 'es' : ''} posibles</span>`;
            }
        }).catch(() => {});
    });
}

function abrirModalPreparacion(prep = null) {
    preparacionEditandoId = prep ? prep.id : null;
    document.getElementById('modal-prep-titulo').innerText = prep ? 'Editar Preparación' : 'Nueva Preparación';
    document.getElementById('prep-nombre').value = prep ? prep.nombre : '';
    document.getElementById('prep-descripcion').value = prep ? prep.descripcion || '' : '';
    document.getElementById('prep-items-lista').innerHTML = '';

    if (prep) {
        window.api.obtenerItemsPreparacion(prep.id).then(items => {
            items.forEach(item => agregarLineaPrep(item));
        });
    } else {
        agregarLineaPrep();
    }
    document.getElementById('modal-preparacion').classList.remove('hidden');
}

function cerrarModalPreparacion() {
    document.getElementById('modal-preparacion').classList.add('hidden');
    preparacionEditandoId = null;
}

function agregarLineaPrep(itemExistente = null) {
    const lista = document.getElementById('prep-items-lista');
    const div = document.createElement('div');
    div.className = 'receta-linea';
    const opcionesInsumos = insumosCache.map(i =>
        `<option value="${i.id}" ${itemExistente && itemExistente.insumo_id === i.id ? 'selected' : ''}>${i.nombre} (${i.unidad})</option>`
    ).join('');
    div.innerHTML = `
        <select>${insumosCache.length ? opcionesInsumos : '<option value="">— Sin insumos —</option>'}</select>
        <input type="number" placeholder="Cantidad" min="0" step="0.01" value="${itemExistente ? itemExistente.cantidad : ''}">
        <button class="btn-quitar" onclick="this.parentElement.remove()" title="Quitar">
            <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 11v6"/><path d="M14 11v6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
        </button>
    `;
    lista.appendChild(div);
}

async function guardarPreparacion() {
    const nombre = document.getElementById('prep-nombre').value.trim();
    if (!nombre) { alert('El nombre es obligatorio'); return; }
    const items = [];
    document.querySelectorAll('#prep-items-lista .receta-linea').forEach(linea => {
        const sel = linea.querySelector('select');
        const inp = linea.querySelector('input[type="number"]');
        if (sel && sel.value && inp && inp.value) {
            items.push({ insumo_id: parseInt(sel.value), cantidad: parseFloat(inp.value) });
        }
    });
    try {
        const datos = { nombre, descripcion: document.getElementById('prep-descripcion').value.trim() };
        if (preparacionEditandoId) {
            await window.api.actualizarPreparacion(preparacionEditandoId, datos);
            await window.api.guardarItemsPreparacion(preparacionEditandoId, items);
        } else {
            await window.api.agregarPreparacion(datos);
            const preps = await window.api.obtenerPreparaciones();
            const nueva = preps[preps.length - 1];
            await window.api.guardarItemsPreparacion(nueva.id, items);
        }
        cerrarModalPreparacion();
        preparacionesCache = await window.api.obtenerPreparaciones();
        renderizarTablaPreparaciones();
        mostrarNotificacionExito('Preparación guardada', '¡Guardado!');
    } catch (e) { console.error(e); alert('Error al guardar la preparación'); }
}

async function editarPreparacion(id) {
    const prep = preparacionesCache.find(p => p.id === id);
    if (prep) abrirModalPreparacion(prep);
}

async function confirmarEliminarPreparacion(id, nombre) {
    if (confirm(`¿Eliminar la preparación "${nombre}"?`)) {
        await window.api.eliminarPreparacion(id);
        preparacionesCache = await window.api.obtenerPreparaciones();
        renderizarTablaPreparaciones();
        mostrarNotificacionExito('Preparación eliminada', '¡Eliminado!');
    }
}

// --- RECETAS ---
function renderizarTablaRecetas() {
    const tbody = document.getElementById('tabla-recetas');
    if (!productosRecetaCache.length) {
        tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; padding:30px; color:#9ca3af;">No hay productos en el menú.</td></tr>`;
        return;
    }
    tbody.innerHTML = productosRecetaCache.map(p => `<tr>
        <td>
            <div style="display:flex; align-items:center; gap:8px;">
                <span>${p.emoji || '📦'}</span>
                <strong>${p.nombre}</strong>
            </div>
        </td>
        <td><span class="badge-info">${p.categoria || '—'}</span></td>
        <td><span id="receta-count-${p.id}" style="color:#6b7280; font-size:0.9em;">Cargando...</span></td>
        <td>
            <button class="btn-secondary small" onclick="abrirModalReceta(${p.id}, '${p.nombre.replace(/'/g,'')}')" style="display:inline-flex;align-items:center;gap:4px;">
                <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/><path d="m15 5 4 4"/></svg>
                Editar receta
            </button>
        </td>
    </tr>`).join('');

    productosRecetaCache.forEach(p => {
        window.api.obtenerRecetaProducto(p.id).then(items => {
            const el = document.getElementById(`receta-count-${p.id}`);
            if (el) el.innerText = items.length > 0
                ? `${items.length} ingrediente${items.length !== 1 ? 's' : ''}`
                : 'Sin receta';
        });
    });
}

async function abrirModalReceta(productoId, nombre) {
    productoRecetaActual = productoId;
    document.getElementById('modal-receta-titulo').innerText = `Receta: ${nombre}`;
    document.getElementById('receta-items-lista').innerHTML = '';
    const items = await window.api.obtenerRecetaProducto(productoId);
    if (items.length > 0) {
        items.forEach(item => agregarLineaReceta(item));
    } else {
        agregarLineaReceta();
    }
    document.getElementById('modal-receta').classList.remove('hidden');
}

function cerrarModalReceta() {
    document.getElementById('modal-receta').classList.add('hidden');
    productoRecetaActual = null;
}

function agregarLineaReceta(itemExistente = null) {
    const lista = document.getElementById('receta-items-lista');
    const div = document.createElement('div');
    div.className = 'receta-linea';

    const opcionesInsumos = insumosCache.map(i =>
        `<option value="insumo_${i.id}" ${itemExistente && itemExistente.tipo === 'insumo' && itemExistente.referencia_id === i.id ? 'selected' : ''}>🧂 ${i.nombre} (${i.unidad})</option>`
    ).join('');
    const opcionesPrep = preparacionesCache.map(p =>
        `<option value="preparacion_${p.id}" ${itemExistente && itemExistente.tipo === 'preparacion' && itemExistente.referencia_id === p.id ? 'selected' : ''}>🧪 ${p.nombre}</option>`
    ).join('');

    div.innerHTML = `
        <select class="sel-ingrediente" onchange="actualizarUnidadReceta(this)">
            <optgroup label="Insumos">${opcionesInsumos || '<option disabled>Sin insumos</option>'}</optgroup>
            <optgroup label="Preparaciones">${opcionesPrep || '<option disabled>Sin preparaciones</option>'}</optgroup>
        </select>
        <input type="number" placeholder="Cantidad" min="0" step="0.01" value="${itemExistente ? itemExistente.cantidad : ''}">
        <select class="sel-unidad-receta" style="flex:1; min-width:60px;">
            <option value="">—</option>
        </select>
        <button class="btn-quitar" onclick="this.parentElement.remove()" title="Quitar">
            <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 11v6"/><path d="M14 11v6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
        </button>
    `;
    lista.appendChild(div);

    // Inicializar unidades al cargar
    const selIngrediente = div.querySelector('.sel-ingrediente');
    actualizarUnidadReceta(selIngrediente, itemExistente ? itemExistente.unidad_receta : null);
}

// Equivalencias automáticas entre unidades del mismo tipo
const EQUIVALENCIAS_UNIDAD = {
    'kg':     [{ unidad: 'g',   factor: 1000,    label: 'g (gramos)' }],
    'g':      [{ unidad: 'kg',  factor: 0.001,   label: 'kg (kilogramos)' }],
    'l':      [{ unidad: 'ml',  factor: 1000,    label: 'ml (mililitros)' },
               { unidad: 'gal', factor: 0.26417, label: 'gal (galones)' }],
    'ml':     [{ unidad: 'l',   factor: 0.001,   label: 'l (litros)' }],
    'gal':    [{ unidad: 'l',   factor: 3.78541, label: 'l (litros)' },
               { unidad: 'ml',  factor: 3785.41, label: 'ml (mililitros)' }],
    'latas':  [],
    'bolsas': [],
    'pzas':   [],
    'porciones': [],
};

// Unidades compatibles entre sí para conversiones cruzadas
const FAMILIAS_UNIDAD = {
    peso:   ['kg', 'g'],
    volumen: ['l', 'ml', 'gal'],
};

function obtenerUnidadesCompatibles(unidadNativa, contenidoUnidad) {
    // Todas las unidades que el usuario puede elegir en la receta
    const opciones = new Set([unidadNativa]);

    // Equivalencias directas de la unidad nativa
    (EQUIVALENCIAS_UNIDAD[unidadNativa] || []).forEach(eq => opciones.add(eq.unidad));

    // Si el insumo tiene conversión de presentación (latas→kg, bolsas→ml etc.)
    if (contenidoUnidad) {
        opciones.add(contenidoUnidad);
        // Y también las equivalencias de esa unidad de contenido (si es kg, agregar g; si es l, agregar ml)
        (EQUIVALENCIAS_UNIDAD[contenidoUnidad] || []).forEach(eq => opciones.add(eq.unidad));
    }

    return [...opciones];
}

function actualizarUnidadReceta(selectIngrediente, unidadGuardada = null) {
    const linea = selectIngrediente.closest('.receta-linea');
    const selUnidad = linea.querySelector('.sel-unidad-receta');
    const val = selectIngrediente.value;

    if (!val || val.startsWith('preparacion_')) {
        selUnidad.innerHTML = '<option value="">—</option>';
        selUnidad.style.display = 'none';
        return;
    }

    const insumoId = parseInt(val.replace('insumo_', ''));
    const insumo = insumosCache.find(i => i.id === insumoId);
    if (!insumo) { selUnidad.innerHTML = '<option value="">—</option>'; return; }

    selUnidad.style.display = 'inline-block';

    const unidadesDisponibles = obtenerUnidadesCompatibles(insumo.unidad, insumo.contenido_unidad);

    // Etiquetas amigables para cada unidad
    const etiquetas = {
        'kg': 'kg', 'g': 'g', 'l': 'l', 'ml': 'ml', 'gal': 'gal',
        'latas': 'latas', 'bolsas': 'bolsas', 'pzas': 'pzas', 'porciones': 'porciones'
    };

    selUnidad.innerHTML = unidadesDisponibles.map(u => {
        let label = etiquetas[u] || u;
        // Si es la unidad de contenido, mostrar la conversión como referencia
        if (u === insumo.contenido_unidad && insumo.contenido_cantidad && u !== insumo.unidad) {
            label += ` (1 ${insumo.unidad} = ${insumo.contenido_cantidad}${u})`;
        }
        const selected = (unidadGuardada === u) || (!unidadGuardada && u === insumo.unidad) ? 'selected' : '';
        return `<option value="${u}" ${selected}>${label}</option>`;
    }).join('');
}

async function guardarReceta() {
    const items = [];
   document.querySelectorAll('#receta-items-lista .receta-linea').forEach(linea => {
        const sel = linea.querySelector('.sel-ingrediente');
        const inp = linea.querySelector('input[type="number"]');
        const selUnidad = linea.querySelector('.sel-unidad-receta');
        if (sel && sel.value && inp && inp.value) {
            const [tipo, idStr] = sel.value.split('_');
            const unidad_receta = (selUnidad && selUnidad.value && selUnidad.value !== '—') 
                ? selUnidad.value 
                : null;
            items.push({ tipo, referencia_id: parseInt(idStr), cantidad: parseFloat(inp.value), unidad_receta });
        }
    });
    try {
        await window.api.guardarRecetaProducto(productoRecetaActual, items);
        cerrarModalReceta();
        renderizarTablaRecetas();
        mostrarNotificacionExito('Receta guardada', '¡Guardado!');
    } catch (e) { alert('Error al guardar la receta'); }
}

function guardarAjusteDirecto(clave, valor) {
    window.api.guardarAjuste(clave, String(valor));
}

// ============================================
// INVENTARIO — ENTRADAS DE INSUMOS
// ============================================

async function cargarTablaEntradas() {
    const tbody = document.getElementById('tabla-entradas');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding:20px; color:#9ca3af;">Cargando...</td></tr>';
    try {
        const entradas = await window.api.obtenerEntradasInsumo(null);
        if (!entradas.length) {
            tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding:30px; color:#9ca3af;">Aún no hay entradas registradas. Usa "+ Registrar Entrada" para iniciar el historial.</td></tr>';
            return;
        }
        tbody.innerHTML = entradas.map(e => {
            const fecha = new Date(e.fecha.replace(' ', 'T')).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' });
            return `<tr>
                <td><strong>${e.insumo_nombre}</strong></td>
                <td><span style="color:#10b981; font-weight:600;">+${e.cantidad} ${e.unidad}</span></td>
                <td style="color:#6b7280;">${e.notas || '—'}</td>
                <td style="color:#9ca3af; font-size:0.9em;">${fecha}</td>
            </tr>`;
        }).join('');
    } catch(e) { console.error(e); }
}

function abrirModalEntrada() {
    const select = document.getElementById('entrada-insumo-id');
    select.innerHTML = insumosCache.map(i => `<option value="${i.id}">${i.nombre} (${i.unidad}) — Stock actual: ${i.stock_actual}</option>`).join('');
    document.getElementById('entrada-cantidad').value = '';
    document.getElementById('entrada-notas').value = '';
    document.getElementById('modal-entrada').classList.remove('hidden');
}

function cerrarModalEntrada() {
    document.getElementById('modal-entrada').classList.add('hidden');
}

async function guardarEntrada() {
    const insumo_id = parseInt(document.getElementById('entrada-insumo-id').value);
    const cantidad = parseFloat(document.getElementById('entrada-cantidad').value);
    const notas = document.getElementById('entrada-notas').value.trim();
    if (!insumo_id || !cantidad || cantidad <= 0) { alert('Selecciona un insumo y escribe una cantidad válida.'); return; }
    try {
        await window.api.registrarEntradaInsumo({ insumo_id, cantidad, notas });
        cerrarModalEntrada();
        insumosCache = await window.api.obtenerInsumos();
        renderizarTablaInsumos();
        renderizarTablaPreparaciones();
        cargarTablaEntradas();
        mostrarNotificacionExito(`+${cantidad} registrado correctamente`, '¡Entrada Registrada!');
    } catch(e) { alert('Error al registrar la entrada'); }
}

// ============================================
// INVENTARIO — SALIDAS DE INSUMOS
// ============================================

async function cargarTablaSalidas() {
    const tbody = document.getElementById('tabla-salidas');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:20px; color:#9ca3af;">Cargando...</td></tr>';
    try {
        const salidas = await window.api.obtenerSalidasInsumo(null);
        if (!salidas.length) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:30px; color:#9ca3af;">Sin salidas registradas.</td></tr>';
            return;
        }
        const motivos = { merma:'Merma', caducidad:'Caducidad', accidente:'Accidente', robo:'Pérdida/Robo', ajuste:'Ajuste', otro:'Otro' };
        tbody.innerHTML = salidas.map(s => {
            const fecha = new Date(s.fecha.replace(' ','T')).toLocaleString('es-MX', { dateStyle:'short', timeStyle:'short' });
            return `<tr>
                <td><strong>${s.insumo_nombre}</strong></td>
                <td><span style="color:#ef4444; font-weight:600;">−${s.cantidad} ${s.unidad}</span></td>
                <td><span class="badge-info">${motivos[s.motivo] || s.motivo}</span></td>
                <td style="color:#6b7280;">${s.notas || '—'}</td>
                <td style="color:#9ca3af; font-size:0.9em;">${fecha}</td>
            </tr>`;
        }).join('');
    } catch(e) { console.error(e); }
}

function abrirModalSalida() {
    const select = document.getElementById('salida-insumo-id');
    select.innerHTML = insumosCache.map(i =>
        `<option value="${i.id}">${i.nombre} (${i.unidad}) — Stock: ${i.stock_actual}</option>`
    ).join('');
    document.getElementById('salida-cantidad').value = '';
    document.getElementById('salida-notas').value = '';
    document.getElementById('modal-salida').classList.remove('hidden');
}

function cerrarModalSalida() {
    document.getElementById('modal-salida').classList.add('hidden');
}

async function guardarSalida() {
    const insumo_id = parseInt(document.getElementById('salida-insumo-id').value);
    const cantidad = parseFloat(document.getElementById('salida-cantidad').value);
    const motivo = document.getElementById('salida-motivo').value;
    const notas = document.getElementById('salida-notas').value.trim();
    if (!insumo_id || !cantidad || cantidad <= 0) { alert('Selecciona un insumo y escribe una cantidad válida.'); return; }
    try {
        await window.api.registrarSalidaInsumo({ insumo_id, cantidad, motivo, notas });
        cerrarModalSalida();
        insumosCache = await window.api.obtenerInsumos();
        renderizarTablaInsumos();
        renderizarTablaPreparaciones();
        cargarTablaSalidas();
        mostrarNotificacionExito(`−${cantidad} registrado`, '¡Salida Registrada!');
    } catch(e) { alert('Error al registrar la salida'); }
}

// ============================================
// MÓDULO DE OFERTAS
// ============================================

let descuentosCache = [];
let combosCache = [];
let descuentoEditandoId = null;
let comboEditandoId = null;

async function cargarOfertas() {
    try {
        descuentosCache = await window.api.obtenerDescuentos();
        combosCache = await window.api.obtenerCombos();
        // También recargar productos para el selector de combos
        if (!productosGlobales.length) {
            const agrupados = await obtenerProductosAgrupadosWrapper();
            productosGlobales = [];
            agrupados.forEach(cat => cat.productos.forEach(p => productosGlobales.push({...p, categoria: cat.nombre})));
        }
        renderizarTablaDescuentos();
        renderizarTablaCombos();
    } catch(e) { console.error('Error al cargar ofertas:', e); }
}

function cambiarTabOfertas(tab, btn) {
    document.querySelectorAll('.inv-tabs .inv-tab').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('oferta-panel-descuentos').style.display = tab === 'descuentos' ? 'block' : 'none';
    document.getElementById('oferta-panel-combos').style.display = tab === 'combos' ? 'block' : 'none';
}

// --- DESCUENTOS ---
function renderizarTablaDescuentos() {
    const tbody = document.getElementById('tabla-descuentos');
    if (!descuentosCache.length) {
        tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; padding:30px; color:#9ca3af;">
            Sin descuentos. Crea uno con el botón de arriba — aparecerán en el modal de cobro de Nueva Venta.
        </td></tr>`;
        return;
    }
    tbody.innerHTML = descuentosCache.map(d => `<tr>
        <td><strong>${d.nombre}</strong></td>
        <td><span class="badge-info">${d.tipo === 'porcentaje' ? 'Porcentaje' : 'Monto fijo'}</span></td>
        <td style="font-weight:600; color:#2563eb;">${d.tipo === 'porcentaje' ? d.valor + '%' : '$' + parseFloat(d.valor).toFixed(2)}</td>
        <td>
            <div style="display:flex; gap:6px;">
                <button class="btn-secondary small" onclick="editarDescuento(${d.id})" style="display:inline-flex;align-items:center;gap:4px;">
                    <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/><path d="m15 5 4 4"/></svg>
                    Editar
                </button>
                <button class="btn-secondary small" onclick="confirmarEliminarDescuento(${d.id}, '${d.nombre}')" style="color:#ef4444; display:inline-flex;align-items:center;gap:4px;">
                    <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 11v6"/><path d="M14 11v6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                </button>
            </div>
        </td>
    </tr>`).join('');
}

function abrirModalNuevoDescuento(d = null) {
    descuentoEditandoId = d ? d.id : null;
    document.getElementById('modal-desc-titulo').innerText = d ? 'Editar Descuento' : 'Nuevo Descuento';
    document.getElementById('ndesc-nombre').value = d ? d.nombre : '';
    document.getElementById('ndesc-tipo').value = d ? d.tipo : 'porcentaje';
    document.getElementById('ndesc-valor').value = d ? d.valor : '';
    actualizarLabelDescuento();
    document.getElementById('modal-nuevo-descuento').classList.remove('hidden');
}

function cerrarModalNuevoDescuento() {
    document.getElementById('modal-nuevo-descuento').classList.add('hidden');
    descuentoEditandoId = null;
}

function actualizarLabelDescuento() {
    const tipo = document.getElementById('ndesc-tipo').value;
    document.getElementById('ndesc-valor-label').innerText = tipo === 'porcentaje' ? 'Valor (%)' : 'Valor ($)';
}

async function guardarDescuento() {
    const nombre = document.getElementById('ndesc-nombre').value.trim();
    const tipo = document.getElementById('ndesc-tipo').value;
    const valor = parseFloat(document.getElementById('ndesc-valor').value);
    if (!nombre || isNaN(valor) || valor <= 0) { alert('Completa todos los campos correctamente.'); return; }
    try {
        const datos = { nombre, tipo, valor };
        if (descuentoEditandoId) {
            await window.api.actualizarDescuento(descuentoEditandoId, datos);
        } else {
            await window.api.agregarDescuento(datos);
        }
        cerrarModalNuevoDescuento();
        descuentosCache = await window.api.obtenerDescuentos();
        renderizarTablaDescuentos();
        mostrarNotificacionExito('Descuento guardado', '¡Guardado!');
    } catch(e) { alert('Error al guardar el descuento'); }
}

function editarDescuento(id) {
    const d = descuentosCache.find(x => x.id === id);
    if (d) abrirModalNuevoDescuento(d);
}

async function confirmarEliminarDescuento(id, nombre) {
    if (confirm(`¿Eliminar el descuento "${nombre}"?`)) {
        await window.api.eliminarDescuento(id);
        descuentosCache = await window.api.obtenerDescuentos();
        renderizarTablaDescuentos();
        mostrarNotificacionExito('Descuento eliminado', '¡Eliminado!');
    }
}

// --- COMBOS ---
function renderizarTablaCombos() {
    const tbody = document.getElementById('tabla-combos');
    if (!combosCache.length) {
        tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:30px; color:#9ca3af;">
            Sin combos. Crea uno agrupando productos con un precio especial.
        </td></tr>`;
        return;
    }
    tbody.innerHTML = combosCache.map(c => `<tr>
        <td><strong>${c.nombre}</strong></td>
        <td style="color:#6b7280;">${c.descripcion || '—'}</td>
        <td style="font-weight:700; color:#10b981;">$${parseFloat(c.precio_especial).toFixed(2)}</td>
        <td><span id="combo-count-${c.id}" class="badge-info">...</span></td>
        <td>
            <div style="display:flex; gap:6px;">
                <button class="btn-secondary small" onclick="editarCombo(${c.id})" style="display:inline-flex;align-items:center;gap:4px;">
                    <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/><path d="m15 5 4 4"/></svg>
                    Editar
                </button>
                <button class="btn-secondary small" onclick="confirmarEliminarCombo(${c.id}, '${c.nombre}')" style="color:#ef4444; display:inline-flex;align-items:center;gap:4px;">
                    <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 11v6"/><path d="M14 11v6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                </button>
            </div>
        </td>
    </tr>`).join('');

    combosCache.forEach(c => {
        window.api.obtenerItemsCombo(c.id).then(items => {
            const el = document.getElementById(`combo-count-${c.id}`);
            if (el) el.innerText = `${items.length} producto${items.length !== 1 ? 's' : ''}`;
        });
    });
}

function abrirModalNuevoCombo(combo = null) {
    comboEditandoId = combo ? combo.id : null;
    document.getElementById('modal-combo-titulo').innerText = combo ? 'Editar Combo' : 'Nuevo Combo';
    document.getElementById('ncombo-nombre').value = combo ? combo.nombre : '';
    document.getElementById('ncombo-precio').value = combo ? combo.precio_especial : '';
    document.getElementById('ncombo-descripcion').value = combo ? combo.descripcion || '' : '';
    document.getElementById('combo-items-lista').innerHTML = '';
    document.getElementById('combo-precio-ref').innerText = '';

    if (combo) {
        window.api.obtenerItemsCombo(combo.id).then(items => {
            items.forEach(item => agregarLineaCombo(item));
            calcularPrecioReferenciaCombo();
        });
    } else {
        agregarLineaCombo();
    }
    document.getElementById('modal-nuevo-combo').classList.remove('hidden');
}

function cerrarModalNuevoCombo() {
    document.getElementById('modal-nuevo-combo').classList.add('hidden');
    comboEditandoId = null;
}

function agregarLineaCombo(itemExistente = null) {
    const lista = document.getElementById('combo-items-lista');
    const div = document.createElement('div');
    div.className = 'receta-linea';
    const opciones = productosGlobales.map(p =>
        `<option value="${p.id}" data-precio="${p.precio}" ${itemExistente && itemExistente.producto_id === p.id ? 'selected' : ''}>${p.emoji || '📦'} ${p.nombre} — $${p.precio.toFixed(2)}</option>`
    ).join('');
    div.innerHTML = `
        <select style="flex:3;" onchange="calcularPrecioReferenciaCombo()">
            ${opciones || '<option>Sin productos</option>'}
        </select>
        <input type="number" placeholder="Cant." min="1" step="1" value="${itemExistente ? itemExistente.cantidad : 1}" style="flex:0.6;" oninput="calcularPrecioReferenciaCombo()">
        <button class="btn-quitar" onclick="this.parentElement.remove(); calcularPrecioReferenciaCombo();" title="Quitar">
            <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 11v6"/><path d="M14 11v6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
        </button>
    `;
    lista.appendChild(div);
}

function calcularPrecioReferenciaCombo() {
    let total = 0;
    document.querySelectorAll('#combo-items-lista .receta-linea').forEach(linea => {
        const sel = linea.querySelector('select');
        const inp = linea.querySelector('input');
        const precio = parseFloat(sel.selectedOptions[0]?.dataset.precio) || 0;
        const cant = parseInt(inp?.value) || 1;
        total += precio * cant;
    });
    const ref = document.getElementById('combo-precio-ref');
    if (ref) ref.innerHTML = total > 0
        ? `Precio normal: <strong>$${total.toFixed(2)}</strong> — El combo debería costar menos que esto`
        : '';
}

async function guardarCombo() {
    const nombre = document.getElementById('ncombo-nombre').value.trim();
    const precio_especial = parseFloat(document.getElementById('ncombo-precio').value);
    const descripcion = document.getElementById('ncombo-descripcion').value.trim();
    if (!nombre || isNaN(precio_especial) || precio_especial <= 0) {
        alert('El nombre y el precio especial son obligatorios.');
        return;
    }
    const items = [];
    document.querySelectorAll('#combo-items-lista .receta-linea').forEach(linea => {
        const sel = linea.querySelector('select');
        const inp = linea.querySelector('input');
        if (sel?.value && inp?.value) {
            items.push({ producto_id: parseInt(sel.value), cantidad: parseInt(inp.value) || 1 });
        }
    });
    if (items.length === 0) { alert('Agrega al menos un producto al combo.'); return; }
    try {
        const datos = { nombre, descripcion, precio_especial };
        if (comboEditandoId) {
            await window.api.actualizarCombo(comboEditandoId, datos);
            await window.api.guardarItemsCombo(comboEditandoId, items);
        } else {
            const nuevoId = await window.api.agregarCombo(datos);
            await window.api.guardarItemsCombo(nuevoId, items);
        }
        cerrarModalNuevoCombo();
        combosCache = await window.api.obtenerCombos();
        renderizarTablaCombos();
        mostrarNotificacionExito('Combo guardado correctamente', '¡Combo Guardado!');
    } catch(e) { console.error(e); alert('Error al guardar el combo'); }
}

async function editarCombo(id) {
    const combo = combosCache.find(c => c.id === id);
    if (combo) abrirModalNuevoCombo(combo);
}

async function confirmarEliminarCombo(id, nombre) {
    if (confirm(`¿Eliminar el combo "${nombre}"?`)) {
        await window.api.eliminarCombo(id);
        combosCache = await window.api.obtenerCombos();
        renderizarTablaCombos();
        mostrarNotificacionExito('Combo eliminado', '¡Eliminado!');
    }
}

// ============================================
// BACKUPS
// ============================================
async function crearRespaldoAhora() {
    const btn = event.currentTarget;
    const textoOriginal = btn.innerText;
    btn.disabled = true;
    btn.innerText = 'Creando respaldo...';
    try {
        const resultado = await window.api.crearBackupManual();
        if (resultado.ok) {
            const nombre = resultado.ultimo || 'backup creado';
            document.getElementById('last-backup').innerText = nombre.replace('backup-', '').replace('.db', '').replace(/T/, ' ').replace(/-/g, ':').substring(0, 19);
            mostrarNotificacionExito(`Respaldo guardado (${resultado.total} en total)`, '¡Respaldo Creado!');
        } else {
            alert('Error al crear el respaldo: ' + resultado.error);
        }
    } catch(e) {
        alert('No se pudo crear el respaldo');
    } finally {
        btn.disabled = false;
        btn.innerText = textoOriginal;
    }
}

async function abrirCarpetaBackups() {
    await window.api.abrirCarpetaBackups();
}

/* ============================================
   GESTIÓN DE MODO DE CONEXIÓN
   ============================================ */

// Definir funciones globalmente
(function() {
    window.abrirModalConfiguracionConexion = function() {
        console.log('🔵 Abriendo modal de configuración...');
        
        // Actualizar UI con estado actual
        const selectorModo = document.getElementById('selector-modo-conexion');
        const modoDisplay = document.getElementById('modo-actual-display');
        const configBackend = document.getElementById('config-backend');
        const infoConexion = document.getElementById('info-conexion-actual');
        
        if (modoConectado) {
            selectorModo.value = 'conectado';
            modoDisplay.innerHTML = '🌐 MODO CONECTADO';
            modoDisplay.style.color = '#10b981';
            configBackend.style.display = 'block';
            
            if (tokenActual) {
                infoConexion.style.display = 'block';
                document.getElementById('usuario-conectado').innerText = `Usuario autenticado correctamente`;
            }
        } else {
            selectorModo.value = 'local';
            modoDisplay.innerHTML = '🔌 MODO LOCAL';
            modoDisplay.style.color = '#2563eb';
            configBackend.style.display = 'none';
        }
        
        // Mostrar modal
        const modal = document.getElementById('modal-configuracion-conexion');
        modal.classList.remove('hidden');
        modal.style.display = 'flex';
        
        console.log('✅ Modal abierto');
    };

    window.cerrarModalConfiguracionConexion = function() {
        console.log('🔴 Cerrando modal de configuración...');
        const modal = document.getElementById('modal-configuracion-conexion');
        modal.classList.add('hidden');
        modal.style.display = 'none';
    };

    window.cambiarModoConexion = function(modo) {
        console.log('🔄 Cambiando modo a:', modo);
        const configBackend = document.getElementById('config-backend');
        const modoDisplay = document.getElementById('modo-actual-display');
        
        if (modo === 'conectado') {
            configBackend.style.display = 'block';
            modoDisplay.innerHTML = '🌐 MODO CONECTADO';
            modoDisplay.style.color = '#10b981';
        } else {
            configBackend.style.display = 'none';
            modoDisplay.innerHTML = '🔌 MODO LOCAL';
            modoDisplay.style.color = '#2563eb';
            
            // Cambiar a modo local inmediatamente
            if (typeof window.activarModoLocal === 'function') {
                window.activarModoLocal();
            }
        }
    };
})();

// ============================================
// SINCRONIZACIÓN LOCAL → NUBE
// ============================================
async function syncLocalToCloud() {
    const resultadoDiv = document.getElementById('resultado-conexion');
    const msg = (texto) => { if (resultadoDiv) resultadoDiv.innerHTML = texto; };

    try {
        // 1. CATEGORÍAS — emparejar por nombre
        msg('⏳ Sincronizando categorías...');
        const localCats = await window.api.obtenerClasificacionesRaw();
        const cloudCats = await apiClient.getCategories();
        const catIdMap = {}; // local_id → cloud_id

        for (const cat of localCats) {
            const match = cloudCats.find(c =>
                c.name.toLowerCase().trim() === cat.nombre.toLowerCase().trim()
            );
            if (match) {
                catIdMap[cat.id] = match.id;
            } else {
                try {
                    const created = await apiClient.createCategory({ name: cat.nombre, emoji: cat.emoji });
                    catIdMap[cat.id] = created.id;
                } catch(e) { console.warn('Sync cat skip:', cat.nombre, e.message); }
            }
        }

        // 2. PRODUCTOS — emparejar por nombre
        msg('⏳ Sincronizando productos...');
        const localCatsConProds = await window.api.obtenerProductosAgrupados();
        const localProds = localCatsConProds.flatMap(cat => cat.productos || []);
        const cloudProds = await apiClient.getProducts();
        const prodIdMap = {}; // local_id → cloud_id

        for (const prod of localProds) {
            if (!prod.nombre || !prod.precio) continue;
            const match = cloudProds.find(p =>
                p.name.toLowerCase().trim() === prod.nombre.toLowerCase().trim()
            );
            if (match) {
                prodIdMap[prod.id] = match.id;
            } else {
                try {
                    const created = await apiClient.createProduct({
                        name: prod.nombre,
                        description: prod.descripcion || '',
                        price: prod.precio,
                        stock: prod.stock || 0,
                        category_id: prod.clasificacion_id ? (catIdMap[prod.clasificacion_id] || null) : null,
                        emoji: prod.emoji || '📦'
                    });
                    prodIdMap[prod.id] = created.id;
                } catch(e) { console.warn('Sync prod skip:', prod.nombre, e.message); }
            }
        }

        // 3. CLIENTES — emparejar por teléfono
        msg('⏳ Sincronizando clientes...');
        const localClientes = await window.api.obtenerClientes();
        const cloudClientes = await apiClient.getCustomers();

        for (const cust of localClientes) {
            if (!cust.telefono || !cust.nombre) continue;
            const match = cloudClientes.find(c => c.phone === cust.telefono);
            if (!match) {
                try {
                    await apiClient.createCustomer({
                        phone: cust.telefono,
                        name: cust.nombre,
                        address: cust.direccion || '',
                        notes: cust.notas || ''
                    });
                } catch(e) { console.warn('Sync cliente skip:', cust.telefono, e.message); }
            }
        }

        console.log(`✅ Sync completado: ${Object.keys(catIdMap).length} categorías, ${Object.keys(prodIdMap).length} productos, ${localClientes.length} clientes procesados`);

    } catch (error) {
        console.error('Error durante sincronización:', error);
        msg('⚠️ Sincronización parcial. Algunos datos podrían no haberse subido.');
        await new Promise(r => setTimeout(r, 1500));
    }
}

// ============================================
// SINCRONIZACIÓN BACKEND → LOCAL
// ============================================

async function sincronizarDesdeBackend() {
    if (!modoConectado || !apiClient || !tokenActual) return;
    console.log('🔄 Sincronizando datos del backend...');
    try {
        // 1. Categorías
        const cats = await apiClient.getCategories();
        await window.api.syncClasificaciones(cats);

        // 2. Productos (lista plana)
        const prods = await apiClient.getProducts();
        await window.api.syncProductos(prods);

        // 3. Clientes
        const clientes = await apiClient.getCustomers();
        await window.api.syncClientes(clientes);

        // 4-6. Inventario (insumos, preparaciones, recetas) — solo sincronizar si el
        // backend tiene datos; si está vacío, conservar los datos locales para no perderlos
        const insumosBackend = await apiClient.request('/inventory/ingredients');
        if (insumosBackend && insumosBackend.length > 0) {
            await window.api.syncInsumos(insumosBackend);
            const preps = await apiClient.request('/inventory/preparations');
            await window.api.syncPreparaciones(preps);
            const recetas = await apiClient.request('/inventory/all-recipes');
            await window.api.syncRecetas(recetas);
        }

        // 7. Descuentos
        const descuentos = await apiClient.request('/offers/discounts');
        await window.api.syncDescuentos(descuentos);

        // 8. Combos (con sus items)
        const combos = await apiClient.request('/offers/combos');
        await window.api.syncCombos(combos);

        // 9. Ajustes del negocio (PINs y permisos)
        try {
            const ajustesNegocio = await apiClient.request('/settings');
            if (ajustesNegocio.permisos_roles) {
                await window.api.guardarAjuste('permisos_roles', JSON.stringify(ajustesNegocio.permisos_roles));
            }
        } catch (e) {
            console.warn('No se pudieron sincronizar ajustes de negocio:', e.message);
        }

        console.log('✅ Sincronización desde backend completada');
    } catch (error) {
        console.error('⚠️ Error en sincronización desde backend:', error);
    }
}

async function subirPedidosPendientes() {
    if (!modoConectado || !apiClient || !tokenActual) return;
    try {
        const pendientes = await window.api.obtenerPedidosPendientes();
        if (!pendientes || pendientes.length === 0) return;
        console.log(`📤 Subiendo ${pendientes.length} pedido(s) pendiente(s)...`);
        for (const pedido of pendientes) {
            try {
                const items = await window.api.obtenerItemsPedido(pedido.id);
                const datosAPI = {
                    customer_id: pedido.cliente_id || null,
                    customer_temp_info: pedido.info_cliente_temp || null,
                    total: pedido.total,
                    payment_method: pedido.metodo_pago,
                    order_type: pedido.tipo_pedido || 'comer',
                    reference: pedido.referencia || null,
                    delivery_address: pedido.direccion_domicilio || null,
                    maps_link: pedido.link_maps || null,
                    notes: pedido.notas_generales || null
                };
                const itemsAPI = items.map(i => ({
                    product_id: i.producto_id,
                    quantity: i.cantidad,
                    unit_price: i.precio_unitario,
                    subtotal: i.subtotal,
                    notes: i.nota_item || ''
                }));
                await apiClient.createOrder(datosAPI, itemsAPI);
                await window.api.marcarPedidoSincronizado(pedido.id);
            } catch (e) {
                console.warn(`No se pudo subir pedido ${pedido.id}:`, e.message);
            }
        }
        console.log('✅ Pedidos pendientes sincronizados');
    } catch (error) {
        console.error('Error al subir pedidos pendientes:', error);
    }
}

window.testearConexionBackend = async function() {
    const url = document.getElementById('backend-url').value.trim();
    const username = document.getElementById('backend-username').value.trim();
    const password = document.getElementById('backend-password').value.trim();
    const resultadoDiv = document.getElementById('resultado-conexion');
    const infoConexion = document.getElementById('info-conexion-actual');
    
    if (!url || !username || !password) {
        window.mostrarResultadoConexion('error', '❌ Por favor completa todos los campos');
        return;
    }
    
    resultadoDiv.style.display = 'block';
    resultadoDiv.style.background = '#fef3c7';
    resultadoDiv.style.color = '#92400e';
    resultadoDiv.innerHTML = '⏳ Probando conexión...';
    
    try {
        apiClient.setBaseURL(url);
        const response = await apiClient.login(username, password);
        
        if (response.token) {
            tokenActual = response.token;
            apiClient.setToken(response.token);
            modoConectado = true;
            
            await window.api.guardarAjuste('modo_conectado', 'true');
            await window.api.guardarAjuste('api_url', url);
            await window.api.guardarAjuste('api_token', response.token);

            await syncLocalToCloud();

            window.mostrarResultadoConexion('success', `✅ Conexión exitosa. Bienvenido ${response.user.name}`);
            
            infoConexion.style.display = 'block';
            document.getElementById('usuario-conectado').innerText = 
                `Usuario: ${response.user.name} (${response.user.role})`;
            
            document.getElementById('modo-actual-display').innerHTML = '🌐 MODO CONECTADO';
            document.getElementById('modo-actual-display').style.color = '#10b981';
            
            console.log('✅ Modo conectado activado');
            
            setTimeout(() => {
                location.reload();
            }, 2000);
            
        } else {
            throw new Error('No se recibió token de autenticación');
        }
    } catch (error) {
        console.error('Error al conectar con backend:', error);
        window.mostrarResultadoConexion('error', `❌ Error: ${error.message}`);
        window.activarModoLocal();
    }
};

window.mostrarResultadoConexion = function(tipo, mensaje) {
    const resultadoDiv = document.getElementById('resultado-conexion');
    resultadoDiv.style.display = 'block';
    
    if (tipo === 'success') {
        resultadoDiv.style.background = '#d1fae5';
        resultadoDiv.style.color = '#065f46';
        resultadoDiv.style.borderLeft = '4px solid #10b981';
    } else {
        resultadoDiv.style.background = '#fee2e2';
        resultadoDiv.style.color = '#991b1b';
        resultadoDiv.style.borderLeft = '4px solid #ef4444';
    }
    
    resultadoDiv.innerHTML = mensaje;
};

window.activarModoLocal = async function() {
    modoConectado = false;
    tokenActual = null;
    
    await window.api.guardarAjuste('modo_conectado', 'false');
    await window.api.guardarAjuste('api_token', '');
    
    console.log('🔌 Modo local activado');
    
    document.getElementById('modo-actual-display').innerHTML = '🔌 MODO LOCAL';
    document.getElementById('modo-actual-display').style.color = '#2563eb';
};

// ============================================
// PERFIL — SELECCIÓN AL INICIO
// ============================================

async function inicializarPerfil() {
    return new Promise(async (resolve) => {
        const screen = document.getElementById('perfil-screen');
        if (!screen) return resolve();

        // Leer permisos guardados para saber qué perfiles están activos
        let permisos = { cajero: { ...PERMISOS_DEFAULT.cajero }, encargado: { ...PERMISOS_DEFAULT.encargado } };
        try {
            const ajustes = await window.api.obtenerAjustes();
            const guardados = JSON.parse(ajustes.permisos_roles || '{}');
            if (guardados.cajero)    permisos.cajero    = { ...permisos.cajero,    ...guardados.cajero };
            if (guardados.encargado) permisos.encargado = { ...permisos.encargado, ...guardados.encargado };
        } catch(e) { /* usa defaults */ }

        const cajeroActivo    = permisos.cajero.enabled    === true;
        const encargadoActivo = permisos.encargado.enabled === true;

        // Si ningún perfil adicional está activo, saltar pantalla y entrar como Administrador
        if (!cajeroActivo && !encargadoActivo) {
            rolActivo = 'dueno';
            return resolve();
        }

        // Mostrar solo los botones de perfiles activos
        const btnCajero    = document.getElementById('perfil-btn-cajero');
        const btnEncargado = document.getElementById('perfil-btn-encargado');
        if (btnCajero)    btnCajero.style.display    = cajeroActivo    ? '' : 'none';
        if (btnEncargado) btnEncargado.style.display = encargadoActivo ? '' : 'none';

        screen.style.display = 'flex';
        window._resolverPerfil = resolve;
    });
}

let _perfilPendiente = null; // rol esperando verificación de PIN

async function seleccionarPerfil(rol) {
    // Si el perfil tiene PIN configurado, pedir verificación primero
    if (rol !== 'dueno') {
        let permisos = {};
        try {
            const ajustes = await window.api.obtenerAjustes();
            permisos = JSON.parse(ajustes.permisos_roles || '{}');
        } catch(e) {}

        if (permisos[rol]?.pin_set && permisos[rol]?.pin) {
            _perfilPendiente = rol;
            const labels = { cajero: '🧑‍💼 Cajero', encargado: '👔 Encargado' };
            document.getElementById('pin-perfil-label').textContent = labels[rol] || rol;
            document.getElementById('pin-perfil-input').value = '';
            document.getElementById('pin-perfil-error').style.display = 'none';
            // Ocultar pantalla de perfiles para que el modal se vea claramente
            const screen = document.getElementById('perfil-screen');
            if (screen) screen.style.display = 'none';
            document.getElementById('modal-pin-perfil').classList.remove('hidden');
            setTimeout(() => document.getElementById('pin-perfil-input')?.focus(), 100);
            return;
        }
    }
    completarSeleccionPerfil(rol);
}

async function confirmarPinPerfil() {
    const pinIngresado = document.getElementById('pin-perfil-input')?.value;
    if (!pinIngresado) return;

    let permisos = {};
    try {
        const ajustes = await window.api.obtenerAjustes();
        permisos = JSON.parse(ajustes.permisos_roles || '{}');
    } catch(e) {}

    const pinHash = await hashPin(pinIngresado);
    if (permisos[_perfilPendiente]?.pin === pinHash) {
        document.getElementById('modal-pin-perfil').classList.add('hidden');
        completarSeleccionPerfil(_perfilPendiente);
        _perfilPendiente = null;
    } else {
        document.getElementById('pin-perfil-error').style.display = '';
        document.getElementById('pin-perfil-input').value = '';
        document.getElementById('pin-perfil-input').focus();
    }
}

function cancelarSeleccionPerfil() {
    document.getElementById('modal-pin-perfil').classList.add('hidden');
    // Volver a mostrar la pantalla de perfiles si todavía estamos esperando selección
    if (window._resolverPerfil) {
        const screen = document.getElementById('perfil-screen');
        if (screen) screen.style.display = 'flex';
    }
    _perfilPendiente = null;
}

function completarSeleccionPerfil(rol) {
    rolActivo = rol;
    nombreActivo = document.getElementById('perfil-nombre-input')?.value?.trim() || '';
    const screen = document.getElementById('perfil-screen');
    if (screen) screen.style.display = 'none';
    // Actualizar botón en header con nombre del perfil activo
    const labels = { cajero: '🧑‍💼 Cajero', encargado: '👔 Encargado', dueno: '🔑 Admin' };
    const textoBtn = document.getElementById('texto-perfil-activo');
    if (textoBtn) textoBtn.textContent = labels[rol] || rol;
    const btnCambiar = document.getElementById('btn-cambiar-perfil');
    if (btnCambiar) btnCambiar.style.display = 'flex';
    // Si no es admin, mostrar el app directamente y ocultar la pantalla de login
    if (rol !== 'dueno') {
        const appDiv = document.querySelector('.app');
        if (appDiv) appDiv.style.display = '';
        const loginScreen = document.getElementById('login-screen');
        if (loginScreen) loginScreen.style.display = 'none';
    }
    if (window._resolverPerfil) {
        window._resolverPerfil();
        window._resolverPerfil = null;
    }
}

async function hashPin(pin) {
    const encoder = new TextEncoder();
    const data = encoder.encode(pin);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function actualizarVisibilidadBtnCambiarPerfil() {
    const cajeroEnabled    = document.getElementById('puesto-enabled-cajero')?.checked;
    const encargadoEnabled = document.getElementById('puesto-enabled-encargado')?.checked;
    const btnCambiar = document.getElementById('btn-cambiar-perfil');
    if (btnCambiar && (cajeroEnabled || encargadoEnabled)) {
        btnCambiar.style.display = 'flex';
    }
}

function volverAPantallaPerfiles() {
    rolActivo = 'dueno';
    nombreActivo = '';
    const input = document.getElementById('perfil-nombre-input');
    if (input) input.value = '';
    const btnCambiar = document.getElementById('btn-cambiar-perfil');
    if (btnCambiar) btnCambiar.style.display = 'none';
    inicializarPerfil().then(async () => {
        // Si el usuario eligió Admin, verificar contraseña antes de dejar entrar
        if (rolActivo === 'dueno') {
            await inicializarLogin();
        }
        await aplicarPermisos();
        actualizarIndicadorTurnoSidebar();
        navegarAPrimeraVistaDisponible();
    });
}

// ============================================
// TURNOS — CORTE DE CAJA
// ============================================

const fmt = (v) => '$' + parseFloat(v || 0).toFixed(2);

async function inicializarTurno() {
    turnoActivo = await window.api.obtenerTurnoActivo();
    // Si hay un turno activo, restaurar nombre del cajero
    if (turnoActivo) {
        nombreActivo = turnoActivo.cajero_nombre || '';
    }
    // rolActivo ya fue establecido por inicializarPerfil(), no sobreescribir
    aplicarPermisos();
    actualizarIndicadorTurnoSidebar();
}

async function aplicarPermisos() {
    if (rolActivo === 'dueno') {
        // El dueño ve todo — restaurar todos los botones
        document.querySelectorAll('.menu-item').forEach(btn => btn.classList.remove('hidden'));
        return;
    }
    let permisos = PERMISOS_DEFAULT[rolActivo] || {};
    try {
        const ajustes = await window.api.obtenerAjustes();
        const guardados = JSON.parse(ajustes.permisos_roles || '{}');
        if (guardados[rolActivo]) permisos = guardados[rolActivo];
    } catch(e) { /* usa defaults */ }

    const mapa = {
        ver_dashboard:   'dashboard',
        ver_nueva_venta: 'nueva-venta',
        ver_pedidos:     'pedidos',
        ver_turno:       'turno',
        ver_productos:   'productos',
        ver_clientes:    'clientes',
        ver_ofertas:     'ofertas',
        ver_inventario:  'inventario',
        ver_ajustes:     'ajustes'
    };

    // Restaurar todos primero
    document.querySelectorAll('.menu-item').forEach(btn => btn.classList.remove('hidden'));

    // Ocultar según permisos
    Object.entries(mapa).forEach(([permiso, vista]) => {
        const btn = document.querySelector(`[data-view="${vista}"]`);
        if (btn) btn.classList.toggle('hidden', permisos[permiso] === false);
    });
}

function navegarAPrimeraVistaDisponible() {
    const primerBtn = document.querySelector('.menu-item:not(.hidden)');
    if (primerBtn) {
        const vista = primerBtn.getAttribute('data-view');
        if (vista) cambiarVista(vista);
    }
}

function actualizarIndicadorTurnoSidebar() {
    const btnTurno = document.getElementById('menu-turno');
    if (!btnTurno) return;
    if (turnoActivo) {
        btnTurno.classList.add('menu-turno-activo');
    } else {
        btnTurno.classList.remove('menu-turno-activo');
    }
}

async function cargarVistaTurno() {
    const panelSin    = document.getElementById('turno-sin-turno');
    const panelActivo = document.getElementById('turno-activo');

    if (turnoActivo) {
        panelSin.classList.add('hidden');
        panelActivo.classList.remove('hidden');

        // Poblar datos del turno
        document.getElementById('turno-act-nombre').textContent   = turnoActivo.cajero_nombre;
        document.getElementById('turno-act-rol').textContent      = turnoActivo.rol.charAt(0).toUpperCase() + turnoActivo.rol.slice(1);
        document.getElementById('turno-act-apertura').textContent = new Date(turnoActivo.apertura).toLocaleString('es-MX');
        document.getElementById('turno-act-fondo').textContent    = fmt(turnoActivo.fondo_inicial);

        // Totales en tiempo real
        try {
            const totales = await window.api.calcularTotalesTurno(turnoActivo.apertura);
            document.getElementById('turno-total-ventas').textContent        = fmt(totales.total_ventas || 0);
            document.getElementById('turno-total-pedidos').textContent       = totales.total_pedidos || 0;
            document.getElementById('turno-total-efectivo').textContent      = fmt(totales.total_efectivo || 0);
            document.getElementById('turno-total-tarjeta').textContent       = fmt(totales.total_tarjeta || 0);
            document.getElementById('turno-total-transferencia').textContent = fmt(totales.total_transferencia || 0);
        } catch(e) { console.error('Error calculando totales turno:', e); }
    } else {
        panelSin.classList.remove('hidden');
        panelActivo.classList.add('hidden');
        // Pre-llenar el rol con el perfil activo
        const selectRol = document.getElementById('turno-rol');
        if (selectRol && rolActivo) selectRol.value = rolActivo;
    }

    // Cargar historial
    await cargarHistorialTurnos();
}

async function cargarHistorialTurnos() {
    const tbody = document.getElementById('turno-historial-body');
    if (!tbody) return;
    try {
        const turnos = await window.api.obtenerTurnos();
        if (!turnos.length) {
            tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;color:var(--text-muted);">Sin turnos registrados</td></tr>';
            return;
        }
        tbody.innerHTML = turnos.map(t => `
            <tr>
                <td>#${t.id}</td>
                <td>${t.cajero_nombre}</td>
                <td>${t.rol.charAt(0).toUpperCase() + t.rol.slice(1)}</td>
                <td>${new Date(t.apertura).toLocaleString('es-MX')}</td>
                <td>${t.cierre ? new Date(t.cierre).toLocaleString('es-MX') : '—'}</td>
                <td>${fmt(t.total_ventas)}</td>
                <td>${fmt(t.total_efectivo)}</td>
                <td class="${t.diferencia < 0 ? 'text-danger' : t.diferencia > 0 ? 'text-success' : ''}">${fmt(t.diferencia)}</td>
                <td><span class="badge-${t.estado}">${t.estado === 'abierto' ? 'Abierto' : 'Cerrado'}</span></td>
            </tr>
        `).join('');
    } catch(e) {
        console.error('Error cargando historial turnos:', e);
    }
}

async function abrirTurno() {
    const nombre = document.getElementById('turno-nombre')?.value?.trim();
    const rol    = document.getElementById('turno-rol')?.value || 'cajero';
    const fondo  = parseFloat(document.getElementById('turno-fondo')?.value) || 0;

    if (!nombre) {
        mostrarNotificacionExito('Ingresa el nombre del cajero', '⚠️ Error');
        return;
    }

    try {
        nombreActivo = nombre;
        const id = await window.api.abrirTurno(nombre, rol, fondo);
        turnoActivo = await window.api.obtenerTurnoActivo();
        rolActivo = turnoActivo?.rol || 'dueno';
        aplicarPermisos();
        actualizarIndicadorTurnoSidebar();
        cargarVistaTurno();
        mostrarNotificacionExito(`Turno abierto — ${nombre}`, '¡Turno Abierto!');
    } catch(e) {
        mostrarNotificacionExito('Error al abrir turno', '⚠️ Error');
        console.error(e);
    }
}

async function abrirModalCierre() {
    if (!turnoActivo) return;
    try {
        const totales = await window.api.calcularTotalesTurno(turnoActivo.apertura);
        const fondoInicial      = turnoActivo.fondo_inicial || 0;
        const efectivoVentas    = totales.total_efectivo || 0;
        const esperado          = fondoInicial + efectivoVentas;

        document.getElementById('cierre-fondo').textContent           = fmt(fondoInicial);
        document.getElementById('cierre-efectivo-ventas').textContent = fmt(efectivoVentas);
        document.getElementById('cierre-esperado').textContent        = fmt(esperado);
        document.getElementById('cierre-efectivo-contado').value      = '';
        document.getElementById('cierre-diferencia').textContent      = '$0.00';
        document.getElementById('cierre-notas').value                 = '';

        document.getElementById('modal-cierre-turno').classList.remove('hidden');
    } catch(e) {
        mostrarNotificacionExito('Error al cargar datos de cierre', '⚠️ Error');
    }
}

function actualizarDiferencia() {
    const contado  = parseFloat(document.getElementById('cierre-efectivo-contado')?.value) || 0;
    const esperado = parseFloat(document.getElementById('cierre-esperado')?.textContent?.replace(/[^0-9.-]/g, '')) || 0;
    const dif      = contado - esperado;
    const el       = document.getElementById('cierre-diferencia');
    el.textContent = fmt(dif);
    el.style.color = dif < 0 ? '#ef4444' : dif > 0 ? '#22c55e' : 'inherit';
}

async function confirmarCierreTurno() {
    if (!turnoActivo) return;
    const contado = parseFloat(document.getElementById('cierre-efectivo-contado')?.value);
    if (isNaN(contado) || contado < 0) {
        mostrarNotificacionExito('Ingresa el efectivo contado', '⚠️ Error');
        return;
    }
    const notas = document.getElementById('cierre-notas')?.value || '';

    try {
        await window.api.cerrarTurno(turnoActivo.id, contado, notas);
        document.getElementById('modal-cierre-turno').classList.add('hidden');
        turnoActivo = null;
        rolActivo   = 'dueno';
        aplicarPermisos();
        actualizarIndicadorTurnoSidebar();
        cargarVistaTurno();
        mostrarNotificacionExito('Turno cerrado correctamente', '¡Turno Cerrado!');
    } catch(e) {
        mostrarNotificacionExito('Error al cerrar turno', '⚠️ Error');
        console.error(e);
    }
}

// ============================================
// PERMISOS POR ROL (en Ajustes)
// ============================================

async function cargarPermisosAjustes() {
    const cardPermisos = document.getElementById('card-permisos-rol');
    if (!cardPermisos) return;

    // Solo visible para administrador
    if (rolActivo !== 'dueno') {
        cardPermisos.classList.add('hidden');
        return;
    }
    cardPermisos.classList.remove('hidden');

    let permisos = {
        cajero:    { ...PERMISOS_DEFAULT.cajero },
        encargado: { ...PERMISOS_DEFAULT.encargado }
    };
    try {
        const ajustes = await window.api.obtenerAjustes();
        const guardados = JSON.parse(ajustes.permisos_roles || '{}');
        if (guardados.cajero)    permisos.cajero    = { ...permisos.cajero,    ...guardados.cajero };
        if (guardados.encargado) permisos.encargado = { ...permisos.encargado, ...guardados.encargado };
    } catch(e) { /* usa defaults */ }

    const secciones = [
        { clave: 'ver_dashboard',   label: 'Dashboard' },
        { clave: 'ver_nueva_venta', label: 'Nueva Venta' },
        { clave: 'ver_pedidos',     label: 'Pedidos' },
        { clave: 'ver_turno',       label: 'Turno / Caja' },
        { clave: 'ver_productos',   label: 'Productos' },
        { clave: 'ver_clientes',    label: 'Clientes' },
        { clave: 'ver_ofertas',     label: 'Ofertas' },
        { clave: 'ver_inventario',  label: 'Inventario' },
        { clave: 'ver_ajustes',     label: 'Ajustes' },
    ];

    const roles = [
        { key: 'cajero',    label: 'Cajero',    icon: '🧑‍💼' },
        { key: 'encargado', label: 'Encargado', icon: '👔'   }
    ];

    const container = document.getElementById('puestos-container');
    container.innerHTML = roles.map(r => {
        const activo = permisos[r.key].enabled === true;
        const funcs = secciones.map(s => `
            <div class="puesto-funcion-item">
                <span>${s.label}</span>
                <label class="switch switch-sm">
                    <input type="checkbox" data-rol="${r.key}" data-permiso="${s.clave}"
                        ${permisos[r.key][s.clave] !== false ? 'checked' : ''}
                        onchange="guardarPermisosRol()">
                    <span class="slider"></span>
                </label>
            </div>`).join('');

        const tienePin = permisos[r.key].pin_set === true;

        return `
        <div class="puesto-row" id="puesto-row-${r.key}">
            <div class="puesto-header">
                <div style="display:flex;align-items:center;gap:10px;">
                    <span style="font-size:22px;">${r.icon}</span>
                    <div>
                        <strong>${r.label}</strong>
                        <div id="puesto-estado-${r.key}" style="font-size:12px;color:var(--text-muted);">${activo ? 'Activo' : 'Desactivado'}</div>
                    </div>
                </div>
                <label class="switch">
                    <input type="checkbox" id="puesto-enabled-${r.key}" data-rol="${r.key}" data-permiso="enabled"
                        ${activo ? 'checked' : ''}
                        onchange="togglePuestoEnabled('${r.key}', this.checked)">
                    <span class="slider"></span>
                </label>
            </div>
            <div class="puesto-funciones" id="puesto-funciones-${r.key}" style="${activo ? '' : 'display:none;'}">
                <p style="font-size:12px;color:var(--text-muted);margin-bottom:10px;">Secciones visibles para este puesto:</p>
                ${funcs}
                <div class="puesto-pin-section">
                    <strong style="font-size:13px;">PIN de acceso</strong>
                    <p style="font-size:12px;color:var(--text-muted);margin:3px 0 10px;">
                        ${tienePin ? '✅ PIN configurado.' : 'Sin PIN — cualquiera puede seleccionar este perfil.'}
                    </p>
                    <div style="display:flex;gap:8px;align-items:center;">
                        <input type="password" id="puesto-pin-${r.key}" placeholder="${tienePin ? 'Nuevo PIN para reemplazar' : '4-8 dígitos'}"
                               inputmode="numeric" maxlength="8"
                               style="flex:1;padding:8px 12px;border:1px solid var(--border);border-radius:8px;font-size:14px;">
                        <button class="btn-primary" style="white-space:nowrap;" onclick="guardarPinPerfil('${r.key}')">
                            ${tienePin ? 'Cambiar' : 'Guardar PIN'}
                        </button>
                    </div>
                    ${tienePin ? `
                    <button class="btn-secondary" onclick="quitarPinPerfil('${r.key}')"
                            style="margin-top:8px;width:100%;color:#ef4444;border-color:#fecaca;">
                        🗑 Quitar PIN de ${r.label}
                    </button>` : ''}
                </div>
            </div>
        </div>`;
    }).join('');

    // Administrador siempre al final
    container.innerHTML += `
        <div class="puesto-row puesto-row-admin">
            <div class="puesto-header">
                <div style="display:flex;align-items:center;gap:10px;">
                    <span style="font-size:22px;">🔑</span>
                    <div>
                        <strong>Administrador</strong>
                        <div style="font-size:12px;color:var(--text-muted);">Siempre activo — acceso completo</div>
                    </div>
                </div>
                <label class="switch" style="opacity:0.5;pointer-events:none;">
                    <input type="checkbox" checked disabled>
                    <span class="slider"></span>
                </label>
            </div>
        </div>`;
}

function togglePuestoEnabled(rol, activo) {
    const funciones = document.getElementById(`puesto-funciones-${rol}`);
    const subtitulo = document.getElementById(`puesto-estado-${rol}`);
    if (funciones) funciones.style.display = activo ? '' : 'none';
    if (subtitulo) subtitulo.textContent = activo ? 'Activo' : 'Desactivado';
    guardarPermisosRol();
    actualizarVisibilidadBtnCambiarPerfil();
}

async function guardarPermisosRol() {
    // Cargar permisos existentes primero (para no perder PINs guardados)
    let permisos = {
        cajero:    { ...PERMISOS_DEFAULT.cajero },
        encargado: { ...PERMISOS_DEFAULT.encargado }
    };
    try {
        const ajustes = await window.api.obtenerAjustes();
        const guardados = JSON.parse(ajustes.permisos_roles || '{}');
        // Preservar PIN y pin_set de los datos guardados
        if (guardados.cajero)    permisos.cajero    = { ...permisos.cajero,    ...guardados.cajero };
        if (guardados.encargado) permisos.encargado = { ...permisos.encargado, ...guardados.encargado };
    } catch(e) {}

    // Leer estado actual de los checkboxes
    document.querySelectorAll('#puestos-container input[data-rol]').forEach(cb => {
        const rol     = cb.dataset.rol;
        const permiso = cb.dataset.permiso;
        if (permisos[rol]) permisos[rol][permiso] = cb.checked;
    });

    try {
        await window.api.guardarAjuste('permisos_roles', JSON.stringify(permisos));
        if (turnoActivo) aplicarPermisos();
    } catch(e) {
        mostrarNotificacionExito('Error guardando configuración', '⚠️ Error');
    }
}

async function guardarPinPerfil(rol) {
    const input = document.getElementById(`puesto-pin-${rol}`);
    const pin = input?.value?.trim();

    if (!pin || pin.length < 4) {
        mostrarNotificacionExito('El PIN debe tener al menos 4 dígitos', '⚠️ Error');
        return;
    }
    if (!/^\d+$/.test(pin)) {
        mostrarNotificacionExito('El PIN solo puede contener números', '⚠️ Error');
        return;
    }

    let permisos = { cajero: { ...PERMISOS_DEFAULT.cajero }, encargado: { ...PERMISOS_DEFAULT.encargado } };
    try {
        const ajustes = await window.api.obtenerAjustes();
        const guardados = JSON.parse(ajustes.permisos_roles || '{}');
        if (guardados.cajero)    permisos.cajero    = { ...permisos.cajero,    ...guardados.cajero };
        if (guardados.encargado) permisos.encargado = { ...permisos.encargado, ...guardados.encargado };
    } catch(e) {}

    permisos[rol].pin     = await hashPin(pin);
    permisos[rol].pin_set = true;

    try {
        await window.api.guardarAjuste('permisos_roles', JSON.stringify(permisos));
        mostrarNotificacionExito(`PIN de ${rol} configurado`, '¡Listo!');
        cargarPermisosAjustes(); // re-renderizar para mostrar estado actualizado
    } catch(e) {
        mostrarNotificacionExito('Error guardando PIN', '⚠️ Error');
    }
}

async function quitarPinPerfil(rol) {
    let permisos = { cajero: { ...PERMISOS_DEFAULT.cajero }, encargado: { ...PERMISOS_DEFAULT.encargado } };
    try {
        const ajustes = await window.api.obtenerAjustes();
        const guardados = JSON.parse(ajustes.permisos_roles || '{}');
        if (guardados.cajero)    permisos.cajero    = { ...permisos.cajero,    ...guardados.cajero };
        if (guardados.encargado) permisos.encargado = { ...permisos.encargado, ...guardados.encargado };
    } catch(e) {}

    delete permisos[rol].pin;
    permisos[rol].pin_set = false;

    try {
        await window.api.guardarAjuste('permisos_roles', JSON.stringify(permisos));
        mostrarNotificacionExito(`PIN de ${rol} eliminado`, '¡Listo!');
        cargarPermisosAjustes();
    } catch(e) {
        mostrarNotificacionExito('Error guardando cambios', '⚠️ Error');
    }
}

// ============================================
// MODAL TURNO DESDE NUEVA VENTA
// ============================================

function cerrarModalTurnoVenta() {
    document.getElementById('modal-turno-venta').classList.add('hidden');
    // Si no hay turno abierto, redirigir a la pantalla de Turno en lugar de dejar al usuario en Nueva Venta sin turno
    if (!turnoActivo) {
        cambiarVista('turno');
    }
}

async function abrirTurnoDesdeVenta() {
    const nombre = document.getElementById('tv-nombre')?.value?.trim();
    const fondo  = parseFloat(document.getElementById('tv-fondo')?.value) || 0;

    if (!nombre) {
        mostrarNotificacionExito('Ingresa tu nombre para abrir el turno', '⚠️ Error');
        return;
    }

    try {
        nombreActivo = nombre;
        await window.api.abrirTurno(nombre, rolActivo || 'cajero', fondo);
        turnoActivo = await window.api.obtenerTurnoActivo();
        actualizarIndicadorTurnoSidebar();
        document.getElementById('modal-turno-venta').classList.add('hidden');
        mostrarNotificacionExito(`Turno abierto — ${nombre}`, '¡Turno Abierto!');
    } catch(e) {
        mostrarNotificacionExito('Error al abrir turno', '⚠️ Error');
        console.error(e);
    }
}