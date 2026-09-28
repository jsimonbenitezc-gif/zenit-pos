#!/usr/bin/env node
/**
 * Trae los iconos de color del celular al desktop (PLAN_REDISENO_V1, Bloque 4).
 *
 *     node scripts/copiar-iconos.js
 *
 * El catálogo se GENERA en `zenit-pos-mobile` (scripts/iconos/, CLAUDE.md §66.2):
 * allá se editan los grupos, los nombres y los dibujos propios. Aquí NO se edita
 * nada a mano: se corre esto y se commitea lo que escribe.
 *
 *   pos/iconos/catalogo.js    el mismo catalogo.json, como variable global
 *                             (el renderer carga scripts clásicos, no JSON)
 *   pos/iconos/png/*.png      los mismos PNG, byte por byte
 *   pos/iconos/licencia.js    el aviso MIT de Microsoft, para mostrarlo en la app
 *   pos/iconos/LICENSE-fluentui-emoji.txt
 *
 * `npm run smoke:iconos` comprueba después que las dos copias son idénticas.
 */
const fs = require('fs');
const path = require('path');

const RAIZ = path.join(__dirname, '..');
const MOBILE = process.env.ZENIT_MOBILE || path.join(RAIZ, '..', 'zenit-pos-mobile');
const ORIGEN_CAT = path.join(MOBILE, 'src', 'iconos', 'catalogo.json');
const ORIGEN_PNG = path.join(MOBILE, 'assets', 'iconos', 'png');
const ORIGEN_LIC = path.join(MOBILE, 'assets', 'iconos', 'LICENSE-fluentui-emoji.txt');
const DESTINO = path.join(RAIZ, 'pos', 'iconos');

if (!fs.existsSync(ORIGEN_CAT)) {
    console.error('❌ No encontré ' + ORIGEN_CAT);
    console.error('   (clona zenit-pos-mobile como carpeta hermana, o apunta ZENIT_MOBILE a él)');
    process.exit(1);
}

const texto = fs.readFileSync(ORIGEN_CAT, 'utf8');
const catalogo = JSON.parse(texto);
const licencia = fs.readFileSync(ORIGEN_LIC, 'utf8');

fs.mkdirSync(path.join(DESTINO, 'png'), { recursive: true });

const CABECERA = '// GENERADO por scripts/copiar-iconos.js desde zenit-pos-mobile — no se edita a mano.\n';
fs.writeFileSync(path.join(DESTINO, 'catalogo.js'),
    CABECERA + 'const CATALOGO_ICONOS = ' + JSON.stringify(catalogo, null, 1) + ';\n');
fs.writeFileSync(path.join(DESTINO, 'licencia.js'),
    CABECERA + 'const LICENCIA_FLUENT = ' + JSON.stringify(licencia) + ';\n');
fs.copyFileSync(ORIGEN_LIC, path.join(DESTINO, 'LICENSE-fluentui-emoji.txt'));

// Los PNG: se copian los del catálogo y se BORRAN los que ya no están en él.
const quiero = new Set(catalogo.iconos.map(i => i.id + '.png'));
let copiados = 0, borrados = 0;
for (const f of quiero) {
    fs.copyFileSync(path.join(ORIGEN_PNG, f), path.join(DESTINO, 'png', f));
    copiados++;
}
for (const f of fs.readdirSync(path.join(DESTINO, 'png'))) {
    if (!quiero.has(f)) { fs.unlinkSync(path.join(DESTINO, 'png', f)); borrados++; }
}

console.log(`✅ ${catalogo.iconos.length} iconos en ${catalogo.grupos.length} grupos · ` +
    `${copiados} PNG copiados, ${borrados} sobrantes borrados`);
