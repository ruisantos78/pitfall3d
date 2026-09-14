import * as THREE from 'three';
import { BaseModel, SHARED_MATERIAL, C, cachedVoxelGeo } from './BaseModel.js';
import { createVoxelGeometry } from '../voxel.js';

export class SnakeModel extends BaseModel {
  build(voxelSize = 0.22) {
    const group = this.group;
    const voxels = this.voxels;
    const BLACK = '#181818';
    const GRAY = '#444444'; // Cinza escuro
    const TONGUE_RED = '#ff3333';

    // 1. Coiled Base
    for (let y = 0; y <= 3; y++) {
      const r = 5.5 - y * 0.8;
      for (let x = -6; x <= 6; x++) {
        for (let z = -6; z <= 6; z++) {
          const d = Math.sqrt(x * x + z * z);
          // Leave a gap at the back for the tail
          if (y === 0 && z < -4 && Math.abs(x) < 2) continue;
          if (d <= r) {
            let color = BLACK;
            // Distinct horizontal gray band on the coils
            if (y === 1 && d > r - 2) color = GRAY;
            if (y === 2 && d > r - 1.5 && z < 0) color = GRAY;
            voxels.push({ x, y, z, color });
          }
        }
      }
    }

    // 2. Neck & Belly (Vertical)
    for (let y = 4; y <= 8; y++) {
      for (let x = -1; x <= 1; x++) {
        for (let z = -1; z <= 2; z++) {
          let color = BLACK;
          if (z === 2 || z === 1) color = GRAY; // Front belly scales
          voxels.push({ x, y, z, color });
        }
      }
    }

    // 3. Cobra Hood (flaring out on the sides of the neck)
    for (let y = 6; y <= 10; y++) {
      const hoodWidth = y === 6 || y === 10 ? 2 : 3;
      for (let x = -hoodWidth; x <= hoodWidth; x++) {
        for (let z = -1; z <= 1; z++) {
          if (x >= -1 && x <= 1 && z >= -1 && z <= 2) continue; // skip neck
          if (Math.abs(x) === hoodWidth && z === 1) continue;
          let color = BLACK;
          // Inner part of the hood is facing forward (+Z). 
          // In this block, Z goes from -1 to 1. The front of the hood is z = 1 (or 0).
          if (z === 1) color = GRAY;
          voxels.push({ x, y, z, color });
        }
      }
    }

    // 4. Head
    for (let y = 9; y <= 11; y++) {
      for (let x = -2; x <= 2; x++) {
        for (let z = 0; z <= 4; z++) {
          if (Math.abs(x) === 2 && (z === 0 || z >= 3)) continue;
          if (y === 11 && z >= 3) continue;

          voxels.push({ x, y, z, color: BLACK });
        }
      }
    }

    // 5. Forked Tongue (Centered at base for rotation)
    const tongueVoxels = [
      { x: 0, y: 0, z: 0, color: TONGUE_RED },
      { x: -1, y: 0, z: 1, color: TONGUE_RED },
      { x: 1, y: 0, z: 1, color: TONGUE_RED },
    ];

    // 6. Tail (Centered at base for rotation)
    const tailVoxels = [];
    for (let z = 0; z >= -4; z--) {
      let color = BLACK;
      if (z === -4 || z === -3) color = GRAY; // Gray tip
      let w = (z >= -1) ? 1 : 0; // tapers
      for (let x = -w; x <= w; x++) {
        tailVoxels.push({ x, y: 0, z, color });
      }
    }

    const geo = BaseModel.memoGeometry('snakeBodyBlack', () => createVoxelGeometry(voxels, voxelSize, 'bottom'));
    const mesh = new THREE.Mesh(geo, SHARED_MATERIAL);
    group.add(mesh);

    const tongueGeo = BaseModel.memoGeometry('snakeTongueBlack', () => createVoxelGeometry(tongueVoxels, 0.5 * voxelSize, false));
    const tongue = new THREE.Mesh(tongueGeo, SHARED_MATERIAL);
    tongue.position.set(0, 9 * voxelSize, 5 * voxelSize); // Attach to snout
    group.add(tongue);

    const tailGeo = BaseModel.memoGeometry('snakeTailBlack', () => createVoxelGeometry(tailVoxels, voxelSize, false));
    const tail = new THREE.Mesh(tailGeo, SHARED_MATERIAL);
    tail.position.set(0, 0, -4.5 * voxelSize); // Attach to back of coils
    group.add(tail);

    // Small red balls for eyes - moved to top of head
    const eyeGeo = BaseModel.memoGeometry('snakeEyeSphereBlack', () => new THREE.SphereGeometry(voxelSize * 0.45, 6, 2));
    const eyeMat = new THREE.MeshLambertMaterial({ color: '#ff1111' });

    const leftEye = new THREE.Mesh(eyeGeo, eyeMat);
    // Head is y=9 to 11. Top is 11. Let's put eyes at y=11.5, x=-1, z=2
    leftEye.position.set(-1.0 * voxelSize, 11 * voxelSize, 3 * voxelSize);
    group.add(leftEye);

    const rightEye = new THREE.Mesh(eyeGeo, eyeMat);
    rightEye.position.set(1.0 * voxelSize, 11 * voxelSize, 3 * voxelSize);
    group.add(rightEye);

    return { group, tongue, tail };
  }
}

export function createSnakeModel(voxelSize = 0.22) {
  return new SnakeModel().build(voxelSize);
}
