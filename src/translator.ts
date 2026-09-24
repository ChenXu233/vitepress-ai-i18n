import OpenAI from 'openai';

/**
 * Interpolate {{variable}} placeholders in a prompt string.
 * Appends any variables that were NOT used in the template.
 */
export function interpolateVariables(
  template: string,
  variables: Record<string, string>
): string {
  const used = new Set<string>();
  let result = template.replace(
    /\{\{(lang|glossary|target|sourcePath|targetPath)\}\}/g,
    (_match, key: string) => {
      used.add(key);
      return variables[key] ?? '';
    }
  );

  // Append missing variables
  const suffixes: string[] = [];
  if (variables.lang && !used.has('lang')) {
    suffixes.push(`Target language: ${variables.lang}`);
  }
  if (variables.target && !used.has('target')) {
    suffixes.push(`Target language: ${variables.target}`);
  }
  if (variables.glossary && !used.has('glossary')) {
    suffixes.push(`Glossary: ${variables.glossary}`);
  }
  if (variables.sourcePath && !used.has('sourcePath')) {
    suffixes.push(`Source file path (relative to docs root): ${variables.sourcePath}`);
  }
  if (variables.targetPath && !used.has('targetPath')) {
    suffixes.push(`Target file path (relative to docs root): ${variables.targetPath}`);
  }

  if (suffixes.length > 0) {
    result = result + '\n' + suffixes.join('\n');
  }

  return result;
}

/**
 * Filter glossary to only include terms present in the content.
 * Case-insensitive substring matching.
 */
export function filterGlossary(
  content: string,
  glossary: Record<string, string>
): Record<string, string> {
  if (!content || !glossary || Object.keys(glossary).length === 0) {
    return {};
  }
  const lowerContent = content.toLowerCase();
  const filtered: Record<string, string> = {};
  for (const [key, value] of Object.entries(glossary)) {
    if (lowerContent.includes(key.toLowerCase())) {
      filtered[key] = value;
    }
  }
  return filtered;
}

export class Translator {
  private client: OpenAI;
  constructor(apiKey: string, baseURL: string) {
    this.client = new OpenAI({ apiKey, baseURL });
  }

  async translate(
    content: string,
    lang: string,
    model: string,
    glossary: any,
    customSystemPrompt?: string,
    variables?: Record<string, string>
  ) {
    const filteredGlossary = filterGlossary(content, glossary);

    const defaultPrompt = `You are a technical translator. Translate to ${lang}.
Keep Markdown structures intact.
Keep Frontmatter as raw YAML between --- delimiters, translate only string values.
Keep code blocks (\`\`\`...) unchanged.
CRITICAL: NEVER wrap the ENTIRE response in code fences like \`\`\`markdown, \`\`\`md, or \`\`\`.
Return the translated Markdown content directly, not wrapped in any code block.
Keep relative links (](...)) byte-for-byte unchanged. Do NOT adjust \`../\` depth yourself.
Glossary: ${JSON.stringify(filteredGlossary)}`;

    let systemPrompt: string;
    if (customSystemPrompt) {
      const vars = {
        lang,
        glossary: JSON.stringify(filteredGlossary),
        ...variables,
      };
      systemPrompt = interpolateVariables(customSystemPrompt, vars);
    } else {
      systemPrompt = defaultPrompt;
    }

    const res = await this.client.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content }
      ],
      temperature: 0
    });
    return res.choices[0].message.content;
  }
}