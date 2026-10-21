// Recordes, medalhas, opções e o fantasma do recorde de cada etapa, salvos no navegador.
const KEY = 'rallyvr.v1';
const GHOST_KEY = (id) => `rallyvr.ghost.${id}`;
const DEFAULTS = {
  best: {},         // por etapa: { time, medal } (medal 0..3 = melhor medalha já ganha)
  level: 1,         // último nível do rival escolhido
  comfort: true,    // escurece as bordas da visão nas curvas e saltos (VR)
  fps: false,
  view: 'chase',    // câmera no PC: 'chase' (atrás) | 'cockpit'
  recordGhost: true,// mostrar o fantasma do seu recorde
};

export function loadSave() {
  try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; }
  catch { return { ...DEFAULTS }; }
}

export function storeSave(s) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* sem armazenamento: segue sem salvar */ }
}

// Fantasma compactado (ver encodeGhost em ghost.js).
export function loadGhost(id) {
  try { return JSON.parse(localStorage.getItem(GHOST_KEY(id)) || 'null'); } catch { return null; }
}
export function storeGhost(id, data) {
  try { localStorage.setItem(GHOST_KEY(id), JSON.stringify(data)); } catch { /* cheio ou bloqueado */ }
}
