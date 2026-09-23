// D4 Filter Master — guide-link resolver.
//
// A browser on GitHub Pages can fetch Maxroll's planner + data APIs directly
// (they send permissive CORS), but NOT a Maxroll build-guide HTML page (no CORS
// header). This tiny Worker is the only server-side piece: it fetches a guide
// page and returns the planner id embedded in it, with open CORS so the static
// app can call it. Planner links never touch this — they work with no backend.
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};
const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });

export default {
  async fetch(request) {
    if (request.method === "OPTIONS") return new Response(null, { headers: CORS });
    const guide = new URL(request.url).searchParams.get("url") || "";
    if (!/^https:\/\/maxroll\.gg\/d4\/build-guides\/[A-Za-z0-9/_-]+$/.test(guide))
      return json({ error: "pass ?url=https://maxroll.gg/d4/build-guides/<slug>" }, 400);
    try {
      const r = await fetch(guide, { headers: { "User-Agent": "Mozilla/5.0" } });
      if (!r.ok) return json({ error: `guide fetch failed: ${r.status}` }, 502);
      const html = await r.text();
      const ids = [...html.matchAll(/"embed_id":"([A-Za-z0-9]{5,12})"/g)].map((m) => m[1]);
      if (!ids.length) return json({ error: "no planner embed found on that guide" }, 404);
      return json({ id: ids[0], all: [...new Set(ids)] });
    } catch (e) {
      return json({ error: String(e && e.message || e) }, 502);
    }
  },
};
