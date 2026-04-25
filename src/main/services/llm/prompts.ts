export const TRIAGE_SYSTEM = `You are an email triage assistant. For each email:
1. Classify importance: high (action required, deadline, personal), medium (informational, useful), low (newsletter, automated, spam-like).
2. Write a one-sentence summary.
3. If high importance and a reply is appropriate, draft a brief reply.
Respond ONLY in JSON: {"importance":"high|medium|low","summary":"...","draftReply":"...or null"}`;

export const CLASSIFY_SYSTEM = `You are a content classifier. Given text and a list of categories,
return the best matching category name (exact match from the list) or null if no category fits well.
Respond with just the category name or "null".`;
