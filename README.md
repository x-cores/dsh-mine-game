# DSH Minesweeper Game

排雷（Minesweeper）× 两种形态：**单文件网页版** + **DeepSeek Harness Web 插件**（悬浮窗）。零依赖、完全离线。仿照 [dsh-chess-game](../Chess) 的插件框架与风格实现。

## 网页版（index.html）

浏览器打开 `index.html` 即玩。

- 左键翻开、右键标旗、双击数字快速展开（chord）
- 首翻保证安全：首翻格及其 8 邻域不放雷
- 0 格自动泛洪展开；雷数/计时 HUD

## DSH 插件 dsh-mine-float（packages/mine-float/）

在 DeepSeek Harness Web 界面里排雷：输入框工具栏 **💣 按钮** → 弹出**可拖动悬浮窗**。

**功能**：

- 三档难度：初级 9×9/10 雷 · 中级 16×16/40 雷 · 高级 16×30/99 雷
- 完整玩法：布雷（首翻安全）、翻开（泛洪展开）、标旗、双击快速展开、胜利/失败判定
- 剩余雷数计数、用时计时、失败时展示全部雷与错标旗
- 主题 token 适配明暗主题

**安装**：

```bash
# 从源码（本仓库）
dsh plugin add packages/mine-float

# 离线安装（其他机器）
mkdir -p ~/plugins/mine-float
tar -xzf dsh-mine-float-1.0.0.tgz -C ~/plugins/mine-float --strip-components=1
dsh plugin add ~/plugins/mine-float
```

安装后刷新 Web 页面即可看到 💣 按钮。

## 运行测试

```bash
node test-mine.js   # 引擎校验（从 client.js 提取引擎块，测试即发布代码）
```

覆盖：首翻安全（200 次随机）、布雷数量、泛洪完备性、标旗规则、踩雷/胜利判定、chord 行为、三档难度预设。
