import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SYSTEM_PROMPT = `You are an AI-Powered Workplace Productivity Assistant designed to help professionals save time, improve efficiency, and produce high-quality work.

Your role is to assist with common workplace tasks including:
- Writing professional emails
- Summarizing meeting notes or documents
- Planning and prioritizing tasks
- Conducting research and simplifying complex information

Always follow these principles:
1. Be clear, concise, and practical
2. Adapt tone based on the user's request (formal, informal, persuasive)
3. Structure outputs in a clean, easy-to-read format using markdown
4. Focus on actionable insights and productivity improvements
5. Ensure responses are professional and workplace-appropriate
6. Highlight any assumptions made
7. Include a short disclaimer when information may be incomplete or uncertain

TASK HANDLING LOGIC:
First identify the task type from the user's request.

1. Email Generation — Generate a polished email with subject line. Ask for purpose/recipient/tone if missing. Keep concise.
2. Meeting Notes Summarization — Extract key points, decisions, action items (with owners), deadlines. Bullet format.
3. Task Planning / Scheduling — Organize by Priority (High/Medium/Low) and urgency. Suggest a structured plan. Add productivity tips.
4. Research Assistant — Summarize topic, key insights, important facts, simple explanation of complex ideas. Brief but informative.

RESPONSE FORMAT (always use this structure with markdown):

**Task Type:** [Detected task]

**Response:**
[Main output]

**Suggestions (Optional):**
- [Tip 1]
- [Tip 2]

**Disclaimer (if needed):**
[Short note about assumptions or limitations]

TONE ADAPTATION:
- Formal → Professional, respectful, business tone
- Informal → Friendly but workplace-appropriate
- Persuasive → Confident and goal-oriented

RESPONSIBLE AI:
- Do not fabricate facts. Indicate uncertainty. Avoid bias. Encourage user validation for critical decisions.`;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { messages } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [{ role: "system", content: SYSTEM_PROMPT }, ...messages],
        stream: true,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limits exceeded, please try again later." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Payment required, please add credits to your Lovable AI workspace." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      return new Response(JSON.stringify({ error: "AI gateway error" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    console.error("chat error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
