/**
 * ============================================================================
 * [내 몸 건강 체크] 메인 애플리케이션 로직 (app.js)
 * ----------------------------------------------------------------------------
 * - 서버 통신 없이 브라우저 메모리(state)에서만 동작합니다.
 * - 기준표 데이터는 standards.js(window.HEALTH_STANDARDS)에서 읽어옵니다.
 * - 4단계 AI 자세 분석은 @mediapipe/tasks-vision CDN을 동적으로 불러와 실행합니다.
 * ============================================================================
 */

(function () {
  "use strict";

  const STANDARDS = window.HEALTH_STANDARDS;

  // --------------------------------------------------------------------------
  // 1. 순수 계산 및 판정 함수 (테스트 및 화면 양쪽에서 사용)
  // --------------------------------------------------------------------------

  /**
   * 키(cm)와 몸무게(kg)로 BMI 계산 및 5학년 성별 기준 판정
   * - 경계값 빈틈이 없도록 ordered max 비교 사용
   */
  function evaluateBmi(heightCm, weightKg, gender) {
    const heightM = heightCm / 100;
    const rawBmi = weightKg / (heightM * heightM);
    // 소수점 첫째 자리로 반올림 (표시 및 경계값 일관성 유지)
    const bmi = Math.round(rawBmi * 10) / 10;

    const brackets = STANDARDS.bmi[gender];
    let matched = brackets[brackets.length - 1];
    for (let i = 0; i < brackets.length; i++) {
      const b = brackets[i];
      if (b.max === null || bmi <= b.max) {
        matched = b;
        break;
      }
    }

    const meta = STANDARDS.bmi.displayMap[matched.key];
    return {
      bmi,
      key: matched.key,
      rawLabel: matched.rawLabel,
      displayLabel: meta.displayLabel,
      detailLabel: meta.detailLabel,
      emoji: meta.emoji,
      tone: meta.tone,
      papsGrade: meta.papsGrade,
      message: meta.message,
    };
  }

  /**
   * 특정 PAPS 종목의 기록으로 1~5등급 판정
   * - direction === "higher": 값이 클수록 좋음 (5등급 max부터 오름차순 비교)
   * - direction === "lower": 값이 작을수록 좋음 (1등급 max부터 오름차순 비교)
   * - thresholds === null인 종목(무릎 대고 팔굽혀펴기)은 pending: true 반환
   */
  function evaluatePapsEvent(eventId, value, gender) {
    let foundEvent = null;
    for (const area of STANDARDS.papsAreas) {
      const hit = area.events.find((ev) => ev.id === eventId);
      if (hit) {
        foundEvent = hit;
        break;
      }
    }
    if (!foundEvent) return null;

    if (!foundEvent.thresholds) {
      return {
        pending: true,
        grade: null,
        message: "기준표 준비 중 – 선생님께 문의하세요",
      };
    }

    const table = foundEvent.thresholds[gender];
    if (!table) {
      return {
        pending: true,
        grade: null,
        message: "기준표 준비 중 – 선생님께 문의하세요",
      };
    }

    let grade = 3;
    if (foundEvent.direction === "higher") {
      // 5등급(가장 작은 구간)부터 상한(max) 이하인지 순서대로 확인 -> 구간 빈틈 없음
      const order = [5, 4, 3, 2, 1];
      grade = 1;
      for (const g of order) {
        const bound = table[g];
        if (bound.max === null || value <= bound.max) {
          grade = g;
          break;
        }
      }
    } else {
      // 작을수록 좋은 종목: 1등급(가장 빠른 시간) 상한(max)부터 순서대로 확인
      const order = [1, 2, 3, 4, 5];
      grade = 5;
      for (const g of order) {
        const bound = table[g];
        if (bound.max === null || value <= bound.max) {
          grade = g;
          break;
        }
      }
    }

    const meta = STANDARDS.papsGrades[grade];
    // 향후 점수 환산 확장 구조 지원 (enabled === true일 때 점수 반환)
    let areaScore = null;
    if (STANDARDS.papsScoringConfig.enabled) {
      areaScore = STANDARDS.papsScoringConfig.gradeToDefaultScore[grade] ?? null;
    }

    return {
      pending: false,
      grade,
      label: meta.label,
      description: meta.description,
      emoji: meta.emoji,
      color: meta.color,
      areaScore,
    };
  }

  /**
   * 임계값 기준 단일 자세 지표 상태 판정 ("바른 자세" | "주의" | "전문가 확인 권장")
   */
  function judgeThreshold(value, threshold) {
    if (value <= threshold.goodMax) {
      return { level: "good", label: "바른 자세" };
    }
    if (value <= threshold.cautionMax) {
      return { level: "caution", label: "주의" };
    }
    return { level: "alert", label: "전문가 확인 권장" };
  }

  /**
   * MediaPipe 33개 랜드마크로 정면 자세 지표 계산
   */
  function analyzeFrontLandmarks(landmarks, width, height) {
    const ls = landmarks[11]; // 왼쪽 어깨
    const rs = landmarks[12]; // 오른쪽 어깨
    const lh = landmarks[23]; // 왼쪽 엉덩이
    const rh = landmarks[24]; // 오른쪽 엉덩이
    const nose = landmarks[0];
    const le = landmarks[7];
    const re = landmarks[8];

    const shoulderDx = Math.abs(ls.x - rs.x) * width;
    const shoulderDy = Math.abs(ls.y - rs.y) * height;
    const shoulderTiltDeg = Number(
      (Math.atan2(shoulderDy, Math.max(shoulderDx, 1)) * (180 / Math.PI)).toFixed(1)
    );

    const pelvisDx = Math.abs(lh.x - rh.x) * width;
    const pelvisDy = Math.abs(lh.y - rh.y) * height;
    const pelvisTiltDeg = Number(
      (Math.atan2(pelvisDy, Math.max(pelvisDx, 1)) * (180 / Math.PI)).toFixed(1)
    );

    const midShoulderX = (ls.x + rs.x) / 2;
    const midShoulderY = (ls.y + rs.y) / 2;
    const midHipX = (lh.x + rh.x) / 2;
    const midHipY = (lh.y + rh.y) / 2;
    const bodyMidX = (midShoulderX + midHipX) / 2;

    // 코와 양쪽 귀의 평균 x로 머리 중심 추정
    const headPoints = [nose, le, re].filter(
      (p) => p && (p.visibility === undefined || p.visibility >= 0.3)
    );
    const headCenterX =
      headPoints.reduce((sum, p) => sum + p.x, 0) / Math.max(headPoints.length, 1);
    const shoulderWidthPx = Math.max(Math.hypot((ls.x - rs.x) * width, (ls.y - rs.y) * height), 20);
    const headOffsetRatio = Number(
      ((Math.abs(headCenterX - bodyMidX) * width) / shoulderWidthPx).toFixed(2)
    );

    const torsoDx = Math.abs(midShoulderX - midHipX) * width;
    const torsoDy = Math.max(Math.abs(midHipY - midShoulderY) * height, 1);
    const torsoTiltDeg = Number((Math.atan2(torsoDx, torsoDy) * (180 / Math.PI)).toFixed(1));

    const cfg = STANDARDS.postureThresholds.front;
    const metrics = [
      {
        id: "shoulderTilt",
        name: "좌우 어깨 높이 차이(기울기)",
        valueText: `${shoulderTiltDeg}°`,
        ...judgeThreshold(shoulderTiltDeg, cfg.shoulderTiltDeg),
      },
      {
        id: "pelvisTilt",
        name: "좌우 골반 높이 차이(기울기)",
        valueText: `${pelvisTiltDeg}°`,
        ...judgeThreshold(pelvisTiltDeg, cfg.pelvisTiltDeg),
      },
      {
        id: "headOffset",
        name: "머리 중심이 몸 중심선에서 벗어난 정도",
        valueText: `${Math.round(headOffsetRatio * 100)}%`,
        ...judgeThreshold(headOffsetRatio, cfg.headOffsetRatio),
      },
      {
        id: "torsoTilt",
        name: "몸통 중심선의 기울기",
        valueText: `${torsoTiltDeg}°`,
        ...judgeThreshold(torsoTiltDeg, cfg.torsoTiltDeg),
      },
    ];

    const alertCount = metrics.filter((m) => m.level === "alert").length;
    const cautionCount = metrics.filter((m) => m.level === "caution").length;

    let scoliosisStatus = { level: "good", label: "특이 소견 없음 (균형 좋음)" };
    if (alertCount >= 1 || cautionCount >= 2) {
      scoliosisStatus = {
        level: "alert",
        label: "척추 측만 의심 소견 (전문가 확인 권장)",
      };
    } else if (cautionCount === 1) {
      scoliosisStatus = {
        level: "caution",
        label: "약간의 좌우 기울기 주의",
      };
    }

    return { metrics, scoliosisStatus };
  }

  /**
   * MediaPipe 33개 랜드마크로 옆모습 자세 지표 계산
   */
  function analyzeSideLandmarks(landmarks, width, height) {
    // 왼쪽(7,11,23,25,27) vs 오른쪽(8,12,24,26,28) 중 더 잘 보이는 쪽 선택
    const leftIdx = [7, 11, 23, 25, 27];
    const rightIdx = [8, 12, 24, 26, 28];
    const leftVis = leftIdx.reduce((s, i) => s + (landmarks[i].visibility || 0), 0);
    const rightVis = rightIdx.reduce((s, i) => s + (landmarks[i].visibility || 0), 0);
    const useLeft = leftVis >= rightVis;

    const ear = landmarks[useLeft ? 7 : 8];
    const shoulder = landmarks[useLeft ? 11 : 12];
    const hip = landmarks[useLeft ? 23 : 24];
    const knee = landmarks[useLeft ? 25 : 26];
    const ankle = landmarks[useLeft ? 27 : 28];
    const nose = landmarks[0];

    // 코가 귀보다 왼쪽에 있으면 왼쪽을 바라보는 중(-1), 오른쪽이면 (+1)
    const facingDir = nose.x < ear.x ? -1 : 1;
    const torsoHeightPx = Math.max(
      Math.hypot((shoulder.x - hip.x) * width, (shoulder.y - hip.y) * height),
      30
    );
    const bodyHeightPx = Math.max(Math.abs(ankle.y - ear.y) * height, 60);

    // 거북목: 귀가 어깨보다 바라보는 방향 앞으로 나온 정도
    const forwardDeltaPx = Math.max(0, (ear.x - shoulder.x) * facingDir * width);
    const forwardHeadRatio = Number((forwardDeltaPx / torsoHeightPx).toFixed(2));

    // 몸통 앞뒤 기울기
    const torsoDx = Math.abs(shoulder.x - hip.x) * width;
    const torsoDy = Math.max(Math.abs(hip.y - shoulder.y) * height, 1);
    const torsoLeanDeg = Number((Math.atan2(torsoDx, torsoDy) * (180 / Math.PI)).toFixed(1));

    // 귀-어깨-엉덩이-무릎-발목 수직 정렬 평균 편차
    const chain = [ear, shoulder, hip, knee, ankle];
    const meanX = chain.reduce((s, p) => s + p.x, 0) / chain.length;
    const avgDeviationPx =
      chain.reduce((s, p) => s + Math.abs(p.x - meanX) * width, 0) / chain.length;
    const verticalAlignRatio = Number((avgDeviationPx / bodyHeightPx).toFixed(3));

    const cfg = STANDARDS.postureThresholds.side;
    const metrics = [
      {
        id: "forwardHead",
        name: "거북목 (귀가 어깨보다 앞으로 나온 정도)",
        valueText: `${Math.round(forwardHeadRatio * 100)}%`,
        ...judgeThreshold(forwardHeadRatio, cfg.forwardHeadRatio),
      },
      {
        id: "torsoLean",
        name: "몸통 앞뒤 기울기",
        valueText: `${torsoLeanDeg}°`,
        ...judgeThreshold(torsoLeanDeg, cfg.torsoLeanDeg),
      },
      {
        id: "verticalAlign",
        name: "귀-어깨-엉덩이-무릎-발목 수직 정렬",
        valueText: `${Math.round(verticalAlignRatio * 100)}%`,
        ...judgeThreshold(verticalAlignRatio, cfg.verticalAlignRatio),
      },
    ];

    return { metrics };
  }

  // 테스트 및 디버깅용 순수 판정 함수 노출
  window.HEALTH_EVALUATORS = {
    evaluateBmi,
    evaluatePapsEvent,
    analyzeFrontLandmarks,
    analyzeSideLandmarks,
  };

  // --------------------------------------------------------------------------
  // 2. 브라우저 메모리 전용 상태 (State) - 외부 전송 및 저장 안 함
  // --------------------------------------------------------------------------
  const state = {
    currentStep: 1,
    maxVisitedStep: 1,
    student: {
      school: STANDARDS.schoolInfo.schoolName,
      grade: STANDARDS.schoolInfo.grade,
      classNum: "",
      name: "",
      gender: "", // "male" | "female"
    },
    body: {
      heightCm: null,
      weightKg: null,
      bmiResult: null,
    },
    paps: {
      cardio: { eventId: "shuttleRun", rawValue: null, min: "", sec: "", result: null },
      strength: { eventId: "curlUp", rawValue: null, result: null },
      flexibility: { eventId: "sitAndReach", rawValue: null, result: null },
      power: { eventId: "run50m", rawValue: null, result: null },
      bodyComp: { eventId: "bmiAuto", bodyFatOptional: null, result: null },
    },
    posture: {
      skipped: false,
      front: null, // { imageDataUrl, metrics, scoliosisStatus }
      side: null, // { imageDataUrl, metrics }
    },
    schedule: {
      favoriteWorkoutIndex: 0,
      days: [],
      checkedDays: [false, false, false, false, false, false, false],
    },
  };

  // 웹캠 및 MediaPipe 런타임 변수 (메모리 내 실시간 처리용)
  let cameraStream = null;
  let poseLandmarker = null;
  let poseLoading = false;
  let activePoseMode = "front"; // "front" | "side"
  let animFrameId = null;
  let lastLiveLandmarks = null;
  let lastBodyInFrame = false;
  let countdownTimerId = null;

  // --------------------------------------------------------------------------
  // 3. DOM 요소 캐싱 & 초기화
  // --------------------------------------------------------------------------
  const $ = (id) => document.getElementById(id);

  function initApp() {
    populateClassOptions();
    bindNavigationEvents();
    bindStep1Events();
    bindStep2Events();
    renderPapsCards();
    bindStep4Events();
    bindResultAndScheduleEvents();
    goToStep(1);
  }

  function populateClassOptions() {
    const select = $("input-class");
    for (let c = 1; c <= STANDARDS.schoolInfo.maxClassNumber; c++) {
      const opt = document.createElement("option");
      opt.value = String(c);
      opt.textContent = `${c}반`;
      select.appendChild(opt);
    }
  }

  // --------------------------------------------------------------------------
  // 4. 단계 이동 & 진행 표시줄 관리
  // --------------------------------------------------------------------------
  function goToStep(stepNum) {
    // 4단계를 벗어날 때는 카메라를 자동 종료해 개인정보 및 배터리 보호
    if (state.currentStep === 4 && stepNum !== 4) {
      stopCamera();
    }

    state.currentStep = stepNum;
    if (stepNum > state.maxVisitedStep) {
      state.maxVisitedStep = stepNum;
    }

    for (let i = 1; i <= 6; i++) {
      const sec = $(`step-${i}`);
      if (sec) {
        const active = i === stepNum;
        sec.hidden = !active;
        sec.classList.toggle("is-active", active);
      }
    }

    document.querySelectorAll(".progress-item").forEach((item) => {
      const s = Number(item.dataset.step);
      item.classList.toggle("is-active", s === stepNum);
      item.classList.toggle("is-done", s < stepNum);
    });

    if (stepNum === 3) {
      syncStep3BmiLink();
      recalcAllPapsUI();
    } else if (stepNum === 5) {
      renderStep5Results();
    } else if (stepNum === 6) {
      buildAndRenderSchedule();
    }

    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function bindNavigationEvents() {
    document.querySelectorAll(".progress-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const target = Number(btn.dataset.stepTarget);
        if (target <= state.maxVisitedStep) {
          goToStep(target);
        } else if (target === state.currentStep + 1) {
          // 다음 단계 버튼과 동일한 검증 흐름 적용
          const nextBtn = $(`btn-step${state.currentStep}-next`);
          if (nextBtn) nextBtn.click();
        }
      });
    });
  }

  // --------------------------------------------------------------------------
  // 5. 1단계: 학생 정보 입력 및 검증
  // --------------------------------------------------------------------------
  function bindStep1Events() {
    const maleBtn = $("btn-gender-male");
    const femaleBtn = $("btn-gender-female");

    const selectGender = (g) => {
      state.student.gender = g;
      maleBtn.classList.toggle("is-selected", g === "male");
      femaleBtn.classList.toggle("is-selected", g === "female");
      hideBanner($("step1-error"));
    };

    maleBtn.addEventListener("click", () => selectGender("male"));
    femaleBtn.addEventListener("click", () => selectGender("female"));

    $("btn-step1-next").addEventListener("click", () => {
      const classNum = $("input-class").value.trim();
      const name = $("input-name").value.trim();
      const gender = state.student.gender;

      if (!classNum) {
        showBanner($("step1-error"), "😊 몇 반인지 숫자를 먼저 골라 주세요!");
        $("input-class").focus();
        return;
      }
      if (!name) {
        showBanner($("step1-error"), "😊 이름을 입력해야 다음 단계로 넘어갈 수 있어요!");
        $("input-name").focus();
        return;
      }
      if (!gender) {
        showBanner($("step1-error"), "😊 남학생 또는 여학생 버튼을 눌러 성별을 선택해 주세요!");
        return;
      }

      state.student.classNum = classNum;
      state.student.name = name;
      hideBanner($("step1-error"));

      // 성별이 바뀐 뒤 재계산이 필요할 수 있으므로 BMI가 있으면 재판정
      if (state.body.heightCm && state.body.weightKg) {
        updateBmiResultUI();
      }
      goToStep(2);
    });
  }

  // --------------------------------------------------------------------------
  // 6. 2단계: 키·몸무게 입력과 BMI 판정
  // --------------------------------------------------------------------------
  function bindStep2Events() {
    $("btn-calc-bmi").addEventListener("click", () => {
      validateAndComputeBmi();
    });

    $("btn-step2-prev").addEventListener("click", () => goToStep(1));

    $("btn-step2-next").addEventListener("click", () => {
      if (validateAndComputeBmi()) {
        goToStep(3);
      }
    });
  }

  function hasMoreThanOneDecimal(str) {
    const parts = str.trim().split(".");
    return parts.length === 2 && parts[1].length > 1;
  }

  function validateAndComputeBmi() {
    const hStr = $("input-height").value;
    const wStr = $("input-weight").value;
    const h = Number(hStr);
    const w = Number(wStr);
    const limits = STANDARDS.bodyInputLimits;
    const errEl = $("step2-error");

    if (!hStr || !wStr || Number.isNaN(h) || Number.isNaN(w)) {
      showBanner(errEl, "📏 키와 몸무게를 모두 숫자로 입력해 주세요!");
      return false;
    }
    if (hasMoreThanOneDecimal(hStr) || hasMoreThanOneDecimal(wStr)) {
      showBanner(errEl, "🔢 키와 몸무게는 소수점 첫째 자리까지만 입력해 주세요! (예: 145.5)");
      return false;
    }
    if (
      h < limits.heightMinCm ||
      h > limits.heightMaxCm ||
      w < limits.weightMinKg ||
      w > limits.weightMaxKg
    ) {
      showBanner(
        errEl,
        `🤔 입력한 값을 다시 확인해 주세요! (키 ${limits.heightMinCm}~${limits.heightMaxCm}cm, 몸무게 ${limits.weightMinKg}~${limits.weightMaxKg}kg 범위)`
      );
      return false;
    }

    hideBanner(errEl);
    state.body.heightCm = h;
    state.body.weightKg = w;
    updateBmiResultUI();
    return true;
  }

  function updateBmiResultUI() {
    if (!state.body.heightCm || !state.body.weightKg || !state.student.gender) return;
    const res = evaluateBmi(state.body.heightCm, state.body.weightKg, state.student.gender);
    state.body.bmiResult = res;

    const card = $("bmi-result-card");
    card.hidden = false;
    card.className = `bmi-result-card tone-${res.tone}`;
    $("bmi-emoji").textContent = res.emoji;
    $("bmi-value-display").textContent = res.bmi.toFixed(1);
    $("bmi-status-badge").textContent = res.displayLabel;
    $("bmi-detail-note").textContent =
      res.displayLabel === "비만" ? `(세부 기준: ${res.detailLabel})` : "";
    $("bmi-encouragement").textContent = res.message;

    const genderText = state.student.gender === "male" ? "남학생" : "여학생";
    $("bmi-standard-note").textContent = `적용 기준: 초등 5학년 ${genderText} 체질량지수(BMI) 기준표`;

    // 구간 바 활성화 표시
    document.querySelectorAll(".bmi-meter-seg").forEach((el) => el.classList.remove("is-current"));
    if (res.key === "underweight") document.querySelector(".seg-under").classList.add("is-current");
    else if (res.key === "normal") document.querySelector(".seg-normal").classList.add("is-current");
    else if (res.key === "overweight") document.querySelector(".seg-over").classList.add("is-current");
    else document.querySelector(".seg-obese").classList.add("is-current");
  }

  // --------------------------------------------------------------------------
  // 7. 3단계: PAPS 기록 입력 및 등급 판정
  // --------------------------------------------------------------------------
  function renderPapsCards() {
    const container = $("paps-areas-container");
    container.innerHTML = "";

    STANDARDS.papsAreas.forEach((area) => {
      const card = document.createElement("div");
      card.className = "paps-area-card";
      card.id = `paps-card-${area.id}`;

      const eventOptionsHtml = area.events
        .map((ev) => `<option value="${ev.id}">${ev.name}</option>`)
        .join("");

      card.innerHTML = `
        <div class="paps-area-head">
          <div>
            <h3 class="paps-area-title">${area.icon} ${area.name}</h3>
            <p class="paps-area-desc">${area.description}</p>
          </div>
          <span class="paps-grade-pill grade-none" id="paps-badge-${area.id}">미입력</span>
        </div>
        <div class="paps-inputs-row">
          <div class="field-group">
            <label class="field-label" for="paps-event-${area.id}">측정 종목 고르기</label>
            <select class="select-input" id="paps-event-${area.id}" ${
        area.events.length === 1 ? "disabled" : ""
      }>
              ${eventOptionsHtml}
            </select>
          </div>
          <div class="field-group" id="paps-input-slot-${area.id}"></div>
        </div>
        <div id="paps-extra-${area.id}"></div>
      `;

      container.appendChild(card);

      const selectEl = $(`paps-event-${area.id}`);
      selectEl.value = state.paps[area.id].eventId;
      selectEl.addEventListener("change", () => {
        state.paps[area.id].eventId = selectEl.value;
        state.paps[area.id].rawValue = null;
        state.paps[area.id].min = "";
        state.paps[area.id].sec = "";
        state.paps[area.id].result = null;
        renderAreaInputSlot(area);
        updateAreaBadge(area.id);
      });

      renderAreaInputSlot(area);
    });

    // 확장 가능한 점수 구조 안내 렌더링
    const scoreBox = $("paps-score-structure-box");
    scoreBox.innerHTML = `
      <div class="notice-icon" aria-hidden="true">📐</div>
      <div class="notice-text">
        <strong>영역별 등급 및 점수 구조 안내</strong>
        <p>
          현재는 초등 5학년 공식 기준표에 따라 <strong>영역별 1~5등급</strong>을 정확히 판정해 보여드려요.
          ${
            STANDARDS.papsScoringConfig.enabled
              ? "영역별 20점·종합 100점 점수도 함께 계산됩니다."
              : "(영역별 20점 만점·총점 100점 환산 기능은 standards.js 설정 구조가 준비되어 있으며, 학교 점수표 입력 시 바로 활성화됩니다.)"
          }
        </p>
      </div>
    `;

    $("btn-step3-prev").addEventListener("click", () => goToStep(2));
    $("btn-step3-next").addEventListener("click", () => {
      if (validateStep3()) {
        goToStep(4);
      }
    });
  }

  function renderAreaInputSlot(area) {
    const slot = $(`paps-input-slot-${area.id}`);
    const extra = $(`paps-extra-${area.id}`);
    const selectedId = state.paps[area.id].eventId;
    const ev = area.events.find((e) => e.id === selectedId);
    extra.innerHTML = "";

    if (ev.inputMode === "autoBmi") {
      slot.innerHTML = `
        <label class="field-label" for="paps-bodyfat-opt">체지방률 %Fat (선택 입력)</label>
        <div class="input-with-unit">
          <input
            id="paps-bodyfat-opt"
            type="number"
            class="text-input"
            step="0.1"
            min="3"
            max="60"
            placeholder="알고 있으면 입력 (선택)"
          />
          <span class="unit-tag">%</span>
        </div>
        <p class="input-hint">${ev.hint}</p>
      `;
      const fatInput = $("paps-bodyfat-opt");
      if (state.paps.bodyComp.bodyFatOptional !== null) {
        fatInput.value = state.paps.bodyComp.bodyFatOptional;
      }
      fatInput.addEventListener("input", () => {
        state.paps.bodyComp.bodyFatOptional =
          fatInput.value.trim() === "" ? null : Number(fatInput.value);
      });
      syncStep3BmiLink();
      return;
    }

    if (ev.inputMode === "minsec") {
      slot.innerHTML = `
        <span class="field-label">기록 입력 (분 · 초) <span class="required-dot">*필수</span></span>
        <div class="minsec-row">
          <div class="input-with-unit">
            <input id="paps-min-${area.id}" type="number" class="text-input" min="0" max="30" step="1" placeholder="예: 6" />
            <span class="unit-tag">분</span>
          </div>
          <div class="input-with-unit">
            <input id="paps-sec-${area.id}" type="number" class="text-input" min="0" max="59" step="1" placeholder="예: 10" />
            <span class="unit-tag">초</span>
          </div>
        </div>
        <p class="input-hint" id="paps-minsec-hint-${area.id}">${ev.hint}</p>
      `;
      const minEl = $(`paps-min-${area.id}`);
      const secEl = $(`paps-sec-${area.id}`);
      minEl.value = state.paps[area.id].min || "";
      secEl.value = state.paps[area.id].sec || "";

      const onMinSecInput = () => {
        state.paps[area.id].min = minEl.value;
        state.paps[area.id].sec = secEl.value;
        if (minEl.value === "" && secEl.value === "") {
          state.paps[area.id].rawValue = null;
          state.paps[area.id].result = null;
          $(`paps-minsec-hint-${area.id}`).textContent = ev.hint;
        } else {
          const m = Number(minEl.value || 0);
          const s = Number(secEl.value || 0);
          if (s >= 0 && s < 60 && m >= 0) {
            const totalSec = m * 60 + s;
            state.paps[area.id].rawValue = totalSec;
            state.paps[area.id].result = evaluatePapsEvent(
              ev.id,
              totalSec,
              state.student.gender || "male"
            );
            $(`paps-minsec-hint-${area.id}`).textContent = `⏱️ 총 ${totalSec}초로 계산되었어요! (${ev.hint})`;
          } else {
            state.paps[area.id].rawValue = null;
            state.paps[area.id].result = null;
            $(`paps-minsec-hint-${area.id}`).textContent = "⚠️ 초는 0~59 사이 숫자로 적어 주세요.";
          }
        }
        updateAreaBadge(area.id);
      };

      minEl.addEventListener("input", onMinSecInput);
      secEl.addEventListener("input", onMinSecInput);
      return;
    }

    // 일반 숫자 입력 종목
    slot.innerHTML = `
      <label class="field-label" for="paps-val-${area.id}">
        기록 입력 (${ev.unit}) <span class="required-dot">${ev.thresholds ? "*필수" : "(선택)"}</span>
      </label>
      <div class="input-with-unit">
        <input
          id="paps-val-${area.id}"
          type="number"
          class="text-input"
          inputmode="decimal"
          step="${ev.step || "1"}"
          min="${ev.minInput}"
          max="${ev.maxInput}"
          placeholder="${ev.example}"
        />
        <span class="unit-tag">${ev.unit}</span>
      </div>
      <p class="input-hint">${ev.hint}</p>
    `;

    if (!ev.thresholds) {
      extra.innerHTML = `
        <div class="pending-standard-box">
          📢 기준표 준비 중 – 선생님께 문의하세요 (기록은 적을 수 있지만 등급은 아직 비어 있어요)
        </div>
      `;
    }

    const inputEl = $(`paps-val-${area.id}`);
    if (state.paps[area.id].rawValue !== null) {
      inputEl.value = state.paps[area.id].rawValue;
    }
    inputEl.addEventListener("input", () => {
      const valStr = inputEl.value.trim();
      if (valStr === "" || valStr === "-") {
        state.paps[area.id].rawValue = null;
        state.paps[area.id].result = null;
      } else {
        const num = Number(valStr);
        if (!Number.isNaN(num)) {
          state.paps[area.id].rawValue = num;
          state.paps[area.id].result = evaluatePapsEvent(
            ev.id,
            num,
            state.student.gender || "male"
          );
        }
      }
      updateAreaBadge(area.id);
    });
  }

  function syncStep3BmiLink() {
    const bmiRes = state.body.bmiResult;
    const extra = $("paps-extra-bodyComp");
    if (!bmiRes || !extra) return;

    const grade = bmiRes.papsGrade;
    const meta = STANDARDS.papsGrades[grade];
    state.paps.bodyComp.rawValue = bmiRes.bmi;
    state.paps.bodyComp.result = {
      pending: false,
      grade,
      label: meta.label,
      description: `${bmiRes.displayLabel}`,
      emoji: meta.emoji,
      color: meta.color,
      areaScore: null,
    };

    extra.innerHTML = `
      <div class="notice-box notice-info" style="margin: 12px 0 0; padding: 12px 14px;">
        <div class="notice-icon" aria-hidden="true">${bmiRes.emoji}</div>
        <div class="notice-text">
          <strong>2단계 BMI 자동 연동: ${bmiRes.bmi.toFixed(1)} kg/m² (${bmiRes.displayLabel})</strong>
          <p>신체조성 등급은 BMI 판정 결과에 따라 <strong>${meta.label}</strong>으로 자동 연결되었어요.</p>
        </div>
      </div>
    `;
    updateAreaBadge("bodyComp");
  }

  function recalcAllPapsUI() {
    if (!state.student.gender) return;
    STANDARDS.papsAreas.forEach((area) => {
      if (area.id === "bodyComp") return;
      const item = state.paps[area.id];
      if (item.rawValue !== null) {
        item.result = evaluatePapsEvent(item.eventId, item.rawValue, state.student.gender);
      }
      updateAreaBadge(area.id);
    });
  }

  function updateAreaBadge(areaId) {
    const badge = $(`paps-badge-${areaId}`);
    if (!badge) return;
    const res = state.paps[areaId].result;

    badge.className = "paps-grade-pill";
    if (!res) {
      badge.classList.add("grade-none");
      badge.textContent = "미입력";
      return;
    }
    if (res.pending) {
      badge.classList.add("grade-none");
      badge.textContent = "기준표 준비 중";
      return;
    }
    badge.classList.add(`grade-${res.grade}`);
    badge.textContent = `${res.emoji} ${res.label} (${res.description})`;
  }

  function validateStep3() {
    const errEl = $("step3-error");
    for (const area of STANDARDS.papsAreas) {
      if (area.id === "bodyComp") continue;
      const item = state.paps[area.id];
      const ev = area.events.find((e) => e.id === item.eventId);

      // 기준표가 없는 무릎 대고 팔굽혀펴기는 선택 입력으로 허용
      if (!ev.thresholds) {
        item.result = evaluatePapsEvent(ev.id, item.rawValue || 0, state.student.gender);
        continue;
      }

      if (ev.inputMode === "minsec") {
        if (item.rawValue === null || item.rawValue < ev.minInput || item.rawValue > ev.maxInput) {
          showBanner(
            errEl,
            `⏱️ [${area.name}] ${ev.name}의 분과 초를 알맞게 입력해 주세요! (초는 0~59, 총 60~1800초)`
          );
          return false;
        }
      } else {
        if (
          item.rawValue === null ||
          Number.isNaN(item.rawValue) ||
          item.rawValue < ev.minInput ||
          item.rawValue > ev.maxInput
        ) {
          showBanner(
            errEl,
            `📝 [${area.name}] ${ev.name} 기록을 ${ev.minInput}~${ev.maxInput} ${ev.unit} 범위 안에서 입력해 주세요!`
          );
          return false;
        }
      }
    }

    hideBanner(errEl);
    return true;
  }

  // --------------------------------------------------------------------------
  // 8. 4단계: 웹캠 자세 촬영 + MediaPipe Pose Landmarker AI 분석
  // --------------------------------------------------------------------------
  function bindStep4Events() {
    $("tab-front").addEventListener("click", () => switchPoseMode("front"));
    $("tab-side").addEventListener("click", () => switchPoseMode("side"));
    $("btn-start-camera").addEventListener("click", startCameraAndAI);
    $("btn-capture-pose").addEventListener("click", triggerPoseCapture);
    $("btn-skip-posture").addEventListener("click", () => {
      state.posture.skipped = true;
      stopCamera();
      goToStep(5);
    });
    $("btn-retake-front").addEventListener("click", () => {
      switchPoseMode("front");
      if (!cameraStream) startCameraAndAI();
    });
    $("btn-retake-side").addEventListener("click", () => {
      switchPoseMode("side");
      if (!cameraStream) startCameraAndAI();
    });

    $("btn-step4-prev").addEventListener("click", () => goToStep(3));
    $("btn-step4-next").addEventListener("click", () => {
      if (!state.posture.front && !state.posture.side) {
        // 촬영 없이 다음을 누르면 건너뛰기로 안내 또는 자동 미측정 처리 확인
        state.posture.skipped = true;
      } else {
        state.posture.skipped = false;
      }
      goToStep(5);
    });
  }

  function switchPoseMode(mode) {
    activePoseMode = mode;
    $("tab-front").classList.toggle("is-active", mode === "front");
    $("tab-side").classList.toggle("is-active", mode === "side");
    $("btn-capture-pose").textContent =
      mode === "front" ? "📸 정면 촬영하기" : "📸 옆모습 촬영하기";
  }

  async function ensurePoseLandmarker() {
    if (poseLandmarker) return poseLandmarker;
    if (poseLoading) return null;

    poseLoading = true;
    updatePoseLiveStatus("🤖 AI 자세 분석 도구를 불러오는 중이에요...", false);

    try {
      const visionModule = await import(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/+esm"
      );
      const { FilesetResolver, PoseLandmarker } = visionModule;

      const vision = await FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm"
      );

      poseLandmarker = await PoseLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath:
            "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task",
          delegate: "GPU",
        },
        runningMode: "VIDEO",
        numPoses: 1,
      });

      return poseLandmarker;
    } catch (err) {
      console.error("MediaPipe load error:", err);
      showBanner(
        $("camera-error-box"),
        "🌐 AI 자세 분석 모델을 불러오지 못했어요. 인터넷 연결을 확인하거나 [건너뛰기]를 눌러 결과를 확인해 주세요."
      );
      return null;
    } finally {
      poseLoading = false;
    }
  }

  async function startCameraAndAI() {
    hideBanner($("camera-error-box"));
    hideBanner($("step4-warning"));

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      showBanner(
        $("camera-error-box"),
        "📷 이 브라우저나 주소에서는 카메라를 켤 수 없어요. (웹캠은 localhost 또는 https 환경에서만 동작합니다.) [건너뛰기] 버튼으로 계속할 수 있어요!"
      );
      return;
    }

    try {
      cameraStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });

      const video = $("posture-video");
      video.srcObject = cameraStream;
      await video.play();

      $("camera-placeholder").hidden = true;
      $("btn-start-camera").textContent = "📷 카메라 켜짐";
      $("btn-start-camera").disabled = true;
      $("btn-capture-pose").disabled = false;

      await ensurePoseLandmarker();
      startLivePoseLoop();
    } catch (err) {
      console.error("Camera permission error:", err);
      showBanner(
        $("camera-error-box"),
        "📷 카메라 권한이 허용되지 않았거나 연결된 카메라를 찾지 못했어요. 브라우저 상단의 카메라 허용을 누르거나 [건너뛰기] 버튼으로 넘어가 주세요!"
      );
    }
  }

  function stopCamera() {
    if (countdownTimerId) {
      clearInterval(countdownTimerId);
      countdownTimerId = null;
      $("countdown-overlay").hidden = true;
    }
    if (animFrameId) {
      cancelAnimationFrame(animFrameId);
      animFrameId = null;
    }
    if (cameraStream) {
      cameraStream.getTracks().forEach((track) => track.stop());
      cameraStream = null;
    }
    const video = $("posture-video");
    if (video) video.srcObject = null;
    $("camera-placeholder").hidden = false;
    $("btn-start-camera").textContent = "📷 카메라 켜기";
    $("btn-start-camera").disabled = false;
    $("btn-capture-pose").disabled = true;
    updatePoseLiveStatus("카메라 대기 중", false);
  }

  function isFullBodyDetected(landmarks, mode) {
    if (!landmarks || landmarks.length < 33) return false;
    const minVis = STANDARDS.postureThresholds.minVisibility;
    const inBounds = (p) => p && p.x >= 0.02 && p.x <= 0.98 && p.y >= 0.02 && p.y <= 0.98;

    if (mode === "front") {
      const req = [0, 11, 12, 23, 24, 25, 26, 27, 28];
      return req.every((idx) => {
        const p = landmarks[idx];
        return inBounds(p) && (p.visibility === undefined || p.visibility >= minVis);
      });
    }

    // 옆모습: 왼쪽 또는 오른쪽 중 한쪽 전신 라인(귀·어깨·엉덩이·무릎·발목)이 모두 보이면 인정
    const leftSide = [7, 11, 23, 25, 27];
    const rightSide = [8, 12, 24, 26, 28];
    const checkSide = (indices) =>
      indices.every((idx) => {
        const p = landmarks[idx];
        return inBounds(p) && (p.visibility === undefined || p.visibility >= minVis);
      });

    return inBounds(landmarks[0]) && (checkSide(leftSide) || checkSide(rightSide));
  }

  function startLivePoseLoop() {
    const video = $("posture-video");
    const canvas = $("posture-overlay-canvas");
    const ctx = canvas.getContext("2d");

    const renderFrame = () => {
      if (!cameraStream || video.readyState < 2) {
        animFrameId = requestAnimationFrame(renderFrame);
        return;
      }

      if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
        canvas.width = video.videoWidth || 640;
        canvas.height = video.videoHeight || 480;
      }

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // 가이드 실루엣 그리기
      drawGuideSilhouette(ctx, canvas.width, canvas.height, activePoseMode);

      if (poseLandmarker) {
        const nowMs = performance.now();
        const result = poseLandmarker.detectForVideo(video, nowMs);
        if (result && result.landmarks && result.landmarks.length > 0) {
          const lm = result.landmarks[0];
          lastLiveLandmarks = lm;
          lastBodyInFrame = isFullBodyDetected(lm, activePoseMode);
          drawSkeleton(ctx, lm, canvas.width, canvas.height, false);

          if (lastBodyInFrame) {
            updatePoseLiveStatus("✅ 전신이 잘 보여요! 촬영할 준비가 됐어요", true);
          } else {
            updatePoseLiveStatus("📏 조금 뒤로 서서 머리부터 발끝까지 나오게 해 주세요", false);
          }
        } else {
          lastLiveLandmarks = null;
          lastBodyInFrame = false;
          updatePoseLiveStatus("🧍 가이드 선 안에 전신이 들어오게 서 주세요", false);
        }
      }

      animFrameId = requestAnimationFrame(renderFrame);
    };

    animFrameId = requestAnimationFrame(renderFrame);
  }

  function updatePoseLiveStatus(text, ready) {
    const el = $("pose-live-status");
    el.textContent = text;
    el.classList.toggle("is-ready", Boolean(ready));
  }

  function drawGuideSilhouette(ctx, w, h, mode) {
    ctx.save();
    ctx.strokeStyle = "rgba(255, 255, 255, 0.72)";
    ctx.lineWidth = Math.max(2, w * 0.004);
    ctx.setLineDash([10, 8]);

    const cx = w * 0.5;
    const headY = h * 0.14;
    const headR = h * 0.055;

    // 머리 원
    ctx.beginPath();
    ctx.arc(cx, headY, headR, 0, Math.PI * 2);
    ctx.stroke();

    if (mode === "front") {
      // 정면 실루엣
      ctx.beginPath();
      ctx.moveTo(cx - w * 0.11, h * 0.23);
      ctx.lineTo(cx + w * 0.11, h * 0.23);
      ctx.lineTo(cx + w * 0.14, h * 0.52);
      ctx.moveTo(cx - w * 0.11, h * 0.23);
      ctx.lineTo(cx - w * 0.14, h * 0.52);
      ctx.moveTo(cx - w * 0.07, h * 0.23);
      ctx.lineTo(cx - w * 0.06, h * 0.53);
      ctx.lineTo(cx - w * 0.07, h * 0.9);
      ctx.moveTo(cx + w * 0.07, h * 0.23);
      ctx.lineTo(cx + w * 0.06, h * 0.53);
      ctx.lineTo(cx + w * 0.07, h * 0.9);
      ctx.stroke();
    } else {
      // 옆모습 실루엣
      ctx.beginPath();
      ctx.moveTo(cx, h * 0.21);
      ctx.lineTo(cx, h * 0.55);
      ctx.lineTo(cx, h * 0.9);
      ctx.strokeRect(cx - w * 0.045, h * 0.22, w * 0.09, h * 0.32);
      ctx.stroke();
    }

    ctx.restore();
  }

  // MediaPipe 33개 랜드마크 주요 뼈대 연결선
  const POSE_CONNECTIONS = [
    [0, 1], [1, 2], [2, 3], [3, 7],
    [0, 4], [4, 5], [5, 6], [6, 8],
    [11, 12], [11, 13], [13, 15], [12, 14], [14, 16],
    [11, 23], [12, 24], [23, 24],
    [23, 25], [25, 27], [27, 29], [27, 31],
    [24, 26], [26, 28], [28, 30], [28, 32],
  ];

  function drawSkeleton(ctx, landmarks, w, h, drawMidline) {
    ctx.save();
    ctx.strokeStyle = "#38bdf8";
    ctx.lineWidth = Math.max(3, w * 0.005);

    POSE_CONNECTIONS.forEach(([a, b]) => {
      const pa = landmarks[a];
      const pb = landmarks[b];
      if (!pa || !pb) return;
      if ((pa.visibility ?? 1) < 0.3 || (pb.visibility ?? 1) < 0.3) return;
      ctx.beginPath();
      ctx.moveTo(pa.x * w, pa.y * h);
      ctx.lineTo(pb.x * w, pb.y * h);
      ctx.stroke();
    });

    if (drawMidline) {
      // 기준 수직선(초록 점선) 표시
      const midHipX = ((landmarks[23].x + landmarks[24].x) / 2) * w;
      ctx.strokeStyle = "#10b981";
      ctx.setLineDash([6, 6]);
      ctx.beginPath();
      ctx.moveTo(midHipX, h * 0.05);
      ctx.lineTo(midHipX, h * 0.95);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    landmarks.forEach((pt) => {
      if ((pt.visibility ?? 1) < 0.3) return;
      ctx.fillStyle = "#facc15";
      ctx.beginPath();
      ctx.arc(pt.x * w, pt.y * h, Math.max(4, w * 0.006), 0, Math.PI * 2);
      ctx.fill();
    });

    ctx.restore();
  }

  function triggerPoseCapture() {
    hideBanner($("step4-warning"));
    const seconds = Number($("select-countdown").value);

    if (seconds === 0) {
      captureCurrentPoseFrame();
      return;
    }

    let remaining = seconds;
    const overlay = $("countdown-overlay");
    const numEl = $("countdown-number");
    overlay.hidden = false;
    numEl.textContent = String(remaining);
    $("btn-capture-pose").disabled = true;

    countdownTimerId = setInterval(() => {
      remaining -= 1;
      if (remaining > 0) {
        numEl.textContent = String(remaining);
      } else {
        clearInterval(countdownTimerId);
        countdownTimerId = null;
        overlay.hidden = true;
        $("btn-capture-pose").disabled = false;
        captureCurrentPoseFrame();
      }
    }, 1000);
  }

  function captureCurrentPoseFrame() {
    const video = $("posture-video");
    if (!cameraStream || video.readyState < 2) return;

    if (!lastLiveLandmarks || !lastBodyInFrame) {
      showBanner(
        $("step4-warning"),
        "📏 전신(머리부터 발끝까지)이 화면에 다 들어오지 않았어요! 카메라에서 조금 더 떨어져서 다시 촬영해 주세요."
      );
      return;
    }

    const w = video.videoWidth || 640;
    const h = video.videoHeight || 480;
    const snapCanvas = document.createElement("canvas");
    snapCanvas.width = w;
    snapCanvas.height = h;
    const ctx = snapCanvas.getContext("2d");

    // 캡처 이미지 + 33개 랜드마크 스켈레톤을 브라우저 내 캔버스에만 그림
    ctx.drawImage(video, 0, 0, w, h);
    drawSkeleton(ctx, lastLiveLandmarks, w, h, true);
    const dataUrl = snapCanvas.toDataURL("image/png");

    if (activePoseMode === "front") {
      const analysis = analyzeFrontLandmarks(lastLiveLandmarks, w, h);
      state.posture.front = {
        imageDataUrl: dataUrl,
        metrics: analysis.metrics,
        scoliosisStatus: analysis.scoliosisStatus,
      };
      state.posture.skipped = false;
      renderPosturePreview("front");
      $("badge-front-done").hidden = false;

      // 정면 완료 후 아직 옆모습이 없으면 자동으로 옆모습 안내 탭으로 전환
      if (!state.posture.side) {
        switchPoseMode("side");
      }
    } else {
      const analysis = analyzeSideLandmarks(lastLiveLandmarks, w, h);
      state.posture.side = {
        imageDataUrl: dataUrl,
        metrics: analysis.metrics,
      };
      state.posture.skipped = false;
      renderPosturePreview("side");
      $("badge-side-done").hidden = false;
    }

    if (state.posture.front && state.posture.side) {
      stopCamera();
    }
  }

  function renderPosturePreview(mode) {
    const data = state.posture[mode];
    const box = $(`preview-${mode}-box`);
    const metricsEl = $(`preview-${mode}-metrics`);
    const retakeBtn = $(`btn-retake-${mode}`);

    if (!data) return;
    box.innerHTML = `<img src="${data.imageDataUrl}" alt="${
      mode === "front" ? "정면 스켈레톤 촬영 이미지" : "옆모습 스켈레톤 촬영 이미지"
    }" />`;
    retakeBtn.hidden = false;

    metricsEl.innerHTML = data.metrics
      .map(
        (m) => `
      <div class="metric-row">
        <span>${m.name} (${m.valueText})</span>
        <span class="metric-status pill-${m.level}">${m.label}</span>
      </div>
    `
      )
      .join("");
  }

  // --------------------------------------------------------------------------
  // 9. 5단계: 종합 검진 결과 화면 & SVG 레이더 차트
  // --------------------------------------------------------------------------
  function getOverallPostureSummary() {
    if (state.posture.skipped || (!state.posture.front && !state.posture.side)) {
      return {
        measured: false,
        goodPostureLabel: "미측정",
        goodPostureLevel: "none",
        scoliosisLabel: "미측정",
        scoliosisLevel: "none",
      };
    }

    const frontMetrics = state.posture.front ? state.posture.front.metrics : [];
    const sideMetrics = state.posture.side ? state.posture.side.metrics : [];
    const all = [...frontMetrics, ...sideMetrics];

    const hasAlert = all.some((m) => m.level === "alert");
    const hasCaution = all.some((m) => m.level === "caution");

    let goodPostureLabel = "바른 자세";
    let goodPostureLevel = "good";
    if (hasAlert) {
      goodPostureLabel = "전문가 확인 권장";
      goodPostureLevel = "alert";
    } else if (hasCaution) {
      goodPostureLabel = "자세 주의";
      goodPostureLevel = "caution";
    }

    const scol = state.posture.front
      ? state.posture.front.scoliosisStatus
      : { level: "none", label: "정면 미측정" };

    return {
      measured: true,
      goodPostureLabel,
      goodPostureLevel,
      scoliosisLabel: scol.label,
      scoliosisLevel: scol.level,
    };
  }

  function renderStep5Results() {
    const s = state.student;
    const genderKo = s.gender === "male" ? "남학생" : "여학생";
    $("result-student-info").textContent = `${s.school} ${s.grade}학년 ${s.classNum}반 ${s.name} (${genderKo})`;

    // 1) BMI 패널
    const bmi = state.body.bmiResult;
    const bmiPanel = $("result-bmi-panel");
    bmiPanel.innerHTML = `
      <h3>📏 비만도(BMI) 결과</h3>
      <div style="display:flex; align-items:center; gap:12px; margin-bottom:10px;">
        <span style="font-size:2.4rem;">${bmi.emoji}</span>
        <div>
          <strong style="font-size:1.7rem; font-family:var(--font-display);">${bmi.bmi.toFixed(1)} kg/m²</strong>
          <div>
            <span class="posture-pill pill-${bmi.tone === "good" ? "good" : bmi.tone === "caution" ? "caution" : "alert"}">
              ${bmi.displayLabel}
            </span>
          </div>
        </div>
      </div>
      <p style="margin:0; font-size:0.95rem;">${bmi.message}</p>
    `;

    // 2) PAPS 패널 (오각형 SVG 레이더 차트 + 등급 배지)
    const papsPanel = $("result-paps-panel");
    const radarSvg = buildPapsRadarSvg();
    const listHtml = STANDARDS.papsAreas
      .map((area) => {
        const item = state.paps[area.id];
        const ev = area.events.find((e) => e.id === item.eventId);
        const res = item.result;

        let recordStr = "";
        if (area.id === "bodyComp") {
          recordStr = `BMI ${bmi.bmi.toFixed(1)} kg/m²`;
          if (item.bodyFatOptional !== null) {
            recordStr += ` · 체지방률 ${item.bodyFatOptional}%`;
          }
        } else if (item.rawValue !== null) {
          recordStr = `${item.rawValue} ${ev.unit}`;
        } else {
          recordStr = "미입력";
        }

        const badgeClass = res && !res.pending ? `grade-${res.grade}` : "grade-none";
        const badgeText = res
          ? res.pending
            ? "기준표 준비 중"
            : `${res.emoji} ${res.label} (${res.description})`
          : "미입력";

        return `
          <div class="paps-result-row">
            <div class="paps-row-info">
              <strong>${area.icon} ${area.name}</strong>
              <span>${ev.name} · ${recordStr}</span>
            </div>
            <span class="paps-grade-pill ${badgeClass}">${badgeText}</span>
          </div>
        `;
      })
      .join("");

    papsPanel.innerHTML = `
      <h3>🏅 PAPS 5개 영역별 등급</h3>
      <div class="paps-result-layout">
        <div class="radar-wrap">
          ${radarSvg}
          <span class="radar-caption">바깥쪽(1등급)일수록 체력이 높아요!</span>
        </div>
        <div class="paps-badge-list">${listHtml}</div>
      </div>
    `;

    // 3) 자세 분석 패널
    const posturePanel = $("result-posture-panel");
    const pSum = getOverallPostureSummary();

    let postureBodyHtml = "";
    if (!pSum.measured) {
      postureBodyHtml = `
        <div class="notice-box notice-soft" style="margin:0;">
          <div class="notice-icon" aria-hidden="true">📷</div>
          <div class="notice-text">
            <strong>자세 촬영 결과: 미측정</strong>
            <p>4단계 웹캠 자세 촬영을 건너뛰었어요. 원하면 [이전 단계]로 돌아가 촬영할 수 있어요.</p>
          </div>
        </div>
      `;
    } else {
      const frontHtml = state.posture.front
        ? `
          <div class="preview-card">
            <h4>정면 자세 (스켈레톤)</h4>
            <div class="preview-img-box"><img src="${state.posture.front.imageDataUrl}" alt="정면 스켈레톤" /></div>
            <div class="preview-metrics">
              ${state.posture.front.metrics
                .map(
                  (m) =>
                    `<div class="metric-row"><span>${m.name} (${m.valueText})</span><span class="metric-status pill-${m.level}">${m.label}</span></div>`
                )
                .join("")}
            </div>
          </div>`
        : `<div class="preview-card"><h4>정면 자세</h4><p>정면은 촬영하지 않았어요 (미측정).</p></div>`;

      const sideHtml = state.posture.side
        ? `
          <div class="preview-card">
            <h4>옆모습 자세 (스켈레톤)</h4>
            <div class="preview-img-box"><img src="${state.posture.side.imageDataUrl}" alt="옆모습 스켈레톤" /></div>
            <div class="preview-metrics">
              ${state.posture.side.metrics
                .map(
                  (m) =>
                    `<div class="metric-row"><span>${m.name} (${m.valueText})</span><span class="metric-status pill-${m.level}">${m.label}</span></div>`
                )
                .join("")}
            </div>
          </div>`
        : `<div class="preview-card"><h4>옆모습 자세</h4><p>옆모습은 촬영하지 않았어요 (미측정).</p></div>`;

      postureBodyHtml = `<div class="posture-result-columns">${frontHtml}${sideHtml}</div>`;
    }

    posturePanel.innerHTML = `
      <h3>🧍 자세 분석 결과</h3>
      <div class="posture-summary-badges">
        <span class="posture-pill pill-${pSum.goodPostureLevel}">바른 자세 여부: ${pSum.goodPostureLabel}</span>
        <span class="posture-pill pill-${pSum.scoliosisLevel}">척추 측만 의심 여부: ${pSum.scoliosisLabel}</span>
      </div>
      ${postureBodyHtml}
      <div class="notice-box notice-caution" style="margin-bottom:0;">
        <div class="notice-icon" aria-hidden="true">🩺</div>
        <div class="notice-text">
          이 결과는 선별 참고용이며 의학적 진단이 아닙니다. 척추 측만증 의심이 나오면 보건 선생님이나 병원에서 확인하세요.
        </div>
      </div>
    `;

    // 4) 잘한 점 & 더 키울 점 요약
    renderStrengthsAndGrowth(pSum);
  }

  /**
   * 5각형 SVG 레이더 차트 생성 (1등급=바깥 5점, 5등급=안쪽 1점)
   */
  function buildPapsRadarSvg() {
    const cx = 110;
    const cy = 110;
    const maxR = 72;
    const areas = STANDARDS.papsAreas;
    const angleStep = (Math.PI * 2) / areas.length;

    const getPoint = (idx, level1to5) => {
      const ang = -Math.PI / 2 + idx * angleStep;
      const r = (level1to5 / 5) * maxR;
      return [cx + r * Math.cos(ang), cy + r * Math.sin(ang)];
    };

    let gridPolys = "";
    for (let ring = 1; ring <= 5; ring++) {
      const pts = areas.map((_, idx) => getPoint(idx, ring).join(",")).join(" ");
      gridPolys += `<polygon points="${pts}" fill="none" stroke="#cbd5e1" stroke-width="1" />`;
    }

    const axes = areas
      .map((area, idx) => {
        const [x, y] = getPoint(idx, 5);
        const [lx, ly] = getPoint(idx, 6.2);
        return `
          <line x1="${cx}" y1="${cy}" x2="${x}" y2="${y}" stroke="#cbd5e1" stroke-width="1" />
          <text x="${lx}" y="${ly}" text-anchor="middle" dominant-baseline="middle" font-size="11" font-weight="700" fill="#334155">
            ${area.name.replace("(체지방)", "")}
          </text>
        `;
      })
      .join("");

    const dataPts = areas.map((area, idx) => {
      const res = state.paps[area.id].result;
      // 1등급 -> 점수 5(바깥), 5등급 -> 점수 1(안쪽), 미판정 -> 3
      const score = res && !res.pending ? 6 - res.grade : 3;
      return getPoint(idx, score);
    });

    const dataPolyStr = dataPts.map((p) => p.join(",")).join(" ");
    const dots = dataPts
      .map(([x, y]) => `<circle cx="${x}" cy="${y}" r="4.5" fill="#2563eb" stroke="#fff" stroke-width="1.5" />`)
      .join("");

    return `
      <svg viewBox="0 0 220 220" width="215" height="215" role="img" aria-label="PAPS 5개 영역 오각형 차트">
        ${gridPolys}
        ${axes}
        <polygon points="${dataPolyStr}" fill="rgba(37, 99, 235, 0.25)" stroke="#2563eb" stroke-width="2.5" />
        ${dots}
      </svg>
    `;
  }

  function renderStrengthsAndGrowth(pSum) {
    const strengths = [];
    const growths = [];

    const bmi = state.body.bmiResult;
    if (bmi.key === "normal") {
      strengths.push("키와 몸무게 비율(BMI)이 건강한 정상체중이에요.");
    } else if (bmi.key === "underweight") {
      growths.push("영양을 골고루 챙겨 먹고 근력을 키워 체력을 보태면 더 좋아요.");
    } else {
      growths.push("매일 30분 이상 유산소 운동으로 몸을 가볍게 움직여 보아요.");
    }

    STANDARDS.papsAreas.forEach((area) => {
      if (area.id === "bodyComp") return;
      const res = state.paps[area.id].result;
      if (!res || res.pending) return;
      if (res.grade <= 2) {
        strengths.push(`${area.name}이(가) ${res.label}(${res.description})으로 아주 뛰어나요!`);
      } else if (res.grade >= 4) {
        growths.push(`${area.name}(${res.label})을 조금씩 연습해서 3등급 이상으로 올려 보아요!`);
      }
    });

    if (pSum.measured) {
      if (pSum.goodPostureLevel === "good") {
        strengths.push("어깨, 골반, 목이 바르게 정렬된 멋진 자세를 가지고 있어요.");
      } else {
        growths.push("평소 앉고 설 때 바른 자세를 의식하고 코어·등 스트레칭을 자주 해 보아요.");
      }
    }

    if (strengths.length === 0) {
      strengths.push("스스로 내 건강과 체력을 확인한 용기와 실천력이 가장 큰 장점이에요!");
    }
    if (growths.length === 0) {
      growths.push("지금처럼 일주일에 3번 이상 즐겁게 운동하면 멋진 체력을 계속 지킬 수 있어요!");
    }

    $("result-summary-panel").innerHTML = `
      <h3>🌟 ${state.student.name} 학생의 건강 요약</h3>
      <div class="sw-grid">
        <div class="sw-box">
          <h4>👏 잘한 점 (강점)</h4>
          <p>${strengths.join(" ")}</p>
        </div>
        <div class="sw-box">
          <h4>🌱 더 키울 점 (응원 포인트)</h4>
          <p>${growths.join(" ")}</p>
        </div>
      </div>
    `;
  }

  // --------------------------------------------------------------------------
  // 10. 6단계: 서울 7330 일주일 운동 스케줄 추천 & 체크리스트
  // --------------------------------------------------------------------------
  function buildAndRenderSchedule() {
    const s = state.student;
    const bmi = state.body.bmiResult;
    const pSum = getOverallPostureSummary();
    const cfg = STANDARDS.seoul7330;

    // 4~5등급 약점 영역 수집 (신체조성 제외)
    const weakAreas = [];
    STANDARDS.papsAreas.forEach((area) => {
      if (area.id === "bodyComp") return;
      const res = state.paps[area.id].result;
      if (res && !res.pending && res.grade >= 4) {
        weakAreas.push({ id: area.id, name: area.name });
      }
    });

    const isObeseOrOver =
      bmi.key === "overweight" || bmi.key === "mildObesity" || bmi.key === "severeObesity";
    const isUnderweight = bmi.key === "underweight";
    const needsPostureCare =
      pSum.measured && (pSum.goodPostureLevel !== "good" || pSum.scoliosisLevel !== "good");
    const scoliosisSuspected = pSum.measured && pSum.scoliosisLevel === "alert";

    const allGood =
      weakAreas.length === 0 && bmi.key === "normal" && !needsPostureCare;

    $("schedule-intro-text").textContent =
      `${s.name} 학생의 검진 결과를 바탕으로 서울 7330 기준(주 3회 이상, 하루 30분)에 맞춰 짠 일주일 운동 계획이에요!`;

    // 맞춤 배너 생성
    const banners = [];
    if (scoliosisSuspected) {
      banners.push(`
        <div class="notice-box notice-caution" style="margin:0;">
          <div class="notice-icon" aria-hidden="true">🩺</div>
          <div class="notice-text">
            <strong>전문가 확인 후 운동하기</strong>
            <p>자세 분석에서 척추 측만 의심 소견이 나왔어요. 보건 선생님이나 병원에서 먼저 확인한 뒤, 무리하지 않고 가벼운 운동부터 시작하세요!</p>
          </div>
        </div>
      `);
    }
    if (isUnderweight) {
      banners.push(`
        <div class="notice-box notice-info" style="margin:0;">
          <div class="notice-icon" aria-hidden="true">🍚</div>
          <div class="notice-text">
            <strong>저체중 맞춤 안내: 근력 운동 + 충분한 휴식·영양</strong>
            <p>고기·달걀·두부·우유와 밥·채소를 골고루 먹고, 운동한 날 다음 날은 푹 쉬면서 근육을 키워 보아요!</p>
          </div>
        </div>
      `);
    }
    if (isObeseOrOver) {
      banners.push(`
        <div class="notice-box notice-info" style="margin:0;">
          <div class="notice-icon" aria-hidden="true">🚴</div>
          <div class="notice-text">
            <strong>관절이 편안한 유산소 중심 스케줄</strong>
            <p>무릎이나 발목에 무리가 적은 빠르게 걷기, 자전거, 수영 같은 유산소 운동 위주로 일주일을 채웠어요.</p>
          </div>
        </div>
      `);
    }
    if (weakAreas.length > 0) {
      banners.push(`
        <div class="notice-box notice-soft" style="margin:0;">
          <div class="notice-icon" aria-hidden="true">🎯</div>
          <div class="notice-text">
            <strong>우선 보강 영역: ${weakAreas.map((w) => w.name).join(", ")}</strong>
            <p>4~5등급으로 나온 영역을 재미있게 키울 수 있는 20분 본운동을 중심으로 넣었어요.</p>
          </div>
        </div>
      `);
    }
    $("schedule-personal-banners").innerHTML = banners.join("");

    // 모두 양호할 때 좋아하는 운동 고르기 표시
    const favPicker = $("favorite-sport-picker");
    if (allGood) {
      favPicker.hidden = false;
      const chipsEl = $("favorite-chips");
      chipsEl.innerHTML = cfg.areaWorkouts.funChoices
        .map(
          (choice, idx) => `
          <button type="button" class="fav-chip ${
            state.schedule.favoriteWorkoutIndex === idx ? "is-active" : ""
          }" data-fav-idx="${idx}">
            ${choice.replace("내가 좋아하는 운동: ", "").replace(" (20분)", "")}
          </button>`
        )
        .join("");

      chipsEl.querySelectorAll(".fav-chip").forEach((btn) => {
        btn.addEventListener("click", () => {
          state.schedule.favoriteWorkoutIndex = Number(btn.dataset.favIdx);
          buildAndRenderSchedule();
        });
      });
    } else {
      favPicker.hidden = true;
    }

    // 운동일 배정 (서울 7330: 주 3~5일)
    // 월(0), 화(1), 수(2), 목(3), 금(4), 토(5), 일(6)
    let workoutDayIndices = [0, 2, 4, 5]; // 기본 주 4회 (월, 수, 금, 토)
    if (allGood || isUnderweight) {
      workoutDayIndices = [0, 2, 5]; // 주 3회 (충분한 휴식 포함)
    } else if (weakAreas.length >= 2 || isObeseOrOver) {
      workoutDayIndices = [0, 1, 3, 4, 5]; // 주 5회 (하루 30분 규칙적 활동)
    }

    // 본운동 후보 풀 생성
    const mainWorkoutPool = [];
    if (isObeseOrOver) {
      mainWorkoutPool.push(...cfg.areaWorkouts.lowImpactCardio);
    }
    weakAreas.forEach((wa) => {
      if (cfg.areaWorkouts[wa.id]) {
        mainWorkoutPool.push(...cfg.areaWorkouts[wa.id]);
      }
    });
    if (needsPostureCare) {
      mainWorkoutPool.push(...cfg.areaWorkouts.postureCare);
    }
    if (isUnderweight && weakAreas.length === 0) {
      mainWorkoutPool.push(...cfg.areaWorkouts.strength);
    }
    if (mainWorkoutPool.length === 0) {
      // 모두 양호한 경우: 학생이 고른 좋아하는 운동을 최우선으로 배치
      const fav = cfg.areaWorkouts.funChoices[state.schedule.favoriteWorkoutIndex];
      mainWorkoutPool.push(fav, ...cfg.areaWorkouts.funChoices);
    }

    const dayNames = ["월요일", "화요일", "수요일", "목요일", "금요일", "토요일", "일요일"];
    let poolIdx = 0;

    state.schedule.days = dayNames.map((dayName, idx) => {
      const isWorkout = workoutDayIndices.includes(idx);
      if (isWorkout) {
        const warmup = cfg.warmupOptions[idx % cfg.warmupOptions.length];
        const main = mainWorkoutPool[poolIdx % mainWorkoutPool.length];
        const cooldown = cfg.cooldownOptions[idx % cfg.cooldownOptions.length];
        poolIdx += 1;
        return {
          dayName,
          isWorkout: true,
          warmup,
          main,
          cooldown,
        };
      }

      let restText = cfg.restDayActivities[idx % cfg.restDayActivities.length];
      if (needsPostureCare && idx % 2 === 1) {
        restText = "벽에 등 붙이고 바른 자세 3분 서기 + 가벼운 스트레칭 🧘";
      } else if (isUnderweight) {
        restText = "충분한 수면·휴식 + 영양이 듬뿍 담긴 식사 챙기기 🥛";
      }
      return {
        dayName,
        isWorkout: false,
        restText,
      };
    });

    renderScheduleGrid(workoutDayIndices.length);
  }

  function renderScheduleGrid(targetWorkoutCount) {
    const grid = $("schedule-grid");
    grid.innerHTML = "";

    state.schedule.days.forEach((day, idx) => {
      const checked = state.schedule.checkedDays[idx];
      const card = document.createElement("div");
      card.className = `day-card ${day.isWorkout ? "is-workout" : "is-rest"} ${
        checked ? "is-checked" : ""
      }`;

      const bodyHtml = day.isWorkout
        ? `
          <ul class="day-plan-list">
            <li><strong>준비운동 5분</strong>${day.warmup}</li>
            <li><strong>본운동 20분</strong>${day.main}</li>
            <li><strong>정리운동 5분</strong>${day.cooldown}</li>
          </ul>
        `
        : `
          <ul class="day-plan-list">
            <li><strong>가벼운 활동 · 휴식</strong>${day.restText}</li>
          </ul>
        `;

      card.innerHTML = `
        <div>
          <div class="day-card-head">
            <span class="day-name">${day.dayName}</span>
            <span class="day-tag">${day.isWorkout ? "운동 30분" : "휴식·스트레칭"}</span>
          </div>
          <div style="margin-top:8px;">${bodyHtml}</div>
        </div>
        <label class="day-check-label">
          <input type="checkbox" data-day-idx="${idx}" ${checked ? "checked" : ""} />
          <span>${checked ? "완료했어요! 🎉" : "실천 체크하기"}</span>
        </label>
      `;

      const cb = card.querySelector("input[type='checkbox']");
      cb.addEventListener("change", () => {
        state.schedule.checkedDays[idx] = cb.checked;
        renderScheduleGrid(targetWorkoutCount);
      });

      grid.appendChild(card);
    });

    const doneWorkoutDays = state.schedule.days.filter(
      (d, i) => d.isWorkout && state.schedule.checkedDays[i]
    ).length;
    const totalChecked = state.schedule.checkedDays.filter(Boolean).length;

    $("weekly-done-count").textContent = String(doneWorkoutDays);
    $("weekly-target-count").textContent = String(targetWorkoutCount);
    const pct = Math.min(100, Math.round((doneWorkoutDays / Math.max(targetWorkoutCount, 1)) * 100));
    $("weekly-progress-fill").style.width = `${pct}%`;
    if (totalChecked > doneWorkoutDays) {
      $("weekly-done-count").textContent = `${doneWorkoutDays} (전체 활동 ${totalChecked}일)`;
    }
  }

  // --------------------------------------------------------------------------
  // 11. 인쇄 및 PNG 결과 카드 이미지 저장
  // --------------------------------------------------------------------------
  function bindResultAndScheduleEvents() {
    $("btn-step5-prev").addEventListener("click", () => goToStep(4));
    $("btn-step5-next").addEventListener("click", () => goToStep(6));
    $("btn-step6-prev").addEventListener("click", () => goToStep(5));

    $("btn-print-step5").addEventListener("click", () => window.print());
    $("btn-print-step6").addEventListener("click", () => window.print());

    $("btn-save-img-step5").addEventListener("click", exportSummaryImage);
    $("btn-save-img-step6").addEventListener("click", exportSummaryImage);

    $("btn-restart-app").addEventListener("click", () => {
      if (confirm("입력한 내용을 모두 지우고 처음부터 다시 시작할까요?")) {
        window.location.reload();
      }
    });
  }

  /**
   * 외부 라이브러리 없이 HTML5 Canvas로 결과 + 7330 스케줄 이미지(PNG) 생성 및 다운로드
   */
  function exportSummaryImage() {
    if (state.schedule.days.length === 0) {
      buildAndRenderSchedule();
    }

    const canvas = document.createElement("canvas");
    canvas.width = 1000;
    canvas.height = 1180;
    const ctx = canvas.getContext("2d");

    // 배경
    ctx.fillStyle = "#f0f9ff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // 상단 헤더 바
    ctx.fillStyle = "#2563eb";
    ctx.fillRect(0, 0, canvas.width, 130);
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 36px 'Noto Sans KR', sans-serif";
    ctx.fillText("내 몸 건강 체크 - 종합 결과 & 서울 7330 스케줄", 44, 58);

    const s = state.student;
    const gKo = s.gender === "male" ? "남학생" : "여학생";
    ctx.font = "bold 22px 'Noto Sans KR', sans-serif";
    ctx.fillText(`${s.school} ${s.grade}학년 ${s.classNum}반 ${s.name} (${gKo})`, 44, 102);

    // BMI 카드
    const bmi = state.body.bmiResult;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(40, 160, 440, 180);
    ctx.strokeStyle = "#bfdbfe";
    ctx.lineWidth = 3;
    ctx.strokeRect(40, 160, 440, 180);

    ctx.fillStyle = "#1e293b";
    ctx.font = "bold 24px 'Noto Sans KR', sans-serif";
    ctx.fillText("1. 비만도(BMI) 결과", 64, 204);
    ctx.fillStyle = "#2563eb";
    ctx.font = "bold 38px 'Noto Sans KR', sans-serif";
    ctx.fillText(`${bmi.bmi.toFixed(1)} kg/m²`, 64, 258);
    ctx.fillStyle = "#059669";
    ctx.font = "bold 26px 'Noto Sans KR', sans-serif";
    ctx.fillText(`판정: ${bmi.displayLabel}`, 64, 304);

    // 자세 요약 카드
    const pSum = getOverallPostureSummary();
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(510, 160, 450, 180);
    ctx.strokeStyle = "#bfdbfe";
    ctx.strokeRect(510, 160, 450, 180);

    ctx.fillStyle = "#1e293b";
    ctx.font = "bold 24px 'Noto Sans KR', sans-serif";
    ctx.fillText("2. AI 자세 분석 요약", 534, 204);
    ctx.font = "bold 20px 'Noto Sans KR', sans-serif";
    ctx.fillText(`바른 자세 여부: ${pSum.goodPostureLabel}`, 534, 248);
    ctx.fillText(`척추 측만 의심: ${pSum.scoliosisLabel}`, 534, 282);
    ctx.fillStyle = "#64748b";
    ctx.font = "15px 'Noto Sans KR', sans-serif";
    ctx.fillText("※ 선별 참고용이며 의학적 진단이 아닙니다.", 534, 318);

    // PAPS 등급 카드
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(40, 365, 920, 230);
    ctx.strokeStyle = "#bfdbfe";
    ctx.strokeRect(40, 365, 920, 230);
    ctx.fillStyle = "#1e293b";
    ctx.font = "bold 24px 'Noto Sans KR', sans-serif";
    ctx.fillText("3. PAPS 5개 영역별 등급", 64, 408);

    ctx.font = "20px 'Noto Sans KR', sans-serif";
    STANDARDS.papsAreas.forEach((area, i) => {
      const item = state.paps[area.id];
      const res = item.result;
      const gradeStr = res
        ? res.pending
          ? "기준표 준비 중"
          : `${res.label} (${res.description})`
        : "미입력";
      const y = 448 + i * 28;
      ctx.fillStyle = "#334155";
      ctx.fillText(`• ${area.name}`, 68, y);
      ctx.fillStyle = "#1d4ed8";
      ctx.fillText(gradeStr, 360, y);
    });

    // 서울 7330 일주일 운동 스케줄 카드
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(40, 620, 920, 440);
    ctx.strokeStyle = "#a7f3d0";
    ctx.strokeRect(40, 620, 920, 440);
    ctx.fillStyle = "#065f46";
    ctx.font = "bold 24px 'Noto Sans KR', sans-serif";
    ctx.fillText("4. 서울 7330 일주일 운동 스케줄", 64, 664);

    ctx.font = "18px 'Noto Sans KR', sans-serif";
    state.schedule.days.forEach((day, i) => {
      const y = 710 + i * 48;
      const doneMark = state.schedule.checkedDays[i] ? "✅ " : "";
      const summary = day.isWorkout ? `[운동 30분] ${day.main}` : `[휴식] ${day.restText}`;
      ctx.fillStyle = day.isWorkout ? "#1e40af" : "#475569";
      ctx.fillText(`${doneMark}${day.dayName}: ${summary.slice(0, 46)}`, 64, y);
    });

    // 하단 7330 배너
    ctx.fillStyle = "#10b981";
    ctx.fillRect(40, 1085, 920, 68);
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 26px 'Noto Sans KR', sans-serif";
    ctx.fillText("서울 7330: 일주일 3번 이상, 하루 30분 이상 운동하기", 165, 1128);

    const link = document.createElement("a");
    link.download = `내몸건강체크_${s.grade}학년${s.classNum}반_${s.name}.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
  }

  // --------------------------------------------------------------------------
  // 유틸리티
  // --------------------------------------------------------------------------
  function showBanner(el, message) {
    if (!el) return;
    el.textContent = message;
    el.hidden = false;
  }

  function hideBanner(el) {
    if (!el) return;
    el.textContent = "";
    el.hidden = true;
  }

  document.addEventListener("DOMContentLoaded", initApp);
})();
