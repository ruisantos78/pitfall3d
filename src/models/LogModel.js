import * as THREE from 'three';
import { BaseModel, SHARED_MATERIAL, C, cachedVoxelGeo } from './BaseModel.js';
import { createVoxelGeometry } from '../voxel.js';

export class LogModel extends BaseModel {
  build(voxelSize = 0.18, lengthVoxels = 16) {
    const voxels = this.voxels;
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

    const geo = cachedVoxelGeo(`log:${voxelSize}:${length}`, voxels, voxelSize, true, 0.12);
    const mesh = new THREE.Mesh(geo, SHARED_MATERIAL);
    return mesh;
  }
}

export function createLogModel(voxelSize = 0.18, lengthVoxels = 16) {
  return new LogModel().build(voxelSize, lengthVoxels);
}
