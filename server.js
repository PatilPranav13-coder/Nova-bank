'use strict';
const http = require('node:http');
const crypto = require('node:crypto');

const PORT = Number(process.env.PORT || 3000);
const OWNER = process.env.GITHUB_OWNER || 'PatilPranav13-coder';
const REPO = process.env.GITHUB_REPO || 'Nova-bank';
const BRANCH = process.env.GITHUB_BRANCH || 'main';
const LEDGER_PATH = process.env.LEDGER_PATH || 'ledger.json';
const API = 'https://api.github.com';
const ORIGIN = 'https://patilpranav13-coder.github.io';

function send(res, status, data) {
  res.writeHead(status, {'content-type':'application/json; charset=utf-8','access-control-allow-origin':ORIGIN,'access-control-allow-methods':'GET,POST,OPTIONS','access-control-allow-headers':'content-type'});
  res.end(JSON.stringify(data));
}
function hashPin(pin) {
  return crypto.createHmac('sha256', process.env.PIN_SECRET || '').update(String(pin)).digest('hex');
}
function safeEqual(a,b) {
  const x=Buffer.from(String(a||''),'hex'), y=Buffer.from(String(b||''),'hex');
  return x.length===y.length && x.length>0 && crypto.timingSafeEqual(x,y);
}
async function github(path, options={}) {
  if (!process.env.GITHUB_TOKEN) throw new Error('Backend setup incomplete: add GITHUB_TOKEN in Render environment variables.');
  const r=await fetch(API+'/repos/'+OWNER+'/'+REPO+'/contents/'+path+(options.ref?'?ref='+options.ref:''),{
    method:options.method||'GET',
    headers:{'accept':'application/vnd.github+json','authorization':'Bearer '+process.env.GITHUB_TOKEN,'x-github-api-version':'2022-11-28','user-agent':'NovaBank-Demo-API','content-type':'application/json'},
    body:options.body?JSON.stringify(options.body):undefined
  });
  const data=await r.json();
  if(!r.ok) throw new Error('GitHub API '+r.status+': '+(data.message||'request failed'));
  return data;
}
async function readLedger() {
  try {
    const file=await github(LEDGER_PATH,{ref:BRANCH});
    const text=Buffer.from(file.content.replace(/\n/g,''),'base64').toString('utf8');
    const ledger=JSON.parse(text);
    if(!Array.isArray(ledger.accounts)) throw new Error('Invalid ledger format');
    let changed=false;
    const seeds=[['Pranav','100101','1234'],['Ayush','100102','5678'],['Arun','100103','9012']];
    for(const [name,acc,pin] of seeds) {
      let row=ledger.accounts.find(x=>x.acc===acc);
      if(!row) { row={name,acc,balance:1000,attempts:0,locked:false,history:[],pinHash:hashPin(pin)}; ledger.accounts.push(row); changed=true; }
      else if(!row.pinHash) { row.pinHash=hashPin(pin); changed=true; }
    }
    if(changed) await writeLedger(ledger,file.sha);
    return {ledger,sha:changed?(await github(LEDGER_PATH,{ref:BRANCH})).sha:file.sha};
  } catch(e) {
    if(String(e.message).includes('Not Found')) {
      const ledger={version:1,accounts:[],stock:{'500':5,'200':5,'100':5}};
      const seeds=[['Pranav','100101','1234'],['Ayush','100102','5678'],['Arun','100103','9012']];
      ledger.accounts=seeds.map(([name,acc,pin])=>({name,acc,pinHash:hashPin(pin),balance:1000,attempts:0,locked:false,history:[]}));
      const created=await github(LEDGER_PATH,{method:'PUT',body:{message:'Initialize NovaBank demo ledger',content:Buffer.from(JSON.stringify(ledger,null,2)+'\n').toString('base64'),branch:BRANCH}});
      return {ledger,sha:created.content.sha};
    }
    throw e;
  }
}
async function writeLedger(ledger,sha) {
  return github(LEDGER_PATH,{method:'PUT',body:{message:'Update NovaBank demo ledger',content:Buffer.from(JSON.stringify(ledger,null,2)+'\n').toString('base64'),sha,branch:BRANCH}});
}
let queue=Promise.resolve();
function serialized(fn){const next=queue.then(fn,fn);queue=next.catch(()=>{});return next;}
function publicLedger(l){return {accounts:l.accounts.map(({pinHash,attempts,locked,...a})=>a),stock:l.stock};}
async function body(req){let s='';for await(const c of req){s+=c;if(s.length>10000)throw new Error('Request too large');}return s?JSON.parse(s):{};}
async function action(data) {
  return serialized(async()=>{
    const {ledger,sha}=await readLedger();
    const acc=ledger.accounts.find(x=>x.acc===String(data.acc||''));
    if(data.action==='create') {
      const name=String(data.name||'').trim();
      const pin=String(data.pin||'');
      if(!/^[A-Za-z][A-Za-z ]{1,23}$/.test(name)) throw new Error('Enter a name of 2–24 letters.');
      if(!/^\d{4}$/.test(pin) || /^(\d)\1{3}$/.test(pin)) throw new Error('Choose a valid 4-digit PIN.');
      if(ledger.accounts.length>=100) throw new Error('Demo account limit reached.');
      const number=String(Math.max(100100,...ledger.accounts.map(x=>Number(x.acc)||0))+1);
      ledger.accounts.push({name,pinHash:hashPin(pin),acc:number,balance:1000,attempts:0,locked:false,history:[{type:'Welcome credit',amount:1000,balance:1000,at:new Date().toISOString()}]});
      await writeLedger(ledger,sha);
      return {ok:true,account:{name,acc:number,balance:1000}};
    }
    if(!acc) throw new Error('Account not found.');
    if(data.action==='login') {
      if(acc.locked) throw new Error('This demo account is locked after three incorrect PIN attempts.');
      if(!safeEqual(hashPin(data.pin),acc.pinHash)) {
        acc.attempts=(acc.attempts||0)+1;
        if(acc.attempts>=3) acc.locked=true;
        await writeLedger(ledger,sha);
        throw new Error(acc.locked?'Account locked after three incorrect PIN attempts.':'Incorrect PIN.');
      }
      acc.attempts=0; await writeLedger(ledger,sha);
      return {ok:true,account:{name:acc.name,acc:acc.acc,balance:acc.balance}};
    }
    if(!safeEqual(hashPin(data.pin),acc.pinHash)) throw new Error('PIN verification failed.');
    const amount=Number(data.amount);
    if(!Number.isSafeInteger(amount)||amount<=0||amount>100000) throw new Error('Enter an amount between ₹1 and ₹1,00,000.');
    if(data.action==='deposit') acc.balance+=amount;
    else if(data.action==='withdraw') {
      if(amount>acc.balance) throw new Error('Insufficient demo balance.');
      acc.balance-=amount;
    } else throw new Error('Unknown action.');
    acc.history=acc.history||[];
    acc.history.push({type:data.action==='deposit'?'Deposit':'Withdrawal',amount:data.action==='deposit'?amount:-amount,balance:acc.balance,at:new Date().toISOString()});
    acc.history=acc.history.slice(-30);
    await writeLedger(ledger,sha);
    return {ok:true,account:{name:acc.name,acc:acc.acc,balance:acc.balance},history:acc.history};
  });
}
const server=http.createServer(async(req,res)=>{
  if(req.method==='OPTIONS'){res.writeHead(204,{'access-control-allow-origin':ORIGIN,'access-control-allow-methods':'GET,POST,OPTIONS','access-control-allow-headers':'content-type'});return res.end();}
  try{
    const url=new URL(req.url,'http://localhost');
    if(req.method==='GET'&&url.pathname==='/health') return send(res,200,{ok:true,service:'NovaBank demo API'});
    if(req.method==='GET'&&url.pathname==='/api/state') {
      const {ledger}=await readLedger(); return send(res,200,{ok:true,...publicLedger(ledger)});
    }
    if(req.method==='POST'&&url.pathname==='/api/action') return send(res,200,await action(await body(req)));
    return send(res,404,{error:'Not found'});
  }catch(e){return send(res,400,{error:e.message||'Request failed'});}
});
server.listen(PORT,()=>console.log('NovaBank API listening on '+PORT));
