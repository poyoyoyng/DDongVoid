// Shared, deterministic rules. Only the host supplies randomness in online games.
export const AUGMENTS = [
  { id:'tower', icon:'♜', name:'사단 합체', tier:'prism', kind:'특수 승리', desc:'판 위에서 내 말 4개를 한 칸에 업으면 즉시 승리합니다.' },
  { id:'line', icon:'⁙', name:'일렬횡대', tier:'prism', kind:'특수 승리', desc:'판 위의 직선 경로에서 서로 다른 연속 4칸에 말을 하나씩 세우면 즉시 승리합니다.' },
  { id:'choice', icon:'⑫', name:'작지만 확실한', tier:'gold', kind:'운명 선택', desc:'윷을 던지는 대신 도 또는 개를 직접 고릅니다. 윷·모는 나오지 않습니다.' },
  { id:'flick', icon:'↗', name:'알까기의 달인', tier:'prism', kind:'미니게임', desc:'내 4·8·12…번째 턴에 알을 뒤로 당겨 발사! 당긴 길이로 파워를 조절합니다. 명중하면 상대 묶음을 잡고 그 자리로 옮겨 가며 턴이 끝나고, 빗나가면 내 묶음이 탈락해 대기로 돌아갑니다. 3초 안에 쏘지 않으면 턴이 끝납니다.' },
  { id:'reroll', icon:'⟳', name:'한 번 더 생각해', tier:'silver', kind:'행운', desc:'매 턴 한 번, 도·개·걸·빽도 결과 하나를 다시 던질 수 있습니다. 도·개 선택 증강과 함께라면 다시 고릅니다.' },
  { id:'shield', icon:'♧', name:'든든한 호신부', tier:'gold', kind:'방어', desc:'이번 판에 상대의 잡기 또는 알까기를 총 2회 막습니다. 잡으러 온 말은 이동 전 자리로 돌아갑니다.' },
  { id:'stride', icon:'⇉', name:'세 번째 큰 걸음', tier:'silver', kind:'기동', desc:'내 3·6·9…번째 턴의 첫 전진 이동 거리가 1칸 늘어납니다.' },
  { id:'hunter', icon:'⌖', name:'추격 본능', tier:'gold', kind:'공격', desc:'잡기에 성공할 때마다 다음 전진 이동 거리가 1칸 늘어납니다. 누적은 최대 2칸입니다.' },
  { id:'solo', icon:'♟', name:'나 홀로 산책', tier:'silver', kind:'기동', desc:'업지 않은 말 하나를 도로 움직이면 1칸 더 갑니다.' },
  { id:'comeback', icon:'⤴', name:'다시 출발', tier:'silver', kind:'재기', desc:'잡혔던 말은 대기에서 다시 출발할 때 딱 한 번 2칸 더 갑니다.' },
  { id:'forward', icon:'↑', name:'앞으로만', tier:'silver', kind:'안정', desc:'내 빽도 결과가 모두 도로 바뀝니다.' },
  { id:'finish', icon:'⚑', name:'완주의 기세', tier:'gold', kind:'연계', desc:'말을 완주시키면 추가 던지기 1회를 얻습니다. 한 턴에 한 번 발동합니다.' },
  { id:'dopamine', icon:'↟', name:'도파민장아찌', tier:'gold', kind:'선불 쾌감', desc:'선택한 턴부터 내 7턴 동안 전진 이동 +1칸, 이후 10턴 동안 −1칸입니다. 상대 잡기·내 말 완주 한 번마다 디버프가 1턴 줄어듭니다. 버프 중 성공도 미리 차감하며, 디버프 종료 후 정상 이동합니다. 빽도는 그대로입니다.' },
  { id:'aunt', icon:'✋', name:'어쩌라고아줌마', tier:'gold', kind:'잡힘 면역', desc:'잡히려는 순간 “어쩌라고” 하며 잡기·알까기를 총 3회 무시합니다. 업힌 묶음 전체를 보호하며, 한 번의 공격에 1회만 소모합니다.' },
  { id:'banchan', icon:'🍱', name:'반찬맨', tier:'gold', kind:'뜻밖의 한 상', desc:'평소에는 도·개·걸만 나옵니다. 가끔 모가 나오면 두 번 더 던집니다! 윷·빽도는 나오지 않습니다.' },
  { id:'stutter', icon:'〰', name:'성어말?', tier:'silver', kind:'말 더듬기', desc:'말을 더듬어서 전진 이동을 확정하면 +1칸 15%, −1칸 15%, 정상 이동 70%로 예정 목적지가 달라집니다. 실제 도착 칸에서 잡기·업기·완주를 판정합니다. 빽도는 그대로, 최소 이동은 0칸입니다.' },
  { id:'trap', icon:'⚠', name:'밤길 조심해', tier:'gold', kind:'함정', desc:'내 3·6·9…번째 턴에 한 번, 내 말이 서 있는 칸에 덫을 놓습니다. 상대 말이 덫 칸에 멈추면 대기로 돌아가고 덫은 사라집니다. 덫은 최대 2개까지, 더 놓으면 가장 오래된 덫이 사라집니다.' },
  { id:'shove', icon:'⇇', name:'비켜 비켜!', tier:'silver', kind:'밀치기', desc:'전진을 마친 내 말 바로 앞 칸에 상대 말이 있으면 그 묶음을 2칸 뒤로 밀어냅니다. 출발 직후의 말이나, 밀려날 칸에 다른 플레이어 말이 있으면 밀리지 않습니다.' },
  { id:'jinx', icon:'☁', name:'징크스', tier:'gold', kind:'저주', desc:'고르는 순간 상대 한 명을 지목합니다. 그 플레이어는 다음 3턴 동안 윷·모가 나오면 걸로 바뀝니다.' },
  { id:'copy', icon:'⧉', name:'따라쟁이', tier:'silver', kind:'모방', desc:'던지기 1회 대신 직전 플레이어가 마지막으로 던진 결과를 그대로 가져옵니다. 판당 3회, 윷·모를 따라 해도 추가 던지기는 없습니다.' },
  { id:'swap', icon:'⇄', name:'자리 바꿔줘', tier:'prism', kind:'역전', desc:'내 완주 수가 상대보다 적을 때 판당 한 번! 판 위의 내 말과 상대 말의 자리를 맞바꿉니다. 사용하면 남은 이동·추가 던지기를 포기하고 턴이 끝납니다.' },
  { id:'quake', icon:'≋', name:'지진났다', tier:'gold', kind:'혼돈', desc:'판당 한 번, 내 차례에 판 위의 모든 말(내 말 포함)을 1칸씩 뒤로 보냅니다. 밀려날 칸에 다른 플레이어 말이 있으면 그 말은 제자리에 남습니다.' },
  { id:'insurance', icon:'✚', name:'실손보험', tier:'silver', kind:'보험', desc:'내 말이 잡히면 대기 대신 3번 칸에서 다시 출발합니다. 판당 2회, 3번 칸에 다른 플레이어 말이 있으면 보험이 적용되지 않습니다.' },
  { id:'heavy', icon:'⛰', name:'무거운 짐', tier:'gold', kind:'업기 강화', desc:'2개 이상 업은 내 묶음은 일반 잡기로 잡히지 않습니다(알까기는 못 막음). 대신 업은 묶음은 2칸 이상 전진할 때 1칸 덜 갑니다.' },
  { id:'piggy', icon:'♞', name:'이리 오너라 업고 놀자', tier:'gold', kind:'집결', desc:'고르는 순간 대기 중인 내 말을 모두 업은 채 도 칸에 세웁니다. 도 칸의 상대 말은 잡습니다.' },
  { id:'garlic', icon:'❦', name:'웅녀', tier:'prism', kind:'특수 승리', desc:'고르는 순간 판의 무작위 칸 4곳에 내 마늘이 놓입니다. 내 말이 마늘 칸에 정확히 멈추면 줍고, 4개를 모두 모으면 즉시 승리합니다.' },
  { id:'alone', icon:'☝', name:'천상천하 유아독존', tier:'prism', kind:'특수 승리', desc:'판 위의 말뭉치가 내 말 2개 이상을 업은 묶음 하나뿐이면 즉시 승리합니다. 상대 말이 판 위에 하나라도 있으면 안 됩니다.' },
  { id:'kim', icon:'☂', name:'시작 변환: 김첨지', tier:'prism', kind:'특수 승리', desc:'고르는 순간 가장 앞선 내 말(없으면 대기 말)이 김첨지가 됩니다. 김첨지가 이번 턴을 포함해 내 6턴 안에 완주하면 즉시 승리합니다.' },
  { id:'party', icon:'✪', name:'말이오? 파티', tier:'gold', kind:'함정', desc:'고르는 순간 판의 무작위 칸에 함정 6개와 보상 4개를 깝니다. 함정 칸에 멈춘 상대 말은 대기로 돌아가고(나는 안전), 보상 칸에 멈춘 말은 누구든 한 번 더 던집니다. 한 번 밟으면 사라집니다.' },
  { id:'trade', icon:'⚖', name:'등가교환', tier:'gold', kind:'교환', desc:'고르는 순간 내 말 1개와 윷가락 1개를 없앱니다. 말 3개만 완주하면 이기지만, 윷가락 3개로 던져 윷은 나오지 않습니다(모 1/8 · 도 3/8 · 개 3/8 · 걸 1/8).' },
  { id:'bundle', icon:'✤', name:'짐덩이와 복덩이', tier:'gold', kind:'교환', desc:'고르는 순간 대기에 내 말 1개와 윷가락 1개를 더합니다. 말 5개를 모두 완주해야 하지만, 윷가락 5개로 던져 모가 자주 나옵니다(5개가 모두 같은 면이면 모).' },
  { id:'truck', icon:'⛟', name:'8톤 트럭', tier:'gold', kind:'돌진', desc:'판당 1회, 업은 내 묶음(2개 이상)을 골라 앞 칸에 말이 나올 때까지 직진시킵니다. 출발·도착 칸에서는 멈춥니다. 사용하면 턴이 끝납니다.' },
  { id:'combo', icon:'✸', name:'3단 합체 필살기!!!', tier:'prism', kind:'필살기', desc:'판당 1회, 3개 이상 업은 내 묶음을 골라 판 위의 다른 모든 말뭉치(내 다른 말 포함)를 대기로 보냅니다. 사용하면 턴이 끝납니다.' },
  { id:'dogs', icon:'✱', name:'개들을 풀어라', tier:'silver', kind:'보급', desc:'내 차례에 개 결과를 하나 얻습니다. 판당 3회, 던지기는 쓰지 않습니다.' },
  { id:'cat', icon:'ฅ', name:'고양이', tier:'silver', kind:'고양이', desc:'아무 능력이 없습니다. 냥.' },
  { id:'chosen', icon:'✧', name:'간택', tier:'silver', kind:'고양이', desc:'이 증강이 판에 있는 동안, 누구든 증강 선택지에 고양이가 나오면 고양이를 골라야 합니다.' },
  { id:'catlover', icon:'♥', name:'애묘인', tier:'prism', kind:'특수 승리', desc:'다른 플레이어 중 누구라도 고양이를 가지고 있으면 즉시 승리합니다.' },
  { id:'excess', icon:'⚅', name:'과유불급', tier:'gold', kind:'윷가락', desc:'윷가락 6개로 던집니다. 앞면 0개는 모, 5개는 윷, 6개는 꽝(아무것도 못 함)입니다.' },
  { id:'nme', icon:'☄', name:'나만 아니면 돼~', tier:'gold', kind:'재앙', desc:'고르는 순간 무작위 상대 한 명의 판 위 말을 모두 대기로 보냅니다.' },
  { id:'loan', icon:'₩', name:'대출', tier:'silver', kind:'선불', desc:'판당 2회, 던지기 기회를 하나 얻는 대신 다음 내 차례를 한 번 건너뜁니다.' },
  { id:'doberman', icon:'❋', name:'도베르만', tier:'gold', kind:'보급', desc:'판당 1회, 지금까지 내가 던져 낸 개의 수만큼 모를 얻습니다(최대 3개).' },
  { id:'sniper', icon:'⌖', name:'명사수', tier:'gold', kind:'저격', desc:'던지기 기회 하나를 써서 상대 말이 있는 칸을 조준합니다. 다음 내 차례가 시작되면 그 칸의 모든 말이 대기로 돌아갑니다.' },
  { id:'moordo', icon:'⇅', name:'모 아니면 도', tier:'gold', kind:'운명', desc:'던지면 모 아니면 도만 나옵니다(모 1/4 · 도 3/4).' },
  { id:'baduk', icon:'●', name:'바둑', tier:'gold', kind:'포위', desc:'판당 1회, 한 줄 위에 놓인 내 두 말뭉치 사이의 상대 말을 모두 대기로 보내고, 잡은 말 수만큼(최대 3) 던지기 기회를 얻습니다.' },
  { id:'vanguard', icon:'♜', name:'변환: 선봉장', tier:'gold', kind:'변환', desc:'고르는 순간 가장 앞선 내 말이 선봉장이 됩니다. 선봉장이 판 위에 있는 동안 내 모든 전진이 1칸 늘어납니다.' },
  { id:'reaper', icon:'☠', name:'사신', tier:'prism', kind:'소환', desc:'고르는 순간 중앙에 죽지 않는 사신을 부릅니다. 내 차례가 시작될 때마다 사신이 가장 가까운 상대 말 쪽으로 1칸 움직이고, 도착한 칸의 상대 말을 대기로 보냅니다.' },
  { id:'backcow', icon:'♉', name:'소 뒷걸음질', tier:'prism', kind:'특수 승리', desc:'빽도로 상대의 1번 말을 잡으면 즉시 승리합니다.' },
  { id:'hand', icon:'☜', name:'손은 눈보다 빠르다', tier:'gold', kind:'조작', desc:'판당 1회, 던지기 대신 원하는 결과(빽도~모)를 냅니다. 윷·모면 한 번 더 던집니다.' },
  { id:'sneak', icon:'↺', name:'슬쩍!', tier:'silver', kind:'조작', desc:'판당 2회, 아직 쓰지 않은 내 결과 하나의 윷가락 한 개를 뒤집어 한 단계 바꿉니다(예: 걸 → 개 또는 윷).' },
  { id:'timetravel', icon:'⌛', name:'시간 여행', tier:'silver', kind:'이동', desc:'판당 1회, 판 위 내 말뭉치를 지나온 길로 1~3칸 되돌립니다. 도착한 칸의 상대 말은 잡습니다.' },
  { id:'score', icon:'♫', name:'악보가 완성되었다!', tier:'prism', kind:'특수 승리', desc:'이번 판에서 내가 빽도·도·개·걸·윷·모를 모두 한 번 이상 던져 내면 즉시 승리합니다.' },
  { id:'assassin', icon:'†', name:'암살자의 영혼', tier:'gold', kind:'함정', desc:'판당 2회, 판 위 내 말뭉치에 영혼을 넣습니다. 그 말을 지나쳐 가는 상대 말뭉치는 대기로 돌아가고 영혼은 사라집니다.' },
  { id:'fisher', icon:'⚓', name:'어부지리', tier:'silver', kind:'보급', desc:'내 차례가 아닐 때 다른 사람들끼리 말을 잡으면 그 수를 세어, 2개마다 다음 내 차례 시작에 개를 얻습니다.' },
  { id:'loner', icon:'①', name:'외톨이', tier:'silver', kind:'조작', desc:'판당 3회, 던지기 대신 윷가락 하나만 엎어진 걸을 냅니다.' },
  { id:'throwhit', icon:'➶', name:'윷을 잘 던져봐', tier:'gold', kind:'방해', desc:'판당 1회, 상대 한 명을 윷으로 맞혀 그 플레이어의 차례를 두 번 건너뛰게 합니다.' },
  { id:'dual', icon:'⚔', name:'이도류', tier:'gold', kind:'던지기', desc:'한 번 던질 때 결과가 2개씩 나옵니다. 대신 모는 도로 바뀝니다.' },
  { id:'objection', icon:'‼', name:'이의있음!', tier:'silver', kind:'재선택', desc:'고르는 순간 취소되고, 이번 증강 선택을 새 선택지로 다시 합니다.' },
  { id:'jajinmori', icon:'♩', name:'자진모리 장단', tier:'silver', kind:'리듬', desc:'걸이 2번 나올 때마다 개를 하나 더 얻습니다.' },
  { id:'heaven', icon:'◍', name:'천상의 보호막', tier:'silver', kind:'방어', desc:'판당 1회, 판 위 내 말뭉치 하나에 보호막을 씌웁니다. 한 번 잡히거나 죽을 때 버팁니다.' },
  { id:'redbutton', icon:'⏺', name:'크고 빨간 버튼', tier:'gold', kind:'재앙', desc:'고르는 순간 두 대각선 지름길(중앙 포함)에 있는 모든 말을 대기로 보냅니다. 내 말도 예외 없습니다.' },
  { id:'friend', icon:'⚭', name:'프렌드 실드', tier:'silver', kind:'방어', desc:'업힌 내 묶음이 잡히면 1개만 대기로 가고, 나머지는 1칸 뒤로 물러나 살아남습니다.' },
  { id:'bonfire', icon:'♨', name:'화톳불', tier:'gold', kind:'부활', desc:'판당 1회, 판 위 내 말뭉치 자리에 화톳불을 놓습니다. 그 말들이 죽으면 화톳불 자리에서 부활하고 화톳불은 꺼집니다.' },
  { id:'sacrifice', icon:'✝', name:'희생', tier:'silver', kind:'방어', desc:'판당 1회, 판 위 내 말 하나를 대기로 보내고, 판 위 내 다른 모든 말에 한 번 버티는 보호막을 씌웁니다.' },
  { id:'poop', icon:'◉', name:'히히 똥!', tier:'silver', kind:'방해', desc:'고르는 순간 무작위 칸 3곳에 똥을 쌉니다. 상대 말이 이동하다 똥을 밟으면 그 칸에서 멈추고 똥은 치워집니다.' },
  { id:'lucky7', icon:'7', name:'777', tier:'prism', kind:'특수 승리', desc:'한 차례 안에 같은 결과를 3번 던져 내면 즉시 승리합니다.' },
  { id:'lonely', icon:'☹', name:'나만 친구 없어', tier:'prism', kind:'특수 승리', desc:'이 증강을 고른 뒤 다른 모든 플레이어에게 한 번씩 내 말이 잡히면 즉시 승리합니다.' },
  { id:'cult', icon:'⛧', name:'마신 소환', tier:'prism', kind:'특수 승리', desc:'내 차례가 시작될 때마다 판 위 내 말 수만큼 의식 코인을 얻습니다. 12개를 모으면 즉시 승리합니다.' },
  { id:'coup', icon:'⚒', name:'무신정변', tier:'prism', kind:'특수 승리', desc:'이 증강을 고른 뒤 상대 말을 4개 잡으면 즉시 승리합니다.' },
  { id:'treason', icon:'♛', name:'역모', tier:'silver', kind:'공격', desc:'나보다 완주를 많이 한 플레이어의 말을 잡으면 한 번 더 던집니다.' },
  { id:'wait', icon:'⏸', name:'잠깐!', tier:'gold', kind:'방해', desc:'고르는 순간 가장 앞선 상대 말뭉치를 그 주인의 다음 2턴 동안 묶어 둡니다.' },
  { id:'peace', icon:'☮', name:'평화 협정', tier:'gold', kind:'방어', desc:'나는 상대 말을 잡을 수 없고, 상대도 내 말을 잡거나 증강으로 죽일 수 없습니다. 서로의 말이 있는 칸으로는 이동할 수 없습니다.' },
  { id:'chalice', icon:'♆', name:'독이 든 성배', tier:'gold', kind:'도박', desc:'내 차례마다 한 번, 던지기 기회 3개를 얻을 수 있습니다. 대신 그 차례에 모가 나오면 판 위 내 말이 모두 대기로 가고 턴이 끝납니다.' },
  { id:'lastdance', icon:'♪', name:'라스트 댄스', tier:'gold', kind:'도박', desc:'판당 1회, 던지기 기회 2개를 얻고 이번 턴 전진 거리가 2배가 됩니다. 턴이 끝나면 판 위 내 말이 모두 대기로 돌아갑니다.' },
  { id:'echo', icon:'≈', name:'메아리의 형상', tier:'gold', kind:'시간', desc:'고른 차례부터 모든 플레이어가 차례를 두 번씩 연달아 합니다.' },
  { id:'marathon', icon:'⚐', name:'변환: 마라토너', tier:'prism', kind:'특수 승리', desc:'고르는 순간 대기 중인 내 말 하나가 마라토너가 됩니다. 마라토너가 완주하면 즉시 승리합니다.' },
  { id:'chance', icon:'❖', name:'역전 찬스', tier:'prism', kind:'보너스', desc:'고르는 순간 무작위 증강 4개를 더 얻습니다.' },
  { id:'domain', icon:'⬚', name:'영역 전개', tier:'prism', kind:'특수 승리', desc:'판당 1회, 판 위 내 말 하나를 그 자리에 묶어 둡니다. 그 말이 내 두 차례 뒤 시작까지 그 자리에서 살아남으면 즉시 승리합니다.' },
  { id:'cannibal', icon:'☗', name:'카니발리즘', tier:'silver', kind:'공격', desc:'내 말끼리 업지 못하는 대신, 내 말이 있는 칸에 멈추면 그 말을 대기로 보내고 한 번 더 던집니다.' },
  { id:'recruit', icon:'♙', name:'뒹학 사람좀 모아봐', tier:'gold', kind:'일회 집결', desc:'내 말이 정확히 2개 완주한 상태에서 판당 딱 한 번! 창고의 말 하나를 달리고 있는 내 말에 업습니다. 사용하면 남은 이동·추가 던지기를 포기하고 즉시 턴이 끝납니다.' },
];
export const MILESTONES = [3,7,11];
export const FLICK_SECONDS = 3;
// A shared draft waits this long; then everyone still choosing gets their first offer. Online the room adds a short grace for slow connections.
export const DRAFT_SECONDS = 40;
export const DRAFT_GRACE_MS = 2000;
export const NODES = {};
for(let i=0;i<20;i++) {
  let x,y;
  if(i<=5) {x=560;y=560-i*96;} else if(i<=10) {x=560-(i-5)*96;y=80;}
  else if(i<=15) {x=80;y=80+(i-10)*96;} else {x=80+(i-15)*96;y=560;}
  NODES['o'+i]={x,y};
}
Object.assign(NODES,{a1:{x:480,y:160},a2:{x:400,y:240},c:{x:320,y:320},a4:{x:240,y:400},a5:{x:160,y:480},b1:{x:160,y:160},b2:{x:240,y:240},b4:{x:400,y:400},b5:{x:480,y:480}});
export const LINES = [
  ['o0','o1','o2','o3','o4','o5'], ['o5','o6','o7','o8','o9','o10'],
  ['o10','o11','o12','o13','o14','o15'], ['o15','o16','o17','o18','o19','o0'],
  ['o5','a1','a2','c','a4','a5','o15'], ['o10','b1','b2','c','b4','b5','o0']
];
const ADJ={};for(const line of LINES)for(let i=0;i+1<line.length;i++){(ADJ[line[i]]??=new Set()).add(line[i+1]);(ADJ[line[i+1]]??=new Set()).add(line[i]);}
const DIAGONAL=['a1','a2','c','a4','a5','b1','b2','b4','b5'];
export const USES={dogs:3,loan:2,doberman:1,baduk:1,hand:1,sneak:2,timetravel:1,assassin:2,loner:3,throwhit:1,heaven:1,bonfire:1,sacrifice:1,truck:1,combo:1,lastdance:1,domain:1};
export const squareLabel=node=>node==='c'?'중앙':node==='o0'?'출발·도착 칸':node.startsWith('o')?`${node.slice(1)}번 칸`:'지름길 칸';
// Player cards sit 1 top-left, 2 top-right, 3 bottom-left, 4 bottom-right, so clockwise around the board is 1 → 2 → 4 → 3.
export const firstCall=name=>name==='나'?'내가':`${name}님`;
export const turnOrder=n=>n===4?[0,1,3,2]:Array.from({length:n},(_,i)=>i);
export function nextSeat(s,i) {const order=turnOrder(s.players.length);return order[(order.indexOf(i)+1)%order.length];}
function previousSeat(s,i) {const order=turnOrder(s.players.length);return order[(order.indexOf(i)+order.length-1)%order.length];}
export const position=t=>t.done?'finish':t.path.at(-1)??'home';
export const has=(s,p,id)=>s.players[p].augments.includes(id);
export const label=n=>({'-1':'빽도',0:'꽝',1:'도',2:'개',3:'걸',4:'윷',5:'모'})[n];
const player=name=>({name,turn:0,tokens:Array.from({length:4},(_,id)=>({id,path:[],done:false,returning:false})),augments:[],shields:0,immunity:0,dopamineStart:null,dopamineRelief:0,recruitUsed:false,boost:0,lastValue:null,trapTurn:0,jinxUntil:0,copies:0,swapUsed:false,quakeUsed:false,insurance:0,rerolled:false,draftRerolls:1,strideUsed:false,finishUsed:false});
export function dopamineTurnsLeft(p) {
  return p.augments.includes('dopamine')&&Number.isInteger(p.dopamineStart)?Math.max(0,7-(p.turn-p.dopamineStart)):0;
}
export function dopamineDebuffTurnsLeft(p) {
  if(!p.augments.includes('dopamine')||!Number.isInteger(p.dopamineStart))return 0;
  const elapsed=Math.max(0,p.turn-p.dopamineStart-7);
  return Math.max(0,10-elapsed-(p.dopamineRelief??0));
}
function relieveDopamine(s,owner,reason) {
  const p=s.players[owner],left=dopamineDebuffTurnsLeft(p);
  if(!left)return;
  p.dopamineRelief=(p.dopamineRelief??0)+1;
  note(s,`${p.name} · ${reason}! 도파민 디버프 1턴 감소 (${left-1}턴 남음)`);
}
export function createGame(names=['플레이어 1','플레이어 2'],backdo=true,rng=Math.random) {
  if(!Array.isArray(names)||names.length<2||names.length>4)throw Error('개인전은 2~4명으로 진행합니다.');
  const first=Math.floor(rng()*names.length),s={players:names.map(player),traps:[],first,active:first,phase:'roll',round:1,throws:1,pending:[],offers:[],log:[],winner:null,winReason:null,backdo,nextId:1,flick:null,lastRoll:null,revision:0};
  note(s,`${firstCall(s.players[first].name)} 선! 시계 방향으로 차례가 돌아갑니다.`);
  beginTurn(s,rng); return s;
}
function note(s,msg) {s.log.unshift(msg);s.log=s.log.slice(0,40);}
function sample(pool,n,rng) {const a=[...pool],out=[];while(out.length<n&&a.length)out.push(a.splice(Math.floor(rng()*a.length),1)[0]);return out;}
const exclusive=[['choice','banchan','moordo'],['choice','dual'],['trade','bundle','excess']];
function availableAugments(s) {
  const p=s.players[s.active];
  return AUGMENTS.filter(a=>!has(s,s.active,a.id)&&!exclusive.some(set=>set.includes(a.id)&&set.some(other=>other!==a.id&&has(s,s.active,other)))
    &&!(a.id==='score'&&!s.backdo)&&!(a.id==='marathon'&&!p.tokens.some(t=>position(t)==='home')));
}
// 간택: whoever is offered the cat while 간택 is in play has to take it.
function forceCat(s) {s.offers=forcedCat(s,s.offers);}
const forcedCat=(s,offers)=>offers.includes('cat')&&s.players.some(p=>p.augments.includes('chosen'))?['cat']:offers;
// Runs fn as if seat i were the active player, so augment code written for "my turn" works during the shared draft.
function as(s,i,fn) {const previous=s.active;s.active=i;try{return fn();}finally{s.active=previous;}}
const draftsOf=p=>p.drafts??p.augments.length;
function draftOffers(s,i,rng,exclude=[]) {return as(s,i,()=>forcedCat(s,sample(availableAugments(s).map(a=>a.id).filter(id=>!exclude.includes(id)),3,rng)));}
function startDraft(s,round,rng) {
  s.draft=s.players.map((p,i)=>draftsOf(p)<round?{offers:draftOffers(s,i,rng),rerolls:1,done:false,stage:null}:null);
  s.phase='draft';note(s,`${round}번째 증강 선택! 모두 동시에 고릅니다.`);
}
// Picks, rerolls and jinx targets during the shared draft; each player acts for their own seat.
function draftAct(s,action,rng) {
  if(action.type==='draftTimeout') {
    // Time is up: whoever is still choosing gets their first offer (skipping 이의있음!, which would only redraw), and a pending jinx lands on the leader.
    s.draft.forEach((entry,i)=>{
      if(!entry||entry.done||s.winner!==null)return;
      const p=s.players[i];
      as(s,i,()=>{
        if(!entry.stage) {
          const id=entry.offers.find(x=>x!=='objection')??entry.offers[0];
          p.drafts=draftsOf(p)+1;gainAugment(s,id,rng);note(s,`${p.name} · 시간 초과! ${AUGMENTS.find(a=>a.id===id).name} 자동 선택`);
          if(id==='jinx')entry.stage='jinx';
        }
        if(entry.stage==='jinx'){applyJinx(s,s.players.length>2?jinxTarget(s):1-i);entry.stage=null;}
        entry.done=true;
      });
      checkAll(s);
    });
    if(s.winner===null){s.draft=null;note(s,'시간이 다 되어 남은 증강을 자동으로 골랐습니다. 게임을 이어갑니다.');afterDraft(s);}
    s.revision++;return s;
  }
  const i=Number.isInteger(action.player)?action.player:s.active,entry=s.draft?.[i],p=s.players[i];
  if(!entry)throw Error('이번 증강 선택에 참여하지 않습니다.');
  if(entry.done)throw Error('이미 증강을 골랐습니다. 다른 플레이어를 기다려 주세요.');
  as(s,i,()=>{
    if(action.type==='draftReroll') {
      if(entry.stage||entry.rerolls<=0)throw Error('증강 재선택을 사용할 수 없습니다.');
      entry.rerolls--;entry.offers=draftOffers(s,i,rng,entry.offers);
    }else if(action.type==='jinx') {
      if(entry.stage!=='jinx'||!Number.isInteger(action.target)||action.target===i||!s.players[action.target])throw Error('징크스를 걸 상대를 고르세요.');
      applyJinx(s,action.target);entry.stage=null;entry.done=true;
    }else if(action.type==='augment') {
      if(entry.stage||!entry.offers.includes(action.id))throw Error('선택할 수 없는 증강입니다.');
      if(action.id==='objection'){note(s,`${p.name} · 이의있음! 증강을 다시 고릅니다.`);entry.offers=draftOffers(s,i,rng);entry.rerolls=1;return;}
      p.drafts=draftsOf(p)+1;gainAugment(s,action.id,rng);note(s,`${p.name}의 증강: ${AUGMENTS.find(a=>a.id===action.id).name}`);
      if(action.id==='jinx'&&s.players.length>2)entry.stage='jinx';
      else {if(action.id==='jinx')applyJinx(s,1-i);entry.done=true;}
    }else throw Error('모두 증강을 고르는 중입니다. 고른 뒤 이어서 진행합니다.');
  });
  checkAll(s);
  if(s.winner===null&&s.draft.every(x=>!x||x.done)){s.draft=null;note(s,'모두 증강을 골랐습니다. 게임을 이어갑니다.');afterDraft(s);}
  s.revision++;return s;
}
// Every draft comes with its own reroll; an unused one does not carry over.
function draft(s,rng) {s.players[s.active].draftRerolls=1;s.offers=sample(availableAugments(s).map(a=>a.id),3,rng);forceCat(s);s.phase='augment';}
function beginTurn(s,rng) {
  for(let guard=0;(s.players[s.active].skip??0)>0&&guard<12;guard++){const q=s.players[s.active];q.skip--;note(s,`${q.name} · 차례를 건너뜁니다.`);s.active=nextSeat(s,s.active);s.round++;}
  const p=s.players[s.active];p.turn++;p.rerolled=false;p.strideUsed=false;p.finishUsed=false;p.turnValues=[];s.throws=1;s.pending=[];s.flick=null;
  note(s,`${p.name} · ${p.turn}번째 턴`);
  startOfTurn(s);
  // Another player's move can leave the board to me alone.
  checkAll(s);if(s.winner!==null)return;
  // The first player's 3·7·11th turn opens a draft for everyone who has not had that one yet.
  // Drafts are counted apart from augments, since 역전 찬스 hands out extra ones.
  const round=MILESTONES.indexOf(p.turn)+1;
  if(round&&s.active===(s.first??s.active)&&s.players.some(q=>draftsOf(q)<round))startDraft(s,round,rng); else afterDraft(s);
}
function startOfTurn(s) {
  const i=s.active,p=s.players[i];
  for(const shot of (s.snipes??[]).filter(x=>x.owner===i)) {
    s.snipes.splice(s.snipes.indexOf(shot),1);let hit=0;
    s.players.forEach((q,j)=>{const tokens=q.tokens.filter(t=>position(t)===shot.node);if(tokens.length)hit+=bury(s,i,j,tokens);});
    note(s,`${p.name}의 명사수! ${squareLabel(shot.node)}: ${hit?`${hit}개 명중`:'빗나감'}`);
  }
  if(s.reaper?.owner===i)moveReaper(s);
  if(has(s,i,'cult')){const gain=p.tokens.filter(onBoard).length;p.coins=(p.coins??0)+gain;if(gain)note(s,`${p.name} · 의식 코인 +${gain} (${p.coins}/12)`);}
  if(p.fishBonus>0){for(let k=0;k<p.fishBonus;k++)s.pending.push({id:s.nextId++,value:2});note(s,`${p.name} · 어부지리! 개 ${p.fishBonus}개`);p.fishBonus=0;}
  if(p.domain&&p.turn>=p.domain.until){const t=p.tokens.find(x=>x.id===p.domain.token);if(t&&position(t)===p.domain.node)p.winBy='영역 전개 · 두 차례 생존';else p.domain=null;}
}
function moveReaper(s) {
  const owner=s.reaper.owner,start=s.reaper.node,targets=new Set(s.players.flatMap((q,j)=>j===owner?[]:q.tokens.map(position)).filter(node=>NODES[node]));
  if(!targets.size)return;
  let step=null;
  if(!targets.has(start)) {
    // Breadth-first search remembers the first step of the shortest way to the nearest piece.
    const first=new Map([[start,null]]),queue=[start];
    while(queue.length&&step===null){const node=queue.shift();for(const next of ADJ[node]){if(first.has(next))continue;first.set(next,node===start?next:first.get(node));if(targets.has(next)){step=first.get(next);break;}queue.push(next);}}
    if(!step)return;
    s.reaper.node=step;
  }
  const at=s.reaper.node;let hit=0;
  s.players.forEach((q,j)=>{if(j===owner)return;const tokens=q.tokens.filter(t=>position(t)===at);if(tokens.length)hit+=bury(s,owner,j,tokens);});
  note(s,`${s.players[owner].name}의 사신이 ${squareLabel(at)}(으)로 움직였습니다.${hit?` 말 ${hit}개가 쓰러졌습니다.`:''}`);
}
function afterDraft(s) {
  const p=s.active;
  s.phase=has(s,p,'flick')&&s.players[p].turn%4===0&&s.players[p].tokens.some(t=>NODES[position(t)])&&s.players.some((other,i)=>i!==p&&other.tokens.some(t=>NODES[position(t)]))?'flick':'roll';
}
function win(s,p,reason) {s.winner=p;s.winReason=reason;s.phase='won';note(s,`${s.players[p].name} 승리! ${reason}`);}
export function checkWin(s,p) {
  const tokens=s.players[p].tokens;
  if(tokens.every(t=>t.done)) return win(s,p,`말 ${tokens.length}개 모두 완주`);
  const player=s.players[p];
  if(player.winBy)return win(s,p,player.winBy);
  if(has(s,p,'catlover')&&s.players.some((q,i)=>i!==p&&q.augments.includes('cat')))return win(s,p,'애묘인 · 고양이를 고른 친구 발견');
  if(has(s,p,'score')&&[-1,1,2,3,4,5].every(v=>player.thrown?.includes(v)))return win(s,p,'악보 완성 · 빽도부터 모까지');
  if(has(s,p,'lonely')&&s.players.every((q,i)=>i===p||player.caughtBy?.includes(i)))return win(s,p,'나만 친구 없어 · 모두에게 잡힘');
  if(has(s,p,'cult')&&(player.coins??0)>=12)return win(s,p,'마신 소환 · 의식 코인 12개');
  if(has(s,p,'coup')&&(player.coupKills??0)>=4)return win(s,p,'무신정변 · 상대 말 4개 처치');
  if(has(s,p,'garlic')&&player.garlic?.length===0)return win(s,p,'웅녀 · 마늘 4개 모으기');
  if(has(s,p,'kim')&&player.kimDoneTurn&&player.kimDoneTurn<=player.kimUntil)return win(s,p,'김첨지 · 6턴 안에 완주');
  const board=s.players.flatMap((x,i)=>x.tokens.filter(t=>NODES[position(t)]).map(t=>({i,node:position(t)})));
  if(has(s,p,'alone')&&board.length>1&&board.every(x=>x.i===p&&x.node===board[0].node))return win(s,p,'천상천하 유아독존');
  const pos=tokens.map(position);
  if(has(s,p,'tower')&&NODES[pos[0]]&&pos.every(x=>x===pos[0]))return win(s,p,`사단 합체 · 말 ${tokens.length}개 업기`);
  if(has(s,p,'line')&&new Set(pos).size===4&&pos.every(x=>NODES[x])&&LINES.some(l=>l.some((_,i)=>i+4<=l.length&&l.slice(i,i+4).every(x=>pos.includes(x)))))return win(s,p,'일렬횡대 · 연속 4칸');
}
function rolledValue(s,rng) {
  if(has(s,s.active,'moordo'))return rng()<.25?(jinxed(s.players[s.active])?3:5):1;
  if(has(s,s.active,'banchan')) {
    const draw=rng(),moChance=.33/16;
    if(draw<moChance)return jinxed(s.players[s.active])?3:5;
    const ordinary=(draw-moChance)/(1-moChance);
    return ordinary<4/14?1:ordinary<10/14?2:3;
  }
  const sticks=s.players[s.active].sticks??4,bits=Math.floor(rng()*2**sticks),count=bits.toString(2).replaceAll('0','').length;
  let value=sticks===6?(count===0?5:count===6?0:Math.min(count,4)):count===0||count===5?5:count;
  if(s.backdo&&bits===1)value=-1;
  if(value===-1&&has(s,s.active,'forward'))value=1;
  return jinxed(s.players[s.active])&&value>=4?3:value;
}
const jinxed=p=>(p.jinxUntil??0)>=p.turn&&p.turn>0;
function extraThrows(s,value) {return value===5&&has(s,s.active,'banchan')?2:value>=4?1:0;}
const NEXT={a1:'a2',a2:'c',a4:'a5',a5:'o15',b1:'b2',b2:'c',b4:'b5',b5:'o0'};
const BACK={a1:'o5',a2:'a1',c:'a2',a4:'c',a5:'a4',b1:'o10',b2:'b1',b4:'c',b5:'b4'};
export function walk(token,steps,route='outer') {
  const t=structuredClone(token);
  if(steps<0) {
    const from=t.path.pop();
    // Backing off the first square stops on the start square, which is also the finish; a piece on the board never returns to reserve.
    if(from&&!t.path.length)t.path.push(BACK[from]??'o'+((Number(from.slice(1))+19)%20));
    return t;
  }
  for(let i=0;i<steps&&!t.done;i++) {
    const here=position(t); let next;
    if(here==='home')next='o1';
    else if(here==='o0'){t.done=true;continue;}
    else if(i===0&&((here==='o5'&&route==='shortcut')||(here==='o10'&&route==='shortcut'))) next=here==='o5'?'a1':'b1';
    else if(here==='c') {
      // A shortcut stays straight when passing the center; stopping there allows the short exit next turn.
      next=i===0?(route==='long'?'a4':'b4'):(t.path.at(-2)==='a2'?'a4':'b4');
    } else next=NEXT[here]??('o'+((Number(here.slice(1))+1)%20));
    t.path.push(next);
  }
  return t;
}
function group(s,p,id) {
  const t=s.players[p].tokens.find(t=>t.id===id);if(!t||t.done)return [];
  const pos=position(t);return pos==='home'?[t]:s.players[p].tokens.filter(x=>position(x)===pos);
}
function distance(s,result,g) {
  if(result.value<0)return -1;
  const p=s.players[s.active];let n=result.value;
  if(has(s,s.active,'stride')&&p.turn%3===0&&!p.strideUsed)n++;
  if(has(s,s.active,'solo')&&g.length===1&&n>0&&result.value===1)n++;
  if(has(s,s.active,'comeback')&&position(g[0])==='home'&&g[0].returning)n+=2;
  if(dopamineTurnsLeft(p)>0)n++;
  else if(dopamineDebuffTurnsLeft(p)>0)n--;
  if(result.value>0&&vanguardOn(p))n++;
  if(result.value>0&&p.lastDanceTurn===p.turn)n*=2;
  if(has(s,s.active,'heavy')&&g.length>1&&n>1)n--;
  return Math.max(0,n+p.boost);
}
export function legalMoves(s) {
  if(!['roll','move'].includes(s.phase))return [];
  const p=s.active,moves=[],seen=new Set();
  for(const t of s.players[p].tokens) {
    const pos=position(t);if(t.done||seen.has(pos))continue;if(pos!=='home')seen.add(pos);
    const g=group(s,p,t.id);
    if(g.some(x=>frozen(s.players[p],x)))continue;
    for(const result of s.pending) {
      if(result.value<0&&pos==='home')continue;
      const steps=distance(s,result,g);
      const routes=steps<=0?['outer']:pos==='o5'||pos==='o10'?['outer','shortcut']:pos==='c'?['short','long']:['outer'];
      for(const route of routes) {const moved=walk(t,steps,route);if(peaceBlocks(s,p,position(moved)))continue;moves.push({token:t.id,result:result.id,route,steps,to:position(moved),count:g.length,path:moved.path});}
    }
  }
  return moves;
}
export function recruitOptions(s) {
  const p=s.players[s.active];
  if(s.winner!==null||!['roll','move','flick'].includes(s.phase)||!has(s,s.active,'recruit')||p.recruitUsed||p.tokens.filter(t=>t.done).length!==2)return [];
  const reserves=p.tokens.filter(t=>position(t)==='home'),runners=p.tokens.filter(t=>NODES[position(t)]);
  return reserves.flatMap(reserve=>runners.map(target=>({reserve:reserve.id,target:target.id})));
}
const occupant=(s,node)=>s.players.findIndex(p=>p.tokens.some(t=>position(t)===node));
const finished=p=>p.tokens.filter(t=>t.done).length;
const myTurnPhase=s=>s.winner===null&&['roll','move'].includes(s.phase);
export function trapOptions(s) {
  const p=s.players[s.active];
  if(!myTurnPhase(s)||!has(s,s.active,'trap')||p.turn%3!==0||p.trapTurn===p.turn)return [];
  return [...new Set(p.tokens.map(position))].filter(node=>NODES[node]&&!(s.traps??[]).some(trap=>trap.node===node));
}
export function copyOption(s) {
  const p=s.players[s.active],from=previousSeat(s,s.active),previous=s.players[from];
  if(!myTurnPhase(s)||s.throws<=0||!has(s,s.active,'copy')||(p.copies??0)<=0||previous.lastValue==null)return null;
  return {from,value:previous.lastValue};
}
export function swapReady(s) {
  const p=s.players[s.active];
  return myTurnPhase(s)&&has(s,s.active,'swap')&&!p.swapUsed&&s.players.some((other,i)=>i!==s.active&&finished(other)>finished(p))
    &&p.tokens.some(t=>NODES[position(t)])&&s.players.some((other,i)=>i!==s.active&&other.tokens.some(t=>NODES[position(t)]));
}
export function swapTargets(s,token) {
  const mine=s.players[s.active].tokens.find(t=>t.id===token);
  if(!swapReady(s)||!mine||!NODES[position(mine)])return [];
  const out=[];
  s.players.forEach((other,owner)=>{if(owner===s.active)return;const seen=new Set();for(const t of other.tokens){const node=position(t);if(NODES[node]&&!seen.has(node)){seen.add(node);out.push({owner,token:t.id,node,count:other.tokens.filter(x=>position(x)===node).length});}}});
  return out;
}
export function quakeReady(s) {
  return myTurnPhase(s)&&has(s,s.active,'quake')&&!s.players[s.active].quakeUsed&&s.players.some(p=>p.tokens.some(t=>NODES[position(t)]));
}
function jinxTarget(s) {
  const progress=p=>finished(p)*100+p.tokens.reduce((sum,t)=>sum+t.path.length,0);
  return s.players.map((p,i)=>i).filter(i=>i!==s.active).sort((a,b)=>progress(s.players[b])-progress(s.players[a]))[0];
}
function applyJinx(s,target) {
  const victim=s.players[target];victim.jinxUntil=victim.turn+3;
  note(s,`${s.players[s.active].name}의 징크스! ${victim.name}은 다음 3턴 동안 윷·모가 걸로 바뀝니다.`);
}
function shove(s,moved) {
  const ahead=position(walk(moved,1));if(!NODES[ahead])return;
  const victim=occupant(s,ahead);if(victim<0||victim===s.active)return;
  const tokens=s.players[victim].tokens.filter(t=>position(t)===ahead);if(tokens[0].path.length<3)return;
  const back=walk(walk(tokens[0],-1),-1),at=occupant(s,position(back));if(at!==-1&&at!==victim)return;
  for(const t of tokens)t.path=[...back.path];
  note(s,`${s.players[s.active].name}: “비켜 비켜!” ${s.players[victim].name}의 말 ${tokens.length}개를 2칸 뒤로 밀었습니다.`);
}
function gainAugment(s,id,rng) {
  const p=s.players[s.active];
  p.augments.push(id);if(id==='shield')p.shields=2;
  if(id==='dopamine'){p.dopamineStart=p.turn;p.dopamineRelief=0;}
  if(id==='aunt')p.immunity=3;
  if(id==='recruit')p.recruitUsed=false;
  if(id==='copy')p.copies=3;
  if(id==='insurance')p.insurance=2;
  startAugment(s,id,rng);
}
function freeNodes(s) {return Object.keys(NODES).filter(node=>node!=='o0'&&!(s.traps??[]).some(x=>x.node===node));}
function startAugment(s,id,rng) {
  const p=s.players[s.active];
  if(USES[id])p.uses={...p.uses,[id]:USES[id]};
  if(id==='excess')p.sticks=6;
  if(id==='vanguard'){const t=p.tokens.filter(x=>!x.done).sort((a,b)=>b.path.length-a.path.length||a.id-b.id)[0];if(t){p.vanguard=t.id;note(s,`${p.name}의 ${t.id+1}번 말이 선봉장이 됐습니다.`);}}
  if(id==='marathon'){const t=p.tokens.filter(x=>position(x)==='home').at(-1);if(t){p.marathon=t.id;note(s,`${p.name}의 ${t.id+1}번 말이 마라토너가 됐습니다.`);}}
  if(id==='redbutton') {
    let n=0;
    s.players.forEach((q,j)=>{const tokens=q.tokens.filter(t=>DIAGONAL.includes(position(t)));if(!tokens.length)return;if(j===s.active){for(const t of tokens){t.path=[];t.returning=true;}n+=tokens.length;}else n+=bury(s,s.active,j,tokens);});
    note(s,`${p.name}: 크고 빨간 버튼을 눌렀습니다! 지름길의 말 ${n}개가 쓰러졌습니다.`);
  }
  if(id==='nme'){const others=s.players.map((_,j)=>j).filter(j=>j!==s.active),j=others[Math.floor(rng()*others.length)];const n=bury(s,s.active,j,s.players[j].tokens.filter(onBoard));note(s,`${p.name}: “나만 아니면 돼~” ${s.players[j].name}의 말 ${n}개가 쓰러졌습니다.`);}
  if(id==='wait') {
    const runners=s.players.flatMap((q,j)=>j===s.active?[]:q.tokens.filter(onBoard).map(t=>({j,t}))).sort((a,b)=>b.t.path.length-a.t.path.length);
    if(runners.length){const {j,t}=runners[0],q=s.players[j];for(const x of q.tokens.filter(x=>position(x)===position(t)))x.frozenUntil=q.turn+2;note(s,`${p.name}: “잠깐!” ${q.name}의 가장 앞선 말이 2턴 동안 묶였습니다.`);}
  }
  if(id==='echo'){s.echo=true;s.echoRepeat=false;note(s,'메아리의 형상! 이제부터 모두 차례를 두 번씩 합니다.');}
  if(id==='poop'){const nodes=sample(freeNodes(s),3,rng);s.traps=[...(s.traps??[]),...nodes.map(node=>({node,owner:s.active,kind:'poop'}))];note(s,`${p.name}: 히히 똥! 판에 똥 3개`);}
  if(id==='reaper'){s.reaper={node:'c',owner:s.active};note(s,`${p.name}이(가) 중앙에 사신을 불렀습니다.`);}
  if(id==='chance') {
    const extra=sample(availableAugments(s).map(a=>a.id).filter(x=>!['jinx','objection','chance'].includes(x)),4,rng);
    for(const more of extra)gainAugment(s,more,rng);
    note(s,`${p.name}의 역전 찬스! ${extra.map(x=>AUGMENTS.find(a=>a.id===x).name).join(' · ')}`);
  }
  if(id==='piggy') {
    const reserves=p.tokens.filter(t=>position(t)==='home');
    if(reserves.length&&!capture(s,s.active,'o1').blocked){for(const t of reserves){t.path=['o1'];t.returning=false;}note(s,`${p.name}: “이리 오너라 업고 놀자!” 말 ${reserves.length}개가 업고 도 칸에 섰습니다.`);}
  }
  if(id==='garlic'){p.garlic=sample(freeNodes(s).filter(node=>!p.tokens.some(t=>position(t)===node)),4,rng);note(s,`${p.name}의 마늘 4개가 판에 흩어졌습니다.`);}
  if(id==='kim') {
    const runner=p.tokens.filter(t=>!t.done).sort((a,b)=>b.path.length-a.path.length||a.id-b.id)[0];
    if(runner){p.kimToken=runner.id;p.kimUntil=p.turn+5;note(s,`${p.name}의 ${runner.id+1}번 말이 김첨지가 됐습니다. ${p.kimUntil}번째 턴까지 완주하면 승리!`);}
  }
  if(id==='party') {
    const nodes=sample(freeNodes(s),10,rng);
    s.traps=[...(s.traps??[]),...nodes.map((node,i)=>({node,owner:s.active,kind:i<6?'party':'reward'}))];
    note(s,`${p.name}: “말이오? 파티!” 함정 6개와 보상 4개가 깔렸습니다.`);
  }
  if(id==='trade') {
    // The piece left behind is a waiting one when possible; pieces are renumbered so their numbers stay their places.
    const keep=t=>t.id===p.kimToken?1:0,gone=[...p.tokens].filter(t=>!t.done).sort((a,b)=>keep(a)-keep(b)||(position(a)==='home'?0:1)-(position(b)==='home'?0:1)||a.path.length-b.path.length||b.id-a.id)[0];
    if(gone) {
      p.tokens=p.tokens.filter(t=>t!==gone);
      const renumber=new Map(p.tokens.map((t,i)=>[t.id,i]));if(Number.isInteger(p.kimToken))p.kimToken=renumber.get(p.kimToken);
      p.tokens.forEach((t,i)=>{t.id=i;});
    }
    p.sticks=3;note(s,`${p.name}: “등가교환!” 말 1개와 윷가락 1개를 내려놓았습니다.`);
  }
  if(id==='bundle'){p.tokens.push({id:p.tokens.length,path:[],done:false,returning:false});p.sticks=5;note(s,`${p.name}: 짐덩이와 복덩이! 말 1개와 윷가락 1개가 늘었습니다.`);}
}
const onBoard=t=>Boolean(NODES[position(t)]);
const uses=(p,id)=>p.uses?.[id]??0;
const vanguardOn=p=>Number.isInteger(p.vanguard)&&p.augments.includes('vanguard')&&p.tokens.some(t=>t.id===p.vanguard&&onBoard(t));
const frozen=(p,t)=>(t.frozenUntil??0)>0&&t.frozenUntil>=p.turn||p.domain?.token===t.id;
const peaceful=(s,a,b)=>a!==b&&(has(s,a,'peace')||has(s,b,'peace'));
function peaceBlocks(s,i,node) {
  if(!NODES[node])return false;
  const j=s.players.findIndex((q,k)=>k!==i&&q.tokens.some(t=>position(t)===node));
  return j>=0&&peaceful(s,i,j);
}
// Pieces killed by an augment rather than by landing on them; 평화 협정 and shields still apply.
function bury(s,killer,vi,tokens) {
  if(!tokens.length||peaceful(s,killer,vi))return 0;
  const victim=s.players[vi],safe=tokens.filter(t=>t.shielded),dead=tokens.filter(t=>!t.shielded);
  for(const t of safe)t.shielded=false;
  if(safe.length)note(s,`${victim.name}의 보호막! 말 ${safe.length}개가 버텼습니다.`);
  for(const t of dead){t.path=[];t.done=false;t.returning=true;}
  afterDeath(s,killer,vi,dead,null,true);
  return dead.length;
}
function afterDeath(s,killer,vi,dead,avoid,revive) {
  if(!dead.length)return;
  const victim=s.players[vi],k=s.players[killer];
  for(const t of dead){t.soul=false;t.shielded=false;t.frozenUntil=0;}
  if(killer!==vi) {
    if(has(s,killer,'coup'))k.coupKills=(k.coupKills??0)+dead.length;
    if(has(s,vi,'lonely')&&!victim.caughtBy?.includes(killer))victim.caughtBy=[...(victim.caughtBy??[]),killer];
    s.players.forEach((q,j)=>{if(j===killer||j===vi||j===s.active||!has(s,j,'fisher'))return;q.fishCount=(q.fishCount??0)+dead.length;while(q.fishCount>=2){q.fishCount-=2;q.fishBonus=(q.fishBonus??0)+1;}});
  }
  if(victim.domain&&dead.some(t=>t.id===victim.domain.token)){victim.domain=null;note(s,`${victim.name}의 영역 전개가 깨졌습니다.`);}
  const fire=victim.bonfire,back=fire?dead.filter(t=>fire.ids.includes(t.id)):[];
  if(revive&&back.length&&fire.node!==avoid&&[-1,vi].includes(occupant(s,fire.node))) {
    for(const t of back){t.path=[...fire.path];t.returning=false;}
    victim.bonfire=null;note(s,`${victim.name}의 화톳불! 말 ${back.length}개가 부활했습니다.`);
  }
}
function record(s,value) {
  const p=s.players[s.active];
  if(value!==0)p.lastValue=value;
  p.thrown=[...new Set([...(p.thrown??[]),value])];p.turnValues=[...(p.turnValues??[]),value];
  if(has(s,s.active,'lucky7')&&p.turnValues.filter(v=>v===value).length>=3)p.winBy='777 · 같은 결과 세 번';
  if(value===2)p.gaeCount=(p.gaeCount??0)+1;
  if(value===3&&has(s,s.active,'jajinmori')){p.geolCount=(p.geolCount??0)+1;if(p.geolCount%2===0){s.pending.push({id:s.nextId++,value:2});note(s,`${p.name} · 자진모리 장단! 개 하나 더`);}}
}
// A thrown result counts toward records and may earn extra throws; a gifted one (개들을 풀어라 · 도베르만) does neither.
function addResult(s,value,thrown) {
  const p=s.players[s.active];
  if(thrown)record(s,value);
  if(value===0){note(s,`${p.name} · 과유불급! 꽝`);return 0;}
  const extra=thrown?extraThrows(s,value):0;s.throws+=extra;
  s.pending.push({id:s.nextId++,value});
  if(thrown&&value===5&&p.chaliceTurn===p.turn) {
    const tokens=p.tokens.filter(onBoard);for(const t of tokens){t.path=[];t.returning=true;}
    s.pending=[];s.throws=0;note(s,`${p.name} · 독이 든 성배! 모가 나와 판 위의 말 ${tokens.length}개가 쓰러졌습니다.`);
  }
  return extra;
}
function flips(value) {
  const count=value===5?0:value===-1?1:value;
  return [count-1,count+1].filter(c=>c>=0&&c<=4).map(c=>c===0?5:c);
}
function badukVictims(s) {
  const i=s.active,mine=new Set(s.players[i].tokens.filter(onBoard).map(position)),out=new Map();
  for(const line of LINES) {
    const marks=line.map((node,k)=>mine.has(node)?k:-1).filter(k=>k>=0);
    for(let a=0;a+1<marks.length;a++)for(let k=marks[a]+1;k<marks[a+1];k++)s.players.forEach((q,j)=>{if(j!==i&&q.tokens.some(t=>position(t)===line[k]))out.set(line[k],j);});
  }
  return [...out].map(([node,owner])=>({node,owner}));
}
function truckEnd(s,token) {
  let t=structuredClone(token);
  for(let i=0;i<20&&position(t)!=='o0';i++){const next=walk(t,1);if(next.done||occupant(s,position(next))!==-1)break;t=next;}
  return t;
}
// Every augment skill a player can use right now; the page shows these as buttons and act() accepts only these.
export function skillActions(s,token) {
  const i=s.active,p=s.players[i],out=[];
  if(!myTurnPhase(s))return out;
  const add=(id,label,action)=>out.push({id,label,action});
  if(has(s,i,'dogs')&&uses(p,'dogs'))add('dogs',`개 얻기 (${uses(p,'dogs')}회 남음)`,{type:'dogs'});
  if(has(s,i,'loan')&&uses(p,'loan'))add('loan',`던지기 +1 · 다음 차례 쉼 (${uses(p,'loan')}회 남음)`,{type:'loan'});
  if(has(s,i,'doberman')&&uses(p,'doberman')&&(p.gaeCount??0)>0)add('doberman',`모 ${Math.min(3,p.gaeCount)}개 얻기`,{type:'doberman'});
  if(has(s,i,'chalice')&&p.chaliceTurn!==p.turn)add('chalice','성배 마시기 · 던지기 +3',{type:'chalice'});
  if(has(s,i,'lastdance')&&uses(p,'lastdance'))add('lastdance','춤추기 · 던지기 +2, 이동 2배',{type:'lastdance'});
  if(s.throws>0) {
    if(has(s,i,'hand')&&uses(p,'hand'))for(const value of [...(s.backdo?[-1]:[]),1,2,3,4,5])add('hand',`${label(value)} 내기`,{type:'hand',value});
    if(has(s,i,'loner')&&uses(p,'loner'))add('loner',`걸 내기 (${uses(p,'loner')}회 남음)`,{type:'loner'});
    if(has(s,i,'sniper'))for(const node of new Set(s.players.flatMap((q,j)=>j===i?[]:q.tokens.filter(onBoard).map(position))))add('sniper',`${squareLabel(node)} 조준`,{type:'snipe',node});
  }
  if(has(s,i,'sneak')&&uses(p,'sneak'))for(const r of s.pending)for(const value of flips(r.value))add('sneak',`${label(r.value)} → ${label(value)}`,{type:'sneak',result:r.id,value});
  if(has(s,i,'baduk')&&uses(p,'baduk')&&badukVictims(s).length)add('baduk',`바둑 두기 · ${badukVictims(s).length}곳 포위`,{type:'baduk'});
  if(has(s,i,'throwhit')&&uses(p,'throwhit'))s.players.forEach((q,j)=>{if(j!==i)add('throwhit',`${q.name} 맞히기`,{type:'throwhit',target:j});});
  const sel=Number.isInteger(token)?p.tokens.find(t=>t.id===token):null,g=sel&&onBoard(sel)?group(s,i,sel.id):null;
  for(const id of ['timetravel','assassin','heaven','bonfire','sacrifice','truck','combo','domain']) {
    if(!has(s,i,id)||!uses(p,id)||!p.tokens.some(onBoard))continue;
    if(!g){add(id,'판 위의 내 말을 먼저 고르세요.',null);continue;}
    const at=squareLabel(position(sel));
    if(id==='timetravel')for(let n=1;n<=Math.min(3,sel.path.length-1);n++)add(id,`${at}에서 ${n}칸 되돌리기`,{type:'timetravel',token:sel.id,steps:n});
    if(id==='assassin')add(id,`${at} 말에 영혼 넣기`,{type:'assassin',token:sel.id});
    if(id==='heaven')add(id,`${at} 말에 보호막`,{type:'heaven',token:sel.id});
    if(id==='bonfire')add(id,`${at}에 화톳불 놓기`,{type:'bonfire',token:sel.id});
    if(id==='sacrifice')add(id,`${sel.id+1}번 말 희생하기`,{type:'sacrifice',token:sel.id});
    if(id==='truck'&&g.length>1&&position(truckEnd(s,sel))!==position(sel))add(id,`${at}에서 트럭 출발 → ${squareLabel(position(truckEnd(s,sel)))}`,{type:'truck',token:sel.id});
    if(id==='combo'&&g.length>2)add(id,`${at} 묶음으로 필살기!`,{type:'combo',token:sel.id});
    if(id==='domain')add(id,`${sel.id+1}번 말로 영역 전개`,{type:'domain',token:sel.id});
  }
  return out;
}
function useSkill(s,action,rng) {
  if(!skillActions(s,action.token).some(o=>o.action&&Object.entries(o.action).every(([k,v])=>action[k]===v)))throw Error('지금은 쓸 수 없는 기술입니다.');
  const i=s.active,p=s.players[i],spend=id=>{p.uses={...p.uses,[id]:uses(p,id)-1};};
  const sel=Number.isInteger(action.token)?p.tokens.find(t=>t.id===action.token):null,g=sel?group(s,i,sel.id):[];
  switch(action.type) {
    case 'dogs':spend('dogs');addResult(s,2,false);note(s,`${p.name} · 개들을 풀어라! 개 하나`);break;
    case 'loan':spend('loan');s.throws++;p.skip=(p.skip??0)+1;note(s,`${p.name} · 대출! 던지기 +1, 다음 차례는 쉽니다.`);break;
    case 'doberman':{spend('doberman');const n=Math.min(3,p.gaeCount);for(let k=0;k<n;k++)addResult(s,5,false);note(s,`${p.name} · 도베르만! 모 ${n}개`);break;}
    case 'chalice':p.chaliceTurn=p.turn;s.throws+=3;note(s,`${p.name} · 독이 든 성배를 마셨습니다. 던지기 +3, 이번 차례에 모가 나오면…`);break;
    case 'lastdance':spend('lastdance');p.lastDanceTurn=p.turn;s.throws+=2;note(s,`${p.name} · 라스트 댄스! 던지기 +2, 이번 턴 이동 2배`);break;
    case 'hand':case 'loner': {
      spend(action.type);const value=action.type==='hand'?action.value:3;s.throws--;
      const extra=addResult(s,value,true);s.lastRoll={id:s.revision+1,owner:i,value,extra,reroll:false};
      note(s,`${p.name} · ${action.type==='hand'?'손은 눈보다 빠르다':'외톨이'}! ${label(value)}${extra?' · 한 번 더':''}`);break;
    }
    case 'snipe':s.throws--;s.snipes=[...(s.snipes??[]),{node:action.node,owner:i}];note(s,`${p.name} · 명사수가 ${squareLabel(action.node)}을(를) 조준했습니다.`);break;
    case 'sneak':{spend('sneak');const r=s.pending.find(x=>x.id===action.result);note(s,`${p.name} · 슬쩍! ${label(r.value)} → ${label(action.value)}`);r.value=action.value;break;}
    case 'baduk': {
      spend('baduk');let killed=0;
      for(const {node,owner} of badukVictims(s))killed+=bury(s,i,owner,s.players[owner].tokens.filter(t=>position(t)===node));
      const gain=Math.min(3,killed);s.throws+=gain;note(s,`${p.name} · 바둑! 말 ${killed}개를 잡고 던지기 +${gain}`);break;
    }
    case 'throwhit':{spend('throwhit');const q=s.players[action.target];q.skip=(q.skip??0)+2;note(s,`${p.name}의 윷이 ${q.name}에게 명중! 차례를 두 번 쉽니다.`);break;}
    case 'timetravel': {
      spend('timetravel');const path=g[0].path.slice(0,-action.steps),outcome=capture(s,i,path.at(-1));
      if(!outcome.blocked)for(const t of g)t.path=[...path];note(s,`${p.name} · 시간 여행! ${action.steps}칸 전으로`);break;
    }
    case 'assassin':spend('assassin');for(const t of g)t.soul=true;note(s,`${p.name} · 암살자의 영혼을 깃들였습니다.`);break;
    case 'heaven':spend('heaven');for(const t of g)t.shielded=true;note(s,`${p.name} · 천상의 보호막!`);break;
    case 'bonfire':spend('bonfire');p.bonfire={node:position(sel),path:[...sel.path],ids:g.map(t=>t.id)};note(s,`${p.name} · ${squareLabel(position(sel))}에 화톳불을 피웠습니다.`);break;
    case 'sacrifice':spend('sacrifice');sel.path=[];sel.returning=true;for(const t of p.tokens)if(onBoard(t))t.shielded=true;note(s,`${p.name} · 희생! 남은 말들에 보호막이 생겼습니다.`);break;
    case 'truck': {
      spend('truck');const end=truckEnd(s,sel);for(const t of g)t.path=[...end.path];
      note(s,`${p.name} · 8톤 트럭 돌진! ${squareLabel(position(end))}까지. 턴 종료`);s.pending=[];s.throws=0;break;
    }
    case 'combo': {
      spend('combo');let killed=0;
      s.players.forEach((q,j)=>{const tokens=q.tokens.filter(t=>onBoard(t)&&!g.includes(t));if(!tokens.length)return;if(j===i){for(const t of tokens){t.path=[];t.returning=true;}killed+=tokens.length;}else killed+=bury(s,i,j,tokens);});
      note(s,`${p.name} · 3단 합체 필살기!!! 말 ${killed}개가 날아갔습니다. 턴 종료`);s.pending=[];s.throws=0;break;
    }
    case 'domain':spend('domain');p.domain={token:sel.id,node:position(sel),until:p.turn+2};note(s,`${p.name} · 영역 전개! ${sel.id+1}번 말이 ${p.domain.until}번째 턴 시작까지 버티면 승리`);break;
  }
  checkAll(s);settle(s,rng);
}
function checkAll(s) {for(const i of [s.active,...s.players.map((_,i)=>i).filter(i=>i!==s.active)])if(s.winner===null)checkWin(s,i);}
function settle(s,rng) {
  if(s.winner!==null)return;
  if(s.throws>0){s.phase='roll';return;}
  s.phase='move';
  if(legalMoves(s).length)return;
  if(s.pending.length)note(s,'움직일 말이 없어 빽도를 소모합니다.');
  endTurn(s,rng);
}
function endTurn(s,rng) {
  const p=s.players[s.active];
  if(p.lastDanceTurn===p.turn) {
    const tokens=p.tokens.filter(onBoard);for(const t of tokens){t.path=[];t.returning=true;}
    p.lastDanceTurn=-1;note(s,`${p.name}의 라스트 댄스가 끝났습니다. 판 위의 말 ${tokens.length}개가 대기로 돌아갑니다.`);
  }
  s.pending=[];
  // 메아리의 형상: each player plays twice in a row.
  const repeat=Boolean(s.echo)&&!s.echoRepeat;s.echoRepeat=repeat;
  if(!repeat)s.active=nextSeat(s,s.active);
  s.round++;beginTurn(s,rng);
}
function capture(s,owner,at,flick=false) {
  const vi=s.players.findIndex((p,i)=>i!==owner&&p.tokens.some(t=>position(t)===at));
  if(vi<0)return {caught:0,blocked:false,ids:[]};
  const victim=s.players[vi],caught=victim.tokens.filter(t=>position(t)===at);
  if(peaceful(s,owner,vi)){note(s,`평화 협정! ${victim.name}의 말은 잡을 수 없습니다.`);return {caught:0,blocked:true,ids:[]};}
  if(!flick&&caught.length>1&&victim.augments.includes('heavy')) {note(s,`${victim.name}의 무거운 짐! 업은 묶음은 잡히지 않습니다.`);return {caught:0,blocked:true};}
  if(victim.immunity>0) {victim.immunity--;note(s,`${victim.name}: “어쩌라고!” 잡힘 면역 (${victim.immunity}/3회 남음)`);return {caught:0,blocked:true};}
  if(victim.shields>0) {victim.shields--;note(s,`${victim.name}의 호신부가 잡기를 막았습니다. (${victim.shields}회 남음)`);return {caught:0,blocked:true};}
  if(caught.some(t=>t.shielded)){for(const t of caught)t.shielded=false;note(s,`${victim.name}의 보호막이 잡기를 막았습니다.`);return {caught:0,blocked:true,ids:[]};}
  let dead=caught;
  if(victim.augments.includes('friend')&&caught.length>1) {
    const rest=caught.slice(1),back=walk(rest[0],-1),there=occupant(s,position(back));
    if(there===-1||there===vi){dead=[caught[0]];for(const t of rest)t.path=[...back.path];note(s,`${victim.name}의 프렌드 실드! 말 ${rest.length}개가 1칸 물러나 살아남았습니다.`);}
  }
  const insured=victim.augments.includes('insurance')&&(victim.insurance??0)>0&&at!=='o3'&&[-1,vi].includes(occupant(s,'o3'));
  for(const t of dead){t.path=insured?['o1','o2','o3']:[];t.done=false;t.returning=!insured;}
  note(s,`${s.players[owner].name}, ${victim.name}의 말 ${dead.length}개 잡기!`);
  afterDeath(s,owner,vi,dead,at,!insured);
  if(insured){victim.insurance--;note(s,`${victim.name}의 실손보험! 잡힌 말이 3번 칸에서 다시 출발합니다. (${victim.insurance}회 남음)`);}
  relieveDopamine(s,owner,'상대 잡기');
  if(has(s,owner,'hunter'))s.players[owner].boost=Math.min(2,s.players[owner].boost+1);
  if(owner===s.active&&has(s,owner,'treason')&&finished(victim)>finished(s.players[owner])){s.throws++;note(s,`${s.players[owner].name}의 역모! 한 번 더 던집니다.`);}
  return {caught:dead.length,blocked:false,ids:dead.map(t=>t.id)};
}
export const FLICK_MAX_PULL=180;
export const FLICK_MAX_TRAVEL=760;
export const FLICK_MIN_PULL=8;
export function flickFromPull(pullX,pullY) {
  const length=Math.hypot(pullX,pullY);
  if(![pullX,pullY,length].every(Number.isFinite))throw Error('잘못된 알까기 드래그입니다.');
  const power=Math.min(1,length/FLICK_MAX_PULL)*FLICK_MAX_TRAVEL;
  return {dx:pullX?-pullX/length:0,dy:pullY?-pullY/length:0,power,length};
}
export function simulateFlick(source,dx,dy,power,targets) {
  const mag=Math.hypot(dx,dy);if(mag<.001)return {trail:[source,{...source}],hit:null};
  const travel=Math.max(0,Math.min(FLICK_MAX_TRAVEL,power)),ux=dx/mag,uy=dy/mag;
  let best=travel,hit=null;
  for(const target of targets) {
    const tx=target.x-source.x,ty=target.y-source.y,along=tx*ux+ty*uy,perp2=tx*tx+ty*ty-along*along;
    if(perp2>42*42||along<0)continue;
    const near=Math.max(0,along-Math.sqrt(42*42-perp2));
    if(near<=best){best=near;hit=target.node;}
  }
  return {trail:[source,{x:source.x+ux*best,y:source.y+uy*best}],hit};
}
export function act(s,action,rng=Math.random) {
  if(s.phase==='won')throw Error('이미 끝난 게임입니다.');
  if(s.phase==='draft')return draftAct(s,action,rng);
  const p=s.players[s.active];
  switch(action.type) {
    case 'augment': {
      if(s.phase!=='augment'||!s.offers.includes(action.id))throw Error('선택할 수 없는 증강입니다.');
      s.offers=[];
      if(action.id==='objection'){note(s,`${p.name} · 이의있음! 증강을 다시 고릅니다.`);draft(s,rng);break;}
      p.drafts=(p.drafts??p.augments.length)+1;
      gainAugment(s,action.id,rng);
      note(s,`${p.name}의 증강: ${AUGMENTS.find(a=>a.id===action.id).name}`);
      checkAll(s);if(s.winner!==null)break;
      if(action.id==='jinx'&&s.players.length>2){s.phase='jinx';break;}
      if(action.id==='jinx')applyJinx(s,1-s.active);
      afterDraft(s);break;
    }
    case 'jinx': {
      if(s.phase!=='jinx'||!Number.isInteger(action.target)||action.target===s.active||!s.players[action.target])throw Error('징크스를 걸 상대를 고르세요.');
      applyJinx(s,action.target);afterDraft(s);break;
    }
    case 'trap': {
      if(!trapOptions(s).includes(action.node))throw Error('지금은 이 칸에 덫을 놓을 수 없습니다.');
      s.traps=[...(s.traps??[]),{node:action.node,owner:s.active}];
      const mine=s.traps.filter(trap=>trap.owner===s.active&&!trap.kind);if(mine.length>2)s.traps.splice(s.traps.indexOf(mine[0]),1);
      p.trapTurn=p.turn;note(s,`${p.name} · 밤길 조심해! 덫을 놓았습니다.`);break;
    }
    case 'copy': {
      const copy=copyOption(s);if(!copy)throw Error('따라 할 결과가 없습니다.');
      const value=copy.value===-1&&has(s,s.active,'forward')?1:copy.value;
      p.copies--;s.throws--;p.lastValue=value;
      s.lastRoll={id:s.revision+1,owner:s.active,value,extra:0,reroll:false};
      s.pending.push({id:s.nextId++,value});note(s,`${p.name} · 따라쟁이! ${s.players[copy.from].name}의 ${label(value)} (${p.copies}회 남음)`);settle(s,rng);break;
    }
    case 'swap': {
      const target=swapTargets(s,action.token).find(x=>x.owner===action.owner&&x.token===action.target);
      if(!target)throw Error('바꿀 수 있는 말이 아닙니다.');
      const mine=group(s,s.active,action.token),theirs=group(s,target.owner,target.token),myPath=[...mine[0].path],theirPath=[...theirs[0].path];
      for(const t of mine){t.path=[...theirPath];t.returning=false;}
      for(const t of theirs){t.path=[...myPath];t.returning=false;}
      p.swapUsed=true;note(s,`${p.name}: “자리 바꿔줘!” ${s.players[target.owner].name}의 말과 자리를 바꿨습니다. 턴 종료!`);
      s.pending=[];s.throws=0;checkAll(s);settle(s,rng);break;
    }
    case 'quake': {
      if(!quakeReady(s))throw Error('지진은 판당 한 번, 내 차례에만 쓸 수 있습니다.');
      // Every group is chosen before any moves, so a group stepping onto its own team's square is not pushed twice.
      const groups=s.players.flatMap((owner,i)=>[...new Set(owner.tokens.map(position))].filter(node=>NODES[node]).map(node=>{const tokens=owner.tokens.filter(t=>position(t)===node);return {i,tokens,back:walk(tokens[0],-1)};}));
      for(const {i,tokens,back} of groups){const at=occupant(s,position(back));if(at!==-1&&at!==i)continue;for(const t of tokens)t.path=[...back.path];}
      p.quakeUsed=true;note(s,`${p.name}: “지진났다!” 판 위의 모든 말이 1칸 뒤로 밀렸습니다.`);
      checkAll(s);if(s.winner===null)settle(s,rng);break;
    }
    case 'draftReroll':
      if(s.phase!=='augment'||p.draftRerolls<=0)throw Error('증강 재선택을 사용할 수 없습니다.');
      {const previous=[...s.offers];p.draftRerolls--;s.offers=sample(availableAugments(s).filter(a=>!previous.includes(a.id)).map(a=>a.id),3,rng);forceCat(s);}break;
    case 'roll': {
      if(!['roll','move'].includes(s.phase)||s.throws<=0)throw Error('던질 수 없는 차례입니다.');
      let value;
      if(has(s,s.active,'choice')) {if(![1,2].includes(action.value))throw Error('도 또는 개를 고르세요.');value=action.value;} else value=rolledValue(s,rng);
      const dual=has(s,s.active,'dual');if(dual&&value===5)value=1;
      s.throws--;let extra=addResult(s,value,true),second=null;
      if(dual){second=rolledValue(s,rng);if(second===5)second=1;extra+=addResult(s,second,true);}
      s.lastRoll={id:s.revision+1,owner:s.active,value,extra,reroll:false};
      note(s,`${p.name} · ${label(value)}${second!==null?` + ${label(second)}`:''}${extra===2?'! 반찬맨, 두 번 더!':extra===1?'! 한 번 더':''}`);checkAll(s);settle(s,rng);break;
    }
    case 'reroll': {
      const r=s.pending.find(x=>x.id===action.result);
      if(!['roll','move'].includes(s.phase)||!has(s,s.active,'reroll')||p.rerolled||!r||r.value>=4)throw Error('이 결과는 다시 던질 수 없습니다.');
      if(has(s,s.active,'choice')&&![1,2].includes(action.value))throw Error('도 또는 개를 고르세요.');
      p.rerolled=true;let value=has(s,s.active,'choice')?action.value:rolledValue(s,rng);if(has(s,s.active,'dual')&&value===5)value=1;
      record(s,value);if(value===0)s.pending=s.pending.filter(x=>x!==r);else r.value=value;
      const extra=value?extraThrows(s,value):0;s.throws+=extra;
      s.lastRoll={id:s.revision+1,owner:s.active,value,extra,reroll:true};
      note(s,`${p.name} · 다시 던져 ${label(value)}${extra===2?'! 반찬맨, 두 번 더!':''}`);checkAll(s);settle(s,rng);break;
    }
    case 'move': {
      const move=legalMoves(s).find(m=>m.token===action.token&&m.result===action.result&&m.route===action.route);
      if(!move)throw Error('이동할 수 없는 자리입니다.');
      const result=s.pending.find(x=>x.id===move.result),g=group(s,s.active,move.token);
      let offset=0;
      if(result.value>0&&has(s,s.active,'stutter')){const draw=rng();offset=draw<.15?1:draw<.3?-1:0;}
      const steps=result.value<0?move.steps:Math.max(0,move.steps+offset);let moved=walk(g[0],steps,move.route);
      const stumble=offset?` · “성어말?” ${offset>0?'+1':'−1'}칸! (예정 ${move.steps} → 실제 ${steps}칸)`:'';
      s.pending=s.pending.filter(x=>x.id!==move.result);
      // Consume the old boost before applying a newly earned capture boost.
      if(result.value>0){p.boost=0;p.strideUsed=true;}
      const fresh=steps>0?moved.path.slice(g[0].path.length):[];
      // 히히 똥: stepping on someone else's poop stops the group right there.
      const poop=fresh.findIndex(node=>(s.traps??[]).some(x=>x.kind==='poop'&&x.node===node&&x.owner!==s.active));
      if(poop>=0) {
        const x=s.traps.find(x=>x.kind==='poop'&&x.node===fresh[poop]&&x.owner!==s.active);s.traps.splice(s.traps.indexOf(x),1);
        moved={...moved,path:[...g[0].path,...fresh.slice(0,poop+1)],done:false};note(s,`${p.name} · ${s.players[x.owner].name}의 똥을 밟고 멈췄습니다!`);
      }
      // 암살자의 영혼: passing over a soul-bearing piece is fatal.
      const passed=steps>0?moved.path.slice(g[0].path.length,moved.done?undefined:-1):[];
      let soul=null;for(const node of passed)s.players.forEach((q,j)=>{if(!soul&&j!==s.active){const t=q.tokens.find(t=>t.soul&&position(t)===node);if(t)soul={j,t};}});
      if(soul) {
        soul.t.soul=false;const killed=bury(s,soul.j,s.active,g);
        note(s,`${s.players[soul.j].name}의 암살자의 영혼! ${p.name}의 말 ${killed}개가 쓰러졌습니다.`);
        if(killed){checkAll(s);settle(s,rng);break;}
      }
      const to=position(moved);
      const outcome=NODES[to]?capture(s,s.active,to):{caught:0,blocked:false};
      if(!outcome.blocked) {
        for(const t of g){t.path=[...moved.path];t.done=moved.done;if(steps>0)t.returning=false;}
        note(s,`${p.name} ${g.map(t=>t.id+1).join('·')}번 말 ${steps===-1?'뒤로 1':steps}칸${stumble}${moved.done?' · 완주!':''}`);
        if(moved.done)relieveDopamine(s,s.active,'말 완주');
        if(g.some(t=>t.id===p.kimToken)&&moved.done&&!p.kimDoneTurn)p.kimDoneTurn=p.turn;
        if(moved.done&&has(s,s.active,'marathon')&&g.some(t=>t.id===p.marathon))p.winBy='마라토너 완주';
        if(result.value<0&&outcome.ids?.includes(0)&&has(s,s.active,'backcow'))p.winBy='소 뒷걸음질 · 빽도로 1번 말 잡기';
        if(has(s,s.active,'cannibal')&&NODES[to]) {
          const eaten=p.tokens.filter(t=>!g.includes(t)&&position(t)===to);
          if(eaten.length){for(const t of eaten){t.path=[];t.returning=true;}s.throws++;note(s,`${p.name} · 카니발리즘! 내 말 ${eaten.length}개를 먹고 한 번 더`);}
        }
        if(!moved.done&&p.garlic?.includes(to)){p.garlic=p.garlic.filter(node=>node!==to);note(s,`${p.name} · 마늘 줍기! (${4-p.garlic.length}/4)`);}
        const reward=(s.traps??[]).find(x=>x.node===to&&x.kind==='reward');
        if(reward&&!moved.done){s.traps.splice(s.traps.indexOf(reward),1);s.throws++;note(s,`${p.name} · 파티 보상! 한 번 더 던집니다.`);}
        const trap=(s.traps??[]).find(x=>x.node===to&&x.kind!=='reward'&&x.owner!==s.active);
        if(trap&&!moved.done) {
          for(const t of g){t.path=[];t.returning=false;}
          s.traps.splice(s.traps.indexOf(trap),1);note(s,`${s.players[trap.owner].name}의 ${trap.kind==='party'?'파티 함정':'덫'}! ${p.name}의 말 ${g.length}개가 대기로 돌아갑니다.`);
        }else if(steps>0&&!moved.done&&has(s,s.active,'shove'))shove(s,moved);
        if(outcome.caught&&result.value<4)s.throws++;
        if(moved.done&&has(s,s.active,'finish')&&!p.finishUsed){s.throws++;p.finishUsed=true;note(s,'완주의 기세 · 한 번 더!');}
      }else if(offset)note(s,`${p.name}${stumble} · ${s.log[0]}`);
      checkAll(s);settle(s,rng);break;
    }
    case 'recruit': {
      if(!recruitOptions(s).some(option=>option.reserve===action.reserve&&option.target===action.target))throw Error('내 말 2개가 완주하고 창고 말과 달리는 말이 있어야 판당 한 번 사용할 수 있습니다.');
      const reserve=p.tokens.find(t=>t.id===action.reserve),target=p.tokens.find(t=>t.id===action.target);
      reserve.path=[...target.path];reserve.done=false;reserve.returning=false;p.recruitUsed=true;
      note(s,`${p.name}: “뒹학 사람좀 모아봐!” ${reserve.id+1}번 말을 ${target.id+1}번 말에 업었습니다. 턴 종료!`);
      s.pending=[];s.throws=0;settle(s,rng);break;
    }
    case 'flick': {
      if(s.phase!=='flick')throw Error('알까기 차례가 아닙니다.');
      const launch=flickFromPull(action.pullX,action.pullY);
      if(launch.length<FLICK_MIN_PULL)throw Error('알을 조금 더 당긴 뒤 놓으세요.');
      const t=p.tokens.find(t=>t.id===action.token),source=t&&NODES[position(t)];
      if(!source)throw Error('판 위의 내 말을 선택하세요.');
      const sourceNode=position(t),shooters=group(s,s.active,t.id);
      const targets=[...new Set(s.players.flatMap((p,i)=>i===s.active?[]:p.tokens.map(position)))].filter(n=>NODES[n]).map(node=>({...NODES[node],node}));
      const shot=simulateFlick(source,launch.dx,launch.dy,launch.power,targets);
      const victim=shot.hit?s.players.findIndex((opponent,i)=>i!==s.active&&opponent.tokens.some(t=>position(t)===shot.hit)):-1;
      const victimTokens=victim<0?[]:s.players[victim].tokens.filter(t=>position(t)===shot.hit).map(t=>t.id);
      s.flick={...shot,owner:s.active,id:s.revision+1,sourceNode,sourceTokens:shooters.map(t=>t.id),victim,victimTokens,launch,outcome:'miss'};
      if(shot.hit) {
        const taken=[...s.players[victim].tokens.find(t=>position(t)===shot.hit).path];
        const result=capture(s,s.active,shot.hit,true);s.flick.outcome=result.blocked?'blocked':'hit';
        if(result.caught) {
          // A successful flick takes over the victim's square, route included, and ends the turn without a bonus throw.
          for(const token of shooters){token.path=[...taken];token.returning=false;}
          note(s,`${p.name} · 알까기 명중! 상대 자리를 차지하고 턴 종료`);
          const shotRecord=s.flick;s.pending=[];s.throws=0;checkWin(s,s.active);settle(s,rng);s.flick=shotRecord;break;
        }
      }else {
        for(const token of shooters){token.path=[];token.done=false;token.returning=true;}
        note(s,`${p.name} · 알까기 빗나감! 내 말 ${shooters.length}개가 날아가 탈락했습니다.`);
      }
      s.phase='roll';break;
    }
    case 'dogs':case 'loan':case 'doberman':case 'chalice':case 'lastdance':case 'hand':case 'loner':case 'snipe':case 'sneak':case 'baduk':case 'throwhit':
    case 'timetravel':case 'assassin':case 'heaven':case 'bonfire':case 'sacrifice':case 'truck':case 'combo':case 'domain':
      useSkill(s,action,rng);break;
    case 'skipFlick':if(s.phase!=='flick')throw Error('알까기 차례가 아닙니다.');s.phase='roll';break;
    case 'flickTimeout':
      if(s.phase!=='flick')throw Error('알까기 차례가 아닙니다.');
      note(s,`${p.name} · 알까기 시간 초과! 턴 종료`);s.pending=[];s.throws=0;settle(s,rng);break;
    default:throw Error('알 수 없는 행동입니다.');
  }
  s.revision++;return s;
}
export function botAction(s,rng=Math.random,seat) {
  if(s.phase==='draft') {
    const i=s.draft.findIndex((x,k)=>x&&!x.done&&(seat===undefined||k===seat));if(i<0)return null;
    const entry=s.draft[i];
    if(entry.stage==='jinx')return {type:'jinx',player:i,target:as(s,i,()=>jinxTarget(s))};
    return {...as(s,i,()=>botAction({...s,phase:'augment',offers:entry.offers},rng)),player:i};
  }
  if(s.phase==='augment') {
    const rank={choice:3,flick:4,tower:2,line:2,shield:7,hunter:8,solo:6,stride:6,finish:8,forward:4,comeback:5,reroll:6,dopamine:5,aunt:8,banchan:6,stutter:3,recruit:6,trap:5,shove:5,jinx:6,copy:4,swap:5,quake:3,insurance:6,heavy:5,piggy:5,garlic:4,alone:2,kim:4,party:5,trade:3,bundle:3};
    return {type:'augment',id:[...s.offers].sort((a,b)=>(rank[b]??3)-(rank[a]??3))[0]};
  }
  if(s.phase==='jinx')return {type:'jinx',target:jinxTarget(s)};
  const recruits=recruitOptions(s);if(recruits.length)return {type:'recruit',...recruits[0]};
  const traps=trapOptions(s);if(traps.length)return {type:'trap',node:traps[0]};
  const copy=copyOption(s);if(copy&&copy.value>=4)return {type:'copy'};
  if(s.phase==='flick') {
    for(const t of s.players[s.active].tokens)if(NODES[position(t)])for(const e of s.players.flatMap((p,i)=>i===s.active?[]:p.tokens))if(NODES[position(e)]) {
      const a=NODES[position(t)],b=NODES[position(e)],distance=Math.hypot(b.x-a.x,b.y-a.y);
      return {type:'flick',token:t.id,pullX:-(b.x-a.x)/distance*FLICK_MAX_PULL,pullY:-(b.y-a.y)/distance*FLICK_MAX_PULL};
    }
    return {type:'skipFlick'};
  }
  if(s.throws>0)return {type:'roll',value:rng()<.25?1:2};
  const moves=legalMoves(s);
  const score=m=>{
    const victim=s.players.find((p,i)=>i!==s.active&&p.tokens.some(t=>position(t)===m.to));
    const enemy=victim?.tokens.filter(t=>position(t)===m.to).length??0;
    const friend=s.players[s.active].tokens.filter(t=>position(t)===m.to).length;
    const before=s.players[s.active].tokens.find(t=>t.id===m.token);
    const bonus=m.to==='finish'?m.count*35:Math.max(0,m.path.length-before.path.length)*2;
    return bonus+enemy*(victim?.shields?0:25)+friend*8+(m.route==='shortcut'?5:0)+(m.route==='short'?5:0);
  };
  const m=moves.sort((a,b)=>score(b)-score(a))[0];
  return m?{type:'move',token:m.token,result:m.result,route:m.route}:null;
}
