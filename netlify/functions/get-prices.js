import { GoogleGenerativeAI } from "@google/generative-ai";
import { createClient } from "@supabase/supabase-js";

export default async (req, context) => {
    // CORS headers
    const headers = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
    };

    if (req.method === "OPTIONS") {
        return new Response("OK", { status: 200, headers });
    }

    if (req.method !== "POST") {
        return new Response(JSON.stringify({ error: "Method Not Allowed" }), {
            status: 405,
            headers
        });
    }

    try {
        const { query } = await req.json();

        if (!query) {
            return new Response(JSON.stringify({ error: "Query is required" }), {
                status: 400,
                headers
            });
        }

        // 1. Initialize Supabase
        const supabaseUrl = process.env.SUPABASE_URL || "https://qagvllahsubeymnrjoqu.supabase.co";
        const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFhZ3ZsbGFoc3ViZXltbnJqb3F1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ5MDA1MTcsImV4cCI6MjA4MDQ3NjUxN30.7eN3dcVViEtTexfJU6RfXrFaxfS9q0BViT6rd9X7NjY";

        let supabase = null;
        if (supabaseUrl && supabaseKey) {
            supabase = createClient(supabaseUrl, supabaseKey);
        }

        // 2. Initialize Gemini
        // PRIORITY: Use hardcoded key for demo to avoid Netlify env var ssues.
        const geminiApiKey = "AIzaSyD4MTxBGHxHxae3T9ydUhClP1XY5nUEtIg" || process.env.GEMINI_API_KEY;
        // WARNING: Hardcoded key for demo/fix.

        if (!geminiApiKey) {
            return new Response(JSON.stringify({ error: "Server configuration error (API Key)" }), {
                status: 500,
                headers
            });
        }

        const genAI = new GoogleGenerativeAI(geminiApiKey);
        const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

        // 3. Prompt
        const prompt = `You are "Food Scan", a real-time price comparator for the French market.
    The user wants to find the price of: "${query}".
    
    Task:
    1. Search/Estimate the current price for this SPECIFIC item at these major French retailers:
       - E.Leclerc
       - Carrefour
       - Intermarché
       - Lidl
       - Aldi
       - Auchan
    
    2. Ideally, choose a standard product (e.g., "Eco-brand" if generic request, or specific brand if named).
    3. Return ONLY a valid JSON array of objects. No markdown formatting.
    4. For each product, try to generate a valid specific product URL or a search URL on the retailer's site.
    
    JSON Format:
    [
      {
        "store_name": "Store Name",
        "price": 1.23,
        "currency": "€",
        "product_name": "Didactic Product Name (e.g. Lait Lactel 1L)",
        "unit": "1L",
        "product_url": "https://www.store.com/product/..."
      }
    ]
    
    Sort the results from cheapest to most expensive.`;

        const result = await model.generateContent(prompt);
        const responseText = result.response.text();
        console.log("Raw Gemini Response:", responseText);

        let cleanJson = responseText;
        const jsonMatch = responseText.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
            cleanJson = jsonMatch[0];
        } else {
            cleanJson = responseText.replace(/```json/g, "").replace(/```/g, "").trim();
        }

        let prices = [];
        try {
            prices = JSON.parse(cleanJson);
        } catch (e) {
            console.error("Failed to parse Gemini response", cleanJson);
            return new Response(JSON.stringify({
                error: "Erreur d'analyse IA",
                details: "L'IA n'a pas renvoyé un format valide.",
                raw: responseText.substring(0, 100)
            }), {
                status: 502,
                headers
            });
        };

        // 4. Log to Supabase (Async - fire and forget effectively for speed, or await it)
        // We await it here to ensure safety
        if (supabase) {
            const { data: historyData, error: historyError } = await supabase
                .from('search_history')
                .insert([{ query: query, created_at: new Date().toISOString() }])
                .select();

            if (!historyError && historyData && historyData.length > 0) {
                const searchId = historyData[0].id;
                const resultRows = prices.map(p => ({
                    search_id: searchId,
                    store_name: p.store_name,
                    price: p.price,
                    currency: p.currency,
                    product_name: p.product_name,
                    unit: p.unit,
                    product_url: p.product_url || null,
                    created_at: new Date().toISOString()
                }));
                await supabase.from('price_results').insert(resultRows);
            }
        }

        return new Response(JSON.stringify({ results: prices }), {
            status: 200,
            headers
        });

    } catch (error) {
        console.error("Error processing request:", error);
        return new Response(JSON.stringify({
            error: error.message || "Internal Server Error",
            stack: error.stack
        }), {
            status: 500,
            headers
        });
    }
};
