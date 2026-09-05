// ============================================================================
// pruebas-ui/lib/backend.js — el backend DE VERDAD, para el recorrido conectado
//
// El BLOQUE 16 pide probar el desktop en sus DOS modos, porque "casi todos los
// bugs de sincronización viven en la frontera" (§13). El modo conectado necesita
// un backend, y el backend ya tiene el suyo desechable: el banco del BLOQUE 15
// (`zenit-pos-backend/pruebas-postgres/`), que levanta un PostgreSQL de usar y
// tirar y arranca `node server.js` contra él.
//
// Aquí NO se reimplementa nada de eso: se reutiliza tal cual. Lo único que se
// añade es encontrarlo, porque son DOS REPOS distintos: en esta máquina viven
// como carpetas hermanas, pero en un clon limpio del desktop el de al lado puede
// no estar. Cuando no está, el recorrido conectado se salta con un aviso claro en
// vez de fallar — un banco que se pone rojo por algo que no es un defecto deja de
// mirarse a la semana (§38).
//
// ⚠️ Las guardas contra producción son las del banco del backend y siguen en pie:
// el servidor se lanza con el cwd en una carpeta vacía (para que dotenv no
// encuentre el `.env` con las credenciales de la Supabase real) y con un entorno
// mínimo. No se relaja ninguna aquí.
// ============================================================================

const fs = require('fs');
const path = require('path');

const RAIZ_DESKTOP = path.join(__dirname, '..', '..');

/** Dónde puede estar el repo del backend, en orden de preferencia. */
function rutaDelBanco() {
    const candidatas = [
        process.env.ZENIT_BACKEND,                                        // por si vive en otro sitio
        path.join(RAIZ_DESKTOP, '..', 'zenit-pos-backend'),               // carpetas hermanas
        path.join(RAIZ_DESKTOP, '..', '..', 'zenit-pos-backend'),
    ].filter(Boolean);

    for (const c of candidatas) {
        if (fs.existsSync(path.join(c, 'pruebas-postgres', 'lib', 'servidor.js'))) return c;
    }
    return null;
}

function hayBackendDisponible() {
    return rutaDelBanco() !== null;
}

/**
 * Levanta Postgres + backend y devuelve su URL. Tarda entre 20 y 40 segundos:
 * casi todo es el arranque del PostgreSQL desechable.
 */
async function arrancarBackendDePruebas({ puertoApi = 3098, puertoDb = 55433, verboso = false } = {}) {
    const raiz = rutaDelBanco();
    if (!raiz) throw new Error('No encontré el repo zenit-pos-backend al lado de éste.');

    const { levantarPostgres } = require(path.join(raiz, 'pruebas-postgres', 'lib', 'postgres.js'));
    const { arrancarServidor } = require(path.join(raiz, 'pruebas-postgres', 'lib', 'servidor.js'));

    const pg = await levantarPostgres({ puerto: puertoDb, verboso });
    let servidor = null;
    try {
        servidor = await arrancarServidor({ db: pg.conf, puerto: puertoApi, verboso });
    } catch (err) {
        await pg.detener().catch(() => {});
        throw err;
    }

    const { ClienteApi } = require(path.join(raiz, 'pruebas-postgres', 'lib', 'http.js'));

    return {
        url: servidor.url,
        api: servidor.url + '/api',
        motor: pg.modo,

        /**
         * Un cliente HTTP autenticado como la cuenta que acaba de crear el
         * DESKTOP. Sirve para comprobar que la venta llegó de verdad al servidor
         * y no solo a la SQLite local: mirar únicamente la base local dejaría sin
         * probar la mitad interesante del modo conectado.
         */
        async comoNegocio(correo, contrasena) {
            const raizApi = new ClienteApi(servidor.url);
            // ⚠️ El campo se llama `username`, no `email` (routes/auth.js): el correo
            // del dueño se guarda ahí. Mandar `email` devuelve un 400 que dice
            // "Usuario y contraseña son requeridos" y despista.
            const sesion = await raizApi.exigir('POST', '/api/auth/login', { username: correo, password: contrasena });
            return raizApi.como(sesion.token);
        },
        async detener() {
            try { await servidor.detener(); servidor.limpiarCwd(); } catch { /* ya se fue */ }
            try { await pg.detener(); } catch { /* ya se fue */ }
        },
    };
}

module.exports = { hayBackendDisponible, arrancarBackendDePruebas, rutaDelBanco };
