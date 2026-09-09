# Zelender · 庭

一方会呼吸的日式锦鲤庭院。坐在木廊里看树影与池水，或俯身看锦鲤游过；把今天的安排，轻轻放在半透明的侧边栏里。

[进入庭院](https://thecyper.github.io/zelender/) · [下载 Chrome 新标签页扩展](https://thecyper.github.io/zelender/zelender-extension.zip) · [源代码](https://github.com/TheCYPER/zelender)

![从木廊看向锦鲤庭院](docs/garden-preview.png)

## 在庭院里

| 操作 | 效果 |
| --- | --- |
| 切换庭院 / 俯瞰视角 | 从房间望向日式庭院，或近距离俯视锦鲤池 |
| 右键点击池水 | 撒下鱼食，吸引锦鲤聚拢 |
| 左键点击池水 | 扰动水面，让附近的锦鲤受惊游开 |
| 点击喂鱼按钮 | 使用触屏，或用 Tab 聚焦按钮后按 Enter / 空格喂鱼 |
| 切换晴、雨、雪、雾 | 改变庭院的光线、氛围与天气粒子 |
| 选择日历日期 | 查看当天待办，添加、完成或删除事项 |
| 开启专注模式 | 收起日历与待办，让庭院留出更多空间 |

天气是可以自由切换的场景效果，不读取定位或实时天气。时钟与“今天”使用设备的本地时间。

## 设为 Chrome 默认新标签页

网站可以直接访问。要让每个新标签页都打开庭院，需要在桌面版 Chrome 中加载配套扩展；打开网站或下载 ZIP 本身不会完成安装。

1. [下载扩展 ZIP](https://thecyper.github.io/zelender/zelender-extension.zip)，解压到一个准备长期保留的文件夹。
2. 在 Chrome 地址栏输入 `chrome://extensions`。
3. 打开页面右上角的「开发者模式」。
4. 点击「加载已解压的扩展程序」（部分版本显示「加载已解压缩的文件」），选择直接包含 `manifest.json`、`index.html` 和 `assets` 的文件夹。不要选择 ZIP 文件或尚未构建的 `extension` 源目录。
5. 新建一个标签页；如果 Chrome 提示确认新标签页变更，选择保留 Zelender。

最后的加载与确认需要在你自己的 Chrome 中完成。这个项目不执行静默安装，也未发布到 Chrome 应用商店。扩展使用 Manifest V3 的 `chrome_url_overrides.newtab` 加载完整本地应用，不跳转到在线网站；安装后，庭院与待办无需联网即可运行。无痕窗口的新标签页不支持这种替换。安装流程与限制可参阅 [Chrome 官方加载说明](https://developer.chrome.com/docs/extensions/get-started/tutorial/hello-world#load-unpacked) 和 [替换 Chrome 页面文档](https://developer.chrome.com/docs/extensions/develop/ui/override-chrome-pages)。

更新时，将新版本解压到原来的扩展文件夹，再在 `chrome://extensions` 中点击 Zelender 的重新加载按钮。保留原来的路径与扩展身份有助于沿用本地记录。关闭该扩展即可恢复原来的新标签页；卸载前请自行保留需要的待办内容。

## 数据留在本地

待办事项和个人设置存储于当前浏览器的 `localStorage`，没有账号、服务器或云同步。网站和扩展属于不同来源，因此**各自保存一份数据，不会自动互通**；不同浏览器、浏览器资料和设备之间也不会同步。清除相应站点 / 扩展数据可能丢失记录。

扩展不请求浏览记录、标签页、定位或其他额外权限。庭院、锦鲤、植物、池水与天气由 Three.js 和本地代码生成，不加载远程脚本、图片、模型或字体。网页版本由 GitHub Pages 提供静态文件。

## 本地开发

需要 Node.js 22.12 或更新的兼容版本，以及 `zip` 命令（macOS 和 Ubuntu 通常已提供）。

```sh
npm ci
npm run dev
```

开发服务器地址以终端输出为准。验证与构建：

```sh
npm run check
npm test
npm run build
npm run preview
```

构建产物：

- `dist/`：可部署的静态网站，包含下载文件 `zelender-extension.zip`。
- `extension-dist/`：可直接在 Chrome 中「加载已解压的扩展程序」的完整目录。

页面需要支持 WebGL 的浏览器与可用的图形加速。应用会限制渲染像素比、在标签页隐藏时暂停动画，并尊重系统的减少动态效果设置。

## 部署

仓库的 GitHub Pages 发布来源设为 **GitHub Actions**。推送到 `main` 后，[部署工作流](.github/workflows/deploy.yml) 依次安装依赖、检查类型、运行测试、构建网站与扩展，然后发布 `dist/`。扩展 ZIP 与网页一同上线，Actions 也保留解压后的扩展构建产物。

Vite 使用相对资源路径 `./`，同一份构建同时适配 GitHub Pages 的 `/zelender/` 子路径与 `chrome-extension://` 来源。

## 许可

[MIT](LICENSE) © 2026 TheCYPER。Three.js 遵循其自身 MIT 许可；发布的网页和扩展在 `licenses/` 中附带相关许可文本。
