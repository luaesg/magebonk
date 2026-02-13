import * as THREE from 'three';
import { InputManager } from './InputManager.js';
import { Player } from './Player.js';
import { GameScene } from './GameScene.js';
import { AudioManager } from './AudioManager.js';
import { FPSCounter } from './FPSCounter.js';
import { SpeechRecognitionManager } from './SpeechRecognitionManager.js';
import { SpellManager } from './SpellManager.js';
import { EnemyManager } from './EnemyManager.js';

/**
 * Classe Game
 * Classe principal que inicializa todos os sistemas e gerencia o loop de jogo.
 */
export class Game {
  constructor() {
    this.inputManager = new InputManager();
    this.gameScene = new GameScene();
    this.player = new Player(this.inputManager);
    
    this.player.onPlayerDeath = () => this.handleGameOver();
    
    this.isGameOver = false;
    this.audioManager = new AudioManager(this.player.getCamera());
    this.fpsCounter = new FPSCounter();
    this.speechRecognitionManager = new SpeechRecognitionManager();
    this.spellManager = new SpellManager(this.gameScene, this.player, this.audioManager);
    this.enemyManager = new EnemyManager(this.gameScene, this.player, this.audioManager);

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowShadowMap;

    const btnRestart = document.getElementById('btn-restart');
    if (btnRestart) {
        btnRestart.addEventListener('click', () => this.resetGame());
    }

    // Configuração do botão "Voltar ao Jogo" no menu
    const btnBackToGame = document.querySelector('.back-button'); 
    if (btnBackToGame) {
        btnBackToGame.removeAttribute('href'); 
        btnBackToGame.style.cursor = 'pointer';
        btnBackToGame.addEventListener('click', (e) => {
            e.preventDefault();
            this.inputManager.lockPointer(); // Retoma o jogo travando o ponteiro
        });
        btnBackToGame.textContent = "Voltar ao Jogo";
    }

    this.isPaused = false;
    this.animationFrameId = null;
    this.lastFrameTime = performance.now();

    this.settingsMenu = document.getElementById('settings-container');
    const container = document.getElementById('canvas-container');
    if (container) {
      container.appendChild(this.renderer.domElement);
    }

    // --- LÓGICA DE PAUSE MASTER (Pointer Lock) ---
    // O estado de pausa é controlado exclusivamente pelo estado do ponteiro do mouse.
    this.inputManager.onPointerLockChange = (isLocked) => {
      const status = document.getElementById('pointer-status');
      
      if (isLocked) {
        // ESTADO: JOGO ATIVO
        this.isPaused = false;
        
        if (status) {
            status.innerHTML = '🖱️ Mouse travado <span style="color:#44ff44">✓</span>';
            status.style.color = '#E7E5D9';
        }

        if (this.settingsMenu) this.settingsMenu.style.display = 'none';

        this.lastFrameTime = performance.now();
        if (!this.animationFrameId) {
            this.animate();
        }

      } else {
        // ESTADO: PAUSADO
        if (!this.isGameOver) {
            this.isPaused = true;

            if (status) {
                status.innerHTML = 'Pressione <b>ESC</b> ou clique na tela para voltar'; 
                status.style.color = '#ff4444';
            }

            if (this.settingsMenu) this.settingsMenu.style.display = 'block';

            if (this.animationFrameId !== null) {
                cancelAnimationFrame(this.animationFrameId);
                this.animationFrameId = null;
            }
        }
      }
    };

    this.setupEventListeners();
    this.setupAudio();
    this.setupCollisions();
    this.setupPlayerAudio();
    this.setupSpells();

    this.enemyManager.setParticleSystem(this.spellManager.particleSystem);
    this.spellManager.setEnemyManager(this.enemyManager);

    this.speechRecognitionManager.start();

    // Render inicial
    setTimeout(() => {
        this.onWindowResize(); 
        this.render();         
    }, 100);
  }

  setupEventListeners() {
    window.addEventListener('resize', () => this.onWindowResize());

    document.addEventListener('keydown', (event) => {
      const key = event.key.toLowerCase();

      // Tecla ESC tenta retomar o jogo se já estiver pausado
      if (event.key === "Escape") {
          if (this.isPaused && !this.isGameOver) {
              this.inputManager.lockPointer();
          }
      }
    });

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this.inputManager.unlockPointer();
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
          if (this.isPaused) return;

          if (event.button === 0) {
             this.spellManager.castSpell('fireball', 0.5);
          } else if (event.button === 2) {
             this.spellManager.castSpell('ice', 0.5);
          }
      };

      this.speechRecognitionManager.onCommand = (command, intensity = 0.5) => {
          if (this.isPaused) return;

          const lowerCmd = command.toLowerCase();
          console.log(`Comando: ${lowerCmd}`);

          if (lowerCmd.includes('bola de fogo') || lowerCmd.includes('fireball') || lowerCmd.includes('fogo')) {
              this.spellManager.castSpell('fireball', intensity);
          } else if (lowerCmd.includes('gelo') || lowerCmd.includes('ice')) {
              this.spellManager.castSpell('ice', intensity);
          }
      };
  }

  onWindowResize() {
    this.player.onWindowResize();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.render(); 
  }

  update(deltaTime) {
    if (this.isPaused || this.isGameOver) return;
    
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
    if (this.isPaused) return;

    this.animationFrameId = requestAnimationFrame(this.animate);
    
    const currentTime = performance.now();
    const deltaTime = Math.min((currentTime - this.lastFrameTime) / 1000, 0.1);
    this.lastFrameTime = currentTime;

    this.update(deltaTime);
    this.render();
    this.fpsCounter.update();
  };

  dispose() {
    this.gameScene.dispose();
    this.enemyManager.dispose();
    this.renderer.dispose();
    this.fpsCounter.dispose();
    this.speechRecognitionManager.stop();
  }

  handleGameOver() {
    if (this.isGameOver) return;
    this.isGameOver = true;
    
    this.inputManager.unlockPointer();
    
    const screen = document.getElementById('game-over-screen');
    if (screen) screen.style.display = 'flex';
    document.getElementById('hud').style.display = 'none';
    document.getElementById('crosshair').style.display = 'none';
    
    if (this.settingsMenu) this.settingsMenu.style.display = 'none';
  }

  resetGame() {
    this.isGameOver = false;
    document.getElementById('game-over-screen').style.display = 'none';
    document.getElementById('hud').style.display = 'block';
    document.getElementById('crosshair').style.display = 'block';
    
    this.player.reset();
    if (this.enemyManager) {
        this.enemyManager.clearAllEnemies(); 
        this.enemyManager.spawnTimer = 0; 
    }
    
    this.inputManager.lockPointer();
    this.lastFrameTime = performance.now();
  }
}