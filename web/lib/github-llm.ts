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

export async function generateAttackPlans(systemPrompt: string, userPrompt: string): Promise<unknown[]> {
  const raw = await chatCompletion([
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ], { temperature: 0.4, maxTokens: 8192 });

  let jsonStr = raw;
  const fenceMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) {
    jsonStr = fenceMatch[1].trim();
  }

  const arrayMatch = jsonStr.match(/\[[\s\S]*\]/);
  if (!arrayMatch) {
    throw new Error(`LLM response did not contain a JSON array. Response preview: ${raw.substring(0, 200)}`);
  }

  let plans: unknown;
  try {
    plans = JSON.parse(arrayMatch[0]);
  } catch (parseErr) {
    throw new Error(`Failed to parse LLM JSON: ${parseErr instanceof Error ? parseErr.message : 'Unknown parse error'}`);
  }

  if (!Array.isArray(plans)) {
    throw new Error('Parsed response is not an array');
  }

  return plans;
}
