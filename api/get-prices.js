import { GoogleGenerativeAI } from "@google/generative-ai";
import { createClient } from "@supabase/supabase-js";

export default async function handler(req, res) {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    if (req.method !== "POST") {
        res.status(405).json({ error: "Method Not Allowed" });
        return;
    }

    try {
        const { query } = req.body;

        if (!query) {
            res.status(400).json({ error: "Query is required" });
            return;
        }

        // 1. Initialize Supabase
        const supabaseUrl = process.env.SUPABASE_URL || "https://qagvllahsubeymnrjoqu.supabase.co";
        const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFhZ3ZsbGFoc3ViZXltbnJqb3F1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ5MDA1MTcsImV4cCI6MjA4MDQ3NjUxN30.7eN3dcVViEtTexfJU6RfXrFaxfS9q0BViT6rd9X7NjY";

        let supabase = null;
        if (supabaseUrl && supabaseKey) {
            supabase = createClient(supabaseUrl, supabaseKey);
        }

        // 2. Initialize Gemini
        // SECURITY UPDATE: The previous demo key was revoked. We must use the Environment Variable.
        const geminiApiKey = process.env.GEMINI_API_KEY;

        if (!geminiApiKey) {
            console.error("Missing Gemini API Key");
            res.status(500).json({ error: "Server configuration error (Missing GEMINI_API_KEY Env Var)" });
            return;
        }

        const genAI = new GoogleGenerativeAI(geminiApiKey);

        // Stabilizing: Use standard model to avoid server timeouts/crashes with Search tool.
        // We will rely on the model's vast internal database of products.
        const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

        // 3. Prompt
        const prompt = `You are "Food Scan", an expert price comparator for French supermarkets.
    
    User Query: "${query}"
    
    Task:
    1. For EACH of the following stores, identify the TOP 3 to 5 matching products available (from cheapest to mid-range):
       - E.Leclerc
       - Carrefour
       - Intermarché
       - Lidl
       - Aldi
       - Auchan
    
    2. REALISM IS KEY:
       - Do NOT invent generic names. Use specific brands and weights (e.g., "Lait Lactel Demi-écrémé 1L").
       - Provide a realistic estimated price for France (2024-2025).
    
    3. JSON Format:
    Return a single JSON array containing all items found across all stores.
    [
      {
        "store_name": "Store Name",
        "price": 1.23,
        "currency": "€",
        "product_name": "Specific Product Brand & Name",
        "unit": "1kg",
        "product_url": "" 
      }
    ]
    
    4. Sort the final list globally from cheapest to most expensive.
    
    5. CRITICAL: Return a high volume of results (at least 15-20 items total).`;

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
            res.status(502).json({
                error: "Erreur d'analyse IA",
                details: "L'IA n'a pas renvoyé un format valide.",
                raw: responseText.substring(0, 100)
            });
            return;
        };

        // 4. Log to Supabase and Rewrite URLs
        if (supabase) {
            const { data: historyData, error: historyError } = await supabase
                .from('search_history')
                .insert([{ query: query, created_at: new Date().toISOString() }])
                .select();

            if (!historyError && historyData && historyData.length > 0) {
                const searchId = historyData[0].id;
                const resultRows = prices.map(p => {
                    // FALLBACK: Force Google Site Search URL if AI fails or returns a blocked retailer link
                    let finalUrl = p.product_url;

                    // Map store names to domains for reliable site search
                    // HYBRID STRATEGY: Use Direct Search URLs for known structures ("Proof"), Google for others.
                    // IMPORTANT: Sanitize product name by removing quotes to avoid strict search failures
                    const cleanProductName = p.product_name.replace(/['"]/g, '');
                    const encodedName = encodeURIComponent(cleanProductName);

                    if (!finalUrl || !finalUrl.includes('http')) {
                        // UNIVERSAL DIRECT LINK STRATEGY
                        // We now have direct search patterns for all major stores.
                        if (p.store_name.toLowerCase().includes('carrefour')) {
                            finalUrl = `https://www.carrefour.fr/s?q=${encodedName}`;
                        } else if (p.store_name.toLowerCase().includes('leclerc')) {
                             finalUrl = `https://www.e.leclerc/recherche?q=${encodedName}`;
                        } else if (p.store_name.toLowerCase().includes('aldi')) {
                            finalUrl = `https://www.aldi.fr/recherche.html?query=${encodedName}`;
                        } else if (p.store_name.toLowerCase().includes('lidl')) {
                            finalUrl = `https://www.lidl.fr/q/search?q=${encodedName}`;
                        } else if (p.store_name.toLowerCase().includes('auchan')) {
                            finalUrl = `https://www.auchan.fr/recherche?text=${encodedName}`;
                        } else if (p.store_name.toLowerCase().includes('intermarch')) {
                            finalUrl = `https://www.intermarche.com/recherche/produits?terms=${encodedName}`;
                        } else {
                            // Ultimate fallback for any unknown store
                            finalUrl = `https://www.google.com/search?q=${encodeURIComponent(`${p.store_name} ${cleanProductName}`)}`;
                        }
                    }

                    return {
                        search_id: searchId,
                        store_name: p.store_name,
                        price: p.price,
                        currency: p.currency,
                        product_name: p.product_name,
                        unit: p.unit,
                        product_url: finalUrl,
                        created_at: new Date().toISOString()
                    };
                });
                await supabase.from('price_results').insert(resultRows);

                // Return the processed results to the frontend
                res.status(200).json({ results: resultRows });
                return;
            }
        }

        res.status(200).json({ results: prices });

    } catch (error) {
        console.error("Error processing request:", error);
        res.status(500).json({
            error: error.message || "Internal Server Error",
            stack: error.stack
        });
    }
}
