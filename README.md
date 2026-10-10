# Ringside Desk

A fight table for the league. Players pick two fighters, choose a skill and trait for each corner before every roll, and the desk rolls the dice, applies the modifiers and keeps a log to paste into their posts. The roster comes from your Google Sheet. Nothing writes back to the sheet: players send you the result and you update it by hand.

## What's in this folder

| File | What it is |
|---|---|
| `index.html` | The page |
| `config.js` | The one file you edit: your sheet links and default settings |
| `js/engine.js` | The fight rules |
| `js/sheet.js` | Reads the roster from the sheet |
| `js/app.js` | The interface |
| `css/style.css` | Styles |
| `art/` | Character art (see below) |
| `roster.csv` | The current roster. The site uses it until you paste in your sheet link |
| `league-sheet-template.xlsx` | Roster, Settings, Results and Lists tabs to import into Google Sheets |

## 1. Set up the sheet

1. In Google Sheets, open your league sheet (or a new one) and choose **File > Import > Upload**, pick `league-sheet-template.xlsx`, and choose **Insert new sheet(s)**. You get four tabs: Roster, Settings, Results and Lists.
2. Keep the Roster tab's header row exactly as it is. Column order doesn't matter, but the names do.
3. Your per-fighter tabs can stay. If you want them to update from the Roster tab, point their cells at it with formulas.

### Roster columns

| Column | What goes in it | Example |
|---|---|---|
| Name | Fighter's name. Required | `#7` |
| Stable | Team name. Blank shows as Unassigned | `House 2` |
| Size | Size band 1–5, used by Massive | `3` |
| Style | Every style she owns, each with its tier, separated by semicolons. In a fight she gets the bonus from her best style for that match type | `Titboxer III; Titfighter I; Amazon I` |
| Style Tier | Only needed when Style holds a single style with no tier written | `II` |
| Preferred Match | The match type she picks when she sets it, from those her styles cover. Also decides which condition she takes when she loses. Blank uses her first style's match | `Titfight` |
| Traits | Separate with semicolons. Add a tier only where it matters | `Conditioning II; Massive` |
| Skills | Separate with semicolons, each with its tier. Finisher has no tier | `Bash II; Slam I; Finisher` |
| Integrity | Current integrity | `54` |
| Conditions | Name and recoveries left, separated by semicolons | `Busted (6)` |
| B-KO | `Y` while B-KO'd | `Y` |
| XP | XP to spend | `3` |
| Lifetime XP | Total XP earned. Sets Amateur, Veteran or Warmaid | `19` |
| Wins, Losses | Record | `4`, `2` |
| Last Result | `W` or `L`. Sets the recovery amount | `W` |
| Art | A file name in `art/`, or a full image link | `n07.jpg` |
| Notes | Anything else. Shown on the card | |

If a cell can't be read, such as a misspelled skill, the fighter still loads and her card on the Roster tab says which cell to fix.

### Settings tab

| Setting | Value |
|---|---|
| Phase | `Regular` or `Playoff`. Switch to Playoff at fight 22 of a 28-fight season |
| Base condition chance | `10` |
| Recovery win | `25` |
| Recovery loss | `15` |
| League name | Shown in the browser tab |

## 2. Publish the tabs

1. **File > Share > Publish to web.**
2. Choose the **Roster** tab and **Comma-separated values (.csv)**, then **Publish**. Copy the link.
3. Do the same for the **Settings** tab.
4. Open `config.js` and paste the links:

```js
rosterCsvUrl: "https://docs.google.com/spreadsheets/d/e/…/pub?gid=0&single=true&output=csv",
settingsCsvUrl: "https://docs.google.com/spreadsheets/d/e/…/pub?gid=123&single=true&output=csv",
```

Anyone with a published link can read that tab, so publish only Roster and Settings. Google can take up to about five minutes to refresh a published tab after you edit it. Use **Reload sheet** on the Roster tab to pick up changes.

## 3. Put it on GitHub Pages

1. Create a repository on GitHub, for example `ringside-desk`.
2. Upload everything in this folder: **Add file > Upload files**, then drag the files and folders in.
3. Go to **Settings > Pages**, set **Source** to **Deploy from a branch**, choose `main` and `/ (root)`, then **Save**.
4. The site appears at `https://<your-username>.github.io/ringside-desk/` within a minute or two.

To change settings later, edit `config.js` on GitHub (the pencil icon) and commit. The site updates on its own.

## 4. Add character art

Put image files in `art/` and type the file name in the fighter's Art column, for example `n07.jpg`. A full `https://` link also works. JPG, PNG and WebP all work; around 600×800 keeps the page quick. A fighter with no art shows her name instead.

Check GitHub's acceptable-use policies for what art can be hosted on GitHub Pages before you upload. If they don't fit, host the images elsewhere and put full links in the Art column.

## Running the league

**Players.** Fights run on one screen and are saved in that browser, so a fight survives a refresh. When a fight ends, the player presses **Copy result for the league** and sends it to you. The result lists each corner's changes: integrity, XP, any new condition or B-KO, and which conditions to clear.

**You.**
- Paste **Copy Results-tab row** into the Results tab to keep a record. The columns match the template.
- Update the Roster tab from the "Roster updates" lines.
- After each round, press **Roll recovery** on the Roster tab. It rolls for every fighter in sheet order and gives you copy buttons for the Integrity and Conditions columns. Paste each into row 2 of its column. B-KO'd fighters are skipped.
- Set B-KO back to blank and add Humiliated by hand when a B-KO resolves.
- House fighters who aren't chosen in a round count as winning that round: +1 XP (not the usual 2) and a winner's recovery. Set their Last Result to `W` before you press Roll recovery.

## Season format

- 28 fights per stable. Fights 1–21 are the regular season: managers pick from the offer board or fight each other.
- Fights 22–28 are the playoff: player stables fight each other only, with a coin flip for match type. Set Phase to `Playoff` on the Settings tab.
- In the playoff, B-KO happens on a natural 7–10, and a B-KO lasts until the season ends.
- A stable is defeated the moment all three fighters are B-KO'd, before anyone's B-KO resolves.
- Unchosen house fighters earn +1 XP per round, as above.

## Rules the desk applies

- Per fight, Amateurs bring up to 3 skills and 1 trait, Veterans 5 and 2, Warmaids 7 and 3. The style counts as one of the skills.
- Moves stack with styles. Each style a fighter brings into a fight uses one of her skill slots, and she gets the bonus from her best style for that match type.
- Amazon covers Titboxing and Titfight, Harpy covers Titboxing and Sexfight, Siren covers Nipple Duel and Titfight, Nymph covers Nipple Duel and Sexfight, and Champion gives +3 in every match. Foxy Boxer and the Boxing match type have been retired.
- Bulging, Stiff Tips and Thirsty give +1 on every matching roll. Conditioning gives +10 maximum integrity per tier.
- Conditions are tied to the loser's preferred match type, give −2 on matching rolls, and clear after her next fight or 6 recoveries.
- Base condition chance is 10%.
- B-KO happens on a natural 10 in the regular season and on a natural 7–10 in the playoff, or on a high condition roll.
- Finisher: Veteran or higher, uses a skill slot and costs 4 XP. It's only offered once the opponent is at 0, and it defeats her outright. A Veteran's Finisher still checks the die for B-KO; if that misses, the condition roll is guaranteed and she can't concede. A Warmaid's or Champion's Finisher is an automatic B-KO. A Finisher on an Amateur's row is flagged on her card and isn't offered.
- No one at 0 after 15 rolls: more integrity left wins.
- Easier wins are worth 1 XP, and harder wins add +2.

The writer's modifier on each corner covers anything the desk doesn't model, such as Humiliated in an unavoidable rematch.
