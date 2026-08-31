/**
 * SMOKE TEST — Pantallas de cocina de la red local (BLOQUE 13).
 *
 * El desktop no tiene suite de pruebas ni build step: un error en el SQL solo se
 * descubre cuando alguien abre la vista, y aquí lo que está en juego es quién ve
 * la cola de pedidos. Este script arma la tabla real en memoria, extrae del
 * `database/db.js` de verdad las funciones bajo prueba y comprueba lo que puede
 * salir mal de verdad:
 *
 *   1. Una pantalla nueva nace PENDIENTE (registrada, pero sin ver nada).
 *   2. Se la encuentra por su SECRETO, nunca por su IP — el cambio del bloque.
 *   3. Aprobarla la deja activa y escribe QUIÉN la autorizó.
 *   4. Revocarla NO borra la fila: el registro es la auditoría.
 *   5. Una pantalla revocada no vuelve a estar activa sola.
 *   6. No se puede quitar de la lista una pantalla ACTIVA (primero se revoca).
 *   7. Los registros viejos por IP quedan como 'legacy' y no dan acceso.
 *
 * Uso:  node scripts/smoke-kds-dispositivos.js
 */
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const fuente = fs.readFileSync(path.join(__dirname, '..', 'database', 'db.js'), 'utf8');
const db = new sqlite3.Database(':memory:');

// Se extraen del archivo real: si alguna se renombra o desaparece, esto falla en
// vez de probar una copia que podría haberse desviado del código que corre.
const partes = [
    'function buscarDispositivoKDSPorSecreto',
    'function registrarDispositivoKDSPendiente',
    'function aprobarDispositivoKDSLocal',
    'function revocarDispositivoKDSLocal',
    'function tocarAccesoKDS',
    'function eliminarDispositivoKDS',
    'function obtenerDispositivosKDS',
];
for (const marca of partes) {
    if (!fuente.includes(marca)) {
        console.error(`FALLO: database/db.js ya no contiene "${marca}"`);
        process.exit(1);
    }
}

const ini = fuente.indexOf('function obtenerDispositivosKDS');
const fin = fuente.indexOf('function limpiarDatosLocales');
const codigo = fuente.slice(ini, fin);
// eslint-disable-next-line no-new-func
const api = new Function('db', codigo + `
return {
  obtenerDispositivosKDS, buscarDispositivoKDSPorSecreto, registrarDispositivoKDSPendiente,
  aprobarDispositivoKDSLocal, revocarDispositivoKDSLocal, tocarAccesoKDS, eliminarDispositivoKDS,
};`)(db);

const run = (sql, params = []) => new Promise((ok, ko) =>
    db.run(sql, params, function (e) { e ? ko(e) : ok(this); }));

const hash = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');

let fallos = 0;
function comprobar(nombre, real, esperado) {
    const ok = JSON.stringify(real) === JSON.stringify(esperado);
    if (!ok) fallos++;
    console.log(`${ok ? '  OK  ' : '  FALLA'} ${nombre}${ok ? '' : `  (esperado ${JSON.stringify(esperado)}, real ${JSON.stringify(real)})`}`);
}

const buscar = (h) => new Promise((ok, ko) =>
    api.buscarDispositivoKDSPorSecreto(h, (e, row) => e ? ko(e) : ok(row || null)));
const registrar = (datos) => new Promise((ok, ko) =>
    api.registrarDispositivoKDSPendiente(datos, (e, id) => e ? ko(e) : ok(id)));
const aprobar = (datos) => new Promise((ok, ko) =>
    api.aprobarDispositivoKDSLocal(datos, (e) => e ? ko(e) : ok()));
const revocar = (datos) => new Promise((ok, ko) =>
    api.revocarDispositivoKDSLocal(datos, (e) => e ? ko(e) : ok()));
const eliminar = (id) => new Promise((ok) =>
    api.eliminarDispositivoKDS(id, (e) => ok(e ? e.message : null)));
const listar = () => new Promise((ok, ko) =>
    api.obtenerDispositivosKDS((e, rows) => e ? ko(e) : ok(rows || [])));

async function esquema() {
    // El MISMO esquema que crea db.js (tabla original + columnas del bloque).
    await run(`CREATE TABLE kds_trusted_devices (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ip TEXT NOT NULL,
        user_agent TEXT,
        nombre TEXT,
        confianza INTEGER DEFAULT 1,
        fecha_conexion DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
    await run('ALTER TABLE kds_trusted_devices ADD COLUMN secret_hash TEXT');
    await run("ALTER TABLE kds_trusted_devices ADD COLUMN estado TEXT DEFAULT 'pendiente'");
    await run('ALTER TABLE kds_trusted_devices ADD COLUMN aprobado_por_nombre TEXT');
    await run('ALTER TABLE kds_trusted_devices ADD COLUMN aprobado_por_rol TEXT');
    await run('ALTER TABLE kds_trusted_devices ADD COLUMN aprobado_en DATETIME');
    await run('ALTER TABLE kds_trusted_devices ADD COLUMN revocado_por_nombre TEXT');
    await run('ALTER TABLE kds_trusted_devices ADD COLUMN revocado_en DATETIME');
    await run('ALTER TABLE kds_trusted_devices ADD COLUMN ultimo_acceso DATETIME');
}

async function main() {
    await esquema();

    const secreto = 'd-tablet-de-la-barra-0001';
    const h = hash(secreto);

    // 1 y 2 — nace pendiente y se la encuentra POR SU SECRETO
    const id = await registrar({ secretHash: h, ip: '192.168.1.44', userAgent: 'Android', nombre: 'Pantalla de cocina' });
    let fila = await buscar(h);
    comprobar('una pantalla nueva nace PENDIENTE', fila.estado, 'pendiente');
    comprobar('se la encuentra por su secreto', fila.id, id);
    comprobar('un secreto distinto no encuentra nada', await buscar(hash('otro-secreto-cualquiera')), null);

    // La IP ya NO identifica: la misma pantalla con otra IP sigue siendo ella,
    // y otro aparato que herede su IP no es ella. Eso es todo el bloque.
    await run("UPDATE kds_trusted_devices SET ip = '192.168.1.77' WHERE id = ?", [id]);
    fila = await buscar(h);
    comprobar('cambiar de IP no cambia la identidad', fila.id, id);

    // 3 — aprobar deja constancia de quién
    await aprobar({ id, nombre: 'Cocina caliente', aprobadoPorNombre: 'Ana', aprobadoPorRol: 'encargado' });
    fila = await buscar(h);
    comprobar('queda activa', fila.estado, 'activo');
    comprobar('con el nombre que le pusieron', fila.nombre, 'Cocina caliente');
    comprobar('y con quién la autorizó', fila.aprobado_por_nombre, 'Ana');
    comprobar('y con qué puesto', fila.aprobado_por_rol, 'encargado');
    comprobar('con la hora de la aprobación', typeof fila.aprobado_en === 'string' && fila.aprobado_en.length > 0, true);

    // 6 — una pantalla activa no se borra de la lista
    comprobar('no se puede quitar de la lista una pantalla ACTIVA',
        await eliminar(id), 'Revoca el dispositivo antes de quitarlo de la lista');

    // 4 y 5 — revocar conserva la fila y no se revierte solo
    await revocar({ id, revocadoPorNombre: 'Ana' });
    fila = await buscar(h);
    comprobar('revocada', fila.estado, 'revocado');
    comprobar('la fila NO se borra: es la auditoría', !!fila, true);
    comprobar('consta quién la revocó', fila.revocado_por_nombre, 'Ana');
    comprobar('y deja de ser de confianza', fila.confianza, 0);

    // 7 — los registros viejos por IP no dan acceso
    await run(`INSERT INTO kds_trusted_devices (ip, user_agent, nombre, confianza, secret_hash, estado)
               VALUES ('192.168.1.99', 'Chrome viejo', '192.168.1.99', 1, NULL, 'pendiente')`);
    await run("UPDATE kds_trusted_devices SET estado = 'legacy' WHERE secret_hash IS NULL AND (estado IS NULL OR estado != 'legacy')");
    const todas = await listar();
    const vieja = todas.find(d => d.ip === '192.168.1.99');
    comprobar('el registro por IP queda como legacy', vieja.estado, 'legacy');
    comprobar('y no se puede resolver por secreto', await buscar(hash('192.168.1.99')), null);

    // Una revocada sí se puede quitar de la lista
    comprobar('una revocada sí se puede quitar', await eliminar(id), null);
    comprobar('y desaparece', await buscar(h), null);

    console.log(fallos === 0
        ? '\nPantallas de cocina locales: todo cuadra.'
        : `\nPantallas de cocina locales: ${fallos} fallo(s).`);
    process.exit(fallos === 0 ? 0 : 1);
}

main().catch(e => { console.error(e); process.exit(1); });
