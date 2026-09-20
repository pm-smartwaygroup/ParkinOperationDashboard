const userManagementAddState = {
  initialized: false,
  loading: false,
  submitting: false,
  dirty: false,
  companies: [],
  locations: [],
  createdUserId: null,
  createdEmail: "",
  inviteFailed: false,
  companyRequest: null,
  locationRequest: null,
};

function userManagementAddAuthHeaders(json = false) {
  const token = localStorage.getItem("parkin_access_token");
  if (!token)
    throw new Error("Your login session has expired. Please sign in again.");
  return json
    ? { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }
    : { Authorization: `Bearer ${token}` };
}

function userManagementAddCoreApiBaseUrl() {
  return window.PARKIN_CONFIG?.apiBaseUrl || "https://api.parkin.com.sa";
}

async function userManagementAddResponse(response) {
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error("User request failed");
    error.status = response.status;
    error.body = body;
    throw error;
  }
  return body?.data ?? body;
}

function userManagementAddCollection(value) {
  if (Array.isArray(value)) return value;
  return value?.items || value?.data?.items || value?.data || [];
}

function userManagementAddCurrentUser() {
  try {
    return JSON.parse(localStorage.getItem("parkin_user") || "null") || {};
  } catch {
    return {};
  }
}

function userManagementAddField(form, name) {
  return form.elements.namedItem(name);
}

function userManagementAddValue(form, name) {
  return String(userManagementAddField(form, name)?.value || "").trim();
}

function userManagementAddSelectedLocations(form) {
  return Array.from(
    userManagementAddField(form, "locationIds")?.selectedOptions || [],
  )
    .map((option) => option.value)
    .filter(Boolean);
}

function userManagementAddSetError(form, name, message = "") {
  const field = userManagementAddField(form, name);
  const error = form.querySelector(`[data-error-for="${name}"]`);
  field?.toggleAttribute("aria-invalid", Boolean(message));
  if (error) error.textContent = message;
}

function userManagementAddClearErrors(form) {
  form.querySelectorAll("[data-error-for]").forEach((element) => {
    element.textContent = "";
  });
  form.querySelectorAll('[aria-invalid="true"]').forEach((element) => {
    element.removeAttribute("aria-invalid");
  });
}

function userManagementAddDisplayError(container, message) {
  const feedback = container.querySelector("[data-user-add-feedback]");
  if (!feedback) return;
  feedback.className = "user-management-add-feedback error";
  feedback.textContent = message;
}

function userManagementAddClearFeedback(container) {
  const feedback = container.querySelector("[data-user-add-feedback]");
  if (!feedback) return;
  feedback.className = "user-management-add-feedback hidden";
  feedback.textContent = "";
}

function userManagementAddCompanyIdForRequester() {
  const user = userManagementAddCurrentUser();
  return user.role === "COMPANY_ADMIN" ? String(user.companyId || "") : "";
}

function userManagementAddRenderCompanies(container) {
  const form = container.querySelector("[data-user-add-form]");
  const select = userManagementAddField(form, "companyId");
  if (!select) return;
  const requesterCompanyId = userManagementAddCompanyIdForRequester();
  const current = select.value;
  select.replaceChildren(new Option("Select company", ""));
  userManagementAddState.companies
    .filter((company) =>
      company.status
        ? String(company.status).toUpperCase() === "ACTIVE"
        : company.isActive !== false,
    )
    .forEach((company) => {
      const option = new Option(company.name || "Unnamed company", company.id);
      option.textContent = company.name || "Unnamed company";
      select.append(option);
    });
  if (requesterCompanyId) {
    select.value = requesterCompanyId;
    select.disabled = true;
  } else {
    select.value =
      current &&
      userManagementAddState.companies.some((item) => item.id === current)
        ? current
        : "";
  }
}

function userManagementAddRenderLocations(container) {
  const form = container.querySelector("[data-user-add-form]");
  const select = userManagementAddField(form, "locationIds");
  if (!select) return;
  const companyId = userManagementAddValue(form, "companyId");
  const selected = new Set(userManagementAddSelectedLocations(form));
  const locations = userManagementAddState.locations.filter((location) => {
    if (location.deletedAt || location.isDeleted === true) return false;
    const locationCompanyId = location.companyId || location.company?.id;
    return companyId && locationCompanyId
      ? String(locationCompanyId) === companyId
      : false;
  });
  select.replaceChildren();
  locations.forEach((location) => {
    const option = new Option(location.name || "Unnamed location", location.id);
    option.textContent = location.name || "Unnamed location";
    option.selected = selected.has(String(location.id));
    select.append(option);
  });
  if (!locations.length) {
    select.append(
      new Option(
        companyId ? "No locations available" : "Select a company first",
        "",
      ),
    );
    select.disabled = true;
  } else {
    select.disabled = false;
  }
}

function userManagementAddClearLocations(form) {
  Array.from(
    userManagementAddField(form, "locationIds")?.options || [],
  ).forEach((option) => {
    option.selected = false;
  });
}

function userManagementAddUpdateLocationVisibility(container) {
  const form = container.querySelector("[data-user-add-form]");
  const wrap = container.querySelector("[data-user-add-location-wrap]");
  const visible = userManagementAddValue(form, "accessScope") === "LOCATION";
  wrap?.classList.toggle("hidden", !visible);
  if (visible) userManagementAddRenderLocations(container);
}

function userManagementAddUpdatePreview(container) {
  const form = container.querySelector("[data-user-add-form]");
  const role = userManagementAddValue(form, "role");
  const scope = userManagementAddValue(form, "accessScope");
  const company = userManagementAddState.companies.find(
    (item) => String(item.id) === userManagementAddValue(form, "companyId"),
  );
  const locations = userManagementAddSelectedLocations(form);
  container.querySelector("[data-preview-role]").textContent =
    userManagementRoleLabel(role) || "—";
  container.querySelector("[data-preview-scope]").textContent =
    userManagementScopeLabel(scope) || "—";
  container.querySelector("[data-preview-company]").textContent =
    company?.name || "—";
  container.querySelector("[data-preview-locations]").textContent =
    scope === "LOCATION"
      ? `${locations.length} selected`
      : "All company locations";
}

function userManagementAddValidate(container) {
  const form = container.querySelector("[data-user-add-form]");
  userManagementAddClearErrors(form);
  let valid = true;
  const firstName = userManagementAddValue(form, "firstName");
  const lastName = userManagementAddValue(form, "lastName");
  const email = userManagementAddValue(form, "email").toLowerCase();
  const role = userManagementAddValue(form, "role");
  const companyId = userManagementAddValue(form, "companyId");
  const scope = userManagementAddValue(form, "accessScope");
  const locations = userManagementAddSelectedLocations(form);
  if (!firstName) {
    userManagementAddSetError(form, "firstName", "First name is required.");
    valid = false;
  }
  if (!lastName) {
    userManagementAddSetError(form, "lastName", "Last name is required.");
    valid = false;
  }
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email)) {
    userManagementAddSetError(form, "email", "Enter a valid email address.");
    valid = false;
  }
  if (
    ![
      "COMPANY_ADMIN",
      "OPERATIONS_MANAGER",
      "VALET_OPERATIONS",
      "SUPPORT",
      "DRIVER",
    ].includes(role)
  ) {
    userManagementAddSetError(form, "role", "Select a valid role.");
    valid = false;
  }
  if (!companyId) {
    userManagementAddSetError(form, "companyId", "Company is required.");
    valid = false;
  }
  if (!["COMPANY", "LOCATION", "OWN"].includes(scope)) {
    userManagementAddSetError(
      form,
      "accessScope",
      "Select a valid access scope.",
    );
    valid = false;
  }
  if (scope === "LOCATION" && !locations.length) {
    userManagementAddSetError(
      form,
      "locationIds",
      "Select at least one location.",
    );
    valid = false;
  }
  const phone = userManagementAddValue(form, "phoneNumber").replace(/\D/g, "");
  if (phone && !(phone.length === 9 && phone.startsWith("5"))) {
    userManagementAddSetError(
      form,
      "phoneNumber",
      "Enter a Saudi mobile number, such as 50 123 4567.",
    );
    valid = false;
  }
  return valid;
}

function userManagementAddPayload(container) {
  const form = container.querySelector("[data-user-add-form]");
  const payload = {
    name: `${userManagementAddValue(form, "firstName")} ${userManagementAddValue(form, "lastName")}`.trim(),
    email: userManagementAddValue(form, "email").toLowerCase(),
    role: userManagementAddValue(form, "role"),
    companyId: userManagementAddValue(form, "companyId"),
    accessScope: userManagementAddValue(form, "accessScope"),
  };
  const optional = {
    employeeId: userManagementAddValue(form, "employeeId"),
    department: userManagementAddValue(form, "department"),
    region: userManagementAddValue(form, "region"),
  };
  Object.entries(optional).forEach(([key, value]) => {
    if (value) payload[key] = value;
  });
  const phone = userManagementAddValue(form, "phoneNumber").replace(/\D/g, "");
  if (phone) {
    payload.phoneCountryCode = "+966";
    payload.phoneNumber = phone;
  }
  if (payload.accessScope === "LOCATION")
    payload.locationIds = userManagementAddSelectedLocations(form);
  return payload;
}

function userManagementAddCreatedUserId(result) {
  return (
    result?.user?.id ||
    result?.data?.user?.id ||
    result?.data?.data?.user?.id ||
    result?.data?.id ||
    result?.id ||
    null
  );
}

function userManagementAddErrorMessage(error, operation) {
  if (error?.status === 401)
    return "Your session has expired. Please sign in again.";
  if (error?.status === 403)
    return operation === "invite"
      ? "User was created, but you do not have permission to send the invitation."
      : "You do not have permission to create this user.";
  if (error?.status === 409)
    return "A user with this email address already exists.";
  if (error?.status === 400)
    return "Please review the highlighted fields and try again.";
  return operation === "invite"
    ? "The invitation email could not be sent."
    : "Unable to create user. Please try again.";
}

async function userManagementAddInvite(container) {
  const response = await fetch(
    `${getUserManagementApiBaseUrl()}/users/${encodeURIComponent(userManagementAddState.createdUserId)}/invite`,
    { method: "POST", headers: userManagementAddAuthHeaders() },
  );
  await userManagementAddResponse(response);
}

async function userManagementAddSubmit(container, retryInvite = false) {
  if (userManagementAddState.submitting) return;
  userManagementAddState.submitting = true;
  const form = container.querySelector("[data-user-add-form]");
  const submit = container.querySelector("[data-user-add-submit]");
  const reset = container.querySelector("[data-user-add-reset]");
  const label = submit.querySelector("span");
  submit.disabled = true;
  reset.disabled = true;
  userManagementAddClearFeedback(container);
  try {
    if (retryInvite) {
      label.textContent = "Sending Invitation...";
      await userManagementAddInvite(container);
      window.showDashboardAlert?.(
        `Invitation email sent to ${userManagementAddState.createdEmail}.`,
        { title: "Invitation sent", type: "success" },
      );
      window.location.hash = "user-management";
      return;
    }
    label.textContent = "Creating User...";
    const response = await fetch(`${getUserManagementApiBaseUrl()}/users`, {
      method: "POST",
      headers: userManagementAddAuthHeaders(true),
      body: JSON.stringify(userManagementAddPayload(container)),
    });
    const result = await userManagementAddResponse(response);
    const createdUserId = userManagementAddCreatedUserId(result);
    if (!createdUserId)
      throw new Error("The created user could not be identified.");
    userManagementAddState.createdUserId = createdUserId;
    userManagementAddState.createdEmail = userManagementAddValue(form, "email");
    userManagementAddState.dirty = false;
    if (userManagementAddField(form, "sendInvitation").checked) {
      label.textContent = "Sending Invitation...";
      try {
        await userManagementAddInvite(container);
        window.showDashboardAlert?.(
          `User created successfully. Invitation email sent to ${userManagementAddState.createdEmail}.`,
          { title: "User created", type: "success" },
        );
        window.location.hash = "user-management";
      } catch (error) {
        userManagementAddState.inviteFailed = true;
        const feedback = container.querySelector("[data-user-add-feedback]");
        feedback.className = "user-management-add-feedback warning";
        feedback.replaceChildren();
        const text = document.createElement("span");
        text.textContent = `User created successfully, but the invitation email could not be sent.`;
        const retry = document.createElement("button");
        retry.type = "button";
        retry.className = "user-management-add-button secondary";
        retry.dataset.userAddRetryInvite = "true";
        retry.textContent = "Retry Invitation";
        feedback.append(text, retry);
      }
    } else {
      window.showDashboardAlert?.(
        "User created successfully. The account remains disabled until an invitation is sent and password setup is completed.",
        { title: "User created", type: "success" },
      );
      window.location.hash = "user-management";
    }
  } catch (error) {
    userManagementAddDisplayError(
      container,
      userManagementAddErrorMessage(error, "create"),
    );
  } finally {
    userManagementAddState.submitting = false;
    submit.disabled = false;
    reset.disabled = false;
    label.textContent = "Create User";
  }
}

function userManagementAddConfirmDiscard(container, action) {
  if (!userManagementAddState.dirty) {
    action();
    return;
  }
  window.showDashboardAlert?.("Discard unsaved user information?", {
    title: "Unsaved user information",
    type: "warning",
    buttonText: "Discard",
    cancelButtonText: "Continue Editing",
    onConfirm: action,
  });
}

function userManagementAddApplyRolePolicy(container) {
  const roleSelect = userManagementAddField(
    container.querySelector("[data-user-add-form]"),
    "role",
  );
  const requester = userManagementAddCurrentUser();
  const isSuperAdmin = requester.role === "SUPER_ADMIN";
  Array.from(roleSelect?.options || []).forEach((option) => {
    if (option.value) {
      option.hidden = option.value === "COMPANY_ADMIN" && !isSuperAdmin;
    }
  });
  if (!isSuperAdmin && roleSelect?.value === "COMPANY_ADMIN") {
    roleSelect.value = "";
  }
}

function userManagementAddReset(container) {
  const form = container.querySelector("[data-user-add-form]");
  form.reset();
  userManagementAddState.dirty = false;
  userManagementAddState.inviteFailed = false;
  userManagementAddClearErrors(form);
  userManagementAddClearFeedback(container);
  userManagementAddRenderCompanies(container);
  userManagementAddUpdateLocationVisibility(container);
  userManagementAddUpdatePreview(container);
}

async function userManagementAddLoadOptions(container) {
  userManagementAddState.companyRequest?.abort();
  userManagementAddState.locationRequest?.abort();
  const companyController = new AbortController();
  const locationController = new AbortController();
  userManagementAddState.companyRequest = companyController;
  userManagementAddState.locationRequest = locationController;
  try {
    const [companiesResponse, locationsResponse] = await Promise.all([
      fetch(`${userManagementAddCoreApiBaseUrl()}/companies?page=1&limit=100`, {
        headers: userManagementAddAuthHeaders(),
        signal: companyController.signal,
      }),
      fetch(`${userManagementAddCoreApiBaseUrl()}/locations?page=1&limit=100`, {
        headers: userManagementAddAuthHeaders(),
        signal: locationController.signal,
      }),
    ]);
    const [companies, locations] = await Promise.all([
      userManagementAddResponse(companiesResponse),
      userManagementAddResponse(locationsResponse),
    ]);
    userManagementAddState.companies = userManagementAddCollection(companies);
    userManagementAddState.locations = userManagementAddCollection(locations);
    userManagementAddApplyRolePolicy(container);
    userManagementAddRenderCompanies(container);
    userManagementAddUpdateLocationVisibility(container);
    userManagementAddUpdatePreview(container);
  } catch (error) {
    if (error?.name !== "AbortError")
      userManagementAddDisplayError(
        container,
        "Unable to load companies and locations. Please try again.",
      );
  }
}

function bindUserManagementAddPage(container) {
  if (container.dataset.eventsBound === "true") return;
  container.dataset.eventsBound = "true";
  const form = container.querySelector("[data-user-add-form]");
  form.addEventListener("input", () => {
    userManagementAddState.dirty = true;
    userManagementAddClearFeedback(container);
    userManagementAddUpdatePreview(container);
  });
  form.addEventListener("change", (event) => {
    userManagementAddState.dirty = true;
    if (event.target.name === "companyId") {
      userManagementAddClearLocations(form);
      userManagementAddRenderLocations(container);
    }
    if (event.target.name === "accessScope") {
      if (event.target.value !== "LOCATION")
        userManagementAddClearLocations(form);
      userManagementAddUpdateLocationVisibility(container);
    }
    userManagementAddUpdatePreview(container);
  });
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    if (userManagementAddValidate(container))
      void userManagementAddSubmit(container);
  });
  container
    .querySelector("[data-user-add-reset]")
    .addEventListener("click", () =>
      userManagementAddConfirmDiscard(container, () =>
        userManagementAddReset(container),
      ),
    );
  container
    .querySelector("[data-user-add-cancel]")
    .addEventListener("click", (event) => {
      event.preventDefault();
      userManagementAddConfirmDiscard(container, () => {
        window.location.hash = "user-management";
      });
    });
  container.addEventListener("click", (event) => {
    if (event.target.closest("[data-user-add-retry-invite]"))
      void userManagementAddSubmit(container, true);
  });
  window.onbeforeunload = (event) => {
    if (userManagementAddState.dirty) {
      event.preventDefault();
      event.returnValue = "";
    }
  };
}

function cancelUserManagementAddRequests() {
  userManagementAddState.companyRequest?.abort();
  userManagementAddState.locationRequest?.abort();
  if (window.location.hash !== "#user-management/add")
    window.onbeforeunload = null;
}

async function loadUserManagementAddPage() {
  const container = document.querySelector("#user-management-add-container");
  if (!container) return;
  if (container.dataset.loaded !== "true" || !container.innerHTML.trim()) {
    const response = await fetch("/pages/user-management-add.html");
    if (!response.ok) throw new Error("Unable to load Add New User page.");
    container.innerHTML = await response.text();
    container.dataset.loaded = "true";
  }
  bindUserManagementAddPage(container);
  if (
    !userManagementAddState.initialized ||
    !userManagementAddState.companies.length
  ) {
    userManagementAddState.initialized = true;
    await userManagementAddLoadOptions(container);
  } else {
    userManagementAddRenderCompanies(container);
    userManagementAddUpdateLocationVisibility(container);
    userManagementAddUpdatePreview(container);
  }
}

window.loadUserManagementAddPage = loadUserManagementAddPage;
window.cancelUserManagementAddRequests = cancelUserManagementAddRequests;
