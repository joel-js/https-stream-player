const $ = (id) => document.getElementById(id);

const state = {
  token: "",
  expiresAt: 0,
  devices: [],
  rawUrl: "",
};

const playback = { id: 0 };
const CONTINUOUS_MS = 60 * 60 * 1000;

const saved = JSON.parse(localStorage.getItem("dw-stream-player") || "{}");
if (saved.server) $("server").value = saved.server;
if (saved.username) $("username").value = saved.username;
if (saved.deviceId) $("device-id").value = saved.deviceId;
if (saved.format) $("format").value = saved.format;
if (saved.stream) $("stream").value = saved.stream;
if (saved.resolution) $("resolution").value = saved.resolution;

$("connect-form").addEventListener("submit", (event) => {
  event.preventDefault();
  connect();
});

$("play").addEventListener("click", () => play());
$("stop").addEventListener("click", () => stop());
$("fullscreen").addEventListener("click", () => {
  const well = $("well");
  if (document.fullscreenElement) document.exitFullscreen();
  else well.requestFullscreen().catch(() => {});
});
$("copy-url").addEventListener("click", copyUrl);
$("filter").addEventListener("input", renderCameras);
$("live").addEventListener("change", syncArchiveFields);
$("cameras").addEventListener("click", (event) => {
  const button = event.target.closest("button[data-id]");
  if (!button) return;
  $("device-id").value = button.dataset.id;
  renderCameras();
  if (event.detail === 2) play();
});

document.addEventListener("keydown", (event) => {
  if (event.target.matches("input, select, textarea")) return;
  if (event.code === "Space") {
    event.preventDefault();
    if ($("video").src || !$("mjpeg").hidden) stop();
    else play();
  }
});

if (location.protocol === "file:") {
  setStatus("Open this page from a local web server. A file:// page cannot call the site.");
}

syncArchiveFields();

function syncArchiveFields() {
  const live = $("live").checked;
  $("position").disabled = live;
  $("duration-min").disabled = live;
}

function serverBase() {
  let value = $("server").value.trim().replace(/\/+$/, "");
  if (!/^https?:\/\//i.test(value)) value = `https://${value}`;
  return value;
}

function persist() {
  localStorage.setItem("dw-stream-player", JSON.stringify({
    server: $("server").value.trim(),
    username: $("username").value.trim(),
    deviceId: $("device-id").value.trim(),
    format: $("format").value,
    stream: $("stream").value,
    resolution: $("resolution").value.trim(),
  }));
}

function setStatus(message, ok) {
  const node = $("status");
  node.textContent = message || "";
  node.classList.toggle("ok", Boolean(ok));
}

function setSession(message, kind) {
  const node = $("session");
  node.textContent = message;
  node.className = `session${kind ? ` ${kind}` : ""}`;
}

async function connect() {
  const button = $("connect");
  button.disabled = true;
  setStatus("");
  setSession("Signing in…");
  try {
    const response = await fetch(`${serverBase()}/rest/v4/login/sessions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: $("username").value,
        password: $("password").value,
        durationS: 3600,
      }),
    });
    const data = await readBody(response);
    if (!response.ok || !data.token) {
      throw new Error(errorText(data, response.status));
    }
    state.token = data.token;
    state.expiresAt = Date.now() + (Number(data.expiresInS) || 3600) * 1000;
    persist();
    setSession(`Signed in as ${data.username || $("username").value}`, "ok");
    try {
      await loadDevices();
    } catch (error) {
      $("cameras").innerHTML = `<li class="empty-list">Camera list unavailable. Paste a device id.</li>`;
      setStatus(error.message || "Signed in, but the camera list did not load.");
    }
  } catch (error) {
    state.token = "";
    setSession("Sign-in failed", "bad");
    setStatus(error.message || "Could not reach the server.");
  } finally {
    button.disabled = false;
  }
}

async function loadDevices() {
  $("cameras").innerHTML = `<li class="empty-list">Loading cameras…</li>`;
  const response = await fetch(withToken(`${serverBase()}/rest/v4/devices`));
  const data = await readBody(response);
  if (!response.ok) throw new Error(errorText(data, response.status));
  const list = Array.isArray(data) ? data : data.items || data.devices || [];
  state.devices = list
    .filter((device) => device && device.id)
    .sort((a, b) => cameraRank(a) - cameraRank(b) || nameOf(a).localeCompare(nameOf(b)));
  renderCameras();
  if (!state.devices.length) setStatus("Signed in. No devices were returned. Paste a device id to play.");
}

function cameraRank(device) {
  const type = String(device.deviceType || device.type || "");
  return /camera|encoder/i.test(type) ? 0 : 1;
}

function nameOf(device) {
  return device.name || device.model || device.id;
}

function renderCameras() {
  const query = $("filter").value.trim().toLowerCase();
  const selected = $("device-id").value.trim();
  const matches = state.devices.filter((device) => {
    const haystack = `${nameOf(device)} ${device.id} ${device.mac || ""}`.toLowerCase();
    return !query || haystack.includes(query);
  });
  if (!state.token) {
    $("cameras").innerHTML = `<li class="empty-list">Sign in to load the site cameras.</li>`;
    return;
  }
  if (!matches.length) {
    $("cameras").innerHTML = `<li class="empty-list">No cameras match.</li>`;
    return;
  }
  $("cameras").replaceChildren(...matches.map((device) => {
    const item = document.createElement("li");
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.id = device.id;
    if (device.id === selected) button.setAttribute("aria-current", "true");
    const name = document.createElement("span");
    name.className = "cam-name";
    name.textContent = nameOf(device);
    const meta = document.createElement("span");
    meta.className = "cam-meta";
    meta.textContent = device.status || device.deviceType || "";
    button.append(name, meta);
    item.append(button);
    return item;
  }));
}

function withToken(url) {
  const next = new URL(url, serverBase());
  next.searchParams.set("_sessionToken", state.token);
  return next.toString();
}

function buildStreamUrl(deviceId, positionMs, limitMs) {
  const format = $("format").value;
  const path = format
    ? `/rest/v4/devices/${encodeURIComponent(deviceId)}/media.${format}`
    : `/rest/v4/devices/${encodeURIComponent(deviceId)}/media`;
  const url = new URL(serverBase() + path);

  setParam(url, "stream", $("stream").value);
  setParam(url, "resolution", $("resolution").value.trim());
  setParam(url, "quality", $("quality").value);
  setParam(url, "resolutionWhenTranscoding", $("resolution-when-transcoding").value.trim());
  setParam(url, "rotation", $("rotation").value);
  setParam(url, "aspectRatio", $("aspect-ratio").value.trim());
  setParam(url, "videoCodec", $("video-codec").value.trim());
  setParam(url, "zoom", $("zoom").value.trim());
  setParam(url, "dropLateFrames", $("drop-late-frames").value.trim());
  setParam(url, "dewarpingXangle", $("dewarping-x").value.trim());
  setParam(url, "dewarpingYangle", $("dewarping-y").value.trim());
  setParam(url, "dewarpingFov", $("dewarping-fov").value.trim());
  setParam(url, "dewarpingPanofactor", $("dewarping-panofactor").value);

  if (positionMs != null) {
    url.searchParams.set("positionMs", String(Math.round(positionMs)));
    const duration = limitMs != null ? limitMs : CONTINUOUS_MS;
    url.searchParams.set("durationMs", String(duration));
  }

  if ($("opt-realtime").checked) url.searchParams.set("realTimeOptimization", "true");
  if ($("opt-stand").checked) url.searchParams.set("standFrameDuration", "true");
  if ($("opt-accurate").checked) url.searchParams.set("accurateSeek", "true");
  if ($("opt-audio").checked) url.searchParams.set("audioOnly", "true");
  if ($("opt-panoramic").checked) url.searchParams.set("panoramic", "true");
  if ($("opt-dewarping").checked) url.searchParams.set("dewarping", "true");
  if ($("opt-signature").checked) url.searchParams.set("signature", "true");
  if ($("opt-utc").checked) url.searchParams.set("utcTimestamps", "true");
  if ($("opt-download").checked) url.searchParams.set("download", "true");
  if ($("opt-local").checked) url.searchParams.set("_local", "true");
  if ($("opt-strict").checked) url.searchParams.set("_strict", "true");

  url.searchParams.set("_sessionToken", state.token);
  return url.toString();
}

function setParam(url, name, value) {
  if (value !== "") url.searchParams.set(name, value);
}

function describePlayback(deviceId, positionMs) {
  const device = state.devices.find((item) => item.id === deviceId);
  const name = device ? nameOf(device) : deviceId;
  if (positionMs == null) return `${name} · live`;
  return `${name} · ${new Date(positionMs).toLocaleString()}`;
}

function archivePosition() {
  if ($("live").checked) return null;
  const position = $("position").value;
  if (!position) throw new Error("Choose an archive start, or switch back to live.");
  const positionMs = new Date(position).getTime();
  if (Number.isNaN(positionMs)) throw new Error("That start time is not valid.");
  return positionMs;
}

function requestedLimitMs() {
  const minutes = Number($("duration-min").value);
  if (minutes > 0) return Math.round(minutes * 60 * 1000);
  return null;
}

async function play() {
  const deviceId = $("device-id").value.trim();
  if (!deviceId) {
    setStatus("Choose a camera or paste a device id.");
    return;
  }
  if (!state.token || Date.now() > state.expiresAt - 15000) {
    if (!$("password").value) {
      setStatus("Sign in again. The session token is missing or about to expire.");
      return;
    }
    await connect();
    if (!state.token) return;
  }

  let positionMs;
  let limitMs;
  try {
    positionMs = archivePosition();
    limitMs = requestedLimitMs();
    buildStreamUrl(deviceId, positionMs, limitMs);
  } catch (error) {
    setStatus(error.message);
    return;
  }

  persist();
  playback.id += 1;
  releaseMedia();
  openAt(playback.id, deviceId, positionMs, limitMs, false);
}

function openAt(sessionId, deviceId, positionMs, limitMs, quiet) {
  if (sessionId !== playback.id) return;

  let url;
  try {
    url = buildStreamUrl(deviceId, positionMs, limitMs);
  } catch (error) {
    setStatus(error.message);
    return;
  }

  state.rawUrl = url;
  $("stream-url").value = url.replace(/(_sessionToken|_ticket)=[^&]+/g, "$1=•••");
  $("now").textContent = describePlayback(deviceId, positionMs);
  $("well").classList.add("playing");

  if ($("opt-download").checked) {
    window.open(url, "_blank", "noopener");
    setStatus("Download opened in a new tab.", true);
    return;
  }

  const format = $("format").value;
  $("video").hidden = format === "mpjpeg";
  $("mjpeg").hidden = format !== "mpjpeg";
  if (!quiet) setStatus("Opening the stream…", true);

  if (format === "mpjpeg") {
    const image = $("mjpeg");
    const started = performance.now();
    image.onload = () => setStatus("Playing.", true);
    image.onerror = () => {
      if (sessionId !== playback.id) return;
      const elapsed = performance.now() - started;
      if (limitMs == null && positionMs != null && elapsed > 1500) {
        openAt(sessionId, deviceId, Math.round(positionMs + elapsed), null, true);
        return;
      }
      setStatus("Motion JPEG did not start. Check the device id and that this user can view it.");
      $("well").classList.remove("playing");
    };
    image.src = url;
    return;
  }

  const video = $("video");
  video.controls = true;
  const attached = performance.now();
  video.onloadeddata = () => {
    if (sessionId !== playback.id) return;
    setStatus(limitMs == null && positionMs != null
      ? "Playing from the selected time. It keeps going until you stop it."
      : "Playing.", true);
  };
  video.onended = () => {
    if (sessionId !== playback.id) return;
    if (limitMs != null) {
      setStatus("Reached the end of the requested duration.");
      return;
    }
    const playedMs = video.currentTime * 1000;
    if (positionMs == null) {
      openAt(sessionId, deviceId, null, null, true);
      return;
    }
    if (!Number.isFinite(playedMs) || playedMs < 800) {
      setStatus("Playback reached the end of the available archive.");
      return;
    }
    openAt(sessionId, deviceId, Math.round(positionMs + playedMs), null, true);
  };
  video.onerror = () => {
    if (sessionId !== playback.id || performance.now() - attached < 400) return;
    const code = video.error ? video.error.code : 0;
    setStatus(code === 4
      ? "This browser cannot decode the stream. Try WebM, or Motion JPEG."
      : "The stream stopped before playback. Try secondary, WebM, and 480p.");
    $("well").classList.remove("playing");
  };
  video.src = url;
  video.play().catch(() => {});
}

function releaseMedia() {
  const video = $("video");
  video.onended = null;
  video.onerror = null;
  video.onloadeddata = null;
  video.pause();
  video.removeAttribute("src");
  video.load();
  const image = $("mjpeg");
  image.onload = null;
  image.onerror = null;
  image.removeAttribute("src");
  image.hidden = true;
}

function stop() {
  playback.id += 1;
  releaseMedia();
  $("well").classList.remove("playing");
  if ($("now").textContent !== "Idle") $("now").textContent = "Stopped";
}

async function copyUrl() {
  if (!state.rawUrl) {
    setStatus("Play a camera first. Copy includes the session token.");
    return;
  }
  try {
    await navigator.clipboard.writeText(state.rawUrl);
    setStatus("Stream address copied. It includes the session token.", true);
  } catch {
    $("stream-url").value = state.rawUrl;
    $("stream-url").select();
    setStatus("Clipboard is blocked. The full address is selected in the field.");
  }
}

async function readBody(response) {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { errorString: text.slice(0, 240) };
  }
}

function errorText(data, status) {
  const detail = data.errorString || data.error || data.message || "";
  if (status === 401) return "The server refused the username or password.";
  if (status === 403) return "This user cannot view that device.";
  return detail ? `${detail} (HTTP ${status})` : `The server returned HTTP ${status}.`;
}
