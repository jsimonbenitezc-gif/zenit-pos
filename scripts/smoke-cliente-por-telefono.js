/**
 * SMOKE TEST — Autocompletado del cliente por teléfono (pedido a domicilio).
 *
 * El desktop no tiene suite de pruebas ni build step, así que un error aquí solo
 * se descubre cuando alguien abre esa pantalla. Este script arma una base en
 * memoria con el MISMO esquema y corre el código REAL, extraído de
 * `database/db.js` y de `pos/modulo-clientes.js` (no una copia que podría
 * desviarse: si alguna de las dos funciones se renombra, el script falla).
 *
 * PARTE 1 — la consulta:
 *   1. Un teléfono existente devuelve el cliente con su nombre y su dirección.
 *   2. Un teléfono desconocido devuelve null, NO un error: es el caso normal de
 *      un cliente nuevo, y como error rompería el cobro.
 *   3. Un cliente guardado con separadores ("55 8765-4321") se encuentra igual
 *      tecleando los diez dígitos seguidos, y al revés.
 *   4. Vacío, espacios y texto sin dígitos devuelven null sin consultar.
 *   5. Un cliente sin dirección no rompe nada.
 *
 * PARTE 2 — el flujo completo, con el código real del renderer:
 *   6. Diez dígitos de un cliente conocido rellenan nombre y dirección.
 *   7. A medio teclear (5 dígitos) no se busca nada.
 *   8. Un teléfono desconocido deja el formulario en blanco, sin avisar.
 *   9. No se pisa al cliente que el cajero ya eligió a mano en el ticket.
 *  10. Ni el formulario cerrado ni un fallo del puente tumban el cobro.
 *
 * Lo único que NO cubre es el transporte IPC de Electron; de eso se ocupa
 * `npm run revisar` (que el método esté en preload.js y el canal en main.js).
 *
 * Uso:  node scripts/smoke-cliente-por-telefono.js
 */
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

// ── Se extrae del db.js REAL la función bajo prueba ─────────────────────────
const fuente = fs.readFileSync(path.join(__dirname, '..', 'database', 'db.js'), 'utf8');
const MARCA = 'function buscarClientePorTelefono(telefono, callback) {';
if (!fuente.includes(MARCA)) {
    console.error('FALLO: database/db.js ya no contiene buscarClientePorTelefono');
    process.exit(1);
}
const ini = fuente.indexOf(MARCA);
const fin = fuente.indexOf('function obtenerClientes(callback) {', ini);
if (fin === -1) {
    console.error('FALLO: no se pudo delimitar buscarClientePorTelefono en db.js');
    process.exit(1);
}

const db = new sqlite3.Database(':memory:');
// eslint-disable-next-line no-new-func
const buscarClientePorTelefono = new Function('db',
    fuente.slice(ini, fin) + '\nreturn buscarClientePorTelefono;')(db);

const run = (sql, params = []) => new Promise((ok, ko) =>
    db.run(sql, params, function (e) { e ? ko(e) : ok(this); }));
const buscar = (tel) => new Promise((ok, ko) =>
    buscarClientePorTelefono(tel, (e, row) => e ? ko(e) : ok(row)));

let fallos = 0;
function comprobar(nombre, real, esperado) {
    const ok = JSON.stringify(real) === JSON.stringify(esperado);
    console.log((ok ? '  OK  ' : ' FALLA') + ' ' + nombre);
    if (!ok) {
        console.log('        esperado: ' + JSON.stringify(esperado));
        console.log('        real:     ' + JSON.stringify(real));
        fallos++;
    }
}

/**
 * Prepara el renderer real sobre un DOM de mentira.
 *
 * ⚠️ `buscarYAutocompletarCliente` y `seleccionarClienteVenta` comparten en la
 * app la variable `clienteSeleccionadoVenta` del ámbito global de los scripts.
 * Aquí se reproduce ese ámbito con un envoltorio: la variable y el colaborador
 * que la escribe viven DENTRO del mismo `new Function`, igual que en el
 * navegador. Pasarla como parámetro la congelaría en su valor inicial y el
 * caso 9 daría un falso fallo.
 */
function prepararRenderer(windowFalso, documentoFalso, estado) {
    const src = fs.readFileSync(path.join(__dirname, '..', 'pos', 'modulo-clientes.js'), 'utf8');
    const MARCA2 = 'async function buscarYAutocompletarCliente(telefono) {';
    if (!src.includes(MARCA2)) {
        console.error('FALLO: pos/modulo-clientes.js ya no contiene buscarYAutocompletarCliente');
        process.exit(1);
    }
    const i2 = src.indexOf(MARCA2);
    const f2 = src.indexOf('function abrirModalCliente() {', i2);
    if (f2 === -1) {
        console.error('FALLO: no se pudo delimitar buscarYAutocompletarCliente');
        process.exit(1);
    }

    const envoltorio = [
        'let clienteSeleccionadoVenta = null;',
        // Mismo efecto que el original de modulo-venta.js: escribe la compartida.
        'function seleccionarClienteVenta(id, nombre, telefono, direccion, puntos, enFidelidad) {',
        '    clienteSeleccionadoVenta = { id, nombre, telefono, direccion, puntos, enFidelidad };',
        '}',
        'function actualizarInfoClientePago() { estado.panelRefrescado++; }',
        'function mostrarNotificacionExito(msg, titulo) { estado.avisos.push(titulo + ": " + msg); }',
        src.slice(i2, f2),
        'return {',
        '    buscarYAutocompletarCliente: buscarYAutocompletarCliente,',
        '    fijarCliente: function (c) { clienteSeleccionadoVenta = c; },',
        '    leerCliente: function () { return clienteSeleccionadoVenta; },',
        '};',
    ].join('\n');

    // eslint-disable-next-line no-new-func
    return new Function('window', 'document', 'console', 'estado', envoltorio)(
        windowFalso, documentoFalso, { warn() {}, log() {}, error() {} }, estado);
}

(async () => {
    // Esquema REAL de la tabla (db.js) + las dos columnas de la migración.
    await run('CREATE TABLE clientes (' +
        'id INTEGER PRIMARY KEY AUTOINCREMENT,' +
        'telefono TEXT UNIQUE NOT NULL,' +
        'nombre TEXT,' +
        'direccion TEXT,' +
        'notas TEXT,' +
        'fecha_registro DATETIME DEFAULT CURRENT_TIMESTAMP)');
    await run('ALTER TABLE clientes ADD COLUMN puntos INTEGER DEFAULT 0');
    await run('ALTER TABLE clientes ADD COLUMN en_fidelidad INTEGER DEFAULT 0');

    await run("INSERT INTO clientes (telefono, nombre, direccion, puntos, en_fidelidad) VALUES ('5512345678', 'Ana Perez', 'Reforma 100, Centro', 40, 1)");
    await run("INSERT INTO clientes (telefono, nombre, direccion) VALUES ('55 8765-4321', 'Luis Soto', 'Juarez 5')");
    await run("INSERT INTO clientes (telefono, nombre, direccion) VALUES ('5599887766', 'Sin Direccion', NULL)");

    // ── PARTE 1 ─────────────────────────────────────────────────────────────
    console.log('\nBusqueda de cliente por telefono\n');

    const ana = await buscar('5512345678');
    comprobar('telefono existente devuelve el cliente',
        ana && [ana.nombre, ana.direccion], ['Ana Perez', 'Reforma 100, Centro']);
    comprobar('trae puntos y fidelidad (para enlazarlo a la venta)',
        ana && [ana.puntos, ana.en_fidelidad], [40, 1]);

    comprobar('telefono desconocido devuelve null', await buscar('5500000000'), null);

    const luis = await buscar('5587654321');
    comprobar('encuentra a un cliente guardado con espacios y guiones',
        luis && luis.nombre, 'Luis Soto');
    const ana2 = await buscar('55 1234 5678');
    comprobar('encuentra tecleando con espacios lo guardado sin ellos',
        ana2 && ana2.nombre, 'Ana Perez');

    comprobar('cadena vacia devuelve null', await buscar(''), null);
    comprobar('solo espacios devuelve null', await buscar('   '), null);
    comprobar('texto sin digitos devuelve null', await buscar('hola'), null);
    comprobar('null devuelve null', await buscar(null), null);
    comprobar('undefined devuelve null', await buscar(undefined), null);

    const sinDir = await buscar('5599887766');
    comprobar('cliente sin direccion devuelve direccion null',
        sinDir && [sinDir.nombre, sinDir.direccion], ['Sin Direccion', null]);

    // ── PARTE 2 ─────────────────────────────────────────────────────────────
    console.log('\nFlujo completo del pedido a domicilio\n');

    let campos = {};
    const documentoFalso = { getElementById: (id) => campos[id] || null, querySelectorAll: () => [] };
    // El puente: lo que en la app real hacen preload.js y el ipcMain de main.js.
    const windowFalso = {
        api: {
            buscarClientePorTelefono: (tel) => new Promise((ok, ko) =>
                buscarClientePorTelefono(tel, (e, row) => e ? ko(e) : ok(row))),
        },
    };
    const estado = { avisos: [], panelRefrescado: 0 };
    const R = prepararRenderer(windowFalso, documentoFalso, estado);

    const reiniciar = () => {
        campos = {};
        for (const id of ['dom-telefono', 'dom-nombre', 'dom-direccion']) {
            campos[id] = { id: id, value: '', classList: { add() {}, remove() {} } };
        }
        estado.avisos = [];
        estado.panelRefrescado = 0;
        R.fijarCliente(null);
    };

    // 6. EL CASO QUE IMPORTA.
    reiniciar();
    await R.buscarYAutocompletarCliente('5512345678');
    comprobar('10 digitos de un cliente conocido rellenan nombre y direccion',
        [campos['dom-nombre'].value, campos['dom-direccion'].value],
        ['Ana Perez', 'Reforma 100, Centro']);
    comprobar('avisa al cajero de que reconocio al cliente',
        estado.avisos, ['Cliente reconocido: Ana Perez']);
    comprobar('enlaza al cliente con la venta (si no, el pedido saldria anonimo)',
        R.leerCliente() && [R.leerCliente().id, R.leerCliente().enFidelidad], [1, 1]);
    comprobar('refresca el panel "Cliente de esta venta"', estado.panelRefrescado, 1);

    // 7. A medio teclear no se busca: cualquier coincidencia seria casual.
    reiniciar();
    await R.buscarYAutocompletarCliente('55123');
    comprobar('con 5 digitos no toca el formulario',
        [campos['dom-nombre'].value, campos['dom-direccion'].value, R.leerCliente()], ['', '', null]);

    // 8. Desconocido = cliente nuevo. Ni rellena ni avisa.
    reiniciar();
    await R.buscarYAutocompletarCliente('5500000000');
    comprobar('un telefono desconocido deja el formulario en blanco y no avisa',
        [campos['dom-nombre'].value, estado.avisos.length], ['', 0]);

    // 9. La eleccion explicita del cajero manda.
    reiniciar();
    R.fijarCliente({ id: 99, nombre: 'Elegido a mano' });
    await R.buscarYAutocompletarCliente('5512345678');
    comprobar('no pisa al cliente que el cajero eligio a mano', R.leerCliente().id, 99);
    comprobar('pero si rellena la direccion del telefono tecleado',
        campos['dom-direccion'].value, 'Reforma 100, Centro');

    // 10. Ni el formulario cerrado ni un puente caido tumban el cobro.
    reiniciar();
    delete campos['dom-nombre'];
    let exploto = false;
    try { await R.buscarYAutocompletarCliente('5512345678'); } catch (e) { exploto = true; }
    comprobar('si el formulario ya no esta en pantalla, no revienta', exploto, false);

    reiniciar();
    windowFalso.api.buscarClientePorTelefono = () => Promise.reject(new Error('IPC caido'));
    let exploto2 = false;
    try { await R.buscarYAutocompletarCliente('5512345678'); } catch (e) { exploto2 = true; }
    comprobar('un fallo del puente no tumba el cobro',
        [exploto2, campos['dom-nombre'].value], [false, '']);

    console.log('\n' + (fallos === 0 ? 'OK — todo correcto' : 'FALLA — ' + fallos + ' fallo(s)') + '\n');
    db.close();
    process.exit(fallos === 0 ? 0 : 1);
})().catch(e => { console.error('ERROR:', e); process.exit(1); });
