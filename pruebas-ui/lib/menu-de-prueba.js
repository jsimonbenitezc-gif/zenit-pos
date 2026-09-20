// ============================================================================
// EL MENÚ QUE "LEE" EL BANCO (§46 · §57)
//
// Esta es la lectura que devuelve el LECTOR FALSO del backend
// (`MENU_LECTOR_FALSO`, utils/menuFoto/lector.js). Llamar a Gemini de verdad en
// cada corrida costaría dinero y daría una respuesta distinta cada vez, que es
// lo contrario de una prueba.
//
// ⚠️ Lo que se sustituye es SOLO la llamada al modelo. Todo lo demás es real: la
// ruta valida el base64 y sus límites, `armarPropuesta` corre en el servidor con
// las categorías del negocio, y `confirmar` crea los productos de verdad.
//
// Cada renglón está puesto para disparar UNA cosa de la pantalla de revisión:
// ============================================================================

const MENU_DE_PRUEBA = {
    negocio: { nombre: 'Café del Banco', telefono: null, direccion: null },
    productos: [
        // Los cinco normales. Hacen falta cinco precios para que la mediana
        // signifique algo (MINIMO_PARA_MEDIANA), y sin ellos el $2450 pasaría.
        { nombre: 'Café americano', precio: 32, confianza: 'alta', categoria: 'Bebidas calientes' },
        { nombre: 'Capuchino', precio: 45, confianza: 'alta', categoria: 'Bebidas calientes' },
        { nombre: 'Latte', precio: 48, confianza: 'alta', categoria: 'Bebidas calientes' },
        { nombre: 'Pan de plátano', precio: 38, confianza: 'alta', categoria: 'Panadería' },
        { nombre: 'Croissant', precio: 42, confianza: 'alta', categoria: 'Panadería' },

        // 🔴 EL PUNTO DECIMAL QUE SE COME EL OCR. Con los demás entre 32 y 48,
        // esto no es una tarta cara: es $24.50 mal leído. Tiene que salir
        // MARCADO y ARRIBA, y el dueño tiene que poder corregirlo a mano.
        { nombre: 'Tarta de queso', precio: 2450, confianza: 'alta', categoria: 'Panadería' },

        // Sin precio: nace DESMARCADO (no se puede crear un producto sin precio),
        // y escribirle uno tiene que marcarlo solo.
        { nombre: 'Jugo del día', precio: null, confianza: 'alta', categoria: 'Bebidas frías' },

        // Dos precios (chico/grande) y una nota: dos etiquetas distintas.
        { nombre: 'Chocolate caliente', precio: 55, precios_alternos: [70], confianza: 'alta', categoria: 'Bebidas calientes' },
        { nombre: 'Rebanada de pastel', precio: 60, nota: 'desde $60', confianza: 'media', categoria: 'Panadería' },

        // Ya está en el catálogo que el desktop subió al crear la cuenta:
        // tiene que venir desmarcado y NO duplicarse.
        { nombre: 'Coca Cola', precio: 28, confianza: 'alta', categoria: 'Bebidas frías' },

        // El mismo producto otra vez con otro precio, como cuando la segunda
        // página del menú repite los de la primera.
        { nombre: 'Capuchino', precio: 50, confianza: 'alta', categoria: 'Bebidas calientes' },
    ],
};

module.exports = { MENU_DE_PRUEBA };
