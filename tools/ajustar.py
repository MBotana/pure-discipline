#!/usr/bin/env python3
"""Recorta un PNG de PixelLab al tamaño de la app, sin reescalar (solo quita márgenes transparentes).
Uso: python3 tools/ajustar.py ENTRADA.png SALIDA.png ANCHO ALTO [pies]
Con 'pies' apoya el contenido a 2 px del borde inferior (como el héroe base), útil si PixelLab lo dejó a otra altura.
Centra el recorte sobre el contenido (horizontal) y mantiene los pies abajo; si el lienzo es más chico, lo agranda con transparencia."""
import sys
from PIL import Image
src, dst, w, h = sys.argv[1], sys.argv[2], int(sys.argv[3]), int(sys.argv[4])
im = Image.open(src).convert('RGBA'); bb = im.getbbox() or (0, 0, im.width, im.height)
cx = (bb[0] + bb[2]) // 2; x0 = max(0, min(im.width - w, cx - w // 2)) if im.width >= w else 0
y0 = max(0, im.height - h) if im.height >= h else 0
if len(sys.argv) > 5 and sys.argv[5] == 'pies': y0 = bb[3] - (h - 2); y0 = max(0, min(im.height - h, y0)) if im.height >= h else 0
out = Image.new('RGBA', (w, h), (0, 0, 0, 0)); out.alpha_composite(im.crop((x0, y0, x0 + w, y0 + h)) if im.width >= w else im, (0, 0))
if bb[2] - bb[0] > w or bb[3] - bb[1] > h: print('AVISO: el contenido no entra en', w, 'x', h, file=sys.stderr)
out.save(dst); print('ok', dst, out.size)
