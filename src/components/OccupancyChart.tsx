import React from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';

interface OccupancyData {
  time: string;
  count: number;
}

interface OccupancyChartProps {
  data: OccupancyData[];
}

export function OccupancyChart({ data }: OccupancyChartProps) {
  return (
    <div className="bg-[#151619] border border-zinc-800/80 rounded-xl p-5 shadow-lg h-64 flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-mono text-zinc-400 uppercase tracking-widest">Hourly Occupancy</h3>
      </div>
      <div className="flex-1 w-full h-full min-h-0">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
            <XAxis 
              dataKey="time" 
              stroke="#52525b" 
              fontSize={10} 
              tickLine={false}
              axisLine={false}
              dy={10}
            />
            <YAxis 
              stroke="#52525b" 
              fontSize={10} 
              tickLine={false}
              axisLine={false}
              dx={-10}
            />
            <Tooltip
              contentStyle={{ 
                backgroundColor: '#18181b', 
                border: '1px solid #27272a',
                borderRadius: '8px',
                fontSize: '12px',
                fontFamily: 'monospace'
              }}
              itemStyle={{ color: '#34d399' }}
              cursor={{ fill: '#27272a', opacity: 0.4 }}
            />
            <Bar dataKey="count" radius={[4, 4, 0, 0]}>
              {data.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.count > 15 ? '#fbbf24' : '#10b981'} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
