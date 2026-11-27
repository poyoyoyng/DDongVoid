import {AUGMENTS,MILESTONES,NODES,LINES,createGame,act,legalMoves,position,has,label,botAction,dopamineTurnsLeft,dopamineDebuffTurnsLeft,flickFromPull,FLICK_SECONDS,DRAFT_SECONDS,DRAFT_GRACE_MS,FLICK_MAX_PULL,FLICK_MAX_TRAVEL,FLICK_MIN_PULL,recruitOptions,trapOptions,copyOption,swapReady,swapTargets,quakeReady,skillActions,squareLabel,firstCall} from './engine.mjs';
import {throwFaces} from './throw-view.mjs';
import {createChat} from '../chat.js';
const $=id=>document.getElementById(id);
const esc=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
const requestedRoom=new URLSearchParams(location.search).get('room');
const siteRoomId=/^[0-9a-f-]{36}$/.test(requestedRoom??'')?requestedRoom:null;
let siteRoom=null,siteAccount=null,siteSyncing=false,chat=null;
let mode=siteRoomId?'site':'ai',state=createGame(['나','AI 여우','AI 고양이','AI 토끼']),online=null,selectedToken=null,selectedResult=null,busy=Boolean(siteRoomId),botTimer,pollTimer,toastTimer,lastWinner=null,drag=null,onlineError=false,shotAnimation=null,flightFrame=null,seenShot=null,aimAngle=-Math.PI/2,aimPull=FLICK_MAX_PULL/2;
let gameNo=1,shownStart=null,startTimer,flickClock=null,draftClock=null,draftTicker=null,throwAnimation=null,seenRoll=null,throwRevealTimer,throwEndTimer,renderedState=state;
const storage={get(key){try{return JSON.parse(localStorage.getItem(key));}catch{return null;}},set(key,value){try{localStorage.setItem(key,JSON.stringify(value));}catch{}}};
function toast(message){$('toast').textContent=message;$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,4000);}
// The seat this page picks for in the shared draft: my own seat online, player 1 against AI, everyone in turn on one device.
function draftSeat(){
  if(state.phase!=='draft'||!state.draft||busy||shotAnimation||throwAnimation)return null;
  if(siteRoomId)return siteRoom?.status==='playing'&&!siteRoom.paused&&state.draft[online?.player]&&!state.draft[online.player].done?online.player:null;
  const seat=state.draft.findIndex((x,i)=>x&&!x.done&&(mode!=='ai'||i===0));return seat<0?null:seat;
}
function canPlay(){return !busy&&!shotAnimation&&!throwAnimation&&(!siteRoomId||siteRoom?.status==='playing'&&!siteRoom.paused)&&(!online||online.ready&&state.active===online.player)&&!(mode==='ai'&&state.active!==0);}
function stopThrow(){
  clearTimeout(throwRevealTimer);clearTimeout(throwEndTimer);throwAnimation=null;
  $('throw-stage').hidden=true;$('throw-stage').className='throw-stage';$('action-content').hidden=false;
}
function startThrow(name){
  stopThrow();throwAnimation={name,started:performance.now(),event:null,before:renderedState};
  const stage=$('throw-stage');stage.hidden=false;stage.className='throw-stage is-rolling';
  stage.innerHTML=`<p class="throw-owner">${esc(name)} · 윷 던지기</p><div class="toss-sticks" aria-hidden="true">${throwFaces(3).map((face,i)=>`<i class="toss-stick ${face}" style="--i:${i}"></i>`).join('')}</div><div class="throw-outcome"><strong>윷이 구르는 중…</strong><span>어떤 수가 나올까요?</span></div>`;
}
function showThrow(event){
  const name=state.players[event.owner].name;
  if(!throwAnimation||throwAnimation.event)startThrow(name);
  throwAnimation.event=event;const current=throwAnimation;
  const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
  throwRevealTimer=setTimeout(()=>{
    if(throwAnimation!==current)return;
    const stage=$('throw-stage');stage.className='throw-stage is-revealed';
    stage.innerHTML=`<p class="throw-owner">${esc(name)} · ${event.reroll?'다시 던진 결과':'던진 결과'}</p><div class="toss-sticks" aria-hidden="true">${throwFaces(event.value).map((face,i)=>`<i class="toss-stick ${face}" style="--i:${i}"></i>`).join('')}</div><div class="throw-outcome"><strong>${label(event.value)}!</strong><span>${event.value<0?'뒤로 1칸':event.value+'칸 이동'}${event.extra?` · ${event.extra}번 더 던져요!`:''}</span></div>`;
    $('phase-badge').textContent=`${label(event.value)} · 결과`;
    throwEndTimer=setTimeout(()=>{if(throwAnimation!==current)return;stopThrow();render();},event.value===-1?1000:reduced?800:1150);
  },Math.max(0,(reduced?80:760)-(performance.now()-current.started)));
}
function aug(id){return AUGMENTS.find(a=>a.id===id);}
function augmentStatus(p,id){
  if(id==='dopamine'){const buff=dopamineTurnsLeft(p),debuff=dopamineDebuffTurnsLeft(p);return buff>0?`+1칸 ${buff}턴 · 이후 −1칸 ${debuff}턴`:debuff>0?`−1칸 · ${debuff}턴 남음`:'후유증 종료 · 정상 이동';}
  if(id==='aunt')return `잡힘 면역 ${p.immunity??0}/3회`;
  if(id==='recruit')return p.recruitUsed?'판당 1회 · 사용 완료':'판당 1회 · 미사용';
  if(id==='shield')return `호신부 ${p.shields}/2회`;
  if(id==='copy')return `따라하기 ${p.copies??0}/3회`;
  if(id==='insurance')return `보험 ${p.insurance??0}/2회`;
  if(id==='swap')return p.swapUsed?'판당 1회 · 사용 완료':'판당 1회 · 완주가 뒤질 때';
  if(id==='quake')return p.quakeUsed?'판당 1회 · 사용 완료':'판당 1회 · 미사용';
  if(id==='trap')return '3의 배수 턴마다 덫 · 최대 2개';
  if(id==='garlic')return `마늘 ${4-(p.garlic?.length??4)}/4개`;
  if(id==='kim')return p.kimDoneTurn?(p.kimDoneTurn<=p.kimUntil?'김첨지 완주!':'김첨지 시간 초과'):Number.isInteger(p.kimToken)?`${p.kimToken+1}번 말 · ${p.kimUntil}번째 턴까지 완주`:'';
  if(id==='trade'||id==='bundle'||id==='excess')return `말 ${p.tokens.length}개 · 윷가락 ${p.sticks??4}개`;
  if(p.uses&&id in p.uses)return `${p.uses[id]}회 남음`;
  if(id==='cult')return `의식 코인 ${p.coins??0}/12`;
  if(id==='coup')return `잡은 말 ${p.coupKills??0}/4`;
  if(id==='lonely')return `${(p.caughtBy??[]).length}명에게 잡힘`;
  if(id==='score')return `악보 ${[-1,1,2,3,4,5].filter(v=>p.thrown?.includes(v)).length}/6`;
  if(id==='fisher')return `다음 차례 개 ${p.fishBonus??0} · ${p.fishCount??0}/2`;
  if(id==='vanguard'&&Number.isInteger(p.vanguard))return `선봉장 ${p.vanguard+1}번 말`;
  if(id==='marathon'&&Number.isInteger(p.marathon))return `마라토너 ${p.marathon+1}번 말`;
  if(id==='chalice')return p.chaliceTurn===p.turn?'이번 차례에 마심 · 모 조심!':'차례마다 1회';
  return '';
}
function currentMoves(){return legalMoves(state).filter(m=>m.result===selectedResult&&m.token===selectedToken);}
function tokenName(id){return `${id+1}번 말`;}
function squareName(node){return node==='c'?'중앙':node==='o0'?'출발·도착 칸':node.startsWith('o')?`${node.slice(1)}번 칸`:'지름길 칸';}
function locationName(node){return node==='finish'?'완주':node==='home'?'대기':node==='c'?'중앙':node==='o0'?'도착 칸':node==='o5'||node==='o10'||node==='o15'?'모서리':'밝게 표시된 칸';}
function renderPlayers(view=state){
  const state=view;
  const cards=Array.from({length:4},(_,i)=>{
    const p=state.players[i];
    if(!p||online&&!online.ready&&i>=online.names.length)return `<section class="player-card empty-seat"><span class="empty-icon">＋</span><p>플레이어 ${i+1}</p><small>${online&&!online.ready&&i<online.maxPlayers?'참가 대기':'빈 자리'}</small></section>`;
    const done=p.tokens.filter(t=>t.done).length,home=p.tokens.filter(t=>position(t)==='home').length,onBoard=p.tokens.length-done-home;
    return `<section class="player-card ${['blue','red','purple','golden'][i]} ${state.active===i?'active':''}" aria-label="${esc(p.name)} 상태"><div class="player-head"><div class="avatar">${['◈','◆','✦','◉'][i]}</div><div><div class="player-name">${esc(p.name)}</div><div class="player-tag">PLAYER 0${i+1}${mode==='ai'&&i!==0?' / AI':''}</div></div>${state.active===i?'<span class="turn-chip">● NOW</span>':''}</div><div class="score-row"><span>완주한 말</span><strong>${done} <span>/ ${p.tokens.length}</span></strong></div><div class="progress-track">${p.tokens.map(t=>`<i class="progress-part ${t.done?'done':''}"></i>`).join('')}</div><div class="token-tray">${p.tokens.map(t=>`<button class="reserve-token ${position(t)==='home'?'home-token':t.done?'finished-token':'on-board-token'} ${i===state.active&&selectedToken===t.id?'selected':''}" data-token="${t.id}" data-owner="${i}" ${!canPlay()||i!==state.active||t.done?'disabled':''} title="${position(t)==='home'?'창고 · 미사용':t.done?'완주':'말판 · 사용 중'}" aria-label="${esc(p.name)} ${t.id+1}번 말, ${position(t)==='home'?'창고 · 미사용':t.done?'완주':'말판 · 사용 중'}">${t.done?'✓':t.id+1}</button>`).join('')}</div><p class="token-count"><span class="home-count">창고 <strong>${home}</strong></span><span>사용 중 <strong>${onBoard}</strong></span></p><div class="augments">${Array.from({length:Math.max(MILESTONES.length,p.augments.length)},(_,j)=>MILESTONES[j]).map((turn,j)=>p.augments[j]?`<button class="aug-slot filled" data-aug-info="${p.augments[j]}" data-aug-owner="${i}" title="${esc(aug(p.augments[j]).desc)} ${esc(augmentStatus(p,p.augments[j]))}"><span class="aug-icon ${aug(p.augments[j]).tier}">${aug(p.augments[j]).icon}</span><span class="aug-desc">${aug(p.augments[j]).name}${augmentStatus(p,p.augments[j])?`<small class="augment-counter">${augmentStatus(p,p.augments[j])}</small>`:''}</span></button>`:`<div class="aug-slot"><span class="aug-icon">◇</span><span class="aug-desc">${turn}턴에 열리는 증강</span></div>`).join('')}</div><p class="player-foot">${p.turn}번째 턴${p.shields?` · 호신부 ${p.shields}회`:''}${p.boost?` · 추격 +${p.boost}칸`:''}${p.augments.includes('aunt')?`<br>${augmentStatus(p,'aunt')}`:''}${p.augments.includes('dopamine')?`<br>도파민 ${augmentStatus(p,'dopamine')}`:''}${p.augments.includes('recruit')?`<br>집결 ${p.recruitUsed?'사용 완료':'1회 남음'}`:''}${p.skip?`<br><span class="jinx-note">⏸ 차례 ${p.skip}번 쉼</span>`:''}${p.domain?`<br><span class="kim-note">⬚ 영역 전개 ${p.domain.token+1}번 말 · ${p.domain.until}번째 턴 시작까지</span>`:''}${(p.jinxUntil??0)>p.turn||(p.jinxUntil??0)===p.turn&&state.active===i?`<br><span class="jinx-note">☁ 징크스 · ${p.jinxUntil}번째 턴까지 윷·모→걸</span>`:''}${p.augments.includes('kim')&&Number.isInteger(p.kimToken)&&!p.kimDoneTurn&&p.turn<=p.kimUntil?`<br><span class="kim-note">☂ 김첨지 ${p.kimToken+1}번 말 · ${p.kimUntil}번째 턴까지</span>`:''}</p></section>`;
  });
  $('players-left').innerHTML=[cards[0],cards[2]].join('');
  $('players-right').innerHTML=[cards[1],cards[3]].join('');
  $('board-legend').innerHTML=state.players.filter((_,i)=>!online||online.ready||i<online.names.length).map((p,i)=>`<span><i class="legend p${i}"></i>${esc(p.name)}</span>`).join(' ');
}
function renderBoard(view=state){
  const state=view;
  let svg='<defs><marker id="aim-arrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto"><path d="M0 0L6 3L0 6" fill="none" stroke="#c4ed89" stroke-width="1.5"/></marker><pattern id="grain" width="9" height="9" patternUnits="userSpaceOnUse"><circle cx="2" cy="4" r=".55" fill="#bacb8b" opacity=".055"/></pattern></defs><rect class="board-surface" x="35" y="35" width="570" height="570" rx="26"/><rect x="35" y="35" width="570" height="570" rx="26" fill="url(#grain)"/>';
  for(const l of LINES)svg+=`<polyline class="board-path ${l[0]==='o5'&&l.includes('c')||l[0]==='o10'&&l.includes('c')?'board-diag':''}" points="${l.map(n=>`${NODES[n].x},${NODES[n].y}`).join(' ')}"/>`;
  svg+='<path class="board-ornament" d="M49 120V62Q49 49 62 49H120 M520 49H578Q591 49 591 62V120 M49 520V578Q49 591 62 591H120 M520 591H578Q591 591 591 578V520"/>';
  svg+='<text class="board-copy" x="320" y="170">LUCK MEETS STRATEGY</text><text class="board-copy main" x="320" y="216">증윷</text><text class="board-copy" x="320" y="465">THROW YOUR OWN STORY</text>';
  for(const [id,n] of Object.entries(NODES)) {
    const special=['o0','o5','o10','o15'].includes(id);
    svg+=`<circle class="board-node ${special?'board-corner':''} ${id==='c'?'board-center':''}" cx="${n.x}" cy="${n.y}" r="${special||id==='c'?20:13}"/>`;
    if(special)svg+=`<circle class="board-ornament" cx="${n.x}" cy="${n.y}" r="26"/>`;
    if(id==='o0')svg+='<text class="node-label" x="560" y="613">출발 / 도착</text>';
    if(id==='c')svg+='<text class="node-label" x="320" y="324">✳</text>';
  }
  if(state.flick){const [a,b]=state.flick.trail;svg+=`<line class="shot-line" x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}"/>`;}
  for(let owner=0;owner<state.players.length;owner++) {
    const groups=new Map();for(const t of state.players[owner].tokens){const node=position(t);if(NODES[node])groups.set(node,[...(groups.get(node)||[]),t]);}
    for(const [node,tokens] of groups){if(shotAnimation&&owner===shotAnimation.shot.owner&&(node===shotAnimation.shot.sourceNode||shotAnimation.shot.outcome==='hit'&&node===shotAnimation.shot.hit))continue;const n=NODES[node],id=tokens[0].id,selected=owner===state.active&&selectedToken!==null&&tokens.some(t=>t.id===selectedToken);
      svg+=`<g class="piece ${['blue','red','purple','golden'][owner]} ${selected?'selected':''}" data-piece="${id}" data-owner="${owner}" role="button" tabindex="0" aria-label="${esc(state.players[owner].name)} ${tokens.map(t=>t.id+1).join('·')}번 말, ${tokens.length}개 묶음" transform="translate(${n.x} ${n.y})">${selected?'<circle class="selection-ring" r="29"/>':''}${tokens.some(t=>t.shielded)?'<circle class="shield-ring" r="27"/>':''}${tokens.some(t=>t.soul)?'<circle class="soul-ring" r="31"/>':''}${tokens.some(t=>(t.frozenUntil??0)>0&&t.frozenUntil>=state.players[owner].turn||state.players[owner].domain?.token===t.id)?'<circle class="frozen-ring" r="24"/>':''}${tokens.length>1?'<circle class="stack-ring" r="26"/>':''}<circle r="21"/><text>${tokens.length>1?'×'+tokens.length:id+1}</text><text class="piece-label">${tokens.length>1?tokens.map(t=>t.id+1).join(' · '):''}</text></g>`;
    }
  }
  for(const shot of state.snipes??[]){const n=NODES[shot.node];svg+=`<g class="snipe" transform="translate(${n.x} ${n.y})" aria-hidden="true"><circle r="35"/><text y="-36">⌖</text></g>`;}
  if(state.reaper){const n=NODES[state.reaper.node];svg+=`<g class="reaper" transform="translate(${n.x} ${n.y})" aria-hidden="true"><text x="23" y="23">☠</text></g>`;}
  state.players.forEach((p,owner)=>{if(p.bonfire){const n=NODES[p.bonfire.node];svg+=`<g class="bonfire" transform="translate(${n.x} ${n.y})" aria-hidden="true"><text x="-23" y="23">♨</text></g>`;}});
  for(const trap of state.traps??[]){const n=NODES[trap.node];if(trap.kind==='poop'){svg+=`<g class="poop" transform="translate(${n.x} ${n.y})" aria-hidden="true"><text x="-23" y="-23">◉</text></g>`;continue;}svg+=`<g class="trap ${['blue','red','purple','golden'][trap.owner]} ${trap.kind??''}" transform="translate(${n.x} ${n.y})" aria-hidden="true"><circle r="30"/><text x="23" y="-23">${trap.kind==='reward'?'★':'⚠'}</text></g>`;}
  state.players.forEach((p,owner)=>{for(const node of p.garlic??[]){const n=NODES[node];svg+=`<g class="garlic ${['blue','red','purple','golden'][owner]}" transform="translate(${n.x} ${n.y})" aria-hidden="true"><text x="-22" y="-22">❦</text></g>`;}});
  if(canPlay())for(const [idx,m] of currentMoves().entries()) {
    const n=NODES[m.to]??(m.to==='finish'?{x:603,y:587}:{x:604,y:529});
    svg+=`<g class="destination" data-move="${idx}" role="button" tabindex="0" aria-label="${m.steps}칸 이동, ${locationName(m.to)}, ${m.route==='shortcut'?'지름길':m.route==='long'?'긴 길':'이동'}"><circle cx="${n.x}" cy="${n.y}" r="26"/><text x="${n.x}" y="${n.y}">${m.to==='finish'?'⚑':'✓'}</text></g>`;
  }
  if(shotAnimation){
    const shot=shotAnimation.shot,source=NODES[shot.sourceNode],colors=['blue','red','purple','golden'];
    svg+=`<g id="flying-piece" class="piece ${colors[shot.owner]} flight-disc" transform="translate(${source.x} ${source.y})"><circle r="21"/><text>${shot.sourceTokens.length>1?'×'+shot.sourceTokens.length:shot.sourceTokens[0]+1}</text></g>`;
    if(shot.outcome==='hit'){const target=NODES[shot.hit];svg+=`<g id="knocked-piece" class="piece ${colors[shot.victim]} flight-disc" transform="translate(${target.x} ${target.y})"><circle r="21"/><text>${shot.victimTokens.length>1?'×'+shot.victimTokens.length:shot.victimTokens[0]+1}</text></g>`;}
  }
  svg+='<line id="pull-tether" class="pull-tether" x1="0" y1="0" x2="0" y2="0"/><circle id="pull-handle" class="pull-handle" r="0" cx="0" cy="0"/><line id="aim" class="aim-line" x1="0" y1="0" x2="0" y2="0"/>';
  $('board').innerHTML=svg;
}
function renderAction(view=state){
  const state=view;
  const p=state.players[state.active],mine=canPlay(),phase=state.phase;
  $('action-content').hidden=Boolean(throwAnimation);
  $('phase-badge').textContent=!online?.ready&&online?'대기 중':phase==='won'?'게임 종료':phase==='augment'||phase==='draft'?'증강 선택':phase==='flick'?'알까기':phase==='jinx'?'징크스':state.throws>0?'던지기':'말 이동';
  let html='';
  if(siteRoomId&&!siteRoom)html='<h2 class="action-title">대전방에 연결하고 있어요</h2><p class="action-hint">현재 계정과 판을 확인합니다.</p>';
  else if(siteRoom?.paused)html='<h2 class="action-title">빈 자리를 기다려요</h2><p class="action-hint">대전방에서 빈자리에 참가하면 이어집니다.</p>';
  else if(siteRoom?.status==='waiting')html=`<h2 class="action-title">준비되면 시작!</h2><p class="action-hint">2~4명 개인전 · 모두 준비 완료를 누르면 시작합니다.</p>${online.player>=0?`<button class="primary full" data-action="siteReady">${siteRoom.players[online.player].ready?'준비 취소':'준비 완료'} →</button>`:siteRoom.players.length<4?'<button class="primary full" data-action="siteJoin">참가하기 →</button>':'<p class="action-hint">관전 중입니다.</p>'}`;
  else if(shotAnimation)html=`<h2 class="action-title">${shotAnimation.shot.outcome==='miss'?'앗, 빗나갔어요!':shotAnimation.shot.outcome==='blocked'?'상대가 막았어요!':'제대로 맞았다!'}</h2><p class="action-hint">${shotAnimation.shot.outcome==='miss'?'날아간 내 말이 대기로 돌아갑니다.':shotAnimation.shot.outcome==='blocked'?'양쪽 말은 제자리에 남습니다.':'상대 묶음 탈락! 그 자리를 차지하고 턴이 끝나요.'}</p>`;
  else if(online&&!online.ready)html=`<h2 class="action-title">${online.names.length}명이 모였어요.</h2><p class="action-hint">초대 코드로 최대 ${online.maxPlayers}명까지 참가할 수 있어요.<br>${online.player===0?'2명 이상 모이면 원하는 때 시작하세요.':'방장이 시작하면 개인전이 시작됩니다.'}</p>${online.player===0?`<button class="primary full" data-action="startRoom" ${online.names.length<2||busy?'disabled':''}>${online.names.length}명으로 시작하기 →</button>`:''}`;
  else if(phase==='won')html=`<h2 class="action-title">${esc(state.players[state.winner].name)} 승리!</h2><p class="action-hint">${esc(state.winReason)}</p>${againPanel()}`;
  else if(phase==='augment')html=`<div class="waiting-mark">✧</div><h2 class="action-title">전략이 바뀌는 순간</h2><p class="action-hint">${esc(p.name)}의 ${p.turn}번째 턴.<br>${mine?'세 가지 증강 중 하나를 선택하세요.':'상대가 증강을 고르고 있습니다.'}</p>${mine?'<button class="primary full" data-action="draft">증강 선택하기 →</button>':''}`;
  else if(phase==='draft')html=`<div class="waiting-mark">✧</div><h2 class="action-title">모두 증강을 고르는 중</h2><p class="action-hint">모두 고르면 ${esc(p.name)}의 차례로 이어집니다.</p><p class="draft-timer" data-draft-timer role="timer"></p><ul class="draft-status">${state.players.map((o,i)=>state.draft?.[i]?`<li class="${state.draft[i].done?'done':''}">${esc(o.name)} · ${state.draft[i].done?'선택 완료 ✓':state.draft[i].stage==='jinx'?'징크스 대상 고르는 중…':'고르는 중…'}</li>`:'').join('')}</ul>${draftSeat()!==null?'<button class="primary full" data-action="draft">증강 선택하기 →</button>':''}`;
  else if(phase==='jinx')html=`<div class="waiting-mark">☁</div><h2 class="action-title">징크스를 걸 상대는?</h2><p class="action-hint">${mine?'지목한 상대는 다음 3턴 동안 윷·모가 나오면 걸로 바뀝니다.':`${esc(p.name)}이(가) 징크스 대상을 고르고 있습니다.`}</p>${mine?state.players.map((o,i)=>i===state.active?'':`<button class="primary full" data-jinx="${i}">${esc(o.name)}에게 징크스 →</button>`).join(''):''}`;
  else if(phase==='flick') {
    html=`<h2 class="action-title">당기고, 놓고, 날려요!</h2><p id="flick-help" class="action-hint">${mine?'내 알을 뒤로 당겼다 놓으면 반대 방향으로 날아갑니다. 길게 당길수록 강해져요. 빗나가면 내 묶음이 탈락합니다!':'상대가 알까기를 조준하고 있습니다.'}</p>`;
    html=flickTimer(state)+html;
    if(mine){html+='<div class="flick-power"><span id="flick-power-label">파워 0%</span><progress id="flick-power-bar" max="100" value="0" aria-label="알까기 파워"></progress></div><p class="inline-help">알을 선택하고 방향키로 조준·파워 조절, Space로 발사할 수도 있어요.</p><button class="secondary full" data-action="skipFlick">이번 알까기 넘기기</button>';}
  }else {
    html=`<div class="yut-sticks" aria-hidden="true"><i class="stick flat"></i><i class="stick flat"></i><i class="stick round"></i><i class="stick flat"></i></div><h2 class="action-title">${mine?state.throws>0?'당신의 한 수.':'어디로 갈까요?':mode==='ai'?'AI가 생각 중…':'상대의 차례예요'}</h2><p class="action-hint">${mine?state.pending.length?'결과 → 내 말 → 밝게 표시된 목적지 순서로 선택하세요.':'도·개·걸·윷·모, 당신의 운을 던져보세요.':`${esc(p.name)}의 다음 수를 기다리고 있습니다.`}</p>`;
    if(state.pending.length){if(mine&&has(state,state.active,'stutter'))html+='<p class="inline-help">“성어말?” 이동 확정 후 각각 15% 확률로 +1·−1칸 더듬습니다. 밝은 칸은 예정 목적지예요.</p>';html+=`<div class="result-list">${state.pending.map(r=>`<button class="result ${selectedResult===r.id?'chosen':''}" data-result="${r.id}" ${!mine?'disabled':''}>${label(r.value)} <small>${r.value<0?'−1':r.value}</small></button>`).join('')}</div>`;
      const r=state.pending.find(r=>r.id===selectedResult);
      if(mine&&has(state,state.active,'reroll')&&!p.rerolled&&r&&r.value<4)html+=`<div class="result-tools">${has(state,state.active,'choice')?'<button data-reroll-choice="1">⟳ 도로 변경</button> · <button data-reroll-choice="2">개로 변경</button>':'<button data-action="reroll">⟳ 선택한 결과 다시 던지기</button>'}</div>`;
    }
    if(mine&&state.throws>0)html+=has(state,state.active,'choice')?'<div class="choice-buttons"><button class="primary" data-roll-choice="1">도 <small>1칸</small></button><button class="primary" data-roll-choice="2">개 <small>2칸</small></button></div>':`<button class="primary full" data-action="roll" ${busy?'disabled':''}>윷 던지기 <span>↗</span></button>`;
    if(mine&&state.throws>0&&state.pending.length)html+=`<p class="inline-help">추가 던지기 ${state.throws}회 · 결과를 모으거나 먼저 이동할 수 있어요.</p>`;
    if(mine&&selectedToken!==null&&state.pending.length){html+=`<p class="inline-help">${tokenName(selectedToken)} 선택됨</p>`;for(const [i,m] of currentMoves().entries())html+=`<button class="move-option" data-move="${i}"><span>${m.route==='shortcut'?'지름길':m.route==='short'?'빠른 출구':m.route==='long'?'왼쪽 경유':'이동'} · ${m.steps===-1?'뒤로 1':m.steps}칸</span><span>${m.to==='finish'?'완주 ⚑':m.to==='home'?'대기로':'이동 →'}</span></button>`;}
  }
  if(mine)html+=skillPanel(state);
  if(mine){const options=recruitOptions(state);if(options.length)html+=`<section class="recruit-skill"><strong>♙ 뒹학 사람좀 모아봐</strong><p>완주 2개! 창고 말을 업고 이번 턴을 끝낼 수 있어요.</p>${options.map(o=>`<button class="primary full" data-recruit-reserve="${o.reserve}" data-recruit-target="${o.target}">${o.reserve+1}번 → ${o.target+1}번에 업고 턴 종료</button>`).join('')}<small>판당 한 번 · 남은 이동과 추가 던지기는 사라집니다.</small></section>`;}
  const event=state.log.find(text=>!text.endsWith('번째 턴'));
  $('action-content').innerHTML=(event&&(!online||online.ready)?`<p class="action-event">${esc(event)}</p>`:'')+html;
  if(flickClock&&!flickClock.frame&&phase==='flick'&&!shotAnimation)flickClock.frame=requestAnimationFrame(tickFlick);
}
// The clock starts when this page first shows the flick, so throw and flight animations never eat into the 3 seconds.
const flickTime=FLICK_SECONDS*1000,flickKey=view=>`${view.round}:${view.active}:${view.players[view.active].turn}`;
function flickTimer(view){
  const key=flickKey(view);
  if(flickClock?.key!==key){if(flickClock?.frame)cancelAnimationFrame(flickClock.frame);flickClock={key,endsAt:performance.now()+flickTime,frame:null,sent:false};}
  const left=Math.max(0,flickClock.endsAt-performance.now());
  return `<div id="flick-timer" class="flick-timer ${left<=1000?'urgent':''}" role="timer" aria-label="알까기 남은 시간"><div><strong id="flick-seconds">${Math.ceil(left/1000)}</strong><span>초</span></div><i class="flick-timer-track"><b id="flick-timer-bar" style="transform:scaleX(${left/flickTime})"></b></i><p>${FLICK_SECONDS}초 안에 쏘지 않으면 턴이 끝나요!</p></div>`;
}
function tickFlick(){
  const clock=flickClock;if(!clock)return;clock.frame=null;
  if(state.phase!=='flick'||flickKey(state)!==clock.key)return;
  const left=Math.max(0,clock.endsAt-performance.now());
  if($('flick-seconds')){$('flick-seconds').textContent=Math.ceil(left/1000);$('flick-timer').classList.toggle('urgent',left<=1000);$('flick-timer-bar').style.transform=`scaleX(${left/flickTime})`;}
  // A request already in flight (a shot being sent) gets to finish before the clock decides.
  if(left>0||!clock.sent&&busy){clock.frame=requestAnimationFrame(tickFlick);return;}
  if(!clock.sent&&canPlay()){clock.sent=true;drag=null;send({type:'flickTimeout'});}
}
function skillPanel(state){
  const p=state.players[state.active],groupName=node=>p.tokens.filter(t=>position(t)===node).map(t=>t.id+1).join('·')+'번 말';
  let html='';
  const traps=trapOptions(state);
  if(traps.length)html+=`<section class="recruit-skill"><strong>⚠ 밤길 조심해</strong><p>내 말이 선 칸에 덫을 놓아요. 상대가 그 칸에 멈추면 대기로 돌아가요.</p>${traps.map(node=>`<button class="primary full" data-trap="${node}">${groupName(node)} 자리에 덫 놓기</button>`).join('')}</section>`;
  const copy=copyOption(state);
  if(copy)html+=`<section class="recruit-skill"><strong>⧉ 따라쟁이</strong><p>${esc(state.players[copy.from].name)}의 마지막 결과를 그대로 가져와요. 추가 던지기는 없어요.</p><button class="primary full" data-action="copyRoll">${label(copy.value)} 따라 하기 (${p.copies}/3회)</button></section>`;
  if(quakeReady(state))html+='<section class="recruit-skill"><strong>≋ 지진났다</strong><p>판 위의 모든 말이 1칸씩 뒤로! 판당 한 번이에요.</p><button class="primary full" data-action="quake">지진 일으키기</button></section>';
  if(swapReady(state)) {
    const ready=selectedToken!==null&&NODES[position(p.tokens[selectedToken])],targets=ready?swapTargets(state,selectedToken):[];
    html+=`<section class="recruit-skill"><strong>⇄ 자리 바꿔줘</strong><p>${ready?`${tokenName(selectedToken)}과 자리를 바꿀 상대 말을 고르세요. 바꾸면 턴이 끝나요.`:'판 위의 내 말을 먼저 고르면 바꿀 상대 말이 나와요.'}</p>${targets.map(x=>`<button class="primary full" data-swap-owner="${x.owner}" data-swap-target="${x.token}">${esc(state.players[x.owner].name)} ${x.count>1?`${x.count}개 묶음`:`${x.token+1}번 말`} · ${squareName(x.node)}</button>`).join('')}</section>`;
  }
  const skills=skillActions(state,selectedToken),groups=new Map();
  skills.forEach((o,k)=>groups.set(o.id,[...(groups.get(o.id)??[]),{...o,k}]));
  for(const [id,list] of groups){const a=aug(id);html+=`<section class="recruit-skill"><strong>${a.icon} ${esc(a.name)}</strong>${list.map(o=>o.action?`<button class="primary full" data-skill="${o.k}">${esc(o.label)}</button>`:`<p>${esc(o.label)}</p>`).join('')}</section>`;}
  return html;
}
// Each new game opens with a short announcement of who goes first.
function announceStart(){
  const key=siteRoomId?(siteRoom&&['playing','finished'].includes(siteRoom.status)?`site:${siteRoom.match}`:null):`local:${gameNo}`;
  if(!key||key===shownStart||!Number.isInteger(state.first)||state.round!==1)return;
  shownStart=key;const banner=$('start-banner');
  banner.innerHTML=`<strong>${esc(firstCall(state.players[state.first].name))} 선!</strong><span>시계 방향으로 차례가 돌아갑니다</span>`;
  banner.hidden=false;banner.classList.remove('show');void banner.offsetWidth;banner.classList.add('show');
  clearTimeout(startTimer);startTimer=setTimeout(()=>{banner.hidden=true;},2800);
}
function render(){
  announceStart();
  clearTimeout(botTimer);
  if(state.lastRoll&&state.lastRoll.id!==seenRoll){seenRoll=state.lastRoll.id;showThrow(state.lastRoll);}
  if(!state.flick&&shotAnimation)stopFlight();
  if(state.flick?.sourceTokens&&state.flick.id!==seenShot){seenShot=state.flick.id;shotAnimation={shot:state.flick,started:performance.now()};}
  const view=throwAnimation?.before??state;
  if(!throwAnimation)renderedState=state;
  if(!view.pending.some(r=>r.id===selectedResult))selectedResult=view.pending[0]?.id??null;
  if(selectedToken!==null){const t=view.players[view.active].tokens[selectedToken];if(!t||t.done)selectedToken=null;}
  renderPlayers(view);renderBoard(view);renderAction(view);syncDraftClock();
  if(throwAnimation)$('phase-badge').textContent=throwAnimation.event&&$('throw-stage').classList.contains('is-revealed')?`${label(throwAnimation.event.value)} · 결과`:'윷 던지는 중';
  if(shotAnimation){$('phase-badge').textContent='알까기 비행 중';if(!flightFrame)flightFrame=requestAnimationFrame(animateFlight);}else if(view.phase==='flick'&&selectedToken!==null&&canPlay())showAim(-Math.cos(aimAngle)*aimPull,-Math.sin(aimAngle)*aimPull);
  $('board-status').textContent=view.phase==='won'?'A BEAUTIFUL FINISH':online&&!online.ready?'WAITING FOR A FRIEND':`${view.players[view.active].name}의 차례`;
  $('turn-label').textContent=`${view.players[view.active].turn}번째 턴`;
  $('milestones').innerHTML='<div class="milestone-row">'+MILESTONES.map((t,i)=>`${i?'<i class="mile-line"></i>':''}<span class="mile ${view.players[view.active].augments.length>i?'done':''}">${t}</span>`).join('')+'</div>';
  $('game-log').innerHTML=view.log.slice(0,10).map((text,i)=>`<li>${i===0?'↳ ':''}${esc(text)}</li>`).join('');
  $('online-banner').hidden=!online;
  if(online&&!siteRoomId)$('online-banner').innerHTML=`<span>초대 코드 <strong>${online.code}</strong> ${online.ready?`· 나는 ${esc(view.players[online.player].name)}`:`· 참가 ${online.names.length}/${online.maxPlayers}명`}</span><span class="connection-status ${onlineError?'danger':''}">${onlineError?'연결 확인 중…':'● 연결됨'}</span><button class="secondary" data-action="copy">초대 링크 복사 ↗</button>`;
  if(siteRoomId&&online)$('online-banner').innerHTML=`<span>${esc(siteRoom.title)} · ${online.player<0?'관전 중':`나는 ${esc(siteAccount.name)}`}</span><a class="secondary" href="/#room/${siteRoomId}">대전방 ↗</a>`;
  const showDraft=(view.phase==='augment'&&canPlay()||view.phase==='draft'&&draftSeat()!==null)&&!$('setup-dialog').open;
  if(showDraft){renderDraft();if(!$('augment-dialog').open)$('augment-dialog').showModal();}else $('augment-dialog').close();
  if(view.phase==='won'&&lastWinner!==view.winner){lastWinner=view.winner;$('winner-name').textContent=`${view.players[view.winner].name}, 승리!`;$('winner-reason').textContent=view.winReason;$('winner-dialog').showModal();}
  scheduleBot();
}
// After a finished game: online everyone presses 다시하기 (ready) and the room starts the next match; offline it restarts at once.
function againPanel(){
  if(!siteRoomId)return '<button class="primary full" data-action="again">다시하기 →</button><button class="secondary full" data-action="new">설정 바꿔 새 판 열기</button>';
  if(!siteRoom||online?.player<0)return '<p class="action-hint">관전 중입니다. 참가자들이 다시하기를 누르면 다음 판이 시작됩니다.</p>';
  const ready=siteRoom.players[online.player].ready;
  return `<button class="primary full" data-action="siteReady">${ready?'다시하기 취소':'다시하기 →'}</button><ul class="draft-status">${siteRoom.players.map(p=>`<li class="${p.ready?'done':''}">${esc(p.name)} · ${p.ready?'다시하기 ✓':'기다리는 중'}</li>`).join('')}</ul><p class="action-hint">모두 다시하기를 누르면 바로 다음 판이 시작됩니다.</p>`;
}
function playAgain(){
  $('winner-dialog').close();
  if(siteRoomId){if(online?.player>=0&&!siteRoom?.players[online.player]?.ready)send({type:'siteReady'});else render();return;}
  if(online)return openSetup();
  stopFlight();stopThrow();clearTimeout(botTimer);seenRoll=null;seenShot=null;drag=null;selectedToken=null;selectedResult=null;lastWinner=null;
  state=createGame(state.players.map(p=>p.name),state.backdo);gameNo++;render();
}
// Draft countdown: online it follows the room's deadline (the room picks when it runs out); offline this page keeps the time and picks itself.
function draftLeft(){
  if(siteRoomId)return siteRoom?.deadline?Math.max(0,siteRoom.deadline-DRAFT_GRACE_MS-Date.now()):null;
  return draftClock?Math.max(0,draftClock.endsAt-Date.now()):null;
}
function syncDraftClock(){
  if(state.phase!=='draft'){clearInterval(draftTicker);draftTicker=null;draftClock=null;return;}
  const key=`${state.round}:${state.players[state.first??state.active].turn}`;
  if(!siteRoomId&&draftClock?.key!==key)draftClock={key,endsAt:Date.now()+DRAFT_SECONDS*1000,sent:false};
  if(!draftTicker)draftTicker=setInterval(tickDraft,250);
  tickDraft();
}
function tickDraft(){
  if(state.phase!=='draft')return syncDraftClock();
  const left=draftLeft();
  for(const el of document.querySelectorAll('[data-draft-timer]')) {
    el.classList.toggle('urgent',left!==null&&left<=5000);
    el.innerHTML=left===null?'':`⏱ <strong>${Math.ceil(left/1000)}</strong>초 안에 고르지 않으면 맨 앞 증강이 자동으로 골라져요`;
  }
  if(!siteRoomId&&left===0&&!draftClock.sent&&!busy){draftClock.sent=true;send({type:'draftTimeout'},true);}
}
function renderDraft(){
  const seat=state.phase==='draft'?draftSeat():state.active,entry=state.phase==='draft'?state.draft[seat]:{offers:state.offers,rerolls:state.players[seat].draftRerolls},p=state.players[seat];
  $('draft-subtitle').textContent=`${p.name} · ${(p.drafts??p.augments.length)+(entry.stage?0:1)} / 3 증강${state.phase==='draft'?' · 모두 동시에 고르는 중':''}`;
  if(entry.stage==='jinx'){$('augment-options').innerHTML=state.players.map((o,i)=>i===seat?'':`<button class="augment-choice gold" data-jinx="${i}"><span class="aug-icon">☁</span><span class="aug-kind">JINX / 저주</span><strong>${esc(o.name)}</strong><p>다음 3턴 동안 윷·모가 걸로 바뀝니다.</p><span class="pick-label">징크스 걸기 ↗</span></button>`).join('');$('draft-reroll').hidden=true;return;}
  $('draft-reroll').hidden=false;
  $('augment-options').innerHTML=entry.offers.map(id=>{const a=aug(id);return `<button class="augment-choice ${a.tier}" data-augment="${a.id}"><span class="aug-icon">${a.icon}</span><span class="aug-kind">${a.tier==='prism'?'PRISMATIC':a.tier==='gold'?'GOLD':'SILVER'} / ${a.kind}</span><strong>${a.name}</strong><p>${a.desc}</p><span class="pick-label">이 증강 선택하기 ↗</span></button>`;}).join('');
  $('draft-reroll').disabled=busy||entry.rerolls<=0;$('draft-reroll').textContent=`⟳ 다시 제안받기 (${entry.rerolls}/1)`;
}
async function api(path,{method='GET',data,auth}={}){
  const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),9000);
  try{const res=await fetch(path,{method,headers:{...(data?{'Content-Type':'application/json'}:{}),...(auth?{Authorization:`Bearer ${auth}`}:{})},body:data?JSON.stringify(data):undefined,signal:controller.signal});const result=await res.json();if(!res.ok)throw Error(result.error||'연결에 실패했습니다.');return result;}finally{clearTimeout(timeout);}
}
function applySnapshot(snap){
  if(!online||snap.code!==online.code||snap.version<online.version)return;
  const changed=snap.version!==online.version;
  online.version=snap.version;online.ready=snap.ready;online.names=snap.names;online.maxPlayers=snap.maxPlayers;onlineError=false;
  if(!snap.state)state=createGame([...snap.names,...Array.from({length:Math.max(0,2-snap.names.length)},()=>'참가 대기')],state.backdo,()=>0);
  if(snap.state){const before=state.active;state=snap.state;if(changed&&before!==state.active)selectedToken=null;}
  if(changed)render();
}
async function send(action,fromBot=false){
  if(busy||(!fromBot&&!canPlay()&&!(state.phase==='draft'&&draftSeat()!==null)&&!(siteRoomId&&['siteReady','siteJoin'].includes(action.type))&&!(action.type==='startRoom'&&online?.player===0&&!online.ready)))return;
  busy=true;clearTimeout(botTimer);
  const throwing=['roll','reroll'].includes(action.type);
  if(throwing){startThrow(state.players[state.active].name);render();}
  try{
    if(siteRoomId){
      const input=action.type==='siteReady'?{action:'ready',ready:!siteRoom.players[online.player].ready}:action.type==='siteJoin'?{action:'join'}:{action:'yut',move:action,gameRevision:state.revision,match:siteRoom.match,seatEpoch:siteRoom.seatEpoch};
      const data=await api(`/api/rooms/${siteRoomId}/action`,{method:'POST',data:input});acceptSiteRoom(data.room);
    }else if(online){const snap=await api(`/api/rooms/${online.code}/${action.type==='startRoom'?'start':'action'}`,{method:'POST',data:{version:online.version,action},auth:online.token});applySnapshot(snap);}
    else {const before=state.active,next=structuredClone(state);act(next,action);state=next;if(before!==state.active)selectedToken=null;}
  }catch(e){if(throwing&&!throwAnimation?.event)stopThrow();toast(e.name==='AbortError'?'연결 시간이 초과되었습니다. 다시 시도해 주세요.':e.message);}
  finally{busy=false;render();}
}
function scheduleBot(){
  const seat=state.phase==='draft'?state.draft?.findIndex((x,i)=>i>0&&x&&!x.done):state.active;
  if(shotAnimation||throwAnimation||mode!=='ai'||!(seat>0)||state.phase==='won'||busy||$('setup-dialog').open||$('info-dialog').open)return;
  botTimer=setTimeout(()=>{const action=botAction(state,Math.random,seat);if(action)send(action,true);},700);
}
function chooseToken(id,owner){if(!canPlay()||owner!==state.active)return;const p=state.players[owner],t=p.tokens[id];if(!t||t.done)return;const at=position(t);selectedToken=NODES[at]?p.tokens.find(x=>position(x)===at).id:id;render();if(state.phase==='flick')$('board').focus({preventScroll:true});}
async function handleClick(e){
  const b=e.target.closest('button,[data-piece],[data-move]');if(!b||b.disabled)return;
  if(b.hasAttribute('data-close')){b.closest('dialog').close();render();return;}
  if(b.dataset.token!==undefined)return chooseToken(+b.dataset.token,+b.dataset.owner);
  if(b.dataset.piece!==undefined)return chooseToken(+b.dataset.piece,+b.dataset.owner);
  if(b.dataset.result!==undefined){selectedResult=+b.dataset.result;render();return;}
  if(b.dataset.move!==undefined){const m=currentMoves()[+b.dataset.move];if(m)send({type:'move',token:m.token,result:m.result,route:m.route});return;}
  if(b.dataset.recruitReserve!==undefined)return send({type:'recruit',reserve:+b.dataset.recruitReserve,target:+b.dataset.recruitTarget});
  const drafting=state.phase==='draft'?{player:draftSeat()}:{};
  if(b.dataset.augment)return send({type:'augment',id:b.dataset.augment,...drafting});
  if(b.dataset.augInfo){const a=aug(b.dataset.augInfo),p=state.players[+b.dataset.augOwner];$('info-content').innerHTML=`<p class="eyebrow">YOUR AUGMENT</p><h2>${a.icon} ${a.name}</h2><p class="muted">${a.desc}</p><p class="augment-live-status">${augmentStatus(p,a.id)}</p>`;$('info-dialog').showModal();return;}
  if(b.dataset.rollChoice)return send({type:'roll',value:+b.dataset.rollChoice});
  if(b.dataset.rerollChoice)return send({type:'reroll',result:selectedResult,value:+b.dataset.rerollChoice});
  if(b.dataset.action==='siteReady')return send({type:'siteReady'});
  if(b.dataset.action==='siteJoin')return send({type:'siteJoin'});
  if(b.dataset.action==='startRoom')return send({type:'startRoom'});
  if(b.dataset.action==='roll')return send({type:'roll'});
  if(b.dataset.action==='reroll')return send({type:'reroll',result:selectedResult});
  if(b.dataset.action==='skipFlick')return send({type:'skipFlick'});
  if(b.dataset.action==='draft'){$('augment-dialog').showModal();return;}
  if(b.dataset.action==='new')return openSetup();
  if(b.dataset.action==='again')return playAgain();
  if(b.dataset.action==='chat')return toggleChat();
  if(b.dataset.skill!==undefined){const o=skillActions(state,selectedToken)[+b.dataset.skill];if(o?.action)send(o.action);return;}
  if(b.dataset.trap)return send({type:'trap',node:b.dataset.trap});
  if(b.dataset.jinx!==undefined)return send({type:'jinx',target:+b.dataset.jinx,...drafting});
  if(b.dataset.swapOwner!==undefined)return send({type:'swap',token:selectedToken,owner:+b.dataset.swapOwner,target:+b.dataset.swapTarget});
  if(b.dataset.action==='copyRoll')return send({type:'copy'});
  if(b.dataset.action==='quake')return send({type:'quake'});
  if(b.dataset.action==='copy'){
    const link=new URL(location.href);link.hash=`room=${online.code}`;
    try{await navigator.clipboard.writeText(link.href);toast('초대 링크를 복사했습니다.');}catch{toast(`초대 코드: ${online.code}`);}return;
  }
}
document.addEventListener('click',handleClick);
$('board').addEventListener('keydown',e=>{if(state.phase==='flick')return;if((e.key==='Enter'||e.key===' ')&&e.target.closest('[role="button"]')){e.preventDefault();handleClick(e);}});
$('draft-reroll').onclick=()=>send({type:'draftReroll',...(state.phase==='draft'?{player:draftSeat()}:{})});
$('augment-dialog').addEventListener('cancel',e=>e.preventDefault());
function openSetup(){if(siteRoomId){location.href=`/#room/${siteRoomId}`;return;}clearTimeout(botTimer);$('winner-dialog').close();$('augment-dialog').close();$('setup-error').textContent='';$('setup-dialog').showModal();}
$('new-button').onclick=openSetup;$('play-again').onclick=playAgain;
$('setup-dialog').addEventListener('close',()=>render());
$('info-dialog').addEventListener('close',()=>scheduleBot());
function setupMode(){const f=new FormData($('setup-form')),m=f.get('mode'),count=Number(f.get('count'));for(let i=2;i<=4;i++)$('name'+i+'-field').hidden=m!=='local'||i>count;$('online-setup').hidden=m!=='online';}
$('setup-form').addEventListener('change',setupMode);setupMode();
$('setup-form').addEventListener('submit',async e=>{
  e.preventDefault();const form=new FormData(e.target),nextMode=form.get('mode'),name=String(form.get('name1')).trim()||'플레이어 1',submit=e.target.querySelector('[type=submit]');submit.disabled=true;$('setup-error').textContent='';
  try{
    if(nextMode==='online'){location.href='/#lobby/jeungyut';return;}
    let nextOnline=null,nextState;
    if(nextMode==='online'){
      const code=String(form.get('code')).trim().toUpperCase();if(code&&!/^[A-F0-9]{6}$/.test(code))throw Error('초대 코드는 영문 A~F와 숫자로 된 6자리입니다.');
      const saved=code?storage.get(`jeung-yut-${code}`):null;
      const data=saved?{...await api(`/api/rooms/${code}`,{auth:saved.token}),...saved}:await api(code?`/api/rooms/${code}/join`:'/api/rooms',{method:'POST',data:{name,backdo:form.has('backdo'),maxPlayers:Number(form.get('count'))}});
      nextOnline={code:data.code,token:data.token,player:data.player,version:data.version,ready:data.ready,names:data.names,maxPlayers:data.maxPlayers};storage.set(`jeung-yut-${data.code}`,{token:data.token,player:data.player});
      nextState=data.state??createGame([...data.names,...Array.from({length:Math.max(0,2-data.names.length)},()=>'참가 대기')],form.has('backdo'),()=>0);
    }else nextState=createGame(Array.from({length:Number(form.get('count'))},(_,i)=>i===0?name:nextMode==='ai'?['','AI 여우','AI 고양이','AI 토끼'][i]:String(form.get('name'+(i+1))).trim()||`플레이어 ${i+1}`),form.has('backdo'));
    stopFlight();stopThrow();seenRoll=null;seenShot=null;drag=null;aimAngle=-Math.PI/2;aimPull=FLICK_MAX_PULL/2;
    clearInterval(pollTimer);online=nextOnline;mode=nextMode;state=nextState;gameNo++;selectedToken=null;selectedResult=null;lastWinner=null;onlineError=false;
    if(online){history.replaceState(null,'',`#room=${online.code}`);startPolling();}else history.replaceState(null,'',location.pathname+location.search);
    $('setup-dialog').close();render();
  }catch(error){$('setup-error').textContent=error.name==='AbortError'?'서버에 연결하지 못했습니다. 잠시 후 다시 시도하세요.':error.message;}
  finally{submit.disabled=false;}
});
function startPolling(){let polling=false;pollTimer=setInterval(async()=>{
  if(!online||polling||busy)return;polling=true;const room=online;
  try{const snap=await api(`/api/rooms/${room.code}`,{auth:room.token});if(online===room){const wasError=onlineError;applySnapshot(snap);if(wasError)render();}}
  catch(e){if(online===room&&!onlineError){onlineError=true;render();toast(e.message);}}finally{polling=false;}
},1200);}
function showRules(){
  clearTimeout(botTimer);$('info-content').innerHTML=`<p class="eyebrow">SAME BOARD. NEW POSSIBILITIES.</p><h2>윷놀이는 그대로, 반전은 증강으로.</h2><ol class="rules-list"><li><strong>2~4인 개인전:</strong> 각자 독립된 말 4개와 증강을 가집니다. 내 말 4개를 먼저 모두 완주시키면 승리합니다. 도·개·걸·윷·모는 1·2·3·4·5칸. 윷·모와 잡기는 추가 던지기를 줍니다. 윷·모로 잡으면 그 결과에서 받은 기회와 중복 지급하지 않습니다.</li><li><strong>잡기와 업기:</strong> 상대가 있는 칸에 정확히 도착하면 상대 묶음 전체를 대기로 보냅니다. 내 말이 만나면 자동으로 업고 함께 이동합니다. 업힌 말은 함께 잡힙니다.</li><li><strong>지름길:</strong> 오른쪽 위·왼쪽 위 모서리에서 턴의 이동을 시작하면 지름길을 고를 수 있습니다. 중앙에 정확히 멈췄다면 다음 이동에서 빠른 출구를 선택할 수 있습니다. 지나갈 때는 원래 대각선으로 갑니다.</li><li><strong>도착과 빽도:</strong> 출발·도착 칸을 지나야 완주합니다. 빽도는 실제로 지나온 길을 한 칸 되돌아갑니다. 첫 칸에서 빽도면 출발·도착 칸에 서고, 다음 이동에서 바로 완주합니다. 판 위에 말이 없으면 빽도는 소모됩니다. 빽도는 새 게임에서 끌 수 있습니다.</li><li><strong>세 번의 증강:</strong> 첫 차례 플레이어의 3·7·11번째 턴이 시작되면 모두 동시에 무작위 3개 중 하나를 골라 총 3개를 가집니다. 추가 던지기는 턴 수에 포함하지 않습니다. 제안 다시 받기는 증강을 고를 때마다 1회씩 주어집니다.</li><li><strong>특수 규칙은 선택한 사람만:</strong> 사단 합체·일렬횡대는 해당 증강이 있어야 승리 조건이 됩니다. 작지만 확실한을 고르면 도·개만 직접 선택합니다. 알까기의 달인을 고르면 자신의 4의 배수 턴 시작에 한 발 쏩니다. 판 위에 내 말과 상대 한 명 이상의 말이 있어야 발동합니다.</li><li><strong>알까기:</strong> 내 알을 뒤로 당겼다 놓으면 반대 방향으로 날아갑니다. 당긴 길이가 길수록 파워와 비거리가 커집니다. 첫 번째로 맞은 상대 묶음을 잡으면 발사한 말이 그 자리로 옮겨 가고, 추가 던지기 없이 턴이 끝납니다. 빗나가면 발사한 내 묶음 전체가 탈락해 대기로 돌아갑니다. 상대의 면역·호신부에 막힌 경우 발사한 말은 원래 칸으로 돌아옵니다. 방향키로 방향·파워를 조절하고 Space로 발사할 수도 있습니다.</li><li><strong>온라인 개인전:</strong> 방을 만든 뒤 초대 링크나 6자리 코드를 알려주세요. 최대 4명이 참가하며, 2명 이상 모이면 방장이 게임을 시작합니다. 선공은 무작위이며 참가 순서대로 차례가 돌아갑니다. 같은 브라우저에서는 새로고침 후 코드로 재접속할 수 있습니다. 방은 메모리에 보관되며 6시간 동안 요청이 없거나 서버를 재시작하면 없어집니다.</li></ol><p class="source-links">기본 규칙 참고: <a href="https://www.mcst.go.kr/usr/child/enter/play/yutnori.jsp" target="_blank" rel="noreferrer">문화체육관광부</a> · 증강의 재선택·보호막 설계 참고: <a href="https://teamfighttactics.leagueoflegends.com/en-gb/news/game-updates/teamfight-tactics-patch-12-11-notes/" target="_blank" rel="noreferrer">Riot TFT</a>. 증강 효과와 수치는 증윷을 위한 자체 설계입니다.</p>`;$('info-dialog').showModal();
}
$('rules-button').onclick=showRules;
$('library-button').onclick=()=>{clearTimeout(botTimer);$('info-content').innerHTML=`<p class="eyebrow">${AUGMENTS.length} WAYS TO CHANGE THE GAME</p><h2>증강 도감</h2><p class="muted">승리 조건부터 작은 한 걸음까지. 세 번의 선택으로 나만의 전략을 만드세요.</p><div class="catalog-grid">${AUGMENTS.map(a=>`<article class="catalog-card"><strong class="${a.tier}">${a.icon} ${a.name}</strong><p>${a.desc}</p></article>`).join('')}</div>`;$('info-dialog').showModal();};
function boardPoint(e){const r=$('board').getBoundingClientRect();return {x:(e.clientX-r.left)*640/r.width,y:(e.clientY-r.top)*640/r.height};}
function showAim(pullX,pullY){
  const token=state.players[state.active].tokens[selectedToken],source=token&&NODES[position(token)];if(!source)return;
  const launch=flickFromPull(pullX,pullY),a=$('aim'),tether=$('pull-tether'),handle=$('pull-handle');
  const elastic=Math.min(launch.length,FLICK_MAX_PULL),px=source.x-launch.dx*elastic,py=source.y-launch.dy*elastic;
  for(const line of [a,tether]){line.setAttribute('x1',source.x);line.setAttribute('y1',source.y);}
  a.setAttribute('x2',source.x+launch.dx*launch.power);a.setAttribute('y2',source.y+launch.dy*launch.power);
  tether.setAttribute('x2',px);tether.setAttribute('y2',py);handle.setAttribute('cx',px);handle.setAttribute('cy',py);handle.setAttribute('r',launch.length?16:0);
  const percent=Math.round(launch.power/FLICK_MAX_TRAVEL*100),bar=$('flick-power-bar'),text=$('flick-power-label');
  if(bar)bar.value=percent;if(text)text.textContent=`파워 ${percent}%`;
  if(launch.length){aimAngle=Math.atan2(launch.dy,launch.dx);aimPull=elastic;}
}
function stopFlight(){if(flightFrame)cancelAnimationFrame(flightFrame);flightFrame=null;shotAnimation=null;}
function animateFlight(now){
  flightFrame=null;if(!shotAnimation)return;
  const {shot,started}=shotAnimation,[a,b]=shot.trail,flightMs=Math.max(250,Math.min(600,Math.hypot(b.x-a.x,b.y-a.y)/.9));
  const age=now-started,first=Math.min(1,age/flightMs),after=Math.max(0,Math.min(1,(age-flightMs)/480)),ease=1-(1-first)**2;
  let x=a.x+(b.x-a.x)*ease,y=a.y+(b.y-a.y)*ease,opacity=1;
  if(after>0){if(shot.outcome==='miss'){x=b.x+shot.launch.dx*280*after;y=b.y+shot.launch.dy*280*after+130*after*after;opacity=1-after;}else{const back=after*after*(3-2*after),rest=shot.outcome==='hit'?NODES[shot.hit]:a;x=b.x+(rest.x-b.x)*back;y=b.y+(rest.y-b.y)*back;}}
  const disc=$('flying-piece');if(disc){disc.setAttribute('transform',`translate(${x} ${y})`);disc.setAttribute('opacity',opacity);}
  const knocked=$('knocked-piece');if(knocked){const p=NODES[shot.hit];knocked.setAttribute('transform',`translate(${p.x+shot.launch.dx*300*after} ${p.y+shot.launch.dy*300*after+100*after*after}) rotate(${120*after})`);knocked.setAttribute('opacity',1-after);}
  if(age>=flightMs+480){shotAnimation=null;render();}else flightFrame=requestAnimationFrame(animateFlight);
}
$('board').addEventListener('pointerdown',e=>{
  if(state.phase!=='flick'||!canPlay()||e.button!==0)return;const piece=e.target.closest('[data-piece]');if(!piece||+piece.dataset.owner!==state.active)return;
  e.preventDefault();selectedToken=+piece.dataset.piece;const source=NODES[position(state.players[state.active].tokens[selectedToken])];
  drag={token:selectedToken,source,start:boardPoint(e),pointer:e.pointerId};$('board').focus({preventScroll:true});$('board').setPointerCapture(e.pointerId);showAim(0,0);
});
$('board').addEventListener('pointermove',e=>{if(!drag||drag.pointer!==e.pointerId)return;const end=boardPoint(e);showAim(end.x-drag.start.x,end.y-drag.start.y);});
$('board').addEventListener('pointerup',e=>{
  if(!drag||drag.pointer!==e.pointerId)return;const d=drag;drag=null;const end=boardPoint(e),pullX=end.x-d.start.x,pullY=end.y-d.start.y;
  if(Math.hypot(pullX,pullY)>=FLICK_MIN_PULL)send({type:'flick',token:d.token,pullX,pullY});else render();
});
$('board').addEventListener('pointercancel',()=>{drag=null;render();});
$('board').addEventListener('lostpointercapture',()=>{if(drag){drag=null;render();}});
$('board').addEventListener('keydown',e=>{
  if(state.phase!=='flick'||!canPlay()||selectedToken===null||!NODES[position(state.players[state.active].tokens[selectedToken])])return;
  if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','+','-',' ','Escape'].includes(e.key)){
    e.preventDefault();e.stopImmediatePropagation();
    if(e.key==='ArrowLeft')aimAngle-=Math.PI/36;if(e.key==='ArrowRight')aimAngle+=Math.PI/36;
    if(e.key==='ArrowUp'||e.key==='+')aimPull=Math.min(FLICK_MAX_PULL,aimPull+10);if(e.key==='ArrowDown'||e.key==='-')aimPull=Math.max(FLICK_MIN_PULL,aimPull-10);
    if(e.key==='Escape'){drag=null;showAim(0,0);return;}
    const pullX=-Math.cos(aimAngle)*aimPull,pullY=-Math.sin(aimAngle)*aimPull;
    if(e.key===' ')send({type:'flick',token:selectedToken,pullX,pullY});else showAim(pullX,pullY);
  }
});
function acceptSiteRoom(next){
  if(!next)return;if(siteRoom&&next.revision<siteRoom.revision)return;
  if(!siteRoom||siteRoom.match!==next.match){stopFlight();stopThrow();seenRoll=next.yut?.lastRoll?.id??null;seenShot=null;lastWinner=null;selectedToken=null;selectedResult=null;}
  const oldActive=state.active;siteRoom=next;
  const names=next.players.map(p=>p.name);
  state=next.yut??createGame([...names,...Array.from({length:Math.max(0,2-names.length)},()=>'참가 대기')],true,()=>0);
  if(oldActive!==state.active)selectedToken=null;
  online={code:siteRoomId,player:next.players.findIndex(p=>p.id===siteAccount.id&&!p.vacant),ready:!!next.yut,names,maxPlayers:4,version:next.revision};
}
async function refreshSiteRoom(){
  if(siteSyncing||busy)return;siteSyncing=true;
  try{const data=await api(`/api/rooms/${siteRoomId}`);if(!siteRoom||data.room.revision>siteRoom.revision||onlineError){acceptSiteRoom(data.room);onlineError=false;render();}}
  catch(error){if(!onlineError){onlineError=true;toast(error.message);}}finally{siteSyncing=false;}
}
function siteSocket(){
  const socket=new WebSocket(`${location.protocol==='https:'?'wss:':'ws:'}//${location.host}/api/rooms/${siteRoomId}/socket`);
  socket.onopen=()=>chat?.setConnected(true);
  socket.onmessage=event=>{let packet={};try{packet=JSON.parse(event.data);}catch{}chat?.receive(packet);if(packet.chatMessage&&packet.chatMessage.playerId!==siteAccount.id&&$('yut-chat').hidden)$('chat-toggle').querySelector('.chat-unread').hidden=false;if(!packet.chatMessage)void refreshSiteRoom();};
  socket.onclose=()=>{chat?.setConnected(false);setTimeout(siteSocket,3000);};
}
// The room chat floats over the board, so it opens only when asked for and remembers that choice.
function toggleChat(open){
  const panel=$('yut-chat'),next=open??panel.hidden;panel.hidden=!next;$('chat-toggle').setAttribute('aria-expanded',String(next));storage.set('jeung-yut-chat-open',next);
  if(next){$('chat-toggle').querySelector('.chat-unread').hidden=true;panel.querySelector('[data-chat-input]')?.focus({preventScroll:true});}
}
function mountChat(){
  chat=createChat($('yut-chat'),'방 채팅',siteAccount.id,text=>api(`/api/rooms/${siteRoomId}/chat`,{method:'POST',data:{text}}));
  $('yut-chat').querySelector('.section-head').insertAdjacentHTML('beforeend','<button type="button" class="chat-close" data-action="chat" aria-label="채팅 닫기">×</button>');
  $('chat-toggle').hidden=false;if(storage.get('jeung-yut-chat-open'))toggleChat(true);
}
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!$('yut-chat').hidden&&$('yut-chat').contains(document.activeElement)){toggleChat(false);$('chat-toggle').focus();}});
if(requestedRoom&&!siteRoomId)location.replace('/#lobby/jeungyut');
$('online-setup').innerHTML='<p class="muted">온라인 대전은 기존 계정으로 공용 대기방에서 방을 만들어 진행합니다.</p>';
document.querySelector('.brand').href='/#home';
if(siteRoomId){
  $('new-button').textContent='대전방으로 ↗';
  render();
  (async()=>{try{const account=await api('/api/me');if(!account.user)throw Error('먼저 대전방에서 로그인하고 참가해 주세요.');siteAccount=account.user;const data=await api(`/api/rooms/${siteRoomId}`);acceptSiteRoom(data.room);busy=false;render();mountChat();pollTimer=setInterval(refreshSiteRoom,1000);siteSocket();}
  catch(error){$('action-content').innerHTML=`<h2 class="action-title">대전방을 확인해 주세요</h2><p class="action-hint">${esc(error.message)}</p><a class="primary full" href="/#room/${siteRoomId}">대전방으로 →</a>`;}})();
}else render();
const invited=location.hash.match(/^#room=([A-Fa-f0-9]{6})$/)?.[1]?.toUpperCase();
if(invited){$('setup-form').elements.mode.value='online';$('setup-form').elements.code.value=invited;setupMode();openSetup();}
