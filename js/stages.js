// As 3 etapas. path = caminho de tartaruga (['S', m] reta; ['L'|'R', graus, raio] curva), no
// sentido da corrida, começando na largada. elev = relevo [fração, altura]; crests = cristas de
// salto (seg = índice no path de uma reta, a crista fica no meio dela; len; h); surfaces = [fração onde começa, superfície];
// splits = pontos de parcial (fração). Sem navegador.
export const STAGES = [
  {
    id: 'terra', name: 'Terra Vermelha', desc: 'Estrada de terra no cerrado, fim de tarde.',
    width: 9, verge: 2.5,
    path: [['S', 181], ['R', 40, 60], ['L', 70, 80], ['S', 202], ['L', 120, 35], ['S', 101],
      ['R', 52, 70], ['L', 53, 100], ['S', 133], ['R', 30, 150], ['L', 90, 45], ['S', 86],
      ['R', 35, 50], ['L', 44, 50], ['S', 134], ['L', 77, 90], ['S', 80], ['R', 36, 80],
      ['L', 99, 55], ['S', 81]],
    elev: [[0, 0], [0.2, 2], [0.4, 6], [0.6, 3], [0.8, 1]],
    crests: [{ seg: 3, len: 34, h: 2.6 }],
    surfaces: [[0, 'asfalto'], [0.07, 'terra'], [0.46, 'asfalto'], [0.56, 'terra'], [0.93, 'asfalto']],
    splits: [0.2, 0.4, 0.6, 0.8],
    theme: {
      sky: 0xf0a868, skyTop: 0x6a7fc0, fog: 0xe8a878, ground: 0xb0884a, verge: 0xa8763e, bank: 0x9c6a38,
      sun: 0xffc890, sunDir: [-1, 0.35, 0.4], hemiSky: 0xffd8b0, hemiGround: 0x8a5a30,
      barrier: 'cerca', flora: 'cerrado', hills: 0x8a6a58, terra: 0xb4562c,
    },
  },
  {
    id: 'lama', name: 'Serra da Lama', desc: 'Mata fechada, lama e poças, grampos na subida.',
    width: 8.5, verge: 2.5,
    path: [['S', 157], ['L', 101, 60], ['S', 99], ['R', 116, 35], ['S', 101], ['L', 158, 32],
      ['S', 121], ['R', 60, 70], ['S', 59], ['L', 80, 50], ['S', 148], ['L', 60, 90],
      ['R', 51, 60], ['L', 39, 60], ['S', 160], ['L', 96, 55], ['S', 164], ['R', 86, 45],
      ['L', 72, 50], ['S', 30], ['L', 67, 80], ['S', 98]],
    elev: [[0, 0], [0.25, 4], [0.5, 10], [0.7, 7], [0.85, 3]],
    crests: [{ seg: 10, len: 32, h: 2.4 }],
    surfaces: [[0, 'terra'], [0.14, 'lama'], [0.3, 'terra'], [0.52, 'lama'], [0.66, 'terra'], [0.86, 'lama'], [0.94, 'terra']],
    splits: [0.17, 0.34, 0.5, 0.67, 0.84],
    theme: {
      sky: 0x9aa4ae, skyTop: 0x6e7a86, fog: 0x8f9aa2, ground: 0x3e5a2c, verge: 0x4a5a2a, bank: 0x4a3e2a,
      sun: 0xdfe6ee, sunDir: [0.3, 1, 0.5], hemiSky: 0xc4ccd4, hemiGround: 0x3a4a28,
      barrier: 'feno', flora: 'mata', hills: 0x3e5440, terra: 0x8a5a36,
    },
  },
  {
    id: 'neve', name: 'Neve no Pico', desc: 'Neve e gelo entre pinheiros. Freie cedo!',
    width: 9, verge: 2.5,
    path: [['S', 153], ['R', 50, 90], ['L', 79, 60], ['S', 104], ['L', 70, 110], ['R', 67, 50],
      ['L', 124, 40], ['S', 170], ['R', 33, 150], ['L', 93, 55], ['S', 117], ['R', 71, 45],
      ['L', 53, 45], ['S', 158], ['L', 114, 70], ['R', 42, 120], ['L', 90, 65], ['S', 107]],
    elev: [[0, 0], [0.3, 5], [0.55, 8], [0.8, 3]],
    crests: [{ seg: 7, len: 34, h: 2.6 }],
    surfaces: [[0, 'neve'], [0.12, 'gelo'], [0.22, 'neve'], [0.45, 'gelo'], [0.55, 'neve'], [0.75, 'gelo'], [0.83, 'neve']],
    splits: [0.17, 0.33, 0.5, 0.67, 0.83],
    theme: {
      sky: 0xe4eaf0, skyTop: 0xc6d2de, fog: 0xe0e6ec, ground: 0xf2f5f8, verge: 0xe8edf2, bank: 0xdfe6ee,
      sun: 0xffffff, sunDir: [0.5, 0.8, -0.3], hemiSky: 0xf0f4ff, hemiGround: 0x9aa8b8,
      barrier: 'neve', flora: 'pinheiro', hills: 0xc8d2dc, terra: 0x8a7a6a,
    },
  },
];
