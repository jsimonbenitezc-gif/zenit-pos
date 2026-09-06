// ============================================================================
// explorar/lib/comandos.js — LO QUE SE PUEDE HACER CON LA APP ABIERTA
//
// Cada comando es una acción de PERSONA (tocar, teclear, elegir, mirar) o una
// lectura (la pantalla, la consola, la base). No hay ningún comando que ejecute
// una función interna de la app: ésa es la regla que sostiene el banco del
// §46 y aquí vale igual — los cuatro fantasmas del desktop (§28, §29, §36) eran
// funciones que EXISTÍAN y no estaban cableadas a ningún botón, así que
// llamarlas por dentro las habría dado por buenas.
//
// El único comando que escribe por dentro es `sembrar`, y solo al arrancar:
// ponerse premium o apuntar a otro servidor no tiene pantalla (ver sembrar.js).
//
// ⚠️ TODO COMANDO DEVUELVE TEXTO PARA LEER, no un objeto para adivinar. Quien
// explora lo hace a través de esta salida; si un fallo aquí se convierte en un
// "Timeout 30000ms exceeded", se pierde el rastro de lo que de verdad pasó, así
// que los errores se cuentan con lo que había en pantalla en ese momento.
// ============================================================================

const path = require('path');
const { instantanea, contar } = require('./mirar');

const ESPERA = 400;   // margen para que el renderer repinte tras un clic

// ── Selectores: taquigrafía para no teclear CSS todo el rato ────────────────
//
// `#id` y cualquier selector de Playwright se pasan tal cual. Las dos formas
// cortas se acotan a la REGIÓN ACTIVA (el modal de encima, o la vista) porque
// media docena de modales comparten el texto "Cancelar" y un clic global
// acabaría tocando el de otra pantalla — un fallo que se lee como un defecto de
// la app sin serlo.
//
//   boton:Cobrar     → el botón que dice "Cobrar", dentro de lo que se ve
//   texto:Sin mesas  → el elemento que contiene ese texto
//
async function resolver(w, sel) {
    const corto = /^(boton|texto):(.*)$/s.exec(sel);
    if (!corto) return w.locator(sel);

    const [, tipo, valor] = corto;
    const region = await regionActiva(w);
    const dentro = region ? w.locator(region) : w.locator('body');
    const escapado = valor.replace(/"/g, '\\"');

    if (tipo === 'boton') {
        return dentro.locator(
            'button:has-text("' + escapado + '"), .btn:has-text("' + escapado + '")'
        ).filter({ visible: true });
    }
    return dentro.locator(':text("' + escapado + '")').filter({ visible: true });
}

/** El selector de lo que el usuario está mirando ahora mismo. */
async function regionActiva(w) {
    return w.evaluate(() => {
        const dlg = document.getElementById('modal-dialogo-zenit');
        if (dlg && dlg.getClientRects().length) return '#modal-dialogo-zenit';
        const abiertos = [].slice.call(document.querySelectorAll('.modal'))
            .filter((m) => m.getClientRects().length > 0);
        if (abiertos.length) {
            const ultimo = abiertos[abiertos.length - 1];
            if (ultimo.id) return '#' + ultimo.id;
        }
        const vista = document.querySelector('.view.active');
        return vista && vista.id ? '#' + vista.id : null;
    });
}

/** Cuenta qué había en pantalla cuando algo falló. Sin esto no hay rastro. */
async function conContexto(w, mensaje) {
    try {
        const inst = await w.evaluate(instantanea, {});
        return mensaje + '\n\nLO QUE HABÍA EN PANTALLA EN ESE MOMENTO:\n' + contar(inst);
    } catch {
        return mensaje + '\n(no se pudo leer la pantalla: puede que la ventana se haya cerrado)';
    }
}

// ── Los comandos ────────────────────────────────────────────────────────────

const VISTAS = [
    'dashboard', 'nueva-venta', 'pedidos', 'mesas', 'turno', 'productos',
    'clientes', 'ofertas', 'inventario', 'rentabilidad', 'ajustes',
];

const COMANDOS = {

    /** Qué se ve. Es el comando que más se usa: úsalo antes y después de todo. */
    async ver(ctx) {
        const inst = await ctx.w.evaluate(instantanea, {});
        return contar(inst);
    },

    /** Cambia de vista por la barra lateral, como el usuario. */
    async ir(ctx, vista) {
        if (!vista) return 'Vistas: ' + VISTAS.join(', ');
        if (!VISTAS.includes(vista)) {
            return '❌ No existe la vista "' + vista + '".\nVistas: ' + VISTAS.join(', ');
        }
        await ctx.w.click('.menu-item[data-view="' + vista + '"]');
        try {
            await ctx.w.waitForSelector('#view-' + vista + '.view.active', { timeout: 10000 });
        } catch {
            return await conContexto(ctx.w,
                '❌ Se tocó la vista "' + vista + '" en el menú y NO se activó en 10 s.');
        }
        await ctx.w.waitForTimeout(900);
        return await COMANDOS.ver(ctx);
    },

    /** Toca algo. Devuelve la pantalla resultante para ver qué cambió. */
    async clic(ctx, sel, ...resto) {
        if (!sel) return '❌ Falta qué tocar.  Ej: clic "boton:Cobrar"   ·   clic "#btn-confirmar-final"';
        const completo = [sel, ...resto].join(' ');
        const loc = await resolver(ctx.w, completo);
        const cuantos = await loc.count();
        if (cuantos === 0) {
            return await conContexto(ctx.w, '❌ No hay nada que coincida con «' + completo + '».');
        }
        try {
            await loc.first().click({ timeout: 8000 });
        } catch (e) {
            return await conContexto(ctx.w,
                '❌ No se pudo tocar «' + completo + '» (' + cuantos + ' coincidencia(s)): ' +
                String(e.message).split('\n')[0] +
                '\n💡 Si está tapado por un modal, ciérralo primero; si mide 0×0 (los interruptores' +
                ' de Ajustes lo hacen), toca su .slider.');
        }
        await ctx.w.waitForTimeout(ESPERA + (cuantos > 1 ? 0 : 0));
        const aviso = cuantos > 1
            ? '(⚠️ «' + completo + '» coincidía con ' + cuantos + ' elementos; se tocó el primero)\n\n'
            : '';
        return aviso + await COMANDOS.ver(ctx);
    },

    /** Teclea en un campo, disparando el evento `input` que la app escucha. */
    async escribir(ctx, sel, ...valor) {
        if (!sel) return '❌ Uso: escribir <selector> <valor>';
        const texto = valor.join(' ');
        const loc = await resolver(ctx.w, sel);
        if (await loc.count() === 0) {
            return await conContexto(ctx.w, '❌ No hay ningún campo «' + sel + '».');
        }
        try {
            await loc.first().fill(texto, { timeout: 8000 });
            // La app recalcula totales en el evento `input`; `fill` ya lo dispara,
            // pero algunos campos escuchan también `change`. Se mandan los dos.
            await loc.first().dispatchEvent('input');
            await loc.first().dispatchEvent('change');
        } catch (e) {
            return await conContexto(ctx.w,
                '❌ No se pudo escribir en «' + sel + '»: ' + String(e.message).split('\n')[0]);
        }
        await ctx.w.waitForTimeout(ESPERA);
        return await COMANDOS.ver(ctx);
    },

    /** Elige una opción de una lista desplegable. */
    async elegir(ctx, sel, ...valor) {
        if (!sel) return '❌ Uso: elegir <selector> <valor>';
        const v = valor.join(' ');
        const loc = await resolver(ctx.w, sel);
        try {
            await loc.first().selectOption(v, { timeout: 8000 });
        } catch (e) {
            const opciones = await loc.first()
                .evaluate((s) => [].slice.call(s.options).map((o) => o.value)).catch(() => []);
            return await conContexto(ctx.w,
                '❌ No se pudo elegir "' + v + '" en «' + sel + '»' +
                (opciones.length ? '. Opciones reales: [' + opciones.join(', ') + ']' : '') +
                '\n' + String(e.message).split('\n')[0]);
        }
        await ctx.w.waitForTimeout(ESPERA);
        return await COMANDOS.ver(ctx);
    },

    /** Responde al diálogo de la app (confirmarZenit / alertaZenit). */
    async dialogo(ctx, respuesta = 'ok') {
        const id = respuesta === 'cancelar' ? '#dialogo-zenit-cancelar' : '#dialogo-zenit-ok';
        const loc = ctx.w.locator(id);
        if (await loc.count() === 0) {
            return await conContexto(ctx.w, '❌ No hay ningún diálogo abierto ahora mismo.');
        }
        await loc.click();
        await ctx.w.waitForTimeout(ESPERA);
        return await COMANDOS.ver(ctx);
    },

    /** El texto de lo que coincida. Para leer un total sin volcar la vista entera. */
    async leer(ctx, ...sel) {
        const s = sel.join(' ');
        if (!s) return '❌ Uso: leer <selector>';
        const loc = await resolver(ctx.w, s);
        const n = await loc.count();
        if (n === 0) return '(«' + s + '» no coincide con nada)';
        const textos = [];
        for (let i = 0; i < Math.min(n, 30); i++) {
            textos.push('[' + i + '] ' + (await loc.nth(i).innerText().catch(() => '(sin texto)'))
                .replace(/\s+/g, ' ').trim());
        }
        if (n > 30) textos.push('…y ' + (n - 30) + ' más');
        return textos.join('\n');
    },

    /** Espera: un número de milisegundos, o a que aparezca un selector. */
    async esperar(ctx, que = '1000') {
        if (/^\d+$/.test(que)) {
            await ctx.w.waitForTimeout(Math.min(parseInt(que, 10), 60000));
            return 'esperé ' + que + ' ms\n\n' + await COMANDOS.ver(ctx);
        }
        try {
            await ctx.w.waitForSelector(que, { timeout: 20000 });
        } catch {
            return await conContexto(ctx.w, '❌ «' + que + '» no apareció en 20 s.');
        }
        return await COMANDOS.ver(ctx);
    },

    /**
     * Lo que la app escribió en consola desde la última vez que se preguntó.
     *
     * Los errores también salen SOLOS al final de cada comando (ver sesion.js):
     * preguntar por ellos no puede ser un paso que se olvide, porque olvidarlo
     * es exactamente como se pierden.
     */
    async consola(ctx, cuantos = '30') {
        const nuevos = ctx.consola.leerNuevos();
        if (!nuevos.length) return '(nada nuevo en consola)';
        const n = Math.min(parseInt(cuantos, 10) || 30, nuevos.length);
        return nuevos.slice(-n).map((m) => '[' + m.tipo + '] ' + m.texto).join('\n');
    },

    /** Consulta de SOLO LECTURA a la SQLite del perfil desechable. */
    async sql(ctx, ...partes) {
        const consulta = partes.join(' ').trim();
        if (!consulta) {
            return 'Uso: sql "SELECT * FROM pedidos ORDER BY id DESC LIMIT 5"\n' +
                   'Tablas frecuentes: pedidos, pedido_items, pagos_pedido, turnos,\n' +
                   'movimientos_caja, productos, clasificaciones, mesas, insumos, ajustes, clientes';
        }
        if (!/^\s*(select|pragma|with)\b/i.test(consulta)) {
            return '❌ Aquí solo se LEE. La base se cambia usando la app, que es lo que se está probando.';
        }
        const base = ctx.abrirBase();
        try {
            const filas = await base.todas(consulta);
            if (!filas.length) return '(0 filas)';
            const cabecera = Object.keys(filas[0]);
            const linea = (vals) => vals.map((v) => String(v === null ? 'NULL' : v)).join(' | ');
            const cuerpo = filas.slice(0, 50).map((f) => linea(cabecera.map((c) => f[c])));
            return [linea(cabecera), cabecera.map(() => '---').join(' | '), ...cuerpo].join('\n') +
                (filas.length > 50 ? '\n…y ' + (filas.length - 50) + ' filas más' : '') +
                '\n(' + filas.length + ' filas)';
        } catch (e) {
            return '❌ SQL: ' + e.message;
        } finally {
            await base.cerrar();
        }
    },

    /** Foto de la pantalla. Devuelve la ruta para poder MIRARLA. */
    async foto(ctx, nombre = 'pantalla') {
        const destino = path.join(ctx.carpetaFotos, nombre.replace(/[^\w.-]/g, '_') + '.png');
        require('fs').mkdirSync(path.dirname(destino), { recursive: true });
        await ctx.w.screenshot({ path: destino });
        return 'foto guardada en:\n' + destino;
    },

    /**
     * Escape de LECTURA para inspeccionar el estado interno.
     *
     * ⚠️ Es para MIRAR, nunca para provocar. `js ejecutarVenta()` daría por buena
     * justamente la parte que más se ha roto en este repo —el cable entre el
     * botón y la función— y convertiría este arnés en el que ya se descartó.
     * Si quieres que algo pase, tócalo.
     */
    async js(ctx, ...expr) {
        const codigo = expr.join(' ');
        if (!codigo) return '❌ Uso: js "document.querySelectorAll(\'.product-card\').length"';
        try {
            const r = await ctx.w.evaluate('(async () => (' + codigo + '))()');
            return typeof r === 'string' ? r : JSON.stringify(r, null, 2);
        } catch (e) {
            return '❌ ' + String(e.message).split('\n')[0];
        }
    },

    /** Recarga la ventana (como reabrir la app sin perder la base). */
    async recargar(ctx) {
        await ctx.w.reload();
        await ctx.esperarArranque(ctx.w);
        return 'recargada.\n\n' + await COMANDOS.ver(ctx);
    },

    /** Dónde está la sesión y cuánto lleva abierta. */
    async estado(ctx) {
        return [
            'perfil desechable: ' + ctx.perfil,
            'base de datos:     ' + path.join(ctx.perfil, 'ventas.db'),
            'fotos:             ' + ctx.carpetaFotos,
            'abierta desde:     ' + new Date(ctx.inicio).toLocaleTimeString(),
            'sembrado:          ' + ctx.sembrado,
            'mensajes de consola acumulados: ' + ctx.consola.mensajes.length,
        ].join('\n');
    },

    /** Lista los comandos. */
    async ayuda() {
        return AYUDA;
    },
};

const AYUDA = [
    'COMANDOS  (node explorar/z.js <comando> [args])',
    '',
    '  ver                          qué se ve ahora mismo — úsalo constantemente',
    '  ir <vista>                   dashboard nueva-venta pedidos mesas turno productos',
    '                               clientes ofertas inventario rentabilidad ajustes',
    '  clic <sel>                   clic "boton:Cobrar"   ·   clic "#btn-confirmar-final"',
    '  escribir <sel> <valor>       escribir "#efectivo-recibido" 500',
    '  elegir <sel> <valor>         elegir "#cobrar-mesa-metodo" tarjeta',
    '  dialogo [ok|cancelar]        responde al diálogo de la app',
    '  leer <sel>                   el texto de lo que coincida',
    '  esperar <ms|sel>             espera y vuelve a mirar',
    '  consola [n]                  lo que la app escribió desde la última vez',
    '  sql "SELECT …"               lectura de la SQLite del perfil desechable',
    '  foto [nombre]                guarda una imagen de la pantalla',
    '  js "<expresión>"             LECTURA del estado interno (nunca para provocar)',
    '  recargar                     recarga la ventana',
    '  estado                       dónde vive esta sesión',
    '',
    'SELECTORES:  "#id" y cualquier selector de Playwright van tal cual.',
    '             "boton:Texto" y "texto:Texto" se acotan a lo que se ve ahora',
    '             (el modal de encima, o la vista activa).',
].join('\n');

module.exports = { COMANDOS, AYUDA, VISTAS, regionActiva };
