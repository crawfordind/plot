import { readFileSync } from "fs";

const data = JSON.parse(readFileSync("openrouter-models.json", "utf8").replace(/^\uFEFF/, ""));
const models = data.data ?? [];

const candidates = models
  .filter((m) => m.pricing?.prompt && m.pricing?.completion)
  .map((m) => {
    const params = m.supported_parameters ?? [];
    const hasJson =
      params.includes("structured_outputs") ||
      params.includes("response_format");
    return {
      id: m.id,
      name: m.name,
      inputPerM: Number(m.pricing.prompt) * 1_000_000,
      outputPerM: Number(m.pricing.completion) * 1_000_000,
      context: m.context_length,
      hasJson,
    };
  })
  .filter((m) => m.hasJson && m.inputPerM < 0.5)
  .sort((a, b) => a.inputPerM + a.outputPerM * 0.3 - (b.inputPerM + b.outputPerM * 0.3));

console.log("Top cheap models with JSON support (est. cost per parse ~2k in / 500 out tokens):\n");
for (const m of candidates.slice(0, 15)) {
  const estPerParse =
    (2000 / 1_000_000) * m.inputPerM + (500 / 1_000_000) * m.outputPerM;
  console.log(
    `${m.id}\n  $${m.inputPerM.toFixed(3)}/M in, $${m.outputPerM.toFixed(3)}/M out, ${m.context} ctx\n  ~$${(estPerParse * 1000).toFixed(4)} per 1000 parses\n`,
  );
}
