const elements = {
  scriptInput: document.querySelector("#scriptInput"),
  minutesInput: document.querySelector("#minutesInput"),
  secondsInput: document.querySelector("#secondsInput"),
  delayInput: document.querySelector("#delayInput"),
  modeInput: document.querySelector("#modeInput"),
  fontSizeInput: document.querySelector("#fontSizeInput"),
  startButton: document.querySelector("#startButton"),
  pauseButton: document.querySelector("#pauseButton"),
  resetButton: document.querySelector("#resetButton"),
  linkButton: document.querySelector("#linkButton"),
  copyButton: document.querySelector("#copyButton"),
  shareBox: document.querySelector("#shareBox"),
  shareLink: document.querySelector("#shareLink"),
  readerText: document.querySelector("#readerText"),
  progressBar: document.querySelector("#progressBar"),
  elapsedTime: document.querySelector("#elapsedTime"),
  totalTime: document.querySelector("#totalTime"),
  statusText: document.querySelector("#statusText"),
  countdown: document.querySelector("#countdown"),
};

const state = {
  tokens: [],
  tokenElements: [],
  durationMs: 120000,
  startedAt: 0,
  pausedAt: 0,
  elapsedBeforePause: 0,
  running: false,
  rafId: 0,
  countdownTimer: 0,
  lastActiveIndex: -1,
};

const storageKey = "narration-reader-state";

function encodePayload(payload) {
  const bytes = new TextEncoder().encode(JSON.stringify(payload));
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function decodePayload(value) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes));
}

function durationFromInputs() {
  const minutes = Math.max(0, Number(elements.minutesInput.value) || 0);
  const seconds = Math.min(59, Math.max(0, Number(elements.secondsInput.value) || 0));
  const total = (minutes * 60 + seconds) * 1000;
  return Math.max(1000, total);
}

function setDurationInputs(durationMs) {
  const totalSeconds = Math.round(durationMs / 1000);
  elements.minutesInput.value = Math.floor(totalSeconds / 60);
  elements.secondsInput.value = totalSeconds % 60;
}

function formatTime(ms) {
  const safeMs = Math.max(0, ms);
  const totalSeconds = Math.floor(safeMs / 1000);
  const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, "0");
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  const tenths = Math.floor((safeMs % 1000) / 100);
  return `${minutes}:${seconds}.${tenths}`;
}

function splitTokens(text, mode) {
  if (!text.trim()) {
    return ["请先输入文案。"];
  }

  if (mode === "line") {
    return text.split(/(\n+)/);
  }

  if (mode === "word") {
    return text.match(/[\p{Script=Han}]|[a-zA-Z0-9]+|[^\S\r\n]+|\n+|[^\p{Script=Han}a-zA-Z0-9\s]/gu) || [text];
  }

  return Array.from(text);
}

function renderText() {
  const text = elements.scriptInput.value;
  const mode = elements.modeInput.value;
  state.tokens = splitTokens(text, mode);
  elements.readerText.innerHTML = "";

  state.tokenElements = state.tokens.map((token) => {
    const span = document.createElement("span");
    span.textContent = token;
    span.className = "token";
    elements.readerText.append(span);
    return span;
  });

  applyProgress(currentElapsed());
  saveLocalState();
}

function currentElapsed() {
  if (state.running) {
    return performance.now() - state.startedAt + state.elapsedBeforePause;
  }
  return state.elapsedBeforePause;
}

function applyProgress(elapsedMs) {
  const clamped = Math.min(state.durationMs, Math.max(0, elapsedMs));
  const progress = state.durationMs > 0 ? clamped / state.durationMs : 0;
  const activeCount = Math.floor(progress * state.tokenElements.length);
  const activeIndex = Math.min(state.tokenElements.length - 1, activeCount);

  state.tokenElements.forEach((element, index) => {
    element.classList.toggle("is-read", index < activeCount);
    element.classList.toggle("is-active", index === activeIndex && progress < 1);
    element.classList.toggle("is-line-read", elements.modeInput.value === "line" && index < activeCount);
  });

  elements.progressBar.style.width = `${progress * 100}%`;
  elements.elapsedTime.textContent = formatTime(clamped);
  elements.totalTime.textContent = formatTime(state.durationMs);

  if (activeIndex !== state.lastActiveIndex && state.tokenElements[activeIndex]) {
    state.lastActiveIndex = activeIndex;
    state.tokenElements[activeIndex].scrollIntoView({ block: "center", inline: "nearest" });
  }

  if (progress >= 1) {
    elements.statusText.textContent = "已完成";
  }
}

function tick() {
  const elapsed = currentElapsed();
  applyProgress(elapsed);

  if (elapsed >= state.durationMs) {
    state.running = false;
    state.elapsedBeforePause = state.durationMs;
    state.rafId = 0;
    return;
  }

  state.rafId = requestAnimationFrame(tick);
}

function start() {
  window.clearInterval(state.countdownTimer);
  elements.countdown.hidden = true;
  state.durationMs = durationFromInputs();
  state.startedAt = performance.now();
  state.running = true;
  elements.statusText.textContent = "朗读中";
  saveLocalState();

  if (!state.rafId) {
    state.rafId = requestAnimationFrame(tick);
  }
}

function pause() {
  if (!state.running) {
    return;
  }

  state.elapsedBeforePause = Math.min(state.durationMs, currentElapsed());
  state.running = false;
  cancelAnimationFrame(state.rafId);
  state.rafId = 0;
  elements.statusText.textContent = "已暂停";
  saveLocalState();
}

function reset() {
  window.clearInterval(state.countdownTimer);
  cancelAnimationFrame(state.rafId);
  state.rafId = 0;
  state.running = false;
  state.elapsedBeforePause = 0;
  state.startedAt = 0;
  state.lastActiveIndex = -1;
  state.durationMs = durationFromInputs();
  elements.countdown.hidden = true;
  elements.statusText.textContent = "准备就绪";
  applyProgress(0);
  saveLocalState();
}

function generateShareLink() {
  pause();
  const delayMs = Number(elements.delayInput.value) * 1000;
  const payload = {
    text: elements.scriptInput.value,
    durationMs: durationFromInputs(),
    mode: elements.modeInput.value,
    fontSize: Number(elements.fontSizeInput.value),
    startAt: Date.now() + delayMs,
  };
  const url = new URL(window.location.href);
  url.search = `?data=${encodePayload(payload)}`;
  elements.shareLink.value = url.toString();
  elements.shareBox.hidden = false;
  elements.shareLink.select();
}

async function copyShareLink() {
  elements.shareLink.select();

  try {
    await navigator.clipboard.writeText(elements.shareLink.value);
    elements.copyButton.textContent = "已复制";
  } catch {
    document.execCommand("copy");
    elements.copyButton.textContent = "已复制";
  }

  window.setTimeout(() => {
    elements.copyButton.textContent = "复制";
  }, 1200);
}

function scheduleStart(startAt) {
  const updateCountdown = () => {
    const remaining = startAt - Date.now();

    if (remaining <= 0) {
      elements.countdown.hidden = true;
      state.elapsedBeforePause = Math.min(state.durationMs, Math.abs(remaining));
      start();
      return;
    }

    elements.countdown.hidden = false;
    elements.countdown.textContent = Math.ceil(remaining / 1000);
    elements.statusText.textContent = "等待同步开始";
  };

  window.clearInterval(state.countdownTimer);
  updateCountdown();
  state.countdownTimer = window.setInterval(updateCountdown, 100);
}

function saveLocalState() {
  const payload = {
    text: elements.scriptInput.value,
    durationMs: durationFromInputs(),
    mode: elements.modeInput.value,
    fontSize: Number(elements.fontSizeInput.value),
  };
  localStorage.setItem(storageKey, JSON.stringify(payload));
}

function loadFromLocalStorage() {
  const raw = localStorage.getItem(storageKey);
  if (!raw) {
    return false;
  }

  try {
    const payload = JSON.parse(raw);
    applyPayload(payload);
    return true;
  } catch {
    return false;
  }
}

function applyPayload(payload) {
  elements.scriptInput.value = payload.text || elements.scriptInput.value;
  state.durationMs = Number(payload.durationMs) || state.durationMs;
  setDurationInputs(state.durationMs);
  elements.modeInput.value = payload.mode || "char";
  elements.fontSizeInput.value = Number(payload.fontSize) || 42;
  document.documentElement.style.setProperty("--reader-size", `${elements.fontSizeInput.value}px`);
  renderText();
  applyProgress(0);

  if (payload.startAt) {
    scheduleStart(Number(payload.startAt));
  }
}

function loadFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const data = params.get("data");

  if (!data) {
    return false;
  }

  try {
    applyPayload(decodePayload(data));
    return true;
  } catch {
    elements.statusText.textContent = "同步链接无效";
    return false;
  }
}

function bindEvents() {
  elements.startButton.addEventListener("click", () => {
    if (state.elapsedBeforePause >= durationFromInputs()) {
      state.elapsedBeforePause = 0;
    }
    start();
  });
  elements.pauseButton.addEventListener("click", pause);
  elements.resetButton.addEventListener("click", reset);
  elements.linkButton.addEventListener("click", generateShareLink);
  elements.copyButton.addEventListener("click", copyShareLink);

  [elements.minutesInput, elements.secondsInput].forEach((input) => {
    input.addEventListener("input", () => {
      state.durationMs = durationFromInputs();
      applyProgress(currentElapsed());
      saveLocalState();
    });
  });

  elements.scriptInput.addEventListener("input", renderText);
  elements.modeInput.addEventListener("change", renderText);
  elements.fontSizeInput.addEventListener("input", () => {
    document.documentElement.style.setProperty("--reader-size", `${elements.fontSizeInput.value}px`);
    saveLocalState();
  });
}

bindEvents();

if (!loadFromUrl()) {
  loadFromLocalStorage();
}

state.durationMs = durationFromInputs();
renderText();
applyProgress(0);
