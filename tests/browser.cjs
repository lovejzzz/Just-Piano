const { chromium } = require("playwright");
const fs = require("node:fs");
fs.mkdirSync("test-results", { recursive: true });
(async () => {
  const browser = await chromium.launch({
    channel: "chrome",
    headless: true,
    args: ["--autoplay-policy=no-user-gesture-required"],
  });
  try {
    const page = await browser.newPage({
      viewport: { width: 1440, height: 1000 },
    });
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.addInitScript(() => {
      const inputs = new Map(["first", "second"].map((id) => [id, { id, name: id }]));
      Object.defineProperty(navigator, "requestMIDIAccess", {
        configurable: true,
        value: async () => ({ inputs }),
      });
      window.testMidiSend = (id, data) => {
        const input = inputs.get(id);
        input.onmidimessage({ currentTarget: input, data });
      };
      window.testAudioMessages = [];
      const OriginalNode = window.AudioWorkletNode;
      window.AudioWorkletNode = class extends OriginalNode {
        constructor(ctx, ...args) {
          super(ctx, ...args);
          const postMessage = this.port.postMessage.bind(this.port);
          this.port.postMessage = (message) => {
            window.testAudioMessages.push(message);
            postMessage(message);
          };
          window.testAnalyser = ctx.createAnalyser();
          this.connect(window.testAnalyser);
        }
      };
    });
    await page.goto("http://localhost:8000");
    await page.screenshot({
      path: "test-results/desktop.png",
      fullPage: true,
    });
    await page.getByRole("button", { name: "Enable audio" }).click();
    await page.waitForFunction(
      () =>
        document.querySelector("#audioLabel").textContent === "Audio enabled",
    );
    await page.locator('[data-preset="felt"]').click();
    await page.keyboard.down("a");
    if ((await page.locator('.key[data-note="60"].down').count()) !== 1)
      throw Error("Computer key did not activate C4");
    await page.waitForFunction(() => {
      const samples = new Float32Array(2048);
      window.testAnalyser.getFloatTimeDomainData(samples);
      return samples.some((value) => Math.abs(value) > 0.001);
    });
    await page.keyboard.up("a");
    if ((await page.locator(".key.down").count()) !== 0)
      throw Error("Computer key release stuck");
    // Releasing a source must use its original pitch, even after transposing.
    await page.keyboard.down("a");
    await page.locator("#tUp").click();
    await page.keyboard.up("a");
    if ((await page.locator(".key.down").count()) !== 0)
      throw Error("Transposing a held computer note left it stuck");
    await page.locator("#tDown").click();
    // Pointer cancellation / capture loss must release the sounding key.
    await page.locator('.key[data-note="60"]').scrollIntoViewIfNeeded();
    const c4 = await page.locator('.key[data-note="60"]').boundingBox();
    await page.mouse.move(c4.x + c4.width / 2, c4.y + c4.height - 15);
    await page.mouse.down();
    if ((await page.locator('.key[data-note="60"].down').count()) !== 1)
      throw Error("Pointer did not activate C4");
    await page.evaluate(() => document.querySelector("#kbd").dispatchEvent(
      new PointerEvent("lostpointercapture", { pointerId: 1 }),
    ));
    if ((await page.locator(".key.down").count()) !== 0)
      throw Error("Lost pointer capture left a note stuck");
    await page.mouse.up();
    await page.waitForFunction(() => !document.querySelector("#midiIn").disabled);
    await page.evaluate(() => {
      testMidiSend("first", [0xb0, 64, 127]);
      testMidiSend("second", [0xb0, 64, 127]);
      testMidiSend("first", [0xb0, 64, 0]);
    });
    if (await page.locator("#sustain").getAttribute("aria-pressed") !== "true")
      throw Error("One MIDI pedal released another device's sustain");
    await page.evaluate(() => testMidiSend("second", [0xb0, 64, 0]));
    if (await page.locator("#sustain").getAttribute("aria-pressed") !== "false")
      throw Error("Final MIDI pedal release did not release sustain");
    await page.evaluate(() => {
      testMidiSend("first", [0xb0, 67, 127]);
      testMidiSend("first", [0xb1, 67, 127]);
      testMidiSend("first", [0xb0, 67, 0]);
    });
    if (await page.evaluate(() => testAudioMessages.at(-1).value) !== 1)
      throw Error("One MIDI channel released another channel's soft pedal");
    await page.evaluate(() => testMidiSend("first", [0xb1, 67, 0]));
    if (await page.evaluate(() => testAudioMessages.at(-1).value) !== 0)
      throw Error("Final MIDI soft pedal release did not reach worklet");
    // A MIDI and computer source may hold the same key independently.
    await page.keyboard.down("a");
    await page.evaluate(() => testMidiSend("first", [0x90, 60, 96]));
    await page.keyboard.up("a");
    if ((await page.locator('.key[data-note="60"].down').count()) !== 1)
      throw Error("Computer release cancelled a held MIDI note");
    await page.locator("#tUp").click();
    await page.evaluate(() => testMidiSend("first", [0x90, 60, 0]));
    if ((await page.locator(".key.down").count()) !== 0)
      throw Error("MIDI zero-velocity release after transpose stuck");
    await page.locator("#tDown").click();
    await page.locator("#sustain").click();
    await page.keyboard.down("s");
    await page.keyboard.up("s");
    await page.locator("#panic").click();
    await page.locator("#demo").click();
    await page.waitForTimeout(600);
    if ((await page.locator(".key.down").count()) === 0)
      throw Error("Demo did not play");
    await page.locator("#demo").click();
    if ((await page.locator(".key.down").count()) !== 0)
      throw Error("Demo notes stuck");
    await page.locator("#hardness").fill("0.8");
    await page.reload();
    if ((await page.locator("#hardness").inputValue()) !== "0.8")
      throw Error("Custom parameter did not persist");
    await page.locator("#reset").click();
    if ((await page.locator("#hardness").inputValue()) !== "0.08")
      throw Error("Reset did not restore voicing");
    await page.reload();
    if ((await page.locator("#hardness").inputValue()) !== "0.08")
      throw Error("Persistence failed");
    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => new Promise((resolve) => {
      scrollTo(0, 0);
      requestAnimationFrame(() => requestAnimationFrame(resolve));
    }));
    await page.screenshot({ path: "test-results/mobile.png", fullPage: true });
    if (
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      )
    )
      throw Error("Mobile horizontal overflow");
    await page.evaluate(async () => {
      await navigator.serviceWorker.register("sw.js");
      await navigator.serviceWorker.ready;
    });
    await page.waitForFunction(
      () => navigator.serviceWorker.controller !== null,
    );
    await page.context().setOffline(true);
    await page.reload();
    if ((await page.locator(".preset").count()) !== 6)
      throw Error("Offline preset library failed");
    await page.getByRole("button", { name: "Enable audio" }).click();
    await page.waitForFunction(
      () =>
        document.querySelector("#audioLabel").textContent === "Audio enabled",
    );
    await page.locator('.key[data-note="60"]').scrollIntoViewIfNeeded();
    const offlineKey = await page.locator('.key[data-note="60"]').boundingBox();
    await page.mouse.move(offlineKey.x + offlineKey.width / 2, offlineKey.y + offlineKey.height - 15);
    await page.mouse.down();
    await page.waitForFunction(() => {
      const samples = new Float32Array(2048);
      testAnalyser.getFloatTimeDomainData(samples);
      return samples.some((value) => Math.abs(value) > 0.001);
    });
    await page.mouse.up();
    if (errors.length) throw Error(errors.join("\n"));
    console.log(
      "PASS browser: audio worklet emits signal, offline startup, presets/custom/reset persistence, pointer capture loss, held-note transpose, MIDI/computer source overlap, multi-device/channel pedals, sustain/panic, audition/stop, mobile layout, no JS errors.",
    );
  } finally {
    await browser.close();
  }
})();
