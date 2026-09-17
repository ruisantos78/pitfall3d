// Voxel Geometry Builder for Retro Atari 3D Aesthetics
import * as THREE from 'three';

// 6 faces of a unit cube [dirX, dirY, dirZ], each with 2 triangles
const FACES = [
  // Right (+X)
  {
    dir: [1, 0, 0],
    corners: [
      [1, 1, 1], [1, 0, 1], [1, 0, 0],
      [1, 1, 1], [1, 0, 0], [1, 1, 0]
    ],
    normal: [1, 0, 0]
  },
  // Left (-X)
  {
    dir: [-1, 0, 0],
    corners: [
      [0, 1, 0], [0, 0, 0], [0, 0, 1],
      [0, 1, 0], [0, 0, 1], [0, 1, 1]
    ],
    normal: [-1, 0, 0]
  },
  // Top (+Y)
  {
    dir: [0, 1, 0],
    corners: [
      [0, 1, 0], [0, 1, 1], [1, 1, 1],
      [0, 1, 0], [1, 1, 1], [1, 1, 0]
    ],
    normal: [0, 1, 0]
  },
  // Bottom (-Y)
  {
    dir: [0, -1, 0],
    corners: [
      [0, 0, 1], [0, 0, 0], [1, 0, 0],
      [0, 0, 1], [1, 0, 0], [1, 0, 1]
    ],
    normal: [0, -1, 0]
  },
  // Front (+Z)
  {
    dir: [0, 0, 1],
    corners: [
      [0, 1, 1], [0, 0, 1], [1, 0, 1],
      [0, 1, 1], [1, 0, 1], [1, 1, 1]
    ],
    normal: [0, 0, 1]
  },
  // Back (-Z)
  {
    dir: [0, 0, -1],
    corners: [
      [1, 1, 0], [1, 0, 0], [0, 0, 0],
      [1, 1, 0], [0, 0, 0], [0, 1, 0]
    ],
    normal: [0, 0, -1]
  }
];

/**
 * Creates an optimized THREE.BufferGeometry with face culling from a voxel grid or voxel list.
 * voxels: array of {x, y, z, color} or map of "x,y,z" => hexColor
 * voxelSize: size of each cube in world units
 * center: if true, centers the geometry around (0,0,0)
 */
// Parsed-color cache: hex strings repeat thousands of times across builds,
// and THREE.Color parsing (plus one allocation per voxel) shows up in GC
// profiles. The cache stores plain {r,g,b} triples, allocation-free on hit.
const parsedColorCache = new Map();
const scratchColor = new THREE.Color();

function parseColorFast(color) {
  if (typeof color !== 'string') {
    scratchColor.set(color || 0xffffff);
    return scratchColor;
  }
  let hit = parsedColorCache.get(color);
  if (!hit) {
    scratchColor.set(color);
    hit = { r: scratchColor.r, g: scratchColor.g, b: scratchColor.b };
    if (parsedColorCache.size > 512) parsedColorCache.clear();
    parsedColorCache.set(color, hit);
  }
  return hit;
}

// Precomputed per-face shade multiplier (same soft depth shading as before,
// but hoisted out of the inner vertex loop).
for (const face of FACES) {
  let shade = 1.0;
  if (face.dir[1] === 1) shade = 1.08; // soft top highlight
  else if (face.dir[1] === -1) shade = 0.78; // soft bottom shadow
  else if (face.dir[0] !== 0) shade = 0.92; // soft side shadow
  else if (face.dir[2] < 0) shade = 0.88; // soft back shadow
  face.shade = shade;
}

export function createVoxelGeometry(voxels, voxelSize = 0.5, center = true) {
  // Build lookup set for fast face culling, keeping coordinates as numbers
  // (avoids re-splitting "x,y,z" strings in the emission pass).
  const voxelSet = new Set();
  const entries = [];
  let minX = Infinity, maxX = -Infinity;
  let minY = Infinity, maxY = -Infinity;
  let minZ = Infinity, maxZ = -Infinity;

  for (let i = 0; i < voxels.length; i++) {
    const v = voxels[i];
    const key = `${v.x},${v.y},${v.z}`;
    if (voxelSet.has(key)) continue;
    voxelSet.add(key);
    const c = parseColorFast(v.color);
    entries.push({ x: v.x, y: v.y, z: v.z, r: c.r, g: c.g, b: c.b });

    if (v.x < minX) minX = v.x;
    if (v.x > maxX) maxX = v.x;
    if (v.y < minY) minY = v.y;
    if (v.y > maxY) maxY = v.y;
    if (v.z < minZ) minZ = v.z;
    if (v.z > maxZ) maxZ = v.z;
  }

  const offsetX = center ? (minX + maxX + 1) / 2 : 0;
  const offsetY = center === 'bottom' ? minY : (center ? (minY + maxY + 1) / 2 : 0);
  const offsetZ = center ? (minZ + maxZ + 1) / 2 : 0;

  const positions = [];
  const normals = [];
  const colors = [];

  for (let i = 0; i < entries.length; i++) {
    const { x, y, z, r, g, b } = entries[i];

    // Check 6 adjacent neighbors. If neighbor exists, cull face!
    for (let f = 0; f < FACES.length; f++) {
      const face = FACES[f];
      const neighborKey = `${x + face.dir[0]},${y + face.dir[1]},${z + face.dir[2]}`;

      if (!voxelSet.has(neighborKey)) {
        // Face is visible, emit 6 vertices
        const shade = face.shade;
        const sr = Math.min(1, r * shade);
        const sg = Math.min(1, g * shade);
        const sb = Math.min(1, b * shade);
        for (let k = 0; k < face.corners.length; k++) {
          const c = face.corners[k];
          positions.push(
            (x + c[0] - offsetX) * voxelSize,
            (y + c[1] - offsetY) * voxelSize,
            (z + c[2] - offsetZ) * voxelSize
          );
          normals.push(face.normal[0], face.normal[1], face.normal[2]);
          colors.push(sr, sg, sb);
        }
      }
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

  return geometry;
}

/**
 * Creates a shared retro material for voxel meshes
 */
export function createVoxelMaterial(wireframe = false) {
  return new THREE.MeshLambertMaterial({
    vertexColors: true,
    wireframe: wireframe,
    flatShading: true,
  });
}
