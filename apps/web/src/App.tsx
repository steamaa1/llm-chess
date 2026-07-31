import { useEffect, useState } from 'react';

type Health = { ok: true; data: { service: string; status: string } };

export function App() {
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/health', { signal: controller.signal })
      .then(async (response) => { if (!response.ok) throw new Error('health failed'); return response.json() as Promise<Health>; })
      .then((body) => setStatus(body.ok ? 'ready' : 'error'))
      .catch(() => { if (!controller.signal.aborted) setStatus('error'); });
    return () => controller.abort();
  }, []);
  return <main className="app-shell"><section className="status-card" aria-labelledby="title"><p className="eyebrow">中国象棋 · LLM 对局</p><h1 id="title">LLM 象棋</h1><p>正在建立对局服务</p><p aria-live="polite" role="status">{status === 'loading' ? '正在检查服务状态…' : status === 'ready' ? '对局服务已就绪' : '暂时无法连接对局服务，请稍后重试。'}</p></section></main>;
}
