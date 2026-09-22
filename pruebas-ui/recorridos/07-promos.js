// ============================================================================
// RECORRIDO 7 — LAS PROMOS: CREAR, VENDER, IMPRIMIR (PLAN_OFERTAS_V1, Bloque 2)
//
// Lo que el plan pide poder ENSEÑAR: el dueño crea "Martes 2x1 tacos", la cajera
// lo vende con dos toques, sale el ticket con "Ahorraste $25", y al día
// siguiente la promo ya no está.
//
// ⚠️ Como el recorrido 4, el final no se comprueba mirando la pantalla sino
// preguntándole al SERVIDOR: el desktop sube sus ventas como diferidas, y si su
// copia de la regla se desviara, la pantalla diría $35 y el servidor otra cosa.
//
// Dos sustituciones, y solo dos:
//   · la IMPRESORA: el handler de `imprimir-ticket` del proceso principal se
//     cambia por uno que guarda el HTML (imprimir de verdad abre un diálogo del
//     sistema). El botón, el armado del ticket y el puente son los reales.
//   · el RELOJ, al final, para ver el día siguiente sin esperar 24 horas.
// ============================================================================

const {
    irA, crearCuenta, aceptarDialogo, leerBase, leerImporte,
    crearMesas, abrirMesa, activarPremiumDePrueba,
} = require('../lib/cajero');

const PASTOR = 25, ARRACHERA = 35, COCA = 25;

/** El HTML del último ticket "impreso", capturado en el proceso principal. */
async function capturarImpresora(app) {
    await app.electron.evaluate(({ ipcMain }) => {
        global.__tickets = [];
        ipcMain.removeHandler('imprimir-ticket');
        ipcMain.handle('imprimir-ticket', (_e, html) => { global.__tickets.push(html); return { success: true }; });
    });
}
async function ultimoTicket(app) {
    for (let i = 0; i < 20; i++) {
        const t = await app.electron.evaluate(() => (global.__tickets || []).slice(-1)[0] || null);
        if (t) return t;
        await app.ventana.waitForTimeout(500);
    }
    return null;
}
const textoDe = (html) => String(html || '').replace(/<style[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ');

/** Toca una promo y elige sus productos en la hoja, a clics. */
async function elegirPromo(w, contenedor, nombrePromo, productos) {
    await w.click(contenedor + ' .promo-card:has-text("' + nombrePromo + '")');
    await w.waitForSelector('#modal-promo-eleccion:not(.hidden)', { timeout: 10000 });
    for (const p of productos) {
        await w.click('#promo-eleccion-grid .promo-eleccion-prod:has(strong:text-is("' + p + '"))');
        await w.waitForTimeout(300);
    }
}

async function esperarEnServidor(w, api, cumple, intentos = 14) {
    for (let i = 0; i < intentos; i++) {
        const pedidos = await api.exigir('GET', '/api/orders?limit=50');
        const hallado = (pedidos.data || []).find(cumple);
        if (hallado) return hallado;
        await w.waitForTimeout(1500);
    }
    return null;
}

module.exports = {
    nombre: 'Promos: crear un 2x1, venderlo, imprimirlo y que al día siguiente no esté',
    etiqueta: 'promos',
    necesitaBackend: true,

    async ejecutar({ app, af, backend }) {
        const w = app.ventana;
        const base = leerBase(app.perfil);
        // Compara arreglos y objetos por su contenido (af.igual usa ===).
        const igual = (d, real, esperado) => (typeof esperado === 'object' && esperado !== null)
            ? af.cierto(d + ' = ' + JSON.stringify(esperado), JSON.stringify(real) === JSON.stringify(esperado),
                'esperaba ' + JSON.stringify(esperado) + ' y llegó ' + JSON.stringify(real))
            : af.igual(d, real, esperado);
        const correo = 'promos+' + Date.now() + '@zenit.pruebas';
        const contrasena = 'zenit-pruebas-2026';

        // ── Siembra: la cuenta, el plan y el menú de tacos ─────────────────
        await crearCuenta(app, { url: backend.api, nombre: 'Taquería 2x1', correo, contrasena });
        const api = await backend.comoNegocio(correo, contrasena);
        await api.exigir('POST', '/api/billing/start-trial');   // Ofertas es Premium (§8)
        const tacos = await api.exigir('POST', '/api/categories', { name: 'Tacos', emoji: '🌮' });
        await api.exigir('POST', '/api/products', { name: 'Pastor', price: PASTOR, category_id: tacos.id });
        await api.exigir('POST', '/api/products', { name: 'Arrachera', price: ARRACHERA, category_id: tacos.id });
        await activarPremiumDePrueba(app);   // recarga: la app baja el menú nuevo
        let local = null;
        for (let i = 0; i < 20 && !local; i++) {
            await w.waitForTimeout(1000);
            local = await base.una("SELECT id FROM productos WHERE nombre = 'Arrachera'");
        }
        af.cierto('el menú de tacos bajó al equipo', Boolean(local), 'la SQLite local no tiene la arrachera');
        await capturarImpresora(app);
        // Una venta hecha "desde otra caja": así el folio del servidor y el del
        // equipo ya NO coinciden. Con folios iguales, el ticket que se pedía al
        // servidor con el id local salía bien por casualidad (y en una corrida
        // suelta de este recorrido, pasaba). Con folios distintos imprimía OTRA
        // venta — la de esta Coca.
        const coca = ((await api.exigir('GET', '/api/products?limit=100')).data || []).find((p) => p.name === 'Coca Cola');
        await api.exigir('POST', '/api/orders', { items: [{ product_id: coca.id, quantity: 1 }], payment_method: 'efectivo' });

        // ── El dueño crea "Martes 2x1 tacos" (para HOY, sea el día que sea) ──
        const hoy = new Date().getDay();
        await irA(app, 'ofertas');
        await w.click('#view-ofertas .inv-tab:has-text("Promos")');
        await w.click('#btn-nueva-promo');
        await w.waitForSelector('#modal-promo:not(.hidden)');
        await w.click('.promo-plantillas button[data-plantilla="2x1"]');
        await w.selectOption('#npromo-huecos .npromo-que', 'c:' + tacos.id);
        await w.fill('#npromo-nombre', 'Martes 2x1 tacos');
        await w.check('#pcal-con');
        for (let d = 0; d < 7; d++) {
            if (d !== hoy) await w.click('.cal-dia:has(#pcal-dia-' + d + ') span');
        }
        await w.waitForTimeout(300);
        const vista = await w.locator('#npromo-vista').innerText();
        af.cierto('la vista previa enseña lo que va a cobrar con los productos REALES',
            /Arrachera \$35\.00 \+ Pastor \$25\.00 → cobras \$35\.00/.test(vista) && /ahorra \$25\.00/.test(vista),
            'la vista previa dice: ' + vista);
        await w.click('#npromo-guardar');
        await w.waitForSelector('#modal-promo', { state: 'hidden', timeout: 20000 });

        const enServidor = (await api.exigir('GET', '/api/offers/combos')).find((c) => c.name === 'Martes 2x1 tacos');
        af.cierto('la promo existe en el SERVIDOR', Boolean(enServidor), 'no se creó');
        if (enServidor) {
            igual('como un 2x1: regala el más barato y cobra 1', [enServidor.tipo, enServidor.paga], ['regalar_mas_barato', 1]);
            igual('que lleva 2 de la categoría Tacos', enServidor.slots.map((s) => [s.quantity, s.category_id]), [[2, tacos.id]]);
            igual('solo el día de hoy', enServidor.calendario, { dias: [hoy] });
            igual('y `items` no trae el hueco de categoría (trampa 1)', enServidor.items.length, 0);
        }
        af.cierto('la lista dice que está activa AHORA',
            (await w.locator('#tabla-combos tr:has-text("Martes 2x1 tacos")').innerText()).includes('Activa ahora'),
            'la fila de la promo no dice que está activa');
        await app.foto('promos-ofertas');

        // ── La cajera la vende con dos toques ──────────────────────────────
        await irA(app, 'nueva-venta');
        af.cierto('el botón de la promo aparece arriba de los productos',
            await w.locator('#promos-venta .promo-card:has-text("Martes 2x1 tacos")').isVisible(),
            'no hay botón de promo en la pantalla de venta');
        await elegirPromo(w, '#promos-venta', 'Martes 2x1 tacos', ['Pastor', 'Arrachera']);
        af.cierto('la hoja dice lo que cobra y lo que ahorra el cliente',
            /Cobras \$35\.00.*ahorra \$25\.00/.test(await w.locator('#promo-eleccion-resumen').innerText()),
            'resumen: ' + await w.locator('#promo-eleccion-resumen').innerText());
        await w.click('#promo-eleccion-listo');
        await w.waitForSelector('#modal-promo-eleccion', { state: 'hidden' });
        igual('entra al carrito como UN renglón', await w.locator('#carrito-items .cart-item').count(), 1);
        af.dinero('que cobra $35', leerImporte(await w.locator('#total-venta').innerText()), 35);

        await w.click('#grid-venta .product-card:has(h4:text-is("Coca Cola"))');
        await w.waitForTimeout(300);
        af.dinero('con una Coca suelta, el ticket va en $60', leerImporte(await w.locator('#total-venta').innerText()), 35 + COCA);

        // Juntar ofertas APAGADO (de fábrica): el 10% solo toca la Coca (§3.4).
        await w.click('#view-nueva-venta .btn-discount');
        await w.waitForSelector('#modal-descuento:not(.hidden)');
        const boton10 = w.locator('#descuentos-rapidos button:has-text("Descuento 10%")');
        af.cierto('el modal ofrece el descuento del 10%', await boton10.count() > 0, 'no aparece "Descuento 10%"');
        af.cierto('y anuncia lo que de verdad quita: 10% de la Coca, no de la promo',
            (await boton10.innerText()).includes('-$2.50'), 'el botón dice: ' + await boton10.innerText());
        await boton10.click();
        await w.waitForTimeout(500);
        igual('🔴 el descuento aplicado es $2.50, no $6', (await w.locator('#descuento-aplicado').innerText()).trim(), '-$2.50');

        await w.click('#view-nueva-venta .cart-summary button.btn-block');
        await w.waitForSelector('#modalPago:not(.hidden)');
        await w.click('#method-efectivo');
        await w.fill('#efectivo-recibido', '1000');
        await w.dispatchEvent('#efectivo-recibido', 'input');
        await w.waitForTimeout(300);
        await w.click('#btn-confirmar-final');
        await w.waitForSelector('#modal-imprimir-ticket:not(.hidden)', { timeout: 15000 });
        await w.click('#btn-si-imprimir');
        const ticket = textoDe(await ultimoTicket(app));
        af.cierto('el ticket agrupa la promo en UN renglón con sus tacos debajo',
            /Martes 2x1 tacos x1 \$35\.00 Pastor Arrachera/.test(ticket), 'el ticket dice: ' + ticket.slice(0, 400));
        af.cierto('y al pie dice "Ahorraste $25.00"', /Ahorraste: \$25\.00/.test(ticket), 'el ticket dice: ' + ticket.slice(0, 600));
        await aceptarDialogo(app);

        const venta = await esperarEnServidor(w, api, (o) => (o.items || []).some((it) => it.promo_group));
        af.cierto('la venta llegó al SERVIDOR con su promo', Boolean(venta), 'el backend no tiene ninguna venta con promo');
        if (venta) {
            const promo = venta.items.filter((it) => it.promo_group).sort((a, b) => a.unit_price - b.unit_price);
            igual('🔴 el servidor guardó los dos tacos repartidos 14.58 + 20.42',
                promo.map((it) => parseFloat(it.unit_price)), [14.58, 20.42]);
            igual('del mismo grupo, con su nombre y su precio de lista',
                [promo[0].promo_group === promo[1].promo_group, promo[0].promo_name, promo.map((it) => parseFloat(it.list_price))],
                [true, 'Martes 2x1 tacos', [PASTOR, ARRACHERA]]);
            af.dinero('el descuento que registró el servidor es el mismo $2.50', venta.discount_amount, 2.5);
            af.dinero('y el total, $57.50', venta.total, 35 + COCA - 2.5);
            const auditoria = await api.exigir('GET', '/api/audit');
            const raras = (auditoria.data || auditoria).filter((l) => ['discount_mismatch', 'offline_price'].includes(l.action_type));
            igual('sin nada "sospechoso" en la auditoría: la copia del desktop cobra lo mismo que el servidor',
                raras.map((l) => l.action_type), []);
        }

        // ── La sugerencia: dos tacos sueltos ────────────────────────────────
        await w.click('#grid-venta .product-card:has(h4:text-is("Pastor"))');
        await w.click('#grid-venta .product-card:has(h4:text-is("Arrachera"))');
        await w.waitForTimeout(400);
        af.cierto('con dos tacos sueltos, sugiere convertirlos en el 2x1',
            /Convertir a Martes 2x1 tacos\? Ahorra \$25\.00/.test(await w.locator('#promo-sugerencia').innerText()),
            'la sugerencia dice: ' + await w.locator('#promo-sugerencia').innerText());
        af.dinero('pero NO convierte sola: el ticket sigue en $60', leerImporte(await w.locator('#total-venta').innerText()), 60);
        await w.click('#promo-sugerencia button');
        await w.waitForTimeout(400);
        af.dinero('un toque y queda en $35', leerImporte(await w.locator('#total-venta').innerText()), 35);
        af.cierto('y la sugerencia se va', await w.locator('#promo-sugerencia').isHidden(), 'la sugerencia siguió en pantalla');
        await w.click('#view-nueva-venta .ticket-header .btn-icon.danger');
        await aceptarDialogo(app);

        // ── En una mesa: agregar, quitar la promo entera, dividir y cobrar ──
        await crearMesas(app, [{ nombre: 'Mesa Promo', zona: 'Interior', capacidad: 4 }]);
        await abrirMesa(app, 'Mesa Promo', 2);
        await w.click('#mesas-grid > div:has(span:text-is("Mesa Promo"))');
        await w.waitForSelector('#mesa-panel:not(.hidden)');
        const agregarATabla = async (promos, sueltos) => {
            await w.click('#mesa-panel button:has-text("Agregar productos")');
            await w.waitForSelector('#modal-agregar-productos-mesa:not(.hidden)');
            for (const elegidos of promos) {
                await elegirPromo(w, '#mesa-promos', 'Martes 2x1 tacos', elegidos);
                await w.click('#promo-eleccion-listo');
                await w.waitForSelector('#modal-promo-eleccion', { state: 'hidden' });
            }
            for (const s of sueltos) {
                await w.click('#mesa-prod-grid > div:has-text("' + s + '")');
                await w.waitForTimeout(200);
            }
            await w.click('#modal-agregar-productos-mesa button:has-text("Agregar a la mesa")');
            await w.waitForTimeout(2200);
        };
        await agregarATabla([['Pastor', 'Arrachera'], ['Pastor', 'Pastor']], ['Coca Cola', 'Coca Cola']);
        igual('la mesa enseña cada promo JUNTA (dos renglones de promo)', await w.locator('#mesa-panel-items .mesa-promo').count(), 2);
        await app.foto('promos-mesa');

        // Quitar el 2x1 de dos pastores: se va entero (trampa 4).
        await w.locator('#mesa-panel-items .mesa-promo').nth(1).locator('button[title="Quitar la promo"]').click();
        await aceptarDialogo(app);
        await w.waitForTimeout(2000);
        igual('quitar la promo la quita ENTERA', await w.locator('#mesa-panel-items .mesa-promo').count(), 1);
        const mesaServidor = await api.exigir('GET', '/api/tables');
        const abierta = (mesaServidor.data || mesaServidor).find((t) => t.name === 'Mesa Promo');
        const itemsAbierta = (abierta && abierta.open_order && abierta.open_order.items) || [];
        igual('en el servidor quedan 2 tacos de promo y 2 Cocas, sin "medio 2x1"',
            [itemsAbierta.filter((it) => it.promo_group).length, itemsAbierta.filter((it) => !it.promo_group).length], [2, 1]);

        // Dividir POR ITEMS: la promo es UNA unidad que va entera a un pago.
        await w.click('#mesa-panel button:has-text("Cobrar")');
        await w.waitForSelector('#modal-cobrar-mesa:not(.hidden)');
        af.dinero('la cuenta es la promo + dos Cocas', leerImporte(await w.locator('#cobrar-mesa-total').innerText()), 35 + 2 * COCA);
        await w.click('#btn-dividir-mesa');
        await w.click('#tab-division-items');
        await w.waitForTimeout(400);
        const filasUnidad = await w.locator('#lista-items-division select').evaluateAll((s) => s.map((x) => x.dataset.uid));
        igual('la promo aparece UNA vez en la división (más las dos Cocas)',
            [filasUnidad.filter((u) => u.startsWith('promo:')).length, filasUnidad.length], [1, 3]);
        for (const uid of filasUnidad.filter((u) => !u.startsWith('promo:'))) {
            await w.selectOption('#lista-items-division select[data-uid="' + uid + '"]', '1');
            await w.waitForTimeout(250);
        }
        await w.locator('#lista-pagos-mesa > div').nth(1).locator('select').selectOption('tarjeta');
        await w.waitForTimeout(300);
        const montos = await w.locator('#lista-pagos-mesa > div').allInnerTexts();
        af.cierto('pago 1 = la promo ($35), pago 2 = las Cocas ($50)',
            /\$35\.00/.test(montos[0]) && /\$50\.00/.test(montos[1]), 'los pagos dicen: ' + JSON.stringify(montos));
        await w.click('#btn-confirmar-cobrar-mesa');
        await w.waitForSelector('#modal-cobrar-mesa button:has-text("Imprimir ticket")', { timeout: 20000 });
        await w.click('#modal-cobrar-mesa button:has-text("Imprimir ticket")');
        const ticketMesa = textoDe(await ultimoTicket(app));
        af.cierto('el ticket de la mesa agrupa la promo y dice "Ahorraste $25.00"',
            /1× Martes 2x1 tacos/.test(ticketMesa) && /Ahorraste \$25\.00/.test(ticketMesa), 'el ticket dice: ' + ticketMesa.slice(0, 500));
        await w.click('#modal-cobrar-mesa button:has-text("Cerrar")');
        await aceptarDialogo(app);

        const cobrada = await esperarEnServidor(w, api, (o) => o.table_id && o.paid_at);
        af.cierto('la mesa quedó COBRADA en el servidor', Boolean(cobrada), 'no hay ninguna mesa cobrada');
        if (cobrada) {
            const pagos = (cobrada.payments || []).map((p) => [p.method, parseFloat(p.amount)]).sort();
            igual('con el reparto de la división', pagos, [['efectivo', 35], ['tarjeta', 50]]);
        }

        // ── Al día siguiente la promo ya no existe ──────────────────────────
        await w.clock.setFixedTime(new Date(Date.now() + 86400000));
        await irA(app, 'ofertas');
        await irA(app, 'nueva-venta');
        igual('🔴 mañana el botón de la promo DESAPARECE', await w.locator('#promos-venta .promo-card').count(), 0);
        await irA(app, 'ofertas');
        await w.click('#view-ofertas .inv-tab:has-text("Promos")');
        af.cierto('y Ofertas dice que está fuera de horario',
            (await w.locator('#tabla-combos tr:has-text("Martes 2x1 tacos")').innerText()).includes('Fuera de horario'),
            'la lista no avisa que hoy no aplica');
        await base.cerrar();
    },
};
