// ============================================
// MÓDULO: Nueva Venta, Carrito, Pago
// ============================================

// Variables de Pago y Descuento
let metodoSeleccionado = null;
// Descuento de empleado/promoción. El backend exige autorización para este monto
// (un Discount configurado vía descuentoIdActual, o PIN), así que va SEPARADO del
// canje de puntos: los puntos son del cliente y no requieren autorización.
let descuentoActual = 0;
let descuentoIdActual = null;   // id del Discount del backend que respalda el descuento
let descuentoPuntosVenta = 0;   // pesos descontados por canje de puntos de fidelidad

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
            contenedor.innerHTML += `<button class="filter-btn" onclick="filtrarCategoria(${c.id}, this)">${esc(c.emoji)} ${esc(c.nombre)}</button>`;
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
        // Usar SQLite local siempre: tiene en_fidelidad y puntos (locales) + está sincronizado con backend al inicio
        const clientes = await window.api.obtenerClientesConCompras();
        let resultados;

        if (tipo === 'nombre') {
            resultados = clientes.filter(c =>
                c.nombre && c.nombre.toLowerCase().includes(busqueda)
            ).slice(0, 5);
        } else {
            resultados = clientes.filter(c =>
                c.telefono && c.telefono.includes(busqueda)
            ).slice(0, 5);
        }

        if (resultados.length === 0) {
            dropdown.classList.add('hidden');
            return;
        }

        dropdown.innerHTML = resultados.map(c => `
            <div class="sugerencia-item"
                data-id="${esc(c.id)}"
                data-nombre="${esc(c.nombre)}"
                data-telefono="${esc(c.telefono)}"
                data-direccion="${esc(c.direccion || '')}"
                data-puntos="${c.puntos || 0}"
                data-fidelidad="${c.en_fidelidad || 0}">
                <div class="sugerencia-nombre">${esc(c.nombre)}${c.en_fidelidad ? ' ' + svgIconHTML('star', 14, '#7c3aed') : ''}</div>
                <div class="sugerencia-tel" style="display:flex;align-items:center;gap:4px;">${svgIconHTML('smartphone', 13, '#6b7280')} ${esc(c.telefono)}</div>
                ${c.direccion ? `<div class="sugerencia-direccion" style="display:flex;align-items:center;gap:4px;">${svgIconHTML('map-pin', 13, '#6b7280')} ${esc(c.direccion)}</div>` : ''}
            </div>
        `).join('');
        // Registrar click usando data attributes (evita inyección en onclick)
        dropdown.querySelectorAll('.sugerencia-item').forEach(el => {
            el.onclick = () => seleccionarClienteVenta(
                parseInt(el.dataset.id),
                el.dataset.nombre,
                el.dataset.telefono,
                el.dataset.direccion,
                parseInt(el.dataset.puntos || '0'),
                parseInt(el.dataset.fidelidad || '0')
            );
        });

        dropdown.classList.remove('hidden');

    } catch (error) {
        console.error("Error al buscar clientes:", error);
    }
}

function seleccionarClienteVenta(id, nombre, telefono, direccion, puntos, enFidelidad) {
    clienteSeleccionadoVenta = { id, nombre, telefono, direccion, puntos: puntos || 0, enFidelidad: enFidelidad || 0 };

    // Autocompletar ambos campos
    document.getElementById('nombre-cliente').value = nombre;
    document.getElementById('telefono-cliente').value = telefono;

    // Cerrar sugerencias
    document.getElementById('sugerencias-nombre').classList.add('hidden');
    document.getElementById('sugerencias-telefono').classList.add('hidden');

    // Mostrar panel de puntos si el cliente está en el programa de fidelidad
    actualizarPanelPuntosVenta();
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

// Refresca los badges de stock en Nueva Venta y Mesas sin re-renderizar todo el grid
function _refrescarStockBadges() {
    const mostrarStock = document.getElementById('adj-mostrar-stock')?.checked;
    if (!mostrarStock) return;

    // Nueva Venta: actualizar badges stock-badge-{id}
    if (!document.getElementById('view-nueva-venta')?.classList.contains('hidden')) {
        document.querySelectorAll('[id^="stock-badge-"]').forEach(el => {
            const pid = parseInt(el.id.replace('stock-badge-', ''));
            if (!pid) return;
            window.api.calcularStockProducto(pid).then(stock => {
                if (stock === null) { el.innerHTML = ''; return; }
                const card = document.getElementById(`pcard-${pid}`);
                if (stock === 0) {
                    el.innerHTML = '<span style="color:#ef4444; font-weight:600;">Sin stock</span>';
                    card?.style.setProperty('opacity', '0.5');
                } else if (stock <= 3) {
                    el.innerHTML = `<span style="color:#f59e0b; font-weight:600;">${svgIconHTML('triangle-alert', 14, '#f59e0b')} ${stock} disponibles</span>`;
                    card?.style.removeProperty('opacity');
                } else {
                    el.innerHTML = `<span style="color:#10b981;">${stock} disponibles</span>`;
                    card?.style.removeProperty('opacity');
                }
            }).catch(() => {});
        });
    }

    // Mesas: actualizar badges mesa-stock-{id}
    document.querySelectorAll('[id^="mesa-stock-"]').forEach(el => {
        const pid = parseInt(el.id.replace('mesa-stock-', ''));
        if (!pid) return;
        window.api.calcularStockProducto(pid).then(stock => {
            if (stock === null) { el.innerHTML = ''; return; }
            const card = document.getElementById(`mesa-pcard-${pid}`);
            if (stock === 0) {
                el.innerHTML = '<span style="color:#ef4444;font-weight:600;">Sin stock</span>';
                card?.style.setProperty('opacity', '0.5');
            } else if (stock <= 3) {
                el.innerHTML = `<span style="color:#f59e0b;font-weight:600;">${svgIconHTML('triangle-alert', 14, '#f59e0b')} ${stock} disponibles</span>`;
                card?.style.removeProperty('opacity');
            } else {
                el.innerHTML = `<span style="color:#10b981;">${stock} disponibles</span>`;
                card?.style.removeProperty('opacity');
            }
        }).catch(() => {});
    });
}

function renderizarGridVenta(listaProductos) {
    const grid = document.getElementById('grid-venta');
    if (listaProductos.length === 0) {
        grid.innerHTML = '<p style="color:#9ca3af; text-align:center; width:100%;">No hay productos</p>';
        return;
    }
    const mostrarStock = document.getElementById('adj-mostrar-stock')?.checked;

    grid.innerHTML = listaProductos.map(p => {
        const imgUrl = urlImagenSegura(p.imagen);
        const visual = imgUrl
            ? `<img src="${imgUrl}" class="product-img-display" onerror="this.style.display='none';this.nextElementSibling.style.display=''"><span class="product-emoji" style="display:none">${renderIcono(p.emoji || 'svg:package', 35)}</span>`
            : `<span class="product-emoji">${renderIcono(p.emoji || 'svg:package', 35)}</span>`;
        return `
        <div class="product-card" onclick="agregarAlCarrito(${p.id})" id="pcard-${p.id}">
            <div class="product-visual">${visual}</div>
            <h4>${esc(p.nombre)}</h4>
            <p class="precio">$${p.precio.toFixed(2)}</p>
            ${mostrarStock ? `<div id="stock-badge-${p.id}" style="font-size:0.75em; color:#9ca3af; margin-top:3px;">...</div>` : ''}
        </div>`;
    }).join('');

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
                    el.innerHTML = `<span style="color:#f59e0b; font-weight:600;">${svgIconHTML('triangle-alert', 14, '#f59e0b')} ${stock} disponibles</span>`;
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

// Base gravable de la venta en curso: lo que suman los productos menos los
// descuentos (promoción + canje de puntos). El impuesto se calcula SOBRE ella,
// nunca sobre el precio de lista. Ver BLOQUE 8 / modulo-impuestos.js.
function _baseGravableCarrito() {
    const suma = carrito.reduce((sum, i) => sum + i.precio, 0);
    return suma - descuentoActual - descuentoPuntosVenta;
}

/** Total a cobrar de la venta en curso (ya con impuesto, si el negocio lo cobra). */
function _totalACobrar() {
    return desglosarImpuesto(_baseGravableCarrito()).total;
}

function renderizarCarrito() {
    const contenedor = document.getElementById('carrito-items');
    const subtotalEl = document.getElementById('subtotal-venta');
    const descuentoEl = document.getElementById('descuento-aplicado');
    const totalEl = document.getElementById('total-venta');
    const filaImpuestoEl = document.getElementById('fila-impuesto-venta');
    const impuestoEl = document.getElementById('impuesto-venta');
    const etiquetaImpuestoEl = document.getElementById('etiqueta-impuesto-venta');

    if (carrito.length === 0) {
        contenedor.innerHTML = '<div class="empty-cart-msg">El carrito está vacío</div>';
        if (subtotalEl) subtotalEl.innerText = '$0.00';
        if (descuentoEl) descuentoEl.innerText = '-$0.00';
        if (filaImpuestoEl) filaImpuestoEl.classList.add('hidden');
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
                <h5>${esc(item.nombre)}</h5>
                <div class="cart-price">$${item.precio.toFixed(2)}</div>
                ${item.nota ? `<span class="cart-note">📝 ${esc(item.nota)}</span>` : ''}
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

    // Actualizar subtotal, descuento y total. El renglón "descuento" muestra la suma
    // (promoción + puntos), que es lo que el cliente percibe; internamente van separados.
    const descuentoVisible = descuentoActual + descuentoPuntosVenta;
    const desglose = desglosarImpuesto(subtotal - descuentoVisible);
    const totalFinal = desglose.total;
    if (subtotalEl) subtotalEl.innerText = `$${subtotal.toFixed(2)}`;
    if (descuentoEl) descuentoEl.innerText = `-$${descuentoVisible.toFixed(2)}`;
    if (filaImpuestoEl && impuestoEl) {
        if (hayImpuesto()) {
            filaImpuestoEl.classList.remove('hidden');
            if (etiquetaImpuestoEl) etiquetaImpuestoEl.innerText = `${etiquetaImpuesto()}:`;
            impuestoEl.innerText = `$${desglose.impuesto.toFixed(2)}`;
        } else {
            filaImpuestoEl.classList.add('hidden');
        }
    }
    totalEl.innerText = `$${totalFinal.toFixed(2)}`;

    // Actualizar panel de puntos si hay cliente inscrito
    if (clienteSeleccionadoVenta?.enFidelidad) actualizarPanelPuntosVenta();
}

function eliminarDelCarrito(index) {
    carrito.splice(index, 1);
    renderizarCarrito();
}

async function limpiarCarrito() {
    if (carrito.length === 0) return;

    if (await confirmarZenit('Se quitarán todos los productos del carrito.', '¿Vaciar el carrito?', { textoOk: 'Vaciar', peligro: true })) {
        carrito = [];
        descuentoActual = 0;
        descuentoIdActual = null;
        descuentoPuntosVenta = 0;
        clienteSeleccionadoVenta = null;

        // Limpiar campos de cliente
        document.getElementById('nombre-cliente').value = '';
        document.getElementById('telefono-cliente').value = '';

        // Cerrar sugerencias si están abiertas
        document.getElementById('sugerencias-nombre')?.classList.add('hidden');
        document.getElementById('sugerencias-telefono')?.classList.add('hidden');

        // Ocultar panel de puntos y resetear canje
        const elPts = document.getElementById('panel-puntos-venta');
        if (elPts) elPts.style.display = 'none';
        puntosUsadosVenta = 0;

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
async function procesarVenta() {
    if (carrito.length === 0) {
        alertaZenit('El carrito está vacío');
        return;
    }

    // Sin sucursal la venta quedaría huérfana (y el backend la rechazaría al subirla,
    // incluso si se registró offline). Se avisa ANTES de cobrar. Ver CLAUDE.md §24.
    if (!(await verificarSucursalParaRegistrar())) return;

    const total = _totalACobrar();
    document.getElementById('pago-total-display').innerText = `$${total.toFixed(2)}`;

    // Mostrar información del cliente en el modal
    actualizarInfoClientePago();
    actualizarPanelPuntosVenta(); // Refrescar panel de puntos en caso de que el cliente esté en fidelidad

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
    // El cambio se calcula sobre lo que el cliente PAGA, impuesto incluido.
    const total = _totalACobrar();
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
        alertaZenit('Selecciona un método de pago');
        return;
    }

    if (tipoPedidoActual === 'domicilio') {
        const direccion = document.getElementById('dom-direccion')?.value?.trim() || '';
        if (!direccion) {
            const continuar = await confirmarZenit('No se registró una dirección para este pedido.', '¿Continuar sin dirección?', { textoOk: 'Continuar' });
            if (!continuar) return;
        }
    }

    const btnFinal = document.getElementById('btn-confirmar-final');
    if (btnFinal) btnFinal.disabled = true;

    const desgloseVenta = desglosarImpuesto(_baseGravableCarrito());
    const total = desgloseVenta.total;

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
            // El descuento de promoción viaja con su descuento_id (autorización que
            // exige el backend) y SEPARADO del canje de puntos, que no requiere PIN.
            descuento_monto: descuentoActual || 0,
            descuento_id: descuentoIdActual || null,
            descuento_puntos_monto: descuentoPuntosVenta || 0,
            puntos_usados: descuentoPuntosVenta > 0 ? (puntosUsadosVenta || 0) : 0,
            // Desglose del impuesto (BLOQUE 8). La tasa viaja CONGELADA con la venta:
            // si sube tarde y el dueño ya cambió el impuesto, el backend respeta la
            // que se cobró en el ticket que el cliente ya se llevó.
            subtotal: desgloseVenta.subtotal,
            impuesto: desgloseVenta.impuesto,
            tasa_impuesto: configImpuesto.tasa || 0,
            impuesto_incluido: configImpuesto.incluido ? 1 : 0,
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

        const pedidoResultado = await crearPedidoWrapper(datosPedido, itemsParaDB);
        // crearPedidoWrapper ahora guarda LOCAL de inmediato y sincroniza con el
        // backend en segundo plano (venta instantánea): retorna el ID local.
        const pedidoId = pedidoResultado?.id ?? pedidoResultado;

        // Marcar en el tracker del KDS ANTES de enviar, para que el polling no lo reenvíe
        if (pedidoResultado?.id && pedidoResultado?.items) {
            _kdsMarcarEnviado(pedidoResultado.id, pedidoResultado.updatedAt, pedidoResultado.items);
        }

        // Enviar comanda al KDS
        window.api.kdsNuevoPedido({
            pedidoId: pedidoId || null,
            tipo: datosPedido.tipo_pedido === 'domicilio' ? 'delivery' : 'mostrador',
            mesa: null,
            notas: datosPedido.notas_generales || null,
            items: carrito.map(i => ({ nombre: i.nombre, cantidad: 1, notas: i.nota || '' }))
        }).catch(() => {});

        // Guardar ID del pedido para impresión
        window.ultimoPedidoId = pedidoId;

        // Puntos: solo aplica a clientes inscritos en programa de fidelidad
        if (clienteSeleccionadoVenta?.id && clienteSeleccionadoVenta.enFidelidad === 1) {
            if (puntosUsadosVenta > 0) {
                // Canjear puntos: descontar del balance LOCAL. El descuento en el
                // backend NO se manda aquí: el pedido ya lleva `puntos_usados` y el
                // backend los resta dentro de la misma transacción de la venta
                // (mandarlo también por /loyalty los restaría dos veces).
                await window.api.actualizarPuntosCliente(clienteSeleccionadoVenta.id, -puntosUsadosVenta).catch(() => {});
            } else {
                // Ganar puntos normalmente
                const puntosGanados = await calcularPuntosGanados(total);
                if (puntosGanados > 0) {
                    await window.api.actualizarPuntosCliente(clienteSeleccionadoVenta.id, puntosGanados).catch(() => {});
                    syncLoyaltyBackend(clienteSeleccionadoVenta.id, { points_delta: puntosGanados });
                    mostrarNotificacionExito(`+${puntosGanados} puntos acumulados`, 'Puntos');
                }
            }
        }
        puntosUsadosVenta = 0;

        cerrarModalPago();

        mostrarNotificacionExito(`Venta registrada - Total: $${total.toFixed(2)}`, '¡Venta Exitosa!');

        // Preguntar si quiere imprimir el ticket
        mostrarModalImpresion(pedidoId);

        // Limpiar todo
        carrito = [];
        metodoSeleccionado = null;
        descuentoActual = 0;
        descuentoIdActual = null;
        descuentoPuntosVenta = 0;
        clienteSeleccionadoVenta = null;
        document.getElementById('telefono-cliente').value = '';
        document.getElementById('nombre-cliente').value = '';
        const elPanelPuntos = document.getElementById('panel-puntos-venta');
        if (elPanelPuntos) elPanelPuntos.style.display = 'none';
        renderizarCarrito();
        // Refrescar badges de stock inmediatamente (sin esperar SSE)
        _refrescarStockBadges();

    } catch (e) {
        console.error(e);
        alertaZenit("Error al guardar: " + e);
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
let _pendienteDescuento = null; // guarda descuento esperando PIN

async function abrirModalDescuento() {
    // Cargar descuentos predefinidos (solo pre-creados en Ofertas)
    const contenedor = document.getElementById('descuentos-rapidos');
    try {
        const descuentos = await window.api.obtenerDescuentos();
        if (!descuentos || !descuentos.length) {
            contenedor.innerHTML = `<div style="color:#9ca3af;font-size:0.85em;padding:8px;">
                No tienes descuentos creados. Ve a <strong>Ofertas → Descuentos</strong> para crearlos.
            </div>`;
        } else {
            const subtotal = carrito.reduce((sum, i) => sum + i.precio, 0);
            contenedor.innerHTML = descuentos.map(d => {
                const montoCalc = d.tipo === 'porcentaje'
                    ? (subtotal * d.valor / 100).toFixed(2)
                    : parseFloat(d.valor).toFixed(2);
                const pct = d.tipo === 'porcentaje' ? d.valor : 0;
                const mnto = d.tipo === 'monto_fijo' ? d.valor : 0;
                const needsPin = d.requires_pin ? 'true' : 'false';
                return `<button onclick="aplicarDescuentoRapido(${pct}, ${mnto}, '${esc(d.nombre)}', ${needsPin}, ${d.id})"
                    style="background:#eff6ff; border:1px solid #bfdbfe; color:#1d4ed8; padding:8px 14px; border-radius:8px; cursor:pointer; font-size:0.85em; font-weight:600; transition:0.2s;"
                    onmouseover="this.style.background='#dbeafe'" onmouseout="this.style.background='#eff6ff'">
                    ${esc(d.nombre)}${d.requires_pin ? ' 🔒' : ''}<br><span style="font-weight:400; color:#6b7280;">-$${montoCalc}</span>
                </button>`;
            }).join('');
        }
    } catch(e) {
        contenedor.innerHTML = '<span style="color:#9ca3af; font-size:0.85em;">No se pudieron cargar.</span>';
    }

    document.getElementById('modal-descuento').classList.remove('hidden');
}

async function aplicarDescuentoRapido(pct, monto, nombre, requiresPin, descuentoId) {
    const aj = await window.api.obtenerAjustes().catch(() => ({}));
    // Per-descuento: requires_pin → usar modal de PIN de empleado (mismo sistema que cancel_order)
    if (requiresPin) {
        cerrarModalDescuento();
        pedirPinEmpleado(
            `Aplicar descuento "${nombre}" requiere autorización. Ingresa tu PIN.`,
            async (employeeId) => {
                await _aplicarDescuentoFinal(pct, monto, nombre, { empleadoId: employeeId, empleadoNombre: nombreActivo || 'empleado' }, descuentoId);
            }
        );
        return;
    }
    // Setting global: requiere_pin_descuentos → PIN local simple
    if (aj.requiere_pin_descuentos === 'true') {
        _pendienteDescuento = { pct, monto, nombre, descuentoId };
        document.getElementById('input-pin-descuento').value = '';
        document.getElementById('modal-pin-descuento').classList.remove('hidden');
        cerrarModalDescuento();
        return;
    }
    _aplicarDescuentoFinal(pct, monto, nombre, null, descuentoId);
}

async function _aplicarDescuentoFinal(pct, monto, nombre, autorizado, descuentoId = null) {
    const subtotal = carrito.reduce((sum, i) => sum + i.precio, 0);
    descuentoActual = pct > 0 ? (subtotal * pct / 100) : monto;
    // Guardar el id del descuento: es la autorización que el backend exige para
    // aceptar el monto (evita tener que guardar el PIN en la cola offline).
    descuentoIdActual = descuentoId || null;
    cerrarModalDescuento();
    renderizarCarrito();
    // Registrar en log local
    await window.api.registrarLogDescuento({
        cajero: nombreActivo || 'cajero',
        descuento_nombre: nombre,
        monto_descuento: descuentoActual,
        total_antes: subtotal
    }).catch(() => {});
    // Si fue autorizado con PIN de empleado: registrar en backend (PrivilegedActionLog)
    if (autorizado && modoConectado && apiClient && tokenActual) {
        apiClient.request('/audit', {
            method: 'POST',
            body: {
                employee_id: autorizado.empleadoId || null,
                employee_name: autorizado.empleadoNombre || nombreActivo || 'empleado',
                action_type: 'apply_discount',
                target_description: `Descuento: "${nombre}"`,
                before_data: { total: subtotal },
                after_data: { total: parseFloat((subtotal - descuentoActual).toFixed(2)), descuento_aplicado: nombre, monto_descuento: parseFloat(descuentoActual.toFixed(2)) },
                branch_id: sucursalIdActual || null
            }
        }).catch(e => console.warn('No se pudo registrar descuento en auditoría:', e.message));
    }
    // Refrescar alertas del dashboard si está activo
    if (document.getElementById('view-dashboard')?.classList.contains('active')) {
        calcularAlertasWrapper();
    }
}

async function confirmarPinDescuento() {
    if (!_pendienteDescuento) return;
    const pinIngresado = document.getElementById('input-pin-descuento').value;
    const aj = await window.api.obtenerAjustes().catch(() => ({}));
    if (pinIngresado !== (aj.pin_descuentos || '')) {
        document.getElementById('input-pin-descuento').style.borderColor = '#ef4444';
        setTimeout(() => { document.getElementById('input-pin-descuento').style.borderColor = ''; }, 1500);
        return;
    }
    document.getElementById('modal-pin-descuento').classList.add('hidden');
    const { pct, monto, nombre, descuentoId } = _pendienteDescuento;
    _pendienteDescuento = null;
    _aplicarDescuentoFinal(pct, monto, nombre, null, descuentoId);
}

function cancelarPinDescuento() {
    _pendienteDescuento = null;
    document.getElementById('input-pin-descuento').value = '';
    document.getElementById('modal-pin-descuento').classList.add('hidden');
}

function cerrarModalDescuento() {
    document.getElementById('modal-descuento').classList.add('hidden');
}

function quitarDescuento() {
    descuentoActual = 0;
    descuentoIdActual = null;
    cerrarModalDescuento();
    renderizarCarrito();
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
