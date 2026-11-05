export class AccountClient{
  constructor(onChange){this.onChange=onChange;this.character=null;this.user=null;this.enabled=false;this.loaded=false;this.error='';this.offset=0;}
  async init(){
    try{
      const r=await fetch('/api/account/config');if(!r.ok)throw Error('未能讀取會員服務。');
      const {enabled,config}=await r.json();this.enabled=enabled;
      if(!enabled)return;
      const [{initializeApp},sdk]=await Promise.all([import('https://www.gstatic.com/firebasejs/13.1.0/firebase-app.js'),import('https://www.gstatic.com/firebasejs/13.1.0/firebase-auth.js')]);
      this.sdk=sdk;this.auth=sdk.getAuth(initializeApp(config));this.auth.languageCode='zh-HK';
      await sdk.setPersistence(this.auth,sdk.browserSessionPersistence);
      sdk.onAuthStateChanged(this.auth,async user=>{
        this.user=user;this.character=null;this.error='';this.loading=!!user;this.onChange(this);
        if(user)try{await this.refresh();}catch(e){if(this.user===user)this.error=e.message;}
        if(this.user!==user)return;this.loading=false;
        this.onChange(this);
      });
    }catch(e){this.error=e.message;this.enabled=false;}finally{this.loaded=true;this.onChange(this);}
  }
  async api(path,body){
    if(!this.user)throw Error('請先登入。');
    const user=this.user;
    const r=await fetch('/api/account/'+path,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',Authorization:'Bearer '+await user.getIdToken()},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(12000)});
    const data=await r.json();if(!r.ok)throw Error(data.message||'暫時未能連接雲端。');
    if(this.user!==user)throw Error('帳戶已切換，請重新載入。');
    if(data.serverTime)this.offset=data.serverTime-Date.now();
    if('character'in data){this.character=data.character;this.onChange(this);}return data;
  }
  refresh(){return this.api('me');}
  create(name,accent){return this.api('character',{name,accent});}
  async login(email,password,register=false){if(!this.auth)throw Error('登入尚未開放。');return register?this.sdk.createUserWithEmailAndPassword(this.auth,email,password):this.sdk.signInWithEmailAndPassword(this.auth,email,password);}
  google(){if(!this.auth)throw Error('登入尚未開放。');return this.sdk.signInWithPopup(this.auth,new this.sdk.GoogleAuthProvider());}
  reset(email){if(!this.auth)throw Error('登入尚未開放。');return this.sdk.sendPasswordResetEmail(this.auth,email);}
  logout(){return this.sdk.signOut(this.auth);}
}
export function authMessage(error){
  return ({'auth/invalid-credential':'Email 或密碼不正確。','auth/email-already-in-use':'此 Email 已有帳戶，請登入。','auth/weak-password':'請使用至少6個字元的密碼。','auth/invalid-email':'請輸入有效 Email。','auth/popup-blocked':'瀏覽器阻擋登入視窗，可改用 Email 登入。','auth/popup-closed-by-user':'登入已取消。','auth/too-many-requests':'嘗試太頻密，請稍後再試。','auth/unauthorized-domain':'此網址尚未開通登入，請聯絡房主。'})[error.code]||error.message||'未能登入，請稍後再試。';
}
