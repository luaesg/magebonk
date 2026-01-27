import * as THREE from 'three';
import { Enemy } from './Enemy.js';

export class EnemyManager {
  constructor(gameScene, player, audioManager = null) {
    this.gameScene = gameScene;
    this.player = player;
    this.audioManager = audioManager;
    this.scene = gameScene.getScene();

    this.enemies = [];
    this.maxEnemies = 20;

    this.particleSystem = null;
  }

  setParticleSystem(particleSystem) {
    this.particleSystem = particleSystem;
  }

  spawnEnemy(position) {
    if (this.enemies.length >= this.maxEnemies) {
      console.warn('Max enemy limit reached');
      return null;
    }

    const enemy = new Enemy(this.scene, position, this.player, this.particleSystem, this);
    this.enemies.push(enemy);

    return enemy;
  }

  spawnEnemyWave(count, radius) {
    const playerPos = this.player.getPosition();
    const spawned = [];

    for (let i = 0; i < count; i++) {
      if (this.enemies.length >= this.maxEnemies) {
        break;
      }

      const position = this.generateSpawnPosition(playerPos, radius);
      const enemy = this.spawnEnemy(position);
      if (enemy) {
        spawned.push(enemy);
      }
    }

    return spawned;
  }

  generateSpawnPosition(playerPos, minDistance = 20, maxDistance = 40) {
    const angle = Math.random() * Math.PI * 2;
    const distance = minDistance + Math.random() * (maxDistance - minDistance);

    return new THREE.Vector3(
      playerPos.x + Math.cos(angle) * distance,
      3,
      playerPos.z + Math.sin(angle) * distance
    );
  }

  update(deltaTime = 0.016) {
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const enemy = this.enemies[i];

      enemy.update(deltaTime);

      if (!enemy.isAlive() && enemy.state === 'dead') {
        this.enemies.splice(i, 1);
      }
    }
  }

  checkProjectileHit(projectile) {
    const projPos = projectile.mesh.position;
    const projRadius = projectile.radius || 0.5;

    for (const enemy of this.enemies) {
      if (enemy.state === 'dead' || !enemy.mesh) continue;

      const distance = enemy.position.distanceTo(projPos);
      if (distance < enemy.collisionRadius + projRadius) {
        const knockbackDir = new THREE.Vector3()
          .subVectors(enemy.position, projPos)
          .normalize();

        const knockbackForce = projectile.knockbackForce || (projectile.type === 'fireball' ? 2.0 : 1.0);
        const damage = projectile.damage || (projectile.type === 'fireball' ? 25 : 20);

        enemy.takeDamage(damage);
        enemy.applyKnockback(knockbackForce, knockbackDir);

        return enemy;
      }
    }

    return null;
  }

  getActiveEnemies() {
    return this.enemies.filter(e => e.isAlive());
  }

  getEnemyCount() {
    return this.enemies.length;
  }

  clearAllEnemies() {
    for (const enemy of this.enemies) {
      enemy.dispose();
    }
    this.enemies = [];
  }

  dispose() {
    this.clearAllEnemies();
  }
}
