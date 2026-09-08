require("dotenv").config({
  path: require("path").join(__dirname, ".env")
})

const crypto = require("crypto")
const express = require("express")
const Razorpay = require("razorpay")
const cors = require("cors")
const { Pool } = require("pg")
const rateLimit = require("express-rate-limit")
const { createDefaultMenu } = require("./defaultMenu")

const pool = new Pool({
  host: process.env.PGHOST,
  port: Number(process.env.PGPORT) || 5432,
  database: process.env.PGDATABASE,
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD
})

const PORT = Number(process.env.PORT) || 5000
const DEFAULT_RESTAURANT_SLUG = "foodie-demo"
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7
const SUBSCRIPTION_PLANS = new Set(["monthly", "yearly"])
const SESSION_SECRET = process.env.SESSION_SECRET
if (!SESSION_SECRET) {
  throw new Error(
    "SESSION_SECRET is required. Add it to server/.env."
  )
}

const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: {
    error: "Too many authentication attempts. Please try again later."
  }
})

const paymentRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: {
    error: "Too many payment requests. Please try again later."
  }
})

const app = express()

app.use(express.json())
app.use(
  cors({
    origin:
      process.env.NODE_ENV === "production"
        ? process.env.FRONTEND_URL
        : true
  })
)

const razorpayKeyId = process.env.RAZORPAY_KEY_ID
const razorpayKeySecret = process.env.RAZORPAY_KEY_SECRET

const razorpay =
  razorpayKeyId && razorpayKeySecret
    ? new Razorpay({
      key_id: razorpayKeyId,
      key_secret: razorpayKeySecret
    })
    : null

function normalizeString(value) {
  return typeof value === "string" ? value.trim() : ""
}

function normalizeStringList(value) {
  const rawValues = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(",")
      : []

  return Array.from(
    new Set(
      rawValues
        .map((entry) => normalizeString(entry))
        .filter(Boolean)
    )
  )
}

function slugify(value) {
  return normalizeString(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48)
}

function normalizeSubscriptionPlan(value) {
  const plan = normalizeString(value).toLowerCase()

  return SUBSCRIPTION_PLANS.has(plan) ? plan : "monthly"
}

function createPasswordHash(password) {
  const salt = crypto.randomBytes(16).toString("hex")
  const hash = crypto.scryptSync(password, salt, 64).toString("hex")

  return `${salt}:${hash}`
}

function verifyPassword(password, storedHash = "") {
  const [salt, originalHash] = storedHash.split(":")

  if (!salt || !originalHash) {
    return false
  }

  try {
    const nextHash = crypto.scryptSync(password, salt, 64).toString("hex")

    return crypto.timingSafeEqual(
      Buffer.from(originalHash, "hex"),
      Buffer.from(nextHash, "hex")
    )
  } catch {
    return false
  }
}

function createMenuItemId() {
  return crypto.randomBytes(8).toString("hex")
}

function normalizeMenuItem(item = {}, index = 0) {
  return {
    itemId:
      normalizeString(item.itemId) ||
      `item-${index + 1}-${createMenuItemId()}`,
    name: normalizeString(item.name) || `Menu Item ${index + 1}`,
    price: Math.max(0, Number(item.price) || 0),
    category: normalizeString(item.category) || "Main Course",
    image: normalizeString(item.image),
    ingredients: normalizeStringList(item.ingredients),
    isAvailable: item.isAvailable !== false
  }
}

function normalizeRestaurantInput(payload = {}) {
  return {
    restaurantName: normalizeString(payload.restaurantName),
    ownerName: normalizeString(payload.ownerName),
    email: normalizeString(payload.email).toLowerCase(),
    password: normalizeString(payload.password),
    logo: normalizeString(payload.logo),
    publicDescription:
      normalizeString(payload.publicDescription) ||
      "Scan the QR, browse the menu, and place your order in a few taps.",
    subscriptionPlan: normalizeSubscriptionPlan(payload.subscriptionPlan),
    menu: Array.isArray(payload.menu)
      ? payload.menu.map((item, index) =>
        normalizeMenuItem(item, index)
      )
      : null
  }
}

function normalizeRestaurantUpdate(payload = {}) {
  const restaurantName = normalizeString(payload.restaurantName)
  const publicDescription = normalizeString(payload.publicDescription)
  const slug = normalizeString(payload.slug).toLowerCase()
  const logo = normalizeString(payload.logo)

  const menu = Array.isArray(payload.menu)
    ? payload.menu.map((item, index) =>
      normalizeMenuItem(item, index)
    )
    : null

  return {
    restaurantName,
    publicDescription,
    slug,
    logo,
    menu
  }
}

function sanitizeRestaurantForAuth(restaurant = {}) {
  const subscriptionPlan = normalizeSubscriptionPlan(
    restaurant.subscriptionPlan
  )

  return {
    id: String(restaurant._id),
    restaurantName: restaurant.restaurantName,
    ownerName: restaurant.ownerName,
    email: restaurant.email,
    slug: restaurant.slug,
    logo: restaurant.logo,
    publicDescription: restaurant.publicDescription,
    subscriptionPlan,
    subscriptionStatus: restaurant.subscriptionStatus,
    publicMenuUrl: `/?restaurant=${restaurant.slug}`,
    kitchenUrl: `/kitchen?restaurant=${restaurant.slug}`,
    menu: Array.isArray(restaurant.menu)
      ? restaurant.menu
      : []
  }
}

function sanitizeRestaurantForPublic(restaurant = {}) {
  const subscriptionPlan = normalizeSubscriptionPlan(
    restaurant.subscriptionPlan
  )

  return {
    restaurantName: restaurant.restaurantName,
    slug: restaurant.slug,
    logo: restaurant.logo,
    publicDescription: restaurant.publicDescription,
    subscriptionPlan,
    menu: Array.isArray(restaurant.menu)
      ? restaurant.menu.filter(
        (item) => item.isAvailable !== false
      )
      : []
  }
}

function normalizeOrderPayload(payload = {}) {
  const items = Array.isArray(payload.items)
    ? payload.items.map((item) => ({
      itemId: normalizeString(item.itemId),
      name: normalizeString(item.name),
      price: Number(item.price) || 0,
      quantity: Number(item.quantity) || 0,
      category: normalizeString(item.category),
      image: normalizeString(item.image),
      ingredients: normalizeStringList(item.ingredients),
      skipIngredients: normalizeStringList(
        item.skipIngredients
      )
    }))
    : []

  const avoidIngredients = normalizeStringList(
    payload.avoidIngredients
  )

  const customerPreferenceAvoidIngredients =
    normalizeStringList(
      payload.customerPreferences?.avoidIngredients
    )

  const specialInstructions = normalizeString(
    payload.specialInstructions
  )

  const customerPreferenceNote = normalizeString(
    payload.customerPreferences?.note
  )

  return {
    restaurantSlug:
      normalizeString(payload.restaurantSlug).toLowerCase() ||
      DEFAULT_RESTAURANT_SLUG,

    restaurantName: normalizeString(payload.restaurantName),

    tableNumber: Number(payload.tableNumber) || 1,

    items,

    bill: {
      subtotal: Number(payload.bill?.subtotal) || 0,
      gst: Number(payload.bill?.gst) || 0,
      serviceFee: Number(payload.bill?.serviceFee) || 0,
      total: Number(payload.bill?.total) || 0
    },

    customerPreferences: {
      avoidIngredients: customerPreferenceAvoidIngredients,
      note: customerPreferenceNote || specialInstructions
    },

    avoidIngredients,
    specialInstructions,

    status:
      normalizeString(payload.status).toLowerCase() ||
      "pending"
  }
}

function mapMenuItems(rows) {
  return rows.map((item) => ({
    itemId: item.item_id,
    name: item.name,
    price: Number(item.price),
    category: item.category || "",
    image: item.image || "",
    ingredients: item.ingredients || [],
    isAvailable: item.is_available !== false
  }))
}

async function getRestaurantMenu(restaurantId) {
  const result = await pool.query(
    `SELECT *
     FROM menu_items
     WHERE restaurant_id = $1
     ORDER BY id ASC`,
    [restaurantId]
  )

  return mapMenuItems(result.rows)
}

async function buildRestaurantFromRow(row) {
  if (!row) {
    return null
  }

  const menu = await getRestaurantMenu(row.id)

  return {
    _id: String(row.id),
    restaurantName: row.restaurant_name,
    ownerName: row.owner_name || "",
    email: row.email,
    slug: row.slug,
    passwordHash: row.password_hash,
    logo: row.logo || "",
    publicDescription: row.public_description || "",
    subscriptionPlan:
      row.subscription_plan || "monthly",
    subscriptionStatus:
      row.subscription_status || "active",
    subscriptionStartedAt:
      row.subscription_started_at || null,
    subscriptionEndsAt:
      row.subscription_ends_at || null,
    razorpaySubscriptionId:
      row.razorpay_subscription_id || null,
    menu,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

async function findRestaurantBySlug(slug) {
  const result = await pool.query(
    `SELECT *
     FROM restaurants
     WHERE slug = $1
     LIMIT 1`,
    [normalizeString(slug).toLowerCase()]
  )

  return buildRestaurantFromRow(result.rows[0])
}

async function findRestaurantByEmail(email) {
  const result = await pool.query(
    `SELECT *
     FROM restaurants
     WHERE email = $1
     LIMIT 1`,
    [normalizeString(email).toLowerCase()]
  )

  return buildRestaurantFromRow(result.rows[0])
}

async function createUniqueRestaurantSlug(
  baseName,
  excludeRestaurantId = ""
) {
  const baseSlug =
    slugify(baseName) || "restaurant"

  let candidate = baseSlug
  let counter = 2

  while (true) {
    const result = await pool.query(
      `SELECT id
       FROM restaurants
       WHERE slug = $1
       LIMIT 1`,
      [candidate]
    )

    if (
      result.rows.length === 0 ||
      String(result.rows[0].id) ===
      String(excludeRestaurantId)
    ) {
      return candidate
    }

    candidate = `${baseSlug}-${counter}`
    counter += 1
  }
}

async function insertMenuItems(
  client,
  restaurantId,
  menu = []
) {
  for (const item of menu) {
    await client.query(
      `INSERT INTO menu_items
       (
         restaurant_id,
         item_id,
         name,
         price,
         category,
         image,
         ingredients,
         is_available
       )
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [
        restaurantId,
        item.itemId || null,
        item.name,
        Number(item.price) || 0,
        item.category || null,
        item.image || null,
        item.ingredients || [],
        item.isAvailable !== false
      ]
    )
  }
}

async function seedDefaultMenuForRestaurant(
  restaurantId
) {
  const menu = createDefaultMenu()

  const client = await pool.connect()

  try {
    await client.query("BEGIN")

    await insertMenuItems(
      client,
      restaurantId,
      menu
    )

    await client.query("COMMIT")

    console.log(
      `Seeded ${menu.length} default menu items`
    )
  } catch (error) {
    await client.query("ROLLBACK")
    throw error
  } finally {
    client.release()
  }
}

async function ensureDefaultRestaurant() {
  const existing = await findRestaurantBySlug(
    DEFAULT_RESTAURANT_SLUG
  )

  if (existing) {
    if (existing.menu.length === 0) {
      await seedDefaultMenuForRestaurant(
        existing._id
      )

      return findRestaurantBySlug(
        DEFAULT_RESTAURANT_SLUG
      )
    }

    return existing
  }

  const defaultRestaurantPayload = {
    restaurantName: "Foodie Demo",
    ownerName: "Demo Owner",
    email: "demo@foodie.local",
    password: "demo123",
    logo: "",
    publicDescription:
      "A demo restaurant for testing the ordering system.",
    subscriptionPlan: "yearly",
    subscriptionStatus: "active"
  }

  const client = await pool.connect()

  try {
    await client.query("BEGIN")

    const passwordHash = createPasswordHash(
      defaultRestaurantPayload.password
    )

    const restaurantResult = await client.query(
      `INSERT INTO restaurants
       (
         restaurant_name,
         owner_name,
         email,
         slug,
         password_hash,
         logo,
         public_description,
         subscription_plan,
         subscription_status
       )
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       RETURNING *`,
      [
        defaultRestaurantPayload.restaurantName,
        defaultRestaurantPayload.ownerName,
        defaultRestaurantPayload.email,
        DEFAULT_RESTAURANT_SLUG,
        passwordHash,
        defaultRestaurantPayload.logo,
        defaultRestaurantPayload.publicDescription,
        defaultRestaurantPayload.subscriptionPlan,
        defaultRestaurantPayload.subscriptionStatus
      ]
    )

    const restaurant = restaurantResult.rows[0]

    await insertMenuItems(
      client,
      restaurant.id,
      createDefaultMenu()
    )

    await client.query("COMMIT")

    console.log(
      `Created ${restaurant.restaurant_name} with default menu`
    )

    return buildRestaurantFromRow(restaurant)
  } catch (error) {
    await client.query("ROLLBACK")
    throw error
  } finally {
    client.release()
  }
}

async function registerRestaurant(payload = {}) {
  const normalized =
    normalizeRestaurantInput(payload)

  if (
    !normalized.restaurantName ||
    !normalized.ownerName
  ) {
    throw new Error(
      "Restaurant name and owner name are required."
    )
  }

  if (!normalized.email) {
    throw new Error("Email is required.")
  }

  if (
    !normalized.password ||
    normalized.password.length < 6
  ) {
    throw new Error(
      "Password must be at least 6 characters."
    )
  }

  if (
    await findRestaurantByEmail(normalized.email)
  ) {
    throw new Error(
      "An account with this email already exists."
    )
  }

  const uniqueSlug =
    await createUniqueRestaurantSlug(
      normalized.restaurantName
    )

  const menu =
    normalized.menu || createDefaultMenu()

  const client = await pool.connect()

  try {
    await client.query("BEGIN")

    const passwordHash =
      createPasswordHash(normalized.password)

    const restaurantResult = await client.query(
      `INSERT INTO restaurants
   (
     restaurant_name,
     owner_name,
     email,
     slug,
     password_hash,
     logo,
     public_description,
     subscription_plan,
     subscription_status,
     subscription_started_at,
     subscription_ends_at
   )
   VALUES (
     $1,$2,$3,$4,$5,$6,$7,$8,'trialing',
     CURRENT_TIMESTAMP,
     CURRENT_TIMESTAMP + INTERVAL '30 days'
   )
   RETURNING *`,
      [
        normalized.restaurantName,
        normalized.ownerName,
        normalized.email,
        uniqueSlug,
        passwordHash,
        normalized.logo || "",
        normalized.publicDescription || "",
        normalized.subscriptionPlan || "monthly"
      ]
    )
    const restaurantRow =
      restaurantResult.rows[0]

    await insertMenuItems(
      client,
      restaurantRow.id,
      menu
    )

    await client.query("COMMIT")

    return buildRestaurantFromRow(
      restaurantRow
    )
  } catch (error) {
    await client.query("ROLLBACK")
    throw error
  } finally {
    client.release()
  }
}

async function updateRestaurantForSession(
  restaurantId,
  payload = {}
) {
  const normalized =
    normalizeRestaurantUpdate(payload)

  if (!normalized.restaurantName) {
    throw new Error(
      "Restaurant name is required."
    )
  }

  const existingResult = await pool.query(
    `SELECT *
     FROM restaurants
     WHERE id = $1
     LIMIT 1`,
    [restaurantId]
  )

  if (existingResult.rows.length === 0) {
    return null
  }

  const nextSlug =
    await createUniqueRestaurantSlug(
      normalized.slug ||
      normalized.restaurantName,
      restaurantId
    )

  const client = await pool.connect()

  try {
    await client.query("BEGIN")

    const restaurantResult = await client.query(
      `UPDATE restaurants
       SET restaurant_name = $1,
           public_description = $2,
           slug = $3,
           logo = $4,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $5
       RETURNING *`,
      [
        normalized.restaurantName,
        normalized.publicDescription || "",
        nextSlug,
        normalized.logo || "",
        restaurantId
      ]
    )

    if (normalized.menu) {
      await client.query(
        `DELETE FROM menu_items
         WHERE restaurant_id = $1`,
        [restaurantId]
      )

      await insertMenuItems(
        client,
        restaurantId,
        normalized.menu
      )
    }

    await client.query("COMMIT")

    return buildRestaurantFromRow(
      restaurantResult.rows[0]
    )
  } catch (error) {
    await client.query("ROLLBACK")
    throw error
  } finally {
    client.release()
  }
}

function createSession(restaurant) {
  const payload = JSON.stringify({
    restaurantId: String(restaurant._id),
    expiresAt:
      Date.now() + SESSION_TTL_MS
  })

  const encodedPayload =
    Buffer.from(payload, "utf8")
      .toString("base64url")

  const signature =
    crypto
      .createHmac("sha256", SESSION_SECRET)
      .update(payload)
      .digest("base64url")

  return `${encodedPayload}.${signature}`
}

function parseSessionToken(token) {
  if (!token || !token.includes(".")) {
    return null
  }

  const [encodedPayload, signature] =
    token.split(".")

  try {
    const payload =
      Buffer.from(
        encodedPayload,
        "base64url"
      ).toString("utf8")

    const expectedSignature =
      crypto
        .createHmac(
          "sha256",
          SESSION_SECRET
        )
        .update(payload)
        .digest("base64url")

    if (
      !crypto.timingSafeEqual(
        Buffer.from(signature),
        Buffer.from(expectedSignature)
      )
    ) {
      return null
    }

    return JSON.parse(payload)
  } catch {
    return null
  }
}

async function getRestaurantFromToken(token) {
  const session =
    parseSessionToken(token)

  if (
    !session ||
    session.expiresAt <= Date.now()
  ) {
    return null
  }

  const result = await pool.query(
    `SELECT *
     FROM restaurants
     WHERE id = $1
     LIMIT 1`,
    [session.restaurantId]
  )

  return buildRestaurantFromRow(
    result.rows[0]
  )
}

function getSessionToken(req) {
  const authorization =
    normalizeString(
      req.headers.authorization
    )

  if (
    authorization
      .toLowerCase()
      .startsWith("bearer ")
  ) {
    return authorization
      .slice(7)
      .trim()
  }

  return normalizeString(
    req.headers["x-session-token"]
  )
}

async function requireAuth(
  req,
  res,
  next
) {
  try {
    const token =
      getSessionToken(req)

    const restaurant =
      await getRestaurantFromToken(token)

    if (!restaurant) {
      return res.status(401).json({
        error: "Authentication required."
      })
    }

    req.restaurant = restaurant
    req.sessionToken = token

    next()
  } catch (error) {
    console.error(
      "Authentication error:",
      error
    )

    res.status(500).json({
      error: "Authentication failed."
    })
  }
}

async function saveOrder(payload) {
  const normalizedPayload =
    normalizeOrderPayload(payload)

  const restaurant =
    await findRestaurantBySlug(
      normalizedPayload.restaurantSlug
    )

  if (!restaurant) {
    throw new Error(
      "Restaurant not found for this order."
    )
  }

  normalizedPayload.restaurantName =
    normalizedPayload.restaurantName ||
    restaurant.restaurantName

  const client = await pool.connect()

  try {
    await client.query("BEGIN")

    const orderResult = await client.query(
      `INSERT INTO orders
       (
         restaurant_id,
         restaurant_slug,
         restaurant_name,
         table_number,
         subtotal,
         gst,
         service_fee,
         total,
         avoid_ingredients,
         special_instructions,
         customer_preferences,
         status
       )
       VALUES
       ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       RETURNING *`,
      [
        restaurant._id,
        normalizedPayload.restaurantSlug,
        normalizedPayload.restaurantName,
        normalizedPayload.tableNumber,
        normalizedPayload.bill.subtotal,
        normalizedPayload.bill.gst,
        normalizedPayload.bill.serviceFee,
        normalizedPayload.bill.total,
        normalizedPayload.avoidIngredients || [],
        normalizedPayload.specialInstructions || "",
        normalizedPayload.customerPreferences || {},
        normalizedPayload.status || "pending"
      ]
    )

    const order = orderResult.rows[0]

    for (
      const item of normalizedPayload.items || []
    ) {
      await client.query(
        `INSERT INTO order_items
         (
           order_id,
           item_id,
           name,
           price,
           quantity,
           category,
           image,
           ingredients,
           skip_ingredients
         )
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [
          order.id,
          item.itemId || null,
          item.name,
          Number(item.price) || 0,
          Number(item.quantity) || 1,
          item.category || null,
          item.image || null,
          item.ingredients || [],
          item.skipIngredients || []
        ]
      )
    }

    await client.query("COMMIT")

    return getOrderById(order.id)
  } catch (error) {
    await client.query("ROLLBACK")
    throw error
  } finally {
    client.release()
  }
}

async function getOrderById(orderId) {
  const orderResult = await pool.query(
    `SELECT *
     FROM orders
     WHERE id = $1
     LIMIT 1`,
    [orderId]
  )

  if (orderResult.rows.length === 0) {
    return null
  }

  const order = orderResult.rows[0]

  const itemsResult = await pool.query(
    `SELECT *
     FROM order_items
     WHERE order_id = $1
     ORDER BY id ASC`,
    [orderId]
  )

  return {
    _id: String(order.id),
    restaurantSlug: order.restaurant_slug,
    restaurantName: order.restaurant_name,
    tableNumber: order.table_number,

    items: itemsResult.rows.map(
      (item) => ({
        itemId: item.item_id,
        name: item.name,
        price: Number(item.price),
        quantity: item.quantity,
        category: item.category || "",
        image: item.image || "",
        ingredients:
          item.ingredients || [],
        skipIngredients:
          item.skip_ingredients || []
      })
    ),

    subtotal: Number(
      order.subtotal || 0
    ),

    gst: Number(
      order.gst || 0
    ),

    serviceFee: Number(
      order.service_fee || 0
    ),

    total: Number(
      order.total || 0
    ),

    avoidIngredients:
      order.avoid_ingredients || [],

    specialInstructions:
      order.special_instructions || "",

    customerPreferences:
      order.customer_preferences || {},

    status: order.status,
    createdAt: order.created_at,
    updatedAt: order.updated_at
  }
}

async function getOrders(
  restaurantSlug = ""
) {
  const normalizedSlug =
    normalizeString(
      restaurantSlug
    ).toLowerCase()

  const query = normalizedSlug
    ? `SELECT id
       FROM orders
       WHERE restaurant_slug = $1
       ORDER BY created_at DESC`
    : `SELECT id
       FROM orders
       ORDER BY created_at DESC`

  const result = await pool.query(
    query,
    normalizedSlug
      ? [normalizedSlug]
      : []
  )

  const orders = []

  for (const row of result.rows) {
    const order =
      await getOrderById(row.id)

    if (order) {
      orders.push(order)
    }
  }

  return orders
}

async function updateOrderStatus(
  orderId,
  status,
  restaurantSlug = ""
) {
  const normalizedRestaurantSlug =
    normalizeString(
      restaurantSlug
    ).toLowerCase()

  const query =
    normalizedRestaurantSlug
      ? `UPDATE orders
         SET status = $1,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $2
           AND restaurant_slug = $3
         RETURNING id`
      : `UPDATE orders
         SET status = $1,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $2
         RETURNING id`

  const params =
    normalizedRestaurantSlug
      ? [
        status,
        orderId,
        normalizedRestaurantSlug
      ]
      : [
        status,
        orderId
      ]

  const result =
    await pool.query(
      query,
      params
    )

  if (result.rows.length === 0) {
    return null
  }

  return getOrderById(
    result.rows[0].id
  )
}

async function initializePersistence() {
  await pool.query("SELECT NOW()")

  console.log("PostgreSQL Connected")

  if (process.env.NODE_ENV !== "production") {
    await ensureDefaultRestaurant()
  }
}
const startupPromise =
  initializePersistence().catch(
    (error) => {
      console.error(
        "Failed to initialize storage:",
        error.message || error
      )

      throw error
    }
  )

app.use(
  async (req, res, next) => {
    try {
      await startupPromise
      next()
    } catch (error) {
      next(error)
    }
  }
)

app.post(
  ["/create-order", "/api/create-order"],
  paymentRateLimiter,
  async (req, res) => {
    if (!razorpay) {
      return res.status(500).json({
        error:
          "Razorpay keys are missing. Add RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in server/.env."
      })
    }

    const { amount } = req.body

    if (
      !amount ||
      Number(amount) <= 0
    ) {
      return res.status(400).json({
        error:
          "A valid amount is required to create a payment order."
      })
    }

    try {
      const order =
        await razorpay.orders.create({
          amount: Math.round(
            Number(amount) * 100
          ),
          currency: "INR"
        })

      res.json({
        ...order,
        key: razorpayKeyId
      })
    } catch (error) {
      res.status(500).json({
        error:
          error.message ||
          "Unable to create Razorpay order."
      })
    }
  }
)

app.post(
  "/api/restaurants/register",
  authRateLimiter,
  async (req, res) => {
    try {
      const restaurant =
        await registerRestaurant(
          req.body
        )

      const token =
        createSession(restaurant)

      res.status(201).json({
        success: true,
        token,
        restaurant:
          sanitizeRestaurantForAuth(
            restaurant
          ),
        storage: "postgresql"
      })
    } catch (error) {
      res.status(400).json({
        error:
          error.message ||
          "Unable to create restaurant account."
      })
    }
  }
)

app.post(
  "/api/restaurants/login",
  authRateLimiter,
  async (req, res) => {
    const email =
      normalizeString(
        req.body?.email
      ).toLowerCase()

    const password =
      normalizeString(
        req.body?.password
      )

    if (!email || !password) {
      return res.status(400).json({
        error:
          "Email and password are required."
      })
    }

    try {
      const restaurant =
        await findRestaurantByEmail(
          email
        )

      if (
        !restaurant ||
        !verifyPassword(
          password,
          restaurant.passwordHash
        )
      ) {
        return res.status(401).json({
          error:
            "Invalid email or password."
        })
      }

      const token =
        createSession(restaurant)

      res.json({
        success: true,
        token,
        restaurant:
          sanitizeRestaurantForAuth(
            restaurant
          )
      })
    } catch (error) {
      console.error(
        "Login error:",
        error
      )

      res.status(500).json({
        error:
          "Unable to login."
      })
    }
  }
)

app.get(
  "/api/restaurants/me",
  requireAuth,
  async (req, res) => {
    res.json({
      success: true,
      restaurant:
        sanitizeRestaurantForAuth(
          req.restaurant
        )
    })
  }
)

app.put(
  "/api/restaurants/me",
  requireAuth,
  async (req, res) => {
    try {
      const updatedRestaurant =
        await updateRestaurantForSession(
          req.restaurant._id,
          req.body
        )

      if (!updatedRestaurant) {
        return res.status(404).json({
          error:
            "Restaurant account not found."
        })
      }

      res.json({
        success: true,
        restaurant:
          sanitizeRestaurantForAuth(
            updatedRestaurant
          )
      })
    } catch (error) {
      res.status(400).json({
        error:
          error.message ||
          "Unable to update restaurant."
      })
    }
  }
)

app.post(
  "/api/restaurants/logout",
  requireAuth,
  (req, res) => {
    res.json({
      success: true
    })
  }
)

app.get(
  "/api/restaurants/public",
  async (req, res) => {
    try {
      const slug =
        normalizeString(
          req.query.slug
        ).toLowerCase() ||
        DEFAULT_RESTAURANT_SLUG

      const restaurant =
        await findRestaurantBySlug(
          slug
        )

      if (!restaurant) {
        return res.status(404).json({
          error:
            "Restaurant not found."
        })
      }

      res.json({
        success: true,
        restaurant:
          sanitizeRestaurantForPublic(
            restaurant
          )
      })
    } catch (error) {
      console.error(
        "Public restaurant error:",
        error
      )

      res.status(500).json({
        error:
          "Failed to fetch restaurant."
      })
    }
  }
)

app.post(
  "/api/orders",
  async (req, res) => {
    try {
      const order =
        await saveOrder(req.body)

      res.json({
        success: true,
        order,
        storage: "postgresql"
      })
    } catch (error) {
      console.error(
        "Save order error:",
        error
      )

      res.status(400).json({
        error:
          error.message ||
          "Failed to store order."
      })
    }
  }
)

app.get(
  "/api/orders",
  async (req, res) => {
    try {
      const restaurantSlug =
        normalizeString(
          req.query.restaurant
        )

      const orders =
        await getOrders(
          restaurantSlug
        )

      res.json(orders)
    } catch (error) {
      console.error(
        "Get orders error:",
        error
      )

      res.status(500).json({
        error:
          "Failed to fetch orders."
      })
    }
  }
)

app.patch(
  "/api/orders/:id/status",
  async (req, res) => {
    try {
      const status =
        normalizeString(
          req.body?.status
        ).toLowerCase()

      const restaurantSlug =
        normalizeString(
          req.body?.restaurantSlug ||
          req.query.restaurant
        )

      if (!status) {
        return res.status(400).json({
          error:
            "Status is required."
        })
      }

      const order =
        await updateOrderStatus(
          req.params.id,
          status,
          restaurantSlug
        )

      if (!order) {
        return res.status(404).json({
          error:
            "Order not found."
        })
      }

      res.json(order)
    } catch (error) {
      console.error(
        "Update order status error:",
        error
      )

      res.status(500).json({
        error:
          "Failed to update order."
      })
    }
  }
)

app.use(
  (err, req, res, next) => {
    if (
      err instanceof SyntaxError &&
      err.status === 400 &&
      "body" in err
    ) {
      return res.status(400).json({
        error:
          "Invalid JSON body received."
      })
    }

    next(err)
  }
)

app.use(
  (req, res) => {
    res.status(404).json({
      error:
        "Route not found."
    })
  }
)

if (require.main === module) {
  startupPromise
    .then(() => {
      app.listen(PORT, () => {
        console.log(
          `Server running on port ${PORT}`
        )
      })
    })
    .catch(() => {
      process.exit(1)
    })
}

module.exports = app
module.exports.startupPromise =
  startupPromise