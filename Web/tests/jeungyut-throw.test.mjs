import {test} from 'node:test';
import assert from 'node:assert/strict';
import {act,createGame} from '../public/jeung-yut/engine.mjs';
import {throwFaces} from '../public/jeung-yut/throw-view.mjs';

test('윷 결과별로 윷가락의 평면 수와 빽도 표시가 일치한다',()=>{
  for(const value of [-1,1,2,3,4,5]){
    const faces=throwFaces(value);
    assert.equal(faces.length,4);
    assert.equal(faces.filter(face=>face.startsWith('flat')).length,value===-1?1:value===5?0:value);
    assert.equal(faces.filter(face=>face.includes('marked')).length,value===-1?1:0);
  }
});
test('빽도로 바로 차례가 넘어가도 던진 사람과 결과가 남는다',()=>{
  const s=createGame(['A','B'],true,()=>0);
  act(s,{type:'roll'},()=>1.1/16);
  assert.equal(s.active,1);assert.deepEqual(s.pending,[]);
  assert.deepEqual(s.lastRoll,{id:1,owner:0,value:-1,extra:0,reroll:false});
  const event=structuredClone(s.lastRoll);
  act(s,{type:'roll'},()=>3.1/16);
  assert.equal(s.lastRoll.owner,1);assert.equal(s.lastRoll.value,2);assert.ok(s.lastRoll.id>event.id);
});
test('같은 수가 연속 나오는 재던지기도 새 연출 ID와 추가 횟수를 기록한다',()=>{
  const s=createGame(['A','B'],true,()=>0);s.players[0].augments=['banchan','reroll'];
  act(s,{type:'roll'},()=>.5);const first=s.lastRoll.id;
  const result=s.pending[0].id;act(s,{type:'reroll',result},()=>.5);
  assert.equal(s.lastRoll.value,2);assert.equal(s.lastRoll.reroll,true);assert.ok(s.lastRoll.id>first);
  const normal=createGame(['A','B'],true,()=>0);act(normal,{type:'roll'},()=>15.1/16);
  assert.equal(normal.lastRoll.value,4);assert.equal(normal.lastRoll.extra,1);
  const banchan=createGame(['A','B'],true,()=>0);banchan.players[0].augments=['banchan'];act(banchan,{type:'roll'},()=>0);
  assert.equal(banchan.lastRoll.value,5);assert.equal(banchan.lastRoll.extra,2);
});
