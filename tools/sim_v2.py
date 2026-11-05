import random, datetime as dt, statistics as st, sys

START = dt.date(2026, 11, 2)            # lunes
END27 = dt.date(2027, 12, 31)
CATS = 'FIVDO'

# ---------- Estadísticas ----------
A, R = 1000, 1.10                       # costo nivel n -> n+1 = A * R^(n-1), 20 niveles
COST = [A * R ** n for n in range(20)]
CUM = [sum(COST[:i]) for i in range(21)]
def lvl(xp):
    n = 0
    while n < 20 and xp >= CUM[n + 1] - 1e-9: n += 1
    return n

X = dict(
    F_min=1.6, F_cap=120, F_w=250, F_wmin=360, F_m=650, F_mmin=1440,
    I_read=60, I_book=2500, I_book2=1250,
    O_clean=100, O_wdays=5, O_w=250, O_rep=1100, O_rep2=550,
    V_day=105, V_water=15, V_w=250, V_m=650, V_thr=0.8,
    D_w=750, D_m=1100,
)

# ---------- Mascota ----------
PA, PR = None, 1.03                     # PA se calibra
P = dict(sess=100, rec=150, wk=300, cyc=1000, cyc_need=4, max_sess=5)
def ladder(k, ses_idx):
    if k == 1: return 1 + 0.125 * min(ses_idx, 4)
    if k <= 4: return {2: 2.0, 3: 2.25, 4: 2.5}[k]
    return min(6.0, 3.0 + 0.5 * ((k - 5) // 4))
def need(k): return 5 if k == 1 else 4 if k <= 4 else 3

def pcum(pa):
    c = [0.0]
    for n in range(100): c.append(c[-1] + pa * PR ** n)
    return c

def run(sc, seed, pa, gates=None, weeks=110):
    rnd = random.Random(seed)
    p = sc['p']
    xp = {c: 0.0 for c in CATS}
    pxp = 0.0; PC = pcum(pa); ppts = {c: 0 for c in CATS}; plevel = 0
    k = 1                         # semana de racha
    out = dict(gate_day={}, lvl100=None, pet100=None, end27=None, blocked_days=0)
    month_acc = {}                # (y,m) -> dict
    cyc = {'ex': set(), 'n': 0}
    book_debt = 0
    floor = 0
    for w in range(weeks):
        wk_start = START + dt.timedelta(weeks=w)
        off = sc.get('off', set())
        training = w not in off
        sess = 0; wk_min = 0; clean = 0; food = []; recs = 0
        deload = (w % 4 == 3)
        for d in range(7):
            day = wk_start + dt.timedelta(days=d)
            ym = (day.year, day.month)
            M = month_acc.setdefault(ym, dict(min=0, food=[], books=0, reps=0, dok=True))
            ev = {c: 0.0 for c in CATS}
            # Fuerza + mascota (sesiones): 5 días planeados (lun-vie) + recuperación en finde
            go = False
            if training:
                if d < 5: go = rnd.random() < p
                else: go = sess < 5 and rnd.random() < sc.get('mk', 0.5) and (p < 1)
            if go:
                mins = 75 if p == 1 else rnd.randint(50, 90)
                mins = min(mins, X['F_cap'])
                ev['F'] += mins * X['F_min']; wk_min += mins; M['min'] += mins
                if sess < P['max_sess']:
                    pxp += P['sess'] * ladder(k, sess)
                sess += 1
            # Inteligencia
            if rnd.random() < p: ev['I'] += X['I_read']
            # Orden
            if clean < X['O_wdays'] and (rnd.random() < p if p < 1 else d < 5):
                clean += 1; ev['O'] += X['O_clean']
            # Vitalidad: agua todos los días, comida lunes a viernes
            if rnd.random() < p: ev['V'] += X['V_water']
            if d < 5:
                pct = 1.0 if p == 1 else rnd.choices(*sc['food'])[0]
                food.append(pct); M['food'].append(pct); ev['V'] += X['V_day'] * pct
            # libro / arreglo el día 25 de cada mes
            if day.day == 25:
                n = 0
                if rnd.random() < p: n += 1
                if book_debt and rnd.random() < p * 0.5: n += 1; book_debt -= 1
                if n == 0: book_debt += 1
                for j in range(n):
                    ev['I'] += X['I_book'] if M['books'] == 0 else X['I_book2']; M['books'] += 1
                if rnd.random() < p: ev['O'] += X['O_rep']; M['reps'] += 1
            # cierre de mes (último día)
            if (day + dt.timedelta(days=1)).month != day.month:
                if M['min'] >= X['F_mmin']: ev['F'] += X['F_m']
                if M['food'] and st.mean(M['food']) >= X['V_thr']: ev['V'] += X['V_m']
                if M['dok']: ev['D'] += X['D_m']
            # cierre de semana (domingo)
            if d == 6:
                if wk_min >= X['F_wmin']: ev['F'] += X['F_w']
                if clean >= X['O_wdays']: ev['O'] += X['O_w']
                if st.mean(food) >= X['V_thr']: ev['V'] += X['V_w']
                gok = rnd.random() < p if p < 1 else True
                if gok: ev['D'] += X['D_w']
                else: M['dok'] = False
                # progreso de la mascota
                if training and sess >= 2:
                    nrec = (1 if rnd.random() < sc.get('prog', p) else 0) if p < 1 else 1
                    if sc.get('rec_extra') and w < sc['rec_extra']: nrec += 1
                    if nrec:
                        pxp += nrec * P['rec'] * ladder(k, 4) + P['wk']
                        for _ in range(nrec):
                            cyc['ex'].add((w, _))
                if w % 4 == 3:
                    if len(cyc['ex']) >= P['cyc_need']: pxp += P['cyc']
                    cyc['ex'] = set()
                # racha
                k = k + 1 if sess >= need(k) else 1
            for c in CATS: xp[c] += ev[c]
            # mascota: niveles y puntos (al más bajo efectivo)
            while plevel < 100 and pxp >= PC[plevel + 1]:
                plevel += 1
                st_l = {c: lvl(xp[c]) for c in CATS}
                cand = [c for c in CATS if ppts[c] < 20]
                c = min(cand, key=lambda c: (st_l[c] + ppts[c], CATS.index(c)))
                ppts[c] += 1
            L = {c: lvl(xp[c]) for c in CATS}
            level = sum(L.values())
            eff = {c: L[c] + ppts[c] for c in CATS}
            # pisos y puertas
            if gates:
                f = level
                for g in range(10, 101, 10):
                    if level >= g and not all(eff[c] >= gates[g] for c in CATS):
                        f = g - 1 if g == 100 else g
                        break
                    if level >= g and g not in out['gate_day']: out['gate_day'][g] = day
                if f < level: out['blocked_days'] += 1
                floor = max(floor, f)
            else:
                floor = level
                for g in range(10, 101, 10):
                    if level >= g and g not in out['gate_day']:
                        out['gate_day'][g] = (day, min(eff.values()), plevel)
            if level == 100 and not out['lvl100']: out['lvl100'] = day
            if plevel == 100 and not out['pet100']: out['pet100'] = day
            if day == END27: out['end27'] = dict(floor=floor, level=level, pet=plevel, eff=dict(eff))
            if gates and floor == 100 and 'floor100' not in out: out['floor100'] = day
    return out

def calib():
    # mascota perfecta termina cuando terminan las estadísticas
    perf = dict(p=1.0)
    lo, hi = 50, 5000
    base = run(perf, 1, 1e9)['lvl100']
    for _ in range(40):
        mid = (lo + hi) / 2
        d = run(perf, 1, mid)['pet100']
        if d is None or d > base: hi = mid
        else: lo = mid
    return lo, base

if __name__ == '__main__':
    pa, base = calib()
    print('stats nivel 100 perfecto:', base, ' PA mascota =', round(pa, 1))
    o = run(dict(p=1.0), 1, pa)
    print('mascota 100:', o['pet100'])
    for g, (d, m, pl) in sorted(o['gate_day'].items()):
        print(g, d, 'min efectivo', m, 'mascota', pl)
