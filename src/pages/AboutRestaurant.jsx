import { useEffect, useState } from "react"
import { Link, useSearchParams } from "react-router-dom"

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || "http://localhost:5001"

export default function AboutRestaurant() {
  const [searchParams] = useSearchParams()

  const restaurantSlug =
    searchParams.get("restaurant") || ""

  const tableNumber =
    searchParams.get("table") || ""

  const [restaurant, setRestaurant] =
    useState(null)

  const [loading, setLoading] =
    useState(true)

  const [error, setError] =
    useState("")

  useEffect(() => {
    async function loadRestaurant() {
      if (!restaurantSlug) {
        setError("Restaurant information is unavailable.")
        setLoading(false)
        return
      }

      try {
        const response = await fetch(
          `${API_BASE_URL}/api/restaurants/public?slug=${encodeURIComponent(
            restaurantSlug
          )}`
        )

        const data = await response.json()

        if (!response.ok) {
          throw new Error(
            data?.message ||
              "Unable to load restaurant information."
          )
        }

        setRestaurant(data.restaurant)
      } catch (err) {
        setError(
          err.message ||
            "Unable to load restaurant information."
        )
      } finally {
        setLoading(false)
      }
    }

    loadRestaurant()
  }, [restaurantSlug])

  const menuUrl = `/?restaurant=${encodeURIComponent(
    restaurantSlug
  )}&table=${encodeURIComponent(tableNumber)}`

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p>Loading restaurant information...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="text-center">
          <h1 className="text-2xl font-semibold mb-3">
            Unable to load information
          </h1>

          <p className="mb-6">
            {error}
          </p>

          <Link
            to={menuUrl}
            className="inline-block px-5 py-3 rounded-lg bg-black text-white"
          >
            Back to Menu
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-4xl mx-auto px-6 py-10">
        <Link
          to={menuUrl}
          className="inline-flex items-center mb-8 text-sm font-medium"
        >
          ← Back to Menu
        </Link>

        <div className="rounded-2xl border p-8">
          {restaurant?.logo && (
            <img
              src={restaurant.logo}
              alt={restaurant.restaurantName}
              className="w-24 h-24 rounded-2xl object-cover mb-6"
            />
          )}

          <h1 className="text-4xl font-bold mb-4">
            {restaurant?.restaurantName}
          </h1>

          {restaurant?.publicDescription && (
            <p className="text-lg leading-8 opacity-80">
              {restaurant.publicDescription}
            </p>
          )}

          <div className="mt-8 pt-6 border-t">
            <h2 className="text-xl font-semibold mb-3">
              Welcome
            </h2>

            <p className="leading-7 opacity-75">
              Thank you for visiting{" "}
              {restaurant?.restaurantName}.
              We hope you enjoy your meal!
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}