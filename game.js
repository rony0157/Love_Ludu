/* ============================================================
   LOVE LUDU 💞 — Real Ludo King Engine (Single-Trigger & Zero-Lock)
   ============================================================ */

const canvas = document.getElementById('luduCanvas');
const ctx = canvas.getContext('2d');

const GRID = 15;
const CENTER = 7;

const PALETTE = {
  bg: '#170510',
  boardBg: '#fffbf5',
  gridLine: '#d2b69f',
  red: '#d92b4b',
  redLight: '#ff4d6d',
  green: '#1ba362',
  yellow: '#f1aa13',
  blue: '#2365c4',
  blueLight: '#3d85eb',
  gold: '#f3c64f',
  star: '#ffbe0b',
  white: '#ffffff',
  ink: '#2b101d',
  yardWhite: '#ffffff',
};

const DICE_EMOJIS = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];

// ------------------------------------------------------------
// 1. OFFICIAL 52-CELL LUDO RING & HOME PATHS
// ------------------------------------------------------------
const RING = [
  // Left arm top row -> right
  {r:6,c:1},{r:6,c:2},{r:6,c:3},{r:6,c:4},{r:6,c:5},
  // Top arm left col -> up
  {r:5,c:6},{r:4,c:6},{r:3,c:6},{r:2,c:6},{r:1,c:6},{r:0,c:6},
  // Top turn
  {r:0,c:7},
  // Top arm right col -> down
  {r:0,c:8},{r:1,c:8},{r:2,c:8},{r:3,c:8},{r:4,c:8},{r:5,c:8},
  // Right arm top row -> right
  {r:6,c:9},{r:6,c:10},{r:6,c:11},{r:6,c:12},{r:6,c:13},{r:6,c:14},
  // Right turn
  {r:7,c:14},
  // Right arm bottom row -> left
  {r:8,c:14},{r:8,c:13},{r:8,c:12},{r:8,c:11},{r:8,c:10},{r:8,c:9},
  // Bottom arm right col -> down
  {r:9,c:8},{r:10,c:8},{r:11,c:8},{r:12,c:8},{r:13,c:8},{r:14,c:8},
  // Bottom turn
  {r:14,c:7},
  // Bottom arm left col -> up
  {r:14,c:6},{r:13,c:6},{r:12,c:6},{r:11,c:6},{r:10,c:6},{r:9,c:6},
  // Left arm bottom row -> left
  {r:8,c:5},{r:8,c:4},{r:8,c:3},{r:8,c:2},{r:8,c:1},{r:8,c:0},
  // Left turn
  {r:7,c:0},
  // Re-entry to Red start
  {r:6,c:0}
];

const RING_LEN = RING.length; // 52
const HOME_LEN = 5;
const FINISH = RING_LEN + HOME_LEN + 1; // 58

// Safe spots (4 starts + 4 stars)
const SAFE_RING_INDICES = new Set([0, 13, 26, 39, 8, 21, 34, 47]);

const PLAYERS = [
  {
    name: 'তুমি',
    avatar: '🤵',
    color: PALETTE.red,
    lightColor: PALETTE.redLight,
    startIndex: 0, // (6,1)
    yardCells: [{r:2,c:2},{r:2,c:3},{r:3,c:2},{r:3,c:3}],
    homeStretch: [{r:7,c:1},{r:7,c:2},{r:7,c:3},{r:7,c:4},{r:7,c:5}],
    homeTarget: {r:7,c:6}
  },
  {
    name: 'পাপড়ি',
    avatar: '👸',
    color: PALETTE.blue,
    lightColor: PALETTE.blueLight,
    startIndex: 26, // (8,13)
    yardCells: [{r:11,c:11},{r:11,c:12},{r:12,c:11},{r:12,c:12}],
    homeStretch: [{r:7,c:13},{r:7,c:12},{r:7,c:11},{r:7,c:10},{r:7,c:9}],
    homeTarget: {r:7,c:8}
  }
];

// ------------------------------------------------------------
// 2. GAME STATE
// ------------------------------------------------------------
const state = {
  current: 0,             // 0: Red/Tumi, 1: Blue/Papri
  dice: null,
  rolling: false,
  busy: false,            // Zero-Lock Flag: Prevents overlapping actions & timeouts
  consecutiveSixes: 0,
  awaitingSelection: false,
  movable: [],
  tokens: [
    [{progress:0},{progress:0},{progress:0},{progress:0}],
    [{progress:0},{progress:0},{progress:0},{progress:0}]
  ],
  finished: [0, 0],
  animatingToken: null,   // { playerIdx, tokenIdx, path: [{r,c}], currentStep: 0, t: 0 }
};

let isLocalMode = false;
let localPlayerIdx = 0; // 0 for host/p1, 1 for guest/p2
let roomCode = null;
let roomRef = null;
let lastRollTs = 0;
let lastMoveTs = 0;
let lastStateTs = 0;
let lastLoveTs = 0;
let winShown = false;
let lastActivityTs = Date.now();

// ------------------------------------------------------------
// WATCHDOG ENGINE & AFK TIMEOUT — ZERO-LOCK INFINITE GAME GUARANTEE
// ------------------------------------------------------------
function forceHealGameState() {
  if (winShown) return;
  if (state.animatingToken) {
    if (typeof state.animatingToken.onComplete === 'function') {
      try { state.animatingToken.onComplete(); } catch (e) {}
    }
    state.animatingToken = null;
  }
  state.rolling = false;
  state.busy = false;
  clearInterval(window._diceInterval);

  if (typeof state.dice === 'number' && state.dice >= 1 && state.dice <= 6) {
    const moves = legalMoves(state.current, state.dice);
    if (moves.length > 0) {
      state.awaitingSelection = true;
      state.movable = moves;
    } else {
      endTurn(state.current, false);
    }
  } else {
    state.awaitingSelection = false;
    state.movable = [];
  }
  lastActivityTs = Date.now();
  updateUI();
}

let awaitingSelectionStartTs = 0;

setInterval(() => {
  if (winShown) return;
  const now = Date.now();

  // Watchdog 1: Auto-heal if busy/rolling/animating state hangs > 2.2s without activity
  if ((state.busy || state.rolling || state.animatingToken) && (now - lastActivityTs > 2200)) {
    console.warn('[LoveLudu Watchdog] Stuck busy state auto-healed!');
    forceHealGameState();
    return;
  }

  // Watchdog 2: AFK Auto-Move if awaiting selection > 7s without player tapping
  if (state.awaitingSelection && state.movable.length > 0) {
    if (!awaitingSelectionStartTs) {
      awaitingSelectionStartTs = now;
    } else if (now - awaitingSelectionStartTs > 7000) {
      console.warn('[LoveLudu Watchdog] AFK Auto-moving pawn...');
      awaitingSelectionStartTs = 0;
      const chosenToken = state.movable[0];
      const dice = state.dice || 1;
      const player = state.current;
      state.awaitingSelection = false;
      state.movable = [];
      state.busy = true;

      if (!isLocalMode && roomRef) {
        roomRef.child('move').set({ playerIdx: player, tokenIdx: chosenToken, dice: dice, ts: now }).catch(err => console.warn(err));
      }
      performMove(chosenToken, dice, player);
    }
  } else {
    awaitingSelectionStartTs = 0;
  }
}, 1000);

// ------------------------------------------------------------
// 3. CANVAS RESPONSIVE & DRAWING ENGINE
// ------------------------------------------------------------
let cellSize = 60;

function resizeCanvas() {
  const container = document.getElementById('board-wrapper');
  const size = Math.min(container.clientWidth - 4, container.clientHeight - 4);
  const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
  canvas.width = Math.floor(size * dpr);
  canvas.height = Math.floor(size * dpr);
  canvas.style.width = size + 'px';
  canvas.style.height = size + 'px';
  cellSize = canvas.width / GRID;
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

function getCellCoords(r, c) {
  return {
    x: c * cellSize,
    y: r * cellSize,
    cx: (c + 0.5) * cellSize,
    cy: (r + 0.5) * cellSize
  };
}

function getTokenCell(playerIdx, tokenIdx) {
  const t = state.tokens[playerIdx] && state.tokens[playerIdx][tokenIdx];
  const p = PLAYERS[playerIdx];
  const prog = (t && typeof t.progress === 'number' && !isNaN(t.progress)) ? t.progress : 0;

  if (prog === 0) {
    return p.yardCells[tokenIdx];
  }
  if (prog >= 1 && prog <= RING_LEN) {
    const ringIdx = (p.startIndex + prog - 1) % RING_LEN;
    return RING[ringIdx];
  }
  if (prog > RING_LEN && prog <= RING_LEN + HOME_LEN) {
    const homeIdx = prog - RING_LEN - 1;
    return p.homeStretch[homeIdx];
  }
  return p.homeTarget;
}

// ------------------------------------------------------------
// 4. BOARD RENDERING
// ------------------------------------------------------------
function drawStar(cx, cy, spikes, outerRadius, innerRadius, color) {
  let rot = (Math.PI / 2) * 3;
  let x = cx;
  let y = cy;
  const step = Math.PI / spikes;

  ctx.beginPath();
  ctx.moveTo(cx, cy - outerRadius);
  for (let i = 0; i < spikes; i++) {
    x = cx + Math.cos(rot) * outerRadius;
    y = cy + Math.sin(rot) * outerRadius;
    ctx.lineTo(x, y);
    rot += step;

    x = cx + Math.cos(rot) * innerRadius;
    y = cy + Math.sin(rot) * innerRadius;
    ctx.lineTo(x, y);
    rot += step;
  }
  ctx.lineTo(cx, cy - outerRadius);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = Math.max(1, cellSize * 0.03);
  ctx.stroke();
}

function drawYard(r0, c0, color) {
  const x = c0 * cellSize;
  const y = r0 * cellSize;
  const w = 6 * cellSize;

  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, w);
  ctx.strokeStyle = PALETTE.ink;
  ctx.lineWidth = Math.max(2, cellSize * 0.06);
  ctx.strokeRect(x, y, w, w);

  const margin = 0.9 * cellSize;
  const innerW = 4.2 * cellSize;
  ctx.fillStyle = PALETTE.yardWhite;
  ctx.roundRect(x + margin, y + margin, innerW, innerW, cellSize * 0.4);
  ctx.fill();
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(2, cellSize * 0.06);
  ctx.stroke();

  const centers = [
    { r: r0 + 2.5, c: c0 + 2.5 },
    { r: r0 + 2.5, c: c0 + 3.5 },
    { r: r0 + 3.5, c: c0 + 2.5 },
    { r: r0 + 3.5, c: c0 + 3.5 }
  ];
  centers.forEach(pos => {
    const cx = pos.c * cellSize;
    const cy = pos.r * cellSize;
    const rad = cellSize * 0.55;

    ctx.beginPath();
    ctx.arc(cx, cy, rad, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.15)';
    ctx.lineWidth = 2;
    ctx.stroke();
  });
}

function drawBoard() {
  ctx.fillStyle = PALETTE.boardBg;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.strokeStyle = PALETTE.gridLine;
  ctx.lineWidth = Math.max(1, cellSize * 0.03);
  for (let i = 0; i <= GRID; i++) {
    ctx.beginPath(); ctx.moveTo(i * cellSize, 0); ctx.lineTo(i * cellSize, canvas.height); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, i * cellSize); ctx.lineTo(canvas.width, i * cellSize); ctx.stroke();
  }

  drawYard(0, 0, PALETTE.red);
  drawYard(0, 9, PALETTE.green);
  drawYard(9, 9, PALETTE.blue);
  drawYard(9, 0, PALETTE.yellow);

  // Red Home Track
  for (let c = 1; c <= 5; c++) { ctx.fillStyle = PALETTE.red; ctx.fillRect(c * cellSize, 7 * cellSize, cellSize, cellSize); }
  ctx.fillStyle = PALETTE.red; ctx.fillRect(1 * cellSize, 6 * cellSize, cellSize, cellSize);

  // Green Home Track
  for (let r = 1; r <= 5; r++) { ctx.fillStyle = PALETTE.green; ctx.fillRect(7 * cellSize, r * cellSize, cellSize, cellSize); }
  ctx.fillStyle = PALETTE.green; ctx.fillRect(8 * cellSize, 1 * cellSize, cellSize, cellSize);

  // Blue Home Track
  for (let c = 9; c <= 13; c++) { ctx.fillStyle = PALETTE.blue; ctx.fillRect(c * cellSize, 7 * cellSize, cellSize, cellSize); }
  ctx.fillStyle = PALETTE.blue; ctx.fillRect(13 * cellSize, 8 * cellSize, cellSize, cellSize);

  // Yellow Home Track
  for (let r = 9; r <= 13; r++) { ctx.fillStyle = PALETTE.yellow; ctx.fillRect(7 * cellSize, r * cellSize, cellSize, cellSize); }
  ctx.fillStyle = PALETTE.yellow; ctx.fillRect(6 * cellSize, 13 * cellSize, cellSize, cellSize);

  ctx.strokeStyle = PALETTE.gridLine;
  ctx.lineWidth = Math.max(1, cellSize * 0.03);

  // Safe Stars
  const stars = [
    { r: 6, c: 1 }, { r: 2, c: 6 }, { r: 1, c: 8 }, { r: 6, c: 12 },
    { r: 8, c: 13 }, { r: 12, c: 8 }, { r: 13, c: 6 }, { r: 8, c: 2 }
  ];
  stars.forEach(pos => {
    const coords = getCellCoords(pos.r, pos.c);
    drawStar(coords.cx, coords.cy, 5, cellSize * 0.32, cellSize * 0.14, PALETTE.star);
  });

  // Center 4 Triangles
  const cX = 7.5 * cellSize, cY = 7.5 * cellSize;
  const leftX = 6 * cellSize, rightX = 9 * cellSize;
  const topY = 6 * cellSize, bottomY = 9 * cellSize;

  ctx.fillStyle = PALETTE.red; ctx.beginPath(); ctx.moveTo(leftX, topY); ctx.lineTo(cX, cY); ctx.lineTo(leftX, bottomY); ctx.closePath(); ctx.fill();
  ctx.fillStyle = PALETTE.green; ctx.beginPath(); ctx.moveTo(leftX, topY); ctx.lineTo(cX, cY); ctx.lineTo(rightX, topY); ctx.closePath(); ctx.fill();
  ctx.fillStyle = PALETTE.blue; ctx.beginPath(); ctx.moveTo(rightX, topY); ctx.lineTo(cX, cY); ctx.lineTo(rightX, bottomY); ctx.closePath(); ctx.fill();
  ctx.fillStyle = PALETTE.yellow; ctx.beginPath(); ctx.moveTo(leftX, bottomY); ctx.lineTo(cX, cY); ctx.lineTo(rightX, bottomY); ctx.closePath(); ctx.fill();

  ctx.font = `${cellSize * 0.8}px serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('💖', cX, cY);

  ctx.strokeStyle = PALETTE.gold;
  ctx.lineWidth = Math.max(2, cellSize * 0.06);
  ctx.strokeRect(6 * cellSize, 6 * cellSize, 3 * cellSize, 3 * cellSize);
}

// ------------------------------------------------------------
// 5. PAWN RENDERING & MULTI-STACKING
// ------------------------------------------------------------
function drawPawn(cx, cy, color, isHighlight = false, bounceOffset = 0, scale = 1, playerIdx = 0, tokenIdx = 0) {
  const isMovableBounce = isHighlight ? Math.sin(Date.now() / 110) * (cellSize * 0.14) : 0;
  const py = cy - bounceOffset - isMovableBounce;
  const rad = cellSize * 0.44 * scale;

  ctx.save();

  // 1. High contrast Ground Shadow
  ctx.beginPath();
  ctx.ellipse(cx, cy + rad * 0.75, rad * 0.85, rad * 0.3, 0, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
  ctx.fill();

  // 2. Ultra-Prominent Movable Pulsing Ring & Arrow
  if (isHighlight) {
    const pulse = 1.3 + 0.2 * Math.sin(Date.now() / 130);
    ctx.beginPath();
    ctx.arc(cx, py, rad * pulse, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255, 215, 0, 0.45)';
    ctx.fill();
    ctx.strokeStyle = '#ffbe0b';
    ctx.lineWidth = Math.max(3, cellSize * 0.08);
    ctx.stroke();

    // Floating Animated Bouncing Arrow above movable pawn
    const arrowY = py - rad * 1.7 - Math.abs(Math.sin(Date.now() / 150)) * (cellSize * 0.15);
    ctx.font = `bold ${cellSize * 0.65}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('👇', cx, arrowY);
  }

  // 3. Base Pedestal Ring (Gold Rim)
  ctx.beginPath();
  ctx.arc(cx, py + rad * 0.2, rad * 0.95, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
  ctx.fill();
  ctx.strokeStyle = '#f3c64f';
  ctx.lineWidth = Math.max(2, cellSize * 0.05);
  ctx.stroke();

  // 4. Vibrant 3D Sphere Head with rich high-contrast gradient
  const isRed = (playerIdx === 0);
  const colorStart = '#ffffff';
  const colorMid = isRed ? '#ff1744' : '#00b0ff';
  const colorDark = isRed ? '#88001b' : '#0040aa';

  const gradient = ctx.createRadialGradient(cx - rad * 0.35, py - rad * 0.35, rad * 0.08, cx, py, rad);
  gradient.addColorStop(0, colorStart);
  gradient.addColorStop(0.35, colorMid);
  gradient.addColorStop(1, colorDark);

  ctx.beginPath();
  ctx.arc(cx, py, rad, 0, Math.PI * 2);
  ctx.fillStyle = gradient;
  ctx.fill();

  // White Crisp Contour Ring
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = Math.max(2.5, cellSize * 0.06);
  ctx.stroke();

  // Gold Outer Accent Ring
  ctx.beginPath();
  ctx.arc(cx, py, rad * 1.05, 0, Math.PI * 2);
  ctx.strokeStyle = '#f3c64f';
  ctx.lineWidth = Math.max(1.5, cellSize * 0.035);
  ctx.stroke();

  // 5. Pawn Badge/Icon Center (Crown / Avatar Emoji & Token Number)
  const iconEmoji = isRed ? '🤵' : '👸';

  // Inner Badge Circle
  ctx.beginPath();
  ctx.arc(cx, py, rad * 0.48, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(15, 3, 10, 0.65)';
  ctx.fill();
  ctx.strokeStyle = '#f3c64f';
  ctx.lineWidth = Math.max(1, cellSize * 0.03);
  ctx.stroke();

  // Emoji Avatar Icon
  ctx.font = `${rad * 0.62}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(iconEmoji, cx, py);

  ctx.restore();
}

function drawAllTokens() {
  const cellOccupants = {};

  PLAYERS.forEach((p, pi) => {
    state.tokens[pi].forEach((t, ti) => {
      if (state.animatingToken && state.animatingToken.playerIdx === pi && state.animatingToken.tokenIdx === ti) {
        return;
      }
      if (t.progress === FINISH) return;

      const cell = getTokenCell(pi, ti);
      const key = `${cell.r},${cell.c}`;
      if (!cellOccupants[key]) cellOccupants[key] = [];
      cellOccupants[key].push({ pi, ti });
    });
  });

  Object.keys(cellOccupants).forEach(key => {
    const tokensOnCell = cellOccupants[key];
    const [r, c] = key.split(',').map(Number);
    const coords = getCellCoords(r, c);
    const count = tokensOnCell.length;

    tokensOnCell.forEach((item, idx) => {
      const { pi, ti } = item;
      const p = PLAYERS[pi];
      const isMovable = (state.awaitingSelection && (isLocalMode || state.current === localPlayerIdx) && pi === state.current && state.movable.includes(ti));

      let px = coords.cx;
      let py = coords.cy;
      let scale = 1;

      if (count > 1) {
        scale = count > 2 ? 0.7 : 0.8;
        const offset = cellSize * 0.22;
        const subPositions = [
          { x: -offset, y: -offset },
          { x: offset, y: -offset },
          { x: -offset, y: offset },
          { x: offset, y: offset }
        ];
        const pos = subPositions[idx % 4];
        px += pos.x;
        py += pos.y;
      }

      drawPawn(px, py, p.color, isMovable, 0, scale, pi, ti);
    });
  });

  if (state.animatingToken) {
    const anim = state.animatingToken;
    const p = PLAYERS[anim.playerIdx];
    const fromCell = anim.path[anim.currentStep];
    const toCell = anim.path[anim.currentStep + 1] || fromCell;

    if (fromCell && toCell) {
      const fromCoords = getCellCoords(fromCell.r, fromCell.c);
      const toCoords = getCellCoords(toCell.r, toCell.c);

      const curX = fromCoords.cx + (toCoords.cx - fromCoords.cx) * anim.t;
      const curY = fromCoords.cy + (toCoords.cy - fromCoords.cy) * anim.t;
      const bounce = Math.sin(anim.t * Math.PI) * (cellSize * 0.5);

      drawPawn(curX, curY, p.color, false, bounce, 1.15, anim.playerIdx, anim.tokenIdx);
    }
  }
}

// ------------------------------------------------------------
// 6. MAIN GAME LOOP
// ------------------------------------------------------------
let lastTimestamp = 0;

function gameLoop(timestamp) {
  if (!lastTimestamp) lastTimestamp = timestamp;
  const dt = Math.min(Math.max(0, timestamp - lastTimestamp), 100);
  lastTimestamp = timestamp;

  if (state.animatingToken) {
    const anim = state.animatingToken;
    anim.t += dt / 110;

    if (anim.t >= 1) {
      anim.t = 0;
      anim.currentStep++;
      if (anim.currentStep >= anim.path.length - 1) {
        const cb = anim.onComplete;
        state.animatingToken = null;
        if (cb) cb();
      }
    }
  }

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawBoard();
  drawAllTokens();

  requestAnimationFrame(gameLoop);
}
requestAnimationFrame(gameLoop);

// ------------------------------------------------------------
// 7. GAME LOGIC & MOVES
// ------------------------------------------------------------
function ringIndexOfProgress(playerIdx, progress) {
  return (PLAYERS[playerIdx].startIndex + progress - 1) % RING_LEN;
}

function legalMoves(playerIdx, dice) {
  if (typeof dice !== 'number' || isNaN(dice) || dice < 1 || dice > 6) return [];
  const moves = [];
  state.tokens[playerIdx].forEach((t, idx) => {
    const prog = (t && typeof t.progress === 'number' && !isNaN(t.progress)) ? t.progress : 0;
    if (prog === FINISH) return;
    if (prog === 0) {
      if (dice === 6) moves.push(idx);
      return;
    }
    if (prog + dice <= FINISH) moves.push(idx);
  });
  return moves;
}

function getMovePath(playerIdx, tokenIdx, dice) {
  const t = state.tokens[playerIdx][tokenIdx];
  const startProgress = (t && typeof t.progress === 'number' && !isNaN(t.progress)) ? t.progress : 0;
  const targetProgress = startProgress === 0 ? 1 : Math.min(FINISH, startProgress + dice);

  const path = [];
  for (let prog = startProgress; prog <= targetProgress; prog++) {
    if (prog === 0) {
      path.push(PLAYERS[playerIdx].yardCells[tokenIdx]);
    } else if (prog >= 1 && prog <= RING_LEN) {
      const rIdx = ringIndexOfProgress(playerIdx, prog);
      path.push(RING[rIdx]);
    } else if (prog > RING_LEN && prog <= RING_LEN + HOME_LEN) {
      const hIdx = prog - RING_LEN - 1;
      path.push(PLAYERS[playerIdx].homeStretch[hIdx]);
    } else if (prog === FINISH) {
      path.push(PLAYERS[playerIdx].homeTarget);
    }
  }
  return path;
}

function applyMove(playerIdx, tokenIdx, dice, onDone) {
  lastActivityTs = Date.now();
  if (state.animatingToken && state.animatingToken.onComplete) {
    const prevCb = state.animatingToken.onComplete;
    state.animatingToken = null;
    try { prevCb(); } catch (e) {}
  }

  const validDice = (typeof dice === 'number' && !isNaN(dice) && dice >= 1 && dice <= 6) ? dice : 1;
  const targetToken = state.tokens[playerIdx] && state.tokens[playerIdx][tokenIdx];
  if (!targetToken) {
    onDone({ captured: false, reachedHome: false });
    return;
  }

  const currentProg = (typeof targetToken.progress === 'number' && !isNaN(targetToken.progress)) ? targetToken.progress : 0;
  const path = getMovePath(playerIdx, tokenIdx, validDice);

  if (path.length === 0) {
    onDone({ captured: false, reachedHome: false });
    return;
  }

  state.animatingToken = {
    playerIdx,
    tokenIdx,
    path,
    currentStep: 0,
    t: 0,
    onComplete: () => {
      clearTimeout(window._animSafetyTimer);
      state.animatingToken = null;
      lastActivityTs = Date.now();

      if (state.tokens[playerIdx] && state.tokens[playerIdx][tokenIdx]) {
        if (currentProg === 0) {
          state.tokens[playerIdx][tokenIdx].progress = 1;
        } else {
          state.tokens[playerIdx][tokenIdx].progress = Math.min(FINISH, currentProg + validDice);
        }
      }

      const finalProg = state.tokens[playerIdx][tokenIdx].progress;
      let captured = false;
      let reachedHome = (finalProg === FINISH);

      if (finalProg >= 1 && finalProg <= RING_LEN) {
        const ringIdx = ringIndexOfProgress(playerIdx, finalProg);
        if (!SAFE_RING_INDICES.has(ringIdx)) {
          const opp = 1 - playerIdx;
          state.tokens[opp].forEach(ot => {
            if (ot.progress >= 1 && ot.progress <= RING_LEN && ringIndexOfProgress(opp, ot.progress) === ringIdx) {
              ot.progress = 0;
              captured = true;
            }
          });
        }
      }

      if (reachedHome) {
        state.finished[playerIdx]++;
      }

      onDone({ captured, reachedHome });
    }
  };

  clearTimeout(window._animSafetyTimer);
  window._animSafetyTimer = setTimeout(() => {
    if (state.animatingToken) {
      console.warn('Animation safety timeout forced completion');
      const cb = state.animatingToken.onComplete;
      state.animatingToken = null;
      if (cb) cb();
    }
  }, 1600);
}

// ------------------------------------------------------------
// 8. USER INTERACTION & TOUCH/TAP HANDLER
// ------------------------------------------------------------
canvas.addEventListener('pointerdown', e => {
  if (!state.awaitingSelection || state.animatingToken || state.busy) return;
  if (!isLocalMode && state.current !== localPlayerIdx) return;

  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;

  const tapX = (e.clientX - rect.left) * scaleX;
  const tapY = (e.clientY - rect.top) * scaleY;

  const movableTokens = state.movable;
  let clickedTokenIdx = -1;
  let minDistance = Infinity;

  for (const tokenIdx of movableTokens) {
    const cell = getTokenCell(state.current, tokenIdx);
    const coords = getCellCoords(cell.r, cell.c);
    const dist = Math.hypot(tapX - coords.cx, tapY - coords.cy);

    if (dist < cellSize * 2.2 && dist < minDistance) {
      minDistance = dist;
      clickedTokenIdx = tokenIdx;
    }
  }

  // Fallback: If player taps anywhere on canvas when awaiting selection, select nearest movable pawn
  if (clickedTokenIdx === -1 && movableTokens.length > 0) {
    for (const tokenIdx of movableTokens) {
      const cell = getTokenCell(state.current, tokenIdx);
      const coords = getCellCoords(cell.r, cell.c);
      const dist = Math.hypot(tapX - coords.cx, tapY - coords.cy);
      if (dist < minDistance) {
        minDistance = dist;
        clickedTokenIdx = tokenIdx;
      }
    }
  }

  if (clickedTokenIdx !== -1) {
    const dice = state.dice || 1;
    const player = state.current;
    state.awaitingSelection = false;
    state.movable = [];
    state.busy = true;
    const ts = Date.now();
    lastMoveTs = ts;
    lastActivityTs = ts;

    if (!isLocalMode && roomRef) {
      roomRef.child('move').set({
        playerIdx: player,
        tokenIdx: clickedTokenIdx,
        dice: dice,
        ts: ts
      }).catch(err => console.warn('Firebase move push error:', err));
    }
    performMove(clickedTokenIdx, dice, player);
  }
});

// ------------------------------------------------------------
// 9. UI & PER-PLAYER DICE CONTROLS
// ------------------------------------------------------------
const topCard = document.getElementById('topPlayerCard');
const bottomCard = document.getElementById('bottomPlayerCard');
const topName = document.getElementById('topName');
const bottomName = document.getElementById('bottomName');
const topStatus = document.getElementById('topStatus');
const bottomStatus = document.getElementById('bottomStatus');
const topScore = document.getElementById('topScore');
const bottomScore = document.getElementById('bottomScore');
const topAvatar = document.getElementById('topAvatar');
const bottomAvatar = document.getElementById('bottomAvatar');
const topDiceBtn = document.getElementById('topDiceBtn');
const bottomDiceBtn = document.getElementById('bottomDiceBtn');
const turnBanner = document.getElementById('turnBanner');

function updateUI() {
  const hostName = PLAYERS[0].name;
  const guestName = PLAYERS[1].name;

  if (isLocalMode || localPlayerIdx === 0) {
    bottomName.textContent = hostName;
    topName.textContent = guestName;
    if (bottomAvatar) bottomAvatar.textContent = PLAYERS[0].avatar;
    if (topAvatar) topAvatar.textContent = PLAYERS[1].avatar;
    bottomCard.classList.add('p-red'); bottomCard.classList.remove('p-blue');
    topCard.classList.add('p-blue'); topCard.classList.remove('p-red');
    bottomScore.textContent = `${state.finished[0]}/4`;
    topScore.textContent = `${state.finished[1]}/4`;
  } else {
    bottomName.textContent = guestName;
    topName.textContent = hostName;
    if (bottomAvatar) bottomAvatar.textContent = PLAYERS[1].avatar;
    if (topAvatar) topAvatar.textContent = PLAYERS[0].avatar;
    bottomCard.classList.add('p-blue'); bottomCard.classList.remove('p-red');
    topCard.classList.add('p-red'); topCard.classList.remove('p-blue');
    bottomScore.textContent = `${state.finished[1]}/4`;
    topScore.textContent = `${state.finished[0]}/4`;
  }

  const activeIdx = state.current;
  const activePlayer = PLAYERS[activeIdx];
  const isMyTurn = isLocalMode ? true : (activeIdx === localPlayerIdx);

  // Card Glow & Status
  if (isLocalMode) {
    if (activeIdx === 0) {
      bottomCard.classList.add('active-turn'); topCard.classList.remove('active-turn');
      bottomStatus.textContent = 'তোমার চাল 🎯'; topStatus.textContent = 'অপেক্ষায়...';
    } else {
      topCard.classList.add('active-turn'); bottomCard.classList.remove('active-turn');
      topStatus.textContent = 'পাপড়ির চাল 🎯'; bottomStatus.textContent = 'অপেক্ষায়...';
    }
  } else {
    if (activeIdx === localPlayerIdx) {
      bottomCard.classList.add('active-turn'); topCard.classList.remove('active-turn');
      bottomStatus.textContent = 'তোমার চাল 🎯'; topStatus.textContent = 'অপেক্ষায়...';
    } else {
      topCard.classList.add('active-turn'); bottomCard.classList.remove('active-turn');
      topStatus.textContent = `${activePlayer.name}-এর চাল 🎲`; bottomStatus.textContent = 'অপেক্ষায়...';
    }
  }

  // Dice button enable/disable setup
  const canRoll = isMyTurn && !state.rolling && !state.animatingToken && !state.busy;

  if (isLocalMode) {
    bottomDiceBtn.disabled = !canRoll;
    topDiceBtn.disabled = !canRoll;
    if (activeIdx === 0) {
      bottomDiceBtn.classList.add('turn-glow');
      topDiceBtn.classList.remove('turn-glow');
    } else {
      topDiceBtn.classList.add('turn-glow');
      bottomDiceBtn.classList.remove('turn-glow');
    }
  } else {
    bottomDiceBtn.disabled = !canRoll;
    topDiceBtn.disabled = true;
    if (canRoll) bottomDiceBtn.classList.add('turn-glow'); else bottomDiceBtn.classList.remove('turn-glow');
    topDiceBtn.classList.remove('turn-glow');
  }

  if (canRoll) {
    showTurnBanner(isLocalMode ? `${activePlayer.name}-এর চাল 🎯` : 'তোমার চাল! ডাইস চাপো 🎯');
  } else {
    if (!state.rolling && !state.awaitingSelection) {
      showTurnBanner(`${activePlayer.name}-এর চাল... 🎲`);
    }
  }

  if (state.dice && !state.rolling) {
    const diceChar = DICE_EMOJIS[state.dice - 1] || '🎲';
    if (isLocalMode) {
      if (activeIdx === 0) bottomDiceBtn.textContent = diceChar;
      else topDiceBtn.textContent = diceChar;
    } else {
      if (activeIdx === localPlayerIdx) bottomDiceBtn.textContent = diceChar;
      else topDiceBtn.textContent = diceChar;
    }
  }
}

function showTurnBanner(text) {
  turnBanner.textContent = text;
  turnBanner.classList.add('show');
  setTimeout(() => turnBanner.classList.remove('show'), 2200);
}

// Unified dice click handler
function handleDiceClick(clickedPlayerIdx) {
  if (state.rolling || state.animatingToken || state.busy) return;

  if (isLocalMode) {
    if (clickedPlayerIdx !== state.current) return;
  } else {
    if (state.current !== localPlayerIdx) return;
    if (clickedPlayerIdx !== localPlayerIdx) return;
  }

  // Auto-move pawn if awaiting selection and dice clicked again
  if (state.awaitingSelection && state.movable.length > 0) {
    const tokenIdx = state.movable[0];
    const dice = state.dice || 1;
    const player = state.current;
    state.awaitingSelection = false;
    state.movable = [];
    state.busy = true;
    const ts = Date.now();
    lastMoveTs = ts;
    lastActivityTs = ts;

    if (!isLocalMode && roomRef) {
      roomRef.child('move').set({
        playerIdx: player,
        tokenIdx: tokenIdx,
        dice: dice,
        ts: ts
      }).catch(err => console.warn('Firebase move push error:', err));
    }
    performMove(tokenIdx, dice, player);
    return;
  }

  const val = Math.floor(Math.random() * 6) + 1;
  state.rolling = true;
  state.busy = true;

  const ts = Date.now();
  lastRollTs = ts;
  lastActivityTs = ts;

  // Safety Timeout: Reset rolling state if network/animation hangs
  clearTimeout(window._rollingSafetyTimer);
  window._rollingSafetyTimer = setTimeout(() => {
    if (state.rolling) {
      console.warn('Rolling state safety timeout reset');
      state.rolling = false;
      state.busy = false;
      updateUI();
    }
  }, 2200);

  if (!isLocalMode && roomRef) {
    roomRef.child('roll').set({
      playerIdx: state.current,
      val: val,
      ts: ts
    }).catch(err => {
      console.warn('Firebase roll push error:', err);
      state.rolling = false;
      state.busy = false;
      updateUI();
    });
  }

  // Execute roll animation locally immediately for responsive feedback
  executeDiceRollAnimation(state.current, val);
}

bottomDiceBtn.addEventListener('click', () => {
  const pIdx = isLocalMode ? state.current : localPlayerIdx;
  handleDiceClick(pIdx);
});

topDiceBtn.addEventListener('click', () => {
  const pIdx = isLocalMode ? state.current : 1;
  handleDiceClick(pIdx);
});

function executeDiceRollAnimation(playerIdx, val) {
  state.rolling = true;
  state.busy = true;
  state.awaitingSelection = false;
  state.movable = [];
  lastActivityTs = Date.now();

  const isMe = isLocalMode ? (playerIdx === 0) : (playerIdx === localPlayerIdx);
  const activeDiceBtn = isMe ? bottomDiceBtn : topDiceBtn;

  activeDiceBtn.classList.add('rolling');

  let rolls = 0;
  clearInterval(window._diceInterval);
  window._diceInterval = setInterval(() => {
    lastActivityTs = Date.now();
    activeDiceBtn.textContent = DICE_EMOJIS[Math.floor(Math.random() * 6)];
    rolls++;
    if (rolls >= 8) {
      clearInterval(window._diceInterval);
      activeDiceBtn.classList.remove('rolling');

      state.dice = val;
      state.rolling = false;
      activeDiceBtn.textContent = DICE_EMOJIS[val - 1];

      updateUI();

      if (val === 6) {
        state.consecutiveSixes++;
      } else {
        state.consecutiveSixes = 0;
      }

      if (state.consecutiveSixes >= 3) {
        showTurnBanner('পর পর ৩টি ৬! চাল বাতিল ⚠️');
        state.consecutiveSixes = 0;
        if (isLocalMode || playerIdx === localPlayerIdx) {
          setTimeout(() => endTurn(playerIdx, false), 800);
        } else {
          setTimeout(() => { state.busy = false; updateUI(); }, 1200);
        }
        return;
      }

      const moves = legalMoves(playerIdx, val);

      if (moves.length === 0) {
        showTurnBanner('কোনো চাল নেই... 😢');
        if (isLocalMode || playerIdx === localPlayerIdx) {
          setTimeout(() => endTurn(playerIdx, val === 6), 800);
        } else {
          setTimeout(() => { state.busy = false; updateUI(); }, 1200);
        }
        return;
      }

      const firstTokenProg = state.tokens[playerIdx][moves[0]].progress;
      const allIdentical = moves.every(ti => state.tokens[playerIdx][ti].progress === firstTokenProg);

      if (moves.length === 1 || allIdentical) {
        showTurnBanner(firstTokenProg === 0 ? 'গুটি বের হচ্ছে... 🚀' : 'গুটি নড়ছে... 🚀');
        const chosenToken = moves[0];
        state.awaitingSelection = false;
        state.movable = [];
        const ts = Date.now();

        if (isLocalMode || playerIdx === localPlayerIdx) {
          if (!isLocalMode && roomRef) {
            lastMoveTs = ts;
            roomRef.child('move').set({ playerIdx: playerIdx, tokenIdx: chosenToken, dice: val, ts: ts }).catch(err => console.warn(err));
          }
          setTimeout(() => performMove(chosenToken, val, playerIdx), 220);
        }
        return;
      }

      // Multiple legal moves — player must tap a pawn
      showTurnBanner('গুটিতে ট্যাপ করো 🎯');
      state.busy = false;
      if (isLocalMode || playerIdx === localPlayerIdx) {
        state.awaitingSelection = true;
        state.movable = moves;
      }
      updateUI();
    }
  }, 50);
}

function performMove(tokenIdx, explicitDice, explicitPlayerIdx) {
  const movedByPlayer = (typeof explicitPlayerIdx === 'number' && !isNaN(explicitPlayerIdx)) ? explicitPlayerIdx : state.current;

  const dice = (typeof explicitDice === 'number' && !isNaN(explicitDice) && explicitDice >= 1 && explicitDice <= 6) ? explicitDice : (state.dice || 1);
  state.dice = dice;
  state.awaitingSelection = false;
  state.movable = [];
  state.busy = true;
  lastActivityTs = Date.now();

  applyMove(movedByPlayer, tokenIdx, dice, ({ captured, reachedHome }) => {
    let getExtraTurn = (dice === 6) || captured || reachedHome;

    if (captured) {
      showTurnBanner('💥 কাটা পড়েছে! আবার চাল 🎉');
      rainEmojis(['😲', '🔥', '💥'], 8);
    } else if (reachedHome) {
      showTurnBanner('🏆 ১টি গুটি হোমে পৌঁছাল! আবার চাল 🎉');
      rainEmojis(['🏆', '✨', '💖'], 10);
    }

    if (state.finished[movedByPlayer] === 4) {
      if (isLocalMode || movedByPlayer === localPlayerIdx) pushState();
      winShown = true;
      showWin(movedByPlayer);
      return;
    }

    if (isLocalMode || movedByPlayer === localPlayerIdx) {
      endTurn(movedByPlayer, getExtraTurn);
    } else {
      state.busy = false;
      updateUI();
    }
  });
}

function endTurn(playerIdx, extraTurn) {
  if (!extraTurn) {
    state.current = 1 - playerIdx;
    state.consecutiveSixes = 0;
  }
  state.dice = null;
  state.rolling = false;
  state.busy = false;
  state.awaitingSelection = false;
  state.movable = [];
  lastActivityTs = Date.now();

  pushState();
  updateUI();

  if (extraTurn) {
    showTurnBanner('আবার তোমার চাল! 🎉');
  }
}

function showWin(playerIdx) {
  const p = PLAYERS[playerIdx];
  const other = PLAYERS[1 - playerIdx];

  document.getElementById('winText').textContent = `🏆 ${p.name} জিতে গেছে!`;
  document.getElementById('winSub').textContent = `${other.name}, পরের বার তুমি জিতবে... একটা 💋 পাওনা রইল!`;
  document.getElementById('winOverlay').style.display = 'flex';
  rainEmojis(['🌹', '💖', '✨', '💋', '🎉'], 30);
}
document.getElementById('playAgainBtn').addEventListener('click', () => window.location.reload());

// ------------------------------------------------------------
// 10. MULTIPLAYER — FIREBASE REALTIME DATABASE SYNC
// ------------------------------------------------------------
function randomRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 5; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

function pushState() {
  if (isLocalMode || !roomRef) return;
  const ts = Date.now();
  lastStateTs = ts;
  roomRef.child('state').set({
    tokens: state.tokens,
    finished: state.finished,
    current: state.current,
    dice: state.dice,
    ts: ts
  }).catch(err => console.warn('Firebase state push error:', err));
}

function pushLove(type) {
  if (isLocalMode || !roomRef) {
    rainEmojis([EMOJI[type]], 20);
    return;
  }
  roomRef.child('love').set({ type, from: localPlayerIdx, ts: Date.now() }).catch(err => console.warn(err));
}

function applyRemoteState(data) {
  if (!data) return;

  if (Array.isArray(data.tokens) && !state.animatingToken) {
    state.tokens = data.tokens;
  }
  if (Array.isArray(data.finished)) {
    state.finished = data.finished;
  }
  if (typeof data.current === 'number') {
    state.current = data.current;
  }

  if (!state.rolling && !state.awaitingSelection) {
    state.dice = (typeof data.dice === 'number') ? data.dice : null;
  }

  if (!isLocalMode && state.current !== localPlayerIdx) {
    state.rolling = false;
    state.busy = false;
    state.awaitingSelection = false;
    state.movable = [];
  }

  updateUI();

  if (!winShown) {
    if (state.finished[0] === 4) { winShown = true; showWin(0); }
    else if (state.finished[1] === 4) { winShown = true; showWin(1); }
  }
}

function attachRoomListeners() {
  if (typeof db !== 'undefined') {
    db.ref('.info/connected').on('value', snap => {
      if (snap.val() === false && !isLocalMode) {
        console.warn('Firebase Realtime Database disconnected');
      }
    });
  }

  roomRef.child('state').on('value', snap => {
    const data = snap.val();
    if (!data) return;
    if (data.ts && data.ts <= lastStateTs) return;
    lastStateTs = data.ts;
    applyRemoteState(data);
  });

  roomRef.child('roll').on('value', snap => {
    const data = snap.val();
    if (!data || data.ts <= lastRollTs) return;
    lastRollTs = data.ts;
    executeDiceRollAnimation(data.playerIdx, data.val);
  });

  roomRef.child('move').on('value', snap => {
    const data = snap.val();
    if (!data || data.ts <= lastMoveTs) return;
    lastMoveTs = data.ts;

    // Smooth sync: If dice is spinning on remote device, wait for spin to finish before moving pawn!
    if (state.rolling || state.busy) {
      let tries = 0;
      const waitSpin = setInterval(() => {
        tries++;
        if (!state.rolling || tries > 25) {
          clearInterval(waitSpin);
          performMove(data.tokenIdx, data.dice, data.playerIdx);
        }
      }, 40);
    } else {
      performMove(data.tokenIdx, data.dice, data.playerIdx);
    }
  });

  roomRef.child('love').on('value', snap => {
    const d = snap.val();
    if (!d || d.ts === lastLoveTs) return;
    lastLoveTs = d.ts;
    rainEmojis([EMOJI[d.type]], 22);
  });

  roomRef.child('players').on('value', snap => {
    const d = snap.val() || {};
    if (d.p1) PLAYERS[0].name = d.p1;
    if (d.p2) PLAYERS[1].name = d.p2;

    if (d.p1 && d.p2) {
      enterGameScreen();
    } else if (localPlayerIdx === 0) {
      document.getElementById('waitStatus').textContent = `⏳ ${d.p1} রুম বানিয়েছে, সঙ্গীর জয়েন করার অপেক্ষায়...`;
    }
  });
}

function enterGameScreen() {
  document.getElementById('setup').style.display = 'none';
  document.getElementById('loveDock').style.display = 'flex';
  updateUI();
}

// ------------------------------------------------------------
// 11. BUTTON LOBBY HANDLERS
// ------------------------------------------------------------
document.getElementById('createRoomBtn').addEventListener('click', () => {
  const name = document.getElementById('myName').value.trim() || 'তুমি';
  if (typeof db === 'undefined') {
    document.getElementById('lobbyError').innerHTML = 'Firebase config পাওয়া যায়নি — <code>firebase-config.js</code> সেটআপ করুন।';
    return;
  }
  roomCode = randomRoomCode();
  localPlayerIdx = 0;
  isLocalMode = false;

  PLAYERS[0].name = name;
  bottomName.textContent = name;

  roomRef = db.ref('rooms/' + roomCode);
  roomRef.set({
    players: { p1: name },
    state: { tokens: state.tokens, finished: [0, 0], current: 0, dice: null, ts: Date.now() }
  }).then(() => {
    document.getElementById('lobbyChoose').style.display = 'none';
    document.getElementById('lobbyWait').style.display = 'block';

    const disp = document.getElementById('roomCodeDisplay');
    disp.textContent = roomCode;
    disp.onclick = () => {
      navigator.clipboard.writeText(roomCode);
      alert(`রুম কোড "${roomCode}" কপি করা হয়েছে!`);
    };

    attachRoomListeners();
  }).catch(err => {
    document.getElementById('lobbyError').innerHTML = 'রুম বানাতে সমস্যা হয়েছে! ⚠️ Firebase Console-এ <b>Realtime Database</b> ক্রিয়েট করা আছে কিনা চেক করুন।';
    console.error('Firebase Room Creation Error:', err);
  });
});

document.getElementById('joinRoomBtn').addEventListener('click', () => {
  const name = document.getElementById('myName').value.trim() || 'পাপড়ি';
  const code = document.getElementById('joinCode').value.trim().toUpperCase();

  if (typeof db === 'undefined') {
    document.getElementById('lobbyError').textContent = 'Firebase config বসানো হয়নি।';
    return;
  }
  if (!code) {
    document.getElementById('lobbyError').textContent = 'রুম কোড দাও।';
    return;
  }

  const ref = db.ref('rooms/' + code);
  ref.get().then(snap => {
    if (!snap.exists()) {
      document.getElementById('lobbyError').textContent = 'এই কোডে কোনো রুম পাওয়া যায়নি। কোডটি চেক করুন।';
      return;
    }
    localPlayerIdx = 1;
    isLocalMode = false;
    roomCode = code;
    roomRef = ref;

    PLAYERS[1].name = name;
    return roomRef.child('players/p2').set(name).then(() => {
      attachRoomListeners();
    });
  }).catch(err => {
    document.getElementById('lobbyError').innerHTML = 'জয়েন করতে সমস্যা হয়েছে! ⚠️ Firebase <b>Realtime Database</b> চালু আছে কিনা চেক করুন।';
    console.error('Firebase Join Room Error:', err);
  });
});

// Pass & Play (Local Offline Mode)
document.getElementById('passPlayBtn').addEventListener('click', () => {
  isLocalMode = true;
  PLAYERS[0].name = document.getElementById('myName').value.trim() || 'তুমি';
  PLAYERS[1].name = 'পাপড়ি';
  enterGameScreen();
});

// ------------------------------------------------------------
// 12. LOVE EMOJI RAIN EFFECT
// ------------------------------------------------------------
const EMOJI = { kiss: '💋', rose: '🌹', hug: '🤗', care: '💗' };

document.querySelectorAll('.loveBtn').forEach(btn => {
  btn.addEventListener('click', () => {
    pushLove(btn.dataset.type);
  });
});

function rainEmojis(emojiList, count) {
  for (let i = 0; i < count; i++) {
    setTimeout(() => {
      const el = document.createElement('div');
      el.className = 'rainDrop';
      el.textContent = emojiList[Math.floor(Math.random() * emojiList.length)];
      el.style.left = Math.random() * 92 + 'vw';
      el.style.fontSize = (22 + Math.random() * 22) + 'px';
      const dur = 2.2 + Math.random() * 1.4;
      el.style.animationDuration = dur + 's';
      document.body.appendChild(el);
      setTimeout(() => el.remove(), dur * 1000 + 100);
    }, i * 75);
  }
}
