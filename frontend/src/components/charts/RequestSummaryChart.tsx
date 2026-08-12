'use client';

import { useTheme } from 'next-themes';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer,
} from 'recharts';
import type { VolumeDay } from '@/types/tickets';

function CustomTooltip({ active, payload, label }: {
  active?: boolean;
  payload?: { name: string; value: number; color: string }[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="chart-tooltip">
      <p className="font-medium mb-1">{label}</p>
      {payload.map(e => (
        <div key={e.name} className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full" style={{ background: e.color }} />
          <span style={{ color: 'var(--text-3)' }}>{e.name}:</span>
          <span className="font-medium">{e.value}</span>
        </div>
      ))}
    </div>
  );
}

export function RequestSummaryChart({ data = [] }: { data?: VolumeDay[] }) {
  const { resolvedTheme } = useTheme();
  const isLight = resolvedTheme === 'light';
  const gridColor = isLight ? '#e2e8f0' : 'var(--border-subtle)';
  const axisColor = isLight ? '#cbd5e1' : 'var(--border-md)';
  const tickColor = 'var(--text-4)';

  return (
    <ResponsiveContainer width="100%" height={200}>
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
        <XAxis dataKey="date" tick={{ fontSize: 10, fill: tickColor }} axisLine={{ stroke: axisColor }} tickLine={false} interval="preserveStartEnd" />
        <YAxis tick={{ fontSize: 10, fill: tickColor }} axisLine={{ stroke: axisColor }} tickLine={false} allowDecimals={false} />
        <Tooltip content={<CustomTooltip />} />
        <Line type="monotone" dataKey="inbound"   name="Inbound"   stroke="#3b82f6" strokeWidth={2} dot={false} />
        <Line type="monotone" dataKey="completed" name="Completed" stroke="#10b981" strokeWidth={2} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}
