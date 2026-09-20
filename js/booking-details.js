const BOOKING_DETAIL_BRANDS = Object.freeze({
  Toyota: "/public/assets/vehicle-brands/toyota.svg",
  Kia: "/public/assets/vehicle-brands/kia.svg",
  Hyundai: "/public/assets/vehicle-brands/hyundai.svg",
  Mercedes: "/public/assets/vehicle-brands/mercedes.svg",
  Ford: "/public/assets/vehicle-brands/ford.svg",
  Lexus: "/public/assets/vehicle-brands/Lexus.svg",
  Nissan: "/public/assets/vehicle-brands/nissan.svg",
  Chevrolet: "/public/assets/vehicle-brands/chevrolet.svg",
});
let bookingDetailsRoot = null;
let bookingDetailsRoute = null;
let bookingDetailsEventsRoot = null;
function bookingDetailEscape(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
function bookingDetailRouteId() {
  const query = String(window.location.hash).split("?")[1] || "";
  return new URLSearchParams(query).get("id");
}
function bookingDetailSet(selector, value) {
  const element = bookingDetailsRoot?.querySelector(selector);
  if (element) element.textContent = value ?? "—";
}
function bookingDetailBrand(vehicle) {
  return Object.keys(BOOKING_DETAIL_BRANDS).find((brand) =>
    vehicle.startsWith(brand),
  );
}
function bookingDetailDateParts(value) {
  const text = String(value ?? "—");
  if (text === "-" || text === "—") return { date: text, time: "" };
  const [date, time = ""] = text.split(", ");
  return {
    date: /\b202\d\b/.test(date) ? date : `${date} 2024`,
    time,
  };
}
function bookingDetailHasValue(value) {
  return value !== undefined && value !== null && value !== "" && value !== "-";
}
function bookingDetailEventValue(booking, ...keys) {
  for (const key of keys) {
    if (bookingDetailHasValue(booking[key])) return booking[key];
  }
  return null;
}
function normalizeBookingStatus(status) {
  const normalizedStatus = String(status || "")
    .trim()
    .toLowerCase();
  if (normalizedStatus === "active" || normalizedStatus === "ongoing")
    return "active";
  if (
    normalizedStatus === "upcoming" ||
    normalizedStatus === "expected" ||
    normalizedStatus === "scheduled"
  )
    return "upcoming";
  if (normalizedStatus === "completed") return "completed";
  if (normalizedStatus === "cancelled" || normalizedStatus === "canceled")
    return "cancelled";
  return "upcoming";
}
function resolveBookingTimeline(booking) {
  const status = normalizeBookingStatus(booking.status);
  const confirmedAt = bookingDetailEventValue(
    booking,
    "confirmedAt",
    "confirmationAt",
    "confirmed",
  );
  const driverAssignedAt = bookingDetailEventValue(
    booking,
    "driverAssignedAt",
    "assignedAt",
    "driverAssigned",
  );
  const parkedAt = bookingDetailEventValue(
    booking,
    "parkedAt",
    "vehicleParkedAt",
    "parked",
  );
  const checkoutAt = bookingDetailEventValue(
    booking,
    "checkoutAt",
    "completedAt",
    "checkedOutAt",
  );
  const cancelledAt = bookingDetailEventValue(
    booking,
    "cancelledAt",
    "canceledAt",
  );
  const driverName = bookingDetailEventValue(
    booking,
    "driverName",
    "assignedDriver",
    "driver",
  );
  const hasDriver = Boolean(driverAssignedAt || driverName);
  const hasConfirmation = Boolean(confirmedAt);
  const hasCheckout = Boolean(checkoutAt);
  const hasParked = Boolean(parkedAt);
  const activeStatus = status === "active";
  const upcomingStatus = status === "upcoming";
  const steps = [
    {
      key: "created",
      title: "Booking Created",
      timestamp: booking.created,
      meta: booking.source ? `From ${booking.source}` : "",
    },
    {
      key: "confirmed",
      title: "Confirmed",
      timestamp: confirmedAt || "—",
      meta: "System",
    },
    {
      key: "driverAssigned",
      title: "Driver Assigned",
      timestamp: driverAssignedAt || "—",
      meta: driverName ? `Driver: ${driverName}` : "",
    },
    {
      key: "parked",
      title: "Vehicle Parked",
      timestamp: parkedAt || "—",
      meta: booking.zone ? `At ${booking.zone}` : "",
    },
    {
      key: "checkout",
      title: "Expected Checkout",
      timestamp: booking.end === "-" ? "—" : booking.end || "—",
      meta: "",
    },
  ];
  const buildActiveTimeline = () =>
    steps.map((step) => ({
      ...step,
      state:
        step.key === "parked"
          ? "current"
          : step.key === "checkout"
            ? "future"
            : "completed",
    }));

  const buildUpcomingTimeline = () => {
    const currentKey = hasParked
      ? "parked"
      : hasDriver
        ? "driverAssigned"
        : "confirmed";
    const progression = ["created", "confirmed", "driverAssigned", "parked"];
    const currentIndex = progression.indexOf(currentKey);
    return steps.map((step) => {
      const stepIndex = progression.indexOf(step.key);
      return {
        ...step,
        state:
          step.key === currentKey
            ? "current"
            : stepIndex >= 0 && stepIndex < currentIndex
              ? "completed"
              : "future",
      };
    });
  };

  const buildCompletedTimeline = () => {
    const completedSteps = steps.map((step) => ({ ...step, state: "completed" }));
    completedSteps[4].title = "Checked Out";
    completedSteps[4].timestamp = checkoutAt || completedSteps[4].timestamp;
    return completedSteps;
  };

  const buildCancelledTimeline = () => {
    const history = [steps[0]];
    if (hasConfirmation) history.push(steps[1]);
    if (hasDriver) history.push(steps[2]);
    if (hasParked) history.push(steps[3]);
    history.push({
      key: "cancelled",
      title: "Cancelled",
      timestamp: cancelledAt || "—",
      meta: booking.cancellationReason || "Booking cancelled",
      state: "cancelled",
    });
    return history.map((step, index) => ({
      ...step,
      state: index === history.length - 1 ? "cancelled" : "completed",
    }));
  };

  if (status === "cancelled" || cancelledAt) return buildCancelledTimeline();
  switch (status) {
    case "completed":
      return buildCompletedTimeline();
    case "active":
      return hasCheckout ? buildCompletedTimeline() : buildActiveTimeline();
    case "upcoming":
      return hasCheckout ? buildCompletedTimeline() : buildUpcomingTimeline();
    default:
      return hasParked ? buildActiveTimeline() : buildUpcomingTimeline();
  }
}
function bookingDetailTimeline(booking) {
  return resolveBookingTimeline(booking)
    .map((step) => {
      const marker =
        step.state === "completed"
          ? ""
          : step.state === "current"
            ? '<i class="booking-timeline-current-dot" aria-hidden="true"></i>'
            : step.state === "cancelled"
              ? '<i class="fa-solid fa-xmark" aria-hidden="true"></i>'
              : "";
      return `<li class="is-${step.state}"><span class="booking-timeline-marker">${marker}</span><div><strong>${bookingDetailEscape(step.title)}</strong><span>${bookingDetailEscape(step.timestamp)}</span>${step.meta ? `<small>${bookingDetailEscape(step.meta)}</small>` : ""}</div></li>`;
    })
    .join("");
}
function showBookingDetailNotice(message) {
  window.showDashboardAlert?.(message, {
    title: "Booking Details",
    type: "info",
  });
}
function renderBookingReceiptAction(root, booking) {
  const actions = root.querySelector(".booking-details-actions");
  const existing = actions?.querySelector("[data-booking-print]");
  existing?.remove();
  if (!actions || !booking || normalizeBookingStatus(booking.status) !== "completed")
    return;
  const button = document.createElement("button");
  button.type = "button";
  button.dataset.bookingPrint = "true";
  button.setAttribute("aria-label", "Open booking receipt");
  button.title = "Receipt";
  button.innerHTML = '<i class="fa-solid fa-print" aria-hidden="true"></i>';
  button.addEventListener("click", () => {
    window.location.hash = `#booking-receipt?id=${encodeURIComponent(booking.id)}`;
  });
  const shareButton = actions.querySelector("[data-booking-share]");
  actions.insertBefore(button, shareButton || null);
}
function initializeBookingDetailsPage() {
  const root = document.querySelector(".booking-details-page");
  const routeId = bookingDetailRouteId();
  if (!root || (bookingDetailsRoot === root && bookingDetailsRoute === routeId))
    return;
  bookingDetailsRoot = root;
  bookingDetailsRoute = routeId;
  const booking = window.getBookingDemoById?.(routeId);
  const content = root.querySelector("[data-booking-content]");
  const notFound = root.querySelector("[data-booking-not-found]");
  renderBookingReceiptAction(root, booking);
  if (!booking) {
    content?.classList.add("hidden");
    notFound?.classList.remove("hidden");
  } else {
    bookingDetailSet("[data-booking-id]", booking.id);
    bookingDetailSet("[data-booking-customer]", booking.customer);
    bookingDetailSet("[data-booking-phone]", booking.phone);
    bookingDetailSet("[data-booking-summary-status]", booking.status);
    bookingDetailSet(
      "[data-booking-summary-source]",
      `Booked via ${booking.source}`,
    );
    const bookingDate = bookingDetailDateParts(booking.created);
    const bookingStart = bookingDetailDateParts(booking.start);
    const bookingEnd = bookingDetailDateParts(booking.end);
    bookingDetailSet("[data-booking-date]", bookingDate.date);
    bookingDetailSet("[data-booking-date-time]", bookingDate.time);
    bookingDetailSet("[data-booking-start]", bookingStart.date);
    bookingDetailSet("[data-booking-start-time]", bookingStart.time);
    bookingDetailSet("[data-booking-end]", bookingEnd.date);
    bookingDetailSet("[data-booking-end-time]", bookingEnd.time);
    bookingDetailSet("[data-booking-duration]", booking.duration);
    bookingDetailSet("[data-booking-vehicle]", booking.vehicle);
    bookingDetailSet(
      "[data-booking-vehicle-meta]",
      `${booking.vehicle.slice(0, booking.vehicle.indexOf(" "))} ${booking.vehicle.includes(" ") ? booking.vehicle.slice(booking.vehicle.indexOf(" ") + 1) : ""} • ${booking.color}`,
    );
    bookingDetailSet("[data-booking-plate]", booking.plate);
    bookingDetailSet("[data-booking-zone]", booking.zone);
    bookingDetailSet("[data-booking-location]", booking.location);
    bookingDetailSet("[data-booking-zone-route]", booking.zone);
    bookingDetailSet("[data-booking-location-route]", booking.location);
    bookingDetailSet("[data-booking-source]", booking.source);
    bookingDetailSet("[data-booking-created]", booking.created);
    const initials = booking.customer
      .split(/\s+/)
      .map((part) => part[0])
      .join("")
      .slice(0, 2)
      .toUpperCase();
    bookingDetailSet("[data-booking-customer-initials]", initials);
    const brand = bookingDetailBrand(booking.vehicle);
    const logo = root.querySelector("[data-booking-vehicle-logo]");
    if (logo && brand) {
      logo.src = BOOKING_DETAIL_BRANDS[brand];
      logo.alt = brand;
    }
    const brandLogo = root.querySelector("[data-booking-vehicle-brand]");
    if (brandLogo && brand) {
      brandLogo.src = BOOKING_DETAIL_BRANDS[brand];
      brandLogo.alt = brand;
    }
    root.querySelector("[data-booking-summary-status]").className =
      `booking-status-detail ${booking.status.toLowerCase()}`;
    root.querySelector("[data-booking-summary-source]").innerHTML =
      `<i class="fa-solid ${booking.source === "Customer App" ? "fa-mobile-screen-button" : "fa-car"}" aria-hidden="true"></i> Booked via ${bookingDetailEscape(booking.source)}`;
    root.querySelector("[data-booking-timeline]").innerHTML =
      bookingDetailTimeline(booking);
  }
  if (bookingDetailsEventsRoot !== root) {
    root.querySelectorAll("[data-booking-back]").forEach((button) =>
      button.addEventListener("click", () => {
        window.location.hash = "#bookings";
      }),
    );
    root
      .querySelector("[data-booking-share]")
      ?.addEventListener("click", async () => {
      try {
        if (navigator.share)
          await navigator.share({
            title: "Booking Details",
            url: window.location.href,
          });
        else {
          await navigator.clipboard.writeText(window.location.href);
          showBookingDetailNotice("Booking link copied.");
        }
      } catch (error) {
        if (error?.name !== "AbortError")
          showBookingDetailNotice("Unable to share booking link.");
      }
      });
    root
      .querySelector("[data-booking-copy-id]")
      ?.addEventListener("click", async () => {
        await navigator.clipboard?.writeText(booking?.id || "");
        showBookingDetailNotice("Booking ID copied.");
      });
    root
      .querySelector("[data-booking-copy-plate]")
      ?.addEventListener("click", async () => {
        await navigator.clipboard?.writeText(booking?.plate || "");
        showBookingDetailNotice("Plate number copied.");
      });
    root
      .querySelector("[data-booking-map]")
      ?.addEventListener("click", () =>
        showBookingDetailNotice("Map view will be connected in a future phase."),
      );
    bookingDetailsEventsRoot = root;
  }
}
async function loadBookingDetailsPage() {
  const container = document.querySelector("#booking-details-container");
  if (!container) return;
  if (
    container.dataset.loaded !== "true" ||
    !container.querySelector(".booking-details-page")
  ) {
    bookingDetailsRoot = null;
    bookingDetailsRoute = null;
    bookingDetailsEventsRoot = null;
    const response = await fetch("/pages/booking-details.html");
    if (!response.ok)
      throw new Error(
        `Unable to load Booking Details page: ${response.status}`,
      );
    container.innerHTML = await response.text();
    container.dataset.loaded = "true";
  }
  initializeBookingDetailsPage();
}
