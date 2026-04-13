import { useCallback, useEffect, useState } from "react"
import { Link, useLocation } from "react-router-dom"
import {
  apiBaseUrl,
  buildMenuUrl,
  getRestaurantSlugFromSearch
} from "../utils/restaurant"

const statusColors = {
  pending: {
    background: "#facc15",
    color: "#1f2937"
  },
  preparing: {
    background: "#3b82f6",
    color: "#eff6ff"
  },
  ready: {
    background: "#22c55e",
    color: "#052e16"
  }
}

function getStatusStyle(status = "pending") {
  return statusColors[status] || {
    background: "#94a3b8",
    color: "#0f172a"
  }
}

function formatStatus(status = "pending") {
  return status.charAt(0).toUpperCase() + status.slice(1)
}

function normalizeString(value) {
  return typeof value === "string" ? value.trim() : ""
}

function normalizeStringList(value) {
  const rawValues = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(",")
      : []

  return Array.from(
    new Set(
      rawValues
        .map((entry) => normalizeString(entry))
        .filter(Boolean)
    )
  )
}

function getCustomerNote(order = {}) {
  return (
    normalizeString(order.customerPreferences?.note) ||
    normalizeString(order.specialInstructions)
  )
}

function getAvoidIngredientsForOrder(order = {}) {
  return Array.from(
    new Set([
      ...normalizeStringList(order.customerPreferences?.avoidIngredients),
      ...normalizeStringList(order.avoidIngredients),
      ...(order.items || []).flatMap((item) =>
        normalizeStringList(item.skipIngredients)
      )
    ])
  )
}

function getSkippedIngredientsForItem(item = {}, avoidIngredients = []) {
  const itemIngredients = normalizeStringList(item.ingredients)
  const explicitSkippedIngredients = normalizeStringList(item.skipIngredients)

  if (explicitSkippedIngredients.length > 0) {
    return explicitSkippedIngredients
  }

  return avoidIngredients.filter((ingredient) => itemIngredients.includes(ingredient))
}

function groupOrdersByTable(orders = []) {
  const groupedTables = new Map()

  orders.forEach((order) => {
    const tableKey = order.tableNumber ?? "Unknown"

    if (!groupedTables.has(tableKey)) {
      groupedTables.set(tableKey, {
        tableNumber: tableKey,
        orders: [],
        latestCreatedAt: order.createdAt
      })
    }

    const currentTable = groupedTables.get(tableKey)
    currentTable.orders.push(order)

    if (
      order.createdAt &&
      new Date(order.createdAt).getTime() >
        new Date(currentTable.latestCreatedAt || 0).getTime()
    ) {
      currentTable.latestCreatedAt = order.createdAt
    }
  })

  return Array.from(groupedTables.values()).sort(
    (left, right) =>
      new Date(right.latestCreatedAt || 0).getTime() -
      new Date(left.latestCreatedAt || 0).getTime()
  )
}

function Kitchen() {
  const location = useLocation()
  const restaurantSlug = getRestaurantSlugFromSearch(location.search)
  const [orders, setOrders] = useState([])
  const [restaurantName, setRestaurantName] = useState(restaurantSlug)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState("")
  const [updatingOrderId, setUpdatingOrderId] = useState("")

  const loadRestaurantMeta = useCallback(async () => {
    try {
      const response = await fetch(
        `${apiBaseUrl}/api/restaurants/public?slug=${restaurantSlug}`
      )

      if (!response.ok) {
        return
      }

      const payload = await response.json()

      if (payload.restaurant?.restaurantName) {
        setRestaurantName(payload.restaurant.restaurantName)
      }
    } catch {
      // Keep the slug fallback if the meta fetch fails.
    }
  }, [restaurantSlug])

  const loadOrders = useCallback(async () => {
    try {
      const res = await fetch(
        `${apiBaseUrl}/api/orders?restaurant=${restaurantSlug}`
      )

      if (!res.ok) {
        throw new Error("Unable to fetch orders.")
      }

      const data = await res.json()
      setOrders(Array.isArray(data) ? data : [])
      setError("")
    } catch (err) {
      console.error("Failed to fetch orders", err)
      setError("Failed to load kitchen orders.")
    } finally {
      setIsLoading(false)
    }
  }, [restaurantSlug])

  useEffect(() => {
    setIsLoading(true)
    loadRestaurantMeta()
    loadOrders()
    const interval = window.setInterval(loadOrders, 3000)

    return () => window.clearInterval(interval)
  }, [loadOrders, loadRestaurantMeta, restaurantSlug])

  async function updateOrderStatus(id, status) {
    try {
      setUpdatingOrderId(id)

      const res = await fetch(`${apiBaseUrl}/api/orders/${id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, restaurantSlug })
      })

      if (!res.ok) {
        throw new Error("Unable to update order status.")
      }

      await loadOrders()
    } catch (err) {
      console.error("Failed to update order status", err)
      setError("Failed to update order status.")
    } finally {
      setUpdatingOrderId("")
    }
  }

  const tableGroups = groupOrdersByTable(orders)

  return (
    <div
      style={{
        width: "100%",
        minHeight: "100vh",
        padding: "32px 20px",
        background:
          "linear-gradient(180deg, #020617 0%, #0f172a 45%, #111827 100%)",
        color: "#f8fafc"
      }}
    >
      <div
        style={{
          maxWidth: "1200px",
          margin: "0 auto"
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: "12px",
            flexWrap: "wrap",
            marginBottom: "24px"
          }}
        >
          <div>
            <p
              style={{
                fontSize: "0.82rem",
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                color: "#94a3b8",
                marginBottom: "8px"
              }}
            >
              Live kitchen board
            </p>
            <h1
              style={{
                margin: 0,
                fontSize: "2rem",
                color: "#f8fafc"
              }}
            >
              {restaurantName} Kitchen Dashboard
            </h1>
          </div>

          <div
            style={{
              display: "flex",
              gap: "10px",
              flexWrap: "wrap"
            }}
          >
            <Link
              to={buildMenuUrl(restaurantSlug, 1)}
              style={{
                padding: "10px 14px",
                borderRadius: "999px",
                background: "rgba(15, 23, 42, 0.75)",
                border: "1px solid rgba(148, 163, 184, 0.2)",
                fontSize: "0.9rem",
                color: "#cbd5e1",
                textDecoration: "none"
              }}
            >
              Open public menu
            </Link>

            <div
              style={{
                padding: "10px 14px",
                borderRadius: "999px",
                background: "rgba(15, 23, 42, 0.75)",
                border: "1px solid rgba(148, 163, 184, 0.2)",
                fontSize: "0.9rem",
                color: "#cbd5e1"
              }}
            >
              Refreshes every 3 seconds
            </div>
          </div>
        </div>

        {error && (
          <div
            style={{
              marginBottom: "18px",
              padding: "12px 14px",
              borderRadius: "14px",
              background: "rgba(127, 29, 29, 0.32)",
              border: "1px solid rgba(248, 113, 113, 0.35)",
              color: "#fecaca"
            }}
          >
            {error}
          </div>
        )}

        {isLoading ? (
          <div
            style={{
              padding: "24px",
              borderRadius: "20px",
              background: "rgba(15, 23, 42, 0.75)",
              border: "1px solid rgba(148, 163, 184, 0.18)",
              color: "#cbd5e1"
            }}
          >
            Loading orders...
          </div>
        ) : tableGroups.length === 0 ? (
          <div
            style={{
              padding: "24px",
              borderRadius: "20px",
              background: "rgba(15, 23, 42, 0.75)",
              border: "1px solid rgba(148, 163, 184, 0.18)",
              color: "#cbd5e1"
            }}
          >
            No orders yet for this restaurant.
          </div>
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
              gap: "18px"
            }}
          >
            {tableGroups.map((tableGroup) => (
              <article
                key={`table-${tableGroup.tableNumber}`}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "16px",
                  padding: "20px",
                  borderRadius: "22px",
                  background: "rgba(15, 23, 42, 0.92)",
                  border: "1px solid rgba(148, 163, 184, 0.16)",
                  boxShadow: "0 18px 40px rgba(2, 6, 23, 0.28)"
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "flex-start",
                    gap: "12px"
                  }}
                >
                  <div>
                    <h2
                      style={{
                        margin: 0,
                        color: "#f8fafc",
                        fontSize: "1.2rem"
                      }}
                    >
                      Table {tableGroup.tableNumber}
                    </h2>
                    <p
                      style={{
                        marginTop: "6px",
                        color: "#94a3b8",
                        fontSize: "0.82rem"
                      }}
                    >
                      {new Date(tableGroup.latestCreatedAt).toLocaleString()}
                    </p>
                    <p
                      style={{
                        marginTop: "6px",
                        color: "#64748b",
                        fontSize: "0.76rem"
                      }}
                    >
                      {tableGroup.orders.length} order
                      {tableGroup.orders.length > 1 ? "s" : ""}
                    </p>
                  </div>
                </div>

                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "14px"
                  }}
                >
                  {tableGroup.orders.map((order) => {
                    const statusStyle = getStatusStyle(order.status)
                    const isUpdating = updatingOrderId === order._id
                    const avoidIngredients = getAvoidIngredientsForOrder(order)
                    const customerNote = getCustomerNote(order)
                    const hasKitchenAlert =
                      avoidIngredients.length > 0 || Boolean(customerNote)

                    return (
                      <section
                        key={order._id}
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          gap: "12px",
                          padding: "14px",
                          borderRadius: "18px",
                          background: "rgba(30, 41, 59, 0.72)",
                          border: "1px solid rgba(148, 163, 184, 0.12)"
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "flex-start",
                            gap: "12px",
                            flexWrap: "wrap"
                          }}
                        >
                          <div>
                            <p
                              style={{
                                fontSize: "0.76rem",
                                color: "#94a3b8",
                                marginBottom: "6px"
                              }}
                            >
                              Order #{order._id?.slice(-6)?.toUpperCase() || "------"}
                            </p>
                            <p
                              style={{
                                fontSize: "0.78rem",
                                color: "#64748b"
                              }}
                            >
                              {new Date(order.createdAt).toLocaleString()}
                            </p>
                          </div>

                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: "8px",
                              flexWrap: "wrap",
                              justifyContent: "flex-end"
                            }}
                          >
                            {hasKitchenAlert && (
                              <span
                                style={{
                                  padding: "7px 12px",
                                  borderRadius: "999px",
                                  fontSize: "0.74rem",
                                  fontWeight: 700,
                                  background: "rgba(239, 68, 68, 0.18)",
                                  color: "#fecaca",
                                  textTransform: "uppercase",
                                  letterSpacing: "0.06em"
                                }}
                              >
                                Allergy alert
                              </span>
                            )}

                            <span
                              style={{
                                padding: "7px 12px",
                                borderRadius: "999px",
                                fontSize: "0.78rem",
                                fontWeight: 700,
                                background: statusStyle.background,
                                color: statusStyle.color,
                                textTransform: "capitalize"
                              }}
                            >
                              {formatStatus(order.status)}
                            </span>
                          </div>
                        </div>

                        <div
                          style={{
                            display: "flex",
                            flexDirection: "column",
                            gap: "10px"
                          }}
                        >
                          {order.items?.map((item, index) => {
                            const itemIngredients = normalizeStringList(item.ingredients)
                            const skippedIngredients = getSkippedIngredientsForItem(
                              item,
                              avoidIngredients
                            )

                            return (
                              <div
                                key={`${order._id}-${item.name}-${index}`}
                                style={{
                                  display: "flex",
                                  flexDirection: "column",
                                  gap: "10px",
                                  padding: "10px 12px",
                                  borderRadius: "14px",
                                  background: "rgba(15, 23, 42, 0.65)",
                                  color: "#e2e8f0"
                                }}
                              >
                                <div
                                  style={{
                                    display: "flex",
                                    justifyContent: "space-between",
                                    gap: "12px"
                                  }}
                                >
                                  <span>{item.name}</span>
                                  <strong>x{item.quantity}</strong>
                                </div>

                                {itemIngredients.length > 0 && (
                                  <div
                                    style={{
                                      display: "flex",
                                      flexDirection: "column",
                                      gap: "8px"
                                    }}
                                  >
                                    <strong
                                      style={{
                                        fontSize: "0.75rem",
                                        color: "#93c5fd"
                                      }}
                                    >
                                      Ingredients
                                    </strong>

                                    <div
                                      style={{
                                        display: "flex",
                                        flexWrap: "wrap",
                                        gap: "8px"
                                      }}
                                    >
                                      {itemIngredients.map((ingredient) => {
                                        const isSkipped =
                                          skippedIngredients.includes(ingredient)

                                        return (
                                          <span
                                            key={`${order._id}-${item.name}-${ingredient}`}
                                            style={{
                                              padding: "6px 9px",
                                              borderRadius: "999px",
                                              background: isSkipped
                                                ? "rgba(239, 68, 68, 0.2)"
                                                : "rgba(59, 130, 246, 0.16)",
                                              color: isSkipped
                                                ? "#fecaca"
                                                : "#dbeafe",
                                              fontSize: "0.74rem",
                                              fontWeight: 700,
                                              textDecoration: isSkipped
                                                ? "line-through"
                                                : "none"
                                            }}
                                          >
                                            {ingredient}
                                          </span>
                                        )
                                      })}
                                    </div>
                                  </div>
                                )}
                              </div>
                            )
                          })}
                        </div>

                        {hasKitchenAlert && (
                          <div
                            style={{
                              display: "flex",
                              flexDirection: "column",
                              gap: "10px",
                              padding: "12px",
                              borderRadius: "16px",
                              background: "rgba(127, 29, 29, 0.16)",
                              border: "1px solid rgba(248, 113, 113, 0.2)"
                            }}
                          >
                            {avoidIngredients.length > 0 && (
                              <div
                                style={{
                                  display: "flex",
                                  flexWrap: "wrap",
                                  gap: "8px"
                                }}
                              >
                                {avoidIngredients.map((ingredient) => (
                                  <span
                                    key={`${order._id}-${ingredient}`}
                                    style={{
                                      padding: "7px 10px",
                                      borderRadius: "999px",
                                      background: "rgba(239, 68, 68, 0.2)",
                                      color: "#fee2e2",
                                      fontSize: "0.76rem",
                                      fontWeight: 700
                                    }}
                                  >
                                    No {ingredient}
                                  </span>
                                ))}
                              </div>
                            )}

                            {customerNote && (
                              <p
                                style={{
                                  fontSize: "0.8rem",
                                  color: "#fecaca",
                                  lineHeight: 1.5
                                }}
                              >
                                {customerNote}
                              </p>
                            )}
                          </div>
                        )}

                        <div
                          style={{
                            display: "grid",
                            gridTemplateColumns: "1fr 1fr",
                            gap: "10px"
                          }}
                        >
                          <button
                            type="button"
                            onClick={() => updateOrderStatus(order._id, "preparing")}
                            disabled={isUpdating || order.status === "preparing"}
                            style={{
                              padding: "12px 14px",
                              borderRadius: "14px",
                              border: "1px solid rgba(96, 165, 250, 0.3)",
                              background:
                                order.status === "preparing" ? "#1d4ed8" : "#2563eb",
                              color: "#eff6ff",
                              fontWeight: 700,
                              cursor:
                                isUpdating || order.status === "preparing"
                                  ? "not-allowed"
                                  : "pointer",
                              opacity:
                                isUpdating || order.status === "preparing" ? 0.72 : 1
                            }}
                          >
                            Preparing
                          </button>

                          <button
                            type="button"
                            onClick={() => updateOrderStatus(order._id, "ready")}
                            disabled={isUpdating || order.status === "ready"}
                            style={{
                              padding: "12px 14px",
                              borderRadius: "14px",
                              border: "1px solid rgba(74, 222, 128, 0.3)",
                              background:
                                order.status === "ready" ? "#15803d" : "#16a34a",
                              color: "#f0fdf4",
                              fontWeight: 700,
                              cursor:
                                isUpdating || order.status === "ready"
                                  ? "not-allowed"
                                  : "pointer",
                              opacity:
                                isUpdating || order.status === "ready" ? 0.72 : 1
                            }}
                          >
                            Ready
                          </button>
                        </div>
                      </section>
                    )
                  })}
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default Kitchen
