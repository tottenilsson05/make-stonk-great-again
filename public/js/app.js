/* ================= helpers ================= */
const $ = (s, r=document) => r.querySelector(s);
const $$ = (s, r=document) => [...r.querySelectorAll(s)];
const RM = matchMedia('(prefers-reduced-motion: reduce)').matches;
const store = {
  get(k){ try{ return localStorage.getItem(k) }catch(e){ return null } },
  set(k,v){ try{ localStorage.setItem(k,v) }catch(e){} }
};
function el(tag, props={}, kids=[]){
  const n = document.createElement(tag);
  for (const [k,v] of Object.entries(props)){
    if (k === 'class') n.className = v;
    else if (k === 'text') n.textContent = v;
    else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
    else n.setAttribute(k, v);
  }
  for (const c of [].concat(kids)) if (c != null) n.append(c);
  return n;
}
const fmt = n => n.toLocaleString('en-US');

/* ================= SOUND (synthesized, original) ================= */
const Snd = {
  ctx:null, on: store.get('msga_sound') === 'on', hum:null,
  ensure(){
    if (!this.ctx){ const C = window.AudioContext || window.webkitAudioContext; if(!C) return false;
      this.ctx = new C(); this.out = this.ctx.createGain(); this.out.gain.value = .55; this.out.connect(this.ctx.destination);
      const d = this.ctx.createDelay(); d.delayTime.value = .23; const fb = this.ctx.createGain(); fb.gain.value = .32; const wet = this.ctx.createGain(); wet.gain.value = .35;
      d.connect(fb); fb.connect(d); d.connect(wet); wet.connect(this.out); this.verb = d; }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    return true;
  },
  tone(f, dur, {type='sine', vol=.1, at=0, attack=.01, verb=false}={}){
    if (!this.on || !this.ensure()) return;
    const t = this.ctx.currentTime + at, o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type; o.frequency.value = f;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + attack); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
    o.connect(g); g.connect(this.out); if (verb) g.connect(this.verb);
    o.start(t); o.stop(t + dur + .05);
  },
  noise(dur, {vol=.05, freq=2000, type='highpass', at=0}={}){
    if (!this.on || !this.ensure()) return;
    const n = Math.floor(this.ctx.sampleRate * dur), b = this.ctx.createBuffer(1, n, this.ctx.sampleRate), d = b.getChannelData(0);
    for (let i=0;i<n;i++) d[i] = (Math.random()*2-1) * (1 - i/n);
    const s = this.ctx.createBufferSource(); s.buffer = b; const f = this.ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq;
    const g = this.ctx.createGain(); g.gain.value = vol; s.connect(f); f.connect(g); g.connect(this.out); s.start(this.ctx.currentTime + at);
  },
  click(){ this.tone(1900, .04, {type:'square', vol:.025}) },
  tick(){ this.noise(.02, {vol:.06, freq:3000}) },
  ding(){ this.tone(1046.5, .35, {type:'triangle', vol:.08}); this.tone(1568, .5, {type:'triangle', vol:.07, at:.12, verb:true}) },
  power(){ this.noise(.12, {vol:.25, freq:180, type:'lowpass'}); this.tone(7800, 1.1, {vol:.006, attack:.2}) },
  chime(){ [311.1, 466.2, 622.3, 784, 932.3].forEach((f,i)=>{ this.tone(f, 2.6, {type:'triangle', vol:.06, at:i*.13, attack:.25, verb:true}); this.tone(f/2, 2.8, {vol:.035, at:i*.13, attack:.4}) }) },
  humStart(){
    if (!this.on || !this.ensure() || this.hum) return;
    const o = this.ctx.createOscillator(), o2 = this.ctx.createOscillator(), g = this.ctx.createGain(), f = this.ctx.createBiquadFilter();
    o.frequency.value = 60; o2.type = 'sawtooth'; o2.frequency.value = 120; f.type = 'lowpass'; f.frequency.value = 260;
    g.gain.value = 0; g.gain.linearRampToValueAtTime(.03, this.ctx.currentTime + .8);
    o.connect(g); o2.connect(f); f.connect(g); g.connect(this.out); o.start(); o2.start(); this.hum = {o, o2, g};
  },
  humStop(){ if (!this.hum) return; const {o,o2,g} = this.hum; const t = this.ctx.currentTime; g.gain.cancelScheduledValues(t); g.gain.setValueAtTime(g.gain.value, t); g.gain.linearRampToValueAtTime(0, t + .6); o.stop(t + .7); o2.stop(t + .7); this.hum = null },
  set(v){ this.on = v; store.set('msga_sound', v ? 'on' : 'off'); if (v){ this.ensure(); this.ding(); if (introStage === 'boot') this.humStart() } else this.humStop(); paintSound() }
};
const ICON_SOUND_ON = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2 6h3l4-3v10l-4-3H2z" fill="currentColor"/><path d="M11 5c1.5 1.5 1.5 4.5 0 6M13 3c2.6 2.6 2.6 7.4 0 10" stroke="currentColor" stroke-width="1.4" fill="none"/></svg>';
const ICON_SOUND_OFF = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2 6h3l4-3v10l-4-3H2z" fill="currentColor"/><path d="M11 6l4 4M15 6l-4 4" stroke="currentColor" stroke-width="1.4"/></svg>';
function paintSound(){
  $('#introSound').innerHTML = (Snd.on ? ICON_SOUND_ON : ICON_SOUND_OFF) + (Snd.on ? 'Sound on' : 'Sound off');
  $('#introSound').setAttribute('aria-pressed', String(Snd.on));
  $('#traySound').innerHTML = Snd.on ? ICON_SOUND_ON : ICON_SOUND_OFF;
  $('#traySound').setAttribute('aria-pressed', String(Snd.on));
  $('#traySound').setAttribute('aria-label', Snd.on ? 'Turn sound off' : 'Turn sound on');
  $('#smSoundLabel').textContent = 'Sound: ' + (Snd.on ? 'on' : 'off');
}
$('#introSound').addEventListener('click', () => Snd.set(!Snd.on));
$('#traySound').addEventListener('click', () => Snd.set(!Snd.on));
$('#smSound').addEventListener('click', () => Snd.set(!Snd.on));
paintSound();

/* ================= INTRO ================= */
let introStage = 'off', ff = false, ffWaiters = [], introRun = 0;
const sleep = ms => new Promise(r => { if (ff) return r(); const t = setTimeout(r, ms); ffWaiters.push(() => { clearTimeout(t); r() }) });
function fastForward(){ ff = true; ffWaiters.splice(0).forEach(f => f()) }
const screenEl = $('#screen');

function resetIntro(){
  ff = false; ffWaiters = [];
  const intro = $('#intro'); intro.classList.remove('gone','zoom'); intro.hidden = false;
  $('#scene').style.transition = 'none'; $('#scene').style.transform = '';
  void $('#scene').offsetWidth; $('#scene').style.transition = '';
  screenEl.className = 'screen';
  $('#bootLayer').hidden = true; $('#enterLayer').hidden = true; $('#xpStrip').hidden = true; $('#bootLines').textContent = '';
  ['#monLed','#towerLed','#hddLed'].forEach(s => $(s).className = 'led');
  document.documentElement.classList.add('locked');
}

async function runIntro(){
  const run = ++introRun;
  resetIntro();
  introStage = 'off';
  if (RM){ $('#monLed').classList.add('green'); $('#towerLed').classList.add('green'); screenEl.classList.add('on'); showReady(); return }
  await sleep(700); if (run !== introRun) return;
  // Stage 1: power on
  introStage = 'power';
  $('#towerLed').classList.add('green'); $('#monLed').classList.add('amber'); Snd.power();
  await sleep(450); if (run !== introRun) return;
  screenEl.classList.add('power');
  await sleep(520); if (run !== introRun) return;
  screenEl.classList.add('on'); $('#monLed').className = 'led green';
  $('#bootLayer').hidden = false;
  // Stage 2: boot
  introStage = 'boot'; Snd.humStart();
  const lines = ['BOOTING STONK OS...', 'CONNECTING TO THE TRENCHES...', 'RESTORING THE CULTURE...'];
  for (const L of lines){ await bootLine(L, true); if (run !== introRun) return }
  await bootLine('MAKE STONK GREAT AGAIN.', false, true); if (run !== introRun) return;
  $('#xpStrip').hidden = false;
  await sleep(1500); if (run !== introRun) return;
  showReady();
}
async function bootLine(text, withBar, final){
  const row = el('div', {class:'bl' + (final ? ' final' : '')});
  const t = el('span', {class:'t'}); const caret = el('span', {class:'caret'});
  row.append(t, caret); $('#bootLines').append(row);
  for (let i=1;i<=text.length;i++){ t.textContent = text.slice(0,i); if (!ff) await sleep(final ? 45 : 22) }
  caret.remove();
  if (withBar){
    const bar = el('span', {class:'bar'}); const cells = Array.from({length:16}, () => el('i')); bar.append(...cells); row.append(bar);
    for (const c of cells){ c.className = 'f'; if (!ff){ $('#hddLed').classList.toggle('amber'); Snd.tick(); await sleep(38 + Math.random()*40) } }
    $('#hddLed').className = 'led';
    row.append(el('span', {class:'ok', text:'[ OK ]'}));
    await sleep(160);
  } else await sleep(380);
}
function showReady(){
  introStage = 'ready';
  $('#bootLayer').hidden = true; $('#enterLayer').hidden = false;
  Snd.humStop();
  if (!$('#bootLines').childElementCount) { /* skipped boot */ }
  setTimeout(() => { if (introStage === 'ready') $('#enterBtn').focus({preventScroll:true}) }, 60);
}
function skipToReady(){
  if (introStage === 'off' || introStage === 'power' || introStage === 'boot'){
    introRun++; fastForward();
    $('#monLed').className = 'led green'; $('#towerLed').className = 'led green';
    screenEl.classList.add('on'); showReady();
  }
}
async function doEnter(){
  if (introStage !== 'ready') return;
  introStage = 'zoom';
  Snd.chime();
  screenEl.classList.add('glow');
  if (RM){ finishIntro(false); return }
  await new Promise(r => setTimeout(r, 300));
  const scene = $('#scene'), sr = scene.getBoundingClientRect(), r = screenEl.getBoundingClientRect();
  const vw = innerWidth, vh = innerHeight;
  const s = Math.max(vw / r.width, vh / r.height) * 1.08;
  const cx = r.left + r.width/2 - sr.left, cy = r.top + r.height/2 - sr.top;
  const tx = vw/2 - sr.left - s*cx, ty = vh/2 - sr.top - s*cy;
  scene.style.transform = `translate(${tx}px, ${ty}px) scale(${s})`;
  $('#intro').classList.add('zoom');
  await new Promise(r => setTimeout(r, 1250));
  const w = $('#welcome'); w.classList.remove('out'); w.classList.add('show');
  await new Promise(r => setTimeout(r, 380));
  finishIntro(true);
  await new Promise(r => setTimeout(r, 950));
  w.classList.add('out'); w.classList.remove('show');
  setTimeout(() => w.classList.remove('out'), 800);
}
function finishIntro(withWelcome){
  introStage = 'done';
  store.set('msga_seen', '1');
  const intro = $('#intro'); intro.classList.add('gone');
  setTimeout(() => { intro.hidden = true }, 520);
  document.documentElement.classList.remove('locked');
  window.scrollTo(0, 0);
  revealSite(withWelcome ? 900 : 200);
}
let revealed = false;
function revealSite(delay){
  setTimeout(() => {
    const site = $('#site'); site.classList.remove('reveal'); void site.offsetWidth; site.classList.add('reveal');
    $('#taskbar').classList.remove('pre');
    if (!revealed){
      revealed = true;
      setTimeout(() => balloon('NEW MOVEMENT DETECTED', 'Make Stonk Great Again is online. Click to see why the trenches need change.', () => go('movement')), 2600);
      scheduleNotes();
      if (matchMedia('(min-width: 900px)').matches && store.get('msga_chat') !== 'closed') setTimeout(() => openChat(false), 1800);
    }
  }, delay);
}
$('#enterBtn').addEventListener('click', e => { e.stopPropagation(); doEnter() });
screenEl.addEventListener('click', () => { if (introStage === 'ready') doEnter(); else skipToReady() });
$('#skipIntro').addEventListener('click', () => { introRun++; fastForward(); Snd.humStop(); finishIntro(false) });
document.addEventListener('keydown', e => {
  if ($('#intro').hidden) return;
  if (e.key === 'Enter'){
    if (e.target && e.target.closest && e.target.closest('.intro-ui')) return;
    e.preventDefault();
    if (introStage === 'ready') doEnter(); else skipToReady();
  } else if (e.key === 'Escape'){ $('#skipIntro').click() }
});
if (store.get('msga_seen')) $('#skipIntro').firstChild.textContent = 'Welcome back — skip intro ';
runIntro();

/* ================= NAV / TASKBAR ================= */
function go(id){
  closeStart();
  if (id === 'chat'){ toggleChat(); return }
  const t = document.getElementById(id); if (!t) return;
  if (t.hidden){ restoreWin(t) }
  t.classList.remove('collapsed');
  t.scrollIntoView({behavior: RM ? 'auto' : 'smooth', block: id === 'home' ? 'start' : 'start'});
}
document.addEventListener('click', e => {
  const g = e.target.closest('[data-go]'); if (g){ Snd.click(); go(g.dataset.go) }
  const a = e.target.closest('[data-action="support"]'); if (a){ Snd.click(); openSupport() }
});
$$('[data-link]').forEach(a => {
  const url = CONFIG.links[a.dataset.link];
  if (url){ a.href = url; a.target = '_blank'; a.rel = 'noopener noreferrer' }
  else a.addEventListener('click', e => { e.preventDefault(); closeStart(); balloon('COMING SOON', `The ${LINK_NAMES[a.dataset.link]} link will appear here once it's announced.`) });
});
const startBtn = $('#startBtn'), startMenu = $('#startMenu');
function closeStart(){ startMenu.hidden = true; startBtn.setAttribute('aria-expanded','false') }
startBtn.addEventListener('click', e => { e.stopPropagation(); Snd.click(); const open = startMenu.hidden; startMenu.hidden = !open; startBtn.setAttribute('aria-expanded', String(open)); if (open) $('.sm-item', startMenu).focus() });
document.addEventListener('click', e => { if (!startMenu.hidden && !e.target.closest('#startMenu') && !e.target.closest('#startBtn')) closeStart() });
document.addEventListener('keydown', e => { if (e.key === 'Escape'){ closeStart(); closeModals() } });
$('#restartBtn').addEventListener('click', () => { closeStart(); closeChat(true); $('#taskbar').classList.add('pre'); runIntro() });

function tickClock(){ const d = new Date(); const c = $('#clock'); c.textContent = d.toLocaleTimeString([], {hour:'numeric', minute:'2-digit'}); c.dateTime = d.toISOString(); c.title = d.toLocaleDateString([], {weekday:'long', year:'numeric', month:'long', day:'numeric'}) }
tickClock(); setInterval(tickClock, 10000);

/* window controls */
function restoreWin(w){ w.hidden = false; const chip = $(`[data-restore="${w.id}"]`); if (chip) chip.remove() }
$$('.desk .win').forEach(w => {
  w.addEventListener('click', e => {
    const b = e.target.closest('[data-act]'); if (!b || !w.contains(b)) return; Snd.click();
    if (b.dataset.act === 'min') w.classList.toggle('collapsed');
    if (b.dataset.act === 'max'){ w.classList.toggle('maxed'); w.scrollIntoView({behavior: RM ? 'auto' : 'smooth', block:'start'}) }
    if (b.dataset.act === 'close'){
      w.hidden = true;
      $('#restoreRow').append(el('button', {class:'btn-xp', type:'button', 'data-restore': w.id, text:'Reopen ' + w.dataset.title, onclick: () => restoreWin(w)}));
    }
  });
});
/* tabs */
$$('.tab').forEach(t => t.addEventListener('click', () => {
  $$('.tab').forEach(x => { x.setAttribute('aria-selected', String(x === t)); document.getElementById(x.getAttribute('aria-controls')).hidden = x !== t });
  Snd.click();
}));

/* marquee */
(function(){
  const bits = ['LESS RUGS', 'LESS FAKE HYPE', 'MORE STONK', 'MAKE THE TRENCHES GREAT AGAIN', 'OLD INTERNET. NEW MOVEMENT.'];
  const make = () => bits.map(b => `<span>${b}</span><span><b>&#9733;</b></span>`).join('');
  $('#marqueeTrack').innerHTML = make() + make();
})();

/* click ripple */
addEventListener('pointerdown', e => {
  if (RM || e.pointerType !== 'mouse') return;
  const r = el('i', {class:'ripple'}); r.style.left = e.clientX + 'px'; r.style.top = e.clientY + 'px';
  document.body.append(r); setTimeout(() => r.remove(), 500);
}, {passive:true});

/* ================= BALLOON NOTIFICATIONS ================= */
let balloonTimer = 0;
function balloon(title, text, onClick){
  const host = $('#balloonHost'); host.textContent = ''; clearTimeout(balloonTimer);
  const b = el('div', {class:'balloon', role:'status'});
  const h = el('b'); h.innerHTML = '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="7" fill="#1769E8"/><rect x="7" y="7" width="2" height="5" fill="#fff"/><rect x="7" y="4" width="2" height="2" fill="#fff"/></svg>';
  h.append(document.createTextNode(title));
  const x = el('button', {class:'x', type:'button', 'aria-label':'Dismiss', text:'✕'});
  x.addEventListener('click', e => { e.stopPropagation(); b.remove() });
  b.append(h, el('div', {text}), x);
  if (onClick){ b.style.cursor = 'pointer'; b.addEventListener('click', () => { b.remove(); onClick() }) }
  host.append(b); Snd.ding();
  balloonTimer = setTimeout(() => b.remove(), 7000);
}
function scheduleNotes(){
  const msgs = [['THE TRENCHES ARE EVOLVING.', 'New voices in the guestbook. Add yours.', () => go('guestbook')], ['THE TRENCHES ARE CALLING.', 'Pull up a chair in Trench Chat.', () => openChat(true)], ['OLD INTERNET. NEW MOVEMENT.', 'Make a PFP and wear the cap.', () => go('pfp')], ['RESTORING THE CULTURE...', 'Sign once to be counted in the Movement Monitor.', () => go('growing')]];
  let i = 0;
  const next = () => { if (i >= msgs.length) return; setTimeout(() => { if (!document.hidden && $('#supportModal').hidden) { const m = msgs[i++]; balloon(m[0], m[1], m[2]) } next() }, 80000 + Math.random()*40000) };
  next();
}

/* footer contract */
(function(){
  const box = $('#caBox');
  if (!CONFIG.contract){ box.append(el('span', {text:'CA: not announced yet'})); return }
  const code = el('code', {text: CONFIG.contract});
  const b = el('button', {class:'btn-xp', type:'button', text:'Copy CA'});
  b.addEventListener('click', async () => { try{ await navigator.clipboard.writeText(CONFIG.contract); b.textContent = 'Copied' }catch(e){ const r = document.createRange(); r.selectNodeContents(code); const s = getSelection(); s.removeAllRanges(); s.addRange(r); b.textContent = 'Selected — copy it' } setTimeout(() => b.textContent = 'Copy CA', 2000) });
  box.append(el('span', {text:'CA'}), code, b);
})();

/* ================= PFP STUDIO ================= */
const PFP = (function(){
  const N = 800, cv = $('#pfpCanvas'), ctx = cv.getContext('2d');
  const PARTS = [
    {key:'cap',  lab:1, name:'Cap',            presets:['#C8202E','#111418','#F2F2F2','#E8B923','#2E7D32','#6A2C91','#F06292','#FF7A1A']},
    {key:'text', lab:2, name:'Cap lettering',  presets:['#FFFFFF','#FFD24A','#111418','#FF4D4D','#7FFFF6','#FF9BD2','#65D623','#C0C0C0']},
    {key:'suit', lab:3, name:'Suit',           presets:['#17181C','#5E6168','#E8E4DA','#6B1E2B','#1F4D2E','#2A62D6','#4B2A6E','#A86F2E']},
    {key:'tie',  lab:4, name:'Tie & pocket square', presets:['#D71E28','#E8B923','#2E7D32','#111418','#FF6FB5','#FF7A1A','#4BE8EC','#8E44AD']},
    {key:'vest', lab:5, name:'Vest',           presets:['#1A1A1A','#7A7F87','#F7C6D9','#B8E6C9','#B3202E','#FFE08A','#9EC9FF','#D9A066']}
  ];
  const ORIG = {cap:'#0E5866', text:'#59D6E6', suit:'#151C3A', tie:'#1F49E0', vest:'#E6D5BC'};
  const BGS = [
    {key:'bliss', name:'Bliss (original)'}, {key:'xp', name:'XP Blue'}, {key:'night', name:'Trench Night'},
    {key:'sunset', name:'Sunset'}, {key:'turq', name:'Turquoise'}, {key:'solid', name:'Solid color'}
  ];
  const FX = [{key:'scan', name:'CRT scanlines'}, {key:'pixel', name:'8-bit pixels'}, {key:'glow', name:'Turquoise glow'}, {key:'sparkle', name:'Sparkles'}, {key:'vignette', name:'Vignette'}];
  const st = {cap:null, text:null, suit:null, tie:null, vest:null, bg:'bliss', solid:'#1769E8', fx:{}};
  let base, lab, alpha, L, ref = [], charCv, charCtx, charData, ready = false, raf = 0;

  // build UI
  const groups = $('#pfpGroups');
  PARTS.forEach(p => {
    const sw = el('div', {class:'sw'});
    const orig = el('button', {type:'button', class:'swb orig', 'aria-label': p.name + ': original', 'data-part': p.key, 'data-color':'', title:'Original'}); orig.style.background = ORIG[p.key];
    sw.append(orig);
    p.presets.forEach(c => { const b = el('button', {type:'button', class:'swb', 'aria-label': `${p.name}: ${c}`, 'data-part': p.key, 'data-color': c}); b.style.background = c; sw.append(b) });
    const pick = el('input', {type:'color', class:'colorpick', id:'pick-' + p.key, 'aria-label': p.name + ': custom color', value: ORIG[p.key]});
    pick.addEventListener('input', () => { st[p.key] = pick.value; paintUI(); render() });
    sw.append(pick);
    groups.append(el('fieldset', {class:'gb'}, [el('legend', {text: p.name}), sw]));
  });
  groups.addEventListener('click', e => { const b = e.target.closest('.swb'); if (!b) return; st[b.dataset.part] = b.dataset.color || null; Snd.click(); paintUI(); render() });
  const bgBox = $('#bgOpts');
  BGS.forEach(b => bgBox.append(el('button', {type:'button', class:'bgopt', 'data-bg': b.key, text: b.name})));
  const solidPick = el('input', {type:'color', class:'colorpick', id:'pick-bg', 'aria-label':'Background solid color', value: st.solid});
  solidPick.addEventListener('input', () => { st.solid = solidPick.value; st.bg = 'solid'; paintUI(); render() });
  bgBox.append(solidPick);
  bgBox.addEventListener('click', e => { const b = e.target.closest('.bgopt'); if (!b) return; st.bg = b.dataset.bg; Snd.click(); paintUI(); render() });
  const fxBox = $('#fxOpts');
  FX.forEach(f => { const c = el('input', {type:'checkbox', id:'fx-' + f.key}); c.addEventListener('change', () => { st.fx[f.key] = c.checked; render() }); fxBox.append(el('label', {for:'fx-' + f.key}, [c, f.name])) });
  function paintUI(){
    $$('.swb', groups).forEach(b => b.setAttribute('aria-pressed', String((st[b.dataset.part] || '') === (b.dataset.color || ''))));
    PARTS.forEach(p => { $('#pick-' + p.key).value = st[p.key] || ORIG[p.key] });
    $$('.bgopt', bgBox).forEach(b => b.setAttribute('aria-pressed', String(b.dataset.bg === st.bg)));
    solidPick.value = st.solid;
    FX.forEach(f => { $('#fx-' + f.key).checked = !!st.fx[f.key] });
  }
  paintUI();

  function loadImg(src){ return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src }) }
  let started = false;
  const start = async () => {
    if (started) return; started = true;
    try{
      const [b, m] = await Promise.all([loadImg('assets/pfp_base.jpg'), loadImg('assets/pfp_lab.png')]);
      base = b;
      const t = document.createElement('canvas'); t.width = t.height = N; const tc = t.getContext('2d', {willReadFrequently:true});
      tc.drawImage(b, 0, 0, N, N); const bd = tc.getImageData(0, 0, N, N).data;
      tc.clearRect(0,0,N,N); tc.drawImage(m, 0, 0, N, N); const md = tc.getImageData(0, 0, N, N).data;
      lab = new Uint8Array(N*N); alpha = new Uint8Array(N*N); L = new Float32Array(N*N);
      const hist = Array.from({length:6}, () => new Uint32Array(256));
      charCv = document.createElement('canvas'); charCv.width = charCv.height = N; charCtx = charCv.getContext('2d');
      charData = charCtx.createImageData(N, N);
      const cd = charData.data;
      for (let i=0, j=0; i<N*N; i++, j+=4){
        const k = Math.round(md[j] / 40); lab[i] = k > 5 ? 0 : k; alpha[i] = md[j+1];
        const l = .299*bd[j] + .587*bd[j+1] + .114*bd[j+2]; L[i] = l;
        if (lab[i]) hist[lab[i]][Math.min(255, l|0)]++;
        cd[j] = bd[j]; cd[j+1] = bd[j+1]; cd[j+2] = bd[j+2]; cd[j+3] = alpha[i];
      }
      for (let k=1;k<=5;k++){ const h = hist[k]; let tot = 0; for (const v of h) tot += v; let acc = 0, r = 1; for (let v=0; v<256; v++){ acc += h[v]; if (acc >= tot*.6){ r = v || 1; break } } ref[k] = r }
      ready = true; $('#pfpLoading').hidden = true; render();
    }catch(e){ started = false; $('#pfpLoading').textContent = 'Could not load the character layers. Scroll away and back to retry.' }
  };
  // Lazy-load the layers when the studio gets close to the viewport
  if ('IntersectionObserver' in window){
    const io = new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)){ start(); if (ready) io.disconnect() } }, {rootMargin: '900px 0px'});
    io.observe($('#pfp'));
  } else start();

  const hex = h => { const n = parseInt(h.slice(1), 16); return [(n>>16)&255, (n>>8)&255, n&255] };
  function render(){ if (!ready) return; if (raf) return; raf = requestAnimationFrame(() => { raf = 0; draw() }) }
  function draw(){
    const cd = charData.data, bd = null;
    const tg = [null]; PARTS.forEach(p => tg[p.lab] = st[p.key] ? hex(st[p.key]) : null);
    const src = draw.src || (draw.src = (() => { const t = document.createElement('canvas'); t.width = t.height = N; const c = t.getContext('2d', {willReadFrequently:true}); c.drawImage(base, 0, 0, N, N); return c.getImageData(0,0,N,N).data })());
    for (let i=0, j=0; i<N*N; i++, j+=4){
      const k = lab[i]; const t = k ? tg[k] : null;
      if (!t){ cd[j] = src[j]; cd[j+1] = src[j+1]; cd[j+2] = src[j+2]; continue }
      const f = L[i] / ref[k];
      if (f <= 1){ cd[j] = t[0]*f; cd[j+1] = t[1]*f; cd[j+2] = t[2]*f }
      else { const w = Math.min(1, (f-1)*.6); cd[j] = t[0] + (255-t[0])*w; cd[j+1] = t[1] + (255-t[1])*w; cd[j+2] = t[2] + (255-t[2])*w }
    }
    charCtx.putImageData(charData, 0, 0);
    compose(ctx, N);
  }
  function seeded(seed){ let s = seed; return () => (s = (s*16807) % 2147483647) / 2147483647 }
  function compose(c, n){
    c.save(); c.clearRect(0,0,n,n);
    const k = n / N;
    // background
    if (st.bg === 'bliss') c.drawImage(base, 0, 0, n, n);
    else {
      let g;
      if (st.bg === 'xp'){ g = c.createLinearGradient(0,0,0,n); g.addColorStop(0,'#52B8FF'); g.addColorStop(.65,'#1769E8'); g.addColorStop(1,'#0B3FB8') }
      else if (st.bg === 'night'){ g = c.createLinearGradient(0,0,0,n); g.addColorStop(0,'#05081A'); g.addColorStop(.6,'#101A47'); g.addColorStop(1,'#005C70') }
      else if (st.bg === 'sunset'){ g = c.createLinearGradient(0,0,0,n); g.addColorStop(0,'#FF9A5A'); g.addColorStop(.55,'#FF5E7E'); g.addColorStop(1,'#6A2C91') }
      else if (st.bg === 'turq'){ g = c.createRadialGradient(n*.5,n*.4,n*.05,n*.5,n*.5,n*.75); g.addColorStop(0,'#AFFFF9'); g.addColorStop(.5,'#2BC7D3'); g.addColorStop(1,'#005C70') }
      else g = st.solid;
      c.fillStyle = g; c.fillRect(0,0,n,n);
      if (st.bg === 'night'){ const r = seeded(7); c.fillStyle = '#fff'; for (let i=0;i<70;i++){ const s = r()*2.4*k + .6*k; c.globalAlpha = .4 + r()*.6; c.fillRect(r()*n, r()*n*.7, s, s) } c.globalAlpha = 1 }
      if (st.bg === 'xp'){ c.globalAlpha = .18; c.fillStyle = '#fff'; for (let i=0;i<6;i++){ c.beginPath(); c.moveTo(n*.1, -10); c.lineTo(n*(.1 + i*.18), n); c.lineTo(n*(.16 + i*.18), n); c.closePath(); c.fill() } c.globalAlpha = 1 }
    }
    // glow
    if (st.fx.glow){ c.save(); c.shadowColor = '#7FFFF6'; c.shadowBlur = 46*k; c.drawImage(charCv, 0, 0, n, n); c.shadowBlur = 22*k; c.drawImage(charCv, 0, 0, n, n); c.restore() }
    c.drawImage(charCv, 0, 0, n, n);
    // effects
    if (st.fx.pixel){
      const px = 96, t = document.createElement('canvas'); t.width = t.height = px; const tc = t.getContext('2d');
      tc.drawImage(c.canvas, 0, 0, px, px); c.imageSmoothingEnabled = false; c.clearRect(0,0,n,n); c.drawImage(t, 0, 0, n, n); c.imageSmoothingEnabled = true;
    }
    if (st.fx.sparkle){
      const r = seeded(42); c.fillStyle = '#fff';
      for (let i=0;i<14;i++){ const x = r()*n, y = r()*n*.55, s = (6 + r()*14)*k; c.globalAlpha = .65 + r()*.35; c.beginPath(); c.moveTo(x, y-s); c.quadraticCurveTo(x, y, x+s, y); c.quadraticCurveTo(x, y, x, y+s); c.quadraticCurveTo(x, y, x-s, y); c.quadraticCurveTo(x, y, x, y-s); c.fill() }
      c.globalAlpha = 1;
    }
    if (st.fx.vignette){ const g = c.createRadialGradient(n/2, n/2, n*.32, n/2, n/2, n*.75); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(5,10,30,.6)'); c.fillStyle = g; c.fillRect(0,0,n,n) }
    if (st.fx.scan){ c.fillStyle = 'rgba(0,0,0,.16)'; const step = Math.max(2, 4*k); for (let y=0; y<n; y+=step) c.fillRect(0, y, n, step/2); c.fillStyle = 'rgba(127,255,246,.05)'; c.fillRect(0,0,n,n) }
    c.restore();
  }
  function pick(a){ return a[Math.floor(Math.random()*a.length)] }
  $('#pfpRandom').addEventListener('click', () => {
    PARTS.forEach(p => { st[p.key] = Math.random() < .15 ? null : (Math.random() < .2 ? '#' + Math.floor(Math.random()*0xffffff).toString(16).padStart(6,'0') : pick(p.presets)) });
    st.bg = pick(BGS).key; if (st.bg === 'solid') st.solid = pick(['#1769E8','#65D623','#F5EBDD','#101A47','#FFD24A','#FF6FB5']);
    FX.forEach(f => st.fx[f.key] = Math.random() < .28);
    Snd.click(); paintUI(); render();
  });
  $('#pfpReset').addEventListener('click', () => { PARTS.forEach(p => st[p.key] = null); st.bg = 'bliss'; st.fx = {}; Snd.click(); paintUI(); render() });
  $('#pfpDownload').addEventListener('click', async () => {
    if (!ready) return;
    draw();
    const out = document.createElement('canvas'); out.width = out.height = 400; const oc = out.getContext('2d');
    oc.imageSmoothingEnabled = true; oc.imageSmoothingQuality = 'high'; oc.drawImage(cv, 0, 0, 400, 400);
    const blob = await new Promise(r => out.toBlob(r, 'image/png'));
    const btn = $('#pfpDownload');
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'make-stonk-great-again-pfp.png';
    document.body.append(a); a.click(); a.remove();
    btn.textContent = 'SAVED \u2713'; setTimeout(() => btn.textContent = 'DOWNLOAD PFP', 1800);
    // iOS in-app browsers ignore downloads: also show the image so it can be long-pressed
    if (/iPhone|iPad|FBAN|FBAV|Instagram|Twitter/i.test(navigator.userAgent)){ $('#pfpOut').src = url; $('#pfpModal').hidden = false }
  });
  return {render};
})();
