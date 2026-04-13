import { useEffect, useState } from "react"
import { BrowserRouter, Route, Routes, useLocation } from "react-router-dom"
import Navbar from "./components/navbar"
import Layout from "./components/layout"
import CartBar from "./components/cartbar"
import CartDrawer from "./components/cartdrawer"
import Kitchen from "./pages/kitchen"
import OrderStatus from "./pages/OrderStatus"
import RestaurantPortal from "./pages/RestaurantPortal"
import RestaurantDashboard from "./pages/RestaurantDashboard"
import {
  apiBaseUrl,
  getRestaurantSlugFromSearch,
  getTableNumberFromSearch,
  parseJsonResponse
} from "./utils/restaurant"

function PublicMenuPage() {
  const location = useLocation()
  const restaurantSlug = getRestaurantSlugFromSearch(location.search)
  const tableNumber = getTableNumberFromSearch(location.search)

  const [cart, setCart] = useState([])
  const [isCartOpen, setIsCartOpen] = useState(false)
  const [allergySelections, setAllergySelections] = useState([])
  const [specialInstructions, setSpecialInstructions] = useState("")
  const [restaurant, setRestaurant] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState("")

  useEffect(() => {
    setCart([])
    setAllergySelections([])
    setSpecialInstructions("")
    setIsCartOpen(false)
  }, [restaurantSlug])

  useEffect(() => {
    let isCancelled = false

    async function loadRestaurant() {
      setIsLoading(true)

      try {
        const response = await fetch(
          `${apiBaseUrl}/api/restaurants/public?slug=${restaurantSlug}`
        )

        const payload = await parseJsonResponse(
          response,
          "Restaurant menu API returned an invalid response.",
          "Unable to load this restaurant menu."
        )

        if (isCancelled) {
          return
        }

        setRestaurant(payload.restaurant)
        setError("")
      } catch (nextError) {
        if (isCancelled) {
          return
        }

        setRestaurant(null)
        setError(nextError.message || "Unable to load this restaurant menu.")
      } finally {
        if (!isCancelled) {
          setIsLoading(false)
        }
      }
    }

    loadRestaurant()

    return () => {
      isCancelled = true
    }
  }, [restaurantSlug])

  if (isLoading) {
    return (
      <div className="public-state-shell">
        <div className="public-state-card">Loading restaurant menu...</div>
      </div>
    )
  }

  if (error || !restaurant) {
    return (
      <div className="public-state-shell">
        <div className="public-state-card error">
          <h1>Restaurant menu unavailable</h1>
          <p>{error || "We could not load the selected restaurant."}</p>
          <a href="/portal">Open owner login</a>
        </div>
      </div>
    )
  }

  return (
    <>
      <Navbar
        tableNumber={tableNumber}
        restaurantName={restaurant.restaurantName}
        restaurantSlug={restaurant.slug}
        description={restaurant.publicDescription}
      />

      <Layout cart={cart} setCart={setCart} foods={restaurant.menu || []} />

      <CartBar
        cart={cart}
        openCart={() => setIsCartOpen(true)}
        allergySelections={allergySelections}
        setAllergySelections={setAllergySelections}
        specialInstructions={specialInstructions}
        setSpecialInstructions={setSpecialInstructions}
      />

      {isCartOpen && (
        <CartDrawer
          cart={cart}
          setCart={setCart}
          closeCart={() => setIsCartOpen(false)}
          tableNumber={tableNumber}
          allergySelections={allergySelections}
          setAllergySelections={setAllergySelections}
          specialInstructions={specialInstructions}
          setSpecialInstructions={setSpecialInstructions}
          restaurantSlug={restaurant.slug}
          restaurantName={restaurant.restaurantName}
        />
      )}
    </>
  )
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<PublicMenuPage />} />
        <Route path="/kitchen" element={<Kitchen />} />
        <Route path="/status" element={<OrderStatus />} />
        <Route path="/portal" element={<RestaurantPortal />} />
        <Route path="/portal/dashboard" element={<RestaurantDashboard />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
