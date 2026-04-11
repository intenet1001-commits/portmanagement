import React, { useState, useEffect, useRef, useCallback } from 'react';

interface ClaudeStatus {
  installed: boolean;
  authenticated: boolean;
  email: string;
  subscriptionType: string;
  authMethod: string;
  version: string;
}

const PLAN_LABEL: Record<string, string> = {
  max: 'Max',
  pro: 'Pro',
  team: 'Team',
  free: 'Free',
};

const PLAN_COLOR: Record<string, string> = {
  max: '#a855f7',
  pro: '#3b82f6',
  team: '#f59e0b',
  free: '#6b7280',
};

export default function ClaudeAuthBadge() {
  const [status, setStatus] = useState<ClaudeStatus | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [polling, setPolling] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const fetchStatus = useCallback(async () => {
    try {
      const r = await fetch('/api/claude-status');
      if (r.ok) setStatus(await r.json());
    } catch {}
    finally { setLoaded(true); }
  }, []);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Cleanup poll on unmount
  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  const handleLogin = async () => {
    setLoading(true);
    try {
      await fetch('/api/claude-auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'login' }),
      });
    } catch {}
    setLoading(false);
    setPolling(true);
    let attempts = 0;
    pollRef.current = setInterval(async () => {
      attempts++;
      if (attempts > 20) {
        clearInterval(pollRef.current!);
        setPolling(false);
        return;
      }
      try {
        const r = await fetch('/api/claude-status');
        if (r.ok) {
          const s: ClaudeStatus = await r.json();
          setStatus(s);
          if (s.authenticated) {
            clearInterval(pollRef.current!);
            setPolling(false);
            setOpen(false);
          }
        }
      } catch {}
    }, 3000);
  };

  const handleLogout = async () => {
    setLoading(true);
    try {
      await fetch('/api/claude-auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'logout' }),
      });
      await fetchStatus();
    } catch {}
    setLoading(false);
    setOpen(false);
  };

  if (!loaded) return null; // still loading
  if (!status) return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 10px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.02)', fontSize: 12, color: '#52525b' }}>
      <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#52525b', flexShrink: 0 }} />
      Claude 오프라인
    </div>
  );

  const dot = status.authenticated ? '#22c55e' : '#ef4444';
  const planKey = status.subscriptionType?.toLowerCase() ?? '';
  const planLabel = PLAN_LABEL[planKey] ?? status.subscriptionType;
  const planColor = PLAN_COLOR[planKey] ?? '#6b7280';
  const emailShort = status.email ? status.email.split('@')[0] : '';

  return (
    <div ref={dropdownRef} style={{ position: 'relative' }}>
      {/* Badge button */}
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          padding: '5px 10px',
          borderRadius: '8px',
          border: '1px solid rgba(255,255,255,0.08)',
          background: 'rgba(255,255,255,0.04)',
          cursor: 'pointer',
          fontSize: '12px',
          color: '#d4d4d8',
          transition: 'background 0.15s',
        }}
        onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.08)')}
        onMouseLeave={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.04)')}
      >
        {/* status dot */}
        <span style={{
          width: 7, height: 7, borderRadius: '50%',
          background: dot, flexShrink: 0,
          boxShadow: `0 0 4px ${dot}88`,
        }} />
        {status.installed
          ? status.authenticated
            ? <>Claude <strong style={{ color: '#fff' }}>{emailShort}</strong></>
            : 'Claude 미로그인'
          : 'Claude 미설치'}
        {status.authenticated && planLabel && (
          <span style={{
            fontSize: 10, fontWeight: 600, letterSpacing: '0.03em',
            color: planColor, background: `${planColor}22`,
            borderRadius: 4, padding: '1px 5px',
            border: `1px solid ${planColor}44`,
          }}>
            {planLabel}
          </span>
        )}
        {polling && <span style={{ fontSize: 10, color: '#71717a' }}>대기중...</span>}
      </button>

      {/* Dropdown */}
      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 6px)', right: 0,
          width: 260, background: '#18181b', border: '1px solid #3f3f46',
          borderRadius: 12, padding: 16, zIndex: 100,
          boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
        }}>
          {!status.installed ? (
            <>
              <p style={{ fontSize: 13, color: '#a1a1aa', marginBottom: 10 }}>
                Claude CLI가 설치되지 않았습니다.
              </p>
              <code style={{ fontSize: 11, color: '#71717a', background: '#0a0a0b', padding: '4px 8px', borderRadius: 6, display: 'block' }}>
                npm install -g @anthropic-ai/claude-code
              </code>
            </>
          ) : status.authenticated ? (
            <>
              <Row label="이메일" value={status.email} />
              {planLabel && <Row label="플랜" value={planLabel} valueColor={planColor} />}
              {status.authMethod && <Row label="인증" value={status.authMethod} />}
              {status.version && <Row label="버전" value={status.version} />}
              <button
                onClick={handleLogout}
                disabled={loading}
                style={{
                  marginTop: 12, width: '100%', padding: '7px',
                  background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)',
                  borderRadius: 8, color: '#f87171', fontSize: 12, cursor: 'pointer',
                  opacity: loading ? 0.6 : 1,
                }}
              >
                {loading ? '처리중...' : '로그아웃'}
              </button>
            </>
          ) : (
            <>
              <p style={{ fontSize: 13, color: '#a1a1aa', marginBottom: 12 }}>
                Claude 계정에 로그인하면 Max/Pro 플랜의 기능을 사용할 수 있습니다.
              </p>
              <button
                onClick={handleLogin}
                disabled={loading || polling}
                style={{
                  width: '100%', padding: '8px',
                  background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.4)',
                  borderRadius: 8, color: '#a5b4fc', fontSize: 13, fontWeight: 600,
                  cursor: loading || polling ? 'default' : 'pointer',
                  opacity: loading || polling ? 0.6 : 1,
                }}
              >
                {polling ? '브라우저에서 인증 중...' : loading ? '처리중...' : '브라우저로 로그인'}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function Row({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
      <span style={{ fontSize: 11, color: '#71717a' }}>{label}</span>
      <span style={{ fontSize: 12, color: valueColor ?? '#d4d4d8', fontWeight: valueColor ? 600 : 400 }}>{value}</span>
    </div>
  );
}
