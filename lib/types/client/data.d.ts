/**
 * CCF DDL 组件的纯数据层:YAML 解析、截稿时刻换算、行派生与拉取。
 * 无 DOM/React 依赖,可在 Node 下独立测试。
 * @module @deepseek-ai/dsh-ccfddl/client/data
 */
export declare const DAY_MS = 86400000;
export declare const HOUR_MS = 3600000;
export declare const SOURCE_URLS: string[];
/** 组件设置;持久化与默认值在 index.ts,这里只承载数据层要消费的形状。 */
export interface Settings {
    tracked: string[] | null;
    windowDays: number;
    sortBy: 'deadline' | 'rank' | 'title';
    showAbstract: boolean;
    showPast: boolean;
    rankAllow: string[];
    autoRefreshH: number;
    collapsed: boolean;
}
/** Minimal YAML subset parser validated against ccfddl 的 allconf.yml 结构。 */
export declare function parseYaml(text: string): unknown[];
export declare function parseDeadlineEpoch(text: string, tz: string): number | null;
export interface Row {
    title: string;
    description: string;
    sub: string;
    rank: {
        ccf: string;
        core: string | null;
        thcpl: string | null;
    };
    next: {
        year: number;
        link: string;
        timezone: string;
        date: string;
        place: string;
        abstractEpochMs: number | null;
        abstractText: string | null;
        paperEpochMs: number | null;
        paperText: string | null;
    };
    past: boolean;
}
/** 一行记录当前要倒计时的目标时刻(毫秒);无未来截稿时返回 0。 */
export declare function targetOf(r: Row, now: number): number;
export declare function derive(corpus: unknown[], settings: Settings, now: number): {
    rows: Row[];
    catalog: Array<{
        title: string;
        sub: string;
        rank: string;
    }>;
};
/** 拉取一个数据源;成功返回正文,失败返回可读原因。旧浏览器没有 AbortSignal.timeout 时不做超时控制。 */
export declare function fetchText(url: string): Promise<{
    text: string;
} | {
    error: string;
}>;
//# sourceMappingURL=data.d.ts.map