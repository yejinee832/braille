"""
점자 쓰기 학습기 - 베타 분포 분석 리포트
사용법: python braille_beta_report.py 점자학습기록.csv
        (사이트 '나의 기록' → 'CSV 내보내기'로 받은 파일)
결과: beta_curves.png (약한 문제의 사후분포 곡선 + 95% 구간)
      beta_ci_bars.png (문제별 숙련도와 95% 신뢰구간)
      콘솔에 분석 리포트 출력

원리 (베타 분포):
  문제마다 '맞힐 확률 p'를 모른다고 보고 Beta(α, β)로 표현.
  시작은 Beta(1,1) = 아무것도 모르는 상태(균등분포).
  맞으면 α+1, 틀리면 β+1 (망설이면 0.5씩)  → 베이즈 갱신.
  평균 α/(α+β) = 숙련도, 2.5%~97.5% 분위수 = 95% 신뢰구간.
"""
import sys, csv
import numpy as np
from scipy.stats import beta
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib import font_manager
import logging
logging.getLogger("matplotlib.font_manager").setLevel(logging.ERROR)

for f in font_manager.findSystemFonts():
    if "NotoSansCJK" in f or "Nanum" in f or "malgun" in f.lower():
        font_manager.fontManager.addfont(f)
plt.rcParams["font.family"] = ["Noto Sans CJK KR", "NanumGothic", "Malgun Gothic", "sans-serif"]
plt.rcParams["axes.unicode_minus"] = False

PASS = 0.75   # 통과 기준 숙련도


def load(path):
    rows = []
    with open(path, encoding="utf-8-sig") as fp:
        for r in csv.DictReader(fp):
            if r.get("구분") != "문제":
                continue
            a, b = float(r["alpha"]), float(r["beta"])
            rows.append(dict(key=r["문제"], a=a, b=b, n=int(r["푼 횟수"]),
                             err=r.get("오류 유형", "")))
    return rows


def analyze(rows):
    for r in rows:
        r["m"] = r["a"] / (r["a"] + r["b"])
        r["lo"], r["hi"] = beta.ppf([0.025, 0.975], r["a"], r["b"])
        r["p_pass"] = 1 - beta.cdf(PASS, r["a"], r["b"])   # 실력이 75%를 넘을 확률
    weak = [r for r in rows if r["hi"] < 0.6]
    unsure = [r for r in rows if r["hi"] - r["lo"] > 0.5 and r not in weak]
    strong = [r for r in rows if r["lo"] > PASS]
    return weak, unsure, strong


def plot_curves(rows, out="beta_curves.png", k=5, tag=""):
    pick = sorted(rows, key=lambda r: r["m"])[:k]
    x = np.linspace(0, 1, 400)
    fig, ax = plt.subplots(figsize=(9, 5), dpi=200)
    for r in pick:
        y = beta.pdf(x, r["a"], r["b"])
        line, = ax.plot(x, y, lw=2, label=f'{r["key"]}  Beta({r["a"]:g}, {r["b"]:g})  평균 {r["m"]*100:.0f}%')
        band = (x >= r["lo"]) & (x <= r["hi"])
        ax.fill_between(x[band], y[band], alpha=0.15, color=line.get_color())
    ax.axvline(PASS, ls="--", color="gray")
    ax.text(PASS + 0.01, ax.get_ylim()[1] * 0.45, "통과 기준 75%", color="gray", rotation=90)
    ax.set_xlabel("맞힐 확률 p")
    ax.set_ylabel("확률 밀도")
    ax.set_title("약한 문제의 숙련도 분포 (색칠 = 95% 신뢰구간)" + tag)
    ax.legend(fontsize=9, loc="upper left")
    fig.tight_layout(); fig.savefig(out); plt.close(fig)


def plot_bars(rows, out="beta_ci_bars.png", k=12, tag=""):
    pick = sorted(rows, key=lambda r: r["m"])[:k][::-1]
    fig, ax = plt.subplots(figsize=(9, 0.45 * len(pick) + 1.5), dpi=200)
    y = np.arange(len(pick))
    m = np.array([r["m"] for r in pick])
    lo = np.array([r["lo"] for r in pick]); hi = np.array([r["hi"] for r in pick])
    col = ["#e03131" if r["hi"] < 0.6 else "#f08c00" if r["lo"] < PASS else "#2f9e44" for r in pick]
    ax.barh(y, m, color=col, alpha=0.8)
    ax.errorbar(m, y, xerr=[m - lo, hi - m], fmt="none", ecolor="black", capsize=3)
    ax.axvline(PASS, ls="--", color="gray")
    ax.set_yticks(y, [f'{r["key"]} ({r["n"]}회)' for r in pick])
    ax.set_xlim(0, 1); ax.set_xlabel("숙련도 (막대 = 평균, 선 = 95% 신뢰구간)")
    ax.set_title("문제별 숙련도  빨강: 확실히 약함 · 주황: 판단 중 · 초록: 익힘" + tag)
    fig.tight_layout(); fig.savefig(out); plt.close(fig)


def demo_csv(path="demo_기록_시뮬레이션.csv"):
    """실제 기록이 없을 때 쓰는 '가상 학습자' 데이터 (보고서에 실측값으로 쓰면 안 됨)"""
    rng = np.random.default_rng(7)
    true_p = {"모음 ㅏ": .9, "모음 ㅓ": .3, "모음 ㅗ": .55, "모음 ㅜ": .85, "모음 ㅑ": .8,
              "첫소리 ㄱ": .95, "첫소리 ㄴ": .9, "첫소리 ㄹ": .45, "받침 ㅇ": .4, "약자 가": .7}
    with open(path, "w", encoding="utf-8-sig", newline="") as fp:
        w = csv.writer(fp)
        w.writerow(["구분", "문제", "푼 횟수", "alpha", "beta", "오류 유형"])
        for k, p in true_p.items():
            n = int(rng.integers(3, 30)); c = int(rng.binomial(n, p))
            w.writerow(["문제", k, n, 1 + c, 1 + n - c, ""])
    return path


if __name__ == "__main__":
    path = sys.argv[1] if len(sys.argv) > 1 else demo_csv()
    tag = "" if len(sys.argv) > 1 else "\n[가상 데이터 예시]"
    rows = load(path)
    weak, unsure, strong = analyze(rows)
    print(f"[분석 파일] {path}  문제 {len(rows)}개\n")
    pct = lambda v: f"{v*100:.0f}%"
    print("■ 확실히 약한 문제 (95% 구간 위쪽 끝도 60% 미만)")
    for r in weak:
        print(f"  {r['key']}: 숙련도 {pct(r['m'])} (95% {pct(r['lo'])}~{pct(r['hi'])}) {r['err']}")
    print("■ 아직 판단하기 이른 문제 (구간 폭 50%p 이상 → 더 풀어 봐야 함)")
    for r in unsure:
        print(f"  {r['key']}: {r['n']}회, 95% {pct(r['lo'])}~{pct(r['hi'])}")
    print("■ 익힌 문제 (95% 구간 아래쪽 끝도 75% 초과)")
    print("  " + ", ".join(r["key"] for r in strong))
    plot_curves(rows, tag=tag); plot_bars(rows, tag=tag)
    print("\n그래프 저장: beta_curves.png, beta_ci_bars.png")
