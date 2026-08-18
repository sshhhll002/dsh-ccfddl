/**
 * CCF DDL 组件的纯数据层:YAML 解析、截稿时刻换算、行派生与拉取。
 * 无 DOM/React 依赖,可在 Node 下独立测试。
 * @module @deepseek-ai/dsh-ccfddl/client/data
 */
export const DAY_MS = 86400000;
export const HOUR_MS = 3600000;
export const SOURCE_URLS = [
    'https://ccfddl.com/conference/allconf.yml',
    'http://ccfddl.com/conference/allconf.yml',
];
// ------------------------------------------------------------------ YAML
/** Timezone offset table in minutes (conference-side fixed offsets). */
const TZ_OFFSET = { AoE: -720, PT: -480, UTC: 0, 'UTC+0': 0 };
for (let n = -14; n <= 14; n++) {
    const label = 'UTC' + (n === 0 ? '' : (n > 0 ? '+' + n : String(n)));
    TZ_OFFSET[label] = n * 60;
}
function stripInlineComment(line) {
    let quote = null;
    for (let i = 0; i < line.length; i++) {
        const ch = line.charAt(i);
        if (ch === "'" || ch === '"') {
            if (quote === ch)
                quote = null;
            else if (quote === null)
                quote = ch;
        }
        else if (ch === '#' && quote === null && i > 0 && (line.charAt(i - 1) === ' ' || line.charAt(i - 1) === '\t')) {
            return line.slice(0, i);
        }
    }
    return line;
}
function parseScalar(raw) {
    const s = raw.trim();
    if (s === '' || s === '~' || s === 'null' || s === 'Null' || s === 'NULL')
        return null;
    if (s === 'true' || s === 'True' || s === 'TRUE')
        return true;
    if (s === 'false' || s === 'False' || s === 'FALSE')
        return false;
    if (s.length >= 2 && s.charAt(0) === "'" && s.charAt(s.length - 1) === "'")
        return s.slice(1, -1).split("''").join("'");
    if (s.length >= 2 && s.charAt(0) === '"' && s.charAt(s.length - 1) === '"') {
        let out = '';
        const inner = s.slice(1, -1);
        for (let i = 0; i < inner.length; i++) {
            const c = inner.charAt(i);
            if (c === '\\' && i + 1 < inner.length) {
                const n = inner.charAt(i + 1);
                if (n === 'n')
                    out += '\n';
                else if (n === 't')
                    out += '\t';
                else if (n === '"')
                    out += '"';
                else if (n === '\\')
                    out += '\\';
                else
                    out += n;
                i += 1;
            }
            else
                out += c;
        }
        return out;
    }
    let isNum = true;
    let sawDigit = false;
    for (let i = 0; i < s.length; i++) {
        const c = s.charAt(i);
        const code = s.charCodeAt(i);
        const isDigit = code >= 48 && code <= 57;
        if (isDigit)
            sawDigit = true;
        if (i === 0 && (c === '-' || c === '+'))
            continue;
        if (!isDigit && c !== '.') {
            isNum = false;
            break;
        }
    }
    if (isNum && sawDigit && s.indexOf('.') === -1)
        return parseInt(s, 10);
    if (isNum && sawDigit)
        return parseFloat(s);
    return s;
}
function findKeyColon(s) {
    const ci = s.indexOf(':');
    if (ci <= 0)
        return -1;
    const key = s.slice(0, ci);
    if (key.indexOf(' ') >= 0 || key.indexOf('\t') >= 0)
        return -1;
    return ci;
}
/** Minimal YAML subset parser validated against ccfddl 的 allconf.yml 结构。 */
export function parseYaml(text) {
    const rawLines = text.split('\n');
    const lines = [];
    for (const raw of rawLines) {
        let l = raw;
        if (l.length > 0 && l.charCodeAt(l.length - 1) === 13)
            l = l.slice(0, -1);
        if (l.charCodeAt(0) === 65279)
            l = l.slice(1);
        lines.push(l);
    }
    const root = { indent: -1, kind: 'root', node: [] };
    const stack = [root];
    const popForItem = (L) => {
        while (stack.length > 1) {
            const top = stack[stack.length - 1];
            if (top.indent > L || (top.indent === L && top.kind === 'seqItemMap'))
                stack.pop();
            else
                break;
        }
    };
    const popForKey = (L) => {
        while (stack.length > 1 && stack[stack.length - 1].indent > L)
            stack.pop();
        const top = stack[stack.length - 1];
        if (top !== root && top.kind === 'mapValue' && top.indent === L)
            stack.pop();
    };
    for (let i = 0; i < lines.length; i++) {
        const line = stripInlineComment(lines[i]);
        if (line.trim() === '')
            continue;
        let indent = 0;
        while (indent < line.length && line.charAt(indent) === ' ')
            indent++;
        const content = line.slice(indent).trim();
        if (content.slice(0, 2) === '- ') {
            popForItem(indent);
            const top = stack[stack.length - 1];
            if (!Array.isArray(top.node))
                continue;
            const rest = content.slice(2);
            const ci = findKeyColon(rest);
            if (ci >= 0) {
                const obj = {};
                top.node.push(obj);
                const key = rest.slice(0, ci).trim();
                const rawVal = rest.slice(ci + 1).trim();
                if (rawVal !== '')
                    obj[key] = parseScalar(rawVal);
                stack.push({ indent: indent + 2, kind: 'seqItemMap', node: obj });
            }
            else {
                top.node.push(parseScalar(rest));
            }
        }
        else {
            popForKey(indent);
            const top = stack[stack.length - 1];
            if (top === null || typeof top.node !== 'object' || top.node === null || Array.isArray(top.node))
                continue;
            const ci = findKeyColon(content);
            if (ci < 0)
                continue;
            const key = content.slice(0, ci).trim();
            const rawVal = content.slice(ci + 1).trim();
            const map = top.node;
            if (rawVal !== '') {
                map[key] = parseScalar(rawVal);
                continue;
            }
            let j = i + 1;
            let next = null;
            while (j < lines.length) {
                const t = stripInlineComment(lines[j]).trim();
                if (t !== '') {
                    next = t;
                    break;
                }
                j++;
            }
            let val = null;
            if (next !== null) {
                let nIndent = 0;
                while (nIndent < lines[j].length && lines[j].charAt(nIndent) === ' ')
                    nIndent++;
                if (next.slice(0, 2) === '- ' && nIndent >= indent)
                    val = [];
                else if (nIndent > indent)
                    val = {};
            }
            map[key] = val;
            if (val !== null && typeof val === 'object')
                stack.push({ indent, kind: 'mapValue', node: val });
        }
    }
    return root.node;
}
// -------------------------------------------------------------- data layer
export function parseDeadlineEpoch(text, tz) {
    const s = text.trim();
    const sp = s.indexOf(' ');
    const datePart = sp >= 0 ? s.slice(0, sp) : s;
    const timePart = sp >= 0 ? s.slice(sp + 1).trim() : '00:00:00';
    const d = datePart.split('-');
    const t = timePart.split(':');
    if (d.length !== 3 || t.length !== 3)
        return null;
    const y = Number(d[0]);
    const mo = Number(d[1]);
    const day = Number(d[2]);
    const h = Number(t[0]);
    const mi = Number(t[1]);
    const sec = Number(t[2]);
    if (!isFinite(y) || !isFinite(mo) || !isFinite(day) || !isFinite(h) || !isFinite(mi) || !isFinite(sec))
        return null;
    const offset = TZ_OFFSET[tz.trim()] ?? 0;
    return Date.UTC(y, mo - 1, day, h, mi, sec) - offset * 60000;
}
/** 一行记录当前要倒计时的目标时刻(毫秒);无未来截稿时返回 0。 */
export function targetOf(r, now) {
    if (r.next.abstractEpochMs !== null && r.next.abstractEpochMs > now)
        return r.next.abstractEpochMs;
    return r.next.paperEpochMs ?? 0;
}
export function derive(corpus, settings, now) {
    const catalog = corpus.map((c) => {
        const conf = c;
        const rank = conf.rank;
        return {
            title: typeof conf.title === 'string' ? conf.title : String(conf.title),
            sub: typeof conf.sub === 'string' ? conf.sub : '',
            rank: rank?.ccf ?? 'N',
        };
    });
    const tracked = settings.tracked ?? catalog.filter((c) => c.rank === 'A').map((c) => c.title);
    const rows = [];
    for (const c of corpus) {
        const conf = c;
        if (tracked.indexOf(conf.title) < 0)
            continue;
        const ccfRank = conf.rank?.ccf ?? 'N';
        if (settings.rankAllow.length > 0 && settings.rankAllow.indexOf(ccfRank) < 0)
            continue;
        let next = null;
        let lastPast = null;
        let lastPastKey = -1;
        const confs = Array.isArray(conf.confs) ? conf.confs : [];
        for (const entry of confs) {
            const tz = typeof entry.timezone === 'string' ? entry.timezone : 'UTC';
            const year = typeof entry.year === 'number' ? entry.year : Number(entry.year ?? 0);
            const link = typeof entry.link === 'string' ? entry.link : '';
            const date = typeof entry.date === 'string' ? entry.date : '';
            const place = typeof entry.place === 'string' ? entry.place : '';
            const timelines = Array.isArray(entry.timeline) ? entry.timeline : [];
            for (const tl of timelines) {
                const paperEpoch = typeof tl.deadline === 'string' ? parseDeadlineEpoch(tl.deadline, tz) : null;
                const absEpoch = typeof tl.abstract_deadline === 'string' ? parseDeadlineEpoch(tl.abstract_deadline, tz) : null;
                if (paperEpoch === null && absEpoch === null)
                    continue;
                const cand = {
                    year, link, timezone: tz, date, place,
                    abstractEpochMs: absEpoch, abstractText: typeof tl.abstract_deadline === 'string' ? tl.abstract_deadline : null,
                    paperEpochMs: paperEpoch, paperText: typeof tl.deadline === 'string' ? tl.deadline : null,
                };
                const futureAbs = absEpoch !== null && absEpoch > now;
                const futurePaper = paperEpoch !== null && paperEpoch > now;
                if (futureAbs || futurePaper) {
                    const key = futureAbs ? absEpoch : paperEpoch;
                    let nextKey = null;
                    if (next !== null)
                        nextKey = next.abstractEpochMs !== null && next.abstractEpochMs > now ? next.abstractEpochMs : next.paperEpochMs;
                    if (next === null || (nextKey !== null && key < nextKey))
                        next = cand;
                }
                else {
                    const pastKey = Math.max(absEpoch ?? -1, paperEpoch ?? -1);
                    if (pastKey > lastPastKey) {
                        lastPastKey = pastKey;
                        lastPast = cand;
                    }
                }
            }
        }
        const base = {
            title: conf.title,
            description: typeof conf.description === 'string' ? conf.description : '',
            sub: typeof conf.sub === 'string' ? conf.sub : '',
            rank: {
                ccf: ccfRank,
                core: conf.rank?.core ?? null,
                thcpl: conf.rank?.thcpl ?? null,
            },
        };
        if (next !== null)
            rows.push({ ...base, next, past: false });
        else if (settings.showPast && lastPast !== null)
            rows.push({ ...base, next: lastPast, past: true });
    }
    const pastLast = (a, b) => (a.past === b.past ? 0 : a.past ? 1 : -1);
    const visible = settings.windowDays > 0
        ? rows.filter((r) => targetOf(r, now) - now <= settings.windowDays * DAY_MS)
        : rows;
    if (settings.sortBy === 'rank') {
        const order = { A: 0, B: 1, C: 2, N: 3 };
        visible.sort((a, b) => pastLast(a, b) || (order[a.rank.ccf] ?? 3) - (order[b.rank.ccf] ?? 3) || targetOf(a, now) - targetOf(b, now));
    }
    else if (settings.sortBy === 'title') {
        visible.sort((a, b) => pastLast(a, b) || a.title.localeCompare(b.title));
    }
    else {
        visible.sort((a, b) => pastLast(a, b) || targetOf(a, now) - targetOf(b, now));
    }
    return { rows: visible, catalog };
}
/** 拉取一个数据源;成功返回正文,失败返回可读原因。旧浏览器没有 AbortSignal.timeout 时不做超时控制。 */
export async function fetchText(url) {
    try {
        const signal = typeof AbortSignal.timeout === 'function' ? AbortSignal.timeout(30000) : undefined;
        const res = await fetch(url, signal === undefined ? undefined : { signal });
        if (!res.ok)
            return { error: 'HTTP ' + res.status };
        const text = await res.text();
        return text.length > 100 ? { text } : { error: '响应体过短' };
    }
    catch (err) {
        return { error: err instanceof Error ? err.message : String(err) };
    }
}
//# sourceMappingURL=data.js.map