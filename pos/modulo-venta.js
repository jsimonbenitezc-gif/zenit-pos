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
    const pintar = (cats) => {
        clasificaciones = cats || [];
        productosGlobales = [];
        clasificaciones.forEach(c => {
            (c.productos || []).forEach(p => productosGlobales.push({...p, categoria: c.nombre}));
        });
        renderizarFiltrosCategorias();
        renderizarGridVenta(productosGlobales);
        renderizarCarrito();
    };

    // ⚠️ LA PANTALLA DE VENTA SE PINTA CON LO LOCAL Y NO ESPERA AL SERVIDOR.
    //
    // Antes se hacía al revés —la nube primero, lo local solo si fallaba— y con un
    // servidor DORMIDO (el plan gratuito de Render tarda cerca de un minuto en
    // despertar, más que los 30 s de timeout) la caja se quedaba medio minuto sin
    // catálogo: un punto de venta que no puede cobrar. Es el peor caso posible de
    // toda la app, y lo encontró el recorrido `dormido` de pruebas-ui (§46).
    //
    // El catálogo local es un espejo del de la nube (`syncProductos`), así que se
    // pinta al instante y se corrige solo cuando el servidor conteste.
    try {
        pintar(await window.api.obtenerProductosAgrupados());
    } catch (e) { console.error(e); }

    if (modoConectado && apiClient && tokenActual) {
        obtenerProductosAgrupadosWrapper()
            .then(pintar)
            .catch(e => console.warn('Catálogo de venta desde la nube:', e && e.message));
    }
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

    // MODIFICADORES (BLOQUE 11). Si el producto ofrece extras se pregunta antes
    // de meterlo al carrito; si no, `abrirModalModificadores` llama al callback
    // de inmediato y el flujo queda EXACTAMENTE como antes del bloque — un
    // negocio sin extras no ve un paso de más.
    abrirModalModificadores(producto, (modificadores) => {
        // Se agrega como item único (desagrupado)
        carrito.push({
            id: producto.id,
            nombre: producto.nombre,
            // `precio` es lo que se cobra por este renglón (base + extras): todo
            // lo que ya leía este campo —impuesto, descuentos, pagos, total—
            // sigue funcionando sin enterarse de que hay modificadores.
            precio: precioConModificadores(producto.precio, modificadores),
            precio_base: producto.precio,
            modificadores,
            cantidad: 1,
            nota: ''
        });
        renderizarCarrito();
    });
}

/** Reabre el selector para cambiar los extras de un renglón ya en el carrito. */
function editarModificadoresCarrito(index) {
    const item = carrito[index];
    if (!item) return;
    const producto = productosGlobales.find(p => p.id === item.id);
    if (!producto) return;

    abrirModalModificadores(producto, (modificadores) => {
        item.modificadores = modificadores;
        item.precio_base = producto.precio;
        item.precio = precioConModificadores(producto.precio, modificadores);
        renderizarCarrito();
    }, item.modificadores || []);
}

// Base gravable de la venta en curso: lo que suman los productos menos los
// descuentos (promoción + canje de puntos). El impuesto se calcula SOBRE ella,
// nunca sobre el precio de lista. Ver BLOQUE 8 / modulo-impuestos.js.
function _baseGravableCarrito() {
    return _descuentosDelCarrito().base;
}

/**
 * El descuento que de verdad se aplica, ACOTADO al ticket.
 *
 * ⚠️ Sin este tope, un descuento fijo mayor que el ticket produce una venta con
 * TOTAL NEGATIVO: "Cortesía $50" —que Zenit siembra en toda instalación nueva—
 * sobre un taco de $24.50 registraba una venta de **−$25.50**, el turno la
 * sumaba como venta negativa y el efectivo esperado del cierre bajaba $25.50,
 * dejando un SOBRANTE FANTASMA de ese importe en el cajón. Es la misma familia
 * de descuadre que cerraron el §28 (gastos), el §30 (propinas) y el §31 (pagos
 * divididos). Encontrado explorando (BLOQUE 17, hallazgo E-1).
 *
 * El backend lo acota desde siempre (`routes/orders.js`:
 * `Math.min(Math.max(discount_amount, 0), calculatedTotal)`), así que sin esto
 * el cajero veía −$25.50 en pantalla y el servidor registraba $0.00: dos
 * números distintos para la misma venta.
 *
 * Los PUNTOS se aplican primero y la PROMOCIÓN absorbe el recorte: los puntos
 * son dinero del cliente que ya se comprometió (§19.14) y quemarlos para nada
 * sería peor que recortar un cupón que de todas formas no cabía.
 */
function _descuentosDelCarrito() {
    const suma = carrito.reduce((sum, i) => sum + i.precio, 0);
    const puntos = Math.min(Math.max(descuentoPuntosVenta || 0, 0), suma);
    const promocion = Math.min(Math.max(descuentoActual || 0, 0), suma - puntos);
    return {
        suma,
        puntos,
        promocion,
        visible: promocion + puntos,
        base: suma - promocion - puntos,   // nunca negativa, por construcción
    };
}

/** Total a cobrar de la venta en curso (ya con impuesto, si el negocio lo cobra). */
function _totalACobrar() {
    return desglosarImpuesto(_baseGravableCarrito()).total;
}

// ── PROPINA (BLOQUE 9) ──────────────────────────────────────────────────────
// La propina de la venta en curso. ⚠️ NO entra en `_totalACobrar()` a propósito:
// ese es el total de la VENTA (lo que el negocio vendió) y es lo que se guarda
// en el pedido. Lo que el cliente ENTREGA es `_totalConPropina()`, y ese número
// solo se usa para pedir el dinero, calcular el cambio e imprimir el ticket.
let propinaActual = 0;
let propinaMetodoActual = null;

/** Lo que el cliente entrega: venta + propina. Nunca se guarda como venta. */
function _totalConPropina() {
    return totalConPropina(_totalACobrar(), propinaActual);
}

/** Deja la propina en cero. Se llama al abrir el modal y al terminar la venta. */
function _resetearPropinaVenta() {
    propinaActual = 0;
    propinaMetodoActual = null;
    const input = document.getElementById('propina-input');
    if (input) input.value = '';
}

/**
 * Dibuja la sección de propina del modal de cobro.
 * Con el interruptor apagado (el default) la sección queda oculta por completo:
 * un negocio que no recibe propinas no ve un solo renglón extra.
 */
function _renderizarSeccionPropina() {
    const seccion = document.getElementById('seccion-propina-venta');
    if (!seccion) return;

    if (!hayPropinas()) {
        seccion.classList.add('hidden');
        _resetearPropinaVenta();
        return;
    }
    seccion.classList.remove('hidden');

    // Botones de porcentaje sugerido + "Sin propina". Son solo una ayuda para
    // teclear rápido: el cajero siempre puede escribir el monto a mano.
    const contenedor = document.getElementById('propina-botones');
    if (contenedor) {
        const totalVenta = _totalACobrar();
        const botones = (configPropina.sugerencias || []).map(pct => {
            const monto = propinaPorPorcentaje(totalVenta, pct);
            const activo = propinaActual > 0 && Math.abs(propinaActual - monto) < 0.005;
            return `<button type="button" onclick="aplicarPropinaPorcentaje(${pct})"
                        style="flex:1;min-width:64px;padding:8px 6px;border-radius:8px;cursor:pointer;font-size:0.86em;font-weight:600;
                               border:2px solid ${activo ? '#16a34a' : '#d1d5db'};
                               background:${activo ? '#16a34a' : 'white'};color:${activo ? 'white' : '#374151'};">
                        ${pct}%<br><span style="font-size:0.85em;font-weight:500;opacity:0.85;">$${monto.toFixed(2)}</span>
                    </button>`;
        }).join('');
        const sinPropinaActivo = propinaActual <= 0;
        contenedor.innerHTML = botones + `
            <button type="button" onclick="quitarPropinaVenta()"
                    style="flex:1;min-width:64px;padding:8px 6px;border-radius:8px;cursor:pointer;font-size:0.86em;font-weight:600;
                           border:2px solid ${sinPropinaActivo ? '#6b7280' : '#d1d5db'};
                           background:${sinPropinaActivo ? '#6b7280' : 'white'};color:${sinPropinaActivo ? 'white' : '#374151'};">
                    Sin<br><span style="font-size:0.85em;font-weight:500;opacity:0.85;">propina</span>
            </button>`;
    }

    _actualizarDisplayPropina();
}

/** Refresca los montos de la sección de propina y el "el cliente entrega". */
function _actualizarDisplayPropina() {
    const display = document.getElementById('propina-monto-display');
    if (display) display.innerText = `$${propinaActual.toFixed(2)}`;

    // El selector de método solo tiene sentido cuando hay propina. Se preselecciona
    // con el método del pago, que es el caso normal.
    const selMetodo = document.getElementById('propina-metodo');
    if (selMetodo) {
        selMetodo.value = normalizarMetodoPropina(propinaMetodoActual, metodoSeleccionado);
        selMetodo.style.display = propinaActual > 0 ? '' : 'none';
    }

    const fila = document.getElementById('propina-total-entrega');
    const monto = document.getElementById('propina-total-entrega-monto');
    if (fila && monto) {
        if (propinaActual > 0) {
            fila.classList.remove('hidden');
            monto.innerText = `$${_totalConPropina().toFixed(2)}`;
        } else {
            fila.classList.add('hidden');
        }
    }

    // El cliente paga la venta MÁS la propina, así que el cambio y el número
    // grande del modal se calculan sobre ese total.
    //
    // ⚠️ Y EL RÓTULO CAMBIA CON ÉL. Decía siempre "Total a cobrar", así que el
    // mismo letrero nombraba dos cosas distintas —la venta, y la venta más la
    // propina— justo en el número que el cajero le canta al cliente. Ahora, en
    // cuanto hay propina, se llama TOTAL PAGADO y se desglosa debajo, igual que
    // en el ticket impreso del §30. Encontrado explorando (BLOQUE 17, roce F-5).
    const venta = _totalACobrar();
    const propina = propinaActual || 0;
    const totalDisplay = document.getElementById('pago-total-display');
    if (totalDisplay) totalDisplay.innerText = `$${_totalConPropina().toFixed(2)}`;

    const etiqueta = document.getElementById('pago-total-etiqueta');
    if (etiqueta) etiqueta.innerText = propina > 0 ? 'TOTAL PAGADO:' : 'Total a cobrar:';
    const desglose = document.getElementById('pago-total-desglose');
    if (desglose) {
        desglose.style.display = propina > 0 ? '' : 'none';
        if (propina > 0) desglose.innerText = `Venta $${venta.toFixed(2)}  ·  Propina $${propina.toFixed(2)}`;
    }
    if (metodoSeleccionado === 'efectivo') calcularCambio();
}

function aplicarPropinaPorcentaje(pct) {
    propinaActual = propinaPorPorcentaje(_totalACobrar(), pct);
    propinaMetodoActual = normalizarMetodoPropina(propinaMetodoActual, metodoSeleccionado);
    const input = document.getElementById('propina-input');
    if (input) input.value = propinaActual > 0 ? propinaActual.toFixed(2) : '';
    _renderizarSeccionPropina();
}

function quitarPropinaVenta() {
    _resetearPropinaVenta();
    _renderizarSeccionPropina();
}

function alCambiarPropinaManual() {
    const input = document.getElementById('propina-input');
    if (!input) return;
    // Mismo saneado que el efectivo recibido: solo números y punto.
    const limpio = input.value.replace(/[^\d.]/g, '');
    if (limpio !== input.value) input.value = limpio;
    propinaActual = normalizarPropina(limpio);
    if (propinaActual > 0) propinaMetodoActual = normalizarMetodoPropina(propinaMetodoActual, metodoSeleccionado);
    _renderizarSeccionPropina();
}

function alCambiarMetodoPropina() {
    const sel = document.getElementById('propina-metodo');
    if (sel) propinaMetodoActual = sel.value;
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
        // Los extras se listan bajo el nombre y el renglón es clicable para
        // cambiarlos: corregir un "extra queso" mal marcado no debería obligar a
        // borrar el producto y volver a agregarlo.
        const textoMods = resumenModificadores(item.modificadores);
        const lineaMods = textoMods
            ? `<span class="cart-mods" onclick="editarModificadoresCarrito(${index})" title="Cambiar los extras">${esc(textoMods)}</span>`
            : '';
        return `
        <div class="cart-item">
            <div class="cart-qty">1</div>
            <div class="cart-info">
                <h5>${esc(item.nombre)}</h5>
                ${lineaMods}
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
    // El renglón muestra el descuento EFECTIVO (ya acotado al ticket), no el
    // nominal: si enseñara "-$50.00" sobre un ticket de $24.50, los renglones
    // dejarían de sumar y el cliente vería un desglose que no cuadra.
    const _desc = _descuentosDelCarrito();
    const descuentoVisible = _desc.visible;
    const desglose = desglosarImpuesto(_desc.base);
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
    // El pago dividido y la propina arrancan en cero en cada venta: nunca se
    // heredan de la anterior (un reparto viejo cobraría mal la venta nueva).
    _resetearPagoDividido();
    _resetearPropinaVenta();
    _renderizarSeccionPropina();
    document.getElementById('modalPago').classList.remove('hidden');
}

// ════════════════════════════════════════════════════════════════════════════
// PAGO DIVIDIDO (BLOQUE 10)
// ════════════════════════════════════════════════════════════════════════════
//
// Los pagos REPARTEN el total, no lo aumentan: mientras la suma no cuadre con la
// cuenta, el botón de confirmar queda bloqueado. La propina de cada pago va
// aparte de su monto (lo que el cliente entrega en ese pago es monto + propina),
// así que NO cuenta para el cuadre — igual que en el backend.
//
// Arranca apagado: la venta normal de un solo método sigue siendo de dos clics.

let pagoDividido = false;
let pagosVenta = [];   // [{ method, amount, tip_amount }]

/** Apaga el pago dividido y limpia sus filas. Se llama al abrir y al cerrar. */
function _resetearPagoDividido() {
    pagoDividido = false;
    pagosVenta = [];
    const seccion = document.getElementById('seccion-pago-dividido');
    if (seccion) seccion.classList.add('hidden');
    const btn = document.getElementById('btn-dividir-pago');
    if (btn) btn.innerText = 'Dividir el pago entre varios métodos';
}

function alternarPagoDividido() {
    pagoDividido = !pagoDividido;
    const seccion = document.getElementById('seccion-pago-dividido');
    const btn = document.getElementById('btn-dividir-pago');

    if (pagoDividido) {
        // Se arranca con dos filas porque dividir en una sola no es dividir.
        if (pagosVenta.length === 0) dividirCuentaEnPartes(2);
        if (seccion) seccion.classList.remove('hidden');
        if (btn) btn.innerText = 'Cancelar el pago dividido';
    } else {
        pagosVenta = [];
        if (seccion) seccion.classList.add('hidden');
        if (btn) btn.innerText = 'Dividir el pago entre varios métodos';
    }
    _renderizarPagosDivididos();
    _actualizarBotonConfirmar();
}

/** Divide la cuenta en N partes iguales, repartiendo los centavos sobrantes. */
function dividirCuentaEnPartes(n) {
    const montos = dividirEnPartes(_totalACobrar(), n);
    // La primera parte hereda el método ya elegido; el resto arranca en efectivo
    // para que el cajero solo cambie lo que de verdad cambió.
    pagosVenta = montos.map((monto, i) => ({
        method: i === 0 ? (metodoSeleccionado || 'efectivo') : 'efectivo',
        amount: monto,
        tip_amount: 0,
    }));
    _renderizarPagosDivididos();
    _actualizarBotonConfirmar();
}

function agregarPagoDividido() {
    if (pagosVenta.length >= PAGO_MAX) {
        alertaZenit('Una venta admite como máximo ' + PAGO_MAX + ' pagos.');
        return;
    }
    // El pago nuevo arranca con lo que falte, que es lo que el cajero va a teclear
    // el 90% de las veces.
    const falta = faltantePago(pagosVenta, _totalACobrar());
    pagosVenta.push({ method: 'efectivo', amount: falta > 0 ? falta : 0, tip_amount: 0 });
    _renderizarPagosDivididos();
    _actualizarBotonConfirmar();
}

function quitarPagoDividido(indice) {
    pagosVenta.splice(indice, 1);
    if (pagosVenta.length === 0) { alternarPagoDividido(); return; }
    _renderizarPagosDivididos();
    _actualizarBotonConfirmar();
}

function alCambiarPagoDividido(indice, campo, valor) {
    if (!pagosVenta[indice]) return;
    if (campo === 'method') {
        pagosVenta[indice].method = metodoDePago(valor);
    } else {
        const limpio = String(valor || '').replace(/[^\d.]/g, '');
        pagosVenta[indice][campo] = parseFloat(limpio) || 0;
    }
    _actualizarResumenPagosDivididos();
    _actualizarBotonConfirmar();
}

function _renderizarPagosDivididos() {
    const cont = document.getElementById('lista-pagos-divididos');
    if (!cont) return;

    // La columna de propina solo aparece si el negocio tiene propinas activas
    // (mismo criterio que el resto del BLOQUE 9: si no las usa, no las ve).
    const conPropina = hayPropinas();

    cont.innerHTML = pagosVenta.map((pago, i) => {
        const inputPropina = conPropina
            ? '<input type="text" inputmode="decimal" value="' + ((pago.tip_amount || 0) > 0 ? pago.tip_amount.toFixed(2) : '') + '"' +
              ' oninput="alCambiarPagoDividido(' + i + ', \'tip_amount\', this.value)"' +
              ' placeholder="Propina" title="Propina de este pago. Va aparte del monto."' +
              ' style="flex:0.9;padding:8px;border:1px solid #bbf7d0;border-radius:8px;font-size:0.88em;text-align:right;background:#f0fdf4;">'
            : '';
        return '<div style="display:flex;gap:6px;align-items:center;">' +
            '<select onchange="alCambiarPagoDividido(' + i + ', \'method\', this.value)"' +
            ' style="flex:1.2;padding:8px;border:1px solid #d1d5db;border-radius:8px;font-size:0.88em;">' +
                '<option value="efectivo"' + (pago.method === 'efectivo' ? ' selected' : '') + '>Efectivo</option>' +
                '<option value="tarjeta"' + (pago.method === 'tarjeta' ? ' selected' : '') + '>Tarjeta</option>' +
                '<option value="transferencia"' + (pago.method === 'transferencia' ? ' selected' : '') + '>Transferencia</option>' +
            '</select>' +
            '<input type="text" inputmode="decimal" value="' + (pago.amount || 0).toFixed(2) + '"' +
            ' oninput="alCambiarPagoDividido(' + i + ', \'amount\', this.value)" placeholder="Monto"' +
            ' style="flex:1;padding:8px;border:1px solid #d1d5db;border-radius:8px;font-size:0.88em;text-align:right;">' +
            inputPropina +
            '<button type="button" onclick="quitarPagoDividido(' + i + ')" title="Quitar este pago"' +
            ' style="padding:8px 10px;border:none;border-radius:8px;background:#fee2e2;color:#b91c1c;font-weight:700;cursor:pointer;">×</button>' +
        '</div>';
    }).join('');

    _actualizarResumenPagosDivididos();
}

function _actualizarResumenPagosDivididos() {
    const total = _totalACobrar();
    const falta = faltantePago(pagosVenta, total);

    const elTotal = document.getElementById('pago-dividido-total');
    if (elTotal) elTotal.innerText = '$' + total.toFixed(2);

    const elFalta = document.getElementById('pago-dividido-faltante');
    if (elFalta) {
        if (Math.abs(falta) <= PAGO_TOLERANCIA + 1e-9) {
            elFalta.innerText = 'Cuadra ✓';
            elFalta.style.color = '#16a34a';
        } else if (falta > 0) {
            elFalta.innerText = 'Falta $' + falta.toFixed(2);
            elFalta.style.color = '#1e40af';
        } else {
            elFalta.innerText = 'Sobra $' + Math.abs(falta).toFixed(2);
            elFalta.style.color = '#dc2626';
        }
    }

    // La propina total de la venta pasa a ser la suma de las de cada pago.
    if (pagoDividido) {
        propinaActual = _redondearVenta(pagosVenta.reduce((a, p) => a + (parseFloat(p.tip_amount) || 0), 0));
        _actualizarDisplayPropina();
    }
}

function _redondearVenta(n) {
    return parseFloat((Math.round((n + Number.EPSILON) * 100) / 100).toFixed(2));
}

/**
 * Habilita el botón de confirmar solo si el cobro está completo.
 * Con pago dividido manda el cuadre; sin él, la regla de siempre (efectivo pide
 * que el recibido alcance, los demás métodos no).
 */
function _actualizarBotonConfirmar() {
    const btn = document.getElementById('btn-confirmar-final');
    if (!btn) return;

    if (pagoDividido) {
        const ok = pagosVenta.length > 0 && pagosCuadran(pagosVenta, _totalACobrar());
        btn.classList.toggle('disabled', !ok);
        btn.disabled = !ok;
        return;
    }
    if (metodoSeleccionado === 'efectivo') { calcularCambio(); return; }
    if (metodoSeleccionado) {
        btn.classList.remove('disabled');
        btn.disabled = false;
    }
}

// --- SELECCIONAR MÉTODO DE PAGO ---
function seleccionarMetodo(metodo) {
    metodoSeleccionado = metodo;
    // La propina hereda el método del pago mientras el cajero no elija otro.
    if (!propinaMetodoActual) _actualizarDisplayPropina();

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
    // El cambio se calcula sobre lo que el cliente PAGA: impuesto incluido y,
    // desde el BLOQUE 9, también la propina (es dinero que entrega de más).
    const total = _totalConPropina();
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
    // Con pago dividido el método sale del reparto ('multiple' si hay varios),
    // así que no hace falta haber elegido uno de los tres botones.
    if (!metodoSeleccionado && !pagoDividido) {
        alertaZenit('Selecciona un método de pago');
        return;
    }
    if (pagoDividido) {
        const v = validarPagos(pagosVenta, _totalACobrar());
        if (!v.ok) { alertaZenit(v.error); return; }
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
            // Se guardan ACOTADOS al ticket, que es lo que de verdad se descontó
            // (§ E-1): mandar el nominal dejaría la fila local diciendo que se
            // descontaron $50 de una venta de $24.50, y el backend registraría
            // otra cosa porque él sí lo acota.
            descuento_monto: _descuentosDelCarrito().promocion,
            descuento_id: descuentoIdActual || null,
            descuento_puntos_monto: _descuentosDelCarrito().puntos,
            puntos_usados: descuentoPuntosVenta > 0 ? (puntosUsadosVenta || 0) : 0,
            // Desglose del impuesto (BLOQUE 8). La tasa viaja CONGELADA con la venta:
            // si sube tarde y el dueño ya cambió el impuesto, el backend respeta la
            // que se cobró en el ticket que el cliente ya se llevó.
            subtotal: desgloseVenta.subtotal,
            impuesto: desgloseVenta.impuesto,
            tasa_impuesto: configImpuesto.tasa || 0,
            impuesto_incluido: configImpuesto.incluido ? 1 : 0,
            // PROPINA (BLOQUE 9). Va APARTE del total: `total` es lo que vendió el
            // negocio y la propina es dinero del cliente para el empleado. Lo que
            // se entregó en caja fue `total + propina`, pero eso no es una venta.
            propina: propinaActual || 0,
            propina_metodo: propinaActual > 0
                ? normalizarMetodoPropina(propinaMetodoActual, metodoSeleccionado)
                : null,
            // PAGOS DIVIDIDOS (BLOQUE 10). Con varios métodos el pedido se guarda
            // como 'multiple' y el reparto real viaja en `pagos`; con uno solo se
            // guarda ese método y no se crea ninguna fila (venta de siempre).
            metodo_pago: pagoDividido
                ? metodoResumenPagos(pagosVenta)
                : metodoSeleccionado,
            pagos: pagoDividido
                ? pagosVenta.map(pago => ({
                    metodo: pago.method,
                    monto: pago.amount,
                    propina: pago.tip_amount || 0,
                }))
                : null,
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
            // `precio` ya trae los extras sumados; `precio_base` es el del
            // catálogo, y el par permite desglosarlo en el ticket (BLOQUE 11).
            precio: i.precio,
            precio_base: i.precio_base != null ? i.precio_base : i.precio,
            modificadores: i.modificadores || [],
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
            // La cocina necesita ver los extras MÁS que nadie: un "sin cebolla"
            // que no llega al pasador se convierte en un plato devuelto.
            items: carrito.map(i => ({
                nombre: i.nombre,
                cantidad: 1,
                modificadores: resumenModificadores(i.modificadores),
                notas: i.nota || '',
            }))
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

// Impresión automática: si la caja tiene activado "Imprimir el ticket
// automáticamente" (Ajustes → Impresora), el ticket sale SOLO y no se pregunta
// nada. Es lo que quiere un negocio que siempre imprime: en hora pico, un modal
// entre venta y venta es fricción pura, y a las diez veces se cierra por reflejo.
//
// ⚠️ Un fallo de impresora NUNCA puede tumbar ni frenar la venta: la venta ya
// está registrada cuando se llega aquí. Por eso la lectura del ajuste va en su
// propio try y, si falla, se cae al modal de siempre — el cajero siempre puede
// imprimir a mano. Mismo criterio que el ticket del mobile (§32.12).
async function mostrarModalImpresion(pedidoId) {
    try {
        const ajustes = await window.api.obtenerAjustes();
        if (ajustes && ajustes.impresora_auto === 'true') {
            imprimirTicket(pedidoId);
            return;
        }
    } catch (e) {
        console.warn('No se pudo leer el ajuste de impresión automática:', e);
    }

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
        let telefonoPrellenado = '';

        if (clienteSeleccionadoVenta) {
            nombrePrellenado = clienteSeleccionadoVenta.nombre;
            direccionPrellenada = clienteSeleccionadoVenta.direccion || '';
            telefonoPrellenado = clienteSeleccionadoVenta.telefono || '';
        }

        contenedor.innerHTML = `
            <div class="campo-grupo">
                <label>Teléfono (Opcional)</label>
                <!-- Al completar los 10 dígitos se busca al cliente y se rellenan
                     nombre y dirección (buscarYAutocompletarCliente, modulo-clientes.js). -->
                <input type="tel" id="dom-telefono" placeholder="10 dígitos" autocomplete="off"
                       value="${esc(telefonoPrellenado)}" oninput="buscarYAutocompletarCliente(this.value)">
            </div>
            <div class="campo-grupo">
                <label>Nombre (Opcional)</label>
                <input type="text" id="dom-nombre" placeholder="Nombre completo" value="${esc(nombrePrellenado)}">
            </div>
            <div class="campo-grupo">
                <label>Dirección (Opcional)</label>
                <input type="text" id="dom-direccion" placeholder="Calle, número, colonia" value="${esc(direccionPrellenada)}">
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
