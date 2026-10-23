/* Revenue page intentionally fails closed until a verified payment/settlement API exists.
 * Booking amounts or dashboard mock data must never appear as collected revenue. */
async function loadRevenuePage() {
  const container = document.querySelector('#revenue-container');
  if (!container) return;
  if (container.dataset.loaded === 'true' && container.innerHTML.trim()) return;

  container.replaceChildren();
  container.dataset.loaded = 'false';
  try {
    const response = await fetch('/pages/revenue.html', { cache: 'no-store' });
    if (!response.ok) throw new Error(`Revenue information unavailable (HTTP ${response.status}).`);
    const template = await response.text();
    if (!template.includes('revenue-integration-pending')) throw new Error('Unexpected revenue page content.');
    container.innerHTML = template;
    container.dataset.loaded = 'true';
  } catch (error) {
    const notice = document.createElement('section');
    notice.className = 'revenue-integration-pending';
    notice.setAttribute('role', 'alert');
    const title = document.createElement('h2');
    title.textContent = 'Revenue information unavailable';
    const message = document.createElement('p');
    message.textContent = error instanceof Error ? error.message : 'Please retry this page.';
    notice.append(title, message);
    container.replaceChildren(notice);
    // A later revisit must retry rather than falsely treating an error as loaded data.
  }
}
window.loadRevenuePage = loadRevenuePage;
