// ============================================
// MÓDULO: Administración de Productos y Categorías
// ============================================

// Variables de Administración
let productoEditandoId = null;
let categoriaEditandoId = null;
let rutaImagenTemporal = null;
let emojiSeleccionado = 'svg:package';

const EMOJIS_DISPONIBLES = [
    // Comida
    '🍔','🍕','🍟','🌭','🌮','🌯','🫔','🥙','🥪','🥗','🥩','🍖','🍗','🥓','🍳','🥚','🧆','🥘','🍲','🫕','🥣','🍿','🧈','🧂','🥫',
    '🍱','🍘','🍙','🍚','🍛','🍜','🍝','🍠','🍢','🍣','🍤','🍥','🥮','🍡','🥟','🥠','🥡',
    // Pan & Cereales
    '🍞','🥐','🥖','🫓','🥨','🥯','🥞','🧇','🧀',
    // Frutas
    '🍇','🍈','🍉','🍊','🍋','🍌','🍍','🥭','🍎','🍏','🍐','🍑','🍒','🍓','🫐','🥝','🥥',
    // Verduras
    '🍅','🥑','🍆','🥔','🥕','🌽','🌶️','🫑','🥒','🥬','🥦','🧄','🧅','🥜','🫘','🌰','🫒',
    // Postres & Dulces
    '🍦','🍧','🍨','🍩','🍪','🎂','🍰','🧁','🥧','🍫','🍬','🍭','🍮','🍯',
    // Bebidas
    '🥤','☕','🫖','🍵','🥛','🍼','🍺','🍻','🍷','🍸','🍹','🍾','🥂','🥃','🧋','🧃','🧉','🧊','🫗','🍶',
    // Restaurante
    '🍽️','🍴','🥄','🔪','🫙','🧑‍🍳','🧾','💳',
    // General
    '📦','🛒','🛍️','🏷️','🔥','⭐','✨','💡','✂️','📌','💰','🎉','❤️','👍','🏠','🚗','🛵','📱','📋','✅','⏰','🔔'
];

async function cargarProductosAdmin() {
    try {
        clasificaciones = await obtenerProductosAgrupadosWrapper();
        const contenedor = document.getElementById('lista-productos');

        if (!contenedor) return;

        const svgPencil = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;"><path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/><path d="m15 5 4 4"/></svg>';
        const svgTrash = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>';

        contenedor.innerHTML = clasificaciones.map(cat => `
            <div class="clasificacion-bloque">
                <div class="clasificacion-header">
                    <h3>
                        ${cat.imagen
                            ? `<img src="${srcImagen(cat.imagen)}" style="width: 30px; height: 30px; border-radius: 6px; object-fit: cover; margin-right: 8px; vertical-align: middle;">`
                            : `${renderIcono(cat.emoji || 'svg:package', 28)}`
                        }
                        ${esc(cat.nombre)}
                    </h3>
                    ${cat.id ? `
                        <div style="display:flex; gap:6px;">
                            <button class="btn-secondary small" title="Editar Categoría" onclick="editarCategoria(${cat.id})">${svgPencil}</button>
                            <button class="btn-secondary small" title="Eliminar Categoría" style="color:#ef4444;" onclick="eliminarCategoriaAdmin(${cat.id},'${esc(cat.nombre)}')">${svgTrash}</button>
                        </div>
                    ` : ''}
                </div>
                <div class="productos-grid">
                    ${cat.productos.length > 0 ? cat.productos.map(p => `
                        <div class="product-card">
                            <button class="btn-delete-prod" onclick="event.stopPropagation(); eliminarProductoAdmin(${p.id}, '${esc(p.nombre)}')" title="Eliminar Producto">
                                ${svgTrash}
                            </button>
                            <!-- Modificadores del producto (BLOQUE 11). Va en la
                                 tarjeta y no dentro del formulario de edición
                                 porque se engancha una vez y se cambia poco. -->
                            <button class="btn-mods-prod" onclick="event.stopPropagation(); abrirModificadoresDeProducto(${p.id}, '${esc(p.nombre)}')" title="Modificadores de este producto">
                                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;"><path d="M4 6h16"/><path d="M4 12h16"/><path d="M4 18h10"/></svg>
                            </button>
                            <div onclick="editarProducto(${p.id})">
                            <div class="product-visual">
                                ${p.imagen
                                    ? `<img src="${srcImagen(p.imagen)}" class="product-img-display" onerror="this.style.display='none';this.nextElementSibling.style.display=''"><span class="product-emoji" style="display:none">${renderIcono(p.emoji || 'svg:package', 35)}</span>`
                                    : `<span class="product-emoji">${renderIcono(p.emoji || 'svg:package', 35)}</span>`
                                }
                            </div>
                            <h4>${esc(p.nombre)}</h4>
                            <p class="precio">$${p.precio.toFixed(2)}</p>
                            </div>
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
    emojiSeleccionado = p ? p.emoji : 'svg:package';

    document.getElementById('prodNombre').value = p ? p.nombre : '';
    document.getElementById('prodDescripcion').value = p ? p.descripcion : '';
    document.getElementById('prodPrecio').value = p ? p.precio : '';
    document.getElementById('prodStock').value = p ? p.stock : '';
    document.getElementById('prodEmojiDisplay').innerHTML = renderIcono(emojiSeleccionado, 30);

    const cats = await window.api.obtenerClasificacionesRaw();
    const sel = document.getElementById('prodCategoria');
    sel.innerHTML = '<option value="">Sin Categoría</option>' +
        cats.map(c => `<option value="${c.id}" ${p && p.clasificacion_id==c.id ? 'selected':''}>${esc(c.nombre)}</option>`).join('');


// Resetear estado de imagen siempre al abrir
    rutaImagenTemporal = null;
    document.getElementById('prodImagenRuta').value = '';

    if (p && p.imagen) {
        // Producto existente CON imagen: mostrar imagen, ocultar emoji
        const preview = document.getElementById('prodImagenPreview');
        preview.src = srcImagen(p.imagen);
        preview.style.display = 'block';
        document.getElementById('prodEmojiDisplay').style.display = 'none';
        // Conservar la imagen existente si el usuario no elige otra
        document.getElementById('prodImagenRuta').value = p.imagen;
    } else {
        // Producto nuevo O existente sin imagen: mostrar emoji, ocultar imagen
        document.getElementById('prodImagenPreview').style.display = 'none';
        document.getElementById('prodImagenPreview').src = '';
        document.getElementById('prodEmojiDisplay').style.display = 'inline';
        document.getElementById('prodEmojiDisplay').innerHTML = renderIcono(emojiSeleccionado, 30);
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
        alertaZenit('Nombre y precio son obligatorios');
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
        alertaZenit('Error al guardar producto');
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
    emojiSeleccionado = (cat && cat.emoji) ? cat.emoji : 'svg:package';

    document.getElementById('catNombre').value = cat ? cat.nombre : '';
    document.getElementById('modalCatTitulo').innerText = cat ? 'Editar Categoría' : 'Nueva Categoría';

    // Resetear SIEMPRE el estado de imagen del modal (sin esto, la imagen de la
    // categoría anterior se quedaba pegada y se guardaba en la siguiente).
    const inputRuta = document.getElementById('catImagenRuta');
    const preview = document.getElementById('catImagenPreview');
    const emojiDisplay = document.getElementById('catEmojiDisplay');
    if (inputRuta) inputRuta.value = '';
    if (preview) { preview.src = ''; preview.style.display = 'none'; }
    if (emojiDisplay) {
        emojiDisplay.style.display = 'inline';
        emojiDisplay.innerHTML = renderIcono(emojiSeleccionado, 30);
    }

    // Si la categoría ya tiene imagen, mostrarla y conservarla al guardar
    if (cat && cat.imagen) {
        if (inputRuta) inputRuta.value = cat.imagen;
        if (preview) { preview.src = srcImagen(cat.imagen); preview.style.display = 'block'; }
        if (emojiDisplay) emojiDisplay.style.display = 'none';
    }

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
        alertaZenit('El nombre es obligatorio');
        return;
    }

    try {
        const datos = {
            nombre: nombre,
            emoji: imagenRuta ? '' : emojiSeleccionado,  // Si hay imagen, no usar emoji
            imagen: imagenRuta
        };

        // En modo conectado la categoría vive en la nube: guardarla ahí primero.
        // (Antes sólo se guardaba localmente y la siguiente sincronización
        // la pisaba con la versión de la nube — por eso la imagen "no cambiaba".)
        if (modoConectado && apiClient && tokenActual) {
            if (categoriaEditandoId) {
                await apiClient.updateCategory(categoriaEditandoId, { name: nombre, emoji: datos.emoji, image: datos.imagen || null });
            } else {
                const creada = await apiClient.createCategory({ name: nombre, emoji: datos.emoji, image: datos.imagen || null });
                categoriaEditandoId = creada?.id || null;
            }
        }

        // Copia local (cache offline). En modo conectado los IDs locales
        // coinciden con los de la nube gracias a syncClasificaciones.
        if (categoriaEditandoId) {
            datos.id = categoriaEditandoId;
            await window.api.editarClasificacion(datos).catch(() => {});
        } else {
            await window.api.agregarClasificacion(datos);
        }

        mostrarNotificacionExito('Categoría guardada', '¡Categoría Guardada!');
        cerrarModalCategoria();
        cargarProductosAdmin();
    } catch (e) {
        console.error(e);
        alertaZenit('Error al guardar categoría');
    }
}

/**
 * Borra un producto del catálogo (botón de la papelera en Productos).
 *
 * ⚠️ ESTA FUNCIÓN FALTABA. El botón la llamaba desde su `onclick` y no existía
 * en ningún archivo, así que borrar un producto no hacía absolutamente nada
 * (ReferenceError silencioso en la consola).
 *
 * El borrado es LÓGICO (`activo = 0`), no físico: los pedidos viejos siguen
 * apuntando a ese producto y su historial tiene que seguir leyéndose.
 */
async function eliminarProductoAdmin(id, nombre) {
    const ok = await confirmarZenit(
        `"${nombre}" dejará de aparecer en la pantalla de venta. Los pedidos que ya lo incluyen no se tocan.`,
        '¿Eliminar este producto?',
        { textoOk: 'Eliminar', textoCancelar: 'Cancelar', peligro: true }
    );
    if (!ok) return;

    try {
        await eliminarProductoWrapper(id);
        mostrarNotificacionExito(`"${nombre}" ya no aparece en la venta`, '¡Producto Eliminado!');
        cargarProductosAdmin();
    } catch (e) {
        console.error(e);
        alertaZenit('No se pudo eliminar el producto. ' + (e?.message || ''), 'Error');
    }
}

/**
 * Borra una categoría (botón de la papelera junto al nombre de la categoría).
 *
 * ⚠️ ESTA FUNCIÓN TAMBIÉN FALTABA — mismo caso que `eliminarProductoAdmin`.
 *
 * Los productos de la categoría NO se borran: se quedan sin categoría. Se avisa
 * en el diálogo, porque "eliminar categoría" suena a que se lleva todo dentro.
 */
async function eliminarCategoriaAdmin(id, nombre) {
    const categoria = clasificaciones.find(c => c.id === id);
    const cuantos = categoria?.productos?.length || 0;

    const detalle = cuantos > 0
        ? `Sus ${cuantos} producto${cuantos === 1 ? '' : 's'} NO se eliminan: quedan sin categoría y los puedes reasignar después.`
        : 'La categoría está vacía.';

    const ok = await confirmarZenit(
        `"${nombre}" dejará de aparecer. ${detalle}`,
        '¿Eliminar esta categoría?',
        { textoOk: 'Eliminar', textoCancelar: 'Cancelar', peligro: true }
    );
    if (!ok) return;

    try {
        await eliminarCategoriaWrapper(id);
        mostrarNotificacionExito(`"${nombre}" eliminada`, '¡Categoría Eliminada!');
        cargarProductosAdmin();
    } catch (e) {
        console.error(e);
        alertaZenit('No se pudo eliminar la categoría. ' + (e?.message || ''), 'Error');
    }
}

function editarCategoria(id) {
    // Buscar la categoría completa (incluida su imagen) en el cache ya cargado
    const cat = clasificaciones.find(c => c.id === id);
    if (cat) abrirModalCategoria({ id: cat.id, nombre: cat.nombre, emoji: cat.emoji, imagen: cat.imagen });
}
