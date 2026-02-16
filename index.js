// ============================================
// SISTEMA DE ATENCIÓN AL CLIENTE CON IA
// Archivo principal del servidor
// ============================================

require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');

// Importar el motor de IA (Gemini)
const { GoogleGenerativeAI } = require('@google/generative-ai');

// Importar base de datos
const dbModule = require('./database/db');

// Inicializar Express
const app = express();
app.use(bodyParser.json());

// Inicializar Gemini
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

// ============================================
// FUNCIÓN: Normalizar número de teléfono (MX)
// ============================================
function normalizarNumero(numero) {
    // quitar +
    numero = numero.replace(/\+/g, '');

    // MX: quitar el "1" después del 52 (modo test)
    if (numero.startsWith('521')) {
        return '52' + numero.slice(3);
    }

    return numero;
}


// ============================================
// FUNCIÓN: Enviar mensaje por WhatsApp
// ============================================
async function enviarMensajeWhatsApp(destinatario, mensaje) {
    try {
        const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
        const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;

        const url = `https://graph.facebook.com/v18.0/${phoneNumberId}/messages`;

        const numeroNormalizado = normalizarNumero(destinatario);

        console.log(`📞 Enviando a: ${numeroNormalizado}`);

        const data = {
            messaging_product: 'whatsapp',
            to: numeroNormalizado, // 🚫 SIN "+"
            type: 'text',
            text: { body: mensaje }
        };

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(data)
        });

        const result = await response.json();

        if (!response.ok) {
            console.error('❌ Error al enviar mensaje:', result);
            return null;
        }

        console.log('✅ Mensaje enviado correctamente');
        return result;

    } catch (error) {
        console.error('❌ Error en enviarMensajeWhatsApp:', error);
        return null;
    }
}

// ============================================
// BASE DE DATOS TEMPORAL
// ============================================
const conversaciones = {};
const ventas = [];
const productos = [
    { id: 1, nombre: 'Producto Demo 1', precio: 100 },
    { id: 2, nombre: 'Producto Demo 2', precio: 200 },
];

// ============================================
// FUNCIÓN: Procesar mensaje con IA
// ============================================
async function procesarMensajeConIA(mensajeUsuario, userId) {
    try {
        if (!conversaciones[userId]) {
            conversaciones[userId] = [];
        }

        const prompt = `
Eres un asistente de ventas amigable y profesional.

Productos:
${productos.map(p => `- ${p.nombre}: $${p.precio}`).join('\n')}

Historial:
${conversaciones[userId].map(m => `${m.role}: ${m.content}`).join('\n')}

Cliente: ${mensajeUsuario}
`;

        const result = await model.generateContent(prompt);
        const respuesta = result.response.text();

        conversaciones[userId].push({ role: 'Cliente', content: mensajeUsuario });
        conversaciones[userId].push({ role: 'Asistente', content: respuesta });

        return respuesta;

    } catch (error) {
        console.error('❌ Error IA:', error);
        return 'Lo siento, ocurrió un error. Intenta de nuevo.';
    }
}

// ============================================
// WEBHOOK WHATSAPP
// ============================================

app.get('/webhook/whatsapp', (req, res) => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode === 'subscribe' && token === process.env.WHATSAPP_VERIFY_TOKEN) {
        console.log('✅ Webhook WhatsApp verificado');
        return res.status(200).send(challenge);
    }

    return res.sendStatus(403);
});

app.post('/webhook/whatsapp', async (req, res) => {
    try {
        const entry = req.body.entry?.[0];
        const change = entry?.changes?.[0];
        const value = change?.value;

        if (value?.messages) {
            const mensaje = value.messages[0];
            const fromRaw = mensaje.from;
            const userId = normalizarNumero(fromRaw);
            const texto = mensaje.text.body;

            console.log(`📱 WhatsApp - Mensaje de ${userId}: ${texto}`);

            const respuesta = await procesarMensajeConIA(texto, userId);
            await enviarMensajeWhatsApp(userId, respuesta);
        }

        res.sendStatus(200);

    } catch (error) {
        console.error('❌ Error webhook WhatsApp:', error);
        res.sendStatus(500);
    }
});

// ============================================
// PANEL ADMIN
// ============================================

app.get('/admin/conversaciones', (_, res) => res.json(conversaciones));
app.get('/admin/ventas', (_, res) => res.json(ventas));

// ============================================
// INICIAR SERVIDOR
// ============================================

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`
✅ Servidor iniciado
🌐 Puerto: ${PORT}
🤖 Gemini listo
📱 WhatsApp Cloud API conectado
`);
});
