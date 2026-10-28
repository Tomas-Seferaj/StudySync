// =======================================================
// helpers.js
// Small tools used everywhere: building elements, icons,
// dates, colors and pop-up messages (toasts).
// =======================================================

// ----- Build an element in one line -----
// el("button", { className: "btn", onclick: fn }, "Click me")
function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value === undefined || value === null || value === false) continue;
    if (key === "className") node.className = value;
    else if (key === "dataset") Object.assign(node.dataset, value);
    else if (key === "style" && typeof value === "object") {
      for (const [prop, v] of Object.entries(value)) node.style.setProperty(prop, v);
    }
    else if (key.startsWith("on")) node.addEventListener(key.slice(2), value);
    else if (value === true) node.setAttribute(key, "");
    else node.setAttribute(key, value);
  }
  for (const child of children.flat()) {
    if (child === null || child === undefined || child === false) continue;
    // Strings become text (never HTML), which keeps user input safe
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

// ----- Icons (simple line drawings) -----
const ICON_PATHS = {
  book: '<path d="M5 4.5A1.5 1.5 0 0 1 6.5 3H19v15H6.5A1.5 1.5 0 0 0 5 19.5z"/><path d="M5 19.5A1.5 1.5 0 0 0 6.5 21H19"/><path d="m9 9.5 2 2 4-4"/>',
  home: '<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
  list: '<path d="M9 6h12M9 12h12M9 18h12"/><path d="M4 6h.01M4 12h.01M4 18h.01" stroke-width="3"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/>',
  check: '<circle cx="12" cy="12" r="9"/><path d="m8.5 12 2.5 2.5 4.5-5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  sliders: '<path d="M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1"/><circle cx="15" cy="6" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="17" cy="18" r="2"/>',
  logout: '<path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3"/><path d="m10 16-4-4 4-4M6 12h10"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  refresh: '<path d="M20 11a8 8 0 0 0-14.9-3.9M4 4v4h4"/><path d="M4 13a8 8 0 0 0 14.9 3.9M20 20v-4h-4"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  star: '<path d="M12 3.5 14.6 9l5.9.7-4.4 4 1.2 5.8L12 16.6l-5.3 2.9 1.2-5.8-4.4-4L9.4 9z"/>',
  left: '<path d="m15 6-6 6 6 6"/>',
  right: '<path d="m9 6 6 6-6 6"/>',
  more: '<path d="M12 6h.01M12 12h.01M12 18h.01" stroke-width="3"/>',
  pencil: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m13.5 6.5 4 4"/>',
  download: '<path d="M12 4v11M8 11l4 4 4-4M5 20h14"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
};

function icon(name, size = 18) {
  const wrap = document.createElement("span");
  wrap.className = "icon";
  wrap.innerHTML =
    `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" ` +
    `stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON_PATHS[name] || ""}</svg>`;
  return wrap;
}

// Fill every <span data-icon="..."> in the HTML with its icon
function fillIcons(root = document) {
  root.querySelectorAll("[data-icon]").forEach(spot => {
    if (spot.dataset.filled) return;
    spot.replaceWith(icon(spot.dataset.icon));
  });
}

// ----- Colors for classes -----
const CLASS_COLORS = ["#3b5bdb", "#e0662f", "#1f9d6a", "#9b4dca", "#d63d6b", "#1c9bb5", "#c99a00", "#5c6b8a"];

// ----- Dates -----
function toDateString(date) {
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${m}-${d}`;
}

function todayString() { return toDateString(new Date()); }

function addDays(dateString, days) {
  const d = new Date(dateString + "T00:00:00");
  d.setDate(d.getDate() + days);
  return toDateString(d);
}

// Days from today until the date (negative = in the past)
function daysUntil(dateString) {
  const today = new Date(todayString() + "T00:00:00");
  const due = new Date(dateString + "T00:00:00");
  return Math.round((due - today) / 86400000);
}

function describeDue(dateString) {
  const days = daysUntil(dateString);
  if (days < -1) return `${-days} days late`;
  if (days === -1) return "1 day late";
  if (days === 0) return "Due today";
  if (days === 1) return "Due tomorrow";
  if (days < 7) return `Due ${formatDate(dateString, { weekday: "long" })}`;
  return `Due in ${days} days`;
}

function formatDate(dateString, options = { weekday: "short", month: "short", day: "numeric" }) {
  return new Date(dateString + "T00:00:00").toLocaleDateString(undefined, options);
}

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

function makeId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function initials(name) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map(p => p[0].toUpperCase()).join("") || "?";
}

// ----- Pop-up messages in the corner -----
function toast(message, type = "info") {
  const box = document.getElementById("toasts");
  const item = el("div", { className: `toast toast-${type}`, role: "status" }, message);
  box.appendChild(item);
  setTimeout(() => item.classList.add("leaving"), 3200);
  setTimeout(() => item.remove(), 3600);
}

// ----- Safe localStorage -----
function readJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function writeJSON(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (error) {
    console.error("Could not save", key, error);
    return false;
  }
}
