// Ringside Desk settings. Edit this file, then upload it to the repo.
window.DESK_CONFIG = {
  // The Roster tab of your Google Sheet, published as CSV
  // (File > Share > Publish to web > choose the Roster tab > Comma-separated values).
  // Until you paste your link, the site uses roster.csv from this repo.
  rosterCsvUrl: "roster.csv",

  // Optional: the Settings tab published as CSV. Leave "" to use the defaults below.
  settingsCsvUrl: "",

  // Used when there's no Settings tab, or a setting is missing from it.
  defaults: {
    phase: "Regular",        // Regular or Playoff
    baseCondition: 10,       // % base condition chance
    recoveryWin: 25,         // recovery after a win = this + d20
    recoveryLoss: 15,        // recovery after a loss = this + d20
    leagueName: "Ringside Desk"
  },

  // Where character art lives when the Art column holds a file name.
  artFolder: "art/"
};
