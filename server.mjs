import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {createLocalDatabase} from './multiplayer-server/local-db.mjs';
import {handleMultiplayer} from './multiplayer-server/handler.mjs';
import {handleAccount} from './account-server/handler.mjs';
import {createFirebaseVerifier} from './account-server/auth.mjs';
import firebaseConfig from './firebase-web.json' with {type:'json'};

const root=fileURLToPath(new URL('.',import.meta.url));
const mime={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.js':'text/javascript; charset=utf-8','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml','.json':'application/json'};
export function createGymServer(options={}){
  const db=options.db??createLocalDatabase(),rate=new Map();
  const config=options.firebaseConfig??(process.env.FIREBASE_WEB_CONFIG?JSON.parse(process.env.FIREBASE_WEB_CONFIG):firebaseConfig);
  const accountOptions={config,verifyToken:config?createFirebaseVerifier(config.projectId):null};
  const server=http.createServer(async(req,res)=>{
    try{
      const url=new URL(req.url,`http://${req.headers.host||'localhost'}`),pathname=decodeURIComponent(url.pathname);
      if(pathname.startsWith('/api/')){
        const ip=req.socket.remoteAddress??'local',now=Date.now(),entry=rate.get(ip);
        if(!entry||now-entry.at>1000)rate.set(ip,{at:now,count:1});
        else if(++entry.count>200){res.writeHead(429,{'Content-Type':'application/json','Retry-After':'1'});res.end(JSON.stringify({error:'RATE_LIMITED',message:'操作太快，請稍等一下。'}));req.resume();return;}
        if(rate.size>1000)for(const [key,value] of rate)if(now-value.at>2000)rate.delete(key);
        const chunks=[];let bytes=0;
        for await(const chunk of req){bytes+=chunk.length;if(bytes>(pathname.startsWith('/api/account/')?65536:8192)){res.writeHead(413,{'Content-Type':'application/json'});res.end(JSON.stringify({error:'BODY_TOO_LARGE'}));return;}chunks.push(chunk);}
        const request=new Request(url,{method:req.method,headers:req.headers,body:['GET','HEAD'].includes(req.method)?undefined:Buffer.concat(chunks)});
        const result=await handleAccount(request,db,accountOptions)??await handleMultiplayer(request,db,options);
        if(!result){res.writeHead(404);res.end('Not found');return;}
        res.writeHead(result.status,Object.fromEntries(result.headers));res.end(Buffer.from(await result.arrayBuffer()));return;
      }
      if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);res.end();return;}
      const relative=pathname==='/'?'index.html':pathname.slice(1),file=path.resolve(root,relative);
      const publicPath=['index.html','style.css'].includes(relative)||relative.startsWith('assets/')||relative.startsWith('src/');
      if(!file.startsWith(root)||relative.split(/[\\/]/).some(p=>p.startsWith('.'))||!publicPath){res.writeHead(404);res.end('Not found');return;}
      const data=await readFile(file);res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream','Cache-Control':'no-cache','X-Content-Type-Options':'nosniff'});res.end(req.method==='HEAD'?undefined:data);
    }catch(error){options.onError?.(error);if(!res.headersSent)res.writeHead(404);res.end('Not found');}
  });
  server.on('close',()=>{if(!options.db)db.close();});
  return server;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const port=Number(process.env.PORT||4178),host=process.env.HOST||'127.0.0.1';
  createGymServer({onError:error=>console.error(error.message)}).listen(port,host,()=>console.log(`Pixel Gym: http://${host}:${port}`));
}
