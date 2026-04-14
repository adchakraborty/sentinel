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
  options?: { temperature?: number; maxTokens?: number; jsonMode?: boolean },
): Promise<string> {
  const token = getToken();

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const body: Record<string, unknown> = {
        model: MODEL,
        messages,
        temperature: options?.temperature ?? 0.3,
        max_tokens: options?.maxTokens ?? 8192,
      };

      if (options?.jsonMode) {
        body.response_format = { type: 'json_object' };
      }

      const response = await fetch(GITHUB_MODELS_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
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
 * Extract the JSON array substring from raw LLM text.
 * Handles markdown fences, leading prose, and partial arrays.
 */
function extractJsonArray(raw: string): string {
  let s = raw;

  const fenceMatch = s.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) s = fenceMatch[1].trim();

  const fullArray = s.match(/\[[\s\S]*\]/);
  if (fullArray) return fullArray[0];

  const partialArray = s.match(/\[[\s\S]*/);
  if (partialArray) return partialArray[0];

  throw new Error(`LLM response did not contain a JSON array. Preview: ${raw.substring(0, 200)}`);
}

/**
 * Walk through a JSON string character-by-character, fixing:
 * - Invalid escape sequences inside strings (e.g. \' \. \x)
 * - Raw control characters inside strings (newlines, tabs)
 * - Trailing commas before ] or }
 * - Unclosed strings, objects, arrays (truncated output)
 */
function repairLlmJson(raw: string): string {
  const out: string[] = [];
  let inString = false;
  let i = 0;
  const len = raw.length;

  while (i < len) {
    const ch = raw[i];

    if (!inString) {
      if (ch === '"') {
        inString = true;
        out.push(ch);
        i++;
      } else {
        out.push(ch);
        i++;
      }
      continue;
    }

    if (ch === '"') {
      inString = false;
      out.push(ch);
      i++;
      continue;
    }

    if (ch === '\\') {
      const next = i + 1 < len ? raw[i + 1] : '';
      if ('"\\/bfnrt'.includes(next)) {
        out.push(ch, next);
        i += 2;
        continue;
      }
      if (next === 'u') {
        out.push(ch, next);
        i += 2;
        continue;
      }
      out.push('\\\\');
      i++;
      continue;
    }

    if (ch === '\n') { out.push('\\n'); i++; continue; }
    if (ch === '\r') { out.push('\\r'); i++; continue; }
    if (ch === '\t') { out.push('\\t'); i++; continue; }
    const code = ch.charCodeAt(0);
    if (code < 0x20) { i++; continue; }

    out.push(ch);
    i++;
  }

  let s = out.join('');

  if (inString) s += '"';

  s = s.replace(/,\s*([\]}])/g, '$1');

  let brackets = 0;
  let braces = 0;
  let inStr2 = false;
  for (let j = 0; j < s.length; j++) {
    const c = s[j];
    if (c === '"' && (j === 0 || s[j - 1] !== '\\')) { inStr2 = !inStr2; continue; }
    if (inStr2) continue;
    if (c === '[') brackets++;
    else if (c === ']') brackets--;
    else if (c === '{') braces++;
    else if (c === '}') braces--;
  }

  while (braces > 0) { s += '}'; braces--; }
  while (brackets > 0) { s += ']'; brackets--; }

  s = s.replace(/,\s*([\]}])/g, '$1');

  return s;
}

/**
 * Parse LLM JSON with multiple fallback strategies.
 */
function parseLlmJson(raw: string): unknown[] {
  const jsonStr = extractJsonArray(raw);

  try {
    const direct = JSON.parse(jsonStr);
    if (Array.isArray(direct)) return direct;
  } catch { /* try repair */ }

  try {
    const repaired = repairLlmJson(jsonStr);
    const result = JSON.parse(repaired);
    if (Array.isArray(result)) return result;
    if (result && typeof result === 'object') return [result];
  } catch { /* try last resort */ }

  try {
    const stripped = jsonStr.replace(/[\x00-\x1f]+/g, ' ');
    const repaired = repairLlmJson(stripped);
    const result = JSON.parse(repaired);
    if (Array.isArray(result)) return result;
    if (result && typeof result === 'object') return [result];
  } catch (e) {
    const preview = jsonStr.substring(0, 300).replace(/[\n\r]/g, '\\n');
    throw new Error(
      `Failed to parse LLM JSON after all repair attempts. ` +
      `Error: ${e instanceof Error ? e.message : 'Unknown'}. ` +
      `Preview: ${preview}`,
    );
  }

  throw new Error('Parsed result is not an array or object');
}

export async function generateAttackPlans(systemPrompt: string, userPrompt: string): Promise<unknown[]> {
  const jsonSystemPrompt = systemPrompt.replace(
    'Return ONLY the JSON array, no markdown fences or explanation',
    'Return a JSON object with a single key "plans" containing the array. Example: {"plans": [...]}. No markdown fences.',
  );

  try {
    const raw = await chatCompletion([
      { role: 'system', content: jsonSystemPrompt },
      { role: 'user', content: userPrompt },
    ], { temperature: 0.2, maxTokens: 16384, jsonMode: true });

    const parsed = JSON.parse(raw);
    if (parsed.plans && Array.isArray(parsed.plans)) return parsed.plans;
    if (Array.isArray(parsed)) return parsed;
    const values = Object.values(parsed);
    for (const v of values) {
      if (Array.isArray(v)) return v;
    }
    throw new Error('JSON mode response has no array');
  } catch (jsonModeErr) {
    console.error('[SENTINEL] JSON mode failed, falling back to text mode:', jsonModeErr);
  }

  const raw = await chatCompletion([
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ], { temperature: 0.2, maxTokens: 16384 });

  return parseLlmJson(raw);
}
