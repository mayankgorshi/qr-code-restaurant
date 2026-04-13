import { useState } from "react"
import FoodCard from "./foodcard"

function Layout({ cart, setCart, foods = [] }) {
  const [selectedCategory, setSelectedCategory] = useState("All")
  const categories = ["All", ...new Set(foods.map((food) => food.category))]
  const activeCategory = categories.includes(selectedCategory)
    ? selectedCategory
    : "All"

  const filteredFoods =
    activeCategory === "All"
      ? foods
      : foods.filter((food) => food.category === activeCategory)
  const groupedFoods = filteredFoods.reduce((groups, food) => {
    if (!groups[food.category]) {
      groups[food.category] = []
    }

    groups[food.category].push(food)

    return groups
  }, {})

  return (
    <div className="container">
      <aside className="sidebar">
        <h3>Categories</h3>

        <div id="category-list">
          {categories.map((category) => (
            <button
              key={category}
              type="button"
              className={`category-item ${activeCategory === category ? "active" : ""}`}
              onClick={() => setSelectedCategory(category)}
            >
              {category}
            </button>
          ))}
        </div>
      </aside>

      <main className="food-area" id="menu-start">
        {foods.length === 0 ? (
          <div className="empty-menu-state">
            This restaurant has not added any menu items yet.
          </div>
        ) : (
          <div id="food-container">
            {Object.entries(groupedFoods).map(([category, categoryFoods]) => (
              <section key={category} className="food-section">
                <h2>{category}</h2>

                <div className="food-grid">
                  {categoryFoods.map((food) => (
                    <FoodCard
                      key={food.itemId || food.id}
                      food={food}
                      cart={cart}
                      setCart={setCart}
                    />
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}

export default Layout
