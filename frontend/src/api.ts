export const AUTH_TOKEN_STORAGE_KEY = 'zhiwojing.auth-token'

export function readAuthToken(): string {
  return window.localStorage.getItem(AUTH_TOKEN_STORAGE_KEY) || ''
}

export function saveAuthToken(token: string): void {
  window.localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, token)
}

export function clearAuthToken(): void {
  window.localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY)
}

export async function apiFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers)
  const token = readAuthToken()
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`)
  }
  const response = await fetch(input, {
    ...init,
    credentials: init.credentials ?? 'include',
    headers,
  })
  if (response.status === 401 && token) clearAuthToken()
  return response
}
