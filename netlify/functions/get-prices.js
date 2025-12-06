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
        return { statusCode: 200, headers, body: "OK" };
    }

    if (req.method !== "POST") {
        return {
            statusCode: 405,
            headers,
            body: JSON.stringify({ error: "Method Not Allowed" }),
        };
    }

    try {
        const { query } = await req.json();

        if (!query) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ error: "Query is required" }),
            };
        }

        // 1. Initialize Supabase (for logging history)
        const supabaseUrl = process.env.SUPABASE_URL;
        const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;

        let supabase = null;
        if (supabaseUrl && supabaseKey) {
            supabase = createClient(supabaseUrl, supabaseKey);
        }

        // 2. Initialize Gemini
        // WARNING: Hardcoding API key for demo purposes as requested. 
        // This key will be visible in the public repository.
        const geminiApiKey = process.env.GEMINI_API_KEY || "AIzaSyD4MTxBGHxHxae3T9ydUhClP1XY5nUEtIg";
        if (!geminiApiKey) {
            console.error("Missing GEMINI_API_KEY");
            return {
                statusCode: 500,
                headers,
                body: JSON.stringify({ error: "Server configuration error (API Key)" }),
            };
        }

        const genAI = new GoogleGenerativeAI(geminiApiKey);
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

        // 3. Prompt for Price Search
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
    
    JSON Format:
    [
      {
        "store_name": "Store Name",
        "price": 1.23,
        "currency": "€",
        "product_name": "Didactic Product Name (e.g. Lait Lactel 1L)",
        "unit": "1L"
      }
    ]
    
    Sort the results from cheapest to most expensive.`;

        const result = await model.generateContent(prompt);
        // Clean up markdown code blocks if present
        const responseText = result.response.text();
        console.log("Raw Gemini Response:", responseText); // Debug log

        let cleanJson = responseText;
        // Attempt to extract JSON array using regex
        const jsonMatch = responseText.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
            cleanJson = jsonMatch[0];
        } else {
            // Fallback cleanup
            cleanJson = responseText.replace(/```json/g, "").replace(/```/g, "").trim();
        }

        let prices = [];
        try {
            prices = JSON.parse(cleanJson);
        } catch (e) {
            console.error("Failed to parse Gemini response", cleanJson);
            return {
                statusCode: 502,
                headers,
                body: JSON.stringify({
                    error: "Erreur d'analyse IA",
                    details: "L'IA n'a pas renvoyé un format valide.",
                    raw: responseText.substring(0, 100)
                })
            };
        };

        // 4. Log to Supabase
        if (supabase) {
            const { data: historyData, error: historyError } = await supabase
                .from('search_history')
                .insert([{ query: query, created_at: new Date().toISOString() }])
                .select();

            if (historyError) {
                console.error("Supabase history log error:", historyError);
            } else if (historyData && historyData.length > 0) {
                const searchId = historyData[0].id; // Use implicit id

                const resultRows = prices.map(p => ({
                    search_id: searchId,
                    store_name: p.store_name,
                    price: p.price,
                    currency: p.currency,
                    product_name: p.product_name,
                    unit: p.unit,
                    created_at: new Date().toISOString()
                }));

                const { error: pricesError } = await supabase
                    .from('price_results')
                    .insert(resultRows);

                if (pricesError) console.error("Supabase prices log error:", pricesError);
            }
        }

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({ results: prices }),
        };

    } catch (error) {
        console.error("Error processing request:", error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: "Internal Server Error" }),
        };
    }
};
