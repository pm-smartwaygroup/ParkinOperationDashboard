const userManagementState = {
  page: 1,
  limit: 20,
  search: "",
  role: "",
  status: "",
  companyId: "",
  requestId: 0,
  detailRequestId: 0,
  searchTimer: null,
  abortController: null,
  detailAbortController: null,
};

function getUserManagementApiBaseUrl() {
  return window.PARKIN_CONFIG?.apiBaseUrl || "https://api.parkin.com.sa";
}

function userManagementHeaders() {
  const token = localStorage.getItem("parkin_access_token");
  if (!token)
    throw new Error("Your login session has expired. Please sign in again.");
  return { Authorization: `Bearer ${token}` };
}

function userManagementRoleLabel(role) {
  return String(role || "")
    .toLowerCase()
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function userManagementScopeLabel(scope) {
  return userManagementRoleLabel(scope);
}

function userManagementInitials(name) {
  const parts = String(name || "")
    .trim()
    .split(/\s+/u)
    .filter(Boolean);
  if (!parts.length) return "--";
  return parts.length === 1
    ? parts[0].slice(0, 2).toUpperCase()
    : `${parts[0][0]}${parts.at(-1)[0]}`.toUpperCase();
}

function userManagementEscapedMessage(error) {
  if (error?.status === 403)
    return "You do not have permission to view dashboard users.";
  if (error?.status === 401)
    return "Your session has expired. Please sign in again.";
  if (error?.status >= 500) return "The service is temporarily unavailable.";
  if (error?.status === 400) return "The request could not be completed.";
  if (error?.status === 404) return "The requested user was not found.";
  return "Please check your connection and try again.";
}

async function parseUserManagementResponse(response) {
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error("User request failed");
    error.status = response.status;
    throw error;
  }
  return body?.data && Array.isArray(body.data) ? body : body?.data || body;
}

function buildUserManagementQuery() {
  const params = new URLSearchParams({
    page: String(userManagementState.page),
    limit: String(userManagementState.limit),
  });
  if (userManagementState.search)
    params.set("search", userManagementState.search);
  if (userManagementState.role) params.set("role", userManagementState.role);
  if (userManagementState.status)
    params.set("status", userManagementState.status);
  if (userManagementState.companyId)
    params.set("companyId", userManagementState.companyId);
  return params;
}

function setUserManagementState(container, name, value) {
  const element = container.querySelector(`[data-user-${name}]`);
  if (element) element.textContent = value;
}

function showUserManagementLoading(container, loading) {
  container
    .querySelector("[data-user-loading]")
    ?.classList.toggle("hidden", !loading);
  if (loading) {
    container.querySelector("[data-user-table-wrap]")?.classList.add("hidden");
    container.querySelector("[data-user-empty]")?.classList.add("hidden");
    container.querySelector("[data-user-error]")?.classList.add("hidden");
  }
}

function renderUserManagementRows(container, users) {
  const list = container.querySelector("[data-user-list]");
  list.replaceChildren();

  users.forEach((user) => {
    const row = document.createElement("tr");
    const userCell = document.createElement("td");
    userCell.dataset.label = "User";
    userCell.innerHTML = `<div class="user-management-user"><span class="user-management-avatar"></span><span><strong></strong><span></span></span></div>`;
    const avatar = userCell.querySelector(".user-management-avatar");
    avatar.textContent = userManagementInitials(user.name);
    userCell.querySelector("strong").textContent = user.name || "Unnamed user";
    userCell.querySelector(".user-management-user span span").textContent =
      user.email || "No email";

    const cells = [
      [userManagementRoleLabel(user.role), "Role"],
      [user.company?.name || "Unassigned", "Company"],
      [userManagementScopeLabel(user.accessScope), "Access Scope"],
    ];
    row.append(userCell);
    cells.forEach(([value, label]) => {
      const cell = document.createElement("td");
      cell.dataset.label = label;
      cell.textContent = value || "—";
      row.append(cell);
    });

    const status = document.createElement("td");
    status.dataset.label = "Status";
    const badge = document.createElement("span");
    badge.className = `user-management-badge ${user.isActive ? "active" : "disabled"}`;
    badge.textContent = user.isActive ? "Active" : "Disabled";
    status.append(badge);
    row.append(status);

    const employee = document.createElement("td");
    employee.dataset.label = "Employee ID";
    employee.className = "user-management-muted";
    employee.textContent = user.profile?.employeeId || "—";
    row.append(employee);

    const actions = document.createElement("td");
    actions.dataset.label = "Actions";
    const button = document.createElement("button");
    button.className = "user-management-row-action";
    button.type = "button";
    button.title = "View details";
    button.setAttribute(
      "aria-label",
      `View details for ${user.name || "user"}`,
    );
    button.innerHTML =
      '<i class="fa-solid fa-arrow-up-right-from-square" aria-hidden="true"></i>';
    button.addEventListener("click", () =>
      openUserManagementDetails(container, user.id),
    );
    actions.append(button);
    row.append(actions);
    list.append(row);
  });
}

function renderUserManagementPagination(container, pagination) {
  const target = container.querySelector("[data-user-pagination]");
  target.replaceChildren();
  const page = Number(pagination?.page) || 1;
  const totalPages = Number(pagination?.totalPages) || 1;
  if (totalPages <= 1) return;

  const addButton = (label, nextPage, disabled, active = false) => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = label;
    button.disabled = disabled;
    button.classList.toggle("active", active);
    button.addEventListener("click", () => {
      userManagementState.page = nextPage;
      refreshUserManagementPage(container);
    });
    target.append(button);
  };
  addButton("Previous", page - 1, page <= 1);
  for (let number = 1; number <= totalPages; number += 1) {
    if (
      totalPages > 7 &&
      number > 2 &&
      number < totalPages - 1 &&
      Math.abs(number - page) > 1
    )
      continue;
    addButton(String(number), number, false, number === page);
  }
  addButton("Next", page + 1, page >= totalPages);
}

function renderUserManagementCompanyFilter(container, users) {
  const filter = container.querySelector(".user-management-company-filter");
  const select = container.querySelector("[data-user-company-filter]");
  const companies = [
    ...new Map(
      users
        .filter((user) => user.company?.id)
        .map((user) => [user.company.id, user.company.name]),
    ).entries(),
  ];
  if (!companies.length) {
    filter.hidden = true;
    return;
  }
  filter.hidden = false;
  const selected = userManagementState.companyId;
  select.replaceChildren(new Option("All Companies", ""));
  companies.forEach(([id, name]) =>
    select.append(new Option(name || "Unnamed company", id)),
  );
  select.value = selected;
}

function showUserManagementError(container, error) {
  showUserManagementLoading(container, false);
  container.querySelector("[data-user-table-wrap]")?.classList.add("hidden");
  container.querySelector("[data-user-empty]")?.classList.add("hidden");
  container.querySelector("[data-user-error]")?.classList.remove("hidden");
  setUserManagementState(
    container,
    "user-error-copy",
    userManagementEscapedMessage(error),
  );
  container.querySelector("[data-user-pagination]")?.replaceChildren();
}

async function refreshUserManagementPage(container) {
  userManagementState.abortController?.abort();
  const controller = new AbortController();
  userManagementState.abortController = controller;
  const requestId = ++userManagementState.requestId;
  showUserManagementLoading(container, true);

  try {
    const response = await fetch(
      `${getUserManagementApiBaseUrl()}/users?${buildUserManagementQuery()}`,
      { headers: userManagementHeaders(), signal: controller.signal },
    );
    const result = await parseUserManagementResponse(response);
    if (requestId !== userManagementState.requestId) return;
    const users = Array.isArray(result?.data) ? result.data : [];
    const pagination = result?.pagination || {
      page: userManagementState.page,
      limit: userManagementState.limit,
      total: users.length,
      totalPages: 1,
    };
    showUserManagementLoading(container, false);
    container.querySelector("[data-user-error]")?.classList.add("hidden");
    renderUserManagementCompanyFilter(container, users);
    renderUserManagementRows(container, users);
    renderUserManagementPagination(container, pagination);
    container
      .querySelector("[data-user-table-wrap]")
      ?.classList.toggle("hidden", users.length === 0);
    container
      .querySelector("[data-user-empty]")
      ?.classList.toggle("hidden", users.length !== 0);
    const total = Number(pagination.total) || 0;
    setUserManagementState(
      container,
      "user-result-summary",
      `${total.toLocaleString()} user${total === 1 ? "" : "s"}`,
    );
    setUserManagementState(container, "user-sync-state", "Updated just now");
    container.querySelector("[data-user-empty-copy]").textContent =
      userManagementState.search ||
      userManagementState.role ||
      userManagementState.status ||
      userManagementState.companyId
        ? "No users match your current filters."
        : "No dashboard users have been added yet.";
  } catch (error) {
    if (error.name === "AbortError") return;
    showUserManagementError(container, error);
  }
}

async function openUserManagementDetails(container, userId) {
  const drawer = container.querySelector("[data-user-drawer]");
  const body = container.querySelector("[data-user-drawer-body]");
  userManagementState.detailAbortController?.abort();
  const controller = new AbortController();
  userManagementState.detailAbortController = controller;
  const requestId = ++userManagementState.detailRequestId;
  drawer.classList.remove("hidden");
  drawer.setAttribute("aria-hidden", "false");
  container
    .querySelector("[data-user-drawer-backdrop]")
    ?.classList.remove("hidden");
  container
    .querySelector(".user-management-drawer-backdrop")
    ?.classList.remove("hidden");
  body.innerHTML =
    '<div class="user-management-detail-loading"><span></span><span></span><span></span></div>';
  container.querySelector("[data-close-user-drawer]")?.focus({ preventScroll: true });
  try {
    const response = await fetch(
      `${getUserManagementApiBaseUrl()}/users/${encodeURIComponent(userId)}`,
      { headers: userManagementHeaders(), signal: controller.signal },
    );
    const result = await parseUserManagementResponse(response);
    if (requestId !== userManagementState.detailRequestId) return;
    renderUserManagementDetails(body, result?.user || result);
  } catch (error) {
    if (error?.name === "AbortError" || requestId !== userManagementState.detailRequestId) return;
    body.innerHTML = "";
    const message = document.createElement("p");
    message.className = "user-management-muted";
    message.textContent = userManagementEscapedMessage(error);
    body.append(message);
  }
}

function renderUserManagementDetails(body, user) {
  body.innerHTML =
    '<div class="user-management-detail-hero"><span class="user-management-avatar"></span><div><h3></h3><p></p></div></div><section class="user-management-detail-section"><h3>Account</h3><dl class="user-management-detail-grid"></dl></section><section class="user-management-detail-section"><h3>Preferences</h3><dl class="user-management-detail-grid"></dl></section>';
  body.querySelector(".user-management-avatar").textContent =
    userManagementInitials(user?.name);
  body.querySelector("h3").textContent = user?.name || "Unnamed user";
  body.querySelector(".user-management-detail-hero p").textContent =
    user?.email || "No email";
  const sections = body.querySelectorAll(".user-management-detail-grid");
  const account = [
    ["Role", userManagementRoleLabel(user?.role)],
    ["Company", user?.company?.name || "Unassigned"],
    ["Access scope", userManagementScopeLabel(user?.accessScope)],
    ["Status", user?.isActive ? "Active" : "Disabled"],
    ["Employee ID", user?.profile?.employeeId || "—"],
    [
      "Phone",
      [user?.profile?.phoneCountryCode, user?.profile?.phoneNumber]
        .filter(Boolean)
        .join(" ") || "—",
    ],
    ["Department", user?.profile?.department || "—"],
    ["Region", user?.profile?.region || "—"],
  ];
  const preferences = [
    ["Preferred language", user?.profile?.preferredLanguage || "—"],
    ["Time zone", user?.profile?.timeZone || "—"],
    ["Date format", user?.profile?.dateFormat || "—"],
  ];
  [account, preferences].forEach((items, index) =>
    items.forEach(([label, value]) => {
      const wrapper = document.createElement("div");
      const term = document.createElement("dt");
      term.textContent = label;
      const detail = document.createElement("dd");
      detail.textContent = value;
      wrapper.append(term, detail);
      sections[index].append(wrapper);
    }),
  );
}

function closeUserManagementDetails(container) {
  userManagementState.detailAbortController?.abort();
  userManagementState.detailRequestId += 1;
  const drawer = container.querySelector("[data-user-drawer]");
  drawer?.classList.add("hidden");
  drawer?.setAttribute("aria-hidden", "true");
  container
    .querySelector(".user-management-drawer-backdrop")
    ?.classList.add("hidden");
}

function cancelUserManagementRequests() {
  userManagementState.abortController?.abort();
  userManagementState.detailAbortController?.abort();
  userManagementState.requestId += 1;
  userManagementState.detailRequestId += 1;
  window.clearTimeout(userManagementState.searchTimer);
}

function clearUserManagementFilters(container) {
  userManagementState.page = 1;
  userManagementState.search = "";
  userManagementState.role = "";
  userManagementState.status = "";
  userManagementState.companyId = "";
  container.querySelector("[data-user-search]").value = "";
  container.querySelector("[data-user-role-filter]").value = "";
  container.querySelector("[data-user-status-filter]").value = "";
  refreshUserManagementPage(container);
}

function bindUserManagementPage(container) {
  if (container.dataset.eventsBound === "true") return;
  container.dataset.eventsBound = "true";
  const reload = () => {
    userManagementState.page = 1;
    refreshUserManagementPage(container);
  };
  container
    .querySelector("[data-user-search]")
    .addEventListener("input", (event) => {
      window.clearTimeout(userManagementState.searchTimer);
      userManagementState.searchTimer = window.setTimeout(() => {
        userManagementState.search = event.target.value.trim();
        userManagementState.page = 1;
        refreshUserManagementPage(container);
      }, 350);
    });
  ["role", "status", "company"].forEach((name) =>
    container
      .querySelector(`[data-user-${name}-filter]`)
      ?.addEventListener("change", (event) => {
        userManagementState[name === "company" ? "companyId" : name] =
          event.target.value;
        reload();
      }),
  );
  container
    .querySelector("[data-user-refresh]")
    .addEventListener("click", reload);
  container
    .querySelector("[data-user-retry]")
    .addEventListener("click", reload);
  container
    .querySelector("[data-clear-user-filters]")
    .addEventListener("click", () => clearUserManagementFilters(container));
  container
    .querySelector("[data-add-user]")
    .addEventListener("click", () =>
      window.showDashboardAlert?.(
        "User creation will be available in the next User Management update.",
        { title: "Add User", type: "info" },
      ),
    );
  container
    .querySelectorAll("[data-close-user-drawer]")
    .forEach((button) =>
      button.addEventListener("click", () =>
        closeUserManagementDetails(container),
      ),
    );
  container.addEventListener("keydown", (event) => {
    if (
      event.key === "Escape" &&
      !container
        .querySelector("[data-user-drawer]")
        ?.classList.contains("hidden")
    ) {
      closeUserManagementDetails(container);
    }
  });
}

async function loadUserManagementPage() {
  const container = document.querySelector("#user-management-container");
  if (!container) return;
  if (container.dataset.loaded !== "true" || !container.innerHTML.trim()) {
    try {
      const response = await fetch("/pages/user-management.html");
      if (!response.ok) throw new Error("Unable to load User Management page.");
      container.innerHTML = await response.text();
      container.dataset.loaded = "true";
    } catch {
      container.innerHTML =
        '<section class="user-management-error"><h2>Unable to load User Management</h2><p>Please refresh the page and try again.</p></section>';
      return;
    }
  }
  bindUserManagementPage(container);
  await refreshUserManagementPage(container);
}

window.loadUserManagementPage = loadUserManagementPage;
window.cancelUserManagementRequests = cancelUserManagementRequests;
