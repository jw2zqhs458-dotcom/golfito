// Configuración leída desde variables de entorno (Vercel → Settings → Environment Variables).
// Ver .env.example para la lista completa y valores de ejemplo.

export type Weekday =
  | 'domingo'
  | 'lunes'
  | 'martes'
  | 'miercoles'
  | 'jueves'
  | 'viernes'
  | 'sabado';

export interface Config {
  /** Número de matrícula del socio (usuario de login). */
  user: string;
  /** Clave de acceso al sitio del club. */
  pass: string;
  /** Apellido del socio, usado para detectar reservas ya hechas (idempotencia). */
  surname: string;
  /** Matrículas de los acompañantes habituales que completan la línea. */
  partners: string[];
  /** Días para los que se buscan líneas. */
  targetDays: Weekday[];
  /** Horario objetivo (minutos desde medianoche). Se elige la línea más cercana. */
  targetMinutes: number;
  /** Si es true, reserva automáticamente; si es false, sólo avisa. */
  autoBook: boolean;
  /** Secreto que protege el endpoint de cron. */
  cronSecret: string;
  twilio: {
    accountSid?: string;
    authToken?: string;
    /** Ej: "whatsapp:+14155238886" (número/sandbox de Twilio). */
    from?: string;
    /** Ej: "whatsapp:+5491122334455" (tu WhatsApp). */
    to?: string;
  };
}

const DAY_ALIASES: Record<string, Weekday> = {
  domingo: 'domingo', sunday: 'domingo', dom: 'domingo',
  lunes: 'lunes', monday: 'lunes', lun: 'lunes',
  martes: 'martes', tuesday: 'martes', mar: 'martes',
  miercoles: 'miercoles', 'miércoles': 'miercoles', wednesday: 'miercoles', mie: 'miercoles',
  jueves: 'jueves', thursday: 'jueves', jue: 'jueves',
  viernes: 'viernes', friday: 'viernes', vie: 'viernes',
  sabado: 'sabado', 'sábado': 'sabado', saturday: 'sabado', sab: 'sabado',
};

function parseDays(raw: string | undefined): Weekday[] {
  const def: Weekday[] = ['sabado', 'domingo'];
  if (!raw) return def;
  const out: Weekday[] = [];
  for (const part of raw.split(/[,\s]+/).map((s) => s.trim().toLowerCase()).filter(Boolean)) {
    const d = DAY_ALIASES[part];
    if (d && !out.includes(d)) out.push(d);
  }
  return out.length ? out : def;
}

function parseTime(raw: string | undefined): number {
  // Acepta "10:00", "10", "10:30". Default 10:00 → 600 minutos.
  if (!raw) return 600;
  const m = raw.match(/^(\d{1,2})(?::(\d{2}))?$/);
  if (!m) return 600;
  return parseInt(m[1], 10) * 60 + (m[2] ? parseInt(m[2], 10) : 0);
}

function parseList(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw.split(/[,\s]+/).map((s) => s.trim()).filter(Boolean);
}

export function getConfig(): Config {
  const env = process.env;
  return {
    user: env.NEWMAN_USER ?? '',
    pass: env.NEWMAN_PASS ?? '',
    surname: (env.NEWMAN_SURNAME ?? '').toUpperCase().trim(),
    partners: parseList(env.NEWMAN_PARTNERS),
    targetDays: parseDays(env.NEWMAN_TARGET_DAYS),
    targetMinutes: parseTime(env.NEWMAN_TARGET_TIME),
    // Por seguridad arranca en modo SÓLO AVISO. Poné NEWMAN_AUTO_BOOK=true
    // explícitamente cuando quieras que reserve solo.
    autoBook: (env.NEWMAN_AUTO_BOOK ?? 'false').toLowerCase() === 'true',
    cronSecret: env.CRON_SECRET ?? '',
    twilio: {
      accountSid: env.TWILIO_ACCOUNT_SID,
      authToken: env.TWILIO_AUTH_TOKEN,
      from: env.TWILIO_WHATSAPP_FROM,
      to: env.TWILIO_WHATSAPP_TO,
    },
  };
}

export function minutesToHHMM(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}
