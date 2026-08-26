const fs = require('fs');
const path = require('path');
const { app } = require('electron');
const { db } = require('../database/db');

const MAX_BACKUPS = 50;

const dataDir = app.getPath('userData');
const dbPath = path.join(dataDir, 'ventas.db');
const backupDir = path.join(dataDir, 'backups');

if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
}

function crearBackup() {
    return new Promise((resolve, reject) => {
        if (!fs.existsSync(dbPath)) return resolve(null);

        const timestamp = new Date()
            .toISOString()
            .replace(/[:.]/g, '-');

        const backupName = `backup-${timestamp}.db`;
        const backupPath = path.join(backupDir, backupName);

        // VACUUM INTO es la forma segura de respaldar SQLite mientras la
        // base está abierta: copia transaccionalmente sin bloquear escrituras.
        // La ruta debe ir como literal en el SQL (escapamos la comilla simple).
        const rutaEscapada = backupPath.replace(/'/g, "''");

        db.run(`VACUUM INTO '${rutaEscapada}'`, (err) => {
            if (err) return reject(err);
            try { limpiarBackupsAntiguos(); } catch (_) { /* ignorar */ }
            resolve(backupPath);
        });
    });
}

function listarBackups() {
    if (!fs.existsSync(backupDir)) return [];

    return fs.readdirSync(backupDir)
        .filter(f => f.endsWith('.db'))
        .sort()
        .reverse(); // más recientes primero
}

function limpiarBackupsAntiguos() {
    const backups = listarBackups();

    if (backups.length <= MAX_BACKUPS) return;

    const sobrantes = backups.slice(MAX_BACKUPS);

    sobrantes.forEach(nombre => {
        try {
            fs.unlinkSync(path.join(backupDir, nombre));
        } catch (err) {
            console.error('Error al eliminar backup:', nombre);
        }
    });
}

// Prefijo de la copia que se guarda ANTES de restaurar (deshacer un restore
// equivocado). Se distingue del respaldo normal para poder etiquetarla en la UI.
const PREFIJO_PRE_RESTAURACION = 'pre-restauracion-';

/** Solo nombres de archivo dentro de la carpeta de respaldos: sin rutas ni '..'. */
function _rutaDeRespaldo(nombre) {
    if (typeof nombre !== 'string' || !nombre.endsWith('.db')) return null;
    if (path.basename(nombre) !== nombre) return null;
    const ruta = path.join(backupDir, nombre);
    return fs.existsSync(ruta) ? ruta : null;
}

/**
 * Restaura un respaldo sobre la base local.
 *
 * ⚠️ Deja la conexión SQLite CERRADA: quien llame debe reiniciar la app
 * (main.js lo hace con app.relaunch()). Intentar seguir operando con la base
 * cambiada bajo los pies dejaría datos viejos en memoria.
 */
async function restaurarBackup(nombre) {
    const origen = _rutaDeRespaldo(nombre);
    if (!origen) throw new Error('No se encontró ese respaldo.');

    // 1. Copia de lo que hay AHORA. Si el usuario restaura el respaldo equivocado,
    //    el día de hoy no se pierde. VACUUM INTO funciona con la base abierta.
    let respaldoPrevio = null;
    if (fs.existsSync(dbPath)) {
        const marca = new Date().toISOString().replace(/[:.]/g, '-');
        respaldoPrevio = path.join(backupDir, `${PREFIJO_PRE_RESTAURACION}${marca}.db`);
        const rutaEscapada = respaldoPrevio.replace(/'/g, "''");
        await new Promise((resolve, reject) => {
            db.run(`VACUUM INTO '${rutaEscapada}'`, (err) => err ? reject(err) : resolve());
        });
    }

    // 2. Cerrar la conexión: Windows bloquea el archivo mientras SQLite lo tiene
    //    abierto, así que sin esto el copyFileSync falla con EBUSY.
    await new Promise((resolve) => db.close(() => resolve()));

    // 3. Reemplazar la base
    fs.copyFileSync(origen, dbPath);

    // 4. Borrar restos del diario: si sobreviven, al abrir la base pueden deshacer
    //    o rehacer transacciones del archivo VIEJO sobre el recién restaurado.
    for (const sufijo of ['-journal', '-wal', '-shm']) {
        const resto = dbPath + sufijo;
        if (fs.existsSync(resto)) {
            try { fs.unlinkSync(resto); } catch (_) { /* ignorar */ }
        }
    }

    return {
        restaurado: nombre,
        respaldoPrevio: respaldoPrevio ? path.basename(respaldoPrevio) : null
    };
}

module.exports = {
    crearBackup,
    listarBackups,
    restaurarBackup,
    PREFIJO_PRE_RESTAURACION
};
