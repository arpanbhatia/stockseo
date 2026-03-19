export async function onRequestPost(context) {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };

  const apiKey = context.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return new Response(JSON.stringify({ error: "ANTHROPIC_API_KEY not set." }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }

  let payload;
  try { payload = await context.request.json(); }
  catch { return new Response(JSON.stringify({ error: "Invalid request body." }), { status: 400, headers: corsHeaders }); }

  const { imageBase64, mimeType, platform, kwCount, context: ctx, isVideo, videoMeta } = payload;

  const platformMap = { adobe: "Adobe Stock", shutterstock: "Shutterstock", getty: "Getty Images", generic: "stock platforms" };
  const ctxNote = ctx ? `\nExtra context: "${ctx}"` : "";

  const keywordInstructions = `
Keyword ordering rules (CRITICAL):
1. FIRST 5-8: Most specific unique terms for this exact subject
2. NEXT 10-15: High-traffic descriptive terms — mood, style, colors, setting
3. NEXT 10-15: Broader category terms
4. LAST: Generic broad terms (background, concept, nobody, indoors, outdoors)
Never use: photo, image, picture, stock as keywords.`;

  let prompt;
  if (isVideo && videoMeta) {
    const { resLabel, resolution, duration } = videoMeta;
    prompt = `You are a professional stock video metadata specialist. Analyze this frame and generate optimized metadata for ${platformMap[platform] || "stock platforms"}.${ctxNote}
Video details: ${resLabel} (${resolution}), ${duration.toFixed(1)} seconds, MP4.
${keywordInstructions}
Respond ONLY with valid JSON, no markdown, no extra text:
{"description":"Max 190 chars. Start with resolution e.g. 4K video of... Specific and SEO-rich.","keywords":["keyword1","keyword2",...exactly ${kwCount} keywords following ordering rules, all lowercase, no duplicates, max 4 words each]}`;
  } else {
    prompt = `You are a professional stock photo metadata specialist. Analyze this image and generate optimized metadata for ${platformMap[platform] || "stock platforms"}.${ctxNote}
${keywordInstructions}
Respond ONLY with valid JSON, no markdown, no extra text:
{"description":"Max 190 chars. Lead with main subject. Specific and SEO-rich.","keywords":["keyword1","keyword2",...exactly ${kwCount} keywords following ordering rules, all lowercase, no duplicates, max 4 words each]}`;
  }

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
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

    const data = await res.json();
    if (data.error) throw new Error(data.error.message);

    const raw = data.content?.[0]?.text || "";
    const clean = raw.replace(/```json|```/g, "").trim();
    const jsonMatch = clean.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("Unexpected AI response. Please try again.");

    return new Response(JSON.stringify(JSON.parse(jsonMatch[0])), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message || "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
    }
  });
}
