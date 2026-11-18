"""用官方鲸鱼标志生成像素画图标（不依赖视觉：原图忠实转换）

流程: 下载 deepseek-ai 官方头像(GitHub) -> 背景透明化 -> 调色板量化
      -> 降采样到 36x36 像素格 -> 最近邻放大 1024
产出: assets/mascot.png / icon.png / adaptive-icon.png
"""
import io
import os
import urllib.request

from PIL import Image

PROXY = "http://127.0.0.1:7890"
URL = "https://avatars.githubusercontent.com/deepseek-ai?s=460"
GRID = 36          # 像素网格
OUT = 1024


def fetch() -> bytes:
    for proxies in ({"https": PROXY, "http": PROXY}, None):
        try:
            if proxies:
                handler = urllib.request.ProxyHandler(proxies)
                opener = urllib.request.build_opener(handler)
            else:
                opener = urllib.request.build_opener()
            req = urllib.request.Request(URL, headers={"User-Agent": "Mozilla/5.0"})
            with opener.open(req, timeout=30) as r:
                data = r.read()
            if data[:8] == b"\x89PNG\r\n\x1a\n" or data[:3] == b"\xff\xd8\xff":
                return data
        except Exception as e:
            print("尝试失败:", e)
    raise RuntimeError("下载失败（直连与代理均不通）")


def to_pixel_art(data: bytes) -> Image.Image:
    im = Image.open(io.BytesIO(data)).convert("RGBA")
    # 背景透明化：四角主色视为背景，颜色距离内全部置透明
    corners = [im.getpixel(p) for p in [(2, 2), (im.width - 3, 2), (2, im.height - 3), (im.height - 3 and im.width - 3, im.height - 3)]]
    bg = max(set(corners), key=corners.count)

    def close(a, b, tol=18):
        return all(abs(x - y) <= tol for x, y in zip(a[:3], b[:3]))

    px = im.load()
    for y in range(im.height):
        for x in range(im.width):
            if close(px[x, y], bg):
                px[x, y] = (0, 0, 0, 0)
    # 主体裁剪
    bbox = im.getbbox()
    if bbox:
        im = im.crop(bbox)
    # 调色板量化（保留 alpha）
    im = im.quantize(colors=10, method=Image.FASTOCTREE, dither=Image.Dither.NONE).convert("RGBA")
    # 等比压进 GRID 网格
    im.thumbnail((GRID, GRID), Image.LANCZOS)
    return im


def upscale(small: Image.Image, target: int, content: int) -> Image.Image:
    f = max(1, content // max(small.width, small.height))
    big = small.resize((small.width * f, small.height * f), Image.NEAREST)
    canvas = Image.new("RGBA", (target, target), (0, 0, 0, 0))
    canvas.alpha_composite(big, ((target - big.width) // 2, (target - big.height) // 2))
    return canvas


if __name__ == "__main__":
    os.makedirs("assets", exist_ok=True)
    small = to_pixel_art(fetch())
    print("网格尺寸:", small.size, "非透明像素:", sum(1 for p in small.getdata() if p[3] > 40))
    colors = sorted({p[:3] for p in small.getdata() if p[3] > 40})
    print("用色数:", len(colors), colors[:8])

    BLUE = (77, 107, 254, 255)
    upscale(small, OUT, 880).save(os.path.join("assets", "mascot.png"))
    icon = Image.new("RGBA", (OUT, OUT), BLUE)
    icon.alpha_composite(upscale(small, OUT, 780))
    icon.save(os.path.join("assets", "icon.png"))
    upscale(small, OUT, 660).save(os.path.join("assets", "adaptive-icon.png"))
    print("pixel logo saved")
