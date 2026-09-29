// ============================================================================
// RECORRIDO 10 — LAS BURBUJAS DE AYUDA (?) (PLAN_AYUDA_V1, IDEA 10)
//
// El (?) está junto al título de las pantallas menos obvias. Con pasar el
// cursor sale la burbuja; con clic se queda (pantallas táctiles); Esc y el clic
// fuera la cierran. Se comprueba con el cursor de verdad, no llamando a
// modulo-ayuda.js por dentro:
//   • todos los (?) del HTML nacen con su "?" y su nombre para lectores de pantalla,
//   • pasar el cursor abre la burbuja con el texto de ayuda-textos.js y quitarlo la cierra,
//   • un clic la deja fija; Esc la cierra sin cerrar lo de abajo,
//   • la burbuja nunca se sale de la ventana (se voltea si no cabe).
// ============================================================================

const { irA, abrirTema, activarPremiumDePrueba } = require('../lib/cajero');

const BURBUJA = '#ayuda-burbuja';

async function burbujaVisible(w) {
    return w.evaluate((sel) => {
        const b = document.querySelector(sel);
        return !!b && !b.hidden && b.offsetWidth > 0;
    }, BURBUJA);
}

async function textoBurbuja(w) {
    return w.evaluate((sel) => (document.querySelector(sel) || {}).textContent || '', BURBUJA);
}

/** ¿La burbuja cabe entera dentro de la ventana? */
async function burbujaDentro(w) {
    return w.evaluate((sel) => {
        const r = document.querySelector(sel).getBoundingClientRect();
        return r.left >= 0 && r.top >= 0 && r.right <= window.innerWidth && r.bottom <= window.innerHeight;
    }, BURBUJA);
}

async function alejarCursor(w) {
    await w.mouse.move(5, 5);
    await w.waitForTimeout(400); // el respiro de 180 ms antes de cerrar
}

module.exports = {
    nombre: 'Ayuda (?): la burbuja sale al pasar el cursor, se fija con clic y no se sale de la ventana',
    etiqueta: 'ayuda',

    async ejecutar({ app, af }) {
        const w = app.ventana;

        // ── 1. Todos los (?) del HTML nacen listos ──────────────────────────
        const botones = await w.evaluate(() => [...document.querySelectorAll('button.ayuda')].map((b) => ({
            llave: b.dataset.ayuda,
            signo: b.textContent.trim(),
            nombre: b.getAttribute('aria-label') || '',
            existe: !!TEXTOS_AYUDA[b.dataset.ayuda],
        })));
        af.cierto('hay (?) en la app (al menos 11 pantallas)', botones.length >= 12, 'hay ' + botones.length);
        const mudos = botones.filter((b) => !b.existe || b.signo !== '?' || !b.nombre.startsWith('Ayuda: '));
        af.cierto('cada (?) tiene su "?", su texto y su nombre "Ayuda: …"', mudos.length === 0, JSON.stringify(mudos));

        // ── 2. Pasar el cursor la abre; quitarlo la cierra ──────────────────
        await activarPremiumDePrueba(app); // Inventario es Premium (siembra, recarga)
        await irA(app, 'inventario');
        await w.click('#view-inventario .inv-tab[onclick*="preparaciones"]');
        await w.waitForTimeout(300);
        const prep = w.locator('#view-inventario button.ayuda[data-ayuda="preparaciones"]');
        af.cierto('el (?) de Preparaciones se ve', await prep.isVisible());
        await prep.hover();
        await w.waitForTimeout(200);
        af.cierto('al pasar el cursor sale la burbuja', await burbujaVisible(w));
        const texto = await textoBurbuja(w);
        af.cierto('dice el texto de Preparaciones, sin los ** de las negritas',
            texto.includes('salsa verde') && !texto.includes('**'), texto);
        af.cierto('"salsa verde" va en negritas',
            await w.evaluate((sel) => [...document.querySelectorAll(sel + ' strong')].some((s) => s.textContent === 'salsa verde'), BURBUJA));
        af.cierto('la burbuja cabe en la ventana', await burbujaDentro(w));
        await alejarCursor(w);
        af.cierto('al quitar el cursor se cierra', !(await burbujaVisible(w)));

        // ── 3. Con clic se queda; Esc la cierra; clic fuera también ─────────
        await prep.click();
        await alejarCursor(w);
        af.cierto('abierta con clic, sigue ahí sin el cursor encima', await burbujaVisible(w));
        await w.keyboard.press('Escape');
        await w.waitForTimeout(150);
        af.cierto('Esc la cierra', !(await burbujaVisible(w)));
        await prep.click();
        await w.locator('#view-inventario h3', { hasText: 'Preparaciones' }).click({ position: { x: 4, y: 4 } });
        await w.waitForTimeout(150);
        af.cierto('un clic fuera la cierra', !(await burbujaVisible(w)));
        af.cierto('el clic en el (?) no cambió de pestaña',
            await w.locator('#view-inventario .inv-tab.active[onclick*="preparaciones"]').count() === 1);

        // ── 4. En Ajustes: la de impuestos, y Esc no cierra la página ──────
        await abrirTema(app, 'cobros');
        const imp = w.locator('#card-impuestos button.ayuda[data-ayuda="impuesto"]');
        await imp.hover();
        await w.waitForTimeout(200);
        af.cierto('el (?) de Impuestos dice "Incluido" y "Agregado"',
            /Incluido[\s\S]*Agregado/.test(await textoBurbuja(w)), await textoBurbuja(w));
        af.cierto('…y cabe en la ventana', await burbujaDentro(w));
        await imp.click();
        await w.keyboard.press('Escape');
        await w.waitForTimeout(200);
        af.cierto('Esc cerró la burbuja', !(await burbujaVisible(w)));
        af.cierto('…y la página de Cobros sigue abierta',
            await w.locator('#view-ajustes .ajustes-pagina[data-tema="cobros"]').isVisible());

        // ── 5. En la esquina de abajo a la derecha: se voltea y no se sale ──
        // Escenario armado (no hay pantalla con un (?) en esa esquina): un (?) de
        // botonAyuda() pegado al <body>. Dentro de una tarjeta no sirve: un
        // contenedor con transform lo atrapa y nunca llega a la esquina (la
        // primera versión de esta prueba pasaba aunque se quitara el volteo).
        await w.evaluate(() => {
            document.body.insertAdjacentHTML('beforeend', botonAyuda('impuesto'));
            const b = document.body.lastElementChild;
            b.id = 'ayuda-de-esquina';
            b.style.cssText = 'position:fixed;right:2px;bottom:2px;z-index:30000;';
        });
        const esquina = w.locator('#ayuda-de-esquina');
        af.cierto('botonAyuda() pinta un (?) con su nombre',
            (await esquina.textContent()) === '?' && (await esquina.getAttribute('aria-label')) === 'Ayuda: Impuestos');
        await esquina.hover();
        await w.waitForTimeout(200);
        af.cierto('un (?) en la esquina abre la burbuja volteada, dentro de la ventana',
            (await burbujaVisible(w)) && (await burbujaDentro(w)));
        af.cierto('…por ENCIMA del (?), sin taparlo',
            await w.evaluate(() => document.querySelector('#ayuda-burbuja').getBoundingClientRect().bottom
                <= document.querySelector('#ayuda-de-esquina').getBoundingClientRect().top));
        await alejarCursor(w);
        await w.evaluate(() => document.querySelector('#ayuda-de-esquina').remove());
    },
};
