import type { ReactNode } from 'react';

export const metadata = {
  title: 'Golfito — Reservas Club Newman',
  description: 'Busca líneas disponibles y reserva automáticamente, avisando por WhatsApp.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es">
      <body
        style={{
          fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
          margin: 0,
          background: '#0b3d1a',
          color: '#f0f2ee',
          minHeight: '100vh',
        }}
      >
        {children}
      </body>
    </html>
  );
}
