// ===== Reading the Google Sheet (published CSV) =====
function parseCsv(text) {
  const rows = []; let row = [], cell = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; }
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell); rows.push(row); row = []; cell = "";
    } else cell += c;
  }
  if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
  return rows.filter(r => r.some(x => String(x).trim() !== ""));
}

const NAME_ALIASES = {
  "bulging tits": "Bulging", "buldging tits": "Bulging", "buldging": "Bulging",
  "flexibile impants": "Flexible Implants", "flexible impants": "Flexible Implants", "flexibile implants": "Flexible Implants",
  "tough tit": "Tough Tits", "stiff tip": "Stiff Tips", "over-stimulated": "Over Stimulated", "overstimulated": "Over Stimulated"
};
const ROMAN_IN = { i: 1, ii: 2, iii: 3, iv: 4, "1": 1, "2": 2, "3": 3, "4": 4 };
function canon(name, list) {
  const k = String(name || "").trim().replace(/\s+/g, " ").toLowerCase();
  if (!k) return null;
  const aliased = NAME_ALIASES[k] || k;
  return list.find(x => x.toLowerCase() === String(aliased).toLowerCase()) || null;
}
function splitTier(raw) {
  const s = String(raw || "").trim();
  const m = s.match(/^(.*?)[\s(]+(i{1,3}|iv|[1-4])\)?$/i);
  return m ? { name: m[1].trim(), tier: ROMAN_IN[m[2].toLowerCase()] } : { name: s, tier: 1 };
}
function items(cell) { return String(cell || "").split(/[;\n,]+/).map(x => x.trim()).filter(Boolean); }
function yes(v) { return /^(y|yes|true|1|x|b-?ko)$/i.test(String(v || "").trim()); }
function intOr(v, d) { const n = parseInt(String(v).replace(/[^\d-]/g, ""), 10); return Number.isFinite(n) ? n : d; }

const CONDITION_NAMES = ["Busted", "Crushed", "Softened", "Over Stimulated", "Humiliated"];

function rowsToFighters(rows) {
  if (!rows.length) return [];
  const head = rows[0].map(x => String(x).trim().toLowerCase().replace(/[^a-z]/g, ""));
  const col = (...names) => { for (const n of names) { const i = head.indexOf(n); if (i >= 0) return i; } return -1; };
  const C = {
    name: col("name", "fighter"), stable: col("stable", "team"), size: col("size", "sizeband"), style: col("style"),
    styleTier: col("styletier", "tier"), pref: col("preferredmatch", "preferred", "prefers"), traits: col("traits", "trait"), skills: col("skills", "skill"),
    integrity: col("integrity", "breastintegrity", "breasthealth", "health"), conditions: col("conditions", "condition"),
    bko: col("bko"), xp: col("xp", "experience", "xptospend"), life: col("lifetimexp", "lifetime"),
    wins: col("wins", "w"), losses: col("losses", "l"), last: col("lastresult", "last"), art: col("art", "image", "picture"), notes: col("notes")
  };
  const get = (r, k) => C[k] >= 0 ? String(r[C[k]] ?? "").trim() : "";
  const out = [];
  rows.slice(1).forEach((r, idx) => {
    const name = get(r, "name"); if (!name) return;
    const warn = [];
    // styles: one or more, e.g. "Titboxer III; Titfighter I; Amazon I"
    const styles = [];
    const rawStyles = items(get(r, "style"));
    const tierCell = get(r, "styleTier");
    for (const it of rawStyles) {
      const t = splitTier(it), n = canon(t.name, Object.keys(STYLES));
      if (!n) { warn.push(/foxy\s*boxer/i.test(it) ? `Foxy Boxer no longer exists; ignored. Use Titboxer.` : `Style "${it}" not recognised; ignored.`); continue; }
      let tier = t.tier;
      if (rawStyles.length === 1 && tierCell && !/\s(i{1,3}|iv|[1-4])$/i.test(it)) tier = intOr(ROMAN_IN[tierCell.toLowerCase()] || tierCell, 1);
      if (styles.some(x => x.name === n)) { warn.push(`Style ${n} is listed twice; using the first.`); continue; }
      styles.push({ name: n, tier: Math.min(3, Math.max(1, tier)) });
    }
    if (!styles.length) { warn.push(`No style recognised in "${get(r, "style") || "blank"}"; using Titboxer I.`); styles.push({ name: "Titboxer", tier: 1 }); }
    const style = styles[0].name, styleTier = styles[0].tier;
    let preferredMatch = "";
    if (get(r, "pref")) {
      const pm = canon(get(r, "pref"), MATCH_TYPES);
      const covered = matchesOf({ styles });
      if (!pm) warn.push(`Preferred match "${get(r, "pref")}" isn't a match type; using ${covered[0]}.`);
      else if (!covered.includes(pm)) warn.push(`None of her styles cover ${pm}; using ${covered[0]}.`);
      else preferredMatch = pm;
    }
    const traits = [], skills = [], conditions = [];
    for (const it of items(get(r, "traits"))) { const t = splitTier(it), n = canon(t.name, Object.keys(TRAITS)); if (n) traits.push({ name: n, tier: t.tier }); else warn.push(`Trait "${it}" not recognised; ignored.`); }
    for (const it of items(get(r, "skills"))) { const t = splitTier(it), n = canon(t.name, Object.keys(SKILLS)); if (n) skills.push({ name: n, tier: t.tier }); else warn.push(`Skill "${it}" not recognised; ignored.`); }
    let bko = yes(get(r, "bko"));
    for (const it of items(get(r, "conditions"))) {
      if (/^b-?ko/i.test(it)) { bko = true; continue; }
      const m = it.match(/^(.*?)[\s(]*(\d+)?\)?$/); const n = canon(m ? m[1] : it, CONDITION_NAMES);
      if (n) conditions.push({ name: n, left: m && m[2] ? +m[2] : 6 }); else warn.push(`Condition "${it}" not recognised; ignored.`);
    }
    const f = {
      id: "r" + (idx + 2), row: idx + 2, name, stable: get(r, "stable"), size: Math.min(5, Math.max(1, intOr(get(r, "size"), 3))),
      styles, style, styleTier, preferredMatch, traits, skills, conditions, bko,
      xp: intOr(get(r, "xp"), 0), lifetimeXp: intOr(get(r, "life"), intOr(get(r, "xp"), 0)),
      wins: intOr(get(r, "wins"), 0), losses: intOr(get(r, "losses"), 0),
      lastResult: /^w/i.test(get(r, "last")) ? "W" : /^l/i.test(get(r, "last")) ? "L" : "",
      art: get(r, "art"), notes: get(r, "notes"), warnings: warn
    };
    if (f.skills.some(k => k.name === "Finisher") && tierOf(f) === "Amateur") warn.push("Finisher needs Veteran (16 lifetime XP); it won't be offered until then.");
    const max = maxIntegrity(f);
    f.integrity = get(r, "integrity") === "" ? max : intOr(get(r, "integrity"), max);
    if (f.integrity > max) { warn.push(`Integrity ${f.integrity} is above her maximum of ${max}; using ${max}.`); f.integrity = max; }
    if (bko) f.integrity = 0;
    out.push(f);
  });
  return out;
}

function rowsToSettings(rows, defaults) {
  const s = Object.assign({}, defaults);
  for (const r of rows) {
    const k = String(r[0] || "").trim().toLowerCase().replace(/[^a-z]/g, ""), v = String(r[1] ?? "").trim();
    if (!v) continue;
    if (k === "phase" || k === "seasonphase") s.phase = /^p/i.test(v) ? "Playoff" : "Regular";
    else if (k.startsWith("basecondition")) s.baseCondition = intOr(v, s.baseCondition);
    else if (k === "recoverywin" || k === "recoveryafterawin") s.recoveryWin = intOr(v, s.recoveryWin);
    else if (k === "recoveryloss" || k === "recoveryafteraloss") s.recoveryLoss = intOr(v, s.recoveryLoss);
    else if (k === "leaguename" || k === "league") s.leagueName = v;
  }
  return s;
}

async function fetchCsv(url) {
  const bust = url.includes("?") ? "&" : "?";
  const res = await fetch(url + bust + "t=" + Date.now(), { cache: "no-store" });
  if (!res.ok) throw new Error(`The sheet answered ${res.status}.`);
  const text = await res.text();
  if (/^\s*<!doctype html|<html/i.test(text)) throw new Error("That link returns a web page, not CSV. Publish the tab as Comma-separated values.");
  return parseCsv(text);
}

if (typeof module !== "undefined") module.exports = { parseCsv, rowsToFighters, rowsToSettings };
