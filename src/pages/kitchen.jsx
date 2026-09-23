import { useCallback, useEffect, useState } from "react"
import { Link, useLocation } from "react-router-dom"
import {
  apiBaseUrl,
  buildMenuUrl,
  getAuthHeaders,
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



function groupOrdersByTable(orders = []) {
  const groupedTables = new Map()

  orders.forEach((order) => {
    const tableKey = order.tableNumber ?? "Unknown"

    if (!groupedTables.has(tableKey)) {
      groupedTables.set(tableKey, {
        tableNumber: tableKey,
        orders: [],
        oldestCreatedAt: order.createdAt
      })
    }

    const currentTable = groupedTables.get(tableKey)

    currentTable.orders.push(order)

    const orderTime = new Date(
      order.createdAt || 0
    ).getTime()

    const oldestTableOrderTime = new Date(
      currentTable.oldestCreatedAt || 0
    ).getTime()

    if (orderTime < oldestTableOrderTime) {
      currentTable.oldestCreatedAt = order.createdAt
    }
  })

  return Array.from(groupedTables.values()).sort(
    (left, right) =>
      new Date(left.oldestCreatedAt || 0).getTime() -
      new Date(right.oldestCreatedAt || 0).getTime()
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
        `${apiBaseUrl}/api/orders?restaurant=${restaurantSlug}`,
        {
          headers: getAuthHeaders()
        }
      )

      if (!res.ok) {
        throw new Error("Unable to fetch orders.")
      }


      const data = await res.json()

      const activeOrders = Array.isArray(data)
        ? data.filter(
          (order) =>
            normalizeString(order.status).toLowerCase() !==
            "completed"
        )
        : []

      setOrders(activeOrders)
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
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeaders()
        },
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
        padding: "24px 18px 36px",
        background:
          "linear-gradient(180deg, #020617 0%, #0f172a 45%, #111827 100%)",
        color: "#f8fafc"
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "1500px",
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
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "14px"
            }}
          >
            <div
              style={{
                width: "58px",
                height: "58px",
                flexShrink: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                borderRadius: "18px",
                background:
                  "linear-gradient(135deg, #f8fafc, #cbd5e1)",
                boxShadow: "0 8px 20px rgba(2, 6, 23, 0.28)",
                fontSize: "2rem"
              }}
            >
              👨‍🍳
            </div>

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
          </div>

          <div
            style={{
              display: "flex",
              gap: "10px",
              flexWrap: "wrap",
              alignItems: "center"
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

            <button
              type="button"
              onClick={() => {
                window.location.href =
                  `/owner/profile?restaurant=${restaurantSlug}`
              }}
              aria-label="Open owner profile"
              title="Owner Profile"
              style={{
                display: "flex",
                alignItems: "center",
                gap: "10px",
                padding: "7px 16px 7px 8px",
                borderRadius: "999px",
                border: "1px solid rgba(59, 130, 246, 0.3)",
                background: "rgba(15, 23, 42, 0.9)",
                color: "#f8fafc",
                cursor: "pointer",
                boxShadow: "0 6px 18px rgba(2, 6, 23, 0.2)"
              }}
            >
              <span
                style={{
                  width: "40px",
                  height: "40px",
                  borderRadius: "50%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background:
                    "linear-gradient(135deg, #1d4ed8, #2563eb)",
                  border: "1px solid rgba(147, 197, 253, 0.3)",
                  fontSize: "1.15rem"
                }}
              >
                👤
              </span>

              <span
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "flex-start",
                  gap: "3px",
                  maxWidth: "180px"
                }}
              >
                <span
                  style={{
                    fontSize: "0.88rem",
                    fontWeight: 700,
                    color: "#f8fafc",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    maxWidth: "180px"
                  }}
                >
                  {restaurantName || restaurantSlug}
                </span>

                <span
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "5px",
                    fontSize: "0.7rem",
                    fontWeight: 600,
                    color: "#4ade80"
                  }}
                >
                  <span
                    style={{
                      width: "6px",
                      height: "6px",
                      borderRadius: "50%",
                      background: "#22c55e"
                    }}
                  />

                  Online
                </span>
              </span>
            </button>
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
              gridTemplateColumns: "repeat(auto-fit, minmax(310px, 1fr))",
              gap: "14px",
              alignItems: "start"
            }}
          >
            {tableGroups.map((tableGroup) => (
              <article
                key={`table-${tableGroup.tableNumber}`}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "8px",
                  padding: "10px",
                  borderRadius: "16px",
                  background: "rgba(15, 23, 42, 0.92)",
                  border: "1px solid rgba(148, 163, 184, 0.16)",
                  boxShadow: "0 12px 28px rgba(2, 6, 23, 0.24)"
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
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                        margin: 0,
                        color: "#f8fafc",
                        fontSize: "1.2rem"
                      }}
                    >
                      <span
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                          width: "34px",
                          height: "34px",
                          borderRadius: "10px",
                          background: "rgba(59, 130, 246, 0.14)"
                        }}
                      >
                        <svg
                          width="22"
                          height="22"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="#60a5fa"
                          strokeWidth="1.8"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <rect x="4" y="5" width="16" height="7" rx="1.5" />
                          <path d="M3 12h18" />
                          <path d="M7 12v7" />
                          <path d="M17 12v7" />
                          <path d="M5 19h4" />
                          <path d="M15 19h4" />
                        </svg>
                      </span>

                      Table {tableGroup.tableNumber}
                    </h2>
                    <p
                      style={{
                        marginTop: "6px",
                        color: "#94a3b8",
                        fontSize: "0.82rem"
                      }}
                    >
                      {new Date(tableGroup.oldestCreatedAt).toLocaleString()}
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
                    const paymentStatus =
                      normalizeString(order.paymentStatus).toLowerCase()

                    const isPaymentPaid = paymentStatus === "paid"

                    return (
                      <section
                        key={order._id}
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          gap: "9px",
                          padding: "10px",
                          borderRadius: "14px",
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
                            padding: "12px",
                            borderRadius: "12px",
                            background: "rgba(15, 23, 42, 0.5)",
                            border: "1px solid rgba(148, 163, 184, 0.1)"
                          }}
                        >
                          <div
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              gap: "12px",
                              marginBottom: "8px",
                              color: "#cbd5e1",
                              fontSize: "0.82rem"
                            }}
                          >
                            <span>Subtotal</span>

                            <strong>
                              ₹{Number(order.subtotal || 0).toFixed(2)}
                            </strong>
                          </div>

                          <div
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              gap: "12px",
                              marginBottom: "8px",
                              color: "#94a3b8",
                              fontSize: "0.82rem"
                            }}
                          >
                            <span>GST</span>

                            <span>
                              ₹{Number(order.gst || 0).toFixed(2)}
                            </span>
                          </div>

                          <div
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              gap: "12px",
                              marginBottom: "10px",
                              color: "#94a3b8",
                              fontSize: "0.82rem"
                            }}
                          >
                            <span>Service Fee</span>

                            <span>
                              ₹{Number(order.serviceFee || 0).toFixed(2)}
                            </span>
                          </div>

                          <div
                            style={{
                              height: "1px",
                              background: "rgba(148, 163, 184, 0.16)",
                              marginBottom: "10px"
                            }}
                          />

                          <div
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              gap: "12px",
                              marginBottom: "10px",
                              color: "#f8fafc",
                              fontSize: "0.95rem"
                            }}
                          >
                            <strong>Total</strong>

                            <strong>
                              ₹{Number(order.total || 0).toFixed(2)}
                            </strong>
                          </div>

                          <div
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              alignItems: "center",
                              gap: "12px",
                              paddingTop: "10px",
                              borderTop: "1px solid rgba(148, 163, 184, 0.12)",
                              fontSize: "0.82rem"
                            }}
                          >
                            <span
                              style={{
                                color: "#94a3b8"
                              }}
                            >
                              Payment
                            </span>

                            <strong
                              style={{
                                color: isPaymentPaid
                                  ? "#86efac"
                                  : "#fde68a",
                                textTransform: "capitalize"
                              }}
                            >
                              {isPaymentPaid ? "Paid" : "Pending"}
                            </strong>
                          </div>
                        </div>
                        <div
                          style={{
                            display: "flex",
                            flexDirection: "column",
                            gap: "8px",
                            padding: "10px",
                            borderRadius: "14px",
                            background: "rgba(2, 6, 23, 0.28)",
                            border: "1px solid rgba(148, 163, 184, 0.08)"
                          }}
                        >
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: "8px",
                              color: "#bfdbfe",
                              fontSize: "0.82rem",
                              fontWeight: 700
                            }}
                          >
                            <span>🍽️</span>

                            <span>
                              Items ({order.items?.length || 0})
                            </span>
                          </div>

                          <div
                            style={{
                              display: "flex",
                              flexDirection: "column",
                              gap: "6px"
                            }}
                          >
                            {order.items?.map((item, index) => (
                              <div
                                key={`${order._id}-${item.name}-${index}`}
                                style={{
                                  display: "flex",
                                  justifyContent: "space-between",
                                  alignItems: "center",
                                  gap: "12px",
                                  padding: "11px 12px",
                                  borderRadius: "10px",
                                  background: "rgba(30, 41, 59, 0.72)",
                                  border: "1px solid rgba(148, 163, 184, 0.08)",
                                  color: "#e2e8f0",
                                  fontSize: "0.86rem"
                                }}
                              >
                                <span
                                  style={{
                                    fontWeight: 600,
                                    lineHeight: 1.4
                                  }}
                                >
                                  {item.name}
                                </span>

                                <strong
                                  style={{
                                    flexShrink: 0,
                                    color: "#f8fafc"
                                  }}
                                >
                                  x{item.quantity}
                                </strong>
                              </div>
                            ))}
                          </div>
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
                                      padding: "4px 7px",
                                      borderRadius: "999px",
                                      background: "rgba(239, 68, 68, 0.2)",
                                      color: "#fee2e2",
                                      fontSize: "0.68rem",
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
                            display: "flex",
                            gap: "8px",
                            flexWrap: "wrap"
                          }}
                        >
                          {order.status === "pending" && (
                            <button
                              type="button"
                              disabled={isUpdating}
                              onClick={() => updateOrderStatus(order._id, "preparing")}
                              style={{
                                flex: 1,
                                minWidth: "110px",
                                padding: "9px 12px",
                                border: "none",
                                borderRadius: "10px",
                                background: "#2563eb",
                                color: "#fff",
                                fontWeight: 700,
                                cursor: isUpdating ? "not-allowed" : "pointer",
                                opacity: isUpdating ? 0.6 : 1
                              }}
                            >
                              Preparing
                            </button>
                          )}

                          {order.status === "preparing" && (
                            <button
                              type="button"
                              disabled={isUpdating}
                              onClick={() => updateOrderStatus(order._id, "ready")}
                              style={{
                                flex: 1,
                                minWidth: "110px",
                                padding: "9px 12px",
                                border: "none",
                                borderRadius: "10px",
                                background: "#16a34a",
                                color: "#fff",
                                fontWeight: 700,
                                cursor: isUpdating ? "not-allowed" : "pointer",
                                opacity: isUpdating ? 0.6 : 1
                              }}
                            >
                              Ready
                            </button>
                          )}

                          {order.status === "ready" && (
                            <button
                              type="button"
                              disabled={isUpdating || !isPaymentPaid}
                              onClick={() => {
                                if (!isPaymentPaid) {
                                  setError(
                                    "Payment must be completed before closing this order."
                                  )

                                  return
                                }

                                updateOrderStatus(order._id, "completed")
                              }}
                              style={{
                                flex: 1,
                                minWidth: "110px",
                                padding: "10px 12px",
                                border: "none",
                                borderRadius: "10px",
                                background: isPaymentPaid
                                  ? "#7c3aed"
                                  : "rgba(100, 116, 139, 0.35)",
                                color: isPaymentPaid
                                  ? "#fff"
                                  : "#94a3b8",
                                fontWeight: 700,
                                cursor:
                                  isUpdating || !isPaymentPaid
                                    ? "not-allowed"
                                    : "pointer",
                                opacity: isUpdating ? 0.6 : 1
                              }}
                            >
                              {isPaymentPaid
                                ? "Completed"
                                : "Payment Pending"}
                            </button>
                          )}

                          {order.status === "completed" && (
                            <div
                              style={{
                                width: "100%",
                                padding: "9px 12px",
                                borderRadius: "10px",
                                background: "rgba(22, 163, 74, 0.12)",
                                border: "1px solid rgba(74, 222, 128, 0.2)",
                                color: "#86efac",
                                textAlign: "center",
                                fontWeight: 700
                              }}
                            >
                              ✓ Order Completed
                            </div>
                          )}
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
