#!/usr/bin/env python3
"""Life Reset 66 - simulador v4 (mascota nivel 1-50, +1/semana, aporta nivel//10; racha congelada si bloqueado).
v2 (XP por unidades de avance fechadas) + estadisticas, caps, puertas visagra (combo de 2 estadisticas),
puertas de objetivo mensual y mascota con tope relativo. Piso == nivel."""
import datetime as dt, math, random

CFG = dict(
    d=50, W=300.0, Mp=1500.0, r=1.015, A=4650.0,
    weekly_bonus=[0, .2, .3, .4, .5],
    start=dt.date(2026, 11, 2), weeks=300,
    gym_m=18, aero_m=12, book_tramos=10, imp_units=6, dchk=2, daily_mult=False,
    # --- estadisticas / puertas ---
    stat_pw=1,            # puntos de estadistica por semanal cumplida
    stat_pen=1,           # puntos que resta un mensual fallado (piso 0)
    hinge_every=10,       # una puerta visagra cada N pisos
    req_scale=0.9,        # requisito de la visagra = round(req_scale * piso)
    combos=[('F','I'),('I','O'),('O','D'),('D','V'),('V','F'),('F','O'),('I','D'),('O','V'),('D','F'),('F','I')],
    streak_gates={25: 2, 50: 4, 75: 6, 100: 8},   # puertas que exigen racha mensual activa (meses)
    disc_pen='stat',      # penalidad si falla la prueba de Disciplina Y el antiobjetivo: 'stat' | 'xp' | None
    pet_ratio=0.10,       # la mascota suma como maximo 10 % del tope de estadistica vigente
    pet_xp_week=25, pet_k=20.0, pet_q=1.35,
    pet_strict=True, equip_anytime=True,   # regla de diseno: solo la mascota EQUIPADA aporta; se puede equipar en cualquier momento
    pet_costs=(10,13,17,22,29), pet_week=10, pet_order=('F','I','V','D','O'), freeze_other_stats=False, stat_scale=0.5, freeze_days=14,
)
CATS = ['F', 'I', 'V', 'D', 'O']
NAMB = 6

def cum_xp(n, A, r): return A * (r ** (n - 1) - 1) / (r - 1)
def level_of(xp, A, r): return 1 + int(math.log(1 + xp * (r - 1) / A + 1e-12) / math.log(r))

def build_gates(cfg):
    G = {}
    if cfg['hinge_every']:
        for k, g in enumerate(range(cfg['hinge_every'], 101, cfg['hinge_every'])):
            G[g] = dict(stats=cfg['combos'][k % len(cfg['combos'])], req=math.floor(cfg['req_scale'] * cfg['stat_scale'] * g + 1e-9))
    for g, need in cfg['streak_gates'].items():
        G.setdefault(g, {})['streak'] = need
    return G

def pet_level(cfg, pxp):
    L = 0
    while cfg['pet_k'] * (cfg['pet_q'] ** (L + 1) - 1) / (cfg['pet_q'] - 1) <= pxp: L += 1
    return L

def build_calendar(cfg):
    weeks = []
    for k in range(cfg['weeks']):
        mon = cfg['start'] + dt.timedelta(days=7 * k)
        thu = mon + dt.timedelta(days=3)
        weeks.append(dict(i=k, mon=mon, ym=(thu.year, thu.month)))
    months = []
    for wk in weeks:
        if not months or months[-1]['ym'] != wk['ym']:
            months.append(dict(ym=wk['ym'], weeks=[]))
        months[-1]['weeks'].append(wk['i'])
    return weeks, months

def make_plan(cfg, p=None, seed=0, force_fail=None, break_at_floor=None, lazy=False, skip_weeks=None, p_feed=1.0, anti_fail_weeks=None):
    """p: probabilidades por actividad (None = perfecto). skip_weeks: {cat: set(indices de semana)} sin actividad de esa categoria."""
    P = dict(gym=1, read=1, aero=1, clean=1, wk_clean=1, disc=1, anti=1, tasks=1, improve=1)
    if p: P.update(p)
    rng = random.Random(seed)
    weeks, months = build_calendar(cfg)
    nd = len(weeks) * 7
    days = [dict(gym=False, read=False, aero=False, clean=0, dwork=False, imp=False) for _ in range(nd)]
    wk = [dict(anti=rng.random() < P['anti'], tasks=rng.random() < P['tasks'], feed=rng.random() < p_feed) for _ in weeks]
    for wi in range(len(weeks)):
        for dd in range(7):
            i = wi * 7 + dd
            if lazy:
                if dd < 3: days[i].update(aero=True, dwork=(lazy == 1))
                if dd < 5: days[i].update(read=True, gym=True)
                continue
            if dd < 5:
                for k in ('gym', 'read', 'aero'):
                    if rng.random() < P[k]: days[i][k] = True
                if dd < 3 and rng.random() < P['disc']: days[i]['dwork'] = True
                if rng.random() < P['clean']: days[i]['clean'] = 1
            elif dd == 5:
                if rng.random() < P['wk_clean']: days[i]['clean'] = 1
    for m in months:
        for wi in m['weeks'][:4]:
            for dd in (1, 3):
                if (not lazy and rng.random() < P['improve']): days[wi * 7 + dd]['imp'] = True
    for cat, wset in (skip_weeks or {}).items():
        key = dict(F='gym', I='read', V='aero', D='dwork')
        for wi in wset:
            for dd in range(7):
                day = days[wi * 7 + dd]
                if cat == 'O': day['clean'] = 0; day['imp'] = False if dd in (1, 3) else day['imp']
                else: day[key[cat]] = False
    for wi in (anti_fail_weeks or []): wk[wi]['anti'] = False
    return dict(days=days, wk=wk, force_fail=force_fail or {}, break_at_floor=break_at_floor, lazy=lazy)

def simulate(cfg, plan, stop_at_tower=True):
    A, r = cfg['A'], cfg['r']; d, W, Mp = cfg['d'], cfg['W'], cfg['Mp']
    weeks, months = build_calendar(cfg); gates = build_gates(cfg)
    hinge = sorted(g for g in gates if 'stats' in gates[g])
    xp = 0.0; cleared = set(); blocked = None
    stat = {c: 0 for c in CATS}; s = 0; PX = {c: 0 for c in CATS}; cum = [0]
    for x in cfg['pet_costs']: cum.append(cum[-1] + x)
    def plv(c): return sum(1 for t in cum[1:] if PX[c] >= t)
    eq = cfg['pet_order'][0]; pet_max_week = None; feedstreak = 0
    L = dict(potential=0.0, lost_block=0.0, lost_clamp=0.0, per_month=[], arrive={}, cleared_day={}, multi_days=[],
             jump_max=0, ratio_max=0.0, tower=None, timeline=[], ratios=[], broken=None, blocks=[],
             stat_wasted=0, days_blocked_stat=0, days_blocked_obj=0, stat_hist=[])
    st = {}   # estado mutable compartido
    def cap_stat():
        for g in hinge:
            if g not in cleared: return int(g * cfg['stat_scale'])
        return 10 ** 9
    def stat_ok(G):
        g = gates[G]
        if 'stats' not in g: return True
        a, b = g['stats']; req = g['req']
        da, db = max(0, req - stat[a]), max(0, req - stat[b])
        capb = int(cfg['pet_ratio'] * G * cfg['stat_scale'] + 1e-9)
        if da == 0 and db == 0: return True
        pl = (lambda c: plv(c) if eq == c else 0) if cfg.get('pet_strict') else plv
        return (db == 0 and da <= min(pl(a), capb)) or (da == 0 and db <= min(pl(b), capb))
    def gate_ok(G, mdone):
        g = gates[G]
        return ('streak' not in g or s >= g['streak']) and stat_ok(G)
    for mi, m in enumerate(months):
        mday0 = m['weeks'][0] * 7; nmd = len(m['weeks']) * 7
        ff = set(plan['force_fail'].get(mi, []))
        if plan['break_at_floor'] and level_of(xp, A, r) >= plan['break_at_floor'] and L['broken'] is None:
            L['broken'] = mi + 1; ff |= {'F', 'V'}
        mult_m = 1.0 + s if s >= 1 else 1.0
        mu = dict(F=0, V=0, I=0, D=0, O=0); mdone = set(); read_days = 0; dchecks = 0; bd = 0
        wstreak = 0; pot_m = 0.0
        def try_unblock(i):
            nonlocal blocked
            if blocked and gate_ok(blocked, mdone):
                cleared.add(blocked); L['cleared_day'][blocked] = i; L['blocks'][-1]['end'] = i; blocked = None
        for wi in m['weeks']:
            bonus_w = mult_m if s >= 1 else 1 + cfg['weekly_bonus'][min(wstreak, 4)]
            wu = dict(F=0, I=0, V=0, O=0, D=0); wdone = set()
            for dd in range(7):
                i = wi * 7 + dd; day = plan['days'][i]
                f0 = level_of(xp, A, r); xp0 = xp
                ev = []
                wk_ = dd < 5
                if cfg.get('pet_strict') and cfg.get('equip_anytime') and blocked and 'stats' in gates[blocked]:
                    a_, b_ = gates[blocked]['stats']; rq = gates[blocked]['req']
                    eq = a_ if (rq - stat[a_]) >= (rq - stat[b_]) else b_
                def weekly(cat, units):
                    if wu[cat] < units:
                        wu[cat] += 1
                        if wu[cat] == units: wdone.add(cat); ev.append((cat, 'S', 0))
                        ev.append((cat, 'W', W / units))
                if day['gym']:
                    if wk_: ev.append(('F', 'D', d))
                    weekly('F', 3)
                    if mu['F'] < cfg['gym_m'] and 'F' not in ff:
                        mu['F'] += 1; ev.append(('F', 'M', Mp / cfg['gym_m']))
                        if mu['F'] == cfg['gym_m']: mdone.add('F')
                if day['read']:
                    if wk_: ev.append(('I', 'D', d))
                    weekly('I', 3); read_days += 1
                    if read_days % 2 == 0 and mu['I'] < cfg['book_tramos'] and 'I' not in ff:
                        mu['I'] += 1; ev.append(('I', 'M', Mp / cfg['book_tramos']))
                        if mu['I'] == cfg['book_tramos']: mdone.add('I')
                if day['aero']:
                    if wk_: ev.append(('V', 'D', d))
                    weekly('V', 3)
                    if mu['V'] < cfg['aero_m'] and 'V' not in ff:
                        mu['V'] += 1; ev.append(('V', 'M', Mp / cfg['aero_m']))
                        if mu['V'] == cfg['aero_m']: mdone.add('V')
                if day['clean']:
                    if wk_: ev.append(('O', 'D', d))
                    weekly('O', NAMB)
                if day['dwork'] and wu['D'] < 3: wu['D'] += 1; ev.append(('D', 'W', W / 3))
                if day['imp'] and mu['O'] < cfg['imp_units'] and 'O' not in ff:
                    mu['O'] += 1; ev.append(('O', 'M', Mp / cfg['imp_units']))
                    if mu['O'] == cfg['imp_units']: mdone.add('O')
                if dd in (2, 6):
                    pw = plan['wk'][wi]
                    if pw['tasks'] and 'D' not in ff:
                        dchecks += 1; ev.append(('D', 'M', Mp / (cfg['dchk'] * len(m['weeks']))))
                if dd == 6:
                    pw = plan['wk'][wi]
                    if pw['tasks'] and 'D' not in ff and wi == m['weeks'][-1]: mdone.add('D')
                    if wu['D'] >= 3 and pw['anti']:
                        wdone.add('D'); ev.insert(0, ('D', 'S', 0))
                    else:
                        wdone.discard('D')
                        if wu['D'] < 3 and not pw['anti'] and cfg['disc_pen']:
                            L['disc_pen_n'] = L.get('disc_pen_n', 0) + 1
                            if cfg['disc_pen'] == 'stat': stat['D'] = max(0, stat['D'] - 1)
                            elif cfg['disc_pen'] == 'xp': xp = cum_xp(level_of(xp, A, r), A, r)
                    # mascota equipada: la del gate si estoy bloqueado por estadisticas; si no, la secuencia
                    if blocked and 'stats' in gates[blocked] and (cfg.get('pet_strict') or not stat_ok(blocked)):
                        a_, b_ = gates[blocked]['stats']; rq = gates[blocked]['req']
                        eq = a_ if (rq - stat[a_]) >= (rq - stat[b_]) else b_
                    else:
                        eq = next((c for c in cfg['pet_order'] if PX[c] < cum[-1]), cfg['pet_order'][0])
                    L.setdefault('eq_log',{})[wi] = eq
                    if plan['wk'][wi]['feed']:
                        PX[eq] = min(cum[-1], PX[eq] + cfg['pet_week']); feedstreak = 0
                    else:
                        feedstreak += 1
                        if feedstreak >= 2 and plv(eq) > 0: PX[eq] = cum[plv(eq) - 1]
                    if pet_max_week is None and all(PX[c] >= cum[-1] for c in CATS): pet_max_week = wi + 1
                try_unblock(i)
                for cat, kind, base in ev:
                    if kind == 'S':
                        cs = cap_stat()
                        gain = cfg['stat_pw']
                        if blocked and cfg['freeze_other_stats'] and 'stats' in gates[blocked] and cat not in gates[blocked]['stats']:
                            continue
                        new = min(stat[cat] + gain, cs); L['stat_wasted'] += stat[cat] + gain - new
                        stat[cat] = new
                        try_unblock(i); continue
                    try_unblock(i)
                    mult = bonus_w if kind in ('D', 'W') else mult_m
                    if kind == 'D' and not cfg['daily_mult']: mult = 1.0
                    if kind == 'M' and s == 0: mult = 1.0
                    amt = base * mult
                    L['potential'] += amt; pot_m += amt
                    if blocked:
                        L['lost_block'] += amt; continue
                    rem = amt
                    while rem > 0:
                        pend = [g for g in sorted(gates) if g not in cleared]
                        if not pend: xp += rem; rem = 0; break
                        G = pend[0]; cap = cum_xp(G, A, r)
                        if xp + rem < cap - 1e-9: xp += rem; rem = 0
                        else:
                            used = max(cap - xp, 0); xp = cap; rem -= used; L['arrive'].setdefault(G, i)
                            if gate_ok(G, mdone): cleared.add(G); L['cleared_day'][G] = i
                            else:
                                blocked = G; L['lost_clamp'] += rem; rem = 0
                                g = gates[G]
                                L['blocks'].append(dict(gate=G, start=i, end=None, obj=('streak' in g and s < g['streak']), stats=not stat_ok(G)))
                if blocked:
                    if not stat_ok(blocked): bd += 1
                    b = L['blocks'][-1]
                    if not stat_ok(blocked): L['days_blocked_stat'] += 1
                    else: L['days_blocked_obj'] += 1
                f1 = level_of(xp, A, r); gain = xp - xp0
                L['ratios'].append(gain / (A * r ** f0))
                if gain > 0 and not blocked: L['ratio_max'] = max(L['ratio_max'], gain / (A * r ** f0))
                if f1 - f0 > 1: L['multi_days'].append((i, f0, f1))
                L['jump_max'] = max(L['jump_max'], f1 - f0)
                if L['tower'] is None and 100 in cleared: L['tower'] = i
                L['timeline'].append(f1); L.setdefault('xp_tl',[]).append(xp); L.setdefault('eq_day',[]).append(eq)
            fails = [c for c in CATS if c not in wdone]
            wstreak = 0 if len(fails) >= 2 else wstreak + 1
        failm = [c for c in CATS if c not in mdone]
        for c in failm: stat[c] = max(0, stat[c] - cfg['stat_pen'])
        if (blocked and not stat_ok(blocked)) or bd > cfg['freeze_days']: pass   # bloqueado por estadisticas: ni suma ni se reinicia
        else: s = 0 if len(failm) >= 2 else s + 1
        L['stat_hist'].append(dict(stat))
        L['per_month'].append(dict(m=mi + 1, weeks=len(m['weeks']), mult=mult_m, pot=pot_m, floor=level_of(xp, A, r), failed=failm))
        if stop_at_tower and L['tower'] is not None: break
    L['xp'] = xp; L['floor'] = level_of(xp, A, r); L['stat'] = dict(stat); L['pet'] = {c: plv(c) for c in CATS}; L['pet_max_week'] = pet_max_week
    return L

def calibrate(cfg, target=364):
    lo, hi = 50.0, 1e7
    for _ in range(60):
        mid = (lo + hi) / 2; c = dict(cfg, A=mid)
        t = simulate(c, make_plan(c))['tower']
        if t is None or t > target: hi = mid
        else: lo = mid
    return lo
