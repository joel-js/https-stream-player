# Agent notes

This repo is a static DW Cloud video player. Read `README.md` for how to run and use it. This file is how to change it without breaking playback.

## Layout

- `index.html` holds the controls. Element ids are the contract with `player.js` (`server`, `username`, `password`, `device-id`, `format`, `stream`, `resolution`, `quality`, `live`, `position`, `duration-min`, `video`, `mjpeg`, and the `opt-*` checkboxes).
- `player.js` is the whole client. There is no framework, bundler, or package manager.
- `styles.css` is presentation only.
- `API testing tool - DW Cloud.html` is a saved Swagger page for `GET /rest/v4/devices/{id}/media` (DW Spectrum / VMS 6.1, REST v4). Treat it as the source for parameter names and meanings. Do not load it from the player, and do not rewrite it.

## How to serve

From the repo root:

```bash
python3 -m http.server 8080 --bind 127.0.0.1
```

Then open http://127.0.0.1:8080/ and refresh after JS or CSS edits. Python's server does not process the page. It only serves files. Video bytes come from the DW host in the Server field.

`file://` is broken here: sign-in is a cross-origin `POST` with `Content-Type: application/json`, and the DW server must echo a real page origin.

## API rules that are easy to get wrong

- Sign-in is `POST {server}/rest/v4/login/sessions` with JSON `{ username, password, durationS }`. Keep the token in memory only (`state.token`). Do not write the password or token to `localStorage`.
- Do not send `Authorization: Bearer` from this page. The site's CORS allow-list does not include that header, so the browser blocks the preflight. Pass the token as the `_sessionToken` query parameter on device and media requests.
- `<video>` and `<img>` also cannot set headers, so the media URL must carry `_sessionToken` too. The on-screen address redacts it; Copy does not.
- Browser playback needs a container. `webm` and `mp4` go to `#video` at `/media.{format}`. `mpjpeg` goes to `#mjpeg`. An empty format uses `/media` exactly as the saved page documents it.
- Archive: `positionMs` is required when Live is unchecked. Empty Duration means "keep playing": `buildStreamUrl` sets `durationMs` to `CONTINUOUS_MS` (one hour). `openAt` chains another request from `positionMs + played time` when the element ends, unless the user set Duration. A user-set Duration is a finite clip and must not chain.
- `stop()` and a new `play()` bump `playback.id`. Every `ended` / `error` handler must ignore events whose session id no longer matches. Clear handlers in `releaseMedia` before dropping `src`, or a stop will restart the stream.
- Device-list failure must not clear a token that login already returned. See the nested `try` in `connect()`.

## When changing playback

Preserve these behaviors unless the user asks otherwise:

- Stop must close the HTTP connection (`removeAttribute("src")` then `load()`), not only pause.
- Continuing archive playback must advance the start time. Reusing the same `positionMs` loops the first few seconds.
- Ignore sub-second `ended` events (`playedMs < 800`) so a failed open does not spin.
- Ignore video `error` events in the first 400ms after attaching the element. Replacing `src` can emit a stale error.

Verify a change by serving the page and checking the built URL in the browser console: archive with no duration includes `positionMs` and `durationMs=3600000`; a 5 minute duration sends `durationMs=300000`; live sends neither. Then exercise Play, Stop, Live off, and an empty device id.

## Scope

Keep the stack as HTML, CSS, and one JS file. Do not add a proxy, a framework, or a backend unless CORS or auth cannot be solved in the page. Do not commit secrets. The saved API HTML is a reference snapshot, not something to minify or regenerate.
