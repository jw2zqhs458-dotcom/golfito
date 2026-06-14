'use client';

import { useState } from 'react';

interface Slot {
  label: string;
  hoyo: number;
  free: number;
}
interface Report {
  day: string;
  status: string;
  tournament?: { date: string; name: string; reservasStatus: string };
  bestSlot?: Slot;
  freeSlots?: Slot[];
  detail?: string;
}
interface RunResult {
  ranAt: string;
  autoBook: boolean;
  reports: Report[];
  notified: boolean;
  notifyDetail?: string;
}

const STATUS_LABEL: Record<string, string> = {
  sin_torneo: 'Torneo aún no publicado',
  cerradas: 'Reservas cerradas',
  ya_reservado: 'Ya tenés reserva ✅',
  sin_lugares: 'Sin lugares libres',
  disponible: 'Hay lugares 🟢',
  reservado: 'Reservado ✅',
  error_reserva: 'Error al reservar ⚠️',
};

export default function Home() {
  const [data, setData] = useState<RunResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function consultar() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/check');
      const json = await res.json();
      if (!json.ok) throw new Error(json.error ?? 'Error');
      setData(json);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main style={{ maxWidth: 720, margin: '0 auto', padding: '2rem 1.25rem' }}>
      <h1 style={{ margin: 0, fontSize: '2rem' }}>🏌️ Golfito</h1>
      <p style={{ opacity: 0.85 }}>
        Reservas automáticas en Club Newman para sábado y domingo, lo más cerca posible de las 10:00,
        con aviso por WhatsApp.
      </p>

      <button
        onClick={consultar}
        disabled={loading}
        style={{
          background: '#7cb342',
          color: '#05290f',
          border: 'none',
          padding: '0.7rem 1.3rem',
          borderRadius: 8,
          fontWeight: 700,
          fontSize: '1rem',
          cursor: loading ? 'default' : 'pointer',
        }}
      >
        {loading ? 'Consultando…' : 'Consultar disponibilidad (sin reservar)'}
      </button>

      {error && (
        <p style={{ color: '#ffb4a2', marginTop: '1rem' }}>Error: {error}</p>
      )}

      {data && (
        <section style={{ marginTop: '1.5rem' }}>
          <p style={{ opacity: 0.7, fontSize: '0.85rem' }}>
            Consultado: {new Date(data.ranAt).toLocaleString('es-AR')} · Auto-reserva:{' '}
            {data.autoBook ? 'activada' : 'desactivada'}
          </p>
          {data.reports.map((r, i) => (
            <div
              key={i}
              style={{
                background: 'rgba(255,255,255,0.06)',
                borderRadius: 10,
                padding: '1rem',
                marginBottom: '0.75rem',
              }}
            >
              <strong style={{ textTransform: 'capitalize', fontSize: '1.1rem' }}>{r.day}</strong>
              {r.tournament && <span style={{ opacity: 0.7 }}> · {r.tournament.date}</span>}
              <div style={{ marginTop: 4 }}>{STATUS_LABEL[r.status] ?? r.status}</div>
              {r.tournament && <div style={{ opacity: 0.8, fontSize: '0.9rem' }}>{r.tournament.name}</div>}
              {r.bestSlot && (
                <div style={{ marginTop: 6 }}>
                  Mejor horario: <strong>{r.bestSlot.label}</strong> (hoyo {r.bestSlot.hoyo})
                </div>
              )}
              {r.freeSlots && r.freeSlots.length > 0 && (
                <div style={{ marginTop: 6, fontSize: '0.85rem', opacity: 0.85 }}>
                  Libres: {r.freeSlots.map((s) => `${s.label}(${s.free})`).join('  ')}
                </div>
              )}
              {r.detail && <div style={{ marginTop: 6, fontSize: '0.85rem', opacity: 0.7 }}>{r.detail}</div>}
            </div>
          ))}
        </section>
      )}
    </main>
  );
}
