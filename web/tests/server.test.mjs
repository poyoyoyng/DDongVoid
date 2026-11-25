import {test} from 'node:test';
import assert from 'node:assert/strict';
import {makeServer} from '../server.mjs';

test('online: create, join, authenticate, enforce turns and versions, reconnect, reject invalid actions atomically',async t=>{
  const server=makeServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>server.close());const base=`http://127.0.0.1:${server.address().port}`;
  async function req(path,method='GET',data,token){const r=await fetch(base+path,{method,headers:{...(data?{'Content-Type':'application/json'}:{}),...(token?{Authorization:`Bearer ${token}`}:{})},body:data?JSON.stringify(data):undefined});return {status:r.status,body:await r.json()};}
  const a=await req('/api/rooms','POST',{name:'플레이어 A',maxPlayers:2});assert.equal(a.status,201);assert.equal(a.body.ready,false);const path='/api/rooms/'+a.body.code;
  assert.equal((await req(path)).status,401);
  assert.equal((await req(path,'GET',undefined,'é'.repeat(48))).status,401);
  assert.equal((await req(path+'/start','POST',{version:a.body.version},a.body.token)).status,409);
  const b=await req(path+'/join','POST',{name:'플레이어 B'});assert.equal(b.status,200);assert.equal(b.body.ready,false);
  assert.equal((await req(path+'/join','POST',{})).status,409);
  assert.equal((await req(path+'/start','POST',{version:b.body.version},b.body.token)).status,403);
  const start=await req(path+'/start','POST',{version:b.body.version},a.body.token);assert.equal(start.status,200);assert.equal(start.body.ready,true);
  const tokens=[a.body.token,b.body.token],active=start.body.state.active,version=start.body.version;
  assert.equal((await req(path+'/action','POST',{version,action:{type:'roll'}},tokens[1-active])).status,403);
  assert.equal((await req(path+'/action','POST',{version:0,action:{type:'roll'}},tokens[active])).status,409);
  assert.equal((await req(path+'/action','POST',{version,action:{type:'flick',token:0,dx:1,dy:0,power:9999}},tokens[active])).status,400);
  const unchanged=await req(path,'GET',undefined,tokens[active]);assert.equal(unchanged.body.version,version);assert.equal(unchanged.body.state.revision,0);
  const played=await req(path+'/action','POST',{version,action:{type:'roll'}},tokens[active]);assert.equal(played.status,200);assert.equal(played.body.version,version+1);
  const reconnect=await req(path,'GET',undefined,tokens[1-active]);assert.equal(reconnect.body.version,version+1);assert.deepEqual(reconnect.body.state,played.body.state);
  const staticPage=await fetch(base+'/');assert.equal(staticPage.status,200);assert.match(await staticPage.text(),/증윷/);
  assert.equal((await fetch(base+'/server.mjs')).status,404);assert.equal((await fetch(base+'/package.json')).status,404);
});
for(const count of [3,4])test(`online ${count}-player free-for-all lobby, capacity, start and round-robin`,async t=>{
  const server=makeServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>server.close());const base=`http://127.0.0.1:${server.address().port}`;
  async function req(path,data,token){const r=await fetch(base+path,{method:data?'POST':'GET',headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},body:data?JSON.stringify(data):undefined});return {status:r.status,body:await r.json()};}
  const first=await req('/api/rooms',{name:'A',maxPlayers:count});const path='/api/rooms/'+first.body.code,tokens=[first.body.token];let latest=first.body;
  for(let i=1;i<count;i++){const joined=await req(path+'/join',{name:`P${i+1}`});assert.equal(joined.status,200);tokens.push(joined.body.token);latest=joined.body;assert.equal(latest.ready,false);}
  assert.equal((await req(path+'/join',{name:'overflow'})).status,409);
  const started=await req(path+'/start',{version:latest.version},tokens[0]);assert.equal(started.status,200);latest=started.body;assert.equal(latest.state.players.length,count);
  assert.equal((await req(path+'/join',{name:'late'})).status,409);
  const {botAction}=await import('../engine.mjs');const firstActive=latest.state.active,seen=new Set([firstActive]);let actions=0;
  while(seen.size<count&&actions++<100){const p=latest.state.active;const a=botAction(latest.state);const r=await req(path+'/action',{version:latest.version,action:a},tokens[p]);assert.equal(r.status,200);if(r.body.state.active!==p)assert.equal(r.body.state.active,(p+1)%count);latest=r.body;seen.add(latest.state.active);}
  assert.equal(seen.size,count);for(const secret of tokens){const reconnect=await req(path,undefined,secret);assert.equal(reconnect.status,200);assert.equal(reconnect.body.state.players.length,count);}
});
