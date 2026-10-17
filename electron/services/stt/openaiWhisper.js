// Whisper transcription client (OpenAI API).
// Accepts a Blob of audio (webm/opus from MediaRecorder) and returns Yoruba text.
export async function transcribeAudio({ apiKey, model, audioBlob }) {
  if (!apiKey) throw new Error('No OpenAI API key configured. Set it in Settings.');

  const form = new FormData();
  form.append('file', audioBlob, 'utterance.webm');
  form.append('model', model);
  form.append('language', 'yo'); // Yoruba
  // Helps Whisper keep church/proper nouns consistent between chunks.
  form.append('prompt', 'Ọ̀rọ̀ mímọ́ kan ni a ń sọ. Tún kọ orúkọ Jesu, Mọ́sè, Dafídù, àti àwọn ọrọ̀ mímọ́ dáadáa.');
  form.append('response_format', 'verbose_json');

  const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
    signal: AbortSignal.timeout(60_000),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Transcription failed (${res.status}): ${detail.slice(0, 300)}`);
  }

  const data = await res.json();
  return {
    text: (data.text || '').trim(),
    language: data.language,
    durationSec: data.duration,
  };
}
