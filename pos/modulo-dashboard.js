// ============================================
// MÓDULO: Dashboard y Gráficas
// ============================================

/* ============================================
   ADMINISTRACIÓN (PRODUCTOS Y DASHBOARD)
   ============================================ */

async function cargarDashboard() {
    try {
        const stats = await obtenerEstadisticasWrapper(sucursalVistaActual);
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
                badge.innerHTML = `${svgIconHTML('trending-up', 14, '#10b981')} +${cambio}%`;
                badge.className = 'kpi-badge positive';
            } else if (cambio < 0) {
                badge.innerHTML = `${svgIconHTML('trending-down', 14, '#ef4444')} ${cambio}%`;
                badge.className = 'kpi-badge negative';
            } else {
                badge.innerHTML = `${svgIconHTML('minus', 14)} 0%`;
                badge.className = 'kpi-badge';
            }
        } else {
            document.getElementById('dash-ventas-comp').innerText = 'Primer día';
        }

        // Impuesto recaudado hoy (BLOQUE 8). Le interesa al administrador: de lo
        // cobrado hoy, cuánto es suyo y cuánto le corresponde al fisco.
        const impuestoHoy = parseFloat(stats.ventasHoy.impuesto_total || 0) || 0;
        const filaImp = document.getElementById('dash-impuesto-fila');
        if (filaImp) {
            if (impuestoHoy > 0) {
                filaImp.classList.remove('hidden');
                const neto = ventasHoy - impuestoHoy;
                document.getElementById('dash-impuesto-hoy').innerText =
                    `${configImpuesto.nombre}: $${impuestoHoy.toFixed(2)} · Neto: $${neto.toFixed(2)}`;
            } else {
                filaImp.classList.add('hidden');
            }
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
            stockAlerta.innerHTML = `${svgIconHTML('triangle-alert', 16, '#ef4444')} ${stockBajo} con stock bajo`;
            stockAlerta.style.color = '#ef4444';
        } else {
            stockAlerta.innerHTML = `${svgIconHTML('circle-check', 16, '#10b981')} Stock normal`;
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
            const clases = ['gold', 'silver', 'bronze'];

            topContainer.innerHTML = stats.topProductos.map((prod, index) => `
                <div class="top-producto-item">
                    <div class="top-producto-rank ${clases[index] || ''}">${index + 1}</div>
                    <div class="top-producto-emoji">${renderIcono(prod.emoji || 'svg:package', 28)}</div>
                    <div class="top-producto-info">
                        <div class="top-producto-nombre">${esc(prod.nombre)}</div>
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
                        <div class="activity-cliente">${esc(venta.cliente)}</div>
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
                    <div class="vip-item-icon">${svgIconHTML('star', 18, '#f59e0b')}</div>
                    <div class="vip-item-info">
                        <div class="vip-item-nombre">${esc(cliente.nombre)}</div>
                        <div class="vip-item-tel">${esc(cliente.telefono)}</div>
                    </div>
                </div>
            `).join('');
        }

        // ============ ALERTAS ============
        calcularAlertasWrapper();

        // ============ AUDITORÍA ============
        cargarAuditLog().catch(() => {});

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
function cargarSelectorIconos(tipo) {
    const cont = document.getElementById(`${tipo}EmojiPicker`);
    if (!cont) return;

    // Tabs: Iconos (default) | Emojis
    const tabsHTML = `
        <div class="icon-picker-tabs">
            <button class="icon-picker-tab active" onclick="cambiarTabPicker('${tipo}','svg',this)">Iconos</button>
            <button class="icon-picker-tab" onclick="cambiarTabPicker('${tipo}','emoji',this)">Emojis</button>
        </div>
    `;

    // SVG icons grid
    const svgGrid = Object.entries(SVG_ICON_CATEGORIES).map(([catName, icons]) =>
        `<div class="icon-picker-category">${catName}</div>` +
        icons.map(name =>
            `<div class="emoji-btn icon-svg-btn" onclick="seleccionarIcono('${tipo}','svg:${name}')" title="${SVG_ICON_LABELS[name] || name}">
                ${svgIconHTML(name, 22)}
            </div>`
        ).join('')
    ).join('');

    // Emoji grid (organized by category like SVG)
    const emojiCats = {
        'Comida': ['🍔','🍕','🍟','🌭','🌮','🌯','🫔','🥙','🥪','🥗','🥩','🍖','🍗','🥓','🍳','🥚','🧆','🥘','🍲','🫕','🥣','🍿','🧈','🧂','🥫','🍱','🍘','🍙','🍚','🍛','🍜','🍝','🍠','🍢','🍣','🍤','🍥','🥮','🍡','🥟','🥠','🥡'],
        'Pan & Cereales': ['🍞','🥐','🥖','🫓','🥨','🥯','🥞','🧇','🧀'],
        'Frutas': ['🍇','🍈','🍉','🍊','🍋','🍌','🍍','🥭','🍎','🍏','🍐','🍑','🍒','🍓','🫐','🥝','🥥'],
        'Verduras': ['🍅','🥑','🍆','🥔','🥕','🌽','🌶️','🫑','🥒','🥬','🥦','🧄','🧅','🥜','🫘','🌰','🫒'],
        'Postres & Dulces': ['🍦','🍧','🍨','🍩','🍪','🎂','🍰','🧁','🥧','🍫','🍬','🍭','🍮','🍯'],
        'Bebidas': ['🥤','☕','🫖','🍵','🥛','🍼','🍺','🍻','🍷','🍸','🍹','🍾','🥂','🥃','🧋','🧃','🧉','🧊','🫗','🍶'],
        'Restaurante': ['🍽️','🍴','🥄','🔪','🫙','🧑‍🍳','🧾','💳'],
        'General': ['📦','🛒','🛍️','🏷️','🔥','⭐','✨','💡','✂️','📌','💰','🎉','❤️','👍','🏠','🚗','🛵','📱','📋','✅','⏰','🔔']
    };
    const emojiGrid = Object.entries(emojiCats).map(([catName, emojis]) =>
        `<div class="icon-picker-category">${catName}</div>` +
        emojis.map(e =>
            `<div class="emoji-btn" onclick="seleccionarIcono('${tipo}','${e}')">${e}</div>`
        ).join('')
    ).join('');

    cont.innerHTML = tabsHTML +
        `<div class="icon-picker-grid" id="${tipo}SvgGrid">${svgGrid}</div>` +
        `<div class="icon-picker-grid" id="${tipo}EmojiGrid" style="display:none;">${emojiGrid}</div>`;
}

// Alias de compatibilidad
function cargarSelectorEmojis(tipo) { cargarSelectorIconos(tipo); }

function cambiarTabPicker(tipo, tab, btn) {
    const cont = document.getElementById(`${tipo}EmojiPicker`);
    if (!cont) return;
    cont.querySelectorAll('.icon-picker-tab').forEach(t => t.classList.remove('active'));
    btn.classList.add('active');

    const svgGrid = document.getElementById(`${tipo}SvgGrid`);
    const emojiGrid = document.getElementById(`${tipo}EmojiGrid`);
    if (tab === 'svg') {
        if (svgGrid) svgGrid.style.display = '';
        if (emojiGrid) emojiGrid.style.display = 'none';
    } else {
        if (svgGrid) svgGrid.style.display = 'none';
        if (emojiGrid) emojiGrid.style.display = '';
    }
}

function seleccionarIcono(tipo, valor) {
    emojiSeleccionado = valor;
    const display = document.getElementById(`${tipo}EmojiDisplay`);
    if (display) {
        display.innerHTML = renderIcono(valor, 30);
    }
    const picker = document.getElementById(`${tipo}EmojiPicker`);
    if (picker) {
        picker.style.display = 'none';
    }
}

// Alias de compatibilidad
function seleccionarEmoji(tipo, e) { seleccionarIcono(tipo, e); }

function toggleEmojiPicker(tipo) {
    const el = document.getElementById(`${tipo}EmojiPicker`);
    if (el) {
        const isHidden = el.style.display === 'none' || !el.style.display;
        el.style.display = isHidden ? 'block' : 'none';
        if (isHidden && !el.querySelector('.icon-picker-tabs')) {
            cargarSelectorIconos(tipo);
        }
    }
}

async function seleccionarImagenProducto() {
    // La imagen se comprime y se guarda como data URI: visible en todos los dispositivos
    const dataUri = await elegirImagenComprimida();
    if (dataUri) {
        rutaImagenTemporal = dataUri;
        document.getElementById('prodImagenRuta').value = dataUri;
        document.getElementById('prodEmojiDisplay').style.display = 'none';
        const preview = document.getElementById('prodImagenPreview');
        preview.src = dataUri;
        preview.style.display = 'block';
    }
}

async function seleccionarImagenCategoria() {
    // La imagen se comprime y se guarda como data URI: visible en todos los dispositivos
    const dataUri = await elegirImagenComprimida();
    if (dataUri) {
        document.getElementById('catImagenRuta').value = dataUri;
        document.getElementById('catEmojiDisplay').style.display = 'none';
        const preview = document.getElementById('catImagenPreview');
        preview.src = dataUri;
        preview.style.display = 'block';
    }
}
