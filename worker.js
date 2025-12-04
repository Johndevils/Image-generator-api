export default {
    async fetch(request, env, ctx) {
        // 1. Only allow GET requests
        if (request.method !== "GET") {
            return new Response("Use a GET request with ?prompt=... and &model=...", { status: 405 });
        }

        // 2. Parse Query Parameters
        const url = new URL(request.url);
        const prompt = url.searchParams.get("prompt");
        const modelKey = url.searchParams.get("model") || "flux"; // Default to flux

        if (!prompt) {
            return new Response("Missing 'prompt' parameter.", { status: 400 });
        }

        if (!env.HF_TOKEN) {
            return new Response("Server Config Error: HF_TOKEN missing", { status: 500 });
        }

        // 3. Configuration based on your snippets
        let targetUrl = "";
        let payload = {};
        let isNebius = false;

        switch (modelKey) {
            case "zimage":
                targetUrl = "https://router.huggingface.co/fal-ai/fal-ai/z-image/turbo";
                payload = { prompt: prompt, sync_mode: true };
                break;
            
            case "sd35":
                targetUrl = "https://router.huggingface.co/fal-ai/fal-ai/stable-diffusion-v35-large";
                payload = { prompt: prompt, sync_mode: true };
                break;

            case "hunyuan":
                targetUrl = "https://router.huggingface.co/fal-ai/fal-ai/hunyuan-image/v3/text-to-image";
                payload = { prompt: prompt, sync_mode: true };
                break;

            case "anime": // Lora version
                targetUrl = "https://router.huggingface.co/fal-ai/fal-ai/z-image/turbo/lora";
                payload = { prompt: prompt, sync_mode: true };
                break;

            case "flux":
            default:
                // Nebius / Flux requires special handling (OpenAI compatible format)
                isNebius = true;
                targetUrl = "https://router.huggingface.co/nebius/v1/images/generations";
                payload = {
                    model: "black-forest-labs/flux-schnell",
                    prompt: prompt,
                    response_format: "b64_json" // We must request base64 to convert it to an image
                };
                break;
        }

        try {
            // 4. Perform the upstream POST request
            const response = await fetch(targetUrl, {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${env.HF_TOKEN}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(payload),
            });

            if (!response.ok) {
                return new Response(await response.text(), { status: response.status });
            }

            // 5. Handle Response Types
            
            // CASE A: NEBIUS / FLUX (Returns JSON with Base64)
            if (isNebius) {
                const json = await response.json();
                const b64Json = json.data?.[0]?.b64_json;
                
                if (!b64Json) return new Response("API returned unexpected JSON format", { status: 500 });

                // Convert Base64 to Binary
                const binaryString = atob(b64Json);
                const len = binaryString.length;
                const bytes = new Uint8Array(len);
                for (let i = 0; i < len; i++) {
                    bytes[i] = binaryString.charCodeAt(i);
                }

                return new Response(bytes.buffer, {
                    headers: {
                        "Content-Type": "image/jpeg",
                        "Cache-Control": "public, max-age=86400", // Cache for 1 day
                        "Access-Control-Allow-Origin": "*"
                    }
                });
            }

            // CASE B: FAL / OTHERS (Returns Direct Image Blob)
            return new Response(response.body, {
                headers: {
                    "Content-Type": response.headers.get("Content-Type") || "image/jpeg",
                    "Cache-Control": "public, max-age=86400",
                    "Access-Control-Allow-Origin": "*"
                }
            });

        } catch (err) {
            return new Response(err.message, { status: 500 });
        }
    }
};
