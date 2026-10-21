// Superfícies da estrada: aderência (mu), velocidade máxima, arrasto extra, som e cor.
// "acost" é o acostamento (fora da estrada, antes da barreira). Sem navegador.
export const SURFACES = {
  asfalto: { name: 'Asfalto', mu: 1.0, vmax: 44, drag: 0, gravel: 0, color: 0x4a4b52 },
  terra: { name: 'Terra', mu: 0.74, vmax: 39, drag: 0, gravel: 1, color: 0xb35a32 },
  lama: { name: 'Lama', mu: 0.52, vmax: 26, drag: 1.4, gravel: 0.7, color: 0x5e4630 },
  neve: { name: 'Neve', mu: 0.5, vmax: 34, drag: 0.3, gravel: 0.6, color: 0xe6ecf4 },
  gelo: { name: 'Gelo', mu: 0.3, vmax: 34, drag: 0, gravel: 0.1, color: 0xa9d2ec },
  acost: { name: 'Fora da estrada', mu: 0.55, vmax: 20, drag: 2.2, gravel: 1, color: 0x7a6a4a },
};
export const SURFACE_IDS = Object.keys(SURFACES);
