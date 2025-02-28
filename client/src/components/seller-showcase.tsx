import { Profile, Auction, User } from "@shared/schema";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Store, MapPin, Award, User as UserIcon } from "lucide-react";
import AuctionCard from "./auction-card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

interface SellerShowcaseProps {
  seller: User & {
    profile: Profile;
    auctions: Auction[];
  };
}

export function SellerShowcase({ seller }: SellerShowcaseProps) {
  // Get the most recent successful auctions
  const successfulAuctions = seller.auctions
    .filter(auction => auction.status === "ended" && auction.winningBidderId)
    .length;

  // Get active auctions
  const activeAuctions = seller.auctions
    .filter(auction => auction.status === "active" && auction.approved);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between">
            <div className="flex items-start gap-4">
              <Avatar className="h-16 w-16">
                <AvatarImage 
                  src={seller.profile.profilePicture} 
                  alt={seller.profile.businessName || seller.username} 
                />
                <AvatarFallback>
                  <UserIcon className="h-8 w-8" />
                </AvatarFallback>
              </Avatar>
              <div>
                <CardTitle className="text-xl">
                  <div className="flex items-center gap-2">
                    <Store className="h-5 w-5" />
                    {seller.profile.businessName || "Anonymous Seller"}
                  </div>
                </CardTitle>
                <CardDescription className="mt-2">
                  {seller.profile.isPublicBio && seller.profile.bio ? (
                    <p className="line-clamp-2">{seller.profile.bio}</p>
                  ) : (
                    "Premium poultry seller"
                  )}
                </CardDescription>
              </div>
            </div>
            {successfulAuctions > 0 && (
              <Badge variant="secondary" className="flex items-center gap-1">
                <Award className="h-3 w-3" />
                {successfulAuctions} Successful {successfulAuctions === 1 ? 'Sale' : 'Sales'}
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {seller.profile.state && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <MapPin className="h-4 w-4" />
                <span>Located in {seller.profile.state}</span>
              </div>
            )}

            {seller.profile.breedSpecialty && (
              <div className="space-y-1">
                <p className="text-sm font-medium">Breed Specialty</p>
                <p className="text-sm text-muted-foreground">
                  {seller.profile.breedSpecialty}
                </p>
              </div>
            )}

            {activeAuctions.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-sm font-medium">Current Auctions</h3>
                <div className="grid gap-4 sm:grid-cols-2">
                  {activeAuctions.map(auction => (
                    <AuctionCard 
                      key={auction.id} 
                      auction={auction}
                      compact={true}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}