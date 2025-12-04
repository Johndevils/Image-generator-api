/**
 * Backend Logic for Text-to-Image API
 * Routes: POST /api/flux, /api/sd35, etc.
 */

const MODELS = {
    "flux": "https://router.huggingface.co/nebius/black-forest-labs/FLUX.1-schnell",
    "sd35": "https://router.huggingface.co/fal-ai/fal-ai/stable-diffusion-v35-large",
    "anime": "https://router.huggingface.co/fal-ai/strangerzonehf/Anime-Z",
    "hunyuan": "https://router.huggingface.co/fal-ai/tencent/HunyuanImage-3.0",
    "zimage": "https://router.huggingface.co/fal-ai/Tongyi-MAI/Z-Image-Turbo"
};

export default {
    async fetch(request, env, ctx) {
        // 1. CORS Configuration (Allows access from your frontend/browser)
        const corsHeaders = {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type"
        };

        // Handle preflight requests
        if (request.method === "OPTIONS") {
            return new Response(null, { headers: corsHeaders });
        }

        // 2. Security & Method Check
        if (request.method !== "POST") return new Response("Method Not Allowed", { status: 405, headers: corsHeaders });
        if (!env.HF_TOKEN) return new Response("Server Error: HF_TOKEN missing", { status: 500, headers: corsHeaders });

        try {
            // 3. Routing Logic (Extract model from URL: /api/flux)
            const url = new URL(request.url);
            const pathSegments = url.pathname.split('/').filter(Boolean); // e.g., ['api', 'flux']
            const modelKey = pathSegments[1]; 

            const targetUrl = MODELS[modelKey];
            if (!targetUrl || pathSegments[0] !== 'api') {
                return new Response(JSON.stringify({ 
                    error: "Invalid Endpoint", 
                    usage: `POST /api/<model>`, 
                    models: Object.keys(MODELS) 
                }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
            }

            // 4. Input Parsing
            const body = await request.json();
            const prompt = body.prompt || body.inputs;
            if (!prompt) return new Response("Missing 'prompt'", { status: 400, headers: corsHeaders });

            // 5. Forward Request to Hugging Face
            const hfResponse = await fetch(targetUrl, {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${env.HF_TOKEN}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    inputs: prompt,
                    parameters: {
                        num_inference_steps: 5, // Default setting
                        ...body.parameters      // Allow overrides
                    }
                }),
            });

            // 6. Handle HF Error
            if (!hfResponse.ok) {
                const errorText = await hfResponse.text();
                return new Response(errorText, { 
                    status: hfResponse.status, 
                    headers: { ...corsHeaders, "Content-Type": "application/json" } 
                });
            }

            // 7. Stream Image Back
            return new Response(hfResponse.body, {
                headers: {
                    ...corsHeaders,
                    "Content-Type": hfResponse.headers.get("Content-Type") || "image/jpeg"
                }
            });

        } catch (err) {
            return new Response(JSON.stringify({ error: err.message }), { 
                status: 500, 
                headers: { ...corsHeaders, "Content-Type": "application/json" } 
            });
        }
    }
};
