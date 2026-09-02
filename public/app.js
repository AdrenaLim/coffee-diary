/* ================================================================
   Coffee Diary — state, API, rendering, pixel scene
   Bot + Princess with cursor-tracking eyes, clickable cup bean picker
================================================================ */
'use strict';

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const touchDevice = matchMedia('(pointer: coarse)').matches;

const state = {
  brews: [],
  method: 'latte',
  logFilter: 'all',
  beanFilter: null,
  rating: 0,
  hoverPoint: null,
  beans: [],
  currentBean: null,
  removedBeans: [],
};

const COMMON_BEANS = [
  'ONA Strawberry Kiss',
  'ONA Daily',
  'Single Origin Ethiopia',
  'Single Origin Colombia',
  'House Blend',
  'Decaf Blend',
];

/* ---------------- helpers ---------------- */
function fmtSeconds(s){
  if (s == null || s === 0) return '–';   // 0 = untimed
  if (s < 60) return Math.round(s) + 's';
  if (s < 3600) return Math.round(s/60) + 'm';
  return (s/3600).toFixed(s%3600 ? 1 : 0) + 'h';
}
function fmtDate(iso){
  const d = new Date(iso + (iso.endsWith('Z') ? '' : 'Z'));
  return d.toLocaleDateString(undefined, {weekday:'short', day:'numeric', month:'short', year:'numeric'});
}
function escapeHtml(t){
  return String(t ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
function toast(msg, err){
  const t = $('#toast');
  t.textContent = msg;
  t.classList.toggle('err', !!err);
  t.classList.add('show');
  clearTimeout(t._h);
  t._h = setTimeout(() => t.classList.remove('show'), 2600);
}

/* ---------------- API ---------------- */
async function api(path, opts){
  const res = await fetch(path, opts);
  let data = null;
  try { data = await res.json(); } catch {}
  if (!res.ok) throw new Error((data && data.error) || ('HTTP ' + res.status));
  return data;
}
async function loadBrews(){
  try{
    const data = await api('/api/brews');
    state.brews = data.brews || [];
    $('#offline-bar').classList.remove('show');
    renderAll();
  }catch(e){
    $('#offline-msg').textContent = 'Cannot reach the diary shelf: ' + e.message;
    $('#offline-bar').classList.add('show');
  }
}

/* ---------------- pixel icons ---------------- */
function drawIcon(cv, kind){
  const ctx = cv.getContext('2d');
  const P = cv.width / 13;
  ctx.clearRect(0,0,cv.width,cv.height);
  const px = (x,y,w,h,c) => { ctx.fillStyle = c; ctx.fillRect(x*P, y*P, (w||1)*P, (h||1)*P); };
  if (kind === 'latte'){
    px(2,1,9,1,'#241811');
    px(1,2,1,2,'#241811'); px(11,2,1,2,'#241811');
    px(3,2,7,4,'#f8efdd');
    px(3,5,7,1,'#c8924a');
    px(2,6,9,5,'#382718');
    px(3,11,7,1,'#241811');
    px(4,7,1,3,'#5c4430'); px(6,7,1,3,'#5c4430'); px(8,7,1,3,'#5c4430');
  } else if (kind === 'icelatte'){
    // tall glass: milk layer below, espresso layer on top, ice cubes, straw
    px(3,0,7,1,'#241811');               // rim
    px(2,1,1,10,'#241811'); px(10,1,1,10,'#241811'); // glass walls
    px(3,11,7,1,'#241811');              // base
    px(3,1,7,5,'#e8dcc2');               // milk layer (bottom 2/3)
    px(3,6,7,4,'#a3704a');               // espresso layer floating on top
    px(3,10,7,1,'#c8924a');              // caramel edge
    // ice cubes (diamond glints)
    px(4,3,2,2,'#bfe0f0'); px(5,3,1,'#eaf6fc');
    px(7,5,2,2,'#bfe0f0'); px(8,5,1,'#eaf6fc');
    px(4,8,2,2,'#bfe0f0'); px(5,8,1,'#eaf6fc');
    // straw
    px(8,0,1,3,'#a33a2a'); px(8,-1,1,1,'#c4657e');
  } else {
    px(4,0,5,2,'#241811');
    px(3,2,7,9,'#a34a24');
    px(3,2,7,1,'#c8924a');
    px(4,4,5,4,'#f8efdd');
    px(5,5,3,1,'#a34a24'); px(5,7,3,1,'#a34a24'); px(6,5,1,3,'#a34a24');
    px(3,11,7,1,'#7e3a1e');
  }
}
$$('canvas[data-icon]').forEach(cv => drawIcon(cv, cv.dataset.icon));

/* ================================================================
   SCENE
================================================================ */
const scene = $('#scene');
const sctx = scene.getContext('2d');
const CELL = 3;
const W = scene.width / CELL, H = scene.height / CELL;

const C = {
  wall:'#f1e4c8', wallStripe:'#ebdcba', cream:'#f8efdd', ink:'#241811',
  botBody:'#f4e8cc', apron:'#e8d5b0', accent:'#a34a24', accentDeep:'#7e3a1e',
  caramel:'#c8924a', wood:'#8a5a2e', woodDark:'#5f3a1c', woodLight:'#a06a3a',
  blush:'#e8a87a', steam:'rgba(120,105,85,1)', gold:'#d4a017', green:'#6a8a3a',
  pink:'#e8a0b4', pinkDeep:'#c46a86', skin:'#f4cfa4', skinShade:'#e0b483',
  hair:'#5a3620', hairShade:'#432612', dress:'#c4657e', dressDeep:'#a34a60',
};

const particles = [];   // steam
const notes = [];      // floating music notes
const bubble = { text:null, sub:null, until:0 };
let waveUntil = 0;
let princessWaveUntil = 0;
let jumpUntil = 0;
let steamBurstUntil = 0;

/* gaze — eyes follow cursor; on touch devices, follow scroll */
const gaze = { x:0, y:0, tx:0, ty:0 };
let sceneRect = null;
function updateSceneRect(){ sceneRect = scene.getBoundingClientRect(); }
addEventListener('pointermove', e => {
  if (!sceneRect) updateSceneRect();
  const cx = sceneRect.left + sceneRect.width/2;
  const cy = sceneRect.top + sceneRect.height/2;
  gaze.tx = Math.max(-1, Math.min(1, (e.clientX - cx) / (sceneRect.width/2)));
  gaze.ty = Math.max(-1, Math.min(1, (e.clientY - cy) / (sceneRect.height/2)));
}, {passive:true});
addEventListener('scroll', () => {
  if (!touchDevice) return;
  if (!sceneRect) updateSceneRect();
  const visible = Math.max(0, Math.min(1,
    1 - Math.abs((sceneRect.top + sceneRect.height/2) - innerHeight/2) / (innerHeight/2 + sceneRect.height/2)
  ));
  const k = Math.max(0, Math.min(1, 1 - sceneRect.top / innerHeight));
  gaze.tx = Math.sin(k * Math.PI) * 0.8;
  gaze.ty = (visible - 0.5) * 1.2;
}, {passive:true});
addEventListener('resize', updateSceneRect);

function rect(x,y,w,h,c){ sctx.fillStyle=c; sctx.fillRect(x*CELL, y*CELL, w*CELL, h*CELL); }
function px(x,y,c){ rect(x,y,1,1,c); }

function drawStatic(){
  rect(0,0,W,H,C.wall);
  for (let x=0; x<W; x+=12) rect(x,0,6,44,C.wallStripe);
  // hanging sign
  rect(44,0,1,6,C.ink);
  rect(40,6,9,7,C.woodDark);
  rect(41,7,7,5,C.apron);
  px(44,9,C.caramel); px(44,10,C.caramel); px(45,9,C.caramel);
  rect(45,8,1,1,C.caramel); rect(43,9,1,1,C.caramel);
}

function drawCounter(){
  rect(0,44,W,3,C.woodLight);
  rect(0,47,W,4,C.wood);
  for (let x=0; x<W; x+=8) { px(x+3,48,C.woodDark); px(x+6,49,C.woodDark); }
  rect(0,51,W,13,C.woodDark);
  for (let x=2; x<W; x+=12) rect(x,53,8,8,'#6b4222');
}

function drawCup(){
  // clickable latte cup on counter, left side
  rect(16,39,10,5,C.cream);
  rect(15,40,1,3,C.cream); rect(26,40,1,3,C.cream);
  rect(17,40,8,2,C.caramel);
  rect(17,44,8,1,C.woodDark);
  rect(14,45,14,2,C.apron); px(14,45,C.caramel);
}

function drawBot(t){
  const bob = reduced ? 0 : Math.round(Math.sin(t/550)*1);
  const jump = t < jumpUntil ? -Math.round(Math.sin((jumpUntil-t)/300*Math.PI)*3) : 0;
  const dy = bob + jump;
  const y0 = dy;

  rect(38,42,16,2,'rgba(95,58,28,.45)');

  // antenna
  px(46, y0+0, C.accent); px(46, y0+1, C.caramel);
  rect(45, y0+2, 3, 2, C.ink);
  // head
  rect(38, y0+4, 16, 16, C.ink);
  rect(39, y0+5, 14, 14, C.cream);
  // ears
  rect(37, y0+9, 1, 4, C.ink); rect(54, y0+9, 1, 4, C.ink);
  px(37, y0+10, C.accentDeep); px(54, y0+10, C.accentDeep);
  // eyes — gaze + blink
  const blink = !reduced && (t % 3400) > 3250;
  const ex = Math.round(gaze.x);
  const ey = Math.round(gaze.y);
  if (blink){
    rect(41, y0+9, 3, 1, C.ink); rect(48, y0+9, 3, 1, C.ink);
  } else {
    rect(41+ex, y0+8+ey, 3, 3, C.ink); rect(48+ex, y0+8+ey, 3, 3, C.ink);
    px(42+ex, y0+9+ey, C.cream); px(49+ex, y0+9+ey, C.cream);
  }
  // blush
  rect(40, y0+13, 2, 2, C.blush); rect(50, y0+13, 2, 2, C.blush);
  // smile — or open singing mouth while café jazz plays
  if (music.playing === 'bot' && !blink){
    const open = Math.floor(t/150) % 2 === 0;
    rect(44, y0+14, 6, open ? 3 : 2, C.ink);
    px(44, y0+14, C.cream); px(49, y0+14, C.cream);
    px(45, y0+17, C.accentDeep);  // tongue peek
  } else {
    px(44, y0+14, C.ink); rect(45, y0+15, 4, 1, C.ink); px(49, y0+14, C.ink);
  }
  // neck + body
  rect(44, y0+20, 4, 2, C.ink);
  rect(40, y0+22, 12, 20, C.ink);
  rect(41, y0+23, 10, 18, C.botBody);
  rect(42, y0+24, 8, 14, C.apron);
  // heart on apron
  px(45, y0+26, C.accent); px(47, y0+26, C.accent);
  rect(44, y0+27, 5, 2, C.accent); rect(45, y0+29, 3, 1, C.accent); px(46, y0+30, C.accent);
  // left arm
  rect(37, y0+26, 3, 8, C.ink);
  rect(38, y0+27, 1, 6, C.botBody);
  px(36, y0+34, C.ink); px(35, y0+34, C.ink);
  // right arm — waves on celebration
  const waving = t < waveUntil;
  if (waving){
    const up = Math.floor(t/140) % 2 === 0;
    if (up){
      rect(52, y0+8, 2, 8, C.ink);
      rect(53, y0+7, 2, 2, C.botBody);
      px(54, y0+5, C.caramel);
      px(55, y0+4, C.gold);
    } else {
      rect(53, y0+12, 2, 6, C.ink);
      px(54, y0+10, C.gold);
    }
  } else {
    rect(52, y0+26, 3, 6, C.ink);
    rect(53, y0+27, 1, 5, C.botBody);
    rect(51, y0+32, 3, 3, C.caramel);
    px(52, y0+32, C.accentDeep);
  }
  if (jump < 0){
    rect(42, y0+42, 3, 4, C.ink); rect(47, y0+42, 3, 4, C.ink);
  }
}

/* princess bob: gentle bounce, body anchored so feet stay below counter edge */
function dy0(t, bob){
  return -bob;   // bob of ±1 cell upward from anchored seat position
}

function drawPrincess(t){
  // BABY princess — small chibi sitting ON the counter (anchored: seat at y=44),
  // holding a little star cone (waffle cone topped with a gold star).
  const bob = reduced ? 0 : Math.round(Math.sin(t/650 + 1.5)*1);
  const y0 = dy0(t, bob);
  const waving = t < princessWaveUntil;
  const SEAT = 44;   // counter top surface

  // shadow on the counter
  rect(77, SEAT, 14, 1, 'rgba(95,58,28,.35)');

  // twin-tails hanging behind her (cute!)
  rect(74, y0+31, 2, 10, C.hairShade);
  rect(90, y0+31, 2, 10, C.hairShade);
  px(74, y0+40, C.pink); px(91, y0+40, C.pink);  // hair ties

  // tiny legs dangling over the counter edge
  rect(80, y0+44, 2, 4, C.skinShade);
  rect(86, y0+44, 2, 4, C.skinShade);
  // tiny shoes
  rect(79, y0+48, 3, 2, C.accentDeep);
  rect(86, y0+48, 3, 2, C.accentDeep);

  // tiny bubble dress (x79-89), bottom resting on the counter at y=44
  rect(79, y0+36, 11, 8, C.dress);
  rect(80, y0+37, 9, 6, C.dressDeep);
  // white frilly collar
  rect(81, y0+36, 7, 1, '#fff8ea');

  // stubby right arm — waves on celebration
  if (waving){
    const up = Math.floor(t/140) % 2 === 0;
    if (up){
      rect(90, y0+30, 2, 7, C.skin);   // arm up
      px(91, y0+28, C.gold);            // star sparkle
      px(92, y0+27, '#fff6d8');
    } else {
      rect(90, y0+34, 2, 5, C.skin);
      px(91, y0+32, C.gold);
    }
  } else {
    rect(90, y0+37, 2, 4, C.skin);      // right arm resting
  }
  // stubby left arm reaching out to hold the star cone
  rect(75, y0+38, 5, 2, C.skin);        // horizontal little arm
  px(74, y0+38, C.skin); px(74, y0+39, C.skin);  // hand

  // STAR CONE — waffle cone with a gold star on top, in her left hand
  rect(70, y0+38, 4, 2, C.caramel);      // cone rim
  rect(70, y0+40, 4, 2, C.accent);       // cone body
  rect(71, y0+42, 2, 2, C.accentDeep);  // cone tip
  // gold star (plus shape reads as a star at this size)
  px(70, y0+36, C.gold); px(71, y0+36, C.gold); px(72, y0+36, C.gold);
  px(71, y0+35, C.gold); px(71, y0+37, C.gold);
  px(70, y0+34, '#fff6d8');               // tiny sparkle above

  // HEAD — big round chibi head (x75-91, y20-36)
  rect(74, y0+19, 17, 16, C.hair);      // hair block outline
  rect(75, y0+20, 15, 14, C.skin);      // face
  // fringe with cute zigzag
  rect(75, y0+20, 15, 2, C.hair);
  px(77, y0+22, C.hair); px(80, y0+22, C.hair); px(83, y0+22, C.hair);
  // side hair framing big baby cheeks
  rect(74, y0+20, 2, 11, C.hair);
  rect(89, y0+20, 2, 11, C.hair);
  // tiny crown
  rect(80, y0+16, 6, 2, C.gold);
  px(79, y0+17, C.gold); px(86, y0+17, C.gold);
  px(81, y0+15, C.gold); px(84, y0+15, C.gold);
  px(82, y0+14, '#fff6d8');
  // BIG sparkly baby eyes — gaze + blink
  const blink = !reduced && ((t + 1200) % 3400) > 3250;
  const ex = Math.round(gaze.x);
  const ey = Math.round(gaze.y);
  if (blink){
    rect(77, y0+25, 4, 1, C.ink);
    rect(84, y0+25, 4, 1, C.ink);
  } else {
    // big dark eyes with white sparkle
    rect(77+ex, y0+23+ey, 4, 4, C.ink);
    rect(84+ex, y0+23+ey, 4, 4, C.ink);
    px(78+ex, y0+24+ey, '#ffffff'); px(85+ex, y0+24+ey, '#ffffff');   // main sparkle
    px(79+ex, y0+26+ey, '#ffe9f0'); px(86+ex, y0+26+ey, '#ffe9f0');   // bottom shine
  }
  // blush — big baby blush
  rect(75, y0+28, 2, 2, C.blush); rect(88, y0+28, 2, 2, C.blush);
  // tiny open smile — or singing mouth while her waltz plays
  if (music.playing === 'princess' && !blink){
    const open = Math.floor(t/150) % 2 === 0;
    rect(80, y0+28, 4, open ? 3 : 2, C.ink);
    px(80, y0+28, C.skin); px(83, y0+28, C.skin);
    px(81, y0+31, C.pinkDeep);  // little tongue
  } else {
    rect(80, y0+28, 4, 2, C.ink);
    px(80, y0+28, C.skin); px(83, y0+28, C.skin);
  }
}

function spawnSteam(x, y, burst){
  const n = burst ? 6 : 1;
  for (let i=0; i<n; i++){
    particles.push({
      x: x + (Math.random()*2-1) * (burst ? 2 : 0.8),
      y: y + (Math.random()*1-0.5),
      vx: (Math.random()*2-1) * 0.06,
      vy: -0.14 - Math.random() * (burst ? 0.35 : 0.18),
      wob: Math.random()*Math.PI*2,
      age: 0,
      life: 1400 + Math.random()*1600,
      size: 1 + (Math.random()<0.35 ? 1 : 0),
    });
  }
}

function drawSteam(t, dt){
  for (let i = particles.length-1; i >= 0; i--){
    const p = particles[i];
    p.age += dt;
    if (p.age > p.life){ particles.splice(i,1); continue; }
    p.wob += dt/300;
    p.x += p.vx + Math.sin(p.wob)*0.05;
    p.y += p.vy;
    const k = p.age / p.life;
    sctx.globalAlpha = 0.55 * (1-k) * (k<0.15 ? k/0.15 : 1);
    const s = p.size + (k>0.5 ? 1 : 0);
    sctx.fillStyle = C.steam;
    sctx.fillRect(p.x*CELL, p.y*CELL, s*CELL, s*CELL);
    sctx.globalAlpha = 1;
  }
}

function spawnNote(x, y, who){
  notes.push({
    x, y,
    vx: (who === 'bot' ? 0.05 : -0.05) + (Math.random()*0.04 - 0.02),
    vy: -0.10 - Math.random()*0.06,
    wob: Math.random()*Math.PI*2,
    age: 0,
    life: 2200 + Math.random()*1400,
    kind: Math.random() < 0.5 ? '♪' : '♫',
    color: who === 'bot' ? C.gold : C.pink,
  });
}

function drawNotes(t, dt){
  for (let i = notes.length-1; i >= 0; i--){
    const n = notes[i];
    n.age += dt;
    if (n.age > n.life){ notes.splice(i,1); continue; }
    n.wob += dt/400;
    n.x += n.vx + Math.sin(n.wob)*0.03;
    n.y += n.vy;
    const k = n.age / n.life;
    sctx.globalAlpha = 0.9 * (1-k) * (k<0.12 ? k/0.12 : 1);
    sctx.fillStyle = n.color;
    sctx.font = (10 + Math.sin(n.wob*2)*1.5) + 'px Georgia, serif';
    sctx.textBaseline = 'bottom';
    sctx.fillText(n.kind, n.x*CELL, n.y*CELL);
    sctx.globalAlpha = 1;
  }
}

function drawBubble(t){
  if (!bubble.text || t > bubble.until) return;
  const bx = 12, by = 2, bw = 74, bh = bubble.sub ? 16 : 12;
  sctx.fillStyle = C.cream;
  sctx.fillRect(bx*CELL, by*CELL, bw*CELL, bh*CELL);
  sctx.fillStyle = C.ink;
  const X0=bx*CELL, Y0=by*CELL, X1=(bx+bw)*CELL, Y1=(by+bh)*CELL;
  sctx.fillRect(X0, Y0, X1-X0, 2); sctx.fillRect(X0, Y1-2, X1-X0, 2);
  sctx.fillRect(X0, Y0, 2, Y1-Y0); sctx.fillRect(X1-2, Y0, 2, Y1-Y0);
  sctx.fillStyle = C.cream;
  sctx.fillRect(44*CELL-2, Y1, 6, 5);
  sctx.fillStyle = C.ink;
  sctx.fillRect(44*CELL-2, Y1, 2, 5); sctx.fillRect(44*CELL+2, Y1, 2, 5);
  sctx.fillStyle = C.ink;
  sctx.font = '8px "Press Start 2P", monospace';
  sctx.textBaseline = 'top';
  sctx.fillText(bubble.text, X0+7, Y0+8);
  if (bubble.sub){
    sctx.fillStyle = C.accentDeep;
    sctx.font = '7px "Press Start 2P", monospace';
    sctx.fillText(bubble.sub, X0+7, Y0+22);
  }
}

let lastFrame = performance.now();
let lastCupSteam = 0;
const lastNoteAt = { bot:0, princess:0 };
function frame(t){
  const dt = Math.min(60, t - lastFrame);
  lastFrame = t;

  gaze.x += (gaze.tx - gaze.x) * 0.35;
  gaze.y += (gaze.ty - gaze.y) * 0.35;

  sctx.clearRect(0,0,scene.width,scene.height);
  drawStatic();
  drawBot(t);
  drawPrincess(t);
  drawCup();
  drawCounter();
  drawBubble(t);

  if (!reduced){
    const bursting = t < steamBurstUntil;
    if (t - lastCupSteam > (bursting ? 40 : 130)){ lastCupSteam = t; spawnSteam(21, 38, bursting); }
    // music notes float out of the singer's mouth
    if (music.playing === 'bot' && t - (lastNoteAt.bot || 0) > 520){
      lastNoteAt.bot = t; spawnNote(47.5, 16, 'bot');
    }
    if (music.playing === 'princess' && t - (lastNoteAt.princess || 0) > 560){
      lastNoteAt.princess = t; spawnNote(82, 30, 'princess');
    }
  }
  drawSteam(t, dt);
  drawNotes(t, dt);

  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
updateSceneRect();

function celebrate(rating){
  const now = performance.now();
  waveUntil = now + 1600;
  princessWaveUntil = now + 1600;
  jumpUntil = now + 700;
  steamBurstUntil = now + 1200;
  if (rating >= 8){
    bubble.text = 'PERFECT CUP!!'; bubble.sub = 'A ROYAL APPROVAL'; bubble.until = now + 2600;
    setMood('MOOD: ECSTATIC ★');
  } else if (rating >= 5){
    bubble.text = 'BREW LOGGED!'; bubble.sub = rating + '/10 — NICE ONE'; bubble.until = now + 2200;
    setMood('MOOD: HAPPY');
  } else {
    bubble.text = 'LOGGED...'; bubble.sub = 'EVERY CUP TEACHES'; bubble.until = now + 2200;
    setMood('MOOD: LEARNING');
  }
  setTimeout(() => setMood('MOOD: FOCUSED'), 3400);
}
function setMood(m){ $('#bot-mood').textContent = m; }
function greet(txt){ $('#greet').textContent = txt; }

/* ================================================================
   MUSIC — click the barista for chill café jazz,
   click the princess for a music-box waltz.
   While playing: mouths sing + gold/pink notes float out.
================================================================ */
const music = { ctx:null, playing:null, timer:null, next:0, step:0 };

function ac(){
  if (!music.ctx) music.ctx = new (window.AudioContext || window.webkitAudioContext)();
  if (music.ctx.state === 'suspended') music.ctx.resume();
  return music.ctx;
}

function tone(freq, when, dur, type, vol){
  const ctx = ac();
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type || 'sine';
  o.frequency.setValueAtTime(freq, when);
  g.gain.setValueAtTime(0.0001, when);
  g.gain.linearRampToValueAtTime(vol || 0.1, when + 0.03);
  g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
  o.connect(g); g.connect(ctx.destination);
  o.start(when); o.stop(when + dur + 0.1);
}

// --- chill café jazz: soft triangle arpeggios over a warm progression ---
const CAFE_CHORDS = [
  [261.63, 329.63, 392.00, 493.88],  // Cmaj7
  [220.00, 261.63, 329.63, 392.00],  // Am7
  [174.61, 220.00, 261.63, 329.63],  // Fmaj7
  [196.00, 246.94, 293.66, 392.00],  // G7
];
function cafeStep(step, when){
  const chord = CAFE_CHORDS[Math.floor(step/8) % 4];
  const beat = step % 8;
  if (beat === 0 || beat === 4) tone(chord[0]/2, when, 1.1, 'sine', 0.09);       // warm bass
  tone(chord[[0,1,2,3,2,1,3,2][beat]], when, 0.6, 'triangle', 0.05);            // gentle arpeggio
  if (beat === 2) tone(chord[3]*2, when, 0.5, 'sine', 0.035);                   // sparkle
  if (beat === 6) tone(chord[2]*2, when, 0.5, 'sine', 0.035);
}

// --- princess waltz: music-box bells in 3/4 ---
const WALTZ_MELODY = [659.25,0,783.99, 659.25,0,523.25, 587.33,0,659.25, 783.99,0,880.00, 783.99,0,659.25, 523.25,0,0];
const WALTZ_BASS   = [130.81,0,0,     174.61,0,0,     196.00,0,0,     164.81,0,0,     130.81,0,0,     130.81,0,0];
function waltzStep(step, when){
  const i = step % 18;
  const m = WALTZ_MELODY[i];
  if (m){ tone(m, when, 0.9, 'sine', 0.09); tone(m*2, when, 0.45, 'sine', 0.025); }  // bell + shimmer
  const b = WALTZ_BASS[i];
  if (b) tone(b, when, 0.8, 'triangle', 0.06);
  if (i % 3 !== 0) tone(329.63, when, 0.12, 'triangle', 0.022);                    // oom-pah-pah
}

function startMusic(kind){
  stopMusic();
  music.playing = kind;
  music.step = 0;
  const ctx = ac();
  music.next = ctx.currentTime + 0.08;
  music.timer = setInterval(() => {
    const c = music.ctx;
    const stepDur = kind === 'bot' ? 0.30 : 0.36;
    while (music.next < c.currentTime + 0.3){
      if (kind === 'bot') cafeStep(music.step, music.next);
      else waltzStep(music.step, music.next);
      music.next += stepDur;
      music.step++;
    }
  }, 60);
  if (kind === 'bot'){
    setMood('MOOD: SINGING CAFE JAZZ ♪');
    greet('Brew-o is singing a chill café tune. Tap him again to stop.');
  } else {
    setMood('MOOD: ROYAL WALTZ ♪');
    greet('The baby princess is singing her waltz. Tap her again to stop.');
  }
}

function stopMusic(){
  if (music.timer){ clearInterval(music.timer); music.timer = null; }
  if (music.playing){
    music.playing = null;
    setMood('MOOD: FOCUSED');
    greet('Brew-o and the baby princess are ready.');
  }
}

/* ================================================================
   BEAN PICKER — click the cup in the scene
================================================================ */
const beanPop = $('#bean-pop');
function openBeanPop(x, y){
  renderBeanPop();
  beanPop.style.display = 'block';
  const card = scene.parentElement;
  const cw = card.clientWidth;
  let left = Math.min(x + 12, cw - 280);
  if (left < 8) left = 8;
  let top = Math.max(8, y - 170);
  if (top < 8) top = 8;
  beanPop.style.left = left + 'px';
  beanPop.style.top = top + 'px';
}
function renderBeanPop(){
  const all = beanUniverse();
  beanPop.innerHTML = `
    <h4>PICK YOUR BEAN</h4>
    <div class="bp-list">
      ${all.map(b => `<span class="bp-item"><button type="button" class="chip ${b===state.currentBean?'selected':''}" data-bean="${escapeHtml(b)}">${escapeHtml(b)}</button><button type="button" class="bp-x" data-delbean="${escapeHtml(b)}" title="remove ${escapeHtml(b)}">✕</button></span>`).join('')}
    </div>
    <div class="bp-add">
      <input type="text" id="bp-new" placeholder="add a new bean…" maxlength="120">
      <button type="button" id="bp-add-btn">+ ADD</button>
    </div>
  `;
  beanPop.querySelectorAll('[data-bean]').forEach(btn => btn.addEventListener('click', () => {
    selectBean(btn.dataset.bean);
    closeBeanPop();
  }));
  beanPop.querySelectorAll('[data-delbean]').forEach(btn => btn.addEventListener('click', () => {
    removeBean(btn.dataset.delbean);
  }));
  const addBtn = $('#bp-add-btn');
  addBtn.addEventListener('click', () => {
    const v = $('#bp-new').value.trim();
    if (v){ addBean(v); selectBean(v); closeBeanPop(); }
  });
  $('#bp-new').addEventListener('keydown', e => { if (e.key === 'Enter'){ e.preventDefault(); addBtn.click(); } });
}
function closeBeanPop(){ beanPop.style.display = 'none'; }
function beanUniverse(){
  const gone = b => !state.removedBeans.includes(b);
  const s = new Set(COMMON_BEANS.filter(gone));
  state.beans.filter(gone).forEach(b => s.add(b));
  state.brews.map(x => x.bean).filter(gone).forEach(b => s.add(b));
  return [...s];
}
function addBean(name){
  // re-adding a removed bean un-removes it
  state.removedBeans = state.removedBeans.filter(b => b !== name);
  if (!state.beans.includes(name)){
    state.beans.push(name);
  }
  try{
    localStorage.setItem('coffee-diary-beans', JSON.stringify(state.beans));
    localStorage.setItem('coffee-diary-removed', JSON.stringify(state.removedBeans));
  }catch{}
}
function removeBean(name){
  // from user library
  state.beans = state.beans.filter(b => b !== name);
  // remember removal so it stops reappearing (common beans AND typo'd beans in history)
  if (!state.removedBeans.includes(name)){
    state.removedBeans.push(name);
  }
  try{
    localStorage.setItem('coffee-diary-beans', JSON.stringify(state.beans));
    localStorage.setItem('coffee-diary-removed', JSON.stringify(state.removedBeans));
  }catch{}
  // if the removed bean was selected, clear selection
  if (state.currentBean === name){
    state.currentBean = null;
    $('#f-bean').value = '';
    try{ localStorage.removeItem('coffee-diary-bean'); }catch{}
  }
  renderBeanPop();
  renderBeans();
  toast('BEAN REMOVED: ' + name.toUpperCase());
}
function selectBean(name){
  state.currentBean = name;
  $('#f-bean').value = name;
  try{ localStorage.setItem('coffee-diary-bean', JSON.stringify(name)); }catch{}
  toast('BEAN SET: ' + name.toUpperCase());
}
function loadBeanLib(){
  try{
    state.beans = JSON.parse(localStorage.getItem('coffee-diary-beans') || '[]');
    state.removedBeans = JSON.parse(localStorage.getItem('coffee-diary-removed') || '[]');
    const cur = JSON.parse(localStorage.getItem('coffee-diary-bean') || 'null');
    if (cur) state.currentBean = cur;
  }catch{}
  if (state.currentBean) $('#f-bean').value = state.currentBean;
}

// PICK button in the form opens the same bean picker
$('#bean-pick-btn').addEventListener('click', e => {
  e.stopPropagation();
  const r = e.target.getBoundingClientRect();
  const card = scene.parentElement;
  const cardRect = card.getBoundingClientRect();
  openBeanPop(r.left - cardRect.left, r.top - cardRect.top + 30);
  beanPop.style.top = Math.min(r.top - cardRect.top + 34, card.clientHeight - 200) + 'px';
});

function cupHit(sx, sy){
  return sx > 0.10 && sx < 0.32 && sy > 0.52 && sy < 0.80;
}
// character hit zones (scene-relative 0..1)
function botHit(sx, sy){
  // bot occupies roughly x 35..57 of 96, y 4..44 of 64
  return sx > 0.34 && sx < 0.60 && sy > 0.05 && sy < 0.70;
}
function princessHit(sx, sy){
  // baby princess occupies roughly x 69..93 of 96, y 14..50 of 64
  return sx > 0.70 && sx < 0.97 && sy > 0.20 && sy < 0.78;
}

scene.addEventListener('click', e => {
  const r = scene.getBoundingClientRect();
  const sx = (e.clientX - r.left) / r.width;
  const sy = (e.clientY - r.top) / r.height;
  if (cupHit(sx, sy)){
    openBeanPop(e.clientX - r.left, e.clientY - r.top);
  } else if (botHit(sx, sy)){
    music.playing === 'bot' ? stopMusic() : startMusic('bot');
  } else if (princessHit(sx, sy)){
    music.playing === 'princess' ? stopMusic() : startMusic('princess');
  } else {
    closeBeanPop();
  }
});
scene.addEventListener('mousemove', e => {
  const r = scene.getBoundingClientRect();
  const sx = (e.clientX - r.left) / r.width;
  const sy = (e.clientY - r.top) / r.height;
  const clickable = cupHit(sx, sy) || botHit(sx, sy) || princessHit(sx, sy);
  scene.classList.toggle('cup-hover', clickable);
});
document.addEventListener('click', e => {
  if (beanPop.style.display === 'block' && !beanPop.contains(e.target) && e.target !== scene){
    closeBeanPop();
  }
});

/* ================================================================
   FORM — per-method controls
================================================================ */
const METHOD_DEFS = {
  latte: {
    label:'Latte', grind:[5,10,7], doseToggle:[18,20,18], water:36, waterHint:'ml water out',
    secChips:[[25,'25s'],[28,'28s'],[30,'30s'],[32,'32s'],[36,'36s']], secHint:'extraction',
  },
  icelatte: {
    label:'Ice Latte', grind:[5,10,7], doseToggle:[18,20,18], water:36, waterHint:'ml espresso over ice',
    milk:[100,300,180,10],   // min, max, default, step
    secChips:[[20,'20s'],[25,'25s'],[28,'28s'],[30,'30s'],[32,'32s']], secHint:'extraction',
  },
  coldbrew: {
    label:'Cold Brew', grind:[10,15,14], doseSlider:[55,100,55,5], water:800, waterHint:'ml water',
    secChips:[[43200,'12h'],[57600,'16h'],[64800,'18h'],[86400,'24h']], secHint:'steep time',
  },
};

const doseToggleEl = $('#dose-toggle');

function setMethod(m){
  state.method = m;
  $$('.method-toggle button').forEach(b => b.classList.toggle('active', b.id === 'm-' + m));
  const d = METHOD_DEFS[m];

  // grind slider
  const g = $('#f-grind');
  g.min = d.grind[0]; g.max = d.grind[1]; g.step = 1; g.value = d.grind[2];
  $('#grind-val').textContent = d.grind[2];
  $('#grind-hint').textContent = m === 'coldbrew' ? 'coarse' : 'fine';

  // dose control
  const doseLabel = $('#dose-hint');
  if (d.doseSlider){
    const [mn, mx, def, step] = d.doseSlider;
    doseToggleEl.innerHTML = `
      <div class="slider-wrap">
        <input type="range" id="f-dose-range" min="${mn}" max="${mx}" step="${step}" value="${def}">
        <span class="slider-val" id="dose-val">${def}g</span>
      </div>`;
    $('#f-dose-range').addEventListener('input', () => {
      $('#dose-val').textContent = $('#f-dose-range').value + 'g';
      saveDraft();
    });
    doseLabel.textContent = 'grams in';
  } else {
    const [a, b2, def] = d.doseToggle;
    doseToggleEl.innerHTML = `
      <button type="button" class="chip ${def===a?'selected':''}" data-dose="${a}">${a}g</button>
      <button type="button" class="chip ${def===b2?'selected':''}" data-dose="${b2}">${b2}g</button>`;
    doseToggleEl.querySelectorAll('[data-dose]').forEach(btn => btn.addEventListener('click', () => {
      doseToggleEl.querySelectorAll('[data-dose]').forEach(x => x.classList.remove('selected'));
      btn.classList.add('selected');
      saveDraft();
    }));
    doseLabel.textContent = 'grams in';
  }

  // milk slider — ice latte only
  const milkField = $('#milk-field');
  if (d.milk){
    const [mn, mx, def, step] = d.milk;
    const ms = $('#f-milk');
    ms.min = mn; ms.max = mx; ms.step = step; ms.value = def;
    $('#milk-val').textContent = def + 'ml';
    milkField.style.display = 'block';
  } else {
    milkField.style.display = 'none';
  }

  // water default
  $('#f-water').value = d.water;
  $('#water-hint').textContent = d.waterHint;

  // seconds chips
  $('#sec-chips').innerHTML = d.secChips
    .map(([v,l]) => `<button type="button" class="chip" data-sec="${v}">${l}</button>`).join('');
  $('#sec-hint').textContent = d.secHint;
  saveDraft();
}
$$('.method-toggle button').forEach(b => b.addEventListener('click', () => setMethod(b.id.replace('m-',''))));

$('#sec-chips').addEventListener('click', e => {
  const b = e.target.closest('.chip');
  if (b){ $('#f-seconds').value = b.dataset.sec; saveDraft(); }
});

// star rating picker — 1..10 stars that shine gold when lit
const starsEl = $('#stars');
for (let i=1; i<=10; i++){
  const b = document.createElement('button');
  b.type = 'button'; b.className = 'star-btn'; b.textContent = '★';
  b.setAttribute('aria-label', i + ' out of 10');
  b.title = i + '/10';
  b.addEventListener('click', () => {
    const prev = state.rating;
    state.rating = i; paintStars(); saveDraft();
    // restart the shine animation on the newly lit star
    if (!reduced && (prev !== i)){
      b.classList.remove('on'); void b.offsetWidth; b.classList.add('on');
    }
  });
  starsEl.appendChild(b);
}
function paintStars(){
  $$('.star-btn').forEach((b,i) => b.classList.toggle('on', i < state.rating));
}

$('#f-grind').addEventListener('input', () => {
  $('#grind-val').textContent = $('#f-grind').value;
  saveDraft();
});

$('#f-milk').addEventListener('input', () => {
  $('#milk-val').textContent = $('#f-milk').value + 'ml';
  saveDraft();
});

// draft persistence
const draftKeys = ['f-bean','f-water','f-seconds','f-notes'];
function saveDraft(){
  try{
    const d = {method: state.method, rating: state.rating};
    draftKeys.forEach(k => d[k] = $('#'+k).value);
    d.grind = $('#f-grind').value;
    localStorage.setItem('coffee-diary-draft', JSON.stringify(d));
  }catch{}
}
function loadDraft(){
  try{
    const d = JSON.parse(localStorage.getItem('coffee-diary-draft') || '{}');
    if (d.method && METHOD_DEFS[d.method]) setMethod(d.method);
    draftKeys.forEach(k => { if (d[k] != null) $('#'+k).value = d[k]; });
    if (d.grind != null){ $('#f-grind').value = d.grind; $('#grind-val').textContent = d.grind; }
    if (d.rating){ state.rating = d.rating; paintStars(); }
  }catch{}
}
draftKeys.forEach(k => $('#'+k).addEventListener('input', saveDraft));

function currentDose(){
  const d = METHOD_DEFS[state.method];
  if (d.doseSlider){
    const el = $('#f-dose-range');
    return el ? parseFloat(el.value) : NaN;
  }
  const sel = doseToggleEl.querySelector('.chip.selected');
  return sel ? parseFloat(sel.dataset.dose) : NaN;
}

$('#brew-form').addEventListener('submit', async e => {
  e.preventDefault();
  const brew = {
    method: state.method,
    bean: $('#f-bean').value.trim() || 'House blend',
    grind: parseFloat($('#f-grind').value),
    dose_g: currentDose(),
    water_g: parseFloat($('#f-water').value),
    milk_g: state.method === 'icelatte' ? parseInt($('#f-milk').value, 10) : 0,
    seconds: parseInt($('#f-seconds').value, 10),
    rating: state.rating,
    notes: $('#f-notes').value.trim(),
  };
  if (!brew.grind && brew.grind !== 0){ toast('ENTER A GRIND SETTING', true); return; }
  if (!brew.water_g && brew.water_g !== 0){ toast('ENTER WATER', true); return; }
  if (!brew.dose_g && brew.dose_g !== 0){ toast('PICK A DOSE', true); return; }
  if (!brew.rating){ toast('GIVE IT A RATING', true); return; }

  const btn = $('#save-btn');
  btn.disabled = true; btn.textContent = 'SAVING...';
  try{
    const data = await api('/api/brews', {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify(brew),
    });
    state.brews.unshift(data.brew);
    renderAll();
    celebrate(brew.rating);
    toast('BREW LOGGED IN THE DIARY');
    // keep method + bean sticky; clear per-cup fields
    $('#f-seconds').value = ''; $('#f-notes').value = '';
    state.rating = 0; paintStars();
    saveDraft();
  }catch(err){
    toast('SAVE FAILED: ' + err.message.toUpperCase(), true);
  }finally{
    btn.disabled = false; btn.textContent = '+ LOG THIS BREW';
  }
});

/* ================================================================
   RENDER
================================================================ */
function ratingColor(r){
  const map = {10:'#d4a017',9:'#d9a530',8:'#c8924a',7:'#bd8b42',6:'#a06a3a',5:'#96703c',4:'#7a4a2a',3:'#6a3e24',2:'#4a3020',1:'#3a2418'};
  return map[r] || '#8a7658';
}

function renderAll(){
  renderStats();
  renderEntries();
  renderBeans();
}

function renderStats(){
  const b = state.brews;
  $('#st-total').textContent = b.length;
  $('#st-avg').textContent = b.length ? (b.reduce((s,x)=>s+x.rating,0)/b.length).toFixed(1) + ' ★' : '–';
  $('#st-best').textContent = b.length ? Math.max(...b.map(x=>x.rating)) + ' ★' : '–';
  $('#st-latte').textContent = b.filter(x=>x.method==='latte').length;
  $('#st-ice').textContent = b.filter(x=>x.method==='icelatte').length;
  $('#st-cold').textContent = b.filter(x=>x.method==='coldbrew').length;
  $('#count-tag').textContent = b.length + (b.length === 1 ? ' ENTRY' : ' ENTRIES');
  $('#empty-state').style.display = b.length ? 'none' : 'block';
}

function bestBrew(){
  if (!state.brews.length) return null;
  let best = state.brews[0];
  for (const x of state.brews) if (x.rating > best.rating) best = x;
  return best;
}

function diaryOrder(){
  const best = bestBrew();
  const rest = state.brews.filter(x => !best || x.id !== best.id);
  rest.sort((a,b) => new Date(b.created_at) - new Date(a.created_at));
  return best ? [best, ...rest] : rest;
}

function logFilterFn(x){
  if (state.logFilter === 'all') return true;
  if (state.logFilter === 'bean') return state.beanFilter == null || x.bean === state.beanFilter;
  return x.method === state.logFilter;
}

function renderEntries(){
  const wrap = $('#entries');
  $$('.entry, #empty-filter').forEach(el => el.remove());
  const best = bestBrew();
  const list = diaryOrder().filter(logFilterFn);
  const note = $('#bean-filter-note');
  if (state.logFilter === 'bean' && state.beanFilter){
    note.textContent = 'Showing only: ' + state.beanFilter + ' — tap BY BEAN again to change.';
    note.classList.add('show');
  } else {
    note.classList.remove('show');
  }
  if (!list.length && state.brews.length){
    const el = document.createElement('div');
    el.id = 'empty-filter';
    el.className = 'empty';
    el.innerHTML = '<span class="pix">NOTHING HERE</span>No brews match this filter yet.';
    wrap.appendChild(el);
    return;
  }
  for (const x of list){
    const el = document.createElement('article');
    el.className = 'entry method-' + x.method;
    el.id = 'entry-' + x.id;
    const methodLabel = METHOD_DEFS[x.method] ? METHOD_DEFS[x.method].label.toLowerCase() : x.method;
    el.innerHTML = `
      <button class="del" title="Delete entry" aria-label="Delete entry">✕</button>
      ${best && x.id === best.id ? '<div class="entry-best">★ BEST</div>' : ''}
      <div class="entry-score ${x.rating >= 8 ? 'gold' : ''}" title="${x.rating} out of 10">${x.rating}</div>
      <div class="entry-head">
        <canvas class="entry-icon" width="26" height="26"></canvas>
        <div>
          <div class="entry-title">${escapeHtml(x.bean)}</div>
          <div class="entry-date">${fmtDate(x.created_at)} · ${methodLabel}</div>
        </div>
      </div>
      <div class="entry-params">
        <span class="p">GRIND <b>${escapeHtml(x.grind)}</b></span>
        <span class="p">DOSE <b>${escapeHtml(x.dose_g)}g</b></span>
        <span class="p">WATER <b>${escapeHtml(x.water_g)}ml</b></span>
        ${x.milk_g ? `<span class="p">MILK <b>${escapeHtml(x.milk_g)}ml</b></span>` : ''}
        <span class="p">${x.method === 'coldbrew' ? 'STEEP' : 'PULL'} <b>${fmtSeconds(x.seconds)}</b></span>
      </div>
      ${x.notes ? `<div class="entry-notes">“${escapeHtml(x.notes)}”</div>` : ''}
    `;
    drawIcon(el.querySelector('canvas'), x.method);
    el.querySelector('.del').addEventListener('click', async () => {
      if (!confirm('Tear this page out of the diary?')) return;
      try{
        await api('/api/brews/' + x.id, {method:'DELETE'});
        state.brews = state.brews.filter(y => y.id !== x.id);
        renderAll();
        toast('PAGE REMOVED');
      }catch(err){ toast('DELETE FAILED: ' + err.message.toUpperCase(), true); }
    });
    wrap.appendChild(el);
  }
}

function renderBeans(){
  const opts = beanUniverse().map(b => `<option value="${escapeHtml(b)}">`);
  $('#bean-list').innerHTML = opts.join('');
}

/* diary filter tabs */
$$('.log-tabs button').forEach(b => b.addEventListener('click', () => {
  const f = b.dataset.filter;
  if (f === 'bean'){
    showBeanFilter();
    return;
  }
  state.logFilter = f; state.beanFilter = null;
  $$('.log-tabs button').forEach(x => x.classList.remove('active'));
  b.classList.add('active');
  renderEntries();
}));

function showBeanFilter(){
  const existing = $('#bean-filter-pop');
  if (existing){ existing.remove(); return; }
  const beans = [...new Set(state.brews.map(x => x.bean))];
  if (!beans.length){ toast('NO BEANS TO FILTER BY YET', true); return; }
  const pop = document.createElement('div');
  pop.id = 'bean-filter-pop';
  pop.style.cssText = 'margin-bottom:12px; display:flex; flex-wrap:wrap; gap:6px; padding:10px; background:var(--cream); border:2px solid var(--ink); box-shadow:3px 4px 0 rgba(56,39,24,.2); align-items:center;';
  pop.innerHTML = `<span style="font-family:'Press Start 2P',monospace; font-size:7px; color:var(--accent-deep); width:100%; margin-bottom:6px;">FILTER BY BEAN:</span>` +
    beans.map(b => `<button type="button" class="chip ${state.beanFilter===b?'selected':''}" data-b="${escapeHtml(b)}">${escapeHtml(b)}</button>`).join('') +
    `<button type="button" class="chip" data-b="__all__">CLEAR FILTER</button>`;
  const card = $('#log-tabs').closest('.card');
  card.insertBefore(pop, card.children[2]);
  pop.querySelectorAll('[data-b]').forEach(btn => btn.addEventListener('click', () => {
    state.logFilter = 'bean';
    state.beanFilter = btn.dataset.b === '__all__' ? null : btn.dataset.b;
    $$('.log-tabs button').forEach(x => x.classList.toggle('active', x.dataset.filter === 'bean'));
    pop.remove();
    renderEntries();
  }));
}

/* character music + singing (click the barista or the princess) */
addEventListener('resize', updateSceneRect);

$('#retry-btn').addEventListener('click', loadBrews);
$('#foot-year').textContent = new Date().getFullYear();

/* boot */
loadBeanLib();
setMethod('latte');
loadDraft();
loadBrews();
