'use client';

import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';

interface Slice { name: string; value: number; color: string; }
interface Props  { data: Slice[]; }

function CustomTooltip({ active, payload }: { active?: boolean; payload?: { name: string; value: number; payload: Slice }[] }) {
  if (!active || !payload?.length) return null;
  const d = payload[0];
  return (
    <div className="chart-tooltip">
      <span style={{ color: d.payload.color }}>{d.name}: </span>
      <span style={{ color: '#e2e8f0' }}>{d.value}</span>
    </div>
  );
}

export function PriorityDonutChart({ data }: Props) {
  const total = data.reduce((s, d) => s + d.value, 0);

  return (
    <div className="flex items-center gap-4">
      <div style={{ width: 160, height: 160, flexShrink: 0 }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius={45}
              outerRadius={70}
              paddingAngle={2}
              dataKey="value"
              strokeWidth={0}
            >
              {data.map((entry, i) => (
                <Cell key={i} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip content={<CustomTooltip />} />
          </PieChart>
        </ResponsiveContainer>
      </div>

      <div className="flex flex-col gap-2">
        {data.map(d => (
          <div key={d.name} className="flex items-center justify-between gap-6">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: d.color }} />
              <span style={{ fontSize: 12, color: '#a0aec0' }}>{d.name}</span>
            </div>
            <span className="font-semibold tabular-nums" style={{ fontSize: 12, color: '#e2e8f0' }}>{d.value}</span>
          </div>
        ))}
        <div
          className="flex items-center justify-between gap-6 mt-1 pt-2"
          style={{ borderTop: '1px solid #2a2f3d' }}
        >
          <span style={{ fontSize: 11, color: '#475569' }}>Total</span>
          <span className="font-bold tabular-nums" style={{ fontSize: 12, color: '#e2e8f0' }}>{total}</span>
        </div>
      </div>
    </div>
  );
}
