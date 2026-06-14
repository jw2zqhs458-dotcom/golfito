// Prueba local: corre el flujo en modo dryRun (no reserva) usando las
// variables de entorno de tu .env. Ejecutar con: npx tsx scripts/check.ts
import { run } from '../lib/runner';

run({ dryRun: true })
  .then((r) => {
    console.log(JSON.stringify(r, null, 2));
  })
  .catch((e) => {
    console.error('Error:', e.message);
    process.exit(1);
  });
