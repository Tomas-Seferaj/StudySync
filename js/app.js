// =======================================================
// app.js
// The main app: menus, views, the side panel for editing,
// classes, settings and ManageBac syncing.
//
// Sections:
//   1. State and saving
//   2. Classes
//   3. Assignments
//   4. ManageBac sync
//   5. Sidebar (left menu)
//   6. Views (Dashboard, Upcoming, Calendar, Completed, Class, Settings)
//   7. Assignment side panel (right drawer)
//   8. Class popup
//   9. Theme
//  10. Log in / sign up screen
//  11. Startup and keyboard shortcuts
// =======================================================


// =======================================================
// 1. State and saving
// =======================================================

let user = null;   // the logged-in account
let data = null;   // that account's assignments, classes and settings

const ui = {
  view: "dashboard",   // which page is showing
  className: null,     // for the class page
  search: "",
  month: null,         // first day of the month shown in the calendar
  editingId: null,     // assignment open in the side panel (null = new)
};

const AUTO_SYNC_INTERVAL = 30 * 60 * 1000;
const IMPORT_PAST_DAYS = 14;

function emptyData() {
  return {
    tasks: [],
    classes: [],
    sync: { feedUrl: "", proxyUrl: "", lastSync: null, lastError: "", hiddenUids: [] },
    prefs: { theme: "system" },
  };
}

function loadData(userId) {
  const saved = readJSON(`ht:data:${userId}`, {});
  const base = emptyData();
  return {
    tasks: saved.tasks || base.tasks,
    classes: saved.classes || base.classes,
    sync: Object.assign(base.sync, saved.sync),
    prefs: Object.assign(base.prefs, saved.prefs),
  };
}

function save() {
  if (user && data) writeJSON(`ht:data:${user.id}`, data);
}

// Assignments saved by the older version of this app (before accounts)
function moveOldDataInto(target) {
  const oldTasks = readJSON("homework-tracker-tasks", null);
  if (!oldTasks || !oldTasks.length) return false;
  target.tasks = oldTasks.map(t => Object.assign({ notes: "" }, t));
  Object.assign(target.sync, readJSON("homework-tracker-sync", {}));
  try {
    localStorage.removeItem("homework-tracker-tasks");
    localStorage.removeItem("homework-tracker-sync");
  } catch {}
  return true;
}


// =======================================================
// 2. Classes
// =======================================================

function findClass(name) {
  return data.classes.find(c => c.name.toLowerCase() === (name || "").toLowerCase());
}

// Make sure a class exists (used when importing or typing a new subject)
function ensureClass(name) {
  name = (name || "").trim();
  if (!name || findClass(name)) return;
  data.classes.push({ name, color: CLASS_COLORS[data.classes.length % CLASS_COLORS.length] });
}

function classColor(name) {
  const found = findClass(name);
  return found ? found.color : "var(--ink-faint)";
}

function openTasks() { return data.tasks.filter(t => !t.done); }


// =======================================================
// 3. Assignments
// =======================================================

function getTask(id) { return data.tasks.find(t => t.id === id); }

function toggleDone(id) {
  const task = getTask(id);
  if (!task) return;
  task.done = !task.done;
  task.doneAt = task.done ? new Date().toISOString() : null;
  save();
  renderAll();
  if (task.done) toast(`Finished "${task.title}"`, "success");
}

function deleteTask(id) {
  const task = getTask(id);
  if (!task || !confirm(`Delete "${task.title}"?`)) return false;
  // Remember deleted ManageBac items so they don't come back on the next sync
  if (task.source === "managebac" && task.uid) data.sync.hiddenUids.push(task.uid);
  data.tasks = data.tasks.filter(t => t.id !== id);
  save();
  renderAll();
  toast("Assignment deleted");
  return true;
}

function matchesSearch(task) {
  if (!ui.search) return true;
  const q = ui.search.toLowerCase();
  return [task.title, task.subject, task.notes].some(v => (v || "").toLowerCase().includes(q));
}

function sortByDue(a, b) {
  if (a.due !== b.due) return a.due < b.due ? -1 : 1;
  return Number(!!b.important) - Number(!!a.important);
}

function groupOf(task) {
  const d = daysUntil(task.due);
  if (d < 0) return "Overdue";
  if (d === 0) return "Today";
  if (d === 1) return "Tomorrow";
  if (d <= 7) return "This week";
  return "Later";
}


// =======================================================
// 4. ManageBac sync
// =======================================================

let syncing = false;

// Add new items, update changed ones, remove upcoming ones the teacher deleted.
// Your checkmarks and notes are never overwritten.
function mergeAssignments(items, { removeMissing }) {
  const seen = new Set();
  let added = 0, updated = 0, removed = 0;

  for (const item of items) {
    if (daysUntil(item.due) < -IMPORT_PAST_DAYS) continue;
    seen.add(item.uid);
    if (data.sync.hiddenUids.includes(item.uid)) continue;

    ensureClass(item.subject);
    const existing = data.tasks.find(t => t.source === "managebac" && t.uid === item.uid);
    if (existing) {
      if (existing.title !== item.title || existing.due !== item.due || existing.subject !== item.subject) {
        Object.assign(existing, { title: item.title, due: item.due, subject: item.subject });
        updated++;
      }
    } else {
      data.tasks.push({
        id: makeId(), title: item.title, subject: item.subject, due: item.due,
        notes: item.notes || "", important: false, done: false,
        source: "managebac", uid: item.uid,
      });
      added++;
    }
  }

  if (removeMissing && items.length) {
    const before = data.tasks.length;
    data.tasks = data.tasks.filter(t =>
      !(t.source === "managebac" && !t.done && !seen.has(t.uid) && daysUntil(t.due) >= 0));
    removed = before - data.tasks.length;
  }

  save();
  renderAll();
  return { added, updated, removed };
}

function describeResult({ added, updated, removed }) {
  const parts = [];
  if (added) parts.push(`${added} new`);
  if (updated) parts.push(`${updated} changed`);
  if (removed) parts.push(`${removed} removed`);
  return parts.length ? parts.join(", ") : "everything is up to date";
}

async function syncNow({ quiet = false } = {}) {
  if (!data || !data.sync.feedUrl || syncing) return;
  syncing = true;
  renderSyncChip();
  try {
    const text = await ManageBac.download(data.sync.feedUrl, data.sync.proxyUrl);
    const result = mergeAssignments(ManageBac.toAssignments(ManageBac.parse(text)), { removeMissing: true });
    data.sync.lastSync = new Date().toISOString();
    data.sync.lastError = "";
    save();
    if (!quiet || result.added) toast(`ManageBac synced: ${describeResult(result)}`, "success");
  } catch (error) {
    data.sync.lastError = error.message;
    save();
    if (!quiet) toast(error.message, "error");
  } finally {
    syncing = false;
    renderAll();
  }
}


// =======================================================
// 5. Sidebar (left menu)
// =======================================================

const NAV_ITEMS = [
  { view: "dashboard", label: "Dashboard", icon: "home" },
  { view: "upcoming", label: "Upcoming", icon: "list" },
  { view: "calendar", label: "Calendar", icon: "calendar" },
  { view: "completed", label: "Completed", icon: "check" },
];

function renderSidebar() {
  const open = openTasks();
  const overdue = open.filter(t => daysUntil(t.due) < 0).length;
  const counts = {
    dashboard: overdue ? { n: overdue, alert: true } : null,
    upcoming: open.length ? { n: open.length } : null,
  };

  const nav = document.getElementById("nav");
  nav.replaceChildren(...NAV_ITEMS.map(item => {
    const count = counts[item.view];
    return el("button", {
      className: "nav-item" + (ui.view === item.view ? " active" : ""),
      "aria-current": ui.view === item.view ? "page" : null,
      onclick: () => go(item.view),
    },
      icon(item.icon),
      el("span", { className: "nav-label" }, item.label),
      count && el("span", { className: "count" + (count.alert ? " count-alert" : ""), title: count.alert ? "Overdue" : null }, count.n),
    );
  }));

  const classList = document.getElementById("class-list");
  if (!data.classes.length) {
    classList.replaceChildren(el("li", { className: "side-empty" }, "Add your classes to color-code assignments."));
  } else {
    classList.replaceChildren(...data.classes.map(c => {
      const n = open.filter(t => (t.subject || "").toLowerCase() === c.name.toLowerCase()).length;
      const active = ui.view === "class" && ui.className === c.name;
      return el("li", {},
        el("button", {
          className: "class-item" + (active ? " active" : ""),
          onclick: () => go("class", c.name),
        },
          el("span", { className: "dot", style: { "--c": c.color } }),
          el("span", { className: "nav-label" }, c.name),
          n ? el("span", { className: "count" }, n) : null,
        ));
    }));
  }

  document.getElementById("user-avatar").textContent = initials(user.name);
  document.getElementById("user-name").textContent = user.name;
  document.getElementById("user-email").textContent = user.email;
  renderSyncChip();
}

function renderSyncChip() {
  const chip = document.getElementById("sync-chip");
  const s = data.sync;
  let state = "off", text = "Connect ManageBac";
  if (s.feedUrl) {
    if (syncing) { state = "busy"; text = "Syncing…"; }
    else if (s.lastError) { state = "error"; text = "Sync problem"; }
    else if (s.lastSync) {
      state = "ok";
      text = "Synced " + new Date(s.lastSync).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
    } else { state = "ok"; text = "ManageBac connected"; }
  }
  chip.className = `sync-chip sync-${state}`;
  chip.replaceChildren(icon("refresh", 16), el("span", {}, text));
  chip.onclick = () => go("settings");
}

function openSidebar() { document.body.classList.add("sidebar-open"); }
function closeSidebar() { document.body.classList.remove("sidebar-open"); }

function go(view, className = null) {
  ui.view = view;
  ui.className = className;
  if (view === "calendar" && !ui.month) ui.month = startOfMonth(todayString());
  closeSidebar();
  renderAll();
  document.getElementById("view").scrollTop = 0;
  window.scrollTo(0, 0);
}


// =======================================================
// 6. Views
// =======================================================

function renderAll() {
  if (!user) return;
  renderSidebar();
  renderView();
}

function renderView() {
  const view = document.getElementById("view");
  const title = document.getElementById("page-title");
  const pages = {
    dashboard: ["Dashboard", viewDashboard],
    upcoming: ["Upcoming", viewUpcoming],
    calendar: ["Calendar", viewCalendar],
    completed: ["Completed", viewCompleted],
    class: [ui.className, viewClass],
    settings: ["Settings", viewSettings],
  };
  const [name, build] = pages[ui.view] || pages.dashboard;
  title.textContent = name;
  document.title = `${name} · Homework`;
  view.replaceChildren(build());
}

// ----- One assignment row -----
function taskRow(task) {
  const overdue = !task.done && daysUntil(task.due) < 0;
  const row = el("li", {
    className: "task" + (task.done ? " done" : "") + (overdue ? " overdue" : ""),
    style: { "--c": classColor(task.subject) },
  },
    el("button", {
      className: "tick",
      "aria-label": task.done ? `Mark "${task.title}" as not finished` : `Mark "${task.title}" as finished`,
      "aria-pressed": task.done ? "true" : "false",
      onclick: event => { event.stopPropagation(); toggleDone(task.id); },
    }, icon("check", 22)),
    el("button", { className: "task-main", onclick: () => openDrawer(task.id) },
      el("span", { className: "task-title" },
        task.title,
        task.important ? el("span", { className: "star", title: "Important" }, icon("star", 14)) : null,
      ),
      el("span", { className: "task-meta" },
        task.subject ? el("span", { className: "pill" }, el("span", { className: "dot" }), task.subject) : null,
        el("span", { className: "when" }, task.done ? formatDate(task.due) : describeDue(task.due)),
        task.notes ? el("span", { className: "has-notes" }, "Notes") : null,
        task.source === "managebac" ? el("span", { className: "tag" }, "ManageBac") : null,
      ),
    ),
  );
  return row;
}

function groupedList(tasks) {
  const order = ["Overdue", "Today", "Tomorrow", "This week", "Later"];
  const groups = {};
  tasks.slice().sort(sortByDue).forEach(t => (groups[groupOf(t)] ||= []).push(t));
  return el("div", { className: "groups" },
    order.filter(name => groups[name]).map(name =>
      el("section", { className: "group" + (name === "Overdue" ? " group-overdue" : "") },
        el("h3", { className: "group-title" }, el("span", { className: "marker" }, name), el("small", {}, groups[name].length)),
        el("ul", { className: "task-list" }, groups[name].map(taskRow)),
      )));
}

function emptyState(title, text, action) {
  return el("div", { className: "empty" },
    el("div", { className: "empty-art" }, icon("book", 32)),
    el("h3", {}, title),
    el("p", {}, text),
    action || null,
  );
}

function newButton(label = "New assignment", preset = {}) {
  return el("button", { className: "btn btn-primary", onclick: () => openDrawer(null, preset) }, icon("plus"), label);
}

// ----- Dashboard -----
function viewDashboard() {
  const open = openTasks();
  const today = todayString();
  const overdue = open.filter(t => daysUntil(t.due) < 0);
  const dueToday = open.filter(t => t.due === today);
  const week = open.filter(t => { const d = daysUntil(t.due); return d >= 0 && d <= 7; });
  const doneWeek = data.tasks.filter(t => t.done && t.doneAt && Date.now() - new Date(t.doneAt) < 7 * 86400000);

  // Headline sentence
  let headline;
  if (!data.tasks.length) headline = "Let's get your first assignment in.";
  else if (overdue.length) headline = `${overdue.length} overdue. Let's sort ${overdue.length === 1 ? "it" : "them"} out first.`;
  else if (dueToday.length) headline = `${dueToday.length} due today. You've got this.`;
  else if (week.length) headline = `Nothing due today. ${week.length} coming up this week.`;
  else headline = "You're all caught up.";

  // The week strip
  const days = Array.from({ length: 7 }, (_, i) => addDays(today, i));
  const strip = el("div", { className: "week" }, days.map((date, i) => {
    const items = open.filter(t => t.due === date);
    return el("button", {
      className: "day" + (i === 0 ? " day-today" : "") + (items.length ? " day-busy" : ""),
      onclick: () => { ui.month = startOfMonth(date); go("calendar"); },
      "aria-label": `${formatDate(date, { weekday: "long", month: "long", day: "numeric" })}: ${items.length} due`,
    },
      el("span", { className: "day-name" }, i === 0 ? "Today" : formatDate(date, { weekday: "short" })),
      el("span", { className: "day-num" }, new Date(date + "T00:00:00").getDate()),
      el("span", { className: "day-dots" }, items.slice(0, 4).map(t => el("span", { className: "dot", style: { "--c": classColor(t.subject) } }))),
      el("span", { className: "day-count" }, items.length ? `${items.length} due` : "Free"),
    );
  }));

  const stat = (label, value, tone) => el("div", { className: "stat" + (tone ? ` stat-${tone}` : "") },
    el("span", { className: "stat-value" }, value), el("span", { className: "stat-label" }, label));

  const upcoming = open.filter(t => daysUntil(t.due) <= 7).filter(matchesSearch);

  return el("div", { className: "page" },
    el("section", { className: "hello" },
      el("p", { className: "hello-date" }, formatDate(today, { weekday: "long", month: "long", day: "numeric" })),
      el("h2", { className: "hello-title" }, `${greeting()}, ${user.name.split(" ")[0]}.`),
      el("p", { className: "hello-sub" }, headline),
    ),
    strip,
    el("div", { className: "stats" },
      stat("Overdue", overdue.length, overdue.length ? "alert" : null),
      stat("Due today", dueToday.length),
      stat("Next 7 days", week.length),
      stat("Finished this week", doneWeek.length, "good"),
    ),
    el("div", { className: "section-head" },
      el("h2", {}, "Next up"),
      open.length > upcoming.length ? el("button", { className: "link-btn", onclick: () => go("upcoming") }, "See everything", icon("right", 16)) : null,
    ),
    upcoming.length
      ? groupedList(upcoming)
      : emptyState(
          ui.search ? "No matches" : data.tasks.length ? "Nothing in the next 7 days" : "No assignments yet",
          ui.search ? "Try a different search." : data.tasks.length ? "Enjoy it, or get ahead on something later." : "Add one yourself, or connect ManageBac to bring them in automatically.",
          data.tasks.length || ui.search ? null : el("div", { className: "empty-actions" },
            newButton(),
            el("button", { className: "btn btn-ghost", onclick: () => go("settings") }, "Connect ManageBac"))),
  );
}

// ----- Upcoming -----
function viewUpcoming() {
  const tasks = openTasks().filter(matchesSearch);
  return el("div", { className: "page" },
    tasks.length ? groupedList(tasks)
      : emptyState(ui.search ? "No matches" : "Nothing to do", ui.search ? "Try a different search." : "Every assignment is finished. Nice work!", ui.search ? null : newButton()));
}

// ----- Completed -----
function viewCompleted() {
  const tasks = data.tasks.filter(t => t.done).filter(matchesSearch)
    .sort((a, b) => (b.doneAt || b.due).localeCompare(a.doneAt || a.due));
  return el("div", { className: "page" },
    tasks.length ? el("div", {},
      el("div", { className: "section-head" },
        el("h2", {}, `${tasks.length} finished`),
        el("button", {
          className: "btn btn-ghost", onclick: () => {
            if (!confirm("Remove all finished assignments?")) return;
            data.tasks.filter(t => t.done && t.source === "managebac").forEach(t => data.sync.hiddenUids.push(t.uid));
            data.tasks = data.tasks.filter(t => !t.done);
            save(); renderAll(); toast("Cleared finished assignments");
          },
        }, icon("trash", 16), "Clear all")),
      el("ul", { className: "task-list" }, tasks.map(taskRow)))
      : emptyState("Nothing finished yet", "Tick off an assignment and it shows up here."));
}

// ----- Class page -----
function viewClass() {
  const cls = findClass(ui.className);
  if (!cls) { ui.view = "dashboard"; return viewDashboard(); }
  const inClass = data.tasks.filter(t => (t.subject || "").toLowerCase() === cls.name.toLowerCase()).filter(matchesSearch);
  const open = inClass.filter(t => !t.done);
  const done = inClass.filter(t => t.done);

  return el("div", { className: "page" },
    el("div", { className: "class-banner", style: { "--c": cls.color } },
      el("div", {},
        el("p", { className: "class-banner-label" }, "Class"),
        el("h2", {}, cls.name),
        el("p", {}, `${open.length} to do, ${done.length} finished`)),
      el("div", { className: "class-banner-actions" },
        el("button", { className: "btn btn-ghost", onclick: () => openClassDialog(cls.name) }, icon("pencil", 16), "Edit class"),
        newButton("Add to " + cls.name, { subject: cls.name })),
    ),
    open.length ? groupedList(open) : emptyState("Nothing to do in this class", "Add an assignment to get started."),
    done.length ? el("details", { className: "done-block" },
      el("summary", {}, `Finished (${done.length})`),
      el("ul", { className: "task-list" }, done.sort(sortByDue).map(taskRow))) : null,
  );
}

// ----- Calendar -----
function startOfMonth(dateString) { return dateString.slice(0, 8) + "01"; }

function viewCalendar() {
  if (!ui.month) ui.month = startOfMonth(todayString());
  const first = new Date(ui.month + "T00:00:00");
  const offset = (first.getDay() + 6) % 7;          // weeks start on Monday
  const gridStart = addDays(ui.month, -offset);
  const today = todayString();
  const monthIndex = first.getMonth();

  const shiftMonth = n => {
    const d = new Date(first);
    d.setMonth(d.getMonth() + n);
    ui.month = toDateString(d);
    renderView();
  };

  const weekdayNames = Array.from({ length: 7 }, (_, i) => formatDate(addDays(gridStart, i), { weekday: "short" }));

  const cells = Array.from({ length: 42 }, (_, i) => {
    const date = addDays(gridStart, i);
    const d = new Date(date + "T00:00:00");
    const items = data.tasks.filter(t => t.due === date).filter(matchesSearch).sort(sortByDue);
    return el("div", {
      className: "cell" + (d.getMonth() !== monthIndex ? " cell-out" : "") + (date === today ? " cell-today" : ""),
      onclick: () => openDrawer(null, { due: date }),
      title: "Add an assignment on this day",
    },
      el("span", { className: "cell-num" }, d.getDate()),
      el("div", { className: "chips" },
        items.slice(0, 3).map(t => el("button", {
          className: "chip" + (t.done ? " chip-done" : ""),
          style: { "--c": classColor(t.subject) },
          onclick: e => { e.stopPropagation(); openDrawer(t.id); },
          title: t.title,
        }, t.title)),
        items.length > 3 ? el("span", { className: "more" }, `+${items.length - 3} more`) : null,
      ),
    );
  });

  return el("div", { className: "page" },
    el("div", { className: "cal-head" },
      el("h2", {}, first.toLocaleDateString(undefined, { month: "long", year: "numeric" })),
      el("div", { className: "cal-nav" },
        el("button", { className: "icon-btn", "aria-label": "Previous month", onclick: () => shiftMonth(-1) }, icon("left")),
        el("button", { className: "btn btn-ghost", onclick: () => { ui.month = startOfMonth(today); renderView(); } }, "Today"),
        el("button", { className: "icon-btn", "aria-label": "Next month", onclick: () => shiftMonth(1) }, icon("right")),
      ),
    ),
    el("div", { className: "cal" },
      el("div", { className: "cal-weekdays" }, weekdayNames.map(n => el("span", {}, n))),
      el("div", { className: "cal-grid" }, cells),
    ),
  );
}

// ----- Settings -----
function viewSettings() {
  const s = data.sync;

  // Profile
  const nameInput = el("input", { id: "set-name", type: "text", maxlength: "40", value: user.name });
  const profile = panel("Profile", "How you appear in the app.",
    el("div", { className: "field" }, el("label", { for: "set-name" }, "Name"), nameInput),
    el("div", { className: "field" }, el("label", {}, "Email"), el("input", { type: "email", value: user.email, disabled: true })),
    el("div", { className: "panel-actions" },
      el("button", {
        className: "btn btn-primary", onclick: () => {
          if (!nameInput.value.trim()) return toast("Enter a name.", "error");
          user = Auth.updateName(user.id, nameInput.value);
          renderAll(); toast("Profile saved", "success");
        },
      }, "Save profile")));

  // Appearance
  const themes = [["system", "Match device"], ["light", "Light"], ["dark", "Dark"]];
  const appearance = panel("Appearance", "Choose light or dark mode.",
    el("div", { className: "segmented", role: "radiogroup", "aria-label": "Theme" },
      themes.map(([value, label]) => el("button", {
        role: "radio",
        "aria-checked": data.prefs.theme === value ? "true" : "false",
        className: data.prefs.theme === value ? "active" : "",
        onclick: () => { data.prefs.theme = value; save(); applyTheme(); renderView(); },
      }, label))));

  // ManageBac
  const feed = el("input", { id: "set-feed", type: "password", value: s.feedUrl, placeholder: "webcal://yourschool.managebac.com/…", spellcheck: "false", autocomplete: "off" });
  const proxy = el("input", { id: "set-proxy", type: "url", value: s.proxyUrl, placeholder: "https://homework-sync.yourname.workers.dev", spellcheck: "false" });
  const fileInput = el("input", { type: "file", accept: ".ics,text/calendar", id: "set-file" });
  fileInput.addEventListener("change", async () => {
    const file = fileInput.files[0];
    if (!file) return;
    const text = await file.text();
    if (!text.includes("BEGIN:VCALENDAR")) return toast("That file isn't a calendar (.ics) file.", "error");
    const result = mergeAssignments(ManageBac.toAssignments(ManageBac.parse(text)), { removeMissing: false });
    toast(`Imported: ${describeResult(result)}`, "success");
  });

  let statusText = "Not connected.";
  if (s.feedUrl) {
    statusText = s.lastError ? s.lastError
      : s.lastSync ? `Last synced ${new Date(s.lastSync).toLocaleString(undefined, { weekday: "short", hour: "2-digit", minute: "2-digit" })}. Syncs automatically when you open the app.`
      : "Connected. Waiting for the first sync.";
  }

  const managebac = panel("ManageBac sync", "Paste your calendar link once and new assignments appear by themselves.",
    el("p", { className: "status-line" + (s.lastError ? " status-error" : s.lastSync ? " status-ok" : "") }, statusText),
    el("div", { className: "field" },
      el("label", { for: "set-feed" }, "ManageBac calendar link"), feed,
      el("small", { className: "hint" }, "In ManageBac: My Workspace, View Full Calendar, Subscribe to Calendar. Keep this link private.")),
    el("div", { className: "field" },
      el("label", { for: "set-proxy" }, "Sync server link (optional)"), proxy,
      el("small", { className: "hint" }, "Only needed if syncing fails without it. See SYNC-SETUP.md.")),
    el("div", { className: "panel-actions" },
      el("button", {
        className: "btn btn-primary", disabled: syncing, onclick: () => {
          if (!feed.value.trim()) return toast("Paste your ManageBac calendar link first.", "error");
          s.feedUrl = feed.value.trim();
          s.proxyUrl = proxy.value.trim();
          s.lastError = "";
          save();
          syncNow();
        },
      }, icon("link", 16), "Save and sync"),
      s.feedUrl ? el("button", { className: "btn btn-ghost", disabled: syncing, onclick: () => syncNow() }, icon("refresh", 16), "Sync now") : null,
      s.feedUrl ? el("button", {
        className: "btn btn-danger-ghost", onclick: () => {
          if (!confirm("Disconnect ManageBac? Imported assignments stay in your list.")) return;
          Object.assign(s, { feedUrl: "", proxyUrl: "", lastSync: null, lastError: "", hiddenUids: [] });
          save(); renderAll(); toast("ManageBac disconnected");
        },
      }, "Disconnect") : null,
    ),
    el("div", { className: "file-import" }, el("label", { for: "set-file" }, "Or import a calendar file (.ics) once"), fileInput));

  // Data and account
  const account = panel("Your data", "Download a backup, or remove your account from this device.",
    el("div", { className: "panel-actions" },
      el("button", {
        className: "btn btn-ghost", onclick: () => {
          const blob = new Blob([JSON.stringify({ classes: data.classes, tasks: data.tasks }, null, 2)], { type: "application/json" });
          const a = el("a", { href: URL.createObjectURL(blob), download: "homework-backup.json" });
          document.body.appendChild(a); a.click(); a.remove();
          setTimeout(() => URL.revokeObjectURL(a.href), 1000);
        },
      }, icon("download", 16), "Download backup"),
      el("button", { className: "btn btn-ghost", onclick: logOut }, icon("logout", 16), "Log out"),
      el("button", {
        className: "btn btn-danger-ghost", onclick: () => {
          if (!confirm("Delete your account and all your assignments from this device? This can't be undone.")) return;
          Auth.deleteAccount(user.id);
          user = null; data = null;
          showAuth();
          toast("Account deleted");
        },
      }, icon("trash", 16), "Delete account")));

  return el("div", { className: "page settings" }, profile, appearance, managebac, account);
}

function panel(title, description, ...content) {
  return el("section", { className: "panel" },
    el("header", { className: "panel-head" }, el("h2", {}, title), el("p", {}, description)),
    el("div", { className: "panel-body" }, content));
}


// =======================================================
// 7. Assignment side panel (right drawer)
// =======================================================

const drawer = document.getElementById("drawer");
const taskForm = document.getElementById("task-form");
const f = {
  title: document.getElementById("task-title"),
  cls: document.getElementById("task-class"),
  due: document.getElementById("task-due"),
  important: document.getElementById("task-important"),
  notes: document.getElementById("task-notes"),
  error: document.getElementById("task-error"),
  sourceNote: document.getElementById("task-source-note"),
  del: document.getElementById("task-delete"),
  heading: document.getElementById("drawer-title"),
};
let lastFocus = null;

function fillClassSelect(selected) {
  f.cls.replaceChildren(
    el("option", { value: "" }, "No class"),
    ...data.classes.map(c => el("option", { value: c.name }, c.name)));
  f.cls.value = findClass(selected) ? findClass(selected).name : "";
}

function openDrawer(taskId = null, preset = {}) {
  const task = taskId ? getTask(taskId) : null;
  ui.editingId = task ? task.id : null;
  lastFocus = document.activeElement;

  f.heading.textContent = task ? "Edit assignment" : "New assignment";
  f.title.value = task ? task.title : "";
  fillClassSelect(task ? task.subject : preset.subject || (ui.view === "class" ? ui.className : ""));
  f.due.value = task ? task.due : preset.due || todayString();
  f.important.checked = task ? !!task.important : false;
  f.notes.value = task ? task.notes || "" : "";
  f.error.textContent = "";
  f.sourceNote.hidden = !(task && task.source === "managebac");
  f.del.hidden = !task;

  drawer.hidden = false;
  requestAnimationFrame(() => document.body.classList.add("drawer-open"));
  setTimeout(() => f.title.focus(), 50);
}

function closeDrawer() {
  document.body.classList.remove("drawer-open");
  setTimeout(() => { if (!document.body.classList.contains("drawer-open")) drawer.hidden = true; }, 250);
  ui.editingId = null;
  if (lastFocus && document.contains(lastFocus)) lastFocus.focus();
}

taskForm.addEventListener("submit", event => {
  event.preventDefault();
  const title = f.title.value.trim();
  if (!title) { f.error.textContent = "Give the assignment a title."; f.title.focus(); return; }
  if (!f.due.value) { f.error.textContent = "Pick a due date."; f.due.focus(); return; }

  const values = {
    title, subject: f.cls.value, due: f.due.value,
    important: f.important.checked, notes: f.notes.value.trim(),
  };

  if (ui.editingId) {
    Object.assign(getTask(ui.editingId), values);
    toast("Changes saved", "success");
  } else {
    data.tasks.push({ id: makeId(), ...values, done: false });
    toast("Assignment added", "success");
  }
  save();
  closeDrawer();
  renderAll();
});

f.del.addEventListener("click", () => {
  if (ui.editingId && deleteTask(ui.editingId)) closeDrawer();
});

document.querySelectorAll("[data-close-drawer]").forEach(b => b.addEventListener("click", closeDrawer));
document.getElementById("drawer-backdrop").addEventListener("click", closeDrawer);

document.getElementById("quick-dates").addEventListener("click", event => {
  const button = event.target.closest("button[data-days]");
  if (button) f.due.value = addDays(todayString(), Number(button.dataset.days));
});

document.getElementById("task-new-class").addEventListener("click", () => openClassDialog(null, name => fillClassSelect(name)));


// =======================================================
// 8. Class popup
// =======================================================

const classDialog = document.getElementById("class-dialog");
const classForm = document.getElementById("class-form");
const className = document.getElementById("class-name");
const classError = document.getElementById("class-error");
const classDelete = document.getElementById("class-delete");
let editingClass = null;
let afterClassSave = null;
let pickedColor = CLASS_COLORS[0];

function renderSwatches() {
  const box = document.getElementById("class-swatches");
  box.querySelectorAll(".swatch").forEach(s => s.remove());
  CLASS_COLORS.forEach((color, i) => {
    box.appendChild(el("label", { className: "swatch", style: { "--c": color } },
      el("input", {
        type: "radio", name: "class-color", value: color, checked: color === pickedColor,
        "aria-label": `Color ${i + 1}`, onchange: () => { pickedColor = color; },
      }),
      el("span", {})));
  });
}

function openClassDialog(name = null, onSaved = null) {
  editingClass = name ? findClass(name) : null;
  afterClassSave = onSaved;
  document.getElementById("class-dialog-title").textContent = editingClass ? "Edit class" : "New class";
  className.value = editingClass ? editingClass.name : "";
  pickedColor = editingClass ? editingClass.color : CLASS_COLORS[data.classes.length % CLASS_COLORS.length];
  classError.textContent = "";
  classDelete.hidden = !editingClass;
  renderSwatches();
  classDialog.showModal();
  className.focus();
}

classForm.addEventListener("submit", event => {
  event.preventDefault();
  const name = className.value.trim();
  if (!name) { classError.textContent = "Give the class a name."; return; }
  const clash = findClass(name);
  if (clash && clash !== editingClass) { classError.textContent = "You already have a class with that name."; return; }

  if (editingClass) {
    const oldName = editingClass.name;
    data.tasks.forEach(t => { if ((t.subject || "").toLowerCase() === oldName.toLowerCase()) t.subject = name; });
    editingClass.name = name;
    editingClass.color = pickedColor;
    if (ui.view === "class") ui.className = name;
  } else {
    data.classes.push({ name, color: pickedColor });
  }
  save();
  classDialog.close();
  renderAll();
  if (afterClassSave) afterClassSave(name);
  toast(editingClass ? "Class updated" : `Added ${name}`, "success");
});

classDelete.addEventListener("click", () => {
  if (!editingClass) return;
  if (!confirm(`Delete the class "${editingClass.name}"? Its assignments stay, without a class.`)) return;
  const old = editingClass.name.toLowerCase();
  data.tasks.forEach(t => { if ((t.subject || "").toLowerCase() === old) t.subject = ""; });
  data.classes = data.classes.filter(c => c !== editingClass);
  save();
  classDialog.close();
  go("dashboard");
  toast("Class deleted");
});

document.getElementById("class-cancel").addEventListener("click", () => classDialog.close());
document.getElementById("add-class").addEventListener("click", () => openClassDialog());


// =======================================================
// 9. Theme
// =======================================================

function applyTheme() {
  const theme = data ? data.prefs.theme : "system";
  if (theme === "system") document.documentElement.removeAttribute("data-theme");
  else document.documentElement.setAttribute("data-theme", theme);
}


// =======================================================
// 10. Log in / sign up screen
// =======================================================

const authScreen = document.getElementById("auth");
const appScreen = document.getElementById("app");
const loginForm = document.getElementById("login-form");
const signupForm = document.getElementById("signup-form");
const tabLogin = document.getElementById("tab-login");
const tabSignup = document.getElementById("tab-signup");

function showTab(which) {
  const isLogin = which === "login";
  tabLogin.setAttribute("aria-selected", String(isLogin));
  tabSignup.setAttribute("aria-selected", String(!isLogin));
  loginForm.hidden = !isLogin;
  signupForm.hidden = isLogin;
  (isLogin ? document.getElementById("login-email") : document.getElementById("signup-name")).focus();
}

tabLogin.addEventListener("click", () => showTab("login"));
tabSignup.addEventListener("click", () => showTab("signup"));

async function withBusy(form, work) {
  const button = form.querySelector("button[type=submit]");
  const error = form.querySelector(".form-error");
  button.disabled = true;
  error.textContent = "";
  try { await work(); }
  catch (e) { error.textContent = e.message; }
  finally { button.disabled = false; }
}

loginForm.addEventListener("submit", event => {
  event.preventDefault();
  withBusy(loginForm, async () => {
    const account = await Auth.logIn({
      email: document.getElementById("login-email").value,
      password: document.getElementById("login-password").value,
      remember: document.getElementById("login-remember").checked,
    });
    loginForm.reset();
    enterApp(account);
  });
});

signupForm.addEventListener("submit", event => {
  event.preventDefault();
  withBusy(signupForm, async () => {
    const account = await Auth.signUp({
      name: document.getElementById("signup-name").value,
      email: document.getElementById("signup-email").value,
      password: document.getElementById("signup-password").value,
      confirm: document.getElementById("signup-confirm").value,
    });
    // Bring over assignments from the old version of the app, if any
    const fresh = emptyData();
    const moved = moveOldDataInto(fresh);
    fresh.tasks.forEach(t => {
      if (!t.subject) return;
      if (!fresh.classes.some(c => c.name.toLowerCase() === t.subject.toLowerCase())) {
        fresh.classes.push({ name: t.subject, color: CLASS_COLORS[fresh.classes.length % CLASS_COLORS.length] });
      }
    });
    writeJSON(`ht:data:${account.id}`, fresh);
    signupForm.reset();
    enterApp(account);
    toast(moved ? "Account created. Your existing assignments were moved in." : `Welcome, ${account.name.split(" ")[0]}!`, "success");
  });
});

function showAuth() {
  document.documentElement.removeAttribute("data-theme");
  closeDrawer();
  appScreen.hidden = true;
  authScreen.hidden = false;
  // First time on this device? Show sign up. Otherwise log in.
  showTab(Auth.hasAccounts() ? "login" : "signup");
}

function enterApp(account) {
  user = account;
  data = loadData(user.id);
  ui.view = "dashboard";
  ui.search = "";
  document.getElementById("search").value = "";
  applyTheme();
  authScreen.hidden = true;
  appScreen.hidden = false;
  renderAll();
  syncNow({ quiet: true });
}

function logOut() {
  Auth.logOut();
  user = null;
  data = null;
  showAuth();
  toast("Logged out");
}


// =======================================================
// 11. Startup and keyboard shortcuts
// =======================================================

// Topbar and sidebar buttons
document.getElementById("sidebar-new").addEventListener("click", () => { closeSidebar(); openDrawer(); });
document.getElementById("top-new").addEventListener("click", () => openDrawer());
document.getElementById("menu-btn").addEventListener("click", openSidebar);
document.getElementById("sidebar-backdrop").addEventListener("click", closeSidebar);

document.getElementById("search").addEventListener("input", event => {
  ui.search = event.target.value.trim();
  if (ui.view === "settings") ui.view = "upcoming";
  renderView();
});

// User menu (bottom of the sidebar)
const userMenu = document.getElementById("user-menu");
const userMenuBtn = document.getElementById("user-menu-btn");

function toggleUserMenu(force) {
  const open = force ?? userMenu.hidden;
  userMenu.hidden = !open;
  userMenuBtn.setAttribute("aria-expanded", String(open));
  if (open) userMenu.querySelector("button").focus();
}

userMenuBtn.addEventListener("click", event => { event.stopPropagation(); toggleUserMenu(); });
userMenu.addEventListener("click", event => {
  const action = event.target.closest("button")?.dataset.action;
  toggleUserMenu(false);
  if (action === "settings") go("settings");
  if (action === "logout") logOut();
});
document.addEventListener("click", event => {
  if (!userMenu.hidden && !userMenu.contains(event.target)) toggleUserMenu(false);
});

// Keyboard: Esc closes things, N adds an assignment, / jumps to search
document.addEventListener("keydown", event => {
  if (event.key === "Escape") {
    if (!userMenu.hidden) return toggleUserMenu(false);
    if (document.body.classList.contains("drawer-open")) return closeDrawer();
    if (document.body.classList.contains("sidebar-open")) return closeSidebar();
  }
  const typing = /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName) || classDialog.open;
  if (typing || !user || event.ctrlKey || event.metaKey || event.altKey) return;
  if (event.key === "n" || event.key === "N") { event.preventDefault(); openDrawer(); }
  if (event.key === "/") { event.preventDefault(); document.getElementById("search").focus(); }
});

// Sync again when you come back to the tab after a while
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState !== "visible" || !data || !data.sync.lastSync) return;
  if (Date.now() - new Date(data.sync.lastSync).getTime() > AUTO_SYNC_INTERVAL) syncNow({ quiet: true });
});
setInterval(() => syncNow({ quiet: true }), AUTO_SYNC_INTERVAL);

// Redraw at midnight so "today" stays correct
let lastDay = todayString();
setInterval(() => { if (todayString() !== lastDay) { lastDay = todayString(); renderAll(); } }, 60000);

// Go! Remove the loading message, then show the right screen
document.getElementById("boot")?.remove();
fillIcons();
const existing = Auth.currentUser();
if (existing) enterApp(existing);
else showAuth();
