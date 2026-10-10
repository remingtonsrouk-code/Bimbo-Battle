// ===== Rules engine (pure; no DOM) =====
const MATCH_TAG = { "Titboxing": "Batter", "Titfight": "Squeeze", "Nipple Duel": "Fence", "Sexfight": "Erotic" };
const MATCH_TYPES = Object.keys(MATCH_TAG);
const STYLES = {
  "Titboxer": ["Titboxing"], "Titfighter": ["Titfight"], "Duelist": ["Nipple Duel"],
  "Sexfighter": ["Sexfight"], "Amazon": ["Titboxing", "Titfight"], "Harpy": ["Titboxing", "Sexfight"],
  "Siren": ["Nipple Duel", "Titfight"], "Nymph": ["Nipple Duel", "Sexfight"], "Champion": MATCH_TYPES.slice()
};
const PREF_COND = { "Titboxing": "Busted", "Titfight": "Crushed", "Nipple Duel": "Softened", "Sexfight": "Over Stimulated" };
const COND_TAG = { "Busted": "Batter", "Crushed": "Squeeze", "Softened": "Fence", "Over Stimulated": "Erotic" };
const COND_PENALTY = 2;
const ROMAN = ["", "I", "II", "III", "IV"];

const SKILLS = {
  "Bash":       { tags: ["Batter"], text: "+3/+4/+5. Opponent gains Sore I." },
  "Busted":     { tags: ["Squeeze"], text: "Die 1: +30% condition chance to you. 2–5: +3/+4/+5. 6–9: +4/+5/+6. 10: +5/+6/+7 and opponent +30% condition chance." },
  "Flick":      { tags: ["Fence"], combo: 1, text: "+1/+2/+3. Combo 1." },
  "Skewer":     { tags: ["Fence"], combo: 2, needs: "combo1", text: "+2/+3/+4 and opponent gains Sore I. Needs a Combo 1 on your previous roll." },
  "Rub":        { tags: ["Squeeze"], combo: 1, text: "Die 1–3: +0/+1/+2. 4–7: +3/+4/+5. 8–10: +4/+5/+6. Combo 1." },
  "Submission": { tags: [], needs: "rubtease", text: "Die 1–6: +0/+1/+2. 7–10: +5/+6/+7. Needs Rub or Tease on your previous roll." },
  "Tease":      { tags: ["Erotic"], combo: 1, text: "Bonus +2/+3/+4. Die 1–3: goes to opponent. 4–6: both. 7–9: you. 10: you, doubled. Combo 1." },
  "Slam":       { tags: ["Batter"], text: "No roll: your die counts as 5/6/7. Opponent gains Sore I. Can't Double Tap." },
  "Finisher":   { tags: [], needs: "oppzero", text: "Veteran or higher. Only offered when the opponent is at 0: she is defeated. Veteran: the die still checks for B-KO, otherwise the condition roll is guaranteed. Warmaid or Champion: automatic B-KO." }
};
const TRAITS = {
  "Dense Implants":    { text: "−1 to opponent's Batter rolls. +2 to your Batter roll once per fight. +10% condition chance." },
  "Tough Tits":        { text: "−1 to opponent's Squeeze rolls." },
  "Thick Nipples":     { text: "−1 to opponent's Fence rolls." },
  "Pain Slut":         { text: "−1 to opponent's Erotic rolls." },
  "Flexible Implants": { text: "−1 to opponent's Batter rolls. +20% condition chance if beaten by a Squeeze roll." },
  "Bulging":           { text: "+1 to every Squeeze roll. +20% condition chance once used." },
  "Stiff Tips":        { text: "+1 to every Fence roll. +20% condition chance once used." },
  "Thirsty":           { text: "+1 to every Erotic roll. +20% condition chance if beaten by an Erotic roll." },
  "Conditioning":      { text: "+10 maximum integrity per tier. Always on." },
  "Massive":           { text: "+1 to every roll against an opponent 2+ size bands smaller." }
};
const TIER_LIMITS = { "Amateur": [3, 1], "Veteran": [5, 2], "Warmaid": [7, 3] };
const XP_TIERS = { veteran: 16, warmaid: 40 };

function tierOf(f) { const l = +f.lifetimeXp || 0; return l >= XP_TIERS.warmaid ? "Warmaid" : l >= XP_TIERS.veteran ? "Veteran" : "Amateur"; }
function maxIntegrity(f) {
  let m = 100;
  for (const t of f.traits || []) if (t.name === "Conditioning") m += 10 * (t.tier || 1);
  return m;
}
/** Every style a fighter owns: [{name, tier}]. Older single-style records still work. */
function stylesOf(build) {
  if (build.styles && build.styles.length) return build.styles;
  return build.style ? [{ name: build.style, tier: build.styleTier || 1 }] : [];
}
function styleValue(st) { return st.name === "Champion" ? 3 : (st.tier || 1); }
function styleLabel(st) { return st.name === "Champion" ? "Champion" : `${st.name} ${ROMAN[st.tier || 1]}`; }
/** The best style that applies in this match, limited to styles brought into the fight when a loadout is given. */
function bestStyle(build, match, loadoutSkills) {
  let best = null;
  for (const st of stylesOf(build)) {
    if (loadoutSkills && !loadoutSkills.includes(st.name)) continue;
    if (!(STYLES[st.name] || []).includes(match)) continue;
    if (!best || styleValue(st) > styleValue(best)) best = st;
  }
  return best;
}
function styleBonus(build, match, loadoutSkills) { const b = bestStyle(build, match, loadoutSkills); return b ? styleValue(b) : 0; }
/** Match types any of her styles cover. */
function matchesOf(build) { const set = new Set(); stylesOf(build).forEach(st => (STYLES[st.name] || []).forEach(m => set.add(m))); return MATCH_TYPES.filter(m => set.has(m)); }
/** Her preferred match: the one the fighter chose, if her styles cover it, else her first style's first match. */
function prefMatch(build) {
  const ok = matchesOf(build);
  if (build.preferredMatch && ok.includes(build.preferredMatch)) return build.preferredMatch;
  return ok[0] || "Titboxing";
}
function isChampion(build) { return stylesOf(build).some(st => st.name === "Champion"); }
function prefCondition(build) { return PREF_COND[prefMatch(build)] || "Busted"; }
function d(n, rng) { return 1 + Math.floor(rng() * n); }

/** Skills this side may pick this exchange. */
function skillOptions(fight, s) {
  const side = fight.sides[s], st = fight.state;
  return side.loadout.skills.filter(n => !STYLES[n]).map(n => {
    const def = SKILLS[n]; if (!def) return null;
    let ok = !st.used[s].includes(n), why = ok ? "" : "Used";
    if (ok && def.needs === "combo1" && !["Flick", "Rub", "Tease"].includes(st.prev[s])) { ok = false; why = "Needs Combo 1 first"; }
    if (ok && def.needs === "rubtease" && !["Rub", "Tease"].includes(st.prev[s])) { ok = false; why = "Needs Rub or Tease first"; }
    if (ok && def.needs === "oppzero" && (st.bi[1 - s] > 0 || st.pending)) { ok = false; why = "Only when the opponent is at 0"; }
    if (def.needs === "oppzero" && tierOf(side.build) === "Amateur") { ok = false; why = "Needs Veteran"; }
    const tier = (side.build.skills.find(k => k.name === n) || {}).tier || 1;
    return { name: n, tier, ok, why };
  }).filter(Boolean);
}

function newFightState(sides, opts) {
  return {
    exchange: 0, maxRolls: 15,
    bi: sides.map(x => x.build.integrity), max: sides.map(x => x.build.maxIntegrity),
    sore: [0, 0], used: [[], []], prev: [null, null], dt: [0, 0], tt: [0, 0], cc: [0, 0],
    denseUsed: [false, false], traitTouched: [[], []], lastTags: [[], []],
    pending: null, done: false
  };
}

function rollSide(fight, picks, s, rng) {
  const me = fight.sides[s], op = fight.sides[1 - s], st = fight.state, match = fight.matchType;
  const pick = picks[s] || {};
  const opts = skillOptions(fight, s);
  const chosen = opts.find(o => o.name === pick.skill && o.ok) || null;
  const skill = chosen ? chosen.name : null, T = chosen ? chosen.tier : 0;
  const tags = new Set([MATCH_TAG[match]]);
  if (skill) SKILLS[skill].tags.forEach(t => tags.add(t));
  const parts = []; let nat = null, dice = [], base, giveSore = 0, oppBonus = 0;
  if (skill === "Slam") { base = 4 + T; parts.push([`Slam ${ROMAN[T]} (no roll)`, base]); }
  else {
    nat = d(10, rng); dice = [nat]; base = nat;
    if (nat === 10 && st.dt[s] < 2) {
      st.dt[s]++; const r2 = d(10, rng); dice.push(r2); base += r2;
      if (r2 === 10 && st.tt[s] < 1) { st.tt[s]++; const r3 = d(10, rng); dice.push(r3); base += r3; }
    }
  }
  const add = (label, v) => { if (v) parts.push([label, v]); };
  const myStyle = bestStyle(me.build, match, me.loadout.skills);
  if (myStyle) add(styleLabel(myStyle), styleValue(myStyle));
  if (skill) {
    st.used[s].push(skill);
    const L = `${skill} ${ROMAN[T]}`;
    if (skill === "Bash") { add(L, 2 + T); giveSore = 1; }
    else if (skill === "Busted") {
      if (nat === 1) { st.cc[s] += 30; parts.push([`${L}: +30% condition chance to you`, 0]); }
      else if (nat <= 5) add(L, 2 + T);
      else if (nat <= 9) add(L, 3 + T);
      else { add(L, 4 + T); st.cc[1 - s] += 30; parts.push([`${L}: opponent +30% condition chance`, 0]); }
    }
    else if (skill === "Flick") add(L, T);
    else if (skill === "Skewer") { add(L, 1 + T); giveSore = 1; }
    else if (skill === "Rub") add(L, nat <= 3 ? T - 1 : nat <= 7 ? 2 + T : 3 + T);
    else if (skill === "Submission") add(L, nat <= 6 ? T - 1 : 4 + T);
    else if (skill === "Finisher") parts.push(["Finisher", 0]);
    else if (skill === "Tease") {
      const b = 1 + T;
      if (nat <= 3) oppBonus = b;
      else if (nat <= 6) { oppBonus = b; add(L, b); }
      else if (nat <= 9) add(L, b);
      else add(`${L} (doubled)`, 2 * b);
    }
  }
  // own active trait (one per roll)
  const myTrait = (me.loadout.traits.includes(pick.trait) ? pick.trait : null);
  const bump = (name) => { if (!st.traitTouched[s].includes(name)) { st.traitTouched[s].push(name); if (name === "Bulging" || name === "Stiff Tips") st.cc[s] += 20; } };
  if (myTrait === "Dense Implants" && tags.has("Batter") && !st.denseUsed[s]) { add("Dense Implants", 2); st.denseUsed[s] = true; }
  if (myTrait === "Bulging" && tags.has("Squeeze")) { add("Bulging", 1); bump("Bulging"); }
  if (myTrait === "Stiff Tips" && tags.has("Fence")) { add("Stiff Tips", 1); bump("Stiff Tips"); }
  if (myTrait === "Thirsty" && tags.has("Erotic")) { add("Thirsty", 1); }
  if (myTrait === "Massive" && (me.build.size || 3) - (op.build.size || 3) >= 2) add("Massive", 1);
  // opponent's active trait, defensive side
  const opTrait = (op.loadout.traits.includes((picks[1 - s] || {}).trait) ? picks[1 - s].trait : null);
  if ((opTrait === "Dense Implants" || opTrait === "Flexible Implants") && tags.has("Batter")) add(`Opp. ${opTrait}`, -1);
  if (opTrait === "Tough Tits" && tags.has("Squeeze")) add("Opp. Tough Tits", -1);
  if (opTrait === "Thick Nipples" && tags.has("Fence")) add("Opp. Thick Nipples", -1);
  if (opTrait === "Pain Slut" && tags.has("Erotic")) add("Opp. Pain Slut", -1);
  // one lingering condition: the worse of Sore and a carried condition
  let ling = null;
  if (st.sore[s] > 0) ling = [`Sore ${ROMAN[Math.min(st.sore[s], 4)] || st.sore[s]}`, st.sore[s]];
  for (const c of me.build.conditions || []) {
    const name = c.name || c;
    if (COND_TAG[name] && tags.has(COND_TAG[name]) && (!ling || COND_PENALTY > ling[1])) ling = [name, COND_PENALTY];
  }
  if (ling) add(ling[0], -ling[1]);
  add("Writer's modifier", +pick.mod || 0);
  const total = base + parts.filter(p => typeof p[1] === "number" && !/^Slam/.test(p[0])).reduce((a, p) => a + p[1], 0);
  return { s, skill, nat, dice, base, parts, total, giveSore, oppBonus, tags: [...tags], trait: myTrait };
}

function fmtRoll(fight, r) {
  const side = fight.sides[r.s];
  let head = r.skill === "Slam" ? `Slam ${ROMAN[(side.build.skills.find(k => k.name === "Slam") || {}).tier || 1]} counts as ${r.base}` : r.dice.length > 1 ? `d10 ${r.dice.join("+")}${r.dice.length === 2 ? " (Double Tap)" : " (Triple Tap)"}` : `d10 ${r.nat}`;
  const mods = r.parts.filter(p => !/^Slam/.test(p[0])).map(p => p[1] ? `${p[1] > 0 ? "+" : "−"} ${p[0]} ${Math.abs(p[1])}` : `· ${p[0]}`).join(" ");
  return `${side.corner}: ${head} ${mods} = ${r.total}`.replace(/\s+/g, " ");
}

function conditionRoll(fight, loser, defeatTags, rng) {
  const side = fight.sides[loser], st = fight.state;
  let chance = fight.rules.baseCondition + st.cc[loser];
  if (side.loadout.traits.includes("Dense Implants")) chance += 10;
  if (side.loadout.traits.includes("Flexible Implants") && defeatTags.includes("Squeeze")) chance += 20;
  if (side.loadout.traits.includes("Thirsty") && defeatTags.includes("Erotic")) chance += 20;
  const r = d(100, rng);
  let out = null;
  if (r >= fight.rules.bkoCond || (chance >= 100 && r >= 90)) out = "B-KO";
  else if (r <= chance) out = prefCondition(side.build);
  return { chance, roll: r, out };
}

function xpFor(fight, i, res) {
  const side = fight.sides[i];
  if (res.winner === null) return { total: 1, lines: ["Draw +1"] };
  if (res.winner === i) {
    const lines = []; let x = fight.kind === "easier" ? 1 : 2;
    lines.push(`${fight.kind === "easier" ? "Easier" : "Win"} +${x}`);
    if (fight.kind === "harder") { x += 2; lines.push("Harder fight +2"); }
    if ((side.build.conditions || []).some(c => (c.name || c) !== "Humiliated")) { x += 1; lines.push("Won with a condition +1"); }
    if (side.build.integrity <= side.build.maxIntegrity / 2) { x += 1; lines.push("Won from half integrity or less +1"); }
    if (res.loserOutcome === "B-KO") { x += 2; lines.push("B-KO win +2"); }
    return { total: x, lines };
  }
  return res.loserOutcome === "B-KO" ? { total: -1, lines: ["Lost by B-KO −1"] } : { total: 1, lines: ["Loss +1"] };
}

function finish(fight, winner, how, extra) {
  const res = Object.assign({ winner, how, loserOutcome: null, condition: null }, extra || {});
  res.finalIntegrity = fight.state.bi.slice();
  res.xp = [xpFor(fight, 0, res), xpFor(fight, 1, res)];
  fight.state.done = true; fight.result = res; fight.status = "done";
  return res;
}

/** Resolve one exchange. Mutates and returns {fight, lines}. */
function resolveExchange(fight, picks, rng) {
  rng = rng || Math.random;
  Object.defineProperty(fight, "_rng", { value: rng, enumerable: false, configurable: true, writable: true });
  const st = fight.state;
  if (st.done || st.pending) return { fight, lines: [] };
  st.exchange += 1;
  const n = st.exchange;
  const lines = [`Roll ${n} of ${st.maxRolls} · ${fight.matchType}`];
  const zeroBefore = [st.bi[0] <= 0, st.bi[1] <= 0];
  const R = [rollSide(fight, picks, 0, rng), rollSide(fight, picks, 1, rng)];
  if (R[1].oppBonus) { R[0].parts.push(["Tease (from opponent)", R[1].oppBonus]); R[0].total += R[1].oppBonus; }
  if (R[0].oppBonus) { R[1].parts.push(["Tease (from opponent)", R[0].oppBonus]); R[1].total += R[0].oppBonus; }
  R.forEach(r => lines.push(fmtRoll(fight, r)));
  // Sore ticks down after each roll, then new Sore lands
  for (const s of [0, 1]) st.sore[s] = Math.max(0, st.sore[s] - 1);
  for (const s of [0, 1]) if (R[s].giveSore) { st.sore[1 - s] += 1; lines.push(`${fight.sides[1 - s].corner} is now Sore ${ROMAN[Math.min(st.sore[1 - s], 4)]}`); }
  for (const s of [0, 1]) { st.prev[s] = R[s].skill; st.lastTags[s] = R[s].tags; }
  const C = i => fight.sides[i].corner;

  if (zeroBefore[0] && zeroBefore[1]) {
    if (R[0].total === R[1].total) { lines.push("Both at 0: roll-off tied, roll again."); return endOrContinue(fight, lines); }
    const w = R[0].total > R[1].total ? 0 : 1;
    lines.push(`Both at 0: ${C(w)} wins the roll-off ${R[w].total} to ${R[1 - w].total}.`);
    if (R[w].skill === "Finisher") return finisherEnd(fight, R, w, 1 - w, lines, "Finisher (roll-off)");
    let extra = {};
    if (R[w].total >= 5) { const cr = conditionRoll(fight, 1 - w, R[w].tags, rng); extra = { conditionRoll: cr, loserOutcome: cr.out }; lines.push(condLine(fight, 1 - w, cr)); }
    else lines.push("Winning roll under 5: no condition chance.");
    finish(fight, w, "Roll-off", extra);
    return { fight, lines };
  }
  if (zeroBefore[0] !== zeroBefore[1]) {
    const down = zeroBefore[0] ? 0 : 1, atk = 1 - down;
    if (R[atk].skill === "Finisher") return finisherEnd(fight, R, atk, down, lines);
    if (R[atk].total >= 5) {
      const bko = R[atk].nat !== null && R[atk].nat >= fight.rules.bkoNat;
      lines.push(`${C(down)} is at 0 and ${C(atk)} rolled ${R[atk].total}: ${C(down)} is defeated.`);
      let extra;
      if (bko) { extra = { loserOutcome: "B-KO", bkoByDie: true }; lines.push(`Natural ${R[atk].nat} on the deciding roll: B-KO.`); }
      else { const cr = conditionRoll(fight, down, R[atk].tags, rng); extra = { conditionRoll: cr, loserOutcome: cr.out }; lines.push(condLine(fight, down, cr)); }
      finish(fight, atk, "Ending roll", extra);
      return { fight, lines };
    }
    applyDamage(fight, R, lines);
    st.pending = { side: down };
    lines.push(`${C(atk)} rolled under 5. ${C(down)} may keep fighting or concede to avoid a condition chance.`);
    return endOrContinue(fight, lines);
  }
  applyDamage(fight, R, lines);
  return endOrContinue(fight, lines);
}

function finisherEnd(fight, R, atk, down, lines, how) {
  const C = i => fight.sides[i].corner, b = fight.sides[atk].build;
  const top = tierOf(b) === "Warmaid" || isChampion(b);
  lines.push(`${C(atk)} uses a Finisher: ${C(down)} is defeated.`);
  let extra;
  if (top) { extra = { loserOutcome: "B-KO", bkoByFinisher: true }; lines.push(`${isChampion(b) ? "Champion" : "Warmaid"} Finisher: automatic B-KO.`); }
  else if (R[atk].nat !== null && R[atk].nat >= fight.rules.bkoNat) { extra = { loserOutcome: "B-KO", bkoByDie: true }; lines.push(`Natural ${R[atk].nat} on the deciding roll: B-KO.`); }
  else { const cr = conditionRoll(fight, down, R[atk].tags, fight._rng || Math.random); extra = { conditionRoll: cr, loserOutcome: cr.out }; lines.push("Finisher: the condition roll is guaranteed."); lines.push(condLine(fight, down, cr)); }
  finish(fight, atk, how || "Finisher", extra);
  return { fight, lines };
}

function applyDamage(fight, R, lines) {
  const st = fight.state;
  for (const s of [0, 1]) {
    const dmg = Math.max(0, R[s].total), t = 1 - s, before = st.bi[t];
    st.bi[t] = Math.max(0, before - dmg);
    lines.push(`${fight.sides[t].corner} integrity ${before} → ${st.bi[t]}`);
  }
  for (const s of [0, 1]) if (st.bi[s] === 0) lines.push(`${fight.sides[s].corner} is at 0 integrity and barely hanging on.`);
}

function endOrContinue(fight, lines) {
  const st = fight.state;
  if (st.exchange >= st.maxRolls && !st.done) {
    st.pending = null;
    const [a, b] = st.bi;
    if (a <= 0 && b > 0) { lines.push("Out of rolls with Red at 0."); finish(fight, 1, "Out of rolls"); }
    else if (b <= 0 && a > 0) { lines.push("Out of rolls with Blue at 0."); finish(fight, 0, "Out of rolls"); }
    else if (a !== b) { const w = a > b ? 0 : 1; lines.push(`Out of rolls: ${fight.sides[w].corner} wins on integrity, ${st.bi[w]} to ${st.bi[1 - w]}.`); finish(fight, w, "Decision"); }
    else { lines.push("Out of rolls with integrity level: draw."); finish(fight, null, "Draw"); }
  }
  return { fight, lines };
}

function condLine(fight, i, cr) {
  const who = fight.sides[i].corner;
  if (cr.out === "B-KO") return `Condition chance ${cr.chance}%, rolled ${cr.roll}: B-KO for ${who}.`;
  if (cr.out) return `Condition chance ${cr.chance}%, rolled ${cr.roll}: ${who} gains ${cr.out}.`;
  return `Condition chance ${cr.chance}%, rolled ${cr.roll}: no condition.`;
}

/** The fighter at 0 answers after a failed ending roll. */
function answerPending(fight, keepFighting) {
  const st = fight.state; if (!st.pending) return [];
  const down = st.pending.side, C = i => fight.sides[i].corner;
  st.pending = null;
  if (keepFighting) {
    const lines = [`${C(down)} keeps fighting.`];
    endOrContinue(fight, lines);
    return lines;
  }
  finish(fight, 1 - down, "Concession", { loserOutcome: "Conceded" });
  return [`${C(down)} concedes. No condition chance.`];
}

if (typeof module !== "undefined") module.exports = { stylesOf, bestStyle, matchesOf, styleLabel, isChampion, resolveExchange, answerPending, newFightState, skillOptions, maxIntegrity, tierOf, prefCondition, prefMatch, styleBonus, SKILLS, TRAITS, STYLES, MATCH_TYPES, TIER_LIMITS };
