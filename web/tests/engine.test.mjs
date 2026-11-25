import {test} from 'node:test';
import assert from 'node:assert/strict';
import {AUGMENTS,NODES,act,createGame,walk,position,legalMoves,checkWin,simulateFlick,botAction,dopamineTurnsLeft,flickFromPull,FLICK_MAX_PULL,FLICK_MAX_TRAVEL,FLICK_MIN_PULL} from '../engine.mjs';
const fixed=()=>.4;
const fresh=()=>createGame(['청','홍'],true,fixed);
function put(s,p,id,path){s.players[p].tokens[id].path=Array.isArray(path)?path:[path];}
function pending(s,value){s.pending=[{id:1,value}];s.throws=0;s.phase='move';s.nextId=2;}
function move(s,id=0,route='outer'){return act(s,{type:'move',token:id,result:s.pending[0].id,route},fixed);}

test('29-node board and all 16 throws have the right distribution',()=>{
  assert.equal(Object.keys(NODES).length,29);const counts={};
  for(let bits=0;bits<16;bits++){const s=fresh();put(s,0,0,'o5');act(s,{type:'roll'},()=>(bits+.1)/16);const v=s.pending[0].value;counts[v]=(counts[v]||0)+1;}
  assert.deepEqual(counts,{'1':3,'2':6,'3':4,'4':1,'5':1,'-1':1});
});
test('four tokens finishing is the ordinary win, stacking alone is not',()=>{
  const s=fresh();for(let id=0;id<4;id++)put(s,0,id,'o4');checkWin(s,0);assert.equal(s.winner,null);
  for(const t of s.players[0].tokens)t.done=true;checkWin(s,0);assert.equal(s.winner,0);
});
test('starting, outer corner, passing a corner and finish boundary',()=>{
  const t=fresh().players[0].tokens[0];assert.equal(position(walk(t,1)),'o1');
  t.path=['o4'];assert.equal(position(walk(t,3,'shortcut')),'o7');
  t.path=['o5'];assert.equal(position(walk(t,3,'shortcut')),'c');assert.equal(position(walk(t,4,'shortcut')),'a4');
  t.path=['o10'];assert.equal(position(walk(t,5,'shortcut')),'b5');
  t.path=['o19'];assert.equal(position(walk(t,1)),'o0');assert.equal(position(walk(t,2)),'finish');
});
test('a center stop can take the short exit; passing continues straight',()=>{
  const t={id:0,path:['o5','a1','a2','c'],done:false};
  assert.equal(position(walk(t,1,'short')),'b4');assert.equal(position(walk(t,1,'long')),'a4');
});
test('backdo retraces the actual shortcut and cannot launch a reserve',()=>{
  const s=fresh();put(s,0,0,['o5','a1','a2','c']);pending(s,-1);move(s);assert.equal(position(s.players[0].tokens[0]),'a2');
  const home=fresh();pending(home,-1);assert.equal(legalMoves(home).length,0);
  const t={path:['o1'],done:false};assert.equal(position(walk(t,-1)),'home');
});
test('an unplayable backdo passes the turn without deadlocking',()=>{
  const s=fresh();act(s,{type:'roll'},()=>1.1/16);assert.equal(s.active,1);assert.equal(s.players[1].turn,1);
});
test('stacked tokens move and are captured together',()=>{
  const s=fresh();put(s,0,0,'o2');put(s,0,1,'o2');put(s,1,0,'o4');put(s,1,1,'o4');pending(s,2);move(s);
  assert.equal(position(s.players[0].tokens[0]),'o4');assert.equal(position(s.players[0].tokens[1]),'o4');
  assert.equal(position(s.players[1].tokens[0]),'home');assert.equal(position(s.players[1].tokens[1]),'home');assert.equal(s.throws,1);assert.equal(s.active,0);
});
test('yut and mo earn extra throws and allow results to accumulate',()=>{
  const s=fresh();act(s,{type:'roll'},()=>15.1/16);act(s,{type:'roll'},()=>0);act(s,{type:'roll'},()=>3.1/16);
  assert.deepEqual(s.pending.map(r=>r.value),[4,5,2]);assert.equal(s.throws,0);assert.equal(s.active,0);
});
test('capturing with yut does not duplicate its extra throw',()=>{
  const s=fresh();put(s,1,0,'o4');act(s,{type:'roll'},()=>15.1/16);move(s);assert.equal(s.throws,1);
});
test('shield cancels a capture and returns the attacker to its source',()=>{
  const s=fresh();s.players[1].shields=2;put(s,0,0,'o2');put(s,1,0,'o4');pending(s,2);move(s);
  assert.equal(position(s.players[0].tokens[0]),'o2');assert.equal(position(s.players[1].tokens[0]),'o4');assert.equal(s.players[1].shields,1);
});
test('special wins require the corresponding augment, four distinct consecutive nodes for line',()=>{
  const s=fresh();for(let i=0;i<4;i++)put(s,0,i,'c');s.players[0].augments=['tower'];checkWin(s,0);assert.equal(s.winner,0);
  const l=fresh();for(let i=0;i<4;i++)put(l,0,i,'o'+(i+1));checkWin(l,0);assert.equal(l.winner,null);l.players[0].augments=['line'];checkWin(l,0);assert.equal(l.winner,0);
  const gap=fresh();gap.players[0].augments=['line'];['o1','o2','o4','o5'].forEach((n,i)=>put(gap,0,i,n));checkWin(gap,0);assert.equal(gap.winner,null);
});
test('each player independently drafts at turn 5, 10, 15, with one reroll per game',()=>{
  const s=fresh();const history=[[],[]];let guard=0;
  while(s.players.some(p=>p.turn<16)&&guard++<200){
    if(s.phase==='augment'){
      const p=s.players[s.active];history[s.active].push(p.turn);assert.equal(s.offers.length,3);
      if(p.draftRerolls){const old=[...s.offers];act(s,{type:'draftReroll'},fixed);assert.ok(s.offers.every(x=>!old.includes(x)));assert.throws(()=>act(s,{type:'draftReroll'},fixed));}
      act(s,{type:'augment',id:s.offers.find(x=>x!=='choice')??s.offers[0]},fixed);
    }
    // Advance only through real legal rolls/moves; force all pieces back each turn so no accidental finish wins.
    for(const p of s.players)for(const t of p.tokens){t.path=[];t.done=false;}
    if(s.phase==='flick')act(s,{type:'skipFlick'},fixed);
    if(s.throws>0){const action={type:'roll',value:1};act(s,action,()=>1.1/16);}
    else if(s.pending.length){const a=legalMoves(s)[0];act(s,{type:'move',token:a.token,result:a.result,route:a.route},fixed);}
  }
  assert.ok(guard<200);assert.deepEqual(history,[[5,10,15],[5,10,15]]);assert.ok(s.players.every(p=>p.augments.length===3));
});
test('choice replaces randomness and rejects values other than do/gae',()=>{
  const s=fresh();s.players[0].augments=['choice'];assert.throws(()=>act(s,{type:'roll',value:5}));act(s,{type:'roll',value:2},()=>0);assert.equal(s.pending[0].value,2);
});
test('reroll can grant an extra throw only once per turn',()=>{
  const s=fresh();s.players[0].augments=['reroll'];pending(s,2);act(s,{type:'reroll',result:1},()=>0);assert.equal(s.pending[0].value,5);assert.equal(s.throws,1);assert.throws(()=>act(s,{type:'reroll',result:1}));
});
test('forward converts backdo to do; solo and stride increase the displayed and actual move',()=>{
  const s=fresh();s.players[0].augments=['forward','solo','stride'];s.players[0].turn=3;act(s,{type:'roll'},()=>1.1/16);
  assert.equal(s.pending[0].value,1);assert.equal(legalMoves(s)[0].steps,3);move(s);assert.equal(position(s.players[0].tokens[0]),'o3');
});
test('hunter keeps newly earned boosts and comeback only buffs a captured launch once',()=>{
  const s=fresh();s.players[0].augments=['hunter','comeback'];s.players[0].boost=1;put(s,1,0,'o3');pending(s,2);move(s);assert.equal(s.players[0].boost,1);
  s.players[0].tokens[1].returning=true;s.players[0].boost=0;pending(s,1);move(s,1);assert.equal(position(s.players[0].tokens[1]),'o3');assert.equal(s.players[0].tokens[1].returning,false);
});
test('finishing bonus activates once per turn, special wins also check immediately upon draft',()=>{
  const s=fresh();s.players[0].augments=['finish'];put(s,0,0,'o0');pending(s,1);move(s);assert.equal(s.throws,1);assert.equal(s.players[0].finishUsed,true);
  const d=fresh();for(let i=0;i<4;i++)put(d,0,i,'c');d.phase='augment';d.offers=['tower','line','choice'];act(d,{type:'augment',id:'tower'});assert.equal(d.winner,0);
});
test('flick swept collision hits the first target; limited power and misses do not capture',()=>{
  const src={x:0,y:0},targets=[{x:200,y:0,node:'first'},{x:400,y:0,node:'second'}];
  assert.equal(simulateFlick(src,1,0,650,targets).hit,'first');assert.equal(simulateFlick(src,1,0,80,targets).hit,null);assert.equal(simulateFlick(src,0,1,650,targets).hit,null);
});
test('flick obeys phase and defense and grants a bonus only for a successful hit',()=>{
  const s=fresh();s.players[0].augments=['flick'];put(s,0,0,'o1');put(s,1,0,'o4');s.phase='flick';act(s,{type:'flick',token:0,pullX:0,pullY:FLICK_MAX_PULL});assert.equal(position(s.players[1].tokens[0]),'home');assert.equal(s.throws,2);assert.equal(position(s.players[0].tokens[0]),'o1');
  assert.throws(()=>act(s,{type:'flick',token:0,pullX:0,pullY:FLICK_MAX_PULL}));
  const block=fresh();put(block,0,0,'o1');put(block,1,0,'o4');block.players[1].shields=1;block.phase='flick';act(block,{type:'flick',token:0,pullX:0,pullY:FLICK_MAX_PULL});assert.equal(block.throws,1);assert.equal(position(block.players[1].tokens[0]),'o4');
});
test('illegal moves, duplicate picks and inactive phase actions are rejected',()=>{
  const s=fresh();assert.throws(()=>act(s,{type:'move',token:0,result:1,route:'shortcut'}));assert.throws(()=>act(s,{type:'augment',id:'tower'}));assert.throws(()=>act(s,{type:'unknown'}));
});
test('seeded complete 2, 3 and 4 player AI matches terminate with valid states and at most three augments',()=>{
  for(const count of [2,3,4])for(let seed=1;seed<=60;seed++){
    let n=seed;const random=()=>{n=(Math.imul(n,1664525)+1013904223)>>>0;return n/4294967296;};const s=createGame(Array.from({length:count},(_,i)=>`P${i+1}`),true,random);let actions=0;
    while(s.winner===null&&actions++<2500){const action=botAction(s,random);assert.ok(action,`stuck at ${s.phase}`);act(s,action,random);for(const p of s.players){assert.ok(p.augments.length<=3);for(const t of p.tokens)assert.ok(['home','finish',...Object.keys(NODES)].includes(position(t)));}}
    assert.ok(s.winner!==null,`${count} players, seed ${seed} did not finish`);
  }
});
test('four players take independent turns in cyclic order and only the owner wins',()=>{
  const s=createGame(['A','B','C','D'],true,()=>0);
  for(let turn=0;turn<12;turn++){
    assert.equal(s.active,turn%4);act(s,{type:'roll'},()=>1.1/16);
  }
  assert.deepEqual(s.players.map(p=>p.turn),[4,3,3,3]);
  s.players[2].augments=['tower'];for(let i=0;i<4;i++)put(s,2,i,'c');checkWin(s,0);assert.equal(s.winner,null);checkWin(s,2);assert.equal(s.winner,2);
  assert.throws(()=>createGame(['only one']));assert.throws(()=>createGame(['a','b','c','d','e']));
});
test('ordinary captures can target any other player without touching the remaining players',()=>{
  for(const victim of [1,2,3]){
    const s=createGame(['A','B','C','D'],true,()=>0);put(s,victim,0,'o2');put(s,victim,1,'o2');put(s,(victim%3)+1,2,'o9');pending(s,2);move(s);
    assert.equal(position(s.players[victim].tokens[0]),'home');assert.equal(position(s.players[victim].tokens[1]),'home');assert.equal(s.throws,1);
    assert.equal(position(s.players[(victim%3)+1].tokens[2]),'o9');
  }
});
test('flick considers all three opponents and captures only the first collision',()=>{
  const s=createGame(['A','B','C','D'],true,()=>0);put(s,0,0,'o1');put(s,1,0,'o5');put(s,2,0,'o4');put(s,3,0,'o3');s.phase='flick';act(s,{type:'flick',token:0,pullX:0,pullY:FLICK_MAX_PULL});
  assert.equal(position(s.players[3].tokens[0]),'home');assert.equal(position(s.players[2].tokens[0]),'o4');assert.equal(position(s.players[1].tokens[0]),'o5');
});
function pick(s,id){s.phase='augment';s.offers=[id];act(s,{type:'augment',id},fixed);}
test('dopamine lasts exactly seven personal turns including the selection turn, then reduces forward steps',()=>{
  const s=fresh();s.players[0].turn=5;pick(s,'dopamine');const p=s.players[0];assert.equal(p.dopamineStart,5);
  for(let turn=5;turn<=11;turn++){p.turn=turn;pending(s,2);assert.equal(legalMoves(s)[0].steps,3);assert.equal(dopamineTurnsLeft(p),12-turn);}
  p.turn=12;pending(s,2);assert.equal(legalMoves(s)[0].steps,1);assert.equal(dopamineTurnsLeft(p),0);
  p.turn=50;pending(s,3);assert.equal(legalMoves(s)[0].steps,2);
  put(s,0,0,['o5','a1']);pending(s,-1);assert.equal(legalMoves(s)[0].steps,-1);move(s);assert.equal(position(p.tokens[0]),'o5');
});
test('extra throws and captures do not consume dopamine turns; the effect stays local to the owner',()=>{
  const s=fresh();s.players[0].turn=5;pick(s,'dopamine');act(s,{type:'roll'},()=>0);act(s,{type:'roll'},()=>15.1/16);assert.equal(dopamineTurnsLeft(s.players[0]),7);assert.equal(s.players[0].turn,5);
  put(s,1,0,'o3');pending(s,2);move(s);assert.equal(s.active,0);assert.equal(dopamineTurnsLeft(s.players[0]),7);
  s.active=1;pending(s,2);assert.equal(legalMoves(s)[0].steps,2);assert.equal(dopamineTurnsLeft(s.players[1]),0);
});
test('dopamine combines with other bonuses and a zero-step do is consumable without finishing or getting stuck',()=>{
  const s=fresh();s.players[0].turn=5;pick(s,'dopamine');s.players[0].turn=12;
  pending(s,1);assert.equal(legalMoves(s)[0].steps,0);move(s);assert.equal(position(s.players[0].tokens[0]),'home');assert.equal(s.active,1);
  s.active=0;put(s,0,0,'o0');pending(s,1);move(s);assert.equal(s.players[0].tokens[0].done,false);assert.equal(position(s.players[0].tokens[0]),'o0');
  s.active=0;put(s,0,0,'o5');pending(s,1);assert.deepEqual(legalMoves(s).filter(m=>m.token===0).map(m=>m.route),['outer']);
  s.players[0].augments.push('solo','stride');s.players[0].strideUsed=false;pending(s,1);assert.equal(legalMoves(s)[0].steps,2);
});
test('aunt grants three total immunities, protects the whole stack, and the fourth attack captures it',()=>{
  const s=fresh();s.active=1;pick(s,'aunt');s.active=0;for(let id=0;id<4;id++)put(s,1,id,'o4');s.players[0].augments=['hunter'];
  for(let attempt=1;attempt<=3;attempt++){
    s.active=0;put(s,0,0,'o2');pending(s,2);move(s);
    assert.equal(s.players[1].immunity,3-attempt);assert.ok(s.players[1].tokens.every(t=>position(t)==='o4'));assert.equal(position(s.players[0].tokens[0]),'o2');assert.equal(s.players[0].boost,0);assert.equal(s.active,1);assert.match(s.log.join('\n'),/어쩌라고/);
  }
  s.active=0;pending(s,2);move(s);assert.ok(s.players[1].tokens.every(t=>position(t)==='home'));assert.equal(s.throws,1);assert.equal(s.players[0].boost,1);
});
test('aunt immunity blocks flick capture without granting a bonus and is spent before the old shield',()=>{
  const s=fresh();s.active=1;pick(s,'shield');pick(s,'aunt');s.active=0;put(s,0,0,'o1');put(s,1,0,'o4');s.phase='flick';
  act(s,{type:'flick',token:0,pullX:0,pullY:FLICK_MAX_PULL});assert.equal(s.players[1].immunity,2);assert.equal(s.players[1].shields,2);assert.equal(s.throws,1);assert.equal(position(s.players[1].tokens[0]),'o4');
  for(let i=0;i<4;i++){s.active=0;put(s,0,0,'o2');pending(s,2);move(s);assert.equal(position(s.players[1].tokens[0]),'o4');}
  assert.equal(s.players[1].immunity,0);assert.equal(s.players[1].shields,0);s.active=0;pending(s,2);move(s);assert.equal(position(s.players[1].tokens[0]),'home');
});
test('banchan distribution is do/gae/geol with a reduced mo threshold and never yut or backdo',()=>{
  const threshold=(1/16)*.33,counts={};
  for(let i=0;i<1600;i++){
    const s=fresh();pick(s,'banchan');act(s,{type:'roll'},()=>(i+.5)/1600);const v=s.pending[0].value;assert.ok([1,2,3,5].includes(v));counts[v]=(counts[v]||0)+1;
  }
  assert.equal(counts[5],33);assert.equal(counts[1]+counts[2]+counts[3],1567);assert.ok(counts[2]>counts[1]);
  for(const [draw,value] of [[threshold-1e-9,5],[threshold,1]]){const s=fresh();pick(s,'banchan');act(s,{type:'roll'},()=>draw);assert.equal(s.pending[0].value,value);}
});
test('banchan mo grants exactly two additional rolls, including a reroll and a capture',()=>{
  const s=fresh();pick(s,'banchan');put(s,1,0,'o5');act(s,{type:'roll'},()=>0);assert.equal(s.throws,2);move(s);assert.equal(s.throws,2);assert.equal(position(s.players[1].tokens[0]),'home');assert.match(s.log.join('\n'),/두 번 더/);
  act(s,{type:'roll'},()=>.5);assert.equal(s.throws,1);act(s,{type:'roll'},()=>.5);assert.equal(s.throws,0);assert.equal(s.pending.length,2);
  const reroll=fresh();pick(reroll,'banchan');reroll.players[0].augments.push('reroll');pending(reroll,2);act(reroll,{type:'reroll',result:1},()=>0);assert.equal(reroll.throws,2);assert.equal(reroll.pending[0].value,5);
});
test('mutually exclusive throw replacements are filtered from drafting and draft rerolls',()=>{
  assert.equal(AUGMENTS.length,15);
  for(const [owned,excluded] of [['banchan','choice'],['choice','banchan']]){
    const s=createGame(['A','B'],true,()=>0);pick(s,owned);s.players[0].turn=9;s.active=1;act(s,{type:'roll'},()=>1.1/16);
    assert.equal(s.phase,'augment');assert.ok(!s.offers.includes(excluded));act(s,{type:'draftReroll'},()=>.9);assert.ok(!s.offers.includes(excluded));
  }
});
test('pull direction reverses on release and drag length scales power to a server-side cap',()=>{
  const short=flickFromPull(0,30),long=flickFromPull(0,90),max=flickFromPull(0,FLICK_MAX_PULL),beyond=flickFromPull(0,500);
  assert.equal(short.dy,-1);assert.equal(short.dx,0);assert.equal(long.power,short.power*3);assert.equal(max.power,FLICK_MAX_TRAVEL);assert.equal(beyond.power,max.power);
  assert.equal(flickFromPull(-40,0).dx,1);assert.equal(flickFromPull(0,-40).dy,1);
});
test('a miss kills the launching stack without affecting other pieces or spending immunity',()=>{
  const s=fresh();s.players[0].augments=['flick','aunt','shield'];s.players[0].immunity=3;s.players[0].shields=2;put(s,0,0,'o1');put(s,0,1,'o1');put(s,0,2,'o2');put(s,1,0,'o4');s.phase='flick';
  act(s,{type:'flick',token:1,pullX:-FLICK_MAX_PULL,pullY:0});
  assert.equal(position(s.players[0].tokens[0]),'home');assert.equal(position(s.players[0].tokens[1]),'home');assert.equal(position(s.players[0].tokens[2]),'o2');assert.equal(position(s.players[1].tokens[0]),'o4');
  assert.equal(s.players[0].immunity,3);assert.equal(s.players[0].shields,2);assert.equal(s.players[0].tokens[0].returning,true);assert.equal(s.throws,1);assert.equal(s.phase,'roll');assert.equal(s.flick.outcome,'miss');assert.deepEqual(s.flick.sourceTokens,[0,1]);assert.match(s.log[0],/탈락/);
});
test('aiming correctly with insufficient drag still misses; extra client power cannot prevent self-elimination',()=>{
  const weak=fresh();put(weak,0,0,'o1');put(weak,1,0,'o4');weak.phase='flick';act(weak,{type:'flick',token:0,pullX:0,pullY:FLICK_MIN_PULL,power:1e9});
  assert.equal(weak.flick.outcome,'miss');assert.equal(position(weak.players[0].tokens[0]),'home');assert.equal(position(weak.players[1].tokens[0]),'o4');
  const strong=fresh();put(strong,0,0,'o1');put(strong,1,0,'o4');put(strong,1,1,'o4');strong.phase='flick';act(strong,{type:'flick',token:0,pullX:0,pullY:90});
  assert.equal(strong.flick.outcome,'hit');assert.equal(position(strong.players[0].tokens[0]),'o1');assert.equal(position(strong.players[1].tokens[0]),'home');assert.equal(position(strong.players[1].tokens[1]),'home');assert.equal(strong.throws,2);assert.equal(strong.flick.victim,1);assert.deepEqual(strong.flick.victimTokens,[0,1]);
});
test('short taps, malformed drags and non-board launchers are rejected without changing the game',()=>{
  const s=fresh();put(s,0,0,'o1');put(s,1,0,'o4');s.phase='flick';const before=structuredClone(s);
  for(const action of [{token:0,pullX:0,pullY:0},{token:0,pullX:0,pullY:FLICK_MIN_PULL-.1},{token:0,pullX:NaN,pullY:80},{token:0,pullX:0,pullY:Infinity},{token:0,dx:0,dy:-1,power:760},{token:3,pullX:0,pullY:90}]){
    assert.throws(()=>act(s,{type:'flick',...action}));assert.deepEqual(s,before);
  }
  act(s,{type:'skipFlick'});assert.equal(position(s.players[0].tokens[0]),'o1');assert.equal(s.phase,'roll');
});
