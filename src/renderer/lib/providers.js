// Shared provider resolution (mirrored in the main-process pipeline).
// 'auto' = use the first configured key: OpenAI, then Gemini, else demo.
export const PROVIDERS = [
  { value: 'auto', label: 'Auto (recommended)' },
  { value: 'gemini', label: 'Google Gemini — free tier' },
  { value: 'openai', label: 'OpenAI' },
  { value: 'demo', label: 'Demo (no key, simulated)' },
];

export function effectiveProvider(settings) {
  if (!settings) return 'demo';
  if (['openai', 'gemini', 'demo'].includes(settings.provider)) return settings.provider;
  if (settings.apiKey) return 'openai';
  if (settings.geminiApiKey) return 'gemini';
  return 'demo';
}
