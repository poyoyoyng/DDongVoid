// The six 니편내편 characters as 100×100 SVG, shared by the game canvas, the game tile and the guide.
const ink = '#2a2238';
const line = `stroke="${ink}" stroke-width="4" stroke-linejoin="round" stroke-linecap="round"`;
const eyes = (y, gap = 12, r = 4.5) => [50 - gap, 50 + gap].map(x =>
  `<circle cx="${x}" cy="${y}" r="${r}" fill="${ink}"/><circle cx="${x - 1.5}" cy="${y - 1.8}" r="1.6" fill="#fff"/>`).join('');
const blush = (y, gap, color) => [50 - gap, 50 + gap].map(x =>
  `<ellipse cx="${x}" cy="${y}" rx="6" ry="3.5" fill="${color}" opacity=".75"/>`).join('');
const wool = [[50, 50, 30], [26, 36, 14], [40, 22, 14], [60, 22, 14], [74, 36, 14], [79, 56, 14], [68, 75, 14], [50, 80, 14], [32, 75, 14], [21, 56, 14]]
  .map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}"/>`).join('');

export const critters = [
  {
    name: '문어', color: '#a77be0',
    art: `<path fill="#a77be0" ${line} d="M14 60C14 28 30 10 50 10S86 28 86 60V70Q80 80 73 72Q66 84 59 74Q50 86 41 74Q34 84 27 72Q20 80 14 70Z"/>
      <circle cx="33" cy="26" r="5" fill="#8a5cc7"/><circle cx="66" cy="22" r="4" fill="#8a5cc7"/><circle cx="74" cy="38" r="3" fill="#8a5cc7"/>
      ${eyes(46)}${blush(56, 23, '#ff8fb1')}<ellipse cx="50" cy="60" rx="5" ry="4" fill="${ink}"/>`,
  },
  {
    name: '까까머리', color: '#f7d3ae',
    art: `<path fill="#fff" ${line} d="M27 94C27 78 37 72 50 72S73 78 73 94Z"/>
      <circle cx="17" cy="50" r="8" fill="#f7d3ae" ${line}/><circle cx="83" cy="50" r="8" fill="#f7d3ae" ${line}/>
      <circle cx="50" cy="46" r="34" fill="#f7d3ae" ${line}/>
      <path fill="#8d96aa" opacity=".75" d="M19 38C21 20 35 14 50 14S79 20 81 38C68 29 32 29 19 38Z"/>
      ${eyes(49, 12, 4)}${blush(59, 21, '#f5a3a3')}<path fill="none" ${line} d="M44 62Q50 67 56 62"/>`,
  },
  {
    name: '양', color: '#ffffff',
    art: `<g fill="#fff" stroke="${ink}" stroke-width="8">${wool}</g><g fill="#fff">${wool}</g>
      <ellipse cx="31" cy="50" rx="9" ry="5" fill="#d9cfc7" ${line}/><ellipse cx="69" cy="50" rx="9" ry="5" fill="#d9cfc7" ${line}/>
      <ellipse cx="50" cy="55" rx="17" ry="16" fill="#ffe1cc" ${line}/>
      ${eyes(53, 7, 3.2)}<path fill="none" stroke="${ink}" stroke-width="3" stroke-linecap="round" d="M46 61Q50 64 54 61"/>`,
  },
  {
    name: '식빵', color: '#b4743e',
    art: `<rect x="12" y="12" width="76" height="76" rx="14" fill="#b4743e" ${line}/>
      <rect x="21" y="21" width="58" height="58" rx="9" fill="#e2ad6f"/>
      <path fill="none" ${line} d="M30 37L43 42M70 37L57 42"/>${eyes(51)}<path fill="none" ${line} d="M42 67H58"/>`,
  },
  {
    name: '분홍냥', color: '#ff9cc4',
    art: `<path fill="#ff9cc4" ${line} d="M17 42L21 10L45 25ZM83 42L79 10L55 25Z"/>
      <path fill="#ff6fa3" d="M24 30L26 18L36 25ZM76 30L74 18L64 25Z"/>
      <ellipse cx="50" cy="57" rx="36" ry="33" fill="#ff9cc4" ${line}/>
      ${eyes(53)}${blush(63, 23, '#ff6f9f')}<path fill="none" ${line} d="M43 63Q46.5 68 50 63Q53.5 68 57 63"/>`,
  },
  {
    name: '도깨비', color: '#ec4a3c',
    art: `<path fill="#ffe08a" ${line} d="M28 30L23 5L43 22ZM72 30L77 5L57 22Z"/>
      <path fill="#ec4a3c" ${line} d="M14 58C14 34 30 20 50 20S86 34 86 58C86 80 70 91 50 91S14 80 14 58Z"/>
      <path fill="none" ${line} d="M29 44L43 50M71 44L57 50"/>${eyes(57)}
      <path fill="none" ${line} d="M38 71Q50 81 62 71"/><path fill="#fff" stroke="${ink}" stroke-width="2" stroke-linejoin="round" d="M44 74L46.5 80.5L50 75.6Z"/>`,
  },
];

export const critterSvg = (kind, className = 'critter') =>
  `<svg class="${className}" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${critters[kind].name}">${critters[kind].art}</svg>`;
