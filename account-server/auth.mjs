// Firebase ID tokens only. No browser-provided uid or unsigned development token is accepted.
const endpoint='https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';
const decode=s=>Uint8Array.from(atob(s.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));
export function createFirebaseVerifier(projectId,{fetcher=fetch,now=Date.now}={}){
  let keys=[],expires=0;
  return async token=>{
    if(!projectId||typeof token!=='string'||token.length>8192)throw Error('Invalid authentication');
    const parts=token.split('.');if(parts.length!==3)throw Error('Invalid token');
    const h=JSON.parse(new TextDecoder().decode(decode(parts[0]))),p=JSON.parse(new TextDecoder().decode(decode(parts[1]))),time=now()/1000;
    if(h.alg!=='RS256'||typeof h.kid!=='string'||p.aud!==projectId||p.iss!==`https://securetoken.google.com/${projectId}`||typeof p.sub!=='string'||!p.sub.length||p.sub.length>128||!Number.isFinite(p.exp)||p.exp<=time||!Number.isFinite(p.iat)||p.iat>time||!Number.isFinite(p.auth_time)||p.auth_time>time)throw Error('Invalid claims');
    if(now()>=expires){
      const r=await fetcher(endpoint,{signal:AbortSignal.timeout(6000)});if(!r.ok)throw Error('Identity service unavailable');
      keys=(await r.json()).keys;expires=now()+Math.min(3600,Number(r.headers.get('cache-control')?.match(/max-age=(\d+)/)?.[1]||300))*1000;
    }
    const jwk=keys.find(k=>k.kid===h.kid);if(!jwk)throw Error('Unknown signing key');
    const key=await crypto.subtle.importKey('jwk',jwk,{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['verify']);
    if(!await crypto.subtle.verify('RSASSA-PKCS1-v1_5',key,decode(parts[2]),new TextEncoder().encode(parts.slice(0,2).join('.'))))throw Error('Invalid signature');
    return p.sub;
  };
}
