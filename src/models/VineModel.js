import * as THREE from 'three';
import { BaseModel, SHARED_MATERIAL, C, cachedVoxelGeo } from './BaseModel.js';
import { createVoxelGeometry } from '../voxel.js';

export class VineModel extends BaseModel {
  build(length = 26, voxelSize = 0.25) {
    const group = this.group;
    const voxels = this.voxels;
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

    const geo = cachedVoxelGeo(`vine:${length}:${voxelSize}`, voxels, voxelSize, false, 0.12);
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
}

export function createVineModel(length = 26, voxelSize = 0.25) {
  return new VineModel().build(length, voxelSize);
}
