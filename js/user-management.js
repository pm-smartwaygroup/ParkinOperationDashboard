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
  permissionsRequestId: 0,
  permissionsAbortController: null,
  detailOpener: null,
  detailUser: null,
  statusUpdating: false,
  permissionMatrix: [],
  permissionEdit: null,
};

function getUserManagementApiBaseUrl() {
  return (
    window.PARKIN_CONFIG?.userManagementApiBaseUrl ||
    window.PARKIN_CONFIG?.apiBaseUrl ||
    "https://api.parkin.com.sa"
  );
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

function getUserLifecycleStatus(user) {
  if (user?.isActive === true) return "ACTIVE";
  if (user?.passwordSetupCompleted === false) return "SETUP_PENDING";
  return "DISABLED";
}

function userLifecycleLabel(status) {
  return {
    ACTIVE: "Active",
    DISABLED: "Disabled",
    SETUP_PENDING: "Setup Pending",
  }[status] || "Disabled";
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

function getUserManagementInitials(name) {
  const parts = String(name || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (!parts.length) return "?";

  const firstInitial = parts[0].charAt(0).toUpperCase();

  if (parts.length === 1) {
    return firstInitial;
  }

  const lastInitial = parts[parts.length - 1].charAt(0).toUpperCase();

  return `${firstInitial}${lastInitial}`;
}

function renderUserManagementAvatar(avatar, user) {
  if (!avatar) return;

  avatar.replaceChildren();

  const initials = getUserManagementInitials(user?.name);

  const renderInitials = () => {
    avatar.replaceChildren();

    const fallback = document.createElement("span");
    fallback.className = "user-management-avatar-initials";
    fallback.textContent = initials;

    avatar.appendChild(fallback);
  };

  if (user?.profilePhotoUrl) {
    const image = document.createElement("img");
    image.className = "user-management-avatar-image";
    image.alt = "";
    image.src = user.profilePhotoUrl;

    image.addEventListener(
      "error",
      () => {
        renderInitials();
      },
      { once: true },
    );

    avatar.appendChild(image);
    return;
  }

  renderInitials();
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
  const data = body?.data ?? body;

  if (Array.isArray(data)) return body?.pagination ? body : data;
  if (data?.user && !data?.permissions) return data.user;
  if (data?.data && !Array.isArray(data.data) && !data.pagination) {
    return data.data;
  }

  return data;
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
    userCell.innerHTML = `
      <div class="user-management-user">
        <span class="user-management-avatar" aria-hidden="true"></span>

        <span class="user-management-user-info">
          <strong data-user-row-name></strong>
          <span data-user-row-email></span>
        </span>
      </div>
    `;

    const avatar = userCell.querySelector(".user-management-avatar");

    renderUserManagementAvatar(avatar, user);

    userCell.querySelector("[data-user-row-name]").textContent =
      user.name || "Unnamed user";

    userCell.querySelector("[data-user-row-email]").textContent =
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
    const lifecycle = getUserLifecycleStatus(user);
    badge.className = `user-management-badge ${lifecycle.toLowerCase().replaceAll("_", "-")}`;
    badge.textContent = userLifecycleLabel(lifecycle);
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
  userManagementState.detailOpener =
    document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
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
  container
    .querySelector("[data-close-user-drawer]")
    ?.focus({ preventScroll: true });
  try {
    const response = await fetch(
      `${getUserManagementApiBaseUrl()}/users/${encodeURIComponent(userId)}`,
      { headers: userManagementHeaders(), signal: controller.signal },
    );
    const result = await parseUserManagementResponse(response);
    if (requestId !== userManagementState.detailRequestId) return;
    userManagementState.detailUser = result;
    userManagementState.permissionEdit = null;
    renderUserManagementDetails(body, result);
    if (result?.role === "SUPER_ADMIN") {
      renderSuperAdminAccess(body);
    } else {
      loadUserManagementPermissions(container, result, requestId);
    }
  } catch (error) {
    if (
      error?.name === "AbortError" ||
      requestId !== userManagementState.detailRequestId
    )
      return;
    body.innerHTML = "";
    const message = document.createElement("p");
    message.className = "user-management-muted";
    message.textContent = userManagementEscapedMessage(error);
    body.append(message);
  }
}

function renderUserManagementDetails(body, user) {
  body.innerHTML =
    '<div class="user-management-detail-hero"><span class="user-management-avatar"></span><div class="user-management-detail-identity"><h3></h3><p></p><span class="user-management-detail-role"></span></div></div><section class="user-management-detail-section user-management-account-section"><div class="user-management-detail-section-title"><div><p class="user-management-section-kicker">Account information</p><h3>Account</h3></div></div><dl class="user-management-detail-grid"></dl></section><section class="user-management-detail-section user-management-account-actions" data-user-account-actions><div class="user-management-detail-section-title"><div><p class="user-management-section-kicker">Lifecycle</p><h3>Account actions</h3></div></div><div data-user-account-action-body></div></section><section class="user-management-detail-section user-management-access-section" data-user-permissions><div class="user-management-section-heading"><div><p class="user-management-section-kicker">Permissions</p><h3>Screen Access</h3></div><span data-user-permission-count></span></div><div data-user-permission-body></div><div class="user-management-permission-legend" data-user-permission-legend><span><i class="fa-solid fa-check" aria-hidden="true"></i> Granted</span><span><i class="fa-solid fa-minus" aria-hidden="true"></i> Not granted</span><span><i class="fa-solid fa-circle-info" aria-hidden="true"></i> Role default</span></div></section><section class="user-management-detail-section user-management-preferences-section"><div class="user-management-detail-section-title"><div><p class="user-management-section-kicker">Personalization</p><h3>Preferences</h3></div></div><dl class="user-management-detail-grid"></dl></section>';
  renderUserManagementAvatar(
    body.querySelector(".user-management-avatar"),
    user,
  );
  body.querySelector("h3").textContent = user?.name || "—";
  body.querySelector(".user-management-detail-hero p").textContent =
    user?.email || "No email";
  body.querySelector(".user-management-detail-role").textContent =
    userManagementRoleLabel(user?.role) || "—";
  const sections = body.querySelectorAll(".user-management-detail-grid");
  const account = [
    ["Role", userManagementRoleLabel(user?.role) || "—"],
    ["Company", user?.company?.name || "Unassigned"],
    ["Access scope", userManagementScopeLabel(user?.accessScope) || "—"],
    [
      "Status",
      typeof user?.isActive === "boolean"
        ? user.isActive
          ? "Active"
          : "Disabled"
        : "—",
    ],
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
  const lifecycle = getUserLifecycleStatus(user);
  const statusDetail = [...sections[0].querySelectorAll("dd")].find(
    (detail) => detail.previousElementSibling?.textContent === "Status",
  );
  if (statusDetail) {
    statusDetail.textContent = userLifecycleLabel(lifecycle);
    statusDetail.classList.add(`user-management-lifecycle-${lifecycle.toLowerCase().replaceAll("_", "-")}`);
    if (lifecycle === "SETUP_PENDING") {
      const helper = document.createElement("small");
      helper.className = "user-management-lifecycle-helper";
      helper.textContent = "Initial password setup has not been completed.";
      statusDetail.append(helper);
    }
  }
  renderUserAccountActions(body, user, lifecycle);
}

function renderUserAccountActions(body, user, lifecycle = getUserLifecycleStatus(user)) {
  const actionBody = body.querySelector("[data-user-account-action-body]");
  if (!actionBody) return;
  actionBody.replaceChildren();
  if (user?.role === "SUPER_ADMIN") {
    const note = document.createElement("p");
    note.className = "user-management-muted";
    note.textContent = "Super Admin account actions are managed through a separate protected flow.";
    actionBody.append(note);
    return;
  }
  if (user?.id === window.getParkinCurrentUserId?.()) {
    const note = document.createElement("p");
    note.className = "user-management-muted";
    note.textContent = "Your account is managed through your profile settings.";
    actionBody.append(note);
    return;
  }

  const action = (label, icon, actionName, options = {}) => {
    const button = document.createElement("button");
    button.className = `user-management-button ${options.primary ? "primary" : "secondary"}`;
    button.type = "button";
    button.dataset.userLifecycleAction = actionName;
    button.textContent = label;
    const iconElement = document.createElement("i");
    iconElement.className = `fa-solid ${icon}`;
    iconElement.setAttribute("aria-hidden", "true");
    button.prepend(iconElement);
    if (options.disabled || userManagementState.statusUpdating) {
      button.disabled = true;
      button.title = options.title;
    }
    return button;
  };

  const actions = document.createElement("div");
  actions.className = "user-management-lifecycle-actions";
  if (lifecycle === "ACTIVE") {
    if (window.hasDashboardPermission?.("users.disable")) {
      actions.append(action("Disable User", "fa-user-slash", "DISABLED", { primary: false }));
    }
  } else if (lifecycle === "SETUP_PENDING") {
    if (window.hasDashboardPermission?.("users.edit")) {
      actions.append(action("Set Initial Password", "fa-key", "SET_INITIAL_PASSWORD", { primary: false }));
    }
    if (window.hasDashboardPermission?.("users.disable")) {
      actions.append(
        action("Activate User", "fa-user-check", "ACTIVE", {
          disabled: true,
          title: "Password setup must be completed before this account can be activated.",
        }),
      );
    }
    const helper = document.createElement("p");
    helper.className = "user-management-lifecycle-helper";
    helper.textContent = "Password setup must be completed before this account can be activated.";
    actionBody.append(actions, helper);
    return;
  } else {
    if (window.hasDashboardPermission?.("users.disable")) {
      actions.append(action("Activate User", "fa-user-check", "ACTIVE", { primary: true }));
    }
  }
  actionBody.append(actions);
}

async function updateUserManagementStatus(container, targetId, nextStatus) {
  if (userManagementState.statusUpdating) return;
  if (userManagementState.detailUser?.id !== targetId) return;
  const user = userManagementState.detailUser;
  if (nextStatus === "ACTIVE" && getUserLifecycleStatus(user) !== "DISABLED") {
    return;
  }

  const isActivation = nextStatus === "ACTIVE";
  window.showDashboardAlert?.(
    isActivation
      ? "This will restore dashboard access using the user's existing password."
      : "This will immediately revoke the user's active sessions and prevent access until the account is activated again.",
    {
      title: isActivation ? "Activate User?" : "Disable User?",
      type: "warning",
      buttonText: isActivation ? "Activate User" : "Disable User",
      cancelButtonText: "Cancel",
      onConfirm: async () => {
        if (userManagementState.detailUser?.id !== targetId) return;
        const body = container.querySelector("[data-user-drawer-body]");
        userManagementState.statusUpdating = true;
        renderUserAccountActions(body, userManagementState.detailUser);
        try {
          const response = await fetch(
            `${getUserManagementApiBaseUrl()}/users/${encodeURIComponent(targetId)}/status`,
            {
              method: "PATCH",
              headers: {
                ...userManagementHeaders(),
                "Content-Type": "application/json",
              },
              body: JSON.stringify({ status: nextStatus }),
            },
          );
          await parseUserManagementResponse(response);
          await refreshUserManagementPage(container);
          if (userManagementState.detailUser?.id === targetId) {
            await openUserManagementDetails(container, targetId);
          }
          window.showDashboardAlert?.(
            isActivation
              ? "User activated successfully."
              : "User disabled successfully.",
            {
              title: "Account status updated",
              type: "success",
            },
          );
        } catch (error) {
          const message =
            error?.status === 400
              ? isActivation
                ? "Account cannot be activated until password setup is completed."
                : "The account status could not be updated."
              : error?.status === 403
                ? "You do not have permission to change this account status."
                : error?.status === 404
                  ? "User not found."
                  : "Unable to update account status. Please try again.";
          window.showDashboardAlert?.(message, {
            title: "Status update failed",
            type: "error",
          });
        } finally {
          userManagementState.statusUpdating = false;
          if (body && userManagementState.detailUser?.id === targetId) {
            renderUserAccountActions(body, userManagementState.detailUser);
          }
        }
      },
    },
  );
}

function openInitialPasswordModal(container, user) {
  const targetId = user?.id;
  if (!targetId) return;

  document.querySelector("[data-user-initial-password-dialog]")?.remove();
  const dialog = document.createElement("dialog");
  dialog.className = "user-initial-password-dialog";
  dialog.dataset.userInitialPasswordDialog = "true";
  dialog.setAttribute("role", "dialog");
  dialog.setAttribute("aria-modal", "true");
  dialog.setAttribute("aria-labelledby", "user-management-password-title");
  dialog.setAttribute(
    "aria-describedby",
    "user-management-password-requirements",
  );

  const header = document.createElement("div");
  header.className = "user-management-password-dialog-header";
  const heading = document.createElement("div");
  const eyebrow = document.createElement("p");
  eyebrow.className = "user-management-section-kicker";
  eyebrow.textContent = "Account security";
  const title = document.createElement("h2");
  title.id = "user-management-password-title";
  title.textContent = "Set Initial Password";
  heading.append(eyebrow, title);
  const close = document.createElement("button");
  close.className = "user-management-icon-button";
  close.type = "button";
  close.setAttribute("aria-label", "Close initial password dialog");
  close.title = "Close";
  const closeIcon = document.createElement("i");
  closeIcon.className = "fa-solid fa-xmark";
  closeIcon.setAttribute("aria-hidden", "true");
  close.append(closeIcon);
  header.append(heading, close);

  const identity = document.createElement("p");
  identity.className = "user-management-password-dialog-identity";
  identity.textContent = `${user.name || "Unnamed user"} · ${user.email || "No email"}`;

  const form = document.createElement("form");
  form.noValidate = true;
  form.className = "user-management-password-form";
  const fields = [];
  const addField = (labelText, name, autocomplete) => {
    const label = document.createElement("label");
    label.className = "user-management-password-field";
    const labelTextElement = document.createElement("span");
    labelTextElement.textContent = `${labelText} *`;
    const inputWrap = document.createElement("span");
    inputWrap.className = "user-management-password-input-wrap";
    const input = document.createElement("input");
    input.type = "password";
    input.name = name;
    input.autocomplete = autocomplete;
    input.minLength = 8;
    input.required = true;
    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "user-management-password-toggle";
    toggle.setAttribute("aria-label", `Show ${labelText.toLowerCase()}`);
    toggle.title = `Show ${labelText.toLowerCase()}`;
    const toggleIcon = document.createElement("i");
    toggleIcon.className = "fa-solid fa-eye";
    toggleIcon.setAttribute("aria-hidden", "true");
    toggle.append(toggleIcon);
    const error = document.createElement("small");
    error.className = "user-management-password-error";
    error.setAttribute("role", "alert");
    inputWrap.append(input, toggle);
    label.append(labelTextElement, inputWrap, error);
    toggle.addEventListener("click", () => {
      const visible = input.type === "text";
      input.type = visible ? "password" : "text";
      toggleIcon.className = `fa-solid ${visible ? "fa-eye" : "fa-eye-slash"}`;
      toggle.setAttribute("aria-label", `${visible ? "Show" : "Hide"} ${labelText.toLowerCase()}`);
      toggle.title = toggle.getAttribute("aria-label");
    });
    fields.push({ input, error });
    form.append(label);
  };
  addField("Initial Password", "password", "new-password");
  addField("Confirm Password", "confirmPassword", "new-password");

  const requirements = document.createElement("p");
  requirements.className = "user-management-password-requirements";
  requirements.id = "user-management-password-requirements";
  requirements.textContent = "At least 8 characters, including one letter and one number.";

  const actions = document.createElement("div");
  actions.className = "user-management-password-actions";
  const cancel = document.createElement("button");
  cancel.className = "user-management-button secondary";
  cancel.type = "button";
  cancel.textContent = "Cancel";
  const submit = document.createElement("button");
  submit.className = "user-management-button primary";
  submit.type = "submit";
  submit.textContent = "Set Password";
  actions.append(cancel, submit);
  form.append(requirements, actions);
  dialog.append(header, identity, form);
  document.body.append(dialog);

  const closeModal = () => {
    fields.forEach(({ input }) => {
      input.value = "";
    });
    document.removeEventListener("keydown", handleEscape, true);
    if (dialog.open) dialog.close();
    dialog.remove();
  };
  const handleEscape = (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      closeModal();
    }
  };
  const setFieldError = (field, message) => {
    field.error.textContent = message;
    field.input.toggleAttribute("aria-invalid", Boolean(message));
  };

  close.addEventListener("click", closeModal);
  cancel.addEventListener("click", closeModal);
  document.addEventListener("keydown", handleEscape, true);
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const [passwordField, confirmField] = fields;
    const password = passwordField.input.value;
    const confirmPassword = confirmField.input.value;
    setFieldError(passwordField, "");
    setFieldError(confirmField, "");
    if (!password) setFieldError(passwordField, "Enter an initial password.");
    else if (password.length < 8) setFieldError(passwordField, "Use at least 8 characters.");
    else if (!/[A-Za-z]/.test(password)) setFieldError(passwordField, "Include at least one letter.");
    else if (!/[0-9]/.test(password)) setFieldError(passwordField, "Include at least one number.");
    if (!confirmPassword) setFieldError(confirmField, "Confirm the initial password.");
    else if (password !== confirmPassword) setFieldError(confirmField, "Passwords do not match.");
    if (fields.some(({ error }) => error.textContent)) return;
    if (userManagementState.detailUser?.id !== targetId) {
      setFieldError(confirmField, "The selected user changed. Close and try again.");
      return;
    }

    submit.disabled = true;
    cancel.disabled = true;
    submit.textContent = "Setting Password...";
    try {
      const response = await fetch(
        `${getUserManagementApiBaseUrl()}/users/${encodeURIComponent(targetId)}/initial-password`,
        {
          method: "PATCH",
          headers: {
            ...userManagementHeaders(),
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ password, confirmPassword }),
        },
      );
      await parseUserManagementResponse(response);
      closeModal();
      await refreshUserManagementPage(container);
      if (userManagementState.detailUser?.id === targetId) {
        await openUserManagementDetails(container, targetId);
      }
      window.showDashboardAlert?.("Initial password set successfully.", {
        title: "Password updated",
        type: "success",
      });
    } catch (error) {
      submit.disabled = false;
      cancel.disabled = false;
      submit.textContent = "Set Password";
      const message =
        error?.status === 400
          ? "Please review the password requirements."
          : error?.status === 403
            ? "You do not have permission to set this user's initial password."
            : error?.status === 404
              ? "User not found."
              : error?.status === 409
                ? "Initial password has already been established."
                : "Unable to set initial password. Please try again.";
      window.showDashboardAlert?.(message, {
        title: "Password update failed",
        type: "error",
      });
    }
  });
  dialog.addEventListener("close", () => {
    fields.forEach(({ input }) => {
      input.value = "";
    });
    document.removeEventListener("keydown", handleEscape, true);
    dialog.remove();
  });
  dialog.showModal();
  fields[0].input.focus();
}

function permissionModuleLabel(module) {
  if (module === "users") return "User Management";
  return userManagementRoleLabel(module);
}

function permissionModuleIcon(module) {
  const icons = {
    dashboard: "fa-chart-pie",
    locations: "fa-location-dot",
    drivers: "fa-id-card",
    customers: "fa-users",
    bookings: "fa-calendar-check",
    vehicles: "fa-car",
    "valet-companies": "fa-building",
    valet_companies: "fa-building",
    valet_operations: "fa-briefcase",
    revenue: "fa-chart-line",
    reports: "fa-file-lines",
    alerts: "fa-bell",
    users: "fa-user-gear",
    settings: "fa-sliders",
    "audit-logs": "fa-clock-rotate-left",
    audit_logs: "fa-clock-rotate-left",
  };
  const icon = document.createElement("i");
  icon.className = `fa-solid ${icons[String(module || "").toLowerCase()] || "fa-layer-group"}`;
  icon.setAttribute("aria-hidden", "true");
  return icon;
}

function permissionActionLabel(action) {
  return userManagementRoleLabel(action);
}

function permissionDisplayLabel(permission) {
  if (permission.code === "users.permissions") return "Manage User Permissions";
  return `${permissionActionLabel(permission.action)} ${permissionModuleLabel(permission.module)}`;
}

function renderSuperAdminAccess(body) {
  const section = body.querySelector("[data-user-permissions]");
  const permissionBody = section?.querySelector("[data-user-permission-body]");
  if (!section || !permissionBody) return;
  section.querySelector("[data-user-edit-access]")?.remove();
  section.querySelector("[data-user-permission-legend]")?.remove();
  section.querySelector("[data-user-permission-count]").textContent =
    "Full access";
  permissionBody.innerHTML =
    '<div class="user-management-access-summary"><i class="fa-solid fa-shield-halved" aria-hidden="true"></i><div><strong>Full system access</strong><p>Super Admin has access to all active dashboard permissions.</p></div></div>';
}

function permissionOverrideState(permission) {
  return permission?.override === "ALLOW" || permission?.override === "DENY"
    ? permission.override
    : "DEFAULT";
}

function createPermissionEditState(permissions) {
  const original = new Map(
    permissions.map((permission) => [
      permission.code,
      permissionOverrideState(permission),
    ]),
  );
  return {
    targetId: userManagementState.detailUser?.id,
    permissions,
    original,
    current: new Map(original),
    saving: false,
  };
}

function getPermissionEditState(editState, code) {
  return editState?.current.get(code) || "DEFAULT";
}

function setPermissionEditState(editState, code, state) {
  if (!editState || !code || !["DEFAULT", "ALLOW", "DENY"].includes(state)) {
    return;
  }
  editState.current.set(code, state);
}

function permissionEditChanged(editState) {
  if (!editState) return false;
  return editState.permissions.some(
    (permission) =>
      editState.current.get(permission.code) !==
      editState.original.get(permission.code),
  );
}

function renderPermissionEditActions(section, editState) {
  section.querySelector("[data-user-edit-access]")?.remove();
  section.querySelector("[data-user-cancel-access]")?.remove();
  section.querySelector("[data-save-user-access]")?.remove();
  const heading = section.querySelector(".user-management-section-heading");
  if (!heading) return;
  const actions = document.createElement("div");
  actions.className = "user-management-access-actions";
  if (
    !editState &&
    section.closest("[data-user-drawer-body]") &&
    userManagementState.detailUser?.id !== window.getParkinCurrentUserId?.() &&
    window.hasDashboardPermission?.("users.permissions")
  ) {
    const button = document.createElement("button");
    button.className = "user-management-button secondary user-management-edit-access";
    button.type = "button";
    button.dataset.userEditAccess = "true";
    button.textContent = "Edit Access";
    actions.append(button);
  } else {
    const cancel = document.createElement("button");
    cancel.className = "user-management-button secondary";
    cancel.type = "button";
    cancel.dataset.userCancelAccess = "true";
    cancel.textContent = "Cancel";
    cancel.disabled = editState.saving;
    const save = document.createElement("button");
    save.className = "user-management-button primary";
    save.type = "button";
    save.dataset.saveUserAccess = "true";
    save.disabled = editState.saving || !permissionEditChanged(editState);
    save.textContent = editState.saving ? "Saving..." : "Save Changes";
    actions.append(cancel, save);
  }
  heading.append(actions);
}

function renderPermissionLoading(body) {
  const permissionBody = body.querySelector("[data-user-permission-body]");
  if (!permissionBody) return;
  body.querySelector("[data-user-permission-count]").textContent = "Loading";
  permissionBody.innerHTML =
    '<div class="user-management-permission-skeleton"><span></span><span></span><span></span></div>';
}

function renderPermissionError(body, message, retry) {
  const permissionBody = body.querySelector("[data-user-permission-body]");
  if (!permissionBody) return;
  body.querySelector("[data-user-permission-count]").textContent = "";
  permissionBody.replaceChildren();
  const state = document.createElement("div");
  state.className = "user-management-access-error";
  const text = document.createElement("p");
  text.textContent = message;
  const button = document.createElement("button");
  button.className = "user-management-button secondary";
  button.type = "button";
  button.textContent = "Retry";
  button.addEventListener("click", retry);
  state.append(text, button);
  permissionBody.append(state);
}

function renderPermissionMatrix(body, permissions) {
  const section = body.querySelector("[data-user-permissions]");
  const permissionBody = section?.querySelector("[data-user-permission-body]");
  if (!section || !permissionBody) return;
  userManagementState.permissionMatrix = permissions;
  const editState = userManagementState.permissionEdit;
  const granted = permissions.filter(
    (permission) => effectivePermissionState(permission, editState),
  );
  section.querySelector("[data-user-permission-count]").textContent =
    `${granted.length} granted`;
  renderPermissionEditActions(section, editState);
  permissionBody.replaceChildren();
  const groups = new Map();
  permissions.forEach((permission) => {
    if (!groups.has(permission.module)) groups.set(permission.module, []);
    groups.get(permission.module).push(permission);
  });
  const columns = ["view", "create", "edit", "delete"];
  const sortedGroups = [...groups.entries()].sort(([left], [right]) =>
    permissionModuleLabel(left).localeCompare(permissionModuleLabel(right)),
  );
  const table = document.createElement("div");
  table.className = "user-management-permission-table";
  const header = document.createElement("div");
  header.className =
    "user-management-permission-grid user-management-permission-header";
  ["Module", "View", "Create", "Edit", "Delete", "Other"].forEach((label) => {
    const cell = document.createElement("span");
    cell.textContent = label;
    header.append(cell);
  });
  table.append(header);
  const cards = document.createElement("div");
  cards.className = "user-management-permission-cards";

  sortedGroups.forEach(([module, items]) => {
    const byAction = new Map(
      items.map((permission) => [permission.action, permission]),
    );
    items.sort(
      (left, right) =>
        left.action.localeCompare(right.action) ||
        left.code.localeCompare(right.code),
    );
    const row = document.createElement("div");
    row.className =
      "user-management-permission-grid user-management-permission-data-row";
    const moduleCell = document.createElement("div");
    moduleCell.className = "user-management-permission-module";
    moduleCell.append(permissionModuleIcon(module));
    const moduleName = document.createElement("strong");
    moduleName.textContent = permissionModuleLabel(module);
    moduleCell.append(moduleName);
    row.append(moduleCell);
    columns.forEach((action) =>
      row.append(createPermissionCell(byAction.get(action), false, editState)),
    );
    const otherCell = document.createElement("div");
    otherCell.className =
      "user-management-permission-cell user-management-permission-other";
    items
      .filter(({ action }) => !columns.includes(action))
      .forEach((permission) => {
        otherCell.append(createPermissionCell(permission, true, editState));
      });
    if (!otherCell.children.length) otherCell.append(createPermissionCell());
    row.append(otherCell);
    table.append(row);

    const card = document.createElement("article");
    card.className = "user-management-permission-card";
    const cardHeading = document.createElement("h4");
    cardHeading.append(permissionModuleIcon(module));
    const cardHeadingText = document.createElement("span");
    cardHeadingText.textContent = permissionModuleLabel(module);
    cardHeading.append(cardHeadingText);
    card.append(cardHeading);
    [
      ...columns,
      ...items
        .filter(({ action }) => !columns.includes(action))
        .map(({ action }) => action),
    ].forEach((action) => {
      const permission = byAction.get(action);
      const cardRow = document.createElement("div");
      cardRow.className = "user-management-permission-card-row";
      const label = document.createElement("span");
      label.textContent = permissionActionLabel(action);
      cardRow.append(
        label,
        createPermissionCell(permission, false, editState),
      );
      card.append(cardRow);
    });
    cards.append(card);
  });
  permissionBody.append(table, cards);
}

function effectivePermissionState(permission, editState) {
  if (!editState) return permission.effective === true;
  const state = getPermissionEditState(editState, permission.code);
  return state === "ALLOW" || (state === "DEFAULT" && permission.roleDefault === true);
}

function permissionSourceLabel(permission) {
  if (!permission) return "Not granted";
  if (permission.override === "ALLOW") return "Explicit Allow";
  if (permission.override === "DENY") return "Explicit Deny";
  if (permission.roleDefault === true) return "Role Default";
  return "Not Granted";
}

function createPermissionCell(permission, showAction = false, editState = null) {
  const cell = document.createElement("div");
  cell.className = "user-management-permission-cell";
  if (!permission) {
    cell.classList.add("is-empty");
    cell.textContent = "—";
    cell.title = "Not granted";
    return cell;
  }
  const state = editState?.current.get(permission.code) || "DEFAULT";
  const granted = editState
    ? effectivePermissionState(permission, editState)
    : permission.effective === true;
  if (editState) {
    cell.classList.add("is-editing", `permission-state-${state.toLowerCase()}`);
    if (showAction) cell.classList.add("user-management-permission-edit-row");
    if (showAction) {
      const actionLabel = document.createElement("span");
      actionLabel.className = "user-management-permission-edit-label";
      actionLabel.textContent = permissionActionLabel(permission.action);
      cell.append(actionLabel);
    }
    const control = document.createElement("button");
    control.type = "button";
    control.className = "user-management-permission-control";
    control.dataset.permissionControl = "true";
    control.dataset.permissionCode = permission.code;
    control.disabled = editState.saving;
    control.title = `${stateLabel(state, granted)}: ${permission.code}`;
    control.setAttribute(
      "aria-label",
      `${permissionDisplayLabel(permission)}: ${stateLabel(state, granted)}`,
    );
    control.textContent = stateSymbol(state, granted);
    const menu = document.createElement("div");
    menu.className = "user-management-permission-menu hidden";
    menu.setAttribute("role", "menu");
    ["DEFAULT", "ALLOW", "DENY"].forEach((optionState) => {
      const option = document.createElement("button");
      option.type = "button";
      option.className = "user-management-permission-option";
      option.dataset.permissionState = optionState;
      option.dataset.permissionCode = permission.code;
      option.setAttribute("role", "menuitem");
      option.textContent = stateLabel(
        optionState,
        optionState === "ALLOW" ||
          (optionState === "DEFAULT" && permission.roleDefault === true),
      );
      option.disabled = editState.saving;
      if (optionState === state) option.setAttribute("aria-current", "true");
      menu.append(option);
    });
    cell.append(control, menu);
    return cell;
  }
  cell.classList.add(granted ? "is-granted" : "is-denied");
  const label = document.createElement("span");
  label.textContent = showAction
    ? `${permissionActionLabel(permission.action)} ${granted ? "✓" : "—"}`
    : granted
      ? "✓"
      : "—";
  cell.append(label);
  cell.title = `${permission.code}: ${permissionSourceLabel(permission)}`;
  const status = document.createElement("span");
  status.className = "sr-only";
  status.textContent = `${granted ? "Granted" : "Not granted"}. ${permissionSourceLabel(permission)}.`;
  cell.append(status);
  return cell;
}

function stateLabel(state, granted) {
  if (state === "ALLOW") return "Allow";
  if (state === "DENY") return "Deny";
  return granted ? "Default - Role access" : "Default - Not granted";
}

function stateSymbol(state, granted) {
  if (state === "ALLOW") return "✓";
  if (state === "DENY") return "×";
  return granted ? "•" : "—";
}

function beginPermissionEdit(body) {
  if (!userManagementState.permissionMatrix.length) return;
  userManagementState.permissionEdit = createPermissionEditState(
    userManagementState.permissionMatrix,
  );
  renderPermissionMatrix(body, userManagementState.permissionMatrix);
}

function cancelPermissionEdit(body) {
  userManagementState.permissionEdit = null;
  renderPermissionMatrix(body, userManagementState.permissionMatrix);
}

function buildPermissionPayload(editState) {
  const allow = [];
  const deny = [];

  editState?.current.forEach((state, code) => {
    if (state === "ALLOW") allow.push(code);
    if (state === "DENY") deny.push(code);
  });

  allow.sort();
  deny.sort();
  return { allow, deny };
}

window.getUserPermissionEditState = () => {
  const editState = userManagementState.permissionEdit;
  return editState
    ? {
        original: Object.fromEntries(editState.original),
        current: Object.fromEntries(editState.current),
      }
    : null;
};

async function savePermissionEdit(container) {
  const editState = userManagementState.permissionEdit;
  const targetId = userManagementState.detailUser?.id;
  if (
    !editState ||
    editState.saving ||
    !targetId ||
    editState.targetId !== targetId ||
    !permissionEditChanged(editState)
  )
    return;
  const body = container.querySelector("[data-user-drawer-body]");
  editState.saving = true;
  renderPermissionMatrix(body, userManagementState.permissionMatrix);
  try {
    const response = await fetch(
      `${getUserManagementApiBaseUrl()}/users/${encodeURIComponent(targetId)}/permissions`,
      {
        method: "PUT",
        headers: { ...userManagementHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify(buildPermissionPayload(editState)),
      },
    );
    await parseUserManagementResponse(response);
    if (userManagementState.detailUser?.id !== targetId) return;
    userManagementState.permissionEdit = null;
    await loadUserManagementPermissions(
      container,
      userManagementState.detailUser,
      userManagementState.detailRequestId,
    );
    window.showDashboardAlert?.("Access permissions updated successfully.", {
      title: "Access updated",
      type: "success",
    });
  } catch (error) {
    editState.saving = false;
    if (body && userManagementState.detailUser?.id === targetId) {
      renderPermissionMatrix(body, userManagementState.permissionMatrix);
    }
    const message =
      error?.status === 403
        ? "You do not have permission to change this user's access."
        : error?.status === 404
          ? "User permission information is unavailable."
          : error?.status === 400
            ? "Invalid permission configuration."
            : "Unable to update permissions. Please try again.";
    window.showDashboardAlert?.(message, { title: "Access update failed", type: "error" });
  }
}

async function loadUserManagementPermissions(container, user, detailRequestId) {
  const body = container.querySelector("[data-user-drawer-body]");
  const section = body?.querySelector("[data-user-permissions]");
  if (!body || !section) return;
  userManagementState.permissionsAbortController?.abort();
  const controller = new AbortController();
  userManagementState.permissionsAbortController = controller;
  const requestId = ++userManagementState.permissionsRequestId;
  renderPermissionLoading(body);
  try {
    const response = await fetch(
      `${getUserManagementApiBaseUrl()}/users/${encodeURIComponent(user.id)}/permissions`,
      { headers: userManagementHeaders(), signal: controller.signal },
    );
    const result = await parseUserManagementResponse(response);
    if (
      detailRequestId !== userManagementState.detailRequestId ||
      requestId !== userManagementState.permissionsRequestId
    )
      return;
    renderPermissionMatrix(body, result?.permissions || []);
  } catch (error) {
    if (
      error?.name === "AbortError" ||
      detailRequestId !== userManagementState.detailRequestId ||
      requestId !== userManagementState.permissionsRequestId
    )
      return;
    const message =
      error?.status === 403
        ? "You do not have permission to view screen access."
        : error?.status === 404
          ? "Permission information is unavailable."
          : "Unable to load screen access.";
    renderPermissionError(body, message, () =>
      loadUserManagementPermissions(container, user, detailRequestId),
    );
  }
}

function finishCloseUserManagementDetails(container) {
  userManagementState.detailAbortController?.abort();
  userManagementState.permissionsAbortController?.abort();
  userManagementState.detailRequestId += 1;
  userManagementState.permissionsRequestId += 1;
  const drawer = container.querySelector("[data-user-drawer]");
  drawer?.classList.add("hidden");
  drawer?.setAttribute("aria-hidden", "true");
  container
    .querySelector(".user-management-drawer-backdrop")
    ?.classList.add("hidden");
  userManagementState.detailOpener?.focus?.({ preventScroll: true });
  userManagementState.detailOpener = null;
  userManagementState.permissionEdit = null;
}

function closeUserManagementDetails(container) {
  const editState = userManagementState.permissionEdit;
  if (permissionEditChanged(editState)) {
    window.showDashboardAlert?.("Discard unsaved access changes?", {
      title: "Unsaved access changes",
      type: "warning",
      buttonText: "Discard Changes",
      cancelButtonText: "Keep Editing",
      onConfirm: () => finishCloseUserManagementDetails(container),
    });
    return;
  }
  finishCloseUserManagementDetails(container);
}

function cancelUserManagementRequests() {
  userManagementState.abortController?.abort();
  userManagementState.detailAbortController?.abort();
  userManagementState.permissionsAbortController?.abort();
  userManagementState.requestId += 1;
  userManagementState.detailRequestId += 1;
  userManagementState.permissionsRequestId += 1;
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
  container.addEventListener("click", (event) => {
    const addUserButton = event.target.closest("[data-add-user]");
    if (addUserButton) {
      if (window.hasDashboardPermission?.("users.create") === true) {
        window.location.hash = "#user-management/add";
      }
      return;
    }
    if (event.target.closest("[data-close-user-drawer]")) {
      closeUserManagementDetails(container);
      return;
    }
    const body = container.querySelector("[data-user-drawer-body]");
    const lifecycleAction = event.target.closest("[data-user-lifecycle-action]");
    if (lifecycleAction) {
      const targetId = userManagementState.detailUser?.id;
      if (lifecycleAction.dataset.userLifecycleAction === "SET_INITIAL_PASSWORD") {
        openInitialPasswordModal(container, userManagementState.detailUser);
      } else if (targetId) {
        void updateUserManagementStatus(
          container,
          targetId,
          lifecycleAction.dataset.userLifecycleAction,
        );
      }
      return;
    }
    if (event.target.closest("[data-user-edit-access]")) {
      beginPermissionEdit(body);
      return;
    }
    if (event.target.closest("[data-user-cancel-access]")) {
      cancelPermissionEdit(body);
      return;
    }
    const eventElement =
      event.target instanceof Element ? event.target : event.target.parentElement;
    const saveButton = eventElement?.closest("[data-save-user-access]");
    if (saveButton) {
      event.preventDefault();
      if (!saveButton.disabled && container.contains(saveButton)) {
        void savePermissionEdit(container);
      }
      return;
    }
    const option = event.target.closest("[data-permission-state]");
    if (option && userManagementState.permissionEdit) {
      const { permissionCode, permissionState } = option.dataset;
      setPermissionEditState(
        userManagementState.permissionEdit,
        permissionCode,
        permissionState,
      );
      renderPermissionMatrix(body, userManagementState.permissionMatrix);
      return;
    }
    const control = event.target.closest("[data-permission-control]");
    if (control && userManagementState.permissionEdit) {
      const menu = control.nextElementSibling;
      if (menu) menu.classList.toggle("hidden");
    }
  });
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
  const addUserButton = container.querySelector("[data-add-user]");
  if (addUserButton) {
    const canCreate = window.hasDashboardPermission?.("users.create") === true;
    addUserButton.hidden = !canCreate;
    addUserButton.classList.toggle("hidden", !canCreate);
  }
  await refreshUserManagementPage(container);
}

window.loadUserManagementPage = loadUserManagementPage;
window.cancelUserManagementRequests = cancelUserManagementRequests;
