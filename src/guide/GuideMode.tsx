import React, { useEffect, useRef, useState, useCallback } from 'react';
import { GraduationCap, X, Lightbulb } from 'lucide-react';
import { getGuideEntry } from './guideContent';

interface ActiveTip {
  key: string;
  rect: DOMRect;
}

interface GuideOverlayProps {
  guideMode: boolean;
  setGuideMode: (v: boolean) => void;
}

const TOOLTIP_W = 280;
const TOOLTIP_GAP = 10;

/**
 * Walks the parent chain to determine if an element is actually rendered.
 * `getComputedStyle(el)` only returns the element's own values, so a button
 * inside an `opacity-0` wrapper still reports `opacity: '1'`. We check
 * ancestors to catch wrappers that hide their children.
 */
function isElementVisible(el: HTMLElement): boolean {
  // Native API (widely supported as of 2024–2025)
  const native = (el as unknown as { checkVisibility?: (opts: object) => boolean })
    .checkVisibility;
  if (typeof native === 'function') {
    try {
      return native.call(el, {
        checkOpacity: true,
        checkVisibilityCSS: true,
        contentVisibilityAuto: true,
      });
    } catch {
      // fall through to manual check
    }
  }
  let cur: HTMLElement | null = el;
  while (cur) {
    const s = window.getComputedStyle(cur);
    if (s.display === 'none' || s.visibility === 'hidden' || parseFloat(s.opacity) === 0) {
      return false;
    }
    cur = cur.parentElement;
  }
  return true;
}

export function GuideOverlay({ guideMode, setGuideMode }: GuideOverlayProps) {
  const [tip, setTip] = useState<ActiveTip | null>(null);
  const tipRef = useRef<HTMLDivElement | null>(null);
  const dismissTimer = useRef<number | null>(null);

  const closeTip = useCallback(() => {
    setTip(null);
    if (dismissTimer.current) {
      window.clearTimeout(dismissTimer.current);
      dismissTimer.current = null;
    }
  }, []);

  // Body class for pulse animation
  useEffect(() => {
    if (guideMode) {
      document.body.classList.add('guide-mode-active');
    } else {
      document.body.classList.remove('guide-mode-active');
      closeTip();
    }
    return () => {
      document.body.classList.remove('guide-mode-active');
    };
  }, [guideMode, closeTip]);

  // State for hover halo (element currently under cursor in guide mode)
  const [hoverRect, setHoverRect] = useState<DOMRect | null>(null);
  const [hoverKey, setHoverKey] = useState<string | null>(null);

  const findHelpTargetAt = useCallback((x: number, y: number): HTMLElement | null => {
    const elements = document.elementsFromPoint(x, y);
    for (const node of elements) {
      if (!(node instanceof HTMLElement)) continue;
      if (node.dataset.guideUi === '1' || node.closest('[data-guide-ui="1"]')) continue;
      const target = node.closest<HTMLElement>('[data-help-key]');
      if (!target) continue;
      if (!isElementVisible(target)) continue;
      return target;
    }
    return null;
  }, []);

  const handleOverlayClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const target = findHelpTargetAt(e.clientX, e.clientY);
    if (!target) {
      setTip(null);
      return;
    }
    const key = target.dataset.helpKey!;
    const rect = target.getBoundingClientRect();
    setTip({ key, rect });
    if (dismissTimer.current) window.clearTimeout(dismissTimer.current);
    dismissTimer.current = window.setTimeout(() => setTip(null), 8000);
  }, [findHelpTargetAt]);

  const handleOverlayMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const target = findHelpTargetAt(e.clientX, e.clientY);
    if (target) {
      const key = target.dataset.helpKey!;
      if (key !== hoverKey) {
        setHoverKey(key);
        setHoverRect(target.getBoundingClientRect());
      }
    } else if (hoverKey) {
      setHoverKey(null);
      setHoverRect(null);
    }
  }, [findHelpTargetAt, hoverKey]);

  // ESC closes tooltip
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && tip) {
        closeTip();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [tip, closeTip]);

  if (!guideMode && !tip) return null;

  return (
    <>
      {guideMode && (
        <div
          className="guide-mode-banner"
          data-guide-ui="1"
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            zIndex: 9998,
            background: '#15120f',
            color: '#ede7dd',
            padding: '8px 14px',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            fontSize: 12.5,
            fontWeight: 500,
            borderBottom: '1px solid rgba(245,158,11,0.3)',
            fontFamily: 'Inter Tight, system-ui, sans-serif',
          }}
        >
          <GraduationCap size={14} style={{ color: '#f59e0b' }} />
          <span style={{ color: '#a39a8c' }}>
            <span style={{ color: '#f59e0b', fontWeight: 600 }}>가이드 모드</span>
            <span style={{ marginLeft: 8 }}>요소를 클릭하면 설명이 나와요. (실제 동작은 일어나지 않음)</span>
          </span>
          <span style={{ flex: 1 }} />
          <button
            onClick={() => setGuideMode(false)}
            style={{
              background: 'transparent',
              border: '1px solid rgba(245,158,11,0.4)',
              padding: '3px 10px',
              borderRadius: 5,
              fontSize: 11.5,
              fontWeight: 500,
              cursor: 'pointer',
              color: '#f59e0b',
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              fontFamily: 'inherit',
            }}
          >
            <X size={11} />
            끄기
          </button>
        </div>
      )}

      {guideMode && (
        <div
          data-guide-ui="1"
          onClick={handleOverlayClick}
          onMouseMove={handleOverlayMove}
          onMouseLeave={() => { setHoverKey(null); setHoverRect(null); }}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 9000,
            cursor: hoverRect ? 'help' : 'not-allowed',
            background: 'transparent',
          }}
        />
      )}

      {guideMode && hoverRect && (
        <div
          data-guide-ui="1"
          style={{
            position: 'fixed',
            top: hoverRect.top - 3,
            left: hoverRect.left - 3,
            width: hoverRect.width + 6,
            height: hoverRect.height + 6,
            border: '1.5px solid #f59e0b',
            borderRadius: 7,
            boxShadow: '0 0 0 4px rgba(245,158,11,0.12), 0 4px 14px rgba(245,158,11,0.18)',
            pointerEvents: 'none',
            zIndex: 9001,
            transition: 'top 0.1s ease, left 0.1s ease, width 0.1s ease, height 0.1s ease',
          }}
        />
      )}

      {tip && <Tooltip tip={tip} tipRef={tipRef} onClose={closeTip} />}
    </>
  );
}

function Tooltip({
  tip,
  tipRef,
  onClose,
}: {
  tip: ActiveTip;
  tipRef: React.MutableRefObject<HTMLDivElement | null>;
  onClose: () => void;
}) {
  const entry = getGuideEntry(tip.key);
  const { rect } = tip;

  // Position: prefer below the element; flip above if overflow
  const vh = window.innerHeight;
  const vw = window.innerWidth;
  let top = rect.bottom + TOOLTIP_GAP;
  let placement: 'below' | 'above' = 'below';
  if (top + 140 > vh) {
    top = Math.max(56, rect.top - TOOLTIP_GAP - 140);
    placement = 'above';
  }
  let left = rect.left + rect.width / 2 - TOOLTIP_W / 2;
  left = Math.max(12, Math.min(left, vw - TOOLTIP_W - 12));

  return (
    <div
      ref={tipRef}
      data-guide-ui="1"
      style={{
        position: 'fixed',
        top,
        left,
        width: TOOLTIP_W,
        zIndex: 9999,
        background: '#1c1916',
        border: '1px solid rgba(245,158,11,0.28)',
        borderRadius: 12,
        padding: '13px 15px 14px',
        boxShadow: '0 12px 36px rgba(0,0,0,0.55), 0 0 0 1px rgba(0,0,0,0.4)',
        color: '#ede7dd',
        fontSize: 12.5,
        lineHeight: 1.55,
        fontFamily: 'Inter Tight, system-ui, sans-serif',
        animation: 'guide-tip-in 0.18s cubic-bezier(0.25, 0.1, 0.25, 1)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 7 }}>
        <span style={{ flex: 1, fontWeight: 600, color: '#f59e0b', fontSize: 13.5, letterSpacing: -0.1 }}>
          {entry.title}
        </span>
        <button
          onClick={onClose}
          aria-label="닫기"
          style={{
            background: 'transparent',
            border: 'none',
            color: '#6b6459',
            cursor: 'pointer',
            padding: 2,
            display: 'flex',
            alignItems: 'center',
            transition: 'color 0.15s',
          }}
          onMouseEnter={e => (e.currentTarget.style.color = '#ede7dd')}
          onMouseLeave={e => (e.currentTarget.style.color = '#6b6459')}
        >
          <X size={13} />
        </button>
      </div>
      <div style={{ color: '#c8bfb5', marginBottom: entry.tip ? 9 : 0 }}>{entry.body}</div>
      {entry.tip && (
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: 7,
            background: 'rgba(245,158,11,0.06)',
            borderLeft: '2px solid rgba(245,158,11,0.45)',
            borderRadius: 4,
            padding: '7px 10px',
            color: '#e8a557',
            fontSize: 11.5,
            lineHeight: 1.5,
          }}
        >
          <Lightbulb size={11} style={{ marginTop: 2.5, flexShrink: 0, opacity: 0.85 }} />
          <span style={{ color: '#d4b67a' }}>{entry.tip}</span>
        </div>
      )}
      <div
        style={{
          position: 'absolute',
          left: rect.left + rect.width / 2 - left - 5,
          ...(placement === 'below'
            ? { top: -5, borderBottom: '5px solid rgba(245,158,11,0.28)' }
            : { bottom: -5, borderTop: '5px solid rgba(245,158,11,0.28)' }),
          width: 0,
          height: 0,
          borderLeft: '5px solid transparent',
          borderRight: '5px solid transparent',
        }}
      />
    </div>
  );
}
