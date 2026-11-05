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

## Where is the data stored?

In the browser's **localStorage**, on each device separately. Nothing is sent to a server.
That means:

- Each person who opens the link gets their **own, separate** leaderboard.
- Pick one "scorekeeper" device for a tournament, or use **Export backup** / **Import backup** to move data between devices.
- Clearing browser data or using a private window wipes it, so export a backup now and then.

## Project structure

```
index.html        page shell
css/styles.css    all styling
js/app.js         UI: views, modals, events
js/logic.js       pure scoring/payout logic (points, pot splits, standings, settle-up)
js/store.js       localStorage persistence
```

## How the money works

- **Pot split with ties:** tied players share the combined percentages of the places they occupy. For example, with a 50/30/20 split and two players tied for 1st, each gets 40%.
- If fewer players finish than there are paid places, the unused percentage goes to the winner.
- The tournament pot is shown as a **projection** while the tournament is live and becomes **final** when you finish it.
