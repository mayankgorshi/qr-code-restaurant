import { useState } from "react"

function CartBar({
  cart,
  openCart,
  allergySelections,
  setAllergySelections,
  specialInstructions,
  setSpecialInstructions
}) {
  const [isGuideOpen, setIsGuideOpen] = useState(false)

  const totalItems = cart.reduce((sum, item) => sum + item.quantity, 0)

  const totalPrice = cart.reduce(
    (sum, item) => sum + item.price * item.quantity,
    0
  )

  const uniqueIngredients = Array.from(
    new Set(
      cart.flatMap((item) =>
        Array.isArray(item.ingredients) ? item.ingredients : []
      )
    )
  ).sort((left, right) => left.localeCompare(right))

  function toggleAvoidIngredient(ingredient) {
    setAllergySelections((currentSelections) =>
      currentSelections.includes(ingredient)
        ? currentSelections.filter((item) => item !== ingredient)
        : [...currentSelections, ingredient]
    )
  }

  if (totalItems === 0) return null

  return (
    <div className="cart-bar">
      <div className="cart-summary-row">
        <div className="cart-text">
          <strong>{totalItems} items</strong>
          <span className="cart-subtext">
            {allergySelections.length > 0
              ? `${allergySelections.length} ingredient${allergySelections.length > 1 ? "s" : ""} marked for kitchen`
              : "Review ingredients before you place the order"}
          </span>
        </div>

        <div className="cart-total-wrap">
          <button
            type="button"
            className="ingredient-guide-toggle"
            onClick={() => setIsGuideOpen((currentValue) => !currentValue)}
          >
            {isGuideOpen ? "Hide Guide" : "Ingredients & Allergy"}
          </button>

          <span>Rs. {totalPrice}</span>

          <button type="button" className="cart-button" onClick={openCart}>
            View Cart
          </button>
        </div>
      </div>

      {isGuideOpen && (
        <section className="ingredient-guide-panel">
          <div className="ingredient-guide-header">
            <h4>You can also check ingredients of your food items</h4>
            <p>
              See the ingredients of every selected dish and tell the kitchen
              what should be skipped.
            </p>
          </div>

          <div className="ingredient-dish-list">
            {cart.map((item) => (
              <article key={item.itemId || item.id} className="ingredient-dish-card">
                <div className="ingredient-dish-top">
                  <strong>{item.name}</strong>
                  <span>Qty {item.quantity}</span>
                </div>

                <div className="ingredient-chip-list">
                  {(item.ingredients || []).map((ingredient) => (
                    <span
                      key={`${item.itemId || item.id}-${ingredient}`}
                      className="ingredient-chip"
                    >
                      {ingredient}
                    </span>
                  ))}
                </div>
              </article>
            ))}
          </div>

          <section className="allergy-helper-card">
            <div className="allergy-helper-top">
              <div>
                <h5>Tell the kitchen what not to add</h5>
                <p>
                  Tap ingredients below if you are allergic to them or want them
                  removed.
                </p>
              </div>

              <span className="allergy-count-pill">
                {allergySelections.length} marked
              </span>
            </div>

            <div className="allergy-chip-list">
              {uniqueIngredients.map((ingredient) => {
                const isSelected = allergySelections.includes(ingredient)

                return (
                  <button
                    key={ingredient}
                    type="button"
                    className={`allergy-chip ${isSelected ? "selected" : ""}`}
                    onClick={() => toggleAvoidIngredient(ingredient)}
                  >
                    {isSelected ? `Skip ${ingredient}` : ingredient}
                  </button>
                )
              })}
            </div>

            <label className="allergy-note-field">
              <span>Extra note for kitchen</span>
              <textarea
                value={specialInstructions}
                onChange={(event) => setSpecialInstructions(event.target.value)}
                placeholder="Example: Please avoid peanuts and curd. Severe allergy."
                maxLength={220}
              />
            </label>
          </section>
        </section>
      )}
    </div>
  )
}

export default CartBar
