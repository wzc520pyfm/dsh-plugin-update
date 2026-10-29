# dsh-plugin-update

DeepSeek Harness 里，第三方插件要更新，官方页面走的是先卸载再安装。安装失败时插件就没了。

这个插件只做一件事：给**已经装上的插件**换版本。它先在临时目录装好并核对，通过之后才改 profile。失败就把原来的 `package.json`、锁文件和 `cordis.patch.yml` 写回去。不会先 `remove`。

它不是插件市场。本地目录、压缩包地址没有新版本可查，会列出来并说明原因。某一次更新可以单独「这次先不更新」，再有更高版本时会重新出现。

## 安装

```bash
dsh plugin --profile web add @wzc520pyfm/dsh-plugin-update
```

重启 `dsh web`，打开 **设置 → 插件更新**。同一个面板也在这个插件自己的详情页上。

本地开发：

```bash
dsh plugin --profile web add link:/绝对路径/dsh-plugin-update
```

## 更新怎么做

1. 读取当前 profile 的直接依赖，跳过 `@deepseek-ai/*`。
2. npm 包对照注册表的 dist-tag（默认 `latest`，spec 写了 `next` 这类标签就用那个标签）。GitHub 地址对照远端提交。
3. 点更新后，先在临时目录执行 `pnpm install --ignore-scripts`（profile 用 npm 锁时改走 npm）。
4. 核对包名、版本号，以及声明的 `dsh.bundle.patch` 文件在不在。知道当前 DSH 版本时，一并核对 `engines.dsh`。
5. 核对通过才改 profile 里这一条依赖，再在 profile 里安装。
6. profile 安装失败：写回备份，并用原来的锁文件重新安装。
7. 安装过程如果改动了 `cordis.patch.yml`，把原文写回去。启用状态留在这份配置里。

换完需要重启 dsh，新代码才会加载。备份写在 `~/.dsh/plugin-update/`（profile 不在 `~/.dsh/profiles` 下时，写在该 profile 的 `.dsh-plugin-update/`）。面板里可以回滚到更新前的依赖、锁文件和 `cordis.patch.yml`。

「全部更新」只包含已经确认有新版本的插件，按顺序做，一处失败就停。Git 提交对不上、来源不是 GitHub 的，要单独点「安装远端并校验」。

## 不会做的事

- 不浏览、不搜索插件目录。
- 不更新 DSH 本体。
- 不先卸载。临时目录没装好时，profile 原样不动。
- 写操作只接受本机回环，并且更新和回滚要带 `confirm: true`。

## 开发

```bash
npm test
```

逻辑在 `lib/`，不需要构建。浏览器半是 `lib/client.js`，用 DSH 的 `__ModuleLoader__` 注册，模块 id 与包名都是 `@wzc520pyfm/dsh-plugin-update`。
