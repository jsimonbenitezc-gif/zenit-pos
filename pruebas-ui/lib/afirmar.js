// ============================================================================
// pruebas-ui/lib/afirmar.js — afirmaciones y reporte
//
// Mismo contrato que `pruebas-postgres/lib/afirmar.js` del backend, para que los
// dos bancos se lean igual y un fallo se entienda sin cambiar de idioma mental.
// Está copiado a propósito y no importado: este repo es OTRO repo, y depender de
// que el del backend esté clonado al lado convertiría el banco de la UI en algo
// que "a veces se puede correr".
// ============================================================================

/** Centavos enteros: comparar dinero con floats produce fallos fantasma. */
function centavos(n) {
    return Math.round((parseFloat(n) || 0) * 100);
}

function pesos(n) {
    return '$' + (parseFloat(n) || 0).toFixed(2);
}

/** "$1,234.50" → 1234.5 — lo que se lee de la pantalla viene formateado. */
function deTexto(txt) {
    if (txt === null || txt === undefined) return NaN;
    const limpio = String(txt).replace(/[^\d.,-]/g, '').replace(/,/g, '');
    return parseFloat(limpio);
}

class Afirmador {
    constructor(nombreRecorrido) {
        this.recorrido = nombreRecorrido;
        this.comprobaciones = 0;
        this.fallos = [];
    }

    _ok(descripcion) {
        this.comprobaciones++;
        console.log('      ✓ ' + descripcion);
    }

    _fallo(descripcion, detalle) {
        this.comprobaciones++;
        this.fallos.push({ descripcion, detalle });
        console.log('      ✗ ' + descripcion);
        console.log('        ' + detalle);
    }

    /** Igualdad de DINERO, al centavo exacto. */
    dinero(descripcion, obtenido, esperado) {
        if (centavos(obtenido) === centavos(esperado)) {
            this._ok(descripcion + ' = ' + pesos(esperado));
        } else {
            const dif = (centavos(obtenido) - centavos(esperado)) / 100;
            this._fallo(
                descripcion,
                'esperaba ' + pesos(esperado) + ' y llegó ' + pesos(obtenido) +
                ' (descuadre de ' + (dif > 0 ? '+' : '') + dif.toFixed(2) + ')'
            );
        }
        return this;
    }

    /** Dinero leído de la PANTALLA, que llega como "$1,234.50". */
    dineroEnPantalla(descripcion, textoLeido, esperado) {
        const valor = deTexto(textoLeido);
        if (Number.isNaN(valor)) {
            this._fallo(descripcion, 'la pantalla no mostraba un importe legible: ' + JSON.stringify(textoLeido));
            return this;
        }
        return this.dinero(descripcion, valor, esperado);
    }

    igual(descripcion, obtenido, esperado) {
        if (obtenido === esperado) this._ok(descripcion + ' = ' + JSON.stringify(esperado));
        else this._fallo(descripcion, 'esperaba ' + JSON.stringify(esperado) + ' y llegó ' + JSON.stringify(obtenido));
        return this;
    }

    cierto(descripcion, condicion, detalle = 'la condición no se cumplió') {
        if (condicion) this._ok(descripcion);
        else this._fallo(descripcion, detalle);
        return this;
    }

    /**
     * El invariante del BLOQUE 8 sobre una fila de la SQLite local:
     *     total = subtotal + impuesto
     * Se comprueba en TODA venta del banco: si un día alguien mete la propina o un
     * modificador dentro del total, revienta aquí y no en la caja de nadie.
     */
    invarianteImpuesto(descripcion, pedido) {
        if (pedido.subtotal === null || pedido.subtotal === undefined) {
            this._ok(descripcion + ' — sin desglose (subtotal null), nada que cuadrar');
            return this;
        }
        const suma = centavos(pedido.subtotal) + centavos(pedido.impuesto);
        if (suma === centavos(pedido.total)) {
            this._ok(descripcion + ' — total = subtotal + impuesto (' + pesos(pedido.total) + ')');
        } else {
            this._fallo(
                descripcion,
                'total ' + pesos(pedido.total) + ' ≠ subtotal ' + pesos(pedido.subtotal) +
                ' + impuesto ' + pesos(pedido.impuesto) + ' (= ' + pesos(suma / 100) + ')'
            );
        }
        return this;
    }

    get paso() { return this.fallos.length === 0; }
}

module.exports = { Afirmador, centavos, pesos, deTexto };
