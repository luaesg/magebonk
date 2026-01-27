import * as THREE from 'three';
import { InputManager } from './InputManager.js';
import { Player } from './Player.js';
import { GameScene } from './GameScene.js';
import { AudioManager } from './AudioManager.js';
import { FPSCounter } from './FPSCounter.js';
import { SpeechRecognitionManager } from './SpeechRecognitionManager.js';
import { SpellManager } from './SpellManager.js';
import { EnemyManager } from './EnemyManager.js';

export class Game {
  constructor() {
    this.inputManager = new InputManager();
    this.gameScene = new GameScene();
    this.player = new Player(this.inputManager);
    this.audioManager = new AudioManager(this.player.getCamera());
    this.fpsCounter = new FPSCounter();
    this.speechRecognitionManager = new SpeechRecognitionManager();
    this.spellManager = new SpellManager(this.gameScene, this.player, this.audioManager);
    this.enemyManager = new EnemyManager(this.gameScene, this.player, this.audioManager);

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowShadowMap;

    this.isPaused = false;
    this.animationFrameId = null;
    this.lastFrameTime = performance.now();

    this.settingsMenu = document.getElementById('settings-container');
    if (!this.settingsMenu) {
      console.error("O 'settings-container' elemenento não foi encontrado no DOM.");
    }

    const container = document.getElementById('canvas-container');
    if (container) {
      container.appendChild(this.renderer.domElement);
    }

    this.inputManager.onPointerLockChange = (isLocked) => {
      const status = document.getElementById('pointer-status');
      if (status) {
        if (isLocked) {
          status.textContent = '🖱️ Mouse travado ✓';
          status.style.color = '#44ff44';
        } else {
          status.textContent = '🖱️ Clique para travar o mouse';
          status.style.color = '#ff4444';
        }
      }
    };

        this.setupEventListeners();
            this.setupAudio();
            this.setupCollisions();
            this.setupPlayerAudio();
            this.setupSpells();
            this.setupEnemies();

            this.speechRecognitionManager.start();

            this.animate();
          }    
    togglePause() {    this.isPaused = !this.isPaused;

    if (this.isPaused) {
      this.inputManager.unlockPointer();

      if (this.settingsMenu) {
        this.settingsMenu.style.display = 'block';
      }

      if (this.animationFrameId !== null) {
        cancelAnimationFrame(this.animationFrameId);
        this.animationFrameId = null;
      }

    } else {
      if (this.settingsMenu) {
        this.settingsMenu.style.display = 'none';
      }

      this.animate();
    }
  }

  setupEventListeners() {
    window.addEventListener('resize', () => this.onWindowResize());

    document.addEventListener('keydown', (event) => {
      if (event.key === "Escape" || event.key.toLowerCase() === "p") {
        this.togglePause();
      }
    });

    document.addEventListener('visibilitychange', () => {
      if (document.hidden && !this.isPaused) {
        this.togglePause();
      }
    });
  }

  async setupAudio() {
    try {
      await this.audioManager.loadSound('walk', '/sounds/walking-on-grass.mp3');
      await this.audioManager.loadSound('jumpFall', '/sounds/jump-fall.mp3');
      await this.audioManager.loadSound('fireball', '/sounds/jump-fall.mp3');
      await this.audioManager.loadSound('ice', '/sounds/jump-fall.mp3');
    } catch (error) {
      console.warn('Erro ao carregar sons:', error);
    }
  }

  setupCollisions() {
    const barriers = this.gameScene.getBarriers();
    this.player.setBarriers(barriers);
  }

  setupPlayerAudio() {
    this.player.onLand = () => {
      this.audioManager.playJumpFallSound();
    };
  }

  setupSpells() {
      this.inputManager.onMouseDown = (event) => {
          if (event.button === 0) {
             this.spellManager.castSpell('fireball', 0.5);
          } else if (event.button === 2) {
             this.spellManager.castSpell('ice', 0.5);
          }
      };

      this.speechRecognitionManager.onCommand = (command, intensity = 0.5) => {
          const lowerCmd = command.toLowerCase();
          console.log(`Comando recebido: ${lowerCmd}, Intensidade: ${intensity.toFixed(2)}`);

          if (lowerCmd.includes('bola de fogo') || lowerCmd.includes('fireball') || lowerCmd.includes('fogo')) {
              this.spellManager.castSpell('fireball', intensity);
          } else if (lowerCmd.includes('gelo') || lowerCmd.includes('ice')) {
              this.spellManager.castSpell('ice', intensity);
          }
      };
  }

  setupEnemies() {
    this.enemyManager.setParticleSystem(this.spellManager.particleSystem);
    this.spellManager.setEnemyManager(this.enemyManager);

    this.enemyManager.spawnEnemy(new THREE.Vector3(15, 3, 10));
    this.enemyManager.spawnEnemy(new THREE.Vector3(-15, 3, -10));
    this.enemyManager.spawnEnemy(new THREE.Vector3(0, 3, -20));
  }

  onWindowResize() {
    this.player.onWindowResize();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  update(deltaTime) {
    this.player.update();
    const playerPos = this.player.getPosition();
    this.gameScene.update(playerPos);
    this.spellManager.update(deltaTime);
    this.enemyManager.update(deltaTime);

    if (this.player.isMoving && this.player.canJump) {
      this.audioManager.playWalkSound();
    }
  }

  render() {
    this.renderer.render(
      this.gameScene.getScene(),
      this.player.getCamera()
    );
  }

  animate = () => {
    this.animationFrameId = requestAnimationFrame(this.animate);
    if (!this.isPaused) {
      const currentTime = performance.now();
      const deltaTime = Math.min((currentTime - this.lastFrameTime) / 1000, 0.1);
      this.lastFrameTime = currentTime;

      this.update(deltaTime);
      this.render();
      this.fpsCounter.update();
    }
  };

  dispose() {
    this.gameScene.dispose();
    this.enemyManager.dispose();
    this.renderer.dispose();
    this.fpsCounter.dispose();
    this.speechRecognitionManager.stop();
  }
}
