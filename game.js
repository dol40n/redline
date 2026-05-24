const app = document.querySelector("#app");
const coreButton = document.querySelector("#coreButton");
const modeBar = document.querySelector("#modeBar");
const topText = document.querySelector("#topText");
const targetText = document.querySelector("#targetText");
const calibrationText = document.querySelector("#calibrationText");
const resultPanel = document.querySelector("#resultPanel");
const resultTime = document.querySelector("#resultTime");
const resultRating = document.querySelector("#resultRating");
const resultOffset = document.querySelector("#resultOffset");
const finalPanel = document.querySelector("#finalPanel");
const finalSignal = document.querySelector("#finalSignal");
const statAverage = document.querySelector("#statAverage");
const statBest = document.querySelector("#statBest");
const statSync = document.querySelector("#statSync");
const statPattern = document.querySelector("#statPattern");
const menuButton = document.querySelector("#menuButton");
const flash = document.querySelector("#flash");
const livesBar = document.querySelector("#livesBar");
const recordBanner = document.querySelector("#recordBanner");
const roundHistory = document.querySelector("#roundHistory");
const rhythmGraph = document.querySelector("#rhythmGraph");
const realitySlip = document.querySelector("#realitySlip");

const TARGETS = [7, 9, 12, 14, 16, 9, 19, 11, 22, 13, 24, 10, 20, 15, 25];
const LOOP_TARGETS = [8, 18, 10, 21, 12, 24, 9, 20, 14, 23, 11, 25];
const PHASE = {
  START: "start",
  TARGET: "target",
  ROUND: "round",
  RESULT: "result",
  GAMEOVER: "gameover"
};

const game = {
  phase: PHASE.START,
  mode: "normal",
  round: 0,
  level: 1,
  target: TARGETS[0],
  roundStart: 0,
  misses: 0,
  hits: [],
  animationId: 0,
  nextTimer: 0,
  cueTimer: 0,
  pulseTimer: 0,
  twitchTimer: 0,
  slipTimer: 0,
  nextTwitchAt: 0,
  nextSlipAt: 0,
  falseCueTimer: 0,
  falseStartArmed: false,
  falseCueShown: false,
  syncStreak: 0,
  lastFakePulseAt: -999,
  fakeMoments: [],
  bias: "stable",
  lastPressure: 0
};

function levelPressure(level) {
  return Math.min(1, Math.pow(Math.max(0, level - 1) / 6, 0.72));
}

class RedlineAudio {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.humGain = null;
    this.humOsc = null;
    this.subOsc = null;
    this.subGain = null;
    this.droneOsc = null;
    this.droneOsc2 = null;
    this.droneGain = null;
    this.noiseSource = null;
    this.noiseGain = null;
    this.airFilter = null;
    this.airGain = null;
    this.filter = null;
    this.beating = false;
    this.level = 1;
    this.pressure = 0;
    this.bias = "stable";
    this.mode = "normal";
    this.beatTimer = 0;
    this.suspendTimer = 0;
  }

  async ensure() {
    if (this.ctx) {
      window.clearTimeout(this.suspendTimer);
      await this.ctx.resume();
      this.master.gain.setTargetAtTime(0.72, this.ctx.currentTime, 0.04);
      return;
    }

    const AudioContext = window.AudioContext || window.webkitAudioContext;
    this.ctx = new AudioContext();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.72;
    this.master.connect(this.ctx.destination);

    this.filter = this.ctx.createBiquadFilter();
    this.filter.type = "lowpass";
    this.filter.frequency.value = 420;
    this.filter.Q.value = 0.8;
    this.filter.connect(this.master);

    this.humGain = this.ctx.createGain();
    this.humGain.gain.value = 0.025;
    this.humGain.connect(this.filter);

    this.humOsc = this.ctx.createOscillator();
    this.humOsc.type = "sine";
    this.humOsc.frequency.value = 44;
    this.humOsc.connect(this.humGain);
    this.humOsc.start();

    this.subGain = this.ctx.createGain();
    this.subGain.gain.value = 0.012;
    this.subGain.connect(this.filter);

    this.subOsc = this.ctx.createOscillator();
    this.subOsc.type = "triangle";
    this.subOsc.frequency.value = 31;
    this.subOsc.connect(this.subGain);
    this.subOsc.start();

    this.droneGain = this.ctx.createGain();
    this.droneGain.gain.value = 0;
    this.droneGain.connect(this.master);

    this.droneOsc = this.ctx.createOscillator();
    this.droneOsc.type = "sawtooth";
    this.droneOsc.frequency.value = 18;
    this.droneOsc.connect(this.droneGain);
    this.droneOsc.start();

    this.droneOsc2 = this.ctx.createOscillator();
    this.droneOsc2.type = "sine";
    this.droneOsc2.frequency.value = 57;
    this.droneOsc2.detune.value = -9;
    this.droneOsc2.connect(this.droneGain);
    this.droneOsc2.start();

    this.noiseGain = this.ctx.createGain();
    this.noiseGain.gain.value = 0;
    this.noiseGain.connect(this.filter);
    this.noiseSource = this.createNoise();
    this.noiseSource.connect(this.noiseGain);

    this.airFilter = this.ctx.createBiquadFilter();
    this.airFilter.type = "highpass";
    this.airFilter.frequency.value = 1700;
    this.airFilter.Q.value = 0.7;

    this.airGain = this.ctx.createGain();
    this.airGain.gain.value = 0;
    this.airGain.connect(this.master);
    this.noiseSource.connect(this.airFilter);
    this.airFilter.connect(this.airGain);
    this.noiseSource.start();

    await this.ctx.resume();
  }

  createNoise() {
    const bufferSize = this.ctx.sampleRate * 2;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let index = 0; index < bufferSize; index += 1) {
      data[index] = (Math.random() * 2 - 1) * 0.22;
    }
    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    return source;
  }

  setRound({ level, pressure, bias, mode }) {
    if (!this.ctx) return;
    this.level = level;
    this.pressure = pressure;
    this.bias = bias;
    this.mode = mode;

    const now = this.ctx.currentTime;
    const tension = levelPressure(level);
    const modeBoost = mode === "do-not-try" ? 0.22 : 0;
    const hum = level === 10 ? 0.004 : 0.018 + level * 0.007 + tension * 0.034 + pressure * 0.066 + modeBoost * 0.05;
    const noise = level >= 4 && level < 10 ? (level - 3) * 0.014 + tension * 0.036 + pressure * 0.074 + modeBoost * 0.06 : level >= 3 || mode === "do-not-try" ? pressure * 0.022 + modeBoost * 0.02 : 0;
    const sub = level >= 9 ? 0.084 + pressure * 0.064 : 0.014 + level * 0.005 + tension * 0.026 + modeBoost * 0.035;
    const atmosphere = Math.min(1, 0.14 + tension * 0.62 + pressure * 0.52 + modeBoost);
    const drone = level === 10 ? 0.012 : 0.008 + atmosphere * 0.042;
    const air = level >= 2 || mode === "do-not-try" ? atmosphere * 0.014 + pressure * 0.01 : 0;

    this.humGain.gain.setTargetAtTime(hum, now, 0.15);
    this.noiseGain.gain.setTargetAtTime(noise, now, 0.15);
    this.subGain.gain.setTargetAtTime(sub, now, 0.18);
    this.droneGain.gain.setTargetAtTime(drone, now, 0.24);
    this.airGain.gain.setTargetAtTime(air, now, 0.22);
    this.filter.frequency.setTargetAtTime(210 + pressure * 1280 + level * 38 + modeBoost * 420, now, 0.22);
    this.droneOsc.frequency.setTargetAtTime(17 + pressure * 5 + tension * 2, now, 0.35);
    this.droneOsc2.frequency.setTargetAtTime(50 + level * 1.4 + pressure * 8, now, 0.35);
    this.airFilter.frequency.setTargetAtTime(1400 + pressure * 1800, now, 0.25);

    if (!this.beating && level >= 2) {
      this.beating = true;
      this.scheduleBeat(80);
    }
    if (level === 1) {
      this.stopBeat();
    }
  }

  stopBeat() {
    this.beating = false;
    window.clearTimeout(this.beatTimer);
  }

  shutdown() {
    this.stopBeat();
    if (!this.ctx) return;
    window.clearTimeout(this.suspendTimer);

    const now = this.ctx.currentTime;
    [this.humGain, this.noiseGain, this.subGain, this.droneGain, this.airGain, this.master].forEach((gainNode) => {
      if (!gainNode) return;
      gainNode.gain.cancelScheduledValues(now);
      gainNode.gain.setValueAtTime(0, now);
    });

    this.suspendTimer = window.setTimeout(() => {
      if (this.ctx && this.ctx.state !== "closed") {
        this.ctx.suspend().catch(() => {});
      }
    }, 120);
  }

  startMenu(mode = "normal") {
    if (!this.ctx) return;
    window.clearTimeout(this.suspendTimer);
    this.level = 3;
    this.pressure = 0.24;
    this.bias = "stable";
    this.mode = mode;

    const now = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setTargetAtTime(0.58, now, 0.08);
    this.humGain.gain.setTargetAtTime(0.034, now, 0.18);
    this.subGain.gain.setTargetAtTime(0.028, now, 0.18);
    this.droneGain.gain.setTargetAtTime(0.022, now, 0.22);
    this.airGain.gain.setTargetAtTime(0.004, now, 0.28);
    this.noiseGain.gain.setTargetAtTime(0.004, now, 0.22);
    this.filter.frequency.setTargetAtTime(310, now, 0.3);

    if (!this.beating) {
      this.beating = true;
      this.scheduleBeat(560);
    }
  }

  scheduleBeat(delay) {
    window.clearTimeout(this.beatTimer);
    this.beatTimer = window.setTimeout(() => {
      if (!this.beating || !this.ctx) return;
      this.heartbeat();
      this.scheduleBeat(this.nextBeatDelay());
    }, delay);
  }

  nextBeatDelay() {
    const levelFactor = Math.max(0, this.level - 2);
    const pressureFactor = this.pressure * 310;
    const latePush = this.bias === "late" ? -115 : 0;
    const earlyDrag = this.bias === "early" ? 180 : 0;
    const base = 1040 - levelFactor * 76 - pressureFactor + latePush + earlyDrag;
    const unstable = this.level >= 3 ? (Math.random() - 0.5) * (130 + this.level * 48) : 0;
    const silenceTrap = this.level >= 4 && Math.random() < 0.17 + this.level * 0.012 ? 210 + Math.random() * 720 : 0;
    return Math.max(260, base + unstable + silenceTrap);
  }

  heartbeat(fake = false) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const strength = fake ? 0.28 : 0.27 + this.pressure * 0.43 + this.level * 0.026;
    pulseScreen(fake);
    this.thump(now, 71, strength, 0.09);
    this.thump(now + 0.12, 48, strength * 0.55, 0.13);
  }

  startCue(level) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const gain = this.ctx.createGain();
    const filter = this.ctx.createBiquadFilter();
    const osc = this.ctx.createOscillator();

    filter.type = "bandpass";
    filter.frequency.value = 740 + level * 28;
    filter.Q.value = 8;
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.22, now + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
    osc.type = "square";
    osc.frequency.setValueAtTime(92 + level * 2, now);
    osc.frequency.exponentialRampToValueAtTime(44, now + 0.11);
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    osc.start(now);
    osc.stop(now + 0.18);

    this.thump(now + 0.025, 62, 0.16 + level * 0.01, 0.08);
  }

  falseCue() {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    this.thump(now, 58, 0.11, 0.07);
    this.glitch(0.08, 0.08);
  }

  stabilize() {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.12, now + 0.018);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.55);
    gain.connect(this.master);

    [147, 294, 441].forEach((frequency, index) => {
      const osc = this.ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = frequency;
      osc.connect(gain);
      osc.start(now + index * 0.018);
      osc.stop(now + 0.58);
    });
  }

  thump(start, frequency, gainValue, duration) {
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(frequency, start);
    osc.frequency.exponentialRampToValueAtTime(Math.max(22, frequency * 0.66), start + duration);
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(gainValue, start + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.001, start + duration);
    osc.connect(gain);
    gain.connect(this.master);
    osc.start(start);
    osc.stop(start + duration + 0.04);
  }

  result(rating) {
    if (!this.ctx) return;
    if (rating === "perfect") this.cleanHit();
    if (rating === "good") this.softPulse();
    if (rating === "bad") this.glitch(0.18, 0.15);
    if (rating === "miss") this.glitch(0.42, 0.28);
  }

  cleanHit() {
    const now = this.ctx.currentTime;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.17, now + 0.016);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.74);
    gain.connect(this.master);

    [196, 392, 588].forEach((frequency, index) => {
      const osc = this.ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = frequency;
      osc.connect(gain);
      osc.start(now + index * 0.014);
      osc.stop(now + 0.78);
    });
  }

  softPulse() {
    this.heartbeat(true);
  }

  glitch(amount, duration) {
    const now = this.ctx.currentTime;
    const source = this.createNoise();
    const gain = this.ctx.createGain();
    const filter = this.ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = 950;
    filter.Q.value = 2.8;
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(amount, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    source.start(now);
    source.stop(now + duration + 0.04);
  }
}

const audio = new RedlineAudio();

function loadRecords() {
  try { return JSON.parse(localStorage.getItem("redline") || "{}"); }
  catch { return {}; }
}

function saveRecords(data) {
  try { localStorage.setItem("redline", JSON.stringify(data)); }
  catch {}
}

function updateLivesBar() {
  livesBar.innerHTML = Array.from({ length: 3 }, (_, i) =>
    `<span class="life${i >= 3 - game.misses ? " life-lost" : ""}"></span>`
  ).join("");
}

function buildRoundHistory() {
  roundHistory.innerHTML = game.hits.map((hit, i) => {
    if (hit.falseStart) {
      return `<div class="history-row" data-rating="miss"><span class="hr-num">${i + 1}</span><span class="hr-target">${hit.target}s</span><span class="hr-delta">FALSE</span><span class="hr-rating">FALSE START</span></div>`;
    }
    const sign = hit.delta >= 0 ? "+" : "";
    return `<div class="history-row" data-rating="${hit.rating}"><span class="hr-num">${i + 1}</span><span class="hr-target">${hit.target}s</span><span class="hr-delta">${sign}${hit.delta.toFixed(3)}</span><span class="hr-rating">${hit.rating.toUpperCase()}</span></div>`;
  }).join("");
}

function buildRhythmGraph() {
  if (!game.hits.length) {
    rhythmGraph.innerHTML = "";
    return;
  }

  const dots = game.hits.map((hit, index) => {
    const bounded = Math.max(-0.9, Math.min(0.9, hit.delta));
    const left = hit.falseStart ? 4 : 50 + (bounded / 0.9) * 42;
    const label = hit.falseStart ? "FALSE" : `${hit.delta >= 0 ? "+" : ""}${hit.delta.toFixed(3)}`;
    return `<span class="rhythm-dot" data-rating="${hit.falseStart ? "miss" : hit.rating}" style="left:${left.toFixed(2)}%" title="${index + 1}: ${label}"></span>`;
  }).join("");

  rhythmGraph.innerHTML = `
    <div class="rhythm-axis"></div>
    <div class="rhythm-label rhythm-early">EARLY</div>
    <div class="rhythm-label rhythm-late">LATE</div>
    ${dots}
  `;
}

function getSystemDiagnosis({ hits, average, signedAverage }) {
  const falseStarts = hits.filter((hit) => hit.falseStart).length;
  const trustedFalse = hits.filter((hit) => hit.trustedFalsePulse).length;
  const early = hits.filter((hit) => hit.delta < -0.18).length;
  const late = hits.filter((hit) => hit.delta > 0.18).length;
  const misses = hits.filter((hit) => hit.rating === "miss").length;
  const best = hits.filter((hit) => !hit.falseStart).reduce((winner, hit) => {
    if (!winner) return hit;
    return Math.abs(hit.delta) < Math.abs(winner.delta) ? hit : winner;
  }, null);
  const firstCollapse = hits.find((hit) => Math.abs(hit.delta) > 0.42);

  if (falseStarts >= 2) return "YOU PANIC BEFORE THE SIGNAL";
  if (trustedFalse > 0) return "YOU TRUSTED THE FALSE PULSE";
  if (early >= Math.max(2, late + 1)) return "YOU MOVE BEFORE THE SYSTEM BREATHES";
  if (late >= Math.max(2, early + 1)) return "YOU WAIT UNTIL CONTROL HAS LEFT";
  if (firstCollapse && firstCollapse.target >= 7) return `YOUR RHYTHM COLLAPSED AFTER ${firstCollapse.target} SECONDS`;
  if (best && Math.abs(best.delta) <= 0.05 && misses <= 1) return `SYSTEM BRIEFLY SYNCHRONIZED AT ${best.elapsed.toFixed(3)}`;
  if (average < 0.18 && Math.abs(signedAverage) < 0.08) return "THE SYSTEM COULD ALMOST FOLLOW YOU";
  return "SYSTEM COULD NOT STABILIZE YOU";
}

function checkRecords(sync, average) {
  const rec = loadRecords();
  const hasSync = Number.isFinite(rec.bestSync);
  const hasAccuracy = Number.isFinite(rec.bestAccuracy);
  const isNewSync = !hasSync || sync > rec.bestSync;
  const isNewAcc = !hasAccuracy || average < rec.bestAccuracy;
  if (isNewSync) rec.bestSync = sync;
  if (isNewAcc) rec.bestAccuracy = average;
  if (isNewSync || isNewAcc) saveRecords(rec);
  const syncLabel = isNewSync ? `★ BEST SYNC ${Math.round(sync)}%` : `BEST SYNC ${Math.round(rec.bestSync)}%`;
  const accLabel = isNewAcc ? `★ BEST ACCURACY ${average.toFixed(3)}` : `BEST ACCURACY ${(rec.bestAccuracy).toFixed(3)}`;
  recordBanner.textContent = `${syncLabel}  ·  ${accLabel}`;
  recordBanner.hidden = false;
}

function setPhase(phase) {
  game.phase = phase;
  app.dataset.phase = phase;
}

function setLevel(level) {
  game.level = level;
  app.dataset.level = String(level);
  app.style.setProperty("--level-pressure", levelPressure(level).toFixed(3));
  for (let value = 1; value <= 10; value += 1) {
    app.classList.toggle(`level-${value}`, value === level);
  }
}

function resetVisuals() {
  app.classList.remove("is-fake", "broken", "shake", "clean", "glitch", "round-cue", "heartbeat-pulse", "fake-heartbeat", "micro-twitch", "false-cue", "stabilized");
  app.dataset.rating = "none";
  app.style.setProperty("--pressure", "0");
  app.style.setProperty("--drift-x", "0px");
  app.style.setProperty("--drift-y", "0px");
  app.style.setProperty("--button-scale", "1");
  app.style.setProperty("--button-opacity", "1");
  app.style.setProperty("--noise-opacity", "0");
  app.style.setProperty("--line-opacity", "0");
  app.style.setProperty("--breath-scale", "1");
  app.style.setProperty("--void-shift", "0px");
  realitySlip.classList.remove("is-visible");
  realitySlip.style.removeProperty("--slip-x");
  realitySlip.style.removeProperty("--slip-y");
}

function pulseScreen(fake = false) {
  if (game.phase !== PHASE.ROUND && game.phase !== PHASE.START) return;
  window.clearTimeout(game.pulseTimer);
  app.classList.toggle("fake-heartbeat", fake);
  app.classList.add("heartbeat-pulse");
  game.pulseTimer = window.setTimeout(() => {
    app.classList.remove("heartbeat-pulse", "fake-heartbeat");
  }, fake ? 190 : 250);
}

function triggerMicroTwitch(duration = 110) {
  window.clearTimeout(game.twitchTimer);
  app.classList.add("micro-twitch");
  game.twitchTimer = window.setTimeout(() => {
    app.classList.remove("micro-twitch");
  }, duration);
}

function triggerRealitySlip(duration = 170) {
  const angle = Math.random() * Math.PI * 2;
  const radius = 70 + Math.random() * 120;
  realitySlip.style.setProperty("--slip-x", `${Math.cos(angle) * radius}px`);
  realitySlip.style.setProperty("--slip-y", `${Math.sin(angle) * radius}px`);
  realitySlip.classList.add("is-visible");
  window.clearTimeout(game.slipTimer);
  game.slipTimer = window.setTimeout(() => {
    realitySlip.classList.remove("is-visible");
  }, duration);
}

function showCalibrationThenStart() {
  let seen = false;
  try {
    seen = localStorage.getItem("redlineCalibrationSeen") === "1";
  } catch {}
  if (seen) {
    showTarget();
    return;
  }

  try {
    localStorage.setItem("redlineCalibrationSeen", "1");
  } catch {}
  setPhase(PHASE.TARGET);
  calibrationText.textContent = "DO NOT COUNT OUT LOUD";
  calibrationText.hidden = false;
  game.nextTimer = window.setTimeout(() => {
    calibrationText.textContent = "THE SYSTEM WILL ADAPT";
  }, 900);
  game.cueTimer = window.setTimeout(() => {
    calibrationText.hidden = true;
    calibrationText.textContent = "";
    showTarget();
  }, 1850);
}

function targetForRound(round) {
  if (round < TARGETS.length) return TARGETS[round];
  return LOOP_TARGETS[(round - TARGETS.length) % LOOP_TARGETS.length];
}

function updateBias() {
  const recent = game.hits.slice(-4);
  if (recent.length < 2) {
    game.bias = "stable";
    return;
  }
  const average = recent.reduce((sum, hit) => sum + hit.delta, 0) / recent.length;
  if (average < -0.12) game.bias = "early";
  else if (average > 0.12) game.bias = "late";
  else game.bias = "stable";
}

function prepareFakeMoments() {
  if (game.level < 4 && game.mode !== "do-not-try") {
    game.fakeMoments = [];
    return;
  }

  const count = Math.min(8, game.level - (game.mode === "do-not-try" ? 0 : 2));
  const safeTarget = Math.max(3.2, game.target);
  game.fakeMoments = Array.from({ length: count }, (_, index) => {
    const spread = 0.28 + index * (0.46 / count);
    const jitter = (Math.random() - 0.5) * 0.9;
    return Math.min(safeTarget - 1.05, Math.max(1.35, safeTarget * spread + jitter));
  });
}

async function startGame() {
  await audio.ensure();
  window.clearTimeout(game.nextTimer);
  window.clearTimeout(game.cueTimer);
  window.clearTimeout(game.falseCueTimer);
  window.clearTimeout(game.slipTimer);
  game.round = 0;
  game.misses = 0;
  game.hits = [];
  game.syncStreak = 0;
  game.bias = "stable";
  game.falseStartArmed = false;
  game.falseCueShown = false;
  game.lastFakePulseAt = -999;
  game.target = targetForRound(0);
  app.classList.toggle("do-not-try", game.mode === "do-not-try");
  finalPanel.hidden = true;
  resultPanel.hidden = true;
  topText.textContent = "";
  calibrationText.hidden = true;
  calibrationText.textContent = "";
  resetVisuals();
  updateLivesBar();
  showCalibrationThenStart();
}

function showTarget() {
  window.cancelAnimationFrame(game.animationId);
  window.clearTimeout(game.nextTimer);
  window.clearTimeout(game.cueTimer);
  window.clearTimeout(game.falseCueTimer);
  window.clearTimeout(game.slipTimer);
  resetVisuals();
  updateBias();
  game.falseStartArmed = false;
  game.falseCueShown = false;
  game.lastFakePulseAt = -999;
  game.target = targetForRound(game.round);
  setLevel(Math.min(10, Math.ceil((game.round + 1) * (10 / TARGETS.length))));
  prepareFakeMoments();
  setPhase(PHASE.TARGET);
  resultPanel.hidden = true;
  finalPanel.hidden = true;
  targetText.textContent = `TARGET: ${game.target} SECONDS`;

  const targetHold = 720 + Math.floor(Math.random() * 160);
  const blankWait = 520 + Math.floor(Math.random() * 420);
  const shouldFalseCue = game.level >= 2 || game.mode === "do-not-try" || Math.random() < 0.25;

  game.cueTimer = window.setTimeout(() => {
    targetText.textContent = "";
    game.falseStartArmed = true;
    if (shouldFalseCue) {
      const falseDelay = Math.max(90, Math.min(blankWait - 120, 130 + Math.random() * 360));
      game.falseCueTimer = window.setTimeout(triggerFalseCue, falseDelay);
    }
  }, targetHold);

  game.nextTimer = window.setTimeout(() => {
    game.falseStartArmed = false;
    app.classList.remove("false-cue");
    startRound();
  }, targetHold + blankWait);
}

function abortToStart() {
  window.cancelAnimationFrame(game.animationId);
  window.clearTimeout(game.nextTimer);
  window.clearTimeout(game.cueTimer);
  window.clearTimeout(game.pulseTimer);
  window.clearTimeout(game.twitchTimer);
  window.clearTimeout(game.falseCueTimer);
  window.clearTimeout(game.slipTimer);
  audio.shutdown();

  game.round = 0;
  game.misses = 0;
  game.hits = [];
  game.syncStreak = 0;
  game.bias = "stable";
  game.falseStartArmed = false;
  game.falseCueShown = false;
  game.target = targetForRound(0);
  targetText.textContent = "";
  calibrationText.hidden = true;
  calibrationText.textContent = "";
  topText.textContent = "PRESS START";
  resultPanel.hidden = true;
  finalPanel.hidden = true;
  recordBanner.hidden = true;
  roundHistory.innerHTML = "";
  rhythmGraph.innerHTML = "";
  setLevel(1);
  resetVisuals();
  setPhase(PHASE.START);
}

async function returnToMainMenu() {
  window.cancelAnimationFrame(game.animationId);
  window.clearTimeout(game.nextTimer);
  window.clearTimeout(game.cueTimer);
  window.clearTimeout(game.pulseTimer);
  window.clearTimeout(game.twitchTimer);
  window.clearTimeout(game.falseCueTimer);
  window.clearTimeout(game.slipTimer);

  game.round = 0;
  game.misses = 0;
  game.hits = [];
  game.syncStreak = 0;
  game.bias = "stable";
  game.falseStartArmed = false;
  game.falseCueShown = false;
  game.target = targetForRound(0);
  targetText.textContent = "";
  calibrationText.hidden = true;
  calibrationText.textContent = "";
  topText.textContent = "PRESS START";
  resultPanel.hidden = true;
  finalPanel.hidden = true;
  recordBanner.hidden = true;
  roundHistory.innerHTML = "";
  rhythmGraph.innerHTML = "";
  app.classList.toggle("do-not-try", game.mode === "do-not-try");
  setLevel(1);
  resetVisuals();
  setPhase(PHASE.START);
  await audio.ensure();
  audio.startMenu(game.mode);
}

function triggerFalseCue() {
  if (game.phase !== PHASE.TARGET || !game.falseStartArmed) return;
  game.falseCueShown = true;
  app.classList.add("false-cue");
  flash.classList.remove("is-lit", "is-red", "is-cue");
  void flash.offsetWidth;
  flash.classList.add("is-red");
  audio.falseCue();
  pulseScreen(true);
  window.setTimeout(() => {
    app.classList.remove("false-cue");
    flash.classList.remove("is-red");
  }, 220);
}

function falseStart() {
  if (game.phase !== PHASE.TARGET || !game.falseStartArmed) return;
  window.clearTimeout(game.nextTimer);
  window.clearTimeout(game.cueTimer);
  window.clearTimeout(game.falseCueTimer);
  app.classList.remove("false-cue", "heartbeat-pulse", "fake-heartbeat");
  targetText.textContent = "";
  game.falseStartArmed = false;
  game.syncStreak = 0;
  game.misses += 1;
  game.hits.push({
    elapsed: 0,
    target: game.target,
    delta: -game.target,
    rating: "miss",
    level: game.level,
    falseStart: true,
    trustedFalsePulse: game.falseCueShown
  });
  updateLivesBar();
  showResult({
    elapsed: 0,
    delta: -game.target,
    direction: "BEFORE SIGNAL",
    rating: "miss",
    label: "FALSE START"
  });
}

function startRound() {
  setPhase(PHASE.ROUND);
  game.roundStart = performance.now();
  game.lastPressure = 0;
  game.nextTwitchAt = 1.4 + Math.random() * 1.8;
  game.nextSlipAt = game.level >= 5 || game.mode === "do-not-try" ? 1.1 + Math.random() * 1.7 : 999;
  game.falseStartArmed = false;
  app.classList.remove("false-cue");
  audio.setRound({ level: game.level, pressure: 0, bias: game.bias, mode: game.mode });
  triggerStartCue();
  animateRound();
}

function triggerStartCue() {
  app.classList.add("round-cue");
  targetText.textContent = "START";
  flash.classList.remove("is-lit", "is-red", "is-cue");
  void flash.offsetWidth;
  flash.classList.add("is-cue");
  audio.startCue(game.level);
  window.clearTimeout(game.cueTimer);
  game.cueTimer = window.setTimeout(() => {
    app.classList.remove("round-cue");
    targetText.textContent = "";
    flash.classList.remove("is-cue");
  }, 340);
}

function animateRound(now = performance.now()) {
  if (game.phase !== PHASE.ROUND) return;

  const elapsed = (now - game.roundStart) / 1000;
  const progress = Math.min(1.65, elapsed / game.target);
  const levelTension = levelPressure(game.level);
  const modeTension = game.mode === "do-not-try" ? 0.24 : 0;
  const pressureCurve = Math.pow(progress, 0.72);
  const pressure = Math.min(1, pressureCurve * (0.66 + game.level * 0.108 + modeTension * 0.38) + levelTension * 0.28 + modeTension);
  const previousPressure = game.lastPressure;
  game.lastPressure = pressure;

  const intensity = pressure;
  const noise = game.level >= 4 && game.level < 10 ? 0.05 + levelTension * 0.13 + intensity * 0.24 + modeTension * 0.18 : game.level >= 3 || game.mode === "do-not-try" ? intensity * 0.05 + modeTension * 0.08 : 0;
  const lines = game.level >= 4 && game.level < 10 ? 0.045 + levelTension * 0.12 + intensity * 0.2 + modeTension * 0.14 : game.level >= 3 || game.mode === "do-not-try" ? intensity * 0.04 + modeTension * 0.06 : 0;
  const pulseSpeed = game.bias === "early" ? 3.0 : game.bias === "late" ? 1.55 : 2.45;

  app.style.setProperty("--pressure", pressure.toFixed(3));
  app.style.setProperty("--pulse-speed", `${Math.max(0.72, pulseSpeed - game.level * 0.116 - pressure * 0.32 - modeTension * 0.54)}s`);
  app.style.setProperty("--noise-opacity", noise.toFixed(3));
  app.style.setProperty("--line-opacity", lines.toFixed(3));

  const driftX = game.level >= 3 ? Math.sin(elapsed * 0.82) * (game.level - 2) * 17 + Math.sin(elapsed * 0.29) * 34 + Math.sin(elapsed * 1.7) * levelTension * 10 : 0;
  const driftY = game.level >= 3 ? Math.cos(elapsed * 0.74) * (game.level - 2) * 12 + Math.sin(elapsed * 0.39) * 24 + Math.cos(elapsed * 1.45) * levelTension * 8 : 0;
  const earlyScale = game.level >= 3 ? Math.sin(elapsed * 1.16) * levelTension * 0.08 : 0;
  const levelSevenScale = game.level >= 7 ? 1 + Math.sin(elapsed * 2.6) * 0.3 + Math.sin(elapsed * 0.92) * 0.15 : 1 + earlyScale;
  const breathScale = game.level >= 5 ? 1 + Math.sin(elapsed * 1.24) * (0.018 + levelTension * 0.04) : 1;
  const vanish = game.level >= 7 && Math.sin(elapsed * (6.2 + levelTension)) > 0.95 ? 0.02 : 1;

  app.style.setProperty("--drift-x", `${driftX.toFixed(2)}px`);
  app.style.setProperty("--drift-y", `${driftY.toFixed(2)}px`);
  app.style.setProperty("--button-scale", levelSevenScale.toFixed(3));
  app.style.setProperty("--button-opacity", vanish.toFixed(2));
  app.style.setProperty("--breath-scale", breathScale.toFixed(4));
  app.style.setProperty("--void-shift", `${(Math.sin(elapsed * 0.37) * (2 + levelTension * 5) + pressure * 3).toFixed(2)}px`);

  const fakeActive = game.fakeMoments.some((moment) => Math.abs(moment - elapsed) < 0.2);
  app.classList.toggle("is-fake", fakeActive);
  if (fakeActive && Math.random() < 0.32) {
    game.lastFakePulseAt = elapsed;
    audio.heartbeat(true);
  }

  if (elapsed > game.nextTwitchAt && game.level >= 2) {
    triggerMicroTwitch(game.mode === "do-not-try" ? 150 : 105);
    const nextGap = Math.max(0.55, 2.6 - levelTension * 1.5 - pressure * 0.8 - (game.mode === "do-not-try" ? 0.7 : 0));
    game.nextTwitchAt = elapsed + nextGap + Math.random() * 1.2;
  }

  if (elapsed > game.nextSlipAt && (game.level >= 5 || game.mode === "do-not-try")) {
    triggerRealitySlip(game.mode === "do-not-try" ? 220 : 170);
    const slipGap = Math.max(0.7, 3.1 - levelTension * 1.2 - (game.mode === "do-not-try" ? 1.0 : 0));
    game.nextSlipAt = elapsed + slipGap + Math.random() * 1.8;
  }

  if (Math.abs(pressure - previousPressure) > 0.05) {
    audio.setRound({ level: game.level, pressure, bias: game.bias, mode: game.mode });
  } else if (Math.random() < 0.01) {
    audio.setRound({ level: game.level, pressure, bias: game.bias, mode: game.mode });
  }

  game.animationId = window.requestAnimationFrame(animateRound);
}

function windowsForMode() {
  if (game.mode === "do-not-try") {
    return { perfect: 0.025, good: 0.075, bad: 0.18 };
  }
  if (game.mode === "hardcore") {
    return { perfect: 0.03, good: 0.09, bad: 0.22 };
  }
  return { perfect: 0.05, good: 0.16, bad: 0.42 };
}

function classify(delta) {
  const absolute = Math.abs(delta);
  const windows = windowsForMode();
  if (absolute <= windows.perfect) return "perfect";
  if (absolute <= windows.good) return "good";
  if (absolute <= windows.bad) return "bad";
  return "miss";
}

function hitButton() {
  if (game.phase !== PHASE.ROUND) return;
  const elapsed = (performance.now() - game.roundStart) / 1000;
  const delta = elapsed - game.target;
  const rating = classify(delta);
  const direction = Math.abs(delta) <= windowsForMode().perfect ? "SYNC" : delta < 0 ? "EARLY" : "LATE";
  const trustedFalsePulse = elapsed < game.target - 0.45 && Math.abs(elapsed - game.lastFakePulseAt) < 0.7;

  window.cancelAnimationFrame(game.animationId);
  window.clearTimeout(game.cueTimer);
  window.clearTimeout(game.pulseTimer);
  window.clearTimeout(game.twitchTimer);
  window.clearTimeout(game.slipTimer);
  app.classList.remove("round-cue", "heartbeat-pulse", "fake-heartbeat", "micro-twitch");
  realitySlip.classList.remove("is-visible");
  targetText.textContent = "";
  audio.stopBeat();
  if (rating === "perfect" || rating === "good") game.syncStreak += 1;
  else game.syncStreak = 0;
  game.hits.push({ elapsed, target: game.target, delta, rating, level: game.level, trustedFalsePulse });
  if (rating === "miss") game.misses += 1;
  updateLivesBar();
  showResult({ elapsed, delta, direction, rating });
}

function showResult({ elapsed, delta, direction, rating, label }) {
  setPhase(PHASE.RESULT);
  app.dataset.rating = rating;
  resultPanel.hidden = false;
  resultTime.textContent = elapsed.toFixed(3);
  resultRating.textContent = label || rating.toUpperCase();
  resultOffset.textContent = `${delta >= 0 ? "+" : ""}${delta.toFixed(3)} ${direction}`;

  flash.classList.remove("is-lit", "is-red", "is-cue");
  void flash.offsetWidth;

  if (rating === "perfect") {
    app.classList.add("clean");
    flash.classList.add("is-lit");
  } else if (rating === "good") {
    flash.classList.add("is-red");
  } else if (rating === "bad") {
    app.classList.add("glitch");
    flash.classList.add("is-red");
  } else {
    app.classList.add("shake", "broken");
    flash.classList.add("is-red");
  }

  if ((rating === "perfect" || rating === "good") && game.syncStreak >= 2) {
    app.classList.add("stabilized");
    resultOffset.textContent = "SYSTEM STABILIZED";
    audio.stabilize();
  }

  audio.result(rating);

  game.nextTimer = window.setTimeout(() => {
    if (game.misses >= 3) {
      endGame();
    } else {
      game.round += 1;
      showTarget();
    }
  }, rating === "perfect" ? 2100 : 2500);
}

function endGame() {
  setPhase(PHASE.GAMEOVER);
  audio.shutdown();
  resultPanel.hidden = true;
  finalPanel.hidden = false;
  topText.textContent = "";

  const hits = game.hits;
  const average = hits.length ? hits.reduce((sum, hit) => sum + Math.abs(hit.delta), 0) / hits.length : 0;
  const scoredHits = hits.filter((hit) => !hit.falseStart);
  const best = scoredHits.length ? scoredHits.reduce((winner, hit) => (Math.abs(hit.delta) < Math.abs(winner.delta) ? hit : winner), scoredHits[0]) : hits[0] || null;
  const signedAverage = hits.length ? hits.reduce((sum, hit) => sum + hit.delta, 0) / hits.length : 0;
  const sync = Math.max(0, Math.min(100, 100 - average * 145 - game.misses * 9));
  const pattern = signedAverage < -0.12 ? "RUSHING" : signedAverage > 0.12 ? "DRIFTING LATE" : "CONTROLLED";

  finalSignal.textContent = getSystemDiagnosis({ hits, average, signedAverage });
  statAverage.textContent = average.toFixed(3);
  statBest.textContent = best ? Math.abs(best.delta).toFixed(3) : "0.000";
  statSync.textContent = `${Math.round(sync)}%`;
  statPattern.textContent = pattern;

  buildRoundHistory();
  buildRhythmGraph();
  if (hits.length) checkRecords(sync, average);
}

async function chooseMode(event) {
  const button = event.target.closest("[data-mode]");
  if (!button || game.phase !== PHASE.START) return;
  game.mode = button.dataset.mode;
  modeBar.querySelectorAll(".mode").forEach((modeButton) => {
    modeButton.classList.toggle("is-active", modeButton === button);
  });
  app.classList.toggle("do-not-try", game.mode === "do-not-try");
  await audio.ensure();
  audio.startMenu(game.mode);
}

function buttonAction(event) {
  event.preventDefault();
  if (game.phase === PHASE.START || game.phase === PHASE.GAMEOVER) {
    startGame();
  } else if (game.phase === PHASE.TARGET) {
    falseStart();
  } else if (game.phase === PHASE.ROUND) {
    hitButton();
  }
}

coreButton.addEventListener("pointerdown", buttonAction);
modeBar.addEventListener("click", chooseMode);
menuButton.addEventListener("click", () => {
  returnToMainMenu();
});

window.addEventListener("keydown", (event) => {
  if (event.code !== "Space" && event.code !== "Enter") return;
  if (event.repeat) return;
  if (game.phase === PHASE.START || game.phase === PHASE.GAMEOVER) {
    event.preventDefault();
    startGame();
  } else if (game.phase === PHASE.TARGET) {
    event.preventDefault();
    falseStart();
  } else if (game.phase === PHASE.ROUND) {
    event.preventDefault();
    hitButton();
  }
});

document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    abortToStart();
  }
});

window.addEventListener("pagehide", abortToStart);
window.addEventListener("beforeunload", abortToStart);

setLevel(1);
resetVisuals();
