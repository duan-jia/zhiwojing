// Tile coordinates shared by the map compiler and the RPGJS server.
export const TOWN_BUILDINGS = [
  { id: 'home', landmarkId: 'landmark-user-home', kind: 'user-home', icon: '居', name: '知我居', image: 'zhihuhome-cutout.png', centerX: 14.5, bottomY: 17, height: 256, doorX: 14, doorY: 17, walls: [12, 14, 17, 16] },
  { id: 'hot', landmarkId: 'landmark-hot-square', kind: 'hot-square', icon: '榜', name: '知乎热榜', image: 'zhihuhot-cutout.png', centerX: 29.5, bottomY: 19, height: 256, doorX: 29, doorY: 19, walls: [27, 16, 32, 18] },
  { id: 'book', landmarkId: 'landmark-book', kind: 'book', icon: '书', name: '藏书阁', image: 'zhihubook.png', centerX: 47.5, bottomY: 18, height: 288, doorX: 47, doorY: 18, walls: [44, 15, 51, 17] },
  { id: 'wendao', landmarkId: 'landmark-wendao', kind: 'wendao', icon: '问', name: '问道馆', image: 'zhihuwendao.png', centerX: 14.5, bottomY: 36, height: 256, doorX: 14, doorY: 36, walls: [11, 33, 18, 35] },
  { id: 'write', landmarkId: 'landmark-write', kind: 'write', icon: '创', name: '创作坊', image: 'zhihuwrite.png', centerX: 48.5, bottomY: 36, height: 256, doorX: 46, doorY: 36, walls: [45, 33, 51, 35] },
  { id: 'tiangong', landmarkId: 'landmark-tiangong', kind: 'tiangong', icon: '工', name: '天工坊', image: 'zhihutiangong.png', centerX: 31.5, bottomY: 40, height: 256, doorX: 31, doorY: 40, walls: [28, 37, 35, 39] },
]
