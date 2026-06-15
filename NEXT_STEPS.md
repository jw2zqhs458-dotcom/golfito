# 🌅 Pasos para mañana (sólo falta tu parte)

**El proyecto YA está deployado y en verde** en Vercel:
👉 **https://golfito-three.vercel.app**

El build con Chromium compila bien y cada push redeploya solo (la branch por
defecto del repo ya es la de trabajo, no hay que tocar branches). Falta sólo
cargar las variables, subir la memoria y validar.

> Comprobá que vive: abrí https://golfito-three.vercel.app/api/check —
> hoy responde *"Faltan NEWMAN_USER / NEWMAN_PASS"* (porque faltan las env vars).

## 1) Variables de entorno (Settings → Environment Variables)
```
NEWMAN_USER         = 129978
NEWMAN_PASS         = 129978
NEWMAN_SURNAME      = MACRI
NEWMAN_TARGET_DAYS  = sabado,domingo
NEWMAN_TARGET_TIME  = 10:00
NEWMAN_AUTO_BOOK    = false
CRON_SECRET         = 55e318736e9e34e8a8d71c1a353a5c5688636476c0bcbe3e
```
(Después, para WhatsApp: `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`,
`TWILIO_WHATSAPP_FROM`, `TWILIO_WHATSAPP_TO`.)

Redeploy después de cargar las variables (Deployments → … → Redeploy).

## 2) Memoria de la función (Chromium la necesita)
**Settings → Functions → Memory → 1024 MB** (o más). Redeploy.

## 3) Validar — el momento de la verdad 🎯
Con un torneo **abierto entre semana** (mirá el ID en la web; ej. el del día
siguiente), abrí en el navegador:
```
https://golfito-three.vercel.app/api/check
```
→ Debe listar torneos y disponibilidad (confirma que las **lecturas** andan).

Después, la reserva real con navegador:
```
https://golfito-three.vercel.app/api/book-test?secret=55e318736e9e34e8a8d71c1a353a5c5688636476c0bcbe3e&torneo=ID_DEL_TORNEO
```
- `{"ok":true,"message":"Reserva confirmada"}` → **¡pasó Cloudflare desde
  Vercel!** Todo funciona. Borrá esa reserva de prueba con la X roja.
- `{"ok":false,...}` → copiame la respuesta y los **Runtime Logs** de Vercel
  (Deployments → Functions → Logs) y lo ajusto. Causas típicas: memoria baja
  o el binario de Chromium (`@sparticuz/chromium`).

## 4) Activar el modo real (cuando la validación dé verde)
- `NEWMAN_AUTO_BOOK = true`.
- Para reservar con tu foursome: `NEWMAN_PARTNERS = 140777,173418,137512`
  (Oso, Bato, Juan). Dejalo vacío para reservar sólo vos.
- El cron corre cada 15 min (`vercel.json`). En **Hobby** el cron es lento
  (~1/día); para pollear rápido cuando abren las reservas del finde, usá un
  scheduler externo (cron-job.org) apuntando a
  `https://TU-APP.vercel.app/api/cron?secret=EL_SECRET` cada pocos minutos,
  o pasá a **Pro** y bajá el `schedule` en `vercel.json`.
  El endpoint del cron es `https://golfito-three.vercel.app/api/cron?secret=…`.

## Notas
- En **Hobby**, `maxDuration` máx es 60 s (puede ser justo con el arranque en
  frío de Chromium). En **Pro** subilo a 300 s para margen.
- El plantel y apodos están en `lib/roster.ts`.
- Cualquier ajuste de código que haga falta, lo pusheo y Vercel redeploya solo.
