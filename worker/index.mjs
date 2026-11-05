import {handleAccount} from '../account-server/handler.mjs';
import {createFirebaseVerifier} from '../account-server/auth.mjs';
import {handleMultiplayer} from '../multiplayer-server/handler.mjs';
import config from '../firebase-web.json' with {type:'json'};
const verifyToken=createFirebaseVerifier(config.projectId);
export default {
 async fetch(request,env){
  const url=new URL(request.url);
  if(url.pathname==='/'||url.pathname==='/play'){
   url.pathname='/play/';return Response.redirect(url.toString(),302);
  }
  if(url.pathname.startsWith('/api/')){
   if(!env.DB)return Response.json({message:'遊戲資料庫尚未設定。'},{status:503});
   return await handleAccount(request,env.DB,{config,verifyToken})
     ??await handleMultiplayer(request,env.DB)
     ??Response.json({message:'找不到此功能。'},{status:404});
  }
  return env.ASSETS.fetch(request);
 }
};
