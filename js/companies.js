const companyPageState = {
  page: 1,
  limit: 5,
  search: "",
  city: "",
  status: "",
  items: [],
  meta: null,
  statistics: null,
  initialized: false,
  searchTimer: null,
};

const companyAssignmentState = {
  accounts: [],
  locations: [],
  accountSearch: "",
  locationSearch: "",
  selectedAccountIds: new Set(),
  selectedLocationIds: new Set(),
};

function getCompanyApiBaseUrl() {
  return window.PARKIN_CONFIG?.apiBaseUrl || "https://api.parkin.com.sa";
}

function getCompanyAuthHeaders(includeJson = false) {
  const accessToken = localStorage.getItem("parkin_access_token");

  if (!accessToken) {
    throw new Error("Your login session has expired. Please sign in again.");
  }

  const headers = { Authorization: `Bearer ${accessToken}` };

  if (includeJson) {
    headers["Content-Type"] = "application/json";
  }

  return headers;
}

async function parseCompanyResponse(response) {
  const result = await response.json().catch(() => null);

  if (!response.ok) {
    const message = Array.isArray(result?.message)
      ? result.message.join(", ")
      : result?.message ||
        result?.error ||
        `Request failed with status ${response.status}.`;

    const error = new Error(message);
    error.status = response.status;
    throw error;
  }

  return result?.data ?? result;
}

function escapeCompanyHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function getCompanyInitials(name) {
  return String(name || "CO")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

function formatCompanyStatus(status) {
  return String(status || "INACTIVE")
    .toLowerCase()
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function setCompaniesLoading(isLoading) {
  document.querySelector("#companies-loading")?.classList.toggle("hidden", !isLoading);

  if (isLoading) {
    document.querySelector(".companies-table-scroll")?.classList.add("hidden");
    document.querySelector("#companies-pagination")?.classList.add("hidden");
    document.querySelector("#companies-empty")?.classList.add("hidden");
  }
}

function showCompanyToast(message, type = "success") {
  const toast = document.querySelector("#company-toast");

  if (!toast) return;

  toast.textContent = message;
  toast.classList.toggle("error", type === "error");
  toast.classList.remove("hidden");

  window.clearTimeout(showCompanyToast.timer);
  showCompanyToast.timer = window.setTimeout(() => {
    toast.classList.add("hidden");
  }, 3200);
}

function buildCompanyQuery({ page = companyPageState.page, limit = companyPageState.limit } = {}) {
  const params = new URLSearchParams({
    page: String(page),
    limit: String(limit),
  });

  if (companyPageState.search) params.set("search", companyPageState.search);
  if (companyPageState.city) params.set("city", companyPageState.city);
  if (companyPageState.status) params.set("status", companyPageState.status);

  return params;
}

async function fetchCompanyDirectory(options) {
  const response = await fetch(
    `${getCompanyApiBaseUrl()}/companies?${buildCompanyQuery(options)}`,
    { headers: getCompanyAuthHeaders() },
  );

  return parseCompanyResponse(response);
}

async function fetchCompanyStatistics() {
  const response = await fetch(`${getCompanyApiBaseUrl()}/companies/statistics`, {
    headers: getCompanyAuthHeaders(),
  });

  return parseCompanyResponse(response);
}

function renderCompanyKpis(statistics) {
  const total = Number(statistics?.total) || 0;
  const active = Number(statistics?.active) || 0;
  const activeShare = total ? Math.round((active / total) * 100) : 0;

  document.querySelector("#companies-total").textContent = total.toLocaleString();
  document.querySelector("#companies-active").textContent = active.toLocaleString();
  document.querySelector("#companies-active-share").textContent = `${activeShare}% active`;
  document.querySelector("#companies-drivers").textContent = (
    Number(statistics?.totalDrivers) || 0
  ).toLocaleString();
  document.querySelector("#companies-active-drivers").textContent = `${(
    Number(statistics?.activeDrivers) || 0
  ).toLocaleString()} active drivers`;
  document.querySelector("#companies-locations").textContent = (
    Number(statistics?.assignedLocations) || 0
  ).toLocaleString();
}

function renderCompanyDirectory(items, meta) {
  const list = document.querySelector("#companies-list");
  const empty = document.querySelector("#companies-empty");
  const table = document.querySelector(".companies-table-scroll");

  if (!list || !empty || !table) return;

  if (!items.length) {
    list.innerHTML = "";
    table.classList.add("hidden");
    empty.classList.remove("hidden");
  } else {
    empty.classList.add("hidden");
    table.classList.remove("hidden");

    list.innerHTML = items
      .map((company) => {
        const primaryLocation = company.locations?.[0];
        const additionalLocations = Math.max(
          0,
          Number(company.assignedLocations || 0) - 1,
        );
        const statusClass = String(company.status || "INACTIVE").toLowerCase();
        const nextStatus = company.status === "ACTIVE" ? "SUSPENDED" : "ACTIVE";
        const nextStatusLabel = nextStatus === "ACTIVE" ? "Activate" : "Suspend";

        return `
          <div class="companies-row" role="row" data-company-id="${escapeCompanyHtml(company.id)}">
            <div class="company-identity" role="cell">
              <span class="company-avatar">${escapeCompanyHtml(getCompanyInitials(company.name))}</span>
              <span class="company-cell-copy">
                <strong>${escapeCompanyHtml(company.name)}</strong>
                <small>${escapeCompanyHtml(company.code)}</small>
              </span>
            </div>
            <div class="company-contact" role="cell">
              <span class="company-cell-copy">
                <strong>${escapeCompanyHtml(company.contactPerson || "Not assigned")}</strong>
                <small>${escapeCompanyHtml(company.phone || company.email || "No contact details")}</small>
              </span>
            </div>
            <div class="company-location-cell" role="cell">
              <span class="company-cell-copy">
                <strong>${escapeCompanyHtml(primaryLocation?.name || company.city || "No location")}</strong>
                <small>${escapeCompanyHtml(
                  primaryLocation
                    ? `${primaryLocation.city}${additionalLocations ? ` +${additionalLocations} more` : ""}`
                    : "Unassigned",
                )}</small>
              </span>
            </div>
            <span class="company-metric-cell" data-label="Drivers" role="cell">
              ${Number(company.totalDrivers || 0).toLocaleString()}
              <small>${Number(company.activeDrivers || 0).toLocaleString()} active</small>
            </span>
            <span class="company-metric-cell" data-label="Accounts" role="cell">${Number(
              company.assignedAccounts || 0,
            ).toLocaleString()}</span>
            <span class="company-status-pill ${statusClass}" role="cell">${escapeCompanyHtml(
              formatCompanyStatus(company.status),
            )}</span>
            <div class="company-action-menu" role="cell">
              <button class="company-row-action" type="button" aria-label="Company actions" aria-expanded="false">
                <i class="fa-solid fa-ellipsis-vertical" aria-hidden="true"></i>
              </button>
              <div class="company-action-popover hidden">
                <button type="button" data-edit-company="${escapeCompanyHtml(company.id)}"><i class="fa-solid fa-pen"></i>Edit company</button>
                <button type="button" data-company-status-id="${escapeCompanyHtml(company.id)}" data-company-next-status="${nextStatus}"><i class="fa-solid fa-power-off"></i>${nextStatusLabel}</button>
              </div>
            </div>
          </div>
        `;
      })
      .join("");
  }

  const total = Number(meta?.total) || 0;
  const page = Number(meta?.page) || 1;
  const limit = Number(meta?.limit) || companyPageState.limit;
  const first = total ? (page - 1) * limit + 1 : 0;
  const last = Math.min(page * limit, total);

  document.querySelector("#companies-result-summary").textContent = total
    ? `Showing ${first} to ${last} of ${total} companies`
    : "0 companies";

  renderCompanyPagination(meta);
  updateCompanyCityFilter(items);
}

function updateCompanyCityFilter(items) {
  const select = document.querySelector("#company-city-filter");
  if (!select) return;

  const current = companyPageState.city;
  const cities = new Set(
    Array.from(select.options)
      .map((option) => option.value)
      .filter(Boolean),
  );

  items.forEach((company) => {
    if (company.city) cities.add(company.city);
  });

  select.innerHTML = `<option value="">All Cities</option>${Array.from(cities)
    .sort((first, second) => first.localeCompare(second))
    .map((city) => `<option value="${escapeCompanyHtml(city)}">${escapeCompanyHtml(city)}</option>`)
    .join("")}`;
  select.value = current;
}

function renderCompanyPagination(meta) {
  const pagination = document.querySelector("#companies-pagination");
  if (!pagination) return;

  const page = Number(meta?.page) || 1;
  const totalPages = Math.max(1, Number(meta?.totalPages) || 1);
  const pageNumbers = new Set([1, totalPages, page - 1, page, page + 1]);
  const visiblePages = Array.from(pageNumbers)
    .filter((number) => number >= 1 && number <= totalPages)
    .sort((first, second) => first - second);

  let previousPage = 0;
  const buttons = visiblePages
    .map((number) => {
      const gap = previousPage && number - previousPage > 1 ? `<span>...</span>` : "";
      previousPage = number;
      return `${gap}<button type="button" class="${number === page ? "active" : ""}" data-company-page="${number}" aria-label="Page ${number}" ${number === page ? 'aria-current="page"' : ""}>${number}</button>`;
    })
    .join("");

  pagination.innerHTML = `
    <button type="button" data-company-page="${page - 1}" aria-label="Previous page" ${page <= 1 ? "disabled" : ""}><i class="fa-solid fa-chevron-left"></i></button>
    ${buttons}
    <button type="button" data-company-page="${page + 1}" aria-label="Next page" ${page >= totalPages ? "disabled" : ""}><i class="fa-solid fa-chevron-right"></i></button>
  `;
}

function renderCompanyInsights(statistics) {
  const total = Number(statistics?.total) || 0;
  const active = Number(statistics?.active) || 0;
  const inactive = Number(statistics?.inactive) || 0;
  const suspended = Number(statistics?.suspended) || 0;
  const donut = document.querySelector("#company-status-donut");

  if (donut) {
    if (!total) {
      donut.style.background = "conic-gradient(#dce3e9 0deg 360deg)";
      donut.setAttribute("aria-label", "No company status data");
    } else {
      const activeEnd = (active / total) * 360;
      const inactiveEnd = activeEnd + (inactive / total) * 360;
      donut.style.background = `conic-gradient(#10a85a 0deg ${activeEnd}deg, #aeb9c5 ${activeEnd}deg ${inactiveEnd}deg, #ef5b55 ${inactiveEnd}deg 360deg)`;
      donut.setAttribute(
        "aria-label",
        `${active} active, ${inactive} inactive and ${suspended} suspended companies`,
      );
    }
  }

  document.querySelector("#company-status-total").textContent = total.toLocaleString();
  document.querySelector("#company-status-legend").innerHTML = [
    ["Active", active, "#10a85a"],
    ["Inactive", inactive, "#aeb9c5"],
    ["Suspended", suspended, "#ef5b55"],
  ]
    .map(
      ([label, value, color]) => `
        <li><i style="background:${color}"></i><span>${label}</span><strong>${Number(value).toLocaleString()}</strong></li>
      `,
    )
    .join("");

  const companies = Array.isArray(statistics?.companies) ? statistics.companies : [];
  renderCompanyBarChart(
    "#company-driver-chart",
    companies,
    (company) => Number(company._count?.drivers) || 0,
    "drivers",
  );
  renderCompanyBarChart(
    "#company-location-chart",
    companies,
    (company) => Number(company._count?.locations) || 0,
    "locations",
  );
}

function renderCompanyBarChart(selector, companies, getValue, unit) {
  const container = document.querySelector(selector);
  if (!container) return;

  const rows = companies
    .map((company) => ({ name: company.name, value: getValue(company) }))
    .sort((first, second) => second.value - first.value)
    .slice(0, 5);

  const maximum = Math.max(...rows.map((row) => row.value), 0);

  if (!rows.length || !maximum) {
    container.innerHTML = `<div class="company-chart-empty">No ${unit} have been assigned yet.</div>`;
    return;
  }

  container.innerHTML = rows
    .map(
      (row) => `
        <div class="company-bar-row">
          <span title="${escapeCompanyHtml(row.name)}">${escapeCompanyHtml(row.name)}</span>
          <span class="company-bar-track"><span class="company-bar-fill" style="width:${Math.max(5, (row.value / maximum) * 100)}%"></span></span>
          <strong>${row.value.toLocaleString()}</strong>
        </div>
      `,
    )
    .join("");
}

async function refreshCompaniesPage() {
  setCompaniesLoading(true);

  try {
    const [directory, statistics] = await Promise.all([
      fetchCompanyDirectory(),
      fetchCompanyStatistics(),
    ]);

    companyPageState.items = directory.items || [];
    companyPageState.meta = directory.meta || null;
    companyPageState.statistics = statistics;

    renderCompanyKpis(statistics);
    renderCompanyDirectory(companyPageState.items, companyPageState.meta);
    renderCompanyInsights(statistics);
  } catch (error) {
    console.error("Unable to load valet companies:", error);
    showCompanyToast(error.message || "Unable to load valet companies.", "error");

    const empty = document.querySelector("#companies-empty");
    if (empty) {
      empty.classList.remove("hidden");
      empty.querySelector("h3").textContent = "Unable to load companies";
      empty.querySelector("p").textContent = error.message || "Please try again.";
    }
  } finally {
    setCompaniesLoading(false);
  }
}

function setCompanyDrawerOpen(isOpen) {
  const drawer = document.querySelector("#company-drawer");
  const backdrop = document.querySelector("#company-drawer-backdrop");

  drawer?.classList.toggle("hidden", !isOpen);
  backdrop?.classList.toggle("hidden", !isOpen);
  drawer?.setAttribute("aria-hidden", String(!isOpen));
  document.body.classList.toggle("company-drawer-open", isOpen);
}

window.closeCompanyDrawer = () => setCompanyDrawerOpen(false);

function clearCompanyFormAlert() {
  const alert = document.querySelector("#company-form-alert");
  alert?.classList.add("hidden");
  if (alert) alert.textContent = "";
}

function showCompanyFormAlert(message) {
  const alert = document.querySelector("#company-form-alert");
  if (!alert) return;
  alert.textContent = message;
  alert.classList.remove("hidden");
  alert.scrollIntoView({ behavior: "smooth", block: "center" });
}

function resetCompanyForm() {
  const form = document.querySelector("#company-form");
  form?.reset();
  form?.querySelectorAll('[aria-invalid="true"]').forEach((field) => {
    field.removeAttribute("aria-invalid");
  });
  document.querySelector("#company-record-id").value = "";
  document.querySelector("#company-status").value = "ACTIVE";
  document.querySelector("#company-notes-count").textContent = "0";
  companyAssignmentState.accounts = [];
  companyAssignmentState.locations = [];
  companyAssignmentState.accountSearch = "";
  companyAssignmentState.locationSearch = "";
  companyAssignmentState.selectedAccountIds = new Set();
  companyAssignmentState.selectedLocationIds = new Set();
  document.querySelector("#company-account-search").value = "";
  document.querySelector("#company-location-search").value = "";
  clearCompanyFormAlert();
}

function setCompanyFormValue(id, value) {
  const field = document.querySelector(`#${id}`);
  if (field) field.value = value ?? "";
}

function populateCompanyForm(company) {
  setCompanyFormValue("company-record-id", company.id);
  setCompanyFormValue("company-name", company.name);
  setCompanyFormValue("company-code", company.code);
  setCompanyFormValue("company-legal-name", company.legalName);
  setCompanyFormValue("company-registration", company.commercialRegistrationNumber);
  setCompanyFormValue("company-vat", company.vatNumber);
  setCompanyFormValue("company-status", company.status || "ACTIVE");
  setCompanyFormValue("company-city", company.city);
  setCompanyFormValue("company-address", company.address);
  setCompanyFormValue("company-contact-person", company.contactPerson);
  setCompanyFormValue("company-contact-title", company.contactJobTitle);
  setCompanyFormValue("company-email", company.email);
  setCompanyFormValue("company-phone", company.phone);
  setCompanyFormValue("company-website", company.website);
  setCompanyFormValue("company-notes", company.notes);
  document.querySelector("#company-notes-count").textContent = String(
    company.notes?.length || 0,
  );
}

function getSelectedAssignmentIds(name) {
  return new Set(
    Array.from(document.querySelectorAll(`input[name="${name}"]:checked`)).map(
      (input) => input.value,
    ),
  );
}

function renderCompanyAssignmentOptions(options = companyAssignmentState, selectedAccounts, selectedLocations) {
  const accountContainer = document.querySelector("#company-account-options");
  const locationContainer = document.querySelector("#company-location-options");

  if (options.accounts) {
    companyAssignmentState.accounts = options.accounts;
    companyAssignmentState.locations = options.locations || [];
  }
  if (selectedAccounts) {
    companyAssignmentState.selectedAccountIds = new Set(selectedAccounts.map((account) => account.id));
  } else {
    getSelectedAssignmentIds("accountIds").forEach((id) => companyAssignmentState.selectedAccountIds.add(id));
  }
  if (selectedLocations) {
    companyAssignmentState.selectedLocationIds = new Set(selectedLocations.map((location) => location.id));
  } else {
    getSelectedAssignmentIds("locationIds").forEach((id) => companyAssignmentState.selectedLocationIds.add(id));
  }

  const accountSearch = companyAssignmentState.accountSearch.toLowerCase();
  const locationSearch = companyAssignmentState.locationSearch.toLowerCase();
  const accounts = companyAssignmentState.accounts.filter((account) =>
    `${account.name} ${account.email}`.toLowerCase().includes(accountSearch),
  );
  const locations = companyAssignmentState.locations.filter((location) =>
    `${location.name} ${location.city}`.toLowerCase().includes(locationSearch),
  );

  if (accountContainer) {
    accountContainer.innerHTML = accounts.length
      ? accounts
          .map(
            (account) => `
              <label class="company-option-card">
                <input type="checkbox" name="accountIds" value="${escapeCompanyHtml(account.id)}" ${companyAssignmentState.selectedAccountIds.has(account.id) ? "checked" : ""} />
                <span><strong>${escapeCompanyHtml(account.name)}</strong><small>${escapeCompanyHtml(account.email)} · ${escapeCompanyHtml(formatCompanyStatus(account.role))}</small></span>
              </label>
            `,
          )
          .join("")
      : companyAssignmentState.accounts.length
        ? `<p class="company-options-empty">No accounts match this search.</p>`
        : `<p class="company-options-empty"><strong>No accounts available for assignment</strong><br />All eligible management accounts currently belong to a valet company. You can create this company now and assign accounts later.</p>`;
  }

  if (locationContainer) {
    locationContainer.innerHTML = locations.length
      ? locations
          .map(
            (location) => `
              <label class="company-option-card">
                <input type="checkbox" name="locationIds" value="${escapeCompanyHtml(location.id)}" ${companyAssignmentState.selectedLocationIds.has(location.id) ? "checked" : ""} />
                <span><strong>${escapeCompanyHtml(location.name)}</strong><small>${escapeCompanyHtml(`${location.city} · ${location.code}`)}</small></span>
              </label>
            `,
          )
          .join("")
      : companyAssignmentState.locations.length
        ? `<p class="company-options-empty">No locations match this search.</p>`
        : `<p class="company-options-empty"><strong>No locations available for assignment</strong><br />All locations currently belong to a valet company. You can create this company now and assign or transfer locations later.</p>`;
  }

  document.querySelector("#company-account-selected").textContent = `${companyAssignmentState.selectedAccountIds.size} selected`;
  document.querySelector("#company-location-selected").textContent = `${companyAssignmentState.selectedLocationIds.size} selected`;
}

async function openCompanyDrawer(companyId = null) {
  resetCompanyForm();
  setCompanyDrawerOpen(true);

  const title = document.querySelector("#company-drawer-title");
  const eyebrow = document.querySelector("#company-drawer-eyebrow");
  const saveLabel = document.querySelector("#save-company span");
  const assignmentUrl = new URL(
    `${getCompanyApiBaseUrl()}/companies/assignment-options`,
  );

  if (companyId) assignmentUrl.searchParams.set("companyId", companyId);

  if (title) title.textContent = companyId ? "Edit Valet Company" : "Add Valet Company";
  if (eyebrow) eyebrow.textContent = companyId ? "Tenant settings" : "New tenant";
  if (saveLabel) saveLabel.textContent = companyId ? "Update Company" : "Save Company";

  document.querySelector("#company-account-options").innerHTML = `<p class="company-options-empty">Loading accounts...</p>`;
  document.querySelector("#company-location-options").innerHTML = `<p class="company-options-empty">Loading locations...</p>`;

  try {
    const requests = [
      fetch(assignmentUrl, { headers: getCompanyAuthHeaders() }).then(
        parseCompanyResponse,
      ),
    ];

    if (companyId) {
      requests.push(
        fetch(`${getCompanyApiBaseUrl()}/companies/${companyId}`, {
          headers: getCompanyAuthHeaders(),
        }).then(parseCompanyResponse),
      );
    }

    const [options, company] = await Promise.all(requests);

    if (company) populateCompanyForm(company);
    renderCompanyAssignmentOptions(
      options,
      company?.users || [],
      company?.locations || [],
    );

    document.querySelector("#company-name")?.focus();
  } catch (error) {
    showCompanyFormAlert(error.message || "Unable to prepare the company form.");
  }
}

function collectCompanyFormPayload() {
  const value = (id) => document.querySelector(`#${id}`)?.value?.trim() || "";

  return {
    code: value("company-code").toUpperCase(),
    name: value("company-name"),
    legalName: value("company-legal-name") || undefined,
    commercialRegistrationNumber: value("company-registration") || undefined,
    vatNumber: value("company-vat") || undefined,
    status: value("company-status"),
    city: value("company-city") || undefined,
    address: value("company-address") || undefined,
    contactPerson: value("company-contact-person"),
    contactJobTitle: value("company-contact-title") || undefined,
    email: value("company-email").toLowerCase(),
    phone: value("company-phone").replace(/\s+/g, ""),
    website: value("company-website") || undefined,
    notes: value("company-notes") || undefined,
    accountIds: [...companyAssignmentState.selectedAccountIds],
    locationIds: [...companyAssignmentState.selectedLocationIds],
  };
}

function validateCompanyForm(form, payload) {
  clearCompanyFormAlert();
  let valid = true;

  form.querySelectorAll("[required]").forEach((field) => {
    const fieldValid = field.checkValidity();
    field.toggleAttribute("aria-invalid", !fieldValid);
    valid = valid && fieldValid;
  });

  if (!/^COMP-[A-Z0-9-]{2,24}$/.test(payload.code)) {
    document.querySelector("#company-code")?.setAttribute("aria-invalid", "true");
    showCompanyFormAlert("Company code must use the format COMP-XXXX.");
    valid = false;
  }

  if (payload.commercialRegistrationNumber && !/^\d{10}$/.test(payload.commercialRegistrationNumber)) {
    document.querySelector("#company-registration")?.setAttribute("aria-invalid", "true");
    showCompanyFormAlert("Commercial registration number must contain 10 digits.");
    valid = false;
  }

  if (payload.vatNumber && !/^\d{15}$/.test(payload.vatNumber)) {
    document.querySelector("#company-vat")?.setAttribute("aria-invalid", "true");
    showCompanyFormAlert("VAT number must contain 15 digits.");
    valid = false;
  }

  if (!valid) {
    form.querySelector('[aria-invalid="true"]')?.focus();
  }

  return valid;
}

async function saveCompanyForm(event) {
  event.preventDefault();

  const form = event.currentTarget;
  const payload = collectCompanyFormPayload();

  if (!validateCompanyForm(form, payload)) return;

  const companyId = document.querySelector("#company-record-id")?.value;
  const saveButton = document.querySelector("#save-company");
  const originalContent = saveButton.innerHTML;

  try {
    saveButton.disabled = true;
    saveButton.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i><span>Saving...</span>`;

    const response = await fetch(
      companyId
        ? `${getCompanyApiBaseUrl()}/companies/${companyId}`
        : `${getCompanyApiBaseUrl()}/companies`,
      {
        method: companyId ? "PATCH" : "POST",
        headers: getCompanyAuthHeaders(true),
        body: JSON.stringify(payload),
      },
    );

    await parseCompanyResponse(response);
    setCompanyDrawerOpen(false);
    showCompanyToast(companyId ? "Company updated successfully." : "Company created and assigned successfully.");
    companyPageState.page = 1;
    await refreshCompaniesPage();
  } catch (error) {
    showCompanyFormAlert(error.message || "Unable to save this company.");
  } finally {
    saveButton.disabled = false;
    saveButton.innerHTML = originalContent;
  }
}

async function updateCompanyStatus(companyId, status) {
  const verb = status === "ACTIVE" ? "activate" : "suspend";
  if (!window.confirm(`Are you sure you want to ${verb} this company?`)) return;

  try {
    const response = await fetch(
      `${getCompanyApiBaseUrl()}/companies/${companyId}/status`,
      {
        method: "PATCH",
        headers: getCompanyAuthHeaders(true),
        body: JSON.stringify({ status }),
      },
    );

    await parseCompanyResponse(response);
    showCompanyToast(
      status === "ACTIVE"
        ? "Company activated successfully."
        : "Company suspended successfully.",
    );
    await refreshCompaniesPage();
  } catch (error) {
    showCompanyToast(error.message || "Unable to update company status.", "error");
  }
}

async function exportCompaniesCsv() {
  const button = document.querySelector("#export-companies");

  try {
    button.disabled = true;
    const directory = await fetchCompanyDirectory({ page: 1, limit: 100 });
    const rows = directory.items || [];
    const csvEscape = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;
    const csv = [
      ["Code", "Company", "Contact Person", "Email", "Phone", "City", "Drivers", "Active Drivers", "Locations", "Accounts", "Status"],
      ...rows.map((company) => [
        company.code,
        company.name,
        company.contactPerson,
        company.email,
        company.phone,
        company.city,
        company.totalDrivers,
        company.activeDrivers,
        company.assignedLocations,
        company.assignedAccounts,
        company.status,
      ]),
    ]
      .map((row) => row.map(csvEscape).join(","))
      .join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `parkin-valet-companies-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  } catch (error) {
    showCompanyToast(error.message || "Unable to export companies.", "error");
  } finally {
    button.disabled = false;
  }
}

function bindCompanyPageEvents(container) {
  if (container.dataset.eventsBound === "true") return;
  container.dataset.eventsBound = "true";

  container.addEventListener("click", async (event) => {
    const openButton = event.target.closest("#add-company, [data-open-company-drawer]");
    if (openButton) {
      await openCompanyDrawer();
      return;
    }

    const pageButton = event.target.closest("[data-company-page]");
    if (pageButton && !pageButton.disabled) {
      companyPageState.page = Number(pageButton.dataset.companyPage) || 1;
      await refreshCompaniesPage();
      return;
    }

    const actionToggle = event.target.closest(".company-row-action");
    if (actionToggle) {
      const popover = actionToggle.parentElement.querySelector(".company-action-popover");
      document.querySelectorAll(".company-action-popover").forEach((menu) => {
        if (menu !== popover) menu.classList.add("hidden");
      });
      popover?.classList.toggle("hidden");
      actionToggle.setAttribute(
        "aria-expanded",
        String(!popover?.classList.contains("hidden")),
      );
      return;
    }

    const editButton = event.target.closest("[data-edit-company]");
    if (editButton) {
      await openCompanyDrawer(editButton.dataset.editCompany);
      return;
    }

    const statusButton = event.target.closest("[data-company-status-id]");
    if (statusButton) {
      await updateCompanyStatus(
        statusButton.dataset.companyStatusId,
        statusButton.dataset.companyNextStatus,
      );
    }
  });

  document.querySelectorAll("[data-close-company-drawer]").forEach((button) => {
    button.addEventListener("click", () => setCompanyDrawerOpen(false));
  });

  document.querySelector("#company-form")?.addEventListener("submit", saveCompanyForm);
  document.querySelector("#export-companies")?.addEventListener("click", exportCompaniesCsv);

  document.querySelector("#company-search")?.addEventListener("input", (event) => {
    window.clearTimeout(companyPageState.searchTimer);
    companyPageState.searchTimer = window.setTimeout(async () => {
      companyPageState.search = event.target.value.trim();
      companyPageState.page = 1;
      await refreshCompaniesPage();
    }, 350);
  });

  document.querySelector("#company-city-filter")?.addEventListener("change", async (event) => {
    companyPageState.city = event.target.value;
    companyPageState.page = 1;
    await refreshCompaniesPage();
  });

  document.querySelector("#company-status-filter")?.addEventListener("change", async (event) => {
    companyPageState.status = event.target.value;
    companyPageState.page = 1;
    await refreshCompaniesPage();
  });

  document.querySelector("#reset-company-filters")?.addEventListener("click", async () => {
    companyPageState.search = "";
    companyPageState.city = "";
    companyPageState.status = "";
    companyPageState.page = 1;
    document.querySelector("#company-search").value = "";
    document.querySelector("#company-city-filter").value = "";
    document.querySelector("#company-status-filter").value = "";
    await refreshCompaniesPage();
  });

  document.querySelector("#company-notes")?.addEventListener("input", (event) => {
    document.querySelector("#company-notes-count").textContent = String(
      event.target.value.length,
    );
  });

  container.addEventListener("change", (event) => {
    const accountInput = event.target.closest('input[name="accountIds"]');
    const locationInput = event.target.closest('input[name="locationIds"]');

    if (accountInput) {
      if (accountInput.checked) companyAssignmentState.selectedAccountIds.add(accountInput.value);
      else companyAssignmentState.selectedAccountIds.delete(accountInput.value);
      renderCompanyAssignmentOptions();
      return;
    }

    if (locationInput) {
      if (locationInput.checked) companyAssignmentState.selectedLocationIds.add(locationInput.value);
      else companyAssignmentState.selectedLocationIds.delete(locationInput.value);
      renderCompanyAssignmentOptions();
    }
  });

  document.querySelector("#company-account-search")?.addEventListener("input", (event) => {
    companyAssignmentState.accountSearch = event.target.value.trim();
    renderCompanyAssignmentOptions();
  });

  document.querySelector("#company-location-search")?.addEventListener("input", (event) => {
    companyAssignmentState.locationSearch = event.target.value.trim();
    renderCompanyAssignmentOptions();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !document.querySelector("#company-drawer")?.classList.contains("hidden")) {
      setCompanyDrawerOpen(false);
    }
  });
}

async function loadCompaniesPage() {
  const container = document.querySelector("#companies-container");

  if (!container) {
    console.error("Companies container was not found.");
    return;
  }

  try {
    if (container.dataset.loaded !== "true" || !container.innerHTML.trim()) {
      const response = await fetch("/pages/valet-companies.html");

      if (!response.ok) {
        throw new Error(`Unable to load Valet Companies page: ${response.status}`);
      }

      container.innerHTML = await response.text();
      container.dataset.loaded = "true";
    }

    bindCompanyPageEvents(container);
    await refreshCompaniesPage();
  } catch (error) {
    console.error("Unable to initialize Valet Companies:", error);
    container.dataset.loaded = "false";
    container.innerHTML = `
      <section class="page-load-error">
        <i class="fa-solid fa-triangle-exclamation"></i>
        <h2>Unable to load Valet Companies</h2>
        <p>${escapeCompanyHtml(error.message || "Please refresh and try again.")}</p>
        <button type="button" class="btn-primary" onclick="loadCompaniesPage()">Try Again</button>
      </section>
    `;
  }
}
