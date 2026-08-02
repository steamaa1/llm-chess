import { useEffect, useMemo, useState, type ChangeEvent, type DragEvent } from 'react';
import { requestLlmMove, LlmRequestError, type LlmMemory } from './llmClient.js';
import { allLegalMoves, createInitialPieces, gameResult, legalMovesForPiece, makeMove, positionKey, type GamePiece, type GameResult, type Move } from '@llm-chess/xiangqi-core';

type Health = { ok: true; data: { service: string; status: string } };
type Mode = 'human-vs-llm' | 'llm-vs-llm';
type Side = 'red' | 'black';
type ProviderId = 'custom' | 'openai' | 'deepseek' | 'siliconflow';
type SavedModelProfile = { provider: ProviderId; model: string; baseUrl: string };
type ModelProfiles = Record<Side, SavedModelProfile>;
type SessionKeys = Record<Side, string>;
type DraftConfig = SavedModelProfile & { apiKey: string };
type View = 'game' | 'analysis';
type AnalysisEvent = { id: string; side: Side; move?: string; commentary?: string; status: 'requesting' | 'success' | 'error'; detail: string; at: string; promptTokens?: number; completionTokens?: number; modelOutput?: string };
type StoredGame = { schemaVersion: 1; id?: string; name?: string; savedAt: string; result: GameResult; moves: Move[]; analysis: AnalysisEvent[] };

const STORAGE_KEY = 'llm-chess:model-profiles:v1';
const GAMES_KEY = 'llm-chess:games:v1';
const MEMORY_KEY = 'llm-chess:lessons:v1';
const ENCRYPTED_API_KEY = 'llm-chess:api-keys:v1';
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

function base64url(buffer: ArrayBuffer) { return btoa(String.fromCharCode(...new Uint8Array(buffer))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
function parseBase64url(value: string) { return Uint8Array.from(atob(value.replace(/-/g, '+').replace(/_/g, '/')), (char) => char.charCodeAt(0)).buffer; }

async function readApiKeys(): Promise<SessionKeys> {
  const keys: SessionKeys = { red: '', black: '' };
  async function decryptRaw(raw: string): Promise<Partial<Record<Side, string>>> {
    const parsed = JSON.parse(raw) as { iv: string; data: string; key: string };
    if (!parsed.iv || !parsed.data || !parsed.key) throw new Error('format');
    const iv = new Uint8Array(parseBase64url(parsed.iv));
    const encrypted = new Uint8Array(parseBase64url(parsed.data));
    const secret = await crypto.subtle.importKey('raw', parseBase64url(parsed.key), { name: 'AES-GCM' }, false, ['decrypt']);
    const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, secret, encrypted);
    return JSON.parse(new TextDecoder().decode(decrypted)) as Partial<Record<Side, string>>;
  }
  try { const legacy = window.localStorage.getItem(ENCRYPTED_API_KEY); if (legacy) { const json = await decryptRaw(legacy); if (typeof json.red === 'string') keys.red = json.red; if (typeof json.black === 'string') keys.black = json.black; } } catch { /* ignore legacy */ }
  for (const side of ['red', 'black'] as Side[]) {
    try {
      const raw = window.localStorage.getItem(`${ENCRYPTED_API_KEY}:${side}`);
      if (raw) { const json = await decryptRaw(raw); if (typeof json[side] === 'string') keys[side] = json[side]; }
    } catch { /* per-side storage missing or corrupt */ }
  }
  return keys;
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

function readSavedGames(): StoredGame[] {
  try { const value: unknown = JSON.parse(window.localStorage.getItem(GAMES_KEY) ?? '[]'); return Array.isArray(value) ? (value as StoredGame[]).slice(0, 30) : []; }
  catch { return []; }
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

  useEffect(() => { void (async () => { try { const keys = await readApiKeys(); setSessionKeys((current) => ({ red: current.red || keys.red, black: current.black || keys.black })); } catch { /* crypto or storage unavailable; keys remain session-only */ } })(); }, []);
  const [draft, setDraft] = useState<DraftConfig>(() => ({ ...readProfiles().red, apiKey: '' }));
  const [formError, setFormError] = useState('');
  const [view, setView] = useState<View>('game');
  const [screen, setScreen] = useState<'home' | 'game'>('home');
  const [started, setStarted] = useState(false);
  const [paused, setPaused] = useState(false);
  const [llmBusy, setLlmBusy] = useState(false);
  const [appError, setAppError] = useState<{ code: string; message: string; modelOutput?: string } | null>(null);
  const [analysis, setAnalysis] = useState<AnalysisEvent[]>([]);
  const [gameSeed, setGameSeed] = useState(() => Math.random().toString(36).slice(2, 10));
  const [coachNotes, setCoachNotes] = useState<Record<Side, string>>({ red: '', black: '' });
  const [lastMove, setLastMove] = useState<Move | null>(null);
  const [lastEvent, setLastEvent] = useState<{ side: Side; kind: 'check' | 'capture' | 'undo' | 'info'; text: string } | null>(null);
  const [pendingUndoNotice, setPendingUndoNotice] = useState<string | null>(null);
  const [llmUndoCount, setLlmUndoCount] = useState(0);
  const [gameSpeed, setGameSpeed] = useState<'slow' | 'normal' | 'fast'>('normal');
  const [callCount, setCallCount] = useState(0);
  const [savedGames, setSavedGames] = useState<StoredGame[]>(readSavedGames);
  const [replayIndex, setReplayIndex] = useState<number | null>(null);

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

  useEffect(() => {
    const aiTurn = mode === 'llm-vs-llm' || turn !== selectedSide;
    if (!started || paused || llmBusy || result !== 'playing' || !aiTurn || replayIndex !== null) return;
    const delay = gameSpeed === 'slow' ? 1800 : gameSpeed === 'normal' ? 700 : 120;
    const timer = window.setTimeout(() => {
      const profile = profiles[turn]; const apiKey = sessionKeys[turn];
      if (!apiKey) { setStarted(false); setPaused(true); setAppError({ code: 'API_KEY_MISSING', message: `${turn === 'red' ? '红方' : '黑方'}尚未填写 API Key。` }); return; }
      const eventId = crypto.randomUUID();
      setLlmBusy(true); setAppError(null);
      setAnalysis((current) => [...current, { id: eventId, side: turn, status: 'requesting', detail: `正在请求 ${profile.model} 选择合法着法…`, at: new Date().toISOString() }]);
      let memory: LlmMemory | undefined;
      try { const memories = JSON.parse(localStorage.getItem(MEMORY_KEY) ?? '{}') as Partial<Record<Side, LlmMemory>>; memory = memories[turn]; } catch { memory = undefined; }
      requestLlmMove({ ...profile, apiKey }, turn, history.map((move) => ({ from: move.from, to: move.to })), { gameSeed, coachNote: coachNotes[turn] || undefined, memory, undoNotice: pendingUndoNotice ?? undefined }).then((response) => {
        if (response.undo) {
          if (llmUndoCount >= 5) { setPaused(true); setAppError({ code: 'UNDO_LIMIT', message: '模型连续悔棋次数过多，已暂停对局。' }); return; }
          setLlmUndoCount((count) => count + 1);
          requestUndo(turn, response.undoReason ?? '模型申请悔棋');
          return;
        }
        setCallCount((count) => count + 1);
        setPendingUndoNotice(null);
        setAnalysis((current) => current.map((event) => event.id === eventId ? { ...event, status: 'success', move: response.move?.notation, commentary: response.commentary, detail: `${response.provider} / ${response.model} · ${response.durationMs}ms · ${response.promptTokens + response.completionTokens} tokens`, promptTokens: response.promptTokens, completionTokens: response.completionTokens, modelOutput: response.rawOutput } : event));
        if (response.move) commitMove(response.move, response.commentary);
      }).catch((error: unknown) => {
        const normalized = error instanceof LlmRequestError ? error : new LlmRequestError('UNKNOWN_ERROR', '模型走棋发生未知错误。');
        setAnalysis((current) => current.map((event) => event.id === eventId ? { ...event, status: 'error', detail: `${normalized.code}：${normalized.message}`, modelOutput: normalized.modelOutput } : event));
        setAppError({ code: normalized.code, message: normalized.message, modelOutput: normalized.modelOutput }); setPaused(true);
      }).finally(() => setLlmBusy(false));
    }, delay);
    return () => window.clearTimeout(timer);
  }, [coachNotes, gameSeed, gameSpeed, history, llmBusy, llmUndoCount, mode, paused, pendingUndoNotice, profiles, replayIndex, result, selectedSide, sessionKeys, started, turn]);

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
  const idle = !started || gameOver;

  function describeResult(nextResult: GameResult) {
    if (nextResult === 'red_wins_checkmate') return '将死！红方胜利。';
    if (nextResult === 'black_wins_checkmate') return '将死！黑方胜利。';
    if (nextResult === 'red_wins_stalemate') return '困毙！红方胜利。';
    if (nextResult === 'black_wins_stalemate') return '困毙！黑方胜利。';
    if (nextResult === 'red_wins_long_check') return '黑方连续长将违规，红方胜利。';
    if (nextResult === 'black_wins_long_check') return '红方连续长将违规，黑方胜利。';
    if (nextResult === 'draw_repetition') return '同一局面三次出现，本局和棋。';
    if (nextResult === 'move_limit_reached') return '已达到 200 回合上限，本局未判胜负。';
    return '';
  }

  function commitMove(move: Move, commentary?: string) {
    if (gameOver) return;
    const nextPieces = makeMove(pieces, move);
    setLastMove(move); setPendingUndoNotice(null); if (mode === 'human-vs-llm' && !started && turn === selectedSide) { setStarted(true); setPaused(false); }
    const kind = move.givesCheck ? 'check' : move.captureId ? 'capture' : 'info';
    const parts: string[] = []; if (move.captureId) parts.push('吃子'); if (move.givesCheck) parts.push('将军');
    setLastEvent({ side: turn, kind, text: `${turn === 'red' ? '红方' : '黑方'}${parts.length ? parts.join('，') : '落子'}：${move.notation}` });
    const nextTurn = turn === 'red' ? 'black' : 'red'; const nextHistory = [...history, move];
    let nextResult = gameResult(nextPieces, nextTurn);
    if (nextResult === 'playing' && nextHistory.length >= 400) nextResult = 'move_limit_reached';
    if (nextResult === 'playing') {
      const targetKey = positionKey(nextPieces, nextTurn); let replayPieces = createInitialPieces(); let replayTurn: Side = 'red'; let occurrences = positionKey(replayPieces, replayTurn) === targetKey ? 1 : 0;
      nextHistory.forEach((played) => { replayPieces = makeMove(replayPieces, played); replayTurn = replayTurn === 'red' ? 'black' : 'red'; if (positionKey(replayPieces, replayTurn) === targetKey) occurrences += 1; });
      if (occurrences >= 3) {
        const moverMoves = nextHistory.filter((_, index) => index % 2 === (turn === 'red' ? 0 : 1));
        const repeatedChecks = moverMoves.slice(-3).length === 3 && moverMoves.slice(-3).every((item) => item.givesCheck);
        nextResult = repeatedChecks ? (turn === 'red' ? 'black_wins_long_check' : 'red_wins_long_check') : 'draw_repetition';
      }
    }
    setPieces(nextPieces); setTurn(nextTurn); setResult(nextResult); setHistory(nextHistory); setSelectedPiece(null);
    if (!commentary) setAnalysis((current) => [...current, { id: crypto.randomUUID(), side: turn, move: move.notation, status: 'success', detail: '玩家走棋 · 规则引擎校验通过', at: new Date().toISOString() }]);
    if (nextResult !== 'playing') {
      setStarted(false);
      const lesson: LlmMemory = { previousResult: describeResult(nextResult), lesson: nextResult.includes('checkmate') ? '复盘最后阶段，避免重复进入相同受攻结构。' : '尝试改变开局节奏，避免机械复刻上一局。', previousMoves: nextHistory.slice(-40).map((item) => ({ from: item.from, to: item.to })) };
      try { const memories = JSON.parse(localStorage.getItem(MEMORY_KEY) ?? '{}') as Record<Side, LlmMemory>; memories[turn] = lesson; localStorage.setItem(MEMORY_KEY, JSON.stringify(memories)); } catch { /* ignore storage failures */ }
    }
    setNotice(nextResult === 'playing' ? `${move.notation}${move.captureId ? '，吃子' : ''}${move.givesCheck ? '，将军！' : ''} 现在轮到${nextTurn === 'red' ? '红方' : '黑方'}走棋。` : describeResult(nextResult));
  }

  function selectPiece(piece: GamePiece) {
    const aiTurn = mode === 'llm-vs-llm' || turn !== selectedSide;
    if (llmBusy || (started && aiTurn)) { setNotice('正在等待模型走棋，请稍候。'); return; }
    if (gameOver) { setNotice(describeResult(result)); return; }
    if (selectedPiece === piece.id) { setSelectedPiece(null); setNotice('已取消显示合法落点。'); return; }
    const targetMove = legalTargets.find((move) => move.to.file === piece.file && move.to.rank === piece.rank);
    if (targetMove) { commitMove(targetMove); return; }
    if (piece.side !== turn) { setNotice(`现在轮到${turn === 'red' ? '红方' : '黑方'}走棋。`); return; }
    if (mode === 'human-vs-llm' && piece.side !== selectedSide) { setNotice(`当前由${currentSideLabel}玩家操作，请选择己方棋子。`); return; }
    const moves = legalMovesForPiece(pieces, piece.id);
    setSelectedPiece(piece.id); setNotice(moves.length ? `已选中${piece.side === 'red' ? '红方' : '黑方'}${piece.label}，亮点为合法落点。` : '该棋子当前没有合法走法。');
  }

  function resetGame() { setGameSeed(Math.random().toString(36).slice(2, 10)); setLlmBusy(false); setCallCount(0); setLastMove(null); setLastEvent(null); setPendingUndoNotice(null); setLlmUndoCount(0); setReplayIndex(null); setPieces(createInitialPieces()); setTurn('red'); setResult('playing'); setHistory([]); setAnalysis([]); setStarted(false); setPaused(false); setAppError(null); setSelectedPiece(null); setNotice('已恢复标准开局，红方先行。'); }

  function requestUndo(side: Side, reason: string) {
    let lastIndex = -1;
    for (let index = history.length - 1; index >= 0; index -= 1) {
      const recorded = history[index]; if (recorded && recorded.pieceId.startsWith(side === 'red' ? 'r' : 'b')) { lastIndex = index; break; }
    }
    if (lastIndex === -1) { setNotice('当前还没有可以悔的棋。'); return; }
    const nextHistory = history.slice(0, lastIndex); let restored = createInitialPieces();
    nextHistory.forEach((move) => { restored = makeMove(restored, move); });
    const nextTurn: Side = nextHistory.length % 2 === 0 ? 'red' : 'black';
    const nextResult = gameResult(restored, nextTurn);
    setLastMove(nextHistory[nextHistory.length - 1] ?? null); setPieces(restored); setHistory(nextHistory); setTurn(nextTurn); setResult(nextResult); setSelectedPiece(null);
    setLastEvent({ side, kind: 'undo', text: `${side === 'red' ? '红方' : '黑方'}悔棋：${reason}` });
    setPendingUndoNotice(`${side === 'red' ? '红方' : '黑方'}刚刚悔棋：${reason}`);
    setAnalysis((current) => [...current, { id: crypto.randomUUID(), side, status: 'success', detail: `悔棋：${reason}`, at: new Date().toISOString() }]);
    setNotice(`悔棋成功，现在轮到${nextTurn === 'red' ? '红方' : '黑方'}走棋。`);
  }

  function selectProvider(provider: ProviderId) {
    const preset = PROVIDERS[provider];
    setDraft((current) => ({ ...current, provider, baseUrl: preset.baseUrl || current.baseUrl, model: preset.model || current.model }));
    setFormError('');
  }

  async function saveProfile() {
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
    const sideKey = draft.apiKey.trim();
    setSessionKeys((current) => ({ ...current, [editingSide]: sideKey }));
    if (sideKey) {
      try {
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const rawKey = crypto.getRandomValues(new Uint8Array(32));
        const secret = await crypto.subtle.importKey('raw', rawKey, { name: 'AES-GCM' }, false, ['encrypt']);
        const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, secret, new TextEncoder().encode(JSON.stringify({ [editingSide]: sideKey })));
        window.localStorage.setItem(`${ENCRYPTED_API_KEY}:${editingSide}`, JSON.stringify({ iv: base64url(iv.buffer), data: base64url(encrypted), key: base64url(rawKey.buffer) }));
      } catch { /* encryption unavailable; keep session-only */ }
    }
    setIsSettingsOpen(false);
    setNotice(`${editingSide === 'red' ? '红方' : '黑方'}供应商已保存为「${PROVIDERS[draft.provider].label} / ${model}」。${sideKey ? 'API Key 已加密保存到浏览器。' : '尚未填写 API Key。'}`);
  }

  function switchEditingSide(side: Side) {
    setEditingSide(side); setDraft({ ...profiles[side], apiKey: sessionKeys[side] }); setFormError('');
  }

  function startGame() {
    const required: Side[] = mode === 'llm-vs-llm' ? ['red', 'black'] : [selectedSide === 'red' ? 'black' : 'red'];
    const missing = required.find((side) => !sessionKeys[side]);
    if (missing) { setAppError({ code: 'API_KEY_MISSING', message: `${missing === 'red' ? '红方' : '黑方'}需要填写 API Key 才能开始。` }); openSettings(missing); return; }
    setAppError(null); setPaused(false); setStarted(true); setNotice(mode === 'llm-vs-llm' ? '自动对弈已开始。' : `人机对战已开始，你执${currentSideLabel}。`);
  }

  function saveGame() {
    const record: StoredGame = { schemaVersion: 1, id: crypto.randomUUID(), name: `${new Date().toLocaleString('zh-CN')} · ${history.length} 手`, savedAt: new Date().toISOString(), result, moves: history, analysis };
    const records = [record, ...savedGames].slice(0, 30);
    localStorage.setItem(GAMES_KEY, JSON.stringify(records)); setSavedGames(records);
    setNotice('棋谱已保存到当前浏览器，不包含 API Key。');
  }

  function replayGame(record: StoredGame, step = record.moves.length) {
    const safeStep = Math.max(0, Math.min(step, record.moves.length)); let restored = createInitialPieces();
    record.moves.slice(0, safeStep).forEach((move) => { restored = makeMove(restored, move); });
    setPieces(restored); setHistory(record.moves); setLastMove(safeStep ? record.moves[safeStep - 1] ?? null : null); setReplayIndex(safeStep); setStarted(false); setPaused(true); setSelectedPiece(null); setView('game'); setNotice(`回放至第 ${safeStep} 个半回合。`);
  }

  function deleteGame(record: StoredGame) {
    const records = savedGames.filter((item) => (item.id ?? item.savedAt) !== (record.id ?? record.savedAt));
    localStorage.setItem(GAMES_KEY, JSON.stringify(records)); setSavedGames(records);
  }

  function handleDragStart(event: DragEvent<HTMLButtonElement>, piece: GamePiece) {
    if (piece.side !== turn || llmBusy || replayIndex !== null) { event.preventDefault(); return; }
    event.dataTransfer.setData('text/plain', piece.id); event.dataTransfer.effectAllowed = 'move'; setSelectedPiece(piece.id);
  }

  function handleBoardDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault(); const pieceId = event.dataTransfer.getData('text/plain'); const rect = event.currentTarget.getBoundingClientRect();
    const file = Math.max(0, Math.min(8, Math.round(((event.clientX - rect.left) / rect.width) * 8)));
    const rank = Math.max(0, Math.min(9, Math.round(((event.clientY - rect.top) / rect.height) * 9)));
    const move = legalMovesForPiece(pieces, pieceId).find((candidate) => candidate.to.file === file && candidate.to.rank === rank);
    if (move) commitMove(move); else setNotice('拖拽位置不是合法落点，棋局未改变。');
  }

  async function importGame(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]; event.target.value = ''; if (!file) return;
    try {
      const raw: unknown = JSON.parse(await file.text());
      if (!raw || typeof raw !== 'object' || (raw as { schemaVersion?: unknown }).schemaVersion !== 1 || !Array.isArray((raw as { moves?: unknown }).moves)) throw new Error('format');
      const imported = raw as StoredGame; let restored = createInitialPieces(); let replayTurn: Side = 'red'; const verified: Move[] = [];
      for (const candidate of imported.moves) {
        const legal = allLegalMoves(restored, replayTurn).find((move) => move.from.file === candidate.from.file && move.from.rank === candidate.from.rank && move.to.file === candidate.to.file && move.to.rank === candidate.to.rank);
        if (!legal) throw new Error('illegal move');
        verified.push(legal); restored = makeMove(restored, legal); replayTurn = replayTurn === 'red' ? 'black' : 'red';
      }
      setLastMove(verified[verified.length - 1] ?? null); setPieces(restored); setHistory(verified); setTurn(replayTurn); setResult(gameResult(restored, replayTurn)); setAnalysis(Array.isArray(imported.analysis) ? imported.analysis.slice(0, 800) : []); setStarted(false); setPaused(false); setSelectedPiece(null); setView('game'); setAppError(null); setNotice(`已导入 ${verified.length} 个半回合，API Key 未包含在棋谱中。`);
    } catch { setAppError({ code: 'INVALID_GAME_FILE', message: '棋谱文件格式无效或包含非法走法，未导入任何内容。' }); }
  }

  function download(content: string, name: string, type: string) {
    const url = URL.createObjectURL(new Blob([content], { type })); const anchor = document.createElement('a'); anchor.href = url; anchor.download = name; anchor.click(); URL.revokeObjectURL(url);
  }

  function startFromHome() { setScreen('game'); setView('game'); startGame(); }

  function goHome() { resetGame(); setScreen('home'); }

  return <main className="app-shell">
    <header className="topbar"><a className="brand" href="#main-content" aria-label="LLM 象棋主页"><span className="brand-seal" aria-hidden="true">棋</span><span><strong>LLM 象棋</strong><small>CHINESE CHESS LAB</small></span></a><div className="topbar-actions">{screen === 'game' && <button className="home-nav" type="button" onClick={goHome}>← 首页</button>}{screen === 'game' && <nav className="view-switch" aria-label="页面切换"><button className={view === 'game' ? 'is-active' : ''} type="button" onClick={() => setView('game')}>棋局</button><button className={view === 'analysis' ? 'is-active' : ''} type="button" onClick={() => setView('analysis')}>对局分析</button></nav>}<span className={`service-pill service-pill--${status}`} aria-live="polite"><i aria-hidden="true" />{status === 'ready' ? '服务已就绪' : status === 'loading' ? '检查服务中' : '服务暂不可用'}</span><button className="icon-button" type="button" aria-label="打开模型配置" onClick={() => openSettings()}>⚙</button></div></header>

    {screen === 'home' ? (
      <section className="hero hero--home" aria-labelledby="page-title">
        <div>
          <p className="eyebrow">AI × 楚河汉界</p>
          <h1 id="page-title">让语言模型，下一盘真正的象棋。</h1>
          <p className="hero-copy">规则由确定性引擎裁决，模型只在合法着法中做出选择。你可以执子对弈，也可以静观两位模型棋手交锋。</p>
        </div>
        <div className="home-panel">
          <div className="mode-switch" role="tablist" aria-label="选择对局模式">{(Object.keys(labels) as Mode[]).map((item) => <button key={item} type="button" role="tab" aria-selected={mode === item} className={mode === item ? 'is-active' : ''} onClick={() => switchMode(item)}>{item === 'human-vs-llm' ? '人机对战' : 'LLM 对弈'}</button>)}</div>
          <div className="home-actions">
            <button type="button" className="primary-button" onClick={startFromHome}>开始游戏 <span aria-hidden="true">→</span></button>
            <button type="button" className="secondary-button" onClick={() => openSettings()}>配置模型</button>
          </div>
          <p className="home-hint">{mode === 'human-vs-llm' ? '你将执红先行；走第一步即视为开始。' : '红黑双方由模型对弈，可全程观战并随时暂停。'}</p>
        </div>
      </section>
    ) : view === 'game' ? (
      <>
    <section id="main-content" className="game-layout" aria-label="对局区">
      <section className="board-panel" aria-label="中国象棋棋盘">
        <div className="board-frame">
          <div className={`board ${idle ? 'board--idle' : ''}`} role="application" aria-label="标准中国象棋开局，红方在下" onDragOver={(event) => event.preventDefault()} onDrop={handleBoardDrop}>
            <BoardLines />
            <div className="river" aria-hidden="true"><span>楚 河</span><span>漢 界</span></div>
            {lastMove && <><span className="last-move-mark last-move-mark--from" style={{ left: `${lastMove.from.file * 12.5}%`, top: `${lastMove.from.rank * (100 / 9)}%` }} aria-hidden="true" /><span className="last-move-mark last-move-mark--to" style={{ left: `${lastMove.to.file * 12.5}%`, top: `${lastMove.to.rank * (100 / 9)}%` }} aria-hidden="true" /></>}
            {legalTargets.map((move) => <button key={`target-${move.to.file}-${move.to.rank}`} className={`legal-target ${move.captureId ? 'legal-target--capture' : ''}`} style={{ left: `${move.to.file * 12.5}%`, top: `${move.to.rank * (100 / 9)}%` }} type="button" aria-label={`${move.captureId ? '吃' : '走到'}${files[move.to.file]}路第${move.to.rank + 1}行`} onClick={() => commitMove(move)}><span /></button>)}
            {pieces.map((piece) => <button key={piece.id} className={`piece piece--${piece.side} ${selectedPiece === piece.id ? 'piece--selected' : ''}`} style={{ left: `${piece.file * 12.5}%`, top: `${piece.rank * (100 / 9)}%` }} type="button" aria-label={`${piece.side === 'red' ? '红方' : '黑方'}${piece.label}，${files[piece.file]}路第${piece.rank + 1}行`} aria-pressed={selectedPiece === piece.id} draggable onDragStart={(event) => handleDragStart(event, piece)} onClick={() => selectPiece(piece)}>{piece.label}</button>)}
          </div>
          {gameOver && <div className="game-over-modal" role="dialog" aria-modal="true" aria-labelledby="game-over-title"><p className="eyebrow">对局结束</p><h2 id="game-over-title">{describeResult(result)}</h2><div className="game-over-actions"><button type="button" className="primary-button" onClick={resetGame}>重来</button><button type="button" className="secondary-button" onClick={goHome}>回到首页</button></div></div>}
        </div>
        <div className="board-status" aria-live="polite"><span className={`board-status-round ${gameOver ? 'board-status-round--finished' : ''}`}>{gameOver ? describeResult(result) : `第 ${Math.ceil(history.length / 2) || 1} 回合 · ${turn === 'red' ? '红方走' : '黑方走'}`}</span>{!gameOver && lastEvent && <span className={`board-status-event board-status-event--${lastEvent.kind}`}>{lastEvent.text}</span>}</div>
        <p className="board-caption">{idle ? (gameOver ? '对局已结束，可在棋盘上选择重来或回到首页' : '对局尚未开始，走第一步即自动开始') : '红方在下 · 点击棋子查看合法落点'}</p>
      </section>
      <aside className="player-card player-card--black"><div className="player-mark">黑</div><div><p>黑方棋手</p><h2>{mode === 'human-vs-llm' && selectedSide === 'black' ? '你' : profileName(profiles.black)}</h2><button className="profile-link" type="button" onClick={() => openSettings('black')}>配置黑方模型</button></div><span className="turn-badge">后手</span></aside>
      <aside className="player-card player-card--red"><div className="player-mark">红</div><div><p>红方棋手</p><h2>{mode === 'human-vs-llm' && selectedSide === 'red' ? '你' : profileName(profiles.red)}</h2><button className="profile-link" type="button" onClick={() => openSettings('red')}>配置红方模型</button></div><span className="turn-badge turn-badge--current">先手</span></aside>
      <section className="error-spot" aria-live="polite">{appError && <div className="error-banner" role="alert"><span className="error-code">{appError.code}</span><span className="error-message">{appError.message}</span><button type="button" onClick={() => { setAppError(null); setPaused(false); }}>关闭并重试</button>{appError.modelOutput !== undefined ? <details className="model-output"><summary>查看模型输出</summary><pre>{appError.modelOutput || '(模型未返回任何内容)'}</pre></details> : null}</div>}</section>
      <section className="side-events" aria-live="polite">{lastEvent && <div className={`side-event side-event--${lastEvent.side} side-event--${lastEvent.kind}`}><span className="side-event-mark">{lastEvent.side === 'red' ? '红' : '黑'}</span><p>{lastEvent.text}</p></div>}</section>
      <section className="control-card" aria-labelledby="control-title"><div className="control-heading"><div><p className="eyebrow">当前对局</p><h2 id="control-title">{labels[mode]}</h2></div><span className={`round-count ${gameOver ? 'round-count--finished' : ''}`}>{gameOver ? describeResult(result) : `第 ${Math.ceil(history.length / 2) || 1} 回合 · ${turn === 'red' ? '红方走' : '黑方走'}`}</span></div><p className="control-subtitle">{subtitle}</p><div className="game-meta"><span>本局种子 <code>{gameSeed}</code></span><span>模型调用 {callCount} 次</span><label>速度<select value={gameSpeed} onChange={(event) => setGameSpeed(event.target.value as typeof gameSpeed)}><option value="slow">慢速</option><option value="normal">正常</option><option value="fast">快速</option></select></label></div>{mode === 'human-vs-llm' && <div className="side-picker" aria-label="选择玩家执棋方"><span>执棋方</span>{(['red', 'black'] as Side[]).map((side) => <button type="button" key={side} className={selectedSide === side ? `side-button side-button--${side} is-active` : `side-button side-button--${side}`} onClick={() => { setSelectedSide(side); setNotice(`已选择${side === 'red' ? '红方' : '黑方'}。`); }}>{side === 'red' ? '红方' : '黑方'}</button>)}</div>}<div className="control-actions"><button type="button" className="primary-button" disabled={llmBusy} onClick={started ? () => setPaused((value) => !value) : startGame}>{llmBusy ? '模型思考中…' : started ? (paused ? '继续对局' : '暂停对局') : '开始对局'} <span aria-hidden="true">→</span></button><button type="button" className="secondary-button" onClick={() => openSettings()}>模型设置</button><button type="button" className="secondary-button" disabled={llmBusy || !history.some((move) => move.pieceId.startsWith(selectedSide === 'red' ? 'r' : 'b'))} onClick={() => requestUndo(selectedSide, '玩家悔棋')}>悔棋</button><button type="button" className="secondary-button" onClick={resetGame}>重新开始</button><button type="button" className="secondary-button" onClick={goHome}>回到首页</button></div><div className="move-history" aria-label="本局棋谱">{history.length ? history.slice(-8).map((move, index) => <span key={`${move.pieceId}-${index}`}>{move.notation}{move.givesCheck ? '+' : ''}</span>) : <span>棋谱会显示在这里</span>}</div><div className="notice" role="status" aria-live="polite"><span aria-hidden="true">✦</span>{notice}</div></section>
    </section>

    <section className="principles" aria-label="产品原则"><article><span>01</span><h2>规则优先</h2><p>合法走法、将军与终局，都由规则引擎裁决。</p></article><article><span>02</span><h2>密钥不留存</h2><p>供应商、模型、Base URL 与加密的 API Key 都保存在浏览器本地。</p></article><article><span>03</span><h2>公开说明</h2><p>展示模型主动提供的短评，不显示隐藏思维链。</p></article></section>
      </>
    ) : (
      <section className="analysis-page"><div className="analysis-heading"><div><p className="eyebrow">AUDITABLE GAME TRACE</p><h1>对局分析</h1><p>查看公开走棋说明、规则校验和错误事件。这里不请求或展示模型隐藏思维链。</p></div><div className="analysis-actions"><button className="secondary-button" type="button" onClick={saveGame}>保存棋谱</button><button className="secondary-button" type="button" onClick={() => download(JSON.stringify({ schemaVersion: 1, result, moves: history, analysis }, null, 2), 'llm-chess-game.json', 'application/json')}>导出 JSON</button><button className="secondary-button" type="button" onClick={() => download(history.map((move, index) => `${index + 1}. ${move.notation}`).join('\n'), 'llm-chess-game.txt', 'text/plain')}>导出文本</button><label className="file-button">导入棋谱<input type="file" accept="application/json,.json" onChange={importGame} /></label></div></div><section className="saved-games"><header><h2>本地棋谱</h2><span>最多保存 30 局</span></header>{savedGames.length ? savedGames.map((record) => <article key={record.id ?? record.savedAt}><div><strong>{record.name ?? record.savedAt}</strong><p>{record.result} · {record.moves.length} 个半回合</p></div><div><button className="secondary-button" type="button" onClick={() => replayGame(record)}>回放</button><button className="secondary-button" type="button" onClick={() => deleteGame(record)}>删除</button></div></article>) : <p className="saved-games-empty">还没有保存的棋谱。</p>}</section><div className="analysis-timeline">{analysis.length ? analysis.map((event) => <article className={`analysis-event analysis-event--${event.status}`} key={event.id}><span className="analysis-dot" /><div><header><strong>{event.side === 'red' ? '红方' : '黑方'}{event.move ? ` · ${event.move}` : ''}</strong><time>{new Date(event.at).toLocaleTimeString('zh-CN')}</time></header>{event.commentary && <blockquote>{event.commentary}</blockquote>}{event.modelOutput !== undefined ? <details className="model-output"><summary>模型原始输出</summary><pre>{event.modelOutput || '(模型未返回任何内容)'}</pre></details> : null}<p>{event.detail}</p></div></article>) : <div className="analysis-empty"><span>谱</span><h2>尚无分析记录</h2><p>开始对局后，模型请求、公开说明和错误会按时间显示在这里。</p></div>}</div></section>)}

    {isSettingsOpen && <div className="modal-backdrop" role="presentation" onMouseDown={() => setIsSettingsOpen(false)}><section className="settings-modal" role="dialog" aria-modal="true" aria-labelledby="settings-title" onMouseDown={(event) => event.stopPropagation()}><button className="modal-close" type="button" aria-label="关闭模型配置" onClick={() => setIsSettingsOpen(false)}>×</button><p className="eyebrow">连接配置</p><h2 id="settings-title">保存模型供应商</h2><p>服务商、模型名、Base URL 会安全保存到此浏览器；API Key 会加密存储在浏览器本地以便下次使用。</p><div className="config-side-tabs" role="tablist" aria-label="选择要配置的一方">{(['red', 'black'] as Side[]).map((side) => <button type="button" role="tab" aria-selected={editingSide === side} className={editingSide === side ? `is-active side-${side}` : `side-${side}`} key={side} onClick={() => switchEditingSide(side)}>{side === 'red' ? '红方模型' : '黑方模型'}</button>)}</div><div className="setting-grid"><label>服务商<select value={draft.provider} onChange={(event) => selectProvider(event.target.value as ProviderId)}>{(Object.keys(PROVIDERS) as ProviderId[]).map((provider) => <option value={provider} key={provider}>{PROVIDERS[provider].label}</option>)}</select></label><label>模型名称<input value={draft.model} onChange={(event) => setDraft((current) => ({ ...current, model: event.target.value }))} placeholder="例如：deepseek-chat" autoComplete="off" /></label><label className="span-all">Base URL<input value={draft.baseUrl} onChange={(event) => setDraft((current) => ({ ...current, baseUrl: event.target.value }))} placeholder="https://api.example.com/v1" inputMode="url" autoComplete="off" /></label><label className="span-all">API Key <span className="field-hint">加密保存到浏览器，刷新后仍可使用</span><input type="password" value={draft.apiKey} onChange={(event) => setDraft((current) => ({ ...current, apiKey: event.target.value }))} placeholder="sk-..." autoComplete="off" /></label><label className="span-all">临时教练提示 <span className="field-hint">只影响本局，不会写入模型记忆库</span><textarea value={coachNotes[editingSide]} onChange={(event) => setCoachNotes((current) => ({ ...current, [editingSide]: event.target.value }))} placeholder="例如：优先控制中路，避免重复上一局的开局。" maxLength={300} /></label></div>{formError && <p className="form-error" role="alert">{formError}</p>}<button type="button" className="primary-button" onClick={saveProfile}>保存 {editingSide === 'red' ? '红方' : '黑方'}供应商</button></section></div>}
  </main>;
}