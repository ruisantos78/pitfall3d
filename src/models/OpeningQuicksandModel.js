import * as THREE from 'three';
import { BaseModel, SHARED_MATERIAL, C, cachedVoxelGeo } from './BaseModel.js';
import { createVoxelGeometry } from '../voxel.js';

export class OpeningQuicksandModel extends BaseModel {
  build(voxelSize = 0.45, numSegments = 12) {
    const group = this.group;
    const baseOffset = -voxelSize / 2;

    // 1. Fixed Pit: pit walls (hidden below the surface to avoid edges).
    // No mud bottom: the opening reveals the dark space below the moving lid.
    const pitVoxels = [];
    const Z_MIN = -22;
    const Z_MAX = 22;

    // Vertical pit walls (hidden below the lid, Y=-4 to Y=-1)
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

    const pitGeo = cachedVoxelGeo(`quickPit:${voxelSize}`, pitVoxels, voxelSize, false);
    const pitMesh = new THREE.Mesh(pitGeo, SHARED_MATERIAL);
    pitMesh.position.set(baseOffset, 0, baseOffset);
    group.add(pitMesh);

    // 2. Widened segmented lid covering the whole hole (-5 to 5 = 11 voxels)
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

      const leftMesh = new THREE.Mesh(
        cachedVoxelGeo(`quickSeg:${voxelSize}:${numSegments}:L${s}`, leftVoxels, voxelSize, false),
        SHARED_MATERIAL
      );
      const rightMesh = new THREE.Mesh(
        cachedVoxelGeo(`quickSeg:${voxelSize}:${numSegments}:R${s}`, rightVoxels, voxelSize, false),
        SHARED_MATERIAL
      );
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

    // Ghost group for compatibility with the old single lid.
    const plug = new THREE.Group();
    group.add(plug);

    return {
      group,
      plug,
      segments,
      voxelSize,
      numSegments,
      radiusZ: (Z_MAX + 0.5) * voxelSize, // ~10.1m radius = 20m total length (like the vine lake)
      isOpen: false,
      timer: 0,
      currentY: 0,
    };
  }
}

export function createOpeningQuicksandModel(voxelSize = 0.45, numSegments = 12) {
  return new OpeningQuicksandModel().build(voxelSize, numSegments);
}
