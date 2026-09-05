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

// ── Restaurar un respaldo ────────────────────────────────────────────────────
// El archivo se llama backup-2026-08-05T18-25-54-123Z.db (ISO con los ':' y '.'
// cambiados por '-'). Se rearma el ISO para mostrar la fecha en hora local.
function _etiquetaRespaldo(nombre) {
    const esPrevio = nombre.startsWith('pre-restauracion-');
    const crudo = nombre.replace(/^(backup-|pre-restauracion-)/, '').replace(/\.db$/, '');
    const [fecha, hora] = crudo.split('T');
    let texto = crudo;
    if (fecha && hora) {
        const partes = hora.split('-');            // HH MM SS mmmZ
        const iso = `${fecha}T${partes[0]}:${partes[1]}:${partes[2]}.${partes[3] || '000Z'}`;
        const d = new Date(iso);
        if (!isNaN(d)) texto = d.toLocaleString();
    }
    return esPrevio ? `${texto} (copia previa a una restauración)` : texto;
}

async function mostrarRestaurarRespaldo() {
    const bloque = document.getElementById('bloque-restaurar-backup');
    const select = document.getElementById('select-backup');
    if (!bloque || !select) return;

    const backups = await window.api.listarBackups();
    if (!backups || backups.length === 0) {
        alertaZenit('Todavía no hay respaldos en este equipo. Crea uno con "Crear Respaldo Ahora".', 'Sin respaldos');
        return;
    }

    select.innerHTML = backups
        .map(n => `<option value="${n}">${_etiquetaRespaldo(n)}</option>`)
        .join('');
    bloque.style.display = 'block';
}

async function restaurarRespaldoSeleccionado() {
    const select = document.getElementById('select-backup');
    const btn = document.getElementById('btn-restaurar-backup');
    const nombre = select?.value;
    if (!nombre) return;

    const confirmado = await confirmarZenit(
        `Se reemplazarán TODOS los datos de este equipo (ventas, turnos, inventario) por los del respaldo del ${_etiquetaRespaldo(nombre)}.\n\n` +
        'Se guardará antes una copia de los datos actuales, por si te equivocas de respaldo. La aplicación se reiniciará.\n\n' +
        'Si este equipo tiene una cuenta vinculada, es posible que tengas que iniciar sesión de nuevo.',
        '¿Restaurar este respaldo?',
        { textoOk: 'Restaurar y reiniciar', textoCancelar: 'Cancelar', peligro: true }
    );
    if (!confirmado) return;

    if (btn) { btn.disabled = true; btn.innerText = 'Restaurando...'; }
    try {
        const resultado = await window.api.restaurarBackup(nombre);
        if (resultado.ok) {
            // La app se reinicia sola en ~1s (main.js): este aviso es el último
            // que alcanza a verse, así que no espera respuesta.
            alertaZenit('Respaldo restaurado. La aplicación se reiniciará.', 'Listo');
        } else {
            alertaZenit('No se pudo restaurar: ' + resultado.error, 'Error');
        }
    } catch (e) {
        alertaZenit('No se pudo restaurar el respaldo.', 'Error');
    } finally {
        if (btn) { btn.disabled = false; btn.innerText = 'Restaurar y reiniciar'; }
    }
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

        // Biblioteca de modificadores (BLOQUE 11) — no crítica, falla en silencio.
        // NO va detrás de `puedeAccederPremium()`: personalizar un producto es
        // operación básica de un restaurante, no una función de plan.
        let modificadoresBackend = null;
        try { modificadoresBackend = await apiClient.getModifiers(); } catch (e) {
            console.warn('No se pudo descargar la biblioteca de modificadores:', e.message);
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
            await _reconciliarDescuentosLocales(descuentos);
            if (combos) await window.api.syncCombos(combos);
        }

        // El catálogo de modificadores se guarda ENTERO en la SQLite: sin él, la
        // caja sin internet no podría ni ofrecer los extras ni cobrarlos. Se
        // reemplaza completo (no se fusiona) para que un extra borrado por el
        // dueño desaparezca de verdad de la pantalla del cajero.
        if (modificadoresBackend) {
            await window.api.guardarCatalogoModificadores(modificadoresBackend).catch(() => {});
            if (typeof cargarCatalogoModificadores === 'function') {
                await cargarCatalogoModificadores().catch(() => {});
            }
        }

        if (ajustesNegocio && ajustesNegocio.permisos_roles) {
            await window.api.guardarAjuste('permisos_roles', JSON.stringify(ajustesNegocio.permisos_roles));
        }

        // Si el dueño pide PIN para los movimientos de caja se guarda localmente,
        // para que el equipo lo siga pidiendo aunque se caiga el internet.
        if (ajustesNegocio && ajustesNegocio.movimientos_caja_pin !== undefined) {
            await window.api.guardarAjuste(
                'movimientos_caja_pin',
                ajustesNegocio.movimientos_caja_pin === false ? 'false' : 'true'
            );
        }

        // Config del impuesto (BLOQUE 8). Se guarda local para poder cobrarlo bien
        // SIN internet: si no estuviera, la caja offline cobraría sin impuesto y el
        // ticket saldría por un monto distinto al que registra el backend.
        if (ajustesNegocio) {
            if (ajustesNegocio.tax_enabled !== undefined) {
                await window.api.guardarAjuste('tax_enabled', ajustesNegocio.tax_enabled === true || ajustesNegocio.tax_enabled === 'true' ? 'true' : 'false');
            }
            if (ajustesNegocio.tax_rate !== undefined) {
                await window.api.guardarAjuste('tax_rate', String(ajustesNegocio.tax_rate ?? 0));
            }
            if (ajustesNegocio.tax_included !== undefined) {
                await window.api.guardarAjuste('tax_included', ajustesNegocio.tax_included === true || ajustesNegocio.tax_included === 'true' ? 'true' : 'false');
            }
            if (ajustesNegocio.tax_name !== undefined) {
                await window.api.guardarAjuste('tax_name', String(ajustesNegocio.tax_name || 'IVA'));
            }
            if (typeof cargarConfigImpuesto === 'function') await cargarConfigImpuesto();

            // Propinas (BLOQUE 9). Se cachean localmente por la misma razón que el
            // impuesto: sin esto, la caja sin internet dejaría de pedir propina y el
            // corte no cuadraría con lo que el cajero tiene en el cajón.
            if (ajustesNegocio.propinas_activas !== undefined) {
                await window.api.guardarAjuste('propinas_activas', ajustesNegocio.propinas_activas === true || ajustesNegocio.propinas_activas === 'true' ? 'true' : 'false');
            }
            if (ajustesNegocio.propina_sugerencias !== undefined) {
                await window.api.guardarAjuste('propina_sugerencias', JSON.stringify(normalizarSugerenciasPropina(ajustesNegocio.propina_sugerencias)));
            }
            if (typeof cargarConfigPropina === 'function') await cargarConfigPropina();

            // Horario del negocio (BLOQUE 14). Se cachea local para que aprobar
            // una pantalla del KDS de ESTA RED siga funcionando con el internet
            // caído — que es justo cuando el KDS local es lo único en pie.
            // `undefined` (backend viejo) NO toca el ajuste; `null` sí lo borra,
            // porque significa que el dueño quitó el horario.
            if (ajustesNegocio.horario_operacion !== undefined) {
                const r = normalizarHorarioSemana(ajustesNegocio.horario_operacion);
                await window.api.guardarAjuste('horario_operacion', r.horario ? JSON.stringify(r.horario) : '');
            }
            if (typeof cargarHorarioDesdeAjustes === 'function') await cargarHorarioDesdeAjustes();
        }

        if (pedidosBackend) {
            await window.api.syncPedidos((pedidosBackend && pedidosBackend.data) ? pedidosBackend.data : []);
        }

        console.log('✅ Sincronización desde backend completada');
        return true;
    } catch (error) {
        // Si falla en FASE 2 (descarga), los datos locales quedan intactos.
        // Se devuelve `false` en vez de relanzar: quien llama decide qué hacer
        // (hoy, pintar "Sin conexión" en la cabecera) y nada más se rompe.
        console.error('⚠️ Error en sincronización desde backend:', error);
        return false;
    }
}

// Los descuentos locales que NO existen en el backend (los sembrados al instalar,
// o los creados sin conexión) tienen un id que el backend desconoce. Como el id es
// la autorización del descuento en la venta (ver subirPedidosPendientes), mandarlo
// daría 404 y la venta quedaría atascada en la cola. Aquí se suben al backend y se
// re-indexan localmente con el id real, de modo que el id siempre sea válido.
async function _reconciliarDescuentosLocales(descuentosBackend) {
    if (!modoConectado || !apiClient || !tokenActual) return;
    try {
        const locales = await window.api.obtenerDescuentos();
        if (!locales || locales.length === 0) return;
        const idsBackend = new Set((descuentosBackend || []).map(d => d.id));
        const huerfanos = locales.filter(d => !idsBackend.has(d.id));
        if (huerfanos.length === 0) return;

        for (const d of huerfanos) {
            try {
                const creado = await apiClient.request('/offers/discounts', {
                    method: 'POST',
                    body: {
                        name: d.nombre,
                        type: d.tipo === 'porcentaje' ? 'percentage' : 'fixed',
                        value: d.valor,
                        applies_to: 'all',
                        requires_pin: !!d.requires_pin
                    }
                });
                if (creado && creado.id) {
                    await window.api.agregarDescuentoConId(creado.id, {
                        nombre: d.nombre, tipo: d.tipo, valor: d.valor, requires_pin: !!d.requires_pin
                    });
                    // Quitar la fila con el id viejo (el nuevo ya quedó insertado)
                    if (creado.id !== d.id) await window.api.eliminarDescuentoDefinitivo(d.id);
                }
            } catch (e) {
                console.warn(`No se pudo reconciliar el descuento "${d.nombre}":`, e.message);
            }
        }
    } catch (e) {
        console.warn('No se pudieron reconciliar los descuentos locales:', e.message);
    }
}

// SQLite guarda las fechas del POS con datetime('now','localtime'): un texto
// 'YYYY-MM-DD HH:MM:SS' SIN zona, en la hora del equipo. `new Date('...T...')`
// (sin la Z) lo interpreta como hora local, que es justo lo que queremos, y
// toISOString() lo convierte al instante universal que espera el backend.
// Devuelve null ante cualquier valor raro: el backend cae a su propia hora.
function _fechaLocalAIso(fecha) {
    if (!fecha) return null;
    if (fecha instanceof Date) return isNaN(fecha) ? null : fecha.toISOString();
    const texto = String(fecha).trim();
    // Ya viene con zona (ISO con Z u offset): usarlo tal cual.
    const d = /[zZ]|[+-]\d{2}:?\d{2}$/.test(texto)
        ? new Date(texto)
        : new Date(texto.replace(' ', 'T'));
    return isNaN(d.getTime()) ? null : d.toISOString();
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
                // Pagos divididos (BLOQUE 10). Si la venta se cobró con varios
                // métodos, el reparto sube con ella; sin él, el backend la
                // clasificaría entera por su metodo_pago y el corte no cuadraría.
                const pagosLocales = await window.api.obtenerPagosPedido(pedido.id).catch(() => []);
                const datosAPI = {
                    customer_id: pedido.cliente_id || null,
                    customer_temp_info: pedido.info_cliente_temp || null,
                    total: pedido.total,
                    // Descuento de promoción + su autorización. El backend exige un
                    // discount_id válido (o PIN) para aceptar el monto; mandamos el id
                    // guardado con la venta para no tener que almacenar el PIN en claro.
                    discount_amount: pedido.descuento_monto || 0,
                    discount_id: pedido.descuento_id || null,
                    // Canje de puntos: va aparte porque NO requiere autorización.
                    // El backend lo topa a puntos_usados × puntos_valor y descuenta
                    // los puntos del cliente en la misma transacción.
                    loyalty_discount_amount: pedido.descuento_puntos_monto || 0,
                    loyalty_points_used: pedido.puntos_usados || 0,
                    payment_method: pedido.metodo_pago,
                    order_type: (pedido.tipo_pedido === 'mesa' ? 'comer' : pedido.tipo_pedido) || 'comer',
                    reference: pedido.referencia || null,
                    delivery_address: pedido.direccion_domicilio || null,
                    maps_link: pedido.link_maps || null,
                    notes: pedido.notas_generales || null,
                    branch_id: sucursalIdActual || null,
                    client_uuid: pedido.client_uuid || null,
                    // Hora REAL de la venta (BLOQUE 5). Sin esto, una venta hecha
                    // sin internet quedaba con la hora en que se recuperó la red:
                    // caía en el día y el turno equivocados. El backend la acepta
                    // junto al client_uuid y respeta también el unit_price de abajo,
                    // que es el precio que de verdad se cobró.
                    sold_at: _fechaLocalAIso(pedido.fecha_pedido),
                    // Impuesto CONGELADO de la venta (BLOQUE 8): la tasa con la que
                    // se cobró el ticket, no la que el negocio tenga hoy. El backend
                    // solo la acepta en ventas diferidas y recalcula el monto —
                    // nunca se le cree el importe al cliente.
                    tax_rate: pedido.tasa_impuesto || 0,
                    tax_included: !!pedido.impuesto_incluido,
                    // Propina (BLOQUE 9). Va APARTE del total: `total` es lo que
                    // vendió el negocio. El backend la descarta si el negocio tiene
                    // las propinas apagadas, y una propina inválida nunca atasca la
                    // venta en la cola (cae a 0 y la venta se registra igual).
                    tip_amount: pedido.propina || 0,
                    tip_method: pedido.propina_metodo || null,
                    // Reparto por método (BLOQUE 10). Solo se manda si hay más de un
                    // pago o si el desglose lleva propinas propias: una venta simple
                    // no necesita filas y sube exactamente como antes del bloque.
                    // El backend lo revalida contra el total y, si no cuadra, lo
                    // DESCARTA en vez de rechazar la venta (es diferida) — así una
                    // venta nunca se queda atascada en la cola por el reparto.
                    ...(Array.isArray(pagosLocales) && pagosLocales.length > 0 ? {
                        payments: pagosLocales.map(p => ({
                            method: p.metodo,
                            amount: p.monto,
                            tip_amount: p.propina || 0,
                        })),
                    } : {}),
                    // La venta YA se concretó localmente; no dejar que un aviso de
                    // stock del backend bloquee su subida (evita marcarla como
                    // sincronizada sin haberse creado en el backend).
                    skip_stock_check: true
                };
                const itemsAPI = items.map(i => ({
                    product_id: i.producto_id,
                    quantity: i.cantidad,
                    // ⚠️ `unit_price` es el precio BASE, sin los extras (BLOQUE 11):
                    // el backend compara ESE contra el catálogo para auditar precios
                    // raros, y suma los modificadores por su cuenta. Mandar el precio
                    // ya con extras haría que cada "extra queso" quedara registrado
                    // como si el equipo hubiera cobrado un precio inventado.
                    // Un renglón anterior al bloque no tiene `precio_base`: ahí el
                    // unitario ES el precio base y todo queda como antes.
                    unit_price: i.precio_base != null ? i.precio_base : i.precio_unitario,
                    base_unit_price: i.precio_base != null ? i.precio_base : i.precio_unitario,
                    subtotal: i.subtotal,
                    // Selección CONGELADA. Como la venta es diferida, el backend
                    // respeta estos deltas: son los que el ticket ya cobró, aunque
                    // el dueño haya cambiado el precio del extra mientras tanto.
                    modifiers: (() => {
                        try { return i.modificadores ? JSON.parse(i.modificadores) : undefined; }
                        catch { return undefined; }
                    })(),
                    notes: i.nota_item || ''
                }));
                const creado = await apiClient.createOrder(datosAPI, itemsAPI);
                // Solo marcar como sincronizado si el backend realmente creó/devolvió
                // el pedido (tiene id). Si no, se reintenta en el próximo ciclo.
                if (creado && creado.id) {
                    // Evitar que el polling del KDS reenvíe esta comanda: marcarla como
                    // ya enviada con el id que le asignó el backend.
                    if (typeof _kdsMarcarEnviado === 'function') {
                        _kdsMarcarEnviado(creado.id, creado.updatedAt, creado.items);
                    }
                    await window.api.marcarPedidoSincronizado(pedido.id);
                }
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
                    // El costo viaja con el insumo: sin él, la rentabilidad de
                    // este negocio nacería vacía en la nube (BLOQUE 12).
                    cost_per_unit: insumo.costo_unitario || 0,
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
