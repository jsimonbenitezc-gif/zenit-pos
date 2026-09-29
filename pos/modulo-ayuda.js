// ─── AYUDA (?) (PLAN_AYUDA_V1, IDEA 10) ───────────────────────────────────────
//
// Un circulito gris junto al título de las pantallas menos obvias. Basta pasar
// el cursor para que salga la burbuja; también se abre con clic (cajas con
// pantalla táctil) o con Enter/espacio desde el teclado. Se cierra al quitar el
// cursor, al hacer clic fuera o con Esc. Nunca se abre sola.
//
// En el HTML:   <button type="button" class="ayuda" data-ayuda="turno"></button>
// Desde JS:     botonAyuda('turno')  → el mismo botón, como texto HTML
//
// Los textos viven en ayuda-textos.js (copiado del celular, `smoke:ayuda`).
// No se usa `title=""`: el nativo tarda en salir, no se puede estilar y no sirve
// con el dedo. La burbuja es UNA sola, pegada al <body>, así que ningún
// `overflow: hidden` de una tarjeta o un modal la recorta; si no cabe abajo o a
// la derecha, se voltea hacia arriba o a la izquierda.

/** El botón (?) como HTML, para lo que se arma desde JS. */
function botonAyuda(id) {
    const t = TEXTOS_AYUDA[id];
    if (!t) return ''; // llave mal escrita: mejor nada que un (?) mudo
    const nombre = String('Ayuda: ' + t.titulo).replace(/"/g, '&quot;');
    return `<button type="button" class="ayuda" data-ayuda="${id}" data-lista="1" aria-label="${nombre}" aria-expanded="false">?</button>`;
}

(function () {
    let burbuja = null;
    let dueno = null;       // el (?) cuya burbuja está abierta
    let fijada = false;     // abierta con clic: no se cierra al quitar el cursor
    let relojCierre = null;

    const escapar = (s) => String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const conNegritas = (s) => escapar(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

    /** Rellena los (?) que aún están vacíos: el signo y el nombre para lectores de pantalla. */
    function prepararBotones(raiz) {
        (raiz || document).querySelectorAll('button.ayuda:not([data-lista])').forEach((b) => {
            const t = TEXTOS_AYUDA[b.dataset.ayuda];
            b.dataset.lista = '1';
            if (!t) { b.remove(); return; } // llave mal escrita: mejor nada que un (?) mudo
            b.type = 'button';
            b.textContent = '?';
            b.setAttribute('aria-label', 'Ayuda: ' + t.titulo);
            b.setAttribute('aria-expanded', 'false');
        });
    }

    function crearBurbuja() {
        if (burbuja) return burbuja;
        burbuja = document.createElement('div');
        burbuja.className = 'ayuda-burbuja';
        burbuja.id = 'ayuda-burbuja';
        burbuja.setAttribute('role', 'tooltip');
        burbuja.hidden = true;
        // Pasar de un (?) a su burbuja no la cierra (se puede leer con calma).
        burbuja.addEventListener('mouseenter', () => clearTimeout(relojCierre));
        burbuja.addEventListener('mouseleave', () => { if (!fijada) programarCierre(); });
        document.body.appendChild(burbuja);
        return burbuja;
    }

    function abrir(boton, conClic) {
        const t = TEXTOS_AYUDA[boton.dataset.ayuda];
        if (!t) return;
        clearTimeout(relojCierre);
        if (dueno && dueno !== boton) dueno.setAttribute('aria-expanded', 'false');
        const b = crearBurbuja();
        b.innerHTML =
            `<div class="ayuda-burbuja-titulo">${escapar(t.titulo)}</div>` +
            `<div class="ayuda-burbuja-texto">${conNegritas(t.texto)}</div>` +
            (t.ejemplo ? `<div class="ayuda-burbuja-ejemplo">${conNegritas(t.ejemplo)}</div>` : '');
        b.hidden = false;
        dueno = boton;
        fijada = !!conClic;
        boton.setAttribute('aria-expanded', 'true');
        boton.setAttribute('aria-describedby', 'ayuda-burbuja');
        colocar(boton, b);
    }

    /** Abajo y a la derecha del (?); si no cabe, se voltea. Nunca sale de la ventana. */
    function colocar(boton, b) {
        const MARGEN = 8;
        b.style.left = '0px';
        b.style.top = '0px';
        const r = boton.getBoundingClientRect();
        const ancho = b.offsetWidth;
        const alto = b.offsetHeight;
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        let x = r.left;
        if (x + ancho > vw - MARGEN) x = r.right - ancho;              // se voltea a la izquierda
        x = Math.max(MARGEN, Math.min(x, vw - ancho - MARGEN));
        let y = r.bottom + 6;
        if (y + alto > vh - MARGEN) y = r.top - alto - 6;               // se voltea hacia arriba
        y = Math.max(MARGEN, Math.min(y, vh - alto - MARGEN));
        b.style.left = Math.round(x) + 'px';
        b.style.top = Math.round(y) + 'px';
    }

    function cerrar() {
        clearTimeout(relojCierre);
        if (burbuja) burbuja.hidden = true;
        if (dueno) {
            dueno.setAttribute('aria-expanded', 'false');
            dueno.removeAttribute('aria-describedby');
        }
        dueno = null;
        fijada = false;
    }

    // Un respiro al salir: el cursor puede cruzar el hueco entre el (?) y la burbuja.
    function programarCierre() {
        clearTimeout(relojCierre);
        relojCierre = setTimeout(cerrar, 180);
    }

    const botonDe = (e) => (e.target && e.target.closest ? e.target.closest('button.ayuda') : null);

    // Todo por delegación: sirve para los (?) del HTML y para los que se pintan después.
    document.addEventListener('mouseover', (e) => {
        const b = botonDe(e);
        if (!b) return;
        prepararBotones(b.parentNode);
        if (dueno === b) { clearTimeout(relojCierre); return; }
        if (fijada && dueno) return; // hay una abierta con clic: el paso del cursor no la cambia
        abrir(b, false);
    });
    document.addEventListener('mouseout', (e) => {
        const b = botonDe(e);
        if (!b || b !== dueno || fijada) return;
        if (b.contains(e.relatedTarget) || (burbuja && burbuja.contains(e.relatedTarget))) return;
        programarCierre();
    });
    // Captura: el (?) suele vivir dentro de un encabezado o una fila con su propio
    // onclick; el clic en el (?) no debe disparar esa otra acción.
    document.addEventListener('click', (e) => {
        const b = botonDe(e);
        if (b) {
            e.preventDefault();
            e.stopPropagation();
            prepararBotones(b.parentNode);
            if (dueno === b && fijada) cerrar();
            else abrir(b, true);
            return;
        }
        if (dueno && !(burbuja && burbuja.contains(e.target))) cerrar();
    }, true);
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && dueno) {
            // Esc cierra la burbuja, no el modal de abajo.
            e.stopPropagation();
            const b = dueno;
            cerrar();
            if (b.isConnected) b.focus();
        }
    }, true);
    document.addEventListener('focusin', (e) => {
        const b = botonDe(e);
        if (b && b.matches(':focus-visible') && dueno !== b) { prepararBotones(b.parentNode); abrir(b, false); }
    });
    // Al desplazar o cambiar el tamaño, la burbuja quedaría flotando lejos de su (?).
    window.addEventListener('scroll', () => { if (dueno) cerrar(); }, true);
    window.addEventListener('resize', () => { if (dueno) cerrar(); });

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => prepararBotones());
    } else {
        prepararBotones();
    }
})();
