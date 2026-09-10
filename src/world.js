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
    this.waterMaterial = new THREE.MeshBasicMaterial({ color: 0x0044aa });
    this.pitMaterial = new THREE.MeshBasicMaterial({ color: 0x181818 });
    this.quicksandMaterial = new THREE.MeshBasicMaterial({ color: 0x6e5225 });

    // Shared tree template for cloning
    this.treeTemplate = createTreeModel(0.5);
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
    this.buildGroundAndBorders(group, startZ, endZ, screenType);

    // 2. Build Specific Screen Hazards / Features
    this.buildScreenFeatures(group, index, startZ, endZ, midZ, screenType);

    return {
      index,
      group,
      startZ,
      endZ,
      type: screenType,
    };
  }

  // Deterministic Pitfall 2600 screen sequence
  getScreenType(index) {
    if (index === 0) return 'START_TRAIL'; // Introductory easy trail
    const pattern = [
      'STATIONARY_LOGS',
      'DISAPPEARING_QUICKSAND', // Classic opening & closing quicksand hole!
      'QUICKSAND_VINE',         // Tar/quicksand with swinging vine
      'ROLLING_LOGS',
      'CROCODILE_POND',
      'QUICKSAND_AND_LOG',      // Disappearing quicksand + rolling log
      'CAMPFIRE_TREASURE',
      'TAR_PIT_VINE',
      'SCORPION_RUN',
      'CROCODILE_VINE',
      'TRIPLE_LOGS',
      'BIG_TREASURE',
    ];
    return pattern[(index - 1) % pattern.length];
  }

  buildGroundAndBorders(group, startZ, endZ, screenType) {
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
    const hasCentralHazard = ['QUICKSAND_VINE', 'TAR_PIT_VINE', 'CROCODILE_POND', 'CROCODILE_VINE'].includes(screenType);
    const hazardStartZ = (startZ + endZ) / 2 + 10;
    const hazardEndZ = (startZ + endZ) / 2 - 10;

    const midZ = (startZ + endZ) / 2;
    const hasDisappearingPit = ['DISAPPEARING_QUICKSAND', 'QUICKSAND_AND_LOG'].includes(screenType);
    const pitCenterZ = screenType === 'QUICKSAND_AND_LOG' ? midZ + 6 : midZ;

    const groundVoxels = [];
    const grassColor = '#306c24';
    const grassBorderColor = '#489830';
    const pathColor = '#9a7638';
    const pathShade = '#825f26';

    for (let z = 0; z < length; z += 1.5) {
      const worldZ = startZ - z;
      const isOverHazard = hasCentralHazard && (worldZ <= hazardStartZ && worldZ >= hazardEndZ);
      const isOverDisappearingPit = hasDisappearingPit && Math.abs(worldZ - pitCenterZ) <= 4.6;

      if (!isOverHazard) {
        // Path corridor voxels (-3 to +3)
        for (let x = -4; x <= 4; x++) {
          const isEdge = Math.abs(x) >= 3;
          // Leave opening on path for disappearing pit model
          if (isOverDisappearingPit && !isEdge) continue;

          let col = isEdge ? ((x + z) % 2 === 0 ? grassBorderColor : grassColor) : (((x + z) % 3 === 0) ? pathShade : pathColor);
          groundVoxels.push({ x, y: 0, z: -z, color: col });
        }
      }
    }

    if (groundVoxels.length > 0) {
      const groundGeo = createVoxelGeometry(groundVoxels, 1.0, false);
      const groundMesh = new THREE.Mesh(groundGeo, this.groundMaterial);
      groundMesh.position.set(0, -1.0, startZ);
      group.add(groundMesh);
    }

    // Lateral green grass borders beneath trees
    const borderGeo = new THREE.BoxGeometry(16, 1, length);
    const borderMat = new THREE.MeshLambertMaterial({ color: 0x224e18, flatShading: true });

    const leftBorder = new THREE.Mesh(borderGeo, borderMat);
    leftBorder.position.set(-12, -0.5, (startZ + endZ) / 2);
    group.add(leftBorder);

    const rightBorder = new THREE.Mesh(borderGeo, borderMat);
    rightBorder.position.set(12, -0.5, (startZ + endZ) / 2);
    group.add(rightBorder);
  }

  buildScreenFeatures(group, index, startZ, endZ, midZ, type) {
    switch (type) {
      case 'START_TRAIL':
        // Safe starting area with one stationary log to learn jumping
        this.addStationaryLog(group, index, midZ - 5);
        this.addTreasure(group, index, midZ - 18, 'gold');
        break;

      case 'STATIONARY_LOGS':
        // Two stationary logs to jump over
        this.addStationaryLog(group, index, midZ + 8);
        this.addStationaryLog(group, index, midZ - 8);
        this.addTreasure(group, index, midZ, 'silver');
        break;

      case 'DISAPPEARING_QUICKSAND':
        // The iconic opening & closing quicksand hole! Run across when closed!
        this.addOpeningQuicksandPit(group, index, midZ);
        this.addTreasure(group, index, midZ - 12, 'gold');
        break;

      case 'QUICKSAND_AND_LOG':
        // Opening & closing quicksand hole + rolling log!
        this.addOpeningQuicksandPit(group, index, midZ + 6);
        this.addRollingLog(group, index, midZ - 8, startZ, endZ);
        this.addTreasure(group, index, midZ - 16, 'silver');
        break;

      case 'ROLLING_LOGS':
        // Logs rolling toward player!
        this.addRollingLog(group, index, midZ + 12, startZ, endZ);
        this.addRollingLog(group, index, midZ - 6, startZ, endZ);
        this.addTreasure(group, index, midZ - 20, 'gold');
        break;

      case 'TRIPLE_LOGS':
        // Three rolling logs
        this.addRollingLog(group, index, midZ + 16, startZ, endZ);
        this.addRollingLog(group, index, midZ + 2, startZ, endZ);
        this.addRollingLog(group, index, midZ - 12, startZ, endZ);
        this.addTreasure(group, index, midZ - 22, 'money');
        break;

      case 'QUICKSAND_VINE':
        // Quicksand pit with swinging vine
        this.addQuicksandPit(group, index, midZ, 20);
        this.addVine(group, index, midZ);
        this.addTreasure(group, index, midZ - 14, 'gold');
        break;

      case 'TAR_PIT_VINE':
        // Tar pit with swinging vine
        this.addTarPit(group, index, midZ, 20);
        this.addVine(group, index, midZ);
        this.addTreasure(group, index, midZ - 14, 'diamond');
        break;

      case 'CROCODILE_POND':
        // Pond with 3 crocodiles!
        this.addWaterPond(group, index, midZ, 20);
        this.addCrocodileTrio(group, index, midZ);
        this.addTreasure(group, index, midZ - 14, 'diamond');
        break;

      case 'CROCODILE_VINE':
        // Crocodile pond + Vine overhead!
        this.addWaterPond(group, index, midZ, 20);
        this.addCrocodileTrio(group, index, midZ);
        this.addVine(group, index, midZ);
        this.addTreasure(group, index, midZ - 14, 'diamond');
        break;

      case 'CAMPFIRE_TREASURE':
        // Campfire in middle
        this.addCampfire(group, index, midZ);
        this.addTreasure(group, index, midZ - 10, 'money');
        break;

      case 'SCORPION_RUN':
        // Scorpion crawling back and forth
        this.addScorpion(group, index, midZ);
        this.addStationaryLog(group, index, midZ + 12);
        this.addTreasure(group, index, midZ - 12, 'silver');
        break;

      case 'BIG_TREASURE':
        // Diamond guarded by campfire and stationary log
        this.addCampfire(group, index, midZ + 6);
        this.addStationaryLog(group, index, midZ - 8);
        this.addTreasure(group, index, midZ, 'diamond');
        break;
    }
  }

  // --- Hazard Builders ---

  addStationaryLog(group, screenIndex, z) {
    const log = createLogModel(0.18);
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

  addRollingLog(group, screenIndex, z, startZ, endZ) {
    const log = createLogModel(0.18);
    log.position.set(0, 0.45, z);
    group.add(log);

    const logData = {
      type: 'rolling_log',
      screenIndex,
      mesh: log,
      z: z,
      startZ,
      endZ,
      speed: 6.5, // units/sec towards player (+Z direction)
      radius: 1.2,
    };

    this.activeRollingLogs.push(logData);
    this.activeHazards.push(logData);
  }

  addQuicksandPit(group, screenIndex, centerZ, length = 20) {
    const pitGeo = new THREE.BoxGeometry(PATH_WIDTH, 0.2, length);
    const pitMesh = new THREE.Mesh(pitGeo, this.quicksandMaterial);
    pitMesh.position.set(0, -0.6, centerZ);
    group.add(pitMesh);

    this.activeHazards.push({
      type: 'quicksand',
      screenIndex,
      minZ: centerZ - length / 2 + 1,
      maxZ: centerZ + length / 2 - 1,
      centerZ,
    });
  }

  addTarPit(group, screenIndex, centerZ, length = 20) {
    const pitGeo = new THREE.BoxGeometry(PATH_WIDTH, 0.2, length);
    const pitMesh = new THREE.Mesh(pitGeo, this.pitMaterial);
    pitMesh.position.set(0, -0.6, centerZ);
    group.add(pitMesh);

    this.activeHazards.push({
      type: 'tarpit',
      screenIndex,
      minZ: centerZ - length / 2 + 1,
      maxZ: centerZ + length / 2 - 1,
      centerZ,
    });
  }

  addOpeningQuicksandPit(group, screenIndex, z) {
    const pit = createOpeningQuicksandModel(0.45);
    pit.group.position.set(0, -0.45, z);
    group.add(pit.group);

    const pitData = {
      type: 'disappearing_quicksand',
      screenIndex,
      pit: pit,
      z: z,
      radius: 4.5, // 9.0 meters total length - cannot be cleared with a single jump!
      timer: Math.random() * 2.0,
      isOpen: false,
      wasOpen: false,
      rumblePlayed: false,
    };

    this.activeOpeningPits.push(pitData);
    this.activeHazards.push(pitData);
  }

  addWaterPond(group, screenIndex, centerZ, length = 20) {
    const waterGeo = new THREE.BoxGeometry(PATH_WIDTH, 0.3, length);
    const waterMesh = new THREE.Mesh(waterGeo, this.waterMaterial);
    waterMesh.position.set(0, -0.6, centerZ);
    group.add(waterMesh);

    this.activeHazards.push({
      type: 'water',
      screenIndex,
      minZ: centerZ - length / 2 + 1,
      maxZ: centerZ + length / 2 - 1,
      centerZ,
    });
  }

  addCrocodileTrio(group, screenIndex, centerZ) {
    // 3 Crocodiles positioned along the pond (X=0, spaced in Z)
    const offsetsZ = [5, 0, -5];
    offsetsZ.forEach((offset, idx) => {
      const croc = createCrocodileModel(0.32);
      const zPos = centerZ + offset;
      croc.mesh.position.set(0, -0.3, zPos);
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

  addVine(group, screenIndex, centerZ) {
    const vine = createVineModel(32, 0.28);
    // Position pivot high up in canopy overhead
    vine.pivot.position.set(0, 10.5, centerZ);
    group.add(vine.pivot);

    this.activeVines.push({
      screenIndex,
      vine,
      centerZ,
      time: Math.random() * Math.PI,
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

  addScorpion(group, screenIndex, z) {
    const scorpion = createScorpionModel(0.28);
    scorpion.position.set(0, 0.08, z);
    group.add(scorpion);

    this.activeHazards.push({
      type: 'scorpion',
      screenIndex,
      mesh: scorpion,
      baseZ: z,
      time: 0,
      radius: 1.2,
    });
  }

  addTreasure(group, screenIndex, z, type = 'gold') {
    const treasure = createTreasureModel(type, 0.22);
    treasure.mesh.position.set(0, 0.05, z);
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

    // 3. Update Rolling Logs
    this.activeRollingLogs.forEach(l => {
      // Moves towards player (+Z direction)
      l.z += l.speed * delta;
      l.mesh.position.z = l.z;
      l.mesh.rotation.x += delta * 12; // rolling animation

      // Reset to end of screen if it rolls too far past start
      if (l.z > l.startZ + 5) {
        l.z = l.endZ;
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
      s.time += delta * 2.5;
      s.mesh.position.z = s.baseZ + Math.sin(s.time) * 3;
      s.z = s.mesh.position.z;
      s.mesh.rotation.y = Math.cos(s.time) >= 0 ? 0 : Math.PI;

      // Arachnid scuttle wobble and slight step bounce above the ground
      s.mesh.rotation.z = Math.sin(s.time * 12) * 0.04;
      s.mesh.position.y = 0.08 + Math.abs(Math.sin(s.time * 12)) * 0.03;

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

    // 7. Update Disappearing Quicksand Pits (Opening & Closing cycle)
    this.activeOpeningPits.forEach(p => {
      p.timer += delta;
      // Cycle: 5.4s total (2.8s closed, 0.4s opening, 1.8s fully open, 0.4s closing)
      const cycleTime = p.timer % 5.4;
      let targetY = 0;

      if (cycleTime < 2.8) {
        // STATE: CLOSED (SOLID GROUND - SAFE TO SPRINT ACROSS!)
        p.isOpen = false;
        targetY = 0;

        if (p.wasOpen) {
          audio.playGroundThud();
          p.wasOpen = false;
          p.rumblePlayed = false;
        }
      } else if (cycleTime < 3.2) {
        // STATE: PRE-OPEN RUMBLE & SINKING
        if (!p.rumblePlayed) {
          audio.playQuicksandRumble();
          p.rumblePlayed = true;
        }
        p.isOpen = true;
        const t = (cycleTime - 2.8) / 0.4;
        targetY = -t * 1.3;
      } else if (cycleTime < 5.0) {
        // STATE: FULLY OPEN (DEADLY SINKHOLE!)
        p.isOpen = true;
        p.wasOpen = true;
        targetY = -1.3;
      } else {
        // STATE: RISING / CLOSING
        p.isOpen = true;
        const t = (5.4 - cycleTime) / 0.4;
        targetY = -t * 1.3;
      }

      // Smooth plug movement
      p.pit.currentY = THREE.MathUtils.lerp(p.pit.currentY || 0, targetY, delta * 14);
      p.pit.plug.position.y = p.pit.currentY;
    });
  }
}
