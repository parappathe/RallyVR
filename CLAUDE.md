# RallyVR (Rally da Serra)

Rally contra o relógio em VR para o Meta Quest 3, no navegador do óculos (WebXR), sem instalar
nada. 3 etapas de uma volta (terra, lama, neve e gelo), carro de rally com derrapagem de verdade
e freio de mão, visão de dentro da cabine. Os rivais são carros fantasma: o piloto do nível
escolhido corre junto, e o fantasma do seu recorde também. Também joga no PC (teclado ou controle
de videogame). Tudo em português.

## Como rodar / jogar

**No Quest:** abrir no navegador do óculos **https://parappathe.github.io/RallyVR/** (ou a página
inicial https://parappathe.github.io/) e apertar "Entrar em VR". Jogar sentado. Para atualizar o
site: commitar e rodar `python publicar.py RallyVR` na pasta `C:\claude code`.

**No PC:** `python serve.py` nesta pasta e abrir `http://localhost:8782` (o painel de visualização
usa `.claude/launch.json`). `python serve.py --https` serve na rede de casa para testar no Quest
sem publicar.

### Controles

| | VR (Quest) | PC |
|---|---|---|
| Acelerar | Gatilho direito | Seta para cima / W (controle: RT ou A) |
| Frear / ré | Gatilho esquerdo | Seta para baixo / S (controle: LT) |
| Esterçar | Segurar o volante com o botão lateral (grip) de uma ou das duas mãos e girar; ou o analógico | Setas / A e D (controle: analógico) |
| Freio de mão (segurar) | A ou X | Espaço (controle: X ou RB) |
| Reiniciar no último ponto | Pausa → "Reiniciar no último ponto" | R (controle: Y) |
| Pausa | B ou Y | Esc ou P (controle: Start) |
| Câmera | Sempre na cabine | C troca entre atrás do carro e cabine |
| FPS | Opções → Mostrar FPS | Tecla F |

Conforto: no VR a cabeça fica presa ao banco do piloto e o horizonte nunca inclina (o carro não
empina nem rola na visão, nem no salto; só gira junto com a direção do carro). As colunas do
para-brisa, o painel e o volante ficam sempre no mesmo lugar como referência. A opção "Conforto"
(ligada por padrão) escurece as bordas da visão quando o carro gira rápido, derrapa ou salta.
"Recentralizar" na pausa põe a cabeça de volta no banco. Sem tranco de câmera no VR (no PC, a
câmera de trás treme um pouco nas batidas).

### Regras

Uma volta contra o relógio, largando parado 4 m antes da linha. O fantasma do nível escolhido
(Fácil: Tonho Poeira, Médio: Lia Cascalho, Difícil: Max Derrapada) larga junto; o fantasma
dourado é o seu recorde (opção "Fantasma do recorde"). Os fantasmas atravessam o carro e somem
quando estão em cima de você. Em cada ponto de controle (4 ou 5 por etapa, pórtico "CONTROLE n")
aparece a diferença para o fantasma do nível ("−0,8 s" verde = na frente, "+1,2 s" vermelho =
atrás). Medalha no fim: bronze = bater o Fácil, prata = o Médio, ouro = o Difícil. Bater na
barreira (cerca, fardos de feno ou monte de neve) tira velocidade, faz barulho e vibra os
controles; fora da estrada o carro anda devagar. "Reiniciar no último ponto" põe o carro parado
no meio da estrada 12 m atrás; o cronômetro continua.

Copiloto: placas de beira de estrada ~45 m antes de cada curva, do lado de fora dela, com a
seta e a nota da curva de **1 (suave) a 6 (grampo)**, calculada do raio. O painel mostra a
próxima curva com a distância.

Etapas (em `js/stages.js`): Terra Vermelha (1,85 km, cerrado no fim de tarde, terra com trechos de
asfalto, cerca de madeira), Serra da Lama (2,05 km, mata, terra e lama com poças, fardos de feno,
grampos), Neve no Pico (1,85 km, neve e gelo, pinheiros, montes de neve com balizas). Cada uma tem
uma crista que faz o carro saltar. Superfícies (em `js/surfaces.js`): asfalto, terra, lama, neve,
gelo, cada uma com aderência, velocidade máxima, cor e som de cascalho próprios. Recorde, medalha
e o fantasma do recorde (~10 kB por etapa) ficam salvos no navegador (localStorage, chaves
`rallyvr.v1` e `rallyvr.ghost.<etapa>`).

## Como testar

- `node tests/run.js` (ou `npm test`): estrada não se cruza, raio mínimo > 25 m, projeção (s, lat),
  crista em reta, barreira segura o carro, robô (IA perfeita) completa as 3 etapas no tempo limite
  sem bater e salta na crista, parciais no lugar certo e com a diferença certa, níveis em ordem e
  robô batendo o Difícil por pouco (1,5 a 2,5%), fantasma do nível determinístico, fantasma gravado
  compacta e reproduz a trajetória, derrapagem na terra e no gelo, gelo segura menos que o asfalto,
  freio de mão solta a traseira, contraesterço segura a derrapagem, velocidade máxima por
  superfície, reiniciar no último ponto, carro parado na contagem. Tem que terminar com "Tudo
  certo" (saída 1 se falhar; desiste sozinho em 120 s). Não toca som.
- No navegador (console): `rally.startStage(0); rally.dev.autoplay = true; rally.dev.advance(90)`
  corre 90 s na hora com o robô dirigindo (a tela de resultado aparece 2,5 s depois). `advance`
  existe porque o painel de visualização escondido não anima a página.
  `rally.renderer.info.render.calls` / `.triangles` mostram o peso de desenho: ~37 a 45 chamadas
  e ~51 a 56 mil triângulos (medido no PC, por olho).
- **Só dá para testar no óculos:** pegar e girar o volante, gatilhos, freio de mão no A/X, como o
  carro responde de verdade nas mãos (derrapagem, contraesterço), conforto/enjoo, vibração, FPS
  real, altura do banco e posição da tela do painel.

## Estrutura

| Arquivo | O que tem |
|---|---|
| `index.html`, `css/style.css` | Página, botão "Entrar em VR", painel do carro no canto (PC) |
| `js/track.js` | `Track`: estrada por caminho de tartaruga (retas e arcos, fecha sozinho), projeção (s, lat), relevo e cristas, superfície por trecho, linha ideal, perfil de velocidade, curvas com nota do copiloto, parciais. Sem navegador |
| `js/stages.js` | As 3 etapas (caminho, relevo, crista, superfícies, parciais, cores do tema). Sem navegador |
| `js/surfaces.js` | Aderência, velocidade máxima, arrasto, cascalho e cor de cada superfície. Sem navegador |
| `js/car.js` | Física do carro em passo fixo de 1/120 s: modelo de dois eixos com deriva, freio de mão, barreira, saltos (`CAR` tem as constantes). Sem navegador |
| `js/ai.js` | Níveis (`LEVELS`), o robô (`ROBOT`) e o `Driver` (perseguição pura com contraesterço). Sem navegador |
| `js/ghost.js` | Gravação a 10 Hz, compactação, reprodução e a corrida simulada de cada nível. Sem navegador |
| `js/rally.js` | `Rally`: contagem, cronômetro, parciais, chegada, medalha, reiniciar no último ponto. Sem navegador |
| `js/main.js` | Liga tudo: render, banco/VR, volante, teclado/controle, menus, câmera, fantasmas, sons |
| `js/scene.js` | Estrada 3D, barreiras, placas, pórticos, cenário de cada tema, carro de rally com cabine, fantasma, vinheta |
| `js/hud.js` | Painel (tempo, parcial, velocidade, superfície, próxima curva, progresso, minimapa), ícone de curva e letreiro |
| `js/ui.js` | Painel de menu 3D (mesmo dos outros jogos, cores próprias) |
| `js/audio.js` | Sons sintetizados (motor com marchas, cascalho, pneu, batidas, parciais, chegada) |
| `js/save.js` | Recordes, medalhas, opções e fantasmas salvos |
| `serve.py` | Servidor local sem cache (`--https` para testar no Quest pela rede de casa) |
| `tests/run.js` | Testes automáticos |
| `vendor/three/three.module.js` | Three.js r170 (cópia local) |

Convenções: metros; `s` = distância ao longo da estrada; `lat` = desvio lateral (positivo = à
esquerda); `h` = direção do carro igual a `rotation.y` (o carro olha para (-sen h, -cos h));
`steer` -1 esquerda, +1 direita; `u`/`w` = velocidade para a frente/para a esquerda; `r` = giro
(positivo = para a esquerda); `beta` = ângulo de derrapagem.

## Regras e convenções do projeto

- `track.js`, `stages.js`, `surfaces.js`, `car.js`, `ai.js`, `ghost.js`, `rally.js` e `util.js`
  não podem usar navegador nem Three.js: os testes rodam no Node.
- Mexeu em estrada, física ou pilotos: rodar `node tests/run.js`. Mudou a física ou a IA, os
  tempos dos fantasmas mudam (e os fantasmas de recorde salvos ficam de outra física, mas
  continuam funcionando).
- Etapa nova: caminho com giro total de 360°; as retas são ajustadas sozinhas para fechar (ficam
  diferentes do escrito; ver `turtlePoints`). Crista só numa reta (`seg` = índice da reta no
  `path`). O teste acusa trechos que se encostam e curvas com raio < 25 m.
- Dificuldade: `speed` (fração do perfil de velocidade) e `wander` (quanto sai da linha) em
  `LEVELS`; o robô usa 1,0. `ALAT_USE` em `ai.js` é quanto da aderência a IA usa nas curvas.

## Decisões

- Mesmo caminho dos outros jogos web (WebXR no navegador, Three.js local, GitHub Pages). Núcleo
  copiado do KartVR (sem dependência entre as pastas).
- Sem adversários na pista: rivais são fantasmas gerados na hora pela IA, de forma determinística
  (sem sorteio), então o tempo de cada nível numa etapa é sempre o mesmo.
- Física com derrapagem de verdade, mas estável: traseira com 25% mais aderência (`rearGrip`),
  esterço que diminui com a velocidade e que libera mais ângulo quando o carro escorrega (para o
  contraesterço funcionar). Com a traseira igual à dianteira o carro rodava fácil demais.
- Rally com volta única em circuito fechado (largada e chegada no mesmo pórtico).
- Nota das curvas de 1 (suave) a 6 (grampo), ao contrário do rally real (lá 1 é a mais fechada),
  porque o pedido foi "força da curva".
- Volante virtual e analógico funcionam juntos: se a mão segura o volante, ela manda; senão, o
  analógico. Motorista do lado esquerdo.
- Níveis calibrados para o robô (que dirige perfeito) bater o Difícil por ~2%; Fácil fica ~12%
  mais lento que o robô.

## Pendências / problemas conhecidos

- Nada testado no Quest ainda: volante (giro máximo ~90°), freio de mão, como a derrapagem fica
  nas mãos, altura do banco, posição da tela do painel, conforto e FPS.
- A dirigibilidade só foi conferida com pilotos simulados; com teclado, segurar o esterço todo em
  alta velocidade faz o carro escorregar bastante. Ajustar `rearGrip`/`steerFade` em `car.js` se
  ficar difícil.
