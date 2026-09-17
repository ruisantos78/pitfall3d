import * as THREE from 'three';

export class DebrisManager {
  constructor() {
    this.logDebris = [];
    this.debrisGeo = new THREE.BoxGeometry(1, 1, 1);
    this.debrisMats = [0x784414, 0x542d0a, 0x9a5c20].map(
      (c) => new THREE.MeshLambertMaterial({ color: c })
    );
  }

  registerShared(sharedGeometries, sharedMaterials) {
    sharedGeometries.add(this.debrisGeo);
    for (const m of this.debrisMats) sharedMaterials.add(m);
  }

  spawnLogShatter(group, screenIndex, z) {
    const count = 16;
    for (let i = 0; i < count; i++) {
      const mat = this.debrisMats[i % this.debrisMats.length];
      const mesh = new THREE.Mesh(this.debrisGeo, mat);
      const size = 0.22 + Math.random() * 0.28;
      mesh.position.set(
        (Math.random() - 0.5) * 6.4,
        0.2 + Math.random() * 0.5,
        z + (Math.random() - 0.5) * 1.2
      );
      mesh.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
      mesh.scale.setScalar(size);
      group.add(mesh);
      this.logDebris.push({
        screenIndex,
        mesh,
        size,
        vx: (Math.random() - 0.5) * 8,
        vy: 2.5 + Math.random() * 4.5,
        vz: (Math.random() - 0.5) * 6,
        rx: (Math.random() - 0.5) * 12,
        ry: (Math.random() - 0.5) * 12,
        life: 0.7 + Math.random() * 0.4,
      });
    }
  }

  update(delta) {
    for (let i = this.logDebris.length - 1; i >= 0; i--) {
      const d = this.logDebris[i];
      d.life -= delta;
      if (d.life <= 0) {
        d.mesh.removeFromParent();
        this.logDebris.splice(i, 1);
        continue;
      }
      d.vy -= 22 * delta;
      d.mesh.position.x += d.vx * delta;
      d.mesh.position.y += d.vy * delta;
      d.mesh.position.z += d.vz * delta;
      const floorY = d.size / 2;
      if (d.mesh.position.y < floorY) {
        d.mesh.position.y = floorY;
        d.vy *= -0.35;
        d.vx *= 0.6;
        d.vz *= 0.6;
        d.rx *= 0.6;
        d.ry *= 0.6;
      }
      d.mesh.rotation.x += d.rx * delta;
      d.mesh.rotation.y += d.ry * delta;
      d.mesh.scale.setScalar(d.size * Math.min(1, d.life / 0.3));
    }
  }

  removeForScreen(screenIndex) {
    this.logDebris = this.logDebris.filter(d => d.screenIndex !== screenIndex);
  }
}
