export class InputManager {
  constructor() {
    this.keys = {
      w: false,
      a: false,
      s: false,
      d: false,
      arrowUp: false,
      arrowDown: false,
      arrowLeft: false,
      arrowRight: false,
    };

    this.isPointerLocked = false;
    this.mouseSensitivity = 0.003;

    this.onMouseMove = null;
    this.onJump = null;
    this.onMouseDown = null;
    this.onPointerLockChange = null;

    this.setupEventListeners();
  }

  setupEventListeners() {
    document.addEventListener('keydown', (e) => this.handleKeyDown(e), false);
    document.addEventListener('keyup', (e) => this.handleKeyUp(e), false);
    document.addEventListener('mousemove', (e) => this.handleMouseMove(e), false);

    document.addEventListener('click', () => {
      if (!this.isPointerLocked) {
        const requestPointerLock =
          document.body.requestPointerLock ||
          document.body.mozRequestPointerLock ||
          document.body.webkitRequestPointerLock;

        if (requestPointerLock) {
          requestPointerLock.call(document.body);
        }
      }
    });

    document.addEventListener('mousedown', (e) => {
      if (this.isPointerLocked) {
        this.onMouseDown?.(e);
      }
    });

    document.addEventListener('contextmenu', (e) => {
      if (this.isPointerLocked) {
        e.preventDefault();
      }
    });

    const pointerLockChangeHandler = () => {
      this.isPointerLocked = !!(
        document.pointerLockElement === document.body ||
        document.mozPointerLockElement === document.body ||
        document.webkitPointerLockElement === document.body
      );
      console.log('Pointer Lock:', this.isPointerLocked ? 'ATIVADO ✓' : 'DESATIVADO ✗');
      this.onPointerLockChange?.(this.isPointerLocked);
    };

    document.addEventListener('pointerlockchange', pointerLockChangeHandler);
    document.addEventListener('mozpointerlockchange', pointerLockChangeHandler);
    document.addEventListener('webkitpointerlockchange', pointerLockChangeHandler);
  }

  handleKeyDown(e) {
    const key = e.key.toLowerCase();

    if (key === 'w') {
      this.keys.w = true;
    }
    if (key === 'a') {
      this.keys.a = true;
    }
    if (key === 's') {
      this.keys.s = true;
    }
    if (key === 'd') {
      this.keys.d = true;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      this.keys.arrowUp = true;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      this.keys.arrowDown = true;
    }
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      this.keys.arrowLeft = true;
    }
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      this.keys.arrowRight = true;
    }

    if (key === ' ') {
      e.preventDefault();
      this.onJump?.();
    }
  }

  handleKeyUp(e) {
    const key = e.key.toLowerCase();

    if (key === 'w') this.keys.w = false;
    if (key === 'a') this.keys.a = false;
    if (key === 's') this.keys.s = false;
    if (key === 'd') this.keys.d = false;
    if (e.key === 'ArrowUp') this.keys.arrowUp = false;
    if (e.key === 'ArrowDown') this.keys.arrowDown = false;
    if (e.key === 'ArrowLeft') this.keys.arrowLeft = false;
    if (e.key === 'ArrowRight') this.keys.arrowRight = false;
  }

  handleMouseMove(e) {
    if (!this.isPointerLocked) return;

    const movementX = e.movementX || e.mozMovementX || e.webkitMovementX || 0;
    const movementY = e.movementY || e.mozMovementY || e.webkitMovementY || 0;

    if (movementX !== 0 || movementY !== 0) {
      this.onMouseMove?.(movementX, movementY);
    }
  }

  isMovingForward() {
    return this.keys.w || this.keys.arrowUp;
  }

  isMovingBackward() {
    return this.keys.s || this.keys.arrowDown;
  }

  isMovingLeft() {
    return this.keys.a || this.keys.arrowLeft;
  }

  isMovingRight() {
    return this.keys.d || this.keys.arrowRight;
  }

  lockPointer() {
    if (!this.isPointerLocked) {
      const requestPointerLock =
        document.body.requestPointerLock ||
        document.body.mozRequestPointerLock ||
        document.body.webkitRequestPointerLock;

      if (requestPointerLock) {
        requestPointerLock.call(document.body);
      }
    }
  }

  unlockPointer() {
    if (this.isPointerLocked) {
      const exitPointerLock =
        document.exitPointerLock ||
        document.mozExitPointerLock ||
        document.webkitExitPointerLock;

      if (exitPointerLock) {
        exitPointerLock.call(document);
      }
    }
  }
}
