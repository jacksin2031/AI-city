// Diagnose which Vertex AI model/location combination actually answers.
import { createRequire } from "node:module";

const require = createRequire(new URL("../apps/web/package.json", import.meta.url));
const { GoogleGenAI } = require("@google/genai");

const project = "ai-city-511822";
const combos = [
  ["global", "gemini-2.5-flash"],
  ["global", "gemini-2.0-flash"],
  ["us-central1", "gemini-2.5-flash"],
  ["asia-northeast1", "gemini-2.5-flash"],
  ["asia-northeast1", "gemini-2.0-flash"],
];

for (const [location, model] of combos) {
  try {
    const ai = new GoogleGenAI({ vertexai: true, project, location });
    const r = await ai.models.generateContent({
      model,
      contents: "say OK only",
      config: { maxOutputTokens: 16, thinkingConfig: { thinkingBudget: 0 } },
    });
    console.log(`OK   ${location} / ${model} -> ${JSON.stringify((r.text ?? "").slice(0, 40))}`);
  } catch (e) {
    console.log(
      `FAIL ${location} / ${model} -> ${e.status ?? ""} ${String(e.message ?? e).slice(0, 140)}`,
    );
  }
}
