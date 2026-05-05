import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';

interface StatCardProps {
  title: string;
  value: number;
  icon: React.ReactNode;
  accent?: 'emerald' | 'rose' | 'indigo' | 'amber';
  history?: number[];
  suffix?: string;
}

export function StatCard({ title, value, icon, accent = 'indigo', history = [], suffix = '' }: StatCardProps) {
  const accentColors = {
    emerald: 'text-emerald-400',
    rose: 'text-rose-400',
    indigo: 'text-indigo-400',
    amber: 'text-amber-400',
  };

  const accentBg = {
    emerald: 'bg-emerald-500/50',
    rose: 'bg-rose-500/50',
    indigo: 'bg-indigo-500/50',
    amber: 'bg-amber-500/50',
  };
  
  const strokeColors = {
    emerald: '#34d399',
    rose: '#fb7185',
    indigo: '#818cf8',
    amber: '#fbbf24',
  };

  // Generate SVG path for sparkline
  const generateSparkline = () => {
    if (history.length < 2) return null;
    
    const max = Math.max(...history, 1);
    const min = Math.min(...history, 0);
    const range = max - min || 1;
    
    const width = 100;
    const height = 30;
    const padding = 2;
    
    const points = history.map((val, i) => {
      const x = (i / (history.length - 1)) * (width - padding * 2) + padding;
      const y = height - padding - ((val - min) / range) * (height - padding * 2);
      return `${x},${y}`;
    }).join(' L ');

    return `M ${points}`;
  };

  return (
    <div className="bg-[#151619] border border-zinc-800/80 rounded-lg p-5 shadow-lg flex flex-col justify-between relative overflow-hidden group">
      <div className="flex items-center justify-between mb-4">
        <p className="text-xs font-mono text-zinc-500 uppercase tracking-widest">{title}</p>
        <div className={`w-8 h-8 rounded-md bg-zinc-900 border border-zinc-800 flex items-center justify-center ${accentColors[accent]}`}>
          {icon}
        </div>
      </div>
      
      <div className="flex items-end justify-between">
        <div className="flex items-baseline gap-2 overflow-hidden h-10">
          <AnimatePresence mode="popLayout">
            <motion.p
              key={value}
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: -20, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="text-4xl font-mono font-medium text-zinc-100 tracking-tight"
            >
              {value.toString().padStart(3, '0')}{suffix}
            </motion.p>
          </AnimatePresence>
        </div>
        
        {history.length > 1 && (
          <div className="w-24 h-8 opacity-60 group-hover:opacity-100 transition-opacity">
            <svg viewBox="0 0 100 30" className="w-full h-full overflow-visible">
              <motion.path
                d={generateSparkline() || ''}
                fill="none"
                stroke={strokeColors[accent]}
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                initial={{ pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={{ duration: 0.5 }}
              />
            </svg>
          </div>
        )}
      </div>
      
      {/* Decorative hardware lines */}
      <div className="absolute bottom-0 left-0 w-full h-[2px] bg-zinc-800/50">
        <div className={`h-full w-1/3 ${accentBg[accent]} transition-all duration-500 group-hover:w-full`} />
      </div>
    </div>
  );
}
