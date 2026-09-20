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
  customerEditReturnRoute =
    returnRoute || `#customer-details?id=${encodedId}`;

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
    row.querySelector(".customer-more-btn")?.setAttribute(
      "data-customer-id",
      displayId,
    );
  });

  const records = await Promise.all(
    displayIds.map(async (displayId) => {
      try {
        return [
          displayId,
          await fetchCustomerRecord(resolveCustomerRecord(displayId).databaseId),
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
      if (element && value !== undefined && value !== null) element.textContent = value;
    };
    setText(".customer-profile b", customer.fullName || "Customer");
    setText(".customer-profile small", displayId);
    setText(".customer-contact-line:nth-child(1) span", customer.phoneNumber ? `${customer.phoneCountryCode || "+966"} ${customer.phoneNumber}` : "-");
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
    const matchesSearch = !search || row.textContent.toLowerCase().includes(search);
    const rowStatus = row.querySelector(".customer-status")?.textContent.toLowerCase() || "";
    const rowType = row.querySelector(".customer-type")?.textContent.toLowerCase() || "";
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

    renderCustomerList(container, result?.customers || [], result?.pagination);
    bindCustomerActions();
    bindCustomerTableSelection();
    bindCustomerActionMenus();
    window.applyDashboardPermissionVisibility?.(container);

    setTimeout(() => {
      initCustomerTrendCharts();
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
  const location = createCustomerText("span", "-");
  const vehicles = createCustomerText("span", "-", "customer-vehicles");
  const bookings = createCustomerText("span", "-");
  const spent = createCustomerText("span", "-");
  const activity = createCustomerText("span", "-");
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
    if (permission) button.dataset.requiredPermission = permission;
    button.textContent = label;
    menu.append(button);
  });
  actions.append(toggle, menu);

  row.append(
    checkboxCell,
    profile,
    contact,
    type,
    location,
    vehicles,
    bookings,
    spent,
    activity,
    status,
    actions,
  );
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

function renderCustomerList(container, customers, pagination) {
  const tableBody = container.querySelector("#customers-table-body");
  if (!tableBody) return;
  tableBody.replaceChildren();
  if (customers.length) {
    customers.forEach((customer) =>
      tableBody.append(createCustomerRow(customer)),
    );
  } else {
    tableBody.append(createCustomerListMessage("No customers found."));
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
      total
        ? `Showing ${start}-${end} of ${total} customers`
        : "No customers found",
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
  const rowCheckboxes = document.querySelectorAll(".customer-row-checkbox");

  if (!selectAll || rowCheckboxes.length === 0) return;

  if (selectAll.dataset.bound === "true") return;
  selectAll.dataset.bound = "true";

  selectAll.addEventListener("change", () => {
    rowCheckboxes.forEach((checkbox) => {
      checkbox.checked = selectAll.checked;
    });

    selectAll.indeterminate = false;
  });

  rowCheckboxes.forEach((checkbox) => {
    if (checkbox.dataset.bound === "true") return;
    checkbox.dataset.bound = "true";

    checkbox.addEventListener("change", () => {
      const selectedCount = [...rowCheckboxes].filter(
        (item) => item.checked,
      ).length;

      selectAll.checked = selectedCount === rowCheckboxes.length;
      selectAll.indeterminate =
        selectedCount > 0 && selectedCount < rowCheckboxes.length;
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
      actionButton.closest(".customers-row")?.dataset.customerId;
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
    memberSince.value = new Date().toISOString().split("T")[0];
  }

  bindAddCustomerForm();
}

function bindAddCustomerForm() {
  const form = document.querySelector("#add-customer-form");
  if (!form || form.dataset.bound === "true") return;

  form.dataset.bound = "true";

  const fullName = document.querySelector("#customer-full-name");
  const email = document.querySelector("#customer-email");
  const customerType = document.querySelector("#customer-type");
  const customerStatus = document.querySelector("#customer-status");
  const memberSince = document.querySelector("#customer-member-since");
  const language = document.querySelector("#customer-language");
  const communication = document.querySelector("#customer-communication");
  const notes = document.querySelector("#customer-notes");

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

  form.addEventListener("submit", (event) => {
    event.preventDefault();

    if (!form.checkValidity()) {
      form.reportValidity();
      return;
    }

    console.log("Customer form submitted");
  });

  updateSummary();
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

  hideAllCustomerViews();

  view.classList.remove("hidden");

  try {
    if (container.dataset.loaded !== "true" || !container.innerHTML.trim()) {
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

    bindCustomerDetailsActions();
    bindCustomerDetailsTabs();
    bindCustomerVehicleActions();
    bindCustomerBookingActions();
    bindCustomerBookingsList();
    bindCustomerPaymentMethodActions();
    bindCustomerActivityLog();
    const databaseId = resolveCustomerDatabaseId(customerId);
    const customer = databaseId
      ? await fetchCustomerRecord(databaseId, controller.signal)
      : null;
    if (
      controller.signal.aborted ||
      requestId !== customerDetailsRequestId ||
      getDashboardRoute().name !== "customer-details" ||
      getCurrentCustomerId() !== customerId
    ) {
      return;
    }
    if (customer) populateCustomerDetails(customer);
    window.applyDashboardPermissionVisibility?.(container);

    activateCustomerDetailsTab(initialTab);
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
      !customerEditReturnRoute.endsWith(
        `id=${encodeURIComponent(customerId)}`,
      ))
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

  bindEditCustomerActions();
  window.applyDashboardPermissionVisibility?.(container);

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

  if (customer) populateEditCustomerForm(customer);
  bindEditCustomerActions();
  window.applyDashboardPermissionVisibility?.(container);
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
}

function populateCustomerDetails(customer) {
  const page = document.querySelector(".customer-details-page");
  if (!page) return;

  const name = String(customer.fullName || "Customer");
  const phone = customer.phoneNumber
    ? `${customer.phoneCountryCode || "+966"} ${customer.phoneNumber}`
    : "-";
  const email = customer.email || "-";
  const status = String(customer.status || "ACTIVE");
  const type = formatCustomerType(customer.customerType);
  const memberSince = customer.memberSince
    ? new Intl.DateTimeFormat("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      }).format(new Date(customer.memberSince))
    : "-";
  const setText = (selector, value) => {
    const element = page.querySelector(selector);
    if (element) element.textContent = value;
  };
  const infoItems = [...page.querySelectorAll(".customer-profile-info-item")];
  const setInfoValue = (index, value) =>
    infoItems[index]?.querySelector("b")?.replaceChildren(value);
  setInfoValue(0, phone);
  setInfoValue(1, email);
  setInfoValue(3, memberSince);
  setInfoValue(5, customer.communicationPreference || "-");
  setInfoValue(6, customer.preferredLanguage || "-");
  page.querySelector(".customer-profile-identity h2")?.replaceChildren(name);
  page.querySelector(".customer-profile-identity p")?.replaceChildren(
    getCurrentCustomerId() || customer.id,
  );
  page.querySelector(".customer-profile-identity .customer-app-badge")?.replaceChildren(
    type.toUpperCase(),
  );
  page.querySelector(".customer-details-status")?.replaceChildren(
    status.toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase()),
  );
  const contactValues = page.querySelectorAll(
    ".customer-contact-details-list > p > b",
  );
  contactValues[0]?.replaceChildren(name);
  contactValues[1]?.replaceChildren(phone);
  contactValues[2]?.replaceChildren(email);
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
    notes: value("#edit-notes"),
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

  form.dataset.saving = "true";
  setEditCustomerSaveState(form, true, true);
  const url = `${getCustomerManagementApiBaseUrl()}/customers/${encodeURIComponent(databaseId)}`;
  const payload = {
    ...values,
    memberSince: values.memberSince || undefined,
    preferredLanguage: values.preferredLanguage || undefined,
    communicationPreference: values.communicationPreference || undefined,
    notes: values.notes || undefined,
  };
  console.debug("[Customers] PATCH customer", {
    displayId,
    databaseId,
    url,
    payload,
  });

  try {
    const response = await fetch(url, {
      method: "PATCH",
      headers: getCustomerManagementAuthHeaders(),
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      const error = new Error("Customer update failed.");
      error.status = response.status;
      throw error;
    }

    const body = await response.json().catch(() => null);
    const updatedCustomer = body?.data?.customer || body?.customer || body?.data;
    mergeUpdatedCustomerIntoList(displayId, updatedCustomer || values);

    form.dataset.originalCustomerValues =
      editCustomerValuesForComparison(values);
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
    window.showDashboardAlert?.(customerUpdateErrorMessage(error?.status), {
      title: "Unable to save customer",
      type: "error",
    });
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

  form.dataset.originalCustomerValues = editCustomerValuesForComparison(
    getEditCustomerFormValues(form),
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

    if (!/^[ABDGHJKLNRSTUVXZ]{3}$/.test(plateLettersEnglish)) {
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

function initCustomerTrendCharts() {
  customerTrendCharts.forEach((chart) => chart?.destroy());
  customerTrendCharts = [];

  customerTrendCharts.push(
    createCustomerTrendChart(
      "#customersTrend",
      [12, 15, 13, 18, 14, 24, 20, 28, 31],
      "#16a34a",
    ),
  );

  customerTrendCharts.push(
    createCustomerTrendChart(
      "#mobileTrend",
      [10, 13, 11, 16, 14, 23, 18, 27, 30],
      "#2563eb",
    ),
  );

  customerTrendCharts.push(
    createCustomerTrendChart(
      "#newTrend",
      [8, 11, 9, 14, 10, 19, 16, 24, 29],
      "#9333ea",
    ),
  );

  customerTrendCharts.push(
    createCustomerTrendChart(
      "#returnTrend",
      [9, 12, 10, 15, 13, 21, 19, 27, 32],
      "#f97316",
    ),
  );

  customerTrendCharts = customerTrendCharts.filter(Boolean);
}
