// ============================================
// MÓDULO: Respaldo y Sincronización
// ============================================

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
            alertaZenit('Error al crear el respaldo: ' + resultado.error);
        }
    } catch(e) {
        alertaZenit('No se pudo crear el respaldo');
    } finally {
        btn.disabled = false;
        btn.innerText = textoOriginal;
    }
}

async function abrirCarpetaBackups() {
    await window.api.abrirCarpetaBackups();
}

// ============================================
// SINCRONIZACIÓN LOCAL → NUBE
// ============================================
async function syncLocalToCloud() {
    const resultadoDiv = document.getElementById('resultado-conexion');
    const msg = (texto) => { if (resultadoDiv) resultadoDiv.innerHTML = texto; };

    try {
        // 1. CATEGORÍAS — emparejar por nombre
        msg(`${svgIconHTML("loader", 16, "#2563eb")} Sincronizando categorías...`);
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
        msg(`${svgIconHTML("loader", 16, "#2563eb")} Sincronizando productos...`);
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
        msg(`${svgIconHTML("loader", 16, "#2563eb")} Sincronizando clientes...`);
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
        msg(`${svgIconHTML("triangle-alert", 16, "#f59e0b")} Sincronización parcial. Algunos datos podrían no haberse subido.`);
        await new Promise(r => setTimeout(r, 1500));
    }
}

// ============================================
// SINCRONIZACIÓN BACKEND → LOCAL
// ============================================

async function sincronizarDesdeBackend() {
    if (!modoConectado || !apiClient || !tokenActual) return;
    if (modoSoloOnline) return; // En modo solo online no se descarga nada localmente
    console.log('🔄 Sincronizando datos del backend...');
    try {
        // ── FASE 1: Subir datos locales al backend (antes de descargar) ──
        if (puedeAccederPremium()) {
            await subirInventarioLocalAlBackend();
            await _sincronizarRecetasAlBackend();
            await subirOfertasLocalesAlBackend();
        }

        // ── FASE 2: Descargar TODO en memoria (sin tocar SQLite) ──
        const cats = await apiClient.getCategories();
        const prods = await apiClient.getProducts();
        const clientes = await apiClient.getCustomers();

        // Datos premium (inventario + ofertas) — opcionales
        let insumosBackend = null, preps = null, recetas = null;
        let descuentos = null, combos = null;
        if (puedeAccederPremium()) {
            const branchQ = sucursalIdActual ? `?branch_id=${sucursalIdActual}` : '';
            insumosBackend = await apiClient.getIngredients(branchQ);
            if (insumosBackend && insumosBackend.length > 0) {
                preps = await apiClient.request('/inventory/preparations');
                recetas = await apiClient.request('/inventory/all-recipes');
            }
            descuentos = await apiClient.request('/offers/discounts');
            combos = await apiClient.request('/offers/combos');
        }

        // Ajustes — no crítico, falla silenciosamente
        let ajustesNegocio = null;
        try { ajustesNegocio = await apiClient.request('/settings'); } catch (e) {
            console.warn('No se pudieron descargar ajustes de negocio:', e.message);
        }

        // Pedidos — no crítico, falla silenciosamente
        let pedidosBackend = null;
        try {
            const branchQuery = sucursalIdActual ? `&branch_id=${sucursalIdActual}` : '';
            pedidosBackend = await apiClient.request(`/orders?limit=200&page=1${branchQuery}`);
        } catch (e) {
            console.warn('No se pudieron descargar pedidos:', e.message);
        }

        // ── FASE 3: Todo descargado OK → guardar en SQLite ──
        await window.api.syncClasificaciones(cats);
        await window.api.syncProductos(prods);
        await window.api.syncClientes(clientes);

        if (puedeAccederPremium()) {
            if (insumosBackend && insumosBackend.length > 0) {
                await window.api.syncInsumos(insumosBackend);
                if (preps) await window.api.syncPreparaciones(preps);
                if (recetas) await window.api.syncRecetas(recetas);
            }
            if (descuentos) await window.api.syncDescuentos(descuentos);
            if (combos) await window.api.syncCombos(combos);
        }

        if (ajustesNegocio && ajustesNegocio.permisos_roles) {
            await window.api.guardarAjuste('permisos_roles', JSON.stringify(ajustesNegocio.permisos_roles));
        }

        if (pedidosBackend) {
            await window.api.syncPedidos((pedidosBackend && pedidosBackend.data) ? pedidosBackend.data : []);
        }

        console.log('✅ Sincronización desde backend completada');
    } catch (error) {
        // Si falla en FASE 2 (descarga), los datos locales quedan intactos
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
                    order_type: (pedido.tipo_pedido === 'mesa' ? 'comer' : pedido.tipo_pedido) || 'comer',
                    reference: pedido.referencia || null,
                    delivery_address: pedido.direccion_domicilio || null,
                    maps_link: pedido.link_maps || null,
                    notes: pedido.notas_generales || null,
                    branch_id: sucursalIdActual || null
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

async function subirInventarioLocalAlBackend() {
    if (!modoConectado || !apiClient || !tokenActual) return;
    try {
        // Verificar si el backend ya tiene inventario
        const insumosBackend = await apiClient.getIngredients();
        if (insumosBackend && insumosBackend.length > 0) return; // Ya tiene datos, no sobreescribir

        const insumosLocales = await window.api.obtenerInsumos();
        if (!insumosLocales || insumosLocales.length === 0) return;
        console.log(`📤 Subiendo ${insumosLocales.length} insumo(s) al backend...`);

        // Mapa: id local → id backend
        const mapaInsumos = {};
        for (const insumo of insumosLocales) {
            try {
                const creado = await apiClient.request('/inventory/ingredients', { method: 'POST', body: {
                    name: insumo.nombre, unit: insumo.unidad,
                    stock: insumo.stock_actual || 0, min_stock: insumo.stock_minimo || 0
                } });
                mapaInsumos[insumo.id] = creado.id;
            } catch (e) { console.warn(`No se pudo subir insumo ${insumo.nombre}:`, e.message); }
        }

        // Subir preparaciones
        const prepsLocales = await window.api.obtenerPreparaciones();
        const mapaPreps = {};
        for (const prep of (prepsLocales || [])) {
            try {
                const creado = await apiClient.request('/inventory/preparations', { method: 'POST', body: {
                    name: prep.nombre, unit: 'unidad', yield_quantity: 1, notes: prep.descripcion || ''
                } });
                mapaPreps[prep.id] = creado.id;
                // Subir items de esta preparación
                const items = await window.api.obtenerItemsPreparacion(prep.id);
                if (items && items.length > 0) {
                    const itemsMapeados = items
                        .filter(it => mapaInsumos[it.insumo_id])
                        .map(it => ({ ingredient_id: mapaInsumos[it.insumo_id], quantity: it.cantidad, unit_recipe: it.unidad_receta || null }));
                    if (itemsMapeados.length > 0) {
                        await apiClient.request(`/inventory/preparations/${creado.id}/recipe`, { method: 'POST', body: { items: itemsMapeados } });
                    }
                }
            } catch (e) { console.warn(`No se pudo subir preparación ${prep.nombre}:`, e.message); }
        }

        // Subir recetas de productos (receta_items)
        const productosLocales = await window.api.obtenerProductosAgrupados();
        const todosProductos = (productosLocales || []).flatMap(c => c.productos || []);
        const cloudProds = await apiClient.getProducts();
        const mapaProductos = {};
        (cloudProds || []).forEach(p => {
            mapaProductos[_normalizarNombreProducto(p.name)] = p.id;
        });
        for (const prod of todosProductos) {
            try {
                const nombreProd = prod.nombre || prod.name;
                const backendProdId = mapaProductos[_normalizarNombreProducto(nombreProd)];
                if (!backendProdId) continue;
                const receta = await window.api.obtenerRecetaProducto(prod.id);
                if (!receta || receta.length === 0) continue;
                const itemsMapeados = receta.map(it => {
                    const esInsumo = it.tipo === 'insumo' || it.tipo === 'ingrediente' || it.tipo === 'ingredient';
                    const backendId = esInsumo ? mapaInsumos[it.referencia_id] : mapaPreps[it.referencia_id];
                    if (!backendId) return null;
                    return { item_type: esInsumo ? 'ingredient' : 'preparation', item_id: backendId, quantity: it.cantidad, unit_recipe: it.unidad_receta || null };
                }).filter(Boolean);
                if (itemsMapeados.length > 0) {
                    await apiClient.request(`/inventory/products/${backendProdId}/recipe`, { method: 'POST', body: { items: itemsMapeados } });
                }
            } catch (e) { console.warn(`No se pudo subir receta del producto ${prod.id}:`, e.message); }
        }

        console.log('✅ Inventario local subido al backend');
        // Re-sincronizar para que los IDs locales queden iguales a los del backend
        const _branchQup = sucursalIdActual ? `?branch_id=${sucursalIdActual}` : '';
        const insumosNuevos = await apiClient.getIngredients(_branchQup);
        await window.api.syncInsumos(insumosNuevos);
        const prepsNuevos = await apiClient.request('/inventory/preparations');
        await window.api.syncPreparaciones(prepsNuevos);
        const recetasNuevas = await apiClient.request('/inventory/all-recipes');
        await window.api.syncRecetas(recetasNuevas);
    } catch (error) {
        console.error('Error al subir inventario al backend:', error);
    }
}

async function subirOfertasLocalesAlBackend() {
    if (!modoConectado || !apiClient || !tokenActual) return;
    try {
        // Descuentos
        const descBackend = await apiClient.request('/offers/discounts');
        if (!descBackend || descBackend.length === 0) {
            const descLocales = await window.api.obtenerDescuentos();
            for (const d of (descLocales || [])) {
                try {
                    const tipoBackend = d.tipo === 'porcentaje' ? 'percentage' : 'fixed';
                    const creado = await apiClient.request('/offers/discounts', { method: 'POST', body: { name: d.nombre, type: tipoBackend, value: d.valor, applies_to: 'all' } });
                    await window.api.agregarDescuentoConId(creado.id, d);
                    await window.api.eliminarDescuento(d.id);
                } catch (e) { console.warn(`No se pudo subir descuento ${d.nombre}:`, e.message); }
            }
        }

        // Combos
        const combosBackend = await apiClient.request('/offers/combos');
        if (!combosBackend || combosBackend.length === 0) {
            const combosLocales = await window.api.obtenerCombos();
            for (const c of (combosLocales || [])) {
                try {
                    const creado = await apiClient.request('/offers/combos', { method: 'POST', body: { name: c.nombre, description: c.descripcion || '', price: c.precio_especial } });
                    const items = await window.api.obtenerItemsCombo(c.id);
                    if (items && items.length > 0) {
                        const itemsBackend = items.map(i => ({ product_id: i.producto_id, quantity: i.cantidad }));
                        await apiClient.request(`/offers/combos/${creado.id}/items`, { method: 'POST', body: { items: itemsBackend } });
                    }
                    await window.api.agregarComboConId(creado.id, c);
                    await window.api.guardarItemsCombo(creado.id, items || []);
                    await window.api.eliminarCombo(c.id);
                } catch (e) { console.warn(`No se pudo subir combo ${c.nombre}:`, e.message); }
            }
        }
    } catch (error) {
        console.error('Error al subir ofertas al backend:', error);
    }
}

// ============================================
