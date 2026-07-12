// ============================================
// MÓDULO: Inventario (Insumos, Preparaciones, Recetas, Entradas, Salidas)
// ============================================

// ============================================
// MÓDULO DE INVENTARIO
// ============================================

let insumosCache = [];
let preparacionesCache = [];
let productosRecetaCache = [];
let insumoEditandoId = null;
let preparacionEditandoId = null;
let productoRecetaActual = null;

// Formatea un stock a máximo 2 decimales, sin ceros de sobra.
// Los consumos por receta dejan colas de precisión tipo 1.9999999925.
function fmtStock(val) {
    if (val === null || val === undefined) return '—';
    const n = parseFloat(val);
    if (isNaN(n)) return String(val);
    return String(Math.round(n * 100) / 100);
}

  async function cargarInventario() {
      try {
          // En modo conectado: sincronizar stock desde el backend primero,
          // usando branch_id para obtener el stock correcto de esta sucursal
          if (modoConectado && apiClient && tokenActual) {
              const branchQ = sucursalIdActual ? `?branch_id=${sucursalIdActual}` : '';
              const insumosBackend = await apiClient.getIngredients(branchQ).catch(() => null);
              if (insumosBackend && insumosBackend.length > 0) {
                  await window.api.syncInsumos(insumosBackend);
              }
          }
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
          if (modoConectado && apiClient && tokenActual) {
              await _sincronizarRecetasAlBackend();
          }
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
    if (tab === 'compras') cargarListaCompras();
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
            <td><strong>${esc(ins.nombre)}</strong></td>
            <td><span class="badge-info">${esc(ins.unidad)}</span></td>
            <td class="${ins.stock_actual <= 0 ? 'stock-cero' : ins.stock_actual <= ins.stock_minimo && ins.stock_minimo > 0 ? 'stock-bajo' : 'stock-ok'}">
                ${fmtStock(ins.stock_actual)} ${esc(ins.unidad)}
            </td>
            <td style="color:#6b7280;">${ins.stock_minimo > 0 ? fmtStock(ins.stock_minimo) + ' ' + esc(ins.unidad) : '—'}</td>
            <td><span class="${estadoClase}">${estadoBadge}</span></td>
            <td>
                <div style="display:flex; gap:6px;">
                    <button class="btn-secondary small" onclick="editarInsumo(${ins.id})" style="display:inline-flex;align-items:center;gap:4px;">
                        <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/><path d="m15 5 4 4"/></svg>
                        Editar
                    </button>
                    <button class="btn-secondary small" onclick="confirmarEliminarInsumo(${ins.id}, '${esc(ins.nombre)}')" style="color:#ef4444; display:inline-flex;align-items:center;gap:4px;">
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
    const stockEl = document.getElementById('ins-stock');
    stockEl.value = ins ? ins.stock_actual : '';
    stockEl.disabled = !!ins; // solo lectura al editar; usa Entradas/Salidas para cambiar el stock
    stockEl.style.background = ins ? '#f3f4f6' : '';
    stockEl.title = ins ? 'Para modificar el stock usa los registros de Entradas y Salidas' : '';
    let stockNota = document.getElementById('ins-stock-nota');
    if (ins && !stockNota) {
        stockNota = document.createElement('p');
        stockNota.id = 'ins-stock-nota';
        stockNota.style.cssText = 'font-size:0.78em;color:#6b7280;margin:2px 0 0;';
        stockNota.textContent = 'Modificable solo desde Entradas / Salidas';
        stockEl.parentNode.appendChild(stockNota);
    } else if (!ins && stockNota) {
        stockNota.remove();
    }
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
    if (!nombre) { alertaZenit('El nombre es obligatorio'); return; }
    try {
        const contenido_cantidad = parseFloat(document.getElementById('ins-contenido-cantidad').value) || null;
        const contenido_unidad = document.getElementById('ins-contenido-unidad').value || null;
        // Al editar, preservar el stock_actual real desde el caché (no permitir sobreescribirlo desde el form)
        const stockActualReal = insumoEditandoId
            ? (insumosCache.find(i => i.id === insumoEditandoId)?.stock_actual ?? 0)
            : stock_actual;
        const datos    = { nombre, unidad, stock_actual: stockActualReal, stock_minimo, contenido_cantidad, contenido_unidad };
        const datosAPI = insumoEditandoId
            ? { name: nombre, unit: unidad, min_stock: stock_minimo, content_amount: contenido_cantidad, content_unit: contenido_unidad }
            : { name: nombre, unit: unidad, stock: stock_actual, min_stock: stock_minimo, content_amount: contenido_cantidad, content_unit: contenido_unidad };
        if (modoConectado && apiClient && tokenActual) {
            if (insumoEditandoId) {
                await apiClient.request(`/inventory/ingredients/${insumoEditandoId}`, { method: 'PUT', body: datosAPI });
                await window.api.actualizarInsumo(insumoEditandoId, datos);
            } else {
                const nuevo = await apiClient.request('/inventory/ingredients', { method: 'POST', body: datosAPI });
                await window.api.agregarInsumoConId(nuevo.id, datos);
            }
        } else {
            if (insumoEditandoId) {
                await window.api.actualizarInsumo(insumoEditandoId, datos);
            } else {
                await window.api.agregarInsumo(datos);
            }
        }
        cerrarModalInsumo();
        insumosCache = await window.api.obtenerInsumos();
        renderizarTablaInsumos();
        mostrarNotificacionExito('Insumo guardado', '¡Guardado!');
    } catch (e) { console.error(e); alertaZenit('Error al guardar el insumo'); }
}

function editarInsumo(id) {
    const ins = insumosCache.find(i => i.id === id);
    if (ins) abrirModalInsumo(ins);
}

async function confirmarEliminarInsumo(id, nombre) {
    if (await confirmarZenit(`El insumo "${nombre}" se eliminará de todas las preparaciones y recetas donde aparezca.`, '¿Eliminar insumo?', { textoOk: 'Eliminar', peligro: true })) {
        if (modoConectado && apiClient && tokenActual) {
            try { await apiClient.request(`/inventory/ingredients/${id}`, { method: 'DELETE' }); }
            catch (e) { console.warn('No se pudo eliminar insumo en backend:', e.message); }
        }
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
        <td><strong>${esc(prep.nombre)}</strong></td>
        <td style="color:#6b7280;">${esc(prep.descripcion || '—')}</td>
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
                <button class="btn-secondary small" onclick="confirmarEliminarPreparacion(${prep.id}, '${esc(prep.nombre)}')" style="color:#ef4444; display:inline-flex;align-items:center;gap:4px;">
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
        `<option value="insumo_${i.id}" ${itemExistente && itemExistente.insumo_id === i.id ? 'selected' : ''}>${i.nombre} (${i.unidad})</option>`
    ).join('');
    div.innerHTML = `
        <select class="sel-ingrediente">${insumosCache.length ? opcionesInsumos : '<option value="">— Sin insumos —</option>'}</select>
        <input type="number" placeholder="Cantidad" min="0" step="0.01" value="${itemExistente ? itemExistente.cantidad : ''}">
        <select class="sel-unidad-receta" style="flex:1; min-width:60px;"></select>
        <button class="btn-quitar" onclick="this.parentElement.remove()" title="Quitar">
            <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 11v6"/><path d="M14 11v6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
        </button>
    `;
    lista.appendChild(div);
    const selIngrediente = div.querySelector('.sel-ingrediente');
    selIngrediente.addEventListener('change', () => actualizarUnidadReceta(selIngrediente));
    actualizarUnidadReceta(selIngrediente, itemExistente ? itemExistente.unidad_receta : null);
}

async function guardarPreparacion() {
    const nombre = document.getElementById('prep-nombre').value.trim();
    if (!nombre) { alertaZenit('El nombre es obligatorio'); return; }
    const items = [];
    document.querySelectorAll('#prep-items-lista .receta-linea').forEach(linea => {
        const sel = linea.querySelector('.sel-ingrediente');
        const inp = linea.querySelector('input[type="number"]');
        const selUnidad = linea.querySelector('.sel-unidad-receta');
        if (sel && sel.value && inp && inp.value) {
            const insumoId = parseInt(sel.value.replace('insumo_', ''));
            const unidad_receta = (selUnidad && selUnidad.value && selUnidad.value !== '—') ? selUnidad.value : null;
            items.push({ insumo_id: insumoId, cantidad: parseFloat(inp.value), unidad_receta });
        }
    });
    try {
        const datos = { nombre, descripcion: document.getElementById('prep-descripcion').value.trim() };
        if (modoConectado && apiClient && tokenActual) {
            const itemsAPI = items.map(i => ({ ingredient_id: i.insumo_id, quantity: i.cantidad, unit_recipe: i.unidad_receta || null }));
            if (preparacionEditandoId) {
                await apiClient.request(`/inventory/preparations/${preparacionEditandoId}`, { method: 'PUT', body: { name: nombre } });
                if (itemsAPI.length > 0) await apiClient.request(`/inventory/preparations/${preparacionEditandoId}/recipe`, { method: 'POST', body: { items: itemsAPI } });
                await window.api.actualizarPreparacion(preparacionEditandoId, datos);
                await window.api.guardarItemsPreparacion(preparacionEditandoId, items);
            } else {
                const nueva = await apiClient.request('/inventory/preparations', { method: 'POST', body: { name: nombre, unit: 'porcion', yield_quantity: 1 } });
                if (itemsAPI.length > 0) await apiClient.request(`/inventory/preparations/${nueva.id}/recipe`, { method: 'POST', body: { items: itemsAPI } });
                await window.api.agregarPreparacionConId(nueva.id, datos);
                await window.api.guardarItemsPreparacion(nueva.id, items);
            }
        } else {
            if (preparacionEditandoId) {
                await window.api.actualizarPreparacion(preparacionEditandoId, datos);
                await window.api.guardarItemsPreparacion(preparacionEditandoId, items);
            } else {
                await window.api.agregarPreparacion(datos);
                const preps = await window.api.obtenerPreparaciones();
                const nueva = preps[preps.length - 1];
                await window.api.guardarItemsPreparacion(nueva.id, items);
            }
        }
        cerrarModalPreparacion();
        preparacionesCache = await window.api.obtenerPreparaciones();
        renderizarTablaPreparaciones();
        mostrarNotificacionExito('Preparación guardada', '¡Guardado!');
    } catch (e) { console.error(e); alertaZenit('Error al guardar la preparación'); }
}

async function editarPreparacion(id) {
    const prep = preparacionesCache.find(p => p.id === id);
    if (prep) abrirModalPreparacion(prep);
}

async function confirmarEliminarPreparacion(id, nombre) {
    if (await confirmarZenit(`Se eliminará la preparación "${nombre}".`, '¿Eliminar preparación?', { textoOk: 'Eliminar', peligro: true })) {
        if (modoConectado && apiClient && tokenActual) {
            try { await apiClient.request(`/inventory/preparations/${id}`, { method: 'DELETE' }); }
            catch (e) { console.warn('No se pudo eliminar preparación en backend:', e.message); }
        }
        await window.api.eliminarPreparacion(id);
        preparacionesCache = await window.api.obtenerPreparaciones();
        renderizarTablaPreparaciones();
        mostrarNotificacionExito('Preparación eliminada', '¡Eliminado!');
    }
}

// --- RECETAS ---
async function renderizarTablaRecetas() {
    const tbody = document.getElementById('tabla-recetas');
    if (!productosRecetaCache.length) {
        tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; padding:30px; color:#9ca3af;">No hay productos en el menú.</td></tr>`;
        return;
    }

    const conReceta = [];
    for (const p of productosRecetaCache) {
        const count = await _obtenerConteoRecetaProducto(p.id);
        if (count > 0) conReceta.push({ p, count });
    }

    if (!conReceta.length) {
        tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; padding:30px; color:#9ca3af;">No hay recetas aún.</td></tr>`;
        return;
    }

    tbody.innerHTML = conReceta.map(({ p, count }) => `<tr>
        <td>
            <div style="display:flex; align-items:center; gap:8px;">
                <span>${renderIcono(p.emoji || 'svg:package', 18)}</span>
                <strong>${esc(p.nombre)}</strong>
            </div>
        </td>
        <td><span class="badge-info">${esc(p.categoria || '—')}</span></td>
        <td><span style="color:#6b7280; font-size:0.9em;">${count} ingrediente${count !== 1 ? 's' : ''}</span></td>
        <td style="display:flex; gap:6px; align-items:center;">
            <button class="btn-secondary small" onclick="abrirModalReceta(${p.id}, '${esc(p.nombre)}')" style="display:inline-flex;align-items:center;gap:4px;">
                <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/><path d="m15 5 4 4"/></svg>
                Editar receta
            </button>
            <button class="btn-danger small" onclick="eliminarReceta(${p.id}, '${esc(p.nombre)}')" style="display:inline-flex; align-items:center; gap:4px;">
                <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>
                Eliminar
            </button>
        </td>
    </tr>`).join('');
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

  async function eliminarReceta(productoId, nombreProducto) {
      if (!(await confirmarZenit(`Se eliminará la receta de "${nombreProducto}". Podrás crearla de nuevo cuando quieras.`, '¿Eliminar receta?', { textoOk: 'Eliminar', peligro: true }))) return;
      try {
          await window.api.eliminarRecetaProducto(productoId);
          if (modoConectado && apiClient && tokenActual) {
              const backendProdId = await _resolverProductoBackendId(productoId);
              if (backendProdId) {
                  await apiClient.request(`/inventory/products/${backendProdId}/recipe`, { method: 'DELETE' })
                      .catch(e => console.warn('No se pudo eliminar receta en backend:', e.message));
              } else {
                  console.warn('No se pudo resolver ID de producto en backend para borrar receta.');
              }
          }
          await renderizarTablaRecetas?.();
      } catch(e) {
          alertaZenit('Error al eliminar la receta: ' + e.message);
      }
}

function agregarLineaReceta(itemExistente = null) {
    const lista = document.getElementById('receta-items-lista');
    const div = document.createElement('div');
    div.className = 'receta-linea';

    const tipoInsumo = itemExistente && (itemExistente.tipo === 'insumo' || itemExistente.tipo === 'ingredient');
    const tipoPrep = itemExistente && (itemExistente.tipo === 'preparacion' || itemExistente.tipo === 'preparation');
    const opcionesInsumos = insumosCache.map(i =>
        `<option value="insumo_${i.id}" ${tipoInsumo && itemExistente.referencia_id === i.id ? 'selected' : ''}>🧂 ${i.nombre} (${i.unidad})</option>`
    ).join('');
    const opcionesPrep = preparacionesCache.map(p =>
        `<option value="preparacion_${p.id}" ${tipoPrep && itemExistente.referencia_id === p.id ? 'selected' : ''}>🧪 ${p.nombre}</option>`
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
    // Forzar el valor del select explícitamente (el atributo 'selected' en innerHTML
    // puede no estar aplicado aún cuando JS lee .value en el mismo tick)
    if (itemExistente) {
        const prefix = tipoInsumo ? 'insumo' : 'preparacion';
        selIngrediente.value = `${prefix}_${itemExistente.referencia_id}`;
    }
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
            label += ` (1 ${esc(insumo.unidad)} = ${insumo.contenido_cantidad}${u})`;
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
          if (modoConectado && apiClient && tokenActual) {
              try {
                  const itemsAPI = items.map(i => ({ item_type: (i.tipo === 'insumo' || i.tipo === 'ingrediente' || i.tipo === 'ingredient') ? 'ingredient' : 'preparation', item_id: i.referencia_id, quantity: i.cantidad, unit_recipe: i.unidad_receta || null }));
                  const backendProdId = await _resolverProductoBackendId(productoRecetaActual);
                  if (backendProdId) {
                      await apiClient.request(`/inventory/products/${backendProdId}/recipe`, { method: 'POST', body: { items: itemsAPI } });
                  } else {
                      console.warn('No se pudo resolver ID de producto en backend para guardar receta.');
                  }
              } catch (e) { console.warn('No se pudo guardar receta en backend:', e.message); }
          }
        await window.api.guardarRecetaProducto(productoRecetaActual, items);
        cerrarModalReceta();
        renderizarTablaRecetas();
        mostrarNotificacionExito('Receta guardada', '¡Guardado!');
    } catch (e) { alertaZenit('Error al guardar la receta'); }
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
        let entradas;
        if (modoConectado && apiClient && tokenActual) {
            const movs = await apiClient.getMovements({ type: 'entrada' }).catch(() => null);
            entradas = (movs || []).map(m => ({
                insumo_nombre: m.ingredient?.name || '—',
                cantidad: m.quantity,
                unidad: m.ingredient?.unit || '',
                notas: m.notes || '',
                fecha: m.createdAt,
            }));
        } else {
            entradas = await window.api.obtenerEntradasInsumo(null);
        }
        if (!entradas.length) {
            tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding:30px; color:#9ca3af;">Aún no hay entradas registradas. Usa "+ Registrar Entrada" para iniciar el historial.</td></tr>';
            return;
        }
        tbody.innerHTML = entradas.map(e => {
            const fecha = new Date(String(e.fecha).replace(' ', 'T')).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' });
            return `<tr>
                <td><strong>${esc(e.insumo_nombre)}</strong></td>
                <td><span style="color:#10b981; font-weight:600;">+${e.cantidad} ${esc(e.unidad)}</span></td>
                <td style="color:#6b7280;">${esc(e.notas || '—')}</td>
                <td style="color:#9ca3af; font-size:0.9em;">${fecha}</td>
            </tr>`;
        }).join('');
    } catch(e) { console.error(e); }
}

function abrirModalEntrada() {
    const select = document.getElementById('entrada-insumo-id');
    select.innerHTML = insumosCache.map(i => `<option value="${i.id}">${esc(i.nombre)} (${esc(i.unidad)}) — Stock actual: ${fmtStock(i.stock_actual)}</option>`).join('');
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
    if (!insumo_id || !cantidad || cantidad <= 0) { alertaZenit('Selecciona un insumo y escribe una cantidad válida.'); return; }
    try {
        await window.api.registrarEntradaInsumo({ insumo_id, cantidad, notas });
        if (modoConectado && apiClient && tokenActual) {
            await apiClient.createMovement({ ingredient_id: insumo_id, type: 'entrada', quantity: cantidad, notes: notas || undefined, branch_id: sucursalIdActual || undefined })
                .catch(e => console.warn('No se pudo sincronizar entrada al backend:', e.message));
            // Resincronizar inventario desde backend (con branch_id) para mostrar stock correcto por sucursal
            await _actualizarInventarioDesdeBackend();
        } else {
            insumosCache = await window.api.obtenerInsumos();
            renderizarTablaInsumos();
            renderizarTablaPreparaciones();
        }
        cerrarModalEntrada();
        cargarTablaEntradas();
        mostrarNotificacionExito(`+${cantidad} registrado correctamente`, '¡Entrada Registrada!');
    } catch(e) { alertaZenit('Error al registrar la entrada'); }
}

// ============================================
// INVENTARIO — SALIDAS DE INSUMOS
// ============================================

async function cargarTablaSalidas() {
    const tbody = document.getElementById('tabla-salidas');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:20px; color:#9ca3af;">Cargando...</td></tr>';
    try {
        let salidas;
        const motivos = { merma:'Merma', caducidad:'Caducidad', accidente:'Accidente', robo:'Pérdida/Robo', ajuste:'Ajuste', otro:'Otro' };
        if (modoConectado && apiClient && tokenActual) {
            const movs = await apiClient.getMovements({ type: 'salida' }).catch(() => null);
            salidas = (movs || []).map(m => ({
                insumo_nombre: m.ingredient?.name || '—',
                cantidad: m.quantity,
                unidad: m.ingredient?.unit || '',
                motivo: m.reason || '',
                notas: m.notes || '',
                fecha: m.createdAt,
            }));
        } else {
            salidas = await window.api.obtenerSalidasInsumo(null);
        }
        if (!salidas.length) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:30px; color:#9ca3af;">Sin salidas registradas.</td></tr>';
            return;
        }
        tbody.innerHTML = salidas.map(s => {
            const fecha = new Date(String(s.fecha).replace(' ','T')).toLocaleString('es-MX', { dateStyle:'short', timeStyle:'short' });
            return `<tr>
                <td><strong>${esc(s.insumo_nombre)}</strong></td>
                <td><span style="color:#ef4444; font-weight:600;">−${s.cantidad} ${esc(s.unidad)}</span></td>
                <td><span class="badge-info">${motivos[s.motivo] || esc(s.motivo) || '—'}</span></td>
                <td style="color:#6b7280;">${esc(s.notas || '—')}</td>
                <td style="color:#9ca3af; font-size:0.9em;">${fecha}</td>
            </tr>`;
        }).join('');
    } catch(e) { console.error(e); }
}

function abrirModalSalida() {
    const select = document.getElementById('salida-insumo-id');
    select.innerHTML = insumosCache.map(i =>
        `<option value="${i.id}">${esc(i.nombre)} (${esc(i.unidad)}) — Stock: ${fmtStock(i.stock_actual)}</option>`
    ).join('');
    document.getElementById('salida-cantidad').value = '';
    document.getElementById('salida-notas').value = '';
    document.getElementById('modal-salida').classList.remove('hidden');
}

function cerrarModalSalida() {
    document.getElementById('modal-salida').classList.add('hidden');
}

async function _guardarSalidaBase() {
    const insumo_id = parseInt(document.getElementById('salida-insumo-id').value);
    const cantidad = parseFloat(document.getElementById('salida-cantidad').value);
    const motivo = document.getElementById('salida-motivo').value;
    const notas = document.getElementById('salida-notas').value.trim();
    if (!insumo_id || !cantidad || cantidad <= 0) { alertaZenit('Selecciona un insumo y escribe una cantidad válida.'); return; }
    try {
        await window.api.registrarSalidaInsumo({ insumo_id, cantidad, motivo, notas });
        if (modoConectado && apiClient && tokenActual) {
            await apiClient.createMovement({ ingredient_id: insumo_id, type: 'salida', quantity: cantidad, reason: motivo, notes: notas || undefined, branch_id: sucursalIdActual || undefined })
                .catch(e => console.warn('No se pudo sincronizar salida al backend:', e.message));
            // Resincronizar inventario desde backend (con branch_id) para mostrar stock correcto por sucursal
            await _actualizarInventarioDesdeBackend();
        } else {
            insumosCache = await window.api.obtenerInsumos();
            renderizarTablaInsumos();
            renderizarTablaPreparaciones();
        }
        cerrarModalSalida();
        cargarTablaSalidas();
        mostrarNotificacionExito(`−${cantidad} registrado`, '¡Salida Registrada!');
    } catch(e) { alertaZenit('Error al registrar la salida'); }
}

// ============================================

// --- Integración: Ajuste de inventario con PIN ---
async function guardarSalida() {
    const motivo = document.getElementById('salida-motivo')?.value;
    if (motivo === 'ajuste' && modoConectado && apiClient && tokenActual) {
        const insumo_id = parseInt(document.getElementById('salida-insumo-id').value);
        const cantidad  = parseFloat(document.getElementById('salida-cantidad').value);
        const notas     = document.getElementById('salida-notas').value.trim();
        if (!insumo_id || !cantidad || cantidad <= 0) { alertaZenit('Selecciona un insumo y escribe una cantidad válida.'); return; }

        pedirPinEmpleado(
            `Ajuste manual de inventario. Esta acción quedará registrada. Ingresa tu PIN para confirmar.`,
            async (employeeId, pin, employeeName, employeeRole) => {
                try {
                    await window.api.registrarSalidaInsumo({ insumo_id, cantidad, motivo, notas });
                    const movData = { ingredient_id: insumo_id, type: 'ajuste', quantity: cantidad, reason: motivo, notes: notas || undefined, branch_id: sucursalIdActual || undefined };
                    if (employeeId) {
                        await apiClient.createMovementWithPin(movData, employeeId, null, employeeName || '').catch(() => {});
                    } else {
                        await apiClient.createMovement(movData).catch(() => {});
                    }
                    await _actualizarInventarioDesdeBackend().catch(() => {});
                    cerrarModalSalida();
                    cargarTablaSalidas();
                    mostrarNotificacionExito('Ajuste registrado', '¡Ajuste Registrado!');
                } catch(e) {
                    alertaZenit('Error al registrar ajuste: ' + (e.message || 'Error'));
                }
            }
        );
        return;
    }
    return _guardarSalidaBase();
}

// ============================================
// LISTA DE COMPRAS
// ============================================

let listaComprasActual = null; // { id, items: [...] }

// Requiere estar conectado a la cuenta (la lista vive en la nube).
function _comprasRequiereConexion() {
    const cont = document.getElementById('lista-compras-items');
    const vacia = document.getElementById('lista-compras-vacia');
    const acciones = document.getElementById('lista-compras-acciones');
    if (!modoConectado || !apiClient || !tokenActual) {
        if (cont) cont.innerHTML = `<div style="text-align:center; padding:40px 20px; color:#9ca3af;">
            <p style="font-size:0.95em;">La lista de compras necesita tu cuenta Zenit.</p>
            <p style="font-size:0.82em;">Inicia sesión desde Ajustes para usar esta función.</p></div>`;
        if (vacia) vacia.style.display = 'none';
        if (acciones) acciones.style.display = 'none';
        return true;
    }
    return false;
}

async function cargarListaCompras() {
    if (_comprasRequiereConexion()) return;
    try {
        listaComprasActual = await apiClient.getShoppingList(sucursalIdActual);
        renderizarListaCompras();
    } catch (e) {
        console.error('Error al cargar lista de compras:', e);
        alertaZenit('No se pudo cargar la lista de compras.');
    }
}

function renderizarListaCompras() {
    const cont = document.getElementById('lista-compras-items');
    const vacia = document.getElementById('lista-compras-vacia');
    const acciones = document.getElementById('lista-compras-acciones');
    if (!cont) return;

    const items = listaComprasActual?.items || [];
    if (items.length === 0) {
        cont.innerHTML = '';
        if (vacia) vacia.style.display = 'block';
        if (acciones) acciones.style.display = 'none';
        return;
    }
    if (vacia) vacia.style.display = 'none';
    if (acciones) acciones.style.display = 'block';

    cont.innerHTML = items.map(it => {
        let contexto = '';
        if (it.current_stock !== null && it.current_stock !== undefined) {
            const min = (it.min_stock !== null && it.min_stock !== undefined) ? `, mín ${fmtStock(it.min_stock)}` : '';
            contexto = `<span style="color:#9ca3af; font-size:0.82em;"> — hay ${fmtStock(it.current_stock)} ${esc(it.unit || '')}${min}</span>`;
        }
        const cant = it.quantity_text ? `<span style="color:#6b7280; font-size:0.85em; margin-left:6px;">(${esc(it.quantity_text)})</span>` : '';
        const tachado = it.checked ? 'text-decoration:line-through; color:#9ca3af;' : 'color:#111827;';
        return `<div style="display:flex; align-items:center; gap:10px; padding:10px 12px; background:#fff; border:1px solid #e5e7eb; border-radius:10px;">
            <input type="checkbox" ${it.checked ? 'checked' : ''} onchange="toggleItemCompra(${it.id}, this.checked)" style="width:18px; height:18px; cursor:pointer; flex-shrink:0;">
            <div style="flex:1; min-width:0; ${tachado}">
                <span style="font-weight:600;">${esc(it.name)}</span>${cant}${contexto}
            </div>
            <button onclick="eliminarItemCompra(${it.id})" title="Quitar" style="border:none; background:none; color:#ef4444; cursor:pointer; padding:4px; flex-shrink:0;">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
            </button>
        </div>`;
    }).join('');
}

async function toggleItemCompra(id, checked) {
    try {
        await apiClient.updateShoppingItem(id, { checked });
        const it = listaComprasActual?.items?.find(i => i.id === id);
        if (it) it.checked = checked;
        renderizarListaCompras();
    } catch (e) {
        alertaZenit('No se pudo actualizar el artículo.');
    }
}

async function eliminarItemCompra(id) {
    try {
        await apiClient.deleteShoppingItem(id);
        if (listaComprasActual) listaComprasActual.items = listaComprasActual.items.filter(i => i.id !== id);
        renderizarListaCompras();
    } catch (e) {
        alertaZenit('No se pudo quitar el artículo.');
    }
}

async function generarListaComprasAuto() {
    if (_comprasRequiereConexion()) return;
    try {
        const resultado = await apiClient.generateShoppingList(sucursalIdActual);
        listaComprasActual = resultado;
        renderizarListaCompras();
        const n = resultado.agregados || 0;
        if (n > 0) {
            mostrarNotificacionExito(`Se agregaron ${n} insumo(s) bajo(s) de stock`, 'Lista generada');
        } else {
            mostrarNotificacionExito('No hay insumos por debajo de su mínimo', 'Todo en orden');
        }
    } catch (e) {
        alertaZenit('No se pudo generar la lista automática.');
    }
}

async function vaciarListaCompras() {
    if (!(await confirmarZenit('Se quitarán todos los artículos de la lista actual.', '¿Vaciar la lista?', { textoOk: 'Vaciar', peligro: true }))) return;
    try {
        await apiClient.clearShoppingList(sucursalIdActual);
        if (listaComprasActual) listaComprasActual.items = [];
        renderizarListaCompras();
    } catch (e) {
        alertaZenit('No se pudo vaciar la lista.');
    }
}

// --- Modal: agregar manual ---
function abrirModalAgregarManual() {
    let modal = document.getElementById('modal-compra-manual');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'modal-compra-manual';
        modal.style.cssText = 'position:fixed; inset:0; background:rgba(17,24,39,0.55); z-index:10000; display:flex; align-items:center; justify-content:center; padding:20px;';
        document.body.appendChild(modal);
    }
    modal.innerHTML = `
        <div style="background:#fff; border-radius:14px; padding:24px; max-width:420px; width:100%; box-shadow:0 20px 60px rgba(0,0,0,0.3);">
            <div style="font-size:1.15em; font-weight:700; color:#111827; margin-bottom:16px;">Agregar artículo manual</div>
            <label style="display:block; font-size:0.82em; font-weight:600; color:#6b7280; margin-bottom:4px;">ARTÍCULO</label>
            <input id="compra-manual-nombre" type="text" placeholder="Ej: Servilletas, bolsas..." style="width:100%; padding:10px 12px; border:1px solid #d1d5db; border-radius:8px; margin-bottom:12px;">
            <label style="display:block; font-size:0.82em; font-weight:600; color:#6b7280; margin-bottom:4px;">CANTIDAD (opcional)</label>
            <input id="compra-manual-cantidad" type="text" placeholder="Ej: 2 paquetes, media caja..." style="width:100%; padding:10px 12px; border:1px solid #d1d5db; border-radius:8px; margin-bottom:20px;">
            <div style="display:flex; gap:10px; justify-content:flex-end;">
                <button class="btn-secondary" onclick="document.getElementById('modal-compra-manual').remove()">Cancelar</button>
                <button class="btn-primary" onclick="guardarCompraManual()">Agregar</button>
            </div>
        </div>`;
    setTimeout(() => document.getElementById('compra-manual-nombre')?.focus(), 50);
}

async function guardarCompraManual() {
    const nombre = document.getElementById('compra-manual-nombre')?.value?.trim();
    const cantidad = document.getElementById('compra-manual-cantidad')?.value?.trim();
    if (!nombre) { document.getElementById('compra-manual-nombre')?.focus(); return; }
    try {
        const item = await apiClient.addShoppingItem({ branch_id: sucursalIdActual || null, name: nombre, quantity_text: cantidad || null, source: 'manual' });
        if (!listaComprasActual) listaComprasActual = { items: [] };
        listaComprasActual.items.push(item);
        renderizarListaCompras();
        document.getElementById('modal-compra-manual')?.remove();
    } catch (e) {
        alertaZenit('No se pudo agregar el artículo.');
    }
}

// --- Modal: agregar del inventario ---
async function abrirModalAgregarDelInventario() {
    if (_comprasRequiereConexion()) return;
    let opciones = [];
    try {
        opciones = await apiClient.getShoppingInventoryOptions(sucursalIdActual);
    } catch (e) {
        alertaZenit('No se pudieron cargar los insumos.');
        return;
    }
    const yaEnLista = new Set((listaComprasActual?.items || []).filter(i => i.ingredient_id).map(i => i.ingredient_id));
    const disponibles = opciones.filter(o => !yaEnLista.has(o.ingredient_id));

    let modal = document.getElementById('modal-compra-inventario');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'modal-compra-inventario';
        modal.style.cssText = 'position:fixed; inset:0; background:rgba(17,24,39,0.55); z-index:10000; display:flex; align-items:center; justify-content:center; padding:20px;';
        document.body.appendChild(modal);
    }
    const filas = disponibles.length === 0
        ? `<div style="text-align:center; padding:30px; color:#9ca3af;">Todos los insumos ya están en la lista.</div>`
        : disponibles.map(o => `
            <div style="display:flex; align-items:center; gap:10px; padding:9px 10px; border-bottom:1px solid #f3f4f6;">
                <div style="flex:1; min-width:0;">
                    <div style="font-weight:600; color:#111827;">${esc(o.name)}</div>
                    <div style="color:#9ca3af; font-size:0.8em;">hay ${fmtStock(o.current_stock)} ${esc(o.unit || '')}${o.min_stock ? `, mín ${fmtStock(o.min_stock)}` : ''}</div>
                </div>
                <button class="btn-secondary small" onclick="agregarInsumoALista(${o.ingredient_id}, '${esc(o.name).replace(/'/g, "\\'")}', this)">Agregar</button>
            </div>`).join('');

    modal.innerHTML = `
        <div style="background:#fff; border-radius:14px; padding:20px; max-width:460px; width:100%; max-height:80vh; display:flex; flex-direction:column; box-shadow:0 20px 60px rgba(0,0,0,0.3);">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
                <div style="font-size:1.15em; font-weight:700; color:#111827;">Agregar del inventario</div>
                <button onclick="document.getElementById('modal-compra-inventario').remove()" style="border:none; background:none; font-size:1.3em; color:#9ca3af; cursor:pointer;">✕</button>
            </div>
            <input id="compra-inv-buscar" type="text" placeholder="Buscar insumo..." oninput="_filtrarInsumosModal(this.value)" style="width:100%; padding:9px 12px; border:1px solid #d1d5db; border-radius:8px; margin-bottom:10px;">
            <div id="compra-inv-lista" style="overflow-y:auto; flex:1;">${filas}</div>
        </div>`;
    setTimeout(() => document.getElementById('compra-inv-buscar')?.focus(), 50);
}

function _filtrarInsumosModal(texto) {
    const t = (texto || '').toLowerCase();
    document.querySelectorAll('#compra-inv-lista > div').forEach(fila => {
        const nombre = fila.querySelector('div > div')?.textContent?.toLowerCase() || '';
        fila.style.display = nombre.includes(t) ? '' : 'none';
    });
}

async function agregarInsumoALista(ingredientId, nombre, btn) {
    if (btn) { btn.disabled = true; btn.textContent = 'Agregado'; }
    try {
        const item = await apiClient.addShoppingItem({ branch_id: sucursalIdActual || null, name: nombre, ingredient_id: ingredientId, source: 'inventory' });
        if (!listaComprasActual) listaComprasActual = { items: [] };
        listaComprasActual.items.push(item);
        renderizarListaCompras();
        if (btn) { const fila = btn.closest('div[style*="border-bottom"]'); if (fila) fila.style.display = 'none'; }
    } catch (e) {
        if (btn) { btn.disabled = false; btn.textContent = 'Agregar'; }
        alertaZenit('No se pudo agregar el insumo.');
    }
}

// --- Enviar ---
// Nombre de la sucursal activa, leído del selector de ajustes (si existe).
function _nombreSucursalActual() {
    const sel = document.getElementById('aj-sucursal-id');
    if (sel && sel.value && sel.selectedOptions && sel.selectedOptions[0]) {
        return sel.selectedOptions[0].textContent;
    }
    return null;
}

function _construirTextoWhatsapp() {
    const items = listaComprasActual?.items || [];
    let titulo = '🛒 *Lista de compras*';
    const nombreSuc = _nombreSucursalActual();
    if (nombreSuc) titulo += ` — ${nombreSuc}`;
    const lineas = items.map(it => {
        const marca = it.checked ? '✅' : '◻️';
        let linea = `${marca} ${it.name}`;
        if (it.quantity_text) linea += ` (${it.quantity_text})`;
        else if (it.current_stock !== null && it.current_stock !== undefined) {
            linea += ` — hay ${fmtStock(it.current_stock)} ${it.unit || ''}`;
            if (it.min_stock) linea += `, mín ${fmtStock(it.min_stock)}`;
        }
        return linea;
    });
    return `${titulo}\n\n${lineas.join('\n')}`;
}

async function enviarListaWhatsapp() {
    const items = listaComprasActual?.items || [];
    if (items.length === 0) { alertaZenit('La lista está vacía.'); return; }
    const texto = _construirTextoWhatsapp();
    const url = `https://wa.me/?text=${encodeURIComponent(texto)}`;
    try {
        await window.api.abrirEnNavegador(url);
    } catch (e) {
        alertaZenit('No se pudo abrir WhatsApp.');
    }
}

async function enviarListaAlAdmin() {
    const items = listaComprasActual?.items || [];
    if (items.length === 0) { alertaZenit('La lista está vacía.'); return; }
    if (!(await confirmarZenit('Se enviará la lista al administrador con una notificación a su teléfono, y se archivará para empezar una nueva.', '¿Enviar al administrador?', { textoOk: 'Enviar' }))) return;
    try {
        await apiClient.sendShoppingList(sucursalIdActual, nombreActivo || '');
        listaComprasActual = { items: [] };
        renderizarListaCompras();
        mostrarNotificacionExito('El administrador recibió la lista', 'Lista enviada');
    } catch (e) {
        alertaZenit('No se pudo enviar la lista: ' + (e.message || 'Error'));
    }
}
