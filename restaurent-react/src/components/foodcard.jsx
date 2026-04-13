function FoodCard({ food, cart, setCart }) {
  const foodId = food.itemId || food.id
  const cartItem = cart.find((item) => (item.itemId || item.id) === foodId)
  const isInCart = Boolean(cartItem)

  function toggleCartItem() {
    setCart((currentCart) => {
      const existing = currentCart.find(
        (item) => (item.itemId || item.id) === foodId
      )

      if (existing) {
        return currentCart.filter((item) => (item.itemId || item.id) !== foodId)
      }

      return [...currentCart, { ...food, quantity: 1 }]
    })
  }

  function handleKeyDown(event) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault()
      toggleCartItem()
    }
  }

  return (
    <article
      className={`food-card ${isInCart ? "selected" : ""}`}
      role="button"
      tabIndex={0}
      aria-pressed={isInCart}
      aria-label={`${isInCart ? "Remove" : "Add"} ${food.name}`}
      onClick={toggleCartItem}
      onKeyDown={handleKeyDown}
    >
      <div className={`food-select-badge ${isInCart ? "selected" : ""}`}>
        {isInCart ? "OK" : "+"}
      </div>
      <img
        src={food.image || "https://images.unsplash.com/photo-1544025162-d76694265947"}
        alt={food.name}
      />

      <div className="food-card-content">
        <h3>{food.name}</h3>
        <p>{food.category}</p>

        <div className="food-card-footer">
          <div className={`food-action-box ${isInCart ? "selected" : ""}`}>
            {isInCart ? `Qty ${cartItem.quantity}` : "+ Add"}
          </div>

          <span>Rs. {food.price}</span>
        </div>
      </div>
    </article>
  )
}

export default FoodCard
