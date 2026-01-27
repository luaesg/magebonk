import * as THREE from 'three';

export class Enemy {
  static STUN_DURATION_MS = 300;
  static ATTACK_FEEDBACK_DURATION_MS = 100;
  static DAMAGE_FLASH_DURATION_MS = 100;
  static DEATH_DISPOSAL_DELAY_MS = 200;
  static SEPARATION_FORCE_MULTIPLIER = 1.2;

  constructor(scene, position, player, particleSystem = null, enemyManager = null) {
    this.scene = scene;
    this.player = player;
    this.particleSystem = particleSystem;
    this.enemyManager = enemyManager;

    this.position = position.clone();
    this.velocity = new THREE.Vector3();
    this.knockbackVelocity = new THREE.Vector3();

    this.maxHP = 50;
    this.currentHP = 50;
    this.moveSpeed = 5.0;
    this.collisionRadius = 1.0;

    this.state = 'idle';
    this.detectionRadius = 30;
    this.attackRadius = 3;
    this.lostPlayerRadius = 50;

    this.attackDamage = 10;
    this.attackCooldown = 1000;
    this.lastAttackTime = 0;

    this.stunDuration = 0;
    this.isStunned = false;
    this.knockbackDecay = 0.9;

    this.separationRadius = 2.5;

    this.activeTimeouts = [];

    this.createMesh();
  }

  createMesh() {
    const geometry = new THREE.ConeGeometry(1, 2, 8);
    const material = new THREE.MeshStandardMaterial({
      color: 0xff0000,
      emissive: 0x330000,
      roughness: 0.7,
      metalness: 0.3
    });

    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.position.copy(this.position);
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;

    this.scene.add(this.mesh);
  }

  update(deltaTime = 0.016) {
    if (this.state === 'dead' || !this.mesh) return;

    switch(this.state) {
      case 'idle':
        this.updateIdleState(deltaTime);
        break;
      case 'chasing':
        this.updateChasingState(deltaTime);
        break;
      case 'attacking':
        this.updateAttackingState(deltaTime);
        break;
      case 'stunned':
        this.updateStunnedState(deltaTime);
        break;
    }

    this.mesh.position.copy(this.position);
  }

  updateIdleState(deltaTime) {
    const distance = this.getDistanceToPlayer();
    if (distance < this.detectionRadius) {
      this.setState('chasing');
    }
  }

  updateChasingState(deltaTime) {
    const distance = this.getDistanceToPlayer();

    if (distance > this.lostPlayerRadius) {
      this.setState('idle');
      return;
    }

    if (distance < this.attackRadius) {
      this.setState('attacking');
      return;
    }

    this.moveTowardPlayer(deltaTime);
  }

  updateAttackingState(deltaTime) {
    const distance = this.getDistanceToPlayer();

    if (distance > this.attackRadius) {
      this.setState('chasing');
      return;
    }

    this.attackPlayer();
  }

  updateStunnedState(deltaTime) {
    this.stunDuration -= deltaTime * 1000;

    this.applyKnockbackPhysics(deltaTime);

    if (this.stunDuration <= 0) {
      this.isStunned = false;
      const distance = this.getDistanceToPlayer();
      this.setState(distance < this.lostPlayerRadius ? 'chasing' : 'idle');
    }
  }

  setState(newState) {
    this.state = newState;
  }

  moveTowardPlayer(deltaTime) {
    const playerPos = this.player.getPosition();
    const direction = new THREE.Vector3()
      .subVectors(playerPos, this.position)
      .normalize();

    const moveStep = direction.multiplyScalar(this.moveSpeed * deltaTime);
    this.position.add(moveStep);

    this.applySeparation(deltaTime);

    this.mesh.lookAt(playerPos);
  }

  applySeparation(deltaTime) {
    if (!this.enemyManager) return;

    const separationForce = new THREE.Vector3();
    const enemies = this.enemyManager.getActiveEnemies();

    for (const other of enemies) {
      if (other === this) continue;

      const distance = this.position.distanceTo(other.position);
      if (distance < this.separationRadius && distance > 0) {
        const away = new THREE.Vector3()
          .subVectors(this.position, other.position)
          .normalize()
          .multiplyScalar(Enemy.SEPARATION_FORCE_MULTIPLIER * deltaTime);
        separationForce.add(away);
      }
    }

    this.position.add(separationForce);
  }

  attackPlayer() {
    const now = Date.now();
    if (now - this.lastAttackTime < this.attackCooldown) {
      return;
    }

    const distance = this.getDistanceToPlayer();
    if (distance < this.attackRadius) {
      this.player.takeDamage(this.attackDamage);
      this.lastAttackTime = now;

      this.showAttackFeedback();
    }
  }

  showAttackFeedback() {
    if (!this.mesh) return;

    const originalScale = this.mesh.scale.clone();
    this.mesh.scale.multiplyScalar(1.2);

    const timeoutId = setTimeout(() => {
      if (this.mesh) {
        this.mesh.scale.copy(originalScale);
      }
    }, Enemy.ATTACK_FEEDBACK_DURATION_MS);

    this.activeTimeouts.push(timeoutId);
  }

  takeDamage(amount) {
    if (this.state === 'dead') return;

    this.currentHP -= amount;

    if (this.currentHP <= 0) {
      this.die();
    } else {
      this.transitionToStunned(Enemy.STUN_DURATION_MS);
      this.flashDamage();
    }
  }

  transitionToStunned(duration) {
    this.setState('stunned');
    this.stunDuration = duration;
    this.isStunned = true;
  }

  applyKnockback(force, direction) {
    this.knockbackVelocity = direction.normalize().multiplyScalar(force);
  }

  applyKnockbackPhysics(deltaTime) {
    if (this.knockbackVelocity.length() > 0.01) {
      this.position.addScaledVector(this.knockbackVelocity, deltaTime);
      this.knockbackVelocity.multiplyScalar(this.knockbackDecay);
    }
  }

  flashDamage() {
    if (!this.mesh) return;

    const originalColor = this.mesh.material.color.clone();
    this.mesh.material.color.set(0xffffff);

    const timeoutId = setTimeout(() => {
      if (this.mesh) {
        this.mesh.material.color.copy(originalColor);
      }
    }, Enemy.DAMAGE_FLASH_DURATION_MS);

    this.activeTimeouts.push(timeoutId);
  }

  die() {
    this.state = 'dead';

    if (this.particleSystem) {
      this.particleSystem.emit(this.position, 'magic', 30, {
        speed: 1.0,
        decay: 0.02
      });
    }

    this.dispose();
  }

  getPosition() {
    return this.position.clone();
  }

  getDistanceToPlayer() {
    const playerPos = this.player.getPosition();
    return this.position.distanceTo(playerPos);
  }

  isAlive() {
    return this.state !== 'dead';
  }

  dispose() {
    this.activeTimeouts.forEach(timeoutId => clearTimeout(timeoutId));
    this.activeTimeouts = [];

    if (this.mesh) {
      this.scene.remove(this.mesh);
      this.mesh.geometry.dispose();
      this.mesh.material.dispose();
      this.mesh = null;
    }
  }
}
