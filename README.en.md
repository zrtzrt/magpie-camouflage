# Camouflage (Magpie Camouflage)

[![GitHub](https://img.shields.io/badge/GitHub-zrtzrt%2Fmagpie--camouflage-blue?logo=github)](https://github.com/zrtzrt/magpie-camouflage)
[![npm](https://img.shields.io/npm/v/magpie-camouflage?color=red&logo=npm)](https://www.npmjs.com/package/magpie-camouflage)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](https://opensource.org/licenses/MIT)

A decoupled **Prompt Camouflage & Feature Shielding Middleware and UI Panel (Page & Gateway Middleware)** designed specifically for [Magpie](https://github.com/yetone/magpie).

Automatically appends required camouflage prompts when routing to configured providers, and scrubs proprietary client prompt signatures when requests originate from configured local clients.

---

## ⚠️ Important Disclaimer & Risk Notice

> [!CAUTION]
> **This plugin ONLY modifies prompt text (System Prompts, Messages) at the Application Layer.**
>
> **Please be aware: Model providers still have numerous lower-level network and behavioral fingerprinting methods to identify non-official client requests, including but not limited to:**
> 1. **TLS / Transport Layer Fingerprints (JA3 / JA4 / ClientHello)**: Official clients (built on specific Electron, Chromium, Node, or Go BoringSSL builds) exhibit immutable cipher suite orders, TLS extensions, ALPN sequences, and curves that proxy middlewares cannot replicate.
> 2. **HTTP/2 Protocol Stack Signatures**: SETTINGS frame ordering, WINDOW_UPDATE mechanics, and HPACK header compression tables determined directly by the client's network stack.
> 3. **HTTP Header Ordering and Casing**: Differences in client header ordering, missing proprietary authentication headers, or contradictions between header claims and underlying TLS handshakes.
> 4. **Behavioral & Interaction Fingerprints**: Token streaming consumption intervals, heartbeat latencies, and predictable tool-calling structures.
>
> **Using this plugin does NOT guarantee exemption from provider rate limits, account risk control, or bans. All consequences resulting from usage are assumed entirely by the user at their own risk. This project is intended solely for research and personal technical exploration. Please respect each model provider's Terms of Service.**

---

## 🌟 Key Features

* **Decoupled Architecture**:
  * **Provider Rules**: Automatically prepend tailored instructions, role prompts, and formatting constraints to requests destined for specific providers.
  * **Client Rules**: Automatically filter out or replace identifying system prompt tokens from specified local clients (e.g., DeepSeek Harness, Antigravity).
* **Native Magpie Styling**:
  * Seamless light/dark theme adaptation via official design tokens;
  * Full i18n support (English, Simplified Chinese, Traditional Chinese, Japanese);
  * Only displays locally detected, active agents.
* **One-Click Real Session Extraction**:
  * Load actual session transcripts from local agents;
  * Highlight any text slice with your mouse to instantly create filtering rules.
* **Real-time Interception History**:
  * Inspect side-by-side Before/After diffs of modified system prompts;
  * View true upstream provider routes and rule hit statistics.

---

## 📦 Installation

### Method 1: Magpie Plugin Marketplace (Recommended)
Search for `camouflage` or `伪装` in Magpie under **Plugins -> Discover**, and click Install.

### Method 2: Via GitHub
Run in your terminal:
```bash
magpie plugin add github:zrtzrt/magpie-camouflage
```

### Method 3: Via npm
Run in your terminal:
```bash
magpie plugin add magpie-camouflage
```

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).
