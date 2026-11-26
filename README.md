# 便利屋68 · 夜间委托

《蔚蓝档案》鬼方佳代子的射击小游戏。她站在夜里，你负责瞄准。

**在线试玩**：https://YOUR_NAME.github.io/kayoko-night-quest/

纯静态前端，无后端、无接口、无构建步骤，最高分只存在浏览器 `localStorage`。

## 玩法

按住鼠标 / 手指开火，准星（她的五边形光环）跟着指针走。

| 目标 | 处理 | 效果 |
| --- | --- | --- |
| 🟡 米色信封（委托） | 打掉 | +10，连击越高加得越多 |
| 🔴 红色噪音 | 必须打掉，漏到地面扣 15 耐心 | +8 |
| ⚪ 白猫 | **别打**，打到 −15 分、扣 10 耐心 | — |

- 耐心 100，归零结束；60 秒到了也结束
- 左上角表情跟着耐心变（平静 → 不耐烦 → 生气），台词同步
- 每 400 分换一套服装（默认 / 新年 / 礼服），立绘整张替换
- 结算给 S / A / B / C

## 目录

```
.
├── index.html          单页
├── css/shoot.css
├── js/shoot.js         全部逻辑（Canvas 2D + WebAudio）
└── assets/
    ├── wiki/           3 张全身立绘（透明 PNG，678×1920 等）
    └── opt/
        ├── face/       37 张表情头像（webp，420×420）
        └── art/        6 张背景（webp，预渲染成模糊层）
```

所有资源都是相对路径（`assets/...`），可以在任何子路径下部署。

## 部署到 GitHub Pages

1. 仓库 Settings → Pages
2. Source 选 **Deploy from a branch**
3. Branch 选 `main`，目录选 `/ (root)`
4. 等一分钟，访问 `https://<用户名>.github.io/<仓库名>/`

仓库必须是 **public**（免费账号的 Pages 只对公开仓库开放）。

## 改东西

- **调难度**：`js/shoot.js` 里 `spawnAt`（生成间隔）、`vy`（下落速度）、`KICK` 附近的数值
- **换表情**：`FACE` 对象里按 `calm / mid / low / happy` 分组，往里加文件名即可
- **换背景**：`BGS` 数组，放新图进 `assets/opt/art/` 后改文件名
- **换服装**：`STAND` 数组三个路径，换成别的 `assets/wiki/kayoko-*-00.png`
- **改台词**：`MOOD_TEXT`（HUD 气泡）和 `endGame()` 里的结算文案

## 版权

《蔚蓝档案》角色与官方美术素材版权归 NEXON Games / Yostar 所有；二创作品版权归各原作者。本项目为非官方同人作品，仅供学习交流。
