import * as THREE from 'three';
import { BaseModel, SHARED_MATERIAL, C } from './BaseModel.js';
import { createVoxelGeometry } from '../voxel.js';

export class PlayerArmsModel extends BaseModel {
  build() {
    const group = this.group;

    // Arrow function captures 'this' from build(), but we use a local array
    const makeArm = (isLeft = false) => {
      const armGroup = new THREE.Group();
      const localVoxels = []; // Local voxels so left and right don't mix

      // Sleeve
      for (let y = 0; y <= 4; y++) {
        for (let x = -1; x <= 1; x++) {
          for (let z = -1; z <= 1; z++) {
            localVoxels.push({ x, y, z, color: C.HARRY_SHIRT });
          }
        }
      }

      // Hand & fingers
      for (let y = -3; y < 0; y++) {
        for (let x = -1; x <= 1; x++) {
          for (let z = -1; z <= 1; z++) {
            localVoxels.push({ x, y, z, color: C.HARRY_SKIN });
          }
        }
      }

      // Thumb
      const thumbX = isLeft ? 2 : -2;
      localVoxels.push({ x: thumbX, y: -2, z: 0, color: C.HARRY_SKIN });

      const geo = BaseModel.memoGeometry(isLeft ? 'armLeft' : 'armRight', () => createVoxelGeometry(localVoxels, 0.08, true));
      const mesh = new THREE.Mesh(geo, SHARED_MATERIAL);
      armGroup.add(mesh);
      return armGroup;
    };

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
}

export function createPlayerArmsModel() {
  return new PlayerArmsModel().build();
}
