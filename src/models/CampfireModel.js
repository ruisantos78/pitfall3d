import * as THREE from 'three';
import { BaseModel, SHARED_MATERIAL, C, cachedVoxelGeo, VERTEX_BASIC } from './BaseModel.js';
import { createVoxelGeometry } from '../voxel.js';

export class CampfireModel extends BaseModel {
  build(voxelSize = 0.22) {
    const group = this.group;
    const baseVoxels = [];

    // 1. Natural Stone Ring (Irregular rough stones around fire)
    const stoneColors = ['#3e3e3e', '#555555', '#6c6c6c', '#4a4a4a', '#787878'];
    for (let x = -5; x <= 5; x++) {
      for (let z = -5; z <= 5; z++) {
        const dist = Math.sqrt(x * x + z * z);
        if (dist >= 3.2 && dist <= 4.8) {
          const col = stoneColors[(Math.abs(x * 3 + z * 7)) % stoneColors.length];
          baseVoxels.push({ x, y: 0, z, color: col });
          if ((x + z) % 2 === 0) {
            baseVoxels.push({ x, y: 1, z, color: col });
          }
        }
      }
    }

    // 2. Ash Bed & Blazing Hot Coals inside the ring
    for (let x = -3; x <= 3; x++) {
      for (let z = -3; z <= 3; z++) {
        const dist = Math.sqrt(x * x + z * z);
        if (dist <= 3.2) {
          // Ash layer
          baseVoxels.push({ x, y: 0, z, color: '#1c1816' });

          // Hot burning coals layer
          if ((x + z) % 3 === 0) {
            baseVoxels.push({ x, y: 1, z, color: '#ff2800' }); // Glowing red
          } else if ((x * z) % 2 === 0) {
            baseVoxels.push({ x, y: 1, z, color: '#ff7700' }); // Blazing orange
          } else {
            baseVoxels.push({ x, y: 1, z, color: '#441808' }); // Charred charcoal
          }
        }
      }
    }

    // 3. Criss-Crossed Timber Logs in a teepee pyramid structure
    const logDark = '#482408';
    const logMid = '#6c3810';
    const logChar = '#180c04';

    function addLog(x1, y1, z1, x2, y2, z2) {
      const steps = 7;
      for (let s = 0; s <= steps; s++) {
        const t = s / steps;
        const lx = Math.round(x1 + (x2 - x1) * t);
        const ly = Math.round(y1 + (y2 - y1) * t);
        const lz = Math.round(z1 + (z2 - z1) * t);
        const col = (s >= 2 && s <= 5) ? logChar : (s % 2 === 0 ? logMid : logDark);
        baseVoxels.push({ x: lx, y: ly, z: lz, color: col });
        // Thicken log
        baseVoxels.push({ x: lx, y: ly, z: lz + 1, color: col });
      }
    }

    addLog(-4, 1, -2, 2, 3, 2);
    addLog(4, 1, -2, -2, 3, 2);
    addLog(-2, 1, 4, 2, 3, -3);
    addLog(2, 1, 4, -2, 3, -3);

    const baseGeo = cachedVoxelGeo(`fireBase:${voxelSize}`, baseVoxels, voxelSize, 'bottom', 0.12);
    const baseMesh = new THREE.Mesh(baseGeo, SHARED_MATERIAL);
    group.add(baseMesh);

    // 4. Multi-Layered Voxel Flames (Core + Outer Tongues)
    // A. Blazing White/Yellow Heat Core
    const coreVoxels = [
      { x: 0, y: 1, z: 0, color: '#ffffff' },
      { x: -1, y: 1, z: 0, color: '#fffb80' },
      { x: 1, y: 1, z: 0, color: '#fffb80' },
      { x: 0, y: 1, z: -1, color: '#fffb80' },
      { x: 0, y: 1, z: 1, color: '#fffb80' },
      { x: 0, y: 2, z: 0, color: '#ffffff' },
      { x: -1, y: 2, z: 0, color: '#ffe600' },
      { x: 1, y: 2, z: 0, color: '#ffe600' },
      { x: 0, y: 2, z: -1, color: '#ffe600' },
      { x: 0, y: 2, z: 1, color: '#ffe600' },
      { x: 0, y: 3, z: 0, color: '#fffb80' },
      { x: 0, y: 4, z: 0, color: '#ffe600' },
      { x: 0, y: 5, z: 0, color: '#ffaa00' },
    ];
    const coreGeo = cachedVoxelGeo(`fireCore:${voxelSize}`, coreVoxels, voxelSize * 1.1, 'bottom', 0.16);
    const coreMat = VERTEX_BASIC;
    const coreMesh = new THREE.Mesh(coreGeo, coreMat);
    coreMesh.position.set(0, 0.22, 0);
    group.add(coreMesh);

    // B. Main Tall Flame Tongue
    const mainFlameVoxels = [
      { x: 0, y: 1, z: 0, color: '#ff9900' },
      { x: -1, y: 2, z: 0, color: '#ff6600' },
      { x: 1, y: 2, z: 0, color: '#ff6600' },
      { x: 0, y: 2, z: -1, color: '#ff4400' },
      { x: 0, y: 2, z: 1, color: '#ff4400' },
      { x: 0, y: 3, z: 0, color: '#ffaa00' },
      { x: -1, y: 3, z: 0, color: '#ff3300' },
      { x: 1, y: 3, z: 0, color: '#ff3300' },
      { x: 0, y: 4, z: 0, color: '#ff7700' },
      { x: 0, y: 5, z: 0, color: '#ff4400' },
      { x: 0, y: 6, z: 0, color: '#ee1100' },
      { x: 0, y: 7, z: 0, color: '#cc0000' },
      { x: 0, y: 8, z: 0, color: '#990000' },
    ];
    const mainFlameGeo = cachedVoxelGeo(`fireMain:${voxelSize}`, mainFlameVoxels, voxelSize, 'bottom', 0.16);
    const mainFlameMat = VERTEX_BASIC;
    const mainFlame = new THREE.Mesh(mainFlameGeo, mainFlameMat);
    mainFlame.position.set(0, 0.22, 0);
    group.add(mainFlame);

    // C. Flanking Side Flame Tongue 1 (Left lick)
    const sideFlameVoxels1 = [
      { x: 0, y: 1, z: 0, color: '#ff7700' },
      { x: -1, y: 2, z: 0, color: '#ff5500' },
      { x: 0, y: 2, z: 1, color: '#ff3300' },
      { x: -1, y: 3, z: 0, color: '#ff2200' },
      { x: -1, y: 4, z: 0, color: '#e61100' },
      { x: 0, y: 5, z: 0, color: '#cc0000' },
    ];
    const sideFlameGeo1 = cachedVoxelGeo(`fireSide1:${voxelSize}`, sideFlameVoxels1, voxelSize * 0.9, 'bottom', 0.16);
    const sideFlame1 = new THREE.Mesh(sideFlameGeo1, mainFlameMat);
    sideFlame1.position.set(-0.35, 0.20, 0.2);
    group.add(sideFlame1);

    // D. Flanking Side Flame Tongue 2 (Right lick)
    const sideFlameVoxels2 = [
      { x: 0, y: 1, z: 0, color: '#ff8800' },
      { x: 1, y: 2, z: 0, color: '#ff5500' },
      { x: 0, y: 2, z: -1, color: '#ff3300' },
      { x: 1, y: 3, z: 0, color: '#ff2200' },
      { x: 1, y: 4, z: 0, color: '#e61100' },
      { x: 0, y: 5, z: 0, color: '#cc0000' },
    ];
    const sideFlameGeo2 = cachedVoxelGeo(`fireSide2:${voxelSize}`, sideFlameVoxels2, voxelSize * 0.9, 'bottom', 0.16);
    const sideFlame2 = new THREE.Mesh(sideFlameGeo2, mainFlameMat);
    sideFlame2.position.set(0.35, 0.20, -0.2);
    group.add(sideFlame2);

    // 5. Floating Ascending Voxel Sparks / Embers
    const emberCount = 8;
    const embers = [];
    const emberGeo = BaseModel.memoGeometry(`fireEmber:${voxelSize}`,
      () => new THREE.BoxGeometry(voxelSize * 0.45, voxelSize * 0.45, voxelSize * 0.45));
    const emberMatYellow = BaseModel.sharedBasicMaterial(0xffe033);
    const emberMatOrange = BaseModel.sharedBasicMaterial(0xff6600);
    const emberMatRed = BaseModel.sharedBasicMaterial(0xff2200);
    for (let i = 0; i < emberCount; i++) {
      const mat = i % 3 === 0 ? emberMatYellow : (i % 3 === 1 ? emberMatOrange : emberMatRed);
      const emberMesh = new THREE.Mesh(emberGeo, mat);
      emberMesh.position.set(
        (Math.random() - 0.5) * 0.7,
        0.4 + Math.random() * 1.6,
        (Math.random() - 0.5) * 0.7
      );
      group.add(emberMesh);

      embers.push({
        mesh: emberMesh,
        speed: 1.0 + Math.random() * 1.4,
        seed: Math.random() * Math.PI * 2,
      });
    }

    // 6. Warm glow anchor (world assigns a pooled PointLight here; per-screen
    // lights would recompile every shader on each screen crossing).
    const fireAnchor = new THREE.Object3D();
    fireAnchor.position.set(0, 1.1, 0);
    group.add(fireAnchor);

    return {
      group,
      coreFlame: coreMesh,
      outerFlames: [mainFlame, sideFlame1, sideFlame2],
      embers,
      lightAnchor: fireAnchor,
    };
  }
}

export function createCampfireModel(voxelSize = 0.22) {
  return new CampfireModel().build(voxelSize);
}
