// ============================================================================
// RECORRIDO 9 — LOS CANDADOS DEL ADMINISTRADOR (PLAN_SEGURIDAD_V1, sesión 1)
//
// Lo delicado de Ajustes pide la contraseña del administrador, aunque el perfil
// activo sea el suyo: quien se sienta en una caja abierta no debe poder ver los
// PINs de todos, apagar el cerrojo ni cambiar la contraseña. Antes:
//   • "Mi equipo" (Puestos y PINs) se abría con un clic,
//   • "Pedir contraseña al iniciar" se apagaba con otro, y
//   • "Cambiar contraseña de inicio" NO pedía la actual.
//
// Todo a clics, en modo local (la contraseña es la del equipo, `app_password`).
// Un equipo recién instalado no tiene contraseña: ahí no hay nada que pedir.
// ============================================================================

const { irA, abrirTema } = require('../lib/cajero');

const CLAVE = 'candado123';
const CLAVE_NUEVA = 'candado456';

async function modalVisible(w) {
    return w.locator('#modal-auth-turno:not(.hidden)').count().then((n) => n > 0);
}

async function paginaVisible(w, tema) {
    return w.locator('#view-ajustes .ajustes-pagina[data-tema="' + tema + '"]').isVisible();
}

async function cambiarContrasena(app, nueva) {
    const w = app.ventana;
    await w.click('button[onclick="mostrarCambiarPasswordApp()"]');
    await w.fill('#nueva-password-app', nueva);
    await w.fill('#confirm-password-app', nueva);
    await w.click('button[onclick="guardarNuevaPasswordApp()"]');
    await w.waitForTimeout(500);
}

async function teclearEnModal(w, valor) {
    await w.fill('#auth-turno-input', valor);
    await w.click('#modal-auth-turno button[onclick="confirmarAuthTurno()"]');
    await w.waitForTimeout(700); // PBKDF2 de 100 000 vueltas
}

module.exports = {
    nombre: 'Candados: Mi equipo, el cerrojo y la contraseña piden al administrador',
    etiqueta: 'candados',

    async ejecutar({ app, af }) {
        const w = app.ventana;

        // ── 1. Sin contraseña todavía: estrenarla no pide nada ──────────────
        await abrirTema(app, 'seguridad');
        await cambiarContrasena(app, CLAVE);
        af.cierto('la primera contraseña se estrena sin pedir otra', !(await modalVisible(w)));
        af.cierto('el equipo ya tiene contraseña', await w.evaluate(() => window.api.tienePasswordApp()));

        // ── 2. Cambiarla pide la ACTUAL ─────────────────────────────────────
        await cambiarContrasena(app, CLAVE_NUEVA);
        af.cierto('cambiar la contraseña pide la actual', await modalVisible(w));
        await teclearEnModal(w, 'no-es-esta');
        af.cierto('con una equivocada no pasa', await w.locator('#auth-turno-error').isVisible());
        await w.click('#modal-auth-turno button[onclick="cancelarAuthTurno()"]');
        af.cierto('cancelar deja la contraseña de antes',
            await w.evaluate((c) => window.api.verificarPasswordApp(c), CLAVE));

        // ── 3. Apagar "pedir contraseña" también la pide ────────────────────
        const interruptor = w.locator('#adj-pedir-password');
        if (!(await interruptor.isChecked())) {
            await w.click('#adj-pedir-password + .slider');
            await w.waitForTimeout(300);
        }
        await w.click('#adj-pedir-password + .slider');
        await w.waitForTimeout(400);
        af.cierto('apagar "pedir contraseña" pide la del administrador', await modalVisible(w));
        await w.click('#modal-auth-turno button[onclick="cancelarAuthTurno()"]');
        await w.waitForTimeout(300);
        af.cierto('al cancelar, el interruptor vuelve a encendido', await interruptor.isChecked());
        // Sin guardar nunca, el ajuste no existe y cuenta como encendido (!== 'false').
        af.cierto('…y en la base no quedó apagado',
            await w.evaluate(() => window.api.obtenerAjustes().then((a) => a.pedir_password_inicio !== 'false')));

        // ── 4. "Mi equipo" no se abre sin la contraseña ─────────────────────
        await irA(app, 'ajustes');
        await w.click('#ajustes-portada [data-tema="equipo"]');
        await w.waitForTimeout(400);
        af.cierto('"Mi equipo" pide la contraseña', await modalVisible(w));
        af.cierto('…y la página no se abre detrás', !(await paginaVisible(w, 'equipo')));
        await w.click('#modal-auth-turno button[onclick="cancelarAuthTurno()"]');
        await w.waitForTimeout(300);
        af.cierto('cancelar deja la portada', !(await paginaVisible(w, 'equipo')));

        await w.click('#ajustes-portada [data-tema="equipo"]');
        await w.waitForTimeout(400);
        await teclearEnModal(w, CLAVE);
        af.cierto('con la contraseña correcta se abre', await paginaVisible(w, 'equipo'));

        // ── 5. Durante 5 minutos no la vuelve a pedir ───────────────────────
        await irA(app, 'ajustes');
        await w.click('#ajustes-portada [data-tema="equipo"]');
        await w.waitForTimeout(400);
        af.cierto('recién tecleada, no la vuelve a pedir', !(await modalVisible(w)) && await paginaVisible(w, 'equipo'));
    },
};
