export type CapabilityStatus = 'ready' | 'unconfigured' | 'auth_required' | 'coming_soon'

export interface BuildingCapability {
  id: string
  label: string
  description: string
  status: CapabilityStatus
  authScope: 'app' | 'session' | 'zhihu_oauth'
  ui: string
}

export interface BuildingCatalogItem {
  id: string
  name: string
  icon: string
  description: string
  capabilities: BuildingCapability[]
}

interface BuildingCatalogResponse {
  revision: string
  buildings: BuildingCatalogItem[]
}

const API = import.meta.env.VITE_API_URL || 'http://localhost:8000'
let catalogRequest: Promise<BuildingCatalogResponse> | null = null

export function loadBuildingCatalog(): Promise<BuildingCatalogResponse> {
  catalogRequest ??= fetch(`${API}/api/world/buildings`, {
    credentials: 'include',
    signal: AbortSignal.timeout(10000),
  }).then(async response => {
    const body = await response.json().catch(() => ({}))
    if (!response.ok || !Array.isArray(body.buildings)) {
      throw new Error(body.detail?.message || `服务返回 ${response.status}`)
    }
    return body as BuildingCatalogResponse
  }).catch(error => {
    catalogRequest = null
    throw error
  })
  return catalogRequest
}
