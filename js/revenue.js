const revenueOverviewData = {
  labels: ["May 18", "May 19", "May 20", "May 21", "May 22", "May 23", "May 24"],
  values: [2500, 4700, 3900, 6100, 7200, 5100, 6780],
};

const revenueLocationData = [
  { label: "Riyadh Front", value: 40, amount: "SAR 19,424.00" },
  { label: "Jeddah Mall", value: 25, amount: "SAR 12,140.00" },
  { label: "Hilton Hotel", value: 20, amount: "SAR 9,712.00" },
  { label: "Dammam Compound", value: 15, amount: "SAR 7,284.00" },
];

const paymentMethodData = [
  { label: "Card Payments", value: 72, amount: "SAR 34,963.20" },
  { label: "Cash", value: 20, amount: "SAR 9,712.00" },
  { label: "Wallet / Online", value: 8, amount: "SAR 3,884.80" },
];

const revenueChartColors = {
  green: "#0a9b55",
  greenDark: "#066b37",
  blue: "#1d70f2",
  purple: "#744ce6",
  orange: "#ffa11a",
  grid: "#e8edf3",
  tick: "#52637b",
};

let revenueOverviewChart = null;
let revenueLocationChart = null;
let revenuePaymentChart = null;

const revenueCenterTextPlugin = {
  id: "revenueCenterText",
  afterDraw(chart, args, options) {
    if (!options?.lines?.length) return;

    const { ctx, chartArea } = chart;

    if (!chartArea) return;

    const centerX = (chartArea.left + chartArea.right) / 2;
    const centerY = (chartArea.top + chartArea.bottom) / 2;
    const lineHeight = options.lineHeight || 22;
    const startY = centerY - ((options.lines.length - 1) * lineHeight) / 2;

    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    options.lines.forEach((line, index) => {
      ctx.fillStyle = line.color || "#071322";
      ctx.font = `${line.weight || 800} ${line.size || 14}px ${line.family || "Inter, Arial, sans-serif"}`;
      ctx.fillText(line.text, centerX, startY + index * lineHeight);
    });

    ctx.restore();
  },
};

async function loadRevenuePage() {
  const container = document.querySelector("#revenue-container");

  if (!container) {
    console.error("Revenue container was not found.");
    return;
  }

  try {
    if (container.dataset.loaded !== "true" || !container.innerHTML.trim()) {
      container.innerHTML = `
        <section class="revenue-page">
          <article class="revenue-panel">
            <p>Loading revenue...</p>
          </article>
        </section>
      `;

      const response = await fetch("/pages/revenue.html");

      if (!response.ok) {
        throw new Error(`Unable to load Revenue page: ${response.status}`);
      }

      container.innerHTML = await response.text();
      container.dataset.loaded = "true";
    }

    bindRevenuePageEvents(container);

    window.requestAnimationFrame(() => {
      initRevenueCharts();
    });
  } catch (error) {
    console.error("Unable to load Revenue page:", error);
    container.dataset.loaded = "false";
    container.innerHTML = `
      <section class="revenue-page">
        <article class="revenue-panel revenue-load-error">
          <i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i>
          <h2>Unable to load Revenue</h2>
          <p>${escapeRevenueHtml(error?.message || "Please refresh and try again.")}</p>
          <button type="button" class="revenue-primary-button" id="retry-revenue-page">
            Try Again
          </button>
        </article>
      </section>
    `;

    container
      .querySelector("#retry-revenue-page")
      ?.addEventListener("click", () => loadRevenuePage());
  }
}

function bindRevenuePageEvents(container) {
  if (container.dataset.eventsBound === "true") return;

  container.dataset.eventsBound = "true";

  container.addEventListener("click", (event) => {
    const exportToggle = event.target.closest("[data-revenue-export-toggle]");
    const exportMenu = container.querySelector("[data-revenue-export-menu]");

    if (exportToggle) {
      const willOpen = exportMenu?.classList.contains("hidden");

      exportMenu?.classList.toggle("hidden", !willOpen);
      exportToggle.setAttribute("aria-expanded", String(willOpen));
      return;
    }

    if (event.target.closest("[data-revenue-export-menu]")) {
      closeRevenueExportMenu(container);
      return;
    }

    if (!event.target.closest(".revenue-export-wrapper")) {
      closeRevenueExportMenu(container);
    }
  });
}

function closeRevenueExportMenu(container) {
  container
    .querySelector("[data-revenue-export-menu]")
    ?.classList.add("hidden");

  container
    .querySelector("[data-revenue-export-toggle]")
    ?.setAttribute("aria-expanded", "false");
}

function initRevenueCharts() {
  if (typeof Chart === "undefined") {
    console.warn("Chart.js is not available for the Revenue page.");
    return;
  }

  initRevenueOverviewChart();
  initRevenueLocationChart();
  initRevenuePaymentChart();
}

function initRevenueOverviewChart() {
  const canvas = document.querySelector("#revenue-overview-chart");

  if (!canvas) return;

  if (revenueOverviewChart) {
    revenueOverviewChart.destroy();
  }

  revenueOverviewChart = new Chart(canvas, {
    type: "line",
    data: {
      labels: revenueOverviewData.labels,
      datasets: [
        {
          label: "Revenue",
          data: revenueOverviewData.values,
          borderColor: revenueChartColors.green,
          backgroundColor: getRevenueLineFill,
          borderWidth: 3,
          pointRadius: 4,
          pointHoverRadius: 6,
          pointBackgroundColor: revenueChartColors.green,
          pointBorderColor: "#ffffff",
          pointBorderWidth: 2,
          tension: 0.32,
          fill: true,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        intersect: false,
        mode: "index",
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: "#ffffff",
          borderColor: "#dfe7ef",
          borderWidth: 1,
          titleColor: "#071322",
          bodyColor: "#071322",
          displayColors: false,
          padding: 12,
          callbacks: {
            label(context) {
              return `SAR ${Number(context.parsed.y || 0).toLocaleString("en-US")}.00`;
            },
          },
        },
      },
      scales: {
        x: {
          grid: {
            display: false,
            drawBorder: false,
          },
          border: {
            display: false,
          },
          ticks: {
            color: "#42536d",
            font: {
              size: 11,
              weight: 700,
            },
          },
        },
        y: {
          min: 0,
          max: 10000,
          ticks: {
            stepSize: 2000,
            color: revenueChartColors.tick,
            font: {
              size: 11,
              weight: 700,
            },
            callback(value) {
              return Number(value) === 0 ? "SAR 0" : `SAR ${Number(value) / 1000}K`;
            },
          },
          grid: {
            color: revenueChartColors.grid,
            drawTicks: false,
          },
          border: {
            display: false,
          },
        },
      },
    },
  });
}

function initRevenueLocationChart() {
  const canvas = document.querySelector("#revenue-location-chart");

  if (!canvas) return;

  if (revenueLocationChart) {
    revenueLocationChart.destroy();
  }

  revenueLocationChart = new Chart(canvas, {
    type: "doughnut",
    data: {
      labels: revenueLocationData.map((item) => item.label),
      datasets: [
        {
          data: revenueLocationData.map((item) => item.value),
          backgroundColor: [
            revenueChartColors.green,
            revenueChartColors.blue,
            revenueChartColors.purple,
            revenueChartColors.orange,
          ],
          borderColor: "#ffffff",
          borderWidth: 3,
          hoverOffset: 3,
        },
      ],
    },
    plugins: [revenueCenterTextPlugin],
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: "68%",
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label(context) {
              const item = revenueLocationData[context.dataIndex];
              return `${item.label}: ${item.value}% (${item.amount})`;
            },
          },
        },
        revenueCenterText: {
          lineHeight: 22,
          lines: [
            { text: "SAR", size: 12, weight: 750, color: "#65748b" },
            { text: "48,560.00", size: 19, weight: 900, color: "#05090d" },
          ],
        },
      },
    },
  });
}

function initRevenuePaymentChart() {
  const canvas = document.querySelector("#revenue-payment-chart");

  if (!canvas) return;

  if (revenuePaymentChart) {
    revenuePaymentChart.destroy();
  }

  revenuePaymentChart = new Chart(canvas, {
    type: "doughnut",
    data: {
      labels: paymentMethodData.map((item) => item.label),
      datasets: [
        {
          data: paymentMethodData.map((item) => item.value),
          backgroundColor: [
            revenueChartColors.green,
            revenueChartColors.blue,
            revenueChartColors.purple,
          ],
          borderColor: "#ffffff",
          borderWidth: 3,
          hoverOffset: 3,
        },
      ],
    },
    plugins: [revenueCenterTextPlugin],
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: "67%",
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label(context) {
              const item = paymentMethodData[context.dataIndex];
              return `${item.label}: ${item.value}% (${item.amount})`;
            },
          },
        },
        revenueCenterText: {
          lineHeight: 20,
          lines: [
            { text: "SAR", size: 11, weight: 750, color: "#65748b" },
            { text: "48,560.00", size: 17, weight: 900, color: "#05090d" },
            { text: "Total", size: 11, weight: 750, color: "#65748b" },
          ],
        },
      },
    },
  });
}

function getRevenueLineFill(context) {
  const { chart } = context;
  const { ctx, chartArea } = chart;

  if (!chartArea) {
    return "rgba(10, 155, 85, 0.12)";
  }

  const gradient = ctx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
  gradient.addColorStop(0, "rgba(10, 155, 85, 0.24)");
  gradient.addColorStop(1, "rgba(10, 155, 85, 0.02)");
  return gradient;
}

function escapeRevenueHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

window.loadRevenuePage = loadRevenuePage;
