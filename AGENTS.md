# 🤖 AGENTS.md — Guia do Desenvolvedor e Agentes de IA

Este documento contém todas as diretrizes de arquitetura, regras de gameplay, convenções matemáticas e instruções de manutenção para agentes de IA e desenvolvedores que trabalham no repositório **Atari Pitfall 3D (FPS Edition)**.

---

## 🧭 Visão Geral do Projeto

O **Atari Pitfall 3D** é uma recriação em **Primeira Pessoa (FPS)** do clássico atemporal **Pitfall!** (Activision / Atari 2600, 1982). O jogo transporta o jogador para a perspectiva direta de Pitfall Harry, mantendo a mais estrita fidelidade às regras originais do cartucho do Atari 2600, mas renderizado em tempo real com **Three.js** e estética de cubos/voxels simulando pixels tridimensionais.

- **Repositório:** https://git.rscs.pt/ruisantos/pitfall.git (branch padrão: `main`)
- **Stack Tecnológico:** JavaScript moderno (ES Modules), [Three.js](https://threejs.org/) (renderizador WebGL 3D), [Vite](https://vitejs.dev/) (bundler & dev server), HTML5 Canvas & Web Audio API autônoma.
- **Porta Padrão:** `http://localhost:5173/`
- **Comandos de Inicialização:** `make` ou `make run` (dev server), `make build` (build de produção).

---

## 🌲 Regras Invioláveis do Jogo (Gameplay Constraints)

Qualquer agente que venha a modificar este código **DEVE PRESERVAR** estas diretrizes:

1. **Movimento Estritamente Unidimensional (1D):**
   - O jogador só pode andar para a **Frente** (`W` / `Seta Cima`) ou para **Trás** (`S` / `Seta Baixo`) ao longo do eixo `Z`.
   - **NÃO existe strafe lateral (`A`/`D`)** nem movimentação livre no eixo `X`. O jogador caminha pelo centro do corredor da selva.
2. **Botão Único de Ação:**
   - Tecla `Espaço`, `Enter`, Clique do Mouse ou botão touch virtual:
     - No chão: **PULA** para superar troncos, fogueiras e escorpiões.
     - No ar / preso ao cipó: **SOLTA O CIPÓ**, transferindo o momento angular em impulso para a frente.
3. **Agarre Automático do Cipó:**
   - O cipó é agarrado **automaticamente** assim que o jogador entra em contato ou proximidade com o nó inferior (`tip`), disparando o icônico grito do Tarzan em 8-bit.
4. **Sem Mira Central (Sem Crosshair Dot):**
   - **NÃO adicionar crosshair / retículo de mira.** O usuário pediu explicitamente a remoção do ponto branco central para manter imersão retrô limpa.
5. **Imunidade Lendária nos Olhos do Jacaré:**
   - No Atari 2600 original, ficar sobre os olhos/topo da cabeça do jacaré torna Harry 100% imune a mordidas, mesmo com a boca escancarada.
   - No código: se `z <= croc.z + 0.8`, o jogador está sobre os olhos/crânio e **NUNCA DEVE MORRER** quando a boca abre. Apenas a área frontal do focinho (`z > croc.z + 0.8`) é perigosa quando aberta.
6. **Areia Movediça Móvel Longa (9.0 Metros):**
   - O buraco de areia movediça que abre e fecha mede **9.0 metros de extensão** (`radius = 4.5`).
   - O salto máximo do jogador correndo é de **6.75 metros**. Portanto, **é fisicamente impossível pular sobre ela quando aberta**.
   - A travessia correta exige esperar o solo fechar e disparar em corrida pelo piso sólido.
7. **Contagem Aberta de Tesouros (Sem Teto de 32):**
   - No clássico do Atari 2600 havia 32 tesouros distribuídos pelas telas subterrâneas e de superfície.
   - No jogo 3D de geração procedural contínua, o jogador pode explorar indefinidamente e resgatar **mais de 32 tesouros**.
   - O HUD e a tela de Game Over exibem apenas a contagem progressiva pura (`0`, `1`, `2`, ...), sem o sufixo restritivo `/32`.
8. **Estética Atari Retrô:**
   - Paleta de cores NTSC do Atari 2600.
   - Gráficos estilizados em cubos/voxels usando `createVoxelGeometry` com culling de faces internas.
   - Efeito de scanlines CRT ativável no HUD.
   - Áudio 100% sintetizado via Web Audio API (sem assets `.mp3` ou `.wav` externos).

---

## 📁 Estrutura de Arquivos e Responsabilidades

```
pitfall/
├── Makefile             # Comandos make (run, build, preview, clean, help)
├── package.json         # Dependências: Three.js e Vite
├── index.html           # Canvas, container 3D, overlay CRT e HUD retrô
├── style.css            # Estilização Atari, tipografia arcade e filtros CRT
├── README.md            # Guia para jogadores
├── AGENTS.md            # Este guia técnico para agentes de IA
└── src/
    ├── main.js          # Loop principal, inicialização Three.js, cena e câmera
    ├── player.js        # Física FPS, colisões, pulo, cipó e lógica dos jacarés
    ├── world.js         # Geração procedural de telas, perigos e animação do mundo
    ├── models.js        # Geradores de modelos voxel 3D (jacaré, cipó, fogueira, etc.)
    ├── voxel.js         # Algoritmo de geometria voxel otimizada com face-culling
    ├── audio.js         # Sintetizador Web Audio API puro com efeitos 8-bit
    └── hud.js           # Painel HUD, score, timer, vidas e avisos contextuais
```

### Detalhamento dos Módulos:

#### [`src/player.js`](file:///home/ruisantos/Projects/pitfall/src/player.js)
- **Constantes de Física:**
  - `RUN_SPEED = 9.0` (velocidade ao caminhar para frente/trás)
  - `JUMP_VELOCITY = 10.5`, `GRAVITY = 28.0` (tempo de ar ~0.75s, alcance de salto máximo correndo = 6.75m)
  - `EYE_HEIGHT = 2.2` (altura dos olhos do Harry em primeira pessoa)
  - **Inclinação Natural da Câmera:** `camera.rotation.x = -0.04 + bobPitch` (inclinação de ~-2.3° voltada sutilmente para o caminho à frente, enquadrando o solo, os obstáculos e os braços em primeiro plano).
- **Convenção de Coordenadas:**
  - O jogador inicia em `z = 0` e **avança em direção ao `Z` negativo** (`vz < 0`).
  - Portanto: coordenadas mais negativas estão **à frente**; coordenadas mais positivas estão **atrás**.
- **Funções Críticas:**
  - `getCrocodileAt(world, z)`: Localiza o jacaré específico sob os pés do jogador dentro do intervalo estendido `[-3.3, +3.9]`.
  - `getSurfaceElevation(world, z)`: Retorna a elevação do solo (`0.0`), topo do jacaré (`0.35`) ou abismo (`-10.0`).
  - `checkVineGrab(world)`: Detecta proximidade com a ponta do cipó e ancora o jogador.
  - `releaseVine()`: Solta o cipó com momento parabólico.
  - `die(reason)`: Dispara `audio.playLifeLost()` quando ainda restam vidas (`lives > 0`) e `audio.playGameOver()` ao perder a última vida, acionando a tela de fim de jogo.

#### [`src/world.js`](file:///home/ruisantos/Projects/pitfall/src/world.js)
- **Nivelamento Global da Superfície do Solo:**
  - A malha de terra central (`groundMesh`) possui blocos de altura `1.0` e fica posicionada em `Y = -1.0`, garantindo que a superfície superior da trilha fique exatamente em **`Y = 0.00`**.
  - Isso alinha com perfeição a trilha às bordas laterais (`leftBorder`, `rightBorder`), à elevação dos pés de Harry (`standingSurfaceY = 0.00`) e à tampa da areia movediça.
- **Dimensões das Telas:**
  - Cada tela mede `SCREEN_LENGTH = 40` metros de extensão no eixo `Z`.
  - `startZ = -index * 40`, `endZ = -(index + 1) * 40`.
- **Sequência de Telas Clássicas:**
  - `START_TRAIL` (tronco inicial)
  - `STATIONARY_LOGS` (dois troncos)
  - `DISAPPEARING_QUICKSAND` (areia movediça móvel de 9m)
  - `QUICKSAND_VINE` (poço de areia movediça de 20m com cipó)
  - `ROLLING_LOGS` (troncos rolantes)
  - `CROCODILE_POND` (lagoa com 3 jacarés espaçados em `[5, 0, -5]`)
  - `QUICKSAND_AND_LOG` (areia movediça móvel + tronco rolante)
  - `CAMPFIRE_TREASURE` (fogueiras com chamas dinâmicas)
  - `TAR_PIT_VINE` (poço de piche com cipó)
  - `SCORPION_RUN` (escorpiões rastejantes)
  - `CROCODILE_VINE` (lagoa de jacarés + cipó suspenso)
- **Atualizações Dinâmicas (`world.update(delta)`):**
  - Animação do balanço do cipó (`v.vine.pivot.rotation.x`).
  - Ciclo de 4.4s da boca dos jacarés (fechada, alerta com olhos laranjas, aberta vermelha, estalo ao fechar).
  - Ciclo de 5.4s da areia movediça (fechada e sólida por 2.8s, tremor, abertura por 1.8s, fechamento).

#### [`src/models.js`](file:///home/ruisantos/Projects/pitfall/src/models.js)
- `createOpeningQuicksandModel(voxelSize = 0.45)`:
  - Fundo de lama borbulhante em `Y = -2` de `Z = -10` a `+10` (9.0 metros).
  - Tampão de solo móvel (`plug`) com fissuras e textura de terra idêntica ao caminho.
- `createCrocodileModel(voxelSize = 0.32)`:
  - Cabeça/olhos em `Z = 0`.
  - Plataforma segura nas escamas e chevrons dourados de `Z = -10` a `+2` (`z <= croc.z + 0.8`).
  - Mandíbula articulada de `Z = 3` a `12` com rotação no eixo X e dentes pontiagudos.
- `createLogModel(voxelSize = 0.18)`:
  - Cilindro de tronco com diâmetro de 0.90m (raio de 0.45m) e largura de 3.06m.
  - Centrado no eixo central de rotação X e apoiado em `Y = 0.45`, garantindo rolamento perfeitamente sobre o solo sem afundamento.
- `createCampfireModel(voxelSize = 0.22)`:
  - Base com anel de pedras, leito de cinzas e brasas vivas aterrado em `Y = 0.0` com `center = 'bottom'`.
  - Troncos em pirâmide e chamas em camadas subindo de `Y = 0.22` até ~2.0m, com faíscas dinâmicas e luz quente.
- `createTreasureModel(type, voxelSize = 0.22)`:
  - Saco de dinheiro com cifrão `$`, barras de ouro/prata e anel de diamante com base em `Y = 0.0` (`center = 'bottom'`).
  - Posicionado a `Y = 0.05` para rotação suave e visibilidade total sobre a trilha.
- `createScorpionModel(voxelSize = 0.28)`:
  - Escorpião arcade gigante de alta visibilidade com carapaça vermelha vibrante e faixas obsidianas/douradas.
  - Cauda arqueada alta com ferrão e bulbo de veneno amarelo incandescente em `Y = 6` (~1,68m de altura).
  - Luz pontual dinâmica `THREE.PointLight(0xffcc00)` projetando brilho de advertência no solo e na vegetação.
  - Olhos ciano brilhantes, 8 patas articuladas e pinças frontais ameaçadoras.

#### [`src/voxel.js`](file:///home/ruisantos/Projects/pitfall/src/voxel.js)
- Algoritmo de geometria voxel otimizada com face-culling (culling de faces internas adjacentes para alta performance).
- **Modos de Centralização (`createVoxelGeometry(voxels, voxelSize, center)`):**
  - `center = true`: centraliza geometricamente nos 3 eixos (`X`, `Y`, `Z`). Utilizado para troncos cilíndricos rolantes centrados em seu eixo de rotação.
  - `center = 'bottom'`: centraliza horizontalmente nos eixos `X` e `Z`, mas ancora o plano inferior do menor voxel em `Y = 0.0` (`offsetY = minY`). Essencial para fogueiras, tesouros e escorpiões pousados diretamente sobre o solo.
  - `center = false`: mantém as coordenadas brutas dos voxels sem translação (usado no terreno e árvores).

#### [`src/hud.js`](file:///home/ruisantos/Projects/pitfall/src/hud.js)
- Gerenciamento do Heads-Up Display retrô:
  - Pontuação com 6 dígitos (`padStart(6, '0')`).
  - Cronômetro regressivo de 20 minutos (`MM:SS`).
  - Contador progressivo contínuo de tesouros (`player.treasuresCollected`), sem sufixo ou teto fixo de 32.
  - Indicadores dinâmicos de proximidade: aviso de perigo/segurança da boca do jacaré e prompt de agarre do cipó.
  - Alternador de áudio e filtro CRT retro com scanlines.

#### [`src/audio.js`](file:///home/ruisantos/Projects/pitfall/src/audio.js)
- Motor de áudio sem arquivos externos. Métodos:
  - `playJump()`: onda quadrada com rampa exponencial de frequência (boing).
  - `playTarzanYell()`: sequência afinada de tons imitando o grito original do Atari 2600.
  - `playTrip()`: tom baixo de tropeço com decréscimo de pontuação.
  - `playChomp()` & `playCrocSnap()`: ruído branco filtrado para mordida e estalo das presas.
  - `playSink()`, `playQuicksandRumble()`, `playGroundThud()`: efeitos para areia movediça.
  - `playTreasure()`: acorde arpejado brilhante.
  - `playLifeLost()`: arpejo menor descendente retrô de 6 notas (440Hz -> 155Hz) com bend de tom, impacto e sub-grave ao perder vida.
  - `playGameOver()`: fanfarra dramática menor descendente com osciladores dente-de-serra.

---

## 🛠️ Guia de Comandos e Workflow

Para testar ou desenvolver:

```bash
# Iniciar o servidor de desenvolvimento
make run          # roda 'npx vite --port 5173 --host'

# Verificar compilação e bundle de produção
make build        # roda 'npm run build'

# Gerar HTML único standalone autônomo (sem dependências externas)
make deploy       # roda 'npm run deploy' (produz dist/pitfall.html e dist/index.html)

# Limpar artefatos de build
make clean        # remove a pasta dist/

# Testar o bundle localmente
make preview      # roda 'npm run preview'
```

---

## 💡 Dicas Importantes para Futuros Agentes

- **Sempre verifique o build com `npm run build`** após alterações nos arquivos JavaScript.
- **Não altere a orientação das mensagens do HUD**: lembre-se de que o jogador corre para a frente (direção `-Z`). Qualquer dica instruindo aproximação aos olhos do jacaré deve dizer para **avançar**, nunca para recuar.
- **Mantenha os textos voltados ao usuário em Português**, conforme preferência estabelecida no projeto.
