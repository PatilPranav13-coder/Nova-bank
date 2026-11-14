/* ================= NovaBank ATM ================= */
const DENOMS = [500, 200, 100];
const IDLE_MS = 45000;      // session timeout
const MAX_ATTEMPTS = 3;     // PIN attempts
const MAX_DEPOSIT_NOTES = 20;
const STORE_KEY = 'novabank_atm_v1';

const $ = s => document.querySelector(s);
const fmt = n => '₹' + Number(n).toLocaleString('en-IN');

/* ---------- Data ---------- */
function defaultState() {
  return {
    accounts: [
      { name: 'Pranav', acc: '100101', pin: '1234', balance: 1000, attempts: 0, locked: false, history: [] },
      { name: 'Ayush',  acc: '100102', pin: '5678', balance: 1000, attempts: 0, locked: false, history: [] },
      { name: 'Arun',   acc: '100103', pin: '9012', balance: 1000, attempts: 0, locked: false, history: [] }
    ],
    stock: { 500: 5, 200: 5, 100: 5 }   // notes inside the ATM
  };
}
function load() {
  try { const s = JSON.parse(localStorage.getItem(STORE_KEY)); if (s && s.accounts) return s; } catch (e) {}
  return defaultState();
}
function save() { try { localStorage.setItem(STORE_KEY, JSON.stringify(S)); } catch (e) {} }

let S = load();
let ui = { screen: 'welcome', buf: '', acc: null, counts: zero(), msg: '', type: '', result: null };
let idleTimer = null;

function zero() { return { 500: 0, 200: 0, 100: 0 }; }
const sumCounts = c => DENOMS.reduce((t, d) => t + d * c[d], 0);
const stockTotal = () => DENOMS.reduce((t, d) => t + d * S.stock[d], 0);

/* ---------- Idle timeout ---------- */
function resetIdle() {
  clearTimeout(idleTimer);
  if (ui.acc || ui.screen === 'pin') {
    idleTimer = setTimeout(() => {
      logout('Session timed out. Card ejected.', 'warn');
    }, IDLE_MS);
  }
}

/* ---------- Navigation ---------- */
function go(screen, keepMsg) {
  ui.screen = screen;
  ui.buf = '';
  ui.counts = zero();
  if (!keepMsg) { ui.msg = ''; ui.type = ''; }
  render();
  resetIdle();
}
function say(msg, type) { ui.msg = msg; ui.type = type || ''; }

function logout(msg, type) {
  ui.acc = null; ui.result = null;
  clearTimeout(idleTimer);
  $('#cardIn').classList.remove('in');
  $('#ledCard').classList.remove('off');
  say(msg || '', type);
  go('welcome', true);
}

/* ---------- Rendering ---------- */
function render() {
  const el = $('#screen');
  const a = ui.acc;
  const msgHTML = `<div class="msg ${ui.type}">${ui.msg || ''}</div>`;
  const timer = a ? '<div class="timer-bar" id="tb"></div>' : '';
  let h = '';

  switch (ui.screen) {
    case 'welcome':
      h = `<div class="s-center"><div class="s-title">Welcome to NovaBank</div>
           <div class="s-sub">Enter your 6-digit account number</div></div>
           <div class="display">${ui.buf.padEnd(6, '•').split('').join(' ')}</div>
           ${msgHTML}
           <div class="s-sub s-center">Use the keypad, then press <b>Enter</b>.</div>
           <button class="btn small" data-act="newacc">➕ Open a new account</button>`;
      break;

    case 'pin':
      h = `<div class="s-center"><div class="s-title">Hello, ${a.name}!</div>
           <div class="s-sub">Enter your 4-digit PIN</div></div>
           <div class="display dots">${[0,1,2,3].map(i => `<span class="${i < ui.buf.length ? 'f' : ''}"></span>`).join('')}</div>
           ${msgHTML}
           <div class="s-sub s-center">Attempts left: <b>${MAX_ATTEMPTS - a.attempts}</b> of ${MAX_ATTEMPTS}</div>${timer}`;
      break;

    case 'locked':
      h = `<div class="check">🔒</div><div class="s-title s-center">Account Locked</div>
           <div class="s-sub s-center">Too many wrong PIN attempts.<br>Please contact your bank.<br><small>(Use “Reset demo data” on the right to unlock)</small></div>
           <button class="btn" data-act="exit">OK</button>`;
      break;

    case 'menu':
      h = `<div><div class="s-title">Main Menu</div><div class="s-sub">${a.name} · Acc ${a.acc}</div></div>
           ${msgHTML}
           <div class="menu-grid">
             <button class="btn" data-act="balance">💰 Balance</button>
             <button class="btn" data-act="withdraw">💸 Withdraw</button>
             <button class="btn" data-act="deposit">📥 Deposit</button>
             <button class="btn" data-act="history">🧾 Mini Statement</button>
             <button class="btn" data-act="changepin" style="grid-column:span 2">🔑 Change PIN</button>
             <button class="btn danger" data-act="exit" style="grid-column:span 2">⏏ Exit &amp; Eject Card</button>
           </div>${timer}`;
      break;

    case 'newacc':
      if (ui.step === 0) {
        h = `<div class="s-center"><div class="s-title">Open New Account</div>
             <div class="s-sub">Step 1 of 3 · Enter your first name</div></div>
             <input id="nameInput" class="text-input" type="text" maxlength="12" placeholder="Your name" autocomplete="off" value="${ui.newName || ''}" />
             ${msgHTML}
             <div class="s-sub s-center">New accounts start with a ₹1000 welcome balance.</div>
             <div class="row"><button class="btn" data-act="startover">← Back</button>
             <button class="btn primary" data-act="namenext">Next</button></div>`;
      } else {
        h = `<div class="s-center"><div class="s-title">Open New Account</div>
             <div class="s-sub">Step ${ui.step + 1} of 3 · ${ui.step === 1 ? 'Choose a 4-digit PIN' : 'Re-enter the PIN to confirm'}</div></div>
             <div class="display dots">${[0,1,2,3].map(i => `<span class="${i < ui.buf.length ? 'f' : ''}"></span>`).join('')}</div>
             ${msgHTML}
             <div class="s-sub s-center">Use the keypad, then press <b>Enter</b>.</div>
             <button class="btn" data-act="startover">Cancel</button>`;
      }
      break;

    case 'created':
      h = `<div class="check">🎉</div>
           <div class="s-title s-center">Account Created!</div>
           <div class="balance-box"><div class="s-sub">${ui.result.name}, your account number is</div>
             <div class="amt" style="letter-spacing:4px">${ui.result.acc}</div>
             <div class="s-sub" style="margin-top:6px">Balance ${fmt(ui.result.bal)}</div></div>
           <div class="s-sub s-center">Remember your PIN. Keep it private!</div>
           <button class="btn primary" data-act="createdok">Log in now</button>`;
      break;

    case 'changepin': {
      const steps = ['Enter your current PIN', 'Enter a new 4-digit PIN', 'Re-enter the new PIN to confirm'];
      h = `<div class="s-center"><div class="s-title">Change PIN</div>
           <div class="s-sub">Step ${ui.step + 1} of 3 · ${steps[ui.step]}</div></div>
           <div class="display dots">${[0,1,2,3].map(i => `<span class="${i < ui.buf.length ? 'f' : ''}"></span>`).join('')}</div>
           ${msgHTML}
           <div class="s-sub s-center">Press <b>Enter</b> to continue${ui.step === 0 ? ` · Attempts left: <b>${MAX_ATTEMPTS - a.attempts}</b>` : ''}</div>
           <button class="btn" data-act="menu">← Back</button>${timer}`;
      break;
    }

    case 'balance':
      h = `<div class="s-title">Account Balance</div>
           <div class="balance-box"><div class="s-sub">Available balance</div><div class="amt">${fmt(a.balance)}</div></div>
           <button class="btn" data-act="menu">← Back</button>${timer}`;
      break;

    case 'history':
      h = `<div class="s-title">Mini Statement</div>
           <div class="hist">${a.history.length ? a.history.slice().reverse().slice(0, 8).map(x =>
             `<div class="hist-item"><span>${x.type} · ${x.time}</span>
              <span class="${x.amt >= 0 ? 'plus' : 'minus'}">${x.amt >= 0 ? '+' : '-'}${fmt(Math.abs(x.amt))}</span>
              <span>${fmt(x.bal)}</span></div>`).join('') : '<div class="s-sub s-center">No transactions yet.</div>'}</div>
           <button class="btn" data-act="menu">← Back</button>${timer}`;
      break;

    case 'withdraw': {
      const total = sumCounts(ui.counts);
      h = `<div><div class="s-title">Withdraw Cash</div><div class="s-sub">Pick the notes you want · Balance ${fmt(a.balance)}</div></div>
           ${noteRows('withdraw')}
           <div class="total-row"><span>Total</span><b>${fmt(total)}</b></div>
           <div class="quick">${[100, 300, 500, 700, 1000].map(q => `<button class="btn small" data-act="quick" data-amt="${q}">${fmt(q)}</button>`).join('')}</div>
           ${msgHTML}
           <div class="row"><button class="btn" data-act="menu">← Back</button>
           <button class="btn primary" data-act="confirmW" ${total ? '' : 'disabled'}>Withdraw</button></div>${timer}`;
      break;
    }

    case 'deposit': {
      const total = sumCounts(ui.counts);
      h = `<div><div class="s-title">Deposit Cash</div><div class="s-sub">Insert the notes you are depositing</div></div>
           ${noteRows('deposit')}
           <div class="total-row"><span>Total</span><b>${fmt(total)}</b></div>
           ${msgHTML}
           <div class="row"><button class="btn" data-act="menu">← Back</button>
           <button class="btn primary" data-act="confirmD" ${total ? '' : 'disabled'}>Deposit</button></div>${timer}`;
      break;
    }

    case 'done':
      h = `<div class="check">${ui.result.icon}</div>
           <div class="s-title s-center">${ui.result.title}</div>
           <div class="s-sub s-center">${ui.result.detail}</div>
           <div class="balance-box"><div class="s-sub">New balance</div><div class="amt">${fmt(a.balance)}</div></div>
           <div class="row"><button class="btn primary" data-act="menu">Main Menu</button>
           <button class="btn danger" data-act="exit">Exit</button></div>${timer}`;
      break;
  }
  el.innerHTML = h;
  const inp = el.querySelector('input'); if (inp) { inp.focus(); inp.setSelectionRange(inp.value.length, inp.value.length); }
  renderStock();
}

function noteRows(mode) {
  const a = ui.acc, total = sumCounts(ui.counts);
  return DENOMS.map(d => {
    const c = ui.counts[d];
    let canInc, avail = '';
    if (mode === 'withdraw') {
      canInc = c < S.stock[d] && total + d <= a.balance;
      avail = `${S.stock[d] - c} in ATM`;
    } else {
      canInc = c < MAX_DEPOSIT_NOTES;
      avail = `max ${MAX_DEPOSIT_NOTES}`;
    }
    return `<div class="note-row">
      <span class="note-tag n${d}">₹${d}</span>
      <div class="stepper">
        <button data-act="dec" data-d="${d}" ${c ? '' : 'disabled'}>−</button><b>${c}</b>
        <button data-act="inc" data-d="${d}" ${canInc ? '' : 'disabled'}>+</button>
      </div>
      <span class="avail">${avail}</span></div>`;
  }).join('');
}

function renderStock() {
  $('#stock').innerHTML = DENOMS.map(d =>
    `<div class="stock-row"><span class="note-tag n${d}">₹${d}</span>
     <div class="bar"><i style="width:${Math.min(100, S.stock[d] * 100 / 10)}%"></i></div><b>×${S.stock[d]}</b></div>`).join('') +
    `<div class="hint" style="margin-top:6px">Total cash in ATM: <b>${fmt(stockTotal())}</b></div>`;
  $('#newAccTitle').style.display = S.accounts.length > 3 ? '' : 'none';
  $('#extraAccs').innerHTML = S.accounts.slice(3).map(x =>
    `<button class="demo-card" data-acc="${x.acc}"><b>${x.name}</b><span>Acc ${x.acc}</span><em>Your PIN</em></button>`).join('');
}

/* ---------- Actions ---------- */
function addHistory(type, amt) {
  const a = ui.acc;
  a.history.push({ type, amt, bal: a.balance, time: new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) });
  if (a.history.length > 30) a.history.shift();
}

// find the combination of notes (within ATM stock) that makes `amt`, using the fewest notes
function findNotes(amt) {
  let best = null;
  for (let x = 0; x <= S.stock[500]; x++)
    for (let y = 0; y <= S.stock[200]; y++) {
      const rest = amt - 500 * x - 200 * y;
      if (rest < 0) break;
      if (rest % 100 === 0 && rest / 100 <= S.stock[100]) {
        const z = rest / 100, n = x + y + z;
        if (!best || n < best.n) best = { n, c: { 500: x, 200: y, 100: z } };
      }
    }
  return best ? best.c : null;
}

function dispense(counts) {
  const tray = $('#tray'); tray.innerHTML = '';
  let i = 0;
  DENOMS.forEach(d => { for (let k = 0; k < counts[d]; k++) {
    const n = document.createElement('div');
    n.className = `tray-note n${d}`; n.textContent = '₹' + d;
    n.style.animationDelay = (i++ * 0.12) + 's';
    tray.appendChild(n);
  }});
}

function handle(act, el) {
  resetIdle();
  const a = ui.acc;
  switch (act) {
    case 'menu': go('menu'); break;
    case 'balance': go('balance'); break;
    case 'withdraw': go('withdraw'); break;
    case 'deposit': go('deposit'); break;
    case 'history': go('history'); break;
    case 'changepin': ui.step = 0; ui.tmp = ''; go('changepin'); break;
    case 'newacc':
      if (S.accounts.length >= 10) { say('Maximum number of accounts reached (10).', 'err'); go('welcome', true); break; }
      ui.step = 0; ui.tmp = ''; ui.newName = ''; go('newacc'); break;
    case 'namenext': newAccEnter(); break;
    case 'startover': go('welcome'); break;
    case 'createdok': {
      const n = ui.result.acc; go('welcome'); ui.buf = n; render(); break;
    }
    case 'exit': logout('Thank you for banking with NovaBank. Please take your card.', 'ok'); break;

    case 'inc': case 'dec': {
      const d = +el.dataset.d;
      ui.counts[d] += act === 'inc' ? 1 : -1;
      ui.msg = ''; render(); break;
    }

    case 'quick': {
      const amt = +el.dataset.amt;
      if (amt > a.balance) { ui.counts = zero(); say('Insufficient balance for ' + fmt(amt), 'err'); render(); break; }
      const c = findNotes(amt);
      if (!c) { ui.counts = zero(); say('Cannot make ' + fmt(amt) + ' with the notes left in the ATM.', 'err'); }
      else { ui.counts = c; say('Notes auto-selected. You can still adjust them.', 'ok'); }
      render(); break;
    }

    case 'confirmW': {
      const total = sumCounts(ui.counts);
      if (total <= 0) break;
      if (total > a.balance) { say('Insufficient balance.', 'err'); render(); break; }
      DENOMS.forEach(d => { if (ui.counts[d] > S.stock[d]) { say(`Not enough ₹${d} notes in ATM.`, 'err'); } });
      if (ui.type === 'err') { render(); break; }
      const notes = { ...ui.counts };
      DENOMS.forEach(d => S.stock[d] -= notes[d]);
      a.balance -= total; addHistory('Withdraw', -total); save();
      ui.result = { icon: '✅', title: 'Please collect your cash',
        detail: DENOMS.filter(d => notes[d]).map(d => `${notes[d]} × ₹${d}`).join(' + ') + ` = <b>${fmt(total)}</b>` };
      go('done'); dispense(notes); break;
    }

    case 'confirmD': {
      const total = sumCounts(ui.counts);
      if (total <= 0) break;
      const notes = { ...ui.counts };
      DENOMS.forEach(d => S.stock[d] += notes[d]);
      a.balance += total; addHistory('Deposit', total); save();
      ui.result = { icon: '📥', title: 'Deposit successful',
        detail: DENOMS.filter(d => notes[d]).map(d => `${notes[d]} × ₹${d}`).join(' + ') + ` = <b>${fmt(total)}</b>` };
      go('done'); break;
    }
  }
}

/* ---------- Keypad ---------- */
function pressKey(k) {
  resetIdle();
  if (/^\d$/.test(k)) {
    if (ui.screen === 'welcome' && ui.buf.length < 6) ui.buf += k;
    else if ((ui.screen === 'pin' || ui.screen === 'changepin' || (ui.screen === 'newacc' && ui.step > 0)) && ui.buf.length < 4) ui.buf += k;
    else return;
    ui.msg = ''; render(); return;
  }
  if (k === 'clear') { ui.buf = ''; ui.msg = ''; if (['welcome', 'pin', 'changepin', 'newacc'].includes(ui.screen)) render(); return; }
  if (k === 'cancel') { if (ui.screen === 'newacc' || ui.screen === 'created') return go('welcome'); if (ui.acc || ui.screen === 'pin') logout('Transaction cancelled. Card ejected.', 'warn'); else { ui.buf = ''; render(); } return; }
  if (k === 'enter') {
    if (ui.screen === 'changepin') return changePinEnter();
    if (ui.screen === 'newacc') return newAccEnter();
    if (ui.screen === 'welcome') {
      const acc = S.accounts.find(x => x.acc === ui.buf);
      if (!acc) { say('Account not found. Try again.', 'err'); ui.buf = ''; return render(); }
      if (acc.locked) { ui.acc = acc; ui.screen = 'locked'; return render(); }
      ui.acc = acc;
      $('#cardIn').classList.add('in'); $('#ledCard').classList.add('off');
      say('Card accepted.', 'ok'); go('pin', true);
    } else if (ui.screen === 'pin') {
      const a = ui.acc;
      if (ui.buf.length !== 4) { say('PIN must be 4 digits.', 'warn'); return render(); }
      if (ui.buf === a.pin) { a.attempts = 0; save(); say('Login successful.', 'ok'); go('menu', true); }
      else {
        a.attempts++;
        if (a.attempts >= MAX_ATTEMPTS) { a.locked = true; save(); $('#cardIn').classList.remove('in'); go('locked'); }
        else { save(); say(`Wrong PIN! ${MAX_ATTEMPTS - a.attempts} attempt(s) left.`, 'err'); ui.buf = ''; render(); }
      }
    }
  }
}

/* ---------- Change PIN ---------- */
function changePinEnter() {
  const a = ui.acc;
  if (ui.buf.length !== 4) { say('PIN must be 4 digits.', 'warn'); return render(); }

  if (ui.step === 0) {                       // verify current PIN
    if (ui.buf === a.pin) { a.attempts = 0; save(); ui.step = 1; ui.buf = ''; ui.msg = ''; return render(); }
    a.attempts++;
    if (a.attempts >= MAX_ATTEMPTS) { a.locked = true; save(); $('#cardIn').classList.remove('in'); return go('locked'); }
    save(); say(`Wrong PIN! ${MAX_ATTEMPTS - a.attempts} attempt(s) left.`, 'err'); ui.buf = ''; return render();
  }
  if (ui.step === 1) {                       // choose new PIN
    if (ui.buf === a.pin) { say('New PIN must be different from the old one.', 'err'); ui.buf = ''; return render(); }
    if (/^(\d)\1{3}$/.test(ui.buf) || ui.buf === '1234' || ui.buf === '4321') {
      say('That PIN is too easy to guess. Try another.', 'err'); ui.buf = ''; return render();
    }
    ui.tmp = ui.buf; ui.step = 2; ui.buf = ''; ui.msg = ''; return render();
  }
  if (ui.buf !== ui.tmp) {                   // confirm
    ui.step = 1; ui.tmp = ''; ui.buf = ''; say('PINs did not match. Start with the new PIN again.', 'err'); return render();
  }
  a.pin = ui.tmp; ui.tmp = ''; save();
  say('PIN changed successfully! Use it next time you log in.', 'ok');
  go('menu', true);
}

/* ---------- Create account ---------- */
function newAccEnter() {
  if (ui.step === 0) {                       // name
    const inp = $('#nameInput');
    const name = (inp ? inp.value : '').trim();
    ui.newName = name;
    if (!/^[A-Za-z][A-Za-z ]{1,11}$/.test(name)) { say('Enter a name of 2–12 letters.', 'err'); return render(); }
    ui.newName = name.charAt(0).toUpperCase() + name.slice(1);
    ui.step = 1; ui.buf = ''; ui.msg = ''; return render();
  }
  if (ui.buf.length !== 4) { say('PIN must be 4 digits.', 'warn'); return render(); }

  if (ui.step === 1) {                       // choose PIN
    if (/^(\d)\1{3}$/.test(ui.buf) || ui.buf === '1234' || ui.buf === '4321') {
      say('That PIN is too easy to guess. Try another.', 'err'); ui.buf = ''; return render();
    }
    ui.tmp = ui.buf; ui.step = 2; ui.buf = ''; ui.msg = ''; return render();
  }
  if (ui.buf !== ui.tmp) {                   // confirm PIN
    ui.step = 1; ui.tmp = ''; ui.buf = ''; say('PINs did not match. Choose your PIN again.', 'err'); return render();
  }
  const accNo = String(Math.max(...S.accounts.map(x => +x.acc)) + 1);
  const acct = { name: ui.newName, acc: accNo, pin: ui.tmp, balance: 1000, attempts: 0, locked: false, history: [] };
  S.accounts.push(acct); save();
  ui.result = { name: acct.name, acc: accNo, bal: acct.balance };
  ui.tmp = '';
  go('created');
}

/* ---------- Events ---------- */
$('#screen').addEventListener('click', e => {
  const b = e.target.closest('[data-act]');
  if (b && !b.disabled) handle(b.dataset.act, b);
});
$('#keypad').addEventListener('click', e => {
  const b = e.target.closest('[data-k]'); if (b) pressKey(b.dataset.k);
});
document.querySelector('.panel').addEventListener('click', e => {
  const b = e.target.closest('.demo-card');
  if (!b || ui.screen !== 'welcome') return;
  ui.buf = b.dataset.acc; ui.msg = ''; render();
});
$('#tray').addEventListener('click', () => { $('#tray').innerHTML = ''; });
$('#resetBtn').addEventListener('click', () => {
  S = defaultState(); save(); ui = { screen: 'welcome', buf: '', acc: null, counts: zero(), msg: 'Demo data reset.', type: 'ok', result: null };
  $('#tray').innerHTML = ''; $('#cardIn').classList.remove('in'); $('#ledCard').classList.remove('off'); render();
});
document.addEventListener('keydown', e => {
  if (e.target.tagName === 'INPUT') {        // typing a name: only Enter / Esc are special
    if (e.key === 'Enter') pressKey('enter');
    else if (e.key === 'Escape') pressKey('cancel');
    return;
  }
  if (/^\d$/.test(e.key)) pressKey(e.key);
  else if (e.key === 'Enter') pressKey('enter');
  else if (e.key === 'Backspace') { ui.buf = ui.buf.slice(0, -1); if (['welcome', 'pin', 'changepin', 'newacc'].includes(ui.screen)) render(); }
  else if (e.key === 'Escape') pressKey('cancel');
});

render();