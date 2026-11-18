const BaseAdapter = require('./BaseAdapter');
const logger = require('../utils/logger');
const https = require('https');

class CoopAdapter extends BaseAdapter {
    constructor() {
        super('Coop');
        this.apiBaseUrl = 'https://api.coop-heizoel.ch/occ/v2/cma';
        // SAP material codes for Coop heating oil products
        this.materialCodes = {
            heating_oil: '1302',
            heating_oil_20: '1301'
        };
    }

    async fetchPrice(zipCode, amount) {
        // 1. Get delivery weeks from pricediagram to find earliest available date
        const diagram = await this.fetchDiagramData(zipCode);
        const earliestWeek = this.findEarliestWeek(diagram);

        // 2. Call order-simulate with the real SAP pricing engine
        const deliveryFrom = earliestWeek.from;
        const deliveryTo = this.addDaysIso(deliveryFrom, 14);
        const simulation = await this.fetchSimulation(zipCode, amount, deliveryFrom, deliveryTo);

        // 3. Extract gross price (inkl. MwSt) — that's what the website displays
        const item = this.extractOrderItem(simulation);
        if (!item) {
            throw new Error('No order item in simulation response');
        }

        const grossTotal = parseFloat(item.grossAmount);
        const per100L = grossTotal / (amount / 100);

        // Plausibility: CH heating oil typically 80–250 CHF/100L
        if (!Number.isFinite(per100L) || per100L < 50 || per100L > 300) {
            throw new Error(`Implausible price: ${per100L.toFixed(2)} CHF/100L (gross total: ${grossTotal})`);
        }

        logger.info(`Coop simulate: ${grossTotal.toFixed(2)} CHF total → ${per100L.toFixed(2)} CHF/100L for ${amount}L (delivery ${deliveryFrom})`);
        return this.createPriceObject(grossTotal.toFixed(2), 'CHF', zipCode, amount);
    }

    fetchDiagramData(zipCode) {
        const url = `${this.apiBaseUrl}/prices/pricediagram/${zipCode}?lang=de&curr=CHF`;
        logger.info(`Coop diagram: ${url}`);
        return this.httpGetJson(url);
    }

    findEarliestWeek(diagram) {
        const offsetDays = parseInt(diagram.earliestDeliveryOffsetDays || '8', 10);
        const weeks = diagram.weeks || [];
        const now = new Date();
        const minDate = new Date(now.getTime() + offsetDays * 86400000);
        for (const w of weeks) {
            const fromDate = new Date(w.from);
            if (fromDate >= minDate) {
                return { week: w.week, from: w.from.split('T')[0], to: w.to.split('T')[0], surcharge: w.price };
            }
        }
        // Fallback: first week
        if (weeks.length > 0) {
            return { week: weeks[0].week, from: weeks[0].from.split('T')[0], to: weeks[0].to.split('T')[0], surcharge: weeks[0].price };
        }
        // Last resort: 14 days from now
        const from = new Date(now.getTime() + 14 * 86400000).toISOString().split('T')[0];
        return { week: 0, from, to: this.addDaysIso(from, 7), surcharge: 0 };
    }

    fetchSimulation(zipCode, amount, deliveryFrom, deliveryTo) {
        const url = `${this.apiBaseUrl}/order/order-simulate?orderCount=1&lang=de&curr=CHF`;
        const body = JSON.stringify({
            postalCode: String(zipCode),
            volume: String(amount),
            salesOrderItems: [
                { position: '10', material: this.materialCodes.heating_oil, requestedQuantity: String(amount), salesUnit: 'L15' }
            ],
            deliveryFrom,
            deliveryTo
        });
        logger.info(`Coop simulate: POST ${url} (zip=${zipCode}, vol=${amount}, delivery=${deliveryFrom})`);
        return this.httpPostJson(url, body);
    }

    extractOrderItem(simulation) {
        const simType = simulation?.salesOrderSimulation?.salesOrderSimulationType;
        if (!simType) return null;
        const items = simType?.toItem?.salesOrderItemSimulationType
            ?? simType?.to_Item?.A_SalesOrderItemSimulationType
            ?? [];
        return items.find(i => i.material === this.materialCodes.heating_oil) || items[0] || null;
    }

    addDaysIso(isoDate, days) {
        const [y, m, d] = isoDate.split('-').map(Number);
        const date = new Date(Date.UTC(y, m - 1, d));
        date.setUTCDate(date.getUTCDate() + days);
        return date.toISOString().split('T')[0];
    }

    httpGetJson(url) {
        return new Promise((resolve, reject) => {
            const options = {
                headers: {
                    'Accept': 'application/json',
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                }
            };
            https.get(url, options, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    if (res.statusCode !== 200) {
                        reject(new Error(`HTTP ${res.statusCode} from ${url}`));
                        return;
                    }
                    try { resolve(JSON.parse(data)); }
                    catch (e) { reject(new Error(`JSON parse failed: ${e.message}`)); }
                });
            }).on('error', reject);
        });
    }

    httpPostJson(url, body) {
        return new Promise((resolve, reject) => {
            const urlObj = new URL(url);
            const options = {
                hostname: urlObj.hostname,
                path: urlObj.pathname + urlObj.search,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                    'Content-Length': Buffer.byteLength(body)
                }
            };
            const req = https.request(urlObj, options, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    if (res.statusCode !== 200) {
                        reject(new Error(`HTTP ${res.statusCode} from ${url}: ${data.substring(0, 200)}`));
                        return;
                    }
                    try { resolve(JSON.parse(data)); }
                    catch (e) { reject(new Error(`JSON parse failed: ${e.message}`)); }
                });
            });
            req.on('error', reject);
            req.write(body);
            req.end();
        });
    }
}

module.exports = CoopAdapter;