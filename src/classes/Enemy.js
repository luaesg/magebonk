import * as THREE from 'three';

/**
 * Classe Enemy
 * Representa um inimigo individual no jogo.
 * Gerencia malha 3D, máquina de estados (IA), física de movimento e combate.
 */
export class Enemy {
  constructor(scene, position, player, particleSystem, enemyManager, config = {}) {
    this.scene = scene;
    this.player = player;
    this.particleSystem = particleSystem;
    this.enemyManager = enemyManager;
    
    // Configurações padrão com merge das configurações recebidas
    this.config = {
        type: 'normal',
        hp: 30,
        speed: 3.5,          // Velocidade de perseguição
        patrolSpeed: 1.5,    // Velocidade de patrulha
        damage: 10,
        scale: 1.2,
        color: 0xff0000,
        detectionRadius: 35.0, // Raio para detecção do jogador
        isMiniBoss: false,
        isBoss: false,
        ...config 
    };

    this.hp = this.config.hp;
    this.isDead = false;
    
    // Estado inicial da IA
    this.state = 'wandering'; 
    
    // Parâmetros de Combate
    this.attackRange = 2.5 * this.config.scale; 
    this.attackCooldown = 1500;
    this.lastAttackTime = 0;
    
    // Variáveis de Controle de Patrulha
    this.patrolTarget = null;
    this.patrolTimer = 0;
    this.idleTimer = 0;

    // Variáveis de Controle do Boss
    this.summonTimer = 0;
    this.summonInterval = 8.0;

    // Física e Posição
    this.position = position.clone();
    this.position.y = 0; // Garante alinhamento com o chão (Pivô na base)

    this.velocity = new THREE.Vector3();
    this.pushForce = new THREE.Vector3(); // Vetor para knockback
    this.lungeOffset = new THREE.Vector3(0, 0, 0); // Offset para animação de ataque
    this.collisionRadius = 1.2 * this.config.scale;
    this.friction = 4.0; // Resistência para desacelerar o knockback
    
    this.activeTimeouts = [];
    this.mesh = null;
    this.createMesh();
  }

  /**
   * Cria a representação visual do inimigo (Mesh).
   * Utiliza geometria Low Poly (Cone com 3 segmentos) ou Icosaedro para Bosses.
   */
  createMesh() {
    let geometry;
    
    if (this.config.isBoss) {
        geometry = new THREE.IcosahedronGeometry(2.0, 0); 
        // Ajuste de Pivô: Move a geometria para que o centro (0,0,0) seja a base do objeto
        geometry.translate(0, 2.0, 0);
    } else {
        // Geometria Triangular (Pirâmide)
        geometry = new THREE.ConeGeometry(0.7, 2.5, 3); 
        // Ajuste de Pivô: Base no chão
        geometry.translate(0, 1.25, 0); 
        // Rotação para alinhar a "frente" da pirâmide
        geometry.rotateY(-Math.PI / 6); 
    }

    const material = new THREE.MeshStandardMaterial({ 
        color: this.config.color,
        roughness: 0.7,
        flatShading: true, // Low Poly
        emissive: this.config.color,
        emissiveIntensity: 0.1
    });

    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.position.copy(this.position);
    this.mesh.castShadow = true;
    this.mesh.scale.setScalar(this.config.scale);

    if (this.config.isMiniBoss) this.addCrown();
    this.scene.add(this.mesh);
  }

  /**
   * Adiciona um adorno visual (Coroa/Cristal) para unidades especiais.
   */
  addCrown() {
      const crownGeo = new THREE.OctahedronGeometry(0.5, 0); 
      const crownMat = new THREE.MeshStandardMaterial({ 
          color: 0xFFD700, 
          emissive: 0xFFAA00,
          emissiveIntensity: 0.6,
          metalness: 0.8
      });
      this.crown = new THREE.Mesh(crownGeo, crownMat);
      
      // Posiciona acima da altura total da geometria base
      const headHeight = 2.5; 
      this.crown.position.y = headHeight + 0.8; 
      this.mesh.add(this.crown);
  }

  /**
   * Loop de atualização principal.
   * @param {number} dt - Delta time (tempo desde o último frame).
   */
  update(dt) {
    if (this.isDead || !this.mesh) return;

    // Habilidade passiva do Boss: Invocação de minions
    if (this.config.isBoss) {
        this.summonTimer += dt;
        if (this.summonTimer >= this.summonInterval) {
            this.summonTimer = 0;
            if (this.enemyManager) this.enemyManager.bossSummon(this.position);
        }
    }

    // Animação da Coroa
    if (this.crown) {
        this.crown.rotation.y += 3 * dt;
        this.crown.position.y = (2.5) + 0.8 + Math.sin(Date.now() * 0.005) * 0.2;
    }

    // Máquina de Estados da IA
    switch(this.state) {
        case 'wandering': this.updateWandering(dt); break;
        case 'chasing': this.updateChasing(dt); break;
        case 'attacking': this.updateAttacking(dt); break;
        case 'stunned': this.updateStunned(dt); break;
    }

    // Aplicação da posição final (Física + Animação)
    const finalPos = this.position.clone().add(this.lungeOffset);
    this.mesh.position.copy(finalPos);
  }

  /**
   * Calcula distância horizontal (plano XZ) até o jogador.
   */
  getHorizontalDistanceToPlayer() {
      const playerPos = this.player.getPosition();
      const dx = this.position.x - playerPos.x;
      const dz = this.position.z - playerPos.z;
      return Math.sqrt(dx * dx + dz * dz);
  }

  /**
   * Estado: Patrulha (Wandering).
   * O inimigo move-se aleatoriamente quando o jogador está longe.
   */
  updateWandering(dt) {
      const distToPlayer = this.getHorizontalDistanceToPlayer();

      // Transição: Se detectar jogador, muda para perseguição
      if (distToPlayer < this.config.detectionRadius) {
          this.setState('chasing'); 
          return;
      }

      // Comportamento Idle (Parado)
      if (this.idleTimer > 0) {
          this.idleTimer -= dt;
          return;
      }

      // Definição de novo ponto de patrulha
      if (!this.patrolTarget || this.position.distanceTo(this.patrolTarget) < 1.0) {
          this.pickNewPatrolPoint();
          // Chance de 30% de entrar em estado Idle
          if (Math.random() < 0.3) {
              this.idleTimer = 2.0 + Math.random() * 2.0;
              return;
          }
      }

      // Movimentação
      const direction = new THREE.Vector3(
          this.patrolTarget.x - this.position.x,
          0,
          this.patrolTarget.z - this.position.z
      ).normalize();

      this.position.add(direction.multiplyScalar(this.config.patrolSpeed * dt));
      
      const lookPos = new THREE.Vector3(this.patrolTarget.x, this.position.y, this.patrolTarget.z);
      this.mesh.lookAt(lookPos);
  }

  pickNewPatrolPoint() {
      // Gera coordenada aleatória dentro dos limites da arena (~90 unidades)
      const x = (Math.random() - 0.5) * 90; 
      const z = (Math.random() - 0.5) * 90;
      this.patrolTarget = new THREE.Vector3(x, this.position.y, z);
  }

  /**
   * Estado: Perseguição (Chasing).
   * O inimigo corre em direção ao jogador.
   */
  updateChasing(dt) {
    const playerPos = this.player.getPosition();
    const dist = this.getHorizontalDistanceToPlayer();

    // Transição: Jogador muito longe -> Voltar a patrulhar
    if (dist > this.config.detectionRadius * 2.0) {
        this.setState('wandering');
        return;
    }

    // Transição: Jogador no alcance -> Atacar
    if (dist <= this.attackRange) {
        this.setState('attacking');
        return;
    }

    const direction = new THREE.Vector3(
        playerPos.x - this.position.x, 
        0, 
        playerPos.z - this.position.z
    ).normalize();
    
    // Movimento (apenas se não estiver sofrendo knockback forte)
    if (this.pushForce.length() < 1.0) {
        this.position.add(direction.multiplyScalar(this.config.speed * dt));
        
        // Evita rotação instável (jitter) quando muito próximo ao alvo
        if (dist > 1.0) {
            this.mesh.lookAt(new THREE.Vector3(playerPos.x, this.position.y, playerPos.z));
        }
    } else {
        this.applyPhysics(dt);
    }
  }

  /**
   * Estado: Ataque (Attacking).
   * Realiza o ataque e gerencia o cooldown.
   */
  updateAttacking(dt) {
    const dist = this.getHorizontalDistanceToPlayer();
    if (dist > this.attackRange * 1.5) { 
        this.setState('chasing');
        return;
    }
    
    const playerPos = this.player.getPosition();
    if (dist > 1.0) {
        this.mesh.lookAt(new THREE.Vector3(playerPos.x, this.position.y, playerPos.z));
    }

    const now = Date.now();
    if (now - this.lastAttackTime > this.attackCooldown) this.attackPlayer();
    
    this.applyPhysics(dt);
  }

  /**
   * Estado: Atordoado (Stunned).
   * Ocorre após receber dano com knockback.
   */
  updateStunned(dt) {
      this.applyPhysics(dt);
      // Recuperação quando a força de empurrão dissipa
      if (this.pushForce.length() < 0.5) this.setState('chasing'); 
  }

  // Aplica forças físicas (knockback) com atrito
  applyPhysics(dt) {
      this.position.add(this.pushForce.clone().multiplyScalar(dt));
      this.pushForce.multiplyScalar(Math.max(0, 1 - (this.friction * dt)));
  }

  // Garante que a posição Y permaneça no chão
  updateFloatHeight() {
      this.position.y = 0; 
  }

  setState(newState) { 
      this.state = newState;
  }

  // Executa lógica de dano ao jogador e animação de investida
  attackPlayer() {
      this.lastAttackTime = Date.now();
      if (this.player.takeDamage) this.player.takeDamage(this.config.damage);
      
      // Animação visual de "bote"
      const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(this.mesh.quaternion);
      forward.normalize();
      const lungeDistance = 1.2; 
      this.lungeOffset.copy(forward.multiplyScalar(lungeDistance));
      
      const tId = setTimeout(() => { this.lungeOffset.set(0, 0, 0); }, 150); 
      this.activeTimeouts.push(tId);
  }

  /**
   * Recebe dano, aplica knockback e flash visual.
   */
  takeDamage(amount, knockbackDir, knockbackForce) {
    this.hp -= amount;
    
    // Força estado de perseguição ao receber dano
    if (this.state === 'wandering') {
        this.setState('chasing');
        this.idleTimer = 0;
    }

    if (knockbackDir) {
        // Cálculo de resistência baseada no tipo de inimigo
        let resistance = 1.0;
        if (this.config.isMiniBoss) resistance = 0.5;
        if (this.config.isBoss) resistance = 0.1;
        
        knockbackDir.y = 0; 
        this.pushForce.add(knockbackDir.normalize().multiplyScalar(knockbackForce * resistance));
        this.setState('stunned');
    }

    // Feedback visual (piscar branco)
    const oldColor = this.mesh.material.color.getHex();
    this.mesh.material.color.setHex(0xffffff);
    const tId = setTimeout(() => { 
        if(this.mesh) this.mesh.material.color.setHex(oldColor); 
    }, 80);
    this.activeTimeouts.push(tId);

    if (this.hp <= 0) this.die();
  }

  die() {
    this.isDead = true;
    this.dispose();
    if (this.enemyManager) this.enemyManager.handleEnemyDeath(this);
  }

  dispose() {
    this.activeTimeouts.forEach(id => clearTimeout(id));
    if (this.mesh) {
        this.scene.remove(this.mesh);
        this.mesh.geometry.dispose();
        this.mesh.material.dispose();
        this.mesh = null;
    }
  }

  isAlive() { return !this.isDead; }
}