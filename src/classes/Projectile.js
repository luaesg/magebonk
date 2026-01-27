import * as THREE from 'three';

export class Projectile {
  constructor(scene, position, direction, type, onCollision, intensity = 1.0) {
    this.scene = scene;
    this.direction = direction.normalize();
    this.speed = 1.5;
    this.type = type;
    this.onCollision = onCollision;
    this.life = 3.0;

    intensity = Math.max(0.3, Math.min(2.0, intensity));

    this.damage = type === 'fireball' ? 25 : 20;
    this.knockbackForce = type === 'fireball' ? 2.0 : 1.0;

    const geometry = new THREE.SphereGeometry(0.3, 8, 8);
    let material;

    switch (type) {
      case 'fireball':
        const baseRadius = 8.4;
        this.radius = baseRadius * intensity;

        this.mesh = new THREE.Mesh(new THREE.SphereGeometry(this.radius, 16, 16),
          new THREE.MeshStandardMaterial({
            color: 0xff4500,
            emissive: 0xff2200,
            emissiveIntensity: 4 * intensity,
            roughness: 0.4,
            metalness: 0.1
          })
        );
        this.light = new THREE.PointLight(0xffaa00, 35 * intensity, 70 * intensity);
        this.speed = 0.8;

        const core = new THREE.Mesh(
          new THREE.SphereGeometry(this.radius * 0.5, 16, 16),
          new THREE.MeshBasicMaterial({ color: 0xffff00 })
        );
        this.mesh.add(core);
        break;

      case 'ice':
        this.radius = 0.3;
        material = new THREE.MeshStandardMaterial({
          color: 0x00ffff,
          emissive: 0x0000ff,
          emissiveIntensity: 1,
          transparent: true,
          opacity: 0.8
        });
        this.mesh = new THREE.Mesh(geometry, material);
        this.light = new THREE.PointLight(0x00ffff, 3, 8);
        this.speed = 2.0;
        break;

      default:
        this.mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: 0xffffff }));
        this.light = new THREE.PointLight(0xffffff, 1, 5);
    }

    if (type !== 'fireball') {
      this.mesh.position.copy(position);
    } else {
      this.mesh.position.copy(position);
    }

    if (this.light) {
      this.mesh.add(this.light);
    }

    this.scene.add(this.mesh);
  }

  update(deltaTime, barriers) {
    const moveStep = this.direction.clone().multiplyScalar(this.speed);
    this.mesh.position.add(moveStep);

    this.life -= deltaTime;

    if (this.checkCollisions(barriers)) {
      return false;
    }

    if (this.mesh.position.y <= 0) {
      this.onCollision(this.mesh.position, this.type);
      return false;
    }

    if (this.life <= 0) {
      return false;
    }

    return true;
  }

  checkCollisions(barriers) {
    const pPos = this.mesh.position;
    const radius = 0.3;

    for (const barrier of barriers) {
      const bx = barrier.position.x;
      const bz = barrier.position.z;
      const by_min = 0;
      const by_max = barrier.height;

      const bw = barrier.width / 2;
      const bd = barrier.depth / 2;

      if (
        pPos.x > bx - bw - radius &&
        pPos.x < bx + bw + radius &&
        pPos.z > bz - bd - radius &&
        pPos.z < bz + bd + radius &&
        pPos.y > by_min &&
        pPos.y < by_max
      ) {
        this.onCollision(pPos, this.type);
        return true;
      }
    }
    return false;
  }

  dispose() {
    if (this.mesh) {
      this.scene.remove(this.mesh);
      this.mesh.geometry.dispose();
      this.mesh.material.dispose();
    }
  }
}
