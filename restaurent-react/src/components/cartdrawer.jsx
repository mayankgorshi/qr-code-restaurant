import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import { calculateBill } from "./utils/bill"
import {
  apiBaseUrl,
  buildStatusUrl,
  parseJsonResponse
} from "../utils/restaurant"

function CartDrawer({
  cart,
  setCart,
  closeCart,
  tableNumber = 1,
  allergySelections,
  setAllergySelections,
  specialInstructions,
  setSpecialInstructions,
  restaurantSlug,
  restaurantName
}) {
  const { subtotal, gst, service, total } = calculateBill(cart)
  const [isProcessing, setIsProcessing] = useState(false)
  const [paymentState, setPaymentState] = useState({
    type: "info",
    message: ""
  })
  const [placedOrder, setPlacedOrder] = useState(null)
  const demoPaymentsEnabled = import.meta.env.VITE_ENABLE_DEMO_PAYMENT !== "false"
  const navigate = useNavigate()
  const orderFingerprint = JSON.stringify({
    restaurantSlug,
    items: cart.map(({ itemId, id, quantity }) => ({ id: itemId || id, quantity })),
    avoidIngredients: allergySelections,
    specialInstructions,
    total
  })

  useEffect(() => {
    setPlacedOrder(null)
  }, [orderFingerprint])

  const finishPayment = (message) => {
    setPaymentState({
      type: "success",
      message
    })

    window.setTimeout(() => {
      setCart([])
      setAllergySelections([])
      setSpecialInstructions("")
      closeCart()
      navigate(buildStatusUrl(restaurantSlug, tableNumber))
    }, 700)
  }

  const getOrderLabel = (order) =>
    order?._id ? `Order #${order._id.slice(-6).toUpperCase()}` : "Your order"

  const ensureRestaurantOrder = async () => {
    if (placedOrder?.fingerprint === orderFingerprint) {
      return placedOrder
    }

    const response = await fetch(`${apiBaseUrl}/api/orders`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        restaurantSlug,
        restaurantName,
        tableNumber,
        items: cart.map(
          ({ itemId, id, name, price, quantity, ingredients, category, image }) => ({
            itemId: itemId || id,
            name,
            price,
            quantity,
            category,
            image,
            ingredients: Array.isArray(ingredients) ? ingredients : [],
            skipIngredients: Array.isArray(ingredients)
              ? ingredients.filter((ingredient) =>
                  allergySelections.includes(ingredient)
                )
              : []
          })
        ),
        bill: {
          subtotal,
          gst,
          serviceFee: service,
          total
        },
        avoidIngredients: allergySelections,
        specialInstructions: specialInstructions.trim(),
        customerPreferences: {
          avoidIngredients: allergySelections,
          note: specialInstructions.trim()
        },
        status: "pending"
      })
    })

    const payload = await parseJsonResponse(
      response,
      "Order server returned an invalid response. Restart the backend server and try again.",
      "Unable to place your order."
    )

    if (!payload.order) {
      throw new Error("Order was saved, but the server did not return its details.")
    }

    const nextOrder = {
      ...payload.order,
      fingerprint: orderFingerprint
    }

    setPlacedOrder(nextOrder)

    return nextOrder
  }

  const runDemoPayment = async (orderLabel) => {
    setPaymentState({
      type: "info",
      message: "Demo payment is running..."
    })

    await new Promise((resolve) => window.setTimeout(resolve, 900))

    finishPayment(`Demo payment successful. ${orderLabel} is confirmed.`)
  }

  const canUseDemoFallback = (message) =>
    demoPaymentsEnabled &&
    /Razorpay|payment server|create payment order|route not found|invalid response|missing|fetch/i.test(
      message
    )

  async function placeOrder() {
    if (cart.length === 0 || total <= 0) {
      setPaymentState({
        type: "warning",
        message: "Add at least one item before placing an order."
      })
      return
    }

    setIsProcessing(true)
    setPaymentState({
      type: "info",
      message: "Placing your order..."
    })

    let restaurantOrder

    try {
      restaurantOrder = await ensureRestaurantOrder()
      const orderLabel = getOrderLabel(restaurantOrder)

      if (!window.Razorpay) {
        if (demoPaymentsEnabled) {
          await runDemoPayment(orderLabel)
          return
        }

        finishPayment(`${orderLabel} placed successfully.`)
        return
      }

      setPaymentState({
        type: "info",
        message: `${orderLabel} placed. Opening payment...`
      })

      const response = await fetch(`${apiBaseUrl}/create-order`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ amount: total })
      })

      const payload = await parseJsonResponse(
        response,
        "Payment server returned an invalid response. Restart the backend server and try again.",
        "Unable to create payment order."
      )

      if (!payload.key) {
        if (demoPaymentsEnabled) {
          await runDemoPayment(orderLabel)
          return
        }

        finishPayment(`${orderLabel} placed successfully.`)
        return
      }

      const options = {
        key: payload.key,
        amount: payload.amount,
        currency: payload.currency || "INR",
        name: restaurantName || "Restaurant",
        description: "Food Order",
        order_id: payload.id,
        handler: function () {
          finishPayment(`Payment successful. ${orderLabel} is confirmed.`)
        },
        modal: {
          ondismiss: function () {
            setPaymentState({
              type: "warning",
              message: `${orderLabel} is saved as pending. You can retry payment.`
            })
          }
        }
      }

      const razorpay = new window.Razorpay(options)

      razorpay.on("payment.failed", function (event) {
        setPaymentState({
          type: "error",
          message:
            event.error?.description || "Payment failed. Please try again."
        })
      })

      razorpay.open()
    } catch (error) {
      const errorMessage = error.message || "Order could not be placed."

      if (restaurantOrder && canUseDemoFallback(errorMessage)) {
        await runDemoPayment(getOrderLabel(restaurantOrder))
        return
      }

      setPaymentState({
        type: restaurantOrder ? "warning" : "error",
        message: restaurantOrder
          ? `${getOrderLabel(restaurantOrder)} is saved, but ${errorMessage}`
          : errorMessage
      })
    } finally {
      setIsProcessing(false)
    }
  }

  const updateQuantity = (itemKey, change) => {
    setCart((currentCart) =>
      currentCart
        .map((item) =>
          (item.itemId || item.id) === itemKey
            ? { ...item, quantity: item.quantity + change }
            : item
        )
        .filter((item) => item.quantity > 0)
    )
  }

  const removeItem = (itemKey) => {
    setCart((currentCart) =>
      currentCart.filter((item) => (item.itemId || item.id) !== itemKey)
    )
  }

  return (
    <div className="cart-drawer-overlay" onClick={closeCart}>
      <section className="cart-drawer" onClick={(event) => event.stopPropagation()}>
        <div className="cart-drawer-handle" />

        <div className="cart-drawer-header">
          <div>
            <h3>Your Cart</h3>
            <p>{cart.length} dishes selected</p>
          </div>

          <button type="button" className="drawer-close" onClick={closeCart}>
            Close
          </button>
        </div>

        <div className="cart-drawer-body">
          <div className="cart-items-list">
            {cart.length === 0 && (
              <div className="empty-cart-state">
                Your cart is empty. Add dishes from a category to see them here.
              </div>
            )}

            {cart.map((item) => {
              const itemKey = item.itemId || item.id

              return (
                <div key={itemKey} className="cart-item">
                  <div className="cart-item-top">
                    <div className="cart-item-info">
                      <h4>{item.name}</h4>
                      <p>{item.category}</p>
                      <div className="cart-item-ingredient-copy">
                        Ingredients: {(item.ingredients || []).join(", ")}
                      </div>
                    </div>

                    <div className="cart-item-price">
                      Rs. {item.price * item.quantity}
                    </div>
                  </div>

                  <div className="cart-item-controls">
                    <div className="quantity-control">
                      <button
                        type="button"
                        className="quantity-button"
                        onClick={() => updateQuantity(itemKey, -1)}
                      >
                        -
                      </button>

                      <span className="quantity-value">{item.quantity}</span>

                      <button
                        type="button"
                        className="quantity-button"
                        onClick={() => updateQuantity(itemKey, 1)}
                      >
                        +
                      </button>
                    </div>

                    <button
                      type="button"
                      className="remove-item-button"
                      onClick={() => removeItem(itemKey)}
                    >
                      Remove
                    </button>
                  </div>
                </div>
              )
            })}
          </div>

          {(allergySelections.length > 0 || specialInstructions.trim()) && (
            <section className="kitchen-note-card">
              <div className="kitchen-note-header">
                <h4>Kitchen note</h4>
                <span>Will be sent with your order</span>
              </div>

              {allergySelections.length > 0 && (
                <div className="kitchen-note-block">
                  <strong>Do not add</strong>

                  <div className="ingredient-chip-list kitchen-chip-list">
                    {allergySelections.map((ingredient) => (
                      <span key={ingredient} className="ingredient-chip warning">
                        {ingredient}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {specialInstructions.trim() && (
                <div className="kitchen-note-block">
                  <strong>Extra instruction</strong>
                  <p>{specialInstructions.trim()}</p>
                </div>
              )}
            </section>
          )}

          <section className="bill-card">
            <div className="bill-row">
              <span>Items Total</span>
              <strong>Rs. {subtotal}</strong>
            </div>

            <div className="bill-row">
              <span>GST</span>
              <strong>Rs. {gst}</strong>
            </div>

            <div className="bill-row">
              <span>Service Fee</span>
              <strong>Rs. {service}</strong>
            </div>

            <div className="bill-row bill-row-total">
              <span>To Pay</span>
              <strong>Rs. {total}</strong>
            </div>
          </section>
        </div>

        <div className="cart-drawer-bottom">
          <div className={`cart-status ${paymentState.type}`}>
            {paymentState.message}
          </div>

          <div className="cart-drawer-footer">
            <button type="button" className="secondary-action" onClick={closeCart}>
              Close
            </button>

            <button
              type="button"
              className="primary-action"
              onClick={placeOrder}
              disabled={cart.length === 0 || isProcessing}
            >
              {isProcessing ? "Placing..." : "Place Order"}
            </button>
          </div>
        </div>
      </section>
    </div>
  )
}

export default CartDrawer
