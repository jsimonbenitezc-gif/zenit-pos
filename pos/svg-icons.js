/* ============================================================
 *  svg-icons.js — Libreria de iconos SVG para Zenit POS Desktop
 *  Convencion: viewBox 0 0 24 24, stroke-based, sin fill
 *  Fuente: Lucide Icons + Tabler Icons (MIT)
 * ============================================================ */

// Cada entrada es solo el contenido interno del <svg> (paths, circles, etc.)
// La funcion renderIcono() lo envuelve en el <svg> completo.
const SVG_ICONS = {
  // ── Comida ──────────────────────────────────────────────
  burger: '<path d="M3 11h18M3 11c0-4 3.5-7 9-7s9 3 9 7M3 11v1a1 1 0 001 1h16a1 1 0 001-1v-1"/><path d="M5 15h14a1 1 0 011 1v1a2 2 0 01-2 2H6a2 2 0 01-2-2v-1a1 1 0 011-1z"/><line x1="5" y1="15" x2="5" y2="13"/><line x1="19" y1="15" x2="19" y2="13"/>',
  pizza: '<path d="M15 11h.01"/><path d="M11 15h.01"/><path d="M16 16h.01"/><path d="m2 16 20-12-6.8 18.2a1 1 0 01-1.7.2L2 16z"/><path d="M5.71 17.11a17 17 0 0112.76-12.76"/>',
  fries: '<path d="M9 2v4"/><path d="M12 2v4"/><path d="M15 2v4"/><path d="M6 6h12l-1.5 16H7.5z"/><path d="M6 6l-1 4"/><path d="M18 6l1 4"/>',
  hotdog: '<path d="M5.63 19.37a2.5 2.5 0 010-3.54L17.3 4.2a2.5 2.5 0 013.54 3.54L9.17 19.37a2.5 2.5 0 01-3.54 0z"/><path d="M3.16 16.83a2.5 2.5 0 010-3.54L14.83 1.63a2.5 2.5 0 013.54 3.54L6.7 16.83a2.5 2.5 0 01-3.54 0z"/><path d="m7 11 4-4"/><path d="m11 15 4-4"/>',
  taco: '<path d="M4 18a2 2 0 002 2h12a2 2 0 002-2L12 4z"/><path d="M8 14h.01"/><path d="M12 14h.01"/><path d="M16 14h.01"/><path d="M10 10h.01"/><path d="M14 10h.01"/>',
  burrito: '<path d="M4 12a8 8 0 0116 0"/><path d="M4 12v2a8 8 0 0016 0v-2"/><path d="M4 12h16"/><line x1="8" y1="12" x2="9" y2="16"/><line x1="16" y1="12" x2="15" y2="16"/>',
  sandwich: '<path d="M3 11c0-5 4-7 9-7s9 2 9 7"/><rect x="3" y="11" width="18" height="3" rx="1"/><rect x="3" y="16" width="18" height="3" rx="1"/><path d="M6 14h2"/><path d="M10 14h4"/><path d="M16 14h2"/>',
  salad: '<path d="M7 21h10"/><path d="M12 21a9 9 0 005-8H7a9 9 0 005 8z"/><path d="M12 3v3"/><path d="M8 5l1.5 2.5"/><path d="M16 5l-1.5 2.5"/><circle cx="12" cy="10" r="1"/>',
  steak: '<path d="M14 3c-3 0-6 1.5-7.5 4S4 13 5 16s4 5 7 5 6-2 7-5 1-7 0-10-2-3-5-3z"/><path d="M10 12c1-2 3-3 5-2"/>',
  drumstick: '<path d="M15.5 2.5a5 5 0 010 7.07L9.43 15.64a1 1 0 01-1.41 0L2.36 9.98a1 1 0 010-1.41L8.43 2.5a5 5 0 017.07 0z"/><path d="M8 16l-4.5 4.5"/><path d="M10 8h.01"/>',
  bacon: '<path d="M5 3c0 3 1 5-1 8s1 5 1 8"/><path d="M9 3c0 3 1 5-1 8s1 5 1 8"/><path d="M13 3c0 3 1 5-1 8s1 5 1 8"/><path d="M17 3c0 3 1 5-1 8s1 5 1 8"/>',
  bread: '<path d="M5 8c0-3 2.5-5 7-5s7 2 7 5a3 3 0 01-1 2.2V19a2 2 0 01-2 2H8a2 2 0 01-2-2v-8.8A3 3 0 015 8z"/>',
  pancakes: '<ellipse cx="12" cy="8" rx="9" ry="3"/><path d="M3 8v2c0 1.66 4 3 9 3s9-1.34 9-3V8"/><path d="M3 12v2c0 1.66 4 3 9 3s9-1.34 9-3v-2"/>',
  waffle: '<rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/><line x1="9" y1="3" x2="9" y2="21"/><line x1="15" y1="3" x2="15" y2="21"/>',
  cheese: '<path d="M2 18l10-14 10 14z"/><circle cx="10" cy="15" r="1"/><circle cx="15" cy="16" r="1"/><circle cx="7" cy="17" r="0.5"/>',
  egg: '<path d="M12 22c-4.42 0-8-3.58-8-8 0-5.33 4-12 8-12s8 6.67 8 12c0 4.42-3.58 8-8 8z"/><circle cx="12" cy="14" r="3"/>',
  soup: '<path d="M3 11h18"/><path d="M5 11v1a7 7 0 0014 0v-1"/><path d="M12 19v2"/><path d="M8 21h8"/><path d="M7 7c0-2 1-3 2.5-3S12 5 12 7"/><path d="M12 7c0-2 1-3 2.5-3S17 5 17 7"/>',
  rice: '<path d="M6 20h12"/><path d="M7 15h10a1 1 0 011 1v3a1 1 0 01-1 1H7a1 1 0 01-1-1v-3a1 1 0 011-1z"/><path d="M12 4c-3 0-5 2-5 5v6h10V9c0-3-2-5-5-5z"/><path d="M10 8h.01"/><path d="M14 8h.01"/><path d="M12 11h.01"/>',

  // ── Bebidas ─────────────────────────────────────────────
  'cup-soda': '<path d="M6 4h12l-1.5 16H7.5z"/><path d="M4 4h16"/><path d="M12 4V2"/><path d="M9 10h6"/>',
  coffee: '<path d="M17 8h1a4 4 0 110 8h-1"/><path d="M3 8h14v9a4 4 0 01-4 4H7a4 4 0 01-4-4z"/><line x1="6" y1="2" x2="6" y2="4"/><line x1="10" y1="2" x2="10" y2="4"/><line x1="14" y1="2" x2="14" y2="4"/>',
  tea: '<path d="M17 8h1a4 4 0 010 8h-1"/><path d="M3 8h14v9a4 4 0 01-4 4H7a4 4 0 01-4-4z"/><path d="M10 2c-.5 1-1 2-1 3"/>',
  milk: '<path d="M8 2h8v4l2 2v10a2 2 0 01-2 2H8a2 2 0 01-2-2V8l2-2z"/><path d="M8 6h8"/><path d="M6 12h12"/>',
  beer: '<path d="M17 11h1a3 3 0 010 6h-1"/><path d="M5 11h12v8a2 2 0 01-2 2H7a2 2 0 01-2-2z"/><path d="M7 3v3"/><path d="M11 3v3"/><path d="M15 3v3"/><path d="M5 8h12"/>',
  wine: '<path d="M8 22h8"/><path d="M12 22v-7"/><path d="M6 2h12l-1 9a5 5 0 01-10 0z"/><path d="M6 7h12"/>',
  cocktail: '<path d="M4 4l8 8"/><path d="M20 4l-8 8"/><path d="M4 4h16"/><path d="M12 12v6"/><path d="M8 22h8"/><path d="M12 18h0"/>',
  champagne: '<path d="M8 22h8"/><path d="M12 22v-8"/><path d="M7 2h10l-1 9a4 4 0 01-8 0z"/><circle cx="12" cy="6" r="1"/>',
  'ice-cube': '<rect x="3" y="3" width="18" height="18" rx="3"/><path d="M8 3v18"/><path d="M16 3v18"/><path d="M3 8h18"/><path d="M3 16h18"/>',
  'bottle-water': '<path d="M10 2h4v3l2 2v13a2 2 0 01-2 2h-4a2 2 0 01-2-2V7l2-2z"/><path d="M10 5h4"/><path d="M8 11h8"/>',
  juice: '<path d="M9 2h6v3l1 1v14a2 2 0 01-2 2h-4a2 2 0 01-2-2V6l1-1z"/><path d="M9 5h6"/><path d="M9 10h6"/><circle cx="12" cy="15" r="2"/>',

  // ── Postres ─────────────────────────────────────────────
  donut: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/><path d="M5 8c1-1 3-1 4.5.5S12 11 14.5 10 19 8 19 8"/>',
  cookie: '<circle cx="12" cy="12" r="9"/><circle cx="8" cy="9" r="1"/><circle cx="14" cy="8" r="1"/><circle cx="10" cy="14" r="1"/><circle cx="15" cy="13" r="1"/><circle cx="12" cy="11" r="0.5"/>',
  cake: '<path d="M4 17h16v2a2 2 0 01-2 2H6a2 2 0 01-2-2z"/><path d="M4 13h16v4H4z"/><path d="M8 13V9"/><path d="M16 13V9"/><path d="M4 13c0-3 2.7-4 4-4h8c1.3 0 4 1 4 4"/><path d="M12 5v1"/><path d="M12 2a1 1 0 011 1v1a1 1 0 01-2 0V3a1 1 0 011-1z"/>',
  pie: '<path d="M12 3a9 9 0 100 18 9 9 0 000-18z"/><path d="M12 3v9h9"/>',
  cupcake: '<path d="M7 13h10l-1 8H8z"/><path d="M12 5a5 5 0 015 5v3H7v-3a5 5 0 015-5z"/><path d="M12 2v1"/><path d="M9 4l1 1"/><path d="M15 4l-1 1"/>',
  chocolate: '<rect x="4" y="4" width="16" height="16" rx="2"/><line x1="4" y1="10" x2="20" y2="10"/><line x1="4" y1="16" x2="20" y2="16"/><line x1="10" y1="4" x2="10" y2="20"/><line x1="16" y1="4" x2="16" y2="20"/>',
  candy: '<path d="M7.5 4.27L12 2l4.5 2.27"/><path d="M12 2v4"/><circle cx="12" cy="12" r="6"/><path d="M7.5 19.73L12 22l4.5-2.27"/><path d="M12 22v-4"/>',
  lollipop: '<circle cx="12" cy="8" r="6"/><path d="M12 14v8"/><path d="M6 8a6 6 0 016-6"/>',
  pudding: '<path d="M4 12h16"/><path d="M6 12v6a2 2 0 002 2h8a2 2 0 002-2v-6"/><path d="M6 12c0-4 3-6 6-6s6 2 6 6"/><circle cx="12" cy="5" r="1"/>',
  'ice-cream': '<path d="M12 17l-4 5h8z"/><circle cx="12" cy="11" r="6"/><path d="M8.5 7a4 4 0 017 0"/>',

  // ── Frutas y verduras ───────────────────────────────────
  apple: '<path d="M12 3c-1-1-3-1.5-4 0S5 6 5 9c0 5 3.5 10 7 12 3.5-2 7-7 7-12 0-3-1.5-5.5-3-6.5S13 2 12 3z"/><path d="M12 3c0-1 .5-2 2-2"/>',
  grape: '<circle cx="10" cy="7" r="2.5"/><circle cx="14" cy="7" r="2.5"/><circle cx="8" cy="12" r="2.5"/><circle cx="12" cy="12" r="2.5"/><circle cx="16" cy="12" r="2.5"/><circle cx="10" cy="17" r="2.5"/><circle cx="14" cy="17" r="2.5"/><path d="M12 2v3"/>',
  watermelon: '<path d="M4.5 19.5A14 14 0 0119.5 4.5L4.5 19.5z"/><path d="M8 16l1-4"/><path d="M12 16l1-4"/><path d="M16 12l-1.5 1.5"/>',
  orange: '<circle cx="12" cy="12" r="8"/><path d="M12 4v8l6 4"/><path d="M12 2c.5 0 1 .5 1 1"/>',
  lemon: '<path d="M12 3c4 0 8 3 8 8s-4 10-8 10S4 18 4 11s4-8 8-8z"/><path d="M12 7v5l3 3"/>',
  banana: '<path d="M4 19c0-8 4-14 12-16"/><path d="M4 19c8-1 14-5 16-12"/><path d="M16 3c1.5-.5 3 .5 3 2"/>',
  pineapple: '<path d="M9 6l-1-4"/><path d="M15 6l1-4"/><path d="M12 2v4"/><ellipse cx="12" cy="14" rx="6" ry="8"/><path d="M9 11l6 6"/><path d="M15 11l-6 6"/><path d="M9 14h6"/>',
  cherry: '<circle cx="9" cy="17" r="4"/><circle cx="17" cy="15" r="4"/><path d="M9 13C9 8 12 4 15 2"/><path d="M17 11c0-5-2-8-4-10"/>',
  strawberry: '<path d="M12 3l-6 8c0 4 2.7 8 6 10 3.3-2 6-6 6-10z"/><path d="M12 3c-1-1.5-3-2-4-1"/><path d="M9 10h.01"/><path d="M15 10h.01"/><path d="M11 14h.01"/><path d="M13 14h.01"/><path d="M12 18h.01"/>',
  carrot: '<path d="M9 21L2.5 14.5 12 5l7 7z"/><path d="M17 8l4-4"/><path d="M15 6l4-4"/><path d="M7 14l3-3"/><path d="M10 17l3-3"/>',
  corn: '<path d="M8 21h8l-1-7H9z"/><ellipse cx="12" cy="9" rx="4" ry="7"/><path d="M12 2v3"/><path d="M9 5l1 2"/><path d="M15 5l-1 2"/><path d="M10 9h4"/><path d="M10 12h4"/>',
  pepper: '<path d="M12 2c1 0 2 1 2 2v2c3 1 5 4 5 8 0 5-3 8-7 8s-7-3-7-8c0-4 2-7 5-8V4c0-1 1-2 2-2z"/><path d="M12 6v3"/>',
  potato: '<ellipse cx="12" cy="13" rx="8" ry="7"/><path d="M10 9h.01"/><path d="M14 10h.01"/><path d="M9 14h.01"/><path d="M15 15h.01"/>',
  broccoli: '<circle cx="8" cy="7" r="4"/><circle cx="14" cy="6" r="3"/><circle cx="16" cy="10" r="3"/><path d="M10 11v10"/><path d="M14 9v7"/>',
  lettuce: '<path d="M5 14c-1-4 1-8 4-10"/><path d="M19 14c1-4-1-8-4-10"/><path d="M9 4c2-1 4-1 6 0"/><path d="M4 18c0 2 3 3 8 3s8-1 8-3"/><path d="M4 18c-1-2 0-4 1-5"/><path d="M20 18c1-2 0-4-1-5"/><path d="M8 10c2 3 6 3 8 0"/>',
  cucumber: '<rect x="4" y="8" width="16" height="8" rx="4"/><path d="M8 10v4"/><path d="M12 10v4"/><path d="M16 10v4"/>',
  tomato: '<circle cx="12" cy="13" r="7"/><path d="M9 3c1 1 2 3 3 3s2-2 3-3"/><path d="M12 6v4"/>',

  // ── General / UI ────────────────────────────────────────
  package: '<path d="M11 21.73a2 2 0 002 0l7-4A2 2 0 0021 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73z"/><path d="M12 22V12"/><polyline points="3.29 7 12 12 20.71 7"/><path d="m7.5 4.27 9 5.15"/>',
  'shopping-cart': '<circle cx="8" cy="21" r="1"/><circle cx="19" cy="21" r="1"/><path d="M2.05 2.05h2l2.66 12.42a2 2 0 002 1.58h9.78a2 2 0 001.95-1.57l1.65-7.43H5.12"/>',
  'shopping-bag': '<path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 01-8 0"/>',
  tag: '<path d="M12.586 2.586A2 2 0 0011.172 2H4a2 2 0 00-2 2v7.172a2 2 0 00.586 1.414l8.704 8.704a2.426 2.426 0 003.42 0l6.58-6.58a2.426 2.426 0 000-3.42z"/><circle cx="7.5" cy="7.5" r=".5" fill="currentColor"/>',
  flame: '<path d="M8.5 14.5A2.5 2.5 0 0011 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 11-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 002.5 2.5z"/>',
  star: '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>',
  sparkles: '<path d="M9.937 15.5A2 2 0 008.5 14.063l-6.135-1.582a.5.5 0 010-.962L8.5 9.936A2 2 0 009.937 8.5l1.582-6.135a.5.5 0 01.962 0L14.063 8.5A2 2 0 0015.5 9.937l6.135 1.581a.5.5 0 010 .962L15.5 14.063a2 2 0 00-1.437 1.437l-1.582 6.135a.5.5 0 01-.962 0z"/><path d="M20 3v4"/><path d="M22 5h-4"/>',
  lightbulb: '<path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 006 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"/><path d="M9 18h6"/><path d="M10 22h4"/>',
  scissors: '<circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><line x1="20" y1="4" x2="8.12" y2="15.88"/><line x1="14.47" y1="14.48" x2="20" y2="20"/><line x1="8.12" y1="8.12" x2="12" y2="12"/>',
  pin: '<path d="M12 17v5"/><path d="M9 10.76a2 2 0 01-1.11-1.63l-.35-3a2 2 0 011.3-2.08l2.74-.92a2 2 0 011.3.08l2.63 1.06a2 2 0 011.1 2.09l-.46 2.93a2 2 0 01-1.13 1.57L12 12l-3 4"/>',
  utensils: '<path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 002-2V2"/><path d="M7 2v20"/><path d="M21 15V2a5 5 0 00-5 5v6c0 1.1.9 2 2 2h3zm0 0v7"/>',
  bowl: '<path d="M3 12h18"/><path d="M5 12v1a7 7 0 0014 0v-1"/><path d="M12 19v2"/><path d="M8 21h8"/>',

  // ── Iconos decorativos UI ───────────────────────────────
  'trending-up': '<polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/>',
  'trending-down': '<polyline points="22 17 13.5 8.5 8.5 13.5 2 7"/><polyline points="16 17 22 17 22 11"/>',
  minus: '<path d="M5 12h14"/>',
  'circle-check': '<circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/>',
  'triangle-alert': '<path d="m21.73 18-8-14a2 2 0 00-3.48 0l-8 14A2 2 0 004 21h16a2 2 0 001.73-3z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
  'bar-chart': '<line x1="12" y1="20" x2="12" y2="10"/><line x1="18" y1="20" x2="18" y2="4"/><line x1="6" y1="20" x2="6" y2="16"/>',
  users: '<path d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/>',
  smartphone: '<rect width="14" height="20" x="5" y="2" rx="2" ry="2"/><path d="M12 18h.01"/>',
  'map-pin': '<path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 01-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0116 0"/><circle cx="12" cy="10" r="3"/>',
  check: '<path d="M20 6L9 17l-5-5"/>',
  clock: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
  loader: '<path d="M12 2v4"/><path d="M12 18v4"/><path d="m4.93 4.93 2.83 2.83"/><path d="m16.24 16.24 2.83 2.83"/><path d="M2 12h4"/><path d="M18 12h4"/><path d="m4.93 19.07 2.83-2.83"/><path d="m16.24 7.76 2.83-2.83"/>',
  medal: '<path d="M7.21 15L2.66 7.14a2 2 0 01.13-2.2L4.4 2.8A2 2 0 016 2h12a2 2 0 011.6.8l1.6 2.14a2 2 0 01.14 2.2L16.79 15"/><path d="M11 12l1 1 1-1"/><circle cx="12" cy="17" r="5"/><path d="M12 13v1"/>',
  trophy: '<path d="M6 9H4.5a2.5 2.5 0 010-5H6"/><path d="M18 9h1.5a2.5 2.5 0 000-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 1012 0z"/>',
  'document-text': '<path d="M15 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V7z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/>',
  search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
  folder: '<path d="M20 20a2 2 0 002-2V8a2 2 0 00-2-2h-7.9a2 2 0 01-1.69-.9L9.6 3.9A2 2 0 007.93 3H4a2 2 0 00-2 2v13a2 2 0 002 2z"/>',
  user: '<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
  briefcase: '<path d="M16 20V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/><rect width="20" height="14" x="2" y="6" rx="2"/>',
  'key-round': '<path d="m15.5 7.5 2.3 2.3a1 1 0 0 0 1.4 0l2.1-2.1a1 1 0 0 0 0-1.4L19 4"/><path d="m21 2-9.6 9.6"/><circle cx="7.5" cy="15.5" r="5.5"/>',
};

// Nombres legibles para el picker
const SVG_ICON_LABELS = {
  burger: 'Hamburguesa', pizza: 'Pizza', fries: 'Papas fritas', hotdog: 'Hot dog',
  taco: 'Taco', burrito: 'Burrito', sandwich: 'Sandwich', salad: 'Ensalada',
  steak: 'Carne', drumstick: 'Pollo', bacon: 'Tocino', bread: 'Pan',
  pancakes: 'Pancakes', waffle: 'Waffle', cheese: 'Queso', egg: 'Huevo',
  soup: 'Sopa', rice: 'Arroz',
  'cup-soda': 'Refresco', coffee: 'Cafe', tea: 'Te', milk: 'Leche',
  beer: 'Cerveza', wine: 'Vino', cocktail: 'Coctel', champagne: 'Champagne',
  'ice-cube': 'Hielo', 'bottle-water': 'Agua', juice: 'Jugo',
  donut: 'Dona', cookie: 'Galleta', cake: 'Pastel', pie: 'Pay',
  cupcake: 'Cupcake', chocolate: 'Chocolate', candy: 'Dulce', lollipop: 'Paleta',
  pudding: 'Pudin', 'ice-cream': 'Helado',
  apple: 'Manzana', grape: 'Uvas', watermelon: 'Sandia', orange: 'Naranja',
  lemon: 'Limon', banana: 'Platano', pineapple: 'Pina', cherry: 'Cereza',
  strawberry: 'Fresa', carrot: 'Zanahoria', corn: 'Elote', pepper: 'Chile',
  potato: 'Papa', broccoli: 'Brocoli', lettuce: 'Lechuga', cucumber: 'Pepino',
  tomato: 'Tomate',
  package: 'Paquete', 'shopping-cart': 'Carrito', 'shopping-bag': 'Bolsa',
  tag: 'Etiqueta', flame: 'Fuego', star: 'Estrella', sparkles: 'Brillos',
  lightbulb: 'Foco', scissors: 'Tijeras', pin: 'Pin', utensils: 'Cubiertos',
  bowl: 'Tazon',
};

// Categorias para organizar el picker
const SVG_ICON_CATEGORIES = {
  'Comida':    ['burger','pizza','fries','hotdog','taco','burrito','sandwich','salad','steak','drumstick','bacon','bread','pancakes','waffle','cheese','egg','soup','rice'],
  'Bebidas':   ['cup-soda','coffee','tea','milk','beer','wine','cocktail','champagne','ice-cube','bottle-water','juice'],
  'Postres':   ['donut','cookie','cake','pie','cupcake','chocolate','candy','lollipop','pudding','ice-cream'],
  'Frutas':    ['apple','grape','watermelon','orange','lemon','banana','pineapple','cherry','strawberry'],
  'Verduras':  ['carrot','corn','pepper','potato','broccoli','lettuce','cucumber','tomato'],
  'General':   ['package','shopping-cart','shopping-bag','tag','flame','star','sparkles','lightbulb','scissors','pin','utensils','bowl'],
};

/**
 * Genera HTML de un icono SVG a partir de su nombre.
 * @param {string} name — clave en SVG_ICONS (sin prefijo svg:)
 * @param {number} size — px (default 24)
 * @param {string} color — CSS color (default 'currentColor')
 * @returns {string} HTML del <svg>
 */
function svgIconHTML(name, size = 24, color = 'currentColor') {
  const paths = SVG_ICONS[name];
  if (!paths) return '';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`;
}

/**
 * Renderiza un valor de icono (campo emoji de producto/categoria).
 * Detecta automaticamente si es SVG (prefijo svg:) o emoji unicode.
 * @param {string} valor — 'svg:burger' o '🍔' o null
 * @param {number} size — px para SVG, em se calcula para emoji
 * @param {string} color — solo aplica a SVG
 * @returns {string} HTML listo para insertar
 */
function renderIcono(valor, size = 24, color = 'currentColor') {
  if (!valor) return svgIconHTML('package', size, color);
  if (valor.startsWith('svg:')) {
    const name = valor.slice(4);
    return svgIconHTML(name, size, color) || svgIconHTML('package', size, color);
  }
  // Es un emoji unicode
  const emSize = (size / 16).toFixed(1);
  return `<span style="font-size:${emSize}em;line-height:1">${valor}</span>`;
}
