// Endpoint de validación: reserva con navegador real un torneo puntual para
// comprobar que el booking pasa Cloudflare desde Vercel.
//
//   GET /api/book-test?secret=CRON_SECRET&torneo=5724[&hora=10]
//
// Deja la reserva hecha (verificala en la web y borrala con la X roja).
// Protegido con CRON_SECRET.

import { NextRequest, NextResponse } from 'next/server';
import { getConfig } from '@/lib/config';
import { bookWithBrowser } from '@/lib/booker';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const cfg = getConfig();
  const url = new URL(req.url);
  const secret = url.searchParams.get('secret');
  if (cfg.cronSecret && secret !== cfg.cronSecret) {
    return NextResponse.json({ ok: false, error: 'No autorizado' }, { status: 401 });
  }
  const torneo = url.searchParams.get('torneo');
  if (!torneo) {
    return NextResponse.json({ ok: false, error: 'Falta ?torneo=ID' }, { status: 400 });
  }
  const hora = url.searchParams.get('hora');
  const targetMinutes = hora ? parseInt(hora, 10) * 60 : cfg.targetMinutes;

  try {
    const res = await bookWithBrowser({
      user: cfg.user,
      pass: cfg.pass,
      torneoId: torneo,
      matricula: cfg.user,
      partners: [], // sólo el socio en la prueba (no mailea a terceros)
      targetMinutes,
    });
    return NextResponse.json({ ...res });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
