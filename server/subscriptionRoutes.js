const express = require("express")
const crypto = require("crypto")
const { Pool } = require("pg")
const Razorpay = require("razorpay")

const router = express.Router()

const pool = new Pool({
  host: process.env.PGHOST,
  port: Number(process.env.PGPORT) || 5432,
  database: process.env.PGDATABASE,
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
  ssl:
    process.env.NODE_ENV === "production"
      ? { rejectUnauthorized: false }
      : false
})

const keyId = process.env.RAZORPAY_KEY_ID
const keySecret = process.env.RAZORPAY_KEY_SECRET

const razorpay =
  keyId && keySecret
    ? new Razorpay({
      key_id: keyId,
      key_secret: keySecret
    })
    : null

const plans = {
  monthly: {
    planId: process.env.RAZORPAY_MONTHLY_PLAN_ID,
    totalCount: 360,
    label: "₹999 / month"
  },
  yearly: {
    planId: process.env.RAZORPAY_YEARLY_PLAN_ID,
    totalCount: 30,
    label: "₹9,999 / year"
  }
}

function getToken(req) {
  const header = req.get("authorization") || ""
  return header.startsWith("Bearer ") ? header.slice(7) : ""
}

function getRestaurantId(req) {
  const token = getToken(req)

  if (!token || !process.env.SESSION_SECRET) {
    return null
  }

  const separator = token.lastIndexOf(".")

  if (separator <= 0) {
    return null
  }

  const encodedPayload = token.slice(0, separator)
  const signature = token.slice(separator + 1)

  try {
    const payload = Buffer.from(
      encodedPayload,
      "base64url"
    ).toString("utf8")

    const expected = crypto
      .createHmac("sha256", process.env.SESSION_SECRET)
      .update(payload)
      .digest("base64url")

    if (
      signature.length !== expected.length ||
      !crypto.timingSafeEqual(
        Buffer.from(signature),
        Buffer.from(expected)
      )
    ) {
      return null
    }

    const decoded = JSON.parse(payload)

    if (
      !decoded.restaurantId ||
      !decoded.expiresAt ||
      Date.now() >= decoded.expiresAt
    ) {
      return null
    }

    return decoded.restaurantId
  } catch {
    return null
  }
}

async function requireRestaurant(req, res, next) {
  const restaurantId = getRestaurantId(req)

  if (!restaurantId) {
    return res.status(401).json({
      error: "Authentication required."
    })
  }

  try {
    const result = await pool.query(
      `SELECT
        id,
        restaurant_name,
        owner_name,
        email,
        subscription_plan,
        subscription_status,
        subscription_started_at,
        subscription_ends_at,
        razorpay_subscription_id
       FROM restaurants
       WHERE id = $1
       LIMIT 1`,
      [restaurantId]
    )

    if (result.rowCount === 0) {
      return res.status(401).json({
        error: "Restaurant account not found."
      })
    }

    req.restaurant = result.rows[0]
    next()
  } catch (error) {
    console.error("Subscription auth error:", error)

    return res.status(500).json({
      error: "Unable to verify restaurant account."
    })
  }
}

function unixToDate(value) {
  return value ? new Date(Number(value) * 1000) : null
}

function serializeSubscription(subscription) {
  return {
    id: subscription.id,
    status: subscription.status,
    planId: subscription.plan_id,
    currentStart: unixToDate(subscription.current_start),
    currentEnd: unixToDate(subscription.current_end),
    chargeAt: unixToDate(subscription.charge_at)
  }
}

router.post("/webhook", async (req, res) => {
  const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET
  const signature = req.get("x-razorpay-signature") || ""

  if (!webhookSecret || !signature || !req.rawBody) {
    return res.status(400).json({
      error: "Invalid Razorpay webhook configuration."
    })
  }

  const expected = crypto
    .createHmac("sha256", webhookSecret)
    .update(req.rawBody)
    .digest("hex")

  if (
    expected.length !== signature.length ||
    !crypto.timingSafeEqual(
      Buffer.from(expected),
      Buffer.from(signature)
    )
  ) {
    return res.status(400).json({
      error: "Invalid Razorpay webhook signature."
    })
  }

  const event = req.body?.event || ""
  const subscription =
    req.body?.payload?.subscription?.entity

  if (!subscription?.id) {
    return res.status(200).json({
      received: true
    })
  }

  try {
    const result = await pool.query(
      `SELECT id, subscription_plan, subscription_status
       FROM restaurants
       WHERE razorpay_subscription_id = $1
       LIMIT 1`,
      [subscription.id]
    )

    if (result.rowCount === 0) {
      return res.status(200).json({
        received: true
      })
    }

    const restaurant = result.rows[0]

    const currentStart = unixToDate(
      subscription.current_start
    )

    const currentEnd = unixToDate(
      subscription.current_end
    )

    const now = new Date()

    if (
      [
        "subscription.authenticated",
        "subscription.activated",
        "subscription.charged",
        "subscription.resumed"
      ].includes(event)
    ) {
      await pool.query(
        `UPDATE restaurants
         SET subscription_status = 'active',
             subscription_started_at = COALESCE($1, subscription_started_at),
             subscription_ends_at = COALESCE($2, subscription_ends_at),
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $3`,
        [
          currentStart,
          currentEnd,
          restaurant.id
        ]
      )
    } else if (
      [
        "subscription.pending",
        "subscription.halted",
        "subscription.paused",
        "subscription.cancelled",
        "subscription.completed"
      ].includes(event)
    ) {
      if (currentEnd && currentEnd > now) {
        await pool.query(
          `UPDATE restaurants
           SET subscription_status = 'active',
               subscription_started_at = COALESCE($1, subscription_started_at),
               subscription_ends_at = $2,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = $3`,
          [
            currentStart,
            currentEnd,
            restaurant.id
          ]
        )
      } else {
        const graceEndsAt = currentEnd
          ? new Date(
            currentEnd.getTime() +
            3 * 24 * 60 * 60 * 1000
          )
          : now

        await pool.query(
          `UPDATE restaurants
           SET subscription_status = $1,
               subscription_started_at = COALESCE($2, subscription_started_at),
               subscription_ends_at = COALESCE($3, subscription_ends_at),
               updated_at = CURRENT_TIMESTAMP
           WHERE id = $4`,
          [
            now < graceEndsAt ? "grace" : "expired",
            currentStart,
            currentEnd,
            restaurant.id
          ]
        )
      }
    }

    console.log(
      `Razorpay webhook processed: ${event} for subscription ${subscription.id}`
    )

    return res.status(200).json({
      received: true
    })
  } catch (error) {
    console.error(
      "Razorpay webhook processing failed:",
      error
    )

    return res.status(500).json({
      error: "Webhook processing failed."
    })
  }
})

router.get("/status", requireRestaurant, async (req, res) => {
  const row = req.restaurant
  // Sync subscription dates from Razorpay when the database
  // does not have them yet.
  if (
    razorpay &&
    row.razorpay_subscription_id &&
    (!row.subscription_started_at ||
      !row.subscription_ends_at)
  ) {
    try {
      const razorpaySubscription =
        await razorpay.subscriptions.fetch(
          row.razorpay_subscription_id
        )

      const startedAt =
        unixToDate(
          razorpaySubscription.current_start
        )

      const endsAt =
        unixToDate(
          razorpaySubscription.current_end
        )

      if (startedAt || endsAt) {
        const syncResult = await pool.query(
          `
                        UPDATE restaurants
                        SET
                            subscription_started_at =
                                COALESCE(
                                    $1,
                                    subscription_started_at
                                ),
                            subscription_ends_at =
                                COALESCE(
                                    $2,
                                    subscription_ends_at
                                ),
                            updated_at = CURRENT_TIMESTAMP
                        WHERE id = $3
                        RETURNING
                            subscription_started_at,
                            subscription_ends_at
                    `,
          [
            startedAt,
            endsAt,
            row.id
          ]
        )

        if (syncResult.rows[0]) {
          row.subscription_started_at =
            syncResult.rows[0]
              .subscription_started_at

          row.subscription_ends_at =
            syncResult.rows[0]
              .subscription_ends_at
        }
      }
    } catch (syncError) {
      console.error(
        "Subscription date sync error:",
        syncError
      )
    }
  }

  const endsAt = row.subscription_ends_at
    ? new Date(row.subscription_ends_at)
    : null

  const now = new Date()

  if (
    endsAt &&
    endsAt <= now &&
    ["active", "trialing"].includes(row.subscription_status)
  ) {
    const graceEndsAt = new Date(
      endsAt.getTime() + 3 * 24 * 60 * 60 * 1000
    )

    if (now < graceEndsAt) {
      await pool.query(
        `UPDATE restaurants
         SET subscription_status = 'grace',
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $1
           AND subscription_status = $2`,
        [row.id, row.subscription_status]
      )

      row.subscription_status = "grace"
    } else {
      await pool.query(
        `UPDATE restaurants
         SET subscription_status = 'expired',
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [row.id]
      )

      row.subscription_status = "expired"
    }
  } else if (
    endsAt &&
    row.subscription_status === "grace"
  ) {
    const graceEndsAt = new Date(
      endsAt.getTime() + 3 * 24 * 60 * 60 * 1000
    )

    if (now >= graceEndsAt) {
      await pool.query(
        `UPDATE restaurants
         SET subscription_status = 'expired',
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $1
           AND subscription_status = 'grace'`,
        [row.id]
      )

      row.subscription_status = "expired"
    }
  }

  return res.json({
    subscription: {
      plan: row.subscription_plan,
      status: row.subscription_status,
      startedAt: row.subscription_started_at,
      endsAt: row.subscription_ends_at,
      razorpaySubscriptionId: row.razorpay_subscription_id
    }
  })
})

router.post("/start-trial", requireRestaurant, async (req, res) => {
  if (req.restaurant.subscription_status !== "trial_available") {
    return res.status(400).json({
      error: "Your free trial is no longer available."
    })
  }

  try {
    const result = await pool.query(
      `UPDATE restaurants
       SET subscription_status = 'trialing',
           subscription_started_at = CURRENT_TIMESTAMP,
           subscription_ends_at = CURRENT_TIMESTAMP + INTERVAL '30 days',
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1
         AND subscription_status = 'trial_available'
       RETURNING subscription_plan,
                 subscription_status,
                 subscription_started_at,
                 subscription_ends_at`,
      [req.restaurant.id]
    )

    if (!result.rows[0]) {
      return res.status(409).json({
        error: "Your free trial is no longer available."
      })
    }

    const row = result.rows[0]

    return res.json({
      subscription: {
        plan: row.subscription_plan,
        status: row.subscription_status,
        startedAt: row.subscription_started_at,
        endsAt: row.subscription_ends_at
      }
    })
  } catch (error) {
    console.error("Start trial error:", error)

    return res.status(500).json({
      error: "Unable to start the free trial."
    })
  }
})

router.post("/create", requireRestaurant, async (req, res) => {
  if (!razorpay) {
    return res.status(503).json({
      error: "Razorpay subscriptions are not configured on the server."
    })
  }

  const plan = String(req.body?.plan || "").toLowerCase()
  const selected = plans[plan]

  if (!selected || !selected.planId) {
    return res.status(400).json({
      error: "Subscription plan is not configured."
    })
  }

  if (req.restaurant.subscription_status === "active") {
    return res.status(409).json({
      error: "Your restaurant already has an active subscription."
    })
  }

  try {
    const subscription = await razorpay.subscriptions.create({
      plan_id: selected.planId,
      total_count: selected.totalCount,
      quantity: 1,
      customer_notify: true,
      notes: {
        restaurant_id: String(req.restaurant.id),
        restaurant_email: req.restaurant.email,
        billing_plan: plan
      }
    })

    await pool.query(
      `UPDATE restaurants
       SET subscription_plan = $1,
           razorpay_subscription_id = $2,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $3`,
      [
        plan,
        subscription.id,
        req.restaurant.id
      ]
    )

    return res.json({
      keyId,
      subscriptionId: subscription.id,
      plan,
      label: selected.label,
      restaurant: {
        name: req.restaurant.restaurant_name,
        ownerName: req.restaurant.owner_name,
        email: req.restaurant.email
      }
    })
  } catch (error) {
    console.error(
      "Razorpay subscription creation failed:",
      error
    )

    return res.status(502).json({
      error: "Unable to create the Razorpay subscription."
    })
  }
})

router.post("/verify", requireRestaurant, async (req, res) => {
  const paymentId = String(
    req.body?.razorpay_payment_id || ""
  )

  const subscriptionId = String(
    req.body?.razorpay_subscription_id || ""
  )

  const signature = String(
    req.body?.razorpay_signature || ""
  )

  if (!paymentId || !subscriptionId || !signature) {
    return res.status(400).json({
      error: "Incomplete Razorpay subscription response."
    })
  }

  if (
    req.restaurant.razorpay_subscription_id !==
    subscriptionId
  ) {
    return res.status(400).json({
      error: "Subscription does not belong to this restaurant."
    })
  }

  const expected = crypto
    .createHmac("sha256", keySecret)
    .update(`${paymentId}|${subscriptionId}`)
    .digest("hex")

  if (
    expected.length !== signature.length ||
    !crypto.timingSafeEqual(
      Buffer.from(expected),
      Buffer.from(signature)
    )
  ) {
    return res.status(400).json({
      error: "Razorpay signature verification failed."
    })
  }

  if (!razorpay) {
    return res.status(503).json({
      error: "Razorpay subscriptions are not configured on the server."
    })
  }

  try {
    const subscription =
      await razorpay.subscriptions.fetch(subscriptionId)

    const validStatuses = new Set([
      "authenticated",
      "active"
    ])

    if (!validStatuses.has(subscription.status)) {
      return res.status(409).json({
        error: `Razorpay subscription is not ready for activation. Current status: ${subscription.status}.`
      })
    }

    const startedAt =
      unixToDate(subscription.current_start) ||
      new Date()

    const endsAt =
      unixToDate(subscription.current_end)

    await pool.query(
      `UPDATE restaurants
       SET subscription_status = 'active',
           subscription_started_at = $1,
           subscription_ends_at = $2,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $3`,
      [
        startedAt,
        endsAt,
        req.restaurant.id
      ]
    )

    return res.json({
      success: true,
      subscription: serializeSubscription(subscription)
    })
  } catch (error) {
    console.error(
      "Razorpay subscription verification failed:",
      error
    )

    return res.status(502).json({
      error: "Unable to confirm the Razorpay subscription."
    })
  }
})

module.exports = router
