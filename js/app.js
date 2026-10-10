// ===== Ringside Desk (GitHub Pages edition) =====
const CFG = window.DESK_CONFIG || {};
const $ = s => document.querySelector(s);
function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === false || v === null || v === undefined) continue;
    if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2), v);
    else if (k === "class") el.className = v;
    else if (v === true) el.setAttribute(k, "");
    else el.setAttribute(k, v);
  }
  for (const kid of kids.flat(Infinity)) {
    if (kid === null || kid === undefined || kid === false) continue;
    el.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
  }
  return el;
}
const clone = x => JSON.parse(JSON.stringify(x));
const ls = {
  get(k, d) { try { const v = localStorage.getItem("rsd:" + k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem("rsd:" + k, JSON.stringify(v)); return true; } catch { return false; } }
};
let toastTimer;
function toast(msg) { const t = $("#toast"); t.textContent = msg; t.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => t.hidden = true, 3800); }
async function copyText(text, what) {
  try { await navigator.clipboard.writeText(text); toast((what || "Text") + " copied"); }
  catch {
    const ta = h("textarea", { style: "position:fixed;left:-9999px" }); ta.value = text; document.body.append(ta); ta.select();
    try { document.execCommand("copy"); toast((what || "Text") + " copied"); } catch { toast("Copy didn't work here. Select the text and copy it by hand."); }
    ta.remove();
  }
}
function download(name, text) {
  const a = h("a", { href: URL.createObjectURL(new Blob([text], { type: "text/plain" })), download: name });
  document.body.append(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}
function showBanner(msg) { const b = $("#banner"); b.textContent = msg || ""; b.hidden = !msg; }

// ---------- state ----------
const app = {
  tab: ls.get("tab", "fight"), fighters: [], loaded: false, loadedAt: null, loadError: null, source: "",
  settings: Object.assign({ phase: "Regular", baseCondition: 10, recoveryWin: 25, recoveryLoss: 15, leagueName: "Ringside Desk" }, CFG.defaults || {}),
  fights: ls.get("fights", []), currentId: ls.get("current", null), setup: null, confirm: null, expanded: new Set(), recovery: null
};
const KIND_LABEL = { pvp: "Manager vs manager", easier: "Easier offer", normal: "Normal offer", harder: "Harder offer" };
const fighterById = id => app.fighters.find(f => f.id === id);
const currentFight = () => app.fights.find(f => f.id === app.currentId) || null;
const isPlayoff = () => /^p/i.test(app.settings.phase);
function rulesFor(phase) { return phase === "playoff" ? { bkoNat: 7, bkoCond: 95 } : { bkoNat: 10, bkoCond: 99 }; }
function condNames(list) { return (list || []).map(c => c.name || c); }
function saveFights() {
  if (!ls.set("fights", app.fights)) toast("This browser won't save fights. Finish the fight before closing the page.");
}
function artSrc(f) {
  const a = (f && f.art || "").trim(); if (!a) return null;
  return /^(https?:)?\/\//i.test(a) || a.startsWith("data:") ? a : (CFG.artFolder || "art/") + a;
}
function artEl(f, big) {
  const src = artSrc(f), cls = "art" + (big ? " lg" : "");
  const ph = () => h("div", { class: cls + " art-ph", "aria-hidden": "true" }, (f.name || "?").replace(/^#/, "").slice(0, 3));
  if (!src) return ph();
  const img = h("img", { class: cls, src, alt: "", loading: "lazy" });
  img.addEventListener("error", () => img.replaceWith(ph()));
  return img;
}

// ---------- rendering ----------
let renderPending = false;
function render() {
  const a = document.activeElement;
  if (a && a.closest && a.closest("#main") && a.matches("input[type=text], input[type=number], textarea:not([readonly])")) { renderPending = true; return; }
  renderPending = false;
  document.querySelectorAll("nav.tabs button").forEach(b => b.setAttribute("aria-selected", String(b.dataset.tab === app.tab)));
  $("#phaseChip").textContent = isPlayoff() ? "Playoff" : "Regular season";
  const view = { fight: renderFightTab, roster: renderRoster, results: renderResults, rules: renderRules }[app.tab] || renderFightTab;
  $("#main").replaceChildren(view());
}
document.addEventListener("focusout", () => { if (renderPending) setTimeout(render, 0); });
document.querySelectorAll("nav.tabs button").forEach(b => b.addEventListener("click", () => { app.tab = b.dataset.tab; ls.set("tab", app.tab); render(); }));

function meter(cur, max) {
  const pct = Math.max(0, Math.min(100, (cur / Math.max(1, max)) * 100));
  return h("div", { class: "meter" },
    h("div", { class: "bar", role: "meter", "aria-valuemin": "0", "aria-valuemax": String(max), "aria-valuenow": String(cur), "aria-label": "Integrity" },
      h("div", { class: "fill" + (pct <= 25 ? " low" : ""), style: `width:${pct}%` })),
    h("div", { class: "nums" }, h("span", { class: "label" }, "Integrity"), h("span", { class: "num" }, `${cur} / ${max}`)));
}
function confirmButton(key, label, question, action, cls) {
  if (app.confirm === key) return h("span", { class: "confirm" }, h("span", {}, question),
    h("button", { class: "btn small danger", onclick: () => { app.confirm = null; action(); render(); } }, "Yes"),
    h("button", { class: "btn small", onclick: () => { app.confirm = null; render(); } }, "No"));
  return h("button", { class: "btn small " + (cls || "danger"), onclick: () => { app.confirm = key; render(); } }, label);
}

// ----- fights tab -----
function renderFightTab() {
  const active = app.fights.filter(f => f.status !== "done").sort((a, b) => b.createdAt - a.createdAt);
  const rail = h("aside", { class: "rail", "aria-label": "Fights in progress" },
    h("button", { class: "btn primary", disabled: !app.fighters.length, onclick: openSetup }, "New fight"),
    h("div", { class: "label", style: "margin-top:8px" }, `In progress on this device · ${active.length}`),
    active.length ? active.map(f => h("button", {
      class: "rail-item", "aria-current": String(f.id === app.currentId && !app.setup),
      onclick: () => { app.setup = null; app.currentId = f.id; ls.set("current", f.id); render(); }
    },
      h("span", { class: "vs" }, h("span", { class: "r" }, f.sides[0].build.name), " vs ", h("span", { class: "b" }, f.sides[1].build.name)),
      h("span", { class: "muted", style: "font-size:12px" }, `${f.matchType} · roll ${f.state.exchange}/${f.state.maxRolls}`))) :
      h("div", { class: "muted", style: "font-size:13px" }, "No fights running."));
  let pane;
  if (app.setup) pane = renderSetup();
  else { const f = currentFight(); pane = f ? renderFight(f) : renderFightEmpty(); }
  return h("div", { class: "fight-layout" }, rail, h("section", { style: "min-width:0" }, pane));
}
function renderFightEmpty() {
  if (!app.loaded) return h("div", { class: "empty" }, "Loading the roster…");
  if (!app.fighters.length) return h("div", { class: "empty" }, "The roster is empty. Check the Roster tab for the sheet link.");
  return h("div", { class: "card stack" },
    h("h2", {}, "Start a fight"),
    h("p", { class: "muted", style: "margin:0;max-width:62ch" }, "Pick two fighters and a match type, choose what each brings into the fight, then pick a skill and trait for each corner before every roll. The desk rolls the dice, applies every modifier and keeps the log you paste into your posts. When the fight ends, send the result to the league owner."),
    h("div", {}, h("button", { class: "btn primary", onclick: openSetup }, "New fight")));
}
function defaultLoadout(f) {
  const tier = tierOf(f), [nSk, nTr] = TIER_LIMITS[tier];
  // styles that are her best option in at least one match type, then Finisher, then the rest
  const useful = [...new Set(MATCH_TYPES.map(m => bestStyle(f, m)).filter(Boolean).map(st => st.name))];
  const moves = f.skills.map(k => k.name).filter(n => n !== "Finisher" || tier !== "Amateur").sort((a, b) => (b === "Finisher") - (a === "Finisher"));
  return { skills: [...useful, ...moves].slice(0, nSk), traits: f.traits.map(t => t.name).slice(0, nTr) };
}
function openSetup() {
  const avail = app.fighters.filter(f => !f.bko), red = avail[0], blue = avail[1];
  app.setup = { red: red ? red.id : "", blue: blue ? blue.id : "", match: red ? prefMatch(red) : "Titboxing", kind: "pvp", phase: isPlayoff() ? "playoff" : "regular",
    load: { red: red ? defaultLoadout(red) : { skills: [], traits: [] }, blue: blue ? defaultLoadout(blue) : { skills: [], traits: [] } } };
  app.tab = "fight"; render();
}
function renderSetup() {
  const S = app.setup;
  const sorted = app.fighters.slice().sort((a, b) => (a.stable || "~").localeCompare(b.stable || "~") || a.name.localeCompare(b.name, undefined, { numeric: true }));
  const pickFighter = corner => h("div", { class: "field" },
    h("label", { class: "label", for: "setup-" + corner }, corner === "red" ? "Red corner" : "Blue corner"),
    h("select", { id: "setup-" + corner, onchange: e => { S[corner] = e.target.value; const f = fighterById(S[corner]); S.load[corner] = f ? defaultLoadout(f) : { skills: [], traits: [] }; render(); } },
      h("option", { value: "" }, "Choose a fighter"),
      sorted.map(f => h("option", { value: f.id, selected: S[corner] === f.id, disabled: f.bko },
        `${f.name}${f.stable ? " · " + f.stable : ""} · ${stylesOf(f).map(styleLabel).join(", ")} · ${f.integrity}/${maxIntegrity(f)}${f.bko ? " · B-KO" : ""}`))));
  const loadoutBox = corner => {
    const f = fighterById(S[corner]); if (!f) return h("div", { class: "muted" }, "No fighter chosen.");
    const tier = tierOf(f), [nSk, nTr] = TIER_LIMITS[tier], L = S.load[corner];
    const toggle = (list, name, max) => { const i = list.indexOf(name); if (i >= 0) list.splice(i, 1); else if (list.length < max) list.push(name); render(); };
    return h("div", { class: "stack", style: "gap:8px" },
      h("div", { class: "corner-head" }, artEl(f), h("div", { class: "label" }, `${tier}: up to ${nSk} skills (each style counts as one) and ${nTr} trait${nTr > 1 ? "s" : ""}`)),
      h("div", { class: "checks" }, [...stylesOf(f).map(st => st.name), ...f.skills.map(k => k.name)].map(n => {
        const st = stylesOf(f).find(x => x.name === n);
        const on = L.skills.includes(n), k = f.skills.find(x => x.name === n), locked = n === "Finisher" && tier === "Amateur";
        return h("label", { class: "check", title: locked ? "Finisher needs Veteran (16 lifetime XP)" : "" }, h("input", { type: "checkbox", checked: on, disabled: locked || (!on && L.skills.length >= nSk), onchange: () => toggle(L.skills, n, nSk) }),
          st ? `Style: ${styleLabel(st)}` : n === "Finisher" ? `Finisher${locked ? " (needs Veteran)" : ""}` : `${n} ${ROMAN[(k && k.tier) || 1]}`);
      })),
      f.traits.length ? h("div", { class: "checks" }, f.traits.map(t => {
        const on = L.traits.includes(t.name);
        return h("label", { class: "check" }, h("input", { type: "checkbox", checked: on, disabled: !on && L.traits.length >= nTr, onchange: () => toggle(L.traits, t.name, nTr) }), `${t.name}${t.name === "Conditioning" ? " " + ROMAN[t.tier] : ""}`);
      })) : null,
      f.conditions.length ? h("div", { class: "chips" }, f.conditions.map(c => h("span", { class: "chip warn" }, c.name)), h("span", { class: "muted", style: "font-size:12px" }, "Conditions always come along.")) : null);
  };
  const coin = () => {
    const c = Math.random() < 0.5 ? "red" : "blue", f = fighterById(S[c]);
    if (!f) { toast("Choose both fighters first."); return; }
    S.match = prefMatch(f); render();
    const opts = matchesOf(f);
    toast(`Coin flip: ${c === "red" ? "Red" : "Blue"} sets the match type. Her preferred is ${S.match}${opts.length > 1 ? `; she can switch to ${opts.filter(m => m !== S.match).join(" or ")}` : ""}.`);
  };
  const ready = S.red && S.blue && S.red !== S.blue;
  return h("div", { class: "card stack" },
    h("div", { class: "row", style: "justify-content:space-between" }, h("h2", {}, "New fight"), h("button", { class: "btn small", onclick: () => { app.setup = null; render(); } }, "Cancel")),
    h("div", { class: "setup-grid" }, h("div", { class: "corner red" }, pickFighter("red"), loadoutBox("red")), h("div", { class: "corner blue" }, pickFighter("blue"), loadoutBox("blue"))),
    h("div", { class: "setup-grid" },
      h("div", { class: "field" }, h("label", { class: "label", for: "setup-match" }, "Match type"),
        h("div", { class: "row", style: "flex-wrap:nowrap" },
          h("select", { id: "setup-match", onchange: e => { S.match = e.target.value; render(); } }, MATCH_TYPES.map(m => h("option", { value: m, selected: S.match === m }, m))),
          h("button", { class: "btn small", onclick: coin, title: "Pick a corner at random; her preferred match type is used" }, "Coin flip"))),
      h("div", { class: "field" }, h("label", { class: "label", for: "setup-kind" }, "Fight"),
        h("select", { id: "setup-kind", onchange: e => { S.kind = e.target.value; render(); } }, Object.entries(KIND_LABEL).map(([k, v]) => h("option", { value: k, selected: S.kind === k }, v)))),
      h("div", { class: "field" }, h("label", { class: "label", for: "setup-phase" }, "Season phase"),
        h("select", { id: "setup-phase", onchange: e => { S.phase = e.target.value; render(); } },
          h("option", { value: "regular", selected: S.phase === "regular" }, "Regular season (B-KO on a natural 10)"),
          h("option", { value: "playoff", selected: S.phase === "playoff" }, "Playoff (B-KO on a natural 7–10)")))),
    h("div", { class: "row" }, h("button", { class: "btn primary", disabled: !ready, onclick: startFight }, "Start fight"), !ready ? h("span", { class: "muted" }, "Choose two different fighters.") : null));
}
function startFight() {
  const S = app.setup, fr = fighterById(S.red), fb = fighterById(S.blue); if (!fr || !fb) return;
  const snap = f => ({ name: f.name, stable: f.stable, style: f.style, styleTier: f.styleTier, styles: clone(stylesOf(f)), preferredMatch: f.preferredMatch || "", traits: clone(f.traits), skills: clone(f.skills), size: f.size,
    conditions: clone(f.conditions), integrity: Math.min(f.integrity, maxIntegrity(f)), maxIntegrity: maxIntegrity(f), lifetimeXp: f.lifetimeXp, art: f.art, row: f.row });
  const sides = [{ corner: "Red", build: snap(fr), loadout: clone(S.load.red) }, { corner: "Blue", build: snap(fb), loadout: clone(S.load.blue) }];
  const r = rulesFor(S.phase);
  const fight = { id: "f" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), createdAt: Date.now(), status: "live", matchType: S.match, kind: S.kind, phase: S.phase,
    rules: { baseCondition: +app.settings.baseCondition || 10, bkoNat: r.bkoNat, bkoCond: r.bkoCond }, sides, state: newFightState(sides), log: [], result: null,
    picks: [0, 1].map(s => ({ skill: "", trait: sides[s].loadout.traits.filter(t => t !== "Conditioning")[0] || "", mod: 0 })) };
  app.fights.push(fight); app.currentId = fight.id; ls.set("current", fight.id); app.setup = null; saveFights(); render();
}

function setPick(f, s, patch) { Object.assign(f.picks[s], patch); saveFights(); render(); }
function renderFight(f) {
  const st = f.state, done = f.status === "done";
  return h("div", { class: "card" },
    h("div", { class: "fight-head" },
      h("div", { class: "stack", style: "gap:6px" },
        h("h2", {}, `${f.sides[0].build.name} vs ${f.sides[1].build.name}`),
        h("div", { class: "fight-meta" }, h("span", { class: "chip" }, f.matchType), h("span", { class: "chip" }, KIND_LABEL[f.kind]),
          h("span", { class: "chip gold" }, f.phase === "playoff" ? "Playoff" : "Regular season"), h("span", { class: "chip num" }, `Roll ${st.exchange} / ${st.maxRolls}`)))),
    h("div", { class: "corners" }, [0, 1].map(s => renderCorner(f, s))),
    renderActionBar(f), done ? renderResultBox(f) : null, renderLog(f),
    !done ? h("div", { class: "row", style: "margin-top:14px;justify-content:flex-end" }, confirmButton("cancel:" + f.id, "Cancel fight", "Delete this fight?", () => deleteFight(f))) : null);
}
function renderCorner(f, s) {
  const side = f.sides[s], b = side.build, st = f.state;
  const brought = stylesOf(b).filter(st => side.loadout.skills.includes(st.name)), best = bestStyle(b, f.matchType, side.loadout.skills);
  const styleOn = !!best;
  const styleNote = !brought.length ? "no style brought" : best ? `${styleLabel(best)} · +${styleValue(best)} every roll` : `${brought.map(styleLabel).join(", ")} · no bonus in this match`;
  const opts = skillOptions(f, s), p = f.picks[s];
  const traits = side.loadout.traits.filter(t => t !== "Conditioning");
  const live = f.status !== "done" && !st.pending;
  return h("div", { class: "corner " + (s === 0 ? "red" : "blue") },
    h("div", { class: "corner-head" }, artEl(b),
      h("div", { class: "corner-name" }, h("span", { class: "tag" }, side.corner), h("span", { class: "who" }, b.name), b.stable ? h("span", { class: "muted" }, b.stable) : null)),
    meter(st.bi[s], st.max[s]),
    h("div", { class: "chips" },
      h("span", { class: "chip" }, styleNote),
      side.loadout.traits.map(t => h("span", { class: "chip", title: (TRAITS[t] || {}).text || "" }, t)),
      st.sore[s] ? h("span", { class: "chip bad" }, `Sore ${ROMAN[Math.min(st.sore[s], 4)]}`) : null,
      condNames(b.conditions).map(c => h("span", { class: "chip warn", title: c === "Humiliated" ? "−5 only in an unavoidable rematch; use the writer's modifier" : "−2 on matching rolls" }, c)),
      h("span", { class: "chip num" }, `Double Taps ${2 - st.dt[s]}`), h("span", { class: "chip num" }, `Triple ${st.tt[s] ? "used" : "ready"}`)),
    live ? h("div", { class: "pick" },
      h("div", { class: "label" }, `Roll ${st.exchange + 1}: skill`),
      h("div", { class: "opt-grid" },
        h("button", { class: "opt", "aria-pressed": String(!p.skill), onclick: () => setPick(f, s, { skill: "" }) }, styleOn ? "Style only" : "No skill"),
        opts.filter(o => o.name !== "Finisher" || o.ok).map(o => h("button", { class: "opt" + (o.name === "Finisher" ? " finisher" : ""), "aria-pressed": String(p.skill === o.name), disabled: !o.ok, title: o.ok ? SKILLS[o.name].text : o.why, onclick: () => setPick(f, s, { skill: o.name }) }, o.name === "Finisher" ? "Finisher" : `${o.name} ${ROMAN[o.tier]}`))),
      traits.length ? [h("div", { class: "label" }, "Trait this roll"), h("div", { class: "opt-grid" },
        traits.map(t => h("button", { class: "opt", "aria-pressed": String(p.trait === t), title: (TRAITS[t] || {}).text || "", onclick: () => setPick(f, s, { trait: t }) }, t)),
        h("button", { class: "opt", "aria-pressed": String(!p.trait), onclick: () => setPick(f, s, { trait: "" }) }, "None"))] : null,
      h("div", { class: "row" }, h("span", { class: "label" }, "Writer's modifier"),
        h("div", { class: "stepper" },
          h("button", { "aria-label": "Lower modifier", onclick: () => setPick(f, s, { mod: (+p.mod || 0) - 1 }) }, "−"),
          h("output", {}, (p.mod > 0 ? "+" : "") + (p.mod || 0)),
          h("button", { "aria-label": "Raise modifier", onclick: () => setPick(f, s, { mod: (+p.mod || 0) + 1 }) }, "+")))) : null);
}
function renderActionBar(f) {
  const st = f.state; if (f.status === "done") return null;
  if (st.pending) {
    const down = st.pending.side;
    return h("div", { class: "action-bar" }, h("span", {}, `${f.sides[down].corner} is at 0 and survived the ending roll.`),
      h("button", { class: "btn primary", onclick: () => answer(f, true) }, "Keep fighting"), h("button", { class: "btn", onclick: () => answer(f, false) }, "Concede"));
  }
  return h("div", { class: "action-bar" }, h("button", { class: "btn gold roll-btn", onclick: () => roll(f) }, `Roll ${st.exchange + 1}`),
    h("span", { class: "muted" }, "Rolls both corners with the choices above."));
}
function roll(f) {
  const out = resolveExchange(f, f.picks);
  f.log.push({ n: f.state.exchange, lines: out.lines });
  f.picks.forEach(p => { p.skill = ""; p.mod = 0; });
  if (f.status === "done") f.finishedAt = Date.now();
  saveFights(); render();
}
function answer(f, keep) {
  const lines = answerPending(f, keep);
  if (f.log.length) f.log[f.log.length - 1].lines = f.log[f.log.length - 1].lines.concat(lines); else f.log.push({ n: f.state.exchange, lines });
  if (f.status === "done") f.finishedAt = Date.now();
  saveFights(); render();
}
function deleteFight(f) {
  app.fights = app.fights.filter(x => x.id !== f.id);
  if (app.currentId === f.id) { app.currentId = null; ls.set("current", null); }
  saveFights(); toast("Fight deleted.");
}

// ----- log & results text -----
function logText(f, onlyLast) {
  const entries = onlyLast ? f.log.slice(-1) : f.log;
  const head = `${f.sides[0].build.name} (Red) vs ${f.sides[1].build.name} (Blue) · ${f.matchType}`;
  return (onlyLast ? [] : [head, ""]).concat(entries.map(e => e.lines.join("\n"))).join("\n\n");
}
function outcomeText(f) {
  const r = f.result; if (!r) return "";
  if (r.winner === null) return `${f.sides[0].build.name} and ${f.sides[1].build.name} draw`;
  const W = f.sides[r.winner], L = f.sides[1 - r.winner];
  return `${W.corner} ${W.build.name} defeats ${L.corner} ${L.build.name}`;
}
function loserOutcome(f) {
  const r = f.result; if (!r || r.winner === null) return null;
  return r.loserOutcome === "B-KO" ? "B-KO" : r.loserOutcome === "Conceded" ? "Conceded, no condition" : r.loserOutcome ? `Gains ${r.loserOutcome}` : "No condition";
}
/** What the league owner changes on the Roster tab for one corner. */
function rosterChange(f, i) {
  const r = f.result, b = f.sides[i].build, x = r.xp[i].total;
  const held = condNames(b.conditions);
  let conds = held.length ? `clear ${held.join(", ")}` : "";
  let res = r.winner === null ? "Draw" : r.winner === i ? "Win" : "Loss";
  let extra = [];
  if (r.winner !== null && r.winner !== i) {
    if (r.loserOutcome === "B-KO") extra.push("B-KO: Y, integrity 0");
    else if (r.loserOutcome && r.loserOutcome !== "Conceded") extra.push(`add ${r.loserOutcome} (6)`);
  }
  return [`${b.name} (row ${b.row || "?"})`, `${res}`, `integrity ${b.integrity} → ${r.finalIntegrity[i]}`, `XP ${x >= 0 ? "+" : ""}${x}`, conds, ...extra, `last result ${r.winner === i ? "W" : "L"}`].filter(Boolean).join(" · ");
}
function resultText(f) {
  const r = f.result;
  return [`RESULT · ${outcomeText(f)}`,
    `${f.matchType} · ${KIND_LABEL[f.kind]} · ${f.phase === "playoff" ? "Playoff" : "Regular season"} · ${new Date(f.finishedAt || Date.now()).toLocaleString()}`,
    `How: ${r.how}${loserOutcome(f) ? " · Loser: " + loserOutcome(f) : ""} · Final integrity ${r.finalIntegrity[0]}–${r.finalIntegrity[1]}`,
    `Red ${f.sides[0].build.name}: XP ${r.xp[0].total >= 0 ? "+" : ""}${r.xp[0].total} (${r.xp[0].lines.join(", ")})`,
    `Blue ${f.sides[1].build.name}: XP ${r.xp[1].total >= 0 ? "+" : ""}${r.xp[1].total} (${r.xp[1].lines.join(", ")})`,
    "", "Roster updates:", "• " + rosterChange(f, 0), "• " + rosterChange(f, 1)].join("\n");
}
/** One tab-separated row matching the Results tab template. */
function resultRow(f) {
  const r = f.result, W = r.winner === null ? "Draw" : f.sides[r.winner].build.name;
  return [new Date(f.finishedAt || Date.now()).toISOString().slice(0, 10), f.sides[0].build.name, f.sides[1].build.name, f.matchType, KIND_LABEL[f.kind],
    f.phase === "playoff" ? "Playoff" : "Regular", W, r.how, r.winner === null ? "" : (r.loserOutcome || "None"),
    r.finalIntegrity[0], r.finalIntegrity[1], r.xp[0].total, r.xp[1].total, f.state.exchange].join("\t");
}
function renderLog(f) {
  return h("div", { class: "log" },
    h("div", { class: "log-head" }, h("h3", {}, "Official's log"),
      h("div", { class: "row" },
        h("button", { class: "btn small", disabled: !f.log.length, onclick: () => copyText(logText(f, true), "Last roll") }, "Copy last roll"),
        h("button", { class: "btn small", disabled: !f.log.length, onclick: () => copyText(logText(f, false), "Log") }, "Copy full log"))),
    h("div", { class: "log-body" }, f.log.length ? f.log.map(e => h("div", { class: "log-ex" }, e.lines.map((l, i) => h("div", { class: i === 0 ? "h" : /^Red:/.test(l) ? "Red" : /^Blue:/.test(l) ? "Blue" : "" }, l))))
      : h("div", { class: "muted" }, "Rolls appear here as the fight goes.")));
}
function renderXp(f) {
  return h("div", { class: "xp-cols" }, [0, 1].map(i => h("div", {},
    h("div", { class: "label" }, `${f.sides[i].corner} ${f.sides[i].build.name} · XP ${f.result.xp[i].total >= 0 ? "+" : ""}${f.result.xp[i].total}`),
    h("div", { class: "muted" }, f.result.xp[i].lines.join(" · ")))));
}
function resultButtons(f) {
  return h("div", { class: "row" },
    h("button", { class: "btn small primary", onclick: () => copyText(resultText(f), "Result") }, "Copy result for the league"),
    h("button", { class: "btn small", onclick: () => copyText(resultRow(f), "Results row") }, "Copy Results-tab row"),
    h("button", { class: "btn small", onclick: () => download(`fight-${f.sides[0].build.name}-vs-${f.sides[1].build.name}.txt`.replace(/[^\w.-]+/g, "_"), resultText(f) + "\n\n" + logText(f, false)) }, "Download log"));
}
function renderResultBox(f) {
  const r = f.result;
  return h("div", { class: "result" },
    h("div", { class: "big" }, outcomeText(f)),
    h("div", { class: "row" }, h("span", { class: "chip" }, r.how), loserOutcome(f) ? h("span", { class: "chip " + (r.loserOutcome === "B-KO" ? "bad" : "warn") }, loserOutcome(f)) : null,
      h("span", { class: "chip num" }, `Final ${r.finalIntegrity[0]} – ${r.finalIntegrity[1]}`)),
    renderXp(f),
    h("p", { class: "source-line", style: "margin:0" }, "Send the result to the league owner. Nothing changes on the roster until they update the sheet."),
    resultButtons(f));
}

// ----- results tab -----
function renderResults() {
  const done = app.fights.filter(f => f.status === "done").sort((a, b) => (b.finishedAt || 0) - (a.finishedAt || 0));
  return h("div", {},
    h("div", { class: "toolbar" }, h("h2", {}, "Results on this device"),
      done.length ? confirmButton("clear", "Clear all results", "Remove every finished fight from this device?", () => { app.fights = app.fights.filter(f => f.status !== "done"); saveFights(); }) : null),
    h("p", { class: "source-line", style: "margin-top:-4px" }, "Fights are saved in this browser only. The league sheet is the official record."),
    done.length ? h("div", { class: "stack" }, done.map(f => {
      const open = app.expanded.has(f.id), r = f.result;
      return h("div", { class: "res-item" },
        h("div", { class: "row", style: "justify-content:space-between" }, h("div", { class: "res-title" }, outcomeText(f)),
          h("span", { class: "muted num", style: "font-size:12px" }, f.finishedAt ? new Date(f.finishedAt).toLocaleString() : "")),
        h("div", { class: "row" }, h("span", { class: "chip" }, f.matchType), h("span", { class: "chip" }, KIND_LABEL[f.kind]), h("span", { class: "chip gold" }, f.phase === "playoff" ? "Playoff" : "Regular"),
          h("span", { class: "chip" }, r.how), loserOutcome(f) ? h("span", { class: "chip " + (r.loserOutcome === "B-KO" ? "bad" : "warn") }, loserOutcome(f)) : null,
          h("span", { class: "chip num" }, `Final ${r.finalIntegrity[0]} – ${r.finalIntegrity[1]}`)),
        renderXp(f),
        h("div", { class: "source-line" }, "Roster updates: ", h("br"), rosterChange(f, 0), h("br"), rosterChange(f, 1)),
        resultButtons(f),
        h("div", { class: "row" }, h("button", { class: "btn small", onclick: () => { open ? app.expanded.delete(f.id) : app.expanded.add(f.id); render(); } }, open ? "Hide log" : "Show log"),
          confirmButton("del:" + f.id, "Delete", "Delete this result?", () => deleteFight(f))),
        open ? renderLog(f) : null);
    })) : h("div", { class: "empty" }, "Finished fights from this device land here, with the result to send and the full log."));
}

// ----- roster tab -----
function renderRoster() {
  const groups = new Map();
  app.fighters.slice().sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true })).forEach(f => {
    const k = f.stable || "Unassigned"; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(f);
  });
  const keys = [...groups.keys()].sort((a, b) => a === "Unassigned" ? 1 : b === "Unassigned" ? -1 : a.localeCompare(b));
  const warnCount = app.fighters.reduce((n, f) => n + f.warnings.length, 0);
  return h("div", {},
    h("div", { class: "toolbar" }, h("h2", {}, "Roster"),
      h("div", { class: "row" }, h("button", { class: "btn small", onclick: () => loadSheet(true) }, "Reload sheet"), h("button", { class: "btn small primary", disabled: !app.fighters.length, onclick: rollRecovery }, "Roll recovery"))),
    h("p", { class: "source-line", style: "margin-top:-4px" }, app.loadError ? `Couldn't read the sheet: ${app.loadError}` :
      `${app.fighters.length} fighters from ${app.source}${app.loadedAt ? ", loaded " + app.loadedAt.toLocaleTimeString() : ""}.${warnCount ? ` ${warnCount} cell${warnCount > 1 ? "s" : ""} need a look; see the notes on the cards.` : ""}`),
    app.recovery ? renderRecovery() : null,
    !app.loaded ? h("div", { class: "empty" }, "Loading the roster…") : !app.fighters.length ? h("div", { class: "empty" }, "No fighters found. The Roster tab needs a header row with at least Name and Style.") :
      keys.map(k => h("section", { class: "stable" }, h("h3", {}, k, h("span", { class: "label" }, `${groups.get(k).length} fighters`)), h("div", { class: "f-grid" }, groups.get(k).map(fighterCard)))));
}
function fighterCard(f) {
  const max = maxIntegrity(f);
  return h("article", { class: "f-card" + (f.bko ? " bko" : "") },
    artEl(f, true),
    h("div", { class: "f-top" }, h("span", { class: "f-name" }, f.name), h("span", { class: "chips" }, f.bko ? h("span", { class: "chip bad" }, "B-KO") : null, h("span", { class: "chip gold" }, tierOf(f)))),
    meter(f.integrity, max),
    h("dl", { class: "kv" },
      h("dt", {}, stylesOf(f).length > 1 ? "Styles" : "Style"), h("dd", {}, stylesOf(f).map(styleLabel).join(", ")),
      h("dt", {}, "Prefers"), h("dd", {}, `${prefMatch(f)}${matchesOf(f).length > 1 ? ` (covers ${matchesOf(f).join(", ")})` : ""}`),
      h("dt", {}, "Traits"), h("dd", {}, f.traits.map(t => t.name + (t.name === "Conditioning" ? " " + ROMAN[t.tier] : "")).join(", ") || "None"),
      h("dt", {}, "Skills"), h("dd", {}, f.skills.map(k => k.name === "Finisher" ? "Finisher" : `${k.name} ${ROMAN[k.tier]}`).join(", ") || "None"),
      h("dt", {}, "Record"), h("dd", { class: "num" }, `${f.wins}–${f.losses}${f.lastResult ? " · last " + (f.lastResult === "W" ? "win" : "loss") : ""}`),
      h("dt", {}, "XP"), h("dd", { class: "num" }, `${f.xp} to spend · ${f.lifetimeXp} lifetime`),
      h("dt", {}, "Size"), h("dd", { class: "num" }, `Band ${f.size}`),
      h("dt", {}, "Sheet"), h("dd", { class: "num" }, `Row ${f.row}`)),
    f.conditions.length ? h("div", { class: "chips" }, f.conditions.map(c => h("span", { class: "chip warn" }, `${c.name} · ${c.left} recoveries`))) : null,
    f.notes ? h("div", { class: "muted", style: "font-size:13px" }, f.notes) : null,
    f.warnings.length ? h("div", { class: "warn-box" }, f.warnings.map(w => h("div", {}, w))) : null);
}
function rollRecovery() {
  const S = app.settings;
  app.recovery = app.fighters.slice().sort((a, b) => a.row - b.row).map(f => {
    if (f.bko) return { f, skip: true };
    const base = f.lastResult === "W" ? +S.recoveryWin : +S.recoveryLoss, die = 1 + Math.floor(Math.random() * 20), max = maxIntegrity(f);
    const next = Math.min(max, f.integrity + base + die);
    const conds = f.conditions.map(c => ({ name: c.name, left: c.left - 1 })).filter(c => c.left > 0);
    return { f, base, die, next, conds };
  });
  render();
}
function renderRecovery() {
  const R = app.recovery;
  const tsvInt = R.map(x => x.skip ? x.f.integrity : x.next).join("\n");
  const tsvCond = R.map(x => x.skip ? "" : x.conds.map(c => `${c.name} (${c.left})`).join("; ")).join("\n");
  return h("div", { class: "card stack", style: "margin-bottom:16px" },
    h("div", { class: "row", style: "justify-content:space-between" }, h("h3", {}, "Recovery roll"), h("button", { class: "btn small", onclick: () => { app.recovery = null; render(); } }, "Close")),
    h("p", { class: "source-line", style: "margin:0" }, `${S_text()} Rows are in sheet order, so each copy button pastes straight into a column starting at row 2.`),
    h("div", { class: "tbl-wrap" }, h("table", { class: "ref" },
      h("tr", {}, h("th", {}, "Row"), h("th", {}, "Fighter"), h("th", {}, "Last"), h("th", {}, "Roll"), h("th", {}, "Integrity"), h("th", {}, "Conditions after")),
      R.map(x => h("tr", {}, h("td", { class: "num" }, x.f.row), h("td", {}, x.f.name), h("td", {}, x.f.lastResult || "—"),
        x.skip ? h("td", { colspan: "3" }, "B-KO'd: no recovery until the B-KO resolves") :
          [h("td", { class: "num" }, `${x.base} + ${x.die}`), h("td", { class: "num" }, `${x.f.integrity} → ${x.next}`), h("td", {}, x.conds.map(c => `${c.name} (${c.left})`).join("; ") || "—")])))),
    h("div", { class: "row" },
      h("button", { class: "btn small primary", onclick: () => copyText(tsvInt, "Integrity column") }, "Copy Integrity column"),
      h("button", { class: "btn small", onclick: () => copyText(tsvCond, "Conditions column") }, "Copy Conditions column")));
}
function S_text() { const S = app.settings; return `Recovery is ${S.recoveryWin} + d20 after a win and ${S.recoveryLoss} + d20 after a loss. Conditions tick down by one.`; }

// ----- rules tab -----
function renderRules() {
  const S = app.settings;
  const card = (title, ...body) => h("div", { class: "card" }, h("h3", {}, title), ...body);
  return h("div", {},
    h("div", { class: "toolbar" }, h("h2", {}, "Rules")),
    h("div", { class: "rules-grid" },
      card("League settings", h("dl", { class: "kv" },
        h("dt", {}, "Phase"), h("dd", {}, isPlayoff() ? "Playoff: B-KO on a natural 7–10 or 95–100 on the condition roll" : "Regular season: B-KO on a natural 10 or 99–100 on the condition roll"),
        h("dt", {}, "Condition"), h("dd", {}, `${S.baseCondition}% base chance`),
        h("dt", {}, "Recovery"), h("dd", {}, `${S.recoveryWin} + d20 after a win, ${S.recoveryLoss} + d20 after a loss`)),
        h("p", { class: "source-line" }, CFG.settingsCsvUrl ? "From the Settings tab of the league sheet." : "From config.js.")),
      card("Each roll", h("ul", {},
        h("li", {}, "Both corners roll a d10 every exchange, up to 15 rolls. Each result comes off the opponent's integrity."),
        h("li", {}, "Per roll: one skill, one trait and one lingering condition. Your best style for the match type always applies and stacks with a skill. Each style you bring uses a skill slot."),
        h("li", {}, "A natural 10 is a Double Tap: roll again and add. Another 10 is a Triple Tap. Two Double Taps per fight, and only one can become a Triple."),
        h("li", {}, "A roll's tags are the match type's tag plus the skill's tag. Traits and conditions key off those tags."),
        h("li", {}, "The writer's modifier covers anything the desk doesn't model, such as Humiliated in an unavoidable rematch."))),
      card("Season", h("ul", {},
        h("li", {}, "28 fights per stable. Fights 1–21: the offer board or a manager-vs-manager fight. Fights 22–28: playoff, player stables only, coin flip for match type."),
        h("li", {}, "Playoff B-KOs happen on a natural 7–10 and last until the season ends. A stable is out the moment all three fighters are B-KO'd."),
        h("li", {}, "House fighters who aren't chosen in a round count as winning it: +1 XP and a winner's recovery."))),
      card("Match types", h("div", { class: "tbl-wrap" }, h("table", { class: "ref" },
        h("tr", {}, h("th", {}, "Match"), h("th", {}, "Tag"), h("th", {}, "Loser's condition")),
        MATCH_TYPES.map(m => h("tr", {}, h("td", {}, m), h("td", {}, MATCH_TAG[m]), h("td", {}, PREF_COND[m])))))),
      card("At 0 integrity", h("ul", {},
        h("li", {}, "The next roll is the ending roll: if the other corner's total is 5 or more, the fighter at 0 is defeated."),
        h("li", {}, "Under 5, the fighter at 0 can keep fighting or concede. Conceding skips the condition chance."),
        h("li", {}, "Both at 0: roll-off, higher total wins. A winning total of 5+ gives the loser a condition chance."),
        h("li", {}, "A Finisher (Veteran or higher) is offered only once the opponent is at 0. It defeats her outright. A Veteran's Finisher still checks the die for B-KO and otherwise guarantees the condition roll, with no conceding. A Warmaid's or Champion's Finisher is an automatic B-KO."),
        h("li", {}, "No one at 0 after 15 rolls: more integrity left wins."))),
      card("Condition chance", h("ul", {},
        h("li", {}, "The loser rolls d100 against the base chance plus modifiers: Dense Implants +10, Bulging or Stiff Tips +20 once used, Busted results ±30, Thirsty or Flexible Implants +20 when beaten by their tag."),
        h("li", {}, "A hit gives the condition for the loser's preferred match type: −2 on matching rolls until her next fight ends or 6 recoveries pass."))),
      card("Skills", h("div", { class: "tbl-wrap" }, h("table", { class: "ref" }, h("tr", {}, h("th", {}, "Skill"), h("th", {}, "Tag"), h("th", {}, "Effect (I/II/III)")),
        Object.entries(SKILLS).map(([k, v]) => h("tr", {}, h("td", {}, k), h("td", {}, v.tags.join(", ") || "—"), h("td", {}, v.text))))), h("p", { class: "muted" }, "Each skill once per fight. Finisher has no tiers, takes a skill slot and costs 4 XP like any new skill.")),
      card("Traits", h("div", { class: "tbl-wrap" }, h("table", { class: "ref" }, h("tr", {}, h("th", {}, "Trait"), h("th", {}, "Effect")),
        Object.entries(TRAITS).map(([k, v]) => h("tr", {}, h("td", {}, k), h("td", {}, v.text)))))),
      card("Experience", h("div", { class: "tbl-wrap" }, h("table", { class: "ref" },
        [["Win (normal, harder, manager vs manager)", "+2"], ["Win (easier offer)", "+1"], ["Harder offer win", "+2 more"], ["Won carrying a condition", "+1"], ["Won from half integrity or less", "+1"], ["B-KO win", "+2"], ["Loss", "+1"], ["Lost by B-KO", "−1"]]
          .map(([a, b]) => h("tr", {}, h("td", {}, a), h("td", { class: "num" }, b))))),
        h("p", { class: "muted" }, "Veteran at 16 lifetime XP (5 skills, 2 traits per fight). Warmaid at 40 (7 skills, 3 traits)."))));
}

// ---------- boot ----------
async function loadSheet(manual) {
  const url = CFG.rosterCsvUrl || "roster.csv";
  app.source = /docs\.google\.com/.test(url) ? "the league sheet" : url;
  try {
    const rows = await fetchCsv(url);
    app.fighters = rowsToFighters(rows); app.loadError = null; app.loadedAt = new Date();
    ls.set("rosterCache", rows);
    if (CFG.settingsCsvUrl) {
      try { app.settings = rowsToSettings(await fetchCsv(CFG.settingsCsvUrl), Object.assign(app.settings, CFG.defaults || {})); }
      catch (e) { toast("Couldn't read the Settings tab; using config.js."); }
    }
    showBanner("");
    if (manual) toast(`Roster reloaded: ${app.fighters.length} fighters.`);
  } catch (e) {
    app.loadError = e.message || "the link didn't answer";
    const cached = ls.get("rosterCache", null);
    if (cached) { app.fighters = rowsToFighters(cached); showBanner("Couldn't reach the league sheet, so this is the last roster this browser loaded. Reload once you're back online."); }
    else showBanner("Couldn't load the roster. Check the sheet link in config.js and that the Roster tab is published as CSV.");
  }
  app.loaded = true; render();
}
document.title = (CFG.defaults && CFG.defaults.leagueName) || "Ringside Desk";
render();
loadSheet(false);
