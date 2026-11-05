# 🏆 Game Night Leaderboard

A good-looking leaderboard for game-night tournaments: poker, Catan, Monopoly, chess or anything else.
Record who won each game, award points automatically, and run money pots for single games or for the whole tournament.

No build step, no server, no account. It's plain HTML, CSS and JavaScript.

## Features

- **Tournaments / series** with any mix of games (Poker, Catan, Monopoly, Chess, card, board, video or custom).
- **Points system** by finishing place: Classic `10·7·5·3·1`, Winner-only, Podium, Race, or your own custom list, plus optional bonus points just for playing. Ties are supported.
- **Live standings** with an animated podium, wins, games played, average place, last-5 form and net money.
- **Money pots**
  - **Tournament pot:** players chip in a buy-in (or any amount, any time), and the pot pays out at the end by final standings. Choose winner-takes-all, 70/30, 50/30/20, 60/25/15 or a custom split.
  - **Per-game pots:** each game can have its own buy-in, with a different amount per player if needed and its own payout split.
  - **Money summary and "Settle up":** each player's total put in, winnings and net, plus the fewest payments needed to square up if the pot is on paper.
- **Finish & crown champion**, with confetti 🎉. Tournaments can be reopened.
- **Players roster** with emoji avatars and colours, plus an all-time **Hall of fame**.
- **Shared live database** on the claude.ai link: everyone sees the same leaderboard in real time.
- **Export / import backup** (JSON) and a currency picker ($, €, £, ₹, …).
- Works on phones, tablets and desktop.

## Run it locally

ES modules need to be served over HTTP (opening `index.html` directly from disk won't work). From the project folder:

```bash
python3 -m http.server 8000
```

Then open <http://localhost:8000>.
Any static server works, for example `npx serve .`.

## Put it online (free) with GitHub Pages

1. On GitHub, open the repo → **Settings** → **Pages**.
2. Under **Build and deployment**, set **Source** to *Deploy from a branch*, choose **main** and **/ (root)**, then click **Save**.
3. After about a minute the app is live at `https://<your-username>.github.io/LeaderboardAPP/`. Share that link.

## Shared live database

When the app is opened from its claude.ai link, it saves to a **shared, real-time database**.
Everyone who opens the link sees the same leaderboard, and changes appear on every phone instantly.
A status pill in the top bar shows the mode:

| Pill | Meaning |
| --- | --- |
| **Live · shared** | Connected. Changes save to the shared database and sync to everyone |
| **View only** | You can watch live, but your access level doesn't allow changes. Ask the owner for edit (Contributor) access |
| **On this device** | No shared database here (GitHub Pages, localhost): data is saved in this browser only |
| **Reconnecting… / Offline** | The shared database can't be reached right now; what you see may be out of date |

Data layout in the shared store: `players/<id>`, `tournaments/<id>` (games and pot history inside), `meta/settings`.
The first person to open the shared version with data already in their browser uploads it automatically.
Each tournament is saved as one record, so if two people edit the **same** tournament at the same moment, the last save wins.

**Who can edit:** in the artifact's Share menu, people at Contributor or above can record games and change data. Viewers and Commenters get a read-only, live-updating view.

### Without the shared database

On GitHub Pages or localhost, the app uses the browser's **localStorage**, so each device keeps its own data.
Use **Export backup** / **Import backup** to move data between devices.

## Project structure

```
index.html        page shell
css/styles.css    all styling
js/app.js         UI: views, modals, events
js/logic.js       pure scoring/payout logic (points, pot splits, standings, settle-up)
js/store.js       localStorage persistence (and offline cache)
js/sync.js        shared real-time database sync (claude.ai db capability)
```

## How the money works

- **Pot split with ties:** tied players share the combined percentages of the places they occupy. For example, with a 50/30/20 split and two players tied for 1st, each gets 40%.
- If fewer players finish than there are paid places, the unused percentage goes to the winner.
- The tournament pot is shown as a **projection** while the tournament is live and becomes **final** when you finish it.
