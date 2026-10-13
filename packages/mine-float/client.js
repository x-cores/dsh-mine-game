window.__ModuleLoader__.load({
  id: 'dsh-mine-float',
  factory(require) {
    const React = require('react');
    const h = React.createElement;

    // ============================================================
    // 排雷引擎（纯函数；test-mine.js 通过标记提取此块做校验）
    // ===ENGINE-START===
    const LEVELS = {
      beginner: { label: '初级 9×9 · 10雷', rows: 9, cols: 9, mines: 10 },
      intermediate: { label: '中级 16×16 · 40雷', rows: 16, cols: 16, mines: 40 },
      expert: { label: '高级 16×30 · 99雷', rows: 16, cols: 30, mines: 99 },
    };

    function newGame(levelKey) {
      const L = LEVELS[levelKey] || LEVELS.beginner;
      return {
        level: LEVELS.beginner === L ? 'beginner' : levelKey in LEVELS ? levelKey : 'beginner',
        rows: L.rows, cols: L.cols, mines: L.mines,
        minesPlaced: false,
        grid: Array.from({ length: L.rows }, () => Array.from({ length: L.cols }, () => ({
          mine: false, revealed: false, flag: false, n: 0, exploded: false,
        }))),
        status: 'playing', // playing | won | lost
        revealedCount: 0,
        flagCount: 0,
      };
    }

    function cloneState(s) {
      return {
        ...s,
        grid: s.grid.map(row => row.map(c => ({ ...c }))),
      };
    }

    function neighbors(s, r, c) {
      const out = [];
      for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
        if (!dr && !dc) continue;
        const nr = r + dr, nc = c + dc;
        if (nr >= 0 && nr < s.rows && nc >= 0 && nc < s.cols) out.push([nr, nc]);
      }
      return out;
    }

    // 首翻安全：首翻格及其邻域不放雷（放不下时仅保护首翻格本身）
    function placeMines(state, safeR, safeC) {
      const s = cloneState(state);
      const cells = [];
      for (let r = 0; r < s.rows; r++) for (let c = 0; c < s.cols; c++) cells.push([r, c]);
      let forbidden = new Set([safeR + ',' + safeC, ...neighbors(s, safeR, safeC).map(([r, c]) => r + ',' + c)]);
      if (cells.length - forbidden.size < s.mines) forbidden = new Set([safeR + ',' + safeC]);
      const pool = cells.filter(([r, c]) => !forbidden.has(r + ',' + c));
      // 洗牌后取前 mines 个
      for (let i = pool.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [pool[i], pool[j]] = [pool[j], pool[i]];
      }
      for (let i = 0; i < s.mines; i++) s.grid[pool[i][0]][pool[i][1]].mine = true;
      for (let r = 0; r < s.rows; r++) for (let c = 0; c < s.cols; c++) {
        s.grid[r][c].n = neighbors(s, r, c).filter(([nr, nc]) => s.grid[nr][nc].mine).length;
      }
      s.minesPlaced = true;
      return s;
    }

    // 翻开：首翻自动布雷；踩雷判负；0 格泛洪展开；展开后判胜
    function reveal(prev, r, c) {
      if (prev.status !== 'playing') return prev;
      if (r < 0 || r >= prev.rows || c < 0 || c >= prev.cols) return prev;
      const cell = prev.grid[r][c];
      if (cell.revealed || cell.flag) return prev;
      let s = prev;
      if (!s.minesPlaced) s = placeMines(s, r, c);
      const cell2 = s.grid[r][c];
      if (cell2.mine) {
        const out = cloneState(s);
        out.grid[r][c].exploded = true;
        for (let rr = 0; rr < out.rows; rr++) for (let cc = 0; cc < out.cols; cc++) {
          if (out.grid[rr][cc].mine) out.grid[rr][cc].revealed = true;
        }
        out.status = 'lost';
        return out;
      }
      const out = cloneState(s);
      const stack = [[r, c]];
      while (stack.length) {
        const [cr, cc] = stack.pop();
        const cell3 = out.grid[cr][cc];
        if (cell3.revealed || cell3.flag || cell3.mine) continue;
        cell3.revealed = true;
        out.revealedCount++;
        if (cell3.n === 0) {
          for (const [nr, nc] of neighbors(out, cr, cc)) {
            if (!out.grid[nr][nc].revealed) stack.push([nr, nc]);
          }
        }
      }
      if (out.revealedCount === out.rows * out.cols - out.mines) out.status = 'won';
      return out;
    }

    // 标旗/取消标旗（仅在未翻开格上）
    function toggleFlag(prev, r, c) {
      if (prev.status !== 'playing') return prev;
      if (r < 0 || r >= prev.rows || c < 0 || c >= prev.cols) return prev;
      const cell = prev.grid[r][c];
      if (cell.revealed) return prev;
      const s = cloneState(prev);
      s.grid[r][c].flag = !s.grid[r][c].flag;
      s.flagCount += s.grid[r][c].flag ? 1 : -1;
      return s;
    }

    // 快速展开（chord）：已翻开数字格周围旗数=数字时，翻开其余邻格
    function chord(prev, r, c) {
      if (prev.status !== 'playing') return prev;
      const cell = prev.grid[r] && prev.grid[r][c];
      if (!cell || !cell.revealed || cell.n === 0) return prev;
      const flags = neighbors(prev, r, c).filter(([nr, nc]) => prev.grid[nr][nc].flag).length;
      if (flags !== cell.n) return prev;
      let s = prev;
      for (const [nr, nc] of neighbors(prev, r, c)) {
        const nc2 = s.grid[nr][nc];
        if (!nc2.revealed && !nc2.flag) {
          s = reveal(s, nr, nc);
          if (s.status !== 'playing') break;
        }
      }
      return s;
    }
    // ===ENGINE-END===

    // ============================================================
    // 共享开合状态（composer 按钮 ↔ overlay 悬浮窗）
    // ============================================================
    const openState = { open: false, listeners: new Set() };
    function setOpen(v) {
      openState.open = v;
      openState.listeners.forEach(fn => fn(v));
    }
    function useOpen() {
      const [open, set] = React.useState(openState.open);
      React.useEffect(() => {
        openState.listeners.add(set);
        return () => { openState.listeners.delete(set); };
      }, []);
      return [open, setOpen];
    }

    // ============================================================
    // 工具栏按钮（conversation.input.right）
    // ============================================================
    function MineButton() {
      const [open, set] = useOpen();
      return h('button', {
        type: 'button',
        title: open ? '关闭排雷悬浮窗' : '打开排雷悬浮窗',
        onClick: () => set(!open),
        style: {
          border: 'none',
          background: 'transparent',
          color: 'var(--dsw-alias-label-secondary)',
          cursor: 'pointer',
          fontSize: '17px',
          lineHeight: 1,
          padding: '4px 6px',
          borderRadius: '6px',
        },
        onMouseEnter: e => { e.currentTarget.style.background = 'var(--dsw-alias-interactive-bg-hover)'; },
        onMouseLeave: e => { e.currentTarget.style.background = 'transparent'; },
      }, '✺');
    }

    // ============================================================
    // 悬浮窗（shell.overlay）：可拖动 + 完整游戏
    // ============================================================
    const CSS = `
.mfw-root { position: fixed; z-index: 60; max-width: calc(100vw - 24px);
  background: var(--dsw-alias-bg-overlay); color: var(--dsw-alias-label-primary);
  border: 1px solid var(--dsw-alias-border-l2); border-radius: 12px;
  box-shadow: 0 12px 40px rgba(0,0,0,.35); overflow: hidden;
  font-family: inherit; }
.mfw-titlebar { display: flex; align-items: center; gap: 8px; padding: 8px 12px;
  background: var(--dsw-alias-bg-layer-1); border-bottom: 1px solid var(--dsw-alias-border-l1);
  cursor: move; user-select: none; touch-action: none; }
.mfw-titlebar .t { flex: 1; font-size: 13px; font-weight: 600; color: var(--dsw-alias-label-primary); }
.mfw-close { border: none; background: transparent; color: var(--dsw-alias-label-secondary);
  cursor: pointer; font-size: 16px; line-height: 1; padding: 2px 6px; border-radius: 6px; }
.mfw-close:hover { background: var(--dsw-alias-interactive-bg-hover); color: var(--dsw-alias-label-primary); }
.mfw-body { padding: 10px 12px 12px; display: flex; flex-direction: column; gap: 8px; }
.mfw-hud { display: flex; align-items: center; gap: 10px; }
.mfw-counter { font-size: 15px; font-weight: 700; font-variant-numeric: tabular-nums;
  background: var(--dsw-alias-bg-layer-2); border-radius: 8px; padding: 4px 10px; min-width: 64px; text-align: center; }
.mfw-face { font-size: 18px; line-height: 1; cursor: pointer; border: none; background: var(--dsw-alias-bg-layer-2);
  border-radius: 8px; padding: 4px 12px; }
.mfw-face:hover { background: var(--dsw-alias-interactive-bg-hover); }
.mfw-setup { display: flex; gap: 10px; align-items: center; font-size: 13px; color: var(--dsw-alias-label-secondary); }
.mfw-setup label { display: flex; gap: 5px; align-items: center; }
.mfw-sel { font-size: 13px; padding: 4px 8px; border-radius: 6px; cursor: pointer;
  border: 1px solid var(--dsw-alias-border-l2); background: var(--dsw-alias-bg-layer-2);
  color: var(--dsw-alias-label-primary); }
.mfw-board { display: grid; width: max-content; table-layout: fixed;
  user-select: none; position: relative;
  border: 3px solid #6b4f35; border-radius: 4px; gap: 1px; background: #6b4f35; }
.mfw-sq { display: flex; align-items: center; justify-content: center;
  cursor: pointer; font-weight: 700; line-height: 1; }
.mfw-sq .mfw-cell { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; border-radius: 2px; }
.mfw-sq.covered .mfw-cell { background: #f0d9b5; }
.mfw-sq.covered.dark .mfw-cell { background: #b58863; }
.mfw-sq.covered .mfw-cell:hover { background: #ffe9c4; }
.mfw-sq.covered.dark .mfw-cell:hover { background: #caa07e; }
.mfw-sq.revealed .mfw-cell { background: rgba(176,136,99,.28); cursor: default; }
.mfw-sq.revealed.dark .mfw-cell { background: rgba(240,217,181,.22); }
.mfw-sq.zero .mfw-cell { background: transparent; cursor: default; }
.mfw-sq.mine-hit .mfw-cell { background: #d43a2f; }
.mfw-sq.wrong-flag .mfw-cell { background: #b06a1a; }
.n1 { color: #1d6fd1; } .n2 { color: #2e8b3d; } .n3 { color: #d1342f; } .n4 { color: #6a2fb0; }
.n5 { color: #a04a11; } .n6 { color: #0f8a86; } .n7 { color: #333; } .n8 { color: #777; }
.mfw-flag { font-size: .95em; }
.mfw-note { font-size: 12px; color: var(--dsw-alias-label-tertiary); }
`;

    const NUM_CLASS = ['zero', 'n1', 'n2', 'n3', 'n4', 'n5', 'n6', 'n7', 'n8'];

    function fmtTime(sec) {
      const m = Math.floor(sec / 60), s = sec % 60;
      return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    }

    function MineFloatWindow() {
      const [open, set] = useOpen();
      const [game, setGame] = React.useState(() => newGame('beginner'));
      const [elapsed, setElapsed] = React.useState(0);
      const [pos, setPos] = React.useState(() => ({
        x: Math.max(12, Math.round(window.innerWidth - 420 - 48)),
        y: Math.max(12, Math.round(window.innerHeight * 0.18)),
      }));
      const dragRef = React.useRef(null);

      // 计时：从首次翻开开始，到终局停止
      React.useEffect(() => {
        if (!open || game.status !== 'playing' || !game.minesPlaced) { return; }
        const t = setInterval(() => setElapsed(e => e + 1), 1000);
        return () => clearInterval(t);
      }, [open, game.status, game.minesPlaced]);

      const restart = (level) => {
        setGame(newGame(level || game.level));
        setElapsed(0);
      };

      const onPointerDown = (e) => {
        if (e.target.closest('.mfw-close')) return;
        dragRef.current = { dx: e.clientX - pos.x, dy: e.clientY - pos.y };
        e.currentTarget.setPointerCapture(e.pointerId);
      };
      const onPointerMove = (e) => {
        const d = dragRef.current;
        if (!d) return;
        const x = Math.min(Math.max(0, e.clientX - d.dx), Math.max(0, window.innerWidth - 80));
        const y = Math.min(Math.max(0, e.clientY - d.dy), Math.max(0, window.innerHeight - 48));
        setPos({ x, y });
      };
      const onPointerUp = () => { dragRef.current = null; };

      if (!open) return null;

      const s = game;
      const cellPx = s.cols <= 10 ? 32 : s.cols <= 16 ? 26 : 20;
      const boardW = cellPx * s.cols + (s.cols - 1) + 6 + 24 + 2; // 格子+间隙+棋盘边框+body内边距+窗边框

      const squares = [];
      for (let r = 0; r < s.rows; r++) for (let c = 0; c < s.cols; c++) {
        const cell = s.grid[r][c];
        const cls = ['mfw-sq', cell.revealed ? 'revealed' : 'covered', (r + c) % 2 ? 'dark' : 'light'];
        if (s.status === 'lost' && cell.exploded) cls.push('mine-hit');
        let content = null;
        if (cell.revealed) {
          if (cell.mine) {
            content = '💣';
            if (s.status === 'lost' && !cell.exploded && cell.flag) cls.push('wrong-flag');
          } else if (cell.n > 0) {
            content = String(cell.n);
          }
        } else if (cell.flag) {
          if (s.status === 'lost' && !cell.mine) { content = '❌'; }
          else content = '🚩';
        }
        squares.push(h('div', {
          key: r + '-' + c, className: cls.join(' '),
          style: {
            width: cellPx + 'px', height: cellPx + 'px',
            gridRow: r + 1, gridColumn: c + 1,
            fontSize: Math.round(cellPx * 0.55) + 'px',
          },
          onClick: () => setGame(g => reveal(g, r, c)),
          onContextMenu: (e) => { e.preventDefault(); setGame(g => toggleFlag(g, r, c)); },
          onDoubleClick: () => setGame(g => chord(g, r, c)),
        }, h('span', { className: 'mfw-cell' + (cell.revealed && !cell.mine && cell.n > 0 ? ' ' + NUM_CLASS[cell.n] : '') }, content)));
      }

      const face = s.status === 'won' ? '😎' : s.status === 'lost' ? '💥' : '🙂';
      const statusLine = s.status === 'won'
        ? `🎉 胜利！用时 ${fmtTime(elapsed)}`
        : s.status === 'lost'
          ? '💥 踩雷了 — 点中间按钮重开'
          : s.minesPlaced ? '左键翻开 · 右键标旗 · 双击数字快速展开' : '左键翻开任意格开始（首翻保证安全）';

      return h('div', { className: 'mfw-root', style: { left: pos.x + 'px', top: pos.y + 'px', width: boardW + 'px' } },
        h('style', null, CSS),
        h('div', {
          className: 'mfw-titlebar',
          onPointerDown, onPointerMove, onPointerUp,
        },
          h('span', { className: 't' }, '💣 排雷（Minesweeper）'),
          h('button', { type: 'button', className: 'mfw-close', title: '关闭', onClick: () => set(false) }, '✕'),
        ),
        h('div', { className: 'mfw-body' },
          h('div', { className: 'mfw-setup' },
            h('label', null, '难度',
              h('select', {
                className: 'mfw-sel', value: s.level,
                onChange: e => restart(e.target.value),
              },
                Object.entries(LEVELS).map(([k, L]) => h('option', { key: k, value: k }, L.label)))),
          ),
          h('div', { className: 'mfw-hud' },
            h('div', { className: 'mfw-counter', title: '剩余雷数（总雷−旗数）' }, `💣 ${s.mines - s.flagCount}`),
            h('button', { type: 'button', className: 'mfw-face', title: '重新开始', onClick: () => restart() }, face),
            h('div', { className: 'mfw-counter', title: '用时' }, '⏱ ' + fmtTime(elapsed)),
          ),
          h('div', { className: 'mfw-note' }, statusLine),
          h('div', {
            className: 'mfw-board',
            style: { gridTemplateColumns: `repeat(${s.cols}, ${cellPx}px)`, gridTemplateRows: `repeat(${s.rows}, ${cellPx}px)` },
          }, squares),
        ),
      );
    }

    return {
      inject: ['slots'],
      apply(ctx) {
        const disposers = [];
        disposers.push(ctx.slots.inject('conversation.input.right', () => ctx.slots.register({
          name: 'conversation.input.right', id: 'mine-float-button', order: 91,
        }, MineButton)));
        disposers.push(ctx.slots.inject('shell.overlay', () => ctx.slots.register({
          name: 'shell.overlay', id: 'mine-float-window', order: 91,
        }, MineFloatWindow)));
        return () => disposers.forEach(d => { try { d(); } catch (_) {} });
      },
    };
  },
});
