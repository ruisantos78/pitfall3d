import * as THREE from 'three';
import { BaseModel, SHARED_MATERIAL, C, cachedVoxelGeo } from './BaseModel.js';
import { createVoxelGeometry } from '../voxel.js';


const WALL_SPAN_W = 9;
const WALL_SPAN_H = 5;
const WALL_SPAN_D = 1;
const WALL_MORTAR_COLOR = '#a89c88';
const WALL_BRICK_COLORS = ['#6e2a1e', '#773120', '#7e3a25', '#65251b', '#74402a'];

function brickShade(row, col) {
  const h = ((row * 73856093) ^ (col * 19349663) ^ 83492791) >>> 0;
  return WALL_BRICK_COLORS[h % WALL_BRICK_COLORS.length];
}


function buildWallSection(voxels, x0, widthVox, heightVox, depthVox, z0, bw, bh) {
  const joint = 1;
  const pitch = bw + joint;
  const courseH = bh + joint;
  let course = 0;
  for (let cy = 0; cy + bh <= heightVox; cy += courseH, course++) {
    const off = (course % 2) * Math.floor(pitch / 2);
    let col = 0;
    for (let bx = x0 - off; bx < x0 + widthVox; bx += pitch, col++) {
      const from = Math.max(bx, x0);
      const to = Math.min(bx + bw, x0 + widthVox);
      if (to <= from) continue;
      const color = brickShade(course, col);
      for (let x = from; x < to; x++) {
        for (let y = cy; y < cy + bh; y++) {
          for (let z = z0; z < z0 + depthVox; z++) {
            voxels.push({ x, y, z, color });
          }
        }
      }
    }
  }
}

export class BrickWallModel extends BaseModel {
  build(voxelSize = 0.25, mortarSize = 0.25) {
    // Brick grid (unit cubes) and mortar backing grid (independent small cubes).
    const s = voxelSize;
    const ms = mortarSize;
    const W = Math.max(3, Math.round(WALL_SPAN_W / s));
    const H = Math.max(1, Math.round(WALL_SPAN_H / s));
    const D = Math.max(2, Math.round(WALL_SPAN_D / s));
    const MW = Math.max(1, Math.round(WALL_SPAN_W / ms));
    const MH = Math.max(1, Math.round(WALL_SPAN_H / ms));

    // Mortar: a single thin layer at the front, seen only through the joints.
    // (A full-depth slab turned the back of the wall into a flat white face.)
    const mortarVoxels = [];
    for (let y = 0; y < MH; y++) {
      for (let x = 0; x < MW; x++) {
        mortarVoxels.push({ x, y, z: 0, color: WALL_MORTAR_COLOR });
      }
    }

    // Bricks span the full 1m depth, so the back of the wall reads as brick,
    // not mortar. Joint gaps run through and meet the thin mortar up front.
    const brickVoxels = [];
    buildWallSection(brickVoxels, 0, W, H, D, 0, 4, 2);

    const group = this.group;
    const mortarGeo = cachedVoxelGeo(`wallMortar:${ms}`, mortarVoxels, ms, false);
    const mortarMesh = new THREE.Mesh(mortarGeo, SHARED_MATERIAL);
    // Seat the thin layer just behind the brick faces (half-cube recess).
    mortarMesh.position.z = D * s - ms * 1.5;
    group.add(mortarMesh);

    const brickGeo = cachedVoxelGeo(`wallBrick:${s}`, brickVoxels, s, false, 0.1);
    const brickMesh = new THREE.Mesh(brickGeo, SHARED_MATERIAL);
    // Bricks stand slightly proud of the backing so the thinner mortar reads as
    // recessed joints. Kept small so the 1m collision band in player.js still fits.
    brickMesh.position.z = ms * 0.5;
    group.add(brickMesh);

    return group;
  }
}

export function createBrickWallModel(voxelSize = 0.25, mortarSize = 0.25) {
  return new BrickWallModel().build(voxelSize, mortarSize);
}
