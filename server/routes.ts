import express, { type Express } from "express";
import { createServer, type Server } from "http";
import { setupAuth } from "./auth";
import { storage } from "./storage";

export async function registerRoutes(app: Express): Promise<Server> {
  console.log("[ROUTES] Starting route registration");

  const server = createServer(app);

  try {
    // Setup basic auth
    console.log("[ROUTES] Setting up authentication...");
    setupAuth(app);
    console.log("[ROUTES] Authentication setup complete");

    // Basic auctions endpoint
    app.get("/api/auctions", async (_req, res) => {
      try {
        console.log("[ROUTES] Fetching auctions");
        const auctions = await storage.getAuctions({ approved: true });
        res.json(auctions);
      } catch (error) {
        console.error("[ROUTES] Error fetching auctions:", error);
        res.status(500).json({ message: "Failed to fetch auctions" });
      }
    });

    console.log("[ROUTES] Route registration complete");
    return server;
  } catch (error) {
    console.error("[ROUTES] Error during route registration:", error);
    throw error;
  }
}