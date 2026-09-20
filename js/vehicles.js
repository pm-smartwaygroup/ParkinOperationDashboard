const VEHICLE_DEMO_DATA = [
  {
    id: "vehicle-1",
    name: "Toyota Camry",
    year: 2023,
    plate: "KSA 1234 ABC",
    ownerType: "Customer",
    owner: "Ahmed Al-Qahtani",
    phone: "+966 50 123 4567",
    brand: "Toyota",
    model: "Camry",
    color: "White",
    status: "Active",
  },
  {
    id: "vehicle-2",
    name: "Hyundai Tucson",
    year: 2022,
    plate: "KSA 5678 DEF",
    ownerType: "Valet Company",
    owner: "Riyadh Valet Co.",
    brand: "Hyundai",
    model: "Tucson",
    color: "Black",
    status: "Active",
  },
  {
    id: "vehicle-3",
    name: "Ford F-150",
    year: 2023,
    plate: "KSA 9012 GHI",
    ownerType: "Driver",
    owner: "Mohammed Khan",
    phone: "+966 55 987 6543",
    brand: "Ford",
    model: "F-150",
    color: "Silver",
    status: "In Service",
  },
  {
    id: "vehicle-4",
    name: "Mercedes E-Class",
    year: 2024,
    plate: "KSA 3456 JKL",
    ownerType: "Customer",
    owner: "Sara Al-Mutairi",
    phone: "+966 50 222 3344",
    brand: "Mercedes",
    model: "E-Class",
    color: "Gray",
    status: "Active",
  },
  {
    id: "vehicle-5",
    name: "Kia Sportage",
    year: 2022,
    plate: "KSA 7890 MNO",
    ownerType: "Valet Company",
    owner: "Jeddah Valet Co.",
    brand: "Kia",
    model: "Sportage",
    color: "Blue",
    status: "Maintenance",
  },
];

const VEHICLE_BRAND_ASSETS = Object.freeze({
  toyota: "/public/assets/vehicle-brands/toyota.svg",
  hyundai: "/public/assets/vehicle-brands/hyundai.svg",
  kia: "/public/assets/vehicle-brands/kia.svg",
  mercedes: "/public/assets/vehicle-brands/mercedes.svg",
  bmw: "/public/assets/vehicle-brands/bmw.svg",
  nissan: "/public/assets/vehicle-brands/nissan.svg",
  ford: "/public/assets/vehicle-brands/ford.svg",
});

const vehicleState = {
  search: "",
  ownerType: "all",
  company: "all",
  status: "all",
  viewMode: "list",
  selectedIds: new Set(),
  root: null,
};
let vehicleCharts = { owner: null, types: null };
let vehicleDocumentEventsBound = false;

function vehicleEscape(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
function vehicleFilteredData() {
  const search = vehicleState.search.toLowerCase();
  return VEHICLE_DEMO_DATA.filter((vehicle) => {
    const matchesSearch =
      !search ||
      [
        vehicle.name,
        vehicle.plate,
        vehicle.owner,
        vehicle.brand,
        vehicle.model,
      ].some((value) => value.toLowerCase().includes(search));
    const matchesOwner =
      vehicleState.ownerType === "all" ||
      vehicle.ownerType === vehicleState.ownerType;
    const matchesCompany =
      vehicleState.company === "all" || vehicle.owner === vehicleState.company;
    const matchesStatus =
      vehicleState.status === "all" || vehicle.status === vehicleState.status;
    return matchesSearch && matchesOwner && matchesCompany && matchesStatus;
  });
}
function vehicleBrandAsset(brand) {
  return VEHICLE_BRAND_ASSETS[String(brand).toLowerCase()] || null;
}
function vehicleBrandMarkup(brand, className = "") {
  const asset = vehicleBrandAsset(brand);
  return asset
    ? `<img class="vehicles-brand-logo ${className}" src="${asset}" alt="${vehicleEscape(brand)} logo" />`
    : `<span class="vehicles-brand-fallback ${className}" aria-hidden="true">${vehicleEscape(String(brand).slice(0, 2).toUpperCase())}</span>`;
}
function vehicleActionMarkup(vehicle) {
  const canEdit = window.hasDashboardPermission?.("vehicles.edit") === true;
  const canDelete = window.hasDashboardPermission?.("vehicles.delete") === true;
  return `<div class="vehicles-actions"><button type="button" class="vehicles-action-toggle" aria-label="Actions for ${vehicleEscape(vehicle.name)}" aria-expanded="false"><i class="fa-solid fa-ellipsis-vertical" aria-hidden="true"></i></button><div class="vehicles-action-menu hidden" role="menu"><button type="button" data-vehicle-placeholder="view">View Details</button>${canEdit ? `<button type="button" data-vehicle-placeholder="edit">Edit Vehicle</button><button type="button" data-vehicle-placeholder="owner">Change Owner</button><button type="button" data-vehicle-placeholder="assign">Assign Driver</button>` : ""}<button type="button" data-vehicle-placeholder="history">Maintenance History</button>${canDelete ? `<button type="button" data-vehicle-placeholder="delete">Delete Vehicle</button>` : ""}</div></div>`;
}
function vehicleThumbnail(vehicle) {
  return `<span class="vehicles-thumbnail ${vehicle.ownerType.toLowerCase().replace(" ", "-")}" aria-hidden="true"><i class="fa-solid fa-car-side"></i></span>`;
}
function renderVehicleRows(items) {
  const body = document.querySelector("#vehicles-table-body");
  if (!body) return;
  body.innerHTML = items
    .map(
      (vehicle) =>
        `<tr><td><input type="checkbox" data-vehicle-select="${vehicleEscape(vehicle.id)}" aria-label="Select ${vehicleEscape(vehicle.name)}" ${vehicleState.selectedIds.has(vehicle.id) ? "checked" : ""} /></td><td><div class="vehicles-cell-vehicle">${vehicleThumbnail(vehicle)}<span><strong>${vehicleEscape(vehicle.name)}</strong><small>${vehicle.year}</small></span></div></td><td><strong class="vehicles-plate">${vehicleEscape(vehicle.plate)}</strong></td><td><span class="vehicles-owner-badge ${vehicle.ownerType.toLowerCase().replace(" ", "-")}">${vehicleEscape(vehicle.ownerType)}</span></td><td><strong>${vehicleEscape(vehicle.owner)}</strong><small class="vehicles-owner-contact">${vehicleEscape(vehicle.phone || "Company account")}</small></td><td><div class="vehicles-brand-cell">${vehicleBrandMarkup(vehicle.brand)}<span><strong>${vehicleEscape(vehicle.brand)}</strong><small>${vehicleEscape(vehicle.model)}</small></span></div></td><td><span class="vehicles-color"><i class="${vehicle.color.toLowerCase()}" aria-hidden="true"></i>${vehicleEscape(vehicle.color)}</span></td><td><span class="vehicles-status ${vehicle.status.toLowerCase().replace(" ", "-")}"><i></i>${vehicleEscape(vehicle.status)}</span></td><td>${vehicleActionMarkup(vehicle)}</td></tr>`,
    )
    .join("");
}
function renderVehicleGrid(items) {
  const grid = document.querySelector("#vehicles-grid");
  if (!grid) return;
  grid.innerHTML = items
    .map(
      (vehicle) =>
        `<article class="vehicles-grid-card"><div class="vehicles-grid-top">${vehicleThumbnail(vehicle)}${vehicleActionMarkup(vehicle)}</div><h3>${vehicleEscape(vehicle.name)}</h3><p>${vehicleEscape(vehicle.plate)} · ${vehicle.year}</p><div><span class="vehicles-owner-badge ${vehicle.ownerType.toLowerCase().replace(" ", "-")}">${vehicleEscape(vehicle.ownerType)}</span><span class="vehicles-status ${vehicle.status.toLowerCase().replace(" ", "-")}"><i></i>${vehicleEscape(vehicle.status)}</span></div><strong>${vehicleEscape(vehicle.owner)}</strong><small class="vehicles-grid-brand">${vehicleBrandMarkup(vehicle.brand)}${vehicleEscape(vehicle.brand)} / ${vehicleEscape(vehicle.model)} · ${vehicleEscape(vehicle.color)}</small></article>`,
    )
    .join("");
}
function renderVehicleBrands() {
  const brands = [
    { name: "Toyota", value: 312 },
    { name: "Hyundai", value: 210 },
    { name: "Kia", value: 138 },
    { name: "Mercedes", value: 120 },
    { name: "BMW", value: 98 },
    { name: "Nissan", value: 80 },
  ];
  document.querySelector("#vehicles-brand-list").innerHTML = brands
    .map(
      (brand) =>
        `<div class="vehicles-brand-row"><span class="vehicles-brand-slot">${vehicleBrandMarkup(brand.name)}</span><span class="vehicles-brand-track"><i style="width:${(brand.value / 312) * 100}%"></i></span><b>${brand.value}</b></div>`,
    )
    .join("");
}
function destroyVehicleCharts() {
  Object.values(vehicleCharts).forEach((chart) => chart?.destroy());
  vehicleCharts = { owner: null, types: null };
}
function renderVehicleCharts() {
  destroyVehicleCharts();
  if (!window.Chart) return;
  const ownerCanvas = document.querySelector("#vehicles-owner-chart");
  const typesCanvas = document.querySelector("#vehicles-type-chart");
  if (ownerCanvas)
    vehicleCharts.owner = new Chart(ownerCanvas, {
      type: "doughnut",
      data: {
        labels: ["Customers", "Valet Companies", "Drivers"],
        datasets: [
          {
            data: [514, 436, 298],
            backgroundColor: ["#0a9b55", "#3478e5", "#7655d9"],
            borderColor: "#ffffff",
            borderWidth: 3,
            borderAlign: "inner",
          },
        ],
      },
      options: {
        cutout: "72%",
        plugins: { legend: { display: false }, tooltip: { enabled: true } },
        responsive: true,
        maintainAspectRatio: false,
      },
    });
  if (typesCanvas)
    vehicleCharts.types = new Chart(typesCanvas, {
      type: "bar",
      data: {
        labels: ["Sedan", "SUV", "Pickup", "Van", "Luxury", "Hatchback"],
        datasets: [
          {
            data: [420, 310, 220, 150, 98, 50],
            backgroundColor: "#0a9b55",
            borderRadius: 4,
            barThickness: 14,
          },
        ],
      },
      options: {
        plugins: { legend: { display: false } },
        layout: { padding: { top: 6, right: 4, bottom: 0, left: 0 } },
        scales: {
          x: {
            grid: { display: false },
            ticks: { color: "#68778b", font: { size: 10, weight: "600" } },
          },
          y: {
            beginAtZero: true,
            grid: { color: "#edf1f5" },
            ticks: { color: "#8491a2", font: { size: 9 } },
          },
        },
        responsive: true,
        maintainAspectRatio: false,
      },
    });
}
function renderVehicles() {
  const items = vehicleFilteredData();
  renderVehicleRows(items);
  renderVehicleGrid(items);
  document.querySelector("#vehicles-visible-count").textContent =
    `Showing ${items.length ? 1 : 0} to ${items.length} of 1,248 vehicles`;
  document.querySelector(".vehicles-directory-footer > span").textContent =
    `Showing ${items.length ? 1 : 0} to ${items.length} of 1,248 vehicles`;
  document.querySelector("[data-vehicles-select-all]").checked =
    items.length > 0 &&
    items.every((item) => vehicleState.selectedIds.has(item.id));
}
function exportVehiclesCsv() {
  const rows = vehicleFilteredData();
  const escape = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;
  const csv = [
    [
      "Vehicle",
      "Year",
      "Plate Number",
      "Owner Type",
      "Owner",
      "Brand",
      "Model",
      "Color",
      "Status",
    ],
    ...rows.map((vehicle) => [
      vehicle.name,
      vehicle.year,
      vehicle.plate,
      vehicle.ownerType,
      vehicle.owner,
      vehicle.brand,
      vehicle.model,
      vehicle.color,
      vehicle.status,
    ]),
  ]
    .map((row) => row.map(escape).join(","))
    .join("\n");
  const link = document.createElement("a");
  link.href = URL.createObjectURL(
    new Blob([csv], { type: "text/csv;charset=utf-8" }),
  );
  link.download = "parkin-vehicles.csv";
  link.click();
  URL.revokeObjectURL(link.href);
}
function initializeVehiclesPage() {
  const root = document.querySelector(".vehicles-page");
  if (!root || vehicleState.root === root) return;
  vehicleState.root = root;
  renderVehicleBrands();
  renderVehicleCharts();
  renderVehicles();
  root.addEventListener("input", (event) => {
    if (event.target.matches("#vehicles-search")) {
      vehicleState.search = event.target.value;
      renderVehicles();
    }
  });
  root.addEventListener("change", (event) => {
    if (event.target.matches("#vehicles-owner-filter"))
      vehicleState.ownerType = event.target.value;
    if (event.target.matches("#vehicles-company-filter"))
      vehicleState.company = event.target.value;
    if (event.target.matches("#vehicles-status-filter"))
      vehicleState.status = event.target.value;
    if (event.target.matches("[data-vehicle-select]")) {
      if (event.target.checked)
        vehicleState.selectedIds.add(event.target.dataset.vehicleSelect);
      else vehicleState.selectedIds.delete(event.target.dataset.vehicleSelect);
    }
    if (event.target.matches("[data-vehicles-select-all]"))
      vehicleFilteredData().forEach((item) =>
        event.target.checked
          ? vehicleState.selectedIds.add(item.id)
          : vehicleState.selectedIds.delete(item.id),
      );
    renderVehicles();
  });
  root.addEventListener("click", (event) => {
    const view = event.target.closest("[data-vehicle-view]");
    if (view) {
      vehicleState.viewMode = view.dataset.vehicleView;
      root
        .querySelectorAll("[data-vehicle-view]")
        .forEach((button) =>
          button.classList.toggle("active", button === view),
        );
      root
        .querySelector(".vehicles-table-scroll")
        .classList.toggle("hidden", vehicleState.viewMode === "grid");
      root
        .querySelector("#vehicles-grid")
        .classList.toggle("hidden", vehicleState.viewMode !== "grid");
      return;
    }
    const toggle = event.target.closest(".vehicles-action-toggle");
    if (toggle) {
      root
        .querySelectorAll(".vehicles-action-menu")
        .forEach((menu) => menu.classList.add("hidden"));
      const menu = toggle.nextElementSibling;
      menu.classList.toggle("hidden");
      toggle.setAttribute(
        "aria-expanded",
        String(!menu.classList.contains("hidden")),
      );
      return;
    }
    const placeholder = event.target.closest("[data-vehicle-placeholder]");
    if (placeholder) {
      root
        .querySelectorAll(".vehicles-action-menu")
        .forEach((menu) => menu.classList.add("hidden"));
      if (placeholder.dataset.vehiclePlaceholder === "add")
        window.showDashboardAlert?.(
          "Vehicle creation will be connected when the Vehicles API is available.",
          { title: "Coming next", type: "info" },
        );
      else
        window.showDashboardAlert?.(
          `${placeholder.textContent.trim()} is not available in this UI-only preview.`,
          { title: "Preview action", type: "info" },
        );
      return;
    }
    if (event.target.closest("[data-vehicle-export]")) exportVehiclesCsv();
  });
  if (!vehicleDocumentEventsBound) {
    vehicleDocumentEventsBound = true;
    document.addEventListener("click", (event) => {
      const mountedRoot = document.querySelector(".vehicles-page");
      if (!event.target.closest(".vehicles-actions"))
        mountedRoot
          ?.querySelectorAll(".vehicles-action-menu")
          .forEach((menu) => menu.classList.add("hidden"));
    });
  }
}
async function loadVehiclesPage() {
  const container = document.querySelector("#vehicles-container");
  if (!container) return;
  const mountedRoot = container.querySelector(".vehicles-page");
  if (container.dataset.loaded !== "true" || !mountedRoot) {
    destroyVehicleCharts();
    vehicleState.root = null;
    const response = await fetch("/pages/vehicles.html");
    if (!response.ok)
      throw new Error(`Unable to load Vehicles page: ${response.status}`);
    container.innerHTML = await response.text();
    container.dataset.loaded = "true";
  }
  initializeVehiclesPage();
}
