import React, { useCallback, useMemo, useRef, useState } from 'react';
import { Bell, Camera, CameraOff, Clock, Eraser, Map, Moon, Pencil, ShieldCheck, ShieldAlert, Users, Volume2, VolumeX } from 'lucide-react';
import { CameraTracker, RestrictedZone, SecurityAlert } from './components/CameraTracker';

interface SecurityEvent {
  id: string;
  type: string;
  time: string;
  trackId: number;
}

const EVENT_LABELS: Record<SecurityAlert['type'], string> = {
  restricted: 'INTRUSÃO DETECTADA',
  loitering: 'PESSOA PARADA',
  offHours: 'MOVIMENTO FORA DO HORÁRIO'
};

export default function App() {
  const accessCode = import.meta.env.VITE_ZONE_ACCESS_CODE?.trim() || '';
  const isAccessConfigured = accessCode.length >= 8;
  const [isCameraOn, setIsCameraOn] = useState(false);
  const [peopleCount, setPeopleCount] = useState(0);
  const [restrictedZone, setRestrictedZone] = useState<RestrictedZone | null>(null);
  const [isDrawingZone, setIsDrawingZone] = useState(false);
  const [loiteringSeconds, setLoiteringSeconds] = useState(8);
  const [offHoursMode, setOffHoursMode] = useState(true);
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [events, setEvents] = useState<SecurityEvent[]>([]);
  const [activeRuleMessages, setActiveRuleMessages] = useState<string[]>([]);
  const [accessInput, setAccessInput] = useState('');
  const [accessError, setAccessError] = useState('');
  const [isAuthenticated, setIsAuthenticated] = useState(() => sessionStorage.getItem('zone.authenticated') === 'true');
  const activeMessagesKeyRef = useRef('');
  const audioContextRef = useRef<AudioContext | null>(null);

  const isAlerting = activeRuleMessages.length > 0;
  const statusLabel = isAlerting ? 'Alerta' : 'Normal';
  const mainAlert = activeRuleMessages[0] || '';

  const playIntrusionSound = useCallback(() => {
    if (!soundEnabled) return;

    const AudioContextClass = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;

    if (!audioContextRef.current) {
      audioContextRef.current = new AudioContextClass();
    }

    const audioContext = audioContextRef.current;
    if (audioContext.state === 'suspended') {
      audioContext.resume();
    }

    const gain = audioContext.createGain();
    gain.gain.setValueAtTime(0.001, audioContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.12, audioContext.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.65);
    gain.connect(audioContext.destination);

    [0, 0.22, 0.44].forEach((offset, index) => {
      const oscillator = audioContext.createOscillator();
      oscillator.type = 'square';
      oscillator.frequency.setValueAtTime(index % 2 === 0 ? 880 : 1120, audioContext.currentTime + offset);
      oscillator.connect(gain);
      oscillator.start(audioContext.currentTime + offset);
      oscillator.stop(audioContext.currentTime + offset + 0.14);
    });
  }, [soundEnabled]);

  const handleAlert = useCallback((alert: SecurityAlert) => {
    if (alert.type === 'restricted' || alert.type === 'offHours') {
      playIntrusionSound();
    }

    setEvents(previous => [
      {
        id: `${alert.timestamp}-${alert.trackId}-${alert.type}`,
        type: EVENT_LABELS[alert.type],
        time: new Date(alert.timestamp).toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit'
        }),
        trackId: alert.trackId
      },
      ...previous
    ].slice(0, 40));
  }, [playIntrusionSound]);

  const handleActiveRuleMessagesUpdate = useCallback((messages: string[]) => {
    const key = messages.join('|');
    if (key === activeMessagesKeyRef.current) return;
    activeMessagesKeyRef.current = key;
    setActiveRuleMessages(messages);
  }, []);

  const statusAccent = useMemo(() => {
    if (isAlerting) return 'border-rose-500/40 bg-rose-500/10 text-rose-200';
    return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200';
  }, [isAlerting]);

  const toggleCamera = () => {
    setIsCameraOn(previous => !previous);
    setPeopleCount(0);
    setActiveRuleMessages([]);
    activeMessagesKeyRef.current = '';
  };

  const clearZone = () => {
    setRestrictedZone(null);
    setIsDrawingZone(false);
  };

  const handleAccessSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!isAccessConfigured) return;

    if (accessInput === accessCode) {
      sessionStorage.setItem('zone.authenticated', 'true');
      setIsAuthenticated(true);
      setAccessInput('');
      setAccessError('');
      return;
    }

    setAccessError('Código de acesso inválido');
  };

  if (!isAccessConfigured) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top_left,rgba(14,165,233,0.13),transparent_34%),#09090b] p-6 text-zinc-100">
        <section className="w-full max-w-md rounded-lg border border-amber-400/30 bg-zinc-950/90 p-6 shadow-2xl">
          <div className="mb-5 flex h-11 w-11 items-center justify-center rounded-lg border border-amber-400/30 bg-amber-400/10">
            <ShieldAlert className="h-5 w-5 text-amber-200" />
          </div>
          <h1 className="text-xl font-semibold">Configuração de segurança necessária</h1>
          <p className="mt-3 text-sm leading-6 text-zinc-400">
            Defina a variável de ambiente <span className="font-mono text-amber-200">VITE_ZONE_ACCESS_CODE</span> com pelo menos 8 caracteres antes de publicar ou usar o painel.
          </p>
        </section>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top_left,rgba(14,165,233,0.13),transparent_34%),#09090b] p-6 text-zinc-100">
        <form onSubmit={handleAccessSubmit} className="w-full max-w-sm rounded-lg border border-zinc-800 bg-zinc-950/90 p-6 shadow-2xl">
          <div className="mb-5 flex h-11 w-11 items-center justify-center rounded-lg border border-sky-400/30 bg-sky-400/10">
            <span className="text-lg font-black tracking-tight text-sky-200">Z</span>
          </div>
          <h1 className="text-xl font-semibold">Acesso ao Zone</h1>
          <p className="mt-2 text-sm text-zinc-400">Digite o código de acesso para abrir o painel de monitoramento.</p>
          <label className="mt-5 block">
            <span className="text-sm font-medium text-zinc-300">Código de acesso</span>
            <input
              type="password"
              value={accessInput}
              onChange={(event) => {
                setAccessInput(event.target.value);
                setAccessError('');
              }}
              className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-zinc-100 outline-none transition focus:border-sky-400"
              autoComplete="current-password"
              autoFocus
            />
          </label>
          {accessError && <p className="mt-3 text-sm text-rose-300">{accessError}</p>}
          <button
            type="submit"
            className="mt-5 w-full rounded-lg border border-sky-400/30 bg-sky-400/10 px-4 py-2 text-sm font-semibold text-sky-100 transition hover:bg-sky-400/15"
          >
            Entrar
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(14,165,233,0.13),transparent_34%),#09090b] text-zinc-100">
      <header className="border-b border-zinc-800/90 bg-zinc-950/80 px-5 py-4 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-lg border border-sky-400/30 bg-sky-400/10 shadow-[0_0_22px_rgba(56,189,248,0.13)]">
              <span className="text-lg font-black tracking-tight text-sky-200">Z</span>
            </div>
            <div>
              <h1 className="text-xl font-semibold tracking-tight">Zone</h1>
              <p className="text-sm text-zinc-400">Câmera de segurança inteligente para baixo fluxo</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold ${statusAccent}`}>
              {isAlerting ? <ShieldAlert className="h-4 w-4" /> : <ShieldCheck className="h-4 w-4" />}
              {statusLabel}
            </div>
            <button
              onClick={toggleCamera}
              className={`flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-semibold transition ${
                isCameraOn
                  ? 'border-rose-500/30 bg-rose-500/10 text-rose-200 hover:bg-rose-500/15'
                  : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200 hover:bg-emerald-500/15'
              }`}
            >
              {isCameraOn ? <CameraOff className="h-4 w-4" /> : <Camera className="h-4 w-4" />}
              {isCameraOn ? 'Desligar câmera' : 'Ligar câmera'}
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto grid max-w-7xl gap-5 p-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        <section className={`min-w-0 overflow-hidden rounded-lg border bg-zinc-900/95 shadow-2xl ${
          isDrawingZone ? 'border-sky-400/45 shadow-sky-950/30' : 'border-zinc-800'
        }`}>
          <div className="flex flex-col gap-3 border-b border-zinc-800 bg-zinc-950/55 px-4 py-3 md:flex-row md:items-center md:justify-between">
            <div className="flex flex-wrap items-center gap-2 text-sm font-semibold text-zinc-200">
              <Camera className="h-4 w-4 text-sky-300" />
              Câmera ao vivo
              <span className={`rounded-full px-2 py-1 text-[11px] font-semibold uppercase tracking-wide ${
                restrictedZone ? 'bg-amber-500/10 text-amber-200 ring-1 ring-amber-400/25' : 'bg-zinc-800 text-zinc-400'
              }`}>
                {restrictedZone ? 'Zona ativa' : 'Sem zona'}
              </span>
              {isDrawingZone && (
                <span className="rounded-full bg-sky-500/10 px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-sky-200 ring-1 ring-sky-300/25">
                  Desenhando
                </span>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => setIsDrawingZone(previous => !previous)}
                disabled={!isCameraOn}
                className={`flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-45 ${
                  isDrawingZone
                    ? 'border-sky-400/50 bg-sky-500/15 text-sky-100'
                    : 'border-zinc-700 bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
                }`}
              >
                <Pencil className="h-4 w-4" />
                Desenhar área
              </button>
              <button
                onClick={clearZone}
                disabled={!restrictedZone}
                className="flex items-center gap-2 rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm font-medium text-zinc-300 transition hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-45"
              >
                <Eraser className="h-4 w-4" />
                Limpar
              </button>
            </div>
          </div>

          <div className="relative aspect-[4/3] bg-zinc-950">
            {mainAlert && (
              <div className="absolute left-4 top-4 z-30 rounded-lg border border-rose-300/50 bg-rose-500/20 px-4 py-3 text-sm font-bold tracking-wide text-rose-50 shadow-[0_0_24px_rgba(244,63,94,0.23)] backdrop-blur">
                {mainAlert}
              </div>
            )}
            <CameraTracker
              isCameraOn={isCameraOn}
              restrictedZone={restrictedZone}
              isDrawingZone={isDrawingZone}
              loiteringSeconds={loiteringSeconds}
              offHoursMode={offHoursMode}
              onPeopleCountUpdate={setPeopleCount}
              onZoneChange={(zone) => {
                setRestrictedZone(zone);
                setIsDrawingZone(false);
              }}
              onAlert={handleAlert}
              onActiveRuleMessagesUpdate={handleActiveRuleMessagesUpdate}
            />
          </div>
        </section>

        <aside className="space-y-5">
          <section className="rounded-lg border border-zinc-800 bg-zinc-900/95 p-4 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-zinc-200">Resumo</h2>
              <Users className="h-4 w-4 text-sky-300" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg border border-zinc-800 bg-zinc-950/80 p-4">
                <p className="text-xs uppercase tracking-wide text-zinc-500">Pessoas</p>
                <p className="mt-2 text-4xl font-semibold tabular-nums text-zinc-50">{peopleCount}</p>
              </div>
              <div className={`rounded-lg border p-4 ${statusAccent}`}>
                <p className="text-xs uppercase tracking-wide opacity-75">Status</p>
                <p className="mt-3 text-lg font-semibold">{statusLabel}</p>
              </div>
            </div>
          </section>

          <section className="rounded-lg border border-zinc-800 bg-zinc-900/95 p-4 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-zinc-200">Regras de segurança</h2>
              <Bell className="h-4 w-4 text-sky-300" />
            </div>

            <div className="space-y-3">
              <div className="rounded-lg border border-zinc-800 bg-zinc-950/80 p-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 text-sm font-medium text-zinc-200">
                    <Map className="h-4 w-4 text-amber-300" />
                    Área restrita
                  </div>
                  <span className={`rounded-full px-2 py-1 text-xs font-semibold ${restrictedZone ? 'bg-emerald-500/10 text-emerald-200' : 'bg-zinc-800 text-zinc-400'}`}>
                    {restrictedZone ? 'Definida' : 'Vazia'}
                  </span>
                </div>
              </div>

              <label className="block rounded-lg border border-zinc-800 bg-zinc-950/80 p-3">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <span className="flex items-center gap-2 text-sm font-medium text-zinc-200">
                    <Clock className="h-4 w-4 text-sky-300" />
                    Pessoa parada
                  </span>
                  <span className="text-sm font-semibold text-zinc-100">{loiteringSeconds}s</span>
                </div>
                <input
                  type="range"
                  min="3"
                  max="30"
                  value={loiteringSeconds}
                  onChange={(event) => setLoiteringSeconds(Number(event.target.value))}
                  className="h-2 w-full cursor-pointer accent-sky-400"
                />
              </label>

              <label className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-zinc-800 bg-zinc-950/80 p-3">
                <span className="flex items-center gap-2 text-sm font-medium text-zinc-200">
                  <Moon className="h-4 w-4 text-violet-300" />
                  Fora de horário
                </span>
                <input
                  type="checkbox"
                  checked={offHoursMode}
                  onChange={(event) => setOffHoursMode(event.target.checked)}
                  className="h-5 w-5 rounded border-zinc-700 accent-sky-400"
                />
              </label>

              <label className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-zinc-800 bg-zinc-950/80 p-3">
                <span className="flex items-center gap-2 text-sm font-medium text-zinc-200">
                  {soundEnabled ? <Volume2 className="h-4 w-4 text-emerald-300" /> : <VolumeX className="h-4 w-4 text-zinc-500" />}
                  Som de intrusão
                </span>
                <input
                  type="checkbox"
                  checked={soundEnabled}
                  onChange={(event) => setSoundEnabled(event.target.checked)}
                  className="h-5 w-5 rounded border-zinc-700 accent-sky-400"
                />
              </label>
            </div>
          </section>

          <section className="rounded-lg border border-zinc-800 bg-zinc-900/95 shadow-xl">
            <div className="flex items-center justify-between border-b border-zinc-800 bg-zinc-950/40 px-4 py-3">
              <h2 className="text-sm font-semibold text-zinc-200">Eventos</h2>
              <span className="rounded-full bg-zinc-800 px-2 py-1 text-xs font-semibold text-zinc-400">
                {events.length}
              </span>
            </div>

            <div className="max-h-[320px] overflow-y-auto p-3">
              {events.length === 0 ? (
                <div className="flex h-32 items-center justify-center rounded-lg border border-dashed border-zinc-800 text-sm text-zinc-500">
                  Nenhum evento registrado
                </div>
              ) : (
                <div className="space-y-2">
                  {events.map(event => (
                    <div key={event.id} className="rounded-lg border border-zinc-800 bg-zinc-950/80 p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-zinc-100">{event.type}</p>
                          <p className="mt-1 text-xs text-zinc-500">Pessoa #{event.trackId}</p>
                        </div>
                        <span className="text-xs font-medium tabular-nums text-zinc-400">{event.time}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>
        </aside>
      </main>
    </div>
  );
}
