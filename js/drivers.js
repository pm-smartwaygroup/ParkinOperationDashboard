let driversCompanyChart = null;
let driversLocationChart = null;
let driversStatusChart = null;
let driverDocumentUploader = null;
let driverDetailsComponent = null;
let editDriverComponent = null;
const DRIVER_DRAFT_STORAGE_KEY = "parkinActiveDriverDraftId";

let activeDriverDraftId = localStorage.getItem(DRIVER_DRAFT_STORAGE_KEY);

let activeDriverDraftVersion = 1;
let isDriverFormDirty = false;
let selectedDriverVehicles = [];
let driverVehicleCatalog = new Map();

let pendingDriverVehicleIds = new Set();

function getDriverApiBaseUrl() {
  return (
    window.PARKIN_CONFIG?.apiBaseUrl ||
    "https://api.parkin.com.sa"
  );
}

function getDriverAuthHeaders(includeJson = false) {
  const accessToken = localStorage.getItem("parkin_access_token");

  if (!accessToken) {
    throw new Error("Your login session has expired. Please sign in again.");
  }

  const headers = {
    Authorization: `Bearer ${accessToken}`,
  };

  if (includeJson) {
    headers["Content-Type"] = "application/json";
  }

  return headers;
}

function getDriverFieldValue(id) {
  return document.querySelector(`#${id}`)?.value?.trim() || "";
}

function splitDriverFullName(fullName) {
  const normalizedName = String(fullName || "")
    .trim()
    .replace(/\s+/g, " ");

  const nameParts = normalizedName.split(" ");

  const firstName = nameParts.shift() || "";

  const lastName = nameParts.join(" ") || "";

  return {
    firstName,
    lastName,
  };
}

function mapDriverTypeToApi(value) {
  const normalizedValue = String(value || "")
    .trim()
    .toLowerCase();

  const driverTypeMap = {
    independent_driver: "OTHER",
    "independent driver": "OTHER",

    valet_company_driver: "VALET_DRIVER",
    "valet company driver": "VALET_DRIVER",

    valet_driver: "VALET_DRIVER",
    "valet driver": "VALET_DRIVER",
    valet: "VALET_DRIVER",

    parking_attendant: "PARKING_ATTENDANT",
    "parking attendant": "PARKING_ATTENDANT",

    supervisor: "SUPERVISOR",

    shuttle_driver: "SHUTTLE_DRIVER",
    "shuttle driver": "SHUTTLE_DRIVER",

    other: "OTHER",
  };

  return driverTypeMap[normalizedValue] || "OTHER";
}

function getDriverTypeDisplayText(backendValue) {
  const select = document.getElementById("driverType");

  const selectedText = select?.selectedOptions?.[0]?.textContent?.trim();

  if (selectedText) {
    return selectedText;
  }

  const labels = {
    OTHER: "Independent Driver",
    VALET_DRIVER: "Valet Company Driver",
    PARKING_ATTENDANT: "Parking Attendant",
    SUPERVISOR: "Supervisor",
    SHUTTLE_DRIVER: "Shuttle Driver",
  };

  return labels[backendValue] || formatDriverReviewEnum(backendValue);
}

function collectDriverDetailsPayload() {
  const fullName = getDriverFieldValue("fullName");

  const { firstName, lastName } = splitDriverFullName(fullName);

  return {
    firstName,
    lastName,

    phoneCountryCode: getDriverFieldValue("phoneCountryCode") || "+966",

    phoneNumber: getDriverFieldValue("phoneNumber"),

    email: getDriverFieldValue("driverEmail") || null,

    dateOfBirth: getDriverFieldValue("dateOfBirth") || null,

    nationality: getDriverFieldValue("nationality") || null,

    idType: getDriverFieldValue("idType") || null,

    idNumber: getDriverFieldValue("idNumber") || null,

    idExpiryDate: getDriverFieldValue("idExpiryDate") || null,

    driverType: mapDriverTypeToApi(getDriverFieldValue("driverType")),

    licenseNumber: getDriverFieldValue("licenseNumber") || null,

    licenseExpiryDate: getDriverFieldValue("licenseExpiryDate") || null,

    licenseType: getDriverFieldValue("licenseType") || null,

    joiningDate: getDriverFieldValue("joiningDate") || null,

    /*
     * Employment / company information.
     */
    companyId: getDriverFieldValue("companyId"),

    branchId: getDriverFieldValue("branchId") || null,

    employeeId: getDriverFieldValue("employeeId") || null,

    supervisorId: getDriverFieldValue("supervisorId") || null,

    /*
     * Contact address.
     */
    address: getDriverFieldValue("address"),

    city: getDriverFieldValue("city"),

    region: getDriverFieldValue("region"),

    postalCode: getDriverFieldValue("postalCode") || null,

    version:
      Number.isInteger(activeDriverDraftVersion) &&
      activeDriverDraftVersion >= 1
        ? activeDriverDraftVersion
        : 1,
  };
}

function mapDriverTypeFromApi(value) {
  const driverTypeMap = {
    VALET_DRIVER: ["Valet Driver", "valet-driver", "VALET_DRIVER"],

    PARKING_ATTENDANT: [
      "Parking Attendant",
      "parking-attendant",
      "PARKING_ATTENDANT",
    ],

    SUPERVISOR: ["Supervisor", "supervisor", "SUPERVISOR"],

    SHUTTLE_DRIVER: ["Shuttle Driver", "shuttle-driver", "SHUTTLE_DRIVER"],

    /*
     * Currently Independent Driver is
     * saved to the backend as OTHER.
     */
    OTHER: ["Independent Driver", "independent-driver", "OTHER", "Other"],
  };

  return driverTypeMap[value] || [value];
}

async function parseDriverDraftResponse(response) {
  const result = await response.json().catch(() => null);

  if (!response.ok) {
    const message = Array.isArray(result?.message)
      ? result.message.join(", ")
      : result?.message ||
        result?.error ||
        `Request failed with status ${response.status}.`;

    const error = new Error(message);

    error.status = response.status;

    error.currentVersion =
      Number(result?.currentVersion ?? result?.data?.currentVersion) || null;

    error.payload = result;

    throw error;
  }

  return result?.data ?? result;
}

async function refreshActiveDriverDraftVersion(draftId = activeDriverDraftId) {
  if (!draftId) {
    return activeDriverDraftVersion;
  }

  const response = await fetch(
    `${getDriverApiBaseUrl()}/driver-drafts/${draftId}`,
    {
      method: "GET",
      headers: getDriverAuthHeaders(),
    },
  );

  const draft = await parseDriverDraftResponse(response);

  const latestVersion = Number(draft?.version);

  if (Number.isInteger(latestVersion) && latestVersion >= 1) {
    activeDriverDraftVersion = latestVersion;
  }

  return activeDriverDraftVersion;
}

function initializeDriverDocumentUploader(container) {
  if (typeof DriverDocumentUploader === "undefined") {
    console.error(
      "DriverDocumentUploader.js is not loaded. " +
        "Load it before the main dashboard JavaScript.",
    );

    return;
  }

  driverDocumentUploader?.destroy();
  driverDocumentUploader = null;

  const documentsRoot = container.querySelector("#driver-step-documents");

  if (!documentsRoot) {
    console.error("Driver document step was not found.");

    return;
  }

  driverDocumentUploader = new DriverDocumentUploader({
    root: documentsRoot,

    uploadUrl: `${getDriverApiBaseUrl()}/drivers/documents`,

    deleteUrl: `${getDriverApiBaseUrl()}/drivers/documents`,

    driverId: sessionStorage.getItem("currentDriverId"),

    onUploadComplete: async (uploadedDocument, upload) => {
      console.log("Document uploaded:", uploadedDocument);

      console.log("Document type:", upload.documentType);

      try {
        await refreshActiveDriverDraftVersion();
      } catch (versionError) {
        console.warn(
          "Unable to refresh driver draft version after document upload:",
          versionError,
        );
      }
      const validation = driverDocumentUploader?.validateRequiredDocuments();

      if (validation?.valid) {
        window.document
          .querySelector("#document-required-warning")
          ?.classList.remove("visible");

        window.document
          .querySelectorAll(
            "#driver-step-documents " + ".document-card.has-error",
          )
          .forEach((card) => {
            card.classList.remove("has-error");
          });
      }
    },

    onUploadError: (message, upload) => {
      console.error(
        `Document upload failed for ` + `${upload.documentType}:`,
        message,
      );
    },
  });

  driverDocumentUploader.init();
}

function escapeDriverHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatDriverListDate(value) {
  if (!value) {
    return "—";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

function formatDriverListPhone(driver) {
  const countryCode = String(driver?.phoneCountryCode || "").trim();

  const phoneNumber = String(driver?.phoneNumber || "").trim();

  if (!countryCode && !phoneNumber) {
    return "—";
  }

  return `${countryCode} ${phoneNumber}`.trim();
}

function getDriverListType(driverType) {
  const labels = {
    OTHER: "Independent Driver",
    VALET_DRIVER: "Valet Company Driver",
    PARKING_ATTENDANT: "Parking Attendant",
    SUPERVISOR: "Supervisor",
    SHUTTLE_DRIVER: "Shuttle Driver",
  };

  return labels[driverType] || formatDriverReviewEnum(driverType);
}

function getDriverListStatus(status) {
  const statuses = {
    ACTIVE: {
      label: "Active",
      className: "on",
    },

    ON_DUTY: {
      label: "On Duty",
      className: "on",
    },

    OFF_DUTY: {
      label: "Off Duty",
      className: "off",
    },

    ON_BREAK: {
      label: "On Break",
      className: "break",
    },

    SUSPENDED: {
      label: "Suspended",
      className: "suspended",
    },

    PENDING_ACTIVATION: {
      label: "Pending Activation",
      className: "pending",
    },

    INACTIVE: {
      label: "Inactive",
      className: "off",
    },
  };

  return (
    statuses[status] || {
      label: formatDriverReviewEnum(status),
      className: "off",
    }
  );
}

function getDriverListPhoto(driver, index) {
  void index;

  return driver?.profilePhotoUrl || "";
}

function createDriverListRow(driver, index) {
  const driverId = escapeDriverHtml(driver.id);

  const driverCode = escapeDriverHtml(driver.driverCode || "—");

  const fullName = escapeDriverHtml(
    driver.fullName ||
      [driver.firstName, driver.middleName, driver.lastName]
        .filter(Boolean)
        .join(" ") ||
      "Unnamed Driver",
  );

  const type = escapeDriverHtml(getDriverListType(driver.driverType));

  const companyName = escapeDriverHtml(
    driver.companyName ||
      driver.employment?.company?.name ||
      (driver.driverType === "OTHER" ? "Independent" : "—"),
  );

  const phone = escapeDriverHtml(formatDriverListPhone(driver));

  const email = escapeDriverHtml(driver.email || "—");

  const licenseNumber = escapeDriverHtml(driver.licenseNumber || "—");

  const licenseExpiry = escapeDriverHtml(
    formatDriverListDate(driver.licenseExpiryDate),
  );

  const primaryAssignment =
    driver.assignments?.find((assignment) => assignment.isPrimary) ||
    driver.assignments?.[0];

  const locationName = escapeDriverHtml(
    driver.locationName || primaryAssignment?.location?.name || "Not assigned",
  );

  const zoneName = escapeDriverHtml(
    driver.zoneName || primaryAssignment?.zoneCode || "—",
  );

  const vehicleCount = Number(
    driver.assignedVehicleCount ??
      driver.vehicleAssignments?.length ??
      driver.vehicleCount ??
      0,
  );

  const vehicleLabel = escapeDriverHtml(
    driver.vehicleRegistration ||
      (vehicleCount > 0
        ? `${vehicleCount} assigned ${
            vehicleCount === 1 ? "vehicle" : "vehicles"
          }`
        : "No assigned vehicle"),
  );

  const status = getDriverListStatus(driver.status);

  const profilePhoto = escapeDriverHtml(getDriverListPhoto(driver, index));

  const driverInitials = fullName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((name) => name.charAt(0))
    .join("")
    .toUpperCase();

  return `
    <div
      class="drivers-row"
      data-driver-id="${driverId}"
    >
      <span class="driver-profile">
  <span class="driver-avatar-wrap">
    ${
      profilePhoto
        ? `
          <img
            src="${profilePhoto}"
            alt="${fullName}"
            loading="lazy"
            onerror="
              this.style.display='none';
              this.nextElementSibling.style.display='grid';
            "
          />
        `
        : ""
    }

    <span
      class="driver-profile-fallback"
      style="${profilePhoto ? "display:none;" : "display:grid;"}"
    >
      ${driverInitials || "DR"}
    </span>
  </span>

  <b>
          ${fullName}

          <small class="driver-meta">
            ${driverCode} <br>
            ${escapeDriverHtml(status.label)}
          </small>
        </b>
      </span>

      <span>
        <b>${type}</b>
        <small>${companyName}</small>
      </span>

      <span>
        ${phone}
        <small>${email}</small>
      </span>

      <span>
        ${licenseNumber}
        <small class="valid">
          Exp: ${licenseExpiry}
        </small>
      </span>

      <span>
        ${locationName}
        <small>${zoneName}</small>
      </span>

      <span>
        ${vehicleCount}
        <small>${vehicleLabel}</small>
      </span>

      <strong class="driver-status ${escapeDriverHtml(status.className)}">
        ${escapeDriverHtml(status.label)}
      </strong>

      <span>⭐ —</span>

      <div class="driver-row-actions">
        <button
          type="button"
          class="driver-row-more-btn"
          aria-label="Driver actions"
          aria-expanded="false"
        >
          <i class="fa-solid fa-ellipsis-vertical"></i>
        </button>

        <div class="driver-row-actions-menu hidden">
          <button
            type="button"
            data-driver-action="view"
          >
            <i class="fa-regular fa-eye"></i>
            View Details
          </button>

          <button
            type="button"
            data-driver-action="edit"
          >
            <i class="fa-regular fa-pen-to-square"></i>
            Edit Driver
          </button>

          <button
            type="button"
            class="danger"
            data-driver-action="suspend"
          >
            <i class="fa-solid fa-circle-pause"></i>
            Suspend Driver
          </button>
        </div>
      </div>
    </div>
  `;
}

function renderDriversList(drivers) {
  const listBody = document.querySelector("#drivers-list-body");

  const title = document.querySelector("#drivers-list-title");

  const loading = document.querySelector("#drivers-list-loading");

  if (!listBody) {
    throw new Error("Drivers list container was not found.");
  }

  loading?.remove();

  const safeDrivers = Array.isArray(drivers) ? drivers : [];

  if (title) {
    title.textContent = `Drivers List (${safeDrivers.length})`;
  }

  if (safeDrivers.length === 0) {
    listBody.innerHTML = `
      <div class="drivers-list-empty">
        <i class="fa-solid fa-user-group"></i>

        <h3>No drivers found</h3>

        <p>
          Add your first driver to start managing driver records.
        </p>
      </div>
    `;

    return;
  }

  listBody.innerHTML = safeDrivers
    .map((driver, index) => createDriverListRow(driver, index))
    .join("");
}

function renderDriversListError(message) {
  const listBody = document.querySelector("#drivers-list-body");

  const loading = document.querySelector("#drivers-list-loading");

  loading?.remove();

  if (!listBody) {
    return;
  }

  listBody.innerHTML = `
    <div class="drivers-list-empty drivers-list-error">
      <i class="fa-solid fa-triangle-exclamation"></i>

      <h3>Unable to load driver records</h3>

      <p>${escapeDriverHtml(message)}</p>

      <button
        type="button"
        class="btn-primary"
        id="retry-drivers-list"
      >
        Try Again
      </button>
    </div>
  `;

  document
    .querySelector("#retry-drivers-list")
    ?.addEventListener("click", loadDriversFromApi);
}

async function loadDriversFromApi() {
  const listBody = document.querySelector("#drivers-list-body");

  if (listBody) {
    listBody.innerHTML = "";
  }

  try {
    const response = await fetch(`${getDriverApiBaseUrl()}/drivers`, {
      method: "GET",
      headers: getDriverAuthHeaders(),
    });

    const result = await response.json().catch(() => null);

    if (!response.ok) {
      const message = Array.isArray(result?.message)
        ? result.message.join(", ")
        : result?.message ||
          result?.error ||
          `Unable to load drivers: ${response.status}`;

      throw new Error(message);
    }

    const drivers = Array.isArray(result?.data)
      ? result.data
      : Array.isArray(result)
        ? result
        : [];

    renderDriversList(drivers);

    /*
     * Bind the action menu after the real rows
     * have been inserted into the DOM.
     */
    bindDriverRowActions();
  } catch (error) {
    console.error("Unable to retrieve drivers:", error);

    renderDriversListError(error?.message || "Please refresh and try again.");
  }
}

async function loadDriversPage() {
  const container = document.querySelector("#drivers-container");

  if (!container) {
    console.error("#drivers-container was not found.");

    return;
  }

  try {
    if (container.dataset.loaded !== "true" || !container.innerHTML.trim()) {
      container.innerHTML = `
        <section class="page-loading-state">
          <i class="fa-solid fa-spinner fa-spin"></i>
          <p>Loading drivers...</p>
        </section>
      `;

      const response = await fetch("/pages/drivers.html");

      if (!response.ok) {
        throw new Error(`Unable to load Drivers page: ${response.status}`);
      }

      container.innerHTML = await response.text();

      container.dataset.loaded = "true";
    }

    bindDriversActions();

    /*
     * Retrieve and render permanent drivers.
     */
    await loadDriversFromApi();

    bindDriversScrollReveal();
  } catch (error) {
    console.error("Unable to load Drivers page:", error);

    container.dataset.loaded = "false";

    container.innerHTML = `
      <section class="page-load-error">
        <i class="fa-solid fa-triangle-exclamation"></i>

        <h2>Unable to load Drivers</h2>

        <p>
          ${escapeDriverHtml(error?.message || "Please refresh and try again.")}
        </p>

        <button
          type="button"
          id="retry-drivers-page"
          class="btn-primary"
        >
          Try Again
        </button>
      </section>
    `;

    container
      .querySelector("#retry-drivers-page")
      ?.addEventListener("click", () => {
        loadDriversPage();
      });
  }
}

async function loadDriverDetailsPage(driverId) {
  const view = document.querySelector("#driver-details-view");

  const container = document.querySelector("#driver-details-container");

  if (!view || !container) {
    console.error("Driver Details view or container was not found.");

    return;
  }

  hideAllDriverViews();

  view.classList.remove("hidden");

  sessionStorage.setItem("selectedDriverId", driverId);

  if (typeof DriverDetailsView === "undefined") {
    console.error("DriverDetailsView.js is not loaded.");

    return;
  }

  driverDetailsComponent?.destroy();

  driverDetailsComponent = new DriverDetailsView({
    container,
    driverId,
  });

  await driverDetailsComponent.load(driverId);
}

function hideAllDriverViews() {
  const selectors = [
    "#drivers-view",
    "#add-driver-view",
    "#driver-details-view",
    "#edit-driver-view",
  ];

  selectors.forEach((selector) => {
    document.querySelector(selector)?.classList.add("hidden");
  });
}

async function loadEditDriverPage(driverId) {
  const view = document.querySelector("#edit-driver-view");

  const container = document.querySelector("#edit-driver-container");

  if (!view || !container) {
    console.error("Edit Driver view or container was not found.");
    return;
  }

  view.classList.remove("hidden");

  const safeDriverId =
    driverId || sessionStorage.getItem("selectedDriverId") || "DRV-1001";

  sessionStorage.setItem("selectedDriverId", safeDriverId);

  if (typeof EditDriverView === "undefined") {
    console.error("EditDriverView.js is not loaded.");

    container.innerHTML = `
      <section class="page-load-error">
        <h2>Edit Driver component is unavailable</h2>
        <p>EditDriverView.js was not loaded.</p>
      </section>
    `;

    return;
  }

  editDriverComponent?.destroy();

  editDriverComponent = new EditDriverView({
    container,
    driverId: safeDriverId,
    pageUrl: "/pages/edit-driver.html",
  });

  await editDriverComponent.load(safeDriverId);
}

function bindDriverRowActions() {
  const rows = document.querySelectorAll(".drivers-row[data-driver-id]");

  rows.forEach((row) => {
    const moreButton = row.querySelector(".driver-row-more-btn");

    const menu = row.querySelector(".driver-row-actions-menu");

    if (!moreButton || !menu || moreButton.dataset.bound === "true") {
      return;
    }

    moreButton.dataset.bound = "true";

    moreButton.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();

      document
        .querySelectorAll(".driver-row-actions-menu")
        .forEach((otherMenu) => {
          if (otherMenu !== menu) {
            otherMenu.classList.add("hidden");
          }
        });

      document
        .querySelectorAll(".driver-row-more-btn")
        .forEach((otherButton) => {
          if (otherButton !== moreButton) {
            otherButton.setAttribute("aria-expanded", "false");
          }
        });

      const shouldOpen = menu.classList.contains("hidden");

      if (shouldOpen) {
        const rect = moreButton.getBoundingClientRect();

        const menuWidth = 210;
        const menuGap = 8;
        const screenPadding = 12;

        let left = rect.right - menuWidth;

        if (left < screenPadding) {
          left = screenPadding;
        }

        if (left + menuWidth > window.innerWidth - screenPadding) {
          left = window.innerWidth - menuWidth - screenPadding;
        }

        let top = rect.bottom + menuGap;

        menu.classList.remove("hidden");

        const menuHeight = menu.offsetHeight;

        if (top + menuHeight > window.innerHeight - screenPadding) {
          top = rect.top - menuHeight - menuGap;
        }

        menu.style.top = `${top}px`;
        menu.style.left = `${left}px`;
      } else {
        menu.classList.add("hidden");
      }

      moreButton.setAttribute("aria-expanded", String(shouldOpen));
    });

    menu.querySelectorAll("[data-driver-action]").forEach((actionButton) => {
      actionButton.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();

        const driverId = row.dataset.driverId;

        const action = actionButton.dataset.driverAction;

        menu.classList.add("hidden");

        moreButton.setAttribute("aria-expanded", "false");

        if (action === "view") {
          sessionStorage.setItem("selectedDriverId", driverId);

          window.location.hash = `driver-details?id=${encodeURIComponent(
            driverId,
          )}`;

          return;
        }

        if (action === "edit") {
          sessionStorage.setItem("selectedDriverId", driverId);

          window.location.hash = "edit-driver";

          return;
        }

        if (action === "suspend") {
          console.log("Suspend driver:", driverId);
        }
      });
    });
  });

  if (document.body.dataset.driverMenuBound !== "true") {
    document.body.dataset.driverMenuBound = "true";

    document.addEventListener("click", closeDriverRowMenus);

    window.addEventListener("resize", closeDriverRowMenus);

    window.addEventListener("scroll", closeDriverRowMenus, true);
  }
}

function closeDriverRowMenus() {
  document.querySelectorAll(".driver-row-actions-menu").forEach((menu) => {
    menu.classList.add("hidden");
  });

  document.querySelectorAll(".driver-row-more-btn").forEach((button) => {
    button.setAttribute("aria-expanded", "false");
  });
}

function bindDriversActions() {
  const addButton = document.querySelector(".drivers-add-btn");

  if (!addButton || addButton.dataset.bound === "true") {
    return;
  }

  addButton.dataset.bound = "true";

  addButton.addEventListener("click", () => {
    window.location.hash = "add-driver";
  });
}

function createDriverDoughnutChart(canvasId, data, colors) {
  const canvas = document.querySelector(canvasId);
  if (!canvas || typeof Chart === "undefined") return null;

  return new Chart(canvas, {
    type: "doughnut",
    data: {
      datasets: [
        {
          data,
          backgroundColor: colors,
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

function setDriverFieldValue(id, value) {
  const field = document.querySelector(`#${id}`);

  if (!field || value == null) {
    return;
  }

  field.value = String(value);
}

function setDriverSelectValue(id, possibleValues) {
  const select = document.querySelector(`#${id}`);

  if (!select) {
    return;
  }

  const values = Array.isArray(possibleValues)
    ? possibleValues
    : [possibleValues];

  const normalizedValues = values
    .filter(Boolean)
    .map((value) => String(value).trim().toLowerCase());

  const matchingOption = Array.from(select.options).find((option) => {
    const optionValue = String(option.value).trim().toLowerCase();

    const optionText = String(option.textContent).trim().toLowerCase();

    return normalizedValues.some(
      (value) => value === optionValue || value === optionText,
    );
  });

  if (matchingOption) {
    select.value = matchingOption.value;

    select.dispatchEvent(
      new Event("change", {
        bubbles: true,
      }),
    );

    return;
  }

  console.warn(`No matching option found for #${id}:`, values);
}

function restoreDriverDetailsForm(draft) {
  const details = draft?.details || draft?.driverDetails || draft;

  if (!details) {
    return;
  }

  const restoredFullName = [details.firstName, details.lastName]
    .filter(Boolean)
    .join(" ")
    .trim();

  setDriverFieldValue("fullName", restoredFullName || details.fullName || "");

  setDriverFieldValue("phoneCountryCode", details.phoneCountryCode);

  setDriverFieldValue("phoneNumber", details.phoneNumber);

  setDriverFieldValue("driverEmail", details.email);

  setDriverFieldValue(
    "dateOfBirth",
    details.dateOfBirth?.slice?.(0, 10) || details.dateOfBirth,
  );

  setDriverFieldValue("nationality", details.nationality);

  setDriverFieldValue("idType", details.idType);

  setDriverFieldValue("idNumber", details.idNumber);

  setDriverFieldValue(
    "idExpiryDate",
    details.idExpiryDate?.slice?.(0, 10) || details.idExpiryDate,
  );

  setDriverSelectValue("driverType", mapDriverTypeFromApi(details.driverType));

  setDriverFieldValue("licenseNumber", details.licenseNumber);

  setDriverFieldValue(
    "licenseExpiryDate",
    details.licenseExpiryDate?.slice?.(0, 10) || details.licenseExpiryDate,
  );

  setDriverFieldValue("licenseType", details.licenseType);

  setDriverFieldValue(
    "joiningDate",
    details.joiningDate?.slice?.(0, 10) || details.joiningDate,
  );

  setDriverFieldValue("companyId", details.companyId);

  setDriverFieldValue("branchId", details.branchId);

  setDriverFieldValue("employeeId", details.employeeId);

  setDriverFieldValue("supervisorId", details.supervisorId);

  setDriverFieldValue("address", details.address);

  setDriverFieldValue("city", details.city);

  setDriverFieldValue("region", details.region);

  setDriverFieldValue("postalCode", details.postalCode);
}

function getSelectedDriverAssignmentValues(selectId) {
  const select = document.getElementById(selectId);

  if (!select) {
    return [];
  }

  return Array.from(select.selectedOptions)
    .map((option) => option.value.trim())
    .filter(Boolean);
}

function escapeDriverVehicleHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function getDriverVehicleAccessLevel() {
  const value = document
    .querySelector("#driver-assignment-access")
    ?.value?.trim()
    .toUpperCase();

  const validValues = new Set(["STANDARD", "VIP", "RESTRICTED"]);

  return validValues.has(value) ? value : "STANDARD";
}

function formatDriverVehicleAccessLevel(value) {
  const labels = {
    STANDARD: "Standard Access",
    VIP: "VIP Access",
    RESTRICTED: "Restricted Access",
  };

  return labels[value] || "Standard Access";
}

function getDriverVehiclePlate(vehicle) {
  if (vehicle?.plateDisplayEnglish) {
    return vehicle.plateDisplayEnglish;
  }

  const letters = String(vehicle?.plateLettersEnglish || "")
    .split("")
    .filter(Boolean)
    .join(" ");

  return [vehicle?.plateNumberEnglish, letters].filter(Boolean).join(" ");
}

function normalizeDriverVehicle(vehicle) {
  return {
    ...vehicle,

    id: vehicle.id,

    plateDisplayEnglish: getDriverVehiclePlate(vehicle),

    accessLevel: vehicle.accessLevel || getDriverVehicleAccessLevel(),
  };
}

function renderAssignedDriverVehicles() {
  const table = document.querySelector(".assigned-vehicle-table");

  if (!table) {
    return;
  }

  table
    .querySelectorAll(".assigned-empty, .assigned-vehicle-row")
    .forEach((element) => element.remove());

  if (selectedDriverVehicles.length === 0) {
    table.insertAdjacentHTML(
      "beforeend",
      `
        <div class="assigned-empty">
          <i class="fa-solid fa-car"></i>

          <b>No vehicles assigned yet</b>

          <p>
            You can assign vehicles that this driver is allowed to operate.
          </p>
        </div>
      `,
    );

    return;
  }

  const rows = selectedDriverVehicles
    .map((vehicle) => {
      const accessLevel = vehicle.accessLevel || getDriverVehicleAccessLevel();

      const typeText = [vehicle.vehicleType, vehicle.bodyType]
        .filter(Boolean)
        .join(" · ");

      const description = [vehicle.make, vehicle.model, vehicle.year]
        .filter(Boolean)
        .join(" ");

      return `
        <div
          class="assigned-vehicle-row"
          data-assigned-vehicle-id="${escapeDriverVehicleHtml(vehicle.id)}"
        >
          <div class="assigned-vehicle-plate">
            <span class="assigned-vehicle-icon">
              <i class="fa-solid fa-car-side"></i>
            </span>

            <span>
              <b>
                ${escapeDriverVehicleHtml(getDriverVehiclePlate(vehicle))}
              </b>

              <small>
                ${escapeDriverVehicleHtml(description || "Vehicle")}
              </small>
            </span>
          </div>

          <div class="assigned-vehicle-type">
            <b>
              ${escapeDriverVehicleHtml(vehicle.vehicleType || "Vehicle")}
            </b>

            <small>
              ${escapeDriverVehicleHtml(typeText || "Not specified")}
            </small>
          </div>

          <div>
            <span
              class="assigned-vehicle-access ${escapeDriverVehicleHtml(
                accessLevel.toLowerCase(),
              )}"
            >
              ${escapeDriverVehicleHtml(
                formatDriverVehicleAccessLevel(accessLevel),
              )}
            </span>
          </div>

          <div class="assigned-vehicle-action">
            <button
              type="button"
              data-remove-driver-vehicle="${escapeDriverVehicleHtml(
                vehicle.id,
              )}"
              aria-label="Remove assigned vehicle"
            >
              <i class="fa-solid fa-trash-can"></i>
              Remove
            </button>
          </div>
        </div>
      `;
    })
    .join("");

  table.insertAdjacentHTML("beforeend", rows);

  table.querySelectorAll("[data-remove-driver-vehicle]").forEach((button) => {
    button.addEventListener("click", () => {
      const vehicleId = button.dataset.removeDriverVehicle;

      selectedDriverVehicles = selectedDriverVehicles.filter(
        (vehicle) => vehicle.id !== vehicleId,
      );

      isDriverFormDirty = true;

      renderAssignedDriverVehicles();
    });
  });
}

function ensureDriverVehicleModal() {
  let modal = document.querySelector("#driver-vehicle-modal");

  if (modal) {
    return modal;
  }

  modal = document.createElement("div");

  modal.id = "driver-vehicle-modal";
  modal.className = "driver-vehicle-modal hidden";

  modal.setAttribute("aria-hidden", "true");

  modal.innerHTML = `
    <button
      type="button"
      class="driver-vehicle-modal-backdrop"
      data-close-driver-vehicle-modal
      aria-label="Close vehicle selection"
    ></button>

    <section
      class="driver-vehicle-modal-card"
      role="dialog"
      aria-modal="true"
      aria-labelledby="driver-vehicle-modal-title"
    >
      <header class="driver-vehicle-modal-header">
        <div class="driver-vehicle-modal-title">
          <span>
            <i class="fa-solid fa-car-side"></i>
          </span>

          <div>
            <h2 id="driver-vehicle-modal-title">
              Assign Vehicles
            </h2>

            <p>
              Select one or more company vehicles for this driver.
            </p>
          </div>
        </div>

        <button
          type="button"
          class="driver-vehicle-modal-close"
          data-close-driver-vehicle-modal
          aria-label="Close"
        >
          <i class="fa-solid fa-xmark"></i>
        </button>
      </header>

      <div class="driver-vehicle-modal-tools">
  <label class="driver-vehicle-search">
    <i class="fa-solid fa-magnifying-glass"></i>

    <input
      type="search"
      id="driver-vehicle-search"
      placeholder="Search plate, make, model, VIN or customer..."
      autocomplete="off"
    />
  </label>

  <button
    type="button"
    id="open-driver-new-vehicle"
    class="driver-vehicle-new-btn"
  >
    <i class="fa-solid fa-plus"></i>
    New Vehicle
  </button>

  <button
    type="button"
    id="refresh-driver-vehicles"
    class="driver-vehicle-refresh"
    aria-label="Refresh vehicles"
  >
    <i class="fa-solid fa-rotate"></i>
  </button>
</div>

      <div
        class="driver-vehicle-options"
        id="driver-vehicle-options"
      ></div>

      <footer class="driver-vehicle-modal-footer">
        <span id="driver-vehicle-selected-count">
          0 vehicles selected
        </span>

        <div>
          <button
            type="button"
            class="driver-vehicle-cancel"
            data-close-driver-vehicle-modal
          >
            Cancel
          </button>

          <button
            type="button"
            class="driver-vehicle-confirm"
            id="confirm-driver-vehicle-selection"
          >
          <i class="fa-solid fa-check"></i>
          Apply Selection
          </button>
        </div>
      </footer>
    </section>
  `;

  document.body.appendChild(modal);

  return modal;
}

function ensureDriverNewVehicleModal() {
  let modal = document.querySelector("#driver-new-vehicle-modal");

  if (modal) {
    return modal;
  }

  const currentYear = new Date().getFullYear();

  const plateLetters = [
    "A",
    "B",
    "D",
    "G",
    "H",
    "J",
    "K",
    "L",
    "N",
    "R",
    "S",
    "T",
    "U",
    "V",
    "X",
    "Z",
  ];

  const letterOptions = plateLetters
    .map((letter) => `<option value="${letter}">${letter}</option>`)
    .join("");

  modal = document.createElement("div");

  modal.id = "driver-new-vehicle-modal";
  modal.className = "driver-new-vehicle-modal hidden";

  modal.setAttribute("aria-hidden", "true");

  modal.innerHTML = `
    <button
      type="button"
      class="driver-new-vehicle-backdrop"
      data-close-driver-new-vehicle
      aria-label="Close new vehicle form"
    ></button>

    <section
      class="driver-new-vehicle-card"
      role="dialog"
      aria-modal="true"
      aria-labelledby="driver-new-vehicle-title"
    >
      <header class="driver-new-vehicle-header">
        <div>
          <span>
            <i class="fa-solid fa-car-side"></i>
          </span>

          <div>
            <h2 id="driver-new-vehicle-title">
              Add New Vehicle
            </h2>

            <p>
              Create a company vehicle and assign it
              without leaving this driver.
            </p>
          </div>
        </div>

        <button
          type="button"
          class="driver-new-vehicle-close"
          data-close-driver-new-vehicle
          aria-label="Close"
        >
          <i class="fa-solid fa-xmark"></i>
        </button>
      </header>

      <form id="driver-new-vehicle-form">
        <div class="driver-new-vehicle-grid">
          <label>
            <span>Vehicle Type <b>*</b></span>

            <select
              id="driver-new-vehicle-type"
              required
            >
              <option value="">Select type</option>
              <option value="Car">Car</option>
              <option value="SUV">SUV</option>
              <option value="Van">Van</option>
              <option value="Truck">Truck</option>
              <option value="Motorcycle">
                Motorcycle
              </option>
              <option value="Other">Other</option>
            </select>
          </label>

          <label>
            <span>Make <b>*</b></span>

            <input
              id="driver-new-vehicle-make"
              type="text"
              maxlength="100"
              placeholder="Toyota"
              required
            />
          </label>

          <label>
            <span>Model <b>*</b></span>

            <input
              id="driver-new-vehicle-model"
              type="text"
              maxlength="100"
              placeholder="Camry"
              required
            />
          </label>

          <label>
            <span>Year <b>*</b></span>

            <input
              id="driver-new-vehicle-year"
              type="number"
              min="1950"
              max="${currentYear + 1}"
              value="${currentYear}"
              required
            />
          </label>

          <label>
            <span>Color <b>*</b></span>

            <input
              id="driver-new-vehicle-color"
              type="text"
              maxlength="50"
              placeholder="White"
              required
            />
          </label>

          <label>
            <span>Body Type</span>

            <select id="driver-new-vehicle-body">
              <option value="">Select body type</option>
              <option value="Sedan">Sedan</option>
              <option value="SUV">SUV</option>
              <option value="Hatchback">
                Hatchback
              </option>
              <option value="Coupe">Coupe</option>
              <option value="Pickup">Pickup</option>
              <option value="Van">Van</option>
              <option value="Other">Other</option>
            </select>
          </label>
        </div>

        <div class="driver-new-vehicle-plate-section">
          <div>
            <h3>Saudi Plate Number</h3>

            <p>
              Enter four digits and select three
              supported letters.
            </p>
          </div>

          <div class="driver-new-vehicle-plate-grid">
            <label class="driver-new-vehicle-number">
              <span>Numbers <b>*</b></span>

              <input
                id="driver-new-vehicle-plate-number"
                type="text"
                inputmode="numeric"
                maxlength="4"
                pattern="[0-9]{4}"
                placeholder="5150"
                required
              />
            </label>

            <label>
              <span>Letter 1 <b>*</b></span>

              <select
                id="driver-new-vehicle-letter-1"
                required
              >
                ${letterOptions}
              </select>
            </label>

            <label>
              <span>Letter 2 <b>*</b></span>

              <select
                id="driver-new-vehicle-letter-2"
                required
              >
                ${letterOptions}
              </select>
            </label>

            <label>
              <span>Letter 3 <b>*</b></span>

              <select
                id="driver-new-vehicle-letter-3"
                required
              >
                ${letterOptions}
              </select>
            </label>
          </div>

          <div class="driver-new-vehicle-plate-preview">
            <span>KSA</span>

            <strong id="driver-new-vehicle-plate-preview">
              ---- A A A
            </strong>
          </div>
        </div>

        <div class="driver-new-vehicle-grid driver-new-vehicle-grid--optional">
          <label>
            <span>VIN</span>

            <input
              id="driver-new-vehicle-vin"
              type="text"
              maxlength="17"
              placeholder="17-character VIN"
            />
          </label>

          <label>
            <span>Engine Number</span>

            <input
              id="driver-new-vehicle-engine"
              type="text"
              maxlength="100"
              placeholder="Engine number"
            />
          </label>

          <label>
            <span>Mileage</span>

            <input
              id="driver-new-vehicle-mileage"
              type="number"
              min="0"
              max="10000000"
              placeholder="0"
            />
          </label>
        </div>

        <label class="driver-new-vehicle-notes">
          <span>Notes</span>

          <textarea
            id="driver-new-vehicle-notes"
            maxlength="500"
            placeholder="Optional vehicle notes"
          ></textarea>
        </label>

        <div
          class="driver-new-vehicle-error hidden"
          id="driver-new-vehicle-error"
          role="alert"
        ></div>

        <footer class="driver-new-vehicle-footer">
          <button
            type="button"
            class="driver-new-vehicle-cancel"
            data-close-driver-new-vehicle
          >
            Cancel
          </button>

          <button
            type="submit"
            class="driver-new-vehicle-save"
            id="save-driver-new-vehicle"
          >
            <i class="fa-solid fa-floppy-disk"></i>
            Create & Select Vehicle
          </button>
        </footer>
      </form>
    </section>
  `;

  document.body.appendChild(modal);

  bindDriverNewVehicleModal(modal);

  return modal;
}

function openDriverNewVehicleModal() {
  const modal = ensureDriverNewVehicleModal();

  const form = modal.querySelector("#driver-new-vehicle-form");

  form?.reset();

  const modalCard = modal.querySelector(".driver-new-vehicle-card");

  if (modalCard) {
    modalCard.scrollTop = 0;
  }

  const currentYear = new Date().getFullYear();

  const yearInput = modal.querySelector("#driver-new-vehicle-year");

  if (yearInput) {
    yearInput.value = String(currentYear);
  }

  hideDriverNewVehicleError(modal);

  updateDriverNewVehiclePlatePreview(modal);

  modal.classList.remove("hidden");

  modal.setAttribute("aria-hidden", "false");

  modal.querySelector("#driver-new-vehicle-type")?.focus();
}

function closeDriverNewVehicleModal() {
  const modal = document.querySelector("#driver-new-vehicle-modal");

  modal?.classList.add("hidden");

  modal?.setAttribute("aria-hidden", "true");
}

function updateDriverNewVehiclePlatePreview(modal) {
  const plateNumber =
    modal.querySelector("#driver-new-vehicle-plate-number")?.value?.trim() ||
    "----";

  const letters = [
    modal.querySelector("#driver-new-vehicle-letter-1")?.value,
    modal.querySelector("#driver-new-vehicle-letter-2")?.value,
    modal.querySelector("#driver-new-vehicle-letter-3")?.value,
  ]
    .filter(Boolean)
    .join(" ");

  const preview = modal.querySelector("#driver-new-vehicle-plate-preview");

  if (preview) {
    preview.textContent = `${plateNumber || "----"} ${letters || "A A A"}`;
  }
}

function showDriverNewVehicleError(modal, message) {
  const errorElement = modal.querySelector("#driver-new-vehicle-error");

  if (!errorElement) {
    return;
  }

  errorElement.textContent = message;

  errorElement.classList.remove("hidden");
}

function hideDriverNewVehicleError(modal) {
  const errorElement = modal.querySelector("#driver-new-vehicle-error");

  if (!errorElement) {
    return;
  }

  errorElement.textContent = "";

  errorElement.classList.add("hidden");
}

function collectDriverNewVehiclePayload(modal) {
  const getValue = (selector) =>
    modal.querySelector(selector)?.value?.trim() || "";

  const plateNumberEnglish = getValue("#driver-new-vehicle-plate-number");

  const plateLettersEnglish = [
    getValue("#driver-new-vehicle-letter-1"),
    getValue("#driver-new-vehicle-letter-2"),
    getValue("#driver-new-vehicle-letter-3"),
  ]
    .join("")
    .toUpperCase();

  if (!/^[0-9]{4}$/.test(plateNumberEnglish)) {
    throw new Error("Plate number must contain exactly four digits.");
  }

  if (!/^[ABDGHJKLNRSTUVXZ]{3}$/.test(plateLettersEnglish)) {
    throw new Error("Please select three valid plate letters.");
  }

  const vin = getValue("#driver-new-vehicle-vin").toUpperCase();

  if (vin && !/^[A-HJ-NPR-Z0-9]{17}$/.test(vin)) {
    throw new Error("VIN must contain exactly 17 valid characters.");
  }

  const mileageValue = getValue("#driver-new-vehicle-mileage");

  return {
    vehicleType: getValue("#driver-new-vehicle-type"),

    make: getValue("#driver-new-vehicle-make"),

    model: getValue("#driver-new-vehicle-model"),

    year: Number(getValue("#driver-new-vehicle-year")),

    color: getValue("#driver-new-vehicle-color"),

    bodyType: getValue("#driver-new-vehicle-body") || undefined,

    plateCountryCode: "SA",

    plateNumberEnglish,

    plateLettersEnglish,

    vin: vin || undefined,

    engineNumber: getValue("#driver-new-vehicle-engine") || undefined,

    mileage: mileageValue === "" ? undefined : Number(mileageValue),

    notes: getValue("#driver-new-vehicle-notes") || undefined,

    isPrimaryForCustomer: false,

    status: "ACTIVE",
  };
}

async function createDriverVehicleFromModal(modal) {
  const form = modal.querySelector("#driver-new-vehicle-form");

  const saveButton = modal.querySelector("#save-driver-new-vehicle");

  hideDriverNewVehicleError(modal);

  if (!form?.checkValidity()) {
    form?.reportValidity();
    return;
  }

  let payload;

  try {
    payload = collectDriverNewVehiclePayload(modal);
  } catch (error) {
    showDriverNewVehicleError(
      modal,
      error?.message || "Please check the vehicle details.",
    );

    return;
  }

  const originalButtonHtml = saveButton?.innerHTML;

  try {
    if (saveButton) {
      saveButton.disabled = true;

      saveButton.innerHTML = `
        <i class="fa-solid fa-spinner fa-spin"></i>
        Creating Vehicle...
      `;
    }

    const response = await fetch(`${getDriverApiBaseUrl()}/vehicles`, {
      method: "POST",

      headers: getDriverAuthHeaders(true),

      body: JSON.stringify(payload),
    });

    const result = await parseDriverDraftResponse(response);

    const createdVehicle = result?.vehicle || result;

    if (!createdVehicle?.id) {
      throw new Error("The API did not return the created vehicle.");
    }

    const normalizedVehicle = normalizeDriverVehicle(createdVehicle);

    driverVehicleCatalog.set(normalizedVehicle.id, normalizedVehicle);

    pendingDriverVehicleIds.add(normalizedVehicle.id);

    const searchInput = document.querySelector("#driver-vehicle-search");

    if (searchInput) {
      searchInput.value = "";
    }

    closeDriverNewVehicleModal();

    await loadDriverVehicleOptions();

    updateDriverVehicleSelectedCount();
  } catch (error) {
    console.error("Unable to create vehicle:", error);

    showDriverNewVehicleError(
      modal,
      error?.message || "Unable to create the vehicle.",
    );
  } finally {
    if (saveButton) {
      saveButton.disabled = false;

      saveButton.innerHTML = originalButtonHtml;
    }
  }
}

function bindDriverNewVehicleModal(modal) {
  if (!modal || modal.dataset.bound === "true") {
    return;
  }

  modal.dataset.bound = "true";

  modal
    .querySelectorAll("[data-close-driver-new-vehicle]")
    .forEach((button) => {
      button.addEventListener("click", closeDriverNewVehicleModal);
    });

  const form = modal.querySelector("#driver-new-vehicle-form");

  form?.addEventListener("submit", async (event) => {
    event.preventDefault();

    await createDriverVehicleFromModal(modal);
  });

  const plateNumberInput = modal.querySelector(
    "#driver-new-vehicle-plate-number",
  );

  plateNumberInput?.addEventListener("input", () => {
    plateNumberInput.value = plateNumberInput.value
      .replace(/\D/g, "")
      .slice(0, 4);

    updateDriverNewVehiclePlatePreview(modal);
  });

  modal
    .querySelectorAll(
      "#driver-new-vehicle-letter-1, " +
        "#driver-new-vehicle-letter-2, " +
        "#driver-new-vehicle-letter-3",
    )
    .forEach((select) => {
      select.addEventListener("change", () => {
        updateDriverNewVehiclePlatePreview(modal);
      });
    });

  const vinInput = modal.querySelector("#driver-new-vehicle-vin");

  vinInput?.addEventListener("input", () => {
    vinInput.value = vinInput.value
      .toUpperCase()
      .replace(/[^A-HJ-NPR-Z0-9]/g, "")
      .slice(0, 17);
  });
}

function updateDriverVehicleSelectedCount() {
  const countElement = document.querySelector("#driver-vehicle-selected-count");

  const count = pendingDriverVehicleIds.size;

  if (countElement) {
    countElement.textContent = `${count} ${
      count === 1 ? "vehicle" : "vehicles"
    } selected`;
  }
}

function renderDriverVehicleOptions(vehicles) {
  const container = document.querySelector("#driver-vehicle-options");

  if (!container) {
    return;
  }

  if (!vehicles.length) {
    container.innerHTML = `
      <div class="driver-vehicle-modal-empty">
        <span>
          <i class="fa-solid fa-car"></i>
        </span>

        <h3>No vehicles found</h3>

        <p>
          Try another plate number, make, model or customer name.
        </p>
      </div>
    `;

    updateDriverVehicleSelectedCount();

    return;
  }

  container.innerHTML = vehicles
    .map((vehicle) => {
      const normalizedVehicle = normalizeDriverVehicle(vehicle);

      driverVehicleCatalog.set(normalizedVehicle.id, normalizedVehicle);

      const checked = pendingDriverVehicleIds.has(normalizedVehicle.id);

      const vehicleDescription = [
        normalizedVehicle.make,
        normalizedVehicle.model,
        normalizedVehicle.year,
      ]
        .filter(Boolean)
        .join(" ");

      const owner = normalizedVehicle.customer?.fullName || "Company vehicle";

      return `
        <label
          class="driver-vehicle-option ${checked ? "selected" : ""}"
        >
          <input
            type="checkbox"
            value="${escapeDriverVehicleHtml(normalizedVehicle.id)}"
            data-driver-vehicle-option
            ${checked ? "checked" : ""}
          />

          <span class="driver-vehicle-option-check">
            <i class="fa-solid fa-check"></i>
          </span>

          <span class="driver-vehicle-option-icon">
            <i class="fa-solid fa-car-side"></i>
          </span>

          <span class="driver-vehicle-option-details">
            <b>
              ${escapeDriverVehicleHtml(
                getDriverVehiclePlate(normalizedVehicle),
              )}
            </b>

            <small>
              ${escapeDriverVehicleHtml(
                vehicleDescription ||
                  normalizedVehicle.vehicleType ||
                  "Vehicle",
              )}
            </small>
          </span>

          <span class="driver-vehicle-option-owner">
            <small>Owner</small>

            <b>
              ${escapeDriverVehicleHtml(owner)}
            </b>
          </span>

          <span class="driver-vehicle-option-status">
            ${escapeDriverVehicleHtml(normalizedVehicle.status || "ACTIVE")}
          </span>
        </label>
      `;
    })
    .join("");

  container
    .querySelectorAll("[data-driver-vehicle-option]")
    .forEach((checkbox) => {
      checkbox.addEventListener("change", () => {
        const vehicleId = checkbox.value;

        if (checkbox.checked) {
          pendingDriverVehicleIds.add(vehicleId);
        } else {
          pendingDriverVehicleIds.delete(vehicleId);
        }

        checkbox
          .closest(".driver-vehicle-option")
          ?.classList.toggle("selected", checkbox.checked);

        updateDriverVehicleSelectedCount();
      });
    });

  updateDriverVehicleSelectedCount();
}

async function loadDriverVehicleOptions(search = "") {
  const container = document.querySelector("#driver-vehicle-options");

  if (!container) {
    return;
  }

  container.innerHTML = `
    <div class="driver-vehicle-modal-loading">
      <i class="fa-solid fa-spinner fa-spin"></i>
      <span>Loading available vehicles...</span>
    </div>
  `;

  try {
    const vehicles = await fetchAvailableDriverVehicles(search);

    renderDriverVehicleOptions(vehicles);
  } catch (error) {
    console.error("Unable to load available vehicles:", error);

    container.innerHTML = `
      <div class="driver-vehicle-modal-empty error">
        <span>
          <i class="fa-solid fa-triangle-exclamation"></i>
        </span>

        <h3>Unable to load vehicles</h3>

        <p>
          ${escapeDriverVehicleHtml(error?.message || "Please try again.")}
        </p>
      </div>
    `;
  }
}

async function openDriverVehicleModal() {
  const modal = ensureDriverVehicleModal();

  pendingDriverVehicleIds = new Set(
    selectedDriverVehicles.map((vehicle) => vehicle.id).filter(Boolean),
  );

  modal.classList.remove("hidden");

  modal.setAttribute("aria-hidden", "false");

  document.body.classList.add("driver-vehicle-modal-open");

  updateDriverVehicleSelectedCount();

  const searchInput = modal.querySelector("#driver-vehicle-search");

  if (searchInput) {
    searchInput.value = "";
  }

  await loadDriverVehicleOptions();

  searchInput?.focus();
}

function closeDriverVehicleModal() {
  const modal = document.querySelector("#driver-vehicle-modal");

  modal?.classList.add("hidden");

  modal?.setAttribute("aria-hidden", "true");

  document.body.classList.remove("driver-vehicle-modal-open");
}

function confirmDriverVehicleSelection() {
  const existingVehicleMap = new Map(
    selectedDriverVehicles.map((vehicle) => [vehicle.id, vehicle]),
  );

  const accessLevel = getDriverVehicleAccessLevel();

  selectedDriverVehicles = [...pendingDriverVehicleIds]
    .map((vehicleId) => {
      const vehicle =
        driverVehicleCatalog.get(vehicleId) ||
        existingVehicleMap.get(vehicleId);

      if (!vehicle) {
        return null;
      }

      return {
        ...normalizeDriverVehicle(vehicle),
        accessLevel,
      };
    })
    .filter(Boolean);

  isDriverFormDirty = true;

  renderAssignedDriverVehicles();

  closeDriverVehicleModal();
}

function bindDriverVehicleAssignmentControls() {
  const openButton = document.querySelector("#open-driver-vehicle-modal");

  if (openButton && openButton.dataset.bound !== "true") {
    openButton.dataset.bound = "true";

    openButton.addEventListener("click", openDriverVehicleModal);
  }

  const modal = ensureDriverVehicleModal();

  if (modal.dataset.bound !== "true") {
    modal.dataset.bound = "true";

    modal
      .querySelectorAll("[data-close-driver-vehicle-modal]")
      .forEach((button) => {
        button.addEventListener("click", closeDriverVehicleModal);
      });

    modal
      .querySelector("#confirm-driver-vehicle-selection")
      ?.addEventListener("click", confirmDriverVehicleSelection);
    modal
      .querySelector("#open-driver-new-vehicle")
      ?.addEventListener("click", openDriverNewVehicleModal);

    modal
      .querySelector("#refresh-driver-vehicles")
      ?.addEventListener("click", async (event) => {
        const button = event.currentTarget;
        const icon = button.querySelector("i");

        const search =
          modal.querySelector("#driver-vehicle-search")?.value?.trim() || "";

        button.disabled = true;
        icon?.classList.add("fa-spin");

        try {
          await loadDriverVehicleOptions(search);
        } finally {
          button.disabled = false;
          icon?.classList.remove("fa-spin");
        }
      });

    let searchTimer = null;

    modal
      .querySelector("#driver-vehicle-search")
      ?.addEventListener("input", (event) => {
        window.clearTimeout(searchTimer);

        searchTimer = window.setTimeout(() => {
          loadDriverVehicleOptions(event.target.value);
        }, 300);
      });
  }

  const accessSelect = document.querySelector("#driver-assignment-access");

  if (accessSelect && accessSelect.dataset.vehicleBound !== "true") {
    accessSelect.dataset.vehicleBound = "true";

    accessSelect.addEventListener("change", () => {
      const accessLevel = getDriverVehicleAccessLevel();

      selectedDriverVehicles = selectedDriverVehicles.map((vehicle) => ({
        ...vehicle,
        accessLevel,
      }));

      renderAssignedDriverVehicles();
    });
  }

  renderAssignedDriverVehicles();
}

async function fetchAvailableDriverVehicles(search = "") {
  const query = new URLSearchParams();

  query.set("status", "ACTIVE");

  if (search.trim()) {
    query.set("search", search.trim());
  }

  const response = await fetch(
    `${getDriverApiBaseUrl()}/vehicles?${query.toString()}`,
    {
      method: "GET",
      headers: getDriverAuthHeaders(),
    },
  );

  const result = await response.json().catch(() => null);

  if (!response.ok) {
    const message = Array.isArray(result?.message)
      ? result.message.join(", ")
      : result?.message ||
        result?.error ||
        "Unable to load available vehicles.";

    throw new Error(message);
  }

  /*
   * API response interceptor structure:
   *
   * {
   *   success: true,
   *   data: {
   *     items: [...]
   *   }
   * }
   */
  const payload = result?.data ?? result;

  return Array.isArray(payload?.items) ? payload.items : [];
}

async function restoreAssignedDriverVehicles(vehicleIds = []) {
  const assignedIds = [
    ...new Set(
      (Array.isArray(vehicleIds) ? vehicleIds : [])
        .map((vehicleId) => String(vehicleId).trim())
        .filter(Boolean),
    ),
  ];

  if (assignedIds.length === 0) {
    selectedDriverVehicles = [];
    renderAssignedDriverVehicles();
    return;
  }

  const vehicles = await fetchAvailableDriverVehicles();

  const vehiclesById = new Map(
    vehicles.map((vehicle) => {
      const normalizedVehicle = normalizeDriverVehicle(vehicle);

      driverVehicleCatalog.set(normalizedVehicle.id, normalizedVehicle);

      return [normalizedVehicle.id, normalizedVehicle];
    }),
  );

  const accessLevel = getDriverVehicleAccessLevel();

  selectedDriverVehicles = assignedIds
    .map((vehicleId) => vehiclesById.get(vehicleId))
    .filter(Boolean)
    .map((vehicle) => ({
      ...vehicle,
      accessLevel,
    }));

  renderAssignedDriverVehicles();
}

function collectDriverAssignmentPayload() {
  const employer = document.getElementById("driver-assignment-employer");

  const branch = document.getElementById("driver-assignment-branch");

  const location = document.getElementById("driver-assignment-location");

  const shift = document.getElementById("driver-assignment-shift");

  const access = document.getElementById("driver-assignment-access");

  const notes = document.getElementById("driver-assignment-notes");

  const employeeId = document.getElementById("employeeId");

  const supervisor = document.getElementById("supervisorId");

  return {
    employerId: employer?.value?.trim() || "",

    branchId: branch?.value?.trim() || "",

    locationId: location?.value?.trim() || "",

    parkingZoneIds: getSelectedDriverAssignmentValues(
      "driver-assignment-zones",
    ),

    workShift: shift?.value?.trim() || "",

    shiftDays: getSelectedDriverAssignmentValues("driver-assignment-days"),

    vehicleAccessLevel: access?.value?.trim() || "",

    employeeId: employeeId?.value?.trim() || undefined,

    supervisorId: supervisor?.value?.trim() || undefined,

    assignedVehicleIds: selectedDriverVehicles
      .map((vehicle) => vehicle.id)
      .filter(Boolean),

    notes: notes?.value?.trim() || undefined,

    version: activeDriverDraftVersion,
  };
}

function validateDriverAssignmentPayload(assignment) {
  if (!assignment.employerId) {
    throw new Error("Please select a valet company or employer.");
  }

  if (!assignment.branchId) {
    throw new Error("Please select a branch or department.");
  }

  if (!assignment.locationId) {
    throw new Error("Please select a location.");
  }

  if (
    !Array.isArray(assignment.parkingZoneIds) ||
    assignment.parkingZoneIds.length === 0
  ) {
    throw new Error("Please select at least one parking zone.");
  }

  if (!assignment.workShift) {
    throw new Error("Please select a work shift.");
  }

  if (
    !Array.isArray(assignment.shiftDays) ||
    assignment.shiftDays.length === 0
  ) {
    throw new Error("Please select at least one shift day.");
  }

  if (!assignment.vehicleAccessLevel) {
    throw new Error("Please select a vehicle access level.");
  }
}

function setDriverAssignmentSelectValue(elementId, value) {
  const select = document.getElementById(elementId);

  if (!select || value == null) {
    return;
  }

  select.value = String(value);
}

function setDriverAssignmentMultipleValues(elementId, values) {
  const select = document.getElementById(elementId);

  if (!select) {
    return;
  }

  const selectedValues = new Set(
    Array.isArray(values) ? values.map(String) : [],
  );

  Array.from(select.options).forEach((option) => {
    option.selected = selectedValues.has(option.value);
  });
}

function syncDriverMultiSelectControl(controlId, selectId, placeholder) {
  const control = document.getElementById(controlId);

  const select = document.getElementById(selectId);

  if (!control || !select) {
    return;
  }

  const selectedValues = Array.from(select.selectedOptions).map(
    (option) => option.value,
  );

  control.querySelectorAll('input[type="checkbox"]').forEach((checkbox) => {
    checkbox.checked = selectedValues.includes(checkbox.value);
  });

  const valueLabel = control.querySelector(".driver-multi-select-value");

  if (!valueLabel) {
    return;
  }

  if (selectedValues.length === 0) {
    valueLabel.textContent = placeholder;

    valueLabel.classList.remove("has-selection");

    return;
  }

  valueLabel.textContent =
    selectedValues.length <= 2
      ? selectedValues.join(", ")
      : `${selectedValues.length} selected`;

  valueLabel.classList.add("has-selection");
}

function restoreDriverAssignmentForm(draft) {
  const assignment = draft?.assignment;

  if (!assignment || typeof assignment !== "object") {
    return;
  }

  setDriverAssignmentSelectValue(
    "driver-assignment-employer",
    assignment.employerId,
  );

  setDriverAssignmentSelectValue(
    "driver-assignment-branch",
    assignment.branchId,
  );

  setDriverAssignmentSelectValue(
    "driver-assignment-location",
    assignment.locationId,
  );

  setDriverAssignmentMultipleValues(
    "driver-assignment-zones",
    assignment.parkingZoneIds,
  );

  syncDriverMultiSelectControl(
    "driver-assignment-zones-control",
    "driver-assignment-zones",
    "Select parking zones",
  );

  setDriverAssignmentSelectValue(
    "driver-assignment-shift",
    assignment.workShift,
  );

  setDriverAssignmentMultipleValues(
    "driver-assignment-days",
    assignment.shiftDays,
  );

  syncDriverMultiSelectControl(
    "driver-assignment-days-control",
    "driver-assignment-days",
    "Select shift days",
  );

  setDriverAssignmentSelectValue(
    "driver-assignment-access",
    assignment.vehicleAccessLevel,
  );

  setDriverFieldValue("employeeId", assignment.employeeId);

  setDriverFieldValue("supervisorId", assignment.supervisorId);

  const notes = document.getElementById("driver-assignment-notes");

  if (notes) {
    notes.value = assignment.notes || "";

    notes.dispatchEvent(
      new Event("input", {
        bubbles: true,
      }),
    );
  }
}

async function restoreDriverDraftDocuments(draftId) {
  if (!draftId || !driverDocumentUploader) {
    return [];
  }

  const response = await fetch(
    `${getDriverApiBaseUrl()}` +
      `/drivers/documents/draft/` +
      `${encodeURIComponent(draftId)}`,
    {
      method: "GET",
      headers: getDriverAuthHeaders(),
    },
  );

  const result = await parseDriverDraftResponse(response);

  const documents = Array.isArray(result?.documents) ? result.documents : [];

  driverDocumentUploader.restoreUploadedDocuments(documents);

  console.log(`Restored ${documents.length} ` + "driver document(s).");

  return documents;
}

async function restoreActiveDriverDraft() {
  if (!activeDriverDraftId) {
    sessionStorage.removeItem("currentDriverId");

    driverDocumentUploader?.setDriverId(null);

    return false;
  }

  try {
    const response = await fetch(
      `${getDriverApiBaseUrl()}/driver-drafts/${activeDriverDraftId}`,
      {
        headers: getDriverAuthHeaders(),
      },
    );

    if (response.status === 404) {
      localStorage.removeItem(DRIVER_DRAFT_STORAGE_KEY);

      sessionStorage.removeItem("currentDriverId");

      activeDriverDraftId = null;
      activeDriverDraftVersion = 1;

      driverDocumentUploader?.setDriverId(null);

      return false;
    }

    const draft = await parseDriverDraftResponse(response);

    activeDriverDraftVersion = Number(draft.version) || 1;

    sessionStorage.setItem("currentDriverId", activeDriverDraftId);

    driverDocumentUploader?.setDriverId(activeDriverDraftId);

    try {
      await restoreDriverDraftDocuments(activeDriverDraftId);
    } catch (documentError) {
      console.error("Unable to restore draft documents:", documentError);
    }

    restoreDriverDetailsForm(draft);

    restoreDriverAssignmentForm(draft);

    try {
      await restoreAssignedDriverVehicles(
        draft?.assignment?.assignedVehicleIds,
      );
    } catch (vehicleError) {
      console.error("Unable to restore assigned vehicles:", vehicleError);

      /*
       * Do not fail or reset the complete driver draft
       * when only the Vehicle API is unavailable.
       */
      selectedDriverVehicles = [];

      renderAssignedDriverVehicles();
    }

    restoreDriverPhotoPreview(draft.profilePhoto);

    isDriverFormDirty = false;
    return true;
  } catch (error) {
    console.error("Unable to restore driver draft:", error);

    return false;
  }
}

async function loadAddDriverPage() {
  const container = document.querySelector("#add-driver-container");

  if (!container) {
    console.error("Add Driver container was not found.");

    return;
  }

  try {
    if (container.dataset.loaded !== "true" || !container.innerHTML.trim()) {
      const response = await fetch("/pages/add-driver.html");

      if (!response.ok) {
        throw new Error(`Unable to load Add Driver page: ${response.status}`);
      }

      container.innerHTML = await response.text();

      container.dataset.loaded = "true";

      initializeDriverDocumentUploader(container);
    } else if (!driverDocumentUploader) {
      initializeDriverDocumentUploader(container);
    }

    bindAddDriverSteps();
    bindDriverVehicleAssignmentControls();

    const draftWasRestored = await restoreActiveDriverDraft();

    if (!draftWasRestored) {
      resetAddDriverWizard();
    }
  } catch (error) {
    console.error("Unable to load Add Driver page:", error);

    container.dataset.loaded = "false";

    container.innerHTML = `
      <section class="page-load-error">
        <i class="fa-solid fa-triangle-exclamation"></i>

        <h2>Unable to load Add Driver</h2>

        <p>
          ${error.message || "Please refresh the page and try again."}
        </p>

        <button
          type="button"
          id="retry-add-driver-page"
          class="btn-primary"
        >
          Try Again
        </button>
      </section>
    `;

    container
      .querySelector("#retry-add-driver-page")
      ?.addEventListener("click", async () => {
        container.dataset.loaded = "false";

        container.innerHTML = "";

        await loadAddDriverPage();
      });
  }
}

const requiredDriverDetailFields = [
  { id: "fullName", label: "Full Name" },
  { id: "phoneNumber", label: "Phone Number" },
  { id: "dateOfBirth", label: "Date of Birth" },
  { id: "nationality", label: "Nationality" },
  { id: "idType", label: "ID Type" },
  {
    id: "idNumber",
    label: "ID / Iqama Number",
  },
  {
    id: "idExpiryDate",
    label: "Iqama Expiry Date",
  },
  { id: "driverType", label: "Driver Type" },
  {
    id: "licenseNumber",
    label: "License Number",
  },
  {
    id: "licenseExpiryDate",
    label: "License Expiry Date",
  },
  {
    id: "licenseType",
    label: "License Type",
  },
  {
    id: "joiningDate",
    label: "Date of Joining",
  },
  {
    id: "companyId",
    label: "Company / Valet",
  },
  { id: "address", label: "Address" },
  { id: "city", label: "City" },
  { id: "region", label: "Region" },
];

function getDriverFieldWrapper(input) {
  return input.closest("label");
}

function clearDriverDetailErrors(root) {
  root.querySelectorAll(".driver-field-error").forEach((error) => {
    error.remove();
  });

  root.querySelectorAll(".driver-input-error").forEach((field) => {
    field.classList.remove("driver-input-error");
  });
}

function clearSingleDriverFieldError(input) {
  const wrapper = getDriverFieldWrapper(input);

  if (!wrapper) {
    return;
  }

  input.classList.remove("driver-input-error");

  wrapper.querySelector(".phone-input")?.classList.remove("driver-input-error");

  wrapper.querySelector(".driver-field-error")?.remove();
}

function formatDriverDateInput(date) {
  const year = date.getFullYear();

  const month = String(date.getMonth() + 1).padStart(2, "0");

  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function validateDriverDetailsStep(root) {
  clearDriverDetailErrors(root);

  let isValid = true;
  let firstInvalidField = null;

  const registerError = (input, message) => {
    if (!input) {
      return;
    }

    isValid = false;

    /*
     * Avoid adding two errors to the
     * same field during one validation.
     */
    const wrapper = getDriverFieldWrapper(input);

    if (!wrapper?.querySelector(".driver-field-error")) {
      showDriverFieldError(input, message);
    }

    firstInvalidField ??= input;
  };

  /*
   * Required-field validation.
   */
  requiredDriverDetailFields.forEach(({ id, label }) => {
    const input = root.querySelector(`#${id}`);

    if (!input) {
      console.warn(`Driver field was not found: #${id}`);

      isValid = false;
      return;
    }

    const value = typeof input.value === "string" ? input.value.trim() : "";

    if (!value) {
      registerError(input, `${label} is required.`);
    }
  });

  /*
   * Full Name:
   * English letters, Arabic letters
   * and single spaces only.
   */
  const fullNameInput = root.querySelector("#fullName");

  if (fullNameInput?.value.trim()) {
    const normalizedName = fullNameInput.value.trim().replace(/\s+/g, " ");

    fullNameInput.value = normalizedName;

    const validFullName =
      /^[A-Za-z\u0621-\u063A\u0641-\u064A\u066E-\u066F\u0671-\u06D3\u06FA-\u06FC]+(?:\s+[A-Za-z\u0621-\u063A\u0641-\u064A\u066E-\u066F\u0671-\u06D3\u06FA-\u06FC]+)*$/.test(
        normalizedName,
      );

    if (!validFullName) {
      registerError(
        fullNameInput,
        "Full name can contain English or Arabic letters only.",
      );
    }
  }

  /*
   * Phone Number:
   * Must start with 5 and contain
   * exactly 9 digits.
   */
  const phoneInput = root.querySelector("#phoneNumber");

  if (phoneInput?.value.trim()) {
    const normalizedPhone = phoneInput.value.replace(/\D/g, "");

    phoneInput.value = normalizedPhone.slice(0, 9);

    if (!/^5\d{8}$/.test(phoneInput.value)) {
      registerError(
        phoneInput,
        "Phone number must start with 5 and contain exactly 9 digits.",
      );
    }
  }

  /*
   * Required email format.
   */
  const emailInput = root.querySelector("#driverEmail");

  if (emailInput?.value.trim()) {
    const normalizedEmail = emailInput.value.trim().toLowerCase();

    emailInput.value = normalizedEmail;

    const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(normalizedEmail);

    if (!validEmail) {
      registerError(emailInput, "Enter a valid email address.");
    }
  }

  /*
   * Driver must be at least 20 years old.
   */
  const dateOfBirthInput = root.querySelector("#dateOfBirth");

  if (dateOfBirthInput?.value) {
    const selectedDate = new Date(`${dateOfBirthInput.value}T00:00:00`);

    const today = new Date();

    const maximumBirthDate = new Date(
      today.getFullYear() - 20,
      today.getMonth(),
      today.getDate(),
    );

    selectedDate.setHours(0, 0, 0, 0);

    maximumBirthDate.setHours(0, 0, 0, 0);

    if (
      Number.isNaN(selectedDate.getTime()) ||
      selectedDate > maximumBirthDate
    ) {
      registerError(dateOfBirthInput, "Driver must be at least 20 years old.");
    }
  }

  /*
   * ID / Iqama:
   * Digits only and exactly 10 digits.
   */
  const idNumberInput = root.querySelector("#idNumber");

  if (idNumberInput?.value.trim()) {
    const normalizedId = idNumberInput.value.replace(/\D/g, "");

    idNumberInput.value = normalizedId.slice(0, 10);

    if (!/^\d{10}$/.test(idNumberInput.value)) {
      registerError(
        idNumberInput,
        "ID / Iqama number must contain exactly 10 digits.",
      );
    }
  }

  const todayValue = formatDriverDateInput(new Date());

  /*
   * Iqama expiry cannot be before today.
   */
  const idExpiryDate = root.querySelector("#idExpiryDate");

  if (idExpiryDate?.value && idExpiryDate.value < todayValue) {
    registerError(idExpiryDate, "Iqama expiry date cannot be in the past.");
  }

  /*
   * Licence expiry cannot be before today.
   */
  const licenseExpiryDate = root.querySelector("#licenseExpiryDate");

  if (licenseExpiryDate?.value && licenseExpiryDate.value < todayValue) {
    registerError(
      licenseExpiryDate,
      "License expiry date cannot be in the past.",
    );
  }

  if (firstInvalidField) {
    firstInvalidField.scrollIntoView({
      behavior: "smooth",
      block: "center",
    });

    window.setTimeout(() => {
      firstInvalidField.focus();
    }, 250);
  }

  return isValid;
}

function showDriverDraftSuccessModal() {
  document.querySelector("#driver-draft-success-modal")?.remove();

  const modal = document.createElement("div");

  modal.id = "driver-draft-success-modal";

  modal.className = "driver-draft-success-toast";

  modal.innerHTML = `
    <div class="driver-draft-toast-card">
      <div class="driver-draft-toast-icon">
        <i class="fa-solid fa-check"></i>
      </div>

      <strong>
        Draft saved successfully
      </strong>
    </div>
  `;

  document.body.appendChild(modal);

  requestAnimationFrame(() => {
    modal.classList.add("is-visible");
  });

  window.setTimeout(() => {
    modal.classList.remove("is-visible");

    window.setTimeout(() => {
      modal.remove();
    }, 220);
  }, 1600);
}

async function deleteActiveDriverDraft() {
  if (!activeDriverDraftId) {
    return;
  }

  const response = await fetch(
    `${getDriverApiBaseUrl()}/driver-drafts/${activeDriverDraftId}`,
    {
      method: "DELETE",
      headers: getDriverAuthHeaders(),
    },
  );

  await parseDriverDraftResponse(response);

  localStorage.removeItem(DRIVER_DRAFT_STORAGE_KEY);

  sessionStorage.removeItem("currentDriverId");

  activeDriverDraftId = null;
  activeDriverDraftVersion = 1;

  driverDocumentUploader?.setDriverId(null);
}

async function uploadDriverDraftPhoto(draftId, photoFile, retryCount = 0) {
  if (!photoFile) {
    return null;
  }

  const formData = new FormData();

  formData.append("photo", photoFile);

  formData.append("version", String(activeDriverDraftVersion));

  const response = await fetch(
    `${getDriverApiBaseUrl()}/driver-drafts/${draftId}/photo`,
    {
      method: "POST",

      /*
       * Do not manually set Content-Type.
       * The browser creates the multipart boundary.
       */
      headers: getDriverAuthHeaders(false),

      body: formData,
    },
  );

  try {
    return await parseDriverDraftResponse(response);
  } catch (error) {
    const isVersionConflict = error?.status === 409 && retryCount === 0;

    if (!isVersionConflict) {
      throw error;
    }

    /*
     * Prefer the exact version returned
     * by the conflict response.
     */
    if (Number.isInteger(error.currentVersion) && error.currentVersion >= 1) {
      activeDriverDraftVersion = error.currentVersion;
    } else {
      await refreshActiveDriverDraftVersion(draftId);
    }

    console.warn(
      "Driver draft version refreshed. Retrying photo upload:",
      activeDriverDraftVersion,
    );

    /*
     * Retry only once to prevent an
     * infinite request loop.
     */
    return uploadDriverDraftPhoto(draftId, photoFile, retryCount + 1);
  }
}

async function saveDriverAssignmentDraft() {
  if (!activeDriverDraftId) {
    throw new Error("Please save the Driver Details step first.");
  }

  const assignment = collectDriverAssignmentPayload();

  validateDriverAssignmentPayload(assignment);

  const response = await fetch(
    `${getDriverApiBaseUrl()}/driver-drafts/${activeDriverDraftId}/assignment`,
    {
      method: "PATCH",

      headers: getDriverAuthHeaders(true),

      body: JSON.stringify(assignment),
    },
  );

  const updatedDraft = await parseDriverDraftResponse(response);

  activeDriverDraftVersion =
    Number(updatedDraft.version) || activeDriverDraftVersion + 1;

  isDriverFormDirty = false;

  return updatedDraft;
}

async function saveDriverDocumentsDraft() {
  if (!activeDriverDraftId) {
    throw new Error(
      "Driver draft was not found. Please save Driver Details first.",
    );
  }

  const uploadedDocuments =
    driverDocumentUploader?.getUploadedDocuments() || [];

  /*
   * Backend document types must be unique.
   *
   * Company Authorization Letter and Insurance Certificate
   * are separate frontend slots, but both currently use the
   * backend document type OTHER.
   */
  const completedDocumentTypes = [
    ...new Set(
      uploadedDocuments.map((item) => item.documentType).filter(Boolean),
    ),
  ];

  const requiredDocumentCount = document.querySelectorAll(
    "#driver-step-documents " +
      'input[type="file"]' +
      '[data-document-category="required"]',
  ).length;

  const requiredUploadedCount = uploadedDocuments.filter(
    (item) => item.category === "required",
  ).length;

  const uploadedDocumentCount = uploadedDocuments.length;

  const progressPercentage =
    requiredDocumentCount > 0
      ? Math.min(
          100,
          Math.round((requiredUploadedCount / requiredDocumentCount) * 100),
        )
      : 0;

  const response = await fetch(
    `${getDriverApiBaseUrl()}/driver-drafts/${activeDriverDraftId}/documents`,
    {
      method: "PATCH",

      headers: getDriverAuthHeaders(true),

      body: JSON.stringify({
        version: activeDriverDraftVersion,

        currentStep: 3,

        uploadedDocumentCount,

        requiredDocumentCount,

        progressPercentage,

        completedDocumentTypes,
      }),
    },
  );

  const updatedDraft = await parseDriverDraftResponse(response);

  activeDriverDraftVersion =
    Number(updatedDraft.version) || activeDriverDraftVersion + 1;

  isDriverFormDirty = false;

  return updatedDraft;
}

async function saveDriverDetailsDraft(driverPhotoInput) {
  /*
   * Create the draft only once.
   */
  if (!activeDriverDraftId) {
    const createResponse = await fetch(
      `${getDriverApiBaseUrl()}/driver-drafts`,
      {
        method: "POST",
        headers: getDriverAuthHeaders(true),
        body: JSON.stringify({}),
      },
    );

    const createdDraft = await parseDriverDraftResponse(createResponse);

    activeDriverDraftId = createdDraft.draftId || createdDraft.id;

    if (!activeDriverDraftId) {
      throw new Error("The API did not return a draft ID.");
    }

    activeDriverDraftVersion = Number(createdDraft.version) || 1;

    sessionStorage.setItem("currentDriverId", activeDriverDraftId);

    localStorage.setItem(DRIVER_DRAFT_STORAGE_KEY, activeDriverDraftId);
  }

  const selectedPhoto = driverPhotoInput?.files?.[0];

  if (selectedPhoto) {
    const photoDraft = await uploadDriverDraftPhoto(
      activeDriverDraftId,
      selectedPhoto,
    );

    activeDriverDraftVersion =
      Number(photoDraft.version) || activeDriverDraftVersion + 1;

    restoreDriverPhotoPreview(photoDraft.profilePhoto);

    driverPhotoInput.value = "";
  }

  const detailsResponse = await fetch(
    `${getDriverApiBaseUrl()}/driver-drafts/${activeDriverDraftId}/details`,
    {
      method: "PATCH",
      headers: getDriverAuthHeaders(true),

      body: JSON.stringify(collectDriverDetailsPayload()),
    },
  );

  const updatedDraft = await parseDriverDraftResponse(detailsResponse);

  activeDriverDraftVersion =
    Number(updatedDraft.version) || activeDriverDraftVersion + 1;
  isDriverFormDirty = false;

  return updatedDraft;
}

function initializeDriverMultiSelect({ controlId, selectId, placeholder }) {
  const control = document.getElementById(controlId);

  const hiddenSelect = document.getElementById(selectId);

  if (!control || !hiddenSelect || control.dataset.bound === "true") {
    return;
  }

  control.dataset.bound = "true";

  const trigger = control.querySelector(".driver-multi-select-trigger");

  const menu = control.querySelector(".driver-multi-select-menu");

  const valueLabel = control.querySelector(".driver-multi-select-value");

  const checkboxes = Array.from(
    control.querySelectorAll('input[type="checkbox"]'),
  );

  const close = () => {
    control.classList.remove("is-open");
    menu?.classList.add("hidden");
    trigger?.setAttribute("aria-expanded", "false");
  };

  const update = () => {
    const selectedValues = checkboxes
      .filter((checkbox) => checkbox.checked)
      .map((checkbox) => checkbox.value);

    Array.from(hiddenSelect.options).forEach((option) => {
      option.selected = selectedValues.includes(option.value);
    });

    hiddenSelect.dispatchEvent(
      new Event("change", {
        bubbles: true,
      }),
    );

    if (!valueLabel) {
      return;
    }

    if (selectedValues.length === 0) {
      valueLabel.textContent = placeholder;

      valueLabel.classList.remove("has-selection");

      return;
    }

    valueLabel.textContent =
      selectedValues.length <= 2
        ? selectedValues.join(", ")
        : `${selectedValues.length} selected`;

    valueLabel.classList.add("has-selection");
  };

  trigger?.addEventListener("click", (event) => {
    event.stopPropagation();

    const shouldOpen = menu?.classList.contains("hidden");

    document
      .querySelectorAll(".driver-multi-select.is-open")
      .forEach((otherControl) => {
        if (otherControl !== control) {
          otherControl.classList.remove("is-open");

          otherControl
            .querySelector(".driver-multi-select-menu")
            ?.classList.add("hidden");
        }
      });

    control.classList.toggle("is-open", shouldOpen);

    menu?.classList.toggle("hidden", !shouldOpen);

    trigger.setAttribute("aria-expanded", String(shouldOpen));
  });

  checkboxes.forEach((checkbox) => {
    checkbox.addEventListener("change", update);
  });

  document.addEventListener("click", (event) => {
    if (!control.contains(event.target)) {
      close();
    }
  });

  update();
}
function hasDriverFormData(addDriverPage) {
  if (!addDriverPage) {
    return false;
  }

  /*
   * Only user-entered text/date/number fields.
   * Exclude checkboxes, radios, hidden inputs,
   * buttons and file inputs.
   */
  const valueFields = addDriverPage.querySelectorAll(
    [
      "input[type='text']",
      "input[type='email']",
      "input[type='tel']",
      "input[type='number']",
      "input[type='date']",
      "input[type='time']",
      "input[type='url']",
      "input[type='search']",
      "input:not([type])",
    ].join(", "),
  );

  const hasInputValue = Array.from(valueFields).some((field) => {
    const type = String(field.getAttribute("type") || "text").toLowerCase();

    if (
      [
        "checkbox",
        "radio",
        "hidden",
        "button",
        "submit",
        "reset",
        "file",
      ].includes(type)
    ) {
      return false;
    }

    return String(field.value || "").trim() !== "";
  });

  if (hasInputValue) {
    return true;
  }

  const textareas = addDriverPage.querySelectorAll("textarea");

  const hasTextareaValue = Array.from(textareas).some(
    (field) => String(field.value || "").trim() !== "",
  );

  if (hasTextareaValue) {
    return true;
  }

  const singleSelects = addDriverPage.querySelectorAll(
    "select:not([multiple])",
  );

  const hasSingleSelection = Array.from(singleSelects).some(
    (select) => String(select.value || "").trim() !== "",
  );

  if (hasSingleSelection) {
    return true;
  }

  /*
   * Custom multi-select checkboxes.
   * Count only checked options.
   */
  const hasCheckedOption =
    Array.from(
      addDriverPage.querySelectorAll(
        '.driver-multi-select-menu input[type="checkbox"]:checked',
      ),
    ).length > 0;

  if (hasCheckedOption) {
    return true;
  }

  const photoInput = addDriverPage.querySelector("#driverPhoto");

  if (photoInput?.files?.length > 0) {
    return true;
  }

  const savedPhoto = addDriverPage.querySelector(".driver-photo-preview");

  return Boolean(savedPhoto);
}

function setDriverReviewText(elementId, value) {
  const element = document.getElementById(elementId);

  if (!element) {
    return;
  }

  const normalizedValue = Array.isArray(value)
    ? value.filter(Boolean).join(", ")
    : String(value ?? "").trim();

  element.textContent = normalizedValue || "—";
}

function formatDriverReviewDate(value) {
  if (!value) {
    return "—";
  }

  const date = new Date(`${String(value).slice(0, 10)}T00:00:00`);

  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

function formatDriverReviewEnum(value) {
  if (!value) {
    return "—";
  }

  return String(value)
    .toLowerCase()
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function getDriverSummaryValue(value) {
  if (Array.isArray(value)) {
    return value.filter(Boolean).join(", ") || "—";
  }

  const normalizedValue = String(value ?? "").trim();

  return normalizedValue || "—";
}

function getDriverSummarySelectText(elementId, fallbackValue) {
  const select = document.getElementById(elementId);

  const selectedOption = select?.selectedOptions?.[0];

  return getDriverSummaryValue(
    selectedOption?.textContent?.trim() || fallbackValue,
  );
}

function getDriverSummaryMultipleText(elementId, fallbackValues) {
  const select = document.getElementById(elementId);

  const selectedLabels = Array.from(select?.selectedOptions || [])
    .map((option) => option.textContent.trim())
    .filter(Boolean);

  if (selectedLabels.length > 0) {
    return selectedLabels.join(", ");
  }

  return getDriverSummaryValue(fallbackValues);
}

function getDriverSummaryFileName(driverName) {
  const safeName = String(driverName || "driver")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  const date = new Date().toISOString().slice(0, 10);

  return `driver-summary-${safeName || "driver"}-${date}.pdf`;
}

async function loadPdfImageDataUrl(imageSource) {
  if (!imageSource) {
    return null;
  }

  /*
   * Already converted image.
   */
  if (String(imageSource).startsWith("data:image/")) {
    return imageSource;
  }

  try {
    const response = await fetch(imageSource, {
      credentials: "same-origin",
    });

    if (!response.ok) {
      throw new Error(`Unable to load image: ${response.status}`);
    }

    const blob = await response.blob();

    if (!String(blob.type).startsWith("image/")) {
      throw new Error("The selected resource is not an image.");
    }

    return await new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = () => resolve(reader.result);

      reader.onerror = () => reject(new Error("Unable to convert image."));

      reader.readAsDataURL(blob);
    });
  } catch (error) {
    console.warn("Unable to load PDF image:", imageSource, error);

    return null;
  }
}

function getPdfImageFormat(dataUrl) {
  return String(dataUrl).startsWith("data:image/png") ? "PNG" : "JPEG";
}

async function downloadDriverSummaryPdf() {
  if (!activeDriverDraftId) {
    throw new Error("The active driver draft was not found.");
  }

  if (!window.jspdf?.jsPDF) {
    throw new Error("The PDF library is not loaded.");
  }

  const { jsPDF } = window.jspdf;

  const { draft, documents } = await fetchDriverReviewData();

  const details = draft.details || draft.driverDetails || {};

  const assignment = draft.assignment || {};

  const emailValue = details.email || getDriverFieldValue("driverEmail") || "";

  const uploadedProfileDocument = documents.find(
    (item) =>
      item.documentSlot === "PROFILE_PHOTO" ||
      item.documentType === "PROFILE_PHOTO",
  );

  const profilePhotoUrl =
    uploadedProfileDocument?.url ||
    uploadedProfileDocument?.document?.url ||
    uploadedProfileDocument?.document?.fileUrl ||
    uploadedProfileDocument?.document?.downloadUrl ||
    draft.profilePhoto?.url ||
    draft.profilePhoto?.fileUrl ||
    draft.profilePhoto?.downloadUrl ||
    document.querySelector("#review-profile-photo")?.src ||
    "";

  const parkInLogoUrl =
    document.querySelector(
      ".sidebar-logo img, .brand-logo img, .dashboard-logo img",
    )?.src || "/public/assets/parkin-logo.png";

  const [profilePhotoData, parkInLogoData] = await Promise.all([
    loadPdfImageDataUrl(profilePhotoUrl),

    loadPdfImageDataUrl(parkInLogoUrl),
  ]);

  const driverName =
    details.fullName ||
    [details.firstName, details.middleName, details.lastName]
      .filter(Boolean)
      .join(" ") ||
    "Driver";

  const pdf = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  });

  const pageWidth = pdf.internal.pageSize.getWidth();

  const pageHeight = pdf.internal.pageSize.getHeight();

  const margin = 14;

  const primary = [19, 117, 67];
  const dark = [23, 34, 52];
  const muted = [100, 116, 139];
  const light = [240, 249, 244];

  /*
   * Premium ParkIn PDF header
   */

  pdf.setFillColor(...primary);

  pdf.rect(0, 0, pageWidth, 34, "F");

  if (parkInLogoData) {
    try {
      pdf.addImage(
        parkInLogoData,
        getPdfImageFormat(parkInLogoData),
        margin,
        7,
        23,
        20,
        undefined,
        "FAST",
      );
    } catch (error) {
      console.warn("Unable to add ParkIn logo:", error);
    }
  }

  const headerTextX = parkInLogoData ? margin + 29 : margin;

  pdf.setTextColor(255, 255, 255);

  pdf.setFont("helvetica", "bold");

  pdf.setFontSize(17);

  pdf.text("Driver Summary", headerTextX, 14);

  pdf.setFont("helvetica", "normal");

  pdf.setFontSize(8.5);

  pdf.text("ParkIn Driver Management", headerTextX, 21);

  const generatedDate = new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date());

  pdf.text(`Generated: ${generatedDate}`, pageWidth - margin, 21, {
    align: "right",
  });

  /*
   * Driver profile summary card
   */
  const summaryTop = 41;
  const summaryHeight = 35;

  pdf.setFillColor(...light);

  pdf.roundedRect(
    margin,
    summaryTop,
    pageWidth - margin * 2,
    summaryHeight,
    3,
    3,
    "F",
  );

  let summaryTextX = margin + 6;

  if (profilePhotoData) {
    try {
      pdf.setFillColor(255, 255, 255);

      pdf.roundedRect(margin + 5, summaryTop + 5, 25, 25, 2, 2, "F");

      pdf.addImage(
        profilePhotoData,
        getPdfImageFormat(profilePhotoData),
        margin + 6,
        summaryTop + 6,
        23,
        23,
        undefined,
        "FAST",
      );

      pdf.setDrawColor(190, 224, 204);

      pdf.roundedRect(margin + 5, summaryTop + 5, 25, 25, 2, 2, "S");

      summaryTextX = margin + 35;
    } catch (error) {
      console.warn("Unable to add profile picture:", error);
    }
  }

  pdf.setTextColor(...dark);

  pdf.setFont("helvetica", "bold");

  pdf.setFontSize(14);

  pdf.text(getDriverSummaryValue(driverName), summaryTextX, summaryTop + 13);

  pdf.setFont("helvetica", "normal");

  pdf.setFontSize(9);

  pdf.setTextColor(...muted);

  pdf.text(
    getDriverTypeDisplayText(details.driverType),
    summaryTextX,
    summaryTop + 21,
  );

  pdf.text(getDriverSummaryValue(emailValue), summaryTextX, summaryTop + 28);

  pdf.setTextColor(...primary);

  pdf.setFont("helvetica", "bold");

  pdf.text("READY FOR SUBMISSION", pageWidth - margin - 5, summaryTop + 18, {
    align: "right",
  });

  let startY = 84;

  const sectionStyles = {
    theme: "grid",

    margin: {
      left: margin,
      right: margin,
    },

    headStyles: {
      fillColor: primary,
      textColor: [255, 255, 255],
      fontStyle: "bold",
      fontSize: 9,
    },

    bodyStyles: {
      textColor: dark,
      fontSize: 8.5,
      cellPadding: 3,
      valign: "middle",
    },

    alternateRowStyles: {
      fillColor: [249, 251, 252],
    },

    columnStyles: {
      0: {
        cellWidth: 48,
        fontStyle: "bold",
        textColor: muted,
      },

      1: {
        cellWidth: "auto",
      },
    },

    styles: {
      lineColor: [224, 231, 239],
      lineWidth: 0.2,
      overflow: "linebreak",
    },
  };

  /*
   * Personal information
   */
  pdf.autoTable({
    ...sectionStyles,

    startY,

    head: [["Personal Information", "Details"]],

    body: [
      ["Full Name", getDriverSummaryValue(driverName)],

      [
        "Phone Number",
        getDriverSummaryValue(
          `${details.phoneCountryCode || "+966"} ${details.phoneNumber || ""}`,
        ),
      ],

      ["Email", getDriverSummaryValue(emailValue)],

      ["Date of Birth", formatDriverReviewDate(details.dateOfBirth)],

      ["Nationality", formatDriverReviewEnum(details.nationality)],

      ["ID Type", formatDriverReviewEnum(details.idType)],

      ["ID / Iqama Number", getDriverSummaryValue(details.idNumber)],

      ["ID Expiry Date", formatDriverReviewDate(details.idExpiryDate)],
    ],
  });

  startY = pdf.lastAutoTable.finalY + 8;

  /*
   * Driver information
   */
  pdf.autoTable({
    ...sectionStyles,

    startY,

    head: [["Driver Information", "Details"]],

    body: [
      ["Driver Type", getDriverTypeDisplayText(details.driverType)],

      ["Licence Number", getDriverSummaryValue(details.licenseNumber)],

      ["Licence Type", formatDriverReviewEnum(details.licenseType)],

      [
        "Licence Expiry Date",
        formatDriverReviewDate(details.licenseExpiryDate),
      ],

      ["Date of Joining", formatDriverReviewDate(details.joiningDate)],
    ],
  });

  startY = pdf.lastAutoTable.finalY + 8;

  /*
   * Assignment information
   */
  pdf.autoTable({
    ...sectionStyles,

    startY,

    head: [["Assignment Information", "Details"]],

    body: [
      [
        "Employer",
        getDriverSummarySelectText(
          "driver-assignment-employer",
          assignment.employerId,
        ),
      ],

      [
        "Branch / Department",
        getDriverSummarySelectText(
          "driver-assignment-branch",
          assignment.branchId,
        ),
      ],

      [
        "Location",
        getDriverSummarySelectText(
          "driver-assignment-location",
          assignment.locationId,
        ),
      ],

      [
        "Parking Zones",
        getDriverSummaryMultipleText(
          "driver-assignment-zones",
          assignment.parkingZoneIds,
        ),
      ],

      [
        "Work Shift",
        getDriverSummarySelectText(
          "driver-assignment-shift",
          assignment.workShift,
        ),
      ],

      [
        "Shift Days",
        getDriverSummaryMultipleText(
          "driver-assignment-days",
          assignment.shiftDays,
        ),
      ],

      [
        "Vehicle Access Level",
        getDriverSummarySelectText(
          "driver-assignment-access",
          assignment.vehicleAccessLevel,
        ),
      ],

      ["Assignment Notes", getDriverSummaryValue(assignment.notes)],
    ],
  });

  startY = pdf.lastAutoTable.finalY + 8;

  /*
   * Uploaded documents
   */
  const documentRows = (Array.isArray(documents) ? documents : []).map(
    (item, index) => [
      String(index + 1),

      getDriverSummaryValue(
        item.documentLabel || getDriverDocumentLabel(item.documentType),
      ),

      getDriverSummaryValue(item.originalName || item.document?.originalName),

      formatDriverReviewEnum(item.category),
    ],
  );

  pdf.autoTable({
    startY,

    margin: {
      left: margin,
      right: margin,
    },

    head: [["#", "Document", "File Name", "Category"]],

    body:
      documentRows.length > 0
        ? documentRows
        : [["—", "No documents", "—", "—"]],

    theme: "grid",

    headStyles: {
      fillColor: primary,
      textColor: [255, 255, 255],
      fontStyle: "bold",
      fontSize: 8.5,
    },

    bodyStyles: {
      textColor: dark,
      fontSize: 8,
      cellPadding: 3,
    },

    alternateRowStyles: {
      fillColor: [249, 251, 252],
    },

    columnStyles: {
      0: {
        cellWidth: 10,
        halign: "center",
      },

      1: {
        cellWidth: 48,
      },

      2: {
        cellWidth: "auto",
      },

      3: {
        cellWidth: 28,
      },
    },

    styles: {
      lineColor: [224, 231, 239],
      lineWidth: 0.2,
      overflow: "linebreak",
    },
  });

  /*
   * Footer on every page
   */
  const totalPages = pdf.internal.getNumberOfPages();

  for (let pageNumber = 1; pageNumber <= totalPages; pageNumber += 1) {
    pdf.setPage(pageNumber);

    pdf.setDrawColor(226, 232, 240);

    pdf.line(margin, pageHeight - 13, pageWidth - margin, pageHeight - 13);

    pdf.setFont("helvetica", "normal");

    pdf.setFontSize(7.5);

    pdf.setTextColor(...muted);

    pdf.text("ParkIn - Confidential Driver Record", margin, pageHeight - 7);

    pdf.text(
      `Page ${pageNumber} of ${totalPages}`,
      pageWidth - margin,
      pageHeight - 7,
      {
        align: "right",
      },
    );
  }

  pdf.save(getDriverSummaryFileName(driverName));
}

function getDriverSelectDisplayText(elementId, fallbackValue) {
  const select = document.getElementById(elementId);

  const selectedOption = select?.selectedOptions?.[0];

  return selectedOption?.textContent?.trim() || fallbackValue || "—";
}

function getDriverMultipleDisplayText(elementId, fallbackValues) {
  const select = document.getElementById(elementId);

  const selectedLabels = Array.from(select?.selectedOptions || [])
    .map((option) => option.textContent.trim())
    .filter(Boolean);

  if (selectedLabels.length > 0) {
    return selectedLabels.join(", ");
  }

  return Array.isArray(fallbackValues) ? fallbackValues.join(", ") : "—";
}

function getDriverDocumentLabel(documentType) {
  const labels = {
    PROFILE_PHOTO: "Driver Photo",
    NATIONAL_ID_FRONT: "National ID / Iqama",
    DRIVING_LICENSE_FRONT: "Driving License (Front)",
    DRIVING_LICENSE_BACK: "Driving License (Back)",
    MEDICAL_CERTIFICATE: "Medical Certificate",
    EMPLOYMENT_CONTRACT: "Employment Contract",
    BACKGROUND_CHECK: "Police Clearance",
    PASSPORT: "Passport Copy",
    OTHER: "Additional Document",
  };

  return labels[documentType] || formatDriverReviewEnum(documentType);
}

function getDriverDocumentIcon(mimeType) {
  if (mimeType === "application/pdf") {
    return "fa-regular fa-file-pdf";
  }

  if (String(mimeType).startsWith("image/")) {
    return "fa-regular fa-image";
  }

  return "fa-regular fa-file-lines";
}

async function fetchDriverReviewData() {
  if (!activeDriverDraftId) {
    throw new Error("The active driver draft was not found.");
  }

  const draftResponse = await fetch(
    `${getDriverApiBaseUrl()}/driver-drafts/${activeDriverDraftId}`,
    {
      headers: getDriverAuthHeaders(),
    },
  );

  const draft = await parseDriverDraftResponse(draftResponse);

  /*
   * Use the uploader's current state.
   *
   * This guarantees that Step 4 shows exactly the same
   * documents currently displayed as uploaded in Step 3.
   */
  const currentDocuments = driverDocumentUploader?.getUploadedDocuments() || [];

  return {
    draft,
    documents: currentDocuments,
  };
}

function escapeDriverReviewHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function renderDriverReviewDocuments(documents) {
  const container = document.getElementById("review-uploaded-documents");

  const count = document.getElementById("review-document-count");

  if (!container) {
    return;
  }

  /*
   * Do not deduplicate by documentType.
   *
   * Company Authorization and Insurance
   * both use backend type OTHER but are
   * separate upload slots.
   */
  const currentDocuments = Array.isArray(documents)
    ? documents.filter(
        (item) => item && (item.documentSlot || item.documentType),
      )
    : [];

  if (count) {
    count.textContent =
      `${currentDocuments.length} ` +
      `${currentDocuments.length === 1 ? "document" : "documents"} uploaded`;
  }

  if (currentDocuments.length === 0) {
    container.innerHTML = `
      <div class="review-documents-empty">
        <i class="fa-regular fa-folder-open"></i>

        <strong>
          No documents uploaded
        </strong>

        <span>
          Return to Upload Documents to add files.
        </span>
      </div>
    `;

    return;
  }

  container.innerHTML = currentDocuments
    .map((item) => {
      const serverDocument = item.document || {};

      const title =
        item.documentLabel || getDriverDocumentLabel(item.documentType);

      const fileName =
        item.originalName || serverDocument.originalName || "Uploaded document";

      const mimeType = item.mimeType || serverDocument.mimeType || "";

      const url =
        item.url ||
        serverDocument.url ||
        serverDocument.fileUrl ||
        serverDocument.downloadUrl ||
        "";

      const icon = getDriverDocumentIcon(mimeType);

      return `
          <article
            class="uploaded-doc-item"
          >
            <div
              class="uploaded-doc-icon"
            >
              <i class="${icon}"></i>
            </div>

            <div
              class="uploaded-doc-content"
            >
              <strong>
                ${escapeDriverReviewHtml(title)}
              </strong>

              <span
                title="${escapeDriverReviewHtml(fileName)}"
              >
                ${escapeDriverReviewHtml(fileName)}
              </span>

              <small>
                <i
                  class="fa-solid fa-circle-check"
                ></i>

                Uploaded
              </small>
            </div>

            ${
              url
                ? `
                  <button
                    type="button"
                    class="uploaded-doc-view"
                    data-document-url="${escapeDriverReviewHtml(url)}"
                  >
                    <i
                      class="fa-regular fa-eye"
                    ></i>

                    View
                  </button>
                `
                : `
                  <span
                    class="uploaded-doc-unavailable"
                  >
                    Preview unavailable
                  </span>
                `
            }
          </article>
        `;
    })
    .join("");

  container
    .querySelectorAll(".uploaded-doc-view[data-document-url]")
    .forEach((button) => {
      button.addEventListener("click", () => {
        const url = button.dataset.documentUrl;

        if (!url) {
          return;
        }

        window.open(url, "_blank", "noopener,noreferrer");
      });
    });
}

async function renderDriverReview() {
  const loading = document.getElementById("driver-review-loading");

  const grid = document.getElementById("driver-review-grid");

  const documentPanel = document.getElementById("review-documents-panel");

  loading?.classList.remove("hidden");
  grid?.classList.add("hidden");
  documentPanel?.classList.add("hidden");

  try {
    const { draft, documents } = await fetchDriverReviewData();

    const details = draft.details || draft.driverDetails || {};

    const assignment = draft.assignment || {};

    activeDriverDraftVersion =
      Number(draft.version) || activeDriverDraftVersion;

    setDriverReviewText(
      "review-full-name",
      details.fullName ||
        [details.firstName, details.middleName, details.lastName]
          .filter(Boolean)
          .join(" "),
    );

    setDriverReviewText(
      "review-date-of-birth",
      formatDriverReviewDate(details.dateOfBirth),
    );

    setDriverReviewText("review-id-number", details.idNumber);

    setDriverReviewText(
      "review-phone-number",
      `${details.phoneCountryCode || "+966"} ${details.phoneNumber || ""}`,
    );

    setDriverReviewText(
      "review-nationality",
      formatDriverReviewEnum(details.nationality),
    );

    setDriverReviewText(
      "review-id-expiry-date",
      formatDriverReviewDate(details.idExpiryDate),
    );

    setDriverReviewText(
      "review-email",
      details.email || getDriverFieldValue("driverEmail"),
    );

    setDriverReviewText(
      "review-id-type",
      formatDriverReviewEnum(details.idType),
    );

    setDriverReviewText(
      "review-driver-type",
      getDriverTypeDisplayText(details.driverType),
    );

    setDriverReviewText(
      "review-license-type",
      formatDriverReviewEnum(details.licenseType),
    );

    setDriverReviewText("review-license-number", details.licenseNumber);

    setDriverReviewText(
      "review-joining-date",
      formatDriverReviewDate(details.joiningDate),
    );

    setDriverReviewText(
      "review-license-expiry-date",
      formatDriverReviewDate(details.licenseExpiryDate),
    );

    setDriverReviewText(
      "review-employer",
      getDriverSelectDisplayText(
        "driver-assignment-employer",
        assignment.employerId,
      ),
    );

    setDriverReviewText(
      "review-assignment-branch",
      getDriverSelectDisplayText(
        "driver-assignment-branch",
        assignment.branchId,
      ),
    );

    setDriverReviewText(
      "review-location",
      getDriverSelectDisplayText(
        "driver-assignment-location",
        assignment.locationId,
      ),
    );

    setDriverReviewText(
      "review-parking-zones",
      getDriverMultipleDisplayText(
        "driver-assignment-zones",
        assignment.parkingZoneIds,
      ),
    );

    setDriverReviewText(
      "review-work-shift",
      getDriverSelectDisplayText(
        "driver-assignment-shift",
        assignment.workShift,
      ),
    );

    setDriverReviewText(
      "review-shift-days",
      getDriverMultipleDisplayText(
        "driver-assignment-days",
        assignment.shiftDays,
      ),
    );

    setDriverReviewText(
      "review-access-level",
      getDriverSelectDisplayText(
        "driver-assignment-access",
        assignment.vehicleAccessLevel,
      ),
    );

    setDriverReviewText("review-assignment-notes", assignment.notes);

    const profileImage = document.getElementById("review-profile-photo");

    const uploadedProfileDocument = documents.find(
      (item) =>
        item.documentSlot === "PROFILE_PHOTO" ||
        item.documentType === "PROFILE_PHOTO",
    );

    const profileImageUrl =
      uploadedProfileDocument?.url ||
      uploadedProfileDocument?.document?.url ||
      uploadedProfileDocument?.document?.fileUrl ||
      uploadedProfileDocument?.document?.downloadUrl ||
      draft.profilePhoto?.url ||
      draft.profilePhoto?.fileUrl ||
      draft.profilePhoto?.downloadUrl ||
      document.querySelector(".driver-photo-preview")?.src ||
      "";

    if (profileImageUrl && profileImage) {
      profileImage.src = profileImageUrl;

      profileImage.classList.remove("hidden");
    }

    renderDriverReviewDocuments(documents);

    grid?.classList.remove("hidden");
    documentPanel?.classList.remove("hidden");
  } finally {
    loading?.classList.add("hidden");
  }
}

function bindAddDriverSteps() {
  const addDriverPage = document.querySelector(".add-driver-shell");

  if (!addDriverPage) {
    console.error("Add Driver page was not found.");

    return;
  }

  if (addDriverPage.dataset.stepsBound === "true") {
    return;
  }

  addDriverPage.dataset.stepsBound = "true";

  initializeDriverMultiSelect({
    controlId: "driver-assignment-zones-control",
    selectId: "driver-assignment-zones",
    placeholder: "Select parking zones",
  });

  initializeDriverMultiSelect({
    controlId: "driver-assignment-days-control",
    selectId: "driver-assignment-days",
    placeholder: "Select shift days",
  });

  const assignmentNotes = document.getElementById("driver-assignment-notes");

  const assignmentNotesCounter = assignmentNotes
    ?.closest("label")
    ?.querySelector("em");

  const updateAssignmentNotesCounter = () => {
    if (!assignmentNotes || !assignmentNotesCounter) {
      return;
    }

    assignmentNotesCounter.textContent = `${assignmentNotes.value.length} / 250`;
  };

  assignmentNotes?.addEventListener("input", updateAssignmentNotesCounter);

  updateAssignmentNotesCounter();

  const details = document.querySelector("#driver-step-details");

  const assignment = document.querySelector("#driver-step-assignment");

  const documents = document.querySelector("#driver-step-documents");

  const review = document.querySelector("#driver-step-review");

  const fullNameInput = details?.querySelector("#fullName");

  const phoneNumberInput = details?.querySelector("#phoneNumber");

  const emailInput = details?.querySelector("#driverEmail");

  const dateOfBirthInput = details?.querySelector("#dateOfBirth");

  const idNumberInput = details?.querySelector("#idNumber");

  /*
   * Latest allowed date of birth:
   * exactly 20 years before today.
   */
  if (dateOfBirthInput) {
    const today = new Date();

    const maximumBirthDate = new Date(
      today.getFullYear() - 20,
      today.getMonth(),
      today.getDate(),
    );

    dateOfBirthInput.max = formatDriverDateInput(maximumBirthDate);
  }

  /*
   * Full Name:
   * prevent numbers and special characters.
   */
  fullNameInput?.addEventListener("input", () => {
    fullNameInput.value = fullNameInput.value.replace(
      /[^A-Za-z\u0621-\u063A\u0641-\u064A\u066E-\u066F\u0671-\u06D3\u06FA-\u06FC\s]/g,
      "",
    );
  });

  /*
   * Phone:
   * digits only and maximum 9.
   */
  phoneNumberInput?.addEventListener("input", () => {
    let value = phoneNumberInput.value.replace(/\D/g, "").slice(0, 9);

    if (value.length > 0) {
      value = "5" + value.substring(1);
    }

    phoneNumberInput.value = value;
  });

  /*
   * Email:
   * prevent spaces.
   */
  emailInput?.addEventListener("input", () => {
    emailInput.value = emailInput.value.replace(/\s/g, "");
  });

  emailInput?.addEventListener("blur", () => {
    emailInput.value = emailInput.value.trim().toLowerCase();
  });

  /*
   * ID / Iqama:
   * digits only and maximum 10.
   */
  idNumberInput?.addEventListener("input", () => {
    idNumberInput.value = idNumberInput.value.replace(/\D/g, "").slice(0, 10);
  });

  const steps = document.querySelectorAll(".driver-stepper .step");

  const driverPhotoInput = addDriverPage.querySelector("#driverPhoto");

  const markDriverFormDirty = () => {
    isDriverFormDirty = true;
  };

  addDriverPage
    .querySelectorAll("input:not([type='file']), select, textarea")
    .forEach((field) => {
      const eventName = field.tagName === "SELECT" ? "change" : "input";

      field.addEventListener(eventName, markDriverFormDirty);
    });

  driverPhotoInput?.addEventListener("change", markDriverFormDirty);
  const nextAssignmentButton = addDriverPage.querySelector(
    "#nextAssignmentButton",
  );

  nextAssignmentButton?.addEventListener("click", async (event) => {
    event.preventDefault();

    if (!details || !assignment) {
      console.error("Driver details or assignment step was not found.");

      return;
    }

    /*
     * Validate before disabling the button
     * or calling the draft API.
     */
    const isValid = validateDriverDetailsStep(details);

    if (!isValid) {
      return;
    }

    const originalContent = nextAssignmentButton.innerHTML;

    try {
      nextAssignmentButton.disabled = true;

      nextAssignmentButton.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Saving...`;

      await saveDriverDetailsDraft(driverPhotoInput);

      driverDocumentUploader?.setDriverId(activeDriverDraftId);

      details.classList.add("hidden");

      assignment.classList.remove("hidden");

      steps[0]?.classList.remove("active");

      steps[0]?.classList.add("completed");

      steps[1]?.classList.add("active");

      steps[1]?.classList.remove("completed");

      const scroller = document.querySelector(".dashboard-main") || window;

      scroller.scrollTo({
        top: 0,
        behavior: "smooth",
      });
    } catch (error) {
      console.error("Unable to continue to Assignment:", error);

      alert(error?.message || "Unable to save driver details.");
    } finally {
      nextAssignmentButton.disabled = false;

      nextAssignmentButton.innerHTML = originalContent;
    }
  });

  details
    ?.querySelectorAll("input:not([type='file']), select")
    .forEach((input) => {
      const eventName = input.tagName === "SELECT" ? "change" : "input";

      input.addEventListener(eventName, () => {
        clearSingleDriverFieldError(input);
      });
    });

  const photoUploadBox = driverPhotoInput?.closest(".photo-upload-box");

  let driverPhotoPreviewUrl = null;

  driverPhotoInput?.addEventListener("change", () => {
    const file = driverPhotoInput.files?.[0];

    if (!file || !photoUploadBox) {
      return;
    }

    const allowedTypes = ["image/jpeg", "image/png", "image/webp"];

    if (!allowedTypes.includes(file.type)) {
      alert("Please select a JPG, PNG or WEBP image.");

      driverPhotoInput.value = "";
      return;
    }

    const maximumSize = 2 * 1024 * 1024;

    if (file.size > maximumSize) {
      alert("Driver photo must not exceed 2MB.");

      driverPhotoInput.value = "";
      return;
    }

    if (driverPhotoPreviewUrl) {
      URL.revokeObjectURL(driverPhotoPreviewUrl);
    }

    driverPhotoPreviewUrl = URL.createObjectURL(file);

    let previewImage = photoUploadBox.querySelector(".driver-photo-preview");

    if (!previewImage) {
      previewImage = document.createElement("img");

      previewImage.className = "driver-photo-preview";

      previewImage.alt = "Selected driver photo";

      photoUploadBox.prepend(previewImage);
    }

    previewImage.src = driverPhotoPreviewUrl;

    photoUploadBox.classList.add("has-photo");

    const fileName = photoUploadBox.querySelector(".driver-photo-file-name");

    if (fileName) {
      fileName.textContent = file.name;
    }
  });

  document
    .querySelector("#download-driver-summary")
    ?.addEventListener("click", async (event) => {
      const button = event.currentTarget;

      const originalContent = button.innerHTML;

      try {
        button.disabled = true;

        button.innerHTML = `
          <i class="fa-solid fa-spinner fa-spin"></i>
          Generating PDF...
        `;

        await downloadDriverSummaryPdf();
      } catch (error) {
        console.error("Unable to download driver summary:", error);

        alert(error?.message || "Unable to generate the driver summary PDF.");
      } finally {
        button.disabled = false;

        button.innerHTML = originalContent;
      }
    });

  document
    .querySelector("#back-driver-details")
    ?.addEventListener("click", () => {
      assignment?.classList.add("hidden");
      details?.classList.remove("hidden");

      steps[1].classList.remove("active");
      steps[1].classList.remove("completed");

      steps[0].classList.remove("completed");
      steps[0].classList.add("active");
    });

  document
    .querySelector("#save-driver-assignment-draft")
    ?.addEventListener("click", async (event) => {
      const button = event.currentTarget;

      const originalText = button.textContent;

      try {
        button.disabled = true;
        button.textContent = "Saving...";

        await saveDriverAssignmentDraft();

        showDriverDraftSuccessModal();
      } catch (error) {
        console.error("Unable to save driver assignment:", error);

        alert(error?.message || "Unable to save driver assignment.");
      } finally {
        button.disabled = false;
        button.textContent = originalText || "Save as Draft";
      }
    });

  document
    .querySelector("#go-documents")
    ?.addEventListener("click", async (event) => {
      const button = event.currentTarget;

      const originalContent = button.innerHTML;

      try {
        button.disabled = true;
        button.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Saving...`;

        await saveDriverAssignmentDraft();

        assignment?.classList.add("hidden");

        documents?.classList.remove("hidden");

        steps[1]?.classList.remove("active");

        steps[1]?.classList.add("completed");

        steps[2]?.classList.add("active");

        steps[2]?.classList.remove("completed");
      } catch (error) {
        console.error("Unable to continue from assignment:", error);

        alert(error?.message || "Unable to save the assignment.");
      } finally {
        button.disabled = false;
        button.innerHTML = originalContent;
      }
    });

  document
    .querySelector("#back-driver-assignment")
    ?.addEventListener("click", () => {
      documents?.classList.add("hidden");
      assignment?.classList.remove("hidden");

      steps[2]?.classList.remove("active");
      steps[2]?.classList.remove("completed");

      steps[1]?.classList.add("active");
      steps[1]?.classList.remove("completed");
    });

  document
    .querySelector("#save-driver-documents-draft")
    ?.addEventListener("click", async (event) => {
      const button = event.currentTarget;

      const originalText = button.textContent.trim();

      try {
        button.disabled = true;
        button.textContent = "Saving...";

        await saveDriverDocumentsDraft();

        showDriverDraftSuccessModal();
      } catch (error) {
        console.error("Unable to save document draft:", error);

        alert(error?.message || "Unable to save uploaded documents as draft.");
      } finally {
        button.disabled = false;

        button.textContent = originalText || "Save as Draft";
      }
    });

  document.querySelector("#go-review")?.addEventListener("click", async () => {
    const reviewButton = document.querySelector("#go-review");

    if (!reviewButton) {
      return;
    }

    reviewButton.disabled = true;

    reviewButton.classList.add("loading");

    /*
     * First prevent navigation while any
     * document upload is still running.
     */
    const uploadingDocuments = document.querySelectorAll(
      "#driver-step-documents " + ".document-card.is-uploading",
    );

    if (uploadingDocuments.length > 0) {
      const warningBox = document.querySelector("#document-required-warning");

      const warningText = document.querySelector(
        "#document-required-warning-text",
      );

      if (warningText) {
        warningText.textContent =
          "Please wait until all document uploads are complete.";
      }

      warningBox?.classList.add("visible");

      uploadingDocuments[0]?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });

      reviewButton.disabled = false;

      reviewButton.classList.remove("loading");

      return;
    }

    /*
     * Validate required documents.
     */
    const validation = driverDocumentUploader?.validateRequiredDocuments();

    if (validation && !validation.valid) {
      const firstMissingCard = validation.missing[0]?.closest(".document-card");

      firstMissingCard?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });

      firstMissingCard?.classList.add("has-error");

      window.setTimeout(() => {
        firstMissingCard?.classList.remove("has-error");
      }, 2200);

      const warningBox = document.querySelector("#document-required-warning");

      const warningText = document.querySelector(
        "#document-required-warning-text",
      );

      if (warningText) {
        warningText.textContent = `${validation.missingCount} required ${
          validation.missingCount === 1 ? "document is" : "documents are"
        } still missing. Please upload ${
          validation.missingCount === 1 ? "it" : "them"
        } before continuing.`;
      }

      warningBox?.classList.add("visible");

      warningBox?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });

      reviewButton.disabled = false;

      reviewButton.classList.remove("loading");

      return;
    }

    document
      .querySelector("#document-required-warning")
      ?.classList.remove("visible");

    try {
      await saveDriverDocumentsDraft();

      await renderDriverReview();
    } catch (error) {
      console.error("Unable to load driver review:", error);

      alert(error?.message || "Unable to load the saved driver information.");

      reviewButton.disabled = false;

      reviewButton.classList.remove("loading");

      return;
    }

    reviewButton.disabled = false;

    reviewButton.classList.remove("loading");

    documents?.classList.add("hidden");

    review?.classList.remove("hidden");

    steps[2]?.classList.remove("active");

    steps[2]?.classList.add("completed");

    steps[3]?.classList.add("active");

    steps[3]?.classList.remove("completed");

    const scroller = document.querySelector(".dashboard-main") || window;

    scroller.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  });

  /*
   * Review section Edit buttons.
   */
  document.querySelectorAll("[data-review-edit-step]").forEach((button) => {
    button.addEventListener("click", () => {
      const targetStep = button.dataset.reviewEditStep;

      review?.classList.add("hidden");

      details?.classList.add("hidden");

      assignment?.classList.add("hidden");

      documents?.classList.add("hidden");

      steps.forEach((step) => {
        step.classList.remove("active");
      });

      if (targetStep === "details") {
        details?.classList.remove("hidden");

        steps[0]?.classList.add("active");
      }

      if (targetStep === "assignment") {
        assignment?.classList.remove("hidden");

        steps[1]?.classList.add("active");
      }

      if (targetStep === "documents") {
        documents?.classList.remove("hidden");

        steps[2]?.classList.add("active");
      }

      const scroller = document.querySelector(".dashboard-main") || window;

      scroller.scrollTo({
        top: 0,
        behavior: "smooth",
      });
    });
  });

  document
    .querySelector("#back-driver-documents")
    ?.addEventListener("click", () => {
      review?.classList.add("hidden");
      documents?.classList.remove("hidden");

      steps[3]?.classList.remove("active");
      steps[3]?.classList.remove("completed");

      steps[2]?.classList.add("active");
      steps[2]?.classList.remove("completed");
    });

  document
    .querySelector("#submit-driver-btn")
    ?.addEventListener("click", async (event) => {
      const button = event.currentTarget;
      const originalContent = button.innerHTML;

      if (!activeDriverDraftId) {
        alert(
          "Driver draft was not found. Please restart the Add Driver process.",
        );

        return;
      }

      try {
        button.disabled = true;

        button.innerHTML = `
          <i class="fa-solid fa-spinner fa-spin"></i>
          Submitting...
        `;

        const response = await fetch(
          `${getDriverApiBaseUrl()}/driver-drafts/${activeDriverDraftId}/submit`,
          {
            method: "POST",

            headers: getDriverAuthHeaders(true),

            body: JSON.stringify({
              version: activeDriverDraftVersion,
            }),
          },
        );

        const result = await parseDriverDraftResponse(response);

        const createdDriverCode = document.querySelector(
          "#created-driver-code",
        );

        if (createdDriverCode) {
          createdDriverCode.textContent = result.driverCode || "—";
        }

        /*
         * Preserve created identifiers for
         * View Drivers List or details navigation.
         */
        if (result.driverId) {
          sessionStorage.setItem("selectedDriverId", result.driverId);
        }

        document
          .querySelector("#driver-success-modal")
          ?.classList.remove("hidden");

        /*
         * The draft is completed, so it must
         * no longer be restored as an active draft.
         */
        localStorage.removeItem(DRIVER_DRAFT_STORAGE_KEY);

        sessionStorage.removeItem("currentDriverId");

        activeDriverDraftId = null;
        activeDriverDraftVersion = 1;
        isDriverFormDirty = false;
      } catch (error) {
        console.error("Unable to submit driver:", error);

        alert(error?.message || "Unable to create the driver.");
      } finally {
        button.disabled = false;
        button.innerHTML = originalContent;
      }
    });

  document
    .querySelector("#close-driver-success")
    ?.addEventListener("click", () => {
      document.querySelector("#driver-success-modal")?.classList.add("hidden");
    });

  document
    .querySelector("#view-drivers-list")
    ?.addEventListener("click", () => {
      document.querySelector("#driver-success-modal")?.classList.add("hidden");
      window.location.hash = "drivers";
    });

  /*
   * Cancel Driver
   */
  const cancelDriverModal = document.querySelector("#driver-cancel-modal");

  const openCancelDriverModal = () => {
    if (!cancelDriverModal) {
      console.error("Driver cancel modal was not found.");

      return;
    }

    cancelDriverModal.classList.remove("hidden");
    document.body.classList.add("driver-confirm-open");

    document.querySelector("#keep-editing-driver")?.focus();
  };

  const closeCancelDriverModal = () => {
    cancelDriverModal?.classList.add("hidden");
    document.body.classList.remove("driver-confirm-open");
  };

  document.querySelector("#cancel-driver")?.addEventListener("click", () => {
    const hasEnteredData = hasDriverFormData(addDriverPage);

    if (!isDriverFormDirty && !hasEnteredData) {
      resetAddDriverWizard();

      window.location.hash = "drivers";

      return;
    }

    openCancelDriverModal();
  });

  document
    .querySelector("#keep-editing-driver")
    ?.addEventListener("click", closeCancelDriverModal);

  document
    .querySelector("#close-driver-cancel-modal")
    ?.addEventListener("click", closeCancelDriverModal);

  document
    .querySelector("[data-close-driver-confirm]")
    ?.addEventListener("click", closeCancelDriverModal);

  /*
   * Delete/Cancel Driver Draft
   */
  document
    .querySelector("#confirm-cancel-driver")
    ?.addEventListener("click", async (event) => {
      const button = event.currentTarget;

      const originalContent = button.innerHTML;

      try {
        button.disabled = true;
        button.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> <span>Deleting...</span>`;

        if (activeDriverDraftId) {
          await deleteActiveDriverDraft();
        }

        closeCancelDriverModal();

        driverDocumentUploader?.resetAll();

        resetAddDriverWizard();

        window.location.hash = "drivers";
      } catch (error) {
        console.error("Unable to delete driver draft:", error);

        alert(error?.message || "Unable to delete driver draft.");
      } finally {
        button.disabled = false;
        button.innerHTML = originalContent;
      }
    });

  /*
   * Save Driver Draft
   */
  document
    .querySelector("#save-driver-draft")
    ?.addEventListener("click", async (event) => {
      const button = event.currentTarget;

      const originalText = button.textContent;

      try {
        button.disabled = true;
        button.textContent = "Saving...";

        await saveDriverDetailsDraft(driverPhotoInput);

        showDriverDraftSuccessModal();
      } catch (error) {
        console.error("Unable to save driver draft:", error);

        alert(error?.message || "Unable to save driver draft.");
      } finally {
        button.disabled = false;
        button.textContent = originalText || "Save as Draft";
      }
    });

  document
    .querySelector("#add-another-driver")
    ?.addEventListener("click", () => {
      document.querySelector("#driver-success-modal")?.classList.add("hidden");

      localStorage.removeItem(DRIVER_DRAFT_STORAGE_KEY);

      sessionStorage.removeItem("currentDriverId");
      activeDriverDraftId = null;
      activeDriverDraftVersion = 1;

      driverDocumentUploader?.setDriverId(null);

      driverDocumentUploader?.resetAll();

      resetAddDriverWizard();

      window.scrollTo({
        top: 0,
        behavior: "smooth",
      });
    });
}

function restoreDriverPhotoPreview(profilePhoto) {
  const photoBox = document.querySelector(".photo-upload-box");

  if (!photoBox || !profilePhoto?.url) {
    return;
  }

  let previewImage = photoBox.querySelector(".driver-photo-preview");

  if (!previewImage) {
    previewImage = document.createElement("img");

    previewImage.className = "driver-photo-preview";

    previewImage.alt = "Saved driver profile photo";

    photoBox.prepend(previewImage);
  }

  previewImage.src = profilePhoto.url;

  photoBox.classList.add("has-photo");

  const fileName = photoBox.querySelector(".driver-photo-file-name");

  if (fileName) {
    fileName.textContent = profilePhoto.originalName || "Saved profile photo";
  }
}

function resetAddDriverWizard() {
  selectedDriverVehicles = [];

  driverVehicleCatalog.clear();

  pendingDriverVehicleIds.clear();

  renderAssignedDriverVehicles();

  isDriverFormDirty = false;
  const details = document.querySelector("#driver-step-details");

  if (details) {
    clearDriverDetailErrors(details);

    const form = details.querySelector("#driver-details-form");

    form?.reset();

    const photoBox = details.querySelector(".photo-upload-box");

    photoBox?.querySelector(".driver-photo-preview")?.remove();

    photoBox?.classList.remove("has-photo");

    const fileName = photoBox?.querySelector(".driver-photo-file-name");

    if (fileName) {
      fileName.textContent = "No file selected";
    }
  }

  const assignment = document.querySelector("#driver-step-assignment");

  if (assignment) {
    assignment.querySelectorAll("select, textarea").forEach((field) => {
      if (field instanceof HTMLSelectElement && field.multiple) {
        Array.from(field.options).forEach((option) => {
          option.selected = false;
        });

        return;
      }

      field.value = "";
    });

    syncDriverMultiSelectControl(
      "driver-assignment-zones-control",
      "driver-assignment-zones",
      "Select parking zones",
    );

    syncDriverMultiSelectControl(
      "driver-assignment-days-control",
      "driver-assignment-days",
      "Select shift days",
    );

    const notesCounter = assignment.querySelector(".assignment-notes-card em");

    if (notesCounter) {
      notesCounter.textContent = "0 / 250";
    }
  }

  document.querySelectorAll(".add-driver-step-content").forEach((section) => {
    section.classList.add("hidden");
  });

  document.querySelector("#driver-step-details")?.classList.remove("hidden");

  const steps = document.querySelectorAll(".driver-stepper .step");

  steps.forEach((step) => {
    step.classList.remove("active", "completed");
  });

  steps[0]?.classList.add("active");

  document.querySelector("#driver-success-modal")?.classList.add("hidden");

  const scroller = document.querySelector(".dashboard-main") || window;

  scroller.scrollTo({
    top: 0,
    behavior: "auto",
  });
}

function bindDriversScrollReveal() {
  const bottomGrid = document.querySelector(".drivers-bottom-grid");

  if (!bottomGrid) {
    return;
  }

  if (bottomGrid.dataset.revealBound == "true") {
    return;
  }

  bottomGrid.dataset.revealBound = "true";

  bottomGrid.querySelectorAll(".drivers-panel").forEach((panel) => {
    panel.classList.add("reveal-on-scroll");
  });

  const scrollRoot = document.querySelector(".dashboard-main") || null;

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;

        bottomGrid.querySelectorAll(".drivers-panel").forEach((panel) => {
          panel.classList.add("is-visible");
        });

        initDriversCharts();
        observer.disconnect();
      });
    },
    {
      root: scrollRoot,
      threshold: 0.15,
      rootMargin: "0px 0px -80px 0px",
    },
  );

  observer.observe(bottomGrid);
}

function initDriversCharts() {
  if (driversCompanyChart) driversCompanyChart.destroy();
  if (driversLocationChart) driversLocationChart.destroy();
  if (driversStatusChart) driversStatusChart.destroy();

  driversCompanyChart = createDriverDoughnutChart(
    "#drivers-company-chart",
    [24, 18, 12, 18],
    ["#2563eb", "#0f9f5c", "#7c3aed", "#94a3b8"],
  );

  driversLocationChart = createDriverDoughnutChart(
    "#drivers-location-chart",
    [24, 16, 14, 10, 8],
    ["#2563eb", "#0f9f5c", "#94a3b8", "#f59e0b", "#ef4444"],
  );

  driversStatusChart = createDriverDoughnutChart(
    "#drivers-status-chart",
    [58, 10, 4, 2],
    ["#0f9f5c", "#94a3b8", "#f59e0b", "#ef4444"],
  );
}

function showDriverFieldError(input, message) {
  const wrapper = getDriverFieldWrapper(input);

  if (!wrapper) {
    console.warn(`Label wrapper was not found for #${input.id}`);

    return;
  }

  const visualField =
    input.id === "phoneNumber" ? wrapper.querySelector(".phone-input") : input;

  visualField?.classList.add("driver-input-error");

  wrapper.querySelector(".driver-field-error")?.remove();

  const errorElement = document.createElement("small");

  errorElement.className = "driver-field-error";

  errorElement.textContent = message;

  wrapper.appendChild(errorElement);
}
