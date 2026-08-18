/**
 * CCF DDL 倒计时侧栏组件。
 * 挂载于 sidebar.footer.action(工作区下方、设置上方),视觉上与官方 CordisPanel
 * 一致的"透明行 + 圆角悬停"原生风格;最小化时收缩为一行原生按钮。
 * 数据:经 Typert Remote 由服务器进程拉取(失败时降级浏览器直连);
 * 设置:localStorage 持久化;计时:原生 setInterval。
 */
import React from 'react';
import TYPERT_REMOTE from '@deepseek-ai/dsh-ccfddl/remote';
import { DAY_MS, HOUR_MS, SOURCE_URLS, derive, fetchText, parseYaml, targetOf } from "./data.js";
export const inject = ['slots'];
const VERSION = '1.0.0';
const STORE_KEY = 'ccfddl.settings.v1';
// ---------------------------------------------------------------- settings
const DEFAULT_SETTINGS = {
    tracked: null,
    windowDays: 90,
    sortBy: 'deadline',
    showAbstract: true,
    showPast: false,
    rankAllow: ['A', 'B', 'C'],
    autoRefreshH: 8,
    collapsed: false,
};
/** 读取持久化设置并逐字段兜底:损坏的本地数据不能破坏渲染。 */
function loadSettings() {
    let raw = null;
    try {
        const text = window.localStorage.getItem(STORE_KEY);
        if (text !== null)
            raw = JSON.parse(text);
    }
    catch {
        // unreadable store -> defaults
    }
    const s = { ...DEFAULT_SETTINGS, ...raw };
    if (typeof s.windowDays !== 'number' || !isFinite(s.windowDays) || s.windowDays < 0)
        s.windowDays = DEFAULT_SETTINGS.windowDays;
    if (s.sortBy !== 'deadline' && s.sortBy !== 'rank' && s.sortBy !== 'title')
        s.sortBy = DEFAULT_SETTINGS.sortBy;
    if (typeof s.showAbstract !== 'boolean')
        s.showAbstract = DEFAULT_SETTINGS.showAbstract;
    if (typeof s.showPast !== 'boolean')
        s.showPast = DEFAULT_SETTINGS.showPast;
    if (typeof s.autoRefreshH !== 'number' || [0, 4, 8, 12, 24].indexOf(s.autoRefreshH) < 0)
        s.autoRefreshH = DEFAULT_SETTINGS.autoRefreshH;
    if (typeof s.collapsed !== 'boolean')
        s.collapsed = DEFAULT_SETTINGS.collapsed;
    if (!Array.isArray(s.tracked))
        s.tracked = null;
    if (!Array.isArray(s.rankAllow) || s.rankAllow.length === 0)
        s.rankAllow = [...DEFAULT_SETTINGS.rankAllow];
    return s;
}
function saveSettings(settings) {
    try {
        window.localStorage.setItem(STORE_KEY, JSON.stringify(settings));
    }
    catch {
        // storage unavailable -> in-memory only
    }
}
// ------------------------------------------------------------------- ui
const pad2 = (n) => (n < 10 ? '0' : '') + n;
function fmtCount(ms, withSec) {
    if (ms < 0)
        return '已截稿';
    const d = Math.floor(ms / DAY_MS);
    const h = Math.floor((ms % DAY_MS) / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    const s = Math.floor((ms % 60000) / 1000);
    return (d > 0 ? d + '天 ' : '') + pad2(h) + ':' + pad2(m) + (withSec ? ':' + pad2(s) : '');
}
const fmtClock = (t) => {
    const dt = new Date(t);
    return pad2(dt.getHours()) + ':' + pad2(dt.getMinutes());
};
const shortDate = (s) => (s !== null && s.length >= 10 ? s.slice(5, 10) : '');
/** 红绿灯紧急度:红 <7 天,橙 7–30 天,绿 >30 天。仅返回颜色修饰类。 */
function urgency(days) {
    if (days < 0)
        return { cls: 'ccfddl-c-past', tip: '已截稿' };
    if (days < 7)
        return { cls: 'ccfddl-c-urg', tip: '红色:距截稿不足 7 天' };
    if (days < 30)
        return { cls: 'ccfddl-c-near', tip: '橙色:距截稿 7–30 天' };
    return { cls: 'ccfddl-c-ok', tip: '绿色:距截稿超过 30 天' };
}
/* 视觉基准对齐官方 CordisPanel:透明整行 + 12px 圆角悬停,无边框盒子。 */
const CSS_TEXT = [
    '.ccfddl-root { flex: 1 0 100%; width: 100%; margin: 8px 0 0; font-size: 12px; line-height: 1.45; color: var(--dsw-alias-label-primary); }',
    '.ccfddl-root, .ccfddl-root * { box-sizing: border-box; }',
    '.ccfddl-bar { display: flex; align-items: center; gap: 8px; width: 100%; height: 49px; padding: 0 8px 0 6px; border: none; border-radius: 12px; background: transparent; color: var(--dsw-alias-label-primary); font-family: inherit; font-size: 14px; cursor: pointer; overflow: hidden; }',
    '.ccfddl-bar:hover { background: var(--dsw-alias-interactive-bg-hover-solid); }',
    '.ccfddl-bar svg, .ccfddl-header svg { flex: none; }',
    '.ccfddl-bar-title { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }',
    '.ccfddl-bar-name { flex: none; min-width: 0; max-width: 40%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--dsw-alias-label-tertiary); font-size: 12px; line-height: 16px; }',
    '.ccfddl-bar-count { flex: none; margin-left: auto; font-variant-numeric: tabular-nums; font-size: 12px; line-height: 16px; }',
    '.ccfddl-header { display: flex; align-items: center; gap: 8px; width: 100%; height: 44px; padding: 0 6px; border-radius: 12px; }',
    '.ccfddl-header-title { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 14px; }',
    '.ccfddl-header-btns { display: flex; gap: 2px; flex: none; }',
    '.ccfddl-ibtn { appearance: none; display: inline-flex; align-items: center; justify-content: center; width: 28px; height: 28px; padding: 0; border: none; border-radius: 999px; background: transparent; color: var(--dsw-alias-label-tertiary); cursor: pointer; font-size: 13px; line-height: 1; }',
    '.ccfddl-ibtn:hover:not(:disabled), .ccfddl-ibtn.on { background: var(--dsw-alias-interactive-bg-hover); color: var(--dsw-alias-label-secondary); }',
    '.ccfddl-ibtn:disabled { opacity: 0.4; cursor: default; }',
    '.ccfddl-ibtn.stale { color: var(--dsw-alias-state-warn-primary); }',
    '.ccfddl-list { overflow-y: auto; max-height: 200px; padding: 2px 0 4px; border-top: 1px solid var(--dsw-alias-border-l1); }',
    '.ccfddl-row { padding: 6px 12px; cursor: pointer; }',
    '.ccfddl-row:hover { background: var(--dsw-alias-interactive-bg-hover); }',
    '.ccfddl-row-main { display: flex; align-items: center; gap: 6px; }',
    '.ccfddl-rank { flex: none; display: inline-block; min-width: 16px; height: 16px; padding: 0 3px; border-radius: 4px; color: #fff; font-size: 10px; font-weight: 700; line-height: 16px; text-align: center; }',
    '.ccfddl-rank-A { background: #3d6cf0; }',
    '.ccfddl-rank-B { background: #17a06b; }',
    '.ccfddl-rank-C { background: #c98a22; }',
    '.ccfddl-rank-N { background: #97a0b3; }',
    '.ccfddl-row-title { flex: 1; min-width: 0; }',
    '.ccfddl-row-name { font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }',
    '.ccfddl-row-sub { color: var(--dsw-alias-label-tertiary); font-size: 11px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }',
    '.ccfddl-count { margin-left: auto; flex: none; font-variant-numeric: tabular-nums; font-weight: 600; white-space: nowrap; }',
    '.ccfddl-c-urg { color: var(--dsw-alias-state-error-primary); }',
    '.ccfddl-c-near { color: var(--dsw-alias-state-warn-primary); }',
    '.ccfddl-c-ok { color: var(--dsw-alias-state-success-primary); }',
    '.ccfddl-c-past { color: var(--dsw-alias-label-tertiary); font-weight: 400; }',
    '.ccfddl-detail { padding: 4px 12px 6px 34px; color: var(--dsw-alias-label-tertiary); font-size: 11px; border-top: 1px solid var(--dsw-alias-border-l1); margin-top: 4px; }',
    '.ccfddl-detail div { margin: 1px 0; }',
    '.ccfddl-link { color: var(--dsw-alias-brand-primary); text-decoration: none; }',
    '.ccfddl-link:hover { text-decoration: underline; }',
    '.ccfddl-panel { display: flex; flex-direction: column; max-height: 300px; border-top: 1px solid var(--dsw-alias-border-l1); }',
    '.ccfddl-tabs { display: flex; border-bottom: 1px solid var(--dsw-alias-border-l1); flex: none; }',
    '.ccfddl-tab { flex: 1; padding: 6px 0; background: transparent; border: none; border-bottom: 2px solid transparent; color: var(--dsw-alias-label-tertiary); cursor: pointer; font-size: 12px; }',
    '.ccfddl-tab.active { color: var(--dsw-alias-label-primary); border-bottom-color: var(--dsw-alias-brand-primary); font-weight: 600; }',
    '.ccfddl-panel-body { overflow-y: auto; padding: 8px 12px; flex: 1; }',
    '.ccfddl-search { width: 100%; padding: 5px 8px; border: 1px solid var(--dsw-alias-border-l1); border-radius: 6px; background: var(--dsw-alias-bg-base); color: var(--dsw-alias-label-primary); font-size: 12px; }',
    '.ccfddl-search::placeholder { color: var(--dsw-alias-label-tertiary); opacity: 0.8; }',
    '.ccfddl-chips { display: flex; flex-wrap: wrap; gap: 4px; margin: 6px 0; }',
    '.ccfddl-chip { padding: 1px 7px; border-radius: 999px; border: 1px solid var(--dsw-alias-border-l1); color: var(--dsw-alias-label-tertiary); cursor: pointer; font-size: 11px; background: transparent; }',
    '.ccfddl-chip.active { background: var(--dsw-alias-brand-primary); border-color: var(--dsw-alias-brand-primary); color: #fff; }',
    '.ccfddl-check { display: flex; align-items: center; gap: 6px; padding: 3px 4px; border-radius: 6px; cursor: pointer; }',
    '.ccfddl-check:hover { background: var(--dsw-alias-interactive-bg-hover); }',
    '.ccfddl-check input, .ccfddl-opt input { accent-color: var(--dsw-alias-brand-primary); }',
    '.ccfddl-check-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }',
    '.ccfddl-checks { max-height: 180px; overflow-y: auto; }',
    '.ccfddl-opts { display: flex; flex-wrap: wrap; gap: 10px; margin: 4px 0 8px; }',
    '.ccfddl-opt { display: inline-flex; align-items: center; gap: 4px; color: var(--dsw-alias-label-tertiary); cursor: pointer; font-size: 12px; }',
    '.ccfddl-section-title { font-weight: 600; margin: 8px 0 2px; }',
    '.ccfddl-actions { display: flex; gap: 6px; margin: 6px 0; align-items: center; }',
    '.ccfddl-action { flex: 1; padding: 5px 0; border-radius: 6px; border: 1px solid var(--dsw-alias-border-l1); background: var(--dsw-alias-bg-base); color: var(--dsw-alias-label-primary); cursor: pointer; font-size: 12px; }',
    '.ccfddl-action:hover { background: var(--dsw-alias-interactive-bg-hover); }',
    '.ccfddl-action:disabled { opacity: 0.4; }',
    '.ccfddl-action.primary { background: var(--dsw-alias-brand-primary); border-color: var(--dsw-alias-brand-primary); color: #fff; }',
    '.ccfddl-note { color: var(--dsw-alias-label-tertiary); font-size: 11px; }',
    '.ccfddl-error { padding: 10px 12px; color: var(--dsw-alias-state-error-primary); border-top: 1px solid var(--dsw-alias-border-l1); }',
    '.ccfddl-empty { padding: 14px 12px; text-align: center; color: var(--dsw-alias-label-tertiary); border-top: 1px solid var(--dsw-alias-border-l1); }',
    '.ccfddl-empty-icon { font-size: 20px; margin-bottom: 4px; }',
    '.ccfddl-empty .ccfddl-action { margin-top: 8px; }',
    '.ccfddl-skel { height: 30px; margin: 5px 12px; border-radius: 6px; background: var(--dsw-alias-bg-layer-2); opacity: 0.7; }',
    '.ccfddl-rail { display: flex; justify-content: center; padding: 2px 0; }',
    '.ccfddl-rail-btn { appearance: none; border: none; background: transparent; width: 36px; height: 36px; border-radius: 50%; cursor: pointer; font-size: 16px; line-height: 1; display: inline-flex; align-items: center; justify-content: center; padding: 0; color: var(--dsw-alias-label-primary); }',
    '.ccfddl-rail-btn:hover { background: var(--dsw-alias-interactive-bg-hover-solid); }',
    '.ccfddl-list::-webkit-scrollbar, .ccfddl-panel-body::-webkit-scrollbar, .ccfddl-checks::-webkit-scrollbar { width: 6px; }',
    '.ccfddl-list::-webkit-scrollbar-thumb, .ccfddl-panel-body::-webkit-scrollbar-thumb, .ccfddl-checks::-webkit-scrollbar-thumb { background: var(--dsw-alias-border-l2); border-radius: 3px; }',
    '@media (prefers-reduced-motion: reduce) { .ccfddl-root * { transition: none !important; animation: none !important; } }',
].join('\n');
function RadioGroup(p) {
    return React.createElement('div', { className: 'ccfddl-opts' }, p.options.map((o) => React.createElement('label', { className: 'ccfddl-opt', key: String(o[0]) }, React.createElement('input', { type: 'radio', name: p.name, checked: p.value === o[0], onChange: () => p.onChange(o[0]) }), React.createElement('span', null, o[1]))));
}
function Toggle(p) {
    return React.createElement('label', { className: 'ccfddl-opt' }, React.createElement('input', { type: 'checkbox', checked: p.checked, onChange: (e) => p.onChange(e.target.checked) }), React.createElement('span', null, p.label));
}
/** 原创时钟图标(14px,细线风格与官方图标同重,currentColor,无版权问题)。 */
function CcfIcon() {
    return React.createElement('svg', { width: 14, height: 14, viewBox: '0 0 14 14', fill: 'none', 'aria-hidden': true }, React.createElement('path', {
        fill: 'currentColor', fillRule: 'evenodd',
        d: 'M7 0C3.13 0 0 3.13 0 7s3.13 7 7 7 7-3.13 7-7S10.87 0 7 0zM7 1.2C3.8 1.2 1.2 3.8 1.2 7s2.6 5.8 5.8 5.8 5.8-2.6 5.8-5.8S10.2 1.2 7 1.2z',
    }), React.createElement('path', { fill: 'currentColor', d: 'M6.55 2.6h0.9v4.4h-0.9z' }), React.createElement('path', { fill: 'currentColor', d: 'M7 6.55h4.4v0.9H7z' }));
}
function CcfDdlWidget(props) {
    const { wide, remoteFetch } = props;
    const [settings, setSettings] = React.useState(loadSettings);
    const [corpus, setCorpus] = React.useState([]);
    const [meta, setMeta] = React.useState(null);
    const [now, setNow] = React.useState(Date.now());
    const [collapsed, setCollapsed] = React.useState(settings.collapsed);
    const [panel, setPanel] = React.useState(false);
    const [tab, setTab] = React.useState('track');
    const [expanded, setExpanded] = React.useState(null);
    const [search, setSearch] = React.useState('');
    const [subChip, setSubChip] = React.useState('all');
    const [refreshing, setRefreshing] = React.useState(false);
    const change = (patch) => {
        setSettings((prev) => {
            const next = { ...prev, ...patch };
            saveSettings(next);
            return next;
        });
    };
    const doRefresh = async () => {
        if (refreshing)
            return;
        setRefreshing(true);
        let raw = null;
        let usedUrl = SOURCE_URLS[0];
        const failures = [];
        // 首选服务器通道:数据由服务器进程自身的网络栈拉取,页面不出网。
        if (remoteFetch !== undefined) {
            try {
                const result = await remoteFetch();
                if (result.ok && result.value.ok) {
                    raw = result.value.text;
                    usedUrl = result.value.source;
                }
                else {
                    failures.push('服务器: ' + (result.ok ? result.value.error : result.error.message));
                }
            }
            catch (err) {
                failures.push('服务器: ' + (err instanceof Error ? err.message : String(err)));
            }
        }
        // 服务器通道不可用或失败时,降级为浏览器直连。
        if (raw === null) {
            for (const url of SOURCE_URLS) {
                const result = await fetchText(url);
                if ('text' in result) {
                    raw = result.text;
                    usedUrl = url;
                    break;
                }
                failures.push(url + ' → ' + result.error);
            }
        }
        try {
            if (raw === null)
                throw new Error('数据源不可达: ' + failures.join('; '));
            const parsed = parseYaml(raw);
            if (parsed.length === 0)
                throw new Error('语料为空');
            setCorpus(parsed);
            setMeta({ updatedAt: Date.now(), lastError: '', stale: false, sourceUrl: usedUrl, corpusCount: parsed.length });
        }
        catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            setMeta((prev) => ({ updatedAt: prev?.updatedAt ?? 0, lastError: message, stale: true, sourceUrl: prev?.sourceUrl ?? '', corpusCount: prev?.corpusCount ?? 0 }));
        }
        finally {
            setRefreshing(false);
        }
    };
    React.useEffect(() => { void doRefresh(); }, []);
    React.useEffect(() => {
        const id = window.setInterval(() => setNow(Date.now()), 1000);
        return () => window.clearInterval(id);
    }, []);
    React.useEffect(() => {
        const id = window.setInterval(() => {
            if (!refreshing && settings.autoRefreshH > 0 && meta !== null && meta.updatedAt > 0 && Date.now() - meta.updatedAt > settings.autoRefreshH * HOUR_MS) {
                void doRefresh();
            }
        }, 60000);
        return () => window.clearInterval(id);
    }, [refreshing, settings.autoRefreshH, meta]);
    const toggleCollapsed = () => {
        const v = !collapsed;
        setCollapsed(v);
        setPanel(false);
        change({ collapsed: v });
    };
    if (!wide) {
        return React.createElement('div', { className: 'ccfddl-rail' }, React.createElement('button', { className: 'ccfddl-rail-btn', title: 'CCF DDL 倒计时', 'aria-label': 'CCF DDL 倒计时', onClick: toggleCollapsed }, React.createElement(CcfIcon)));
    }
    const phase = meta === null ? 'loading'
        : (meta.updatedAt === 0) ? 'error'
            : 'ready';
    const { rows, catalog } = React.useMemo(() => derive(corpus, settings, now), [corpus, settings, now]);
    const empty = phase === 'ready' && rows.length === 0;
    let minTitle = null;
    let minKey = null;
    let minYear = '';
    for (const r of rows) {
        if (r.past)
            continue;
        const k = targetOf(r, now);
        if (k > now && (minKey === null || k < minKey)) {
            minKey = k;
            minTitle = r.title;
            minYear = r.next.year;
        }
    }
    if (collapsed) {
        const minDays = minKey !== null ? Math.floor((minKey - now) / DAY_MS) : -1;
        const minUrg = urgency(minDays);
        return React.createElement('div', { className: 'ccfddl-root' }, React.createElement('button', {
            className: 'ccfddl-bar',
            onClick: toggleCollapsed,
            title: '展开 CCF DDL 倒计时' + (minTitle !== null ? ' · 最近截稿: ' + minTitle : ''),
        }, React.createElement(CcfIcon), React.createElement('span', { className: 'ccfddl-bar-title' }, 'CCF DDL'), minTitle !== null && minKey !== null && phase === 'ready'
            ? React.createElement('span', { className: 'ccfddl-bar-name' }, minTitle + ' ' + minYear)
            : null, minKey !== null && phase === 'ready'
            ? React.createElement('span', { className: 'ccfddl-bar-count ' + minUrg.cls, title: minUrg.tip }, fmtCount(minKey - now, true))
            : null));
    }
    const rowEl = (r) => {
        const abs = r.next.abstractEpochMs;
        const paper = r.next.paperEpochMs;
        const isPast = r.past || ((abs === null || abs <= now) && (paper === null || paper <= now));
        const ms = isPast ? -1 : targetOf(r, now) - now;
        const days = ms >= 0 ? Math.floor(ms / DAY_MS) : -1;
        const u = urgency(days);
        const open = expanded === r.title;
        const sub = [];
        if (!isPast && settings.showAbstract) {
            if (abs !== null && abs > now)
                sub.push('Abs ' + shortDate(r.next.abstractText));
            if (paper !== null && paper > now)
                sub.push('Paper ' + shortDate(r.next.paperText));
        }
        return React.createElement('div', { className: 'ccfddl-row', key: r.title, title: r.description || undefined, onClick: () => setExpanded(open ? null : r.title) }, React.createElement('div', { className: 'ccfddl-row-main' }, React.createElement('span', { className: 'ccfddl-rank ccfddl-rank-' + r.rank.ccf, title: 'CCF ' + r.rank.ccf + ' 类' }, r.rank.ccf), React.createElement('div', { className: 'ccfddl-row-title' }, React.createElement('div', { className: 'ccfddl-row-name' }, r.title + ' ' + r.next.year), sub.length > 0 ? React.createElement('div', { className: 'ccfddl-row-sub' }, sub.join(' ▸ ') + (r.next.timezone ? ' (' + r.next.timezone + ')' : '')) : null), React.createElement('span', { className: 'ccfddl-count ' + u.cls, title: u.tip }, fmtCount(ms, r.title === minTitle))), open ? React.createElement('div', { className: 'ccfddl-detail' }, isPast ? React.createElement('div', null, '已截稿') : null, React.createElement('div', null, '等级: CCF ' + r.rank.ccf + (r.rank.core ? ' · CORE ' + r.rank.core : '') + (r.rank.thcpl ? ' · THCPL ' + r.rank.thcpl : '')), r.next.abstractText ? React.createElement('div', null, 'Abstract: ' + r.next.abstractText + ' (' + r.next.timezone + ')') : null, r.next.paperText ? React.createElement('div', null, 'Paper: ' + r.next.paperText + ' (' + r.next.timezone + ')') : null, r.next.date ? React.createElement('div', null, '会议时间: ' + r.next.date) : null, r.next.place ? React.createElement('div', null, '地点: ' + r.next.place) : null, r.next.link ? React.createElement('a', { className: 'ccfddl-link', href: r.next.link, target: '_blank', rel: 'noopener noreferrer', onClick: (e) => e.stopPropagation() }, '官网 ↗') : null) : null);
    };
    const headerEl = React.createElement('div', { className: 'ccfddl-header' }, React.createElement(CcfIcon), React.createElement('span', { className: 'ccfddl-header-title' }, 'CCF DDL'), React.createElement('div', { className: 'ccfddl-header-btns' }, React.createElement('button', { className: 'ccfddl-ibtn' + (meta !== null && meta.stale ? ' stale' : ''), title: meta !== null && meta.stale ? '数据已过期,点击重试' : '刷新数据', disabled: refreshing, onClick: () => void doRefresh() }, refreshing ? '…' : '↻'), React.createElement('button', { className: 'ccfddl-ibtn' + (panel ? ' on' : ''), title: '设置', onClick: () => setPanel(!panel) }, '⚙'), React.createElement('button', { className: 'ccfddl-ibtn', title: '最小化到一行', onClick: toggleCollapsed }, '—')));
    let bodyEl = null;
    if (panel) {
        const TABS = [['track', '跟踪'], ['filter', '筛选'], ['update', '更新'], ['about', '关于']];
        const trackTabEl = () => {
            const tracked = settings.tracked ?? [];
            const subs = [];
            for (const c of catalog) {
                if (c.sub !== '' && subs.indexOf(c.sub) < 0)
                    subs.push(c.sub);
            }
            subs.sort();
            const q = search.trim().toLowerCase();
            const visible = catalog.filter((c) => (subChip === 'all' || c.sub === subChip) && (q === '' || c.title.toLowerCase().indexOf(q) >= 0));
            return React.createElement('div', null, React.createElement('input', { className: 'ccfddl-search', type: 'text', placeholder: '搜索会议…', value: search, onChange: (e) => setSearch(e.target.value) }), React.createElement('div', { className: 'ccfddl-chips' }, ['all'].concat(subs).map((c) => React.createElement('button', { key: c, className: 'ccfddl-chip' + (subChip === c ? ' active' : ''), onClick: () => setSubChip(c) }, c === 'all' ? '全部' : c))), React.createElement('div', { className: 'ccfddl-actions' }, React.createElement('button', { className: 'ccfddl-action', disabled: catalog.length === 0, onClick: () => change({ tracked: catalog.map((c) => c.title) }) }, '全选'), React.createElement('button', { className: 'ccfddl-action', disabled: catalog.length === 0, onClick: () => change({ tracked: [] }) }, '清空'), React.createElement('span', { className: 'ccfddl-note' }, '已选 ' + tracked.length + ' 个')), React.createElement('div', { className: 'ccfddl-checks' }, catalog.length === 0
                ? React.createElement('div', { className: 'ccfddl-note' }, '数据加载中…')
                : visible.map((c) => React.createElement('label', { className: 'ccfddl-check', key: c.title }, React.createElement('input', { type: 'checkbox', checked: tracked.indexOf(c.title) >= 0, onChange: () => {
                        const t = tracked.slice();
                        const i = t.indexOf(c.title);
                        if (i >= 0)
                            t.splice(i, 1);
                        else
                            t.push(c.title);
                        change({ tracked: t });
                    } }), React.createElement('span', { className: 'ccfddl-rank ccfddl-rank-' + c.rank }, c.rank), React.createElement('span', { className: 'ccfddl-check-name' }, c.title), React.createElement('span', { className: 'ccfddl-chip' }, c.sub)))));
        };
        const filterTabEl = () => React.createElement('div', null, React.createElement('div', { className: 'ccfddl-section-title' }, '时间窗口'), React.createElement(RadioGroup, { name: 'win', value: settings.windowDays, options: [[30, '30 天'], [60, '60 天'], [90, '90 天'], [180, '180 天'], [0, '全部']], onChange: (v) => change({ windowDays: Number(v) }) }), React.createElement('div', { className: 'ccfddl-section-title' }, '排序方式'), React.createElement(RadioGroup, { name: 'sort', value: settings.sortBy, options: [['deadline', '按截稿'], ['rank', '按等级'], ['title', '按名称']], onChange: (v) => change({ sortBy: v }) }), React.createElement('div', { className: 'ccfddl-section-title' }, '等级筛选'), React.createElement('div', { className: 'ccfddl-opts' }, ['A', 'B', 'C', 'N'].map((r) => React.createElement('label', { className: 'ccfddl-opt', key: r }, React.createElement('input', { type: 'checkbox', checked: settings.rankAllow.indexOf(r) >= 0, onChange: (e) => {
                const next = settings.rankAllow.slice();
                const i = next.indexOf(r);
                if (e.target.checked && i < 0)
                    next.push(r);
                if (!e.target.checked && i >= 0)
                    next.splice(i, 1);
                if (next.length > 0)
                    change({ rankAllow: next });
            } }), React.createElement('span', null, r + ' 类')))), React.createElement('div', { className: 'ccfddl-opts' }, React.createElement(Toggle, { checked: settings.showAbstract, label: '显示 abstract 截稿行', onChange: (v) => change({ showAbstract: v }) }), React.createElement(Toggle, { checked: settings.showPast, label: '显示已过期会议', onChange: (v) => change({ showPast: v }) })));
        const updateTabEl = () => React.createElement('div', null, React.createElement('div', { className: 'ccfddl-note' }, meta !== null && meta.updatedAt > 0 ? '上次成功更新: ' + fmtClock(meta.updatedAt) + ' (本地时间)' : '尚未成功更新'), meta !== null && meta.stale ? React.createElement('div', { className: 'ccfddl-error' }, '⚠ ' + meta.lastError) : null, React.createElement('div', { className: 'ccfddl-section-title' }, '自动刷新间隔'), React.createElement(RadioGroup, { name: 'auto', value: settings.autoRefreshH, options: [[0, '关'], [4, '4 小时'], [8, '8 小时'], [12, '12 小时'], [24, '24 小时']], onChange: (v) => change({ autoRefreshH: Number(v) }) }));
        const aboutTabEl = () => React.createElement('div', null, React.createElement('div', { className: 'ccfddl-section-title' }, '数据源'), React.createElement('div', { className: 'ccfddl-note' }, meta?.sourceUrl ?? ''), React.createElement('a', { className: 'ccfddl-link', href: 'https://github.com/ccfddl/ccf-deadlines', target: '_blank', rel: 'noopener noreferrer' }, 'ccfddl/ccf-deadlines ↗'), React.createElement('div', { className: 'ccfddl-note' }, '数据按 MIT 许可取自该项目'), React.createElement('div', { className: 'ccfddl-section-title' }, '插件'), React.createElement('div', { className: 'ccfddl-note' }, 'CCF DDL Countdown v' + VERSION + ' · 设置保存在浏览器本地'), React.createElement('div', { className: 'ccfddl-note' }, '非官方插件,与 CCF 及 ccfddl 无隶属关系'));
        bodyEl = React.createElement('div', { className: 'ccfddl-panel' }, React.createElement('div', { className: 'ccfddl-tabs' }, TABS.map((t) => React.createElement('button', { key: t[0], className: 'ccfddl-tab' + (tab === t[0] ? ' active' : ''), onClick: () => setTab(t[0]) }, t[1]))), React.createElement('div', { className: 'ccfddl-panel-body' }, tab === 'track' ? trackTabEl() : null, tab === 'filter' ? filterTabEl() : null, tab === 'update' ? updateTabEl() : null, tab === 'about' ? aboutTabEl() : null));
    }
    else if (phase === 'loading') {
        bodyEl = React.createElement('div', { className: 'ccfddl-list' }, React.createElement('div', { className: 'ccfddl-skel' }), React.createElement('div', { className: 'ccfddl-skel' }), React.createElement('div', { className: 'ccfddl-skel' }));
    }
    else if (phase === 'error') {
        bodyEl = React.createElement('div', { className: 'ccfddl-error' }, React.createElement('div', null, '⚠ 数据加载失败'), React.createElement('div', { className: 'ccfddl-note' }, meta?.lastError ?? ''), React.createElement('button', { className: 'ccfddl-action primary', onClick: () => void doRefresh() }, '重试'));
    }
    else if (empty) {
        bodyEl = React.createElement('div', { className: 'ccfddl-empty' }, React.createElement('div', { className: 'ccfddl-empty-icon' }, '🕐'), React.createElement('div', null, '没有符合条件的会议'), React.createElement('button', { className: 'ccfddl-action', onClick: () => { setPanel(true); setTab('filter'); } }, '调整筛选'));
    }
    else {
        bodyEl = React.createElement('div', { className: 'ccfddl-list' }, rows.map(rowEl));
    }
    return React.createElement('div', { className: 'ccfddl-root' }, headerEl, bodyEl);
}
export async function apply(ctx) {
    const slots = ctx.get('slots');
    if (slots === undefined)
        return;
    // 挂载服务器数据通道;重复挂载或远端缺失时静默,组件自动降级浏览器直连。
    let remoteFetch;
    const remote = ctx.get('remote');
    if (remote !== undefined) {
        try {
            await remote.$mount(TYPERT_REMOTE);
        }
        catch {
            // already mounted (or unavailable) -> fall back to browser fetch
        }
        const channel = ctx.get('remote.ccfddl.data');
        if (channel !== undefined)
            remoteFetch = () => channel.fetchData();
    }
    ctx.effect(() => {
        const styleEl = document.createElement('style');
        styleEl.setAttribute('data-plugin', 'dsh-ccfddl');
        styleEl.textContent = CSS_TEXT;
        document.head.appendChild(styleEl);
        return () => styleEl.remove();
    });
    slots.inject('sidebar.footer.action', () => slots.register({ name: 'sidebar.footer.action', id: 'ccf-ddl', order: 0, label: () => 'CCF DDL 倒计时' }, (props) => React.createElement(CcfDdlWidget, { wide: props.wide, remoteFetch })));
}
//# sourceMappingURL=index.js.map