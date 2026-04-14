const GITHUB_MODELS_ENDPOINT = 'https://models.github.ai/inference/chat/completions';
const MODEL = 'openai/gpt-4o';
const MAX_RETRIES = 2;

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface ChatCompletionResponse {
  choices: Array<{
    message: { content: string };
    finish_reason: string;
  }>;
  error?: { message: string };
}

function getToken(): string {
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    throw new Error(
      'GITHUB_TOKEN not found. Set it as a system environment variable with models:read scope.\n' +
      'Windows: setx GITHUB_TOKEN "ghp_your_token_here"\n' +
      'Then restart your terminal/IDE.',
    );
  }
  return token;
}

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function chatCompletion(
  messages: ChatMessage[],
  options?: { temperature?: number; maxTokens?: number },
): Promise<string> {
  const token = getToken();

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(GITHUB_MODELS_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          model: MODEL,
          messages,
          temperature: options?.temperature ?? 0.3,
          max_tokens: options?.maxTokens ?? 8192,
        }),
      });

      if (response.status === 429 && attempt < MAX_RETRIES) {
        const retryAfter = parseInt(response.headers.get('retry-after') || '5', 10);
        await sleep(retryAfter * 1000);
        continue;
      }

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`GitHub Models API error (${response.status}): ${errorText}`);
      }

      const data = (await response.json()) as ChatCompletionResponse;

      if (data.error) {
        throw new Error(`API error: ${data.error.message}`);
      }

      const content = data.choices?.[0]?.message?.content;
      if (!content) {
        throw new Error('Empty response from GitHub Models API');
      }

      return content;
    } catch (err) {
      if (attempt === MAX_RETRIES) throw err;
      await sleep(2000 * (attempt + 1));
    }
  }

  throw new Error('Max retries exceeded');
}

/**
 * Fix invalid escape sequences that LLMs commonly produce inside JSON strings.
 */
function fixEscapes(raw: string): string {
  let result = '';
  let inString = false;
  let i = 0;

  while (i < raw.length) {
    const ch = raw[i];

    if (ch === '"' && (i === 0 || raw[i - 1] !== '\\')) {
      inString = !inString;
      result += ch;
      i++;
      continue;
    }

    if (inString && ch === '\\') {
      const next = raw[i + 1];
      if (next && '"\\/bfnrtu'.includes(next)) {
        result += ch + next;
        i += 2;
        continue;
      }
      result += '\\\\';
      i++;
      continue;
    }

    if (inString && ch === '\n') { result += '\\n'; i++; continue; }
    if (inString && ch === '\r') { result += '\\r'; i++; continue; }
    if (inString && ch === '\t') { result += '\\t'; i++; continue; }

    result += ch;
    i++;
  }

  return result;
}

/**
 * Repair structurally broken JSON from LLM output:
 * - Remove trailing commas before ] or }
 * - Close unclosed brackets/braces/strings (truncated output)
 * - Strip JS-style comments
 */
function repairJson(raw: string): string {
  let s = raw;

  s = s.replace(/\/\/[^\n]*/g, '');
  s = s.replace(/\/\*[\s\S]*?\*\//g, '');

  s = s.replace(/,\s*([\]}])/g, '$1');

  s = fixEscapes(s);

  try {
    JSON.parse(s);
    return s;
  } catch { /* continue repairing */ }

  let openBrackets = 0;
  let openBraces = 0;
  let inStr = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '"' && (i === 0 || s[i - 1] !== '\\')) { inStr = !inStr; continue; }
    if (inStr) continue;
    if (c === '[') openBrackets++;
    else if (c === ']') openBrackets--;
    else if (c === '{') openBraces++;
    else if (c === '}') openBraces--;
  }

  if (inStr) s += '"';

  s = s.replace(/,\s*([\]}])/g, '$1');

  while (openBraces > 0) { s += '}'; openBraces--; }
  while (openBrackets > 0) { s += ']'; openBrackets--; }

  s = s.replace(/,\s*([\]}])/g, '$1');

  return s;
}

/**
 * Try multiple strategies to parse LLM JSON output.
 */
function parseLlmJson(raw: string): unknown[] {
  let jsonStr = raw;
  const fenceMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) {
    jsonStr = fenceMatch[1].trim();
  }

  const arrayMatch = jsonStr.match(/\[[\s\S]*\]/);
  if (!arrayMatch) {
    const partialArray = jsonStr.match(/\[[\s\S]*/);
    if (partialArray) {
      jsonStr = partialArray[0];
    } else {
      throw new Error(`LLM response did not contain a JSON array. Response preview: ${raw.substring(0, 200)}`);
    }
  } else {
    jsonStr = arrayMatch[0];
  }

  const attempts: Array<{ name: string; fn: () => unknown }> = [
    { name: 'direct', fn: () => JSON.parse(jsonStr) },
    { name: 'fix-escapes', fn: () => JSON.parse(fixEscapes(jsonStr)) },
    { name: 'repair', fn: () => JSON.parse(repairJson(jsonStr)) },
    {
      name: 'aggressive-repair',
      fn: () => {
        let s = jsonStr;
        s = s.replace(/[\x00-\x1f]/g, (m) => {
          if (m === '\n') return '\\n';
          if (m === '\r') return '\\r';
          if (m === '\t') return '\\t';
          return '';
        });
        return JSON.parse(repairJson(s));
      },
    },
  ];

  let lastErr: Error | null = null;
  for (const attempt of attempts) {
    try {
      const result = attempt.fn();
      if (Array.isArray(result)) return result;
      if (result && typeof result === 'object') return [result];
    } catch (e) {
      lastErr = e instanceof Error ? e : new Error(String(e));
    }
  }

  throw new Error(`Failed to parse LLM JSON: ${lastErr?.message || 'Unknown parse error'}`);
}

export async function generateAttackPlans(systemPrompt: string, userPrompt: string): Promise<unknown[]> {
  const raw = await chatCompletion([
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ], { temperature: 0.4, maxTokens: 16384 });

  return parseLlmJson(raw);
}
