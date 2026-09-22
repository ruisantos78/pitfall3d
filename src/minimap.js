// Optional side-view sonar minimap: a minimalist Atari-2600 homage showing the
// CURRENT 60m screen only (reloaded every screen change), with Harry moving
// across it. Green translucent phosphor look, 2D canvas, throttled redraws.
import * as THREE from 'three';
import { SCREEN_LENGTH } from './world.js';
import { EYE_HEIGHT } from './player/constants.js';

const CSS_W = 260;
const CSS_H = 76;
const REDRAW_MS = 120;

export class Minimap {
  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.id = 'minimap-canvas';
    this.canvas.width = CSS_W;
    this.canvas.height = CSS_H;
    this.canvas.setAttribute('aria-hidden', 'true');
    const container = document.getElementById('game-container') || document.body;
    container.appendChild(this.canvas);
    this.ctx = this.canvas.getContext('2d');
    this.lastDraw = 0;
    this.lastScreen = null;
    this.visible = false;
    this._tip = new THREE.Vector3(); // reused scratch (no per-frame allocation)
  }

  setVisible(v) {
    v = !!v;
    if (v === this.visible) return;
    this.visible = v;
    this.canvas.style.display = this.visible ? 'block' : 'none';
    // Flags the old rear-log alert to dock just below the radar (see CSS).
    document.body.classList.toggle('minimap-on', this.visible);
    if (this.visible) this.lastDraw = 0; // force immediate redraw on toggle
  }

  // Maps a world Z to canvas X: left = screen entry, right = screen exit
  // (forward, -Z, is to the right).
  zToX(z, startZ) {
    const f = (startZ - z) / SCREEN_LENGTH;
    return Math.max(0, Math.min(1, f)) * CSS_W;
  }

  draw(player, screenIndex, world) {
    if (!this.visible) return;
    const now = performance.now();
    if (now - this.lastDraw < REDRAW_MS && screenIndex === this.lastScreen) return;
    this.lastDraw = now;
    this.lastScreen = screenIndex;
    const ctx = this.ctx;
    const startZ = -screenIndex * SCREEN_LENGTH;
    const groundY = 52;

    // Phosphor background (translucent green)
    ctx.clearRect(0, 0, CSS_W, CSS_H);
    ctx.fillStyle = 'rgba(2, 32, 8, 0.62)';
    ctx.fillRect(0, 0, CSS_W, CSS_H);
    ctx.strokeStyle = 'rgba(80, 255, 120, 0.85)';
    ctx.lineWidth = 1;
    ctx.strokeRect(0.5, 0.5, CSS_W - 1, CSS_H - 1);

    // Ground line
    ctx.fillStyle = 'rgba(120, 255, 150, 0.9)';
    ctx.fillRect(0, groundY, CSS_W, 2);

    const zx = (z) => this.zToX(z, startZ);

    if (world) {
      // Pits / gaps first (carve into the ground line)
      for (const h of world.activeHazards) {
        if (h.screenIndex !== screenIndex) continue;
        if (h.type === 'tar' || h.type === 'water') {
          const x0 = zx(h.maxZ), x1 = zx(h.minZ);
          ctx.fillStyle = h.type === 'water' ? 'rgba(40, 140, 255, 0.9)' : 'rgba(20, 20, 20, 0.95)';
          ctx.fillRect(x0, groundY - 3, Math.max(2, x1 - x0), 8);
        } else if (h.type === 'disappearing_quicksand') {
          const r = h.radius ?? 10;
          const fullW = Math.abs(zx(h.z - r) - zx(h.z + r));
          let openFrac = 0;
          if (h.segments && h.segments.length) {
            let sum = 0;
            for (const s of h.segments) sum += s.openAmount ?? (s.isOpen ? 1 : 0);
            openFrac = sum / h.segments.length;
          } else {
            openFrac = h.isOpen ? 1 : 0;
          }
          const w = fullW * openFrac;
          if (w >= 1) {
            const cx = zx(h.z);
            ctx.fillStyle = 'rgba(0, 0, 0, 0.95)';
            ctx.fillRect(cx - w / 2, groundY - 3, w, 8);
          }
        } else if (h.type === 'ladder_shaft') {
          const x0 = zx(h.maxZ), x1 = zx(h.minZ);
          ctx.fillStyle = 'rgba(0, 0, 0, 0.95)';
          ctx.fillRect(x0, groundY - 3, Math.max(2, x1 - x0), 8);
          if (h.hasLadder) {
            // Ladder hole: two parallel white rails + rungs (degraus) from the
            // hole down to the base of the map.
            const x = zx(h.centerZ);
            const top = groundY + 5;
            const hgt = CSS_H - groundY - 6;
            ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
            ctx.fillRect(x - 3, top, 2, hgt);
            ctx.fillRect(x + 1, top, 2, hgt);
            // Rungs every 4px
            for (let y = top + 3; y < top + hgt - 1; y += 4) {
              ctx.fillRect(x - 3, y, 6, 1);
            }
          }
          // Note: 'log_exit_pit' (spike pit at the end of rolling-log
          // screens) is intentionally not drawn.
        }
      }

      // Treasures (uncollected yellow dots above the line)
      for (const tr of world.activeTreasures) {
        if (tr.screenIndex !== screenIndex || tr.collected) continue;
        ctx.fillStyle = 'rgba(255, 235, 60, 0.95)';
        ctx.fillRect(zx(tr.z) - 1, groundY - 10, 3, 3);
      }

      // Vines: reuse the SAME tip.getWorldPosition() that drives Harry
      // (player.js:945 tipPos = v.tip.getWorldPosition). No duplicate physics:
      // tipWorldY → handY uses the identical hand formula as Harry's marker
      // (groundY-2 - (worldY-EYE)*9 -14), so vine knot and Harry's hand trace
      // the exact same pendulum arc, attached or free.
      for (const v of world.activeVines) {
        if (v.screenIndex !== screenIndex) continue;
        const anchorX = zx(v.centerZ);
        if (!v.vine.tip) continue;
        v.vine.tip.getWorldPosition(this._tip);
        const tipX = zx(this._tip.z);
        const handLift = Math.max(0, this._tip.y - EYE_HEIGHT) * 9;
        const handY = groundY - 2 - handLift - 14;
        ctx.strokeStyle = 'rgba(140, 255, 170, 0.8)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(anchorX, 0);
        ctx.lineTo(tipX, handY);
        ctx.stroke();
        ctx.fillStyle = 'rgba(200, 255, 210, 0.95)';
        ctx.fillRect(tipX - 1, handY - 1, 3, 3);
      }

      // Crocodiles (green safe / red open)
      for (const c of world.activeCrocodiles) {
        if (c.screenIndex !== screenIndex) continue;
        const x = zx(c.z);
        ctx.fillStyle = c.isOpen ? 'rgba(255, 60, 40, 0.95)' : 'rgba(80, 220, 100, 0.95)';
        ctx.fillRect(x - 6, groundY - 7, 12, 5);
        if (c.isOpen) {
          ctx.fillRect(x + 5, groundY - 9, 4, 7); // open jaw tick
        }
      }

      // Logs, fires, snakes (surface only: scorpion lives underground).
      // Logs render as circles (rolling = bright amber, stationary = brown).
      for (const h of world.activeHazards) {
        if (h.screenIndex !== screenIndex) continue;
        if (h.type === 'log' || h.type === 'rolling_log') {
          if (h.mesh && h.mesh.visible === false) continue;
          const x = zx(h.z ?? h.spawnZ ?? startZ);
          ctx.fillStyle = h.type === 'rolling_log' ? 'rgba(255, 180, 80, 0.95)' : 'rgba(170, 110, 50, 0.9)';
          ctx.beginPath();
          ctx.arc(x, groundY - 6, 5, 0, Math.PI * 2);
          ctx.fill();
        } else if (h.type === 'fire') {
          const x = zx(h.z);
          ctx.fillStyle = 'rgba(255, 140, 30, 0.95)';
          const flick = Math.floor(now / 200) % 2 === 0 ? 1 : 0;
          ctx.fillRect(x - 1, groundY - 12 - flick, 3, 10 + flick);
        } else if (h.type === 'snake') {
          const x = zx(h.z);
          ctx.fillStyle = 'rgba(255, 60, 60, 0.9)';
          ctx.fillRect(x - 2, groundY - 6, 5, 4);
        }
      }
    }

    // Harry marker: thin upright body that rises with jumps (forward = right).
    if (player) {
      const x = zx(player.z);
      const lift = Math.max(0, player.y || 0) * 9; // ~2m max jump ≈ 18px
      const bodyH = 14;
      const topY = groundY - 2 - lift - bodyH;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(x - 1, topY, 3, bodyH);
      // Head dot
      ctx.fillRect(x - 1, topY - 3, 3, 3);
      // Facing tick
      const ahead = player.targetRotY === 0;
      ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
      ctx.fillRect(ahead ? x + 2 : x - 4, topY + 4, 2, 2);
    }
  }
}
