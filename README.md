<div align="center">
  <h1>vpi (VitePress AI i18n)</h1>
  <span>English | <a href="./README_zh.md">中文</a></span>
</div>

---

**vpi** is a high-performance CLI tool designed to automate the internationalization (i18n) of VitePress projects using AI. It translates your Markdown documents and synchronizes your navigation/sidebar configurations with a single command.

![vpi](assets/vpi.gif)

## ✨ Features

* **🚀 One-Click All**: Translate documents and sync VitePress menus (`nav`/`sidebar`) in one go.
* **🧠 Intelligent Translation**: Powered by AI (OpenAI, DeepSeek, etc.) to maintain technical context and Markdown structure.
* **⚡ Incremental Updates**: Uses a hash-based cache system to only translate new or modified files, saving you time and API tokens.
* **📚 Glossary Support**: Lock professional terminology to ensure consistency across all languages.
* **🌍 Multi-Target**: Support for translating into multiple languages simultaneously (e.g., `en,jp,fr`).
* **🛠️ Tech-Friendly**: Automatically detects `.ts`, `.mts`, and `.js` configurations.

---

## 📦 Installation

```bash
pnpm add -D vitepress-ai-i18n
# or
npm install -D vitepress-ai-i18n

```

---

## 🚀 Quick Start

### 1. Initialization

```bash
npx vpi init

```

### 2. Configuration Edit the .env file and enter your AI_API_KEY.

- .env

  ```bash
  AI_API_KEY=your_api_key_here
  AI_MODEL=deepseek-chat # Default gpt-4o-mini
  AI_BASE_URL=https://api.deepseek.com/v1 # Default OPENAI
  ```

  

- vpi18n.config.json

  ```bash
  {
    "source": "docs",
    "target": "zh", # Languages ​​to be translated into (examples: zh, fr)
    "glossary": null
  }
  ```


### 3. Run vpi

```bash
# Translate everything and sync menus
npx vpi all

# Or use specific commands
npx vpi gen   # Docs only
npx vpi sync  # Menu only

```

---

## 🛠️ VitePress Integration

`vpi` generates a clean JSON file for your menus in `your-source/.vitepress/i18n/`. Simply import it into your `config.mts`:

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

## 📖 Configuration Reference

| Option | Env / Config | Description | Default |
| --- | --- | --- | --- |
| `--source` | `source` | Documentation root directory | `docs` |
| `--target` | `target` | Target languages (comma-separated) | `zh` |
| `--model` | `AI_MODEL` | AI model to use | `gpt-4o-mini` |
| `--glossary` | `glossary` | Path to glossary JSON file | `null` |

### Custom Prompts

You can customize the AI system prompts for translation and menu sync via `vpi18n.config.json`:

```json
{
  "source": "docs",
  "target": "zh",
  "glossary": "./glossary.json",
  "prompt": {
    "translate": "You are a technical translator. Translate to {{lang}}. Keep Markdown structure intact.",
    "sync": "Extract nav and sidebar from config. Translate text/label to {{target}}. Return JSON only."
  }
}
```

**Available variables:**

| Variable | Used in | Description |
|----------|---------|-------------|
| `{{lang}}` | translate | Target language code (e.g., `zh`, `fr`) |
| `{{glossary}}` | translate | Glossary JSON string |
| `{{sourcePath}}` | translate | Source file path relative to docs root (e.g., `design/rfc/index.md`) |
| `{{targetPath}}` | translate | Target file path relative to docs root (e.g., `en/design/rfc/index.md`) |
| `{{target}}` | sync | Target language code |

If a variable is not used in your custom prompt, it will be automatically appended.

Leave a field empty (`""`) to use the default prompt for that operation.

### Relative links

Translated files live one directory deeper than their source (`src/x.md` → `src/en/x.md`).
Links pointing **inside** the docs root keep working when copied verbatim, but links that
**escape** the docs root (e.g. `../../../../CONTRIBUTING.md` pointing at a repo-level file)
need one extra `../` because of that extra level.

You don't need to handle this in a custom prompt. `vpi` retargets such links deterministically
after translation (reported as `(retargeted N cross-root link(s))`), and the default prompt
tells the model to copy links verbatim rather than guess at the depth itself.

### Glossary Example

`glossary.json`:

```json
{
  "Hydration": "激活",
  "VitePress": "VitePress"
}

```

---

## 🚀 Advanced Usage

`vpi` is compatible with any AI provider that supports the OpenAI-compatible API. This gives you the freedom to choose the most cost-effective or highest-performing model for your needs.

### LLM

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
You can get a free API key from [Google AI Studio](https://aistudio.google.com/).

```env
AI_BASE_URL=https://generativelanguage.googleapis.com/v1beta/openai/
AI_API_KEY=your_gemini_key
AI_MODEL=gemini-1.5-pro

```

**Groq (Blazing Fast)**
Perfect for large-scale documentation projects.

```env
AI_BASE_URL=https://api.groq.com/openai/v1
AI_API_KEY=your_groq_key
AI_MODEL=llama-3.1-70b-versatile

```

### 3. Local LLM: 100% Free & Private (Ollama)

If you prefer to run your translations locally for maximum privacy and zero cost, use [Ollama](https://ollama.com/).

1. **Install Ollama** and pull a model:
```bash
ollama pull llama3

```


2. **Configure `.env**`:
```env
AI_BASE_URL=http://localhost:11434/v1
AI_API_KEY=ollama (any string works)
AI_MODEL=llama3

```



### 4. Selective Translation

If you only want to process specific languages in a multi-language project, you can override the config via CLI:

```bash
# Only translate to French, ignoring other targets in config.json
vpi all --target fr

```

---

## 🤝 Contributing

Contributions are welcome! Feel free to open an Issue or submit a Pull Request.

1. Fork the Project
2. Create your Feature Branch (`git checkout -b feature/AmazingFeature`)
3. Commit your Changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the Branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

---

## 📄 License

Distributed under the MIT License. See `LICENSE` for more information.