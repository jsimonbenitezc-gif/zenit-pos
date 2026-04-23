// ============================================
// MÓDULO: Clientes
// ============================================

async function cargarClientes() {
    const contenedor = document.getElementById('lista-clientes-body');
    if (!contenedor) return;

    try {
        // Obtener estadísticas y clientes
        const stats = await window.api.obtenerEstadisticasClientes();
        const clientes = await obtenerClientesWrapper();

        // Actualizar estadísticas
        document.getElementById('total-clientes-count').innerText = stats.totalClientes;
        document.getElementById('clientes-frecuentes').innerText = stats.clientesFrecuentes;
        document.getElementById('clientes-nuevos-mes').innerText = stats.clientesNuevos;

        // Renderizar Top 3 del mes
        const topLista = document.getElementById('top-clientes-lista');
        if (stats.topClientesMes.length === 0) {
            topLista.innerHTML = `
                <div style="text-align: center; padding: 40px 20px; color: #9ca3af;">
                    <div style="margin-bottom: 10px;">${svgIconHTML('bar-chart', 32, '#9ca3af')}</div>
                    <p style="font-size: 0.9em;">Aún no hay compras este mes</p>
                </div>
            `;
        } else {
            const medallas = [svgIconHTML('medal', 20, '#ca8a04'), svgIconHTML('medal', 20, '#94a3b8'), svgIconHTML('medal', 20, '#b45309')];
            topLista.innerHTML = stats.topClientesMes.map((cliente, index) => `
                <div class="top-cliente-item">
                    <div class="top-cliente-medal">${medallas[index] || ''}</div>
                    <div class="top-cliente-info">
                        <div class="top-cliente-nombre">${esc(cliente.nombre)}</div>
                        <div class="top-cliente-stats">
                            ${cliente.total_pedidos} ${cliente.total_pedidos === 1 ? 'compra' : 'compras'} • $${cliente.monto_total.toFixed(2)}
                        </div>
                    </div>
                    <div class="top-cliente-badge">${cliente.total_pedidos}</div>
                </div>
            `).join('');
        }

        // Si no hay clientes
        if (clientes.length === 0) {
            contenedor.innerHTML = `
                <tr>
                    <td colspan="6" style="text-align: center; padding: 40px;">
                        <div style="color: #9ca3af;">
                            <div style="margin-bottom: 10px;">${svgIconHTML('users', 48, '#9ca3af')}</div>
                            <p style="font-size: 1.1em; margin-bottom: 5px;">No hay clientes registrados</p>
                            <p style="font-size: 0.9em;">Agrega tu primer cliente usando el botón "Nuevo Cliente"</p>
                        </div>
                    </td>
                </tr>
            `;
            return;
        }

        // Renderizar tabla de clientes
        contenedor.innerHTML = '';
        clientes.forEach(c => {
            let fechaRegistro = 'N/A';
            if (c.fecha_registro) {
                const fecha = new Date(c.fecha_registro);
                if (!isNaN(fecha)) {
                    fechaRegistro = fecha.toLocaleDateString('es-MX', {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric'
                    });
                }
            }

            const fila = document.createElement('tr');
            fila.innerHTML = `
                <td>
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <strong style="color: #111827;">${esc(c.nombre)}</strong>
                        ${(c.total_compras || 0) >= 3 ? '<span style="color: #f59e0b;">' + svgIconHTML('star', 14, '#f59e0b') + '</span>' : ''}
                    </div>
                </td>
                <td>
                    <span style="color: #6b7280; display:flex; align-items:center; gap:4px;">${svgIconHTML('smartphone', 14, '#6b7280')} ${esc(c.telefono)}</span>
                </td>
                <td>
                    ${c.direccion
                        ? `<span style="color: #374151;">${esc(c.direccion)}</span>`
                        : '<span class="text-muted">Sin dirección</span>'}
                </td>
                <td>
                    <span style="font-weight: 600; color: #2563eb;">
                        ${c.total_compras || 0} ${(c.total_compras || 0) === 1 ? 'compra' : 'compras'}
                    </span>
                </td>
                <td>
                    <span style="color: #7c3aed; font-weight: 600; font-size: 0.88em; display:inline-flex; align-items:center; gap:3px;">${svgIconHTML('star', 14, '#7c3aed')} ${c.puntos || 0} pts</span>
                </td>
                <td>
                    <span style="color: #6b7280; font-size: 0.9em;">${fechaRegistro}</span>
                </td>
                  <td>
                    <div style="display: flex; gap: 5px;">
                        <button class="btn-secondary small" onclick="verDetalleCliente(${c.id})"             title="Ver Detalles">
                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2.062 12.348a1 1 0 010-.696 10.75 10.75 0 0119.876 0 1 1 0 010 .696 10.75 10.75 0 01-19.876 0"/><circle cx="12" cy="12" r="3"/></svg> Ver
                        </button>
                        <button class="btn-secondary small" onclick="editarCliente(${c.id})" title="Editar">
                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.174 6.812a1 1 0 00-3.986-3.987L3.842 16.174a2 2 0 00-.5.83l-1.321 4.352a.5.5 0 00.623.622l4.353-1.32a2 2 0 00.83-.497z"/></svg> Editar
                        </button>
                        <button class="btn-secondary small" onclick="confirmarEliminarCliente(${c.id}, '${esc(c.nombre)}')"
                                style="color: #ef4444;" title="Eliminar">
                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
                        </button>
                    </div>
                </td>
            `;
            contenedor.appendChild(fila);
        });

        // Configurar buscador
        configurarBuscadorClientes(clientes);

        // Cargar programa de fidelidad
        cargarProgramaFidelidad();

    } catch (err) {
        console.error("Error al cargar clientes:", err);
        contenedor.innerHTML = `
            <tr>
                <td colspan="6" style="text-align: center; padding: 40px; color: #ef4444;">
                    Error al cargar los clientes. Por favor intenta de nuevo.
                </td>
            </tr>
        `;
    }
}

// Función para el buscador de clientes
function configurarBuscadorClientes(clientes) {
    const inputBuscar = document.getElementById('buscar-cliente');
    if (!inputBuscar) return;

    inputBuscar.addEventListener('input', (e) => {
        const busqueda = e.target.value.toLowerCase().trim();
        const tbody = document.getElementById('lista-clientes-body');

        if (busqueda === '') {
            // Si no hay búsqueda, mostrar todos
            cargarClientes();
            return;
        }

        const clientesFiltrados = clientes.filter(c =>
            c.nombre.toLowerCase().includes(busqueda) ||
            c.telefono.includes(busqueda)
        );

        // Renderizar resultados filtrados
        tbody.innerHTML = '';
        if (clientesFiltrados.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="6" style="text-align: center; padding: 40px; color: #9ca3af;">
                        ${svgIconHTML('search', 16, '#9ca3af')} No se encontraron clientes que coincidan con "${esc(busqueda)}"
                    </td>
                </tr>
            `;
            return;
        }

        clientesFiltrados.forEach(c => {
            let fechaRegistro = 'N/A';
            if (c.fecha_registro) {
                const fecha = new Date(c.fecha_registro);
                if (!isNaN(fecha)) {
                    fechaRegistro = fecha.toLocaleDateString('es-MX', {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric'
                    });
                }
            }

            const fila = document.createElement('tr');
            fila.innerHTML = `
                <td>
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <strong style="color: #111827;">${esc(c.nombre)}</strong>
                        ${(c.total_compras || 0) >= 3 ? '<span style="color: #f59e0b;">' + svgIconHTML('star', 14, '#f59e0b') + '</span>' : ''}
                    </div>
                </td>
                <td>
                    <span style="color: #6b7280; display:flex; align-items:center; gap:4px;">${svgIconHTML('smartphone', 14, '#6b7280')} ${esc(c.telefono)}</span>
                </td>
                <td>
                    ${c.direccion
                        ? `<span style="color: #374151;">${esc(c.direccion)}</span>`
                        : '<span class="text-muted">Sin dirección</span>'}
                </td>
                <td>
                    <span style="font-weight: 600; color: #2563eb;">
                        ${c.total_compras || 0} ${(c.total_compras || 0) === 1 ? 'compra' : 'compras'}
                    </span>
                </td>
                <td>
                    <span style="color: #7c3aed; font-weight: 600; font-size: 0.88em; display:inline-flex; align-items:center; gap:3px;">${svgIconHTML('star', 14, '#7c3aed')} ${c.puntos || 0} pts</span>
                </td>
                <td>
                    <span style="color: #6b7280; font-size: 0.9em;">${fechaRegistro}</span>
                </td>
               <td>
                    <div style="display: flex; gap: 5px;">
                        <button class="btn-secondary small" onclick="verDetalleCliente(${c.id})" title="Ver Detalles">
                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2.062 12.348a1 1 0 010-.696 10.75 10.75 0 0119.876 0 1 1 0 010 .696 10.75 10.75 0 01-19.876 0"/><circle cx="12" cy="12" r="3"/></svg> Ver
                        </button>
                        <button class="btn-secondary small" onclick="editarCliente(${c.id})" title="Editar">
                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.174 6.812a1 1 0 00-3.986-3.987L3.842 16.174a2 2 0 00-.5.83l-1.321 4.352a.5.5 0 00.623.622l4.353-1.32a2 2 0 00.83-.497z"/></svg> Editar
                        </button>
                        <button class="btn-secondary small" onclick="confirmarEliminarCliente(${c.id}, '${esc(c.nombre)}')"
                                style="color: #ef4444;" title="Eliminar">
                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
                        </button>
                    </div>
                </td>
            `;
            tbody.appendChild(fila);
        });
    });
}

async function buscarYAutocompletarCliente(telefono) {
    if (telefono.length >= 10) {
        const cliente = await window.api.buscarClientePorTelefono(telefono);
        if (cliente) {
            // Si el cliente existe, llenamos los campos de domicilio automáticamente
            if (document.getElementById('dom-nombre')) {
                document.getElementById('dom-nombre').value = cliente.nombre;
                document.getElementById('dom-direccion').value = cliente.direccion || '';
                mostrarToast("Cliente reconocido: " + cliente.nombre);
            }
        }
    }
}

function abrirModalCliente() {
    // Limpiar campos antes de abrir
    document.getElementById('cli-telefono').value = '';
    document.getElementById('cli-nombre').value = '';
    document.getElementById('cli-direccion').value = '';

    // Asegurar que los campos estén habilitados
    document.getElementById('cli-telefono').disabled = false;
    document.getElementById('cli-nombre').disabled = false;
    document.getElementById('cli-direccion').disabled = false;

    // Asegurar que esté en modo "Nuevo Cliente"
    document.querySelector('#modal-cliente .modal-header h3').innerText = 'Registrar Nuevo Cliente';
    const btnGuardar = document.querySelector('#modal-cliente .btn-confirm-payment');
    btnGuardar.onclick = guardarCliente;
    btnGuardar.innerText = 'Guardar Cliente';

    // Abrir modal
    document.getElementById('modal-cliente').classList.remove('hidden');
}
function cerrarModalCliente() {
    // Cerrar el modal
    document.getElementById('modal-cliente').classList.add('hidden');

    // ✅ LIMPIEZA COMPLETA: Restaurar todos los campos
    document.getElementById('cli-telefono').value = '';
    document.getElementById('cli-nombre').value = '';
    document.getElementById('cli-direccion').value = '';

    // ✅ RESTAURAR: Volver el modal a modo "Nuevo Cliente"
    document.querySelector('#modal-cliente .modal-header h3').innerText = 'Registrar Nuevo Cliente';

    // ✅ RESTAURAR: Volver el botón a su función original
    const btnGuardar = document.querySelector('#modal-cliente .btn-confirm-payment');
    btnGuardar.onclick = guardarCliente;
    btnGuardar.innerText = 'Guardar Cliente';

    // ✅ IMPORTANTE: Habilitar los campos por si quedaron deshabilitados
    document.getElementById('cli-telefono').disabled = false;
    document.getElementById('cli-nombre').disabled = false;
    document.getElementById('cli-direccion').disabled = false;
}

async function guardarCliente() {
    const telefono = document.getElementById('cli-telefono').value.trim();
    const nombre = document.getElementById('cli-nombre').value.trim();
    const direccion = document.getElementById('cli-direccion').value.trim();

    if (!telefono || !nombre) {
        alert("El teléfono y el nombre son obligatorios.");
        return;
    }

    const btnGuardar = document.querySelector('#modal-cliente .btn-confirm-payment');
    if (btnGuardar) btnGuardar.disabled = true;

    try {
        await crearClienteWrapper({
            telefono: telefono,
            nombre: nombre,
            direccion: direccion,
            notas: ''
        });

        mostrarNotificacionExito('Cliente guardado correctamente', '¡Cliente Guardado!');
        cerrarModalCliente();
        cargarClientes();
    } catch (error) {
        console.error("Error al guardar cliente:", error);
        alert("Error al guardar el cliente");
        if (btnGuardar) btnGuardar.disabled = false;
    }
}

function editarCliente(id) {
    // Buscar el cliente en la lista
    window.api.obtenerClientesConCompras().then(clientes => {
        const cliente = clientes.find(c => c.id === id);
        if (!cliente) {
            alert("Cliente no encontrado");
            return;
        }

        // Asegurar que los campos estén habilitados
        document.getElementById('cli-telefono').disabled = false;
        document.getElementById('cli-nombre').disabled = false;
        document.getElementById('cli-direccion').disabled = false;

        // Llenar el modal con los datos del cliente
        document.getElementById('cli-telefono').value = cliente.telefono;
        document.getElementById('cli-nombre').value = cliente.nombre;
        document.getElementById('cli-direccion').value = cliente.direccion || '';

        // Cambiar el título del modal
        document.querySelector('#modal-cliente .modal-header h3').innerText = 'Editar Cliente';

        // Cambiar el comportamiento del botón guardar temporalmente
        const btnGuardar = document.querySelector('#modal-cliente .btn-confirm-payment');
        btnGuardar.onclick = () => actualizarClienteExistente(id);
        btnGuardar.innerText = 'Actualizar Cliente';

        // Abrir modal
        document.getElementById('modal-cliente').classList.remove('hidden');
    }).catch(error => {
        console.error("Error al cargar cliente para editar:", error);
        alert("Error al cargar los datos del cliente");
    });
}
async function _actualizarClienteExistenteBase(id) {
    const telefono = document.getElementById('cli-telefono').value.trim();
    const nombre = document.getElementById('cli-nombre').value.trim();
    const direccion = document.getElementById('cli-direccion').value.trim();

    if (!telefono || !nombre) {
        alert("El teléfono y el nombre son obligatorios.");
        return;
    }

    try {
        await window.api.actualizarCliente(id, {
            telefono,
            nombre,
            direccion,
            notas: ''
        });

        // En modo conectado, también guardar en el backend
        if (modoConectado && apiClient && tokenActual) {
            await apiClient.updateCustomer(id, { phone: telefono, name: nombre, address: direccion }).catch(() => {});
        }

        mostrarNotificacionExito('Cliente actualizado correctamente', '¡Cliente Actualizado!');

        cerrarModalCliente();
        cargarClientes(); // Recargar la lista

    } catch (error) {
        console.error("Error al actualizar cliente:", error);
        alert("Error al actualizar el cliente");
    }
}

function confirmarEliminarCliente(id, nombre) {
    if (confirm(`¿Estás seguro de eliminar al cliente "${nombre}"?\n\nSi tiene pedidos asociados, se marcará como eliminado pero no se borrará completamente.`)) {
        window.api.eliminarCliente(id).then(() => {
            mostrarNotificacionExito('Cliente eliminado correctamente', '¡Cliente Eliminado!');
            cargarClientes();  // Recargar la lista
        }).catch(error => {
            console.error("Error al eliminar cliente:", error);
            alert("Error al eliminar el cliente");
        });
    }
}

function verDetalleCliente(id) {
    obtenerClientesWrapper().then(clientes => {
        const cliente = clientes.find(c => c.id === id);
        if (!cliente) {
            alert("Cliente no encontrado");
            return;
        }

        // Llenar modal con datos
        document.getElementById('ver-cli-nombre').innerText = cliente.nombre;
        document.getElementById('ver-cli-telefono').innerText = cliente.telefono;
        document.getElementById('ver-cli-direccion').innerText = cliente.direccion || 'Sin dirección registrada';
        document.getElementById('ver-cli-compras').innerText = cliente.total_compras || 0;
        document.getElementById('ver-cli-monto').innerText = `$${(cliente.monto_total || 0).toFixed(2)}`;
        const elPuntos = document.getElementById('ver-cli-puntos');
        if (elPuntos) elPuntos.innerText = `${cliente.puntos || 0} pts`;

        // Formatear fecha
        let fechaRegistro = 'No disponible';
        if (cliente.fecha_registro) {
            const fecha = new Date(cliente.fecha_registro);
            if (!isNaN(fecha)) {
                fechaRegistro = fecha.toLocaleDateString('es-MX', {
                    weekday: 'long',
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric'
                });
            }
        }
        document.getElementById('ver-cli-fecha').innerText = fechaRegistro;

        // Abrir modal
        document.getElementById('modal-ver-cliente').classList.remove('hidden');
    }).catch(error => {
        console.error("Error al cargar cliente:", error);
        alert("Error al cargar los datos del cliente");
    });
}

function cerrarModalVerCliente() {
    document.getElementById('modal-ver-cliente').classList.add('hidden');
}

// --- Integración: Editar cliente con PIN ---
async function actualizarClienteExistente(id) {
    if (modoConectado && apiClient && tokenActual) {
        const telefono  = document.getElementById('cli-telefono').value.trim();
        const nombre    = document.getElementById('cli-nombre').value.trim();
        const direccion = document.getElementById('cli-direccion').value.trim();
        if (!telefono || !nombre) { alert('El teléfono y el nombre son obligatorios.'); return; }

        pedirPinEmpleado(
            `Editar cliente. Esta acción quedará registrada. Ingresa tu PIN para confirmar.`,
            async (employeeId, pin, employeeName, employeeRole) => {
                try {
                    await window.api.actualizarCliente(id, { telefono, nombre, direccion, notas: '' });
                    if (employeeId) {
                        await apiClient.updateCustomerWithPin(id, { phone: telefono, name: nombre, address: direccion }, employeeId, null, employeeName || '').catch(() => {});
                    } else {
                        await apiClient.updateCustomer(id, { phone: telefono, name: nombre, address: direccion }).catch(() => {});
                    }
                    mostrarNotificacionExito('Cliente actualizado correctamente', '¡Cliente Actualizado!');
                    cerrarModalCliente();
                    cargarClientes();
                } catch(e) {
                    alert('Error al actualizar cliente: ' + (e.message || 'Error'));
                }
            }
        );
        return;
    }
    return _actualizarClienteExistenteBase(id);
}
