// ============================================
// MÓDULO: Rentabilidad por producto (BLOQUE 12)
// ============================================
//
// Responde la pregunta que el POS nunca supo contestar: de todo lo que vendo,
// ¿qué me deja dinero de verdad? Cruza las ventas del periodo con el costo de
// la receta de cada platillo.
//
// ── LAS TRES REGLAS QUE HACEN QUE ESTA VISTA SE PUEDA CREER ─────────────────
// 1. Un producto SIN receta no cuesta cero: cuesta *desconocido*. Se lista
//    aparte, nunca con un margen del 100% que invitaría a decidir al revés.
// 2. Un insumo sin precio ensucia todo lo que lo toca: el platillo se marca con
//    un aviso y se dice qué insumo falta.
// 3. El ingreso es NETO. De un platillo de $116 con IVA incluido, $16 son del
//    fisco: el margen se calcula sobre los $100 que sí son del negocio.
//
// ⚠️ La cuenta está en DOS lugares: `utils/costos.js` + `routes/stats.js` del
// backend, y `obtenerRentabilidad()` de database/db.js para el modo local y sin
// internet. Si cambias una, cambia la otra.

let _rentabilidadPeriodo = 30;   // días
let _rentabilidadOrden = 'margen';
let _rentabilidadDatos = null;

/** Fecha 'YYYY-MM-DD' local, N días hacia atrás. */
function _fechaHaceDias(dias) {
    const d = new Date();
    d.setDate(d.getDate() - dias);
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${d.getFullYear()}-${mm}-${dd}`;
}

function _dinero(n) {
    const v = parseFloat(n) || 0;
    return `${v < 0 ? '-' : ''}$${Math.abs(v).toFixed(2)}`;
}

/**
 * Trae el reporte. Igual que el dashboard (`obtenerEstadisticasWrapper`): el
 * backend manda cuando hay sesión, y la base local es la red de seguridad para
 * el modo local y para cuando se cae internet.
 */
async function obtenerRentabilidadWrapper() {
    const desde = _fechaHaceDias(_rentabilidadPeriodo - 1);
    const hasta = _fechaHaceDias(0);
    if (modoConectado && apiClient && tokenActual) {
        try {
            const sucursal = sucursalParaConsultar();
            const qs = `?date_from=${desde}&date_to=${hasta}&order_by=${_rentabilidadOrden}` +
                (sucursal ? `&branch_id=${sucursal}` : '');
            return await apiClient.request(`/stats/profitability${qs}`);
        } catch (error) {
            console.warn('Rentabilidad desde el backend falló, se usa la base local:', error.message);
        }
    }
    return await window.api.obtenerRentabilidad({ desde, hasta, orden: _rentabilidadOrden });
}

async function cargarRentabilidad() {
    const cuerpo = document.getElementById('tabla-rentabilidad');
    if (cuerpo) {
        cuerpo.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:30px;color:#9ca3af;">Calculando…</td></tr>`;
    }
    try {
        renderizarTabsSucursal('rentabilidad');
        _rentabilidadDatos = await obtenerRentabilidadWrapper();
        renderizarRentabilidad();
    } catch (e) {
        console.error('Error al cargar rentabilidad:', e);
        if (cuerpo) {
            cuerpo.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:30px;color:#ef4444;">
                No se pudo calcular la rentabilidad. Intenta de nuevo.</td></tr>`;
        }
    }
}

function cambiarPeriodoRentabilidad(dias, btn) {
    _rentabilidadPeriodo = dias;
    document.querySelectorAll('#rent-periodos .inv-tab').forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');
    cargarRentabilidad();
}

function cambiarOrdenRentabilidad(valor) {
    _rentabilidadOrden = valor;
    // El orden lo aplica el backend, pero también se reordena en memoria para
    // que el cambio sea instantáneo y para que el modo local haga lo mismo.
    renderizarRentabilidad();
}

function renderizarRentabilidad() {
    const datos = _rentabilidadDatos;
    if (!datos) return;
    const r = datos.resumen || {};

    // ── Tarjetas de resumen ──────────────────────────────────────────────
    const setTxt = (id, txt) => { const el = document.getElementById(id); if (el) el.innerText = txt; };
    setTxt('rent-ingreso', _dinero(r.ingreso));
    setTxt('rent-costo', _dinero(r.costo));
    setTxt('rent-margen', _dinero(r.margen));
    setTxt('rent-margen-pct', r.margen_pct === null || r.margen_pct === undefined ? '—' : `${r.margen_pct}%`);

    // ── Avisos: lo que hace que el número NO sea confiable ───────────────
    const avisos = [];
    if ((r.insumos_sin_costo || []).length) {
        const lista = r.insumos_sin_costo.slice(0, 6).join(', ');
        const resto = r.insumos_sin_costo.length > 6 ? ` y ${r.insumos_sin_costo.length - 6} más` : '';
        avisos.push(`Estos insumos no tienen costo capturado, así que el margen sale <strong>más alto de lo real</strong>: ${esc(lista)}${resto}. Ponles precio en Inventario → Insumos.`);
    }
    if (r.productos_sin_receta > 0) {
        avisos.push(`${r.productos_sin_receta} producto${r.productos_sin_receta === 1 ? '' : 's'} que vendiste no tiene${r.productos_sin_receta === 1 ? '' : 'n'} receta, así que no se puede saber cuánto deja${r.productos_sin_receta === 1 ? '' : 'n'}. Aparecen al final de la lista.`);
    }
    const cajaAviso = document.getElementById('rent-avisos');
    if (cajaAviso) {
        if (avisos.length) {
            cajaAviso.style.display = 'block';
            cajaAviso.innerHTML = avisos.map(a => `<p style="margin:0 0 6px;">${a}</p>`).join('');
        } else {
            cajaAviso.style.display = 'none';
        }
    }

    // ── Tabla ────────────────────────────────────────────────────────────
    const criterios = {
        margen: (a, b) => (b.margen === null ? -Infinity : b.margen) - (a.margen === null ? -Infinity : a.margen),
        margen_pct: (a, b) => (b.margen_pct === null ? -Infinity : b.margen_pct) - (a.margen_pct === null ? -Infinity : a.margen_pct),
        ingreso: (a, b) => b.ingreso - a.ingreso,
        unidades: (a, b) => b.unidades - a.unidades,
    };
    const productos = [...(datos.productos || [])].sort(criterios[_rentabilidadOrden] || criterios.margen);

    const tbody = document.getElementById('tabla-rentabilidad');
    if (!tbody) return;
    if (!productos.length) {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:30px;color:#9ca3af;">
            No hay ventas en este periodo.</td></tr>`;
        return;
    }

    tbody.innerHTML = productos.map(p => {
        const icono = typeof renderIcono === 'function' ? renderIcono(p.emoji, 18) : '';
        if (p.sin_receta) {
            return `<tr style="background:#fafafa;">
                <td>${icono} <strong>${esc(p.nombre)}</strong></td>
                <td>${p.unidades}</td>
                <td>${_dinero(p.ingreso)}</td>
                <td colspan="3" style="color:#9ca3af;font-style:italic;">
                    Sin receta — captura sus insumos para saber cuánto deja
                </td>
                <td><span class="badge-info" style="background:#f3f4f6;color:#6b7280;">Sin dato</span></td>
            </tr>`;
        }
        const pct = p.margen_pct === null ? null : p.margen_pct;
        // Un margen negativo es la información más valiosa de la vista: ese
        // platillo se vende con pérdida.
        const color = p.margen < 0 ? '#ef4444' : (pct !== null && pct < 25 ? '#f59e0b' : '#10b981');
        const aviso = p.costo_confiable ? '' :
            `<span title="Falta el costo de: ${esc((p.insumos_sin_costo || []).join(', '))}" style="color:#f59e0b;cursor:help;">&#9888;</span> `;
        return `<tr>
            <td>${icono} <strong>${esc(p.nombre)}</strong></td>
            <td>${p.unidades}</td>
            <td>${_dinero(p.ingreso)}</td>
            <td>${aviso}${_dinero(p.costo)}</td>
            <td style="color:#6b7280;">${_dinero(p.costo_unitario)}</td>
            <td style="color:${color};font-weight:600;">${_dinero(p.margen)}</td>
            <td style="color:${color};font-weight:600;">${pct === null ? '—' : pct + '%'}</td>
        </tr>`;
    }).join('');
}
