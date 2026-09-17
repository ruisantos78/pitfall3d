import * as THREE from 'three';

export class LightPool {
  constructor(scene, poolSize = 8) {
    this.scene = scene;
    this.poolSize = poolSize;
    this.lightPool = [];
    this.lightEmitters = [];
    this._poolVec = new THREE.Vector3();

    for (let i = 0; i < this.poolSize; i++) {
      const pl = new THREE.PointLight(0xffffff, 0, 1);
      this.scene.add(pl);
      this.lightPool.push(pl);
    }
  }

  addEmitter(emitter) {
    this.lightEmitters.push(emitter);
  }

  removeEmittersForScreen(screenIndex) {
    this.lightEmitters = this.lightEmitters.filter(e => e.screenIndex !== screenIndex);
  }

  update(playerZ, underground) {
    const eligible = [];
    for (const e of this.lightEmitters) {
      if (!!e.underground !== underground) continue;
      e.getPos(this._poolVec);
      eligible.push({ e, dz: Math.abs(this._poolVec.z - playerZ) });
    }
    eligible.sort((a, b) => a.dz - b.dz);

    for (let i = 0; i < this.lightPool.length; i++) {
      const slot = this.lightPool[i];
      const pick = eligible[i];
      if (!pick) {
        slot.intensity = 0;
        continue;
      }
      pick.e.getPos(slot.position);
      slot.color.setHex(pick.e.color);
      slot.distance = pick.e.distance;
      slot.intensity = pick.e.intensity;
    }
  }
}
