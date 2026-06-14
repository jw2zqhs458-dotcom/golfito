// Webhook de WhatsApp (Twilio). Configurá esta URL en:
//   Twilio Console -> WhatsApp Sender -> "When a message comes in".
// Permite enviar comandos por chat:
//   "estado" / "check"  -> consulta disponibilidad sin reservar
//   "reservar" / "ya"   -> fuerza un intento de reserva ahora
//   cualquier otra cosa -> ayuda

import { NextRequest } from 'next/server';
import { run } from '@/lib/runner';
import { minutesToHHMM, getConfig } from '@/lib/config';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function twiml(message: string): Response {
  const safe = message.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const xml = `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${safe}</Message></Response>`;
  return new Response(xml, { headers: { 'Content-Type': 'text/xml' } });
}

export async function POST(req: NextRequest) {
  const form = await req.formData();
  const body = (form.get('Body')?.toString() ?? '').trim().toLowerCase();
  const cfg = getConfig();

  try {
    if (/^(estado|check|ver|disponible|consultar)/.test(body)) {
      const r = await run({ dryRun: true });
      const lines = r.reports.map((rep) => {
        const t = rep.tournament ? ` ${rep.tournament.date}` : '';
        const slot = rep.bestSlot ? ` → ${rep.bestSlot.label}` : '';
        return `• ${rep.day}${t}: ${rep.status}${slot}`;
      });
      return twiml(['🏌️ Estado actual:', ...lines].join('\n') || 'Sin datos.');
    }
    if (/^(reservar|reserva|ya|book)/.test(body)) {
      const r = await run();
      const lines = r.reports.map((rep) => `• ${rep.day}: ${rep.status}${rep.bestSlot ? ` (${rep.bestSlot.label})` : ''}`);
      return twiml(['🏌️ Intento de reserva:', ...lines].join('\n'));
    }
  } catch (e) {
    return twiml(`Error: ${(e as Error).message}`);
  }

  return twiml(
    [
      '🏌️ Golfito — comandos:',
      `• "estado" → ver disponibilidad (objetivo ${minutesToHHMM(cfg.targetMinutes)})`,
      '• "reservar" → intentar reservar ahora',
      '',
      `Días configurados: ${cfg.targetDays.join(', ')}`,
    ].join('\n')
  );
}
