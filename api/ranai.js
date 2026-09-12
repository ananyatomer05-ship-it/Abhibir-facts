// Abhi Bir Facts — ranAI server-side API router
// POST /api/ranai
// API keys stay in Vercel Environment Variables.

const PROVIDERS = {
  gemini: {
    apiKeyEnv: 'GEMINI_API_KEY',
    model: 'gemini-3.8-flash',
    endpoint: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent',
  },
  openrouter: {
    apiKeyEnv: 'OPENROUTER_API_KEY',
    endpoint: 'https://openrouter.ai/api/v1/chat/completions',
    model: 'openai/gpt-4o-mini',
  },
  mistral: {
    apiKeyEnv: 'MISTRAL_API_KEY',
    endpoint: 'https://api.mistral.ai/v1/chat/completions',
    model: 'mistral-small-latest',
  },
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}

async function readBody(request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

async function readResponse(response) {
  const raw = await response.text();
  try {
    return raw ? JSON.parse(raw) : {};
  } catch {
    return { raw };
  }
}

async function handleGemini(body, apiKey) {
  const text = String(body.text || '').trim();
  const history = Array.isArray(body.history) ? body.history : [];

  if (!text) throw new Error('Gemini request is missing text.');

  const contents = [
    ...history
      .filter((m) => m && m.role && m.text)
      .map((m) => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: String(m.text) }],
      })),
    { role: 'user', parts: [{ text }] },
  ];

  const response = await fetch(PROVIDERS.gemini.endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey,
    },
    body: JSON.stringify({ contents }),
  });

  const data = await readResponse(response);
  if (!response.ok) {
    throw new Error(
      data?.error?.message ||
      `Gemini request failed (${response.status}). Check the GEMINI_API_KEY and model access in Vercel.`
    );
  }

  const output = data?.candidates?.[0]?.content?.parts
    ?.map((p) => p?.text || '')
    .join('')
    .trim() || '';

  if (!output) {
    throw new Error(
      data?.promptFeedback?.blockReason
        ? `Gemini blocked the request: ${data.promptFeedback.blockReason}`
        : 'Gemini returned no text response.'
    );
  }

  return output;
}

async function handleOpenRouter(body, apiKey) {
  const prompt = String(body.prompt || body.text || '').trim();
  if (!prompt) throw new Error('OpenRouter request is missing a prompt.');

  const response = await fetch(PROVIDERS.openrouter.endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
      'HTTP-Referer': 'https://abhibirfacts.com',
      'X-Title': 'Abhi Bir Facts ranAI',
    },
    body: JSON.stringify({
      model: PROVIDERS.openrouter.model,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  const data = await readResponse(response);
  if (!response.ok) {
    throw new Error(data?.error?.message || `OpenRouter request failed (${response.status})`);
  }

  const output = data?.choices?.[0]?.message?.content || '';
  if (!output) throw new Error('OpenRouter returned no text response.');
  return output;
}

async function handleMistral(body, apiKey) {
  const messages = Array.isArray(body.messages)
    ? body.messages
    : [{ role: 'user', content: String(body.text || '').trim() }];

  const response = await fetch(PROVIDERS.mistral.endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: PROVIDERS.mistral.model,
      messages,
    }),
  });

  const data = await readResponse(response);
  if (!response.ok) {
    throw new Error(data?.error?.message || `Mistral request failed (${response.status})`);
  }

  const output = data?.choices?.[0]?.message?.content || '';
  if (!output) throw new Error('Mistral returned no text response.');
  return output;
}

export default async function handler(request) {
  if (request.method !== 'POST') {
    return json({ error: 'Method not allowed. Use POST /api/ranai.' }, 405);
  }

  const body = await readBody(request);
  if (!body || typeof body !== 'object') {
    return json({ error: 'Invalid JSON request body.' }, 400);
  }

  const provider = String(body.provider || '').toLowerCase();
  const task = String(body.task || '').toLowerCase();
  const config = PROVIDERS[provider];

  if (!config) {
    return json({ error: `Unsupported provider: ${provider || '(missing)'}` }, 400);
  }

  const allowedTasks = {
    gemini: ['chat'],
    openrouter: ['codewriter'],
    mistral: ['history'],
  };

  if (!allowedTasks[provider].includes(task)) {
    return json({ error: `Unsupported task '${task}' for provider '${provider}'.` }, 400);
  }

  const apiKey = process.env[config.apiKeyEnv];
  if (!apiKey) {
    return json({ error: `Server configuration missing ${config.apiKeyEnv}. Add it to Vercel Environment Variables.` }, 500);
  }

  try {
    let text;
    if (provider === 'gemini') text = await handleGemini(body, apiKey);
    else if (provider === 'openrouter') text = await handleOpenRouter(body, apiKey);
    else text = await handleMistral(body, apiKey);

    return json({ text });
  } catch (error) {
    console.error(`ranAI ${provider}/${task} error:`, error);
    return json({ error: error?.message || 'AI request failed.' }, 502);
  }
}
