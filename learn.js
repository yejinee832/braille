// 학습 기록·숙련도·단계 자동 진행
// - 기록은 폰(브라우저)에 저장돼서 새로고침해도 남아요.
// - 숙련도: 베타 분포 Beta(α, β). 사전 분포 Beta(1, 1)(= 균일 분포)에서 시작해서
//   맞으면 α + 1, 틀리면 β + 1, 맞았지만 오래 걸리면(망설임) α + 0.5, β + 0.5 (베이지안 업데이트)
//   숙련도 = 평균 α / (α + β),  확실한 정도 = 95% 신뢰 구간 (하위 2.5% ~ 상위 97.5%)
// - 출제: 톰슨 샘플링 — 문제마다 Beta(α, β)에서 값을 하나 뽑아 가장 낮은 문제를 냄
// - 단계 통과: 단계 전체 숙련도가 75%를 넘을 확률 P(p > 0.75) 가 80% 이상
// - 단계: 모음 → 첫소리 → 받침 → 약자 → 단어 (복지관 인터뷰에서 들은 학습 순서)
(function (g) {
  const KEY = g.BRAILLE_LEARN_KEY || 'brailleLearn_v1';   // 시연 모드는 따로 저장
  const STAGES = ['모음', '첫소리', '받침', '약자', '단어'];
  const SLOW = { basic: 6, word: 20 };              // 이 시간(초)보다 오래 걸리면 '망설임'
  const PASS = 0.75;                                 // 단계 통과 기준 실력
  const CONF = 0.8;                                  // 그 기준을 넘을 확률이 이 이상이면 통과
  let L = { items: {}, days: {}, types: {}, stage: 0, auto: true };

  function load() { try { const s = localStorage.getItem(KEY); if (s) L = Object.assign(L, JSON.parse(s)); } catch (e) {} }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(L)); } catch (e) {} }
  function today() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  const catOf = key => STAGES.find(c => key.startsWith(c + ' ')) || '단어';

  // 한 문제 결과 기록. 반환값: 맞았지만 오래 걸렸는지
  function record(key, kind, ok, sec, errors) {
    const it = L.items[key] || (L.items[key] = { n: 0, c: 0, w: 0, slow: 0, t: 0, last: 0 });
    const slow = ok && sec > SLOW[kind];
    it.n++; it.t += sec; it.last = Date.now();
    if (ok) { it.c++; if (slow) it.slow++; } else it.w++;
    const d = L.days[today()] || (L.days[today()] = { n: 0, w: 0, t: 0, slow: 0 });
    d.n++; d.t += sec; if (!ok) d.w++; if (slow) d.slow++;
    for (const e of errors || []) {
      L.types[e.type] = (L.types[e.type] || 0) + 1;
      it.err = it.err || {}; it.err[e.type] = (it.err[e.type] || 0) + 1;      // 문제별 오류 유형
    }
    save();
    return slow;
  }

  // ---- 베타 분포 계산 ----
  function params(key) {                                   // 사후 분포 Beta(α, β)
    const it = L.items[key]; if (!it) return [1, 1];
    return [1 + it.c - 0.5 * it.slow, 1 + it.w + 0.5 * it.slow];
  }
  function mastery(key) { const [a, b] = params(key); return a / (a + b); }   // 평균
  const mean = keys => keys.length ? keys.reduce((s, k) => s + mastery(k), 0) / keys.length : 0;

  // 정규화된 불완전 베타 함수 I_x(a, b) = Beta(a, b)의 누적분포함수 (Numerical Recipes 연분수)
  function lgamma(z) {
    const g = [76.18009172947146, -86.50532032941677, 24.01409824083091, -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5];
    let x = z, y = z, t = x + 5.5; t -= (x + 0.5) * Math.log(t); let ser = 1.000000000190015;
    for (const c of g) ser += c / ++y;
    return -t + Math.log(2.5066282746310005 * ser / x);
  }
  function betacf(a, b, x) {
    let qab = a + b, qap = a + 1, qam = a - 1, c = 1, d = 1 - qab * x / qap;
    if (Math.abs(d) < 1e-30) d = 1e-30; d = 1 / d; let h = d;
    for (let m = 1; m <= 200; m++) {
      const m2 = 2 * m; let aa = m * (b - m) * x / ((qam + m2) * (a + m2));
      d = 1 + aa * d; if (Math.abs(d) < 1e-30) d = 1e-30; c = 1 + aa / c; if (Math.abs(c) < 1e-30) c = 1e-30; d = 1 / d; h *= d * c;
      aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2));
      d = 1 + aa * d; if (Math.abs(d) < 1e-30) d = 1e-30; c = 1 + aa / c; if (Math.abs(c) < 1e-30) c = 1e-30; d = 1 / d;
      const del = d * c; h *= del; if (Math.abs(del - 1) < 3e-12) break;
    }
    return h;
  }
  function cdf(x, a, b) {
    if (x <= 0) return 0; if (x >= 1) return 1;
    const bt = Math.exp(lgamma(a + b) - lgamma(a) - lgamma(b) + a * Math.log(x) + b * Math.log(1 - x));
    return x < (a + 1) / (a + b + 2) ? bt * betacf(a, b, x) / a : 1 - bt * betacf(b, a, 1 - x) / b;
  }
  function quantile(p, a, b) {                              // 이분법으로 역함수
    let lo = 0, hi = 1;
    for (let i = 0; i < 60; i++) { const mid = (lo + hi) / 2; cdf(mid, a, b) < p ? lo = mid : hi = mid; }
    return (lo + hi) / 2;
  }
  function ci(key) { const [a, b] = params(key); return [quantile(0.025, a, b), quantile(0.975, a, b)]; }   // 95% 구간
  function probAbove(t, a, b) { return 1 - cdf(t, a, b); }

  // 톰슨 샘플링용: 감마 분포 두 개로 베타 난수 만들기 (Marsaglia–Tsang)
  function gamma(k) {
    if (k < 1) return gamma(k + 1) * Math.pow(Math.random(), 1 / k);
    const d = k - 1 / 3, c = 1 / Math.sqrt(9 * d);
    for (;;) {
      let x, v; do { const u1 = Math.random(), u2 = Math.random();
        x = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2); v = 1 + c * x; } while (v <= 0);
      v = v * v * v; const u = Math.random();
      if (u < 1 - 0.0331 * x ** 4 || Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
    }
  }
  function sample(key) { const [a, b] = params(key); const x = gamma(a), y = gamma(b); return x / (x + y); }

  // 단계 전체를 하나의 베타 분포로 묶어서 P(실력 > 75%) 계산
  function stageProb(keys) {
    let a = 1, b = 1;
    for (const k of keys) { const [ak, bk] = params(k); a += ak - 1; b += bk - 1; }
    return probAbove(PASS, a, b);
  }

  // 지금 단계 문제를 모두 한 번 이상 풀었고, P(단계 실력 > 75%) ≥ 80% 이면 다음 단계로
  function checkAdvance(stageKeys) {
    if (!L.auto || L.stage >= STAGES.length - 1) return false;
    if (!stageKeys.length || stageKeys.some(k => !L.items[k])) return false;
    if (stageProb(stageKeys) < CONF) return false;
    L.stage++; save(); return true;
  }

  // ---- 분석 리포트: 확실한 약점 / 판단 이른 것 / 익힌 것 + 맞춤 연습 방법 ----
  const TIP = {
    '초성·받침 혼동': '첫소리(4·5번 쪽)와 받침(1·2번 쪽) 자리를 나란히 비교해 보세요',
    '좌우 반전': '왼쪽 줄이 1·2·3번, 오른쪽 줄이 4·5·6번이에요',
    '위아래 반전': '1·3번, 4·6번이 뒤바뀌지 않게 위아래를 확인하세요',
    '점 빠짐': '다음을 누르기 전에 모든 점을 눌렀는지 확인하세요',
    '점 추가': '필요 없는 점을 같이 누르지 않았는지 확인하세요',
    '점 위치 틀림': '한 점이 옆자리로 밀렸어요. 점 번호를 천천히 세어 보세요',
    '다른 글자': '비슷한 글자와 헷갈렸어요. 두 글자를 번갈아 써 보세요',
    '칸 빠짐': '칸 하나를 빠뜨렸어요. 칸마다 다음을 눌렀는지 확인하세요',
    '칸 추가': '필요 없는 칸이 들어갔어요. 앞 칸을 지우기로 지워 보세요',
  };
  function report() {
    const out = { weak: [], unsure: [], strong: [] };
    for (const [k, it] of Object.entries(L.items)) {
      const [lo, hi] = ci(k), m = mastery(k);
      const topErr = it.err ? Object.entries(it.err).sort((x, y) => y[1] - x[1])[0] : null;
      const row = { key: k, m, lo, hi, n: it.n, topErr: topErr && topErr[0], tip: topErr && TIP[topErr[0]] };
      if (hi < 0.6) out.weak.push(row);                       // 구간 위쪽 끝도 60% 미만 → 확실히 약함
      else if (lo > PASS) out.strong.push(row);               // 구간 아래쪽 끝도 75% 초과 → 확실히 익힘
      else if (hi - lo > 0.5) out.unsure.push(row);           // 구간이 넓음 → 데이터가 더 필요
    }
    out.weak.sort((x, y) => x.m - y.m); out.unsure.sort((x, y) => x.n - y.n); out.strong.sort((x, y) => y.lo - x.lo);
    return out;
  }

  function csv() {
    const rows = [['구분', '문제', '푼 횟수', '맞음', '틀림', '망설임', '평균 시간(초)', '숙련도', 'alpha', 'beta', '95%하한', '95%상한', '오류 유형']];
    for (const [k, it] of Object.entries(L.items))
      { const [a, b] = params(k), [lo, hi] = ci(k);
      rows.push(['문제', k, it.n, it.c, it.w, it.slow, (it.t / it.n).toFixed(1), mastery(k).toFixed(3), a, b, lo.toFixed(3), hi.toFixed(3),
                 it.err ? Object.entries(it.err).map(([t, n]) => `${t}:${n}`).join(' ') : '']); }
    rows.push([]); rows.push(['구분', '날짜', '푼 문제', '틀린 문제', '오류율(%)', '평균 시간(초)', '망설임']);
    for (const [d, v] of Object.entries(L.days).sort())
      rows.push(['날짜', d, v.n, v.w, (v.w / v.n * 100).toFixed(1), (v.t / v.n).toFixed(1), v.slow || 0]);
    rows.push([]); rows.push(['구분', '오류 유형', '횟수']);
    for (const [t, n] of Object.entries(L.types)) rows.push(['오류', t, n]);
    return '﻿' + rows.map(r => r.map(x => `"${String(x ?? '').replace(/"/g, '""')}"`).join(',')).join('\r\n');
  }
  function reset() { L = { items: {}, days: {}, types: {}, stage: 0, auto: L.auto }; save(); }

  load();
  g.Learn = { get L() { return L; }, STAGES, PASS, CONF, SLOW, load, save, record, params, mastery, mean, ci, cdf, quantile, sample,
               stageProb, catOf, checkAdvance, report, csv, reset, today };
  if (typeof module !== 'undefined') module.exports = g.Learn;
})(typeof window !== 'undefined' ? window : globalThis);
