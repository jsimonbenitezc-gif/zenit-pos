// ============================================
// API CLIENT - Comunicación con Backend
// ============================================

const API_REQUEST_TIMEOUT_MS = 30000; // 30 segundos

class APIClient {
    constructor(baseURL) {
        this.baseURL = baseURL || 'http://localhost:3000/api';
        this.token = null;
        this.refreshToken = null;
        this.onTokenRefreshed = null; // callback (token, refreshToken) tras rotación exitosa
        this.onSessionExpired = null; // callback cuando el refresh también falla
        this._refreshPromise = null;  // dedupe: evita refrescar varias veces en paralelo
    }

    setToken(token) {
        this.token = token;
    }

    setRefreshToken(refreshToken) {
        this.refreshToken = refreshToken;
    }

    setBaseURL(url) {
        this.baseURL = url;
    }

    // Intenta rotar el access token usando el refresh token actual.
    // Devuelve el nuevo access token o null si falló.
    // Usa fetch directamente (no this.request) para evitar recursión infinita.
    async _doRefresh() {
        if (!this.refreshToken) return null;
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), API_REQUEST_TIMEOUT_MS);
        try {
            const response = await fetch(`${this.baseURL}/auth/refresh`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ refreshToken: this.refreshToken }),
                cache: 'no-store',
                signal: controller.signal
            });
            if (!response.ok) return null;
            const data = await response.json();
            if (!data || !data.token) return null;
            this.token = data.token;
            if (data.refreshToken) this.refreshToken = data.refreshToken;
            if (this.onTokenRefreshed) {
                try { await this.onTokenRefreshed(data.token, data.refreshToken || null); } catch (e) {}
            }
            return data.token;
        } catch (e) {
            return null;
        } finally {
            clearTimeout(timeout);
        }
    }

    // Garantiza una sola operación de refresh concurrente.
    _refreshTokenOnce() {
        if (!this._refreshPromise) {
            this._refreshPromise = this._doRefresh().finally(() => {
                this._refreshPromise = null;
            });
        }
        return this._refreshPromise;
    }

    async request(endpoint, options = {}, _isRetry = false) {
        const url = `${this.baseURL}${endpoint}`;

        const headers = {
            'Content-Type': 'application/json',
            ...options.headers
        };

        if (this.token) {
            headers['Authorization'] = `Bearer ${this.token}`;
        }

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), API_REQUEST_TIMEOUT_MS);

        const config = {
            ...options,
            headers,
            cache: 'no-store',
            signal: controller.signal
        };

        if (options.body && typeof options.body === 'object') {
            config.body = JSON.stringify(options.body);
        }

        try {
            const response = await fetch(url, config);

            // Access token expirado → intentar rotarlo con el refresh token y reintentar una vez.
            // (No aplica a login/register: ahí un 401 significa credenciales incorrectas.)
            const esEndpointAuth = endpoint.startsWith('/auth/login') || endpoint.startsWith('/auth/register');
            if (response.status === 401 && !esEndpointAuth) {
                if (!_isRetry && this.refreshToken) {
                    const nuevoToken = await this._refreshTokenOnce();
                    if (nuevoToken) {
                        return this.request(endpoint, options, true);
                    }
                }
                if (this.onSessionExpired) {
                    try { this.onSessionExpired(); } catch (e) {}
                }
                const error = await response.json().catch(() => ({}));
                throw new Error(error.error || 'Sesión expirada');
            }

            if (!response.ok) {
                const error = await response.json().catch(() => ({}));
                throw new Error(error.error || `HTTP ${response.status}`);
            }

            return await response.json();
        } catch (error) {
            if (error.name === 'AbortError') {
                throw new Error('El servidor tardó demasiado en responder');
            }
            console.error('API Request Error:', error);
            throw error;
        } finally {
            clearTimeout(timeout);
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
        if (data.refreshToken) {
            this.setRefreshToken(data.refreshToken);
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
        if (data.refreshToken) {
            this.setRefreshToken(data.refreshToken);
        }

        return data;
    }

    // Recorre todos los pages de un endpoint paginado ({ data, pagination })
    // y devuelve un array plano. Tolera respuestas legacy que ya son array.
    async _getAllPaginated(endpoint) {
        const sep = endpoint.includes('?') ? '&' : '?';
        let page = 1;
        const acumulado = [];
        // Tope de seguridad para no ciclar indefinidamente
        for (let i = 0; i < 100; i++) {
            const resp = await this.request(`${endpoint}${sep}page=${page}&limit=100`, { method: 'GET' });
            if (Array.isArray(resp)) return resp; // endpoint no paginado
            const filas = Array.isArray(resp?.data) ? resp.data : [];
            acumulado.push(...filas);
            const totalPages = resp?.pagination?.totalPages || 1;
            if (page >= totalPages || filas.length === 0) break;
            page++;
        }
        return acumulado;
    }

    // PRODUCTS
    async getProducts() {
        return await this._getAllPaginated('/products');
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
        return await this._getAllPaginated('/customers');
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

    async getAlerts() {
        return await this.request('/alerts', { method: 'GET' });
    }

    // AJUSTES (nube)
    async getSettings() {
        return await this.request('/settings', { method: 'GET' });
    }

    async saveSettings(data) {
        return await this.request('/settings', { method: 'PUT', body: data });
    }

    // MESAS
    async getTables() {
        return await this.request('/tables', { method: 'GET' });
    }

    async createTable(data) {
        return await this.request('/tables', { method: 'POST', body: data });
    }

    async deleteTable(id) {
        return await this.request(`/tables/${id}`, { method: 'DELETE' });
    }

    async openTableOrder(tableId, guests, notes, branchId) {
        return await this.request('/orders', {
            method: 'POST',
            body: { table_id: tableId, guests: guests || null, notes: notes || null, items: [], branch_id: branchId || null }
        });
    }

    async addItemsToOrder(orderId, items) {
        return await this.request(`/orders/${orderId}/items`, { method: 'POST', body: { items } });
    }

    async removeOrderItem(orderId, itemId) {
        return await this.request(`/orders/${orderId}/items/${itemId}`, { method: 'DELETE' });
    }

    async closeTableOrder(orderId, paymentMethod) {
        return await this.request(`/orders/${orderId}/status`, {
            method: 'PUT',
            body: { status: 'completado', payment_method: paymentMethod || 'efectivo' }
        });
    }

    // TURNOS
    async getTurnoActivo(branchId) {
        const q = branchId ? `?branch_id=${branchId}` : '';
        return await this.request(`/turnos/activo${q}`, { method: 'GET' });
    }

    async abrirTurno(cajeroNombre, rol, fondoInicial, branchId) {
        return await this.request('/turnos', {
            method: 'POST',
            body: { cajero_nombre: cajeroNombre, rol, fondo_inicial: fondoInicial, branch_id: branchId || null }
        });
    }

    async cerrarTurno(id, efectivoContado, notas) {
        return await this.request(`/turnos/${id}/cerrar`, {
            method: 'PUT',
            body: { efectivo_contado: efectivoContado, notas: notas || null }
        });
    }

    async getHistorialTurnos(branchId) {
        const q = branchId ? `?branch_id=${branchId}` : '';
        return await this.request(`/turnos/historial${q}`, { method: 'GET' });
    }

    async getTurnoTotales(turnoId) {
        return await this.request(`/turnos/${turnoId}/totales`, { method: 'GET' });
    }

    getTurnoEventsUrl() {
        if (!this.token) return null;
        return `${this.baseURL}/turnos/events?token=${this.token}`;
    }

    // SUCURSALES
    async getBranches() {
        return await this.request('/branches', { method: 'GET' });
    }

    async updateBranch(id, data) {
        return await this.request(`/branches/${id}`, { method: 'PUT', body: data });
    }

    // SETTINGS — PIN hashing
    async hashPin(pin) {
        return await this.request('/settings/hash-pin', {
            method: 'POST',
            body: { pin }
        });
    }

    // AUDITORÍA / PIN DE EMPLEADO
    async verifyEmployeePin(employeeId, pin) {
        return await this.request('/staff/verify-pin', {
            method: 'POST',
            body: { employee_id: employeeId, pin }
        });
    }

    async cancelOrder(orderId, employeeId, pin, employeeName) {
        return await this.request(`/orders/${orderId}/status`, {
            method: 'PUT',
            body: { status: 'cancelado', employee_id: employeeId, pin, employee_name: employeeName }
        });
    }

    async updateCustomerWithPin(id, data, employeeId, pin, employeeName) {
        return await this.request(`/customers/${id}`, {
            method: 'PUT',
            body: { ...data, employee_id: employeeId, pin, employee_name: employeeName }
        });
    }

    async createMovementWithPin(data, employeeId, pin, employeeName) {
        return await this.request('/inventory/movements', {
            method: 'POST',
            body: { ...data, employee_id: employeeId, pin, employee_name: employeeName }
        });
    }

    async getAuditLogs(params = {}) {
        const q = new URLSearchParams(params).toString();
        return await this.request(`/audit${q ? '?' + q : ''}`, { method: 'GET' });
    }

    // LISTA DE COMPRAS
    async getShoppingList(branchId) {
        const q = branchId ? `?branch_id=${branchId}` : '';
        return await this.request(`/shopping-list${q}`, { method: 'GET' });
    }

    async getShoppingInventoryOptions(branchId) {
        const q = branchId ? `?branch_id=${branchId}` : '';
        return await this.request(`/shopping-list/inventory-options${q}`, { method: 'GET' });
    }

    async generateShoppingList(branchId) {
        return await this.request('/shopping-list/generate', { method: 'POST', body: { branch_id: branchId || null } });
    }

    async addShoppingItem(data) {
        return await this.request('/shopping-list/items', { method: 'POST', body: data });
    }

    async updateShoppingItem(id, data) {
        return await this.request(`/shopping-list/items/${id}`, { method: 'PUT', body: data });
    }

    async deleteShoppingItem(id) {
        return await this.request(`/shopping-list/items/${id}`, { method: 'DELETE' });
    }

    async clearShoppingList(branchId) {
        return await this.request('/shopping-list/clear', { method: 'POST', body: { branch_id: branchId || null } });
    }

    async sendShoppingList(branchId, sentBy) {
        return await this.request('/shopping-list/send', { method: 'POST', body: { branch_id: branchId || null, sent_by: sentBy || null } });
    }
}

// Exportar clase
if (typeof module !== 'undefined' && module.exports) {
    module.exports = APIClient;
}