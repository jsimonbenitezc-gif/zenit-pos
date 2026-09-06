# HALLAZGOS de las sesiones de exploración

> Dos listas y no se mezclan (BLOQUE 17): los **errores** se arreglan, la
> **fricción** se discute con el dueño del producto. Cada entrada trae cómo
> reproducirla — un reporte sin pasos es ruido.
>
> Estado: `abierto` · `arreglado (commit)` · `descartado (por qué)`

---

## ERRORES

### E-5 · Rentabilidad costeaba 60 g de queso como 60 KILOS 🔴
**Estado:** arreglado — 2026-09-05
**Dónde:** `database/db.js` → `_mapaDeCostosLocal`

Reproducir, sobre el negocio sembrado del arnés:

1. Vender una **Quesadilla** ($42.50; su receta lleva 1 tortilla y **60 g de queso**,
   con el queso guardado en **kg** a $148.50).
2. Ir a **Rentabilidad**.

Qué salía: **Costo de insumos $10,451.20**, ganancia **−$10,414.56**, margen
**−28,424 %**. Con eso, el reporte entero es inservible — y es una función premium.

Dos causas, las dos en el mismo sitio:

- La consulta de recetas **no traía `unidad_receta`**
  (`SELECT producto_id, tipo, referencia_id, cantidad FROM receta_items`), así que la
  conversión recibía `undefined` y dejaba la cantidad tal cual: 60 g → 60 kg.
- Y el costo usaba **una tercera copia** de la tabla de conversión
  (`_convertirCantidadLocal`) que además no miraba el contenido del paquete (§45).

⚠️ Es el §34 al revés: *el costo y el consumo partían de factores distintos*. La bodega
descontaba 0.06 kg y el reporte costeaba 60. Arreglo: se borró la tercera copia y el costo
usa ahora **la misma `convertirUnidad()` que el descuento de inventario**.

⚠️ **Por qué el smoke test no lo vio:** su propio comentario afirmaba que `receta_items`
*"NO tiene columna unidad_receta"* — y es falso, `db.js` la agrega con un ALTER y la interfaz
la escribe. Por creerlo, sembraba todas las recetas en la unidad del propio insumo, justo
donde no hace falta convertir. **Un fixture que codifica una suposición equivocada sobre el
esquema es ciego exactamente donde la suposición está mal.**

---

### E-1 · Un descuento fijo mayor que el ticket registra una venta con total NEGATIVO 🔴
**Estado:** arreglado — 2026-09-05
**Dónde:** `pos/modulo-venta.js` (modo local y conectado, el cálculo del ticket)

Reproducir, sobre una **instalación recién hecha** (usa el descuento "Cortesía
$50" que Zenit siembra solo):

1. Abrir turno con fondo $1,000.
2. Venta → un solo producto barato (Taco al pastor, $24.50).
3. Aplicar Descuento → **Cortesía $50**.
4. El ticket muestra **Total: $-25.50**. Cobrar → Efectivo → Confirmar.

Qué pasa: la venta se guarda con `total = -25.5` y `subtotal = -25.5`. El turno
pasa a "Total Vendido **$-25.50**" y el efectivo esperado del cierre baja a
**$974.50** con $1,000 reales en el cajón: **un sobrante fantasma de $25.50**.
Es la misma familia de descuadre que cerraron el §28 (gastos), el §30
(propinas) y el §31 (pagos divididos).

Por qué importa más de lo que parece: **el backend YA lo acota** desde siempre
(`routes/orders.js:738`, `Math.min(Math.max(discount,0), calculatedTotal)`), así
que en modo conectado el cajero ve $-25.50 en pantalla y el servidor registra
$0.00 — dos números distintos para la misma venta.

Arreglo: el descuento se topa al subtotal en el cliente, igual que en el
servidor, y el total nunca baja de $0.

---

### E-2 · Cancelar una venta en modo local NO devuelve los insumos 🔴
**Estado:** arreglado — 2026-09-05
**Dónde:** `database/db.js` → `actualizarEstadoPedido`

Reproducir:

1. Vender un producto **con receta** (Taco al pastor: 2 tortillas + 80 g de
   carne + 15 g de cebolla). Anotar el stock en Inventario.
2. Pedidos → en la fila de esa venta, cambiar el selector a **Cancelado**.
3. Volver a Inventario: **el stock es el mismo**. Los insumos siguen
   descontados para siempre.

`actualizarEstadoPedido` era un `UPDATE pedidos SET estado` pelado.
`restaurarInsumosDeVenta` existía desde siempre y solo la llamaba
`eliminarItemMesa` (§32.6b). El backend sí restaura al cancelar (§19.14), así
que la MISMA acción tenía dos efectos distintos según el modo, y en local el
inventario se desviaba en silencio, una cancelación a la vez — la frase exacta
que el §32.6b usó para el bug hermano de las mesas.

Es además el incumplimiento literal de la regla §19.28: *si descuentas
inventario, escribe también el camino de vuelta; la pareja tiene que ser
simétrica o el stock se desvía solo*.

---

### E-3 · Una mesa recién abierta dice llevar 5 horas ocupada 🟠
**Estado:** arreglado — 2026-09-05
**Dónde:** `pos/modulo-mesas.js:77` → `_tiempoEnMesa`

Reproducir: Mesas → tocar una mesa libre → Abrir Mesa. La tarjeta dice
**"0 productos · 5h 0m"** y el panel **"Desde 5h 0m"**.

El desfase es exactamente el huso del equipo: 5 h en Cancún (UTC−5), **6 h en
Ciudad de México**. La SQLite del desktop guarda hora **local**
(`datetime('now','localtime')`, §26) y esa función le pegaba una `'Z'` —
declarándola UTC— antes de restar.

Solo pasa en modo local: del backend la fecha llega en ISO con `Z` y se
interpreta bien. Es display, no dinero, pero un mesero no puede saber cuánto
lleva sentada una mesa y **todas** parecen llevar seis horas.

---

### E-4 · El historial de Entradas y Salidas de inventario muestra la hora en UTC 🟠
**Estado:** arreglado — 2026-09-05
**Dónde:** `database/db.js` → `entradas_insumos.fecha` y `salidas_insumos.fecha`

Reproducir: Inventario → Salidas → Registrar Salida. La fila aparece fechada
**5–6 horas en el futuro** (a las 18:43 locales escribió "11:43 p.m.").

Las dos columnas se creaban con `DEFAULT CURRENT_TIMESTAMP`, que en SQLite es
**UTC**, y toda esta base compara en hora local. Es la trampa del §26 —cerrada
en abrir mesa, cerrar mesa y cerrar turno— que quedó abierta aquí.

Seguían con el mismo default `mermas.fecha`, `log_descuentos.fecha` y
`clientes.fecha_registro`; se corrigieron los cinco de una vez.

---

## FRICCIÓN

> Funciona; el problema es lo que le cuesta al negocio. **No se toca nada de
> aquí sin decisión del dueño del producto.**
>
> Los cinco de abajo se arreglaron el 2026-09-05, con el visto bueno del dueño.
> Los cinco **avisan, no bloquean**: es la regla del §37 y del §19.19 — un
> candado que impide anotar lo que ya pasó hace más daño que el riesgo que evita.

### F-1 · Una salida de inventario mayor que el stock se aceptaba callando
**Estado:** arreglado — 2026-09-05 · `pos/modulo-inventario.js`
Inventario → Salidas → Registrar Salida, cantidad **5000** sobre un insumo con
**11.84 kg**. Se acepta: el insumo queda en **0** (`MAX(0, …)`) y el historial
dice "−5000 kg". Ni un aviso.

Es el escenario del dedo gordo, no el del ladrón: se teclea 5000 por 5.000 o se
elige el insumo equivocado. Y el registro queda mintiendo — la merma anotada no
es la que ocurrió, así que la valoración del inventario sale mal.

**Propuesta:** avisar, no bloquear ("vas a descontar 5000 kg y solo hay 11.84;
el insumo quedará en 0 — ¿seguro?"). Bloquear sería un candado, y este proyecto
prefiere la señal (§37).

### F-2 · Un retiro de caja podía superar lo que hay en el cajón
**Estado:** arreglado — 2026-09-05 · `pos/modulo-turno.js`
Turno → Registrar movimiento → Retiro **$999,999** con ~$974 en caja. Se
acepta, y el efectivo esperado del cierre pasa a **−$999,024.50**.

El backend topa en $1,000,000 (§28.8) y rechaza ≤ 0, pero nadie compara contra
lo que hay. Mismo caso del dedo gordo: 999999 en lugar de 999.99.

**Propuesta:** confirmación cuando el retiro supere el efectivo esperado,
diciendo los dos números. Igual que arriba: aviso, no candado — un negocio real
puede tener motivos raros y quedarse sin poder anotar el movimiento es peor
(§19.19).

### F-3 · Cerrar una mesa vacía registraba una venta de $0
**Estado:** arreglado — 2026-09-05 · `pos/modulo-mesas.js`
Abrir una mesa, no ponerle nada y darle a "Cobrar y cerrar mesa": sale
"¡Cobrado! $0.00" y queda un pedido `completado` de $0 que **cuenta como
pedido** en el turno y en el ticket promedio.

Una mesa abierta por error es de lo más común en un turno. Debería **liberar la
mesa**, no registrar una venta.

### F-4 · En modo local, cancelar una venta no pedía confirmación
**Estado:** arreglado — 2026-09-05 · `pos/modulo-pedidos.js`
En el historial basta con cambiar el selector de estado: no hay diálogo, no hay
PIN, no hay deshacer explícito. Con cuenta sí lo pide (§19.19), y ahí la
diferencia es defendible —el PIN es para auditar a un empleado—, pero un roce
del ratón sobre un `<select>` cancelando una venta cobrada es demasiado barato.

**Propuesta:** una confirmación (`confirmarZenit`), sin PIN. Cuesta un clic y
solo en el estado destructivo.

### F-5 · "Total a cobrar" cambiaba de significado cuando hay propina
**Estado:** arreglado — 2026-09-05 · `pos/modulo-venta.js` + `pos/index.html`
En el modal de cobro, el rótulo **"Total a cobrar"** muestra la venta ($87.50)
y, en cuanto se captura una propina, pasa a mostrar la suma ($92.50). Los dos
números son correctos según el §30 —lo que el cliente entrega es
`total + propina`— pero el mismo rótulo nombra dos cosas distintas, y es el
número que el cajero le canta al cliente.

**Propuesta:** cuando hay propina, dos renglones ("Venta" y "TOTAL PAGADO"),
como ya hace el ticket impreso del §30.

### F-6 · Un teléfono repetido decía "Error al guardar el cliente"
**Estado:** arreglado — 2026-09-06 · `pos/modulo-clientes.js`
Clientes → Nuevo Cliente con un teléfono que ya existe. Se rechaza —bien, la
columna es UNIQUE y el directorio queda limpio— pero el aviso es genérico:
**"Error al guardar el cliente"**. El cajero no sabe que el cliente ya está dado
de alta ni qué hacer.

**Propuesta:** decir el motivo real ("Ya tienes un cliente con ese teléfono:
Doña Carmen") y, mejor todavía, ofrecer abrirlo. Es el mismo caso del §36: el
cajero teclea un teléfono conocido porque el cliente es de siempre.

### F-7 · Ofertas aceptaba un descuento del 150 %
**Estado:** arreglado — 2026-09-06 · `pos/modulo-ofertas.js`
Ofertas → Nuevo Descuento → tipo porcentaje, valor **150**. Se guarda sin
protestar.

Ya **no es peligroso**: desde el arreglo del E-1 el descuento se topa al ticket,
así que aplicarlo deja el total en $0 y no en negativo (comprobado). Pero es un
dato sin sentido que se queda en la lista de descuentos rápidos del cobro, y a la
primera vez que alguien lo toque va a pensar que la app se equivocó.

**Propuesta:** topar el porcentaje a 100 en el formulario. Aquí sí es un tope y
no un aviso: un descuento de más del 100 % no significa nada, a diferencia de una
merma mayor que el stock (F-1), que sí puede haber ocurrido de verdad.
