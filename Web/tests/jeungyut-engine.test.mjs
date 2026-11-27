import {test} from 'node:test';
import assert from 'node:assert/strict';
import {AUGMENTS,NODES,act,createGame,walk,position,legalMoves,checkWin,simulateFlick,botAction,dopamineTurnsLeft,dopamineDebuffTurnsLeft,flickFromPull,FLICK_MAX_PULL,FLICK_MAX_TRAVEL,FLICK_MIN_PULL,recruitOptions,trapOptions,copyOption,swapReady,swapTargets,quakeReady,skillActions} from '../public/jeung-yut/engine.mjs';
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
test('the first player\'s 3·6·9th turn opens one draft everyone picks at once, each with a fresh reroll',()=>{
  const s=fresh();const rounds=[];let guard=0;
  while(s.players[s.first].turn<10&&s.winner===null&&guard++<300){
    if(s.phase==='draft'){
      rounds.push(s.players[s.first].turn);assert.equal(s.active,s.first);
      // The second player picks first: picks need not follow the turn order.
      for(const i of [1,0]) {
        const entry=s.draft[i];assert.equal(entry.offers.length,3);assert.equal(entry.rerolls,1);
        const old=[...entry.offers];act(s,{type:'draftReroll',player:i},fixed);assert.ok(s.draft[i].offers.every(x=>!old.includes(x)));
        assert.throws(()=>act(s,{type:'draftReroll',player:i},fixed));assert.throws(()=>act(s,{type:'roll'},fixed),/증강/);
        const id=s.draft[i].offers.find(x=>!['choice','objection','catlover','cat','chance'].includes(x))??s.draft[i].offers[0];act(s,{type:'augment',id,player:i},fixed);
        if(i===1&&s.winner===null){assert.equal(s.phase,'draft');assert.throws(()=>act(s,{type:'augment',id,player:1},fixed),/이미/);}
      }
      if(s.winner!==null)break;
      assert.notEqual(s.phase,'draft');assert.equal(s.draft,null);
    }
    // Advance only through real legal rolls/moves; force all pieces back each turn so no accidental finish wins.
    for(const p of s.players)for(const t of p.tokens){t.path=[];t.done=false;}
    if(s.phase==='flick')act(s,{type:'skipFlick'},fixed);
    if(s.throws>0){const action={type:'roll',value:1};act(s,action,()=>1.1/16);}
    else if(s.pending.length){const a=legalMoves(s)[0];act(s,{type:'move',token:a.token,result:a.result,route:a.route},fixed);}
  }
  assert.ok(guard<300);assert.equal(s.winner,null);assert.deepEqual(rounds,[3,6,9]);assert.ok(s.players.every(p=>p.drafts===3));
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
test('a successful flick takes the victim square and ends the turn; a blocked one keeps the throw',()=>{
  const s=fresh();s.active=0;s.players[0].augments=['flick'];put(s,0,0,'o1');put(s,1,0,['o1','o2','o3','o4']);s.phase='flick';act(s,{type:'flick',token:0,pullX:0,pullY:FLICK_MAX_PULL});assert.equal(position(s.players[1].tokens[0]),'home');assert.deepEqual(s.players[0].tokens[0].path,['o1','o2','o3','o4']);assert.equal(s.active,1);assert.equal(s.flick.outcome,'hit');assert.match(s.log.find(text=>text.includes('알까기')),/턴 종료/);
  assert.throws(()=>act(s,{type:'flick',token:0,pullX:0,pullY:FLICK_MAX_PULL}));
  const block=fresh();put(block,0,0,'o1');put(block,1,0,'o4');block.players[1].shields=1;block.phase='flick';act(block,{type:'flick',token:0,pullX:0,pullY:FLICK_MAX_PULL});assert.equal(block.throws,1);assert.equal(position(block.players[1].tokens[0]),'o4');
});
test('illegal moves, duplicate picks and inactive phase actions are rejected',()=>{
  const s=fresh();assert.throws(()=>act(s,{type:'move',token:0,result:1,route:'shortcut'}));assert.throws(()=>act(s,{type:'augment',id:'tower'}));assert.throws(()=>act(s,{type:'unknown'}));
});
test('seeded complete 2, 3 and 4 player AI matches terminate with valid states and at most three augments',()=>{
  for(const count of [2,3,4])for(let seed=1;seed<=60;seed++){
    let n=seed;const random=()=>{n=(Math.imul(n,1664525)+1013904223)>>>0;return n/4294967296;};const s=createGame(Array.from({length:count},(_,i)=>`P${i+1}`),true,random);let actions=0;
    while(s.winner===null&&actions++<2500){const action=botAction(s,random);assert.ok(action,`stuck at ${s.phase}`);act(s,action,random);const owners=new Map();for(const [i,p] of s.players.entries())for(const t of p.tokens){const at=position(t);if(NODES[at]){assert.ok(!owners.has(at)||owners.get(at)===i,`two players share ${at}`);owners.set(at,i);}}
    for(const p of s.players){assert.ok((p.drafts??p.augments.length)<=3);for(const t of p.tokens)assert.ok(['home','finish',...Object.keys(NODES)].includes(position(t)));}}
    assert.ok(s.winner!==null,`${count} players, seed ${seed} did not finish`);
  }
});
test('four players take turns clockwise around the board (1 → 2 → 4 → 3) and only the owner wins',()=>{
  const s=createGame(['A','B','C','D'],true,()=>0);
  for(let turn=0;turn<8;turn++){
    assert.equal(s.active,[0,1,3,2][turn%4]);act(s,{type:'roll'},()=>1.1/16);
  }
  assert.deepEqual(s.players.map(p=>p.turn),[3,2,2,2]);assert.equal(s.phase,'draft');
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
  assert.equal(AUGMENTS.length,79);
  for(const [owned,excluded] of [['banchan','choice'],['choice','banchan']]){
    const s=createGame(['A','B'],true,()=>0);pick(s,owned);s.players[0].turn=5;s.active=1;act(s,{type:'roll'},()=>1.1/16);
    assert.equal(s.phase,'draft');assert.ok(!s.draft[0].offers.includes(excluded));act(s,{type:'draftReroll',player:0},()=>.9);assert.ok(!s.draft[0].offers.includes(excluded));
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
  assert.equal(strong.flick.outcome,'hit');assert.equal(position(strong.players[0].tokens[0]),'o4');assert.equal(position(strong.players[1].tokens[0]),'home');assert.equal(position(strong.players[1].tokens[1]),'home');assert.equal(strong.active,1);assert.equal(strong.flick.victim,1);assert.deepEqual(strong.flick.victimTokens,[0,1]);
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
test('알까기 시간 초과는 던지지 않고 턴을 넘기며, 알까기 차례가 아니면 거부한다',()=>{
  const s=fresh();s.active=0;put(s,0,0,'o3');put(s,1,0,'o7');s.phase='flick';s.throws=1;
  act(s,{type:'flickTimeout'},fixed);
  assert.equal(s.active,1);assert.notEqual(s.phase,'flick');assert.equal(position(s.players[0].tokens[0]),'o3');
  assert.ok(s.log.some(text=>text.includes('알까기 시간 초과')));
  assert.throws(()=>act(s,{type:'flickTimeout'},fixed),/알까기 차례가 아닙니다/);
});
test('알까기로 지름길 위 상대를 잡으면 그 경로를 이어받아 다음 이동도 같은 길로 간다',()=>{
  const s=fresh();s.active=0;put(s,0,0,'o2');put(s,1,0,['o1','o2','o3','o4','o5','a1','a2']);s.phase='flick';
  const at=NODES.o2,to=NODES.a2,length=Math.hypot(to.x-at.x,to.y-at.y);
  act(s,{type:'flick',token:0,pullX:-(to.x-at.x)/length*FLICK_MAX_PULL,pullY:-(to.y-at.y)/length*FLICK_MAX_PULL});
  assert.equal(s.flick.hit,'a2');
  assert.equal(position(s.players[0].tokens[0]),'a2');assert.equal(position(walk(s.players[0].tokens[0],1)),'c');assert.equal(position(walk(s.players[0].tokens[0],-1)),'a1');
});
test('밤길 조심해: 3의 배수 턴에 내 말 칸에 덫을 놓고, 그 칸에 멈춘 상대 말은 대기로 돌아간다',()=>{
  const s=fresh();pick(s,'trap');s.players[0].turn=3;put(s,0,0,'o3');
  assert.deepEqual(trapOptions(s),['o3']);act(s,{type:'trap',node:'o3'},fixed);assert.deepEqual(trapOptions(s),[]);
  s.players[0].turn=4;assert.deepEqual(trapOptions(s),[]);
  s.active=1;put(s,1,0,'o1');pending(s,2);move(s);
  assert.equal(position(s.players[1].tokens[0]),'home');assert.equal(position(s.players[0].tokens[0]),'home');assert.deepEqual(s.traps,[]);
  const many=fresh();pick(many,'trap');many.traps=[{node:'o7',owner:0},{node:'o8',owner:0}];many.players[0].turn=6;put(many,0,0,'o3');act(many,{type:'trap',node:'o3'},fixed);
  assert.deepEqual(many.traps.map(trap=>trap.node),['o8','o3']);
});
test('비켜 비켜!: 멈춘 칸 바로 앞의 상대 묶음을 2칸 뒤로 밀고, 출발 직후 말은 밀지 않는다',()=>{
  const s=fresh();pick(s,'shove');put(s,0,0,'o2');put(s,1,0,['o1','o2','o3','o4','o5']);put(s,1,1,['o1','o2','o3','o4','o5']);pending(s,2);move(s);
  assert.equal(position(s.players[0].tokens[0]),'o4');assert.equal(position(s.players[1].tokens[0]),'o3');assert.equal(position(s.players[1].tokens[1]),'o3');
  const young=fresh();pick(young,'shove');put(young,1,0,['o1','o2']);pending(young,1);move(young);assert.equal(position(young.players[1].tokens[0]),'o2');
  const plain=fresh();put(plain,0,0,'o2');put(plain,1,0,['o1','o2','o3','o4','o5']);pending(plain,2);move(plain);assert.equal(position(plain.players[1].tokens[0]),'o5');
});
test('징크스: 2인전은 상대에게 바로, 3인 이상은 지목한 상대의 다음 3턴 윷·모가 걸로 바뀐다',()=>{
  const s=fresh();pick(s,'jinx');assert.equal(s.players[1].jinxUntil,3);assert.notEqual(s.phase,'jinx');
  s.active=1;s.players[1].turn=1;s.phase='roll';s.throws=1;s.pending=[];act(s,{type:'roll'},()=>15.1/16);assert.equal(s.pending[0].value,3);assert.equal(s.throws,0);
  s.players[1].turn=4;s.phase='roll';s.throws=1;s.pending=[];act(s,{type:'roll'},()=>15.1/16);assert.equal(s.pending[0].value,4);
  const three=createGame(['A','B','C'],true,()=>0);pick(three,'jinx');assert.equal(three.phase,'jinx');
  assert.throws(()=>act(three,{type:'jinx',target:0},fixed));act(three,{type:'jinx',target:2},fixed);
  assert.equal(three.players[2].jinxUntil,3);assert.equal(three.players[1].jinxUntil,0);assert.equal(three.phase,'roll');
  assert.equal(botAction(Object.assign(structuredClone(three),{phase:'jinx'})).type,'jinx');
});
test('따라쟁이: 직전 플레이어의 마지막 결과를 던지기 대신 쓰고, 추가 던지기 없이 판당 3회',()=>{
  const s=fresh();pick(s,'copy');assert.equal(copyOption(s),null);
  s.players[1].lastValue=4;assert.deepEqual(copyOption(s),{from:1,value:4});
  act(s,{type:'copy'},fixed);assert.equal(s.pending[0].value,4);assert.equal(s.throws,0);assert.equal(s.players[0].copies,2);assert.equal(copyOption(s),null);
});
test('자리 바꿔줘: 내 완주가 상대보다 적을 때만, 판당 한 번 자리를 맞바꾸고 턴을 끝낸다',()=>{
  const s=fresh();pick(s,'swap');put(s,0,0,'o2');put(s,1,0,['o1','o2','o3','o4','o5','a1']);
  assert.equal(swapReady(s),false);s.players[1].tokens[3].done=true;assert.equal(swapReady(s),true);
  assert.deepEqual(swapTargets(s,0),[{owner:1,token:0,node:'a1',count:1}]);
  act(s,{type:'swap',token:0,owner:1,target:0},fixed);
  assert.equal(position(s.players[0].tokens[0]),'a1');assert.equal(position(s.players[1].tokens[0]),'o2');assert.equal(s.active,1);
  s.active=0;s.phase='roll';assert.equal(swapReady(s),false);assert.throws(()=>act(s,{type:'swap',token:0,owner:1,target:0},fixed));
});
test('지진났다: 판당 한 번 판 위의 모든 말이 1칸 뒤로, 같은 편 묶음은 두 번 밀리지 않는다',()=>{
  const s=fresh();pick(s,'quake');put(s,0,0,'o3');put(s,0,1,'o4');put(s,1,0,['o1','o2','o3','o4','o5','o6']);
  assert.equal(quakeReady(s),true);act(s,{type:'quake'},fixed);
  assert.equal(position(s.players[0].tokens[0]),'o2');assert.equal(position(s.players[0].tokens[1]),'o3');assert.equal(position(s.players[1].tokens[0]),'o5');
  assert.equal(s.active,0);assert.equal(s.phase,'roll');assert.equal(quakeReady(s),false);
});
test('실손보험: 잡힌 말은 판당 2회 3번 칸에서 다시 출발하고, 3번 칸에 다른 말이 있으면 대기로 간다',()=>{
  const s=fresh();s.active=1;pick(s,'insurance');s.active=0;put(s,0,0,'o2');put(s,1,0,['o1','o2','o3','o4']);pending(s,2);move(s);
  assert.equal(position(s.players[1].tokens[0]),'o3');assert.equal(s.players[1].insurance,1);assert.equal(s.players[1].tokens[0].returning,false);
  const busy=fresh();busy.active=1;pick(busy,'insurance');busy.active=0;put(busy,0,0,'o2');put(busy,0,1,'o3');put(busy,1,0,['o1','o2','o3','o4']);pending(busy,2);move(busy);
  assert.equal(position(busy.players[1].tokens[0]),'home');assert.equal(busy.players[1].insurance,2);
});
test('무거운 짐: 업은 묶음은 일반 잡기에 잡히지 않고 1칸 덜 가지만, 알까기는 막지 못한다',()=>{
  const s=fresh();s.active=1;pick(s,'heavy');s.active=0;put(s,1,0,['o1','o2','o3','o4']);put(s,1,1,['o1','o2','o3','o4']);put(s,0,0,'o2');pending(s,2);move(s);
  assert.equal(position(s.players[1].tokens[0]),'o4');assert.equal(position(s.players[0].tokens[0]),'o2');
  const slow=fresh();pick(slow,'heavy');put(slow,0,0,'o2');put(slow,0,1,'o2');pending(slow,3);assert.equal(legalMoves(slow).find(m=>m.token===0).steps,2);
  pending(slow,1);assert.equal(legalMoves(slow).find(m=>m.token===0).steps,1);
  const flick=fresh();flick.active=1;pick(flick,'heavy');flick.active=0;put(flick,0,0,'o1');put(flick,1,0,'o4');put(flick,1,1,'o4');flick.phase='flick';
  act(flick,{type:'flick',token:0,pullX:0,pullY:FLICK_MAX_PULL});assert.equal(flick.flick.outcome,'hit');assert.equal(position(flick.players[1].tokens[0]),'home');
});
test('이리 오너라 업고 놀자: 대기 말이 모두 업은 채 도 칸에 서고, 도 칸의 상대는 잡힌다',()=>{
  const s=fresh();put(s,0,0,'o5');put(s,1,0,'o1');pick(s,'piggy');
  assert.deepEqual(s.players[0].tokens.map(position),['o5','o1','o1','o1']);assert.equal(position(s.players[1].tokens[0]),'home');
});
test('웅녀: 마늘 4개가 빈 칸에 놓이고, 모두 주우면 승리한다',()=>{
  const s=fresh();pick(s,'garlic');const garlic=s.players[0].garlic;
  assert.equal(new Set(garlic).size,4);assert.ok(garlic.every(node=>NODES[node]&&node!=='o0'));
  s.players[0].garlic=['o3'];put(s,0,0,'o1');pending(s,2);move(s);
  assert.equal(s.winner,0);assert.match(s.winReason,/웅녀/);
});
test('천상천하 유아독존: 판 위가 내 업은 묶음 하나뿐이면 승리, 상대 말이 있거나 혼자면 아니다',()=>{
  const s=fresh();pick(s,'alone');put(s,0,0,'o3');put(s,0,1,'o3');put(s,1,0,'o9');checkWin(s,0);assert.equal(s.winner,null);
  put(s,1,0,[]);put(s,0,1,[]);checkWin(s,0);assert.equal(s.winner,null);
  put(s,0,1,'o3');checkWin(s,0);assert.equal(s.winner,0);
});
test('김첨지: 가장 앞선 말이 김첨지가 되고, 내 6턴 안에 완주하면 승리한다',()=>{
  const s=fresh();s.players[0].turn=5;put(s,0,2,['o1','o2','o3','o4','o5','o6','o7','o8','o9','o10','o11','o12','o13','o14','o15','o16','o17','o18','o19']);pick(s,'kim');
  assert.equal(s.players[0].kimToken,2);assert.equal(s.players[0].kimUntil,10);
  pending(s,2);move(s,2);assert.equal(s.winner,0);assert.match(s.winReason,/김첨지/);
  const late=fresh();late.players[0].turn=5;pick(late,'kim');late.players[0].turn=11;put(late,0,0,['o19']);pending(late,2);move(late);assert.equal(late.winner,null);
});
test('말이오? 파티: 함정 6개·보상 4개, 함정은 상대만 잡고 보상은 누구든 한 번 더 던진다',()=>{
  const s=fresh();pick(s,'party');
  assert.equal(s.traps.filter(x=>x.kind==='party').length,6);assert.equal(s.traps.filter(x=>x.kind==='reward').length,4);
  s.traps=[{node:'o2',owner:0,kind:'party'},{node:'o3',owner:0,kind:'reward'}];
  put(s,0,0,'o1');pending(s,1);move(s);assert.equal(position(s.players[0].tokens[0]),'o2');
  s.active=1;put(s,1,0,'o1');pending(s,2);move(s);assert.equal(position(s.players[1].tokens[0]),'o3');assert.equal(s.throws,1);assert.equal(s.traps.length,1);
  s.active=1;put(s,1,1,'o1');pending(s,1);move(s,1);assert.equal(position(s.players[1].tokens[1]),'home');assert.equal(s.traps.length,0);
});
test('등가교환·짐덩이와 복덩이: 말 수와 윷가락 수가 바뀌고, 승리 조건과 던지기 분포가 따라간다',()=>{
  const s=fresh();put(s,0,0,'o4');pick(s,'trade');
  assert.equal(s.players[0].tokens.length,3);assert.deepEqual(s.players[0].tokens.map(t=>t.id),[0,1,2]);assert.equal(position(s.players[0].tokens[0]),'o4');
  const values=new Set();for(let bits=0;bits<8;bits++){const t=fresh();pick(t,'trade');t.phase='roll';t.throws=1;t.pending=[];act(t,{type:'roll'},()=>(bits+.1)/8);values.add(t.lastRoll.value);}
  assert.ok(!values.has(4));assert.ok(values.has(5));
  for(const t of s.players[0].tokens)t.done=true;checkWin(s,0);assert.equal(s.winner,0);assert.match(s.winReason,/3개/);
  const b=fresh();pick(b,'bundle');assert.equal(b.players[0].tokens.length,5);assert.equal(b.players[0].sticks,5);
  for(const t of b.players[0].tokens.slice(0,4))t.done=true;checkWin(b,0);assert.equal(b.winner,null);
  const all=fresh();pick(all,'bundle');all.phase='roll';all.throws=1;all.pending=[];act(all,{type:'roll'},()=>31.1/32);assert.equal(all.pending[0].value,5);
  const both=fresh();pick(both,'trade');both.players[0].turn=9;both.active=1;act(both,{type:'roll'},()=>1.1/16);
  for(let i=0;i<20&&both.phase==='augment';i++){assert.ok(!both.offers.includes('bundle'));both.players[0].draftRerolls=1;act(both,{type:'draftReroll'},()=>i/20);}
});

// ---------- 나무위키 범용·중간·마무리 증강 ----------
const lane=n=>Array.from({length:n},(_,i)=>'o'+(i+1));
const rollWith=(id,draw)=>{const t=fresh();pick(t,id);t.phase='roll';t.throws=1;t.pending=[];act(t,{type:'roll'},typeof draw==='function'?draw:()=>draw);return t;};
// Ends the other player's turn so player 0's next turn starts (start-of-turn effects run then).
const nextTurnOf0=s=>{s.active=1;s.phase='flick';act(s,{type:'flickTimeout'},fixed);};
test('고양이·간택·애묘인: 고양이를 고른 사람이 생기면 애묘인이 이기고, 간택이 있으면 고양이를 꼭 골라야 한다',()=>{
  const s=createGame(['A','B','C'],true,()=>0);s.active=1;pick(s,'catlover');s.active=0;pick(s,'cat');assert.equal(s.winner,1);
  const forced=fresh();forced.active=1;pick(forced,'chosen');forced.active=0;let seen=false;
  for(let k=0;k<100&&!seen;k++){forced.phase='augment';forced.offers=['tower'];forced.players[0].draftRerolls=1;act(forced,{type:'draftReroll'},()=>k/100);if(forced.offers.includes('cat')){assert.deepEqual(forced.offers,['cat']);seen=true;}}
  assert.ok(seen);
});
test('과유불급·모 아니면 도·이도류: 윷가락과 결과 분포가 바뀐다',()=>{
  assert.equal(rollWith('excess',63.1/64).lastRoll.value,0);assert.equal(rollWith('excess',31.1/64).lastRoll.value,4);assert.equal(rollWith('excess',0).lastRoll.value,5);
  assert.equal(rollWith('moordo',.1).lastRoll.value,5);assert.equal(rollWith('moordo',.5).lastRoll.value,1);
  const yut=rollWith('dual',15.1/16);assert.deepEqual(yut.pending.map(r=>r.value),[4,4]);assert.equal(yut.throws,2);
  assert.deepEqual(rollWith('dual',0).pending.map(r=>r.value),[1,1]);
});
test('개들을 풀어라·도베르만·외톨이·손은 눈보다 빠르다·슬쩍!: 결과를 얻거나 바꾼다',()=>{
  const dogs=fresh();pick(dogs,'dogs');act(dogs,{type:'dogs'},fixed);assert.deepEqual(dogs.pending.map(r=>r.value),[2]);assert.equal(dogs.throws,1);assert.equal(dogs.players[0].uses.dogs,2);
  const dob=fresh();pick(dob,'doberman');dob.players[0].gaeCount=5;act(dob,{type:'doberman'},fixed);assert.deepEqual(dob.pending.map(r=>r.value),[5,5,5]);
  const lone=fresh();pick(lone,'loner');act(lone,{type:'loner'},fixed);assert.deepEqual(lone.pending.map(r=>r.value),[3]);
  const hand=fresh();pick(hand,'hand');act(hand,{type:'hand',value:4},fixed);assert.deepEqual(hand.pending.map(r=>r.value),[4]);assert.equal(hand.throws,1);
  assert.throws(()=>act(hand,{type:'hand',value:5},fixed));
  const sneak=fresh();pick(sneak,'sneak');pending(sneak,3);act(sneak,{type:'sneak',result:1,value:4},fixed);assert.equal(sneak.pending[0].value,4);
  assert.throws(()=>act(sneak,{type:'sneak',result:1,value:1},fixed));
  assert.throws(()=>act(fresh(),{type:'dogs'},fixed),/쓸 수 없는/);
});
test('대출·윷을 잘 던져봐·메아리의 형상: 차례를 건너뛰거나 두 번 한다',()=>{
  const loan=fresh();pick(loan,'loan');act(loan,{type:'loan'},fixed);assert.equal(loan.throws,2);assert.equal(loan.players[0].skip,1);
  const skip=fresh();skip.players[1].skip=1;act(skip,{type:'roll'},()=>1.1/16);assert.equal(skip.active,0);assert.equal(skip.players[1].skip,0);assert.equal(skip.players[0].turn,2);
  const three=createGame(['A','B','C'],true,()=>0);pick(three,'throwhit');act(three,{type:'throwhit',target:2},fixed);assert.equal(three.players[2].skip,2);
  const echo=fresh();pick(echo,'echo');act(echo,{type:'roll'},()=>1.1/16);assert.equal(echo.active,0);assert.equal(echo.players[0].turn,2);
  act(echo,{type:'roll'},()=>1.1/16);assert.equal(echo.active,1);
});
test('명사수·사신·마신 소환·영역 전개: 내 차례가 시작될 때 발동한다',()=>{
  const snipe=fresh();pick(snipe,'sniper');put(snipe,1,0,'o7');act(snipe,{type:'snipe',node:'o7'},fixed);assert.equal(snipe.active,1);
  nextTurnOf0(snipe);assert.equal(position(snipe.players[1].tokens[0]),'home');
  const reaper=fresh();pick(reaper,'reaper');put(reaper,1,0,[...lane(5),'a1','a2']);nextTurnOf0(reaper);assert.equal(reaper.reaper.node,'a2');assert.equal(position(reaper.players[1].tokens[0]),'home');
  const cult=fresh();pick(cult,'cult');put(cult,0,0,'o3');put(cult,0,1,'o5');cult.players[0].coins=10;nextTurnOf0(cult);assert.equal(cult.winner,0);
  const domain=fresh();pick(domain,'domain');put(domain,0,0,'o3');act(domain,{type:'domain',token:0},fixed);
  domain.active=0;pending(domain,2);assert.ok(!legalMoves(domain).some(m=>m.token===0));
  domain.players[0].turn=domain.players[0].domain.until-1;nextTurnOf0(domain);assert.equal(domain.winner,0);assert.match(domain.winReason,/영역 전개/);
});
test('바둑·시간 여행·8톤 트럭·3단 합체 필살기: 판 위 기술',()=>{
  const baduk=fresh();pick(baduk,'baduk');put(baduk,0,0,'o1');put(baduk,0,1,'o5');put(baduk,1,0,'o3');act(baduk,{type:'baduk'},fixed);
  assert.equal(position(baduk.players[1].tokens[0]),'home');assert.equal(baduk.throws,2);
  const travel=fresh();pick(travel,'timetravel');put(travel,0,0,lane(4));put(travel,1,0,'o2');act(travel,{type:'timetravel',token:0,steps:2},fixed);
  assert.equal(position(travel.players[0].tokens[0]),'o2');assert.equal(position(travel.players[1].tokens[0]),'home');
  const truck=fresh();pick(truck,'truck');put(truck,0,0,'o2');put(truck,0,1,'o2');put(truck,1,0,'o7');
  assert.ok(skillActions(truck,0).some(o=>o.action?.type==='truck'));act(truck,{type:'truck',token:0},fixed);
  assert.equal(position(truck.players[0].tokens[0]),'o6');assert.equal(position(truck.players[0].tokens[1]),'o6');assert.equal(truck.active,1);
  const combo=fresh();pick(combo,'combo');for(const id of [0,1,2])put(combo,0,id,lane(4));put(combo,0,3,'o8');put(combo,1,0,'o10');act(combo,{type:'combo',token:0},fixed);
  assert.equal(position(combo.players[1].tokens[0]),'home');assert.equal(position(combo.players[0].tokens[3]),'home');assert.equal(position(combo.players[0].tokens[0]),'o4');assert.equal(combo.active,1);
});
test('암살자의 영혼·히히 똥!·천상의 보호막·희생: 지나가거나 잡힐 때 발동한다',()=>{
  const soul=fresh();soul.active=1;pick(soul,'assassin');put(soul,1,0,'o3');act(soul,{type:'assassin',token:0},fixed);
  soul.active=0;put(soul,0,0,'o1');pending(soul,4);move(soul);assert.equal(position(soul.players[0].tokens[0]),'home');assert.equal(soul.players[1].tokens[0].soul,false);
  const poop=fresh();poop.active=1;pick(poop,'poop');assert.equal(poop.traps.filter(x=>x.kind==='poop').length,3);poop.traps=[{node:'o3',owner:1,kind:'poop'}];
  poop.active=0;put(poop,0,0,'o1');pending(poop,4);move(poop);assert.equal(position(poop.players[0].tokens[0]),'o3');assert.deepEqual(poop.traps,[]);
  const heaven=fresh();heaven.active=1;pick(heaven,'heaven');put(heaven,1,0,'o3');act(heaven,{type:'heaven',token:0},fixed);
  heaven.active=0;put(heaven,0,0,'o1');pending(heaven,2);move(heaven);assert.equal(position(heaven.players[1].tokens[0]),'o3');assert.equal(position(heaven.players[0].tokens[0]),'o1');assert.equal(heaven.players[1].tokens[0].shielded,false);
  const sac=fresh();pick(sac,'sacrifice');put(sac,0,0,'o3');put(sac,0,1,'o5');act(sac,{type:'sacrifice',token:0},fixed);
  assert.equal(position(sac.players[0].tokens[0]),'home');assert.equal(sac.players[0].tokens[1].shielded,true);
});
test('프렌드 실드·화톳불·카니발리즘: 잡힘과 업기가 바뀐다',()=>{
  const friend=fresh();friend.active=1;pick(friend,'friend');put(friend,1,0,lane(4));put(friend,1,1,lane(4));
  friend.active=0;put(friend,0,0,'o2');pending(friend,2);move(friend);
  assert.equal(position(friend.players[1].tokens[0]),'home');assert.equal(position(friend.players[1].tokens[1]),'o3');assert.equal(position(friend.players[0].tokens[0]),'o4');
  const fire=fresh();fire.active=1;pick(fire,'bonfire');put(fire,1,0,lane(6));act(fire,{type:'bonfire',token:0},fixed);put(fire,1,0,lane(8));
  fire.active=0;put(fire,0,0,lane(5));pending(fire,3);move(fire);assert.equal(position(fire.players[1].tokens[0]),'o6');assert.equal(fire.players[1].bonfire,null);
  const eat=fresh();pick(eat,'cannibal');put(eat,0,0,'o1');put(eat,0,1,'o3');pending(eat,2);move(eat);
  assert.equal(position(eat.players[0].tokens[1]),'home');assert.equal(position(eat.players[0].tokens[0]),'o3');assert.equal(eat.throws,1);
});
test('크고 빨간 버튼·나만 아니면 돼~·잠깐!·평화 협정: 상대 말에 바로 작용한다',()=>{
  const red=fresh();put(red,0,0,[...lane(5),'a1']);put(red,1,0,[...lane(10),'b1','b2','c']);put(red,1,1,'o7');pick(red,'redbutton');
  assert.equal(position(red.players[0].tokens[0]),'home');assert.equal(position(red.players[1].tokens[0]),'home');assert.equal(position(red.players[1].tokens[1]),'o7');
  const nme=fresh();put(nme,1,0,'o4');put(nme,1,1,'o9');pick(nme,'nme');assert.ok(nme.players[1].tokens.every(t=>position(t)==='home'));
  const wait=fresh();put(wait,1,0,lane(6));put(wait,1,1,'o2');pick(wait,'wait');wait.active=1;wait.players[1].turn=1;pending(wait,1);
  assert.ok(!legalMoves(wait).some(m=>m.token===0));assert.ok(legalMoves(wait).some(m=>m.token===1));
  const peace=fresh();peace.active=1;pick(peace,'peace');peace.active=0;put(peace,0,0,'o1');put(peace,1,0,'o3');pending(peace,2);
  assert.ok(!legalMoves(peace).some(m=>m.to==='o3'));
});
test('독이 든 성배·라스트 댄스: 던지기를 더 얻는 대신 대가를 치른다',()=>{
  const cup=fresh();pick(cup,'chalice');put(cup,0,0,'o3');act(cup,{type:'chalice'},fixed);assert.equal(cup.throws,4);
  act(cup,{type:'roll'},()=>0);assert.equal(position(cup.players[0].tokens[0]),'home');assert.equal(cup.active,1);
  const dance=fresh();pick(dance,'lastdance');put(dance,0,0,'o1');act(dance,{type:'lastdance'},fixed);assert.equal(dance.throws,3);
  dance.pending=[{id:1,value:2}];dance.throws=0;dance.phase='move';dance.nextId=2;assert.equal(legalMoves(dance).find(m=>m.token===0).steps,4);
  move(dance);assert.equal(position(dance.players[0].tokens[0]),'home');assert.equal(dance.active,1);
});
test('777·악보·소 뒷걸음질·마라토너·무신정변·나만 친구 없어: 특수 승리',()=>{
  const seven=fresh();pick(seven,'lucky7');seven.throws=3;for(let k=0;k<3;k++)act(seven,{type:'roll'},()=>.5);assert.equal(seven.winner,0);
  const score=fresh();pick(score,'score');score.players[0].thrown=[-1,1,2,3,4];act(score,{type:'roll'},()=>0);assert.equal(score.winner,0);
  const cow=fresh();pick(cow,'backcow');put(cow,0,0,lane(4));put(cow,1,0,lane(3));pending(cow,-1);move(cow);assert.equal(cow.winner,0);
  const run=fresh();pick(run,'marathon');assert.equal(run.players[0].marathon,3);put(run,0,3,['o19']);pending(run,2);move(run,3);assert.equal(run.winner,0);
  const coup=fresh();pick(coup,'coup');coup.players[0].coupKills=3;put(coup,0,0,'o1');put(coup,1,0,'o3');pending(coup,2);move(coup);assert.equal(coup.winner,0);
  const alone=createGame(['A','B','C'],true,()=>0);pick(alone,'lonely');
  alone.active=1;put(alone,0,0,'o3');put(alone,1,0,'o1');pending(alone,2);move(alone);assert.equal(alone.winner,null);
  alone.active=2;put(alone,0,0,'o3');put(alone,2,0,'o1');pending(alone,2);move(alone);assert.equal(alone.winner,0);
});
test('역모·자진모리 장단·어부지리·선봉장·역전 찬스·이의있음!',()=>{
  const treason=fresh();pick(treason,'treason');treason.players[1].tokens[3].done=true;put(treason,0,0,'o1');put(treason,1,0,'o3');pending(treason,2);move(treason);assert.equal(treason.throws,2);
  const beat=fresh();pick(beat,'jajinmori');beat.throws=2;act(beat,{type:'roll'},()=>7.1/16);act(beat,{type:'roll'},()=>7.1/16);assert.deepEqual(beat.pending.map(r=>r.value).sort(),[2,3,3]);
  const fish=createGame(['A','B','C'],true,()=>0);fish.active=2;pick(fish,'fisher');fish.active=0;put(fish,1,0,'o3');put(fish,1,1,'o3');put(fish,0,0,'o1');pending(fish,2);move(fish);assert.equal(fish.players[2].fishBonus,1);
  const van=fresh();put(van,0,0,'o3');pick(van,'vanguard');assert.equal(van.players[0].vanguard,0);pending(van,2);assert.equal(legalMoves(van).find(m=>m.token===1).steps,3);
  const chance=fresh();pick(chance,'chance');assert.equal(chance.players[0].augments.length,5);assert.equal(chance.players[0].drafts,1);
  const redo=fresh();pick(redo,'objection');assert.equal(redo.phase,'augment');assert.equal(redo.offers.length,3);assert.ok(!redo.players[0].augments.includes('objection'));
});
test('증강 선택 시간 초과: 안 고른 사람은 맨 앞 증강(이의있음! 제외)이 자동으로 골라지고 게임이 이어진다',()=>{
  const s=createGame(['A','B','C'],true,()=>0);s.players[0].turn=2;s.active=2;act(s,{type:'roll'},()=>1.1/16);assert.equal(s.phase,'draft');
  s.draft[1].offers=['objection','tower','line'];s.draft[2].offers=['jinx','tower','line'];
  act(s,{type:'augment',id:s.draft[0].offers.find(x=>!['objection','jinx','cat','catlover','chance'].includes(x)),player:0},fixed);
  act(s,{type:'draftTimeout'},fixed);
  assert.equal(s.draft,null);assert.notEqual(s.phase,'draft');assert.equal(s.active,0);
  assert.ok(s.players[1].augments.includes('tower'));assert.ok(s.players[2].augments.includes('jinx'));
  assert.ok(s.players.some((p,i)=>i!==2&&p.jinxUntil>0));assert.ok(s.players.every(p=>p.drafts===1));
});
test('첫 차례는 무작위로 정해지고 "OO님 선!"을 알린 뒤, 그 사람부터 시계 방향으로 돈다',()=>{
  const firsts=new Set();
  for(let k=0;k<4;k++){const s=createGame(['A','B','C','D'],true,()=>(k+.5)/4);firsts.add(s.first);assert.equal(s.active,s.first);assert.ok(s.log.includes(`${s.players[s.first].name}님 선! 시계 방향으로 차례가 돌아갑니다.`));}
  assert.equal(firsts.size,4);
  const s=createGame(['A','B','C','D'],true,()=>.6);assert.equal(s.first,2);const seen=[];
  for(let k=0;k<4;k++){seen.push(s.active);act(s,{type:'roll'},()=>1.1/16);}
  assert.deepEqual(seen,[2,0,1,3]);
  const three=createGame(['A','B','C'],true,()=>.9);assert.equal(three.first,2);act(three,{type:'roll'},()=>1.1/16);assert.equal(three.active,0);
  const copy=createGame(['A','B','C','D'],true,()=>0);copy.active=2;copy.players[2].augments=['copy'];copy.players[2].copies=3;copy.players[3].lastValue=4;copy.players[1].lastValue=2;
  assert.equal(copyOption(copy).from,3);
});
