// Just Piano — UI, input (mouse, touch, computer keys, Web MIDI) and audio graph.
(() => {
  "use strict";

  const LOW = 21,
    HIGH = 108; // A0..C8
  const BLACK = new Set([1, 3, 6, 8, 10]);
  const NAMES = [
    "C",
    "C♯",
    "D",
    "D♯",
    "E",
    "F",
    "F♯",
    "G",
    "G♯",
    "A",
    "A♯",
    "B",
  ];
  const $ = (id) => document.getElementById(id);

  // ---------- settings ----------
  const defaults = {
    volume: 0.8,
    ...PIANO_PRESETS[0].values,
    preset: "nocturne",
    transpose: 0,
    midiIn: "",
  };
  const settings = { ...defaults };
  try {
    Object.assign(
      settings,
      JSON.parse(localStorage.getItem("just-piano") || "{}"),
    );
  } catch (_) {}
  for (const [key, value] of Object.entries(defaults)) {
    if (typeof value === "number" && !Number.isFinite(settings[key]))
      settings[key] = value;
  }
  const save = () => {
    try {
      localStorage.setItem("just-piano", JSON.stringify(settings));
    } catch (_) {}
  };

  // ---------- audio ----------
  let ctx = null,
    node = null,
    master = null,
    dry = null,
    wet = null;
  let sustainOn = false,
    sustainLatched = false,
    sustainHeld = false,
    sustainMidi = new Set();
  const softMidi = new Set();
  let starting = null;

  function makeImpulse(ac, seconds = 2.6) {
    const len = Math.floor(ac.sampleRate * seconds);
    const pre = Math.floor(ac.sampleRate * 0.012);
    const buf = ac.createBuffer(2, len, ac.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      let lp = 0;
      for (let i = pre; i < len; i++) {
        const t = (i - pre) / ac.sampleRate;
        // darker as the tail goes on
        const a = 0.55 - 0.4 * Math.min(1, t / seconds);
        lp += a * (Math.random() * 2 - 1 - lp);
        d[i] = lp * Math.exp((-t * 6.91) / seconds) * (1 - Math.exp(-t * 300));
      }
    }
    return buf;
  }

  async function startAudio() {
    if (starting) return starting;
    if (node) {
      if (ctx.state !== "running") await ctx.resume();
      return;
    }
    starting = initializeAudio();
    try {
      await starting;
    } catch (err) {
      if (ctx) await ctx.close().catch(() => {});
      ctx = node = master = dry = wet = null;
      throw err;
    } finally {
      starting = null;
    }
  }

  async function initializeAudio() {
    ctx = new (window.AudioContext || window.webkitAudioContext)({
      latencyHint: "interactive",
    });
    await ctx.audioWorklet.addModule("piano-worklet.js");
    node = new AudioWorkletNode(ctx, "just-piano", {
      numberOfInputs: 0,
      outputChannelCount: [2],
    });

    // Soundboard/body colouring.
    const low = ctx.createBiquadFilter();
    low.type = "lowshelf";
    low.frequency.value = 180;
    low.gain.value = 2.5;
    const body = ctx.createBiquadFilter();
    body.type = "peaking";
    body.frequency.value = 420;
    body.Q.value = 0.8;
    body.gain.value = 1.5;
    const box = ctx.createBiquadFilter();
    box.type = "peaking";
    box.frequency.value = 1100;
    box.Q.value = 1.2;
    box.gain.value = -1.5;
    const air = ctx.createBiquadFilter();
    air.type = "highshelf";
    air.frequency.value = 6000;
    air.gain.value = -2;
    node.connect(low).connect(body).connect(box).connect(air);

    dry = ctx.createGain();
    wet = ctx.createGain();
    const rev = ctx.createConvolver();
    rev.buffer = makeImpulse(ctx);
    master = ctx.createGain();
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -6;
    limiter.knee.value = 6;
    limiter.ratio.value = 8;
    limiter.attack.value = 0.003;
    limiter.release.value = 0.2;

    air.connect(dry).connect(master);
    air.connect(rev).connect(wet).connect(master);
    master.connect(limiter).connect(ctx.destination);

    applyAll();
    send({ type: "sustain", on: sustainOn });
  }

  function send(msg) {
    if (node) node.port.postMessage(msg);
  }

  function applyAll() {
    if (!master) return;
    const t = ctx.currentTime;
    master.gain.setTargetAtTime(
      settings.volume * settings.volume * 1.4,
      t,
      0.02,
    );
    dry.gain.setTargetAtTime(1 - 0.35 * settings.reverb, t, 0.02);
    wet.gain.setTargetAtTime(settings.reverb * 0.9, t, 0.02);
    for (const key of [
      "hardness",
      "unison",
      "curve",
      "resonance",
      "decay",
      "stiffness",
      "strike",
      "noise",
      "stretch",
    ])
      send({ type: "param", key, value: Number(settings[key]) });
  }

  // ---------- notes ----------
  const sources = new Map(); // note -> count of pressing sources
  function noteOn(note, vel) {
    if (!node) return;
    const n = note + settings.transpose;
    if (n < LOW || n > HIGH) return;
    if (ctx && ctx.state !== "running") ctx.resume();
    send({ type: "on", note: n, vel });
    sources.set(n, (sources.get(n) || 0) + 1);
    paint(n, true);
    return n;
  }
  function noteOff(note) {
    const n = note + settings.transpose;
    releaseSounding(n);
  }
  function releaseSounding(n) {
    const c = (sources.get(n) || 0) - 1;
    if (c > 0) {
      sources.set(n, c);
      return;
    }
    sources.delete(n);
    send({ type: "off", note: n });
    paint(n, false);
  }
  function allNotesOff() {
    for (const n of sources.keys()) paint(n, false);
    sources.clear();
    held.clear();
    pointers.clear();
    midiSounding.clear();
    send({ type: "allOff" });
    softMidi.clear();
    setSustain(false, "all");
  }

  function setSustain(on, source, midiSource) {
    if (source === "button") sustainLatched = on;
    else if (source === "hold") sustainHeld = on;
    else if (source === "midi") {
      if (on) sustainMidi.add(midiSource);
      else sustainMidi.delete(midiSource);
    } else if (source === "all") {
      sustainLatched = sustainHeld = false;
      sustainMidi.clear();
    }
    const v = sustainLatched || sustainHeld || sustainMidi.size > 0;
    sustainOn = v;
    $("sustain").setAttribute("aria-pressed", String(v));
    send({ type: "sustain", on: v });
  }

  // ---------- keyboard UI ----------
  const kbd = $("kbd");
  const keyEls = new Map();
  const whiteCount = (() => {
    let c = 0;
    for (let m = LOW; m <= HIGH; m++) if (!BLACK.has(m % 12)) c++;
    return c;
  })();

  (function buildKeyboard() {
    let w = 0;
    for (let m = LOW; m <= HIGH; m++) {
      const el = document.createElement("div");
      el.dataset.note = m;
      el.setAttribute("role", "button");
      el.setAttribute("aria-pressed", "false");
      el.setAttribute("aria-label", NAMES[m % 12] + (Math.floor(m / 12) - 1));
      if (BLACK.has(m % 12)) {
        el.className = "key black";
        const width = (0.62 / whiteCount) * 100;
        el.style.width = width + "%";
        el.style.left = (w / whiteCount) * 100 - width / 2 + "%";
      } else {
        el.className = "key";
        if (m % 12 === 0) {
          const lbl = document.createElement("span");
          lbl.className = "lbl";
          lbl.textContent = "C" + (Math.floor(m / 12) - 1);
          el.appendChild(lbl);
        }
        w++;
      }
      kbd.appendChild(el);
      keyEls.set(m, el);
    }
  })();

  function paint(n, down) {
    const el = keyEls.get(n);
    if (el) {
      el.classList.toggle("down", down);
      el.setAttribute("aria-pressed", String(down));
    }
  }

  // Pointer playing: velocity from where the key is struck (nearer the front = louder).
  const pointers = new Map(); // pointerId -> sounding note
  function keyAt(x, y) {
    const el = document.elementFromPoint(x, y);
    return el && el.closest ? el.closest(".key") : null;
  }
  function velocityFor(el, y) {
    const r = el.getBoundingClientRect();
    const t = Math.min(1, Math.max(0, (y - r.top) / r.height));
    return Math.round(35 + t * 92);
  }
  function pointerStrike(id, el, y) {
    const raw = Number(el.dataset.note) - settings.transpose;
    const n = noteOn(raw, velocityFor(el, y));
    pointers.set(id, n === undefined ? null : n);
  }
  kbd.addEventListener("pointerdown", (e) => {
    const el = e.target.closest(".key");
    if (!el) return;
    e.preventDefault();
    if (!node) {
      enableAudio();
      return;
    }
    stopDemo();
    try {
      kbd.setPointerCapture(e.pointerId);
    } catch (_) {}
    pointerStrike(e.pointerId, el, e.clientY);
  });
  kbd.addEventListener("pointermove", (e) => {
    if (!pointers.has(e.pointerId)) return;
    const el = keyAt(e.clientX, e.clientY);
    const cur = pointers.get(e.pointerId);
    const next = el ? Number(el.dataset.note) : null;
    if (next === cur) return;
    if (cur != null) releaseSounding(cur);
    if (el) pointerStrike(e.pointerId, el, e.clientY);
    else pointers.set(e.pointerId, null);
  });
  const endPointer = (e) => {
    if (!pointers.has(e.pointerId)) return;
    const cur = pointers.get(e.pointerId);
    pointers.delete(e.pointerId);
    if (cur != null) releaseSounding(cur);
  };
  kbd.addEventListener("pointerup", endPointer);
  kbd.addEventListener("pointercancel", endPointer);
  kbd.addEventListener("lostpointercapture", endPointer);

  // Computer keyboard.
  const KEYMAP = {
    a: 0,
    w: 1,
    s: 2,
    e: 3,
    d: 4,
    f: 5,
    t: 6,
    g: 7,
    y: 8,
    h: 9,
    u: 10,
    j: 11,
    k: 12,
    o: 13,
    l: 14,
    p: 15,
    ";": 16,
    "'": 17,
  };
  let octave = 4;
  const held = new Map(); // key -> sounding note
  window.addEventListener("keydown", (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.target.closest("select, input, a")) return;
    if (e.target.closest("button") && (e.key === " " || e.key === "Enter"))
      return;
    if (!node) return;
    const k = e.key.toLowerCase();
    if (k === " ") {
      e.preventDefault();
      if (!e.repeat) setSustain(true, "hold");
      return;
    }
    if (e.repeat) return;
    if (k === "z") {
      octave = Math.max(1, octave - 1);
      return;
    }
    if (k === "x") {
      octave = Math.min(7, octave + 1);
      return;
    }
    if (k in KEYMAP && !held.has(k)) {
      stopDemo();
      const n = noteOn((octave + 1) * 12 + KEYMAP[k], 92);
      if (n !== undefined) held.set(k, n);
    }
  });
  window.addEventListener("keyup", (e) => {
    const k = e.key.toLowerCase();
    if (k === " ") {
      setSustain(false, "hold");
      return;
    }
    if (held.has(k)) {
      releaseSounding(held.get(k));
      held.delete(k);
    }
  });
  window.addEventListener("blur", () => {
    stopDemo();
    allNotesOff();
  });

  // ---------- Web MIDI ----------
  let midi = null;
  const midiSel = $("midiIn");
  const midiDot = $("midiDot");
  const midiSounding = new Map(); // "ch:note" -> sounding note (transpose can change while held)
  let flashTimer = 0;

  function onMidi(e) {
    if (settings.midiIn && e.currentTarget.id !== settings.midiIn) return;
    const [st, d1 = 0, d2 = 0] = e.data;
    const type = st & 0xf0,
      ch = st & 0x0f;
    midiDot.classList.add("flash");
    clearTimeout(flashTimer);
    flashTimer = setTimeout(() => midiDot.classList.remove("flash"), 80);
    if (type === 0x90 && d2 > 0) {
      const key = e.currentTarget.id + ":" + ch + ":" + d1;
      if (midiSounding.has(key)) releaseSounding(midiSounding.get(key));
      const n = noteOn(d1, d2);
      if (n !== undefined) midiSounding.set(key, n);
    } else if (type === 0x80 || (type === 0x90 && d2 === 0)) {
      const key = e.currentTarget.id + ":" + ch + ":" + d1;
      if (midiSounding.has(key)) {
        releaseSounding(midiSounding.get(key));
        midiSounding.delete(key);
      }
    } else if (type === 0xb0) {
      const midiSource = e.currentTarget.id + ":" + ch;
      if (d1 === 64) setSustain(d2 >= 64, "midi", midiSource);
      else if (d1 === 67) {
        if (d2 >= 64) softMidi.add(midiSource);
        else softMidi.delete(midiSource);
        send({ type: "soft", value: softMidi.size > 0 ? 1 : 0 });
      }
      else if (d1 === 7) {
        settings.volume = d2 / 127;
        $("volume").value = settings.volume;
        applyAll();
        save();
      } else if (d1 === 120 || d1 === 123) {
        midiSounding.clear();
        allNotesOff();
      }
    }
  }

  function refreshMidi() {
    allNotesOff();
    const inputs = midi ? [...midi.inputs.values()] : [];
    midiSel.innerHTML = "";
    if (!inputs.length) {
      midiSel.add(new Option("MIDI: no devices found", ""));
      midiSel.disabled = true;
      midiDot.classList.remove("on");
      return;
    }
    midiSel.add(new Option("MIDI: all inputs", ""));
    for (const inp of inputs) {
      midiSel.add(new Option(inp.name || "MIDI input", inp.id));
      inp.onmidimessage = onMidi;
    }
    midiSel.disabled = false;
    settings.midiIn = inputs.some((i) => i.id === settings.midiIn)
      ? settings.midiIn
      : "";
    midiSel.value = settings.midiIn;
    midiDot.classList.add("on");
  }

  async function startMidi() {
    if (midi) return;
    if (!navigator.requestMIDIAccess) {
      midiSel.innerHTML = "";
      midiSel.add(new Option("MIDI: not supported in this browser", ""));
      return;
    }
    midiSel.innerHTML = "";
    midiSel.add(new Option("MIDI: waiting for permission…", ""));
    try {
      midi = await navigator.requestMIDIAccess({ sysex: false });
      midi.onstatechange = refreshMidi;
      refreshMidi();
    } catch (err) {
      midiSel.innerHTML = "";
      midiSel.add(new Option("MIDI: permission denied", ""));
    }
  }

  midiSel.addEventListener("change", () => {
    allNotesOff();
    settings.midiIn = midiSel.value;
    save();
  });

  // ---------- original voicings and controls ----------
  const controlIds = [
    "volume",
    "hardness",
    "unison",
    "curve",
    "reverb",
    "resonance",
    "decay",
  ];
  function syncControls() {
    for (const id of controlIds) {
      const el = $(id);
      settings[id] = Math.max(
        Number(el.min),
        Math.min(Number(el.max), settings[id]),
      );
      el.value = settings[id];
      if ($(id + "Value"))
        $(id + "Value").textContent =
          id === "curve" || id === "decay"
            ? settings[id].toFixed(2) + "×"
            : Math.round(settings[id] * 100) + "%";
    }
  }
  function showPreset() {
    const preset =
      PIANO_PRESETS.find((p) => p.id === settings.preset) || PIANO_PRESETS[0];
    $("presetTitle").textContent = preset.name;
    $("presetDescription").textContent = preset.description;
    $("presetTag").textContent = preset.tag;
    $("presetNumber").textContent =
      String(PIANO_PRESETS.indexOf(preset) + 1).padStart(2, "0") + " / 06";
    for (const b of $("presets").children)
      b.setAttribute("aria-pressed", String(b.dataset.preset === preset.id));
  }
  function selectPreset(preset) {
    stopDemo();
    Object.assign(settings, preset.values, { preset: preset.id });
    syncControls();
    showPreset();
    applyAll();
    save();
    $("status").textContent =
      preset.name + (node ? " · ready to play" : " · enable audio to play");
  }
  PIANO_PRESETS.forEach((preset, i) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "preset";
    b.dataset.preset = preset.id;
    b.innerHTML =
      '<span class="number">' +
      String(i + 1).padStart(2, "0") +
      "</span><strong>" +
      preset.name +
      "</strong><small>" +
      preset.kind +
      "</small>";
    b.addEventListener("click", () => selectPreset(preset));
    $("presets").appendChild(b);
  });
  for (const id of controlIds)
    $(id).addEventListener("input", () => {
      settings[id] = Number($(id).value);
      syncControls();
      applyAll();
      save();
      $("status").textContent =
        "Custom voicing" +
        (node ? " · ready to play" : " · enable audio to play");
    });
  syncControls();
  showPreset();
  $("reset").addEventListener("click", () =>
    selectPreset(
      PIANO_PRESETS.find((p) => p.id === settings.preset) || PIANO_PRESETS[0],
    ),
  );
  $("sustain").addEventListener("click", () =>
    setSustain(!sustainLatched, "button"),
  );
  $("panic").addEventListener("click", () => {
    stopDemo();
    allNotesOff();
  });
  function setTranspose(v) {
    settings.transpose = Math.round(Math.max(-12, Math.min(12, v)));
    $("tVal").textContent =
      (settings.transpose > 0 ? "+" : "") + settings.transpose;
    save();
  }
  $("tDown").addEventListener("click", () =>
    setTranspose(settings.transpose - 1),
  );
  $("tUp").addEventListener("click", () =>
    setTranspose(settings.transpose + 1),
  );
  setTranspose(Number(settings.transpose) || 0);

  async function enableAudio() {
    $("startBtn").disabled = true;
    $("audioLabel").textContent = "Starting…";
    try {
      await startAudio();
      $("audioDot").classList.add("on");
      $("audioLabel").textContent = "Audio enabled";
      $("status").textContent =
        "Ready to play · " + Math.round(ctx.sampleRate / 1000) + " kHz";
      startMidi();
      return true;
    } catch (err) {
      console.error(err);
      $("audioLabel").textContent = "Retry audio";
      $("status").textContent = "Audio could not start: " + err.message;
      return false;
    } finally {
      $("startBtn").disabled = false;
    }
  }
  $("startBtn").addEventListener("click", enableAudio);

  // A short original audition phrase; tracked sounding pitches survive transposition.
  let demoTimers = [],
    demoNotes = new Set(),
    demoPlaying = false;
  function stopDemo() {
    demoTimers.forEach(clearTimeout);
    demoTimers = [];
    for (const n of demoNotes) releaseSounding(n);
    demoNotes.clear();
    demoPlaying = false;
    $("demo").textContent = "▷  Listen to this piano";
  }
  $("demo").addEventListener("click", async () => {
    if (demoPlaying) {
      stopDemo();
      return;
    }
    if (!node && !(await enableAudio())) return;
    stopDemo();
    demoPlaying = true;
    $("demo").textContent = "□  Stop listening";
    const phrase = [
      [48, 60, 67],
      [52, 59, 64],
      [45, 60, 69],
      [41, 57, 65],
      [43, 59, 67],
      [48, 64, 72],
    ];
    phrase.forEach((chord, c) =>
      chord.forEach((pitch, i) => {
        demoTimers.push(
          setTimeout(
            () => {
              const n = noteOn(pitch, [66, 75, 83][i]);
              if (n === undefined) return;
              demoNotes.add(n);
              demoTimers.push(
                setTimeout(() => {
                  if (demoNotes.delete(n)) releaseSounding(n);
                }, 1100),
              );
            },
            c * 1200 + i * 180,
          ),
        );
      }),
    );
    demoTimers.push(setTimeout(stopDemo, 7700));
  });

  // Original vector instrument illustration, generated entirely in this app.
  const svgNS = "http://www.w3.org/2000/svg";
  for (let i = 0; i < 45; i++) {
    const line = document.createElementNS(svgNS, "path");
    line.setAttribute(
      "d",
      `M${178 + i * 3.6} ${212 + i * 1.03} L${283 + i * 4.6} ${98 + i * 1.1}`,
    );
    $("strings").appendChild(line);
  }
  for (let i = 0; i < 36; i++) {
    const line = document.createElementNS(svgNS, "path");
    const x = 148 + i * 5.36,
      y = 219 + i * 1.58;
    line.setAttribute("d", `M${x} ${y} l-8 20`);
    line.setAttribute("stroke", "#444c3c");
    line.setAttribute("stroke-width", ".6");
    $("artKeys").appendChild(line);
    if (![2, 6].includes(i % 7)) {
      const key = document.createElementNS(svgNS, "path");
      key.setAttribute("d", `M${x + 2} ${y + 0.6} l3.4 1 l-5.4 13 l-3.4 -1Z`);
      key.setAttribute("fill", "#101711");
      $("artKeys").appendChild(key);
    }
  }

  // Center the keyboard around middle C on narrow screens.
  requestAnimationFrame(() => {
    const wrap = $("kbdWrap");
    wrap.scrollLeft = (wrap.scrollWidth - wrap.clientWidth) * 0.45;
  });

  if ("serviceWorker" in navigator && location.protocol === "https:") {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }
})();
