import React from 'react';
import { Activity, Camera, Cpu, Server, Clock } from 'lucide-react';

interface StatusBarProps {
  fps: number;
  resolution: string;
  modelStatus: string;
  backendStatus: string;
  uptime: string;
  sessionId: string;
}

export function StatusBar({ fps, resolution, modelStatus, backendStatus, uptime, sessionId }: StatusBarProps) {
  return (
    <div className="fixed bottom-0 left-0 w-full h-8 bg-[#0a0a0c] border-t border-zinc-800/50 flex items-center justify-between px-4 z-40 text-[10px] font-mono text-zinc-500 uppercase tracking-wider">
      <div className="flex items-center gap-6">
        <div className="flex items-center gap-2">
          <Activity className={`w-3 h-3 ${fps > 15 ? 'text-emerald-500' : fps > 0 ? 'text-amber-500' : 'text-zinc-600'}`} />
          <span>FPS: {fps}</span>
        </div>
        <div className="flex items-center gap-2">
          <Camera className="w-3 h-3 text-zinc-600" />
          <span>RES: {resolution}</span>
        </div>
        <div className="flex items-center gap-2">
          <Cpu className={`w-3 h-3 ${modelStatus === 'Loaded' ? 'text-emerald-500' : 'text-amber-500'}`} />
          <span>MODEL: {modelStatus}</span>
        </div>
        <div className="flex items-center gap-2">
          <Server className={`w-3 h-3 ${backendStatus === 'Connected' ? 'text-emerald-500' : 'text-rose-500'}`} />
          <span>BACKEND: {backendStatus}</span>
        </div>
      </div>
      
      <div className="flex items-center gap-6">
        <div className="flex items-center gap-2">
          <Clock className="w-3 h-3 text-zinc-600" />
          <span>UPTIME: {uptime}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-zinc-600">SESSION:</span>
          <span className="text-zinc-400">{sessionId}</span>
        </div>
      </div>
    </div>
  );
}
