require("dotenv").config()

const crypto = require("crypto")
const fs = require("fs")
const path = require("path")
const express = require("express")
const Razorpay = require("razorpay")
const cors = require("cors")
const mongoose = require("mongoose")
const { createDefaultMenu } = require("./defaultMenu")

mongoose.set("bufferCommands", false)

const PORT = Number(process.env.PORT) || 5000
const IS_VERCEL = Boolean(process.env.VERCEL)
const DEFAULT_RESTAURANT_SLUG = "foodie-demo"
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7
const SUBSCRIPTION_PLANS = new Set(["monthly", "yearly"])
const STORAGE_FILE_PATH = path.join(__dirname, "storage.json")
const SESSION_SECRET =
  process.env.SESSION_SECRET || "restaurant-demo-session-secret"
const app = express()

app.use(express.json())
app.use(cors())

const inMemoryOrders = []
const inMemoryRestaurants = []
let useMemoryStorage = true

function canUseMongo() {
  return !useMemoryStorage && mongoose.connection.readyState === 1
}

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

function syncCollection(targetCollection, sourceCollection) {
  targetCollection.length = 0
  targetCollection.push(...sourceCollection)
}

function loadMemoryStorage() {
  if (!fs.existsSync(STORAGE_FILE_PATH)) {
    return
  }

  try {
    const rawStore = fs.readFileSync(STORAGE_FILE_PATH, "utf8")

    if (!rawStore.trim()) {
      return
    }

    const parsedStore = JSON.parse(rawStore)
    const restaurants = Array.isArray(parsedStore.restaurants)
      ? parsedStore.restaurants
      : []
    const orders = Array.isArray(parsedStore.orders) ? parsedStore.orders : []

    syncCollection(inMemoryRestaurants, restaurants)
    syncCollection(inMemoryOrders, orders)
  } catch (error) {
    console.error("Unable to load local storage:", error.message || error)
  }
}

function persistMemoryStorage() {
  if (canUseMongo() || IS_VERCEL) {
    return
  }

  const payload = {
    restaurants: inMemoryRestaurants,
    orders: inMemoryOrders
  }

  try {
    fs.writeFileSync(STORAGE_FILE_PATH, JSON.stringify(payload, null, 2), "utf8")
  } catch (error) {
    console.error("Unable to persist local storage:", error.message || error)
  }
}

loadMemoryStorage()

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

  const nextHash = crypto.scryptSync(password, salt, 64).toString("hex")
  return crypto.timingSafeEqual(
    Buffer.from(originalHash, "hex"),
    Buffer.from(nextHash, "hex")
  )
}

function createMenuItemId() {
  return crypto.randomBytes(8).toString("hex")
}

function normalizeMenuItem(item = {}, index = 0) {
  return {
    itemId: normalizeString(item.itemId) || `item-${index + 1}-${createMenuItemId()}`,
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
    subscriptionPlan: normalizeSubscriptionPlan(payload.subscriptionPlan)
  }
}

function normalizeRestaurantUpdate(payload = {}) {
  const restaurantName = normalizeString(payload.restaurantName)
  const publicDescription = normalizeString(payload.publicDescription)
  const slug = normalizeString(payload.slug).toLowerCase()
  const logo = normalizeString(payload.logo)
  const menu = Array.isArray(payload.menu)
    ? payload.menu.map((item, index) => normalizeMenuItem(item, index))
    : null

  return {
    restaurantName,
    publicDescription,
    slug,
    logo,
    menu
  }
}

function buildRestaurantRecord(payload = {}, overrides = {}) {
  const restaurantName = normalizeString(payload.restaurantName) || "Restaurant"
  const baseSlug = slugify(payload.slug || restaurantName) || "restaurant"

  return {
    _id: overrides._id || new mongoose.Types.ObjectId().toString(),
    restaurantName,
    ownerName: normalizeString(payload.ownerName) || "Owner",
    email: normalizeString(payload.email).toLowerCase(),
    slug: overrides.slug || baseSlug,
    passwordHash: payload.passwordHash || createPasswordHash(payload.password || "123456"),
    logo: normalizeString(payload.logo),
    publicDescription:
      normalizeString(payload.publicDescription) ||
      "Scan the QR, browse the menu, and place your order in a few taps.",
    subscriptionPlan: normalizeSubscriptionPlan(payload.subscriptionPlan),
    subscriptionStatus: normalizeString(payload.subscriptionStatus) || "active",
    menu: Array.isArray(payload.menu)
      ? payload.menu.map((item, index) => normalizeMenuItem(item, index))
      : createDefaultMenu(),
    createdAt: overrides.createdAt || new Date(),
    updatedAt: new Date()
  }
}

function sanitizeRestaurantForAuth(restaurant = {}) {
  const subscriptionPlan = normalizeSubscriptionPlan(restaurant.subscriptionPlan)

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
    menu: Array.isArray(restaurant.menu) ? restaurant.menu : []
  }
}

function sanitizeRestaurantForPublic(restaurant = {}) {
  const subscriptionPlan = normalizeSubscriptionPlan(restaurant.subscriptionPlan)

  return {
    restaurantName: restaurant.restaurantName,
    slug: restaurant.slug,
    logo: restaurant.logo,
    publicDescription: restaurant.publicDescription,
    subscriptionPlan,
    menu: Array.isArray(restaurant.menu)
      ? restaurant.menu.filter((item) => item.isAvailable !== false)
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
        skipIngredients: normalizeStringList(item.skipIngredients)
      }))
    : []

  const avoidIngredients = normalizeStringList(payload.avoidIngredients)
  const customerPreferenceAvoidIngredients = normalizeStringList(
    payload.customerPreferences?.avoidIngredients
  )
  const specialInstructions = normalizeString(payload.specialInstructions)
  const customerPreferenceNote = normalizeString(payload.customerPreferences?.note)

  return {
    restaurantSlug: normalizeString(payload.restaurantSlug).toLowerCase() || DEFAULT_RESTAURANT_SLUG,
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
    status: normalizeString(payload.status) || "pending"
  }
}

function buildMemoryOrder(payload = {}) {
  const normalizedPayload = normalizeOrderPayload(payload)

  return {
    _id: new mongoose.Types.ObjectId().toString(),
    ...normalizedPayload,
    createdAt: new Date()
  }
}

const MenuItemSchema = new mongoose.Schema(
  {
    itemId: String,
    name: String,
    price: Number,
    category: String,
    image: String,
    ingredients: [String],
    isAvailable: {
      type: Boolean,
      default: true
    }
  },
  { _id: false }
)

const RestaurantSchema = new mongoose.Schema(
  {
    restaurantName: {
      type: String,
      required: true
    },
    ownerName: String,
    email: {
      type: String,
      required: true,
      unique: true
    },
    slug: {
      type: String,
      required: true,
      unique: true
    },
    passwordHash: {
      type: String,
      required: true
    },
    logo: String,
    publicDescription: String,
    subscriptionPlan: {
      type: String,
      default: "monthly"
    },
    subscriptionStatus: {
      type: String,
      default: "active"
    },
    menu: [MenuItemSchema]
  },
  {
    timestamps: true
  }
)

const OrderSchema = new mongoose.Schema({
  restaurantSlug: String,
  restaurantName: String,
  tableNumber: Number,
  items: [
    {
      itemId: String,
      name: String,
      price: Number,
      quantity: Number,
      category: String,
      image: String,
      ingredients: [String],
      skipIngredients: [String]
    }
  ],
  bill: {
    subtotal: Number,
    gst: Number,
    serviceFee: Number,
    total: Number
  },
  customerPreferences: {
    avoidIngredients: [String],
    note: String
  },
  avoidIngredients: [String],
  specialInstructions: String,
  status: {
    type: String,
    default: "pending"
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
})

const Restaurant = mongoose.model("Restaurant", RestaurantSchema)
const Order = mongoose.model("Order", OrderSchema)

function getMemoryRestaurantBySlug(slug) {
  return inMemoryRestaurants.find((restaurant) => restaurant.slug === slug) || null
}

function getMemoryRestaurantByEmail(email) {
  return (
    inMemoryRestaurants.find((restaurant) => restaurant.email === email.toLowerCase()) ||
    null
  )
}

async function findRestaurantBySlug(slug) {
  if (canUseMongo()) {
    return Restaurant.findOne({ slug })
  }

  return getMemoryRestaurantBySlug(slug)
}

async function findRestaurantByEmail(email) {
  if (canUseMongo()) {
    return Restaurant.findOne({ email: email.toLowerCase() })
  }

  return getMemoryRestaurantByEmail(email)
}

async function createUniqueRestaurantSlug(baseName, excludeRestaurantId = "") {
  const baseSlug = slugify(baseName) || "restaurant"
  let candidate = baseSlug
  let attempt = 1

  while (true) {
    const existingRestaurant = await findRestaurantBySlug(candidate)

    if (
      !existingRestaurant ||
      String(existingRestaurant._id) === String(excludeRestaurantId)
    ) {
      return candidate
    }

    attempt += 1
    candidate = `${baseSlug}-${attempt}`
  }
}

async function ensureDefaultRestaurant() {
  const defaultRestaurantPayload = {
    restaurantName: "Foodie Demo",
    ownerName: "Demo Owner",
    email: "demo@foodie.local",
    password: "demo123",
    publicDescription:
      "This sample restaurant shows how each subscriber can publish a QR menu and manage it from the owner dashboard.",
    subscriptionPlan: "yearly",
    subscriptionStatus: "active",
    menu: createDefaultMenu()
  }

  if (canUseMongo()) {
    const existing = await Restaurant.findOne({ slug: DEFAULT_RESTAURANT_SLUG })

    if (!existing) {
      const restaurant = buildRestaurantRecord(defaultRestaurantPayload, {
        slug: DEFAULT_RESTAURANT_SLUG
      })

      await Restaurant.create(restaurant)
    }

    return
  }

  if (!getMemoryRestaurantBySlug(DEFAULT_RESTAURANT_SLUG)) {
    inMemoryRestaurants.push(
      buildRestaurantRecord(defaultRestaurantPayload, {
        slug: DEFAULT_RESTAURANT_SLUG
      })
    )
    persistMemoryStorage()
  }
}

async function registerRestaurant(payload = {}) {
  const normalized = normalizeRestaurantInput(payload)

  if (!normalized.restaurantName || !normalized.ownerName) {
    throw new Error("Restaurant name and owner name are required.")
  }

  if (!normalized.email || !normalized.password) {
    throw new Error("Email and password are required.")
  }

  if (normalized.password.length < 6) {
    throw new Error("Password must be at least 6 characters.")
  }

  if (await findRestaurantByEmail(normalized.email)) {
    throw new Error("This email is already registered.")
  }

  const uniqueSlug = await createUniqueRestaurantSlug(normalized.restaurantName)
  const nextRestaurant = buildRestaurantRecord(
    {
      ...normalized,
      passwordHash: createPasswordHash(normalized.password),
      menu: createDefaultMenu()
    },
    {
      slug: uniqueSlug
    }
  )

  if (canUseMongo()) {
    const restaurant = await Restaurant.create(nextRestaurant)
    return restaurant
  }

  inMemoryRestaurants.push(nextRestaurant)
  persistMemoryStorage()
  return nextRestaurant
}

async function resetRestaurantPassword(email, nextPassword) {
  const normalizedEmail = normalizeString(email).toLowerCase()
  const normalizedPassword = normalizeString(nextPassword)

  if (!normalizedEmail) {
    throw new Error("Email is required.")
  }

  if (!normalizedPassword || normalizedPassword.length < 6) {
    throw new Error("New password must be at least 6 characters.")
  }

  if (canUseMongo()) {
    const restaurant = await Restaurant.findOne({ email: normalizedEmail })

    if (!restaurant) {
      throw new Error("No restaurant account found for this email.")
    }

    restaurant.passwordHash = createPasswordHash(normalizedPassword)
    await restaurant.save()
    return restaurant
  }

  const restaurant = getMemoryRestaurantByEmail(normalizedEmail)

  if (!restaurant) {
    throw new Error("No restaurant account found for this email.")
  }

  restaurant.passwordHash = createPasswordHash(normalizedPassword)
  restaurant.updatedAt = new Date()
  persistMemoryStorage()

  return restaurant
}

async function updateRestaurantForSession(restaurantId, payload = {}) {
  const normalized = normalizeRestaurantUpdate(payload)

  if (!normalized.restaurantName) {
    throw new Error("Restaurant name is required.")
  }

  if (Array.isArray(normalized.menu) && normalized.menu.length === 0) {
    throw new Error("Add at least one menu item before saving.")
  }

  const nextSlug = await createUniqueRestaurantSlug(
    normalized.slug || normalized.restaurantName,
    restaurantId
  )

  if (canUseMongo()) {
    const restaurant = await Restaurant.findById(restaurantId)

    if (!restaurant) {
      return null
    }

    restaurant.restaurantName = normalized.restaurantName
    restaurant.slug = nextSlug
    restaurant.logo = normalized.logo
    restaurant.publicDescription =
      normalized.publicDescription || restaurant.publicDescription
    if (Array.isArray(normalized.menu)) {
      restaurant.menu = normalized.menu
    }

    await restaurant.save()
    return restaurant
  }

  const restaurant = inMemoryRestaurants.find(
    (entry) => String(entry._id) === String(restaurantId)
  )

  if (!restaurant) {
    return null
  }

  restaurant.restaurantName = normalized.restaurantName
  restaurant.slug = nextSlug
  restaurant.logo = normalized.logo
  restaurant.publicDescription =
    normalized.publicDescription || restaurant.publicDescription
  if (Array.isArray(normalized.menu)) {
    restaurant.menu = normalized.menu
  }
  restaurant.updatedAt = new Date()

  persistMemoryStorage()
  return restaurant
}

function createSession(restaurant) {
  const payload = JSON.stringify({
    restaurantId: String(restaurant._id),
    expiresAt: Date.now() + SESSION_TTL_MS
  })
  const encodedPayload = Buffer.from(payload, "utf8").toString("base64url")
  const signature = crypto
    .createHmac("sha256", SESSION_SECRET)
    .update(payload)
    .digest("base64url")

  return `${encodedPayload}.${signature}`
}

function parseSessionToken(token) {
  const [encodedPayload, signature] = normalizeString(token).split(".")

  if (!encodedPayload || !signature) {
    return null
  }

  let payload = ""

  try {
    payload = Buffer.from(encodedPayload, "base64url").toString("utf8")
  } catch {
    return null
  }

  const expectedSignature = crypto
    .createHmac("sha256", SESSION_SECRET)
    .update(payload)
    .digest("base64url")

  if (signature.length !== expectedSignature.length) {
    return null
  }

  if (
    !crypto.timingSafeEqual(
      Buffer.from(signature, "utf8"),
      Buffer.from(expectedSignature, "utf8")
    )
  ) {
    return null
  }

  try {
    return JSON.parse(payload)
  } catch {
    return null
  }
}

async function getRestaurantFromToken(token) {
  const session = parseSessionToken(token)

  if (!session) {
    return null
  }

  if (session.expiresAt <= Date.now()) {
    return null
  }

  if (canUseMongo()) {
    return Restaurant.findById(session.restaurantId)
  }

  return (
    inMemoryRestaurants.find(
      (restaurant) => String(restaurant._id) === String(session.restaurantId)
    ) || null
  )
}

function getSessionToken(req) {
  const authHeader = normalizeString(req.headers.authorization)

  if (authHeader.toLowerCase().startsWith("bearer ")) {
    return authHeader.slice(7).trim()
  }

  return normalizeString(req.headers["x-session-token"])
}

async function requireAuth(req, res, next) {
  const token = getSessionToken(req)

  if (!token) {
    return res.status(401).json({
      error: "Login required."
    })
  }

  const restaurant = await getRestaurantFromToken(token)

  if (!restaurant) {
    return res.status(401).json({
      error: "Your session has expired. Please login again."
    })
  }

  req.restaurant = restaurant
  req.sessionToken = token
  next()
}

async function saveOrder(payload) {
  const normalizedPayload = normalizeOrderPayload(payload)
  const restaurant = await findRestaurantBySlug(normalizedPayload.restaurantSlug)

  if (!restaurant) {
    throw new Error("Restaurant not found for this order.")
  }

  normalizedPayload.restaurantName =
    normalizedPayload.restaurantName || restaurant.restaurantName

  if (canUseMongo()) {
    const order = new Order(normalizedPayload)
    await order.save()
    return order
  }

  const order = buildMemoryOrder(normalizedPayload)
  inMemoryOrders.unshift(order)
  persistMemoryStorage()
  return order
}

async function getOrders(restaurantSlug = "") {
  const normalizedSlug = normalizeString(restaurantSlug).toLowerCase()

  if (canUseMongo()) {
    const query = normalizedSlug ? { restaurantSlug: normalizedSlug } : {}
    return Order.find(query).sort({ createdAt: -1 })
  }

  const filteredOrders = normalizedSlug
    ? inMemoryOrders.filter((order) => order.restaurantSlug === normalizedSlug)
    : [...inMemoryOrders]

  return filteredOrders.sort(
    (left, right) =>
      new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()
  )
}

async function updateOrderStatus(orderId, status, restaurantSlug = "") {
  const normalizedRestaurantSlug = normalizeString(restaurantSlug).toLowerCase()

  if (canUseMongo()) {
    const query = normalizedRestaurantSlug
      ? { _id: orderId, restaurantSlug: normalizedRestaurantSlug }
      : { _id: orderId }

    return Order.findOneAndUpdate(query, { status }, { new: true })
  }

  const order = inMemoryOrders.find((item) => {
    if (item._id !== orderId) {
      return false
    }

    if (!normalizedRestaurantSlug) {
      return true
    }

    return item.restaurantSlug === normalizedRestaurantSlug
  })

  if (!order) {
    return null
  }

  order.status = status
  persistMemoryStorage()
  return order
}

const razorpayKeyId = process.env.RAZORPAY_KEY_ID
const razorpayKeySecret = process.env.RAZORPAY_KEY_SECRET

const razorpay =
  razorpayKeyId && razorpayKeySecret
    ? new Razorpay({
        key_id: razorpayKeyId,
        key_secret: razorpayKeySecret
      })
    : null

async function initializePersistence() {
  const mongoUri = normalizeString(process.env.MONGO_URI)

  if (!mongoUri) {
    useMemoryStorage = true
    loadMemoryStorage()
    await ensureDefaultRestaurant()
    return
  }

  try {
    await mongoose.connect(mongoUri, {
      serverSelectionTimeoutMS: 5000
    })
    useMemoryStorage = false
    console.log("MongoDB Connected")
  } catch (error) {
    useMemoryStorage = true
    loadMemoryStorage()
    console.log("MongoDB connection error:", error.message || error)
  }

  await ensureDefaultRestaurant()
}

mongoose.connection.on("disconnected", async () => {
  useMemoryStorage = true
  loadMemoryStorage()
  console.log("MongoDB disconnected. Falling back to in-memory storage.")
  await ensureDefaultRestaurant()
})

mongoose.connection.on("error", () => {
  useMemoryStorage = true
})

const startupPromise = initializePersistence().catch((error) => {
  console.error("Failed to initialize storage:", error.message || error)
})

app.use(async (req, res, next) => {
  try {
    await startupPromise
    next()
  } catch (error) {
    next(error)
  }
})

app.post(["/create-order", "/api/create-order"], async (req, res) => {
  if (!razorpay) {
    return res.status(500).json({
      error:
        "Razorpay keys are missing. Add RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in server/.env."
    })
  }

  const { amount } = req.body

  if (!amount || Number(amount) <= 0) {
    return res.status(400).json({
      error: "A valid amount is required to create a payment order."
    })
  }

  try {
    const order = await razorpay.orders.create({
      amount: Math.round(Number(amount) * 100),
      currency: "INR"
    })

    res.json({
      ...order,
      key: razorpayKeyId
    })
  } catch (error) {
    res.status(500).json({
      error: error.message || "Unable to create Razorpay order."
    })
  }
})

app.post("/api/restaurants/register", async (req, res) => {
  try {
    const restaurant = await registerRestaurant(req.body)
    const token = createSession(restaurant)

    res.status(201).json({
      success: true,
      token,
      restaurant: sanitizeRestaurantForAuth(restaurant),
      storage: canUseMongo() ? "mongodb" : "memory"
    })
  } catch (error) {
    res.status(400).json({
      error: error.message || "Unable to create restaurant account."
    })
  }
})

app.post("/api/restaurants/login", async (req, res) => {
  const email = normalizeString(req.body?.email).toLowerCase()
  const password = normalizeString(req.body?.password)

  if (!email || !password) {
    return res.status(400).json({
      error: "Email and password are required."
    })
  }

  const restaurant = await findRestaurantByEmail(email)

  if (!restaurant || !verifyPassword(password, restaurant.passwordHash)) {
    return res.status(401).json({
      error: "Invalid email or password."
    })
  }

  const token = createSession(restaurant)

  res.json({
    success: true,
    token,
    restaurant: sanitizeRestaurantForAuth(restaurant)
  })
})

app.post("/api/restaurants/forgot-password", async (req, res) => {
  try {
    await resetRestaurantPassword(req.body?.email, req.body?.password)

    res.json({
      success: true,
      message: "Password reset successful. Please login with your new password."
    })
  } catch (error) {
    res.status(400).json({
      error: error.message || "Unable to reset password."
    })
  }
})

app.get("/api/restaurants/me", requireAuth, async (req, res) => {
  res.json({
    success: true,
    restaurant: sanitizeRestaurantForAuth(req.restaurant)
  })
})

app.put("/api/restaurants/me", requireAuth, async (req, res) => {
  try {
    const updatedRestaurant = await updateRestaurantForSession(
      req.restaurant._id,
      req.body
    )

    if (!updatedRestaurant) {
      return res.status(404).json({
        error: "Restaurant account not found."
      })
    }

    res.json({
      success: true,
      restaurant: sanitizeRestaurantForAuth(updatedRestaurant)
    })
  } catch (error) {
    res.status(400).json({
      error: error.message || "Unable to update restaurant."
    })
  }
})

app.post("/api/restaurants/logout", requireAuth, (req, res) => {
  res.json({ success: true })
})

app.get("/api/restaurants/public", async (req, res) => {
  const slug =
    normalizeString(req.query.slug).toLowerCase() || DEFAULT_RESTAURANT_SLUG
  const restaurant = await findRestaurantBySlug(slug)

  if (!restaurant) {
    return res.status(404).json({
      error: "Restaurant not found."
    })
  }

  res.json({
    success: true,
    restaurant: sanitizeRestaurantForPublic(restaurant)
  })
})

app.post("/api/orders", async (req, res) => {
  try {
    const order = await saveOrder(req.body)

    res.json({
      success: true,
      order,
      storage: canUseMongo() ? "mongodb" : "memory"
    })
  } catch (error) {
    res.status(400).json({
      error: error.message || "Failed to store order."
    })
  }
})

app.get("/api/orders", async (req, res) => {
  try {
    const restaurantSlug = normalizeString(req.query.restaurant)
    const orders = await getOrders(restaurantSlug)

    res.json(orders)
  } catch {
    res.status(500).json({
      error: "Failed to fetch orders."
    })
  }
})

app.patch("/api/orders/:id/status", async (req, res) => {
  try {
    const status = normalizeString(req.body?.status)
    const restaurantSlug = normalizeString(
      req.body?.restaurantSlug || req.query.restaurant
    )

    if (!status) {
      return res.status(400).json({
        error: "Status is required."
      })
    }

    const order = await updateOrderStatus(req.params.id, status, restaurantSlug)

    if (!order) {
      return res.status(404).json({ error: "Order not found." })
    }

    res.json(order)
  } catch {
    res.status(500).json({ error: "Failed to update order." })
  }
})

app.use((err, req, res, next) => {
  if (err instanceof SyntaxError && err.status === 400 && "body" in err) {
    return res.status(400).json({
      error: "Invalid JSON body received."
    })
  }

  next()
})

app.use((req, res) => {
  res.status(404).json({
    error: "Route not found."
  })
})

if (require.main === module) {
  startupPromise.finally(() => {
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`)
    })
  })
}

module.exports = app
module.exports.startupPromise = startupPromise
