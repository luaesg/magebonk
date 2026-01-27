import * as THREE from 'three';
import { Projectile } from './Projectile.js';
import { ParticleSystem } from './ParticleSystem.js';

export class SpellManager {
  constructor(gameScene, player, audioManager, enemyManager = null) {
    this.gameScene = gameScene;
    this.player = player;
    this.audioManager = audioManager;
    this.enemyManager = enemyManager;
    this.scene = gameScene.getScene();
    this.projectiles = [];
    this.particleSystem = new ParticleSystem(this.scene);
    this.spellNameElement = document.getElementById('spell-name');
    this.burningZones = [];
    this.cooldowns = {
        fireball: 0,
        ice: 0
    };
    this.maxCooldowns = {
        fireball: 500,
        ice: 300
    };
  }

  setEnemyManager(enemyManager) {
    this.enemyManager = enemyManager;
  }

  castSpell(spellName, intensity = 0.5) {
    const now = Date.now();
    if (this.cooldowns[spellName] && now < this.cooldowns[spellName]) {
        console.log(`Spell ${spellName} em cooldown.`);
        return;
    }

    const camera = this.player.getCamera();
    const direction = new THREE.Vector3();
    camera.getWorldDirection(direction);

    const origin = camera.position.clone().add(direction.clone().multiplyScalar(1.5));
    const right = new THREE.Vector3().crossVectors(direction, new THREE.Vector3(0, 1, 0)).normalize();
    origin.add(right.multiplyScalar(0.5));
    origin.y -= 0.3;

    let displayText = "";

    switch (spellName) {
        case 'fireball':
            this.createProjectile(origin, direction, 'fireball', intensity);
            this.audioManager.playSound('fireball');
            displayText = "Bola de Fogo";
            this.cooldowns.fireball = now + this.maxCooldowns.fireball;
            break;
        case 'ice':
            this.createProjectile(origin, direction, 'ice', intensity);
            this.audioManager.playSound('ice');
            displayText = "Gelo";
            this.cooldowns.ice = now + this.maxCooldowns.ice;
            break;
        default:
            console.warn(`Feitiço desconhecido: ${spellName}`);
    }
    
    if (intensity > 1.2) displayText += " (MAXIMO!)";
    else if (intensity > 0.8) displayText += " (FORTE)";
    
    this.updateScrollText(displayText);
  }

  updateScrollText(text) {
      if (this.spellNameElement) {
          this.spellNameElement.textContent = text;
          
          this.spellNameElement.style.transform = 'translate(-50%, -50%) scale(1.2)';
          setTimeout(() => {
              this.spellNameElement.style.transform = 'translate(-50%, -50%) scale(1)';
          }, 100);
      }
  }

  createProjectile(origin, direction, type, intensity) {
    const projectile = new Projectile(
        this.scene, 
        origin, 
        direction, 
        type, 
        (pos, type) => this.onProjectileCollision(pos, type),
        intensity
    );
    this.projectiles.push(projectile);
  }

  onProjectileCollision(position, type) {
    if (type === 'fireball') {
        this.particleSystem.emit(position, 'fire', 200, { speed: 1.5, decay: 0.01, scale: 5.0 });
        this.particleSystem.emit(position, 'spark', 100, { speed: 2.0, decay: 0.02 });
        this.particleSystem.emit(position, 'smoke', 100, { speed: 0.5, decay: 0.005, scale: 8.0 });
        this.burningZones.push({
            position: position.clone(),
            startTime: Date.now(),
            duration: 10000,
            radius: 5
        });

    } else if (type === 'ice') {
        this.particleSystem.emit(position, 'ice', 15, { speed: 0.2, decay: 0.05 });
    }
  }

  update(deltaTime = 0.016) {
    this.particleSystem.update();

    const now = Date.now();
    for (let i = this.burningZones.length - 1; i >= 0; i--) {
        const zone = this.burningZones[i];
        if (now - zone.startTime > zone.duration) {
            this.burningZones.splice(i, 1);
            continue;
        }
        if (Math.random() > 0.1) {
            const offset = new THREE.Vector3(
                (Math.random() - 0.5) * zone.radius * 2,
                0,
                (Math.random() - 0.5) * zone.radius * 2
            );
            const emitPos = zone.position.clone().add(offset);
            emitPos.y = 0; 
            
            this.particleSystem.emit(emitPos, 'fire', 1, { speed: 0.2, decay: 0.02, scale: 1.5 });
            if (Math.random() > 0.5) {
                this.particleSystem.emit(emitPos, 'smoke', 1, { speed: 0.3, decay: 0.01, scale: 2.0 });
            }
        }
    }

    const barriers = this.gameScene.getBarriers();
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
        const proj = this.projectiles[i];

        if (this.enemyManager) {
            const hitEnemy = this.enemyManager.checkProjectileHit(proj);
            if (hitEnemy) {
                proj.onCollision(proj.mesh.position, proj.type);
                proj.dispose();
                this.projectiles.splice(i, 1);
                continue;
            }
        }

        if (proj.type === 'fireball') {
            const rastroPos = proj.mesh.position.clone();
            rastroPos.x += (Math.random() - 0.5) * 10;
            rastroPos.y += (Math.random() - 0.5) * 10;
            rastroPos.z += (Math.random() - 0.5) * 10;

            this.particleSystem.emit(rastroPos, 'fire', 2, { speed: 0.1, decay: 0.05, scale: 2.0 });
            if (Math.random() > 0.7) {
                 this.particleSystem.emit(rastroPos, 'smoke', 1, { speed: 0.1, scale: 3.0 });
            }
        }

        const alive = proj.update(deltaTime, barriers);
        if (!alive) {
            proj.dispose();
            this.projectiles.splice(i, 1);
        }
    }
  }
}
