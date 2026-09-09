export function calculateBill(cart) {

  const subtotal = cart.reduce(
    (sum, item) => sum + item.price * item.quantity,
    0
  )

  const gst = Math.round(subtotal * 0.05)

  const service = subtotal > 0 ? 20 : 0

  const total = subtotal + gst + service

  return { subtotal, gst, service, total }
}