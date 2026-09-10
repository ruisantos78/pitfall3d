# 🕹️ ATARI PITFALL 3D - Edição em Primeira Pessoa (FPS)

Uma recriação em **primeira pessoa (FPS)** do clássico atemporal **Pitfall!** do Atari 2600, construída em Three.js com estética retrô de cubos/voxels simulando pixels tridimensionais.

---

## 🎮 Controles & Mecânicas Originais

Assim como no jogo original do Atari 2600:
- **Movimento em Linha Reta (1D):** O jogador só se move para **FRENTE** ou para **TRÁS** ao longo do corredor da selva (sem strafe lateral).
  - `[W]` ou `[Seta Cima]` ou botão touch: **Andar para Frente**
  - `[S]` ou `[Seta Baixo]` ou botão touch: **Andar para Trás**
- **Botão Único de Ação:**
  - `[Espaço]`, `[Enter]` ou `[Clique do Mouse / Toque no botão]`:
    - No chão: **PULA** sobre obstáculos (troncos, fogueiras, escorpiões).
    - Agarrado ao cipó: **SOLTA O CIPÓ**, impulsionando Harry pelo ar com o momento do balanço para cruzar o abismo!
- **Cipó Automático:** Ao saltar ou se aproximar do cipó balançando sobre areia movediça ou poço de crocodilos, Harry **agarra o cipó automaticamente**, reproduzindo o clássico grito estilo Tarzan em 8-bits!
- **Corredor de Árvores:** Fileiras densas de árvores em cubos estilizadas nas laterais formam um corredor contínuo de selva com copa superior.
- **Crocodilos:** Podem ser usados como apoio para atravessar lagoas, **mas apenas quando suas bocas estiverem fechadas**! Se a boca abrir, Harry é mordido!
- **Troncos:** Troncos rolantes e estáticos. Tropeçar neles causa perda de pontos.
- **Tesouros:** Barras de Ouro, Barras de Prata, Anéis de Diamante e Sacos de Dinheiro ($) em voxels para resgatar.
- **HUD Retrô:** Pontuação (inicia em 2000), cronômetro de 20 minutos regressivo, indicador de vidas e tela atual.
- **Filtro CRT:** Efeito de scanlines, vinheta e fósforo retrô ativável/desativável.
- **Sintetizador Web Audio 8-bit:** Efeitos sonoros autônomos sem necessidade de arquivos externos (pulo, cipó/yodel, mordida, afundamento, tesouros, passos).

---

## 🚀 Como Executar

### Usando o Makefile:
```bash
# Iniciar o jogo (abre o servidor e o navegador automaticamente)
make

# Ou especificando o comando:
make run

# Outros comandos úteis:
make install    # Instalar dependências do npm
make build      # Gerar build otimizado de produção
make preview    # Testar o build de produção localmente
make deploy     # Gerar arquivo HTML único (standalone) para jogar offline
make clean      # Limpar pasta dist
make help       # Ver todos os comandos disponíveis
```

### Usando o npm diretamente:
```bash
npm run dev
# Ou para build:
npm run build
npm run preview
```
