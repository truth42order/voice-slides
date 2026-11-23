/**
 * Korean voice-command parser for the classroom slide viewer.
 * Works in the browser and in Node (module.exports).
 *
 * Designed so the lecture script itself does not trigger commands:
 * mid-sentence "다음 장에서", "뒤로 돌려서", "21번 정리 슬라이드",
 * "이번엔", "한쪽 방향", "학습지 48쪽" must return null.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.SlideCommands = factory();
})(typeof self !== "undefined" ? self : this, function () {
  var MIN_SLIDE = 1;
  var MAX_SLIDE = 21;

  // Longest-first. Single-syllable 일/이/한/두 are only used in 번-patterns, never with 쪽.
  var MULTI_NUM = [
    [21, "이십일"], [21, "스물하나"], [21, "스물한"],
    [20, "이십"], [20, "스물"], [20, "스무"],
    [19, "십구"], [19, "열아홉"],
    [18, "십팔"], [18, "열여덟"],
    [17, "십칠"], [17, "열일곱"],
    [16, "십육"], [16, "십륙"], [16, "열여섯"],
    [15, "십오"], [15, "열다섯"],
    [14, "십사"], [14, "열넷"], [14, "열네"],
    [13, "십삼"], [13, "열셋"], [13, "열세"],
    [12, "십이"], [12, "열둘"], [12, "열두"], [12, "열이"],
    [11, "십일"], [11, "열하나"], [11, "열한"],
    [10, "십"], [10, "열"]
  ];
  var SMALL_NUM = [
    [9, "아홉"], [9, "구"],
    [8, "여덟"], [8, "팔"],
    [7, "일곱"], [7, "칠"],
    [6, "여섯"], [6, "륙"], [6, "육"],
    [5, "다섯"], [5, "오"],
    [4, "넷"], [4, "네"], [4, "사"],
    [3, "셋"], [3, "세"], [3, "삼"],
    [2, "둘"], [2, "두"], [2, "이"],
    [1, "하나"], [1, "한"], [1, "일"]
  ];

  function normalize(text) {
    if (!text) return "";
    var s = String(text).toLowerCase();
    // fullwidth digits
    s = s.replace(/[０-９]/g, function (ch) {
      return String.fromCharCode(ch.charCodeAt(0) - 0xff10 + 0x30);
    });
    // drop spaces and punctuation; keep letters/digits/hangul
    s = s.replace(/[\s\u00a0\u3000.,!?;:~…·•‧、。，！？；："'`“”‘’\-_/\\()[\]{}<>]/g, "");
    // common ASR slips
    s = s.replace(/스라이드|슬라이즈|슬라이트|슬라이득|슬라드/g, "슬라이드");
    // trailing politeness that is not part of a command word
    s = s.replace(/(?:요|주세요)$/g, "");
    return s;
  }

  function escapeRe(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function numAlternation(pairs) {
    return pairs.map(function (p) { return escapeRe(p[1]); }).join("|");
  }

  function valueOfNum(token, pairs) {
    for (var i = 0; i < pairs.length; i++) {
      if (pairs[i][1] === token) return pairs[i][0];
    }
    return null;
  }

  var RE_ARABIC = "(?<![0-9])([0-9]{1,2})(?![0-9])";
  var RE_MULTI = "(" + numAlternation(MULTI_NUM) + ")";
  var RE_ANY = "(" + numAlternation(MULTI_NUM.concat(SMALL_NUM)) + "|" + "(?<![0-9])[0-9]{1,2}(?![0-9])" + ")";

  // Particles allowed after a complete command, nothing that starts a new clause.
  var TAIL = "(?:으로|로)?(?:요|주세요|가주세요|가줘|가자|가|랑)?";
  // After 번, ASR often hears 분.
  var BUN = "(?:번|분)";

  function parseNumberToken(token) {
    if (/^[0-9]{1,2}$/.test(token)) return parseInt(token, 10);
    var v = valueOfNum(token, MULTI_NUM);
    if (v != null) return v;
    return valueOfNum(token, SMALL_NUM);
  }

  function inRange(n) {
    return Number.isInteger(n) && n >= MIN_SLIDE && n <= MAX_SLIDE;
  }

  /**
   * Find all commands in normalized text; return the rightmost one
   * (most recently spoken in a continuous transcript).
   */
  function parseCommand(text) {
    var raw = normalize(text);
    if (!raw) return null;

    var hits = [];

    function add(index, length, result) {
      hits.push({ index: index, length: length, result: result });
    }

    // ----- first -----
    raw.replace(/처음으로(?:가줘|가자|가|요)?|첫슬라이드(?:로)?|맨앞으로|맨처음으로/g, function (m, offset) {
      add(offset, m.length, { action: "first", matched: m });
      return m;
    });

    // ----- reveal -----
    // Do not match "정답은" (lecture: "정답은 4번").
    raw.replace(/(?:정답을|답을|정답|답)(?:공개|보여줘|보여주|보여죠)|다음정답(?:공개)?/g, function (m, offset) {
      add(offset, m.length, { action: "reveal", matched: m });
      return m;
    });

    // ----- next -----
    // "다음장에서/다음장의" appears in the lecture; require a command ending,
    // or "다음장" not followed by 에서/의/은/이랑/이야.
    raw.replace(/다음슬라이드(?:로)?(?:가줘|가자|가)?|다음장으로(?:가줘|가자|가)?|다음페이지(?:로)?/g, function (m, offset) {
      add(offset, m.length, { action: "next", matched: m });
      return m;
    });
    raw.replace(/다음장(?!에서|의|은|이랑|이야|에도|에)/g, function (m, offset) {
      add(offset, m.length, { action: "next", matched: m });
      return m;
    });
    // "넘겨" but not "넘어가/넘어가자" (lecture: "48쪽으로 넘어가자")
    raw.replace(/넘겨(?:줘|요|라|봐|주세요)?|넘기(?:어)?(?:줘|요)?/g, function (m, offset) {
      add(offset, m.length, { action: "next", matched: m });
      return m;
    });

    // ----- prev -----
    raw.replace(/이전슬라이드(?:로)?|이전장(?:으로)?|이전화면(?:으로)?|앞장(?:으로)?(?:가줘|가자|가)?|앞슬라이드/g, function (m, offset) {
      add(offset, m.length, { action: "prev", matched: m });
      return m;
    });
    // "뒤로 돌려서" is in the lecture; only "뒤로" as a command (optional 가/가줘),
    // not followed by 돌/감/재.
    raw.replace(/뒤로(?:가줘|가자|가|요)?(?!돌|감|재|하)/g, function (m, offset) {
      add(offset, m.length, { action: "prev", matched: m });
      return m;
    });

    // ----- go to N -----
    // N번 슬라이드 / N번으로  (ASR: N분으로). Not "N번 정리 슬라이드", not bare "N번",
    // not "이번엔".
    var reGotoBun = new RegExp(
      RE_ANY + BUN + "(?:슬라이드" + TAIL + "|(?:으로|로)(?:요|주세요|가주세요|가줘|가자|가)?)",
      "g"
    );
    raw.replace(reGotoBun, function (m, token, offset) {
      var n = parseNumberToken(token);
      if (inRange(n)) add(offset, m.length, { action: "goto", slide: n, matched: m });
      return m;
    });

    // N쪽 / N쪽으로 — Arabic or 10+ Korean only. Rejects 이쪽, 한쪽, 학습지 47쪽.
    var reGotoJok = new RegExp(
      "(?:" + RE_ARABIC + "|" + RE_MULTI + ")" + "쪽" + TAIL,
      "g"
    );
    raw.replace(reGotoJok, function (m, arabic, korean, offset) {
      var n = arabic ? parseInt(arabic, 10) : parseNumberToken(korean);
      if (inRange(n)) add(offset, m.length, { action: "goto", slide: n, matched: m });
      return m;
    });

    if (!hits.length) return null;
    hits.sort(function (a, b) {
      if (a.index !== b.index) return a.index - b.index;
      return a.length - b.length;
    });
    var best = hits[hits.length - 1].result;
    return best;
  }

  return {
    parseCommand: parseCommand,
    normalize: normalize,
    MIN_SLIDE: MIN_SLIDE,
    MAX_SLIDE: MAX_SLIDE
  };
});
