/**
 * CCF DDL 数据服务的服务器半。数据由服务器进程自身的网络栈拉取
 * (不再依赖浏览器出网),通过生成的 Typert Remote 方法交给浏览器组件;
 * 客户端仅在远端不可用时降级回浏览器直连。设置持久化与渲染仍在
 * 客户端 (src/client/index.ts)。
 * @module @deepseek-ai/dsh-ccfddl
 */
import type { Context } from '@deepseek-ai/cordis';
import { TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol';
import type { CcfddlFetchResult } from './types.ts';
declare module '@deepseek-ai/cordis' {
    interface Context {
        'ccfddl.data': CcfddlData;
    }
}
/**
 * 依次尝试各数据源;成功返回正文与来源,全部失败返回各源的可读原因。
 * fetcher 可注入,便于测试与复用浏览器侧的同一逻辑形状。
 */
export declare function fetchCorpus(urls: readonly string[], fetcher: typeof fetch): Promise<CcfddlFetchResult>;
/**
 * 服务器端数据通道:浏览器经连接 API 调用 {@link CcfddlData.fetchData},
 * 语料只在本进程与页面之间流动,页面无需自行访问外网。
 */
export declare class CcfddlData extends TypertRemoteService {
    private cache;
    constructor(ctx: Context);
    /**
     * 用服务器自身的网络栈拉取 ccfddl 合并语料。
     * @returns 成功携带 YAML 文本;全部失败时携带各源的可读原因。
     */
    fetchData(): Promise<CcfddlFetchResult>;
}
export default CcfddlData;
//# sourceMappingURL=index.d.ts.map