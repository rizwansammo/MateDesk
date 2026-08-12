'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Monitor, ZoomIn, ZoomOut, RotateCcw, List, ChevronLeft } from 'lucide-react';

// ── Zoom config ───────────────────────────────────────────────────────────────

const ZOOM_LEVELS = [75, 80, 85, 90, 95, 100, 110, 115, 120, 125] as const;
type ZoomLevel = typeof ZOOM_LEVELS[number];

const ZOOM_LABELS: Record<number, string> = {
  75:  'Very Small (75%)',
  80:  'Smaller (80%)',
  85:  'Small (85%)',
  90:  'Compact (90%)',
  95:  'Slightly Compact (95%)',
  100: 'Default (100%)',
  110: 'Slightly Large (110%)',
  115: 'Large (115%)',
  120: 'Larger (120%)',
  125: 'Very Large (125%)',
};

const ZOOM_DESCRIPTIONS: Record<number, string> = {
  75:  'Best for high-res monitors. Fits a lot on screen.',
  80:  'Great for large external monitors.',
  85:  'Compact but comfortable on most 1080p screens.',
  90:  'Slightly smaller than default — a popular choice.',
  95:  'Barely noticeable, slightly more content visible.',
  100: 'The designed default. Looks best at 1080p+.',
  110: 'Slightly larger text. Good for presentations.',
  115: 'Larger UI elements. Good for 4K screens.',
  120: 'Large — helpful for accessibility.',
  125: 'Very large — maximum accessibility mode.',
};

const ZOOM_KEY    = 'matedesk_zoom';
const PER_PAGE_KEY = 'matedesk_per_page';

const PER_PAGE_PRESETS = [10, 20, 25, 50, 100] as const;

function readZoom(): ZoomLevel {
  if (typeof window === 'undefined') return 100;
  const v = parseInt(localStorage.getItem(ZOOM_KEY) ?? '100', 10);
  return (ZOOM_LEVELS.includes(v as ZoomLevel) ? v : 100) as ZoomLevel;
}

function readPerPage(): number {
  if (typeof window === 'undefined') return 25;
  const v = parseInt(localStorage.getItem(PER_PAGE_KEY) ?? '25', 10);
  return isNaN(v) || v < 1 ? 25 : Math.min(v, 100);
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function AppearancePage() {
  const router = useRouter();

  const [zoom, setZoomState]       = useState<ZoomLevel>(100);
  const [perPage, setPerPageState] = useState(25);
  const [customInput, setCustomInput] = useState('');
  const [customMode, setCustomMode]   = useState(false);

  useEffect(() => {
    const z = readZoom();
    const p = readPerPage();
    setZoomState(z);
    setPerPageState(p);
    setCustomMode(!PER_PAGE_PRESETS.includes(p as typeof PER_PAGE_PRESETS[number]));
    // Apply saved zoom to page
    document.documentElement.style.zoom = (z / 100).toString();
  }, []);

  function setZoom(level: ZoomLevel) {
    setZoomState(level);
    localStorage.setItem(ZOOM_KEY, String(level));
    document.documentElement.style.zoom = (level / 100).toString();
  }

  function setPerPage(n: number) {
    const clamped = Math.min(Math.max(1, n), 100);
    setPerPageState(clamped);
    localStorage.setItem(PER_PAGE_KEY, String(clamped));
  }

  const zoomIdx = ZOOM_LEVELS.indexOf(zoom);
  const isMin   = zoomIdx === 0;
  const isMax   = zoomIdx === ZOOM_LEVELS.length - 1;
  const pct     = (zoomIdx / (ZOOM_LEVELS.length - 1)) * 100;

  return (
    <div className="flex flex-col h-full">

      {/* Secondary bar */}
      <div className="secondary-bar">
        <button
          className="btn-ghost gap-1"
          onClick={() => router.push('/settings')}
        >
          <ChevronLeft size={13} /> Settings
        </button>
        <span style={{ fontSize: 12, color: 'var(--text-4)' }}>/ Appearance</span>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="p-6" style={{ maxWidth: 640, margin: '0 auto' }}>

          {/* Header */}
          <div className="flex items-center gap-3 mb-6">
            <div
              className="w-10 h-10 flex items-center justify-center flex-shrink-0"
              style={{ background: 'var(--bg-elevated)', color: '#60a5fa' }}
            >
              <Monitor size={18} />
            </div>
            <div>
              <h1 className="text-sm font-semibold" style={{ color: 'var(--text-1)' }}>Appearance</h1>
              <p style={{ fontSize: 11, color: 'var(--text-4)', marginTop: 2 }}>
                Zoom and layout preferences are saved locally and only affect your browser.
              </p>
            </div>
          </div>

          {/* ── Zoom card ─────────────────────────────────────────────── */}
          <div className="panel p-6 space-y-6">

            <div>
              <p className="text-xs font-semibold mb-1" style={{ color: 'var(--text-1)' }}>Interface Zoom Level</p>
              <p style={{ fontSize: 11, color: 'var(--text-4)' }}>
                Adjust how large or small the entire interface appears.
              </p>
            </div>

            {/* Current zoom display */}
            <div
              className="flex items-center justify-center py-6"
              style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}
            >
              <div className="text-center">
                <div style={{ fontSize: 48, fontWeight: 700, color: '#60a5fa', lineHeight: 1 }}>
                  {zoom}<span style={{ fontSize: 22, color: 'var(--text-4)' }}>%</span>
                </div>
                <p className="text-xs mt-1" style={{ color: 'var(--text-2)' }}>{ZOOM_LABELS[zoom]}</p>
                <p style={{ fontSize: 11, color: 'var(--text-4)', marginTop: 3 }}>{ZOOM_DESCRIPTIONS[zoom]}</p>
              </div>
            </div>

            {/* Slider */}
            <div className="flex items-center gap-3">
              <button
                className="btn-secondary flex items-center justify-center flex-shrink-0"
                style={{ width: 36, height: 36 }}
                onClick={() => !isMin && setZoom(ZOOM_LEVELS[zoomIdx - 1])}
                disabled={isMin}
                title="Zoom out"
              >
                <ZoomOut size={15} />
              </button>

              <div className="flex-1 relative" style={{ height: 20 }}>
                {/* Track */}
                <div
                  className="absolute"
                  style={{ top: '50%', transform: 'translateY(-50%)', left: 0, right: 0, height: 6, background: 'var(--bg-elevated)' }}
                />
                {/* Fill */}
                <div
                  className="absolute transition-all duration-150"
                  style={{
                    top: '50%', transform: 'translateY(-50%)', left: 0, height: 6,
                    background: 'linear-gradient(to right, #1d4ed8, #3b82f6)',
                    width: `${pct}%`,
                  }}
                />
                {/* Thumb */}
                <div
                  className="absolute transition-all duration-150"
                  style={{
                    top: '50%', transform: 'translate(-50%, -50%)',
                    left: `${pct}%`,
                    width: 16, height: 16,
                    background: '#3b82f6',
                    border: '2px solid var(--border-subtle)',
                    borderRadius: '50%',
                    boxShadow: '0 0 0 3px rgba(59,130,246,0.2)',
                  }}
                />
                <input
                  type="range"
                  min={0}
                  max={ZOOM_LEVELS.length - 1}
                  step={1}
                  value={zoomIdx}
                  onChange={e => setZoom(ZOOM_LEVELS[Number(e.target.value)])}
                  className="absolute inset-0 w-full opacity-0 cursor-pointer"
                  style={{ height: '100%', margin: 0 }}
                />
              </div>

              <button
                className="btn-secondary flex items-center justify-center flex-shrink-0"
                style={{ width: 36, height: 36 }}
                onClick={() => !isMax && setZoom(ZOOM_LEVELS[zoomIdx + 1])}
                disabled={isMax}
                title="Zoom in"
              >
                <ZoomIn size={15} />
              </button>
            </div>

            {/* Preset buttons */}
            <div>
              <p style={{ fontSize: 11, color: 'var(--text-4)', marginBottom: 8 }}>Quick presets</p>
              <div className="flex flex-wrap gap-1.5">
                {ZOOM_LEVELS.map(level => (
                  <button
                    key={level}
                    onClick={() => setZoom(level)}
                    className="px-2.5 py-1 text-2xs font-medium transition-all"
                    style={zoom === level ? {
                      background: 'rgba(37,99,235,0.2)',
                      color: '#60a5fa',
                      border: '1px solid rgba(37,99,235,0.4)',
                    } : {
                      background: 'var(--bg-card)',
                      color: 'var(--text-4)',
                      border: '1px solid var(--bg-elevated)',
                    }}
                  >
                    {level}%
                  </button>
                ))}
              </div>
            </div>

            {/* Reset */}
            {zoom !== 100 && (
              <div
                className="flex items-center justify-between pt-3"
                style={{ borderTop: '1px solid var(--border-subtle)' }}
              >
                <p style={{ fontSize: 11, color: 'var(--text-4)' }}>You've changed zoom from the default (100%)</p>
                <button className="btn-ghost gap-1.5 text-2xs" onClick={() => setZoom(100)}>
                  <RotateCcw size={11} /> Reset to 100%
                </button>
              </div>
            )}
          </div>

          {/* ── Tickets per page card ─────────────────────────────────── */}
          <div className="panel p-6 mt-4 space-y-4">
            <div className="flex items-center gap-3">
              <List size={15} style={{ color: '#60a5fa', flexShrink: 0 }} />
              <div>
                <p className="text-xs font-semibold" style={{ color: 'var(--text-1)' }}>Tickets per Page</p>
                <p style={{ fontSize: 11, color: 'var(--text-4)', marginTop: 2 }}>
                  Controls how many tickets load on the Requests page.
                </p>
              </div>
            </div>

            {/* Presets */}
            <div>
              <p style={{ fontSize: 11, color: 'var(--text-4)', marginBottom: 8 }}>Presets</p>
              <div className="flex flex-wrap gap-1.5">
                {PER_PAGE_PRESETS.map(n => (
                  <button
                    key={n}
                    onClick={() => { setPerPage(n); setCustomMode(false); setCustomInput(''); }}
                    className="px-3 py-1.5 text-2xs font-medium transition-all"
                    style={!customMode && perPage === n ? {
                      background: 'rgba(37,99,235,0.2)',
                      color: '#60a5fa',
                      border: '1px solid rgba(37,99,235,0.4)',
                    } : {
                      background: 'var(--bg-card)',
                      color: 'var(--text-4)',
                      border: '1px solid var(--bg-elevated)',
                    }}
                  >
                    {n}
                  </button>
                ))}
                <button
                  onClick={() => { setCustomMode(true); setCustomInput(String(perPage)); }}
                  className="px-3 py-1.5 text-2xs font-medium transition-all"
                  style={customMode ? {
                    background: 'rgba(37,99,235,0.2)',
                    color: '#60a5fa',
                    border: '1px solid rgba(37,99,235,0.4)',
                  } : {
                    background: 'var(--bg-card)',
                    color: 'var(--text-4)',
                    border: '1px solid var(--bg-elevated)',
                  }}
                >
                  Custom
                </button>
              </div>
            </div>

            {/* Custom input */}
            {customMode && (
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={1}
                  max={100}
                  className="input"
                  style={{ width: 100, textAlign: 'center' }}
                  placeholder="1–100"
                  value={customInput}
                  onChange={e => setCustomInput(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      const n = parseInt(customInput, 10);
                      if (!isNaN(n)) setPerPage(n);
                    }
                  }}
                />
                <button
                  className="btn-primary"
                  style={{ fontSize: 11, padding: '6px 14px' }}
                  onClick={() => {
                    const n = parseInt(customInput, 10);
                    if (!isNaN(n)) setPerPage(n);
                  }}
                >
                  Apply
                </button>
                <span style={{ fontSize: 11, color: 'var(--text-4)' }}>Max 100</span>
              </div>
            )}

            {/* Current value */}
            <div
              className="flex items-center gap-2 pt-2"
              style={{ borderTop: '1px solid var(--border-subtle)' }}
            >
              <span style={{ fontSize: 11, color: 'var(--text-4)' }}>Currently showing</span>
              <span className="text-xs font-semibold" style={{ color: '#60a5fa' }}>{perPage}</span>
              <span style={{ fontSize: 11, color: 'var(--text-4)' }}>tickets per page</span>
            </div>
          </div>

          {/* Info box */}
          <div
            className="mt-4 flex items-start gap-3 px-4 py-3"
            style={{ background: 'rgba(37,99,235,0.06)', border: '1px solid rgba(37,99,235,0.15)' }}
          >
            <Monitor size={14} style={{ color: '#60a5fa', flexShrink: 0, marginTop: 1 }} />
            <div>
              <p className="text-xs font-medium" style={{ color: '#93c5fd' }}>Browser-local settings</p>
              <p style={{ fontSize: 11, color: 'var(--text-4)', marginTop: 3 }}>
                These settings are stored in your browser only. Signing in from a different device or browser will use the defaults until you set them again. Other users on this system are not affected.
              </p>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
