/* ==================================================================
   LIVE LAYER — everyone sees the same data.
   Shared state lives in Redis behind /api/*. Each page polls a tiny
   edge-cached version endpoint (/api/v) and pulls a fresh snapshot
   (/api/state?v=N) only when something changed. Own actions refresh
   instantly; everyone else sees them within ~2 seconds.
   ================================================================== */

/* ---------- helpers ---------- */
function svgEl(html){ const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstChild }
function timeAgo(ts){
  const s = Math.max(1, Math.round((Date.now() - ts) / 1000));
  if (s < 60) return 'just now'; const m = Math.round(s/60); if (m < 60) return m + ' min ago';
  const h = Math.round(m/60); if (h < 24) return h + ' h ago'; return new Date(ts).toLocaleDateString([], {month:'short', day:'numeric'});
}
function pixelIcon(seed){
  let h = 0; for (const c of String(seed||'x')) h = (h*31 + c.charCodeAt(0)) >>> 0;
  const hue = h % 360; const cv = document.createElement('canvas'); cv.width = cv.height = 5; const c = cv.getContext('2d');
  c.fillStyle = `hsl(${hue} 70% 92%)`; c.fillRect(0,0,5,5); c.fillStyle = `hsl(${hue} 70% 42%)`;
  for (let y=0;y<5;y++) for (let x=0;x<3;x++) if ((h >> (y*3+x)) & 1){ c.fillRect(x,y,1,1); c.fillRect(4-x,y,1,1) }
  return cv.toDataURL();
}
const iconCache = new Map();
function iconFor(seed){ if (!iconCache.has(seed)) iconCache.set(seed, pixelIcon(seed)); return iconCache.get(seed) }
const xpLoader = (label) => el('span', {class:'xp-load', role:'status', 'aria-label': label || 'Loading'}, [el('i'), el('i'), el('i')]);

/* ---------- identity (a random device token, not an account) ---------- */
function makeId(){ return (crypto.randomUUID ? crypto.randomUUID() : ([1e7]+-1e3+-4e3+-8e3+-1e11).replace(/[018]/g, c => (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16))) }
const SID = store.get('msga_sid') || (() => { const s = makeId(); store.set('msga_sid', s); return s })();
const TAB = Math.random().toString(36).slice(2, 8);
const myPosts = new Set(JSON.parse(store.get('msga_mine') || '[]'));
const myReports = new Set();
function rememberMine(id){ myPosts.add(id); store.set('msga_mine', JSON.stringify([...myPosts].slice(-300))) }
let adminKey = '';

/* ---------- API ---------- */
async function api(path, {method = 'GET', body, admin} = {}){
  const headers = {};
  if (body) headers['Content-Type'] = 'application/json';
  if (admin) headers['X-Admin-Token'] = adminKey;
  let r;
  try { r = await fetch(path, {method, headers, body: body ? JSON.stringify(body) : undefined, cache: method === 'GET' ? 'no-cache' : 'no-store'}) }
  catch(e){ throw Object.assign(new Error('You seem to be offline. Check your connection.'), {status: 0}) }
  let data = {}; try { data = await r.json() } catch(e){}
  if (!r.ok) throw Object.assign(new Error(data.error || `Request failed (${r.status})`), {status: r.status, data});
  return data;
}

/* ---------- shared state + sync loop ---------- */
const L = { v: -1, snap: null, counts: null, online: null, mine: null, ok: false, failing: 0, olderWall: [], wallDone: false, seen: {} };
let pollTimer = 0, polling = false;

async function pullState(v){
  const snap = await api('/api/state' + (v != null ? `?v=${v}` : ''));
  if (L.snap && snap.v < L.snap.v) return;        // never go backwards
  L.snap = snap; L.v = snap.v; L.counts = snap.counts; L.online = snap.online;
  renderAll();
}
async function tick(){
  if (polling) return; polling = true;
  try{
    const head = await api('/api/v');
    L.online = head.online;
    L.counts = {supporters: head.supporters, messages: head.messages, wall: head.wall};
    if (head.v !== L.v || !L.snap) await pullState(head.v);
    else { updateStats(); paintChatTitle() }
    if (!L.ok || L.failing){ L.failing = 0; setConn(true) }
  }catch(e){
    L.failing++;
    setConn(false, e.status === 503 ? 'setup' : 'retry');
  }finally{
    polling = false;
    clearTimeout(pollTimer);
    const base = document.hidden ? 20000 : 2500;
    pollTimer = setTimeout(tick, L.failing ? Math.min(20000, 2000 * 2 ** L.failing) : base);
  }
}
function syncNow(v){ if (v != null && v > L.v) pullState(v).catch(() => {}); else { clearTimeout(pollTimer); tick() } }
function setConn(ok, why){
  L.ok = ok;
  const p = $('#liveState');
  if (ok) p.innerHTML = '<i class="dot"></i>LIVE';
  else p.innerHTML = why === 'setup' ? '<i class="dot" style="background:#e5a100;box-shadow:none"></i>DATABASE NOT CONNECTED' : '<i class="dot" style="background:#e5a100;box-shadow:none"></i>RECONNECTING&hellip;';
  if (!ok && L.failing === 1 && why !== 'setup' && L.snap) chatNote('Connection lost. Reconnecting…', true);
  if (ok && L.snap && /Reconnecting/.test($('#chatFoot').textContent)) chatNote('Back online.');
  paintInputs();
}

/* presence heartbeat */
let beatTimer = 0;
async function heartbeat(){
  clearTimeout(beatTimer);
  if (!document.hidden){
    try { const r = await api('/api/presence', {method:'POST', body:{sid: SID, tab: TAB}}); L.online = r.online; updateStats(); paintChatTitle() } catch(e){}
  }
  beatTimer = setTimeout(heartbeat, 25000);
}
function leave(){
  try { navigator.sendBeacon('/api/presence', new Blob([JSON.stringify({sid: SID, tab: TAB, leave: true})], {type:'application/json'})) } catch(e){}
}
document.addEventListener('visibilitychange', () => { if (!document.hidden){ syncNow(); heartbeat() } });
addEventListener('pagehide', leave);
addEventListener('online', () => syncNow());

/* ---------- Movement Monitor ---------- */
let monitorSeen = false;
const lcdTargets = {};
function setLcd(id, val, sub){
  const box = $('#' + id), n = $('.num', box);
  if (sub) $('.sub', box).textContent = sub;
  if (val == null){ if (!$('.xp-load', n)){ n.textContent = ''; n.append(xpLoader('Loading')) } n.classList.add('dim'); return }
  n.classList.remove('dim');
  const prev = lcdTargets[id];
  lcdTargets[id] = val;
  if (typeof val !== 'number'){ n.textContent = val; return }
  const shown = val >= 1e6 ? (val/1e6).toFixed(1) + 'M' : fmt(val);
  if (!monitorSeen){ n.dataset.final = shown; n.textContent = '0'; return }
  if (prev !== undefined && prev !== val){ box.classList.remove('bump'); void box.offsetWidth; box.classList.add('bump') }
  n.textContent = shown;
}
function countUp(){
  monitorSeen = true;
  for (const [id, val] of Object.entries(lcdTargets)){
    if (typeof val !== 'number') continue;
    const n = $('.num', $('#' + id));
    if (RM){ n.textContent = fmt(val); continue }
    const t0 = performance.now(), d = 1100;
    const step = t => { const p = Math.min(1, (t - t0) / d), e = 1 - Math.pow(1 - p, 4); n.textContent = fmt(Math.round(val * e)); if (p < 1) requestAnimationFrame(step) };
    requestAnimationFrame(step);
  }
}
if ('IntersectionObserver' in window){
  const io = new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)){ io.disconnect(); countUp() } }, {threshold: .35});
  io.observe($('#growing'));
} else monitorSeen = true;

function updateStats(){
  const c = L.counts;
  setLcd('lcdSup', c ? c.supporters : null, 'shared by every visitor');
  setLcd('lcdOn', L.online != null ? L.online : null, 'pages open right now');
  setLcd('lcdMsg', c ? c.messages : null, 'sent in trench chat');
  if (CONFIG.launchDate){
    const d0 = new Date(CONFIG.launchDate + 'T00:00:00'); const days = Math.floor((Date.now() - d0) / 864e5);
    if (isNaN(days)) setLcd('lcdDays', 'SOON', 'launch date not set');
    else if (days < 0) setLcd('lcdDays', 'T-' + (-days), 'days until launch');
    else setLcd('lcdDays', days, 'since ' + d0.toLocaleDateString([], {month:'short', day:'numeric', year:'numeric'}));
  } else setLcd('lcdDays', 'SOON', 'launch date not announced');
}

/* supporters list */
function supName(s){ return (!s.anon && s.handle) ? '@' + s.handle : 'Anonymous supporter' }
function renderSups(){
  const tb = $('#supList'); tb.textContent = '';
  if (!L.snap){ tb.append(el('tr', {class:'empty'}, el('td', {colspan:'2'}, [xpLoader('Loading signatures'), ' Loading signatures…']))); return }
  const list = L.snap.supporters;
  if (!list.length) tb.append(el('tr', {class:'empty'}, el('td', {colspan:'2', text:'No signatures yet. Be the first to sign.'})));
  list.forEach(s => tb.append(el('tr', {}, [el('td', {}, [el('img', {class:'mini-ico', alt:'', src: iconFor(s.id)}), el('span', {text: supName(s)})]), el('td', {text: timeAgo(s.t)})])));
  const more = (L.counts?.supporters || 0) - list.length;
  if (more > 0) tb.append(el('tr', {class:'empty'}, el('td', {colspan:'2', text:`+ ${fmt(more)} more`})));
  paintSupportBtn();
}
function paintSupportBtn(){ const b = $('#supportBtn'); b.lastChild.textContent = L.mine ? 'YOU SIGNED ✓  EDIT' : 'I SUPPORT THE MOVEMENT' }
api('/api/join?sid=' + encodeURIComponent(SID)).then(r => { L.mine = r.mine; paintSupportBtn() }).catch(() => {});

/* ---------- support dialog ---------- */
let supView = 'form';
function openSupport(){ supView = 'form'; renderSupport(); $('#supportModal').hidden = false; const f = $('#supBody input:not([disabled]), #supBody button'); if (f) f.focus() }
function closeModals(){ $$('.modal').forEach(m => m.hidden = true) }
$$('.modal').forEach(m => m.addEventListener('click', e => { if (e.target === m || e.target.closest('[data-close]')) m.hidden = true }));
const ICON_FLAG = '<svg viewBox="0 0 40 40" aria-hidden="true"><rect x="6" y="4" width="3" height="34" fill="#7a6a4a"/><path d="M9 6h24l-5 7 5 7H9z" fill="#4BE8EC" stroke="#005C70"/></svg>';
function renderSupport(){
  const body = $('#supBody'); body.textContent = '';
  if (supView === 'done'){
    const n = L.counts?.supporters || 0;
    body.append(el('div', {class:'dlg-row'}, [svgEl(ICON_FLAG), el('div', {}, [el('p', {class:'big-ok', text:"You're in."}), el('p', {text: `Your signature is saved. The movement has ${fmt(n)} supporter${n === 1 ? '' : 's'} so far.`})])]),
      el('div', {class:'dlg-actions'}, [el('button', {class:'btn-xp', type:'button', text:'Sign the guestbook', onclick: () => { closeModals(); go('guestbook') }}), el('button', {class:'btn-xp primary', type:'button', 'data-close':'', text:'OK'})]));
    return;
  }
  const mine = L.mine;
  body.append(el('div', {class:'dlg-row'}, [svgEl(ICON_FLAG), el('p', {text:'Add your name to Make Stonk Great Again. Leave the X username empty or tick anonymous to sign without a name.'})]));
  const handle = el('input', {id:'supHandle', type:'text', maxlength:'16', placeholder:'username', autocomplete:'off', spellcheck:'false', autocapitalize:'off'});
  const anon = el('input', {id:'supAnon', type:'checkbox'});
  if (mine){ handle.value = mine.handle || ''; anon.checked = !!mine.anon }
  const sync = () => { handle.disabled = anon.checked }; anon.addEventListener('change', sync); sync();
  const err = el('p', {class:'err-text', role:'alert'});
  const ok = el('button', {class:'btn-xp primary', type:'submit', text: mine ? 'Save changes' : 'Sign'});
  const form = el('form', {class:'win-body', style:'padding:0;display:grid;gap:12px', novalidate:''}, [
    el('label', {class:'field', for:'supHandle'}, ['X username (optional)', el('span', {class:'inp'}, [el('span', {text:'@'}), handle])]),
    el('label', {class:'chk'}, [anon, 'Sign anonymously']),
    el('p', {class:'fine', text:'One signature per browser, and a few per network per day. It counts signatures, not verified unique people.'}),
    err,
    el('div', {class:'dlg-actions'}, [
      mine ? el('button', {class:'btn-xp', type:'button', text:'Remove my signature', onclick: async () => {
        ok.disabled = true;
        try { const r = await api('/api/join', {method:'POST', body:{sid: SID, action:'remove'}}); L.mine = null; closeModals(); balloon('SIGNATURE REMOVED', 'You can sign again any time.'); syncNow(r.v) }
        catch(e){ err.textContent = e.message; ok.disabled = false }
      }}) : null,
      el('button', {class:'btn-xp', type:'button', 'data-close':'', text:'Cancel'}), ok])
  ]);
  form.addEventListener('submit', async e => {
    e.preventDefault(); err.textContent = '';
    let h = handle.value.trim().replace(/^@/, '');
    if (!anon.checked && h && !/^[A-Za-z0-9_]{1,15}$/.test(h)){ err.textContent = 'X usernames use letters, numbers and underscores, up to 15 characters.'; handle.focus(); return }
    ok.disabled = true; ok.textContent = 'Saving…';
    try{
      const r = await api('/api/join', {method:'POST', body:{sid: SID, handle: anon.checked ? '' : h, anon: anon.checked || !h}});
      L.mine = r.mine; if (L.counts) L.counts.supporters = r.count;
      Snd.ding(); supView = 'done'; renderSupport(); syncNow(r.v);
    }catch(ex){ ok.disabled = false; ok.textContent = mine ? 'Save changes' : 'Sign'; err.textContent = ex.message }
  });
  body.append(form);
}

/* ---------- chat ---------- */
const chat = $('#chat'), log = $('#chatLog');
function openChat(focus){ chat.hidden = false; $('#chatTk').setAttribute('aria-pressed','true'); store.set('msga_chat','open'); renderChat(true); if (focus) setTimeout(() => $('#chatInput').focus({preventScroll:true}), 50) }
function closeChat(remember){ chat.hidden = true; $('#chatTk').setAttribute('aria-pressed','false'); if (remember) store.set('msga_chat','closed') }
function toggleChat(){ if (chat.hidden) openChat(true); else closeChat(true) }
$('#chatMin').addEventListener('click', () => closeChat(false));
$('#chatClose').addEventListener('click', () => closeChat(true));
(function(){
  const bar = $('#chatDrag'); let sx, sy, ox, oy, dragging = false;
  bar.addEventListener('pointerdown', e => {
    if (e.target.closest('button') || !matchMedia('(pointer: fine) and (min-width: 561px)').matches) return;
    const r = chat.getBoundingClientRect(); dragging = true; sx = e.clientX; sy = e.clientY; ox = r.left; oy = r.top; bar.setPointerCapture(e.pointerId);
  });
  bar.addEventListener('pointermove', e => {
    if (!dragging) return;
    const x = Math.min(innerWidth - 120, Math.max(0, ox + e.clientX - sx)), y = Math.min(innerHeight - 80, Math.max(0, oy + e.clientY - sy));
    Object.assign(chat.style, {left: x + 'px', top: y + 'px', right: 'auto', bottom: 'auto'});
  });
  bar.addEventListener('pointerup', () => dragging = false);
})();
const nickInput = $('#nickInput'), anonChk = $('#anonChk');
nickInput.value = store.get('msga_nick') || '';
anonChk.checked = store.get('msga_anon') === '1';
nickInput.disabled = anonChk.checked;
function currentNick(){ return anonChk.checked ? 'Anonymous' : nickInput.value.trim() }
nickInput.addEventListener('change', () => { const v = nickInput.value.replace(/[^\w .\-]/g, '').trim().slice(0, 20); nickInput.value = v; store.set('msga_nick', v); syncGbNick() });
anonChk.addEventListener('change', () => { store.set('msga_anon', anonChk.checked ? '1' : '0'); nickInput.disabled = anonChk.checked });
function paintChatTitle(){ $('#chatTitle').textContent = 'Trench Chat' + (L.online != null ? ` — ${fmt(L.online)} online` : '') }
function chatNote(t, isErr){ const f = $('#chatFoot'); f.textContent = t || ''; f.classList.toggle('err', !!isErr) }
function paintInputs(){
  const off = !L.snap && !L.ok;
  $('#chatInput').disabled = off; $('#chatSendBtn').disabled = off; $('#emojiBtn').disabled = off;
  $('#gbSubmit') && ($('#gbSubmit').disabled = off);
  if (!$('#chatFoot').textContent) chatNote('Links are off to keep scam links out. Be decent.');
}
function nearBottom(){ return log.scrollHeight - log.scrollTop - log.clientHeight < 80 }
let chatSig = '';
function postActions(m, type){
  const acts = el('span', {class:'msg-a'});
  const mine = myPosts.has(m.id);
  if (!mine && !m.h && !myReports.has(m.id)) acts.append(el('button', {type:'button', title:'Report', 'aria-label':'Report message', text:'⚑', onclick: () => reportPost(type, m)}));
  if (mine) acts.append(el('button', {type:'button', title:'Delete my message', 'aria-label':'Delete my message', text:'✕', onclick: () => deleteOwn(type, m)}));
  if (adminKey){
    acts.append(el('button', {type:'button', class:'mod', title: m.h ? 'Unhide' : 'Hide', 'aria-label': m.h ? 'Unhide message' : 'Hide message', text: m.h ? '↺' : '◌', onclick: () => modAction(m.h ? 'unhide' : 'hide', type, m)}));
    acts.append(el('button', {type:'button', class:'mod', title:'Delete (moderator)', 'aria-label':'Delete message as moderator', text:'\u{1F5D1}', onclick: () => modAction('delete', type, m)}));
    acts.append(el('button', {type:'button', class:'mod', title:'Ban sender', 'aria-label':'Ban sender', text:'⊘', onclick: () => modAction('ban', type, m)}));
  }
  return acts;
}
function hiddenText(m){ return myReports.has(m.id) ? 'You reported this message.' : 'Hidden by moderation or community reports.' }
function renderChat(force){
  if (chat.hidden && !force) return;
  const list = L.snap ? L.snap.chat.slice().reverse() : null;
  const sig = (list ? list.map(m => m.id + m.r + m.h).join() : 'x') + (adminKey ? 'A' : '') + myReports.size;
  if (sig === chatSig && !force) return; chatSig = sig;
  const stick = nearBottom() || force;
  log.textContent = '';
  if (!list){
    log.append(el('div', {class:'chat-empty'}, [xpLoader('Connecting'), el('b', {text:'Connecting to the trenches…'})]));
    paintInputs(); return;
  }
  if (!list.length) log.append(el('div', {class:'chat-empty'}, [svgEl('<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M1 2h10v7H5l-3 3V9H1z" fill="#fff" stroke="#101A47"/><path d="M12 5h3v7h-1v2l-2-2H7v-2" fill="#7FFFF6" stroke="#101A47"/></svg>'), el('b', {text:'No messages yet'}), el('span', {text:'Say gm. The first message starts the room.'})]));
  for (const m of list){
    const mine = myPosts.has(m.id), hidden = m.h || myReports.has(m.id);
    const box = el('div', {class:'msg' + (mine ? ' me' : '') + (m.r && adminKey ? ' flag' : '')});
    const head = el('div', {class:'msg-h'}, [el('img', {class:'mini-ico', alt:'', src: iconFor(m.nick + (m.anon ? m.id : ''))}), el('span', {class:'nick', text: m.nick}), el('time', {text: new Date(m.t).toLocaleTimeString([], {hour:'numeric', minute:'2-digit'}), title: new Date(m.t).toLocaleString()}), postActions(m, 'chat')]);
    const body = el('div', {class:'msg-t', text: hidden ? hiddenText(m) : m.body}); if (hidden) body.style.fontStyle = 'italic';
    if (adminKey && m.r) body.append(el('div', {class:'rep', text:`${m.r} report${m.r > 1 ? 's' : ''}`}));
    box.append(head, body); log.append(box);
  }
  if (stick) log.scrollTop = log.scrollHeight;
  else log.append(el('button', {class:'newpill', type:'button', text:'New messages ↓', onclick: () => { log.scrollTop = log.scrollHeight } }));
  paintInputs();
}
async function reportPost(type, m){
  myReports.add(m.id); renderAll(true);
  try { const r = await api('/api/report', {method:'POST', body:{sid: SID, type, id: m.id}}); (type === 'chat' ? chatNote : gbNote)('Thanks. Posts with 3 reports are hidden automatically.'); if (r.v) syncNow(r.v) }
  catch(e){ myReports.delete(m.id); renderAll(true); (type === 'chat' ? chatNote : gbNote)(e.message, true) }
}
async function deleteOwn(type, m){
  try { const r = await api(type === 'chat' ? '/api/chat' : '/api/wall', {method:'POST', body:{sid: SID, action:'delete', id: m.id}}); syncNow(r.v) }
  catch(e){ (type === 'chat' ? chatNote : gbNote)(e.message, true) }
}
async function modAction(action, type, m){
  try { const r = await api('/api/admin', {method:'POST', admin: true, body:{action, type, id: m.id}}); (type === 'chat' ? chatNote : gbNote)({hide:'Hidden.', unhide:'Restored.', delete:'Deleted.', ban:'Sender banned and post hidden.'}[action]); syncNow(r.v) }
  catch(e){ if (e.status === 401){ setAdmin('') } (type === 'chat' ? chatNote : gbNote)(e.message, true) }
}
const recentSends = [];
$('#chatForm').addEventListener('submit', async e => {
  e.preventDefault();
  const inp = $('#chatInput'), text = inp.value.trim();
  if (!text) return;
  if (!anonChk.checked && nickInput.value.trim().length < 2){ chatNote('Pick a nickname (2+ letters) or tick Anonymous.', true); nickInput.focus(); return }
  const now = Date.now();
  while (recentSends.length && now - recentSends[0] > 30000) recentSends.shift();
  if (recentSends.length && now - recentSends[recentSends.length - 1] < 2500){ chatNote('Slow down a little. One message every few seconds.', true); return }
  recentSends.push(now);
  inp.value = ''; Snd.click();
  $('#chatSendBtn').disabled = true;
  try{
    const r = await api('/api/chat', {method:'POST', body:{sid: SID, nick: currentNick(), anon: anonChk.checked, text}});
    rememberMine(r.post.id);
    if (L.snap){ L.snap.chat = [r.post, ...L.snap.chat.filter(m => m.id !== r.post.id)]; renderChat(true) }
    chatNote('Links are off to keep scam links out. Be decent.');
    syncNow(r.v);
  }catch(ex){ inp.value = text; chatNote(ex.message, true) }
  finally{ $('#chatSendBtn').disabled = false }
});
(function(){
  const list = ['\u{1F680}','\u{1F4C8}','\u{1F525}','\u{1F48E}','\u{1F64C}','\u{1F602}','\u{1F60E}','\u{1F440}','\u{1F44D}','\u{1F4AF}','\u{1F31E}','☁️','\u{1F33F}','\u{1F9E2}','\u{1F454}','\u{1F4BB}','\u{1FAE1}','\u{1F91D}','\u{1F389}','\u{1F4B0}','\u{1F6A9}','\u{1F422}','\u{1F407}','❤️'];
  const pop = $('#emojiPop'), btn = $('#emojiBtn');
  list.forEach(em => pop.append(el('button', {type:'button', text: em, 'aria-label': 'Insert ' + em, onclick: () => { const i = $('#chatInput'); const p = i.selectionStart ?? i.value.length; i.value = (i.value.slice(0,p) + em + i.value.slice(p)).slice(0,240); pop.hidden = true; btn.setAttribute('aria-expanded','false'); i.focus() }})));
  btn.addEventListener('click', e => { e.stopPropagation(); pop.hidden = !pop.hidden; btn.setAttribute('aria-expanded', String(!pop.hidden)) });
  document.addEventListener('click', e => { if (!pop.hidden && !e.target.closest('#emojiPop')) { pop.hidden = true; btn.setAttribute('aria-expanded','false') } });
})();

/* ---------- guestbook (community wall) ---------- */
const gbList = $('#gbList'), gbForm = $('#gbForm');
function gbNote(t, isErr){ const f = $('#gbNote'); f.textContent = t || ''; f.classList.toggle('err', !!isErr) }
function syncGbNick(){ if (!$('#gbNick').value) $('#gbNick').value = store.get('msga_nick') || '' }
$('#gbNick').value = store.get('msga_nick') || '';
$('#gbAnon').checked = store.get('msga_anon') === '1';
$('#gbNick').disabled = $('#gbAnon').checked;
$('#gbAnon').addEventListener('change', () => { $('#gbNick').disabled = $('#gbAnon').checked });
$('#gbText').addEventListener('input', () => { $('#gbCount').textContent = `${$('#gbText').value.length} / 280` });
let gbSig = '';
function renderWall(force){
  const fresh = L.snap ? L.snap.wall : null;
  const sig = (fresh ? fresh.map(m => m.id + m.r + m.h).join() : 'x') + L.olderWall.length + (adminKey ? 'A' : '') + myReports.size;
  if (sig === gbSig && !force) return; gbSig = sig;
  gbList.textContent = '';
  if (!fresh){ gbList.append(el('div', {class:'gb-empty'}, [xpLoader('Loading guestbook'), ' Opening Guestbook.txt…'])); return }
  const seen = new Set(), all = [];
  for (const m of [...fresh, ...L.olderWall]) if (!seen.has(m.id)){ seen.add(m.id); all.push(m) }
  if (!all.length){ gbList.append(el('div', {class:'gb-empty', text:'The guestbook is empty. Write the first entry.'})); return }
  for (const m of all){
    const mine = myPosts.has(m.id), hidden = m.h || myReports.has(m.id);
    const entry = el('article', {class:'gb-entry' + (mine ? ' me' : '')}, [
      el('div', {class:'gb-meta'}, [
        el('span', {class:'gb-n', text: '#' + (m.n || '?')}),
        el('b', {text: m.nick}),
        el('time', {text: new Date(m.t).toLocaleString([], {month:'short', day:'numeric', hour:'numeric', minute:'2-digit'}), title: new Date(m.t).toLocaleString()}),
        postActions(m, 'wall')
      ]),
      el('p', {class:'gb-body' + (hidden ? ' muted' : ''), text: hidden ? hiddenText(m) : m.body})
    ]);
    if (adminKey && m.r) entry.append(el('div', {class:'rep', text:`${m.r} report${m.r > 1 ? 's' : ''}`}));
    gbList.append(entry);
  }
  const lastT = all[all.length - 1].t;
  if (!L.wallDone && (L.counts?.wall || 0) > all.length){
    gbList.append(el('button', {class:'btn-xp gb-more', type:'button', text:'Load older entries', onclick: async ev => {
      const b = ev.currentTarget; b.disabled = true; b.textContent = 'Loading…';
      try { const r = await api('/api/wall?before=' + lastT); if (r.posts.length < 20) L.wallDone = true; L.olderWall.push(...r.posts); renderWall(true) }
      catch(e){ b.disabled = false; b.textContent = 'Load older entries'; gbNote(e.message, true) }
    }}));
  }
}
gbForm.addEventListener('submit', async e => {
  e.preventDefault(); gbNote('');
  const anon = $('#gbAnon').checked, nick = $('#gbNick').value.trim(), text = $('#gbText').value.trim();
  if (!anon && nick.length < 2){ gbNote('Add a name (2+ letters) or sign anonymously.', true); $('#gbNick').focus(); return }
  if (text.length < 4){ gbNote('Write at least a few words.', true); $('#gbText').focus(); return }
  const btn = $('#gbSubmit'); btn.disabled = true; btn.textContent = 'Signing…';
  try{
    const r = await api('/api/wall', {method:'POST', body:{sid: SID, nick, anon, text}});
    rememberMine(r.post.id);
    if (!anon && nick){ store.set('msga_nick', nick); if (!nickInput.value) nickInput.value = nick }
    if (L.snap){ L.snap.wall = [r.post, ...L.snap.wall]; renderWall(true) }
    $('#gbText').value = ''; $('#gbCount').textContent = '0 / 280';
    gbNote('Signed. Thanks for adding your voice.'); Snd.ding(); syncNow(r.v);
  }catch(ex){ gbNote(ex.message, true) }
  finally{ btn.disabled = false; btn.textContent = 'Sign the guestbook' }
});

/* ---------- moderation ----------
   No moderator accounts: posts are moderated by the community.
   3 reports hide a post automatically (server-side). */
function setAdmin(key){ adminKey = key || ''; renderAll(true) }

/* ---------- render + start ---------- */
function renderAll(force){ updateStats(); renderSups(); renderChat(force); renderWall(force); paintChatTitle(); if (!$('#supportModal').hidden && supView === 'form' && !document.activeElement?.closest('#supBody')) renderSupport() }
renderAll(true);
setInterval(() => { if (L.snap) renderSups() }, 60000);
tick();
heartbeat();
