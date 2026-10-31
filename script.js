/* =========================================================================
   Graph & Shortest Path Benchmark Suite - Core Engine
   ========================================================================= */

// 1. STATE & CONFIGURATION - Responsive Grid Sizing
const isMobile = window.innerWidth <= 768;
const GRID_ROWS = isMobile ? 18 : 20;
const GRID_COLS = isMobile ? 24 : 45;

let startNode = isMobile ? { r: 9, c: 3 } : { r: 10, c: 6 };
let targetNode = isMobile ? { r: 9, c: 20 } : { r: 10, c: 38 };
let isMouseDown = false;
let currentDrawMode = 'wall'; // 'wall', 'weight', 'erase', 'drag-start', 'drag-target'
let isRunning = false;
let boardState = []; // 2D array: 0: empty, 1: wall, 5: weight

// Animation Delay (ms) based on speed slider
let animationSpeed = 25;

// Elements
const gridContainer = document.getElementById('grid-container');
const btnStart = document.getElementById('btn-start');
const btnClearPath = document.getElementById('btn-clear-path');
const btnClearBoard = document.getElementById('btn-clear-board');
const algoSelect = document.getElementById('algo-select');
const heuristicSelect = document.getElementById('heuristic-select');
const mazeSelect = document.getElementById('maze-select');
const speedSlider = document.getElementById('speed-slider');
const speedLabel = document.getElementById('speed-label');

const metricStatus = document.getElementById('metric-status');
const metricNodes = document.getElementById('metric-nodes');
const metricCost = document.getElementById('metric-cost');
const metricTime = document.getElementById('metric-time');

// Descriptions lookup
const ALGO_DETAILS = {
  astar: {
    title: "A* Search Algorithm (A-Star)",
    desc: "A* combines Dijkstra's shortest path cost g(n) with a directed heuristic estimation h(n) towards the target: f(n) = g(n) + h(n). It guarantees optimal shortest path while pruning massive search spaces.",
    time: "O(E + V log V)",
    space: "O(V)",
    optimal: "Yes (Admissible)",
    weighted: "Yes"
  },
  dijkstra: {
    title: "Dijkstra's Algorithm (Uniform Cost)",
    desc: "The gold standard for single-source shortest path on non-negative weighted graphs. It explores radially in order of total path distance, guaranteeing mathematical optimality for network routing.",
    time: "O((V + E) log V)",
    space: "O(V)",
    optimal: "Yes",
    weighted: "Yes"
  },
  bfs: {
    title: "Breadth-First Search (BFS)",
    desc: "Traverses nodes level-by-level using a FIFO queue. For unweighted graphs or uniform step costs, BFS guarantees the path with the fewest edges in linear time.",
    time: "O(V + E)",
    space: "O(V)",
    optimal: "Yes (Unweighted only)",
    weighted: "No (Ignores Weights)"
  },
  dfs: {
    title: "Depth-First Search (DFS)",
    desc: "Aggressively explores down each branch to maximum depth before backtracking. DFS does not guarantee the shortest path and is suboptimal for navigation, but foundational for cycle detection and topological sorting.",
    time: "O(V + E)",
    space: "O(V)",
    optimal: "No",
    weighted: "No"
  },
  greedy: {
    title: "Greedy Best-First Search",
    desc: "Selects the next node strictly by lowest heuristic distance to target h(n), ignoring accumulated past path cost. Extremely fast, but prone to suboptimal paths and local trap obstacles.",
    time: "O(b^m)",
    space: "O(b^m)",
    optimal: "No",
    weighted: "Partial"
  },
  bidirectional: {
    title: "Bidirectional Search (Dual BFS)",
    desc: "Simultaneously grows two search frontiers: one forward from the Start node and one backward from Target. When frontiers intersect, shortest path is assembled, cutting search volume exponentially.",
    time: "O(b^(d/2))",
    space: "O(b^(d/2))",
    optimal: "Yes",
    weighted: "Uniform"
  }
};

// =========================================================================
// 2. GRID INITIALIZATION & INTERACTION
// =========================================================================
function initGrid() {
  gridContainer.innerHTML = '';
  gridContainer.style.gridTemplateColumns = `repeat(${GRID_COLS}, ${isMobile ? '13px' : '24px'})`;
  gridContainer.style.gridTemplateRows = `repeat(${GRID_ROWS}, ${isMobile ? '13px' : '24px'})`;
  boardState = [];

  for (let r = 0; r < GRID_ROWS; r++) {
    const row = [];
    for (let c = 0; c < GRID_COLS; c++) {
      row.push(0);
      const cell = document.createElement('div');
      cell.classList.add('grid-cell');
      cell.dataset.r = r;
      cell.dataset.c = c;
      cell.id = `cell-${r}-${c}`;

      if (r === startNode.r && c === startNode.c) {
        cell.classList.add('start');
      } else if (r === targetNode.r && c === targetNode.c) {
        cell.classList.add('target');
      }

      cell.addEventListener('mousedown', (e) => handleCellMouseDown(r, c, e));
      cell.addEventListener('mouseenter', () => handleCellMouseEnter(r, c));

      // Mobile Touch Support
      cell.addEventListener('touchstart', (e) => {
        if (isRunning) return;
        applyCellMode(r, c);
      }, { passive: true });

      gridContainer.appendChild(cell);
    }
    boardState.push(row);
  }

  // Handle continuous touch drag on mobile
  gridContainer.addEventListener('touchmove', (e) => {
    if (isRunning) return;
    const touch = e.touches[0];
    const targetElement = document.elementFromPoint(touch.clientX, touch.clientY);
    if (targetElement && targetElement.classList.contains('grid-cell')) {
      const r = parseInt(targetElement.dataset.r);
      const c = parseInt(targetElement.dataset.c);
      if (!isNaN(r) && !isNaN(c)) {
        applyCellMode(r, c);
      }
    }
  }, { passive: true });

  document.addEventListener('mouseup', () => {
    isMouseDown = false;
    if (currentDrawMode.startsWith('drag')) {
      currentDrawMode = document.querySelector('.mode-btn.active').dataset.mode;
    }
  });
}

function handleCellMouseDown(r, c, e) {
  if (isRunning) return;
  e.preventDefault();
  isMouseDown = true;

  if (r === startNode.r && c === startNode.c) {
    currentDrawMode = 'drag-start';
    return;
  }
  if (r === targetNode.r && c === targetNode.c) {
    currentDrawMode = 'drag-target';
    return;
  }

  applyCellMode(r, c);
}

function handleCellMouseEnter(r, c) {
  if (!isMouseDown || isRunning) return;

  if (currentDrawMode === 'drag-start') {
    if (r === targetNode.r && c === targetNode.c) return;
    document.getElementById(`cell-${startNode.r}-${startNode.c}`).classList.remove('start');
    startNode = { r, c };
    boardState[r][c] = 0;
    const newCell = document.getElementById(`cell-${r}-${c}`);
    newCell.className = 'grid-cell start';
    return;
  }

  if (currentDrawMode === 'drag-target') {
    if (r === startNode.r && c === startNode.c) return;
    document.getElementById(`cell-${targetNode.r}-${targetNode.c}`).classList.remove('target');
    targetNode = { r, c };
    boardState[r][c] = 0;
    const newCell = document.getElementById(`cell-${r}-${c}`);
    newCell.className = 'grid-cell target';
    return;
  }

  applyCellMode(r, c);
}

function applyCellMode(r, c) {
  if ((r === startNode.r && c === startNode.c) || (r === targetNode.r && c === targetNode.c)) return;

  const cell = document.getElementById(`cell-${r}-${c}`);
  if (currentDrawMode === 'wall') {
    boardState[r][c] = 1;
    cell.className = 'grid-cell wall';
  } else if (currentDrawMode === 'weight') {
    boardState[r][c] = 5;
    cell.className = 'grid-cell weight';
  } else if (currentDrawMode === 'erase') {
    boardState[r][c] = 0;
    cell.className = 'grid-cell';
  }
}

// Mode Buttons
document.querySelectorAll('.mode-btn').forEach(btn => {
  btn.addEventListener('click', (e) => {
    document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
    e.target.classList.add('active');
    currentDrawMode = e.target.dataset.mode;
  });
});

// Speed slider
speedSlider.addEventListener('input', (e) => {
  const val = parseInt(e.target.value);
  // Invert slider: 1 is slow, 50 is instant
  animationSpeed = Math.max(1, 52 - val);
  if (val < 15) speedLabel.innerText = "Slow";
  else if (val < 35) speedLabel.innerText = "Normal";
  else if (val < 48) speedLabel.innerText = "Fast";
  else speedLabel.innerText = "Turbo";
});

// Algo select info sync
algoSelect.addEventListener('change', (e) => {
  updateAlgoInfo(e.target.value);
});

function updateAlgoInfo(algoKey) {
  const info = ALGO_DETAILS[algoKey] || ALGO_DETAILS.astar;
  document.getElementById('info-title').innerText = info.title;
  document.getElementById('info-desc').innerText = info.desc;
  document.getElementById('info-complexity-time').innerText = `Time: ${info.time}`;
  document.getElementById('info-complexity-space').innerText = `Space: ${info.space}`;
  document.getElementById('info-optimality').innerText = `Optimal: ${info.optimal}`;
  document.getElementById('info-weighted').innerText = `Handles Weights: ${info.weighted}`;
}

// Reset and Clear
btnClearBoard.addEventListener('click', () => {
  if (isRunning) return;
  initGrid();
  resetMetrics();
});

btnClearPath.addEventListener('click', () => {
  if (isRunning) return;
  clearPreviousPath();
  resetMetrics();
});

function clearPreviousPath() {
  for (let r = 0; r < GRID_ROWS; r++) {
    for (let c = 0; c < GRID_COLS; c++) {
      const cell = document.getElementById(`cell-${r}-${c}`);
      cell.classList.remove('visited', 'visited-weight', 'path');
    }
  }
}

function resetMetrics() {
  metricStatus.innerText = "Ready";
  metricNodes.innerText = "0";
  metricCost.innerText = "0";
  metricTime.innerText = "0 ms";
}

// =========================================================================
// 3. GRAPH ALGORITHMS & SOLVERS
// =========================================================================
class MinPriorityQueue {
  constructor() {
    this.elements = [];
  }
  enqueue(element, priority) {
    this.elements.push({ element, priority });
    this.elements.sort((a, b) => a.priority - b.priority);
  }
  dequeue() {
    return this.elements.shift()?.element;
  }
  isEmpty() {
    return this.elements.length === 0;
  }
}

function getNeighbors(r, c) {
  const neighbors = [];
  const dirs = [
    [-1, 0], // Up
    [1, 0],  // Down
    [0, -1], // Left
    [0, 1]   // Right
  ];
  for (const [dr, dc] of dirs) {
    const nr = r + dr;
    const nc = c + dc;
    if (nr >= 0 && nr < GRID_ROWS && nc >= 0 && nc < GRID_COLS) {
      if (boardState[nr][nc] !== 1) { // Not a wall
        neighbors.push({ r: nr, c: nc });
      }
    }
  }
  return neighbors;
}

function getHeuristic(r, c, tr, tc, type) {
  const dx = Math.abs(c - tc);
  const dy = Math.abs(r - tr);
  if (type === 'euclidean') {
    return Math.sqrt(dx * dx + dy * dy);
  } else if (type === 'octile') {
    const F = Math.SQRT2 - 1;
    return (dx < dy) ? F * dx + dy : F * dy + dx;
  }
  // Default: Manhattan
  return dx + dy;
}

// 3.1 A* Search
function runAStar(start, target, heuristicType) {
  const visitedOrder = [];
  const dist = Array.from({ length: GRID_ROWS }, () => Array(GRID_COLS).fill(Infinity));
  const prev = Array.from({ length: GRID_ROWS }, () => Array(GRID_COLS).fill(null));
  const pq = new MinPriorityQueue();

  dist[start.r][start.c] = 0;
  const hStart = getHeuristic(start.r, start.c, target.r, target.c, heuristicType);
  pq.enqueue(start, hStart);

  const closedSet = new Set();

  while (!pq.isEmpty()) {
    const curr = pq.dequeue();
    const key = `${curr.r},${curr.c}`;
    if (closedSet.has(key)) continue;
    closedSet.add(key);

    visitedOrder.push(curr);

    if (curr.r === target.r && curr.c === target.c) break;

    const neighbors = getNeighbors(curr.r, curr.c);
    for (const nb of neighbors) {
      const weight = boardState[nb.r][nb.c] === 5 ? 5 : 1;
      const alt = dist[curr.r][curr.c] + weight;
      if (alt < dist[nb.r][nb.c]) {
        dist[nb.r][nb.c] = alt;
        prev[nb.r][nb.c] = curr;
        const priority = alt + getHeuristic(nb.r, nb.c, target.r, target.c, heuristicType);
        pq.enqueue(nb, priority);
      }
    }
  }

  const path = reconstructPath(prev, target);
  return { visitedOrder, path, totalCost: dist[target.r][target.c] };
}

// 3.2 Dijkstra's Algorithm
function runDijkstra(start, target) {
  const visitedOrder = [];
  const dist = Array.from({ length: GRID_ROWS }, () => Array(GRID_COLS).fill(Infinity));
  const prev = Array.from({ length: GRID_ROWS }, () => Array(GRID_COLS).fill(null));
  const pq = new MinPriorityQueue();

  dist[start.r][start.c] = 0;
  pq.enqueue(start, 0);
  const visited = new Set();

  while (!pq.isEmpty()) {
    const curr = pq.dequeue();
    const key = `${curr.r},${curr.c}`;
    if (visited.has(key)) continue;
    visited.add(key);

    visitedOrder.push(curr);

    if (curr.r === target.r && curr.c === target.c) break;

    const neighbors = getNeighbors(curr.r, curr.c);
    for (const nb of neighbors) {
      const weight = boardState[nb.r][nb.c] === 5 ? 5 : 1;
      const alt = dist[curr.r][curr.c] + weight;
      if (alt < dist[nb.r][nb.c]) {
        dist[nb.r][nb.c] = alt;
        prev[nb.r][nb.c] = curr;
        pq.enqueue(nb, alt);
      }
    }
  }

  const path = reconstructPath(prev, target);
  return { visitedOrder, path, totalCost: dist[target.r][target.c] };
}

// 3.3 Breadth-First Search (BFS)
function runBFS(start, target) {
  const visitedOrder = [];
  const queue = [start];
  const visited = Array.from({ length: GRID_ROWS }, () => Array(GRID_COLS).fill(false));
  const prev = Array.from({ length: GRID_ROWS }, () => Array(GRID_COLS).fill(null));

  visited[start.r][start.c] = true;

  while (queue.length > 0) {
    const curr = queue.shift();
    visitedOrder.push(curr);

    if (curr.r === target.r && curr.c === target.c) break;

    const neighbors = getNeighbors(curr.r, curr.c);
    for (const nb of neighbors) {
      if (!visited[nb.r][nb.c]) {
        visited[nb.r][nb.c] = true;
        prev[nb.r][nb.c] = curr;
        queue.push(nb);
      }
    }
  }

  const path = reconstructPath(prev, target);
  let totalCost = 0;
  path.forEach(p => { totalCost += (boardState[p.r][p.c] === 5 ? 5 : 1); });
  return { visitedOrder, path, totalCost };
}

// 3.4 Depth-First Search (DFS)
function runDFS(start, target) {
  const visitedOrder = [];
  const stack = [start];
  const visited = Array.from({ length: GRID_ROWS }, () => Array(GRID_COLS).fill(false));
  const prev = Array.from({ length: GRID_ROWS }, () => Array(GRID_COLS).fill(null));

  while (stack.length > 0) {
    const curr = stack.pop();
    if (visited[curr.r][curr.c]) continue;
    visited[curr.r][curr.c] = true;
    visitedOrder.push(curr);

    if (curr.r === target.r && curr.c === target.c) break;

    const neighbors = getNeighbors(curr.r, curr.c);
    for (const nb of neighbors) {
      if (!visited[nb.r][nb.c]) {
        prev[nb.r][nb.c] = curr;
        stack.push(nb);
      }
    }
  }

  const path = reconstructPath(prev, target);
  let totalCost = 0;
  path.forEach(p => { totalCost += (boardState[p.r][p.c] === 5 ? 5 : 1); });
  return { visitedOrder, path, totalCost };
}

// 3.5 Greedy Best-First Search
function runGreedy(start, target, heuristicType) {
  const visitedOrder = [];
  const pq = new MinPriorityQueue();
  const visited = new Set();
  const prev = Array.from({ length: GRID_ROWS }, () => Array(GRID_COLS).fill(null));

  pq.enqueue(start, getHeuristic(start.r, start.c, target.r, target.c, heuristicType));

  while (!pq.isEmpty()) {
    const curr = pq.dequeue();
    const key = `${curr.r},${curr.c}`;
    if (visited.has(key)) continue;
    visited.add(key);
    visitedOrder.push(curr);

    if (curr.r === target.r && curr.c === target.c) break;

    const neighbors = getNeighbors(curr.r, curr.c);
    for (const nb of neighbors) {
      if (!visited.has(`${nb.r},${nb.c}`)) {
        prev[nb.r][nb.c] = curr;
        pq.enqueue(nb, getHeuristic(nb.r, nb.c, target.r, target.c, heuristicType));
      }
    }
  }

  const path = reconstructPath(prev, target);
  let totalCost = 0;
  path.forEach(p => { totalCost += (boardState[p.r][p.c] === 5 ? 5 : 1); });
  return { visitedOrder, path, totalCost };
}

// 3.6 Bidirectional BFS
function runBidirectional(start, target) {
  const visitedOrder = [];
  const qStart = [start];
  const qTarget = [target];

  const visitedStart = new Map();
  const visitedTarget = new Map();
  visitedStart.set(`${start.r},${start.c}`, null);
  visitedTarget.set(`${target.r},${target.c}`, null);

  let intersectNode = null;

  while (qStart.length > 0 && qTarget.length > 0) {
    // Expand start
    const currStart = qStart.shift();
    visitedOrder.push(currStart);

    if (visitedTarget.has(`${currStart.r},${currStart.c}`)) {
      intersectNode = currStart;
      break;
    }

    for (const nb of getNeighbors(currStart.r, currStart.c)) {
      const key = `${nb.r},${nb.c}`;
      if (!visitedStart.has(key)) {
        visitedStart.set(key, currStart);
        qStart.push(nb);
      }
    }

    // Expand target
    const currTarget = qTarget.shift();
    visitedOrder.push(currTarget);

    if (visitedStart.has(`${currTarget.r},${currTarget.c}`)) {
      intersectNode = currTarget;
      break;
    }

    for (const nb of getNeighbors(currTarget.r, currTarget.c)) {
      const key = `${nb.r},${nb.c}`;
      if (!visitedTarget.has(key)) {
        visitedTarget.set(key, currTarget);
        qTarget.push(nb);
      }
    }
  }

  const path = [];
  if (intersectNode) {
    let curr = intersectNode;
    while (curr) {
      path.unshift(curr);
      curr = visitedStart.get(`${curr.r},${curr.c}`);
    }
    curr = visitedTarget.get(`${intersectNode.r},${intersectNode.c}`);
    while (curr) {
      path.push(curr);
      curr = visitedTarget.get(`${curr.r},${curr.c}`);
    }
  }

  let totalCost = 0;
  path.forEach(p => { totalCost += (boardState[p.r][p.c] === 5 ? 5 : 1); });
  return { visitedOrder, path, totalCost };
}

function reconstructPath(prev, target) {
  const path = [];
  let curr = target;
  while (curr) {
    path.unshift(curr);
    curr = prev[curr.r][curr.c];
  }
  if (path.length <= 1) return []; // No valid path found
  return path;
}

// =========================================================================
// 4. ANIMATION CONTROLLER
// =========================================================================
btnStart.addEventListener('click', async () => {
  if (isRunning) return;
  clearPreviousPath();

  const algo = algoSelect.value;
  const heuristic = heuristicSelect.value;

  isRunning = true;
  metricStatus.innerText = "Computing...";
  metricStatus.style.color = "#fbbf24";

  const startTime = performance.now();
  let result;

  if (algo === 'astar') result = runAStar(startNode, targetNode, heuristic);
  else if (algo === 'dijkstra') result = runDijkstra(startNode, targetNode);
  else if (algo === 'bfs') result = runBFS(startNode, targetNode);
  else if (algo === 'dfs') result = runDFS(startNode, targetNode);
  else if (algo === 'greedy') result = runGreedy(startNode, targetNode, heuristic);
  else if (algo === 'bidirectional') result = runBidirectional(startNode, targetNode);

  const endTime = performance.now();
  const execTime = (endTime - startTime).toFixed(2);

  await animateSearch(result.visitedOrder, result.path);

  isRunning = false;
  metricStatus.innerText = result.path.length > 0 ? "Path Found!" : "No Path!";
  metricStatus.style.color = result.path.length > 0 ? "#10b981" : "#f43f5e";
  metricNodes.innerText = result.visitedOrder.length;
  metricCost.innerText = result.totalCost === Infinity ? "∞" : result.totalCost;
  metricTime.innerText = `${execTime} ms`;
});

async function animateSearch(visitedOrder, path) {
  // Step-by-step visited animation
  for (let i = 0; i < visitedOrder.length; i++) {
    const node = visitedOrder[i];
    if ((node.r === startNode.r && node.c === startNode.c) || 
        (node.r === targetNode.r && node.c === targetNode.c)) {
      continue;
    }
    const cell = document.getElementById(`cell-${node.r}-${node.c}`);
    if (boardState[node.r][node.c] === 5) {
      cell.classList.add('visited-weight');
    } else {
      cell.classList.add('visited');
    }

    if (animationSpeed > 1 && i % 3 === 0) {
      await sleep(animationSpeed);
    }
  }

  // Animate final shortest path
  for (let i = 0; i < path.length; i++) {
    const node = path[i];
    if ((node.r === startNode.r && node.c === startNode.c) || 
        (node.r === targetNode.r && node.c === targetNode.c)) {
      continue;
    }
    const cell = document.getElementById(`cell-${node.r}-${node.c}`);
    cell.classList.add('path');
    await sleep(20);
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// =========================================================================
// 5. MAZE & PATTERN GENERATION
// =========================================================================
mazeSelect.addEventListener('change', (e) => {
  const pattern = e.target.value;
  if (isRunning || pattern === 'none') return;
  generatePattern(pattern);
});

function generatePattern(pattern) {
  initGrid();
  clearPreviousPath();

  if (pattern === 'random-walls') {
    for (let r = 0; r < GRID_ROWS; r++) {
      for (let c = 0; c < GRID_COLS; c++) {
        if ((r === startNode.r && c === startNode.c) || (r === targetNode.r && c === targetNode.c)) continue;
        if (Math.random() < 0.28) {
          boardState[r][c] = 1;
          document.getElementById(`cell-${r}-${c}`).className = 'grid-cell wall';
        }
      }
    }
  } else if (pattern === 'weighted-swamp') {
    for (let r = 0; r < GRID_ROWS; r++) {
      for (let c = 0; c < GRID_COLS; c++) {
        if ((r === startNode.r && c === startNode.c) || (r === targetNode.r && c === targetNode.c)) continue;
        if (c > 15 && c < 30 && r > 3 && r < 16) {
          boardState[r][c] = 5;
          document.getElementById(`cell-${r}-${c}`).className = 'grid-cell weight';
        } else if (Math.random() < 0.15) {
          boardState[r][c] = 1;
          document.getElementById(`cell-${r}-${c}`).className = 'grid-cell wall';
        }
      }
    }
  } else if (pattern === 'stair-pattern') {
    for (let i = 0; i < 15; i++) {
      const r = i + 2;
      const c = i + 10;
      if (r < GRID_ROWS && c < GRID_COLS) {
        boardState[r][c] = 1;
        document.getElementById(`cell-${r}-${c}`).className = 'grid-cell wall';
      }
    }
    for (let i = 0; i < 15; i++) {
      const r = 18 - i;
      const c = i + 20;
      if (r >= 0 && c < GRID_COLS) {
        boardState[r][c] = 1;
        document.getElementById(`cell-${r}-${c}`).className = 'grid-cell wall';
      }
    }
  } else if (pattern === 'recursive-division') {
    buildRecursiveMaze(0, GRID_ROWS - 1, 0, GRID_COLS - 1);
  }
}

function buildRecursiveMaze(rStart, rEnd, cStart, cEnd) {
  if (rEnd - rStart < 3 || cEnd - cStart < 3) return;

  const horizontal = (rEnd - rStart) > (cEnd - cStart);
  if (horizontal) {
    const wallRow = Math.floor(Math.random() * (rEnd - rStart - 1)) + rStart + 1;
    const passageCol = Math.floor(Math.random() * (cEnd - cStart + 1)) + cStart;

    for (let c = cStart; c <= cEnd; c++) {
      if (c !== passageCol) {
        if (!((wallRow === startNode.r && c === startNode.c) || (wallRow === targetNode.r && c === targetNode.c))) {
          boardState[wallRow][c] = 1;
          document.getElementById(`cell-${wallRow}-${c}`).className = 'grid-cell wall';
        }
      }
    }
    buildRecursiveMaze(rStart, wallRow - 1, cStart, cEnd);
    buildRecursiveMaze(wallRow + 1, rEnd, cStart, cEnd);
  } else {
    const wallCol = Math.floor(Math.random() * (cEnd - cStart - 1)) + cStart + 1;
    const passageRow = Math.floor(Math.random() * (rEnd - rStart + 1)) + rStart;

    for (let r = rStart; r <= rEnd; r++) {
      if (r !== passageRow) {
        if (!((r === startNode.r && wallCol === startNode.c) || (r === targetNode.r && wallCol === targetNode.c))) {
          boardState[r][wallCol] = 1;
          document.getElementById(`cell-${r}-${wallCol}`).className = 'grid-cell wall';
        }
      }
    }
    buildRecursiveMaze(rStart, rEnd, cStart, wallCol - 1);
    buildRecursiveMaze(rStart, rEnd, wallCol + 1, cEnd);
  }
}

// =========================================================================
// 6. TAB NAVIGATION
// =========================================================================
const navTabs = document.querySelectorAll('.nav-tab');
const tabPanes = document.querySelectorAll('.tab-pane');

navTabs.forEach(tab => {
  tab.addEventListener('click', () => {
    navTabs.forEach(t => t.classList.remove('active'));
    tabPanes.forEach(p => p.classList.remove('active'));

    tab.classList.add('active');
    const targetTab = document.getElementById(tab.dataset.tab);
    if (targetTab) targetTab.classList.add('active');

    if (tab.dataset.tab === 'network-graph') {
      drawNetworkGraph();
    }
  });
});

// =========================================================================
// 7. TAB 2: SIDE-BY-SIDE DUAL RACE
// =========================================================================
const RACE_ROWS = 16;
const RACE_COLS = 25;
const raceGrid1 = document.getElementById('grid-race-1');
const raceGrid2 = document.getElementById('grid-race-2');
let raceSharedWalls = [];

function initRaceGrids() {
  raceGrid1.innerHTML = '';
  raceGrid2.innerHTML = '';

  const raceCellSize = isMobile ? '11px' : '20px';
  raceGrid1.style.gridTemplateColumns = `repeat(${RACE_COLS}, ${raceCellSize})`;
  raceGrid1.style.gridTemplateRows = `repeat(${RACE_ROWS}, ${raceCellSize})`;
  raceGrid2.style.gridTemplateColumns = `repeat(${RACE_COLS}, ${raceCellSize})`;
  raceGrid2.style.gridTemplateRows = `repeat(${RACE_ROWS}, ${raceCellSize})`;

  for (let r = 0; r < RACE_ROWS; r++) {
    for (let c = 0; c < RACE_COLS; c++) {
      const c1 = document.createElement('div');
      c1.className = 'grid-cell';
      c1.id = `race1-${r}-${c}`;
      if (r === 8 && c === 2) c1.classList.add('start');
      if (r === 8 && c === 22) c1.classList.add('target');
      raceGrid1.appendChild(c1);

      const c2 = document.createElement('div');
      c2.className = 'grid-cell';
      c2.id = `race2-${r}-${c}`;
      if (r === 8 && c === 2) c2.classList.add('start');
      if (r === 8 && c === 22) c2.classList.add('target');
      raceGrid2.appendChild(c2);
    }
  }
}

document.getElementById('race-maze-btn').addEventListener('click', () => {
  raceSharedWalls = [];
  initRaceGrids();
  // Generate identical obstacles
  for (let r = 0; r < RACE_ROWS; r++) {
    for (let c = 0; c < RACE_COLS; c++) {
      if ((r === 8 && c === 2) || (r === 8 && c === 22)) continue;
      if (Math.random() < 0.25) {
        raceSharedWalls.push({ r, c });
        document.getElementById(`race1-${r}-${c}`).className = 'grid-cell wall';
        document.getElementById(`race2-${r}-${c}`).className = 'grid-cell wall';
      }
    }
  }
});

document.getElementById('race-reset-btn').addEventListener('click', () => {
  raceSharedWalls = [];
  initRaceGrids();
  document.getElementById('race-result-1').innerText = "Ready";
  document.getElementById('race-result-2').innerText = "Ready";
  document.getElementById('race-nodes-1').innerText = "0";
  document.getElementById('race-nodes-2').innerText = "0";
  document.getElementById('duel-verdict').innerHTML = "Select competitors and click <strong>Start Simultaneous Race</strong>.";
});

document.getElementById('race-start-btn').addEventListener('click', async () => {
  const algo1 = document.getElementById('race-algo-1').value;
  const algo2 = document.getElementById('race-algo-2').value;

  // Clear race path styling
  for (let r = 0; r < RACE_ROWS; r++) {
    for (let c = 0; c < RACE_COLS; c++) {
      const el1 = document.getElementById(`race1-${r}-${c}`);
      const el2 = document.getElementById(`race2-${r}-${c}`);
      el1.classList.remove('visited', 'path');
      el2.classList.remove('visited', 'path');
    }
  }

  const raceStart = { r: 8, c: 2 };
  const raceTarget = { r: 8, c: 22 };

  // Helper solver for mini-arena
  function solveArena(algoKey) {
    const isWall = (r, c) => raceSharedWalls.some(w => w.r === r && w.c === c);
    const getRaceNeighbors = (r, c) => {
      const res = [];
      const dirs = [[-1, 0], [1, 0], [0, -1], [0, 1]];
      for (const [dr, dc] of dirs) {
        const nr = r + dr, nc = c + dc;
        if (nr >= 0 && nr < RACE_ROWS && nc >= 0 && nc < RACE_COLS && !isWall(nr, nc)) {
          res.push({ r: nr, c: nc });
        }
      }
      return res;
    };

    const t0 = performance.now();
    let visitedOrder = [];
    let path = [];
    let cost = 0;

    if (algoKey === 'astar') {
      const dist = Array.from({ length: RACE_ROWS }, () => Array(RACE_COLS).fill(Infinity));
      const prev = Array.from({ length: RACE_ROWS }, () => Array(RACE_COLS).fill(null));
      const pq = new MinPriorityQueue();
      dist[raceStart.r][raceStart.c] = 0;
      pq.enqueue(raceStart, Math.abs(raceStart.r - raceTarget.r) + Math.abs(raceStart.c - raceTarget.c));
      const visited = new Set();

      while (!pq.isEmpty()) {
        const curr = pq.dequeue();
        const key = `${curr.r},${curr.c}`;
        if (visited.has(key)) continue;
        visited.add(key);
        visitedOrder.push(curr);
        if (curr.r === raceTarget.r && curr.c === raceTarget.c) break;

        for (const nb of getRaceNeighbors(curr.r, curr.c)) {
          const alt = dist[curr.r][curr.c] + 1;
          if (alt < dist[nb.r][nb.c]) {
            dist[nb.r][nb.c] = alt;
            prev[nb.r][nb.c] = curr;
            pq.enqueue(nb, alt + Math.abs(nb.r - raceTarget.r) + Math.abs(nb.c - raceTarget.c));
          }
        }
      }
      path = reconstructPath(prev, raceTarget);
      cost = dist[raceTarget.r][raceTarget.c];
    } else {
      // Dijkstra / BFS
      const dist = Array.from({ length: RACE_ROWS }, () => Array(RACE_COLS).fill(Infinity));
      const prev = Array.from({ length: RACE_ROWS }, () => Array(RACE_COLS).fill(null));
      const pq = new MinPriorityQueue();
      dist[raceStart.r][raceStart.c] = 0;
      pq.enqueue(raceStart, 0);
      const visited = new Set();

      while (!pq.isEmpty()) {
        const curr = pq.dequeue();
        const key = `${curr.r},${curr.c}`;
        if (visited.has(key)) continue;
        visited.add(key);
        visitedOrder.push(curr);
        if (curr.r === raceTarget.r && curr.c === raceTarget.c) break;

        for (const nb of getRaceNeighbors(curr.r, curr.c)) {
          const alt = dist[curr.r][curr.c] + 1;
          if (alt < dist[nb.r][nb.c]) {
            dist[nb.r][nb.c] = alt;
            prev[nb.r][nb.c] = curr;
            pq.enqueue(nb, alt);
          }
        }
      }
      path = reconstructPath(prev, raceTarget);
      cost = dist[raceTarget.r][raceTarget.c];
    }

    const t1 = performance.now();
    return { visitedOrder, path, cost: cost === Infinity ? 0 : cost, time: (t1 - t0).toFixed(2) };
  }

  const res1 = solveArena(algo1);
  const res2 = solveArena(algo2);

  // Animate concurrently
  const maxSteps = Math.max(res1.visitedOrder.length, res2.visitedOrder.length);
  for (let i = 0; i < maxSteps; i++) {
    if (i < res1.visitedOrder.length) {
      const n1 = res1.visitedOrder[i];
      if (!(n1.r === 8 && (n1.c === 2 || n1.c === 22))) {
        document.getElementById(`race1-${n1.r}-${n1.c}`).classList.add('visited');
      }
    }
    if (i < res2.visitedOrder.length) {
      const n2 = res2.visitedOrder[i];
      if (!(n2.r === 8 && (n2.c === 2 || n2.c === 22))) {
        document.getElementById(`race2-${n2.r}-${n2.c}`).classList.add('visited');
      }
    }
    if (i % 2 === 0) await sleep(15);
  }

  res1.path.forEach(p => {
    if (!(p.r === 8 && (p.c === 2 || p.c === 22))) document.getElementById(`race1-${p.r}-${p.c}`).classList.add('path');
  });
  res2.path.forEach(p => {
    if (!(p.r === 8 && (p.c === 2 || p.c === 22))) document.getElementById(`race2-${p.r}-${p.c}`).classList.add('path');
  });

  // Display metrics
  document.getElementById('race-nodes-1').innerText = res1.visitedOrder.length;
  document.getElementById('race-cost-1').innerText = res1.cost;
  document.getElementById('race-time-1').innerText = `${res1.time} ms`;

  document.getElementById('race-nodes-2').innerText = res2.visitedOrder.length;
  document.getElementById('race-cost-2').innerText = res2.cost;
  document.getElementById('race-time-2').innerText = `${res2.time} ms`;

  const nodeSavings = (((res1.visitedOrder.length - res2.visitedOrder.length) / res1.visitedOrder.length) * 100).toFixed(1);
  const verdict = document.getElementById('duel-verdict');

  if (res2.visitedOrder.length < res1.visitedOrder.length) {
    verdict.innerHTML = `<strong>Competitor B (${algo2.toUpperCase()})</strong> explored <strong>${Math.abs(nodeSavings)}% fewer nodes</strong> than Competitor A (${algo1.toUpperCase()}) while matching exact path optimality!`;
  } else if (res1.visitedOrder.length < res2.visitedOrder.length) {
    verdict.innerHTML = `<strong>Competitor A (${algo1.toUpperCase()})</strong> outperformed Competitor B with <strong>${Math.abs(nodeSavings)}% fewer vertex evaluations</strong>.`;
  } else {
    verdict.innerHTML = `Both algorithms exhibited identical exploration footprints on this obstacle topography.`;
  }
});

// =========================================================================
// 8. TAB 4: ARBITRARY NODE-WEIGHTED GRAPH & BELLMAN-FORD
// =========================================================================
const canvas = document.getElementById('graph-canvas');
const ctx = canvas.getContext('2d');

let networkNodes = [];
let networkEdges = [];
let selectedNodeForEdge = null;
let highlightedPath = [];

function loadSampleGraph(type) {
  if (type === 'delivery') {
    networkNodes = [
      { id: 'Warehouse A', x: 100, y: 150 },
      { id: 'Hub B', x: 280, y: 80 },
      { id: 'Hub C', x: 280, y: 260 },
      { id: 'Station D', x: 480, y: 100 },
      { id: 'Station E', x: 480, y: 280 },
      { id: 'Client Target F', x: 720, y: 180 }
    ];
    networkEdges = [
      { from: 'Warehouse A', to: 'Hub B', weight: 4 },
      { from: 'Warehouse A', to: 'Hub C', weight: 2 },
      { from: 'Hub B', to: 'Station D', weight: 5 },
      { from: 'Hub B', to: 'Hub C', weight: 1 },
      { from: 'Hub C', to: 'Station E', weight: 8 },
      { from: 'Hub C', to: 'Station D', weight: 10 },
      { from: 'Station D', to: 'Client Target F', weight: 6 },
      { from: 'Station E', to: 'Client Target F', weight: 2 },
      { from: 'Station D', to: 'Station E', weight: 2 }
    ];
  } else if (type === 'arbitrage') {
    networkNodes = [
      { id: 'USD', x: 140, y: 120 },
      { id: 'EUR', x: 380, y: 90 },
      { id: 'GBP', x: 620, y: 160 },
      { id: 'JPY', x: 460, y: 340 },
      { id: 'BTC', x: 220, y: 320 }
    ];
    networkEdges = [
      { from: 'USD', to: 'EUR', weight: 2 },
      { from: 'EUR', to: 'GBP', weight: -3 }, // Negative edge
      { from: 'GBP', to: 'JPY', weight: 4 },
      { from: 'JPY', to: 'BTC', weight: 1 },
      { from: 'BTC', to: 'USD', weight: -1 }
    ];
  }
  highlightedPath = [];
  drawNetworkGraph();
  clearNetworkTable();
}

function resetNetworkGraph() {
  networkNodes = [];
  networkEdges = [];
  highlightedPath = [];
  drawNetworkGraph();
  clearNetworkTable();
}

function clearNetworkTable() {
  document.getElementById('dist-table-body').innerHTML = `<tr><td colspan="3">Awaiting execution...</td></tr>`;
  document.getElementById('network-output').innerText = "Graph updated. Select an algorithm to solve.";
}

function drawNetworkGraph() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Draw Edges
  networkEdges.forEach(edge => {
    const fromNode = networkNodes.find(n => n.id === edge.from);
    const toNode = networkNodes.find(n => n.id === edge.to);
    if (!fromNode || !toNode) return;

    const isPath = highlightedPath.some((p, idx) => {
      if (idx === highlightedPath.length - 1) return false;
      return (p === edge.from && highlightedPath[idx + 1] === edge.to) ||
             (p === edge.to && highlightedPath[idx + 1] === edge.from);
    });

    ctx.beginPath();
    ctx.moveTo(fromNode.x, fromNode.y);
    ctx.lineTo(toNode.x, toNode.y);
    ctx.strokeStyle = isPath ? '#fbbf24' : (edge.weight < 0 ? '#f43f5e' : '#334155');
    ctx.lineWidth = isPath ? 4 : 2;
    ctx.stroke();

    // Weight label
    const midX = (fromNode.x + toNode.x) / 2;
    const midY = (fromNode.y + toNode.y) / 2;
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(midX - 14, midY - 10, 28, 20);
    ctx.strokeStyle = edge.weight < 0 ? '#f43f5e' : '#475569';
    ctx.lineWidth = 1;
    ctx.strokeRect(midX - 14, midY - 10, 28, 20);

    ctx.fillStyle = edge.weight < 0 ? '#f43f5e' : '#38bdf8';
    ctx.font = '11px Fira Code';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(edge.weight, midX, midY);
  });

  // Draw Nodes
  networkNodes.forEach(node => {
    const isSelected = selectedNodeForEdge === node;
    const isPathNode = highlightedPath.includes(node.id);

    ctx.beginPath();
    ctx.arc(node.x, node.y, 22, 0, Math.PI * 2);
    ctx.fillStyle = isSelected ? '#3b82f6' : (isPathNode ? '#fbbf24' : '#1e293b');
    ctx.fill();
    ctx.strokeStyle = isSelected ? '#60a5fa' : (isPathNode ? '#f59e0b' : '#38bdf8');
    ctx.lineWidth = 2.5;
    ctx.stroke();

    ctx.fillStyle = isPathNode ? '#090d16' : '#f8fafc';
    ctx.font = 'bold 11px Plus Jakarta Sans';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(node.id.substring(0, 8), node.x, node.y);
  });
}

// Solve Network using Dijkstra or Bellman-Ford
function solveNetworkGraph(algo) {
  if (networkNodes.length < 2) {
    alert("Please load or draw at least 2 nodes.");
    return;
  }

  const startId = networkNodes[0].id;
  const targetId = networkNodes[networkNodes.length - 1].id;
  const outputBox = document.getElementById('network-output');
  const tableBody = document.getElementById('dist-table-body');

  const dist = {};
  const prev = {};
  networkNodes.forEach(n => {
    dist[n.id] = Infinity;
    prev[n.id] = null;
  });
  dist[startId] = 0;

  if (algo === 'dijkstra') {
    // Check for negative weights
    const hasNegative = networkEdges.some(e => e.weight < 0);
    if (hasNegative) {
      outputBox.innerHTML = `<span style="color:#f43f5e;">⚠️ Error: Dijkstra cannot execute safely on negative weights!</span> Dijkstra would produce mathematically invalid cycles. Use <strong>Bellman-Ford</strong> instead.`;
      return;
    }

    const unvisited = new Set(networkNodes.map(n => n.id));
    while (unvisited.size > 0) {
      let closest = null;
      for (const id of unvisited) {
        if (closest === null || dist[id] < dist[closest]) {
          closest = id;
        }
      }
      if (dist[closest] === Infinity) break;
      unvisited.delete(closest);

      // Relax outgoing edges
      const edges = networkEdges.filter(e => e.from === closest || e.to === closest);
      edges.forEach(e => {
        const neighbor = e.from === closest ? e.to : e.from;
        if (unvisited.has(neighbor)) {
          const alt = dist[closest] + e.weight;
          if (alt < dist[neighbor]) {
            dist[neighbor] = alt;
            prev[neighbor] = closest;
          }
        }
      });
    }

    outputBox.innerHTML = `<strong>Dijkstra Solution from [${startId}]:</strong><br>Optimal Path found to Target [<strong>${targetId}</strong>] with total distance cost <strong>${dist[targetId]}</strong>.`;
  } else if (algo === 'bellman-ford') {
    const V = networkNodes.length;
    // Relax edges |V| - 1 times
    for (let i = 1; i <= V - 1; i++) {
      networkEdges.forEach(e => {
        if (dist[e.from] !== Infinity && dist[e.from] + e.weight < dist[e.to]) {
          dist[e.to] = dist[e.from] + e.weight;
          prev[e.to] = e.from;
        }
      });
    }

    // Step: Check for negative-weight cycles
    let hasNegCycle = false;
    networkEdges.forEach(e => {
      if (dist[e.from] !== Infinity && dist[e.from] + e.weight < dist[e.to]) {
        hasNegCycle = true;
      }
    });

    if (hasNegCycle) {
      outputBox.innerHTML = `<span style="color:#f43f5e;">🚨 Negative Weight Cycle Detected!</span> Bellman-Ford verified an infinite arbitrage relaxation loop in this network!`;
      return;
    } else {
      outputBox.innerHTML = `<strong>Bellman-Ford Solution:</strong><br>Relaxed ${V - 1} cycles safely. Negative edges processed successfully without unbounded loops. Distance to Target [<strong>${targetId}</strong>] is <strong>${dist[targetId]}</strong>.`;
    }
  }

  // Reconstruct path
  highlightedPath = [];
  let curr = targetId;
  while (curr) {
    highlightedPath.unshift(curr);
    curr = prev[curr];
  }
  drawNetworkGraph();

  // Populate Table
  tableBody.innerHTML = '';
  networkNodes.forEach(n => {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td><strong>${n.id}</strong></td>
      <td>${dist[n.id] === Infinity ? '∞' : dist[n.id]}</td>
      <td>${prev[n.id] || 'None (Source)'}</td>
    `;
    tableBody.appendChild(row);
  });
}

// Canvas double-click to add node
canvas.addEventListener('dblclick', (e) => {
  const rect = canvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;
  const name = String.fromCharCode(65 + networkNodes.length);
  networkNodes.push({ id: `Node ${name}`, x, y });
  drawNetworkGraph();
});

// Canvas click to select/connect edges
canvas.addEventListener('click', (e) => {
  const rect = canvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;

  const clicked = networkNodes.find(n => Math.hypot(n.x - x, n.y - y) <= 24);
  if (!clicked) {
    selectedNodeForEdge = null;
    drawNetworkGraph();
    return;
  }

  if (!selectedNodeForEdge) {
    selectedNodeForEdge = clicked;
    drawNetworkGraph();
  } else if (selectedNodeForEdge === clicked) {
    selectedNodeForEdge = null;
    drawNetworkGraph();
  } else {
    // Prompt for weight
    const rawWeight = prompt(`Enter edge weight between ${selectedNodeForEdge.id} and ${clicked.id}:`, "3");
    if (rawWeight !== null) {
      const weight = parseInt(rawWeight) || 1;
      networkEdges.push({ from: selectedNodeForEdge.id, to: clicked.id, weight });
    }
    selectedNodeForEdge = null;
    drawNetworkGraph();
  }
});

// =========================================================================
// 9. TAB 5: SOURCE CODE & EXAMPLES
// =========================================================================
const CODE_SNIPPETS = {
  'astar-js': `/**
 * High-Performance A* Shortest Path Engine (ES6)
 * Ideal for real-time spatial navigation & GIS applications
 */
class PriorityQueue {
  constructor() { this.items = []; }
  push(element, priority) {
    this.items.push({ element, priority });
    this.items.sort((a, b) => a.priority - b.priority);
  }
  pop() { return this.items.shift()?.element; }
  isEmpty() { return this.items.length === 0; }
}

function findAStarPath(grid, start, target) {
  const rows = grid.length, cols = grid[0].length;
  const gScore = Array.from({ length: rows }, () => Array(cols).fill(Infinity));
  const cameFrom = new Map();
  const pq = new PriorityQueue();

  const h = (r, c) => Math.abs(r - target.r) + Math.abs(c - target.c);

  gScore[start.r][start.c] = 0;
  pq.push(start, h(start.r, start.c));

  while (!pq.isEmpty()) {
    const current = pq.pop();
    if (current.r === target.r && current.c === target.c) {
      return reconstructPath(cameFrom, current);
    }

    const neighbors = [
      { r: current.r - 1, c: current.c },
      { r: current.r + 1, c: current.c },
      { r: current.r, c: current.c - 1 },
      { r: current.r, c: current.c + 1 }
    ].filter(n => n.r >= 0 && n.r < rows && n.c >= 0 && n.c < cols && grid[n.r][n.c] !== 1);

    for (const nb of neighbors) {
      const stepCost = grid[nb.r][nb.c] === 5 ? 5 : 1;
      const tentativeG = gScore[current.r][current.c] + stepCost;

      if (tentativeG < gScore[nb.r][nb.c]) {
        cameFrom.set(\`\${nb.r},\${nb.c}\`, current);
        gScore[nb.r][nb.c] = tentativeG;
        const fScore = tentativeG + h(nb.r, nb.c);
        pq.push(nb, fScore);
      }
    }
  }
  return null; // No path
}`,

  'dijkstra-py': `import heapq
from typing import Dict, List, Tuple

def dijkstra_shortest_path(graph: Dict[str, List[Tuple[str, float]]], start: str, target: str):
    """
    Production Dijkstra using Python's native binary min-heap (heapq).
    Guarantees O((V + E) log V) runtime complexity.
    """
    distances = {node: float('inf') for node in graph}
    predecessors = {node: None for node in graph}
    distances[start] = 0
    
    # Priority Queue stores: (distance, node)
    pq = [(0, start)]
    visited = set()
    
    while pq:
        current_dist, current_node = heapq.heappop(pq)
        
        if current_node in visited:
            continue
        visited.add(current_node)
        
        if current_node == target:
            break
            
        for neighbor, weight in graph.get(current_node, []):
            distance = current_dist + weight
            if distance < distances[neighbor]:
                distances[neighbor] = distance
                predecessors[neighbor] = current_node
                heapq.heappush(pq, (distance, neighbor))
                
    # Reconstruct route
    path = []
    curr = target
    while curr:
        path.append(curr)
        curr = predecessors[curr]
    return path[::-1], distances[target]`,

  'bellman-py': `class BellmanFordArbitrage:
    """
    Bellman-Ford Algorithm with Negative-Weight Cycle Detection.
    Crucial for Currency Forex & Crypto Exchange Triangular Arbitrage.
    """
    def __init__(self, vertices: List[str]):
        self.vertices = vertices
        self.edges = []  # List of tuples: (u, v, weight)

    def add_edge(self, u: str, v: str, weight: float):
        self.edges.append((u, v, weight))

    def solve(self, source: str):
        dist = {v: float('inf') for v in self.vertices}
        prev = {v: None for v in self.vertices}
        dist[source] = 0

        # Step 1: Relax edges |V| - 1 times
        for _ in range(len(self.vertices) - 1):
            for u, v, w in self.edges:
                if dist[u] != float('inf') and dist[u] + w < dist[v]:
                    dist[v] = dist[u] + w
                    prev[v] = u

        # Step 2: Check for negative cycle
        for u, v, w in self.edges:
            if dist[u] != float('inf') and dist[u] + w < dist[v]:
                return None, "Arbitrage Loop Detected (Negative Cycle)!"

        return dist, prev`,

  'floyd-js': `/**
 * Floyd-Warshall All-Pairs Shortest Path
 * Computes exact matrix distance between every pair in O(V^3)
 */
function floydWarshall(matrix) {
  const n = matrix.length;
  const dist = matrix.map(row => [...row]);

  for (let k = 0; k < n; k++) {
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        if (dist[i][k] + dist[k][j] < dist[i][j]) {
          dist[i][j] = dist[i][k] + dist[k][j];
        }
      }
    }
  }
  return dist;
}`
};

const codeBlock = document.getElementById('code-block');
const codeFilename = document.getElementById('code-filename');

function setCodeSnippet(key) {
  codeBlock.textContent = CODE_SNIPPETS[key];
  if (key === 'astar-js') codeFilename.innerText = "AStarPathfinder.js";
  else if (key === 'dijkstra-py') codeFilename.innerText = "dijkstra_router.py";
  else if (key === 'bellman-py') codeFilename.innerText = "bellman_arbitrage.py";
  else if (key === 'floyd-js') codeFilename.innerText = "floyd_warshall_matrix.js";
}

document.querySelectorAll('.code-tab-btn').forEach(btn => {
  btn.addEventListener('click', (e) => {
    document.querySelectorAll('.code-tab-btn').forEach(b => b.classList.remove('active'));
    e.target.classList.add('active');
    setCodeSnippet(e.target.dataset.code);
  });
});

function copyActiveCode() {
  navigator.clipboard.writeText(codeBlock.textContent).then(() => {
    alert("Source code copied to clipboard!");
  });
}

function exportReport() {
  window.print();
}

// Initial Boot
initGrid();
initRaceGrids();
loadSampleGraph('delivery');
setCodeSnippet('astar-js');
updateAlgoInfo('astar');
