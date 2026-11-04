// 점자 칸들(예: ['6','126','4','1236'])을 한글 낱말(예: '사과')로 조합
// 한국 점자 규칙: 초성 ㅇ 생략, 나·다·마… 약자, 된소리표, 겹모음(…/1235), 겹받침, 약어(그래서…)
(function (g) {
  const INIT = {'4':'ㄱ','14':'ㄴ','24':'ㄷ','5':'ㄹ','15':'ㅁ','45':'ㅂ','6':'ㅅ','46':'ㅈ','56':'ㅊ',
                '124':'ㅋ','125':'ㅌ','145':'ㅍ','245':'ㅎ'};
  const VOW  = {'126':'ㅏ','345':'ㅑ','234':'ㅓ','156':'ㅕ','136':'ㅗ','346':'ㅛ','134':'ㅜ','146':'ㅠ',
                '246':'ㅡ','135':'ㅣ','1235':'ㅐ','1345':'ㅔ','34':'ㅖ','1236':'ㅘ','13456':'ㅚ','1234':'ㅝ','2456':'ㅢ'};
  const VOW2 = {'ㅑ':'ㅒ','ㅘ':'ㅙ','ㅝ':'ㅞ','ㅜ':'ㅟ'};               // 앞 모음 + 1235
  const FIN  = {'1':'ㄱ','25':'ㄴ','35':'ㄷ','2':'ㄹ','26':'ㅁ','12':'ㅂ','3':'ㅅ','2356':'ㅇ','13':'ㅈ',
                '23':'ㅊ','235':'ㅋ','236':'ㅌ','256':'ㅍ','356':'ㅎ','34':'ㅆ'};
  const SYL  = {'1246':['ㄱ','ㅏ'], '123':['ㅅ','ㅏ']};                   // 가, 사
  const VF   = {'1456':['ㅓ','ㄱ'],'23456':['ㅓ','ㄴ'],'2345':['ㅓ','ㄹ'],'16':['ㅕ','ㄴ'],'1256':['ㅕ','ㄹ'],
                '12456':['ㅕ','ㅇ'],'1346':['ㅗ','ㄱ'],'12356':['ㅗ','ㄴ'],'123456':['ㅗ','ㅇ'],'1245':['ㅜ','ㄴ'],
                '12346':['ㅜ','ㄹ'],'1356':['ㅡ','ㄴ'],'2346':['ㅡ','ㄹ'],'12345':['ㅣ','ㄴ']};   // 억 언 얼 …
  const ABBR = new Set(['ㄴ','ㄷ','ㅁ','ㅂ','ㅈ','ㅋ','ㅌ','ㅍ','ㅎ']);  // 뒤에 모음이 없으면 +ㅏ (나 다 마 …)
  const TENSE = {'ㄱ':'ㄲ','ㄷ':'ㄸ','ㅂ':'ㅃ','ㅅ':'ㅆ','ㅈ':'ㅉ'};
  const DFIN = {'ㄱㅅ':'ㄳ','ㄴㅈ':'ㄵ','ㄴㅎ':'ㄶ','ㄹㄱ':'ㄺ','ㄹㅁ':'ㄻ','ㄹㅂ':'ㄼ','ㄹㅅ':'ㄽ','ㄹㅌ':'ㄾ',
                'ㄹㅍ':'ㄿ','ㄹㅎ':'ㅀ','ㅂㅅ':'ㅄ','ㄱㄱ':'ㄲ'};
  const PHR  = {'1/234':'그래서','1/14':'그러나','1/25':'그러면','1/26':'그러므로','1/1345':'그런데',
                '1/136':'그리고','1/156':'그리하여'};

  const L = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ';
  const V = 'ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ';
  const T = ['','ㄱ','ㄲ','ㄳ','ㄴ','ㄵ','ㄶ','ㄷ','ㄹ','ㄺ','ㄻ','ㄼ','ㄽ','ㄾ','ㄿ','ㅀ','ㅁ','ㅂ','ㅄ','ㅅ','ㅆ','ㅇ','ㅈ','ㅊ','ㅋ','ㅌ','ㅍ','ㅎ'];
  const build = s => !s.v ? s.i
    : String.fromCharCode(0xAC00 + (L.indexOf(s.i) * 21 + V.indexOf(s.v)) * 28 + T.indexOf(s.f || ''));

  // partial = true 이면 마지막에 남은 초성을 '나'처럼 바꾸지 않음 (아직 쓰는 중일 때)
  function compose(cells, partial) {
    let out = '', cur = null;
    const flush = () => { if (cur) { out += build(cur); cur = null; } };
    for (let k = 0; k < cells.length; k++) {
      const c = cells[k], nx = cells[k + 1];
      if (!cur && nx && PHR[c + '/' + nx]) { out += PHR[c + '/' + nx]; k++; continue; }   // 약어
      if (c === '456' && nx === '234') { flush(); out += '것'; k++; continue; }            // 것

      if (cur && cur.v) {                                   // 모음까지 있음 → 받침 자리
        if (!cur.f && c === '1235' && VOW2[cur.v]) { cur.v = VOW2[cur.v]; continue; }      // 겹모음
        if (FIN[c] && !cur.f) { cur.f = FIN[c]; continue; }
        if (FIN[c] && DFIN[cur.f + FIN[c]]) { cur.f = DFIN[cur.f + FIN[c]]; continue; }    // 겹받침
        flush();                                            // 받침이 아니면 새 글자 시작
      }
      if (cur && !cur.v) {                                  // 초성만 있음 → 모음 자리
        if (VOW[c]) { cur.v = VOW[c]; continue; }
        if (VF[c])  { cur.v = VF[c][0]; cur.f = VF[c][1]; continue; }
        if (ABBR.has(cur.i)) { cur.v = 'ㅏ'; k--; continue; }   // 나·다… 약자, 이 칸은 다시 처리
        flush();                                            // ㄱ·ㄹ·ㅅ·ㅊ 단독은 그대로 둠
      }
      // 새 글자 시작
      if (c === '6' && nx && INIT[nx] && TENSE[INIT[nx]]) { cur = { i: TENSE[INIT[nx]] }; k++; continue; } // 된소리
      if (c === '6' && nx && SYL[nx]) { cur = { i: TENSE[SYL[nx][0]], v: 'ㅏ' }; k++; continue; }           // 까, 싸
      if (INIT[c]) { cur = { i: INIT[c] }; continue; }
      if (SYL[c])  { cur = { i: SYL[c][0], v: SYL[c][1] }; continue; }
      if (VOW[c])  { cur = { i: 'ㅇ', v: VOW[c] }; continue; }                 // 초성 ㅇ 생략
      if (VF[c])   { cur = { i: 'ㅇ', v: VF[c][0], f: VF[c][1] }; continue; }
      out += '?';
    }
    if (cur && !cur.v && !partial && ABBR.has(cur.i)) cur.v = 'ㅏ';
    flush();
    return out;
  }
  g.composeBraille = compose;
  g.BRAILLE_MAPS = { INIT, VOW, FIN, SYL, VF };
  if (typeof module !== 'undefined') module.exports = compose;
})(typeof window !== 'undefined' ? window : globalThis);
