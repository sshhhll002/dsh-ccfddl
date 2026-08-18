# dsh-ccfddl

<p align="center">
  <img alt="GitHub release" src="https://img.shields.io/github/v/release/sshhhll002/dsh-ccfddl">
  <img alt="License" src="https://img.shields.io/github/license/sshhhll002/dsh-ccfddl">
  <img alt="dsh-plugin" src="https://img.shields.io/badge/available-2563eb?label=dsh-plugin">
</p>

CCF 会议截稿倒计时侧栏插件,运行在 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 的 Web 界面(`dsh web`)中。

## 功能

- 组件位于左侧边栏工作区下方、设置上方,视觉风格与官方 CordisPlugin 行一致;可最小化为一行,展开后显示最近截稿会议的实时倒计时。
- 按剩余天数用颜色标注紧急度:红色不足 7 天,橙色 7–30 天,绿色超过 30 天,已截稿显示为灰色。
- 设置面板包含四个页签:跟踪(默认跟踪全部 CCF-A 类会议,可按领域筛选)、筛选(时间窗口、排序方式、等级筛选、是否显示 abstract 截稿与过期会议)、更新(手动刷新与自动刷新间隔,默认每 8 小时)、关于(数据源与版本)。设置保存在浏览器 localStorage。
- 数据来自开源项目 [ccfddl/ccf-deadlines](https://github.com/ccfddl/ccf-deadlines) 的合并语料(`allconf.yml`),由**服务器进程**经 DeepSeek Harness 的 Typert Remote 通道拉取,浏览器不需要直接访问外网;服务器通道不可用时自动降级为浏览器直连。
- 服务器侧带 5 分钟缓存:多标签页或频繁手动刷新不会重复请求数据源。

## 安装

前提:已安装 DeepSeek Harness 并能运行 `dsh web`,宿主进程为 Node.js 18 或更高版本。

```sh
dsh plugin --profile web add github:sshhhll002/dsh-ccfddl
```

`dsh plugin` 把包作为 profile 依赖安装(peer 依赖 `@deepseek-ai/cordis`、`@deepseek-ai/dsh-typert-protocol`、`react` 均发布在 npm),并读取包内随附的 `cordis.patch.yml` 自动挂载组件行。之后重启 `dsh web`,刷新页面即可。

手动安装的等价方式:把本仓库软链到 `profile/node_modules/@deepseek-ai/dsh-ccfddl`(仓库已提交预构建产物 `lib/`,无需先构建),并在 profile 的 `cordis.patch.yml` 中插入:

```yaml
- insert:
    - id: ccfddl
      name: '@deepseek-ai/dsh-ccfddl'
```

两种方式二选一,不要同时使用,否则组件行会被插入两次。

## 构建与测试

仓库已提交预构建产物,直接安装无需构建。若要修改源码重新构建,请将仓库放入 DeepSeek Harness 源码工作区的 `packages/extensions/ccfddl`(本仓库的 `tsconfig.json` 与 `tsdown.config.ts` 按该工作区布局书写,并需把本包加入工作区根 `tsconfig.host.json` 与 `tsconfig.client.json` 的项目引用)。构建命令:

```sh
pnpm exec tsc -b
pnpm exec tsdown --env.DSH_BUILD_FACE host
pnpm exec tsdown --env.DSH_BUILD_FACE client
```

修改宿主 Remote 方法的签名后,需要重新生成 Typert 产物(在工作区内执行根构建 `pnpm run build:lib:host` 会自动完成)。

测试共 16 个用例,在工作区内运行:

```sh
pnpm vitest run packages/extensions/ccfddl/tests/data.client.spec.ts packages/extensions/ccfddl/tests/data-source.host.spec.ts
```

覆盖:YAML 语料解析(嵌套、引号、行内注释、CRLF/BOM)、会议时区换算(AoE/UTC±n)、跟踪与筛选逻辑、浏览器通道拉取(HTTP 错误/异常/短响应/无 `AbortSignal.timeout` 的旧浏览器),以及服务器多源拉取与失败聚合。

## 许可证与归属

- 插件代码:MIT,见 [LICENSE](LICENSE)。
- 截稿数据:运行时取自 ccfddl/ccf-deadlines(MIT,© 2021 CCFDDL);本仓库不随包分发该数据文件,完整许可文本与分发条件见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
- 本插件为非官方项目,与 CCF(中国计算机学会)及 ccfddl 项目无隶属、代言或合作关系。
