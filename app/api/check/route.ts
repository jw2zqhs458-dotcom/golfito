// Chequeo manual: muestra qué hay disponible SIN reservar (dryRun).
// Útil para probar desde el navegador o la página principal.

import { NextResponse } from 'next/server';
import { run } from '@/lib/runner';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET() {
  try {
    const result = await run({ dryRun: true });
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
