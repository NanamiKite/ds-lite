"""生成应用图标：DeepSeek 蓝底 + 白色几何鲸鱼剪影（4x 超采样抗锯齿）

产出:
  assets/icon.png          全出血方形图标（蓝底 + 鲸鱼）
  assets/adaptive-icon.png 安卓自适应图标前景（透明底，鲸鱼在安全区内）
  assets/whale.png         透明底白色鲸鱼（App 内徽章用 Image 渲染）
"""
from PIL import Image, ImageDraw

BLUE = (77, 107, 254, 255)   # #4D6BFE
WHITE = (255, 255, 255, 255)
SS = 4                        # 超采样倍数
SIZE = 1024
CX = CY = 512

# 基准坐标（1024 画布，鲸鱼朝右）
BODY = (140, 352, 630, 642)                              # 椭圆身体，头部在左
STOCK = [(590, 442), (730, 517), (730, 567), (590, 547)]  # 尾柄（梯形）
FLUKE_UP = [(700, 500), (880, 367), (888, 512)]           # 上尾鳍
FLUKE_DOWN = [(700, 530), (880, 657), (888, 482)]         # 下尾鳍
FIN = [(340, 602), (415, 675), (295, 660)]                # 胸鳍
EYE = (253, 445)                                          # 眼睛中心
EYE_R = 21


def draw_whale(size, scale=1.0, bg=None):
    """返回 RGBA 图。基准坐标 → 以画布中心缩放 → 放大 SS 倍绘制 → 缩回。"""
    S = size * SS

    def P(pts):
        # 基准(1024系) → 中心缩放 → SS 空间
        return [
            ((CX + (x - CX) * scale) * SS, (CY + (y - CY) * scale) * SS)
            for x, y in pts
        ]

    img = Image.new("RGBA", (S, S), (0, 0, 0, 0) if bg is None else bg)
    d = ImageDraw.Draw(img)

    # 尾柄与尾鳍先画，身体覆盖接缝
    d.polygon(P(STOCK), fill=WHITE)
    d.polygon(P(FLUKE_UP), fill=WHITE)
    d.polygon(P(FLUKE_DOWN), fill=WHITE)
    (x0, y0), (x1, y1) = P([(BODY[0], BODY[1]), (BODY[2], BODY[3])])
    d.ellipse([x0, y0, x1, y1], fill=WHITE)
    d.polygon(P(FIN), fill=WHITE)

    # 眼睛：蓝底图直接画背景色圆；透明图用 alpha 挖孔
    (ex, ey), = P([EYE])
    r = EYE_R * SS * scale
    if bg is None:
        mask = Image.new("L", (S, S), 0)
        ImageDraw.Draw(mask).ellipse([ex - r, ey - r, ex + r, ey + r], fill=255)
        alpha = Image.composite(Image.new("L", (S, S), 0), img.getchannel("A"), mask)
        img.putalpha(alpha)
    else:
        d.ellipse([ex - r, ey - r, ex + r, ey + r], fill=BLUE)

    return img.resize((size, size), Image.LANCZOS)


if __name__ == "__main__":
    import os
    os.makedirs("assets", exist_ok=True)
    # 全出血图标
    draw_whale(SIZE, scale=1.0, bg=BLUE).save(os.path.join("assets", "icon.png"))
    # 自适应前景：鲸鱼缩到安全区（内容横向约 140-888，0.85 后约 196-829 ⊂ 174-849）
    draw_whale(SIZE, scale=0.85).save(os.path.join("assets", "adaptive-icon.png"))
    # App 内徽章用透明鲸鱼
    draw_whale(SIZE, scale=0.92).save(os.path.join("assets", "whale.png"))
    print("whale icons saved")
