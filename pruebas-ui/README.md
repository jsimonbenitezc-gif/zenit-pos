# Banco de pruebas de la interfaz (BLOQUE 16)

```bash
npm run probar:ui                          # los cinco recorridos (~3 min)
npm run probar:ui -- --recorrido=caja      # solo uno, por etiqueta
npm run probar:ui -- --verboso             # vuelca la consola de la app en vivo
npm run probar:ui -- --conservar-perfil    # no borra las carpetas temporales
```

Abre el Zenit de escritorio **de verdad** —el mismo Electron de `npm start`, el
mismo `preload.js`, la misma SQLite— y lo usa **clic por clic** como lo usaría un
cajero: entra a las vistas, teclea importes, elige métodos de pago, confirma.

## Por qué existe

El desktop no tiene ni una sola prueba y no tiene paso de compilación, así que una
función que se llama y nunca se escribió no se nota hasta que alguien abre esa
vista. Ya pasó cuatro veces (`CLAUDE.md` §28, §29, §36). Desde entonces
`npm run revisar` cubre las funciones que faltan y el puente
`window.api` → `preload` → `ipcMain`.

Lo que ese script **no** puede ver es lo que solo aparece mirando la pantalla: un
cálculo que sale mal, un modal que no cierra, una vista que se apaga porque otra le
pisó las clases (§44.3), o un esquema de base que nace incompleto y solo se nota en
la **primera** instalación. Eso es lo que hace este banco.

En su primera corrida encontró cinco defectos reales, uno de ellos capaz de impedir
la primera venta de una instalación nueva (`CLAUDE.md` §46). El recorrido `dormido`,
añadido el mismo día, sacó otros tres: el arranque se bloqueaba medio minuto esperando
al servidor y la caja se quedaba sin poder cobrar (§47).

## Cómo está hecho

| Archivo | Qué hace |
|---|---|
| `correr.js` | Runner: elige recorridos, abre la app, revisa la consola, reporta y decide el código de salida |
| `lib/guardas.js` | **Que nunca toque la base del usuario.** Perfil desechable + comprobación empírica |
| `lib/app.js` | Lanza y cierra Electron; recoge todo lo que la app escribe en consola |
| `lib/cajero.js` | Las acciones de un cajero (vender, abrir turno, cobrar una mesa…) escritas una sola vez |
| `lib/libro.js` | **La contabilidad paralela**: lo que debería haber en el cajón, calculado sin preguntarle a la app |
| `lib/afirmar.js` | Afirmaciones de dinero al centavo y reporte legible |
| `lib/backend.js` | Reutiliza el banco del BLOQUE 15 (otro repo) para el recorrido conectado |
| `recorridos/*.js` | Un día de trabajo cada uno |

### Las tres reglas que lo hacen valer algo

**1. Nunca la base del usuario.** Cada recorrido abre la app con `--user-data-dir`
apuntando a una carpeta temporal recién creada, y antes de mandar un solo clic se
le **pregunta al proceso de Electron** dónde está escribiendo. Si no coincide, se
aborta. La app vende, cancela y cierra turnos: apuntada a la base real, una corrida
le metería ventas falsas al negocio del dueño.

**2. Se hace clic; no se llaman las funciones por dentro.** Se puede invocar
`ejecutarVenta()` desde `evaluate` y ahorrarse media docena de clics. No se hace: los
cuatro fantasmas del desktop eran funciones que **existían** y no estaban cableadas a
ningún botón. Llamarlas a mano las habría dado por buenas.

Hay dos excepciones, las dos de **lectura**: leer el texto ya pintado en la pantalla,
y abrir la SQLite del perfil desechable para comprobar lo que quedó guardado. Y una de
**siembra** (`activarPremiumDePrueba`, `crearCuenta`), porque en modo local no existe
ninguna pantalla para ponerse premium ni para apuntar a otro backend.

**3. El banco lleva su propio libro.** Si preguntara a la app cuánto efectivo espera
y luego tecleara ese mismo número al cerrar el turno, la diferencia daría cero
siempre — hasta con la fórmula completamente mal. Así que `lib/libro.js` **no importa
nada de `pos/` ni de `database/`**: suma peso a peso lo que el propio recorrido hizo y
cierra contando ESE número. Es la misma regla que sostiene el banco del backend
(`CLAUDE.md` §38.3). Si algún día alguien "reutiliza" ahí la fórmula del desktop,
destruye el bloque entero.

## Los recorridos

| Etiqueta | Qué recorre |
|---|---|
| `arranque` | Instalación nueva: el esquema completo, las 11 vistas, y la primera venta |
| `caja` | Un día entero: impuesto, propinas, pago dividido, gasto, retiro, depósito y un corte que da **$0** |
| `mesas` | Abrir mesa, servir, dividir la cuenta entre dos, cobrar, y una venta cancelada que no cuenta |
| `conectado` | Crear cuenta contra un backend real, vender y comprobar que la venta llegó al servidor |
| `dormido` | Un servidor que acepta y no contesta (Render despertando) y otro caído: que la espera se vea y la caja siga cobrando |

`conectado` necesita el repo **`zenit-pos-backend`** al lado (o la variable
`ZENIT_BACKEND` apuntándole): reutiliza su banco del BLOQUE 15 para levantar un
PostgreSQL desechable y arrancar `node server.js`. Si no está, el recorrido se
**salta con un aviso** en lugar de fallar — un banco que se pone rojo por algo que no
es un defecto deja de mirarse a la semana.

## La consola es parte de la prueba

Cualquier `error` o `warning` que la app escriba hace fallar el recorrido, y el
reporte dice **en qué paso** apareció. No hay lista de "ruido tolerado", a propósito:
hoy una instalación nueva recorre las 11 vistas con **cero** mensajes, así que
cualquiera es una novedad. Una lista de excepciones crece sola y acaba tapando el
error de verdad.

**La única excepción** es `dormido`, que desenchufa la red a propósito: mientras dura
esa parte declara `app.consola.redSeCayo(true)` y se le perdonan los mensajes con
**forma de fallo de red**. Un `ReferenceError` ahí dentro sigue tumbando el recorrido.

## Si un recorrido falla

1. El reporte dice qué comprobación falló y con cuánto de descuadre.
2. Se guarda una **foto de la pantalla** en `pruebas-ui/capturas/`.
3. `--conservar-perfil` deja la carpeta temporal con su `ventas.db` para abrirla.
4. `--verboso` vuelca la consola de la app y el arranque del backend.

## Al agregar un recorrido

- Exporta `{ nombre, etiqueta, ejecutar({ app, af, backend }) }` y déjalo en
  `recorridos/`; el runner los carga por orden de nombre de archivo.
- Termina en una afirmación sobre el **dinero** o sobre algo que el usuario ve, no en
  un "no reventó".
- Y **comprueba que tiene dientes**: rompe a propósito lo que dice proteger y mira que
  falle. Una prueba que pasa con y sin el arreglo no prueba nada.
