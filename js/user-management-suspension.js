/* Shared Add/Edit dashboard-user suspension controls.
   Stored times are UTC instants; inputs display local wall-clock time. */
window.ParkinUserSuspension = (() => {
  const pad = (n) => String(n).padStart(2, "0");
  const localDateTime = (value) => {
    if (!value) return "";
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return "";
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };
  const field = (root, key) => root.querySelector(`[data-user-suspension-field="${key}"]`);
  const rootFor = (form) => form.querySelector("[data-user-suspension]");
  const template = `
    <div class="user-suspension-head">
      <div><h3><i class="fa-solid fa-shield-halved" aria-hidden="true"></i> Automatic Account Suspension</h3>
        <p>Schedule dashboard access restrictions without changing manual account status.</p></div>
      <label class="user-suspension-toggle"><input type="checkbox" data-user-suspension-field="enabled" /> Enable</label>
    </div>
    <div class="user-suspension-options" data-user-suspension-options hidden>
      <div class="user-suspension-grid">
        <label>Suspension Type
          <select data-user-suspension-field="type"><option value="LIMITED">Limited Time</option><option value="UNLIMITED">Unlimited</option></select>
        </label>
        <label>Suspension Starts
          <select data-user-suspension-field="startMode"><option value="immediate">Immediately</option><option value="scheduled">Scheduled</option></select>
        </label>
        <label data-user-suspension-start hidden>Start Date &amp; Time
          <input type="datetime-local" data-user-suspension-field="startsAt" />
        </label>
        <label data-user-suspension-end><span>Automatic Reactivation <strong class="user-suspension-required">*</strong></span>
          <input type="datetime-local" data-user-suspension-field="endsAt" />
        </label>
      </div>
      <label class="user-suspension-reason">Suspension Reason (optional)
        <textarea data-user-suspension-field="reason" maxlength="500" rows="2" placeholder="Reason for suspending dashboard access"></textarea>
      </label>
      <p class="user-suspension-help">Times use your device's local time and are saved in UTC. Manual Disabled status always takes priority.</p>
    </div>
    <div class="user-suspension-preview"><span>Suspension Preview</span>
      <span class="user-suspension-state" data-user-suspension-state="NOT_SCHEDULED">Not scheduled</span></div>
  `;
  // Do not allow an expired schedule to be submitted as a new suspension.
  // Only an unchanged start of an already-active suspension may be retained.
  function retainsOngoingStart(root, startText, now) {
    if (!root.dataset.originalEnabled || root.dataset.originalEnabled !== "true" ||
        !startText || startText !== root.dataset.originalStart) return false;
    const previousEnd = root.dataset.originalEnd;
    return !previousEnd || new Date(previousEnd).getTime() > now.getTime();
  }
  function validateTimes(root, now = new Date()) {
    const mode = field(root, "startMode").value;
    const type = field(root, "type").value;
    const startText = field(root, "startsAt").value;
    const endText = field(root, "endsAt").value;
    const start = mode === "scheduled" ? new Date(startText) : now;
    const end = type === "LIMITED" ? new Date(endText) : null;
    if (mode === "scheduled" && (!startText || Number.isNaN(start.getTime()))) {
      return { state: "INCOMPLETE", error: "Select a valid suspension start date and time." };
    }
    if (type === "LIMITED" && (!endText || Number.isNaN(end.getTime()))) {
      return { state: "INCOMPLETE", error: "Select a valid automatic reactivation date and time." };
    }
    if (mode === "scheduled" && start <= now &&
        !retainsOngoingStart(root, startText, now)) {
      return { state: "INVALID_START", error: "Scheduled suspension must start after the current date and time." };
    }
    if (end && (end <= start || end <= now)) {
      return { state: "INVALID_END", error: "Automatic reactivation must be later than both the start and the current time." };
    }
    return { state: start > now ? "SCHEDULED" : "SUSPENDED", error: null };
  }
  function update(root) {
    if (!root) return;
    const enabled = field(root, "enabled").checked;
    const type = field(root, "type").value;
    const mode = field(root, "startMode").value;
    root.querySelector("[data-user-suspension-options]").hidden = !enabled;
    root.querySelector("[data-user-suspension-start]").hidden = !enabled || mode !== "scheduled";
    root.querySelector("[data-user-suspension-end]").hidden = !enabled || type !== "LIMITED";
    field(root, "startsAt").required = enabled && mode === "scheduled";
    field(root, "endsAt").required = enabled && type === "LIMITED";
    const state = enabled ? validateTimes(root).state : "NOT_SCHEDULED";
    const badge = root.querySelector("[data-user-suspension-state]");
    badge.dataset.userSuspensionState = state;
    badge.textContent = {
      NOT_SCHEDULED:"Not scheduled", INCOMPLETE:"Set required dates", SCHEDULED:"Scheduled",
      SUSPENDED:"Suspended", COMPLETED:"Completed",
      INVALID_START:"Start must be in future", INVALID_END:"Invalid reactivation time",
    }[state];
  }
  function mount(form, suspension) {
    const root = rootFor(form);
    if (!root) return;
    root.innerHTML = template;
    const enabled = Boolean(suspension?.enabled);
    field(root, "enabled").checked = enabled;
    field(root, "type").value = suspension?.type === "UNLIMITED" ? "UNLIMITED" : "LIMITED";
    // Retain the original start instant when an active suspension is edited.
    field(root, "startMode").value = enabled && suspension?.startsAt ? "scheduled" : "immediate";
    field(root, "startsAt").value = localDateTime(suspension?.startsAt);
    field(root, "endsAt").value = localDateTime(suspension?.endsAt);
    field(root, "reason").value = suspension?.reason || "";
    root.dataset.originalStart = localDateTime(suspension?.startsAt);
    root.dataset.originalEnd = localDateTime(suspension?.endsAt);
    root.dataset.originalEnabled = enabled ? "true" : "false";
    root.addEventListener("input", () => { root.dataset.dirty = "true"; update(root); });
    root.addEventListener("change", () => { root.dataset.dirty = "true"; update(root); });
    update(root);
  }
  function payload(form) {
    const root = rootFor(form);
    if (!root || !field(root, "enabled").checked) return { enabled:false };
    const type = field(root, "type").value;
    const mode = field(root, "startMode").value;
    const startText = field(root, "startsAt").value;
    const endText = field(root, "endsAt").value;
    const now = new Date();
    const validation = validateTimes(root, now);
    if (validation.error) throw new Error(validation.error);
    const startsAt = mode === "scheduled" ? new Date(startText).toISOString() : null;
    const endsAt = type === "LIMITED" ? new Date(endText).toISOString() : null;
    return {
      enabled:true, type, startsAt, endsAt,
      reason: field(root, "reason").value.trim(),
    };
  }
  function state(user) {
    if (!user?.isActive) return null;
    const suspension = user.suspension || {};
    if (suspension.enabled && suspension.startsAt) {
      const now = Date.now();
      const start = Date.parse(suspension.startsAt);
      const end = suspension.endsAt ? Date.parse(suspension.endsAt) : Infinity;
      if (Number.isFinite(start) && start > now) return "SCHEDULED";
      if (Number.isFinite(start) && start <= now && now < end) return "SUSPENDED";
    }
    return null;
  }
  return { mount, update, payload, state };
})();
