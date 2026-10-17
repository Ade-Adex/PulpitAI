// Demo-mode transcription: returns scripted Yoruba phrases with matching
// English, so the full pipeline (capture -> VAD -> caption -> overlay) can
// be tested without any API key or cost. Used automatically when no key
// is configured in Settings.
const DEMO_LINES = [
  { yoruba: 'Ọ̀rọ̀ Ọlọ́run ni mo ń sọ sí yín lónìí.', english: 'I am speaking the word of God to you today.' },
  { yoruba: 'Ẹ jẹ́ ká dúpẹ́ fún Ọlọ́run fún ohun gbogbo.', english: 'Let us give thanks to God for everything.' },
  { yoruba: 'Ọlọ́run Ọlágbára ni, ó ò sí ohunkóhun tó le dá à wa lára.', english: 'God is Almighty; there is nothing that can stand against us.' },
  { yoruba: 'Bí a bá gbàgbọ́ nínú rẹ̀, ọ̀ràn gbogbo yóò dára.', english: 'If we believe in Him, everything will be well.' },
  { yoruba: 'Ìyìn, ìwọ̀ràn, àti ìfẹ́ Ọlọ́run ń bọ́ fún yín.', english: 'Grace, peace, and the love of God are coming to you.' },
  { yoruba: 'Ẹ máa rántí pé, Ọlọ́run ò tí yí padà.', english: 'Remember always, God never changes.' },
];

let callCount = 0;

// Simulate API latency so the UI behaves like the real providers.
function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function mockTranscribe(audioBlob) {
  await delay(300 + Math.random() * 500);

  const line = DEMO_LINES[callCount % DEMO_LINES.length];
  callCount += 1;

  return {
    text: line.yoruba,
    english: line.english,
    language: 'yo',
    // webm/opus runs roughly 12 KB/s; good enough for a demo duration readout.
    durationSec: Math.max(1, Math.round((audioBlob?.size ?? 12000) / 12000)),
  };
}
