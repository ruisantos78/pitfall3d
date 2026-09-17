// Player Controller - 1st Person Perspective (FPS) for Atari Pitfall 3D
import * as THREE from 'three';
import { audio } from './audio.js';
import { SCREEN_LENGTH, TUNNEL_FLOOR_Y, CEIL_TOP_Y, PIT_FLOOR_Y, screenRoom } from './world.js';
import { createPlayerArmsModel } from './models/index.js';
import { t } from './i18n.js';
import { getHighScore, getShowHelp, submitScore } from './settings.js';
import { DEBUG_GOD_MODE } from './debug.js';
import {
  MoveForwardCommand,
  MoveBackwardCommand,
  TurnAroundCommand,
  ActionJumpCommand,
  ResetCommand,
  GameOverCommand,
  DieCommand,
  RespawnCommand,
  VineGrabCommand,
  VineReleaseCommand,
  VineTransferCommand,
  CheckCollisionsCommand,
} from './commands/index.js';

// Physics constants live in ./player/constants.js (single source of truth);
// re-exported here so existing `from './player.js'` imports keep working.
export {
  GRAVITY,
  JUMP_VELOCITY,
  RUN_SPEED,
  EYE_HEIGHT,
  TUNNEL_SPEED_MULT,
  EMPTY_TUNNEL_SPEED_MULT,
  TUNNEL_BRAKE_DECEL,
  WARP_SPEED,
  WARP_STOP_MARGIN,
  WARP_MIN_DIST,
  WARP_FOV,
  CROC_BITE_GRACE_DURATION,
} from './player/constants.js';
import {
  GRAVITY,
  JUMP_VELOCITY,
  RUN_SPEED,
  EYE_HEIGHT,
  TUNNEL_SPEED_MULT,
  EMPTY_TUNNEL_SPEED_MULT,
  TUNNEL_BRAKE_DECEL,
  WARP_SPEED,
  WARP_STOP_MARGIN,
  WARP_MIN_DIST,
} from './player/constants.js';
import { updateArmsAndCamera } from './player/camera.js';

// Scratch vector for the vine-tip lookup (avoids one allocation per frame).
const _vineTip = new THREE.Vector3();

export class Player {
  constructor(camera, scene) {
    this.camera = camera;
    this.scene = scene;

    // Movement state (Strictly along Z axis: forward/backward only)
    this.z = 0;
    this.y = 0; // Ground elevation
    this.vy = 0;
    this.vz = 0;
    this.isGrounded = true;
    // Animated tunnel warp: null or { dirSign (-1 toward -Z, +1 toward +Z), targetZ }.
    this.warp = null;
    this.baseFov = this.camera?.fov ?? 75;

    // Input state
    this.moveForward = false;
    this.moveBackward = false;
    this.actionPressed = false;
    this.actionJustPressed = false;
    this.targetRotY = 0; // camera facing: 0 = forward (-Z), Math.PI = back (+Z)
    this.turnJustPressed = false;

    // Vine grabbing state
    this.attachedVine = null; // { vine, centerZ, time }
    this.justReleasedVineTimer = 0;
    // Crocodile bite immunity right after letting go of a vine.
    this.crocBiteGraceTimer = 0;
    // Vine just released: ignored until landing or grabbing another vine
    // (prevents re-grabbing the SAME vine mid-air after release).
    this.ignoredVine = null;

    // Game stats
    this.score = 2000;
    this.lives = 3;
    this.timeRemaining = 1200; // 20:00 minutes in seconds
    this.treasuresCollected = 0;
    this.isGameOver = false;
    this.isDying = false;
    this.deathTimer = 0;
    this.deathReasonKey = 'death.lifeLost';
    this.tripCooldown = 0;
    this.isTripped = false; // Face-planted on the ground, waiting for a new direction
    // Checkpoint: last screen boundary strip crossed (respawn returns to it).
    this.checkpointZ = null;
    // Underground: in the tunnel and/or climbing up/down the ladder.
    this.inTunnel = false;
    this.climbing = null; // null | 'down' | 'up'
    this.climbZ = 0;
    this.climbGrace = 0; // time without climbing back down right after climbing up
    this.CLIMB_SPEED = 7.0; // fast ladder climb down/up (~1.1s in the 8m pit)
    // Last surface ladder screen visited: tunnel corridor is pre-configured as
    // soon as Harry walks into a HOLE_* screen, not only at descent time.
    this.lastSurfaceHoleScreen = null;

    // Sky fall on respawn (like the original): spawns high up and plummets down.
    this.RESPAWN_DROP_HEIGHT = 12;
    this.respawnDrop = false;
    // The top of the ground is Y=0. The camera and arms must stay above it.
    this.PRONE_EYE_HEIGHT = 0.65;
    this.TRIP_STAND_DELAY = 0.25;
    this.tripStandTimer = 0;

    // Head bobbing & arms
    this.bobTimer = 0;
    this.arms = createPlayerArmsModel();
    this.camera.add(this.arms.group);
    this.scene.add(this.camera);

    // Initial camera position
    this.camera.position.set(0, EYE_HEIGHT, this.z);
    this.camera.lookAt(0, EYE_HEIGHT, -100);

    // Gamepad state (Xbox/Edge): separate flags OR-ed with keyboard/touch
    // so polling never clears a held keyboard key.
    this.padForward = false;
    this.padBackward = false;
    this.padPrevAction = false;
    this.padPrevTurn = false;

    this.bindInputs();
  }

  bindInputs() {
    window.addEventListener('keydown', (e) => {
      if (this.isGameOver) return;
      audio.init();

      if (e.code === 'KeyW' || e.code === 'ArrowUp') {
        if (this.touchOnly) return;
        new MoveForwardCommand(this, true).execute();
      } else if (e.code === 'KeyS' || e.code === 'ArrowDown') {
        if (this.touchOnly) return;
        new MoveBackwardCommand(this, true).execute();
      } else if (e.code === 'KeyA' || e.code === 'ArrowLeft' || e.code === 'KeyD' || e.code === 'ArrowRight') {
        if (this.touchOnly) return;
        if (!this.turnJustPressed) {
          new TurnAroundCommand(this).execute();
          this.turnJustPressed = true;
        }
      } else if (e.code === 'Space' || e.code === 'Enter') {
        new ActionJumpCommand(this, true).execute();
      }
    });

    window.addEventListener('keyup', (e) => {
      if (e.code === 'KeyW' || e.code === 'ArrowUp') {
        new MoveForwardCommand(this, false).execute();
      } else if (e.code === 'KeyS' || e.code === 'ArrowDown') {
        new MoveBackwardCommand(this, false).execute();
      } else if (e.code === 'KeyA' || e.code === 'ArrowLeft' || e.code === 'KeyD' || e.code === 'ArrowRight') {
        this.turnJustPressed = false;
      } else if (e.code === 'Space' || e.code === 'Enter') {
        new ActionJumpCommand(this, false).execute();
      }
    });

    // Mouse click is the jump button when touch controls are hidden
    // (desktop + Xbox Edge with mouse). Ignored on UI elements and while
    // any overlay menu is open so menu clicks never trigger a jump.
    const isUiClick = (target) => {
      if (!target || !target.closest) return false;
      if (target.closest('button, a, input, select')) return true;
      const startOverlay = document.getElementById('start-overlay');
      if (startOverlay && !startOverlay.classList.contains('hidden')) return true;
      const overOverlay = document.getElementById('gameover-overlay');
      if (overOverlay && !overOverlay.classList.contains('hidden')) return true;
      return false;
    };
    window.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      if (this.isGameOver) return;
      if (this.touchOnly) return;
      if (isUiClick(e.target)) return;
      new ActionJumpCommand(this, true).execute();
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button !== 0) return;
      if (this.touchOnly) return;
      new ActionJumpCommand(this, false).execute();
    });
    const btnFwd = document.getElementById('btn-forward');
    const btnBwd = document.getElementById('btn-backward');
    const btnAct = document.getElementById('btn-action');
    const btnTurn = document.getElementById('btn-turn');
    const btnTouchToggle = document.getElementById('btn-touch-toggle');
    const touchControls = document.getElementById('mobile-controls');
    this.touchOnly = false;

    const mobileBrowser = navigator.userAgentData?.mobile === true
      || /Android|iPhone|iPad|iPod|Windows Phone|webOS|BlackBerry|Opera Mini/i.test(navigator.userAgent)
      || (navigator.maxTouchPoints > 0 && window.matchMedia('(pointer: coarse)').matches);

    if (touchControls && mobileBrowser) {
      touchControls.classList.add('touch-visible');
      this.touchOnly = true;
    }

    if (btnTouchToggle && touchControls) {
      this.btnTouchToggle = btnTouchToggle;
      const setTouchLabel = () => {
        const txt = btnTouchToggle.querySelector('.btn-txt');
        const label = t(this.touchOnly ? 'opt.touchOn' : 'opt.touchOff');
        if (txt) txt.textContent = ` ${label}`;
        else btnTouchToggle.textContent = `📱 ${label}`;
      };
      this.refreshTouchLabel = setTouchLabel;
      setTouchLabel();
      btnTouchToggle.addEventListener('click', () => {
        const isVisible = touchControls.classList.toggle('touch-visible');
        touchControls.classList.toggle('touch-hidden', !isVisible);
        this.touchOnly = isVisible;
        setTouchLabel();
      });
    }

    const bindDirectionButton = (button, CommandClass) => {
      if (!button) return;
      button.addEventListener('pointerdown', (e) => {
        button.setPointerCapture?.(e.pointerId);
        new CommandClass(this, true).execute();
      });
      ['pointerup', 'pointercancel', 'lostpointercapture', 'pointerleave'].forEach((eventName) => {
        button.addEventListener(eventName, () => {
          new CommandClass(this, false).execute();
        });
      });
    };

    bindDirectionButton(btnFwd, MoveForwardCommand);
    bindDirectionButton(btnBwd, MoveBackwardCommand);
    if (btnAct) {
      btnAct.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        btnAct.setPointerCapture?.(e.pointerId);
        new ActionJumpCommand(this, true).execute();
      });
      ['pointerup', 'pointercancel', 'lostpointercapture', 'pointerleave'].forEach((eventName) => {
        btnAct.addEventListener(eventName, (e) => {
          e.preventDefault();
          new ActionJumpCommand(this, false).execute();
        });
      });
    }
    // Touch turn-around button (same 180° spin as the A/D / arrow keys).
    if (btnTurn) {
      btnTurn.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        new TurnAroundCommand(this).execute();
      });
    }
  }

  // Polls the first connected gamepad (Xbox controller on Edge):
  // left stick / D-pad up-down walks, A/B/RT jump, X/LB turn around.
  // Runs every frame; uses rising edges so held buttons don't repeat.
  updateGamepadInput() {
    if (this.isGameOver) return;
    const pads = navigator.getGamepads ? navigator.getGamepads() : null;
    if (!pads) return;
    let gp = null;
    for (const p of pads) {
      if (p && p.connected) {
        gp = p;
        break;
      }
    }
    if (!gp) {
      this.padForward = false;
      this.padBackward = false;
      this.padPrevAction = false;
      this.padPrevTurn = false;
      return;
    }
    const pressed = (i) => !!(gp.buttons[i] && gp.buttons[i].pressed);
    const axisY = gp.axes.length > 1 ? gp.axes[1] : 0;
    this.padForward = pressed(12) || axisY < -0.4;
    this.padBackward = pressed(13) || axisY > 0.4;
    const actionHeld = pressed(0) || pressed(1) || pressed(7) || pressed(5);
    if (actionHeld && !this.padPrevAction) {
      new ActionJumpCommand(this, true).execute();
    }
    this.padPrevAction = actionHeld;
    const turnHeld = pressed(2) || pressed(3) || pressed(4) || pressed(14) || pressed(15);
    if (turnHeld && !this.padPrevTurn) {
      new TurnAroundCommand(this).execute();
    }
    this.padPrevTurn = turnHeld;
  }

  // Update physics, movement, vine attachment, and collisions
  update(delta, world) {
    if (this.isGameOver) return;

    // Death / Respawn animation timer
    if (this.isDying) {
      this.deathTimer -= delta;
      this.camera.position.y = Math.max(0.2, this.camera.position.y - delta * 2.5);
      if (this.deathTimer <= 0) {
        this.respawn(world);
      }
      return;
    }
    this.updateGamepadInput();

    // Cooldown timers
    if (this.tripCooldown > 0) this.tripCooldown -= delta;
    if (this.justReleasedVineTimer > 0) this.justReleasedVineTimer -= delta;
    if (this.crocBiteGraceTimer > 0) this.crocBiteGraceTimer -= delta;

    // Decrement 20-minute countdown
    this.timeRemaining -= delta;
    if (this.timeRemaining <= 0) {
      this.timeRemaining = 0;
      this.die('death.timeUp');
      return;
    }

    // State 1: ATTACHED TO VINE (Swinging over pit/crocodiles)
    if (this.attachedVine) {
      this.updateAttachedVine(delta, world);
      return;
    }

    // State 2: NORMAL 1D MOVEMENT & JUMPING
    this.updateNormalMovement(delta, world);

    // While knocked down, skip other hazards and item pickups.
    if (this.isTripped) {
      this.updateArmsAndCamera(delta);
      return;
    }

    // Check if standing on an opening crocodile snout (NOT on the eyes!)
    if (this.isGrounded && Math.abs(this.y - 0.35) < 0.25) {
      const croc = this.getCrocodileAt(world, this.z);
      // Only bite if on the FRONT MOUTH (Z > croc.z + 0.65). If on the eyes/skull, 100% IMMUNE!
      // Right after releasing a vine the open mouth cannot kill (grace to clear the last croc).
      if (croc && croc.isOpen && this.z > croc.z + 0.65 && this.crocBiteGraceTimer <= 0) {
        audio.playChomp();
        this.die('death.crocBite');
        return;
      }
    }

    // Check if standing on a disappearing quicksand section opened beneath feet
    // (each section opens/closes on its own — only the section under the feet kills)
    if (!this.inTunnel && this.isGrounded && this.y <= 0.1 && world.activeOpeningPits) {
      for (const pitData of world.activeOpeningPits) {
        if (world.isQuicksandOpenAt(pitData, this.z)) {
          audio.playSink();
          this.die('death.quicksand');
          return;
        }
      }
    }

    // On the ladder, no vine grabs or collisions (climbing up/down safely)
    if (!this.climbing) {
      // Check automatic vine grab
      this.checkVineGrab(world);

      // Check collisions with hazards & collectibles
      this.checkCollisions(world);
    }

    // Update First-Person Arms animation & Head Bobbing
    this.updateArmsAndCamera(delta);
  }

  updateNormalMovement(delta, world) {
    // Climbing up/down the ladder: vertical locked in the pit, no normal physics
    if (this.climbing) {
      this.actionJustPressed = false;
      this.vz = 0;
      this.vy = 0;
      this.z = this.climbZ;
      const targetY = this.climbing === 'down' ? TUNNEL_FLOOR_Y : 0;
      const dir = Math.sign(targetY - this.y);
      this.y += dir * this.CLIMB_SPEED * delta;
      if ((dir <= 0 && this.y <= targetY) || (dir > 0 && this.y >= targetY)) {
        this.y = targetY;
        this.inTunnel = this.climbing === 'down';
        this.climbing = null;
        this.isGrounded = true;
        // Exited the tunnel on top of the pit: 1s to get clear before climbing back down.
        // The corridor (walls + scorpion) stays alive — it will be cleared by the
        // pre-load loop as soon as Harry walks into a non-ladder screen.
        if (!this.inTunnel) {
          this.climbGrace = 1.0;
        }
        audio.playGroundThud();
      } else {
        this.isGrounded = false;
      }
      this.camera.position.set(0, this.y + EYE_HEIGHT, this.z);
      return;
    }
    if (this.climbGrace > 0) this.climbGrace -= delta;

    // After tripping, Harry stays on his knees (Atari 2600 style) while the log passes over/by him.
    // Once the hazard has passed (or after a short timeout), he stands back up and continues walking.
    if (this.isTripped) {
      this.vz = 0;
      this.vy = 0;
      this.tripStandTimer += delta;

      const standingSurfaceY = this.getSurfaceElevation(world, this.z);
      if (standingSurfaceY > -5) {
        this.y = standingSurfaceY;
        this.isGrounded = true;
      }

      // Check if the log has passed by Harry
      let hasPassed = false;
      const haz = this.trippingHazard;
      if (haz && haz.type === 'rolling_log') {
        // Rolling logs move toward +Z. Once hazard.z is past player.z + 1.2, it has cleared Harry.
        if (haz.z > this.z + 1.2 || haz.falling || haz.fallingIntoPit) {
          hasPassed = true;
        }
      } else if (haz && haz.type === 'log') {
        // Stationary log: Harry kneels briefly and stands back up
        if (this.tripStandTimer >= 0.6) {
          hasPassed = true;
        }
      } else {
        if (this.tripStandTimer >= 0.6) {
          hasPassed = true;
        }
      }

      // Safety timeout in case log stopped or disappeared
      if (this.tripStandTimer >= 1.2) {
        hasPassed = true;
      }

      if (hasPassed) {
        this.isTripped = false;
        this.trippingHazard = null;
        this.tripStandTimer = 0;
      } else {
        return;
      }
    }

    // Movement is relative to camera facing (this.targetRotY)
    let targetVz = 0;
    // 0 = face -Z (dir = -1), Math.PI = face +Z (dir = 1)
    const dir = this.targetRotY === Math.PI ? 1 : -1;
    // Intended travel sense from held inputs (+1/-1/0), independent of pace.
    const moveSign = ((this.moveForward || this.padForward) ? 1 : 0) -
      ((this.moveBackward || this.padBackward) ? 1 : 0);
    // Underground shortcut pace: ladder/scorpion screens walk at normal 1x
    // pace, while an empty screen cruises at 6x with planned braking to a
    // stop point WARP_STOP_MARGIN before the next 1x screen
    // (v^2 = v0^2 + 2*a*d caps the cruise target). Long empty runs trigger
    // the animated warp below instead of the plain cruise.
    const tunnelScreenNow = this.inTunnel ? Math.floor(-this.z / SCREEN_LENGTH) : null;
    // Pace/warp authority while a corridor is active: its room array decides
    // (listed rooms run at 1x, the rest warp). Without a corridor (e.g. a
    // side-hole drop before any ladder screen), fall back to surface holes
    // plus the corridor scorpions currently alive.
    const corridorRooms = (this.inTunnel && world.tunnelCorridor?.interestingRooms) || null;
    const isTunnelScreenInteresting = (s) => {
      if (corridorRooms) return corridorRooms.has(screenRoom(s));
      const t = world.getScreenType(s);
      if (t === 'HOLE_SINGLE' || t === 'HOLE_TRIPLE') return true;
      return world.activeHazards?.some((h) =>
        h.type === 'scorpion' && h.screenIndex === -1 &&
        Math.floor(-h.baseZ / SCREEN_LENGTH) === s
      );
    };
    // Cancel a running warp when leaving the tunnel, climbing, or steering
    // against it; a brick wall just ahead cancels it too.
    if (this.warp) {
      const warpTravel = this.warp.dirSign;
      const pushingAgainst = moveSign !== 0 && dir * moveSign !== warpTravel;
      let wallAhead = false;
      if (world.activeTunnelWalls?.length) {
        for (const wl of world.activeTunnelWalls) {
          const gap = warpTravel < 0 ? this.z - wl.z : wl.z - this.z;
          if (gap > 0 && gap < 3) {
            wallAhead = true;
            break;
          }
        }
      }
      if (!this.inTunnel || this.climbing || pushingAgainst || wallAhead) this.warp = null;
    }
    // Engage the warp: running an empty screen toward a 1x screen far enough
    // ahead. The warp auto-pilots to a stop point before that screen's edge.
    if (!this.warp && this.inTunnel && !this.climbing && moveSign !== 0 &&
      tunnelScreenNow !== null && !isTunnelScreenInteresting(tunnelScreenNow)) {
      const travel = dir * moveSign; // -1 toward -Z, +1 toward +Z
      const step = travel < 0 ? 1 : -1;
      for (let k = 1; k <= 10; k++) {
        const cand = tunnelScreenNow + step * k;
        if (isTunnelScreenInteresting(cand)) {
          const edge = travel < 0 ? -cand * SCREEN_LENGTH : -(cand + 1) * SCREEN_LENGTH;
          const distToEdge = travel < 0 ? this.z - edge : edge - this.z;
          if (distToEdge - WARP_STOP_MARGIN > WARP_MIN_DIST) {
            this.warp = {
              dirSign: travel,
              targetZ: travel < 0 ? edge + WARP_STOP_MARGIN : edge - WARP_STOP_MARGIN,
            };
          }
          break;
        }
      }
    }
    if (this.warp) {
      // Warp profile: same braking curve toward the stop point, capped at
      // WARP_SPEED. Ends at surface pace right before the next phase.
      const remain = this.warp.dirSign < 0 ? this.z - this.warp.targetZ : this.warp.targetZ - this.z;
      if (remain <= 0.3) {
        this.z = this.warp.targetZ;
        this.vz = this.warp.dirSign * RUN_SPEED;
        targetVz = this.vz;
        this.warp = null;
      } else {
        const warpTarget = Math.min(
          WARP_SPEED,
          Math.sqrt(RUN_SPEED * RUN_SPEED + 2 * TUNNEL_BRAKE_DECEL * remain)
        );
        targetVz = this.warp.dirSign * warpTarget;
      }
    }
    if (!this.warp) {
      let paceMultiplier = 1;
      if (this.inTunnel) {
        if (isTunnelScreenInteresting(tunnelScreenNow)) {
          paceMultiplier = TUNNEL_SPEED_MULT;
        } else {
          paceMultiplier = EMPTY_TUNNEL_SPEED_MULT;
          if (moveSign !== 0) {
            const travel = dir * moveSign; // -1 toward -Z, +1 toward +Z
            const step = travel < 0 ? 1 : -1;
            for (let k = 1; k <= 10; k++) {
              const cand = tunnelScreenNow + step * k;
              if (isTunnelScreenInteresting(cand)) {
                const edge = travel < 0 ? -cand * SCREEN_LENGTH : -(cand + 1) * SCREEN_LENGTH;
                // Brake toward the warp stop point so a manual run hands off
                // at surface pace exactly where the warp would end.
                const dist = (travel < 0 ? this.z - edge : edge - this.z) - WARP_STOP_MARGIN;
                const cruise = RUN_SPEED * EMPTY_TUNNEL_SPEED_MULT;
                const allowed = dist <= 0
                  ? RUN_SPEED
                  : Math.sqrt(RUN_SPEED * RUN_SPEED + 2 * TUNNEL_BRAKE_DECEL * dist);
                paceMultiplier = THREE.MathUtils.clamp(allowed / RUN_SPEED, TUNNEL_SPEED_MULT, cruise / RUN_SPEED);
                break;
              }
            }
          }
        }
      }
      const pace = RUN_SPEED * paceMultiplier;

      if (this.moveForward || this.padForward) targetVz += pace * dir;
      if (this.moveBackward || this.padBackward) targetVz -= pace * dir;
    }

    // Responsive arcade acceleration (slower spool-up/down while warping
    // so the dash-in and the braking feel animated instead of instant).
    const accelRate = this.warp ? 4 : 15;
    this.vz = THREE.MathUtils.lerp(this.vz, targetVz, Math.min(1, delta * accelRate));
    const prevZ = this.z;
    this.z += this.vz * delta;

    // No barrier at the starting edge: the 255-screen map loops in both
    // directions, so walking behind z = 0 enters screen -1 (phase 255).

    // Tunnel brick walls (authentic dead ends): solid barriers that block
    // passage in both directions, including a fast movement step that skips
    // over the wall's center coordinate in a single frame.
    // Dynamic brick walls only collide with Harry while he is underground.
    // The corridor remains prepared while he clears the surface ladder, so
    // checking these barriers on the surface would incorrectly block travel.
    const isUnderground = this.inTunnel || this.climbing === 'down' || this.y < -2;
    const tunnelWalls = world.activeTunnelWalls?.length
      ? world.activeTunnelWalls
      : (world.tunnelCorridorWalls ?? []).map((mesh) => ({
        z: mesh.position.z + 0.5,
      }));
    if (isUnderground && tunnelWalls.length) {
      for (const wl of tunnelWalls) {
        const lo = wl.z - 1.1;
        const hi = wl.z + 1.1;
        const movingForward = this.z < prevZ;
        const enteringWall = movingForward
          ? prevZ >= hi && this.z < hi
          : prevZ <= lo && this.z > lo;
        const startedInsideWall = prevZ > lo && prevZ < hi;

        if (enteringWall || startedInsideWall) {
          // Forward movement is toward lower Z and must stop at the wall's
          // high-Z face; backward movement stops at its low-Z face.
          this.z = this.z < prevZ ? hi : lo;
          this.vz = 0;
        }
      }

      // Keep the player inside the span bounded by the two active dead-end
      // walls. This is a second swept-boundary guard for large movement steps
      // or a frame in which the wall collision was initialized late.
      if (tunnelWalls.length >= 2) {
        const wallPositions = tunnelWalls
          .map((wall) => wall.z)
          .sort((a, b) => a - b);
        const corridorMin = wallPositions[0] + 1.1;
        const corridorMax = wallPositions[wallPositions.length - 1] - 1.1;
        if (corridorMin < corridorMax && (this.z < corridorMin || this.z > corridorMax)) {
          this.z = THREE.MathUtils.clamp(this.z, corridorMin, corridorMax);
          this.vz = 0;
        }
      }
    }

    // Checkpoint: when crossing a screen boundary in either direction,
    // register 4m past the strip as the respawn point (forward: past the
    // screen start edge; backward: past the far edge coming back).
    const prevK = Math.floor(-prevZ / SCREEN_LENGTH);
    const newK = Math.floor(-this.z / SCREEN_LENGTH);
    if (newK > prevK) {
      this.checkpointZ = -newK * SCREEN_LENGTH - 4;
    } else if (newK < prevK) {
      this.checkpointZ = -(newK + 1) * SCREEN_LENGTH + 4;
    }

    // Configure the underground shortcut only when Harry enters a ladder
    // screen from the surface. The prepared corridor remains unchanged while
    // he travels underground.
    if (!this.inTunnel && !this.climbing) {
      const screenType = world.getScreenType(newK);
      const isHole = screenType === 'HOLE_SINGLE' || screenType === 'HOLE_TRIPLE';
      if (isHole && this.lastSurfaceHoleScreen !== newK) {
        // Entered a new ladder screen — pre-configure the corridor immediately
        world.activateTunnelCorridor(newK);
        this.lastSurfaceHoleScreen = newK;
      } else if (!isHole && this.lastSurfaceHoleScreen !== null) {
        // Left the ladder screen zone — release the corridor
        world.deactivateTunnelCorridor();
        this.lastSurfaceHoleScreen = null;
      }
    }

    // Single action button: JUMP (or CLIMB the ladder in the tunnel)
    if (this.actionJustPressed) {
      this.actionJustPressed = false;
        // In the tunnel under a pit with a ladder: SPACE climbs back to the surface
      if (this.inTunnel && this.isGrounded) {
        const shaft = this.getLadderShaftAt(world, this.z, 1.6);
        if (shaft) {
          this.climbing = 'up';
          this.climbZ = shaft.centerZ;
          this.isGrounded = false;
          return;
        }
      }
      if (this.isGrounded) {
        this.vy = JUMP_VELOCITY;
        this.isGrounded = false;
        audio.playJump();
      }
    }

    // Gravity & Vertical physics
    if (!this.isGrounded) {
      this.vy -= GRAVITY * delta;
      this.y += this.vy * delta;
    }

    // Ground check & Crocodile snout stepping
    const standingSurfaceY = this.getSurfaceElevation(world, this.z);

    if (this.y <= standingSurfaceY) {
      if (standingSurfaceY > -5 || standingSurfaceY === TUNNEL_FLOOR_Y) {
        // Landed ON TOP of the cave ceiling slab: hit kill
        if (standingSurfaceY === CEIL_TOP_Y) {
          this.y = CEIL_TOP_Y;
          audio.playTrip();
          this.die(this.ceilDeathKey || 'death.cave');
          return;
        }
        // Landed safely on ground, crocodile snout or tunnel floor
        const fellFast = this.vy < -8;
        this.y = standingSurfaceY;
        this.vy = 0;
        this.isGrounded = true;
        // Landed in the tunnel (dropped from a pit with no ladder): mark the level
        if (standingSurfaceY === TUNNEL_FLOOR_Y) {
          this.inTunnel = true;
          // 8m fall: dull impact thud
          if (fellFast) audio.playGroundThud();
        }
        // Landed: the ignored vine becomes grabbable again.
        this.ignoredVine = null;
        // Landed from the respawn sky fall: dull impact thud.
        if (this.respawnDrop) {
          this.respawnDrop = false;
          audio.playGroundThud();
        }
      } else {
        // TEMP: fall death DISABLED — safety net: fell too deep
        // in a pit with no exit, return to checkpoint without losing a life.
        if (this.y < -25) {
          this.respawn(world);
          return;
        }
      }
    } else {
      this.isGrounded = false;
    }

    // Walked into a pit on foot: with a ladder grab and climb down; without a ladder drop
    // (jumping over avoids both — only climbs down/falls while walking on the ground).
    if (!this.inTunnel && !this.climbing && this.isGrounded && this.y < 0.2 && this.vy <= 0 && this.climbGrace <= 0) {
      const shaft = this.getLadderShaftAt(world, this.z, 0);
      if (shaft && Math.abs(this.z - shaft.centerZ) <= shaft.half) {
        this.climbing = 'down';
        // Enter tunnel state at the start of the descent so underground
        // barriers are active throughout the ladder transition.
        this.inTunnel = true;
        this.climbZ = shaft.centerZ;
        this.isGrounded = false;
        this.vz = 0;
        this.vy = 0;
        return;
      }
      const drop = this.getDropShaftAt(world, this.z);
      if (drop && Math.abs(this.z - drop.centerZ) <= drop.half) {
        // Hole without a ladder: drops straight into the tunnel (already below the rim
        // so it does not stick to the edge — physics takes over the fall from there).
        // Like the original, dropping down costs 100 points.
        this.isGrounded = false;
        this.z = drop.centerZ;
        this.vz = 0;
        this.y = -0.35;
        this.vy = -2;
        this.score = Math.max(0, this.score - 100);
        audio.playHoleFall();
        return;
      }
    }
  }

  // Pit WITH a ladder containing Z (extra margin on the edges)
  getLadderShaftAt(world, z, margin = 0) {
    if (!world.activeHazards) return null;
    for (const h of world.activeHazards) {
      if (h.type === 'ladder_shaft' && h.hasLadder && z >= h.minZ - margin && z <= h.maxZ + margin) {
        return h;
      }
    }
    return null;
  }

  // Pit WITHOUT a ladder containing Z (drops straight down)
  getDropShaftAt(world, z) {
    if (!world.activeHazards) return null;
    for (const h of world.activeHazards) {
      if (h.type === 'ladder_shaft' && !h.hasLadder && z >= h.minZ && z <= h.maxZ) {
        return h;
      }
    }
    return null;
  }

  // Find single crocodile that player is physically standing on or stepping over
  getCrocodileAt(world, z) {
    if (!world.activeCrocodiles || world.activeCrocodiles.length === 0) return null;
    let closest = null;
    let minDist = Infinity;
    for (const c of world.activeCrocodiles) {
      const d = Math.abs(z - c.z);
      if (d < minDist) {
        minDist = d;
        closest = c;
      }
    }
    // Only return if player is within this specific crocodile's physical bounds (-1.2 to +2.8)
    if (closest && z >= closest.z - 1.2 && z <= closest.z + 2.8) {
      return closest;
    }
    return null;
  }

  // Check if player is currently over any surface pit, lake, shaft, or quicksand
  isOverPit(world, z = this.z) {
    if (!world) return false;
    // Ladder shafts and straight drop shafts
    if (world.activeHazards) {
      for (const h of world.activeHazards) {
        if (h.type === 'ladder_shaft' && z <= h.maxZ && z >= h.minZ) return true;
        if (['quicksand', 'tarpit', 'water', 'log_exit_pit'].includes(h.type) && z <= h.maxZ && z >= h.minZ) return true;
      }
    }
    // Opening / disappearing quicksand pits
    if (world.activeOpeningPits) {
      for (const pitData of world.activeOpeningPits) {
        if (Math.abs(z - pitData.z) < pitData.radius) return true;
      }
    }
    return false;
  }

  // Determine surface elevation (ground or stepped hazard)
  getSurfaceElevation(world, z) {
    // In the tunnel, the dirt ground runs underneath everything on the surface
    if (this.inTunnel || this.y < -4) {
      // In the tunnel on screens... (continuous tunnel; outside it would be free fall)
      if (this.inTunnel) return TUNNEL_FLOOR_Y;
    }
    // Falling below the rim (y < -2.5): the cave ceiling slab is solid at CEIL_TOP_Y,
    // except at the pit holes (there keep falling down to the tunnel).
    if (!this.inTunnel && !this.climbing && this.y < -2.5 && this.y > TUNNEL_FLOOR_Y + 0.5) {
      const overShaft = this.getLadderShaftAt(world, z, 0) || this.getDropShaftAt(world, z);
      if (overShaft) return TUNNEL_FLOOR_Y;
      // Death reason depends on where it fell: lake/tar/quicksand = abyss
      this.ceilDeathKey = 'death.cave';
      for (const h of world.activeHazards) {
        if ((h.type === 'tarpit' || h.type === 'water' || h.type === 'quicksand') && z <= h.maxZ && z >= h.minZ) {
          this.ceilDeathKey = 'death.abyss';
          break;
        }
      }
      if (this.ceilDeathKey === 'death.cave' && world.activeOpeningPits) {
        for (const p of world.activeOpeningPits) {
          if (Math.abs(z - p.z) < p.radius && world.isQuicksandOpenAt(p, z)) {
            this.ceilDeathKey = 'death.abyss';
            break;
          }
        }
      }
      return CEIL_TOP_Y;
    }
    // Pit with/without a ladder: solid on the rim, once falling the ground is the tunnel.
    // (With a ladder the descent is via the animation; without a ladder drop straight down.)
    for (const hazard of world.activeHazards) {
      if (hazard.type === 'ladder_shaft' && z <= hazard.maxZ && z >= hazard.minZ) {
        return this.y < -0.3 ? TUNNEL_FLOOR_Y : 0.0;
      }
    }
    // Check if player is over a pit/pond hazard
    for (const hazard of world.activeHazards) {
      if (['quicksand', 'tarpit', 'water'].includes(hazard.type)) {
        if (z <= hazard.maxZ && z >= hazard.minZ) {
          // If it's water, check crocodile stepping zones!
          if (hazard.type === 'water') {
            const croc = this.getCrocodileAt(world, z);
            if (croc) {
              const isOnMouth = z > croc.z + 0.65;

              if (croc.isOpen && isOnMouth) {
                if (DEBUG_GOD_MODE) {
                   return 0.35; // Act as if mouth is closed, step on it safely
                }
                // Vine-release grace: step over the open mouth safely to land back on track.
                if (this.crocBiteGraceTimer > 0) {
                  return 0.35;
                }
                // Stepped directly into the open mouth!
                audio.playChomp();
                this.die('death.crocMouth');
                return -10;
              }

              // If on the eyes/skull (z <= croc.z + 0.65): 100% IMMUNE TO MOUTH!
              // If on closed snout (z > croc.z + 0.65 && !croc.isOpen): SAFE!
              return 0.35;
            }
          }
          
          // Water and tar have a shallow physical bottom, independent from the
          // underground tunnel. Reaching that bottom is still hit-kill.
          if (hazard.type === 'tarpit' || hazard.type === 'water') {
            if (!DEBUG_GOD_MODE && this.y <= PIT_FLOOR_Y) {
              audio.playSink();
              this.die('death.abyss');
            }
          }
          return PIT_FLOOR_Y;
        }
      }
    }

    // Check disappearing quicksand pits (each section is ground or abyss)
    if (world.activeOpeningPits) {
      for (const pitData of world.activeOpeningPits) {
        if (Math.abs(z - pitData.z) < pitData.radius) {
          if (world.isQuicksandOpenAt(pitData, z)) {
            // The section under the feet is open!
            if (!DEBUG_GOD_MODE && this.y <= PIT_FLOOR_Y) {
              audio.playSink();
              this.die('death.quicksand');
            }
            return PIT_FLOOR_Y;
          } else {
            // Closed section! Solid ground, safe to run!
            return 0.0;
          }
        }
      }
    }

    // Log exit pit (spikes): jump over it; falling inside is a hit kill.
    for (const hazard of world.activeHazards) {
      if (hazard.type === 'log_exit_pit' && z >= hazard.minZ && z <= hazard.maxZ) {
        if (this.y <= PIT_FLOOR_Y) {
          audio.playTrip();
          this.die('death.spikes');
        }
        return PIT_FLOOR_Y;
      }
    }

    // Normal solid ground
    return 0.0;
  }

  // Automatic vine grab when close in distance (only mid-air: must JUMP)
  checkVineGrab(world) {
    return new VineGrabCommand(this, world).execute();
  }

  // Update position while swinging on the vine
  updateAttachedVine(delta, world) {
    const v = this.attachedVine.vine;
    const tipPos = v.tip.getWorldPosition(_vineTip);

    this.z = tipPos.z;
    this.y = Math.max(0, tipPos.y - EYE_HEIGHT);

    // Single action button: RELEASE VINE (or transfer to the next one)!
    if (this.actionJustPressed) {
      this.actionJustPressed = false;
      // Vine-to-vine transfer: another vine within reach? Go straight to
      // it, with no flight in between. Otherwise, normal release with momentum.
      if (this.tryVineTransfer(world)) return;
      this.releaseVine();
      return;
    }

    // Camera update while on vine: add exciting swing pitch & roll!
    this.camera.position.set(0, this.y + EYE_HEIGHT, this.z);
    this.camera.rotation.x = -v.angle * 0.4;
    this.camera.rotation.z = -Math.sin(v.angle) * 0.05;

    // Arms reach up and grip vine knot
    if (this.arms) {
      this.arms.leftArm.position.set(-0.25, 0.15, -0.45);
      this.arms.rightArm.position.set(0.25, 0.15, -0.45);
      this.arms.leftArm.rotation.x = Math.PI / 2.2;
      this.arms.rightArm.rotation.x = Math.PI / 2.2;
      // Brown handle bar between the hands: illusion of holding the vine.
      if (this.arms.gripBar) this.arms.gripBar.visible = true;
    }
  }

  tryVineTransfer(world) {
    return new VineTransferCommand(this, world).execute();
  }

  releaseVine() {
    new VineReleaseCommand(this).execute();
  }

  checkCollisions(world) {
    return new CheckCollisionsCommand(this, world).execute();
  }

  // Arms and First-Person Camera Motion (see ./player/camera.js)
  updateArmsAndCamera(delta) {
    updateArmsAndCamera(this, delta);
  }

  die(reasonKey = 'death.lifeLost') {
    new DieCommand(this, reasonKey).execute();
  }

  respawn(world = null) {
    new RespawnCommand(this, world).execute();
  }

  triggerGameOver() {
    new GameOverCommand(this).execute();
  }

  reset() {
    new ResetCommand(this).execute();
  }
}
