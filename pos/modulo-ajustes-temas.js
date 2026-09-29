// ============================================
// MÓDULO: Ajustes por temas (PLAN_PULIDO_V1 B.2)
// ============================================
//
// La misma idea que `PantallaDeTemas` del celular (§64): una portada con una
// tarjeta por tema, cada una con su estado DE VERDAD, y al tocarla se abre su
// página. Las páginas son contenedores de las MISMAS tarjetas de siempre
// (index.html → .ajustes-pagina): ningún campo cambió de id ni de onclick, y
// toda la lógica sigue en modulo-ajustes.js. Qué página está abierta es estado
// de DIBUJO, nada más; al salir de la vista se vuelve a la portada.

const TEMAS_AJUSTES = [
    // Los seis de arriba. "Mi menú" va primero: la entrada al importador (§57.8)
    // tiene que seguir a la vista.
    { id: 'menu',      titulo: 'Mi menú',    icono: 'utensils',      tono: 'ambar' },
    { id: 'negocio',   titulo: 'Mi negocio', icono: 'briefcase',     tono: 'azul', guardar: true },
    { id: 'cobros',    titulo: 'Cobros',     icono: 'tag',           tono: 'verde', guardar: true },
    { id: 'ticket',    titulo: 'Ticket',     icono: 'document-text', tono: 'lila', guardar: true },
    { id: 'equipo',    titulo: 'Mi equipo',  icono: 'users',         tono: 'rosa' },
    { id: 'horario',   titulo: 'Horario',    icono: 'clock',         tono: 'gris' },
    // La lista de abajo. (`guardar`: la página tiene campos que se guardan solos.)
    { id: 'kds',       titulo: 'Pantalla de cocina',        icono: 'smartphone', lista: true },
    { id: 'plan',      titulo: 'Mi plan',                   icono: 'star',       lista: true },
    { id: 'cuenta',    titulo: 'Tu cuenta Zenit',           icono: 'user',       lista: true },
    { id: 'seguridad', titulo: 'Contraseña y respaldos',    icono: 'key-round',  lista: true, guardar: true },
    { id: 'generales', titulo: 'Ajustes generales',         icono: 'lightbulb',  lista: true, guardar: true },
];

let temaAjustesAbierto = null;

const _valorCampo = (id) => { const el = document.getElementById(id); return el ? String(el.value || '').trim() : ''; };
const _textoOpcion = (id) => {
    const el = document.getElementById(id);
    const op = el && el.selectedIndex >= 0 ? el.options[el.selectedIndex] : null;
    return op && op.value ? op.textContent.trim() : '';
};
const _marcado = (id) => !!document.getElementById(id)?.checked;

/**
 * El estado de cada tema, leído de lo que ya está cargado: los globales de
 * configuración y los campos que modulo-ajustes.js acaba de llenar. Si algo no
 * se puede leer, la tarjeta sale sin estado — nunca con uno inventado.
 */
async function _estadoTemaAjustes(id) {
    switch (id) {
        case 'negocio': {
            const nombre = _valorCampo('adj-nombre-negocio') || 'Sin nombre';
            const tipo = _textoOpcion('adj-tipo-negocio');
            return tipo ? `${nombre} · ${tipo}` : nombre;
        }
        case 'menu': {
            if (typeof _menuFotoCuantosProductos !== 'function') return 'Importar desde una foto';
            const n = await _menuFotoCuantosProductos();
            return `${n} producto${n === 1 ? '' : 's'} · importar desde una foto`;
        }
        case 'cobros': {
            const imp = configImpuesto.activo
                ? `${configImpuesto.nombre} ${configImpuesto.tasa} % ${configImpuesto.incluido ? 'incluido' : 'agregado'}`
                : 'Sin impuesto';
            const prop = configPropina.activo ? 'con propinas' : 'sin propinas';
            return `${imp} · ${prop}`;
        }
        case 'ticket': {
            const impresora = _textoOpcion('adj-impresora') || 'Impresora del sistema';
            return _marcado('adj-impresora-auto') ? `${impresora} · imprime solo` : impresora;
        }
        case 'equipo': {
            const suc = _textoOpcion('aj-sucursal-id');
            return suc ? `Puestos y permisos · ${suc}` : 'Puestos y permisos';
        }
        case 'horario':
            return horarioNegocio ? resumenHorario() : 'Sin horario (no avisa nada)';
        case 'kds':
            return planActual.isPremium ? 'Aprobar tabletas de cocina' : 'Premium';
        case 'plan':
            if (!modoConectado) return 'Sin cuenta conectada';
            if (planActual.isPremium) return `${planActual.plan === 'trial' ? 'Prueba gratuita' : 'Premium'} · ${planActual.daysLeft} días`;
            return 'Gratis';
        case 'cuenta':
            return modoConectado ? 'Conectada' : 'Modo local, sin cuenta';
        case 'seguridad': {
            const respaldo = document.getElementById('last-backup')?.textContent.trim();
            return respaldo ? `Último respaldo: ${respaldo}` : '';
        }
        case 'generales':
            return 'Existencias en venta, PIN de descuentos, venta sin turno';
    }
    return '';
}

/** Un tema se ofrece si en su página queda al menos una tarjeta que este puesto puede ver. */
function _temaAjustesVisible(id) {
    const pagina = document.querySelector(`#view-ajustes .ajustes-pagina[data-tema="${id}"]`);
    if (!pagina) return false;
    return [...pagina.querySelectorAll(':scope > .ajustes-grid > .ajustes-card')]
        .some(c => !c.classList.contains('hidden') && c.style.display !== 'none');
}

function _tarjetaTemaHTML(t) {
    return `
        <button type="button" class="ajustes-tema tono-${t.tono}" data-tema="${t.id}" onclick="abrirTemaAjustes('${t.id}')">
            <span class="ajustes-tema-icono">${svgIconHTML(t.icono, 22)}</span>
            <span class="ajustes-tema-titulo">${t.titulo}</span>
            <span class="ajustes-tema-estado" data-estado="${t.id}"></span>
        </button>`;
}

function _filaTemaHTML(t) {
    return `
        <button type="button" class="ajustes-fila" data-tema="${t.id}" onclick="abrirTemaAjustes('${t.id}')">
            <span class="ajustes-fila-icono">${svgIconHTML(t.icono, 18)}</span>
            <span class="ajustes-fila-texto">
                <span class="ajustes-fila-titulo">${t.titulo}</span>
                <span class="ajustes-fila-estado" data-estado="${t.id}"></span>
            </span>
            <span class="ajustes-fila-flecha">›</span>
        </button>`;
}

/** Dibuja la portada (qué temas se ven) y le pone su estado a cada uno. */
async function pintarPortadaAjustes() {
    const portada = document.getElementById('ajustes-portada');
    if (!portada) return;
    const visibles = TEMAS_AJUSTES.filter(t => _temaAjustesVisible(t.id));
    const arriba = visibles.filter(t => !t.lista);
    const abajo = visibles.filter(t => t.lista);
    portada.innerHTML =
        `<div class="ajustes-temas">${arriba.map(_tarjetaTemaHTML).join('')}</div>` +
        (abajo.length ? `<div class="ajustes-lista">${abajo.map(_filaTemaHTML).join('')}</div>` : '');

    await Promise.all(visibles.map(async t => {
        let estado = '';
        try {
            estado = await _estadoTemaAjustes(t.id);
        } catch (e) {
            console.warn('Ajustes: no pude leer el estado de', t.id, e);
        }
        portada.querySelectorAll(`[data-estado="${t.id}"]`).forEach(el => {
            el.textContent = estado || '';
            el.title = estado || '';
        });
    }));
}

function _mostrarPaginaAjustes(id) {
    temaAjustesAbierto = id;
    const tema = TEMAS_AJUSTES.find(t => t.id === id);
    document.getElementById('ajustes-portada')?.style.setProperty('display', id ? 'none' : '');
    document.querySelectorAll('#view-ajustes .ajustes-pagina').forEach(p => {
        p.style.display = p.dataset.tema === id ? '' : 'none';
    });
    const titulo = document.getElementById('ajustes-titulo');
    if (titulo) titulo.textContent = tema ? tema.titulo : 'Ajustes';
    const atras = document.getElementById('ajustes-atras');
    if (atras) atras.style.display = id ? '' : 'none';
    // Los campos sueltos se guardan solos; "Guardar Cambios" solo quita el foco y lo
    // confirma. Sale en las páginas que tienen de esos campos (`guardar: true`): en las
    // demás cada tarjeta trae su propio botón, y en la portada no hay nada que guardar.
    const guardar = document.getElementById('ajustes-guardar');
    if (guardar) guardar.style.display = tema && tema.guardar ? '' : 'none';
    const principal = document.getElementById('main-container');
    if (principal) principal.scrollTop = 0;
}

async function abrirTemaAjustes(id) {
    if (!TEMAS_AJUSTES.some(t => t.id === id)) return;
    // "Mi equipo" guarda los PINs de todos: pide la contraseña del administrador
    // aunque el perfil activo sea el suyo (PLAN_SEGURIDAD_V1, sesión 1).
    if (id === 'equipo' && !(await pedirAdminReciente('Ingresa la contraseña de administrador para ver los puestos y sus PINs.'))) return;
    // Si la vista no está al frente, se entra por la puerta normal (carga los ajustes).
    if (!document.getElementById('view-ajustes')?.classList.contains('active')) cambiarVista('ajustes');
    _mostrarPaginaAjustes(id);
}

function volverPortadaAjustes() {
    _mostrarPaginaAjustes(null);
    pintarPortadaAjustes();
}

/** Al entrar a la vista: portada, y el estado cuando los ajustes terminan de cargar. */
function entrarVistaAjustes(cargando) {
    _mostrarPaginaAjustes(null);
    pintarPortadaAjustes();
    Promise.resolve(cargando).finally(() => { if (!temaAjustesAbierto) pintarPortadaAjustes(); });
}

// Esc vuelve a la portada, salvo que haya un modal o un diálogo encima (Esc es suyo).
document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || !temaAjustesAbierto) return;
    if (!document.getElementById('view-ajustes')?.classList.contains('active')) return;
    const dialogo = document.getElementById('modal-dialogo-zenit');
    if (dialogo && dialogo.style.display !== 'none') return;
    if (document.querySelector('.modal:not(.hidden)')) return;
    const kds = document.getElementById('modal-kds-dispositivo');
    if (kds && kds.style.display !== 'none') return;
    volverPortadaAjustes();
});
