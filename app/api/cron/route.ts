// Endpoint disparado por Vercel Cron (ver vercel.json).
// Protegido por CRON_SECRET: Vercel envía el header "Authorization: Bearer <CRON_SECRET>".

import { NextRequest, NextResponse } from 'next/server';
import { getConfig } from '@/lib/config';
import { run } from '@/lib/runner';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function authorized(req: NextRequest): boolean {
  const cfg = getConfig();
  if (!cfg.cronSecret) return true; // sin secreto configurado, no se exige (no recomendado en prod)
  const header = req.headers.get('authorization') ?? '';
  const url = new URL(req.url);
  const qp = url.searchParams.get('secret');
  return header === `Bearer ${cfg.cronSecret}` || qp === cfg.cronSecret;
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ ok: false, error: 'No autorizado' }, { status: 401 });
  }
  try {
    const result = await run();
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
