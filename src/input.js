// キーボード入力。WASD 歩き / Shift スプリント / C スニーク / Space ジャンプ / Q,E カメラ旋回。
export class Input {
  constructor(dom) {
    this.keys = new Set();
    this.jumpPressed = false;
    this.dropPressed = false;
    this.toggles = {};
    this._onKey = (e, down) => {
      const k = e.code;
      if (down) {
        if (!this.keys.has(k)) {
          if (k === 'Space') this.jumpPressed = true;
          if (k === 'KeyF') this.dropPressed = true;
          this.toggles[k] = (this.toggles[k] || 0) + 1;
        }
        this.keys.add(k);
      } else this.keys.delete(k);
      if (['Space', 'KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(k)) e.preventDefault();
    };
    addEventListener('keydown', (e) => this._onKey(e, true));
    addEventListener('keyup', (e) => this._onKey(e, false));
    addEventListener('blur', () => this.keys.clear());
  }

  has(code) { return this.keys.has(code); }

  /** 自動検証用: キーイベントを合成する */
  inject(code, down) {
    if (down) {
      if (!this.keys.has(code)) {
        if (code === 'Space') this.jumpPressed = true;
        if (code === 'KeyF') this.dropPressed = true;
        this.toggles[code] = (this.toggles[code] || 0) + 1;
      }
      this.keys.add(code);
    } else this.keys.delete(code);
  }

  /** 1 度押しを取り出す（呼ぶと消える） */
  consumeToggle(code) {
    const n = this.toggles[code] || 0;
    this.toggles[code] = 0;
    return n > 0;
  }

  sample() {
    const k = this.keys;
    const f = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0);
    const r = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0);
    const out = {
      // 通常移動（カメラ相対。three.js の前方は -Z なので前進は z=-1）
      x: r,
      z: -f,
      // 壁面移動（u=横, v=縦）
      climbX: r,
      climbY: f,
      sprint: k.has('ShiftLeft') || k.has('ShiftRight'),
      sneak: k.has('KeyC'),
      jumpPressed: this.jumpPressed,
      dropPressed: this.dropPressed,
      camLeft: k.has('KeyQ'),
      camRight: k.has('KeyE'),
    };
    this.jumpPressed = false;
    this.dropPressed = false;
    return out;
  }
}
