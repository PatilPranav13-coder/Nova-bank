const API = "https://novabank-demo-api.onrender.com";
const $ = s => document.querySelector(s);
let accounts=[], stock={}, current=null, pin="", chosen="";
const fmt=n=>"₹"+Number(n).toLocaleString("en-IN");
async function request(path,data){
 const r=await fetch(API+path,{method:data?"POST":"GET",headers:data?{"content-type":"application/json"}:{},body:data?JSON.stringify(data):undefined});
 const j=await r.json(); if(!r.ok||j.error) throw Error(j.error||"API error"); return j;
}
async function refresh(){
 const j=await request("/api/state"); accounts=j.accounts;stock=j.stock;
 $("#extraAccs").innerHTML=accounts.slice(3).map(a=>card(a)).join("");
 document.querySelector(".demo-list").innerHTML=accounts.slice(0,3).map(a=>card(a)).join("");
 $("#newAccTitle").style.display=accounts.length>3?"":"none";
 $("#stock").innerHTML=[500,200,100].map(d=>'<div class="stock-row"><span class="note-tag n'+d+'">₹'+d+'</span><div class="bar"><i style="width:'+Math.min(100,stock[d]*10)+'%"></i></div><b>×'+stock[d]+'</b></div>').join("");
}
function card(a){return '<button class="demo-card" data-account="'+a.acc+'"><b>'+a.name+'</b><span>Acc '+a.acc+'</span><em>'+fmt(a.balance)+'</em></button>';}
function screen(html){$("#screen").innerHTML=html;}
function note(t,cls=""){return '<div class="msg '+cls+'">'+t+'</div>';}
function home(t=""){
 current=null;chosen="";pin="";
 screen('<div class="s-center"><div class="s-title">Welcome to NovaBank</div><div class="s-sub">Select your account from the public directory</div></div>'+note(t)+'<button class="btn small" data-action="new">➕ Open a new account</button>');
}
function pinPage(t=""){
 screen('<div class="s-center"><div class="s-title">Enter your PIN</div><div class="s-sub">Account '+chosen+'</div></div><div class="display dots">'+[0,1,2,3].map((x)=>'<span class="'+(x<pin.length?'f':'')+'"></span>').join("")+'</div>'+note(t)+'<div class="s-sub s-center">Use keypad, then press Enter.</div>');
}
function menu(t=""){
 screen('<div class="s-title">Main Menu</div><div class="s-sub">'+current.name+' · Account '+current.acc+'</div>'+note(t,"ok")+'<div class="balance-box"><div class="s-sub">Available balance</div><div class="amt">'+fmt(current.balance)+'</div></div><div class="menu-grid"><button class="btn" data-action="balance">Balance</button><button class="btn" data-action="withdraw">Withdraw</button><button class="btn" data-action="deposit">Deposit</button><button class="btn" data-action="history">Mini Statement</button><button class="btn danger" data-action="logout" style="grid-column:span 2">Exit</button></div>');
}
async function login(){
 try{const j=await request("/api/action",{action:"login",acc:chosen,pin});current=j.account;pin="";await refresh();menu("Login successful.");}
 catch(e){pin="";pinPage(e.message);}
}
function amountPage(action){
 screen('<div class="s-title">'+(action==="deposit"?"Deposit Cash":"Withdraw Cash")+'</div><div class="s-sub">Current balance: '+fmt(current.balance)+'</div><input class="text-input" id="amount" type="number" min="1" placeholder="Amount in rupees"><input class="text-input" id="txpin" type="password" maxlength="4" placeholder="4-digit PIN"><div class="msg err" id="error"></div><div class="row"><button class="btn" data-action="menu">Back</button><button class="btn primary" data-action="'+action+'">Confirm</button></div>');
}
async function transact(action){
 try{const j=await request("/api/action",{action,acc:current.acc,pin:$("#txpin").value,amount:Number($("#amount").value)});current=j.account;await refresh();menu("Transaction successful.");}
 catch(e){$("#error").textContent=e.message;}
}
function historyPage(){
 const a=accounts.find(x=>x.acc===current.acc),h=(a.history||[]).slice().reverse();
 screen('<div class="s-title">Mini Statement</div><div class="hist">'+(h.length?h.map(x=>'<div class="hist-item"><span>'+x.type+'</span><b>'+fmt(x.amount)+'</b><span>'+fmt(x.balance)+'</span></div>').join(""):'No transactions yet.')+'</div><button class="btn" data-action="menu">Back</button>');
}
function newPage(){
 screen('<div class="s-title">Open New Account</div><div class="s-sub">Every account starts with ₹1,000 demo credits.</div><input class="text-input" id="newname" placeholder="Your name"><input class="text-input" id="newpin" type="password" maxlength="4" placeholder="Choose 4-digit PIN"><div class="msg err" id="error"></div><div class="row"><button class="btn" data-action="home">Cancel</button><button class="btn primary" data-action="create">Create</button></div>');
}
async function create(){
 try{const j=await request("/api/action",{action:"create",name:$("#newname").value,pin:$("#newpin").value});await refresh();home("Created account "+j.account.acc+". You can now select it to log in.");}
 catch(e){$("#error").textContent=e.message;}
}
$("#screen").addEventListener("click",async e=>{
 const a=e.target.closest("[data-action]");if(!a)return;
 switch(a.dataset.action){
 case "new":newPage();break;case "home":home();break;case "create":await create();break;
 case "menu":menu();break;case "logout":home("Card ejected.");break;case "balance":menu();break;
 case "withdraw":amountPage("withdraw");break;case "deposit":amountPage("deposit");break;
 case "history":historyPage();break;case "withdraw":case "deposit":break;
 }
 if(a.dataset.action==="withdraw"||a.dataset.action==="deposit")await transact(a.dataset.action);
});
document.querySelector(".panel").addEventListener("click",e=>{
 const b=e.target.closest("[data-account]");if(!b)return;chosen=b.dataset.account;pin="";pinPage();
});
$("#keypad").addEventListener("click",async e=>{
 const b=e.target.closest("[data-k]");if(!b)return;const k=b.dataset.k;
 if(/^\d$/.test(k)&&chosen&&pin.length<4){pin+=k;pinPage();return;}
 if(k==="clear"){pin="";pinPage();return;}
 if(k==="cancel"){home("Cancelled.");return;}
 if(k==="enter"&&chosen)await login();
});
$("#resetBtn").addEventListener("click",()=>alert("The shared public ledger is maintained in GitHub. The browser cannot reset it."));
(async()=>{try{await refresh();home();}catch(e){home("Backend is waiting for its GitHub token configuration.");}})();
