import { useState, useEffect, useRef } from "react";

// ============ CONSTANTS ============
const W = 800;
const H = 420;
const GROUND_Y = 340;
const PLAYER_X = 120;
const PLAYER_W = 36;
const PLAYER_H = 52;
const GRAVITY = 0.75;
const JUMP_V = -15;
const FINISH_DISTANCE = 600;
const DISTANCE_PER_FRAME = 0.15;

const DIFFICULTY = {
  easy:   { baseSpeed: 5.5, speedGrow: 0.0008, spawnMin: 80,  spawnMax: 140, snackChance: 0.55, label: "Easy" },
  normal: { baseSpeed: 7,   speedGrow: 0.0012, spawnMin: 60,  spawnMax: 115, snackChance: 0.45, label: "Normal" },
  hard:   { baseSpeed: 8.5, speedGrow: 0.0018, spawnMin: 48,  spawnMax: 95,  snackChance: 0.35, label: "Hard" },
};

const OBSTACLES_BEACH = {
  tidepool:  { w: 72, h: 14, hitPad: 4 },
  crab:      { w: 32, h: 26, hitPad: 2 },
  driftwood: { w: 90, h: 22, hitPad: 4 },
  seaweed:   { w: 42, h: 38, hitPad: 4 },
};

const OBSTACLES_MINE = {
  rockpile: { w: 60, h: 32, hitPad: 4 },
  beam:     { w: 96, h: 16, hitPad: 4 },
  cart:     { w: 52, h: 42, hitPad: 3 },
  crystal:  { w: 46, h: 40, hitPad: 4 },
};

const OBSTACLES_DOCKS = {
  rope:    { w: 52, h: 16, hitPad: 4 },
  crate:   { w: 42, h: 44, hitPad: 3 },
  netpile: { w: 80, h: 16, hitPad: 4 },
  bollard: { w: 30, h: 36, hitPad: 2 },
};

// ============ AUDIO ============
let audioCtx = null;
function ensureAudio() {
  if (!audioCtx) {
    try {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    } catch (e) { audioCtx = null; }
  }
  if (audioCtx && audioCtx.state === "suspended") audioCtx.resume();
}
function playSound(type) {
  if (!audioCtx) return;
  try {
    const t = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain); gain.connect(audioCtx.destination);
    if (type === "jump") {
      osc.frequency.setValueAtTime(440, t);
      osc.frequency.linearRampToValueAtTime(720, t + 0.14);
      gain.gain.setValueAtTime(0.14, t);
      gain.gain.linearRampToValueAtTime(0, t + 0.18);
      osc.start(t); osc.stop(t + 0.2);
    } else if (type === "hit") {
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(220, t);
      osc.frequency.linearRampToValueAtTime(70, t + 0.35);
      gain.gain.setValueAtTime(0.22, t);
      gain.gain.linearRampToValueAtTime(0, t + 0.4);
      osc.start(t); osc.stop(t + 0.42);
    } else if (type === "snack") {
      osc.frequency.setValueAtTime(880, t);
      osc.frequency.linearRampToValueAtTime(1320, t + 0.08);
      gain.gain.setValueAtTime(0.12, t);
      gain.gain.linearRampToValueAtTime(0, t + 0.12);
      osc.start(t); osc.stop(t + 0.14);
    } else if (type === "win") {
      [523, 659, 784, 1046].forEach((f, i) => {
        const o = audioCtx.createOscillator();
        const g = audioCtx.createGain();
        o.connect(g); g.connect(audioCtx.destination);
        o.frequency.value = f;
        g.gain.setValueAtTime(0.15, t + i * 0.12);
        g.gain.linearRampToValueAtTime(0, t + i * 0.12 + 0.25);
        o.start(t + i * 0.12); o.stop(t + i * 0.12 + 0.3);
      });
      return;
    } else if (type === "lose") {
      osc.type = "triangle";
      osc.frequency.setValueAtTime(330, t);
      osc.frequency.linearRampToValueAtTime(110, t + 0.6);
      gain.gain.setValueAtTime(0.2, t);
      gain.gain.linearRampToValueAtTime(0, t + 0.7);
      osc.start(t); osc.stop(t + 0.72);
    }
  } catch (e) {}
}

// ============ HELPERS ============
function seedStars(n) {
  const arr = [];
  for (let i = 0; i < n; i++) {
    arr.push({
      x: Math.random() * W,
      y: Math.random() * 180,
      base: 0.3 + Math.random() * 0.7,
      phase: Math.random() * Math.PI * 2,
      size: Math.random() < 0.2 ? 2 : 1,
    });
  }
  return arr;
}
function intersects(p, o) {
  const pad = o.hitPad || 4;
  const ax = PLAYER_X + 6, ay = p.y + 4;
  const aw = PLAYER_W - 12, ah = PLAYER_H - 6;
  const bx = o.x + pad, by = o.y + pad;
  const bw = o.w - pad * 2, bh = o.h - pad * 2;
  return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
}
function spawnParticles(s, x, y, color, count) {
  for (let i = 0; i < count; i++) {
    s.particles.push({
      x, y,
      vx: (Math.random() - 0.5) * 6,
      vy: (Math.random() - 1.2) * 5,
      life: 28, maxLife: 28,
      color,
      size: 2 + Math.random() * 2,
    });
  }
}

// ============ DRAWING ============
function drawLighthouse(ctx, x, y, scale, frame) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  // Rocks
  ctx.fillStyle = "#2a2218";
  ctx.beginPath();
  ctx.moveTo(-32, 122);
  ctx.lineTo(-22, 106);
  ctx.lineTo(-5, 112);
  ctx.lineTo(12, 106);
  ctx.lineTo(32, 114);
  ctx.lineTo(42, 122);
  ctx.closePath(); ctx.fill();
  // Body
  ctx.fillStyle = "#e8d8b0";
  ctx.beginPath();
  ctx.moveTo(-16, 106);
  ctx.lineTo(-12, 32);
  ctx.lineTo(12, 32);
  ctx.lineTo(16, 106);
  ctx.closePath(); ctx.fill();
  // Red stripes
  ctx.fillStyle = "#b83524";
  ctx.fillRect(-14, 52, 26, 12);
  ctx.fillRect(-15, 82, 28, 12);
  // Cap
  ctx.fillStyle = "#2a2838";
  ctx.fillRect(-14, 28, 28, 4);
  ctx.beginPath();
  ctx.arc(0, 16, 13, Math.PI, 0);
  ctx.fill();
  // Light
  const pulse = 0.6 + 0.4 * Math.sin(frame * 0.08);
  ctx.fillStyle = `rgba(255, 223, 122, ${pulse})`;
  ctx.fillRect(-9, 16, 18, 14);
  // Beam
  ctx.fillStyle = `rgba(255, 223, 122, ${0.12 * pulse})`;
  ctx.beginPath();
  ctx.moveTo(0, 22);
  ctx.lineTo(-120, 70);
  ctx.lineTo(-120, -30);
  ctx.closePath(); ctx.fill();
  ctx.restore();
}

function drawCutler(ctx, s) {
  const baseY = 268;
  const bob = Math.sin(s.cutlerWobble) * 7;
  const closeness = s.cutlerCloseness;
  const x = 130 - closeness * 70;
  const y = baseY - 35 + bob;
  const size = 0.95 + closeness * 0.8;
  const alpha = 0.55 + closeness * 0.4;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(size, size);
  // Outer glow
  const glowG = ctx.createRadialGradient(0, 0, 5, 0, 0, 70);
  glowG.addColorStop(0, `rgba(79, 255, 143, ${alpha * 0.6})`);
  glowG.addColorStop(0.5, `rgba(79, 255, 143, ${alpha * 0.2})`);
  glowG.addColorStop(1, "rgba(79, 255, 143, 0)");
  ctx.fillStyle = glowG;
  ctx.beginPath();
  ctx.arc(0, 5, 70, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = alpha;
  // Body (suit)
  ctx.fillStyle = "#4fff8f";
  ctx.beginPath();
  ctx.moveTo(-16, -4);
  ctx.lineTo(-18, 30);
  ctx.lineTo(18, 30);
  ctx.lineTo(16, -4);
  ctx.closePath(); ctx.fill();
  // Belt
  ctx.fillStyle = "#2a6a4a";
  ctx.fillRect(-17, 10, 34, 4);
  // Helmet
  ctx.fillStyle = "#7fffb0";
  ctx.beginPath();
  ctx.arc(0, -16, 15, 0, Math.PI * 2);
  ctx.fill();
  // Helmet base
  ctx.fillStyle = "#4fff8f";
  ctx.fillRect(-12, -6, 24, 5);
  // Visor
  ctx.fillStyle = "#08201a";
  ctx.beginPath();
  ctx.ellipse(0, -17, 9, 5, 0, 0, Math.PI * 2);
  ctx.fill();
  // Glowing eyes
  ctx.fillStyle = "#e0ffe8";
  ctx.fillRect(-5, -18, 2, 3);
  ctx.fillRect(3, -18, 2, 3);
  // Bolts
  ctx.fillStyle = "#2a4a3a";
  ctx.fillRect(-13, -11, 2, 2);
  ctx.fillRect(11, -11, 2, 2);
  ctx.fillRect(-13, -2, 2, 2);
  ctx.fillRect(11, -2, 2, 2);
  // Arms
  ctx.fillStyle = "#4fff8f";
  ctx.fillRect(-22, 2, 6, 16);
  ctx.fillRect(16, 2, 6, 16);
  ctx.restore();
  ctx.globalAlpha = 1;
}

function drawPlayer(ctx, s) {
  const p = s.player;
  const flashing = p.flash > 0 && Math.floor(p.flash / 4) % 2 === 0;
  ctx.save();
  ctx.translate(PLAYER_X, p.y);

  // Ground shadow (stays on ground even when airborne)
  ctx.globalAlpha = 0.28;
  ctx.fillStyle = "#000";
  ctx.beginPath();
  ctx.ellipse(PLAYER_W / 2, GROUND_Y - p.y + 2, 19, 4, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = flashing ? 0.4 : 1;

  // Run cycle
  const running = p.onGround;
  const cycle = s.frame * 0.38;
  const legA = running ? Math.max(0, Math.sin(cycle)) * 5 : 2;
  const legB = running ? Math.max(0, Math.sin(cycle + Math.PI)) * 5 : 2;

  // BACK LEG (drawn first, behind body)
  ctx.fillStyle = "#5a3410";
  ctx.fillRect(9, 40 - legA, 5, 12);
  ctx.fillStyle = "#3a2008";
  ctx.fillRect(8, 50 - legA, 7, 3);

  // BODY
  ctx.fillStyle = "#8a5a2a";
  ctx.beginPath();
  ctx.ellipse(18, 30, 15, 9, 0, 0, Math.PI * 2);
  ctx.fill();
  // Belly highlight
  ctx.fillStyle = "#b88555";
  ctx.beginPath();
  ctx.ellipse(18, 34, 11, 5, 0, 0, Math.PI * 2);
  ctx.fill();
  // Back shadow
  ctx.fillStyle = "#6a4018";
  ctx.beginPath();
  ctx.ellipse(18, 25, 12, 3, 0, 0, Math.PI * 2);
  ctx.fill();

  // TAIL
  const tailWag = running ? Math.sin(s.frame * 0.5) * 5 : 0;
  ctx.fillStyle = "#8a5a2a";
  ctx.save();
  ctx.translate(5, 26);
  ctx.rotate(-0.4 + tailWag * 0.08);
  ctx.beginPath();
  ctx.ellipse(-5, 0, 6, 3, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#5a3410";
  ctx.beginPath();
  ctx.arc(-10, 0, 2.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // HEAD
  ctx.fillStyle = "#8a5a2a";
  ctx.beginPath();
  ctx.ellipse(31, 14, 10, 9, 0, 0, Math.PI * 2);
  ctx.fill();
  // Forehead darker
  ctx.fillStyle = "#6a4018";
  ctx.beginPath();
  ctx.ellipse(28, 9, 8, 3, 0, 0, Math.PI * 2);
  ctx.fill();

  // SNOUT
  ctx.fillStyle = "#b88555";
  ctx.beginPath();
  ctx.ellipse(38, 18, 6, 4.5, 0, 0, Math.PI * 2);
  ctx.fill();

  // NOSE
  ctx.fillStyle = "#1a0f08";
  ctx.beginPath();
  ctx.arc(41, 17, 2.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.5)";
  ctx.fillRect(40, 16, 1, 1);

  // EYE
  ctx.fillStyle = "#fff";
  ctx.beginPath();
  ctx.arc(32, 11, 2.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#0a0a0a";
  ctx.beginPath();
  ctx.arc(33, 11, 1.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#fff";
  ctx.fillRect(33, 10, 1, 1);

  // MOUTH / TONGUE
  ctx.fillStyle = "#e66a8a";
  ctx.fillRect(37, 20, 4, 2);
  ctx.strokeStyle = "#2a1408";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(35, 20);
  ctx.lineTo(41, 20);
  ctx.stroke();

  // EAR (floppy, bounces when running/jumping)
  ctx.fillStyle = "#5a3410";
  const earBob = running ? Math.sin(cycle) * 2.5 : -4;
  ctx.save();
  ctx.translate(24, 9);
  ctx.rotate(-0.15 + earBob * 0.1);
  ctx.beginPath();
  ctx.ellipse(0, 7, 4.5, 9, 0, 0, Math.PI * 2);
  ctx.fill();
  // Inner ear
  ctx.fillStyle = "#7a4a1a";
  ctx.beginPath();
  ctx.ellipse(0, 8, 2, 5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // COLLAR (red with gold tag)
  ctx.fillStyle = "#b83524";
  ctx.fillRect(21, 21, 14, 5);
  ctx.fillStyle = "#7a1f14";
  ctx.fillRect(21, 25, 14, 1);
  ctx.fillStyle = "#d43e2a";
  ctx.fillRect(21, 21, 14, 1);
  // Collar studs
  ctx.fillStyle = "#e8c043";
  ctx.fillRect(24, 23, 1, 1);
  ctx.fillRect(28, 23, 1, 1);
  ctx.fillRect(32, 23, 1, 1);
  // Dog tag
  ctx.fillStyle = "#e8c043";
  ctx.beginPath();
  ctx.arc(28, 28, 2.8, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#a58028";
  ctx.fillRect(27, 25, 2, 2);

  // FRONT LEG
  ctx.fillStyle = "#8a5a2a";
  ctx.fillRect(26, 40 - legB, 5, 12);
  ctx.fillStyle = "#4a2a0c";
  ctx.fillRect(25, 50 - legB, 7, 3);

  ctx.restore();
  ctx.globalAlpha = 1;
}

function drawObstacle(ctx, o, s) {
  ctx.save();
  ctx.translate(o.x, o.y);
  if (o.key === "tidepool") {
    ctx.fillStyle = "#0d2a40";
    ctx.beginPath();
    ctx.ellipse(o.w / 2, o.h / 2, o.w / 2, o.h / 2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#1e4a70";
    ctx.beginPath();
    ctx.ellipse(o.w / 2, o.h / 2 + 1, o.w / 2 - 5, o.h / 2 - 3, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(180, 220, 255, 0.35)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.ellipse(o.w / 2, o.h / 2 - 1, Math.max(3, o.w / 2 - 10 - Math.sin(s.frame * 0.1) * 2), o.h / 2 - 6, 0, 0, Math.PI * 2);
    ctx.stroke();
  } else if (o.key === "crab") {
    ctx.fillStyle = "#8a2a1a";
    ctx.beginPath();
    ctx.ellipse(o.w / 2, o.h - 8, o.w / 2 - 1, 8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#c23a2a";
    ctx.beginPath();
    ctx.ellipse(o.w / 2, o.h - 10, o.w / 2 - 3, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#8a2a1a";
    ctx.beginPath();
    ctx.arc(3, o.h - 11, 5, 0, Math.PI * 2);
    ctx.arc(o.w - 3, o.h - 11, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#0a0a0a";
    ctx.fillRect(o.w / 2 - 5, o.h - 15, 2, 4);
    ctx.fillRect(o.w / 2 + 3, o.h - 15, 2, 4);
    ctx.fillStyle = "#fff";
    ctx.fillRect(o.w / 2 - 5, o.h - 15, 1, 1);
    ctx.fillRect(o.w / 2 + 3, o.h - 15, 1, 1);
    const leg = Math.sin(s.frame * 0.4) * 2;
    ctx.strokeStyle = "#6a1a0a";
    ctx.lineWidth = 2;
    for (let i = -1; i <= 1; i += 2) {
      ctx.beginPath();
      ctx.moveTo(o.w / 2 + i * 8, o.h - 5);
      ctx.lineTo(o.w / 2 + i * 14, o.h - 1 + leg * i);
      ctx.stroke();
    }
  } else if (o.key === "driftwood") {
    ctx.fillStyle = "#4a2e1c";
    ctx.fillRect(0, 0, o.w, o.h);
    ctx.fillStyle = "#6b4530";
    ctx.fillRect(2, 3, o.w - 4, o.h - 9);
    ctx.fillStyle = "#8b5c40";
    ctx.fillRect(4, 4, o.w - 8, 2);
    ctx.fillStyle = "#2a1808";
    ctx.beginPath(); ctx.arc(18, 11, 3, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(o.w - 22, 9, 2.5, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(o.w / 2, 13, 2, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "#2a1808";
    ctx.lineWidth = 1;
    for (let i = 0; i < 5; i++) {
      ctx.beginPath();
      ctx.moveTo(8 + i * 16, 4);
      ctx.lineTo(10 + i * 16, o.h - 6);
      ctx.stroke();
    }
  } else if (o.key === "seaweed") {
    ctx.fillStyle = "#133a22";
    for (let i = 0; i < 3; i++) {
      const sway = Math.sin(s.frame * 0.09 + i * 1.3) * 4;
      ctx.beginPath();
      ctx.moveTo(6 + i * 14, o.h);
      ctx.quadraticCurveTo(10 + i * 14 + sway, o.h / 2, 8 + i * 14 + sway, 0);
      ctx.lineTo(13 + i * 14 + sway, 0);
      ctx.quadraticCurveTo(15 + i * 14 + sway, o.h / 2, 13 + i * 14, o.h);
      ctx.closePath(); ctx.fill();
    }
    ctx.fillStyle = "#2d7a44";
    for (let i = 0; i < 3; i++) {
      const sway = Math.sin(s.frame * 0.09 + i * 1.3) * 4;
      ctx.fillRect(8 + i * 14 + sway / 2, o.h / 3, 2, o.h / 2);
    }
  }
  ctx.restore();
}

function drawSnack(ctx, sn, s) {
  ctx.save();
  const float = Math.sin(s.frame * 0.15 + sn.x * 0.01) * 3;
  ctx.translate(sn.x, sn.y + float);
  const glow = ctx.createRadialGradient(sn.w / 2, sn.h / 2, 2, sn.w / 2, sn.h / 2, sn.w + 6);
  glow.addColorStop(0, "rgba(255, 223, 122, 0.5)");
  glow.addColorStop(1, "rgba(255, 223, 122, 0)");
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(sn.w / 2, sn.h / 2, sn.w + 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#c97a3f";
  ctx.beginPath();
  ctx.arc(4, 5, 5, 0, Math.PI * 2);
  ctx.arc(4, sn.h - 5, 5, 0, Math.PI * 2);
  ctx.arc(sn.w - 4, 5, 5, 0, Math.PI * 2);
  ctx.arc(sn.w - 4, sn.h - 5, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillRect(3, 4, sn.w - 6, sn.h - 8);
  ctx.fillStyle = "#f3c273";
  ctx.beginPath();
  ctx.arc(4, 5, 3.5, 0, Math.PI * 2);
  ctx.arc(4, sn.h - 5, 3.5, 0, Math.PI * 2);
  ctx.arc(sn.w - 4, 5, 3.5, 0, Math.PI * 2);
  ctx.arc(sn.w - 4, sn.h - 5, 3.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillRect(4, 5, sn.w - 8, sn.h - 10);
  ctx.fillStyle = "#fff5c4";
  ctx.fillRect(6, 7, 4, 2);
  ctx.restore();
}

function drawHUD(ctx, s, theme) {
  const barW = W - 80;
  const pct = Math.min(1, s.distance / FINISH_DISTANCE);
  ctx.fillStyle = "rgba(6, 4, 24, 0.65)";
  ctx.fillRect(30, 12, barW, 16);
  const fg = ctx.createLinearGradient(30, 0, 30 + barW * pct, 0);
  fg.addColorStop(0, theme ? theme.accent : "#4fff8f");
  fg.addColorStop(1, "#ffdf7a");
  ctx.fillStyle = fg;
  ctx.fillRect(30, 12, barW * pct, 16);
  ctx.strokeStyle = "rgba(255,255,255,0.8)";
  ctx.lineWidth = 1.5;
  ctx.strokeRect(30, 12, barW, 16);
  // Destination icon marker
  ctx.fillStyle = "#ffdf7a";
  ctx.fillRect(W - 42, 6, 6, 28);
  ctx.fillStyle = "#b83524";
  ctx.fillRect(W - 42, 14, 6, 4);
  ctx.fillStyle = "#e8d8b0";
  ctx.beginPath(); ctx.arc(W - 39, 6, 5, Math.PI, 0); ctx.fill();
  // Stats row
  ctx.font = "bold 14px Fredoka, system-ui, sans-serif";
  ctx.textAlign = "left";
  ctx.fillStyle = "#fff";
  ctx.fillText(`${Math.floor(s.distance)}m / ${FINISH_DISTANCE}m`, 30, 48);
  ctx.textAlign = "center";
  ctx.fillStyle = "#ffdf7a";
  const emoji = theme ? theme.collectibleEmoji : "🦴";
  ctx.fillText(`${emoji} ${s.snacks_collected}`, W / 2, 48);
  ctx.textAlign = "right";
  const hearts = "●".repeat(3 - s.hits) + "○".repeat(s.hits);
  ctx.fillStyle = "#ff6060";
  ctx.fillText(hearts, W - 30, 48);
}

// ============ THEME DRAWING: DETECTIVE (BEACH) ============

function drawBeachScene(ctx, s) {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, "#060418");
  g.addColorStop(0.55, "#15103a");
  g.addColorStop(1, "#2a2050");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  for (const st of s.stars) {
    const tw = (Math.sin(s.frame * 0.05 + st.phase) + 1) / 2 * 0.6 + 0.4;
    ctx.globalAlpha = st.base * tw;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(st.x, st.y, st.size, st.size);
  }
  ctx.globalAlpha = 1;
  const moonG = ctx.createRadialGradient(W - 120, 68, 0, W - 120, 68, 40);
  moonG.addColorStop(0, "rgba(240, 232, 192, 0.25)");
  moonG.addColorStop(1, "rgba(240, 232, 192, 0)");
  ctx.fillStyle = moonG;
  ctx.fillRect(W - 180, 20, 120, 120);
  ctx.fillStyle = "#f0e8c0";
  ctx.beginPath(); ctx.arc(W - 120, 68, 28, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "rgba(180, 170, 140, 0.35)";
  ctx.beginPath(); ctx.arc(W - 112, 62, 5, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(W - 125, 75, 4, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(W - 115, 78, 3, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#0a1828"; ctx.fillRect(0, 238, W, 24);
  ctx.fillStyle = "#081428"; ctx.fillRect(0, 262, W, 78);
  ctx.strokeStyle = "rgba(79, 255, 143, 0.12)"; ctx.lineWidth = 1;
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    for (let x = 0; x < W; x += 8) {
      const y = 275 + i * 18 + Math.sin((x + s.bgOffset) * 0.05 + i * 1.5) * 1.8;
      if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  const lhProgress = Math.min(1, s.distance / FINISH_DISTANCE);
  const lhScale = 0.35 + lhProgress * 1.15;
  const lhX = W - 190 + (1 - lhProgress) * 90;
  const lhY = 225 - lhScale * 18;
  drawLighthouse(ctx, lhX, lhY, lhScale, s.frame);
  for (let i = 0; i < 3; i++) {
    const fogAlpha = 0.13 + i * 0.04;
    ctx.fillStyle = `rgba(140, 150, 180, ${fogAlpha})`;
    const fy = 225 + i * 32;
    const off = (s.bgOffset * 0.12) % 40;
    for (let x = -100; x < W + 100; x += 40) {
      const wob = Math.sin(s.frame * 0.012 + x * 0.02 + i) * 6;
      ctx.beginPath();
      ctx.ellipse(x - off, fy + wob, 55, 11, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  drawCutler(ctx, s);
  const sandG = ctx.createLinearGradient(0, GROUND_Y, 0, H);
  sandG.addColorStop(0, "#d4b896"); sandG.addColorStop(1, "#7a5f3e");
  ctx.fillStyle = sandG;
  ctx.fillRect(0, GROUND_Y, W, H - GROUND_Y);
  ctx.fillStyle = "rgba(90, 60, 40, 0.3)";
  const sandOff = s.bgOffset % 24;
  for (let x = -sandOff; x < W; x += 24) {
    for (let y = GROUND_Y + 8; y < H; y += 14) {
      ctx.fillRect(x + ((Math.floor(y / 14)) % 2 === 0 ? 0 : 12), y, 2, 2);
    }
  }
}

// ============ THEME DRAWING: MINER (GOLD MINE) ============

function drawMinerChaser(ctx, s) {
  // Detective dog silhouette way behind in the tunnel
  const baseY = 268;
  const bob = Math.sin(s.cutlerWobble * 0.8) * 4;
  const closeness = s.cutlerCloseness;
  const x = 120 - closeness * 60;
  const y = baseY - 20 + bob;
  const size = 0.85 + closeness * 0.6;
  const alpha = 0.55 + closeness * 0.4;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(size, size);
  const glow = ctx.createRadialGradient(0, 0, 5, 0, 0, 55);
  glow.addColorStop(0, `rgba(255,255,255,${alpha * 0.3})`);
  glow.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = glow;
  ctx.beginPath(); ctx.arc(0, 0, 55, 0, Math.PI * 2); ctx.fill();
  ctx.globalAlpha = alpha;
  // Simple dog silhouette (running toward us)
  ctx.fillStyle = "#3a2410";
  ctx.beginPath();
  ctx.ellipse(0, 2, 18, 8, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath(); ctx.arc(16, -5, 7, 0, Math.PI * 2); ctx.fill();
  // Ears
  ctx.beginPath();
  ctx.ellipse(13, -10, 3, 6, 0.3, 0, Math.PI * 2);
  ctx.fill();
  // Legs
  const cycle = s.frame * 0.3;
  ctx.fillRect(-10, 8, 3, 8 + Math.sin(cycle) * 2);
  ctx.fillRect(10, 8, 3, 8 + Math.sin(cycle + Math.PI) * 2);
  // Red collar
  ctx.fillStyle = "#b83524";
  ctx.fillRect(11, -2, 10, 3);
  // Eye glint
  ctx.fillStyle = "#ffdf7a";
  ctx.fillRect(17, -7, 2, 2);
  ctx.restore();
  ctx.globalAlpha = 1;
}

function drawGoldVein(ctx, x, y, scale, frame) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  // Rock wall backdrop
  ctx.fillStyle = "#1a0e06";
  ctx.fillRect(-45, -60, 90, 130);
  ctx.fillStyle = "#2a1810";
  ctx.beginPath();
  ctx.moveTo(-45, -60);
  ctx.lineTo(-45, 70);
  ctx.lineTo(45, 70);
  ctx.lineTo(45, -55);
  ctx.lineTo(30, -62);
  ctx.lineTo(0, -55);
  ctx.lineTo(-20, -62);
  ctx.closePath();
  ctx.fill();
  // Gold veins
  const pulse = 0.7 + 0.3 * Math.sin(frame * 0.06);
  ctx.strokeStyle = `rgba(255, 215, 50, ${pulse})`;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(-35, -40); ctx.lineTo(-20, -25); ctx.lineTo(-10, -30); ctx.lineTo(5, -15);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(-15, 0); ctx.lineTo(0, 10); ctx.lineTo(15, 5); ctx.lineTo(30, 20);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(20, -35); ctx.lineTo(30, -20); ctx.lineTo(25, -5);
  ctx.stroke();
  // Gold nuggets embedded
  ctx.fillStyle = `rgba(255, 215, 50, ${pulse})`;
  ctx.beginPath(); ctx.arc(-25, -30, 3, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(5, -20, 4, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(-10, 10, 3, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(22, 15, 4, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(-30, 25, 3, 0, Math.PI * 2); ctx.fill();
  // Glow
  ctx.fillStyle = `rgba(255, 215, 50, ${0.15 * pulse})`;
  ctx.beginPath(); ctx.arc(0, 0, 60, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

function drawMineScene(ctx, s) {
  // Dark cave background
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, "#0a0604");
  g.addColorStop(0.5, "#1a0e08");
  g.addColorStop(1, "#2a1a10");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  // Rock ceiling with stalactites
  ctx.fillStyle = "#0a0604";
  ctx.beginPath();
  ctx.moveTo(0, 0); ctx.lineTo(W, 0); ctx.lineTo(W, 80);
  for (let x = W; x >= 0; x -= 40) {
    const h = 60 + Math.sin(x * 0.05) * 15;
    ctx.lineTo(x - 20, h);
    ctx.lineTo(x - 40, 70);
  }
  ctx.lineTo(0, 80);
  ctx.closePath();
  ctx.fill();
  // Gold flecks in ceiling
  for (let i = 0; i < 12; i++) {
    const x = (i * 63 + s.bgOffset * 0.05) % W;
    const y = 15 + (i * 7) % 50;
    ctx.fillStyle = `rgba(255, 215, 50, ${0.4 + Math.sin(s.frame * 0.05 + i) * 0.2})`;
    ctx.fillRect(x, y, 2, 2);
  }
  // Torches on walls
  for (let i = 0; i < 4; i++) {
    const tx = ((i * 200) - (s.bgOffset * 0.4) % 200 + 400) % W;
    const ty = 120;
    ctx.fillStyle = "#4a3020"; ctx.fillRect(tx - 2, ty, 4, 20);
    const flicker = 0.7 + Math.sin(s.frame * 0.3 + i * 2) * 0.3;
    const glow = ctx.createRadialGradient(tx, ty - 6, 0, tx, ty - 6, 60);
    glow.addColorStop(0, `rgba(255, 140, 40, ${0.5 * flicker})`);
    glow.addColorStop(1, "rgba(255, 140, 40, 0)");
    ctx.fillStyle = glow;
    ctx.fillRect(tx - 60, ty - 60, 120, 120);
    ctx.fillStyle = `rgba(255, 200, 80, ${flicker})`;
    ctx.beginPath();
    ctx.moveTo(tx - 5, ty - 2);
    ctx.lineTo(tx + 5, ty - 2);
    ctx.lineTo(tx + 3, ty - 12 - Math.sin(s.frame * 0.4 + i) * 2);
    ctx.lineTo(tx, ty - 16 - Math.sin(s.frame * 0.4 + i) * 2);
    ctx.lineTo(tx - 3, ty - 12 - Math.sin(s.frame * 0.4 + i) * 2);
    ctx.closePath();
    ctx.fill();
  }
  // Distant tunnel gradient (depth)
  const tunnel = ctx.createRadialGradient(W - 160, 200, 10, W - 160, 200, 180);
  tunnel.addColorStop(0, "rgba(40, 20, 10, 0.4)");
  tunnel.addColorStop(1, "rgba(40, 20, 10, 0)");
  ctx.fillStyle = tunnel;
  ctx.fillRect(W - 340, 50, 340, 290);
  // Wooden support beams (vertical posts on sides of the tunnel)
  const postSpacing = 240;
  const postOff = s.bgOffset % postSpacing;
  for (let x = -postOff; x < W + 100; x += postSpacing) {
    // Left post
    ctx.fillStyle = "#3a2410";
    ctx.fillRect(x - 200, 80, 18, 250);
    ctx.fillStyle = "#2a1808";
    ctx.fillRect(x - 200, 80, 4, 250);
    // Right post
    ctx.fillStyle = "#3a2410";
    ctx.fillRect(x + 200, 80, 18, 250);
    ctx.fillStyle = "#2a1808";
    ctx.fillRect(x + 200, 80, 4, 250);
    // Top horizontal beam
    ctx.fillStyle = "#3a2410";
    ctx.fillRect(x - 210, 70, 440, 14);
    ctx.fillStyle = "#2a1808";
    ctx.fillRect(x - 210, 70, 440, 3);
  }
  // Gold vein destination
  const gvProgress = Math.min(1, s.distance / FINISH_DISTANCE);
  const gvScale = 0.4 + gvProgress * 1.4;
  const gvX = W - 150 + (1 - gvProgress) * 70;
  const gvY = 210;
  drawGoldVein(ctx, gvX, gvY, gvScale, s.frame);
  // Chaser (detective dog way back in tunnel)
  drawMinerChaser(ctx, s);
  // Mine floor (darker rock with track rails)
  const floorG = ctx.createLinearGradient(0, GROUND_Y, 0, H);
  floorG.addColorStop(0, "#3a2818");
  floorG.addColorStop(1, "#1a0f08");
  ctx.fillStyle = floorG;
  ctx.fillRect(0, GROUND_Y, W, H - GROUND_Y);
  // Track rails
  ctx.strokeStyle = "#5a4a3a";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(0, GROUND_Y + 22); ctx.lineTo(W, GROUND_Y + 22);
  ctx.moveTo(0, GROUND_Y + 40); ctx.lineTo(W, GROUND_Y + 40);
  ctx.stroke();
  // Track ties
  const tieOff = s.bgOffset % 32;
  ctx.fillStyle = "#2a1808";
  for (let x = -tieOff; x < W; x += 32) {
    ctx.fillRect(x, GROUND_Y + 18, 18, 26);
  }
  // Pebbles
  ctx.fillStyle = "rgba(20, 10, 5, 0.5)";
  const pebOff = s.bgOffset % 22;
  for (let x = -pebOff; x < W; x += 22) {
    for (let y = GROUND_Y + 50; y < H; y += 12) {
      ctx.fillRect(x + ((Math.floor(y / 12)) % 2 === 0 ? 0 : 11), y, 2, 2);
    }
  }
}

function drawMineObstacle(ctx, o, s) {
  ctx.save();
  ctx.translate(o.x, o.y);
  if (o.key === "rockpile") {
    // Cluster of rocks
    ctx.fillStyle = "#2a1810";
    ctx.beginPath(); ctx.ellipse(o.w / 2, o.h - 4, o.w / 2, 8, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#5a4838";
    ctx.beginPath(); ctx.arc(14, 20, 13, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(32, 12, 15, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(48, 22, 11, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#7a6858";
    ctx.beginPath(); ctx.arc(12, 17, 10, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(32, 10, 12, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(46, 19, 9, 0, Math.PI * 2); ctx.fill();
    // Gold flecks
    ctx.fillStyle = "#ffd732";
    ctx.fillRect(15, 15, 2, 2);
    ctx.fillRect(33, 7, 2, 2);
    ctx.fillRect(44, 22, 2, 2);
  } else if (o.key === "beam") {
    // Wooden support beam laying across path
    ctx.fillStyle = "#2a1808";
    ctx.fillRect(0, 0, o.w, o.h);
    ctx.fillStyle = "#4a3018";
    ctx.fillRect(2, 2, o.w - 4, o.h - 6);
    ctx.fillStyle = "#6a4828";
    ctx.fillRect(3, 3, o.w - 6, 3);
    // Wood grain
    ctx.strokeStyle = "#2a1808"; ctx.lineWidth = 1;
    for (let i = 0; i < 6; i++) {
      ctx.beginPath();
      ctx.moveTo(8 + i * 15, 3);
      ctx.lineTo(10 + i * 15, o.h - 4);
      ctx.stroke();
    }
    // Metal brackets
    ctx.fillStyle = "#3a3a3a";
    ctx.fillRect(5, 1, 3, o.h - 2);
    ctx.fillRect(o.w - 8, 1, 3, o.h - 2);
    ctx.fillStyle = "#5a5a5a";
    ctx.fillRect(6, 3, 1, 3);
    ctx.fillRect(o.w - 7, 3, 1, 3);
  } else if (o.key === "cart") {
    // Mine cart
    // Wheels
    ctx.fillStyle = "#1a1008";
    ctx.beginPath(); ctx.arc(12, o.h - 6, 6, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(o.w - 12, o.h - 6, 6, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#4a3a2a";
    ctx.beginPath(); ctx.arc(12, o.h - 6, 3, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(o.w - 12, o.h - 6, 3, 0, Math.PI * 2); ctx.fill();
    // Cart body
    ctx.fillStyle = "#3a2418";
    ctx.fillRect(2, 14, o.w - 4, o.h - 22);
    ctx.fillStyle = "#5a3828";
    ctx.fillRect(4, 16, o.w - 8, o.h - 26);
    // Top rim
    ctx.fillStyle = "#2a1808";
    ctx.fillRect(0, 12, o.w, 4);
    ctx.fillStyle = "#7a5838";
    ctx.fillRect(0, 12, o.w, 1);
    // Metal bands
    ctx.fillStyle = "#1a1408";
    ctx.fillRect(2, 20, o.w - 4, 2);
    ctx.fillRect(2, o.h - 14, o.w - 4, 2);
    // Rocks inside
    ctx.fillStyle = "#8a7a6a";
    ctx.beginPath(); ctx.arc(12, 14, 4, 0, Math.PI); ctx.fill();
    ctx.beginPath(); ctx.arc(22, 13, 5, 0, Math.PI); ctx.fill();
    ctx.beginPath(); ctx.arc(34, 14, 4, 0, Math.PI); ctx.fill();
    // Gold on rocks
    ctx.fillStyle = "#ffd732";
    ctx.fillRect(22, 10, 2, 2);
    ctx.fillRect(34, 11, 2, 2);
  } else if (o.key === "crystal") {
    // Blue/purple crystal cluster
    ctx.fillStyle = "#1a0820";
    ctx.beginPath(); ctx.ellipse(o.w / 2, o.h - 3, o.w / 2, 5, 0, 0, Math.PI * 2); ctx.fill();
    // Main crystal
    ctx.fillStyle = "#6a4aba";
    ctx.beginPath();
    ctx.moveTo(o.w / 2 - 8, o.h);
    ctx.lineTo(o.w / 2 + 8, o.h);
    ctx.lineTo(o.w / 2 + 4, 6);
    ctx.lineTo(o.w / 2 - 4, 6);
    ctx.closePath();
    ctx.fill();
    // Side crystals
    ctx.fillStyle = "#8a6ada";
    ctx.beginPath();
    ctx.moveTo(5, o.h); ctx.lineTo(16, o.h); ctx.lineTo(12, 16); ctx.lineTo(9, 16);
    ctx.closePath(); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(o.w - 16, o.h); ctx.lineTo(o.w - 5, o.h); ctx.lineTo(o.w - 9, 14); ctx.lineTo(o.w - 12, 14);
    ctx.closePath(); ctx.fill();
    // Highlights
    ctx.fillStyle = "rgba(220, 200, 255, 0.8)";
    ctx.fillRect(o.w / 2 - 3, 10, 2, o.h - 16);
    ctx.fillRect(11, 20, 1, o.h - 24);
    // Glow
    const glow = ctx.createRadialGradient(o.w / 2, o.h / 2, 3, o.w / 2, o.h / 2, 30);
    glow.addColorStop(0, `rgba(150, 100, 255, ${0.25 + Math.sin(s.frame * 0.1) * 0.1})`);
    glow.addColorStop(1, "rgba(150, 100, 255, 0)");
    ctx.fillStyle = glow;
    ctx.fillRect(-10, -10, o.w + 20, o.h + 20);
  }
  ctx.restore();
}

function drawGoldNugget(ctx, sn, s) {
  ctx.save();
  const float = Math.sin(s.frame * 0.14 + sn.x * 0.01) * 3;
  ctx.translate(sn.x, sn.y + float);
  // Glow
  const glow = ctx.createRadialGradient(sn.w / 2, sn.h / 2, 2, sn.w / 2, sn.h / 2, sn.w + 6);
  glow.addColorStop(0, "rgba(255, 215, 50, 0.5)");
  glow.addColorStop(1, "rgba(255, 215, 50, 0)");
  ctx.fillStyle = glow;
  ctx.beginPath(); ctx.arc(sn.w / 2, sn.h / 2, sn.w + 4, 0, Math.PI * 2); ctx.fill();
  // Nugget
  ctx.fillStyle = "#c49020";
  ctx.beginPath();
  ctx.moveTo(3, 8); ctx.lineTo(7, 3); ctx.lineTo(14, 2); ctx.lineTo(19, 6);
  ctx.lineTo(20, 14); ctx.lineTo(16, 20); ctx.lineTo(8, 20); ctx.lineTo(2, 15);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = "#ffd732";
  ctx.beginPath();
  ctx.moveTo(5, 9); ctx.lineTo(9, 5); ctx.lineTo(13, 4); ctx.lineTo(17, 7);
  ctx.lineTo(17, 13); ctx.lineTo(14, 17); ctx.lineTo(8, 17); ctx.lineTo(5, 13);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = "#fff1a8";
  ctx.fillRect(8, 7, 4, 2);
  ctx.fillRect(7, 10, 2, 2);
  ctx.restore();
}

function drawMinerGhost(ctx, s) {
  const p = s.player;
  const flashing = p.flash > 0 && Math.floor(p.flash / 4) % 2 === 0;
  ctx.save();
  ctx.translate(PLAYER_X, p.y);
  // Ground shadow
  ctx.globalAlpha = 0.3;
  ctx.fillStyle = "#000";
  ctx.beginPath();
  ctx.ellipse(PLAYER_W / 2, GROUND_Y - p.y + 2, 17, 4, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = flashing ? 0.45 : 0.92;
  // Ghost aura
  const aura = ctx.createRadialGradient(PLAYER_W / 2, PLAYER_H / 2, 4, PLAYER_W / 2, PLAYER_H / 2, 42);
  aura.addColorStop(0, "rgba(127, 200, 255, 0.35)");
  aura.addColorStop(1, "rgba(127, 200, 255, 0)");
  ctx.fillStyle = aura;
  ctx.fillRect(-20, -15, PLAYER_W + 40, PLAYER_H + 30);

  const cycle = s.frame * 0.38;
  const running = p.onGround;
  const legA = running ? Math.max(0, Math.sin(cycle)) * 5 : 2;
  const legB = running ? Math.max(0, Math.sin(cycle + Math.PI)) * 5 : 2;
  const armSwing = Math.sin(cycle) * 3;

  // BACK LEG (overalls)
  ctx.fillStyle = "#304868";
  ctx.fillRect(10, 36 - legA, 6, 14);
  ctx.fillStyle = "#1a0f08";
  ctx.fillRect(9, 48 - legA, 8, 3);

  // BODY - red/black checkered shirt
  ctx.fillStyle = "#8a2218";
  ctx.fillRect(10, 18, 16, 10);
  // Shirt checkers
  ctx.fillStyle = "#2a0806";
  for (let y = 0; y < 10; y += 3) {
    for (let x = 0; x < 16; x += 3) {
      if ((Math.floor(x / 3) + Math.floor(y / 3)) % 2 === 0) ctx.fillRect(10 + x, 18 + y, 3, 3);
    }
  }
  // OVERALLS (denim)
  ctx.fillStyle = "#304868";
  ctx.fillRect(9, 26, 18, 16);
  // Straps
  ctx.fillStyle = "#1f3048";
  ctx.fillRect(11, 16, 4, 12);
  ctx.fillRect(21, 16, 4, 12);
  // Buttons
  ctx.fillStyle = "#c49020";
  ctx.fillRect(12, 19, 2, 2);
  ctx.fillRect(22, 19, 2, 2);
  // Pocket
  ctx.fillStyle = "#1f3048";
  ctx.fillRect(14, 30, 8, 7);
  ctx.fillStyle = "#ffd732";
  ctx.fillRect(17, 33, 2, 2);

  // Back arm (with pickaxe)
  ctx.fillStyle = "#8a2218";
  ctx.fillRect(5, 20 + armSwing, 4, 9);
  // Pickaxe handle over shoulder
  ctx.strokeStyle = "#4a2818";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(6, 18 + armSwing);
  ctx.lineTo(-4, 2 + armSwing);
  ctx.stroke();
  // Pickaxe head
  ctx.fillStyle = "#5a5a5a";
  ctx.beginPath();
  ctx.moveTo(-10, 0 + armSwing);
  ctx.lineTo(2, -4 + armSwing);
  ctx.lineTo(4, 2 + armSwing);
  ctx.lineTo(-8, 6 + armSwing);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#7a7a7a";
  ctx.fillRect(-6, 0 + armSwing, 8, 2);

  // HEAD (pale ghostly)
  ctx.fillStyle = "#d8c5a8";
  ctx.beginPath();
  ctx.arc(19, 11, 7, 0, Math.PI * 2);
  ctx.fill();
  // Beard
  ctx.fillStyle = "#e0e0e0";
  ctx.beginPath();
  ctx.moveTo(13, 12);
  ctx.quadraticCurveTo(12, 22, 16, 24);
  ctx.quadraticCurveTo(19, 25, 22, 24);
  ctx.quadraticCurveTo(26, 22, 25, 12);
  ctx.quadraticCurveTo(22, 16, 19, 16);
  ctx.quadraticCurveTo(16, 16, 13, 12);
  ctx.closePath();
  ctx.fill();
  // Mustache
  ctx.fillStyle = "#e8e8e8";
  ctx.fillRect(15, 13, 8, 2);
  // Eye
  ctx.fillStyle = "#0a0a0a";
  ctx.fillRect(21, 10, 2, 2);

  // FLOPPY HAT
  ctx.fillStyle = "#5a3818";
  ctx.beginPath();
  ctx.ellipse(19, 5, 13, 3, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#4a2a10";
  ctx.fillRect(14, -1, 10, 6);
  ctx.fillStyle = "#3a1e08";
  ctx.fillRect(14, 4, 10, 1);
  // Bent brim front
  ctx.fillStyle = "#4a2a10";
  ctx.beginPath();
  ctx.moveTo(25, 4); ctx.lineTo(32, 6); ctx.lineTo(30, 8); ctx.lineTo(24, 6);
  ctx.closePath();
  ctx.fill();

  // Front arm with lantern
  ctx.fillStyle = "#8a2218";
  ctx.fillRect(26, 22 - armSwing, 4, 8);
  ctx.fillStyle = "#d8c5a8";
  ctx.beginPath();
  ctx.arc(28, 31 - armSwing, 2.5, 0, Math.PI * 2);
  ctx.fill();
  // Lantern
  const lx = 28, ly = 36 - armSwing;
  // Lantern glow
  const lGlow = ctx.createRadialGradient(lx, ly, 2, lx, ly, 18);
  lGlow.addColorStop(0, "rgba(255, 190, 80, 0.55)");
  lGlow.addColorStop(1, "rgba(255, 190, 80, 0)");
  ctx.fillStyle = lGlow;
  ctx.beginPath(); ctx.arc(lx, ly, 18, 0, Math.PI * 2); ctx.fill();
  // Lantern body
  ctx.fillStyle = "#1a1408";
  ctx.fillRect(lx - 4, ly - 4, 8, 8);
  ctx.fillStyle = "#ffc850";
  ctx.fillRect(lx - 3, ly - 3, 6, 6);
  ctx.fillStyle = "#fff1a8";
  ctx.fillRect(lx - 1, ly - 2, 2, 3);
  // Lantern top & handle
  ctx.fillStyle = "#0a0604";
  ctx.fillRect(lx - 5, ly - 5, 10, 2);
  ctx.strokeStyle = "#0a0604";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(lx, ly - 7, 3, Math.PI, 0);
  ctx.stroke();

  // FRONT LEG
  ctx.fillStyle = "#304868";
  ctx.fillRect(20, 36 - legB, 6, 14);
  ctx.fillStyle = "#1a0f08";
  ctx.fillRect(19, 48 - legB, 8, 3);

  ctx.restore();
  ctx.globalAlpha = 1;
}

// ============ THEME DRAWING: CUTLER (DOCKS) ============

function drawDocksChaser(ctx, s) {
  // Detective dog chasing through the fog
  const baseY = 268;
  const bob = Math.sin(s.cutlerWobble * 0.9) * 4;
  const closeness = s.cutlerCloseness;
  const x = 110 - closeness * 55;
  const y = baseY - 18 + bob;
  const size = 0.9 + closeness * 0.6;
  const alpha = 0.5 + closeness * 0.45;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(size, size);
  const fog = ctx.createRadialGradient(0, 0, 5, 0, 0, 60);
  fog.addColorStop(0, `rgba(255,240,200,${alpha * 0.2})`);
  fog.addColorStop(1, "rgba(255,240,200,0)");
  ctx.fillStyle = fog;
  ctx.beginPath(); ctx.arc(0, 0, 60, 0, Math.PI * 2); ctx.fill();
  ctx.globalAlpha = alpha;
  // Brown dog silhouette (running)
  ctx.fillStyle = "#5a3410";
  ctx.beginPath(); ctx.ellipse(0, 2, 17, 8, 0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(14, -4, 7, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(11, -9, 3, 5, 0.3, 0, Math.PI * 2); ctx.fill();
  const cycle = s.frame * 0.3;
  ctx.fillRect(-10, 8, 3, 8 + Math.sin(cycle) * 2);
  ctx.fillRect(10, 8, 3, 8 + Math.sin(cycle + Math.PI) * 2);
  ctx.fillStyle = "#b83524";
  ctx.fillRect(10, -1, 9, 3);
  // Magnifying glass
  ctx.strokeStyle = "#d4a030"; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(22, -2, 4, 0, Math.PI * 2); ctx.stroke();
  ctx.restore();
  ctx.globalAlpha = 1;
}

function drawShipwreck(ctx, x, y, scale, frame) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  // Hull
  ctx.fillStyle = "#1a1008";
  ctx.beginPath();
  ctx.moveTo(-55, 40); ctx.quadraticCurveTo(-40, 20, -10, 12);
  ctx.lineTo(30, 0); ctx.lineTo(55, 18); ctx.lineTo(58, 40);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#2a1808";
  ctx.beginPath();
  ctx.moveTo(-50, 36); ctx.quadraticCurveTo(-35, 18, -10, 12);
  ctx.lineTo(25, 3); ctx.lineTo(50, 16); ctx.lineTo(53, 36);
  ctx.closePath();
  ctx.fill();
  // Planks
  ctx.strokeStyle = "#0a0604"; ctx.lineWidth = 1;
  for (let i = 0; i < 4; i++) {
    ctx.beginPath();
    ctx.moveTo(-48, 18 + i * 5);
    ctx.lineTo(50, 18 + i * 5);
    ctx.stroke();
  }
  // Broken mast 1
  ctx.save();
  ctx.rotate(-0.25);
  ctx.fillStyle = "#1a1008";
  ctx.fillRect(-12, -55, 5, 60);
  ctx.fillStyle = "#3a2818";
  ctx.fillRect(-11, -55, 2, 60);
  // Tattered sail
  ctx.fillStyle = "rgba(200, 190, 160, 0.35)";
  ctx.beginPath();
  ctx.moveTo(-8, -40); ctx.lineTo(10, -30); ctx.lineTo(8, -10); ctx.lineTo(-6, -18);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  // Broken mast 2
  ctx.save();
  ctx.rotate(0.3);
  ctx.fillStyle = "#1a1008";
  ctx.fillRect(18, -35, 4, 40);
  ctx.restore();
  // Windows with green ghost light
  const pulse = 0.6 + 0.4 * Math.sin(frame * 0.06);
  ctx.fillStyle = "#0a0a0a";
  ctx.beginPath(); ctx.arc(-20, 20, 4, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(0, 18, 4, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(20, 22, 4, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = `rgba(79, 255, 143, ${pulse})`;
  ctx.beginPath(); ctx.arc(-20, 20, 2.5, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(0, 18, 2.5, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(20, 22, 2.5, 0, Math.PI * 2); ctx.fill();
  // Glow around ship
  ctx.fillStyle = `rgba(79, 255, 143, ${0.1 * pulse})`;
  ctx.beginPath(); ctx.arc(0, 20, 70, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

function drawDocksScene(ctx, s) {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, "#0a0a1a");
  g.addColorStop(0.55, "#1a1838");
  g.addColorStop(1, "#2a2848");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  // Stars (dimmer)
  for (const st of s.stars) {
    const tw = (Math.sin(s.frame * 0.05 + st.phase) + 1) / 2 * 0.5 + 0.3;
    ctx.globalAlpha = st.base * tw * 0.7;
    ctx.fillStyle = "#ccccdd";
    ctx.fillRect(st.x, st.y, st.size, st.size);
  }
  ctx.globalAlpha = 1;
  // Moon behind clouds
  const moonG = ctx.createRadialGradient(130, 80, 0, 130, 80, 50);
  moonG.addColorStop(0, "rgba(240, 232, 192, 0.25)");
  moonG.addColorStop(1, "rgba(240, 232, 192, 0)");
  ctx.fillStyle = moonG;
  ctx.fillRect(50, 30, 160, 100);
  ctx.fillStyle = "rgba(240, 232, 192, 0.85)";
  ctx.beginPath(); ctx.arc(130, 80, 22, 0, Math.PI * 2); ctx.fill();
  // Distant lighthouse (where Cutler escaped FROM)
  ctx.save();
  ctx.translate(60, 240);
  ctx.scale(0.45, 0.45);
  ctx.fillStyle = "#1a1408";
  ctx.fillRect(-8, -60, 16, 80);
  ctx.fillStyle = "#3a2818";
  ctx.fillRect(-8, -40, 16, 6);
  ctx.fillRect(-8, -20, 16, 6);
  ctx.fillStyle = "#d4a030";
  ctx.fillRect(-6, -74, 12, 14);
  ctx.restore();
  // Ocean
  ctx.fillStyle = "#030814"; ctx.fillRect(0, 250, W, 90);
  // Wave glints
  for (let i = 0; i < 4; i++) {
    ctx.strokeStyle = `rgba(100, 140, 180, ${0.1 + i * 0.04})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 0; x < W; x += 10) {
      const y = 265 + i * 15 + Math.sin((x + s.bgOffset) * 0.04 + i * 1.3) * 2;
      if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  // Shipwreck destination
  const swProgress = Math.min(1, s.distance / FINISH_DISTANCE);
  const swScale = 0.45 + swProgress * 1.2;
  const swX = W - 130 + (1 - swProgress) * 80;
  const swY = 250 - swScale * 8;
  drawShipwreck(ctx, swX, swY, swScale, s.frame);
  // Fog
  for (let i = 0; i < 4; i++) {
    const fogAlpha = 0.16 + i * 0.05;
    ctx.fillStyle = `rgba(160, 170, 200, ${fogAlpha})`;
    const fy = 210 + i * 28;
    const off = (s.bgOffset * 0.14) % 45;
    for (let x = -100; x < W + 100; x += 45) {
      const wob = Math.sin(s.frame * 0.012 + x * 0.02 + i) * 7;
      ctx.beginPath();
      ctx.ellipse(x - off, fy + wob, 62, 13, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  // Detective chaser
  drawDocksChaser(ctx, s);
  // Wooden dock ground
  const dockG = ctx.createLinearGradient(0, GROUND_Y, 0, H);
  dockG.addColorStop(0, "#5a3818"); dockG.addColorStop(1, "#2a1808");
  ctx.fillStyle = dockG;
  ctx.fillRect(0, GROUND_Y, W, H - GROUND_Y);
  // Dock planks (moving boards)
  const plankW = 60;
  const plankOff = s.bgOffset % plankW;
  ctx.strokeStyle = "#0a0604";
  ctx.lineWidth = 2;
  for (let x = -plankOff; x < W + plankW; x += plankW) {
    ctx.beginPath();
    ctx.moveTo(x, GROUND_Y);
    ctx.lineTo(x, H);
    ctx.stroke();
  }
  // Plank horizontal divide
  ctx.fillStyle = "#3a2010";
  ctx.fillRect(0, GROUND_Y, W, 3);
  ctx.fillStyle = "#7a5028";
  ctx.fillRect(0, GROUND_Y + 2, W, 1);
  // Nails on planks
  ctx.fillStyle = "#1a1008";
  for (let x = -plankOff; x < W; x += plankW) {
    ctx.fillRect(x + 8, GROUND_Y + 6, 2, 2);
    ctx.fillRect(x + plankW - 12, GROUND_Y + 6, 2, 2);
    ctx.fillRect(x + plankW / 2 - 1, GROUND_Y + H - GROUND_Y - 10, 2, 2);
  }
  // Plank grain
  ctx.strokeStyle = "rgba(20, 10, 5, 0.5)";
  ctx.lineWidth = 1;
  for (let x = -plankOff; x < W; x += plankW) {
    ctx.beginPath();
    ctx.moveTo(x + plankW / 2, GROUND_Y + 10);
    ctx.lineTo(x + plankW / 2 + 3, H);
    ctx.stroke();
  }
}

function drawDocksObstacle(ctx, o, s) {
  ctx.save();
  ctx.translate(o.x, o.y);
  if (o.key === "rope") {
    // Coiled rope
    ctx.fillStyle = "#1a1008";
    ctx.beginPath(); ctx.ellipse(o.w / 2, o.h - 3, o.w / 2, 4, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "#8a5828"; ctx.lineWidth = 4; ctx.lineCap = "round";
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.ellipse(o.w / 2, o.h - 4 - i * 3, o.w / 2 - 2 - i * 2, 4 - i, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.strokeStyle = "#6a3e18"; ctx.lineWidth = 2;
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.ellipse(o.w / 2, o.h - 4 - i * 3, o.w / 2 - 2 - i * 2, 4 - i, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
  } else if (o.key === "crate") {
    // Wooden fish crate
    ctx.fillStyle = "#2a1808";
    ctx.fillRect(0, 0, o.w, o.h);
    ctx.fillStyle = "#7a5028";
    ctx.fillRect(2, 2, o.w - 4, o.h - 4);
    ctx.fillStyle = "#8a5a2a";
    for (let i = 0; i < 4; i++) {
      ctx.fillRect(4 + i * 10, 4, 6, o.h - 8);
    }
    // Metal brackets
    ctx.fillStyle = "#3a3a3a";
    ctx.fillRect(0, 0, o.w, 4);
    ctx.fillRect(0, o.h - 4, o.w, 4);
    // Stencil text
    ctx.fillStyle = "#1a0f08";
    ctx.font = "bold 7px monospace";
    ctx.fillText("FISH", 9, o.h / 2 + 2);
  } else if (o.key === "netpile") {
    // Fishing net pile
    ctx.fillStyle = "#1a1008";
    ctx.beginPath(); ctx.ellipse(o.w / 2, o.h - 3, o.w / 2, 5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#3a4838";
    ctx.beginPath(); ctx.ellipse(o.w / 2, o.h - 5, o.w / 2 - 3, 7, 0, 0, Math.PI * 2); ctx.fill();
    // Net weave
    ctx.strokeStyle = "#1a2810"; ctx.lineWidth = 1;
    for (let i = 0; i < 12; i++) {
      const bx = 6 + i * 6;
      ctx.beginPath();
      ctx.moveTo(bx, o.h - 2); ctx.lineTo(bx + 3, o.h - 12 + Math.sin(i) * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(bx + 3, o.h - 12 + Math.sin(i) * 2); ctx.lineTo(bx + 6, o.h - 2);
      ctx.stroke();
    }
    // Glass floats
    ctx.fillStyle = "#8ac4e8";
    ctx.beginPath(); ctx.arc(18, o.h - 10, 3, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(o.w - 20, o.h - 8, 3, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#c0e0f0";
    ctx.fillRect(17, o.h - 11, 1, 1);
    ctx.fillRect(o.w - 21, o.h - 9, 1, 1);
  } else if (o.key === "bollard") {
    // Metal mooring post
    ctx.fillStyle = "#0a0604";
    ctx.beginPath(); ctx.ellipse(o.w / 2, o.h - 2, o.w / 2, 3, 0, 0, Math.PI * 2); ctx.fill();
    // Base
    ctx.fillStyle = "#3a3a3a";
    ctx.fillRect(2, o.h - 8, o.w - 4, 6);
    // Post
    ctx.fillStyle = "#4a4a4a";
    ctx.fillRect(7, 8, o.w - 14, o.h - 16);
    ctx.fillStyle = "#6a6a6a";
    ctx.fillRect(8, 8, 3, o.h - 16);
    // Top knob
    ctx.fillStyle = "#3a3a3a";
    ctx.beginPath(); ctx.ellipse(o.w / 2, 8, (o.w - 10) / 2, 4, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#5a5a5a";
    ctx.beginPath(); ctx.arc(o.w / 2, 6, (o.w - 14) / 2, 0, Math.PI * 2); ctx.fill();
    // Rust
    ctx.fillStyle = "rgba(140, 60, 20, 0.4)";
    ctx.fillRect(7, 20, 2, 6);
    ctx.fillRect(o.w - 10, 14, 2, 8);
  }
  ctx.restore();
}

function drawDoubloon(ctx, sn, s) {
  ctx.save();
  const float = Math.sin(s.frame * 0.15 + sn.x * 0.01) * 3;
  ctx.translate(sn.x, sn.y + float);
  // Spin effect via x-scale
  const spin = Math.cos(s.frame * 0.12 + sn.x * 0.02);
  const scaleX = 0.3 + Math.abs(spin) * 0.7;
  ctx.translate(sn.w / 2, sn.h / 2);
  ctx.scale(scaleX, 1);
  // Glow
  const glow = ctx.createRadialGradient(0, 0, 2, 0, 0, sn.w);
  glow.addColorStop(0, "rgba(255, 215, 50, 0.4)");
  glow.addColorStop(1, "rgba(255, 215, 50, 0)");
  ctx.fillStyle = glow;
  ctx.beginPath(); ctx.arc(0, 0, sn.w, 0, Math.PI * 2); ctx.fill();
  // Coin
  ctx.fillStyle = "#c49020";
  ctx.beginPath(); ctx.arc(0, 0, sn.w / 2, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#ffd732";
  ctx.beginPath(); ctx.arc(0, 0, sn.w / 2 - 2, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#c49020";
  // Star/symbol on coin (simplified)
  ctx.fillRect(-1, -5, 2, 10);
  ctx.fillRect(-5, -1, 10, 2);
  ctx.fillStyle = "#fff1a8";
  ctx.fillRect(-3, -5, 2, 2);
  ctx.restore();
}

function drawCutlerPlayer(ctx, s) {
  const p = s.player;
  const flashing = p.flash > 0 && Math.floor(p.flash / 4) % 2 === 0;
  ctx.save();
  ctx.translate(PLAYER_X, p.y);
  // Shadow
  ctx.globalAlpha = 0.3;
  ctx.fillStyle = "#000";
  ctx.beginPath(); ctx.ellipse(PLAYER_W / 2, GROUND_Y - p.y + 2, 17, 4, 0, 0, Math.PI * 2); ctx.fill();
  ctx.globalAlpha = flashing ? 0.4 : 0.95;
  // Ghost aura
  const aura = ctx.createRadialGradient(PLAYER_W / 2, PLAYER_H / 2, 4, PLAYER_W / 2, PLAYER_H / 2, 44);
  aura.addColorStop(0, "rgba(79, 255, 143, 0.45)");
  aura.addColorStop(1, "rgba(79, 255, 143, 0)");
  ctx.fillStyle = aura;
  ctx.fillRect(-22, -15, PLAYER_W + 44, PLAYER_H + 30);

  const cycle = s.frame * 0.36;
  const running = p.onGround;
  const legA = running ? Math.max(0, Math.sin(cycle)) * 5 : 2;
  const legB = running ? Math.max(0, Math.sin(cycle + Math.PI)) * 5 : 2;
  const armSwing = Math.sin(cycle) * 3;

  // BACK LEG
  ctx.fillStyle = "#2a6a4a";
  ctx.fillRect(10, 34 - legA, 7, 14);
  ctx.fillStyle = "#0a2a1a";
  ctx.fillRect(9, 46 - legA, 9, 4);

  // BODY (diving suit)
  ctx.fillStyle = "#4fff8f";
  ctx.fillRect(8, 18, 20, 22);
  // Suit seams
  ctx.fillStyle = "#2d7a44";
  ctx.fillRect(8, 18, 20, 2);
  ctx.fillRect(8, 26, 20, 1);
  ctx.fillRect(17, 18, 2, 22);
  // Belt
  ctx.fillStyle = "#1a3a24";
  ctx.fillRect(8, 30, 20, 4);
  ctx.fillStyle = "#d4a030";
  ctx.fillRect(16, 31, 4, 2);

  // Back arm
  ctx.fillStyle = "#4fff8f";
  ctx.fillRect(4, 22 + armSwing, 5, 12);
  ctx.fillStyle = "#2d7a44";
  ctx.fillRect(4, 22 + armSwing, 5, 2);

  // HEAD - diving helmet
  ctx.fillStyle = "#7fffb0";
  ctx.beginPath(); ctx.arc(18, 10, 9, 0, Math.PI * 2); ctx.fill();
  // Helmet base ring
  ctx.fillStyle = "#2d7a44";
  ctx.fillRect(10, 17, 16, 3);
  ctx.fillStyle = "#4fff8f";
  ctx.fillRect(10, 15, 16, 2);
  // Bolts
  ctx.fillStyle = "#1a3a24";
  ctx.fillRect(11, 18, 1, 1);
  ctx.fillRect(14, 18, 1, 1);
  ctx.fillRect(21, 18, 1, 1);
  ctx.fillRect(24, 18, 1, 1);
  // Visor
  ctx.fillStyle = "#08201a";
  ctx.beginPath();
  ctx.ellipse(18, 10, 6, 3.5, 0, 0, Math.PI * 2);
  ctx.fill();
  // Glowing eyes
  ctx.fillStyle = "#e0ffe8";
  ctx.fillRect(15, 9, 2, 2);
  ctx.fillRect(20, 9, 2, 2);
  // Helmet top bolt
  ctx.fillStyle = "#2a4a3a";
  ctx.fillRect(17, 2, 2, 3);
  // Helmet side air vents
  ctx.fillStyle = "#2a4a3a";
  ctx.beginPath(); ctx.arc(10, 10, 2, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(26, 10, 2, 0, Math.PI * 2); ctx.fill();

  // Front arm
  ctx.fillStyle = "#4fff8f";
  ctx.fillRect(27, 22 - armSwing, 5, 12);
  ctx.fillStyle = "#2d7a44";
  ctx.fillRect(27, 22 - armSwing, 5, 2);
  // Gloved hand
  ctx.fillStyle = "#2d7a44";
  ctx.beginPath(); ctx.arc(30, 35 - armSwing, 3, 0, Math.PI * 2); ctx.fill();

  // FRONT LEG
  ctx.fillStyle = "#2a6a4a";
  ctx.fillRect(20, 34 - legB, 7, 14);
  ctx.fillStyle = "#0a2a1a";
  ctx.fillRect(19, 46 - legB, 9, 4);

  ctx.restore();
  ctx.globalAlpha = 1;
}

// ============ THEMES CONFIG ============

const THEMES = {
  detective: {
    id: "detective",
    name: "Detective Dog",
    role: "hero",
    tagline: "Solve the Captain Cutler mystery.",
    accent: "#4fff8f",
    collectibleEmoji: "🦴",
    collectibleName: "Scooby Snack",
    destinationName: "the lighthouse",
    chaserName: "Captain Cutler",
    introTitle: "Captain Cutler",
    introSubtitle: "Act 1 · The Chase",
    hasStoryMode: true,
    obstacles: OBSTACLES_BEACH,
    obstacleKeys: Object.keys(OBSTACLES_BEACH),
    drawScene: drawBeachScene,
    drawObstacle: drawObstacle,
    drawCollectible: drawSnack,
    drawPlayer: drawPlayer,
  },
  miner: {
    id: "miner",
    name: "Miner Forty Niner",
    role: "villain",
    tagline: "Escape to your secret gold vein.",
    accent: "#ffc850",
    collectibleEmoji: "💰",
    collectibleName: "Gold Nugget",
    destinationName: "the gold vein",
    chaserName: "the detective",
    introTitle: "The Haunted Mine",
    introSubtitle: "Villain Mode",
    hasStoryMode: false,
    obstacles: OBSTACLES_MINE,
    obstacleKeys: Object.keys(OBSTACLES_MINE),
    drawScene: drawMineScene,
    drawObstacle: drawMineObstacle,
    drawCollectible: drawGoldNugget,
    drawPlayer: drawMinerGhost,
  },
  cutler: {
    id: "cutler",
    name: "Captain Cutler",
    role: "villain",
    tagline: "Reach the sunken shipwreck before the detective catches you.",
    accent: "#4fff8f",
    collectibleEmoji: "🪙",
    collectibleName: "Gold Doubloon",
    destinationName: "the shipwreck",
    chaserName: "the detective",
    introTitle: "The Ghost's Escape",
    introSubtitle: "Villain Mode",
    hasStoryMode: false,
    obstacles: OBSTACLES_DOCKS,
    obstacleKeys: Object.keys(OBSTACLES_DOCKS),
    drawScene: drawDocksScene,
    drawObstacle: drawDocksObstacle,
    drawCollectible: drawDoubloon,
    drawPlayer: drawCutlerPlayer,
  },
};

// ============ GAME CANVAS ============
function GameCanvas({ playerName, difficulty, theme, onGameOver }) {
  const canvasRef = useRef(null);
  const stateRef = useRef(null);
  const runningRef = useRef(true);

  useEffect(() => {
    const cfg = DIFFICULTY[difficulty];
    stateRef.current = {
      player: { y: GROUND_Y - PLAYER_H, vy: 0, onGround: true, invuln: 0, flash: 0 },
      obstacles: [],
      snacks: [],
      particles: [],
      distance: 0,
      snacks_collected: 0,
      hits: 0,
      speed: cfg.baseSpeed,
      cfg,
      frame: 0,
      nextSpawn: 50,
      bgOffset: 0,
      stars: seedStars(35),
      cutlerCloseness: 0,
      cutlerWobble: 0,
      ended: false,
      winFlash: 0,
    };
    runningRef.current = true;
  }, [difficulty]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    let rafId;
    runningRef.current = true;

    const jump = () => {
      const s = stateRef.current;
      if (!s || !runningRef.current || s.ended) return;
      if (s.player.onGround) {
        s.player.vy = JUMP_V;
        s.player.onGround = false;
        playSound("jump");
      }
    };
    const onKey = (e) => {
      if (e.code === "Space" || e.code === "ArrowUp" || e.code === "ArrowDown") {
        e.preventDefault();
        jump();
      }
    };
    const onMouse = () => jump();
    const onTouch = (e) => { e.preventDefault(); jump(); };

    window.addEventListener("keydown", onKey);
    canvas.addEventListener("mousedown", onMouse);
    canvas.addEventListener("touchstart", onTouch, { passive: false });

    const update = () => {
      const s = stateRef.current;
      if (!s || s.ended) return;
      s.frame++;
      const p = s.player;
      p.vy += GRAVITY;
      p.y += p.vy;
      if (p.y >= GROUND_Y - PLAYER_H) {
        p.y = GROUND_Y - PLAYER_H;
        p.vy = 0;
        p.onGround = true;
      }
      if (p.invuln > 0) p.invuln--;
      if (p.flash > 0) p.flash--;

      s.speed = s.cfg.baseSpeed + s.frame * s.cfg.speedGrow * 3;
      s.distance += DISTANCE_PER_FRAME;
      s.bgOffset += s.speed * 0.3;
      s.cutlerWobble += 0.04;
      if (s.cutlerCloseness > 0) s.cutlerCloseness = Math.max(0, s.cutlerCloseness - 0.0012);

      s.nextSpawn--;
      if (s.nextSpawn <= 0 && s.distance < FINISH_DISTANCE - 60) {
        const key = theme.obstacleKeys[Math.floor(Math.random() * theme.obstacleKeys.length)];
        const def = theme.obstacles[key];
        s.obstacles.push({
          key, x: W + 30, y: GROUND_Y - def.h,
          w: def.w, h: def.h, hitPad: def.hitPad,
        });
        if (Math.random() < s.cfg.snackChance) {
          s.snacks.push({
            x: W + 180 + Math.random() * 120,
            y: GROUND_Y - 90 - Math.random() * 35,
            w: 22, h: 22,
          });
        }
        const range = s.cfg.spawnMax - s.cfg.spawnMin;
        s.nextSpawn = s.cfg.spawnMin + Math.random() * range;
      }

      for (let i = s.obstacles.length - 1; i >= 0; i--) {
        const o = s.obstacles[i];
        o.x -= s.speed;
        if (o.x + o.w < -30) { s.obstacles.splice(i, 1); continue; }
        if (p.invuln === 0 && intersects(p, o)) {
          s.hits++;
          p.invuln = 60;
          p.flash = 30;
          s.cutlerCloseness = Math.min(1, s.cutlerCloseness + 0.32);
          playSound("hit");
          spawnParticles(s, PLAYER_X + PLAYER_W / 2, p.y + PLAYER_H / 2, "#ff5c5c", 10);
          if (s.hits >= 3) {
            s.ended = true;
            playSound("lose");
            runningRef.current = false;
            const r = {
              won: false,
              distance: Math.floor(s.distance),
              snacks: s.snacks_collected,
              hits: s.hits,
              stars: 0,
            };
            setTimeout(() => onGameOver(r), 700);
            return;
          }
        }
      }

      for (let i = s.snacks.length - 1; i >= 0; i--) {
        const sn = s.snacks[i];
        sn.x -= s.speed;
        if (sn.x + sn.w < -30) { s.snacks.splice(i, 1); continue; }
        if (intersects(p, { ...sn, hitPad: 2 })) {
          s.snacks_collected++;
          playSound("snack");
          spawnParticles(s, sn.x + sn.w / 2, sn.y + sn.h / 2, "#ffdf7a", 8);
          s.snacks.splice(i, 1);
        }
      }

      for (let i = s.particles.length - 1; i >= 0; i--) {
        const pt = s.particles[i];
        pt.x += pt.vx;
        pt.y += pt.vy;
        pt.vy += 0.3;
        pt.life--;
        if (pt.life <= 0) s.particles.splice(i, 1);
      }

      if (s.distance >= FINISH_DISTANCE && !s.ended) {
        s.ended = true;
        s.winFlash = 1;
        playSound("win");
        runningRef.current = false;
        let stars = 1;
        if (s.snacks_collected >= 5) stars = 2;
        if (s.snacks_collected >= 5 && s.hits === 0) stars = 3;
        const r = {
          won: true,
          distance: FINISH_DISTANCE,
          snacks: s.snacks_collected,
          hits: s.hits,
          stars,
        };
        setTimeout(() => onGameOver(r), 1400);
      }
    };

    const render = () => {
      const s = stateRef.current;
      if (!s) return;
      // Theme-specific background, destination, chaser, ground
      theme.drawScene(ctx, s);
      // Obstacles
      for (const o of s.obstacles) theme.drawObstacle(ctx, o, s);
      // Collectibles
      for (const sn of s.snacks) theme.drawCollectible(ctx, sn, s);
      // Particles
      for (const pt of s.particles) {
        ctx.globalAlpha = pt.life / pt.maxLife;
        ctx.fillStyle = pt.color;
        ctx.fillRect(pt.x, pt.y, pt.size, pt.size);
      }
      ctx.globalAlpha = 1;
      // Player
      theme.drawPlayer(ctx, s);
      // HUD
      drawHUD(ctx, s, theme);
      // Win flash
      if (s.ended && s.distance >= FINISH_DISTANCE) {
        s.winFlash = Math.max(0, s.winFlash - 0.015);
        ctx.fillStyle = `rgba(255, 223, 122, ${s.winFlash * 0.5})`;
        ctx.fillRect(0, 0, W, H);
      }
    };

    const loop = () => {
      if (!runningRef.current && !stateRef.current?.ended) return;
      update();
      render();
      if (runningRef.current || (stateRef.current && stateRef.current.winFlash > 0)) {
        rafId = requestAnimationFrame(loop);
      }
    };
    rafId = requestAnimationFrame(loop);

    return () => {
      runningRef.current = false;
      cancelAnimationFrame(rafId);
      window.removeEventListener("keydown", onKey);
      canvas.removeEventListener("mousedown", onMouse);
      canvas.removeEventListener("touchstart", onTouch);
    };
  }, [onGameOver, theme]);

  // Force re-attach if difficulty changes (for retry)
  useEffect(() => {}, [difficulty]);

  return (
    <div className="w-full max-w-4xl">
      <div className="relative">
        <canvas
          ref={canvasRef}
          width={W}
          height={H}
          style={{
            width: "100%",
            height: "auto",
            display: "block",
            borderRadius: "12px",
            touchAction: "manipulation",
            boxShadow: `0 20px 60px -10px ${theme.accent}40, 0 0 0 1px ${theme.accent}33`,
            cursor: "pointer",
            imageRendering: "auto",
          }}
        />
        <div className="absolute top-2 left-2 text-xs tracking-widest pointer-events-none select-none" style={{ color: `${theme.accent}bb` }}>
          TAP / SPACE TO JUMP
        </div>
      </div>
      <div className="mt-3 text-center text-xs text-slate-500 tracking-widest">
        <span style={{ color: theme.accent }}>{theme.name.toUpperCase()}</span>
        &nbsp; · &nbsp;
        <span className="text-yellow-200">{DIFFICULTY[difficulty].label.toUpperCase()}</span>
        {playerName && <>&nbsp; · &nbsp;<span className="text-slate-400">"{playerName.toUpperCase()}"</span></>}
      </div>
    </div>
  );
}

// ============ START SCREEN ============

function MiniCharacterPreview({ themeId, accent }) {
  // Tiny visual preview sprites for the character picker
  if (themeId === "detective") {
    return (
      <svg viewBox="0 0 52 52" className="w-full h-full">
        <circle cx="26" cy="26" r="24" fill={`${accent}22`} />
        {/* Dog */}
        <ellipse cx="26" cy="38" rx="15" ry="4" fill="rgba(0,0,0,0.25)" />
        <ellipse cx="24" cy="30" rx="12" ry="8" fill="#8a5a2a" />
        <ellipse cx="33" cy="24" rx="8" ry="7" fill="#8a5a2a" />
        <ellipse cx="38" cy="27" rx="4" ry="3" fill="#b88555" />
        <circle cx="40" cy="26" r="1.3" fill="#1a0f08" />
        <ellipse cx="28" cy="19" rx="4" ry="7" fill="#5a3410" transform="rotate(-10 28 19)" />
        <rect x="20" y="28" width="12" height="4" fill="#b83524" />
        <circle cx="26" cy="30" r="2" fill="#e8c043" />
      </svg>
    );
  }
  if (themeId === "miner") {
    return (
      <svg viewBox="0 0 52 52" className="w-full h-full">
        <circle cx="26" cy="26" r="24" fill={`${accent}22`} />
        {/* Miner ghost */}
        <ellipse cx="26" cy="44" rx="14" ry="3" fill="rgba(0,0,0,0.25)" />
        {/* Body overalls */}
        <rect x="18" y="26" width="16" height="16" fill="#304868" />
        <rect x="20" y="20" width="12" height="8" fill="#8a2218" />
        <rect x="21" y="16" width="3" height="10" fill="#1f3048" />
        <rect x="28" y="16" width="3" height="10" fill="#1f3048" />
        {/* Head */}
        <circle cx="26" cy="14" r="6" fill="#d8c5a8" />
        {/* Beard */}
        <ellipse cx="26" cy="17" rx="5" ry="4" fill="#e8e8e8" />
        {/* Hat */}
        <ellipse cx="26" cy="8" rx="10" ry="2.5" fill="#5a3818" />
        <rect x="22" y="4" width="8" height="5" fill="#4a2a10" />
        {/* Eye */}
        <rect x="27" y="11" width="1.5" height="1.5" fill="#0a0a0a" />
        {/* Lantern */}
        <rect x="34" y="24" width="5" height="6" fill="#1a1408" />
        <rect x="35" y="25" width="3" height="4" fill="#ffc850" />
      </svg>
    );
  }
  if (themeId === "cutler") {
    return (
      <svg viewBox="0 0 52 52" className="w-full h-full">
        <circle cx="26" cy="26" r="24" fill={`${accent}22`} />
        {/* Cutler */}
        <ellipse cx="26" cy="44" rx="14" ry="3" fill="rgba(0,0,0,0.25)" />
        <rect x="18" y="22" width="16" height="18" fill="#4fff8f" />
        <rect x="18" y="22" width="16" height="2" fill="#2d7a44" />
        <rect x="18" y="32" width="16" height="3" fill="#1a3a24" />
        {/* Helmet */}
        <circle cx="26" cy="14" r="9" fill="#7fffb0" />
        <rect x="18" y="21" width="16" height="3" fill="#2d7a44" />
        <ellipse cx="26" cy="14" rx="6" ry="3" fill="#08201a" />
        <rect x="23" y="13" width="2" height="2" fill="#e0ffe8" />
        <rect x="27" y="13" width="2" height="2" fill="#e0ffe8" />
        {/* Glow */}
        <circle cx="26" cy="24" r="22" fill={`${accent}11`} />
      </svg>
    );
  }
  return null;
}

function StartScreen({ onStart }) {
  const [name, setName] = useState("");
  const [selectedTheme, setSelectedTheme] = useState("detective");

  const handleStart = (chosenDiff) => {
    ensureAudio();
    const finalName = name.trim() || (THEMES[selectedTheme].role === "hero" ? "Detective" : THEMES[selectedTheme].name);
    onStart(finalName, chosenDiff, selectedTheme);
  };

  const theme = THEMES[selectedTheme];

  return (
    <div className="max-w-xl w-full text-center">
      <div className="mb-2 text-xs tracking-[0.3em] text-green-300">A COAST BEACH MYSTERY</div>
      <h1
        style={{
          fontFamily: "'Creepster', cursive",
          fontSize: "clamp(2.5rem, 8vw, 4.5rem)",
          color: "#4fff8f",
          textShadow: "0 0 20px rgba(79, 255, 143, 0.6), 2px 2px 0 #082a18",
          letterSpacing: "0.04em",
          margin: 0,
          lineHeight: 1,
        }}
      >
        Captain Cutler
      </h1>

      {/* Character Select */}
      <div className="mt-5 mb-1 text-xs tracking-[0.3em] text-yellow-100">CHOOSE YOUR CHARACTER</div>
      <div className="grid grid-cols-3 gap-2 mb-3">
        {Object.entries(THEMES).map(([id, t]) => {
          const active = selectedTheme === id;
          return (
            <button
              key={id}
              onClick={() => setSelectedTheme(id)}
              className="p-2 rounded-xl transition active:scale-[0.97]"
              style={{
                background: active ? `${t.accent}20` : "rgba(20,20,40,0.7)",
                border: `2px solid ${active ? t.accent : "rgba(100,100,130,0.3)"}`,
                boxShadow: active ? `0 0 24px ${t.accent}55` : "none",
              }}
            >
              <div className="w-full aspect-square rounded-lg overflow-hidden mb-1"
                style={{ background: "rgba(10,10,25,0.6)" }}>
                <MiniCharacterPreview themeId={id} accent={t.accent} />
              </div>
              <div className="text-[11px] font-bold leading-tight"
                style={{ color: active ? t.accent : "#c0c0d0", fontFamily: "'Fredoka',sans-serif" }}>
                {t.name}
              </div>
              <div className="text-[9px] mt-0.5 tracking-widest"
                style={{ color: t.role === "hero" ? "#4fff8f" : "#ff9090" }}>
                {t.role === "hero" ? "HERO" : "VILLAIN"}
              </div>
            </button>
          );
        })}
      </div>

      {/* Character story preview */}
      <div
        className="rounded-xl p-4 mb-4 text-left text-sm text-slate-200 min-h-[120px]"
        style={{
          background: "rgba(10, 10, 30, 0.65)",
          border: `1px solid ${theme.accent}40`,
          backdropFilter: "blur(6px)",
          transition: "border-color 0.3s",
        }}
      >
        {selectedTheme === "detective" && (
          <>
            <p>You're on <span style={{ color: theme.accent }} className="font-semibold">Coast Beach</span> when a green glow appears in the fog. Captain Cutler's ghost is real — and he's coming for you.</p>
            <p className="mt-2 text-xs text-slate-400">Escape to the lighthouse, then solve the mystery in 3 full acts.</p>
          </>
        )}
        {selectedTheme === "miner" && (
          <>
            <p>You're the ghost of <span style={{ color: theme.accent }} className="font-semibold">Miner Forty Niner</span>. A meddling detective is chasing you through your old gold mine.</p>
            <p className="mt-2 text-xs text-slate-400">Reach your secret gold vein before he catches up!</p>
          </>
        )}
        {selectedTheme === "cutler" && (
          <>
            <p>You're <span style={{ color: theme.accent }} className="font-semibold">Captain Cutler</span> — the ghost of the sunken captain. A detective is closing in on your secret.</p>
            <p className="mt-2 text-xs text-slate-400">Race across the foggy docks to the shipwreck and disappear into the deep!</p>
          </>
        )}
      </div>

      <div className="mb-4">
        <label className="block text-xs mb-2 text-yellow-100 tracking-widest">YOUR NAME (OPTIONAL)</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={14}
          placeholder={theme.role === "hero" ? "Enter detective name..." : `Enter ghost name...`}
          className="w-full px-4 py-3 rounded-lg text-white text-center outline-none"
          style={{
            background: "rgba(20, 20, 40, 0.8)",
            border: `2px solid ${theme.accent}40`,
            fontFamily: "'Fredoka', sans-serif",
            fontSize: "1rem",
          }}
        />
      </div>

      <div className="mb-1">
        <div className="text-sm text-yellow-100 mb-2 tracking-widest font-semibold">TAP A DIFFICULTY TO START</div>
        <div className="grid grid-cols-3 gap-2">
          {Object.entries(DIFFICULTY).map(([key, val]) => (
            <button
              key={key}
              onClick={() => handleStart(key)}
              className="py-5 rounded-lg font-bold transition hover:brightness-110 active:scale-[0.97]"
              style={{
                background: `linear-gradient(135deg, ${theme.accent} 0%, ${theme.accent}cc 100%)`,
                color: "#062a14",
                fontFamily: "'Fredoka', sans-serif",
                boxShadow: `0 6px 20px ${theme.accent}55`,
                border: `2px solid ${theme.accent}99`,
              }}
            >
              <div className="text-lg leading-tight">{val.label}</div>
              <div className="text-[10px] opacity-80 mt-1 tracking-widest">▶ PLAY</div>
            </button>
          ))}
        </div>
      </div>

      <div className="mt-6 text-xs text-slate-600 tracking-[0.25em]">
        A MEN CAN CLEAN TOO GAME
      </div>
    </div>
  );
}

// ============ GAME OVER SCREEN ============
function GameOverScreen({ result, playerName, onRetry, onHome, onContinue }) {
  const { won, distance, snacks, hits, stars } = result;

  return (
    <div className="max-w-xl w-full text-center">
      <div className="mb-2 text-xs tracking-[0.3em]" style={{ color: won ? "#4fff8f" : "#ff7070" }}>
        {won ? "ACT 1 COMPLETE" : "CAUGHT!"}
      </div>
      <h2
        style={{
          fontFamily: "'Creepster', cursive",
          fontSize: "clamp(2.5rem, 7vw, 4rem)",
          color: won ? "#ffdf7a" : "#ff7070",
          textShadow: `0 0 20px ${won ? "rgba(255,223,122,0.55)" : "rgba(255,112,112,0.45)"}, 2px 2px 0 #0a0a1a`,
          letterSpacing: "0.03em",
          margin: 0,
          lineHeight: 1.1,
        }}
      >
        {won ? "You Escaped!" : "Cutler Caught Up!"}
      </h2>

      {won ? (
        <div className="text-lg text-slate-200 my-4">
          <span className="text-green-300 font-semibold">{playerName}</span> made it to the lighthouse!
        </div>
      ) : (
        <div className="text-base text-slate-300 my-4">
          The lighthouse was still <span className="text-yellow-200 font-semibold">{FINISH_DISTANCE - distance}m</span> away...
        </div>
      )}

      {/* Stars */}
      <div className="flex justify-center gap-3 my-5 text-5xl">
        {[1, 2, 3].map((i) => (
          <span
            key={i}
            style={{
              color: stars >= i ? "#ffdf7a" : "#2a2a3a",
              filter: stars >= i ? "drop-shadow(0 0 14px rgba(255, 223, 122, 0.65))" : "none",
              transition: "all 0.3s",
            }}
          >★</span>
        ))}
      </div>

      <div
        className="rounded-xl p-4 mb-5 grid grid-cols-3 gap-3"
        style={{
          background: "rgba(10, 10, 30, 0.65)",
          border: "1px solid rgba(79, 255, 143, 0.15)",
        }}
      >
        <Stat label="Distance" value={`${distance}m`} color="#4fff8f" />
        <Stat label="Snacks" value={snacks} color="#ffdf7a" />
        <Stat label="Hits" value={hits} color="#ff7070" />
      </div>

      {won && stars < 3 && (
        <div className="text-[11px] text-slate-400 mb-4 tracking-wide">
          ★ ESCAPE &nbsp;·&nbsp; ★★ ESCAPE + 5 SNACKS &nbsp;·&nbsp; ★★★ NO HITS + 5 SNACKS
        </div>
      )}

      {won && (
        <div
          className="text-sm italic text-slate-300 mb-5 p-3 rounded-lg"
          style={{
            background: "rgba(79, 255, 143, 0.06)",
            border: "1px dashed rgba(79, 255, 143, 0.25)",
          }}
        >
          <p>The lighthouse door creaks open. You slip inside.</p>
          <p className="mt-1">But who else is in here?</p>
        </div>
      )}

      <div className="flex gap-3">
        <button
          onClick={won ? onContinue : onRetry}
          className="flex-1 py-3 rounded-lg text-lg font-bold hover:brightness-110 active:scale-[0.98] transition"
          style={{
            background: "linear-gradient(135deg, #4fff8f, #2dd06e)",
            color: "#062a14",
            fontFamily: "'Fredoka', sans-serif",
            boxShadow: "0 6px 20px rgba(79, 255, 143, 0.3)",
          }}
        >
          {won ? "Continue → Act 2" : "Try Again"}
        </button>
        <button
          onClick={onHome}
          className="flex-1 py-3 rounded-lg text-lg font-semibold transition hover:bg-slate-700"
          style={{
            background: "rgba(30, 30, 55, 0.8)",
            color: "#c0c0d0",
            border: "2px solid rgba(100, 100, 130, 0.3)",
            fontFamily: "'Fredoka', sans-serif",
          }}
        >
          Home
        </button>
      </div>
    </div>
  );
}

function Stat({ label, value, color }) {
  return (
    <div>
      <div className="text-2xl font-bold" style={{ color, fontFamily: "'Fredoka', sans-serif" }}>{value}</div>
      <div className="text-[10px] text-slate-400 tracking-widest mt-1">{label.toUpperCase()}</div>
    </div>
  );
}

// ============ ACT 2: INVESTIGATION DATA ============

const CLUES = {
  guestbook: {
    title: "The Guest Book",
    text: "Last entry tonight: 'Dr. Finch, 6:00 PM.' Someone checked in right before the storm.",
  },
  wetcoat: {
    title: "The Wet Coat",
    text: "A coat hangs by the door, soaked through. Someone was just outside in the rain.",
  },
  paper: {
    title: "Research Paper",
    text: "A study titled 'Gold of the Cutler Shipwreck' — written by Dr. Finch himself.",
  },
  map: {
    title: "Hidden Map",
    text: "Behind a book you find a map. A red X marks the shipwreck location offshore.",
  },
  rubber: {
    title: "Green Rubber",
    text: "A torn piece of glowing green rubber — the exact material of Captain Cutler's diving suit.",
  },
  boots: {
    title: "Wet Boots",
    text: "Scientific boots covered in seaweed and sand. A name tag reads: 'F. Finch.'",
  },
};

const SUSPECTS = {
  seamus: {
    name: "Old Seamus",
    role: "The Fisherman",
    quote: "Been fishing these waters forty years. Captain Cutler's ghost? Pfft. Stories to scare tourists.",
    color: "#6a9aba",
  },
  harlow: {
    name: "Mr. Harlow",
    role: "The Lighthouse Keeper",
    quote: "I've kept this light burning twenty years. I never leave my post at night.",
    color: "#c28a5a",
  },
  finch: {
    name: "Dr. Finch",
    role: "The Marine Archaeologist",
    quote: "I'm only here to study the old shipwreck. Fascinating history. Nothing more.",
    color: "#5fd49a",
  },
};

const ROOMS = ["entry", "study", "storage"];
const ROOM_INFO = {
  entry: { name: "Entry Hall" },
  study: { name: "The Study" },
  storage: { name: "Storage Room" },
};

const HOTSPOTS = {
  entry: [
    { id: "h_guestbook", x: 180, y: 220, w: 90, h: 30, clueId: "guestbook" },
    { id: "h_wetcoat", x: 535, y: 150, w: 80, h: 140, clueId: "wetcoat" },
    { id: "h_portrait", x: 295, y: 60, w: 90, h: 110, ambient: "A painting of Captain Cutler himself. Those painted eyes seem to follow you." },
    { id: "h_clock", x: 35, y: 95, w: 60, h: 230, ambient: "The grandfather clock stopped ticking at 9:47 PM. Strange." },
    { id: "h_lamp", x: 200, y: 195, w: 35, h: 35, ambient: "An old oil lamp, flickering and warm." },
  ],
  study: [
    { id: "h_paper", x: 95, y: 215, w: 130, h: 55, clueId: "paper" },
    { id: "h_bookshelf", x: 450, y: 70, w: 180, h: 230, clueId: "map" },
    { id: "h_globe", x: 255, y: 225, w: 70, h: 90, ambient: "An old wooden globe. Someone circled the coast near here in pencil." },
    { id: "h_fireplace", x: 340, y: 175, w: 95, h: 140, ambient: "Burnt paper in the ashes. Whatever was here, someone didn't want it read." },
    { id: "h_window", x: 35, y: 55, w: 65, h: 110, ambient: "Fog rolls across the water. For a moment you see a green glow move through it..." },
  ],
  storage: [
    { id: "h_divinggear", x: 95, y: 90, w: 100, h: 200, clueId: "rubber" },
    { id: "h_crate", x: 420, y: 195, w: 150, h: 120, clueId: "boots" },
    { id: "h_nets", x: 250, y: 240, w: 140, h: 70, ambient: "Old fishing nets — these belong to Seamus. Nothing unusual." },
    { id: "h_workbench", x: 30, y: 230, w: 60, h: 85, ambient: "Basic tools — hammer, wrench, pliers. Harlow's kit for lighthouse repairs." },
    { id: "h_lantern", x: 590, y: 90, w: 50, h: 100, ambient: "An old storm lantern. It's still warm — someone lit it recently." },
  ],
};

// ============ ACT 2: ROOM BACKDROPS ============

function EntryBackdrop() {
  return (
    <>
      <defs>
        <linearGradient id="entryWall" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#2a2218" />
          <stop offset="100%" stopColor="#4a3a28" />
        </linearGradient>
        <linearGradient id="entryFloor" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#2a1a08" />
          <stop offset="100%" stopColor="#4a3018" />
        </linearGradient>
        <radialGradient id="lampGlow" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0%" stopColor="rgba(255,200,100,0.6)" />
          <stop offset="100%" stopColor="rgba(255,200,100,0)" />
        </radialGradient>
        <radialGradient id="windowGlow" cx="0.5" cy="0.5" r="0.8">
          <stop offset="0%" stopColor="rgba(79,255,143,0.35)" />
          <stop offset="100%" stopColor="rgba(79,255,143,0)" />
        </radialGradient>
      </defs>
      <rect x={0} y={0} width={700} height={320} fill="url(#entryWall)" />
      {[0, 1, 2, 3, 4].map((row) =>
        [0, 1, 2, 3, 4, 5, 6].map((col) => (
          <rect key={`${row}-${col}`}
            x={(row % 2 === 0 ? 0 : -60) + col * 120} y={row * 60 - 30}
            width={100} height={55}
            fill="none" stroke="rgba(0,0,0,0.3)" strokeWidth={1}
          />
        ))
      )}
      <rect x={0} y={320} width={700} height={80} fill="url(#entryFloor)" />
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <line key={i} x1={0} y1={325 + i * 12} x2={700} y2={325 + i * 12} stroke="rgba(0,0,0,0.3)" strokeWidth={1} />
      ))}
      {/* Grandfather clock */}
      <rect x={40} y={100} width={55} height={220} fill="#1a1008" stroke="#0a0604" strokeWidth={2} />
      <circle cx={67} cy={145} r={16} fill="#e8d8b0" />
      <line x1={67} y1={145} x2={67} y2={133} stroke="#1a1a1a" strokeWidth={2} strokeLinecap="round" />
      <line x1={67} y1={145} x2={75} y2={148} stroke="#1a1a1a" strokeWidth={1.5} strokeLinecap="round" />
      <rect x={50} y={170} width={35} height={120} fill="#0a0604" />
      <rect x={60} y={200} width={15} height={80} fill="rgba(212,160,48,0.15)" stroke="rgba(212,160,48,0.3)" strokeWidth={1} />
      {/* Portrait on wall */}
      <rect x={295} y={60} width={90} height={110} fill="#2a1808" stroke="#5a3820" strokeWidth={3} />
      <rect x={302} y={68} width={76} height={94} fill="#0a1018" />
      <circle cx={340} cy={100} r={16} fill="#4fff8f" opacity={0.45} />
      <path d="M 320 120 Q 340 140 360 120 L 360 150 L 320 150 Z" fill="#4fff8f" opacity={0.35} />
      <circle cx={334} cy={97} r={2} fill="#fff" />
      <circle cx={346} cy={97} r={2} fill="#fff" />
      {/* Table */}
      <rect x={165} y={248} width={130} height={10} fill="#2a1808" />
      <rect x={175} y={258} width={10} height={60} fill="#2a1808" />
      <rect x={275} y={258} width={10} height={60} fill="#2a1808" />
      {/* Guest book */}
      <rect x={185} y={232} width={75} height={18} fill="#5a2a20" />
      <rect x={187} y={234} width={71} height={14} fill="#7a3828" />
      <line x1={195} y1={237} x2={250} y2={237} stroke="#3a1a10" strokeWidth={0.5} />
      <line x1={195} y1={241} x2={250} y2={241} stroke="#3a1a10" strokeWidth={0.5} />
      <line x1={195} y1={245} x2={240} y2={245} stroke="#3a1a10" strokeWidth={0.5} />
      {/* Oil lamp */}
      <circle cx={217} cy={215} r={20} fill="url(#lampGlow)" />
      <rect x={211} y={215} width={12} height={16} fill="#d4a030" />
      <polygon points="207,215 227,215 217,203" fill="#ffc850" opacity={0.9} />
      <circle cx={217} cy={210} r={3} fill="#ffe8a0" />
      {/* Staircase at back */}
      <polygon points="400,210 470,210 485,320 385,320" fill="#0a0604" opacity={0.7} />
      {[0, 1, 2, 3, 4].map((i) => (
        <line key={i} x1={395 - i * 3} y1={225 + i * 22} x2={475 + i * 3} y2={225 + i * 22}
          stroke="rgba(120,90,60,0.4)" strokeWidth={1.5} />
      ))}
      {/* Coat rack pole */}
      <rect x={565} y={140} width={6} height={180} fill="#1a1008" />
      <rect x={540} y={135} width={56} height={6} fill="#1a1008" />
      {/* Wet coat */}
      <path d="M 540 150 L 615 150 L 605 290 L 550 290 Z" fill="#3a4a6a" />
      <path d="M 540 150 L 562 150 L 557 180 L 540 180 Z" fill="#2a3a5a" />
      <path d="M 592 150 L 615 150 L 615 180 L 597 180 Z" fill="#2a3a5a" />
      <ellipse cx={572} cy={210} rx={5} ry={3} fill="rgba(0,40,80,0.5)" />
      <ellipse cx={585} cy={240} rx={4} ry={2} fill="rgba(0,40,80,0.5)" />
      <ellipse cx={568} cy={265} rx={3} ry={2} fill="rgba(0,40,80,0.5)" />
      {/* Water drops on floor */}
      <ellipse cx={580} cy={330} rx={8} ry={2} fill="rgba(0,40,80,0.4)" />
      {/* Window with green glow */}
      <rect x={635} y={70} width={50} height={90} fill="#08101a" stroke="#1a1408" strokeWidth={3} />
      <rect x={637} y={72} width={46} height={86} fill="url(#windowGlow)" />
      <line x1={660} y1={70} x2={660} y2={160} stroke="#1a1408" strokeWidth={2} />
      <line x1={635} y1={115} x2={685} y2={115} stroke="#1a1408" strokeWidth={2} />
    </>
  );
}

function StudyBackdrop() {
  return (
    <>
      <defs>
        <linearGradient id="studyWall" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#2a1810" />
          <stop offset="100%" stopColor="#4a3020" />
        </linearGradient>
        <linearGradient id="studyFloor" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#2a1808" />
          <stop offset="100%" stopColor="#4a2e18" />
        </linearGradient>
        <radialGradient id="fireGlow" cx="0.5" cy="0.7" r="0.5">
          <stop offset="0%" stopColor="rgba(255,140,60,0.5)" />
          <stop offset="100%" stopColor="rgba(255,140,60,0)" />
        </radialGradient>
        <radialGradient id="candleGlow" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0%" stopColor="rgba(255,220,120,0.6)" />
          <stop offset="100%" stopColor="rgba(255,220,120,0)" />
        </radialGradient>
      </defs>
      <rect x={0} y={0} width={700} height={320} fill="url(#studyWall)" />
      {/* Wood wall paneling */}
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <line key={i} x1={i * 140} y1={0} x2={i * 140} y2={320} stroke="rgba(0,0,0,0.2)" strokeWidth={1} />
      ))}
      <rect x={0} y={320} width={700} height={80} fill="url(#studyFloor)" />
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <line key={i} x1={0} y1={328 + i * 12} x2={700} y2={328 + i * 12} stroke="rgba(0,0,0,0.3)" strokeWidth={1} />
      ))}
      {/* Window */}
      <rect x={35} y={55} width={65} height={110} fill="#08101a" stroke="#1a1408" strokeWidth={3} />
      <rect x={37} y={57} width={61} height={106} fill="rgba(79,255,143,0.15)" />
      <line x1={67} y1={55} x2={67} y2={165} stroke="#1a1408" strokeWidth={2} />
      <line x1={35} y1={110} x2={100} y2={110} stroke="#1a1408" strokeWidth={2} />
      {/* Desk */}
      <rect x={80} y={250} width={200} height={12} fill="#2a1408" />
      <rect x={90} y={262} width={12} height={58} fill="#2a1408" />
      <rect x={260} y={262} width={12} height={58} fill="#2a1408" />
      <rect x={90} y={285} width={180} height={4} fill="#1a0804" />
      {/* Papers on desk */}
      <rect x={110} y={235} width={70} height={20} fill="#e8d8b0" transform="rotate(-3 145 245)" />
      <rect x={108} y={232} width={70} height={20} fill="#f0e5c0" transform="rotate(-3 143 242)" />
      <line x1={115} y1={241} x2={170} y2={241} stroke="#2a1808" strokeWidth={0.5} />
      <line x1={115} y1={245} x2={165} y2={245} stroke="#2a1808" strokeWidth={0.5} />
      <line x1={115} y1={249} x2={168} y2={249} stroke="#2a1808" strokeWidth={0.5} />
      <rect x={190} y={238} width={30} height={22} fill="#d4b894" transform="rotate(5 205 249)" />
      {/* Candle */}
      <circle cx={245} cy={228} r={18} fill="url(#candleGlow)" />
      <rect x={242} y={230} width={6} height={20} fill="#f0e5c0" />
      <polygon points="240,230 250,230 245,218" fill="#ffc850" />
      <circle cx={245} cy={224} r={2} fill="#ffe8a0" />
      {/* Globe */}
      <rect x={278} y={305} width={14} height={15} fill="#2a1408" />
      <rect x={272} y={300} width={26} height={8} fill="#2a1408" />
      <circle cx={285} cy={265} r={32} fill="#3a6a8a" />
      <path d="M 265 260 Q 285 245 305 265 Q 285 280 265 260" fill="#5a9a3a" opacity={0.7} />
      <path d="M 275 275 Q 285 285 300 278" fill="#5a9a3a" opacity={0.6} />
      <ellipse cx={285} cy={265} rx={32} ry={8} fill="none" stroke="#1a3050" strokeWidth={1} opacity={0.4} />
      <rect x={283} y={235} width={4} height={6} fill="#c8a040" />
      {/* Fireplace */}
      <rect x={335} y={170} width={105} height={150} fill="#0a0604" />
      <rect x={340} y={175} width={95} height={130} fill="#1a1408" />
      <rect x={345} y={175} width={85} height={8} fill="#3a2818" />
      <rect x={335} y={165} width={105} height={10} fill="#3a2818" />
      <circle cx={387} cy={270} r={30} fill="url(#fireGlow)" />
      <polygon points="370,305 385,275 400,305" fill="#d44020" />
      <polygon points="378,305 388,283 400,305" fill="#ff8030" />
      <polygon points="385,305 392,290 402,305" fill="#ffc040" />
      {/* Burnt paper scraps */}
      <rect x={360} y={302} width={10} height={4} fill="#1a0a04" />
      <rect x={395} y={304} width={8} height={3} fill="#2a1408" />
      {/* Bookshelf */}
      <rect x={450} y={70} width={180} height={230} fill="#2a1808" stroke="#1a1008" strokeWidth={2} />
      <rect x={455} y={75} width={170} height={4} fill="#1a1008" />
      <rect x={455} y={140} width={170} height={4} fill="#1a1008" />
      <rect x={455} y={210} width={170} height={4} fill="#1a1008" />
      <rect x={455} y={275} width={170} height={4} fill="#1a1008" />
      {/* Books - shelf 1 */}
      {[{ c: "#8a2a1a", w: 16 }, { c: "#2a5a8a", w: 14 }, { c: "#5a6a2a", w: 18 },
      { c: "#8a5a2a", w: 15 }, { c: "#5a2a5a", w: 17 }, { c: "#2a7a5a", w: 14 },
      { c: "#8a2a5a", w: 16 }, { c: "#5a8a2a", w: 13 }, { c: "#3a3a8a", w: 18 },
      { c: "#8a7a2a", w: 14 }].map((b, i) => {
        const startX = 460 + i * 17;
        return <rect key={`b1-${i}`} x={startX} y={85} width={b.w - 1} height={52} fill={b.c} />;
      })}
      {/* Shelf 2 */}
      {[{ c: "#5a2a2a", w: 16 }, { c: "#2a8a5a", w: 15 }, { c: "#5a5a2a", w: 17 },
      { c: "#2a2a8a", w: 14 }, { c: "#8a4a2a", w: 16 }, { c: "#2a5a5a", w: 15 },
      { c: "#7a2a7a", w: 13 }, { c: "#5a7a2a", w: 18 }, { c: "#8a3a5a", w: 14 }].map((b, i) => {
        const startX = 460 + i * 18;
        return <rect key={`b2-${i}`} x={startX} y={150} width={b.w - 1} height={55} fill={b.c} />;
      })}
      {/* Shelf 3 */}
      {[{ c: "#8a2a1a", w: 16 }, { c: "#3a5a8a", w: 17 }, { c: "#2a8a4a", w: 15 },
      { c: "#8a6a2a", w: 14 }, { c: "#5a2a8a", w: 16 }, { c: "#3a8a8a", w: 18 },
      { c: "#8a2a4a", w: 15 }].map((b, i) => {
        const startX = 465 + i * 18;
        return <rect key={`b3-${i}`} x={startX} y={220} width={b.w - 1} height={50} fill={b.c} />;
      })}
    </>
  );
}

function StorageBackdrop() {
  return (
    <>
      <defs>
        <linearGradient id="storageWall" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#1a2028" />
          <stop offset="100%" stopColor="#3a4048" />
        </linearGradient>
        <linearGradient id="storageFloor" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#2a2018" />
          <stop offset="100%" stopColor="#3a3028" />
        </linearGradient>
        <radialGradient id="lanternGlow" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0%" stopColor="rgba(255,200,100,0.45)" />
          <stop offset="100%" stopColor="rgba(255,200,100,0)" />
        </radialGradient>
      </defs>
      <rect x={0} y={0} width={700} height={320} fill="url(#storageWall)" />
      {/* Stone/brick texture */}
      {[0, 1, 2, 3, 4].map((row) =>
        [0, 1, 2, 3, 4, 5, 6, 7].map((col) => (
          <rect key={`${row}-${col}`}
            x={(row % 2 === 0 ? 0 : -50) + col * 100} y={row * 66 - 30}
            width={80} height={60}
            fill="none" stroke="rgba(0,0,0,0.4)" strokeWidth={1.5}
          />
        ))
      )}
      <rect x={0} y={320} width={700} height={80} fill="url(#storageFloor)" />
      {/* Diving gear on wall hook */}
      <rect x={135} y={85} width={8} height={10} fill="#5a5a5a" />
      {/* Diving helmet */}
      <circle cx={145} cy={115} r={24} fill="#9ab8c0" stroke="#4a6068" strokeWidth={2} />
      <circle cx={145} cy={115} r={20} fill="#6a8088" />
      <ellipse cx={145} cy={112} rx={10} ry={7} fill="#08201a" />
      <rect x={132} y={138} width={26} height={8} fill="#4a6068" />
      {/* Diving suit */}
      <rect x={118} y={146} width={54} height={85} fill="#2d7a44" />
      <rect x={118} y={146} width={54} height={5} fill="#1a5a2a" />
      <rect x={125} y={155} width={15} height={70} fill="#3d8a54" />
      <rect x={150} y={155} width={15} height={70} fill="#3d8a54" />
      {/* Air hose */}
      <path d="M 155 95 Q 170 100 175 130" stroke="#2a2a2a" strokeWidth={4} fill="none" />
      {/* Torn green patch visible */}
      <polygon points="160,175 185,172 188,195 165,198" fill="#4fff8f" opacity={0.8} />
      <polygon points="168,178 180,177 182,190" fill="#2d7a44" />
      {/* Legs */}
      <rect x={122} y={231} width={18} height={50} fill="#1d5a34" />
      <rect x={152} y={231} width={18} height={50} fill="#1d5a34" />
      {/* Boots */}
      <rect x={118} y={278} width={24} height={14} fill="#0a0804" />
      <rect x={150} y={278} width={24} height={14} fill="#0a0804" />
      {/* Fishing nets pile */}
      <ellipse cx={320} cy={290} rx={80} ry={25} fill="#3a5030" />
      {[0, 1, 2, 3, 4].map((i) => {
        const y = 275 + i * 4;
        return <path key={`net${i}`} d={`M 250 ${y} Q 320 ${y - 8} 390 ${y}`} stroke="#1a2a10" strokeWidth={1.5} fill="none" />;
      })}
      {/* Net knots */}
      {[...Array(8)].map((_, i) => (
        <circle key={`knot${i}`} cx={260 + i * 17} cy={280 + Math.sin(i) * 3} r={2} fill="#1a1a0a" />
      ))}
      {/* Workbench */}
      <rect x={30} y={260} width={70} height={10} fill="#4a3018" />
      <rect x={35} y={270} width={8} height={50} fill="#4a3018" />
      <rect x={88} y={270} width={8} height={50} fill="#4a3018" />
      <rect x={30} y={260} width={70} height={3} fill="#2a1808" />
      {/* Tools on workbench */}
      <rect x={45} y={253} width={4} height={7} fill="#8a8a8a" />
      <rect x={43} y={248} width={8} height={5} fill="#2a2a2a" />
      <rect x={60} y={255} width={20} height={3} fill="#8a8a8a" />
      <circle cx={82} cy={256} r={4} fill="#4a4a4a" />
      {/* Crates stacked */}
      <rect x={420} y={230} width={150} height={90} fill="#5a3a20" stroke="#2a1808" strokeWidth={2} />
      <rect x={425} y={235} width={140} height={80} fill="#6a4828" />
      <line x1={420} y1={275} x2={570} y2={275} stroke="#2a1808" strokeWidth={1.5} />
      <rect x={430} y={240} width={60} height={30} fill="#7a5830" opacity={0.4} />
      <text x={450} y={260} fontSize="10" fill="#2a1808" fontFamily="monospace" fontWeight="bold">F.FINCH</text>
      {/* Top crate */}
      <rect x={445} y={195} width={100} height={40} fill="#5a3a20" stroke="#2a1808" strokeWidth={2} />
      <rect x={448} y={198} width={94} height={34} fill="#6a4828" />
      {/* Hanging lantern */}
      <line x1={615} y1={40} x2={615} y2={95} stroke="#1a1a1a" strokeWidth={2} />
      <circle cx={615} cy={140} r={26} fill="url(#lanternGlow)" />
      <rect x={600} y={95} width={30} height={50} fill="#2a2418" stroke="#1a140a" strokeWidth={2} />
      <rect x={605} y={100} width={20} height={30} fill="#ffc850" opacity={0.6} />
      <circle cx={615} cy={115} r={4} fill="#ffe8a0" />
      <rect x={600} y={92} width={30} height={6} fill="#4a3018" />
    </>
  );
}

// ============ ACT 2: HOTSPOT COMPONENT ============

function Hotspot({ hs, found, onClick }) {
  const isClue = !!hs.clueId;
  const stroke = found ? "#4fff8f" : (isClue ? "rgba(255, 223, 122, 0.55)" : "rgba(200, 200, 255, 0.25)");
  const dash = found ? "0" : "5 5";
  return (
    <g style={{ cursor: "pointer" }} onClick={onClick}>
      <rect
        x={hs.x} y={hs.y} width={hs.w} height={hs.h}
        fill="transparent"
        stroke={stroke} strokeWidth={2} strokeDasharray={dash}
        rx={6}
      >
        {!found && isClue && (
          <animate attributeName="stroke-opacity" values="0.4;0.9;0.4" dur="2s" repeatCount="indefinite" />
        )}
      </rect>
      {/* Invisible larger tap target for kids' fingers */}
      <rect
        x={hs.x - 10} y={hs.y - 10}
        width={hs.w + 20} height={hs.h + 20}
        fill="transparent"
      />
      {found && (
        <g transform={`translate(${hs.x + hs.w - 12}, ${hs.y + 12})`}>
          <circle r={9} fill="#4fff8f" />
          <path d="M-4,0 L-1,3 L4,-3" stroke="#062a14" strokeWidth={2.5} fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </g>
      )}
    </g>
  );
}

// ============ ACT 2: ROOM SCENE ============

function RoomScene({ roomId, foundClues, onHotspot }) {
  const hotspots = HOTSPOTS[roomId];
  return (
    <svg
      viewBox="0 0 700 400"
      className="w-full"
      style={{
        display: "block",
        borderRadius: "12px",
        boxShadow: "0 20px 60px -10px rgba(79, 255, 143, 0.2), 0 0 0 1px rgba(79, 255, 143, 0.2)",
        background: "#0a0a1a",
        touchAction: "manipulation",
      }}
    >
      {roomId === "entry" && <EntryBackdrop />}
      {roomId === "study" && <StudyBackdrop />}
      {roomId === "storage" && <StorageBackdrop />}
      {hotspots.map((hs) => (
        <Hotspot
          key={hs.id}
          hs={hs}
          found={hs.clueId && foundClues.includes(hs.clueId)}
          onClick={() => onHotspot(hs)}
        />
      ))}
    </svg>
  );
}

// ============ ACT 2: MODALS ============

function ModalShell({ children, borderColor, onClose }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0, 0, 0, 0.75)" }}
      onClick={onClose}
    >
      <div
        className="max-w-md w-full p-5 rounded-xl"
        style={{
          background: "#141428",
          border: `2px solid ${borderColor}`,
          boxShadow: `0 0 40px ${borderColor}40`,
          fontFamily: "'Fredoka', sans-serif",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}

function HotspotModal({ hs, isNewClue, onClose }) {
  const clue = hs.clueId ? CLUES[hs.clueId] : null;
  const title = clue ? clue.title : "Hmm...";
  const text = clue ? clue.text : hs.ambient;
  const border = isNewClue ? "#4fff8f" : "rgba(200, 200, 230, 0.3)";
  return (
    <ModalShell borderColor={border} onClose={onClose}>
      {isNewClue && (
        <div className="text-xs tracking-[0.3em] text-green-300 mb-2 font-bold">✓ NEW CLUE FOUND</div>
      )}
      <h3 className="text-xl font-bold mb-3" style={{ color: isNewClue ? "#4fff8f" : "#ffdf7a" }}>
        {title}
      </h3>
      <p className="text-slate-200 mb-4 leading-relaxed">{text}</p>
      <button
        onClick={onClose}
        className="w-full py-3 rounded-lg font-bold transition hover:brightness-110 active:scale-[0.98]"
        style={{
          background: isNewClue ? "linear-gradient(135deg, #4fff8f, #2dd06e)" : "rgba(100, 100, 130, 0.4)",
          color: isNewClue ? "#062a14" : "#e0e0e8",
        }}
      >
        Got it
      </button>
    </ModalShell>
  );
}

function EvidenceModal({ foundClues, onClose }) {
  return (
    <ModalShell borderColor="rgba(79, 255, 143, 0.4)" onClose={onClose}>
      <div className="flex justify-between items-center mb-3">
        <h3 className="text-xl font-bold text-yellow-200">📋 Evidence</h3>
        <span className="text-sm text-slate-400">{foundClues.length} / 6</span>
      </div>
      <div className="space-y-2 max-h-[55vh] overflow-y-auto pr-1">
        {foundClues.length === 0 && (
          <p className="text-slate-400 italic text-sm py-4 text-center">
            No clues yet. Start searching the rooms.
          </p>
        )}
        {foundClues.map((id) => (
          <div
            key={id}
            className="p-3 rounded-lg"
            style={{
              background: "rgba(79, 255, 143, 0.08)",
              border: "1px solid rgba(79, 255, 143, 0.25)",
            }}
          >
            <div className="text-sm font-bold text-green-300">{CLUES[id].title}</div>
            <div className="text-xs text-slate-300 mt-1 leading-relaxed">{CLUES[id].text}</div>
          </div>
        ))}
      </div>
      <button
        onClick={onClose}
        className="w-full mt-4 py-2.5 rounded-lg font-semibold"
        style={{ background: "rgba(100, 100, 130, 0.3)", color: "#c0c0d0" }}
      >
        Close
      </button>
    </ModalShell>
  );
}

function SuspectsModal({ foundClues, onAccuse, onClose }) {
  const [selected, setSelected] = useState(null);
  const canAccuse = foundClues.length === 6;
  return (
    <ModalShell borderColor="rgba(255, 96, 96, 0.4)" onClose={onClose}>
      <h3 className="text-xl font-bold text-yellow-200 mb-1">🔍 Suspects</h3>
      <p className="text-xs text-slate-400 mb-4">One of them is Captain Cutler in disguise.</p>
      <div className="space-y-2 max-h-[50vh] overflow-y-auto pr-1">
        {Object.entries(SUSPECTS).map(([id, s]) => (
          <div
            key={id}
            onClick={() => canAccuse && setSelected(id)}
            className="p-3 rounded-lg transition"
            style={{
              background: selected === id ? "rgba(255, 96, 96, 0.18)" : "rgba(79, 255, 143, 0.06)",
              border: `2px solid ${selected === id ? "#ff6060" : "rgba(79, 255, 143, 0.2)"}`,
              cursor: canAccuse ? "pointer" : "default",
            }}
          >
            <div className="flex items-center gap-3">
              <div
                className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-white"
                style={{ background: s.color, flexShrink: 0 }}
              >
                {s.name.charAt(0)}
              </div>
              <div className="min-w-0">
                <div className="font-bold" style={{ color: s.color }}>{s.name}</div>
                <div className="text-[11px] text-slate-400">{s.role}</div>
              </div>
            </div>
            <div className="text-xs italic text-slate-300 mt-2 leading-relaxed">"{s.quote}"</div>
          </div>
        ))}
      </div>
      {!canAccuse && (
        <p className="text-xs text-center text-slate-500 mt-3">
          Find all 6 clues to make an accusation ({foundClues.length} / 6)
        </p>
      )}
      {canAccuse && selected && (
        <button
          onClick={() => onAccuse(selected)}
          className="w-full mt-3 py-3 rounded-lg font-bold text-lg transition hover:brightness-110 active:scale-[0.98]"
          style={{
            background: "linear-gradient(135deg, #ff6060, #d84040)",
            color: "#fff",
            boxShadow: "0 6px 20px rgba(255, 96, 96, 0.4)",
          }}
        >
          ACCUSE {SUSPECTS[selected].name.toUpperCase()}!
        </button>
      )}
      <button
        onClick={onClose}
        className="w-full mt-2 py-2 rounded-lg font-semibold"
        style={{ background: "rgba(100, 100, 130, 0.3)", color: "#c0c0d0" }}
      >
        Close
      </button>
    </ModalShell>
  );
}

// ============ ACT 2: INVESTIGATION INTRO ============

function InvestigationIntro({ playerName, onStart }) {
  return (
    <div className="max-w-xl w-full text-center">
      <div className="mb-2 text-xs tracking-[0.3em] text-green-300">ACT 2</div>
      <h2
        style={{
          fontFamily: "'Creepster', cursive",
          fontSize: "clamp(2.5rem, 8vw, 4.5rem)",
          color: "#ffdf7a",
          textShadow: "0 0 20px rgba(255,223,122,0.5), 2px 2px 0 #3a2a08",
          letterSpacing: "0.04em",
          margin: 0,
          lineHeight: 1,
        }}
      >
        The Investigation
      </h2>
      <div
        className="rounded-xl p-5 my-6 text-left space-y-3 text-slate-200"
        style={{
          background: "rgba(10, 10, 30, 0.65)",
          border: "1px solid rgba(255, 223, 122, 0.2)",
        }}
      >
        <p>You slam the lighthouse door shut behind you. Three people look up, startled.</p>
        <p>An old <span className="text-blue-300 font-semibold">fisherman</span>. The <span className="text-orange-300 font-semibold">lighthouse keeper</span>. A <span className="text-green-300 font-semibold">scientist</span> in a lab coat.</p>
        <p className="text-yellow-200 font-bold">One of them is Captain Cutler.</p>
        <p className="text-sm text-slate-300">Search each room. Tap objects that glow to inspect them. Find all <span className="text-green-300 font-bold">6 clues</span>, then accuse the right suspect.</p>
      </div>
      <button
        onClick={onStart}
        className="w-full py-4 rounded-lg text-xl font-bold transition hover:brightness-110 active:scale-[0.98]"
        style={{
          background: "linear-gradient(135deg, #ffdf7a, #d4a030)",
          color: "#3a2a08",
          fontFamily: "'Fredoka', sans-serif",
          boxShadow: "0 8px 28px rgba(255, 223, 122, 0.35)",
          letterSpacing: "0.04em",
        }}
      >
        START INVESTIGATING →
      </button>
      <div className="mt-4 text-xs text-slate-500 tracking-widest">
        DETECTIVE: <span className="text-green-300">{playerName.toUpperCase()}</span>
      </div>
    </div>
  );
}

// ============ ACT 2: INVESTIGATION GAME ============

function InvestigationGame({ playerName, onSolved }) {
  const [currentRoom, setCurrentRoom] = useState("entry");
  const [foundClues, setFoundClues] = useState([]);
  const [activeHotspot, setActiveHotspot] = useState(null);
  const [hotspotIsNew, setHotspotIsNew] = useState(false);
  const [showEvidence, setShowEvidence] = useState(false);
  const [showSuspects, setShowSuspects] = useState(false);
  const [wrongAccuse, setWrongAccuse] = useState(null);

  const handleHotspot = (hs) => {
    const isNew = hs.clueId && !foundClues.includes(hs.clueId);
    if (isNew) {
      setFoundClues([...foundClues, hs.clueId]);
      playSound("snack");
    }
    setActiveHotspot(hs);
    setHotspotIsNew(isNew);
  };

  const handleAccuse = (suspectId) => {
    setShowSuspects(false);
    if (suspectId === "finch") {
      playSound("win");
      setTimeout(() => onSolved(suspectId), 300);
    } else {
      playSound("hit");
      setWrongAccuse(suspectId);
    }
  };

  return (
    <div className="max-w-4xl w-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="text-[10px] text-yellow-200 tracking-[0.3em]">ACT 2 · INVESTIGATION</div>
          <div className="text-xl font-bold" style={{ color: "#4fff8f", fontFamily: "'Fredoka', sans-serif" }}>
            {ROOM_INFO[currentRoom].name}
          </div>
        </div>
        <div className="text-right">
          <div className="text-[10px] text-slate-400 tracking-[0.3em]">CLUES</div>
          <div className="text-2xl font-bold text-yellow-200" style={{ fontFamily: "'Fredoka', sans-serif" }}>
            {foundClues.length} <span className="text-slate-500 text-base">/ 6</span>
          </div>
        </div>
      </div>

      {/* Scene */}
      <div className="mb-3">
        <RoomScene roomId={currentRoom} foundClues={foundClues} onHotspot={handleHotspot} />
      </div>

      {/* Room tabs */}
      <div className="grid grid-cols-3 gap-2 mb-3">
        {ROOMS.map((r) => (
          <button
            key={r}
            onClick={() => setCurrentRoom(r)}
            className="py-3 rounded-lg font-bold transition active:scale-[0.98]"
            style={{
              background: currentRoom === r ? "linear-gradient(135deg, #4fff8f, #2dd06e)" : "rgba(30, 30, 55, 0.8)",
              color: currentRoom === r ? "#062a14" : "#c0c0d0",
              border: `2px solid ${currentRoom === r ? "#4fff8f" : "rgba(100, 100, 130, 0.3)"}`,
              fontFamily: "'Fredoka', sans-serif",
              fontSize: "0.9rem",
            }}
          >
            {ROOM_INFO[r].name}
          </button>
        ))}
      </div>

      {/* Action row */}
      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={() => setShowEvidence(true)}
          className="py-3 rounded-lg font-bold transition active:scale-[0.98]"
          style={{
            background: "rgba(79, 255, 143, 0.15)",
            color: "#4fff8f",
            border: "2px solid rgba(79, 255, 143, 0.4)",
            fontFamily: "'Fredoka', sans-serif",
          }}
        >
          📋 Evidence ({foundClues.length})
        </button>
        <button
          onClick={() => setShowSuspects(true)}
          className="py-3 rounded-lg font-bold transition active:scale-[0.98]"
          style={{
            background: foundClues.length === 6
              ? "linear-gradient(135deg, #ff6060, #d84040)"
              : "rgba(200, 80, 80, 0.15)",
            color: foundClues.length === 6 ? "#fff" : "#ff9090",
            border: "2px solid rgba(255, 96, 96, 0.4)",
            fontFamily: "'Fredoka', sans-serif",
            boxShadow: foundClues.length === 6 ? "0 0 20px rgba(255, 96, 96, 0.4)" : "none",
          }}
        >
          🔍 {foundClues.length === 6 ? "ACCUSE!" : "Suspects"}
        </button>
      </div>

      {/* Modals */}
      {activeHotspot && (
        <HotspotModal
          hs={activeHotspot}
          isNewClue={hotspotIsNew}
          onClose={() => setActiveHotspot(null)}
        />
      )}
      {showEvidence && (
        <EvidenceModal foundClues={foundClues} onClose={() => setShowEvidence(false)} />
      )}
      {showSuspects && (
        <SuspectsModal
          foundClues={foundClues}
          onAccuse={handleAccuse}
          onClose={() => setShowSuspects(false)}
        />
      )}
      {wrongAccuse && (
        <ModalShell borderColor="#ff6060" onClose={() => setWrongAccuse(null)}>
          <div className="text-xs tracking-[0.3em] text-red-300 mb-2 font-bold">NOT QUITE</div>
          <h3 className="text-xl font-bold mb-3 text-red-300">Not {SUSPECTS[wrongAccuse].name}</h3>
          <p className="text-slate-200 mb-4 leading-relaxed">
            The evidence doesn't quite add up to them. Look at your clues again — who do ALL of them point to?
          </p>
          <button
            onClick={() => setWrongAccuse(null)}
            className="w-full py-3 rounded-lg font-bold transition hover:brightness-110"
            style={{
              background: "linear-gradient(135deg, #ff6060, #d84040)",
              color: "#fff",
            }}
          >
            Check the clues again
          </button>
        </ModalShell>
      )}
    </div>
  );
}

// ============ ACT 2: END SCREEN ============

function InvestigationEnd({ playerName, onHome, onReplay, onContinue }) {
  return (
    <div className="max-w-xl w-full text-center">
      <div className="mb-2 text-xs tracking-[0.3em] text-green-300">ACT 2 COMPLETE</div>
      <h2
        style={{
          fontFamily: "'Creepster', cursive",
          fontSize: "clamp(2.5rem, 7.5vw, 4.5rem)",
          color: "#4fff8f",
          textShadow: "0 0 24px rgba(79,255,143,0.6), 2px 2px 0 #062a14",
          letterSpacing: "0.03em",
          margin: 0,
          lineHeight: 1.05,
        }}
      >
        Case Solved!
      </h2>

      <div className="my-6">
        <div className="inline-flex items-center gap-3 p-4 rounded-xl" style={{
          background: "rgba(79, 255, 143, 0.1)",
          border: "2px solid rgba(79, 255, 143, 0.3)",
        }}>
          <div className="w-14 h-14 rounded-full flex items-center justify-center text-2xl font-bold text-white" style={{ background: SUSPECTS.finch.color }}>
            F
          </div>
          <div className="text-left">
            <div className="font-bold text-green-300 text-lg">Dr. Finch</div>
            <div className="text-xs text-slate-400">The Marine Archaeologist</div>
          </div>
        </div>
      </div>

      <div
        className="rounded-xl p-5 mb-5 text-left space-y-3 text-slate-200"
        style={{
          background: "rgba(10, 10, 30, 0.65)",
          border: "1px solid rgba(79, 255, 143, 0.2)",
        }}
      >
        <p><span className="text-green-300 font-semibold">{playerName}</span> confronts Dr. Finch with the evidence.</p>
        <p>"You've been scaring everyone away from the coast with your Captain Cutler costume — so you could dig up the shipwreck's gold alone!"</p>
        <p className="italic text-yellow-200">"And I would have gotten away with it, too..."</p>
        <p>Finch bolts for the door, still in his green diving suit. He's trying to escape to the beach!</p>
      </div>

      <div
        className="rounded-xl p-4 mb-5"
        style={{
          background: "rgba(255, 96, 96, 0.08)",
          border: "1px dashed rgba(255, 96, 96, 0.3)",
        }}
      >
        <p className="text-sm text-yellow-200">You need to set a trap before he reaches the shipwreck and disappears for good.</p>
      </div>

      <button
        onClick={onContinue}
        className="w-full py-4 rounded-lg text-xl font-bold transition hover:brightness-110 active:scale-[0.98]"
        style={{
          background: "linear-gradient(135deg, #ff6060, #d84040)",
          color: "#fff",
          fontFamily: "'Fredoka', sans-serif",
          boxShadow: "0 8px 28px rgba(255, 96, 96, 0.4)",
          letterSpacing: "0.04em",
        }}
      >
        CONTINUE → ACT 3
      </button>

      <div className="flex gap-3 mt-3">
        <button
          onClick={onReplay}
          className="flex-1 py-2.5 rounded-lg font-semibold transition"
          style={{
            background: "rgba(79, 255, 143, 0.1)",
            color: "#4fff8f",
            border: "1px solid rgba(79, 255, 143, 0.3)",
            fontFamily: "'Fredoka', sans-serif",
          }}
        >
          Replay Act 2
        </button>
        <button
          onClick={onHome}
          className="flex-1 py-2.5 rounded-lg font-semibold transition"
          style={{
            background: "rgba(30, 30, 55, 0.8)",
            color: "#c0c0d0",
            border: "1px solid rgba(100, 100, 130, 0.3)",
            fontFamily: "'Fredoka', sans-serif",
          }}
        >
          Home
        </button>
      </div>
    </div>
  );
}

// ============ ACT 3: TRAP DATA ============

const TRAP_ITEMS = {
  bait: { name: "Scooby Snack Bait", emoji: "🦴", color: "#ffdf7a", hint: "Yummy smell to lure him close." },
  net:  { name: "Fishing Net",       emoji: "🕸️", color: "#8ac4e8", hint: "Drops from above to catch him." },
  anchor: { name: "Heavy Anchor",    emoji: "⚓", color: "#a0a0b0", hint: "Heavy weight holds the net down." },
};

const TRAP_SLOTS = [
  { n: 1, title: "LURE him close",   hint: "Something tasty to make him stop and sniff.",       expected: "bait",   x: 180, y: 258 },
  { n: 2, title: "SPRING the trap",  hint: "Drops on him when he's distracted.",                expected: "net",    x: 350, y: 258 },
  { n: 3, title: "LOCK him in place",hint: "Heavy enough to hold the net down so he can't run.",expected: "anchor", x: 520, y: 258 },
];

// ============ ACT 3: BEACH SCENE ============

function TrapBeachBackdrop() {
  return (
    <>
      <defs>
        <linearGradient id="nightSky2" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#060418" />
          <stop offset="60%" stopColor="#15103a" />
          <stop offset="100%" stopColor="#2a2050" />
        </linearGradient>
        <linearGradient id="beachSand" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#d4b896" />
          <stop offset="100%" stopColor="#7a5f3e" />
        </linearGradient>
        <radialGradient id="moonHalo" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0%" stopColor="rgba(240,232,192,0.3)" />
          <stop offset="100%" stopColor="rgba(240,232,192,0)" />
        </radialGradient>
        <radialGradient id="lightBeam" cx="0" cy="0.5" r="1">
          <stop offset="0%" stopColor="rgba(255,223,122,0.4)" />
          <stop offset="100%" stopColor="rgba(255,223,122,0)" />
        </radialGradient>
      </defs>
      {/* Sky */}
      <rect x={0} y={0} width={700} height={280} fill="url(#nightSky2)" />
      {/* Stars */}
      {[[90,40],[150,70],[220,30],[310,55],[400,25],[480,65],[570,35],[640,50],[50,85],[260,90],[440,90],[620,80]].map(([x,y],i)=>(
        <circle key={i} cx={x} cy={y} r={i%3===0?1.5:1} fill="#fff" opacity={0.7+Math.random()*0.3} />
      ))}
      {/* Moon */}
      <rect x={520} y={20} width={120} height={120} fill="url(#moonHalo)" />
      <circle cx={580} cy={68} r={28} fill="#f0e8c0" />
      <circle cx={588} cy={62} r={5} fill="rgba(180,170,140,0.35)" />
      <circle cx={575} cy={75} r={4} fill="rgba(180,170,140,0.35)" />
      {/* Lighthouse on left (distant) */}
      <g transform="translate(55, 195) scale(0.8)">
        <polygon points="-14,50 -8,-30 8,-30 14,50" fill="#e8d8b0" />
        <rect x={-12} y={-12} width={24} height={8} fill="#b83524" />
        <rect x={-12} y={14} width={24} height={8} fill="#b83524" />
        <rect x={-10} y={-40} width={20} height={10} fill="#2a2838" />
        <path d="M -10 -40 A 10 10 0 0 1 10 -40" fill="#2a2838" />
        <rect x={-7} y={-38} width={14} height={10} fill="rgba(255,223,122,0.9)" />
      </g>
      {/* Light beam */}
      <polygon points="55,155 700,100 700,200" fill="url(#lightBeam)" opacity={0.5} />
      {/* Ocean */}
      <rect x={0} y={220} width={700} height={60} fill="#081428" />
      {[0,1,2].map(i=>(
        <path key={`w${i}`} d={`M 0 ${232+i*14} Q 175 ${228+i*14} 350 ${232+i*14} T 700 ${232+i*14}`}
          fill="none" stroke="rgba(79,255,143,0.15)" strokeWidth={1}/>
      ))}
      {/* Shipwreck on right */}
      <g transform="translate(600, 220)">
        <path d="M -55 0 Q -40 -12 -10 -15 L 30 -25 L 55 -5 L 60 15 L -50 15 Z" fill="#1a1008" />
        <path d="M -50 0 Q -35 -8 -10 -10 L 25 -20 L 50 -5 L 53 10 L -48 10 Z" fill="#2a1808" />
        {/* Broken mast */}
        <rect x={-5} y={-55} width={4} height={45} fill="#1a1008" transform="rotate(-15 -3 -35)" />
        <rect x={15} y={-38} width={3} height={30} fill="#1a1008" transform="rotate(20 17 -25)" />
        {/* Torn sail */}
        <path d="M -15 -45 L 5 -38 L 2 -20 L -12 -25 Z" fill="rgba(200,190,160,0.4)" transform="rotate(-15 -3 -35)" />
        {/* Windows */}
        <circle cx={-20} cy={-3} r={3} fill="#0a0a0a" />
        <circle cx={0} cy={-5} r={3} fill="#0a0a0a" />
        <circle cx={20} cy={-3} r={3} fill="#0a0a0a" />
        <circle cx={-20} cy={-3} r={2} fill="rgba(79,255,143,0.4)" />
        <circle cx={0} cy={-5} r={2} fill="rgba(79,255,143,0.4)" />
      </g>
      {/* Sand */}
      <rect x={0} y={280} width={700} height={120} fill="url(#beachSand)" />
      {/* Sand texture dots */}
      {[...Array(60)].map((_,i)=>(
        <circle key={i} cx={Math.random()*700} cy={290+Math.random()*100} r={1}
          fill="rgba(90,60,40,0.35)" />
      ))}
      {/* Path - glowing dotted line */}
      <path d="M 80 265 Q 200 255 350 265 Q 500 275 620 260"
        fill="none" stroke="rgba(255,223,122,0.5)" strokeWidth={3} strokeDasharray="8 6" />
      <path d="M 80 265 Q 200 255 350 265 Q 500 275 620 260"
        fill="none" stroke="rgba(255,223,122,0.2)" strokeWidth={10} strokeDasharray="8 6" />
    </>
  );
}

// Draw Cutler as SVG for Act 3 - follows path animation
function CutlerSprite({ x, y, caught, flipped }) {
  return (
    <g transform={`translate(${x}, ${y}) ${flipped ? 'scale(-1, 1)' : ''}`}>
      <defs>
        <radialGradient id={`ghostGlow-${x|0}`} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0%" stopColor="rgba(79,255,143,0.55)" />
          <stop offset="100%" stopColor="rgba(79,255,143,0)" />
        </radialGradient>
      </defs>
      <ellipse cx={0} cy={10} rx={40} ry={40} fill={`url(#ghostGlow-${x|0})`} />
      <ellipse cx={0} cy={32} rx={12} ry={3} fill="rgba(0,0,0,0.35)" />
      {/* Body */}
      <path d="M -14 -5 L -16 26 L 16 26 L 14 -5 Z" fill={caught ? "#4a4040" : "#4fff8f"} opacity={caught ? 0.7 : 0.92} />
      <rect x={-15} y={8} width={30} height={3} fill={caught ? "#2a2020" : "#2a6a4a"} />
      {/* Arms */}
      <rect x={-20} y={0} width={5} height={14} fill={caught ? "#4a4040" : "#4fff8f"} opacity={caught ? 0.7 : 0.92} />
      <rect x={15} y={0} width={5} height={14} fill={caught ? "#4a4040" : "#4fff8f"} opacity={caught ? 0.7 : 0.92} />
      {/* Helmet */}
      <circle cx={0} cy={-14} r={13} fill={caught ? "#6a6060" : "#7fffb0"} opacity={caught ? 0.8 : 0.95} />
      <rect x={-10} y={-4} width={20} height={4} fill={caught ? "#4a4040" : "#4fff8f"} opacity={caught ? 0.8 : 0.95} />
      <ellipse cx={0} cy={-15} rx={8} ry={4} fill="#08201a" />
      {!caught && <><circle cx={-4} cy={-16} r={1.5} fill="#e0ffe8"/><circle cx={4} cy={-16} r={1.5} fill="#e0ffe8"/></>}
      {caught && <><text x={-5} y={-13} fontSize="8" fill="#ff6060">×</text><text x={2} y={-13} fontSize="8" fill="#ff6060">×</text></>}
    </g>
  );
}

// ============ ACT 3: TRAP GAME ============

function TrapGame({ onSolved, onFailed }) {
  const [assignments, setAssignments] = useState({ 1: null, 2: null, 3: null });
  const [selected, setSelected] = useState(null);
  const [phase, setPhase] = useState("placing"); // placing | playing | resolving
  const [cutlerPos, setCutlerPos] = useState(0); // 0-100
  const [triggerState, setTriggerState] = useState({ 1: null, 2: null, 3: null }); // null | 'hit' | 'miss'

  const usedItems = Object.values(assignments).filter(Boolean);
  const allPlaced = usedItems.length === 3;

  const selectItem = (item) => {
    if (phase !== "placing") return;
    if (usedItems.includes(item)) return;
    setSelected(item === selected ? null : item);
  };

  const tapSlot = (slotN) => {
    if (phase !== "placing") return;
    if (assignments[slotN]) {
      setAssignments({ ...assignments, [slotN]: null });
      return;
    }
    if (selected) {
      setAssignments({ ...assignments, [slotN]: selected });
      setSelected(null);
    }
  };

  const reset = () => {
    setAssignments({ 1: null, 2: null, 3: null });
    setSelected(null);
    setPhase("placing");
    setCutlerPos(0);
    setTriggerState({ 1: null, 2: null, 3: null });
  };

  const setTrap = () => {
    if (!allPlaced || phase !== "placing") return;
    setPhase("playing");
  };

  // Animate Cutler walking and trigger slots
  useEffect(() => {
    if (phase !== "playing") return;
    let p = 0;
    const id = setInterval(() => {
      p += 1.2;
      setCutlerPos(p);
      // Trigger slots at thresholds
      if (p >= 25 && p < 27) {
        const correct = assignments[1] === TRAP_SLOTS[0].expected;
        setTriggerState((s) => ({ ...s, 1: correct ? "hit" : "miss" }));
        playSound(correct ? "snack" : "hit");
      }
      if (p >= 50 && p < 52) {
        const correct = assignments[2] === TRAP_SLOTS[1].expected;
        setTriggerState((s) => ({ ...s, 2: correct ? "hit" : "miss" }));
        playSound(correct ? "snack" : "hit");
      }
      if (p >= 75 && p < 77) {
        const correct = assignments[3] === TRAP_SLOTS[2].expected;
        setTriggerState((s) => ({ ...s, 3: correct ? "hit" : "miss" }));
        playSound(correct ? "snack" : "hit");
      }
      if (p >= 100) {
        clearInterval(id);
        setPhase("resolving");
        const allCorrect =
          assignments[1] === TRAP_SLOTS[0].expected &&
          assignments[2] === TRAP_SLOTS[1].expected &&
          assignments[3] === TRAP_SLOTS[2].expected;
        setTimeout(() => {
          if (allCorrect) { playSound("win"); onSolved(); }
          else { playSound("lose"); onFailed(); }
        }, 800);
      }
    }, 60);
    return () => clearInterval(id);
  }, [phase]);

  // Calculate Cutler's visual position along the path
  const getCutlerXY = (pct) => {
    // Path: M 80 265 Q 200 255 350 265 Q 500 275 620 260
    // Approximate by interpolating between slot x-coords
    const t = pct / 100;
    const x = 80 + (620 - 80) * t;
    // Wavy y to simulate path
    const y = 248 - Math.sin(t * Math.PI) * 10;
    return { x, y };
  };

  const { x: cutlerX, y: cutlerY } = getCutlerXY(cutlerPos);
  // Cutler pauses slightly at correctly-baited slot 1
  const isPausing = phase === "playing" && cutlerPos >= 24 && cutlerPos <= 30 && assignments[1] === "bait";
  // Cutler stops completely if caught at slot 2 or 3
  const isCaught = phase === "playing" && triggerState[2] === "hit" && cutlerPos >= 51;

  return (
    <div className="max-w-4xl w-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="text-[10px] text-red-300 tracking-[0.3em]">ACT 3 · THE TRAP</div>
          <div className="text-xl font-bold text-red-300" style={{ fontFamily: "'Fredoka', sans-serif" }}>
            Stop Captain Cutler!
          </div>
        </div>
        {phase === "placing" && !allPlaced && (
          <div className="text-right text-[11px] text-slate-400">
            Pick an item → tap a slot
          </div>
        )}
      </div>

      {/* Scene */}
      <div className="relative mb-3">
        <svg
          viewBox="0 0 700 400"
          className="w-full"
          style={{
            display: "block",
            borderRadius: "12px",
            boxShadow: "0 20px 60px -10px rgba(255,96,96,0.25), 0 0 0 1px rgba(255,96,96,0.25)",
            background: "#0a0a1a",
          }}
        >
          <TrapBeachBackdrop />
          {/* Slots */}
          {TRAP_SLOTS.map((slot) => {
            const item = assignments[slot.n];
            const trig = triggerState[slot.n];
            const showNet = item === "net" && phase !== "placing";
            const netDropping = showNet && cutlerPos >= 48 && slot.n === 2;
            const netPlaced = showNet && cutlerPos >= 53 && slot.n === 2;
            return (
              <g
                key={slot.n}
                style={{ cursor: phase === "placing" ? "pointer" : "default" }}
                onClick={() => tapSlot(slot.n)}
              >
                {/* Slot circle */}
                <circle
                  cx={slot.x} cy={slot.y} r={30}
                  fill={item ? "rgba(79,255,143,0.15)" : "rgba(255,223,122,0.1)"}
                  stroke={trig === "hit" ? "#4fff8f" : trig === "miss" ? "#ff6060" : (item ? "#4fff8f" : "#ffdf7a")}
                  strokeWidth={3}
                  strokeDasharray={item ? "0" : "6 4"}
                />
                {/* Slot number */}
                <text x={slot.x} y={slot.y - 38} textAnchor="middle"
                  fontSize="16" fontWeight="bold"
                  fill={item ? "#4fff8f" : "#ffdf7a"}
                  style={{ fontFamily: "'Fredoka', sans-serif" }}>
                  {slot.n}
                </text>
                {/* Item icon if placed */}
                {item && !netDropping && !netPlaced && (
                  <text x={slot.x} y={slot.y + 9} textAnchor="middle" fontSize="28">
                    {TRAP_ITEMS[item].emoji}
                  </text>
                )}
                {/* Anchor sitting at slot 3 shows a falling animation when caught */}
                {item === "anchor" && slot.n === 3 && cutlerPos >= 74 && triggerState[3] === "hit" && (
                  <g>
                    <text x={slot.x} y={slot.y - 4 + (cutlerPos - 74) * 1.5} textAnchor="middle" fontSize="28">⚓</text>
                  </g>
                )}
                {/* Trigger feedback */}
                {trig === "hit" && (
                  <text x={slot.x} y={slot.y + 55} textAnchor="middle"
                    fontSize="12" fontWeight="bold" fill="#4fff8f">✓</text>
                )}
                {trig === "miss" && (
                  <text x={slot.x} y={slot.y + 55} textAnchor="middle"
                    fontSize="12" fontWeight="bold" fill="#ff6060">✗</text>
                )}
              </g>
            );
          })}
          {/* Net drop animation at slot 2 when correct */}
          {phase !== "placing" && assignments[2] === "net" && cutlerPos >= 48 && (
            <g>
              <path
                d={`M ${350 - 35} ${Math.min(258 + 15, 50 + (cutlerPos - 48) * 8)} L ${350 + 35} ${Math.min(258 + 15, 50 + (cutlerPos - 48) * 8)} L ${350 + 30} ${Math.min(258 + 45, 80 + (cutlerPos - 48) * 8)} L ${350 - 30} ${Math.min(258 + 45, 80 + (cutlerPos - 48) * 8)} Z`}
                fill="rgba(140,196,232,0.35)"
                stroke="#6a90b0"
                strokeWidth={1.5}
              />
              {[...Array(5)].map((_, i) => {
                const baseY = Math.min(258 + 30, 65 + (cutlerPos - 48) * 8);
                return (
                  <line key={i}
                    x1={315 + i * 17.5} y1={baseY - 15}
                    x2={315 + i * 17.5} y2={baseY + 15}
                    stroke="rgba(140,196,232,0.7)" strokeWidth={1} />
                );
              })}
            </g>
          )}
          {/* Captain Cutler */}
          {phase !== "placing" && (
            <CutlerSprite
              x={isCaught ? 350 : (isPausing ? 180 : cutlerX)}
              y={isCaught ? 270 : (isPausing ? 260 : cutlerY)}
              caught={isCaught}
              flipped={false}
            />
          )}
          {/* Cutler preview in placing phase */}
          {phase === "placing" && (
            <g opacity={0.5}>
              <CutlerSprite x={60} y={260} caught={false} flipped={false} />
              <text x={60} y={310} textAnchor="middle" fontSize="9"
                fill="#ff9090" style={{ fontFamily: "'Fredoka',sans-serif" }}>
                COMING
              </text>
            </g>
          )}
        </svg>
      </div>

      {phase === "placing" && (
        <>
          {/* Slot hints */}
          <div className="grid grid-cols-3 gap-2 mb-3">
            {TRAP_SLOTS.map((slot) => {
              const item = assignments[slot.n];
              return (
                <div
                  key={slot.n}
                  onClick={() => tapSlot(slot.n)}
                  className="p-2 rounded-lg cursor-pointer transition active:scale-[0.98]"
                  style={{
                    background: item ? "rgba(79,255,143,0.12)" : "rgba(30,30,55,0.7)",
                    border: `2px solid ${item ? "#4fff8f" : "rgba(255,223,122,0.3)"}`,
                    minHeight: "76px",
                  }}
                >
                  <div className="text-[10px] text-yellow-200 tracking-widest font-bold">
                    SLOT {slot.n}
                  </div>
                  <div className="text-[11px] text-white font-semibold mt-0.5 leading-tight">
                    {slot.title}
                  </div>
                  <div className="text-[10px] text-slate-400 mt-1 leading-tight">
                    {slot.hint}
                  </div>
                  {item && (
                    <div className="text-lg mt-1">{TRAP_ITEMS[item].emoji}<span className="text-[10px] text-green-300 ml-1">tap to remove</span></div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Inventory */}
          <div className="text-[10px] text-slate-400 tracking-widest mb-2">YOUR TRAP PIECES</div>
          <div className="grid grid-cols-3 gap-2 mb-3">
            {Object.entries(TRAP_ITEMS).map(([key, val]) => {
              const used = usedItems.includes(key);
              const isSelected = selected === key;
              return (
                <button
                  key={key}
                  onClick={() => selectItem(key)}
                  disabled={used}
                  className="p-3 rounded-lg transition active:scale-[0.97]"
                  style={{
                    background: used
                      ? "rgba(30,30,55,0.4)"
                      : isSelected
                      ? `linear-gradient(135deg, ${val.color}, rgba(255,255,255,0.2))`
                      : "rgba(30,30,55,0.8)",
                    border: `2px solid ${isSelected ? val.color : used ? "rgba(100,100,130,0.2)" : "rgba(100,100,130,0.4)"}`,
                    opacity: used ? 0.4 : 1,
                    cursor: used ? "not-allowed" : "pointer",
                    fontFamily: "'Fredoka',sans-serif",
                    boxShadow: isSelected ? `0 0 20px ${val.color}80` : "none",
                  }}
                >
                  <div className="text-3xl">{val.emoji}</div>
                  <div className="text-[11px] font-bold mt-1" style={{ color: isSelected ? "#062a14" : "#fff" }}>
                    {val.name}
                  </div>
                  <div className="text-[9px] mt-0.5 leading-tight" style={{ color: isSelected ? "#062a14" : "#a0a0b0" }}>
                    {val.hint}
                  </div>
                </button>
              );
            })}
          </div>

          <button
            onClick={setTrap}
            disabled={!allPlaced}
            className="w-full py-4 rounded-lg text-xl font-bold transition active:scale-[0.98]"
            style={{
              background: allPlaced
                ? "linear-gradient(135deg, #ff6060, #d84040)"
                : "rgba(60,60,80,0.6)",
              color: allPlaced ? "#fff" : "#808098",
              fontFamily: "'Fredoka',sans-serif",
              boxShadow: allPlaced ? "0 8px 28px rgba(255,96,96,0.4)" : "none",
              letterSpacing: "0.04em",
              cursor: allPlaced ? "pointer" : "not-allowed",
            }}
          >
            {allPlaced ? "SET THE TRAP! 🎯" : `Place all items (${usedItems.length}/3)`}
          </button>

          {usedItems.length > 0 && (
            <button
              onClick={reset}
              className="w-full mt-2 py-2 rounded-lg text-sm font-semibold"
              style={{ background: "rgba(100,100,130,0.25)", color: "#c0c0d0" }}
            >
              Reset all
            </button>
          )}
        </>
      )}

      {phase !== "placing" && (
        <div
          className="text-center py-4 rounded-lg"
          style={{
            background: "rgba(10,10,30,0.65)",
            border: "1px solid rgba(255,223,122,0.2)",
          }}
        >
          <div className="text-lg font-bold text-yellow-200" style={{ fontFamily: "'Fredoka',sans-serif" }}>
            {phase === "playing" ? "Cutler is approaching..." : "Trap complete!"}
          </div>
        </div>
      )}
    </div>
  );
}

// ============ ACT 3: INTRO ============

function TrapIntro({ playerName, onStart }) {
  return (
    <div className="max-w-xl w-full text-center">
      <div className="mb-2 text-xs tracking-[0.3em] text-red-300">ACT 3</div>
      <h2
        style={{
          fontFamily: "'Creepster', cursive",
          fontSize: "clamp(2.5rem, 8vw, 4.5rem)",
          color: "#ff6060",
          textShadow: "0 0 20px rgba(255,96,96,0.55), 2px 2px 0 #3a0a0a",
          letterSpacing: "0.04em",
          margin: 0,
          lineHeight: 1,
        }}
      >
        The Trap
      </h2>
      <div
        className="rounded-xl p-5 my-6 text-left space-y-3 text-slate-200"
        style={{
          background: "rgba(10,10,30,0.65)",
          border: "1px solid rgba(255,96,96,0.25)",
        }}
      >
        <p>Dr. Finch is sprinting back to the shipwreck in his diving suit. If he makes it to the water, he's gone forever.</p>
        <p>You've got <span className="text-yellow-200 font-semibold">three trap pieces</span> and <span className="text-yellow-200 font-semibold">three spots</span> on his path.</p>
        <p>Read each slot carefully and pick the piece that fits. <span className="text-red-300 font-bold">Order matters!</span></p>
      </div>
      <button
        onClick={onStart}
        className="w-full py-4 rounded-lg text-xl font-bold transition hover:brightness-110 active:scale-[0.98]"
        style={{
          background: "linear-gradient(135deg, #ff6060, #d84040)",
          color: "#fff",
          fontFamily: "'Fredoka',sans-serif",
          boxShadow: "0 8px 28px rgba(255,96,96,0.4)",
          letterSpacing: "0.04em",
        }}
      >
        SET THE TRAP →
      </button>
      <div className="mt-4 text-xs text-slate-500 tracking-widest">
        DETECTIVE: <span className="text-green-300">{playerName.toUpperCase()}</span>
      </div>
    </div>
  );
}

// ============ ACT 3: FAIL ============

function TrapFail({ onRetry }) {
  return (
    <div className="max-w-xl w-full text-center">
      <div className="mb-2 text-xs tracking-[0.3em] text-red-300">TRAP FAILED</div>
      <h2
        style={{
          fontFamily: "'Creepster', cursive",
          fontSize: "clamp(2.5rem, 7vw, 4rem)",
          color: "#ff6060",
          textShadow: "0 0 20px rgba(255,96,96,0.5), 2px 2px 0 #3a0a0a",
          letterSpacing: "0.03em",
          margin: 0,
          lineHeight: 1.1,
        }}
      >
        He Got Away!
      </h2>
      <div
        className="rounded-xl p-5 my-6 text-slate-200"
        style={{
          background: "rgba(10,10,30,0.65)",
          border: "1px solid rgba(255,96,96,0.3)",
        }}
      >
        <p className="mb-2">Cutler slipped past your trap and dove into the water.</p>
        <p className="text-sm text-yellow-200">Read each slot's clue again. Which piece fits which job?</p>
      </div>
      <button
        onClick={onRetry}
        className="w-full py-4 rounded-lg text-xl font-bold transition hover:brightness-110 active:scale-[0.98]"
        style={{
          background: "linear-gradient(135deg, #ff6060, #d84040)",
          color: "#fff",
          fontFamily: "'Fredoka',sans-serif",
          boxShadow: "0 8px 28px rgba(255,96,96,0.4)",
        }}
      >
        TRY AGAIN
      </button>
    </div>
  );
}

// ============ ACT 3: FINAL VICTORY ============

function FinalVictory({ playerName, onHome, onReplayAll }) {
  return (
    <div className="max-w-xl w-full text-center">
      <div className="mb-2 text-xs tracking-[0.3em] text-green-300">CASE CLOSED</div>
      <h2
        style={{
          fontFamily: "'Creepster', cursive",
          fontSize: "clamp(3rem, 9vw, 5.5rem)",
          color: "#ffdf7a",
          textShadow: "0 0 24px rgba(255,223,122,0.6), 0 0 40px rgba(79,255,143,0.3), 2px 2px 0 #3a2a08",
          letterSpacing: "0.04em",
          margin: 0,
          lineHeight: 1,
        }}
      >
        You Did It!
      </h2>
      <div className="text-sm text-slate-300 mt-3">Three acts. One mystery. Solved.</div>

      <div
        className="rounded-xl p-5 my-6 text-left space-y-3 text-slate-200"
        style={{
          background: "rgba(10,10,30,0.65)",
          border: "1px solid rgba(255,223,122,0.3)",
        }}
      >
        <p>The net drops. The anchor tightens. Cutler crashes to the sand.</p>
        <p>You pull off the glowing helmet...</p>
        <p className="text-center text-yellow-200 font-bold text-lg my-3">It's Dr. Finch!</p>
        <p className="italic text-slate-300">"And I would have gotten away with it, too, if it weren't for you, <span className="text-green-300 font-bold not-italic">{playerName}</span>!"</p>
      </div>

      <div className="flex justify-center gap-3 my-5">
        {[
          { label: "THE CHASE", color: "#4fff8f" },
          { label: "THE INVESTIGATION", color: "#ffdf7a" },
          { label: "THE TRAP", color: "#ff6060" },
        ].map((act, i) => (
          <div key={i} className="flex-1 p-2 rounded-lg"
            style={{ background: `${act.color}22`, border: `1px solid ${act.color}66` }}>
            <div className="text-2xl">✓</div>
            <div className="text-[9px] font-bold tracking-widest mt-1" style={{ color: act.color }}>
              {act.label}
            </div>
          </div>
        ))}
      </div>

      <button
        onClick={onReplayAll}
        className="w-full py-4 rounded-lg text-xl font-bold transition hover:brightness-110 active:scale-[0.98]"
        style={{
          background: "linear-gradient(135deg, #ffdf7a, #d4a030)",
          color: "#3a2a08",
          fontFamily: "'Fredoka',sans-serif",
          boxShadow: "0 8px 28px rgba(255,223,122,0.35)",
          letterSpacing: "0.04em",
        }}
      >
        PLAY AGAIN
      </button>
      <button
        onClick={onHome}
        className="w-full mt-2 py-2.5 rounded-lg font-semibold"
        style={{
          background: "rgba(30,30,55,0.8)",
          color: "#c0c0d0",
          border: "1px solid rgba(100,100,130,0.3)",
          fontFamily: "'Fredoka',sans-serif",
        }}
      >
        Home
      </button>
      <div className="mt-6 text-xs text-slate-600 tracking-[0.25em]">
        A MEN CAN CLEAN TOO GAME
      </div>
    </div>
  );
}

// ============ MAIN ============
// ============ SHARED VILLAIN ACT HELPERS ============

function VillainActIntro({ act, title, subtitle, description, hint, buttonText, accent, onStart, difficulty, bg }) {
  return (
    <div className="max-w-xl w-full text-center">
      <div className="mb-2 text-xs tracking-[0.3em]" style={{ color: accent }}>{`ACT ${act} · ${subtitle}`}</div>
      <h2 style={{
        fontFamily: "'Creepster', cursive",
        fontSize: "clamp(2rem, 7vw, 3.5rem)",
        color: accent,
        textShadow: `0 0 20px ${accent}80, 2px 2px 0 #0a0a1a`,
        letterSpacing: "0.03em",
        margin: 0,
        lineHeight: 1.1,
      }}>{title}</h2>
      <div className="rounded-xl p-5 my-5 text-left space-y-3 text-slate-200"
        style={{ background: bg || "rgba(30,20,10,0.7)", border: `1px solid ${accent}40`, backdropFilter: "blur(6px)" }}>
        <div>{description}</div>
        <div className="text-sm text-slate-300">{hint}</div>
      </div>
      <button onClick={onStart} className="py-5 px-10 rounded-lg font-bold text-xl transition hover:brightness-110 active:scale-95"
        style={{
          background: `linear-gradient(135deg, ${accent}, ${accent}cc)`,
          color: "#0a1a0a",
          fontFamily: "'Fredoka', sans-serif",
          boxShadow: `0 6px 20px ${accent}88`,
          border: `2px solid ${accent}`,
        }}>{buttonText}</button>
      <div className="mt-4 text-xs text-slate-500 tracking-widest">
        DIFFICULTY: <span className="text-yellow-200">{DIFFICULTY[difficulty].label.toUpperCase()}</span>
      </div>
    </div>
  );
}

function VillainActFail({ title, subtitle, message, accent, onRetry, onHome }) {
  return (
    <div className="max-w-xl w-full text-center">
      <div className="mb-2 text-xs tracking-[0.3em] text-red-400">{subtitle}</div>
      <h2 style={{
        fontFamily: "'Creepster', cursive",
        fontSize: "clamp(2rem, 6vw, 3rem)",
        color: "#ff7070",
        textShadow: "0 0 20px rgba(255,112,112,0.4), 2px 2px 0 #0a0a1a",
        margin: 0,
      }}>{title}</h2>
      <div className="text-base text-slate-300 my-5 px-2">{message}</div>
      <div className="grid grid-cols-2 gap-3">
        <button onClick={onRetry} className="py-4 rounded-lg font-bold"
          style={{
            background: `linear-gradient(135deg, ${accent}, ${accent}cc)`,
            color: "#0a1a0a",
            fontFamily: "'Fredoka', sans-serif",
            boxShadow: `0 6px 20px ${accent}55`,
          }}>
          TRY AGAIN
        </button>
        <button onClick={onHome} className="py-4 rounded-lg font-bold"
          style={{
            background: "rgba(40,40,70,0.8)",
            color: "#fff",
            border: "1px solid rgba(140,140,180,0.4)",
          }}>
          HOME
        </button>
      </div>
    </div>
  );
}

// ============ VILLAIN ACT 2: MINER · THE DIG ============

const MINER_DIG_DIFFICULTY = {
  easy:   { cols: 4, rows: 4, gold: 3, caveins: 2, failAt: 2 },
  normal: { cols: 5, rows: 4, gold: 4, caveins: 3, failAt: 3 },
  hard:   { cols: 6, rows: 5, gold: 5, caveins: 4, failAt: 2 },
};

function MinerDigIntro({ playerName, difficulty, onStart }) {
  return <VillainActIntro
    act={2}
    subtitle="THE DIG"
    title="Hide Your Gold"
    accent="#ffc850"
    bg="rgba(30,20,10,0.75)"
    description={<>
      <p><span className="text-yellow-300 font-semibold">{playerName}</span>, you escaped into the tunnels. But the detective's sniffing around the mine shaft.</p>
      <p className="mt-2">Dig up all your hidden <span className="text-yellow-300 font-semibold">gold nuggets</span> before he finds them.</p>
    </>}
    hint={<>Tap rocks to dig. Numbers show how many gold nuggets are hidden next to that spot. Watch out — <span className="text-red-400 font-semibold">cave-ins</span> will bury you!</>}
    buttonText="START DIGGING"
    onStart={onStart}
    difficulty={difficulty}
  />;
}

function MinerDigGame({ playerName, difficulty, onWin, onFail }) {
  const cfg = MINER_DIG_DIFFICULTY[difficulty];
  const totalTiles = cfg.cols * cfg.rows;

  const [tiles, setTiles] = useState(() => {
    const positions = Array.from({ length: totalTiles }, (_, i) => i);
    for (let i = positions.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [positions[i], positions[j]] = [positions[j], positions[i]];
    }
    const tileArr = Array.from({ length: totalTiles }, (_, i) => ({
      type: "empty",
      revealed: false,
      x: i % cfg.cols,
      y: Math.floor(i / cfg.cols),
      goldAdj: 0,
    }));
    for (let i = 0; i < cfg.gold; i++) tileArr[positions[i]].type = "gold";
    for (let i = cfg.gold; i < cfg.gold + cfg.caveins; i++) tileArr[positions[i]].type = "cavein";
    for (const t of tileArr) {
      if (t.type !== "empty") continue;
      let count = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          const nx = t.x + dx, ny = t.y + dy;
          if (nx < 0 || nx >= cfg.cols || ny < 0 || ny >= cfg.rows) continue;
          if (tileArr[ny * cfg.cols + nx].type === "gold") count++;
        }
      }
      t.goldAdj = count;
    }
    return tileArr;
  });

  const [goldFound, setGoldFound] = useState(0);
  const [caveinsHit, setCaveinsHit] = useState(0);
  const [shake, setShake] = useState(0);
  const [ended, setEnded] = useState(false);

  useEffect(() => {
    if (ended) return;
    if (goldFound >= cfg.gold) {
      setEnded(true);
      ensureAudio();
      playSound("win");
      setTimeout(() => onWin({ gold: goldFound, caveins: caveinsHit }), 900);
    } else if (caveinsHit >= cfg.failAt) {
      setEnded(true);
      ensureAudio();
      playSound("lose");
      setTimeout(() => onFail({ gold: goldFound, caveins: caveinsHit }), 900);
    }
  }, [goldFound, caveinsHit, cfg, ended, onWin, onFail]);

  const handleDig = (i) => {
    if (tiles[i].revealed || ended) return;
    const newTiles = [...tiles];
    newTiles[i] = { ...newTiles[i], revealed: true };
    setTiles(newTiles);
    ensureAudio();
    if (newTiles[i].type === "gold") {
      playSound("snack");
      setGoldFound(g => g + 1);
    } else if (newTiles[i].type === "cavein") {
      playSound("hit");
      setCaveinsHit(c => c + 1);
      setShake(10);
      setTimeout(() => setShake(0), 400);
    } else {
      playSound("jump");
    }
  };

  return (
    <div className="max-w-2xl w-full text-center">
      <div className="mb-3 flex justify-between items-center text-sm px-2">
        <div className="text-yellow-300 font-bold">💰 {goldFound}/{cfg.gold}</div>
        <div className="text-xs text-slate-400 tracking-widest">MINER'S DIG</div>
        <div className="text-red-400 font-bold">⚠ {caveinsHit}/{cfg.failAt}</div>
      </div>
      <div
        className="inline-block p-3 rounded-xl"
        style={{
          background: "radial-gradient(ellipse at center, #3a2414 0%, #1a0e08 100%)",
          border: "2px solid rgba(255,200,80,0.35)",
          boxShadow: "0 10px 40px rgba(0,0,0,0.5), inset 0 0 30px rgba(0,0,0,0.5)",
          transform: shake > 0 ? `translate(${(Math.random() - 0.5) * shake}px,${(Math.random() - 0.5) * shake}px)` : "none",
          transition: "transform 0.05s",
        }}
      >
        <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${cfg.cols}, minmax(0, 1fr))` }}>
          {tiles.map((t, i) => {
            const numColor = t.goldAdj === 1 ? "#ffdf7a" : t.goldAdj === 2 ? "#ff9040" : t.goldAdj >= 3 ? "#ff6060" : "#fff";
            return (
              <button
                key={i}
                onClick={() => handleDig(i)}
                disabled={t.revealed || ended}
                className="rounded font-bold transition active:scale-95 flex items-center justify-center"
                style={{
                  width: "clamp(40px, 11vw, 56px)",
                  height: "clamp(40px, 11vw, 56px)",
                  background: t.revealed
                    ? t.type === "gold" ? "linear-gradient(135deg, #ffd732 0%, #c49020 100%)"
                      : t.type === "cavein" ? "linear-gradient(135deg, #7a3a3a 0%, #2a1010 100%)"
                      : "linear-gradient(135deg, #3a2818 0%, #1a0e08 100%)"
                    : "linear-gradient(135deg, #7a5a2a 0%, #4a3018 100%)",
                  color: t.type === "gold" ? "#2a1808" : numColor,
                  border: t.revealed
                    ? t.type === "gold" ? "2px solid #fff1a8"
                      : t.type === "cavein" ? "2px solid #ff6060"
                      : "1px solid rgba(0,0,0,0.4)"
                    : "2px solid #a07a3a",
                  boxShadow: t.revealed ? "inset 0 2px 6px rgba(0,0,0,0.5)" : "0 3px 6px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,220,150,0.3)",
                  cursor: t.revealed ? "default" : "pointer",
                  fontSize: "1.25rem",
                }}
              >
                {t.revealed
                  ? t.type === "gold" ? "💰"
                  : t.type === "cavein" ? "💥"
                  : t.goldAdj > 0 ? t.goldAdj : ""
                  : ""}
              </button>
            );
          })}
        </div>
      </div>
      <div className="mt-4 text-xs text-slate-400">
        {ended
          ? caveinsHit >= cfg.failAt ? "The mine collapsed!" : "All gold secured!"
          : `Find ${cfg.gold - goldFound} more gold nugget${cfg.gold - goldFound !== 1 ? "s" : ""}`}
      </div>
    </div>
  );
}

// ============ VILLAIN ACT 3: MINER · CHAIN BLAST ============

const MINER_BLAST_DIFFICULTY = {
  easy:   { sequenceLen: 3, totalBeams: 4, showDelay: 700, retries: 2 },
  normal: { sequenceLen: 4, totalBeams: 5, showDelay: 500, retries: 1 },
  hard:   { sequenceLen: 5, totalBeams: 6, showDelay: 350, retries: 0 },
};

function MinerBlastIntro({ playerName, difficulty, onStart }) {
  return <VillainActIntro
    act={3}
    subtitle="CHAIN BLAST"
    title="Seal the Shaft"
    accent="#ff9040"
    bg="rgba(30,15,5,0.8)"
    description={<>
      <p><span className="text-orange-300 font-semibold">{playerName}</span>, the detective's at the tunnel mouth. Time to collapse it behind you.</p>
      <p className="mt-2">Blow the support beams in the <span className="text-orange-300 font-semibold">exact order</span> to chain-collapse the shaft.</p>
    </>}
    hint={<>Watch the fuse light up each beam. Then tap them in the <span className="text-orange-400 font-semibold">same sequence</span>. Miss one and the fuse dies!</>}
    buttonText="LIGHT THE FUSE"
    onStart={onStart}
    difficulty={difficulty}
  />;
}

function MinerBlastGame({ playerName, difficulty, onWin, onFail }) {
  const cfg = MINER_BLAST_DIFFICULTY[difficulty];
  const [sequence] = useState(() => {
    const seq = [];
    let last = -1;
    for (let i = 0; i < cfg.sequenceLen; i++) {
      let n;
      do { n = Math.floor(Math.random() * cfg.totalBeams); } while (n === last);
      seq.push(n); last = n;
    }
    return seq;
  });
  const [phase, setPhase] = useState("showing");
  const [showIdx, setShowIdx] = useState(-1);
  const [playerStep, setPlayerStep] = useState(0);
  const [retries, setRetries] = useState(cfg.retries);
  const [flashBeam, setFlashBeam] = useState(-1);
  const [detonatedBeams, setDetonatedBeams] = useState([]);

  useEffect(() => {
    if (phase !== "showing") return;
    let i = 0;
    let cancelled = false;
    const step = () => {
      if (cancelled) return;
      if (i >= sequence.length) {
        setShowIdx(-1);
        setTimeout(() => { if (!cancelled) setPhase("player"); }, 400);
        return;
      }
      setShowIdx(sequence[i]);
      ensureAudio();
      playSound("jump");
      setTimeout(() => {
        if (cancelled) return;
        setShowIdx(-1);
        i++;
        setTimeout(step, 180);
      }, cfg.showDelay - 180);
    };
    const t = setTimeout(step, 600);
    return () => { cancelled = true; clearTimeout(t); };
  }, [phase, sequence, cfg]);

  const handleBeam = (i) => {
    if (phase !== "player") return;
    ensureAudio();
    if (sequence[playerStep] === i) {
      playSound("snack");
      setFlashBeam(i);
      setDetonatedBeams(prev => [...prev, i]);
      setTimeout(() => setFlashBeam(-1), 250);
      const next = playerStep + 1;
      if (next >= sequence.length) {
        setPhase("win");
        playSound("win");
        setTimeout(() => onWin({ retries }), 1500);
      } else {
        setPlayerStep(next);
      }
    } else {
      playSound("hit");
      if (retries <= 0) {
        setPhase("fail");
        setTimeout(() => onFail(), 900);
      } else {
        setRetries(r => r - 1);
        setPlayerStep(0);
        setDetonatedBeams([]);
        setFlashBeam(-1);
        setPhase("showing");
      }
    }
  };

  return (
    <div className="max-w-2xl w-full">
      <div className="mb-3 flex justify-between items-center text-sm px-2">
        <div className="text-orange-300 font-bold">Step {Math.min(playerStep + (phase === "player" ? 1 : 0), sequence.length)}/{sequence.length}</div>
        <div className="text-xs text-slate-400 tracking-widest">CHAIN BLAST</div>
        <div className="text-yellow-300 font-bold">Retries: {retries}</div>
      </div>

      <div
        className="relative rounded-xl overflow-hidden"
        style={{
          background: "linear-gradient(180deg, #0a0604 0%, #1a0e08 50%, #2a1810 100%)",
          border: "2px solid rgba(255,140,60,0.35)",
          boxShadow: "0 10px 40px rgba(0,0,0,0.5), inset 0 0 30px rgba(0,0,0,0.5)",
          aspectRatio: "2 / 1",
          minHeight: "260px",
        }}
      >
        {/* Cave ceiling texture */}
        <svg className="absolute top-0 left-0 w-full" style={{ height: "24px" }} viewBox="0 0 400 24" preserveAspectRatio="none">
          <path d="M0,0 L400,0 L400,12 Q380,22 360,14 T320,16 T280,12 T240,18 T200,14 T160,20 T120,14 T80,18 T40,12 L0,16 Z" fill="#0a0604" />
        </svg>
        {/* Cave floor */}
        <div className="absolute bottom-0 left-0 right-0" style={{
          height: "50px",
          background: "linear-gradient(180deg, #3a2410 0%, #1a0f06 100%)",
          borderTop: "2px solid #1a0f06",
        }} />
        {/* Torches */}
        <div className="absolute left-4 top-16" style={{ filter: "drop-shadow(0 0 20px rgba(255,140,60,0.8))", fontSize: "18px" }}>🔥</div>
        <div className="absolute right-4 top-16" style={{ filter: "drop-shadow(0 0 20px rgba(255,140,60,0.8))", fontSize: "18px" }}>🔥</div>

        {/* Support beams */}
        <div className="absolute inset-0 flex justify-around items-end px-6" style={{ paddingBottom: "50px" }}>
          {Array.from({ length: cfg.totalBeams }).map((_, i) => {
            const isShow = phase === "showing" && showIdx === i;
            const isFlash = flashBeam === i;
            const isDetonated = detonatedBeams.includes(i);
            const lit = isShow || isFlash;
            return (
              <button
                key={i}
                onClick={() => handleBeam(i)}
                disabled={phase !== "player" || isDetonated}
                className="relative rounded-sm transition"
                style={{
                  width: "clamp(28px, 7vw, 42px)",
                  height: "clamp(130px, 32vw, 170px)",
                  background: isDetonated
                    ? "linear-gradient(180deg, #1a0a04 0%, #3a1810 100%)"
                    : lit
                    ? "linear-gradient(180deg, #ffeb80 0%, #ff6030 100%)"
                    : "linear-gradient(180deg, #6a4020 0%, #3a2410 100%)",
                  border: lit ? "2px solid #fff7a0" : isDetonated ? "1px solid #0a0604" : "1px solid #2a1808",
                  boxShadow: lit
                    ? "0 0 32px rgba(255,200,80,0.9), inset 0 0 14px rgba(255,255,180,0.6)"
                    : "2px 2px 6px rgba(0,0,0,0.6)",
                  transform: isFlash ? "scale(0.92)" : "scale(1)",
                  cursor: phase === "player" && !isDetonated ? "pointer" : "default",
                  opacity: isDetonated ? 0.6 : 1,
                }}
              >
                {/* Dynamite */}
                {!isDetonated && (
                  <div style={{
                    position: "absolute",
                    top: "18%",
                    left: "50%",
                    transform: "translateX(-50%)",
                    width: "12px",
                    height: "22px",
                    background: "linear-gradient(180deg, #d44828 0%, #7a1f14 100%)",
                    border: "1px solid #4a0f0a",
                    borderRadius: "2px",
                  }}>
                    <div style={{
                      position: "absolute",
                      top: "-7px",
                      left: "50%",
                      transform: "translateX(-50%)",
                      width: "1.5px",
                      height: "7px",
                      background: "#6a4a1a",
                    }} />
                    {lit && (
                      <div style={{
                        position: "absolute",
                        top: "-12px",
                        left: "50%",
                        transform: "translateX(-50%)",
                        width: "7px",
                        height: "7px",
                        borderRadius: "50%",
                        background: "#ffeb80",
                        boxShadow: "0 0 12px rgba(255, 235, 128, 1), 0 0 24px rgba(255, 160, 60, 0.8)",
                      }} />
                    )}
                  </div>
                )}
                {isDetonated && (
                  <div style={{
                    position: "absolute",
                    top: "8%",
                    left: "50%",
                    transform: "translateX(-50%)",
                    fontSize: "clamp(16px, 4vw, 22px)",
                  }}>💥</div>
                )}
                <div style={{
                  position: "absolute",
                  bottom: "4px",
                  left: "50%",
                  transform: "translateX(-50%)",
                  fontSize: "9px",
                  color: "rgba(255,255,255,0.4)",
                  fontWeight: "bold",
                }}>{i + 1}</div>
              </button>
            );
          })}
        </div>

        {phase === "showing" && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 text-xs tracking-[0.25em] text-orange-200 font-bold animate-pulse">
            WATCH THE FUSE...
          </div>
        )}
        {phase === "player" && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 text-xs tracking-[0.25em] text-yellow-200 font-bold">
            TAP THE BEAMS IN ORDER
          </div>
        )}
        {phase === "win" && (
          <div className="absolute inset-0 flex items-center justify-center text-5xl font-bold"
            style={{ color: "#ff9040", fontFamily: "'Creepster', cursive", textShadow: "0 0 24px rgba(255,140,60,1)" }}>
            BOOOOM!
          </div>
        )}
      </div>
    </div>
  );
}

// ============ VILLAIN ACT 2: CUTLER · GHOST HIDE ============

const CUTLER_HIDE_DIFFICULTY = {
  easy:   { beamSpeed: 0.55, sweeps: 3, lives: 3, beamWidth: 12 },
  normal: { beamSpeed: 0.9,  sweeps: 5, lives: 2, beamWidth: 12 },
  hard:   { beamSpeed: 1.3,  sweeps: 7, lives: 1, beamWidth: 14 },
};

const HIDE_SPOTS = [
  { id: 0, x: 16, y: 65, label: "Kelp", icon: "🌿" },
  { id: 1, x: 38, y: 48, label: "Crate", icon: "📦" },
  { id: 2, x: 62, y: 52, label: "Porthole", icon: "⚓" },
  { id: 3, x: 84, y: 68, label: "Wreck", icon: "🏚" },
];

function CutlerHideIntro({ playerName, difficulty, onStart }) {
  return <VillainActIntro
    act={2}
    subtitle="GHOST HIDE"
    title="Hide in the Wreck"
    accent="#4fff8f"
    bg="rgba(5,20,30,0.8)"
    description={<>
      <p><span className="text-green-300 font-semibold">{playerName}</span>, the detective has dived down to search the shipwreck.</p>
      <p className="mt-2">His flashlight is sweeping the wreck. Keep moving between hiding spots so he never finds you.</p>
    </>}
    hint={<>Tap a different hiding spot to <span className="text-green-400 font-semibold">dart</span> there. If the beam catches you, you lose a life. Survive all the sweeps!</>}
    buttonText="DIVE IN"
    onStart={onStart}
    difficulty={difficulty}
  />;
}

function CutlerHideGame({ playerName, difficulty, onWin, onFail }) {
  const cfg = CUTLER_HIDE_DIFFICULTY[difficulty];
  const [cutlerSpot, setCutlerSpot] = useState(0);
  const [beamX, setBeamX] = useState(5);
  const [beamDir, setBeamDir] = useState(1);
  const [sweepCount, setSweepCount] = useState(0);
  const [livesLeft, setLivesLeft] = useState(cfg.lives);
  const [caught, setCaught] = useState(false);
  const [ended, setEnded] = useState(false);
  const caughtTimerRef = useRef(null);

  // Beam movement
  useEffect(() => {
    if (ended) return;
    const iv = setInterval(() => {
      setBeamX(prev => {
        let next = prev + beamDir * cfg.beamSpeed;
        if (next >= 95) {
          setBeamDir(-1);
          setSweepCount(s => s + 1);
          return 95;
        }
        if (next <= 5) {
          setBeamDir(1);
          setSweepCount(s => s + 1);
          return 5;
        }
        return next;
      });
    }, 30);
    return () => clearInterval(iv);
  }, [beamDir, cfg, ended]);

  // Win check
  useEffect(() => {
    if (ended) return;
    if (sweepCount >= cfg.sweeps) {
      setEnded(true);
      ensureAudio();
      playSound("win");
      setTimeout(() => onWin({ lives: livesLeft }), 900);
    }
  }, [sweepCount, ended, livesLeft, cfg, onWin]);

  // Catch check
  useEffect(() => {
    if (ended || caught) return;
    const spot = HIDE_SPOTS[cutlerSpot];
    if (Math.abs(beamX - spot.x) < cfg.beamWidth / 2) {
      setCaught(true);
      ensureAudio();
      playSound("hit");
      setLivesLeft(l => {
        const nl = l - 1;
        if (nl <= 0) {
          setEnded(true);
          setTimeout(() => onFail(), 900);
        }
        return nl;
      });
      if (caughtTimerRef.current) clearTimeout(caughtTimerRef.current);
      caughtTimerRef.current = setTimeout(() => setCaught(false), 600);
    }
  }, [beamX, cutlerSpot, caught, ended, cfg, onFail]);

  useEffect(() => () => { if (caughtTimerRef.current) clearTimeout(caughtTimerRef.current); }, []);

  const handleMove = (spotId) => {
    if (ended || spotId === cutlerSpot) return;
    ensureAudio();
    playSound("jump");
    setCutlerSpot(spotId);
  };

  return (
    <div className="max-w-2xl w-full">
      <div className="mb-3 flex justify-between items-center text-sm px-2">
        <div className="text-green-300 font-bold">❤ {"●".repeat(livesLeft)}{"○".repeat(cfg.lives - livesLeft)}</div>
        <div className="text-xs text-slate-400 tracking-widest">GHOST HIDE</div>
        <div className="text-yellow-300 font-bold">Sweep {Math.min(sweepCount, cfg.sweeps)}/{cfg.sweeps}</div>
      </div>

      <div className="relative rounded-xl overflow-hidden"
        style={{
          background: "linear-gradient(180deg, #030818 0%, #0a1828 40%, #1a2838 100%)",
          border: "2px solid rgba(79,255,143,0.35)",
          boxShadow: "0 10px 40px rgba(0,0,0,0.5)",
          aspectRatio: "16 / 9",
          minHeight: "300px",
        }}>
        {/* Water effects (wavy bands) */}
        <svg className="absolute inset-0 w-full h-full" preserveAspectRatio="none" viewBox="0 0 400 225">
          {Array.from({ length: 4 }).map((_, i) => (
            <path key={i}
              d={`M0,${50 + i * 40} Q100,${48 + i * 40} 200,${52 + i * 40} T400,${50 + i * 40}`}
              stroke="rgba(79,255,143,0.1)" strokeWidth="1" fill="none" />
          ))}
        </svg>
        {/* Bubbles */}
        <div className="absolute left-[20%] top-[15%]" style={{ fontSize: "10px", opacity: 0.6 }}>○</div>
        <div className="absolute left-[70%] top-[22%]" style={{ fontSize: "8px", opacity: 0.4 }}>○</div>
        <div className="absolute left-[45%] top-[30%]" style={{ fontSize: "12px", opacity: 0.5 }}>○</div>

        {/* Flashlight beam (conical) */}
        <div style={{
          position: "absolute",
          left: `${beamX}%`,
          top: "0",
          bottom: "0",
          width: `${cfg.beamWidth}%`,
          transform: "translateX(-50%)",
          background: "radial-gradient(ellipse at top, rgba(255,245,200,0.55) 0%, rgba(255,240,180,0.25) 40%, rgba(255,240,180,0.05) 80%, transparent 100%)",
          pointerEvents: "none",
          filter: "blur(1px)",
        }}/>
        {/* Beam edge glow */}
        <div style={{
          position: "absolute",
          left: `${beamX}%`,
          top: 0, bottom: 0,
          width: "2px",
          transform: "translateX(-50%)",
          background: "linear-gradient(180deg, rgba(255,250,220,0.8), rgba(255,250,220,0.1))",
          pointerEvents: "none",
        }}/>

        {/* Detective head/flashlight at top */}
        <div style={{
          position: "absolute",
          left: `${beamX}%`,
          top: "0px",
          transform: "translateX(-50%)",
          fontSize: "28px",
          filter: "drop-shadow(0 0 12px rgba(255,240,180,0.9))",
          zIndex: 10,
        }}>🔦</div>

        {/* Hiding spots */}
        {HIDE_SPOTS.map(spot => {
          const isHere = cutlerSpot === spot.id;
          const beamDist = Math.abs(beamX - spot.x);
          const inDanger = beamDist < cfg.beamWidth * 0.9 && !isHere;
          return (
            <button
              key={spot.id}
              onClick={() => handleMove(spot.id)}
              disabled={ended}
              className="absolute rounded-xl transition active:scale-95"
              style={{
                left: `${spot.x}%`,
                top: `${spot.y}%`,
                transform: "translate(-50%, -50%)",
                width: "clamp(60px, 14vw, 80px)",
                height: "clamp(60px, 14vw, 80px)",
                background: isHere ? "rgba(79,255,143,0.25)" : "rgba(20,40,60,0.6)",
                border: isHere ? "2px solid #4fff8f" : inDanger ? "2px solid rgba(255,200,100,0.35)" : "2px solid rgba(100,140,170,0.3)",
                boxShadow: isHere ? "0 0 32px rgba(79,255,143,0.6)" : "none",
                fontSize: "clamp(22px, 6vw, 32px)",
                padding: 0,
                color: "#fff",
              }}
            >
              <div style={{ position: "relative", width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
                {spot.icon}
                {isHere && (
                  <div style={{
                    position: "absolute",
                    top: "50%", left: "50%",
                    transform: "translate(-50%, -50%)",
                    fontSize: "clamp(18px, 5vw, 26px)",
                    filter: caught ? "brightness(2) saturate(3)" : "drop-shadow(0 0 8px rgba(79,255,143,0.7))",
                  }}>👻</div>
                )}
              </div>
              <div style={{
                position: "absolute",
                bottom: "-18px",
                left: "50%",
                transform: "translateX(-50%)",
                fontSize: "9px",
                color: isHere ? "#4fff8f" : "rgba(200,220,230,0.5)",
                fontWeight: "bold",
                letterSpacing: "0.1em",
                whiteSpace: "nowrap",
              }}>{spot.label.toUpperCase()}</div>
            </button>
          );
        })}

        {/* Caught flash overlay */}
        {caught && (
          <div style={{
            position: "absolute",
            inset: 0,
            background: "radial-gradient(circle at center, rgba(255,100,100,0.4) 0%, transparent 70%)",
            pointerEvents: "none",
            animation: "pulse 0.3s ease-out",
          }}/>
        )}

        {ended && sweepCount >= cfg.sweeps && (
          <div className="absolute inset-0 flex items-center justify-center text-5xl font-bold"
            style={{ color: "#4fff8f", fontFamily: "'Creepster', cursive", textShadow: "0 0 24px rgba(79,255,143,1)" }}>
            HIDDEN!
          </div>
        )}
      </div>
      <div className="mt-3 text-xs text-slate-400 text-center">
        {ended
          ? livesLeft > 0 ? "The detective gave up!" : "Found you!"
          : "Tap a different hiding spot to dart there. Avoid the beam!"}
      </div>
    </div>
  );
}

// ============ VILLAIN ACT 3: CUTLER · INTO THE ABYSS ============

const CUTLER_ABYSS_DIFFICULTY = {
  easy:   { trenchWidth: 26, currentStrength: 0.35, needed: 2 },
  normal: { trenchWidth: 18, currentStrength: 0.6,  needed: 3 },
  hard:   { trenchWidth: 12, currentStrength: 0.95, needed: 3 },
};

const ABYSS_ITEMS = [
  { name: "Treasure Chest", icon: "💼" },
  { name: "Rusty Anchor",   icon: "⚓" },
  { name: "Iron Chain",     icon: "🔗" },
];

function CutlerAbyssIntro({ playerName, difficulty, onStart }) {
  return <VillainActIntro
    act={3}
    subtitle="INTO THE ABYSS"
    title="Bury the Evidence"
    accent="#4fff8f"
    bg="rgba(2,8,20,0.9)"
    description={<>
      <p><span className="text-green-300 font-semibold">{playerName}</span>, the detective will dive deeper soon. Get rid of the evidence — forever.</p>
      <p className="mt-2">Drop the treasure into the <span className="text-green-300 font-semibold">deep trench</span> where no one will ever find it.</p>
    </>}
    hint={<>The current will push you side to side. <span className="text-green-400 font-semibold">Tap RELEASE</span> when you're lined up over the trench. Miss and the detective finds it.</>}
    buttonText="START DROPPING"
    onStart={onStart}
    difficulty={difficulty}
  />;
}

function CutlerAbyssGame({ playerName, difficulty, onWin, onFail }) {
  const cfg = CUTLER_ABYSS_DIFFICULTY[difficulty];
  const [currentItem, setCurrentItem] = useState(0);
  const [playerX, setPlayerX] = useState(50);
  const [drift, setDrift] = useState(0);
  const [dropping, setDropping] = useState(null);
  const [results, setResults] = useState([]);
  const [ended, setEnded] = useState(false);

  // Current drift
  useEffect(() => {
    if (ended || dropping) return;
    const iv = setInterval(() => {
      setPlayerX(x => {
        const nx = x + drift * cfg.currentStrength;
        return Math.max(8, Math.min(92, nx));
      });
      setDrift(d => {
        let nd = d + (Math.random() - 0.5) * 0.35;
        if (d > 0.9) nd -= 0.15;
        if (d < -0.9) nd += 0.15;
        return Math.max(-1, Math.min(1, nd));
      });
    }, 50);
    return () => clearInterval(iv);
  }, [drift, cfg, dropping, ended]);

  const handleRelease = () => {
    if (dropping || ended || currentItem >= ABYSS_ITEMS.length) return;
    ensureAudio();
    playSound("jump");
    setDropping({ x: playerX, y: 28, vx: drift * cfg.currentStrength * 0.3, item: ABYSS_ITEMS[currentItem] });
  };

  // Falling animation
  useEffect(() => {
    if (!dropping) return;
    const iv = setInterval(() => {
      setDropping(d => {
        if (!d) return null;
        const ny = d.y + 4;
        const nx = Math.max(5, Math.min(95, d.x + d.vx));
        if (ny >= 78) {
          const trenchCenter = 50;
          const success = Math.abs(nx - trenchCenter) < cfg.trenchWidth / 2;
          ensureAudio();
          playSound(success ? "snack" : "hit");
          setResults(r => {
            const nr = [...r, success];
            const totalSuccess = nr.filter(x => x).length;
            const nextItem = currentItem + 1;
            if (nextItem >= ABYSS_ITEMS.length) {
              setEnded(true);
              setTimeout(() => {
                if (totalSuccess >= cfg.needed) {
                  playSound("win");
                  setTimeout(() => onWin({ success: totalSuccess, total: ABYSS_ITEMS.length }), 500);
                } else {
                  playSound("lose");
                  setTimeout(() => onFail({ success: totalSuccess, total: ABYSS_ITEMS.length }), 500);
                }
              }, 400);
            } else {
              setTimeout(() => setCurrentItem(nextItem), 400);
            }
            return nr;
          });
          return null;
        }
        return { ...d, y: ny, x: nx };
      });
    }, 40);
    return () => clearInterval(iv);
  }, [dropping, cfg, currentItem, onWin, onFail]);

  const trenchLeftPct = 50 - cfg.trenchWidth / 2;
  const trenchWidthPct = cfg.trenchWidth;

  return (
    <div className="max-w-2xl w-full">
      <div className="mb-3 flex justify-between items-center text-sm px-2">
        <div className="text-green-300 font-bold">
          {currentItem < ABYSS_ITEMS.length ? `${ABYSS_ITEMS[currentItem].icon} ${ABYSS_ITEMS[currentItem].name}` : "—"}
        </div>
        <div className="text-xs text-slate-400 tracking-widest">INTO THE ABYSS</div>
        <div className="text-yellow-300 font-bold">{results.filter(x => x).length}/{cfg.needed}</div>
      </div>

      <div className="relative rounded-xl overflow-hidden"
        style={{
          background: "linear-gradient(180deg, #0a1828 0%, #050a1a 40%, #01040a 100%)",
          border: "2px solid rgba(79,255,143,0.35)",
          boxShadow: "0 10px 40px rgba(0,0,0,0.6), inset 0 0 50px rgba(0,0,0,0.8)",
          aspectRatio: "16 / 9",
          minHeight: "300px",
        }}>
        {/* Light rays from above */}
        <div style={{
          position: "absolute",
          inset: 0,
          background: "linear-gradient(180deg, rgba(100,200,255,0.08) 0%, rgba(100,200,255,0.02) 30%, transparent 60%)",
          pointerEvents: "none",
        }}/>
        {/* Bubbles */}
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} style={{
            position: "absolute",
            left: `${10 + i * 15}%`,
            top: `${20 + (i * 7) % 30}%`,
            fontSize: `${8 + (i % 3) * 2}px`,
            opacity: 0.3 + (i % 3) * 0.1,
            color: "#a0d0f0",
          }}>○</div>
        ))}
        {/* Current indicator */}
        <div style={{
          position: "absolute",
          left: "8%", right: "8%",
          top: "28%",
          height: "2px",
          background: `linear-gradient(${drift >= 0 ? 90 : 270}deg, transparent, rgba(100,200,255,${Math.abs(drift) * 0.45}), transparent)`,
          pointerEvents: "none",
        }}/>

        {/* Cutler at top */}
        <div style={{
          position: "absolute",
          left: `${playerX}%`,
          top: "10%",
          transform: "translateX(-50%)",
          fontSize: "clamp(24px, 6vw, 34px)",
          transition: "left 0.05s linear",
          filter: "drop-shadow(0 0 14px rgba(79,255,143,0.7))",
        }}>👻</div>

        {/* Item held */}
        {!dropping && currentItem < ABYSS_ITEMS.length && !ended && (
          <div style={{
            position: "absolute",
            left: `${playerX}%`,
            top: "22%",
            transform: "translateX(-50%)",
            fontSize: "clamp(22px, 5vw, 30px)",
            transition: "left 0.05s linear",
            filter: "drop-shadow(0 0 6px rgba(255,223,122,0.8))",
          }}>{ABYSS_ITEMS[currentItem].icon}</div>
        )}

        {/* Falling item */}
        {dropping && (
          <div style={{
            position: "absolute",
            left: `${dropping.x}%`,
            top: `${dropping.y}%`,
            transform: "translateX(-50%)",
            fontSize: "clamp(22px, 5vw, 30px)",
            filter: "drop-shadow(0 4px 10px rgba(0,0,0,0.6))",
          }}>{dropping.item.icon}</div>
        )}

        {/* Seafloor */}
        <div style={{
          position: "absolute",
          bottom: 0, left: 0, right: 0,
          height: "22%",
          background: "linear-gradient(180deg, #3a3a5a 0%, #1a1a2a 40%, #0a0a1a 100%)",
          borderTop: "1px solid #4a4a6a",
        }}/>
        {/* Seafloor texture */}
        <div style={{
          position: "absolute",
          bottom: "14%",
          left: 0, right: 0,
          height: "4px",
          background: "repeating-linear-gradient(90deg, transparent 0, transparent 20px, rgba(100,100,140,0.3) 20px, rgba(100,100,140,0.3) 22px)",
        }}/>

        {/* Trench */}
        <div style={{
          position: "absolute",
          bottom: 0,
          left: `${trenchLeftPct}%`,
          width: `${trenchWidthPct}%`,
          height: "22%",
          background: "linear-gradient(180deg, rgba(0,0,0,0.95) 0%, #000000 50%)",
          boxShadow: "inset 0 4px 8px rgba(0,0,0,0.9)",
        }}/>
        {/* Trench edges */}
        <div style={{
          position: "absolute",
          bottom: "21%",
          left: `${trenchLeftPct}%`,
          width: "2px",
          height: "3px",
          background: "#4fff8f",
          boxShadow: "0 0 6px #4fff8f",
          opacity: 0.6,
        }}/>
        <div style={{
          position: "absolute",
          bottom: "21%",
          left: `${trenchLeftPct + trenchWidthPct}%`,
          width: "2px",
          height: "3px",
          background: "#4fff8f",
          boxShadow: "0 0 6px #4fff8f",
          opacity: 0.6,
        }}/>

        {/* Release button */}
        <button
          onClick={handleRelease}
          disabled={dropping || ended || currentItem >= ABYSS_ITEMS.length}
          className="absolute left-1/2 transform -translate-x-1/2 px-8 py-3 rounded-full font-bold transition active:scale-95"
          style={{
            bottom: "3%",
            background: (dropping || ended) ? "rgba(60,60,80,0.5)" : "linear-gradient(135deg, #4fff8f 0%, #2dd06e 100%)",
            color: "#062a14",
            fontFamily: "'Fredoka', sans-serif",
            boxShadow: "0 4px 20px rgba(79,255,143,0.6)",
            border: "2px solid rgba(180,255,200,0.5)",
            fontSize: "1.05rem",
            letterSpacing: "0.1em",
            zIndex: 5,
          }}
        >
          {dropping ? "DROPPING..." : "RELEASE"}
        </button>

        {/* Results display */}
        <div className="absolute top-2 right-2 flex gap-1">
          {results.map((r, i) => (
            <span key={i} className="text-xl font-bold" style={{ color: r ? "#4fff8f" : "#ff7070" }}>
              {r ? "✓" : "✗"}
            </span>
          ))}
        </div>
      </div>
      <div className="mt-3 text-xs text-slate-400 text-center">
        {ended
          ? results.filter(x => x).length >= cfg.needed ? "Lost to the deep!" : "The detective found some..."
          : "Ride the current. Tap RELEASE when lined up over the trench."}
      </div>
    </div>
  );
}

// ============ FINAL VILLAIN VICTORY ============

function FinalVillainVictory({ playerName, theme, onHome, onReplay }) {
  const title = theme.id === "miner" ? "The Gold Stays Hidden!" : "Lost to the Deep!";
  const story = theme.id === "miner"
    ? `${playerName} buried every last nugget and dropped the tunnel behind them. The detective dug for weeks and found nothing but rocks and dust.`
    : `${playerName} slipped into the trench with all the evidence. The detective searched the wreck, the kelp, every porthole — gone. The sea keeps its secrets.`;
  const gloat = theme.id === "miner"
    ? `"Yah-hah-hah-hah! Thar's gold in these hills… and it's ALL MINE! Ya can't catch what ya can't see!"`
    : `"A ghost can never truly be caught. The tide takes everything — and I take the rest."`;
  return (
    <div className="max-w-xl w-full text-center">
      <div className="text-xs tracking-[0.35em] mb-2" style={{ color: theme.accent }}>
        VILLAIN MODE · COMPLETE
      </div>
      <h1 style={{
        fontFamily: "'Creepster', cursive",
        fontSize: "clamp(2.5rem, 8vw, 4.5rem)",
        color: theme.accent,
        textShadow: `0 0 28px ${theme.accent}aa, 2px 2px 0 #0a0a1a`,
        letterSpacing: "0.03em",
        margin: 0,
        lineHeight: 1.05,
      }}>{title}</h1>

      {/* Three-star trophy row */}
      <div className="flex justify-center gap-3 my-5 text-5xl">
        {[1, 2, 3].map(i => (
          <span key={i} style={{
            color: "#ffdf7a",
            textShadow: "0 0 20px rgba(255,223,122,0.9)",
            animation: `starPop 0.4s ease-out ${i * 0.15}s backwards`,
          }}>★</span>
        ))}
      </div>

      <div className="rounded-xl p-5 my-5 text-left space-y-3 text-slate-200"
        style={{ background: "rgba(10,10,30,0.7)", border: `1px solid ${theme.accent}55`, backdropFilter: "blur(6px)" }}>
        <p>{story}</p>
        <p className="text-sm italic mt-3" style={{ color: theme.accent }}>{gloat}</p>
      </div>

      <div className="text-xs text-slate-400 mb-4 italic">
        You beat all 3 acts as {theme.name}. Try a different character for a new story.
      </div>

      <div className="grid grid-cols-2 gap-3">
        <button onClick={onReplay} className="py-4 rounded-lg font-bold transition hover:brightness-110 active:scale-95"
          style={{
            background: `linear-gradient(135deg, ${theme.accent}, ${theme.accent}bb)`,
            color: "#062a14",
            fontFamily: "'Fredoka', sans-serif",
            boxShadow: `0 6px 20px ${theme.accent}66`,
          }}>
          PLAY AGAIN
        </button>
        <button onClick={onHome} className="py-4 rounded-lg font-bold transition hover:brightness-110 active:scale-95"
          style={{
            background: "rgba(40,40,70,0.8)",
            color: "#fff",
            fontFamily: "'Fredoka', sans-serif",
            border: "1px solid rgba(140,140,180,0.4)",
          }}>
          HOME
        </button>
      </div>

      <div className="mt-6 text-xs text-slate-600 tracking-[0.25em]">
        A MEN CAN CLEAN TOO GAME
      </div>
    </div>
  );
}

// ============ VILLAIN VICTORY SCREEN ============

function VillainVictory({ result, playerName, theme, onRetry, onHome, onSwitchCharacter, onContinue }) {
  const { won, distance, snacks, hits, stars } = result;

  const title = won
    ? theme.id === "miner"
      ? "Safe In The Mine!"
      : "Into The Deep!"
    : "Caught!";

  const subtitle = won
    ? theme.id === "miner"
      ? `${playerName} disappeared into the gold vein. The detective lost the trail.`
      : `${playerName} slipped into the shipwreck. The detective arrived too late.`
    : `The detective cornered you ${FINISH_DISTANCE - distance}m from ${theme.destinationName}...`;

  const gloat = theme.id === "miner"
    ? "“Thar's gold in these hills… and it's ALL MINE! Yah-hah-hah-hah!”"
    : "“A ghost can never truly be caught… we just slip back to the sea.”";

  const cantCatchMe = theme.id === "miner"
    ? "Try a different character — maybe YOU can catch this sneaky miner."
    : "Think you can escape as someone else? Pick a new character.";

  return (
    <div className="max-w-xl w-full text-center">
      <div className="mb-2 text-xs tracking-[0.3em]" style={{ color: won ? theme.accent : "#ff7070" }}>
        {won ? "VILLAIN ESCAPED" : "DETECTIVE WON"}
      </div>
      <h2
        style={{
          fontFamily: "'Creepster', cursive",
          fontSize: "clamp(2.5rem, 7vw, 4rem)",
          color: won ? theme.accent : "#ff7070",
          textShadow: `0 0 24px ${won ? theme.accent + "88" : "rgba(255,112,112,0.45)"}, 2px 2px 0 #0a0a1a`,
          letterSpacing: "0.03em",
          margin: 0,
          lineHeight: 1.1,
        }}
      >
        {title}
      </h2>

      <div className="text-base text-slate-300 my-4 px-2">
        {subtitle}
      </div>

      {/* Stars */}
      <div className="flex justify-center gap-3 my-5 text-5xl">
        {[1, 2, 3].map((i) => (
          <span
            key={i}
            style={{
              color: i <= stars ? "#ffdf7a" : "#3a3a55",
              textShadow: i <= stars ? "0 0 18px rgba(255, 223, 122, 0.8)" : "none",
              filter: i <= stars ? "none" : "saturate(0)",
              transition: "all 0.2s",
            }}
          >
            ★
          </span>
        ))}
      </div>

      {/* Stats */}
      <div
        className="rounded-xl p-4 my-4 text-sm grid grid-cols-3 gap-2 text-slate-200"
        style={{
          background: "rgba(10, 10, 30, 0.65)",
          border: `1px solid ${theme.accent}33`,
        }}
      >
        <div>
          <div className="text-xs text-slate-400 tracking-widest">DISTANCE</div>
          <div className="text-xl font-bold" style={{ color: theme.accent }}>{Math.floor(distance)}m</div>
        </div>
        <div>
          <div className="text-xs text-slate-400 tracking-widest">{theme.collectibleEmoji} GRABBED</div>
          <div className="text-xl font-bold text-yellow-200">{snacks}</div>
        </div>
        <div>
          <div className="text-xs text-slate-400 tracking-widest">HITS</div>
          <div className="text-xl font-bold text-red-300">{hits}/3</div>
        </div>
      </div>

      {won && (
        <div
          className="rounded-xl p-4 my-4 text-left"
          style={{
            background: `linear-gradient(135deg, ${theme.accent}22, ${theme.accent}08)`,
            border: `1px solid ${theme.accent}44`,
          }}
        >
          <div className="text-xs tracking-widest mb-1" style={{ color: theme.accent }}>
            {theme.name.toUpperCase()} CACKLES:
          </div>
          <div className="italic text-slate-100">{gloat}</div>
          <div className="text-xs text-slate-400 mt-2">{cantCatchMe}</div>
        </div>
      )}

      {won ? (
        <>
          <button
            onClick={onContinue}
            className="w-full py-5 rounded-lg font-bold text-xl transition hover:brightness-110 active:scale-95 mt-4"
            style={{
              background: `linear-gradient(135deg, ${theme.accent} 0%, ${theme.accent}cc 100%)`,
              color: "#062a14",
              fontFamily: "'Fredoka', sans-serif",
              boxShadow: `0 6px 24px ${theme.accent}77`,
              border: `2px solid ${theme.accent}`,
            }}
          >
            CONTINUE → ACT 2
          </button>
          <div className="grid grid-cols-3 gap-2 mt-3">
            <button
              onClick={onRetry}
              className="py-3 rounded-lg font-bold text-xs transition hover:brightness-110 active:scale-[0.97]"
              style={{
                background: "rgba(40, 40, 70, 0.8)",
                color: "#fff",
                fontFamily: "'Fredoka', sans-serif",
                border: "1px solid rgba(140, 140, 180, 0.4)",
              }}
            >REPLAY CHASE</button>
            <button
              onClick={onSwitchCharacter}
              className="py-3 rounded-lg font-bold text-xs transition hover:brightness-110 active:scale-[0.97]"
              style={{
                background: "rgba(40, 40, 70, 0.8)",
                color: "#fff",
                fontFamily: "'Fredoka', sans-serif",
                border: "1px solid rgba(140, 140, 180, 0.4)",
              }}
            >SWITCH CHAR</button>
            <button
              onClick={onHome}
              className="py-3 rounded-lg font-bold text-xs transition hover:brightness-110 active:scale-[0.97]"
              style={{
                background: "rgba(40, 40, 70, 0.8)",
                color: "#fff",
                fontFamily: "'Fredoka', sans-serif",
                border: "1px solid rgba(140, 140, 180, 0.4)",
              }}
            >HOME</button>
          </div>
        </>
      ) : (
        <div className="grid grid-cols-3 gap-2 mt-5">
          <button
            onClick={onRetry}
            className="py-4 rounded-lg font-bold transition hover:brightness-110 active:scale-[0.97]"
            style={{
              background: `linear-gradient(135deg, ${theme.accent} 0%, ${theme.accent}cc 100%)`,
              color: "#062a14",
              fontFamily: "'Fredoka', sans-serif",
              boxShadow: `0 6px 20px ${theme.accent}55`,
              fontSize: "0.95rem",
            }}
          >
            <div>TRY AGAIN</div>
          </button>
          <button
            onClick={onSwitchCharacter}
            className="py-4 rounded-lg font-bold transition hover:brightness-110 active:scale-[0.97]"
            style={{
              background: "rgba(40, 40, 70, 0.8)",
              color: "#fff",
              fontFamily: "'Fredoka', sans-serif",
              border: "1px solid rgba(140, 140, 180, 0.4)",
              fontSize: "0.95rem",
            }}
          >
            <div>SWITCH</div>
            <div className="text-[10px] opacity-70">CHARACTER</div>
          </button>
          <button
            onClick={onHome}
            className="py-4 rounded-lg font-bold transition hover:brightness-110 active:scale-[0.97]"
            style={{
              background: "rgba(40, 40, 70, 0.8)",
              color: "#fff",
              fontFamily: "'Fredoka', sans-serif",
              border: "1px solid rgba(140, 140, 180, 0.4)",
              fontSize: "0.95rem",
            }}
          >
            <div>HOME</div>
          </button>
        </div>
      )}
    </div>
  );
}

// ============ MAIN APP ============

export default function CaptainCutlerGame() {
  const [screen, setScreen] = useState("start");
  const [playerName, setPlayerName] = useState("");
  const [difficulty, setDifficulty] = useState("normal");
  const [themeId, setThemeId] = useState("detective");
  const [result, setResult] = useState(null);

  const theme = THEMES[themeId];

  useEffect(() => {
    const id = "cc-fonts";
    if (!document.getElementById(id)) {
      const link = document.createElement("link");
      link.id = id;
      link.rel = "stylesheet";
      link.href = "https://fonts.googleapis.com/css2?family=Creepster&family=Fredoka:wght@400;600;700&display=swap";
      document.head.appendChild(link);
    }
  }, []);

  return (
    <div
      className="w-full min-h-screen flex items-center justify-center p-4 text-white"
      style={{
        fontFamily: "'Fredoka', system-ui, sans-serif",
        background: "radial-gradient(ellipse at 50% 20%, #1f1a4a 0%, #0b0b2a 55%, #050518 100%)",
        backgroundAttachment: "fixed",
      }}
    >
      {screen === "start" && (
        <StartScreen
          onStart={(name, diff, chosenThemeId) => {
            setPlayerName(name);
            setDifficulty(diff);
            setThemeId(chosenThemeId);
            setScreen("playing");
          }}
        />
      )}
      {screen === "playing" && (
        <GameCanvas
          playerName={playerName}
          difficulty={difficulty}
          theme={theme}
          onGameOver={(r) => {
            setResult(r);
            setScreen(theme.hasStoryMode ? "gameover" : "villain_end");
          }}
        />
      )}
      {screen === "gameover" && result && (
        <GameOverScreen
          result={result}
          playerName={playerName}
          onRetry={() => { setResult(null); setScreen("playing"); }}
          onHome={() => { setResult(null); setScreen("start"); }}
          onContinue={() => { setScreen("act2_intro"); }}
        />
      )}
      {screen === "villain_end" && result && (
        <VillainVictory
          result={result}
          playerName={playerName}
          theme={theme}
          onRetry={() => { setResult(null); setScreen("playing"); }}
          onContinue={() => { setScreen("villain_act2_intro"); }}
          onSwitchCharacter={() => { setResult(null); setScreen("start"); }}
          onHome={() => { setResult(null); setScreen("start"); }}
        />
      )}
      {screen === "villain_act2_intro" && (
        themeId === "miner"
          ? <MinerDigIntro playerName={playerName} difficulty={difficulty} onStart={() => setScreen("villain_act2")} />
          : <CutlerHideIntro playerName={playerName} difficulty={difficulty} onStart={() => setScreen("villain_act2")} />
      )}
      {screen === "villain_act2" && (
        themeId === "miner"
          ? <MinerDigGame
              playerName={playerName}
              difficulty={difficulty}
              onWin={() => setScreen("villain_act3_intro")}
              onFail={() => setScreen("villain_act2_fail")}
            />
          : <CutlerHideGame
              playerName={playerName}
              difficulty={difficulty}
              onWin={() => setScreen("villain_act3_intro")}
              onFail={() => setScreen("villain_act2_fail")}
            />
      )}
      {screen === "villain_act2_fail" && (
        <VillainActFail
          title={themeId === "miner" ? "Cave-In!" : "Caught!"}
          subtitle={themeId === "miner" ? "MINE COLLAPSED" : "BEAM FOUND YOU"}
          message={themeId === "miner"
            ? `The tunnel caved in before you found all your gold. ${playerName}, try again!`
            : `The detective spotted you in the wreck. ${playerName}, you need to move faster!`}
          accent={theme.accent}
          onRetry={() => setScreen("villain_act2_intro")}
          onHome={() => { setResult(null); setScreen("start"); }}
        />
      )}
      {screen === "villain_act3_intro" && (
        themeId === "miner"
          ? <MinerBlastIntro playerName={playerName} difficulty={difficulty} onStart={() => setScreen("villain_act3")} />
          : <CutlerAbyssIntro playerName={playerName} difficulty={difficulty} onStart={() => setScreen("villain_act3")} />
      )}
      {screen === "villain_act3" && (
        themeId === "miner"
          ? <MinerBlastGame
              playerName={playerName}
              difficulty={difficulty}
              onWin={() => setScreen("villain_final")}
              onFail={() => setScreen("villain_act3_fail")}
            />
          : <CutlerAbyssGame
              playerName={playerName}
              difficulty={difficulty}
              onWin={() => setScreen("villain_final")}
              onFail={() => setScreen("villain_act3_fail")}
            />
      )}
      {screen === "villain_act3_fail" && (
        <VillainActFail
          title={themeId === "miner" ? "Fuse Failed!" : "Too Many Found!"}
          subtitle={themeId === "miner" ? "WRONG ORDER" : "EVIDENCE LEFT BEHIND"}
          message={themeId === "miner"
            ? `The detective heard the fuse sputter. ${playerName}, you need to remember the sequence!`
            : `The detective found the evidence on the seafloor. ${playerName}, you need to drop them in the trench!`}
          accent={theme.accent}
          onRetry={() => setScreen("villain_act3_intro")}
          onHome={() => { setResult(null); setScreen("start"); }}
        />
      )}
      {screen === "villain_final" && (
        <FinalVillainVictory
          playerName={playerName}
          theme={theme}
          onHome={() => { setResult(null); setScreen("start"); }}
          onReplay={() => { setResult(null); setScreen("start"); }}
        />
      )}
      {screen === "act2_intro" && (
        <InvestigationIntro
          playerName={playerName}
          onStart={() => setScreen("act2")}
        />
      )}
      {screen === "act2" && (
        <InvestigationGame
          playerName={playerName}
          onSolved={() => setScreen("act2_end")}
        />
      )}
      {screen === "act2_end" && (
        <InvestigationEnd
          playerName={playerName}
          onHome={() => { setResult(null); setScreen("start"); }}
          onReplay={() => setScreen("act2")}
          onContinue={() => setScreen("act3_intro")}
        />
      )}
      {screen === "act3_intro" && (
        <TrapIntro
          playerName={playerName}
          onStart={() => setScreen("act3")}
        />
      )}
      {screen === "act3" && (
        <TrapGame
          onSolved={() => setScreen("act3_end")}
          onFailed={() => setScreen("act3_fail")}
        />
      )}
      {screen === "act3_fail" && (
        <TrapFail onRetry={() => setScreen("act3")} />
      )}
      {screen === "act3_end" && (
        <FinalVictory
          playerName={playerName}
          onHome={() => { setResult(null); setScreen("start"); }}
          onReplayAll={() => { setResult(null); setScreen("start"); }}
        />
      )}
    </div>
  );
}
