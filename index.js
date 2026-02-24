/* global dscc */

const dscc = window.dscc;

const STATE = {
  months: [],
  currentIndex: 0
};

const root = document.getElementById("root");

function uniqBy(arr, keyFn) {
  const seen = new Set();
  return arr.filter(item => {
    const k = keyFn(item);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

function parseMonthStart(value) {
  // Month Start might arrive as a date string depending on transform.
  // Fallback: parse from Month Key if needed.
  // We’ll handle both.
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d;
}

function buildMonths(data) {
  // Use objectTransform so we can reference fields by config IDs
  const obj = dscc.objectTransform(data);

  const rows = obj.tables?.DEFAULT?.rows || [];
  if (!rows.length) return [];

  const months = rows.map(r => {
    const monthKey = r.date_nav?.month_key?.value ?? r.month_key?.value;
    const monthLabel = r.date_nav?.month_label?.value ?? r.month_label?.value;
    const monthStartRaw = r.date_nav?.month_start?.value ?? r.month_start?.value;

    let monthStart = parseMonthStart(monthStartRaw);

    // Fallback: build a date from Month Key "YYYY-MM"
    if (!monthStart && typeof monthKey === "string" && /^\d{4}-\d{2}$/.test(monthKey)) {
      monthStart = new Date(`${monthKey}-01T00:00:00`);
    }

    return { monthKey, monthLabel, monthStart };
  });

  // remove incomplete rows
  const cleaned = months.filter(m => m.monthKey && m.monthLabel);

  // unique by key
  const unique = uniqBy(cleaned, m => m.monthKey);

  // sort by Month Start if available, else Month Key lexicographically (works for YYYY-MM)
  unique.sort((a, b) => {
    if (a.monthStart && b.monthStart) return a.monthStart - b.monthStart;
    return String(a.monthKey).localeCompare(String(b.monthKey));
  });

  return unique;
}

function sendFilter(monthKey, monthKeyField) {
  const interactionId = "date_nav_filter";

  // FILTER interaction shape per interactions guide
  dscc.sendInteraction(interactionId, dscc.InteractionType.FILTER, {
    concepts: [monthKeyField],
    values: [[monthKey]]
  });
}

function render(month) {
  root.innerHTML = `
    <div class="nav">
      <button id="prev" class="btn" aria-label="Previous month">◀</button>
      <div class="label">${month?.monthLabel ?? "—"}</div>
      <button id="next" class="btn" aria-label="Next month">▶</button>
      <button id="reset" class="btn secondary" aria-label="Reset">Reset</button>
    </div>
  `;

  document.getElementById("prev").onclick = () => step(-1);
  document.getElementById("next").onclick = () => step(1);
  document.getElementById("reset").onclick = () => {
    dscc.clearInteraction("date_nav_filter");
  };
}

function step(delta) {
  if (!STATE.months.length) return;

  const nextIndex = Math.max(0, Math.min(STATE.months.length - 1, STATE.currentIndex + delta));
  STATE.currentIndex = nextIndex;

  const month = STATE.months[STATE.currentIndex];
  render(month);

  // Send filter using the configured Month Key field concept
  // In objectTransform, concepts are available via fieldsById
  // We’ll store it when we receive data.
  if (STATE.monthKeyConcept) {
    sendFilter(month.monthKey, STATE.monthKeyConcept);
  }
}

dscc.subscribeToData(
  data => {
    const obj = dscc.objectTransform(data);

    // Grab the Month Key concept (field definition) for interactions
    // fieldsById keys are your config element ids
    STATE.monthKeyConcept = obj.fieldsById?.month_key;

    STATE.months = buildMonths(data);

    // Default selection: current month if present, otherwise last available month
    const now = new Date();
    const nowKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const idx = STATE.months.findIndex(m => m.monthKey === nowKey);
    STATE.currentIndex = idx >= 0 ? idx : Math.max(STATE.months.length - 1, 0);

    render(STATE.months[STATE.currentIndex]);

    // Optional: apply initial filter immediately
    if (STATE.months.length && STATE.monthKeyConcept) {
      sendFilter(STATE.months[STATE.currentIndex].monthKey, STATE.monthKeyConcept);
    }
  },
  { transform: dscc.objectTransform }
);
