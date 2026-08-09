let fullMap = null;

const valetMapLocations = [
  { name: "Riyadh", count: 8, lat: 24.7136, lng: 46.6753 },
  { name: "Jeddah", count: 5, lat: 21.4858, lng: 39.1925 },
  { name: "Dammam", count: 6, lat: 26.4207, lng: 50.0888 },
  { name: "Makkah", count: 4, lat: 21.3891, lng: 39.8579 },
];

async function loadValetOperationsPage() {
  const container = document.querySelector("#valet-operations-container");
  if (!container) return;

  if (container.dataset.loaded !== "true") {
    const response = await fetch("/pages/valet-operations.html");
    const html = await response.text();

    container.innerHTML = html;
    container.dataset.loaded = "true";
  }

  bindValetMapEvents();
  bindValetTabs();
  setTimeout(initActivityOverviewChart, 100);
  setTimeout(initValetGoogleMap, 100);
  setTimeout(initQueueSummaryChart, 100);
}

function bindValetMapEvents() {
  document
    .querySelector("#open-full-map")
    ?.addEventListener("click", openFullMap);

  document.querySelector("#close-full-map")?.addEventListener("click", () => {
    document.querySelector("#full-map-modal")?.classList.add("hidden");
  });

  document
    .querySelector("#full-map-modal")
    ?.addEventListener("click", (event) => {
      if (event.target.id === "full-map-modal") {
        event.target.classList.add("hidden");
      }
    });
}

function bindValetTabs() {
  document.querySelectorAll("[data-valet-tab]").forEach((button) => {
    button.addEventListener("click", () => {
      const tab = button.dataset.valetTab;

      document.querySelectorAll("[data-valet-tab]").forEach((btn) => {
        btn.classList.toggle("active", btn === button);
      });

      document.querySelectorAll(".valet-tab-content").forEach((content) => {
        const isActive = content.id === `valet-tab-${tab}`;

        content.classList.toggle("hidden", !isActive);
        content.classList.toggle("active", isActive);
      });

      if (tab === "activity") {
        setTimeout(initActivityOverviewChart, 80);
      }

      if (tab === "live") {
        setTimeout(initValetGoogleMap, 80);
      }
      if (tab === "queue") {
        setTimeout(initQueueSummaryChart, 80);
      }
      if (tab === "incidents") {
        setTimeout(initIncidentOverviewChart, 80);
      }
    });
  });
}

let activityOverviewChart = null;

function initActivityOverviewChart() {
  const canvas = document.querySelector("#activity-overview-chart");
  if (!canvas || typeof Chart === "undefined") return;

  if (activityOverviewChart) {
    activityOverviewChart.destroy();
  }

  activityOverviewChart = new Chart(canvas, {
    type: "doughnut",
    data: {
      labels: ["Parking", "Pickup", "Drivers", "Payments", "Incidents"],
      datasets: [
        {
          data: [98, 72, 38, 24, 16],
          backgroundColor: [
            "#2563eb",
            "#0f9f5c",
            "#7c3aed",
            "#f59e0b",
            "#ef4444",
          ],
          borderWidth: 0,
          spacing: 2,
        },
      ],
    },
    options: {
      responsive: false,
      cutout: "64%",
      plugins: {
        legend: { display: false },
        tooltip: { enabled: true },
      },
    },
  });
}

let queueSummaryChart = null;

function initQueueSummaryChart() {
  const canvas = document.querySelector("#queue-summary-chart");
  if (!canvas || typeof Chart === "undefined") return;

  if (queueSummaryChart) {
    queueSummaryChart.destroy();
  }

  queueSummaryChart = new Chart(canvas, {
    type: "doughnut",
    data: {
      labels: ["Waiting", "Calling Driver", "En Route", "Arrived"],
      datasets: [
        {
          data: [38, 12, 4, 2],
          backgroundColor: ["#f59e0b", "#2563eb", "#7c3aed", "#0f9f5c"],
          borderWidth: 0,
          spacing: 2,
        },
      ],
    },
    options: {
      responsive: false,
      cutout: "64%",
      plugins: {
        legend: { display: false },
        tooltip: { enabled: true },
      },
    },
  });
}

let incidentOverviewChart = null;

function initIncidentOverviewChart() {
  const canvas = document.querySelector("#incident-overview-chart");
  if (!canvas || typeof Chart === "undefined") return;

  if (incidentOverviewChart) {
    incidentOverviewChart.destroy();
  }

  incidentOverviewChart = new Chart(canvas, {
    type: "doughnut",
    data: {
      labels: ["Open", "In Progress", "Resolved", "Closed"],
      datasets: [
        {
          data: [18, 10, 12, 2],
          backgroundColor: ["#ef4444", "#2563eb", "#0f9f5c", "#9ca3af"],
          borderWidth: 0,
          spacing: 2,
        },
      ],
    },
    options: {
      responsive: false,
      cutout: "64%",
      plugins: {
        legend: { display: false },
        tooltip: { enabled: true },
      },
    },
  });
}

function initValetGoogleMap() {
  const mapElement = document.querySelector("#valet-google-map");
  if (!mapElement || typeof google === "undefined") return;

  const map = new google.maps.Map(mapElement, {
    center: { lat: 23.8859, lng: 45.0792 },
    zoom: 5,
    mapTypeControl: false,
    streetViewControl: false,
    fullscreenControl: true,
  });

  addValetMarkers(map);
}

function openFullMap() {
  const modal = document.querySelector("#full-map-modal");
  const fullMapElement = document.querySelector("#full-google-map");

  if (!modal || !fullMapElement || typeof google === "undefined") return;

  modal.classList.remove("hidden");

  setTimeout(() => {
    if (!fullMap) {
      fullMap = new google.maps.Map(fullMapElement, {
        center: { lat: 23.8859, lng: 45.0792 },
        zoom: 6,
        mapTypeControl: true,
        streetViewControl: false,
        fullscreenControl: true,
      });

      addValetMarkers(fullMap);
    }

    google.maps.event.trigger(fullMap, "resize");
    fullMap.setCenter({ lat: 23.8859, lng: 45.0792 });
  }, 150);
}

function addValetMarkers(map) {
  valetMapLocations.forEach((location) => {
    new google.maps.Marker({
      map,
      position: {
        lat: location.lat,
        lng: location.lng,
      },
      label: String(location.count),
      title: `${location.name} - ${location.count} active operations`,
    });
  });
}
