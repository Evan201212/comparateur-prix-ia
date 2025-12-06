# Food Scan

## Overview
This project allows users to search for food items and get real-time price estimates from major French supermarkets using Gemini AI. Results are stored in a Supabase database.

## Project Structure
- `index.html`: The main user interface with animations and glassmorphism design.
- `style.css`: Modern CSS styles.
- `app.js`: Frontend logic that connects to the backend function.
- `netlify/functions/get-prices.js`: Serverless function that calls Gemini AI and logs to Supabase.
- `netlify.toml`: Deployment configuration.

## Setup & Deployment

### 1. Prerequisites
- **Netlify Account**: Create one at netlify.com
- **Google Gemini API Key**: Get one from aistudio.google.com
- **Supabase Project**: `comparateur-prix-ia`

### 2. Environment Variables
You must set these variables in Netlify > Site Settings > Environment Variables:

- `GEMINI_API_KEY`: Your Google AI API Key.
- `SUPABASE_URL`: Your Supabase URL.
- `SUPABASE_SERVICE_ROLE_KEY`: Your Supabase Service Role Key.

### 3. Running Locally
To test locally:
1. Rename `.env.example` to `.env` and fill in your keys.
2. Run:
   ```bash
   npm install
   netlify dev
   ```
3. Open `http://localhost:8888`.

## Features
- **Real-time AI Search**: Queries Gemini 1.5 Flash for price estimates.
- **Sorting**: Filter results by price.
- **History**: Shows recent searches directly from Supabase.
- **Data Persistence**: Saves every search and result to the database.

## Disclaimer
The "prices" are AI-generated estimates based on the model's training data. This is a demonstration of AI integration.
