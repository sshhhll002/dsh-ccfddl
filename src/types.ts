/**
 * CCF DDL 数据通道的共享契约。独立 `/types` 子路径导出:生成的
 * Typert Remote 契约在客户端复用同一形状,包根只导出服务本体。
 * @module @deepseek-ai/dsh-ccfddl/types
 */

/** 一次拉取的平面结果;服务器与浏览器两个通道共用同一形状。 */
export interface CcfddlFetchResult {
  /** 是否有数据源成功返回语料。 */
  ok: boolean
  /** 成功时实际使用的数据源 URL;失败为空串。 */
  source: string
  /** 失败时所有数据源的可读原因(分号连接);成功为空串。 */
  error: string
  /** 原始 YAML 语料;失败为空串。 */
  text: string
}
