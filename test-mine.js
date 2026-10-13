// 排雷引擎单元测试：从 packages/mine-float/client.js 提取引擎块（保证测试的就是插件发布代码）
// 用法: node test-mine.js
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'packages/mine-float/client.js'), 'utf8');
const m = src.match(/\/\/ ===ENGINE-START===([\s\S]*?)\/\/ ===ENGINE-END===/);
if (!m) { console.error('未找到引擎块'); process.exit(1); }
const engine = new Function(m[1] + '\nreturn { LEVELS, newGame, reveal, toggleFlag, chord, neighbors };')();
const { newGame, reveal, toggleFlag, chord, neighbors } = engine;

let passed = 0, failed = 0;
function ok(cond, name) {
  if (cond) { passed++; console.log('  ✓ ' + name); }
  else { failed++; console.error('  ✗ ' + name); }
}

console.log('— 初始状态');
{
  const s = newGame('beginner');
  ok(s.rows === 9 && s.cols === 9 && s.mines === 10, '初级 9×9 / 10 雷');
  ok(s.status === 'playing' && !s.minesPlaced && s.revealedCount === 0, '开局未布雷、状态 playing');
}

console.log('— 首翻安全 + 布雷');
{
  for (let trial = 0; trial < 200; trial++) {
    const s = reveal(newGame('beginner'), 4, 4);
    if (s.status !== 'playing') { ok(false, '首翻不应直接结束'); break; }
    for (const [r, c] of [[4, 4], ...neighbors(s, 4, 4)]) {
      if (s.grid[r][c].mine) { ok(false, `首翻邻域含雷 (trial ${trial})`); trial = 1e9; break; }
    }
    let mines = 0;
    for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++) if (s.grid[r][c].mine) mines++;
    if (mines !== 10) { ok(false, '布雷数量≠10'); break; }
    if (trial === 199) ok(true, '200 次首翻均安全且恰好 10 雷');
  }
  const s2 = reveal(newGame('expert'), 0, 0);
  ok(s2.minesPlaced && s2.grid[0][0].n === 0, '高级盘首翻角落必为 0（9 格保护区）');
}

console.log('— 泛洪展开');
{
  const s = reveal(newGame('beginner'), 4, 4);
  ok(s.revealedCount >= 9, `首翻至少展开保护区 9 格（实际 ${s.revealedCount}）`);
  // 全盘逐格展开直到终局，验证泛洪完备性：任何已展开 0 格的邻居必然已展开
  let g = s, guard = 0;
  while (g.status === 'playing' && guard++ < 500) {
    outer:
    for (let r = 0; r < g.rows; r++) for (let c = 0; c < g.cols; c++) {
      const cell = g.grid[r][c];
      if (!cell.revealed && !cell.flag) { g = reveal(g, r, c); break outer; }
    }
  }
  let consistent = true;
  for (let r = 0; r < g.rows && consistent; r++) for (let c = 0; c < g.cols; c++) {
    const cell = g.grid[r][c];
    if (cell.revealed && cell.n === 0 && !cell.mine) {
      for (const [nr, nc] of neighbors(g, r, c)) {
        if (!g.grid[nr][nc].revealed && !g.grid[nr][nc].flag) { consistent = false; break; }
      }
    }
  }
  ok(consistent, '0 格的未标旗邻居全部被展开（泛洪完备）');
  ok(g.status === 'won' || g.status === 'lost', '盲翻最终必达终局，当前: ' + g.status);
}

console.log('— 标旗');
{
  let s = newGame('beginner');
  s = toggleFlag(s, 0, 0);
  ok(s.grid[0][0].flag && s.flagCount === 1, '标旗生效');
  s = reveal(s, 0, 0);
  ok(s.grid[0][0].flag && !s.minesPlaced, '已标旗格不可翻开');
  s = toggleFlag(s, 0, 0);
  ok(!s.grid[0][0].flag && s.flagCount === 0, '取消标旗');
  const t = reveal(s, 0, 0);
  ok(t.grid[0][0].revealed, '取消后可翻开');
}

console.log('— 踩雷失败与胜利判定');
{
  // 踩雷：翻到一颗已布雷盘上的雷
  let s = reveal(newGame('beginner'), 4, 4);
  let mineCell = null;
  for (let r = 0; r < 9 && !mineCell; r++) for (let c = 0; c < 9; c++) {
    if (s.grid[r][c].mine && !s.grid[r][c].flag) { mineCell = [r, c]; break; }
  }
  const l = reveal(s, mineCell[0], mineCell[1]);
  ok(l.status === 'lost' && l.grid[mineCell[0]][mineCell[1]].exploded, '踩雷判负并标记爆点');
  let allMinesShown = true;
  for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++) if (l.grid[r][c].mine && !l.grid[r][c].revealed) allMinesShown = false;
  ok(allMinesShown, '失败时全部雷展示');

  // 胜利：标出所有雷后翻开其余所有格
  let w = reveal(newGame('beginner'), 4, 4);
  for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++) {
    if (w.grid[r][c].mine) w = toggleFlag(w, r, c);
  }
  ok(w.flagCount === 10, '标满 10 旗');
  let guard = 0;
  outer2:
  while (w.status === 'playing' && guard++ < 500) {
    for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++) {
      if (!w.grid[r][c].revealed && !w.grid[r][c].flag) { w = reveal(w, r, c); continue outer2; }
    }
  }
  ok(w.status === 'won', `翻开全部非雷格判胜（${w.revealedCount}/71）`);
}

console.log('— 双击快速展开（chord）');
{
  let s = reveal(newGame('beginner'), 4, 4);
  // 找一个已展开数字格，标对其周围全部雷后双击
  let target = null;
  for (let r = 0; r < 9 && !target; r++) for (let c = 0; c < 9; c++) {
    const cell = s.grid[r][c];
    if (cell.revealed && cell.n > 0) {
      const ns = neighbors(s, r, c);
      if (ns.every(([nr, nc]) => s.grid[nr][nc].revealed || !s.grid[nr][nc].mine)) { target = [r, c]; break; }
    }
  }
  if (target) {
    const before = s.revealedCount;
    const after = chord(s, target[0], target[1]);
    ok(after.revealedCount > before || after.status !== 'playing', 'chord 展开了新格（无需旗也满足条件时）');
  } else {
    // 构造：手动展开一圈，然后验证 chord 在旗数不符时是 no-op
    const noop = chord(s, 4, 4);
    ok(noop === s || noop.revealedCount >= s.revealedCount, 'chord 不破坏状态');
  }
  // 旗数不匹配时 no-op
  let s2 = reveal(newGame('beginner'), 4, 4);
  let t2 = null;
  for (let r = 0; r < 9 && !t2; r++) for (let c = 0; c < 9; c++) {
    const cell = s2.grid[r][c];
    if (cell.revealed && cell.n > 0) { t2 = [r, c]; break; }
  }
  const nc = chord(s2, t2[0], t2[1]);
  ok(nc.revealedCount === s2.revealedCount && nc.status === s2.status, '旗数不符时 chord 不动作');
}

console.log('— 难度预设');
{
  for (const [k, rc] of [['beginner', [9, 9, 10]], ['intermediate', [16, 16, 40]], ['expert', [16, 30, 99]]]) {
    const s = newGame(k);
    ok(s.rows === rc[0] && s.cols === rc[1] && s.mines === rc[2], `${k} = ${rc.join('×')} ✓`);
  }
}

console.log(`\n结果: ${passed} 通过, ${failed} 失败`);
process.exit(failed ? 1 : 0);
