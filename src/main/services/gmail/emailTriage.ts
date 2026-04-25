import { callLLM } from '../llm/llmService';
import { TRIAGE_SYSTEM } from '../llm/prompts';
import type { FetchedEmail } from './imapClient';
import type { EmailDigestItem } from '../../../shared/schema/index';

export async function triageEmail(e: FetchedEmail): Promise<Partial<EmailDigestItem>> {
  try {
    const response = await callLLM([
      { role: 'system', content: TRIAGE_SYSTEM },
      {
        role: 'user',
        content: `From: ${e.from}\nSubject: ${e.subject}\n\n${e.body.slice(0, 2000)}`,
      },
    ]);

    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return fallback(e);

    const parsed = JSON.parse(jsonMatch[0]) as {
      importance?: string;
      summary?: string;
      draftReply?: string | null;
    };

    return {
      importance: (['high', 'medium', 'low'].includes(parsed.importance ?? '')
        ? parsed.importance as 'high' | 'medium' | 'low'
        : 'medium'),
      summary:    parsed.summary,
      draftReply: parsed.draftReply ?? undefined,
    };
  } catch {
    return fallback(e);
  }
}

function fallback(e: FetchedEmail): Partial<EmailDigestItem> {
  return { importance: 'medium', summary: e.subject };
}
