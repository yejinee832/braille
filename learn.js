// 학습 기록·숙련도·단계 자동 진행
// - 기록은 폰(브라우저)에 저장돼서 새로고침해도 남아요.
// - 숙련도: Beta 분포 평균. 맞으면 +1, 틀리면 실패 +1, 맞았지만 오래 걸리면 반쯤 실패로 봄.
// - 단계: 모음 → 첫소리 → 받침 → 약자 → 단어 (복지관 인터뷰에서 들은 학습 순서)
(function (g) {
  const KEY = 'brailleLearn_v1';
  const STAGES = ['모음', '첫소리', '받침', '약자', '단어'];
  const SLOW = { basic: 6, word: 20 };              // 이 시간(초)보다 오래 걸리면 '망설임'
  const PASS = 0.75;                                 // 단계 통과 기준 숙련도
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
    for (const e of errors || []) L.types[e.type] = (L.types[e.type] || 0) + 1;
    save();
    return slow;
  }

  // 숙련도 0~1 (처음 보는 문제는 0.5)
  function mastery(key) {
    const it = L.items[key]; if (!it) return 0.5;
    const a = 1 + it.c - 0.5 * it.slow, b = 1 + it.w + 0.5 * it.slow;
    return a / (a + b);
  }
  const mean = keys => keys.length ? keys.reduce((s, k) => s + mastery(k), 0) / keys.length : 0;

  // 지금 단계 문제를 모두 한 번 이상 풀었고 평균 숙련도가 기준 이상이면 다음 단계로
  function checkAdvance(stageKeys) {
    if (!L.auto || L.stage >= STAGES.length - 1) return false;
    if (!stageKeys.length || stageKeys.some(k => !L.items[k])) return false;
    if (mean(stageKeys) < PASS) return false;
    L.stage++; save(); return true;
  }

  function csv() {
    const rows = [['구분', '문제', '푼 횟수', '맞음', '틀림', '망설임', '평균 시간(초)', '숙련도']];
    for (const [k, it] of Object.entries(L.items))
      rows.push(['문제', k, it.n, it.c, it.w, it.slow, (it.t / it.n).toFixed(1), mastery(k).toFixed(2)]);
    rows.push([]); rows.push(['구분', '날짜', '푼 문제', '틀린 문제', '오류율(%)', '평균 시간(초)', '망설임']);
    for (const [d, v] of Object.entries(L.days).sort())
      rows.push(['날짜', d, v.n, v.w, (v.w / v.n * 100).toFixed(1), (v.t / v.n).toFixed(1), v.slow || 0]);
    rows.push([]); rows.push(['구분', '오류 유형', '횟수']);
    for (const [t, n] of Object.entries(L.types)) rows.push(['오류', t, n]);
    return '﻿' + rows.map(r => r.map(x => `"${String(x ?? '').replace(/"/g, '""')}"`).join(',')).join('\r\n');
  }
  function reset() { L = { items: {}, days: {}, types: {}, stage: 0, auto: L.auto }; save(); }

  load();
  g.Learn = { get L() { return L; }, STAGES, PASS, SLOW, load, save, record, mastery, mean, catOf, checkAdvance, csv, reset, today };
  if (typeof module !== 'undefined') module.exports = g.Learn;
})(typeof window !== 'undefined' ? window : globalThis);
