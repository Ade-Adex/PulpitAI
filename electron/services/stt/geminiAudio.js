// Gemini audio client (Google AI Studio - FREE tier works, no card needed).
// One call does BOTH jobs: Yoruba transcription + English translation,
// returning strict JSON via responseSchema. Much cheaper than two calls.
const API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

const PROMPT = [
  'You are a live interpreter for Yoruba Christian sermons.',
  'The user message is an audio clip of a person speaking Yoruba.',
  '1. Transcribe the Yoruba speech exactly as spoken, with correct Yoruba',
  '   orthography (toned vowels, diacritics) and punctuation.',
  '2. Translate it into natural, fluent English. Preserve Bible references',
  '   (e.g. "Johannesu 3:16" becomes "John 3:16"). Keep the preacher\'s tone.',
  'Return both fields even if the speech is short.',
].join('\n');

const RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    yoruba: { type: 'STRING' },
    english: { type: 'STRING' },
  },
  required: ['yoruba', 'english'],
};

export async function transcribeAndTranslate({ apiKey, model, audioBlob }) {
  if (!apiKey) throw new Error('No Gemini API key configured. Set it in Settings.');

  const bytes = Buffer.from(await audioBlob.arrayBuffer());
  const base64 = bytes.toString('base64');

  const res = await fetch(
    `${API_BASE}/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts: [
              { text: PROMPT },
              { inline_data: { mime_type: 'audio/webm', data: base64 } },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.2,
          responseMimeType: 'application/json',
          responseSchema: RESPONSE_SCHEMA,
        },
      }),
      signal: AbortSignal.timeout(60_000),
    },
  );

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    const hint =
      res.status === 429
        ? ' (free-tier rate limit - wait a few seconds and try again)'
        : res.status === 400 || res.status === 403
          ? ' (check your Gemini API key in Settings)'
          : '';
    throw new Error(`Gemini request failed (${res.status})${hint}: ${detail.slice(0, 300)}`);
  }

  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts
    ?.map((p) => p.text ?? '')
    .join('')
    .trim();

  if (!text) throw new Error('Gemini returned an empty response.');

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(`Gemini returned invalid JSON: ${text.slice(0, 200)}`);
  }

  return {
    yoruba: (parsed.yoruba ?? '').trim(),
    english: (parsed.english ?? '').trim(),
  };
}
