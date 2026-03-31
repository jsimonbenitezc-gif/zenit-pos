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
                    <div class="top-producto-emoji">${esc(prod.emoji || '📦')}</div>
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
                    <div class="vip-item-icon">⭐</div>
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
