import express from "express";
import cors from "cors";
import fetch from "node-fetch";
import providers from "./data/providers.json" assert { type: "json" };
import knowledgeBlocks from "./data/knowledgeBlocks.json" assert { type: "json" };

const app = express();
app.use(cors());
app.use(express.json());

// ------------------------------
// 1. SYSTEM PROMPT (Your Rules)
// ------------------------------
const SYSTEM_PROMPT = `
You are an AI assistant for a statewide New Mexico family resource platform.
You must follow these rules:

- Use plain, strengths-based, trauma-informed language.
- Do not give medical advice, diagnoses, or treatment recommendations.
- Do not guess or invent providers, counties, or services.
- Only use the provider data and knowledge blocks supplied in the prompt.
- Follow county → provider matching exactly as provided.
- Respect cultural and tribal contexts.
- Keep answers simple, accurate, and family-friendly.
- If information is missing, say so without guessing.
`;

// ------------------------------
// 2. HELPER: Retrieve Knowledge
// ------------------------------
function getRelevantKnowledge(question) {
  const lower = question.toLowerCase();

  const matches = knowledgeBlocks.filter(block =>
    block.tags.some(tag => lower.includes(tag.toLowerCase()))
  );

  return matches.map(m => m.content).join("\n\n");
}

// ------------------------------
// 3. HELPER: Provider Matching
// ------------------------------
function getProvidersForCounty(county) {
  if (!county) return [];

  return providers.filter(p =>
    p.counties_served.map(c => c.toLowerCase()).includes(county.toLowerCase())
  );
}

// ------------------------------
// 4. MAIN ENDPOINT: /ask
// ------------------------------
app.post("/ask", async (req, res) => {
  try {
    const { question, county } = req.body;

    const providerMatches = county ? getProvidersForCounty(county) : [];
    const knowledge = getRelevantKnowledge(question);

    const context = `
### PROVIDERS
${JSON.stringify(providerMatches, null, 2)}

### KNOWLEDGE
${knowledge}
`;

    // ------------------------------
    // 5. CALL YOUR LLM PROVIDER
    // ------------------------------
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "assistant", content: "Use only the data provided below." },
          { role: "assistant", content: context },
          { role: "user", content: question }
        ],
        temperature: 0.3
      })
    });

    const data = await response.json();
    const answer = data.choices?.[0]?.message?.content || "I couldn't generate a response.";

    res.json({ answer, providers: providerMatches });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

// ------------------------------
// 6. START SERVER
// ------------------------------
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`AI backend running on port ${PORT}`);
});
