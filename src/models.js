// Atari 2600 Pitfall 3D Voxel Models
import * as THREE from 'three';
import { createVoxelGeometry, createVoxelMaterial } from './voxel.js';

const SHARED_MATERIAL = createVoxelMaterial();

// Atari 2600 Palette Colors
const C = {
  LEAF_DARK: '#224818',
  LEAF_MID: '#387828',
  LEAF_LIGHT: '#4c9e36',
  TRUNK_DARK: '#542d0a',
  TRUNK_MID: '#784414',
  TRUNK_LIGHT: '#9a5c20',
  LOG_CORE: '#b88a48',
  CROC_DARK: '#1c4818',
  CROC_MID: '#2c6c24',
  CROC_LIGHT: '#408832',
  CROC_TEETH: '#f4f4f4',
  CROC_MOUTH: '#991818',
  EYE_YELLOW: '#f8d820',
  EYE_BLACK: '#111111',
  VINE: '#3c6e28',
  VINE_KNOT: '#5c8e38',
  SCORPION_RED: '#d82800',
  SCORPION_DARK: '#8a1500',
  SNAKE_BROWN: '#745420',
  SNAKE_YELLOW: '#d8b030',
  FIRE_RED: '#e82800',
  FIRE_ORANGE: '#f87800',
  FIRE_YELLOW: '#f8e020',
  GOLD: '#f8d820',
  GOLD_SHINE: '#fff480',
  SILVER: '#c4c8d0',
  SILVER_SHINE: '#ffffff',
  DIAMOND: '#38d8f8',
  DIAMOND_BAND: '#f8c820',
  BAG_BROWN: '#c89c38',
  BAG_BLACK: '#111111',
  HARRY_SHIRT: '#c4b07b',
  HARRY_SKIN: '#e0aa80',
};

/**
 * Generates an authentic Atari 2600 Pitfall Jungle Tree
 */
export function createTreeModel(voxelSize = 0.45) {
  const voxels = [];

  // 1. Trunk (height ~ 18 voxels, width ~ 3x3)
  for (let y = 0; y < 18; y++) {
    for (let x = -1; x <= 1; x++) {
      for (let z = -1; z <= 1; z++) {
        // slight bark variation
        const col = (x + y + z) % 3 === 0 ? C.TRUNK_LIGHT : ((x * z) % 2 === 0 ? C.TRUNK_MID : C.TRUNK_DARK);
        voxels.push({ x, y, z, color: col });
      }
    }
  }

  // 2. Hanging Moss/Roots at base
  voxels.push({ x: 2, y: 0, z: 0, color: C.TRUNK_DARK });
  voxels.push({ x: -2, y: 0, z: 0, color: C.TRUNK_DARK });
  voxels.push({ x: 0, y: 0, z: 2, color: C.TRUNK_DARK });
  voxels.push({ x: 0, y: 0, z: -2, color: C.TRUNK_DARK });

  // 3. Foliage Canopy: Iconic stepped pixel Atari canopy (height 14 to 28)
  const canopyLayers = [
    { y: 15, r: 4 },
    { y: 16, r: 5 },
    { y: 17, r: 6 },
    { y: 18, r: 7 },
    { y: 19, r: 7 },
    { y: 20, r: 6 },
    { y: 21, r: 5 },
    { y: 22, r: 4 },
    { y: 23, r: 3 },
    { y: 24, r: 2 },
  ];

  canopyLayers.forEach(layer => {
    const y = layer.y;
    const r = layer.r;
    for (let x = -r; x <= r; x++) {
      for (let z = -r; z <= r; z++) {
        const dist = Math.sqrt(x * x + z * z);
        if (dist <= r + 0.3) {
          // Atari 2600 foliage shading
          const col = dist < r * 0.5 ? C.LEAF_DARK : ((x + z + y) % 2 === 0 ? C.LEAF_MID : C.LEAF_LIGHT);
          voxels.push({ x, y, z, color: col });
        }
      }
    }
  });

  const geo = createVoxelGeometry(voxels, voxelSize, false);
  const mesh = new THREE.Mesh(geo, SHARED_MATERIAL);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

/**
 * Creates Rolling or Stationary Log Model
 */
export function createLogModel(voxelSize = 0.18, lengthVoxels = 16) {
  const voxels = [];
  const length = lengthVoxels;
  const radius = 2;

  for (let x = -length / 2; x <= length / 2; x++) {
    for (let y = -radius; y <= radius; y++) {
      for (let z = -radius; z <= radius; z++) {
        const dist = Math.sqrt(y * y + z * z);
        if (dist <= radius) {
          let col = C.TRUNK_MID;
          if (x === -length / 2 || x === length / 2) {
            col = dist < 1 ? C.LOG_CORE : C.TRUNK_LIGHT;
          } else if (dist > radius - 0.7) {
            col = (x + y) % 2 === 0 ? C.TRUNK_DARK : C.TRUNK_MID;
          }
          voxels.push({ x, y: y + radius, z, color: col });
        }
      }
    }
  }

  const geo = createVoxelGeometry(voxels, voxelSize, true);
  const mesh = new THREE.Mesh(geo, SHARED_MATERIAL);
  return mesh;
}

/**
 * Creates an authentic Atari Pitfall Crocodile with high-visibility open/close mouth
 * and an unmistakably marked safe stepping platform on the skull/back.
 */
export function createCrocodileModel(voxelSize = 0.32) {
  const group = new THREE.Group();

  // 1. Lower Body, Skull & Lower Jaw
  const baseVoxels = [];

  // A. Skull & Body (Safe Stepping Platform behind and between the eyes: Z = -5 to 2)
  for (let z = -5; z <= 2; z++) {
    for (let x = -4; x <= 4; x++) {
      // Submerged body layers
      baseVoxels.push({ x, y: 0, z, color: C.CROC_DARK });
      baseVoxels.push({ x, y: 1, z, color: (x + z) % 2 === 0 ? C.CROC_MID : C.CROC_DARK });

      // Safe Stepping Platform surface (Y = 2)
      const isRim = Math.abs(x) === 4 || z === -5;
      let topColor = C.CROC_MID;

      if (isRim) {
        topColor = C.CROC_DARK;
      } else {
        // High-visibility stepping pad: prominent golden chevron & emerald scales
        const isCenterChevron = Math.abs(x) <= 1 && (z === -2 || z === -4 || z === 0);
        if (isCenterChevron) {
          topColor = C.GOLD; // Golden chevron mark indicating 100% safe eye zone!
        } else {
          topColor = (x + z) % 2 === 0 ? '#4cd038' : '#3aa02c'; // Bright moss green scales
        }
      }
      baseVoxels.push({ x, y: 2, z, color: topColor });
    }
  }

  // Water ripple ring around base of crocodile
  for (let z = -6; z <= 13; z++) {
    for (let x = -5; x <= 5; x++) {
      const isPerimeter = Math.abs(x) === 5 || z === -6 || z === 13;
      if (isPerimeter) {
        baseVoxels.push({ x, y: 0, z, color: (x + z) % 2 === 0 ? '#1098a8' : '#20b8c8' });
      }
    }
  }

  // B. Fixed Lower Jaw (Extends forward from Z = 3 to 12)
  for (let z = 3; z <= 12; z++) {
    const width = z > 8 ? 2 : 3;
    for (let x = -width; x <= width; x++) {
      // Outer under-chin
      baseVoxels.push({ x, y: 0, z, color: C.CROC_DARK });

      // Gaping Blood-Red Floor of Mouth
      const isRim = Math.abs(x) === width || z === 12;
      baseVoxels.push({ x, y: 1, z, color: isRim ? '#881010' : '#d81818' });

      // Lower Sharp White Teeth standing on the rim
      if (isRim && (x + z) % 2 === 0) {
        baseVoxels.push({ x, y: 2, z, color: '#ffffff' });
      }
    }
  }

  const baseGeo = createVoxelGeometry(baseVoxels, voxelSize, false);
  const baseMesh = new THREE.Mesh(baseGeo, SHARED_MATERIAL);
  group.add(baseMesh);

  // 2. Large Prominent Reptilian Eyes (At top of skull: Z = 0, X = ±3.2)
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0xf8d820 }); // Calm yellow by default
  const eyeGeo = new THREE.BoxGeometry(voxelSize * 2.2, voxelSize * 2.0, voxelSize * 2.2);

  const leftEye = new THREE.Mesh(eyeGeo, eyeMat);
  leftEye.position.set(-3.2 * voxelSize, 3.2 * voxelSize, 0 * voxelSize);
  group.add(leftEye);

  const rightEye = new THREE.Mesh(eyeGeo, eyeMat);
  rightEye.position.set(3.2 * voxelSize, 3.2 * voxelSize, 0 * voxelSize);
  group.add(rightEye);

  // Big Pupil slits (black dots on front face of eyes)
  const pupilMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
  const pupilGeo = new THREE.BoxGeometry(voxelSize * 0.9, voxelSize * 1.6, voxelSize * 0.5);

  const leftPupil = new THREE.Mesh(pupilGeo, pupilMat);
  leftPupil.position.set(-3.2 * voxelSize, 3.2 * voxelSize, 1.0 * voxelSize);
  group.add(leftPupil);

  const rightPupil = new THREE.Mesh(pupilGeo, pupilMat);
  rightPupil.position.set(3.2 * voxelSize, 3.2 * voxelSize, 1.0 * voxelSize);
  group.add(rightPupil);

  // 3. Upper Jaw (Hinged at Z = 3, Y = 1.0)
  const upperJawGroup = new THREE.Group();
  upperJawGroup.position.set(0, 1.0 * voxelSize, 3 * voxelSize);

  const upperVoxels = [];
  for (let z = 0; z <= 9; z++) {
    const width = z > 5 ? 2 : 3;
    for (let x = -width; x <= width; x++) {
      // Inside roof of mouth: bright glowing red
      upperVoxels.push({ x, y: 0, z, color: '#e81818' });

      // Upper Sharp White Teeth pointing down on rim
      const isRim = Math.abs(x) === width || z === 9;
      if (isRim && (x + z) % 2 !== 0) {
        upperVoxels.push({ x, y: -1, z, color: '#ffffff' });
      }

      // Exterior top snout: Solid calm green scales
      const isNostril = (z === 9) && (Math.abs(x) === 1);
      const topCol = isNostril ? '#111111' : ((x + z) % 2 === 0 ? C.CROC_LIGHT : C.CROC_MID);
      upperVoxels.push({ x, y: 1, z, color: topCol });
      if (z <= 4 && Math.abs(x) <= 1) {
        // Raised snout ridge
        upperVoxels.push({ x, y: 2, z, color: C.CROC_LIGHT });
      }
    }
  }

  const upperGeo = createVoxelGeometry(upperVoxels, voxelSize, false);
  const upperMesh = new THREE.Mesh(upperGeo, SHARED_MATERIAL);
  upperJawGroup.add(upperMesh);
  group.add(upperJawGroup);

  return {
    mesh: group,
    upperJaw: upperJawGroup,
    eyeMaterial: eyeMat,
    voxelSize: voxelSize,
    isOpen: false,
    mouthTimer: 0,
    currentAngle: 0,
  };
}

/**
 * Creates Hanging Swinging Vine (Cipó)
 */
export function createVineModel(length = 26, voxelSize = 0.25) {
  const group = new THREE.Group();
  const voxels = [];

  for (let i = 0; i < length; i++) {
    const isKnot = i % 4 === 0;
    const col = isKnot ? C.VINE_KNOT : C.VINE;
    voxels.push({ x: 0, y: -i, z: 0, color: col });
    if (isKnot) {
      voxels.push({ x: 1, y: -i, z: 0, color: C.VINE_KNOT });
      voxels.push({ x: -1, y: -i, z: 0, color: C.VINE_KNOT });
    }
  }

  // Bottom handle knot / loop
  for (let x = -2; x <= 2; x++) {
    voxels.push({ x, y: -length, z: 0, color: C.VINE_KNOT });
    voxels.push({ x, y: -length - 1, z: 0, color: C.TRUNK_LIGHT });
  }

  const geo = createVoxelGeometry(voxels, voxelSize, false);
  const mesh = new THREE.Mesh(geo, SHARED_MATERIAL);
  group.add(mesh);

  // Tip helper for exact world positioning
  const tip = new THREE.Object3D();
  tip.position.set(0, -length * voxelSize, 0);
  group.add(tip);

  return {
    pivot: group,
    mesh: mesh,
    tip: tip,
    length: length * voxelSize,
    angle: 0,
    speed: 1.8,
    maxAngle: 0.85, // ~48 degrees swing
  };
}

/**
 * Creates an authentic, highly visible Atari Pitfall Giant Scorpion
 * Features a high-arching venomous stinger with glowing bulb, wide snapping claws,
 * 8 arched walking legs, glowing eyes, and toxic warning markings.
 */
export function createScorpionModel(voxelSize = 0.28) {
  const group = new THREE.Group();
  const voxels = [];

  // Vibrant high-contrast Atari Palette
  const RED = '#ff2800';        // Vibrant arcade crimson
  const DARK = '#780c00';       // Deep chitin shade
  const BLACK = '#121212';      // Obsidian armor plates
  const TOXIC_GOLD = '#ffcc00'; // Toxic warning bands
  const GLOW_YELLOW = '#ffea00';// Incandescent stinger poison

  // 1. Segmented Abdomen & Cephalothorax (Body: X = -2 to 2, Z = -4 to 3, Y = 1 to 2)
  for (let z = -4; z <= 3; z++) {
    for (let x = -2; x <= 2; x++) {
      // Lower body plate (Y = 1)
      voxels.push({ x, y: 1, z, color: (x + z) % 2 === 0 ? RED : DARK });

      // Raised armor segments (Y = 2)
      if (Math.abs(x) <= 1) {
        const isStripe = z % 2 === 0;
        const armorColor = isStripe ? BLACK : TOXIC_GOLD;
        voxels.push({ x, y: 2, z, color: armorColor });
      }
    }
  }

  // 2. Large Forward Snapping Chelae (Pincers)
  // Left Arm & Pincer
  voxels.push({ x: -2, y: 1, z: 4, color: DARK });
  voxels.push({ x: -3, y: 1, z: 4, color: RED });
  voxels.push({ x: -4, y: 1, z: 5, color: BLACK });
  voxels.push({ x: -4, y: 2, z: 5, color: RED });
  // Left Pincer Claws (open menacingly)
  voxels.push({ x: -5, y: 1, z: 6, color: RED });
  voxels.push({ x: -5, y: 2, z: 6, color: TOXIC_GOLD });
  voxels.push({ x: -3, y: 1, z: 6, color: RED });
  voxels.push({ x: -3, y: 2, z: 6, color: TOXIC_GOLD });

  // Right Arm & Pincer
  voxels.push({ x: 2, y: 1, z: 4, color: DARK });
  voxels.push({ x: 3, y: 1, z: 4, color: RED });
  voxels.push({ x: 4, y: 1, z: 5, color: BLACK });
  voxels.push({ x: 4, y: 2, z: 5, color: RED });
  // Right Pincer Claws
  voxels.push({ x: 5, y: 1, z: 6, color: RED });
  voxels.push({ x: 5, y: 2, z: 6, color: TOXIC_GOLD });
  voxels.push({ x: 3, y: 1, z: 6, color: RED });
  voxels.push({ x: 3, y: 2, z: 6, color: TOXIC_GOLD });

  // 3. Eight Articulated Arthropod Walking Legs (Arched up from body, down to ground)
  const legZs = [-3, -1, 1, 2];
  legZs.forEach((z, idx) => {
    const sweep = idx === 0 ? -1 : (idx === 3 ? 1 : 0);
    // Left Legs
    voxels.push({ x: -3, y: 2, z: z + sweep, color: RED });
    voxels.push({ x: -4, y: 1, z: z + sweep, color: BLACK });
    voxels.push({ x: -5, y: 0, z: z + sweep, color: TOXIC_GOLD });

    // Right Legs
    voxels.push({ x: 3, y: 2, z: z + sweep, color: RED });
    voxels.push({ x: 4, y: 1, z: z + sweep, color: BLACK });
    voxels.push({ x: 5, y: 0, z: z + sweep, color: TOXIC_GOLD });
  });

  // 4. Tall Arched Stinger Tail (Metasoma rising high over the back)
  voxels.push({ x: 0, y: 2, z: -5, color: BLACK });
  voxels.push({ x: -1, y: 2, z: -5, color: RED });
  voxels.push({ x: 1, y: 2, z: -5, color: RED });

  voxels.push({ x: 0, y: 3, z: -6, color: TOXIC_GOLD });
  voxels.push({ x: -1, y: 3, z: -6, color: BLACK });
  voxels.push({ x: 1, y: 3, z: -6, color: BLACK });

  voxels.push({ x: 0, y: 4, z: -6, color: RED });
  voxels.push({ x: -1, y: 4, z: -6, color: TOXIC_GOLD });
  voxels.push({ x: 1, y: 4, z: -6, color: TOXIC_GOLD });

  voxels.push({ x: 0, y: 5, z: -5, color: BLACK });
  voxels.push({ x: -1, y: 5, z: -5, color: RED });
  voxels.push({ x: 1, y: 5, z: -5, color: RED });

  voxels.push({ x: 0, y: 5, z: -4, color: TOXIC_GOLD });
  voxels.push({ x: -1, y: 5, z: -4, color: BLACK });
  voxels.push({ x: 1, y: 5, z: -4, color: BLACK });

  // Poison Bulb (Ampulla) & Stinger Needle
  voxels.push({ x: 0, y: 5, z: -3, color: GLOW_YELLOW });
  voxels.push({ x: -1, y: 5, z: -3, color: GLOW_YELLOW });
  voxels.push({ x: 1, y: 5, z: -3, color: GLOW_YELLOW });
  voxels.push({ x: 0, y: 6, z: -3, color: GLOW_YELLOW });

  voxels.push({ x: 0, y: 4, z: -2, color: BLACK });
  voxels.push({ x: 0, y: 4, z: -1, color: TOXIC_GOLD });

  // Geometry sits exactly at Y = 0 on ground with center='bottom'
  const scorpGeo = createVoxelGeometry(voxels, voxelSize, 'bottom');
  const scorpMesh = new THREE.Mesh(scorpGeo, SHARED_MATERIAL);
  group.add(scorpMesh);

  // 5. Glowing Cyan Eyes (Front of head at Y = 2.4)
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0x00ffff });
  const eyeGeo = new THREE.BoxGeometry(voxelSize * 0.8, voxelSize * 0.8, voxelSize * 0.8);
  const leftEye = new THREE.Mesh(eyeGeo, eyeMat);
  leftEye.position.set(-1 * voxelSize, 2.3 * voxelSize, 3.2 * voxelSize);
  group.add(leftEye);

  const rightEye = new THREE.Mesh(eyeGeo, eyeMat);
  rightEye.position.set(1 * voxelSize, 2.3 * voxelSize, 3.2 * voxelSize);
  group.add(rightEye);

  // 6. Incandescent Poison Stinger Bulb (Glowing yellow material at Y = 5.5)
  const stingerGlowMat = new THREE.MeshBasicMaterial({ color: 0xffea00 });
  const stingerGlowGeo = new THREE.BoxGeometry(voxelSize * 1.6, voxelSize * 1.4, voxelSize * 1.6);
  const stingerGlowMesh = new THREE.Mesh(stingerGlowGeo, stingerGlowMat);
  stingerGlowMesh.position.set(0, 5.5 * voxelSize, -3.0 * voxelSize);
  group.add(stingerGlowMesh);

  // 7. Venom Stinger Warning PointLight (illuminates path and warns player)
  const venomLight = new THREE.PointLight(0xffcc00, 1.4, 5.0);
  venomLight.position.set(0, 5.8 * voxelSize, -3.0 * voxelSize);
  group.add(venomLight);

  group.userData = {
    light: venomLight,
    mesh: scorpMesh,
    voxelSize: voxelSize,
  };

  return group;
}

/**
 * Creates Campfire with animated voxel embers
/**
 * Creates an authentic high-fidelity Atari Pitfall Campfire
 * with stone pit, glowing embers, multi-layer flame tongues, floating sparks, and dynamic light!
 */
export function createCampfireModel(voxelSize = 0.22) {
  const group = new THREE.Group();
  const baseVoxels = [];

  // 1. Natural Stone Ring (Irregular rough stones around fire)
  const stoneColors = ['#3e3e3e', '#555555', '#6c6c6c', '#4a4a4a', '#787878'];
  for (let x = -5; x <= 5; x++) {
    for (let z = -5; z <= 5; z++) {
      const dist = Math.sqrt(x * x + z * z);
      if (dist >= 3.2 && dist <= 4.8) {
        const col = stoneColors[(Math.abs(x * 3 + z * 7)) % stoneColors.length];
        baseVoxels.push({ x, y: 0, z, color: col });
        if ((x + z) % 2 === 0) {
          baseVoxels.push({ x, y: 1, z, color: col });
        }
      }
    }
  }

  // 2. Ash Bed & Blazing Hot Coals inside the ring
  for (let x = -3; x <= 3; x++) {
    for (let z = -3; z <= 3; z++) {
      const dist = Math.sqrt(x * x + z * z);
      if (dist <= 3.2) {
        // Ash layer
        baseVoxels.push({ x, y: 0, z, color: '#1c1816' });

        // Hot burning coals layer
        if ((x + z) % 3 === 0) {
          baseVoxels.push({ x, y: 1, z, color: '#ff2800' }); // Glowing red
        } else if ((x * z) % 2 === 0) {
          baseVoxels.push({ x, y: 1, z, color: '#ff7700' }); // Blazing orange
        } else {
          baseVoxels.push({ x, y: 1, z, color: '#441808' }); // Charred charcoal
        }
      }
    }
  }

  // 3. Criss-Crossed Timber Logs in a teepee pyramid structure
  const logDark = '#482408';
  const logMid = '#6c3810';
  const logChar = '#180c04';

  function addLog(x1, y1, z1, x2, y2, z2) {
    const steps = 7;
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const lx = Math.round(x1 + (x2 - x1) * t);
      const ly = Math.round(y1 + (y2 - y1) * t);
      const lz = Math.round(z1 + (z2 - z1) * t);
      const col = (s >= 2 && s <= 5) ? logChar : (s % 2 === 0 ? logMid : logDark);
      baseVoxels.push({ x: lx, y: ly, z: lz, color: col });
      // Thicken log
      baseVoxels.push({ x: lx, y: ly, z: lz + 1, color: col });
    }
  }

  addLog(-4, 1, -2, 2, 3, 2);
  addLog(4, 1, -2, -2, 3, 2);
  addLog(-2, 1, 4, 2, 3, -3);
  addLog(2, 1, 4, -2, 3, -3);

  const baseGeo = createVoxelGeometry(baseVoxels, voxelSize, 'bottom');
  const baseMesh = new THREE.Mesh(baseGeo, SHARED_MATERIAL);
  group.add(baseMesh);

  // 4. Multi-Layered Voxel Flames (Core + Outer Tongues)
  // A. Blazing White/Yellow Heat Core
  const coreVoxels = [
    { x: 0, y: 1, z: 0, color: '#ffffff' },
    { x: -1, y: 1, z: 0, color: '#fffb80' },
    { x: 1, y: 1, z: 0, color: '#fffb80' },
    { x: 0, y: 1, z: -1, color: '#fffb80' },
    { x: 0, y: 1, z: 1, color: '#fffb80' },
    { x: 0, y: 2, z: 0, color: '#ffffff' },
    { x: -1, y: 2, z: 0, color: '#ffe600' },
    { x: 1, y: 2, z: 0, color: '#ffe600' },
    { x: 0, y: 2, z: -1, color: '#ffe600' },
    { x: 0, y: 2, z: 1, color: '#ffe600' },
    { x: 0, y: 3, z: 0, color: '#fffb80' },
    { x: 0, y: 4, z: 0, color: '#ffe600' },
    { x: 0, y: 5, z: 0, color: '#ffaa00' },
  ];
  const coreGeo = createVoxelGeometry(coreVoxels, voxelSize * 1.1, 'bottom');
  const coreMat = new THREE.MeshBasicMaterial({ vertexColors: true });
  const coreMesh = new THREE.Mesh(coreGeo, coreMat);
  coreMesh.position.set(0, 0.22, 0);
  group.add(coreMesh);

  // B. Main Tall Flame Tongue
  const mainFlameVoxels = [
    { x: 0, y: 1, z: 0, color: '#ff9900' },
    { x: -1, y: 2, z: 0, color: '#ff6600' },
    { x: 1, y: 2, z: 0, color: '#ff6600' },
    { x: 0, y: 2, z: -1, color: '#ff4400' },
    { x: 0, y: 2, z: 1, color: '#ff4400' },
    { x: 0, y: 3, z: 0, color: '#ffaa00' },
    { x: -1, y: 3, z: 0, color: '#ff3300' },
    { x: 1, y: 3, z: 0, color: '#ff3300' },
    { x: 0, y: 4, z: 0, color: '#ff7700' },
    { x: 0, y: 5, z: 0, color: '#ff4400' },
    { x: 0, y: 6, z: 0, color: '#ee1100' },
    { x: 0, y: 7, z: 0, color: '#cc0000' },
    { x: 0, y: 8, z: 0, color: '#990000' },
  ];
  const mainFlameGeo = createVoxelGeometry(mainFlameVoxels, voxelSize, 'bottom');
  const mainFlameMat = new THREE.MeshBasicMaterial({ vertexColors: true });
  const mainFlame = new THREE.Mesh(mainFlameGeo, mainFlameMat);
  mainFlame.position.set(0, 0.22, 0);
  group.add(mainFlame);

  // C. Flanking Side Flame Tongue 1 (Left lick)
  const sideFlameVoxels1 = [
    { x: 0, y: 1, z: 0, color: '#ff7700' },
    { x: -1, y: 2, z: 0, color: '#ff5500' },
    { x: 0, y: 2, z: 1, color: '#ff3300' },
    { x: -1, y: 3, z: 0, color: '#ff2200' },
    { x: -1, y: 4, z: 0, color: '#e61100' },
    { x: 0, y: 5, z: 0, color: '#cc0000' },
  ];
  const sideFlameGeo1 = createVoxelGeometry(sideFlameVoxels1, voxelSize * 0.9, 'bottom');
  const sideFlame1 = new THREE.Mesh(sideFlameGeo1, mainFlameMat);
  sideFlame1.position.set(-0.35, 0.20, 0.2);
  group.add(sideFlame1);

  // D. Flanking Side Flame Tongue 2 (Right lick)
  const sideFlameVoxels2 = [
    { x: 0, y: 1, z: 0, color: '#ff8800' },
    { x: 1, y: 2, z: 0, color: '#ff5500' },
    { x: 0, y: 2, z: -1, color: '#ff3300' },
    { x: 1, y: 3, z: 0, color: '#ff2200' },
    { x: 1, y: 4, z: 0, color: '#e61100' },
    { x: 0, y: 5, z: 0, color: '#cc0000' },
  ];
  const sideFlameGeo2 = createVoxelGeometry(sideFlameVoxels2, voxelSize * 0.9, 'bottom');
  const sideFlame2 = new THREE.Mesh(sideFlameGeo2, mainFlameMat);
  sideFlame2.position.set(0.35, 0.20, -0.2);
  group.add(sideFlame2);

  // 5. Floating Ascending Voxel Sparks / Embers
  const emberCount = 8;
  const embers = [];
  const emberMatYellow = new THREE.MeshBasicMaterial({ color: 0xffe033 });
  const emberMatOrange = new THREE.MeshBasicMaterial({ color: 0xff6600 });
  const emberMatRed = new THREE.MeshBasicMaterial({ color: 0xff2200 });
  const emberGeo = new THREE.BoxGeometry(voxelSize * 0.45, voxelSize * 0.45, voxelSize * 0.45);

  for (let i = 0; i < emberCount; i++) {
    const mat = i % 3 === 0 ? emberMatYellow : (i % 3 === 1 ? emberMatOrange : emberMatRed);
    const emberMesh = new THREE.Mesh(emberGeo, mat);
    emberMesh.position.set(
      (Math.random() - 0.5) * 0.7,
      0.4 + Math.random() * 1.6,
      (Math.random() - 0.5) * 0.7
    );
    group.add(emberMesh);

    embers.push({
      mesh: emberMesh,
      speed: 1.0 + Math.random() * 1.4,
      seed: Math.random() * Math.PI * 2,
    });
  }

  // 6. Dynamic Warm Point Light
  const fireLight = new THREE.PointLight(0xff7722, 2.2, 12);
  fireLight.position.set(0, 1.1, 0);
  group.add(fireLight);

  return {
    group,
    coreFlame: coreMesh,
    outerFlames: [mainFlame, sideFlame1, sideFlame2],
    embers,
    light: fireLight,
  };
}

/**
 * Creates Voxel Treasures: Gold Bar, Silver Bar, Diamond Ring, Money Bag
 */
export function createTreasureModel(type = 'gold', voxelSize = 0.22) {
  const voxels = [];
  let points = 2000;

  if (type === 'gold' || type === 'silver') {
    const isGold = type === 'gold';
    points = isGold ? 4000 : 3000;
    const baseColor = isGold ? C.GOLD : C.SILVER;
    const shineColor = isGold ? C.GOLD_SHINE : C.SILVER_SHINE;

    for (let x = -3; x <= 3; x++) {
      for (let y = 0; y <= 2; y++) {
        for (let z = -2; z <= 2; z++) {
          const col = (x === 3 || y === 2) ? shineColor : baseColor;
          voxels.push({ x, y, z, color: col });
        }
      }
    }
  } else if (type === 'diamond') {
    points = 5000;
    // Golden ring base (2 camadas para o aro não parecer afundado no solo)
    for (let y = 0; y <= 1; y++) {
      for (let x = -2; x <= 2; x++) {
        for (let z = -2; z <= 2; z++) {
          if (Math.abs(x) === 2 || Math.abs(z) === 2) {
            voxels.push({ x, y, z, color: C.DIAMOND_BAND });
          }
        }
      }
    }
    // Sparkling Diamond gem atop
    for (let y = 2; y <= 4; y++) {
      const w = y === 3 ? 2 : 1;
      for (let x = -w; x <= w; x++) {
        for (let z = -w; z <= w; z++) {
          voxels.push({ x, y, z, color: C.DIAMOND });
        }
      }
    }
  } else {
    // Money Bag with "$" sign
    points = 2000;
    // Bag body
    for (let y = 0; y <= 5; y++) {
      const r = y <= 3 ? 3 : 2;
      for (let x = -r; x <= r; x++) {
        for (let z = -r; z <= r; z++) {
          let col = C.BAG_BROWN;
          // Dollar sign on front (+Z)
          if (z === r && y >= 1 && y <= 3) {
            if (x === 0 || (y === 3 && x === -1) || (y === 1 && x === 1)) {
              col = C.BAG_BLACK;
            }
          }
          voxels.push({ x, y, z, color: col });
        }
      }
    }
    // Bag tied neck
    for (let x = -1; x <= 1; x++) {
      for (let z = -1; z <= 1; z++) {
        voxels.push({ x, y: 6, z, color: C.TRUNK_LIGHT });
      }
    }
  }

  const geo = createVoxelGeometry(voxels, voxelSize, 'bottom');
  const mat = new THREE.MeshBasicMaterial({ vertexColors: true });
  const mesh = new THREE.Mesh(geo, mat);

  return { mesh, points, type };
}

/**
 * Creates Pitfall Harry's First-Person Arms / Hands
 */
export function createPlayerArmsModel() {
  const group = new THREE.Group();

  function makeArm(isLeft = false) {
    const armGroup = new THREE.Group();
    const voxels = [];

    // Sleeve
    for (let y = 0; y <= 4; y++) {
      for (let x = -1; x <= 1; x++) {
        for (let z = -1; z <= 1; z++) {
          voxels.push({ x, y, z, color: C.HARRY_SHIRT });
        }
      }
    }

    // Hand & fingers
    for (let y = -3; y < 0; y++) {
      for (let x = -1; x <= 1; x++) {
        for (let z = -1; z <= 1; z++) {
          voxels.push({ x, y, z, color: C.HARRY_SKIN });
        }
      }
    }

    // Thumb
    const thumbX = isLeft ? 2 : -2;
    voxels.push({ x: thumbX, y: -2, z: 0, color: C.HARRY_SKIN });

    const geo = createVoxelGeometry(voxels, 0.08, true);
    const mesh = new THREE.Mesh(geo, SHARED_MATERIAL);
    armGroup.add(mesh);
    return armGroup;
  }

  const leftArm = makeArm(true);
  const rightArm = makeArm(false);

  leftArm.position.set(-0.35, -0.3, -0.6);
  rightArm.position.set(0.35, -0.3, -0.6);

  leftArm.rotation.x = Math.PI / 4;
  rightArm.rotation.x = Math.PI / 4;

  group.add(leftArm);
  group.add(rightArm);

  const gripBar = new THREE.Mesh(
    new THREE.BoxGeometry(0.56, 0.09, 0.09),
    new THREE.MeshLambertMaterial({ color: 0x9a5c20 })
  );
  gripBar.position.set(0, 0.15, -0.45);
  gripBar.visible = false;
  
  // Fake vine extending upwards from the grip bar (visible during the swing)
  const fakeVine = new THREE.Mesh(
    new THREE.BoxGeometry(0.08, 4.0, 0.08),
    new THREE.MeshLambertMaterial({ color: C.VINE })
  );
  // Center it above the bar and angle it slightly forward
  fakeVine.position.set(0, 2.0, -0.5); 
  fakeVine.rotation.x = -Math.PI / 8;
  gripBar.add(fakeVine);
  
  group.add(gripBar);

  return {
    group,
    leftArm,
    rightArm,
    gripBar,
  };
}

/**
 * Creates the iconic Atari Pitfall Disappearing Quicksand Hole (Areia Movediça que Abre e Fecha)
 * LONG EDITION (20m, como o lago do cipó): o tampão é dividido em NUM_SEGMENTS
 * seções ao longo de Z que se partem ao meio (metades deslizam do centro para
 * as laterais em X) e afundam em Y, abrindo em onda da entrada (+Z, lado do
 * herói) até a saída (-Z) e fechando na ordem INVERSA (saída->entrada) —
 * o espelho da abertura.
 */
export function createOpeningQuicksandModel(voxelSize = 0.45, numSegments = 12) {
  const group = new THREE.Group();
  const baseOffset = -voxelSize / 2;

  // 1. Fixed Pit: paredes do poço (escondidas abaixo da superfície para não ter bordas).
  // Sem fundo de lama: o fundo é o poço negro sem fim adicionado em world.js
  const pitVoxels = [];
  const Z_MIN = -22;
  const Z_MAX = 22;

  // Paredes verticais do poço (escondidas abaixo do tampão, Y=-4 até Y=-1)
  for (let y = -4; y <= -1; y++) {
    for (let x = -6; x <= 5; x++) {
      pitVoxels.push({ x, y, z: Z_MIN - 1, color: '#382010' });
      pitVoxels.push({ x, y, z: Z_MAX + 1, color: '#382010' });
    }
    for (let z = Z_MIN; z <= Z_MAX; z++) {
      pitVoxels.push({ x: -6, y, z, color: '#301c0c' });
      pitVoxels.push({ x: 6, y, z, color: '#301c0c' });
    }
  }

  const pitGeo = createVoxelGeometry(pitVoxels, voxelSize, false);
  const pitMesh = new THREE.Mesh(pitGeo, SHARED_MATERIAL);
  pitMesh.position.set(baseOffset, 0, baseOffset);
  group.add(pitMesh);

  // 2. Tampão segmentado alargado para cobrir o buraco todo (-5 a 5 = 11 voxels)
  const totalRows = Z_MAX - Z_MIN + 1;
  const segments = [];

  for (let s = 0; s < numSegments; s++) {
    const zHi = Z_MAX - Math.floor((s * totalRows) / numSegments);
    const zLo = Z_MAX - Math.floor(((s + 1) * totalRows) / numSegments) + 1;
    const leftVoxels = [];
    const rightVoxels = [];

    // Dirt trail surface matching the retro Atari scanline gaps of the main path
    for (let z = zLo; z <= zHi; z++) {
      // Calculate world distance from pit center
      const d = -z * 0.45;
      const d_mod = ((d % 1.5) + 1.5) % 1.5;
      
      // The main path has 0.5m gaps every 1.5m (scanlines). Replicate the gap!
      if (d_mod >= 1.0) continue;

      // The main path has pathShade only at x=0 every 3.0m in Z.
      const d_3 = ((d % 3.0) + 3.0) % 3.0;
      const isShadeZ = d_3 < 1.0;

      for (let x = -5; x <= 5; x++) {
        // x=-1, 0, 1 in models.js roughly aligns with x=0 in world.js
        const isShadeX = (x >= -1 && x <= 1);
        let col = (isShadeZ && isShadeX) ? '#825f26' : '#9a7638';

        const top = { x, y: 0, z, color: col };
        const under = { x, y: -1, z, color: '#543614' }; // Dirt under-plug
        
        if (x < 0) {
          leftVoxels.push(top, under);
        } else {
          rightVoxels.push(top, under);
        }
      }
    }

    const leftMesh = new THREE.Mesh(createVoxelGeometry(leftVoxels, voxelSize, false), SHARED_MATERIAL);
    const rightMesh = new THREE.Mesh(createVoxelGeometry(rightVoxels, voxelSize, false), SHARED_MATERIAL);
    leftMesh.position.set(baseOffset, 0, baseOffset);
    rightMesh.position.set(baseOffset, 0, baseOffset);
    leftMesh.receiveShadow = true;
    rightMesh.receiveShadow = true;
    group.add(leftMesh);
    group.add(rightMesh);

    segments.push({
      leftMesh,
      rightMesh,
      baseOffset,
      minOffset: (zLo - 0.5) * voxelSize,
      maxOffset: (zHi + 0.5) * voxelSize,
      openAmount: 0,
      isOpen: false,
    });
  }

  // Grupo fantasma para compatibilidade com o antigo tampão único.
  const plug = new THREE.Group();
  group.add(plug);

  return {
    group,
    plug,
    segments,
    voxelSize,
    numSegments,
    radiusZ: (Z_MAX + 0.5) * voxelSize, // ~10.1m radius = 20m total length (como o lago do cipó)
    isOpen: false,
    timer: 0,
    currentY: 0,
  };
}
