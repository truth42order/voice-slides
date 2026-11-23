#!/usr/bin/env node
"use strict";
const { parseCommand } = require("./commands.js");

let failed = 0;
let passed = 0;

function eq(actual, expected) {
  if (actual === expected) return true;
  if (actual && expected && typeof actual === "object" && typeof expected === "object") {
    return actual.action === expected.action && actual.slide === expected.slide;
  }
  return false;
}

function check(text, expected) {
  const got = parseCommand(text);
  const ok = eq(got, expected);
  if (ok) {
    passed++;
    return;
  }
  failed++;
  const g = got ? JSON.stringify({ action: got.action, slide: got.slide, matched: got.matched }) : "null";
  const e = expected ? JSON.stringify(expected) : "null";
  console.error("FAIL:", JSON.stringify(text));
  console.error("  expected", e);
  console.error("  got     ", g);
}

function next() { return { action: "next" }; }
function prev() { return { action: "prev" }; }
function first() { return { action: "first" }; }
function reveal() { return { action: "reveal" }; }
function go(n) { return { action: "goto", slide: n }; }

// ---- required phrases
check("다음 슬라이드", next());
check("다음 장", next());
check("다음장", next());
check("넘겨", next());
check("이전 슬라이드", prev());
check("앞 장", prev());
check("앞장", prev());
check("뒤로", prev());
check("14번 슬라이드", go(14));
check("14번으로", go(14));
check("14쪽", go(14));
check("정답 공개", reveal());
check("답 보여줘", reveal());
check("처음으로", first());

// ---- particles / polite forms
check("다음 슬라이드로 가줘", next());
check("넘겨줘", next());
check("넘겨요", next());
check("뒤로 가", prev());
check("뒤로 가줘", prev());
check("앞 장으로", prev());
check("정답 보여줘", reveal());
check("답을 보여줘", reveal());
check("정답공개", reveal());
check("다음 정답", reveal());
check("처음으로 가", first());
check("첫 슬라이드", first());

// ---- number words and ASR variants
check("십사번으로", go(14));
check("십 사 번으로", go(14));
check("열네 번 슬라이드", go(14));
check("열네번으로", go(14));
check("이십일번으로", go(21));
check("21번으로", go(21));
check("1번으로", go(1));
check("일번으로", go(1));
check("이 번으로", go(2));
check("십사쪽", go(14));
check("열네쪽", go(14));
check("십사분으로", go(14)); // 번 heard as 분
check("스라이드 넘기면 안되고 십사번 슬라이드", go(14));
check("자 그러면 14번으로 가주세요", go(14));
check("3번 슬라이드", go(3));
check("이십번으로", go(20));
check("10쪽", go(10));
check("21쪽", go(21));
check("한 번으로", go(1));

// ---- ASR slip for slide
check("다음 스라이드", next());
check("이전 슬라이즈", prev());

// ---- rightmost command wins
check("처음으로 가다가 다음 슬라이드", next());
check("14번으로 정답 공개", reveal());

// ---- out of range
check("47쪽", null);
check("48쪽으로", null);
check("49쪽", null);
check("106쪽", null);
check("22번으로", null);
check("0번으로", null);
check("30번 슬라이드", null);

// ---- lecture script must not trigger
const lecture = [
  "안녕, 나는 오늘 너희 수업을 맡은 인공지능 선생님이야. 화면 오른쪽 아래 동그란 게 나야.",
  "학습지 47쪽 펴 줘.",
  "학습지 47쪽 탐구 2, 자석과 코일의 상대 운동이야.",
  "움직인 쪽은 다른데 결과는 똑같이 바늘이 움직였지.",
  "이제 정리 2번, 에너지 전환이야. 처음 질문 기억나?",
  "처음에 물어본 물음표, 이제 반쯤은 채워졌지?",
  "자, 학습지 48쪽으로 넘어가자. 개념 1, 전자기 유도.",
  "다음은 자석의 움직임에 따라 검류계 바늘이 어떻게 되는지 표로 보자.",
  "1번, 자석을 코일 속에 넣을 때, 그러니까 가까이 할 때 바늘은 오른쪽으로 움직여.",
  "2번, 자석을 코일 속에서 뺄 때",
  "3번, 자석이 움직이지 않을 때는?",
  "4번, 자석을 빠르게 움직이면",
  "이거 바로 다음 장에서 아주 중요하게 쓰니까 기억해 둬.",
  "이번엔 유도 전류의 세기.",
  "영상을 조금 뒤로 돌려서 같이 따라가 보자 부분부터 한 번 더",
  "처음 들으면 원래 헷갈리는 부분이야.",
  "자석은 코일 쪽으로 점점 빨라져.",
  "솔직히 나는 이 슬라이드가 좀 서운해.",
  "이제 학습지 48쪽 표야.",
  "이게 다음 장의 결론이랑 이어져.",
  "정답은 4번, ㄴ과 ㄷ.",
  "학습지 49쪽 1번. 코일 근처에서 자석을 움직일 때",
  "아까 손이 하는 일 슬라이드를 떠올려 봐. 잠깐 멈추고 생각해 보자.",
  "이번엔 도선을 끊어 놨어.",
  "학습지 49쪽 해보기, 교과서 106쪽의 간이 발전기 만들기.",
  "전류가 한쪽 방향으로 흐를 때만 불이 켜지는 부품이야.",
  "1번은 전자기 유도. 2번은 운동 에너지가 전기 에너지로.",
  "혹시 틀렸으면 21번 정리 슬라이드에서 한 번 더 짚어 줄 테니까 걱정하지 마.",
  "처음 질문의 물음표 자리에 들어갈 답이 바로 운동",
  "화면을 왼쪽부터 같이 읽어 보자."
];
for (const line of lecture) check(line, null);

// bare words that must not fire
check("다음", null);
check("처음", null);
check("정답", null);
check("정답은", null);
check("슬라이드", null);
check("넘어가자", null);
check("이번엔", null);
check("이쪽", null);
check("한쪽", null);
check("1번", null);
check("14번", null);

if (failed) {
  console.error(`\n${failed} failed, ${passed} passed`);
  process.exit(1);
}
console.log(`${passed} passed`);
