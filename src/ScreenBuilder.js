import * as THREE from 'three';
import {
  createTreeModel,
  createLogModel,
  createCrocodileModel,
  createVineModel,
  createCampfireModel,
  createTreasureModel,
  createOpeningQuicksandModel,
  createSnakeModel,
  createBoundaryFlagsModel,
  createLadderModel,
  createTunnelTorchModel,
  createSpikesPitModel,
} from './models/index.js';
import { createVoxelGeometry } from './voxel.js';
import {
  SCREEN_LENGTH,
  PATH_WIDTH,
  TUNNEL_FLOOR_Y,
  CEIL_TOP_Y,
  PIT_FLOOR_Y
} from './WorldConstants.js';
import { LevelGenerator } from './LevelGenerator.js';

export class ScreenBuilder {
  constructor(world) {
    this.world = world;
  }

  build(index) {
    const group = new THREE.Group();
    const startZ = -index * SCREEN_LENGTH;
    const endZ = -(index + 1) * SCREEN_LENGTH;
    const midZ = (startZ + endZ) / 2;

    const screenType = LevelGenerator.getScreenType(index);

    this.buildGroundAndBorders(group, index, startZ, endZ, screenType);
    this.addBoundaryFlags(group, startZ, endZ);
    this.addTunnel(group, index, startZ, endZ);

    if (screenType === 'HOLE_SINGLE') {
      this.addCaveCeiling(group, startZ, endZ, [{ centerZ: midZ, half: 2 }]);
    } else if (screenType === 'HOLE_TRIPLE') {
      this.addCaveCeiling(group, startZ, endZ, [12, 0, -12]
        .map((offset) => ({ centerZ: midZ + offset, half: 1.5 })));
    } else {
      this.addCaveCeiling(group, startZ, endZ);
    }

    this.buildScreenFeatures(group, index, startZ, endZ, midZ, screenType);

    return {
      index,
      group,
      startZ,
      endZ,
      type: screenType,
    };
  }

  buildGroundAndBorders(group, index, startZ, endZ, screenType) {
    const length = SCREEN_LENGTH;

    for (let z = startZ; z > endZ; z -= 7) {
      const treeL1 = this.world.treeTemplate.clone();
      treeL1.position.set(-5.5 - Math.random() * 1.5, 0, z + (Math.random() - 0.5) * 2);
      treeL1.rotation.y = (z % 4) * (Math.PI / 2);
      group.add(treeL1);

      const treeL2 = this.world.treeTemplate.clone();
      treeL2.position.set(-10 - Math.random() * 2, 0, z + 3);
      group.add(treeL2);

      const treeR1 = this.world.treeTemplate.clone();
      treeR1.position.set(5.5 + Math.random() * 1.5, 0, z + (Math.random() - 0.5) * 2);
      treeR1.rotation.y = ((z + 2) % 4) * (Math.PI / 2);
      group.add(treeR1);

      const treeR2 = this.world.treeTemplate.clone();
      treeR2.position.set(10 + Math.random() * 2, 0, z + 3);
      group.add(treeR2);
    }

    const hasCentralHazard = ['QUICKSAND_VINE', 'TAR_PIT_VINE', 'CROCODILE_VINE', 'CROCODILE_POND', 'QUICKSAND_VINE_OPEN', 'BLUE_QUICKSAND'].includes(screenType);
    const centralHazardHalf = 10;
    const hazardStartZ = (startZ + endZ) / 2 + centralHazardHalf;
    const hazardEndZ = (startZ + endZ) / 2 - centralHazardHalf;

    const midZ = (startZ + endZ) / 2;
    const hasDisappearingPit = ['DISAPPEARING_QUICKSAND', 'BLUE_QUICKSAND'].includes(screenType);
    const pitCenterZ = midZ;

    const specForGround = LevelGenerator.getAuthenticSpec(index);
    const hasLogExitPit = !!specForGround && specForGround.sceneType !== 5 && specForGround.sceneType !== 4 && specForGround.objectType <= 3;
    const logExitPitCenterZ = startZ - 1.5;

    const groundVoxels = [];
    const grassColor = '#306c24';
    const grassBorderColor = '#489830';
    const pathColor = '#9a7638';
    const pathShade = '#825f26';

    for (let z = 0; z < length; z += 1.5) {
      const worldZ = startZ - z;
      const isOverHazard = hasCentralHazard && (worldZ <= hazardStartZ && worldZ >= hazardEndZ);
      const isOverDisappearingPit = hasDisappearingPit && Math.abs(worldZ - pitCenterZ) <= 10.2;
      const isOverShaft = (screenType === 'HOLE_SINGLE' && Math.abs(worldZ - midZ) <= 2.0) ||
        (screenType === 'HOLE_TRIPLE' &&
          (Math.abs(worldZ - (midZ + 12)) <= 1.5 || Math.abs(worldZ - midZ) <= 1.5 || Math.abs(worldZ - (midZ - 12)) <= 1.5));
      const isOverLogExit = hasLogExitPit && Math.abs(worldZ - logExitPitCenterZ) <= 0.8;
      if (isOverLogExit) continue;

      for (let x = -4; x <= 4; x++) {
        const isEdge = Math.abs(x) >= 3;
        if (!isEdge && (isOverHazard || isOverDisappearingPit || isOverShaft)) continue;
        let col = isEdge ? ((x + z) % 2 === 0 ? grassBorderColor : grassColor) : (((x + z) % 3 === 0) ? pathShade : pathColor);
        groundVoxels.push({ x, y: 0, z: -z, color: col });
      }
    }

    if (groundVoxels.length > 0) {
      const groundGeo = createVoxelGeometry(groundVoxels, 1.0, false);
      const groundMesh = new THREE.Mesh(groundGeo, this.world.groundMaterial);
      groundMesh.position.set(-0.5, -1.0, startZ);
      groundMesh.receiveShadow = true;
      group.add(groundMesh);
    }

    const borderGeo = this.world.sharedGeo('border', () => new THREE.BoxGeometry(16, 1, length));
    const borderMat = this.world.sharedMat('borderMat', () => new THREE.MeshLambertMaterial({ color: 0x224e18, flatShading: true }));

    const leftBorder = new THREE.Mesh(borderGeo, borderMat);
    leftBorder.position.set(-12.5, -0.5, (startZ + endZ) / 2);
    group.add(leftBorder);

    const rightBorder = new THREE.Mesh(borderGeo, borderMat);
    rightBorder.position.set(12.5, -0.5, (startZ + endZ) / 2);
    group.add(rightBorder);
  }

  buildScreenFeatures(group, index, startZ, endZ, midZ, type) {
    const spec = LevelGenerator.getAuthenticSpec(index) || { rand: 0, objectType: 4, sceneType: 0, treePat: 0 };
    const obj = spec.objectType;
    const scene = spec.sceneType;
    const objZ = startZ - SCREEN_LENGTH * (124 / 160);
    const treasureKinds = ['money', 'silver', 'gold', 'diamond'];

    const addOverlayObject = (z) => {
      if (scene === 5) return;
      if (obj <= 3) {
        const count = [1, 2, 2, 3][obj];
        for (let i = 0; i < count; i++) {
          this.world.addRollingLog(group, index, startZ, endZ, i, count);
        }
        this.world.addLogExitPit(group, index, startZ);
      } else if (obj === 4) {
        this.world.addStationaryLog(group, index, z);
      } else if (obj === 5) {
        this.world.addStationaryLog(group, index, z + 5);
        this.world.addStationaryLog(group, index, z - 5);
      } else if (obj === 6) {
        this.world.addCampfire(group, index, z);
      } else if (obj === 7) {
        this.world.addSnake(group, index, z);
      }
    };

    switch (type) {
      case 'HOLE_SINGLE':
        this.world.addLadderShaft(group, index, midZ, 2);
        addOverlayObject(objZ);
        break;
      case 'HOLE_TRIPLE':
        this.world.addLadderShaft(group, index, midZ + 12, 1.5, false);
        this.world.addLadderShaft(group, index, midZ, 1.5, true);
        this.world.addLadderShaft(group, index, midZ - 12, 1.5, false);
        addOverlayObject(objZ);
        break;
      case 'DISAPPEARING_QUICKSAND': {
        const slotKey = this.world.treasureKey(index);
        if (!this.world.collectedTreasureSlots.has(slotKey)) {
          this.world.addOpeningQuicksandPit(group, index, midZ);
          this.world.addTreasure(group, index, objZ, treasureKinds[obj & 3], slotKey);
        } else {
          this.world.addOpeningQuicksandPit(group, index, midZ);
        }
        break;
      }
      case 'BLUE_QUICKSAND':
        this.world.addOpeningQuicksandPit(group, index, midZ);
        addOverlayObject(objZ);
        break;
      case 'QUICKSAND_VINE':
        this.world.addWaterPond(group, index, midZ, 20);
        this.world.addVine(group, index, midZ);
        addOverlayObject(objZ);
        break;
      case 'TAR_PIT_VINE':
        this.world.addTarPit(group, index, midZ, 20);
        this.world.addVine(group, index, midZ);
        addOverlayObject(objZ);
        break;
      case 'CROCODILE_VINE':
        this.world.addWaterPond(group, index, midZ, 20);
        this.world.addCrocodileTrio(group, index, midZ);
        this.world.addVine(group, index, midZ);
        break;
      case 'CROCODILE_POND':
        this.world.addWaterPond(group, index, midZ, 20);
        this.world.addCrocodileTrio(group, index, midZ);
        break;
      case 'QUICKSAND_VINE_OPEN':
        this.world.addOpeningQuicksandPit(group, index, midZ);
        this.world.addVine(group, index, midZ);
        addOverlayObject(objZ);
        break;
      default:
        this.world.addStationaryLog(group, index, midZ);
        break;
    }
  }

  addBoundaryFlags(group, startZ, endZ) {
    const flags = createBoundaryFlagsModel(startZ);
    group.add(flags);
  }

  addCaveCeiling(group, startZ, endZ, shaftCuts = []) {
    const cuts = shaftCuts
      .map((s) => [s.centerZ - s.half - 0.5, s.centerZ + s.half + 0.5])
      .sort((a, b) => a[0] - b[0]);
    let cur = endZ;
    const closeSeg = (hi) => {
      if (hi - cur >= 0.3) {
        const seg = new THREE.Mesh(
          this.world.sharedGeo(`ceilSeg:${hi - cur}`, () => new THREE.BoxGeometry(PATH_WIDTH + 1, 0.5, hi - cur)),
          this.world.caveCeilMaterial
        );
        seg.position.set(0, CEIL_TOP_Y - 0.25, (cur + hi) / 2);
        group.add(seg);
      }
      cur = hi;
    };
    for (const [c0, c1] of cuts) {
      closeSeg(Math.min(c0, startZ));
      cur = Math.max(cur, c1);
    }
    closeSeg(startZ);
  }

  addTunnel(group, screenIndex, startZ, endZ) {
    const midZ = (startZ + endZ) / 2;
    const length = SCREEN_LENGTH;

    const floor = new THREE.Mesh(
      this.world.sharedGeo('tunnelFloor', () => new THREE.BoxGeometry(PATH_WIDTH + 1, 0.5, length)),
      this.world.tunnelFloorMaterial
    );
    floor.position.set(0, TUNNEL_FLOOR_Y - 0.25, midZ);
    group.add(floor);

    const sideGeo = this.world.sharedGeo('tunnelSide', () => new THREE.BoxGeometry(0.5, 7.5, length));
    for (const x of [-4.75, 4.75]) {
      const wall = new THREE.Mesh(sideGeo, this.world.tunnelWallMaterial);
      wall.position.set(x, TUNNEL_FLOOR_Y + 3, midZ);
      group.add(wall);
    }

    const lampPos = new THREE.Vector3(0, TUNNEL_FLOOR_Y + 3.5, midZ);
    this.world.lightPoolManager.addEmitter({
      screenIndex,
      underground: true,
      color: 0xffb060,
      distance: 50,
      intensity: 25,
      getPos: (v) => v.copy(lampPos),
    });

    for (const z of [startZ - 2]) {
      for (const x of [4.3, -4.3]) {
        const torch = createTunnelTorchModel(x > 0);
        const glowPos = new THREE.Vector3(x, TUNNEL_FLOOR_Y + 2.5 + 1.1, z);
        torch.position.set(x, TUNNEL_FLOOR_Y + 2.5, z);
        group.add(torch);
        const torchEmitter = {
          screenIndex,
          underground: true,
          color: 0xff8030,
          distance: 11,
          intensity: 6,
          getPos: (v) => v.copy(glowPos),
        };
        this.world.lightPoolManager.addEmitter(torchEmitter);
        this.world.animatedTorches.push({
          screenIndex,
          emitter: torchEmitter,
          seed: Math.random() * 10,
        });
      }
    }
  }
}
