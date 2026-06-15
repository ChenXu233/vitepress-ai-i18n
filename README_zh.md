<div align="center">
	<h1>vpi (VitePress AI 国际化工具)</h1>
  <span>中文 | <a href="./README.md">English</a></span>
</div>

---

**vpi** 是一款专为 VitePress 设计的高性能 AI 自动化国际化 (i18n) 命令行工具。只需一行命令，即可完成文档翻译与菜单配置同步。

![vpi](assets/vpi.gif)

## ✨ 特性

* **🚀 一键全自动化**: 同时完成 Markdown 文档翻译和 VitePress 菜单 (`nav`/`sidebar`) 同步。
* **🧠 智能翻译**: 基于 AI（支持 OpenAI、DeepSeek 等）驱动，深度理解技术语境，完美保持 Markdown 结构。
* **⚡ 增量更新**: 采用基于 Hash 的缓存系统，仅翻译新增或修改过的文件，极大节省时间与 Token 成本。
* **📚 术语表支持**: 支持自定义术语表（Glossary），确保专业名词在所有语言版本中保持一致。
* **🌍 多语言并行**: 支持一次性生成多种目标语言（如：`en,jp,fr`）。
* **🛠️ 智能兼容**: 自动识别 `.ts`、`.mts` 和 `.js` 格式的 VitePress 配置文件。

---



## 📦 安装

```bash
pnpm add -D vitepress-ai-i18n
# 或者
npm install -D vitepress-ai-i18n

```

---



## 🚀 快速上手

### 1. 初始化

```bash
npx vpi init

```



### 2. 编辑配置

- .env

  ```bash
  AI_API_KEY=your_api_key_here
  AI_MODEL=deepseek-chat # 不填默认gpt-4o-mini
  AI_BASE_URL=https://api.deepseek.com/v1 # 不填默认OPENAI
  ```

  

- vpi18n.config.json

  ```bash
  {
    "source": "docs", # VitePress目录
    "target": "zh", # 需要翻译成的语言 示例：zh,fr
    "glossary": null # 术语表 JSON 文件路径
  }
  ```

  


### 3. 运行 vpi

```bash
# 执行全部任务：翻译文档 + 同步菜单
npx vpi all

# 或执行特定指令
npx vpi gen   # 仅翻译文档
npx vpi sync  # 仅同步菜单

```

---

## 🛠️ VitePress 接入

`vpi` 会在 `你的文档目录/.vitepress/i18n/` 下生成纯 JSON 配置文件。你只需在 `config.mts` 中引入即可：

```typescript
import zhConfig from './i18n/zh.json'

export default defineConfig({
  locales: {
    root: {
      label: 'English',
      lang: 'en'
    },
    zh: {
      label: '简体中文',
      lang: 'zh',
      link: '/zh/',
      themeConfig: {
        nav: zhConfig.nav,
        sidebar: zhConfig.sidebar
      }
    },
  },
})

```

---

## 📖 配置参数参考

| 参数 | 环境变量 / 配置文件 | 描述 | 默认值 |
| --- | --- | --- | --- |
| `--source` | `source` | 文档根目录 | `docs` |
| `--target` | `target` | 目标语言 (逗号隔开) | `zh` |
| `--glossary` | `glossary` | 术语表 JSON 文件路径 | `null` |

### 自定义提示词

您可以通过 `vpi18n.config.json` 自定义 AI 翻译和菜单同步的系统提示词：

```json
{
  "source": "docs",
  "target": "zh",
  "glossary": "./glossary.json",
  "prompt": {
    "translate": "你是一个技术翻译专家。翻译到 {{lang}}。保持 Markdown 结构不变。",
    "sync": "从配置中提取 nav 和 sidebar，翻译 text 和 label 到 {{target}}。只返回 JSON。"
  }
}
```

**可用变量：**

| 变量 | 用于 | 说明 |
|------|------|------|
| `{{lang}}` | translate | 目标语言代码（如 `zh`、`fr`） |
| `{{glossary}}` | translate | 术语表 JSON 字符串 |
| `{{target}}` | sync | 目标语言代码 |

如果自定义提示词中未使用某个变量，系统会自动将其追加到末尾。

留空（`""`）则使用该操作的默认提示词。

### 术语表示例

`glossary.json`:

```json
{
  "Hydration": "激活",
  "VitePress": "VitePress",
  "Frontmatter": "前置元数据"
}

```

---

## 🚀 高级用法

`vpi` 与任何支持 OpenAI 兼容 API 的 AI 提供商兼容。这让您可以自由选择最经济实惠或性能最高的模型来满足您的需求。

### LLM大模型

**DeepSeek**

```env

AI_BASE_URL=https://api.deepseek.com

AI_API_KEY=your_deepseek_key

AI_MODEL=deepseek-chat

```

**Qwen (DashScope)**

```env

AI_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1

AI_API_KEY=your_dashscope_key

AI_MODEL=qwen-max

```

**Google Gemini**

您可以从 [Google AI Studio](https://aistudio.google.com/) 获取免费的 API 密钥。

```env

AI_BASE_URL=https://generativelanguage.googleapis.com/v1beta/openai/

AI_API_KEY=your_gemini_key

AI_MODEL=gemini-1.5-pro

```

**Groq（速度极快）**

非常适合大型文档项目。

```env

AI_BASE_URL=https://api.groq.com/openai/v1

AI_API_KEY=your_groq_key

AI_MODEL=llama-3.1-70b-versatile

```

### 本地 LLM：100% 免费且私密 (Ollama)

如果您希望在本地运行翻译以获得最大程度的隐私保护和零成本，请使用 [Ollama](https://ollama.com/)。

1. **安装 Ollama** 并拉取模型：

```bash

ollama pull llama3

```

2. **配置 `.env`**：

```env

AI_BASE_URL=http://localhost:11434/v1

AI_API_KEY=ollama（任何字符串均可）

AI_MODEL=llama3

```

### 4. 选择性翻译

如果您只想在多语言项目中处理特定语言，可以通过 CLI 覆盖配置：

```bash

# 仅翻译成法语，忽略 config.json 中的其他目标

vpi all --target fr

```

---

## 🤝 参与贡献

我们非常欢迎各种形式的贡献！

1. Fork 本项目
2. 创建你的特性分支 (`git checkout -b feature/AmazingFeature`)
3. 提交你的改动 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 开启一个 Pull Request

---

## 📄 开源协议

本项目基于 MIT 协议开源。详情请参阅 `LICENSE` 文件。