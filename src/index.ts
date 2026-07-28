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
import { getFileHash, loadCache, createCacheWriter } from './utils.js';
import pLimit from 'p-limit';

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
    concurrencyInfo: (n: number) =>
        isZh ? `  并发: ${n} 个任务同时翻译` : `  Concurrency: ${n} parallel tasks`,
    errorSummary: (errors: { file: string; target: string; error: string }[]) =>
        isZh
            ? `⚠️ 翻译完成，${errors.length} 个文件失败:\n${errors.map(e => `  ${e.file} → ${e.target}: ${e.error}`).join('\n')}`
            : `⚠️ Translation completed, ${errors.length} files failed:\n${errors.map(e => `  ${e.file} → ${e.target}: ${e.error}`).join('\n')}`,
    strictMode: isZh ? '  严格模式: 失败即停' : '  Strict mode: stop on first failure',
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
    concurrency?: number;
    strict?: boolean;
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
        concurrency: options.concurrency ?? fileConfig.concurrency ?? 5,
        strict: options.strict ?? fileConfig.strict ?? false,
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
    const cacheWriter = createCacheWriter(cachePath, cache);

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

    // 打印并发信息
    const concurrency = config.concurrency ?? 5;
    console.log(chalk.dim(t.concurrencyInfo(concurrency)));
    if (config.strict) {
        console.log(chalk.dim(t.strictMode));
    }

    // 生成任务列表，跳过已缓存的
    type Task = {
        file: string;
        content: string;
        hash: string;
        target: string;
        outputPath: string;
        cacheKey: string;
    };

    const tasks: Task[] = [];
    for (const target of config.targets) {
        for (const file of files) {
            const content = await fs.readFile(file, 'utf-8');
            const hash = getFileHash(content);
            const cacheKey = `${file}:${target}`;
            const relativePath = path.relative(config.source, file);
            const outputPath = path.join(sourceDir, target, relativePath);

            if (cache[cacheKey] === hash && await fs.pathExists(outputPath)) {
                console.log(chalk.gray(t.skipped(relativePath)));
                continue;
            }

            tasks.push({ file, content, hash, target, outputPath, cacheKey });
        }
    }

    if (tasks.length === 0) {
        return;
    }

    // 并发池执行
    const limiter = pLimit(concurrency);
    const errors: { file: string; target: string; error: string }[] = [];

    const results = await Promise.allSettled(
        tasks.map(task => limiter(async () => {
            const relativePath = path.relative(config.source, task.file);
            const fileSpinner = ora(t.translating(relativePath, task.target)).start();

            try {
                const translated = await translator.translate(
                    task.content,
                    task.target,
                    config.model,
                    glossaryData,
                    config.prompt?.translate || undefined,
                    { lang: task.target, glossary: JSON.stringify(glossaryData) }
                );

                await fs.ensureFile(task.outputPath);
                await fs.writeFile(task.outputPath, translated || '');
                await cacheWriter.update(task.cacheKey, task.hash);

                fileSpinner.succeed(chalk.green(t.done(relativePath, task.target)));
            } catch (err: any) {
                fileSpinner.fail(chalk.red(t.fail(relativePath, task.target, err.message)));

                if (config.strict) {
                    errors.push({ file: relativePath, target: task.target, error: err.message });
                    throw err;
                }

                errors.push({ file: relativePath, target: task.target, error: err.message });
            }
        }))
    );

    // 等待所有缓存写入完成
    await cacheWriter.wait();

    // 严格模式下，检查是否有任务 rejected
    if (config.strict) {
        const rejected = results.filter(r => r.status === 'rejected');
        if (rejected.length > 0) {
            throw new Error(t.errorSummary(errors));
        }
    }

    // 宽容模式：打印失败汇总
    if (errors.length > 0) {
        console.warn(chalk.yellow(t.errorSummary(errors)));
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
        const defaultSyncPrompt = `You are a VitePress i18n config synchronizer.

Translate 'text' and 'label' values to ${target}.

For 'link' values in nav and sidebar items:
- If the link starts with '/en/', REPLACE '/en/' with '/${target}/'.
- If the link starts with '/' and does NOT contain '/en/', prefix with '/${target}'.

CRITICAL - sidebar keys MUST remain EXACTLY as-is from the source:
- NEVER modify sidebar keys like "/tutorial/", "/design/", "/reference/".
- Do NOT add locale prefix to sidebar keys.
- Keep them identical to the source en locale.

Return ONLY valid JSON. No markdown code fences, no explanations.`;
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
            concurrency: 5,
            strict: false,
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
    .option('-c, --concurrency <n>', 'Concurrent translation tasks')
    .option('--strict', 'Stop on first error')
    .action(async (opt) => runGen(await getResolvedConfig(opt)));

cli.command('sync', 'Synchronize nav and sidebar configurations')
    .option('-t, --target <lang>', 'Target language(s), e.g., en,jp')
    .action(async (opt) => runSync(await getResolvedConfig(opt)));

cli.command('all', 'Translate docs and sync menu (Default)')
    .option('-t, --target <lang>', 'Target language(s)')
    .option('-c, --concurrency <n>', 'Concurrent translation tasks')
    .option('--strict', 'Stop on first error')
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