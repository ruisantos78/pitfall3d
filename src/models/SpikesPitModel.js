import * as THREE from 'three';
import { BaseModel } from './BaseModel.js';

export class SpikesPitModel extends BaseModel {
  build(width, length) {
    const group = this.group;
    const pitGeo = BaseModel.memoGeometry(`spikesPitGeo:${width}:${length}`, () => new THREE.BoxGeometry(width, 0.2, length));
    const pitMaterial = BaseModel.memoMaterial('spikesPitMat', () => new THREE.MeshLambertMaterial({ color: 0x050505 }));
    const spikeGeo = BaseModel.memoGeometry('spikeCone', () => new THREE.ConeGeometry(0.32, 2.0, 6));
    const spikeMaterial = BaseModel.memoMaterial('spikeMat', () => new THREE.MeshLambertMaterial({ color: 0x0a0a0a, flatShading: true }));

    const pitMesh = new THREE.Mesh(pitGeo, pitMaterial);
    pitMesh.position.set(0, -0.6, 0);
    group.add(pitMesh);

    for (let x = -4; x <= 4; x += 1) {
      const spike = new THREE.Mesh(spikeGeo, spikeMaterial);
      spike.position.set(x, -1.0, 0);
      group.add(spike);
    }

    return group;
  }
}

export function createSpikesPitModel(width = 9, length = 1.5) {
  return new SpikesPitModel().build(width, length);
}
