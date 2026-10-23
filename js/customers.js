let customerTrendCharts = [];
let customerDetailsAbortController = null;
let customerDetailsRequestId = 0;
let customerListAbortController = null;
let customerListRequestId = 0;
let customerEditReturnRoute = null;
let customerEditAbortController = null;
let customerEditRequestId = 0;
const customerListState = {
  page: 1,
  limit: 20,
  search: "",
  status: "",
  customerType: "",
  createdSource: "",
  sort: "createdAt_desc",
  controlsBound: false,
};

const DEMO_CUSTOMER_RECORDS = Object.freeze([
  Object.freeze({
    displayId: "CUS-1001",
    databaseId: "11111111-1111-4111-8111-111111111001",
  }),
  Object.freeze({
    displayId: "CUS-1002",
    databaseId: "11111111-1111-4111-8111-111111111002",
  }),
  Object.freeze({
    displayId: "CUS-1003",
    databaseId: "11111111-1111-4111-8111-111111111003",
  }),
]);

function resolveCustomerRecord(routeIdentifier) {
  const identifier = String(routeIdentifier || "").trim();
  const demoRecord = DEMO_CUSTOMER_RECORDS.find(
    (record) => record.displayId === identifier,
  );
  if (demoRecord) return demoRecord;
  if (isCustomerDatabaseId(identifier)) {
    return { displayId: identifier, databaseId: identifier };
  }
  return null;
}

function resolveCustomerDatabaseId(routeIdentifier) {
  return resolveCustomerRecord(routeIdentifier)?.databaseId || null;
}

window.resolveCustomerRecord = resolveCustomerRecord;
window.resolveCustomerDatabaseId = resolveCustomerDatabaseId;

function getCustomerDetailsRouteHash(tab = "") {
  const customerId = getCurrentCustomerId();
  if (!customerId) return "#customers";
  const query = new URLSearchParams({ id: customerId });
  if (tab) query.set("tab", tab);
  return `#customer-details?${query.toString()}`;
}

function navigateToCustomerEdit(customerId, returnRoute) {
  if (!customerId) return;

  const encodedId = encodeURIComponent(customerId);
  const editHash = `#edit-customer?id=${encodedId}`;
  customerEditReturnRoute = returnRoute || `#customer-details?id=${encodedId}`;

  window.location.hash = editHash;
}

function getCustomerEditReturnRoute(customerId) {
  if (customerEditReturnRoute) return customerEditReturnRoute;
  return "#customers";
}

function getCustomerVehicleApiBaseUrl() {
  return window.PARKIN_CONFIG?.apiBaseUrl || "https://api.parkin.com.sa";
}

function getCustomerManagementApiBaseUrl() {
  return (
    window.PARKIN_CONFIG?.userManagementApiBaseUrl ||
    "https://api.parkin.com.sa"
  );
}

function getCustomerManagementAuthHeaders() {
  const accessToken = localStorage.getItem("parkin_access_token");
  if (!accessToken) {
    throw new Error("Your login session has expired. Please sign in again.");
  }
  return {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
  };
}

async function fetchCustomerRecord(customerId, signal) {
  const response = await fetch(
    `${getCustomerManagementApiBaseUrl()}/customers/${encodeURIComponent(customerId)}`,
    { headers: getCustomerManagementAuthHeaders(), signal },
  );
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error("Unable to load customer.");
    error.status = response.status;
    throw error;
  }
  return body?.data?.customer || body?.customer || body?.data || body;
}

async function fetchCustomerVehicles(customerId, signal) {
  const query = new URLSearchParams({ customerId });
  const response = await fetch(
    `${getCustomerVehicleApiBaseUrl()}/vehicles?${query.toString()}`,
    { headers: getCustomerVehicleAuthHeaders(), signal },
  );
  const result = await response.json().catch(() => null);

  if (!response.ok) {
    const error = new Error("Unable to load customer vehicles.");
    error.status = response.status;
    throw error;
  }

  const data = result?.data ?? result;
  return Array.isArray(data?.items)
    ? data.items
    : Array.isArray(data?.vehicles)
      ? data.vehicles
      : Array.isArray(data)
        ? data
        : [];
}

async function hydrateDemoCustomerRows(container) {
  const rows = [...container.querySelectorAll(".customers-row")].filter(
    (row) => !row.classList.contains("customers-head"),
  );
  const displayIds = DEMO_CUSTOMER_RECORDS.map((record) => record.displayId);

  rows.forEach((row, index) => {
    const displayId = displayIds[index];
    if (!displayId) return;
    row.dataset.customerId = displayId;
    row.querySelectorAll("[data-customer-action]").forEach((action) => {
      const permissionByAction = {
        view: "customers.view",
        edit: "customers.edit",
        vehicle: "vehicles.create",
        bookings: "bookings.view",
      };
      const permission = permissionByAction[action.dataset.customerAction];
      if (permission) action.dataset.requiredPermission = permission;
      action.dataset.customerId = displayId;
    });
    row
      .querySelector(".customer-more-btn")
      ?.setAttribute("data-customer-id", displayId);
  });

  const records = await Promise.all(
    displayIds.map(async (displayId) => {
      try {
        return [
          displayId,
          await fetchCustomerRecord(
            resolveCustomerRecord(displayId).databaseId,
          ),
        ];
      } catch (error) {
        return [displayId, null];
      }
    }),
  );

  records.forEach(([displayId, customer]) => {
    if (!customer) return;
    const row = rows[displayIds.indexOf(displayId)];
    if (!row) return;
    const setText = (selector, value) => {
      const element = row.querySelector(selector);
      if (element && value !== undefined && value !== null)
        element.textContent = value;
    };
    setText(".customer-profile b", customer.fullName || "Customer");
    setText(".customer-profile small", displayId);
    setText(
      ".customer-contact-line:nth-child(1) span",
      customer.phoneNumber
        ? `${customer.phoneCountryCode || "+966"} ${customer.phoneNumber}`
        : "-",
    );
    setText(".customer-contact-line:nth-child(2) span", customer.email || "-");
    setText(".customer-status", formatCustomerStatus(customer.status));
  });
}

function filterDemoCustomerRows(container) {
  const searchInput = container.querySelector(
    "#customers-search, .customers-search input",
  );
  const statusFilter = container.querySelector(
    "#customers-status-filter, .customers-table-controls select[aria-label*='status' i]",
  );
  const typeFilter = container.querySelector(
    "#customers-type-filter, .customers-table-controls select[aria-label*='type' i]",
  );
  const search = searchInput?.value.trim().toLowerCase() || "";
  const statusValue = statusFilter?.value.trim().toLowerCase() || "";
  const typeValue = typeFilter?.value.trim().toLowerCase() || "";
  const status = statusValue.startsWith("all") ? "" : statusValue;
  const type = typeValue.startsWith("all") ? "" : typeValue;
  const rows = [...container.querySelectorAll(".customers-row")].filter(
    (row) => !row.classList.contains("customers-head"),
  );

  rows.forEach((row) => {
    const matchesSearch =
      !search || row.textContent.toLowerCase().includes(search);
    const rowStatus =
      row.querySelector(".customer-status")?.textContent.toLowerCase() || "";
    const rowType =
      row.querySelector(".customer-type")?.textContent.toLowerCase() || "";
    row.hidden =
      !matchesSearch ||
      (status && !rowStatus.includes(status)) ||
      (type && !rowType.includes(type));
  });
}

function isCustomerDatabaseId(customerId) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    customerId || "",
  );
}

function getCustomerVehicleAuthHeaders() {
  const accessToken = localStorage.getItem("parkin_access_token");

  if (!accessToken) {
    throw new Error("Your login session has expired. Please sign in again.");
  }

  return {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
  };
}

async function parseCustomerVehicleResponse(response) {
  const result = await response.json().catch(() => null);

  if (!response.ok) {
    const message = Array.isArray(result?.message)
      ? result.message.join(", ")
      : result?.message ||
        result?.error ||
        `Vehicle request failed with status ${response.status}.`;

    throw new Error(message);
  }

  return result?.data ?? result;
}

async function fetchCustomerStatistics(signal) {
  const response = await fetch(
    `${getCustomerManagementApiBaseUrl()}/customers/statistics`,
    {
      headers: getCustomerManagementAuthHeaders(),
      signal,
    },
  );

  const body =
    await response.json().catch(() => null);

  if (!response.ok) {
    const message =
      Array.isArray(body?.message)
        ? body.message.join(" ")
        : body?.message ||
          body?.error ||
          "Unable to load customer statistics.";

    const error = new Error(message);
    error.status = response.status;

    throw error;
  }

  return body?.data ?? body;
}


function formatCustomerKpiNumber(value) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return "—";
  }

  return number.toLocaleString("en-US");
}


function setCustomerKpiTrend(
  container,
  selector,
  metric,
) {
  const element =
    container.querySelector(selector);

  if (!element) return;

  const icon =
    element.querySelector("i");

  const label =
    element.querySelector("span");

  const change =
    metric?.changePercent;

  element.classList.remove(
    "up",
    "down",
    "neutral",
  );

  if (change === null) {
    const current =
      Number(metric?.value);

    const previous =
      Number(metric?.previous);

    if (
      Number.isFinite(current) &&
      Number.isFinite(previous) &&
      previous === 0 &&
      current > 0
    ) {
      element.classList.add("up");

      if (icon) {
        icon.className =
          "fa-solid fa-caret-up";
      }

      if (label) {
        label.textContent = "New";
      }

      return;
    }

    element.classList.add("neutral");

    if (icon) {
      icon.className =
        "fa-solid fa-minus";
    }

    if (label) {
      label.textContent = "—";
    }

    return;
  }

  const number =
    Number(change);

  if (!Number.isFinite(number)) {
    element.classList.add("neutral");

    if (icon) {
      icon.className =
        "fa-solid fa-minus";
    }

    if (label) {
      label.textContent = "—";
    }

    return;
  }

  if (number > 0) {
    element.classList.add("up");

    if (icon) {
      icon.className =
        "fa-solid fa-caret-up";
    }
  } else if (number < 0) {
    element.classList.add("down");

    if (icon) {
      icon.className =
        "fa-solid fa-caret-down";
    }
  } else {
    element.classList.add("neutral");

    if (icon) {
      icon.className =
        "fa-solid fa-minus";
    }
  }

  if (label) {
    label.textContent =
      `${Math.abs(number).toFixed(1)}%`;
  }
}


function renderCustomerStatistics(
  container,
  statistics,
) {
  const setText = (
    selector,
    value,
  ) => {
    const element =
      container.querySelector(selector);

    if (element) {
      element.textContent = value;
    }
  };

  const total =
    statistics?.totalCustomers;

  const mobile =
    statistics?.mobileAppCustomers;

  const newCustomers =
    statistics?.newCustomers;

  const returning =
    statistics?.returningCustomers;

  setText(
    "#customers-kpi-total",
    formatCustomerKpiNumber(
      total?.value,
    ),
  );

  setText(
    "#customers-kpi-mobile",
    formatCustomerKpiNumber(
      mobile?.value,
    ),
  );

  setText(
    "#customers-kpi-new",
    formatCustomerKpiNumber(
      newCustomers?.value,
    ),
  );

  setText(
    "#customers-kpi-returning",
    formatCustomerKpiNumber(
      returning?.value,
    ),
  );

  const share =
    Number(mobile?.sharePercent);

  setText(
    "#customers-kpi-mobile-share",
    Number.isFinite(share)
      ? `${share.toFixed(1)}% of total customers`
      : "— of total customers",
  );

  setCustomerKpiTrend(
    container,
    "#customers-kpi-total-trend",
    total,
  );

  setCustomerKpiTrend(
    container,
    "#customers-kpi-mobile-trend",
    mobile,
  );

  setCustomerKpiTrend(
    container,
    "#customers-kpi-new-trend",
    newCustomers,
  );

  setCustomerKpiTrend(
    container,
    "#customers-kpi-returning-trend",
    returning,
  );
}


function renderCustomerStatisticsUnavailable(
  container,
) {
  [
    "#customers-kpi-total",
    "#customers-kpi-mobile",
    "#customers-kpi-new",
    "#customers-kpi-returning",
  ].forEach((selector) => {
    const element =
      container.querySelector(selector);

    if (element) {
      element.textContent = "—";
    }
  });

  const share =
    container.querySelector(
      "#customers-kpi-mobile-share",
    );

  if (share) {
    share.textContent =
      "Statistics unavailable";
  }

  [
    "#customers-kpi-total-trend",
    "#customers-kpi-mobile-trend",
    "#customers-kpi-new-trend",
    "#customers-kpi-returning-trend",
  ].forEach((selector) => {
    const trend =
      container.querySelector(selector);

    if (!trend) return;

    trend.classList.remove(
      "up",
      "down",
    );

    trend.classList.add(
      "neutral",
    );

    const icon =
      trend.querySelector("i");

    const label =
      trend.querySelector("span");

    if (icon) {
      icon.className =
        "fa-solid fa-minus";
    }

    if (label) {
      label.textContent = "—";
    }
  });
}


async function loadCustomersPage(page = customerListState.page) {
  const view = document.querySelector("#customers-view");

  const container = document.querySelector("#customers-container");

  if (!view || !container) {
    console.error("Customers view or container was not found.");
    return;
  }

  if (getDashboardRoute().name !== "customers") return;

  customerListState.page = page;

  customerListAbortController?.abort();
  const listController = new AbortController();
  customerListAbortController = listController;
  const listRequestId = ++customerListRequestId;

  hideAllCustomerViews();
  customerDetailsAbortController?.abort();
  customerDetailsRequestId += 1;

  view.classList.remove("hidden");
  const tableBody = container.querySelector("#customers-table-body");
  tableBody?.replaceChildren(createCustomerListMessage("Loading customers..."));

  try {
    if (container.dataset.loaded !== "true" || !container.innerHTML.trim()) {
      const response = await fetch("/pages/customers.html", {
        signal: listController.signal,
      });

      if (!response.ok) {
        throw new Error(`Unable to load Customers page: ${response.status}`);
      }

      const markup = await response.text();
      if (
        listController.signal.aborted ||
        listRequestId !== customerListRequestId ||
        getDashboardRoute().name !== "customers"
      ) {
        return;
      }
      container.innerHTML = markup;

      container.dataset.loaded = "true";
    }

    bindCustomerListControls(container);

    if (window.PARKIN_CONFIG?.customerDataMode === "demo") {
      await hydrateDemoCustomerRows(container);
      if (
        listController.signal.aborted ||
        listRequestId !== customerListRequestId ||
        getDashboardRoute().name !== "customers"
      ) {
        return;
      }
      bindCustomerActions();
      bindCustomerTableSelection();
      bindCustomerActionMenus();
      window.applyDashboardPermissionVisibility?.(container);
      initCustomerTrendCharts();
      return;
    }

    const query = new URLSearchParams({
      page: String(customerListState.page),
      limit: String(customerListState.limit),
      sort: customerListState.sort,
    });
    if (customerListState.search) query.set("search", customerListState.search);
    if (customerListState.status) query.set("status", customerListState.status);
    if (customerListState.customerType) {
      query.set("customerType", customerListState.customerType);
    }

    if (customerListState.createdSource) {
      query.set(
        "createdSource",
        customerListState.createdSource,
      );
    }

    const response = await fetch(
      `${getCustomerManagementApiBaseUrl()}/customers?${query.toString()}`,
      {
        headers: getCustomerManagementAuthHeaders(),
        signal: listController.signal,
      },
    );
    const body = await response.json().catch(() => null);
    if (!response.ok) {
      const error = new Error("Unable to load customers.");
      error.status = response.status;
      throw error;
    }
    const result = body?.data || body;

    if (
      listController.signal.aborted ||
      listRequestId !== customerListRequestId ||
      getDashboardRoute().name !== "customers"
    ) {
      return;
    }

    let statistics = null;

    try {
      statistics =
        await fetchCustomerStatistics(
          listController.signal,
        );
    } catch (statisticsError) {
      if (
        statisticsError?.name ===
        "AbortError"
      ) {
        throw statisticsError;
      }

      console.error(
        "Unable to load customer statistics:",
        statisticsError,
      );
    }

    if (
      listController.signal.aborted ||
      listRequestId !== customerListRequestId ||
      getDashboardRoute().name !== "customers"
    ) {
      return;
    }

    renderCustomerList(
      container,
      result?.customers || [],
      result?.pagination,
    );

    if (statistics) {
      renderCustomerStatistics(
        container,
        statistics,
      );
    } else {
      renderCustomerStatisticsUnavailable(
        container,
      );
    }
    bindCustomerActions();
    bindCustomerTableSelection();
    bindCustomerActionMenus();
    window.applyDashboardPermissionVisibility?.(container);

    setTimeout(() => {
      initCustomerTrendCharts(
        statistics,
      );
    }, 100);
  } catch (error) {
    if (
      error?.name === "AbortError" ||
      listRequestId !== customerListRequestId ||
      getDashboardRoute().name !== "customers"
    ) {
      return;
    }
    console.error("Unable to load Customers page:", error);
    customerListState.controlsBound = false;

    container.innerHTML = `
      <section class="page-load-error">
        <i class="fa-solid fa-triangle-exclamation"></i>
        <h2>Unable to load Customers</h2>
        <p>Please refresh the page and try again.</p>

        <button
          type="button"
          id="retry-customers-page"
          class="btn-primary"
        >
          Try Again
        </button>
      </section>
    `;

    container
      .querySelector("#retry-customers-page")
      ?.addEventListener("click", () => {
        container.dataset.loaded = "false";
        loadCustomersPage();
      });
  }
}

function createCustomerListMessage(message) {
  const state = document.createElement("div");
  state.className = "customers-loading-state";
  state.textContent = message;
  return state;
}

function createCustomerText(tagName, value, className = "") {
  const element = document.createElement(tagName);
  if (className) element.className = className;
  element.textContent = value || "-";
  return element;
}

function formatCustomerType(value) {
  return String(value || "-")
    .toLowerCase()
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatCustomerStatus(value) {
  return String(value || "-")
    .toLowerCase()
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function createCustomerRow(customer) {
  const row = document.createElement("div");
  row.className = "customers-row";
  row.dataset.customerId = customer.id;

  const checkboxCell = document.createElement("span");
  checkboxCell.className = "customer-checkbox";
  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.className = "customer-row-checkbox";
  checkbox.setAttribute(
    "aria-label",
    `Select ${customer.fullName || "customer"}`,
  );
  checkboxCell.append(checkbox);

  const profile = document.createElement("span");
  profile.className = "customer-profile";
  const initials = createCustomerText(
    "span",
    String(customer.fullName || "C")
      .split(/\s+/)
      .map((part) => part[0])
      .join("")
      .slice(0, 2)
      .toUpperCase(),
    "customer-profile-placeholder",
  );
  const name = document.createElement("b");
  name.append(createCustomerText("span", customer.fullName, "customer-name"));
  profile.append(initials, name);

  const contact = document.createElement("span");
  contact.className = "customer-contact";
  contact.append(
    createCustomerText(
      "span",
      customer.phoneNumber
        ? `${customer.phoneCountryCode || "+966"} ${customer.phoneNumber}`
        : "-",
      "customer-contact-line",
    ),
    createCustomerText("span", customer.email || "-", "customer-contact-line"),
  );

  const type = document.createElement("span");
  type.append(
    createCustomerText(
      "em",
      formatCustomerType(customer.customerType),
      "customer-type",
    ),
  );
  const vehicles = createCustomerText(
    "span",
    String(customer.vehicleCount ?? 0),
    "customer-vehicles",
  );
  const status = document.createElement("span");
  const statusBadge = createCustomerText(
    "strong",
    formatCustomerStatus(customer.status),
    "customer-status",
  );
  statusBadge.classList.add(String(customer.status || "").toLowerCase());
  status.append(statusBadge);

  const actions = document.createElement("span");
  actions.className = "customer-actions-cell";
  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "customer-more-btn";
  toggle.dataset.customerId = customer.id;
  toggle.setAttribute(
    "aria-label",
    `Open actions for ${customer.fullName || "customer"}`,
  );
  toggle.setAttribute("aria-expanded", "false");
  toggle.textContent = "...";
  const menu = document.createElement("div");
  menu.className = "customer-actions-menu hidden";
  [
    ["view", "View Customer", ""],
    ["edit", "Edit Customer", "customers.edit"],
    ["vehicle", "Add Vehicle", "vehicles.create"],
  ].forEach(([action, label, permission]) => {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.customerAction = action;
    button.dataset.customerId = customer.id;
    if (permission) button.dataset.requiredPermission = permission;
    button.textContent = label;
    menu.append(button);
  });
  actions.append(toggle, menu);

  row.append(checkboxCell, profile, contact, type, vehicles, status, actions);
  return row;
}

function renderCustomerPagination(container, page, totalPages) {
  const controls = container.querySelector("#customers-pagination-controls");
  if (!controls) return;
  controls.replaceChildren();
  if (totalPages <= 1) return;

  const addButton = (label, targetPage, disabled, active = false) => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = label;
    button.disabled = disabled;
    button.classList.toggle("active", active);
    button.addEventListener("click", () => loadCustomersPage(targetPage));
    controls.append(button);
  };
  addButton("Previous", page - 1, page <= 1);
  for (let current = 1; current <= totalPages; current += 1) {
    if (
      current <= 3 ||
      current === totalPages ||
      Math.abs(current - page) <= 1
    ) {
      addButton(String(current), current, false, current === page);
    }
  }
  addButton("Next", page + 1, page >= totalPages);
}

function hasCustomerListFilters() {
  return Boolean(
    customerListState.search ||
      customerListState.status ||
      customerListState.customerType ||
      customerListState.createdSource,
  );
}

function clearCustomerListFilters(container) {
  customerListState.search = "";
  customerListState.status = "";
  customerListState.customerType = "";
  customerListState.createdSource = "";
  customerListState.page = 1;

  const search = container.querySelector(
    "#customers-search, .customers-search input",
  );
  if (search) search.value = "";

  [
    "#customers-status-filter, .customers-table-controls select[aria-label*='status' i]",
    "#customers-type-filter, .customers-table-controls select[aria-label*='type' i]",
  ].forEach((selector) => {
    const select = container.querySelector(selector);
    if (!select) return;
    const allOption = [...select.options].find(
      (option) =>
        !option.value || /^all(?:\s|$)/i.test(option.value),
    );
    if (allOption) select.value = allOption.value;
    else select.selectedIndex = 0;
  });

  const mobileToggle = container.querySelector("#customers-mobile-toggle");
  const allToggle = container.querySelector("#customers-all-toggle");
  mobileToggle?.classList.remove("active");
  mobileToggle?.setAttribute("aria-pressed", "false");
  allToggle?.classList.add("active");
  allToggle?.setAttribute("aria-pressed", "true");

  loadCustomersPage(1);
}

function createCustomerEmptyState(container) {
  const filtered = hasCustomerListFilters();
  const state = document.createElement("section");
  state.className = "customer-empty-state";
  state.setAttribute("role", "status");
  state.setAttribute("aria-live", "polite");

  const illustration = document.createElement("img");
  illustration.className = "customer-empty-illustration";
  illustration.src = "/assets/illustrations/customers-empty.png";
  illustration.alt = "";
  illustration.loading = "lazy";
  illustration.decoding = "async";

  const heading = document.createElement("h3");
  heading.className = "customer-empty-title";
  heading.textContent = "No Customers Found";

  const description = document.createElement("p");
  description.className = "customer-empty-description";
  description.textContent = filtered
    ? "We couldn’t find any customers matching your selected filters. Try adjusting your search criteria or clear the filters to see results."
    : "There are no customers available for your account yet. Customers added or associated with your company will appear here.";

  state.append(illustration, heading, description);

  if (filtered) {
    const clearButton = document.createElement("button");
    clearButton.type = "button";
    clearButton.className = "customer-empty-action";
    clearButton.textContent = "Clear Filters";
    clearButton.addEventListener("click", () => {
      clearCustomerListFilters(container);
    });
    state.append(clearButton);
  }

  return state;
}

function ensureCustomerEmptyStyles() {
  if (document.querySelector('link[data-customer-empty-css]')) return;
  const stylesheet = document.createElement("link");
  stylesheet.rel = "stylesheet";
  stylesheet.href = "/css/customers-empty.css";
  stylesheet.dataset.customerEmptyCss = "true";
  document.head.append(stylesheet);
}

function renderCustomerList(container, customers, pagination) {
  const table = container.querySelector(".customers-table-scroll");
  if (!table) return;

  ensureCustomerEmptyStyles();
  table
    .querySelectorAll(
      ".customers-row:not(.customers-head), .customers-loading-state, .customer-empty-state",
    )
    .forEach((element) => element.remove());

  const isEmpty = customers.length === 0;
  table.classList.toggle("customers-table-empty", isEmpty);
  const selectAll = container.querySelector("#select-all-customers");
  if (selectAll) {
    selectAll.checked = false;
    selectAll.indeterminate = false;
    selectAll.disabled = isEmpty;
  }

  if (!isEmpty) {
    customers.forEach((customer) => {
      table.append(createCustomerRow(customer));
    });
  } else {
    table.append(createCustomerEmptyState(container));
  }

  const total = Number(pagination?.total || 0);
  const page = Number(pagination?.page || customerListState.page);
  const limit = Number(pagination?.limit || customerListState.limit);
  const totalPages = Number(pagination?.totalPages || 0);
  const start = total ? (page - 1) * limit + 1 : 0;
  const end = total ? Math.min(page * limit, total) : 0;
  container
    .querySelector("#customers-total-count")
    ?.replaceChildren(String(total));
  container
    .querySelector("#customers-result-count")
    ?.replaceChildren(`${total} customer${total === 1 ? "" : "s"} found`);
  container
    .querySelector("#customers-pagination-label")
    ?.replaceChildren(
      total ? `Showing ${start}-${end} of ${total} customers` : "",
    );
  renderCustomerPagination(container, page, totalPages);
}

function bindCustomerListControls(container) {
  if (customerListState.controlsBound) return;
  customerListState.controlsBound = true;
  let searchTimer;
  const searchInput = container.querySelector(
    "#customers-search, .customers-search input",
  );
  const statusFilter = container.querySelector(
    "#customers-status-filter, .customers-table-controls select[aria-label*='status' i]",
  );
  const typeFilter = container.querySelector(
    "#customers-type-filter, .customers-table-controls select[aria-label*='type' i]",
  );
  const sortFilter = container.querySelector(
    "#customers-sort, .customers-table-controls select[aria-label*='sort' i]",
  );

  const mobileToggle =
    container.querySelector(
      "#customers-mobile-toggle",
    );

  const allToggle =
    container.querySelector(
      "#customers-all-toggle",
    );

  const filterToggle =
    container.querySelector(
      "#customers-filter-toggle",
    );

  const filterPanel =
    container.querySelector(
      "#customers-filter-panel",
    );

  const updateCustomerSourceToggle = () => {
    const mobileActive =
      customerListState.createdSource ===
      "MOBILE";

    mobileToggle?.classList.toggle(
      "active",
      mobileActive,
    );

    allToggle?.classList.toggle(
      "active",
      !mobileActive,
    );

    mobileToggle?.setAttribute(
      "aria-pressed",
      String(mobileActive),
    );

    allToggle?.setAttribute(
      "aria-pressed",
      String(!mobileActive),
    );
  };

  mobileToggle?.addEventListener(
    "click",
    () => {
      if (
        customerListState.createdSource ===
        "MOBILE"
      ) {
        return;
      }

      customerListState.createdSource =
        "MOBILE";

      customerListState.page = 1;

      updateCustomerSourceToggle();

      loadCustomersPage(1);
    },
  );

  allToggle?.addEventListener(
    "click",
    () => {
      if (
        customerListState.createdSource ===
        ""
      ) {
        return;
      }

      customerListState.createdSource = "";
      customerListState.page = 1;

      updateCustomerSourceToggle();

      loadCustomersPage(1);
    },
  );

  filterToggle?.addEventListener(
    "click",
    () => {
      if (!filterPanel) return;

      const open =
        !filterPanel.classList.contains(
          "customer-filter-open",
        );

      filterPanel.classList.toggle(
        "customer-filter-open",
        open,
      );

      filterToggle.setAttribute(
        "aria-expanded",
        String(open),
      );

      if (open) {
        filterPanel.scrollIntoView({
          behavior: "smooth",
          block: "nearest",
        });
      }
    },
  );

  updateCustomerSourceToggle();
  searchInput?.addEventListener("input", (event) => {
    customerListState.search = event.target.value.trim();
    customerListState.page = 1;
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      if (window.PARKIN_CONFIG?.customerDataMode === "demo") {
        filterDemoCustomerRows(container);
      } else {
        loadCustomersPage(1);
      }
    }, 350);
  });
  statusFilter?.addEventListener("change", (event) => {
    customerListState.status = event.target.value;
    if (window.PARKIN_CONFIG?.customerDataMode === "demo") {
      filterDemoCustomerRows(container);
    } else {
      loadCustomersPage(1);
    }
  });
  typeFilter?.addEventListener("change", (event) => {
    customerListState.customerType = event.target.value;
    if (window.PARKIN_CONFIG?.customerDataMode === "demo") {
      filterDemoCustomerRows(container);
    } else {
      loadCustomersPage(1);
    }
  });
  sortFilter?.addEventListener("change", (event) => {
    customerListState.sort = event.target.value;
    loadCustomersPage(1);
  });
}

function bindCustomerActions() {
  const addButton = document.querySelector(".customer-add-btn");
  if (!addButton || addButton.dataset.bound === "true") return;
  addButton.dataset.bound = "true";
  addButton.addEventListener("click", () => {
    if (!window.hasDashboardPermission?.("customers.create")) return;
    window.location.hash = "add-customer";
  });
}

function bindCustomerTableSelection() {
  const selectAll = document.querySelector("#select-all-customers");
  if (!selectAll) return;

  if (selectAll.dataset.bound !== "true") {
    selectAll.dataset.bound = "true";
    selectAll.addEventListener("change", () => {
      document.querySelectorAll(".customer-row-checkbox").forEach((checkbox) => {
        checkbox.checked = selectAll.checked;
      });
      selectAll.indeterminate = false;
    });
  }

  document.querySelectorAll(".customer-row-checkbox").forEach((checkbox) => {
    if (checkbox.dataset.bound === "true") return;
    checkbox.dataset.bound = "true";
    checkbox.addEventListener("change", () => {
      const rows = [...document.querySelectorAll(".customer-row-checkbox")];
      const selectedCount = rows.filter((item) => item.checked).length;
      selectAll.checked = rows.length > 0 && selectedCount === rows.length;
      selectAll.indeterminate =
        selectedCount > 0 && selectedCount < rows.length;
    });
  });
}

function bindCustomerActionMenus() {
  const page = document.querySelector(".customers-page");
  if (!page || page.dataset.actionMenusBound === "true") return;
  page.dataset.actionMenusBound = "true";

  page.addEventListener("click", (event) => {
    const target =
      event.target instanceof Element
        ? event.target
        : event.target.parentElement;
    const toggle = target?.closest(".customer-more-btn");
    const actionButton = target?.closest("[data-customer-action]");

    if (toggle) {
      event.preventDefault();
      event.stopPropagation();
      const cell = toggle.closest(".customer-actions-cell");
      const menu = cell?.querySelector(".customer-actions-menu");
      if (!menu) return;

      const shouldOpen = menu.classList.contains("hidden");
      closeCustomerActionMenus();
      if (shouldOpen) {
        const rect = toggle.getBoundingClientRect();
        const menuWidth = 230;
        const pagePadding = 12;
        const left = Math.max(
          pagePadding,
          Math.min(
            rect.right - menuWidth,
            window.innerWidth - menuWidth - pagePadding,
          ),
        );
        menu.style.top = `${rect.bottom + 8}px`;
        menu.style.left = `${left}px`;
      }
      menu.classList.toggle("hidden", !shouldOpen);
      toggle.setAttribute("aria-expanded", String(shouldOpen));
      return;
    }

    if (!actionButton) return;
    event.preventDefault();
    event.stopPropagation();

    const customerId =
      actionButton.dataset.customerId ||
      actionButton.closest(".customers-row")?.dataset.customerId ||
      actionButton
        .closest(".customer-actions-cell")
        ?.querySelector(".customer-more-btn")?.dataset.customerId;

    const action = actionButton.dataset.customerAction;
    closeCustomerActionMenus();
    if (!customerId) {
      window.showDashboardAlert?.(
        "Customer ID is unavailable for this action.",
        {
          title: "Customer action unavailable",
          type: "error",
        },
      );
      return;
    }

    if (
      action === "view" &&
      window.hasDashboardPermission?.("customers.view")
    ) {
      window.location.hash = `customer-details?id=${encodeURIComponent(customerId)}`;
    } else if (
      action === "edit" &&
      window.hasDashboardPermission?.("customers.edit")
    ) {
      navigateToCustomerEdit(customerId, "#customers");
    } else if (
      action === "vehicle" &&
      window.hasDashboardPermission?.("vehicles.create")
    ) {
      window.location.hash = `customer-add-vehicle?id=${encodeURIComponent(customerId)}`;
    } else if (
      action === "bookings" &&
      window.hasDashboardPermission?.("bookings.view")
    ) {
      window.location.hash = `customer-details?id=${encodeURIComponent(customerId)}&tab=bookings`;
    }
  });

  if (document.body.dataset.customerMenuBound !== "true") {
    document.body.dataset.customerMenuBound = "true";
    document.addEventListener("click", (event) => {
      if (event.target.closest(".customers-page")) return;
      closeCustomerActionMenus();
    });
    window.addEventListener("resize", closeCustomerActionMenus);
    window.addEventListener("scroll", closeCustomerActionMenus, true);
  }
}

function closeCustomerActionMenus() {
  document.querySelectorAll(".customer-actions-menu").forEach((menu) => {
    menu.classList.add("hidden");
  });

  document.querySelectorAll(".customer-more-btn").forEach((button) => {
    button.setAttribute("aria-expanded", "false");
  });
}

function createCustomerTrendChart(canvasId, data, color) {
  const canvas = document.querySelector(canvasId);

  if (!canvas || typeof Chart === "undefined") {
    return null;
  }

  return new Chart(canvas, {
    type: "line",
    data: {
      labels: data.map((_, index) => index + 1),
      datasets: [
        {
          data,
          borderColor: color,
          backgroundColor: "transparent",
          borderWidth: 2,
          pointRadius: 0,
          pointHoverRadius: 3,
          tension: 0.35,
          fill: false,
        },
      ],
    },
    options: {
      responsive: false,
      maintainAspectRatio: false,
      animation: {
        duration: 800,
      },
      plugins: {
        legend: {
          display: false,
        },
        tooltip: {
          enabled: false,
        },
      },
      scales: {
        x: {
          display: false,
        },
        y: {
          display: false,
          beginAtZero: false,
        },
      },
      elements: {
        line: {
          borderCapStyle: "round",
          borderJoinStyle: "round",
        },
      },
    },
  });
}

const addCustomerCompanyState = {
  companies: [],

  mobileLookup: {
    key: "",
    result: null,
    checking: false,
  },
};


function formatAddCustomerOperationalService(service) {
  const labels = {
    VALET_PARKING: "Valet Parking",
    EVENT_MANAGEMENT: "Event Management",
    RENTAL_PARKING: "Rental Parking",
  };

  return labels[service] || "No Operational Service";
}


async function fetchAddCustomerCompanyOptions() {
  const response = await fetch(
    `${getCustomerVehicleApiBaseUrl()}/companies/options`,
    {
      headers: getCustomerManagementAuthHeaders(),
    },
  );

  const body =
    await response.json().catch(() => null);

  if (!response.ok) {
    const message =
      Array.isArray(body?.message)
        ? body.message.join(" ")
        : body?.message ||
          body?.error ||
          "Unable to load company options.";

    throw new Error(message);
  }

  const data = body?.data ?? body;

  const companies =
    Array.isArray(data)
      ? data
      : Array.isArray(data?.companies)
        ? data.companies
        : Array.isArray(data?.items)
          ? data.items
          : Array.isArray(data?.options)
            ? data.options
            : [];

  return companies
    .filter(
      (company) =>
        company &&
        company.id &&
        company.name,
    )
    .sort((first, second) =>
      String(first.name).localeCompare(
        String(second.name),
      ),
    );
}


function getSelectedAddCustomerCompany() {
  const select =
    document.querySelector(
      "#customer-company-id",
    );

  const companyId =
    select?.value || "";

  return (
    addCustomerCompanyState.companies.find(
      (company) =>
        String(company.id) ===
        String(companyId),
    ) || null
  );
}


function setAddCustomerCompanyAlert(
  message = "",
  type = "info",
) {
  const alert =
    document.querySelector(
      "#customer-company-context-alert",
    );

  if (!alert) return;

  alert.textContent = message;

  alert.classList.toggle(
    "hidden",
    !message,
  );

  alert.classList.toggle(
    "error",
    type === "error",
  );
}


function updateAddCustomerCompanyContext() {
  const company =
    getSelectedAddCustomerCompany();

  const serviceInput =
    document.querySelector(
      "#customer-operational-service",
    );

  const serviceHelp =
    document.querySelector(
      "#customer-operational-service-help",
    );

  const summaryCompany =
    document.querySelector(
      "#summary-customer-company",
    );

  const summaryService =
    document.querySelector(
      "#summary-customer-service",
    );

  const serviceLabel =
    formatAddCustomerOperationalService(
      company?.operationalService,
    );

  if (serviceInput) {
    serviceInput.value =
      company
        ? serviceLabel
        : "No Operational Service";
  }

  if (summaryCompany) {
    summaryCompany.textContent =
      company?.name || "Not selected";
  }

  if (summaryService) {
    summaryService.textContent =
      company
        ? serviceLabel
        : "No Operational Service";
  }

  if (serviceHelp) {
    if (!company) {
      serviceHelp.textContent =
        "Select a company to determine operational service access.";
    } else if (company.operationalService) {
      serviceHelp.textContent =
        "Operational service is derived automatically from the selected company.";
    } else {
      serviceHelp.textContent =
        "This company has no restricted operational service.";
    }
  }

  updateAddCustomerMobileLookupVisibility();
}


function getAddCustomerPhoneValue() {
  return (
    document
      .querySelector("#customer-phone")
      ?.value.trim() || ""
  );
}


function getAddCustomerMobileLookupKey() {
  const company =
    getSelectedAddCustomerCompany();

  const phone =
    getAddCustomerPhoneValue()
      .replace(/[^\d]/g, "");

  if (!company?.id || !phone) {
    return "";
  }

  return `${company.id}:${phone}`;
}


function canCurrentUserCreateAddCustomer() {
  const currentUser =
    window.getParkinCurrentUser?.() ||
    null;

  const company =
    getSelectedAddCustomerCompany();

  if (!currentUser || !company) {
    return false;
  }

  if (
    currentUser.role === "SUPER_ADMIN" &&
    currentUser.accessScope === "GLOBAL"
  ) {
    return true;
  }

  if (
    currentUser.accessScope === "COMPANY" &&
    currentUser.companyId &&
    String(currentUser.companyId) ===
      String(company.id)
  ) {
    return true;
  }

  return false;
}


function restoreAddCustomerCreateButton() {
  const submitButton =
    document.querySelector(
      ".add-customer-submit",
    );

  if (!submitButton) return;

  submitButton.disabled =
    !canCurrentUserCreateAddCustomer();
}


function setAddCustomerMobileLookupStatus(
  message = "",
  type = "info",
) {
  const status =
    document.querySelector(
      "#customer-mobile-lookup-status",
    );

  if (!status) return;

  status.textContent = message;

  status.classList.toggle(
    "hidden",
    !message,
  );

  status.classList.remove(
    "success",
    "warning",
    "error",
  );

  if (
    message &&
    ["success", "warning", "error"].includes(
      type,
    )
  ) {
    status.classList.add(type);
  }
}


function resetAddCustomerMobileLookup() {
  addCustomerCompanyState.mobileLookup.key =
    "";

  addCustomerCompanyState.mobileLookup.result =
    null;

  addCustomerCompanyState.mobileLookup.checking =
    false;

  const associationCard =
    document.querySelector(
      "#customer-mobile-association-card",
    );

  associationCard?.classList.add(
    "hidden",
  );

  setAddCustomerMobileLookupStatus("");

  const confirmButton =
    document.querySelector(
      "#customer-mobile-confirm-association",
    );

  if (confirmButton) {
    confirmButton.disabled = false;

    confirmButton.innerHTML =
      '<i class="fa-solid fa-link"></i> Confirm Association';
  }

  const lookupButton =
    document.querySelector(
      "#customer-mobile-lookup-button",
    );

  if (lookupButton) {
    lookupButton.disabled = false;

    lookupButton.innerHTML =
      '<i class="fa-solid fa-magnifying-glass"></i> Check Mobile Customer';
  }

  restoreAddCustomerCreateButton();
}


function updateAddCustomerMobileLookupVisibility() {
  const panel =
    document.querySelector(
      "#customer-mobile-lookup-panel",
    );

  if (!panel) return;

  const company =
    getSelectedAddCustomerCompany();

  const enabled =
    Boolean(company?.operationalService);

  panel.classList.toggle(
    "hidden",
    !enabled,
  );

  if (!enabled) {
    resetAddCustomerMobileLookup();
  }
}


function getAddCustomerAssociationReasonMessage(
  reason,
  targetCompany,
) {
  const companyName =
    targetCompany?.name ||
    "the selected company";

  const messages = {
    CUSTOMER_NOT_FOUND:
      "No existing ParkIn mobile customer was found for this phone number. You can continue creating a new customer.",

    CUSTOMER_UNAVAILABLE:
      "A customer record exists for this phone number, but it is unavailable. A duplicate customer cannot be created.",

    CUSTOMER_ALREADY_MANAGED:
      "This phone number already belongs to a Dashboard-managed customer. A duplicate customer cannot be created.",

    CUSTOMER_NOT_ACTIVE:
      "This mobile customer is not active and cannot be associated with an operational service.",

    ASSOCIATED_WITH_ANOTHER_OPERATIONAL_COMPANY:
      "This mobile customer is already associated with another operational company.",

    ALREADY_ASSOCIATED:
      `This mobile customer is already associated with ${companyName}.`,
  };

  return (
    messages[reason] ||
    "This customer cannot be associated with the selected operational company."
  );
}


function renderAddCustomerMobileAssociation(
  result,
) {
  const card =
    document.querySelector(
      "#customer-mobile-association-card",
    );

  const confirmButton =
    document.querySelector(
      "#customer-mobile-confirm-association",
    );

  const existing =
    result?.existingCustomer;

  if (!card || !existing) {
    card?.classList.add("hidden");
    return;
  }

  const targetCompany =
    result?.targetCompany ||
    getSelectedAddCustomerCompany();

  const service =
    formatAddCustomerOperationalService(
      targetCompany?.operationalService,
    );

  const setText = (
    selector,
    value,
  ) => {
    const element =
      document.querySelector(selector);

    if (element) {
      element.textContent =
        value || "—";
    }
  };

  setText(
    "#customer-mobile-existing-name",
    existing.fullName,
  );

  setText(
    "#customer-mobile-existing-phone",
    existing.phoneE164,
  );

  setText(
    "#customer-mobile-existing-status",
    existing.status,
  );

  setText(
    "#customer-mobile-target-company",
    targetCompany?.name,
  );

  setText(
    "#customer-mobile-target-service",
    service,
  );

  card.classList.remove("hidden");

  if (confirmButton) {
    confirmButton.disabled =
      !result.eligibleForAssociation;
  }
}


async function lookupAddCustomerMobileCustomer() {
  const company =
    getSelectedAddCustomerCompany();

  const phone =
    getAddCustomerPhoneValue();

  const lookupButton =
    document.querySelector(
      "#customer-mobile-lookup-button",
    );

  const submitButton =
    document.querySelector(
      ".add-customer-submit",
    );

  if (!company?.operationalService) {
    resetAddCustomerMobileLookup();

    return {
      exists: false,
      operationalLookupRequired: false,
    };
  }

  if (!phone) {
    setAddCustomerMobileLookupStatus(
      "Enter the customer's mobile number before checking for an existing ParkIn account.",
      "warning",
    );

    document
      .querySelector("#customer-phone")
      ?.focus();

    return null;
  }

  const key =
    getAddCustomerMobileLookupKey();

  if (!key) {
    setAddCustomerMobileLookupStatus(
      "Enter a valid mobile number before checking.",
      "warning",
    );

    return null;
  }

  addCustomerCompanyState.mobileLookup.checking =
    true;

  if (lookupButton) {
    lookupButton.disabled = true;

    lookupButton.innerHTML =
      '<i class="fa-solid fa-spinner fa-spin"></i> Checking...';
  }

  if (submitButton) {
    submitButton.disabled = true;
  }

  setAddCustomerMobileLookupStatus(
    "Checking ParkIn mobile customer records...",
  );

  document
    .querySelector(
      "#customer-mobile-association-card",
    )
    ?.classList.add("hidden");

  try {
    const response = await fetch(
      `${getCustomerManagementApiBaseUrl()}/customers/operational-association/lookup`,
      {
        method: "POST",
        headers:
          getCustomerManagementAuthHeaders(),
        body: JSON.stringify({
          phoneCountryCode: "+966",
          phoneNumber: phone,
          companyId: String(company.id),
        }),
      },
    );

    const body =
      await response.json().catch(
        () => null,
      );

    if (!response.ok) {
      const message =
        Array.isArray(body?.message)
          ? body.message.join(" ")
          : body?.message ||
            body?.error ||
            "Unable to check mobile customer.";

      throw new Error(message);
    }

    const result =
      body?.data ?? body;

    addCustomerCompanyState.mobileLookup.key =
      key;

    addCustomerCompanyState.mobileLookup.result =
      result;

    if (!result?.exists) {
      setAddCustomerMobileLookupStatus(
        getAddCustomerAssociationReasonMessage(
          result?.reason ||
            "CUSTOMER_NOT_FOUND",
          result?.targetCompany,
        ),
        "success",
      );

      restoreAddCustomerCreateButton();

      return result;
    }

    renderAddCustomerMobileAssociation(
      result,
    );

    if (result.eligibleForAssociation) {
      setAddCustomerMobileLookupStatus(
        "An existing active ParkIn mobile customer was found. Confirm the association instead of creating a duplicate customer.",
        "success",
      );
    } else {
      setAddCustomerMobileLookupStatus(
        getAddCustomerAssociationReasonMessage(
          result.reason,
          result.targetCompany,
        ),
        result.reason ===
          "ALREADY_ASSOCIATED"
          ? "warning"
          : "error",
      );
    }

    /*
     * Any existing customer blocks the normal
     * Create Customer path.
     */
    if (submitButton) {
      submitButton.disabled = true;
    }

    return result;
  } catch (error) {
    console.error(
      "Unable to check mobile customer:",
      error,
    );

    addCustomerCompanyState.mobileLookup.key =
      "";

    addCustomerCompanyState.mobileLookup.result =
      null;

    setAddCustomerMobileLookupStatus(
      error?.message ||
        "Unable to check mobile customer.",
      "error",
    );

    /*
     * Fail closed. Do not create an operational
     * customer while duplicate detection is unavailable.
     */
    if (submitButton) {
      submitButton.disabled = true;
    }

    throw error;
  } finally {
    addCustomerCompanyState.mobileLookup.checking =
      false;

    if (lookupButton) {
      lookupButton.disabled = false;

      lookupButton.innerHTML =
        '<i class="fa-solid fa-magnifying-glass"></i> Check Mobile Customer';
    }
  }
}


async function associateExistingAddCustomerMobileCustomer() {
  const state =
    addCustomerCompanyState.mobileLookup;

  const result =
    state.result;

  const company =
    getSelectedAddCustomerCompany();

  const phone =
    getAddCustomerPhoneValue();

  const confirmButton =
    document.querySelector(
      "#customer-mobile-confirm-association",
    );

  const submitButton =
    document.querySelector(
      ".add-customer-submit",
    );

  const existingCustomer =
    result?.existingCustomer;

  if (
    !result?.eligibleForAssociation ||
    !existingCustomer?.id ||
    !company?.id
  ) {
    setAddCustomerMobileLookupStatus(
      "Run the mobile customer check again before confirming the association.",
      "warning",
    );

    return;
  }

  if (
    state.key !==
    getAddCustomerMobileLookupKey()
  ) {
    resetAddCustomerMobileLookup();

    setAddCustomerMobileLookupStatus(
      "The company or mobile number changed. Check the mobile customer again.",
      "warning",
    );

    return;
  }

  if (confirmButton) {
    confirmButton.disabled = true;

    confirmButton.innerHTML =
      '<i class="fa-solid fa-spinner fa-spin"></i> Associating...';
  }

  if (submitButton) {
    submitButton.disabled = true;
  }

  try {
    const response = await fetch(
      `${getCustomerManagementApiBaseUrl()}/customers/operational-association`,
      {
        method: "POST",
        headers:
          getCustomerManagementAuthHeaders(),
        body: JSON.stringify({
          phoneCountryCode: "+966",
          phoneNumber: phone,
          companyId: String(company.id),
        }),
      },
    );

    const body =
      await response.json().catch(
        () => null,
      );

    if (!response.ok) {
      const message =
        Array.isArray(body?.message)
          ? body.message.join(" ")
          : body?.message?.message ||
            body?.message ||
            body?.error ||
            "Unable to associate mobile customer.";

      throw new Error(message);
    }

    setAddCustomerMobileLookupStatus(
      "Mobile customer associated successfully.",
      "success",
    );

    customerListState.page = 1;

    window.showDashboardAlert?.(
      `${existingCustomer.fullName || "Mobile customer"} is now associated with ${company.name}.`,
      {
        title: "Customer associated",
        type: "success",
      },
    );

    window.location.hash =
      `customer-details?id=${encodeURIComponent(existingCustomer.id)}`;
  } catch (error) {
    console.error(
      "Unable to associate mobile customer:",
      error,
    );

    setAddCustomerMobileLookupStatus(
      error?.message ||
        "Unable to associate mobile customer.",
      "error",
    );

    if (confirmButton) {
      confirmButton.disabled = false;

      confirmButton.innerHTML =
        '<i class="fa-solid fa-link"></i> Confirm Association';
    }
  }
}


async function initializeAddCustomerCompanyContext() {
  const select =
    document.querySelector(
      "#customer-company-id",
    );

  const selectField =
    document.querySelector(
      "#customer-company-select-field",
    );

  const fixedField =
    document.querySelector(
      "#customer-company-fixed-field",
    );

  const fixedInput =
    document.querySelector(
      "#customer-company-fixed",
    );

  const submitButton =
    document.querySelector(
      ".add-customer-submit",
    );

  if (
    !select ||
    !selectField ||
    !fixedField ||
    !fixedInput
  ) {
    return;
  }

  setAddCustomerCompanyAlert("");

  select.disabled = true;

  select.replaceChildren(
    new Option(
      "Loading companies...",
      "",
    ),
  );

  if (submitButton) {
    submitButton.disabled = true;
  }

  try {
    const companies =
      await fetchAddCustomerCompanyOptions();

    addCustomerCompanyState.companies =
      companies;

    const currentUser =
      window.getParkinCurrentUser?.() ||
      null;

    const role =
      currentUser?.role || "";

    const accessScope =
      currentUser?.accessScope || "";

    const requesterCompanyId =
      currentUser?.companyId
        ? String(currentUser.companyId)
        : "";

    const isSuperAdminGlobal =
      role === "SUPER_ADMIN" &&
      accessScope === "GLOBAL";

    const isCompanyScoped =
      accessScope === "COMPANY" &&
      Boolean(requesterCompanyId);


    // ========================================================
    // SUPER ADMIN / GLOBAL
    // May select any active company.
    // ========================================================

    if (isSuperAdminGlobal) {
      selectField.classList.remove(
        "hidden",
      );

      fixedField.classList.add(
        "hidden",
      );

      select.replaceChildren(
        new Option(
          "Select company",
          "",
        ),
      );

      companies.forEach((company) => {
        const label =
          company.code
            ? `${company.name} (${company.code})`
            : company.name;

        select.add(
          new Option(
            label,
            String(company.id),
          ),
        );
      });

      select.disabled =
        companies.length === 0;

      select.required = true;
      select.value = "";
      fixedInput.value = "";

      if (!companies.length) {
        setAddCustomerCompanyAlert(
          "No active company is available. Create or activate a company before adding a customer.",
          "error",
        );
      }

      if (submitButton) {
        submitButton.disabled =
          companies.length === 0;
      }
    }


    // ========================================================
    // COMPANY SCOPE
    // Must use the exact company assigned to the
    // authenticated dashboard account.
    // ========================================================

    else if (isCompanyScoped) {
      selectField.classList.add(
        "hidden",
      );

      fixedField.classList.remove(
        "hidden",
      );

      select.required = false;
      select.replaceChildren();

      const company =
        companies.find(
          (item) =>
            String(item.id) ===
            requesterCompanyId,
        ) || null;

      if (company) {
        select.add(
          new Option(
            company.name,
            String(company.id),
          ),
        );

        select.value =
          String(company.id);

        fixedInput.value =
          company.code
            ? `${company.name} (${company.code})`
            : company.name;

        if (submitButton) {
          submitButton.disabled = false;
        }
      } else {
        select.add(
          new Option(
            "Assigned company unavailable",
            "",
          ),
        );

        select.value = "";

        fixedInput.value =
          "Assigned company unavailable";

        setAddCustomerCompanyAlert(
          "Your assigned company is not active or is unavailable. Contact a Super Admin before creating customers.",
          "error",
        );

        if (submitButton) {
          submitButton.disabled = true;
        }
      }
    }


    // ========================================================
    // UNSUPPORTED REQUESTER SCOPE
    // LOCATION / OWN / malformed access configuration.
    // Backend rejects customer creation for these scopes.
    // ========================================================

    else {
      selectField.classList.add(
        "hidden",
      );

      fixedField.classList.remove(
        "hidden",
      );

      select.required = false;
      select.replaceChildren(
        new Option(
          "Customer creation unavailable",
          "",
        ),
      );

      select.value = "";
      fixedInput.value =
        "Customer creation unavailable";

      setAddCustomerCompanyAlert(
        "Your current access scope does not allow customer creation. Contact a Super Admin if customer management access is required.",
        "error",
      );

      if (submitButton) {
        submitButton.disabled = true;
      }
    }

    updateAddCustomerCompanyContext();
  } catch (error) {
    console.error(
      "Unable to initialize customer company context:",
      error,
    );

    addCustomerCompanyState.companies =
      [];

    select.replaceChildren(
      new Option(
        "Unable to load companies",
        "",
      ),
    );

    select.disabled = true;

    fixedInput.value =
      "Company unavailable";

    updateAddCustomerCompanyContext();

    setAddCustomerCompanyAlert(
      error?.message ||
        "Unable to load company information.",
      "error",
    );

    if (submitButton) {
      submitButton.disabled = true;
    }
  }
}



/* Automatic suspension settings shared by Add and Edit Customer.
 * Browser local datetime inputs are converted to ISO UTC for the API.
 * Manual status (ACTIVE / INACTIVE / BLOCKED) is kept independent. */
function getCustomerSuspensionRoot(form) {
  return form?.querySelector('[data-customer-suspension]') || null;
}

function getCustomerSuspensionControl(root, field) {
  return root?.querySelector(`[data-suspension-field="${field}"]`) || null;
}

function suspensionLocalDatetime(iso) {
  if (!iso) return "";
  const value = new Date(iso);
  if (Number.isNaN(value.getTime())) return "";
  const pad = (number) => String(number).padStart(2, "0");
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}T${pad(value.getHours())}:${pad(value.getMinutes())}`;
}

function getCustomerSuspensionFormValues(form) {
  const root = getCustomerSuspensionRoot(form);
  if (!root || !getCustomerSuspensionControl(root, "enabled")?.checked) {
    return { enabled: false };
  }
  const type = getCustomerSuspensionControl(root, "type")?.value || "LIMITED";
  const startMode = getCustomerSuspensionControl(root, "startMode")?.value || "immediate";
  return {
    enabled: true,
    type,
    startMode,
    startsAt: startMode === "scheduled" ? getCustomerSuspensionControl(root, "startsAt")?.value || "" : "",
    endsAt: type === "LIMITED" ? getCustomerSuspensionControl(root, "endsAt")?.value || "" : "",
    reason: getCustomerSuspensionControl(root, "reason")?.value.trim() || "",
  };
}

function updateCustomerSuspensionControls(root) {
  if (!root) return;
  const enabled = Boolean(getCustomerSuspensionControl(root, "enabled")?.checked);
  const type = getCustomerSuspensionControl(root, "type")?.value || "LIMITED";
  const startMode = getCustomerSuspensionControl(root, "startMode")?.value || "immediate";
  const startsAt = getCustomerSuspensionControl(root, "startsAt");
  const endsAt = getCustomerSuspensionControl(root, "endsAt");
  const options = root.querySelector('[data-suspension-options]');
  const startGroup = root.querySelector('[data-suspension-start]');
  const endGroup = root.querySelector('[data-suspension-end]');
  if (options) options.hidden = !enabled;
  if (startGroup) startGroup.hidden = !enabled || startMode !== "scheduled";
  if (endGroup) endGroup.hidden = !enabled || type !== "LIMITED";

  for (const field of ["type", "startMode", "reason"]) {
    const control = getCustomerSuspensionControl(root, field);
    if (control) control.disabled = !enabled;
  }
  if (startsAt) {
    startsAt.disabled = !enabled || startMode !== "scheduled";
    startsAt.required = enabled && startMode === "scheduled";
  }
  if (endsAt) {
    endsAt.disabled = !enabled || type !== "LIMITED";
    endsAt.required = enabled && type === "LIMITED";
  }

  let state = "NOT_SCHEDULED";
  if (enabled) {
    const start = startMode === "scheduled" ? new Date(startsAt?.value || "") : new Date();
    const end = type === "LIMITED" ? new Date(endsAt?.value || "") : null;
    if (Number.isNaN(start.getTime()) || (type === "LIMITED" && (!endsAt?.value || Number.isNaN(end.getTime())))) {
      state = "INCOMPLETE";
    } else if (start > new Date()) {
      state = "SCHEDULED";
    } else if (end && end <= new Date()) {
      state = "COMPLETED";
    } else {
      state = "SUSPENDED";
    }
  }
  const labels = {
    NOT_SCHEDULED: "Not scheduled",
    INCOMPLETE: "Set required dates",
    SCHEDULED: "Scheduled",
    SUSPENDED: "Suspended",
    COMPLETED: "Completed",
  };
  const output = root.querySelector('[data-suspension-state]');
  if (output) {
    output.textContent = labels[state];
    output.dataset.state = state;
  }
}

function bindCustomerSuspensionControls(form) {
  const root = getCustomerSuspensionRoot(form);
  if (!root || root.dataset.bound === "true") return;
  root.dataset.bound = "true";
  root.addEventListener("input", () => updateCustomerSuspensionControls(root));
  root.addEventListener("change", () => updateCustomerSuspensionControls(root));
  updateCustomerSuspensionControls(root);
}

function populateCustomerSuspensionForm(form, suspension) {
  const root = getCustomerSuspensionRoot(form);
  if (!root) return;
  const setField = (name, value) => {
    const field = getCustomerSuspensionControl(root, name);
    if (field) field.value = value;
  };
  const enabled = Boolean(suspension?.enabled);
  const checkbox = getCustomerSuspensionControl(root, "enabled");
  if (checkbox) checkbox.checked = enabled;
  setField("type", suspension?.type === "UNLIMITED" ? "UNLIMITED" : "LIMITED");
  setField("startMode", enabled && suspension?.startsAt ? "scheduled" : "immediate");
  setField("startsAt", suspensionLocalDatetime(suspension?.startsAt));
  setField("endsAt", suspensionLocalDatetime(suspension?.endsAt));
  setField("reason", suspension?.reason || "");
  root.dataset.originalStart = suspensionLocalDatetime(suspension?.startsAt);
  updateCustomerSuspensionControls(root);
}

function buildCustomerSuspensionPayload(form) {
  const settings = getCustomerSuspensionFormValues(form);
  if (!settings.enabled) return { enabled: false };

  const root = getCustomerSuspensionRoot(form);
  const now = new Date();
  let startsAt = null;
  if (settings.startMode === "scheduled") {
    const start = new Date(settings.startsAt);
    if (!settings.startsAt || Number.isNaN(start.getTime())) {
      throw new Error("Select a valid suspension start date and time.");
    }
    // An already-active schedule can retain its original start on edit.
    if (start <= now && settings.startsAt !== root?.dataset.originalStart) {
      throw new Error("Choose a future start date/time, or select Immediately.");
    }
    startsAt = start.toISOString();
  }

  let endsAt = null;
  if (settings.type === "LIMITED") {
    const end = new Date(settings.endsAt);
    if (!settings.endsAt || Number.isNaN(end.getTime())) {
      throw new Error("Select a valid automatic reactivation date and time.");
    }
    const start = startsAt ? new Date(startsAt) : now;
    if (end <= start || end <= now) {
      throw new Error("Automatic reactivation must be after the start and in the future.");
    }
    endsAt = end.toISOString();
  }

  return {
    enabled: true,
    type: settings.type,
    startsAt,
    endsAt,
    reason: settings.reason,
  };
}

function notifyCustomerSuspensionError(error) {
  window.showDashboardAlert?.(error?.message || "Review automatic suspension settings.", {
    title: "Invalid suspension settings",
    type: "error",
  });
}

/**
 * Optional Google Places suggestions for customer addresses. The address field
 * is always editable, even if Google Maps is blocked or the key lacks Places.
 * This only chooses text; it never claims official National Address verification.
 */
const CUSTOMER_ADDRESS_MIN_CHARACTERS = 3;
function customerAddressCharacterCount(value) {
  // Count visible, non-whitespace characters. Supports Arabic and surrogate pairs.
  return Array.from(String(value || "").trim().replace(/\s/g, "")).length;
}
function customerAddressPredictionText(value) {
  if (typeof value === "string") return value;
  return value?.text || value?.toString?.() || "";
}

function installCustomerAddressAutocomplete(form, selector) {
  const input = form?.querySelector(selector);
  if (!input || input.dataset.parkinAddressBound === "true") return;
  input.dataset.parkinAddressBound = "true";
  input.setAttribute("autocomplete", "off");
  input.setAttribute("role", "combobox");
  input.setAttribute("aria-autocomplete", "list");
  input.setAttribute("aria-expanded", "false");

  const list = document.createElement("div");
  list.className = "customer-address-suggestions";
  list.id = `${input.id}-suggestions`;
  list.setAttribute("role", "listbox");
  list.hidden = true;
  input.setAttribute("aria-controls", list.id);
  input.insertAdjacentElement("afterend", list);
  input.parentElement?.classList.add("customer-address-search-field");

  const help = document.createElement("small");
  help.className = "customer-address-search-help";
  help.textContent = "Enter 3 or more characters for Google Maps suggestions, or type the address manually. This is not Saudi National Address verification.";
  list.insertAdjacentElement("afterend", help);

  let predictions = [];
  let highlighted = -1;
  let generation = 0;
  let debounceTimer = null;
  let sessionToken = null;
  let applyingSelection = false;

  function hide() {
    predictions = [];
    highlighted = -1;
    list.replaceChildren();
    list.hidden = true;
    input.setAttribute("aria-expanded", "false");
    input.removeAttribute("aria-activedescendant");
  }
  function highlight(index) {
    highlighted = index;
    [...list.querySelectorAll('[role="option"]')].forEach((item, i) => {
      item.setAttribute("aria-selected", String(i === highlighted));
      item.classList.toggle("is-active", i === highlighted);
    });
    if (highlighted >= 0) {
      input.setAttribute("aria-activedescendant", `${list.id}-option-${highlighted}`);
    } else {
      input.removeAttribute("aria-activedescendant");
    }
  }
  async function choose(prediction) {
    const token = ++generation;
    window.clearTimeout(debounceTimer);
    hide();
    let address = customerAddressPredictionText(prediction?.text);
    try {
      if (typeof prediction?.toPlace === "function") {
        const place = prediction.toPlace();
        await place.fetchFields({ fields: ["formattedAddress"] });
        if (place.formattedAddress) address = place.formattedAddress;
      }
    } catch {
      // A predicted label is usable even when Place Details is unavailable.
    }
    if (token !== generation || !input.isConnected || !form.isConnected) return;
    if (!String(address || "").trim()) return;
    applyingSelection = true;
    input.value = String(address).trim().slice(0, 500);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
    applyingSelection = false;
    sessionToken = null;
    input.focus();
  }
  function show(suggestions) {
    predictions = suggestions
      .map((suggestion) => suggestion?.placePrediction)
      .filter(Boolean)
      .slice(0, 6);
    list.replaceChildren();
    highlighted = -1;
    if (!predictions.length) return hide();
    predictions.forEach((prediction, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.id = `${list.id}-option-${index}`;
      button.className = "customer-address-suggestion";
      button.setAttribute("role", "option");
      button.setAttribute("aria-selected", "false");
      const title = document.createElement("span");
      title.textContent = customerAddressPredictionText(prediction.mainText) ||
        customerAddressPredictionText(prediction.text);
      const secondary = document.createElement("small");
      secondary.textContent = customerAddressPredictionText(prediction.secondaryText);
      button.append(title, secondary);
      button.addEventListener("pointerdown", (event) => event.preventDefault());
      button.addEventListener("click", () => { void choose(prediction); });
      list.appendChild(button);
    });
    const attribution = document.createElement("div");
    attribution.className = "customer-address-attribution";
    attribution.textContent = "Google Maps";
    list.appendChild(attribution);
    list.hidden = false;
    input.setAttribute("aria-expanded", "true");
  }
  async function search(query, token) {
    try {
      const maps = window.google?.maps;
      if (!maps?.importLibrary) return hide();
      const places = await maps.importLibrary("places");
      if (token !== generation || !input.isConnected) return;
      if (!places?.AutocompleteSuggestion?.fetchAutocompleteSuggestions) return hide();
      if (!sessionToken && places.AutocompleteSessionToken) {
        sessionToken = new places.AutocompleteSessionToken();
      }
      const response = await places.AutocompleteSuggestion.fetchAutocompleteSuggestions({
        input: query,
        includedRegionCodes: ["sa"],
        region: "sa",
        language: "en",
        ...(sessionToken ? { sessionToken } : {}),
      });
      if (token !== generation || !input.isConnected || input.value.trim() !== query) return;
      show(response?.suggestions || []);
    } catch {
      if (token === generation) hide();
      // Manual entry stays available. Do not expose customer address in logs.
    }
  }
  input.addEventListener("input", () => {
    if (applyingSelection) return;
    const token = ++generation;
    window.clearTimeout(debounceTimer);
    hide();
    const query = input.value.trim();
    if (customerAddressCharacterCount(query) < CUSTOMER_ADDRESS_MIN_CHARACTERS) return;
    debounceTimer = window.setTimeout(() => { void search(query, token); }, 300);
  });
  input.addEventListener("keydown", (event) => {
    if (list.hidden || !predictions.length) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const step = event.key === "ArrowDown" ? 1 : -1;
      highlight((highlighted + step + predictions.length) % predictions.length);
    } else if (event.key === "Enter" && highlighted >= 0) {
      event.preventDefault();
      void choose(predictions[highlighted]);
    } else if (event.key === "Escape") {
      ++generation;
      hide();
    }
  });
  input.addEventListener("blur", () => {
    window.setTimeout(() => { ++generation; hide(); }, 150);
  });
}

/** SPL calls go to the authenticated NestJS backend, never to SPL from the browser. */
function installCustomerSplAddressActions(form, prefix) {
  if (!form || form.dataset.parkinSplBound === "true") return;
  const searchButton = form.querySelector("[data-spl-search]");
  const verifyButton = form.querySelector("[data-spl-verify]");
  const result = form.querySelector("[data-spl-result]");
  const matches = form.querySelector("[data-spl-matches]");
  if (!searchButton || !verifyButton || !result || !matches) return;
  form.dataset.parkinSplBound = "true";
  let requestVersion = 0;
  let busy = false;
  const buttons = [searchButton, verifyButton];
  const setBusy = (state) => {
    busy = state;
    buttons.forEach((button) => { button.disabled = state; });
  };
  const clearResults = () => {
    requestVersion++;
    matches.replaceChildren();
    result.textContent = "Address changed. Recheck with SPL if needed. Proof not verified.";
  };
  for (const [, suffix] of CUSTOMER_NATIONAL_ADDRESS_FIELDS) {
    form.querySelector(`#${prefix}-${suffix}`)?.addEventListener("input", clearResults);
  }
  form.querySelector(prefix === "edit" ? "#edit-address" : "#customer-address")
    ?.addEventListener("input", clearResults);

  async function callSpl(path, options) {
    const response = await fetch(`${getCustomerManagementApiBaseUrl()}/national-address/${path}`, {
      ...options,
      headers: getCustomerManagementAuthHeaders(),
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      if (response.status === 503) throw new Error("SPL service is unavailable or not configured.");
      if (response.status === 429) throw new Error("Please allow five seconds between SPL requests.");
      if (response.status === 401 || response.status === 403) throw new Error("You do not have permission to use SPL address services.");
      throw new Error("Could not complete SPL request.");
    }
    return payload?.data ?? payload;
  }

  searchButton.addEventListener("click", async () => {
    if (busy) return;
    const version = ++requestVersion;
    matches.replaceChildren();
    const values = getCustomerNationalAddressValues(prefix);
    const freeText = form.querySelector(prefix === "edit" ? "#edit-address" : "#customer-address")?.value.trim() || "";
    // Prefer the building/postal pair documented for SPL search.
    const q = /^\d{4}$/.test(values.nationalAddressBuildingNumber) && /^\d{5}$/.test(values.nationalAddressPostalCode)
      ? `${values.nationalAddressBuildingNumber} ${values.nationalAddressPostalCode}` : freeText;
    if (q.length < 3) { result.textContent = "Enter a building/postal pair or an address of at least 3 characters."; return; }
    setBusy(true);
    result.textContent = "Searching official SPL address records...";
    try {
      const query = new URLSearchParams({ purpose: "customer", q });
      const payload = await callSpl(`search?${query.toString()}`, { method: "GET" });
      if (version !== requestVersion || !form.isConnected) return;
      const addresses = Array.isArray(payload?.addresses) ? payload.addresses : null;
      if (!addresses) throw new Error("Invalid SPL search response.");
      if (!addresses.length) { result.textContent = "No matching SPL address was returned."; return; }
      result.textContent = "Choose an official address result to fill the form. The proof remains unverified.";
      addresses.slice(0, 10).forEach((address) => {
        const option = document.createElement("button");
        option.type = "button";
        option.className = "customer-national-address-spl-match";
        option.textContent = [address.address1, address.address2].filter(Boolean).join(", ") || "SPL address";
        option.addEventListener("click", () => {
          const mappings = {
            "national-building": address.buildingNumber,
            "national-street": address.street,
            "national-district": address.district,
            "national-city": address.city,
            "national-postal": address.postalCode,
            "national-additional": address.additionalNumber,
          };
          for (const [suffix, value] of Object.entries(mappings)) {
            const field = form.querySelector(`#${prefix}-${suffix}`);
            if (field && typeof value === "string") {
              field.value = value;
              field.dispatchEvent(new Event("input", { bubbles: true }));
            }
          }
          const primary = form.querySelector(prefix === "edit" ? "#edit-address" : "#customer-address");
          if (primary) {
            primary.value = [address.address1, address.address2].filter(Boolean).join(", ").slice(0, 500);
            primary.dispatchEvent(new Event("input", { bubbles: true }));
          }
          matches.replaceChildren();
          result.textContent = "Address fields filled from SPL search. Run Check address with SPL to confirm existence. Proof not verified.";
        });
        matches.appendChild(option);
      });
    } catch (error) {
      if (version === requestVersion) result.textContent = error.message || "SPL search unavailable.";
    } finally { setBusy(false); }
  });

  verifyButton.addEventListener("click", async () => {
    if (busy) return;
    const values = getCustomerNationalAddressValues(prefix);
    const buildingNumber = values.nationalAddressBuildingNumber;
    const postalCode = values.nationalAddressPostalCode;
    const additionalNumber = values.nationalAddressAdditionalNumber;
    if (!/^\d{4}$/.test(buildingNumber) || !/^\d{5}$/.test(postalCode) || !/^\d{4}$/.test(additionalNumber)) {
      result.textContent = "Enter a 4-digit building number, 5-digit postal code and 4-digit additional number.";
      return;
    }
    const version = ++requestVersion;
    matches.replaceChildren();
    setBusy(true);
    result.textContent = "Checking address existence with SPL...";
    try {
      const payload = await callSpl("verify", {
        method: "POST",
        body: JSON.stringify({ purpose: "customer", buildingNumber, postalCode, additionalNumber }),
      });
      if (version !== requestVersion || !form.isConnected) return;
      if (payload?.addressExists === true && payload?.source === "SPL_NATIONAL_ADDRESS") {
        result.textContent = "SPL confirms this address exists. This check is not saved, and does not verify the address holder or proof.";
      } else if (payload?.addressExists === false && payload?.source === "SPL_NATIONAL_ADDRESS") {
        result.textContent = "SPL did not find this address. Check the numbers or contact SPL. Proof not verified.";
      } else {
        throw new Error("Unrecognized SPL verification response.");
      }
    } catch (error) {
      if (version === requestVersion) result.textContent = error.message || "SPL verification unavailable.";
    } finally { setBusy(false); }
  });
}

/** Saudi National Address values remain unverified without authorized SPL integration. */
const CUSTOMER_NATIONAL_ADDRESS_FIELDS = [
  ["nationalAddressShortCode", "national-short"],
  ["nationalAddressBuildingNumber", "national-building"],
  ["nationalAddressStreet", "national-street"],
  ["nationalAddressDistrict", "national-district"],
  ["nationalAddressCity", "national-city"],
  ["nationalAddressPostalCode", "national-postal"],
  ["nationalAddressAdditionalNumber", "national-additional"],
];
function getCustomerNationalAddressValues(prefix) {
  const values = {};
  for (const [key, suffix] of CUSTOMER_NATIONAL_ADDRESS_FIELDS) {
    values[key] = document.querySelector(`#${prefix}-${suffix}`)?.value.trim() || "";
  }
  return values;
}

/** Client-side format check only. Never equate format completion with SPL verification. */
function customerNationalAddressFormatStatus(values) {
  const fields = Object.values(values);
  if (fields.every((value) => !value)) return "Not entered";
  const complete = /^[A-Za-z]{4}[0-9]{4}$/.test(values.nationalAddressShortCode) &&
    /^[0-9]{4}$/.test(values.nationalAddressBuildingNumber) &&
    Boolean(values.nationalAddressStreet) &&
    Boolean(values.nationalAddressDistrict) &&
    Boolean(values.nationalAddressCity) &&
    /^[0-9]{5}$/.test(values.nationalAddressPostalCode) &&
    /^[0-9]{4}$/.test(values.nationalAddressAdditionalNumber);
  return complete ? "Format complete" : "Format incomplete";
}
function installCustomerNationalAddressFormatFeedback(form, prefix) {
  if (!form || form.dataset.parkinNationalAddressFeedbackBound === "true") return;
  const indicator = form.querySelector("[data-national-address-format]");
  if (!indicator) return;
  form.dataset.parkinNationalAddressFeedbackBound = "true";
  const update = () => {
    indicator.textContent = customerNationalAddressFormatStatus(getCustomerNationalAddressValues(prefix));
  };
  for (const [, suffix] of CUSTOMER_NATIONAL_ADDRESS_FIELDS) {
    form.querySelector(`#${prefix}-${suffix}`)?.addEventListener("input", update);
    form.querySelector(`#${prefix}-${suffix}`)?.addEventListener("change", update);
  }
  update();
}


async function loadAddCustomerPage() {
  const container = document.querySelector("#add-customer-container");
  if (!container) return;

  if (container.dataset.loaded !== "true") {
    const response = await fetch("/pages/add-customer.html");

    if (!response.ok) {
      throw new Error(`Unable to load Add Customer page: ${response.status}`);
    }

    container.innerHTML = await response.text();
    container.dataset.loaded = "true";
  }

  const memberSince = document.querySelector("#customer-member-since");

  if (memberSince && !memberSince.value) {
    const dateParts = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Riyadh',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(new Date());
    const datePart = (type) => dateParts.find((part) => part.type === type)?.value;
    memberSince.value = `${datePart('year')}-${datePart('month')}-${datePart('day')}`;
  }

  await initializeAddCustomerCompanyContext();

  bindAddCustomerForm();
  installCustomerAddressAutocomplete(container.querySelector("#add-customer-form"), "#customer-address");
  installCustomerNationalAddressFormatFeedback(container.querySelector("#add-customer-form"), "customer");
  installCustomerSplAddressActions(container.querySelector("#add-customer-form"), "customer");
}

function bindAddCustomerForm() {
  const form = document.querySelector("#add-customer-form");
  if (!form || form.dataset.bound === "true") return;

  form.dataset.bound = "true";
  bindCustomerSuspensionControls(form);

  const fullName = document.querySelector("#customer-full-name");
  const email = document.querySelector("#customer-email");
  const customerType = document.querySelector("#customer-type");
  const customerStatus = document.querySelector("#customer-status");
  const memberSince = document.querySelector("#customer-member-since");
  const language = document.querySelector("#customer-language");
  const communication = document.querySelector("#customer-communication");
  const notes = document.querySelector("#customer-notes");
  const companySelect = document.querySelector("#customer-company-id");

  const summaryName = document.querySelector("#summary-customer-name");
  const summaryEmail = document.querySelector("#summary-customer-email");
  const summaryType = document.querySelector("#summary-customer-type");
  const summaryStatus = document.querySelector("#summary-customer-status");
  const summaryMemberSince = document.querySelector("#summary-member-since");
  const summaryLanguage = document.querySelector("#summary-language");
  const summaryCommunication = document.querySelector("#summary-communication");
  const noteCount = document.querySelector("#customer-note-count");

  function formatDate(value) {
    if (!value) return "Not selected";

    const date = new Date(`${value}T00:00:00`);

    if (Number.isNaN(date.getTime())) {
      return "Not selected";
    }

    return new Intl.DateTimeFormat("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    }).format(date);
  }

  function updateSummary() {
    if (summaryName) {
      summaryName.textContent = fullName?.value.trim() || "Customer Preview";
    }

    if (summaryEmail) {
      summaryEmail.textContent =
        email?.value.trim() || "Enter customer details";
    }

    if (summaryType) {
      summaryType.textContent = customerType?.value || "Individual";
    }

    if (summaryStatus) {
      const status = customerStatus?.value || "Active";

      summaryStatus.textContent = status;
      summaryStatus.classList.remove("active", "inactive", "blocked");
      summaryStatus.classList.add(status.toLowerCase());
    }

    if (summaryMemberSince) {
      summaryMemberSince.textContent = formatDate(memberSince?.value);
    }

    if (summaryLanguage) {
      summaryLanguage.textContent = language?.value || "English";
    }

    if (summaryCommunication) {
      summaryCommunication.textContent = communication?.value || "Email, SMS";
    }

    if (noteCount) {
      noteCount.textContent = String(notes?.value.length || 0);
    }
  }

  [
    fullName,
    email,
    customerType,
    customerStatus,
    memberSince,
    language,
    communication,
    notes,
  ].forEach((field) => {
    field?.addEventListener("input", updateSummary);
    field?.addEventListener("change", updateSummary);
  });

  companySelect?.addEventListener(
    "change",
    () => {
      setAddCustomerCompanyAlert("");
      resetAddCustomerMobileLookup();
      updateAddCustomerCompanyContext();
    },
  );

  const customerPhone =
    document.querySelector(
      "#customer-phone",
    );

  customerPhone?.addEventListener(
    "input",
    () => {
      if (
        addCustomerCompanyState
          .mobileLookup.key ||
        addCustomerCompanyState
          .mobileLookup.result
      ) {
        resetAddCustomerMobileLookup();
      }
    },
  );

  document
    .querySelector(
      "#customer-mobile-lookup-button",
    )
    ?.addEventListener(
      "click",
      async () => {
        try {
          await lookupAddCustomerMobileCustomer();
        } catch {
          // Error state is rendered in the lookup panel.
        }
      },
    );

  document
    .querySelector(
      "#customer-mobile-clear-result",
    )
    ?.addEventListener(
      "click",
      () => {
        resetAddCustomerMobileLookup();
        updateAddCustomerMobileLookupVisibility();
      },
    );

  document
    .querySelector(
      "#customer-mobile-confirm-association",
    )
    ?.addEventListener(
      "click",
      associateExistingAddCustomerMobileCustomer,
    );

  document
    .querySelector("#back-to-customers")
    ?.addEventListener("click", () => {
      window.location.hash = "customers";
    });

  document
    .querySelector("#cancel-add-customer")
    ?.addEventListener("click", () => {
      window.location.hash = "customers";
    });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const companyId =
      companySelect?.value.trim() || "";

    if (!companyId) {
      setAddCustomerCompanyAlert(
        "Select an active company before creating the customer.",
        "error",
      );

      companySelect?.focus();

      return;
    }

    setAddCustomerCompanyAlert("");

    if (!form.checkValidity()) {
      form.reportValidity();
      return;
    }

    let automaticSuspension;
    if (getCustomerSuspensionFormValues(form).enabled) {
      try {
        automaticSuspension = buildCustomerSuspensionPayload(form);
      } catch (error) {
        notifyCustomerSuspensionError(error);
        return;
      }
    }

    const selectedCompany =
      getSelectedAddCustomerCompany();

    if (selectedCompany?.operationalService) {
      const lookupKey =
        getAddCustomerMobileLookupKey();

      let lookupResult =
        addCustomerCompanyState
          .mobileLookup.key === lookupKey
          ? addCustomerCompanyState
              .mobileLookup.result
          : null;

      if (!lookupResult) {
        try {
          lookupResult =
            await lookupAddCustomerMobileCustomer();
        } catch {
          return;
        }
      }

      /*
       * Existing records must never enter the
       * normal customer-create path.
       */
      if (lookupResult?.exists) {
        document
          .querySelector(
            "#customer-mobile-lookup-panel",
          )
          ?.scrollIntoView({
            behavior: "smooth",
            block: "center",
          });

        return;
      }

      /*
       * If lookup could not complete, fail closed.
       */
      if (!lookupResult) {
        return;
      }
    }

    const submitButton = form.querySelector(".add-customer-submit");
    const originalButtonHtml = submitButton?.innerHTML || "";

    const payload = {
      companyId,
      fullName: fullName?.value.trim() || "",
      email: email?.value.trim() || "",
      phoneCountryCode: "+966",
      phoneNumber:
        document.querySelector("#customer-phone")?.value.trim() || "",
      customerType: customerType?.value.trim().toUpperCase() || "INDIVIDUAL",
      status: customerStatus?.value.trim().toUpperCase() || "ACTIVE",
      memberSince: memberSince?.value || undefined,
      preferredLanguage: language?.value.trim() || undefined,
      communicationPreference: communication?.value.trim() || undefined,
      nationality: document.querySelector("#customer-nationality")?.value.trim() || "",
      address: document.querySelector("#customer-address")?.value.trim() || "",
      ...getCustomerNationalAddressValues("customer"),
      emergencyContactName: document.querySelector("#emergency-contact-name")?.value.trim() || "",
      emergencyContactPhone: document.querySelector("#emergency-contact-phone")?.value.trim() || "",
      notes: notes?.value.trim() || undefined,
      ...(automaticSuspension ? { automaticSuspension } : {}),
    };

    try {
      if (submitButton) {
        submitButton.disabled = true;
        submitButton.innerHTML =
          '<i class="fa-solid fa-spinner fa-spin"></i> Creating...';
      }

      const response = await fetch(
        `${getCustomerManagementApiBaseUrl()}/customers`,
        {
          method: "POST",
          headers: getCustomerManagementAuthHeaders(),
          body: JSON.stringify(payload),
        },
      );

      const body = await response.json().catch(() => null);

      if (!response.ok) {
        const message = Array.isArray(body?.message)
          ? body.message.join(" ")
          : body?.message || body?.error || "Unable to create customer.";

        throw new Error(message);
      }

      const result = body?.data || body;
      const customer = result?.customer || result;

      if (!customer?.id) {
        throw new Error(
          "Customer was created but no customer ID was returned.",
        );
      }

      customerListState.page = 1;

      window.location.hash = `customer-details?id=${encodeURIComponent(customer.id)}`;
    } catch (error) {
      console.error("Unable to create customer:", error);

      window.showDashboardAlert?.(
        error?.message || "Unable to create customer.",
        {
          title: "Customer creation failed",
          type: "error",
        },
      );
    } finally {
      if (submitButton) {
        submitButton.disabled = false;
        submitButton.innerHTML = originalButtonHtml;
      }
    }
  });

  updateSummary();
  updateAddCustomerCompanyContext();
}

function formatCustomerDetailsSource(value) {
  const labels = {
    MOBILE: "Mobile App",
    DASHBOARD: "Dashboard",
    IMPORT: "Import",
    SYSTEM: "System",
  };

  return labels[value] || value || "—";
}


function formatCustomerDetailsOperationalService(
  value,
) {
  const labels = {
    VALET_PARKING: "Valet Parking",
    EVENT_MANAGEMENT: "Event Management",
    RENTAL_PARKING: "Rental Parking",
  };

  return labels[value] || value || "No operational service";
}


function renderCustomerOperationalAccess(
  customer,
) {
  const page =
    document.querySelector(
      ".customer-details-page",
    );

  if (!page || !customer) return;

  const homeCompany =
    customer.company || null;

  /*
   * Normal associated mobile customers use
   * operationalCompany.
   *
   * The fallback also supports operational customers
   * whose home company itself provides the service.
   */
  const operationalCompany =
    customer.operationalCompany ||
    (
      customer.operationalAccessEnabled &&
      homeCompany?.operationalService
        ? homeCompany
        : null
    );

  const operationalService =
    operationalCompany?.operationalService ||
    (
      customer.operationalAccessEnabled
        ? homeCompany?.operationalService
        : null
    );

  const accessEnabled =
    customer.operationalAccessEnabled === true;

  setCustomerDetailText(
    page,
    "[data-operational-home-company]",
    homeCompany?.name || "—",
  );

  setCustomerDetailText(
    page,
    "[data-operational-customer-source]",
    formatCustomerDetailsSource(
      customer.createdSource,
    ),
  );

  setCustomerDetailText(
    page,
    "[data-operational-company]",
    operationalCompany?.name ||
      "Not assigned",
  );

  setCustomerDetailText(
    page,
    "[data-operational-service]",
    operationalService
      ? formatCustomerDetailsOperationalService(
          operationalService,
        )
      : "No operational service",
  );

  setCustomerDetailText(
    page,
    "[data-operational-granted-at]",
    accessEnabled
      ? formatCustomerDetailDateTime(
          customer.operationalAccessGrantedAt,
        )
      : "—",
  );

  const status =
    page.querySelector(
      "[data-operational-access-status]",
    );

  if (status) {
    status.textContent =
      accessEnabled
        ? "Enabled"
        : "Disabled";

    status.classList.toggle(
      "enabled",
      accessEnabled,
    );

    status.classList.toggle(
      "disabled",
      !accessEnabled,
    );
  }

  const note =
    page.querySelector(
      "[data-operational-access-note]",
    );

  if (note) {
    const text =
      note.querySelector("span");

    note.classList.toggle(
      "active",
      accessEnabled,
    );

    if (text) {
      if (accessEnabled) {
        const companyName =
          operationalCompany?.name ||
          "the assigned operational company";

        const serviceName =
          formatCustomerDetailsOperationalService(
            operationalService,
          );

        text.textContent =
          `${serviceName} access is enabled through ${companyName}. The customer's home company remains unchanged.`;
      } else {
        text.textContent =
          "No special operational service access is assigned.";
      }
    }
  }
}


async function loadCustomerDetailsPage(
  initialTab = "overview",
  customerId = getCurrentCustomerId(),
) {
  const view = document.querySelector("#customer-details-view");

  const container = document.querySelector("#customer-details-container");

  if (!view || !container) {
    console.error("Customer Details view or container was not found.");
    return;
  }

  if (
    getDashboardRoute().name !== "customer-details" ||
    !customerId ||
    getCurrentCustomerId() !== customerId
  ) {
    if (getDashboardRoute().name === "customer-details" && !customerId) {
      window.location.hash = "customers";
    }
    return;
  }

  customerDetailsAbortController?.abort();
  const controller = new AbortController();
  customerDetailsAbortController = controller;
  const requestId = ++customerDetailsRequestId;

  // Do not show the previous customer's sensitive fields or bookings while
  // another customer is loading from the API.
  if (container.dataset.customerId !== customerId) {
    container.replaceChildren();
    container.dataset.loaded = "false";
    container.dataset.customerId = customerId;
  }

  hideAllCustomerViews();

  view.classList.remove("hidden");

  try {
    if (container.dataset.loaded !== "true" || !container.querySelector(".customer-details-page")) {
      const response = await fetch("/pages/customer-details.html", {
        signal: controller.signal,
      });

      if (!response.ok) {
        const error = new Error("Unable to load Customer Details.");
        error.status = response.status;
        throw error;
      }

      container.innerHTML = await response.text();

      container.dataset.loaded = "true";
    }

    if (
      controller.signal.aborted ||
      requestId !== customerDetailsRequestId ||
      getDashboardRoute().name !== "customer-details" ||
      getCurrentCustomerId() !== customerId
    ) {
      return;
    }

    const databaseId = resolveCustomerDatabaseId(customerId);
    if (!databaseId) {
      const error = new Error("Customer ID is invalid.");
      error.status = 400;
      throw error;
    }

    const [customerResult, vehiclesResult] = await Promise.allSettled([
      fetchCustomerRecord(databaseId, controller.signal),
      fetchCustomerVehicles(databaseId, controller.signal),
    ]);

    if (customerResult.status === "rejected") {
      throw customerResult.reason;
    }

    const customer = customerResult.value;
    const vehicles =
      vehiclesResult.status === "fulfilled" ? vehiclesResult.value : null;
    if (
      controller.signal.aborted ||
      requestId !== customerDetailsRequestId ||
      getDashboardRoute().name !== "customer-details" ||
      getCurrentCustomerId() !== customerId
    ) {
      return;
    }
    populateCustomerDetails(customer);
    renderCustomerOperationalAccess(customer);
    renderCustomerVehicles(customer, vehicles, vehiclesResult.reason);
    renderCustomerActivity(customer, vehicles || []);
    renderCustomerBookings(null, "loading");
    renderComingSoonPaymentMethods();
    bindCustomerDetailsActions();
    bindCustomerDetailsTabs();
    bindCustomerVehicleActions();
    window.applyDashboardPermissionVisibility?.(container);

    activateCustomerDetailsTab(initialTab);
    if (!window.hasDashboardPermission?.("bookings.view")) {
      renderCustomerBookings(null, "restricted");
    } else {
      try {
        const bookings = await fetchCustomerBookings(databaseId, controller.signal);
        if (!controller.signal.aborted && requestId === customerDetailsRequestId &&
            getDashboardRoute().name === "customer-details" && getCurrentCustomerId() === customerId) {
          renderCustomerBookings(bookings, "ready");
        }
      } catch (bookingError) {
        if (bookingError?.name !== "AbortError" && !controller.signal.aborted &&
            requestId === customerDetailsRequestId && getDashboardRoute().name === "customer-details" &&
            getCurrentCustomerId() === customerId) {
          renderCustomerBookings(null, bookingError?.status === 403 ? "restricted" : "error");
        }
      }
    }
  } catch (error) {
    if (
      error?.name === "AbortError" ||
      requestId !== customerDetailsRequestId ||
      getDashboardRoute().name !== "customer-details"
    ) {
      return;
    }

    console.error("Unable to load Customer Details:", error);

    container.innerHTML = `
      <section class="page-load-error">
        <h2>${error?.status === 404 ? "Customer not found" : "Unable to load Customer Details"}</h2>
        <p>${error?.status === 403 ? "You do not have permission to view this customer." : "Please refresh the page and try again."}</p>
      </section>
    `;
  }
}

function cancelCustomerRequests() {
  customerDetailsAbortController?.abort();
  customerListAbortController?.abort();
  customerEditAbortController?.abort();
  customerDetailsRequestId += 1;
  customerListRequestId += 1;
  customerEditRequestId += 1;
}

window.cancelCustomerRequests = cancelCustomerRequests;

function bindCustomerVehicleActions() {
  const buttons = [
    document.querySelector("#customer-add-vehicle-top"),
    document.querySelector("#customer-add-vehicle-empty"),
  ].filter(Boolean);

  buttons.forEach((button) => {
    if (button.dataset.bound === "true") return;

    button.dataset.bound = "true";

    button.addEventListener("click", () => {
      if (!window.hasDashboardPermission?.("vehicles.create")) return;
      const customerId = getCurrentCustomerId();
      if (!customerId) return;
      window.location.hash = `customer-add-vehicle?id=${encodeURIComponent(customerId)}`;
    });
  });
}

async function loadEditCustomerPage() {
  const container = document.querySelector("#edit-customer-container");
  if (!container) return;

  const customerId = getCurrentCustomerId();
  if (getDashboardRoute().name !== "edit-customer" || !customerId) {
    if (getDashboardRoute().name === "edit-customer") {
      window.location.hash = "customers";
    }
    return;
  }

  if (
    !customerEditReturnRoute ||
    (customerEditReturnRoute !== "#customers" &&
      !customerEditReturnRoute.endsWith(`id=${encodeURIComponent(customerId)}`))
  ) {
    customerEditReturnRoute = "#customers";
  }

  customerEditAbortController?.abort();
  const controller = new AbortController();
  customerEditAbortController = controller;
  const requestId = ++customerEditRequestId;

  if (container.dataset.loaded !== "true") {
    const response = await fetch("/pages/edit-customer.html");

    if (!response.ok) {
      throw new Error(`Unable to load Edit Customer page: ${response.status}`);
    }

    container.innerHTML = await response.text();
    container.dataset.loaded = "true";
  }

  // Never display stale contact details from a previously viewed customer.
  // Re-enable the form only after this exact customer's scoped GET succeeds.
  const editForm = container.querySelector("#edit-customer-form");
  if (editForm) editForm.hidden = true;
  bindEditCustomerActions();
  installCustomerAddressAutocomplete(editForm, "#edit-address");
  installCustomerNationalAddressFormatFeedback(editForm, "edit");
  installCustomerSplAddressActions(editForm, "edit");
  window.applyDashboardPermissionVisibility?.(container);

  // Clear the previous customer's summary immediately when changing routes.
  // Otherwise a recycled page can briefly show another customer's vehicles.
  renderEditCustomerOverview(null, null, null);

  const databaseId = resolveCustomerDatabaseId(customerId);
  let customer;
  try {
    customer = databaseId
      ? await fetchCustomerRecord(databaseId, controller.signal)
      : null;
  } catch (error) {
    if (error?.name === "AbortError") return;
    window.showDashboardAlert?.(
      error?.status === 404
        ? "Customer not found."
        : "Unable to load customer information. Please try again.",
      { title: "Unable to load customer", type: "error" },
    );
    return;
  }
  if (
    controller.signal.aborted ||
    requestId !== customerEditRequestId ||
    getDashboardRoute().name !== "edit-customer" ||
    getCurrentCustomerId() !== customerId
  ) {
    return;
  }

  if (!customer) return;
  populateEditCustomerForm(customer);
  renderEditCustomerOverview(customer, null, null);
  bindEditCustomerActions();
  if (editForm) editForm.hidden = false;
  window.applyDashboardPermissionVisibility?.(container);

  // Vehicles are loaded using the existing permission-protected vehicle API.
  // Never infer an empty list from a failed or unauthorized request.
  if (!databaseId || !window.hasDashboardPermission?.("vehicles.view")) {
    renderEditCustomerOverview(customer, null, "restricted");
    return;
  }
  try {
    const vehicles = await fetchCustomerVehicles(databaseId, controller.signal);
    if (
      controller.signal.aborted ||
      requestId !== customerEditRequestId ||
      getDashboardRoute().name !== "edit-customer" ||
      getCurrentCustomerId() !== customerId
    ) return;
    renderEditCustomerOverview(customer, vehicles, null);
  } catch (error) {
    if (error?.name === "AbortError") return;
    if (
      requestId === customerEditRequestId &&
      getDashboardRoute().name === "edit-customer" &&
      getCurrentCustomerId() === customerId
    ) renderEditCustomerOverview(customer, null, "failed");
  }
}

function populateEditCustomerForm(customer) {
  const setValue = (selector, value) => {
    const element = document.querySelector(selector);
    if (element && value !== undefined && value !== null) {
      const normalizedValue = String(value);
      const option = [...(element.options || [])].find(
        (item) => item.value.toUpperCase() === normalizedValue.toUpperCase(),
      );
      element.value = option?.value || normalizedValue;
    }
  };

  setValue("#edit-full-name", customer.fullName);
  setValue("#edit-email", customer.email || "");
  setValue("#edit-phone", customer.phoneNumber || "");
  setValue("#edit-customer-id", getCurrentCustomerId() || customer.id);
  setValue("#edit-customer-type", customer.customerType);
  setValue("#edit-status", customer.status);
  setValue(
    "#edit-member-since",
    customer.memberSince ? String(customer.memberSince).slice(0, 10) : "",
  );
  setValue("#edit-language", customer.preferredLanguage || "");
  setValue("#edit-communication", customer.communicationPreference || "");
  setValue("#edit-notes", customer.notes || "");
  const notesCount = document.querySelector("#edit-notes-count");
  if (notesCount) notesCount.textContent = String((customer.notes || "").length);

  // These fields come from the actual Customer API. Empty legacy values stay empty.
  setValue("#edit-nationality", customer.nationality || "");
  setValue("#edit-address", customer.address || "");
  for (const [key, suffix] of CUSTOMER_NATIONAL_ADDRESS_FIELDS) {
    setValue(`#edit-${suffix}`, customer[key] || "");
  }
  const formatIndicator = document.querySelector("#edit-customer-form [data-national-address-format]");
  if (formatIndicator) formatIndicator.textContent = customerNationalAddressFormatStatus(getCustomerNationalAddressValues("edit"));
  setValue("#edit-emergency-contact", customer.emergencyContactName || "");
  // The field already displays the +966 country-code picker.
  setValue("#edit-emergency-phone", String(customer.emergencyContactPhone || "").replace(/^\+966/, ""));
  populateCustomerSuspensionForm(
    document.querySelector("#edit-customer-form"),
    customer.automaticSuspension,
  );
}

/**
 * Edit Customer summary: render only fields supported by our current API.
 * The legacy HTML contains demo numbers; they must never appear as real data.
 * Payment Methods are intentionally left unchanged pending its own integration.
 */
function renderEditCustomerOverview(customer, vehicles, vehicleState) {
  const page = document.querySelector(".edit-customer-page");
  if (!page) return;
  const summary = page.querySelector(".edit-sidebar");
  if (!summary) return;

  const rows = [...summary.querySelectorAll(".edit-overview-item")];
  const byLabel = (label) => rows.find((row) =>
    row.querySelector("small")?.textContent?.trim() === label,
  )?.querySelector("b");
  const put = (label, value) => {
    const el = byLabel(label);
    if (el) el.textContent = value == null ? "—" : String(value);
  };
  const formatted = (value) => {
    if (!value) return "—";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "—";
    return new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Riyadh",
      month: "short", day: "numeric", year: "numeric",
    }).format(date);
  };
  put("Customer Since", formatted(customer?.memberSince));
  put("Total Bookings", "—");
  put("Total Spent", "—");
  put("Active Bookings", "—");
  // Payment methods deliberately unchanged, per product requirement.

  const section = [...summary.querySelectorAll(".edit-summary-card")].find(
    (card) => card.querySelector("h3")?.textContent?.trim() === "Registered Vehicles",
  );
  if (!section) return;
  let list = section.querySelector("[data-edit-real-vehicles]");
  if (!list) {
    // Replace static demo empty-state with a dedicated live state container.
    section.querySelector(".edit-empty-state")?.remove();
    list = document.createElement("div");
    list.dataset.editRealVehicles = "true";
    list.className = "edit-live-vehicles";
    list.style.cssText = "display:grid;gap:10px;padding:16px 2px;";
    section.append(list);
  }
  list.replaceChildren();
  const message = (text) => {
    const p = document.createElement("p");
    p.className = "edit-live-vehicles-state";
    p.style.cssText = "margin:12px 0;color:#62758b;text-align:center;font-size:13px;";
    p.textContent = text;
    list.append(p);
  };

  if (!customer) {
    put("Vehicles", "—");
    message("Loading customer records…");
    return;
  }
  if (vehicleState === "restricted") {
    put("Vehicles", "—");
    message("Vehicle details are not available for your account.");
    return;
  }
  if (vehicleState === "failed") {
    put("Vehicles", "—");
    message("Unable to load registered vehicles. Please refresh to retry.");
    return;
  }
  if (!Array.isArray(vehicles)) {
    put("Vehicles", customer.vehicleCount ?? "—");
    message("Loading registered vehicles…");
    return;
  }
  const total = Number.isFinite(Number(customer.vehicleCount))
    ? Number(customer.vehicleCount) : vehicles.length;
  put("Vehicles", total);
  if (!vehicles.length) {
    message(total > 0 ? "Vehicle list is unavailable; count is from the customer record." : "No registered vehicles");
    return;
  }
  // Use textContent, never inject user-controlled vehicle values into HTML.
  vehicles.forEach((vehicle) => {
    const card = document.createElement("article");
    card.className = "edit-live-vehicle-card";
    card.style.cssText = "padding:11px 13px;border:1px solid #e3ebf3;border-radius:10px;background:#fbfdfe;";
    const title = document.createElement("strong");
    title.style.cssText = "display:block;font-size:13px;color:#162838;";
    title.textContent = [vehicle.make, vehicle.model].filter(Boolean).join(" ") || "Vehicle";
    const detail = document.createElement("small");
    detail.style.cssText = "display:block;margin-top:4px;color:#64758b;";
    detail.textContent = vehicle.plateDisplayEnglish || vehicle.normalizedPlate || "Plate not recorded";
    card.append(title, detail);
    list.append(card);
  });
  if (total > vehicles.length) message(`Showing ${vehicles.length} of ${total} vehicles.`);
}

function formatCustomerDetailDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

function formatCustomerDetailDateTime(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function setCustomerDetailText(page, selector, value) {
  const element = page.querySelector(selector);
  if (element)
    element.textContent = value == null || value === "" ? "—" : String(value);
}

function setCustomerDetailCount(page, value) {
  page.querySelectorAll("[data-vehicle-count]").forEach((element) => {
    element.textContent = String(value);
  });
  setCustomerDetailText(page, "[data-overview-vehicles]", value);
}

function createCustomerVehicleCard(vehicle, compact = false) {
  const card = document.createElement("article");
  card.className = compact
    ? "customer-registered-vehicle-item live"
    : "customer-live-vehicle-card";

  const details = document.createElement("div");
  details.className = "customer-live-vehicle-details";

  const title = document.createElement("strong");
  title.textContent =
    [vehicle.make, vehicle.model].filter(Boolean).join(" ") || "Vehicle";
  details.append(title);

  const plate = document.createElement("span");
  plate.textContent =
    vehicle.plateDisplayEnglish ||
    vehicle.normalizedPlate ||
    "Plate unavailable";
  details.append(plate);

  const metadata = document.createElement("p");
  metadata.textContent =
    [
      vehicle.year,
      vehicle.color,
      vehicle.bodyType || vehicle.vehicleType,
      vehicle.parkingTypeLabel,
    ]
      .filter(Boolean)
      .join(" · ") || "Vehicle details unavailable";
  details.append(metadata);

  if (vehicle.isPrimaryForCustomer) {
    const primary = document.createElement("small");
    primary.textContent = "Primary";
    title.append(" ", primary);
  }

  if (compact) {
    const icon = document.createElement("span");
    icon.className = "registered-vehicle-logo";
    icon.innerHTML = '<i class="fa-solid fa-car-side"></i>';
    card.append(icon, details);
  } else {
    const icon = document.createElement("span");
    icon.className = "customer-live-vehicle-icon";
    icon.innerHTML = '<i class="fa-solid fa-car-side"></i>';
    const activity = document.createElement("span");
    activity.className = "customer-live-vehicle-activity";
    activity.textContent = vehicle.status || "—";
    card.append(icon, details, activity);
  }

  return card;
}

function renderCustomerVehicles(customer, vehicles, vehicleError) {
  const page = document.querySelector(".customer-details-page");
  if (!page) return;

  const count = Number.isFinite(Number(customer.vehicleCount))
    ? Number(customer.vehicleCount)
    : vehicles?.length || 0;
  setCustomerDetailCount(page, count);

  const overview = page.querySelector("[data-customer-overview-vehicles]");
  const list = page.querySelector("[data-customer-vehicles-list]");
  const empty = page.querySelector("[data-customer-vehicles-empty]");
  const error = page.querySelector("[data-customer-vehicles-error]");

  [overview, list].forEach((element) => element?.replaceChildren());
  error?.classList.add("hidden");
  empty?.classList.add("hidden");

  if (vehicleError) {
    if (overview) {
      overview.innerHTML =
        '<div class="customer-data-state error"><i class="fa-solid fa-triangle-exclamation"></i><span>Unable to load vehicles.</span></div>';
    }
    error?.classList.remove("hidden");
    return;
  }

  if (!vehicles.length) {
    if (count > 0) {
      if (overview) {
        overview.innerHTML =
          '<div class="customer-data-state error"><i class="fa-solid fa-triangle-exclamation"></i><span>Vehicle records are currently unavailable.</span></div>';
      }
      error?.classList.remove("hidden");
      return;
    }
    if (overview) {
      overview.innerHTML =
        '<div class="customer-data-state empty"><i class="fa-solid fa-car-side"></i><span>No vehicles registered.</span></div>';
    }
    empty?.classList.remove("hidden");
    return;
  }

  vehicles
    .slice(0, 3)
    .forEach((vehicle) =>
      overview?.append(createCustomerVehicleCard(vehicle, true)),
    );
  vehicles.forEach((vehicle) =>
    list?.append(createCustomerVehicleCard(vehicle)),
  );
}

function renderCustomerActivity(customer, vehicles) {
  const page = document.querySelector(".customer-details-page");
  const list = page?.querySelector("[data-customer-recent-activity]");
  if (!page || !list) return;

  const events = [
    customer.createdAt
      ? {
          type: "account",
          title: "Account Created",
          detail: "Customer account created",
          date: customer.createdAt,
        }
      : null,
    ...vehicles.map((vehicle) => ({
      type: "vehicle",
      title: "Vehicle Added",
      detail: [
        vehicle.make,
        vehicle.model,
        vehicle.plateDisplayEnglish || vehicle.normalizedPlate,
      ]
        .filter(Boolean)
        .join(" · "),
      date: vehicle.createdAt,
    })),
  ]
    .filter((event) => event?.date)
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .slice(0, 5);

  list.replaceChildren();
  const activityLog = page.querySelector("[data-customer-activity-log]");
  activityLog?.replaceChildren();
  if (!events.length) {
    const emptyState =
      '<div class="customer-data-state empty"><i class="fa-solid fa-clock-rotate-left"></i><span>No persisted activity available.</span></div>';
    list.innerHTML = emptyState;
    if (activityLog) activityLog.innerHTML = emptyState;
    return;
  }

  const createActivityItem = (event) => {
    const item = document.createElement("div");
    item.className = "customer-activity-item";
    const icon = document.createElement("span");
    icon.className = `customer-activity-icon ${event.type === "vehicle" ? "blue" : "gray"}`;
    icon.innerHTML = `<i class="fa-solid ${event.type === "vehicle" ? "fa-car-side" : "fa-user"}"></i>`;
    const details = document.createElement("div");
    const title = document.createElement("b");
    title.textContent = event.title;
    const description = document.createElement("p");
    description.textContent = event.detail || "—";
    details.append(title, description);
    const time = document.createElement("time");
    time.textContent = formatCustomerDetailDateTime(event.date);
    item.append(icon, details, time);
    return item;
  };

  events.forEach((event) => {
    list.append(createActivityItem(event));
    activityLog?.append(createActivityItem(event));
  });
}

/** Customer bookings are independently authorized and server-filtered by customerId. */
const CUSTOMER_BOOKING_PAGE_SIZE = 100;
const CUSTOMER_BOOKING_MAX = 10000;
const CUSTOMER_BOOKING_OPEN_STATUSES = new Set([
  "CONFIRMED", "VEHICLE_PARKED", "RETURN_REQUESTED",
  "RETRIEVAL_IN_PROGRESS", "READY_FOR_HANDOVER",
]);

async function fetchCustomerBookings(customerId, signal) {
  const base = getCustomerManagementApiBaseUrl().replace(/\/$/, "");
  const all = [];
  let total = null;
  let pages = null;
  for (let page = 1; page <= CUSTOMER_BOOKING_MAX / CUSTOMER_BOOKING_PAGE_SIZE; page++) {
    const query = new URLSearchParams({
      customerId, page: String(page), limit: String(CUSTOMER_BOOKING_PAGE_SIZE),
    });
    const response = await fetch(`${base}/bookings?${query}`, {
      headers: getCustomerManagementAuthHeaders(), signal, cache: "no-store",
    });
    if (!response.ok) {
      const error = new Error("Customer booking history is not available.");
      error.status = response.status;
      throw error;
    }
    const body = await response.json().catch(() => null);
    const data = body?.data ?? body;
    const pagination = data?.pagination;
    if (!Array.isArray(data?.bookings) ||
        !Number.isSafeInteger(pagination?.total) || pagination.total < 0 ||
        !Number.isSafeInteger(pagination?.totalPages) || pagination.totalPages < 1 ||
        pagination.page !== page) {
      throw new Error("Incomplete customer booking API response.");
    }
    if (total === null) {
      total = pagination.total;
      pages = pagination.totalPages;
      if (total > CUSTOMER_BOOKING_MAX || pages !== Math.max(1, Math.ceil(total / CUSTOMER_BOOKING_PAGE_SIZE))) {
        throw new Error("Customer booking history exceeds the safe reporting limit.");
      }
    }
    if (pagination.total !== total || pagination.totalPages !== pages) {
      throw new Error("Customer bookings changed during loading. Refresh to retry.");
    }
    for (const booking of data.bookings) {
      // Fail closed if the server ignores the customerId filter or returns the wrong account.
      if (!booking || !booking.id || booking.customerId !== customerId || !booking.createdAt) {
        throw new Error("Customer booking response contains unexpected records.");
      }
      all.push(booking);
    }
    if (page === pages) {
      if (all.length !== total || new Set(all.map(item => item.id)).size !== total) {
        throw new Error("Incomplete or duplicate customer booking records.");
      }
      return all;
    }
  }
  throw new Error("Customer booking page limit exceeded.");
}

function renderCustomerBookings(bookings, state) {
  const page = document.querySelector(".customer-details-page");
  if (!page) return;
  const message = page.querySelector("[data-customer-booking-message]");
  const note = page.querySelector("[data-booking-unavailable]");
  const list = page.querySelector("[data-customer-booking-list]");
  list?.replaceChildren();
  if (state !== "ready" || !Array.isArray(bookings)) {
    renderUnavailableCustomerBookings();
    if (note) note.textContent = state === "restricted"
      ? "Booking details are not available for your account."
      : state === "loading"
        ? "Loading verified customer booking records…"
        : "Unable to load verified booking history. No totals are shown.";
    if (message) {
      message.hidden = false;
      message.querySelector("h3").textContent = state === "restricted"
        ? "Bookings restricted" : state === "loading" ? "Loading booking history" : "Booking history unavailable";
      message.querySelector("p").textContent = note?.textContent || "Booking history unavailable.";
    }
    if (list) list.hidden = true;
    return;
  }
  const status = (value) => String(value || "").toUpperCase();
  const open = bookings.filter(item => CUSTOMER_BOOKING_OPEN_STATUSES.has(status(item.status))).length;
  const completed = bookings.filter(item => status(item.status) === "COMPLETED").length;
  const cancelled = bookings.filter(item => status(item.status) === "CANCELLED").length;
  const totals = {
    "[data-overview-total-bookings]": bookings.length,
    "[data-overview-active-bookings]": open,
    "[data-booking-count]": bookings.length,
    "[data-booking-total]": bookings.length,
    "[data-booking-completed]": completed,
    "[data-booking-upcoming]": open,
    "[data-booking-cancelled]": cancelled,
  };
  Object.entries(totals).forEach(([selector, value]) => setCustomerDetailText(page, selector, value));
  if (note) note.textContent = "Counts are based on authorized booking records. Payment settlement is not available.";
  if (message) {
    message.hidden = bookings.length > 0;
    message.querySelector("h3").textContent = "No bookings found";
    message.querySelector("p").textContent = "No booking records are associated with this customer.";
  }
  if (list) {
    list.hidden = bookings.length === 0;
    const dateTime = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Riyadh", dateStyle: "medium", timeStyle: "short",
    });
    for (const booking of bookings) {
      const row = document.createElement("article");
      row.className = "customer-live-booking-row";
      const title = document.createElement("strong");
      title.textContent = booking.bookingCode || booking.id;
      const details = document.createElement("span");
      const date = new Date(booking.createdAt);
      const dateLabel = Number.isNaN(date.getTime()) ? "Date unavailable" : dateTime.format(date) + " AST";
      details.textContent = `${dateLabel} · ${booking.location?.name || "Location not recorded"}`;
      const badge = document.createElement("span");
      badge.className = "customer-booking-status";
      badge.textContent = String(booking.status || "Unknown").replaceAll("_", " ");
      row.append(title, details, badge);
      list.append(row);
    }
  }
}

function renderUnavailableCustomerBookings() {
  const page = document.querySelector(".customer-details-page");
  if (!page) return;
  [
    "[data-overview-total-bookings]",
    "[data-overview-active-bookings]",
    "[data-booking-count]",
    "[data-booking-total]",
    "[data-booking-completed]",
    "[data-booking-upcoming]",
    "[data-booking-cancelled]",
  ].forEach((selector) => setCustomerDetailText(page, selector, "—"));
}

function renderComingSoonPaymentMethods() {
  const page = document.querySelector(".customer-details-page");
  if (!page) return;
  setCustomerDetailText(page, "[data-overview-total-spent]", "—");
}

function populateCustomerDetails(customer) {
  const page = document.querySelector(".customer-details-page");
  if (!page) return;

  const name = String(customer.fullName || "Customer");
  const phone = customer.phoneE164
    ? String(customer.phoneE164)
    : customer.phoneNumber
      ? `${customer.phoneCountryCode || "+966"} ${customer.phoneNumber}`
      : "-";
  const email = customer.email || "-";
  const status = String(customer.status || "ACTIVE");
  const type = formatCustomerType(customer.customerType);
  setCustomerDetailText(page, "[data-customer-name]", name);
  setCustomerDetailText(
    page,
    "[data-customer-id]",
    getCurrentCustomerId() || customer.id,
  );
  setCustomerDetailText(page, "[data-customer-type]", type.toUpperCase());
  setCustomerDetailText(
    page,
    "[data-customer-status]",
    status.toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase()),
  );
  setCustomerDetailText(page, "[data-customer-profile-phone]", phone);
  setCustomerDetailText(page, "[data-customer-profile-email]", email);
  setCustomerDetailText(
    page,
    "[data-customer-member-since]",
    formatCustomerDetailDate(customer.memberSince),
  );
  setCustomerDetailText(
    page,
    "[data-customer-last-activity]",
    formatCustomerDetailDateTime(customer.updatedAt),
  );
  setCustomerDetailText(
    page,
    "[data-customer-communication]",
    customer.communicationPreference || "—",
  );
  setCustomerDetailText(
    page,
    "[data-customer-language]",
    customer.preferredLanguage || "—",
  );
  setCustomerDetailText(page, "[data-contact-name]", name);
  setCustomerDetailText(page, "[data-contact-phone]", phone);
  setCustomerDetailText(page, "[data-contact-email]", email);
  setCustomerDetailText(page, "[data-customer-nationality]", customer.nationality || "—");
  setCustomerDetailText(page, "[data-contact-address]", customer.address || "—");
  for (const [key, suffix] of CUSTOMER_NATIONAL_ADDRESS_FIELDS) {
    setCustomerDetailText(page, `[data-national-address-${suffix}]`, customer[key] || "—");
  }
  // No client-controlled verification status; only a trusted provider may confirm one.
  setCustomerDetailText(page, "[data-national-address-status]", "Not verified");
  const emergency = [customer.emergencyContactName, customer.emergencyContactPhone]
    .filter(Boolean).join(" · ");
  setCustomerDetailText(page, "[data-contact-emergency]", emergency || "—");
  setCustomerDetailText(
    page,
    "[data-customer-avatar]",
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0])
      .join("")
      .toUpperCase() || "--",
  );
}

function getEditCustomerFormValues(form) {
  const value = (selector) => form.querySelector(selector)?.value.trim() || "";
  return {
    fullName: value("#edit-full-name"),
    email: value("#edit-email"),
    phoneCountryCode: "+966",
    phoneNumber: value("#edit-phone"),
    customerType: value("#edit-customer-type").toUpperCase(),
    status: value("#edit-status").toUpperCase(),
    memberSince: value("#edit-member-since"),
    preferredLanguage: value("#edit-language"),
    communicationPreference: value("#edit-communication"),
    nationality: value("#edit-nationality"),
    address: value("#edit-address"),
    ...getCustomerNationalAddressValues("edit"),
    emergencyContactName: value("#edit-emergency-contact"),
    emergencyContactPhone: value("#edit-emergency-phone"),
    notes: value("#edit-notes"),
    automaticSuspension: getCustomerSuspensionFormValues(form),
  };
}

function editCustomerValuesForComparison(values) {
  return JSON.stringify(values);
}

function setEditCustomerSaveState(form, dirty, saving = false) {
  const saveButton = form.querySelector("#save-customer-btn");
  if (!saveButton) return;
  saveButton.disabled = saving || !dirty;
  saveButton.innerHTML = saving
    ? '<i class="fa-solid fa-spinner fa-spin"></i> Saving...'
    : '<i class="fa-solid fa-floppy-disk"></i> Save Changes';
}

function customerUpdateErrorMessage(status) {
  if (status === 400)
    return "Please review the customer information and try again.";
  if (status === 401)
    return "Your login session has expired. Please sign in again.";
  if (status === 403)
    return "You do not have permission to edit this customer.";
  if (status === 404) return "Customer not found.";
  if (status === 409) return "Customer contact information already exists.";
  return "Unable to save customer changes. Please try again.";
}

async function handleEditCustomerSubmit(event) {
  event.preventDefault();
  const form = event.currentTarget;
  if (form.dataset.saving === "true") return;

  const displayId = getCurrentCustomerId();
  if (!displayId || getDashboardRoute().name !== "edit-customer") return;
  const customerRecord = resolveCustomerRecord(displayId);
  const databaseId = customerRecord?.databaseId;
  if (!customerRecord || !isCustomerDatabaseId(databaseId)) {
    window.location.hash = "customers";
    return;
  }
  if (!window.hasDashboardPermission?.("customers.edit")) return;
  if (!form.reportValidity()) return;

  const values = getEditCustomerFormValues(form);
  const original = form.dataset.originalCustomerValues || "";
  if (editCustomerValuesForComparison(values) === original) return;

  // Never resubmit an unchanged schedule, especially one already completed.
  const suspensionChanged =
    JSON.stringify(values.automaticSuspension) !==
    (form.dataset.originalSuspensionValues || "");
  let suspensionPayload;
  if (suspensionChanged) {
    try {
      suspensionPayload = buildCustomerSuspensionPayload(form);
    } catch (error) {
      notifyCustomerSuspensionError(error);
      return;
    }
  }

  form.dataset.saving = "true";
  setEditCustomerSaveState(form, true, true);
  const url = `${getCustomerManagementApiBaseUrl()}/customers/${encodeURIComponent(databaseId)}`;
  const { automaticSuspension: _formSuspension, ...customerValues } = values;
  const payload = {
    ...customerValues,
    memberSince: values.memberSince || undefined,
    preferredLanguage: values.preferredLanguage || undefined,
    communicationPreference: values.communicationPreference || undefined,
    notes: values.notes || undefined,
    ...(suspensionChanged ? { automaticSuspension: suspensionPayload } : {}),
  };
  // Do not log customer contact or emergency data to the browser console.
  try {
    const response = await fetch(url, {
      method: "PATCH",
      headers: getCustomerManagementAuthHeaders(),
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      const body = await response.json().catch(() => null);
      const message = Array.isArray(body?.message)
        ? body.message.join(" ")
        : body?.message || body?.error;
      const error = new Error(message || "Customer update failed.");
      error.status = response.status;
      throw error;
    }

    const body = await response.json().catch(() => null);
    const updatedCustomer =
      body?.data?.customer || body?.customer || body?.data;
    mergeUpdatedCustomerIntoList(displayId, updatedCustomer || values);

    form.dataset.originalCustomerValues =
      editCustomerValuesForComparison(values);
    form.dataset.originalSuspensionValues = JSON.stringify(
      values.automaticSuspension,
    );
    form.dataset.saving = "false";
    setEditCustomerSaveState(form, false, false);
    window.showDashboardAlert?.("Customer updated successfully.", {
      title: "Customer updated",
      type: "success",
    });
    window.location.hash = `customer-details?id=${encodeURIComponent(displayId)}`;
  } catch (error) {
    form.dataset.saving = "false";
    setEditCustomerSaveState(form, true, false);
    window.showDashboardAlert?.(
      error?.status === 400 && error?.message && error.message !== "Customer update failed."
        ? error.message
        : customerUpdateErrorMessage(error?.status),
      {
        title: "Unable to save customer",
        type: "error",
      },
    );
  }
}

function mergeUpdatedCustomerIntoList(displayId, customer) {
  const row = [...document.querySelectorAll(".customers-row")].find(
    (item) => item.dataset.customerId === displayId,
  );
  if (!row || !customer) return;

  const setText = (selector, value) => {
    const element = row.querySelector(selector);
    if (element && value !== undefined && value !== null) {
      element.textContent = value;
    }
  };
  setText(".customer-profile b", customer.fullName || "Customer");
  setText(
    ".customer-contact-line:nth-child(1) span",
    customer.phoneNumber
      ? `${customer.phoneCountryCode || "+966"} ${customer.phoneNumber}`
      : "-",
  );
  setText(".customer-contact-line:nth-child(2) span", customer.email || "-");
  setText(".customer-status", formatCustomerStatus(customer.status));
}

function bindEditCustomerActions() {
  const page = document.querySelector(".edit-customer-page");
  if (!page) return;

  const form = page.querySelector("#edit-customer-form");
  if (!form) return;
  bindCustomerSuspensionControls(form);

  if (page.dataset.bound !== "true") {
    page.dataset.bound = "true";

    page
      .querySelector("#back-from-edit-customer")
      ?.addEventListener("click", () => {
        const displayId = getCurrentCustomerId();
        window.location.hash = getCustomerEditReturnRoute(displayId);
      });

    page
      .querySelector("#cancel-edit-customer")
      ?.addEventListener("click", () => {
        const displayId = getCurrentCustomerId();
        window.location.hash = getCustomerEditReturnRoute(displayId);
      });

    const updateDirtyState = () => {
      const values = getEditCustomerFormValues(form);
      const dirty =
        editCustomerValuesForComparison(values) !==
        form.dataset.originalCustomerValues;
      setEditCustomerSaveState(form, dirty, form.dataset.saving === "true");
    };

    form.addEventListener("input", updateDirtyState);
    form.addEventListener("change", updateDirtyState);
    form.addEventListener("submit", handleEditCustomerSubmit);
  }

  const initialValues = getEditCustomerFormValues(form);
  form.dataset.originalCustomerValues = editCustomerValuesForComparison(initialValues);
  form.dataset.originalSuspensionValues = JSON.stringify(
    initialValues.automaticSuspension,
  );
  setEditCustomerSaveState(form, false);
}

function bindCustomerDetailsActions() {
  const backButton = document.querySelector("#back-to-customers-list");
  if (backButton && backButton.dataset.bound !== "true") {
    backButton.dataset.bound = "true";
    backButton.addEventListener("click", () => {
      window.location.hash = "customers";
    });
  }

  const editButton = document.querySelector("#open-edit-customer");
  if (!editButton || editButton.dataset.bound === "true") return;
  editButton.dataset.bound = "true";
  editButton.addEventListener("click", () => {
    if (!window.hasDashboardPermission?.("customers.edit")) return;
    const customerId = getCurrentCustomerId();
    if (customerId) {
      navigateToCustomerEdit(customerId);
    }
  });
}

function bindCustomerDetailsTabs() {
  const view = document.querySelector("#customer-details-view");

  if (!view) return;

  const tabs = view.querySelectorAll(".customer-details-tab");

  const panels = view.querySelectorAll(".customer-tab-panel");

  if (!tabs.length || !panels.length) {
    return;
  }

  tabs.forEach((tab) => {
    if (tab.dataset.bound === "true") {
      return;
    }

    tab.dataset.bound = "true";

    tab.addEventListener("click", () => {
      const target = tab.dataset.customerTab;

      tabs.forEach((item) => {
        const isActive = item.dataset.customerTab === target;

        item.classList.toggle("active", isActive);

        item.setAttribute("aria-selected", String(isActive));
      });

      panels.forEach((panel) => {
        const isActive = panel.dataset.customerPanel === target;

        panel.classList.toggle("active", isActive);

        panel.classList.toggle("hidden", !isActive);
      });
    });
  });

  view.querySelectorAll("[data-customer-tab-target]").forEach((button) => {
    if (button.dataset.bound === "true") return;
    button.dataset.bound = "true";
    button.addEventListener("click", () => {
      view
        .querySelector(
          `.customer-details-tab[data-customer-tab="${button.dataset.customerTabTarget}"]`,
        )
        ?.click();
    });
  });
}

async function loadCustomerCreateBookingPage() {
  const container = document.querySelector(
    "#customer-create-booking-container",
  );

  if (!container) return;

  if (container.dataset.loaded !== "true") {
    const response = await fetch("/pages/customer-create-booking.html");

    if (!response.ok) {
      throw new Error(`Unable to load Create Booking page: ${response.status}`);
    }

    container.innerHTML = await response.text();
    container.dataset.loaded = "true";
  }

  bindCustomerCreateBookingForm();
}

function bindCustomerCreateBookingForm() {
  const page = document.querySelector(".customer-create-booking-page");

  if (!page || page.dataset.bound === "true") return;

  page.dataset.bound = "true";

  const location = page.querySelector("#booking-location");
  const zone = page.querySelector("#booking-zone");
  const entryDate = page.querySelector("#booking-entry-date");
  const entryTime = page.querySelector("#booking-entry-time");
  const exitDate = page.querySelector("#booking-exit-date");
  const exitTime = page.querySelector("#booking-exit-time");
  const vehicle = page.querySelector("#booking-vehicle");

  const parkingRate = page.querySelector("#bookingRate");
  const bookingAmount = page.querySelector("#bookingAmount");
  const paymentMethod = page.querySelector("#paymentMethod");
  const paidArrival = page.querySelector("#paidArrival");
  const bookingNotes = page.querySelector("#booking-notes");
  const bookingNotesCount = page.querySelector("#booking-notes-count");

  const successModal = document.querySelector("#booking-success-modal");

  const createdBookingId = document.querySelector("#created-booking-id");

  const successVehicle = document.querySelector("#success-booking-vehicle");

  const successLocation = document.querySelector("#success-booking-location");

  const successAmount = document.querySelector("#success-booking-amount");

  const bookingTypeButtons = [...page.querySelectorAll(".booking-type-card")];

  let selectedBookingType = "Single Entry";

  function setSummaryText(selector, value) {
    const element = page.querySelector(selector);

    if (element) {
      element.textContent = value;
    }
  }

  function formatBookingDate(dateValue, timeValue) {
    if (!dateValue && !timeValue) return "-";

    let formattedDate = dateValue || "";
    let formattedTime = timeValue || "";

    if (dateValue) {
      const date = new Date(`${dateValue}T00:00:00`);

      if (!Number.isNaN(date.getTime())) {
        formattedDate = new Intl.DateTimeFormat("en-GB", {
          day: "2-digit",
          month: "short",
          year: "numeric",
        }).format(date);
      }
    }

    if (timeValue) {
      const [hours, minutes] = timeValue.split(":");
      const date = new Date();

      date.setHours(Number(hours), Number(minutes), 0, 0);

      formattedTime = new Intl.DateTimeFormat("en-US", {
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      }).format(date);
    }

    return [formattedDate, formattedTime].filter(Boolean).join(", ");
  }

  function updateBookingAmount() {
    const rate = parkingRate?.value || "";

    const amountMap = {
      Hourly: "25.00",
      Daily: "120.00",
      Weekly: "650.00",
      Monthly: "2200.00",
    };

    const amount = amountMap[rate] || "0.00";

    if (bookingAmount) {
      bookingAmount.value = amount;
    }

    setSummaryText("#booking-summary-amount", `SAR ${amount}`);
  }

  function updateBookingSummary() {
    const locationText =
      location?.selectedOptions?.[0]?.textContent?.trim() || "-";

    const zoneText = zone?.selectedOptions?.[0]?.textContent?.trim() || "-";

    const vehicleText =
      vehicle?.selectedOptions?.[0]?.textContent?.trim() || "-";

    setSummaryText(
      "#booking-summary-location",
      location?.value ? locationText : "-",
    );

    setSummaryText("#booking-summary-zone", zone?.value ? zoneText : "-");

    setSummaryText("#booking-summary-type", selectedBookingType);

    setSummaryText(
      "#booking-summary-entry",
      formatBookingDate(entryDate?.value, entryTime?.value),
    );

    setSummaryText(
      "#booking-summary-exit",
      formatBookingDate(exitDate?.value, exitTime?.value),
    );

    setSummaryText("#booking-summary-vehicle", vehicleText);

    updateBookingAmount();
  }

  /* ADD MODAL FUNCTIONS HERE */

  function closeBookingSuccessModal() {
    successModal?.classList.add("hidden");
    document.body.classList.remove("booking-modal-open");
  }

  function openBookingSuccessModal(bookingId) {
    if (!successModal) return;

    if (createdBookingId) {
      createdBookingId.textContent = bookingId;
    }

    if (successVehicle) {
      successVehicle.textContent =
        vehicle?.selectedOptions?.[0]?.textContent?.trim() || "Not selected";
    }

    if (successLocation) {
      successLocation.textContent =
        location?.selectedOptions?.[0]?.textContent?.trim() || "Not selected";
    }

    if (successAmount) {
      successAmount.textContent = `SAR ${bookingAmount?.value || "0.00"}`;
    }

    successModal.classList.remove("hidden");
    document.body.classList.add("booking-modal-open");
  }
  bookingTypeButtons.forEach((button) => {
    button.addEventListener("click", () => {
      bookingTypeButtons.forEach((item) => {
        item.classList.toggle("active", item === button);
      });

      selectedBookingType =
        button.dataset.bookingType === "multiple"
          ? "Multiple Entry"
          : "Single Entry";

      updateBookingSummary();
    });
  });

  document
    .querySelector("#close-booking-success")
    ?.addEventListener("click", closeBookingSuccessModal);

  document
    .querySelector(".booking-success-backdrop")
    ?.addEventListener("click", closeBookingSuccessModal);

  document
    .querySelector("#copy-created-booking-id")
    ?.addEventListener("click", async () => {
      const bookingId = createdBookingId?.textContent?.trim();

      if (!bookingId) return;

      const copyButton = document.querySelector("#copy-created-booking-id");

      const icon = copyButton?.querySelector("i");

      function showCopiedState() {
        icon?.classList.remove("fa-copy");
        icon?.classList.add("fa-check");

        copyButton?.classList.add("copied");
        copyButton?.setAttribute("aria-label", "Booking ID copied");

        setTimeout(() => {
          icon?.classList.remove("fa-check");
          icon?.classList.add("fa-copy");

          copyButton?.classList.remove("copied");
          copyButton?.setAttribute("aria-label", "Copy booking ID");
        }, 1400);
      }

      function copyWithFallback(text) {
        const textarea = document.createElement("textarea");

        textarea.value = text;
        textarea.setAttribute("readonly", "");
        textarea.style.position = "fixed";
        textarea.style.left = "-9999px";
        textarea.style.top = "0";

        document.body.appendChild(textarea);

        textarea.focus();
        textarea.select();
        textarea.setSelectionRange(0, textarea.value.length);

        const copied = document.execCommand("copy");

        textarea.remove();

        return copied;
      }

      try {
        let copied = false;

        if (navigator.clipboard && window.isSecureContext) {
          await navigator.clipboard.writeText(bookingId);
          copied = true;
        } else {
          copied = copyWithFallback(bookingId);
        }

        if (!copied) {
          throw new Error("Browser rejected copy operation");
        }

        showCopiedState();
      } catch (error) {
        console.error("Unable to copy booking ID:", error);

        const manualCopy = window.prompt("Copy this Booking ID:", bookingId);

        if (manualCopy !== null) {
          showCopiedState();
        }
      }
    });

  document
    .querySelector("#create-another-booking")
    ?.addEventListener("click", () => {
      closeBookingSuccessModal();

      page
        .querySelector(
          "#booking-information-card input, #booking-information-card select",
        )
        ?.focus();
    });

  document
    .querySelector("#view-created-booking")
    ?.addEventListener("click", () => {
      closeBookingSuccessModal();

      window.location.hash = getCustomerDetailsRouteHash("bookings");

      setTimeout(() => {
        document
          .querySelector('.customer-details-tab[data-customer-tab="bookings"]')
          ?.click();
      }, 150);
    });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !successModal?.classList.contains("hidden")) {
      closeBookingSuccessModal();
    }
  });
  /* Notes counter */
  bookingNotes?.addEventListener("input", () => {
    if (bookingNotesCount) {
      bookingNotesCount.textContent = String(bookingNotes.value.length);
    }
  });

  if (bookingNotesCount) {
    bookingNotesCount.textContent = String(bookingNotes?.value.length || 0);
  }

  /* General field listeners */

  [
    location,
    zone,
    entryDate,
    entryTime,
    exitDate,
    exitTime,
    vehicle,
    parkingRate,
    paymentMethod,
    paidArrival,
  ].forEach((field) => {
    field?.addEventListener("change", updateBookingSummary);
    field?.addEventListener("input", updateBookingSummary);
  });

  page.querySelector("#booking-add-vehicle")?.addEventListener("click", () => {
    const customerId = getCurrentCustomerId();
    if (!customerId) return;
    window.location.hash = `customer-add-vehicle?id=${encodeURIComponent(customerId)}`;
  });

  page
    .querySelector("#back-to-customer-bookings")
    ?.addEventListener("click", openCustomerBookingsTab);

  page
    .querySelector("#cancel-customer-booking")
    ?.addEventListener("click", openCustomerBookingsTab);

  page
    .querySelector(".booking-footer-actions .btn-secondary")
    ?.addEventListener("click", openCustomerBookingsTab);

  page
    .querySelector("#create-customer-booking-submit")
    ?.addEventListener("click", (event) => {
      event.preventDefault();

      const requiredFields = [
        location,
        zone,
        entryDate,
        entryTime,
        exitDate,
        exitTime,
        vehicle,
        parkingRate,
        paymentMethod,
      ];

      const firstEmptyField = requiredFields.find((field) => !field?.value);

      if (firstEmptyField) {
        firstEmptyField.focus();
        return;
      }

      const entryDateTime = new Date(`${entryDate.value}T${entryTime.value}`);

      const exitDateTime = new Date(`${exitDate.value}T${exitTime.value}`);

      if (exitDateTime <= entryDateTime) {
        exitDate.focus();
        alert("Exit date and time must be after entry date and time.");
        return;
      }
      // console.log("Create booking");
      const bookingId = generateUniqueBookingId();

      console.log("Booking created:", bookingId);

      openBookingSuccessModal(bookingId);
    });

  updateBookingSummary();
}

function openCustomerBookingsTab() {
  window.location.hash = getCustomerDetailsRouteHash("bookings");

  setTimeout(() => {
    document
      .querySelector('.customer-details-tab[data-customer-tab="bookings"]')
      ?.click();
  }, 150);
}

async function loadCustomerAddVehiclePage() {
  const container = document.querySelector("#customer-add-vehicle-container");

  if (!container) return;

  if (container.dataset.loaded !== "true") {
    const response = await fetch("/pages/customer-add-vehicle.html");

    if (!response.ok) {
      throw new Error(`Unable to load Add Vehicle page: ${response.status}`);
    }

    container.innerHTML = await response.text();
    container.dataset.loaded = "true";
  }

  bindCustomerAddVehicleForm();
  resetCustomerAddVehicleForm();
}

function bindCustomerAddVehicleForm() {
  const page = document.querySelector(".customer-add-vehicle-page");
  if (!page) return;

  if (page.dataset.vehicleFormBound === "true") {
    page.refreshVehiclePreview?.();
    return;
  }

  page.dataset.vehicleFormBound = "true";

  const form = page.querySelector("#customer-add-vehicle-form");

  const vehicleType = page.querySelector("#vehicle-type");
  const vehicleMake = page.querySelector("#vehicle-make");
  const vehicleModel = page.querySelector("#vehicle-model");
  const vehicleYear = page.querySelector("#vehicle-year");
  const vehicleColor = page.querySelector("#vehicle-color");
  const vehicleBody = page.querySelector("#vehicle-body");
  const vehicleCountry = page.querySelector("#vehicle-country");
  const primaryVehicle = page.querySelector("#vehicle-primary");

  const vehicleVin = page.querySelector("#vehicle-vin");

  const vehicleEngineNumber = page.querySelector("#vehicle-engine-number");

  const vehicleMileage = page.querySelector("#vehicle-mileage");

  const vehicleNotes = page.querySelector("#vehicle-notes");

  const saveVehicleButton = page.querySelector("#save-customer-vehicle");

  const digitInputs = [...page.querySelectorAll(".vehicle-plate-digit")];

  const letterSelects = [...page.querySelectorAll(".vehicle-plate-letter")];

  const digitMap = {
    0: "٠",
    1: "١",
    2: "٢",
    3: "٣",
    4: "٤",
    5: "٥",
    6: "٦",
    7: "٧",
    8: "٨",
    9: "٩",
  };

  const letterMap = {
    A: "ا",
    B: "ب",
    D: "د",
    E: "ع",
    G: "ق",
    H: "هـ",
    J: "ح",
    K: "ك",
    L: "ل",
    N: "ن",
    R: "ر",
    S: "س",
    T: "ط",
    U: "و",
    V: "ى",
    X: "ص",
    Z: "م",
  };

  function setPreviewText(selector, value) {
    const element = page.querySelector(selector);

    if (element) {
      element.textContent = value;
    }
  }

  function getEnglishPlateNumber() {
    return digitInputs.map((input) => input.value.trim()).join("");
  }

  function getEnglishPlateLetters() {
    return letterSelects.map((select) => select.value || "A");
  }

  function getArabicPlateNumber(englishNumber) {
    return [...englishNumber].map((digit) => digitMap[digit] || digit).join("");
  }

  function getArabicPlateLetters(englishLetters) {
    return englishLetters.map((letter) => letterMap[letter] || letter);
  }

  function updateDigitValidation(input) {
    const field = input.closest(".plate-field");
    const status = field?.querySelector(".plate-status-icon");
    const icon = status?.querySelector("i");

    if (!field || !status || !icon) return;

    const isValid = /^[0-9]$/.test(input.value.trim());

    field.classList.toggle("valid", isValid);
    field.classList.toggle("invalid", !isValid);

    status.classList.toggle("valid", isValid);
    status.classList.toggle("invalid", !isValid);

    icon.classList.toggle("fa-check", isValid);
    icon.classList.toggle("fa-xmark", !isValid);

    input.setAttribute("aria-invalid", String(!isValid));
  }

  function updateVehiclePreview() {
    const englishNumber = getEnglishPlateNumber();
    const englishLetters = getEnglishPlateLetters();

    const arabicNumber = getArabicPlateNumber(englishNumber);
    const arabicLetters = getArabicPlateLetters(englishLetters);

    const previewEnglishNumber =
      englishNumber.length === 4 ? englishNumber : "----";

    const previewArabicNumber =
      arabicNumber.length === 4 ? arabicNumber : "ــــ";

    setPreviewText(
      "#preview-vehicle-type",
      vehicleType?.value || "Not selected",
    );

    const makeModel = [
      vehicleMake?.value || "",
      vehicleModel?.value.trim() || "",
    ]
      .filter(Boolean)
      .join(" ");

    setPreviewText("#preview-make-model", makeModel || "Not selected");

    setPreviewText("#preview-year", vehicleYear?.value || "Not selected");

    setPreviewText("#preview-color", vehicleColor?.value || "Not selected");

    setPreviewText("#preview-body-type", vehicleBody?.value || "Not selected");

    const countryText =
      vehicleCountry?.selectedOptions?.[0]?.textContent
        ?.replace(/\s*\(\+966\)\s*/g, "")
        .trim() || "Saudi Arabia";

    setPreviewText("#preview-plate-country", countryText);

    setPreviewText("#preview-english-number", previewEnglishNumber);

    setPreviewText("#preview-arabic-number", previewArabicNumber);

    setPreviewText("#preview-english-letters", englishLetters.join(" "));

    setPreviewText("#preview-arabic-letters", arabicLetters.join(" "));

    setPreviewText(
      "#preview-summary-english",
      `${previewEnglishNumber} ${englishLetters.join(" ")}`,
    );

    setPreviewText(
      "#preview-summary-arabic",
      `${previewArabicNumber} ${arabicLetters.join(" ")}`,
    );

    const primaryStatus = page.querySelector("#preview-primary-status");

    if (primaryStatus) {
      const isPrimary = Boolean(primaryVehicle?.checked);

      primaryStatus.textContent = isPrimary ? "Yes" : "No";
      primaryStatus.classList.toggle("active", isPrimary);
      primaryStatus.classList.toggle("inactive", !isPrimary);
    }
  }

  digitInputs.forEach((input, index) => {
    input.addEventListener("input", () => {
      input.value = input.value.replace(/\D/g, "").slice(0, 1);

      updateDigitValidation(input);
      updateVehiclePreview();

      if (input.value && digitInputs[index + 1]) {
        digitInputs[index + 1].focus();
        digitInputs[index + 1].select();
      }
    });

    input.addEventListener("keydown", (event) => {
      if (event.key !== "Backspace") return;

      event.preventDefault();

      if (input.value) {
        input.value = "";
        updateDigitValidation(input);
        updateVehiclePreview();
        return;
      }

      const previousInput = digitInputs[index - 1];

      if (previousInput) {
        previousInput.value = "";
        updateDigitValidation(previousInput);
        updateVehiclePreview();
        previousInput.focus();
        previousInput.select();
      }
    });

    input.addEventListener("paste", (event) => {
      event.preventDefault();

      const pastedValue = event.clipboardData
        ?.getData("text")
        .replace(/\D/g, "")
        .slice(0, 4);

      if (!pastedValue) return;

      [...pastedValue].forEach((digit, pastedIndex) => {
        const targetInput = digitInputs[pastedIndex];

        if (!targetInput) return;

        targetInput.value = digit;
        updateDigitValidation(targetInput);
      });

      const nextEmptyInput = digitInputs.find((item) => !item.value);

      if (nextEmptyInput) {
        nextEmptyInput.focus();
      } else {
        digitInputs[digitInputs.length - 1]?.focus();
      }

      updateVehiclePreview();
    });

    updateDigitValidation(input);
  });

  letterSelects.forEach((select) => {
    select.addEventListener("change", updateVehiclePreview);
  });

  [
    vehicleType,
    vehicleMake,
    vehicleYear,
    vehicleColor,
    vehicleBody,
    vehicleCountry,
    primaryVehicle,
  ].forEach((field) => {
    field?.addEventListener("change", updateVehiclePreview);
  });

  vehicleModel?.addEventListener("input", updateVehiclePreview);
  vehicleModel?.addEventListener("change", updateVehiclePreview);

  page
    .querySelector("#back-to-customer-vehicles")
    ?.addEventListener("click", openCustomerVehiclesTab);

  page
    .querySelector("#cancel-customer-vehicle")
    ?.addEventListener("click", openCustomerVehiclesTab);

  form?.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (saveVehicleButton?.disabled) {
      return;
    }

    const allDigitsValid = digitInputs.every((input) =>
      /^[0-9]$/.test(input.value.trim()),
    );

    if (!allDigitsValid) {
      digitInputs.forEach(updateDigitValidation);

      digitInputs.find((input) => !/^[0-9]$/.test(input.value.trim()))?.focus();

      return;
    }

    if (!form.checkValidity()) {
      form.reportValidity();
      return;
    }

    const plateNumberEnglish = getEnglishPlateNumber();

    const plateLettersEnglish = getEnglishPlateLetters().join("").toUpperCase();

    if (!/^[ABDEGHJKLNRSTUVXZ]{3}$/.test(plateLettersEnglish)) {
      throw new Error("Please select three valid plate letters.");
    }

    const mileageValue = vehicleMileage?.value?.trim() || "";

    const vinValue = String(vehicleVin?.value || "")
      .trim()
      .toUpperCase();

    if (vinValue && !/^[A-HJ-NPR-Z0-9]{17}$/.test(vinValue)) {
      vehicleVin.focus();

      vehicleVin.setCustomValidity(
        "VIN must contain exactly 17 valid characters.",
      );

      vehicleVin.reportValidity();

      return;
    }

    vehicleVin?.setCustomValidity("");

    const currentCustomerId = getCurrentCustomerId();

    const validCustomerId =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        currentCustomerId || "",
      )
        ? currentCustomerId
        : undefined;

    const payload = {
      customerId: validCustomerId,

      vehicleType: vehicleType?.value?.trim() || "",

      make: vehicleMake?.value?.trim() || "",

      model: vehicleModel?.value?.trim() || "",

      year: Number(vehicleYear?.value),

      color: vehicleColor?.value?.trim() || "",

      bodyType: vehicleBody?.value?.trim() || undefined,

      plateCountryCode: "SA",

      plateNumberEnglish,

      plateLettersEnglish,

      vin: vinValue || undefined,

      engineNumber: vehicleEngineNumber?.value?.trim() || undefined,

      mileage: mileageValue === "" ? undefined : Number(mileageValue),

      notes: vehicleNotes?.value?.trim() || undefined,

      /*
       * The backend requires a customer ID
       * before a vehicle can be marked as the
       * customer's primary vehicle.
       */
      isPrimaryForCustomer: Boolean(validCustomerId && primaryVehicle?.checked),

      status: "ACTIVE",
    };

    const originalButtonContent = saveVehicleButton?.innerHTML;

    try {
      if (saveVehicleButton) {
        saveVehicleButton.disabled = true;

        saveVehicleButton.innerHTML = `
          <i class="fa-solid fa-spinner fa-spin"></i>
          Saving Vehicle...
        `;
      }

      const response = await fetch(
        `${getCustomerVehicleApiBaseUrl()}/vehicles`,
        {
          method: "POST",
          headers: getCustomerVehicleAuthHeaders(),
          body: JSON.stringify(payload),
        },
      );

      const result = await parseCustomerVehicleResponse(response);

      const createdVehicle = result?.vehicle || result;

      if (!createdVehicle?.id) {
        throw new Error("The API did not return the created vehicle.");
      }

      sessionStorage.setItem("lastCreatedVehicleId", createdVehicle.id);

      console.log("Vehicle created:", createdVehicle);

      resetCustomerAddVehicleForm();

      showCustomerVehicleCreatedModal(createdVehicle);
    } catch (error) {
      console.error("Unable to create vehicle:", error);

      showCustomerVehicleError(error?.message || "Unable to save the vehicle.");
    } finally {
      if (saveVehicleButton) {
        saveVehicleButton.disabled = false;

        saveVehicleButton.innerHTML = originalButtonContent;
      }
    }
  });

  page.refreshVehiclePreview = updateVehiclePreview;

  updateVehiclePreview();
}

function showCustomerVehicleCreatedModal(vehicle) {
  // Vehicle creation is a simple acknowledgement: use the shared toast and
  // include the identifying plate, rather than covering the whole dashboard.
  if (typeof window.showParkinToast === "function") {
    const plate = vehicle.plateDisplayEnglish || [
      vehicle.plateNumberEnglish,
      String(vehicle.plateLettersEnglish || "").split("").join(" "),
    ].filter(Boolean).join(" ");
    const summary = [plate, vehicle.make, vehicle.model, vehicle.year]
      .filter(Boolean).join(" · ");
    window.showParkinToast(summary || "Vehicle is ready for assignment.", {
      type: "success",
      title: "Vehicle created successfully",
    });
    return;
  }
  document.querySelector("#customer-vehicle-result-modal")?.remove();

  const modal = document.createElement("div");

  modal.id = "customer-vehicle-result-modal";

  modal.className = "customer-vehicle-result-modal";

  const plate =
    vehicle.plateDisplayEnglish ||
    [
      vehicle.plateNumberEnglish,
      String(vehicle.plateLettersEnglish || "")
        .split("")
        .join(" "),
    ]
      .filter(Boolean)
      .join(" ");

  modal.innerHTML = `
    <div
      class="customer-vehicle-result-backdrop"
      data-close-vehicle-result
    ></div>

    <section
      class="customer-vehicle-result-card"
      role="dialog"
      aria-modal="true"
    >
      <div class="customer-vehicle-result-icon success">
        <i class="fa-solid fa-check"></i>
      </div>

      <h2>Vehicle Created Successfully</h2>

      <p>
        The vehicle has been saved and is now
        available in the driver assignment list.
      </p>

      <div class="customer-vehicle-result-details">
        <strong>${escapeCustomerVehicleHtml(plate)}</strong>

        <span>
          ${escapeCustomerVehicleHtml(
            [vehicle.make, vehicle.model, vehicle.year]
              .filter(Boolean)
              .join(" "),
          )}
        </span>
      </div>

      <button
        type="button"
        data-close-vehicle-result
      >
        Done
      </button>
    </section>
  `;

  document.body.appendChild(modal);

  modal.querySelectorAll("[data-close-vehicle-result]").forEach((button) => {
    button.addEventListener("click", () => {
      modal.remove();
    });
  });
}

function showCustomerVehicleError(message) {
  if (typeof window.showParkinToast === "function") {
    window.showParkinToast(message, { type: "error", title: "Unable to save vehicle" });
    return;
  }
  document.querySelector("#customer-vehicle-error-modal")?.remove();

  const modal = document.createElement("div");

  modal.id = "customer-vehicle-error-modal";

  modal.className = "customer-vehicle-result-modal";

  modal.innerHTML = `
    <div
      class="customer-vehicle-result-backdrop"
      data-close-vehicle-error
    ></div>

    <section
      class="customer-vehicle-result-card"
      role="alertdialog"
      aria-modal="true"
    >
      <div class="customer-vehicle-result-icon error">
        <i class="fa-solid fa-triangle-exclamation"></i>
      </div>

      <h2>Unable to Save Vehicle</h2>

      <p>
        ${escapeCustomerVehicleHtml(message)}
      </p>

      <button
        type="button"
        data-close-vehicle-error
      >
        Okay
      </button>
    </section>
  `;

  document.body.appendChild(modal);

  modal.querySelectorAll("[data-close-vehicle-error]").forEach((button) => {
    button.addEventListener("click", () => {
      modal.remove();
    });
  });
}

function escapeCustomerVehicleHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function resetCustomerAddVehicleForm() {
  const page = document.querySelector(".customer-add-vehicle-page");
  const form = page?.querySelector("#customer-add-vehicle-form");

  if (!page || !form) return;

  form.reset();

  // Force every dropdown to its first option.
  page.querySelectorAll("select").forEach((select) => {
    select.selectedIndex = 0;
  });

  // Clear all plate digits and restore invalid state.
  page.querySelectorAll(".vehicle-plate-digit").forEach((input) => {
    input.value = "";
    input.setAttribute("aria-invalid", "true");

    const field = input.closest(".plate-field");
    const status = field?.querySelector(".plate-status-icon");
    const icon = status?.querySelector("i");

    field?.classList.remove("valid");
    field?.classList.add("invalid");

    status?.classList.remove("valid");
    status?.classList.add("invalid");

    icon?.classList.remove("fa-check");
    icon?.classList.add("fa-xmark");
  });

  // Clear normal text fields.
  [
    "#vehicle-model",
    "#vehicle-vin",
    "#vehicle-engine-number",
    "#vehicle-mileage",
    "#vehicle-notes",
  ].forEach((selector) => {
    const field = page.querySelector(selector);

    if (field) {
      field.value = "";
    }
  });

  // Keep this checked if it should be the default.
  const primaryVehicle = page.querySelector("#vehicle-primary");

  if (primaryVehicle) {
    primaryVehicle.checked = true;
  }

  page.refreshVehiclePreview?.();
}

function openCustomerVehiclesTab() {
  window.location.hash = getCustomerDetailsRouteHash("vehicles");

  setTimeout(() => {
    document
      .querySelector('.customer-details-tab[data-customer-tab="vehicles"]')
      ?.click();
  }, 150);
}

function bindCustomerBookingActions() {
  const createBookingButton = document.querySelector(
    "#create-customer-booking",
  );

  if (!createBookingButton || createBookingButton.dataset.bound === "true") {
    return;
  }

  createBookingButton.dataset.bound = "true";

  createBookingButton.addEventListener("click", () => {
    if (!window.hasDashboardPermission?.("bookings.create")) return;
    const customerId = getCurrentCustomerId();
    if (!customerId) return;
    window.location.hash = `customer-create-booking?id=${encodeURIComponent(customerId)}`;
  });
}

function generateUniqueBookingId() {
  const date = new Date();

  const datePart = [
    String(date.getFullYear()).slice(-2),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("");

  const randomPart = Math.floor(1000 + Math.random() * 9000);

  return `SWG-${datePart}-${randomPart}`;
}

function bindCustomerBookingsList() {
  const panel = document.querySelector('[data-customer-panel="bookings"]');

  if (!panel || panel.dataset.bookingsBound === "true") return;

  panel.dataset.bookingsBound = "true";

  const searchInput = panel.querySelector("#customer-bookings-search");

  const statusFilter = panel.querySelector("#customer-bookings-status-filter");

  const locationFilter = panel.querySelector(
    "#customer-bookings-location-filter",
  );

  const rows = [
    ...panel.querySelectorAll(
      ".customer-booking-row:not(.customer-booking-head)",
    ),
  ];

  const table = panel.querySelector(".customer-bookings-table-scroll");

  const noResults = panel.querySelector("#customer-bookings-no-results");

  const resultCount = panel.querySelector("#customer-bookings-result-count");

  function filterBookings() {
    const searchValue = searchInput?.value.trim().toLowerCase() || "";

    const statusValue = statusFilter?.value || "all";
    const locationValue = locationFilter?.value || "all";

    let visibleCount = 0;

    rows.forEach((row) => {
      const rowText = row.textContent.toLowerCase();
      const rowStatus = row.dataset.bookingStatus;
      const rowLocation = row.dataset.bookingLocation;

      const matchesSearch = !searchValue || rowText.includes(searchValue);

      const matchesStatus = statusValue === "all" || rowStatus === statusValue;

      const matchesLocation =
        locationValue === "all" || rowLocation === locationValue;

      const visible = matchesSearch && matchesStatus && matchesLocation;

      row.classList.toggle("hidden", !visible);

      if (visible) {
        visibleCount += 1;
      }
    });

    table?.classList.toggle("hidden", visibleCount === 0);
    noResults?.classList.toggle("hidden", visibleCount !== 0);

    if (resultCount) {
      resultCount.textContent =
        visibleCount === 0
          ? "No bookings found"
          : `Showing 1 to ${visibleCount} of 24 bookings`;
    }
  }

  searchInput?.addEventListener("input", filterBookings);
  statusFilter?.addEventListener("change", filterBookings);
  locationFilter?.addEventListener("change", filterBookings);

  panel
    .querySelector("#add-new-customer-booking")
    ?.addEventListener("click", () => {
      const customerId = getCurrentCustomerId();
      if (!customerId) return;
      window.location.hash = `customer-create-booking?id=${encodeURIComponent(customerId)}`;
    });

  const actionButtons = panel.querySelectorAll(".customer-booking-more-btn");

  actionButtons.forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();

      const cell = button.closest(".customer-booking-actions-cell");

      const menu = cell?.querySelector(".customer-booking-actions-menu");

      if (!menu) return;

      panel
        .querySelectorAll(".customer-booking-actions-menu")
        .forEach((item) => {
          if (item !== menu) {
            item.classList.add("hidden");
          }
        });

      const shouldOpen = menu.classList.contains("hidden");

      if (shouldOpen) {
        const rect = button.getBoundingClientRect();

        menu.style.top = `${rect.bottom + 7}px`;
        menu.style.left = `${Math.max(12, rect.right - 190)}px`;
      }

      menu.classList.toggle("hidden");
      button.setAttribute("aria-expanded", String(shouldOpen));
    });
  });

  panel
    .querySelectorAll(".customer-booking-actions-menu button")
    .forEach((button) => {
      button.addEventListener("click", () => {
        const action = button.dataset.bookingAction;
        const bookingId = button.dataset.bookingId;

        panel
          .querySelectorAll(".customer-booking-actions-menu")
          .forEach((menu) => {
            menu.classList.add("hidden");
          });

        if (action === "view") {
          loadCustomerBookingDetailsPage(bookingId);
        }

        if (action === "edit") {
          loadCustomerEditBookingPage(bookingId);
        }

        if (action === "cancel") {
          openCancelBookingModal(bookingId);
        }

        if (action === "receipt") {
          openPrintableBookingReceipt(bookingId);
        }
      });
    });

  document.addEventListener("click", () => {
    panel.querySelectorAll(".customer-booking-actions-menu").forEach((menu) => {
      menu.classList.add("hidden");
    });

    actionButtons.forEach((button) => {
      button.setAttribute("aria-expanded", "false");
    });
  });

  panel.querySelectorAll(".customer-booking-id button").forEach((button) => {
    button.addEventListener("click", () => {
      loadCustomerBookingDetailsPage(button.dataset.bookingId);
    });
  });

  applyBookingActionPermissions(panel);

  filterBookings();
}

function applyBookingActionPermissions(scope = document) {
  window.applyDashboardPermissionVisibility?.(scope);
}

function bindCustomerPaymentMethodActions() {
  const panel = document.querySelector(
    '[data-customer-panel="payment-methods"]',
  );

  if (!panel || panel.dataset.paymentMethodsBound === "true") {
    return;
  }

  panel.dataset.paymentMethodsBound = "true";

  panel
    .querySelector("#add-customer-payment-method")
    ?.addEventListener("click", () => {
      window.location.hash = "customer-add-payment-method";
    });

  const defaultButtons = [...panel.querySelectorAll(".payment-default-btn")];

  defaultButtons.forEach((button) => {
    button.addEventListener("click", () => {
      defaultButtons.forEach((item) => {
        item.classList.remove("active");
        item.dataset.paymentDefault = "false";

        item.innerHTML = `
          <i class="fa-regular fa-star"></i>
          Set as Default
        `;
      });

      button.classList.add("active");
      button.dataset.paymentDefault = "true";

      button.innerHTML = `
        <i class="fa-solid fa-star"></i>
        Default
      `;
    });
  });

  const moreButtons = [...panel.querySelectorAll(".customer-payment-more-btn")];

  moreButtons.forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();

      const cell = button.closest(".customer-payment-actions-cell");

      const menu = cell?.querySelector(".customer-payment-actions-menu");

      if (!menu) return;

      panel
        .querySelectorAll(".customer-payment-actions-menu")
        .forEach((item) => {
          if (item !== menu) {
            item.classList.add("hidden");
          }
        });

      const shouldOpen = menu.classList.contains("hidden");

      if (shouldOpen) {
        const rect = button.getBoundingClientRect();

        menu.style.top = `${rect.bottom + 7}px`;
        menu.style.left = `${Math.max(12, rect.right - 190)}px`;
      }

      menu.classList.toggle("hidden");
    });
  });

  panel
    .querySelectorAll(".customer-payment-actions-menu button")
    .forEach((button) => {
      button.addEventListener("click", () => {
        const row = button.closest(".customer-payment-row");

        const paymentId = row?.dataset.paymentId;
        const action = button.dataset.paymentAction;

        if (action === "view") {
          console.log("View payment:", paymentId);
        }

        if (action === "edit") {
          console.log("Edit payment:", paymentId);
        }

        if (action === "remove") {
          const confirmed = window.confirm("Remove this payment method?");

          if (confirmed) {
            row?.remove();
          }
        }

        button
          .closest(".customer-payment-actions-menu")
          ?.classList.add("hidden");
      });
    });

  document.addEventListener("click", () => {
    panel.querySelectorAll(".customer-payment-actions-menu").forEach((menu) => {
      menu.classList.add("hidden");
    });
  });
}

function bindCustomerActivityLog() {
  const panel = document.querySelector('[data-customer-panel="activity-log"]');

  if (!panel || panel.dataset.activityBound === "true") {
    return;
  }

  panel.dataset.activityBound = "true";

  const searchInput = panel.querySelector("#customer-activity-search");

  const typeFilter = panel.querySelector("#customer-activity-filter");

  const rows = [
    ...panel.querySelectorAll(
      ".customer-activity-row:not(.customer-activity-head)",
    ),
  ];

  const table = panel.querySelector(".customer-activity-table-scroll");

  const emptyState = panel.querySelector("#customer-activity-empty");

  const resultCount = panel.querySelector("#customer-activity-count");

  function filterActivities() {
    const searchValue = searchInput?.value.trim().toLowerCase() || "";

    const typeValue = typeFilter?.value || "all";

    let visibleCount = 0;

    rows.forEach((row) => {
      const matchesSearch =
        !searchValue || row.textContent.toLowerCase().includes(searchValue);

      const matchesType =
        typeValue === "all" || row.dataset.activityType === typeValue;

      const visible = matchesSearch && matchesType;

      row.classList.toggle("hidden", !visible);

      if (visible) {
        visibleCount += 1;
      }
    });

    table?.classList.toggle("hidden", visibleCount === 0);
    emptyState?.classList.toggle("hidden", visibleCount !== 0);

    if (resultCount) {
      resultCount.textContent =
        visibleCount === 0
          ? "No activities found"
          : `Showing 1 to ${visibleCount} of 28 activities`;
    }
  }

  searchInput?.addEventListener("input", filterActivities);
  typeFilter?.addEventListener("change", filterActivities);

  panel
    .querySelector("#export-customer-activity")
    ?.addEventListener("click", () => {
      console.log("Export customer activity log");
    });

  filterActivities();
}

/* ADD HERE */
function hideAllCustomerViews() {
  const viewSelectors = [
    "#customers-view",
    "#add-customer-view",
    "#customer-details-view",
    "#edit-customer-view",
    "#customer-add-vehicle-view",
    "#customer-create-booking-view",
    "#customer-edit-booking-view",
    "#customer-booking-details-view",
    "#customer-booking-receipt-view",
  ];

  viewSelectors.forEach((selector) => {
    document.querySelector(selector)?.classList.add("hidden");
  });
}

async function loadCustomerBookingReceiptPage(bookingId = "SWG-260524-0018") {
  const view = document.querySelector("#customer-booking-receipt-view");

  const container = document.querySelector(
    "#customer-booking-receipt-container",
  );

  if (!view || !container) {
    console.error("Booking receipt view or container was not found.");
    return;
  }

  hideAllCustomerViews();
  view.classList.remove("hidden");

  container.innerHTML = `
    <section class="page-loading-state">
      <i class="fa-solid fa-spinner fa-spin"></i>
      <p>Loading booking receipt...</p>
    </section>
  `;

  try {
    const response = await fetch("/pages/customer-booking-receipt.html");

    if (!response.ok) {
      throw new Error(`Receipt page failed to load: ${response.status}`);
    }

    container.innerHTML = await response.text();

    bindCustomerBookingReceiptPage(bookingId);
  } catch (error) {
    console.error("Unable to load receipt:", error);

    container.innerHTML = `
      <section class="page-load-error">
        <h2>Unable to load receipt</h2>
        <p>Please refresh the page and try again.</p>
      </section>
    `;
  }
}

async function loadCustomerBookingDetailsPage(bookingId = "SWG-260524-0018") {
  const view = document.querySelector("#customer-booking-details-view");

  if (!view) {
    console.error("Customer Booking Details view was not found.");
    return;
  }

  hideAllCustomerViews();
  view.classList.remove("hidden");

  view.innerHTML = `
    <section class="page-loading-state">
      <i class="fa-solid fa-spinner fa-spin"></i>
      <p>Loading booking details...</p>
    </section>
  `;

  try {
    const response = await fetch("/pages/customer-booking-details.html");

    if (!response.ok) {
      throw new Error(`Unable to load booking details: ${response.status}`);
    }

    view.innerHTML = await response.text();

    const bookingIdElement = view.querySelector("#booking-details-id");

    if (bookingIdElement) {
      bookingIdElement.textContent = bookingId;
    }

    bindCustomerBookingDetailsActions(view, bookingId);
  } catch (error) {
    console.error("Unable to load booking details:", error);

    view.innerHTML = `
      <section class="page-load-error">
        <i class="fa-solid fa-triangle-exclamation"></i>

        <h2>Unable to load Booking Details</h2>

        <p>Please refresh the page and try again.</p>

        <button
          type="button"
          id="retry-booking-details"
          class="btn-primary"
        >
          Try Again
        </button>
      </section>
    `;

    view
      .querySelector("#retry-booking-details")
      ?.addEventListener("click", () => {
        loadCustomerBookingDetailsPage(bookingId);
      });
  }
}

function bindCustomerBookingDetailsActions(view, bookingId) {
  if (!view) {
    return;
  }

  const backButton = view.querySelector("#back-from-booking-details");

  const editButton = view.querySelector("#edit-booking-details");

  const printButton = view.querySelector("#print-booking-details");

  const moreButton = view.querySelector("#booking-details-more-btn");

  const actionsMenu = view.querySelector("#booking-details-actions-menu");

  const cancelButton = view.querySelector("#cancel-booking-details");

  /*
   * Back to the customer's Bookings tab
   */
  backButton?.addEventListener("click", async (event) => {
    event.preventDefault();

    await loadCustomerDetailsPage("bookings");
  });

  /*
   * Open Edit Booking
   */
  editButton?.addEventListener("click", (event) => {
    event.preventDefault();

    const statusElement = view.querySelector(".booking-detail-status");

    const bookingStatus =
      statusElement?.textContent?.trim().toLowerCase() || "";

    const editableStatuses = ["pending", "confirmed", "in progress"];

    if (!editableStatuses.includes(bookingStatus)) {
      console.warn(`Booking cannot be edited with status: ${bookingStatus}`);

      return;
    }

    loadCustomerEditBookingPage(bookingId);
  });

  /*
   * Open dedicated A4 receipt
   */
  printButton?.addEventListener("click", (event) => {
    event.preventDefault();

    const currentBookingId =
      view.querySelector("#booking-details-id")?.textContent?.trim() ||
      bookingId;

    const url =
      "/pages/customer-booking-receipt-print.html" +
      `?bookingId=${encodeURIComponent(currentBookingId)}`;

    window.open(url, "_blank", "noopener,noreferrer");
  });

  /*
   * More actions menu
   */
  moreButton?.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();

    if (!actionsMenu) {
      return;
    }

    const shouldOpen = actionsMenu.classList.contains("hidden");

    actionsMenu.classList.toggle("hidden", !shouldOpen);

    moreButton.setAttribute("aria-expanded", String(shouldOpen));
  });

  cancelButton?.addEventListener("click", (event) => {
    event.preventDefault();

    actionsMenu?.classList.add("hidden");

    moreButton?.setAttribute("aria-expanded", "false");

    openCancelBookingModal(bookingId);
  });

  document.addEventListener(
    "click",
    () => {
      actionsMenu?.classList.add("hidden");

      moreButton?.setAttribute("aria-expanded", "false");
    },
    {
      once: true,
    },
  );

  applyBookingActionPermissions(view);
}

async function loadCustomerEditBookingPage(bookingId) {
  const view = document.querySelector("#customer-edit-booking-view");

  const container = document.querySelector("#customer-edit-booking-container");

  if (!view || !container) {
    console.error("Customer Edit Booking view or container was not found.");
    return;
  }

  hideAllCustomerViews();

  view.classList.remove("hidden");

  container.innerHTML = `
    <section class="page-loading-state">
      <i class="fa-solid fa-spinner fa-spin"></i>
      <p>Loading booking...</p>
    </section>
  `;

  try {
    const response = await fetch("/pages/customer-edit-booking.html");

    if (!response.ok) {
      throw new Error(`Edit Booking page failed to load: ${response.status}`);
    }

    container.innerHTML = await response.text();

    bindCustomerEditBookingPage(bookingId);
  } catch (error) {
    console.error("Unable to load Edit Booking:", error);

    container.innerHTML = `
      <section class="page-load-error">
        <i class="fa-solid fa-triangle-exclamation"></i>
        <h2>Unable to load Edit Booking</h2>
        <p>Please refresh the page and try again.</p>

        <button
          type="button"
          id="retry-edit-booking-load"
          class="btn-primary"
        >
          Try Again
        </button>
      </section>
    `;

    container
      .querySelector("#retry-edit-booking-load")
      ?.addEventListener("click", () => {
        loadCustomerEditBookingPage(bookingId);
      });
  }
}

function bindEditBookingNavigation(container, bookingId) {
  const backButton = container.querySelector("#back-from-edit-booking");

  const cancelButton = container.querySelector("#cancel-edit-booking");

  const saveButton = container.querySelector("#save-edit-booking");

  const successModal = container.querySelector("#edit-booking-success-modal");

  const closeModalButton = container.querySelector(
    "#close-edit-booking-success",
  );

  const continueButton = container.querySelector("#continue-editing-booking");

  const viewUpdatedButton = container.querySelector("#view-updated-booking");

  const returnToCustomerBookings = () => {
    hideAllCustomerViews();

    const customerDetailsView = document.querySelector(
      "#customer-details-view",
    );

    customerDetailsView?.classList.remove("hidden");

    activateCustomerDetailsTab("bookings");
  };

  backButton?.addEventListener("click", returnToCustomerBookings);

  cancelButton?.addEventListener("click", returnToCustomerBookings);

  saveButton?.addEventListener("click", () => {
    successModal?.classList.remove("hidden");
  });

  closeModalButton?.addEventListener("click", () => {
    successModal?.classList.add("hidden");
  });

  continueButton?.addEventListener("click", () => {
    successModal?.classList.add("hidden");
  });

  viewUpdatedButton?.addEventListener("click", () => {
    successModal?.classList.add("hidden");

    loadCustomerBookingDetailsPage(bookingId);
  });
}

function bindCustomerEditBookingPage(bookingId) {
  const container = document.querySelector("#customer-edit-booking-container");

  if (!container) return;

  const page = container.querySelector(".customer-edit-booking-page");

  if (!page) {
    console.error(".customer-edit-booking-page was not found.");
    return;
  }

  const safeBookingId = bookingId || "SWG-260524-0018";

  page.dataset.bookingId = safeBookingId;

  const bookingIdInput = container.querySelector("#edit-booking-id");

  const summaryBookingId = container.querySelector("#edit-summary-booking-id");

  const updatedBookingId = container.querySelector("#updated-booking-id");

  if (bookingIdInput) {
    bookingIdInput.value = safeBookingId;
  }

  if (summaryBookingId) {
    summaryBookingId.textContent = safeBookingId;
  }

  if (updatedBookingId) {
    updatedBookingId.textContent = safeBookingId;
  }

  bindEditBookingNavigation(container, safeBookingId);

  bindEditBookingTypeButtons(container);
  bindEditBookingLiveSummary(container);
  bindEditBookingNotesCounter(container);
}

function bindCustomerBookingReceiptPage(bookingId) {
  const view = document.querySelector("#customer-booking-receipt-view");

  if (!view) return;

  view
    .querySelectorAll("#receipt-booking-id, #receipt-barcode-id")
    .forEach((element) => {
      element.textContent = bookingId;
    });

  const backButton = view.querySelector("#back-from-booking-receipt");

  const printButton = view.querySelector("#print-booking-receipt");

  const downloadButton = view.querySelector("#download-booking-receipt");

  backButton?.addEventListener("click", () => {
    loadCustomerBookingDetailsPage(bookingId);
  });

  printButton?.addEventListener("click", () => {
    const url =
      `/pages/customer-booking-receipt-print.html` +
      `?bookingId=${encodeURIComponent(bookingId)}`;

    window.open(url, "_blank", "noopener,noreferrer");
  });

  downloadButton?.addEventListener("click", () => {
    window.print();
  });
}

function activateCustomerDetailsTab(tabName) {
  const customerDetailsView = document.querySelector("#customer-details-view");

  if (!customerDetailsView) return;

  customerDetailsView
    .querySelectorAll("[data-customer-tab]")
    .forEach((button) => {
      const active = button.dataset.customerTab === tabName;

      button.classList.toggle("active", active);

      button.setAttribute("aria-selected", String(active));
    });

  customerDetailsView
    .querySelectorAll("[data-customer-panel]")
    .forEach((panel) => {
      const active = panel.dataset.customerPanel === tabName;

      panel.classList.toggle("active", active);

      panel.classList.toggle("hidden", !active);
    });
}

function bindEditBookingTypeButtons(container) {
  const hiddenInput = container.querySelector("#edit-booking-type");

  const buttons = container.querySelectorAll("[data-edit-booking-type]");

  buttons.forEach((button) => {
    button.addEventListener("click", () => {
      buttons.forEach((item) => {
        item.classList.remove("active");
      });

      button.classList.add("active");

      const type =
        button.dataset.editBookingType === "multiple"
          ? "Multiple Entry"
          : "Single Entry";

      if (hiddenInput) {
        hiddenInput.value = type;
      }

      updateEditBookingSummary(container);
    });
  });
}

function bindEditBookingNotesCounter(container) {
  const notes = container.querySelector("#edit-booking-notes");

  const counter = container.querySelector("#edit-booking-notes-count");

  if (!notes || !counter) return;

  const updateCounter = () => {
    counter.textContent = String(notes.value.length);
  };

  notes.addEventListener("input", updateCounter);

  updateCounter();
}

function bindEditBookingLiveSummary(container) {
  const fieldSelectors = [
    "#edit-booking-location",
    "#edit-booking-zone",
    "#edit-booking-entry-date",
    "#edit-booking-entry-time",
    "#edit-booking-exit-date",
    "#edit-booking-exit-time",
    "#edit-booking-vehicle",
    "#edit-booking-payment-method",
    "#edit-booking-amount",
  ];

  fieldSelectors.forEach((selector) => {
    const field = container.querySelector(selector);

    field?.addEventListener("input", () => {
      updateEditBookingSummary(container);
    });

    field?.addEventListener("change", () => {
      updateEditBookingSummary(container);
    });
  });

  updateEditBookingSummary(container);
}

function updateEditBookingSummary(container) {
  const getValue = (selector) =>
    container.querySelector(selector)?.value?.trim() || "—";

  const setText = (selector, value) => {
    const element = container.querySelector(selector);

    if (element) {
      element.textContent = value;
    }
  };

  setText("#edit-summary-location", getValue("#edit-booking-location"));

  setText("#edit-summary-zone", getValue("#edit-booking-zone"));

  setText("#edit-summary-type", getValue("#edit-booking-type"));

  setText("#edit-summary-vehicle", getValue("#edit-booking-vehicle"));

  setText(
    "#edit-summary-payment-method",
    getValue("#edit-booking-payment-method"),
  );

  const entryDate = getValue("#edit-booking-entry-date");

  const entryTime = getValue("#edit-booking-entry-time");

  const exitDate = getValue("#edit-booking-exit-date");

  const exitTime = getValue("#edit-booking-exit-time");

  setText("#edit-summary-entry", `${entryDate}, ${entryTime}`);

  setText("#edit-summary-exit", `${exitDate}, ${exitTime}`);

  const amount = getValue("#edit-booking-amount");

  setText(
    "#edit-summary-amount",
    amount === "—" ? "SAR 0.00" : `SAR ${amount}`,
  );
}

function initCustomerTrendCharts(
  statistics = null,
) {
  customerTrendCharts.forEach(
    (chart) => chart?.destroy(),
  );

  customerTrendCharts = [];

  if (!statistics) {
    return;
  }

  const metricData = (metric) => {
    const previous =
      Number(metric?.previous);

    const current =
      Number(metric?.value);

    if (
      !Number.isFinite(previous) ||
      !Number.isFinite(current)
    ) {
      return [0, 0];
    }

    return [
      previous,
      current,
    ];
  };

  customerTrendCharts.push(
    createCustomerTrendChart(
      "#customersTrend",
      metricData(
        statistics.totalCustomers,
      ),
      "#16a34a",
    ),
  );

  customerTrendCharts.push(
    createCustomerTrendChart(
      "#mobileTrend",
      metricData(
        statistics.mobileAppCustomers,
      ),
      "#2563eb",
    ),
  );

  customerTrendCharts.push(
    createCustomerTrendChart(
      "#newTrend",
      metricData(
        statistics.newCustomers,
      ),
      "#9333ea",
    ),
  );

  customerTrendCharts.push(
    createCustomerTrendChart(
      "#returnTrend",
      metricData(
        statistics.returningCustomers,
      ),
      "#f97316",
    ),
  );

  customerTrendCharts =
    customerTrendCharts.filter(Boolean);
}
