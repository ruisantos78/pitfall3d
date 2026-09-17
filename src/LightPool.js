import * as THREE from 'three';

export class LightPool {
  constructor(scene, poolSize = 8) {
    this.scene = scene;
    this.poolSize = poolSize;
    this.lightPool = [];
    this.lightEmitters = [];
    this._poolVec = new THREE.Vector3();
    // Reused scratch array for the eligible set (no per-frame allocation).
    this._eligible = [];
    // Throttle: reassign slots at most every 150ms or after a 2m move.
    this._reassignTimer = 0;
    this._lastAssignZ = Infinity;
    this._lastAssignUnder = null;

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

  update(playerZ, underground, delta = 0) {
    // Slot reassignment is throttled: emitters only change slots a few times
    // per second, while per-frame the slots just follow their emitter.
    this._reassignTimer -= delta;
    const moved = Math.abs(playerZ - this._lastAssignZ);
    if (this._reassignTimer > 0 && moved < 2 && underground === this._lastAssignUnder) {
      for (let i = 0; i < this.lightPool.length; i++) {
        const slot = this.lightPool[i];
        const e = slot.userData.emitter;
        if (!e) continue;
        e.getPos(slot.position);
        slot.intensity = e.intensity;
      }
      return;
    }
    this._reassignTimer = 0.15;
    this._lastAssignZ = playerZ;
    this._lastAssignUnder = underground;

    // Reuse the scratch array instead of allocating wrapper objects.
    const eligible = this._eligible;
    eligible.length = 0;
    for (let i = 0; i < this.lightEmitters.length; i++) {
      const e = this.lightEmitters[i];
      if (!!e.underground !== underground) continue;
      e.getPos(this._poolVec);
      e._dz = Math.abs(this._poolVec.z - playerZ);
      eligible.push(e);
    }
    eligible.sort((a, b) => a._dz - b._dz);

    for (let i = 0; i < this.lightPool.length; i++) {
      const slot = this.lightPool[i];
      const pick = eligible[i];
      if (!pick) {
        slot.intensity = 0;
        slot.userData.emitter = null;
        continue;
      }
      // Only push color/distance uniforms when the slot changes emitter.
      if (slot.userData.emitter !== pick) {
        slot.userData.emitter = pick;
        slot.color.setHex(pick.color);
        slot.distance = pick.distance;
      }
      pick.getPos(slot.position);
      slot.intensity = pick.intensity;
    }
  }
}
