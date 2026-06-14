// Cliente del sistema de reservas de Club Newman (Golfistics).
//
// El sitio es un PHP clásico que mantiene el estado por cookie de sesión.
// Flujo de reserva descubierto:
//   1. POST login.php           -> setea cookies de sesión
//   2. GET  torneoshabilitadosparareservas.php -> lista de torneos abiertos
//   3. GET  reservas.php?TorneoID=ID           -> planilla con los horarios
//        - cada posición libre es una llamada altaReserva(matricula,H,M,'ID',hoyo)
//   4. POST reservasalta.php (txtaction=inicio) -> abre el form de jugadores
//        (queda un slot "pendiente" en la sesión con una ventana de tiempo corta)
//   5. POST reservasalta.php (txtaction=verificar) -> valida una matrícula y trae el nombre
//   6. POST reservasalta.php (txtaction=agregar)    -> confirma la reserva
//
// Importante: del paso 4 al 6 hay que ser rápido; si pasa demasiado tiempo el
// sistema responde "EL TIEMPO DISPONIBLE PARA REALIZAR LA RESERVA HA FINALIZADO".

const BASE = 'https://www.clubnewmangolf.com/golf';

const DAY_NAMES = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];

export interface Tournament {
  torneoId: string;
  day: string; // nombre del día normalizado (sin acentos), ej "miercoles"
  rawDay: string;
  date: string; // dd/mm/yy tal como aparece
  name: string;
  modalidad: string;
  /** Estado de reservas: "Abiertas", "Solo Ver", "Cerradas", etc. */
  reservasStatus: string;
}

export interface Slot {
  hora: number;
  minuto: number;
  hoyo: number;
  /** Cantidad de posiciones libres en ese horario. */
  free: number;
  /** Minutos desde medianoche. */
  minutes: number;
  label: string; // "HH:MM"
}

export interface BookingResult {
  ok: boolean;
  message: string;
  slot?: Slot;
}

function stripAccents(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

/** Cliente con manejo manual de cookies (el sitio depende de la sesión). */
export class NewmanClient {
  private cookies = new Map<string, string>();

  private cookieHeader(): string {
    return Array.from(this.cookies.entries())
      .map(([k, v]) => `${k}=${v}`)
      .join('; ');
  }

  private storeSetCookies(res: Response) {
    // undici expone getSetCookie() para múltiples Set-Cookie.
    const anyHeaders = res.headers as unknown as { getSetCookie?: () => string[] };
    const list =
      typeof anyHeaders.getSetCookie === 'function'
        ? anyHeaders.getSetCookie()
        : (res.headers.get('set-cookie') ? [res.headers.get('set-cookie') as string] : []);
    for (const raw of list) {
      const first = raw.split(';')[0];
      const eq = first.indexOf('=');
      if (eq <= 0) continue;
      const name = first.slice(0, eq).trim();
      const value = first.slice(eq + 1).trim();
      if (value === 'deleted' || value === '') {
        this.cookies.delete(name);
      } else {
        this.cookies.set(name, value);
      }
    }
  }

  /** Decodifica como ISO-8859-1 (latin1), que es el charset del sitio. */
  private async readText(res: Response): Promise<string> {
    const buf = await res.arrayBuffer();
    return new TextDecoder('latin1').decode(buf);
  }

  private async get(path: string): Promise<string> {
    const res = await fetch(`${BASE}/${path}`, {
      method: 'GET',
      headers: {
        Cookie: this.cookieHeader(),
        'User-Agent': 'Mozilla/5.0 (golfito)',
      },
      redirect: 'manual',
    });
    this.storeSetCookies(res);
    return this.readText(res);
  }

  private async post(path: string, data: Record<string, string>): Promise<string> {
    const body = new URLSearchParams(data).toString();
    const res = await fetch(`${BASE}/${path}`, {
      method: 'POST',
      headers: {
        Cookie: this.cookieHeader(),
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'Mozilla/5.0 (golfito)',
      },
      body,
      redirect: 'manual',
    });
    this.storeSetCookies(res);
    return this.readText(res);
  }

  /** Inicia sesión. Lanza error si falla. */
  async login(user: string, pass: string): Promise<void> {
    // Primer GET para obtener PHPSESSID inicial.
    await this.get('login.php');
    const html = await this.post('login.php', {
      username: user,
      password: pass,
      autologin: '1',
      submit: 'Ingresar',
    });
    // El login exitoso redirige a index2.php y setea la cookie danielap_newman.
    const ok = html.includes("index2.php") || Array.from(this.cookies.keys()).some((k) => /newman$/.test(k));
    if (!ok) {
      throw new Error('Login fallido: revisá usuario/clave.');
    }
  }

  /** Lista de torneos habilitados para reservar. */
  async listTournaments(): Promise<Tournament[]> {
    const html = await this.get('torneoshabilitadosparareservas.php');
    return parseTournaments(html);
  }

  /** Trae la planilla de un torneo y devuelve los horarios con lugares libres. */
  async getSheet(torneoId: string, matricula: string): Promise<{ slots: Slot[]; alreadyMine: boolean; raw: string }> {
    const html = await this.get(`reservas.php?TorneoID=${encodeURIComponent(torneoId)}&vuelta=index2.php`);
    return {
      slots: parseFreeSlots(html, matricula),
      alreadyMine: hasMyReservation(html),
      raw: html,
    };
  }

  /**
   * Reserva un horario. Hace inicio -> verifica matrículas -> agregar.
   * players[0] debe ser la matrícula del socio.
   */
  async book(torneoId: string, slot: Slot, matricula: string, partners: string[]): Promise<BookingResult> {
    // Paso "inicio": abre el formulario de jugadores para este slot.
    const start = await this.post('reservasalta.php', {
      txtkey: matricula,
      txtkey2: String(slot.hora),
      txtkey3: String(slot.minuto),
      txtkey4: torneoId,
      txtkey5: String(slot.hoyo),
      txtaction: 'inicio',
    });
    if (/TIEMPO DISPONIBLE PARA REALIZAR LA RESERVA HA FINALIZADO/i.test(start)) {
      return { ok: false, message: 'El sistema cerró la ventana de reserva antes de empezar.', slot };
    }
    if (!/Confirmar reserva/i.test(start) && !/txtID1/i.test(start)) {
      return { ok: false, message: 'No se pudo abrir el formulario de reserva (¿slot ya tomado?).', slot };
    }

    // Verifica cada matrícula para obtener el nombre y completar el form.
    const all = [matricula, ...partners].slice(0, 4);
    const names: Record<number, string> = {};
    for (let i = 0; i < all.length; i++) {
      const row = i + 1;
      const vhtml = await this.post('reservasalta.php', {
        txtv: String(row),
        txtv2: all[i],
        txtv3: '',
        txtaction: 'verificar',
      });
      const name = extractInputValue(vhtml, `txtName${row}`);
      if (!name) {
        return { ok: false, message: `No se pudo validar la matrícula ${all[i]} (jugador ${row}).`, slot };
      }
      names[row] = name;
    }

    // Confirma la reserva con todos los jugadores.
    const fields: Record<string, string> = { txtaction: 'agregar' };
    for (let i = 0; i < 4; i++) {
      const row = i + 1;
      fields[`txtID${row}`] = all[i] ?? '';
      fields[`txtName${row}`] = names[row] ?? '';
    }
    const confirm = await this.post('reservasalta.php', fields);
    if (/TIEMPO DISPONIBLE PARA REALIZAR LA RESERVA HA FINALIZADO/i.test(confirm)) {
      return { ok: false, message: 'Se venció la ventana de tiempo al confirmar.', slot };
    }
    return { ok: true, message: 'Reserva confirmada.', slot };
  }
}

// ---------------------------------------------------------------------------
// Parsers (exportados para poder testearlos por separado).
// ---------------------------------------------------------------------------

export function parseTournaments(html: string): Tournament[] {
  // Cada celda de una fila repite onclick=...reservas("ID")>TEXTO</font>.
  // Agrupamos las celdas consecutivas con el mismo ID en un torneo.
  const re = /reservas\("(\d+)"\)>\s*([^<]*?)<\/font>/g;
  const groups: { id: string; cells: string[] }[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const id = m[1];
    const text = decodeEntities(m[2]).replace(/ /g, ' ').trim();
    const last = groups[groups.length - 1];
    if (last && last.id === id) last.cells.push(text);
    else groups.push({ id, cells: [text] });
  }

  return groups.map((g) => {
    const cells = g.cells;
    const rawDay = cells[0] ?? '';
    const day = stripAccents(rawDay.toLowerCase());
    const date = cells.find((c) => /^\d{2}\/\d{2}\/\d{2}$/.test(c)) ?? cells[1] ?? '';
    const name = cells[2] ?? '';
    const modalidad = cells[3] ?? '';
    // El estado de reservas suele ser la última celda con texto.
    const status =
      [...cells].reverse().find((c) => /abiert|solo ver|cerrad|inscrip/i.test(c)) ??
      cells[cells.length - 1] ??
      '';
    return {
      torneoId: g.id,
      day: DAY_NAMES.includes(day) ? day : day,
      rawDay,
      date,
      name,
      modalidad,
      reservasStatus: status,
    };
  });
}

export function parseFreeSlots(html: string, matricula: string): Slot[] {
  // Cada posición libre: altaReserva(MATRICULA,Hora,Minuto,'TID',hoyo)
  const esc = matricula.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(
    `altaReserva\\(\\s*${esc}\\s*,\\s*(\\d+)\\s*,\\s*(\\d+)\\s*,\\s*'?\\w+'?\\s*,\\s*(\\d+)\\s*\\)`,
    'g'
  );
  const map = new Map<string, Slot>();
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const hora = parseInt(m[1], 10);
    const minuto = parseInt(m[2], 10);
    const hoyo = parseInt(m[3], 10);
    const key = `${hora}:${minuto}:${hoyo}`;
    const existing = map.get(key);
    if (existing) {
      existing.free += 1;
    } else {
      map.set(key, {
        hora,
        minuto,
        hoyo,
        free: 1,
        minutes: hora * 60 + minuto,
        label: `${String(hora).padStart(2, '0')}:${String(minuto).padStart(2, '0')}`,
      });
    }
  }
  return Array.from(map.values()).sort((a, b) => a.minutes - b.minutes || a.hoyo - b.hoyo);
}

/** Detecta si el socio ya tiene una reserva en la planilla (por apellido). */
export function hasMyReservation(html: string, surname?: string): boolean {
  const s = (surname ?? process.env.NEWMAN_SURNAME ?? '').toUpperCase().trim();
  if (!s) return false;
  // Las reservas propias se pueden borrar -> aparece borrarReserva(...,'NOMBRE').
  const re = /borrarReserva\([^)]*\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    if (stripAccents(m[0].toUpperCase()).includes(stripAccents(s))) return true;
  }
  return false;
}

/** Elige el slot más cercano al horario objetivo (en minutos). */
export function pickBestSlot(slots: Slot[], targetMinutes: number): Slot | undefined {
  if (!slots.length) return undefined;
  return [...slots].sort((a, b) => {
    const da = Math.abs(a.minutes - targetMinutes);
    const db = Math.abs(b.minutes - targetMinutes);
    if (da !== db) return da - db;
    if (a.minutes !== b.minutes) return a.minutes - b.minutes;
    return a.hoyo - b.hoyo;
  })[0];
}

function extractInputValue(html: string, name: string): string | undefined {
  const re = new RegExp(`name="${name}"[^>]*?value="([^"]*)"`, 'i');
  const m = re.exec(html);
  if (m) return decodeEntities(m[1]).trim();
  // El atributo value puede ir antes del name.
  const re2 = new RegExp(`value="([^"]*)"[^>]*name="${name}"`, 'i');
  const m2 = re2.exec(html);
  return m2 ? decodeEntities(m2[1]).trim() : undefined;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&aacute;/g, 'á')
    .replace(/&eacute;/g, 'é')
    .replace(/&iacute;/g, 'í')
    .replace(/&oacute;/g, 'ó')
    .replace(/&uacute;/g, 'ú')
    .replace(/&ntilde;/g, 'ñ');
}
