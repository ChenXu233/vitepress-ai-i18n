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
    /\{\{(lang|glossary|target)\}\}/g,
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
Keep Markdown structures and code blocks intact.
Keep Frontmatter as raw YAML between --- delimiters, never wrap it in code blocks.
Preserve Frontmatter keys, only translate their string values if applicable.
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