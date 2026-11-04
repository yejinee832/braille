// 퀴즈에서 틀렸을 때 "왜 틀렸는지" 진단하고, 오류 패턴을 모으는 코드
(function (g) {
  const M = () => g.BRAILLE_MAPS;
  const set = c => new Set(c.split(''));
  const MIRROR = { '1':'4','2':'5','3':'6','4':'1','5':'2','6':'3' };   // 좌우 반전
  const FLIP   = { '1':'3','3':'1','4':'6','6':'4','2':'2','5':'5' };   // 위아래 반전
  const mapCell = (c, m) => c.split('').map(d => m[d]).sort().join('');
  const dots = c => c.split('').join('·');

  // 칸이 무슨 뜻인지 (자리에 따라)
  function meaning(c) {
    const { INIT, VOW, FIN, SYL, VF } = M(); const r = [];
    if (INIT[c]) r.push(`첫소리 ${INIT[c]}`); if (VOW[c]) r.push(`모음 ${VOW[c]}`);
    if (FIN[c]) r.push(`받침 ${FIN[c]}`); if (SYL[c]) r.push(`약자 ${SYL[c][0] === 'ㄱ' ? '가' : '사'}`);
    if (VF[c]) r.push('약자');
    return r.join(' / ') || '없는 점자';
  }
  const jamoOf = c => { const { INIT, VOW, FIN } = M(); return INIT[c] || VOW[c] || FIN[c] || ''; };

  // 한 칸 비교: 정답 a, 입력 u
  function compareCell(u, a) {
    const { INIT, FIN } = M(); const U = set(u), A = set(a);
    const miss = [...A].filter(d => !U.has(d)), extra = [...U].filter(d => !A.has(d));
    if (FIN[u] && INIT[a] && FIN[u] === INIT[a])
      return { type: '초성·받침 혼동', msg: `${dots(u)}번 점은 받침 ${FIN[u]}이에요. 첫소리 ${INIT[a]}은 ${dots(a)}번 점이에요.` };
    if (INIT[u] && FIN[a] && INIT[u] === FIN[a])
      return { type: '초성·받침 혼동', msg: `${dots(u)}번 점은 첫소리 ${INIT[u]}이에요. 받침 ${FIN[a]}은 ${dots(a)}번 점이에요.` };
    if (u.length > 0 && mapCell(u, MIRROR) === a)
      return { type: '좌우 반전', msg: `좌우가 바뀌었어요. ${dots(u)}번이 아니라 ${dots(a)}번 점이에요.` };
    if (u.length > 0 && mapCell(u, FLIP) === a)
      return { type: '위아래 반전', msg: `위아래가 바뀌었어요. ${dots(u)}번이 아니라 ${dots(a)}번 점이에요.` };
    if (!extra.length && miss.length)
      return { type: '점 빠짐', msg: `${miss.join('·')}번 점을 빠뜨렸어요. 정답은 ${dots(a)}번 점이에요.` };
    if (!miss.length && extra.length)
      return { type: '점 추가', msg: `${extra.join('·')}번 점을 더 눌렀어요. 정답은 ${dots(a)}번 점이에요.` };
    if (miss.length + extra.length <= 2)
      return { type: '점 위치 틀림', msg: `${extra.join('·')}번 대신 ${miss.join('·')}번 점이에요. 정답은 ${dots(a)}번 점이에요.` };
    return { type: '다른 글자', msg: `${meaning(u)}(${dots(u)}) 대신 ${meaning(a)}(${dots(a)})를 써야 해요.` };
  }

  // 칸 순서 맞추기(편집 거리)로 빠진 칸·더 쓴 칸까지 찾기
  function align(U, A) {
    const n = U.length, m = A.length, D = [];
    for (let i = 0; i <= n; i++) { D[i] = []; for (let j = 0; j <= m; j++) D[i][j] = i === 0 ? j : j === 0 ? i : 0; }
    for (let i = 1; i <= n; i++) for (let j = 1; j <= m; j++)
      D[i][j] = Math.min(D[i-1][j] + 1, D[i][j-1] + 1, D[i-1][j-1] + (U[i-1] === A[j-1] ? 0 : 1));
    const ops = []; let i = n, j = m;
    while (i > 0 || j > 0) {
      if (i > 0 && j > 0 && D[i][j] === D[i-1][j-1] + (U[i-1] === A[j-1] ? 0 : 1)) { ops.unshift(['sub', U[i-1], A[j-1], j-1]); i--; j--; }
      else if (i > 0 && D[i][j] === D[i-1][j] + 1) { ops.unshift(['ins', U[i-1], null, j]); i--; }
      else { ops.unshift(['del', null, A[j-1], j-1]); j--; }
    }
    return { cost: D[n][m], ops };
  }

  // 입력 칸들과 정답(여러 표기 가능) 비교 → 오류 목록
  function diagnose(userCells, answers) {
    const { INIT, FIN } = M();
    let best = null;
    for (const ans of answers) { const A = ans.split('/'); const r = align(userCells, A); if (!best || r.cost < best.cost) best = { ...r, A }; }
    const errs = [];
    best.ops.forEach(([op, u, a, pos], k) => {
      const where = `${pos + 1}번째 칸`;
      if (op === 'sub' && u !== a) errs.push({ where, cell: a, ...compareCell(u, a) });
      if (op === 'del') errs.push({ where, cell: a, type: '칸 빠짐', msg: `${meaning(a)}(${dots(a)}번 점) 칸을 빠뜨렸어요.` });
      if (op === 'ins') {
        const nxt = best.A[pos];                                   // 바로 뒤 정답 칸
        if (nxt && FIN[u] && INIT[nxt] && FIN[u] === INIT[nxt])
          errs.push({ where, cell: nxt, type: '초성·받침 혼동', msg: `${dots(u)}번 점은 받침 ${FIN[u]}이에요. 첫소리 ${INIT[nxt]}은 ${dots(nxt)}번 점이에요.` });
        else errs.push({ where, cell: u, type: '칸 추가', msg: `필요 없는 칸(${meaning(u)}, ${dots(u)}번 점)을 더 썼어요.` });
      }
    });
    // 초성·받침 혼동으로 이미 설명한 칸 바로 뒤의 "그 칸"은 중복이므로 그대로 둠
    return { answer: best.A, errors: errs };
  }

  // 오류 패턴 모으기
  const stats = { types: {}, letters: {}, words: {}, total: 0, wrong: 0 };
  function record(word, ok, errors) {
    stats.total++; if (ok) return;
    stats.wrong++; stats.words[word] = (stats.words[word] || 0) + 1;
    for (const e of errors) {
      stats.types[e.type] = (stats.types[e.type] || 0) + 1;
      const j = jamoOf(e.cell); if (j) stats.letters[j] = (stats.letters[j] || 0) + 1;
    }
  }
  const top = (o, n) => Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, n);

  g.Diagnose = { diagnose, record, stats, top, compareCell };
  if (typeof module !== 'undefined') module.exports = g.Diagnose;
})(typeof window !== 'undefined' ? window : globalThis);
