// Shared, deterministic rules. Only the host supplies randomness in online games.
export const AUGMENTS = [
  { id:'tower', icon:'♜', name:'사단 합체', tier:'prism', kind:'특수 승리', desc:'판 위에서 내 말 4개를 한 칸에 업으면 즉시 승리합니다.' },
  { id:'line', icon:'⁙', name:'일렬횡대', tier:'prism', kind:'특수 승리', desc:'판 위의 직선 경로에서 서로 다른 연속 4칸에 말을 하나씩 세우면 즉시 승리합니다.' },
  { id:'choice', icon:'⑫', name:'작지만 확실한', tier:'gold', kind:'운명 선택', desc:'윷을 던지는 대신 도 또는 개를 직접 고릅니다. 윷·모는 나오지 않습니다.' },
  { id:'flick', icon:'↗', name:'알까기의 달인', tier:'prism', kind:'미니게임', desc:'내 4·8·12…번째 턴 시작에 알까기 한 발! 맞힌 상대 말 묶음을 대기로 보내고 보너스 던지기를 얻습니다.' },
  { id:'reroll', icon:'⟳', name:'한 번 더 생각해', tier:'silver', kind:'행운', desc:'매 턴 한 번, 도·개·걸·빽도 결과 하나를 다시 던질 수 있습니다. 도·개 선택 증강과 함께라면 다시 고릅니다.' },
  { id:'shield', icon:'♧', name:'든든한 호신부', tier:'gold', kind:'방어', desc:'이번 판에 상대의 잡기 또는 알까기를 총 2회 막습니다. 잡으러 온 말은 이동 전 자리로 돌아갑니다.' },
  { id:'stride', icon:'⇉', name:'세 번째 큰 걸음', tier:'silver', kind:'기동', desc:'내 3·6·9…번째 턴의 첫 전진 이동 거리가 1칸 늘어납니다.' },
  { id:'hunter', icon:'⌖', name:'추격 본능', tier:'gold', kind:'공격', desc:'잡기에 성공할 때마다 다음 전진 이동 거리가 1칸 늘어납니다. 누적은 최대 2칸입니다.' },
  { id:'solo', icon:'♟', name:'나 홀로 산책', tier:'silver', kind:'기동', desc:'업지 않은 말 하나를 도로 움직이면 1칸 더 갑니다.' },
  { id:'comeback', icon:'⤴', name:'다시 출발', tier:'silver', kind:'재기', desc:'잡혔던 말은 대기에서 다시 출발할 때 딱 한 번 2칸 더 갑니다.' },
  { id:'forward', icon:'↑', name:'앞으로만', tier:'silver', kind:'안정', desc:'내 빽도 결과가 모두 도로 바뀝니다.' },
  { id:'finish', icon:'⚑', name:'완주의 기세', tier:'gold', kind:'연계', desc:'말을 완주시키면 추가 던지기 1회를 얻습니다. 한 턴에 한 번 발동합니다.' },
];
export const MILESTONES = [5,10,15];
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
export const position=t=>t.done?'finish':t.path.at(-1)??'home';
export const has=(s,p,id)=>s.players[p].augments.includes(id);
export const label=n=>({'-1':'빽도',1:'도',2:'개',3:'걸',4:'윷',5:'모'})[n];
const player=name=>({name,turn:0,tokens:Array.from({length:4},(_,id)=>({id,path:[],done:false,returning:false})),augments:[],shields:0,boost:0,rerolled:false,draftRerolls:1,strideUsed:false,finishUsed:false});
export function createGame(names=['플레이어 1','플레이어 2'],backdo=true,rng=Math.random) {
  if(!Array.isArray(names)||names.length<2||names.length>4)throw Error('개인전은 2~4명으로 진행합니다.');
  const s={players:names.map(player),active:Math.floor(rng()*names.length),phase:'roll',round:1,throws:1,pending:[],offers:[],log:[],winner:null,winReason:null,backdo,nextId:1,flick:null,revision:0};
  beginTurn(s,rng); return s;
}
function note(s,msg) {s.log.unshift(msg);s.log=s.log.slice(0,40);}
function sample(pool,n,rng) {const a=[...pool],out=[];while(out.length<n&&a.length)out.push(a.splice(Math.floor(rng()*a.length),1)[0]);return out;}
function draft(s,rng) {s.offers=sample(AUGMENTS.filter(a=>!has(s,s.active,a.id)).map(a=>a.id),3,rng);s.phase='augment';}
function beginTurn(s,rng) {
  const p=s.players[s.active];p.turn++;p.rerolled=false;p.strideUsed=false;p.finishUsed=false;s.throws=1;s.pending=[];s.flick=null;
  note(s,`${p.name} · ${p.turn}번째 턴`);
  if(MILESTONES.includes(p.turn)&&p.augments.length<MILESTONES.indexOf(p.turn)+1) draft(s,rng); else afterDraft(s);
}
function afterDraft(s) {
  const p=s.active;
  s.phase=has(s,p,'flick')&&s.players[p].turn%4===0&&s.players[p].tokens.some(t=>NODES[position(t)])&&s.players.some((other,i)=>i!==p&&other.tokens.some(t=>NODES[position(t)]))?'flick':'roll';
}
function win(s,p,reason) {s.winner=p;s.winReason=reason;s.phase='won';note(s,`${s.players[p].name} 승리! ${reason}`);}
export function checkWin(s,p) {
  const tokens=s.players[p].tokens;
  if(tokens.every(t=>t.done)) return win(s,p,'말 4개 모두 완주');
  const pos=tokens.map(position);
  if(has(s,p,'tower')&&NODES[pos[0]]&&pos.every(x=>x===pos[0]))return win(s,p,'사단 합체 · 말 4개 업기');
  if(has(s,p,'line')&&new Set(pos).size===4&&pos.every(x=>NODES[x])&&LINES.some(l=>l.some((_,i)=>i+4<=l.length&&l.slice(i,i+4).every(x=>pos.includes(x)))))return win(s,p,'일렬횡대 · 연속 4칸');
}
function rolledValue(s,rng) {
  const bits=Math.floor(rng()*16); const count=bits.toString(2).replaceAll('0','').length;
  let value=count===0?5:count;
  if(s.backdo&&bits===1)value=-1;
  if(value===-1&&has(s,s.active,'forward'))value=1;
  return value;
}
const NEXT={a1:'a2',a2:'c',a4:'a5',a5:'o15',b1:'b2',b2:'c',b4:'b5',b5:'o0'};
export function walk(token,steps,route='outer') {
  const t=structuredClone(token);
  if(steps<0) {t.path.pop();return t;}
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
  return n+p.boost;
}
export function legalMoves(s) {
  if(!['roll','move'].includes(s.phase))return [];
  const p=s.active,moves=[],seen=new Set();
  for(const t of s.players[p].tokens) {
    const pos=position(t);if(t.done||seen.has(pos))continue;if(pos!=='home')seen.add(pos);
    const g=group(s,p,t.id);
    for(const result of s.pending) {
      if(result.value<0&&pos==='home')continue;
      const steps=distance(s,result,g);
      const routes=steps<0?['outer']:pos==='o5'||pos==='o10'?['outer','shortcut']:pos==='c'?['short','long']:['outer'];
      for(const route of routes) {const moved=walk(t,steps,route);moves.push({token:t.id,result:result.id,route,steps,to:position(moved),count:g.length,path:moved.path});}
    }
  }
  return moves;
}
function settle(s,rng) {
  if(s.winner!==null)return;
  if(s.throws>0){s.phase='roll';return;}
  s.phase='move';
  if(legalMoves(s).length)return;
  if(s.pending.length)note(s,'움직일 말이 없어 빽도를 소모합니다.');
  s.pending=[];s.active=(s.active+1)%s.players.length;s.round++;beginTurn(s,rng);
}
function capture(s,owner,at) {
  const victim=s.players.find((p,i)=>i!==owner&&p.tokens.some(t=>position(t)===at));
  if(!victim)return {caught:0,blocked:false};
  const caught=victim.tokens.filter(t=>position(t)===at);
  if(!caught.length)return {caught:0,blocked:false};
  if(victim.shields>0) {victim.shields--;note(s,`${victim.name}의 호신부가 잡기를 막았습니다. (${victim.shields}회 남음)`);return {caught:0,blocked:true};}
  for(const t of caught){t.path=[];t.done=false;t.returning=true;}
  note(s,`${s.players[owner].name}, ${victim.name}의 말 ${caught.length}개 잡기!`);
  if(has(s,owner,'hunter'))s.players[owner].boost=Math.min(2,s.players[owner].boost+1);
  return {caught:caught.length,blocked:false};
}
export function simulateFlick(source,dx,dy,power,targets) {
  const mag=Math.hypot(dx,dy);if(mag<.001)return {trail:[source],hit:null};
  const travel=Math.max(70,Math.min(650,power)),ux=dx/mag,uy=dy/mag;
  let best=travel,hit=null;
  for(const target of targets) {
    const tx=target.x-source.x,ty=target.y-source.y,along=tx*ux+ty*uy,perp2=tx*tx+ty*ty-along*along;
    if(perp2>30*30||along<0)continue;
    const near=Math.max(0,along-Math.sqrt(30*30-perp2));
    if(near<=best){best=near;hit=target.node;}
  }
  // The flick is a strike on the current board, not a permanent relocation.
  return {trail:[source,{x:source.x+ux*best,y:source.y+uy*best}],hit};
}
export function act(s,action,rng=Math.random) {
  if(s.phase==='won')throw Error('이미 끝난 게임입니다.');
  const p=s.players[s.active];
  switch(action.type) {
    case 'augment': {
      if(s.phase!=='augment'||!s.offers.includes(action.id))throw Error('선택할 수 없는 증강입니다.');
      p.augments.push(action.id);if(action.id==='shield')p.shields=2;
      note(s,`${p.name}의 증강: ${AUGMENTS.find(a=>a.id===action.id).name}`);s.offers=[];
      checkWin(s,s.active);if(s.winner===null)afterDraft(s);break;
    }
    case 'draftReroll':
      if(s.phase!=='augment'||p.draftRerolls<=0)throw Error('증강 재선택을 사용할 수 없습니다.');
      {const previous=[...s.offers];p.draftRerolls--;s.offers=sample(AUGMENTS.filter(a=>!p.augments.includes(a.id)&&!previous.includes(a.id)).map(a=>a.id),3,rng);}break;
    case 'roll': {
      if(!['roll','move'].includes(s.phase)||s.throws<=0)throw Error('던질 수 없는 차례입니다.');
      let value;
      if(has(s,s.active,'choice')) {if(![1,2].includes(action.value))throw Error('도 또는 개를 고르세요.');value=action.value;} else value=rolledValue(s,rng);
      s.throws--;if(value>=4)s.throws++;
      s.pending.push({id:s.nextId++,value});note(s,`${p.name} · ${label(value)}${value>=4?'! 한 번 더':''}`);settle(s,rng);break;
    }
    case 'reroll': {
      const r=s.pending.find(x=>x.id===action.result);
      if(!['roll','move'].includes(s.phase)||!has(s,s.active,'reroll')||p.rerolled||!r||r.value>=4)throw Error('이 결과는 다시 던질 수 없습니다.');
      if(has(s,s.active,'choice')&&![1,2].includes(action.value))throw Error('도 또는 개를 고르세요.');
      p.rerolled=true;r.value=has(s,s.active,'choice')?action.value:rolledValue(s,rng);if(r.value>=4)s.throws++;
      note(s,`${p.name} · 다시 던져 ${label(r.value)}`);settle(s,rng);break;
    }
    case 'move': {
      const move=legalMoves(s).find(m=>m.token===action.token&&m.result===action.result&&m.route===action.route);
      if(!move)throw Error('이동할 수 없는 자리입니다.');
      const result=s.pending.find(x=>x.id===move.result),g=group(s,s.active,move.token),moved=walk(g[0],move.steps,move.route);
      s.pending=s.pending.filter(x=>x.id!==move.result);
      // Consume the old boost before applying a newly earned capture boost.
      if(move.steps>0){p.boost=0;p.strideUsed=true;}
      const outcome=NODES[move.to]?capture(s,s.active,move.to):{caught:0,blocked:false};
      if(!outcome.blocked) {
        for(const t of g){t.path=[...moved.path];t.done=moved.done;if(move.steps>0)t.returning=false;}
        note(s,`${p.name} ${g.map(t=>t.id+1).join('·')}번 말 ${move.steps===-1?'뒤로 1':move.steps}칸${moved.done?' · 완주!':''}`);
        if(outcome.caught&&result.value<4)s.throws++;
        if(moved.done&&has(s,s.active,'finish')&&!p.finishUsed){s.throws++;p.finishUsed=true;note(s,'완주의 기세 · 한 번 더!');}
      }
      checkWin(s,s.active);settle(s,rng);break;
    }
    case 'flick': {
      if(s.phase!=='flick')throw Error('알까기 차례가 아닙니다.');
      if(![action.dx,action.dy,action.power].every(Number.isFinite))throw Error('잘못된 알까기 입력입니다.');
      const t=p.tokens.find(t=>t.id===action.token),source=t&&NODES[position(t)];
      if(!source)throw Error('판 위의 내 말을 선택하세요.');
      const targets=[...new Set(s.players.flatMap((p,i)=>i===s.active?[]:p.tokens.map(position)))].filter(n=>NODES[n]).map(node=>({...NODES[node],node}));
      const shot=simulateFlick(source,action.dx,action.dy,action.power,targets);s.flick={...shot,owner:s.active,id:s.revision+1};
      if(shot.hit){const result=capture(s,s.active,shot.hit);if(result.caught)s.throws++;}else note(s,`${p.name} · 알까기 빗나감`);
      s.phase='roll';break;
    }
    case 'skipFlick':if(s.phase!=='flick')throw Error('알까기 차례가 아닙니다.');s.phase='roll';break;
    default:throw Error('알 수 없는 행동입니다.');
  }
  s.revision++;return s;
}
export function botAction(s,rng=Math.random) {
  if(s.phase==='augment') {
    const rank={choice:3,flick:4,tower:2,line:2,shield:7,hunter:8,solo:6,stride:6,finish:8,forward:4,comeback:5,reroll:6};
    return {type:'augment',id:[...s.offers].sort((a,b)=>rank[b]-rank[a])[0]};
  }
  if(s.phase==='flick') {
    for(const t of s.players[s.active].tokens)if(NODES[position(t)])for(const e of s.players.flatMap((p,i)=>i===s.active?[]:p.tokens))if(NODES[position(e)]) {
      const a=NODES[position(t)],b=NODES[position(e)];return {type:'flick',token:t.id,dx:b.x-a.x,dy:b.y-a.y,power:650};
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
