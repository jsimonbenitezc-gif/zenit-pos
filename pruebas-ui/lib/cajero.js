// ============================================================================
// pruebas-ui/lib/cajero.js — las acciones de un cajero, escritas una sola vez
//
// Cada función de aquí es lo que hace una PERSONA con el ratón: entra a una
// vista, teclea un importe, elige un método, confirma. Los recorridos se leen
// como el guion de un turno y no como una lista de selectores.
//
// ⚠️ NADA de `win.evaluate(() => ejecutarVenta())`. Ver el porqué en lib/app.js:
// llamar a la función por dentro da por buena precisamente la parte que más se ha
// roto en este repo, que es el CABLE entre el botón y la función.
//
// Dos únicas excepciones, y las dos son de LECTURA, no de acción:
//   • leer el texto que ya está pintado en la pantalla, y
//   • abrir la SQLite del perfil desechable para comprobar lo que quedó guardado.
// Comprobar el resultado por dentro está bien; provocarlo por dentro, no.
// ============================================================================

const path = require('path');

const ESPERA = 400;   // margen para que el renderer repinte tras un clic

// ── Navegación ──────────────────────────────────────────────────────────────

async function irA(app, vista) {
    app.consola.enPaso('vista: ' + vista);
    await app.ventana.click('.menu-item[data-view="' + vista + '"]');
    await app.ventana.waitForSelector('#view-' + vista + '.view.active', { timeout: 10000 });
    await app.ventana.waitForTimeout(700);
}

/** Cierra el diálogo de Zenit que esté abierto (confirmarZenit / alertaZenit). */
async function aceptarDialogo(app) {
    const ok = app.ventana.locator('#dialogo-zenit-ok');
    if (await ok.count()) await ok.click();
    await app.ventana.waitForTimeout(200);
}

// ── Venta de mostrador ──────────────────────────────────────────────────────

/**
 * Vende en la pantalla de venta y devuelve lo que la pantalla dijo que cobraba.
 *
 * @param {Array<{nombre:string, veces?:number}>} productos
 * @param {object} cobro
 * @param {string=} cobro.metodo    'efectivo' | 'tarjeta' | 'transferencia'
 * @param {number=} cobro.propina   importe (requiere las propinas encendidas)
 * @param {string=} cobro.propinaMetodo
 * @param {Array<{metodo:string, monto:number}>=} cobro.pagos  cuenta dividida
 */
async function venderEnMostrador(app, productos, cobro = {}) {
    const w = app.ventana;
    app.consola.enPaso('venta de mostrador');
    await irA(app, 'nueva-venta');
    await w.waitForSelector('#grid-venta .product-card', { timeout: 15000 });

    for (const p of productos) {
        for (let i = 0; i < (p.veces || 1); i++) {
            await w.click('#grid-venta .product-card:has(h4:text-is("' + p.nombre + '"))');
            await w.waitForTimeout(150);
        }
    }

    const totalPantalla = leerImporte(await w.locator('#total-venta').innerText());

    await w.click('#view-nueva-venta .cart-summary button.btn-block');   // "Cobrar"
    await w.waitForSelector('#modalPago:not(.hidden)', { timeout: 10000 });

    if (cobro.pagos && cobro.pagos.length) {
        await _repartirPago(app, cobro.pagos);
    } else {
        const metodo = cobro.metodo || 'efectivo';
        await w.click('#method-' + metodo);
        await w.waitForTimeout(ESPERA);
    }

    if (cobro.propina) {
        await w.waitForSelector('#seccion-propina-venta:not(.hidden)', { timeout: 5000 });
        await w.fill('#propina-input', String(cobro.propina));
        await w.dispatchEvent('#propina-input', 'input');
        if (cobro.propinaMetodo) await w.selectOption('#propina-metodo', cobro.propinaMetodo);
        await w.waitForTimeout(ESPERA);
    }

    // El efectivo necesita que el cajero teclee lo que recibió, o el botón de
    // confirmar sigue apagado. Se le da de sobra: el cambio no se comprueba aquí.
    const pagaEnEfectivo = !cobro.pagos && (cobro.metodo || 'efectivo') === 'efectivo';
    if (pagaEnEfectivo) {
        await w.fill('#efectivo-recibido', '5000');
        await w.dispatchEvent('#efectivo-recibido', 'input');
        await w.waitForTimeout(ESPERA);
    }

    await w.click('#btn-confirmar-final');
    await w.waitForSelector('#modal-imprimir-ticket:not(.hidden)', { timeout: 15000 });
    const aviso = await w.locator('#print-confirm-sub').innerText();
    await w.click('#btn-no-imprimir');
    await w.waitForTimeout(ESPERA);

    return {
        total: totalPantalla,
        pedidoId: parseInt((aviso.match(/#(\d+)/) || [])[1], 10) || null,
    };
}

/** Reparte el total en varios métodos dentro del modal de cobro ya abierto. */
async function _repartirPago(app, pagos) {
    const w = app.ventana;
    await w.click('#btn-dividir-pago');
    await w.waitForSelector('#seccion-pago-dividido:not(.hidden)', { timeout: 5000 });

    // Arranca con dos filas; se agregan las que falten.
    const filas = () => w.locator('#lista-pagos-divididos > div');
    for (let i = await filas().count(); i < pagos.length; i++) {
        await w.click('#seccion-pago-dividido button:has-text("Agregar otro pago")');
        await w.waitForTimeout(250);
    }

    // Cada fila es: [método] [monto] ([propina] solo si están activas) [quitar].
    // Se recorre POR FILA y no por índice global de input, porque esa columna de
    // propina aparece y desaparece según el ajuste del negocio.
    for (let i = 0; i < pagos.length; i++) {
        const fila = filas().nth(i);
        await fila.locator('select').selectOption(pagos[i].metodo);
        await fila.locator('input').nth(0).fill(String(pagos[i].monto));
        if (pagos[i].propina) await fila.locator('input').nth(1).fill(String(pagos[i].propina));
        await w.waitForTimeout(250);
    }
    await w.waitForTimeout(ESPERA);
}

// ── Turno ───────────────────────────────────────────────────────────────────

async function abrirTurno(app, { nombre = 'Lupita', fondo = 1500 } = {}) {
    const w = app.ventana;
    app.consola.enPaso('abrir turno');
    await irA(app, 'turno');
    await w.waitForSelector('#turno-sin-turno', { state: 'visible', timeout: 10000 });
    await w.fill('#turno-nombre', nombre);
    await w.fill('#turno-fondo', String(fondo));
    await w.click('.turno-btn-abrir');
    await w.waitForSelector('#turno-activo:not(.hidden)', { timeout: 15000 });
    await w.waitForTimeout(ESPERA);
}

/** Los totales que la app muestra en vivo durante el turno. */
async function leerTotalesTurno(app) {
    const w = app.ventana;
    await irA(app, 'turno');
    const leer = async (id) => leerImporte(await w.locator('#' + id).innerText());
    return {
        ventas:        await leer('turno-total-ventas'),
        efectivo:      await leer('turno-total-efectivo'),
        tarjeta:       await leer('turno-total-tarjeta'),
        transferencia: await leer('turno-total-transferencia'),
        pedidos:       parseInt(await w.locator('#turno-total-pedidos').innerText(), 10),
    };
}

async function registrarMovimiento(app, { tipo, monto, motivo }) {
    const w = app.ventana;
    app.consola.enPaso('movimiento de caja: ' + tipo);
    await irA(app, 'turno');
    await w.click('#view-turno button:has-text("Movimiento")');
    await w.waitForSelector('#modal-movimiento-caja:not(.hidden)', { timeout: 10000 });
    await w.click('.mov-tipo-btn[data-tipo="' + tipo + '"]');
    await w.fill('#mov-caja-monto', String(monto));
    await w.fill('#mov-caja-motivo', motivo);

    // Sin cuenta vinculada no hay PIN de puesto configurado, así que el campo ni
    // aparece. Si algún día apareciera, este recorrido tendría que teclearlo: se
    // comprueba en vez de suponerlo.
    const pidePin = await w.locator('#mov-caja-pin-group').isVisible();
    await w.click('#mov-caja-confirmar');

    // El modal se queda abierto con su motivo escrito cuando algo falla. Leerlo y
    // repetirlo es la diferencia entre "waitForSelector agotó 15s" —que no dice
    // nada— y "el monto no se aceptó porque...".
    try {
        await w.waitForSelector('#modal-movimiento-caja', { state: 'hidden', timeout: 15000 });
    } catch (e) {
        const error = await w.locator('#mov-caja-error').innerText().catch(() => '');
        const estado = await w.evaluate(() => ({
            modal: document.getElementById('modal-movimiento-caja')?.className,
            monto: document.getElementById('mov-caja-monto')?.value,
            motivo: document.getElementById('mov-caja-motivo')?.value,
            tipo: document.querySelector('.mov-tipo-btn.activo')?.getAttribute('data-tipo'),
            botonApagado: document.getElementById('mov-caja-confirmar')?.disabled,
        }));
        throw new Error(
            'el movimiento no se registró' + (error ? ': "' + error.trim() + '"' : ' y el modal no dijo por qué') +
            ' · ' + JSON.stringify(estado)
        );
    }
    await w.waitForTimeout(ESPERA);
    return { pidioPin: pidePin };
}

/**
 * Cierra el turno contando `contado` y devuelve lo que la app calculó.
 * `contado` lo trae el LIBRO del recorrido, nunca la propia pantalla (lib/libro.js).
 */
async function cerrarTurno(app, { contado, notas = 'cierre del banco de pruebas' }) {
    const w = app.ventana;
    app.consola.enPaso('cierre de turno');
    await irA(app, 'turno');
    await w.click('#view-turno button:has-text("Cerrar Turno")');
    await w.waitForSelector('#modal-cierre-turno:not(.hidden)', { timeout: 10000 });

    const esperado = leerImporte(await w.locator('#cierre-esperado').innerText());
    await w.fill('#cierre-efectivo-contado', String(contado));
    await w.dispatchEvent('#cierre-efectivo-contado', 'input');
    await w.waitForTimeout(ESPERA);
    const diferencia = leerImporte(await w.locator('#cierre-diferencia').innerText());

    await w.fill('#cierre-notas', notas);
    await w.click('#modal-cierre-turno button:has-text("Confirmar Cierre")');
    await w.waitForSelector('#modal-cierre-turno', { state: 'hidden', timeout: 15000 });
    await w.waitForTimeout(800);
    await aceptarDialogo(app);
    await w.waitForTimeout(600);

    return { esperado, diferencia };
}

// ── Ajustes del negocio ─────────────────────────────────────────────────────

/**
 * Mueve un interruptor de Ajustes.
 *
 * ⚠️ El `<input type="checkbox">` de estos interruptores mide 0×0 y va con
 * `opacity:0` (styles.css → `.switch input`): lo que se ve y se toca es el
 * `<span class="slider">` de al lado. Por eso NO se puede usar `setChecked` sobre
 * el input —Playwright lo da por invisible y se queda esperando— y hay que hacer
 * lo mismo que hace el dedo del usuario: tocar el deslizador. El estado se lee del
 * input, que sí es la verdad.
 */
async function moverInterruptor(app, idInput, encendido) {
    const w = app.ventana;
    const input = w.locator('#' + idInput);
    if (await input.isChecked() !== encendido) {
        await w.click('label.switch:has(#' + idInput + ') .slider');
        await w.waitForTimeout(300);
    }
    if (await input.isChecked() !== encendido) {
        throw new Error('El interruptor #' + idInput + ' no cambió de estado al tocarlo');
    }
}

async function configurarImpuesto(app, { activo, tasa = 16, incluido = true, nombre = 'IVA' }) {
    const w = app.ventana;
    app.consola.enPaso('ajustes: impuesto');
    await irA(app, 'ajustes');
    await moverInterruptor(app, 'adj-impuesto-activo', activo);
    await w.waitForTimeout(300);
    if (activo) {
        await w.fill('#adj-impuesto-nombre', nombre);
        await w.fill('#adj-impuesto-tasa', String(tasa));
        await w.selectOption('#adj-impuesto-modo', incluido ? 'incluido' : 'agregado');
    }
    await w.click('#view-ajustes button:has-text("Guardar impuesto")');
    await w.waitForTimeout(900);
    await aceptarDialogo(app);
}

async function configurarPropinas(app, { activo, sugerencias = '10, 15, 20' }) {
    const w = app.ventana;
    app.consola.enPaso('ajustes: propinas');
    await irA(app, 'ajustes');
    await moverInterruptor(app, 'adj-propina-activa', activo);
    await w.waitForTimeout(300);
    if (activo) await w.fill('#adj-propina-sugerencias', sugerencias);
    await w.click('#view-ajustes button:has-text("Guardar propinas")');
    await w.waitForTimeout(900);
    await aceptarDialogo(app);
}

// ── Mesas ───────────────────────────────────────────────────────────────────

async function crearMesas(app, mesas) {
    const w = app.ventana;
    app.consola.enPaso('configurar mesas');
    await irA(app, 'mesas');
    await w.click('#btn-configurar-mesas');
    await w.waitForSelector('#modal-configurar-mesas:not(.hidden)', { timeout: 10000 });
    for (const m of mesas) {
        await w.fill('#config-mesa-nombre', m.nombre);
        await w.fill('#config-mesa-zona', m.zona || 'Interior');
        await w.fill('#config-mesa-capacidad', String(m.capacidad || 4));
        await w.click('#modal-configurar-mesas button:has-text("Agregar")');
        await w.waitForTimeout(600);
    }
    await w.click('#modal-configurar-mesas button:has-text("Listo")');
    await w.waitForTimeout(900);
}

async function abrirMesa(app, nombre, comensales = 2) {
    const w = app.ventana;
    app.consola.enPaso('abrir mesa ' + nombre);
    await irA(app, 'mesas');
    await w.click('#mesas-grid > div:has(span:text-is("' + nombre + '"))');
    await w.waitForSelector('#modal-abrir-mesa:not(.hidden)', { timeout: 10000 });
    await w.fill('#mesa-comensales', String(comensales));
    await w.click('#modal-abrir-mesa button:has-text("Abrir Mesa")');
    await w.waitForTimeout(1500);
}

async function agregarProductosAMesa(app, nombreMesa, productos) {
    const w = app.ventana;
    app.consola.enPaso('agregar productos a ' + nombreMesa);
    await w.click('#mesas-grid > div:has(span:text-is("' + nombreMesa + '"))');
    await w.waitForSelector('#mesa-panel:not(.hidden)', { timeout: 10000 });
    await w.click('#mesa-panel button:has-text("Agregar productos")');
    await w.waitForSelector('#modal-agregar-productos-mesa:not(.hidden)', { timeout: 10000 });
    await w.waitForSelector('#mesa-prod-grid > div', { timeout: 10000 });
    for (const p of productos) {
        for (let i = 0; i < (p.veces || 1); i++) {
            await w.click('#mesa-prod-grid > div:has-text("' + p.nombre + '")');
            await w.waitForTimeout(200);
        }
    }
    await w.click('#modal-agregar-productos-mesa button:has-text("Agregar a la mesa")');
    await w.waitForTimeout(1800);
}

async function cobrarMesa(app, { metodo = 'efectivo', propina = 0, propinaMetodo = null, division = null } = {}) {
    const w = app.ventana;
    app.consola.enPaso('cobrar mesa');
    await w.click('#mesa-panel button:has-text("Cobrar")');
    await w.waitForSelector('#modal-cobrar-mesa:not(.hidden)', { timeout: 10000 });
    const total = leerImporte(await w.locator('#cobrar-mesa-total').innerText());

    if (division) {
        await w.click('#btn-dividir-mesa');
        await w.waitForSelector('#seccion-division-mesa:not(.hidden)', { timeout: 5000 });
        if (division.modo === 'items') {
            await w.click('#tab-division-items');
            await w.waitForTimeout(500);
        } else {
            await w.click('#tab-division-partes');
            await w.waitForTimeout(400);
            await w.click('#division-mesa-partes button:text-is("' + division.partes + '")');
            await w.waitForTimeout(800);
        }
        // Las partes nacen todas en efectivo; el cajero cambia solo las que cambian.
        for (let i = 0; i < (division.metodos || []).length; i++) {
            await w.locator('#lista-pagos-mesa > div').nth(i).locator('select').selectOption(division.metodos[i]);
            await w.waitForTimeout(250);
        }
    } else {
        await w.selectOption('#cobrar-mesa-metodo', metodo);
    }

    if (propina) {
        await w.waitForSelector('#seccion-propina-mesa:not(.hidden)', { timeout: 5000 });
        await w.fill('#propina-mesa-input', String(propina));
        await w.dispatchEvent('#propina-mesa-input', 'input');
        if (propinaMetodo) await w.selectOption('#propina-mesa-metodo', propinaMetodo);
        await w.waitForTimeout(ESPERA);
    }

    await w.click('#btn-confirmar-cobrar-mesa');

    // Al cobrar, el modal NO se cierra: se convierte en un "¡Cobrado!" con la
    // opción de imprimir el ticket. Hay que darle a Cerrar como haría el cajero,
    // o el siguiente clic se queda esperando detrás del velo del modal.
    await w.waitForSelector('#modal-cobrar-mesa button:has-text("Cerrar")', { timeout: 20000 });
    const cobrado = (await w.locator('#modal-cobrar-mesa .modal-body').innerText()).includes('Cobrado');
    await w.click('#modal-cobrar-mesa button:has-text("Cerrar")');
    await w.waitForSelector('#modal-cobrar-mesa', { state: 'hidden', timeout: 10000 });
    await aceptarDialogo(app);
    await w.waitForTimeout(800);
    return { total, cobrado };
}

// ── Pedidos ─────────────────────────────────────────────────────────────────

/** La fila del historial que corresponde a un folio. */
function filaDePedido(app, pedidoId) {
    return app.ventana.locator('#lista-pedidos tr').filter({ has: app.ventana.locator('td strong:text-is("#' + pedidoId + '")') });
}

/**
 * Cancela un pedido desde el historial, que es donde lo hace el cajero: el
 * selector de estado de su fila.
 *
 * Sin cuenta vinculada no se pide PIN — `pedirPinEmpleado` llama directo al
 * callback en modo local (modulo-pin-audit.js). Con cuenta sí, y esa rama la
 * cubre el recorrido conectado.
 */
async function cancelarPedido(app, pedidoId) {
    const w = app.ventana;
    app.consola.enPaso('cancelar pedido #' + pedidoId);
    await irA(app, 'pedidos');
    const fila = filaDePedido(app, pedidoId);
    if (await fila.count() === 0) {
        const filas = await w.locator('#lista-pedidos tr').allInnerTexts();
        throw new Error('el pedido #' + pedidoId + ' no aparece en el historial. Filas: ' +
            JSON.stringify(filas.map((f) => f.replace(/\s+/g, ' ').slice(0, 60))));
    }
    await fila.locator('select').selectOption('cancelado');
    await w.waitForTimeout(1500);
    await aceptarDialogo(app);
    await w.waitForTimeout(800);
}

/** El estado que muestra la fila de un pedido en el historial. */
async function estadoDePedido(app, pedidoId) {
    await irA(app, 'pedidos');
    return filaDePedido(app, pedidoId).locator('select').inputValue();
}

// ── Lecturas ────────────────────────────────────────────────────────────────

/** Convierte lo que se ve en pantalla ("1,234.50" con su signo de pesos) a número. */
function leerImporte(txt) {
    const limpio = String(txt || '').replace(/[^\d.,-]/g, '').replace(/,/g, '');
    return parseFloat(limpio) || 0;
}

/**
 * Abre la SQLite del perfil desechable. Es la única forma de comprobar lo que
 * quedó GUARDADO —columnas, filas, importes— y no solo lo que se pintó.
 */
function leerBase(perfil) {
    const sqlite3 = require(path.join(__dirname, '..', '..', 'node_modules', 'sqlite3'));
    const db = new sqlite3.Database(path.join(perfil, 'ventas.db'), sqlite3.OPEN_READONLY);
    return {
        todas: (sql, params = []) => new Promise((res, rej) => db.all(sql, params, (e, r) => (e ? rej(e) : res(r)))),
        una:   (sql, params = []) => new Promise((res, rej) => db.get(sql, params, (e, r) => (e ? rej(e) : res(r)))),
        columnas: (tabla) => new Promise((res, rej) =>
            db.all('PRAGMA table_info(' + tabla + ')', (e, r) => (e ? rej(e) : res(r.map((c) => c.name))))),
        cerrar: () => new Promise((res) => db.close(() => res())),
    };
}

module.exports = {
    irA, aceptarDialogo, moverInterruptor,
    venderEnMostrador,
    abrirTurno, leerTotalesTurno, registrarMovimiento, cerrarTurno,
    configurarImpuesto, configurarPropinas,
    crearMesas, abrirMesa, agregarProductosAMesa, cobrarMesa,
    cancelarPedido, estadoDePedido,
    crearCuenta, estaConectado, apuntarAServidor,
    estadoDeConexionEnPantalla, esperarEstadoDeConexion, hayRuedaDeCarga,
    leerImporte, leerBase,
};

// ── Cuenta y modo conectado ─────────────────────────────────────────────────

/**
 * Crea una cuenta Zenit desde Ajustes y deja el equipo en MODO CONECTADO.
 *
 * La URL del backend es un ajuste de DISPOSITIVO que no tiene campo en la
 * interfaz (solo se escribe al vincular la cuenta, con el valor de producción por
 * defecto), así que apuntar al backend de pruebas es siembra: se guarda el ajuste
 * y se recarga. Todo lo demás —nombre, correo, contraseña, el botón— va a clics,
 * porque el registro es justo uno de los caminos que hay que probar.
 */
async function crearCuenta(app, { url, nombre, correo, contrasena }) {
    const w = app.ventana;
    app.consola.enPaso('crear cuenta');

    await w.evaluate(async (u) => { await window.api.guardarAjuste('api_url', u); }, url);
    await w.reload();
    await require('./app').esperarArranque(w);

    await irA(app, 'ajustes');
    await w.fill('#zenit-nombre', nombre);
    await w.fill('#zenit-email', correo);
    await w.fill('#zenit-password', contrasena);
    await w.click('#zenit-form-registro button:has-text("Crear cuenta")');

    try {
        await w.waitForSelector('#zenit-con-cuenta', { state: 'visible', timeout: 40000 });
    } catch (e) {
        const error = await w.locator('#zenit-error-registro').innerText().catch(() => '');
        throw new Error('no se pudo crear la cuenta' + (error ? ': "' + error.trim() + '"' : ' y la pantalla no dijo por qué'));
    }
    await w.waitForTimeout(1500);
}

/**
 * Reapunta el equipo a otro servidor y recarga. Es lo que hace falta para simular
 * un backend dormido o caído: la URL es un ajuste de dispositivo sin campo en la
 * interfaz, así que se escribe igual que lo escribe la app al vincular la cuenta.
 */
async function apuntarAServidor(app, url) {
    const w = app.ventana;
    app.consola.enPaso('apuntando a ' + url);
    await w.evaluate(async (u) => { await window.api.guardarAjuste('api_url', u); }, url);
    await w.reload();
    await require('./app').esperarArranque(w);
}

/** Lo que dice la píldora de conexión de la cabecera. */
async function estadoDeConexionEnPantalla(app) {
    return (await app.ventana.locator('#texto-modo').innerText()).trim();
}

/**
 * Espera a que la píldora de conexión diga lo que se espera.
 *
 * Sin esto habría que adivinar un `waitForTimeout`, y adivinar produce pruebas
 * que fallan un día sí y otro no: cuánto tarda en fallar una conexión depende del
 * sistema (un puerto cerrado no rechaza igual de rápido en todas partes).
 */
async function esperarEstadoDeConexion(app, esperado, ms = 40000) {
    const hasta = Date.now() + ms;
    let visto = '';
    while (Date.now() < hasta) {
        visto = await estadoDeConexionEnPantalla(app);
        if (visto === esperado) return visto;
        await app.ventana.waitForTimeout(500);
    }
    return visto;
}

/** ¿Se está viendo el círculo de carga de la cabecera? */
async function hayRuedaDeCarga(app) {
    const rueda = app.ventana.locator('#spinner-conexion');
    return (await rueda.count()) > 0 && await rueda.isVisible();
}

/** ¿El equipo se considera conectado a una cuenta? Lo dice su propio estado. */
async function estaConectado(app) {
    return app.ventana.evaluate(() => Boolean(
        typeof modoConectado !== 'undefined' && modoConectado && typeof tokenActual !== 'undefined' && tokenActual
    ));
}

// ── Siembra ─────────────────────────────────────────────────────────────────

/**
 * Deja el equipo con un plan PREMIUM vigente y recarga la app.
 *
 * ⚠️ Esto es SIEMBRA, no una acción bajo prueba, y por eso es la única cosa de
 * este archivo que escribe por dentro en vez de a clics: en modo local no existe
 * ninguna pantalla para ponerse premium —el plan lo trae el backend— así que un
 * recorrido que quiera entrar a Inventario o a Rentabilidad no tiene otra puerta.
 * Se escribe exactamente el mismo ajuste que guarda `cargarPlanInfo()` cuando el
 * backend responde, así que la app queda en un estado que alcanza sola.
 */
async function activarPremiumDePrueba(app, dias = 30) {
    const vence = new Date(Date.now() + dias * 86400000).toISOString();
    await app.ventana.evaluate(async (v) => {
        await window.api.guardarAjuste('plan', 'premium');
        await window.api.guardarAjuste('plan_expires_at', v);
    }, vence);
    await app.ventana.reload();
    await require('./app').esperarArranque(app.ventana);
}

module.exports.activarPremiumDePrueba = activarPremiumDePrueba;
