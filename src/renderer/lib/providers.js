// Shared provider resolution (mirrored in the main-process pipeline).
// 'auto' = use the first configured key: OpenAI, then Gemini, then GroQ, else demo.
export const PROVIDERS = [
  { value: 'auto', label: 'Auto (recommended)' },
  { value: 'gemini', label: 'Google Gemini' },
  { value: 'groq', label: 'GroQ — free tier (Whisper + GPT-OSS)' },
  { value: 'openai', label: 'OpenAI' },
  { value: 'demo', label: 'Demo (no key, simulated)' },
];

export function effectiveProvider(settings) {
  if (!settings) return 'demo';
  if (['openai', 'gemini', 'groq', 'demo'].includes(settings.provider)) return settings.provider;
  if (settings.apiKey) return 'openai';
  if (settings.geminiApiKey) return 'gemini';
  if (settings.groqApiKey) return 'groq';
  return 'demo';
}
