import { z } from 'zod';
const completionSchema = z.object({ choices: z.array(z.object({ message: z.object({ content: z.string() }) })).min(1) });
export async function chatCompletion(prompt: string, fetcher: typeof fetch = fetch, sessionId = 'growth-os-session', modelOverride?: string, jsonMode = false): Promise<string> {
  const base = process.env.AI_BASE_URL;
  const key = process.env.AI_API_KEY;
  const model = modelOverride ?? process.env.AI_MODEL;
  if (!base || !key || !model) throw new Error('请先配置 AI_BASE_URL、AI_API_KEY 和 AI_MODEL');
  const headers: Record<string, string> = { 'content-type': 'application/json', authorization: `Bearer ${key}`, 'user-agent': process.env.AI_USER_AGENT ?? 'growth-os/0.1.0' };
  if (process.env.AI_SEND_SESSION_HEADER === 'true') headers['x-opencode-session'] = sessionId;
  const extra = process.env.AI_EXTRA_HEADERS;
  if (extra) {
    const parsed: unknown = JSON.parse(extra);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) for (const [name, value] of Object.entries(parsed)) if (typeof value === 'string') headers[name] = value;
  }
  let response: Response | null = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      response = await fetcher(`${base.replace(/\/$/, '')}/chat/completions`, { method: 'POST', headers, body: JSON.stringify({ model, messages: [{ role: 'user', content: prompt }], temperature: 0.3, ...(jsonMode ? { response_format: { type: 'json_object' } } : {}) }), signal: AbortSignal.timeout(Number(process.env.AI_TIMEOUT_MS ?? 90000)) });
    } catch (error) {
      if (attempt === 1) throw error;
      continue;
    }
    if (response.status === 429) throw new Error('本期额度用完');
    if (response.ok) break;
    if (attempt === 1) throw new Error(`AI 服务返回 ${response.status}`);
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  if (!response?.ok) throw new Error(`AI 服务返回 ${response?.status ?? '未知错误'}`);
  const parsed = completionSchema.safeParse(await response.json());
  if (!parsed.success) throw new Error('AI 返回格式无效');
  return parsed.data.choices[0]?.message.content ?? '';
}
