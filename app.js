const USERS = {
  "@aradzpr": { name:"آراد", password:"arad88", peerId:"aradzpr", initial:"آ" },
  "@ahoora85": { name:"اهورا (شما)", password:"1234ah56", peerId:"ahoora85", initial:"ا" },
  "@mehdi_m": { name:"مهدی", password:"mehdi06", peerId:"mehdi_m", initial:"م" }
};

let me = null;
let peer = null;
let localStream = null;
let currentCall = null;
let incomingCall = null;
let peerStarting = false;
let reconnectTimer = null;
const app = document.getElementById("app");

function esc(s){return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
function normalizeUsername(v){let u=v.trim().toLowerCase();return u && !u.startsWith("@") ? "@"+u : u;}

function loginView(error=""){
  app.innerHTML=`<main class="screen"><section class="card login">
    <div class="brand"><div class="spider"></div><div class="logo">اهورا هم سخن</div><div class="subtitle">تماس صوتی خصوصی</div></div>
    <form id="loginForm">
      <div class="field"><label>نام کاربری</label><input id="username" autocomplete="username" placeholder="@username" required></div>
      <div class="field"><label>رمز عبور</label><input id="password" type="password" autocomplete="current-password" placeholder="••••••••" required></div>
      <button class="primary" type="submit">ورود و اتصال</button><div class="error">${esc(error)}</div>
    </form>
  </section></main>`;
  document.getElementById("loginForm").addEventListener("submit",handleLogin);
}

function handleLogin(e){
  e.preventDefault();
  const username=normalizeUsername(document.getElementById("username").value);
  const password=document.getElementById("password").value;
  const user=USERS[username];
  if(!user || user.password!==password){loginView("نام کاربری یا رمز عبور صحیح نیست.");return;}
  me=user; localStorage.setItem("ahoraUser",username); startPeer();
}

function homeView(){
  const myUsername=Object.keys(USERS).find(k=>USERS[k]===me);
  const people=Object.entries(USERS).filter(([u])=>u!==myUsername);
  app.innerHTML=`<main class="home">
    <header class="topbar"><div class="mini-brand">اهورا هم سخن</div><div class="status-pill">حاضر در تماس: <b>${esc(me.name)}</b></div></header>
    <section class="contacts"><div class="contact-grid">
      <div class="person"><div class="avatar"><span>${me.initial}</span></div><div class="name">${esc(me.name)}</div><div id="myState" class="state">در حال اتصال...</div></div>
      ${people.map(([u,p])=>`<div class="person"><div class="avatar"><span>${p.initial}</span></div><div class="name">${esc(p.name)}</div><div id="state-${p.peerId}" class="state">آماده تماس</div><button class="call-btn" onclick="callUser('${p.peerId}')">تماس</button></div>`).join("")}
    </div></section>
    <div class="footer-controls"><button class="round danger" title="خروج" onclick="logout()">↪</button><button class="round" title="میکروفون" onclick="toggleMic()">🎙</button></div>
    <audio id="remoteAudio" autoplay playsinline></audio>
  </main>`;
}

function setMyState(text,online=false){const el=document.getElementById("myState");if(el){el.textContent=text;el.classList.toggle("online",online);}}

function startPeer(){
  if(!me || peerStarting)return;
  if(peer && !peer.destroyed){if(peer.open){setMyState("متصل",true);}return;}
  peerStarting=true; homeView(); setMyState("در حال اتصال...");
  try{
    peer=new Peer(me.peerId,{debug:0,host:"0.peerjs.com",port:443,path:"/",secure:true,config:{iceServers:[{urls:"stun:stun.l.google.com:19302"},{urls:"stun:stun1.l.google.com:19302"}]}});
    peer.on("open",()=>{peerStarting=false;setMyState("متصل",true);toast("اتصال آماده است");clearTimeout(reconnectTimer);});
    peer.on("call",handleIncomingCall);
    peer.on("disconnected",()=>{setMyState("در حال اتصال مجدد...");try{peer.reconnect();}catch(e){scheduleReconnect();}});
    peer.on("close",()=>{peerStarting=false;setMyState("قطع شد");scheduleReconnect();});
    peer.on("error",err=>{
      console.error("PeerJS:",err);
      if(err.type==="unavailable-id"){peerStarting=false;setMyState("این حساب در دستگاه دیگری باز است");toast("این حساب در یک پنجره یا دستگاه دیگر باز است.");return;}
      if(["network","server-error","socket-error","socket-closed"].includes(err.type)){setMyState("اتصال مجدد...");scheduleReconnect();}
      else toast("خطا در سرویس تماس.");
    });
  }catch(e){peerStarting=false;setMyState("خطا در اتصال");toast("سرویس تماس در دسترس نیست.");}
}

function scheduleReconnect(){clearTimeout(reconnectTimer);reconnectTimer=setTimeout(()=>{if(!me)return;try{if(peer&&!peer.destroyed)peer.reconnect();else startPeer();}catch(e){peer=null;startPeer();}},2500);}

async function getMic(){
  if(!navigator.mediaDevices?.getUserMedia)throw new Error("getUserMedia unavailable");
  if(!localStream)localStream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true},video:false});
  return localStream;
}

async function callUser(peerId){
  if(!peer?.open){toast("اتصال هنوز آماده نیست.");return;}
  if(currentCall){toast("در حال حاضر یک تماس فعال است.");return;}
  try{
    const stream=await getMic(); const target=Object.values(USERS).find(x=>x.peerId===peerId);
    currentCall=peer.call(peerId,stream,{metadata:{from:me.name}});
    if(!currentCall){toast("برقراری تماس ممکن نشد.");return;}
    showCalling(target?.name||peerId);
    currentCall.on("stream",remote=>{attachRemoteStream(remote);showInCall(target?.name||peerId);});
    currentCall.on("close",endCallUI); currentCall.on("error",()=>{toast("تماس برقرار نشد.");endCallUI();});
  }catch(e){toast("برای تماس، اجازه دسترسی به میکروفون را فعال کنید.");}
}

function handleIncomingCall(call){
  if(currentCall||incomingCall){try{call.close();}catch(e){}return;}
  incomingCall=call; const person=Object.values(USERS).find(x=>x.peerId===call.peer); showIncoming(person?.name||call.peer);
}

async function acceptCall(){
  if(!incomingCall)return;
  const call=incomingCall; incomingCall=null;
  try{
    const stream=await getMic(); call.answer(stream); currentCall=call;
    const person=Object.values(USERS).find(x=>x.peerId===call.peer); const name=person?.name||call.peer; closeModal();
    call.on("stream",remote=>{attachRemoteStream(remote);showInCall(name);});
    call.on("close",endCallUI); call.on("error",()=>{toast("تماس قطع شد.");endCallUI();});
  }catch(e){try{call.close();}catch(x){}toast("دسترسی میکروفون لازم است.");}
}

function rejectCall(){if(incomingCall){try{incomingCall.close();}catch(e){}incomingCall=null;}closeModal();}
function attachRemoteStream(remote){const audio=document.getElementById("remoteAudio");if(audio){audio.srcObject=remote;audio.play().catch(()=>{});}}

function showIncoming(name){closeModal();const wrap=document.createElement("div");wrap.id="callModal";wrap.className="modal-backdrop";wrap.innerHTML=`<section class="modal"><div class="call-avatar">☎</div><h2>تماس ورودی</h2><p>${esc(name)} در حال تماس با شماست.</p><div class="actions"><button class="action accept" onclick="acceptCall()">پاسخ</button><button class="action reject" onclick="rejectCall()">رد تماس</button></div></section>`;document.body.appendChild(wrap);}
function showCalling(name){closeModal();const wrap=document.createElement("div");wrap.id="callModal";wrap.className="modal-backdrop";wrap.innerHTML=`<section class="modal"><div class="call-avatar">☎</div><h2>در حال تماس</h2><p>در حال برقراری تماس با ${esc(name)}...</p><div class="actions"><button class="action reject" onclick="hangup()">قطع تماس</button></div></section>`;document.body.appendChild(wrap);}
function showInCall(name){closeModal();const wrap=document.createElement("div");wrap.id="callModal";wrap.className="modal-backdrop";wrap.innerHTML=`<section class="modal"><div class="call-avatar">●</div><h2>تماس برقرار است</h2><p>در تماس با ${esc(name)}</p><div class="actions"><button class="action muted" onclick="toggleMic()">🎙 میکروفون</button><button class="action reject" onclick="hangup()">قطع تماس</button></div></section>`;document.body.appendChild(wrap);}

function hangup(){if(currentCall){try{currentCall.close();}catch(e){}}endCallUI();}
function endCallUI(){currentCall=null;const audio=document.getElementById("remoteAudio");if(audio)audio.srcObject=null;closeModal();}

async function toggleMic(){try{const stream=await getMic();const tracks=stream.getAudioTracks();tracks.forEach(t=>t.enabled=!t.enabled);toast(tracks.some(t=>t.enabled)?"میکروفون روشن شد":"میکروفون خاموش شد");}catch(e){toast("اجازه دسترسی به میکروفون داده نشده است.");}}
function closeModal(){document.getElementById("callModal")?.remove();}

function logout(){
  clearTimeout(reconnectTimer);
  try{currentCall?.close();incomingCall?.close();peer?.destroy();}catch(e){}
  localStream?.getTracks().forEach(t=>t.stop());
  currentCall=null;incomingCall=null;localStream=null;peer=null;peerStarting=false;me=null;
  localStorage.removeItem("ahoraUser");loginView();
}

function toast(message){document.querySelector(".toast")?.remove();const t=document.createElement("div");t.className="toast";t.textContent=message;document.body.appendChild(t);setTimeout(()=>t.remove(),2800);}

window.addEventListener("beforeunload",()=>{try{currentCall?.close();incomingCall?.close();peer?.destroy();localStream?.getTracks().forEach(t=>t.stop());}catch(e){}});

const saved=localStorage.getItem("ahoraUser");
if(saved&&USERS[saved]){me=USERS[saved];startPeer();}else loginView();
