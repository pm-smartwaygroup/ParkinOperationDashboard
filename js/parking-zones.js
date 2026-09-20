const PARKING_ZONE_DEMO_DATA = Object.freeze([
  { id: "ZONE-001", name: "Zone A - Main Entrance", subtitle: "Primary customer parking", location: "Riyadh - Business District", used: 120, capacity: 150, price: "10 SAR / hour", status: "Active", notes: "Main entrance customer parking" },
  { id: "ZONE-002", name: "Zone B - VIP", subtitle: "Premium parking for VIP customers", location: "Riyadh - Business District", used: 50, capacity: 50, price: "20 SAR / hour", status: "Active", notes: "Premium parking" },
  { id: "ZONE-003", name: "Zone C - Mall Area", subtitle: "Mall building parking", location: "Riyadh Park Mall", used: 200, capacity: 300, price: "8 SAR / hour", status: "Active", notes: "Mall building parking" },
  { id: "ZONE-004", name: "Zone D - Maintenance", subtitle: "Under maintenance", location: "Granada Center", used: 0, capacity: 100, price: "—", status: "Maintenance", notes: "Under maintenance" },
  { id: "ZONE-005", name: "Zone E - Closed", subtitle: "Temporarily closed", location: "King Abdullah Road", used: 0, capacity: 80, price: "—", status: "Inactive", notes: "Temporarily closed" },
  ...Array.from({ length: 17 }, (_, index) => ({
    id: `ZONE-${String(index + 6).padStart(3, "0")}`,
    name: `Zone ${String.fromCharCode(70 + index)} - ${["North Gate", "West Wing", "South Plaza", "Office District"][index % 4]}`,
    subtitle: "Operational parking area",
    location: ["Riyadh - Business District", "Riyadh Park Mall", "Granada Center", "King Abdullah Road"][index % 4],
    used: [18, 22, 26, 12, 15][index % 5],
    capacity: 30,
    price: "10 SAR / hour",
    status: "Active",
    notes: "Operational parking area",
  })),
  { id: "ZONE-023", name: "Zone W - Service Area", subtitle: "Under maintenance", location: "Riyadh Park Mall", used: 0, capacity: 25, price: "—", status: "Maintenance", notes: "Service access maintenance" },
  { id: "ZONE-024", name: "Zone X - Event Overflow", subtitle: "Temporarily closed", location: "King Abdullah Road", used: 0, capacity: 25, price: "—", status: "Inactive", notes: "Event overflow area" },
]);

const parkingZoneState = {
  root: null,
  map: null,
  mapContainer: null,
  mapMarkers: new Map(),
  mapInfoWindow: null,
  locationControl: null,
  userMarker: null,
  mapReady: false,
  search: "",
  location: "all",
  status: "all",
  sort: "name-asc",
  page: 1,
  pageSize: 5,
  view: "list",
  selectedId: "ZONE-001",
  openMenuId: null,
  searchTimer: null,
};

const PARKING_ZONE_MAP_CENTER = { lat: 24.7136, lng: 46.6753 };
const PARKING_ZONE_MAP_COORDINATES = Object.freeze({
  "ZONE-001": { lat: 24.7136, lng: 46.6753 },
  "ZONE-002": { lat: 24.7285, lng: 46.6687 },
  "ZONE-003": { lat: 24.7557, lng: 46.6304 },
  "ZONE-004": { lat: 24.7817, lng: 46.7305 },
  "ZONE-005": { lat: 24.7437, lng: 46.6748 },
  "ZONE-006": { lat: 24.6888, lng: 46.685 },
  "ZONE-007": { lat: 24.7009, lng: 46.6883 },
  "ZONE-008": { lat: 24.7355, lng: 46.681 },
  "ZONE-009": { lat: 24.7995, lng: 46.6032 },
  "ZONE-010": { lat: 24.7745, lng: 46.637 },
  "ZONE-011": { lat: 24.795, lng: 46.6065 },
  "ZONE-012": { lat: 24.839, lng: 46.6665 },
  "ZONE-013": { lat: 24.817, lng: 46.752 },
  "ZONE-014": { lat: 24.7455, lng: 46.747 },
  "ZONE-015": { lat: 24.724, lng: 46.732 },
  "ZONE-016": { lat: 24.691, lng: 46.735 },
  "ZONE-017": { lat: 24.667, lng: 46.716 },
  "ZONE-018": { lat: 24.808, lng: 46.69 },
  "ZONE-019": { lat: 24.675, lng: 46.605 },
  "ZONE-020": { lat: 24.85, lng: 46.625 },
  "ZONE-021": { lat: 24.71, lng: 46.79 },
  "ZONE-022": { lat: 24.69, lng: 46.655 },
  "ZONE-023": { lat: 24.759, lng: 46.629 },
  "ZONE-024": { lat: 24.743, lng: 46.705 },
});

function parkingZoneMapPosition(zone) {
  return PARKING_ZONE_MAP_COORDINATES[zone.id];
}

function parkingZoneEscape(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function parkingZoneStatusClass(status) {
  return String(status || "").toLowerCase();
}

function parkingZoneFilteredData() {
  const query = parkingZoneState.search.trim().toLowerCase();
  const rows = PARKING_ZONE_DEMO_DATA.filter((zone) => {
    const searchable = `${zone.name} ${zone.location} ${zone.subtitle} ${zone.notes}`.toLowerCase();
    return (!query || searchable.includes(query)) &&
      (parkingZoneState.location === "all" || zone.location === parkingZoneState.location) &&
      (parkingZoneState.status === "all" || zone.status === parkingZoneState.status);
  });
  return rows.sort((a, b) => {
    if (parkingZoneState.sort === "name-desc") return b.name.localeCompare(a.name);
    if (parkingZoneState.sort === "capacity-desc") return b.capacity - a.capacity || a.name.localeCompare(b.name);
    if (parkingZoneState.sort === "capacity-asc") return a.capacity - b.capacity || a.name.localeCompare(b.name);
    return a.name.localeCompare(b.name);
  });
}

function parkingZoneCapacity(zone) {
  return `${zone.used} / ${zone.capacity}`;
}

function parkingZoneProgress(zone) {
  return Math.min(100, Math.round((zone.used / zone.capacity) * 100));
}

function parkingZoneKpiIcon(type) {
  const icons = {
    parking: "/public/assets/parking-zones/kpi-total-zones.svg",
    capacity: "/public/assets/parking-zones/kpi-capacity.svg",
    active: "/public/assets/parking-zones/kpi-active.svg",
    inactive: "/public/assets/parking-zones/kpi-inactive.svg",
  };
  const path = icons[type] || icons.parking;
  return `<img src="${path}" alt="" aria-hidden="true" />`;
}

function renderParkingZoneKpis(root) {
  const totalCapacity = PARKING_ZONE_DEMO_DATA.reduce((sum, zone) => sum + zone.capacity, 0);
  const active = PARKING_ZONE_DEMO_DATA.filter((zone) => zone.status === "Active").length;
  const nonOperational = PARKING_ZONE_DEMO_DATA.filter((zone) => zone.status !== "Active").length;
  const cards = [
    ["Total Zones", PARKING_ZONE_DEMO_DATA.length, "Across all locations", "parking", "blue"],
    ["Total Capacity", totalCapacity.toLocaleString(), "Parking spaces", "capacity", "green"],
    ["Active Zones", active, "Currently operational", "active", "blue"],
    ["Inactive Zones", nonOperational, "Temporarily closed", "inactive", "red"],
  ];
  root.querySelector("[data-zone-kpis]").innerHTML = cards.map(([label, value, detail, icon, tone]) => `
    <article class="parking-zone-kpi-card">
      <span class="parking-zone-kpi-icon parking-zone-kpi-icon--${tone}">${parkingZoneKpiIcon(icon)}</span>
      <div><span>${label}</span><strong>${value}</strong><small>${detail}</small></div>
    </article>`).join("");
}

function renderParkingZoneStatusSummary(root) {
  const counts = ["Active", "Maintenance", "Inactive"].map((status) => ({
    status,
    count: PARKING_ZONE_DEMO_DATA.filter((zone) => zone.status === status).length,
  }));
  root.querySelector("[data-zone-status-list]").innerHTML = counts.map(({ status, count }) => `
    <div class="parking-zone-status-row"><span><i class="parking-zone-status-dot parking-zone-status-dot--${parkingZoneStatusClass(status)}"></i>${status}</span><strong>${count}</strong></div>`).join("");
}

function zoneRowMarkup(zone) {
  const statusClass = parkingZoneStatusClass(zone.status);
  return `<div class="parking-zone-table-row" data-zone-row data-zone-id="${zone.id}">
    <span class="parking-zone-check-cell"><input type="checkbox" aria-label="Select ${parkingZoneEscape(zone.name)}" data-zone-select /></span>
    <span class="parking-zone-name-cell"><span class="parking-zone-row-mark parking-zone-row-mark--${statusClass}">P</span><span><strong>${parkingZoneEscape(zone.name)}</strong><small>${parkingZoneEscape(zone.subtitle)}</small></span></span>
    <span class="parking-zone-location-cell"><i class="fa-solid fa-location-dot" aria-hidden="true"></i>${parkingZoneEscape(zone.location)}</span>
    <span class="parking-zone-capacity-cell"><strong>${parkingZoneCapacity(zone)}</strong><span class="parking-zone-progress"><i class="parking-zone-progress--${statusClass}" style="width:${parkingZoneProgress(zone)}%"></i></span></span>
    <span class="parking-zone-price-cell">${parkingZoneEscape(zone.price)}</span>
    <span><span class="parking-zone-status parking-zone-status--${statusClass}"><i></i>${parkingZoneEscape(zone.status)}</span></span>
    <span class="parking-zone-actions"><button type="button" data-zone-action-menu="${zone.id}" aria-label="Actions for ${parkingZoneEscape(zone.name)}"><i class="fa-solid fa-ellipsis" aria-hidden="true"></i></button><span class="parking-zone-action-menu ${parkingZoneState.openMenuId === zone.id ? "is-open" : ""}" data-zone-menu="${zone.id}"><button type="button" data-zone-action="view" data-zone-id="${zone.id}">View Zone</button><button type="button" data-zone-action="edit" data-zone-id="${zone.id}">Edit Zone</button><button type="button" data-zone-action="status" data-zone-id="${zone.id}">Change Status</button></span></span>
  </div>`;
}

function zoneCardMarkup(zone) {
  const statusClass = parkingZoneStatusClass(zone.status);
  return `<article class="parking-zone-grid-card" data-zone-row data-zone-id="${zone.id}"><div class="parking-zone-grid-card-heading"><span class="parking-zone-row-mark parking-zone-row-mark--${statusClass}">P</span><span class="parking-zone-actions"><button type="button" data-zone-action-menu="${zone.id}" aria-label="Actions for ${parkingZoneEscape(zone.name)}"><i class="fa-solid fa-ellipsis" aria-hidden="true"></i></button><span class="parking-zone-action-menu ${parkingZoneState.openMenuId === zone.id ? "is-open" : ""}" data-zone-menu="${zone.id}"><button type="button" data-zone-action="view" data-zone-id="${zone.id}">View Zone</button><button type="button" data-zone-action="edit" data-zone-id="${zone.id}">Edit Zone</button><button type="button" data-zone-action="status" data-zone-id="${zone.id}">Change Status</button></span></span></div><strong>${parkingZoneEscape(zone.name)}</strong><small>${parkingZoneEscape(zone.location)}</small><div class="parking-zone-grid-meta"><span>Capacity <b>${parkingZoneCapacity(zone)}</b></span><span>Price <b>${parkingZoneEscape(zone.price)}</b></span></div><span class="parking-zone-status parking-zone-status--${statusClass}"><i></i>${parkingZoneEscape(zone.status)}</span></article>`;
}

function renderParkingZoneResults(root) {
  const results = parkingZoneFilteredData();
  const pageCount = Math.max(1, Math.ceil(results.length / parkingZoneState.pageSize));
  parkingZoneState.page = Math.min(parkingZoneState.page, pageCount);
  const start = (parkingZoneState.page - 1) * parkingZoneState.pageSize;
  const pageRows = results.slice(start, start + parkingZoneState.pageSize);
  const resultsRoot = root.querySelector("[data-zone-results]");
  resultsRoot.classList.toggle("is-grid", parkingZoneState.view === "grid");
  resultsRoot.innerHTML = parkingZoneState.view === "grid"
    ? pageRows.map(zoneCardMarkup).join("")
    : `<div class="parking-zone-table-head"><span><input type="checkbox" data-zone-select-all aria-label="Select all visible zones" /></span><span>ZONE NAME</span><span>LOCATION</span><span>CAPACITY</span><span>PRICING (SAR)</span><span>STATUS</span><span>ACTIONS</span></div>${pageRows.map(zoneRowMarkup).join("")}`;
  const from = results.length ? start + 1 : 0;
  const to = Math.min(start + parkingZoneState.pageSize, results.length);
  root.querySelector("[data-zone-pagination]").innerHTML = `<span>Showing ${from} to ${to} of ${results.length || 0} zones</span><div><button type="button" data-zone-page="prev" aria-label="Previous page">‹</button>${Array.from({ length: pageCount }, (_, index) => `<button type="button" class="${index + 1 === parkingZoneState.page ? "is-active" : ""}" data-zone-page="${index + 1}">${index + 1}</button>`).join("")}<button type="button" data-zone-page="next" aria-label="Next page">›</button></div>`;
  updateParkingZoneMarkers();
}

function parkingZoneMarkerIcon(status) {
  const colors = { Active: "#0a9b55", Maintenance: "#f49a2e", Inactive: "#e25454" };
  const color = colors[status] || colors.Active;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="38" height="46" viewBox="0 0 38 46"><path fill="${color}" d="M19 1C8.5 1 1 8.4 1 18.2c0 11.5 14.2 24.3 17.2 26.8a1.2 1.2 0 0 0 1.6 0C22.8 42.5 37 29.7 37 18.2 37 8.4 29.5 1 19 1Z"/><circle cx="19" cy="18" r="10" fill="#fff"/><text x="19" y="22" fill="${color}" font-family="Arial,sans-serif" font-size="12" font-weight="700" text-anchor="middle">P</text></svg>`;
  return { url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`, scaledSize: new google.maps.Size(38, 46), anchor: new google.maps.Point(19, 46) };
}

function parkingZoneInfoWindowContent(zone) {
  return `<div class="parking-zone-google-info"><strong>${parkingZoneEscape(zone.name)}</strong><span class="parking-zone-google-info-status parking-zone-google-info-status--${parkingZoneStatusClass(zone.status)}">${parkingZoneEscape(zone.status)}</span><span><i class="fa-solid fa-square-parking"></i>${parkingZoneCapacity(zone)} spaces</span><span><i class="fa-solid fa-location-dot"></i>${parkingZoneEscape(zone.location)}</span></div>`;
}

function parkingZoneHasFilters() {
  return Boolean(parkingZoneState.search.trim()) || parkingZoneState.location !== "all" || parkingZoneState.status !== "all";
}

function resetParkingZoneMapView() {
  if (!parkingZoneState.map) return;
  parkingZoneState.map.setCenter(PARKING_ZONE_MAP_CENTER);
  parkingZoneState.map.setZoom(11);
}

function fitParkingZoneMapToFilteredResults() {
  if (!parkingZoneState.map) return;
  if (!parkingZoneHasFilters()) {
    resetParkingZoneMapView();
    return;
  }
  const visibleZones = parkingZoneFilteredData();
  if (!visibleZones.length) return;
  if (visibleZones.length === 1) {
    parkingZoneState.map.setCenter(parkingZoneMapPosition(visibleZones[0]));
    parkingZoneState.map.setZoom(14);
    return;
  }
  const bounds = new google.maps.LatLngBounds();
  visibleZones.forEach((zone) => bounds.extend(parkingZoneMapPosition(zone)));
  parkingZoneState.map.fitBounds(bounds, 50);
  google.maps.event.addListenerOnce(parkingZoneState.map, "bounds_changed", () => {
    if (parkingZoneState.map.getZoom() > 15) parkingZoneState.map.setZoom(15);
  });
}

function updateParkingZoneMarkers() {
  if (!parkingZoneState.map) return;
  const visibleIds = new Set(parkingZoneFilteredData().map((zone) => zone.id));
  parkingZoneState.mapMarkers.forEach((marker, id) => marker.setMap(visibleIds.has(id) ? parkingZoneState.map : null));
}

function showParkingZoneMapError(root) {
  root.querySelector("[data-zone-map-error]")?.classList.remove("hidden");
}

function locateParkingZoneUser() {
  if (!parkingZoneState.map || !navigator.geolocation) {
    showParkingZoneToast(parkingZoneState.root, "Unable to access your current location.");
    return;
  }
  navigator.geolocation.getCurrentPosition(
    ({ coords }) => {
      const position = { lat: coords.latitude, lng: coords.longitude };
      if (!parkingZoneState.userMarker) {
        parkingZoneState.userMarker = new google.maps.Marker({
          map: parkingZoneState.map,
          position,
          title: "Your current location",
          icon: {
            path: google.maps.SymbolPath.CIRCLE,
            scale: 8,
            fillColor: "#2563eb",
            fillOpacity: 1,
            strokeColor: "#fff",
            strokeWeight: 3,
          },
        });
      } else {
        parkingZoneState.userMarker.setPosition(position);
        parkingZoneState.userMarker.setMap(parkingZoneState.map);
      }
      parkingZoneState.map.panTo(position);
      parkingZoneState.map.setZoom(15);
    },
    () => showParkingZoneToast(parkingZoneState.root, "Unable to access your current location."),
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 300000 },
  );
}

function ensureParkingZoneLocationControl() {
  if (parkingZoneState.locationControl || !parkingZoneState.map) return;
  const control = document.createElement("button");
  control.type = "button";
  control.className = "parking-zones-location-control";
  control.setAttribute("aria-label", "Current location");
  control.title = "Current location";
  control.innerHTML = '<i class="fa-solid fa-location-crosshairs" aria-hidden="true"></i>';
  control.addEventListener("click", locateParkingZoneUser);
  parkingZoneState.locationControl = control;
  parkingZoneState.map.controls[google.maps.ControlPosition.LEFT_TOP].push(control);
}

function waitForGoogleMaps() {
  if (window.google?.maps?.Map && window.google.maps.Marker) return Promise.resolve(true);
  return new Promise((resolve) => {
    const startedAt = Date.now();
    const check = () => {
      if (window.google?.maps?.Map && window.google.maps.Marker) return resolve(true);
      if (Date.now() - startedAt > 10000) return resolve(false);
      window.setTimeout(check, 100);
    };
    check();
  });
}

function parkingZonesMapBelongsToContainer(mapElement) {
  return Boolean(
    parkingZoneState.map &&
    parkingZoneState.mapContainer === mapElement &&
    mapElement.isConnected &&
    mapElement.querySelector(".gm-style"),
  );
}

function resetParkingZonesMapState() {
  parkingZoneState.mapMarkers.forEach((marker) => marker.setMap(null));
  parkingZoneState.mapMarkers.clear();
  parkingZoneState.mapInfoWindow?.close();
  parkingZoneState.mapInfoWindow = null;
  parkingZoneState.userMarker?.setMap(null);
  parkingZoneState.userMarker = null;
  parkingZoneState.locationControl = null;
  parkingZoneState.map = null;
  parkingZoneState.mapContainer = null;
  parkingZoneState.mapReady = false;
}

function scheduleParkingZonesMapResize(map) {
  const resize = () => {
    if (!map || !parkingZoneState.mapContainer?.isConnected) return;
    google.maps.event.trigger(map, "resize");
    map.setCenter(PARKING_ZONE_MAP_CENTER);
  };
  window.requestAnimationFrame(() => window.requestAnimationFrame(resize));
}

async function initParkingZonesMap(root) {
  const mapElement = root.querySelector("#parking-zones-map");
  if (!mapElement) return;
  const mapsReady = await waitForGoogleMaps();
  if (!mapsReady) {
    if (!parkingZoneState.mapReady) console.error("Parking Zones Google Map unavailable: Google Maps API did not load.");
    showParkingZoneMapError(root);
    return;
  }

  if (parkingZonesMapBelongsToContainer(mapElement)) {
    scheduleParkingZonesMapResize(parkingZoneState.map);
    updateParkingZoneMarkers();
    return;
  }

  if (parkingZoneState.map) resetParkingZonesMapState();
  mapElement.replaceChildren();

  parkingZoneState.map = new google.maps.Map(mapElement, {
    center: PARKING_ZONE_MAP_CENTER,
    zoom: 11,
    zoomControl: true,
    zoomControlOptions: {
      position: google.maps.ControlPosition.LEFT_TOP,
    },
    mapTypeControl: false,
    streetViewControl: false,
    fullscreenControl: true,
  });
  parkingZoneState.mapContainer = mapElement;
  ensureParkingZoneLocationControl();
  parkingZoneState.mapInfoWindow = new google.maps.InfoWindow();
  PARKING_ZONE_DEMO_DATA.forEach((zone) => {
    const marker = new google.maps.Marker({
      map: parkingZoneState.map,
      position: parkingZoneMapPosition(zone),
      title: zone.name,
      icon: parkingZoneMarkerIcon(zone.status),
    });
    marker.addListener("click", () => {
      parkingZoneState.selectedId = zone.id;
      parkingZoneState.mapInfoWindow.setContent(parkingZoneInfoWindowContent(zone));
      parkingZoneState.mapInfoWindow.open({ map: parkingZoneState.map, anchor: marker });
    });
    parkingZoneState.mapMarkers.set(zone.id, marker);
  });

  parkingZoneState.mapReady = true;
  updateParkingZoneMarkers();
}

function showParkingZoneToast(root, message) {
  const toast = root.querySelector("[data-zone-toast]");
  toast.textContent = message;
  toast.classList.add("is-visible");
  clearTimeout(toast._hideTimer);
  toast._hideTimer = setTimeout(() => toast.classList.remove("is-visible"), 2400);
}

function bindParkingZoneEvents(root) {
  if (root.dataset.bound === "true") return;
  root.dataset.bound = "true";
  root.addEventListener("input", (event) => {
    if (!event.target.matches("[data-zone-search]")) return;
    clearTimeout(parkingZoneState.searchTimer);
    parkingZoneState.searchTimer = setTimeout(() => {
      parkingZoneState.search = event.target.value;
      parkingZoneState.page = 1;
      renderParkingZoneResults(root);
      fitParkingZoneMapToFilteredResults();
    }, 160);
  });
  root.addEventListener("change", (event) => {
    const target = event.target;
    if (target.matches("[data-zone-location-filter]")) parkingZoneState.location = target.value;
    if (target.matches("[data-zone-status-filter]")) parkingZoneState.status = target.value;
    if (target.matches("[data-zone-sort]")) parkingZoneState.sort = target.value;
    if (target.matches("[data-zone-location-filter], [data-zone-status-filter], [data-zone-sort]")) {
      parkingZoneState.page = 1;
      renderParkingZoneResults(root);
      fitParkingZoneMapToFilteredResults();
    }
  });
  root.addEventListener("click", (event) => {
    if (event.target.closest("[data-zone-add]")) {
      window.location.hash = "#add-zone";
      return;
    }
    const menuButton = event.target.closest("[data-zone-action-menu]");
    if (menuButton) {
      parkingZoneState.openMenuId = parkingZoneState.openMenuId === menuButton.dataset.zoneActionMenu ? null : menuButton.dataset.zoneActionMenu;
      renderParkingZoneResults(root);
      return;
    }
    const action = event.target.closest("[data-zone-action]");
    if (action) {
      const zone = PARKING_ZONE_DEMO_DATA.find((item) => item.id === action.dataset.zoneId);
      parkingZoneState.openMenuId = null;
      renderParkingZoneResults(root);
      showParkingZoneToast(root, `${action.dataset.zoneAction === "view" ? zone?.name : `${action.textContent} is ready for the next implementation phase.`}`);
      return;
    }
    const pageButton = event.target.closest("[data-zone-page]");
    if (pageButton) {
      const results = parkingZoneFilteredData();
      const pageCount = Math.max(1, Math.ceil(results.length / parkingZoneState.pageSize));
      if (pageButton.dataset.zonePage === "prev") parkingZoneState.page = Math.max(1, parkingZoneState.page - 1);
      else if (pageButton.dataset.zonePage === "next") parkingZoneState.page = Math.min(pageCount, parkingZoneState.page + 1);
      else parkingZoneState.page = Number(pageButton.dataset.zonePage);
      renderParkingZoneResults(root);
      return;
    }
    root.querySelectorAll("[data-zone-menu].is-open").forEach((menu) => {
      if (!event.target.closest(`[data-zone-menu="${menu.dataset.zoneMenu}"]`)) menu.classList.remove("is-open");
    });
    const viewButton = event.target.closest("[data-zone-view]");
    if (viewButton) {
      parkingZoneState.view = viewButton.dataset.zoneView === "grid" ? "grid" : "list";
      root.querySelectorAll("[data-zone-view]").forEach((button) => button.classList.toggle("is-active", button === viewButton));
      if (viewButton.dataset.zoneView === "map") {
        parkingZoneState.view = "list";
        root.querySelectorAll("[data-zone-view]").forEach((button) => button.classList.toggle("is-active", button.dataset.zoneView === "list"));
        root.querySelector("[data-zone-map]")?.scrollIntoView({ behavior: "smooth", block: "center" });
        showParkingZoneToast(root, "Map view is available above.");
      }
      renderParkingZoneResults(root);
    }
  });
}

function renderParkingZonesPage(root) {
  const locations = [...new Set(PARKING_ZONE_DEMO_DATA.map((zone) => zone.location))].sort();
  const locationFilter = root.querySelector("[data-zone-location-filter]");
  locationFilter.innerHTML = '<option value="all">All Locations</option>' + locations.map((location) => `<option value="${parkingZoneEscape(location)}">${parkingZoneEscape(location)}</option>`).join("");
  locationFilter.value = parkingZoneState.location;
  root.querySelector("[data-zone-status-filter]").value = parkingZoneState.status;
  root.querySelector("[data-zone-sort]").value = parkingZoneState.sort;
  renderParkingZoneKpis(root);
  renderParkingZoneStatusSummary(root);
  renderParkingZoneResults(root);
}

async function initParkingZonesPage() {
  const root = document.querySelector("[data-parking-zones-page]");
  if (!root) return;
  if (parkingZoneState.root !== root) {
    parkingZoneState.root = root;
    bindParkingZoneEvents(root);
  }
  renderParkingZonesPage(root);
  await initParkingZonesMap(root);
}

async function loadParkingZonesPage() {
  const container = document.querySelector("#parking-zones-container");
  if (!container) return;
  if (!container.querySelector("[data-parking-zones-page]")) {
    const response = await fetch("/pages/parking-zones.html");
    if (!response.ok) throw new Error(`Unable to load Parking Zones page: ${response.status}`);
    container.innerHTML = await response.text();
    parkingZoneState.root = null;
  }
  await initParkingZonesPage();
}

window.initParkingZonesPage = initParkingZonesPage;
window.loadParkingZonesPage = loadParkingZonesPage;
