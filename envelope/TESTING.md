# Testing Envelope on your computer

You received this project as a zip without its dependencies. These steps install them and start the
app. They work on Windows, macOS and Linux.

## 1. Install the tools (once)

1. **Node.js 22 LTS** from https://nodejs.org (choose the LTS installer). Check in a new terminal:
   ```
   node -v
   ```
   It should print `v22.` or higher.
2. **pnpm 9**:
   ```
   npm i -g pnpm@9
   ```
   Close and reopen the terminal so `pnpm` is found.

## 2. Install the project (once)

Unzip, open a terminal in the `envelope` folder, then:

```
pnpm i
pnpm exec playwright install chromium
```

The first command downloads the libraries (a few minutes). The second downloads the browser used to
render the PDF report.

## 3. Run

```
pnpm dev
```

Open http://localhost:5173 in Chrome or Edge on a laptop or desktop screen (the layout needs at least
1,180 px of width). Stop the app with Ctrl+C in the terminal.

## API keys

If the zip contains a `.env` file, the app uses the keys in it: Google 3D tiles on the map and an
LLM-written report narrative. Without it the app still works fully, with an OpenStreetMap basemap
and a report narrative written by the built-in template. Treat a `.env` you received as private:
don't post or forward it.

## What to try

1. The building stands on its plot; move the hour and the construction month (Analysis) and watch
   the sun, shadows and building change.
2. Switch the impact layers (dust, surface temperature, worker heat stress, GHG) on the left.
3. Turn mitigation measures on and off; the before and after values on the right update.
4. Report → Export report → Generate report; preview and download the PDF.

## If something goes wrong

| Problem | Fix |
|---|---|
| `pnpm` is not recognised | Reopen the terminal after installing pnpm, or run `npm i -g pnpm@9` again |
| Port 5173 or 8787 already in use | Close the other program using it, then run `pnpm dev` again |
| Report export fails with a browser error | Run `pnpm exec playwright install chromium` again |
| The map stays grey | Check the internet connection; weather and air-quality data for the demo site are included, so the analysis still runs offline |

Unit tests: `pnpm test`. Project details: `README.md`.
