/**
 * On-demand message translation (catalogue: "On-demand Translation").
 * Providers, selected by UMC_TRANSLATION_PROVIDER:
 *   - 'llm'   : LLM-backed translation (works with the program's own model
 *               access; language-aware, Banglish-capable)
 *   - 'libre' : any self-hosted LibreTranslate-compatible endpoint given via
 *               UMC_TRANSLATION_ENDPOINT — no vendor implied, pure HTTP client
 * Results are cached on the message row.
 */
import type { TranslationProvider } from '../adapters/types';
import { config } from '../config';

export class LlmTranslationProvider implements TranslationProvider {
  readonly provider = 'llm';

  async translate(text: string, target: string): Promise<{ text: string; lang: string }> {
    const { default: ZAI } = await import('z-ai-web-dev-sdk');
    const zai = await ZAI.create();
    const langName =
      target === 'bn' ? 'Bengali (বাংলা)' : target === 'en' ? 'English' : target === 'banglish' ? 'Banglish (Bengali written in Latin script)' : target;
    const completion = await zai.chat.completions.create({
      messages: [
        { role: 'assistant', content: `You are a precise translator. Translate the user text into ${langName}. Output ONLY the translation, nothing else. Keep names, numbers and URLs unchanged.` },
        { role: 'user', content: text },
      ],
      thinking: { type: 'disabled' },
    });
    const out = completion.choices[0]?.message?.content?.trim();
    if (!out) throw new Error('Empty translation response');
    return { text: out, lang: target };
  }
}

export class LibreTranslateProvider implements TranslationProvider {
  readonly provider = 'libre';
  private endpoint: string;

  constructor(endpoint: string) {
    if (!endpoint) throw new Error('LibreTranslateProvider requires UMC_TRANSLATION_ENDPOINT');
    this.endpoint = endpoint;
  }

  async translate(text: string, target: string): Promise<{ text: string; lang: string }> {
    const res = await fetch(`${this.endpoint}/translate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ q: text, target, format: 'text' }),
    });
    if (!res.ok) throw new Error(`Translation endpoint error ${res.status}`);
    const data = (await res.json()) as { translatedText?: string };
    if (!data.translatedText) throw new Error('Empty translation response');
    return { text: data.translatedText, lang: target };
  }
}

export function getTranslationProvider(): TranslationProvider {
  if (config.translationProvider === 'libre') {
    return new LibreTranslateProvider(config.translationEndpoint);
  }
  return new LlmTranslationProvider();
}
