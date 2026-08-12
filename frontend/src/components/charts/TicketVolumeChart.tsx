'use client';

import { useTheme } from 'next-themes';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend,
} from 'recharts';

function CustomTooltip({ active, payload, label }: {
  active?: boolean;
  payload?: { name: string; value: number; color: string }[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="px-3 py-2 text-xs" style={{ background: 'var(--bg-base)', border: '1px solid var(--border-panel)' }}>
      <p className="font-semibold mb-1" style={{ color: 'var(--text-0)' }}>{label}</p>
      {payload.map(e => (
        <p key={e.name} style={{ color: e.color }}>{e.name}: {e.value}</p>
      ))}
    </div>
  );
}

export function TicketVolumeChart() {
  const { resolvedTheme } = useTheme();
  const isLight = resolvedTheme === 'light';
  const gridColor   = isLight ? '#e2e8f0' : 'var(--border-panel)';
  const tickColor   = 'var(--text-4)';
  const cursorColor = isLight ? '#e2e8f0' : 'var(--border-panel)';

  return (
    <ResponsiveContainer width="100%" height={220}>
      <AreaChart data={[]} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
        <defs>
          <linearGradient id="gradOpened" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor="#6366f1" stopOpacity={0.3} />
            <stop offset="95%" stopColor="#6366f1" stopOpacity={0}   />
          </linearGradient>
          <linearGradient id="gradSolved" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor="#10b981" stopOpacity={0.3} />
            <stop offset="95%" stopColor="#10b981" stopOpacity={0}   />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
        <XAxis dataKey="day" tick={{ fill: tickColor, fontSize: 11 }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fill: tickColor, fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
        <Tooltip content={<CustomTooltip />} cursor={{ stroke: cursorColor }} />
        <Legend wrapperStyle={{ fontSize: 11, color: 'var(--text-3)', paddingTop: 8 }} />
        <Area type="monotone" dataKey="opened" name="Opened" stroke="#6366f1" strokeWidth={2} fill="url(#gradOpened)" dot={false} />
        <Area type="monotone" dataKey="solved"  name="Solved"  stroke="#10b981" strokeWidth={2} fill="url(#gradSolved)"  dot={false} />
      </AreaChart>
    </ResponsiveContainer>
  );
}
