/* ==================================================================
   MOTION — logo slots, dock, scroll reveals, parallax, magnetic hover.
   Only transform + opacity are animated (Web Animations API, spring
   easing generated below). Everything renders complete without JS;
   reveals only arm for elements that start below the fold.
   ================================================================== */

/* ---------- official logo slots ---------- */
const LOGO_ABBR = {dexscreener:'DEX', x:'X', stonk:'STONK', pumpfun:'PUMP'};
$$('.logo-slot').forEach(s => {
  const key = s.dataset.logo, src = CONFIG.logos && CONFIG.logos[key];
  s.textContent = '';
  if (src){ s.classList.add('has-logo'); s.append(el('img', {src, alt:'', loading:'lazy', decoding:'async'})) }
  else { s.classList.add('placeholder'); s.title = 'Official logo goes here (set CONFIG.logos.' + key + ' in js/config.js)'; s.append(el('b', {text: LOGO_ABBR[key] || key}), el('small', {text:'LOGO'})) }
});

/* ---------- spring easing ---------- */
function springEasing(zeta = .74, omega = 13, steps = 40){
  const pts = [];
  const wd = omega * Math.sqrt(1 - zeta*zeta);
  for (let i = 0; i <= steps; i++){
    const t = i / steps * 0.9;
    const x = 1 - Math.exp(-zeta*omega*t) * (Math.cos(wd*t) + (zeta*omega/wd) * Math.sin(wd*t));
    pts.push(+x.toFixed(4));
  }
  pts[pts.length - 1] = 1;
  return `linear(${pts.join(', ')})`;
}
const SUPPORTS_LINEAR = window.CSS && CSS.supports && CSS.supports('animation-timing-function', 'linear(0, 1)');
const SPRING = SUPPORTS_LINEAR ? springEasing() : 'cubic-bezier(.2,.9,.25,1.05)';
const SPRING_SOFT = SUPPORTS_LINEAR ? springEasing(.9, 10) : 'cubic-bezier(.2,.8,.2,1)';
const EASE = 'cubic-bezier(.2,.8,.2,1)';

/* ---------- dock: large on the hero, compact sticky toolbar after ---------- */
const dock = $('#dock');
let dockCompact = null;
function paintDock(){
  const compact = scrollY > Math.min(innerHeight * .35, 260);
  if (compact !== dockCompact){ dockCompact = compact; dock.classList.toggle('compact', compact) }
}

/* ---------- headline word-by-word reveal ---------- */
function splitWords(node){
  if (node.dataset.split) return; node.dataset.split = '1';
  const walk = n => {
    for (const c of [...n.childNodes]){
      if (c.nodeType === 3){
        const frag = document.createDocumentFragment();
        c.textContent.split(/(\s+)/).forEach(part => {
          if (!part) return;
          if (/^\s+$/.test(part)){ frag.append(part); return }
          const w = el('span', {class:'w'}, el('span', {class:'wi', text: part}));
          frag.append(w);
        });
        c.replaceWith(frag);
      } else if (c.nodeType === 1 && c.tagName !== 'BR') walk(c);
    }
  };
  walk(node);
}

/* ---------- scroll reveals (varied per element) ---------- */
const REVEALS = {
  left:  {from: {opacity: 0, transform: 'translate3d(-70px, 30px, 0) rotate(-1.2deg) scale(.96)'}, dur: 1000, ease: () => SPRING},
  right: {from: {opacity: 0, transform: 'translate3d(70px, 30px, 0) rotate(1.2deg) scale(.96)'}, dur: 1000, ease: () => SPRING},
  pop:   {from: {opacity: 0, transform: 'translate3d(0, 40px, 0) scale(.86)'}, dur: 900, ease: () => SPRING},
  drop:  {from: {opacity: 0, transform: 'translate3d(0, -36px, 0) scale(.97)'}, dur: 900, ease: () => SPRING_SOFT},
  rise:  {from: {opacity: 0, transform: 'translate3d(0, 60px, 0)'}, dur: 1000, ease: () => EASE},
  fade:  {from: {opacity: 0, transform: 'translate3d(0, 18px, 0)'}, dur: 800, ease: () => EASE},
  zoom:  {from: {opacity: 0, transform: 'scale(.92)'}, dur: 1100, ease: () => SPRING_SOFT}
};
function armReveals(){
  if (RM || !('IntersectionObserver' in window) || !Element.prototype.animate) return;
  const vh = innerHeight;
  const io = new IntersectionObserver(entries => {
    for (const e of entries){
      if (!e.isIntersecting) continue;
      io.unobserve(e.target); play(e.target);
    }
  }, {rootMargin: '0px 0px -12% 0px', threshold: .08});
  $$('[data-reveal]').forEach(node => {
    if (node.getBoundingClientRect().top < vh * .95) return;     // visible at load: leave as is
    const r = REVEALS[node.dataset.reveal] || REVEALS.fade;
    Object.assign(node.style, {opacity: '0', transform: r.from.transform});
    node.dataset.armed = '1';
    io.observe(node);
  });
  $$('[data-words]').forEach(h => {
    if (h.getBoundingClientRect().top < vh * .95) return;
    splitWords(h);
    $$('.wi', h).forEach(w => w.style.transform = 'translate3d(0, 110%, 0)');
    h.dataset.armed = '1';
    io.observe(h);
  });
  function play(node){
    const delay = Number(node.dataset.delay || 0);
    if (node.dataset.words !== undefined && node.querySelector('.wi')){
      $$('.wi', node).forEach((w, i) => {
        const a = w.animate([{transform: 'translate3d(0, 110%, 0)'}, {transform: 'translate3d(0, 0, 0)'}], {duration: 850, delay: delay + 120 + i * 55, easing: SPRING, fill: 'both'});
        a.onfinish = () => { w.style.transform = ''; a.cancel() };
      });
      return;
    }
    const r = REVEALS[node.dataset.reveal] || REVEALS.fade;
    const a = node.animate([r.from, {opacity: 1, transform: 'none'}], {duration: r.dur, delay, easing: r.ease(), fill: 'both'});
    a.onfinish = () => { node.style.opacity = ''; node.style.transform = ''; a.cancel() };
    // window "opening" flash on Luna title bars
    const tb = node.querySelector(':scope > .win-title');
    if (tb) tb.animate([{filter: 'brightness(1.6)'}, {filter: 'brightness(1)'}], {duration: 700, delay: delay + 120, easing: EASE});
  }
}

/* ---------- parallax: hero layers, dusk, deco windows, clouds ---------- */
const heroEls = {
  bg: $('#heroBg'), hills: $('#heroHills'), clouds: $('#heroClouds'), char: $('#heroChar'),
  shadow: $('#charShadow'), copy: $('.hero-copy'), stickers: $$('.sticker')
};
const dusk = $('#dusk'), decos = $$('[data-speed]');
const fine = matchMedia('(pointer: fine)').matches;
const mobileLike = matchMedia('(max-width: 760px), (max-aspect-ratio: 4/5)').matches;
let mx = 0, my = 0, tx = 0, ty = 0, raf = 0, lastY = -1;
function frame(){
  raf = 0;
  mx += (tx - mx) * .08; my += (ty - my) * .08;
  const y = scrollY, vh = innerHeight;
  const k = mobileLike ? .45 : 1;                        // gentler on phones
  if (y < vh * 1.3){
    const p = y * k;
    heroEls.bg.style.transform = `translate3d(${-mx*14}px, ${p*.42 - my*8}px, 0) scale(1.04)`;
    if (heroEls.hills) heroEls.hills.style.transform = `translate3d(${-mx*22}px, ${p*.2 - my*4}px, 0) scale(1.04)`;
    heroEls.clouds.style.transform = `translate3d(${-mx*30}px, ${p*.55 - my*10}px, 0)`;
    if (!mobileLike){
      heroEls.char.style.transform = `translate3d(${mx*10}px, ${p*.08 + my*4}px, 0)`;
      if (heroEls.shadow) heroEls.shadow.style.transform = `translate3d(${-mx*26}px, ${p*.08}px, 0) scaleX(${1 + Math.abs(mx)*.15})`;
      heroEls.copy.style.transform = `translate3d(0, ${p*-.12}px, 0)`;
      heroEls.copy.style.opacity = String(Math.max(0, 1 - y / (vh * .75)));
      heroEls.stickers.forEach(s => { const d = Number(s.dataset.depth); s.style.transform = `translate3d(${mx*d}px, ${my*d*.5 - p*d*.02}px, 0)` });
    }
  }
  if (y !== lastY){
    lastY = y;
    const doc = document.documentElement.scrollHeight - vh;
    const t = Math.max(0, Math.min(1, (y - vh * .5) / Math.max(1, doc - vh * .5)));
    dusk.style.opacity = (t * .62).toFixed(3);
    if (!mobileLike) decos.forEach(d => { d.style.transform = `translate3d(0, ${-(y * Number(d.dataset.speed))}px, 0)` });
    paintDock();
  }
  if (Math.abs(tx - mx) + Math.abs(ty - my) > .001) raf = requestAnimationFrame(frame);
}
const kick = () => { if (!raf) raf = requestAnimationFrame(frame) };
if (!RM){
  addEventListener('scroll', kick, {passive: true});
  addEventListener('resize', kick, {passive: true});
  if (fine) addEventListener('pointermove', e => { tx = e.clientX / innerWidth - .5; ty = e.clientY / innerHeight - .5; kick() }, {passive: true});
  kick();
} else {
  addEventListener('scroll', paintDock, {passive: true});
}
paintDock();

/* ---------- magnetic hover on interactive elements ---------- */
if (fine && !RM){
  $$('[data-magnet]').forEach(n => {
    const s = Number(n.dataset.magnet) || .18;
    n.addEventListener('pointermove', e => {
      const r = n.getBoundingClientRect();
      n.style.translate = `${(e.clientX - r.left - r.width/2) * s}px ${(e.clientY - r.top - r.height/2) * s}px`;
    });
    n.addEventListener('pointerleave', () => { n.style.translate = '' });
  });
}

/* ---------- arm after the intro so the first frame is never empty ---------- */
armReveals();
