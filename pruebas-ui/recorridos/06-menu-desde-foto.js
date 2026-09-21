// ============================================================================
// RECORRIDO 6 — EL MENÚ DESDE UNA FOTO (§57)
//
// El negocio elige la foto de su menú y Zenit da de alta sus productos. Esto
// recorre la pantalla ENTERA a clics: elegir el archivo, leerlo, revisar la
// propuesta, CORREGIR lo que el lector leyó mal, y crear.
//
// 🔴 LO QUE DE VERDAD SE PRUEBA AQUÍ: que un precio mal leído se pueda arreglar
// ANTES de que llegue al catálogo. Un $2450 que debía ser $24.50 son cien ventas
// cobradas mal antes de que alguien lo note, y la pantalla existe para eso.
//
// ⚠️ Lo ÚNICO simulado es la llamada al modelo (`MENU_LECTOR_FALSO`, ver
// lib/menu-de-prueba.js): cada corrida costaría dinero y daría una respuesta
// distinta. Todo lo demás es real — la foto se reduce de verdad en el renderer,
// la ruta valida de verdad, y los productos se crean de verdad en Postgres. Por
// eso el final NO se comprueba mirando la pantalla, sino preguntándole al
// SERVIDOR por HTTP (misma regla del recorrido 4).
// ============================================================================

const zlib = require('zlib');
const { irA, crearCuenta, leerBase } = require('../lib/cajero');
const { MENU_DE_PRUEBA } = require('../lib/menu-de-prueba');

// ── Una foto "de celular" de verdad ─────────────────────────────────────────
// Hace falta una imagen GRANDE y que el navegador pueda dibujar, porque lo que
// se prueba es la trampa 7 de la idea: una foto de 3 a 8 MB no cabe en el
// límite de 2 MB del backend, y por eso el renderer la reduce antes de mandarla.
// Se genera un PNG a mano (no hay librería de imágenes en el repo, ni hace falta).
function _crc32(buf) {
    let c, tabla = _crc32.tabla;
    if (!tabla) {
        tabla = _crc32.tabla = [];
        for (let n = 0; n < 256; n++) {
            c = n;
            for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
            tabla[n] = c >>> 0;
        }
    }
    let crc = 0xffffffff;
    for (const b of buf) crc = tabla[(crc ^ b) & 0xff] ^ (crc >>> 8);
    return (crc ^ 0xffffffff) >>> 0;
}

function _trozo(tipo, datos) {
    const largo = Buffer.alloc(4);
    largo.writeUInt32BE(datos.length);
    const cuerpo = Buffer.concat([Buffer.from(tipo, 'ascii'), datos]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(_crc32(cuerpo));
    return Buffer.concat([largo, cuerpo, crc]);
}

function fotoGrandePng(ancho = 3000, alto = 2000) {
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(ancho, 0);
    ihdr.writeUInt32BE(alto, 4);
    ihdr[8] = 8;   // 8 bits por canal
    ihdr[9] = 2;   // RGB
    // Un degradado en vez de un color plano: un PNG de color plano pesa cuatro
    // kilobytes y no probaría nada. Éste pesa megabytes, como una foto.
    // Degradado en los bits altos + ruido en los bajos. El degradado solo se
    // comprimía a 1,7 MB —menos que una foto de celular— y entonces la prueba no
    // probaba nada; el ruido la deja en varios megas, como la de verdad.
    const crudo = Buffer.alloc(alto * (1 + ancho * 3));
    let p = 0;
    let semilla = 12345;
    const azar = () => (semilla = (semilla * 1103515245 + 12345) & 0x7fffffff) & 0x0f;
    for (let y = 0; y < alto; y++) {
        crudo[p++] = 0; // sin filtro
        for (let x = 0; x < ancho; x++) {
            crudo[p++] = ((x * 7 + y * 13) & 0xf0) | azar();
            crudo[p++] = ((x * 3 + y * 5) & 0xf0) | azar();
            crudo[p++] = ((x + y) & 0xf0) | azar();
        }
    }
    return Buffer.concat([
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        _trozo('IHDR', ihdr),
        _trozo('IDAT', zlib.deflateSync(crudo, { level: 1 })),
        _trozo('IEND', Buffer.alloc(0)),
    ]);
}

/** El índice del renglón que lleva ese nombre (el orden de pantalla no es el del array). */
function indiceDe(w, nombre) {
    return w.evaluate((n) => {
        const campos = [...document.querySelectorAll('#menufoto-lista input[id^="mf-nom-"]')];
        const el = campos.find((i) => i.value === n);
        return el ? parseInt(el.id.replace('mf-nom-', ''), 10) : -1;
    }, nombre);
}

module.exports = {
    nombre: 'El menú desde una foto: leer, corregir y crear',
    etiqueta: 'menu',
    necesitaBackend: true,

    async ejecutar({ app, af, backend }) {
        const w = app.ventana;
        const base = leerBase(app.perfil);

        const correo = 'menu+' + Date.now() + '@zenit.pruebas';
        const contrasena = 'zenit-pruebas-2026';
        await crearCuenta(app, {
            url: backend.api,
            nombre: 'Café del Banco',
            correo,
            contrasena,
        });
        const api = await backend.comoNegocio(correo, contrasena);

        // ── Que se ENCUENTRE (2026-09-19) ────────────────────────────────────
        // El dueño del producto abrió la app y no dio con el botón. Una función
        // que nadie encuentra no existe, así que esto se afirma igual que el resto.
        // Una cuenta nueva trae 4 productos de ejemplo: catálogo chico, invitación.
        // Se llega DESDE Ajustes, que es larga y quedó bajada al crear la cuenta:
        // así era como el tablero se abría a media página y el aviso, que vive
        // arriba, quedaba fuera de la vista.
        await irA(app, 'dashboard');
        await w.waitForTimeout(800);
        af.cierto('el DASHBOARD invita a importar el menú',
            await w.locator('#menufoto-aviso-dashboard').isVisible(),
            'un negocio con 4 productos de ejemplo no ve ninguna invitación en el tablero');
        // "Visible" en Playwright es "pintado", no "a la vista": hay que mirar dónde cae.
        const caja = await w.locator('#menufoto-aviso-dashboard').boundingBox();
        const alto = await w.evaluate(() => window.innerHeight);
        af.cierto('y se ve AL ENTRAR, sin tener que subir', Boolean(caja) && caja.y >= 0 && caja.y < alto,
            'el aviso quedó en y=' + (caja && Math.round(caja.y)) + ' de una ventana de ' + alto +
            ' px: el tablero se abrió a media página');
        await app.foto('menu-aviso-dashboard');

        await irA(app, 'productos');
        const primerBoton = await w.locator('#view-productos .header-actions button').first().innerText();
        af.cierto('en PRODUCTOS el botón es el PRIMERO de la fila', /Importar men/.test(primerBoton),
            'el primer botón de Productos es "' + primerBoton.trim() + '"');
        af.igual('y hay UNO solo, no dos iguales a la vista',
            await w.locator('#view-productos button:visible:has-text("Importar menú")').count(), 1);

        // Se oculta, y se queda oculto: es una decisión del dueño, no un capricho.
        await irA(app, 'dashboard');
        await w.click('#menufoto-aviso-dashboard .menufoto-aviso-cerrar');
        af.cierto('el aviso se puede OCULTAR', !(await w.locator('#menufoto-aviso-dashboard').isVisible()),
            'tocar la × no quitó el aviso');
        await irA(app, 'productos');
        await irA(app, 'dashboard');
        af.cierto('y sigue oculto al volver al tablero',
            !(await w.locator('#menufoto-aviso-dashboard').isVisible()),
            'el dueño dijo que no y el tablero se lo vuelve a ofrecer');

        // Ajustes: la entrada FIJA, para quien lo busca después de haberlo ocultado.
        await irA(app, 'ajustes');
        af.cierto('AJUSTES tiene su tarjeta, aunque el aviso esté oculto',
            await w.locator('#card-menu-foto').isVisible(),
            'con el aviso oculto ya no habría forma de encontrarlo fuera de Productos');
        await w.click('#card-menu-foto .btn-importar-menu');
        await w.waitForSelector('#modalMenuFoto:not(.hidden)');
        af.cierto('y su botón abre el importador', true);
        await w.click('#menufoto-paso-elegir button:has-text("Cancelar")');
        await w.waitForSelector('#modalMenuFoto', { state: 'hidden' });

        // ── Elegir la foto ──────────────────────────────────────────────────
        await irA(app, 'productos');
        await w.click('#view-productos .header-actions .btn-importar-menu');
        await w.waitForSelector('#modalMenuFoto:not(.hidden)');

        const foto = fotoGrandePng();
        const fotoKb = foto.length / 1024;
        af.cierto('la foto de prueba pesa lo que una de celular (' + Math.round(fotoKb / 1024 * 10) / 10 + ' MB)',
            foto.length > 3 * 1024 * 1024,
            'la foto generada pesa solo ' + foto.length + ' bytes: no probaría la reducción');

        await w.setInputFiles('#menufoto-input', {
            name: 'menu.png', mimeType: 'image/png', buffer: foto,
        });
        await w.waitForSelector('#menufoto-lista-archivos >> text=menu.png');

        // 🔴 LA TRAMPA 7: sin reducir, esto daría un 413 en el primer negocio real.
        // No se fija un número a ojo: se compara contra el original, que es lo que
        // de verdad se quiere afirmar (y base64 infla otro 33% encima).
        const peso = await w.locator('#menufoto-lista-archivos').innerText();
        const kb = /([\d.]+)\s*(KB|MB)/.exec(peso);
        const enKb = kb ? (kb[2] === 'MB' ? parseFloat(kb[1]) * 1024 : parseFloat(kb[1])) : Infinity;
        af.cierto('la foto se REDUJO antes de mandarla (' + (kb ? kb[0] : '?') + ')',
            enKb < fotoKb / 4 && enKb < 1536,
            'la foto viaja con ' + (kb ? kb[0] : 'peso desconocido') + ' de los ' +
            Math.round(fotoKb) + ' KB originales: el backend la rechazaría');

        // ── Leer ────────────────────────────────────────────────────────────
        await w.click('#menufoto-btn-leer');
        await w.waitForSelector('#menufoto-paso-revisar:not(.hidden)', { timeout: 60000 });

        // ── Revisar: lo dudoso, arriba ──────────────────────────────────────
        // Se afirma la INVARIANTE, no un renglón concreto (§46.6): "ningún
        // producto limpio aparece antes de uno que hay que revisar". La primera
        // versión de esta prueba exigía que el primero fuera la tarta y falló
        // teniendo la app razón — el capuchino también es dudoso, porque el menú
        // lo trae dos veces con precios distintos.
        const orden = await w.locator('#menufoto-lista input[id^="mf-nom-"]').evaluateAll(
            (els) => els.map((e) => e.value)
        );
        // ⚠️ "Coca Cola" NO va en esta lista, y no es un descuido: un producto que
        // el negocio YA TIENE no es una duda que resolver. Viene desmarcado, no se
        // va a duplicar y no hay nada que decidir, así que subirlo al principio
        // solo taparía lo que sí hay que mirar (`dudoso` lo excluye a propósito).
        const REVISAR = ['Tarta de queso', 'Jugo del día', 'Chocolate caliente', 'Rebanada de pastel', 'Capuchino'];
        const LIMPIOS = ['Café americano', 'Latte', 'Pan de plátano', 'Croissant'];
        const ultimoDudoso = Math.max(...REVISAR.map((n) => orden.indexOf(n)));
        const primerLimpio = Math.min(...LIMPIOS.map((n) => orden.indexOf(n)));
        af.cierto('lo que hay que revisar sale ARRIBA, sin excepción', ultimoDudoso < primerLimpio,
            'el orden de la pantalla fue: ' + JSON.stringify(orden));

        const iTarta = await indiceDe(w, 'Tarta de queso');
        const filaTarta = await w.locator('#menufoto-lista > div')
            .filter({ has: w.locator('#mf-nom-' + iTarta) }).innerText();
        af.cierto('dice que el precio está fuera de lo normal', /fuera de lo normal/i.test(filaTarta),
            'la fila de la tarta no explica por qué está marcada: ' + filaTarta);
        af.cierto('y dice contra qué lo comparó', /rondan/i.test(filaTarta),
            'no menciona la mediana del menú, que es lo que hace entendible el aviso');

        const iJugo = await indiceDe(w, 'Jugo del día');
        af.cierto('el que no tiene precio nace DESMARCADO',
            !(await w.locator('#mf-inc-' + iJugo).isChecked()),
            'un producto sin precio venía marcado: el servidor lo rechazaría');

        const iCoca = await indiceDe(w, 'Coca Cola');
        af.cierto('el que ya existe nace DESMARCADO',
            !(await w.locator('#mf-inc-' + iCoca).isChecked()),
            'un producto que ya está en el catálogo venía marcado para crearse otra vez');

        af.igual('el botón dice cuántos va a crear',
            (await w.locator('#menufoto-btn-crear').innerText()).trim(), 'Crear 8 productos');

        // ── Corregir, que es para lo que existe esta pantalla ───────────────
        await w.locator('#mf-pre-' + iTarta).fill('24.50');
        await w.locator('#mf-pre-' + iTarta).dispatchEvent('change');
        await w.locator('#mf-pre-' + iJugo).fill('30');
        await w.locator('#mf-pre-' + iJugo).dispatchEvent('change');

        af.cierto('escribirle el precio al que no tenía lo marca solo',
            await w.locator('#mf-inc-' + iJugo).isChecked(),
            'le puse precio y siguió desmarcado: el dueño creería que lo va a crear');
        af.igual('y el botón vuelve a contar',
            (await w.locator('#menufoto-btn-crear').innerText()).trim(), 'Crear 9 productos');

        // ── Crear ───────────────────────────────────────────────────────────
        await w.click('#menufoto-btn-crear');
        // Se espera a lo que llegue primero: la pantalla de "listo" o un aviso.
        // Sin esta carrera, un modal atascado se reporta como "se interrumpió:
        // timeout de 60 s", que no dice nada — y eso pasó de verdad al probar los
        // dientes de este recorrido.
        await Promise.race([
            w.waitForSelector('#menufoto-paso-listo:not(.hidden)', { timeout: 60000 }),
            w.waitForSelector('#modal-dialogo-zenit', { timeout: 60000 }),
        ]);
        const aviso = w.locator('#modal-dialogo-zenit');
        if (await aviso.count()) {
            af.cierto('crear no se atascó en un aviso', false,
                'la app respondió con: ' + (await aviso.innerText()).replace(/\s+/g, ' ').trim());
            await w.click('#dialogo-zenit-ok');
        }
        await w.waitForSelector('#menufoto-paso-listo:not(.hidden)', { timeout: 60000 });
        const resultado = await w.locator('#menufoto-resultado').innerText();
        af.cierto('la pantalla dice cuántos se crearon', /Se crearon\s+9\s+producto/.test(resultado),
            'el resumen final dice: ' + resultado);
        await w.click('#menufoto-paso-listo button:has-text("Listo")');

        // ── Y ahora la verdad: preguntarle al SERVIDOR ──────────────────────
        const enNube = await api.exigir('GET', '/api/products?limit=100');
        const productos = enNube.data || enNube;
        const porNombre = (n) => productos.filter((p) => p.name === n);

        const tarta = porNombre('Tarta de queso')[0];
        af.cierto('la tarta existe en el servidor', Boolean(tarta), 'no se creó');
        if (tarta) {
            af.dinero('🔴 y se guardó con el precio CORREGIDO, no con el que leyó', tarta.price, 24.50);
            af.igual('sin control de existencias (una foto no sabe cuántas hay)', tarta.stock, null);
        }

        af.igual('el producto que ya existía NO se duplicó', porNombre('Coca Cola').length, 1);
        af.igual('el que no tenía precio se creó con el que se le escribió',
            porNombre('Jugo del día').length, 1);
        af.dinero('con su precio', (porNombre('Jugo del día')[0] || {}).price, 30);

        const categorias = await api.exigir('GET', '/api/categories');
        const nombresCat = (categorias.data || categorias).map((c) => c.name);
        af.cierto('se crearon las categorías del menú',
            nombresCat.includes('Bebidas calientes') && nombresCat.includes('Panadería'),
            'el servidor tiene: ' + JSON.stringify(nombresCat));

        const cafe = porNombre('Café americano')[0];
        af.cierto('y los productos quedaron dentro de su categoría',
            Boolean(cafe && cafe.category_id), 'el café quedó sin categoría');

        // ── Y que el equipo pueda venderlos SIN internet ────────────────────
        // `confirmar` escribe en el servidor. Si la sincronización no los baja,
        // el negocio importa su menú y no puede cobrar con la red caída (§13).
        let local = null;
        for (let intento = 0; intento < 8 && !local; intento++) {
            await w.waitForTimeout(1500);
            local = await base.una('SELECT nombre, precio FROM productos WHERE nombre = ?', ['Tarta de queso']);
        }
        af.cierto('el menú importado bajó al equipo', Boolean(local),
            'la SQLite local no tiene la tarta: sin conexión, ese producto no se podría vender');
        if (local) af.dinero('con el precio corregido también en el equipo', local.precio, 24.50);

        // El menú de mentira tiene 11 renglones y uno repetido: la pantalla no
        // puede haber creado el repetido dos veces.
        af.igual('el renglón repetido se unificó', porNombre('Capuchino').length, 1);
        af.cierto('el banco usó el menú de prueba, no otro',
            MENU_DE_PRUEBA.productos.length === 11,
            'alguien cambió lib/menu-de-prueba.js y las cuentas de este recorrido ya no valen');

        await base.cerrar();
    },
};
