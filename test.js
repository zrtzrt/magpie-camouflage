// test.js - Unit tests for Camouflage plugin (全解耦架构)

import { onRequest } from './index.js';

async function runTest(name, fn) {
  try {
    await fn();
    console.log(`✅ [PASS] ${name}`);
  } catch (err) {
    console.error(`❌ [FAIL] ${name}:`, err.message);
    process.exit(1);
  }
}

console.log("🚀 开始运行全解耦架构单元测试...\n");

const slicedAntigravityPrompt = "<identity>\nYou are Antigravity, a powerful agentic AI coding assistant designed by the Google Deepmind team working on Advanced Agentic Coding.\n</identity>";

// 全解耦配置：
// - 客户端配置：dsh 发出的全部去掉 '我是dsh'
// - 供应商配置：发往 deepseek 的全部加上反重力身份提示词
const decoupledOptions = {
  enabled: true,
  clients: {
    "dsh": {
      enabled: true,
      rules: [
        { id: "r1", pattern: "我是dsh", replacement: "", isRegex: false, enabled: true },
        { id: "r2", pattern: "You are an AI agent powered by DeepSeek Harness.", replacement: "", isRegex: false, enabled: true }
      ]
    }
  },
  providers: {
    "deepseek": {
      enabled: true,
      position: "prepend",
      prompt: slicedAntigravityPrompt
    }
  }
};

// 测试 1: 解耦特性 - DSH 发出的请求，发往 DeepSeek：去掉 DSH 特征，加上 DeepSeek 提示词
await runTest("测试 1: DSH -> DeepSeek (客户端去掉特征 + 供应商加上提示词)", async () => {
  const body = {
    model: "deepseek/deepseek-chat",
    messages: [
      { role: "user", content: "我是dsh，请写一个快速排序算法。" }
    ]
  };
  const ctx = { options: decoupledOptions, agent: "dsh", model: "deepseek/deepseek-chat" };
  const res = await onRequest(body, ctx);

  if (res.messages[1].content.includes("我是dsh")) {
    throw new Error("DSH 客户端特征词 '我是dsh' 未被去掉！");
  }
  if (!res.messages[0].content.includes("<identity>")) {
    throw new Error("发往 DeepSeek 时未被附加反重力提示词！");
  }
});

// 测试 2: 解耦特性 - DSH 发往 OpenAI (未配置供应商提示词)：去掉 DSH 特征，但不附加 DeepSeek 的提示词
await runTest("测试 2: DSH -> OpenAI (客户端依然去掉特征，但不会错加 DeepSeek 的提示词)", async () => {
  const body = {
    model: "openai/gpt-4o",
    messages: [
      { role: "user", content: "我是dsh，问个简单问题。" }
    ]
  };
  const ctx = { options: decoupledOptions, agent: "dsh", model: "openai/gpt-4o" };
  const res = await onRequest(body, ctx);

  if (res.messages[0].content.includes("我是dsh")) {
    throw new Error("DSH 客户端特征词未被去掉！");
  }
  if (res.messages.some(m => m.content.includes("<identity>"))) {
    throw new Error("错误地向 OpenAI 附加了 DeepSeek 专属提示词！");
  }
});

// 测试 3: 解耦特性 - 其他客户端发往 DeepSeek：加上 DeepSeek 提示词
await runTest("测试 3: Claude -> DeepSeek (所有发往 DeepSeek 的请求都加上配置的提示词)", async () => {
  const body = {
    model: "deepseek/deepseek-chat",
    messages: [
      { role: "user", content: "请帮我重构代码。" }
    ]
  };
  const ctx = { options: decoupledOptions, agent: "claude", model: "deepseek/deepseek-chat" };
  const res = await onRequest(body, ctx);

  if (!res.messages[0].content.includes("<identity>")) {
    throw new Error("发往 DeepSeek 未能附加提示词！");
  }
});

console.log("\n🎉 全解耦架构单元测试全部通过！");
