import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");

interface GenerateRequest {
  message?: string;
  prompt?: string;
  baseImageUrl?: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (!OPENAI_API_KEY) {
    return new Response(JSON.stringify({ error: "OPENAI_API_KEY not configured" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const body = (await req.json()) as GenerateRequest;
    const message = (body.message || "").trim();
    const prompt = (body.prompt || "").trim();

    if (!message && !prompt) {
      return new Response(JSON.stringify({ error: "Message or prompt required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const fullPrompt = [
      "Design a realistic photo overlay as a transparent PNG.",
      "The center of the image must remain fully transparent.",
      "Add a thin, clean frame around the edges (subtle rounded corners).",
      "Place the message in a neat caption bar at the bottom-left.",
      "Text must be clear, readable, and not overlapping itself.",
      "Style: modern, minimal, premium, no cartoon icons.",
      "No busy graphics, no big logos, no large illustrations.",
      message ? `Use this exact message: "${message}".` : "",
      prompt ? `Style hint: ${prompt}.` : "",
      "Keep lots of negative space; overlay should feel like a real UI frame.",
      "No watermark. Output must be transparent PNG only.",
    ]
      .filter(Boolean)
      .join(" ");

    const openaiRes = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-image-1",
        prompt: fullPrompt,
        size: "1024x1024",
        n: 1,
        output_format: "png",
        background: "transparent",
        quality: "high",
      }),
    });

    if (!openaiRes.ok) {
      const details = await openaiRes.text();
      return new Response(
        JSON.stringify({ error: "OpenAI image generation failed", details }),
        {
          status: openaiRes.status,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const data = await openaiRes.json();
    const overlays = (data.data || []).map((item: { b64_json?: string }, idx: number) => ({
      name: `overlay-${idx + 1}.png`,
      url: item.b64_json ? `data:image/png;base64,${item.b64_json}` : "",
    }));

    return new Response(JSON.stringify({ overlays }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message || "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
