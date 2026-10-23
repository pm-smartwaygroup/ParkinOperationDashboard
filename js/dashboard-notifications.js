/* ParkIn Dashboard: one accessible, non-blocking notification system. */
(() => {
  "use strict";

  const allowed = new Set(["success", "error", "warning", "info"]);
  const defaults = Object.freeze({
    success: { title: "Success", icon: "fa-check", duration: 4500 },
    error: { title: "Something went wrong", icon: "fa-xmark", duration: 9000 },
    warning: { title: "Attention required", icon: "fa-exclamation", duration: 7000 },
    info: { title: "Information", icon: "fa-info", duration: 5500 },
  });
  const displayed = [];
  let stack;
  let sequence = 0;

  function getStack() {
    if (stack?.isConnected) return stack;
    stack = document.createElement("div");
    stack.id = "parkin-notifications";
    stack.className = "parkin-notifications";
    stack.setAttribute("aria-label", "Dashboard notifications");
    document.body.appendChild(stack);
    return stack;
  }

  function contentOf(message) {
    return (Array.isArray(message) ? message.join(" · ") : String(message ?? ""))
      .trim() || "No additional details available.";
  }

  function showParkinToast(message, options = {}) {
    const type = allowed.has(options.type) ? options.type : "info";
    const configuration = defaults[type];
    const title = String(options.title || configuration.title);
    const description = contentOf(message);
    const duration = Number.isFinite(options.duration)
      ? Math.max(0, Math.min(30000, options.duration))
      : configuration.duration;

    // Prevent repeated network events from flooding the page with duplicates.
    const duplicate = displayed.find(item =>
      item.type === type && item.title === title && item.description === description
    );
    if (duplicate) return duplicate.dismiss;

    const root = getStack();
    const notice = document.createElement("section");
    notice.className = `parkin-toast parkin-toast--${type}`;
    notice.setAttribute("role", type === "error" || type === "warning" ? "alert" : "status");
    notice.setAttribute("aria-live", type === "error" || type === "warning" ? "assertive" : "polite");
    notice.setAttribute("aria-atomic", "true");
    notice.style.setProperty("--toast-duration", `${duration}ms`);

    const iconHolder = document.createElement("span");
    iconHolder.className = "parkin-toast__icon";
    iconHolder.setAttribute("aria-hidden", "true");
    const icon = document.createElement("i");
    icon.className = `fa-solid ${configuration.icon}`;
    iconHolder.appendChild(icon);

    const textHolder = document.createElement("span");
    textHolder.className = "parkin-toast__copy";
    const heading = document.createElement("strong");
    heading.className = "parkin-toast__title";
    heading.textContent = title;
    const details = document.createElement("span");
    details.className = "parkin-toast__message";
    details.textContent = description;
    textHolder.append(heading, details);

    const close = document.createElement("button");
    close.className = "parkin-toast__close";
    close.type = "button";
    close.setAttribute("aria-label", `Dismiss ${type} notification`);
    close.textContent = "×";

    const progress = document.createElement("span");
    progress.className = "parkin-toast__progress";
    progress.setAttribute("aria-hidden", "true");

    notice.append(iconHolder, textHolder, close, progress);
    root.appendChild(notice);

    const item = {
      type, title, description, dismiss,
    };
    displayed.push(item);
    let timer;
    let remaining = duration;
    let startedAt = 0;
    let dismissed = false;
    const id = ++sequence;
    notice.dataset.notificationId = String(id);

    function dismiss() {
      if (dismissed) return;
      dismissed = true;
      clearTimeout(timer);
      const index = displayed.indexOf(item);
      if (index !== -1) displayed.splice(index, 1);
      notice.classList.add("is-closing");
      // Remove immediately for reduced motion. The normal path allows a short exit transition.
      const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
      if (reduced) notice.remove();
      else window.setTimeout(() => notice.remove(), 200);
    }

    function schedule() {
      if (!remaining || dismissed) return;
      startedAt = Date.now();
      timer = window.setTimeout(dismiss, remaining);
      notice.classList.remove("is-paused");
    }

    function pause() {
      if (dismissed || !duration) return;
      clearTimeout(timer);
      remaining = Math.max(0, remaining - (Date.now() - startedAt));
      notice.classList.add("is-paused");
    }

    close.addEventListener("click", dismiss);
    notice.addEventListener("mouseenter", pause);
    notice.addEventListener("mouseleave", schedule);
    notice.addEventListener("focusin", pause);
    notice.addEventListener("focusout", (event) => {
      if (!notice.contains(event.relatedTarget)) schedule();
    });
    if (duration > 0) schedule();
    else notice.classList.add("is-persistent");

    // Keep recent notices legible on desktop and small screens.
    while (displayed.length > 4) displayed[0].dismiss();
    return dismiss;
  }

  window.showParkinToast = showParkinToast;
})();
