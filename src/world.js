// World and Corridor Generator for Atari Pitfall 3D
import * as THREE from 'three';
import { 
  createTreeModel, 
  createLogModel, 
  createCrocodileModel, 
  createVineModel, 
  createScorpionModel, 
  createCampfireModel, 
  createTreasureModel,
  createOpeningQuicksandModel
} from './models.js';
import { createVoxelGeometry, createVoxelMaterial } from './voxel.js';
import { audio } from './audio.js';

export const SCREEN_LENGTH = 60; // Length of each screen along Z axis
export const PATH_WIDTH = 8;     // Width of corridor
export const TUNNEL_FLOOR_Y = -8; // Underground tunnel floor (ladder screens)

export class World {
  constructor(scene) {
    this.scene = scene;
    this.screens = new Map(); // screenIndex => ScreenObject
    this.activeVines = [];
    this.activeCrocodiles = [];
    this.activeRollingLogs = [];
    this.activeTreasures = [];
    this.activeHazards = [];
    this.animatedCampfires = [];
    this.activeOpeningPits = [];

    // Base materials
    this.groundMaterial = createVoxelMaterial();
    this.waterMaterial = new THREE.MeshLambertMaterial({
      color: 0x1a6aaa,
      transparent: true,
      opacity: 0.85,
    });
    this.pitMaterial = new THREE.MeshBasicMaterial({ color: 0x181818 });

    // Shared tree template for cloning
    this.treeTemplate = createTreeModel(0.5);

    // Poço sem fim: material preto visto por dentro (paredes do abismo)
    this.abyssMaterial = new THREE.MeshBasicMaterial({ color: 0x000000, side: THREE.BackSide });

    // Subterrâneo: terra das paredes do túnel e madeira da escada
    this.tunnelWallMaterial = new THREE.MeshLambertMaterial({ color: 0x4a3826 });
    this.tunnelFloorMaterial = new THREE.MeshLambertMaterial({ color: 0x5a4128 });
    this.ladderMaterial = new THREE.MeshLambertMaterial({ color: 0x8a6a3a });
  }

  // Poço sem fim: tubo preto profundo sem tampa para parecer abismo infinito
  addBottomlessShaft(group, centerZ, length, width = PATH_WIDTH) {
    const depth = 40;
    const shaftGeo = new THREE.BoxGeometry(width, depth, length);
    const shaft = new THREE.Mesh(shaftGeo, this.abyssMaterial);
    // Topo aberto logo abaixo do solo (y=-0.5), fundo a -40
    shaft.position.set(0, -0.5 - depth / 2, centerZ);
    group.add(shaft);
    // Fundo preto absoluto para não ver o céu/fog lá embaixo
    const bottomGeo = new THREE.PlaneGeometry(width, length);
    const bottomMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
    const bottom = new THREE.Mesh(bottomGeo, bottomMat);
    bottom.rotation.x = -Math.PI / 2;
    bottom.position.set(0, -0.5 - depth, centerZ);
    group.add(bottom);
  }

  // Generate or get screen at index (0, 1, 2, ...)
  getOrCreateScreen(screenIndex) {
    if (this.screens.has(screenIndex)) {
      return this.screens.get(screenIndex);
    }

    const screenData = this.buildScreen(screenIndex);
    this.screens.set(screenIndex, screenData);
    this.scene.add(screenData.group);
    return screenData;
  }

  // Update visible screens around current player Z
  updateVisibleScreens(currentScreenIndex) {
    const keepRange = 2;
    for (let i = currentScreenIndex - 1; i <= currentScreenIndex + keepRange; i++) {
      if (i >= 0 && !this.screens.has(i)) {
        this.getOrCreateScreen(i);
      }
    }

    // Cleanup distant screens to keep memory tight
    for (const [idx, screen] of this.screens.entries()) {
      if (idx < currentScreenIndex - 2 || idx > currentScreenIndex + keepRange + 1) {
        this.scene.remove(screen.group);
        // remove items from active lists
        this.removeScreenEntities(screen);
        this.screens.delete(idx);
      }
    }
  }

  removeScreenEntities(screen) {
    this.activeVines = this.activeVines.filter(v => v.screenIndex !== screen.index);
    this.activeCrocodiles = this.activeCrocodiles.filter(c => c.screenIndex !== screen.index);
    this.activeRollingLogs = this.activeRollingLogs.filter(l => l.screenIndex !== screen.index);
    this.activeTreasures = this.activeTreasures.filter(t => t.screenIndex !== screen.index);
    this.activeHazards = this.activeHazards.filter(h => h.screenIndex !== screen.index);
    this.animatedCampfires = this.animatedCampfires.filter(c => c.screenIndex !== screen.index);
    this.activeOpeningPits = this.activeOpeningPits.filter(p => p.screenIndex !== screen.index);
  }

  buildScreen(index) {
    const group = new THREE.Group();
    const startZ = -index * SCREEN_LENGTH;
    const endZ = -(index + 1) * SCREEN_LENGTH;
    const midZ = (startZ + endZ) / 2;

    const screenType = this.getScreenType(index);

    // 1. Build Ground and Corridor Trees
    this.buildGroundAndBorders(group, index, startZ, endZ, screenType);

    // 2. Bandeirinhas de limite no início e fim da tela (visuais + checkpoints)
    this.addBoundaryFlags(group, startZ, endZ);

    // 3. Build Specific Screen Hazards / Features
    this.buildScreenFeatures(group, index, startZ, endZ, midZ, screenType);

    return {
      index,
      group,
      startZ,
      endZ,
      type: screenType,
    };
  }

  // --- Authentic Atari 2600 level generator (pitfall.asm) ---
  // Bidirectional LFSR, seed $C4. Forward (-Z) = RightRandom:
  //   random' = (random << 1) | (bit3^bit4^bit5^bit7)
  // Bits: 0..2 ground object, 3..5 scene, 6..7 tree pattern, 7 wall side.
  static lfsrRight(r) {
    const b3 = (r >> 3) & 1, b4 = (r >> 4) & 1, b5 = (r >> 5) & 1, b7 = (r >> 7) & 1;
    return ((r << 1) & 0xff) | (b3 ^ b4 ^ b5 ^ b7);
  }

  // Screen N = LFSR stepped (N mod 255) times right from seed $C4.
  // Só existem 255 fases: a 256ª é a 1ª de novo (loop para frente).
  getAuthenticSpec(index) {
    const n = ((index % 255) + 255) % 255;
    let r = 0xc4;
    for (let i = 0; i < n; i++) r = World.lfsrRight(r);
    const objectType = r & 0x07;
    const sceneType = (r >> 3) & 0x07;
    const treePat = (r >> 6) & 0x03;
    return { rand: r, objectType, sceneType, treePat };
  }

  // Deterministic Pitfall 2600 screen sequence (hybrid authentic+)
  getScreenType(index) {
    const spec = this.getAuthenticSpec(index);
    // Cena 4 (jacarés): metade com cipó, metade só com jacarés (decide pelo
    // treePat do LFSR — determinístico, o mapa nunca muda).
    if (spec.sceneType === 4) {
      return spec.treePat % 2 === 0 ? 'CROCODILE_VINE' : 'CROCODILE_POND';
    }
    const base = [
      'HOLE_SINGLE',            // 0: one hole + ladder/wall underground
      'HOLE_TRIPLE',            // 1: three holes
      'TAR_PIT_VINE',           // 2: black pit + vine
      'QUICKSAND_VINE',         // 3: blue swamp + vine
      'CROCODILE_VINE',         // 4: (tratado acima)
      'DISAPPEARING_QUICKSAND', // 5: black quicksand + treasure
      'QUICKSAND_VINE_OPEN',    // 6: black quicksand + vine
      'BLUE_QUICKSAND',         // 7: blue quicksand (no vine)
    ][spec.sceneType];
    // Hybrid+: keep current rolling-log/vine-variety extras alive by
    // re-injecting them when the authentic cell would otherwise be bare
    // (bare rolling-log cells already cover ROLLING_LOGS/TRIPLE_LOGS).
    return base;
  }

  buildGroundAndBorders(group, index, startZ, endZ, screenType) {
    const length = SCREEN_LENGTH;
    const stepZ = 2;

    // Build corridor trees on left (-X) and right (+X)
    for (let z = startZ; z > endZ; z -= 7) {
      // Left side trees (2 rows deep for dense forest corridor)
      const treeL1 = this.treeTemplate.clone();
      treeL1.position.set(-5.5 - Math.random() * 1.5, 0, z + (Math.random() - 0.5) * 2);
      treeL1.rotation.y = (z % 4) * (Math.PI / 2);
      group.add(treeL1);

      const treeL2 = this.treeTemplate.clone();
      treeL2.position.set(-10 - Math.random() * 2, 0, z + 3);
      group.add(treeL2);

      // Right side trees
      const treeR1 = this.treeTemplate.clone();
      treeR1.position.set(5.5 + Math.random() * 1.5, 0, z + (Math.random() - 0.5) * 2);
      treeR1.rotation.y = ((z + 2) % 4) * (Math.PI / 2);
      group.add(treeR1);

      const treeR2 = this.treeTemplate.clone();
      treeR2.position.set(10 + Math.random() * 2, 0, z + 3);
      group.add(treeR2);
    }

    // Build Ground Voxel Strips
    // If screen has a pit/pond in the middle, create a gap in ground
    const hasCentralHazard = ['QUICKSAND_VINE', 'TAR_PIT_VINE', 'CROCODILE_VINE', 'CROCODILE_POND', 'QUICKSAND_VINE_OPEN', 'BLUE_QUICKSAND'].includes(screenType);
    // Meio-comprimento do lago central: 8m no lago dos jacarés (16m,
    // cruzável só com o cipó) e 10m no lago do cipó e no piche (20m).
    const centralHazardHalf = ['CROCODILE_VINE', 'CROCODILE_POND'].includes(screenType) ? 8 : 10;
    const hazardStartZ = (startZ + endZ) / 2 + centralHazardHalf;
    const hazardEndZ = (startZ + endZ) / 2 - centralHazardHalf;

    const midZ = (startZ + endZ) / 2;
    const hasDisappearingPit = ['DISAPPEARING_QUICKSAND', 'BLUE_QUICKSAND'].includes(screenType);
    const pitCenterZ = midZ;
    // Poço azul de saída dos troncos (1 fileira, ~1.5m). Só nas telas com
    // rolling logs do mapa superior (obj 0..3, scene != 5).
    const specForGround = this.getAuthenticSpec(index);
    const hasLogExitPit = !!specForGround && specForGround.sceneType !== 5 && specForGround.objectType <= 3;
    const logExitPitCenterZ = startZ - 0.75;

    const groundVoxels = [];
    const grassColor = '#306c24';
    const grassBorderColor = '#489830';
    const pathColor = '#9a7638';
    const pathShade = '#825f26';

    for (let z = 0; z < length; z += 1.5) {
      const worldZ = startZ - z;
      const isOverHazard = hasCentralHazard && (worldZ <= hazardStartZ && worldZ >= hazardEndZ);
      const isOverDisappearingPit = hasDisappearingPit && Math.abs(worldZ - pitCenterZ) <= 10.2;
      // Shafts com escada (subterrâneo): 1 de 4m ou 3 de 3m
      const isOverShaft = (screenType === 'HOLE_SINGLE' && Math.abs(worldZ - midZ) <= 2.2) ||
        (screenType === 'HOLE_TRIPLE' &&
          (Math.abs(worldZ - (midZ + 12)) <= 1.7 || Math.abs(worldZ - midZ) <= 1.7 || Math.abs(worldZ - (midZ - 12)) <= 1.7));
      // Saída dos troncos: 1 fileira em TODA a largura (inclusive o verde)
      const isOverLogExit = hasLogExitPit && Math.abs(worldZ - logExitPitCenterZ) <= 0.8;
      if (isOverLogExit) continue;

      // Path corridor voxels (-3 to +3). A parte verde (|x|>=3) fica
      // sempre visível nos demais pits — só o caminho central abre buraco.
      for (let x = -4; x <= 4; x++) {
        const isEdge = Math.abs(x) >= 3;
        if (!isEdge && (isOverHazard || isOverDisappearingPit || isOverShaft)) continue;

          let col = isEdge ? ((x + z) % 2 === 0 ? grassBorderColor : grassColor) : (((x + z) % 3 === 0) ? pathShade : pathColor);
          groundVoxels.push({ x, y: 0, z: -z, color: col });
        }
    }

    if (groundVoxels.length > 0) {
      const groundGeo = createVoxelGeometry(groundVoxels, 1.0, false);
      const groundMesh = new THREE.Mesh(groundGeo, this.groundMaterial);
      // Voxels com center=false ocupam [x, x+1]: as colunas -4..4 geram
      // [-4, +5]. O deslocamento -0.5 em X simetriza a faixa para [-4.5, +4.5],
      // espelhando a borda direita na esquerda (duas linhas verdes cada lado)
      // e centralizando o buraco do pit sobre o tampão.
      groundMesh.position.set(-0.5, -1.0, startZ);
      groundMesh.receiveShadow = true;
      group.add(groundMesh);
    }

    // Lateral green grass borders beneath trees
    const borderGeo = new THREE.BoxGeometry(16, 1, length);
    const borderMat = new THREE.MeshLambertMaterial({ color: 0x224e18, flatShading: true });

    // Juntas de topo com a faixa do chão (que vai até ±4.5): sem sobreposição
    // coplanar (evita z-fighting) em nenhum dos lados.
    const leftBorder = new THREE.Mesh(borderGeo, borderMat);
    leftBorder.position.set(-12.5, -0.5, (startZ + endZ) / 2);
    group.add(leftBorder);

    const rightBorder = new THREE.Mesh(borderGeo, borderMat);
    rightBorder.position.set(12.5, -0.5, (startZ + endZ) / 2);
    group.add(rightBorder);
  }

  buildScreenFeatures(group, index, startZ, endZ, midZ, type) {
    // Authentic spec from pitfall.asm LFSR (seed $C4, stepped right)
    const spec = this.getAuthenticSpec(index) || { objectType: 4, sceneType: 0, treePat: 0 };
    const obj = spec.objectType;
    const scene = spec.sceneType;
    const treasureKinds = ['money', 'silver', 'gold', 'diamond'];

    // Overlay ground object — SOMENTE mapa superior (pitfall.asm bits 0..2).
    // O subterrâneo (túnel + escorpião) das scenes 0-1 é construído à parte.
    // obj 7 = cobra da superfície: sem modelo próprio ainda, então não
    // spawna nada (o escorpião mora no túnel).
    // Troncos rolantes: pontos fixos e determinísticos em vagas sólidas
    // (nunca no meio de lagos/buracos), sem aleatoriedade.
    const addOverlayObject = (z) => {
      if (scene === 5) return; // treasure handled with quicksand below
      if (obj <= 3) {
        const count = [1, 2, 2, 3][obj];
        for (let i = 0; i < count; i++) {
          this.addRollingLog(group, index, startZ, endZ, i, count);
        }
        this.addLogExitPit(group, index, startZ);
      } else if (obj === 4) {
        this.addStationaryLog(group, index, z);
      } else if (obj === 5) {
        this.addStationaryLog(group, index, z + 5);
        this.addStationaryLog(group, index, z - 5);
      } else if (obj === 6) {
        this.addCampfire(group, index, z);
      }
      // obj === 7 (cobra): omitido — só parte superior, sem escorpião na superfície.
    };

    switch (type) {
      case 'HOLE_SINGLE':
        // Original: buraco com escada para o subterrâneo. Entre a pé para
        // descer, pule por cima para continuar em cima.
        this.addLadderShaft(group, index, midZ, 2);
        this.addTunnel(group, index, startZ, endZ, [{ centerZ: midZ, half: 2 }]);
        addOverlayObject(midZ + 14);
        break;

      case 'HOLE_TRIPLE':
        // Original: três buracos com escada.
        [12, 0, -12].forEach((off) => this.addLadderShaft(group, index, midZ + off, 1.5));
        this.addTunnel(group, index, startZ, endZ, [12, 0, -12].map((off) => ({ centerZ: midZ + off, half: 1.5 })));
        addOverlayObject(midZ + 20);
        break;

      case 'DISAPPEARING_QUICKSAND': {
        // Original scene 5: black quicksand + treasure (obj&3 selects which).
        const kind = treasureKinds[obj & 3];
        this.addOpeningQuicksandPit(group, index, midZ);
        this.addTreasure(group, index, midZ - 12, kind);
        break;
      }

      case 'BLUE_QUICKSAND':
        // Original scene 7: blue quicksand, no vine (surfable like black).
        this.addOpeningQuicksandPit(group, index, midZ);
        addOverlayObject(midZ + 14);
        this.addTreasure(group, index, midZ - 14, 'silver');
        break;

      case 'QUICKSAND_VINE':
        // Original scene 3: blue swamp + vine.
        this.addWaterPond(group, index, midZ, 20);
        this.addVine(group, index, midZ);
        addOverlayObject(midZ + 14);
        this.addTreasure(group, index, midZ - 14, 'gold');
        break;

      case 'TAR_PIT_VINE':
        // Original scene 2: black pit + vine.
        this.addTarPit(group, index, midZ, 20);
        this.addVine(group, index, midZ);
        addOverlayObject(midZ + 14);
        this.addTreasure(group, index, midZ - 14, 'diamond');
        break;

      case 'CROCODILE_VINE': {
        // Original scene 4: croc pond (3 crocs) + vine.
        // No ASM original, troncos (x=124) e jacarés (x=60) andam em faixas
        // separadas — nunca sobrepostos. No corredor 1D, os obstáculos
        // estáticos vão para a faixa de chão ANTES do lago (borda +8):
        // nada parado dentro de midZ±8, para não bloquear o pulo entre jacarés.
        // O lago tem 16m para dar para cruzar inteiro só com o cipó.
        this.addWaterPond(group, index, midZ, 16);
        this.addCrocodileTrio(group, index, midZ);
        this.addVine(group, index, midZ + 3);
        if (scene !== 5) {
          if (obj <= 3) {
            // Rolantes no ponto único de queda (cruzam o lago de forma
            // transiente, como camadas independentes no original).
            const count = [1, 2, 2, 3][obj];
            for (let i = 0; i < count; i++) {
              this.addRollingLog(group, index, startZ, endZ, i, count);
            }
            this.addLogExitPit(group, index, startZ);
          } else if (obj === 4) {
            this.addStationaryLog(group, index, midZ + 19);
          } else if (obj === 5) {
            this.addStationaryLog(group, index, midZ + 19);
            this.addStationaryLog(group, index, midZ + 24);
          } else if (obj === 6) {
            this.addCampfire(group, index, midZ + 19);
          }
        }
        this.addTreasure(group, index, midZ - 20, 'diamond');
        break;
      }

      case 'CROCODILE_POND': {
        // Lago só com jacarés (sem cipó): travessia pulando de jacaré em jacaré.
        this.addWaterPond(group, index, midZ, 16);
        this.addCrocodileTrio(group, index, midZ);
        if (scene !== 5) {
          if (obj <= 3) {
            const count = [1, 2, 2, 3][obj];
            for (let i = 0; i < count; i++) {
              this.addRollingLog(group, index, startZ, endZ, i, count);
            }
            this.addLogExitPit(group, index, startZ);
          } else if (obj === 4) {
            this.addStationaryLog(group, index, midZ + 19);
          } else if (obj === 5) {
            this.addStationaryLog(group, index, midZ + 19);
            this.addStationaryLog(group, index, midZ + 24);
          } else if (obj === 6) {
            this.addCampfire(group, index, midZ + 19);
          }
        }
        this.addTreasure(group, index, midZ - 20, 'diamond');
        break;
      }

      case 'QUICKSAND_VINE_OPEN':
        // Original scene 6: black quicksand + vine.
        this.addOpeningQuicksandPit(group, index, midZ);
        this.addVine(group, index, midZ);
        addOverlayObject(midZ + 14);
        this.addTreasure(group, index, midZ - 14, 'gold');
        break;

      default:
        this.addStationaryLog(group, index, midZ);
        break;
    }
  }

  // --- Hazard Builders ---

  addStationaryLog(group, screenIndex, z) {
    // Tronco parado só na pista amarela (28 voxels ≈ 5m, sem cobrir o verde).
    const log = createLogModel(0.18, 28);
    log.position.set(0, 0.45, z);
    group.add(log);

    this.activeHazards.push({
      type: 'log',
      screenIndex,
      mesh: log,
      z: z,
      radius: 1.2,
      isRolling: false,
    });
  }

  // Textura listrada de alerta (amarelo/preto) para a sinalização de queda de troncos.
  makeHazardStripeTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffcc00';
    ctx.fillRect(0, 0, 128, 128);
    ctx.fillStyle = '#141414';
    ctx.save();
    ctx.translate(64, 64);
    ctx.rotate(-Math.PI / 4);
    for (let x = -128; x < 128; x += 32) {
      ctx.fillRect(x, -128, 16, 256);
    }
    ctx.restore();
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    return tex;
  }

  // Sinalização de alerta no chão onde o tronco vai cair: disco listrado +
  // anel vermelho pulsante, bem visível de longe para o jogador frear a tempo.
  createFallingLogWarning(z) {
    const group = new THREE.Group();
    if (!this.hazardStripeTex) {
      this.hazardStripeTex = this.makeHazardStripeTexture();
    }
    const discMat = new THREE.MeshBasicMaterial({
      map: this.hazardStripeTex,
      transparent: true,
      opacity: 0.75,
      depthWrite: false,
    });
    const disc = new THREE.Mesh(new THREE.CircleGeometry(1.9, 24), discMat);
    disc.rotation.x = -Math.PI / 2;
    disc.position.y = 0.02;
    group.add(disc);

    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xff2200,
      transparent: true,
      opacity: 0.8,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const ring = new THREE.Mesh(new THREE.RingGeometry(1.9, 2.3, 24), ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.03;
    group.add(ring);

    group.position.set(0, 0, z);
    return { group, disc, ring, discMat, ringMat };
  }

  // Ciclo exato de um tronco: queda do céu (~0.88s) + rolagem 52m a 6.5m/s
  // (8.0s) + queda no poço (~0.91s) ≈ 9.8s. Como a geometria é idêntica em
  // toda tela, o ciclo é constante e o revezamento nunca deforma.
  static ROLLING_CYCLE = 9.8;

  addRollingLog(group, screenIndex, startZ, endZ, idx, count) {
    // Tronco largo só na pista amarela (28 voxels ≈ 5m, sem cobrir o verde).
    const log = createLogModel(0.18, 28);
    const dropZ = this.rollingDropZ(endZ);
    // Queda do céu sempre do ponto único da tela; os troncos revezam nele
    // no tempo (idx/count do ciclo), sem aleatoriedade.
    const spawnY = 12;
    log.position.set(0, spawnY, dropZ);
    log.visible = false;
    group.add(log);

    // Sinalização de alerta no chão: disco listrado + anel vermelho pulsante.
    // Cresce e pisca enquanto o tronco despenca, some ao tocar o solo.
    const alert = this.createFallingLogWarning(dropZ);
    alert.group.visible = false;
    group.add(alert.group);

    const logData = {
      type: 'rolling_log',
      screenIndex,
      mesh: log,
      landingShadow: alert.group,
      alertDisc: alert.disc,
      alertRing: alert.ring,
      alertDiscMat: alert.discMat,
      alertRingMat: alert.ringMat,
      z: dropZ,
      spawnZ: dropZ, // ponto único de retorno — sem Math.random
      y: spawnY,
      spawnY,
      vy: 0,
      waiting: true, // aguardando sua vez no revezamento
      clock: 0,
      nextDrop: (idx * World.ROLLING_CYCLE) / count,
      falling: false,
      fallingIntoPit: false,
      groundY: 0.45,
      maxFallHeight: spawnY - 0.45,
      startZ,
      endZ,
      exitPitZ: startZ, // poço azul do início da tela
      speed: 6.5, // units/sec towards player (+Z direction)
      radius: 1.2,
    };

    this.activeRollingLogs.push(logData);
    this.activeHazards.push(logData);
  }

  // Bandeirinhas de limite no início e fim de cada tela: marcos visuais
  // de fronteira e checkpoints (volte a elas ao morrer). Alternam o lado
  // (direita no início, esquerda no fim) para não sobrepor na fronteira,
  // com o pano sempre espelhado para dentro (lado da pista, longe das árvores).
  addBoundaryFlags(group, startZ, endZ) {
    const poleGeo = new THREE.BoxGeometry(0.14, 2.6, 0.14);
    const flagGeo = new THREE.BoxGeometry(0.95, 0.55, 0.08);
    const poleMat = new THREE.MeshLambertMaterial({ color: 0xf0e0c0 });
    const flagMat = new THREE.MeshLambertMaterial({ color: 0xff3020 });
    for (const [x, z] of [[5.0, startZ - 1], [-5.0, endZ + 1]]) {
      const flag = new THREE.Group();
      const pole = new THREE.Mesh(poleGeo, poleMat);
      pole.position.y = 1.3;
      flag.add(pole);
      const cloth = new THREE.Mesh(flagGeo, flagMat);
      cloth.position.set(x > 0 ? -0.55 : 0.55, 2.25, 0);
      flag.add(cloth);
      flag.position.set(x, 0, z);
      group.add(flag);
    }
  }

  // Ponto único de queda dos troncos rolantes por tela: 8m para dentro do
  // fim da tela (longe do checkpoint da fronteira), sempre em chão sólido
  // (fora de lagos/buracos) e longe dos tesouros centrais. Cada tela com
  // troncos móveis tem UM só ponto — os troncos revezam nele no tempo.
  rollingDropZ(endZ) {
    return endZ + 8;
  }

  addLogExitPit(group, screenIndex, startZ, length = 1.5) {
    const centerZ = startZ - length / 2;
    // Buraco preto curto (1.5m = comprimento do tronco) em TODA a largura
    // da via, incluindo o verde. O tronco cai nele e volta a despencar do
    // céu no seu ponto único de origem.
    const pitWidth = PATH_WIDTH + 1;
    const pitGeo = new THREE.BoxGeometry(pitWidth, 0.2, length);
    const pitMesh = new THREE.Mesh(pitGeo, this.pitMaterial);
    pitMesh.position.set(0, -0.6, centerZ);
    group.add(pitMesh);
    this.addBottomlessShaft(group, centerZ, length, pitWidth);

    // Espetos no fundo: deixam claro que ali não se deve entrar.
    if (!this.spikeMaterial) {
      this.spikeMaterial = new THREE.MeshLambertMaterial({ color: 0x9aa0a8 });
    }
    const spikeGeo = new THREE.ConeGeometry(0.32, 2.0, 6);
    for (let x = -4; x <= 4; x += 1) {
      const spike = new THREE.Mesh(spikeGeo, this.spikeMaterial);
      spike.position.set(x, -1.5, centerZ);
      group.add(spike);
    }

    this.activeHazards.push({
      type: 'log_exit_pit',
      screenIndex,
      minZ: startZ - length,
      maxZ: startZ,
      centerZ,
    });
  }

  // Poço com escada para o subterrâneo (telas HOLE_*): paredes de terra do
  // nível 0 até o túnel + escada de madeira na parede de saída (-Z).
  addLadderShaft(group, screenIndex, centerZ, half) {
    const top = 0.2;
    const bottom = TUNNEL_FLOOR_Y;
    const h = top - bottom;
    const midY = (top + bottom) / 2;

    const sideGeo = new THREE.BoxGeometry(0.5, h, half * 2 + 0.5);
    for (const x of [-2.75, 2.75]) {
      const wall = new THREE.Mesh(sideGeo, this.tunnelWallMaterial);
      wall.position.set(x, midY, centerZ);
      group.add(wall);
    }
    const endGeo = new THREE.BoxGeometry(6.0, h, 0.5);
    for (const z of [centerZ - half - 0.25, centerZ + half + 0.25]) {
      const wall = new THREE.Mesh(endGeo, this.tunnelWallMaterial);
      wall.position.set(0, midY, z);
      group.add(wall);
    }

    // Escada: 2 trilhos + degraus na parede de saída
    const railGeo = new THREE.BoxGeometry(0.12, h - 0.5, 0.12);
    const rungGeo = new THREE.BoxGeometry(1.0, 0.09, 0.09);
    const ladderZ = centerZ - half + 0.45;
    for (const x of [-0.5, 0.5]) {
      const rail = new THREE.Mesh(railGeo, this.ladderMaterial);
      rail.position.set(x, midY, ladderZ);
      group.add(rail);
    }
    for (let y = -0.5; y >= TUNNEL_FLOOR_Y + 0.6; y -= 0.8) {
      const rung = new THREE.Mesh(rungGeo, this.ladderMaterial);
      rung.position.set(0, y, ladderZ);
      group.add(rung);
    }

    this.activeHazards.push({
      type: 'ladder_shaft',
      screenIndex,
      minZ: centerZ - half,
      maxZ: centerZ + half,
      centerZ,
      half,
    });
  }

  // Túnel subterrâneo de ponta a ponta da tela: chão, paredes laterais,
  // paredes de topo (sem passagem para telas vizinhas), luz e escorpião.
  // `shafts` = [{centerZ, half}] dos poços com escada: o escorpião patrulha
  // o maior trecho livre — NUNCA anda embaixo de saída de escada.
  addTunnel(group, screenIndex, startZ, endZ, shafts = []) {
    const midZ = (startZ + endZ) / 2;
    const length = SCREEN_LENGTH;

    const floor = new THREE.Mesh(
      new THREE.BoxGeometry(PATH_WIDTH + 1, 0.5, length),
      this.tunnelFloorMaterial
    );
    floor.position.set(0, TUNNEL_FLOOR_Y - 0.25, midZ);
    group.add(floor);

    const sideGeo = new THREE.BoxGeometry(0.5, 8, length);
    for (const x of [-4.75, 4.75]) {
      const wall = new THREE.Mesh(sideGeo, this.tunnelWallMaterial);
      wall.position.set(x, TUNNEL_FLOOR_Y + 4, midZ);
      group.add(wall);
    }

    const endGeo = new THREE.BoxGeometry(PATH_WIDTH + 1.5, 8, 0.5);
    for (const z of [startZ - 0.3, endZ + 0.3]) {
      const wall = new THREE.Mesh(endGeo, this.tunnelWallMaterial);
      wall.position.set(0, TUNNEL_FLOOR_Y + 4, z);
      group.add(wall);
    }

    const lamp = new THREE.PointLight(0xffb060, 25, 50);
    lamp.position.set(0, TUNNEL_FLOOR_Y + 3.5, midZ);
    group.add(lamp);

    // Maior intervalo do túnel livre de poços (margem 2m de cada lado)
    const lo = endZ + 3;
    const hi = startZ - 3;
    const blocks = shafts
      .map((s) => [s.centerZ - s.half - 2, s.centerZ + s.half + 2])
      .sort((a, b) => a[0] - b[0]);
    let bestLo = lo;
    let bestHi = lo;
    let cur = lo;
    for (const [b0, b1] of [...blocks, [hi, hi]]) {
      if (b0 - cur > bestHi - bestLo) {
        bestLo = cur;
        bestHi = b0;
      }
      cur = Math.max(cur, b1);
    }
    const patrolBase = (bestLo + bestHi) / 2;
    const patrolRange = Math.max(1.5, Math.min(12, (bestHi - bestLo) / 2 - 1));
    this.addScorpion(group, screenIndex, patrolBase, TUNNEL_FLOOR_Y + 0.08, patrolRange);
  }

  addTarPit(group, screenIndex, centerZ, length = 20) {
    const pitGeo = new THREE.BoxGeometry(PATH_WIDTH, 0.2, length);
    const pitMesh = new THREE.Mesh(pitGeo, this.pitMaterial);
    pitMesh.position.set(0, -0.6, centerZ);
    group.add(pitMesh);
    // Abismo negro sem fim abaixo da superfície
    this.addBottomlessShaft(group, centerZ, length);

    this.activeHazards.push({
      type: 'tarpit',
      screenIndex,
      minZ: centerZ - length / 2 + 1,
      maxZ: centerZ + length / 2 - 1,
      centerZ,
    });
  }

  addOpeningQuicksandPit(group, screenIndex, z) {
    const pit = createOpeningQuicksandModel(0.45, 12);
    pit.group.position.set(0, -0.45, z);
    group.add(pit.group);
    // Abismo negro sem fim (20m de extensão, como o lago do cipó) abaixo do tampão móvel
    this.addBottomlessShaft(group, z, 20.4);

    const pitData = {
      type: 'disappearing_quicksand',
      screenIndex,
      pit: pit,
      segments: pit.segments,
      numSegments: pit.segments.length,
      z: z,
      radius: 10, // 20 metros totais (como o lago do cipó) - impossível pular por cima!
      timer: Math.random() * 2.0,
      isOpen: false,
      openCount: 0,
      phase: 'closed', // closed | opening | open | closing (fecho a partir da borda do herói)
      wasOpen: false,
      rumblePlayed: false,
      // Ciclo (segundos): pausa fechado e sólido (0.5s) -> abrindo em onda
      // entrada->saída (1.8s) -> totalmente aberto (5.0s) -> fechando em onda
      // a partir da borda do herói, entrada->saída (1.8s, ~11.1 m/s vs 9.0 do
      // Harry: a onda é visivelmente mais rápida que o herói, garantindo segurança).
      // Total: 9.1s, aberto na maior parte do tempo.
      closedDur: 0.5,
      openingDur: 1.8,
      openDur: 5.0,
      closingDur: 1.8,
    };

    this.activeOpeningPits.push(pitData);
    this.activeHazards.push(pitData);
  }

  // Areia movediça: encontra a seção sob a posição Z do jogador
  getQuicksandSegmentAt(pitData, z) {
    const rel = z - pitData.z; // + = lado da entrada (herói), - = lado da saída
    for (const s of pitData.segments) {
      if (rel <= s.maxOffset && rel >= s.minOffset) return s;
    }
    return null;
  }

  // Areia movediça: a seção sob os pés está aberta?
  isQuicksandOpenAt(pitData, z) {
    if (Math.abs(z - pitData.z) >= pitData.radius) return false;
    const seg = this.getQuicksandSegmentAt(pitData, z);
    if (seg) return seg.isOpen;
    return pitData.isOpen;
  }

  addWaterPond(group, screenIndex, centerZ, length = 20) {
    const waterGeo = new THREE.BoxGeometry(PATH_WIDTH, 0.3, length);
    const waterMesh = new THREE.Mesh(waterGeo, this.waterMaterial);
    waterMesh.position.set(0, -0.6, centerZ);
    group.add(waterMesh);
    // Abismo negro sem fim abaixo do lago
    this.addBottomlessShaft(group, centerZ, length);

    this.activeHazards.push({
      type: 'water',
      screenIndex,
      minZ: centerZ - length / 2 + 1,
      maxZ: centerZ + length / 2 - 1,
      centerZ,
    });
  }

  addCrocodileTrio(group, screenIndex, centerZ) {
    // 3 jacarés reduzidos (0.22) ao longo do lago de 16m (X=0, espaçados em Z).
    // Cada jacaré cobre [z-1.3, z+3.2] (zona segura nas costas vai até z+0.65).
    // Espaçamento de 6.5m (pulo máximo = 6.75m): dá para ir de jacaré em
    // jacaré, e o lago inteiro dá para cruzar só com o cipó.
    const offsetsZ = [5.5, -1.0, -7.5];
    offsetsZ.forEach((offset, idx) => {
      const croc = createCrocodileModel(0.22);
      const zPos = centerZ + offset;
      // Topo em Y=0.35 (3 voxels do modelo a 0.22 = 0.66, menos 0.31).
      croc.mesh.position.set(0, -0.31, zPos);
      croc.mesh.rotation.y = 0; // Snouts point towards incoming player (+Z)!
      group.add(croc.mesh);

      this.activeCrocodiles.push({
        screenIndex,
        croc,
        z: zPos,
        mouthTimer: idx * 1.1, // staggered mouth timing
        isOpen: false,
        wasOpen: false,
      });
    });
  }

  addVine(group, screenIndex, centerZ, phaseTime = null) {
    // Cipó alto mas alcançável: ponta em ~3.3m do solo (só agarra no ar,
    // pulando — parado no chão nunca agarra, garantido no checkVineGrab).
    const vine = createVineModel(24, 0.28);
    // Position pivot high up in canopy overhead
    vine.pivot.position.set(0, 9.0, centerZ);
    group.add(vine.pivot);

    this.activeVines.push({
      screenIndex,
      vine,
      centerZ,
      time: phaseTime ?? Math.random() * Math.PI,
    });
  }

  addCampfire(group, screenIndex, z) {
    const campfire = createCampfireModel(0.24);
    campfire.group.position.set(0, 0, z);
    group.add(campfire.group);

    this.animatedCampfires.push({
      screenIndex,
      campfire: campfire,
      time: Math.random() * 10,
    });

    this.activeHazards.push({
      type: 'fire',
      screenIndex,
      z: z,
      radius: 1.4,
    });
  }

  addScorpion(group, screenIndex, z, groundY = 0.08, patrolRange = 3) {
    const scorpion = createScorpionModel(0.28);
    scorpion.position.set(0, groundY, z);
    group.add(scorpion);

    this.activeHazards.push({
      type: 'scorpion',
      screenIndex,
      mesh: scorpion,
      baseZ: z,
      baseY: groundY,
      patrolRange,
      time: 0,
      radius: 1.2,
    });
  }

  addTreasure(group, screenIndex, z, type = 'gold') {
    const treasure = createTreasureModel(type, 0.22);
    // O anel de diamante é erguido para o aro dourado não parecer afundado no solo
    const liftY = type === 'diamond' ? 0.3 : 0.05;
    treasure.mesh.position.set(0, liftY, z);
    group.add(treasure.mesh);

    this.activeTreasures.push({
      screenIndex,
      mesh: treasure.mesh,
      points: treasure.points,
      type: treasure.type,
      z: z,
      collected: false,
    });
  }

  // Update dynamic elements (animations, rolling logs, vine pendulum)
  update(delta) {
    // 1. Update Swinging Vines
    this.activeVines.forEach(v => {
      v.time += delta * v.vine.speed;
      v.vine.angle = Math.sin(v.time) * v.vine.maxAngle;
      v.vine.pivot.rotation.x = v.vine.angle; // swings forward and backward along Z!
    });

    // 2. Update Crocodiles (Mouth open/close cycles with high-visibility warnings)
    this.activeCrocodiles.forEach(c => {
      c.mouthTimer += delta;
      // Cycle: 4.4s total (2.6s closed/safe, 0.3s warning, 1.3s wide open, 0.2s snap shut)
      const cycleTime = c.mouthTimer % 4.4;
      let targetAngle = 0;

      if (cycleTime < 2.5) {
        // STATE: CLOSED (100% SAFE TO STEP)
        c.isOpen = false;
        targetAngle = 0;
        if (c.croc.eyeMaterial) c.croc.eyeMaterial.color.setHex(0xf8d820); // Calm Yellow eyes

        if (c.wasOpen) {
          // Just snapped shut! Play safety sound
          audio.playCrocSnap();
          c.wasOpen = false;
        }
      } else if (cycleTime < 2.8) {
        // STATE: WARNING (Eyes flash orange before opening!)
        c.isOpen = false;
        targetAngle = -0.2;
        if (c.croc.eyeMaterial) c.croc.eyeMaterial.color.setHex(0xff8800); // Warning Orange eyes
      } else if (cycleTime < 4.1) {
        // STATE: WIDE OPEN (DEADLY DANGER!)
        c.isOpen = true;
        c.wasOpen = true;
        targetAngle = -1.15; // Jaws wide open (~66 degrees), bright red throat exposed!
        if (c.croc.eyeMaterial) c.croc.eyeMaterial.color.setHex(0xff0000); // Angry Red eyes
      } else {
        // STATE: SNAPPING SHUT
        c.isOpen = true;
        targetAngle = 0;
      }

      // Smooth jaw rotation
      if (c.croc.upperJaw) {
        c.croc.currentAngle = THREE.MathUtils.lerp(c.croc.currentAngle || 0, targetAngle, delta * 16);
        c.croc.upperJaw.rotation.x = c.croc.currentAngle;
      }
    });

    // 3. Update Rolling Logs (ponto único de queda por tela: os troncos
    // revezam nele no tempo via relógio — tudo determinístico, sem
    // aleatoriedade: queda do céu, rolagem até o poço azul, queda no poço).
    this.activeRollingLogs.forEach(l => {
      l.clock += delta;
      // Aguardando sua vez no revezamento (invisível no alto).
      if (l.waiting) {
        if (l.clock >= l.nextDrop) {
          l.nextDrop += World.ROLLING_CYCLE;
          l.waiting = false;
          l.falling = true;
          l.z = l.spawnZ;
          l.y = l.spawnY;
          l.vy = 0;
          l.mesh.visible = true;
          l.mesh.position.z = l.z;
          l.mesh.position.y = l.y;
          l.landingShadow.visible = true;
        } else {
          return;
        }
      }
      // Queda do céu antes de rolar: gravidade até o solo
      if (l.falling) {
        l.vy -= 30 * delta;
        l.y += l.vy * delta;
        const fallProgress = THREE.MathUtils.clamp(
          1 - (l.y - l.groundY) / l.maxFallHeight,
          0,
          1,
        );
        // Sinalização pulsante: cresce com a aproximação + pisca vermelho.
        const pulse = (Math.sin(performance.now() * 0.012) + 1) / 2;
        const warnScale = 0.3 + fallProgress * 0.85;
        l.landingShadow.visible = true;
        l.landingShadow.position.z = l.z;
        l.landingShadow.scale.set(warnScale, 1, warnScale);
        if (l.alertDiscMat) l.alertDiscMat.opacity = 0.55 + fallProgress * 0.3;
        if (l.alertRingMat) l.alertRingMat.opacity = 0.45 + pulse * 0.5;
        if (l.alertDisc) l.alertDisc.rotation.z += delta * 1.5;
        if (l.alertRing) {
          const ringPulse = 1 + pulse * 0.12;
          l.alertRing.scale.set(ringPulse, ringPulse, 1);
        }
        if (l.y <= l.groundY) {
          l.y = l.groundY;
          l.vy = 0;
          l.falling = false;
          l.landingShadow.visible = false;
        }
        l.mesh.position.y = l.y;
        l.mesh.rotation.x += delta * 3; // giro suave durante a queda
      } else if (l.fallingIntoPit) {
        // O tronco chega ao poço azul e cai nele.
        l.vy -= 30 * delta;
        l.y += l.vy * delta;
        l.z = l.exitPitZ;
        l.mesh.position.y = l.y;
        l.mesh.position.z = l.z;
        l.mesh.rotation.x += delta * 10;

        if (l.y <= -12) {
          // Caiu no poço: some e aguarda sua próxima vez no revezamento
          // (nextDrop já agendado — o ciclo exato se mantém para sempre).
          l.waiting = true;
          l.falling = false;
          l.fallingIntoPit = false;
          l.mesh.visible = false;
          l.landingShadow.visible = false;
        }
      } else {
        l.mesh.position.y = l.groundY;
        l.mesh.rotation.x += delta * 12; // rolling animation
        // Moves towards player (+Z direction) — só rola após tocar o solo
        l.z += l.speed * delta;
        l.mesh.position.z = l.z;

        // Ao chegar ao poço azul, cai nele em vez de reaparecer de repente.
        if (l.z >= l.exitPitZ) {
          l.z = l.exitPitZ;
          l.y = l.groundY;
          l.vy = 0;
          l.fallingIntoPit = true;
          l.landingShadow.visible = false;
        }
      }
    });

    // 4. Update Animated Campfires (Core, multi-tongue flames, rising embers, flickering light)
    this.animatedCampfires.forEach(f => {
      f.time += delta;
      const t = f.time;
      const c = f.campfire;

      // A. Blazing Core Heat Pulse
      const scaleCoreY = 1.0 + Math.sin(t * 14) * 0.16 + Math.cos(t * 22) * 0.1;
      const scaleCoreXZ = 1.0 + Math.sin(t * 9) * 0.08;
      if (c.coreFlame) {
        c.coreFlame.scale.set(scaleCoreXZ, scaleCoreY, scaleCoreXZ);
      }

      // B. Outer Flame Tongues Dancing & Swaying
      if (c.outerFlames) {
        c.outerFlames.forEach((flame, i) => {
          const scaleY = 1.0 + Math.sin(t * 12 + i * 1.7) * 0.28 + Math.sin(t * 19 + i * 2.3) * 0.14;
          const swayX = Math.sin(t * 7 + i * 1.4) * 0.08;
          const swayZ = Math.cos(t * 8 + i * 1.8) * 0.08;
          flame.scale.set(1.0, scaleY, 1.0);
          flame.rotation.z = swayX;
          flame.rotation.x = swayZ;
        });
      }

      // C. Rising Glowing Voxel Embers / Sparks
      if (c.embers) {
        c.embers.forEach(ember => {
          ember.mesh.position.y += ember.speed * delta;
          ember.mesh.position.x += Math.sin(t * 5 + ember.seed) * 0.012;
          ember.mesh.position.z += Math.cos(t * 4 + ember.seed) * 0.012;

          if (ember.mesh.position.y > 2.5) {
            ember.mesh.position.y = 0.35 + Math.random() * 0.2;
            ember.mesh.position.x = (Math.random() - 0.5) * 0.6;
            ember.mesh.position.z = (Math.random() - 0.5) * 0.6;
          }
        });
      }

      // D. Dynamic Warm Fire Light Flicker
      if (c.light) {
        c.light.intensity = 2.0 + Math.sin(t * 18) * 0.4 + (Math.random() - 0.5) * 0.3;
      }
    });

    // 5. Update Scorpions (scuttle back and forth along trail with step bounce & light pulse)
    this.activeHazards.filter(h => h.type === 'scorpion').forEach(s => {
      // Patrulha lenta e constante (~2.2 m/s no pico): dá tempo de pular por cima
      s.time += delta * (2.2 / (s.patrolRange || 3));
      s.mesh.position.z = s.baseZ + Math.sin(s.time) * (s.patrolRange || 3);
      s.z = s.mesh.position.z;
      s.mesh.rotation.y = Math.cos(s.time) >= 0 ? 0 : Math.PI;

      // Arachnid scuttle wobble and slight step bounce above the ground
      s.mesh.rotation.z = Math.sin(s.time * 12) * 0.04;
      s.mesh.position.y = (s.baseY ?? 0.08) + Math.abs(Math.sin(s.time * 12)) * 0.03;

      if (s.mesh.userData && s.mesh.userData.light) {
        s.mesh.userData.light.intensity = 1.4 + Math.sin(s.time * 8) * 0.5;
      }
    });

    // 6. Update Treasures (rotate in place)
    this.activeTreasures.forEach(t => {
      if (!t.collected) {
        t.mesh.rotation.y += delta * 2.2;
      }
    });

    // 7. Update Disappearing Quicksand Pits (ciclo por seção)
    // Fases: pausa fechado e sólido (0.5s) -> abrindo em onda da entrada até
    // a saída (2.2s) -> totalmente aberto (5.0s) -> fechando em onda a partir
    // da borda do herói, entrada->saída (2.2s, para correr junto com a onda).
    // Total: 9.9s. Cada seção parte-se ao meio (X) e afunda (Y).
    this.activeOpeningPits.forEach(p => {
      p.timer += delta;
      const n = p.numSegments;
      const total = p.closedDur + p.openingDur + p.openDur + p.closingDur;
      const cycleTime = p.timer % total;

      let phase = 'closed';
      if (cycleTime < p.closedDur) {
        phase = 'closed';
      } else if (cycleTime < p.closedDur + p.openingDur) {
        phase = 'opening';
      } else if (cycleTime < p.closedDur + p.openingDur + p.openDur) {
        phase = 'open';
      } else {
        phase = 'closing';
      }
      p.phase = phase;

      // Sons de transição do ciclo global
      if (phase === 'opening') {
        if (!p.rumblePlayed) {
          audio.playQuicksandRumble();
          p.rumblePlayed = true;
        }
      } else if (phase === 'closed') {
        if (p.wasOpen) {
          audio.playGroundThud();
          p.wasOpen = false;
          p.rumblePlayed = false;
        }
      }

      let openCount = 0;
      p.segments.forEach((seg, i) => {
        // Instante em que esta seção deve estar aberta (alvo binário 0/1).
        // Abertura E fecho em onda da entrada (i=0, +Z, borda do herói) até
        // a saída (i=n-1, -Z): o fecho varre ~9.1 m/s, na mesma direção e
        // velocidade do Harry (9.0), para atravessar correndo junto com a onda.
        const openStart = p.closedDur + (i * p.openingDur) / n;
        const closeStart = p.closedDur + p.openingDur + p.openDur + (i * p.closingDur) / n;
        const target = cycleTime >= openStart && cycleTime < closeStart ? 1 : 0;

        // Abertura/fecho suave da seção
        seg.openAmount = THREE.MathUtils.lerp(seg.openAmount ?? 0, target, delta * 10);
        if (Math.abs(seg.openAmount - target) < 0.01) seg.openAmount = target;
        seg.isOpen = seg.openAmount > 0.5;
        if (seg.isOpen) openCount++;

        // Metades partem-se do meio para as laterais (X) e afundam (Y)
        const sep = seg.openAmount * 1.4;
        const sink = seg.openAmount * 1.4;
        // Tremor de terremoto enquanto a seção está em movimento
        const moving = Math.abs(target - seg.openAmount) > 0.02 ? 1 : 0;
        const jitter = moving * Math.sin(p.timer * 50 + i * 2.1) * 0.06;
        seg.leftMesh.position.set(seg.baseOffset - sep + jitter, -sink, seg.baseOffset);
        seg.rightMesh.position.set(seg.baseOffset + sep + jitter, -sink, seg.baseOffset);
      });

      p.openCount = openCount;
      p.isOpen = openCount > 0;
      if (openCount > 0) p.wasOpen = true;
    });
  }
}
