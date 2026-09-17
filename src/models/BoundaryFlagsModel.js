import * as THREE from 'three';
import { BaseModel } from './BaseModel.js';

export class BoundaryFlagsModel extends BaseModel {
  build(startZ) {
    const group = this.group;
    const poleGeo = BaseModel.memoGeometry('flagPole', () => new THREE.BoxGeometry(0.14, 2.6, 0.14));
    const flagGeo = BaseModel.memoGeometry('flagCloth', () => new THREE.BoxGeometry(0.95, 0.55, 0.08));
    const poleMat = BaseModel.memoMaterial('flagPoleMat', () => new THREE.MeshLambertMaterial({ color: 0xf0e0c0 }));
    const flagMat = BaseModel.memoMaterial('flagClothMat', () => new THREE.MeshLambertMaterial({ color: 0xff3020 }));

    for (const z of [startZ - 1]) {
      for (const x of [5.0, -5.0]) {
        const flag = new THREE.Group();
        const pole = new THREE.Mesh(poleGeo, poleMat);
        pole.position.y = 1.3;
        flag.add(pole);

        const cloth = new THREE.Mesh(flagGeo, flagMat);
        cloth.position.set(x > 0 ? -0.55 : 0.55, 2.25, 0);
        flag.add(cloth);

        flag.position.set(x, 0, z);
        group.add(flag);
      }
    }
    return group;
  }
}

export function createBoundaryFlagsModel(startZ) {
  return new BoundaryFlagsModel().build(startZ);
}
