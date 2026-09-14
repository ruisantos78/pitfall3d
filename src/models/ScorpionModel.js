import * as THREE from 'three';
import { BaseModel, SHARED_MATERIAL, C, cachedVoxelGeo } from './BaseModel.js';
import { createVoxelGeometry } from '../voxel.js';

export class ScorpionModel extends BaseModel {
  build(voxelSize = 0.28) {
    const group = this.group;
    const voxels = this.voxels;
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
    const scorpGeo = cachedVoxelGeo(`scorp:${voxelSize}`, voxels, voxelSize, 'bottom', 0.14);
    const scorpMesh = new THREE.Mesh(scorpGeo, SHARED_MATERIAL);
    group.add(scorpMesh);

    // 5. Glowing Cyan Eyes (Front of head at Y = 2.4)
    const eyeMat = BaseModel.sharedBasicMaterial(0x00ffff);
    const eyeGeo = BaseModel.memoGeometry(`scorpEye:${voxelSize}`,
      () => new THREE.BoxGeometry(voxelSize * 0.8, voxelSize * 0.8, voxelSize * 0.8));
    const leftEye = new THREE.Mesh(eyeGeo, eyeMat);
    leftEye.position.set(-1 * voxelSize, 2.3 * voxelSize, 3.2 * voxelSize);
    group.add(leftEye);

    const rightEye = new THREE.Mesh(eyeGeo, eyeMat);
    rightEye.position.set(1 * voxelSize, 2.3 * voxelSize, 3.2 * voxelSize);
    group.add(rightEye);

    // 6. Incandescent Poison Stinger Bulb (Glowing yellow material at Y = 5.5)
    const stingerGlowMat = BaseModel.sharedBasicMaterial(0xffea00);
    const stingerGlowGeo = BaseModel.memoGeometry(`scorpGlow:${voxelSize}`,
      () => new THREE.BoxGeometry(voxelSize * 1.6, voxelSize * 1.4, voxelSize * 1.6));
    const stingerGlowMesh = new THREE.Mesh(stingerGlowGeo, stingerGlowMat);
    stingerGlowMesh.position.set(0, 5.5 * voxelSize, -3.0 * voxelSize);
    group.add(stingerGlowMesh);

    // 7. Venom Stinger Warning glow anchor (world assigns a pooled PointLight here;
    // per-screen lights would recompile every shader on each screen crossing).
    const venomAnchor = new THREE.Object3D();
    venomAnchor.position.set(0, 5.8 * voxelSize, -3.0 * voxelSize);
    group.add(venomAnchor);

    group.userData = {
      lightAnchor: venomAnchor,
      mesh: scorpMesh,
      voxelSize: voxelSize,
    };

    return group;
  }
}

export function createScorpionModel(voxelSize = 0.28) {
  return new ScorpionModel().build(voxelSize);
}
