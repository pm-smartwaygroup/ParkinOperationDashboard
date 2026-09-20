const BOOKING_DEMO_DATA = [
  {
    id: "BK-2024-00568",
    created: "24 May 2024, 10:30 AM",
    customer: "Ahmed Al-Qahtani",
    phone: "+966 50 123 4567",
    vehicle: "Toyota Camry",
    plate: "KSA 1234 ABC",
    color: "White",
    start: "24 May, 10:30 AM",
    end: "24 May, 02:30 PM",
    duration: "4h 0m",
    zone: "Zone A - Main Entrance",
    location: "Riyadh - Business District",
    source: "Customer App",
    status: "Active",
    amount: "SAR 40",
    payment: "Online",
  },
  {
    id: "BK-2024-00567",
    created: "24 May 2024, 09:00 AM",
    customer: "Sara Al-Mutairi",
    phone: "+966 50 222 3344",
    vehicle: "Kia Sportage",
    plate: "KSA 7890 MNO",
    color: "Black",
    start: "24 May, 09:00 AM",
    end: "24 May, 06:00 PM",
    duration: "9h 0m",
    zone: "Zone B - VIP",
    location: "Riyadh Park Mall",
    source: "Customer App",
    status: "Upcoming",
    amount: "SAR 80",
    payment: "Apple Pay",
  },
  {
    id: "BK-2024-00566",
    created: "24 May 2024, 08:15 AM",
    customer: "Omar Al-Shehri",
    phone: "+966 55 987 6543",
    vehicle: "Hyundai Tucson",
    plate: "KSA 5678 DEF",
    color: "Gray",
    start: "24 May, 08:15 AM",
    end: "24 May, 12:15 PM",
    duration: "4h 0m",
    zone: "Zone C - Mall Area",
    location: "Granada Center",
    source: "Valet Driver App",
    status: "Completed",
    amount: "SAR 35",
    payment: "Online",
  },
  {
    id: "BK-2024-00565",
    created: "24 May 2024, 07:45 AM",
    customer: "Noura Al-Harbi",
    phone: "+966 53 111 2233",
    vehicle: "Mercedes E-Class",
    plate: "KSA 3456 JKL",
    color: "Black",
    start: "24 May, 07:45 AM",
    end: "24 May, 11:45 AM",
    duration: "4h 0m",
    zone: "Zone B - VIP",
    location: "Riyadh Park Mall",
    source: "Customer App",
    status: "Completed",
    amount: "SAR 50",
    payment: "Online",
  },
  {
    id: "BK-2024-00564",
    created: "24 May 2024, 01:00 PM",
    customer: "Faisal Al-Otaibi",
    phone: "+966 54 444 5566",
    vehicle: "Ford F-150",
    plate: "KSA 9012 GHI",
    color: "White",
    start: "24 May, 01:00 PM",
    end: "-",
    duration: "-",
    zone: "Zone D - Event",
    location: "King Abdullah Road",
    source: "Customer App",
    status: "Cancelled",
    amount: "SAR 60",
    payment: "Refunded",
  },
  {
    id: "BK-2024-00563",
    created: "24 May 2024, 11:20 AM",
    customer: "Lama Al-Zahrani",
    phone: "+966 56 777 8899",
    vehicle: "Lexus RX",
    plate: "KSA 2468 TUV",
    color: "Blue",
    start: "24 May, 11:20 AM",
    end: "24 May, 03:20 PM",
    duration: "4h 0m",
    zone: "Zone A - Main Entrance",
    location: "Riyadh - Business District",
    source: "Customer App",
    status: "Active",
    amount: "SAR 45",
    payment: "Online",
  },
  {
    id: "BK-2024-00562",
    created: "24 May 2024, 12:00 PM",
    customer: "Yazeed Al-Dossari",
    phone: "+966 58 333 6677",
    vehicle: "Nissan Patrol",
    plate: "KSA 1357 QWE",
    color: "Black",
    start: "24 May, 12:00 PM",
    end: "-",
    duration: "-",
    zone: "Zone C - Mall Area",
    location: "Granada Center",
    source: "Valet Driver App",
    status: "Upcoming",
    amount: "SAR 50",
    payment: "Cash",
  },
  {
    id: "BK-2024-00561",
    created: "24 May 2024, 08:30 AM",
    customer: "Reem Al-Sudairi",
    phone: "+966 59 888 1111",
    vehicle: "Chevrolet Tahoe",
    plate: "KSA 9753 ZXC",
    color: "White",
    start: "24 May, 08:30 AM",
    end: "24 May, 04:30 PM",
    duration: "8h 0m",
    zone: "Zone B - VIP",
    location: "Riyadh Park Mall",
    source: "Customer App",
    status: "Completed",
    amount: "SAR 70",
    payment: "Online",
  },
];

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

window.getBookingDemoById = (id) =>
  BOOKING_DEMO_DATA.find((booking) => booking.id === id) || null;

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
  return BOOKING_DEMO_DATA.filter((booking) => {
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
  return `<span class="bookings-status ${status.toLowerCase()}"><i aria-hidden="true"></i>${bookingEscape(status)}</span>`;
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
function renderBookings() {
  const items = bookingFilteredData();
  renderBookingTable(items);
  renderBookingMobile(items);
  const text = `Showing ${items.length ? 1 : 0} to ${items.length} of 256 bookings`;
  document.querySelector("#bookings-visible-count").textContent = text;
  document.querySelector(".bookings-directory-footer > span").textContent =
    text;
  const selectAll = document.querySelector("[data-bookings-select-all]");
  if (selectAll)
    selectAll.checked =
      items.length > 0 &&
      items.every((item) => bookingState.selectedIds.has(item.id));
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
  initializeBookingsPage();
}
