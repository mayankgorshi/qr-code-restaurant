import { useEffect, useMemo, useState } from "react"
import { Link, useLocation, useNavigate } from "react-router-dom"

import {
    apiBaseUrl,
    buildKitchenUrl,
    buildMenuUrl,
    clearSessionToken,
    getAuthHeaders,
    getRestaurantSlugFromSearch,
    parseJsonResponse
} from "../utils/restaurant"

const ACTIVE_ORDER_STATUSES = new Set([
    "pending",
    "preparing",
    "ready"
])

function OwnerProfile() {
    const navigate = useNavigate()
    const location = useLocation()
    const restaurantSlug = getRestaurantSlugFromSearch(location.search)

    const [restaurant, setRestaurant] = useState(null)
    const [orders, setOrders] = useState([])

    const [period, setPeriod] = useState("today")

    const [restaurantLoading, setRestaurantLoading] =
        useState(true)

    const [ordersLoading, setOrdersLoading] =
        useState(true)

    const [error, setError] = useState("")
    const [isAccountModalOpen, setIsAccountModalOpen] =
        useState(false)

    const [accountForm, setAccountForm] = useState({
        ownerName: "",
        email: "",
        mobileNumber: ""
    })

    const [accountSaving, setAccountSaving] =
        useState(false)

    const [accountError, setAccountError] =
        useState("")

    const [accountSuccess, setAccountSuccess] =
        useState("")

    const query = new URLSearchParams(location.search)
    const restaurantFromUrl =
        query.get("restaurant") || ""

    /*
     * --------------------------------------------------
     * LOAD RESTAURANT
     * --------------------------------------------------
     */

    useEffect(() => {
        let cancelled = false

        async function loadRestaurant() {
            setRestaurantLoading(true)

            try {
                const response = await fetch(
                    `${apiBaseUrl}/api/restaurants/me`,
                    {
                        headers: getAuthHeaders()
                    }
                )

                const payload = await parseJsonResponse(
                    response,
                    "Restaurant API returned an invalid response.",
                    "Unable to load restaurant profile."
                )

                if (cancelled) {
                    return
                }

                let restaurantData = payload.restaurant || null

                try {
                    const subscriptionResponse = await fetch(
                        `${apiBaseUrl}/api/subscriptions/status`,
                        {
                            headers: getAuthHeaders()
                        }
                    )

                    const subscriptionPayload =
                        await parseJsonResponse(
                            subscriptionResponse,
                            "Subscription API returned an invalid response.",
                            "Unable to load subscription information."
                        )

                    const subscription =
                        subscriptionPayload.subscription

                    if (restaurantData && subscription) {
                        restaurantData = {
                            ...restaurantData,
                            subscriptionStatus:
                                subscription.status ??
                                restaurantData.subscriptionStatus,
                            subscriptionStartedAt:
                                subscription.startedAt ??
                                restaurantData.subscriptionStartedAt,
                            subscriptionEndsAt:
                                subscription.endsAt ??
                                restaurantData.subscriptionEndsAt
                        }
                    }
                } catch (subscriptionError) {
                    console.error(
                        "Owner profile subscription error:",
                        subscriptionError
                    )
                }

                setRestaurant(restaurantData)
                setError("")
            } catch (nextError) {
                if (cancelled) {
                    return
                }

                setError(
                    nextError.message ||
                    "Unable to load restaurant profile."
                )
            } finally {
                if (!cancelled) {
                    setRestaurantLoading(false)
                }
            }
        }

        loadRestaurant()

        return () => {
            cancelled = true
        }
    }, [])

    /*
     * --------------------------------------------------
     * LOAD ORDERS
     *
     * Same endpoint used by Kitchen.
     * Refresh every 3 seconds.
     * --------------------------------------------------
     */

    useEffect(() => {
        if (!restaurant?.slug) {
            return
        }

        let cancelled = false

        async function loadOrders() {
            try {
                const response = await fetch(
                    `${apiBaseUrl}/api/orders?restaurant=${encodeURIComponent(
                        restaurant.slug
                    )}`,
                    {
                        headers: getAuthHeaders()
                    }
                )

                const payload = await parseJsonResponse(
                    response,
                    "Orders API returned an invalid response.",
                    "Unable to load restaurant orders."
                )

                if (cancelled) {
                    return
                }

                setOrders(
                    Array.isArray(payload)
                        ? payload
                        : Array.isArray(payload.orders)
                            ? payload.orders
                            : []
                )
            } catch (nextError) {
                if (!cancelled) {
                    console.error(
                        "Owner profile orders error:",
                        nextError
                    )
                }
            } finally {
                if (!cancelled) {
                    setOrdersLoading(false)
                }
            }
        }

        loadOrders()

        const interval = window.setInterval(
            loadOrders,
            3000
        )

        return () => {
            cancelled = true
            window.clearInterval(interval)
        }
    }, [restaurant?.slug])


    /*
     * --------------------------------------------------
     * NAVIGATION
     * --------------------------------------------------
     */

    function handleLogout() {
        clearSessionToken()
        navigate("/portal")
    }
    function openAccountModal() {
        setAccountForm({
            ownerName: restaurant?.ownerName || "",
            email: restaurant?.email || "",
            mobileNumber: restaurant?.mobileNumber || ""
        })

        setAccountError("")
        setAccountSuccess("")
        setIsAccountModalOpen(true)
    }

    function closeAccountModal() {
        if (accountSaving) {
            return
        }

        setIsAccountModalOpen(false)
        setAccountError("")
        setAccountSuccess("")
    }

    function handleAccountInputChange(event) {
        const { name, value } = event.target

        setAccountForm((currentForm) => ({
            ...currentForm,
            [name]: value
        }))
    }

    async function handleAccountSubmit(event) {
        event.preventDefault()

        setAccountSaving(true)
        setAccountError("")
        setAccountSuccess("")

        try {
            const response = await fetch(
                `${apiBaseUrl}/api/restaurants/me/account`,
                {
                    method: "PUT",
                    headers: {
                        ...getAuthHeaders(),
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify({
                        ownerName: accountForm.ownerName,
                        email: accountForm.email,
                        mobileNumber: accountForm.mobileNumber
                    })
                }
            )

            const payload = await parseJsonResponse(
                response,
                "Account API returned an invalid response.",
                "Unable to update account details."
            )

            if (!response.ok) {
                throw new Error(
                    payload.error ||
                    "Unable to update account details."
                )
            }

            if (payload.restaurant) {
                setRestaurant((currentRestaurant) => ({
                    ...currentRestaurant,
                    ...payload.restaurant
                }))
            }

            setAccountSuccess(
                "Account details updated successfully."
            )
        } catch (nextError) {
            setAccountError(
                nextError.message ||
                "Unable to update account details."
            )
        } finally {
            setAccountSaving(false)
        }
    }

    const slug =
        restaurant?.slug ||
        restaurantFromUrl

    const kitchenUrl = slug
        ? buildKitchenUrl(slug)
        : "/kitchen"

    const menuUrl = slug
        ? buildMenuUrl(slug, 1)
        : "/"


    /*
     * --------------------------------------------------
     * ACTIVE ORDERS
     *
     * Only these three statuses are active:
     * pending
     * preparing
     * ready
     *
     * This exactly matches the Kitchen workflow.
     * --------------------------------------------------
     */

    const activeOrders = useMemo(() => {
        return orders.filter((order) => {
            const status = String(
                order.status || ""
            ).toLowerCase()

            return ACTIVE_ORDER_STATUSES.has(status)
        })
    }, [orders])


    /*
     * --------------------------------------------------
     * PERIOD FILTER
     * --------------------------------------------------
     */

    const filteredOrders = useMemo(() => {
        const now = new Date()

        return orders.filter((order) => {
            const status = String(
                order.status || ""
            ).toLowerCase()

            if (
                status === "cancelled" ||
                status === "canceled"
            ) {
                return false
            }

            const createdAt = getOrderDate(order)

            if (!createdAt) {
                return false
            }

            if (period === "today") {
                return isSameDay(
                    createdAt,
                    now
                )
            }

            if (period === "week") {
                return (
                    createdAt >=
                    startOfDaysAgo(now, 6)
                )
            }

            if (period === "month") {
                return (
                    createdAt >=
                    startOfDaysAgo(now, 29)
                )
            }

            if (period === "year") {
                const yearStart = new Date(now)

                yearStart.setMonth(
                    now.getMonth() - 11
                )

                yearStart.setHours(
                    0,
                    0,
                    0,
                    0
                )

                return createdAt >= yearStart
            }

            return false
        })
    }, [orders, period])


    /*
     * --------------------------------------------------
     * SALES
     * --------------------------------------------------
     */

    const sales = useMemo(() => {
        return filteredOrders.reduce(
            (sum, order) => {
                return (
                    sum +
                    Number(
                        order.bill?.total || 0
                    )
                )
            },
            0
        )
    }, [filteredOrders])


    /*
     * --------------------------------------------------
     * AVERAGE ORDER VALUE
     * --------------------------------------------------
     */

    const averageOrder = useMemo(() => {
        if (filteredOrders.length === 0) {
            return 0
        }

        return (
            sales /
            filteredOrders.length
        )
    }, [
        sales,
        filteredOrders.length
    ])


    /*
     * --------------------------------------------------
     * MOST ORDERED ITEM
     * --------------------------------------------------
     */

    const mostOrderedItem = useMemo(() => {
        const counts = {}

        filteredOrders.forEach((order) => {
            if (!Array.isArray(order.items)) {
                return
            }

            order.items.forEach((item) => {
                const name =
                    item.name || "Unknown item"

                const quantity =
                    Number(item.quantity) || 1

                counts[name] =
                    (counts[name] || 0) +
                    quantity
            })
        })

        const entries =
            Object.entries(counts)

        if (entries.length === 0) {
            return null
        }

        entries.sort(
            (a, b) => b[1] - a[1]
        )

        return {
            name: entries[0][0],
            quantity: entries[0][1]
        }
    }, [filteredOrders])


    /*
     * --------------------------------------------------
     * SUBSCRIPTION
     * --------------------------------------------------
     */

    const subscription =
        getSubscriptionInfo(restaurant)


    /*
     * --------------------------------------------------
     * LOADING
     * --------------------------------------------------
     */

    if (restaurantLoading) {
        return (
            <div className="owner-page">
                <div className="owner-loading">
                    <div className="spinner" />
                    <p>
                        Loading restaurant...
                    </p>
                </div>
            </div>
        )
    }


    /*
     * --------------------------------------------------
     * ERROR
     * --------------------------------------------------
     */

    if (error || !restaurant) {
        return (
            <div className="owner-page">
                <div className="owner-error">

                    <div className="error-icon">
                        !
                    </div>

                    <h1>
                        Owner Profile unavailable
                    </h1>

                    <p>
                        {error ||
                            "Unable to load your restaurant."}
                    </p>

                    <Link
                        to="/portal/dashboard"
                        className="primary-button"
                    >
                        Open Restaurant Dashboard
                    </Link>

                </div>
            </div>
        )
    }


    return (
        <div className="owner-page">

            <main className="owner-container">

                {/* =========================================
            HEADER
        ========================================== */}

                <header className="owner-header">

                    <div className="owner-heading">

                        <div className="owner-avatar">
                            👤
                        </div>

                        <div>

                            <p className="eyebrow">
                                Owner Control Center
                            </p>

                            <h1>
                                {restaurant.restaurantName}
                            </h1>

                            <p className="subtitle">
                                Your restaurant at a glance.
                            </p>

                        </div>

                    </div>


                    <div className="header-actions">

                        <Link
                            to={kitchenUrl}
                            className="kitchen-button"
                        >
                            👨‍🍳 Open Kitchen
                        </Link>

                        <Link
                            to={menuUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="menu-button"
                        >
                            View Menu ↗
                        </Link>

                    </div>

                </header>


                {/* =========================================
            SUBSCRIPTION
        ========================================== */}

                <section
                    className={`subscription-card ${subscription.className}`}
                >

                    <div className="subscription-left">

                        <div className="subscription-icon">
                            {subscription.icon}
                        </div>

                        <div>

                            <p className="eyebrow">
                                Subscription
                            </p>

                            <h2>
                                {subscription.title}
                            </h2>

                            <p className="subscription-description">
                                {subscription.description}
                            </p>

                            {subscription.detail && (
                                <p className="subscription-detail">
                                    {subscription.detail}
                                </p>
                            )}

                        </div>

                    </div>


                    {subscription.action && (
                        <Link
                            to="/portal/dashboard"
                            className="subscription-action"
                        >
                            {subscription.action}
                        </Link>
                    )}

                </section>


                {/* =========================================
            BUSINESS OVERVIEW
        ========================================== */}

                <section className="business-section">

                    <div className="section-header">

                        <div>
                            <p className="eyebrow">
                                Business Overview
                            </p>

                            <h2>
                                Restaurant performance
                            </h2>
                        </div>


                        <div className="period-selector">

                            <button
                                type="button"
                                className={
                                    period === "today"
                                        ? "period active"
                                        : "period"
                                }
                                onClick={() =>
                                    setPeriod("today")
                                }
                            >
                                Today
                            </button>

                            <button
                                type="button"
                                className={
                                    period === "week"
                                        ? "period active"
                                        : "period"
                                }
                                onClick={() =>
                                    setPeriod("week")
                                }
                            >
                                7 Days
                            </button>

                            <button
                                type="button"
                                className={
                                    period === "month"
                                        ? "period active"
                                        : "period"
                                }
                                onClick={() =>
                                    setPeriod("month")
                                }
                            >
                                30 Days
                            </button>

                            <button
                                type="button"
                                className={
                                    period === "year"
                                        ? "period active"
                                        : "period"
                                }
                                onClick={() =>
                                    setPeriod("year")
                                }
                            >
                                1 Year
                            </button>

                        </div>

                    </div>


                    <div className="stats-grid">

                        <StatCard
                            icon="💰"
                            label="Sales"
                            value={
                                ordersLoading
                                    ? "..."
                                    : formatCurrency(sales)
                            }
                        />

                        <StatCard
                            icon="🧾"
                            label="Orders"
                            value={
                                ordersLoading
                                    ? "..."
                                    : filteredOrders.length
                            }
                        />

                        <StatCard
                            icon="📊"
                            label="Average Order"
                            value={
                                ordersLoading
                                    ? "..."
                                    : formatCurrency(
                                        averageOrder
                                    )
                            }
                        />

                        <StatCard
                            icon="🔥"
                            label="Most Ordered"
                            value={
                                ordersLoading
                                    ? "..."
                                    : mostOrderedItem
                                        ? mostOrderedItem.name
                                        : "No orders yet"
                            }
                            suffix={
                                mostOrderedItem
                                    ? `${mostOrderedItem.quantity}×`
                                    : ""
                            }
                        />

                    </div>

                </section>


                {/* =========================================
            LIVE KITCHEN
        ========================================== */}

                <section className="active-orders-card">

                    <div className="active-orders-left">

                        <div className="active-orders-icon">
                            ⏳
                        </div>

                        <div>

                            <p className="eyebrow">
                                Live Kitchen Activity
                            </p>

                            <div className="active-title">

                                <h2>
                                    Active Orders
                                </h2>

                                <span className="active-number">
                                    {ordersLoading
                                        ? "..."
                                        : activeOrders.length}
                                </span>

                            </div>

                            <p className="active-description">

                                {ordersLoading
                                    ? "Checking kitchen activity..."
                                    : activeOrders.length === 0
                                        ? "Your kitchen is all caught up."
                                        : activeOrders.length === 1
                                            ? "1 order currently in the kitchen."
                                            : `${activeOrders.length} orders currently in the kitchen.`}

                            </p>

                        </div>

                    </div>


                    <Link
                        to={kitchenUrl}
                        className="open-kitchen-link"
                    >
                        Open Kitchen →
                    </Link>

                </section>


                {/* =========================================
            MANAGEMENT
        ========================================== */}
                <section className="management-section">
                    <div className="section-header management-heading">
                        <div>
                            <p className="eyebrow">Management</p>
                            <h2>Restaurant Settings</h2>
                            <p>Manage your restaurant and owner account.</p>
                        </div>
                    </div>

                    <Link to="/portal/dashboard" className="settings-card">
                        <div className="settings-icon">⚙️</div>

                        <div className="settings-content">
                            <strong>Restaurant Settings</strong>
                            <span>
                                Manage your restaurant, menu, tables, QR codes, branding and subscription.
                            </span>
                        </div>

                        <span className="settings-arrow">→</span>
                    </Link>
                    <div className="owner-account-card">

                        <div className="owner-account-header">

                            <div className="owner-account-icon">
                                👤
                            </div>

                            <div className="owner-account-heading">
                                <strong>Owner Account</strong>

                                <span>
                                    Manage your personal and contact information.
                                </span>
                            </div>

                            <button
                                type="button"
                                className="owner-account-edit-button"
                                onClick={openAccountModal}
                            >
                                Edit Account
                            </button>

                        </div>

                        <div className="owner-account-details">

                            <div className="owner-account-row">
                                <div>
                                    <span className="owner-account-label">
                                        Owner Name
                                    </span>

                                    <strong>
                                        {restaurant.ownerName || "Not added"}
                                    </strong>
                                </div>
                            </div>

                            <div className="owner-account-row">
                                <div>
                                    <span className="owner-account-label">
                                        Email
                                    </span>

                                    <strong>
                                        {restaurant.email || "Not added"}
                                    </strong>
                                </div>
                            </div>

                            <div className="owner-account-row">
                                <div>
                                    <span className="owner-account-label">
                                        Mobile Number
                                    </span>

                                    <strong>
                                        {restaurant.mobileNumber || "Not added"}
                                    </strong>
                                </div>
                            </div>

                        </div>

                    </div>
                </section>
                {/* =========================================
            FOOTER
        ========================================== */}

                <footer className="owner-footer">

                    <div>
                        <strong>
                            {restaurant.restaurantName}
                        </strong>

                        <span>
                            Restaurant Owner
                        </span>
                    </div>

                    <button
                        type="button"
                        onClick={handleLogout}
                        className="logout-button"
                    >
                        Logout
                    </button>

                </footer>

            </main>
            {isAccountModalOpen && (
                <div
                    className="account-modal-overlay"
                    onMouseDown={(event) => {
                        if (event.target === event.currentTarget) {
                            closeAccountModal()
                        }
                    }}
                >

                    <div className="account-modal">

                        <div className="account-modal-header">

                            <div>
                                <p className="eyebrow">
                                    Owner Account
                                </p>

                                <h2>
                                    Edit Account
                                </h2>

                                <p>
                                    Update your name, email, and mobile number.
                                </p>
                            </div>

                            <button
                                type="button"
                                className="account-modal-close"
                                onClick={closeAccountModal}
                                disabled={accountSaving}
                            >
                                ×
                            </button>

                        </div>

                        <form
                            className="account-form"
                            onSubmit={handleAccountSubmit}
                        >

                            <label>
                                Owner Name

                                <input
                                    type="text"
                                    name="ownerName"
                                    value={accountForm.ownerName}
                                    onChange={handleAccountInputChange}
                                    placeholder="Enter owner name"
                                    required
                                />
                            </label>

                            <label>
                                Restaurant Email

                                <input
                                    type="email"
                                    name="email"
                                    value={accountForm.email}
                                    onChange={handleAccountInputChange}
                                    placeholder="Enter restaurant email"
                                    required
                                />

                                <span className="account-field-note">
                                    Changing this email also changes the email
                                    used to sign in.
                                </span>
                            </label>

                            <label>
                                Mobile Number

                                <input
                                    type="tel"
                                    name="mobileNumber"
                                    value={accountForm.mobileNumber}
                                    onChange={handleAccountInputChange}
                                    placeholder="Enter 10-digit mobile number"
                                />

                                <span className="account-field-note">
                                    Example: 9876543210 or +919876543210
                                </span>
                            </label>

                            {accountError && (
                                <p className="account-form-error">
                                    {accountError}
                                </p>
                            )}

                            {accountSuccess && (
                                <p className="account-form-success">
                                    {accountSuccess}
                                </p>
                            )}

                            <div className="account-form-actions">

                                <button
                                    type="button"
                                    className="account-cancel-button"
                                    onClick={closeAccountModal}
                                    disabled={accountSaving}
                                >
                                    Cancel
                                </button>

                                <button
                                    type="submit"
                                    className="account-save-button"
                                    disabled={accountSaving}
                                >
                                    {accountSaving
                                        ? "Saving..."
                                        : "Save Changes"}
                                </button>

                            </div>

                        </form>

                    </div>

                </div>
            )}

            {/* ===========================================
          PAGE STYLES
      ============================================ */}

            <style>{`

        * {
          box-sizing: border-box;
        }

        .owner-page {
          min-height: 100vh;
          padding: 34px 20px 60px;
          background:
            radial-gradient(
              circle at 15% 0%,
              rgba(59, 130, 246, 0.055),
              transparent 32%
            ),
            #020617;
          color: #f8fafc;
        }

        .owner-container {
          width: min(1050px, 100%);
          margin: 0 auto;
        }


        /* HEADER */

        .owner-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 24px;
          margin-bottom: 28px;
        }

        .owner-heading {
          display: flex;
          align-items: center;
          gap: 15px;
        }

        .owner-avatar {
          width: 54px;
          height: 54px;
          display: grid;
          place-items: center;
          border-radius: 16px;
          background: rgba(30, 41, 59, 0.9);
          border: 1px solid rgba(148, 163, 184, 0.16);
          font-size: 1.4rem;
          flex-shrink: 0;
        }

        .eyebrow {
          margin: 0 0 5px;
          color: #94a3b8;
          font-size: 0.69rem;
          font-weight: 800;
          letter-spacing: 0.13em;
          text-transform: uppercase;
        }

        .owner-heading h1 {
          margin: 0;
          font-size: clamp(1.9rem, 4vw, 2.35rem);
          line-height: 1;
          letter-spacing: -0.045em;
        }

        .subtitle {
          margin: 6px 0 0;
          color: #64748b;
          font-size: 0.84rem;
        }

        .header-actions {
          display: flex;
          gap: 9px;
        }

        .kitchen-button,
        .menu-button {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          padding: 11px 15px;
          border-radius: 11px;
          text-decoration: none;
          font-size: 0.81rem;
          font-weight: 800;
          white-space: nowrap;
          transition: 0.2s ease;
        }

        .kitchen-button {
          background: #f8fafc;
          color: #020617;
        }

        .kitchen-button:hover {
          transform: translateY(-1px);
        }

        .menu-button {
          background: rgba(15, 23, 42, 0.85);
          border: 1px solid rgba(148, 163, 184, 0.16);
          color: #cbd5e1;
        }


        /* SUBSCRIPTION */

        .subscription-card {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 20px;
          padding: 18px 20px;
          margin-bottom: 35px;
          border-radius: 16px;
          background: rgba(15, 23, 42, 0.75);
          border: 1px solid rgba(148, 163, 184, 0.13);
        }

        .subscription-card.active {
          background: rgba(20, 83, 45, 0.13);
          border-color: rgba(74, 222, 128, 0.22);
        }

        .subscription-card.trialing {
          background: rgba(113, 63, 18, 0.13);
          border-color: rgba(250, 204, 21, 0.22);
        }

        .subscription-card.grace {
          background: rgba(124, 45, 18, 0.14);
          border-color: rgba(251, 146, 60, 0.24);
        }

        .subscription-card.expired {
          background: rgba(127, 29, 29, 0.14);
          border-color: rgba(248, 113, 113, 0.25);
        }

        .subscription-left {
          display: flex;
          align-items: center;
          gap: 13px;
          min-width: 0;
        }

        .subscription-icon {
          width: 42px;
          height: 42px;
          display: grid;
          place-items: center;
          border-radius: 12px;
          background: rgba(15, 23, 42, 0.75);
          font-size: 1rem;
          flex-shrink: 0;
        }

        .subscription-card h2 {
          margin: 0;
          font-size: 1rem;
        }

        .subscription-description {
          margin: 4px 0 0;
          color: #94a3b8;
          font-size: 0.8rem;
        }

        .subscription-detail {
          margin: 5px 0 0;
          color: #cbd5e1;
          font-size: 0.75rem;
          font-weight: 700;
        }

        .subscription-action {
          padding: 9px 14px;
          border-radius: 9px;
          background: #f8fafc;
          color: #020617;
          text-decoration: none;
          font-size: 0.77rem;
          font-weight: 800;
          white-space: nowrap;
        }


        /* SECTION */

        .business-section {
          margin-bottom: 31px;
        }

        .section-header {
          display: flex;
          align-items: flex-end;
          justify-content: space-between;
          gap: 15px;
          margin-bottom: 13px;
        }

        .section-header h2 {
          margin: 0;
          font-size: 1.3rem;
          letter-spacing: -0.025em;
        }


        /* PERIOD */

        .period-selector {
          display: flex;
          gap: 4px;
          padding: 4px;
          border-radius: 10px;
          background: rgba(15, 23, 42, 0.78);
          border: 1px solid rgba(148, 163, 184, 0.12);
        }

        .period {
          padding: 7px 10px;
          border: 0;
          border-radius: 7px;
          background: transparent;
          color: #64748b;
          font-size: 0.69rem;
          font-weight: 800;
          cursor: pointer;
        }

        .period.active {
          background: rgba(51, 65, 85, 0.85);
          color: #f8fafc;
        }


        /* STATS */

        .stats-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 13px;
        }

        .stat-card {
          min-width: 0;
          padding: 18px;
          border-radius: 15px;
          background: rgba(15, 23, 42, 0.78);
          border: 1px solid rgba(148, 163, 184, 0.13);
        }

        .stat-top {
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .stat-icon {
          width: 37px;
          height: 37px;
          display: grid;
          place-items: center;
          border-radius: 10px;
          background: rgba(30, 41, 59, 0.85);
          flex-shrink: 0;
        }

        .stat-label {
          color: #64748b;
          font-size: 0.72rem;
        }

        .stat-value {
          display: block;
          margin-top: 12px;
          font-size: 1.15rem;
          font-weight: 800;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .stat-suffix {
          margin-left: 7px;
          color: #64748b;
          font-size: 0.68rem;
        }


        /* ACTIVE ORDERS */

        .active-orders-card {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 20px;
          padding: 21px 23px;
          margin-bottom: 32px;
          border-radius: 16px;
          background: rgba(15, 23, 42, 0.78);
          border: 1px solid rgba(148, 163, 184, 0.13);
        }

        .active-orders-left {
          display: flex;
          align-items: center;
          gap: 13px;
        }

        .active-orders-icon {
          width: 42px;
          height: 42px;
          display: grid;
          place-items: center;
          border-radius: 12px;
          background: rgba(250, 204, 21, 0.08);
          flex-shrink: 0;
        }

        .active-title {
          display: flex;
          align-items: center;
          gap: 9px;
        }

        .active-title h2 {
          margin: 0;
          font-size: 1rem;
        }

        .active-number {
          min-width: 25px;
          height: 25px;
          display: grid;
          place-items: center;
          padding: 0 7px;
          border-radius: 999px;
          background: rgba(239, 68, 68, 0.13);
          color: #fca5a5;
          font-size: 0.72rem;
          font-weight: 900;
        }

        .active-description {
          margin: 4px 0 0;
          color: #64748b;
          font-size: 0.79rem;
        }

        .open-kitchen-link {
          padding: 9px 13px;
          border-radius: 9px;
          background: rgba(30, 41, 59, 0.8);
          color: #cbd5e1;
          text-decoration: none;
          font-size: 0.77rem;
          font-weight: 800;
          white-space: nowrap;
        }


        /* MANAGEMENT */

        .management-section {
          margin-bottom: 31px;
        }

        .management-heading {
          display: block;
        }

        .management-heading p:last-child {
          margin: 5px 0 0;
          color: #64748b;
          font-size: 0.79rem;
        }

        .settings-card {
          display: flex;
          align-items: center;
          gap: 14px;
          padding: 18px 20px;
          border-radius: 16px;
          background: rgba(15, 23, 42, 0.78);
          border: 1px solid rgba(148, 163, 184, 0.13);
          color: #f8fafc;
          text-decoration: none;
          transition: 0.2s ease;
        }

        .settings-card:hover {
          transform: translateY(-1px);
          background: rgba(30, 41, 59, 0.72);
          border-color: rgba(148, 163, 184, 0.24);
        }

        .settings-icon {
          width: 43px;
          height: 43px;
          display: grid;
          place-items: center;
          border-radius: 12px;
          background: rgba(30, 41, 59, 0.9);
          flex-shrink: 0;
        }

        .settings-content {
          flex: 1;
          min-width: 0;
        }

        .settings-content strong,
        .settings-content span {
          display: block;
        }

        .settings-content strong {
          font-size: 0.88rem;
        }

        .settings-content span {
          margin-top: 4px;
          color: #64748b;
          font-size: 0.75rem;
          line-height: 1.45;
        }

        .settings-arrow {
          color: #94a3b8;
          font-size: 1.1rem;
        }

/* OWNER ACCOUNT */

.owner-account-card {
    margin-top: 16px;
    padding: 24px;
    border: 1px solid rgba(148, 163, 184, 0.16);
    border-radius: 16px;
    background: #0d1428;
    color: #f8fafc;
}

.owner-account-header {
    display: flex;
    align-items: center;
    gap: 13px;
}

.owner-account-icon {
    width: 43px;
    height: 43px;
    display: grid;
    place-items: center;
    border-radius: 12px;
    background: rgba(30, 41, 59, 0.9);
    flex-shrink: 0;
}

.owner-account-heading {
    flex: 1;
    min-width: 0;
}

.owner-account-heading strong,
.owner-account-heading span {
    display: block;
}

.owner-account-heading strong {
    font-size: 0.88rem;
}

.owner-account-heading span {
    margin-top: 4px;
    color: #94a3b8;
    font-size: 0.75rem;
    line-height: 1.45;
}

.owner-account-edit-button {
    padding: 9px 13px;
    border: 1px solid rgba(148, 163, 184, 0.2);
    border-radius: 9px;
    background: #f8fafc;
    color: #020617;
    font-size: 0.73rem;
    font-weight: 800;
    cursor: pointer;
    white-space: nowrap;
}

.owner-account-details {
    display: grid;
    gap: 0;
    margin-top: 23px;
}

.owner-account-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    padding: 14px 0;
    border-top: 1px solid rgba(148, 163, 184, 0.1);
}

.owner-account-label {
    display: block;
    margin-bottom: 5px;
    color: #64748b;
    font-size: 0.7rem;
    font-weight: 700;
}

.owner-account-row strong {
    color: #e2e8f0;
    font-size: 0.84rem;
    font-weight: 700;
    overflow-wrap: anywhere;
}

/* ACCOUNT MODAL */

.account-modal-overlay {
    position: fixed;
    inset: 0;
    z-index: 1000;
    display: grid;
    place-items: center;
    padding: 20px;
    background: rgba(2, 6, 23, 0.78);
    backdrop-filter: blur(8px);
}

.account-modal {
    width: min(480px, 100%);
    max-height: calc(100vh - 40px);
    overflow-y: auto;
    padding: 25px;
    border: 1px solid rgba(148, 163, 184, 0.2);
    border-radius: 18px;
    background: #0d1428;
    color: #f8fafc;
    box-shadow: 0 25px 80px rgba(0, 0, 0, 0.4);
}

.account-modal-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 16px;
}

.account-modal-header h2 {
    margin: 0;
    font-size: 1.35rem;
    letter-spacing: -0.03em;
}

.account-modal-header p:last-child {
    margin: 7px 0 0;
    color: #64748b;
    font-size: 0.78rem;
    line-height: 1.5;
}

.account-modal-close {
    width: 32px;
    height: 32px;
    display: grid;
    place-items: center;
    border: 1px solid rgba(148, 163, 184, 0.16);
    border-radius: 9px;
    background: rgba(30, 41, 59, 0.8);
    color: #cbd5e1;
    font-size: 1.3rem;
    cursor: pointer;
    flex-shrink: 0;
}

.account-form {
    display: grid;
    gap: 17px;
    margin-top: 25px;
}

.account-form label {
    display: grid;
    gap: 8px;
    color: #cbd5e1;
    font-size: 0.78rem;
    font-weight: 700;
}

.account-form input {
    width: 100%;
    padding: 12px 13px;
    border: 1px solid rgba(148, 163, 184, 0.2);
    border-radius: 10px;
    outline: none;
    background: #020617;
    color: #f8fafc;
    font: inherit;
    font-weight: 500;
}

.account-form input:focus {
    border-color: rgba(96, 165, 250, 0.75);
}

.account-form input::placeholder {
    color: #475569;
}

.account-field-note {
    color: #64748b;
    font-size: 0.68rem;
    font-weight: 500;
    line-height: 1.4;
}

.account-form-error,
.account-form-success {
    margin: 0;
    padding: 10px 12px;
    border-radius: 9px;
    font-size: 0.75rem;
    line-height: 1.45;
}

.account-form-error {
    background: rgba(127, 29, 29, 0.2);
    color: #fca5a5;
    border: 1px solid rgba(248, 113, 113, 0.2);
}

.account-form-success {
    background: rgba(20, 83, 45, 0.2);
    color: #86efac;
    border: 1px solid rgba(74, 222, 128, 0.2);
}

.account-form-actions {
    display: flex;
    justify-content: flex-end;
    gap: 9px;
    margin-top: 5px;
}

.account-cancel-button,
.account-save-button {
    padding: 11px 15px;
    border-radius: 9px;
    font-size: 0.76rem;
    font-weight: 800;
    cursor: pointer;
}

.account-cancel-button {
    border: 1px solid rgba(148, 163, 184, 0.2);
    background: transparent;
    color: #cbd5e1;
}

.account-save-button {
    border: 1px solid transparent;
    background: #f8fafc;
    color: #020617;
}

.account-cancel-button:disabled,
.account-save-button:disabled,
.account-modal-close:disabled {
    opacity: 0.55;
    cursor: not-allowed;
}
        /* FOOTER */

        .owner-footer {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding-top: 21px;
          border-top: 1px solid rgba(148, 163, 184, 0.1);
        }

        .owner-footer strong,
        .owner-footer span {
          display: block;
        }

        .owner-footer strong {
          font-size: 0.81rem;
        }

        .owner-footer span {
          margin-top: 3px;
          color: #64748b;
          font-size: 0.7rem;
        }

        .logout-button {
          padding: 8px 14px;
          border-radius: 9px;
          border: 1px solid rgba(248, 113, 113, 0.2);
          background: rgba(127, 29, 29, 0.12);
          color: #fca5a5;
          font-size: 0.75rem;
          font-weight: 700;
          cursor: pointer;
        }


        /* LOADING */

        .owner-loading,
        .owner-error {
          width: min(450px, calc(100% - 30px));
          margin: 120px auto;
          padding: 34px;
          text-align: center;
          border-radius: 18px;
          background: rgba(15, 23, 42, 0.85);
          border: 1px solid rgba(148, 163, 184, 0.13);
        }

        .owner-loading p {
          margin: 13px 0 0;
          color: #64748b;
        }

        .spinner {
          width: 31px;
          height: 31px;
          margin: 0 auto;
          border: 3px solid rgba(148, 163, 184, 0.18);
          border-top-color: #f8fafc;
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
        }

        @keyframes spin {
          to {
            transform: rotate(360deg);
          }
        }

        .error-icon {
          width: 42px;
          height: 42px;
          margin: 0 auto 14px;
          display: grid;
          place-items: center;
          border-radius: 50%;
          background: rgba(239, 68, 68, 0.12);
          color: #fca5a5;
          font-weight: 900;
        }

        .owner-error h1 {
          margin: 0;
          font-size: 1.3rem;
        }

        .owner-error p {
          margin: 9px 0 20px;
          color: #64748b;
        }

        .primary-button {
          display: inline-block;
          padding: 10px 15px;
          border-radius: 9px;
          background: #f8fafc;
          color: #020617;
          text-decoration: none;
          font-size: 0.79rem;
          font-weight: 800;
        }


        /* MOBILE */

        @media (max-width: 850px) {

          .stats-grid {
            grid-template-columns: repeat(2, 1fr);
          }

        }

        @media (max-width: 700px) {

          .owner-header {
            align-items: flex-start;
            flex-direction: column;
          }

          .header-actions {
            width: 100%;
          }

          .kitchen-button,
          .menu-button {
            flex: 1;
          }

          .section-header {
            align-items: flex-start;
            flex-direction: column;
          }

          .period-selector {
            width: 100%;
          }

          .period {
            flex: 1;
          }

        }

        @media (max-width: 600px) {

          .owner-page {
            padding: 23px 14px 45px;
          }

          .subscription-card {
            align-items: flex-start;
            flex-direction: column;
          }

          .subscription-action {
            width: 100%;
            text-align: center;
          }

          .stats-grid {
            grid-template-columns: 1fr 1fr;
          }

          .active-orders-card {
            align-items: flex-start;
            flex-direction: column;
          }

          .open-kitchen-link {
            width: 100%;
            text-align: center;
          }
            .owner-account-header {
    align-items: flex-start;
    flex-wrap: wrap;
}

.owner-account-edit-button {
    margin-left: 56px;
}

.account-modal {
    padding: 20px;
}

.account-form-actions {
    flex-direction: column-reverse;
}

.account-cancel-button,
.account-save-button {
    width: 100%;
}

        }

        @media (max-width: 430px) {

          .owner-heading {
            align-items: flex-start;
          }

          .owner-avatar {
            width: 48px;
            height: 48px;
          }

          .stats-grid {
            grid-template-columns: 1fr;
          }

          .period {
            padding: 7px 5px;
            font-size: 0.63rem;
          }

        }

      `}</style>

        </div>
    )
}


/*
 * ----------------------------------------------------
 * STAT CARD
 * ----------------------------------------------------
 */

function StatCard({
    icon,
    label,
    value,
    suffix
}) {
    return (
        <div className="stat-card">

            <div className="stat-top">

                <div className="stat-icon">
                    {icon}
                </div>

                <span className="stat-label">
                    {label}
                </span>

            </div>

            <strong className="stat-value">
                {value}

                {suffix && (
                    <span className="stat-suffix">
                        {suffix}
                    </span>
                )}
            </strong>

        </div>
    )
}


/*
 * ----------------------------------------------------
 * SUBSCRIPTION INFO
 *
 * Your backend uses:
 *
 * subscriptionStatus
 * subscriptionStartedAt
 * subscriptionEndsAt
 *
 * So we use those exact fields.
 * ----------------------------------------------------
 */

function getSubscriptionInfo(restaurant) {
    const status = String(
        restaurant?.subscriptionStatus ||
        ""
    ).toLowerCase()

    const endDate =
        parseDate(
            restaurant?.subscriptionEndsAt
        )

    const remainingDays =
        getRemainingDays(endDate)


    /*
     * TRIAL
     */

    if (status === "trialing") {
        return {
            title: "Free Trial",
            description:
                remainingDays !== null
                    ? `${remainingDays} ${remainingDays === 1
                        ? "day"
                        : "days"
                    } remaining in your free trial.`
                    : "Your free trial is currently active.",
            detail: endDate
                ? `Trial ends ${formatDate(endDate)}`
                : null,
            icon: "⏳",
            className: "trialing",
            action: null
        }
    }


    /*
     * ACTIVE
     */

    if (status === "active") {
        return {
            title: "Subscription Active",
            description:
                remainingDays !== null
                    ? `${remainingDays} ${remainingDays === 1
                        ? "day"
                        : "days"
                    } remaining in your current subscription.`
                    : "Your restaurant is currently active.",
            detail: endDate
                ? `Subscription ends ${formatDate(
                    endDate
                )}`
                : null,
            icon: "✓",
            className: "active",
            action: null
        }
    }


    /*
     * GRACE
     */

    if (status === "grace") {
        return {
            title: "Grace Period",
            description:
                remainingDays !== null
                    ? `${remainingDays} ${remainingDays === 1
                        ? "day"
                        : "days"
                    } remaining to renew.`
                    : "Your subscription has ended. Renew to continue.",
            detail: endDate
                ? `Grace period ends ${formatDate(
                    endDate
                )}`
                : null,
            icon: "⚠️",
            className: "grace",
            action: "Renew Subscription"
        }
    }


    /*
     * EXPIRED
     */

    if (status === "expired") {
        return {
            title: "Subscription Expired",
            description:
                "Your restaurant is currently inactive. Renew to restore online ordering.",
            detail: endDate
                ? `Subscription ended ${formatDate(
                    endDate
                )}`
                : null,
            icon: "!",
            className: "expired",
            action: "Renew Subscription"
        }
    }


    /*
     * FALLBACK
     */

    return {
        title: "Subscription",
        description:
            "Subscription information is available in your dashboard.",
        detail: null,
        icon: "•",
        className: "",
        action: "View Subscription"
    }
}


/*
 * ----------------------------------------------------
 * ORDER DATE
 * ----------------------------------------------------
 */

function getOrderDate(order) {
    const date = parseDate(
        order?.createdAt
    )

    return date
}


/*
 * ----------------------------------------------------
 * PARSE DATE
 * ----------------------------------------------------
 */

function parseDate(value) {
    if (!value) {
        return null
    }

    const date = new Date(value)

    if (Number.isNaN(date.getTime())) {
        return null
    }

    return date
}


/*
 * ----------------------------------------------------
 * REMAINING SUBSCRIPTION DAYS
 * ----------------------------------------------------
 */

function getRemainingDays(date) {
    if (!date) {
        return null
    }

    const now = new Date()

    const difference =
        date.getTime() -
        now.getTime()

    if (difference <= 0) {
        return 0
    }

    return Math.ceil(
        difference /
        (1000 * 60 * 60 * 24)
    )
}


/*
 * ----------------------------------------------------
 * SAME DAY
 * ----------------------------------------------------
 */

function isSameDay(
    first,
    second
) {
    return (
        first.getFullYear() ===
        second.getFullYear() &&
        first.getMonth() ===
        second.getMonth() &&
        first.getDate() ===
        second.getDate()
    )
}


/*
 * ----------------------------------------------------
 * START OF N DAYS AGO
 * ----------------------------------------------------
 */

function startOfDaysAgo(
    date,
    days
) {
    const result =
        new Date(date)

    result.setHours(
        0,
        0,
        0,
        0
    )

    result.setDate(
        result.getDate() - days
    )

    return result
}


/*
 * ----------------------------------------------------
 * FORMAT DATE
 * ----------------------------------------------------
 */

function formatDate(date) {
    return date.toLocaleDateString(
        "en-IN",
        {
            day: "numeric",
            month: "short",
            year: "numeric"
        }
    )
}


/*
 * ----------------------------------------------------
 * FORMAT CURRENCY
 * ----------------------------------------------------
 */

function formatCurrency(value) {
    const amount =
        Number(value) || 0

    return `₹${amount.toLocaleString(
        "en-IN",
        {
            maximumFractionDigits: 0
        }
    )}`
}


export default OwnerProfile