import { useCallback, useEffect, useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
import {
  apiBaseUrl,
  buildKitchenUrl,
  buildMenuUrl,
  clearSessionToken,
  getAuthHeaders,
  getSessionToken,
  parseJsonResponse
} from "../utils/restaurant"
import { createQrDataUrl, createQrSvg } from "../utils/qrcode"
import { jsPDF } from "jspdf"

function createEmptyMenuItem() {
  return {
    itemId: window.crypto.randomUUID(),
    name: "",
    price: "",
    category: "",
    image: "",
    ingredients: "",
    isAvailable: true
  }
}

function toEditableMenu(menu = []) {
  return menu.map((item) => ({
    itemId: item.itemId || window.crypto.randomUUID(),
    name: item.name || "",
    price: item.price ?? "",
    category: item.category || "",
    image: item.image || "",
    ingredients: Array.isArray(item.ingredients)
      ? item.ingredients.join(", ")
      : "",
    isAvailable: item.isAvailable !== false
  }))
}

function toPayloadMenu(menu = []) {
  return menu.map((item) => ({
    itemId: item.itemId,
    name: item.name.trim(),
    price: Math.max(0, Number(item.price) || 0),
    category: item.category.trim(),
    image: item.image.trim(),
    ingredients: item.ingredients
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean),
    isAvailable: item.isAvailable !== false
  }))
}

function formatSlug(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9-\s]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48)
}

function sortMenuItems(menu = [], sortBy = "latest") {
  const nextMenu = [...menu]

  if (sortBy === "name-asc") {
    return nextMenu.sort((left, right) => left.name.localeCompare(right.name))
  }

  if (sortBy === "price-low") {
    return nextMenu.sort(
      (left, right) => (Number(left.price) || 0) - (Number(right.price) || 0)
    )
  }

  if (sortBy === "price-high") {
    return nextMenu.sort(
      (left, right) => (Number(right.price) || 0) - (Number(left.price) || 0)
    )
  }

  if (sortBy === "category") {
    return nextMenu.sort((left, right) =>
      (left.category || "").localeCompare(right.category || "")
    )
  }

  return nextMenu
}

function formatSubscriptionLabel(plan = "") {
  if (plan === "yearly") {
    return "1 year"
  }

  if (plan === "monthly") {
    return "1 month"
  }

  return plan || "active"
}

function RestaurantDashboard() {
  const navigate = useNavigate()
  const [restaurant, setRestaurant] = useState(null)
  const [restaurantName, setRestaurantName] = useState("")
  const [slug, setSlug] = useState("")
  const [logo, setLogo] = useState("")
  const [publicDescription, setPublicDescription] = useState("")
  const [menu, setMenu] = useState([])
  const [qrStartTable, setQrStartTable] = useState(1)
  const [qrTableCount, setQrTableCount] = useState(8)
  const [qrCards, setQrCards] = useState([])
  const [isQrLoading, setIsQrLoading] = useState(false)
  const [searchTerm, setSearchTerm] = useState("")
  const [availabilityFilter, setAvailabilityFilter] = useState("all")
  const [sortBy, setSortBy] = useState("latest")
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [isUpdatingDetails, setIsUpdatingDetails] = useState(false)
  const [copiedTarget, setCopiedTarget] = useState("")
  const [feedback, setFeedback] = useState({
    type: "info",
    message: ""
  })

  const loadRestaurant = useCallback(async () => {
    try {
      const response = await fetch(`${apiBaseUrl}/api/restaurants/me`, {
        headers: getAuthHeaders()
      })

      const payload = await parseJsonResponse(
        response,
        "Server returned an invalid dashboard response.",
        "Unable to load dashboard."
      )

      const nextRestaurant = payload.restaurant
      setRestaurant(nextRestaurant)
      setRestaurantName(nextRestaurant.restaurantName || "")
      setSlug(nextRestaurant.slug || "")
      setLogo(nextRestaurant.logo || "")
      setPublicDescription(nextRestaurant.publicDescription || "")
      setMenu(toEditableMenu(nextRestaurant.menu || []))
      setFeedback({
        type: "info",
        message: ""
      })
    } catch (error) {
      clearSessionToken()
      setFeedback({
        type: "error",
        message: error.message || "Your session expired. Please login again."
      })
      navigate("/portal", { replace: true })
    } finally {
      setIsLoading(false)
    }
  }, [navigate])

  useEffect(() => {
    if (!getSessionToken()) {
      navigate("/portal", { replace: true })
      return
    }

    loadRestaurant()
  }, [loadRestaurant, navigate])

  const activeSlug = slug || restaurant?.slug || ""
  const publicMenuUrl = activeSlug
    ? `${window.location.origin}${buildMenuUrl(activeSlug, 1)}`
    : ""
  const kitchenUrl = activeSlug
    ? `${window.location.origin}${buildKitchenUrl(activeSlug)}`
    : ""

  const generatedTables = useMemo(() => {
    const safeStart = Math.max(1, Number(qrStartTable) || 1)
    const safeCount = Math.min(100, Math.max(1, Number(qrTableCount) || 1))

    return Array.from({ length: safeCount }, (_, index) => safeStart + index)
  }, [qrStartTable, qrTableCount])

  useEffect(() => {
    let isCancelled = false

    async function buildQrCards() {
      if (!activeSlug) {
        setQrCards([])
        return
      }

      setIsQrLoading(true)

      try {
        const nextCards = await Promise.all(
          generatedTables.map(async (tableNumber) => {
            const menuPath = buildMenuUrl(activeSlug, tableNumber)
            const fullUrl = `${window.location.origin}${menuPath}`
            const svg = await createQrSvg(fullUrl, 220)
            const dataUrl = await createQrDataUrl(fullUrl, 320)

            return {
              tableNumber,
              menuPath,
              fullUrl,
              svg,
              dataUrl
            }
          })
        )

        if (!isCancelled) {
          setQrCards(nextCards)
        }
      } catch {
        if (!isCancelled) {
          setQrCards([])
          setFeedback({
            type: "error",
            message: "Local QR generation failed. Please try again."
          })
        }
      } finally {
        if (!isCancelled) {
          setIsQrLoading(false)
        }
      }
    }

    buildQrCards()

    return () => {
      isCancelled = true
    }
  }, [activeSlug, generatedTables])

  const previewQrCard = qrCards[0] || null

  const visibleMenu = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase()

    const filteredMenu = menu.filter((item) => {
      const matchesSearch =
        !normalizedSearch ||
        item.name.toLowerCase().includes(normalizedSearch) ||
        item.category.toLowerCase().includes(normalizedSearch) ||
        item.ingredients.toLowerCase().includes(normalizedSearch)

      const matchesAvailability =
        availabilityFilter === "all" ||
        (availabilityFilter === "live" && item.isAvailable) ||
        (availabilityFilter === "hidden" && !item.isAvailable)

      return matchesSearch && matchesAvailability
    })

    return sortMenuItems(filteredMenu, sortBy)
  }, [availabilityFilter, menu, searchTerm, sortBy])

  function updateMenuItem(itemId, field, value) {
    setMenu((current) =>
      current.map((item) =>
        item.itemId === itemId ? { ...item, [field]: value } : item
      )
    )
  }

  function addMenuItem() {
    setMenu((current) => [createEmptyMenuItem(), ...current])
    setFeedback({
      type: "success",
      message: "A new menu item card is ready. Add the details and save when you are done."
    })
  }

  function removeMenuItem(itemId) {
    setMenu((current) => current.filter((item) => item.itemId !== itemId))
  }

  function clearMenuFilters() {
    setSearchTerm("")
    setAvailabilityFilter("all")
    setSortBy("latest")
  }

  async function handleImageUpload(itemId, event) {
    const file = event.target.files?.[0]

    if (!file) {
      return
    }

    if (!file.type.startsWith("image/")) {
      setFeedback({
        type: "error",
        message: "Please choose an image file only."
      })
      return
    }

    const reader = new FileReader()

    reader.onload = () => {
      updateMenuItem(
        itemId,
        "image",
        typeof reader.result === "string" ? reader.result : ""
      )
      setFeedback({
        type: "success",
        message: "Image uploaded. Save your menu to store it permanently."
      })
    }

    reader.onerror = () => {
      setFeedback({
        type: "error",
        message: "The image could not be read. Please try again."
      })
    }

    reader.readAsDataURL(file)
    event.target.value = ""
  }

  async function handleLogoUpload(event) {
    const file = event.target.files?.[0]

    if (!file) {
      return
    }

    if (!file.type.startsWith("image/")) {
      setFeedback({
        type: "error",
        message: "Please choose an image file only for logo."
      })
      return
    }

    const reader = new FileReader()

    reader.onload = () => {
      setLogo(typeof reader.result === "string" ? reader.result : "")
      setFeedback({
        type: "success",
        message: "Logo uploaded. Save your restaurant details to use it across QR cards and branding."
      })
    }

    reader.onerror = () => {
      setFeedback({
        type: "error",
        message: "The logo could not be read. Please try again."
      })
    }

    reader.readAsDataURL(file)
    event.target.value = ""
  }

  async function saveRestaurantChanges(section = "menu") {
    const isDetailsUpdate = section === "details"
    const requestBody = {
      restaurantName,
      slug,
      logo,
      publicDescription
    }

    if (!isDetailsUpdate) {
      requestBody.menu = toPayloadMenu(menu)
    }

    if (isDetailsUpdate) {
      setIsUpdatingDetails(true)
    } else {
      setIsSaving(true)
    }

    setFeedback({
      type: "info",
      message: isDetailsUpdate
        ? "Updating your restaurant details..."
        : "Saving your restaurant menu..."
    })

    try {
      const response = await fetch(`${apiBaseUrl}/api/restaurants/me`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeaders()
        },
        body: JSON.stringify(requestBody)
      })

      const payload = await parseJsonResponse(
        response,
        "Server returned an invalid save response.",
        "Unable to save your changes."
      )

      setRestaurant(payload.restaurant)
      setRestaurantName(payload.restaurant.restaurantName || "")
      setSlug(payload.restaurant.slug || "")
      setLogo(payload.restaurant.logo || "")
      setPublicDescription(payload.restaurant.publicDescription || "")
      setMenu(toEditableMenu(payload.restaurant.menu || []))
      setFeedback({
        type: "success",
        message: isDetailsUpdate
          ? "Restaurant details updated. Your name, slug, links, and QR flow are now live."
          : "Menu saved. Your live links and QR flow now use the latest restaurant data."
      })
    } catch (error) {
      setFeedback({
        type: "error",
        message: error.message || "Unable to save your changes."
      })
    } finally {
      if (isDetailsUpdate) {
        setIsUpdatingDetails(false)
      } else {
        setIsSaving(false)
      }
    }
  }

  async function handleLogout() {
    try {
      await fetch(`${apiBaseUrl}/api/restaurants/logout`, {
        method: "POST",
        headers: getAuthHeaders()
      })
    } catch {
      // Ignore logout API errors and clear the session locally.
    } finally {
      clearSessionToken()
      navigate("/portal", { replace: true })
    }
  }

  async function copyValue(value, target) {
    if (!value) {
      setFeedback({
        type: "warning",
        message: `Please save or generate ${target.toLowerCase()} first.`
      })
      return
    }

    try {
      await navigator.clipboard.writeText(value)
      setCopiedTarget(target)
      setFeedback({
        type: "success",
        message: `${target} copied. You can now use it for sharing, QR cards, or print.`
      })

      window.setTimeout(() => {
        setCopiedTarget((current) => (current === target ? "" : current))
      }, 1600)
    } catch {
      setFeedback({
        type: "error",
        message: "Clipboard copy failed. Please copy it manually."
      })
    }
  }

  function downloadSvg(svgMarkup, filename) {
    const blob = new Blob([svgMarkup], { type: "image/svg+xml;charset=utf-8" })
    const blobUrl = window.URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = blobUrl
    link.download = filename
    document.body.append(link)
    link.click()
    link.remove()
    window.URL.revokeObjectURL(blobUrl)
  }

  function downloadSingleQr(card) {
    if (!card?.svg) {
      setFeedback({
        type: "warning",
        message: "The QR preview is not ready yet."
      })
      return
    }

    downloadSvg(card.svg, `${activeSlug}-table-${card.tableNumber}-qr.svg`)
    setFeedback({
      type: "success",
      message: `Table ${card.tableNumber} QR downloaded successfully.`
    })
  }

  async function exportQrPdf() {
    if (qrCards.length === 0) {
      setFeedback({
        type: "warning",
        message: "Please generate the QR cards before exporting a PDF."
      })
      return
    }

    const pdf = new jsPDF({
      orientation: "portrait",
      unit: "mm",
      format: "a4"
    })

    const pageWidth = pdf.internal.pageSize.getWidth()
    const pageHeight = pdf.internal.pageSize.getHeight()
    const margin = 10
    const cardGap = 8
    const cardWidth = (pageWidth - margin * 2 - cardGap) / 2
    const cardHeight = 82
    const logoSize = 14

    let x = margin
    let y = margin

    for (let index = 0; index < qrCards.length; index += 1) {
      const card = qrCards[index]

      if (index > 0 && index % 6 === 0) {
        pdf.addPage()
        x = margin
        y = margin
      }

      pdf.setDrawColor(225, 225, 225)
      pdf.setFillColor(255, 252, 246)
      pdf.roundedRect(x, y, cardWidth, cardHeight, 4, 4, "FD")

      pdf.setFillColor(17, 24, 39)
      pdf.roundedRect(x + 5, y + 5, 28, 8, 4, 4, "F")
      pdf.setFont("helvetica", "bold")
      pdf.setFontSize(8)
      pdf.setTextColor(255, 255, 255)
      pdf.text("SCAN TO ORDER", x + 8, y + 10.5)

      pdf.setFontSize(15)
      pdf.setTextColor(17, 24, 39)
      pdf.text(`Table ${card.tableNumber}`, x + cardWidth - 30, y + 11)

      if (logo) {
        try {
          pdf.addImage(logo, "PNG", x + 6, y + 18, logoSize, logoSize)
        } catch {
          // Ignore logo rendering issues in PDF export.
        }
      }

      pdf.setFont("helvetica", "bold")
      pdf.setFontSize(11)
      pdf.setTextColor(146, 64, 14)
      pdf.text(restaurantName || "Restaurant", x + 24, y + 25)

      pdf.setFont("helvetica", "normal")
      pdf.setFontSize(8)
      pdf.setTextColor(107, 114, 128)
      pdf.text(activeSlug || "restaurant", x + 24, y + 31)

      pdf.addImage(card.dataUrl, "PNG", x + 18, y + 35, 44, 44)

      pdf.setFontSize(7)
      pdf.setTextColor(100, 116, 139)
      const pathLines = pdf.splitTextToSize(card.menuPath, cardWidth - 76)
      pdf.text(pathLines, x + 68, y + 48)

      pdf.setFontSize(8)
      pdf.setTextColor(17, 24, 39)
      pdf.text("Scan the QR to open this table's menu.", x + 68, y + 67)

      if ((index + 1) % 2 === 0) {
        x = margin
        y += cardHeight + cardGap
      } else {
        x += cardWidth + cardGap
      }

      if (y + cardHeight > pageHeight - margin && index < qrCards.length - 1) {
        pdf.addPage()
        x = margin
        y = margin
      }
    }

    pdf.save(`${activeSlug || "restaurant"}-table-qr-sheet.pdf`)
    setFeedback({
      type: "success",
      message: "PDF export is ready. You can print it or share it directly."
    })
  }

  function printQrSheet() {
    if (qrCards.length === 0) {
      setFeedback({
        type: "warning",
        message: "Please generate the QR cards before printing."
      })
      return
    }

    window.print()
  }

  if (isLoading) {
    return (
      <div className="dashboard-shell">
        <div className="dashboard-loading-card">Loading dashboard...</div>
      </div>
    )
  }

  return (
    <div className="dashboard-shell">
      <header className="dashboard-topbar">
        <div className="dashboard-topbar-copy">
          <p className="dashboard-eyebrow">Owner Dashboard</p>
          <h1>{restaurant?.restaurantName || "Restaurant Dashboard"}</h1>
          <p className="dashboard-subcopy">
            Subscription: {formatSubscriptionLabel(restaurant?.subscriptionPlan)} plan, status{" "}
            {restaurant?.subscriptionStatus}
          </p>
          <div className="dashboard-slug-pill">
            <span>Your live slug</span>
            <strong>{activeSlug || "not-set"}</strong>
          </div>
        </div>

        <div className="dashboard-top-actions">
          <a href={publicMenuUrl} target="_blank" rel="noreferrer">
            Open Public Menu
          </a>
          <button type="button" onClick={handleLogout}>
            Logout
          </button>
        </div>
      </header>

      <div className={`portal-status ${feedback.type}`}>{feedback.message}</div>

      <section className="dashboard-grid dashboard-grid-top">
        <article className="dashboard-card">
          <div className="dashboard-card-head">
            <div>
              <p className="dashboard-card-kicker">Brand Setup</p>
              <h2>Restaurant Details</h2>
            </div>
          </div>

          <label>
            <span>Restaurant Name</span>
            <input
              value={restaurantName}
              onChange={(event) => setRestaurantName(event.target.value)}
              placeholder="Restaurant display name"
            />
          </label>

          <label>
            <span>Slug / QR Identity</span>
            <input
              value={slug}
              onChange={(event) => setSlug(formatSlug(event.target.value))}
              placeholder="example: foodeez-cafe"
            />
          </label>

          <div className="dashboard-logo-panel">
            <div className="dashboard-upload-head">
              <span>Restaurant Logo</span>
              <label className="dashboard-upload-button">
                Upload Logo
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleLogoUpload}
                />
              </label>
            </div>

            {logo ? (
              <div className="dashboard-logo-preview">
                <img src={logo} alt={restaurantName || "Restaurant logo"} />
                <button
                  type="button"
                  className="dashboard-copy-button"
                  onClick={() => setLogo("")}
                >
                  Remove Logo
                </button>
              </div>
            ) : (
              <div className="dashboard-image-placeholder">
                No logo added yet. Upload one to show your brand on QR cards and printable sheets.
              </div>
            )}
          </div>

          <div className="dashboard-helper-box">
            <strong>How your slug works</strong>
            <p>
              Your slug is the public identity of the restaurant. Your menu link,
              kitchen link, and every table QR code use this slug. If the slug is{" "}
              <code>{activeSlug || "foodeez"}</code>, every guest lands on that
              restaurant's live menu.
            </p>
          </div>

          <label>
            <span>Public Intro</span>
            <textarea
              value={publicDescription}
              onChange={(event) => setPublicDescription(event.target.value)}
              rows={4}
              placeholder="Short copy visible on the QR menu"
            />
          </label>

          <div className="dashboard-link-stack">
            <div className="dashboard-link-row">
              <div>
                <strong>Public Menu Link</strong>
                <p>{publicMenuUrl}</p>
              </div>
              <button
                type="button"
                className="dashboard-copy-button"
                onClick={() => copyValue(publicMenuUrl, "Public menu link")}
              >
                {copiedTarget === "Public menu link" ? "Copied" : "Copy"}
              </button>
            </div>

            <div className="dashboard-link-row">
              <div>
                <strong>Kitchen Board Link</strong>
                <p>{kitchenUrl}</p>
              </div>
              <button
                type="button"
                className="dashboard-copy-button"
                onClick={() => copyValue(kitchenUrl, "Kitchen link")}
              >
                {copiedTarget === "Kitchen link" ? "Copied" : "Copy"}
              </button>
            </div>

            <div className="dashboard-link-row">
              <div>
                <strong>Slug Only</strong>
                <p>{activeSlug}</p>
              </div>
              <button
                type="button"
                className="dashboard-copy-button"
                onClick={() => copyValue(activeSlug, "Slug")}
              >
                {copiedTarget === "Slug" ? "Copied" : "Copy"}
              </button>
            </div>
          </div>

          <div className="dashboard-action-row">
            <button
              type="button"
              className="dashboard-secondary"
              onClick={() => saveRestaurantChanges("details")}
              disabled={isUpdatingDetails}
            >
              {isUpdatingDetails ? "Updating..." : "Update Restaurant Details"}
            </button>
          </div>
        </article>

        <article className="dashboard-card">
          <div className="dashboard-card-head">
            <div>
              <p className="dashboard-card-kicker">Snapshot</p>
              <h2>Quick Overview</h2>
            </div>
          </div>

          <div className="dashboard-stat-grid">
            <div className="dashboard-stat">
              <strong>{menu.length}</strong>
              <span>Total menu items</span>
            </div>

            <div className="dashboard-stat">
              <strong>{menu.filter((item) => item.isAvailable).length}</strong>
              <span>Items live now</span>
            </div>

            <div className="dashboard-stat">
              <strong>{visibleMenu.length}</strong>
              <span>Items in current view</span>
            </div>
          </div>

          <div className="dashboard-usage-panel">
            <strong>How the flow works</strong>
            <p>
              The owner sets a slug. The system then creates a unique
              `restaurant + table` URL for each table. Guests scan the QR, place
              an order, and the backend routes that order to the same
              restaurant's kitchen board.
            </p>
          </div>
        </article>
      </section>

      <section className="dashboard-grid dashboard-grid-mid">
        <article className="dashboard-card dashboard-card-wide">
          <div className="dashboard-card-head">
            <div>
              <p className="dashboard-card-kicker">QR Generator</p>
              <h2>Printable Table QR Generator</h2>
              <p className="dashboard-muted-copy">
                Generate local QR codes for your table count. Every card includes
                the table number clearly so it is ready to print and place on the table.
              </p>
            </div>
          </div>

          <div className="dashboard-qr-layout">
            <div className="dashboard-qr-panel">
              <div className="dashboard-qr-controls">
                <label>
                  <span>Start Table</span>
                  <input
                    type="number"
                    min="1"
                    value={qrStartTable}
                    onChange={(event) =>
                      setQrStartTable(Math.max(1, Number(event.target.value) || 1))
                    }
                  />
                </label>

                <label>
                  <span>Total Tables</span>
                  <input
                    type="number"
                    min="1"
                    max="100"
                    value={qrTableCount}
                    onChange={(event) =>
                      setQrTableCount(
                        Math.min(100, Math.max(1, Number(event.target.value) || 1))
                      )
                    }
                  />
                </label>
              </div>

              <div className="dashboard-helper-box">
                <strong>Which URL will this QR open?</strong>
                <p>
                  Example current preview:{" "}
                  {previewQrCard?.fullUrl || "Save your slug and the live menu link will appear here."}
                </p>
              </div>

              <div className="dashboard-qr-actions">
                <button
                  type="button"
                  className="dashboard-copy-button"
                  onClick={() =>
                    copyValue(previewQrCard?.fullUrl || "", "QR menu link")
                  }
                >
                  {copiedTarget === "QR menu link" ? "Copied" : "Copy Preview Link"}
                </button>

                <button
                  type="button"
                  className="dashboard-copy-button"
                  onClick={() => previewQrCard && downloadSingleQr(previewQrCard)}
                >
                  Download Preview QR
                </button>

                <button
                  type="button"
                  className="dashboard-add-button"
                  onClick={printQrSheet}
                >
                  Print QR Sheet
                </button>

                <button
                  type="button"
                  className="dashboard-add-button dashboard-pdf-button"
                  onClick={exportQrPdf}
                >
                  Export PDF
                </button>
              </div>
            </div>

            <div className="dashboard-qr-preview">
              {isQrLoading ? (
                <div className="dashboard-qr-empty">Generating local QR preview...</div>
              ) : previewQrCard ? (
                <>
                  <div
                    className="dashboard-qr-svg"
                    dangerouslySetInnerHTML={{ __html: previewQrCard.svg }}
                  />
                  <p>
                    Table {previewQrCard.tableNumber} preview for{" "}
                    <strong>{activeSlug}</strong>
                  </p>
                </>
              ) : (
                <div className="dashboard-qr-empty">
                  Save your slug and the QR preview will appear here.
                </div>
              )}
            </div>
          </div>

          <div className="dashboard-print-header">
            <h3>{restaurantName || "Restaurant"} Table QR Sheet</h3>
            <p>
              These cards are designed for direct printing as table stickers or tent cards.
            </p>
          </div>

          <div className="dashboard-qr-sheet">
            {qrCards.map((card) => (
              <article key={`qr-${card.tableNumber}`} className="dashboard-qr-card">
                <div className="dashboard-qr-card-top">
                  <span className="dashboard-qr-card-label">Scan To Order</span>
                  <strong>Table {card.tableNumber}</strong>
                </div>

                <div className="dashboard-qr-card-brand">
                  <div className="dashboard-qr-card-brand-top">
                    {logo ? (
                      <img
                        src={logo}
                        alt={restaurantName || "Restaurant logo"}
                        className="dashboard-qr-card-logo"
                      />
                    ) : null}
                    <div>
                      <h4>{restaurantName || "Restaurant"}</h4>
                      <p>{activeSlug}</p>
                    </div>
                  </div>
                </div>

                <div
                  className="dashboard-qr-card-svg"
                  dangerouslySetInnerHTML={{ __html: card.svg }}
                />

                <p className="dashboard-qr-card-link">{card.menuPath}</p>

                <button
                  type="button"
                  className="dashboard-copy-button dashboard-qr-download"
                  onClick={() => downloadSingleQr(card)}
                >
                  Download Table {card.tableNumber}
                </button>
              </article>
            ))}
          </div>
        </article>
      </section>

      <section className="dashboard-card dashboard-card-wide">
        <div className="dashboard-section-head">
          <div>
            <p className="dashboard-card-kicker">Menu Control</p>
            <h2>Menu Editor</h2>
            <p className="dashboard-muted-copy">
              Add dishes, upload item images, search quickly, and control what
              shows on the public menu.
            </p>
          </div>

          <button
            type="button"
            className="dashboard-add-button"
            onClick={addMenuItem}
          >
            + Add Menu Item
          </button>
        </div>

        <div className="dashboard-toolbar">
          <label>
            <span>Search</span>
            <input
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Search by dish, category, ingredient"
            />
          </label>

          <label>
            <span>Visibility</span>
            <select
              value={availabilityFilter}
              onChange={(event) => setAvailabilityFilter(event.target.value)}
            >
              <option value="all">All Items</option>
              <option value="live">Live Only</option>
              <option value="hidden">Hidden Only</option>
            </select>
          </label>

          <label>
            <span>Sort</span>
            <select
              value={sortBy}
              onChange={(event) => setSortBy(event.target.value)}
            >
              <option value="latest">Latest Added</option>
              <option value="name-asc">Name A-Z</option>
              <option value="price-low">Price Low to High</option>
              <option value="price-high">Price High to Low</option>
              <option value="category">Category</option>
            </select>
          </label>

          <button
            type="button"
            className="dashboard-toolbar-reset"
            onClick={clearMenuFilters}
          >
            Reset Filters
          </button>
        </div>

        <div className="dashboard-menu-list">
          {visibleMenu.length === 0 && (
            <div className="dashboard-empty-results">
              No menu items matched the current filters.
            </div>
          )}

          {visibleMenu.map((item, index) => (
            <article key={item.itemId} className="dashboard-menu-card">
              <div className="dashboard-menu-head">
                <div className="dashboard-menu-title-wrap">
                  <strong>Item {index + 1}</strong>
                  <span>
                    {item.isAvailable ? "Live on menu" : "Hidden from menu"}
                  </span>
                </div>

                <button
                  type="button"
                  className="dashboard-remove"
                  onClick={() => removeMenuItem(item.itemId)}
                >
                  Remove
                </button>
              </div>

              <div className="dashboard-menu-grid">
                <label>
                  <span>Name</span>
                  <input
                    value={item.name}
                    onChange={(event) =>
                      updateMenuItem(item.itemId, "name", event.target.value)
                    }
                    placeholder="Dish name"
                  />
                </label>

                <label>
                  <span>Price</span>
                  <input
                    type="number"
                    min="0"
                    value={item.price}
                    onChange={(event) =>
                      updateMenuItem(item.itemId, "price", event.target.value)
                    }
                    placeholder="0"
                  />
                </label>

                <label>
                  <span>Category</span>
                  <input
                    value={item.category}
                    onChange={(event) =>
                      updateMenuItem(item.itemId, "category", event.target.value)
                    }
                    placeholder="Example: Mocktails"
                  />
                </label>

                <label>
                  <span>Image URL</span>
                  <input
                    value={item.image}
                    onChange={(event) =>
                      updateMenuItem(item.itemId, "image", event.target.value)
                    }
                    placeholder="https://... or upload below"
                  />
                </label>

                <label className="dashboard-full-width">
                  <span>Ingredients</span>
                  <input
                    value={item.ingredients}
                    onChange={(event) =>
                      updateMenuItem(item.itemId, "ingredients", event.target.value)
                    }
                    placeholder="Paneer, Butter, Onion, Tomato"
                  />
                </label>

                <div className="dashboard-full-width dashboard-image-uploader">
                  <div className="dashboard-upload-head">
                    <span>Menu Item Image</span>
                    <label className="dashboard-upload-button">
                      Upload Image
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(event) => handleImageUpload(item.itemId, event)}
                      />
                    </label>
                  </div>

                  {item.image ? (
                    <div className="dashboard-image-preview">
                      <img src={item.image} alt={item.name || "Menu preview"} />
                      <button
                        type="button"
                        className="dashboard-copy-button"
                        onClick={() => updateMenuItem(item.itemId, "image", "")}
                      >
                        Remove Image
                      </button>
                    </div>
                  ) : (
                    <div className="dashboard-image-placeholder">
                      No image selected yet.
                    </div>
                  )}
                </div>

                <label className="dashboard-checkbox">
                  <input
                    type="checkbox"
                    checked={item.isAvailable}
                    onChange={(event) =>
                      updateMenuItem(item.itemId, "isAvailable", event.target.checked)
                    }
                  />
                  <span>Available on public menu</span>
                </label>
              </div>
            </article>
          ))}
        </div>

        <div className="dashboard-save-bar">
          <button
            type="button"
            className="portal-submit"
            onClick={saveRestaurantChanges}
            disabled={isSaving}
          >
            {isSaving ? "Saving..." : "Save Restaurant & Menu"}
          </button>
        </div>
      </section>
    </div>
  )
}

export default RestaurantDashboard
