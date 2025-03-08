CREATE TABLE "auctions" (
	"id" serial PRIMARY KEY NOT NULL,
	"seller_id" integer NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"species" text NOT NULL,
	"category" text NOT NULL,
	"image_url" text,
	"images" text[] DEFAULT '{}' NOT NULL,
	"start_price" integer NOT NULL,
	"reserve_price" integer NOT NULL,
	"current_price" integer NOT NULL,
	"start_date" timestamp NOT NULL,
	"end_date" timestamp NOT NULL,
	"approved" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"payment_status" text DEFAULT 'pending' NOT NULL,
	"payment_due_date" timestamp,
	"winning_bidder_id" integer,
	"seller_decision" text,
	"reserve_met" boolean DEFAULT false NOT NULL,
	"fulfillment_required" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bids" (
	"id" serial PRIMARY KEY NOT NULL,
	"auction_id" integer NOT NULL,
	"bidder_id" integer NOT NULL,
	"amount" integer NOT NULL,
	"timestamp" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "buyer_requests" (
	"id" serial PRIMARY KEY NOT NULL,
	"buyer_id" integer NOT NULL,
	"title" text NOT NULL,
	"species" text NOT NULL,
	"category" text NOT NULL,
	"description" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"views" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fulfillments" (
	"id" serial PRIMARY KEY NOT NULL,
	"auction_id" integer NOT NULL,
	"shipping_carrier" text NOT NULL,
	"tracking_number" text NOT NULL,
	"shipping_date" timestamp NOT NULL,
	"estimated_delivery_date" timestamp,
	"additional_notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "fulfillments_auction_id_unique" UNIQUE("auction_id")
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"message" text NOT NULL,
	"read" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now(),
	"data" text,
	"reference" text
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" serial PRIMARY KEY NOT NULL,
	"auction_id" integer NOT NULL,
	"buyer_id" integer NOT NULL,
	"seller_id" integer NOT NULL,
	"amount" integer NOT NULL,
	"platform_fee" integer NOT NULL,
	"seller_payout" integer NOT NULL,
	"insurance_fee" integer NOT NULL,
	"stripe_payment_intent_id" varchar NOT NULL,
	"status" varchar NOT NULL,
	"payout_processed" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payouts" (
	"id" serial PRIMARY KEY NOT NULL,
	"seller_id" integer NOT NULL,
	"payment_id" integer NOT NULL,
	"amount" integer NOT NULL,
	"stripe_transfer_id" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "profiles" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"full_name" text NOT NULL,
	"email" text NOT NULL,
	"phone_number" text NOT NULL,
	"address" text NOT NULL,
	"city" text NOT NULL,
	"state" text NOT NULL,
	"zip_code" text NOT NULL,
	"bio" text,
	"is_public_bio" boolean DEFAULT true NOT NULL,
	"profile_picture" text,
	"email_bid_notifications" boolean DEFAULT true NOT NULL,
	"email_auction_notifications" boolean DEFAULT true NOT NULL,
	"email_payment_notifications" boolean DEFAULT true NOT NULL,
	"email_admin_notifications" boolean DEFAULT true NOT NULL,
	"business_name" text,
	"breed_specialty" text,
	"npip_number" text,
	"stripe_account_id" text,
	"stripe_account_status" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "profiles_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "seller_payouts" (
	"id" serial PRIMARY KEY NOT NULL,
	"seller_id" integer NOT NULL,
	"payment_id" integer NOT NULL,
	"amount" integer NOT NULL,
	"stripe_transfer_id" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"username" text NOT NULL,
	"password" text NOT NULL,
	"email" text NOT NULL,
	"role" text NOT NULL,
	"approved" boolean DEFAULT false NOT NULL,
	"has_profile" boolean DEFAULT false NOT NULL,
	"email_notifications_enabled" boolean DEFAULT true NOT NULL,
	CONSTRAINT "users_username_unique" UNIQUE("username")
);
--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_auction_id_auctions_id_fk" FOREIGN KEY ("auction_id") REFERENCES "public"."auctions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_buyer_id_users_id_fk" FOREIGN KEY ("buyer_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_seller_id_users_id_fk" FOREIGN KEY ("seller_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seller_payouts" ADD CONSTRAINT "seller_payouts_seller_id_users_id_fk" FOREIGN KEY ("seller_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seller_payouts" ADD CONSTRAINT "seller_payouts_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE no action ON UPDATE no action;