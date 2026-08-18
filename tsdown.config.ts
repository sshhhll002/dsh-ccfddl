import { clientBundle } from '../../client/tsdown.client.ts'

/**
 * Typert 产物 (lib/typert.host.js / lib/typert.remote-client.js) 由根构建的
 * workspace 生成器统一产出(本包已声明 ./typert 与 ./remote 导出并加入
 * tsconfig.host.json);此处仅构建 Node 半与浏览器半的普通产物。
 */
export default clientBundle(
  '@deepseek-ai/dsh-ccfddl',
  ['lib/types/index.js'],
  { hostPhase: true },
)
