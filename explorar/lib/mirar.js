// ============================================================================
// explorar/lib/mirar.js — QUÉ SE VE EN LA PANTALLA, contado en texto
//
// Es la pieza central del arnés: quien explora desde una terminal no puede
// mirar la pantalla, así que hay que contársela. Y contársela MAL es peor que
// no contársela: si el resumen omite el botón que estaba apagado, quien lo lee
// concluye que el botón no existe y reporta un defecto que no está.
//
// Reglas de esta función:
//   • Se mira UNA región: el modal de encima si hay alguno, y si no la vista
//     activa. Es lo que mira una persona — nadie lee el formulario que quedó
//     debajo del diálogo.
//   • Se dice el ESTADO, no solo la existencia: un botón apagado se anota como
//     apagado y un campo con valor se anota con su valor. La mitad de los
//     defectos de este repo son "está pero no hace nada".
//   • Todo va con TOPE. Un vuelco de 40 KB del catálogo entero no se lee: se
//     recorta y se DICE que se recortó, para que nadie confunda "no aparece"
//     con "no existe".
//
// ⚠️ `instantanea` se ejecuta DENTRO de la página (page.evaluate), así que no
// puede usar require ni nada de Node. Es JavaScript de navegador a secas.
// ============================================================================

/** Se ejecuta EN LA PÁGINA. Devuelve un objeto plano con lo que se ve. */
function instantanea(topes) {
    var TOPE = topes || {};
    var MAX_TEXTO = TOPE.texto || 2000;
    var MAX_LISTA = TOPE.lista || 40;

    function visible(el) {
        if (!el) return false;
        if (el.getClientRects().length > 0) return true;
        var s = getComputedStyle(el);
        return s.display !== 'none' && s.visibility !== 'hidden' && el.offsetHeight > 0;
    }

    function limpiar(t) {
        return String(t == null ? '' : t).replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
    }

    function recortar(t, n) {
        return t.length > n ? t.slice(0, n) + '\n…[recortado; ' + t.length + ' caracteres en total]' : t;
    }

    function nombrar(el) {
        if (el.id) return '#' + el.id;
        var clases = (el.className && typeof el.className === 'string')
            ? el.className.split(/\s+/).filter(Boolean).slice(0, 2).join('.')
            : '';
        return clases ? el.tagName.toLowerCase() + '.' + clases : el.tagName.toLowerCase();
    }

    // ── Dónde está el usuario ───────────────────────────────────────────────
    var vistaActiva = document.querySelector('.view.active');
    var nombreVista = vistaActiva ? String(vistaActiva.id || '').replace(/^view-/, '') : '(ninguna)';

    var modales = [].slice.call(document.querySelectorAll('.modal')).filter(visible);
    var dialogo = document.getElementById('modal-dialogo-zenit');
    var hayDialogo = visible(dialogo);

    var region = vistaActiva;
    var dondeEstoy = 'vista: ' + nombreVista;
    if (modales.length) {
        region = modales[modales.length - 1];
        dondeEstoy = 'MODAL ' + nombrar(region) + '  (sobre la vista ' + nombreVista + ')';
    }
    // El diálogo de confirmar/alertar gana a todo: es lo que bloquea la pantalla.
    if (hayDialogo) {
        region = dialogo;
        dondeEstoy = 'DIÁLOGO de la app (bloquea todo lo de atrás)';
    }
    if (!region) region = document.body;

    // ── Qué dice ────────────────────────────────────────────────────────────
    var texto = recortar(limpiar(region.innerText || ''), MAX_TEXTO);

    // ── Con qué se puede interactuar ────────────────────────────────────────
    var botones = [];
    [].slice.call(region.querySelectorAll('button, .btn, [role="button"]')).forEach(function (b) {
        if (botones.length >= MAX_LISTA || !visible(b)) return;
        var etiqueta = limpiar(b.innerText || b.title || b.getAttribute('aria-label') || '');
        if (!etiqueta) return;
        botones.push({
            texto: etiqueta.slice(0, 40),
            sel: nombrar(b),
            apagado: Boolean(b.disabled) || b.classList.contains('disabled'),
        });
    });

    var campos = [];
    [].slice.call(region.querySelectorAll('input, textarea')).forEach(function (i) {
        if (campos.length >= MAX_LISTA || !visible(i)) return;
        if (i.type === 'checkbox' || i.type === 'radio') return;
        campos.push({
            sel: nombrar(i),
            tipo: i.type || 'text',
            pista: limpiar(i.placeholder || '').slice(0, 40),
            valor: limpiar(i.value).slice(0, 40),
            apagado: Boolean(i.disabled),
        });
    });

    // Los interruptores de Ajustes traen su <input> a 0×0 con opacity:0 —lo que
    // se toca es el .slider de al lado (CLAUDE.md §46.6)—, así que aquí NO se
    // filtra por visibilidad: si se filtrara, ninguno aparecería jamás y
    // parecerían no existir.
    var interruptores = [];
    [].slice.call(region.querySelectorAll('input[type="checkbox"], input[type="radio"]')).forEach(function (c) {
        if (interruptores.length >= MAX_LISTA) return;
        interruptores.push({ sel: nombrar(c), encendido: c.checked, apagado: Boolean(c.disabled) });
    });

    var listas = [];
    [].slice.call(region.querySelectorAll('select')).forEach(function (s) {
        if (listas.length >= MAX_LISTA || !visible(s)) return;
        listas.push({
            sel: nombrar(s),
            valor: s.value,
            opciones: [].slice.call(s.options, 0, 12).map(function (o) { return o.value; }),
        });
    });

    // ── Cuánto hay ──────────────────────────────────────────────────────────
    var tablas = [];
    [].slice.call(region.querySelectorAll('table')).forEach(function (t) {
        if (!visible(t)) return;
        var cuerpo = t.querySelector('tbody') || t;
        tablas.push({ sel: nombrar(t), filas: cuerpo.querySelectorAll('tr').length });
    });

    // ── El estado del equipo, que se ve siempre ─────────────────────────────
    var pildora = document.getElementById('texto-modo');
    var rueda = document.getElementById('spinner-conexion');

    return {
        donde: dondeEstoy,
        vista: nombreVista,
        modalesAbiertos: modales.map(nombrar),
        hayDialogo: hayDialogo,
        conexion: pildora ? limpiar(pildora.innerText) : '(sin píldora)',
        cargando: Boolean(rueda && visible(rueda)),
        texto: texto,
        botones: botones,
        campos: campos,
        interruptores: interruptores,
        listas: listas,
        tablas: tablas,
    };
}

/** Convierte la instantánea en algo legible de un vistazo. Corre en Node. */
function contar(inst) {
    const l = [];
    l.push('DÓNDE:  ' + inst.donde);
    l.push('EQUIPO: ' + inst.conexion + (inst.cargando ? '   ⏳ cargando' : ''));
    if (inst.modalesAbiertos.length > 1) {
        l.push('⚠️ HAY ' + inst.modalesAbiertos.length + ' MODALES ABIERTOS A LA VEZ: ' +
            inst.modalesAbiertos.join(', '));
    }
    l.push('');
    l.push('── EN PANTALLA ───────────────────────────────────');
    l.push((inst.texto || '(vacío)').split('\n').map((x) => '  ' + x).join('\n'));

    if (inst.botones.length) {
        l.push('');
        l.push('── BOTONES ───────────────────────────────────────');
        for (const b of inst.botones) {
            l.push('  [' + b.texto + ']' + (b.apagado ? '  ⛔APAGADO' : '') + '   →  ' + b.sel);
        }
    }
    if (inst.campos.length) {
        l.push('');
        l.push('── CAMPOS ────────────────────────────────────────');
        for (const c of inst.campos) {
            l.push('  ' + c.sel + ' (' + c.tipo + ')' +
                (c.pista ? ' pista="' + c.pista + '"' : '') +
                ' valor="' + c.valor + '"' + (c.apagado ? '  ⛔APAGADO' : ''));
        }
    }
    if (inst.interruptores.length) {
        l.push('');
        l.push('── INTERRUPTORES ─── (se tocan en el .slider, no en el input) ──');
        for (const s of inst.interruptores) {
            l.push('  ' + s.sel + ' = ' + (s.encendido ? 'ENCENDIDO' : 'apagado'));
        }
    }
    if (inst.listas.length) {
        l.push('');
        l.push('── LISTAS ────────────────────────────────────────');
        for (const s of inst.listas) {
            l.push('  ' + s.sel + ' = "' + s.valor + '"   de [' + s.opciones.join(', ') + ']');
        }
    }
    if (inst.tablas.length) {
        l.push('');
        l.push('TABLAS: ' + inst.tablas.map((t) => t.sel + ' (' + t.filas + ' filas)').join(', '));
    }
    return l.join('\n');
}

module.exports = { instantanea, contar };
