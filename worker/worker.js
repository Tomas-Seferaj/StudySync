// =======================================================
// Homework Tracker sync server (Cloudflare Worker)
//
// Browsers don't let a web page read another website's data
// unless that website allows it. This tiny server fetches your
// ManageBac calendar for the tracker and passes it back.
//
// It ONLY fetches ManageBac links, and it doesn't save or log
// anything. See SYNC-SETUP.md for how to set it up.
// =======================================================

// Which websites may use this server.
// "*" means any site. For extra safety, change it to your own
// tracker's address, e.g. "https://your-username.github.io"
const ALLOWED_ORIGIN = "*";

// Only these website endings can be fetched
const ALLOWED_HOSTS = ["managebac.com", "managebac.cn"];

export default {
  async fetch(request) {
    const corsHeaders = {
      "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
      "Access-Control-Allow-Methods": "GET, OPTIONS",
    };

    // Browsers sometimes "ask permission" first with an OPTIONS request
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }
    if (request.method !== "GET") {
      return new Response("Only GET is allowed", { status: 405, headers: corsHeaders });
    }

    // The calendar link comes in as ?url=...
    const target = new URL(request.url).searchParams.get("url");
    if (!target) {
      return new Response("The sync server is running. Add ?url= with your calendar link.", {
        status: 400,
        headers: corsHeaders,
      });
    }

    let feedUrl;
    try {
      feedUrl = new URL(target.replace(/^webcals?:\/\//i, "https://"));
    } catch {
      return new Response("That isn't a valid link", { status: 400, headers: corsHeaders });
    }

    // Safety check: only allow https ManageBac links
    const host = feedUrl.hostname.toLowerCase();
    const isManageBac = ALLOWED_HOSTS.some(allowed => host === allowed || host.endsWith("." + allowed));
    if (feedUrl.protocol !== "https:" || !isManageBac) {
      return new Response("Only ManageBac calendar links are allowed", { status: 403, headers: corsHeaders });
    }

    // Fetch the calendar from ManageBac
    let upstream;
    try {
      upstream = await fetch(feedUrl.toString(), { headers: { Accept: "text/calendar" } });
    } catch {
      return new Response("Couldn't reach ManageBac", { status: 502, headers: corsHeaders });
    }
    if (!upstream.ok) {
      return new Response(`ManageBac answered with ${upstream.status}`, { status: 502, headers: corsHeaders });
    }

    const body = await upstream.text();
    if (!body.includes("BEGIN:VCALENDAR")) {
      return new Response("That link didn't return a calendar", { status: 502, headers: corsHeaders });
    }

    return new Response(body, {
      headers: {
        ...corsHeaders,
        "Content-Type": "text/calendar; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  },
};
