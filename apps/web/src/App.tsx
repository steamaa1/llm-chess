import { useEffect, useMemo, useState } from 'react';
import { createInitialPieces, gameResult, legalMovesForPiece, makeMove, type GamePiece, type GameResult, type Move } from '@llm-chess/xiangqi-core';

type Health = { ok: true; data: { service: string; status: string } };
type Mode = 'human-vs-llm' | 'llm-vs-llm';
type Side = 'red' | 'black';
type ProviderId = 'custom' | 'openai' | 'deepseek' | 'siliconflow';
type SavedModelProfile = { provider: ProviderId; model: string; baseUrl: string };
type ModelProfiles = Record<Side, SavedModelProfile>;
type SessionKeys = Record<Side, string>;
type DraftConfig = SavedModelProfile & { apiKey: string };

const STORAGE_KEY = 'llm-chess:model-profiles:v1';
const DEFAULT_PROFILE: SavedModelProfile = { provider: 'deepseek', model: 'deepseek-chat', baseUrl: 'https://api.deepseek.com/v1' };
const PROVIDERS: Record<ProviderId, { label: string; baseUrl: string; model: string }> = {
  custom: { label: 'OpenAI 兼容接口', baseUrl: '', model: '' },
  openai: { label: 'OpenAI', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4.1-mini' },
  deepseek: { label: 'DeepSeek', baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat' },
  siliconflow: { label: '硅基流动', baseUrl: 'https://api.siliconflow.cn/v1', model: 'deepseek-ai/DeepSeek-V3' }
};

const files = ['一', '二', '三', '四', '五', '六', '七', '八', '九'];

const labels: Record<Mode, string> = { 'human-vs-llm': '与 LLM 对战', 'llm-vs-llm': '观看 LLM 对弈' };

function isProfile(value: unknown): value is SavedModelProfile {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<SavedModelProfile>;
  return typeof candidate.provider === 'string' && candidate.provider in PROVIDERS && typeof candidate.model === 'string' && typeof candidate.baseUrl === 'string';
}

function readProfiles(): ModelProfiles {
  try {
    const value: unknown = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? '');
    if (value && typeof value === 'object') {
      const candidate = value as Partial<ModelProfiles>;
      if (isProfile(candidate.red) && isProfile(candidate.black)) return { red: candidate.red, black: candidate.black };
    }
  } catch { /* Malformed browser storage is safely ignored. */ }
  return { red: DEFAULT_PROFILE, black: DEFAULT_PROFILE };
}

function profileName(profile: SavedModelProfile) {
  return profile.model || PROVIDERS[profile.provider].label;
}

function BoardLines() {
  const verticals = Array.from({ length: 9 }, (_, index) => index * 100);
  const horizontals = Array.from({ length: 10 }, (_, index) => index * 100);
  return <svg className="board-lines" viewBox="0 0 800 900" preserveAspectRatio="none" aria-hidden="true">
    {horizontals.map((y) => <line key={`h-${y}`} x1="0" y1={y} x2="800" y2={y} />)}
    {verticals.map((x) => <g key={`v-${x}`}><line x1={x} y1="0" x2={x} y2="400" /><line x1={x} y1="500" x2={x} y2="900" /></g>)}
    <line x1="300" y1="0" x2="500" y2="200" /><line x1="500" y1="0" x2="300" y2="200" />
    <line x1="300" y1="700" x2="500" y2="900" /><line x1="500" y1="700" x2="300" y2="900" />
  </svg>;
}

export function App() {
  const [mode, setMode] = useState<Mode>('human-vs-llm');
  const [selectedSide, setSelectedSide] = useState<Side>('red');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [editingSide, setEditingSide] = useState<Side>('red');
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [selectedPiece, setSelectedPiece] = useState<string | null>(null);
  const [pieces, setPieces] = useState<GamePiece[]>(createInitialPieces);
  const [turn, setTurn] = useState<Side>('red');
  const [result, setResult] = useState<GameResult>('playing');
  const [history, setHistory] = useState<Move[]>([]);
  const [notice, setNotice] = useState('红方先行，请选择一枚红方棋子。');
  const [profiles, setProfiles] = useState<ModelProfiles>(readProfiles);
  const [sessionKeys, setSessionKeys] = useState<SessionKeys>({ red: '', black: '' });
  const [draft, setDraft] = useState<DraftConfig>(() => ({ ...readProfiles().red, apiKey: '' }));
  const [formError, setFormError] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/health', { signal: controller.signal }).then(async (response) => {
      if (!response.ok) throw new Error('health failed');
      return response.json() as Promise<Health>;
    }).then((body) => setStatus(body.ok ? 'ready' : 'error')).catch(() => {
      if (!controller.signal.aborted) setStatus('error');
    });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') setIsSettingsOpen(false); };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const currentSideLabel = selectedSide === 'red' ? '红方' : '黑方';
  const subtitle = useMemo(() => mode === 'human-vs-llm' ? `你执${currentSideLabel}，等待第一步。` : '红黑双方将各自向模型请求着法。', [currentSideLabel, mode]);

  function openSettings(side: Side = mode === 'human-vs-llm' ? (selectedSide === 'red' ? 'black' : 'red') : 'red') {
    setEditingSide(side);
    setDraft({ ...profiles[side], apiKey: sessionKeys[side] });
    setFormError('');
    setIsSettingsOpen(true);
  }

  function switchMode(nextMode: Mode) {
    setMode(nextMode); setSelectedPiece(null);
    setNotice(nextMode === 'human-vs-llm' ? '已切换为人机对战，请选择执棋方。' : '已切换为观战模式，配置红黑双方模型后即可开局。');
  }

  const legalTargets = useMemo(() => selectedPiece ? legalMovesForPiece(pieces, selectedPiece) : [], [pieces, selectedPiece]);
  const gameOver = result !== 'playing';

  function describeResult(nextResult: GameResult) {
    if (nextResult === 'red_wins_checkmate') return '将死！红方胜利。';
    if (nextResult === 'black_wins_checkmate') return '将死！黑方胜利。';
    if (nextResult === 'red_wins_stalemate') return '困毙！红方胜利。';
    if (nextResult === 'black_wins_stalemate') return '困毙！黑方胜利。';
    return '';
  }

  function commitMove(move: Move) {
    if (gameOver) return;
    const nextPieces = makeMove(pieces, move); const nextTurn = turn === 'red' ? 'black' : 'red'; const nextResult = gameResult(nextPieces, nextTurn);
    setPieces(nextPieces); setTurn(nextTurn); setResult(nextResult); setHistory((current) => [...current, move]); setSelectedPiece(null);
    setNotice(nextResult === 'playing' ? `${move.notation}${move.captureId ? '，吃子' : ''}${move.givesCheck ? '，将军！' : ''} 现在轮到${nextTurn === 'red' ? '红方' : '黑方'}走棋。` : describeResult(nextResult));
  }

  function selectPiece(piece: GamePiece) {
    if (gameOver) { setNotice(describeResult(result)); return; }
    const targetMove = legalTargets.find((move) => move.to.file === piece.file && move.to.rank === piece.rank);
    if (targetMove) { commitMove(targetMove); return; }
    if (piece.side !== turn) { setNotice(`现在轮到${turn === 'red' ? '红方' : '黑方'}走棋。`); return; }
    if (mode === 'human-vs-llm' && piece.side !== selectedSide) { setNotice(`当前由${currentSideLabel}玩家操作，请选择己方棋子。`); return; }
    const moves = legalMovesForPiece(pieces, piece.id);
    setSelectedPiece(piece.id); setNotice(moves.length ? `已选中${piece.side === 'red' ? '红方' : '黑方'}${piece.label}，亮点为合法落点。` : '该棋子当前没有合法走法。');
  }

  function resetGame() { setPieces(createInitialPieces()); setTurn('red'); setResult('playing'); setHistory([]); setSelectedPiece(null); setNotice('已恢复标准开局，红方先行。'); }

  function undoMove() {
    if (!history.length) { setNotice('当前没有可以撤销的走法。'); return; }
    const nextHistory = history.slice(0, -1); let restored = createInitialPieces();
    nextHistory.forEach((move) => { restored = makeMove(restored, move); });
    const nextTurn: Side = nextHistory.length % 2 === 0 ? 'red' : 'black';
    setPieces(restored); setHistory(nextHistory); setTurn(nextTurn); setResult(gameResult(restored, nextTurn)); setSelectedPiece(null);
    setNotice(`已撤销一步，现在轮到${nextTurn === 'red' ? '红方' : '黑方'}走棋。`);
  }

  function selectProvider(provider: ProviderId) {
    const preset = PROVIDERS[provider];
    setDraft((current) => ({ ...current, provider, baseUrl: preset.baseUrl || current.baseUrl, model: preset.model || current.model }));
    setFormError('');
  }

  function saveProfile() {
    const baseUrl = draft.baseUrl.trim().replace(/\/$/, '');
    const model = draft.model.trim();
    if (!model) { setFormError('请填写模型名称。'); return; }
    try {
      const url = new URL(baseUrl);
      if (url.protocol !== 'https:') throw new Error('not https');
    } catch { setFormError('Base URL 必须是有效的 HTTPS 地址。'); return; }
    const nextProfile = { provider: draft.provider, model, baseUrl };
    const nextProfiles = { ...profiles, [editingSide]: nextProfile };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(nextProfiles));
    setProfiles(nextProfiles);
    setSessionKeys((current) => ({ ...current, [editingSide]: draft.apiKey.trim() }));
    setIsSettingsOpen(false);
    setNotice(`${editingSide === 'red' ? '红方' : '黑方'}供应商已保存为「${PROVIDERS[draft.provider].label} / ${model}」。${draft.apiKey.trim() ? 'API Key 仅保存在本次会话内。' : '尚未填写 API Key。'}`);
  }

  function switchEditingSide(side: Side) {
    setEditingSide(side); setDraft({ ...profiles[side], apiKey: sessionKeys[side] }); setFormError('');
  }

  return <main className="app-shell">
    <header className="topbar"><a className="brand" href="#main-content" aria-label="LLM 象棋主页"><span className="brand-seal" aria-hidden="true">棋</span><span><strong>LLM 象棋</strong><small>CHINESE CHESS LAB</small></span></a><div className="topbar-actions"><span className={`service-pill service-pill--${status}`} aria-live="polite"><i aria-hidden="true" />{status === 'ready' ? '服务已就绪' : status === 'loading' ? '检查服务中' : '服务暂不可用'}</span><button className="icon-button" type="button" aria-label="打开模型配置" onClick={() => openSettings()}>⚙</button></div></header>

    <section className="hero" aria-labelledby="page-title"><div><p className="eyebrow">AI × 楚河汉界</p><h1 id="page-title">让语言模型，下一盘真正的象棋。</h1><p className="hero-copy">规则由确定性引擎裁决，模型只在合法着法中做出选择。你可以执子对弈，也可以静观两位模型棋手交锋。</p></div><div className="mode-switch" role="tablist" aria-label="选择对局模式">{(Object.keys(labels) as Mode[]).map((item) => <button key={item} type="button" role="tab" aria-selected={mode === item} className={mode === item ? 'is-active' : ''} onClick={() => switchMode(item)}>{item === 'human-vs-llm' ? '人机对战' : 'LLM 对弈'}</button>)}</div></section>

    <section id="main-content" className="game-layout" aria-label="对局区">
      <aside className="player-card player-card--black"><div className="player-mark">黑</div><div><p>黑方棋手</p><h2>{mode === 'human-vs-llm' && selectedSide === 'black' ? '你' : profileName(profiles.black)}</h2><button className="profile-link" type="button" onClick={() => openSettings('black')}>配置黑方模型</button></div><span className="turn-badge">后手</span></aside>
      <section className="board-panel" aria-label="中国象棋棋盘"><div className="board-frame"><div className="board" role="application" aria-label="标准中国象棋开局，红方在下"><BoardLines /><div className="river" aria-hidden="true"><span>楚 河</span><span>漢 界</span></div>{legalTargets.map((move) => <button key={`target-${move.to.file}-${move.to.rank}`} className="legal-target" style={{ left: `${move.to.file * 12.5}%`, top: `${move.to.rank * (100 / 9)}%` }} type="button" aria-label={`走到${files[move.to.file]}路第${move.to.rank + 1}行`} onClick={() => commitMove(move)}><span /></button>)}{pieces.map((piece) => <button key={piece.id} className={`piece piece--${piece.side} ${selectedPiece === piece.id ? 'piece--selected' : ''}`} style={{ left: `${piece.file * 12.5}%`, top: `${piece.rank * (100 / 9)}%` }} type="button" aria-label={`${piece.side === 'red' ? '红方' : '黑方'}${piece.label}，${files[piece.file]}路第${piece.rank + 1}行`} aria-pressed={selectedPiece === piece.id} onClick={() => selectPiece(piece)}>{piece.label}</button>)}</div></div><p className="board-caption">红方在下 · 标准开局 · 点击棋子查看合法落点</p></section>
      <aside className="player-card player-card--red"><div className="player-mark">红</div><div><p>红方棋手</p><h2>{mode === 'human-vs-llm' && selectedSide === 'red' ? '你' : profileName(profiles.red)}</h2><button className="profile-link" type="button" onClick={() => openSettings('red')}>配置红方模型</button></div><span className="turn-badge turn-badge--current">先手</span></aside>
      <section className="control-card" aria-labelledby="control-title"><div className="control-heading"><div><p className="eyebrow">当前对局</p><h2 id="control-title">{labels[mode]}</h2></div><span className={`round-count ${gameOver ? 'round-count--finished' : ''}`}>{gameOver ? describeResult(result) : `第 ${Math.ceil(history.length / 2) || 1} 回合 · ${turn === 'red' ? '红方走' : '黑方走'}`}</span></div><p className="control-subtitle">{subtitle}</p>{mode === 'human-vs-llm' && <div className="side-picker" aria-label="选择玩家执棋方"><span>执棋方</span>{(['red', 'black'] as Side[]).map((side) => <button type="button" key={side} className={selectedSide === side ? `side-button side-button--${side} is-active` : `side-button side-button--${side}`} onClick={() => { setSelectedSide(side); setNotice(`已选择${side === 'red' ? '红方' : '黑方'}。`); }}>{side === 'red' ? '红方' : '黑方'}</button>)}</div>}<div className="control-actions"><button type="button" className="primary-button" onClick={() => openSettings()}>配置模型后开局 <span aria-hidden="true">→</span></button><button type="button" className="secondary-button" disabled={!history.length} onClick={undoMove}>撤销一步</button><button type="button" className="secondary-button" onClick={resetGame}>重新开始</button></div><div className="move-history" aria-label="本局棋谱">{history.length ? history.slice(-8).map((move, index) => <span key={`${move.pieceId}-${index}`}>{move.notation}{move.givesCheck ? '+' : ''}</span>) : <span>棋谱会显示在这里</span>}</div><div className="notice" role="status" aria-live="polite"><span aria-hidden="true">✦</span>{notice}</div></section>
    </section>

    <section className="principles" aria-label="产品原则"><article><span>01</span><h2>规则优先</h2><p>合法走法、将军与终局，都由规则引擎裁决。</p></article><article><span>02</span><h2>密钥不留存</h2><p>仅保存供应商、模型和 Base URL；Key 只在当前会话内。</p></article><article><span>03</span><h2>双边配置</h2><p>红黑双方可分别选择模型，也可使用同一服务商。</p></article></section>

    {isSettingsOpen && <div className="modal-backdrop" role="presentation" onMouseDown={() => setIsSettingsOpen(false)}><section className="settings-modal" role="dialog" aria-modal="true" aria-labelledby="settings-title" onMouseDown={(event) => event.stopPropagation()}><button className="modal-close" type="button" aria-label="关闭模型配置" onClick={() => setIsSettingsOpen(false)}>×</button><p className="eyebrow">连接配置</p><h2 id="settings-title">保存模型供应商</h2><p>服务商、模型名、Base URL 会安全保存到此浏览器；API Key <strong>永不写入本地存储</strong>，刷新页面后需重新填写。</p><div className="config-side-tabs" role="tablist" aria-label="选择要配置的一方">{(['red', 'black'] as Side[]).map((side) => <button type="button" role="tab" aria-selected={editingSide === side} className={editingSide === side ? `is-active side-${side}` : `side-${side}`} key={side} onClick={() => switchEditingSide(side)}>{side === 'red' ? '红方模型' : '黑方模型'}</button>)}</div><div className="setting-grid"><label>服务商<select value={draft.provider} onChange={(event) => selectProvider(event.target.value as ProviderId)}>{(Object.keys(PROVIDERS) as ProviderId[]).map((provider) => <option value={provider} key={provider}>{PROVIDERS[provider].label}</option>)}</select></label><label>模型名称<input value={draft.model} onChange={(event) => setDraft((current) => ({ ...current, model: event.target.value }))} placeholder="例如：deepseek-chat" autoComplete="off" /></label><label className="span-all">Base URL<input value={draft.baseUrl} onChange={(event) => setDraft((current) => ({ ...current, baseUrl: event.target.value }))} placeholder="https://api.example.com/v1" inputMode="url" autoComplete="off" /></label><label className="span-all">API Key <span className="field-hint">仅限当前会话，可留空后稍后填写</span><input type="password" value={draft.apiKey} onChange={(event) => setDraft((current) => ({ ...current, apiKey: event.target.value }))} placeholder="不会保存到浏览器" autoComplete="off" /></label></div>{formError && <p className="form-error" role="alert">{formError}</p>}<button type="button" className="primary-button" onClick={saveProfile}>保存 {editingSide === 'red' ? '红方' : '黑方'}供应商</button></section></div>}
  </main>;
}
