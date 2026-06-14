// Plantel predeterminado (apodos → matrícula). El primero es el socio titular.
// Validado contra el sistema del club (los nombres son los que devuelve "verificar").

export interface Player {
  apodo: string;
  matricula: string;
  nombre: string;
}

export const ROSTER: Player[] = [
  { apodo: 'yo', matricula: '129978', nombre: 'MACRI ANTONIO AUGUSTO' },
  { apodo: 'Oso', matricula: '140777', nombre: 'AZUMENDI SANTIAGO MARIA' },
  { apodo: 'Bato', matricula: '173418', nombre: 'ARAMBURU BAUTISTA' },
  { apodo: 'Juan', matricula: '137512', nombre: 'BENEDIT JUAN' },
];

/** Matrículas de los acompañantes por defecto (todos menos el titular). */
export function defaultPartners(): string[] {
  return ROSTER.slice(1).map((p) => p.matricula);
}

/** Devuelve el apodo de una matrícula, o la misma matrícula si no está en el plantel. */
export function apodoFor(matricula: string): string {
  return ROSTER.find((p) => p.matricula === matricula)?.apodo ?? matricula;
}

/** Resuelve una lista de apodos/matrículas a matrículas. */
export function resolveToMatriculas(tokens: string[]): string[] {
  return tokens
    .map((t) => {
      const byApodo = ROSTER.find((p) => p.apodo.toLowerCase() === t.toLowerCase());
      return byApodo ? byApodo.matricula : t;
    })
    .filter(Boolean);
}
