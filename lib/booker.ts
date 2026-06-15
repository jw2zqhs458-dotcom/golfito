// Reserva usando un navegador real (Playwright + Chromium). Es el único modo
// que pasa el bot-protection de Cloudflare en la confirmación del alta.
//
// Flujo (replica al usuario, salteando "Verificar" porque las matrículas ya
// están validadas: se cargan los números y se confirma directo):
//   login -> abrir planilla -> click en el casillero (altaReserva) ->
//   cargar matrículas en txtID1..N -> Confirmar (agregarReservas) -> verificar.

import { launchBrowser } from './browser';
import { parseFreeSlots, pickBestSlot, hasMyReservation, type Slot } from './newman';

const BASE = 'https://www.clubnewmangolf.com/golf';

export interface BrowserBookResult {
  ok: boolean;
  message: string;
  slot?: Slot;
  players?: string[];
  alreadyBooked?: boolean;
}

export async function bookWithBrowser(opts: {
  user: string;
  pass: string;
  torneoId: string;
  matricula: string;
  partners: string[];
  targetMinutes: number;
}): Promise<BrowserBookResult> {
  const { user, pass, torneoId, matricula, partners, targetMinutes } = opts;
  const browser = await launchBrowser();
  try {
    const ctx = await browser.newContext({ ignoreHTTPSErrors: true, locale: 'es-AR' });
    const page = await ctx.newPage();
    page.setDefaultTimeout(30000);

    // 1) Login
    await page.goto(`${BASE}/login.php`, { waitUntil: 'domcontentloaded' });
    await page.fill('input[name=username]', user);
    await page.fill('input[name=password]', pass);
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'domcontentloaded' }).catch(() => undefined),
      page.click('input[name=submit]'),
    ]);

    // 2) Abrir la planilla del torneo
    const sheetUrl = `${BASE}/reservas.php?TorneoID=${encodeURIComponent(torneoId)}&vuelta=index2.php`;
    await page.goto(sheetUrl, { waitUntil: 'domcontentloaded' });
    let html = await page.content();

    if (hasMyReservation(html, matricula)) {
      return { ok: true, alreadyBooked: true, message: 'Ya tenías reserva en este torneo.' };
    }

    // 3) Elegir la línea libre más cercana al horario objetivo
    const slots = parseFreeSlots(html, matricula);
    const best = pickBestSlot(slots, targetMinutes);
    if (!best) {
      return { ok: false, message: 'No hay líneas libres en el torneo.' };
    }

    // 4) Disparar el "inicio" (equivale a clickear el casillero libre)
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'domcontentloaded' }).catch(() => undefined),
      page.evaluate(
        (args: { h: number; m: number; t: string; ho: number; mat: number }) => {
          // altaReserva(LoginID, Hora, Minuto, TorneoID, hoyo)
          (window as unknown as { altaReserva: (...a: unknown[]) => void }).altaReserva(
            args.mat, args.h, args.m, String(args.t), args.ho,
          );
        },
        { h: best.hora, m: best.minuto, t: torneoId, ho: best.hoyo, mat: Number(matricula) },
      ),
    ]);

    // 5) Esperar el formulario de jugadores y cargar las matrículas
    await page.waitForSelector('input[name=txtID1]', { timeout: 30000 });
    const rows = await page.locator('input[name^="txtID"]').count();
    const players = [matricula, ...partners].slice(0, Math.max(1, Math.min(rows, 4)));
    for (let i = 0; i < players.length; i++) {
      await page.fill(`input[name=txtID${i + 1}]`, players[i]);
    }

    // 6) Confirmar directo (sin Verificar)
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'domcontentloaded' }).catch(() => undefined),
      page.evaluate(() => {
        (window as unknown as { agregarReservas: () => void }).agregarReservas();
      }),
    ]);

    // 7) Verificar releyendo la planilla
    await page.goto(`${sheetUrl}&_=${Date.now()}`, { waitUntil: 'domcontentloaded' });
    html = await page.content();
    if (hasMyReservation(html, matricula)) {
      return { ok: true, message: 'Reserva confirmada.', slot: best, players };
    }
    return { ok: false, message: 'El club no confirmó la reserva (no aparece en la planilla).', slot: best };
  } catch (e) {
    return { ok: false, message: `Error en el navegador: ${(e as Error).message}` };
  } finally {
    await browser.close().catch(() => undefined);
  }
}
