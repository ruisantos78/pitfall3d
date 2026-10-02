import * as THREE from 'three';
import {
  createCrocodileModel,
  createVineModel,
  createScorpionModel,
  createCampfireModel,
  createTreasureModel,
  createOpeningQuicksandModel,
  createSnakeModel,
  createLadderModel,
  createSpikesPitModel,
} from './models/index.js';
import {
  SCREEN_LENGTH,
  PATH_WIDTH,
  TUNNEL_FLOOR_Y,
  CEIL_TOP_Y,
  PIT_FLOOR_Y,
} from './WorldConstants.js';

// Shared GPU resources for the falling-log landing warning: a single canvas
// texture upload reused by every rolling log (cloning a CanvasTexture per log
// uploads a duplicate GPU texture each time).
let sharedStripeTex = null;
let sharedStripeGeo = null;

function getSharedStripeTex() {
  if (sharedStripeTex) return sharedStripeTex;
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
  sharedStripeTex = tex;
  return tex;
}

export class HazardBuilder {
  static ROLLING_CYCLE = 7.4;

  constructor(world) {
    this.world = world;
  }

  addStationaryLog(group, screenIndex, z) {
    const log = this.world.logTemplate.clone();
    log.position.set(0, 0.45, z);
    group.add(log);

    this.world.activeHazards.push({
      type: 'log',
      screenIndex,
      mesh: log,
      z: z,
      radius: 1.2,
      isRolling: false,
    });
  }

  createFallingLogWarning(z) {
    const group = new THREE.Group();
    // Shared texture + geometry: only the small material is per-log (it fades
    // independently). The growth cue is conveyed via band scale, so no
    // per-log texture repeat is needed.
    if (!sharedStripeGeo) {
      sharedStripeGeo = new THREE.PlaneGeometry(1, 1.8);
      this.world.sharedGeometries.add(sharedStripeGeo);
    }
    const bandMat = new THREE.MeshBasicMaterial({
      map: getSharedStripeTex(),
      transparent: true,
      opacity: 0.8,
      depthWrite: false,
    });
    const band = new THREE.Mesh(sharedStripeGeo, bandMat);
    band.rotation.x = -Math.PI / 2;
    band.position.y = 0.02;
    group.add(band);

    group.position.set(0, 0, z);
    return { group, band, bandMat, tex: null };
  }

  rollingDropZ(endZ) {
    return endZ + 8;
  }

  addRollingLog(group, screenIndex, startZ, endZ, idx, count) {
    const log = this.world.logTemplate.clone();
    const dropZ = this.rollingDropZ(endZ);
    const spawnY = 12;
    log.position.set(0, spawnY, dropZ);
    log.visible = false;
    group.add(log);

    const alert = this.createFallingLogWarning(dropZ);
    alert.group.visible = false;
    group.add(alert.group);

    const logData = {
      type: 'rolling_log',
      screenIndex,
      group,
      mesh: log,
      landingShadow: alert.group,
      band: alert.band,
      bandMat: alert.bandMat,
      tex: alert.tex,
      z: dropZ,
      spawnZ: dropZ,
      y: spawnY,
      spawnY,
      vy: 0,
      waiting: true,
      clock: 0,
      nextDrop: (idx * HazardBuilder.ROLLING_CYCLE) / count,
      falling: false,
      fallingIntoPit: false,
      groundY: 0.45,
      maxFallHeight: spawnY - 0.45,
      startZ,
      endZ,
      exitPitZ: startZ - 1.5,
      speed: 9.0,
      radius: 1.2,
    };

    this.world.activeRollingLogs.push(logData);
    this.world.activeHazards.push(logData);
  }

  addLogExitPit(group, screenIndex, startZ, length = 1.5) {
    const centerZ = startZ - 1.5;
    const pitWidth = PATH_WIDTH + 1;
    const exitPit = createSpikesPitModel(pitWidth, length);
    exitPit.position.set(0, 0, centerZ);
    group.add(exitPit);

    this.world.activeHazards.push({
      type: 'log_exit_pit',
      screenIndex,
      minZ: centerZ - length / 2,
      maxZ: centerZ + length / 2,
      centerZ,
    });
  }

  addLadderShaft(group, screenIndex, centerZ, half, hasLadder = true) {
    const holeLen = half * 2 + 1;
    const bandSideGeo = this.world.sharedGeo(`shaftBandSide:${half}`, () => new THREE.BoxGeometry(0.3, 6, holeLen + 0.6));
    for (const x of [-2.65, 2.65]) {
      const band = new THREE.Mesh(bandSideGeo, this.world.caveCeilMaterial);
      band.position.set(x, -4.0, centerZ);
      group.add(band);
    }
    const bandEndGeo = this.world.sharedGeo('shaftBandEnd', () => new THREE.BoxGeometry(5.6, 6, 0.3));
    for (const z of [centerZ - half - 0.65, centerZ + half + 0.65]) {
      const band = new THREE.Mesh(bandEndGeo, this.world.caveCeilMaterial);
      band.position.set(0, -4.0, z);
      group.add(band);
    }

    let ladder = null;
    if (hasLadder) {
      ladder = createLadderModel(half, TUNNEL_FLOOR_Y);
      ladder.visible = this.world.tunnelManager.openShaftScreens?.has(screenIndex) === true;
      ladder.position.set(0, 0, centerZ - half + 0.45);
      group.add(ladder);
    }

    const hazard = {
      type: 'ladder_shaft',
      screenIndex,
      minZ: centerZ - half,
      maxZ: centerZ + half,
      centerZ,
      half,
      hasLadder,
      ladder,
      ceilingPlug: null,
    };
    this.world.activeHazards.push(hazard);

    if (hasLadder) {
      const plugLen = half * 2 + 1;
      const plug = new THREE.Mesh(
        this.world.sharedGeo(`ceilPlug:${half}`, () => new THREE.BoxGeometry(PATH_WIDTH + 1, 0.5, plugLen)),
        this.world.caveCeilMaterial
      );
      plug.position.set(0, CEIL_TOP_Y - 0.25, centerZ);
      const startOpen = this.world.tunnelManager.openShaftScreens?.has(screenIndex);
      plug.visible = !startOpen;
      if (startOpen) this.world.tunnelManager.openPlugs.push(plug);
      group.add(plug);
      hazard.ceilingPlug = plug;
    }
  }

  addTarPit(group, screenIndex, centerZ, length = 20) {
    const tarGeo = this.world.sharedGeo('tarSurface', () => new THREE.BoxGeometry(PATH_WIDTH, 0.2, length));
    const tarMesh = new THREE.Mesh(tarGeo, this.world.pitMaterial);
    tarMesh.position.set(0, -0.6, centerZ);
    group.add(tarMesh);
    this.addShallowPitBottom(group, centerZ, length);
    this.world.activeHazards.push({
      type: 'tarpit',
      screenIndex,
      minZ: centerZ - length / 2,
      maxZ: centerZ + length / 2,
      centerZ,
    });
  }

  addOpeningQuicksandPit(group, screenIndex, z) {
    const pit = createOpeningQuicksandModel(0.45, 12);
    pit.group.position.set(0, -0.45, z);
    group.add(pit.group);

    this.addShallowPitBottom(group, z, 20);
    const pitData = {
      type: 'disappearing_quicksand',
      screenIndex,
      pit: pit,
      segments: pit.segments,
      numSegments: pit.segments.length,
      z: z,
      radius: 10,
      timer: Math.random() * 2.0,
      isOpen: false,
      openCount: 0,
      phase: 'closed',
      wasOpen: false,
      rumblePlayed: false,
      closedDur: 1.5,
      openingDur: 1.1,
      openDur: 5.0,
      closingDur: 1.1,
    };

    this.world.activeOpeningPits.push(pitData);
    this.world.activeHazards.push(pitData);
  }

  getQuicksandSegmentAt(pitData, z) {
    const rel = z - pitData.z;
    for (const s of pitData.segments) {
      if (rel <= s.maxOffset && rel >= s.minOffset) return s;
    }
    return null;
  }

  isQuicksandOpenAt(pitData, z) {
    if (Math.abs(z - pitData.z) >= pitData.radius) return false;
    const seg = this.getQuicksandSegmentAt(pitData, z);
    if (seg) return seg.isOpen;
    return pitData.isOpen;
  }

  addWaterPond(group, screenIndex, centerZ, length = 20) {
    const waterGeo = this.world.sharedGeo('pondWater', () => new THREE.BoxGeometry(PATH_WIDTH, 0.3, length));
    const waterMesh = new THREE.Mesh(waterGeo, this.world.waterMaterial);
    waterMesh.position.set(0, -0.6, centerZ);
    group.add(waterMesh);
    this.addShallowPitBottom(group, centerZ, length);
    this.world.activeHazards.push({
      type: 'water',
      screenIndex,
      minZ: centerZ - length / 2,
      maxZ: centerZ + length / 2,
      centerZ,
    });
  }

  addShallowPitBottom(group, centerZ, length) {
    const bottomGeo = this.world.sharedGeo('surfacePitBottom', () =>
      new THREE.BoxGeometry(PATH_WIDTH, 0.2, 20)
    );
    const bottom = new THREE.Mesh(bottomGeo, this.world.pitMaterial);
    bottom.scale.z = length / 20;
    bottom.position.set(0, PIT_FLOOR_Y - 0.1, centerZ);
    group.add(bottom);
  }

  addCrocodileTrio(group, screenIndex, centerZ) {
    const offsetsZ = [6.5, 0, -6.5];
    offsetsZ.forEach((offset, idx) => {
      const croc = createCrocodileModel(0.22);
      const zPos = centerZ + offset;
      croc.mesh.position.set(0, -0.31, zPos);
      croc.mesh.rotation.y = 0;
      group.add(croc.mesh);

      this.world.activeCrocodiles.push({
        screenIndex,
        croc,
        z: zPos,
        mouthTimer: idx * 1.1,
        isOpen: false,
        wasOpen: false,
      });
    });
  }

  addVine(group, screenIndex, centerZ, phaseTime = null) {
    const vine = createVineModel(24, 0.28);
    vine.pivot.position.set(0, 9.0, centerZ);
    group.add(vine.pivot);

    this.world.activeVines.push({
      screenIndex,
      vine,
      centerZ,
      time: phaseTime ?? Math.random() * Math.PI,
    });
  }

  addSnake(group, screenIndex, z) {
    const snake = createSnakeModel(0.12);
    snake.group.position.set(0, 0, z);
    snake.group.rotation.y = (Math.random() - 0.5) * 0.4;
    group.add(snake.group);

    this.world.animatedSnakes.push({
      screenIndex,
      snake,
      time: Math.random() * Math.PI * 2,
    });

    this.world.activeHazards.push({
      type: 'snake',
      screenIndex,
      z: z,
      radius: 1.4,
    });
  }

  addCampfire(group, screenIndex, z) {
    const campfire = createCampfireModel(0.24);
    campfire.group.position.set(0, 0, z);
    group.add(campfire.group);

    const fireEmitter = {
      screenIndex,
      color: 0xff7722,
      distance: 12,
      intensity: 2.2,
      getPos: (v) => v.set(0, 1.1, z),
    };
    this.world.lightPoolManager.addEmitter(fireEmitter);
    this.world.animatedCampfires.push({
      screenIndex,
      campfire: campfire,
      emitter: fireEmitter,
      time: Math.random() * 10,
    });

    this.world.activeHazards.push({
      type: 'fire',
      screenIndex,
      z: z,
      radius: 1.4,
    });
  }

  addScorpion(group, screenIndex, z, groundY = 0.08, patrolRange = 3) {
    const scorpion = createScorpionModel(0.22);
    scorpion.position.set(0, groundY, z);
    group.add(scorpion);

    const hazard = {
      type: 'scorpion',
      screenIndex,
      mesh: scorpion,
      baseZ: z,
      baseY: groundY,
      patrolRange,
      time: 0,
      radius: 0.95,
    };
    this.world.activeHazards.push(hazard);

    const anchorLocal = scorpion.userData?.lightAnchor?.position?.clone() ?? new THREE.Vector3();
    const followQuat = new THREE.Quaternion();
    const followPos = new THREE.Vector3();
    const venomEmitter = {
      screenIndex,
      underground: true,
      color: 0xffcc00,
      distance: 5,
      intensity: 1.4,
      getPos: (v) => {
        scorpion.getWorldQuaternion(followQuat);
        followPos.copy(anchorLocal).applyQuaternion(followQuat);
        return v.copy(scorpion.position).add(followPos);
      },
    };
    this.world.lightPoolManager.addEmitter(venomEmitter);
    hazard.emitter = venomEmitter;
  }

  addTreasure(group, screenIndex, z, type = 'gold', slotKey = null) {
    const treasure = createTreasureModel(type, 0.22);
    const liftY = type === 'diamond' ? 0.3 : 0.05;
    treasure.mesh.position.set(0, liftY, z);
    group.add(treasure.mesh);

    this.world.activeTreasures.push({
      screenIndex,
      mesh: treasure.mesh,
      points: treasure.points,
      type: treasure.type,
      z: z,
      slotKey,
      collected: false,
    });
  }
}
