// real-clients.js - 本机真实检测到的 Agent 客户端 (由 Magpie agents-state 动态同步)
window.REAL_CLIENTS = [
  {
    "id": "codex",
    "name": "Codex",
    "desc": "OpenAI Codex 客户端",
    "icon": "codex-color",
    "path": "~/.codex/config.toml",
    "wired": false
  },
  {
    "id": "agy",
    "name": "Antigravity CLI",
    "desc": "Google DeepMind 反重力命令行工具 (agy)",
    "icon": "antigravity-color",
    "path": "~/.gemini/antigravity-cli/settings.json",
    "wired": false
  },
  {
    "id": "antigravity",
    "name": "Antigravity",
    "desc": "Google DeepMind 反重力客户端 (IDE)",
    "icon": "antigravity-color",
    "path": "~/.antigravity/settings.json",
    "wired": false
  },
  {
    "id": "dsh",
    "name": "DeepSeek Harness",
    "desc": "DeepSeek 官方客户端与命令行助手 (dsh)",
    "icon": "deepseek-color",
    "path": "~/.dsh/profiles/web/cordis.patch.yml",
    "wired": true
  },
  {
    "id": "workbuddy-ai",
    "name": "WorkBuddy AI",
    "desc": "腾讯 WorkBuddy AI 桌面助手",
    "icon": "workbuddy-color",
    "path": "~/.workbuddy-ai/models.json",
    "wired": false
  }
];
