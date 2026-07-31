import { useEffect, useMemo, useState } from 'react';

type Health = { ok: true; data: { service: string; status: string } };
type Mode = 'human-vs-llm' | 'llm-vs-llm';
type Side = 'red' | 'black';

type Piece = {
  id: string;
  side: Side;
  label: string;
  file: number;
  rank: number;
};

const files = ['一', '二', '三', '四', '五', '六', '七', '八', '九'];
const initialPieces: Piece[] = [
  ['r-rook-1', 'red', '车', 0, 9], ['r-horse-1', 'red', '马', 1, 9], ['r-elephant-1', 'red', '相', 2, 9], ['r-advisor-1', 'red', '仕', 3, 9], ['r-general', 'red', '帅', 4, 9], ['r-advisor-2', 'red', '仕', 5, 9], ['r-elephant-2', 'red', '相', 6, 9], ['r-horse-2', 'red', '马', 7, 9], ['r-rook-2', 'red', '车', 8, 9],
  ['r-cannon-1', 'red', '炮', 1, 7], ['r-cannon-2', 'red', '炮', 7, 7],
  ['r-pawn-1', 'red', '兵', 0, 6], ['r-pawn-2', 'red', '兵', 2, 6], ['r-pawn-3', 'red', '兵', 4, 6], ['r-pawn-4', 'red', '兵', 6, 6], ['r-pawn-5', 'red', '兵', 8, 6],
  ['b-rook-1', 'black', '車', 0, 0], ['b-horse-1', 'black', '馬', 1, 0], ['b-elephant-1', 'black', '象', 2, 0], ['b-advisor-1', 'black', '士', 3, 0], ['b-general', 'black', '將', 4, 0], ['b-advisor-2', 'black', '士', 5, 0], ['b-elephant-2', 'black', '象', 6, 0], ['b-horse-2', 'black', '馬', 7, 0], ['b-rook-2', 'black', '車', 8, 0],
  ['b-cannon-1', 'black', '砲', 1, 2], ['b-cannon-2', 'black', '砲', 7, 2],
  ['b-pawn-1', 'black', '卒', 0, 3], ['b-pawn-2', 'black', '卒', 2, 3], ['b-pawn-3', 'black', '卒', 4, 3], ['b-pawn-4', 'black', '卒', 6, 3], ['b-pawn-5', 'black', '卒', 8, 3]
].map(([id, side, label, file, rank]) => ({ id: String(id), side: side as Side, label: String(label), file: Number(file), rank: Number(rank) }));

const labels: Record<Mode, string> = {
  'human-vs-llm': '与 LLM 对战',
  'llm-vs-llm': '观看 LLM 对弈'
};

export function App() {
  const [mode, setMode] = useState<Mode>('human-vs-llm');
  const [selectedSide, setSelectedSide] = useState<Side>('red');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [selectedPiece, setSelectedPiece] = useState<string | null>(null);
  const [notice, setNotice] = useState('正在准备标准开局。');

  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/health', { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error('health failed');
        return response.json() as Promise<Health>;
      })
      .then((body) => setStatus(body.ok ? 'ready' : 'error'))
      .catch(() => {
        if (!controller.signal.aborted) setStatus('error');
      });
    return () => controller.abort();
  }, []);

  const currentSideLabel = selectedSide === 'red' ? '红方' : '黑方';
  const subtitle = useMemo(() => mode === 'human-vs-llm'
    ? `你执${currentSideLabel}，等待第一步。`
    : '红黑双方将各自向模型请求着法。', [currentSideLabel, mode]);

  function switchMode(nextMode: Mode) {
    setMode(nextMode);
    setSelectedPiece(null);
    setNotice(nextMode === 'human-vs-llm' ? '已切换为人机对战，请选择执棋方。' : '已切换为观战模式，配置双方模型后即可开局。');
  }

  function selectPiece(piece: Piece) {
    if (mode === 'human-vs-llm' && piece.side !== selectedSide) {
      setNotice(`当前由${currentSideLabel}玩家操作，请选择己方棋子。`);
      return;
    }
    setSelectedPiece(piece.id);
    setNotice(`已选中${piece.side === 'red' ? '红方' : '黑方'}${piece.label}。规则引擎接入后将显示合法落点。`);
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="brand" href="#main-content" aria-label="LLM 象棋主页">
          <span className="brand-seal" aria-hidden="true">棋</span>
          <span><strong>LLM 象棋</strong><small>CHINESE CHESS LAB</small></span>
        </a>
        <div className="topbar-actions">
          <span className={`service-pill service-pill--${status}`} aria-live="polite">
            <i aria-hidden="true" />{status === 'ready' ? '服务已就绪' : status === 'loading' ? '检查服务中' : '服务暂不可用'}
          </span>
          <button className="icon-button" type="button" aria-label="打开模型配置" onClick={() => setIsSettingsOpen(true)}>⚙</button>
        </div>
      </header>

      <section className="hero" aria-labelledby="page-title">
        <div>
          <p className="eyebrow">AI × 楚河汉界</p>
          <h1 id="page-title">让语言模型，下一盘真正的象棋。</h1>
          <p className="hero-copy">规则由确定性引擎裁决，模型只负责在合法着法中做出选择。你可以执子对弈，也可以静观两位模型棋手交锋。</p>
        </div>
        <div className="mode-switch" role="tablist" aria-label="选择对局模式">
          {(Object.keys(labels) as Mode[]).map((item) => (
            <button key={item} type="button" role="tab" aria-selected={mode === item} className={mode === item ? 'is-active' : ''} onClick={() => switchMode(item)}>
              {item === 'human-vs-llm' ? '人机对战' : 'LLM 对弈'}
            </button>
          ))}
        </div>
      </section>

      <section id="main-content" className="game-layout" aria-label="对局区">
        <aside className="player-card player-card--black">
          <div className="player-mark">黑</div>
          <div><p>黑方棋手</p><h2>{mode === 'human-vs-llm' && selectedSide === 'black' ? '你' : '等待配置模型'}</h2></div>
          <span className="turn-badge">后手</span>
        </aside>

        <section className="board-panel" aria-label="中国象棋棋盘">
          <div className="board-frame">
            <div className="board" role="grid" aria-label="标准中国象棋开局，红方在下">
              {Array.from({ length: 90 }, (_, index) => {
                const file = index % 9;
                const rank = Math.floor(index / 9);
                const piece = initialPieces.find((item) => item.file === file && item.rank === rank);
                return (
                  <button
                    className={`board-cell ${piece ? 'board-cell--occupied' : ''}`}
                    key={`${file}-${rank}`}
                    type="button"
                    role="gridcell"
                    aria-label={piece ? `${piece.side === 'red' ? '红方' : '黑方'}${piece.label}，${files[file]}路第${rank + 1}行` : `${files[file]}路第${rank + 1}行空位`}
                    onClick={() => piece && selectPiece(piece)}
                  >
                    {piece && <span className={`piece piece--${piece.side} ${selectedPiece === piece.id ? 'piece--selected' : ''}`}>{piece.label}</span>}
                  </button>
                );
              })}
              <div className="river" aria-hidden="true"><span>楚 河</span><span>漢 界</span></div>
              <div className="palace palace--black" aria-hidden="true" />
              <div className="palace palace--red" aria-hidden="true" />
            </div>
          </div>
          <p className="board-caption">红方在下 · 标准开局 · 当前规则引擎适配准备中</p>
        </section>

        <aside className="player-card player-card--red">
          <div className="player-mark">红</div>
          <div><p>红方棋手</p><h2>{mode === 'human-vs-llm' && selectedSide === 'red' ? '你' : '等待配置模型'}</h2></div>
          <span className="turn-badge turn-badge--current">先手</span>
        </aside>

        <section className="control-card" aria-labelledby="control-title">
          <div className="control-heading"><div><p className="eyebrow">当前对局</p><h2 id="control-title">{labels[mode]}</h2></div><span className="round-count">第 0 / 200 回合</span></div>
          <p className="control-subtitle">{subtitle}</p>
          {mode === 'human-vs-llm' && <div className="side-picker" aria-label="选择玩家执棋方"><span>执棋方</span>{(['red', 'black'] as Side[]).map((side) => <button type="button" key={side} className={selectedSide === side ? `side-button side-button--${side} is-active` : `side-button side-button--${side}`} onClick={() => { setSelectedSide(side); setNotice(`已选择${side === 'red' ? '红方' : '黑方'}。`); }}>{side === 'red' ? '红方' : '黑方'}</button>)}</div>}
          <div className="control-actions"><button type="button" className="primary-button" onClick={() => setIsSettingsOpen(true)}>配置模型后开局 <span aria-hidden="true">→</span></button><button type="button" className="secondary-button" onClick={() => setNotice('棋局尚未开始，可先配置模型连接信息。')}>重新开始</button></div>
          <div className="notice" role="status" aria-live="polite"><span aria-hidden="true">✦</span>{notice}</div>
        </section>
      </section>

      <section className="principles" aria-label="产品原则"><article><span>01</span><h2>规则优先</h2><p>合法走法、将军与终局，都由规则引擎裁决。</p></article><article><span>02</span><h2>密钥不留存</h2><p>你的 API Key 仅用于当前会话，不写入棋谱。</p></article><article><span>03</span><h2>棋评可见</h2><p>展示的是模型公开短评，不是隐藏推理过程。</p></article></section>

      {isSettingsOpen && <div className="modal-backdrop" role="presentation" onMouseDown={() => setIsSettingsOpen(false)}><section className="settings-modal" role="dialog" aria-modal="true" aria-labelledby="settings-title" onMouseDown={(event) => event.stopPropagation()}><button className="modal-close" type="button" aria-label="关闭模型配置" onClick={() => setIsSettingsOpen(false)}>×</button><p className="eyebrow">连接配置</p><h2 id="settings-title">配置模型棋手</h2><p>运行时仅在当前页面会话中使用 API Key；刷新后需要重新填写。</p><div className="setting-grid"><label>服务商<select defaultValue="custom"><option value="custom">OpenAI 兼容接口</option><option value="openai">OpenAI</option><option value="deepseek">DeepSeek</option><option value="siliconflow">SiliconFlow</option></select></label><label>模型名称<input placeholder="例如：deepseek-chat" autoComplete="off" /></label><label className="span-all">Base URL<input placeholder="https://api.example.com/v1" inputMode="url" autoComplete="off" /></label><label className="span-all">API Key<input type="password" placeholder="仅保留在当前会话内" autoComplete="off" /></label></div><button type="button" className="primary-button" onClick={() => { setIsSettingsOpen(false); setNotice('配置草稿已关闭。模型网关接入后将校验并只在当前请求中使用密钥。'); }}>保存本次会话配置</button></section></div>}
    </main>
  );
}
