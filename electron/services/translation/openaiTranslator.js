// Yoruba -> English translation client (OpenAI chat completions).
// Prompt is tuned for live preaching: keep scripture references, keep it terse.
const SYSTEM_PROMPT = [
  'You are a real-time interpreter translating live Yoruba Christian sermons into English.',
  'Rules:',
  '- Translate the Yoruba text into natural, fluent English.',
  '- Preserve Bible book/chapter/verse references exactly (e.g. "Johannesu 3:16" -> "John 3:16").',
  '- Keep the preacher\'s tone: passionate, pastoral, direct.',
  '- Output ONLY the English translation. No notes, no quotes, no transliteration.',
].join('\n');

export async function translateToEnglish({ apiKey, model, yorubaText }) {
  if (!yorubaText) return '';
  if (!apiKey) throw new Error('No OpenAI API key configured. Set it in Settings.');

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: yorubaText },
      ],
    }),
    signal: AbortSignal.timeout(30_000),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Translation failed (${res.status}): ${detail.slice(0, 300)}`);
  }

  const data = await res.json();
  return (data.choices?.[0]?.message?.content || '').trim();
}
