
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

            // AUTO-ADD Logic: Find the absolute cheapest item and add it to the relevant cart
            if (currentResults.length > 0) {
                // Sort by price to find cheapest
                const sortedByPrice = [...currentResults].sort((a, b) => a.price - b.price);
                const bestDeal = sortedByPrice[0];

                // Add to cart automatically
                addToCart(bestDeal, true);

                // Optional: Notify user visually (simple toast or console for now)
                // We could add a visual highlight in the results too
            }

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

// Cart State
let carts = {
    'Intermarché': [],
    'Lidl': [],
    'Auchan': [],
    'Aldi': [],
    'Carrefour': [],
    'E.Leclerc': []
};

// Colors for console logs
const STORE_COLORS = {
    'Intermarché': '#e11b22',
    'Lidl': '#0050aa',
    'Auchan': '#eec4c4',
    'Aldi': '#002e7b',
    'Carrefour': '#0055aa',
    'E.Leclerc': '#0066cc'
};

// Load Carts from storage
function loadCarts() {
    const saved = localStorage.getItem('foodScanCarts');
    if (saved) {
        carts = JSON.parse(saved);
        renderCarts();
    }
}

// Save Carts
function saveCarts() {
    localStorage.setItem('foodScanCarts', JSON.stringify(carts));
    renderCarts();
}

// Add Item to Cart
function addToCart(item, isAuto = false) {
    // Normalize store name to match keys
    let storeKey = Object.keys(carts).find(key => item.store_name.toLowerCase().includes(key.toLowerCase()));

    // Fallback for slight mismatches
    if (!storeKey) {
        if (item.store_name.includes('Leclerc')) storeKey = 'E.Leclerc';
        else if (item.store_name.includes('Intermar')) storeKey = 'Intermarché';
    }

    if (storeKey && carts[storeKey]) {
        // Prevent exact duplicates
        const exists = carts[storeKey].some(i => i.product_name === item.product_name && i.price === item.price);
        if (!exists) {
            carts[storeKey].push(item);
            saveCarts();
            if (isAuto) {
                console.log(`Auto-added best deal to ${storeKey}: ${item.product_name}`);
            }
        }
    }
}

// Remove Item
window.removeFromCart = function (storeKey, index) {
    if (carts[storeKey]) {
        carts[storeKey].splice(index, 1);
        saveCarts();
    }
}

// Clear All
document.getElementById('clear-all-carts')?.addEventListener('click', () => {
    if (confirm('Vider tous les paniers ?')) {
        Object.keys(carts).forEach(k => carts[k] = []);
        saveCarts();
    }
});

// Render Carts UI
function renderCarts() {
    Object.keys(carts).forEach(storeKey => {
        const container = document.querySelector(`.store-cart[data-store="${storeKey.replace('E.', '')}"]`);
        // Handle special naming difference if any, e.g. E.Leclerc vs Leclerc in HTML
        // Actually my HTML used 'Leclerc' for data-store, but logic might use 'E.Leclerc'
        const normalizedKey = storeKey === 'E.Leclerc' ? 'Leclerc' : storeKey;
        const selector = `.store-cart[data-store="${normalizedKey}"]`;
        const storeDiv = document.querySelector(selector);

        if (storeDiv) {
            const list = storeDiv.querySelector('.cart-items');
            const totalSpan = storeDiv.querySelector('.cart-total');

            list.innerHTML = '';

            let total = 0;
            carts[storeKey].forEach((item, index) => {
                total += item.price;
                const li = document.createElement('li');
                li.className = 'cart-item';
                li.innerHTML = `
                    <span class="cart-item-name" title="${item.product_name}">${item.product_name}</span>
                    <span class="cart-item-price">${item.price.toFixed(2)}€</span>
                    <button class="delete-item-btn" onclick="removeFromCart('${storeKey}', ${index})">×</button>
                `;
                list.appendChild(li);
            });

            totalSpan.textContent = total.toFixed(2) + '€';
        }
    });
}

// Initialize Carts
document.addEventListener('DOMContentLoaded', loadCarts);


// Utility
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}
