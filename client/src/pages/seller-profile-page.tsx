
import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Separator } from "../components/ui/separator";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { AuctionCard } from "../components/auction-card";
import { LoadingSpinner } from "../components/ui/loading-spinner";
import { Phone, Mail, MapPin, Store, Clock, Award } from "lucide-react";
import type { User, Profile, Auction } from "@shared/schema";

export function SellerProfilePage() {
  const { sellerId } = useParams<{ sellerId: string }>();
  const [error, setError] = useState<string | null>(null);

  // Fetch seller data
  const { data: seller, isLoading } = useQuery<{
    seller: User;
    profile: Profile;
    auctions: Auction[];
  }>({
    queryKey: [`/api/sellers/${sellerId}`],
    enabled: !!sellerId,
    onError: (err: any) => {
      setError(err.message || "Failed to load seller profile");
    },
  });

  // Separate active and past auctions
  const activeAuctions = seller?.auctions?.filter(
    (auction) => auction.status === "active" && auction.approved
  ) || [];

  const pastAuctions = seller?.auctions?.filter(
    (auction) => auction.status === "ended" && auction.approved
  ) || [];

  if (isLoading) {
    return (
      <div className="container py-8 flex justify-center">
        <LoadingSpinner className="h-8 w-8" />
      </div>
    );
  }

  if (error || !seller || !seller.profile) {
    return (
      <div className="container py-8">
        <Card>
          <CardContent className="pt-6">
            <div className="text-center space-y-2">
              <h2 className="text-xl font-bold">Error Loading Profile</h2>
              <p className="text-muted-foreground">
                {error || "This seller profile is not available"}
              </p>
              <Button variant="outline" onClick={() => window.history.back()}>
                Go Back
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container py-8 space-y-8">
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl">
            {seller.profile.businessName || "Seller Profile"}
          </CardTitle>
          <CardDescription>
            Member since {new Date(seller.profile.createdAt).toLocaleDateString()}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-4">
            {seller.profile.bio && seller.profile.isPublicBio && (
              <div className="space-y-2">
                <h3 className="font-medium">About Us</h3>
                <p className="text-muted-foreground whitespace-pre-wrap">
                  {seller.profile.bio}
                </p>
              </div>
            )}

            {seller.profile.breedSpecialty && (
              <div className="space-y-2">
                <h3 className="font-medium">Specialty</h3>
                <p className="text-muted-foreground">{seller.profile.breedSpecialty}</p>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="flex items-center gap-2">
                <Store className="h-4 w-4 flex-shrink-0" />
                <span>{activeAuctions.length} Active Listings</span>
              </div>
              <div className="flex items-center gap-2">
                <Award className="h-4 w-4 flex-shrink-0" />
                <span>{pastAuctions.length} Completed Auctions</span>
              </div>
              <div className="flex items-center gap-2">
                <MapPin className="h-4 w-4 flex-shrink-0" />
                <span>Location: {seller.profile.city}, {seller.profile.state}</span>
              </div>
              {seller.profile.npipNumber && (
                <div className="flex items-center gap-2">
                  <Badge variant="outline">NPIP #{seller.profile.npipNumber}</Badge>
                </div>
              )}
            </div>

            <Separator />

            {/* Contact Information */}
            <div className="space-y-2">
              <h3 className="font-medium">Contact Information</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Mail className="h-4 w-4" />
                  <span>{seller.profile.email}</span>
                </div>
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Phone className="h-4 w-4" />
                  <span>{seller.profile.phoneNumber}</span>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Active Auctions */}
      {activeAuctions.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-2xl font-bold">Active Auctions</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {activeAuctions.map(auction => (
              <AuctionCard key={auction.id} auction={auction} />
            ))}
          </div>
        </div>
      )}

      {/* Past Auctions */}
      {pastAuctions.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-2xl font-bold">Past Auctions</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {pastAuctions.slice(0, 6).map(auction => (
              <AuctionCard key={auction.id} auction={auction} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
