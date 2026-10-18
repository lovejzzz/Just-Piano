// Optional loopback-only audition. No commercial audio/model is shipped here.
(async () => {
  if (!["localhost", "127.0.0.1", "[::1]"].includes(location.hostname)) return;
  try {
    const response = await fetch("/__local/verified-preview.json", {cache: "no-store"});
    if (!response.ok) return;
    const metadata = await response.json();
    if (!metadata.available || metadata.audioUrl !== "/__local/verified-preview.wav") return;
    const audio = document.getElementById("verifiedAudio");
    const button = document.getElementById("playVerified");
    const status = document.getElementById("previewStatus");
    document.getElementById("previewRevision").textContent = `音频 ${metadata.renderRevision} · 页面 ${metadata.uiRevision}`;
    audio.src = metadata.audioUrl;
    audio.volume = .65;
    status.textContent = `${metadata.frames.toLocaleString()} 帧 · ${metadata.sampleRate / 1000} kHz · 本机私有试听`;
    button.addEventListener("click", async () => {
      try {audio.currentTime = 0; await audio.play();}
      catch {status.textContent = "播放未能启动，请点击下方播放器重试。";}
    });
    audio.addEventListener("play", () => document.getElementById("panic").click());
    audio.addEventListener("error", () => {status.textContent = "本机验证音频加载失败，请重启本地试听服务。";});
    document.getElementById("panic").addEventListener("click", event => {if (event.isTrusted) audio.pause();});
    if (metadata.liveModelAvailable) {
      document.getElementById('researchLivePanel').hidden = false;
      button.textContent = '播放离线对照';
      document.getElementById('verifiedTitle').textContent = '离线验证对照 · NY Steinway D';
      const caveat = document.querySelector('#verifiedPreview .preview-caveat');
      caveat.textContent = '这是离线对照文件；上方实时琴键使用 AudioWorklet 现场合成。';
      document.getElementById('toggleReference').addEventListener('click', event => {
        const panel = document.getElementById('verifiedPreview');panel.hidden = !panel.hidden;
        event.currentTarget.setAttribute('aria-expanded',String(!panel.hidden));
      });
    } else document.getElementById("verifiedPreview").hidden = false;
  } catch { /* Ordinary static hosting has no private audition endpoint. */ }
})();
