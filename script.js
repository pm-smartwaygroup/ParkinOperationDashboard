const translations = {
  en: {
    heroLineOne: "Smart Parking.",
    heroLineTwo: "Smarter <strong>Operations.</strong>",
    heroDescription: "Manage Valet, Rental and Event parking operations seamlessly.",
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
    validationSuccess: "Validation passed. Connecting securely…",
  },
  ar: {
    heroLineOne: "مواقف ذكية.",
    heroLineTwo: "عمليات <strong>أكثر ذكاءً.</strong>",
    heroDescription: "أدر خدمات صف السيارات والتأجير ومواقف الفعاليات بكل سلاسة.",
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
    validationSuccess: "تم التحقق من البيانات. جارٍ الاتصال بشكل آمن…",
  },
};

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

let currentLanguage = "en";
let submitAttempted = false;
let submitTimer;

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
    const key = isPasswordVisible ? "hidePassword" : element.dataset.i18nAriaLabel;
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

emailInput.addEventListener("input", () => {
  clearSuccessState();
  if (submitAttempted || emailInput.getAttribute("aria-invalid") === "true") {
    validateEmail();
  }
});

passwordInput.addEventListener("input", () => {
  clearSuccessState();
  if (submitAttempted || passwordInput.getAttribute("aria-invalid") === "true") {
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

form.addEventListener("submit", (event) => {
  event.preventDefault();
  clearSuccessState();
  submitAttempted = true;

  if (!validateForm()) {
    const firstInvalidField =
      emailInput.getAttribute("aria-invalid") === "true" ? emailInput : passwordInput;
    firstInvalidField.focus();
    return;
  }

  submitButton.disabled = true;
  submitButton.classList.add("is-loading");
  formStatus.textContent = getCopy("validationSuccess");
  formStatus.classList.add("is-visible");

  submitTimer = window.setTimeout(() => {
    submitButton.disabled = false;
    submitButton.classList.remove("is-loading");
  }, 1000);
});

updateLanguage("en");
