// Orquestación: login, buscar torneos de los días objetivo, elegir la mejor
// línea, reservar (si corresponde) y avisar por WhatsApp.

import { getConfig, minutesToHHMM, type Weekday } from './config';
import { NewmanClient, pickBestSlot, type Slot, type Tournament } from './newman';
import { sendWhatsApp } from './twilio';
import { defaultPartners, apodoFor } from './roster';

export interface DayReport {
  day: Weekday;
  tournament?: Pick<Tournament, 'torneoId' | 'date' | 'name' | 'reservasStatus'>;
  status:
    | 'sin_torneo'        // todavía no se publicó el torneo de ese día
    | 'cerradas'          // torneo publicado pero reservas no abiertas
    | 'ya_reservado'      // ya tengo reserva en ese torneo
    | 'sin_lugares'       // abierto pero sin lugares libres
    | 'disponible'        // hay lugares (modo sólo aviso)
    | 'reservado'         // reservé recién
    | 'error_reserva';    // intenté reservar y falló
  bestSlot?: Slot;
  freeSlots?: Slot[];
  detail?: string;
}

export interface RunResult {
  ranAt: string;
  autoBook: boolean;
  reports: DayReport[];
  notified: boolean;
  notifyDetail?: string;
}

function isOpen(status: string): boolean {
  return /abiert/i.test(status);
}

export async function run(opts: { dryRun?: boolean } = {}): Promise<RunResult> {
  const cfg = getConfig();
  const ranAt = new Date().toISOString();
  if (!cfg.user || !cfg.pass) {
    return { ranAt, autoBook: cfg.autoBook, reports: [], notified: false, notifyDetail: 'Faltan NEWMAN_USER / NEWMAN_PASS.' };
  }

  // Acompañantes: los de la env var si están, si no el plantel predeterminado.
  const partners = cfg.partners.length ? cfg.partners : defaultPartners();
  const lineupLabel = [cfg.user, ...partners].map(apodoFor).join(', ');

  const client = new NewmanClient();
  await client.login(cfg.user, cfg.pass);
  const tournaments = await client.listTournaments();

  const reports: DayReport[] = [];
  const bookedMessages: string[] = [];
  const availableMessages: string[] = [];

  for (const day of cfg.targetDays) {
    const t = tournaments.find((x) => x.day === day);
    if (!t) {
      reports.push({ day, status: 'sin_torneo', detail: 'El torneo de ese día todavía no está publicado.' });
      continue;
    }
    const tslim = { torneoId: t.torneoId, date: t.date, name: t.name, reservasStatus: t.reservasStatus };
    if (!isOpen(t.reservasStatus)) {
      reports.push({ day, tournament: tslim, status: 'cerradas', detail: `Estado: ${t.reservasStatus}.` });
      continue;
    }

    const sheet = await client.getSheet(t.torneoId, cfg.user);
    if (sheet.alreadyMine) {
      reports.push({ day, tournament: tslim, status: 'ya_reservado' });
      continue;
    }
    const best = pickBestSlot(sheet.slots, cfg.targetMinutes);
    if (!best) {
      reports.push({ day, tournament: tslim, status: 'sin_lugares' });
      continue;
    }

    // Hay lugar. Reservar o sólo avisar.
    if (cfg.autoBook && !opts.dryRun) {
      const res = await client.book(t.torneoId, best, cfg.user, partners);
      if (res.ok) {
        reports.push({ day, tournament: tslim, status: 'reservado', bestSlot: best });
        bookedMessages.push(
          `✅ ${capitalize(day)} ${t.date} — reservado ${best.label} (hoyo ${best.hoyo}).\n` +
            `${t.name}\nJugadores: ${lineupLabel}`
        );
      } else {
        reports.push({ day, tournament: tslim, status: 'error_reserva', bestSlot: best, detail: res.message });
        availableMessages.push(
          `⚠️ ${capitalize(day)} ${t.date} — había lugar ${best.label} pero falló la reserva: ${res.message}\n` +
            `Reservá manual: https://www.clubnewmangolf.com/golf/login.php`
        );
      }
    } else {
      reports.push({ day, tournament: tslim, status: 'disponible', bestSlot: best, freeSlots: sheet.slots });
      const top = sheet.slots
        .slice()
        .sort((a, b) => Math.abs(a.minutes - cfg.targetMinutes) - Math.abs(b.minutes - cfg.targetMinutes))
        .slice(0, 5)
        .map((s) => `${s.label} (${s.free} libre${s.free > 1 ? 's' : ''})`)
        .join(', ');
      availableMessages.push(
        `🟢 ${capitalize(day)} ${t.date} — hay lugares en "${t.name}".\n` +
          `Mejor cercano a ${minutesToHHMM(cfg.targetMinutes)}: ${best.label}.\nOpciones: ${top}`
      );
    }
  }

  // Notificar sólo si hubo algo accionable (reserva hecha o aviso de disponibilidad).
  let notified = false;
  let notifyDetail: string | undefined;
  const msgs = [...bookedMessages, ...availableMessages];
  if (msgs.length) {
    const r = await sendWhatsApp(cfg, ['🏌️ Golfito — Club Newman', '', ...msgs].join('\n'));
    notified = r.sent;
    notifyDetail = r.detail;
  }

  return { ranAt, autoBook: cfg.autoBook, reports, notified, notifyDetail };
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
