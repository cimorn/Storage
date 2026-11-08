# Storage 网页开发

Storage 使用 React、Vite 和 Zustand 构建前端，Express 提供接口，生产环境使用 MongoDB 和阿里云 OSS。电脑、平板和手机通过浏览器访问同一套服务。

## 首次运行

安装 Node.js 24 或更高版本，使用项目指定的 pnpm 11.7.0。以下命令在 PowerShell 和常见终端中均可执行。

```sh
npm install --global pnpm@11.7.0
git clone https://github.com/cimorn/Storage.git
cd Storage
pnpm install --frozen-lockfile
pnpm dev
```

已有代码时，在仓库根目录执行后两条命令即可。

打开 `http://127.0.0.1:5173`。开发访问密码为 `preview-storage`，隐私区密码为 `preview-private`。

`pnpm dev` 同时启动 Vite 和本地接口服务。前端监听 5173，`/api` 请求由 Vite 转发到 4173。终端按 `Ctrl+C` 停止两个服务。

开发模式从空列表开始，物品和图片保存在内存中，停止或重启接口服务后清空，登录也需要重新验证。启动开发模式只需要安装依赖，MongoDB、OSS 和生产环境的 `.env` 均由部署环境配置。

浏览器使用上面写出的 `127.0.0.1` 地址，接口会校验请求来源。前端修改支持热更新，修改 `web/server/` 或服务端使用的共享代码后，停止并重新运行 `pnpm dev`。

## 目录

```text
Storage/
├─ .github/workflows/        GitHub Actions 检查与镜像发布
├─ docs/                     开发、备份和镜像使用说明
├─ scripts/                  Docker 检查与网站图标生成
├─ tests/main/               仓库文档与工作流检查
├─ web/
│  ├─ public/                网站图标
│  ├─ server/                接口、认证、数据存储和图片处理
│  ├─ shared/                前后端共用的规格与图片规则
│  ├─ src/renderer/
│  │  ├─ features/           页面与交互组件
│  │  ├─ lib/                数据整理与通用逻辑
│  │  ├─ store/              页面状态与物品编辑
│  │  └─ styles/             主题变量与界面样式
│  ├─ tests/                 前端与服务端测试
│  ├─ index.html             登录首屏
│  └─ vite.config.js         开发端口、接口转发和构建
├─ .env.example              部署配置模板
├─ compose.yaml              Docker Compose 部署
├─ Dockerfile                网页服务镜像构建
├─ package.json              常用开发命令与版本号
├─ pnpm-lock.yaml            固定依赖版本
└─ pnpm-workspace.yaml       网页工作区配置
```

## 修改入口

| 要修改的内容 | 主要文件或目录 |
| --- | --- |
| 登录首屏与加载提示 | `web/index.html`、`web/src/renderer/features/web/entry.js` |
| 登录后的页面、保存和隐私区切换 | `web/src/renderer/features/web/WebApp.jsx` |
| 顶部导航与搜索 | `web/src/renderer/features/layout/Toolbar.jsx` |
| 物品卡片、图片切换、筛选与排序 | `web/src/renderer/features/items/` |
| 新增、编辑、规格和信息页 | `ItemEditorModal.jsx`、`ItemVariantFields.jsx`、`ItemInformationPage.jsx`，均位于上述物品目录 |
| 分类、位置与拖动排序 | `web/src/renderer/features/catalog/` |
| 标签 | `web/src/renderer/features/tags/TagManager.jsx` |
| 颜色与通用布局 | `web/src/renderer/styles/theme.css`、`app.css` |
| 网页弹窗与手机布局 | `web/src/renderer/features/web/web.css` |
| 前端数据状态 | `web/src/renderer/store/project-store.js` |
| 接口路由与权限校验 | `web/server/app.js`、`auth.js` |
| 物品保存、隐私范围和图片操作 | `web/server/inventory-service.js` |
| MongoDB、OSS 与加密 | `web/server/repository.js`、`oss-store.js`、`crypto.js` |

修改规格或图片的数据结构时，同时检查 `web/shared/`、服务端校验和已有数据的读取方式。修改隐私相关功能时，检查普通区、解锁、收起和刷新后的显示及接口权限。

## 检查与预览

提交前在根目录运行已有检查。

```sh
pnpm test
pnpm build
git diff --check
```

`pnpm test` 运行网页测试和仓库检查。只检查网页时可运行 `pnpm test:web`。

`pnpm build` 输出到 `web/dist/renderer/`。检查生产构建的页面时运行以下命令，然后打开 `http://127.0.0.1:8094`。

```sh
pnpm web:preview
```

构建预览也使用内存数据和上述开发密码。8094 同时是默认 Docker 部署端口，预览前确认本机该端口可用。每次修改源码后重新构建，再检查预览。查看物品列表、编辑弹窗和分类页面时，至少检查电脑及手机宽度，留意文字截断、横向溢出和弹窗滚动。

## 提交与发布

`main` 通过 PR 接收修改。开始开发前同步代码，并创建工作分支。

```sh
git switch main
git pull --ff-only
git switch -c change/short-description
```

完成修改和检查后提交，提交前用 `git status --short` 核对文件。

```sh
git add docs/development.md
git commit -m "更新开发说明"
git push -u origin change/short-description
```

上面的文件名和提交说明按实际修改替换。随后在 GitHub 创建指向 `main` 的 PR，等待检查通过后合并。

发布程序时，同步递增根目录和 `web/package.json` 的版本号，采用 `年份后两位.大版本.小版本`，例如 `26.9.3`。纯文档修改沿用当前程序版本。

GitHub Actions 会运行测试、网页构建、Compose 部署检查及 ARM64 运行检查。PR 通过检查后可合并，合并到 `main` 会发布 `ghcr.io/cimorn/storage:latest` 和对应版本标签。等待镜像发布任务成功后，再更新部署。

当前工作流也会检查纯文档提交，并在合并后重新发布当前版本的镜像标签。

## 更新部署

在现有部署目录运行以下命令。

```sh
docker compose pull storage
docker compose up -d --no-deps storage
docker compose ps
```

使用 NAS Docker 管理界面时，打开对应的 Compose 项目，选择重新部署并勾选“拉取最新镜像”。更新后打开网站，检查登录、物品图片、编辑保存和隐私区。

初次部署参见 [README](../README.md)，固定镜像与回退参见 [镜像说明](docker-images.md)，数据恢复参见 [备份说明](backup.md)。

## 保持开发目录干净

提交源码、测试、文档、依赖清单和锁文件。依赖目录 `node_modules/` 与构建目录 `web/dist/` 可通过安装和构建重新生成，Git 已忽略这些目录。

实际密码、密钥、数据库、用户图片、导出备份和 `.env` 放在部署主机或私有存储。仓库提供 `.env.example` 作为配置模板。

清理开发目录后，下次从根目录运行 `pnpm install --frozen-lockfile` 即可恢复依赖，再用 `pnpm dev` 开发。需要构建预览时，先运行 `pnpm build`。
