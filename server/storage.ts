import { users, type User, type InsertUser } from "@shared/schema";
import { db } from "./db";
import { eq } from "drizzle-orm";

function log(message: string, context = "general") {
  console.log(`[STORAGE:${context}] ${message}`);
}

export interface IStorage {
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(insertUser: InsertUser): Promise<User>;
  hasProfile(userId: number): Promise<boolean>;
}

export class DatabaseStorage implements IStorage {
  async getUser(id: number): Promise<User | undefined> {
    try {
      // Ensure id is a number
      const userId = typeof id === 'string' ? parseInt(id, 10) : id;

      log(`Getting user with ID: ${userId} (type: ${typeof userId})`);

      if (isNaN(userId)) {
        log(`Invalid user ID: ${id}`);
        return undefined;
      }

      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.id, userId));

      log(`User lookup result: ${JSON.stringify({
        id: userId,
        found: !!user,
        role: user?.role
      })}`);

      return user;
    } catch (error) {
      log(`Error getting user ${id}: ${error}`);
      throw error;
    }
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    try {
      log(`Looking up user by username: ${username}`);

      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.username, username));

      log(`Username lookup result: ${JSON.stringify({
        username,
        found: !!user,
        role: user?.role
      })}`);

      return user;
    } catch (error) {
      log(`Error getting user by username ${username}: ${error}`);
      throw error;
    }
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    try {
      log(`Creating new user: ${insertUser.username}`);
      const [user] = await db.insert(users).values(insertUser).returning();
      log(`User created successfully: ${user.username}`);
      return user;
    } catch (error) {
      log(`Error creating user: ${error}`);
      throw error;
    }
  }

  async hasProfile(userId: number): Promise<boolean> {
    try {
      const user = await this.getUser(userId);
      return user?.hasProfile || false;
    } catch (error) {
      log(`Error checking profile for user ${userId}: ${error}`);
      return false;
    }
  }
}

export const storage = new DatabaseStorage();