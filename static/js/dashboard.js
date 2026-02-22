// ── GLOBALS ──────────────────────────────────────────────────
let statsData = {};
let allMissions = [];
let currentMissionFilter = 'upcoming';
let cashChartInst, heatChartInst, missionChartInst;
let cashChartFullInst, heatChartFullInst, missionChartFullInst;

// ── STREAK SYSTEM ─────────────────────────────────────────────
let missionStreak = parseInt(localStorage.getItem('lsStreak') || '0');
const STREAK_BONUSES = { 3: 5000, 5: 15000, 7: 30000, 10: 75000 };
const STREAK_NAMES   = { 3: '🔥 ON A ROLL', 5: '⚡ HOT STREAK', 7: '💀 UNSTOPPABLE', 10: '👑 LEGEND MODE' };

// ── SOUND ENGINE ─────────────────────────────────────────────
let audioCtx = null;

function getAudio() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  return audioCtx;
}

function playTone(freq, type = 'sine', duration = 0.1, vol = 0.07) {
  try {
    const ctx  = getAudio();
    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    osc.type = type; osc.frequency.value = freq;
    gain.gain.setValueAtTime(vol, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    osc.start(); osc.stop(ctx.currentTime + duration);
  } catch(e) {}
}

function playClick()   { playTone(880, 'square', 0.06, 0.05); }
function playSuccess() {
  playTone(523, 'sine', 0.1, 0.09);
  setTimeout(() => playTone(659, 'sine', 0.1, 0.09), 110);
  setTimeout(() => playTone(784, 'sine', 0.15, 0.1), 220);
}
function playFail() {
  playTone(300, 'sawtooth', 0.12, 0.08);
  setTimeout(() => playTone(200, 'sawtooth', 0.15, 0.07), 140);
}
function playStreak() {
  [523, 587, 659, 698, 784, 880].forEach((f, i) => setTimeout(() => playTone(f, 'sine', 0.12, 0.1), i * 70));
}
function playHover() { playTone(1200, 'sine', 0.03, 0.025); }
function playNav()   { playTone(660, 'square', 0.05, 0.04); }

/* Whoosh sweep — for mission planner */
function playWhoosh(delay=0) {
  try {
    const ctx = getAudio();
    const buf = ctx.createBuffer(1, ctx.sampleRate * 0.4, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for(let i=0;i<data.length;i++) data[i]=(Math.random()*2-1)*Math.pow(1-i/data.length,2.5);
    const src = ctx.createBufferSource(); src.buffer = buf;
    const filter = ctx.createBiquadFilter(); filter.type='bandpass'; filter.frequency.value=3000;
    filter.frequency.linearRampToValueAtTime(600, ctx.currentTime+delay+0.4);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.001, ctx.currentTime+delay);
    gain.gain.linearRampToValueAtTime(0.28, ctx.currentTime+delay+0.04);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime+delay+0.4);
    src.connect(filter); filter.connect(gain); gain.connect(ctx.destination);
    src.start(ctx.currentTime+delay); src.stop(ctx.currentTime+delay+0.41);
  } catch(e) {}
}

/* Low dark drone — mission planning tension */
function playPlanningDrone() {
  try {
    const ctx = getAudio();
    [55, 110, 82.4].forEach((freq, i) => {
      const osc = ctx.createOscillator(); const gain = ctx.createGain();
      osc.type='sawtooth'; osc.frequency.value=freq;
      osc.connect(gain); gain.connect(ctx.destination);
      const t = ctx.currentTime;
      gain.gain.setValueAtTime(0.001, t);
      gain.gain.linearRampToValueAtTime(0.04, t+0.3+i*0.1);
      gain.gain.linearRampToValueAtTime(0.04, t+1.6);
      gain.gain.exponentialRampToValueAtTime(0.001, t+2.2);
      osc.start(t); osc.stop(t+2.3);
    });
  } catch(e) {}
}

/* Stock ticker arpeggio — analytics */
function playTickerSound() {
  const freqs = [440,494,523,587,659,698,784];
  freqs.forEach((f,i) => {
    playTone(f, 'sine', 0.08, 0.07, i*0.06);
    if(i%2===0) playTone(f*1.5,'triangle',0.05,0.03,i*0.06+0.03);
  });
}

/* Crown fanfare — empire */
function playCrownFanfare() {
  const melody=[523,659,784,1047,784,880,1047];
  melody.forEach((f,i) => {
    playTone(f,'sine',0.18,0.10,i*0.09);
    playTone(f*0.5,'triangle',0.18,0.05,i*0.09);
  });
  setTimeout(() => {
    [261,330,392,523].forEach(f => playTone(f,'sawtooth',0.3,0.06));
  }, 700);
}

/* Quick data blip */
function playDataBlip() {
  playTone(1800,'square',0.03,0.03);
  playTone(2200,'sine',0.02,0.02,0.03);
}

function initSounds() {
  document.querySelectorAll('.nav-item').forEach(el => {
    el.addEventListener('mouseenter', () => playHover());
  });
  document.querySelectorAll('.stat-card').forEach(el => {
    el.addEventListener('click', function(e) { playClick(); createRipple(e, this); });
  });
  document.querySelectorAll('.filter-btn').forEach(el => {
    el.addEventListener('mouseenter', () => playHover());
  });
  BGM.init(); // start background music system
}

// ── BACKGROUND MUSIC ENGINE ───────────────────────────────────
// Pure Web Audio synthesis — no files needed.
// Dark cinematic GTA ambient: bass + pad + sparse melody + shimmer.
// Master gain capped at 0.055 so it never drowns SFX (which peak at 0.10).
const BGM = (() => {
  let ctx        = null;
  let master     = null;
  let running    = false;
  let schedTimer = null;

  const PREF = 'lsBgMusic';
  let enabled = localStorage.getItem(PREF) !== 'off'; // default ON

  // D-minor pentatonic anchor frequencies
  const ROOT  = 73.42;                              // D2 Hz
  const SCALE = [1, 1.335, 1.498, 1.682, 2.0];     // D F G A C
  const BPM   = 72;
  const BEAT  = 60 / BPM;
  const BAR   = BEAT * 4;

  // ── tiny helpers ─────────────────────────────────────────
  function osc(freq, type, t0, t1, vol) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(0.001, t0);
    g.gain.linearRampToValueAtTime(vol, t0 + 0.06);
    g.gain.setValueAtTime(vol, t1 - 0.10);
    g.gain.linearRampToValueAtTime(0.001, t1);
    o.connect(g); g.connect(master);
    o.start(t0); o.stop(t1 + 0.02);
  }

  function hihat(t0) {
    try {
      const buf  = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * 0.05), ctx.sampleRate);
      const d    = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      const src  = ctx.createBufferSource(); src.buffer = buf;
      const hp   = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 4000;
      const g    = ctx.createGain();
      g.gain.setValueAtTime(0.003, t0);
      g.gain.linearRampToValueAtTime(0.001, t0 + 0.05);
      src.connect(hp); hp.connect(g); g.connect(master);
      src.start(t0); src.stop(t0 + 0.06);
    } catch(e) {}
  }

  // ── schedule one 4-bar phrase ─────────────────────────────
  function phrase(t) {
    // BASS — D minor groove, 16 steps
    [0,0,2,0, 1,0,3,2, 0,0,2,1, 0,2,0,3].forEach((si, i) => {
      const f = ROOT * SCALE[si % SCALE.length] * 0.5;
      osc(f,     'triangle', t + i*BEAT,       t + i*BEAT + BEAT*0.65, 0.018);
      osc(f * 2, 'sine',     t + i*BEAT,       t + i*BEAT + BEAT*0.40, 0.006);
    });

    // PAD — one chord per bar (Dm → C → Em → Bb), very soft long tones
    const chords = [
      [ROOT*2, ROOT*2*1.189, ROOT*2*1.498],     // Dm
      [ROOT*2*0.891, ROOT*2, ROOT*2*1.335],      // C
      [ROOT*2*1.122, ROOT*2*1.335, ROOT*2*1.682],// Em
      [ROOT*2*0.749, ROOT*2, ROOT*2*1.189],      // Bb
    ];
    for (let b = 0; b < 4; b++) {
      const bt = t + b * BAR;
      chords[b].forEach(f => {
        osc(f,        'sine',     bt, bt + BAR, 0.008);
        osc(f * 1.002,'triangle', bt, bt + BAR, 0.004);
      });
    }

    // MELODY ARP — sparse single notes, every 3 beats
    [2,4,3,0,4,1,3,2].forEach((si, i) => {
      if (i % 3 === 1) return; // skip some for space
      const f = ROOT * SCALE[si] * 4;
      osc(f, 'sine', t + i * BEAT * 0.75, t + i * BEAT * 0.75 + BEAT * 0.3, 0.008);
    });

    // HI-HAT — off-beat 8ths
    for (let i = 0; i < 16; i++) {
      if (i % 2 === 0) continue;
      hihat(t + i * (BEAT / 2));
    }

    // SUB KICK — one per bar, gentle
    for (let b = 0; b < 4; b++) {
      const bt = t + b * BAR;
      try {
        const k = ctx.createOscillator(), kg = ctx.createGain();
        k.type = 'sine';
        k.frequency.setValueAtTime(80, bt);
        k.frequency.exponentialRampToValueAtTime(28, bt + 0.16);
        kg.gain.setValueAtTime(0.011, bt);
        kg.gain.exponentialRampToValueAtTime(0.001, bt + 0.20);
        k.connect(kg); kg.connect(master);
        k.start(bt); k.stop(bt + 0.21);
      } catch(e) {}
    }
  }

  // ── lookahead scheduler ───────────────────────────────────
  function tick() {
    if (!running) return;
    const now      = ctx.currentTime;
    const phraseLen = BAR * 4;
    const next     = Math.ceil(now / phraseLen) * phraseLen;
    if (next < now + phraseLen + 0.2) phrase(next);
    schedTimer = setTimeout(tick, BAR * 2 * 1000);
  }

  // ── Public methods ────────────────────────────────────────
  function start() {
    if (running) return;
    if (!ctx) {
      ctx    = getAudio();
      master = ctx.createGain();
      master.gain.value = 0;
      master.connect(ctx.destination);
    }
    running = true;
    master.gain.cancelScheduledValues(ctx.currentTime);
    master.gain.setValueAtTime(0, ctx.currentTime);
    master.gain.linearRampToValueAtTime(0.055, ctx.currentTime + 3.5);
    phrase(ctx.currentTime + 0.1);
    schedTimer = setTimeout(tick, BAR * 3 * 1000);
  }

  function stop() {
    running = false;
    clearTimeout(schedTimer);
    if (master && ctx) {
      master.gain.cancelScheduledValues(ctx.currentTime);
      master.gain.setValueAtTime(master.gain.value, ctx.currentTime);
      master.gain.linearRampToValueAtTime(0, ctx.currentTime + 1.8);
    }
  }

  function _updateBtn() {
    const btn = document.getElementById('musicToggle');
    if (!btn) return;
    if (enabled) {
      btn.classList.remove('music-off');
      btn.title = 'BGM: ON — click to mute';
      btn.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>`;
    } else {
      btn.classList.add('music-off');
      btn.title = 'BGM: OFF — click to enable';
      btn.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/><line x1="1" y1="1" x2="23" y2="23" stroke="var(--red)"/></svg>`;
    }
  }

  function toggle() {
    enabled = !enabled;
    localStorage.setItem(PREF, enabled ? 'on' : 'off');
    enabled ? start() : stop();
    _updateBtn();
    playClick();
  }

  function init() {
    _updateBtn();
    // Start only after first user click (browser autoplay policy)
    function firstClick() {
      document.removeEventListener('click', firstClick);
      if (enabled) start();
    }
    document.addEventListener('click', firstClick);
  }

  return { init, toggle };
})();

function toggleBgMusic() { BGM.toggle(); }

// ── RIPPLE EFFECT ─────────────────────────────────────────────
function createRipple(e, el) {
  const rect = el.getBoundingClientRect();
  const size = Math.max(rect.width, rect.height);
  const x    = e.clientX - rect.left  - size / 2;
  const y    = e.clientY - rect.top   - size / 2;
  const rip  = document.createElement('span');
  rip.className = 'ripple';
  rip.style.cssText = `width:${size}px;height:${size}px;left:${x}px;top:${y}px`;
  el.appendChild(rip);
  setTimeout(() => rip.remove(), 600);
}

// ── BONUS PARTICLES ───────────────────────────────────────────
function spawnBonusParticle(text, color = '#00f5a0') {
  const p = document.createElement('div');
  p.className = 'bonus-particle';
  p.textContent = text;
  p.style.color = color;
  p.style.left  = (30 + Math.random() * 40) + '%';
  p.style.top   = '55%';
  document.body.appendChild(p);
  setTimeout(() => p.remove(), 1300);
}

// ── THEME TOGGLE ─────────────────────────────────────────────
function toggleTheme() {
  const body   = document.body;
  const toggle = document.getElementById('themeToggle');
  const isLight = body.classList.toggle('light-mode');
  toggle.classList.toggle('light', isLight);
  localStorage.setItem('lsTheme', isLight ? 'light' : 'dark');
  playClick();
  if (statsData && Object.keys(statsData).length) buildCharts(statsData);
}

function initTheme() {
  const saved = localStorage.getItem('lsTheme');
  // Default is ALWAYS dark unless user explicitly chose light
  const isLight = saved === 'light';
  if (!isLight) {
    // Explicitly remove light-mode and lock in dark — covers first visit,
    // cleared storage, incognito, and cross-page navigation
    document.body.classList.remove('light-mode');
    localStorage.setItem('lsTheme', 'dark');
  } else {
    document.body.classList.add('light-mode');
  }
  const t = document.getElementById('themeToggle');
  if (t) t.classList.toggle('light', isLight);
}

// ── CHART DEFAULTS ────────────────────────────────────────────
function getChartDefaults() {
  const isLight = document.body.classList.contains('light-mode');
  const gridCol = isLight ? 'rgba(0,0,0,0.07)' : 'rgba(26,48,64,0.6)';
  const tickCol = isLight ? '#6a8090' : '#4a6070';
  return {
    responsive: true, maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: {
      x: { grid: { color: gridCol }, ticks: { color: tickCol, font: { family: "'Share Tech Mono'" } } },
      y: { grid: { color: gridCol }, ticks: { color: tickCol, font: { family: "'Share Tech Mono'" } } }
    }
  };
}

// ── INTRO ANIMATIONS ─────────────────────────────────────────
function showGlobeIntro(callback) {
  const el = document.getElementById('globeIntro');
  if (!el) { callback(); return; }
  el.classList.add('show');
  setTimeout(() => {
    el.style.transition = 'opacity 0.4s ease';
    el.style.opacity = '0';
    setTimeout(() => {
      el.classList.remove('show');
      el.style.opacity = '';
      el.style.transition = '';
      callback();
    }, 420);
  }, 1650);
}

function showPodiumIntro(callback) {
  const el = document.getElementById('podiumIntro');
  if (!el) { callback(); return; }
  el.classList.add('show');
  setTimeout(() => {
    el.style.transition = 'opacity 0.4s ease';
    el.style.opacity = '0';
    setTimeout(() => {
      el.classList.remove('show');
      el.style.opacity = '';
      el.style.transition = '';
      callback();
    }, 420);
  }, 2100);
}

// ── MISSION PLANNER INTRO ─────────────────────────────────────
function showMissionIntro(callback) {
  const el = document.getElementById('missionIntro');
  if (!el) { callback(); return; }
  el.classList.add('show');

  playPlanningDrone();
  [0, 120, 240, 360, 480].forEach(d => setTimeout(() => playWhoosh(), d));

  // Crosshair lines draw in
  const hLine = document.getElementById('miH');
  const vLine = document.getElementById('miV');
  if (hLine) {
    hLine.style.transition='none'; hLine.style.width='0'; hLine.style.opacity='0';
    setTimeout(() => { hLine.style.transition='width 0.5s ease, opacity 0.3s'; hLine.style.opacity='1'; hLine.style.width='180px'; }, 80);
  }
  if (vLine) {
    vLine.style.transition='none'; vLine.style.height='0'; vLine.style.opacity='0';
    setTimeout(() => { vLine.style.transition='height 0.5s ease, opacity 0.3s'; vLine.style.opacity='1'; vLine.style.height='180px'; }, 200);
  }

  // Scan bar sweeps down
  const scan = document.getElementById('miScan');
  if (scan) {
    scan.style.transition='none'; scan.style.top='0px';
    setTimeout(() => { scan.style.transition='top 1.0s linear'; scan.style.top='180px'; }, 200);
  }

  // Target dots pop in
  document.querySelectorAll('.mi-dot').forEach((dot, i) => {
    dot.style.opacity='0'; dot.style.transform='scale(0)';
    setTimeout(() => {
      dot.style.transition='all 0.3s cubic-bezier(0.34,1.56,0.64,1)';
      dot.style.opacity='0.8'; dot.style.transform='scale(1)';
      playDataBlip();
    }, 300 + i * 80);
  });

  // Text readout lines type in
  document.querySelectorAll('.mi-text-line').forEach((t, i) => {
    t.style.opacity='0'; t.style.transform='translateX(-12px)';
    setTimeout(() => { t.style.transition='all 0.3s ease'; t.style.opacity='0.8'; t.style.transform='translateX(0)'; }, 400 + i * 140);
  });

  setTimeout(() => {
    el.style.transition = 'opacity 0.4s ease';
    el.style.opacity = '0';
    setTimeout(() => { el.classList.remove('show'); el.style.opacity=''; el.style.transition=''; callback(); }, 420);
  }, 2500);
}

// ── ANALYTICS INTRO ───────────────────────────────────────────
function showAnalyticsIntro(callback) {
  const el = document.getElementById('analyticsIntro');
  if (!el) { callback(); return; }
  el.classList.add('show');

  playTickerSound();
  setTimeout(() => playTickerSound(), 700);

  // Bars rise one by one from zero
  document.querySelectorAll('.ai-bar').forEach((b, i) => {
    b.style.height = '0px';
    const targetH = b.dataset.h || '60';
    setTimeout(() => {
      b.style.transition = 'height 0.55s cubic-bezier(0.22,1,0.36,1)';
      b.style.height = targetH + 'px';
      playDataBlip();
    }, i * 90);
  });

  // SVG trend line draws itself
  setTimeout(() => {
    const path = document.getElementById('aiPath');
    if (path) {
      const len = path.getTotalLength ? path.getTotalLength() : 380;
      path.style.strokeDasharray = len;
      path.style.strokeDashoffset = len;
      path.style.transition = 'stroke-dashoffset 0.9s cubic-bezier(0.4,0,0.2,1)';
      requestAnimationFrame(() => { path.style.strokeDashoffset = '0'; });
    }
  }, 600);

  // Label fades up
  setTimeout(() => {
    const lbl = document.getElementById('aiLabel');
    if (lbl) { lbl.style.transition='all 0.4s ease'; lbl.style.opacity='1'; lbl.style.transform='translateY(0)'; }
  }, 1200);

  setTimeout(() => {
    el.style.transition = 'opacity 0.4s ease';
    el.style.opacity = '0';
    setTimeout(() => { el.classList.remove('show'); el.style.opacity=''; el.style.transition=''; callback(); }, 420);
  }, 2300);
}

// ── EMPIRE / CROWN INTRO ──────────────────────────────────────
function showEmpireIntro(callback) {
  const el = document.getElementById('empireIntro');
  if (!el) { callback(); return; }
  el.classList.add('show');

  playCrownFanfare();

  // Crown spins in with elastic bounce
  const crown = document.getElementById('eiCrown');
  if (crown) {
    crown.style.opacity='0'; crown.style.transform='scale(0.2) rotate(-540deg)'; crown.style.transition='none';
    setTimeout(() => {
      crown.style.transition='all 0.9s cubic-bezier(0.34,1.36,0.64,1)';
      crown.style.opacity='1'; crown.style.transform='scale(1) rotate(0deg)';
    }, 80);
  }

  // Gold rays shoot out staggered
  document.querySelectorAll('.ei-ray').forEach((r, i) => {
    r.style.height='0'; r.style.opacity='0';
    setTimeout(() => {
      r.style.transition='height 0.4s ease, opacity 0.2s ease';
      r.style.height='60px'; r.style.opacity='0.7';
    }, 300 + i * 55);
  });

  // Title bursts in
  const title = document.getElementById('eiTitle');
  if (title) {
    title.style.opacity='0'; title.style.transform='scale(0.6)'; title.style.transition='none';
    setTimeout(() => {
      title.style.transition='all 0.5s cubic-bezier(0.34,1.56,0.64,1)';
      title.style.opacity='1'; title.style.transform='scale(1)';
    }, 700);
  }

  // Sparkles fly outward
  document.querySelectorAll('.ei-spark').forEach((s, i) => {
    s.style.opacity='0'; s.style.transform='scale(0) translate(0,0)';
    setTimeout(() => {
      s.style.transition='all 0.5s cubic-bezier(0.34,1.56,0.64,1)';
      s.style.opacity='1';
      s.style.transform='scale(1) translate(var(--sx), var(--sy))';
    }, 500 + i * 90);
  });

  setTimeout(() => {
    el.style.transition = 'opacity 0.4s ease';
    el.style.opacity = '0';
    setTimeout(() => { el.classList.remove('show'); el.style.opacity=''; el.style.transition=''; callback(); }, 420);
  }, 2400);
}

// ── NAVIGATION ────────────────────────────────────────────────
function showSection(id) {
  if (id === 'map-section') {
    showGlobeIntro(() => _doShowSection(id));
    return;
  }
  if (id === 'leaderboard') {
    showPodiumIntro(() => _doShowSection(id));
    return;
  }
  if (id === 'missions') {
    showMissionIntro(() => _doShowSection(id));
    return;
  }
  if (id === 'analytics') {
    showAnalyticsIntro(() => _doShowSection(id));
    return;
  }
  if (id === 'empire') {
    showEmpireIntro(() => _doShowSection(id));
    return;
  }
  _doShowSection(id);
}

function _doShowSection(id) {
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));

  const el = document.getElementById(id);
  if (el) el.classList.add('active');

  const titles = {
    'overview':    'COMMAND OVERVIEW',
    'map-section': 'TERRITORY MAP',
    'missions':    'MISSION PLANNER',
    'analytics':   'ANALYTICS HQ',
    'empire':      'EMPIRE STATUS',
    'leaderboard': 'LEADERBOARD',
    'replay':      'ACTIVITY REPLAY'
  };
  document.getElementById('pageTitle').textContent = titles[id] || id.toUpperCase().replace('-', ' ');

  document.querySelectorAll('.nav-item').forEach(n => {
    if (n.getAttribute('onclick')?.includes(id)) n.classList.add('active');
  });

  playNav();

  if (id === 'missions')    loadMissions();
  if (id === 'analytics')   buildFullCharts();
  if (id === 'replay')      loadReplay();
  if (id === 'leaderboard') loadLeaderboard();
  if (id === 'map-section') {
    setTimeout(() => {
      if (window.mapInstance) window.mapInstance.invalidateSize();
      else if (typeof initMap === 'function') initMap();
    }, 150);
  }
}

// ── TIME ──────────────────────────────────────────────────────
function updateTime() {
  const now = new Date();
  document.getElementById('pageTime').textContent =
    '// ' + now.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) +
    ' — ' + now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) + ' //';
}
setInterval(updateTime, 1000);
updateTime();

// ── REALISTIC DATA GENERATORS ─────────────────────────────────
function generateRealisticCashHistory(current) {
  // No real history yet — return just the current value as a single point
  // so charts show an honest flat line at 0 → current
  if (current === 0) return [
    { amount: 0, timestamp: new Date(Date.now() - 3600000).toISOString() },
    { amount: 0, timestamp: new Date().toISOString() }
  ];
  return [
    { amount: 0, timestamp: new Date(Date.now() - 3600000).toISOString() },
    { amount: current, timestamp: new Date().toISOString() }
  ];
}

function generateRealisticHeatHistory(current) {
  // No real history yet — return just the current heat value
  if (current === 0) return [
    { heat: 0, timestamp: new Date(Date.now() - 3600000).toISOString() },
    { heat: 0, timestamp: new Date().toISOString() }
  ];
  return [
    { heat: 0, timestamp: new Date(Date.now() - 3600000).toISOString() },
    { heat: current, timestamp: new Date().toISOString() }
  ];
}

// ── LOAD DASHBOARD ────────────────────────────────────────────
async function loadDashboard() {
  try {
    const res = await fetch('/api/dashboard', { credentials: 'include' });
    if (res.status === 401) { window.location.href = '/login'; return; }
    if (!res.ok) return;
    const data = await res.json();

    // Enrich with realistic data if server returns empty history
    if (!data.cash_history || data.cash_history.length < 2) {
      data.cash_history = generateRealisticCashHistory(data.cash || 0);
    }
    if (!data.heat_history || data.heat_history.length < 2) {
      data.heat_history = generateRealisticHeatHistory(data.heat || 0);
    }

    statsData = data;
    renderStats(data);
  } catch(e) { console.error('Dashboard load error:', e); }
}

function renderStats(d) {
  const username = sessionStorage.getItem('username') || 'OPERATOR';
  document.getElementById('sidebarUsername').textContent = username.toUpperCase();
  document.getElementById('sidebarTier').textContent     = d.empire_tier || 'Street Hustler';
  document.getElementById('userAvatar').textContent      = (username[0] || '?').toUpperCase();

  animCounter(document.getElementById('statCash'), d.cash || 0, '$');
  document.getElementById('statTier').textContent = d.empire_tier || 'Street Hustler';
  animCounter(document.getElementById('statOps'), d.active_operations || 0);

  const heat = d.heat || 0;
  document.getElementById('statHeatVal').textContent = heat;
  const heatBar = document.getElementById('heatBar');
  heatBar.style.width      = heat + '%';
  heatBar.style.background = heat < 30 ? '#00f5a0' : heat < 60 ? '#ffd700' : '#ff2d55';

  animCounter(document.getElementById('statTerritory'), d.territory || 10, '', '%');

  const stars = Math.ceil(heat / 20);
  document.querySelectorAll('.star').forEach((s, i) => s.classList.toggle('active', i < stars));

  const status = (d.status || 'At Large').toUpperCase();
  const badge  = document.getElementById('statusBadge');
  badge.textContent = status;
  badge.className   = 'status-badge ' + (status === 'AT LARGE' ? 'badge-green' : 'badge-red');

  document.getElementById('lastLocation').textContent = d.last_location || 'Grove Street';
  animCounter(document.getElementById('missionsDone'), d.missions_completed || 0);
  animCounter(document.getElementById('missionsFailed'), d.missions_failed || 0);

  const total = (d.missions_completed || 0) + (d.missions_failed || 0);
  document.getElementById('successRate').textContent = total > 0
    ? Math.round((d.missions_completed / total) * 100) + '%' : '—';

  document.getElementById('empireTierName').textContent = (d.empire_tier || 'Street Hustler').toUpperCase();
  updateTierBar(d.cash || 0);
  buildCharts(d);
}

function updateTierBar(cash) {
  let min = 0, max = 10000, progress = 0;
  if (cash >= 100000)     { min = 100000; max = Infinity; progress = 100; }
  else if (cash >= 10000) { min = 10000;  max = 100000;  progress = ((cash - 10000) / 90000) * 100; }
  else                    { progress = (cash / 10000) * 100; }
  document.getElementById('tierBar').style.width = Math.min(100, progress) + '%';
  document.getElementById('tierMin').textContent = '$' + min.toLocaleString();
  document.getElementById('tierMax').textContent = cash >= 100000 ? 'LEGEND' : '$' + max.toLocaleString();
}

// ── ANIMATED COUNTER ─────────────────────────────────────────
function animCounter(el, target, prefix = '', suffix = '') {
  if (!el) return;
  const current = parseInt(el.textContent.replace(/[^0-9]/g, '')) || 0;
  const diff    = target - current;
  if (diff === 0) { el.textContent = prefix + target.toLocaleString() + suffix; return; }
  const steps = 30, step = diff / steps;
  let count = 0;
  const t = setInterval(() => {
    count++;
    el.textContent = prefix + Math.round(current + step * count).toLocaleString() + suffix;
    if (count >= steps) { clearInterval(t); el.textContent = prefix + target.toLocaleString() + suffix; }
  }, 20);
}

// ── CHARTS ───────────────────────────────────────────────────
function fmtChartLabel(ts) {
  const d = new Date(ts);
  return (d.getMonth() + 1) + '/' + d.getDate() + ' ' + String(d.getHours()).padStart(2,'0') + 'h';
}

function buildCharts(d) {
  const cashHist   = (d.cash_history || []).slice(-14);
  const heatHist   = (d.heat_history || []).slice(-14);
  const cashLabels = cashHist.map(h => fmtChartLabel(h.timestamp));
  const cashVals   = cashHist.map(h => h.amount || 0);
  const heatLabels = heatHist.map(h => fmtChartLabel(h.timestamp));
  const heatVals   = heatHist.map(h => h.heat   || 0);

  const cashCtx = document.getElementById('cashChart');
  if (cashCtx) {
    if (cashChartInst) cashChartInst.destroy();
    cashChartInst = new Chart(cashCtx, {
      type: 'line',
      data: { labels: cashLabels, datasets: [{ data: cashVals, borderColor:'#00f5a0', backgroundColor:'rgba(0,245,160,0.08)', fill:true, tension:0.4, pointRadius:3, pointBackgroundColor:'#00f5a0' }] },
      options: { ...getChartDefaults() }
    });
  }

  const heatCtx = document.getElementById('heatChart');
  if (heatCtx) {
    if (heatChartInst) heatChartInst.destroy();
    heatChartInst = new Chart(heatCtx, {
      type: 'line',
      data: { labels: heatLabels, datasets: [{ data: heatVals, borderColor:'#ff2d55', backgroundColor:'rgba(255,45,85,0.08)', fill:true, tension:0.4, pointRadius:3, pointBackgroundColor:'#ff2d55' }] },
      options: { ...getChartDefaults() }
    });
  }

  const missionCtx = document.getElementById('missionChart');
  if (missionCtx) {
    if (missionChartInst) missionChartInst.destroy();
    missionChartInst = new Chart(missionCtx, {
      type: 'doughnut',
      data: { labels:['Completed','Failed','Active'], datasets:[{ data:[d.missions_completed||1, d.missions_failed||0, d.active_operations||0], backgroundColor:['#00f5a0','#ff2d55','#ffd700'], borderWidth:0 }] },
      options: { responsive:true, maintainAspectRatio:false, plugins:{ legend:{ display:true, position:'bottom', labels:{ color:'#4a6070', font:{ family:"'Share Tech Mono'" }, padding:8, boxWidth:12 } } } }
    });
  }
}

function buildFullCharts() {
  const d = statsData;
  if (!d) return;
  const cashHist   = d.cash_history || [];
  const heatHist   = d.heat_history || [];
  const cashLabels = cashHist.map(h => fmtChartLabel(h.timestamp));
  const cashVals   = cashHist.map(h => h.amount || 0);
  const heatLabels = heatHist.map(h => fmtChartLabel(h.timestamp));
  const heatVals   = heatHist.map(h => h.heat   || 0);

  const cashFullCtx = document.getElementById('cashChartFull');
  if (cashFullCtx) {
    if (cashChartFullInst) cashChartFullInst.destroy();
    cashChartFullInst = new Chart(cashFullCtx, {
      type: 'line',
      data: { labels: cashLabels, datasets:[{ label:'Cash ($)', data:cashVals, borderColor:'#00f5a0', backgroundColor:'rgba(0,245,160,0.06)', fill:true, tension:0.4, pointRadius:4, pointBackgroundColor:'#00f5a0' }] },
      options: { ...getChartDefaults(), plugins:{ legend:{ display:true, labels:{ color:'#4a6070' } } } }
    });
  }

  const heatFullCtx = document.getElementById('heatChartFull');
  if (heatFullCtx) {
    if (heatChartFullInst) heatChartFullInst.destroy();
    heatChartFullInst = new Chart(heatFullCtx, {
      type: 'bar',
      data: { labels: heatLabels, datasets:[{ label:'Heat', data:heatVals, backgroundColor:'rgba(255,45,85,0.5)', borderColor:'#ff2d55', borderWidth:1 }] },
      options: { ...getChartDefaults() }
    });
  }

  const missionFullCtx = document.getElementById('missionChartFull');
  if (missionFullCtx) {
    if (missionChartFullInst) missionChartFullInst.destroy();
    missionChartFullInst = new Chart(missionFullCtx, {
      type: 'doughnut',
      data: { labels:['Completed','Failed','Active'], datasets:[{ data:[d.missions_completed||1, d.missions_failed||0, d.active_operations||0], backgroundColor:['#00f5a0','#ff2d55','#ffd700'], borderWidth:0 }] },
      options: { responsive:true, maintainAspectRatio:false, plugins:{ legend:{ display:true, position:'bottom', labels:{ color:'#4a6070', font:{ family:"'Share Tech Mono'" }, padding:10 } } } }
    });
  }
}

// ── MISSIONS ─────────────────────────────────────────────────
async function loadMissions() {
  try {
    const res = await fetch('/api/missions', { credentials: 'include' });
    if (!res.ok) return;
    allMissions = await res.json();
    renderMissions(currentMissionFilter);
  } catch(e) { console.error(e); }
}

function renderMissions(filter) {
  currentMissionFilter = filter;
  const list     = document.getElementById('missionList');
  const filtered = allMissions.filter(m => m.status === filter);

  if (filtered.length === 0) {
    list.innerHTML = `<div class="empty-state">// NO ${filter.toUpperCase()} MISSIONS //</div>`;
    return;
  }

  const riskColor = { Low: '#00f5a0', Medium: '#ffd700', High: '#ff2d55' };

  list.innerHTML = filtered.map(m => {
    const isHard    = m.risk === 'High';
    const hardLabel = isHard
      ? `<span style="background:rgba(255,45,85,0.12);color:#ff2d55;border:1px solid #ff2d55;font-family:'Share Tech Mono',monospace;font-size:0.55rem;padding:2px 6px;letter-spacing:0.1em;margin-left:6px">HARD</span>`
      : '';
    return `
    <div class="mission-item">
      <div style="flex:1">
        <div class="mission-name">${escHtml(m.name)}${hardLabel}</div>
        <div class="mission-meta">
          ${escHtml(m.type)} &nbsp;·&nbsp;
          <span style="color:${riskColor[m.risk] || '#c8d8e0'}">${escHtml(m.risk)} RISK</span>
          &nbsp;·&nbsp; ${escHtml(m.location)}
        </div>
        <div class="mission-meta" style="margin-top:2px">${formatDate(m.start_time)} → ${formatDate(m.end_time)}</div>
      </div>
      <div class="mission-right">
        <div class="mission-reward">$${(m.reward || 0).toLocaleString()}</div>
        ${filter === 'upcoming' || filter === 'ongoing' ? `
          <button class="complete-btn" onclick="completeMission('${m._id}', true)">✓ DONE</button>
          <button class="fail-btn"     onclick="completeMission('${m._id}', false)">✗ FAIL</button>
        ` : ''}
        ${filter === 'completed' ? `<span class="status-badge badge-green">DONE</span>` : ''}
        ${filter === 'failed'    ? `<span class="status-badge badge-red">FAILED</span>`  : ''}
      </div>
    </div>`;
  }).join('');
}

function escHtml(str) {
  const div = document.createElement('div');
  div.appendChild(document.createTextNode(str || ''));
  return div.innerHTML;
}

function formatDate(dt) {
  if (!dt) return '—';
  try { return new Date(dt).toLocaleString('en-US', { month:'short', day:'numeric', hour:'2-digit', minute:'2-digit' }); }
  catch { return dt; }
}

function filterMissions(filter, el) {
  document.querySelectorAll('.mission-tab').forEach(t => t.classList.remove('active'));
  if (el) el.classList.add('active');
  playClick();
  renderMissions(filter);
}

async function submitMission() {
  const name       = document.getElementById('mName').value.trim();
  const type       = document.getElementById('mType').value;
  const risk       = document.getElementById('mRisk').value;
  const location   = document.getElementById('mLocation').value.trim();
  const reward     = document.getElementById('mReward').value;
  const start_time = document.getElementById('mStart').value;
  const end_time   = document.getElementById('mEnd').value;
  const heatEl     = document.getElementById('heatPredict');

  if (!name || !location || !reward || !start_time || !end_time) {
    playFail();
    heatEl.textContent = '⚠ FILL ALL MISSION FIELDS BEFORE DEPLOYING';
    heatEl.style.display = 'block'; heatEl.style.color = '#ff2d55'; heatEl.style.borderColor = 'rgba(255,45,85,0.3)';
    return;
  }
  if (new Date(end_time) <= new Date(start_time)) {
    playFail();
    heatEl.textContent = '⚠ END TIME MUST BE AFTER START TIME';
    heatEl.style.display = 'block'; heatEl.style.color = '#ff2d55'; heatEl.style.borderColor = 'rgba(255,45,85,0.3)';
    return;
  }

  playClick();

  try {
    const res = await fetch('/api/missions', {
      method:'POST', headers:{'Content-Type':'application/json'}, credentials:'include',
      body: JSON.stringify({ name, type, risk, location, reward: parseInt(reward), start_time, end_time })
    });

    if (res.ok) {
      const data = await res.json();
      playSuccess();
      spawnBonusParticle('✓ MISSION DEPLOYED', '#00f5a0');

      document.getElementById('mName').value = '';
      document.getElementById('mLocation').value = '';
      document.getElementById('mReward').value = '';
      document.getElementById('mStart').value = '';
      document.getElementById('mEnd').value = '';

      if (data.overlap_warning) {
        heatEl.textContent = '⚠ OVERLAP DETECTED: Multiple HIGH RISK missions active — Heat will spike faster!';
        heatEl.style.display = 'block'; heatEl.style.color = '#ff2d55'; heatEl.style.borderColor = 'rgba(255,45,85,0.3)';
      } else {
        heatEl.style.display = 'none';
      }

      await loadMissions(); await loadDashboard();
      document.querySelectorAll('.mission-tab').forEach((t, i) => t.classList.toggle('active', i === 0));
      renderMissions('upcoming');
    } else {
      playFail();
      const err = await res.json();
      heatEl.textContent = '⚠ ' + (err.error || 'FAILED TO CREATE MISSION').toUpperCase();
      heatEl.style.display = 'block'; heatEl.style.color = '#ff2d55';
    }
  } catch(e) {
    playFail();
    heatEl.textContent = '⚠ CONNECTION ERROR — RETRY';
    heatEl.style.display = 'block'; heatEl.style.color = '#ff2d55';
  }
}

async function completeMission(id, success) {
  try {
    const mission = allMissions.find(m => m._id === id);
    const isHard  = mission && mission.risk === 'High';
    const prevCash = statsData.cash || 0;
    const prevTier = statsData.empire_tier || 'Street Hustler';

    const res = await fetch(`/api/missions/${id}/complete`, {
      method:'POST', headers:{'Content-Type':'application/json'}, credentials:'include',
      body: JSON.stringify({ success })
    });

    if (res.ok) {
      const result = await res.json();

      if (success) {
        missionStreak++;
        localStorage.setItem('lsStreak', missionStreak);

        const earned = (result.new_cash || 0) - prevCash;

        /* Reload dashboard data first so we have new tier */
        await loadMissions();
        await loadDashboard();

        /* Show the epic mission complete + level-up overlay */
        const newTier = statsData.empire_tier || prevTier;
        showMissionCompleteOverlay({
          earned,
          prevCash,
          newCash: result.new_cash || 0,
          prevTier,
          newTier,
          missionName: mission ? mission.name : 'MISSION',
          isHard,
        });

        checkAndShowStreak(result);

      } else {
        playFail();
        missionStreak = 0;
        localStorage.setItem('lsStreak', 0);
        showStatusToast(`✗ MISSION FAILED — HEAT: ${result.new_heat}`, '#ff2d55');
        await loadMissions();
        await loadDashboard();
      }
    }
  } catch(e) { console.error(e); }
}

/* ── TIER HELPERS ── */
const TIERS = [
  { name: 'Street Hustler', icon: '🔫', min: 0,      max: 10000  },
  { name: 'Kingpin',        icon: '💼', min: 10000,   max: 100000 },
  { name: 'Los Santos Legend', icon: '👑', min: 100000, max: Infinity },
];
function getTierInfo(cash) {
  return TIERS.find(t => cash >= t.min && cash < t.max) || TIERS[TIERS.length - 1];
}
function getTierProgress(cash) {
  const tier = getTierInfo(cash);
  if (tier.max === Infinity) return { pct: 100, min: tier.min, max: '∞', mid: '' };
  const pct = Math.min(100, ((cash - tier.min) / (tier.max - tier.min)) * 100);
  return {
    pct,
    min: '$' + tier.min.toLocaleString(),
    max: '$' + tier.max.toLocaleString(),
    mid: '$' + Math.round((tier.min + tier.max) / 2).toLocaleString()
  };
}

/* ── MISSION COMPLETE OVERLAY ── */
function showMissionCompleteOverlay({ earned, prevCash, newCash, prevTier, newTier, missionName, isHard }) {
  const overlay = document.getElementById('missionCompleteSplash');
  if (!overlay) { return; }

  const tierChanged = prevTier !== newTier;

  /* Set text content */
  document.getElementById('mcTitle').innerHTML = 'MISSION<br><span>COMPLETE</span>';
  document.getElementById('mcSubtitle').textContent = `// ${missionName.toUpperCase()} — OBJECTIVE ACCOMPLISHED //`;
  document.getElementById('mcReward').textContent = '+$' + earned.toLocaleString() + ' EARNED' + (isHard ? ' ⚡ HARD BONUS' : '');

  /* Level bar setup */
  const prevProgress = getTierProgress(prevCash);
  const newProgress  = getTierProgress(newCash);
  const prevTierInfo = getTierInfo(prevCash);
  const newTierInfo  = getTierInfo(newCash);

  document.getElementById('mcLevelFrom').textContent = prevTier.toUpperCase();
  document.getElementById('mcLevelTo').textContent   = newTier.toUpperCase();

  document.getElementById('mcTickMin').textContent = tierChanged ? prevProgress.min : newProgress.min;
  document.getElementById('mcTickMid').textContent = newProgress.mid;
  document.getElementById('mcTickMax').textContent = newProgress.max === '$∞' ? 'LEGEND' : newProgress.max;

  const barFill = document.getElementById('mcBarFill');
  barFill.style.transition = 'none';
  barFill.style.width = tierChanged ? prevProgress.pct + '%' : prevProgress.pct + '%';

  /* Hide new tier initially */
  const newTierEl = document.getElementById('mcNewTier');
  newTierEl.classList.remove('show');
  if (tierChanged) {
    document.getElementById('mcTierName').textContent = newTier.toUpperCase();
    document.getElementById('mcTierIcon').textContent = newTierInfo.icon;
  }

  /* Sounds */
  playMissionCompleteSound();

  /* Show overlay */
  overlay.classList.add('show');

  /* Spawn confetti */
  spawnConfetti();

  /* Animate the bar filling */
  setTimeout(() => {
    barFill.style.transition = 'width 1.4s cubic-bezier(0.4,0,0.2,1)';
    if (tierChanged) {
      /* Animate to 100% (completing old tier) then reset to new level */
      barFill.style.width = '100%';
      setTimeout(() => {
        /* Flash white — tier up! */
        barFill.style.background = '#fff';
        barFill.style.boxShadow  = '0 0 30px #fff, 0 0 60px rgba(0,245,160,0.8)';
        playLevelUpSound();
        spawnConfetti(true); /* extra big burst */

        /* Update labels to new tier range */
        setTimeout(() => {
          const freshProgress = getTierProgress(newCash);
          document.getElementById('mcTickMin').textContent = freshProgress.min;
          document.getElementById('mcTickMid').textContent = freshProgress.mid;
          document.getElementById('mcTickMax').textContent = freshProgress.max === '$∞' ? 'LEGEND' : freshProgress.max;

          barFill.style.transition = 'none';
          barFill.style.width = '0%';
          barFill.style.background = '';
          barFill.style.boxShadow  = '';

          setTimeout(() => {
            barFill.style.transition = 'width 1.0s cubic-bezier(0.4,0,0.2,1)';
            barFill.style.width = freshProgress.pct + '%';
          }, 80);

          /* Show new tier badge */
          setTimeout(() => {
            newTierEl.classList.add('show');
          }, 600);
        }, 350);
      }, 1450);
    } else {
      /* Same tier — just fill to new position */
      barFill.style.width = newProgress.pct + '%';
      playDataBlipSound();
    }
  }, 900);

  /* Auto-dismiss after 6s */
  const autoDismiss = setTimeout(() => dismissMissionComplete(), 6500);

  /* Click to dismiss */
  overlay.onclick = () => {
    clearTimeout(autoDismiss);
    dismissMissionComplete();
  };
}

function dismissMissionComplete() {
  const overlay = document.getElementById('missionCompleteSplash');
  if (!overlay) return;
  overlay.style.transition = 'opacity 0.4s ease';
  overlay.style.opacity = '0';
  setTimeout(() => {
    overlay.classList.remove('show');
    overlay.style.opacity = '';
    overlay.style.transition = '';
  }, 420);
}

/* ── LEVEL UP SOUND ── */
function playLevelUpSound() {
  try {
    const ctx = getAudio();
    /* Ascending fanfare */
    const melody = [330, 392, 494, 523, 659, 784, 1047];
    melody.forEach((f, i) => {
      playTone(f,   'sine',     0.25, 0.12, i * 0.08);
      playTone(f*2, 'triangle', 0.15, 0.05, i * 0.08 + 0.02);
    });
    /* Big chord at the end */
    setTimeout(() => {
      [261, 330, 392, 523, 659].forEach(f => playTone(f, 'sine', 0.5, 0.10));
      [261, 330, 392].forEach(f => playTone(f, 'sawtooth', 0.3, 0.04));
    }, 600);
    /* Shimmer top notes */
    [1047, 1175, 1319, 1568].forEach((f, i) => playTone(f, 'sine', 0.2, 0.06, 0.65 + i * 0.06));
  } catch(e) {}
}

/* ── MISSION COMPLETE SOUND ── */
function playMissionCompleteSound() {
  /* Stinger: military snare + success chord */
  try {
    const ctx = getAudio();
    /* Snare crack */
    const buf = ctx.createBuffer(1, ctx.sampleRate * 0.18, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random()*2-1) * Math.pow(1-i/d.length,1.5);
    const src = ctx.createBufferSource(); src.buffer = buf;
    const hp = ctx.createBiquadFilter(); hp.type='highpass'; hp.frequency.value=1500;
    const g  = ctx.createGain();
    g.gain.setValueAtTime(0.001, ctx.currentTime);
    g.gain.linearRampToValueAtTime(0.35, ctx.currentTime + 0.008);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.18);
    src.connect(hp); hp.connect(g); g.connect(ctx.destination);
    src.start(); src.stop(ctx.currentTime + 0.2);
  } catch(e) {}
  /* Success melody */
  const notes = [523, 659, 784, 1047];
  notes.forEach((f, i) => {
    playTone(f, 'sine', 0.2, 0.12, 0.05 + i * 0.1);
    playTone(f*0.5, 'triangle', 0.15, 0.05, 0.05 + i * 0.1);
  });
}

function playDataBlipSound() {
  playTone(1200, 'sine',   0.08, 0.06);
  playTone(1600, 'square', 0.05, 0.04, 0.06);
}

/* ── CONFETTI SPARKS ── */
function spawnConfetti(big = false) {
  const colors = ['#00f5a0','#ffd700','#ff2d55','#00b4ff','#ffffff'];
  const count  = big ? 60 : 28;
  for (let i = 0; i < count; i++) {
    const el = document.createElement('div');
    el.className = 'mc-spark';
    const angle  = Math.random() * Math.PI * 2;
    const dist   = (big ? 200 : 120) + Math.random() * (big ? 300 : 160);
    el.style.cssText = `
      left:${40 + Math.random()*20}%;
      top:${30 + Math.random()*20}%;
      background:${colors[Math.floor(Math.random()*colors.length)]};
      --sx:${Math.cos(angle)*dist}px;
      --sy:${Math.sin(angle)*dist}px;
      --sr:${Math.random()*720 - 360}deg;
      animation-duration:${0.8 + Math.random()*0.8}s;
      animation-delay:${Math.random()*0.2}s;
      width:${big ? 8 : 5}px; height:${big ? 8 : 5}px;
    `;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 1600);
  }
}

// ── STREAK SYSTEM ─────────────────────────────────────────────
function checkAndShowStreak(result) {
  if (!STREAK_BONUSES[missionStreak]) return;

  const bonus   = STREAK_BONUSES[missionStreak];
  const name    = STREAK_NAMES[missionStreak] || '🔥 STREAK';
  const banner  = document.getElementById('streakBanner');
  const msgEl   = document.getElementById('streakMsg');
  const countEl = document.getElementById('streakCount');
  if (!banner) return;

  playStreak();
  msgEl.textContent   = `${name} — +$${bonus.toLocaleString()} STREAK BONUS`;
  countEl.textContent = `${missionStreak} SUCCESSFUL MISSIONS IN A ROW`;
  banner.style.display = 'block';

  setTimeout(() => spawnBonusParticle(name, '#ffd700'), 300);
  setTimeout(() => spawnBonusParticle(`+$${bonus.toLocaleString()} BONUS`, '#ffd700'), 600);

  clearTimeout(banner._timer);
  banner._timer = setTimeout(() => { banner.style.display = 'none'; }, 6000);
}

function showStatusToast(msg, color = '#00f5a0') {
  let toast = document.getElementById('statusToast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'statusToast';
    toast.style.cssText = `
      position:fixed; top:20px; right:20px; z-index:9999;
      font-family:'Share Tech Mono',monospace; font-size:0.75rem;
      letter-spacing:0.1em; padding:12px 20px;
      border:1px solid; max-width:380px;
      animation:toastIn 0.3s ease;
    `;
    const style = document.createElement('style');
    style.textContent = '@keyframes toastIn{from{opacity:0;transform:translateX(20px)}to{opacity:1;transform:translateX(0)}}';
    document.head.appendChild(style);
    document.body.appendChild(toast);
  }
  toast.textContent     = msg;
  toast.style.color     = color;
  toast.style.borderColor = color;
  toast.style.background = `${color}15`;
  toast.style.display   = 'block';
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => { toast.style.display = 'none'; }, 4000);
}

// ── HEAT PREDICTION ──────────────────────────────────────────
async function predictHeat() {
  const risk   = document.getElementById('mRisk').value;
  const reward = parseInt(document.getElementById('mReward').value) || 10000;
  const active = statsData.active_operations || 0;

  playClick();

  try {
    const res = await fetch('/api/predict-heat', {
      method:'POST', headers:{'Content-Type':'application/json'}, credentials:'include',
      body: JSON.stringify({ risk, reward, active_operations: active })
    });
    const data  = await res.json();
    const pred  = data.predicted_heat_increase;
    const current = statsData.heat || 0;
    const after   = Math.min(100, current + pred);
    const color   = after >= 60 ? '#ff2d55' : after >= 30 ? '#ffd700' : '#00f5a0';
    const el      = document.getElementById('heatPredict');
    el.innerHTML = `🔥 PREDICTED HEAT: <span style="color:${color}">+${pred}</span> &nbsp;|&nbsp; CURRENT: ${current} → AFTER: <span style="color:${color}">${after}</span>`;
    el.style.display = 'block'; el.style.color = '#ffd700'; el.style.borderColor = 'rgba(255,215,0,0.2)';
  } catch(e) { /* silent */ }
}

// ── LOGOUT ────────────────────────────────────────────────────
async function doLogout() {
  playClick();
  await fetch('/api/auth/logout', { method:'POST', credentials:'include' });
  window.location.href = '/';
}

// ── INIT ──────────────────────────────────────────────────────
async function init() {
  initTheme();

  try {
    const me = await fetch('/api/auth/me', { credentials: 'include' });
    if (me.ok) {
      const user = await me.json();
      sessionStorage.setItem('username', user.username);
      document.getElementById('sidebarUsername').textContent = user.username.toUpperCase();
      document.getElementById('userAvatar').textContent = (user.username[0] || '?').toUpperCase();
    } else {
      window.location.href = '/login';
      return;
    }
  } catch(e) { console.error('Auth error:', e); }

  await loadDashboard();
  setInterval(loadDashboard, 30000);

  setTimeout(initSounds, 400);

  // ── HASH-BASED DEEP LINKING ──
  // Allows feature cards on the landing page to open a specific section directly
  const VALID_SECTIONS = ['overview','map-section','missions','analytics','empire','leaderboard','replay'];
  function routeFromHash() {
    const hash = window.location.hash.replace('#', '').trim();
    if (hash && VALID_SECTIONS.includes(hash)) {
      // Small delay so dashboard data has loaded before the intro animation plays
      setTimeout(() => showSection(hash), 300);
    }
  }
  routeFromHash();
  window.addEventListener('hashchange', routeFromHash);
}

init();

// ── ACTIVITY REPLAY ──────────────────────────────────────────
let replayData  = [];
let replayIndex = 0;
let replayTimer = null;
let replayChartInst = null;

async function loadReplay() {
  try {
    const res = await fetch('/api/replay', { credentials: 'include' });
    if (!res.ok) return;
    replayData  = await res.json();
    replayIndex = replayData.length > 0 ? replayData.length - 1 : 0;
    renderReplayTimeline(replayIndex);
    buildReplayChart(replayIndex);
  } catch(e) { console.error(e); }
}

function buildReplayChart(upTo) {
  const slice  = replayData.slice(0, upTo + 1);
  const labels = slice.map((_, i) => `#${i + 1}`);
  const cash   = slice.map(e => e.cash || 0);
  const heat   = slice.map(e => e.heat || 0);

  if (replayChartInst) replayChartInst.destroy();
  const ctx = document.getElementById('replayChart');
  if (!ctx) return;

  replayChartInst = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        { label:'Cash ($)', data:cash, borderColor:'#00f5a0', backgroundColor:'rgba(0,245,160,0.08)', fill:true, tension:0.4, yAxisID:'y'  },
        { label:'Heat',     data:heat, borderColor:'#ff2d55', backgroundColor:'rgba(255,45,85,0.08)', fill:true, tension:0.4, yAxisID:'y1' }
      ]
    },
    options: {
      responsive:true, maintainAspectRatio:false,
      plugins:{ legend:{ display:true, labels:{ color:'#4a6070', font:{ family:"'Share Tech Mono'" } } } },
      scales:{
        x:  { grid:{ color:'rgba(26,48,64,0.6)' }, ticks:{ color:'#4a6070' } },
        y:  { position:'left',  grid:{ color:'rgba(26,48,64,0.6)' }, ticks:{ color:'#00f5a0' }, title:{ display:true, text:'Cash', color:'#00f5a0' } },
        y1: { position:'right', grid:{ drawOnChartArea:false }, ticks:{ color:'#ff2d55' }, title:{ display:true, text:'Heat', color:'#ff2d55' }, min:0, max:100 }
      }
    }
  });
}

function renderReplayTimeline(upTo) {
  const el = document.getElementById('replayTimeline');
  if (!el) return;

  if (replayData.length === 0) {
    el.innerHTML = '<div style="font-family:\'Share Tech Mono\',monospace;font-size:0.75rem;color:#4a6070;text-align:center;padding:20px">// NO ACTIVITY LOGGED YET //</div>';
    return;
  }

  el.innerHTML = replayData.slice(0, upTo + 1).slice().reverse().map((e, i) => {
    const isActive = i === 0;
    const color    = e.event === 'completed' ? '#00f5a0' : e.event === 'failed' ? '#ff2d55' : '#ffd700';
    return `<div style="display:flex;align-items:center;gap:12px;padding:10px 4px;border-bottom:1px solid #1a3040;${isActive ? 'background:rgba(0,245,160,0.04)' : ''}">
      <div style="width:8px;height:8px;border-radius:50%;background:${color};flex-shrink:0;box-shadow:0 0 6px ${color}"></div>
      <div style="flex:1">
        <div style="font-size:0.85rem;color:#c8d8e0;font-weight:600">${escHtml(e.label || '')}</div>
        <div style="font-family:'Share Tech Mono',monospace;font-size:0.6rem;color:#4a6070;margin-top:2px">
          ${new Date(e.timestamp).toLocaleString()} &nbsp;|&nbsp; 💰 $${(e.cash || 0).toLocaleString()} &nbsp;|&nbsp; 🔥 ${e.heat || 0}%
        </div>
      </div>
    </div>`;
  }).join('');
}

function replayPlay()  {
  if (replayTimer) return;
  if (replayData.length === 0) return;
  if (replayIndex >= replayData.length - 1) replayIndex = 0;
  playClick();
  replayTimer = setInterval(() => {
    replayIndex++;
    buildReplayChart(replayIndex);
    renderReplayTimeline(replayIndex);
    if (replayIndex >= replayData.length - 1) replayPause();
  }, 800);
}

function replayPause() { clearInterval(replayTimer); replayTimer = null; playClick(); }
function replayReset() { replayPause(); replayIndex = 0; buildReplayChart(0); renderReplayTimeline(0); playClick(); }

// ── LEADERBOARD ───────────────────────────────────────────────
async function loadLeaderboard() {
  try {
    const res = await fetch('/api/leaderboard', { credentials: 'include' });
    const data = res.ok ? (await res.json()) : [];
    renderLeaderboardHTML(data);
  } catch(e) { renderLeaderboardHTML([]); }
}

function renderLeaderboardHTML(data) {
  const el = document.getElementById('leaderboardList');
  if (!el) return;

  if (data.length === 0) {
    el.innerHTML = '<div style="font-family:\'Share Tech Mono\',monospace;font-size:0.75rem;color:#4a6070;text-align:center;padding:30px">// NO OPERATORS RANKED YET //</div>';
    return;
  }

  el.innerHTML = data.map((p, i) => {
    const medal   = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`;
    const tierCol = p.empire_tier === 'Los Santos Legend' ? '#00b4ff' : p.empire_tier === 'Kingpin' ? '#ffd700' : '#00f5a0';

    // Top-3 medal box class
    const medalClass = i === 0 ? 'lb-gold' : i === 1 ? 'lb-silver' : i === 2 ? 'lb-bronze' : '';
    // You highlight
    const youStyle = p.is_me ? 'border-left:3px solid #00f5a0 !important;' : (medalClass ? '' : 'border-left:3px solid #1a3040;');
    // Stagger animation delay
    const delay = `animation-delay:${i * 0.07}s`;
    const nameColor = p.is_me ? '#00f5a0' : (i === 0 ? '#ffd700' : i === 1 ? '#c0c0c0' : i === 2 ? '#cd7f32' : '#c8d8e0');

    return `<div class="${medalClass}" style="${youStyle}display:flex;align-items:center;gap:16px;padding:14px 20px;margin-bottom:8px;border-radius:2px;transition:transform 0.2s,box-shadow 0.2s;opacity:0;animation:lbRowIn 0.45s cubic-bezier(0.22,1,0.36,1) both;${delay}" onmouseenter="this.style.transform='translateX(5px)';this.style.boxShadow='0 4px 20px rgba(0,0,0,0.3)'" onmouseleave="this.style.transform='';this.style.boxShadow=''">
      <div style="font-family:'Bebas Neue',sans-serif;font-size:1.5rem;width:44px;text-align:center;flex-shrink:0">${medal}</div>
      <div style="flex:1;min-width:0">
        <div style="font-weight:700;font-size:1rem;color:${nameColor};white-space:nowrap;overflow:hidden;text-overflow:ellipsis">
          ${escHtml(p.username.toUpperCase())}${p.is_me ? ' <span style="font-size:0.65rem;opacity:0.7">(YOU)</span>' : ''}
        </div>
        <div style="font-family:'Share Tech Mono',monospace;font-size:0.65rem;color:${tierCol}">${escHtml(p.empire_tier)}</div>
      </div>
      <div style="text-align:right;flex-shrink:0">
        <div style="font-family:'Bebas Neue',sans-serif;font-size:1.2rem;color:${i < 3 ? nameColor : '#00f5a0'}">$${(p.cash || 0).toLocaleString()}</div>
        <div style="font-family:'Share Tech Mono',monospace;font-size:0.6rem;color:#4a6070">${p.missions_completed} missions · ${p.territory}% turf</div>
      </div>
    </div>`;
  }).join('');

  // Inject keyframe if not present
  if (!document.getElementById('lbRowInStyle')) {
    const s = document.createElement('style');
    s.id = 'lbRowInStyle';
    s.textContent = '@keyframes lbRowIn{from{opacity:0;transform:translateX(-24px)}to{opacity:1;transform:translateX(0)}}';
    document.head.appendChild(s);
  }
}