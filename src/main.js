import Phaser from 'phaser';
import './style.css';
import { createMotionController } from './motion.js';

const WORLD_WIDTH = 2400;
const FLOOR_Y = 430;
const PLAYER_MAX_HP = 100;
const ENEMY_MAX_HP = 100;
const PLAYER_SCREEN_X = 384;
const BATTLE_WORLD_X = 700;
const INTRO_SPEED = 280;

const ATTACKS = {
  punch: { damage: 10, range: 72, startup: 90, active: 110, recovery: 250, label: '拳擊' },
  kick: { damage: 15, range: 104, startup: 150, active: 130, recovery: 330, label: '踢擊' },
};

const ui = {
  playerHealth: document.querySelector('#player-health'),
  enemyHealth: document.querySelector('#enemy-health'),
  playerHpLabel: document.querySelector('#player-hp-label'),
  enemyHpLabel: document.querySelector('#enemy-hp-label'),
  state: document.querySelector('#fight-state'),
  message: document.querySelector('#stage-message'),
  pause: document.querySelector('#pause-toggle'),
};

function makeFighter(scene, x, palette, isPlayer) {
  const shadow = scene.add.ellipse(0, 1, 62, 15, 0x172823, 0.26);
  const cloak = scene.add.triangle(-6, -48, -18, 0, 20, 0, 9, 44, palette.cloak).setOrigin(0.5, 0.5);
  const rearLeg = scene.add.rectangle(-9, -16, 12, 32, palette.legs).setOrigin(0.5, 0.5);
  const frontLeg = scene.add.container(8, -30);
  frontLeg.add([
    scene.add.rectangle(0, 16, 15, 34, palette.legs).setOrigin(0.5, 0.08),
    scene.add.rectangle(8, 33, 25, 8, palette.boots),
  ]);
  const torso = scene.add.rectangle(0, -53, 42, 48, palette.torso).setOrigin(0.5, 0.5);
  const sash = scene.add.rectangle(0, -40, 43, 7, palette.trim).setOrigin(0.5, 0.5);
  const head = scene.add.circle(0, -88, 17, palette.head);
  const hair = scene.add.ellipse(0, -100, 34, 14, palette.hair);
  const face = scene.add.ellipse(isPlayer ? 5 : -5, -88, 4, 7, 0xe6c59b);
  const arm = scene.add.rectangle(22, -55, 34, 11, palette.torso).setOrigin(0.12, 0.5);
  const fist = scene.add.circle(54, -53, 8, palette.trim);
  const figure = scene.add.container(x, FLOOR_Y - 2, [shadow, cloak, rearLeg, frontLeg, torso, sash, head, hair, face, arm, fist]);
  figure.setDepth(4);
  return {
    figure,
    arm,
    fist,
    frontLeg,
    hp: isPlayer ? PLAYER_MAX_HP : ENEMY_MAX_HP,
    maxHp: isPlayer ? PLAYER_MAX_HP : ENEMY_MAX_HP,
    facing: isPlayer ? 1 : -1,
    attack: null,
    invulnerable: 0,
    state: 'idle',
  };
}

class ArenaScene extends Phaser.Scene {
  constructor() {
    super('arena');
    this.enemyState = 'approach';
    this.enemyTimer = 0;
    this.enemyAttackElapsed = 0;
    this.enemyHasHit = false;
    this.paused = false;
    this.ended = false;
    this.messageTime = 0;
  }

  create() {
    this.enemyState = 'approach';
    this.enemyTimer = 0;
    this.enemyAttackElapsed = 0;
    this.enemyHasHit = false;
    this.paused = false;
    this.ended = false;
    this.battleStarted = false;
    this.messageTime = 0;
    ui.message.textContent = '— 尋找破綻 —';
    ui.pause.textContent = 'Ⅱ';
    ui.pause.setAttribute('aria-label', '暫停');
    this.drawWorld();
    this.player = makeFighter(this, PLAYER_SCREEN_X, {
      cloak: 0x395a54, legs: 0x273b37, boots: 0x1e302d,
      torso: 0x718b76, trim: 0xe2b96e, head: 0xd6ad83, hair: 0x263731,
    }, true);
    this.enemy = makeFighter(this, 1030, {
      cloak: 0x693d37, legs: 0x463b35, boots: 0x302e29,
      torso: 0x9a5948, trim: 0xd9a866, head: 0xb68261, hair: 0x49332f,
    }, false);

    this.cameras.main.setBounds(0, 0, WORLD_WIDTH, 540);
    this.cameras.main.stopFollow();
    this.cameras.main.setScroll(0, 0);
    this.updateHud();
    window.addEventListener('arena-attack', this.onAttackEvent);
    window.addEventListener('arena-pause', this.onPauseEvent);
    this.events.once('shutdown', () => {
      window.removeEventListener('arena-attack', this.onAttackEvent);
      window.removeEventListener('arena-pause', this.onPauseEvent);
    });
  }

  drawWorld() {
    this.cameras.main.setBackgroundColor('#bdcfc6');
    const far = this.add.graphics().setScrollFactor(0.2).setDepth(0);
    far.fillStyle(0xe7d9b6, 0.72);
    far.fillCircle(758, 142, 54);
    far.fillStyle(0x849d91, 0.62);
    far.fillPoints([{ x: 0, y: 345 }, { x: 165, y: 195 }, { x: 330, y: 344 }, { x: 515, y: 223 }, { x: 710, y: 350 }, { x: 850, y: 200 }, { x: 1120, y: 350 }, { x: 1330, y: 230 }, { x: 1540, y: 354 }, { x: 1730, y: 180 }, { x: 1990, y: 350 }, { x: 2200, y: 218 }, { x: WORLD_WIDTH, y: 344 }, { x: WORLD_WIDTH, y: 440 }, { x: 0, y: 440 }], true);

    const mid = this.add.graphics().setScrollFactor(0.48).setDepth(1);
    mid.fillStyle(0x647e73, 0.88);
    for (let x = 60; x < WORLD_WIDTH; x += 250) {
      mid.fillRect(x + 35, 260 + (x % 3) * 12, 74, 170);
      mid.fillRect(x + 20, 278 + (x % 2) * 12, 104, 18);
      mid.fillRect(x + 52, 235 + (x % 4) * 5, 38, 30);
      mid.fillStyle(0xd1b777, 0.42);
      mid.fillRect(x + 54, 296 + (x % 3) * 12, 8, 13);
      mid.fillRect(x + 82, 296 + (x % 2) * 12, 8, 13);
      mid.fillStyle(0x647e73, 0.88);
    }

    const near = this.add.graphics().setDepth(2);
    near.fillStyle(0x334e45, 1);
    near.fillRect(0, FLOOR_Y, WORLD_WIDTH, 110);
    near.fillStyle(0x6e8d72, 1);
    near.fillRect(0, FLOOR_Y, WORLD_WIDTH, 7);
    near.lineStyle(1, 0x9da97c, 0.32);
    for (let x = 30; x < WORLD_WIDTH; x += 76) {
      near.lineBetween(x, FLOOR_Y + 30, x + 22, FLOOR_Y + 32);
      near.lineBetween(x + 34, FLOOR_Y + 62, x + 61, FLOOR_Y + 62);
    }
    near.fillStyle(0x283f38, 0.92);
    for (let x = 90; x < WORLD_WIDTH; x += 180) {
      near.fillTriangle(x, FLOOR_Y + 4, x - 24, FLOOR_Y - 33, x + 19, FLOOR_Y - 9);
      near.fillRect(x - 2, FLOOR_Y - 20, 5, 20);
    }
  }

  onAttackEvent = (event) => this.startAttack(event.detail);
  onPauseEvent = () => this.togglePause();

  startAttack(type) {
    if (this.paused || this.ended || this.player.attack) return;
    const spec = ATTACKS[type];
    if (!spec) return;
    this.player.attack = { type, spec, elapsed: 0, hit: false };
    this.player.state = 'attack';
    if (type === 'kick') {
      this.player.frontLeg.angle = -52;
      this.tweens.add({ targets: this.player.frontLeg, angle: 0, duration: 260, ease: 'Quad.Out' });
    } else {
      this.player.arm.rotation = -0.62;
      this.player.fist.x = 62;
      this.tweens.add({
        targets: this.player.arm,
        rotation: 0,
        duration: 220,
        ease: 'Quad.Out',
      });
      this.tweens.add({
        targets: this.player.fist,
        x: 54,
        delay: 40,
        duration: 180,
        ease: 'Quad.Out',
      });
    }
    this.showMessage(spec.label, 650);
  }

  updatePlayerAttack(delta) {
    const attack = this.player.attack;
    if (!attack) return;
    attack.elapsed += delta;
    const activeStart = attack.spec.startup;
    const activeEnd = activeStart + attack.spec.active;
    if (!attack.hit && attack.elapsed >= activeStart && attack.elapsed < activeEnd) {
      const distance = this.enemy.figure.x - this.player.figure.x;
      const facingTarget = distance > 0;
      if (this.enemy.hp > 0 && facingTarget && Math.abs(distance) <= attack.spec.range + 26) {
        attack.hit = true;
        this.damageEnemy(attack.spec.damage);
      }
    }
    if (attack.elapsed >= activeEnd + attack.spec.recovery) {
      this.player.attack = null;
      this.player.arm.rotation = 0;
      this.player.fist.x = 54;
      this.player.frontLeg.angle = 0;
      this.player.state = 'idle';
    }
  }

  updateEnemy(delta) {
    if (this.enemy.hp <= 0 || this.player.hp <= 0) return;
    const distance = this.player.figure.x - this.enemy.figure.x;
    const absDistance = Math.abs(distance);
    this.enemy.facing = Math.sign(distance) || -1;
    this.enemy.figure.setScale(this.enemy.facing, 1);

    if (this.enemyState === 'approach') {
      if (absDistance > 82) {
        this.enemy.figure.x += this.enemy.facing * 105 * delta / 1000;
      } else {
        this.enemyState = 'ready';
        this.enemyTimer = 560;
        this.showMessage('敵人蓄勢', 650);
      }
    } else if (this.enemyState === 'ready') {
      if (absDistance > 112) {
        this.enemyState = 'approach';
      } else {
        this.enemyTimer -= delta;
        if (this.enemyTimer <= 0) {
          this.enemyState = 'attack';
          this.enemyAttackElapsed = 0;
          this.enemyHasHit = false;
          this.enemy.arm.rotation = 0.75;
        }
      }
    } else if (this.enemyState === 'attack') {
      this.enemyAttackElapsed += delta;
      if (!this.enemyHasHit && this.enemyAttackElapsed >= 300 && this.enemyAttackElapsed < 430) {
        this.enemyHasHit = true;
        if (absDistance <= 105) this.damagePlayer(10);
      }
      if (this.enemyAttackElapsed >= 760) {
        this.enemyState = 'recovery';
        this.enemyTimer = 600;
        this.enemy.arm.rotation = 0;
      }
    } else if (this.enemyState === 'recovery') {
      this.enemyTimer -= delta;
      if (this.enemyTimer <= 0) this.enemyState = 'approach';
    } else if (this.enemyState === 'hitstun') {
      this.enemyTimer -= delta;
      if (this.enemyTimer <= 0) this.enemyState = 'approach';
    }
  }

  damageEnemy(amount) {
    if (this.enemy.hp <= 0) return;
    this.enemy.hp = Math.max(0, this.enemy.hp - amount);
    this.enemyState = this.enemy.hp === 0 ? 'dead' : 'hitstun';
    this.enemyTimer = 470;
    this.enemy.figure.setAlpha(0.55);
    this.time.delayedCall(120, () => this.enemy?.figure.setAlpha(1));
    const burst = this.add.circle(this.enemy.figure.x + this.player.facing * 30, FLOOR_Y - 66, 14, 0xf1c577, 0.92).setDepth(7);
    this.tweens.add({ targets: burst, scale: 2.4, alpha: 0, duration: 240, onComplete: () => burst.destroy() });
    if (this.enemy.hp === 0) {
      this.enemy.figure.setAngle(78);
      this.enemy.figure.setAlpha(0.72);
      this.showMessage('敵人倒下', 3000);
      this.ended = true;
    }
    this.updateHud();
  }

  damagePlayer(amount) {
    if (this.player.hp <= 0 || this.player.invulnerable > 0) return;
    const damage = Math.max(1, amount - 5);
    this.player.hp = Math.max(0, this.player.hp - damage);
    this.player.invulnerable = 500;
    this.player.state = 'hurt';
    this.player.figure.setAlpha(0.5);
    this.time.delayedCall(110, () => this.player?.figure.setAlpha(1));
    this.showMessage(`受到 ${damage} 點傷害`, 850);
    if (this.player.hp === 0) {
      this.ended = true;
      this.showMessage('旅程暫歇', 3000);
    }
    this.updateHud();
  }

  showMessage(message, duration) {
    this.messageTime = duration;
    ui.message.textContent = message;
  }

  updateHud() {
    ui.playerHealth.style.width = `${this.player.hp / this.player.maxHp * 100}%`;
    ui.enemyHealth.style.width = `${this.enemy.hp / this.enemy.maxHp * 100}%`;
    ui.playerHpLabel.textContent = `${this.player.hp} / ${this.player.maxHp}`;
    ui.enemyHpLabel.textContent = `${this.enemy.hp} / ${this.enemy.maxHp}`;
    ui.state.textContent = this.paused ? '暫停中' : this.enemy.hp === 0 ? '勝利' : this.player.hp === 0 ? '戰敗' : this.battleStarted ? '迎戰中' : '入場中';
  }

  togglePause() {
    if (this.ended) return;
    this.paused = !this.paused;
    if (this.paused) this.scene.pause();
    else this.scene.resume();
    ui.pause.textContent = this.paused ? '▶' : 'Ⅱ';
    ui.pause.setAttribute('aria-label', this.paused ? '繼續' : '暫停');
    this.updateHud();
  }

  resetArena() {
    this.scene.restart();
    ui.pause.textContent = 'Ⅱ';
    ui.pause.setAttribute('aria-label', '暫停');
  }

  update(_time, delta) {
    if (this.paused || this.ended) return;
    if (!this.battleStarted) {
      this.player.figure.setScale(1, 1);
      this.player.figure.x = Math.min(BATTLE_WORLD_X, this.player.figure.x + INTRO_SPEED * delta / 1000);
      this.cameras.main.setScroll(Math.max(0, this.player.figure.x - PLAYER_SCREEN_X), 0);
      if (this.player.figure.x >= BATTLE_WORLD_X) {
        this.battleStarted = true;
        this.showMessage('已進入戰鬥位置', 1200);
        this.updateHud();
      }
      return;
    }
    this.player.figure.setScale(1, 1);
    this.updatePlayerAttack(delta);
    this.updateEnemy(delta);
    if (this.player.invulnerable > 0) this.player.invulnerable -= delta;
    if (this.messageTime > 0) {
      this.messageTime -= delta;
      if (this.messageTime <= 0) ui.message.textContent = this.enemy.hp > 0 ? '— 尋找破綻 —' : '— 戰鬥結束 —';
    }
  }
}

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game-container',
  width: 960,
  height: 540,
  backgroundColor: '#bdcfc6',
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  render: { antialias: true, pixelArt: false },
  scene: [ArenaScene],
});

const arena = () => game.scene.getScene('arena');
document.querySelector('#pause-toggle').addEventListener('click', () => arena()?.togglePause());
document.querySelector('#restart').addEventListener('click', () => arena()?.resetArena());
document.querySelectorAll('[data-attack]').forEach((button) => {
  button.addEventListener('click', () => window.dispatchEvent(new CustomEvent('arena-attack', { detail: button.dataset.attack })));
});
const attackKeys = { j: 'punch', k: 'kick' };

window.addEventListener('keydown', (event) => {
  const key = event.key.toLowerCase();
  if (event.repeat) return;
  if (key in attackKeys) {
    event.preventDefault();
    window.dispatchEvent(new CustomEvent('arena-attack', { detail: attackKeys[key] }));
  } else if (key === 'escape') {
    event.preventDefault();
    window.dispatchEvent(new CustomEvent('arena-pause'));
  }
}, { passive: false });

const motionController = createMotionController({
  video: document.querySelector('#motion-video'),
  overlay: document.querySelector('#pose-overlay'),
  cameraWindow: document.querySelector('#camera-window'),
  status: document.querySelector('#motion-status'),
  statusLight: document.querySelector('#motion-status-light'),
  actionState: document.querySelector('#motion-action-state'),
  actionLabel: document.querySelector('#motion-action-label'),
  toggleButton: document.querySelector('#camera-toggle'),
  onAttack: (kind) => window.dispatchEvent(new CustomEvent('arena-attack', { detail: kind })),
});

window.addEventListener('beforeunload', () => {
  motionController.stop();
  game.destroy(true);
});