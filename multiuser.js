/* NovaBank multi-user frontend — demo money only */
(() => {
  const root = document.getElementById('app');
  const cfg = window.NOVABANK_CONFIG || {};
  const ready = cfg.supabaseUrl && cfg.supabaseAnonKey &&
    !cfg.supabaseUrl.includes('YOUR_') && !cfg.supabaseAnonKey.includes('YOUR_') &&
    window.supabase && window.supabase.createClient;
  const money = n => '₹' + Number(n || 0).toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2});
  let client, user, profile, account, activeTab = 'overview', realtime;
  const escapeHtml = s => String(s ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const show = (html) => { root.innerHTML = html; };
  const message = (s,ok=false) => '<div class="nb-alert '+(ok?'ok':'')+'">'+escapeHtml(s)+'</div>';
  const field = (label,name,type='text',extra='') => '<div class="nb-field"><label for="'+name+'">'+label+'</label><input id="'+name+'" name="'+name+'" type="'+type+'" '+extra+' required></div>';
  const authScreen = (mode='login',msg='') => {
    const signup = mode==='signup';
    show('<section class="nb-card nb-auth"><div class="nb-eyebrow">Welcome to NovaBank</div><h1 class="nb-title">'+(signup?'Create your demo account':'Your money, your dashboard')+'</h1><p class="nb-muted">'+(signup?'Register with your email. A separate demo account and ₹1,000 welcome credit will be created.':'Sign in to access your personal demo account and transactions.')+'</p>'+
      (msg?message(msg):'')+'<form id="authForm">'+(signup?field('Full name','fullName','text','maxlength="60" autocomplete="name"'):'')+
      field('Email address','email','email','autocomplete="email"')+field('Password','password','password','minlength="8" autocomplete="'+(signup?'new-password':'current-password')+'"')+
      '<div class="nb-actions"><button class="nb-btn primary" type="submit">'+(signup?'Create account':'Sign in')+'</button><button class="nb-btn ghost" type="button" data-mode="'+(signup?'login':'signup')+'">'+(signup?'I already have an account':'Create an account')+'</button></div></form><p class="nb-muted" style="margin-top:18px;font-size:12px">Demo credits have no cash value. Do not use a password you use elsewhere.</p></section>');
  };
  async function loadData() {
    const [p,a] = await Promise.all([
      client.from('profiles').select('id,full_name,account_number,is_admin').eq('id',user.id).single(),
      client.from('accounts').select('balance,currency,updated_at').eq('user_id',user.id).single()
    ]);
    if(p.error) throw p.error; if(a.error) throw a.error;
    profile=p.data; account=a.data;
  }
  async function loadTransactions() {
    const {data,error}=await client.from('transactions').select('id,kind,amount,balance_after,description,related_account,created_at').eq('user_id',user.id).order('created_at',{ascending:false}).limit(30);
    if(error) throw error; return data||[];
  }
  function dashboard(transactions=[]) {
    const nav=['overview','transfer','activity',...(profile.is_admin?['admin']:[])];
    const tabs=nav.map(t=>'<button type="button" data-tab="'+t+'" class="'+(activeTab===t?'active':'')+'">'+({overview:'Overview',transfer:'Transfer',activity:'Activity',admin:'Admin'}[t])+'</button>').join('');
    let content='';
    if(activeTab==='overview') content='<div class="nb-grid"><div class="nb-stat"><span>Available demo balance</span><strong>'+money(account.balance)+'</strong></div><div class="nb-stat"><span>Account number</span><strong>'+profile.account_number+'</strong></div><div class="nb-stat"><span>Account holder</span><strong>'+escapeHtml(profile.full_name)+'</strong></div></div><section class="nb-card"><h2 class="nb-section-title">Quick actions</h2><div class="nb-actions"><button class="nb-btn primary" data-tab="transfer">Send demo money</button><button class="nb-btn" data-action="deposit">Add demo funds</button><button class="nb-btn" data-action="withdraw">Withdraw demo funds</button></div><p class="nb-muted" style="margin-top:14px">All operations are recorded in the shared database and reflected in the recipient’s account.</p></section>';
    if(activeTab==='transfer') content='<section class="nb-card"><h2 class="nb-section-title">Transfer demo funds</h2><p class="nb-muted">Send simulated credits to another NovaBank account number.</p><form id="transferForm">'+field('Recipient account number','toAccount','text','inputmode="numeric" pattern="[0-9]+"')+field('Amount (INR)','transferAmount','number','min="0.01" max="100000" step="0.01"')+'<div class="nb-actions"><button class="nb-btn primary" type="submit">Review and send</button></div></form></section>';
    if(activeTab==='activity') content='<section class="nb-card"><h2 class="nb-section-title">Recent activity</h2>'+table(transactions)+'</section>';
    if(activeTab==='admin') content='<section class="nb-card nb-admin"><h2 class="nb-section-title">Admin overview</h2><p class="nb-muted">Restricted account directory for the designated NovaBank administrator.</p><div id="adminContent">Loading account directory…</div></section>';
    show('<div class="nb-inline" style="justify-content:space-between"><div><div class="nb-eyebrow">Personal banking space</div><h1 class="nb-title">Hello, '+escapeHtml(profile.full_name)+'</h1><p class="nb-muted">Account '+profile.account_number+' · Demo INR account</p></div><button class="nb-btn ghost" data-action="logout">Sign out</button></div><nav class="nb-tabs">'+tabs+'</nav><div class="nb-dashboard"><div>'+content+'</div><aside class="nb-card"><div class="nb-eyebrow">Account security</div><h2 class="nb-section-title">Your account is private</h2><p class="nb-muted">Only your signed-in account can read your balance and transaction history. Transfers are processed by database functions.</p><p class="nb-muted" style="margin-top:12px">Remember: these are fictional demo credits, not real money.</p></aside></div>');
    if(activeTab==='admin') loadAdmin();
  }
  function table(rows) {
    if(!rows.length) return '<p class="nb-muted">No transactions yet.</p>';
    return '<div class="nb-table-wrap"><table class="nb-table"><thead><tr><th>Type</th><th>Amount</th><th>Balance after</th><th>Date</th></tr></thead><tbody>'+rows.map(x=>{
      const plus=['deposit','welcome_credit','transfer_in'].includes(x.kind);
      return '<tr><td>'+escapeHtml(x.kind.replaceAll('_',' '))+(x.related_account?' · '+escapeHtml(x.related_account):'')+'</td><td class="'+(plus?'nb-positive':'nb-negative')+'">'+(plus?'+':'−')+money(x.amount)+'</td><td>'+money(x.balance_after)+'</td><td>'+new Date(x.created_at).toLocaleString('en-IN')+'</td></tr>';
    }).join('')+'</tbody></table></div>';
  }
  async function refresh() {
    await loadData();
    const tx=await loadTransactions();
    dashboard(tx);
  }
  async function loadAdmin() {
    const target=document.getElementById('adminContent'); if(!target)return;
    const [p,a]=await Promise.all([
      client.from('profiles').select('id,full_name,account_number,created_at').order('created_at',{ascending:false}).limit(200),
      client.from('accounts').select('user_id,balance')
    ]);
    if(p.error||a.error){target.innerHTML=message((p.error||a.error).message);return;}
    const balances=new Map((a.data||[]).map(x=>[x.user_id,x.balance]));
    target.innerHTML='<div class="nb-table-wrap"><table class="nb-table"><thead><tr><th>Name</th><th>Account</th><th>Demo balance</th><th>Joined</th></tr></thead><tbody>'+
      (p.data||[]).map(x=>'<tr><td>'+escapeHtml(x.full_name)+'</td><td>'+x.account_number+'</td><td>'+money(balances.get(x.id))+'</td><td>'+new Date(x.created_at).toLocaleDateString('en-IN')+'</td></tr>').join('')+'</tbody></table></div>';
  }
  async function runMoneyAction(action,amount,recipient) {
    const fn=action==='deposit'?'novabank_deposit':action==='withdraw'?'novabank_withdraw':'novabank_transfer';
    const args=action==='transfer'?{p_to_account:Number(recipient),p_amount:Number(amount)}:{p_amount:Number(amount)};
    const {error}=await client.rpc(fn,args); if(error)throw error;
    await refresh();
  }
  root.addEventListener('click',async e=>{
    const b=e.target.closest('button'); if(!b)return;
    if(b.dataset.mode){authScreen(b.dataset.mode);return;}
    if(b.dataset.tab){activeTab=b.dataset.tab;try{const tx=await loadTransactions();dashboard(tx);}catch(err){show(message(err.message));}return;}
    if(b.dataset.action==='logout'){await client.auth.signOut();return;}
    if(['deposit','withdraw'].includes(b.dataset.action)){
      const action=b.dataset.action;
      const amount=window.prompt(action==='deposit'?'Amount of demo funds to add (INR):':'Amount of demo funds to withdraw (INR):');
      if(amount===null)return;
      try{await runMoneyAction(action,amount);alert('Demo transaction completed.');}catch(err){alert(err.message);}
    }
  });
  root.addEventListener('submit',async e=>{
    e.preventDefault(); const form=e.target; const submit=form.querySelector('button[type=submit]'); if(submit)submit.disabled=true;
    try {
      if(form.id==='authForm'){
        const fd=new FormData(form),email=String(fd.get('email')).trim(),password=String(fd.get('password'));
        if(form.querySelector('#fullName')){
          const full_name=String(fd.get('fullName')).trim();
          const {data,error}=await client.auth.signUp({email,password,options:{data:{full_name},emailRedirectTo:location.origin+location.pathname}});
          if(error)throw error;
          if(data.session){user=data.user;await refresh();}
          else authScreen('login','Account created. Check your email to confirm, then sign in.');
        }else{
          const {data,error}=await client.auth.signInWithPassword({email,password});if(error)throw error;user=data.user;await refresh();
        }
      }
      if(form.id==='transferForm'){
        await runMoneyAction('transfer',form.transferAmount.value,form.toAccount.value);
        activeTab='overview';alert('Transfer successful. Recipient balance and transaction history are updated.');await refresh();
      }
    }catch(err){const tx=await loadTransactions().catch(()=>[]);if(user&&profile)dashboard(tx);const alertEl=document.createElement('div');alertEl.className='nb-alert';alertEl.textContent=err.message;root.prepend(alertEl); }
    finally{if(submit)submit.disabled=false;}
  });
  async function start() {
    if(!ready){show('<section class="nb-card nb-auth"><div class="nb-eyebrow">Backend connection required</div><h1 class="nb-title">Let’s connect NovaBank</h1><p class="nb-muted">The multi-user interface is ready, but it needs your Supabase project credentials before sign-up, login, shared balances, and transfers can work.</p><ol class="nb-muted" style="padding-left:20px;margin:18px 0;line-height:1.8"><li>Create a project at <a href="https://supabase.com/dashboard" target="_blank" rel="noreferrer">Supabase</a>.</li><li>Run the SQL in <code>supabase/schema.sql</code> using the SQL Editor.</li><li>Copy the Project URL and publishable/anon key from Project Settings → API.</li><li>Put those two values in <code>supabase-config.js</code> in this repository.</li></ol><p class="nb-alert">Never use the service-role key or database password in the browser.</p><p class="nb-muted">Until credentials are added, this site does not process or store multi-user account data.</p></section>');return;}
    client=window.supabase.createClient(cfg.supabaseUrl,cfg.supabaseAnonKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
    const {data:{session}}=await client.auth.getSession();
    if(session){user=session.user;try{await refresh();}catch(err){authScreen('login',err.message);}}
    else authScreen('login');
    client.auth.onAuthStateChange(async(_event,session)=>{user=session?.user||null;profile=null;account=null;if(!user){if(realtime)client.removeChannel(realtime);authScreen('login');return;}try{await refresh();if(realtime)client.removeChannel(realtime);realtime=client.channel('novabank-'+user.id).on('postgres_changes',{event:'*',schema:'public',table:'accounts',filter:'user_id=eq.'+user.id},()=>refresh()).on('postgres_changes',{event:'INSERT',schema:'public',table:'transactions',filter:'user_id=eq.'+user.id},()=>refresh()).subscribe();}catch(err){authScreen('login',err.message);}});
  }
  start().catch(err=>show('<section class="nb-card">'+message(err.message)+'</section>'));
})();
