// index.js - Magpie Gateway Middleware: 提示词伪装与替换历史记录 (全解耦架构)

const MAX_HISTORY = 50;

/**
 * 记录一次网关替换调用历史
 */
export function recordHistory(entry, options) {
  try {
    const clearedAt = (options && options.historyClearedAt) || 0;
    if (clearedAt && entry.time && entry.time <= clearedAt) {
      return;
    }

    if (typeof console !== "undefined" && console.error) {
      console.error("[CAMOUFLAGE_RECORD]:" + JSON.stringify(entry));
    }
  } catch (err) {
    if (typeof console !== "undefined" && console.error) {
      console.error("[Camouflage History Error]:", err?.message || String(err));
    }
  }
}

function replaceLiteral(str, search, replacement) {
  if (!str || !search) return str;
  return str.split(search).join(replacement);
}

/**
 * 清洗或替换文本中的客户端特征词，并统计命中的规则
 */
function cleanClientText(text, rules, hitSet) {
  if (typeof text !== "string" || !rules || rules.length === 0) {
    return text;
  }
  let result = text;
  for (let i = 0; i < rules.length; i++) {
    const rule = rules[i];
    if (!rule || !rule.pattern || rule.enabled === false) continue;
    const replacement = rule.replacement !== undefined ? rule.replacement : "";

    if (rule.isRegex) {
      try {
        const re = new RegExp(rule.pattern, "gi");
        if (re.test(result)) {
          if (hitSet) hitSet.add(rule.pattern);
          result = result.replace(re, replacement);
        }
      } catch (err) {}
    } else {
      if (result.includes(rule.pattern)) {
        if (hitSet) hitSet.add(rule.pattern);
        result = replaceLiteral(result, rule.pattern, replacement);
      }
    }
  }
  return result;
}

/**
 * 递归清洗请求体中所有包含客户端特征的消息与系统指令
 */
function applyClientRulesToBody(body, rules) {
  if (!body || !rules || rules.length === 0) return [];
  const hitSet = new Set();

  // 1. Anthropic 格式的 system
  if (body.system) {
    if (typeof body.system === "string") {
      body.system = cleanClientText(body.system, rules, hitSet);
    } else if (Array.isArray(body.system)) {
      body.system = body.system.map(function (part) {
        if (part && typeof part.text === "string") {
          return Object.assign({}, part, { text: cleanClientText(part.text, rules, hitSet) });
        }
        return part;
      });
    }
  }

  // 2. OpenAI 格式的 messages
  if (Array.isArray(body.messages)) {
    body.messages = body.messages.map(function (msg) {
      if (!msg || !msg.content) return msg;

      if (typeof msg.content === "string") {
        return Object.assign({}, msg, { content: cleanClientText(msg.content, rules, hitSet) });
      } else if (Array.isArray(msg.content)) {
        const newContent = msg.content.map(function (part) {
          if (part && part.type === "text" && typeof part.text === "string") {
            return Object.assign({}, part, { text: cleanClientText(part.text, rules, hitSet) });
          }
          return part;
        });
        return Object.assign({}, msg, { content: newContent });
      }
      return msg;
    });
  }

  return Array.from(hitSet);
}

/**
 * 为发往目标供应商的请求附加提示词
 */
function applyProviderInjectionToBody(body, prompt, position) {
  if (!body || typeof prompt !== "string") return false;
  const injection = prompt.trim();
  if (!injection) return false;
  const pos = position || "prepend";

  // 1. Anthropic 协议
  if (body.system !== undefined) {
    if (typeof body.system === "string") {
      body.system = pos === "append" ? body.system + "\n\n" + injection : injection + "\n\n" + body.system;
    } else if (Array.isArray(body.system)) {
      const injectBlock = { type: "text", text: injection };
      if (pos === "append") {
        body.system.push(injectBlock);
      } else {
        body.system.unshift(injectBlock);
      }
    } else {
      body.system = injection;
    }
    return true;
  }
  // 2. OpenAI / Chat Completions 协议
  else if (Array.isArray(body.messages)) {
    let systemMsgIndex = -1;
    for (let j = 0; j < body.messages.length; j++) {
      if (body.messages[j] && body.messages[j].role === "system") {
        systemMsgIndex = j;
        break;
      }
    }

    if (systemMsgIndex !== -1) {
      const existingMsg = body.messages[systemMsgIndex];
      if (typeof existingMsg.content === "string") {
        existingMsg.content = pos === "append"
          ? existingMsg.content + "\n\n" + injection
          : injection + "\n\n" + existingMsg.content;
      }
    } else {
      body.messages.unshift({
        role: "system",
        content: injection,
      });
    }
    return true;
  }

  return false;
}

/**
 * 提取当前请求的 System Prompt 文本表示
 */
function extractSystemPromptText(body) {
  if (!body) return "";
  if (typeof body.system === "string") return body.system;
  if (Array.isArray(body.system)) {
    return body.system.map(p => (p && p.text) || "").join("\n");
  }
  if (Array.isArray(body.messages)) {
    const sys = body.messages.find(m => m && m.role === "system");
    if (sys) {
      if (typeof sys.content === "string") return sys.content;
      if (Array.isArray(sys.content)) {
        return sys.content.map(p => (p && p.text) || "").join("\n");
      }
    }
  }
  return "";
}

const ROUTING_GROUPS_MAP = {
  "deepseek-v4.1-flash": {
    name: "DeepSeek-V4.1-Flash",
    members: ["workbuddy", "workbuddy-ai", "trae-cn", "opencode-zen-free"]
  },
  "never-stuck": {
    name: "永不卡住",
    members: ["workbuddy", "antigravity", "workbuddy-ai", "trae-cn", "opencode-zen-free"]
  }
};

/**
 * 识别当前发起请求的客户端
 */
function identifyClient(ctx, body) {
  if (ctx && ctx.agent) return ctx.agent.toLowerCase();

  let text = extractSystemPromptText(body);
  if (Array.isArray(body?.messages) && !text) {
    text = body.messages.map(m => (typeof m.content === "string" ? m.content : "")).join(" ");
  }

  const lower = text.toLowerCase();
  if (lower.includes("deepseek harness") || lower.includes("我是dsh")) return "dsh";
  if (lower.includes("antigravity") || lower.includes("google deepmind")) return "antigravity";
  if (lower.includes("claude code") || lower.includes("claude-code")) return "claude";
  if (lower.includes("cursor") && lower.includes("editor")) return "cursor";
  if (lower.includes("cline")) return "cline";
  if (lower.includes("opencode")) return "opencode";
  if (lower.includes("github copilot")) return "copilot";
  if (lower.includes("zed")) return "zed";

  return "";
}

/**
 * 识别请求目标与路由组信息，杜绝 provider 为 "group" 的异常
 */
function identifyProviderTarget(ctx, body) {
  const model = (ctx && ctx.model) || (body && body.model) || "";
  const isRoutingGroup = model.startsWith("group/");
  const routingGroupId = isRoutingGroup ? model.slice(6) : null;
  const groupMeta = routingGroupId ? (ROUTING_GROUPS_MAP[routingGroupId] || { name: routingGroupId, members: [] }) : null;

  let directProvider = "";
  if (ctx && ctx.provider && ctx.provider.toLowerCase() !== "group") {
    directProvider = ctx.provider.toLowerCase();
  } else if (!isRoutingGroup && model.indexOf("/") !== -1) {
    directProvider = model.split("/")[0].toLowerCase();
  } else if (!isRoutingGroup) {
    directProvider = model.toLowerCase();
  }

  let effectiveProvider = directProvider;
  if (!effectiveProvider && isRoutingGroup) {
    effectiveProvider = groupMeta?.members?.[0] || routingGroupId;
  }

  return {
    isRoutingGroup,
    routingGroupId,
    routingGroupName: groupMeta ? groupMeta.name : (routingGroupId || ""),
    routingGroup: isRoutingGroup ? { id: routingGroupId, name: groupMeta?.name || routingGroupId } : null,
    groupMembers: groupMeta?.members || [],
    provider: effectiveProvider || "default",
    directProvider
  };
}

/**
 * Magpie Gateway Request Interceptor Hook (全解耦架构 + 历史追踪)
 */
export function onRequest(body, ctx) {
  if (!body) return body;
  // 必须是具备消息或系统提示词的真实网关请求，避免误触插件初始化探测
  if (!body.messages && !body.system) return body;

  try {
    const options = (ctx && ctx.options) || {};
    if (options.enabled === false) return body;

    const beforeSystem = extractSystemPromptText(body);
    let allHitRules = [];
    let injectedInfo = null;

    // -----------------------------------------------------------
    // 步骤一：客户端解耦过滤（所有客户端发出的，都去掉/替换）
    // -----------------------------------------------------------
    const clientKey = identifyClient(ctx, body);
    const clientsMap = options.clients || {};

    if (clientKey && clientsMap[clientKey] && clientsMap[clientKey].enabled) {
      const hits = applyClientRulesToBody(body, clientsMap[clientKey].rules || []);
      allHitRules = allHitRules.concat(hits);
    } else {
      for (const k in clientsMap) {
        if (clientsMap[k] && clientsMap[k].enabled && Array.isArray(clientsMap[k].rules)) {
          const hits = applyClientRulesToBody(body, clientsMap[k].rules);
          allHitRules = allHitRules.concat(hits);
        }
      }
    }

    // -----------------------------------------------------------
    // 步骤二：供应商解耦附加（所有发往该供应商的，都加上）
    // -----------------------------------------------------------
    const target = identifyProviderTarget(ctx, body);
    const providersMap = options.providers || {};

    let matchedConf = null;
    let matchedKey = null;

    // 1. 如果是路由组，优先查找路由组专属配置（如 "group/deepseek-v4.1-flash" 或 "deepseek-v4.1-flash"）
    if (target.isRoutingGroup) {
      if (providersMap["group/" + target.routingGroupId]?.enabled) {
        matchedKey = "group/" + target.routingGroupId;
        matchedConf = providersMap[matchedKey];
      } else if (providersMap[target.routingGroupId]?.enabled) {
        matchedKey = target.routingGroupId;
        matchedConf = providersMap[matchedKey];
      }
    }

    // 2. 查找直接服务提供商配置（如 "workbuddy", "antigravity"）
    if (!matchedConf && target.provider && providersMap[target.provider]?.enabled) {
      matchedKey = target.provider;
      matchedConf = providersMap[matchedKey];
    }

    // 3. 若路由组未单独配置，继承检查该路由组成员是否有已启用的提示词
    if (!matchedConf && target.isRoutingGroup && target.groupMembers.length > 0) {
      for (const memberId of target.groupMembers) {
        if (providersMap[memberId]?.enabled && providersMap[memberId]?.prompt?.trim()) {
          matchedKey = memberId;
          matchedConf = providersMap[matchedKey];
          break;
        }
      }
    }

    // 4. 全局通配符配置
    if (!matchedConf && providersMap["*"]?.enabled) {
      matchedKey = "*";
      matchedConf = providersMap["*"];
    }

    if (matchedConf && matchedConf.prompt && matchedConf.prompt.trim()) {
      const ok = applyProviderInjectionToBody(body, matchedConf.prompt, matchedConf.position);
      if (ok) {
        injectedInfo = {
          provider: matchedKey,
          chars: matchedConf.prompt.length,
          length: matchedConf.prompt.length,
          position: matchedConf.position || "prepend",
          snippet: matchedConf.prompt.slice(0, 100) + (matchedConf.prompt.length > 100 ? "..." : "")
        };
      }
    }

    const afterSystem = extractSystemPromptText(body);

    // -----------------------------------------------------------
    // 步骤三：记录替换历史，供页面查看是否替换成功
    // -----------------------------------------------------------
    const clientStripped = allHitRules.length > 0;
    const providerInjected = !!injectedInfo;

    let status = "未触发规则 (直通)";
    if (clientStripped && providerInjected) {
      status = "双向替换成功";
    } else if (clientStripped) {
      status = "客户端特征屏蔽成功";
    } else if (providerInjected) {
      status = "供应商提示词附加成功";
    }

    const now = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    const formattedTime = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;

    const historyItem = {
      id: "req-" + Date.now() + "-" + Math.random().toString(36).slice(2, 6),
      time: Date.now(),
      timestamp: formattedTime,
      model: (ctx && ctx.model) || (body && body.model) || "unknown",
      provider: target.provider !== "group" ? target.provider : (target.groupMembers[0] || "workbuddy"),
      client: clientKey || (ctx && ctx.agent) || "default",
      clientStripped: clientStripped,
      strippedRules: allHitRules,
      providerInjected: providerInjected,
      injectedInfo: injectedInfo,
      status: status,
      fullBefore: beforeSystem,
      fullAfter: afterSystem
    };

    recordHistory(historyItem, options);

  } catch (err) {
    if (typeof console !== "undefined" && console.error) {
      console.error("[Camouflage Middleware Error]:", err);
    }
  }

  return body;
}

export default {
  id: "camouflage",
  server: () => ({})
};
