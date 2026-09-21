// ============================================================================
// RECORRIDO 4 — MODO CONECTADO: LA VENTA TIENE QUE LLEGAR AL SERVIDOR
//
// El BLOQUE 16 pide probar los dos modos del desktop porque "casi todos los bugs
// de sincronización viven en la frontera" (§13). Los tres recorridos anteriores
// corren en modo LOCAL puro; éste crea una cuenta de verdad contra un backend
// desechable —el del BLOQUE 15, reutilizado tal cual (lib/backend.js)— y
// comprueba que lo que se cobra en la pantalla acaba en la base del servidor.
//
// ⚠️ NO SE MIRA SOLO LA SQLITE LOCAL. Preguntarle al desktop si guardó la venta
// deja sin probar justo la mitad que este recorrido existe para cubrir: la venta
// se busca por HTTP, con la sesión de la cuenta que acaba de crearse.
//
// Si el repo del backend no está al lado, el runner SALTA este recorrido con un
// aviso en vez de fallar: no es un defecto del desktop.
// ============================================================================

const {
    irA, crearCuenta, estaConectado, venderEnMostrador, cancelarPedido,
    leerBase, crearMesas, abrirMesa, agregarProductosAMesa,
} = require('../lib/cajero');

const HAMBURGUESA = 85.00;
const COCA = 25.00;

module.exports = {
    nombre: 'Modo conectado: la venta llega al servidor',
    etiqueta: 'conectado',
    necesitaBackend: true,

    async ejecutar({ app, af, backend }) {
        const w = app.ventana;
        const base = leerBase(app.perfil);

        // Correo único por corrida: el backend es desechable, pero dos corridas
        // seguidas contra el mismo servidor chocarían con el correo repetido.
        const correo = 'caja+' + Date.now() + '@zenit.pruebas';
        const contrasena = 'zenit-pruebas-2026';

        // ── Crear la cuenta desde Ajustes ───────────────────────────────────
        await crearCuenta(app, {
            url: backend.api,
            nombre: 'Taquería del Banco',
            correo,
            contrasena,
        });
        af.cierto('el equipo queda en modo conectado', await estaConectado(app),
            'la app siguió en modo local después de crear la cuenta');
        af.cierto('Ajustes muestra la cuenta vinculada',
            (await w.locator('#zenit-con-cuenta').innerText()).includes(correo),
            'la tarjeta de cuenta no muestra el correo con el que se registró');

        // ── El catálogo local subió con la cuenta ───────────────────────────
        // `registrarCuentaZenit` llama a `syncLocalToCloud()`: los productos que
        // el negocio ya tenía en su equipo tienen que estar arriba, o el primer
        // cobro desde otro dispositivo vendería un catálogo vacío.
        const api = await backend.comoNegocio(correo, contrasena);
        const productos = await api.exigir('GET', '/api/products?limit=100');
        const nombres = (productos.data || productos).map((p) => p.name);
        af.cierto('el catálogo local subió al crear la cuenta',
            nombres.includes('Hamburguesa Clásica') && nombres.includes('Coca Cola'),
            'el servidor solo tiene: ' + JSON.stringify(nombres));

        // ── Una venta en modo conectado ─────────────────────────────────────
        const venta = await venderEnMostrador(app,
            [{ nombre: 'Hamburguesa Clásica' }, { nombre: 'Coca Cola' }],
            { metodo: 'tarjeta' });
        af.dinero('la pantalla cobra la hamburguesa y el refresco', venta.total, HAMBURGUESA + COCA);

        // El desktop encola sus ventas y las sube en segundo plano (§26), así que
        // se le da margen antes de preguntarle al servidor.
        let enServidor = null;
        for (let intento = 0; intento < 12 && !enServidor; intento++) {
            await w.waitForTimeout(1500);
            const pedidos = await api.exigir('GET', '/api/orders?limit=20');
            enServidor = (pedidos.data || []).find((o) => Math.abs(parseFloat(o.total) - (HAMBURGUESA + COCA)) < 0.01);
        }
        af.cierto('la venta llegó al SERVIDOR, no solo a la base local', Boolean(enServidor),
            'pasaron 18 segundos y el backend seguía sin esa venta');
        if (enServidor) {
            af.dinero('el servidor guardó el mismo total', enServidor.total, HAMBURGUESA + COCA);
            af.igual('el servidor guardó el método de pago', enServidor.payment_method, 'tarjeta');
            af.invarianteImpuesto('la venta del servidor cuadra', {
                total: enServidor.total,
                subtotal: enServidor.subtotal,
                impuesto: enServidor.tax_amount,
            });
        }

        // ── Cancelar CON PIN, que es el camino que solo existe conectado ─────
        // En modo local `pedirPinEmpleado` ejecuta la acción sin preguntar nada
        // (modulo-pin-audit.js). Con cuenta aparece el modal, y ésta es la única
        // forma de recorrerlo. El puesto activo es el dueño y no tiene PIN de
        // puesto configurado, así que autoriza confirmando (§19.19).
        const aCancelar = await venderEnMostrador(app, [{ nombre: 'Coca Cola' }], { metodo: 'efectivo' });
        await irA(app, 'pedidos');
        await w.locator('#lista-pedidos tr')
            .filter({ has: w.locator('td strong:text-is("#' + aCancelar.pedidoId + '")') })
            .locator('select').selectOption('cancelado');

        const pidioPin = await w.locator('#modal-pin-empleado').isVisible().catch(() => false);
        af.cierto('con cuenta, cancelar pide autorización', pidioPin,
            'el modal de PIN no apareció: con cuenta, cancelar tiene que quedar auditado');
        if (pidioPin) {
            await w.click('#btn-confirmar-pin-empleado');
            await w.waitForTimeout(2500);
        }
        await w.waitForTimeout(1500);

        const local = await base.una('SELECT estado FROM pedidos WHERE id = ?', [aCancelar.pedidoId]);
        af.igual('el pedido quedó cancelado en el equipo', local && local.estado, 'cancelado');

        // Y en el servidor, que es quien manda. Las dos comprobaciones hacen falta:
        // el equipo sin conexión lee su copia local (§13), y si las dos se separan
        // el corte de caja da un número distinto según dónde se mire.
        const enNube = await api.exigir('GET', '/api/orders?limit=20');
        const cancelado = (enNube.data || []).find((o) => Math.abs(parseFloat(o.total) - COCA) < 0.01);
        af.igual('y también en el servidor', cancelado && cancelado.status, 'cancelado');

        const auditoria = await api.exigir('GET', '/api/audit');
        const cancelaciones = (auditoria.data || auditoria).filter((l) => l.action_type === 'cancel_order');
        af.cierto('la cancelación quedó AUDITADA en el servidor', cancelaciones.length === 1,
            'el registro de acciones sensibles tiene ' + cancelaciones.length + ' cancelaciones');

        // ── Quitar un producto de una cuenta abierta deja RASTRO ─────────────
        // PLAN_OFERTAS_V1, Bloque 0. Es el robo clásico de restaurante: el
        // cliente paga lo que pidió, se borra un producto antes de cerrar y la
        // diferencia se queda en la bolsa. La caja y el inventario cuadran, así
        // que lo único que lo delata es la auditoría — y antes no había ninguna.
        // Solo existe CONECTADO: en modo local la mesa vive en la SQLite.
        await crearMesas(app, [{ nombre: 'Mesa Banco', zona: 'Interior', capacidad: 4 }]);
        await abrirMesa(app, 'Mesa Banco', 2);
        await agregarProductosAMesa(app, 'Mesa Banco', [
            { nombre: 'Hamburguesa Clásica' }, { nombre: 'Coca Cola' },
        ]);
        const renglones = w.locator('#mesa-panel-items button[title="Eliminar"]');
        af.igual('la mesa tiene los dos productos', await renglones.count(), 2);
        await w.locator('#mesa-panel-items > div', { hasText: 'Coca Cola' })
            .locator('button[title="Eliminar"]').click();
        await w.waitForTimeout(2000);
        af.igual('la mesa se quedó con un producto', await renglones.count(), 1);

        const trasQuitar = await api.exigir('GET', '/api/audit');
        const quitados = (trasQuitar.data || trasQuitar).filter((l) => l.action_type === 'remove_item');
        af.cierto('quitar el refresco quedó AUDITADO en el servidor', quitados.length === 1,
            'el registro de acciones sensibles tiene ' + quitados.length + ' productos quitados');
        if (quitados.length === 1) {
            const antes = JSON.parse(quitados[0].before_data || '{}');
            af.igual('la auditoría dice QUÉ se quitó', antes.producto, 'Coca Cola');
            af.dinero('y cuánto valía', antes.importe, COCA);
            af.cierto('y a nombre de quién', Boolean(quitados[0].employee_name),
                'el renglón de auditoría no tiene nombre');
        }

        await base.cerrar();
    },
};
