# DW Cloud stream player

A static browser player for a DW Spectrum / DW Cloud site. It signs in, lists cameras, and plays live or archive video from the Device HTTP Stream:

`GET /rest/v4/devices/{id}/media`

WebM, MP4, and Motion JPEG use the format path (`/media.webm`, `/media.mp4`, `/media.mpjpeg`) so the browser can decode the stream. "Server default" calls `/media` with no suffix.

There is no build step and no application server. A local static file server only delivers this page. The browser then calls the DW site directly.

## Run it

From this directory:

```bash
python3 -m http.server 8080 --bind 127.0.0.1
```

Open http://127.0.0.1:8080/

Do not open `index.html` as a `file://` page. The DW server allows the page origin on cross-origin requests, and a `file://` page has no usable origin.

Stop the server with Ctrl+C. If port 8080 is already taken, pick another port and open that port instead. The DW server reflects the page's `Origin`, so another localhost port is fine.

## Use it

1. Enter the site URL (the default is `https://sitesecuritysystems.net:7001`), username, and password, then sign in.
2. Choose a camera, or paste a device id (the `id` from `GET /rest/v4/devices`, or a MAC address).
3. Press Play. Stop closes the HTTP connection.

Live is the default. Turn Live off, set Archive start, and leave Duration empty to keep playing from that time until Stop. A number in Duration ends playback after that many minutes.

The stream address under the picture hides the session token. Copy includes the token.

The server URL, username, last device id, and a few stream settings are stored in `localStorage` under `dw-stream-player`. The password and session token are not stored.

## What the page calls

| Call | Purpose |
| --- | --- |
| `POST /rest/v4/login/sessions` | Sign in. Body is `{ username, password, durationS: 3600 }`. The response `token` is the session. |
| `GET /rest/v4/devices?_sessionToken=…` | Camera list. |
| `GET /rest/v4/devices/{id}/media[.{format}]?…&_sessionToken=…` | The picture. |

A `<video>` or `<img>` element cannot send an `Authorization` header. The session token is passed as `_sessionToken`. The saved API page also documents a one-time `_ticket`; this player uses the session token so playback can continue and reconnect.

Archive time is `positionMs` (Unix milliseconds from the datetime field, in local time). An empty Duration sends `durationMs` of one hour (`CONTINUOUS_MS` in `player.js`). If that response still ends early, playback starts again at `positionMs +` the time already played. Stop increments `playback.id` so a late `ended` event cannot reopen the stream.

## Files

| File | Role |
| --- | --- |
| `index.html` | Page structure and form fields. |
| `player.js` | Sign-in, device list, stream URL, playback. |
| `styles.css` | Layout. |
| `API testing tool - DW Cloud.html` | Saved DW Cloud API page for `GET /rest/v4/devices/{id}/media`. Reference only. It is not loaded by the player. |
| `AGENTS.md` | Notes for an agent changing this repo. |

## Stream options

The side panel maps onto query parameters from the saved API page: `stream`, `resolution`, `quality`, `resolutionWhenTranscoding`, `rotation`, `aspectRatio`, `videoCodec`, `zoom`, dewarping fields, `realTimeOptimization`, `standFrameDuration`, `accurateSeek`, `audioOnly`, `panoramic`, `dewarping`, `signature`, `utcTimestamps`, `download`, `_local`, and `_strict`.

Empty fields are omitted. Checked boxes are sent as `true`. Realtime optimization is on by default.
