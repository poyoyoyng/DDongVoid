import http from 'node:http';
import {randomBytes,randomInt,timingSafeEqual} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {createGame,act} from './engine.mjs';

const root=new URL('./',import.meta.url),rooms=new Map(),limits=new Map();
const MAX_ROOMS=500,TTL=6*60*60*1000;
const rng=()=>randomInt(0,2**24)/2**24;
const token=()=>randomBytes(24).toString('hex');
const cleanName=(s,fallback)=>typeof s==='string'?s.trim().slice(0,16)||fallback:fallback;
const secureEqual=(a,b)=>typeof a==='string'&&/^[a-f0-9]{48}$/.test(a)&&timingSafeEqual(Buffer.from(a),Buffer.from(b));
function json(res,status,data) {res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(data));}
async function body(req) {
  let data='';for await(const chunk of req){data+=chunk;if(Buffer.byteLength(data)>8192)throw Error('요청이 너무 큽니다.');}
  try{return JSON.parse(data||'{}');}catch{throw Error('잘못된 JSON입니다.');}
}
function snapshot(room) {return {code:room.code,version:room.version,names:room.names,state:room.state,ready:room.state!==null,maxPlayers:room.maxPlayers};}
function prune() {const now=Date.now();for(const [k,v] of rooms)if(now-v.updated>TTL)rooms.delete(k);for(const [k,v] of limits)if(now-v.time>60000)limits.delete(k);}
function rateLimit(req) {
  const ip=req.socket.remoteAddress,now=Date.now();let l=limits.get(ip);
  if(!l||now-l.time>60000){l={time:now,count:0};limits.set(ip,l);}
  if(++l.count>240)throw Error('요청이 많습니다. 잠시 후 다시 시도하세요.');
}
export function makeServer() {
  return http.createServer(async(req,res)=>{
    try {
      const url=new URL(req.url,'http://localhost');
      res.setHeader('X-Content-Type-Options','nosniff');
      res.setHeader('Referrer-Policy','no-referrer');
      if(url.pathname.startsWith('/api/')) {
        // Same-origin requests only; credentials are room-specific bearer tokens.
        if(req.headers.origin&&new URL(req.headers.origin).host!==req.headers.host)return json(res,403,{error:'다른 사이트에서 보낸 요청입니다.'});
        if(req.method==='POST')rateLimit(req);
        if(url.pathname==='/api/rooms'&&req.method==='POST') {
          prune();if(rooms.size>=MAX_ROOMS)return json(res,503,{error:'방이 가득 찼습니다. 잠시 후 다시 시도하세요.'});
          const input=await body(req);let code;do{code=randomBytes(3).toString('hex').toUpperCase();}while(rooms.has(code));
          const maxPlayers=input.maxPlayers??4;if(![2,3,4].includes(maxPlayers))return json(res,400,{error:'인원은 2~4명으로 선택하세요.'});
          const secret=token();const room={code,names:[cleanName(input.name,'플레이어 1')],secrets:[secret],state:null,maxPlayers,backdo:input.backdo!==false,updated:Date.now(),version:0};
          rooms.set(code,room);return json(res,201,{...snapshot(room),player:0,token:secret});
        }
        const match=url.pathname.match(/^\/api\/rooms\/([A-F0-9]{6})(?:\/(join|start|action))?$/);
        if(!match)return json(res,404,{error:'없는 API입니다.'});
        const room=rooms.get(match[1]);if(!room||Date.now()-room.updated>TTL)return json(res,404,{error:'방이 없거나 만료되었습니다. 새 방을 만들어 주세요.'});
        if(match[2]==='join'&&req.method==='POST') {
          if(room.state||room.names.length>=room.maxPlayers)return json(res,409,{error:'게임이 시작되었거나 방이 가득 찼습니다.'});
          const input=await body(req),secret=token();room.names.push(cleanName(input.name,`플레이어 ${room.names.length+1}`));room.secrets.push(secret);room.version++;room.updated=Date.now();
          return json(res,200,{...snapshot(room),player:1,token:secret});
        }
        const auth=req.headers.authorization?.replace(/^Bearer /,'');
        const player=room.secrets.findIndex(t=>secureEqual(auth,t));
        if(player===-1)return json(res,401,{error:'이 방의 참가자 정보가 없습니다. 초대 코드로 참가해 주세요.'});
        if(!match[2]&&req.method==='GET'){room.updated=Date.now();return json(res,200,snapshot(room));}
        if(match[2]==='start'&&req.method==='POST') {
          const input=await body(req);
          if(player!==0)return json(res,403,{error:'방장만 게임을 시작할 수 있습니다.'});
          if(room.state||room.names.length<2)return json(res,409,{error:'2명 이상 참가한 뒤 시작하세요.'});
          if(input.version!==room.version)return json(res,409,{error:'참가자가 변경되었습니다. 다시 시작해 주세요.'});
          room.state=createGame(room.names,room.backdo,rng);room.version++;room.updated=Date.now();return json(res,200,snapshot(room));
        }
        if(match[2]==='action'&&req.method==='POST') {
          const input=await body(req);
          if(!room.state)return json(res,409,{error:'상대를 기다리고 있습니다.'});
          if(input.version!==room.version)return json(res,409,{error:'상태가 변경되었습니다. 다시 시도하세요.'});
          if(room.state.active!==player)return json(res,403,{error:'상대의 차례입니다.'});
          // Apply to a copy, so a rejected action cannot partially mutate a room.
          const next=structuredClone(room.state);act(next,input.action??{},rng);room.state=next;room.version++;room.updated=Date.now();
          return json(res,200,snapshot(room));
        }
        return json(res,405,{error:'지원하지 않는 요청입니다.'});
      }
      if(req.method!=='GET'&&req.method!=='HEAD'){res.writeHead(405);return res.end();}
      const files={'/':'index.html','/index.html':'index.html','/style.css':'style.css','/app.mjs':'app.mjs','/engine.mjs':'engine.mjs','/favicon.svg':'favicon.svg'};
      const file=files[url.pathname];if(!file){res.writeHead(404);return res.end('Not found');}
      const types={html:'text/html; charset=utf-8',css:'text/css; charset=utf-8',mjs:'text/javascript; charset=utf-8',svg:'image/svg+xml'};
      const data=await readFile(new URL(file,root));
      res.writeHead(200,{'Content-Type':types[file.split('.').at(-1)],'Cache-Control':'no-cache','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'self' https://chatgpt.com"});res.end(req.method==='HEAD'?undefined:data);
    }catch(error){json(res,400,{error:error.message||'요청을 처리하지 못했습니다.'});}
  });
}
if(process.argv[1]===fileURLToPath(import.meta.url)) {
  const flag=name=>{const i=process.argv.indexOf(name);return i===-1?undefined:process.argv[i+1];};
  const port=Number(flag('--port')||process.env.PORT||3000),host=flag('--host')||process.env.HOST||'0.0.0.0';
  makeServer().listen(port,host,()=>console.log(`증윷 · http://localhost:${port}`));
}
