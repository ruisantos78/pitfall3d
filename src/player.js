// Player Controller - 1st Person Perspective (FPS) for Atari Pitfall 3D
import * as THREE from 'three';
import { audio } from './audio.js';
import { createPlayerArmsModel } from './models.js';

export const GRAVITY = 28.0;
export const JUMP_VELOCITY = 10.5;
export const RUN_SPEED = 9.0;
export const EYE_HEIGHT = 2.2;

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

    // Vine grabbing state
    this.attachedVine = null; // { vine, centerZ, time }
    this.justReleasedVineTimer = 0;

    // Game stats
    this.score = 2000;
    this.lives = 3;
    this.timeRemaining = 1200; // 20:00 minutes in seconds
    this.treasuresCollected = 0;
    this.isGameOver = false;
    this.isDying = false;
    this.deathTimer = 0;
    this.tripCooldown = 0;

    // Head bobbing & arms
    this.bobTimer = 0;
    this.arms = createPlayerArmsModel();
    this.camera.add(this.arms.group);
    this.scene.add(this.camera);

    // Initial camera position
    this.camera.position.set(0, EYE_HEIGHT, this.z);
    this.camera.lookAt(0, EYE_HEIGHT, -100);

    this.bindInputs();
  }

  bindInputs() {
    window.addEventListener('keydown', (e) => {
      if (this.isGameOver) return;
      audio.init();

      if (e.code === 'KeyW' || e.code === 'ArrowUp') {
        this.moveForward = true;
      } else if (e.code === 'KeyS' || e.code === 'ArrowDown') {
        this.moveBackward = true;
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
      } else if (e.code === 'Space' || e.code === 'Enter') {
        this.actionPressed = false;
      }
    });

    // Mouse click as single action button (Jump / Release Vine)
    window.addEventListener('pointerdown', (e) => {
      if (this.isGameOver) return;
      // If clicking HUD buttons, don't trigger jump
      if (e.target.closest('button') || e.target.closest('#hud')) return;
      audio.init();
      this.actionJustPressed = true;
      this.actionPressed = true;
    });

    window.addEventListener('pointerup', () => {
      this.actionPressed = false;
    });

    // Touch controls setup
    const btnFwd = document.getElementById('btn-forward');
    const btnBwd = document.getElementById('btn-backward');
    const btnAct = document.getElementById('btn-action');

    if (btnFwd) {
      btnFwd.addEventListener('pointerdown', (e) => { e.preventDefault(); this.moveForward = true; });
      btnFwd.addEventListener('pointerup', (e) => { e.preventDefault(); this.moveForward = false; });
      btnFwd.addEventListener('pointerleave', () => { this.moveForward = false; });
    }
    if (btnBwd) {
      btnBwd.addEventListener('pointerdown', (e) => { e.preventDefault(); this.moveBackward = true; });
      btnBwd.addEventListener('pointerup', (e) => { e.preventDefault(); this.moveBackward = false; });
      btnBwd.addEventListener('pointerleave', () => { this.moveBackward = false; });
    }
    if (btnAct) {
      btnAct.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        audio.init();
        this.actionJustPressed = true;
        this.actionPressed = true;
      });
      btnAct.addEventListener('pointerup', (e) => {
        e.preventDefault();
        this.actionPressed = false;
      });
    }
  }

  // Update physics, movement, vine attachment, and collisions
  update(delta, world) {
    if (this.isGameOver) return;

    // Death / Respawn animation timer
    if (this.isDying) {
      this.deathTimer -= delta;
      this.camera.position.y = Math.max(0.2, this.camera.position.y - delta * 2.5);
      if (this.deathTimer <= 0) {
        this.respawn();
      }
      return;
    }

    // Cooldown timers
    if (this.tripCooldown > 0) this.tripCooldown -= delta;
    if (this.justReleasedVineTimer > 0) this.justReleasedVineTimer -= delta;

    // Decrement 20-minute countdown
    this.timeRemaining -= delta;
    if (this.timeRemaining <= 0) {
      this.timeRemaining = 0;
      this.die('Tempo esgotado!');
      return;
    }

    // State 1: ATTACHED TO VINE (Swinging over pit/crocodiles)
    if (this.attachedVine) {
      this.updateAttachedVine(delta);
      return;
    }

    // State 2: NORMAL 1D MOVEMENT & JUMPING
    this.updateNormalMovement(delta, world);

    // Check if standing on an opening crocodile snout (NOT on the eyes!)
    if (this.isGrounded && Math.abs(this.y - 0.35) < 0.25) {
      const croc = this.getCrocodileAt(world, this.z);
      // Only bite if on the FRONT MOUTH (Z > croc.z + 0.8). If on the eyes/skull, 100% IMMUNE!
      if (croc && croc.isOpen && this.z > croc.z + 0.8) {
        audio.playChomp();
        this.die('O jacaré abriu a boca e mordeu você! (Fique sobre os OLHOS para ficar seguro)');
        return;
      }
    }

    // Check if standing on disappearing quicksand opening beneath feet
    if (this.isGrounded && this.y <= 0.1 && world.activeOpeningPits) {
      for (const pitData of world.activeOpeningPits) {
        if (pitData.isOpen && Math.abs(this.z - pitData.z) < pitData.radius) {
          audio.playSink();
          this.die('A areia movediça se abriu sob seus pés!');
          return;
        }
      }
    }

    // Check automatic vine grab
    this.checkVineGrab(world);

    // Check collisions with hazards & collectibles
    this.checkCollisions(world);

    // Update First-Person Arms animation & Head Bobbing
    this.updateArmsAndCamera(delta);
  }

  updateNormalMovement(delta, world) {
    // Single axis: Forward (-Z) or Backward (+Z)
    let targetVz = 0;
    if (this.moveForward) targetVz -= RUN_SPEED;
    if (this.moveBackward) targetVz += RUN_SPEED;

    // Responsive arcade acceleration
    this.vz = THREE.MathUtils.lerp(this.vz, targetVz, delta * 15);
    this.z += this.vz * delta;

    // Single action button: JUMP
    if (this.actionJustPressed) {
      this.actionJustPressed = false;
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
      if (standingSurfaceY > -5) {
        // Landed safely on ground or crocodile snout
        this.y = standingSurfaceY;
        this.vy = 0;
        this.isGrounded = true;
      } else {
        // Fell into pit / water / quicksand!
        if (this.y < -1.2) {
          audio.playSink();
          this.die('Você afundou no abismo / areia movediça!');
          return;
        }
      }
    } else {
      this.isGrounded = false;
    }
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
    // Only return if player is within this specific crocodile's physical bounds (-3.3 to +3.9)
    if (closest && z >= closest.z - 3.3 && z <= closest.z + 3.9) {
      return closest;
    }
    return null;
  }

  // Determine surface elevation (ground or stepped hazard)
  getSurfaceElevation(world, z) {
    // Check if player is over a pit/pond hazard
    for (const hazard of world.activeHazards) {
      if (['quicksand', 'tarpit', 'water'].includes(hazard.type)) {
        if (z <= hazard.maxZ && z >= hazard.minZ) {
          // If it's water, check crocodile stepping zones!
          if (hazard.type === 'water') {
            const croc = this.getCrocodileAt(world, z);
            if (croc) {
              const isOnMouth = z > croc.z + 0.8;

              if (croc.isOpen && isOnMouth) {
                // Stepped directly into the open mouth!
                audio.playChomp();
                this.die('Mordido pela boca aberta do jacaré! (Fique sobre os OLHOS para ficar seguro)');
                return -10;
              }

              // If on the eyes/skull (z <= croc.z + 0.8): 100% IMMUNE TO MOUTH!
              // If on closed snout (z > croc.z + 0.8 && !croc.isOpen): SAFE!
              return 0.35;
            }
          }
          // No surface under feet -> drops into pit / water
          return -10;
        }
      }
    }

    // Check disappearing quicksand pits (opening & closing holes)
    if (world.activeOpeningPits) {
      for (const pitData of world.activeOpeningPits) {
        if (Math.abs(z - pitData.z) < pitData.radius) {
          if (pitData.isOpen) {
            // Pit is currently open!
            return -10;
          } else {
            // Pit is closed! Solid ground, safe to run across!
            return 0.0;
          }
        }
      }
    }

    // Normal solid ground
    return 0.0;
  }

  // Automatic vine grab when close in distance
  checkVineGrab(world) {
    if (this.justReleasedVineTimer > 0) return;
    const tipPos = new THREE.Vector3();

    for (const vineData of world.activeVines) {
      if (!vineData.vine.tip) continue;
      vineData.vine.tip.getWorldPosition(tipPos);

      // Distance check between player hands/chest and vine tip
      const distZ = Math.abs(this.z - tipPos.z);
      const distY = Math.abs((this.y + EYE_HEIGHT) - tipPos.y);

      // Grab automatically when near the vine!
      if (distZ < 1.9 && distY < 2.4) {
        this.attachedVine = vineData;
        this.isGrounded = false;
        this.vy = 0;
        this.vz = 0;
        audio.playTarzanYell();

        // Show HUD prompt
        const prompt = document.getElementById('vine-prompt');
        if (prompt) prompt.classList.add('active');
        break;
      }
    }
  }

  // Update position while swinging on the vine
  updateAttachedVine(delta) {
    const v = this.attachedVine.vine;
    const tipPos = new THREE.Vector3();
    v.tip.getWorldPosition(tipPos);

    this.z = tipPos.z;
    this.y = Math.max(0, tipPos.y - EYE_HEIGHT);

    // Single action button: RELEASE VINE!
    if (this.actionJustPressed) {
      this.actionJustPressed = false;
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
    }
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
    this.justReleasedVineTimer = 0.9;
    this.attachedVine = null;

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
        const distZ = Math.abs(this.z - hazard.z);
        // If close and not jumping high enough
        if (distZ < 1.0 && this.y < 0.75) {
          if (this.tripCooldown <= 0) {
            this.tripCooldown = 1.0;
            this.score = Math.max(0, this.score - 100);
            audio.playTrip();
            // Stumble bump backward slightly
            this.vz = 4.0;
          }
        }
      } else if (hazard.type === 'fire') {
        // Campfire: deadly if walking into it without jumping
        const distZ = Math.abs(this.z - hazard.z);
        if (distZ < 1.1 && this.y < 0.9) {
          audio.playTrip();
          this.die('Queimado pela fogueira!');
          return;
        }
      } else if (hazard.type === 'scorpion') {
        // Scorpion: deadly if touching without jumping
        const distZ = Math.abs(this.z - hazard.z);
        if (distZ < 1.1 && this.y < 0.75) {
          audio.playTrip();
          this.die('Picado por um escorpião venenoso!');
          return;
        }
      }
    }

    // 2. Treasures
    for (const treasure of world.activeTreasures) {
      if (!treasure.collected) {
        const distZ = Math.abs(this.z - treasure.z);
        if (distZ < 1.4) {
          treasure.collected = true;
          world.scene.remove(treasure.mesh);
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

    // Head bobbing calculation
    let bobY = 0;
    let bobPitch = 0;

    if (isMoving && this.isGrounded) {
      this.bobTimer += delta * 12;
      bobY = Math.sin(this.bobTimer) * 0.05;
      bobPitch = Math.sin(this.bobTimer) * 0.015;

      // Subtle footstep sound
      if (Math.sin(this.bobTimer) < -0.95 && Math.random() < 0.15) {
        audio.playStep();
      }
    } else {
      this.bobTimer = 0;
    }

    // Camera position & rotation (slight natural tilt towards the trail ahead)
    this.camera.position.set(0, this.y + EYE_HEIGHT + bobY, this.z);
    this.camera.rotation.x = -0.04 + bobPitch;
    this.camera.rotation.z = 0;
    this.camera.rotation.y = 0; // Strict forward orientation down corridor

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

  die(reason = 'Você perdeu uma vida!') {
    if (this.isDying || this.isGameOver) return;
    this.isDying = true;
    this.deathTimer = 1.2;
    this.lives--;

    // Detach from vine if attached
    if (this.attachedVine) {
      this.attachedVine = null;
      const prompt = document.getElementById('vine-prompt');
      if (prompt) prompt.classList.remove('active');
    }

    if (this.lives <= 0) {
      this.lives = 0;
      this.isGameOver = true;
      audio.playGameOver();
      setTimeout(() => {
        this.triggerGameOver(reason);
      }, 1000);
    } else {
      audio.playLifeLost();
    }
  }

  respawn() {
    this.isDying = false;
    this.y = 0;
    this.vy = 0;
    this.vz = 0;
    this.isGrounded = true;

    // Safe respawn position: back up 8 units to safe ground
    this.z += 8;
    this.camera.position.set(0, EYE_HEIGHT, this.z);
  }

  triggerGameOver(reason) {
    const overlay = document.getElementById('gameover-overlay');
    const reasonText = document.getElementById('gameover-reason');
    const finalScore = document.getElementById('final-score');
    const finalScreens = document.getElementById('final-screens');
    const finalTreasures = document.getElementById('final-treasures');

    if (overlay) overlay.classList.remove('hidden');
    if (reasonText) reasonText.textContent = reason;
    if (finalScore) finalScore.textContent = String(this.score).padStart(6, '0');
    if (finalScreens) finalScreens.textContent = Math.floor(Math.abs(this.z) / 60) + 1;
    if (finalTreasures) finalTreasures.textContent = `${this.treasuresCollected}`;
  }

  reset() {
    this.z = 0;
    this.y = 0;
    this.vy = 0;
    this.vz = 0;
    this.isGrounded = true;
    this.score = 2000;
    this.lives = 3;
    this.timeRemaining = 1200;
    this.treasuresCollected = 0;
    this.isGameOver = false;
    this.isDying = false;
    this.deathTimer = 0;
    this.attachedVine = null;
    this.tripCooldown = 0;

    const prompt = document.getElementById('vine-prompt');
    if (prompt) prompt.classList.remove('active');

    const overlay = document.getElementById('gameover-overlay');
    if (overlay) overlay.classList.add('hidden');
  }
}
