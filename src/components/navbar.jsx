import { Link } from "react-router-dom"
import { buildStatusUrl } from "../utils/restaurant"

function Navbar({ tableNumber, restaurantName, restaurantSlug, description }) {
  return (
    <nav className="navbar">
      <div className="nav-top">
        <div className="nav-left">
          <div className="nav-brand-copy">
            <h2>{restaurantName || "Foodie"}</h2>
            <span>{restaurantSlug}</span>
          </div>
        </div>

        <div className="nav-center">
          <span className="table-badge">Table {tableNumber}</span>
        </div>

        <div className="nav-right">
          <div className="nav-links">
            <Link to="/portal">Owner Login</Link>
            <a href="#menu-start">Browse Menu</a>
          </div>
        </div>
      </div>

      <div className="nav-bottom">
        <div className="nav-bottom-copy">
          <p>Restaurant Menu</p>
          <span>{description}</span>
        </div>

        <Link
          to={buildStatusUrl(restaurantSlug, tableNumber)}
          className="nav-status-icon-link"
          aria-label={`Track order for table ${tableNumber}`}
          title="Track Order"
        >
          <span className="nav-status-icon" aria-hidden="true">
            <span className="nav-status-icon-ring" />
            <span className="nav-status-icon-dot" />
          </span>
        </Link>
      </div>
    </nav>
  )
}

export default Navbar
