const configuredApiBaseUrl = import.meta.env.VITE_API_BASE_URL?.trim()

export const apiBaseUrl =
  configuredApiBaseUrl || (import.meta.env.PROD ? "" : "http://localhost:5000")

export const DEFAULT_RESTAURANT_SLUG = "foodie-demo"
export const SESSION_STORAGE_KEY = "restaurant-portal-session"

export function getRestaurantSlugFromSearch(search = window.location.search) {
  const params = new URLSearchParams(search)
  const slug = params.get("restaurant")?.trim().toLowerCase()

  return slug || DEFAULT_RESTAURANT_SLUG
}

export function getTableNumberFromSearch(search = window.location.search) {
  const params = new URLSearchParams(search)
  const table = Number(params.get("table"))

  return Number.isInteger(table) && table > 0 ? table : 1
}

export function buildMenuUrl(restaurantSlug, tableNumber) {
  const params = new URLSearchParams()

  if (restaurantSlug) {
    params.set("restaurant", restaurantSlug)
  }

  if (tableNumber) {
    params.set("table", String(tableNumber))
  }

  return `/?${params.toString()}`
}

export function buildStatusUrl(restaurantSlug, tableNumber) {
  const params = new URLSearchParams()

  if (restaurantSlug) {
    params.set("restaurant", restaurantSlug)
  }

  if (tableNumber) {
    params.set("table", String(tableNumber))
  }

  return `/status?${params.toString()}`
}

export function buildKitchenUrl(restaurantSlug) {
  const params = new URLSearchParams()

  if (restaurantSlug) {
    params.set("restaurant", restaurantSlug)
  }

  return `/kitchen?${params.toString()}`
}

export async function parseJsonResponse(
  response,
  invalidMessage,
  fallbackMessage
) {
  const rawResponse = await response.text()
  let payload = {}

  if (rawResponse) {
    try {
      payload = JSON.parse(rawResponse)
    } catch {
      throw new Error(invalidMessage)
    }
  }

  if (!response.ok) {
    throw new Error(payload.error || fallbackMessage)
  }

  return payload
}

export function getSessionToken() {
  return window.localStorage.getItem(SESSION_STORAGE_KEY) || ""
}

export function saveSessionToken(token) {
  window.localStorage.setItem(SESSION_STORAGE_KEY, token)
}

export function clearSessionToken() {
  window.localStorage.removeItem(SESSION_STORAGE_KEY)
}

export function getAuthHeaders() {
  const token = getSessionToken()

  return token
    ? {
        Authorization: `Bearer ${token}`
      }
    : {}
}
