#!/usr/bin/env python3
"""Exporta escenarios del simulador v7 (regla estricta: solo la mascota equipada aporta) (entradas diarias + resultados esperados) a test/golden.json."""
import sys, json, datetime as dt
sys.path.insert(0, '/home/claude/out3')
import lr66_sim_v7 as S

C = dict(S.CFG, A=5150, pet_costs=(10, 13, 17, 20, 30))

def inputs_from_plan(cfg, plan, eq_day, ndays):
    weeks, months = S.build_calendar(cfg)
    out = [dict() for _ in range(ndays)]
    for m in months:
        read_days = 0
        for wi in m['weeks']:
            for dd in range(7):
                i = wi * 7 + dd
                if i >= ndays: break
                d = plan['days'][i]; o = out[i]
                if d['gym']: o['gym'] = True
                if d['read']:
                    o['read'] = True; read_days += 1
                    if read_days % 2 == 0: o['bookTramo'] = True
                if d['aero']: o['aero'] = True
                if d['clean']: o['clean'] = True
                if d['dwork']: o['dwork'] = True
                if d['imp']: o['improve'] = True
                pw = plan['wk'][wi]
                if dd in (2, 6) and pw['tasks']: o['dcheck'] = True
                if dd == 6:
                    o['anti'] = bool(pw['anti']); o['feed'] = bool(pw['feed'])
    prev = 'F'
    for i in range(ndays):
        if eq_day[i] != prev: out[i]['equip'] = eq_day[i]; prev = eq_day[i]
    return out

def scenario(name, **kw):
    seed = kw.get('seed', 0)
    plan = S.make_plan(C, **kw)
    lg = S.simulate(C, plan)
    nd = len(lg['timeline'])
    return dict(
        name=name, days=nd,
        inputs=inputs_from_plan(C, plan, lg['eq_day'], nd),
        floors=lg['timeline'], xp=[round(x, 6) for x in lg['xp_tl']],
        final=dict(stat=lg['stat'], pet=lg['pet'], tower=lg['tower'], arrive={str(k): v for k, v in lg['arrive'].items()},
                   cleared={str(k): v for k, v in lg['cleared_day'].items()}, multi=len(lg['multi_days']), discPenN=lg.get('disc_pen_n', 0)),
    )

sc = [scenario('perfecto')]
for w0 in (10, 25, 40):
    sc.append(scenario(f'salta_fuerza_6sem_{w0}', skip_weeks={'F': set(range(w0, w0 + 6))}))
    sc.append(scenario(f'salta_fuerza_6sem_{w0}_sin_alimentar', skip_weeks={'F': set(range(w0, w0 + 6))}, p_feed=0.0))
sc.append(scenario('salta_orden_8sem_20', skip_weeks={'O': set(range(20, 28))}))
sc.append(scenario('disciplina_prueba_y_anti_6sem', skip_weeks={'D': set(range(20, 26))}, anti_fail_weeks=set(range(20, 26))))
sc.append(scenario('disciplina_anti_3sem', anti_fail_weeks=set(range(20, 23))))
for pr, seeds in ((0.97, range(4)), (0.93, range(4)), (0.88, range(2))):
    for sd in seeds:
        p = dict(gym=pr, read=pr, aero=pr, clean=pr, wk_clean=pr, disc=pr, anti=pr, tasks=pr, improve=pr)
        sc.append(scenario(f'mc_p{pr}_seed{sd}', p=p, seed=sd, p_feed=pr))
json.dump(dict(config=dict(A=5150, petCosts=[10, 13, 17, 20, 30], startDate='2026-11-02'), scenarios=sc),
          open('/home/claude/lr66/test/golden.json', 'w'), separators=(',', ':'))
print(len(sc), 'escenarios;', [ (s['name'], s['days'], s['final']['tower']) for s in sc][:6])
