/**
 * ============================================================================
 * [내 몸 건강 체크] 기준표 및 설정 파일 (standards.js)
 * ----------------------------------------------------------------------------
 * - 서울연가초등학교 5학년 학생용 건강체력 자가 진단 기준표입니다.
 * - 선생님께서 기준 수치나 자세 판정 기준을 쉽게 수정하실 수 있도록
 *   화면/계산 로직(app.js)과 분리해 두었습니다.
 * - 출처: 학생건강체력평가제(PAPS) 초등 5학년 기준표
 *   (최신 기준은 교육부 학생건강정보센터 schoolhealth.kr 확인)
 * ============================================================================
 */

const HEALTH_STANDARDS = {
  // 학교 기본 정보 (고정 표시용)
  schoolInfo: {
    schoolName: "서울연가초등학교",
    grade: 5,
    maxClassNumber: 12, // 반 선택 최대 번호 (1반 ~ 12반)
  },

  // 입력값 현실 범위 검사 기준 (2단계 키·몸무게)
  bodyInputLimits: {
    heightMinCm: 100,
    heightMaxCm: 200,
    weightMinKg: 15,
    weightMaxKg: 120,
  },

  // --------------------------------------------------------------------------
  // 1. BMI (체질량지수, kg/m²) 기준표 - 초등학교 5학년
  //    경계값 빈틈이 없도록 ordered max 기준으로 판정하며, 참고용 min/max를 함께 둡니다.
  // --------------------------------------------------------------------------
  bmi: {
    grade: 5,
    unit: "kg/m²",
    male: [
      { key: "underweight", rawLabel: "마름", min: null, max: 14.3 },
      { key: "normal", rawLabel: "정상", min: 14.4, max: 20.9 },
      { key: "overweight", rawLabel: "과체중", min: 21.0, max: 23.3 },
      { key: "mildObesity", rawLabel: "경도비만", min: 23.4, max: 33.3 },
      { key: "severeObesity", rawLabel: "고도비만", min: 33.4, max: null },
    ],
    female: [
      { key: "underweight", rawLabel: "마름", min: null, max: 14.6 },
      { key: "normal", rawLabel: "정상", min: 14.7, max: 21.7 },
      { key: "overweight", rawLabel: "과체중", min: 21.8, max: 24.4 },
      { key: "mildObesity", rawLabel: "경도비만", min: 24.5, max: 34.5 },
      { key: "severeObesity", rawLabel: "고도비만", min: 34.6, max: null },
    ],
    // 학생 친화적 표시 매핑 (마름->저체중, 정상->정상체중, 경도/고도비만->비만, 과체중->과체중(비만 주의))
    displayMap: {
      underweight: {
        displayLabel: "저체중",
        detailLabel: "마름",
        emoji: "🌱",
        tone: "caution",
        papsGrade: 3, // PAPS 신체조성 연동 등급 (교사 수정 가능)
        message:
          "키가 크고 에너지가 많이 필요한 시기예요! 밥과 반찬을 골고루 먹고 가벼운 근력 운동을 함께해 보아요.",
      },
      normal: {
        displayLabel: "정상체중",
        detailLabel: "정상",
        emoji: "🌟",
        tone: "good",
        papsGrade: 1,
        message:
          "지금 키와 몸무게의 균형이 아주 좋아요! 앞으로도 골고루 먹고 규칙적으로 움직이며 건강을 지켜요.",
      },
      overweight: {
        displayLabel: "과체중(비만 주의)",
        detailLabel: "과체중",
        emoji: "🏃",
        tone: "caution",
        papsGrade: 3,
        message:
          "조금만 더 활발하게 움직이면 금세 균형이 맞아요! 매일 30분씩 즐겁게 걷고 뛰어 보아요.",
      },
      mildObesity: {
        displayLabel: "비만",
        detailLabel: "경도비만",
        emoji: "💪",
        tone: "alert",
        papsGrade: 4,
        message:
          "건강하게 자라기 위해 몸을 가볍게 움직이는 습관이 필요해요. 무리하지 않고 천천히 운동 시간을 늘려 보아요!",
      },
      severeObesity: {
        displayLabel: "비만",
        detailLabel: "고도비만",
        emoji: "🌈",
        tone: "alert",
        papsGrade: 5,
        message:
          "지금부터 하나씩 건강한 습관을 만들면 몸이 훨씬 가뿐해질 거예요. 가족·선생님과 함께 즐거운 운동을 시작해 보아요!",
      },
    },
  },

  // --------------------------------------------------------------------------
  // 2. PAPS 등급 공통 정보 (1~5등급)
  // --------------------------------------------------------------------------
  papsGrades: {
    1: { label: "1등급", description: "아주 높음", emoji: "🏆", color: "#10b981" },
    2: { label: "2등급", description: "높음", emoji: "⭐", color: "#3b82f6" },
    3: { label: "3등급", description: "보통", emoji: "👍", color: "#f59e0b" },
    4: { label: "4등급", description: "낮음", emoji: "💪", color: "#f97316" },
    5: { label: "5등급", description: "아주 낮음", emoji: "🌱", color: "#ef4444" },
  },

  // 영역별 점수(20점 만점) 및 종합 점수(100점 만점) 확장 설정
  // ※ 공식 세부 점수 환산표가 확인되지 않아 기본은 비활성화(null) 상태이며,
  //    선생님께서 학교 기준 점수표를 넣으시면 화면에 점수가 자동 표시되도록 확장 가능합니다.
  papsScoringConfig: {
    enabled: false, // TODO: 20점 만점 세부 점수 환산표 확인 후 true로 변경 및 아래 table 채우기
    maxAreaScore: 20,
    maxTotalScore: 100,
    // 예시 확장 구조: 등급별 대표 점수 (필요 시 종목별 세부 환산 함수로 교체 가능)
    gradeToDefaultScore: {
      1: null,
      2: null,
      3: null,
      4: null,
      5: null,
    },
  },

  // --------------------------------------------------------------------------
  // 3. PAPS 5개 영역 및 종목별 초등 5학년 기준표 (JSON 구조)
  //    - direction: "higher" (값이 클수록 좋음) | "lower" (값이 작을수록 좋음)
  //    - thresholds[gender][grade]: { min, max } (null은 끝이 열려 있음을 의미)
  // --------------------------------------------------------------------------
  papsAreas: [
    {
      id: "cardio",
      name: "심폐지구력",
      icon: "❤️",
      description: "오래 달리고 움직여도 지치지 않는 심장과 폐의 힘이에요.",
      events: [
        {
          id: "shuttleRun",
          name: "왕복오래달리기 (초등 15m)",
          unit: "회",
          grade: 5,
          direction: "higher",
          inputMode: "number",
          step: "1",
          minInput: 0,
          maxInput: 300,
          example: "예: 55",
          hint: "15m 구간을 왕복한 총 횟수를 숫자로 적어요.",
          thresholds: {
            male: {
              5: { min: null, max: 28 },
              4: { min: 29, max: 49 },
              3: { min: 50, max: 72 },
              2: { min: 73, max: 99 },
              1: { min: 100, max: null },
            },
            female: {
              5: { min: null, max: 22 },
              4: { min: 23, max: 44 },
              3: { min: 45, max: 62 },
              2: { min: 63, max: 84 },
              1: { min: 85, max: null },
            },
          },
        },
        {
          id: "runWalk1000",
          name: "오래달리기-걷기 (1000m)",
          unit: "초",
          grade: 5,
          direction: "lower", // 작을수록(빠를수록) 좋은 종목
          inputMode: "minsec", // 분·초 입력 시 초(s)로 자동 변환
          step: "1",
          minInput: 60,
          maxInput: 1800,
          example: "예: 6분 10초 (370초)",
          hint: "분과 초를 입력하면 자동으로 초로 계산해 줘요. 기록이 짧을수록 좋아요!",
          thresholds: {
            male: {
              5: { min: 480, max: null },
              4: { min: 410, max: 479 },
              3: { min: 325, max: 409 },
              2: { min: 282, max: 324 },
              1: { min: null, max: 281 },
            },
            female: {
              5: { min: 502, max: null },
              4: { min: 442, max: 501 },
              3: { min: 360, max: 441 },
              2: { min: 300, max: 359 },
              1: { min: null, max: 299 },
            },
          },
        },
        {
          id: "stepTest",
          name: "스텝 검사",
          unit: "점 (PEI)",
          grade: 5,
          direction: "higher",
          inputMode: "number",
          step: "0.1",
          minInput: 10,
          maxInput: 150,
          example: "예: 58",
          hint: "스텝 박스 검사 후 계산된 신체효율지수(PEI) 점수를 적어요.",
          // 성별 공통 기준
          thresholds: {
            male: {
              5: { min: null, max: 46 },
              4: { min: 47, max: 51 },
              3: { min: 52, max: 61 },
              2: { min: 62, max: 75 },
              1: { min: 76, max: null },
            },
            female: {
              5: { min: null, max: 46 },
              4: { min: 47, max: 51 },
              3: { min: 52, max: 61 },
              2: { min: 62, max: 75 },
              1: { min: 76, max: null },
            },
          },
        },
      ],
    },
    {
      id: "strength",
      name: "근력 및 근지구력",
      icon: "💪",
      description: "근육이 힘을 내고 오래 버티는 능력이에요.",
      events: [
        {
          id: "curlUp",
          name: "윗몸 말아올리기",
          unit: "회",
          grade: 5,
          direction: "higher",
          inputMode: "number",
          step: "1",
          minInput: 0,
          maxInput: 200,
          example: "예: 28",
          hint: "신호음에 맞춰 성공한 총 횟수를 적어요.",
          thresholds: {
            male: {
              5: { min: null, max: 9 },
              4: { min: 10, max: 21 },
              3: { min: 22, max: 39 },
              2: { min: 40, max: 79 },
              1: { min: 80, max: null },
            },
            female: {
              5: { min: null, max: 6 },
              4: { min: 7, max: 22 },
              3: { min: 23, max: 35 },
              2: { min: 36, max: 59 },
              1: { min: 60, max: null },
            },
          },
        },
        {
          id: "gripStrength",
          name: "악력 검사",
          unit: "kg",
          grade: 5,
          direction: "higher",
          inputMode: "number",
          step: "0.1",
          minInput: 1,
          maxInput: 80,
          example: "예: 18.5",
          hint: "왼손과 오른손 중 더 높은 기록(또는 학교 안내 기록)을 kg 단위로 적어요.",
          thresholds: {
            male: {
              5: { min: null, max: 12.4 },
              4: { min: 12.5, max: 16.9 },
              3: { min: 17.0, max: 22.9 },
              2: { min: 23.0, max: 30.9 },
              1: { min: 31.0, max: null },
            },
            female: {
              5: { min: null, max: 11.9 },
              4: { min: 12.0, max: 15.4 },
              3: { min: 15.5, max: 18.9 },
              2: { min: 19.0, max: 28.9 },
              1: { min: 29.0, max: null },
            },
          },
        },
        {
          id: "kneePushUp",
          name: "무릎 대고 팔굽혀펴기",
          unit: "회",
          grade: 5,
          direction: "higher",
          inputMode: "number",
          step: "1",
          minInput: 0,
          maxInput: 150,
          example: "예: 15",
          hint: "무릎을 대고 팔을 굽혔다 편 횟수를 적어요.",
          // TODO: 초등 5학년 무릎 대고 팔굽혀펴기 공식 기준표 확인 후 male/female 등급 구간을 채워 주세요.
          // 현재는 기준값이 비어 있어(null) 화면에 '기준표 준비 중 – 선생님께 문의하세요'가 표시됩니다.
          thresholds: null,
        },
      ],
    },
    {
      id: "flexibility",
      name: "유연성",
      icon: "🤸",
      description: "몸과 관절을 부드럽게 굽히고 펴는 능력이에요.",
      events: [
        {
          id: "sitAndReach",
          name: "앉아 윗몸 앞으로 굽히기",
          unit: "cm",
          grade: 5,
          direction: "higher",
          inputMode: "number",
          allowNegative: true,
          step: "0.1",
          minInput: -30,
          maxInput: 50,
          example: "예: 4.5 (또는 -2.0)",
          hint: "발끝에 못 미쳤다면 마이너스(-)를 붙여서 입력할 수 있어요.",
          thresholds: {
            male: {
              5: { min: null, max: -4.1 },
              4: { min: -4.0, max: 0.9 },
              3: { min: 1.0, max: 4.9 },
              2: { min: 5.0, max: 7.9 },
              1: { min: 8.0, max: null },
            },
            female: {
              5: { min: null, max: 0 },
              4: { min: 0.1, max: 4.9 },
              3: { min: 5.0, max: 6.9 },
              2: { min: 7.0, max: 9.9 },
              1: { min: 10.0, max: null },
            },
          },
        },
        {
          id: "comprehensiveFlexibility",
          name: "종합 유연성 검사",
          unit: "점",
          grade: 5,
          direction: "higher",
          inputMode: "number",
          step: "1",
          minInput: 0,
          maxInput: 8,
          example: "예: 6",
          hint: "어깨·몸통·옆구리·하체 동작 성공 점수(0~8점)를 적어요.",
          // 성별 공통 기준
          thresholds: {
            male: {
              5: { min: null, max: 4 },
              4: { min: 5, max: 5 },
              3: { min: 6, max: 6 },
              2: { min: 7, max: 7 },
              1: { min: 8, max: null },
            },
            female: {
              5: { min: null, max: 4 },
              4: { min: 5, max: 5 },
              3: { min: 6, max: 6 },
              2: { min: 7, max: 7 },
              1: { min: 8, max: null },
            },
          },
        },
      ],
    },
    {
      id: "power",
      name: "순발력",
      icon: "⚡",
      description: "짧은 순간에 빠르고 강하게 힘을 내는 능력이에요.",
      events: [
        {
          id: "run50m",
          name: "50m 달리기",
          unit: "초",
          grade: 5,
          direction: "lower", // 작을수록(빠를수록) 좋은 종목
          inputMode: "number",
          step: "0.01",
          minInput: 4,
          maxInput: 30,
          example: "예: 9.85",
          hint: "초 단위로 적어요. 숫자가 작을수록(더 빠를수록) 높은 등급이에요!",
          thresholds: {
            male: {
              5: { min: 13.21, max: null },
              4: { min: 10.21, max: 13.2 },
              3: { min: 9.41, max: 10.2 },
              2: { min: 8.51, max: 9.4 },
              1: { min: null, max: 8.5 },
            },
            female: {
              5: { min: 13.01, max: null },
              4: { min: 10.71, max: 13.0 },
              3: { min: 9.91, max: 10.7 },
              2: { min: 8.91, max: 9.9 },
              1: { min: null, max: 8.9 },
            },
          },
        },
        {
          id: "standingLongJump",
          name: "제자리멀리뛰기",
          unit: "cm",
          grade: 5,
          direction: "higher",
          inputMode: "number",
          step: "0.1",
          minInput: 30,
          maxInput: 300,
          example: "예: 145.5",
          hint: "멀리 뛴 거리를 cm 단위로 적어요.",
          thresholds: {
            male: {
              5: { min: null, max: 111 },
              4: { min: 111.1, max: 141 },
              3: { min: 141.1, max: 159 },
              2: { min: 159.1, max: 180 },
              1: { min: 180.1, max: null },
            },
            female: {
              5: { min: null, max: 100 },
              4: { min: 100.1, max: 123 },
              3: { min: 123.1, max: 139 },
              2: { min: 139.1, max: 170 },
              1: { min: 170.1, max: null },
            },
          },
        },
      ],
    },
    {
      id: "bodyComp",
      name: "신체조성(체지방)",
      icon: "⚖️",
      description: "키에 비해 몸무게와 체지방이 알맞은지 살펴보아요.",
      autoLinkedToBmi: true,
      events: [
        {
          id: "bmiAuto",
          name: "체질량지수 (BMI · 2단계 자동 연동)",
          unit: "kg/m²",
          grade: 5,
          direction: "bmi",
          inputMode: "autoBmi",
          example: "2단계 값 자동 반영",
          hint: "2단계에서 계산한 BMI로 자동 판정돼요. 체지방률(%Fat)은 알고 있을 때만 선택으로 적어 주세요.",
        },
      ],
    },
  ],

  // --------------------------------------------------------------------------
  // 4. AI 자세 분석 임계값 (4단계 웹캠 촬영)
  //    선생님께서 학교 환경이나 민감도에 따라 숫자를 손쉽게 조정하실 수 있습니다.
  // --------------------------------------------------------------------------
  postureThresholds: {
    // 랜드마크 최소 신뢰도 (0~1). 전신 랜드마크가 이 값 이상이어야 촬영 인정
    minVisibility: 0.45,
    // 정면 분석 임계값
    front: {
      // 좌우 어깨 기울기 각도 (도)
      shoulderTiltDeg: { goodMax: 2.5, cautionMax: 5.0 },
      // 좌우 골반 기울기 각도 (도)
      pelvisTiltDeg: { goodMax: 2.5, cautionMax: 5.0 },
      // 머리 중심(코·귀)이 몸 중심선에서 벗어난 정도 (어깨 너비 대비 비율)
      headOffsetRatio: { goodMax: 0.14, cautionMax: 0.28 },
      // 몸통 중심선의 수직 기울기 각도 (도)
      torsoTiltDeg: { goodMax: 2.5, cautionMax: 5.0 },
    },
    // 옆모습 분석 임계값
    side: {
      // 거북목: 귀가 어깨보다 앞으로 나온 정도 (상체 길이 대비 비율)
      forwardHeadRatio: { goodMax: 0.12, cautionMax: 0.22 },
      // 몸통 앞뒤 기울기 각도 (도)
      torsoLeanDeg: { goodMax: 4.0, cautionMax: 8.0 },
      // 귀-어깨-엉덩이-무릎-발목 수직 정렬 평균 편차 (전신 키 대비 비율)
      verticalAlignRatio: { goodMax: 0.04, cautionMax: 0.08 },
    },
  },

  // --------------------------------------------------------------------------
  // 5. 서울 7330 일주일 운동 스케줄 구성 데이터 (6단계)
  // --------------------------------------------------------------------------
  seoul7330: {
    slogan: "서울 7330: 일주일 3번 이상, 하루 30분 이상 운동하기",
    description:
      "서울 7330 캠페인은 일주일(7일)에 3번 이상, 하루 30분씩 꾸준히 운동해 건강을 지키는 생활체육 약속이에요!",
    warmupOptions: [
      "목·어깨·손목·발목 돌리기 + 제자리 가볍게 걷기 (5분)",
      "팔 크게 돌리기 + 무릎 굽혔다 펴기 + 기지개 켜기 (5분)",
      "가벼운 제자리 뛰기 + 옆구리·허리 천천히 늘리기 (5분)",
    ],
    cooldownOptions: [
      "깊게 숨 들이마시고 내쉬기 + 종아리·허벅지 스트레칭 (5분)",
      "어깨 힘 빼고 털기 + 허리·등 부드럽게 펴주기 (5분)",
      "천천히 제자리 걸으며 심장 박동 가라앉히기 + 전신 기지개 (5분)",
    ],
    // 영역별 보강 본운동 (20분)
    areaWorkouts: {
      cardio: [
        "신나는 음악에 맞춰 줄넘기 연습 (쉬면서 20분)",
        "공원이나 운동장 빠르게 걷기·가볍게 달리기 번갈아 하기 (20분)",
        "낮은 계단 오르내리기 + 제자리 뛰기 놀이 (20분)",
      ],
      strength: [
        "윗몸 말아올리기 + 무릎 대고 팔굽혀펴기 + 플랭크 20초씩 3세트 (20분)",
        "스쿼트(의자 앉기 자세) + 슈퍼맨 등 운동 10회씩 3세트 (20분)",
        "배와 팔 힘 기르기 서킷 (팔 벌려 뛰기 + 벽 짚고 팔굽혀펴기) (20분)",
      ],
      flexibility: [
        "앉아 윗몸 앞으로 굽히기 + 나비 자세 다리 늘리기 스트레칭 (20분)",
        "어린이 요가 (고양이-소 자세, 코브라 자세, 옆구리 늘리기) (20분)",
        "온몸 쭉쭉 늘리기 (어깨·등·허벅지 뒤쪽 스트레칭) (20분)",
      ],
      power: [
        "짧은 거리 왕복 달리기 놀이 + 제자리 높이 뛰기 (20분)",
        "줄넘기 빠르게 뛰기 + 개구리 점프 10회씩 3세트 (20분)",
        "사다리 스텝처럼 빠르게 발 바꾸기 + 앞뒤 점프 놀이 (20분)",
      ],
      lowImpactCardio: [
        "무릎에 무리 없는 힘찬 빠르게 걷기 (20분)",
        "안전한 곳에서 자전거 타기 또는 실내 제자리 걷기 (20분)",
        "물놀이·수영 또는 가벼운 리듬 체조 댄스 (20분)",
      ],
      postureCare: [
        "코어·등 근육 강화 (고양이-소 자세, 버드독, 벽에 등 붙이고 서기) (20분)",
        "목·어깨 펴기 스트레칭 + 엎드려 상체 들기(슈퍼맨 자세) (20분)",
      ],
      funChoices: [
        "내가 좋아하는 운동: 배드민턴 또는 줄넘기 놀이 (20분)",
        "내가 좋아하는 운동: 친구·가족과 축구/피구/농구 놀이 (20분)",
        "내가 좋아하는 운동: 자전거 타기 또는 신나는 댄스 (20분)",
        "내가 좋아하는 운동: 산책로 힘차게 걷기 또는 인라인/수영 (20분)",
      ],
    },
    restDayActivities: [
      "푹 쉬면서 물 충분히 마시고 일찍 자기 😴",
      "5분만 가볍게 목·허리 기지개 켜고 산책하기 🌿",
      "좋아하는 책 읽기 & 바른 자세로 앉기 연습하기 📚",
    ],
  },
};

// 브라우저 전역 등록 및 Node.js 테스트 호환 지원
if (typeof window !== "undefined") {
  window.HEALTH_STANDARDS = HEALTH_STANDARDS;
}
if (typeof module !== "undefined" && module.exports) {
  module.exports = HEALTH_STANDARDS;
}
