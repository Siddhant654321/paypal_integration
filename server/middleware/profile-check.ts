import { Request, Response, NextFunction } from "express";
import { storage } from "../storage";

export async function checkSellerProfile(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    // Only check profile for sellers and seller admins
    if (!req.user || !["seller", "seller_admin"].includes(req.user.role)) {
      return next();
    }

    console.log("[PROFILE CHECK] Checking profile for user:", {
      userId: req.user.id,
      role: req.user.role
    });

    const profile = await storage.getProfile(req.user.id);

    // Instead of blocking, attach profile status to request
    req.userProfile = profile || null;

    // For critical operations that absolutely require a profile
    if (req.path.includes('/api/payments') && !profile) {
      console.log("[PROFILE CHECK] Profile required for payment operations");
      return res.status(403).json({
        message: "Please complete your seller profile before processing payments",
        code: "PROFILE_REQUIRED"
      });
    }

    // For auction creation, allow but with a warning
    if (req.path.includes('/api/auctions') && req.method === 'POST' && !profile) {
      console.log("[PROFILE CHECK] Missing profile for auction creation");
      res.set('X-Profile-Warning', 'Seller profile incomplete');
    }

    next();
  } catch (error) {
    console.error("[PROFILE CHECK] Error checking profile:", error);
    // Don't block the request on profile check errors
    next();
  }
}