import * as THREE from 'three';
import { createVoxelGeometry, createVoxelMaterial } from '../voxel.js';

export const C = {
  LEAF_DARK: '#224818',
  LEAF_MID: '#387828',
  LEAF_LIGHT: '#4c9e36',
  TRUNK_DARK: '#542d0a',
  TRUNK_MID: '#784414',
  TRUNK_LIGHT: '#9a5c20',
  LOG_CORE: '#b88a48',
  CROC_DARK: '#1c4818',
  CROC_MID: '#2c6c24',
  CROC_LIGHT: '#408832',
  CROC_TEETH: '#f4f4f4',
  CROC_MOUTH: '#991818',
  EYE_YELLOW: '#f8d820',
  EYE_BLACK: '#111111',
  VINE: '#3c6e28',
  VINE_KNOT: '#5c8e38',
  SCORPION_RED: '#d82800',
  SCORPION_DARK: '#8a1500',
  SNAKE_BROWN: '#745420',
  SNAKE_YELLOW: '#d8b030',
  FIRE_RED: '#e82800',
  FIRE_ORANGE: '#f87800',
  FIRE_YELLOW: '#f8e020',
  GOLD: '#f8d820',
  GOLD_SHINE: '#fff480',
  SILVER: '#c4c8d0',
  SILVER_SHINE: '#ffffff',
  DIAMOND: '#38d8f8',
  DIAMOND_BAND: '#f8c820',
  BAG_BROWN: '#c89c38',
  BAG_BLACK: '#111111',
  HARRY_SHIRT: '#c4b07b',
  HARRY_SKIN: '#e0aa80',
};


export const GEO_CACHE = new Map();
export const GEO_SET = new Set();
export const SHARED_MATS = new Set();

export const SHARED_MATERIAL = createVoxelMaterial();

export const VERTEX_BASIC = new THREE.MeshBasicMaterial({ vertexColors: true });
SHARED_MATS.add(VERTEX_BASIC);


export class BaseModel {
  constructor() {
    this.group = new THREE.Group();
    this.voxels = [];
  }

  static memoGeometry(key, build) {
    let geo = GEO_CACHE.get(key);
    if (!geo) {
      geo = build();
      GEO_CACHE.set(key, geo);
      GEO_SET.add(geo);
    }
    return geo;
  }

  static isSharedModelGeometry(geo) {
    return GEO_SET.has(geo);
  }

  static sharedBasicMaterial(hex) {
    let mat = null;
    for (const m of SHARED_MATS) {
      if (m.type === 'MeshBasicMaterial' && m.color.getHex() === hex) {
        mat = m;
        break;
      }
    }
    if (!mat) {
      mat = new THREE.MeshBasicMaterial({ color: hex });
      SHARED_MATS.add(mat);
    }
    return mat;
  }

  static isSharedModelMaterial(mat) {
    return SHARED_MATS.has(mat) || mat === SHARED_MATERIAL;
  }
}

export function cachedVoxelGeo(key, voxels, voxelSize, center) {
  return BaseModel.memoGeometry(key, () => createVoxelGeometry(voxels, voxelSize, center));
}
