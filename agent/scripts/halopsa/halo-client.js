const axios = require('axios');
require('dotenv').config();

class HaloPSAClient {
    constructor() {
        this.clientId = process.env.HALO_CLIENT_ID;
        this.clientSecret = process.env.HALO_CLIENT_SECRET;
        this.tenantName = process.env.HALO_TENANT_NAME;
        this.baseUrl = process.env.HALO_BASE_URL;
        this.accessToken = null;
        this.tokenExpiry = null;
    }

    async authenticate() {
        try {
            const tokenUrl = `${this.baseUrl}/auth/token?tenant=${this.tenantName}`;
            
            const response = await axios.post(tokenUrl, {
                grant_type: 'client_credentials',
                client_id: this.clientId,
                client_secret: this.clientSecret,
                scope: 'all'
            }, {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                }
            });

            this.accessToken = response.data.access_token;
            this.tokenExpiry = Date.now() + (response.data.expires_in * 1000);
            
            console.log('Authentication successful');
            return this.accessToken;
        } catch (error) {
            console.error('Authentication failed:', error.response?.data || error.message);
            throw error;
        }
    }

    async ensureAuthenticated() {
        if (!this.accessToken || Date.now() >= this.tokenExpiry) {
            await this.authenticate();
        }
    }

    async makeRequest(method, endpoint, data = null) {
        await this.ensureAuthenticated();
        
        try {
            const config = {
                method,
                url: `${this.baseUrl}/api/${endpoint}`,
                headers: {
                    'Authorization': `Bearer ${this.accessToken}`,
                    'Content-Type': 'application/json'
                }
            };

            if (data) {
                config.data = data;
            }

            const response = await axios(config);
            return response.data;
        } catch (error) {
            console.error(`API request failed:`, error.response?.data || error.message);
            throw error;
        }
    }

    // Example API methods
    async getTickets() {
        return this.makeRequest('GET', 'tickets');
    }

    async getClients() {
        return this.makeRequest('GET', 'client');
    }

    async getUsers() {
        return this.makeRequest('GET', 'users');
    }

    async createTicket(ticketData) {
        return this.makeRequest('POST', 'tickets', ticketData);
    }
}

module.exports = HaloPSAClient;