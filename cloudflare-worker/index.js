/**
 * ICU Scope "Ask about this article" + semantic search query proxy.
 *
 * Holds the Groq API key and Hugging Face token server-side (as Worker
 * secrets) so neither ever ships in client-side JS.
 *
 * Two actions, chosen by body.action:
 *   - "ask" (default, omit action): answers a question grounded ONLY in
 *     the article title/abstract passed in the request — deliberately not
 *     a general medical chatbot, to keep it scoped and reduce the chance
 *     of unmoored clinical claims.
 *   - "embed": embeds a free-text search query with the same Hugging Face
 *     model used to embed articles during the daily fetch, so the
 *     frontend can rank articles by cosine similarity without ever
 *     holding the HF token itself.
 *
 * Deploy: see ../README.md "Ask about this article" and "Semantic search"
 * sections.
 */

const GROQ_ENDPOINT = "https://api.groq.com/openai/v1/chat/completions";
const MODEL = "llama-3.1-8b-instant";
const HF_EMBEDDING_MODEL_DEFAULT = "BAAI/bge-small-en-v1.5";

function corsHeaders(env) {
  return {
    "Access-Control-Allow-Origin": env.ALLOWED_ORIGIN || "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

function jsonResponse(body, status, env) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(env), "Content-Type": "application/json" },
  });
}

// Normalizes the HF feature-extraction response into one flat vector,
// mirroring scripts/fetch_articles.py's _pool_embedding_response so query
// vectors and cached article vectors live in the same space.
function poolEmbeddingResponse(data) {
  if (!Array.isArray(data) || data.length === 0) return null;
  const first = data[0];
  if (typeof first === "number") return data;
  if (Array.isArray(first) && typeof first[0] === "number") {
    const dim = first.length;
    const pooled = new Array(dim).fill(0);
    for (const row of data) {
      for (let i = 0; i < dim; i++) pooled[i] += row[i];
    }
    for (let i = 0; i < dim; i++) pooled[i] /= data.length;
    return pooled;
  }
  return null;
}

async function handleEmbed(body, env) {
  const text = (body.text || "").toString().trim().slice(0, 2000);
  if (!text) {
    return jsonResponse({ error: "text is required" }, 400, env);
  }
  if (!env.HF_API_TOKEN) {
    return jsonResponse({ error: "Server is not configured (missing HF_API_TOKEN)" }, 500, env);
  }

  const model = env.HF_EMBEDDING_MODEL || HF_EMBEDDING_MODEL_DEFAULT;
  const endpoint = `https://api-inference.huggingface.co/pipeline/feature-extraction/${model}`;

  let upstream;
  try {
    upstream = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.HF_API_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ inputs: text, options: { wait_for_model: true } }),
    });
  } catch (e) {
    return jsonResponse({ error: "Upstream request failed" }, 502, env);
  }

  if (!upstream.ok) {
    return jsonResponse({ error: "Upstream error" }, 502, env);
  }

  const data = await upstream.json();
  const vector = poolEmbeddingResponse(data);
  if (!vector) {
    return jsonResponse({ error: "Could not parse embedding response" }, 502, env);
  }

  return jsonResponse({ vector }, 200, env);
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders(env) });
    }

    if (request.method !== "POST") {
      return jsonResponse({ error: "Method not allowed" }, 405, env);
    }

    let body;
    try {
      body = await request.json();
    } catch (e) {
      return jsonResponse({ error: "Invalid JSON body" }, 400, env);
    }

    if (body.action === "embed") {
      return handleEmbed(body, env);
    }

    const question = (body.question || "").toString().trim().slice(0, 500);
    const title = (body.title || "").toString().trim().slice(0, 300);
    const context = (body.context || "").toString().trim().slice(0, 3000);

    if (!question) {
      return jsonResponse({ error: "question is required" }, 400, env);
    }
    if (!context) {
      return jsonResponse({ error: "context (article abstract) is required" }, 400, env);
    }
    if (!env.GROQ_API_KEY) {
      return jsonResponse({ error: "Server is not configured (missing GROQ_API_KEY)" }, 500, env);
    }

    let upstream;
    try {
      upstream = await fetch(GROQ_ENDPOINT, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.GROQ_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: MODEL,
          temperature: 0.3,
          max_tokens: 350,
          messages: [
            {
              role: "system",
              content:
                "You are a clinical-literature assistant embedded on an ICU literature site. " +
                "Answer the user's question using ONLY the article title and abstract given below. " +
                "If the abstract does not contain enough information to answer, say so plainly instead " +
                "of guessing or using outside knowledge. Keep the answer to 2-4 sentences.",
            },
            {
              role: "user",
              content: `Article title: ${title}\n\nAbstract: ${context}\n\nQuestion: ${question}`,
            },
          ],
        }),
      });
    } catch (e) {
      return jsonResponse({ error: "Upstream request failed" }, 502, env);
    }

    if (!upstream.ok) {
      return jsonResponse({ error: "Upstream error" }, 502, env);
    }

    const data = await upstream.json();
    const answer = (data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content || "").trim();

    return jsonResponse({ answer: answer || "No answer was generated." }, 200, env);
  },
};
