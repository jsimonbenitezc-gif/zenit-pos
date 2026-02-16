// ============================================
// RENDER.JS - VERSIÓN INTEGRAL (VENTA DESAGRUPADA)
// ============================================
let clasificaciones = [];
let productosGlobales = []; 
let carrito = [];
let itemNotaEditandoIndex = null; 

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

document.addEventListener('DOMContentLoaded', () => {

    const logo = document.getElementById('brand-logo');
    if (logo && window.api?.obtenerRutaLogo) {
        logo.src = window.api.obtenerRutaLogo();
    }

    configurarMenu();
    configurarBotones();
    configurarModales();
    cambiarVista('dashboard'); 
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
    } else if (vista === 'clientes') {
        cargarClientes();
    } else if (vista === 'ajustes') {
        cargarAjustesInstalados();
    }

    
    // Actualizar el título de la cabecera
    const titulos = {
    dashboard: 'Dashboard',
    pedidos: 'Pedidos',
    productos: 'Productos',
    'nueva-venta': 'Nueva Venta',
    clientes: 'Clientes',
    ajustes: 'Configuración ⚙️'
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
        clasificaciones = await window.api.obtenerProductosAgrupados();
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
        const clientes = await window.api.obtenerClientesConCompras();
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
    grid.innerHTML = listaProductos.map(p => `
        <div class="product-card" onclick="agregarAlCarrito(${p.id})">
            <div class="product-visual">${p.imagen ? `<img src="file://${p.imagen}" class="product-img-display">` : `<span class="product-emoji">${p.emoji || '📦'}</span>`}</div>
            <h4>${p.nombre}</h4>
            <p class="precio">$${p.precio.toFixed(2)}</p>
        </div>`).join('');
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
                <button class="btn-ticket-action" onclick="abrirModalNotas(${index})">✏️</button>
                <button class="btn-ticket-action" onclick="eliminarDelCarrito(${index})" style="color:#ef4444">✖</button>
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
            info_cliente_temp: infoClienteTemp
        };
        
        const itemsParaDB = carrito.map(i => ({
            id: i.id,
            cantidad: 1,
            precio: i.precio,
            subtotal: i.precio,
            nota: i.nota || ''
        }));
        
        await window.api.crearPedidoDirecto(datosPedido, itemsParaDB);
        
        cerrarModalPago();
        
        mostrarNotificacionExito(`Venta registrada - Total: $${total.toFixed(2)}`, '¡Venta Exitosa!');
        
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
    }
}
        

// --- CERRAR MODAL DE PAGO ---
function cerrarModalPago() {
    document.getElementById('modalPago').classList.add('hidden');
    metodoSeleccionado = null;
}

// --- APLICAR DESCUENTO ---
function abrirModalDescuento() {
    const desc = prompt("Introduce el monto del descuento ($):", "0");
    if (desc !== null) {
        descuentoActual = parseFloat(desc) || 0;
        if (descuentoActual < 0) descuentoActual = 0;
        renderizarCarrito();
    }
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

/* ============================================
   ADMINISTRACIÓN (PRODUCTOS Y DASHBOARD)
   ============================================ */

async function cargarDashboard() {
    try {
        const stats = await window.api.obtenerEstadisticas();
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
        clasificaciones = await window.api.obtenerProductosAgrupados();
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
                                    ? `<img src="file://${p.imagen}" class="product-img-display" onerror="this.style.display='none'">` 
                                    : `<span class="product-emoji">${p.emoji || '📦'}</span>`
                                }
                            </div>
                            <h4>${p.nombre}</h4>
                            <p class="precio">$${p.precio.toFixed(2)}</p>
                            <p style="font-size: 0.8em; color: #6b7280;">Stock: ${p.stock}</p>
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
            await window.api.actualizarProducto(productoEditandoId, p);
        } else {
            await window.api.agregarProducto(p);
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

    contenedor.innerHTML = '<tr><td colspan="6" style="text-align:center;">Cargando pedidos...</td></tr>';

    try {
        const pedidos = await window.api.obtenerPedidos();
        
        if (pedidos.length === 0) {
            contenedor.innerHTML = '<tr><td colspan="6" style="text-align:center; padding: 20px;">No hay ventas registradas todavía.</td></tr>';
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
        <td>${p.telefono || 'General'}</td>
        <td>${fechaTxt}</td> 
        <td style="text-transform: capitalize;">${p.metodo_pago}</td>
        <td><strong>$${parseFloat(p.total).toFixed(2)}</strong></td>
        <td>${renderizarEstadoPedido(p.id, p.estado)}</td>
        <td><span class="status-badge">Completado</span></td>
        <td>
            <button class="btn-secondary small" onclick="verDetallePedido(${p.id}, '${p.telefono || 'General'}', ${p.total}, '${p.metodo_pago}')">
                👁️ Ver
            </button>
        </td>
    `;
    contenedor.appendChild(fila);
});

    } catch (error) {
        console.error("Error al cargar pedidos:", error);
        contenedor.innerHTML = '<tr><td colspan="6" style="text-align:center; color:red;">Error al cargar los datos.</td></tr>';
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
        const productos = await window.api.obtenerDetallePedido(id);
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
                <label>Nombre (Obligatorio)</label>
                <input type="text" id="dom-nombre" placeholder="Nombre completo" value="${nombrePrellenado}">
            </div>
            <div class="campo-grupo">
                <label>Dirección (Obligatorio)</label>
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
        const clientes = await window.api.obtenerClientesConCompras();
        
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

    try {
        await window.api.crearCliente({
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
    window.api.obtenerClientesConCompras().then(clientes => {
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

async function cargarAjustesInstalados() {
    try {
        console.log("Sincronizando ajustes...");
        const ajustes = await window.api.obtenerAjustes();
        
        if(ajustes.nombre_negocio && document.getElementById('adj-nombre')) 
            document.getElementById('adj-nombre').value = ajustes.nombre_negocio;
        if(ajustes.direccion_negocio && document.getElementById('adj-direccion')) 
            document.getElementById('adj-direccion').value = ajustes.direccion_negocio;
        if(ajustes.telefono_negocio && document.getElementById('adj-telefono')) 
            document.getElementById('adj-telefono').value = ajustes.telefono_negocio;
        if(ajustes.footer_ticket && document.getElementById('adj-footer')) 
            document.getElementById('adj-footer').value = ajustes.footer_ticket;
        if(ajustes.moneda && document.getElementById('adj-moneda')) 
            document.getElementById('adj-moneda').value = ajustes.moneda;
        
        if(ajustes.dark_mode === 'true') {
            const checkDark = document.getElementById('adj-darkmode');
            if(checkDark) checkDark.checked = true;
            document.body.classList.add('dark-mode');
        }

        const selectImp = document.getElementById('adj-impresora');
        if (selectImp) {
            const impresoras = await window.api.obtenerImpresoras().catch(() => []);
            impresoras.forEach(imp => {
                const opt = document.createElement('option');
                opt.value = imp.name;
                opt.innerText = imp.name;
                if(ajustes.impresora === imp.name) opt.selected = true;
                selectImp.appendChild(opt);
            });
        }
        console.log("Ajustes cargados con éxito.");
    } catch (error) {
        console.error("Error cargando ajustes:", error);
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
