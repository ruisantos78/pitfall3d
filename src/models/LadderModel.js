import * as THREE from 'three';
import { BaseModel } from './BaseModel.js';

export class LadderModel extends BaseModel {
  build(half, tunnelFloorY = -12) {
    const group = this.group;
    const railGeo = BaseModel.memoGeometry('ladderRail', () => new THREE.BoxGeometry(0.12, 9.5, 0.12));
    const rungGeo = BaseModel.memoGeometry('ladderRung', () => new THREE.BoxGeometry(1.0, 0.09, 0.09));
    const ladderMaterial = BaseModel.memoMaterial('ladderMat', () => new THREE.MeshLambertMaterial({ color: 0xc89850 }));

    for (const x of [-0.5, 0.5]) {
      const rail = new THREE.Mesh(railGeo, ladderMaterial);
      rail.position.set(x, -5.0, 0);
      group.add(rail);
    }
    for (let y = -0.5; y >= tunnelFloorY + 2.2; y -= 0.8) {
      const rung = new THREE.Mesh(rungGeo, ladderMaterial);
      rung.position.set(0, y, 0);
      group.add(rung);
    }
    return group;
  }
}

export function createLadderModel(half, tunnelFloorY = -12) {
  return new LadderModel().build(half, tunnelFloorY);
}
