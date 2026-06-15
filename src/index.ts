/**
 * VPI - VitePress AI i18n Tool
 * A CLI tool to automate VitePress documentation translation using AI.
 * * @author HoHu@hohu.org
 * @license MIT
 */

import { cac } from 'cac';
import path from 'path';
import glob from 'fast-glob';
import fs from 'fs-extra';
import chalk from 'chalk';
import ora from 'ora';
import 'dotenv/config';
import { Translator, interpolateVariables } from './translator.js';
import { getFileHash, loadCache, saveCache } from './utils.js';

const cli = cac('vpi');

// --- i18n for CLI Terminal UI ---
// Detect system language (supports zh/en)
const isZh = Intl.DateTimeFormat().resolvedOptions().locale.startsWith('zh');
const t = {
    scanning: isZh ? '正在扫描 Markdown 文件...' : 'Scanning Markdown files...',
    found: (n: number, lang: string, m: string) =>
        isZh ? `发现 ${n} 个文件，目标语言: ${lang}，模型: ${m}` : `Found ${n} files, Target: ${lang}, Model: ${m}`,
    processingLang: (l: string) => isZh ? `🌐 开始处理语言: [${l}]` : `🌐 Processing language: [${l}]`,
    skipped: (f: string) => isZh ? `  [-] 跳过 (已缓存): ${f}` : `  [-] Skipped (cached): ${f}`,
    translating: (f: string, l: string) => isZh ? `正在翻译 [${l}]: ${f}` : `Translating [${l}]: ${f}`,
    done: (f: string, l: string) => isZh ? `完成 [${l}]: ${f}` : `Completed [${l}]: ${f}`,
    fail: (f: string, l: string, e: string) => isZh ? `失败 [${l}]: ${f} (${e})` : `Failed [${l}]: ${f} (${e})`,
    syncing: (l: string) => isZh ? `分析并提取 [${l}] 菜单配置...` : `Analyzing and extracting [${l}] menu config...`,
    syncSuccess: (f: string) => isZh ? `菜单已同步: ${f}` : `Menu synced: ${f}`,
    allDone: isZh ? '\n✨ 所有国际化任务处理完成！' : '\n✨ All i18n tasks completed!',
    noKey: isZh ? '\n❌ 错误: 未发现环境变量 AI_API_KEY。' : '\n❌ Error: AI_API_KEY not found in .env.',
    noConfig: (p: string) => isZh ? `❌ 错误: 在 ${p} 中未找到配置文件` : `❌ Error: Config file not found in ${p}`,
    initStart: isZh ? '🚀 开始初始化配置...' : '🚀 Initializing configurations...',
    envCreated: isZh ? '  ✅ 已生成 .env 模板' : '  ✅ Created .env template',
    envExists: isZh ? '  ⚠️ .env 已存在，跳过' : '  ⚠️ .env already exists, skipping',
    configCreated: isZh ? '  ✅ 已生成 vpi18n.config.json' : '  ✅ Created vpi18n.config.json',
    configExists: isZh ? '  ⚠️ vpi18n.config.json 已存在，跳过' : '  ⚠️ vpi18n.config.json already exists, skipping',
    initDone: isZh ? '\n✨ 初始化完成！请编辑 .env 文件配置您的 API Key。' : '\n✨ Init complete! Please edit .env to set your API Key.'
};

interface Config {
    source: string;
    targets: string[];
    model: string;
    glossary: string | null;
    prompt?: {
        translate?: string;
        sync?: string;
    };
}

/**
 * Resolve VitePress config file path (supports .ts, .mts, .js, .mjs)
 * @param sourceDir The documentation root directory
 */
async function getVitePressConfigPath(sourceDir: string) {
    const vpDir = path.resolve(sourceDir, '.vitepress');
    const extensions = ['ts', 'mts', 'js', 'mjs'];
    for (const ext of extensions) {
        const p = path.join(vpDir, `config.${ext}`);
        if (await fs.pathExists(p)) return p;
    }
    return null;
}

/**
 * Merge configurations from CLI, config file, and environment variables
 */
async function getResolvedConfig(options: any): Promise<Config> {
    const configPath = path.resolve('vpi18n.config.json');
    let fileConfig: any = {};
    if (await fs.pathExists(configPath)) {
        fileConfig = await fs.readJson(configPath);
    }

    const targetStr = options.target || fileConfig.target || 'zh';
    const targets = targetStr.split(',').map((t: string) => t.trim());

    return {
        source: options.source || fileConfig.source || 'docs',
        targets,
        model: options.model || process.env.AI_MODEL || fileConfig.model || 'gpt-4o-mini',
        glossary: options.glossary || fileConfig.glossary || null,
        prompt: fileConfig.prompt || undefined,
    };
}

/**
 * Core Logic: Document Translation
 */
async function runGen(config: Config) {
    const apiKey = process.env.AI_API_KEY;
    const baseURL = process.env.AI_BASE_URL || 'https://api.openai.com/v1';
    if (!apiKey) {
        console.error(chalk.red(t.noKey));
        process.exit(1);
    }

    const translator = new Translator(apiKey, baseURL);
    const sourceDir = path.resolve(config.source);
    const cachePath = path.resolve(sourceDir, '.i18n-cache.json');
    const cache = await loadCache(cachePath);

    let glossaryData = {};
    if (config.glossary && await fs.pathExists(config.glossary)) {
        glossaryData = await fs.readJson(config.glossary);
    }

    const spinner = ora(t.scanning).start();
    const files = await glob(`${config.source}/**/*.md`, {
        ignore: [
            ...config.targets.map(t => `${config.source}/${t}/**`),
            '**/node_modules/**',
            '**/.vitepress/**'
        ],
    });
    spinner.succeed(chalk.cyan(t.found(files.length, config.targets.join(','), config.model)));

    for (const target of config.targets) {
        console.log(chalk.blueBright(`\n${t.processingLang(target)}`));
        for (const file of files) {
            const content = await fs.readFile(file, 'utf-8');
            const hash = getFileHash(content);
            const cacheKey = `${file}:${target}`;
            const relativePath = path.relative(config.source, file);
            const outputPath = path.join(sourceDir, target, relativePath);

            // Incremental update check
            if (cache[cacheKey] === hash && await fs.pathExists(outputPath)) {
                console.log(chalk.gray(t.skipped(relativePath)));
                continue;
            }

            const fileSpinner = ora(t.translating(relativePath, target)).start();
            try {
                const translated = await translator.translate(
                  content,
                  target,
                  config.model,
                  glossaryData,
                  config.prompt?.translate || undefined,
                  { lang: target, glossary: JSON.stringify(glossaryData) }
                );
                await fs.ensureFile(outputPath);
                await fs.writeFile(outputPath, translated || '');

                // Update cache
                cache[cacheKey] = hash;
                await saveCache(cachePath, cache);
                fileSpinner.succeed(chalk.green(t.done(relativePath, target)));
            } catch (err: any) {
                fileSpinner.fail(chalk.red(t.fail(relativePath, target, err.message)));
            }
        }
    }
}

/**
 * Core Logic: Menu Configuration Synchronization
 */
async function runSync(config: Config) {
    const configPath = await getVitePressConfigPath(config.source);
    if (!configPath) {
        console.error(chalk.red(t.noConfig(config.source + '/.vitepress')));
        return;
    }

    const translator = new Translator(process.env.AI_API_KEY!, process.env.AI_BASE_URL!);
    const rawConfig = await fs.readFile(configPath, 'utf-8');

    for (const target of config.targets) {
        const spinner = ora(t.syncing(target)).start();

        // Prompt to extract nav/sidebar and prefix links
        const defaultSyncPrompt = `Extract 'nav' and 'sidebar' from the VitePress config code. Translate 'text' and 'label' values to ${target}. For 'link' values only: if it starts with '/', prefix it with '/${target}'. Do NOT modify sidebar object keys — keep them exactly as-is. Return ONLY a clean JSON object.`;
        const syncPrompt = config.prompt?.sync
          ? interpolateVariables(config.prompt.sync, { target })
          : defaultSyncPrompt;

        try {
            let result = await translator.translate(rawConfig, target, config.model, {}, syncPrompt);

            // Clean AI response to ensure valid JSON
            const jsonMatch = result?.match(/\{[\s\S]*\}/);
            if (jsonMatch) result = jsonMatch[0];

            const i18nDir = path.resolve(config.source, '.vitepress', 'i18n');
            await fs.ensureDir(i18nDir);
            await fs.writeJson(path.join(i18nDir, `${target}.json`), JSON.parse(result || '{}'), { spaces: 2 });

            spinner.succeed(chalk.green(t.syncSuccess(`${target}.json`)));
        } catch (err: any) {
            spinner.fail(chalk.red(`[${target}] Sync failed: ${err.message}`));
        }
    }
}

/**
 * Core Logic: Initialize configuration files
 */
async function runInit() {
    const envPath = path.resolve('.env');
    const configPath = path.resolve('vpi18n.config.json');

    console.log(chalk.cyan(t.initStart));

    // Create .env template
    if (!(await fs.pathExists(envPath))) {
        const envContent = `AI_API_KEY=your_api_key_here
AI_MODEL=deepseek-chat
AI_BASE_URL=https://api.deepseek.com/v1
`;
        await fs.writeFile(envPath, envContent);
        console.log(chalk.green(t.envCreated));
    } else {
        console.log(chalk.yellow(t.envExists));
    }

    // Create vpi18n.config.json
    if (!(await fs.pathExists(configPath))) {
        const configContent = {
            source: 'docs',
            target: 'zh',
            glossary: null,
            prompt: {
                translate: '',
                sync: ''
            }
        };
        await fs.writeJson(configPath, configContent, { spaces: 2 });
        console.log(chalk.green(t.configCreated));
    } else {
        console.log(chalk.yellow(t.configExists));
    }

    console.log(chalk.blue.bold(t.initDone));
}


// --- CLI Commands Registration ---

cli.command('init', 'Initialize configuration files (.env & config.json)').action(runInit);

cli.command('gen', 'Translate Markdown documents')
    .option('-t, --target <lang>', 'Target language(s), e.g., en,jp')
    .action(async (opt) => runGen(await getResolvedConfig(opt)));

cli.command('sync', 'Synchronize nav and sidebar configurations')
    .option('-t, --target <lang>', 'Target language(s)')
    .action(async (opt) => runSync(await getResolvedConfig(opt)));

cli.command('all', 'Translate docs and sync menu (Default)')
    .option('-t, --target <lang>', 'Target language(s)')
    .action(async (opt) => {
        const config = await getResolvedConfig(opt);
        await runGen(config);
        await runSync(config);
        console.log(chalk.blue.bold(t.allDone));
    });

// Support default command
cli.command('[...args]', 'Shortcut for "all"').action(() => cli.parse(['', '', 'all']));

cli.help();
cli.parse();