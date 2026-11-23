(function () {
  "use strict";

  var TOTAL = 21;
  var COOLDOWN_MS = 1500;
  var W = 1920;
  var H = 1080;

  var slide = 1;
  var revealStep = {}; // slide -> how many groups already revealed
  var reveals = {};
  var listening = false;
  var starting = false;
  var rec = null;
  var lastFiredAt = 0;
  var lastFiredKey = "";
  var digitBuf = "";
  var digitTimer = 0;
  var hudHidden = false;
  var statusEl = document.getElementById("status");
  var micDot = document.getElementById("mic-dot");
  var micLabel = document.getElementById("mic-label");
  var heardEl = document.getElementById("heard");
  var lastCmdEl = document.getElementById("last-cmd");
  var counterText = document.getElementById("counter-text");
  var revealText = document.getElementById("reveal-text");
  var img = document.getElementById("slide-img");
  var overlays = document.getElementById("overlays");
  var gate = document.getElementById("gate");
  var startBtn = document.getElementById("start-btn");
  var gateErr = document.getElementById("gate-err");
  var toastEl = document.getElementById("toast");
  var toastTimer = 0;

  function pad(n) {
    return String(n).padStart(2, "0");
  }

  function slideSrc(n) {
    return "./slides/s-" + pad(n) + ".png";
  }

  function preload() {
    for (var i = 1; i <= TOTAL; i++) {
      var im = new Image();
      im.src = slideSrc(i);
    }
  }

  function groupCount(n) {
    var info = reveals[String(n)];
    return info ? info.revealOrder.length : 0;
  }

  function currentRevealedIds(n) {
    var info = reveals[String(n)];
    if (!info) return {};
    var step = revealStep[n] || 0;
    var set = {};
    for (var i = 0; i < step && i < info.revealOrder.length; i++) {
      set[info.revealOrder[i]] = true;
    }
    return set;
  }

  function renderOverlays() {
    overlays.innerHTML = "";
    var info = reveals[String(slide)];
    if (!info) return;
    var shown = currentRevealedIds(slide);
    info.groups.forEach(function (g) {
      g.boxes.forEach(function (b) {
        var el = document.createElement("div");
        el.className = "mask-box" + (shown[g.id] ? " revealed" : "");
        el.style.left = (b.x0 / W * 100) + "%";
        el.style.top = (b.y0 / H * 100) + "%";
        el.style.width = ((b.x1 - b.x0) / W * 100) + "%";
        el.style.height = ((b.y1 - b.y0) / H * 100) + "%";
        el.style.background = "rgb(" + b.fill.join(",") + ")";
        if (b.qcolor) {
          var q = document.createElement("span");
          q.className = "q";
          q.textContent = "?";
          q.style.setProperty("--qsize", String(b.qsize));
          q.style.color = "rgb(" + b.qcolor.join(",") + ")";
          el.appendChild(q);
        }
        overlays.appendChild(el);
      });
    });
  }

  function updateCounter() {
    counterText.textContent = slide + " / " + TOTAL;
    var total = groupCount(slide);
    if (total) {
      revealText.textContent = "정답 " + (revealStep[slide] || 0) + "/" + total;
    } else {
      revealText.textContent = "";
    }
  }

  function showSlide() {
    img.src = slideSrc(slide);
    img.alt = "슬라이드 " + slide;
    renderOverlays();
    updateCounter();
  }

  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      toastEl.classList.remove("show");
    }, 1200);
  }

  function labelFor(cmd) {
    if (!cmd) return "—";
    if (cmd.action === "next") return "다음 슬라이드";
    if (cmd.action === "prev") return "이전 슬라이드";
    if (cmd.action === "first") return "처음으로";
    if (cmd.action === "reveal") return "정답 공개";
    if (cmd.action === "goto") return cmd.slide + "번으로";
    return cmd.action;
  }

  function apply(cmd, source) {
    if (!cmd) return false;
    var now = Date.now();
    var key = cmd.action + ":" + (cmd.slide || "");
    if (source === "voice") {
      if (now - lastFiredAt < COOLDOWN_MS && key === lastFiredKey) return false;
      lastFiredAt = now;
      lastFiredKey = key;
    }

    if (cmd.action === "next") {
      if (slide >= TOTAL) { toast("마지막 슬라이드"); return true; }
      slide += 1;
    } else if (cmd.action === "prev") {
      if (slide <= 1) { toast("첫 슬라이드"); return true; }
      slide -= 1;
    } else if (cmd.action === "first") {
      slide = 1;
    } else if (cmd.action === "goto") {
      slide = cmd.slide;
    } else if (cmd.action === "reveal") {
      var total = groupCount(slide);
      if (!total) { toast("이 장은 숨긴 정답이 없음"); return true; }
      var cur = revealStep[slide] || 0;
      if (cur >= total) { toast("정답을 모두 공개함"); return true; }
      revealStep[slide] = cur + 1;
    }

    lastCmdEl.innerHTML = "마지막 명령: <strong>" + labelFor(cmd) + "</strong>";
    showSlide();
    return true;
  }

  function setMic(state, text) {
    micDot.className = "mic-dot " + (state || "");
    micLabel.textContent = text;
  }

  function startRecognition() {
    var Rec = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Rec) {
      setMic("err", "이 브라우저는 음성 인식 없음");
      return false;
    }
    if (rec) {
      try { rec.onend = null; rec.onerror = null; rec.stop(); } catch (e) {}
      rec = null;
    }
    rec = new Rec();
    rec.lang = "ko-KR";
    rec.continuous = true;
    rec.interimResults = true;
    rec.maxAlternatives = 1;

    rec.onstart = function () {
      listening = true;
      starting = false;
      setMic("on", "듣는 중");
    };

    rec.onresult = function (event) {
      var heard = "";
      for (var i = event.resultIndex; i < event.results.length; i++) {
        heard = event.results[i][0].transcript;
        heardEl.textContent = "들은 말: " + heard;
        var cmd = SlideCommands.parseCommand(heard);
        if (cmd) apply(cmd, "voice");
      }
    };

    rec.onerror = function (event) {
      var err = event.error;
      if (err === "not-allowed" || err === "service-not-allowed") {
        listening = false;
        setMic("err", "마이크 권한이 없음");
        gateErr.textContent = "마이크 권한이 필요합니다. 주소창 왼쪽 자물쇠에서 허용한 뒤 다시 눌러 주세요.";
        gate.classList.remove("gone");
        return;
      }
      if (err === "no-speech" || err === "aborted" || err === "network") {
        setMic("wait", "다시 연결 중");
        return;
      }
      setMic("wait", "인식 오류: " + err);
    };

    rec.onend = function () {
      rec = null;
      if (!listening) {
        setMic("", "꺼짐");
        return;
      }
      setMic("wait", "다시 연결 중");
      starting = true;
      setTimeout(function () {
        if (listening) startRecognition();
      }, 250);
    };

    try {
      starting = true;
      rec.start();
      return true;
    } catch (e) {
      setMic("err", "시작 실패");
      return false;
    }
  }

  function toggleFullscreen() {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(function () {});
    } else {
      document.exitFullscreen().catch(function () {});
    }
  }

  document.getElementById("fs-btn").addEventListener("click", toggleFullscreen);

  startBtn.addEventListener("click", function () {
    gateErr.textContent = "";
    var Rec = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Rec) {
      gateErr.textContent = "크롬(또는 크롬 계열)에서 열어 주세요. 키보드만으로도 넘길 수는 있습니다.";
      gate.classList.add("gone");
      return;
    }
    listening = true;
    var ok = startRecognition();
    if (ok) gate.classList.add("gone");
  });

  document.addEventListener("keydown", function (e) {
    if (e.repeat && (e.key === " " || e.key === "ArrowRight" || e.key === "ArrowLeft")) {
      e.preventDefault();
      return;
    }
    var inGate = !gate.classList.contains("gone");
    if (inGate && (e.key === "Enter" || e.key === " ")) {
      if (e.key === " ") e.preventDefault();
      startBtn.click();
      return;
    }

    if (e.key === "f" || e.key === "F") {
      if (e.target && (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA")) return;
      e.preventDefault();
      toggleFullscreen();
      return;
    }
    if (e.key === "h" || e.key === "H") {
      hudHidden = !hudHidden;
      statusEl.classList.toggle("hidden", hudHidden);
      return;
    }
    if (e.key === "Home") {
      e.preventDefault();
      apply({ action: "first" }, "key");
      return;
    }
    if (e.key === "r" || e.key === "R") {
      e.preventDefault();
      apply({ action: "reveal" }, "key");
      return;
    }
    if (e.key === "ArrowRight" || e.key === "ArrowDown" || e.key === "PageDown" || e.key === " ") {
      e.preventDefault();
      digitBuf = "";
      apply({ action: "next" }, "key");
      return;
    }
    if (e.key === "ArrowLeft" || e.key === "ArrowUp" || e.key === "PageUp" || e.key === "Backspace") {
      e.preventDefault();
      digitBuf = "";
      apply({ action: "prev" }, "key");
      return;
    }
    if (/^[0-9]$/.test(e.key)) {
      digitBuf += e.key;
      if (digitBuf.length > 2) digitBuf = digitBuf.slice(-2);
      clearTimeout(digitTimer);
      digitTimer = setTimeout(function () { digitBuf = ""; }, 2000);
      toast(digitBuf + "번 → Enter");
      return;
    }
    if (e.key === "Enter" && digitBuf) {
      e.preventDefault();
      var n = parseInt(digitBuf, 10);
      digitBuf = "";
      if (n >= 1 && n <= TOTAL) apply({ action: "goto", slide: n }, "key");
      else toast("1–21만 가능");
    }
  });

  fetch("./reveals.json")
    .then(function (r) { return r.json(); })
    .then(function (data) {
      reveals = data;
      showSlide();
    })
    .catch(function () {
      showSlide();
    });

  preload();
  showSlide();
})();
