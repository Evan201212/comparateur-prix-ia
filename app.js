
// Initialize Supabase Client
// We use the public anon key here. It's safe to expose for public read access if RLS is configured.
const SUPABASE_URL = 'https://qagvllahsubeymnrjoqu.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFhZ3ZsbGFoc3ViZXltbnJqb3F1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ5MDA1MTcsImV4cCI6MjA4MDQ3NjUxN30.7eN3dcVViEtTexfJU6RfXrFaxfS9q0BViT6rd9X7NjY';

let supabase;

try {
    supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    console.log("Supabase initialized");
} catch (e) {
    console.error("Supabase init failed", e);
}

// DOM Elements
const searchForm = document.getElementById('search-form');
const searchInput = document.getElementById('product-input');
const statusMessage = document.getElementById('status-message');
const resultsSection = document.getElementById('results-section');
const resultsGrid = document.getElementById('results-grid');
const queryDisplay = document.getElementById('query-display');
const sortSelect = document.getElementById('sort-select');
const historyContainer = document.getElementById('history-tags');

let currentResults = [];

// Event Listeners
searchForm.addEventListener('submit', handleSearch);
sortSelect.addEventListener('change', () => renderResults(currentResults));
document.addEventListener('DOMContentLoaded', loadHistory);

// Search Handler
async function handleSearch(e) {
    e.preventDefault();
    const query = searchInput.value.trim();
    if (!query) return;

    // UI Updates
    statusMessage.classList.remove('hidden');
    resultsSection.classList.add('hidden');
    resultsGrid.innerHTML = '';
    queryDisplay.textContent = query;

    try {
        // Call Netlify Function
        const response = await fetch('/.netlify/functions/get-prices', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query })
        });

        if (!response.ok) {
            const errorData = await response.json();
            // Netlify or Function errors might use different fields
            throw new Error(errorData.error || errorData.details || errorData.message || errorData.errorMessage || 'Erreur inconnue');
        }

        const data = await response.json();

        if (data.results) {
            currentResults = data.results;
            renderResults(currentResults);
            loadHistory(); // Refresh history
        } else {
            throw new Error('No results found');
        }

    } catch (error) {
        console.error('Error:', error);
        resultsGrid.innerHTML = `
            <div class="error-container">
                <p class="error-title">Oups ! Une erreur est survenue.</p>
                <p class="error-message">${error.message}</p>
                <p class="error-hint">Vérifiez la configuration (Clé API) ou réessayez.</p>
            </div>`;
        resultsSection.classList.remove('hidden');
    } finally {
        statusMessage.classList.add('hidden');
        resultsSection.classList.remove('hidden');
    }
}

// Render Results
function renderResults(results) {
    resultsGrid.innerHTML = '';

    // Convert text prices/currencies to numbers for sorting if needed, 
    // but assuming API returns numbers.
    const sortMode = sortSelect.value;

    const sorted = [...results].sort((a, b) => {
        if (sortMode === 'price-asc') return a.price - b.price;
        if (sortMode === 'price-desc') return b.price - a.price;
        return 0;
    });

    sorted.forEach(item => {
        const card = document.createElement('div');
        card.className = 'price-card';
        card.innerHTML = `
            <div class="result-details">
                <div class="store-name">${escapeHtml(item.store_name)}</div>
                <div class="product-name">${escapeHtml(item.product_name)}</div>
                <div class="product-unit">${escapeHtml(item.unit)}</div>
            </div>
            <div class="result-actions">
                <div class="result-price">${item.price.toFixed(2)} ${item.currency}</div>
                ${item.product_url ?
                `<a href="${item.product_url}" target="_blank" class="product-link-btn">Voir le produit 🔗</a>` :
                ''
            }
            </div>
        `;
        resultsGrid.appendChild(card);
    });
}

// History
async function loadHistory() {
    if (!supabase) return;

    const { data, error } = await supabase
        .from('search_history')
        .select('query, created_at')
        .order('created_at', { ascending: false })
        .limit(10);

    if (error) {
        console.error("Error fetching history:", error);
        return;
    }

    // Deduplicate
    const uniqueQueries = [...new Set(data.map(item => item.query))];

    historyContainer.innerHTML = '';

    if (uniqueQueries.length === 0) {
        historyContainer.innerHTML = '<span class="placeholder-text">Pas encore de recherches récentes.</span>';
        return;
    }

    uniqueQueries.forEach(q => {
        const tag = document.createElement('span');
        tag.className = 'history-tag';
        tag.textContent = q;
        tag.onclick = () => {
            searchInput.value = q;
            handleSearch({ preventDefault: () => { } });
        };
        historyContainer.appendChild(tag);
    });
}

// Utility
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}
