"""
가상 학습자 시뮬레이션: 점자를 처음 배우는 사람 N명에게 출제 방식별로 학습시키고 비교

학습자 모델 (지식 추적 BKT + 망각, 교육공학의 '가상 학생' 기법)
  - 글자마다 '아는 상태' K ∈ {0, 1}. 처음엔 전부 0 (점자를 한 번도 안 배운 사람)
  - 답하기: 알면 1 - 실수율(slip), 모르면 찍어서 맞힐 확률(guess)
  - 배우기: 한 문제 풀고 피드백(정답)을 들으면, 모르던 글자를 p_learn 확률로 익힘
  - 잊기: 익힌 글자도 시간이 지나면 조금씩 잊음. 여러 번 맞힐수록 덜 잊음(간격 효과)
  - 개인차: 학습 능력 a ~ 로그정규분포 (사람마다 빠르기가 다름)
  - 헷갈리는 글자: 좌우·위아래로 뒤집으면 다른 글자가 되는 점자는 더 어렵고 실수도 많음

출제 방식 (모두 같은 '단계 통과 규칙'을 씀)
  ① 순서대로 반복 (교재식)
  ② 무작위
  ③ 오답 가중 (이전 버전: 가중치 1 + 6 × (1 − 숙련도))
  ④ 톰슨 샘플링 (현재 버전: Beta(α, β)에서 뽑아 가장 낮은 문제)
같은 가상 학습자(같은 능력·같은 난수)를 네 방식에 똑같이 넣어 짝지어 비교 (paired design)
"""
import json, sys
import numpy as np
from scipy.stats import beta as Beta, wilcoxon

ITEMS = json.load(open(sys.argv[1] if len(sys.argv) > 1 else "items.json", encoding="utf-8"))
STAGES = ["모음", "첫소리", "받침", "약자"]
CAT = np.array([STAGES.index(x["cat"]) for x in ITEMS])
NI = len(ITEMS)
PASS, CONF = 0.75, 0.8

# 헷갈리는 글자: 좌우(1↔4,2↔5,3↔6) 또는 위아래(1↔3,4↔6) 뒤집으면 같은 범주의 다른 글자
def flip(cell, m): return "".join(sorted(m.get(c, c) for c in cell))
LR = dict(zip("123456", "456123")); UD = {"1": "3", "3": "1", "4": "6", "6": "4"}
cells = {(x["cat"], "".join(sorted(x["cell"]))) for x in ITEMS}
CONFUSABLE = np.array([any((x["cat"], flip(x["cell"], m)) in cells and flip(x["cell"], m) != "".join(sorted(x["cell"]))
                           for m in (LR, UD)) for x in ITEMS])
BASE_LEARN = np.array([[0.30, 0.30, 0.25, 0.20][c] for c in CAT]) * np.where(CONFUSABLE, 0.75, 1.0)
SLIP = np.where(CONFUSABLE, 0.15, 0.08); GUESS = 0.05


class System:
    """사이트의 learn.js 와 같은 규칙: Beta(1+맞음, 1+틀림), 단계 통과 = 모든 문제 1회 이상 + P(p>0.75) ≥ 0.8"""
    def __init__(s, decay=1.0):
        s.decay = decay   # 1.0 = 지금 사이트(전부 누적), 0.8 = 개선안(그 글자를 새로 풀 때마다 이전 기록 × 0.8)
        s.c = np.zeros(NI); s.w = np.zeros(NI); s.n = np.zeros(NI); s.stage = 0; s.last = -1
        s.pass_log = []  # (단계, 통과 시점 그 단계 글자의 실제 숙지 비율)

    def pool(s):
        m = CAT <= min(s.stage, 3)
        if s.last >= 0: m = m.copy(); m[s.last] = False
        return np.flatnonzero(m)

    def record(s, i, ok, K):
        s.c[i] *= s.decay; s.w[i] *= s.decay
        s.n[i] += 1; s.c[i] += ok; s.w[i] += (not ok); s.last = i
        if s.stage < 4:
            keys = np.flatnonzero(CAT == s.stage)
            if (s.n[keys] > 0).all():
                a = 1 + s.c[keys].sum(); b = 1 + s.w[keys].sum()
                if 1 - Beta.cdf(PASS, a, b) >= CONF:
                    s.pass_log.append((s.stage, K[keys].mean())); s.stage += 1


def choose(strategy, sysm, rng, order_ptr):
    P = sysm.pool(); cur = min(sysm.stage, 3)
    if strategy == "순서대로":
        cand = [i for i in P if CAT[i] == cur] or list(P)
        i = cand[order_ptr[0] % len(cand)]; order_ptr[0] += 1; return i
    if strategy == "무작위":
        return rng.choice(P)
    if strategy == "오답 가중":
        m = (1 + sysm.c[P]) / (2 + sysm.n[P])
        w = (1 + 6 * (1 - m)) * np.where(CAT[P] == cur, 2, 1)
        return rng.choice(P, p=w / w.sum())
    if strategy == "톰슨 샘플링":
        v = rng.beta(1 + sysm.c[P], 1 + sysm.w[P]) - np.where(CAT[P] == cur, 0.15, 0)
        return P[np.argmin(v)]


def run(strategy, seed, T=300, forget=0.006, learn_scale=1.0, decay=1.0):
    rng_l = np.random.default_rng(seed)               # 학습자(능력, 반응, 학습, 망각) 난수
    rng_s = np.random.default_rng(seed + 10**6)       # 출제 난수
    a = rng_l.lognormal(0, 0.35)
    p_learn = np.clip(BASE_LEARN * a * learn_scale, 0.02, 0.7)
    K = np.zeros(NI, bool); strength = np.zeros(NI)
    sysm = System(decay); ptr = [0]
    t_stage = [np.nan] * 4
    known_curve = np.zeros(T + 1); known_curve[0] = 0
    t_all = None
    # 반응·학습·망각에 쓸 난수를 미리 뽑아 둬서 방식 간 공정하게 (common random numbers)
    U_resp = rng_l.random(T); U_learn = rng_l.random(T); U_forget = rng_l.random((T, NI))
    for t in range(T):
        i = choose(strategy, sysm, rng_s, ptr)
        ok = U_resp[t] < ((1 - SLIP[i]) if K[i] else GUESS)
        st0 = sysm.stage; sysm.record(i, ok, K)
        if sysm.stage > st0: t_stage[st0] = t + 1
        if ok and K[i]: strength[i] += 1
        if not K[i] and U_learn[t] < p_learn[i]: K[i] = True       # 피드백 듣고 익힘
        h = forget / (1 + strength)                                # 간격 효과: 많이 맞힐수록 덜 잊음
        lost = K & (U_forget[t] < h); lost[i] = False
        K[lost] = False
        known_curve[t + 1] = K.mean()
        if t_all is None and K.all(): t_all = t + 1
    post = np.where(K, 1 - SLIP, GUESS).mean()                     # 끝난 뒤 전체 글자 시험 정답률(기대값)
    # 시스템 판정이 맞는지: 리포트의 '확실히 약함'(95% 상한 < 0.6)과 '익힘'(하한 > 0.75)
    seen = sysm.n > 0
    lo = Beta.ppf(0.025, 1 + sysm.c, 1 + sysm.w); hi = Beta.ppf(0.975, 1 + sysm.c, 1 + sysm.w)
    weak = seen & (hi < 0.6); strong = seen & (lo > PASS)
    return dict(t_stage=t_stage, curve=known_curve, t_all=t_all if t_all else np.nan, post=post, stage=sysm.stage,
                weak_n=int(weak.sum()), weak_true=int((weak & ~K).sum()),
                strong_n=int(strong.sum()), strong_true=int((strong & K).sum()),
                pass_log=sysm.pass_log)


CONDS = [("순서대로", 1.0), ("무작위", 1.0), ("오답 가중", 1.0), ("톰슨 샘플링", 1.0), ("톰슨 샘플링", 0.8)]
NAME = lambda c: c[0] + (" + 최근 기록 가중" if c[1] < 1 else "")

def ci(x):
    x = np.asarray(x, float); x = x[~np.isnan(x)]
    if len(x) < 2: return (np.nan,) * 3
    m = x.mean(); h = 1.96 * x.std(ddof=1) / np.sqrt(len(x)); return m, m - h, m + h

def experiment(N, T, **kw):
    return {NAME(c): [run(c[0], seed, T, decay=c[1], **kw) for seed in range(N)] for c in CONDS}

def report(R, T, out=None):
    S = {}
    for name, r in R.items():
        k100 = ci([x["curve"][100] * NI for x in r]); kT = ci([x["curve"][T] * NI for x in r])
        post = ci([x["post"] * 100 for x in r])
        st1 = [x["t_stage"][0] for x in r]; p1 = np.mean(~np.isnan(st1)) * 100
        fin = np.mean([x["stage"] >= 4 for x in r]) * 100
        wn = sum(x["weak_n"] for x in r); wt = sum(x["weak_true"] for x in r)
        sn = sum(x["strong_n"] for x in r); stt = sum(x["strong_true"] for x in r)
        pl = [v for x in r for (_, v) in x["pass_log"]]
        S[name] = dict(k100=k100, kT=kT, post=post, stage1_pass=p1, stage1_t=ci(st1), finish=fin,
                       weak_prec=wt / wn * 100 if wn else np.nan, strong_prec=stt / sn * 100 if sn else np.nan,
                       pass_known=np.mean(pl) * 100 if pl else np.nan)
        print(f"{name:22s}| 100문제 후 익힌 글자 {k100[0]:5.1f} | {T}문제 후 {kT[0]:5.1f} | 최종 정답률 {post[0]:5.1f}% | "
              f"1단계 통과 {p1:5.1f}% (평균 {S[name]['stage1_t'][0]:.0f}문제) | 4단계 완료 {fin:5.1f}% | "
              f"통과 순간 실제 숙지 {S[name]['pass_known']:.0f}% | 약함 판정 정확 {S[name]['weak_prec']:.0f}% | 익힘 판정 정확 {S[name]['strong_prec']:.0f}%")
    return S

def paired(R, a, b, t):
    x = np.array([v["curve"][t] for v in R[a]]) * NI; y = np.array([v["curve"][t] for v in R[b]]) * NI
    st, p = wilcoxon(x, y); return (x - y).mean(), p, np.mean(x > y) * 100


if __name__ == "__main__":
    import pickle
    N = int(sys.argv[2]) if len(sys.argv) > 2 else 500; T = 500
    print(f"문제 {NI}개 (헷갈리는 글자 {CONFUSABLE.sum()}개), 가상 학습자 {N}명, 1인당 {T}문제\n")
    R = experiment(N, T); pickle.dump(R, open("main.pkl", "wb"))
    S = report(R, T)
    print("\n[짝지은 윌콕슨 검정] 익힌 글자 수 차이")
    tests = {}
    best = NAME(CONDS[-1])
    for t in (100, 300):
        for o in [NAME(c) for c in CONDS[:-1]]:
            d, p, w = paired(R, best, o, t); tests[f"{t}|{o}"] = (d, p, w)
            print(f"  {t}문제 시점  개선안 vs {o:12s}: {d:+.2f}글자, p = {p:.1e}, 개선안이 더 많은 사람 {w:.0f}%")
    # 민감도 분석: 학습 모델 가정을 바꿔도 순위가 유지되는지
    print("\n[민감도 분석] 가정을 바꿔서 N=200으로 다시 (300문제 시점 익힌 글자 수)")
    sens = {}
    for label, kw in [("망각 없음", dict(forget=0.0)), ("망각 2배", dict(forget=0.012)),
                      ("학습 느림(×0.6)", dict(learn_scale=0.6)), ("학습 빠름(×1.5)", dict(learn_scale=1.5))]:
        r2 = {NAME(c): [run(c[0], sd, 300, decay=c[1], **kw) for sd in range(200)] for c in CONDS}
        row = {k: float(np.mean([x["curve"][300] for x in v]) * NI) for k, v in r2.items()}
        sens[label] = row
        print(f"  {label:12s} " + " | ".join(f"{k} {v:.1f}" for k, v in row.items()))
    json.dump(dict(N=N, T=T, S=S, tests=tests, sens=sens), open("summary.json", "w", encoding="utf-8"),
              ensure_ascii=False, indent=1, default=float)
