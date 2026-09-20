// Event adapter: the original interface talks to the shared authenticated app.
const handlers = new Map();
let state, joined=false, previous, cursor=0, request=0, joinRequested=false, lobbyCode="";
const createButton=document.getElementById("create-lobby");
const joinButton=document.getElementById("join-lobby-button");
function loading(kind){
 for(const [button,key] of [[createButton,"create"],[joinButton,"join"]]){
  button.disabled=!!kind;
  button.setAttribute("aria-busy",String(kind===key));
 }
 document.getElementById("lobby-code").disabled=!!kind;
}
const invite=document.getElementById("invite-friends");
const inviteStatus=document.getElementById("invite-status");
const joinErrors=document.getElementById("join-errors");
const send=(data)=>parent.postMessage(data,location.origin);
createButton.addEventListener("click",()=>{joinErrors.textContent="";loading("create");send({type:"grams-create"})});
document.getElementById("join-lobby").addEventListener("submit",event=>{
 event.preventDefault();
 joinErrors.textContent="";loading("join");
 send({type:"grams-join",code:document.getElementById("lobby-code").value});
});
invite.addEventListener("click",()=>send({type:"grams-invite"}));
const pending=new Map();
const fire=(kind,data)=>{for(const fn of handlers.get(kind)||[])fn(data)};
const escape=(s)=>String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
export const socket={
 id:"",
 on(kind,fn){if(!handlers.has(kind))handlers.set(kind,[]);handlers.get(kind).push(fn)},
 emit(kind,data={}){
  if(kind==="requestPlayers"||kind==="pfpLoadAvailable"){if(state)render(state);return}
  const args={kind};
  if(kind==="wordSubmit")args.word=data.word;
  if(kind==="requestStart")args.size=parseInt(data.size);
  if(kind==="chatSent")args.message=data.message;
  if(kind==="pfpRequestChange")args.pfp=data.new;
  if(kind==="emoteSent")args.emote=data.emote;
  const seq=++request;pending.set(seq,{kind,data});
  parent.postMessage({type:"grams-command",request:seq,args},location.origin);
  if(kind==="leave"){joined=false;previous=undefined;document.body.classList.remove("in-game");invite.hidden=true;}
 }
};
function render(s){
 if(!joined)return;
 const old=previous;
 const playersChanged=!old||JSON.stringify(old.players.map(p=>[p.id,p.name,p.pfp,p.wins]))!==JSON.stringify(s.players.map(p=>[p.id,p.name,p.pfp,p.wins]))||old.round!==s.round;
 if(playersChanged)fire("updatePlayers",{players:s.players});
 else for(const p of s.players)if(old.players.find(o=>o.id===p.id)?.score!==p.score)fire("updatePlayerScore",{id:p.id,score:p.score});
 fire("newHost",{id:s.host});
 const available=["ben","lukas"].map(n=>[1,2,3,4].map(i=>n+"-face-"+i+".jpg").filter(f=>!s.players.some(p=>p.pfp===f)));
 if(document.getElementById("pfp-list-row-ben"))fire("pfpAvailable",{ben:available[0],lukas:available[1]});
 const me=s.players.find(p=>p.id===socket.id);
 if(me)fire("updatePlayerPfp",{id:me.id,pfp:me.pfp});
 if(s.phase==="playing"&&(!old||s.round!==old.round)){
  if(s.startAt>s.serverNow+2500)fire("startGame",{letters:s.letters});
  else fire("resumeGame",{...s,remaining:Math.max(0,Math.ceil((s.endAt-s.serverNow)/1000)-1)});
 }
 if(s.phase==="finished"&&(!old||old.phase!=="finished"||old.round!==s.round)){
  fire("gameOver",{players:s.players,word:s.word});
  if(old?.phase==="playing"&&me)fire(me.score===s.players[0]?.score?"youWon":"youLost");
 }
 previous=s;
}
window.addEventListener("message",e=>{
 if(e.origin!==location.origin||e.source!==parent)return;
 if(e.data?.type==="grams-resume"){previous=undefined;if(!joined){joinRequested=false;joinErrors.textContent="";}}
 if(e.data?.type==="grams-lobby"){
  if(e.data.reset){
   state=undefined;previous=undefined;joined=false;joinRequested=false;cursor=0;pending.clear();
   document.body.classList.remove("in-game");invite.hidden=true;inviteStatus.textContent="";
   fire("lobbyReset");
  }
  lobbyCode=e.data.code||"";
  if(e.data.reset||lobbyCode)document.getElementById("lobby-code").value=lobbyCode;
  invite.textContent=`Invite friends · ${lobbyCode}`;
  joinErrors.textContent=e.data.error||"";
  loading(e.data.error?null:e.data.loading);
 }
 if(e.data?.type==="grams-copy")inviteStatus.textContent=e.data.message;
 if(e.data?.type==="grams-connection"){
  const message=e.data.connected?"":e.data.message||"Connecting to lobby…";
  if(joined)inviteStatus.textContent=message;
  else if(e.data.message){joinErrors.textContent=e.data.message;loading(null);}
 }
 if(e.data?.type==="grams-state"){
  state=e.data.state;socket.id=state.id;
  if(!joined&&!joinRequested){joinRequested=true;socket.emit("requestJoin")}
  render(state);fire("connect");
 }
 if(e.data?.type==="grams-feed"){
  const feed=e.data.feed;
  if(joined)for(const ev of feed.events)if(ev.seq>cursor){
   if(ev.kind==="newMessage")fire(ev.kind,{...ev.data,sender:escape(ev.data.sender),message:escape(ev.data.message)});
   else fire(ev.kind,ev.data);
  }
  cursor=feed.seq;
 }
 if(e.data?.type==="grams-reply"){
  const op=pending.get(e.data.request);if(!op)return;pending.delete(e.data.request);
  if(e.data.error){if(op.kind==="requestJoin")loading(null);fire(op.kind==="requestJoin"?"joinDeclined":"newMessage",{sender:"Server",type:"bad",message:escape(e.data.error)});return}
  if(op.kind==="requestJoin"){
   joined=true;cursor=state?.seq??0;document.body.classList.add("in-game");
   loading(null);joinErrors.textContent="";invite.hidden=false;
   document.activeElement?.blur();
   fire("joinAccepted",{name:state.name});if(state)render(state);
  }
  if(op.kind==="leave")send({type:"grams-left"});
  if(op.kind==="wordSubmit")fire(e.data.result?.accepted?"wordAccept":"wordDecline",e.data.result);
 }
});
parent.postMessage({type:"grams-ready"},location.origin);
