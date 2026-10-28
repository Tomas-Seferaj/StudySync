// =======================================================
// managebac.js
// Reads your ManageBac calendar (iCal / .ics format).
//
// An .ics file is plain text that looks like this:
//
//   BEGIN:VEVENT
//   UID:12345@managebac
//   SUMMARY:Math: Problem set 4
//   DTSTART;VALUE=DATE:20261030
//   END:VEVENT
// =======================================================

const ManageBac = (() => {

  // Turn .ics text into a list of events
  function parse(text) {
    const rawLines = text.replace(/\r\n?/g, "\n").split("\n");

    // Long lines continue on the next line, starting with a space
    const lines = [];
    for (const line of rawLines) {
      if ((line.startsWith(" ") || line.startsWith("\t")) && lines.length) {
        lines[lines.length - 1] += line.slice(1);
      } else {
        lines.push(line);
      }
    }

    const events = [];
    let current = null;
    for (const line of lines) {
      const t = line.trim();
      if (t === "BEGIN:VEVENT" || t === "BEGIN:VTODO") { current = {}; continue; }
      if (t === "END:VEVENT" || t === "END:VTODO") {
        if (current) events.push(current);
        current = null;
        continue;
      }
      if (!current) continue;
      const colon = line.indexOf(":");
      if (colon === -1) continue;
      const [name, ...params] = line.slice(0, colon).split(";");
      current[name.toUpperCase()] = { value: line.slice(colon + 1), params: params.join(";") };
    }
    return events;
  }

  function unescape(value) {
    return (value || "").replace(/\\n/gi, " ").replace(/\\([,;\\])/g, "$1").trim();
  }

  // 20261030 or 20261030T150000Z  ->  "2026-10-30"
  function toDate(value) {
    if (!value) return null;
    const dateOnly = value.match(/^(\d{4})(\d{2})(\d{2})$/);
    if (dateOnly) return `${dateOnly[1]}-${dateOnly[2]}-${dateOnly[3]}`;
    const dt = value.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})?(Z)?$/);
    if (dt) {
      const [, y, mo, d, h, mi, s = "00", utc] = dt;
      if (utc) return toDateString(new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi, +s)));
      return `${y}-${mo}-${d}`;
    }
    return null;
  }

  // Guess the class from the title.
  // Tip: change this to match how your school's titles look!
  function subjectAndTitle(event) {
    let title = unescape(event.SUMMARY && event.SUMMARY.value) || "Untitled assignment";
    let subject = event.CATEGORIES ? unescape(event.CATEGORIES.value.split(",")[0]) : "";

    const bracket = title.match(/^\[(.{1,40}?)\]\s*(.+)$/);      // "[Math] Problem set"
    const prefix = title.match(/^([^:]{1,40}):\s+(.+)$/);        // "Math: Problem set"
    if (!subject && bracket) { subject = bracket[1]; title = bracket[2]; }
    else if (!subject && prefix) { subject = prefix[1]; title = prefix[2]; }

    return { subject: subject.trim(), title: title.trim() };
  }

  // Turn events into simple assignment objects
  function toAssignments(events) {
    const result = [];
    for (const event of events) {
      const dateField = event.DUE || event.DTSTART;
      const due = toDate(dateField && dateField.value);
      if (!due) continue;
      const { subject, title } = subjectAndTitle(event);
      const uid = (event.UID && event.UID.value) || `${title}|${due}`;
      const notes = unescape(event.DESCRIPTION && event.DESCRIPTION.value);
      result.push({ uid, title, subject, due, notes });
    }
    return result;
  }

  // webcal:// links can't be fetched, so use https://
  function normalize(url) {
    return url.trim().replace(/^webcals?:\/\//i, "https://");
  }

  // Download the calendar: directly if allowed, otherwise via your sync server
  async function download(feedUrl, proxyUrl) {
    const url = normalize(feedUrl);

    try {
      const response = await fetch(url, { cache: "no-store" });
      if (response.ok) {
        const text = await response.text();
        if (text.includes("BEGIN:VCALENDAR")) return text;
      }
    } catch {
      // Blocked by the browser (CORS). Expected; try the sync server.
    }

    if (!proxyUrl) {
      throw new Error("Your browser blocked the direct download. Add a sync server link (see SYNC-SETUP.md).");
    }

    let response;
    try {
      response = await fetch(proxyUrl.trim().replace(/\/+$/, "") + "/?url=" + encodeURIComponent(url), { cache: "no-store" });
    } catch {
      throw new Error("Couldn't reach your sync server. Check the link and your connection.");
    }
    if (!response.ok) {
      throw new Error(`The sync server answered with an error (${response.status}). Check your calendar link.`);
    }
    const text = await response.text();
    if (!text.includes("BEGIN:VCALENDAR")) {
      throw new Error("That link didn't return a calendar. Copy it again from ManageBac.");
    }
    return text;
  }

  return { parse, toAssignments, download };
})();
