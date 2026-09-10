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
export function createVoxelGeometry(voxels, voxelSize = 0.5, center = true) {
  // Build lookup map for fast face culling
  const voxelMap = new Map();
  let minX = Infinity, maxX = -Infinity;
  let minY = Infinity, maxY = -Infinity;
  let minZ = Infinity, maxZ = -Infinity;

  voxels.forEach(v => {
    const key = `${v.x},${v.y},${v.z}`;
    const color = typeof v.color === 'string' ? new THREE.Color(v.color) : new THREE.Color(v.color || 0xffffff);
    voxelMap.set(key, color);

    if (v.x < minX) minX = v.x;
    if (v.x > maxX) maxX = v.x;
    if (v.y < minY) minY = v.y;
    if (v.y > maxY) maxY = v.y;
    if (v.z < minZ) minZ = v.z;
    if (v.z > maxZ) maxZ = v.z;
  });

  const offsetX = center ? (minX + maxX + 1) / 2 : 0;
  const offsetY = center === 'bottom' ? minY : (center ? (minY + maxY + 1) / 2 : 0);
  const offsetZ = center ? (minZ + maxZ + 1) / 2 : 0;

  const positions = [];
  const normals = [];
  const colors = [];

  for (const [key, color] of voxelMap.entries()) {
    const [x, y, z] = key.split(',').map(Number);

    // Check 6 adjacent neighbors. If neighbor exists, cull face!
    for (const face of FACES) {
      const nx = x + face.dir[0];
      const ny = y + face.dir[1];
      const nz = z + face.dir[2];
      const neighborKey = `${nx},${ny},${nz}`;

      if (!voxelMap.has(neighborKey)) {
        // Face is visible, emit 6 vertices
        for (const c of face.corners) {
          positions.push(
            (x + c[0] - offsetX) * voxelSize,
            (y + c[1] - offsetY) * voxelSize,
            (z + c[2] - offsetZ) * voxelSize
          );
          normals.push(face.normal[0], face.normal[1], face.normal[2]);

          // Soft directional shading per face for gentle voxel depth
          let shade = 1.0;
          if (face.dir[1] === 1) shade = 1.08; // soft top highlight
          else if (face.dir[1] === -1) shade = 0.78; // soft bottom shadow
          else if (face.dir[0] !== 0) shade = 0.92; // soft side shadow
          else if (face.dir[2] < 0) shade = 0.88; // soft back shadow

          colors.push(
            Math.min(1, color.r * shade),
            Math.min(1, color.g * shade),
            Math.min(1, color.b * shade)
          );
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
