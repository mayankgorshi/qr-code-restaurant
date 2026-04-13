import { useCallback, useEffect, useState } from "react"
import { Link, useLocation } from "react-router-dom"
import {
  apiBaseUrl,
  buildMenuUrl,
  getRestaurantSlugFromSearch,
  getTableNumberFromSearch
} from "../utils/restaurant"

const statusColors = {
  pending: {
    background: "#fef3c7",
    color: "#92400e"
  },
  preparing: {
    background: "#dbeafe",
    color: "#1d4ed8"
  },
  ready: {
    background: "#dcfce7",
    color: "#166534"
  }
}

function getStatusStyle(status = "pending") {
  return statusColors[status] || {
    background: "#e2e8f0",
    color: "#334155"
  }
}

function formatStatus(status = "pending") {
  return status.charAt(0).toUpperCase() + status.slice(1)
}

function OrderStatus() {
  const location = useLocation()
  const [orders, setOrders] = useState([])
  const [restaurantName, setRestaurantName] = useState("")
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState("")

  const restaurantSlug = getRestaurantSlugFromSearch(location.search)
  const tableNumber = getTableNumberFromSearch(location.search)
  const hasValidTable = Number.isInteger(tableNumber) && tableNumber > 0

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
      // Keep page functional even if meta fetch fails.
    }
  }, [restaurantSlug])

  const loadOrders = useCallback(async () => {
    if (!hasValidTable) {
      setOrders([])
      setIsLoading(false)
      return
    }

    try {
      const response = await fetch(
        `${apiBaseUrl}/api/orders?restaurant=${restaurantSlug}`
      )

      if (!response.ok) {
        throw new Error("Unable to fetch orders.")
      }

      const data = await response.json()
      const filteredOrders = Array.isArray(data)
        ? data.filter((order) => Number(order.tableNumber) === tableNumber)
        : []

      setOrders(filteredOrders)
      setError("")
    } catch (err) {
      console.error("Failed to load order status", err)
      setError("Failed to load your order status.")
    } finally {
      setIsLoading(false)
    }
  }, [hasValidTable, restaurantSlug, tableNumber])

  useEffect(() => {
    setIsLoading(true)
    loadRestaurantMeta()
    loadOrders()

    if (!hasValidTable) {
      return undefined
    }

    const interval = window.setInterval(loadOrders, 3000)

    return () => window.clearInterval(interval)
  }, [hasValidTable, loadOrders, loadRestaurantMeta, restaurantSlug, tableNumber])

  return (
    <div
      style={{
        width: "100%",
        minHeight: "100vh",
        padding: "28px 18px 40px",
        background:
          "linear-gradient(180deg, #fff9ef 0%, #fff3e1 45%, #ffffff 100%)"
      }}
    >
      <div
        style={{
          maxWidth: "860px",
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
            marginBottom: "20px"
          }}
        >
          <div>
            <p
              style={{
                fontSize: "0.82rem",
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                color: "#b45309",
                marginBottom: "8px"
              }}
            >
              Live table tracking
            </p>
            <h1
              style={{
                margin: 0,
                fontSize: "2rem",
                color: "#111827"
              }}
            >
              {hasValidTable ? `Table ${tableNumber} status` : "Order status"}
            </h1>
            {restaurantName && (
              <p
                style={{
                  marginTop: "8px",
                  color: "#6b7280"
                }}
              >
                {restaurantName}
              </p>
            )}
          </div>

          <Link
            to={buildMenuUrl(restaurantSlug, tableNumber)}
            style={{
              padding: "11px 16px",
              borderRadius: "999px",
              background: "#111827",
              color: "#ffffff",
              textDecoration: "none",
              fontWeight: 700
            }}
          >
            Back to menu
          </Link>
        </div>

        <p
          style={{
            marginBottom: "24px",
            color: "#6b7280",
            lineHeight: 1.6
          }}
        >
          This page refreshes every 3 seconds so you can follow your order from
          the kitchen in real time.
        </p>

        {!hasValidTable && (
          <div
            style={{
              padding: "18px",
              borderRadius: "18px",
              background: "#ffffff",
              border: "1px solid #fed7aa",
              color: "#9a3412",
              boxShadow: "0 14px 30px rgba(15, 23, 42, 0.08)"
            }}
          >
            Add a valid table number to the URL, like `/status?restaurant=foodie-demo&table=5`.
          </div>
        )}

        {error && (
          <div
            style={{
              marginBottom: "16px",
              padding: "14px 16px",
              borderRadius: "18px",
              background: "#fef2f2",
              border: "1px solid #fecaca",
              color: "#b91c1c",
              boxShadow: "0 14px 30px rgba(15, 23, 42, 0.08)"
            }}
          >
            {error}
          </div>
        )}

        {hasValidTable && isLoading ? (
          <div
            style={{
              padding: "20px",
              borderRadius: "20px",
              background: "#ffffff",
              border: "1px solid #fde7c3",
              boxShadow: "0 14px 30px rgba(15, 23, 42, 0.08)",
              color: "#4b5563"
            }}
          >
            Loading your orders...
          </div>
        ) : null}

        {hasValidTable && !isLoading && !error && orders.length === 0 ? (
          <div
            style={{
              padding: "20px",
              borderRadius: "20px",
              background: "#ffffff",
              border: "1px solid #fde7c3",
              boxShadow: "0 14px 30px rgba(15, 23, 42, 0.08)",
              color: "#4b5563"
            }}
          >
            No orders found for table {tableNumber} yet.
          </div>
        ) : null}

        <div
          style={{
            display: "grid",
            gap: "16px"
          }}
        >
          {orders.map((order) => {
            const statusStyle = getStatusStyle(order.status)
            const avoidIngredients =
              order.customerPreferences?.avoidIngredients || []
            const customerNote = order.customerPreferences?.note?.trim() || ""

            return (
              <article
                key={order._id}
                style={{
                  padding: "20px",
                  borderRadius: "22px",
                  background: "#ffffff",
                  border: "1px solid #fde7c3",
                  boxShadow: "0 14px 30px rgba(15, 23, 42, 0.08)"
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "flex-start",
                    gap: "12px",
                    flexWrap: "wrap",
                    marginBottom: "16px"
                  }}
                >
                  <div>
                    <h2
                      style={{
                        margin: 0,
                        color: "#111827",
                        fontSize: "1.15rem"
                      }}
                    >
                      Order #{order._id?.slice(-6)?.toUpperCase() || "------"}
                    </h2>
                    <p
                      style={{
                        marginTop: "6px",
                        color: "#6b7280",
                        fontSize: "0.86rem"
                      }}
                    >
                      Placed on {new Date(order.createdAt).toLocaleString()}
                    </p>
                  </div>

                  <span
                    style={{
                      padding: "8px 12px",
                      borderRadius: "999px",
                      background: statusStyle.background,
                      color: statusStyle.color,
                      fontWeight: 700
                    }}
                  >
                    {formatStatus(order.status)}
                  </span>
                </div>

                <div
                  style={{
                    display: "grid",
                    gap: "10px",
                    marginBottom: "16px"
                  }}
                >
                  {order.items?.map((item, index) => (
                    <div
                      key={`${order._id}-${index}`}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        gap: "12px",
                        padding: "12px 14px",
                        borderRadius: "16px",
                        background: "#fffaf3"
                      }}
                    >
                      <div>
                        <div
                          style={{
                            fontWeight: 700,
                            color: "#111827"
                          }}
                        >
                          {item.name}
                        </div>
                        <div
                          style={{
                            marginTop: "4px",
                            fontSize: "0.84rem",
                            color: "#6b7280"
                          }}
                        >
                          Quantity: {item.quantity}
                        </div>
                      </div>

                      <strong style={{ color: "#92400e" }}>
                        Rs. {(item.price || 0) * (item.quantity || 0)}
                      </strong>
                    </div>
                  ))}
                </div>

                {(avoidIngredients.length > 0 || customerNote) && (
                  <div
                    style={{
                      display: "grid",
                      gap: "10px",
                      marginBottom: "16px",
                      padding: "14px",
                      borderRadius: "18px",
                      background: "#fff7ed",
                      border: "1px solid #fed7aa"
                    }}
                  >
                    <div>
                      <div
                        style={{
                          fontSize: "0.76rem",
                          letterSpacing: "0.08em",
                          textTransform: "uppercase",
                          color: "#c2410c",
                          marginBottom: "6px"
                        }}
                      >
                        Kitchen instruction sent
                      </div>

                      <div
                        style={{
                          fontSize: "0.86rem",
                          color: "#7c2d12",
                          lineHeight: 1.5
                        }}
                      >
                        Your allergy and ingredient preferences were added with
                        this order.
                      </div>
                    </div>

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
                              background: "#ffedd5",
                              color: "#9a3412",
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
                      <div
                        style={{
                          fontSize: "0.86rem",
                          color: "#7c2d12",
                          lineHeight: 1.5
                        }}
                      >
                        {customerNote}
                      </div>
                    )}
                  </div>
                )}

                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: "12px",
                    flexWrap: "wrap",
                    paddingTop: "12px",
                    borderTop: "1px solid #f3e0c1",
                    color: "#6b7280"
                  }}
                >
                  <span>Total bill</span>
                  <strong
                    style={{
                      fontSize: "1rem",
                      color: "#111827"
                    }}
                  >
                    Rs. {order.bill?.total ?? 0}
                  </strong>
                </div>
              </article>
            )
          })}
        </div>
      </div>
    </div>
  )
}

export default OrderStatus
