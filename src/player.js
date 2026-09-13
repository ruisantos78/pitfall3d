// Player Controller - 1st Person Perspective (FPS) for Atari Pitfall 3D
import * as THREE from 'three';
import { audio } from './audio.js';
import { SCREEN_LENGTH } from './world.js';
import { createPlayerArmsModel } from './models.js';
import { t, getHighScore, getShowHelp, submitScore } from './i18n.js';

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
    // Cipó que acabou de soltar: ignorado até pousar ou agarrar outro cipó
    // (impede re-agarrar o MESMO cipó no ar após a soltura).
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
    this.isTripped = false; // Caiu de cara no chão e aguarda uma nova direção
    // Checkpoint: última faixa de limite de tela atravessada (respawn volta nela).
    this.checkpointZ = null;
    // Queda do céu no respawn (como no original): nasce lá no alto e despenca.
    this.RESPAWN_DROP_HEIGHT = 12;
    this.respawnDrop = false;
    // O topo do chão é Y=0. A câmera e os braços precisam permanecer acima dele.
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

    // O mouse não é um botão de ação. Pulo e soltura do cipó usam apenas
    // Espaço/Enter ou o botão circular touch.
    const btnFwd = document.getElementById('btn-forward');
    const btnBwd = document.getElementById('btn-backward');
    const btnAct = document.getElementById('btn-action');
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

    // Cooldown timers
    if (this.tripCooldown > 0) this.tripCooldown -= delta;
    if (this.justReleasedVineTimer > 0) this.justReleasedVineTimer -= delta;

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

    // Enquanto está caído, não processa outros perigos nem coleta itens.
    if (this.isTripped) {
      this.updateArmsAndCamera(delta);
      return;
    }

    // Check if standing on an opening crocodile snout (NOT on the eyes!)
    if (this.isGrounded && Math.abs(this.y - 0.35) < 0.25) {
      const croc = this.getCrocodileAt(world, this.z);
      // Only bite if on the FRONT MOUTH (Z > croc.z + 0.65). If on the eyes/skull, 100% IMMUNE!
      if (croc && croc.isOpen && this.z > croc.z + 0.65) {
        audio.playChomp();
        this.die('death.crocBite');
        return;
      }
    }

    // Check if standing on a disappearing quicksand section opened beneath feet
    // (cada seção abre/fecha por conta própria — só a seção sob os pés mata)
    if (this.isGrounded && this.y <= 0.1 && world.activeOpeningPits) {
      for (const pitData of world.activeOpeningPits) {
        if (world.isQuicksandOpenAt(pitData, this.z)) {
          audio.playSink();
          this.die('death.quicksand');
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
    // Depois de tropeçar, fica de cara no chão até o jogador pressionar uma
    // direção ou o botão de pulo. A direção que o levanta também retoma a
    // marcha; o pulo só levanta (o pulo em si exige um novo toque).
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

      // Botão de pulo levanta na hora (toque único, sem delay de segurar)
      if (jumpPressed) {
        this.isTripped = false;
        this.tripStandTimer = 0;
        return;
      }

      if (!this.moveForward && !this.moveBackward) {
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

    // Single axis: Forward (-Z) or Backward (+Z)
    let targetVz = 0;
    if (this.moveForward) targetVz -= RUN_SPEED;
    if (this.moveBackward) targetVz += RUN_SPEED;

    // Responsive arcade acceleration
    this.vz = THREE.MathUtils.lerp(this.vz, targetVz, delta * 15);
    const prevZ = this.z;
    this.z += this.vz * delta;

    // Prevent walking backwards off the starting edge of the map
    if (this.z > 0) {
      this.z = 0;
      this.vz = Math.min(this.vz, 0);
    }

    // Checkpoint: ao cruzar uma fronteira de tela para frente (-Z),
    // registra 4m adiante da faixa como ponto de respawn.
    if (this.vz < 0) {
      const prevK = Math.floor(-prevZ / SCREEN_LENGTH);
      const newK = Math.floor(-this.z / SCREEN_LENGTH);
      if (newK > prevK) {
        this.checkpointZ = -newK * SCREEN_LENGTH - 4;
      }
    }

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
        // Pousou: o cipó ignorado volta a ser agarrável.
        this.ignoredVine = null;
        // Aterrissou da queda do céu do respawn: baque seco de impacto.
        if (this.respawnDrop) {
          this.respawnDrop = false;
          audio.playGroundThud();
        }
      } else {
        // Fell into pit / water / quicksand!
        if (this.y < -1.2) {
          audio.playSink();
          this.die('death.abyss');
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
    // Only return if player is within this specific crocodile's physical bounds (-1.2 to +2.8)
    if (closest && z >= closest.z - 1.2 && z <= closest.z + 2.8) {
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
              const isOnMouth = z > croc.z + 0.65;

              if (croc.isOpen && isOnMouth) {
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
          // No surface under feet -> drops into pit / water
          return -10;
        }
      }
    }

    // Check disappearing quicksand pits (cada seção é solo ou abismo)
    if (world.activeOpeningPits) {
      for (const pitData of world.activeOpeningPits) {
        if (Math.abs(z - pitData.z) < pitData.radius) {
          if (world.isQuicksandOpenAt(pitData, z)) {
            // A seção sob os pés está aberta!
            return -10;
          } else {
            // Seção fechada! Solo sólido, dá para correr!
            return 0.0;
          }
        }
      }
    }

    // Poço azul de saída dos troncos: é preciso saltar por cima.
    for (const hazard of world.activeHazards) {
      if (hazard.type === 'log_exit_pit' && z >= hazard.minZ && z <= hazard.maxZ) {
        return -10;
      }
    }

    // Normal solid ground
    return 0.0;
  }

  // Automatic vine grab when close in distance (só no ar: é preciso PULAR)
  checkVineGrab(world) {
    if (this.justReleasedVineTimer > 0) return;
    // Parado no chão nunca agarra: o cipó fica alto de propósito.
    if (this.isGrounded) return;
    const tipPos = new THREE.Vector3();

    for (const vineData of world.activeVines) {
      if (!vineData.vine.tip) continue;
      // Nunca re-agarra o cipó que acabou de soltar (só libera ao pousar
      // ou agarrar outro cipó): garante o espaço de voo até o próximo cipó.
      if (vineData === this.ignoredVine) continue;
      vineData.vine.tip.getWorldPosition(tipPos);

      // Distance check between player hands/chest and vine tip
      const distZ = Math.abs(this.z - tipPos.z);
      const distY = Math.abs((this.y + EYE_HEIGHT) - tipPos.y);

      // Grab automatically when near the vine (janela generosa em Z para
      // compensar o balanço rápido da ponta)!
      if (distZ < 2.2 && distY < 2.4) {
        this.attachedVine = vineData;
        this.ignoredVine = null;
        this.isGrounded = false;
        this.vy = 0;
        this.vz = 0;
        audio.playTarzanYell();

        // Show HUD prompt (só com a ajuda na tela ligada)
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
      // Transferência cipó→cipó: outro cipó ao alcance? Vai direto para
      // ele, sem voo no meio. Senão, soltura normal com impulso.
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
      // O cipó que acabou de soltar não vale (senão o pulo nunca solta de
      // verdade); qualquer OUTRO cipó próximo é o "próximo cipó".
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
    // O cipó solto fica ignorado até o pouso: o voo pós-soltura nunca
    // re-agarra o MESMO cipó, só o próximo.
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
        // Tronco caindo do céu, no poço ou aguardando a vez (invisível) não atropela
        if (hazard.falling || hazard.fallingIntoPit || hazard.waiting) continue;
        const distZ = Math.abs(this.z - hazard.z);
        // If close and not jumping high enough
        if (distZ < 1.0 && this.y < 0.75) {
          if (this.tripCooldown <= 0) {
            this.tripCooldown = 0.6;
            this.isTripped = true;
            this.tripStandTimer = 0;
            // Deixa Harry um pouco à frente do tronco para evitar uma nova
            // colisão imediata quando ele se levanta.
            this.z = hazard.z - 1.5;
            this.score = Math.max(0, this.score - 100);
            audio.playTrip();
            // Para de andar e exige uma nova direção para levantar.
            this.vz = 0;
            this.moveForward = false;
            this.moveBackward = false;
          }
        }
      } else if (hazard.type === 'fire') {
        // Campfire: deadly if walking into it without jumping
        const distZ = Math.abs(this.z - hazard.z);
        if (distZ < 1.1 && this.y < 0.9) {
          audio.playTrip();
          this.die('death.fire');
          return;
        }
      } else if (hazard.type === 'scorpion') {
        // Scorpion: deadly if touching without jumping
        const distZ = Math.abs(this.z - hazard.z);
        if (distZ < 1.1 && this.y < 0.75) {
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
        if (distZ < 1.4) {
          treasure.collected = true;
          // O tesouro pertence ao grupo da tela, não diretamente à cena.
          treasure.mesh.removeFromParent();
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

    // Queda de cara: o jogador tropeça e as mãos espalmam no chão
    if (isTripped) {
      // Parar a câmera mais alto para que os braços não atravessem o chão
      const targetY = this.y + 1.2; 
      this.camera.position.set(0, THREE.MathUtils.lerp(this.camera.position.y, targetY, delta * 8), this.z);
      // Câmera olha para o chão
      this.camera.rotation.x = THREE.MathUtils.lerp(this.camera.rotation.x, -0.8, delta * 6);
      this.camera.rotation.z = 0;
      this.camera.rotation.y = 0;
      if (this.arms) {
        // Braços estendidos firmemente para frente para segurar a queda
        // Posição levantada (-0.1) para simular o toque no chão
        this.arms.leftArm.position.set(-0.32, -0.1, -0.7);
        this.arms.rightArm.position.set(0.32, -0.1, -0.7);
        // Rotação reta para apoiar as mãos
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

      // Subtle footstep sound
      if (Math.sin(this.bobTimer) < -0.95 && Math.random() < 0.15) {
        audio.playStep();
      }
    } else {
      this.bobTimer = 0;
    }

    // Camera position & rotation (slight natural tilt towards the trail ahead)
    const targetCameraY = this.y + EYE_HEIGHT + bobY;
    this.camera.position.set(0, THREE.MathUtils.lerp(this.camera.position.y, targetCameraY, delta * 12), this.z);
    this.camera.rotation.x = THREE.MathUtils.lerp(this.camera.rotation.x, -0.04 + bobPitch, delta * 12);
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

  die(reasonKey = 'death.lifeLost') {
    if (this.isDying || this.isGameOver) return;
    this.isDying = true;
    this.deathTimer = 1.2;
    this.deathReasonKey = reasonKey;
    this.lives--;

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

  // Solo seguro para respawn (puro, sem efeitos colaterais: não chama die()).
  // Retorna false sobre água/piche/poço de saída/areia que abre e fecha.
  isRespawnGroundSafe(world, z) {
    for (const hazard of world.activeHazards) {
      if (['quicksand', 'tarpit', 'water'].includes(hazard.type)) {
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

  // Distância mínima de perigos físicos (troncos parados/rolando, fogo, escorpião).
  isRespawnClearOfHazards(world, z) {
    for (const hazard of world.activeHazards) {
      if (hazard.type === 'rolling_log') {
        if (Math.abs(z - hazard.z) < 4.0) return false;
      } else if (hazard.type === 'log' || hazard.type === 'fire' || hazard.type === 'scorpion') {
        if (Math.abs(z - hazard.z) < 2.8) return false;
      }
    }
    return true;
  }

  // Procura um Z seguro perto da base: nunca sob um ponto de queda de tronco.
  findSafeRespawnZ(world, baseZ, screenIndex) {
    const screenStartZ = -screenIndex * SCREEN_LENGTH;
    const screenEndZ = -(screenIndex + 1) * SCREEN_LENGTH;
    const minZ = screenEndZ + 2;
    const maxZ = Math.min(8, screenStartZ + 10);
    const candidates = [baseZ, baseZ - 4, baseZ + 4, baseZ - 8, baseZ + 8,
      baseZ - 12, baseZ + 12, baseZ - 16, baseZ + 16, baseZ - 20, baseZ + 20];
    for (const c of candidates) {
      const z = THREE.MathUtils.clamp(c, minZ, maxZ);
      if (this.isRespawnGroundSafe(world, z) && this.isRespawnClearOfHazards(world, z)) {
        return z;
      }
    }
    // Fallback: fica na base mesmo se tudo estiver ocupado (evita travar o jogo).
    return THREE.MathUtils.clamp(baseZ, minZ, maxZ);
  }

  respawn(world = null) {
    this.isDying = false;
    this.vy = 0;
    this.vz = 0;
    this.isGrounded = false;
    this.isTripped = false;
    this.tripStandTimer = 0;
    this.tripCooldown = 0;

    // Respawn no último checkpoint (faixa atravessada); sem checkpoint,
    // no começo da tela onde morreu (frente = -Z, começo = borda +Z).
    if (world) {
      let baseZ;
      if (this.checkpointZ !== null && this.checkpointZ < 8) {
        baseZ = this.checkpointZ;
      } else {
        const screenIndex = Math.max(0, Math.floor(-this.z / SCREEN_LENGTH));
        baseZ = -screenIndex * SCREEN_LENGTH + 6;
      }
      const screenIndex = Math.max(0, Math.floor(-baseZ / SCREEN_LENGTH));
      // Desvia de troncos e demais perigos: nunca nasce embaixo de um
      // tronco rolando nem sobre poços/areia movediça.
      this.z = this.findSafeRespawnZ(world, baseZ, screenIndex);
    } else {
      // Fallback: recua 8 unidades
      this.z += 8;
    }
    // Cai do céu como no original: nasce lá no alto e a gravidade faz o resto.
    this.y = this.RESPAWN_DROP_HEIGHT;
    this.respawnDrop = true;
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

    // Recorde persistido no browser (só conta no fim do jogo, padrão arcade)
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
    if (this.arms && this.arms.gripBar) this.arms.gripBar.visible = false;
    this.tripCooldown = 0;
    this.isTripped = false;
    this.tripStandTimer = 0;
    this.respawnDrop = false;

    const prompt = document.getElementById('vine-prompt');
    if (prompt) prompt.classList.remove('active');

    const overlay = document.getElementById('gameover-overlay');
    if (overlay) overlay.classList.add('hidden');
  }
}
