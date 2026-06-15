// Canvas-generated textures, styled after the classic factory-floor board art
// (light riveted plates, dark belt tracks with green/blue arrows, hazard stripes).
// No external asset files.
import * as THREE from 'three';

// Riveted metal floor plate. variant: 0 = light, 1 = slightly darker, 2 = dock (green tint).
export function plateTexture(variant = 0) {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 128;
  const g = c.getContext('2d');
  const base = variant === 2 ? '#76907e' : variant === 1 ? '#a7adb4' : '#b9bfc6';
  g.fillStyle = base;
  g.fillRect(0, 0, 128, 128);

  // subtle brushed shading
  for (let i = 0; i < 90; i++) {
    g.fillStyle = `rgba(${Math.random() > 0.5 ? '255,255,255' : '40,46,52'},${0.025 + Math.random() * 0.03})`;
    const w = 10 + Math.random() * 50;
    g.fillRect(Math.random() * 128, Math.random() * 128, w, 1.5);
  }
  // panel seam
  g.strokeStyle = 'rgba(40,46,54,0.55)';
  g.lineWidth = 3;
  g.strokeRect(1.5, 1.5, 125, 125);
  g.strokeStyle = 'rgba(255,255,255,0.18)';
  g.lineWidth = 1;
  g.strokeRect(4, 4, 120, 120);

  // rivets along the edges
  const rivet = (x, y) => {
    g.fillStyle = '#6f757d';
    g.beginPath(); g.arc(x, y, 2.6, 0, Math.PI * 2); g.fill();
    g.fillStyle = 'rgba(255,255,255,0.5)';
    g.beginPath(); g.arc(x - 0.8, y - 0.8, 1, 0, Math.PI * 2); g.fill();
  };
  for (const p of [14, 43, 85, 114]) { rivet(p, 9); rivet(p, 119); rivet(9, p); rivet(119, p); }

  const tex = new THREE.CanvasTexture(c);
  tex.anisotropy = 4;
  return tex;
}

// Yellow/black diagonal hazard stripes (pit rims).
export function hazardTexture() {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = '#e8c020';
  g.fillRect(0, 0, 64, 64);
  g.fillStyle = '#16161a';
  g.lineWidth = 0;
  for (let i = -64; i < 128; i += 16) {
    g.beginPath();
    g.moveTo(i, 64); g.lineTo(i + 16, 48); g.lineTo(i + 24, 48); g.lineTo(i + 8, 64);
    g.closePath(); g.fill();
    g.beginPath();
    g.moveTo(i, 16); g.lineTo(i + 16, 0); g.lineTo(i + 24, 0); g.lineTo(i + 8, 16);
    g.closePath(); g.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

// Belt track: dark tread with pale link rails; green arrow (normal) or
// blue double chevrons (express), pointing toward +V = belt direction.
export function beltTexture(express) {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = '#15181c';
  g.fillRect(0, 0, 64, 64);

  // side rails: pale "caterpillar" track links like the board art
  g.fillStyle = '#cfc9a8';
  for (let y = 0; y < 64; y += 8) {
    g.fillRect(1, y + 1, 7, 6);
    g.fillRect(56, y + 1, 7, 6);
  }
  g.fillStyle = 'rgba(0,0,0,0.25)';
  for (let y = 0; y < 64; y += 8) {
    g.fillRect(1, y + 5, 7, 2);
    g.fillRect(56, y + 5, 7, 2);
  }

  if (express) {
    // double blue chevrons
    g.strokeStyle = '#5db5e8';
    g.lineWidth = 6;
    g.lineJoin = 'round';
    g.lineCap = 'round';
    for (const cy of [16, 36, 56]) {
      g.beginPath();
      g.moveTo(16, cy + 8); g.lineTo(32, cy - 8); g.lineTo(48, cy + 8);
      g.stroke();
    }
  } else {
    // one bold outlined green arrow
    g.strokeStyle = '#79b840';
    g.fillStyle = 'rgba(121,184,64,0.25)';
    g.lineWidth = 4;
    g.lineJoin = 'round';
    g.beginPath();
    g.moveTo(32, 6); g.lineTo(50, 28); g.lineTo(40, 28); g.lineTo(40, 56);
    g.lineTo(24, 56); g.lineTo(24, 28); g.lineTo(14, 28);
    g.closePath();
    g.fill();
    g.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  return tex;
}

// Icon on a dark riveted plate (repair / upgrade sites).
export function iconPlateTexture(text, { fg = '#e8e8e8' } = {}) {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#23282e';
  g.beginPath();
  g.roundRect(6, 6, 116, 116, 14);
  g.fill();
  g.strokeStyle = '#4a525c';
  g.lineWidth = 4;
  g.stroke();
  // grate lines
  g.strokeStyle = 'rgba(255,255,255,0.07)';
  g.lineWidth = 3;
  for (let y = 22; y < 116; y += 12) {
    g.beginPath(); g.moveTo(14, y); g.lineTo(114, y); g.stroke();
  }
  g.fillStyle = fg;
  g.font = 'bold 72px "Segoe UI Emoji", "Segoe UI", sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, 64, 68);
  const tex = new THREE.CanvasTexture(c);
  tex.anisotropy = 4;
  return tex;
}

export function glyphTexture(text, { bg = 'rgba(0,0,0,0)', fg = '#ffffff', size = 96, font = null } = {}) {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 128;
  const g = c.getContext('2d');
  if (bg !== 'rgba(0,0,0,0)') { g.fillStyle = bg; g.fillRect(0, 0, 128, 128); }
  g.fillStyle = fg;
  g.font = font || `bold ${size}px "Segoe UI", sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, 64, 70);
  const tex = new THREE.CanvasTexture(c);
  tex.anisotropy = 4;
  return tex;
}

export function curveTexture(turn) {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 64;
  const g = c.getContext('2d');
  g.strokeStyle = '#9fd55e';
  g.fillStyle = '#9fd55e';
  g.lineWidth = 6;
  g.lineCap = 'round';
  g.beginPath();
  if (turn === 'right') { g.arc(32, 32, 17, Math.PI * 0.75, Math.PI * 1.75); }
  else { g.arc(32, 32, 17, Math.PI * 0.25, Math.PI * 1.25, true); }
  g.stroke();
  // arrowhead
  g.beginPath();
  if (turn === 'right') { g.moveTo(50, 14); g.lineTo(56, 28); g.lineTo(42, 26); }
  else { g.moveTo(14, 14); g.lineTo(8, 28); g.lineTo(22, 26); }
  g.closePath();
  g.fill();
  const tex = new THREE.CanvasTexture(c);
  return tex;
}
