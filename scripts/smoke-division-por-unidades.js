/**
 * SMOKE: dividir la cuenta de una mesa POR UNIDADES (2026-09-05).
 *
 * El caso que lo motivó, encontrado usando la app: una mesa de 4 con 2 pizzas
 * (de sabores distintos) y 4 refrescos IGUALES. Las pizzas se repartían bien
 * porque son dos renglones; los refrescos eran UN renglón con cantidad 4, así
 * que los cuatro caían forzosamente en el mismo ticket y las dos parejas no
 * podían pagar 2 y 2.
 *
 * Se cargan las funciones REALES de pos/modulo-mesas.js y la fórmula REAL de
 * pos/modulo-pagos.js (la que está triplicada con el backend y el mobile, §31).
 * Si alguna se renombra, este script falla en vez de pasar en falso.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const RAIZ = path.join(__dirname, '..', 'pos');
let fallos = 0, ok = 0;

function comprobar(desc, real, esperado) {
    const iguales = JSON.stringify(real) === JSON.stringify(esperado);
    if (iguales) { ok++; console.log('  ✓ ' + desc); }
    else { fallos++; console.log('  ✗ ' + desc + '\n      esperado: ' + JSON.stringify(esperado) + '\n      real:     ' + JSON.stringify(real)); }
}

// ── Extraer del archivo REAL las funciones que nos interesan ────────────────
function extraer(archivo, nombres) {
    const src = fs.readFileSync(path.join(RAIZ, archivo), 'utf8');
    let out = '';
    for (const n of nombres) {
        const marca = 'function ' + n + '(';
        const i = src.indexOf(marca);
        if (i < 0) throw new Error('No existe ' + n + '() en ' + archivo + ' (¿se renombró?)');
        // Recorrer llaves para tomar el cuerpo completo.
        let j = src.indexOf('{', i), prof = 0, fin = -1;
        for (let k = j; k < src.length; k++) {
            if (src[k] === '{') prof++;
            else if (src[k] === '}') { prof--; if (prof === 0) { fin = k + 1; break; } }
        }
        if (fin < 0) throw new Error('No pude cerrar ' + n + '()');
        out += src.slice(i, fin) + '\n';
    }
    return out;
}

const codigoPagos = extraer('modulo-pagos.js', [
    'montoDeItems', '_montoItem', '_idItem', 'cuadrarUltimoPago', '_redondearPago',
    'faltantePago',
]);
const codigoMesas = extraer('modulo-mesas.js', [
    '_unidadesDeLaCuenta', '_recalcularPagosPorItems',
]);

// ── El escenario: 2 pizzas distintas + 4 refrescos iguales ─────────────────
// Precios sin impuesto para que las cuentas sean obvias:
//   Pizza peperoni 200 + Pizza hawaiana 200 + 4 refrescos de 25 = 500
const ITEMS = [
    { id: 1, nombre: 'Pizza peperoni', cantidad: 1, subtotal: 200 },
    { id: 2, nombre: 'Pizza hawaiana', cantidad: 1, subtotal: 200 },
    { id: 3, nombre: 'Refresco',       cantidad: 4, subtotal: 100 },
];
const TOTAL = 500;

const sandbox = {
    console,
    _itemsDeLaCuenta: () => ITEMS.map(i => ({ ...i })),
    _desgloseMesa: () => ({ total: TOTAL }),
    _totalDeLaCuenta: () => TOTAL,
    pagosMesa: [],
    asignacionItems: {},
};
vm.createContext(sandbox);
vm.runInContext(codigoPagos + codigoMesas, sandbox);

console.log('\n── Las unidades ──');
const unidades = sandbox._unidadesDeLaCuenta();
comprobar('Un renglón de 4 refrescos produce 4 unidades', unidades.filter(u => u.item_id === 3).length, 4);
comprobar('Los renglones de 1 producen 1 unidad', unidades.filter(u => u.item_id === 1).length, 1);
comprobar('En total hay 6 unidades asignables', unidades.length, 6);
comprobar('Cada refresco vale la cuarta parte del renglón', unidades.find(u => u.item_id === 3).subtotal, 25);
comprobar('Las unidades suman el bruto del renglón', unidades.reduce((a, u) => a + u.subtotal, 0), 500);
comprobar('Una unidad suelta se numera 1 de 1', unidades.find(u => u.item_id === 1).de, 1);

console.log('\n── LA REGRESIÓN: dos parejas pagan 2 refrescos cada una ──');
// Pareja A: pizza peperoni + 2 refrescos.  Pareja B: hawaiana + 2 refrescos.
sandbox.pagosMesa = [
    { method: 'efectivo', amount: 0, tip_amount: 0, item_ids: [] },
    { method: 'tarjeta',  amount: 0, tip_amount: 0, item_ids: [] },
];
sandbox.asignacionItems = {
    '1#0': 0,
    '2#0': 1,
    '3#0': 0, '3#1': 0,   // dos refrescos a la pareja A
    '3#2': 1, '3#3': 1,   // dos refrescos a la pareja B
};
sandbox._recalcularPagosPorItems();
const pagos = sandbox.pagosMesa;

comprobar('La pareja A paga 200 + 2×25 = 250', pagos[0].amount, 250);
comprobar('La pareja B paga 200 + 2×25 = 250', pagos[1].amount, 250);
comprobar('Los dos pagos suman EXACTAMENTE la cuenta', pagos[0].amount + pagos[1].amount, TOTAL);
comprobar('El renglón partido aparece en los dos tickets', [pagos[0].item_ids, pagos[1].item_ids], [[1, 3], [2, 3]]);
comprobar('Los item_ids no se repiten dentro de un pago', pagos[0].item_ids.length, new Set(pagos[0].item_ids).size);

console.log('\n── Repartos desiguales, que es lo que descuadra ──');
sandbox.pagosMesa = [
    { method: 'efectivo', amount: 0, tip_amount: 0, item_ids: [] },
    { method: 'tarjeta',  amount: 0, tip_amount: 0, item_ids: [] },
];
sandbox.asignacionItems = {
    '1#0': 0, '2#0': 0,
    '3#0': 0,
    '3#1': 1, '3#2': 1, '3#3': 1,   // tres refrescos al segundo
};
sandbox._recalcularPagosPorItems();
comprobar('Uno paga 425 y el otro 75', [sandbox.pagosMesa[0].amount, sandbox.pagosMesa[1].amount], [425, 75]);
comprobar('Y siguen sumando la cuenta', sandbox.pagosMesa.reduce((a, p) => a + p.amount, 0), TOTAL);

console.log('\n── El caso de antes tiene que seguir funcionando ──');
sandbox.pagosMesa = [
    { method: 'efectivo', amount: 0, tip_amount: 0, item_ids: [] },
    { method: 'tarjeta',  amount: 0, tip_amount: 0, item_ids: [] },
];
sandbox.asignacionItems = { '1#0': 0, '2#0': 1, '3#0': 0, '3#1': 0, '3#2': 0, '3#3': 0 };
sandbox._recalcularPagosPorItems();
comprobar('Los 4 refrescos enteros a un solo pago siguen valiendo', sandbox.pagosMesa[0].amount, 300);
comprobar('Sin asignar nada, todo cae en el primer pago', (() => {
    sandbox.pagosMesa = [
        { method: 'efectivo', amount: 0, tip_amount: 0, item_ids: [] },
        { method: 'tarjeta',  amount: 0, tip_amount: 0, item_ids: [] },
    ];
    sandbox.asignacionItems = {};
    sandbox._recalcularPagosPorItems();
    return [sandbox.pagosMesa[0].amount, sandbox.pagosMesa[1].amount];
})(), [500, 0]);

console.log('\n── Cantidades raras no se parten ──');
const sandbox2 = { ...sandbox, _itemsDeLaCuenta: () => ([{ id: 9, nombre: 'Queso', cantidad: 0.75, subtotal: 60 }]) };
vm.createContext(sandbox2);
vm.runInContext(codigoPagos + codigoMesas, sandbox2);
comprobar('0.75 kg de queso es UNA unidad, no se parte', sandbox2._unidadesDeLaCuenta().length, 1);

console.log('\n' + (fallos ? '❌ ' + fallos + ' fallos, ' + ok + ' ok' : '✅ ' + ok + ' comprobaciones, todo en verde'));
process.exit(fallos ? 1 : 0);
