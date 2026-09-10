import Phaser from 'phaser';
import {
  MAP_HEIGHT,
  MAP_WIDTH,
  TILE_HEIGHT,
  TILE_WIDTH,
  terrainEdges,
  toScreen,
  type GeneratedWorld,
  type AvatarState,
  type GroundType,
  type TerrainEdge,
} from './world';

const MIN_ZOOM = .52;
const MAX_ZOOM = 1.55;

type MovementKeys = Record<'W' | 'A' | 'S' | 'D' | 'UP' | 'DOWN' | 'LEFT' | 'RIGHT', Phaser.Input.Keyboard.Key>;

export class WorldScene extends Phaser.Scene {
  private world!: GeneratedWorld;
  private players = new Map<string, {sprite: Phaser.GameObjects.Sprite; shadow: Phaser.GameObjects.Ellipse; label: Phaser.GameObjects.Text; state: AvatarState}>();
  private playerId = '';
  private socket?: WebSocket;
  private waterTiles: Array<{image: Phaser.GameObjects.Image; phase: number}> = [];
  private keys!: MovementKeys;
  private facingFrame = 0;
  private walkTime = 0;
  private targetZoom = .9;

  constructor() {
    super('world');
  }

  preload() {
    this.load.spritesheet('explorer', '/assets/ink-character-8dir-v2.png', {
      frameWidth: 443,
      frameHeight: 443,
    });
    this.load.spritesheet('ink-terrain', '/assets/ink-terrain-atlas-v1.png', {
      frameWidth: 1024,
      frameHeight: 512,
    });
    this.load.spritesheet('ink-props', '/assets/ink-props-atlas-v1.png', {
      frameWidth: 887,
      frameHeight: 887,
    });
  }

  create() {
    this.configureInput();
    this.connect();
  }

  update(time: number, delta: number) {
    const left = this.keys.A.isDown || this.keys.LEFT.isDown;
    const right = this.keys.D.isDown || this.keys.RIGHT.isDown;
    const up = this.keys.W.isDown || this.keys.UP.isDown;
    const down = this.keys.S.isDown || this.keys.DOWN.isDown;
    let screenX = Number(right) - Number(left);
    let screenY = Number(down) - Number(up);
    const moving = screenX !== 0 || screenY !== 0;

    if (moving) {
      const length = Math.hypot(screenX, screenY);
      screenX /= length;
      screenY /= length;
      const moveGridX = screenY / TILE_HEIGHT + screenX / TILE_WIDTH;
      const moveGridY = screenY / TILE_HEIGHT - screenX / TILE_WIDTH;
      if (this.socket?.readyState === WebSocket.OPEN) {
        this.socket.send(JSON.stringify({type: 'move', dx: moveGridX, dy: moveGridY, elapsed: Math.min(delta, 100) / 1000}));
      }
      this.facingFrame = this.directionFrame(screenX, screenY);
      this.players.get(this.playerId)?.sprite.setFrame(this.facingFrame);
      this.walkTime += delta;
    } else {
      this.walkTime = 0;
    }

    this.players.forEach(({sprite, shadow, label, state}, id) => {
      const position = toScreen(state.x, state.y);
      const bob = id === this.playerId && moving ? Math.sin(this.walkTime * .018) * 3 : 0;
      sprite.setPosition(position.x, position.y - 8 + bob).setDepth(position.y + 1);
      shadow.setPosition(position.x, position.y + 3).setDepth(position.y);
      label.setPosition(position.x, position.y - 92 + bob).setDepth(position.y + 2);
    });

    this.waterTiles.forEach(({image, phase}) => {
      image.setAlpha(.92 + Math.sin(time * .0014 + phase) * .045);
    });

    const camera = this.cameras.main;
    if (Math.abs(camera.zoom - this.targetZoom) > .001) {
      camera.setZoom(Phaser.Math.Linear(camera.zoom, this.targetZoom, .14));
    }
  }

  private connect() {
    const stored = sessionStorage.getItem('town-avatar-id');
    this.playerId = stored || crypto.randomUUID();
    sessionStorage.setItem('town-avatar-id', this.playerId);
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    this.socket = new WebSocket(`${protocol}//${location.hostname}:8000/ws/world/zhihu-town`);
    this.socket.addEventListener('open', () => {
      this.socket?.send(JSON.stringify({type: 'join', avatarId: this.playerId, name: `旅人-${this.playerId.slice(0, 4)}`}));
    });
    this.socket.addEventListener('message', event => {
      const message = JSON.parse(event.data) as {type: string; map?: GeneratedWorld; avatars?: AvatarState[]; avatar?: AvatarState; avatarId?: string};
      if (message.type === 'welcome' && message.map && message.avatars) {
        this.world = message.map;
        this.drawWorld();
        message.avatars.forEach(avatar => this.upsertPlayer(avatar));
        this.configureCamera();
      } else if ((message.type === 'join' || message.type === 'position') && message.avatar) {
        this.upsertPlayer(message.avatar);
      } else if (message.type === 'leave' && message.avatarId) {
        this.removePlayer(message.avatarId);
      }
    });
    const heartbeat = window.setInterval(() => this.socket?.readyState === WebSocket.OPEN && this.socket.send(JSON.stringify({type: 'ping'})), 15000);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => { window.clearInterval(heartbeat); this.socket?.close(); });
  }

  private drawWorld() {
    const terrainFrames = {grass: 0, dirt: 1, water: 2};
    const mapShadow = this.add.graphics().setDepth(-6000);
    mapShadow.fillStyle(0x2d2821, .28);
    mapShadow.fillPoints([
      toScreen(0, 0),
      toScreen(MAP_WIDTH, 0),
      toScreen(MAP_WIDTH, MAP_HEIGHT),
      toScreen(0, MAP_HEIGHT),
    ].map(point => new Phaser.Geom.Point(point.x + 10, point.y + 18)), true);

    for (let y = 0; y < MAP_HEIGHT; y += 1) {
      for (let x = 0; x < MAP_WIDTH; x += 1) {
        const cell = this.world.cells[y][x];
        const position = toScreen(x + .5, y + .5);
        const tile = this.add.image(position.x, position.y, 'ink-terrain', terrainFrames[cell.ground])
          .setDisplaySize(TILE_WIDTH + 6, TILE_HEIGHT + 4)
          .setDepth(position.y - 5000);
        if (cell.variant === 1) tile.setFlipX(true);
        if (cell.variant === 2) tile.setAngle(180);
        if (cell.ground === 'water') {
          this.waterTiles.push({image: tile, phase: x * .63 + y * .41});
        }

        if (cell.object) {
          const footY = position.y + TILE_HEIGHT * .22;
          this.add.ellipse(
            position.x,
            footY - 2,
            cell.object === 'tree' ? 60 : 52,
            cell.object === 'tree' ? 18 : 14,
            0x2c2922,
            cell.object === 'tree' ? .24 : .18,
          ).setDepth(footY - 1);
          const object = this.add.image(
            position.x,
            footY,
            'ink-props',
            cell.object === 'tree' ? 0 : 1,
          )
            .setOrigin(.5, 1)
            .setDepth(footY);
          object.setScale(cell.object === 'tree' ? .18 + cell.variant * .006 : .145);
          object.setFlipX(cell.variant === 2);
        }
      }
    }

    this.drawTerrainTransitions();
  }

  private drawTerrainTransitions() {
    const graphics = this.add.graphics().setDepth(-3000);
    for (let y = 0; y < MAP_HEIGHT; y += 1) {
      for (let x = 0; x < MAP_WIDTH; x += 1) {
        const ground = this.world.cells[y][x].ground;
        const center = toScreen(x + .5, y + .5);
        terrainEdges(this.world.cells, x, y).forEach(edge => {
          this.drawTerrainEdge(graphics, center, edge, ground, x, y);
        });
      }
    }
  }

  private drawTerrainEdge(
    graphics: Phaser.GameObjects.Graphics,
    center: {x: number; y: number},
    edge: TerrainEdge,
    ground: GroundType,
    cellX: number,
    cellY: number,
  ) {
    const points = {
      top: {x: center.x, y: center.y - TILE_HEIGHT / 2},
      right: {x: center.x + TILE_WIDTH / 2, y: center.y},
      bottom: {x: center.x, y: center.y + TILE_HEIGHT / 2},
      left: {x: center.x - TILE_WIDTH / 2, y: center.y},
    };
    const endpoints: Record<TerrainEdge, [{x: number; y: number}, {x: number; y: number}]> = {
      northWest: [points.left, points.top],
      northEast: [points.top, points.right],
      southEast: [points.right, points.bottom],
      southWest: [points.bottom, points.left],
    };
    const [start, end] = endpoints[edge];
    const midpoint = {x: (start.x + end.x) / 2, y: (start.y + end.y) / 2};
    const distance = Math.hypot(center.x - midpoint.x, center.y - midpoint.y);
    const normal = {
      x: (center.x - midpoint.x) / distance,
      y: (center.y - midpoint.y) / distance,
    };
    const wobble = Math.sin((cellX * 17 + cellY * 31) * 1.7) * 1.4;
    const stroke = (inset: number, width: number, color: number, alpha: number) => {
      graphics.lineStyle(width, color, alpha);
      graphics.beginPath();
      graphics.moveTo(start.x + normal.x * inset, start.y + normal.y * inset);
      graphics.lineTo(
        midpoint.x + normal.x * (inset + wobble),
        midpoint.y + normal.y * (inset + wobble),
      );
      graphics.lineTo(end.x + normal.x * inset, end.y + normal.y * inset);
      graphics.strokePath();
    };

    if (ground === 'water') {
      stroke(1.5, 5, 0x75664f, .7);
      stroke(4, 2, 0xd8c89e, .86);
    } else {
      stroke(1, 3, 0x6e604c, .48);
      stroke(3, 1, 0xd3b98d, .62);
    }
  }

  private upsertPlayer(state: AvatarState) {
    const existing = this.players.get(state.id);
    if (existing) {
      existing.state = state;
      return;
    }
    const position = toScreen(state.x, state.y);
    const shadow = this.add.ellipse(position.x, position.y + 3, 42, 16, 0x315947, .28);
    const sprite = this.add.sprite(position.x, position.y - 8, 'explorer', 0)
      .setOrigin(.5, .91).setScale(.205)
      .setTint(state.id === this.playerId ? 0xffffff : 0xb8d8ff);
    const label = this.add.text(position.x, position.y - 92, state.name, {
      color: '#fffdf3', backgroundColor: '#243b35cc', fontFamily: 'sans-serif', fontSize: '13px', padding: {x: 6, y: 3},
    }).setOrigin(.5);
    this.players.set(state.id, {sprite, shadow, label, state});
  }

  private removePlayer(id: string) {
    const player = this.players.get(id);
    if (!player) return;
    player.sprite.destroy(); player.shadow.destroy(); player.label.destroy();
    this.players.delete(id);
  }

  private configureInput() {
    if (!this.input.keyboard) return;
    this.keys = this.input.keyboard.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT') as MovementKeys;
    this.input.keyboard.addCapture([
      Phaser.Input.Keyboard.KeyCodes.W,
      Phaser.Input.Keyboard.KeyCodes.A,
      Phaser.Input.Keyboard.KeyCodes.S,
      Phaser.Input.Keyboard.KeyCodes.D,
      Phaser.Input.Keyboard.KeyCodes.UP,
      Phaser.Input.Keyboard.KeyCodes.DOWN,
      Phaser.Input.Keyboard.KeyCodes.LEFT,
      Phaser.Input.Keyboard.KeyCodes.RIGHT,
    ]);
  }

  private configureCamera() {
    const worldWidth = (MAP_WIDTH + MAP_HEIGHT) * TILE_WIDTH / 2 + 440;
    const worldHeight = (MAP_WIDTH + MAP_HEIGHT) * TILE_HEIGHT / 2 + 420;
    const camera = this.cameras.main;
    camera.setBounds(0, 0, worldWidth, worldHeight);
    const local = this.players.get(this.playerId);
    if (local) camera.startFollow(local.sprite, true, .09, .09);
    this.targetZoom = window.innerWidth < 720 ? .68 : .9;
    camera.setZoom(this.targetZoom);
    camera.setBackgroundColor('#746e5d');

    this.input.on('wheel', (
      _pointer: Phaser.Input.Pointer,
      _objects: Phaser.GameObjects.GameObject[],
      _deltaX: number,
      deltaY: number,
    ) => {
      this.targetZoom = Phaser.Math.Clamp(this.targetZoom - deltaY * .001, MIN_ZOOM, MAX_ZOOM);
    });
  }

  private directionFrame(x: number, y: number) {
    const angle = Math.atan2(y, x);
    const octant = Math.round(angle / (Math.PI / 4));
    const frames: Record<number, number> = {
      0: 6,
      1: 7,
      2: 0,
      3: 1,
      4: 2,
      [-4]: 2,
      [-3]: 3,
      [-2]: 4,
      [-1]: 5,
    };
    return frames[octant] ?? 0;
  }
}
