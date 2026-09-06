# Sesión de exploración (BLOQUE 17)

```bash
npm run explorar                     # abre la app y déjala corriendo en esa terminal
node explorar/z.js ver               # desde OTRA terminal: qué se ve ahora
node explorar/z.js ayuda             # todos los comandos
node explorar/z.js cerrar            # al terminar, SIEMPRE
```

Abre el Zenit de escritorio **de verdad** sobre un negocio ya montado y lo deja
disponible **comando a comando**, para que quien explore —una persona o un
agente— improvise.

## En qué se diferencia del banco (`npm run probar:ui`, §46)

| | `probar:ui` | `explorar` |
|---|---|---|
| Sabe qué va a hacer | **sí**, está escrito | **no**, se decide sobre la marcha |
| Para qué sirve | que lo arreglado no se rompa otra vez | encontrar lo que nadie pensó |
| Cuándo se corre | antes de cada `build-publish` | cuando se quiera revisar un área |
| Qué deja | verde o rojo | entradas en `HALLAZGOS.md` |

Son complementarios y el orden importa: **primero el banco, después esto**. Sin
el recorrido determinista debajo, una exploración se pasa el rato
redescubriendo lo mismo.

## La regla del bloque: DOS tipos de hallazgo, y no se mezclan

- **Errores** — algo se rompió, un total no cuadra, la consola escupe. Se
  arreglan.
- **Fricción** — funciona, pero cuesta más de lo que debería, o deja pasar algo
  que un negocio real lamentaría. Se **discuten** con el dueño del producto
  antes de tocar nada.

Mezclarlos en la misma lista hace que la lista no se lea. Van en secciones
separadas de `HALLAZGOS.md`, y **cada entrada trae cómo reproducirla**: un
reporte sin pasos es ruido.

⚠️ **Antes de anotar fricción, contrástala con lo ya decidido.** Este proyecto
tiene decisiones deliberadas que un ojo externo marca como "inseguras" sin
entender el porqué: el horario que **nunca** bloquea (§37), el puesto sin PIN
que autoriza confirmando (§19.19), la venta diferida que jamás se rechaza por
un dato sospechoso (§26). Proponer un candado ahí es ir contra la tesis del
producto (§1: cero fricción). Si dudas, léelo antes de escribirlo.

## Las reglas que se heredan del banco, y no se tocan

**1. Nunca la base del usuario.** Se reutilizan tal cual las guardas de
`pruebas-ui/lib/guardas.js`: perfil desechable, comprobado **empíricamente**
preguntándole al proceso de Electron dónde escribe, antes del primer clic. Una
tarde de exploración vende, cancela y cierra turnos; apuntada a la base real le
metería ventas falsas al negocio del dueño.

**2. Se hace clic; no se llaman las funciones por dentro.** Los cuatro
fantasmas del desktop (§28, §29, §36) eran funciones que **existían** y no
estaban cableadas a ningún botón. Llamarlas a mano las habría dado por buenas.
El comando `js` está para **mirar**, nunca para provocar.

**3. Lo único que se escribe por dentro es la SIEMBRA**, y solo al arrancar
(`lib/sembrar.js`): ponerse premium no tiene pantalla en modo local. Si quieres
probar el ALTA de un producto, hazla a clics — eso es exploración, no siembra.

## Qué negocio queda montado

`--sembrar=completo` (el de por defecto) deja una taquería con **impuesto del
16 % incluido y propinas encendidas**, 9 productos con precios de centavos
incómodos ($24.50), 5 insumos —uno **sin costo a propósito**, para que
Rentabilidad tenga que denunciarlo—, 3 recetas en gramos sobre insumos en
kilos, 2 productos **sin receta** (costo desconocido ≠ costo cero, §33), 6
mesas en tres zonas y 3 clientes.

Los otros niveles: `--sembrar=minimo` (solo premium y nombre) y
`--sembrar=ninguno` (instalación recién abierta, como la ve alguien que acaba
de instalar).

## Cómo se explora

Es una conversación: **mirar, tocar, volver a mirar**.

```bash
node explorar/z.js ir nueva-venta
node explorar/z.js clic "texto:Taco al pastor"
node explorar/z.js leer "#total-venta"
node explorar/z.js clic "boton:Cobrar"
node explorar/z.js sql "SELECT id,total,estado FROM pedidos ORDER BY id DESC LIMIT 3"
```

Cada comando devuelve **la pantalla resultante**, así que se ve el efecto sin
pedirlo. Y si la app escribió algo en consola durante ese comando, sale pegado
a la respuesta: preguntar por la consola no puede ser un paso que se olvide,
porque olvidarlo es exactamente como se pierden estas cosas (§46.3).

**Dónde vale la pena mirar**, por orden de lo que ha dado fruto:

1. **Lo que toca dinero al límite**: un descuento mayor que el ticket, un
   retiro mayor que el cajón, un pago dividido que no cuadra, una propina más
   grande que la venta, una cuenta dividida entre diez.
2. **Las parejas que tienen que ser simétricas**: descontar/devolver inventario,
   cobrar/cancelar, abrir/cerrar. El §19.28 lo dice: *si descuentas inventario,
   escribe también el camino de vuelta*. Compruébalo con `sql`, no de vista.
3. **Las fechas.** Esta base guarda hora LOCAL y media docena de sitios la han
   leído como UTC (§26). Un "hace 5 horas" recién abierto es un defecto.
4. **La SECUENCIA, no la pantalla.** El §44.3 solo aparecía si antes pasabas
   por Inventario. Recorre las vistas en orden, arrastrando el estado.
5. **Lo vacío y lo absurdo**: cobrar sin nada, cero comensales, cantidades de
   cinco cifras, texto donde va un número.

## Al terminar

1. Anota en `HALLAZGOS.md`, en su sección, con **pasos para reproducir**.
2. `node explorar/z.js cerrar` — borra el perfil temporal.
3. Lo que se arregle, **cúbrelo con dientes**: rompe a propósito el arreglo y
   mira que la comprobación falle. Una prueba que pasa con y sin el arreglo no
   prueba nada (§44.1, §46.5).
4. Si el defecto merece quedarse vigilado, súbelo al banco del §46 como
   recorrido o comprobación: eso es lo que impide que vuelva.
