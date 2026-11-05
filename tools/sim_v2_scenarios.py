import sim, statistics as st, datetime as dt
from sim import run
sim_pa = 369.1
GATES = {10:3,20:6,30:9,40:13,50:16,60:20,70:24,80:27,90:32,100:40}
import sim as S
# fix blocked counting
FOOD80 = ([1,.8,.5,0],[.5,.3,.12,.08]); FOOD60=([1,.8,.5,0],[.25,.3,.25,.2])
SC = {
 'Perfecto': dict(p=1.0),
 'Mes sin entrenar (sem 30-33)': dict(p=1.0, off=set(range(30,34))),
 '80 %': dict(p=.8, food=FOOD80, mk=.5),
 '60 %': dict(p=.6, food=FOOD60, mk=.4),
}
def fmt(d): return d.strftime('%d/%m/%Y') if d else 'después de 2028'
for name, sc in SC.items():
    N = 1 if sc['p']==1 else 200
    rs = [run(sc, s, sim_pa, GATES, weeks=200) for s in range(N)]
    def med(key):
        ds = sorted((r.get(key) or dt.date(2031,1,1)) for r in rs); return ds[len(ds)//2]
    e = [r['end27'] for r in rs]
    print(f"\n== {name}")
    print(' piso 100:', fmt(med('floor100')), '| stats 20/20:', fmt(med('lvl100')), '| mascota 100:', fmt(med('pet100')))
    print(' al 31/12/2027 -> piso', st.median(x['floor'] for x in e), 'nivel', st.median(x['level'] for x in e), 'mascota', st.median(x['pet'] for x in e))
    print(' días bloqueado en puerta:', st.median(r['blocked_days'] for r in rs))
