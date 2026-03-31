// ============================================
// MÓDULO: Administración de Productos y Categorías
// ============================================

// Variables de Administración
let productoEditandoId = null;
let categoriaEditandoId = null;
let rutaImagenTemporal = null;
let emojiSeleccionado = '📦';

const EMOJIS_DISPONIBLES = [
    '🍔','🍕','🍟','🌭','🌮','🌯','🥙','🥪','🥗','🥩','🍗','🥓','🥖','🥯','🥞','🧇','🧀','🍞',
    '🥤','☕','🍵','🥛','🍺','🍷','🍹','🍸','🍾','🧊','🍩','🍪','🎂','🍰','🧁','🥧','🍫','🍬','🍭','🍮',
    '🍅','🥒','🥬','🥦','🥕','🌽','🌶️','🥔','🍇','🍈','🍉','🍊','🍋','🍌','🍍','🍎','🍏','🍐','🍑','🍒','🍓',
    '📦','🛒','🛍️','🏷️','🔥','⭐','✨','💡','🖍️','🖊️','✂️','📌'
];

async function cargarProductosAdmin() {
    try {
        clasificaciones = await obtenerProductosAgrupadosWrapper();
        const contenedor = document.getElementById('lista-productos');

        if (!contenedor) return;

        contenedor.innerHTML = clasificaciones.map(cat => `
            <div class="clasificacion-bloque">
                <div class="clasificacion-header">
                    <h3>
                        ${cat.imagen
                            ? `<img src="file://${cat.imagen}" style="width: 30px; height: 30px; border-radius: 6px; object-fit: cover; margin-right: 8px; vertical-align: middle;">`
                            : `${esc(cat.emoji || '📦')}`
                        }
                        ${esc(cat.nombre)}
                    </h3>
                    ${cat.id ? `
                        <div>
                            <button class="btn-secondary small" onclick="editarCategoria(${cat.id},'${esc(cat.nombre)}','${esc(cat.emoji)}','${esc(cat.imagen || '')}')">✏️</button>
                        </div>
                    ` : ''}
                </div>
                <div class="productos-grid">
                    ${cat.productos.length > 0 ? cat.productos.map(p => `
                        <div class="product-card" onclick="editarProducto(${p.id})">
                            <div class="product-visual">
                                ${p.imagen
                                    ? `<img src="file://${p.imagen}" class="product-img-display" onerror="this.style.display='none';this.nextElementSibling.style.display=''"><span class="product-emoji" style="display:none">${esc(p.emoji || '📦')}</span>`
                                    : `<span class="product-emoji">${esc(p.emoji || '📦')}</span>`
                                }
                            </div>
                            <h4>${esc(p.nombre)}</h4>
                            <p class="precio">$${p.precio.toFixed(2)}</p>
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
        cats.map(c => `<option value="${c.id}" ${p && p.clasificacion_id==c.id ? 'selected':''}>${esc(c.nombre)}</option>`).join('');


// Resetear estado de imagen siempre al abrir
    rutaImagenTemporal = null;
    document.getElementById('prodImagenRuta').value = '';

    if (p && p.imagen) {
        // Producto existente CON imagen: mostrar imagen, ocultar emoji
        const preview = document.getElementById('prodImagenPreview');
        preview.src = 'file://' + p.imagen;
        preview.style.display = 'block';
        document.getElementById('prodEmojiDisplay').style.display = 'none';
    } else {
        // Producto nuevo O existente sin imagen: mostrar emoji, ocultar imagen
        document.getElementById('prodImagenPreview').style.display = 'none';
        document.getElementById('prodImagenPreview').src = '';
        document.getElementById('prodEmojiDisplay').style.display = 'inline';
        document.getElementById('prodEmojiDisplay').innerText = emojiSeleccionado;
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
        alert('Nombre y precio son obligatorios');
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
            datos.id = categoriaEditandoId;
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
