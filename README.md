# Storage

[English](README.en.md)

自托管物品管理工具，电脑和手机通过浏览器使用。支持图片、多级分类与位置、标签、包装标记、批量修改、复制新增和隐私区。

支持 Linux 服务器、Docker Desktop、NAS 等 Docker 环境，提供 `amd64`、`arm64` 镜像。部署需要 Docker Compose 2.23.1+ 和阿里云 OSS 私有存储桶。

## 部署

```sh
git clone https://github.com/cimorn/Storage.git
cd Storage
cp .env.example .env
```

PowerShell 使用 `Copy-Item .env.example .env`。编辑 `.env`，填写访问密码、隐私区密码和自己的 OSS 配置。生成其余四项密钥并填入：

```sh
docker run --rm node:24-bookworm-slim node -e "const c=require('node:crypto');for(const k of ['STORAGE_SESSION_SECRET','STORAGE_ENCRYPTION_KEY','STORAGE_MONGO_ROOT_PASSWORD','STORAGE_MONGO_PASSWORD'])console.log(k+'='+c.randomBytes(32).toString('hex'))"
docker compose up -d
```

打开 [http://localhost:8094](http://localhost:8094)。

手机访问时，将 `STORAGE_BIND_ADDRESS` 改为 `0.0.0.0`，`STORAGE_PUBLIC_ORIGIN` 改为实际局域网地址。域名访问时使用 HTTPS 反向代理，填写对应域名并设置 `STORAGE_ALLOW_HTTP=false`。

## 使用

输入访问密码后管理物品、上传图片，按分类、位置、标签和包装状态筛选。分类和位置支持拖动排序。目录节点及详情显示物品条目数，上级包含下级；多位置物品在共同上级不重复计数，锁定时只统计普通物品。

每件物品可添加多条颜色、尺码、数量和包装明细，数量留空按 1，物品总数为各规格数量之和。点击每条规格右侧的“＋”上传图片，图片自动对应这一条规格；再次选择可替换图片。每张图片只属于一条规格；颜色或尺码不适用时可留空。在编辑页修改明细，在信息页查看图片和数量表格。任意一条明细有包装，卡片就显示包装图标；批量修改包装会修改所选物品的全部明细。

卡片第一行显示名称和右侧灰色小字品牌，第二行按尺码汇总规格，例如 `蓝/红·M | 白·L`，填写款式后才显示第三行。每张图片对应规格的数量大于 1 时显示在左下角，切图时随之变化；右下角显示图片页码，两个角标统一为小字、75% 透明底色。点击规格右上角“编辑”可添加明细或进入“排序”；排序时拖动颜色、尺码文字行，第一条有图片的规格作为封面；排序行也支持键盘上下键，点击“完成”返回填写。标题栏在同一行显示名称、分类、位置和总件数，长路径可横向滑动查看，信息页直接显示明细表格。名称与品牌并排，款式单独填写；编辑页与信息页的图片均可点击立即放大已有预览，清晰图在后台加载，显示尺寸保持一致；标签在信息页右侧的独立页签中管理。每件物品最多保存 20 张图片，在对应规格中选择和预览，点击保存后才上传。移除规格或图片前需要确认，取消会保留当前内容；确认移除规格时同时移除其图片。物品卡片轻点进入编辑，左右拖动切换照片，键盘左右键也可切换。

上传图片自动转为 WebP，长边最多 1920 像素，不放大原图，并移除照片元数据。图片继续随分类移动，备份包含每件物品的全部图片。

物品默认按最近更新排列。

新增物品沿用当前区域最近新增物品的分类、位置、品牌、款式及规格设置；名称、条码、标签、图片和隐私勾选重新填写。

滚动时背景轻微视差移动，物品卡片首次滚入视野时滑入显示。首屏内容直接显示，系统开启“减少动态效果”时关闭这两种动效。

首次打开会下载界面程序。若文件加载失败，登录后会自动重新加载最新页面一次；仍失败可点击“重新加载”重试。

点击左上角“物品管理”输入隐私区密码；解锁后只显示隐私物品，也可设置隐私物品、分类和位置；物品的隐私开关位于“标签”右侧。再次点击收起，恢复普通物品；刷新后重新隐藏。

## 开发

需要 Node.js 24+、pnpm 11。

```text
web/        网页前端、服务端和网页测试
desktop/    独立 Electron 客户端、图标和打包脚本
scripts/    Docker 运行与备份恢复检查
```

```sh
pnpm install --frozen-lockfile
pnpm dev
```

网页开发地址为 `http://127.0.0.1:5173`，使用内存测试数据。访问密码为 `preview-storage`，隐私区密码为 `preview-private`。

```sh
pnpm test
pnpm build
pnpm desktop:dev
pnpm desktop:build
```

网页构建输出到 `web/dist/renderer/`，Windows 客户端输出到 `dist/Desktop-*/`。客户端连接地址在 `desktop/src/policy.cjs` 配置，详见 [客户端开发说明](desktop/README.md)。

## 发布与更新

网页和客户端使用统一版本号，格式为“年份后两位.大版本.小版本”，例如 `26.1.1`，表示 2026 年的第 1 个大版本、第 1 个小版本。发布前同步更新根目录、`web/`、`desktop/` 下三个 `package.json` 的 `version`，再推送到 `main`。每次发布递增版本号。

GitHub Actions 测试并检查 Docker 部署后，自动发布 `ghcr.io/cimorn/storage:latest` 和对应版本镜像，例如 `ghcr.io/cimorn/storage:26.1.6`。`latest` 跟随 `main` 更新。客户端有独立构建任务，EXE 可从对应任务的 Artifacts 下载，文件名包含版本号。

在部署目录更新网页：

```sh
docker compose pull storage
docker compose up -d --no-deps storage
```

客户端只连接网页，网页更新后重新打开即可。客户端自身代码有变化时重新构建并替换 EXE。

## 备份与恢复

备份 **MongoDB、OSS 的 `Storage/` 目录、原 `.env`**。更新时保留原数据卷和 `STORAGE_ENCRYPTION_KEY`。

[备份与恢复命令](docs/backup.md) · [固定镜像与回退](docs/docker-images.md)

## 许可证

[MIT](LICENSE)
