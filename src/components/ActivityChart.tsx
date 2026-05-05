import React from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

interface ActivityChartProps {
  data: { time: string; intruders: number }[];
}

export function ActivityChart({ data }: ActivityChartProps) {
  if (data.length === 0) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center text-zinc-600 font-mono text-xs uppercase tracking-widest border border-dashed border-zinc-800/50 rounded-lg">
        <div className="w-8 h-8 border-2 border-zinc-700 border-t-zinc-500 rounded-full animate-spin mb-3" />
        Awaiting Data...
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
        <defs>
          <linearGradient id="colorIntruder" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#f43f5e" stopOpacity={0.2}/>
            <stop offset="95%" stopColor="#f43f5e" stopOpacity={0}/>
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="2 4" stroke="#27272a" vertical={false} />
        <XAxis 
          dataKey="time" 
          stroke="#52525b" 
          fontSize={10} 
          fontFamily="JetBrains Mono, monospace"
          tickLine={false}
          axisLine={false}
          dy={10}
        />
        <YAxis 
          stroke="#52525b" 
          fontSize={10}
          fontFamily="JetBrains Mono, monospace"
          tickLine={false}
          axisLine={false}
          allowDecimals={false}
          dx={-10}
          domain={[0, 'auto']}
        />
        <Tooltip 
          contentStyle={{ 
            backgroundColor: '#151619', 
            border: '1px solid #27272a', 
            borderRadius: '6px',
            fontFamily: 'JetBrains Mono, monospace',
            fontSize: '12px',
            boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.5)'
          }}
          itemStyle={{ color: '#f43f5e', fontSize: '12px', textTransform: 'uppercase' }}
          labelStyle={{ color: '#71717a', marginBottom: '8px', fontSize: '10px', textTransform: 'uppercase' }}
        />
        <Area 
          type="stepAfter" 
          dataKey="intruders" 
          name="Intruders"
          stroke="#f43f5e" 
          fillOpacity={1} 
          fill="url(#colorIntruder)" 
          strokeWidth={2}
          isAnimationActive={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
