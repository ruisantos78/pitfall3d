import * as THREE from 'three';
import { BaseModel, SHARED_MATERIAL, C, cachedVoxelGeo } from './BaseModel.js';
import { createVoxelGeometry } from '../voxel.js';

export class CrocodileModel extends BaseModel {
  build(voxelSize = 0.32) {
    const group = this.group;
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

    // (no light water ring around — removed on request)

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

    const baseGeo = cachedVoxelGeo(`crocBase:${voxelSize}`, baseVoxels, voxelSize, false, 0.1);
    const baseMesh = new THREE.Mesh(baseGeo, SHARED_MATERIAL);
    group.add(baseMesh);

    // 2. Large Prominent Reptilian Eyes (At top of skull: Z = 0, X = ±3.2)
    // NOTE: eyeMat stays per-instance — its color is animated per crocodile.
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0xf8d820 }); // Calm yellow by default
    const eyeGeo = BaseModel.memoGeometry(`crocEye:${voxelSize}`,
      () => new THREE.BoxGeometry(voxelSize * 2.2, voxelSize * 2.0, voxelSize * 2.2));

    const leftEye = new THREE.Mesh(eyeGeo, eyeMat);
    leftEye.position.set(-3.2 * voxelSize, 3.2 * voxelSize, 0 * voxelSize);
    group.add(leftEye);

    const rightEye = new THREE.Mesh(eyeGeo, eyeMat);
    rightEye.position.set(3.2 * voxelSize, 3.2 * voxelSize, 0 * voxelSize);
    group.add(rightEye);

    // Big Pupil slits (black dots on front face of eyes)
    const pupilMat = BaseModel.sharedBasicMaterial(0x000000);
    const pupilGeo = BaseModel.memoGeometry(`crocPupil:${voxelSize}`,
      () => new THREE.BoxGeometry(voxelSize * 0.9, voxelSize * 1.6, voxelSize * 0.5));

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

    const upperGeo = cachedVoxelGeo(`crocUpper:${voxelSize}`, upperVoxels, voxelSize, false, 0.1);
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
}

export function createCrocodileModel(voxelSize = 0.32) {
  return new CrocodileModel().build(voxelSize);
}
