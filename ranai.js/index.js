import { PROVIDERS } from './config.js';

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

async function callGemini(apiKey, text, history = []) {
  const contents = [
    ...history.map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: String(m.content ?? '') }]
    })),
    { role: 'user', parts: [{ text }] }
  ];
  const response = await fetch(PROVIDERS.gemini.endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
    body: JSON.stringify({ contents })
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data?.error?.message || 'Gemini request failed');
  return data?.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('') || '';
}

async function callOpenRouter(apiKey, prompt) {
  const response = await fetch(PROVIDERS.openrouter.endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
      'HTTP-Referer': 'https://abhibirfacts.com',
      'X-Title': 'Abhi Bir Facts ranAI'
    },
    body: JSON.stringify({
      model: PROVIDERS.openrouter.model,
      messages: [
        { role: 'system', content: 'You are ranAI codewriter for Abhi Bir Facts. Return useful, correct code and concise explanations.' },
        { role: 'user', content: prompt }
      ]
    })
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data?.error?.message || 'OpenRouter request failed');
  return data?.choices?.[0]?.message?.content || '';
}

async function callMistral(apiKey, messages) {
  const response = await fetch(PROVIDERS.mistral.endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: PROVIDERS.mistral.model,
      messages
    })
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data?.message || data?.error?.message || 'Mistral request failed');
  return data?.choices?.[0]?.message?.content || '';
}

export default async function handler(request) {
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    const body = await request.json();
    const provider = body.provider;
    const task = body.task;

    if (!['gemini', 'openrouter', 'mistral'].includes(provider)) {
      return json({ error: 'Unsupported AI provider' }, 400);
    }

    const apiKey = process.env[PROVIDERS[provider].apiKeyEnv];
    if (!apiKey) return json({ error: `Missing server environment variable: ${PROVIDERS[provider].apiKeyEnv}` }, 500);

    let text = '';
    if (provider === 'gemini' && task === 'chat') {
      text = await callGemini(apiKey, String(body.text || ''), Array.isArray(body.history) ? body.history : []);
    } else if (provider === 'openrouter' && task === 'codewriter') {
      text = await callOpenRouter(apiKey, String(body.prompt || ''));
    } else if (provider === 'mistral' && task === 'history') {
      text = await callMistral(apiKey, Array.isArray(body.messages) ? body.messages : []);
    } else {
      return json({ error: 'Unsupported provider/task combination' }, 400);
    }

    return json({ text });
  } catch (error) {
    console.error('ranAI error:', error);
    return json({ error: error instanceof Error ? error.message : 'AI request failed' }, 500);
  }
}
