export type AvatarId = 1 | 2 | 3

export interface MockIdentity {
  id: AvatarId
  name: string
  tagline: string
}

export const MOCK_IDENTITIES: readonly MockIdentity[] = [
  { id: 1, name: '体验用户', tagline: 'AI 产品经理' },
  { id: 2, name: '苏晚', tagline: '生活方式作者' },
  { id: 3, name: '周博', tagline: '科普研究员' },
]

export const DEFAULT_IDENTITY = MOCK_IDENTITIES[0]
export const IDENTITY_STORAGE_KEY = 'zhiwojing.mock-avatar-id'

let activeIdentity: MockIdentity = DEFAULT_IDENTITY

export function identityForId(value: unknown): MockIdentity | null {
  const id = Number(value)
  return MOCK_IDENTITIES.find(identity => identity.id === id) ?? null
}

export function readStoredIdentity(storage: Pick<Storage, 'getItem'>): MockIdentity {
  return identityForId(storage.getItem(IDENTITY_STORAGE_KEY)) ?? DEFAULT_IDENTITY
}

export function persistIdentity(
  identity: MockIdentity,
  storage: Pick<Storage, 'setItem'>,
): void {
  storage.setItem(IDENTITY_STORAGE_KEY, String(identity.id))
  activeIdentity = identity
}

export function setActiveIdentity(identity: MockIdentity): void {
  activeIdentity = identity
}

export function getActiveIdentity(): MockIdentity {
  return activeIdentity
}
