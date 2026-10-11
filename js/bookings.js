let BOOKING_DATA = [];

function getBookingsApiBaseUrl() {
  return (
    window.PARKIN_CONFIG?.userManagementApiBaseUrl ||
    window.PARKIN_CONFIG?.apiBaseUrl ||
    "https://api.parkin.com.sa"
  );
}

function bookingHumanize(value) {
  if (!value) return "—";

  return String(value)
    .trim()
    .toLowerCase()
    .split("_")
    .filter(Boolean)
    .map(
      (part) =>
        part.charAt(0).toUpperCase() +
        part.slice(1),
    )
    .join(" ");
}

function bookingSourceLabel(source) {
  switch (source) {
    case "CUSTOMER_APP":
      return "Customer App";

    case "VALET_DRIVER_APP":
      return "Valet Driver App";

    case "DASHBOARD":
      return "Dashboard";

    default:
      return bookingHumanize(source);
  }
}

function bookingStatusLabel(status) {
  switch (status) {
    case "VEHICLE_PARKED":
    case "RETURN_REQUESTED":
    case "RETRIEVAL_IN_PROGRESS":
    case "READY_FOR_HANDOVER":
      return "Active";

    case "COMPLETED":
      return "Completed";

    case "CANCELLED":
    case "EXPIRED":
      return "Cancelled";

    case "CONFIRMED":
    default:
      return "Upcoming";
  }
}

function bookingFormatDateTime(
  value,
  timeZone = "Asia/Riyadh",
) {
  if (!value) return "—";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  try {
    const datePart =
      new Intl.DateTimeFormat("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        timeZone,
      }).format(date);

    const timePart =
      new Intl.DateTimeFormat("en-US", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
        timeZone,
      }).format(date);

    return `${datePart}, ${timePart}`;
  } catch {
    return (
      `${date.toISOString().slice(0, 10)}, ` +
      `${date.toISOString().slice(11, 16)} UTC`
    );
  }
}

function bookingFormatDuration(minutes) {
  const total = Number(minutes);

  if (!Number.isFinite(total) || total < 0) {
    return "—";
  }

  const hours = Math.floor(total / 60);
  const remaining = total % 60;

  return `${hours}h ${remaining}m`;
}

function bookingVehicleName(vehicle) {
  const make = String(
    vehicle?.make || "",
  ).trim();

  const model = String(
    vehicle?.model || "",
  ).trim();

  const usefulParts = [make, model].filter(
    (part) =>
      part &&
      part.toLowerCase() !== "unknown",
  );

  if (usefulParts.length) {
    return usefulParts.join(" ");
  }

  return vehicle?.vehicleType || "Vehicle";
}

function bookingAmountLabel(value) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return "—";
  }

  const amount = Number(value);

  if (!Number.isFinite(amount)) {
    return "—";
  }

  return `SAR ${amount.toFixed(2)}`;
}

function mapBookingFromApi(raw) {
  const timeZone =
    raw?.location?.timezone ||
    "Asia/Riyadh";

  const plateNumber =
    raw?.vehicle?.plateNumberEnglish || "";

  const plateLetters =
    raw?.vehicle?.plateLettersEnglish || "";

  const customerPhone =
    raw?.customer?.phoneE164 ||
    [
      raw?.customer?.phoneCountryCode,
      raw?.customer?.phoneNumber,
    ]
      .filter(Boolean)
      .join("") ||
    "—";

  return {
    // Existing Dashboard/detail routing uses "id"
    // as the human-readable booking number.
    id:
      raw?.bookingCode ||
      raw?.id ||
      "—",

    databaseId: raw?.id || null,

    rawStatus: raw?.status || null,

    created: bookingFormatDateTime(
      raw?.createdAt,
      timeZone,
    ),

    customer:
      raw?.customer?.fullName ||
      "Unknown Customer",

    // Correct semantics for CUSTOMER (FROM APP).
    phone: customerPhone,

    // Retain driver mobile separately for later
    // booking-detail / SMS workflow.
    driverPhone:
      raw?.driverPhoneE164 || "—",

    vehicle: bookingVehicleName(
      raw?.vehicle,
    ),

    plate:
      plateNumber || plateLetters
        ? `KSA ${plateNumber} ${plateLetters}`.trim()
        : "—",

    color:
      raw?.vehicle?.color ||
      "Unknown",

    start: bookingFormatDateTime(
      raw?.scheduledStartAt,
      timeZone,
    ),

    end: bookingFormatDateTime(
      raw?.scheduledEndAt,
      timeZone,
    ),

    duration: bookingFormatDuration(
      raw?.durationMinutes,
    ),

    zone:
      raw?.parkingSpaceLabel ||
      raw?.location?.district ||
      raw?.location?.code ||
      "—",

    location:
      raw?.location?.name ||
      raw?.location?.city ||
      "—",

    source: bookingSourceLabel(
      raw?.source,
    ),

    status: bookingStatusLabel(
      raw?.status,
    ),

    amount: bookingAmountLabel(
      raw?.amountSar,
    ),

    payment:
      raw?.paymentMethod
        ? bookingHumanize(
            raw.paymentMethod,
          )
        : "Not set",

    pickupMethod: bookingHumanize(
      raw?.pickupMethod,
    ),

    notes: raw?.notes || null,

    confirmedAt: raw?.confirmedAt
      ? bookingFormatDateTime(
          raw.confirmedAt,
          timeZone,
        )
      : null,

    parkedAt: raw?.parkedAt
      ? bookingFormatDateTime(
          raw.parkedAt,
          timeZone,
        )
      : null,

    returnRequestedAt:
      raw?.returnRequestedAt
        ? bookingFormatDateTime(
            raw.returnRequestedAt,
            timeZone,
          )
        : null,

    retrievalStartedAt:
      raw?.retrievalStartedAt
        ? bookingFormatDateTime(
            raw.retrievalStartedAt,
            timeZone,
          )
        : null,

    readyForHandoverAt:
      raw?.readyForHandoverAt
        ? bookingFormatDateTime(
            raw.readyForHandoverAt,
            timeZone,
          )
        : null,

    completedAt: raw?.completedAt
      ? bookingFormatDateTime(
          raw.completedAt,
          timeZone,
        )
      : null,

    completedAtIso:
      raw?.completedAt || null,

    customerRating:
      Number.isInteger(raw?.customerRating) &&
      raw.customerRating >= 1 &&
      raw.customerRating <= 5
        ? raw.customerRating
        : null,

    customerFeedback:
      typeof raw?.customerFeedback === "string" &&
      raw.customerFeedback.trim()
        ? raw.customerFeedback.trim()
        : null,

    feedbackSubmittedAt:
      raw?.feedbackSubmittedAt
        ? bookingFormatDateTime(
            raw.feedbackSubmittedAt,
            timeZone,
          )
        : null,

    cancelledAt: raw?.cancelledAt
      ? bookingFormatDateTime(
          raw.cancelledAt,
          timeZone,
        )
      : null,
  };
}

async function fetchBookingsApiPage(
  page,
  limit,
  token,
) {
  const response = await fetch(
    `${getBookingsApiBaseUrl()}/bookings?page=${page}&limit=${limit}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  );

  const payload = await response
    .json()
    .catch(() => null);

  if (!response.ok) {
    const message = Array.isArray(
      payload?.message,
    )
      ? payload.message.join("\n")
      : payload?.message;

    throw new Error(
      message ||
        `Unable to load bookings (${response.status}).`,
    );
  }

  const data = payload?.data ?? payload;

  return {
    bookings: Array.isArray(
      data?.bookings,
    )
      ? data.bookings
      : [],

    pagination:
      data?.pagination || {
        page,
        limit,
        total: 0,
        totalPages: 0,
      },
  };
}


async function fetchBookingByIdFromApi(
  identifier,
  token,
) {
  const response = await fetch(
    `${getBookingsApiBaseUrl()}/bookings/${encodeURIComponent(identifier)}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
      cache: "no-store",
    },
  );

  const payload = await response
    .json()
    .catch(() => null);

  if (!response.ok) {
    const message = Array.isArray(
      payload?.message,
    )
      ? payload.message.join("\n")
      : payload?.message;

    throw new Error(
      message ||
        `Unable to refresh booking (${response.status}).`,
    );
  }

  const data = payload?.data ?? payload;
  const rawBooking =
    data?.booking ?? data;

  if (!rawBooking) {
    throw new Error(
      "Booking response did not contain booking data.",
    );
  }

  return rawBooking;
}

function updateBookingDataFromApi(
  rawBooking,
) {
  const mapped =
    mapBookingFromApi(rawBooking);

  const index = BOOKING_DATA.findIndex(
    (booking) =>
      (
        mapped.databaseId &&
        booking.databaseId ===
          mapped.databaseId
      ) ||
      booking.id === mapped.id,
  );

  if (index >= 0) {
    BOOKING_DATA[index] = mapped;
  } else {
    BOOKING_DATA.unshift(mapped);
  }

  return mapped;
}

window.refreshBookingByIdFromApi =
  async (identifier) => {
    const token = localStorage.getItem(
      "parkin_access_token",
    );

    if (!token) {
      throw new Error(
        "Dashboard access token is unavailable. Please sign in again.",
      );
    }

    const rawBooking =
      await fetchBookingByIdFromApi(
        identifier,
        token,
      );

    return updateBookingDataFromApi(
      rawBooking,
    );
  };

function replaceBookingFilterOptions(
  selector,
  allLabel,
  values,
  stateKey,
) {
  const select =
    document.querySelector(selector);

  if (!select) return;

  const previous =
    bookingState[stateKey];

  const uniqueValues = [
    ...new Set(values),
  ]
    .filter(
      (value) =>
        value &&
        value !== "—",
    )
    .sort((a, b) =>
      a.localeCompare(b),
    );

  select.replaceChildren(
    new Option(allLabel, "all"),
    ...uniqueValues.map(
      (value) =>
        new Option(value, value),
    ),
  );

  if (
    previous !== "all" &&
    uniqueValues.includes(previous)
  ) {
    select.value = previous;
    return;
  }

  select.value = "all";
  bookingState[stateKey] = "all";
}

function syncBookingFilterOptions() {
  replaceBookingFilterOptions(
    "#bookings-source-filter",
    "All Sources",
    BOOKING_DATA.map(
      (booking) => booking.source,
    ),
    "source",
  );

  replaceBookingFilterOptions(
    "#bookings-payment-filter",
    "All Payments",
    BOOKING_DATA.map(
      (booking) => booking.payment,
    ),
    "payment",
  );

  replaceBookingFilterOptions(
    "#bookings-location-filter",
    "All Locations",
    BOOKING_DATA.map(
      (booking) => booking.location,
    ),
    "location",
  );
}

async function loadBookingsData() {
  const token = localStorage.getItem(
    "parkin_access_token",
  );

  if (!token) {
    throw new Error(
      "Dashboard access token is unavailable. Please sign in again.",
    );
  }

  const limit = 25;

  const firstPage =
    await fetchBookingsApiPage(
      1,
      limit,
      token,
    );

  const rawBookings = [
    ...firstPage.bookings,
  ];

  const totalPages = Math.max(
    1,
    Number(
      firstPage.pagination
        ?.totalPages || 1,
    ),
  );

  for (
    let page = 2;
    page <= totalPages;
    page += 1
  ) {
    const nextPage =
      await fetchBookingsApiPage(
        page,
        limit,
        token,
      );

    rawBookings.push(
      ...nextPage.bookings,
    );
  }

  BOOKING_DATA = rawBookings.map(
    mapBookingFromApi,
  );

  bookingState.selectedIds.clear();

  syncBookingFilterOptions();
}

const BOOKING_VEHICLE_BRAND_ASSETS = Object.freeze({
  Toyota: "/public/assets/vehicle-brands/toyota.svg",
  Kia: "/public/assets/vehicle-brands/kia.svg",
  Hyundai: "/public/assets/vehicle-brands/hyundai.svg",
  Mercedes: "/public/assets/vehicle-brands/mercedes.svg",
  Ford: "/public/assets/vehicle-brands/ford.svg",
  Lexus: "/public/assets/vehicle-brands/Lexus.svg",
  Nissan: "/public/assets/vehicle-brands/nissan.svg",
  Chevrolet: "/public/assets/vehicle-brands/chevrolet.svg",
});

window.getBookingById = (id) =>
  BOOKING_DATA.find((booking) => booking.id === id) || null;

// Keep the existing name because booking-details.js
// and booking-receipt.js currently call it.
window.getBookingDemoById = window.getBookingById;

const bookingState = {
  search: "",
  status: "all",
  source: "all",
  payment: "all",
  location: "all",
  selectedIds: new Set(),
  root: null,
};
let bookingDocumentEventsBound = false;

function bookingEscape(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
function bookingInitials(name) {
  return name
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}
function bookingFilteredData() {
  const query = bookingState.search.toLowerCase();
  return BOOKING_DATA.filter((booking) => {
    const matchesSearch =
      !query ||
      [
        booking.id,
        booking.customer,
        booking.vehicle,
        booking.plate,
        booking.location,
        booking.zone,
      ].some((value) => value.toLowerCase().includes(query));
    return (
      matchesSearch &&
      (bookingState.status === "all" ||
        booking.status === bookingState.status) &&
      (bookingState.source === "all" ||
        booking.source === bookingState.source) &&
      (bookingState.payment === "all" ||
        booking.payment === bookingState.payment) &&
      (bookingState.location === "all" ||
        booking.location === bookingState.location)
    );
  });
}
function bookingColorClass(color) {
  return color.toLowerCase();
}
function bookingStatusMarkup(status) {
  const displayStatus =
    status === "Completed"
      ? "Collected"
      : status;

  return `<span class="bookings-status ${status.toLowerCase()}"><i aria-hidden="true"></i>${bookingEscape(displayStatus)}</span>`;
}
function bookingVehicleBrand(vehicleName) {
  return Object.keys(BOOKING_VEHICLE_BRAND_ASSETS).find((brand) =>
    vehicleName.startsWith(brand),
  );
}
function bookingVehicleVisual(booking) {
  const brand = bookingVehicleBrand(booking.vehicle);
  const asset = brand ? BOOKING_VEHICLE_BRAND_ASSETS[brand] : null;
  if (!asset) {
    return `<span class="bookings-vehicle-visual bookings-vehicle-fallback-slot" aria-hidden="true"><i class="fa-solid fa-car-side bookings-vehicle-fallback-icon"></i></span>`;
  }
  return `<span class="bookings-vehicle-visual"><img class="bookings-vehicle-image" src="${asset}" alt="${bookingEscape(brand)}" /><i class="fa-solid fa-car-side bookings-vehicle-fallback-icon" aria-hidden="true" hidden></i></span>`;
}
function bindBookingVehicleImageFallback(root) {
  root.querySelectorAll(".bookings-vehicle-image").forEach((image) => {
    image.addEventListener(
      "error",
      () => {
        image.hidden = true;
        image.nextElementSibling?.removeAttribute("hidden");
      },
      { once: true },
    );
  });
}
function bookingSourceMarkup(source) {
  const driver = source === "Valet Driver App";
  return `<span class="bookings-source ${driver ? "driver" : "customer"}"><i class="fa-solid ${driver ? "fa-car" : "fa-mobile-screen-button"}" aria-hidden="true"></i>${bookingEscape(source)}</span>`;
}
function bookingActionsMarkup(booking) {
  return `<div class="bookings-actions"><button type="button" class="bookings-action-view" data-booking-view="${bookingEscape(booking.id)}" aria-label="View ${bookingEscape(booking.id)}"><i class="fa-solid fa-eye" aria-hidden="true"></i></button></div>`;
}
function bookingDetailsMarkup(booking) {
  return `<div class="bookings-details"><span><i class="fa-regular fa-calendar" aria-hidden="true"></i>${bookingEscape(booking.start)}</span><span><i class="fa-regular fa-calendar" aria-hidden="true"></i>${bookingEscape(booking.end)}</span><span><i class="fa-regular fa-clock" aria-hidden="true"></i>${bookingEscape(booking.duration)}</span></div>`;
}
function bookingVehicleMarkup(booking) {
  return `<div class="bookings-vehicle">${bookingVehicleVisual(booking)}<span><strong>${bookingEscape(booking.vehicle)}</strong><small>${bookingEscape(booking.plate)} · ${bookingEscape(booking.color)}</small></span></div>`;
}
function bookingPaymentMarkup(booking) {
  return `<div class="bookings-payment"><i class="fa-solid fa-wallet" aria-hidden="true"></i><span><strong>${bookingEscape(booking.amount)}</strong><small>${bookingEscape(booking.payment)}</small></span></div>`;
}
function renderBookingTable(items) {
  const body = document.querySelector("#bookings-table-body");
  if (!body) return;
  body.innerHTML = items
    .map(
      (booking) =>
        `<tr><td><input type="checkbox" data-booking-select="${bookingEscape(booking.id)}" aria-label="Select ${bookingEscape(booking.id)}" ${bookingState.selectedIds.has(booking.id) ? "checked" : ""} /></td><td><strong class="bookings-id">${bookingEscape(booking.id)}</strong><small class="bookings-created">${bookingEscape(booking.created)}</small></td><td><div class="bookings-customer"><span>${bookingInitials(booking.customer)}</span><strong>${bookingEscape(booking.customer)}</strong><small>${bookingEscape(booking.phone)}</small></div></td><td>${bookingVehicleMarkup(booking)}</td><td>${bookingDetailsMarkup(booking)}</td><td><div class="bookings-location"><i class="fa-solid fa-location-dot" aria-hidden="true"></i><span><strong>${bookingEscape(booking.zone)}</strong><small>${bookingEscape(booking.location)}</small></span></div></td><td>${bookingSourceMarkup(booking.source)}</td><td>${bookingStatusMarkup(booking.status)}</td><td>${bookingPaymentMarkup(booking)}</td><td>${bookingActionsMarkup(booking)}</td></tr>`,
    )
    .join("");
  bindBookingVehicleImageFallback(body);
}
function renderBookingMobile(items) {
  const target = document.querySelector("#bookings-mobile-list");
  if (!target) return;
  target.innerHTML = items
    .map(
      (booking) =>
        `<article class="bookings-mobile-card"><header><strong>${bookingEscape(booking.id)}</strong>${bookingStatusMarkup(booking.status)}</header><div class="bookings-mobile-customer"><span>${bookingInitials(booking.customer)}</span><strong>${bookingEscape(booking.customer)}</strong><small>${bookingEscape(booking.phone)}</small></div>${bookingVehicleMarkup(booking)}${bookingDetailsMarkup(booking)}<div class="bookings-mobile-location"><i class="fa-solid fa-location-dot" aria-hidden="true"></i><span><strong>${bookingEscape(booking.zone)}</strong><small>${bookingEscape(booking.location)}</small></span></div><div class="bookings-mobile-meta">${bookingSourceMarkup(booking.source)}${bookingPaymentMarkup(booking)}</div><button type="button" class="bookings-mobile-view" data-booking-view="${bookingEscape(booking.id)}"><i class="fa-solid fa-eye" aria-hidden="true"></i>View</button></article>`,
    )
    .join("");
  bindBookingVehicleImageFallback(target);
}
function renderBookingCounts() {
  const counts = {
    total: BOOKING_DATA.length,
    Active: 0,
    Upcoming: 0,
    Completed: 0,
    Cancelled: 0,
  };

  BOOKING_DATA.forEach((booking) => {
    if (
      Object.prototype.hasOwnProperty.call(
        counts,
        booking.status,
      )
    ) {
      counts[booking.status] += 1;
    }
  });

  document
    .querySelectorAll(
      ".bookings-stat-card",
    )
    .forEach((card) => {
      const label = card
        .querySelector("small")
        ?.textContent
        ?.trim()
        ?.toUpperCase();

      const value =
        card.querySelector("strong");

      if (!value) return;

      if (label === "TOTAL BOOKINGS") {
        value.textContent =
          String(counts.total);

        const note =
          card.querySelector("p");

        if (note) {
          note.textContent =
            "From synced booking API";
        }

        return;
      }

      if (label === "ONGOING") {
        value.textContent =
          String(counts.Active);
        return;
      }

      if (label === "COMPLETED") {
        value.textContent =
          String(counts.Completed);
        return;
      }

      if (label === "UPCOMING") {
        value.textContent =
          String(counts.Upcoming);
        return;
      }

      if (label === "CANCELLED") {
        value.textContent =
          String(counts.Cancelled);
      }
    });

  document
    .querySelectorAll(
      "[data-booking-status]",
    )
    .forEach((button) => {
      const status =
        button.dataset.bookingStatus;

      const count =
        button.querySelector("b");

      if (!count) return;

      count.textContent =
        status === "all"
          ? String(counts.total)
          : String(
              counts[status] || 0,
            );
    });
}

function renderBookings() {
  const items = bookingFilteredData();

  renderBookingTable(items);
  renderBookingMobile(items);
  renderBookingCounts();

  const text =
    `Showing ${items.length ? 1 : 0} ` +
    `to ${items.length} ` +
    `of ${BOOKING_DATA.length} bookings`;

  const visibleCount =
    document.querySelector(
      "#bookings-visible-count",
    );

  if (visibleCount) {
    visibleCount.textContent = text;
  }

  const footerCount =
    document.querySelector(
      ".bookings-directory-footer > span",
    );

  if (footerCount) {
    footerCount.textContent = text;
  }

  // Existing pagination buttons contain demo values.
  // We load all API pages into this view.
  const pagination =
    document.querySelector(
      ".bookings-directory-footer nav",
    );

  if (pagination) {
    pagination.hidden = true;
    pagination.style.display = "none";
  }

  const selectAll =
    document.querySelector(
      "[data-bookings-select-all]",
    );

  if (selectAll) {
    selectAll.checked =
      items.length > 0 &&
      items.every((item) =>
        bookingState.selectedIds.has(
          item.id,
        ),
      );
  }
}

function exportBookingsCsv() {
  const headers = [
    "Booking ID",
    "Customer",
    "Phone",
    "Vehicle",
    "Plate Number",
    "Start Time",
    "End Time",
    "Duration",
    "Location",
    "Zone",
    "Source",
    "Status",
    "Amount",
    "Payment Method",
  ];
  const rows = bookingFilteredData().map((booking) => [
    booking.id,
    booking.customer,
    booking.phone,
    booking.vehicle,
    booking.plate,
    booking.start,
    booking.end,
    booking.duration,
    booking.location,
    booking.zone,
    booking.source,
    booking.status,
    booking.amount,
    booking.payment,
  ]);
  const csvEscape = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;
  const csv = [headers, ...rows]
    .map((row) => row.map(csvEscape).join(","))
    .join("\n");
  const link = document.createElement("a");
  link.href = URL.createObjectURL(
    new Blob([csv], { type: "text/csv;charset=utf-8" }),
  );
  link.download = "parkin-bookings.csv";
  link.click();
  URL.revokeObjectURL(link.href);
}
function initializeBookingsPage() {
  const root = document.querySelector(".bookings-page");
  if (!root || bookingState.root === root) return;
  bookingState.root = root;
  renderBookings();
  root.addEventListener("input", (event) => {
    if (event.target.matches("#bookings-search")) {
      bookingState.search = event.target.value;
      renderBookings();
    }
  });
  root.addEventListener("change", (event) => {
    if (event.target.matches("#bookings-source-filter"))
      bookingState.source = event.target.value;
    if (event.target.matches("#bookings-payment-filter"))
      bookingState.payment = event.target.value;
    if (event.target.matches("#bookings-location-filter"))
      bookingState.location = event.target.value;
    if (event.target.matches("[data-booking-select]"))
      event.target.checked
        ? bookingState.selectedIds.add(event.target.dataset.bookingSelect)
        : bookingState.selectedIds.delete(event.target.dataset.bookingSelect);
    if (event.target.matches("[data-bookings-select-all]"))
      bookingFilteredData().forEach((booking) =>
        event.target.checked
          ? bookingState.selectedIds.add(booking.id)
          : bookingState.selectedIds.delete(booking.id),
      );
    renderBookings();
  });
  root.addEventListener("click", (event) => {
    const viewBooking = event.target.closest("[data-booking-view]");
    if (viewBooking) {
      window.location.hash = `#booking-details?id=${encodeURIComponent(viewBooking.dataset.bookingView)}`;
      return;
    }
    const tab = event.target.closest("[data-booking-status]");
    if (tab) {
      bookingState.status = tab.dataset.bookingStatus;
      root.querySelectorAll("[data-booking-status]").forEach((button) => {
        const active = button === tab;
        button.classList.toggle("active", active);
        button.setAttribute("aria-selected", String(active));
      });
      renderBookings();
      return;
    }
    const filterToggle = event.target.closest("[data-bookings-filter-toggle]");
    if (filterToggle) {
      const panel = root.querySelector("[data-bookings-filter-panel]");
      const open = panel.classList.toggle("hidden") === false;
      filterToggle.setAttribute("aria-expanded", String(open));
      return;
    }
    if (event.target.closest("[data-bookings-export]")) exportBookingsCsv();
  });
  if (!bookingDocumentEventsBound) {
    bookingDocumentEventsBound = true;
    document.addEventListener("click", (event) => {
      const mountedRoot = document.querySelector(".bookings-page");
      if (
        !event.target.closest(".bookings-filter-panel") &&
        !event.target.closest("[data-bookings-filter-toggle]")
      )
        mountedRoot
          ?.querySelector("[data-bookings-filter-panel]")
          ?.classList.add("hidden");
    });
  }
}
async function loadBookingsPage() {
  const container = document.querySelector("#bookings-container");
  if (!container) return;
  if (
    container.dataset.loaded !== "true" ||
    !container.querySelector(".bookings-page")
  ) {
    bookingState.root = null;
    const response = await fetch("/pages/bookings.html");
    if (!response.ok)
      throw new Error(`Unable to load Bookings page: ${response.status}`);
    container.innerHTML = await response.text();
    container.dataset.loaded = "true";
  }
  try {
    await loadBookingsData();
  } catch (error) {
    BOOKING_DATA = [];
    syncBookingFilterOptions();

    console.error(
      "Unable to load bookings:",
      error,
    );

    window.showDashboardAlert?.(
      error?.message ||
        "Could not load bookings. Please try again.",
    );
  }

  initializeBookingsPage();

  // Refresh real data when returning to Bookings.
  renderBookings();
}
