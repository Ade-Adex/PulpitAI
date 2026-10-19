// Gemini audio client (Google AI Studio - FREE tier works, no card needed).
// One call does BOTH jobs: Yoruba transcription + English translation,
// returning strict JSON via responseSchema. Much cheaper than two calls.
const API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

const PROMPT = [
  'You are a professional Yoruba-to-English interpreter for live Christian sermons.',
  'The user message is a short audio clip of a person speaking Yoruba.',
  'TRANSCRIPTION ("yoruba"): write exactly what is spoken in standard Yoruba',
  'orthography — always include tone marks and underdots (e.g. ìrètí, àgbàrá,',
  'ìṣẹ̀, ọmọ, ṣe) and natural punctuation. Never translate in this field.',
  'TRANSLATION ("english"): natural, fluent, broadcast-quality English that',
  'keeps the preacher\'s tone. Do not summarize or add commentary. Convert',
  'scripture references to standard English (e.g. "Johannesu 3:16" → "John 3:16").',
  'Both fields are required even for very short clips.',
].join('\n');

const RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    yoruba: { type: 'STRING' },
    english: { type: 'STRING' },
  },
  required: ['yoruba', 'english'],
};

// Retry with exponential backoff for 429 rate-limit errors.
// Free tier Gemini is generous but not unlimited — back off and retry so
// a transient quota spike doesn't kill the whole transcript session.
async function fetchWithRetry(url, opts, maxRetries = 3) {
  let lastErr = null;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const res = await fetch(url, opts);
    if (res.ok) return res;
    if (res.status === 429) {
      const detail = await res.text().catch(() => '');
      const retryAfter = res.headers.get('retry-after');
      const delayMs = retryAfter ? parseInt(retryAfter, 10) * 1000 : Math.min(800 * 2 ** attempt, 4000);
      lastErr = new Error(`Gemini rate-limited (429). Retrying in ${delayMs / 1000}s... ${detail.slice(0, 200)}`);
      console.warn(`[geminiAudio] ${lastErr.message}`);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      continue;
    }
    const detail = await res.text().catch(() => '');
    const hint = res.status === 400 || res.status === 403 ? ' (check your Gemini API key in Settings)' : '';
    throw new Error(`Gemini request failed (${res.status})${hint}: ${detail.slice(0, 300)}`);
  }
  throw lastErr;
}

export async function transcribeAndTranslate({ apiKey, model, audioBlob }) {
  if (!apiKey) throw new Error('No Gemini API key configured. Set it in Settings.');

  const bytes = Buffer.from(await audioBlob.arrayBuffer());
  const base64 = bytes.toString('base64');

  const res = await fetchWithRetry(
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
          temperature: 0, // deterministic = more accurate + slightly faster
          responseMimeType: 'application/json',
          responseSchema: RESPONSE_SCHEMA,
        },
      }),
      signal: AbortSignal.timeout(30_000),
    },
  );

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

// ---------------------------------------------------------------------------
// Streaming variant: same prompt/schema, but reads the SSE stream from
// :streamGenerateContent and reports partial text as Gemini generates it.
// This is what makes captions appear word-by-word instead of waiting for the
// whole response.
// ---------------------------------------------------------------------------

// Tolerant extraction of a string field from a (possibly truncated) JSON
// document. Handles \" escapes, \n \t \r and \uXXXX. Returns whatever has
// been generated so far when the closing quote hasn't arrived yet.
function extractJsonString(json, field) {
  const key = `"${field}"`;
  const i = json.indexOf(key);
  if (i === -1) return null;
  let j = json.indexOf(':', i + key.length);
  if (j === -1) return null;
  j++;
  while (j < json.length && /\s/.test(json[j])) j++;
  if (json[j] !== '"') return null;
  j++;
  let out = '';
  for (; j < json.length; j++) {
    const c = json[j];
    if (c === '\\') {
      const n = json[j + 1];
      if (n === undefined) break; // trailing backslash — partial
      if (n === 'n') { out += '\n'; j++; }
      else if (n === 't') { out += '\t'; j++; }
      else if (n === 'r') { out += '\r'; j++; }
      else if (n === 'u') {
        const hex = json.slice(j + 2, j + 6);
        if (hex.length < 4 || !/^[0-9a-fA-F]{4}$/.test(hex)) break; // partial escape
        out += String.fromCharCode(parseInt(hex, 16));
        j += 5;
      } else { out += n; j++; }
      continue;
    }
    if (c === '"') break;
    out += c;
  }
  return out;
}

// Iterate `data:` payloads from a Server-Sent Events response body.
async function* sseData(res) {
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  const emitLines = function* () {
    let idx;
    while ((idx = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, idx).replace(/\r$/, '');
      buf = buf.slice(idx + 1);
      if (line.startsWith('data:')) yield line.slice(5).trim();
    }
  };
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    yield* emitLines();
  }
  buf += decoder.decode();
  yield* emitLines();
}

export async function streamTranscribeAndTranslate({ apiKey, model, audioBlob, onPartial }) {
  if (!apiKey) throw new Error('No Gemini API key configured. Set it in Settings.');

  const bytes = Buffer.from(await audioBlob.arrayBuffer());
  const base64 = bytes.toString('base64');

  const res = await fetchWithRetry(
    `${API_BASE}/${encodeURIComponent(model)}:streamGenerateContent?alt=sse&key=${encodeURIComponent(apiKey)}`,
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
          temperature: 0,
          responseMimeType: 'application/json',
          responseSchema: RESPONSE_SCHEMA,
        },
      }),
      signal: AbortSignal.timeout(30_000),
    },
  );

  let acc = '';
  for await (const data of sseData(res)) {
    if (!data || data === '[DONE]') continue;
    let json;
    try {
      json = JSON.parse(data);
    } catch {
      continue; // tolerate malformed keep-alive frames
    }
    const text = json.candidates?.[0]?.content?.parts
      ?.map((p) => p.text ?? '')
      .join('');
    if (!text) continue;
    acc = text;
    if (onPartial) {
      const yoruba = extractJsonString(acc, 'yoruba') ?? '';
      const english = extractJsonString(acc, 'english') ?? '';
      if (yoruba || english) onPartial({ yoruba, english });
    }
  }

  if (!acc.trim()) throw new Error('Gemini returned an empty response.');

  // Prefer the strict parse; if the stream was cut off, fall back to the
  // tolerant extractor so the text we already received still gets used.
  try {
    const parsed = JSON.parse(acc);
    return {
      yoruba: (parsed.yoruba ?? '').trim(),
      english: (parsed.english ?? '').trim(),
    };
  } catch {
    const yoruba = (extractJsonString(acc, 'yoruba') ?? '').trim();
    const english = (extractJsonString(acc, 'english') ?? '').trim();
    if (!yoruba && !english) {
      throw new Error(`Gemini returned invalid JSON: ${acc.slice(0, 200)}`);
    }
    return { yoruba, english };
  }
}
