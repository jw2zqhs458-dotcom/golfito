# 🏌️ Golfito — Reservas automáticas Club Newman

App en **Next.js** lista para desplegar en **Vercel** que:

1. Entra al sistema de socios de Club Newman (login con tu matrícula y clave).
2. Busca los torneos del **sábado** y **domingo** habilitados para reservar.
3. Elige la línea libre **más cercana a las 10:00**.
4. **Reserva automáticamente** completando la línea con las matrículas de tus
   acompañantes.
5. Te **avisa por WhatsApp** (vía Twilio) qué reservó.

Mientras los torneos del fin de semana no estén publicados, el sistema lo
reporta como `sin_torneo` y reintenta en cada corrida del cron. Apenas el club
abre las reservas, agarra la línea.

---

## Cómo funciona por dentro

El sitio del club (`clubnewmangolf.com/golf`, motor *Golfistics*) es un PHP con
estado de sesión por cookie. El flujo replicado en [`lib/newman.ts`](lib/newman.ts):

| Paso | Request | Para qué |
|------|---------|----------|
| Login | `POST login.php` | Obtiene las cookies de sesión |
| Listar | `GET torneoshabilitadosparareservas.php` | Torneos abiertos para reservar |
| Planilla | `GET reservas.php?TorneoID=…` | Horarios; cada lugar libre es un `altaReserva(matrícula,H,M,'ID',hoyo)` |
| Iniciar | `POST reservasalta.php` (`txtaction=inicio`) | Abre el form de jugadores y reserva el slot en la sesión |
| Validar | `POST reservasalta.php` (`txtaction=verificar`) | Valida cada matrícula y trae el nombre |
| Confirmar | `POST reservasalta.php` (`txtaction=agregar`) | Confirma la reserva con todos los jugadores |

> ⚠️ Entre *iniciar* y *confirmar* hay una ventana de tiempo corta: si se
> demora, el sistema responde *"EL TIEMPO DISPONIBLE … HA FINALIZADO"*. El
> código hace los tres pasos seguidos en la misma sesión.

Idempotencia: antes de reservar se revisa la planilla buscando tu apellido
(`NEWMAN_SURNAME`); si ya tenés lugar, no duplica.

### Plantel por defecto

En [`lib/roster.ts`](lib/roster.ts) está el "foursome" predeterminado (con
apodos), validado contra el sistema del club:

| Apodo | Matrícula | Nombre |
|-------|-----------|--------|
| yo   | 129978 | MACRI ANTONIO AUGUSTO |
| Oso  | 140777 | AZUMENDI SANTIAGO MARIA |
| Bato | 173418 | ARAMBURU BAUTISTA |
| Juan | 137512 | BENEDIT JUAN |

Si `NEWMAN_PARTNERS` no está seteada, se usan Oso, Bato y Juan como
acompañantes. Los avisos de WhatsApp muestran los apodos.

El formulario de reserva del club ofrece a veces 1 fila y a veces hasta 4
(según el cupo del socio en ese momento). `book()` lo maneja agregando a los
jugadores en tandas: repite inicio→verificar→agregar sobre la misma línea hasta
anotar a todos o agotar los lugares.

---

## Estructura

```
app/
  page.tsx              Dashboard: botón "Consultar disponibilidad" (no reserva)
  api/cron/route.ts     Cron de Vercel: busca y reserva automáticamente
  api/check/route.ts    Igual que cron pero en modo dryRun (sólo consulta)
  api/whatsapp/route.ts Webhook de Twilio para comandos por chat
lib/
  newman.ts             Cliente + parsers del sistema del club
  runner.ts             Orquestación (login → buscar → reservar → avisar)
  twilio.ts             Envío de WhatsApp por API REST
  config.ts             Lectura de variables de entorno
scripts/check.ts        Prueba local en modo dryRun
```

---

## Configuración (variables de entorno)

Copiá [`.env.example`](.env.example) y completá. En Vercel se cargan en
**Settings → Environment Variables**.

| Variable | Ejemplo | Descripción |
|----------|---------|-------------|
| `NEWMAN_USER` | `129978` | Número de matrícula (usuario) |
| `NEWMAN_PASS` | `••••••` | Clave del sitio |
| `NEWMAN_SURNAME` | `MACRI` | Apellido del socio (anti-duplicados) |
| `NEWMAN_TARGET_DAYS` | `sabado,domingo` | Días a buscar |
| `NEWMAN_TARGET_TIME` | `10:00` | Horario objetivo (línea más cercana) |
| `NEWMAN_PARTNERS` | `140777,173418` | Acompañantes (opcional; si se omite usa el plantel de `lib/roster.ts`) |
| `NEWMAN_AUTO_BOOK` | `true` | `true` reserva; `false` sólo avisa |
| `CRON_SECRET` | `xxxx` | Protege `/api/cron` |
| `TWILIO_ACCOUNT_SID` | `ACxxxx` | Twilio |
| `TWILIO_AUTH_TOKEN` | `xxxx` | Twilio |
| `TWILIO_WHATSAPP_FROM` | `whatsapp:+14155238886` | Remitente (sandbox o número propio) |
| `TWILIO_WHATSAPP_TO` | `whatsapp:+549…` | Tu WhatsApp |

---

## Desplegar en Vercel

1. Subí este repo a GitHub (ya está en la branch de trabajo).
2. En Vercel: **Add New → Project** e importá el repo.
3. Cargá las variables de entorno de la tabla.
4. Deploy. El cron de [`vercel.json`](vercel.json) corre cada 15 min y llama a
   `/api/cron`.

### Frecuencia del cron
- En el plan **Hobby** los cron jobs de Vercel se ejecutan con baja frecuencia
  (aprox. 1 vez por día). Para pollear rápido cuando se abren las reservas,
  usá un scheduler externo gratis (p. ej. **cron-job.org**) apuntando a:
  `https://TU-APP.vercel.app/api/cron?secret=TU_CRON_SECRET` cada pocos minutos.
- En **Pro** podés bajar el `schedule` de `vercel.json` a `*/2 * * * *`.

---

## Twilio WhatsApp

1. Creá una cuenta en Twilio y activá el **WhatsApp Sandbox** (o un número
   propio aprobado).
2. Para el sandbox, mandá el código de *join* al número de Twilio desde tu
   WhatsApp para habilitar la recepción.
3. Cargá `TWILIO_*` en Vercel.
4. (Opcional) Para responder comandos por chat, configurá en Twilio el webhook
   *"When a message comes in"* hacia `https://TU-APP.vercel.app/api/whatsapp`.

Comandos por WhatsApp:
- `estado` → muestra disponibilidad sin reservar.
- `reservar` → fuerza un intento de reserva ya.

---

## Probar localmente

```bash
npm install
cp .env.example .env   # completá los valores
npx tsx scripts/check.ts   # modo dryRun: consulta y muestra, NO reserva
npm run dev                # dashboard en http://localhost:3000
```

---

## Seguridad

- Las credenciales viven sólo en variables de entorno (no en el repo).
- `/api/cron` se protege con `CRON_SECRET` (Vercel manda el header
  `Authorization: Bearer <CRON_SECRET>` automáticamente).
- La app sólo opera **tu propia** cuenta de socio.
