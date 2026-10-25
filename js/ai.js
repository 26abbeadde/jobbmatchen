// AI-hjälp via Anthropics API med din egen nyckel: bedömning av en annons,
// utkast till personligt brev och tips på hur CV:t kan anpassas.

import { AI_MODEL, SDK_URL } from './config.js';

let sdk = null;

async function ask(apiKey, { system, content, schema }) {
  sdk ||= await import(SDK_URL);
  const client = new sdk.default({ apiKey, dangerouslyAllowBrowser: true });
  const response = await client.beta.messages.create({
    model: AI_MODEL,
    max_tokens: 16000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort: 'medium', ...(schema && { format: { type: 'json_schema', schema } }) },
    system,
    messages: [{ role: 'user', content }],
  });
  if (response.stop_reason === 'refusal') throw new Error('AI:n kunde inte hjälpa till med den här annonsen.');
  if (response.stop_reason === 'max_tokens') throw new Error('Svaret blev för långt. Försök igen.');
  const text = response.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
  return schema ? JSON.parse(text) : text.trim();
}

export function describeError(err) {
  const A = sdk?.default;
  if (A && err instanceof A.AuthenticationError) return 'API-nyckeln godkändes inte. Kontrollera den under AI-hjälp.';
  if (A && err instanceof A.PermissionDeniedError) return 'API-nyckeln saknar behörighet till modellen.';
  if (A && err instanceof A.RateLimitError) return 'För många anrop just nu. Vänta en stund och försök igen.';
  if (A && err instanceof A.APIConnectionError) return 'Kunde inte nå Anthropic. Kontrollera internetanslutningen.';
  if (A && err instanceof A.APIError) return `Anthropic svarade med fel ${err.status ?? ''}: ${err.message}`;
  return err.message;
}

const RECRUITER = 'Du är en erfaren rekryterare och karriärcoach i Sverige. Skriv på svenska och utgå bara från det som står i underlagen.';

function material({ keywords, tools, cvText }, ad) {
  return `## Kandidaten\nNyckelord: ${keywords.join(', ') || '–'}\nVerktyg och system: ${tools.join(', ') || '–'}\n\n` +
    `CV:\n${cvText || '(inget CV uppladdat)'}\n\n` +
    `## Jobbannonsen\nRubrik: ${ad.headline}\nArbetsgivare: ${ad.employer?.name || '–'}\nYrke: ${ad.occupation?.label || '–'}\n` +
    `Ska-krav enligt annonsens metadata: ${(ad.must_have?.skills || []).map((s) => s.label).join(', ') || '–'}\n\n` +
    (ad.description?.text || '');
}

const ANALYSIS_SCHEMA = {
  type: 'object',
  properties: {
    matchning: { type: 'integer', description: 'Hur väl kandidaten passar tjänsten, 0–100' },
    sammanfattning: { type: 'string', description: 'Två till tre meningar om helhetsbedömningen' },
    styrkor: { type: 'array', items: { type: 'string' }, description: 'Konkreta skäl till att kandidaten passar' },
    luckor: { type: 'array', items: { type: 'string' }, description: 'Krav eller önskemål kandidaten inte verkar uppfylla' },
    tips: { type: 'string', description: 'Ett konkret tips för ansökan' },
  },
  required: ['matchning', 'sammanfattning', 'styrkor', 'luckor', 'tips'],
  additionalProperties: false,
};

const CV_TIPS_SCHEMA = {
  type: 'object',
  properties: {
    tips: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          rubrik: { type: 'string', description: 'Vad i CV:t som ska ändras, kort' },
          forslag: { type: 'string', description: 'Konkret förslag, gärna med exempelformulering' },
        },
        required: ['rubrik', 'forslag'],
        additionalProperties: false,
      },
    },
    nyckelord: { type: 'array', items: { type: 'string' }, description: 'Ord ur annonsen som CV:t bör innehålla om de stämmer' },
  },
  required: ['tips', 'nyckelord'],
  additionalProperties: false,
};

export const analyze = (apiKey, profile, ad) => ask(apiKey, {
  system: `${RECRUITER} Bedöm hur väl kandidaten passar jobbannonsen. Var konkret och ärlig, och skilj på ska-krav och meriterande.`,
  content: material(profile, ad),
  schema: ANALYSIS_SCHEMA,
});

export const coverLetter = (apiKey, profile, ad) => ask(apiKey, {
  system: `${RECRUITER} Hitta aldrig på erfarenheter, utbildningar eller resultat som inte finns i underlagen.`,
  content: material(profile, ad) +
    '\n\n## Uppgift\nSkriv ett personligt brev (cirka 250–350 ord) till den här tjänsten. Lyft det i kandidatens bakgrund som bäst svarar mot annonsens krav. ' +
    'Där kandidaten behöver fylla i något själv, skriv det inom [hakparenteser]. Svara med enbart brevet.',
});

export const cvTips = (apiKey, profile, ad) => ask(apiKey, {
  system: `${RECRUITER} Ge råd om hur kandidaten kan anpassa sitt CV till en specifik annons, utan att hitta på något.`,
  content: material(profile, ad) + '\n\n## Uppgift\nGe 3–6 konkreta förslag på hur CV:t kan anpassas för just den här annonsen.',
  schema: CV_TIPS_SCHEMA,
});
