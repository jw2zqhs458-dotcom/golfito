// Envío de mensajes de WhatsApp usando la API REST de Twilio.
// No requiere el SDK: basta una llamada autenticada con Basic Auth.

import type { Config } from './config';

export interface SendResult {
  sent: boolean;
  detail: string;
}

export async function sendWhatsApp(cfg: Config, message: string): Promise<SendResult> {
  const { accountSid, authToken, from, to } = cfg.twilio;
  if (!accountSid || !authToken || !from || !to) {
    return { sent: false, detail: 'Twilio no configurado (faltan credenciales); mensaje omitido.' };
  }
  const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
  const body = new URLSearchParams({
    From: from.startsWith('whatsapp:') ? from : `whatsapp:${from}`,
    To: to.startsWith('whatsapp:') ? to : `whatsapp:${to}`,
    Body: message,
  });
  const auth = Buffer.from(`${accountSid}:${authToken}`).toString('base64');
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: body.toString(),
    });
    if (!res.ok) {
      const txt = await res.text();
      return { sent: false, detail: `Twilio respondió ${res.status}: ${txt.slice(0, 300)}` };
    }
    return { sent: true, detail: 'WhatsApp enviado.' };
  } catch (e) {
    return { sent: false, detail: `Error al enviar WhatsApp: ${(e as Error).message}` };
  }
}
