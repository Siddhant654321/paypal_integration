import express, { type Express } from "express";
import { createServer } from "http";
import { setupSession } from "./auth";
import { db } from "./db";

export async function registerRoutes(app: Express) {
  // Set up authentication
  setupSession(app);
  
  // Create HTTP server
  const server = createServer(app);
  
  // Health check endpoint
  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });
  
  return server;
}