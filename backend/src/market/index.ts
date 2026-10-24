import { MarketService } from "./marketService.js";

// One shared market data service for the whole process.
export const marketService = new MarketService();