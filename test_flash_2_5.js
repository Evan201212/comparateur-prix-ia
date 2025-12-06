import { GoogleGenerativeAI } from "@google/generative-ai";

const apiKey = "AIzaSyD4MTxBGHxHxae3T9ydUhClP1XY5nUEtIg";
const genAI = new GoogleGenerativeAI(apiKey);
const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

async function testModel() {
    try {
        console.log("Testing Prompt...");
        const product = "salade"; // User's query
        const prompt = `You are "Food Scan", a real-time price comparator for the French market.
        SEARCH for the product: "${product}".
        
        ESTIMATE current prices in France (Euro €) for these stores:
        - E.Leclerc
        - Carrefour
        - Intermarché
        - Lidl
        - Aldi
        - Auchan

        RETURN ONLY A RAW JSON ARRAY. Do not include markdown formatting like \`\`\`json.
        Example format:
        [
            {"store": "E.Leclerc", "price": 1.20, "product_name": "Salade Iceberg Bio"},
            {"store": "Lidl", "price": 0.99, "product_name": "Salade Laitue"}
        ]
        
        If no exact price is found, make a realistic estimate based on typical French market prices.
        Sort by price (low to high).`;

        const result = await model.generateContent(prompt);
        const response = await result.response;
        console.log("Response text:", response.text());
    } catch (error) {
        console.error("Error:", error);
    }
}

testModel();
