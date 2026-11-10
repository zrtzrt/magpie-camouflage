// daemon.mjs - 实时同步 Magpie 网关请求与历史记录
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HOME = process.env.HOME || "";

const APP_LOG_PATH = path.join(HOME, "Library/Logs/magpie/app.log");
const USAGE_JSONL_PATH = path.join(HOME, ".config/magpie/usage.jsonl");
const PLUGINS_CONFIG_PATH = path.join(HOME, ".config/magpie/plugins.json");
const PROVIDERS_STATE_PATH = path.join(HOME, ".cache/magpie/providers-state.json");
const PROVIDERS_CONFIG_PATH = path.join(HOME, ".config/magpie/providers.json");
const AGENTS_STATE_PATH = path.join(HOME, ".cache/magpie/agents-state.json");

const HISTORY_JS_PATH = path.join(__dirname, "page/history-data.js");
const REAL_PROVIDERS_JS_PATH = path.join(__dirname, "page/real-providers.js");
const REAL_CLIENTS_JS_PATH = path.join(__dirname, "page/real-clients.js");

const MAX_HISTORY = 50;

function readRoutingGroups() {
  try {
    if (fs.existsSync(PROVIDERS_CONFIG_PATH)) {
      const raw = fs.readFileSync(PROVIDERS_CONFIG_PATH, "utf8");
      const d = JSON.parse(raw);
      return d.groups || [];
    }
  } catch (e) {}
  return [];
}

function getRoutingGroupInfo(groupId) {
  if (!groupId) return null;
  const groups = readRoutingGroups();
  const g = groups.find((x) => x.id === groupId || x.name === groupId);
  if (g) return { id: g.id, name: g.name || g.id, members: g.members || [] };
  if (groupId.toLowerCase().includes("deepseek")) return { id: groupId, name: "DeepSeek-V4.1-Flash", members: [] };
  if (groupId.toLowerCase().includes("stuck")) return { id: groupId, name: "永不卡住", members: [] };
  return { id: groupId, name: groupId, members: [] };
}

function readPluginOptions() {
  try {
    if (!fs.existsSync(PLUGINS_CONFIG_PATH)) return {};
    const raw = fs.readFileSync(PLUGINS_CONFIG_PATH, "utf8");
    const json = JSON.parse(raw);
    const entry = (json.plugins || []).find((p) => p.spec && p.spec.includes("camouflage"));
    return entry?.options || {};
  } catch (e) {
    return {};
  }
}

function loadHistoryList() {
  try {
    if (!fs.existsSync(HISTORY_JS_PATH)) return [];
    const content = fs.readFileSync(HISTORY_JS_PATH, "utf8");
    const m = content.match(/window\.CAMOUFLAGE_HISTORY\s*=\s*(\[[\s\S]*\]);/);
    if (m) return JSON.parse(m[1]);
  } catch (e) {}
  return [];
}

function saveHistoryList(list) {
  try {
    const opts = readPluginOptions();
    const clearedAt = opts.historyClearedAt || 0;
    if (clearedAt) {
      list = list.filter((item) => !item.time || item.time > clearedAt);
    }
    list = list.slice(0, MAX_HISTORY);
    const content = `// 自动生成的伪装历史记录 (最新 ${list.length} 条)\nwindow.CAMOUFLAGE_HISTORY = ${JSON.stringify(list, null, 2)};\n`;
    fs.writeFileSync(HISTORY_JS_PATH, content, "utf8");
  } catch (e) {
    console.error("[Daemon] Error saving history list:", e.message);
  }
}

function resolveProviderIcon(p) {
  const iconStr = p.icon || "";
  if (iconStr.startsWith("file:")) {
    return iconStr.slice(5);
  }
  if (p.id === "antigravity" || iconStr.includes("antigravity")) return "antigravity.svg";
  if (p.id === "workbuddy" || p.id === "workbuddy-ai" || iconStr.includes("workbuddy")) return "workbuddy.svg";
  if (p.id === "ai-studio" || p.id === "gemini-web") return "ai-studio.svg";
  if (p.id === "trae-cn" || p.id === "trae-global" || iconStr.includes("trae")) return "trae.svg";
  if (p.id === "gemini" || iconStr.includes("gemini")) return "gemini.svg";
  if (p.id === "codex" || iconStr.includes("codex")) return "codex.svg";
  if (p.id === "qwenwork") return "qwenwork.png";
  if (p.id === "opencode-zen-free") return "opencode-zen-free.ico";
  if (iconStr.endsWith(".svg") || iconStr.endsWith(".png") || iconStr.endsWith(".ico") || iconStr.endsWith(".webp")) {
    return iconStr;
  }
  return (iconStr || "generic") + ".svg";
}

function syncRealProviders() {
  try {
    if (!fs.existsSync(PROVIDERS_STATE_PATH)) return;
    const raw = fs.readFileSync(PROVIDERS_STATE_PATH, "utf8");
    const state = JSON.parse(raw);
    const list = state.providers?.providers || [];
    const sanitized = list.map((p) => {
      let plan = p.account?.plan;
      if (!plan) {
        if (p.ready) {
          plan = p.account?.user ? "已登录" : "已接入";
        } else {
          plan = "未配置";
        }
      }
      return {
        id: p.id,
        name: p.name || p.id,
        icon: resolveProviderIcon(p),
        user: p.account?.user || "",
        plan: plan,
        modelsCount: Array.isArray(p.models) ? p.models.filter((m) => m.on).length : (typeof p.models === "number" ? p.models : 0),
        off: !!p.off,
        isGroup: false
      };
    });

    const fileContent = `// real-providers.js - 自动从本机 Magpie 真实配置读取\nconst REAL_PROVIDERS = ${JSON.stringify(sanitized, null, 2)};\n`;
    fs.writeFileSync(REAL_PROVIDERS_JS_PATH, fileContent, "utf8");
  } catch (e) {
    console.error("[Daemon] Error syncing real providers:", e.message);
  }
}

// 检查 usage.jsonl 增量更新
let usageLastSize = 0;
try {
  if (fs.existsSync(USAGE_JSONL_PATH)) {
    usageLastSize = fs.statSync(USAGE_JSONL_PATH).size;
  }
} catch (e) {}

function checkUsageUpdates() {
  try {
    if (!fs.existsSync(USAGE_JSONL_PATH)) return;
    const stat = fs.statSync(USAGE_JSONL_PATH);
    if (stat.size <= usageLastSize) {
      if (stat.size < usageLastSize) usageLastSize = stat.size;
      return;
    }

    const diffSize = stat.size - usageLastSize;
    const fd = fs.openSync(USAGE_JSONL_PATH, "r");
    const buffer = Buffer.alloc(diffSize);
    fs.readSync(fd, buffer, 0, diffSize, usageLastSize);
    fs.closeSync(fd);
    usageLastSize = stat.size;

    const lines = buffer.toString("utf8").split("\n").filter(Boolean);
    const opts = readPluginOptions();
    const providers = opts.providers || {};
    const clients = opts.clients || {};

    let list = loadHistoryList();
    let updated = false;

    for (const line of lines) {
      try {
        const row = JSON.parse(line.trim());
        const agent = row.agent || "default";
        const provider = row.provider || "default";
        const reqModel = row.req || row.model || "";
        const isRoutingGroup = reqModel.startsWith("group/");
        const routingGroupId = isRoutingGroup ? reqModel.slice(6) : null;
        const groupInfo = isRoutingGroup ? getRoutingGroupInfo(routingGroupId) : null;

        // 检查是否有匹配的规则配置
        const provCfg = providers[provider] || (isRoutingGroup ? (providers["group/" + routingGroupId] || providers[routingGroupId]) : null);
        const clientCfg = clients[agent];

        const tStr = row.t;
        const dt = new Date(tStr);
        const ts = dt.getTime();
        const pad = (n) => String(n).padStart(2, "0");
        const formattedTime = `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())} ${pad(dt.getHours())}:${pad(dt.getMinutes())}:${pad(dt.getSeconds())}`;
        const itemId = "req-" + (row.route_id || ts);

        // 去重匹配：同 route_id 或时间在 3.5 秒内的同客户端请求
        const existingIdx = list.findIndex(
          (h) => h.id === itemId || (Math.abs(h.time - ts) < 3500 && h.client === agent)
        );

        const hasClientRules = !!(clientCfg && clientCfg.rules && clientCfg.rules.length);
        const hasProvPrompt = !!(provCfg && provCfg.prompt && provCfg.prompt.trim());

        let status = "未触发规则 (直通)";
        if (hasClientRules && hasProvPrompt) {
          status = "双向替换成功";
        } else if (hasClientRules) {
          status = "客户端特征屏蔽成功";
        } else if (hasProvPrompt) {
          status = "供应商提示词附加成功";
        }

        const cleanRules = hasClientRules
          ? clientCfg.rules.map((r) => (typeof r === "string" ? r : r.pattern)).filter(Boolean)
          : [];
        const pattern = cleanRules[0] || "";
        const injectedPrompt = hasProvPrompt ? provCfg.prompt : "";

        const before = pattern
          ? `${pattern}\n\n[${agent.toUpperCase()} 真实调用上下文 - tokens in: ${row.in || 0}]`
          : `[${agent.toUpperCase()} 请求上下文 - tokens in: ${row.in || 0}]`;
        const after = injectedPrompt
          ? `${injectedPrompt}\n\n[${agent.toUpperCase()} 请求上下文 - tokens in: ${row.in || 0}]`
          : `[${agent.toUpperCase()} 请求上下文 - tokens in: ${row.in || 0}]`;

        const record = {
          id: itemId,
          time: ts,
          timestamp: formattedTime,
          model: reqModel || row.model || "unknown",
          servedModel: row.served || row.model || "unknown",
          provider: (provider && provider !== "group") ? provider : (groupInfo?.members?.[0] || "workbuddy"),
          client: agent,
          clientStripped: hasClientRules,
          strippedRules: cleanRules,
          providerInjected: hasProvPrompt,
          injectedInfo: hasProvPrompt ? { chars: injectedPrompt.length, length: injectedPrompt.length, position: provCfg.position || "prepend" } : null,
          status: status,
          fullBefore: before,
          fullAfter: after
        };

        if (existingIdx !== -1) {
          // 合并已有记录，优先保留真实的 fullBefore/fullAfter
          const resolvedProv = (provider && provider !== "group")
            ? provider
            : (list[existingIdx].provider !== "group" ? list[existingIdx].provider : (groupInfo?.members?.[0] || "workbuddy"));
          delete list[existingIdx].routingGroup;
          list[existingIdx] = {
            ...list[existingIdx],
            ...record,
            fullBefore: list[existingIdx].fullBefore || record.fullBefore,
            fullAfter: list[existingIdx].fullAfter || record.fullAfter,
            provider: resolvedProv
          };
          delete list[existingIdx].routingGroup;
        } else {
          list.unshift(record);
        }
        updated = true;
      } catch (err) {}
    }

    if (updated) {
      saveHistoryList(list);
    }
  } catch (e) {
    console.error("[Daemon] checkUsageUpdates error:", e.message);
  }
}

// 检查 app.log 中的 [CAMOUFLAGE_RECORD]
let logLastSize = 0;
try {
  if (fs.existsSync(APP_LOG_PATH)) {
    logLastSize = fs.statSync(APP_LOG_PATH).size;
  }
} catch (e) {}

function checkAppLogUpdates() {
  try {
    if (!fs.existsSync(APP_LOG_PATH)) return;
    const stat = fs.statSync(APP_LOG_PATH);
    if (stat.size <= logLastSize) {
      if (stat.size < logLastSize) logLastSize = stat.size;
      return;
    }

    const diffSize = stat.size - logLastSize;
    const fd = fs.openSync(APP_LOG_PATH, "r");
    const buffer = Buffer.alloc(diffSize);
    fs.readSync(fd, buffer, 0, diffSize, logLastSize);
    fs.closeSync(fd);
    logLastSize = stat.size;

    const lines = buffer.toString("utf8").split("\n");
    let list = loadHistoryList();
    let updated = false;

    for (const line of lines) {
      const idx = line.indexOf("[CAMOUFLAGE_RECORD]:");
      if (idx !== -1) {
        const jsonStr = line.slice(idx + "[CAMOUFLAGE_RECORD]:".length).trim();
        try {
          const item = JSON.parse(jsonStr);

          // 规范化 strippedRules 为纯字符串数组
          if (Array.isArray(item.strippedRules)) {
            item.strippedRules = item.strippedRules
              .map((r) => (typeof r === "string" ? r : r.pattern || r.rule || JSON.stringify(r)))
              .filter(Boolean);
          }

          // 规范化 injectedInfo
          if (item.providerInjected && item.injectedInfo) {
            const c = item.injectedInfo.chars || item.injectedInfo.length || 0;
            item.injectedInfo.chars = c;
            item.injectedInfo.length = c;
          } else {
            item.injectedInfo = null;
            item.providerInjected = false;
          }

          // 解析路由组 -> 转换为真实供应商，彻底不显示路由组
          const model = item.model || "";
          if (model.startsWith("group/") || item.provider === "group") {
            const gId = model.startsWith("group/") ? model.slice(6) : "deepseek-v4.1-flash";
            const gInfo = getRoutingGroupInfo(gId);
            if (item.provider === "group" || !item.provider) {
              item.provider = gInfo?.members?.[0] || "workbuddy";
            }
          }
          delete item.routingGroup;

          const existingIdx = list.findIndex(
            (h) => h.id === item.id || (Math.abs(h.time - item.time) < 3500 && h.client === item.client)
          );

          if (existingIdx !== -1) {
            const resolvedProvider = (item.provider && item.provider !== "group")
              ? item.provider
              : (list[existingIdx].provider !== "group" ? list[existingIdx].provider : "workbuddy");
            list[existingIdx] = {
              ...list[existingIdx],
              ...item,
              provider: resolvedProvider
            };
            delete list[existingIdx].routingGroup;
          } else {
            list.unshift(item);
          }
          updated = true;
        } catch (e) {
          console.error("[Daemon] Failed to parse CAMOUFLAGE_RECORD:", e.message);
        }
      }
    }

    if (updated) {
      saveHistoryList(list);
    }
  } catch (e) {
    console.error("[Daemon] checkAppLogUpdates error:", e.message);
  }
}

function syncRealClients() {
  try {
    if (!fs.existsSync(AGENTS_STATE_PATH)) return;
    const raw = fs.readFileSync(AGENTS_STATE_PATH, "utf8");
    const json = JSON.parse(raw);
    const agents = json?.state?.agents || [];
    if (!agents.length) return;

    const clients = agents.map((a) => {
      let desc = a.path ? `本地路径: ${a.path}` : "本机已检测到的 Agent";
      if (a.id === "dsh") desc = "DeepSeek 官方客户端与命令行助手 (dsh)";
      else if (a.id === "antigravity") desc = "Google DeepMind 反重力客户端 (IDE)";
      else if (a.id === "agy") desc = "Google DeepMind 反重力命令行工具 (agy)";
      else if (a.id === "codex") desc = "OpenAI Codex 客户端";
      else if (a.id === "workbuddy-ai" || a.id === "workbuddy") desc = "腾讯 WorkBuddy AI 桌面助手";

      return {
        id: a.id,
        name: a.name || a.id,
        desc: desc,
        icon: a.icon || (a.id + "-color"),
        path: a.path || "",
        wired: !!a.wired
      };
    });

    const content = `// real-clients.js - 本机真实检测到的 Agent 客户端 (由 Magpie agents-state 动态同步)\nwindow.REAL_CLIENTS = ${JSON.stringify(clients, null, 2)};\n`;
    fs.writeFileSync(REAL_CLIENTS_JS_PATH, content, "utf8");
  } catch (e) {
    console.error("[Daemon] Error syncing real clients:", e.message);
  }
}

console.log("[Daemon] Magpie Camouflage History Sync Daemon Started");
syncRealProviders();
syncRealClients();

setInterval(() => {
  checkAppLogUpdates();
  checkUsageUpdates();
}, 1500);

// 每 30 秒同步一次真实供应商与本机 Agent 客户端
setInterval(() => {
  syncRealProviders();
  syncRealClients();
}, 30_000);
