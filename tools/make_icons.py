# 產生 PWA 圖示：黑底場記板（上方黑白斜紋＋紅色錄影點＋三條分鏡格）
import os
from PIL import Image, ImageDraw

out = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'icons')


def draw(size, pad):
    s = 4 * size
    im = Image.new('RGB', (s, s), '#16171A')
    d = ImageDraw.Draw(im)
    x0, x1 = pad * s, (1 - pad) * s
    w = x1 - x0
    # 場記板斜紋條
    top, bh = x0 + w * .08, w * .2
    stripe = Image.new('RGB', (int(w), int(bh)), '#16171A')
    sd = ImageDraw.Draw(stripe)
    step = int(w / 6)
    for k in range(-2, 9):
        bx = k * step
        sd.polygon([(bx, bh), (bx + step / 2, bh), (bx + step / 2 + bh, 0), (bx + bh, 0)], fill='#FFFFFF')
    mask = Image.new('L', stripe.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, stripe.size[0] - 1, stripe.size[1] - 1], radius=int(bh * .25), fill=255)
    im.paste(stripe, (int(x0), int(top)), mask)
    # 板身：三條分鏡格
    by = top + bh + w * .06
    for i, c in enumerate(['#F2EFE7', '#9C86D8', '#F2EFE7']):
        y = by + i * w * .17
        d.rounded_rectangle([x0, y, x0 + w * (.78 if i == 1 else .62), y + w * .11], radius=int(w * .03), fill=c)
    # 紅色錄影點
    r = w * .12
    cx, cy = x1 - r, by + w * .45
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill='#D7392B')
    return im.resize((size, size), Image.LANCZOS)


draw(192, .1).save(os.path.join(out, 'icon-192.png'))
draw(512, .1).save(os.path.join(out, 'icon-512.png'))
draw(512, .2).save(os.path.join(out, 'icon-maskable-512.png'))
