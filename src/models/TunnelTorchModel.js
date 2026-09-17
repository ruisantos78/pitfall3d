import * as THREE from 'three';
import { BaseModel } from './BaseModel.js';

export class TunnelTorchModel extends BaseModel {
  build() {
    const group = this.group;
    const bracketGeo = BaseModel.memoGeometry('torchBracket', () => new THREE.BoxGeometry(0.16, 0.16, 0.5));
    const stickGeo = BaseModel.memoGeometry('torchStick', () => new THREE.BoxGeometry(0.12, 0.9, 0.12));
    const flameGeo = BaseModel.memoGeometry('torchFlame', () => new THREE.ConeGeometry(0.2, 0.55, 6));
    const emberGeo = BaseModel.memoGeometry('torchEmber', () => new THREE.ConeGeometry(0.1, 0.3, 6));

    const bracketMat = BaseModel.memoMaterial('torchBracketMat', () => new THREE.MeshLambertMaterial({ color: 0x2a2018 }));
    const stickMat = BaseModel.memoMaterial('torchStickMat', () => new THREE.MeshLambertMaterial({ color: 0x6a4a28 }));
    const flameMat = BaseModel.memoMaterial('torchFlameMat', () => new THREE.MeshBasicMaterial({ color: 0xff7018 }));
    const emberMat = BaseModel.memoMaterial('torchEmberMat', () => new THREE.MeshBasicMaterial({ color: 0xffd23f }));

    const bracket = new THREE.Mesh(bracketGeo, bracketMat);
    bracket.rotation.y = Math.PI / 2;
    group.add(bracket);

    const stick = new THREE.Mesh(stickGeo, stickMat);
    stick.position.y = 0.4;
    group.add(stick);

    const flame = new THREE.Mesh(flameGeo, flameMat);
    flame.position.y = 1.05;
    group.add(flame);

    const ember = new THREE.Mesh(emberGeo, emberMat);
    ember.position.y = 1.0;
    group.add(ember);

    return group;
  }
}

export function createTunnelTorchModel(isRightSide = false) {
  const torch = new TunnelTorchModel().build();
  // Apply rotation to stick based on wall side
  const stick = torch.children[1];
  if (stick) {
    stick.rotation.z = isRightSide ? -0.15 : 0.15;
  }
  return torch;
}
