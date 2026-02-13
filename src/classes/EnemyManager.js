import * as THREE from 'three';
import { Enemy } from './Enemy.js';

// Definição dos Estados do Jogo (Ciclo da Horda)
const STATE_REST = 'REST';           // Intervalo entre hordas
const STATE_ANNOUNCE = 'ANNOUNCE';   // Exibição do título da horda
const STATE_COUNTDOWN = 'COUNTDOWN'; // Contagem regressiva 3, 2, 1
const STATE_WAVE = 'WAVE';           // Combate ativo
const STATE_VICTORY = 'VICTORY';     // Horda concluída

export class EnemyManager {
  constructor(gameScene, player, audioManager = null) {
    this.gameScene = gameScene;
    this.player = player;
    this.audioManager = audioManager;
    this.scene = gameScene.getScene();

    this.enemies = [];
    this.particleSystem = null;

    // Estado Inicial
    this.state = STATE_REST;
    this.hordeLevel = 1;
    this.stateTimer = 5.0; // Tempo de descanso fixo

    // Controle de Entidades
    this.totalEnemiesInWave = 0;
    this.enemiesSpawnedCount = 0;
    this.enemiesKilledCount = 0;
    this.maxActiveEnemies = 15; 
    this.pendingSpawns = 0;
    
    // Referência ao Boss atual para barra de vida
    this.currentBoss = null;

    // Elementos de UI
    this.uiLevel = document.getElementById('horde-level-display');
    this.uiProgress = document.getElementById('horde-progress-fill');
    this.uiLabel = document.getElementById('horde-label'); // NOVO: Label vertical
    this.uiOverlay = document.getElementById('center-overlay');

    this.updateHordeUI();
  }

  setParticleSystem(particleSystem) {
    this.particleSystem = particleSystem;
  }

  /**
   * Atualiza a lógica do gerenciador a cada frame.
   * Executa a função correspondente ao estado atual.
   */
  update(dt) {
    // Atualização da barra de vida do Boss em tempo real (se houver boss vivo)
    if (this.currentBoss && this.currentBoss.isAlive()) {
        this.updateBossHealthBar();
    }

    switch (this.state) {
        case STATE_REST: this.updateRestState(dt); break;
        case STATE_ANNOUNCE: this.updateAnnounceState(dt); break;
        case STATE_COUNTDOWN: this.updateCountdownState(dt); break;
        case STATE_WAVE: this.updateWaveState(dt); break;
        case STATE_VICTORY: this.updateVictoryState(dt); break;
    }

    // Atualiza individualmente cada inimigo
    for (let i = this.enemies.length - 1; i >= 0; i--) {
        const enemy = this.enemies[i];
        enemy.update(dt);
        if (!enemy.isAlive()) {
            this.enemies.splice(i, 1);
        }
    }
  }

  // --- MÁQUINA DE ESTADOS ---

  updateRestState(dt) {
      this.stateTimer -= dt;
      if (this.uiOverlay) this.uiOverlay.innerHTML = ''; 
      if (this.stateTimer <= 0) this.enterAnnounceState();
  }

  enterAnnounceState() {
      this.state = STATE_ANNOUNCE;
      const isBossLevel = (this.hordeLevel % 5 === 0);
      let msg = `HORDA ${this.hordeLevel}`;
      let color = "#C5A45A"; 

      // Configuração UI para Boss ou Horda Normal
      if (isBossLevel) {
          msg = `HORDA ${this.hordeLevel}<br><span style="font-size: 0.4em; letter-spacing: 0.3em; color: #FF0000; text-shadow: 0 0 15px #FF0000;">O NECROMANTE</span>`;
          color = "#FFFFFF"; 
          
          // UI: Muda texto para BOSS e cor da barra para Vermelho
          if (this.uiLabel) {
              this.uiLabel.innerHTML = 'B<br>O<br>S<br>S';
              this.uiLabel.style.color = '#ff4444';
          }
          if (this.uiProgress) {
              this.uiProgress.style.background = 'linear-gradient(to top, #8B0000, #FF0000)';
          }
      } else {
          // UI: Muda texto para HORDA e cor da barra para Roxo (Padrão)
          if (this.uiLabel) {
              this.uiLabel.innerHTML = 'H<br>O<br>R<br>D<br>A';
              this.uiLabel.style.color = '#C5A45A';
          }
          if (this.uiProgress) {
              this.uiProgress.style.background = 'linear-gradient(to top, #4B0082, #8A2BE2)';
          }
      }

      this.showOverlayMessage(msg, color, 3000); 
      this.stateTimer = 3.0;
  }

  updateAnnounceState(dt) {
      this.stateTimer -= dt;
      if (this.stateTimer <= 0) this.enterCountdownState();
  }

  enterCountdownState() {
      this.state = STATE_COUNTDOWN;
      this.stateTimer = 3.5; 
      this.lastCountdownInt = 4;
      if (this.uiOverlay) this.uiOverlay.innerHTML = '';
  }

  updateCountdownState(dt) {
      this.stateTimer -= dt;
      const currentInt = Math.ceil(this.stateTimer);
      if (currentInt < this.lastCountdownInt && currentInt > 0) {
          this.showOverlayText(currentInt.toString(), "overlay-countdown");
          this.lastCountdownInt = currentInt;
      }
      if (this.stateTimer <= 0) this.enterWaveState();
  }

  enterWaveState() {
      this.state = STATE_WAVE;
      if (this.uiOverlay) this.uiOverlay.innerHTML = '';
      this.calculateWaveSize();
      this.enemiesSpawnedCount = 0;
      this.enemiesKilledCount = 0;
      this.pendingSpawns = 0;
      
      // Reseta Boss atual
      this.currentBoss = null;
      
      // Reinicia barra cheia
      if(this.uiProgress) this.uiProgress.style.height = '100%';
  }

  // Define o tamanho da horda baseado no nível
  calculateWaveSize() {
      if (this.hordeLevel % 5 === 0) {
          this.totalEnemiesInWave = 1; // Boss é único
      } else {
          this.totalEnemiesInWave = 5 + (this.hordeLevel * 2);
      }
  }

  updateWaveState(dt) {
      const currentTotal = this.enemies.length + this.pendingSpawns;
      // Controle de fluxo de spawn (limite de inimigos simultâneos)
      if (this.enemiesSpawnedCount < this.totalEnemiesInWave && currentTotal < this.maxActiveEnemies) {
          this.spawnNextEnemy();
      }
      // Condição de vitória da horda
      if (this.enemiesKilledCount >= this.totalEnemiesInWave) {
          this.enterVictoryState();
      }
  }

  // --- LÓGICA DE SPAWN ---

  spawnNextEnemy() {
      this.enemiesSpawnedCount++;
      this.pendingSpawns++; 

      const playerPos = this.player.getPosition();
      const pos = this.generateSpawnPosition(playerPos);

      let config = { type: 'normal' };
      
      // Lógica de Spawn para Boss (Horda Múltipla de 5)
      if (this.hordeLevel % 5 === 0) {
          config = { isBoss: true, hp: 400 + (this.hordeLevel * 50), scale: 3.5, color: 0x4B0082, speed: 2.0 };
      } 
      // Lógica de Spawn para Mini-Bosses (Horda Par)
      else if (this.hordeLevel % 2 === 0) {
          const numMiniBosses = Math.floor(this.hordeLevel / 2);
          if (this.enemiesSpawnedCount <= numMiniBosses) {
              config = { isMiniBoss: true, hp: 120 + (this.hordeLevel * 15), scale: 1.8, damage: 20 };
          } else {
              config = { hp: 20 + (this.hordeLevel * 2), speed: 3.0 + (Math.random() * 1.5) };
          }
      } 
      // Inimigos Normais
      else {
          config = { hp: 20 + (this.hordeLevel * 2), speed: 3.0 + (Math.random() * 1.5) };
      }

      this.executeSpawn(pos, config);
  }

  executeSpawn(pos, config) {
      // Efeito visual de fumaça antes do inimigo aparecer
      if (this.particleSystem) {
          this.particleSystem.emit(pos, 'smoke', 10, { speed: 0.1, scale: 2.0 });
      }
      // Delay para sincronizar com a fumaça
      setTimeout(() => {
          this.pendingSpawns = Math.max(0, this.pendingSpawns - 1);
          // Validação: não spawnar se o estado mudou
          if (this.state !== STATE_WAVE && this.state !== STATE_ANNOUNCE) return; 
          
          const enemy = new Enemy(this.scene, pos, this.player, this.particleSystem, this, config);
          
          // Se for o Boss, guarda a referência para atualizar a barra de vida
          if (config.isBoss) {
              this.currentBoss = enemy;
          }
          
          this.enemies.push(enemy);
      }, 500);
  }

  /**
   * Habilidade do Boss: Invoca clones menores ao redor.
   */
  bossSummon(bossPos) {
      const count = Math.floor(Math.random() * 4) + 3; // 3 a 6 minions
      for(let i = 0; i < count; i++) {
          const angle = Math.random() * Math.PI * 2;
          const dist = 5 + Math.random() * 5;
          
          let spawnX = bossPos.x + Math.cos(angle) * dist;
          let spawnZ = bossPos.z + Math.sin(angle) * dist;
          
          // Clamp (Restrição) para garantir que minions não nasçam fora da arena
          spawnX = Math.max(-45, Math.min(45, spawnX));
          spawnZ = Math.max(-45, Math.min(45, spawnZ));

          const spawnPos = new THREE.Vector3(spawnX, 2, spawnZ);

          const config = {
              type: 'clone', hp: 15 + (this.hordeLevel), speed: 6.0, 
              damage: 5, scale: 0.7, color: 0x663399 
          };
          this.executeSpawn(spawnPos, config);
      }
  }

  handleEnemyDeath(enemy) {
      // Se o Boss morrer, elimina todos os clones ativos
      if (enemy.config.isBoss) {
          this.currentBoss = null; // Limpa referência do boss
          for (let i = this.enemies.length - 1; i >= 0; i--) {
              const other = this.enemies[i];
              if (other.config.type === 'clone' && other.isAlive()) {
                  other.takeDamage(9999, null, 0); 
              }
          }
      }

      // Clones invocados não contam para o progresso da horda
      if (this.state === STATE_WAVE && enemy.config.type !== 'clone') {
          this.enemiesKilledCount++;
          // Se NÃO for fase de Boss, atualiza a barra com base no número de mortes
          if (!this.currentBoss) {
              this.updateProgressBar();
          }
      }
  }

  enterVictoryState() {
      this.state = STATE_VICTORY;
      this.stateTimer = 3.0; 
      this.showOverlayMessage("HORDA CONCLUÍDA", "#44ff44", 3000); 
  }

  updateVictoryState(dt) {
      this.stateTimer -= dt;
      if (this.stateTimer <= 0) {
          this.hordeLevel++;
          this.updateHordeUI();
          this.state = STATE_REST;
          this.stateTimer = 5.0; 
          if(this.uiProgress) this.uiProgress.style.height = '100%';
      }
  }

  /**
   * Gera uma posição de spawn aleatória ao redor do jogador.
   * Aplica CLAMP (limite) para garantir coordenadas dentro da arena.
   */
  generateSpawnPosition(center) {
      const angle = Math.random() * Math.PI * 2;
      const dist = 25 + Math.random() * 25; 
      
      let x = center.x + Math.cos(angle) * dist;
      let z = center.z + Math.sin(angle) * dist;

      // Arena Size: 100 (-50 a +50). Margem de segurança: 5.
      x = Math.max(-45, Math.min(45, x));
      z = Math.max(-45, Math.min(45, z));

      return new THREE.Vector3(x, 3, z);
  }

  updateHordeUI() {
      if (this.uiLevel) this.uiLevel.textContent = `HORDA ${this.hordeLevel}`;
  }

  /**
   * Atualiza a barra de progresso para hordas normais.
   * A barra diminui conforme os inimigos morrem.
   */
  updateProgressBar() {
      if (!this.uiProgress) return;
      const remaining = this.totalEnemiesInWave - this.enemiesKilledCount;
      const percentage = (remaining / this.totalEnemiesInWave) * 100;
      this.uiProgress.style.height = `${Math.max(0, percentage)}%`;
  }

  /**
   * Atualiza a barra de progresso baseada na VIDA do Boss.
   * A barra diminui conforme o Boss toma dano.
   */
  updateBossHealthBar() {
      if (!this.uiProgress || !this.currentBoss) return;
      // config.hp é usado como MaxHP na inicialização do Enemy
      const maxHp = this.currentBoss.config.hp; 
      const currentHp = this.currentBoss.hp;
      const percentage = (currentHp / maxHp) * 100;
      this.uiProgress.style.height = `${Math.max(0, percentage)}%`;
  }

  // Utilitários de UI e colisão...
  showOverlayMessage(text, color, duration = 3000) {
      if (!this.uiOverlay) return;
      this.uiOverlay.innerHTML = `<div class="overlay-msg" style="color:${color}">${text}</div>`;
      setTimeout(() => { 
          if (this.uiOverlay.innerHTML.includes(text)) this.uiOverlay.innerHTML = ''; 
      }, duration);
  }

  showOverlayText(text, className) {
      if (!this.uiOverlay) return;
      this.uiOverlay.innerHTML = `<div class="${className}">${text}</div>`;
  }

  /**
   * Verifica colisão entre projétil e inimigos.
   * NOVA LÓGICA: Hitbox Cilíndrica (Altura + Raio) em vez de Esférica.
   */
  checkProjectileHit(projectile) {
      const projPos = projectile.mesh.position;
      const projRadius = projectile.radius || 0.5;

      for (const enemy of this.enemies) {
        if (!enemy.isAlive() || !enemy.mesh) continue;

        const dx = enemy.mesh.position.x - projPos.x;
        const dz = enemy.mesh.position.z - projPos.z;
        const horizontalDist = Math.sqrt(dx*dx + dz*dz);
        const hitRadius = enemy.collisionRadius + projRadius;

        if (horizontalDist < hitRadius) {
             const dy = projPos.y - enemy.mesh.position.y;
             const enemyHeight = 3.0 * enemy.config.scale; 

             if (dy > 0 && dy < enemyHeight) {
                 const dir = new THREE.Vector3().subVectors(enemy.mesh.position, projPos).normalize();
                 enemy.takeDamage(projectile.damage, dir, projectile.knockbackForce);
                 return enemy;
             }
        }
      }
      return null;
  }

  clearAllEnemies() {
      this.enemies.forEach(e => e.dispose());
      this.enemies = [];
      this.pendingSpawns = 0;
      this.hordeLevel = 1;
      this.currentBoss = null;
      this.state = STATE_REST;
      this.stateTimer = 5.0;
      this.updateHordeUI();
      if(this.uiProgress) {
          this.uiProgress.style.height = '100%';
          // Reseta a cor para roxo caso tenha saído de um boss
          this.uiProgress.style.background = 'linear-gradient(to top, #4B0082, #8A2BE2)';
      }
      if (this.uiLabel) {
          this.uiLabel.innerHTML = 'H<br>O<br>R<br>D<br>A';
          this.uiLabel.style.color = '#C5A45A';
      }
      if(this.uiOverlay) this.uiOverlay.innerHTML = '';
  }
  
  dispose() { this.clearAllEnemies(); }
}