const translations = {
  en: {
    heroLineOne: "Smart Parking.",
    heroLineTwo: "Smarter <strong>Operations.</strong>",
    heroDescription:
      "Manage Valet, Rental and Event parking operations seamlessly.",
    valetTitle: "Valet Parking",
    valetDescription: "Real-time valet requests and driver management",
    rentalTitle: "Rental Parking",
    rentalDescription: "Monitor occupancy and optimize parking spaces",
    eventTitle: "Event Management",
    eventDescription: "Handle events, bookings and guest parking effortlessly",
    welcomeTitle: "Welcome back",
    welcomeDescription: "Sign in to access your Parkin dashboard",
    emailLabel: "Email address",
    emailPlaceholder: "Enter your email address",
    passwordLabel: "Password",
    passwordPlaceholder: "Enter your password",
    forgotPassword: "Forgot password?",
    rememberMe: "Remember me",
    signIn: "Sign in",
    securityCopy: "Secure. Reliable. Built for the future.",
    copyright: "© 2026 Parkin. All rights reserved.",
    showPassword: "Show password",
    hidePassword: "Hide password",
    emailRequired: "Enter your email address.",
    emailInvalid: "Enter a valid email address, such as name@example.com.",
    passwordRequired: "Enter your password.",
    passwordShort: "Password must contain at least 8 characters.",
    validationSuccess: "Validation passed. Opening dashboard…",
  },
  ar: {
    heroLineOne: "مواقف ذكية.",
    heroLineTwo: "عمليات <strong>أكثر ذكاءً.</strong>",
    heroDescription:
      "أدر خدمات صف السيارات والتأجير ومواقف الفعاليات بكل سلاسة.",
    valetTitle: "صف السيارات",
    valetDescription: "طلبات فورية وإدارة متكاملة للسائقين",
    rentalTitle: "تأجير المواقف",
    rentalDescription: "راقب الإشغال وحسّن الاستفادة من المساحات",
    eventTitle: "إدارة الفعاليات",
    eventDescription: "أدر الفعاليات والحجوزات ومواقف الضيوف بسهولة",
    welcomeTitle: "مرحباً بعودتك",
    welcomeDescription: "سجّل الدخول للوصول إلى لوحة تحكم باركن",
    emailLabel: "البريد الإلكتروني",
    emailPlaceholder: "أدخل بريدك الإلكتروني",
    passwordLabel: "كلمة المرور",
    passwordPlaceholder: "أدخل كلمة المرور",
    forgotPassword: "نسيت كلمة المرور؟",
    rememberMe: "تذكرني",
    signIn: "تسجيل الدخول",
    securityCopy: "آمن. موثوق. صُمم للمستقبل.",
    copyright: "© 2026 باركن. جميع الحقوق محفوظة.",
    showPassword: "إظهار كلمة المرور",
    hidePassword: "إخفاء كلمة المرور",
    emailRequired: "أدخل بريدك الإلكتروني.",
    emailInvalid: "أدخل بريداً إلكترونياً صحيحاً مثل name@example.com.",
    passwordRequired: "أدخل كلمة المرور.",
    passwordShort: "يجب أن تتكون كلمة المرور من 8 أحرف على الأقل.",
    validationSuccess: "تم التحقق من البيانات. جارٍ فتح لوحة التحكم…",
  },
};

const loginPage = document.querySelector("#login-page");
const dashboardPage = document.querySelector("#dashboard-page");
const dashboardMain = document.querySelector(".dashboard-main");
const dashboardLogout = document.querySelector("#dashboard-logout");
const form = document.querySelector("#login-form");
const emailInput = document.querySelector("#email");
const passwordInput = document.querySelector("#password");
const emailShell = document.querySelector("#email-shell");
const passwordShell = document.querySelector("#password-shell");
const emailError = document.querySelector("#email-error");
const passwordError = document.querySelector("#password-error");
const passwordToggle = document.querySelector("#password-toggle");
const languageSelect = document.querySelector("#language");
const submitButton = document.querySelector("#sign-in-button");
const formStatus = document.querySelector("#form-status");
const loginLoader = document.querySelector("#login-loader");

const API_BASE_URL =
  window.PARKIN_CONFIG?.apiBaseUrl || "https://api.parkin.com.sa";

function getImageUrl(imageUrl) {
  if (!imageUrl) return "/public/assets/parkin-valet-hero.jpg";
  if (imageUrl.startsWith("http")) return imageUrl;
  return `${API_BASE_URL}${imageUrl}`;
}

let authSocket = null;

let currentLanguage = "en";
let submitAttempted = false;
let submitTimer;

let sessionMonitor = null;
let isManualLogout = false;
let selectedLocationId = null;

const loadedDashboardScripts = new Map();

function loadDashboardScript(src) {
  if (loadedDashboardScripts.has(src)) {
    return loadedDashboardScripts.get(src);
  }

  const existingScript = document.querySelector(`script[src="${src}"]`);

  if (existingScript?.dataset.loaded === "true") {
    return Promise.resolve();
  }

  const promise = new Promise((resolve, reject) => {
    const script = existingScript || document.createElement("script");

    const handleLoad = () => {
      script.dataset.loaded = "true";
      resolve();
    };

    const handleError = () => {
      loadedDashboardScripts.delete(src);

      if (!existingScript) {
        script.remove();
      }

      reject(new Error(`Unable to load ${src}`));
    };

    script.addEventListener("load", handleLoad, { once: true });

    script.addEventListener("error", handleError, { once: true });

    if (!existingScript) {
      script.src = src;
      script.async = false;

      document.head.appendChild(script);
    }
  });

  loadedDashboardScripts.set(src, promise);

  return promise;
}

async function loadDriverFeatureScripts() {
  await loadDashboardScript("/js/components/DriverDocumentUploader.js");

  await loadDashboardScript("/js/components/DriverDetailsView.js");

  await loadDashboardScript("/js/components/EditDriverView.js");

  await loadDashboardScript("/js/drivers.js");
}

async function loadCustomerFeatureScripts() {
  await loadDashboardScript("/js/customers.js");
}

async function loadValetFeatureScripts() {
  await loadDashboardScript("/js/valet.js");
}

function getCurrentCustomerId() {
  const queryString = window.location.hash.split("?")[1] || "";

  const params = new URLSearchParams(queryString);

  return (
    params.get("id") ||
    sessionStorage.getItem("selectedCustomerId") ||
    "CUS-1001"
  );
}

function startSessionMonitor() {
  stopSessionMonitor();

  sessionMonitor = setInterval(() => {
    checkSession();
  }, 5000); // every 30 seconds
}

function stopSessionMonitor() {
  if (sessionMonitor) {
    clearInterval(sessionMonitor);
    sessionMonitor = null;
  }
}

const getCopy = (key) => translations[currentLanguage][key];

function updateLanguage(language) {
  currentLanguage = translations[language] ? language : "en";
  const isArabic = currentLanguage === "ar";

  document.documentElement.lang = currentLanguage;
  document.documentElement.dir = isArabic ? "rtl" : "ltr";

  document.querySelectorAll("[data-i18n]").forEach((element) => {
    const key = element.dataset.i18n;
    element.innerHTML = getCopy(key);
  });

  document.querySelectorAll("[data-i18n-placeholder]").forEach((element) => {
    element.placeholder = getCopy(element.dataset.i18nPlaceholder);
  });

  document.querySelectorAll("[data-i18n-aria-label]").forEach((element) => {
    const isPasswordVisible = passwordInput.type === "text";
    const key = isPasswordVisible
      ? "hidePassword"
      : element.dataset.i18nAriaLabel;
    element.setAttribute("aria-label", getCopy(key));
  });

  if (submitAttempted) {
    validateForm();
  }

  if (formStatus.classList.contains("is-visible")) {
    formStatus.textContent = getCopy("validationSuccess");
  }
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/u.test(value);
}

function setFieldState(input, shell, errorElement, message) {
  const hasError = Boolean(message);
  input.setAttribute("aria-invalid", String(hasError));
  shell.classList.toggle("is-invalid", hasError);
  errorElement.textContent = message;
}

function validateEmail() {
  const value = emailInput.value.trim();
  let message = "";

  if (!value) {
    message = getCopy("emailRequired");
  } else if (!isValidEmail(value)) {
    message = getCopy("emailInvalid");
  }

  setFieldState(emailInput, emailShell, emailError, message);
  return !message;
}

function validatePassword() {
  const value = passwordInput.value;
  let message = "";

  if (!value) {
    message = getCopy("passwordRequired");
  } else if (value.length < 8) {
    message = getCopy("passwordShort");
  }

  setFieldState(passwordInput, passwordShell, passwordError, message);
  return !message;
}

function validateForm() {
  const emailIsValid = validateEmail();
  const passwordIsValid = validatePassword();
  return emailIsValid && passwordIsValid;
}

function clearSuccessState() {
  window.clearTimeout(submitTimer);
  formStatus.classList.remove("is-visible");
  formStatus.textContent = "";
  submitButton.classList.remove("is-loading");
  submitButton.disabled = false;
}

function showLoader() {
  loginLoader.classList.remove("hidden");
}

function hideLoader() {
  loginLoader.classList.add("hidden");
}

function getSessionIdFromToken(token) {
  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    return payload.sessionId;
  } catch {
    return null;
  }
}

function connectAuthSocket() {
  const token = localStorage.getItem("parkin_access_token");
  const sessionId = getSessionIdFromToken(token || "");

  if (!sessionId || typeof io === "undefined") return;

  disconnectAuthSocket();

  authSocket = io(API_BASE_URL, {
    transports: ["websocket"],
  });

  authSocket.on("connect", () => {
    console.log("✅ Socket connected:", authSocket.id);
    console.log("Registering session:", sessionId);
    authSocket.emit("register_session", { sessionId }, (ack) => {
      console.log("✅ Register session ACK:", ack);
    });
  });

  authSocket.on("connect_error", (error) => {
    console.error("❌ Socket connect error:", error.message);
  });

  authSocket.on("force_logout", (data) => {
    console.log("🚨 Force logout received:", data);

    if (isManualLogout) return;

    stopSessionMonitor();
    disconnectAuthSocket();

    localStorage.removeItem("parkin_access_token");
    localStorage.removeItem("parkin_user");

    showLogin();

    showSessionExpiredModal(data?.message);
  });
}

function disconnectAuthSocket() {
  if (authSocket) {
    authSocket.disconnect();
    authSocket = null;
  }
}

function showDashboard({ preserveRoute = false } = {}) {
  clearSuccessState();

  loginPage.classList.add("hidden");
  dashboardPage.classList.remove("hidden");

  document.body.classList.add("dashboard-open");

  document.title = "Parkin Dashboard | Operations";

  if (!preserveRoute) {
    window.history.replaceState(null, "", "/#dashboard");

    /*
     * replaceState does not trigger
     * the hashchange event, so render
     * the Dashboard explicitly.
     */
    showMainDashboardView();
  }

  window.scrollTo({
    top: 0,
    behavior: "auto",
  });

  dashboardMain.focus({
    preventScroll: false,
  });

    hideLoader();
    startSessionMonitor();
    connectAuthSocket();
}

function showLogin() {
  disconnectAuthSocket();
  stopSessionMonitor();
  hideLoader();

  dashboardPage.classList.add("hidden");
  loginPage.classList.remove("hidden");
  document.body.classList.remove("dashboard-open");
  document.title = "Parkin Dashboard | Sign in";
  // window.history.replaceState(null, "", window.location.pathname);
  window.history.replaceState(null, "", "/");
  window.scrollTo({ top: 0, behavior: "auto" });
  emailInput.focus({ preventScroll: true });
}

function showSessionExpiredModal(message) {
  const oldModal = document.querySelector(".session-expired-modal");
  oldModal?.remove();

  const modal = document.createElement("div");
  modal.className = "session-expired-modal";
  modal.innerHTML = `
    <div class="session-expired-card">
      <div class="session-icon">!</div>
      <h2>Session expired</h2>
      <p>${message || "Your account was signed in on another device. Please sign in again to continue."}</p>
      <button type="button">Sign in again</button>
    </div>
  `;

  document.body.appendChild(modal);

  modal.querySelector("button").addEventListener("click", () => {
    modal.remove();
    emailInput.focus({ preventScroll: true });
  });
}

async function checkSession() {
  const token = localStorage.getItem("parkin_access_token");

  if (!token) return;

  if (dashboardPage.classList.contains("hidden")) {
    return;
  }

  try {
    const response = await fetch(`${API_BASE_URL}/auth/session`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      throw new Error();
    }
  } catch {
    if (isManualLogout) return;

    stopSessionMonitor();

    localStorage.removeItem("parkin_access_token");
    localStorage.removeItem("parkin_user");

    showLogin();

    showSessionExpiredModal();
  }
}

emailInput.addEventListener("input", () => {
  clearSuccessState();
  if (submitAttempted || emailInput.getAttribute("aria-invalid") === "true") {
    validateEmail();
  }
});

passwordInput.addEventListener("input", () => {
  clearSuccessState();
  if (
    submitAttempted ||
    passwordInput.getAttribute("aria-invalid") === "true"
  ) {
    validatePassword();
  }
});

emailInput.addEventListener("blur", () => {
  if (submitAttempted || emailInput.value) {
    validateEmail();
  }
});

passwordInput.addEventListener("blur", () => {
  if (submitAttempted || passwordInput.value) {
    validatePassword();
  }
});

passwordToggle.addEventListener("click", () => {
  const showPassword = passwordInput.type === "password";
  passwordInput.type = showPassword ? "text" : "password";
  passwordToggle.classList.toggle("is-visible", showPassword);
  passwordToggle.setAttribute(
    "aria-label",
    getCopy(showPassword ? "hidePassword" : "showPassword"),
  );
  passwordInput.focus({ preventScroll: true });
});

languageSelect.addEventListener("change", (event) => {
  updateLanguage(event.target.value);
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  clearSuccessState();
  submitAttempted = true;

  if (!validateForm()) {
    const firstInvalidField =
      emailInput.getAttribute("aria-invalid") === "true"
        ? emailInput
        : passwordInput;
    firstInvalidField.focus();
    return;
  }

  submitButton.disabled = true;
  showLoader();

  const minimumLoaderTime = new Promise((resolve) => setTimeout(resolve, 800));

  try {
    console.log("API:", API_BASE_URL);

    const [response] = await Promise.all([
      fetch(`${API_BASE_URL}/auth/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: emailInput.value.trim(),
          password: passwordInput.value,
        }),
      }),
      minimumLoaderTime,
    ]);

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.message || "Invalid email or password");
    }

    const loginData = result.data || result;

    localStorage.setItem("parkin_access_token", loginData.accessToken);
    localStorage.setItem("parkin_user", JSON.stringify(loginData.user));

    console.log(
      "Current login session:",
      getSessionIdFromToken(loginData.accessToken),
    );

    showDashboard();
  } catch (error) {
    hideLoader();
    submitButton.disabled = false;
    formStatus.textContent = error.message || "Login failed. Please try again.";
    formStatus.classList.add("is-visible");
  }
});

async function performDashboardLogout() {
  const token = localStorage.getItem("parkin_access_token");

  disconnectAuthSocket();
  isManualLogout = true;
  stopSessionMonitor();
  showLoader();

  try {
    if (token) {
      await fetch(`${API_BASE_URL}/auth/logout`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
    }
  } catch (error) {
    console.error("Logout API request failed:", error);
  } finally {
    localStorage.removeItem("parkin_access_token");
    localStorage.removeItem("parkin_user");

    isManualLogout = false;

    showLogin();
  }
}

dashboardLogout?.addEventListener("click", () => {
  showDashboardAlert(
    "Are you sure you want to sign out of your dashboard account?",
    {
      title: "Sign out of Parkin?",
      type: "warning",
      buttonText: "Sign Out",
      cancelButtonText: "Cancel",
      onConfirm: performDashboardLogout,
    },
  );
});

function updateCurrentDate() {
  const dateElement = document.getElementById("current-date");

  if (!dateElement) return;

  const today = new Date();

  const formattedDate = today.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  dateElement.textContent = `Today, ${formattedDate}`;
}

updateCurrentDate();

async function restoreSession() {
  const token = localStorage.getItem("parkin_access_token");

  if (!token) {
    showLogin();
    return;
  }

  try {
    const response = await fetch(`${API_BASE_URL}/auth/session`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      throw new Error();
    }

    showDashboard({
      preserveRoute: true,
    });

    handleDashboardRoute();
  } catch {
    console.warn("Session restore failed. Keeping login screen only.");
    showLogin();
  }
}

const addLocationView = document.querySelector("#add-location-view");
const addLocationBtn = document.querySelector(".add-location-btn");
const locationsView = document.querySelector("#locations-view");
const driversView = document.querySelector("#drivers-view");
const addDriverView = document.querySelector("#add-driver-view");
const editDriverView = document.querySelector("#edit-driver-view");
const driverDetailsView = document.querySelector("#driver-details-view");
const customersView = document.querySelector("#customers-view");
const addCustomerView = document.querySelector("#add-customer-view");
const customerDetailsView = document.querySelector("#customer-details-view");
const editCustomerView = document.querySelector("#edit-customer-view");
const customerAddVehicleView = document.querySelector(
  "#customer-add-vehicle-view",
);
const customerCreateBookingView = document.querySelector(
  "#customer-create-booking-view",
);

const valetOperationsView = document.querySelector("#valet-operations-view");
const navLinks = document.querySelectorAll(".dashboard-nav a");
const dashboardSections = document.querySelectorAll(
  [
    ".dashboard-main > section",
    ":not(#locations-view)",
    ":not(#add-location-view)",
    ":not(#valet-operations-view)",
    ":not(#drivers-view)",
    ":not(#driver-details-view)",
    ":not(#edit-driver-view)",
    ":not(#add-driver-view)",
    ":not(#customers-view)",
    ":not(#add-customer-view)",
    ":not(#customer-details-view)",
    ":not(#edit-customer-view)",
    ":not(#customer-add-vehicle-view)",
    ":not(#customer-create-booking-view)",
    ":not(#customer-booking-details-view)",
    ":not(#customer-edit-booking-view)",
    ":not(#customer-booking-receipt-view)",
  ].join(""),
);

const locationSearch = document.querySelector("#location-search");
const locationStatusFilter = document.querySelector("#location-status-filter");
const locationCityFilter = document.querySelector("#location-city-filter");
const locationItems = document.querySelectorAll(".location-item");
const locationsResultCount = document.querySelector("#locations-result-count");

function hideAllFeatureViews() {
  locationsView?.classList.add("hidden");
  addLocationView?.classList.add("hidden");
  valetOperationsView?.classList.add("hidden");

  driversView?.classList.add("hidden");
  addDriverView?.classList.add("hidden");
  driverDetailsView?.classList.add("hidden");
  editDriverView?.classList.add("hidden");

  customersView?.classList.add("hidden");
  addCustomerView?.classList.add("hidden");
  customerDetailsView?.classList.add("hidden");
  editCustomerView?.classList.add("hidden");
  customerAddVehicleView?.classList.add("hidden");
  customerCreateBookingView?.classList.add("hidden");

  document
    .querySelector("#customer-booking-details-view")
    ?.classList.add("hidden");

  document
    .querySelector("#customer-edit-booking-view")
    ?.classList.add("hidden");

  document
    .querySelector("#customer-booking-receipt-view")
    ?.classList.add("hidden");
}

function setActiveNav(hash) {
  navLinks.forEach((link) => {
    link.classList.toggle("is-active", link.getAttribute("href") === hash);
  });
}

const backToLocationsBtn = document.querySelector(".back-to-locations");
const cancelLocationBtn = document.querySelector(".cancel-location");
const addLocationForm = document.querySelector(".add-location-layout");
const locationImageInput = document.querySelector("#location-image");

locationImageInput?.addEventListener("change", (event) => {
  const file = event.target.files?.[0];
  if (!file) return;

  const previewImage = document.querySelector(".preview-card img");
  const previewTitle = document.querySelector(".preview-card b");
  const previewSize = document.querySelector(".preview-card small");

  if (previewImage) {
    const objectUrl = URL.createObjectURL(file);
    previewImage.src = objectUrl;
    previewImage.onload = () => URL.revokeObjectURL(objectUrl);
  }

  if (previewTitle) {
    previewTitle.textContent = file.name;
  }

  if (previewSize) {
    previewSize.textContent = `${(file.size / 1024 / 1024).toFixed(2)} MB`;
  }
});

function showMainDashboardView() {
  /*
   * Display only the standard Dashboard
   * sections.
   */
  dashboardSections.forEach((section) => {
    section.classList.remove("hidden");
  });

  /*
   * Hide every feature view, including
   * Drivers, Customers, Locations and
   * nested booking pages.
   */
  hideAllFeatureViews();

  const title = document.querySelector(".dashboard-title h1");

  const subtitle = document.querySelector(".dashboard-title p");

  if (title) {
    title.textContent = "Dashboard";
  }

  if (subtitle) {
    subtitle.textContent =
      "Real-time overview of your valet parking operations";
  }

  setActiveNav("#dashboard");
}

function showLocationsView() {
  dashboardSections.forEach((section) => section.classList.add("hidden"));
  hideAllFeatureViews();

  locationsView?.classList.remove("hidden");
  addLocationView?.classList.add("hidden");
  valetOperationsView?.classList.add("hidden");
  driversView?.classList.add("hidden");
  addDriverView?.classList.add("hidden");
  driverDetailsView?.classList.add("hidden");

  customerDetailsView?.classList.add("hidden");
  editCustomerView?.classList.add("hidden");
  customerAddVehicleView?.classList.add("hidden");
  customerCreateBookingView?.classList.add("hidden");

  document.querySelector(".dashboard-title h1").textContent = "Locations";
  document.querySelector(".dashboard-title p").textContent =
    "Manage all valet parking locations and operational performance";

  setActiveNav("#locations");
  loadLocations();
  loadLocationStatistics();
}

async function showValetOperationsView() {
  dashboardSections.forEach((section) => section.classList.add("hidden"));

  locationsView?.classList.add("hidden");
  addLocationView?.classList.add("hidden");
  valetOperationsView?.classList.remove("hidden");
  driversView?.classList.add("hidden");
  addDriverView?.classList.add("hidden");
  driverDetailsView?.classList.add("hidden");

  customerDetailsView?.classList.add("hidden");
  editCustomerView?.classList.add("hidden");
  customerAddVehicleView?.classList.add("hidden");
  customerCreateBookingView?.classList.add("hidden");

  document.querySelector(".dashboard-title h1").textContent =
    "Valet Operations";
  document.querySelector(".dashboard-title p").textContent =
    "Real-time overview and management of valet parking operations";

  setActiveNav("#valet-operations");

  await loadValetFeatureScripts();
  await loadValetOperationsPage();
}

async function showDriversView() {
  dashboardSections.forEach((section) => {
    section.classList.add("hidden");
  });

  locationsView?.classList.add("hidden");
  addLocationView?.classList.add("hidden");
  valetOperationsView?.classList.add("hidden");

  /*
   * Driver views
   */
  addDriverView?.classList.add("hidden");
  driverDetailsView?.classList.add("hidden");
  driversView?.classList.remove("hidden");
  editDriverView?.classList.add("hidden");
  /*
   * Customer views
   */
  customersView?.classList.add("hidden");
  addCustomerView?.classList.add("hidden");
  customerDetailsView?.classList.add("hidden");
  editCustomerView?.classList.add("hidden");
  customerAddVehicleView?.classList.add("hidden");
  customerCreateBookingView?.classList.add("hidden");

  const title = document.querySelector(".dashboard-title h1");

  const subtitle = document.querySelector(".dashboard-title p");

  if (title) {
    title.textContent = "Drivers";
  }

  if (subtitle) {
    subtitle.textContent =
      "Manage independent drivers, valet company drivers, documents, and availability";
  }

  setActiveNav("#drivers");

  await loadDriverFeatureScripts();
  await loadDriversPage();
}

async function showDriverDetailsView() {
  dashboardSections.forEach((section) => {
    section.classList.add("hidden");
  });

  locationsView?.classList.add("hidden");
  addLocationView?.classList.add("hidden");
  valetOperationsView?.classList.add("hidden");

  driversView?.classList.add("hidden");
  addDriverView?.classList.add("hidden");
  editDriverView?.classList.add("hidden");

  driverDetailsView?.classList.remove("hidden");

  customersView?.classList.add("hidden");
  addCustomerView?.classList.add("hidden");
  customerDetailsView?.classList.add("hidden");
  editCustomerView?.classList.add("hidden");
  customerAddVehicleView?.classList.add("hidden");
  customerCreateBookingView?.classList.add("hidden");

  const title = document.querySelector(".dashboard-title h1");

  const subtitle = document.querySelector(".dashboard-title p");

  if (title) {
    title.textContent = "Driver Details";
  }

  if (subtitle) {
    subtitle.textContent =
      "View and manage driver information, assignments, documents, and performance";
  }

  setActiveNav("#drivers");

  const queryString = window.location.hash.split("?")[1] || "";

  const params = new URLSearchParams(queryString);

  const driverId =
    params.get("id") ||
    sessionStorage.getItem("selectedDriverId") ||
    "DRV-1001";

  await loadDriverFeatureScripts();
  await loadDriverDetailsPage(driverId);
}

async function showEditDriverView() {
  dashboardSections.forEach((section) => {
    section.classList.add("hidden");
  });

  locationsView?.classList.add("hidden");
  addLocationView?.classList.add("hidden");
  valetOperationsView?.classList.add("hidden");

  driversView?.classList.add("hidden");
  driverDetailsView?.classList.add("hidden");
  addDriverView?.classList.add("hidden");

  editDriverView?.classList.remove("hidden");

  customersView?.classList.add("hidden");
  addCustomerView?.classList.add("hidden");
  customerDetailsView?.classList.add("hidden");
  editCustomerView?.classList.add("hidden");
  customerAddVehicleView?.classList.add("hidden");
  customerCreateBookingView?.classList.add("hidden");

  const title = document.querySelector(".dashboard-title h1");

  const subtitle = document.querySelector(".dashboard-title p");

  if (title) {
    title.textContent = "Edit Driver";
  }

  if (subtitle) {
    subtitle.textContent =
      "Update driver information, employment details, and contact address";
  }

  setActiveNav("#drivers");

  const queryString = window.location.hash.split("?")[1] || "";

  const params = new URLSearchParams(queryString);

  const driverId =
    params.get("id") ||
    sessionStorage.getItem("selectedDriverId") ||
    "DRV-1001";

  await loadDriverFeatureScripts();
  await loadEditDriverPage(driverId);
}

async function showCustomersView() {
  dashboardSections.forEach((section) => section.classList.add("hidden"));

  locationsView?.classList.add("hidden");
  addLocationView?.classList.add("hidden");
  valetOperationsView?.classList.add("hidden");
  driversView?.classList.add("hidden");
  addDriverView?.classList.add("hidden");
  driverDetailsView?.classList.add("hidden");
  editDriverView?.classList.add("hidden");

  customersView?.classList.remove("hidden");
  addCustomerView?.classList.add("hidden");
  customerDetailsView?.classList.add("hidden");
  editCustomerView?.classList.add("hidden");
  customerAddVehicleView?.classList.add("hidden");
  customerCreateBookingView?.classList.add("hidden");

  document.querySelector(".dashboard-title h1").textContent = "Customers";
  document.querySelector(".dashboard-title p").textContent =
    "Manage and monitor all your customers across locations";

  setActiveNav("#customers");

  await loadCustomerFeatureScripts();
  await loadCustomersPage();
}

async function showAddCustomerView() {
  dashboardSections.forEach((section) => {
    section.classList.add("hidden");
  });

  locationsView?.classList.add("hidden");
  addLocationView?.classList.add("hidden");
  valetOperationsView?.classList.add("hidden");
  driversView?.classList.add("hidden");
  addDriverView?.classList.add("hidden");
  driverDetailsView?.classList.add("hidden");

  customersView?.classList.add("hidden");
  addCustomerView?.classList.remove("hidden");
  customerDetailsView?.classList.add("hidden");
  editCustomerView?.classList.add("hidden");
  customerAddVehicleView?.classList.add("hidden");
  customerCreateBookingView?.classList.add("hidden");

  document.querySelector(".dashboard-title h1").textContent = "Add Customer";
  document.querySelector(".dashboard-title p").textContent =
    "Create a new customer and add their details";

  setActiveNav("#customers");

  await loadCustomerFeatureScripts();
  await loadAddCustomerPage();
}

async function showCustomerDetailsView() {
  dashboardSections.forEach((section) => {
    section.classList.add("hidden");
  });

  locationsView?.classList.add("hidden");
  addLocationView?.classList.add("hidden");
  valetOperationsView?.classList.add("hidden");
  driversView?.classList.add("hidden");
  addDriverView?.classList.add("hidden");
  driverDetailsView?.classList.add("hidden");

  customersView?.classList.add("hidden");
  addCustomerView?.classList.add("hidden");
  customerDetailsView?.classList.remove("hidden");
  editCustomerView?.classList.add("hidden");
  customerAddVehicleView?.classList.add("hidden");
  customerCreateBookingView?.classList.add("hidden");

  document.querySelector(".dashboard-title h1").textContent =
    "Customer Details";

  document.querySelector(".dashboard-title p").textContent =
    "View and manage customer information and activity";

  setActiveNav("#customers");

  const customerId = getCurrentCustomerId();

  await loadCustomerFeatureScripts();

  await loadCustomerDetailsPage("overview");
}

async function showAddDriverView() {
  dashboardSections.forEach((section) => section.classList.add("hidden"));

  locationsView?.classList.add("hidden");
  addLocationView?.classList.add("hidden");
  valetOperationsView?.classList.add("hidden");
  driversView?.classList.add("hidden");
  driverDetailsView?.classList.add("hidden");
  editDriverView?.classList.add("hidden");

  addDriverView?.classList.remove("hidden");
  customerDetailsView?.classList.add("hidden");
  editCustomerView?.classList.add("hidden");
  customerCreateBookingView?.classList.add("hidden");

  document.querySelector(".dashboard-title h1").textContent = "Add Driver";
  document.querySelector(".dashboard-title p").textContent =
    "Register a new driver and assign to company, location and parking zone";

  setActiveNav("#drivers");

  await loadDriverFeatureScripts();
  await loadAddDriverPage();
}

function handleDashboardRoute() {
  if (window.location.hash === "#add-location") {
    showAddLocationView();
    return;
  }

  if (window.location.hash === "#valet-operations") {
    showValetOperationsView();
    return;
  }
  if (window.location.hash === "#locations") {
    showLocationsView();
    return;
  }

  if (window.location.hash === "#valet") {
    window.location.hash = "valet-operations";
    return;
  }
  if (window.location.hash === "#add-driver") {
    showAddDriverView();
    return;
  }
  if (window.location.hash.startsWith("#edit-driver")) {
    showEditDriverView();
    return;
  }

  if (window.location.hash.startsWith("#driver-details")) {
    showDriverDetailsView();
    return;
  }

  if (window.location.hash === "#drivers") {
    showDriversView();
    return;
  }

  if (window.location.hash.startsWith("#customer-add-vehicle")) {
    showCustomerAddVehicleView();
    return;
  }

  if (window.location.hash.startsWith("#customer-create-booking")) {
    showCustomerCreateBookingView();
    return;
  }

  if (window.location.hash.startsWith("#customer-details")) {
    showCustomerDetailsView();
    return;
  }

  if (window.location.hash.startsWith("#edit-customer")) {
    showEditCustomerView();
    return;
  }

  if (window.location.hash === "#customers") {
    showCustomersView();
    return;
  }

  if (window.location.hash === "#add-customer") {
    showAddCustomerView();
    return;
  }

  showMainDashboardView();
}

window.addEventListener("hashchange", handleDashboardRoute);

document
  .querySelector('a[href="#locations"]')
  ?.addEventListener("click", () => {
    setTimeout(showLocationsView, 0);
  });

document.querySelectorAll('a[href="#dashboard"]').forEach((link) => {
  if (link.dataset.dashboardRouteBound === "true") {
    return;
  }

  link.dataset.dashboardRouteBound = "true";

  link.addEventListener("click", (event) => {
    event.preventDefault();

    /*
     * When the URL is already
     * #dashboard, hashchange will
     * not run. Render it directly.
     */
    if (window.location.hash === "#dashboard") {
      showMainDashboardView();
      return;
    }

    /*
     * Otherwise update the route and
     * let handleDashboardRoute run.
     */
    window.location.hash = "dashboard";
  });
});

async function showEditCustomerView() {
  dashboardSections.forEach((section) => {
    section.classList.add("hidden");
  });

  locationsView?.classList.add("hidden");
  addLocationView?.classList.add("hidden");
  valetOperationsView?.classList.add("hidden");
  driversView?.classList.add("hidden");
  addDriverView?.classList.add("hidden");
  driverDetailsView?.classList.add("hidden");

  customersView?.classList.add("hidden");
  addCustomerView?.classList.add("hidden");
  customerDetailsView?.classList.add("hidden");
  editCustomerView?.classList.remove("hidden");
  customerAddVehicleView?.classList.add("hidden");
  customerCreateBookingView?.classList.add("hidden");

  document.querySelector(".dashboard-title h1").textContent = "Edit Customer";

  document.querySelector(".dashboard-title p").textContent =
    "Update customer information and preferences";

  setActiveNav("#customers");

  const customerId = getCurrentCustomerId();

  await loadCustomerFeatureScripts();

  await loadEditCustomerPage(customerId);
}

async function showCustomerAddVehicleView() {
  dashboardSections.forEach((section) => {
    section.classList.add("hidden");
  });

  locationsView?.classList.add("hidden");
  addLocationView?.classList.add("hidden");
  valetOperationsView?.classList.add("hidden");
  driversView?.classList.add("hidden");
  addDriverView?.classList.add("hidden");
  driverDetailsView?.classList.add("hidden");

  customersView?.classList.add("hidden");
  addCustomerView?.classList.add("hidden");
  customerDetailsView?.classList.add("hidden");
  editCustomerView?.classList.add("hidden");
  customerCreateBookingView?.classList.add("hidden");

  customerAddVehicleView?.classList.remove("hidden");

  document.querySelector(".dashboard-title h1").textContent = "Add Vehicle";
  document.querySelector(".dashboard-title p").textContent =
    "Add a new vehicle for Muhammad Ahmed";

  setActiveNav("#customers");

  const customerId = getCurrentCustomerId();

  await loadCustomerFeatureScripts();

  await loadCustomerAddVehiclePage(customerId);
}

async function showCustomerCreateBookingView() {
  dashboardSections.forEach((section) => {
    section.classList.add("hidden");
  });

  locationsView?.classList.add("hidden");
  addLocationView?.classList.add("hidden");
  valetOperationsView?.classList.add("hidden");
  driversView?.classList.add("hidden");
  addDriverView?.classList.add("hidden");
  customersView?.classList.add("hidden");
  addCustomerView?.classList.add("hidden");
  customerDetailsView?.classList.add("hidden");
  editCustomerView?.classList.add("hidden");
  customerAddVehicleView?.classList.add("hidden");
  customerCreateBookingView?.classList.add("hidden");

  customerCreateBookingView?.classList.remove("hidden");

  const pageTitle = document.querySelector(".dashboard-title h1");
  const pageSubtitle = document.querySelector(".dashboard-title p");

  if (pageTitle) {
    pageTitle.textContent = "Add New Booking";
  }

  if (pageSubtitle) {
    pageSubtitle.textContent =
      "Create a new parking reservation for this customer";
  }

  setActiveNav("#customers");

  const customerId = getCurrentCustomerId();

  await loadCustomerFeatureScripts();

  await loadCustomerCreateBookingPage(customerId);
}

function filterLocations() {
  const searchValue = locationSearch?.value.trim().toLowerCase() || "";
  const statusValue = locationStatusFilter?.value || "all";
  const cityValue = locationCityFilter?.value || "all";

  let visibleCount = 0;

  locationItems.forEach((item) => {
    const name = item.dataset.name || "";
    const city = item.dataset.city || "";
    const status = item.dataset.status || "";

    const matchesSearch =
      !searchValue || name.includes(searchValue) || city.includes(searchValue);
    const matchesStatus = statusValue === "all" || status === statusValue;
    const matchesCity = cityValue === "all" || city === cityValue;

    const isVisible = matchesSearch && matchesStatus && matchesCity;

    item.classList.toggle("hidden", !isVisible);

    if (isVisible) {
      visibleCount += 1;
    }
  });

  if (locationsResultCount) {
    locationsResultCount.textContent = `Showing ${visibleCount} of 18 locations`;
  }
}

async function loadLocations(page = 1) {
  try {
    const response = await fetch(
      `${API_BASE_URL}/locations?page=${page}&limit=20`,
      {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("parkin_access_token")}`,
        },
      },
    );

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.message || "Unable to load locations.");
    }

    const tbody = document.getElementById("locations-table-body");
    if (!tbody) return;

    tbody.innerHTML = "";

    console.log("Locations API result:", result);

    const locations =
      result.data?.items || result.items || result.data?.data?.items || [];

    console.log("Locations array:", locations);

    console.log(result);
    console.log(locations);
    console.log(locations.length);

    locations.forEach((location) => {
      tbody.insertAdjacentHTML(
        "beforeend",
        `
        <div class="locations-row location-item"
          data-id="${location.id}"
          data-name="${location.name.toLowerCase()}"
          data-city="${location.city.toLowerCase()}"
          data-status="${location.status.toLowerCase()}">

          <span class="location-info">
            <i
              class="location-thumb"
                style="background:url('${getImageUrl(location.imageUrl)}') center / cover no-repeat"
            ></i>
            <b>${location.name}<small>${location.address}</small></b>
          </span>

          <span data-label="City">${location.city}</span>
          <span data-label="Type">${location.type.replaceAll("_", " ")}</span>
          <span data-label="Occupancy"><i class="ring green" style="--value:0%">0%</i></span>
          <span data-label="Revenue"><b>SAR 0</b><small class="up">New</small></span>
          <span data-label="Vehicles">0</span>
          <span data-label="Wait Time">0 min</span>
          <span data-label="Status">
            <em class="loc-status ${location.status.toLowerCase()}">${location.status}</em>
          </span>
          <span class="loc-actions">
            <button type="button">▥</button>
            <button class="loc-more" type="button">⋮</button>
          </span>
        </div>
        `,
      );
    });

    if (locationsResultCount) {
      const total = result.data?.meta?.total || locations.length;
      locationsResultCount.textContent = `Showing ${locations.length} of ${total} locations`;
    }
  } catch (error) {
    console.error("Load locations error:", error);
  }
}

async function loadLocationStatistics() {
  const response = await fetch(`${API_BASE_URL}/locations/statistics`, {
    headers: {
      Authorization: `Bearer ${localStorage.getItem("parkin_access_token")}`,
    },
  });

  const result = await response.json();

  if (!response.ok) return;

  const stats = result.data || result;

  document.querySelector(
    ".locations-kpi-grid article:nth-child(1) strong",
  ).textContent = stats.total ?? 0;

  document.querySelector(
    ".locations-kpi-grid article:nth-child(2) strong",
  ).textContent = stats.active ?? 0;

  document.querySelector(
    ".locations-kpi-grid article:nth-child(3) strong",
  ).textContent = stats.inactive ?? 0;

  document.querySelector(
    ".locations-kpi-grid article:nth-child(4) strong",
  ).textContent = `${stats.averageOccupancy ?? 0}%`;

  document.querySelector(
    ".locations-kpi-grid article:nth-child(5) strong",
  ).textContent = `SAR ${(stats.totalRevenueToday ?? 0).toLocaleString()}`;
}

async function getLocationById(id) {
  const response = await fetch(`${API_BASE_URL}/locations/${id}`, {
    headers: {
      Authorization: `Bearer ${localStorage.getItem("parkin_access_token")}`,
    },
  });

  const result = await response.json();

  if (!response.ok) {
    throw new Error(result.message || "Unable to load location.");
  }

  return result.data || result;
}

function fillLocationForm(location) {
  addLocationForm.dataset.editId = location.id;

  addLocationForm.name.value = location.name || "";
  addLocationForm.type.value = location.type || "";
  addLocationForm.city.value = location.city || "";
  addLocationForm.district.value = location.district || "";
  addLocationForm.address.value = location.address || "";
  addLocationForm.latitude.value = location.latitude || "";
  addLocationForm.longitude.value = location.longitude || "";
  addLocationForm.postalCode.value = location.postalCode || "";
  addLocationForm.contactPhone.value = location.contactPhone || "";
  addLocationForm.email.value = location.email || "";
  addLocationForm.website.value = location.website || "";
  addLocationForm.timezone.value = location.timezone || "Asia/Riyadh";
  addLocationForm.openingTime.value = location.openingTime || "08:00";
  addLocationForm.closingTime.value = location.closingTime || "23:00";
  addLocationForm.capacity.value = location.capacity || "";
  addLocationForm.notes.value = location.notes || "";

  const statusInput = addLocationForm.querySelector(
    `input[name="status"][value="${location.status}"]`,
  );

  if (statusInput) statusInput.checked = true;

  const previewImage = document.querySelector(".preview-card img");
  const previewTitle = document.querySelector(".preview-card b");
  const previewSize = document.querySelector(".preview-card small");

  if (previewImage) {
    previewImage.src = getImageUrl(location.imageUrl);
  }

  if (previewTitle) {
    previewTitle.textContent = location.imageUrl
      ? location.imageUrl.split("/").pop()
      : "No image uploaded";
  }

  if (previewSize) {
    previewSize.textContent = location.imageUrl ? "Saved image" : "";
  }
}

locationSearch?.addEventListener("input", filterLocations);
locationStatusFilter?.addEventListener("change", filterLocations);
locationCityFilter?.addEventListener("change", filterLocations);

const actionsBackdrop = document.createElement("div");
actionsBackdrop.className = "actions-backdrop";
document.body.appendChild(actionsBackdrop);

const actionsMenu = document.createElement("div");
actionsMenu.className = "location-actions-menu";
actionsMenu.innerHTML = `
  <button type="button">👁 View Details</button>
  <button type="button">✏ Edit Location</button>
  <button type="button">📊 Live Operations</button>
  <button type="button">👥 Assigned Drivers</button>
  <button type="button">🚗 Vehicle Queue</button>
  <hr />
  <button type="button" class="danger">⏸ Suspend Location</button>
  <button type="button" class="danger">🗑 Delete Location</button>
`;

actionsMenu.addEventListener("click", async (event) => {
  event.stopPropagation();

  const actionButton = event.target.closest("button");
  if (!actionButton) return;

  const actionText = actionButton.textContent.trim();

  if (!selectedLocationId) {
    console.error("No selectedLocationId found");
    return;
  }

  try {
    if (actionText.includes("Delete Location")) {
      closeLocationActionsMenu();
      openDeleteLocationModal();
      return;
    }

    if (actionText.includes("View Details")) {
      const location = await getLocationById(selectedLocationId);

      closeLocationActionsMenu();
      openLocationDetailsModal(location);
      return;
    }

    if (actionText.includes("Edit Location")) {
      const location = await getLocationById(selectedLocationId);

      closeLocationActionsMenu();
      fillLocationForm(location);
      showAddLocationView();

      document.querySelector(".dashboard-title p").textContent =
        "Update valet parking location details";
      document.querySelector(".save-location").textContent = "Update Location";
    }
  } catch (error) {
    console.error("Location action error:", error);
    alert(error.message);
  }
});

document.body.appendChild(actionsMenu);

// =========================================
// LOCATION DETAILS MODAL
// =========================================

const locationDetailsModal = document.createElement("div");
locationDetailsModal.className = "location-details-modal hidden";
locationDetailsModal.innerHTML = `
  <div class="location-details-card">
    <div class="location-details-header">
      <div>
        <h2 id="details-location-name">Location Details</h2>
        <p id="details-location-code">-</p>
      </div>
      <button type="button" class="close-location-details">×</button>
    </div>

    <div class="location-details-body">
      <div class="details-image" id="details-location-image"></div>

      <div class="details-grid">
        <div><span>City</span><strong id="details-city">-</strong></div>
        <div><span>Type</span><strong id="details-type">-</strong></div>
        <div><span>Status</span><strong id="details-status">-</strong></div>
        <div><span>Capacity</span><strong id="details-capacity">-</strong></div>
        <div><span>Phone</span><strong id="details-phone">-</strong></div>
        <div><span>Email</span><strong id="details-email">-</strong></div>
        <div class="wide"><span>Address</span><strong id="details-address">-</strong></div>
        <div class="wide"><span>Notes</span><strong id="details-notes">-</strong></div>
      </div>
    </div>
  </div>
`;
document.body.appendChild(locationDetailsModal);

const deleteLocationModal = document.createElement("div");
deleteLocationModal.className = "location-delete-modal hidden";
deleteLocationModal.innerHTML = `
  <div class="location-delete-card">
    <h2>Delete Location?</h2>
    <p>Are you sure, want to delete this location?</p>
    <div>
      <button type="button" class="cancel-delete-location">Cancel</button>
      <button type="button" class="confirm-delete-location">Confirm Delete</button>
    </div>
  </div>
`;
document.body.appendChild(deleteLocationModal);

function openDeleteLocationModal() {
  deleteLocationModal.classList.remove("hidden");
}

function closeDeleteLocationModal() {
  deleteLocationModal.classList.add("hidden");
}

function closeLocationDetailsModal() {
  locationDetailsModal.classList.add("hidden");
}

function openLocationDetailsModal(location) {
  document.getElementById("details-location-name").textContent =
    location.name || "-";
  document.getElementById("details-location-code").textContent =
    location.code || "-";
  document.getElementById("details-city").textContent = location.city || "-";
  document.getElementById("details-type").textContent = (
    location.type || "-"
  ).replaceAll("_", " ");
  document.getElementById("details-status").textContent =
    location.status || "-";
  document.getElementById("details-capacity").textContent =
    location.capacity || "-";
  document.getElementById("details-phone").textContent =
    location.contactPhone || "-";
  document.getElementById("details-email").textContent = location.email || "-";
  document.getElementById("details-address").textContent =
    location.address || "-";
  document.getElementById("details-notes").textContent = location.notes || "-";

  document.getElementById("details-location-image").style.background =
    `url('${getImageUrl(location.imageUrl)}') center / cover no-repeat`;

  locationDetailsModal.classList.remove("hidden");
}

locationDetailsModal.addEventListener("click", (event) => {
  if (
    event.target.classList.contains("location-details-modal") ||
    event.target.classList.contains("close-location-details")
  ) {
    closeLocationDetailsModal();
  }
});

// ==========================================
// DELETE LOCATION MODAL EVENTS
// ==========================================

deleteLocationModal.addEventListener("click", async (event) => {
  if (
    event.target.classList.contains("location-delete-modal") ||
    event.target.classList.contains("cancel-delete-location")
  ) {
    closeDeleteLocationModal();
    return;
  }

  if (!event.target.classList.contains("confirm-delete-location")) {
    return;
  }

  try {
    const response = await fetch(
      `${API_BASE_URL}/locations/${selectedLocationId}`,
      {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${localStorage.getItem("parkin_access_token")}`,
        },
      },
    );

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.message || "Unable to delete location.");
    }

    closeDeleteLocationModal();

    await loadLocations();
  } catch (error) {
    alert(error.message || "Delete failed.");
  }
});

function closeLocationActionsMenu() {
  actionsMenu.classList.remove("is-open");
  actionsBackdrop.classList.remove("is-open");
}

function openLocationActionsMenu(button) {
  const isMobile = window.matchMedia("(max-width: 640px)").matches;
  const rect = button.getBoundingClientRect();

  actionsMenu.classList.add("is-open");

  if (isMobile) {
    actionsMenu.style.top = "auto";
    actionsMenu.style.left = "12px";
    actionsMenu.style.right = "12px";
    actionsMenu.style.bottom = "12px";
    actionsBackdrop.classList.add("is-open");
    return;
  }

  const menuWidth = 248;
  const menuHeight = Math.min(
    actionsMenu.scrollHeight,
    window.innerHeight - 24,
  );

  let top = rect.bottom + 8;
  let left = rect.right - menuWidth;

  if (top + menuHeight > window.innerHeight - 12) {
    top = Math.max(12, window.innerHeight - menuHeight - 12);
  }

  if (left < 12) {
    left = 12;
  }

  if (left + menuWidth > window.innerWidth - 12) {
    left = window.innerWidth - menuWidth - 12;
  }

  actionsMenu.style.top = `${top}px`;
  actionsMenu.style.left = `${left}px`;
  actionsMenu.style.right = "auto";
  actionsMenu.style.bottom = "auto";

  actionsBackdrop.classList.remove("is-open");
}

document.addEventListener("click", (event) => {
  const button = event.target.closest(".loc-more");

  if (button) {
    event.stopPropagation();
    selectedLocationId = button.closest(".location-item")?.dataset.id;
    openLocationActionsMenu(button);
    return;
  }

  closeLocationActionsMenu();
});

actionsBackdrop.addEventListener("click", closeLocationActionsMenu);

window.addEventListener("resize", closeLocationActionsMenu);
window.addEventListener("scroll", closeLocationActionsMenu, true);

handleDashboardRoute();
filterLocations();

function showAddLocationView() {
  dashboardSections.forEach((section) => section.classList.add("hidden"));
  locationsView?.classList.add("hidden");
  addLocationView?.classList.remove("hidden");
  valetOperationsView?.classList.add("hidden");
  driversView?.classList.add("hidden");
  addDriverView?.classList.add("hidden");

  document.querySelector(".dashboard-title h1").textContent = "Locations";
  document.querySelector(".dashboard-title p").textContent =
    "Create a new valet parking location";

  setActiveNav("#locations");
  window.location.hash = "add-location";
}

function backToLocationsView() {
  addLocationView?.classList.add("hidden");
  showLocationsView();
  window.location.hash = "locations";

  delete addLocationForm.dataset.editId;
  document.querySelector(".save-location").textContent = "Save Location";

  document.querySelector(".preview-card img").src =
    "/public/assets/parkin-valet-hero.jpg";
  document.querySelector(".preview-card b").textContent = "Riyadh Mall.jpg";
  document.querySelector(".preview-card small").textContent = "2.4 MB";
}

function showDashboardAlert(
  message,
  {
    title = "Unable to continue",
    type = "error",
    buttonText = "Okay",
    cancelButtonText = "",
    onConfirm = null,
  } = {},
) {
  document.querySelector("#dashboard-alert-modal")?.remove();

  const typeConfig = {
    error: {
      icon: "fa-triangle-exclamation",
      label: "Action required",
    },

    warning: {
      icon: "fa-circle-exclamation",
      label: "Please review",
    },

    success: {
      icon: "fa-check",
      label: "Success",
    },

    info: {
      icon: "fa-circle-info",
      label: "Information",
    },
  };

  const config = typeConfig[type] || typeConfig.error;

  const messages = Array.isArray(message)
    ? message
    : String(message || "")
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);

  const modal = document.createElement("div");

  modal.id = "dashboard-alert-modal";
  modal.className = `dashboard-alert-modal dashboard-alert-${type}`;

  modal.innerHTML = `
    <div
      class="dashboard-alert-backdrop"
      data-dashboard-alert-close
    ></div>

    <section
      class="dashboard-alert-card"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="dashboard-alert-title"
    >
      <button
        type="button"
        class="dashboard-alert-close"
        data-dashboard-alert-close
        aria-label="Close"
      >
        <i class="fa-solid fa-xmark"></i>
      </button>

      <div class="dashboard-alert-icon">
        <i class="fa-solid ${config.icon}"></i>
      </div>

      <span class="dashboard-alert-label">
        ${config.label}
      </span>

      <h2 id="dashboard-alert-title">
        ${title}
      </h2>

      <div class="dashboard-alert-message">
        ${
          messages.length > 1
            ? `
              <ul>
                ${messages
                  .map((item) => `<li>${escapeDashboardAlertHtml(item)}</li>`)
                  .join("")}
              </ul>
            `
            : `
              <p>
                ${escapeDashboardAlertHtml(
                  messages[0] || "Something went wrong.",
                )}
              </p>
            `
        }
      </div>

<div class="dashboard-alert-actions">
  ${
    cancelButtonText
      ? `
        <button
          type="button"
          class="dashboard-alert-secondary"
          data-dashboard-alert-close
        >
          ${escapeDashboardAlertHtml(cancelButtonText)}
        </button>
      `
      : ""
  }

  <button
    type="button"
    class="dashboard-alert-primary"
    data-dashboard-alert-primary
  >
    ${escapeDashboardAlertHtml(buttonText)}
  </button>
</div>
    </section>
  `;

  document.body.appendChild(modal);
  document.body.classList.add("dashboard-alert-open");

  requestAnimationFrame(() => {
    modal.classList.add("is-visible");
  });

  let isClosing = false;

  const closeModal = () => {
    if (isClosing) {
      return;
    }

    isClosing = true;

    document.removeEventListener("keydown", escapeHandler);

    modal.classList.remove("is-visible");

    document.body.classList.remove("dashboard-alert-open");

    window.setTimeout(() => {
      modal.remove();
    }, 220);
  };

  const escapeHandler = (event) => {
    if (event.key === "Escape") {
      closeModal();
    }
  };

  modal.querySelectorAll("[data-dashboard-alert-close]").forEach((element) => {
    element.addEventListener("click", closeModal);
  });

  const primaryButton = modal.querySelector("[data-dashboard-alert-primary]");

  primaryButton?.addEventListener("click", async () => {
    if (primaryButton.disabled) {
      return;
    }

    primaryButton.disabled = true;

    const secondaryButton = modal.querySelector(".dashboard-alert-secondary");

    if (secondaryButton) {
      secondaryButton.disabled = true;
    }

    closeModal();

    if (typeof onConfirm === "function") {
      await onConfirm();
    }
  });

  document.addEventListener("keydown", escapeHandler);

  modal
    .querySelector(".dashboard-alert-secondary, .dashboard-alert-primary")
    ?.focus();
}

function escapeDashboardAlertHtml(value) {
  const element = document.createElement("div");

  element.textContent = String(value || "");

  return element.innerHTML;
}

window.nativeAlert = window.alert.bind(window);

window.alert = function (message) {
  showDashboardAlert(message, {
    title: "Please check the information",
    type: "error",
    buttonText: "Okay",
  });
};

addLocationBtn?.addEventListener("click", showAddLocationView);
backToLocationsBtn?.addEventListener("click", backToLocationsView);
cancelLocationBtn?.addEventListener("click", backToLocationsView);

// Save button functionality
addLocationForm?.addEventListener("submit", async (event) => {
  event.preventDefault();

  const saveButton = addLocationForm.querySelector(".save-location");

  saveButton.disabled = true;
  saveButton.textContent = "Saving...";

  try {
    const formData = new FormData(addLocationForm);

    if (formData.get("capacity")) {
      formData.set("capacity", String(Number(formData.get("capacity"))));
    }

    const editId = addLocationForm.dataset.editId;

    const method = editId ? "PATCH" : "POST";

    const url = editId
      ? `${API_BASE_URL}/locations/${editId}`
      : `${API_BASE_URL}/locations`;

    const response = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${localStorage.getItem("parkin_access_token")}`,
      },
      body: formData,
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.message || "Failed to save location");
    }

    alert(
      editId
        ? "Location updated successfully."
        : "Location saved successfully.",
    );

    delete addLocationForm.dataset.editId;

    addLocationForm.reset();

    backToLocationsView();

    await loadLocations();
  } catch (error) {
    alert(error.message || "Something went wrong.");
  } finally {
    saveButton.disabled = false;
    saveButton.textContent = "Save Location";
  }
});

restoreSession();
updateLanguage("en");
