export const TILE_WIDTH = 96;
export const TILE_HEIGHT = 48;
export const MAP_WIDTH = 28;
export const MAP_HEIGHT = 28;
export const SPAWN = {x: Math.floor(MAP_WIDTH / 2), y: Math.floor(MAP_HEIGHT / 2)};

export type GroundType = 'grass' | 'dirt' | 'water';
export type ObjectType = 'tree' | 'stone';

export interface WorldCell {
  ground: GroundType;
  object: ObjectType | null;
  variant: number;
}

export interface GeneratedWorld {
  cells: WorldCell[][];
  seed: number;
}

export type TerrainEdge = 'northWest' | 'northEast' | 'southEast' | 'southWest';

interface Patch {
  x: number;
  y: number;
  radiusX: number;
  radiusY: number;
}

function mulberry32(seed: number) {
  return () => {
    let value = seed += 0x6d2b79f5;
    value = Math.imul(value ^ value >>> 15, value | 1);
    value ^= value + Math.imul(value ^ value >>> 7, value | 61);
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  };
}

function insidePatch(x: number, y: number, patch: Patch, jitter: number) {
  const dx = (x - patch.x) / patch.radiusX;
  const dy = (y - patch.y) / patch.radiusY;
  return dx * dx + dy * dy + jitter < 1;
}

export function generateWorld(seed = Math.floor(Math.random() * 2 ** 31)): GeneratedWorld {
  const random = mulberry32(seed);
  const waterPatches: Patch[] = Array.from({length: 5}, () => ({
    x: 3 + random() * (MAP_WIDTH - 6),
    y: 3 + random() * (MAP_HEIGHT - 6),
    radiusX: 2.2 + random() * 2.8,
    radiusY: 1.6 + random() * 2.5,
  }));
  const dirtPatches: Patch[] = Array.from({length: 7}, () => ({
    x: 2 + random() * (MAP_WIDTH - 4),
    y: 2 + random() * (MAP_HEIGHT - 4),
    radiusX: 1.8 + random() * 3.4,
    radiusY: 1.4 + random() * 2.8,
  }));

  const cells = Array.from({length: MAP_HEIGHT}, (_, y) => (
    Array.from({length: MAP_WIDTH}, (_, x): WorldCell => {
      const jitter = (random() - .5) * .34;
      const nearSpawn = Math.hypot(x - SPAWN.x, y - SPAWN.y) < 3.2;
      let ground: GroundType = 'grass';

      if (!nearSpawn && waterPatches.some(patch => insidePatch(x, y, patch, jitter))) {
        ground = 'water';
      } else if (dirtPatches.some(patch => insidePatch(x, y, patch, jitter))) {
        ground = 'dirt';
      }

      let object: ObjectType | null = null;
      if (!nearSpawn && ground !== 'water') {
        const roll = random();
        if (roll < .075) object = 'tree';
        else if (roll < .11) object = 'stone';
      }

      return {ground, object, variant: Math.floor(random() * 3)};
    })
  ));

  return {cells, seed};
}

export function terrainEdges(cells: WorldCell[][], x: number, y: number): TerrainEdge[] {
  const ground = cells[y][x].ground;
  if (ground === 'grass') return [];

  const neighbours: Array<{edge: TerrainEdge; x: number; y: number}> = [
    {edge: 'northWest', x: x - 1, y},
    {edge: 'northEast', x, y: y - 1},
    {edge: 'southEast', x: x + 1, y},
    {edge: 'southWest', x, y: y + 1},
  ];

  return neighbours.flatMap(neighbour => {
    const adjacent = cells[neighbour.y]?.[neighbour.x];
    if (ground === 'water') return adjacent?.ground === 'water' ? [] : [neighbour.edge];
    return !adjacent || adjacent.ground === 'grass' ? [neighbour.edge] : [];
  });
}

export function toScreen(gridX: number, gridY: number) {
  const originX = MAP_HEIGHT * TILE_WIDTH / 2 + 220;
  const originY = 190;
  return {
    x: originX + (gridX - gridY) * TILE_WIDTH / 2,
    y: originY + (gridX + gridY) * TILE_HEIGHT / 2,
  };
}
