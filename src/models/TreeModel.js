import * as THREE from 'three';
import { BaseModel, SHARED_MATERIAL, C, cachedVoxelGeo } from './BaseModel.js';
import { createVoxelGeometry } from '../voxel.js';

export class TreeModel extends BaseModel {
  build(voxelSize = 0.45) {
    const voxels = this.voxels;
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

    const geo = cachedVoxelGeo(`tree:${voxelSize}`, voxels, voxelSize, false, 0.14);
    const mesh = new THREE.Mesh(geo, SHARED_MATERIAL);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  }
}

export function createTreeModel(voxelSize = 0.45) {
  return new TreeModel().build(voxelSize);
}
