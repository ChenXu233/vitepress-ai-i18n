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

export class Translator {
  private client: OpenAI;
  constructor(apiKey: string, baseURL: string) {
    this.client = new OpenAI({ apiKey, baseURL });
  }

  async translate(content: string, lang: string, model: string, glossary: any, customSystemPrompt?: string) {
    // If customSystemPrompt is not provided, the default Markdown translation directives will be used.
    const defaultPrompt = `You are a technical translator. Translate to ${lang}.
Keep Markdown structures and code blocks intact.
Keep Frontmatter as raw YAML between --- delimiters, never wrap it in code blocks.
Preserve Frontmatter keys, only translate their string values if applicable.
Glossary: ${JSON.stringify(glossary)}`;

    const res = await this.client.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: customSystemPrompt || defaultPrompt },
        { role: 'user', content }
      ],
      temperature: 0
    });
    return res.choices[0].message.content;
  }
}