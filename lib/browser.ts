// Lanza un Chromium real. En Vercel/serverless usa @sparticuz/chromium (un
// build de Chromium que entra en una función). En local usa el Chromium de
// Playwright. Hace falta un navegador de verdad porque Cloudflare bloquea la
// confirmación de reserva si la conexión no tiene "fingerprint" de navegador.

import type { Browser } from 'playwright-core';

const isServerless = !!(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);

export async function launchBrowser(): Promise<Browser> {
  if (isServerless) {
    const chromium = (await import('@sparticuz/chromium')).default;
    const { chromium: pw } = await import('playwright-core');
    return pw.launch({
      args: [...chromium.args, '--disable-blink-features=AutomationControlled'],
      executablePath: await chromium.executablePath(),
      headless: true,
    });
  }
  // Local: usa el paquete completo de Playwright (trae su propio Chromium).
  const { chromium } = await import('playwright');
  return chromium.launch({ headless: true });
}
