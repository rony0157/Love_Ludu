/* ============================================================
   LOVE LUDU 💞 — 2D Romantic Ludo Engine (Ludo King Style)
   Optimized for mobile fit (iOS Safari & Android), smooth 60fps canvas,
   hopping pawn animations, local & online multiplayer.
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
  current: 0,             // 0: Tumi (Red), 1: Papri (Blue)
  dice: null,
  rolling: false,
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
let localPlayerIdx = 0; // 0 for host/local, 1 for joined guest
let roomCode = null;
let roomRef = null;
let lastDiceTs = 0;
let lastLoveTs = 0;
let winShown = false;

// ------------------------------------------------------------
// 3. CANVAS RESPONSIVE & DRAWING ENGINE
// ------------------------------------------------------------
let cellSize = 60;

function resizeCanvas() {
  const container = document.getElementById('board-wrapper');
  const size = Math.min(container.clientWidth - 8, container.clientHeight - 8);
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
  const t = state.tokens[playerIdx][tokenIdx];
  const p = PLAYERS[playerIdx];
  if (t.progress === 0) {
    return p.yardCells[tokenIdx];
  }
  if (t.progress >= 1 && t.progress <= RING_LEN) {
    const ringIdx = (p.startIndex + t.progress - 1) % RING_LEN;
    return RING[ringIdx];
  }
  if (t.progress > RING_LEN && t.progress <= RING_LEN + HOME_LEN) {
    const homeIdx = t.progress - RING_LEN - 1;
    return p.homeStretch[homeIdx];
  }
  return p.homeTarget; // Finished in home center
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

function drawYard(r0, c0, color, isHeart = false) {
  const x = c0 * cellSize;
  const y = r0 * cellSize;
  const w = 6 * cellSize;

  // Background Yard
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, w);
  ctx.strokeStyle = PALETTE.ink;
  ctx.lineWidth = Math.max(2, cellSize * 0.06);
  ctx.strokeRect(x, y, w, w);

  // Inner White Box
  const margin = 0.9 * cellSize;
  const innerW = 4.2 * cellSize;
  ctx.fillStyle = PALETTE.yardWhite;
  ctx.roundRect(x + margin, y + margin, innerW, innerW, cellSize * 0.4);
  ctx.fill();
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(2, cellSize * 0.06);
  ctx.stroke();

  // 4 Token circles in Yard
  const centers = [
    { r: r0 + 1.9, c: c0 + 1.9 },
    { r: r0 + 1.9, c: c0 + 4.1 },
    { r: r0 + 4.1, c: c0 + 1.9 },
    { r: r0 + 4.1, c: c0 + 4.1 }
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
  // 1. Board Background
  ctx.fillStyle = PALETTE.boardBg;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // 2. Main 15x15 Grid Lines
  ctx.strokeStyle = PALETTE.gridLine;
  ctx.lineWidth = Math.max(1, cellSize * 0.03);
  for (let i = 0; i <= GRID; i++) {
    ctx.beginPath();
    ctx.moveTo(i * cellSize, 0);
    ctx.lineTo(i * cellSize, canvas.height);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(0, i * cellSize);
    ctx.lineTo(canvas.width, i * cellSize);
    ctx.stroke();
  }

  // 3. Four Corner Yards
  drawYard(0, 0, PALETTE.red);
  drawYard(0, 9, PALETTE.green);
  drawYard(9, 9, PALETTE.blue);
  drawYard(9, 0, PALETTE.yellow);

  // 4. Colored Home Tracks
  // Red Home Track (row 7, cols 1..5)
  for (let c = 1; c <= 5; c++) {
    ctx.fillStyle = PALETTE.red;
    ctx.fillRect(c * cellSize, 7 * cellSize, cellSize, cellSize);
  }
  // Red Starting Cell (row 6, col 1)
  ctx.fillStyle = PALETTE.red;
  ctx.fillRect(1 * cellSize, 6 * cellSize, cellSize, cellSize);

  // Green Home Track (col 7, rows 1..5)
  for (let r = 1; r <= 5; r++) {
    ctx.fillStyle = PALETTE.green;
    ctx.fillRect(7 * cellSize, r * cellSize, cellSize, cellSize);
  }
  // Green Starting Cell (row 1, col 8)
  ctx.fillStyle = PALETTE.green;
  ctx.fillRect(8 * cellSize, 1 * cellSize, cellSize, cellSize);

  // Blue Home Track (row 7, cols 9..13)
  for (let c = 9; c <= 13; c++) {
    ctx.fillStyle = PALETTE.blue;
    ctx.fillRect(c * cellSize, 7 * cellSize, cellSize, cellSize);
  }
  // Blue Starting Cell (row 8, col 13)
  ctx.fillStyle = PALETTE.blue;
  ctx.fillRect(13 * cellSize, 8 * cellSize, cellSize, cellSize);

  // Yellow Home Track (col 7, rows 9..13)
  for (let r = 9; r <= 13; r++) {
    ctx.fillStyle = PALETTE.yellow;
    ctx.fillRect(7 * cellSize, r * cellSize, cellSize, cellSize);
  }
  // Yellow Starting Cell (row 13, col 6)
  ctx.fillStyle = PALETTE.yellow;
  ctx.fillRect(6 * cellSize, 13 * cellSize, cellSize, cellSize);

  // Redraw cell borders over tracks
  ctx.strokeStyle = PALETTE.gridLine;
  ctx.lineWidth = Math.max(1, cellSize * 0.03);

  // 5. Star Safe Spots
  const stars = [
    { r: 6, c: 1 }, { r: 2, c: 6 }, { r: 1, c: 8 }, { r: 6, c: 12 },
    { r: 8, c: 13 }, { r: 12, c: 8 }, { r: 13, c: 6 }, { r: 8, c: 2 }
  ];
  stars.forEach(pos => {
    const coords = getCellCoords(pos.r, pos.c);
    drawStar(coords.cx, coords.cy, 5, cellSize * 0.32, cellSize * 0.14, PALETTE.star);
  });

  // 6. Center 4-Triangle Victory Home
  const cX = 7.5 * cellSize;
  const cY = 7.5 * cellSize;
  const leftX = 6 * cellSize, rightX = 9 * cellSize;
  const topY = 6 * cellSize, bottomY = 9 * cellSize;

  // Left Triangle (Red)
  ctx.fillStyle = PALETTE.red;
  ctx.beginPath(); ctx.moveTo(leftX, topY); ctx.lineTo(cX, cY); ctx.lineTo(leftX, bottomY); ctx.closePath(); ctx.fill();

  // Top Triangle (Green)
  ctx.fillStyle = PALETTE.green;
  ctx.beginPath(); ctx.moveTo(leftX, topY); ctx.lineTo(cX, cY); ctx.lineTo(rightX, topY); ctx.closePath(); ctx.fill();

  // Right Triangle (Blue)
  ctx.fillStyle = PALETTE.blue;
  ctx.beginPath(); ctx.moveTo(rightX, topY); ctx.lineTo(cX, cY); ctx.lineTo(rightX, bottomY); ctx.closePath(); ctx.fill();

  // Bottom Triangle (Yellow)
  ctx.fillStyle = PALETTE.yellow;
  ctx.beginPath(); ctx.moveTo(leftX, bottomY); ctx.lineTo(cX, cY); ctx.lineTo(rightX, bottomY); ctx.closePath(); ctx.fill();

  // Center Heart Emblem
  ctx.font = `${cellSize * 0.8}px serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('💖', cX, cY);

  // Border around 3x3 center
  ctx.strokeStyle = PALETTE.gold;
  ctx.lineWidth = Math.max(2, cellSize * 0.06);
  ctx.strokeRect(6 * cellSize, 6 * cellSize, 3 * cellSize, 3 * cellSize);
}

// ------------------------------------------------------------
// 5. PAWN RENDERING & MULTI-STACKING
// ------------------------------------------------------------
function drawPawn(cx, cy, color, isHighlight = false, bounceOffset = 0, scale = 1) {
  const py = cy - bounceOffset;
  const rad = cellSize * 0.36 * scale;

  ctx.save();

  // Shadow
  ctx.beginPath();
  ctx.ellipse(cx, cy + rad * 0.7, rad * 0.8, rad * 0.3, 0, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
  ctx.fill();

  // Movable Glow Ring
  if (isHighlight) {
    ctx.beginPath();
    ctx.arc(cx, py, rad * 1.4, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(243, 198, 79, 0.45)';
    ctx.fill();
    ctx.strokeStyle = PALETTE.gold;
    ctx.lineWidth = Math.max(2, cellSize * 0.06);
    ctx.stroke();

    // Floating Arrow Pointer
    const arrowY = py - rad * 1.8;
    ctx.font = `${cellSize * 0.6}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('👇', cx, arrowY);
  }

  // Base Pedestal
  ctx.beginPath();
  ctx.arc(cx, py + rad * 0.3, rad * 0.85, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
  ctx.fill();

  // Pawn Body / Sphere
  const gradient = ctx.createRadialGradient(cx - rad * 0.3, py - rad * 0.3, rad * 0.1, cx, py, rad);
  gradient.addColorStop(0, '#ffffff');
  gradient.addColorStop(0.3, color);
  gradient.addColorStop(1, '#0f0408');

  ctx.beginPath();
  ctx.arc(cx, py, rad, 0, Math.PI * 2);
  ctx.fillStyle = gradient;
  ctx.fill();
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = Math.max(1.5, cellSize * 0.04);
  ctx.stroke();

  // Inner Heart Emblem
  ctx.font = `${rad * 0.9}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('💗', cx, py);

  ctx.restore();
}

function drawAllTokens() {
  // Group tokens by cell position for stacking
  const cellOccupants = {};

  PLAYERS.forEach((p, pi) => {
    state.tokens[pi].forEach((t, ti) => {
      // Check if token is currently animating
      if (state.animatingToken && state.animatingToken.playerIdx === pi && state.animatingToken.tokenIdx === ti) {
        return; // Render animating token separately
      }
      if (t.progress === FINISH) return; // Hide finished tokens in center

      const cell = getTokenCell(pi, ti);
      const key = `${cell.r},${cell.c}`;
      if (!cellOccupants[key]) cellOccupants[key] = [];
      cellOccupants[key].push({ pi, ti });
    });
  });

  // Render static stacked tokens
  Object.keys(cellOccupants).forEach(key => {
    const tokensOnCell = cellOccupants[key];
    const [r, c] = key.split(',').map(Number);
    const coords = getCellCoords(r, c);
    const count = tokensOnCell.length;

    tokensOnCell.forEach((item, idx) => {
      const { pi, ti } = item;
      const p = PLAYERS[pi];
      const isMovable = (state.awaitingSelection && state.current === localPlayerIdx && pi === state.current && state.movable.includes(ti));

      let px = coords.cx;
      let py = coords.cy;
      let scale = 1;

      if (count > 1) {
        scale = count > 2 ? 0.65 : 0.75;
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

      drawPawn(px, py, p.color, isMovable, 0, scale);
    });
  });

  // Render Animating Token if active
  if (state.animatingToken) {
    const anim = state.animatingToken;
    const p = PLAYERS[anim.playerIdx];
    const fromCell = anim.path[anim.currentStep];
    const toCell = anim.path[anim.currentStep + 1];

    if (fromCell && toCell) {
      const fromCoords = getCellCoords(fromCell.r, fromCell.c);
      const toCoords = getCellCoords(toCell.r, toCell.c);

      const curX = fromCoords.cx + (toCoords.cx - fromCoords.cx) * anim.t;
      const curY = fromCoords.cy + (toCoords.cy - fromCoords.cy) * anim.t;
      const bounce = Math.sin(anim.t * Math.PI) * (cellSize * 0.45);

      drawPawn(curX, curY, p.color, false, bounce, 1.1);
    }
  }
}

// ------------------------------------------------------------
// 6. MAIN GAME LOOP
// ------------------------------------------------------------
let lastTimestamp = 0;

function gameLoop(timestamp) {
  const dt = timestamp - lastTimestamp;
  lastTimestamp = timestamp;

  // Handle Hopping Pawn Animation Step
  if (state.animatingToken) {
    const anim = state.animatingToken;
    anim.t += dt / 110; // ~110ms per step hop

    if (anim.t >= 1) {
      anim.t = 0;
      anim.currentStep++;
      if (anim.currentStep >= anim.path.length - 1) {
        // Animation finished
        const cb = anim.onComplete;
        state.animatingToken = null;
        if (cb) cb();
      }
    }
  }

  // Clear & Draw Frame
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
  const moves = [];
  state.tokens[playerIdx].forEach((t, idx) => {
    if (t.progress === FINISH) return;
    if (t.progress === 0) {
      if (dice === 6) moves.push(idx);
      return;
    }
    if (t.progress + dice <= FINISH) moves.push(idx);
  });
  return moves;
}

function getMovePath(playerIdx, tokenIdx, dice) {
  const t = state.tokens[playerIdx][tokenIdx];
  const startProgress = t.progress;
  const targetProgress = startProgress === 0 ? 1 : startProgress + dice;

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
  const t = state.tokens[playerIdx][tokenIdx];
  const path = getMovePath(playerIdx, tokenIdx, dice);

  // Trigger step-by-step hopping animation
  state.animatingToken = {
    playerIdx,
    tokenIdx,
    path,
    currentStep: 0,
    t: 0,
    onComplete: () => {
      if (t.progress === 0) t.progress = 1;
      else t.progress += dice;

      let captured = false;
      // Check capture logic on non-safe ring cells
      if (t.progress >= 1 && t.progress <= RING_LEN) {
        const ringIdx = ringIndexOfProgress(playerIdx, t.progress);
        if (!SAFE_RING_INDICES.has(ringIdx)) {
          const opp = 1 - playerIdx;
          state.tokens[opp].forEach(ot => {
            if (ot.progress >= 1 && ot.progress <= RING_LEN && ringIndexOfProgress(opp, ot.progress) === ringIdx) {
              ot.progress = 0; // Send opponent pawn back to yard!
              captured = true;
            }
          });
        }
      }

      if (t.progress === FINISH) {
        state.finished[playerIdx]++;
      }

      onDone(captured);
    }
  };
}

// ------------------------------------------------------------
// 8. USER INTERACTION & TOUCH/TAP HANDLER
// ------------------------------------------------------------
canvas.addEventListener('pointerdown', e => {
  if (!state.awaitingSelection || state.animatingToken) return;
  if (!isLocalMode && state.current !== localPlayerIdx) return;

  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;

  const tapX = (e.clientX - rect.left) * scaleX;
  const tapY = (e.clientY - rect.top) * scaleY;

  // Find if user tapped one of their legal movable tokens
  const movableTokens = state.movable;
  for (const tokenIdx of movableTokens) {
    const cell = getTokenCell(state.current, tokenIdx);
    const coords = getCellCoords(cell.r, cell.c);
    const dist = Math.hypot(tapX - coords.cx, tapY - coords.cy);

    if (dist < cellSize * 0.95) {
      performMove(tokenIdx);
      break;
    }
  }
});

// ------------------------------------------------------------
// 9. UI CONTROLS & TURN MANAGEMENT
// ------------------------------------------------------------
const diceBtn = document.getElementById('diceBtn');
const topCard = document.getElementById('topPlayerCard');
const bottomCard = document.getElementById('bottomPlayerCard');
const topScore = document.getElementById('topScore');
const bottomScore = document.getElementById('bottomScore');
const topName = document.getElementById('topName');
const bottomName = document.getElementById('bottomName');
const turnBanner = document.getElementById('turnBanner');

function updateUI() {
  // Update scores
  topScore.textContent = `${state.finished[1]}/4`;
  bottomScore.textContent = `${state.finished[0]}/4`;

  // Turn Highlights
  const isMyTurn = isLocalMode ? true : (state.current === localPlayerIdx);
  const activePlayer = PLAYERS[state.current];

  if (state.current === 0) {
    bottomCard.classList.add('active-turn');
    topCard.classList.remove('active-turn');
  } else {
    topCard.classList.add('active-turn');
    bottomCard.classList.remove('active-turn');
  }

  // Dice Button State
  const canRoll = isMyTurn && !state.rolling && !state.awaitingSelection && !state.animatingToken;
  diceBtn.disabled = !canRoll;

  if (canRoll) {
    diceBtn.classList.add('turn-glow');
    showTurnBanner(isLocalMode ? `${activePlayer.name}-এর চাল 🎯` : 'তোমার চাল! ডাইস চাপো 🎯');
  } else {
    diceBtn.classList.remove('turn-glow');
    showTurnBanner(`${activePlayer.name}-এর চাল... 🎲`);
  }
}

function showTurnBanner(text) {
  turnBanner.textContent = text;
  turnBanner.classList.add('show');
  setTimeout(() => turnBanner.classList.remove('show'), 2200);
}

// Dice Roll Logic
diceBtn.addEventListener('click', () => {
  if (state.rolling || state.awaitingSelection || state.animatingToken) return;
  if (!isLocalMode && state.current !== localPlayerIdx) return;

  state.rolling = true;
  diceBtn.disabled = true;

  // Dice Tumble Animation
  let rolls = 0;
  const diceEmojis = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];
  const interval = setInterval(() => {
    diceBtn.textContent = diceEmojis[Math.floor(Math.random() * 6)];
    rolls++;
    if (rolls >= 10) {
      clearInterval(interval);
      const val = 1 + Math.floor(Math.random() * 6);
      state.dice = val;
      state.rolling = false;
      diceBtn.textContent = diceEmojis[val - 1];

      pushState();

      const moves = legalMoves(state.current, val);
      if (moves.length === 0) {
        showTurnBanner('কোনো চাল নেই... 😢');
        setTimeout(() => endTurn(val === 6), 900);
        return;
      }
      if (moves.length === 1) {
        showTurnBanner('গুটি নড়ছে... 🚀');
        setTimeout(() => performMove(moves[0]), 300);
        return;
      }

      state.awaitingSelection = true;
      state.movable = moves;
      showTurnBanner('গুটিতে ট্যাপ করো 🎯');
      updateUI();
    }
  }, 60);
});

function performMove(tokenIdx) {
  state.awaitingSelection = false;
  state.movable = [];
  const dice = state.dice;

  applyMove(state.current, tokenIdx, dice, captured => {
    if (captured) {
      showTurnBanner('💥 কাটা পড়েছে!');
      rainEmojis(['😲', '🔥', '💥'], 8);
    }

    if (state.finished[state.current] === 4) {
      pushState();
      winShown = true;
      showWin(state.current);
      return;
    }

    endTurn(dice === 6);
  });
}

function endTurn(extraTurn) {
  if (!extraTurn) {
    state.current = 1 - state.current;
  }
  state.dice = null;
  pushState();
  updateUI();

  if (extraTurn) {
    showTurnBanner('৬ পড়েছে! আবার চাল দাও 🎉');
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
// 10. MULTIPLAYER — FIREBASE & LOCAL PASS & PLAY
// ------------------------------------------------------------
function randomRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 5; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

function pushState() {
  if (isLocalMode || !roomRef) return;
  roomRef.child('state').update({
    tokens: state.tokens,
    finished: state.finished,
    current: state.current,
    dice: state.dice,
    diceTs: Date.now()
  });
}

function pushLove(type) {
  if (isLocalMode || !roomRef) {
    rainEmojis([EMOJI[type]], 20);
    return;
  }
  roomRef.child('love').set({ type, from: localPlayerIdx, ts: Date.now() });
}

function applyRemoteState(data) {
  if (!data) return;
  if (Array.isArray(data.tokens)) state.tokens = data.tokens;
  if (Array.isArray(data.finished)) state.finished = data.finished;
  if (typeof data.current === 'number') state.current = data.current;
  updateUI();

  if (!winShown) {
    if (state.finished[0] === 4) { winShown = true; showWin(0); }
    else if (state.finished[1] === 4) { winShown = true; showWin(1); }
  }
}

function attachRoomListeners() {
  roomRef.child('state').on('value', snap => applyRemoteState(snap.val()));

  roomRef.child('love').on('value', snap => {
    const d = snap.val();
    if (!d || d.ts === lastLoveTs) return;
    lastLoveTs = d.ts;
    rainEmojis([EMOJI[d.type]], 22);
  });

  roomRef.child('players').on('value', snap => {
    const d = snap.val() || {};
    if (d.p1) { PLAYERS[0].name = d.p1; bottomName.textContent = d.p1; }
    if (d.p2) { PLAYERS[1].name = d.p2; topName.textContent = d.p2; }

    if (d.p1 && d.p2) {
      enterGameScreen();
    } else if (localPlayerIdx === 0) {
      document.getElementById('waitStatus').textContent = `⏳ ${d.p1} রুম বানিয়েছে, পাপড়ির জয়েন করার অপেক্ষায়...`;
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
    document.getElementById('lobbyError').textContent = 'Firebase config বসানো হয়নি — firebase-config.js চেক করো।';
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
    state: { tokens: state.tokens, finished: [0, 0], current: 0, dice: null, diceTs: 0 }
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
    document.getElementById('lobbyError').textContent = 'রুম বানাতে সমস্যা হয়েছে।';
    console.error(err);
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
      document.getElementById('lobbyError').textContent = 'এই কোডে কোনো রুম পাওয়া যায়নি।';
      return;
    }
    localPlayerIdx = 1;
    isLocalMode = false;
    roomCode = code;
    roomRef = ref;

    PLAYERS[1].name = name;
    // For guest (Player 1), Swap top and bottom cards so Guest is always at bottom!
    topName.textContent = snap.val().players.p1 || 'তুমি';
    bottomName.textContent = name;

    return roomRef.child('players/p2').set(name).then(() => {
      attachRoomListeners();
    });
  }).catch(err => {
    document.getElementById('lobbyError').textContent = 'জয়েন করতে সমস্যা হয়েছে।';
    console.error(err);
  });
});

// Pass & Play (Local Offline Mode)
document.getElementById('passPlayBtn').addEventListener('click', () => {
  isLocalMode = true;
  PLAYERS[0].name = document.getElementById('myName').value.trim() || 'তুমি';
  PLAYERS[1].name = 'পাপড়ি';
  bottomName.textContent = PLAYERS[0].name;
  topName.textContent = PLAYERS[1].name;
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
