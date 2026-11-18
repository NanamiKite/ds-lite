"""生成应用图标：蓝底白 DS 徽标 + 水波弧线（与 App 内引导页徽章同款语言）"""
from PIL import Image, ImageDraw, ImageFont

BLUE = (77, 107, 254, 255)  # #4D6BFE
WHITE = (255, 255, 255, 255)
FONT = r"C:\Windows\Fonts\arialbd.ttf"


def draw_badge(size, font_size, bg=None, transparent=False):
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0) if transparent else bg)
    d = ImageDraw.Draw(img)
    f = ImageFont.truetype(FONT, font_size)
    text = "DS"
    l, t, r, b = d.textbbox((0, 0), text, font=f)
    w, h = r - l, b - t
    x, y = (size - w) / 2 - l, (size - h) / 2 - t - font_size * 0.06
    d.text((x, y), text, font=f, fill=WHITE)
    # 下方一道水波弧线
    pad = size * 0.18
    d.arc(
        [pad, size * 0.30, size - pad, size * 0.98],
        start=28, end=152, fill=WHITE, width=max(6, size // 44),
    )
    return img


if __name__ == "__main__":
    import os
    os.makedirs("assets", exist_ok=True)
    # 商店/列表用全出血方形图标：蓝底白 DS
    draw_badge(1024, 400, BLUE).save(os.path.join("assets", "icon.png"))
    # 自适应图标前景：透明底，内容落在中心安全区（背景色由系统叠 #4D6BFE）
    draw_badge(1024, 330, transparent=True).save(os.path.join("assets", "adaptive-icon.png"))
    print("icons saved")
