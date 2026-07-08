# World Catalog

A retro (1997-web) front end for browsing and generating 3D worlds with the
[World Labs Marble API](https://docs.worldlabs.ai/api). Worlds render
client-side as Gaussian splats using [three.js](https://threejs.org/) and
[Spark](https://sparkjs.dev/).

It's a static site — no build step, no server, no bundler. Each visitor
supplies their own World Labs API key, stored only in the browser's
`localStorage`.

## Running locally

Serve the directory with any static file server, e.g.:

```
python3 -m http.server 8080
```

Then open `http://localhost:8080`.

## Structure

```
index.html              Page markup
css/styles.css          All styling
js/                      ES modules, loaded directly by the browser (no bundler)
  main.js                Entry point — wires up remaining listeners and boots the app
  api.js                 World Labs API calls: generate, poll, list
  gallery.js              Catalog rendering, search + category filtering
  viewer.js               Full-screen splat viewer (WASD/arrow flying, orbit controls)
  mini-viewer.js          Auto-rotating splat previews inside catalog tiles
  spark-loader.js         Shared three.js/Spark module loader + splat framing
  state.js                Shared app state + localStorage persistence
  status.js               Status-strip helper
  format.js               Pure formatting/parsing helpers
  constants.js            API endpoint, storage keys, tuning constants
assets/images/           Logos and ad art
```

Each module attaches the event listeners for the DOM it owns when it's
imported; `main.js` is the only file that needs to run last.

## Notes

- Splat previews default to the smallest ("100k") tier for performance —
  see `PREVIEW_ORDER` / `DETAIL_ORDER` in `js/constants.js`.
- The sidebar ad slots in `index.html` (`.ad-slot`) are placeholders where
  not yet filled in — drop artwork into `assets/images/` and point the
  `<img>` at it.
