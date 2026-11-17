// Card pictures for 사보타지, drawn as inline SVG in the spirit of the original cards: earthen tunnels through dark rock,
// a ladder on the start card, gold or stone behind the goals, and tools, maps and rockfalls on the action cards.
import { E, N, S, W, cards, rotate } from './saboteur.js';

const box = '0 0 60 90';
const svg = (body, label = '') => `<svg class="sab-art" viewBox="${box}" ${label ? `role="img" aria-label="${label}"` : 'aria-hidden="true"'}>${body}</svg>`;

// Dark rock with a few lighter seams, framed like a card.
const rock = (base = '#2a1c13', seam = '#3b2819', frame = '#120b07') => `<rect width="60" height="90" rx="5" fill="${base}"/>
  <path d="M0 14 L13 9 L21 16 L9 24 Z M47 3 L60 9 L60 22 L51 17 Z M3 66 L15 61 L19 73 L6 79 Z M44 70 L58 64 L60 82 L49 84 Z" fill="${seam}"/>
  <path d="M28 4 l5 2 -3 3 Z M6 40 l4 1 -2 3 Z M52 44 l4 -2 1 4 Z M30 84 l4 -2 1 3 Z" fill="#4a3322"/>
  <rect x="1" y="1" width="58" height="88" rx="4.5" fill="none" stroke="${frame}" stroke-width="2"/>`;

// Tunnel strips: a packed-earth floor with a lighter middle and timber frames at each card edge.
const earth = '#c58a4b';
const earthLight = '#e3b57a';
const strip = {
  [N]: ['M19 0 H41 V45 H19 Z', 'M25 0 H35 V45 H25 Z', 'M16 3 H44 V8 H16 Z M17 3 H21 V15 H17 Z M39 3 H43 V15 H39 Z'],
  [S]: ['M19 45 H41 V90 H19 Z', 'M25 45 H35 V90 H25 Z', 'M16 82 H44 V87 H16 Z M17 75 H21 V87 H17 Z M39 75 H43 V87 H39 Z'],
  [E]: ['M30 34 H60 V56 H30 Z', 'M30 40 H60 V50 H30 Z', 'M52 31 H57 V59 H52 Z M45 32 H57 V36 H45 Z M45 54 H57 V58 H45 Z'],
  [W]: ['M0 34 H30 V56 H0 Z', 'M0 40 H30 V50 H0 Z', 'M3 31 H8 V59 H3 Z M3 32 H15 V36 H3 Z M3 54 H15 V58 H3 Z'],
};
// A dead end stops each tunnel short of the middle.
const stub = {
  [N]: 'M19 0 H41 V24 Q30 32 19 24 Z', [S]: 'M19 90 H41 V66 Q30 58 19 66 Z',
  [E]: 'M60 34 V56 H46 Q38 45 46 34 Z', [W]: 'M0 34 V56 H14 Q22 45 14 34 Z',
};
const stubLight = {
  [N]: 'M25 0 H35 V24 H25 Z', [S]: 'M25 90 H35 V66 H25 Z', [E]: 'M60 40 V50 H46 V40 Z', [W]: 'M0 40 V50 H14 V40 Z',
};

function tunnels(open, dead) {
  const list = [N, E, S, W].filter(side => open & side);
  if (dead) {
    return list.map(side => `<path d="${stub[side]}" fill="${earth}"/><path d="${stubLight[side]}" fill="${earthLight}" opacity=".7"/>`).join('') +
      list.map(side => `<path d="${strip[side][2]}" fill="#6b4220"/>`).join('') +
      // Rubble where the tunnels would have met.
      `<path d="M21 38 L28 33 L36 35 L41 42 L38 53 L29 57 L21 52 L18 45 Z" fill="#6f6a62"/>
       <path d="M24 40 L30 37 L35 41 L32 47 L25 47 Z" fill="#9a958b"/><path d="M30 49 L37 47 L36 53 L31 54 Z" fill="#8a857c"/>
       <path d="M21 38 L41 52 M41 42 L22 53" stroke="#3b2516" stroke-width="1.6" stroke-linecap="round"/>`;
  }
  return list.map(side => `<path d="${strip[side][0]}" fill="${earth}"/>`).join('') +
    (list.length > 1 ? `<rect x="19" y="34" width="22" height="22" rx="3" fill="${earth}"/>` : '') +
    list.map(side => `<path d="${strip[side][1]}" fill="${earthLight}" opacity=".75"/>`).join('') +
    (list.length > 1 ? `<rect x="25" y="40" width="10" height="10" fill="${earthLight}" opacity=".75"/>` : '') +
    list.map(side => `<path d="${strip[side][2]}" fill="#6b4220"/>`).join('');
}

export const pathArt = (open, dead, label) => svg(rock() + tunnels(open, dead), label);

const ladder = `<path d="M24 24 V66 M36 24 V66" stroke="#7a4b22" stroke-width="3" stroke-linecap="round"/>
  <path d="M24 30 H36 M24 38 H36 M24 46 H36 M24 54 H36 M24 62 H36" stroke="#a8743d" stroke-width="2.4" stroke-linecap="round"/>`;
export const startArt = label => svg(rock('#2e2016') + tunnels(N | E | S | W, false) + ladder, label);

const nuggets = `<path d="M16 54 Q18 44 26 46 Q30 38 37 43 Q45 41 45 50 Q49 56 42 60 H19 Q13 59 16 54 Z" fill="#c8901a"/>
  <path d="M19 52 Q21 46 27 48 Q30 42 36 46 Q43 45 42 52 Q44 56 39 57 H22 Q17 56 19 52 Z" fill="#ffd23f"/>
  <circle cx="26" cy="50" r="2.4" fill="#fff3b0"/><circle cx="35" cy="48" r="2" fill="#fff3b0"/><circle cx="31" cy="54" r="1.6" fill="#fff3b0"/>`;
const sparkles = `<path d="M12 16 l1.6 4 4 1.6 -4 1.6 -1.6 4 -1.6 -4 -4 -1.6 4 -1.6 Z M48 18 l1.2 3 3 1.2 -3 1.2 -1.2 3 -1.2 -3 -3 -1.2 3 -1.2 Z M46 70 l1 2.4 2.4 1 -2.4 1 -1 2.4 -1 -2.4 -2.4 -1 2.4 -1 Z M13 70 l.8 2 2 .8 -2 .8 -.8 2 -.8 -2 -2 -.8 2 -.8 Z" fill="#fff6c2"/>`;
const stone = `<path d="M18 52 L23 41 L34 38 L43 45 L42 56 L31 60 L20 58 Z" fill="#6c6e72"/>
  <path d="M22 50 L25 43 L33 41 L38 46 L33 50 Z" fill="#9a9da2"/><path d="M33 52 L40 49 L39 55 L33 57 Z" fill="#55575b"/>`;
// The heap or lump is drawn large in the middle of the card.
const centered = shape => `<g transform="translate(30 45) scale(1.4) translate(-31 -49)">${shape}</g>`;
const plain = (base, frame) => `<rect width="60" height="90" rx="5" fill="${base}"/>
  <rect x="1" y="1" width="58" height="88" rx="4.5" fill="none" stroke="${frame}" stroke-width="2"/>`;

// A turned goal shows only what was found there, gold or stone, without tunnels.
export function goalArt(face, label = '') {
  if (face === 'gold') return svg(plain('#2e2016', '#c9a54a') + '<circle cx="30" cy="45" r="25" fill="#ffd23f" opacity=".14"/>' + centered(nuggets) + sparkles, label);
  return svg(plain('#2a1c13', '#120b07') + centered(stone), label);
}

// The goal cards' own back: a dark blue card with a golden question mark.
export const goalBack = (label = '') => svg(`<rect width="60" height="90" rx="5" fill="#1f2c4f"/>
  <rect x="4" y="4" width="52" height="82" rx="3" fill="none" stroke="#c9a54a" stroke-width="1.5" stroke-dasharray="3 2"/>
  <path d="M30 12 L44 26 L30 40 L16 26 Z" fill="#2f4378" stroke="#c9a54a" stroke-width="1.2"/>
  <text x="30" y="31" text-anchor="middle" font-size="15" font-weight="900" fill="#ffd23f" font-family="system-ui, sans-serif">?</text>
  <text x="30" y="62" text-anchor="middle" font-size="9" font-weight="800" fill="#e9dcae" font-family="system-ui, sans-serif">목적지</text>
  <path d="M18 72 H42" stroke="#c9a54a" stroke-width="1.2"/>`, label);

// Tools on the action cards.
const icons = {
  pick: `<path d="M20 64 L41 27" stroke="#8a5a2b" stroke-width="4.5" stroke-linecap="round"/>
    <path d="M18 32 Q31 16 50 26 Q34 21 23 36 Z" fill="#aab3bd" stroke="#59616b" stroke-width="1.4" stroke-linejoin="round"/>
    <circle cx="39" cy="30" r="2.6" fill="#59616b"/>`,
  lantern: `<path d="M24 25 Q30 15 36 25" fill="none" stroke="#444" stroke-width="2.4"/>
    <path d="M21 31 H39 L36 25 H24 Z" fill="#3a3a3a"/><circle cx="30" cy="44" r="15" fill="#ffd96b" opacity=".25"/>
    <rect x="22" y="31" width="16" height="23" rx="2" fill="#ffd96b" stroke="#3a3a3a" stroke-width="2"/>
    <path d="M30 37 Q34 43 30 48 Q26 43 30 37 Z" fill="#ff8a1f"/><rect x="20" y="54" width="20" height="5" rx="1.5" fill="#3a3a3a"/>`,
  cart: `<path d="M12 33 H48 L43 54 H17 Z" fill="#8a5a2b" stroke="#4e3015" stroke-width="2" stroke-linejoin="round"/>
    <path d="M15 40 H45 M16 47 H44" stroke="#4e3015" stroke-width="1.2"/>
    <path d="M17 33 Q20 26 26 29 Q30 23 35 28 Q41 25 43 33 Z" fill="#ffd23f" stroke="#b8860b" stroke-width="1"/>
    <circle cx="22" cy="58" r="5" fill="#333" stroke="#777" stroke-width="1.6"/><circle cx="38" cy="58" r="5" fill="#333" stroke="#777" stroke-width="1.6"/>
    <path d="M8 63 H52" stroke="#5c5c5c" stroke-width="2"/>`,
};
const crack = `<path d="M10 22 L22 34 L17 40 L32 50 L27 56 L46 70" fill="none" stroke="#fff" stroke-width="5" stroke-linejoin="round" stroke-linecap="round"/>
  <path d="M10 22 L22 34 L17 40 L32 50 L27 56 L46 70" fill="none" stroke="#d62828" stroke-width="2.6" stroke-linejoin="round" stroke-linecap="round"/>`;
const badge = (color, mark) => `<circle cx="48" cy="12" r="8" fill="${color}" stroke="#fff" stroke-width="1.5"/>${mark}`;
const crossMark = '<path d="M44.5 8.5 L51.5 15.5 M51.5 8.5 L44.5 15.5" stroke="#fff" stroke-width="2.4" stroke-linecap="round"/>';
const checkMark = '<path d="M44 12 L47 15 L52.5 9" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>';

const actionFrame = (outer, inner, title) => `<rect width="60" height="90" rx="5" fill="${outer}"/>
  <rect x="4" y="4" width="52" height="68" rx="3.5" fill="${inner}"/>
  <text x="30" y="83.5" text-anchor="middle" font-size="8.6" font-weight="800" fill="#fff" font-family="system-ui, sans-serif"${title.length > 7 ? ' textLength="50" lengthAdjust="spacingAndGlyphs"' : ''}>${title}</text>`;
const scaled = (icon, x, y, scale) => `<g transform="translate(${x} ${y}) scale(${scale})">${icon}</g>`;

const toolTitle = { pick: '곡괭이', lantern: '랜턴', cart: '수레' };

function actionArt(info, label) {
  if (info.type === 'break') {
    return svg(actionFrame('#8f1d21', '#f6e2c4', toolTitle[info.tools[0]] + ' 부수기') + icons[info.tools[0]] + crack + badge('#d62828', crossMark), label);
  }
  if (info.type === 'fix') {
    const [first, second] = info.tools;
    const art = second ? scaled(icons[first], 2, 2, .62) + scaled(icons[second], 21, 27, .62) +
      '<path d="M44 20 L16 64" stroke="#2f7d4a" stroke-width="1.6" stroke-dasharray="3 2"/>' : icons[first];
    return svg(actionFrame('#1f6b3c', '#e5f4dc', second ? '둘 중 하나 고치기' : toolTitle[first] + ' 고치기') + art + badge('#2f9e57', checkMark), label);
  }
  if (info.type === 'map') {
    return svg(actionFrame('#7a5520', '#ead7a8', '지도') + `<path d="M8 14 L22 10 L36 14 L52 10 V62 L36 66 L22 62 L8 66 Z" fill="#f4e6c0" stroke="#9c7a3c" stroke-width="1.2"/>
      <path d="M22 10 V62 M36 14 V66" stroke="#c9ad6e" stroke-width="1"/>
      <path d="M13 56 Q20 44 27 47 T38 32 T46 22" fill="none" stroke="#b5322b" stroke-width="1.8" stroke-dasharray="3 2.4"/>
      <path d="M42 18 L49 25 M49 18 L42 25" stroke="#b5322b" stroke-width="2.6" stroke-linecap="round"/>
      <circle cx="13" cy="56" r="2.2" fill="#3a2a14"/>
      <path d="M11 22 l2 -4 2 4 Z M17 30 l2 -4 2 4 Z M40 50 l2 -4 2 4 Z" fill="#7e9a5a"/>`, label);
  }
  return svg(actionFrame('#4b3a30', '#2a1c13', '낙석') + `<path d="M19 72 V42 Q30 34 41 42 V72 Z" fill="${earth}"/>
    <path d="M14 30 L22 22 L31 26 L28 36 L17 37 Z" fill="#7a7570"/><path d="M33 16 L43 13 L48 22 L41 29 L34 25 Z" fill="#8f8a84"/>
    <path d="M22 50 L32 44 L42 50 L44 62 L36 70 L23 69 L17 60 Z" fill="#6f6a62"/><path d="M25 52 L32 48 L38 53 L33 59 L26 58 Z" fill="#9a958b"/>
    <path d="M12 12 L16 18 M24 8 L26 15 M50 32 L46 36 M10 44 L15 45" stroke="#e8d3b0" stroke-width="1.6" stroke-linecap="round"/>
    <path d="M44 34 L49 30 L51 36 Z M9 52 L13 49 L14 55 Z" fill="#a39d94"/>`, label);
}

// Every card in the path and action deck, by its number in cards.
export function cardArt(card, rot = 0, label = '') {
  const info = cards[card];
  return info.type === 'path' ? pathArt(rotate(info.open, rot), info.dead, label) : actionArt(info, label);
}

// The back shared by path and action cards.
export const cardBack = (label = '') => svg(`<rect width="60" height="90" rx="5" fill="#3a2414"/>
  <rect x="4" y="4" width="52" height="82" rx="3" fill="#4a2f1a" stroke="#c9a54a" stroke-width="1.2"/>
  <path d="M18 36 L42 36 M30 24 V48" stroke="#c9a54a" stroke-width="1.2" opacity=".5"/>
  <circle cx="30" cy="36" r="10" fill="none" stroke="#c9a54a" stroke-width="1.4"/>
  ${scaled(icons.pick, 18, 24, .4)}
  <text x="30" y="66" text-anchor="middle" font-size="8.5" font-weight="900" fill="#ffd23f" font-family="system-ui, sans-serif">사보타지</text>`, label);

// The dwarves on the role cards: a gold digger in a lamp helmet, or a saboteur in a black hood.
export function roleArt(role, label = '') {
  const digger = role === 'digger';
  const face = `<ellipse cx="30" cy="40" rx="11" ry="12" fill="#f2c39b"/>
    <circle cx="26" cy="38" r="1.6" fill="#2b1d14"/><circle cx="34" cy="38" r="1.6" fill="#2b1d14"/>
    <path d="M27 42 Q30 44 33 42" fill="none" stroke="#8a4b2a" stroke-width="1.3"/><ellipse cx="30" cy="41" rx="2.6" ry="2" fill="#e49a74"/>`;
  if (digger) {
    return svg(`<rect width="60" height="90" rx="5" fill="#2f6db5"/><rect x="4" y="4" width="52" height="68" rx="3.5" fill="#bfe0ff"/>
      <path d="M8 72 Q10 56 30 54 Q50 56 52 72 Z" fill="#2f8f5b"/>
      ${face}
      <path d="M19 44 Q20 64 30 66 Q40 64 41 44 Q36 52 30 50 Q24 52 19 44 Z" fill="#c7a17a"/>
      <path d="M17 33 Q18 20 30 20 Q42 20 43 33 Z" fill="#f4c430" stroke="#b8860b" stroke-width="1.2"/>
      <rect x="15" y="31" width="30" height="4" rx="2" fill="#d9a400"/>
      <circle cx="30" cy="25" r="3.4" fill="#fff7c2" stroke="#b8860b" stroke-width="1"/>
      <path d="M42 66 L52 30" stroke="#8a5a2b" stroke-width="3" stroke-linecap="round"/>
      <path d="M44 34 Q51 25 58 31 Q51 29 47 37 Z" fill="#aab3bd"/>
      <text x="30" y="83.5" text-anchor="middle" font-size="9" font-weight="900" fill="#fff" font-family="system-ui, sans-serif">광부</text>`, label);
  }
  return svg(`<rect width="60" height="90" rx="5" fill="#5a1717"/><rect x="4" y="4" width="52" height="68" rx="3.5" fill="#2b2b33"/>
    <path d="M8 72 Q10 56 30 54 Q50 56 52 72 Z" fill="#141418"/>
    <path d="M14 46 Q14 16 30 14 Q46 16 46 46 Q42 34 30 33 Q18 34 14 46 Z" fill="#141418"/>
    ${face}
    <path d="M23 35 L29 37 M37 35 L31 37" stroke="#2b1d14" stroke-width="1.8" stroke-linecap="round"/>
    <circle cx="26" cy="38" r="1.7" fill="#e63946"/><circle cx="34" cy="38" r="1.7" fill="#e63946"/>
    <path d="M19 44 Q20 64 30 66 Q40 64 41 44 Q36 52 30 50 Q24 52 19 44 Z" fill="#6b3b1f"/>
    <path d="M27 43 Q30 41 33 43" fill="none" stroke="#5a1717" stroke-width="1.3"/>
    <rect x="40" y="48" width="6" height="16" rx="1.5" fill="#d62828" transform="rotate(-18 43 56)"/>
    <path d="M45 46 Q48 40 52 41" fill="none" stroke="#8a8a8a" stroke-width="1.2"/><circle cx="52.5" cy="40.5" r="1.8" fill="#ffb703"/>
    <text x="30" y="83.5" text-anchor="middle" font-size="9" font-weight="900" fill="#fff" font-family="system-ui, sans-serif">방해꾼</text>`, label);
}

// Gold nugget cards worth 1, 2 or 3.
export function goldArt(value, label = '') {
  const spots = { 1: [[30, 42, 1.25]], 2: [[22, 36, 1], [38, 50, 1]], 3: [[20, 30, .9], [40, 40, .9], [26, 56, .9]] }[value];
  const nugget = ([x, y, scale]) => `<g transform="translate(${x} ${y}) scale(${scale})">
    <path d="M-11 4 Q-10 -6 -3 -5 Q0 -11 7 -6 Q13 -4 11 4 Q9 9 0 9 Q-10 9 -11 4 Z" fill="#c8901a"/>
    <path d="M-8 2 Q-7 -4 -2 -3 Q1 -8 6 -4 Q10 -2 8 3 Q6 6 0 6 Q-7 6 -8 2 Z" fill="#ffd23f"/><circle cx="-2" cy="-1" r="1.8" fill="#fff3b0"/></g>`;
  return svg(`<rect width="60" height="90" rx="5" fill="#5a3a12"/><rect x="4" y="4" width="52" height="68" rx="3.5" fill="#2a1c0c"/>
    ${spots.map(nugget).join('')}
    <text x="30" y="84" text-anchor="middle" font-size="10" font-weight="900" fill="#ffd23f" font-family="system-ui, sans-serif">금 ${value}</text>`, label);
}

// Small tool marks for the player list: the tool with a red cross through it.
export const brokenTool = (tool, label = '') => `<svg class="sab-tool" viewBox="0 0 60 70" role="img" aria-label="${label}">
  <rect x="2" y="6" width="56" height="62" rx="12" fill="#f6e2c4"/>${scaled(icons[tool], 0, -6, 1)}
  <path d="M10 16 L50 60 M50 16 L10 60" stroke="#d62828" stroke-width="7" stroke-linecap="round"/></svg>`;
