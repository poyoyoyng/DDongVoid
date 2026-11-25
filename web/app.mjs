import {AUGMENTS,MILESTONES,NODES,LINES,createGame,act,legalMoves,position,has,label,botAction,dopamineTurnsLeft} from './engine.mjs';
const $=id=>document.getElementById(id);
const esc=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
let mode='ai',state=createGame(['나','AI 여우','AI 고양이','AI 토끼']),online=null,selectedToken=null,selectedResult=null,busy=false,botTimer,pollTimer,toastTimer,lastWinner=null,drag=null,onlineError=false;
const storage={get(key){try{return JSON.parse(localStorage.getItem(key));}catch{return null;}},set(key,value){try{localStorage.setItem(key,JSON.stringify(value));}catch{}}};
function toast(message){$('toast').textContent=message;$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,4000);}
function canPlay(){return !busy&&(!online||online.ready&&state.active===online.player)&&!(mode==='ai'&&state.active!==0);}
function aug(id){return AUGMENTS.find(a=>a.id===id);}
function augmentStatus(p,id){
  if(id==='dopamine')return dopamineTurnsLeft(p)>0?`+1칸 · ${dopamineTurnsLeft(p)}턴 남음`:'−1칸 · 후유증';
  if(id==='aunt')return `잡힘 면역 ${p.immunity??0}/3회`;
  if(id==='shield')return `호신부 ${p.shields}/2회`;
  return '';
}
function currentMoves(){return legalMoves(state).filter(m=>m.result===selectedResult&&m.token===selectedToken);}
function tokenName(id){return `${id+1}번 말`;}
function locationName(node){return node==='finish'?'완주':node==='home'?'대기':node==='c'?'중앙':node==='o0'?'도착 칸':node==='o5'||node==='o10'||node==='o15'?'모서리':'밝게 표시된 칸';}
function renderPlayers(){
  const cards=Array.from({length:4},(_,i)=>{
    const p=state.players[i];
    if(!p||online&&!online.ready&&i>=online.names.length)return `<section class="player-card empty-seat"><span class="empty-icon">＋</span><p>플레이어 ${i+1}</p><small>${online&&!online.ready&&i<online.maxPlayers?'참가 대기':'빈 자리'}</small></section>`;
    const done=p.tokens.filter(t=>t.done).length;
    return `<section class="player-card ${['blue','red','purple','golden'][i]} ${state.active===i?'active':''}" aria-label="${esc(p.name)} 상태"><div class="player-head"><div class="avatar">${['◈','◆','✦','◉'][i]}</div><div><div class="player-name">${esc(p.name)}</div><div class="player-tag">PLAYER 0${i+1}${mode==='ai'&&i!==0?' / AI':''}</div></div>${state.active===i?'<span class="turn-chip">● NOW</span>':''}</div><div class="score-row"><span>완주한 말</span><strong>${done} <span>/ 4</span></strong></div><div class="progress-track">${p.tokens.map(t=>`<i class="progress-part ${t.done?'done':''}"></i>`).join('')}</div><div class="token-tray">${p.tokens.map(t=>`<button class="reserve-token ${position(t)==='home'?'':t.done?'finished-token':'on-board-token'} ${i===state.active&&selectedToken===t.id?'selected':''}" data-token="${t.id}" data-owner="${i}" ${!canPlay()||i!==state.active||t.done?'disabled':''} aria-label="${esc(p.name)} ${t.id+1}번 말, ${position(t)==='home'?'대기':t.done?'완주':'판 위'}">${t.done?'✓':t.id+1}</button>`).join('')}</div><div class="augments">${MILESTONES.map((turn,j)=>p.augments[j]?`<button class="aug-slot filled" data-aug-info="${p.augments[j]}" data-aug-owner="${i}" title="${esc(aug(p.augments[j]).desc)} ${esc(augmentStatus(p,p.augments[j]))}"><span class="aug-icon ${aug(p.augments[j]).tier}">${aug(p.augments[j]).icon}</span><span class="aug-desc">${aug(p.augments[j]).name}${augmentStatus(p,p.augments[j])?`<small class="augment-counter">${augmentStatus(p,p.augments[j])}</small>`:''}</span></button>`:`<div class="aug-slot"><span class="aug-icon">◇</span><span class="aug-desc">${turn}턴에 열리는 증강</span></div>`).join('')}</div><p class="player-foot">${p.turn}번째 턴${p.shields?` · 호신부 ${p.shields}회`:''}${p.boost?` · 추격 +${p.boost}칸`:''}${p.augments.includes('aunt')?`<br>${augmentStatus(p,'aunt')}`:''}${p.augments.includes('dopamine')?`<br>도파민 ${augmentStatus(p,'dopamine')}`:''}</p></section>`;
  });
  $('players-left').innerHTML=[cards[0],cards[2]].join('');
  $('players-right').innerHTML=[cards[1],cards[3]].join('');
  $('board-legend').innerHTML=state.players.filter((_,i)=>!online||online.ready||i<online.names.length).map((p,i)=>`<span><i class="legend p${i}"></i>${esc(p.name)}</span>`).join(' ');
}
function renderBoard(){
  let svg='<defs><pattern id="grain" width="9" height="9" patternUnits="userSpaceOnUse"><circle cx="2" cy="4" r=".55" fill="#bacb8b" opacity=".055"/></pattern></defs><rect class="board-surface" x="35" y="35" width="570" height="570" rx="26"/><rect x="35" y="35" width="570" height="570" rx="26" fill="url(#grain)"/>';
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
  if(state.flick){const [a,b]=state.flick.trail;svg+=`<line class="shot-line" x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}"/><circle class="shot-disc" r="7" cx="${b.x}" cy="${b.y}"/>`;}
  for(let owner=0;owner<state.players.length;owner++) {
    const groups=new Map();for(const t of state.players[owner].tokens){const node=position(t);if(NODES[node])groups.set(node,[...(groups.get(node)||[]),t]);}
    for(const [node,tokens] of groups){const n=NODES[node],id=tokens[0].id,selected=owner===state.active&&selectedToken!==null&&tokens.some(t=>t.id===selectedToken);
      svg+=`<g class="piece ${['blue','red','purple','golden'][owner]} ${selected?'selected':''}" data-piece="${id}" data-owner="${owner}" role="button" tabindex="0" aria-label="${esc(state.players[owner].name)} ${tokens.map(t=>t.id+1).join('·')}번 말, ${tokens.length}개 묶음" transform="translate(${n.x} ${n.y})">${selected?'<circle class="selection-ring" r="29"/>':''}${tokens.length>1?'<circle class="stack-ring" r="26"/>':''}<circle r="21"/><text>${tokens.length>1?'×'+tokens.length:id+1}</text><text class="piece-label">${tokens.length>1?tokens.map(t=>t.id+1).join(' · '):''}</text></g>`;
    }
  }
  if(canPlay())for(const [idx,m] of currentMoves().entries()) {
    const n=NODES[m.to]??(m.to==='finish'?{x:603,y:587}:{x:604,y:529});
    svg+=`<g class="destination" data-move="${idx}" role="button" tabindex="0" aria-label="${m.steps}칸 이동, ${locationName(m.to)}, ${m.route==='shortcut'?'지름길':m.route==='long'?'긴 길':'이동'}"><circle cx="${n.x}" cy="${n.y}" r="26"/><text x="${n.x}" y="${n.y}">${m.to==='finish'?'⚑':'✓'}</text></g>`;
  }
  svg+='<line id="aim" class="aim-line" x1="0" y1="0" x2="0" y2="0"/>';
  $('board').innerHTML=svg;
}
function renderAction(){
  const p=state.players[state.active],mine=canPlay(),phase=state.phase;
  $('phase-badge').textContent=!online?.ready&&online?'대기 중':phase==='won'?'게임 종료':phase==='augment'?'증강 선택':phase==='flick'?'알까기':state.throws>0?'던지기':'말 이동';
  let html='';
  if(online&&!online.ready)html=`<h2 class="action-title">${online.names.length}명이 모였어요.</h2><p class="action-hint">초대 코드로 최대 ${online.maxPlayers}명까지 참가할 수 있어요.<br>${online.player===0?'2명 이상 모이면 원하는 때 시작하세요.':'방장이 시작하면 개인전이 시작됩니다.'}</p>${online.player===0?`<button class="primary full" data-action="startRoom" ${online.names.length<2||busy?'disabled':''}>${online.names.length}명으로 시작하기 →</button>`:''}`;
  else if(phase==='won')html=`<h2 class="action-title">${esc(state.players[state.winner].name)} 승리!</h2><p class="action-hint">${esc(state.winReason)}</p><button class="primary full" data-action="new">다음 판 열기 →</button>`;
  else if(phase==='augment')html=`<div class="waiting-mark">✧</div><h2 class="action-title">전략이 바뀌는 순간</h2><p class="action-hint">${esc(p.name)}의 ${p.turn}번째 턴.<br>${mine?'세 가지 증강 중 하나를 선택하세요.':'상대가 증강을 고르고 있습니다.'}</p>${mine?'<button class="primary full" data-action="draft">증강 선택하기 →</button>':''}`;
  else if(phase==='flick') {
    html=`<h2 class="action-title">지금은, 알까기!</h2><p class="action-hint">${mine?'내 말에서 상대 쪽으로 끌어 놓으세요. 길게 끌수록 멀리 날아갑니다. 또는 아래 대상을 골라 발사하세요.':'상대가 알까기를 조준하고 있습니다.'}</p>`;
    if(mine){if(selectedToken!==null&&NODES[position(p.tokens[selectedToken])]){html+='<div class="target-buttons">';const seen=new Set();state.players.forEach((opponent,owner)=>{if(owner===state.active)return;for(const t of opponent.tokens){const pos=position(t);if(NODES[pos]&&!seen.has(pos)){seen.add(pos);html+=`<button data-target="${t.id}" data-target-owner="${owner}">${esc(opponent.name)} ${t.id+1}번 조준 ↗</button>`;}}});html+='</div>';}else html+='<p class="inline-help">먼저 판 위의 내 말을 선택하세요.</p>';html+='<button class="secondary full" data-action="skipFlick">이번 알까기 넘기기</button>';}
  }else {
    html=`<div class="yut-sticks" aria-hidden="true"><i class="stick flat"></i><i class="stick flat"></i><i class="stick round"></i><i class="stick flat"></i></div><h2 class="action-title">${mine?state.throws>0?'당신의 한 수.':'어디로 갈까요?':mode==='ai'?'AI가 생각 중…':'상대의 차례예요'}</h2><p class="action-hint">${mine?state.pending.length?'결과 → 내 말 → 밝게 표시된 목적지 순서로 선택하세요.':'도·개·걸·윷·모, 당신의 운을 던져보세요.':`${esc(p.name)}의 다음 수를 기다리고 있습니다.`}</p>`;
    if(state.pending.length){html+=`<div class="result-list">${state.pending.map(r=>`<button class="result ${selectedResult===r.id?'chosen':''}" data-result="${r.id}" ${!mine?'disabled':''}>${label(r.value)} <small>${r.value<0?'−1':r.value}</small></button>`).join('')}</div>`;
      const r=state.pending.find(r=>r.id===selectedResult);
      if(mine&&has(state,state.active,'reroll')&&!p.rerolled&&r&&r.value<4)html+=`<div class="result-tools">${has(state,state.active,'choice')?'<button data-reroll-choice="1">⟳ 도로 변경</button> · <button data-reroll-choice="2">개로 변경</button>':'<button data-action="reroll">⟳ 선택한 결과 다시 던지기</button>'}</div>`;
    }
    if(mine&&state.throws>0)html+=has(state,state.active,'choice')?'<div class="choice-buttons"><button class="primary" data-roll-choice="1">도 <small>1칸</small></button><button class="primary" data-roll-choice="2">개 <small>2칸</small></button></div>':`<button class="primary full" data-action="roll" ${busy?'disabled':''}>윷 던지기 <span>↗</span></button>`;
    if(mine&&state.throws>0&&state.pending.length)html+=`<p class="inline-help">추가 던지기 ${state.throws}회 · 결과를 모으거나 먼저 이동할 수 있어요.</p>`;
    if(mine&&selectedToken!==null&&state.pending.length){html+=`<p class="inline-help">${tokenName(selectedToken)} 선택됨</p>`;for(const [i,m] of currentMoves().entries())html+=`<button class="move-option" data-move="${i}"><span>${m.route==='shortcut'?'지름길':m.route==='short'?'빠른 출구':m.route==='long'?'왼쪽 경유':'이동'} · ${m.steps===-1?'뒤로 1':m.steps}칸</span><span>${m.to==='finish'?'완주 ⚑':m.to==='home'?'대기로':'이동 →'}</span></button>`;}
  }
  const event=state.log.find(text=>!text.endsWith('번째 턴'));
  $('action-content').innerHTML=(event&&(!online||online.ready)?`<p class="action-event">${esc(event)}</p>`:'')+html;
}
function render(){
  clearTimeout(botTimer);
  if(!state.pending.some(r=>r.id===selectedResult))selectedResult=state.pending[0]?.id??null;
  if(selectedToken!==null){const t=state.players[state.active].tokens[selectedToken];if(!t||t.done)selectedToken=null;}
  renderPlayers();renderBoard();renderAction();
  $('board-status').textContent=state.phase==='won'?'A BEAUTIFUL FINISH':online&&!online.ready?'WAITING FOR A FRIEND':`${state.players[state.active].name}의 차례`;
  $('turn-label').textContent=`${state.players[state.active].turn}번째 턴`;
  $('milestones').innerHTML='<div class="milestone-row">'+MILESTONES.map((t,i)=>`${i?'<i class="mile-line"></i>':''}<span class="mile ${state.players[state.active].augments.length>i?'done':''}">${t}</span>`).join('')+'</div>';
  $('game-log').innerHTML=state.log.slice(0,10).map((text,i)=>`<li>${i===0?'↳ ':''}${esc(text)}</li>`).join('');
  $('online-banner').hidden=!online;
  if(online)$('online-banner').innerHTML=`<span>초대 코드 <strong>${online.code}</strong> ${online.ready?`· 나는 ${esc(state.players[online.player].name)}`:`· 참가 ${online.names.length}/${online.maxPlayers}명`}</span><span class="connection-status ${onlineError?'danger':''}">${onlineError?'연결 확인 중…':'● 연결됨'}</span><button class="secondary" data-action="copy">초대 링크 복사 ↗</button>`;
  const showDraft=state.phase==='augment'&&canPlay()&&!$('setup-dialog').open;
  if(showDraft){renderDraft();if(!$('augment-dialog').open)$('augment-dialog').showModal();}else $('augment-dialog').close();
  if(state.phase==='won'&&lastWinner!==state.winner){lastWinner=state.winner;$('winner-name').textContent=`${state.players[state.winner].name}, 승리!`;$('winner-reason').textContent=state.winReason;$('winner-dialog').showModal();}
  scheduleBot();
}
function renderDraft(){
  const p=state.players[state.active];$('draft-subtitle').textContent=`${p.name} · ${p.turn}번째 턴 · ${p.augments.length+1} / 3 증강`;
  $('augment-options').innerHTML=state.offers.map(id=>{const a=aug(id);return `<button class="augment-choice ${a.tier}" data-augment="${a.id}"><span class="aug-icon">${a.icon}</span><span class="aug-kind">${a.tier==='prism'?'PRISMATIC':a.tier==='gold'?'GOLD':'SILVER'} / ${a.kind}</span><strong>${a.name}</strong><p>${a.desc}</p><span class="pick-label">이 증강 선택하기 ↗</span></button>`;}).join('');
  $('draft-reroll').disabled=busy||p.draftRerolls<=0;$('draft-reroll').textContent=`⟳ 다시 제안받기 (${p.draftRerolls}/1)`;
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
  if(busy||(!fromBot&&!canPlay()&&!(action.type==='startRoom'&&online?.player===0&&!online.ready)))return;
  busy=true;clearTimeout(botTimer);
  try{
    if(online){const snap=await api(`/api/rooms/${online.code}/${action.type==='startRoom'?'start':'action'}`,{method:'POST',data:{version:online.version,action},auth:online.token});applySnapshot(snap);}
    else {const before=state.active,next=structuredClone(state);act(next,action);state=next;if(before!==state.active)selectedToken=null;}
  }catch(e){toast(e.name==='AbortError'?'연결 시간이 초과되었습니다. 다시 시도해 주세요.':e.message);}
  finally{busy=false;render();}
}
function scheduleBot(){
  if(mode!=='ai'||state.active===0||state.phase==='won'||busy||$('setup-dialog').open||$('info-dialog').open)return;
  botTimer=setTimeout(()=>{const action=botAction(state);if(action)send(action,true);},700);
}
function chooseToken(id,owner){if(!canPlay()||owner!==state.active)return;const p=state.players[owner],t=p.tokens[id];if(!t||t.done)return;const at=position(t);selectedToken=NODES[at]?p.tokens.find(x=>position(x)===at).id:id;render();}
async function handleClick(e){
  const b=e.target.closest('button,[data-piece],[data-move]');if(!b||b.disabled)return;
  if(b.hasAttribute('data-close')){b.closest('dialog').close();render();return;}
  if(b.dataset.token!==undefined)return chooseToken(+b.dataset.token,+b.dataset.owner);
  if(b.dataset.piece!==undefined)return chooseToken(+b.dataset.piece,+b.dataset.owner);
  if(b.dataset.result!==undefined){selectedResult=+b.dataset.result;render();return;}
  if(b.dataset.move!==undefined){const m=currentMoves()[+b.dataset.move];if(m)send({type:'move',token:m.token,result:m.result,route:m.route});return;}
  if(b.dataset.augment)return send({type:'augment',id:b.dataset.augment});
  if(b.dataset.augInfo){const a=aug(b.dataset.augInfo),p=state.players[+b.dataset.augOwner];$('info-content').innerHTML=`<p class="eyebrow">YOUR AUGMENT</p><h2>${a.icon} ${a.name}</h2><p class="muted">${a.desc}</p><p class="augment-live-status">${augmentStatus(p,a.id)}</p>`;$('info-dialog').showModal();return;}
  if(b.dataset.rollChoice)return send({type:'roll',value:+b.dataset.rollChoice});
  if(b.dataset.rerollChoice)return send({type:'reroll',result:selectedResult,value:+b.dataset.rerollChoice});
  if(b.dataset.target!==undefined){const a=NODES[position(state.players[state.active].tokens[selectedToken])],target=state.players[+b.dataset.targetOwner].tokens[+b.dataset.target],dest=NODES[position(target)];if(a&&dest)send({type:'flick',token:selectedToken,dx:dest.x-a.x,dy:dest.y-a.y,power:650});return;}
  if(b.dataset.action==='startRoom')return send({type:'startRoom'});
  if(b.dataset.action==='roll')return send({type:'roll'});
  if(b.dataset.action==='reroll')return send({type:'reroll',result:selectedResult});
  if(b.dataset.action==='skipFlick')return send({type:'skipFlick'});
  if(b.dataset.action==='draft'){$('augment-dialog').showModal();return;}
  if(b.dataset.action==='new')return openSetup();
  if(b.dataset.action==='copy'){
    const link=new URL(location.href);link.hash=`room=${online.code}`;
    try{await navigator.clipboard.writeText(link.href);toast('초대 링크를 복사했습니다.');}catch{toast(`초대 코드: ${online.code}`);}return;
  }
}
document.addEventListener('click',handleClick);
$('board').addEventListener('keydown',e=>{if((e.key==='Enter'||e.key===' ')&&e.target.closest('[role="button"]')){e.preventDefault();handleClick(e);}});
$('draft-reroll').onclick=()=>send({type:'draftReroll'});
$('augment-dialog').addEventListener('cancel',e=>e.preventDefault());
function openSetup(){clearTimeout(botTimer);$('winner-dialog').close();$('augment-dialog').close();$('setup-error').textContent='';$('setup-dialog').showModal();}
$('new-button').onclick=openSetup;$('play-again').onclick=openSetup;
$('setup-dialog').addEventListener('close',()=>render());
$('info-dialog').addEventListener('close',()=>scheduleBot());
function setupMode(){const f=new FormData($('setup-form')),m=f.get('mode'),count=Number(f.get('count'));for(let i=2;i<=4;i++)$('name'+i+'-field').hidden=m!=='local'||i>count;$('online-setup').hidden=m!=='online';}
$('setup-form').addEventListener('change',setupMode);setupMode();
$('setup-form').addEventListener('submit',async e=>{
  e.preventDefault();const form=new FormData(e.target),nextMode=form.get('mode'),name=String(form.get('name1')).trim()||'플레이어 1',submit=e.target.querySelector('[type=submit]');submit.disabled=true;$('setup-error').textContent='';
  try{
    let nextOnline=null,nextState;
    if(nextMode==='online'){
      const code=String(form.get('code')).trim().toUpperCase();if(code&&!/^[A-F0-9]{6}$/.test(code))throw Error('초대 코드는 영문 A~F와 숫자로 된 6자리입니다.');
      const saved=code?storage.get(`jeung-yut-${code}`):null;
      const data=saved?{...await api(`/api/rooms/${code}`,{auth:saved.token}),...saved}:await api(code?`/api/rooms/${code}/join`:'/api/rooms',{method:'POST',data:{name,backdo:form.has('backdo'),maxPlayers:Number(form.get('count'))}});
      nextOnline={code:data.code,token:data.token,player:data.player,version:data.version,ready:data.ready,names:data.names,maxPlayers:data.maxPlayers};storage.set(`jeung-yut-${data.code}`,{token:data.token,player:data.player});
      nextState=data.state??createGame([...data.names,...Array.from({length:Math.max(0,2-data.names.length)},()=>'참가 대기')],form.has('backdo'),()=>0);
    }else nextState=createGame(Array.from({length:Number(form.get('count'))},(_,i)=>i===0?name:nextMode==='ai'?['','AI 여우','AI 고양이','AI 토끼'][i]:String(form.get('name'+(i+1))).trim()||`플레이어 ${i+1}`),form.has('backdo'));
    clearInterval(pollTimer);online=nextOnline;mode=nextMode;state=nextState;selectedToken=null;selectedResult=null;lastWinner=null;onlineError=false;
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
  clearTimeout(botTimer);$('info-content').innerHTML=`<p class="eyebrow">SAME BOARD. NEW POSSIBILITIES.</p><h2>윷놀이는 그대로, 반전은 증강으로.</h2><ol class="rules-list"><li><strong>2~4인 개인전:</strong> 각자 독립된 말 4개와 증강을 가집니다. 내 말 4개를 먼저 모두 완주시키면 승리합니다. 도·개·걸·윷·모는 1·2·3·4·5칸. 윷·모와 잡기는 추가 던지기를 줍니다. 윷·모로 잡으면 그 결과에서 받은 기회와 중복 지급하지 않습니다.</li><li><strong>잡기와 업기:</strong> 상대가 있는 칸에 정확히 도착하면 상대 묶음 전체를 대기로 보냅니다. 내 말이 만나면 자동으로 업고 함께 이동합니다. 업힌 말은 함께 잡힙니다.</li><li><strong>지름길:</strong> 오른쪽 위·왼쪽 위 모서리에서 턴의 이동을 시작하면 지름길을 고를 수 있습니다. 중앙에 정확히 멈췄다면 다음 이동에서 빠른 출구를 선택할 수 있습니다. 지나갈 때는 원래 대각선으로 갑니다.</li><li><strong>도착과 빽도:</strong> 출발·도착 칸을 지나야 완주합니다. 빽도는 실제로 지나온 길을 한 칸 되돌아갑니다. 첫 칸에서 빽도면 대기로 돌아갑니다. 판 위에 말이 없으면 빽도는 소모됩니다. 빽도는 새 게임에서 끌 수 있습니다.</li><li><strong>세 번의 증강:</strong> 각자 자신의 5·10·15번째 턴 시작에 무작위 3개 중 하나를 골라 총 3개를 가집니다. 추가 던지기는 턴 수에 포함하지 않습니다. 제안 다시 받기는 각 플레이어당 판 전체 1회입니다.</li><li><strong>특수 규칙은 선택한 사람만:</strong> 사단 합체·일렬횡대는 해당 증강이 있어야 승리 조건이 됩니다. 작지만 확실한을 고르면 도·개만 직접 선택합니다. 알까기의 달인을 고르면 자신의 4의 배수 턴 시작에 한 발 쏩니다. 판 위에 내 말과 상대 한 명 이상의 말이 있어야 발동합니다.</li><li><strong>알까기:</strong> 내 말에서 원하는 방향으로 끌어 놓으면 그 방향으로 날아갑니다. 첫 번째로 맞은 상대 묶음을 잡고 보너스 던지기를 얻습니다. 발사한 말은 원래 칸에 남습니다. 대상 조준 버튼으로도 발사할 수 있습니다.</li><li><strong>온라인 개인전:</strong> 방을 만든 뒤 초대 링크나 6자리 코드를 알려주세요. 최대 4명이 참가하며, 2명 이상 모이면 방장이 게임을 시작합니다. 선공은 무작위이며 참가 순서대로 차례가 돌아갑니다. 같은 브라우저에서는 새로고침 후 코드로 재접속할 수 있습니다. 방은 메모리에 보관되며 6시간 동안 요청이 없거나 서버를 재시작하면 없어집니다.</li></ol><p class="source-links">기본 규칙 참고: <a href="https://www.mcst.go.kr/usr/child/enter/play/yutnori.jsp" target="_blank" rel="noreferrer">문화체육관광부</a> · 증강의 재선택·보호막 설계 참고: <a href="https://teamfighttactics.leagueoflegends.com/en-gb/news/game-updates/teamfight-tactics-patch-12-11-notes/" target="_blank" rel="noreferrer">Riot TFT</a>. 증강 효과와 수치는 증윷을 위한 자체 설계입니다.</p>`;$('info-dialog').showModal();
}
$('rules-button').onclick=showRules;
$('library-button').onclick=()=>{clearTimeout(botTimer);$('info-content').innerHTML=`<p class="eyebrow">${AUGMENTS.length} WAYS TO CHANGE THE GAME</p><h2>증강 도감</h2><p class="muted">승리 조건부터 작은 한 걸음까지. 세 번의 선택으로 나만의 전략을 만드세요.</p><div class="catalog-grid">${AUGMENTS.map(a=>`<article class="catalog-card"><strong class="${a.tier}">${a.icon} ${a.name}</strong><p>${a.desc}</p></article>`).join('')}</div>`;$('info-dialog').showModal();};
function boardPoint(e){const r=$('board').getBoundingClientRect();return {x:(e.clientX-r.left)*640/r.width,y:(e.clientY-r.top)*640/r.height};}
$('board').addEventListener('pointerdown',e=>{
  if(state.phase!=='flick'||!canPlay())return;const piece=e.target.closest('[data-piece]');if(!piece||+piece.dataset.owner!==state.active)return;
  e.preventDefault();selectedToken=+piece.dataset.piece;const source=NODES[position(state.players[state.active].tokens[selectedToken])];drag={token:selectedToken,source,pointer:e.pointerId};$('board').setPointerCapture(e.pointerId);
});
$('board').addEventListener('pointermove',e=>{if(!drag)return;const end=boardPoint(e),a=$('aim');a.setAttribute('x1',drag.source.x);a.setAttribute('y1',drag.source.y);a.setAttribute('x2',end.x);a.setAttribute('y2',end.y);});
$('board').addEventListener('pointerup',e=>{
  if(!drag)return;const d=drag;drag=null;const end=boardPoint(e),dx=end.x-d.source.x,dy=end.y-d.source.y;
  if(Math.hypot(dx,dy)>12)send({type:'flick',token:d.token,dx,dy,power:Math.hypot(dx,dy)*1.65});else render();
});
$('board').addEventListener('pointercancel',()=>{drag=null;render();});
render();
const invited=location.hash.match(/^#room=([A-Fa-f0-9]{6})$/)?.[1]?.toUpperCase();
if(invited){$('setup-form').elements.mode.value='online';$('setup-form').elements.code.value=invited;setupMode();openSetup();}
