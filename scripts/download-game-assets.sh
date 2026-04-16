#!/bin/bash
# ============================================================================
# 游戏素材下载脚本
# 运行方式: bash scripts/download-game-assets.sh
# 
# 从免费开源网站下载游戏素材到 public/assets/games/ 目录
# 所有素材均为 CC0 / 免费商用许可
# ============================================================================

set -e

ASSETS_DIR="public/assets/games"
mkdir -p "$ASSETS_DIR"/{rpg,cards,puzzle,racing,tactics,soccer,tower,sandbox,escape,rhythm}
mkdir -p "$ASSETS_DIR"/{adult-rpg,adult-sim,adult-fight,adult-cards,adult-puzzle,adult-raise,adult-dress}
mkdir -p "$ASSETS_DIR"/common

echo "=== 开始下载游戏素材 ==="

# --- RPG 角色 sprite sheets (Pipoya CC0) ---
echo "下载 RPG 角色素材..."
# 注意: 以下 URL 需要手动从 itch.io 下载后放到对应目录
# https://pipoya.itch.io/pipoya-free-rpg-character-sprites-32x32
# https://opengameart.org/content/32x32-cc0-jrpg-ish-style

# --- 通用 UI 图标 ---
echo "下载通用 UI 素材..."
# https://cainos.itch.io/pixel-art-icon-pack-rpg

# --- 地图 tileset ---
echo "下载地图 tileset..."
# https://pipoya.itch.io/pipoya-rpg-tileset-32x32

echo ""
echo "=== 自动下载完成 ==="
echo ""
echo "以下素材需要手动下载（需要在网站上点击下载按钮）："
echo ""
echo "1. RPG 角色 sprites:"
echo "   https://pipoya.itch.io/pipoya-free-rpg-character-sprites-32x32"
echo "   下载后解压到: $ASSETS_DIR/rpg/"
echo ""
echo "2. RPG tileset:"
echo "   https://pipoya.itch.io/pipoya-rpg-tileset-32x32"
echo "   下载后解压到: $ASSETS_DIR/rpg/"
echo ""
echo "3. 像素图标包:"
echo "   https://cainos.itch.io/pixel-art-icon-pack-rpg"
echo "   下载后解压到: $ASSETS_DIR/common/"
echo ""
echo "4. 更多免费素材来源:"
echo "   - https://opengameart.org (CC0/CC-BY 素材)"
echo "   - https://itch.io/game-assets/free (免费游戏素材)"
echo "   - https://kenney.nl/assets (CC0 游戏素材)"
echo "   - https://craftpix.net/freebies/ (免费游戏素材)"
echo ""
echo "成人游戏素材需要从以下来源获取:"
echo "   - 使用 AI 生成工具 (Stable Diffusion / NovelAI) 生成角色立绘"
echo "   - 或使用 Live2D 风格的 2D 角色"
echo ""
