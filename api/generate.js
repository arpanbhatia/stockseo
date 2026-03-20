export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "ANTHROPIC_API_KEY not set." });

  const { imageBase64, mimeType, platform, kwCount, context, isVideo, videoMeta } = req.body;

  const platformMap = { adobe: "Adobe Stock", shutterstock: "Shutterstock", getty: "Getty Images", generic: "stock platforms" };
  const ctxNote = context ? `\nExtra context: "${context}"` : "";
  const keywordInstructions = `Keyword ordering: 1) First 5-8: most specific unique terms. 2) Next 10-15: high-traffic descriptive terms. 3) Next 10-15: broader category terms. 4) Last: generic terms. Never use: photo, image, picture, stock.`;

  let prompt;
  if (isVideo && videoMeta) {
    const { resLabel, resolution, duration } = videoMeta;
    prompt = `You are a professional stock video metadata specialist. Analyze this frame and generate metadata for ${platformMap[platform] || "stock platforms"}.${ctxNote}\nVideo: ${resLabel} (${resolution}), ${parseFloat(duration).toFixed(1)}s, MP4.\n${keywordInstructions}\nRespond ONLY with valid JSON:\n{"description":"Max 190 chars. Start with resolution e.g. 4K video of...","keywords":["kw1","kw2",...exactly ${kwCount} keywords, all lowercase, no duplicates, max 4 words each]}`;
  } else {
    prompt = `You are a professional stock photo metadata specialist. Analyze this image and generate metadata for ${platformMap[platform] || "stock platforms"}.${ctxNote}\n${keywordInstructions}\nRespond ONLY with valid JSON:\n{"description":"Max 190 chars. Lead with main subject. Specific and SEO-rich.","keywords":["kw1","kw2",...exactly ${kwCount} keywords, all lowercase, no duplicates, max 4 words each]}`;
  }

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 1024,
        messages: [{ role: "user", content: [
          { type: "image", source: { type: "base64", media_type: mimeType, data: imageBase64 } },
          { type: "text", text: prompt }
        ]}]
      })
    });
    const data = await response.json();
    if (data.error) throw new Error(data.error.message);
    const raw = data.content?.[0]?.text || "";
    const clean = raw.replace(/```json|```/g, "").trim();
    const match = clean.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("Unexpected AI response. Please try again.");
    return res.status(200).json(JSON.parse(match[0]));
  } catch (err) {
    return res.status(500).json({ error: err.message || "Unknown error" });
  }
}
