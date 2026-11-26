import {test} from 'node:test';
import assert from 'node:assert/strict';
import {AUGMENTS,NODES,act,createGame,walk,position,legalMoves,checkWin,simulateFlick,botAction,dopamineTurnsLeft,dopamineDebuffTurnsLeft,flickFromPull,FLICK_MAX_PULL,FLICK_MAX_TRAVEL,FLICK_MIN_PULL,recruitOptions} from '../public/jeung-yut/engine.mjs';
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
});
test('backdo from the first square stops on the start square and the next move finishes',()=>{
  const s=fresh();put(s,0,0,'o1');pending(s,-1);move(s);assert.equal(position(s.players[0].tokens[0]),'o0');
  s.active=0;pending(s,1);move(s);assert.equal(s.players[0].tokens[0].done,true);
  assert.equal(position(walk({path:['o0'],done:false},-1)),'o19');
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
test('dopamine lasts seven personal turns, then ten debuff turns, then returns to normal',()=>{
  const s=fresh();s.players[0].turn=5;pick(s,'dopamine');const p=s.players[0];assert.equal(p.dopamineStart,5);
  for(let turn=5;turn<=11;turn++){p.turn=turn;pending(s,2);assert.equal(legalMoves(s)[0].steps,3);assert.equal(dopamineTurnsLeft(p),12-turn);}
  p.turn=12;pending(s,2);assert.equal(legalMoves(s)[0].steps,1);assert.equal(dopamineTurnsLeft(p),0);
  p.turn=21;pending(s,3);assert.equal(legalMoves(s)[0].steps,2);assert.equal(dopamineDebuffTurnsLeft(p),1);
  p.turn=22;pending(s,3);assert.equal(legalMoves(s)[0].steps,3);assert.equal(dopamineDebuffTurnsLeft(p),0);
  p.turn=50;pending(s,3);assert.equal(legalMoves(s)[0].steps,3);
  put(s,0,0,['o5','a1']);pending(s,-1);assert.equal(legalMoves(s)[0].steps,-1);move(s);assert.equal(position(p.tokens[0]),'o5');
});
test('extra throws and captures do not consume dopamine turns; the effect stays local to the owner',()=>{
  const s=fresh();s.players[0].turn=5;pick(s,'dopamine');act(s,{type:'roll'},()=>0);act(s,{type:'roll'},()=>15.1/16);assert.equal(dopamineTurnsLeft(s.players[0]),7);assert.equal(s.players[0].turn,5);
  put(s,1,0,'o3');pending(s,2);move(s);assert.equal(s.active,0);assert.equal(dopamineTurnsLeft(s.players[0]),7);
  assert.equal(dopamineDebuffTurnsLeft(s.players[0]),9);
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
  assert.equal(AUGMENTS.length,17);
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
function dopamineGame(turn=12){const s=fresh();s.players[0].turn=5;pick(s,'dopamine');s.players[0].turn=turn;return s;}
test('dopamine capture reduces the remaining debuff once per caught stack, and more catches reduce it in the same turn',()=>{
  const s=dopamineGame();put(s,1,0,'o1');put(s,1,1,'o1');pending(s,2);move(s);
  assert.equal(s.players[0].turn,12);assert.equal(dopamineDebuffTurnsLeft(s.players[0]),9);assert.equal(s.players[0].dopamineRelief,1);
  put(s,1,2,'o2');pending(s,2);move(s);
  assert.equal(dopamineDebuffTurnsLeft(s.players[0]),8);assert.equal(s.players[0].dopamineRelief,2);
  s.active=1;act(s,{type:'roll'},()=>0);assert.equal(dopamineDebuffTurnsLeft(s.players[0]),8);
  s.players[0].turn=13;assert.equal(dopamineDebuffTurnsLeft(s.players[0]),7);
});
test('finishing a stack reduces dopamine debuff by one turn, without counting each carried piece separately',()=>{
  const s=dopamineGame();put(s,0,0,'o0');put(s,0,1,'o0');pending(s,2);move(s);
  assert.ok(s.players[0].tokens[0].done);assert.ok(s.players[0].tokens[1].done);
  assert.equal(s.players[0].dopamineRelief,1);assert.equal(dopamineDebuffTurnsLeft(s.players[0]),9);assert.equal(s.winner,null);
});
test('buff-stage captures and finishes prepay future debuff without shortening the seven buff turns',()=>{
  const s=dopamineGame(5);put(s,1,0,'o2');pending(s,1);move(s);
  assert.equal(dopamineTurnsLeft(s.players[0]),7);assert.equal(dopamineDebuffTurnsLeft(s.players[0]),9);
  put(s,0,0,'o0');pending(s,1);move(s);
  assert.equal(dopamineTurnsLeft(s.players[0]),7);assert.equal(dopamineDebuffTurnsLeft(s.players[0]),8);
  s.players[0].turn=12;assert.equal(dopamineTurnsLeft(s.players[0]),0);assert.equal(dopamineDebuffTurnsLeft(s.players[0]),8);
});
test('a final debuff relief restores normal movement immediately for remaining results in the same turn',()=>{
  const s=dopamineGame();s.players[0].dopamineRelief=9;put(s,1,0,'o1');pending(s,2);
  assert.equal(legalMoves(s)[0].steps,1);move(s);assert.equal(dopamineDebuffTurnsLeft(s.players[0]),0);
  pending(s,2);assert.equal(legalMoves(s)[0].steps,2);
  put(s,1,1,'o3');move(s);assert.equal(s.players[0].dopamineRelief,10);assert.equal(dopamineDebuffTurnsLeft(s.players[0]),0);
});
test('successful flick captures reduce dopamine debuff, blocked hits and self-elimination do not',()=>{
  for(const defense of ['none','shield','aunt','miss']){
    const s=dopamineGame();put(s,0,0,'o1');put(s,1,0,'o4');s.phase='flick';
    if(defense==='shield')s.players[1].shields=1;if(defense==='aunt')s.players[1].immunity=1;
    act(s,{type:'flick',token:0,pullX:defense==='miss'?-90:0,pullY:defense==='miss'?0:90});
    assert.equal(dopamineDebuffTurnsLeft(s.players[0]),defense==='none'?9:10,defense);
    assert.equal(s.players[0].dopamineRelief,defense==='none'?1:0,defense);
  }
});
test('expired dopamine cannot regain a penalty, and older persisted players default missing relief to zero',()=>{
  const old=dopamineGame();delete old.players[0].dopamineRelief;assert.equal(dopamineDebuffTurnsLeft(old.players[0]),10);
  put(old,1,0,'o1');pending(old,2);move(old);assert.equal(old.players[0].dopamineRelief,1);
  const expired=dopamineGame(22);put(expired,1,0,'o2');pending(expired,2);move(expired);
  assert.equal(dopamineDebuffTurnsLeft(expired.players[0]),0);assert.equal(expired.players[0].dopamineRelief,0);
});
test('성어말?은 이동 확정 때 +1 15%, -1 15%, 정상 70%로 판정한다',()=>{
  const counts={o1:0,o2:0,o3:0};
  for(let i=0;i<1000;i++){
    const s=fresh();s.players[0].augments=['stutter'];pending(s,2);
    act(s,{type:'move',token:0,result:1,route:'outer'},()=>(i+.5)/1000);
    counts[position(s.players[0].tokens[0])]++;
  }
  assert.deepEqual(counts,{o1:150,o2:700,o3:150});
  for(const [draw,to] of [[0,'o3'],[.15-1e-9,'o3'],[.15,'o1'],[.3-1e-9,'o1'],[.3,'o2']]){
    const s=fresh();s.players[0].augments=['stutter'];pending(s,2);act(s,{type:'move',token:0,result:1,route:'outer'},()=>draw);assert.equal(position(s.players[0].tokens[0]),to);
  }
});
test('성어말? 미리보기는 예정 목적지이며 잘못된 요청은 확률을 소모하지 않는다',()=>{
  const s=fresh();s.players[0].augments=['stutter'];pending(s,2);let calls=0;const rng=()=>{calls++;return 0;};
  assert.equal(legalMoves(s)[0].to,'o2');assert.equal(legalMoves(s)[0].to,'o2');const before=structuredClone(s);
  assert.throws(()=>act(s,{type:'move',token:0,result:1,route:'shortcut'},rng));assert.equal(calls,0);assert.deepEqual(s,before);
  act(s,{type:'move',token:0,result:1,route:'outer'},rng);assert.equal(calls,1);assert.equal(position(s.players[0].tokens[0]),'o3');assert.match(s.log.join('\n'),/성어말.*예정 2 → 실제 3/);
});
test('성어말? 잡기는 예정 칸이 아닌 실제 도착 칸의 상대 묶음에만 적용한다',()=>{
  const s=fresh();s.players[0].augments=['stutter'];put(s,1,0,'o2');put(s,1,1,'o3');put(s,1,2,'o3');pending(s,2);
  act(s,{type:'move',token:0,result:1,route:'outer'},()=>0);
  assert.equal(position(s.players[0].tokens[0]),'o3');assert.equal(position(s.players[1].tokens[0]),'o2');assert.equal(position(s.players[1].tokens[1]),'home');assert.equal(position(s.players[1].tokens[2]),'home');assert.equal(s.throws,1);
  const blocked=fresh();blocked.players[0].augments=['stutter'];put(blocked,1,0,'o3');blocked.players[1].immunity=1;pending(blocked,2);act(blocked,{type:'move',token:0,result:1,route:'outer'},()=>0);
  assert.equal(position(blocked.players[0].tokens[0]),'home');assert.equal(position(blocked.players[1].tokens[0]),'o3');assert.equal(blocked.players[1].immunity,0);assert.match(blocked.log.join('\n'),/성어말.*어쩌라고/);
});
test('성어말? 업힌 말은 한 번 판정해 함께 이동하며 실제 칸의 내 말과 업힌다',()=>{
  const s=fresh();s.players[0].augments=['stutter'];put(s,0,0,'o1');put(s,0,1,'o1');put(s,0,2,'o4');pending(s,2);let calls=0;
  act(s,{type:'move',token:0,result:1,route:'outer'},()=>{calls++;return 0;});
  assert.equal(calls,1);assert.deepEqual(s.players[0].tokens.slice(0,3).map(position),['o4','o4','o4']);assert.equal(position(s.players[0].tokens[3]),'home');
});
test('성어말? 완주도 실제 칸으로 판정하며 -1로 이동량이 0이 되면 제자리다',()=>{
  const short=fresh();short.players[0].augments=['stutter','finish'];put(short,0,0,'o0');for(let i=1;i<4;i++)short.players[0].tokens[i].done=true;pending(short,1);
  act(short,{type:'move',token:0,result:1,route:'outer'},()=>.225);assert.equal(position(short.players[0].tokens[0]),'o0');assert.equal(short.winner,null);assert.equal(short.players[0].finishUsed,false);
  const home=fresh();home.players[0].augments=['stutter'];pending(home,1);act(home,{type:'move',token:0,result:1,route:'outer'},()=>.225);assert.equal(position(home.players[0].tokens[0]),'home');assert.equal(home.active,1);
  const long=fresh();long.players[0].augments=['stutter'];put(long,0,0,'o19');for(let i=1;i<4;i++)long.players[0].tokens[i].done=true;pending(long,1);
  act(long,{type:'move',token:0,result:1,route:'outer'},()=>0);assert.equal(position(long.players[0].tokens[0]),'finish');assert.equal(long.winner,0);
});
test('성어말?은 고른 지름길을 따라 이동하고 도파민 보정 이후에 적용한다',()=>{
  for(const [draw,to] of [[0,'a4'],[.225,'a2']]){
    const s=fresh();s.players[0].augments=['stutter'];put(s,0,0,'o5');pending(s,3);act(s,{type:'move',token:0,result:1,route:'shortcut'},()=>draw);assert.equal(position(s.players[0].tokens[0]),to);
  }
  const s=dopamineGame(5);s.players[0].augments.push('stutter');pending(s,2);assert.equal(legalMoves(s)[0].steps,3);
  act(s,{type:'move',token:0,result:1,route:'outer'},()=>.225);assert.equal(position(s.players[0].tokens[0]),'o2');
});
test('성어말?은 빽도·알까기·증강이 없는 말에는 적용하지 않는다',()=>{
  const unexpected=()=>{throw Error('확률 판정을 하면 안 됩니다.');};
  const back=fresh();back.players[0].augments=['stutter'];put(back,0,0,['o1','o2']);pending(back,-1);act(back,{type:'move',token:0,result:1,route:'outer'},unexpected);assert.equal(position(back.players[0].tokens[0]),'o1');
  const normal=fresh();pending(normal,2);act(normal,{type:'move',token:0,result:1,route:'outer'},unexpected);assert.equal(position(normal.players[0].tokens[0]),'o2');
  const flick=fresh();flick.players[0].augments=['stutter'];put(flick,0,0,'o1');put(flick,1,0,'o4');flick.phase='flick';act(flick,{type:'flick',token:0,pullX:0,pullY:90},unexpected);assert.equal(flick.flick.outcome,'hit');
});
function recruitGame(phase='roll'){
  const s=fresh(),p=s.players[0];p.augments=['recruit'];p.tokens[0].done=true;p.tokens[1].done=true;
  put(s,0,2,['o5','a1','a2']);p.tokens[3].returning=true;s.phase=phase;return s;
}
test('뒹학 집결은 완주 2개일 때 창고 말을 달리는 말에 업고 즉시 다음 턴으로 넘긴다',()=>{
  for(const phase of ['roll','move','flick']){
    const s=recruitGame(phase),p=s.players[0],target=[...p.tokens[2].path];
    assert.deepEqual(recruitOptions(s),[{reserve:3,target:2}]);
    act(s,{type:'recruit',reserve:3,target:2},fixed);
    assert.deepEqual(p.tokens[3].path,target);assert.notEqual(p.tokens[3].path,p.tokens[2].path);assert.equal(p.tokens[3].returning,false);
    assert.equal(p.recruitUsed,true);assert.equal(p.tokens.filter(t=>t.done).length,2);assert.equal(s.active,1);assert.equal(s.players[1].turn,1);assert.equal(s.round,2);assert.equal(s.winner,null);assert.match(s.log.join('\n'),/뒹학 사람좀 모아봐.*턴 종료/);
  }
});
test('집결은 남은 윷 결과·추가 던지기·알까기를 버리고 다음 사람은 새 턴을 시작한다',()=>{
  const s=recruitGame();s.pending=[{id:1,value:4},{id:2,value:2},{id:3,value:-1}];s.throws=3;s.flick={id:1};
  act(s,{type:'recruit',reserve:3,target:2},fixed);
  assert.deepEqual(s.pending,[]);assert.equal(s.throws,1);assert.equal(s.flick,null);assert.equal(s.phase,'roll');assert.equal(s.active,1);assert.equal(s.players[0].recruitUsed,true);
});
test('집결은 완주 수·창고·달리는 말·증강·단계 조건과 선택한 말을 검증한다',()=>{
  const invalids=[];
  for(const count of [0,1,3,4]){const s=recruitGame();s.players[0].tokens.forEach((t,i)=>{t.done=i<count;});invalids.push(s);}
  const noReserve=recruitGame();put(noReserve,0,3,'o4');invalids.push(noReserve);
  const noRunner=recruitGame();noRunner.players[0].tokens[2].path=[];invalids.push(noRunner);
  const noAugment=recruitGame();noAugment.players[0].augments=[];invalids.push(noAugment);
  for(const phase of ['augment','won']){const s=recruitGame(phase);invalids.push(s);}
  for(const s of invalids){const before=structuredClone(s);assert.deepEqual(recruitOptions(s),[]);assert.throws(()=>act(s,{type:'recruit',reserve:3,target:2},fixed));assert.deepEqual(s,before);}
  for(const action of [{reserve:2,target:3},{reserve:3,target:0},{reserve:3,target:3},{reserve:3,target:'2'},{}]){
    const s=recruitGame(),before=structuredClone(s);assert.throws(()=>act(s,{type:'recruit',...action},fixed));assert.deepEqual(s,before);
  }
});
test('집결 사용 횟수는 다음 자기 턴에도 남고 다시 창고로 돌아가도 재사용할 수 없다',()=>{
  const s=recruitGame();act(s,{type:'recruit',reserve:3,target:2},fixed);
  act(s,{type:'roll'},()=>1.1/16);assert.equal(s.active,0);assert.equal(s.players[0].recruitUsed,true);
  s.players[0].tokens[3].path=[];assert.deepEqual(recruitOptions(s),[]);const before=structuredClone(s);
  assert.throws(()=>act(s,{type:'recruit',reserve:3,target:2},fixed));assert.deepEqual(s,before);
});
test('집결한 묶음은 대상 말의 지름길 경로를 이어받아 빽도도 함께 움직인다',()=>{
  const s=recruitGame();act(s,{type:'recruit',reserve:3,target:2},fixed);act(s,{type:'roll'},()=>1.1/16);
  pending(s,-1);move(s,2);assert.equal(position(s.players[0].tokens[2]),'a1');assert.equal(position(s.players[0].tokens[3]),'a1');
});
test('집결 증강을 방금 골라도 조건이 맞으면 바로 사용할 수 있고 AI도 사용한다',()=>{
  const s=recruitGame();s.players[0].augments=[];s.players[0].turn=15;pick(s,'recruit');
  assert.deepEqual(botAction(s),{type:'recruit',reserve:3,target:2});act(s,botAction(s),fixed);assert.equal(s.players[0].recruitUsed,true);
  const freshMatch=createGame(['A','B'],true,fixed);assert.equal(freshMatch.players[0].recruitUsed,false);
});
test('집결은 전진·잡기·완주가 아니므로 다른 이동 증강이나 보너스를 발동하지 않는다',()=>{
  const s=recruitGame(),p=s.players[0];p.augments.push('dopamine','stutter');p.dopamineStart=5;p.turn=12;p.boost=2;
  act(s,{type:'recruit',reserve:3,target:2},()=>{throw Error('집결에 확률 판정을 하면 안 됩니다.');});
  assert.equal(position(p.tokens[3]),'a2');assert.equal(p.dopamineRelief,0);assert.equal(dopamineDebuffTurnsLeft(p),10);assert.equal(p.boost,2);assert.equal(p.tokens.filter(t=>t.done).length,2);
});
