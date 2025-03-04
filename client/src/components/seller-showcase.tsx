import { Profile, Auction, User } from "@shared/schema";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Store, MapPin, Award, User as UserIcon, ArrowRight } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";

interface SellerShowcaseProps {
  seller: User & {
    profile: Profile;
    auctions: Auction[];
  };
}

export function SellerShowcase({ seller }: SellerShowcaseProps) {
  // Make sure seller has auctions array
  const sellerAuctions = seller.auctions || [];
  
  const successfulAuctions = sellerAuctions
    .filter(auction => auction.status === "ended" && auction.winningBidderId)
    .length;

  const activeAuctions = sellerAuctions
    .filter(auction => auction.status === "active" && auction.approved);

  return (
    <Card className="hover:shadow-lg transition-shadow">
      <CardHeader className="space-y-4">
        <div className="flex items-center gap-3">
          <Avatar className="h-12 w-12">
            <AvatarImage 
              src={seller.profile.profilePicture || ""} 
              alt={seller.profile.businessName || seller.username} 
            />
            <AvatarFallback>
              <UserIcon className="h-6 w-6" />
            </AvatarFallback>
          </Avatar>
          <div className="space-y-1">
            <CardTitle className="text-lg">
              <div className="flex items-center gap-2">
                <Store className="h-4 w-4" />
                {seller.profile.businessName || seller.username}
              </div>
            </CardTitle>
            {seller.profile.state && (
              <div className="flex items-center gap-1 text-sm text-muted-foreground">
                <MapPin className="h-3 w-3" />
                <span>{seller.profile.state}</span>
              </div>
            )}
          </div>
        </div>
        {successfulAuctions > 0 && (
          <Badge variant="secondary" className="flex items-center gap-1 w-fit">
            <Award className="h-3 w-3" />
            {successfulAuctions} Successful {successfulAuctions === 1 ? 'Sale' : 'Sales'}
          </Badge>
        )}
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {seller.profile.breedSpecialty && (
            <p className="text-sm text-muted-foreground">
              Specializes in {seller.profile.breedSpecialty}
            </p>
          )}
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              {activeAuctions.length} Active {activeAuctions.length === 1 ? 'Auction' : 'Auctions'}
            </p>
            <Link href={`/seller/${seller.id}`}>
              <Button variant="ghost" size="sm" className="font-medium">
                View Profile
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}