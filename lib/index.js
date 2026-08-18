import { Remote, TypertRemoteService } from "@deepseek-ai/dsh-typert-protocol";
//#region lib/types/index.js
var __runInitializers = function(thisArg, initializers, value) {
	var useValue = arguments.length > 2;
	for (var i = 0; i < initializers.length; i++) value = useValue ? initializers[i].call(thisArg, value) : initializers[i].call(thisArg);
	return useValue ? value : void 0;
};
var __esDecorate = function(ctor, descriptorIn, decorators, contextIn, initializers, extraInitializers) {
	function accept(f) {
		if (f !== void 0 && typeof f !== "function") throw new TypeError("Function expected");
		return f;
	}
	var kind = contextIn.kind, key = kind === "getter" ? "get" : kind === "setter" ? "set" : "value";
	var target = !descriptorIn && ctor ? contextIn["static"] ? ctor : ctor.prototype : null;
	var descriptor = descriptorIn || (target ? Object.getOwnPropertyDescriptor(target, contextIn.name) : {});
	var _, done = false;
	for (var i = decorators.length - 1; i >= 0; i--) {
		var context = {};
		for (var p in contextIn) context[p] = p === "access" ? {} : contextIn[p];
		for (var p in contextIn.access) context.access[p] = contextIn.access[p];
		context.addInitializer = function(f) {
			if (done) throw new TypeError("Cannot add initializers after decoration has completed");
			extraInitializers.push(accept(f || null));
		};
		var result = (0, decorators[i])(kind === "accessor" ? {
			get: descriptor.get,
			set: descriptor.set
		} : descriptor[key], context);
		if (kind === "accessor") {
			if (result === void 0) continue;
			if (result === null || typeof result !== "object") throw new TypeError("Object expected");
			if (_ = accept(result.get)) descriptor.get = _;
			if (_ = accept(result.set)) descriptor.set = _;
			if (_ = accept(result.init)) initializers.unshift(_);
		} else if (_ = accept(result)) if (kind === "field") initializers.unshift(_);
		else descriptor[key] = _;
	}
	if (target) Object.defineProperty(target, contextIn.name, descriptor);
	done = true;
};
const SOURCE_URLS = ["https://ccfddl.com/conference/allconf.yml", "http://ccfddl.com/conference/allconf.yml"];
/** 短 TTL 内存缓存:多标签页/手动刷新在窗口期内不重复出网。 */
const CACHE_TTL_MS = 5 * 6e4;
/**
* 依次尝试各数据源;成功返回正文与来源,全部失败返回各源的可读原因。
* fetcher 可注入,便于测试与复用浏览器侧的同一逻辑形状。
*/
async function fetchCorpus(urls, fetcher) {
	const failures = [];
	for (const url of urls) try {
		const signal = typeof AbortSignal.timeout === "function" ? AbortSignal.timeout(3e4) : void 0;
		const response = await fetcher(url, signal === void 0 ? void 0 : { signal });
		if (!response.ok) {
			failures.push(`${url} → HTTP ${response.status}`);
			continue;
		}
		const text = await response.text();
		if (text.length > 100) return {
			ok: true,
			source: url,
			error: "",
			text
		};
		failures.push(`${url} → 响应体过短`);
	} catch (error) {
		failures.push(`${url} → ${error instanceof Error ? error.message : String(error)}`);
	}
	return {
		ok: false,
		source: "",
		error: failures.join("; "),
		text: ""
	};
}
/**
* 服务器端数据通道:浏览器经连接 API 调用 {@link CcfddlData.fetchData},
* 语料只在本进程与页面之间流动,页面无需自行访问外网。
*/
let CcfddlData = (() => {
	let _classSuper = TypertRemoteService;
	let _instanceExtraInitializers = [];
	let _fetchData_decorators;
	return class CcfddlData extends _classSuper {
		static {
			const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(_classSuper[Symbol.metadata] ?? null) : void 0;
			_fetchData_decorators = [Remote];
			__esDecorate(this, null, _fetchData_decorators, {
				kind: "method",
				name: "fetchData",
				static: false,
				private: false,
				access: {
					has: (obj) => "fetchData" in obj,
					get: (obj) => obj.fetchData
				},
				metadata: _metadata
			}, null, _instanceExtraInitializers);
			if (_metadata) Object.defineProperty(this, Symbol.metadata, {
				enumerable: true,
				configurable: true,
				writable: true,
				value: _metadata
			});
		}
		cache = (__runInitializers(this, _instanceExtraInitializers), null);
		constructor(ctx) {
			super(ctx, "ccfddl.data");
		}
		/**
		* 用服务器自身的网络栈拉取 ccfddl 合并语料。
		* @returns 成功携带 YAML 文本;全部失败时携带各源的可读原因。
		*/
		async fetchData() {
			const cached = this.cache;
			if (cached !== null && Date.now() - cached.at < CACHE_TTL_MS) return {
				ok: true,
				source: cached.source,
				error: "",
				text: cached.text
			};
			const result = await fetchCorpus(SOURCE_URLS, fetch);
			if (result.ok) this.cache = {
				text: result.text,
				source: result.source,
				at: Date.now()
			};
			return result;
		}
	};
})();
//#endregion
export { CcfddlData, CcfddlData as default, fetchCorpus };
