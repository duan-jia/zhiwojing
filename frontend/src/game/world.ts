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
  width: number;
  height: number;
}

export interface AvatarState { id: string; name: string; x: number; y: number }

export type TerrainEdge = 'northWest' | 'northEast' | 'southEast' | 'southWest';

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
