"""Station sign textures (PIL): JR East-style platform name boards (駅名標) and the station-building sign."""
import os, sys
from PIL import Image, ImageDraw, ImageFont

OUT = sys.argv[1]
F = r"C:\Windows\Fonts"
def font(sz, bold=True): return ImageFont.truetype(os.path.join(F, "YuGothB.ttc" if bold else "YuGothM.ttc"), sz)

LINES = {
    "rapid": dict(num=("JC", "03"), col=(241, 90, 34), west=("四ツ谷", "Yotsuya", "JC04"), east=("神田", "Kanda", "JC02")),
    "local": dict(num=("JB", "18"), col=(255, 212, 0), west=("水道橋", "Suidōbashi", "JB17"), east=("秋葉原", "Akihabara", "JB19")),
}

def ctext(d, xy, s, f, fill):
    w = d.textlength(s, font=f); d.text((xy[0] - w / 2, xy[1]), s, font=f, fill=fill)

def board(key, west_left):
    L = LINES[key]; W, H = 1500, 500
    im = Image.new("RGB", (W, H), (250, 250, 248)); d = ImageDraw.Draw(im)
    # station number badge
    bx, by, bs = 60, 50, 150
    d.rounded_rectangle((bx, by, bx + bs, by + bs), 18, fill=(255, 255, 255), outline=(30, 30, 30), width=6)
    d.rounded_rectangle((bx + 12, by + 12, bx + bs - 12, by + bs - 12), 10, outline=L["col"], width=12)
    ctext(d, (bx + bs / 2, by + 24), L["num"][0], font(40), (20, 20, 20))
    ctext(d, (bx + bs / 2, by + 64), L["num"][1], font(58), (20, 20, 20))
    ctext(d, (W / 2 + 40, 25), "御茶ノ水", font(170), (15, 15, 15))
    ctext(d, (W / 2 + 40, 215), "おちゃのみず   Ochanomizu", font(50, False), (40, 40, 40))
    d.rectangle((0, 300, W, 360), fill=L["col"])
    left, right = (L["west"], L["east"]) if west_left else (L["east"], L["west"])
    d.polygon([(30, 330), (60, 305), (60, 355)], fill=(255, 255, 255))
    d.polygon([(W - 30, 330), (W - 60, 305), (W - 60, 355)], fill=(255, 255, 255))
    for (jp, en, num), x, anchor in ((left, 80, "l"), (right, W - 80, "r")):
        fj, fe = font(64), font(36, False)
        wj = d.textlength(jp, font=fj); we = d.textlength(en + "  " + num, font=fe)
        xj = x if anchor == "l" else x - wj; xe = x if anchor == "l" else x - we
        d.text((xj, 368), jp, font=fj, fill=(20, 20, 20)); d.text((xe, 446), en + "  " + num, font=fe, fill=(60, 60, 60))
    im.save(os.path.join(OUT, "ekimei_%s_%s.png" % (key, "wl" if west_left else "wr")))

def facade():
    W, H = 2400, 400
    im = Image.new("RGB", (W, H), (248, 248, 246)); d = ImageDraw.Draw(im)
    d.rounded_rectangle((70, 70, 330, 330), 30, fill=(0, 150, 64))
    ctext(d, (200, 115), "JR", font(150), (255, 255, 255))
    d.text((400, 40), "御茶ノ水駅", font=font(230), fill=(20, 20, 20))
    d.text((1650, 140), "Ochanomizu Sta.", font=font(80, False), fill=(60, 60, 60))
    im.save(os.path.join(OUT, "station_sign.png"))

for k in LINES:
    board(k, True); board(k, False)
facade()
print(sorted(os.listdir(OUT)))
