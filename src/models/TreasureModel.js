import * as THREE from 'three';
import { BaseModel, SHARED_MATERIAL, C, cachedVoxelGeo, VERTEX_BASIC } from './BaseModel.js';
import { createVoxelGeometry } from '../voxel.js';

export class TreasureModel extends BaseModel {
  build(type = 'gold', voxelSize = 0.22) {
    const voxels = this.voxels;
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
      // Golden ring base (2 layers so the band doesn't look sunken into the ground)
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

    const geo = cachedVoxelGeo(`treasure:${type}:${voxelSize}`, voxels, voxelSize, 'bottom', 0.12);
    const mat = VERTEX_BASIC;
    const mesh = new THREE.Mesh(geo, mat);

    return { mesh, points, type };
  }
}

export function createTreasureModel(type = 'gold', voxelSize = 0.22) {
  return new TreasureModel().build(type, voxelSize);
}
