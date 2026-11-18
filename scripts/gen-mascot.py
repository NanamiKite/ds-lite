"""生成像素画吉祥物：鲸鱼娘（蓝鲸帽兜 + 露脸 + 喷水 + 小白裙）

在 32x32 低清画布上用整数坐标粗图元绘制，最近邻放大保持像素风。
产出:
  assets/mascot.png      透明底像素鲸鱼娘（1024）
  assets/icon.png        蓝底 + 鲸鱼娘（1024，全出血图标）
  assets/adaptive-icon.png 透明底前景（内容缩进安全区）
"""
from PIL import Image, ImageDraw

SS = 32  # 放大倍数：32px 底稿 -> 1024

BLUE = (77, 107, 254, 255)      # 帽兜主色 #4D6BFE
DARK = (42, 60, 170, 255)       # 帽兜描边/尾/鞋 #2A3CAA
SKIN = (255, 224, 201, 255)     # 脸/手/腿
EYE = (34, 38, 58, 255)         # 眼/嘴
PINK = (255, 175, 192, 255)     # 腮红
CYAN = (127, 224, 255, 255)     # 喷水
WHITE = (255, 255, 255, 255)    # 裙


def draw_base() -> Image.Image:
    im = Image.new("RGBA", (32, 32), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)

    # 1) 帽顶喷水（鲸鱼气孔）：中柱 + 两侧水珠
    d.rectangle([15, 1, 16, 4], fill=CYAN)
    for xy in [(13, 2), (18, 2), (12, 3), (19, 3)]:
        d.point(xy, CYAN)

    # 2) 鲸鱼尾（帽兜右侧，双鳍）
    d.polygon([(23, 10), (29, 7), (29, 12)], fill=DARK)
    d.polygon([(23, 14), (29, 12), (29, 17)], fill=DARK)

    # 3) 鲸鱼帽兜（头）：描边椭圆 + 主色
    d.ellipse([5, 7, 26, 23], fill=DARK)
    d.ellipse([6, 8, 25, 22], fill=BLUE)
    # 帽兜上的鲸鱼眼（装饰，左侧）
    d.rectangle([8, 10, 9, 11], fill=WHITE)
    # 帽兜白色肚边（下缘一排白，呼应鲸鱼白肚）
    d.rectangle([8, 21, 23, 21], fill=WHITE)

    # 4) 脸（帽兜开口）
    d.ellipse([10, 12, 21, 21], fill=SKIN)
    # 刘海压边（帽兜前沿盖住额头）
    d.rectangle([10, 12, 21, 13], fill=BLUE)

    # 5) 五官
    d.rectangle([12, 16, 13, 17], fill=EYE)   # 左眼
    d.rectangle([18, 16, 19, 17], fill=EYE)   # 右眼
    d.point((11, 19), PINK)                    # 腮红
    d.point((20, 19), PINK)
    d.rectangle([15, 19, 16, 19], fill=EYE)    # 小嘴

    # 6) 小白裙（梯形 + 蓝摆边）
    d.polygon([(11, 22), (20, 22), (22, 27), (9, 27)], fill=WHITE)
    d.rectangle([9, 27, 22, 27], fill=BLUE)

    # 7) 手（帽兜两侧探出）
    d.rectangle([7, 23, 8, 24], fill=SKIN)
    d.rectangle([23, 23, 24, 24], fill=SKIN)

    # 8) 腿 + 鞋
    d.rectangle([13, 28, 14, 29], fill=SKIN)
    d.rectangle([17, 28, 18, 29], fill=SKIN)
    d.rectangle([12, 30, 14, 31], fill=DARK)
    d.rectangle([17, 30, 19, 31], fill=DARK)

    return im


def scale_to(base: Image.Image, target: int, content: int) -> Image.Image:
    """最近邻放大 content 像素宽，居中贴到 target 画布"""
    f = max(1, content // 32)
    big = base.resize((32 * f, 32 * f), Image.NEAREST)
    canvas = Image.new("RGBA", (target, target), (0, 0, 0, 0))
    off = (target - 32 * f) // 2
    canvas.paste(big, (off, off))
    return canvas


if __name__ == "__main__":
    import os
    os.makedirs("assets", exist_ok=True)
    base = draw_base()

    # App 内大图 / README 头图：透明底
    scale_to(base, 1024, 896).save(os.path.join("assets", "mascot.png"))
    # 全出血图标：蓝底 + 吉祥物
    icon = Image.new("RGBA", (1024, 1024), BLUE)
    fg = scale_to(base, 1024, 800)
    icon.alpha_composite(fg)
    icon.save(os.path.join("assets", "icon.png"))
    # 自适应前景：内容压进安全区（66% ≈ 676px）
    scale_to(base, 1024, 672).save(os.path.join("assets", "adaptive-icon.png"))
    print("mascot icons saved")
