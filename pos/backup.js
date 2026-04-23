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

function restaurarBackup(nombre) {
    const backupPath = path.join(backupDir, nombre);
    if (!fs.existsSync(backupPath)) return;

    fs.copyFileSync(backupPath, dbPath);
}

module.exports = {
    crearBackup,
    listarBackups,
    restaurarBackup
};
