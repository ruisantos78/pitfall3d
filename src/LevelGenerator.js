// Authentic Atari 2600 level generator (pitfall.asm)
// Bidirectional LFSR with seed $C4.
// Bits: 0..2 ground object, 3..5 scene, 6..7 tree pattern, 7 wall side.

import { SURFACE_MAPS } from './maps/surface.js';
import { UNDERGROUND_SHORTCUTS } from './maps/shortcuts.js';
import { SCREEN_LENGTH } from './WorldConstants.js';

export class LevelGenerator {
  static lfsrRight(r) {
    const b3 = (r >> 3) & 1, b4 = (r >> 4) & 1, b5 = (r >> 5) & 1, b7 = (r >> 7) & 1;
    return ((r << 1) & 0xff) | (b3 ^ b4 ^ b5 ^ b7);
  }

  // Precomputed 255 phases from seed $C4
  static LFSR_TABLE = (() => {
    const table = [];
    let r = 0xc4;
    for (let i = 0; i < 255; i++) {
      const objectType = r & 0x07;
      const sceneType = (r >> 3) & 0x07;
      table.push({
        rand: r,
        objectType,
        sceneType,
        treePat: (r >> 6) & 0x03,
        treasureSlot: ((r >> 6) & 3) * 8 + objectType,
      });
      r = LevelGenerator.lfsrRight(r);
    }
    return table;
  })();

  static TUNNEL_ROUTE_TABLE = (() => {
    const isLadder = (i) => {
      const sc = LevelGenerator.LFSR_TABLE[((i % 255) + 255) % 255].sceneType;
      return sc === 0 || sc === 1; // HOLE_SINGLE or HOLE_TRIPLE
    };
    const findNext = (start, step) => {
      for (let k = 1; k <= 6; k++) {
        const idx = start + step * k;
        if (isLadder(idx)) return ((idx % 255) + 255) % 255;
      }
      return (((start + step * 3) % 255) + 255) % 255;
    };
    return Array.from({ length: 255 }, (_, i) => ({
      fwd: findNext(i, 1),
      bwd: findNext(i, -1),
    }));
  })();

  static SHORTCUT_MAP = (() => {
    const map = new Map();
    for (let i = 0; i < 255; i++) {
      const surface = LevelGenerator.getSurfaceMap(i);
      if (!surface || surface.Hole <= 0) continue;

      const exitPhase = LevelGenerator.getShortcutExit(i);
      if (!exitPhase) continue;
      const exitScreen = exitPhase - 1;
      const direction = surface.Wall === 'N' ? 1 : -1;
      const roomCount = direction > 0
        ? (i - exitScreen + 255) % 255
        : (exitScreen - i + 255) % 255;
      const screenDelta = direction > 0 ? -roomCount : roomCount;
      const entryZ = -i * SCREEN_LENGTH - SCREEN_LENGTH / 2;
      const exitZ = -exitScreen * SCREEN_LENGTH - SCREEN_LENGTH / 2;

      map.set(i, {
        entryScreen: i,
        exitScreen,
        screenDelta,
        direction,
        entryWall: surface.Wall,
        exitWall: LevelGenerator.getSurfaceMap(exitScreen)?.Wall,
        entryZ,
        exitZ,
        rooms: LevelGenerator.getTunnelRooms(i),
      });
    }
    return map;
  })();

  static getAuthenticSpec(index) {
    return LevelGenerator.LFSR_TABLE[((index % 255) + 255) % 255];
  }

  static getSurfaceMap(index) {
    const phase = ((index % 255) + 255) % 255;
    return SURFACE_MAPS[String(phase + 1).padStart(3, '0')];
  }

  static getTunnelRooms(index) {
    const phase = ((index % 255) + 255) % 255;
    return UNDERGROUND_SHORTCUTS[String(phase + 1).padStart(3, '0')] ?? null;
  }

  static getShortcutExit(index) {
    const rooms = LevelGenerator.getTunnelRooms(index);
    if (!rooms) return undefined;
    return rooms[rooms.length - 1];
  }

  static getEntryWallSide(screenIdx) {
    const entry = LevelGenerator.LFSR_TABLE[((screenIdx % 255) + 255) % 255];
    const wallSide = (entry.rand >>> 7) & 1;
    return wallSide === 1 ? -1 : +1;
  }

  static getScreenType(index) {
    const map = LevelGenerator.getSurfaceMap(index);
    if (!map) return 'LOGS';
    if (map.Hole === 1) return 'HOLE_SINGLE';
    if (map.Hole === 3) return 'HOLE_TRIPLE';
    if (map.Pit === 'Tar') return 'TAR_PIT_VINE';
    if (map.Pit === 'Crocodile') return map.Vine ? 'CROCODILE_VINE' : 'CROCODILE_POND';
    if (map.Pit === 'Quicksand') {
      if (map.Treasure) return 'DISAPPEARING_QUICKSAND';
      if (map.Shifting) return map.Vine ? 'QUICKSAND_VINE_OPEN' : 'BLUE_QUICKSAND';
      return 'QUICKSAND_VINE';
    }
    return 'LOGS';
  }
}
