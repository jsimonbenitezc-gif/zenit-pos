// ============================================
// API CLIENT - Comunicación con Backend
// ============================================

class APIClient {
    constructor(baseURL) {
        this.baseURL = baseURL || 'http://localhost:3000/api';
        this.token = null;
    }

    setToken(token) {
        this.token = token;
    }

    setBaseURL(url) {
        this.baseURL = url;
    }

    async request(endpoint, options = {}) {
        const url = `${this.baseURL}${endpoint}`;
        
        const headers = {
            'Content-Type': 'application/json',
            ...options.headers
        };

        if (this.token) {
            headers['Authorization'] = `Bearer ${this.token}`;
        }

        const config = {
            ...options,
            headers
        };

        if (options.body && typeof options.body === 'object') {
            config.body = JSON.stringify(options.body);
        }

        try {
            const response = await fetch(url, config);
            
            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || `HTTP ${response.status}`);
            }

            return await response.json();
        } catch (error) {
            console.error('API Request Error:', error);
            throw error;
        }
    }

    // AUTH
    async register(name, email, password) {
        const data = await this.request('/auth/register', {
            method: 'POST',
            body: { name, email, password }
        });
        if (data.token) {
            this.setToken(data.token);
        }
        return data;
    }

    async login(username, password) {
        const data = await this.request('/auth/login', {
            method: 'POST',
            body: { username, password }
        });
        
        if (data.token) {
            this.setToken(data.token);
        }
        
        return data;
    }

    // PRODUCTS
    async getProducts() {
        return await this.request('/products', { method: 'GET' });
    }

    async getProductsGrouped() {
        return await this.request('/products/grouped', { method: 'GET' });
    }

    async createProduct(product) {
        return await this.request('/products', {
            method: 'POST',
            body: product
        });
    }

    async updateProduct(id, product) {
        return await this.request(`/products/${id}`, {
            method: 'PUT',
            body: product
        });
    }

    async deleteProduct(id) {
        return await this.request(`/products/${id}`, { method: 'DELETE' });
    }

    // CATEGORIES
    async getCategories() {
        return await this.request('/categories', { method: 'GET' });
    }

    async createCategory(category) {
        return await this.request('/categories', {
            method: 'POST',
            body: category
        });
    }

    async updateCategory(id, category) {
        return await this.request(`/categories/${id}`, {
            method: 'PUT',
            body: category
        });
    }

    async deleteCategory(id) {
        return await this.request(`/categories/${id}`, { method: 'DELETE' });
    }

    // ORDERS
    async getOrders(filter) {
        const params = new URLSearchParams(filter).toString();
        return await this.request(`/orders?${params}`, { method: 'GET' });
    }

    async getOrderDetails(id) {
        return await this.request(`/orders/${id}`, { method: 'GET' });
    }

    async createOrder(orderData, items) {
        return await this.request('/orders', {
            method: 'POST',
            body: { ...orderData, items }
        });
    }

    async updateOrderStatus(id, status) {
        return await this.request(`/orders/${id}/status`, {
            method: 'PUT',
            body: { status }
        });
    }

    // CUSTOMERS
    async getCustomers() {
        return await this.request('/customers', { method: 'GET' });
    }

    async getCustomersWithStats() {
        return await this.request('/customers/with-stats', { method: 'GET' });
    }

    async createCustomer(customer) {
        return await this.request('/customers', {
            method: 'POST',
            body: customer
        });
    }

    async updateCustomer(id, customer) {
        return await this.request(`/customers/${id}`, {
            method: 'PUT',
            body: customer
        });
    }

    async deleteCustomer(id) {
        return await this.request(`/customers/${id}`, { method: 'DELETE' });
    }

    // STATS
    async getDashboardStats() {
        return await this.request('/stats/dashboard', { method: 'GET' });
    }

    // INVENTORY
    async getIngredients() {
        return await this.request('/inventory/ingredients', { method: 'GET' });
    }

    async createIngredient(ingredient) {
        return await this.request('/inventory/ingredients', {
            method: 'POST',
            body: ingredient
        });
    }

    async updateIngredient(id, ingredient) {
        return await this.request(`/inventory/ingredients/${id}`, {
            method: 'PUT',
            body: ingredient
        });
    }

    async getPreparations() {
        return await this.request('/inventory/preparations', { method: 'GET' });
    }

    async createPreparation(preparation) {
        return await this.request('/inventory/preparations', {
            method: 'POST',
            body: preparation
        });
    }

    async savePreparationRecipe(id, items) {
        return await this.request(`/inventory/preparations/${id}/recipe`, {
            method: 'POST',
            body: { items }
        });
    }

    async getProductRecipe(id) {
        return await this.request(`/inventory/products/${id}/recipe`, { method: 'GET' });
    }

    async saveProductRecipe(id, items) {
        return await this.request(`/inventory/products/${id}/recipe`, {
            method: 'POST',
            body: { items }
        });
    }

    async getMovements(params) {
        const query = new URLSearchParams(params).toString();
        return await this.request(`/inventory/movements?${query}`, { method: 'GET' });
    }

    async createMovement(movement) {
        return await this.request('/inventory/movements', {
            method: 'POST',
            body: movement
        });
    }

    // OFFERS
    async getDiscounts() {
        return await this.request('/offers/discounts', { method: 'GET' });
    }

    async createDiscount(discount) {
        return await this.request('/offers/discounts', {
            method: 'POST',
            body: discount
        });
    }

    async getCombos() {
        return await this.request('/offers/combos', { method: 'GET' });
    }

    async createCombo(combo) {
        return await this.request('/offers/combos', {
            method: 'POST',
            body: combo
        });
    }

    async saveComboItems(id, items) {
        return await this.request(`/offers/combos/${id}/items`, {
            method: 'POST',
            body: { items }
        });
    }
}

// Exportar clase
if (typeof module !== 'undefined' && module.exports) {
    module.exports = APIClient;
}