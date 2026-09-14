// Player Controller - 1st Person Perspective (FPS) for Atari Pitfall 3D
import * as THREE from 'three';
import { audio } from './audio.js';
import { SCREEN_LENGTH, TUNNEL_FLOOR_Y, CEIL_TOP_Y } from './world.js';
import { createPlayerArmsModel } from './models.js';
import { t, getHighScore, getShowHelp, submitScore } from './i18n.js';

// DEBUG GOD MODE: Enables infinite lives and bypasses hazard kill boxes (croc, snake, fire, scorpions, logs).
export const DEBUG_GOD_MODE = false;

export const GRAVITY = 28.0;
export const JUMP_VELOCITY = 10.5;
export const RUN_SPEED = 9.0;
export const EYE_HEIGHT = 2.2;
// Underground shortcut pace: Harry runs 1.5x faster in the tunnel (jumping
// stays enabled — it is the only way past scorpions).
export const TUNNEL_SPEED_MULT = 2.0;
// Grace period after releasing a vine during which an open crocodile mouth
// cannot kill (enough time to clear the last croc and land back on track).
export const CROC_BITE_GRACE_DURATION = 1.0;

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
        this.moveForward = true;
      } else if (e.code === 'KeyS' || e.code === 'ArrowDown') {
        if (this.touchOnly) return;
        this.moveBackward = true;
      } else if (e.code === 'KeyA' || e.code === 'ArrowLeft' || e.code === 'KeyD' || e.code === 'ArrowRight') {
        if (this.touchOnly) return;
        if (!this.turnJustPressed) {
          this.targetRotY = this.targetRotY === 0 ? Math.PI : 0;
          this.turnJustPressed = true;
        }
      } else if (e.code === 'Space' || e.code === 'Enter') {
        if (!this.actionPressed) {
          this.actionJustPressed = true;
        }
        this.actionPressed = true;
      }
    });

    window.addEventListener('keyup', (e) => {
      if (e.code === 'KeyW' || e.code === 'ArrowUp') {
        this.moveForward = false;
      } else if (e.code === 'KeyS' || e.code === 'ArrowDown') {
        this.moveBackward = false;
      } else if (e.code === 'KeyA' || e.code === 'ArrowLeft' || e.code === 'KeyD' || e.code === 'ArrowRight') {
        this.turnJustPressed = false;
      } else if (e.code === 'Space' || e.code === 'Enter') {
        this.actionPressed = false;
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
      audio.init();
      if (!this.actionPressed) {
        this.actionJustPressed = true;
      }
      this.actionPressed = true;
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button !== 0) return;
      if (this.touchOnly) return;
      this.actionPressed = false;
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

    const bindDirectionButton = (button, direction) => {
      if (!button) return;
      const setPressed = (pressed, event) => {
        event?.preventDefault();
        this[direction] = pressed;
      };
      button.addEventListener('pointerdown', (e) => {
        button.setPointerCapture?.(e.pointerId);
        setPressed(true, e);
      });
      ['pointerup', 'pointercancel', 'lostpointercapture', 'pointerleave'].forEach((eventName) => {
        button.addEventListener(eventName, (e) => setPressed(false, e));
      });
    };

    bindDirectionButton(btnFwd, 'moveForward');
    bindDirectionButton(btnBwd, 'moveBackward');
    if (btnAct) {
      btnAct.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        btnAct.setPointerCapture?.(e.pointerId);
        audio.init();
        this.actionJustPressed = true;
        this.actionPressed = true;
      });
      ['pointerup', 'pointercancel', 'lostpointercapture', 'pointerleave'].forEach((eventName) => {
        btnAct.addEventListener(eventName, (e) => {
          e.preventDefault();
          this.actionPressed = false;
        });
      });
    }
    // Touch turn-around button (same 180° spin as the A/D / arrow keys).
    if (btnTurn) {
      btnTurn.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        audio.init();
        this.targetRotY = this.targetRotY === 0 ? Math.PI : 0;
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
      audio.init();
      this.actionJustPressed = true;
    }
    this.padPrevAction = actionHeld;
    const turnHeld = pressed(2) || pressed(3) || pressed(4) || pressed(14) || pressed(15);
    if (turnHeld && !this.padPrevTurn) {
      audio.init();
      this.targetRotY = this.targetRotY === 0 ? Math.PI : 0;
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
        // Exited the tunnel on top of the pit: 1s to get clear before climbing back down
        if (!this.inTunnel) this.climbGrace = 1.0;
        audio.playGroundThud();
      } else {
        this.isGrounded = false;
      }
      this.camera.position.set(0, this.y + EYE_HEIGHT, this.z);
      return;
    }
    if (this.climbGrace > 0) this.climbGrace -= delta;

    // After tripping, stays face-down on the ground until the player presses a
    // direction or the jump button. The direction that picks him up also resumes
    // walking; jump only picks him up (jumping itself needs a fresh press).
    if (this.isTripped) {
      this.vz = 0;
      this.vy = 0;
      const jumpPressed = this.actionJustPressed;
      this.actionJustPressed = false;

      const standingSurfaceY = this.getSurfaceElevation(world, this.z);
      if (standingSurfaceY > -5) {
        this.y = standingSurfaceY;
        this.isGrounded = true;
      }

      // Jump button picks him up instantly (single tap, no hold delay)
      if (jumpPressed) {
        this.isTripped = false;
        this.tripStandTimer = 0;
        return;
      }

      if (!this.moveForward && !this.moveBackward && !this.padForward && !this.padBackward) {
        this.tripStandTimer = 0;
        return;
      }

      this.tripStandTimer += delta;
      if (this.tripStandTimer < this.TRIP_STAND_DELAY) {
        return;
      }

      this.isTripped = false;
      this.tripStandTimer = 0;
    }

    // Movement is relative to camera facing (this.targetRotY)
    let targetVz = 0;
    // 0 = face -Z (dir = -1), Math.PI = face +Z (dir = 1)
    const dir = this.targetRotY === Math.PI ? 1 : -1;
    // Underground shortcut pace (2x); surface pace otherwise.
    const pace = this.inTunnel ? RUN_SPEED * TUNNEL_SPEED_MULT : RUN_SPEED;

    if (this.moveForward || this.padForward) targetVz += pace * dir;
    if (this.moveBackward || this.padBackward) targetVz -= pace * dir;

    // Responsive arcade acceleration
    this.vz = THREE.MathUtils.lerp(this.vz, targetVz, delta * 15);
    const prevZ = this.z;
    this.z += this.vz * delta;

    // No barrier at the starting edge: the 255-screen map loops in both
    // directions, so walking behind z = 0 enters screen -1 (phase 255).

    // Tunnel brick walls (authentic dead ends): solid 1m planes, block
    // passage in both directions (0.6m body clearance each side).
    if (this.inTunnel && world.activeTunnelWalls) {
      for (const wl of world.activeTunnelWalls) {
        const lo = wl.z - 1.1;
        const hi = wl.z + 1.1;
        if (prevZ >= hi && this.z < hi) {
          this.z = hi;
          this.vz = 0;
        } else if (prevZ <= lo && this.z > lo) {
          this.z = lo;
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
      if (shaft && Math.abs(this.z - shaft.centerZ) < shaft.half - 0.5) {
        this.climbing = 'down';
        this.climbZ = shaft.centerZ;
        this.isGrounded = false;
        this.vz = 0;
        this.vy = 0;
        return;
      }
      const drop = this.getDropShaftAt(world, this.z);
      if (drop && Math.abs(this.z - drop.centerZ) < drop.half - 0.5) {
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
          
          // Water and tar are lethal on contact; no physical shaft is needed.
          if (hazard.type === 'tarpit' || hazard.type === 'water') {
            if (!DEBUG_GOD_MODE && this.y <= -10) {
              audio.playSink();
              this.die('death.abyss');
            }
          }
          // No surface under feet for airborne movement.
          return -10;
        }
      }
    }

    // Check disappearing quicksand pits (each section is ground or abyss)
    if (world.activeOpeningPits) {
      for (const pitData of world.activeOpeningPits) {
        if (Math.abs(z - pitData.z) < pitData.radius) {
          if (world.isQuicksandOpenAt(pitData, z)) {
            // The section under the feet is open!
            return -10;
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
        if (this.y < -0.3) {
          audio.playTrip();
          this.die('death.spikes');
        }
        return -10;
      }
    }

    // Normal solid ground
    return 0.0;
  }

  // Automatic vine grab when close in distance (only mid-air: must JUMP)
  checkVineGrab(world) {
    if (this.justReleasedVineTimer > 0) return;
    // Standing still on the ground never grabs: the vine hangs high on purpose.
    if (this.isGrounded) return;
    // In the tunnel there are no vines within reach.
    if (this.inTunnel || this.y < -2) return;
    const tipPos = new THREE.Vector3();

    for (const vineData of world.activeVines) {
      if (!vineData.vine.tip) continue;
      // Never re-grab the vine just released (only cleared on landing
      // or grabbing another vine): keeps the flight gap to the next vine.
      if (vineData === this.ignoredVine) continue;
      vineData.vine.tip.getWorldPosition(tipPos);

      // Distance check between player hands/chest and vine tip
      const distZ = Math.abs(this.z - tipPos.z);
      const distY = Math.abs((this.y + EYE_HEIGHT) - tipPos.y);

      // Grab automatically when near the vine (generous Z window to
      // compensate for the fast tip swing)!
      if (distZ < 2.2 && distY < 2.4) {
        this.attachedVine = vineData;
        this.ignoredVine = null;
        this.isGrounded = false;
        this.vy = 0;
        this.vz = 0;
        audio.playTarzanYell();

        // Show HUD prompt (only with on-screen help enabled)
        if (getShowHelp()) {
          const prompt = document.getElementById('vine-prompt');
          if (prompt) prompt.classList.add('active');
        }
        break;
      }
    }
  }

  // Update position while swinging on the vine
  updateAttachedVine(delta, world) {
    const v = this.attachedVine.vine;
    const tipPos = new THREE.Vector3();
    v.tip.getWorldPosition(tipPos);

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

  // Vine-to-vine transfer: pressing jump while another vine's tip is right
  // there swings straight onto it (no flight in between). Returns true when
  // the transfer happened.
  tryVineTransfer(world) {
    if (!world || !world.activeVines) return false;
    const tipPos = new THREE.Vector3();
    let best = null;
    let bestDist = Infinity;
    for (const vineData of world.activeVines) {
      if (vineData === this.attachedVine) continue;
      // The vine just released does not count (otherwise the jump would never truly let go);
      // any OTHER nearby vine is the "next vine".
      if (vineData === this.ignoredVine) continue;
      if (!vineData.vine.tip) continue;
      vineData.vine.tip.getWorldPosition(tipPos);
      const distZ = Math.abs(this.z - tipPos.z);
      const distY = Math.abs((this.y + EYE_HEIGHT) - tipPos.y);
      if (distZ < 3.5 && distY < 3.0) {
        const d = distZ + distY;
        if (d < bestDist) {
          bestDist = d;
          best = vineData;
        }
      }
    }
    if (!best) return false;
    this.ignoredVine = this.attachedVine;
    this.attachedVine = best;
    this.vy = 0;
    this.vz = 0;
    audio.playTarzanYell();
    return true;
  }

  // Release vine with swing momentum
  releaseVine() {
    const v = this.attachedVine.vine;
    // Calculate tangential swing velocity: d(tipZ)/dt = -L * cos(angle) * omega
    const omega = v.maxAngle * v.speed * Math.cos(this.attachedVine.time);
    const swingVz = -v.length * Math.cos(v.angle) * omega;

    // Launch player forward/backward based on swing velocity
    if (swingVz < 0) {
      // Swinging forward: give healthy forward arc to clear pit easily
      this.vz = Math.min(swingVz * 1.3, -11.0);
    } else {
      this.vz = THREE.MathUtils.clamp(swingVz * 1.2, -16, 16);
    }
    this.vy = 5.2; // nice jumping arc
    this.isGrounded = false;
    // Short re-grab lockout: long enough to clear the released vine's tip
    // (~3.8m away at 11 m/s), short enough to allow vine-to-vine mid-air
    // transfers on the double-vine crocodile screens.
    this.justReleasedVineTimer = 0.35;
    // Open croc mouths cannot kill for a short while: time to clear the last
    // crocodile and land back on the track even if its mouth is open.
    this.crocBiteGraceTimer = CROC_BITE_GRACE_DURATION;
    // The released vine stays ignored until landing: the post-release flight never
    // re-grabs the SAME vine, only the next one.
    this.ignoredVine = this.attachedVine;
    this.attachedVine = null;
    // Hands off the vine: hide the grip bar right away.
    if (this.arms && this.arms.gripBar) this.arms.gripBar.visible = false;

    audio.playRelease();

    // Hide HUD prompt
    const prompt = document.getElementById('vine-prompt');
    if (prompt) prompt.classList.remove('active');
  }

  // Check collision with hazards and collectibles
  checkCollisions(world) {
    // 1. Logs (Stationary & Rolling)
    for (const hazard of world.activeHazards) {
      if (hazard.type === 'log' || hazard.type === 'rolling_log') {
        if (DEBUG_GOD_MODE) continue;
        // Log falling from the sky, in the pit, or waiting its turn (invisible) — no collision
        if (hazard.falling || hazard.fallingIntoPit || hazard.waiting) continue;
        const distZ = Math.abs(this.z - hazard.z);
        // Surface log doesn't hit the player 8m below in the tunnel
        if (Math.abs(this.y - 0.45) > 3) continue;
        // If close and not jumping high enough
        if (distZ < 1.0 && this.y < 0.75) {
          if (this.tripCooldown <= 0) {
            this.tripCooldown = 0.6;
            this.isTripped = true;
            this.tripStandTimer = 0;
            // Push Harry slightly past the log to avoid an immediate re-collision when he gets up.
            this.z = hazard.z - 1.5;
            this.score = Math.max(0, this.score - 100);
            audio.playTrip();
            // Stop walking and require a fresh direction input to stand up.
            this.vz = 0;
            this.moveForward = false;
            this.moveBackward = false;
          }
        }
      } else if (hazard.type === 'fire') {
        if (DEBUG_GOD_MODE) continue;
        // Campfire: deadly if walking into it without jumping (same level only)
        const distZ = Math.abs(this.z - hazard.z);
        if (distZ < 1.1 && Math.abs(this.y) < 0.9) {
          audio.playTrip();
          this.die('death.fire');
          return;
        }
      } else if (hazard.type === 'scorpion') {
        if (DEBUG_GOD_MODE) continue;
        // Scorpion: deadly if touching without jumping (same level only)
        const distZ = Math.abs(this.z - hazard.z);
        const hy = hazard.baseY ?? 0.08;
        if (distZ < 1.1 && Math.abs(this.y - hy) < 0.9) {
          audio.playTrip();
          this.die('death.scorpion');
          return;
        }
      }
    }

    // 2. Treasures
    for (const treasure of world.activeTreasures) {
      if (!treasure.collected) {
        const distZ = Math.abs(this.z - treasure.z);
        // Only collect on the same level (not through the floor to the tunnel)
        if (distZ < 1.4 && Math.abs(this.y - treasure.mesh.position.y) < 2) {
          treasure.collected = true;
          // The treasure belongs to the screen group, not directly to the scene.
          treasure.mesh.removeFromParent();
          // Authentic treasureBits: mark the (phase, kind) slot as claimed so it
          // never respawns on revisits (world.resetRun() clears it on restart).
          world.claimTreasureSlot(treasure);
          this.score += treasure.points;
          this.treasuresCollected++;
          audio.playTreasure();
        }
      }
    }
  }

  // Arms and First-Person Camera Motion
  updateArmsAndCamera(delta) {
    const isMoving = Math.abs(this.vz) > 0.5;
    const isTripped = this.isTripped;

    // Off the vine: hide the grip bar (only shown while swinging).
    if (this.arms && this.arms.gripBar) this.arms.gripBar.visible = false;

    // Face-plant: player trips and hands splay flat on the ground
    if (isTripped) {
      // Keep the camera higher so the arms don't clip through the floor
      const targetY = this.y + 1.2; 
      this.camera.position.set(0, THREE.MathUtils.lerp(this.camera.position.y, targetY, delta * 8), this.z);
      // Camera looks down at the ground
      this.camera.rotation.x = THREE.MathUtils.lerp(this.camera.rotation.x, -0.8, delta * 6);
      this.camera.rotation.z = 0;
      this.camera.rotation.y = 0;
      if (this.arms) {
        // Arms stretched firmly forward to brace the fall
        // Raised position (-0.1) to simulate hands touching the ground
        this.arms.leftArm.position.set(-0.32, -0.1, -0.7);
        this.arms.rightArm.position.set(0.32, -0.1, -0.7);
        // Straight rotation to support the hands
        this.arms.leftArm.rotation.x = Math.PI / 2.5;
        this.arms.rightArm.rotation.x = Math.PI / 2.5;
      }
      return;
    }

    // Head bobbing calculation
    let bobY = 0;
    let bobPitch = 0;

    if (isMoving && this.isGrounded) {
      this.bobTimer += delta * 12;
      bobY = Math.sin(this.bobTimer) * 0.05;
      bobPitch = Math.sin(this.bobTimer) * 0.015;

      // Footstep on every stride (each zero crossing of the bob cycle).
      const bobSin = Math.sin(this.bobTimer);
      if (
        this.lastBobSin !== undefined &&
        ((this.lastBobSin >= 0 && bobSin < 0) || (this.lastBobSin < 0 && bobSin >= 0))
      ) {
        audio.playStep();
      }
      this.lastBobSin = bobSin;
    } else {
      this.bobTimer = 0;
      this.lastBobSin = 0;
    }

    // Camera position & rotation (slight natural tilt towards the trail ahead)
    const targetCameraY = this.y + EYE_HEIGHT + bobY;
    this.camera.position.set(0, THREE.MathUtils.lerp(this.camera.position.y, targetCameraY, delta * 12), this.z);
    this.camera.rotation.x = THREE.MathUtils.lerp(this.camera.rotation.x, -0.04 + bobPitch, delta * 12);
    this.camera.rotation.z = 0;

    // Ensure targetRotY is initialized
    if (this.targetRotY === undefined) {
      this.targetRotY = 0;
    }

    // Smooth 180 degree spin
    this.camera.rotation.y = THREE.MathUtils.lerp(this.camera.rotation.y, this.targetRotY, delta * 15);

    // Arms animations
    if (this.arms) {
      if (!this.isGrounded) {
        // Arms raised slightly in jump
        this.arms.leftArm.position.set(-0.35, -0.15, -0.55);
        this.arms.rightArm.position.set(0.35, -0.15, -0.55);
        this.arms.leftArm.rotation.x = Math.PI / 3;
        this.arms.rightArm.rotation.x = Math.PI / 3;
      } else if (isMoving) {
        // Running arm swing
        const armSwing = Math.sin(this.bobTimer) * 0.35;
        this.arms.leftArm.position.set(-0.35, -0.3 + bobY, -0.6);
        this.arms.rightArm.position.set(0.35, -0.3 + bobY, -0.6);
        this.arms.leftArm.rotation.x = Math.PI / 4 + armSwing;
        this.arms.rightArm.rotation.x = Math.PI / 4 - armSwing;
      } else {
        // Idle breathing
        const breathe = Math.sin(Date.now() * 0.003) * 0.015;
        this.arms.leftArm.position.set(-0.35, -0.3 + breathe, -0.6);
        this.arms.rightArm.position.set(0.35, -0.3 + breathe, -0.6);
        this.arms.leftArm.rotation.x = Math.PI / 4;
        this.arms.rightArm.rotation.x = Math.PI / 4;
      }
    }
  }

  die(reasonKey = 'death.lifeLost') {
    if (this.isDying || this.isGameOver) return;
    this.isDying = true;
    
    if (DEBUG_GOD_MODE) {
      // In God Mode, just respawn quickly without losing lives
      this.deathTimer = 0.5;
    } else {
      this.deathTimer = 1.2;
      this.lives--;
    }
    
    this.deathReasonKey = reasonKey;
    this.diedInTunnel = this.inTunnel;
    this.crocBiteGraceTimer = 0;

    // Fade to black on death
    const fade = document.getElementById('death-fade');
    if (fade) fade.classList.add('on');

    // Detach from vine if attached
    if (this.attachedVine) {
      this.attachedVine = null;
      this.ignoredVine = null;
      if (this.arms && this.arms.gripBar) this.arms.gripBar.visible = false;
      const prompt = document.getElementById('vine-prompt');
      if (prompt) prompt.classList.remove('active');
    }

    if (this.lives <= 0) {
      this.lives = 0;
      this.isGameOver = true;
      audio.playGameOver();
      setTimeout(() => {
        this.triggerGameOver();
      }, 1000);
    } else {
      audio.playLifeLost();
    }
  }

  // Safe ground check for respawn (pure, no side-effects: never calls die()).
  // Returns false over water / tar / log-exit pit / ladder shaft / opening quicksand.
  isRespawnGroundSafe(world, z) {
    for (const hazard of world.activeHazards) {
      if (['quicksand', 'tarpit', 'water', 'ladder_shaft'].includes(hazard.type)) {
        if (z <= hazard.maxZ && z >= hazard.minZ) return false;
      } else if (hazard.type === 'log_exit_pit') {
        if (z >= hazard.minZ - 1 && z <= hazard.maxZ + 1) return false;
      }
    }
    if (world.activeOpeningPits) {
      for (const pitData of world.activeOpeningPits) {
        if (Math.abs(z - pitData.z) < pitData.radius + 1) return false;
      }
    }
    return true;
  }

  // Minimum clearance from physical hazards (stationary/rolling logs, fire, scorpion).
  isRespawnClearOfHazards(world, z) {
    for (const hazard of world.activeHazards) {
      // Hazard on a different level (tunnel scorpion) doesn't block surface respawn
      const hy = hazard.baseY ?? 0;
      if (Math.abs(hy) > 3) continue;
      if (hazard.type === 'rolling_log') {
        if (Math.abs(z - hazard.z) < 4.0) return false;
      } else if (hazard.type === 'log' || hazard.type === 'fire' || hazard.type === 'scorpion') {
        if (Math.abs(z - hazard.z) < 2.8) return false;
      }
    }
    return true;
  }

  // Tunnel respawn clearance: away from patrolling scorpions and brick dead-ends.
  isTunnelRespawnClear(world, z) {
    for (const hazard of world.activeHazards) {
      if (hazard.type === 'scorpion') {
        const hz = hazard.mesh ? hazard.mesh.position.z : hazard.baseZ;
        if (Math.abs(z - hz) < 4) return false;
      }
    }
    if (world.activeTunnelWalls) {
      for (const wl of world.activeTunnelWalls) {
        if (Math.abs(z - wl.z) < 2.5) return false;
      }
    }
    return true;
  }

  // Find a safe tunnel Z near the death spot.
  findSafeTunnelRespawnZ(world, baseZ) {
    const candidates = [baseZ, baseZ - 4, baseZ + 4, baseZ - 8, baseZ + 8,
      baseZ - 12, baseZ + 12];
    for (const c of candidates) {
      if (this.isTunnelRespawnClear(world, c)) return c;
    }
    return baseZ;
  }

  // Find a safe Z near the base: never under a falling log drop point.
  findSafeRespawnZ(world, baseZ, screenIndex) {
    const screenStartZ = -screenIndex * SCREEN_LENGTH;
    const screenEndZ = -(screenIndex + 1) * SCREEN_LENGTH;
    const minZ = screenEndZ + 2;
    const maxZ = screenStartZ + 10;
    const candidates = [baseZ, baseZ - 4, baseZ + 4, baseZ - 8, baseZ + 8,
      baseZ - 12, baseZ + 12, baseZ - 16, baseZ + 16, baseZ - 20, baseZ + 20];
    for (const c of candidates) {
      const z = THREE.MathUtils.clamp(c, minZ, maxZ);
      if (this.isRespawnGroundSafe(world, z) && this.isRespawnClearOfHazards(world, z)) {
        return z;
      }
    }
    // Fallback: stay at base even if everything is occupied (prevents game lockup).
    return THREE.MathUtils.clamp(baseZ, minZ, maxZ);
  }

  respawn(world = null) {
    this.isDying = false;
    // Fade in on respawn
    const fade = document.getElementById('death-fade');
    if (fade) fade.classList.remove('on');
    this.vy = 0;
    this.vz = 0;
    this.isGrounded = false;
    this.isTripped = false;
    this.tripStandTimer = 0;
    this.tripCooldown = 0;
    // Scorpion death underground: respawn stays in the tunnel.
    // Everything else respawns on the surface.
    const tunnelRespawn = !!(world && this.deathReasonKey === 'death.scorpion' && this.diedInTunnel);
    this.diedInTunnel = false;
    this.inTunnel = tunnelRespawn;
    this.climbing = null;
    this.climbGrace = 0;
    this.crocBiteGraceTimer = 0;

    // Respawn at the last checkpoint (last boundary strip crossed); if no checkpoint,
    // at the start of the screen where the player died (forward = -Z, start = +Z edge).
    if (world) {
      if (tunnelRespawn) {
        this.z = this.findSafeTunnelRespawnZ(world, this.z);
      } else {
        let baseZ;
        if (this.checkpointZ !== null) {
          baseZ = this.checkpointZ;
        } else {
          const screenIndex = Math.floor(-this.z / SCREEN_LENGTH);
          baseZ = -screenIndex * SCREEN_LENGTH + 6;
        }
        const screenIndex = Math.floor(-baseZ / SCREEN_LENGTH);
        // Steer clear of logs and other hazards: never spawns under a falling log
        // or on top of a pit / opening quicksand.
        this.z = this.findSafeRespawnZ(world, baseZ, screenIndex);
      }
    } else {
      // Fallback: move back 8 units
      this.z += 8;
    }
    if (tunnelRespawn) {
      // Short drop back to the tunnel floor.
      this.y = TUNNEL_FLOOR_Y + 2;
    } else {
      // Drop from the sky like the original: spawns high up and gravity does the rest.
      this.y = this.RESPAWN_DROP_HEIGHT;
    }
    this.respawnDrop = true;
    // Keep the facing direction from before death (no forced turn-around).
    if (this.targetRotY === undefined) this.targetRotY = 0;
    this.camera.rotation.y = this.targetRotY;
    this.camera.position.set(0, this.y + EYE_HEIGHT, this.z);
  }

  triggerGameOver() {
    const overlay = document.getElementById('gameover-overlay');
    const reasonText = document.getElementById('gameover-reason');
    const finalScore = document.getElementById('final-score');
    const finalScreens = document.getElementById('final-screens');
    const finalTreasures = document.getElementById('final-treasures');
    const newRecordEl = document.getElementById('new-record');
    const finalHighscore = document.getElementById('final-highscore');

    // High score persisted in the browser (only recorded at game over — arcade standard)
    const isNewRecord = submitScore(this.score);

    if (overlay) overlay.classList.remove('hidden');
    if (reasonText) reasonText.textContent = t(this.deathReasonKey || 'death.lifeLost');
    if (newRecordEl) newRecordEl.classList.toggle('hidden', !isNewRecord);
    if (finalHighscore) finalHighscore.textContent = String(getHighScore()).padStart(6, '0');
    if (finalScore) finalScore.textContent = String(this.score).padStart(6, '0');
    if (finalScreens) finalScreens.textContent = Math.floor(Math.abs(this.z) / 60) + 1;
    if (finalTreasures) finalTreasures.textContent = `${this.treasuresCollected}`;
  }

  reset() {
    this.z = 0;
    this.y = 0;
    this.vy = 0;
    this.vz = 0;
    this.targetRotY = 0;
    this.camera.rotation.y = 0;
    this.isGrounded = true;
    this.score = 2000;
    this.lives = 3;
    this.timeRemaining = 1200;
    this.treasuresCollected = 0;
    this.isGameOver = false;
    this.isDying = false;
    this.deathTimer = 0;
    this.deathReasonKey = 'death.lifeLost';
    this.attachedVine = null;
    this.ignoredVine = null;
    this.crocBiteGraceTimer = 0;
    if (this.arms && this.arms.gripBar) this.arms.gripBar.visible = false;
    this.tripCooldown = 0;
    this.isTripped = false;
    this.tripStandTimer = 0;
    this.respawnDrop = false;

    const prompt = document.getElementById('vine-prompt');
    if (prompt) prompt.classList.remove('active');

    const overlay = document.getElementById('gameover-overlay');
    if (overlay) overlay.classList.add('hidden');

    const fade = document.getElementById('death-fade');
    if (fade) fade.classList.remove('on');
  }
}
