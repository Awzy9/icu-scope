/**
 * ICU Scope "Ask about this article" proxy.
 *
 * Holds the Groq API key server-side (as a Worker secret) so it never
 * ships in client-side JS. Answers are grounded ONLY in the article
 * title/abstract passed in the request — this is deliberately not a
 * general medical chatbot, to keep it scoped and reduce the chance of
 * unmoored clinical claims.
 *
 * Deploy: see ../README.md "Ask about this article (optional)" section.
 */

const GROQ_ENDPOINT = "https://api.groq.com/openai/v1/chat/completions";
const MODEL = "llama-3.1-8b-instant";

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
