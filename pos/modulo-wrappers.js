// ============================================
// MÓDULO: Wrappers de Datos (Local/Online)
// ============================================

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

// Genera un uuid v4 para idempotencia de la venta. Usa crypto.randomUUID si
// está disponible (contexto seguro) y cae a un fallback manual si no.
function _generarUuid() {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
    }
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

// PEDIDOS
async function crearPedidoWrapper(datosPedido, items) {
    // uuid de idempotencia: el MISMO id viaja al backend y se guarda en SQLite
    // local, de modo que un reintento (p. ej. tras un timeout de red) no cree
    // un pedido duplicado ni descuente stock dos veces.
    const client_uuid = _generarUuid();
    const datosLocal = { ...datosPedido, client_uuid };

    // Modo local puro (sin cuenta vinculada): guardar y listo.
    if (!modoConectado || !apiClient || !tokenActual) {
        return await window.api.crearPedidoDirecto(datosLocal, items);
    }

    // Modo conectado — VENTA INSTANTÁNEA:
    //  1) Guardar LOCAL de inmediato (marca pendiente_sync y descuenta stock local).
    //     La venta se cierra al instante sin esperar la respuesta del backend.
    //  2) Sincronizar con el backend en SEGUNDO PLANO. La idempotencia por
    //     client_uuid garantiza que no se duplique aunque se reintente, y
    //     subirPedidosPendientes marca la comanda en el KDS para no reenviarla.
    const local = await window.api.crearPedidoDirecto({ ...datosLocal, pendiente_sync: 1 }, items);
    subirPedidosPendientes().catch(e => console.warn('Sync de venta en segundo plano:', e && e.message));
    return local;
}

async function obtenerPedidosWrapper(filtro) {
    if (modoConectado && apiClient && tokenActual) {
        try {
            const filtroBackend = { ...filtro };
            if (filtro.date_from) filtroBackend.date_from = new Date(filtro.date_from + 'T00:00:00').toISOString();
            if (filtro.date_to)   filtroBackend.date_to   = new Date(filtro.date_to   + 'T23:59:59').toISOString();
            // Filtrar por la sucursal que se está MIRANDO (por defecto la de este
            // equipo; el dueño puede cambiarla en las tabs). "Todas" = sin filtro.
            const _sucVista = (typeof sucursalParaConsultar === 'function') ? sucursalParaConsultar() : sucursalIdActual;
            if (_sucVista) filtroBackend.branch_id = _sucVista;
            const result = await apiClient.getOrders(filtroBackend);
            const rawOrders = result.data || result;
            const pag = result.pagination || { total: rawOrders.length, page: 1, limit: rawOrders.length, pages: 1 };
            const data = rawOrders.map(o => ({
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
                telefono: o.customer ? o.customer.name : (o.table ? 'Mesa: ' + o.table.name : (o.customer_temp_info || null)),
                _items: o.items
            }));
            // Safety net: agregar órdenes locales que no se sincronizaron al backend
            try {
                const pendientes = await window.api.obtenerPedidosPendientes();
                const noSinc = (pendientes || []).filter(p => p.estado === 'completado');
                if (noSinc.length > 0) {
                    const backendIds = new Set(data.map(o => o.id));
                    noSinc.forEach(p => {
                        if (!backendIds.has(p.id)) {
                            data.unshift({
                                id: p.id,
                                cajero: p.cajero,
                                telefono: p.info_cliente_temp || null,
                                total: p.total,
                                metodo_pago: p.metodo_pago,
                                estado: p.estado,
                                tipo_pedido: p.tipo_pedido,
                                referencia: p.referencia,
                                fecha: p.fecha_pedido
                            });
                        }
                    });
                }
            } catch (e) { /* ignorar errores del fallback local */ }
            // Ordenar por fecha descendente después de mezclar local + backend
            data.sort((a, b) => new Date(b.fecha || 0) - new Date(a.fecha || 0));
            const resumen = {
                total_pedidos: pag.total || data.length,
                total_ventas:  data.reduce((s, o) => s + o.total, 0),
                efectivo:      data.filter(o => o.metodo_pago === 'efectivo').reduce((s, o) => s + o.total, 0),
                tarjeta:       data.filter(o => ['tarjeta','debito','credito'].includes(o.metodo_pago)).reduce((s, o) => s + o.total, 0),
                transferencia: data.filter(o => o.metodo_pago === 'transferencia').reduce((s, o) => s + o.total, 0),
            };
            return { data, pagination: pag, resumen };
        } catch (error) {
            console.error('Error al obtener pedidos del backend:', error);
            // Marcar que hubo error para mostrar aviso en la UI
            const localResult = await window.api.obtenerPedidos(filtro);
            const result = (() => {
                if (localResult && localResult.data) return { data: localResult.data, pagination: localResult.paginacion || {}, resumen: localResult.resumen };
                return { data: localResult || [], pagination: {} };
            })();
            result._backendError = true;
            return result;
        }
    } else {
        const localResult = await window.api.obtenerPedidos(filtro);
        if (localResult && localResult.data) return { data: localResult.data, pagination: localResult.paginacion || {}, resumen: localResult.resumen };
        return { data: localResult || [], pagination: {} };
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
                monto_total: parseFloat(c.monto_total) || 0,
                puntos: c.loyalty_points || 0,
                en_fidelidad: c.in_loyalty ? 1 : 0
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
async function obtenerEstadisticasWrapper(branchId) {
    if (modoConectado && apiClient && tokenActual) {
        try {
            const qs = branchId ? `?branch_id=${branchId}` : '';
            return await apiClient.request(`/stats/dashboard${qs}`);
        } catch (error) {
            console.error('Error al obtener estadísticas del backend:', error);
            return await window.api.obtenerEstadisticas();
        }
    } else {
        return await window.api.obtenerEstadisticas();
    }
}
