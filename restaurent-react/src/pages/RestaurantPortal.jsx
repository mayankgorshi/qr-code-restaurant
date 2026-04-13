import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import {
  apiBaseUrl,
  getSessionToken,
  parseJsonResponse,
  saveSessionToken
} from "../utils/restaurant"

const subscriptionPlans = [
  {
    id: "monthly",
    name: "Simple Monthly",
    price: "INR 2,199 / month",
    description:
      "A clean monthly plan for restaurants that want QR menus, owner login, and live menu control.",
    badge: "Flexible billing"
  },
  {
    id: "yearly",
    name: "Simple Yearly",
    price: "INR 18,999 /yearly",
    description:
      "The same product with an annual billing cycle for restaurants that want a long-term setup.",
    badge: "Best value"
  }
]

const initialRegisterState = {
  restaurantName: "",
  ownerName: "",
  email: "",
  password: "",
  publicDescription: "",
  subscriptionPlan: "monthly"
}

const initialLoginState = {
  email: "",
  password: ""
}

const initialResetState = {
  email: "",
  password: "",
  confirmPassword: ""
}

function RestaurantPortal() {
  const navigate = useNavigate()
  const [mode, setMode] = useState("register")
  const [registerForm, setRegisterForm] = useState(initialRegisterState)
  const [loginForm, setLoginForm] = useState(initialLoginState)
  const [resetForm, setResetForm] = useState(initialResetState)
  const [showRegisterPassword, setShowRegisterPassword] = useState(false)
  const [showLoginPassword, setShowLoginPassword] = useState(false)
  const [showResetPassword, setShowResetPassword] = useState(false)
  const [showResetConfirmPassword, setShowResetConfirmPassword] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [feedback, setFeedback] = useState({
    type: "info",
    message: ""
  })

  useEffect(() => {
    if (getSessionToken()) {
      navigate("/portal/dashboard", { replace: true })
    }
  }, [navigate])

  function handleRegisterChange(event) {
    const { name, value } = event.target
    setRegisterForm((current) => ({ ...current, [name]: value }))
  }

  function handleLoginChange(event) {
    const { name, value } = event.target
    setLoginForm((current) => ({ ...current, [name]: value }))
  }

  function handleResetChange(event) {
    const { name, value } = event.target
    setResetForm((current) => ({ ...current, [name]: value }))
  }

  async function handleRegisterSubmit(event) {
    event.preventDefault()
    setIsSubmitting(true)
    setFeedback({
      type: "info",
      message: "Creating your restaurant workspace..."
    })

    try {
      const response = await fetch(`${apiBaseUrl}/api/restaurants/register`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(registerForm)
      })

      const payload = await parseJsonResponse(
        response,
        "Server sent an invalid response while creating the account.",
        "Unable to create your restaurant account."
      )

      saveSessionToken(payload.token)

      setFeedback({
        type: "success",
        message: "Workspace created. Opening your owner dashboard..."
      })

      navigate("/portal/dashboard")
    } catch (error) {
      setFeedback({
        type: "error",
        message: error.message || "Unable to create your restaurant account."
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleLoginSubmit(event) {
    event.preventDefault()
    setIsSubmitting(true)
    setFeedback({
      type: "info",
      message: "Checking your owner login..."
    })

    try {
      const response = await fetch(`${apiBaseUrl}/api/restaurants/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(loginForm)
      })

      const payload = await parseJsonResponse(
        response,
        "Server sent an invalid response while logging in.",
        "Unable to login."
      )

      saveSessionToken(payload.token)

      setFeedback({
        type: "success",
        message: "Login successful. Opening your dashboard..."
      })

      navigate("/portal/dashboard")
    } catch (error) {
      setFeedback({
        type: "error",
        message: error.message || "Unable to login."
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleResetSubmit(event) {
    event.preventDefault()

    if (resetForm.password !== resetForm.confirmPassword) {
      setFeedback({
        type: "error",
        message: "The passwords do not match."
      })
      return
    }

    setIsSubmitting(true)
    setFeedback({
      type: "info",
      message: "Resetting your password..."
    })

    try {
      const response = await fetch(`${apiBaseUrl}/api/restaurants/forgot-password`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          email: resetForm.email,
          password: resetForm.password
        })
      })

      await parseJsonResponse(
        response,
        "Server sent an invalid response while resetting the password.",
        "Unable to reset password."
      )

      setLoginForm({
        email: resetForm.email,
        password: ""
      })
      setResetForm(initialResetState)
      setMode("login")
      setShowResetPassword(false)
      setShowResetConfirmPassword(false)
      setFeedback({
        type: "success",
        message: "Password reset successful. You can now login with the new password."
      })
    } catch (error) {
      setFeedback({
        type: "error",
        message: error.message || "Unable to reset password."
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="portal-shell">
      <section className="portal-hero">
        <div className="portal-badge">Restaurant SaaS</div>
        <h1>Launch a world-class restaurant ordering system from one owner portal.</h1>
        <p>
          Create your restaurant workspace, publish a QR-powered menu, manage
          live items, and generate table QR codes your team can print and use
          right away.
        </p>

        <div className="portal-feature-grid">
          <article className="portal-feature-card">
            <strong>Owner control</strong>
            <span>Update your brand, slug, menu, logo, and table QR sheet.</span>
          </article>
          <article className="portal-feature-card">
            <strong>Live menu operations</strong>
            <span>Turn dishes on or off, update pricing, and keep the kitchen flow clean.</span>
          </article>
          <article className="portal-feature-card">
            <strong>Table-ready QR flow</strong>
            <span>Generate table-number QR cards that customers can scan instantly.</span>
          </article>
        </div>

        <div className="portal-microstats">
          <div>
            <strong>1 portal</strong>
            <span>for every owner</span>
          </div>
          <div>
            <strong>2 billing options</strong>
            <span>monthly or yearly</span>
          </div>
          <div>
            <strong>100 tables</strong>
            <span>QR generation ready</span>
          </div>
        </div>

        <div className="portal-plan-grid">
          {subscriptionPlans.map((plan) => (
            <button
              type="button"
              key={plan.id}
              className={`portal-plan-card ${
                registerForm.subscriptionPlan === plan.id ? "selected" : ""
              }`}
              onClick={() =>
                setRegisterForm((current) => ({
                  ...current,
                  subscriptionPlan: plan.id
                }))
              }
            >
              <div className="portal-plan-top">
                <strong>{plan.name}</strong>
                <span>{plan.price}</span>
              </div>
              <small>{plan.badge}</small>
              <p>{plan.description}</p>
            </button>
          ))}
        </div>
        <p className="portal-plan-note">
          One simple product, two billing cycles. Pick the timeline that fits
          your restaurant.
        </p>
      </section>

      <section className="portal-card">
        <div className="portal-card-copy">
          <h2>Owner Access</h2>
          <p>Start a new workspace or sign in to manage your existing restaurant.</p>
        </div>

        <div className="portal-tabs">
          <button
            type="button"
            className={mode === "register" ? "active" : ""}
            onClick={() => setMode("register")}
          >
            New Subscription
          </button>
          <button
            type="button"
            className={mode === "login" || mode === "reset" ? "active" : ""}
            onClick={() => setMode("login")}
          >
            Existing Login
          </button>
        </div>

        <div className={`portal-status ${feedback.type}`}>{feedback.message}</div>

        {mode === "register" ? (
          <form className="portal-form" onSubmit={handleRegisterSubmit}>
            <label>
              <span>Restaurant Name</span>
              <input
                name="restaurantName"
                value={registerForm.restaurantName}
                onChange={handleRegisterChange}
                placeholder="Example: Spice Route Cafe"
                required
              />
            </label>

            <label>
              <span>Owner Name</span>
              <input
                name="ownerName"
                value={registerForm.ownerName}
                onChange={handleRegisterChange}
                placeholder="Your full name"
                required
              />
            </label>

            <label>
              <span>Email</span>
              <input
                type="email"
                name="email"
                value={registerForm.email}
                onChange={handleRegisterChange}
                placeholder="owner@restaurant.com"
                required
              />
            </label>

            <label>
              <span>Password</span>
              <div className="portal-password-field">
                <input
                  type={showRegisterPassword ? "text" : "password"}
                  name="password"
                  value={registerForm.password}
                  onChange={handleRegisterChange}
                  placeholder="Minimum 6 characters"
                  minLength={6}
                  required
                />
                <button
                  type="button"
                  className="portal-text-button"
                  onClick={() => setShowRegisterPassword((current) => !current)}
                >
                  {showRegisterPassword ? "Hide" : "Show"}
                </button>
              </div>
            </label>

            <label>
              <span>Public Intro</span>
              <textarea
                name="publicDescription"
                value={registerForm.publicDescription}
                onChange={handleRegisterChange}
                placeholder="Short line for customers on your QR menu"
                rows={3}
              />
            </label>

            <label>
              <span>Billing Cycle</span>
              <select
                name="subscriptionPlan"
                value={registerForm.subscriptionPlan}
                onChange={handleRegisterChange}
              >
                {subscriptionPlans.map((plan) => (
                  <option key={plan.id} value={plan.id}>
                    {plan.name} - {plan.price}
                  </option>
                ))}
              </select>
            </label>

            <button type="submit" className="portal-submit" disabled={isSubmitting}>
              {isSubmitting ? "Creating..." : "Create Workspace"}
            </button>
          </form>
        ) : mode === "login" ? (
          <form className="portal-form" onSubmit={handleLoginSubmit}>
            <label>
              <span>Email</span>
              <input
                type="email"
                name="email"
                value={loginForm.email}
                onChange={handleLoginChange}
                placeholder="owner@restaurant.com"
                required
              />
            </label>

            <label>
              <span>Password</span>
              <div className="portal-password-field">
                <input
                  type={showLoginPassword ? "text" : "password"}
                  name="password"
                  value={loginForm.password}
                  onChange={handleLoginChange}
                  placeholder="Enter your password"
                  required
                />
                <button
                  type="button"
                  className="portal-text-button"
                  onClick={() => setShowLoginPassword((current) => !current)}
                >
                  {showLoginPassword ? "Hide" : "Show"}
                </button>
              </div>
            </label>

            <div className="portal-inline-actions">
              <button
                type="button"
                className="portal-text-button"
                onClick={() => setMode("reset")}
              >
                Forgot password?
              </button>
            </div>

            <button type="submit" className="portal-submit" disabled={isSubmitting}>
              {isSubmitting ? "Logging in..." : "Open Dashboard"}
            </button>

            <p className="portal-help-copy">
              Demo owner login: <strong>demo@foodie.local</strong> /{" "}
              <strong>demo123</strong>
            </p>
          </form>
        ) : (
          <form className="portal-form" onSubmit={handleResetSubmit}>
            <label>
              <span>Registered Email</span>
              <input
                type="email"
                name="email"
                value={resetForm.email}
                onChange={handleResetChange}
                placeholder="owner@restaurant.com"
                required
              />
            </label>

            <label>
              <span>New Password</span>
              <div className="portal-password-field">
                <input
                  type={showResetPassword ? "text" : "password"}
                  name="password"
                  value={resetForm.password}
                  onChange={handleResetChange}
                  placeholder="Minimum 6 characters"
                  minLength={6}
                  required
                />
                <button
                  type="button"
                  className="portal-text-button"
                  onClick={() => setShowResetPassword((current) => !current)}
                >
                  {showResetPassword ? "Hide" : "Show"}
                </button>
              </div>
            </label>

            <label>
              <span>Confirm New Password</span>
              <div className="portal-password-field">
                <input
                  type={showResetConfirmPassword ? "text" : "password"}
                  name="confirmPassword"
                  value={resetForm.confirmPassword}
                  onChange={handleResetChange}
                  placeholder="Re-enter your new password"
                  minLength={6}
                  required
                />
                <button
                  type="button"
                  className="portal-text-button"
                  onClick={() =>
                    setShowResetConfirmPassword((current) => !current)
                  }
                >
                  {showResetConfirmPassword ? "Hide" : "Show"}
                </button>
              </div>
            </label>

            <button type="submit" className="portal-submit" disabled={isSubmitting}>
              {isSubmitting ? "Resetting..." : "Reset Password"}
            </button>

            <div className="portal-inline-actions">
              <button
                type="button"
                className="portal-text-button"
                onClick={() => setMode("login")}
              >
                Back to login
              </button>
            </div>
          </form>
        )}
      </section>
    </div>
  )
}

export default RestaurantPortal
