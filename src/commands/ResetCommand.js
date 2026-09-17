import { Command } from './Command.js';
import { EYE_HEIGHT } from '../player.js';

export class ResetCommand extends Command {
  constructor(player) {
    super();
    this.player = player;
  }

  execute() {
    const p = this.player;
    p.z = 0;
    p.y = 0;
    p.vy = 0;
    p.vz = 0;
    p.targetRotY = 0;
    p.camera.rotation.y = 0;
    p.camera.rotation.x = -0.04;
    p.camera.rotation.z = 0;
    p.camera.position.set(0, EYE_HEIGHT, 0);
    p.isGrounded = true;
    p.moveForward = false;
    p.moveBackward = false;
    p.actionPressed = false;
    p.actionJustPressed = false;
    p.turnJustPressed = false;
    p.padForward = false;
    p.padBackward = false;
    p.padPrevAction = false;
    p.padPrevTurn = false;
    p.score = 2000;
    p.lives = 3;
    p.timeRemaining = 1200;
    p.treasuresCollected = 0;
    p.isGameOver = false;
    p.isDying = false;
    p.deathTimer = 0;
    p.deathReasonKey = 'death.lifeLost';
    p.diedInTunnel = false;
    p.ceilDeathKey = 'death.cave';
    p.attachedVine = null;
    p.ignoredVine = null;
    p.justReleasedVineTimer = 0;
    p.crocBiteGraceTimer = 0;
    if (p.arms && p.arms.gripBar) p.arms.gripBar.visible = false;
    p.tripCooldown = 0;
    p.isTripped = false;
    p.tripStandTimer = 0;
    p.respawnDrop = false;
    p.inTunnel = false;
    p.climbing = null;
    p.climbZ = 0;
    p.climbGrace = 0;
    p.warp = null;
    p.camera.fov = p.baseFov;
    p.camera.updateProjectionMatrix();
    p.checkpointZ = null;
    p.lastSurfaceHoleScreen = null;
    p.bobTimer = 0;
    p.lastBobSin = 0;

    const prompt = document.getElementById('vine-prompt');
    if (prompt) prompt.classList.remove('active');

    const overlay = document.getElementById('gameover-overlay');
    if (overlay) overlay.classList.add('hidden');

    const fade = document.getElementById('death-fade');
    if (fade) fade.classList.remove('on');
  }
}
