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

const BOOKING_DETAILS_SYNC_INTERVAL_MS = 3000;
const BOOKING_DETAILS_FEEDBACK_SYNC_INTERVAL_MS = 10000;
const BOOKING_DETAILS_FEEDBACK_WINDOW_MS =
  7 * 24 * 60 * 60 * 1000;

let bookingDetailsSyncTimer = null;
let bookingDetailsSyncIntervalMs = null;
let bookingDetailsSyncInFlight = false;
let bookingDetailsLastFingerprint = null;
let bookingDetailsLiveEventsBound = false;
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
    completedSteps[4].title = "Collected";
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

function getBookingDetailsApiBaseUrl() {
  return (
    window.PARKIN_CONFIG?.userManagementApiBaseUrl ||
    window.PARKIN_CONFIG?.apiBaseUrl ||
    "https://api.parkin.com.sa"
  );
}

function bookingDetailFormatApiDateTime(value) {
  if (!value) return null;

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  try {
    const datePart = new Intl.DateTimeFormat("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      timeZone: "Asia/Riyadh",
    }).format(date);

    const timePart = new Intl.DateTimeFormat("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
      timeZone: "Asia/Riyadh",
    }).format(date);

    return `${datePart}, ${timePart}`;
  } catch {
    return date.toISOString();
  }
}

async function updateBookingWorkflowApi(
  booking,
  actionPath,
) {
  const token = localStorage.getItem(
    "parkin_access_token",
  );

  if (!token) {
    throw new Error(
      "Your dashboard session has expired. Please sign in again.",
    );
  }

  const identifier =
    booking?.databaseId ||
    booking?.id;

  if (!identifier) {
    throw new Error(
      "Booking identifier is not available.",
    );
  }

  const response = await fetch(
    `${getBookingDetailsApiBaseUrl()}/bookings/${encodeURIComponent(identifier)}/${actionPath}`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  );

  const payload = await response
    .json()
    .catch(() => null);

  if (!response.ok) {
    const message = Array.isArray(payload?.message)
      ? payload.message.join("\n")
      : payload?.message;

    throw new Error(
      message ||
        `Unable to update booking (${response.status}).`,
    );
  }

  return payload?.data ?? payload;
}

function bookingWorkflowActionConfig(rawStatus) {
  switch (rawStatus) {
    case "RETURN_REQUESTED":
      return {
        actionPath: "start-retrieval",
        label: "Start Retrieval",
        icon: "fa-play",
        confirmTitle: "Start vehicle retrieval?",
        confirmMessage:
          "This confirms that valet retrieval has begun.",
      };

    case "RETRIEVAL_IN_PROGRESS":
      return {
        actionPath: "ready-for-handover",
        label: "Ready for Handover",
        icon: "fa-car-side",
        confirmTitle:
          "Mark vehicle ready for handover?",
        confirmMessage:
          "This confirms that the vehicle is ready to be handed back to the customer.",
      };

    case "READY_FOR_HANDOVER":
      return {
        actionPath: "collect",
        label: "Mark as Collected",
        icon: "fa-circle-check",
        confirmTitle:
          "Mark vehicle as collected?",
        confirmMessage:
          "This confirms that the vehicle has been handed over to the customer.",
      };

    default:
      return null;
  }
}

function bookingWorkflowSuccessMessage(
  actionPath,
  result,
) {
  switch (actionPath) {
    case "start-retrieval":
      return result?.alreadyStarted
        ? "Vehicle retrieval is already in progress."
        : "Vehicle retrieval started successfully.";

    case "ready-for-handover":
      return result?.alreadyReady
        ? "Vehicle is already ready for handover."
        : "Vehicle marked ready for handover.";

    case "collect":
      return result?.alreadyCollected
        ? "Booking is already marked as collected."
        : "Vehicle marked as collected successfully.";

    default:
      return "Booking updated successfully.";
  }
}

function applyBookingWorkflowResult(
  root,
  booking,
  result,
) {
  const nextStatus =
    result?.status ||
    booking.rawStatus;

  booking.rawStatus = nextStatus;

  if (
    nextStatus ===
    "RETRIEVAL_IN_PROGRESS"
  ) {
    booking.status = "Active";

    if (result?.retrievalStartedAt) {
      booking.retrievalStartedAt =
        bookingDetailFormatApiDateTime(
          result.retrievalStartedAt,
        );
    }
  }

  if (
    nextStatus ===
    "READY_FOR_HANDOVER"
  ) {
    booking.status = "Active";

    if (result?.readyForHandoverAt) {
      booking.readyForHandoverAt =
        bookingDetailFormatApiDateTime(
          result.readyForHandoverAt,
        );
    }
  }

  if (nextStatus === "COMPLETED") {
    booking.status = "Completed";

    if (result?.completedAt) {
      booking.completedAt =
        bookingDetailFormatApiDateTime(
          result.completedAt,
        );
    }
  }

  bookingDetailSet(
    "[data-booking-summary-status]",
    nextStatus === "COMPLETED"
      ? "Collected"
      : booking.status,
  );

  const statusElement = root.querySelector(
    "[data-booking-summary-status]",
  );

  if (statusElement) {
    statusElement.className =
      `booking-status-detail ${normalizeBookingStatus(booking.status)}`;
  }

  const timeline = root.querySelector(
    "[data-booking-timeline]",
  );

  if (timeline) {
    timeline.innerHTML =
      bookingDetailTimeline(booking);
  }

  renderBookingReceiptAction(
    root,
    booking,
  );

  renderBookingWorkflowAction(
    root,
    booking,
  );
}

function renderBookingWorkflowAction(
  root,
  booking,
) {
  const actions = root.querySelector(
    ".booking-details-actions",
  );

  const existing = actions?.querySelector(
    "[data-booking-workflow]",
  );

  existing?.remove();

  if (!actions || !booking) {
    return;
  }

  const config =
    bookingWorkflowActionConfig(
      booking.rawStatus,
    );

  if (!config) {
    return;
  }

  const button =
    document.createElement("button");

  button.type = "button";
  button.className =
    "booking-workflow-action";

  button.dataset.bookingWorkflow =
    config.actionPath;

  button.innerHTML =
    `<i class="fa-solid ${config.icon}" aria-hidden="true"></i>` +
    `<span>${bookingDetailEscape(config.label)}</span>`;

  const shareButton = actions.querySelector(
    "[data-booking-share]",
  );

  actions.insertBefore(
    button,
    shareButton || null,
  );

  button.addEventListener(
    "click",
    async () => {
      if (button.disabled) return;

      const bookingReference =
        booking.plate &&
        booking.plate !== "—"
          ? booking.plate
          : booking.id;

      const confirmed =
        window.confirm(
          `${config.confirmTitle}\n\n${bookingReference}\n\n${config.confirmMessage}`,
        );

      if (!confirmed) return;

      const originalHtml =
        button.innerHTML;

      button.disabled = true;

      button.innerHTML =
        '<i class="fa-solid fa-spinner fa-spin" aria-hidden="true"></i>' +
        "<span>Updating...</span>";

      try {
        const result =
          await updateBookingWorkflowApi(
            booking,
            config.actionPath,
          );

        applyBookingWorkflowResult(
          root,
          booking,
          result,
        );

        showBookingDetailNotice(
          bookingWorkflowSuccessMessage(
            config.actionPath,
            result,
          ),
        );
      } catch (error) {
        button.disabled = false;
        button.innerHTML =
          originalHtml;

        showBookingDetailNotice(
          error?.message ||
            "Unable to update the booking.",
        );
      }
    },
  );
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
function bookingFeedbackWindowIsActive(
  booking,
) {
  if (!booking?.completedAtIso) {
    return false;
  }

  const completedAt = new Date(
    booking.completedAtIso,
  );

  if (
    Number.isNaN(
      completedAt.getTime(),
    )
  ) {
    return false;
  }

  return (
    completedAt.getTime() +
      BOOKING_DETAILS_FEEDBACK_WINDOW_MS >
    Date.now()
  );
}

function renderBookingCustomerFeedback(
  root,
  booking,
) {
  const card = root.querySelector(
    "[data-booking-feedback-card]",
  );

  if (!card) return;

  const isCompleted =
    String(
      booking?.rawStatus || "",
    ).toUpperCase() === "COMPLETED";

  card.classList.toggle(
    "hidden",
    !isCompleted,
  );

  if (!isCompleted) {
    return;
  }

  const stars = card.querySelector(
    "[data-booking-feedback-stars]",
  );

  const score = card.querySelector(
    "[data-booking-feedback-score]",
  );

  const state = card.querySelector(
    "[data-booking-feedback-state]",
  );

  const comment = card.querySelector(
    "[data-booking-feedback-comment]",
  );

  const submitted = card.querySelector(
    "[data-booking-feedback-submitted]",
  );

  const source = card.querySelector(
    "[data-booking-feedback-source]",
  );

  const rating =
    Number.isInteger(
      booking?.customerRating,
    ) &&
    booking.customerRating >= 1 &&
    booking.customerRating <= 5
      ? booking.customerRating
      : null;

  const hasSubmittedFeedback =
    Boolean(
      booking?.feedbackSubmittedAt,
    ) &&
    rating !== null;

  if (!hasSubmittedFeedback) {
    const feedbackWindowActive =
      bookingFeedbackWindowIsActive(
        booking,
      );

    if (stars) {
      stars.textContent = "☆☆☆☆☆";
      stars.setAttribute(
        "aria-label",
        "No customer rating submitted",
      );
    }

    if (score) {
      score.textContent = "Not rated";
    }

    if (state) {
      state.textContent =
        feedbackWindowActive
          ? "Awaiting feedback"
          : "No feedback submitted";

      state.classList.remove(
        "is-submitted",
      );
    }

    if (comment) {
      comment.textContent =
        feedbackWindowActive
          ? "Customer can still submit feedback from the secure vehicle-return link."
          : "The feedback period ended without a customer review.";

      comment.classList.add(
        "is-empty",
      );
    }

    if (submitted) {
      submitted.textContent = "—";
    }

    if (source) {
      source.textContent =
        "Customer Return Link";
    }

    return;
  }

  if (stars) {
    stars.textContent =
      "★".repeat(rating) +
      "☆".repeat(5 - rating);

    stars.setAttribute(
      "aria-label",
      `${rating} out of 5 stars`,
    );
  }

  if (score) {
    score.textContent =
      `${rating}.0 / 5`;
  }

  if (state) {
    state.textContent = "Submitted";
    state.classList.add(
      "is-submitted",
    );
  }

  if (comment) {
    comment.classList.remove(
      "is-empty",
    );

    comment.textContent =
      booking.customerFeedback ||
      "No written comment provided.";
  }

  if (submitted) {
    submitted.textContent =
      booking.feedbackSubmittedAt ||
      "—";
  }

  if (source) {
    source.textContent =
      "Customer Return Link";
  }
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
  renderBookingWorkflowAction(root, booking);
  renderBookingCustomerFeedback(root, booking);
  if (!booking) {
    content?.classList.add("hidden");
    notFound?.classList.remove("hidden");
  } else {
    bookingDetailSet("[data-booking-id]", booking.id);
    bookingDetailSet("[data-booking-customer]", booking.customer);
    bookingDetailSet("[data-booking-phone]", booking.phone);
    bookingDetailSet(
      "[data-booking-summary-status]",
      booking.status === "Completed"
        ? "Collected"
        : booking.status,
    );
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
      `booking-status-detail ${normalizeBookingStatus(booking.status)}`;
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

function bookingDetailsRouteIsActive() {
  return String(
    window.location.hash || "",
  ).startsWith("#booking-details");
}

function bookingDetailsFingerprint(
  booking,
) {
  if (!booking) return "";

  return [
    booking.databaseId,
    booking.rawStatus,
    booking.status,
    booking.returnRequestedAt,
    booking.retrievalStartedAt,
    booking.readyForHandoverAt,
    booking.completedAt,
    booking.completedAtIso,
    booking.cancelledAt,
    booking.customerRating,
    booking.customerFeedback,
    booking.feedbackSubmittedAt,
  ]
    .map((value) => value ?? "")
    .join("|");
}

function scheduleBookingDetailsLiveSync(
  intervalMs,
) {
  if (!bookingDetailsRouteIsActive()) {
    return;
  }

  if (
    bookingDetailsSyncTimer &&
    bookingDetailsSyncIntervalMs ===
      intervalMs
  ) {
    return;
  }

  if (bookingDetailsSyncTimer) {
    window.clearInterval(
      bookingDetailsSyncTimer,
    );
  }

  bookingDetailsSyncIntervalMs =
    intervalMs;

  bookingDetailsSyncTimer =
    window.setInterval(() => {
      void refreshBookingDetailsLive();
    }, intervalMs);
}

function stopBookingDetailsLiveSync() {
  if (bookingDetailsSyncTimer) {
    window.clearInterval(
      bookingDetailsSyncTimer,
    );
    bookingDetailsSyncTimer = null;
  }

  bookingDetailsSyncIntervalMs = null;
  bookingDetailsSyncInFlight = false;
}

async function refreshBookingDetailsLive({
  force = false,
} = {}) {
  if (
    bookingDetailsSyncInFlight ||
    document.hidden
  ) {
    return;
  }

  if (!bookingDetailsRouteIsActive()) {
    stopBookingDetailsLiveSync();
    return;
  }

  const root = document.querySelector(
    ".booking-details-page",
  );

  const routeId =
    bookingDetailRouteId();

  if (
    !root ||
    !routeId ||
    typeof window.refreshBookingByIdFromApi !==
      "function"
  ) {
    return;
  }

  bookingDetailsSyncInFlight = true;

  try {
    const booking =
      await window.refreshBookingByIdFromApi(
        routeId,
      );

    const fingerprint =
      bookingDetailsFingerprint(booking);

    if (
      force ||
      fingerprint !==
        bookingDetailsLastFingerprint
    ) {
      bookingDetailsLastFingerprint =
        fingerprint;

      // Allow normal renderer to execute again.
      // Keep bookingDetailsEventsRoot intact so
      // click handlers are not duplicated.
      bookingDetailsRoot = null;
      bookingDetailsRoute = null;

      initializeBookingDetailsPage();
    }

    const rawStatus = String(
      booking?.rawStatus || "",
    ).toUpperCase();

    if (
      rawStatus === "CANCELLED" ||
      rawStatus === "EXPIRED"
    ) {
      stopBookingDetailsLiveSync();
    } else if (
      rawStatus === "COMPLETED" &&
      booking?.feedbackSubmittedAt
    ) {
      // Completed and feedback already received:
      // no further polling is required.
      stopBookingDetailsLiveSync();
    } else if (
      rawStatus === "COMPLETED" &&
      bookingFeedbackWindowIsActive(
        booking,
      )
    ) {
      // Keep checking for post-handover customer
      // feedback, but at a lower request rate.
      scheduleBookingDetailsLiveSync(
        BOOKING_DETAILS_FEEDBACK_SYNC_INTERVAL_MS,
      );
    } else if (
      rawStatus === "COMPLETED"
    ) {
      // Feedback window has expired.
      stopBookingDetailsLiveSync();
    } else {
      scheduleBookingDetailsLiveSync(
        BOOKING_DETAILS_SYNC_INTERVAL_MS,
      );
    }
  } catch (error) {
    // Do not repeatedly interrupt operators with
    // modal alerts during transient network errors.
    console.warn(
      "Booking live sync failed:",
      error,
    );
  } finally {
    bookingDetailsSyncInFlight = false;
  }
}

function startBookingDetailsLiveSync() {
  stopBookingDetailsLiveSync();

  if (!bookingDetailsRouteIsActive()) {
    return;
  }

  const currentBooking =
    window.getBookingDemoById?.(
      bookingDetailRouteId(),
    );

  bookingDetailsLastFingerprint =
    bookingDetailsFingerprint(
      currentBooking,
    );

  void refreshBookingDetailsLive({
    force: true,
  });

  scheduleBookingDetailsLiveSync(
    BOOKING_DETAILS_SYNC_INTERVAL_MS,
  );

  if (!bookingDetailsLiveEventsBound) {
    bookingDetailsLiveEventsBound = true;

    document.addEventListener(
      "visibilitychange",
      () => {
        if (
          !document.hidden &&
          bookingDetailsRouteIsActive()
        ) {
          void refreshBookingDetailsLive({
            force: true,
          });
        }
      },
    );

    window.addEventListener(
      "focus",
      () => {
        if (
          bookingDetailsRouteIsActive()
        ) {
          void refreshBookingDetailsLive({
            force: true,
          });
        }
      },
    );

    window.addEventListener(
      "hashchange",
      () => {
        if (
          bookingDetailsRouteIsActive()
        ) {
          startBookingDetailsLiveSync();
        } else {
          stopBookingDetailsLiveSync();
        }
      },
    );
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
  startBookingDetailsLiveSync();
}
