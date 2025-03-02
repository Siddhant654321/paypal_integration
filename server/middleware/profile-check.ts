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

    if (!profile) {
      console.log("[PROFILE CHECK] Profile not found for seller:", req.user.id);
      return res.status(403).json({
        message: "Please complete your seller profile before proceeding",
        code: "PROFILE_REQUIRED"
      });
    }

    // Add profile to request for use in routes
    req.userProfile = profile;
    next();
  } catch (error) {
    console.error("[PROFILE CHECK] Error checking profile:", error);
    res.status(500).json({
      message: "Error checking profile status",
      code: "PROFILE_CHECK_ERROR"
    });
  }
}
