/* ==========================================================================
   便利屋68 · 夜间委托  — 射击防守小游戏
   按住开火 · 打委托 / 打噪音 / 别打猫
   ========================================================================== */
(function () {
  'use strict';

  var $ = function (s) { return document.querySelector(s); };
  var cv = $('#game');
  if (!cv) return;
  var ctx = cv.getContext('2d');

  var elScore = $('#score'), elTime = $('#time'), elPat = $('#pat');
  var elFace = $('#face'), elMood = $('#mood');
  var panel = $('#panel'), startBtn = $('#startBtn');
  var pTitle = $('#pTitle'), pSub = $('#pSub'), pK = $('#pK'), pStats = $('#pStats');
  var rScore = $('#rScore'), rCombo = $('#rCombo'), rAcc = $('#rAcc');

  var W = 0, H = 0, DPR = 1;
  var BEST_KEY = 'kayoko.shoot.best';

  /* 只读写本地浏览器，不连任何接口；隐私模式下也不崩 */
  var store = {
    get: function (k, d) {
      try {
        var v = window.localStorage.getItem(k);
        return v === null ? d : v;
      } catch (e) { return d; }
    },
    set: function (k, v) {
      try { window.localStorage.setItem(k, String(v)); } catch (e) {}
    }
  };

  function pad2(n) { return (n < 10 ? '0' : '') + n; }

  /* ---------------- 资源（全部相对路径，随页面一起部署） ---------------- */
  var STAND = [
    'assets/wiki/kayoko-00.png',
    'assets/wiki/kayoko-newyear-00.png',
    'assets/wiki/kayoko-dress-00.png'
  ];
  var SPRITES = [];
  STAND.forEach(function (u) { var im = new Image(); im.src = u; SPRITES.push(im); });

  // 按情绪分组的表情（尽量把四套服装都用上）
  var FACE_DIR = 'assets/opt/face/';
  var FACE = {
    calm: ['kayoko-00', 'kayoko-01', 'kayoko-02', 'kayoko-dress-00', 'kayoko-dress-01', 'kayoko-newyear-00', 'kayoko-operator-00', 'kayoko-operator-01'],
    mid: ['kayoko-03', 'kayoko-04', 'kayoko-05', 'kayoko-dress-03', 'kayoko-dress-04', 'kayoko-newyear-03', 'kayoko-operator-03', 'kayoko-operator-04'],
    low: ['kayoko-99', 'kayoko-dress-99', 'kayoko-newyear-99', 'kayoko-operator-99', 'kayoko-06', 'kayoko-07'],
    happy: ['kayoko-01', 'kayoko-newyear-01', 'kayoko-operator-01', 'kayoko-dress-01']
  };
  var FACE_IMG = {};
  Object.keys(FACE).forEach(function (k) {
    FACE_IMG[k] = FACE[k].map(function (n) {
      var im = new Image();
      im.src = FACE_DIR + n + '.webp';
      return im;
    });
  });

  var BGS = [];
  ['art-6831356', 'art-6778629', 'art-6836915', 'art-6718892', 'art-6756957', 'art-6781341'].forEach(function (n) {
    var im = new Image();
    im.src = 'assets/opt/art/' + n + '.webp';
    BGS.push(im);
  });

  // 背景预渲染（低分辨率放大 = 天然模糊，省性能）
  var bgCanvas = document.createElement('canvas');
  var bgCtx = bgCanvas.getContext('2d');
  var bgKey = -1;
  function updateBgCache() {
    var idx = G.bgIdx % BGS.length;
    if (bgKey === idx) return;
    var im = BGS[idx];
    if (!im || !im.complete || !im.naturalWidth) return;
    bgKey = idx;
    var cw = 220, ch = Math.max(120, Math.round(220 * H / Math.max(W, 1)));
    bgCanvas.width = cw;
    bgCanvas.height = ch;
    var sc = Math.max(cw / im.naturalWidth, ch / im.naturalHeight) * 1.25;
    var iw = im.naturalWidth * sc, ih = im.naturalHeight * sc;
    bgCtx.clearRect(0, 0, cw, ch);
    bgCtx.drawImage(im, (cw - iw) / 2, (ch - ih) / 2, iw, ih);
  }

  /* ---------------- 状态 ---------------- */
  var G = {
    state: 'idle',
    score: 0,
    patience: 100,
    time: 60,
    combo: 0,
    maxCombo: 0,
    shots: 0,
    hits: 0,
    skin: 0,
    mood: 'calm',
    t: 0,
    firedAt: 0,
    firing: false,
    pointer: { x: 0, y: 0 },
    enemies: [],
    bullets: [],
    parts: [],
    floats: [],
    spawnAt: 0,
    recoil: 0,
    hurt: 0,
    bgIdx: 0,
    bgTimer: 0,
    startedAt: 0
  };

  /* ---------------- 尺寸 ---------------- */
  var DUST = [];
  for (var di = 0; di < 34; di++) {
    DUST.push({
      x: Math.random() * 1200,
      y: Math.random() * 900,
      r: Math.random() * 1.6 + 0.4,
      s: Math.random() * 0.25 + 0.05,
      a: Math.random() * 0.35 + 0.1,
      c: Math.random() < 0.3 ? '#ffb3d1' : '#cfc4e4'
    });
  }

  function resize() {
    DPR = Math.min(2, window.devicePixelRatio || 1);
    W = window.innerWidth;
    H = window.innerHeight;
    cv.width = Math.floor(W * DPR);
    cv.height = Math.floor(H * DPR);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    if (!G.pointer.x) { G.pointer.x = W / 2; G.pointer.y = H * 0.42; }
  }
  resize();
  window.addEventListener('resize', resize);

  /* ---------------- 音效 ---------------- */
  var ac = null;
  function audio() {
    if (!ac) {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (AC) ac = new AC();
    }
    if (ac && ac.state === 'suspended') ac.resume();
    return ac;
  }
  function tone(f, type, vol, dur, slide) {
    var a = audio();
    if (!a) return;
    var t = a.currentTime;
    var o = a.createOscillator(), g = a.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(f * slide, t + dur * 0.5);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(a.destination);
    o.start(t); o.stop(t + dur + 0.02);
  }
  function sfxShot() { tone(720 + Math.random() * 60, 'square', 0.028, 0.06, 0.55); }
  function sfxHitGood() { tone(520, 'triangle', 0.075, 0.13, 1.5); }
  function sfxHitBad() { tone(150, 'sawtooth', 0.11, 0.26, 0.4); }
  function sfxCat() { tone(880, 'sine', 0.09, 0.2, 0.6); }

  /* ---------------- 玩家位置 ---------------- */
  function playerBox() {
    var im = SPRITES[G.skin % SPRITES.length];
    var h = Math.min(H * 0.62, W * 1.05);
    var ar = (im && im.naturalWidth) ? im.naturalWidth / im.naturalHeight : 0.353;
    var w = h * ar;
    var bottom = H - 46;
    return { x: W / 2, y: bottom, w: w, h: h, cx: W / 2, top: bottom - h };
  }

  /* ---------------- 生成 ---------------- */
  function spawn() {
    var prog = 1 - G.time / 60;
    var r = Math.random();
    var type = r < 0.5 ? 'env' : (r < 0.85 ? 'noise' : 'cat');
    var pad = 46;
    G.enemies.push({
      type: type,
      x: pad + Math.random() * (W - pad * 2),
      y: -60,
      vy: (96 + prog * 140) * (0.85 + Math.random() * 0.4),
      vx: (Math.random() - 0.5) * 26,
      r: type === 'cat' ? 27 : 24,
      rot: (Math.random() - 0.5) * 0.6,
      vr: (Math.random() - 0.5) * 1.3,
      alive: true
    });
  }

  /* ---------------- 开火 ---------------- */
  function fire(now) {
    if (now - G.firedAt < 95) return;
    G.firedAt = now;
    G.shots++;
    sfxShot();
    G.recoil = 1;

    var pb = playerBox();
    var mx = pb.x + pb.w * 0.16;
    var my = pb.top + pb.h * 0.34;

    G.bullets.push({ x: mx, y: my, tx: G.pointer.x, ty: G.pointer.y, life: 1 });

    // 命中判定：准星范围内最近的一个
    var best = null, bestD = Infinity;
    for (var i = 0; i < G.enemies.length; i++) {
      var e = G.enemies[i];
      if (!e.alive) continue;
      var dx = e.x - G.pointer.x, dy = e.y - G.pointer.y;
      var d2 = dx * dx + dy * dy;
      if (d2 < (e.r + 44) * (e.r + 44) && d2 < bestD) { bestD = d2; best = e; }
    }

    if (best) {
      var bi = G.enemies.indexOf(best);
      if (bi >= 0) G.enemies.splice(bi, 1);
      best.alive = false;
      G.hits++;
      G.combo++;
      if (G.combo > G.maxCombo) G.maxCombo = G.combo;

      if (best.type === 'noise') {
        G.score += 8;
        burst(best.x, best.y, '#ff2f5e', 14);
        float(best.x, best.y, '+8');
        sfxHitGood();
      } else if (best.type === 'env') {
        var add = 10 + Math.min(20, Math.floor(G.combo / 3) * 2);
        G.score += add;
        burst(best.x, best.y, '#ffd9a0', 12);
        float(best.x, best.y, '+' + add);
        sfxHitGood();
      } else {
        G.score = Math.max(0, G.score - 15);
        G.patience = Math.max(0, G.patience - 10);
        G.combo = 0;
        burst(best.x, best.y, '#a6f2ff', 12);
        float(best.x, best.y, '-15', true);
        sfxCat();
        G.hurt = 1;
        shakeFace();
      }
    } else {
      G.combo = 0;
    }

    updateHUD();
  }

  function burst(x, y, color, n) {
    for (var i = 0; i < n; i++) {
      var a = Math.random() * Math.PI * 2, sp = Math.random() * 4.4 + 1;
      G.parts.push({
        x: x, y: y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 0.6,
        life: 1, r: Math.random() * 2.4 + 1, color: color
      });
    }
  }
  function float(x, y, text, bad) {
    G.floats.push({ x: x, y: y, text: text, life: 1, bad: !!bad });
  }

  /* ---------------- HUD ---------------- */
  function moodOf(p) {
    if (p > 70) return 'calm';
    if (p > 40) return 'mid';
    return 'low';
  }
  var MOOD_TEXT = {
    calm: ['……嗯。', '交给我。', '安静点。'],
    mid: ['……有点吵。', '别打猫。', '看清楚再开枪。'],
    low: ['噪音太多了。', '……我要生气了。', '再来一次就换你。']
  };

  var lastHud = { score: -1, time: -1, pat: -1, mood: '' };
  function updateHUD() {
    if (G.score !== lastHud.score) { elScore.textContent = G.score; lastHud.score = G.score; }
    var t = Math.max(0, Math.ceil(G.time));
    if (t !== lastHud.time) {
      elTime.textContent = t;
      elTime.classList.toggle('low', t <= 10);
      lastHud.time = t;
    }
    var p = Math.round(G.patience);
    if (p !== lastHud.pat) {
      elPat.style.width = Math.max(0, p) + '%';
      elPat.classList.toggle('low', p <= 40);
      lastHud.pat = p;
    }
    var m = moodOf(G.patience);
    if (m !== lastHud.mood) {
      lastHud.mood = m;
      G.mood = m;
      var arr = FACE_IMG[m];
      var pick = arr[(Math.random() * arr.length) | 0];
      if (pick) elFace.src = pick.src;
      var txt = MOOD_TEXT[m];
      elMood.textContent = txt[(Math.random() * txt.length) | 0];
    }
  }

  function shakeFace() {
    elFace.classList.remove('hurt');
    void elFace.offsetWidth;
    elFace.classList.add('hurt');
  }

  /* ---------------- 绘制 ---------------- */
  function drawBg() {
    var g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#0d0814');
    g.addColorStop(0.55, '#0a0610');
    g.addColorStop(1, '#06040a');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    // 背景插画（低分辨率预渲染，放大后自带柔化）
    updateBgCache();
    if (bgCanvas.width) {
      var zoom = 1 + Math.sin(G.t * 0.00012) * 0.02;
      ctx.globalAlpha = 0.2;
      var bw2 = W * zoom, bh2 = H * zoom;
      ctx.drawImage(bgCanvas, (W - bw2) / 2, (H - bh2) / 2, bw2, bh2);
      ctx.globalAlpha = 1;
    }

    // 压暗，让前景立绘跳出来
    ctx.fillStyle = 'rgba(8,5,13,.26)';
    ctx.fillRect(0, 0, W, H);

    // 顶部渐隐，避免敌人穿过 HUD 时互相打架
    var tg2 = ctx.createLinearGradient(0, 0, 0, 150);
    tg2.addColorStop(0, 'rgba(6,4,10,.92)');
    tg2.addColorStop(0.6, 'rgba(6,4,10,.45)');
    tg2.addColorStop(1, 'rgba(6,4,10,0)');
    ctx.fillStyle = tg2;
    ctx.fillRect(0, 0, W, 150);

    // 漂浮尘埃
    for (var s = 0; s < DUST.length; s++) {
      var d = DUST[s];
      d.y -= d.s;
      if (d.y < -10) { d.y = H + 10; d.x = Math.random() * W; }
      ctx.globalAlpha = d.a * (0.5 + 0.5 * Math.sin(G.t * 0.001 + s));
      ctx.fillStyle = d.c;
      ctx.beginPath();
      ctx.arc(d.x, d.y, d.r, 0, 6.3);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // 暗角
    var vg = ctx.createRadialGradient(W / 2, H * 0.45, Math.min(W, H) * 0.2, W / 2, H * 0.5, Math.max(W, H) * 0.78);
    vg.addColorStop(0, 'rgba(6,4,10,0)');
    vg.addColorStop(1, 'rgba(6,4,10,.88)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, W, H);

    // 立绘背后的柔光，把人物从背景里托出来
    var pb0 = playerBox();
    var halo = ctx.createRadialGradient(pb0.x, pb0.top + pb0.h * 0.42, 20, pb0.x, pb0.top + pb0.h * 0.42, pb0.w * 2.4);
    halo.addColorStop(0, 'rgba(255,110,170,.20)');
    halo.addColorStop(0.55, 'rgba(140,90,220,.10)');
    halo.addColorStop(1, 'rgba(10,6,18,0)');
    ctx.fillStyle = halo;
    ctx.fillRect(0, 0, W, H);

    // 地面光
    var gy = H - 2;
    var gg = ctx.createLinearGradient(0, gy - 120, 0, gy);
    gg.addColorStop(0, 'rgba(255,92,157,0)');
    gg.addColorStop(1, 'rgba(255,92,157,.22)');
    ctx.fillStyle = gg;
    ctx.fillRect(0, gy - 120, W, 120);
  }

  function drawEnemy(e) {
    ctx.save();
    ctx.translate(e.x, e.y);
    ctx.rotate(e.rot);

    if (e.type === 'env') {
      ctx.shadowColor = 'rgba(255,217,160,.8)';
      ctx.shadowBlur = 14;
      ctx.fillStyle = '#f7e6c8';
      roundRect(-22, -16, 44, 32, 6);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = '#c9a86a';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(-22, -16); ctx.lineTo(0, 2); ctx.lineTo(22, -16);
      ctx.stroke();
      ctx.fillStyle = 'rgba(201,168,106,.25)';
      roundRect(-10, 4, 20, 9, 2);
      ctx.fill();
    } else if (e.type === 'noise') {
      var pulse = 1 + Math.sin(G.t * 0.012) * 0.08;
      for (var k = 0; k < 3; k++) {
        ctx.globalAlpha = 0.75 - k * 0.2;
        ctx.strokeStyle = '#ff2f5e';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, 0, (18 + k * 9) * pulse, 0, 6.3);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      ctx.shadowColor = 'rgba(255,47,94,.95)';
      ctx.shadowBlur = 18;
      ctx.fillStyle = '#3a0b1a';
      ctx.beginPath(); ctx.arc(0, 0, 15, 0, 6.3); ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#ff2f5e';
      ctx.font = '700 17px "Segoe UI",sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('!', 0, 1);
    } else {
      // 猫
      ctx.shadowColor = 'rgba(166,242,255,.9)';
      ctx.shadowBlur = 16;
      ctx.fillStyle = '#f4eefb';
      ctx.beginPath();
      ctx.ellipse(0, 4, 17, 14, 0, 0, 6.3);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(-15, -6); ctx.lineTo(-9, -22); ctx.lineTo(-2, -8); ctx.closePath(); ctx.fill();
      ctx.beginPath();
      ctx.moveTo(15, -6); ctx.lineTo(9, -22); ctx.lineTo(2, -8); ctx.closePath(); ctx.fill();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = '#f4eefb';
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(14, 9);
      ctx.quadraticCurveTo(26, 12, 22, -4);
      ctx.stroke();
      ctx.fillStyle = '#3ad6ff';
      ctx.beginPath(); ctx.ellipse(-6, 2, 2.4, 3.4, 0, 0, 6.3); ctx.fill();
      ctx.beginPath(); ctx.ellipse(6, 2, 2.4, 3.4, 0, 0, 6.3); ctx.fill();
    }

    ctx.restore();
  }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  var recoilOffset = 0;
  function drawPlayer() {
    var pb = playerBox();
    var im = SPRITES[G.skin % SPRITES.length];
    if (!im || !im.complete || !im.naturalWidth) return;

    var shakeY = G.hurt > 0 ? Math.sin(G.t * 0.06) * 4 * G.hurt : 0;
    var lift = recoilOffset * 3;
    var breathe = Math.sin(G.t * 0.0017) * 2.2;

    ctx.save();
    ctx.globalAlpha = 0.28;
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.ellipse(pb.x, H - 6, pb.w * 0.55, 16, 0, 0, 6.3);
    ctx.fill();
    ctx.globalAlpha = 1;

    ctx.drawImage(im, pb.x - pb.w / 2, pb.top + shakeY - lift + breathe, pb.w, pb.h);

    // 光晕
    var lg = ctx.createRadialGradient(pb.x, pb.top + pb.h * 0.35, 10, pb.x, pb.top + pb.h * 0.35, pb.w * 1.1);
    lg.addColorStop(0, 'rgba(255,92,157,.14)');
    lg.addColorStop(1, 'rgba(255,92,157,0)');
    ctx.fillStyle = lg;
    ctx.fillRect(0, 0, W, H);

    ctx.restore();
  }

  function drawCross() {
    var x = G.pointer.x, y = G.pointer.y;
    var r = 44;
    var t = G.t;

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(t * 0.0004);

    // 五边形光环
    ctx.strokeStyle = 'rgba(255,179,209,.85)';
    ctx.lineWidth = 1.6;
    ctx.shadowColor = 'rgba(255,92,157,.9)';
    ctx.shadowBlur = 12;
    ctx.beginPath();
    for (var i = 0; i < 5; i++) {
      var a = (i / 5) * Math.PI * 2 - Math.PI / 2;
      var px = Math.cos(a) * r, py = Math.sin(a) * r;
      i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
    }
    ctx.closePath();
    ctx.stroke();
    ctx.shadowBlur = 0;

    ctx.strokeStyle = 'rgba(255,255,255,.5)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-r - 8, 0); ctx.lineTo(-r + 8, 0);
    ctx.moveTo(r - 8, 0); ctx.lineTo(r + 8, 0);
    ctx.moveTo(0, -r - 8); ctx.lineTo(0, -r + 8);
    ctx.moveTo(0, r - 8); ctx.lineTo(0, r + 8);
    ctx.stroke();

    ctx.fillStyle = 'rgba(255,92,157,.95)';
    ctx.beginPath(); ctx.arc(0, 0, 2.4, 0, 6.3); ctx.fill();
    ctx.restore();
  }

  function drawBullets() {
    for (var i = 0; i < G.bullets.length; i++) {
      var b = G.bullets[i];
      var k = 1 - b.life;
      var x = b.x + (b.tx - b.x) * k;
      var y = b.y + (b.ty - b.y) * k;
      ctx.globalAlpha = Math.max(0, b.life) * 0.95;
      ctx.strokeStyle = '#ffb3d1';
      ctx.lineWidth = 2;
      ctx.shadowColor = '#ff5c9d';
      ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + (b.tx - b.x) * 0.04, y + (b.ty - b.y) * 0.04);
      ctx.stroke();
      ctx.shadowBlur = 0;
    }
    ctx.globalAlpha = 1;
  }

  function drawParts() {
    for (var i = 0; i < G.parts.length; i++) {
      var p = G.parts[i];
      ctx.globalAlpha = Math.max(0, p.life);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r * p.life, 0, 6.3);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function drawFloats() {
    ctx.textAlign = 'center';
    ctx.font = '700 15px "PingFang SC","Microsoft YaHei",sans-serif';
    for (var i = 0; i < G.floats.length; i++) {
      var f = G.floats[i];
      ctx.globalAlpha = Math.max(0, f.life);
      ctx.fillStyle = f.bad ? '#ff8fa8' : '#ffe3ef';
      ctx.fillText(f.text, f.x, f.y);
    }
    ctx.globalAlpha = 1;
  }

  function render() {
    drawBg();

    var i;
    for (i = 0; i < G.enemies.length; i++) drawEnemy(G.enemies[i]);

    drawPlayer();
    drawBullets();
    drawParts();
    drawFloats();

    if (G.state === 'playing') drawCross();
    else if (G.state === 'idle') drawCross();

    // 受伤红闪
    if (G.hurt > 0.01) {
      ctx.fillStyle = 'rgba(255,47,94,' + (G.hurt * 0.22).toFixed(3) + ')';
      ctx.fillRect(0, 0, W, H);
    }
  }

  /* ---------------- 主循环 ---------------- */
  var last = 0;
  function loop(ts) {
    if (!last) last = ts;
    var dt = Math.min(0.05, (ts - last) / 1000);
    last = ts;
    G.t = ts;

    if (G.state === 'playing') {
      // 计时（用真实时间差，切后台也不会跑偏）
      G.time = Math.max(0, 60 - (performance.now() - G.startedAt) / 1000);
      if (G.time <= 0) { endGame(); }

      // 生成
      G.spawnAt -= dt * 1000;
      if (G.spawnAt <= 0) {
        spawn();
        var prog = 1 - G.time / 60;
        G.spawnAt = Math.max(250, 470 - prog * 210) * (0.8 + Math.random() * 0.4);
      }

      // 敌人
      var pbTop = playerBox().top;
      for (var i = G.enemies.length - 1; i >= 0; i--) {
        var e = G.enemies[i];
        e.y += e.vy * dt;
        e.x += e.vx * dt;
        e.rot += e.vr * dt;
        if (e.x < 30 || e.x > W - 30) e.vx *= -1;
        if (e.y > pbTop + 26) {
          G.enemies.splice(i, 1);
          if (e.type === 'noise') {
            G.patience = Math.max(0, G.patience - 15);
            G.hurt = 1;
            shakeFace();
            sfxHitBad();
            float(e.x, pbTop - 10, '-15 耐心', true);
            if (G.patience <= 0) { endGame(); }
          }
          updateHUD();
        }
      }

      // 开火
      if (G.firing) fire(performance.now());

      // 粒子/飘字
      for (var p = G.parts.length - 1; p >= 0; p--) {
        var pt = G.parts[p];
        pt.x += pt.vx * dt * 60;
        pt.y += pt.vy * dt * 60;
        pt.vy += 0.07 * dt * 60;
        pt.life -= dt * 1.7;
        if (pt.life <= 0) G.parts.splice(p, 1);
      }
      for (var f = G.floats.length - 1; f >= 0; f--) {
        var fl = G.floats[f];
        fl.y -= dt * 42;
        fl.life -= dt * 1.2;
        if (fl.life <= 0) G.floats.splice(f, 1);
      }

      // 子弹
      for (var b = G.bullets.length - 1; b >= 0; b--) {
        G.bullets[b].life -= dt * 7;
        if (G.bullets[b].life <= 0) G.bullets.splice(b, 1);
      }

      // 换装（每 400 分）
      var wantSkin = Math.floor(G.score / 400) % SPRITES.length;
      if (wantSkin !== G.skin) G.skin = wantSkin;

      // 背景轮换
      G.bgTimer += dt;
      if (G.bgTimer > 9) { G.bgTimer = 0; G.bgIdx = (G.bgIdx + 1) % BGS.length; }
    }

    if (G.recoil > 0) G.recoil = Math.max(0, G.recoil - dt * 8);
    recoilOffset = G.recoil;
    if (G.hurt > 0) G.hurt = Math.max(0, G.hurt - dt * 2.4);

    updateHUD();
    render();
    requestAnimationFrame(loop);
  }

  /* ---------------- 输入 ---------------- */
  function setPointer(e) {
    G.pointer.x = e.clientX;
    G.pointer.y = e.clientY - (document.body.classList.contains('touch') ? 34 : 0);
  }

  window.addEventListener('pointermove', function (e) {
    setPointer(e);
  }, { passive: true });

  window.addEventListener('pointerdown', function (e) {
    if (e.target.closest && e.target.closest('button,a,.panel')) return;
    audio();
    setPointer(e);
    if (G.state === 'idle' || G.state === 'over') { startGame(); return; }
    G.firing = true;
    G.firedAt = 0;
  });

  window.addEventListener('pointerup', function () { G.firing = false; });
  window.addEventListener('pointercancel', function () { G.firing = false; });
  window.addEventListener('blur', function () { G.firing = false; });

  window.addEventListener('keydown', function (e) {
    if (e.code === 'Space') {
      e.preventDefault();
      audio();
      if (G.state === 'idle' || G.state === 'over') { startGame(); return; }
      G.firing = true;
      fire(performance.now());
    }
  });
  window.addEventListener('keyup', function (e) {
    if (e.code === 'Space') G.firing = false;
  });

  /* ---------------- 流程 ---------------- */
  function reset() {
    G.score = 0; G.patience = 100; G.time = 60; G.combo = 0; G.maxCombo = 0;
    G.shots = 0; G.hits = 0; G.skin = 0; G.mood = 'calm';
    G.enemies = []; G.bullets = []; G.parts = []; G.floats = [];
    G.spawnAt = 400; G.firing = false; G.recoil = 0; G.hurt = 0;
    G.bgTimer = 0; G.bgIdx = 0;
    lastHud = { score: -1, time: -1, pat: -1, mood: '' };
    updateHUD();
  }

  function startGame() {
    reset();
    G.state = 'playing';
    G.startedAt = performance.now();
    panel.classList.add('hide');
    positionPointerDefault();
    // 开场先铺几个
    spawn(); spawn();
    G.spawnAt = 380;
  }

  function positionPointerDefault() {
    if (!G.pointer.x) { G.pointer.x = W / 2; }
    if (!G.pointer.y) { G.pointer.y = H * 0.4; }
  }

  function endGame() {
    if (G.state !== 'playing') return;
    G.state = 'over';
    G.firing = false;

    var acc = G.shots ? Math.round((G.hits / G.shots) * 100) : 0;
    var best = parseInt(store.get(BEST_KEY, '0'), 10) || 0;
    if (G.score > best) { best = G.score; store.set(BEST_KEY, best); }

    var rank = G.score >= 700 ? 'S' : G.score >= 450 ? 'A' : G.score >= 250 ? 'B' : 'C';
    pK.textContent = 'RESULT · ' + rank;
    pTitle.textContent = G.patience <= 0 ? '耐心耗尽' : '委托结束';
    pSub.textContent = G.patience <= 0
      ? '「……太吵了。我要回去了。」'
      : G.score >= 450 ? '「收工。剩下的明天再说。」' : '「……还差一点。」';

    rScore.textContent = G.score;
    rCombo.textContent = G.maxCombo;
    rAcc.textContent = acc + '%';
    pStats.hidden = false;
    startBtn.textContent = '再来一次';
    panel.classList.remove('hide');
  }

  startBtn.addEventListener('click', function (e) {
    e.stopPropagation();
    startGame();
  });

  /* ---------------- 启动 ---------------- */
  if (matchMedia('(hover:none)').matches) document.body.classList.add('touch');
  var b0 = parseInt(store.get(BEST_KEY, '0'), 10) || 0;
  if (b0) $('.p-tip').textContent = '最高分 ' + b0;
  updateHUD();
  requestAnimationFrame(loop);

  window.__shoot = { G: G, start: startGame, end: endGame, fire: function () { fire(performance.now()); } };
})();
