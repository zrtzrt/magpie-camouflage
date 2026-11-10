// app.js - 伪装 (Camouflage) 前端逻辑

(async () => {
  const $ = (id) => document.getElementById(id);

  // 1. 状态管理
  let options = {
    enabled: true,
    providers: {},
    clients: {}
  };

  const DEFAULT_CLIENTS = [
    {
      id: "dsh",
      name: "DeepSeek Harness",
      desc: "DeepSeek 官方客户端与命令行助手 (dsh)",
      icon: "deepseek-color"
    },
    {
      id: "antigravity",
      name: "Antigravity",
      desc: "Google DeepMind 反重力客户端 (IDE)",
      icon: "antigravity-color"
    },
    {
      id: "agy",
      name: "Antigravity CLI",
      desc: "Google DeepMind 反重力命令行工具 (agy)",
      icon: "antigravity-color"
    },
    {
      id: "codex",
      name: "Codex",
      desc: "OpenAI Codex 客户端",
      icon: "codex-color"
    },
    {
      id: "workbuddy-ai",
      name: "WorkBuddy AI",
      desc: "腾讯 WorkBuddy AI 桌面助手",
      icon: "workbuddy-color"
    }
  ];

  let providersList = (window.REAL_PROVIDERS && window.REAL_PROVIDERS.length) ? [...window.REAL_PROVIDERS] : [];
  let clientsList = (window.REAL_CLIENTS && window.REAL_CLIENTS.length) ? [...window.REAL_CLIENTS] : [...DEFAULT_CLIENTS];
  let sessionsList = (window.REAL_SESSIONS && window.REAL_SESSIONS.length) ? [...window.REAL_SESSIONS] : [];
  let historyList = (window.CAMOUFLAGE_HISTORY && window.CAMOUFLAGE_HISTORY.length) ? [...window.CAMOUFLAGE_HISTORY] : [];

  function renderIcon(key, fallbackIcon) {
    if (typeof window.getIconSvg === "function") {
      return window.getIconSvg(key, fallbackIcon);
    }
    return `<svg viewBox="0 0 24 24" width="22" height="22" fill="#888"><circle cx="12" cy="12" r="8"/></svg>`;
  }

  let isAccountMasked = true;
  let providerSearchQuery = "";
  let clientSearchQuery = "";
  let historySearchQuery = "";
  let historyFilterStatus = "all";

  let activeProviderId = null;
  let activeClientId = null;
  let activeHistoryRecord = null;
  let historyPromptMode = "after"; // "after" or "before"
  let clientTempRules = [];

  // Toast 提示
  let toastTimer = null;
  function showToast(msg) {
    const t = $("toast");
    if (!t) return;
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, 2000);
  }

  // 账号打码算法
  function formatAccount(user) {
    if (!user) return "";
    if (!isAccountMasked) return user;
    if (user.includes("@")) {
      const parts = user.split("@");
      const name = parts[0];
      const domain = parts[1];
      const maskedName = name.length <= 3 ? name[0] + "***" : name.slice(0, 3) + "***";
      return `${maskedName}@${domain}`;
    }
    if (user.startsWith("用户") && user.length > 6) {
      return `用户***${user.slice(-5)}`;
    }
    if (user.length > 2) {
      return `${user[0]}*${user.slice(-1)}`;
    }
    if (user.length === 2) {
      return `${user[0]}*`;
    }
    return user;
  }

  // 保存配置至 Magpie 宿主并同步
  async function saveOptions(toastMsg) {
    if (globalThis.magpie && magpie.options && magpie.options.set) {
      try {
        const saved = await magpie.options.set(options);
        if (saved && typeof saved === "object") {
          options = saved;
        }
      } catch (e) {
        console.error("[Camouflage] Save options error:", e);
      }
    }
    renderAll();
    if (toastMsg) showToast(toastMsg);
  }

  // 2. 初始化 Magpie Bridge 通信
  if (globalThis.magpie) {
    try {
      const theme = await magpie.ready;
      if (theme && theme.dark !== undefined) {
        document.documentElement.dataset.theme = theme.dark ? "dark" : "light";
      }
      if (magpie.onTheme) {
        magpie.onTheme((t) => {
          document.documentElement.dataset.theme = t.dark ? "dark" : "light";
        });
      }

      // 获取当前插件已保存的配置
      if (magpie.options && magpie.options.get) {
        try {
          const savedOpts = await magpie.options.get();
          if (savedOpts && typeof savedOpts === "object") {
            options = {
              enabled: savedOpts.enabled !== false,
              providers: savedOpts.providers || {},
              clients: savedOpts.clients || {}
            };
          }
        } catch (e) {
          console.warn("[Camouflage] Failed to get options:", e);
        }
      }

      // 动态读取 Magpie 已配置的真实供应商名称（参考官方权限机制）
      if (magpie.read) {
        try {
          const realList = await magpie.read("providers:list");
          if (Array.isArray(realList)) {
            realList.forEach(p => {
              if (p && p.id && !providersList.some(item => item.id === p.id)) {
                providersList.push({
                  id: p.id,
                  name: p.name || p.id,
                  icon: "generic.svg",
                  user: p.user || "",
                  plan: "已接入",
                  modelsCount: p.models?.length || 0,
                  off: false
                });
              }
            });
          }
        } catch (e) {
          console.warn("[Camouflage] read providers:list error:", e);
        }
      }
    } catch (e) {
      console.error("[Camouflage] Magpie bridge initialization error:", e);
    }
  }

  // 3. 渲染页面逻辑
  function renderAll() {
    renderMasterSwitch();
    renderRulesOverview();
    renderProvidersList();
    renderClientsList();
    renderHistoryList();
  }

  // 渲染总开关
  function renderMasterSwitch() {
    const sw = $("master-switch");
    if (!sw) return;
    const on = options.enabled !== false;
    sw.classList.toggle("on", on);
    sw.setAttribute("aria-checked", on ? "true" : "false");
  }

  // 渲染 规则概览 标签页
  function renderRulesOverview() {
    const provContainer = $("active-provider-rules");
    const provEmpty = $("empty-provider-rules");
    const provCountBadge = $("provider-rules-count");

    const clientContainer = $("active-client-rules");
    const clientEmpty = $("empty-client-rules");
    const clientCountBadge = $("client-rules-count");

    // 供应商生效规则
    provContainer.innerHTML = "";
    const activeProvEntries = Object.entries(options.providers || {}).filter(([_, cfg]) => cfg && cfg.enabled && cfg.prompt);
    provCountBadge.textContent = `${activeProvEntries.length} 项启用`;

    if (activeProvEntries.length === 0) {
      provEmpty.hidden = false;
    } else {
      provEmpty.hidden = true;
      activeProvEntries.forEach(([pid, cfg]) => {
        const prov = providersList.find(p => p.id === pid) || { id: pid, name: pid, icon: "generic.svg" };
        const card = document.createElement("div");
        card.className = "rule-card";

        const posText = cfg.position === "append" ? "请求尾部" : "请求头部";
        card.innerHTML = `
          <div class="rule-card-header">
            <div class="rule-card-target">
              <div class="ag-handle pv-handle">
                ${renderIcon(prov.id, prov.icon)}
              </div>
              <span>${prov.name}</span>
            </div>
            <button type="button" class="lib-switch pswitch on" role="switch" aria-checked="true" data-pid="${pid}">
              <i></i>
            </button>
          </div>
          <div class="rule-card-snippet">${escapeHtml(cfg.prompt)}</div>
          <div class="rule-card-footer">
            <span>注入位置: <b>${posText}</b> · ${cfg.prompt.length} 字符</span>
            <div class="rule-card-actions">
              <button type="button" class="text" data-edit-pid="${pid}">编辑</button>
              <button type="button" class="text danger" data-clear-pid="${pid}">清空</button>
            </div>
          </div>
        `;

        card.querySelector(".lib-switch").addEventListener("click", (e) => {
          e.stopPropagation();
          cfg.enabled = !cfg.enabled;
          saveOptions(`已${cfg.enabled ? '启用' : '禁用'} ${prov.name} 伪装`);
        });

        card.querySelector("[data-edit-pid]").addEventListener("click", () => {
          openProviderModal(pid);
        });

        card.querySelector("[data-clear-pid]").addEventListener("click", () => {
          delete options.providers[pid];
          saveOptions(`已清空 ${prov.name} 附加规则`);
        });

        provContainer.appendChild(card);
      });
    }

    // 客户端生效规则
    clientContainer.innerHTML = "";
    const activeClientEntries = Object.entries(options.clients || {}).filter(([_, cfg]) => cfg && cfg.enabled && Array.isArray(cfg.rules) && cfg.rules.some(r => r.enabled && r.pattern));
    clientCountBadge.textContent = `${activeClientEntries.length} 项启用`;

    if (activeClientEntries.length === 0) {
      clientEmpty.hidden = false;
    } else {
      clientEmpty.hidden = true;
      activeClientEntries.forEach(([cid, cfg]) => {
        const client = clientsList.find(c => c.id === cid) || { id: cid, name: cid, icon: "generic.svg" };
        const enabledRules = cfg.rules.filter(r => r.enabled && r.pattern);
        const card = document.createElement("div");
        card.className = "rule-card";

        const snippets = enabledRules.map(r => `• 抹除「${escapeHtml(r.pattern)}」${r.replacement ? ` 替换为「${escapeHtml(r.replacement)}」` : ''}`).join("\n");

        card.innerHTML = `
          <div class="rule-card-header">
            <div class="rule-card-target">
              <div class="ag-handle pv-handle">
                ${renderIcon(client.id, client.icon)}
              </div>
              <span>${client.name}</span>
            </div>
            <button type="button" class="lib-switch pswitch on" role="switch" aria-checked="true" data-cid="${cid}">
              <i></i>
            </button>
          </div>
          <div class="rule-card-snippet">${snippets}</div>
          <div class="rule-card-footer">
            <span>已启用 <b>${enabledRules.length}</b> 条过滤特征</span>
            <div class="rule-card-actions">
              <button type="button" class="text" data-edit-cid="${cid}">编辑</button>
              <button type="button" class="text danger" data-clear-cid="${cid}">清空</button>
            </div>
          </div>
        `;

        card.querySelector(".lib-switch").addEventListener("click", (e) => {
          e.stopPropagation();
          cfg.enabled = !cfg.enabled;
          saveOptions(`已${cfg.enabled ? '启用' : '禁用'} ${client.name} 屏蔽`);
        });

        card.querySelector("[data-edit-cid]").addEventListener("click", () => {
          openClientModal(cid);
        });

        card.querySelector("[data-clear-cid]").addEventListener("click", () => {
          delete options.clients[cid];
          saveOptions(`已清空 ${client.name} 屏蔽规则`);
        });

        clientContainer.appendChild(card);
      });
    }
  }

  // 渲染 供应商列表 标签页 (严格遵循官方样式)
  function renderProvidersList() {
    const list = $("providersList");
    const noMatch = $("no-provider-match");
    list.innerHTML = "";

    const q = providerSearchQuery.toLowerCase();
    const filtered = providersList.filter(p => {
      if (!q) return true;
      return (p.name && p.name.toLowerCase().includes(q)) ||
             (p.id && p.id.toLowerCase().includes(q)) ||
             (p.user && p.user.toLowerCase().includes(q)) ||
             (p.plan && p.plan.toLowerCase().includes(q));
    });

    if (filtered.length === 0) {
      noMatch.hidden = false;
      return;
    }
    noMatch.hidden = true;

    filtered.forEach(p => {
      const cfg = options.providers[p.id] || { enabled: false, prompt: "", position: "prepend" };
      const isConfigured = !!(cfg.prompt && cfg.prompt.trim());
      const isOn = isConfigured && cfg.enabled;

      const row = document.createElement("div");
      row.className = `row provider ${!isOn ? "off" : ""}`;
      row.dataset.id = p.id;

      // 状态标签
      let planTagHtml = "";
      if (isConfigured) {
        planTagHtml = `<span class="key acct acct-plan configured"><span class="dot"></span> 已附加提示词 (${cfg.prompt.length}字)</span>`;
      } else if (p.plan) {
        planTagHtml = `<span class="key acct acct-plan"><span class="dot"></span> ${escapeHtml(p.plan)}</span>`;
      } else {
        planTagHtml = `<span class="key acct acct-plan none"><span class="dot"></span> 未配置</span>`;
      }

      // 副标题
      const userText = p.user ? `已登录 ${formatAccount(p.user)} · ` : "";
      const modelsText = p.modelsCount ? `${p.modelsCount} 个模型` : "已接入渠道";
      const subText = `${userText}${modelsText}`;

      row.innerHTML = `
        <div class="ag-handle pv-handle">
          ${renderIcon(p.id, p.icon)}
        </div>
        <div class="who">
          <div class="name">${escapeHtml(p.name)}</div>
          <div class="sub">${escapeHtml(subText)}</div>
        </div>
        ${planTagHtml}
        <button type="button" class="lib-switch pswitch ${isOn ? "on" : ""}" role="switch" aria-checked="${isOn ? "true" : "false"}" aria-label="切换 ${p.name} 伪装">
          <i></i>
        </button>
        <span class="chev">
          <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="6 3 11 8 6 13"></polyline>
          </svg>
        </span>
      `;

      row.addEventListener("click", () => {
        openProviderModal(p.id);
      });

      const sw = row.querySelector(".lib-switch");
      sw.addEventListener("click", (e) => {
        e.stopPropagation();
        if (!options.providers[p.id]) {
          options.providers[p.id] = { enabled: false, prompt: "", position: "prepend" };
        }
        if (!options.providers[p.id].prompt) {
          openProviderModal(p.id);
          showToast(`请先配置「${p.name}」的附加提示词`);
          return;
        }
        options.providers[p.id].enabled = !options.providers[p.id].enabled;
        saveOptions(`已${options.providers[p.id].enabled ? '启用' : '禁用'} ${p.name} 伪装`);
      });

      list.appendChild(row);
    });
  }

  // 渲染 客户端列表 标签页
  function renderClientsList() {
    const list = $("clientsList");
    const noMatch = $("no-client-match");
    list.innerHTML = "";

    const q = clientSearchQuery.toLowerCase();
    const filtered = clientsList.filter(c => {
      if (!q) return true;
      return (c.name && c.name.toLowerCase().includes(q)) ||
             (c.id && c.id.toLowerCase().includes(q)) ||
             (c.desc && c.desc.toLowerCase().includes(q));
    });

    if (filtered.length === 0) {
      noMatch.hidden = false;
      return;
    }
    noMatch.hidden = true;

    filtered.forEach(c => {
      const cfg = options.clients[c.id] || { enabled: false, rules: [] };
      const hasRules = Array.isArray(cfg.rules) && cfg.rules.some(r => r.enabled && r.pattern);
      const isOn = hasRules && cfg.enabled;

      const row = document.createElement("div");
      row.className = `row provider ${!isOn ? "off" : ""}`;
      row.dataset.id = c.id;

      let tagHtml = "";
      if (hasRules) {
        const count = cfg.rules.filter(r => r.enabled && r.pattern).length;
        tagHtml = `<span class="key acct acct-plan configured"><span class="dot"></span> 已配置 ${count} 条屏蔽规则</span>`;
      } else {
        tagHtml = `<span class="key acct acct-plan none"><span class="dot"></span> 未配置屏蔽</span>`;
      }

      row.innerHTML = `
        <div class="ag-handle pv-handle">
          ${renderIcon(c.id, c.icon)}
        </div>
        <div class="who">
          <div class="name">${escapeHtml(c.name)}</div>
          <div class="sub">${escapeHtml(c.desc || "客户端特征过滤渠道")}</div>
        </div>
        ${tagHtml}
        <button type="button" class="lib-switch pswitch ${isOn ? "on" : ""}" role="switch" aria-checked="${isOn ? "true" : "false"}" aria-label="切换 ${c.name} 屏蔽">
          <i></i>
        </button>
        <span class="chev">
          <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="6 3 11 8 6 13"></polyline>
          </svg>
        </span>
      `;

      row.addEventListener("click", () => {
        openClientModal(c.id);
      });

      const sw = row.querySelector(".lib-switch");
      sw.addEventListener("click", (e) => {
        e.stopPropagation();
        if (!options.clients[c.id]) {
          options.clients[c.id] = { enabled: false, rules: [] };
        }
        if (!hasRules) {
          openClientModal(c.id);
          showToast(`请先为「${c.name}」添加屏蔽规则`);
          return;
        }
        options.clients[c.id].enabled = !options.clients[c.id].enabled;
        saveOptions(`已${options.clients[c.id].enabled ? '启用' : '禁用'} ${c.name} 屏蔽`);
      });

      list.appendChild(row);
    });
  }

  // 渲染 历史记录 标签页 (新增：查看是否替换成功)
  function renderHistoryList() {
    const list = $("historyList");
    const emptyState = $("empty-history");
    if (!list) return;

    list.innerHTML = "";

    const q = historySearchQuery.toLowerCase();
    const filter = historyFilterStatus;
    const clearedAt = options.historyClearedAt || 0;

    const source = (window.CAMOUFLAGE_HISTORY && Array.isArray(window.CAMOUFLAGE_HISTORY))
      ? window.CAMOUFLAGE_HISTORY
      : (historyList || []);

    const filtered = source.filter(item => {
      // 忽略已被清空的历史记录
      if (clearedAt && item.time && item.time <= clearedAt) return false;

      // 状态筛选
      if (filter === "success" && item.status !== "双向替换成功") return false;
      if (filter === "stripped" && (!item.clientStripped || item.providerInjected)) return false;
      if (filter === "injected" && (!item.providerInjected || item.clientStripped)) return false;
      if (filter === "passthrough" && (item.clientStripped || item.providerInjected)) return false;

      // 文本搜索
      if (!q) return true;
      const haystack = `${item.model} ${item.provider} ${item.client} ${item.status}`.toLowerCase();
      return haystack.includes(q);
    });

    if (filtered.length === 0) {
      emptyState.hidden = false;
      return;
    }
    emptyState.hidden = true;

    filtered.forEach(item => {
      const row = document.createElement("div");
      row.className = "row provider";
      row.dataset.id = item.id;

      // 匹配渠道展示
      const targetName = getHistoryTargetName(item);
      const client = clientsList.find(c => c.id === item.client) || { name: item.client };

      // 状态标签
      let badgeClass = "none";
      let badgeText = item.status || "直通";
      const injChars = item.injectedInfo ? (item.injectedInfo.chars ?? item.injectedInfo.length ?? 0) : 0;
      if (item.clientStripped && item.providerInjected && injChars > 0) {
        badgeClass = "configured";
        badgeText = "双向替换成功";
      } else if (item.providerInjected && injChars > 0) {
        badgeClass = "configured";
        badgeText = `供应商已附加 (+${injChars}字)`;
      } else if (item.clientStripped) {
        badgeClass = "configured";
        badgeText = `客户端已屏蔽 (${item.strippedRules?.length || 1}条)`;
      }

      row.innerHTML = `
        <div class="ag-handle pv-handle">
          ${renderIcon(item.provider)}
        </div>
        <div class="who">
          <div class="name">发往 ${escapeHtml(targetName)} · 来自 ${escapeHtml(client.name || item.client || '客户端')}</div>
          <div class="sub">${escapeHtml(item.timestamp)} · 模型: ${escapeHtml(item.model)}</div>
        </div>
        <span class="key acct acct-plan ${badgeClass}">
          <span class="dot"></span> ${escapeHtml(badgeText)}
        </span>
        <span class="chev">
          <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="6 3 11 8 6 13"></polyline>
          </svg>
        </span>
      `;

      row.addEventListener("click", () => {
        openHistoryModal(item);
      });

      list.appendChild(row);
    });
  }

  function getHistoryTargetName(item) {
    const provId = (item.provider && item.provider !== "group") ? item.provider : "workbuddy";
    const prov = providersList.find(p => p.id === provId);
    return (prov && prov.name) ? prov.name : (provId || "真实供应商");
  }

  // 4. 历史记录详情弹窗逻辑
  function openHistoryModal(item) {
    activeHistoryRecord = item;
    const targetName = getHistoryTargetName(item);
    const client = clientsList.find(c => c.id === item.client) || { name: item.client };

    $("modalHistoryTitle").textContent = `请求伪装替换详情 - ${item.status}`;
    $("modalHistorySub").textContent = `${item.timestamp} · 模型: ${item.model}`;
    $("modalHistoryIcon").innerHTML = renderIcon(item.provider);

    // 统计面板
    $("hist-stat-provider").textContent = targetName;
    $("hist-stat-client").textContent = client.name || item.client || "未指定";
    $("hist-stat-stripped").textContent = item.clientStripped ? `成功 (抹除 ${item.strippedRules?.length || 0} 处)` : "未触发";
    const injChars = item.injectedInfo ? (item.injectedInfo.chars ?? item.injectedInfo.length ?? 0) : 0;
    $("hist-stat-injected").textContent = (item.providerInjected && injChars > 0) ? `成功 (+${injChars} 字符)` : "未触发";

    // 客户端特征详情 (没有就不显示)
    const strippedBox = $("hist-stripped-box");
    const strippedList = $("hist-stripped-list");
    strippedList.innerHTML = "";
    if (item.clientStripped && Array.isArray(item.strippedRules) && item.strippedRules.length > 0) {
      let count = 0;
      item.strippedRules.forEach(rule => {
        let text = "";
        if (typeof rule === "string") {
          text = rule;
        } else if (rule && typeof rule === "object") {
          text = rule.pattern || rule.name || rule.text || "";
        }
        if (!text || text === "[object Object]") return;
        const badge = document.createElement("span");
        badge.className = "diff-badge danger";
        badge.textContent = `已抹除: 「${text}」`;
        strippedList.appendChild(badge);
        count++;
      });
      strippedBox.hidden = count === 0;
    } else {
      strippedBox.hidden = true;
    }

    // 供应商提示词详情 (没有就不显示)
    const injectedBox = $("hist-injected-box");
    if (item.providerInjected && item.injectedInfo && injChars > 0) {
      injectedBox.hidden = false;
      const posText = item.injectedInfo.position === "append" ? "尾部附加" : "头部附加";
      $("hist-injected-summary").textContent = `注入位置: ${posText} · 长度: ${injChars} 字符`;
      $("hist-injected-snippet").textContent = item.injectedInfo.snippet || "已注入完整提示词";
    } else {
      injectedBox.hidden = true;
    }

    // 对比视图
    historyPromptMode = "after";
    updateHistoryPromptView();

    $("historyModal").hidden = false;
  }

  function updateHistoryPromptView() {
    if (!activeHistoryRecord) return;
    const view = $("hist-prompt-view");
    const isAfter = historyPromptMode === "after";
    const content = isAfter ? activeHistoryRecord.fullAfter : activeHistoryRecord.fullBefore;

    view.textContent = content || "(此请求未包含 System Prompt 指令)";
    $("btn-show-after-prompt").classList.toggle("active", isAfter);
    $("btn-show-before-prompt").classList.toggle("active", !isAfter);
  }

  $("btn-show-after-prompt").addEventListener("click", () => {
    historyPromptMode = "after";
    updateHistoryPromptView();
  });

  $("btn-show-before-prompt").addEventListener("click", () => {
    historyPromptMode = "before";
    updateHistoryPromptView();
  });

  $("btn-copy-history-prompt").addEventListener("click", () => {
    const text = $("hist-prompt-view").textContent;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(() => {
        showToast("提示词已复制到剪贴板");
      });
    } else {
      showToast("复制成功");
    }
  });

  function closeHistoryModal() {
    $("historyModal").hidden = true;
    activeHistoryRecord = null;
  }

  $("btnCloseHistoryModal").addEventListener("click", closeHistoryModal);
  $("btnCloseHistoryModalBottom").addEventListener("click", closeHistoryModal);

  // 5. 历史记录数据动态刷新与清空
  function reloadHistoryData(onComplete) {
    const oldScript = document.getElementById("history-data-script");
    if (oldScript) oldScript.remove();
    const script = document.createElement("script");
    script.id = "history-data-script";
    script.src = `history-data.js?t=${Date.now()}`;
    script.onload = () => {
      if (window.CAMOUFLAGE_HISTORY) {
        historyList = [...window.CAMOUFLAGE_HISTORY];
      }
      renderHistoryList();
      if (onComplete) onComplete();
    };
    script.onerror = () => {
      if (window.CAMOUFLAGE_HISTORY) {
        historyList = [...window.CAMOUFLAGE_HISTORY];
      }
      renderHistoryList();
      if (onComplete) onComplete();
    };
    document.head.appendChild(script);
  }

  // 刷新历史记录
  $("btn-refresh-history").addEventListener("click", () => {
    reloadHistoryData(() => {
      showToast("已刷新历史记录");
    });
  });

  // 清空历史记录 (直接执行，即刻生效并持久化)
  $("btn-clear-history").addEventListener("click", async function () {
    options.historyClearedAt = Date.now();
    window.CAMOUFLAGE_HISTORY = [];
    historyList = [];
    renderHistoryList();
    await saveOptions("已清空所有调用历史记录");
  });

  // 历史搜索与过滤
  $("historyQ").addEventListener("input", (e) => {
    historySearchQuery = e.target.value.trim();
    renderHistoryList();
  });
  $("historyQ").addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      $("historyQ").value = "";
      historySearchQuery = "";
      renderHistoryList();
    }
  });

  $("historyStatusFilter").addEventListener("change", (e) => {
    historyFilterStatus = e.target.value;
    renderHistoryList();
  });

  // 6. 供应商弹窗逻辑
  function openProviderModal(pid) {
    activeProviderId = pid;
    const prov = providersList.find(p => p.id === pid) || { id: pid, name: pid, icon: "generic.svg" };
    const cfg = options.providers[pid] || { enabled: false, prompt: "", position: "prepend" };

    $("modalProviderTitle").textContent = `${prov.name} 附加提示词设置`;
    $("modalProviderSub").textContent = `所有发往「${prov.name}」(${pid})的请求，均自动注入伪装提示词`;
    $("modalProviderIcon").innerHTML = renderIcon(prov.id, prov.icon);

    const sessionSelect = $("select-provider-session");
    sessionSelect.innerHTML = "";

    const matchingSessions = sessionsList.filter(s => s.agent.toLowerCase() === pid.toLowerCase());
    if (matchingSessions.length > 0) {
      matchingSessions.forEach((s) => {
        const opt = document.createElement("option");
        opt.value = s.id;
        opt.textContent = `${s.name} (${s.model || s.agent})`;
        sessionSelect.appendChild(opt);
      });
    }

    const emptyOpt = document.createElement("option");
    emptyOpt.value = "empty";
    emptyOpt.textContent = matchingSessions.length > 0 ? "—— 清空原始提示词 ——" : "该渠道暂无历史会话（留空）";
    sessionSelect.appendChild(emptyOpt);

    sessionsList.filter(s => s.agent.toLowerCase() !== pid.toLowerCase()).forEach(s => {
      const opt = document.createElement("option");
      opt.value = s.id;
      opt.textContent = `参考: ${s.name} (${s.agent})`;
      sessionSelect.appendChild(opt);
    });

    if (matchingSessions.length > 0) {
      sessionSelect.value = matchingSessions[0].id;
      setProviderRawText(matchingSessions[0].fullPrompt);
    } else {
      sessionSelect.value = "empty";
      setProviderRawText("");
    }

    const targetPrompt = cfg.prompt || "";
    $("provider-target-prompt").value = targetPrompt;
    $("provider-target-len").textContent = `${targetPrompt.length} 字符`;
    $("provider-position").value = cfg.position || "prepend";

    $("providerModal").hidden = false;
  }

  function setProviderRawText(text) {
    const rawEl = $("provider-raw-prompt");
    rawEl.value = text || "";
    $("provider-raw-len").textContent = `${(text || "").length} 字符`;
  }

  function closeProviderModal() {
    $("providerModal").hidden = true;
    activeProviderId = null;
  }

  $("select-provider-session").addEventListener("change", () => {
    const val = $("select-provider-session").value;
    if (val === "empty") {
      setProviderRawText("");
    } else {
      const s = sessionsList.find(x => x.id === val);
      setProviderRawText(s ? s.fullPrompt : "");
    }
  });

  $("btn-load-provider-session").addEventListener("click", () => {
    const raw = $("provider-raw-prompt").value;
    if (!raw) {
      showToast("当前未选择包含提示词的会话");
      return;
    }
    $("provider-target-prompt").value = raw;
    $("provider-target-len").textContent = `${raw.length} 字符`;
    showToast("已载入全部提示词");
  });

  $("btn-use-provider-selection").addEventListener("click", () => {
    const rawEl = $("provider-raw-prompt");
    const start = rawEl.selectionStart;
    const end = rawEl.selectionEnd;
    if (start === end) {
      showToast("请先用鼠标在原始提示词框内框选所需范围");
      return;
    }
    const selected = rawEl.value.substring(start, end).trim();
    if (selected) {
      $("provider-target-prompt").value = selected;
      $("provider-target-len").textContent = `${selected.length} 字符`;
      showToast(`已截取选中的 ${selected.length} 字符`);
    }
  });

  $("btn-slice-provider-paragraph").addEventListener("click", () => {
    const full = $("provider-raw-prompt").value;
    if (!full) return;
    const paragraphs = full.split("\n\n").map(p => p.trim()).filter(Boolean);
    if (paragraphs.length > 0) {
      $("provider-target-prompt").value = paragraphs[0];
      $("provider-target-len").textContent = `${paragraphs[0].length} 字符`;
      showToast("已截取首个大段提示词");
    }
  });

  $("provider-target-prompt").addEventListener("input", () => {
    $("provider-target-len").textContent = `${$("provider-target-prompt").value.length} 字符`;
  });

  $("btn-clear-target-prompt-input").addEventListener("click", () => {
    $("provider-target-prompt").value = "";
    $("provider-target-len").textContent = "0 字符";
    showToast("已清空输入内容");
  });

  $("btn-clear-provider-config").addEventListener("click", async () => {
    if (!activeProviderId) return;
    const targetId = activeProviderId;
    delete options.providers[targetId];
    $("provider-target-prompt").value = "";
    $("provider-target-len").textContent = "0 字符";
    closeProviderModal();
    await saveOptions(`已清空「${targetId}」附加规则`);
  });

  $("btn-save-provider-modal").addEventListener("click", () => {
    if (!activeProviderId) return;
    const prompt = $("provider-target-prompt").value.trim();
    const pos = $("provider-position").value || "prepend";

    if (!prompt) {
      delete options.providers[activeProviderId];
      closeProviderModal();
      saveOptions(`已清空「${activeProviderId}」配置（内容为空）`);
      return;
    }

    options.providers[activeProviderId] = {
      enabled: true,
      prompt: prompt,
      position: pos
    };

    closeProviderModal();
    saveOptions(`已保存「${activeProviderId}」附加提示词`);
  });

  $("btnCloseProviderModal").addEventListener("click", closeProviderModal);
  $("btn-cancel-provider-modal").addEventListener("click", closeProviderModal);

  // 7. 客户端弹窗逻辑
  function openClientModal(cid) {
    activeClientId = cid;
    const client = clientsList.find(c => c.id === cid) || { id: cid, name: cid, icon: "generic.svg" };
    const cfg = options.clients[cid] || { enabled: false, rules: [] };

    $("modalClientTitle").textContent = `${client.name} 特征屏蔽设置`;
    $("modalClientSub").textContent = `所有由「${client.name}」发出的请求，均自动抹除指定特征`;
    $("modalClientIcon").innerHTML = renderIcon(client.id, client.icon);

    clientTempRules = JSON.parse(JSON.stringify(cfg.rules || []));

    const sessionSelect = $("select-client-session");
    sessionSelect.innerHTML = "";
    const matchingSessions = sessionsList.filter(s => s.agent.toLowerCase() === cid.toLowerCase());
    if (matchingSessions.length > 0) {
      matchingSessions.forEach(s => {
        const opt = document.createElement("option");
        opt.value = s.id;
        opt.textContent = `${s.name}`;
        sessionSelect.appendChild(opt);
      });
      $("client-raw-prompt").value = matchingSessions[0].fullPrompt;
    } else {
      const emptyOpt = document.createElement("option");
      emptyOpt.value = "empty";
      emptyOpt.textContent = "该客户端暂无历史会话记录";
      sessionSelect.appendChild(emptyOpt);
      $("client-raw-prompt").value = "";
    }

    renderClientModalRules();
    $("clientModal").hidden = false;
  }

  function renderClientModalRules() {
    const tbody = $("client-modal-rules-body");
    tbody.innerHTML = "";

    if (clientTempRules.length === 0) {
      tbody.innerHTML = `<tr><td colspan="4" style="text-align: center; color: var(--muted); padding: 16px;">暂未添加任何过滤规则，点击右上角「+ 添加规则」</td></tr>`;
      return;
    }

    clientTempRules.forEach((rule, idx) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td class="rule-input-cell">
          <input type="text" class="rule-pattern" value="${escapeHtml(rule.pattern || "")}" placeholder="要抹除的文本或正则表达式">
        </td>
        <td class="rule-input-cell">
          <input type="text" class="rule-replacement" value="${escapeHtml(rule.replacement || "")}" placeholder="留空则直接删除">
        </td>
        <td style="text-align: center;">
          <input type="checkbox" class="rule-regex" ${rule.isRegex ? "checked" : ""}>
        </td>
        <td style="text-align: center;">
          <button type="button" class="text danger" data-del-idx="${idx}" style="padding: 2px 6px;">✕</button>
        </td>
      `;

      tr.querySelector(".rule-pattern").addEventListener("input", (e) => {
        rule.pattern = e.target.value;
      });
      tr.querySelector(".rule-replacement").addEventListener("input", (e) => {
        rule.replacement = e.target.value;
      });
      tr.querySelector(".rule-regex").addEventListener("change", (e) => {
        rule.isRegex = e.target.checked;
      });
      tr.querySelector("[data-del-idx]").addEventListener("click", () => {
        clientTempRules.splice(idx, 1);
        renderClientModalRules();
      });

      tbody.appendChild(tr);
    });
  }

  function closeClientModal() {
    $("clientModal").hidden = true;
    activeClientId = null;
    clientTempRules = [];
  }

  $("btn-add-client-rule").addEventListener("click", () => {
    clientTempRules.push({
      id: "rule-" + Date.now(),
      pattern: "",
      replacement: "",
      isRegex: false,
      enabled: true
    });
    renderClientModalRules();
  });

  $("btn-load-client-session").addEventListener("click", () => {
    const raw = $("client-raw-prompt").value.trim();
    if (!raw) {
      showToast("当前无会话内容");
      return;
    }
    clientTempRules.push({
      id: "rule-" + Date.now(),
      pattern: raw,
      replacement: "",
      isRegex: false,
      enabled: true
    });
    renderClientModalRules();
    showToast("已将完整会话内容添加为屏蔽规则");
  });

  $("btn-use-client-selection").addEventListener("click", () => {
    const rawEl = $("client-raw-prompt");
    const start = rawEl.selectionStart;
    const end = rawEl.selectionEnd;
    if (start === end) {
      showToast("请先用鼠标框选需要屏蔽的文本");
      return;
    }
    const sel = rawEl.value.substring(start, end).trim();
    if (sel) {
      clientTempRules.push({
        id: "rule-" + Date.now(),
        pattern: sel,
        replacement: "",
        isRegex: false,
        enabled: true
      });
      renderClientModalRules();
      showToast(`已添加「${sel.slice(0, 20)}...」屏蔽规则`);
    }
  });

  $("btn-clear-client-config").addEventListener("click", async () => {
    if (!activeClientId) return;
    const targetId = activeClientId;
    delete options.clients[targetId];
    clientTempRules = [];
    renderClientModalRules();
    closeClientModal();
    await saveOptions(`已清空「${targetId}」屏蔽规则`);
  });

  $("btn-save-client-modal").addEventListener("click", () => {
    if (!activeClientId) return;
    const validRules = clientTempRules.filter(r => r.pattern && r.pattern.trim());

    if (validRules.length === 0) {
      delete options.clients[activeClientId];
      closeClientModal();
      saveOptions(`已清空「${activeClientId}」配置（无有效规则）`);
      return;
    }

    options.clients[activeClientId] = {
      enabled: true,
      rules: validRules
    };

    closeClientModal();
    saveOptions(`已保存「${activeClientId}」屏蔽规则 (${validRules.length} 条)`);
  });

  $("btnCloseClientModal").addEventListener("click", closeClientModal);
  $("btn-cancel-client-modal").addEventListener("click", closeClientModal);

  // 8. 顶部全局开关 & 清空全部规则
  $("master-switch").addEventListener("click", () => {
    options.enabled = options.enabled === false ? true : false;
    saveOptions(`已${options.enabled ? '开启' : '关闭'}全局伪装开关`);
  });

  $("btn-clear-all-rules").addEventListener("click", async () => {
    options.providers = {};
    options.clients = {};
    await saveOptions("已清空全部伪装与屏蔽规则");
    renderAll();
  });

  // 9. 搜索与打码交互
  $("pvMask").addEventListener("click", () => {
    isAccountMasked = !isAccountMasked;
    $("pvMask").classList.toggle("active", isAccountMasked);
    $("mask-status-text").textContent = isAccountMasked ? "账号已打码" : "显示完整账号";
    renderProvidersList();
  });

  const pvQ = $("pvQ");
  pvQ.addEventListener("input", () => {
    providerSearchQuery = pvQ.value.trim();
    renderProvidersList();
  });
  pvQ.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      pvQ.value = "";
      providerSearchQuery = "";
      renderProvidersList();
    }
  });

  const clientQ = $("clientQ");
  clientQ.addEventListener("input", () => {
    clientSearchQuery = clientQ.value.trim();
    renderClientsList();
  });
  clientQ.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      clientQ.value = "";
      clientSearchQuery = "";
      renderClientsList();
    }
  });

  // 10. Tab 切换
  let currentActiveTab = "tab-rules";
  document.querySelectorAll(".tab-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".tab-btn").forEach(b => {
        b.classList.remove("active");
        b.setAttribute("aria-selected", "false");
      });
      btn.classList.add("active");
      btn.setAttribute("aria-selected", "true");

      currentActiveTab = btn.dataset.tab;
      document.querySelectorAll(".tab-panel").forEach(panel => {
        panel.hidden = panel.id !== currentActiveTab;
        panel.classList.toggle("active", panel.id === currentActiveTab);
      });

      if (currentActiveTab === "tab-history") {
        reloadHistoryData();
      }
    });
  });

  // 当停留在历史记录标签页时，每 2.5 秒自动静默刷新最新记录
  setInterval(() => {
    if (currentActiveTab === "tab-history") {
      reloadHistoryData();
    }
  }, 2500);

  // 工具函数：HTML 转义
  function escapeHtml(str) {
    if (!str) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  // 11. 官方 Magpie 宿主与插件通信规范 (Host PostMessage Handshake & Theme/Locale Sync)
  function initMagpieHostSync() {
    let callId = 1;
    const pendingCalls = new Map();

    window.addEventListener("message", (ev) => {
      const msg = ev.data;
      if (!msg || typeof msg !== "object" || msg.magpie !== 1) return;

      if (msg.id && pendingCalls.has(msg.id)) {
        const { resolve, reject } = pendingCalls.get(msg.id);
        pendingCalls.delete(msg.id);
        if (msg.error) reject(new Error(msg.error));
        else resolve(msg.result);
        return;
      }

      if (msg.event === "theme" && msg.data) {
        applyHostTheme(msg.data);
      }
    });

    function callHost(method, params = {}) {
      return new Promise((resolve, reject) => {
        const id = "call-" + callId++;
        pendingCalls.set(id, { resolve, reject });
        window.parent.postMessage({ magpie: 1, id, method, params }, "*");
        setTimeout(() => {
          if (pendingCalls.has(id)) {
            pendingCalls.delete(id);
            reject(new Error("Host call timed out: " + method));
          }
        }, 3000);
      });
    }

    function applyHostTheme(data) {
      if (!data) return;
      const root = document.documentElement;
      if (data.dark !== undefined) {
        root.dataset.theme = data.dark ? "dark" : "light";
      }
      if (data.tokens) {
        for (const [k, v] of Object.entries(data.tokens)) {
          if (v) root.style.setProperty("--" + k, v);
        }
      }
      if (data.lang) {
        root.lang = data.lang;
      }
    }

    callHost("hello").then(res => {
      if (res) applyHostTheme(res);
    }).catch(() => {});
  }

  initMagpieHostSync();

  // 初始渲染
  renderAll();
})();
