import { useQuery } from "@tanstack/react-query";
import { useParams } from "wouter";
import { User, Profile, Auction } from "@shared/schema";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Store, MapPin, Award, User as UserIcon, Mail, Phone } from "lucide-react";
import AuctionCard from "@/components/auction-card";
import { Separator } from "@/components/ui/separator";

export default function SellerProfilePage() {
  const { id } = useParams<{ id: string }>();

  const { data: seller, isLoading } = useQuery<User & { profile: Profile, auctions: Auction[] }>({
    queryKey: [`/api/sellers/${id}`],
  });

  if (isLoading) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <div className="animate-spin text-primary">Loading...</div>
      </div>
    );
  }

  if (!seller) {
    return (
      <div className="container mx-auto py-8">
        <div className="text-center text-muted-foreground">Seller not found</div>
      </div>
    );
  }

  const activeAuctions = seller.auctions.filter(auction => 
    auction.status === "active" && auction.approved
  );

  const completedAuctions = seller.auctions.filter(auction => 
    auction.status === "ended" && auction.winningBidderId
  );

  return (
    <div className="container mx-auto py-8">
      <Card className="mb-8">
        <CardHeader>
          <div className="flex items-start gap-6">
            <Avatar className="h-24 w-24">
              <AvatarImage 
                src={seller.profile.profilePicture || ""} 
                alt={seller.profile.businessName || seller.username} 
              />
              <AvatarFallback>
                <UserIcon className="h-12 w-12" />
              </AvatarFallback>
            </Avatar>
            <div className="space-y-4">
              <div>
                <CardTitle className="text-2xl">
                  <div className="flex items-center gap-2">
                    <Store className="h-6 w-6" />
                    {seller.profile.businessName || seller.username}
                  </div>
                </CardTitle>
                {seller.profile.state && (
                  <div className="flex items-center gap-2 mt-2 text-muted-foreground">
                    <MapPin className="h-4 w-4" />
                    <span>{seller.profile.city}, {seller.profile.state}</span>
                  </div>
                )}
              </div>
              <div className="flex gap-3">
                {completedAuctions.length > 0 && (
                  <Badge variant="secondary" className="flex items-center gap-1">
                    <Award className="h-3 w-3" />
                    {completedAuctions.length} Successful {completedAuctions.length === 1 ? 'Sale' : 'Sales'}
                  </Badge>
                )}
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-6">
            {seller.profile.isPublicBio && seller.profile.bio && (
              <div className="space-y-2">
                <h3 className="font-medium">About</h3>
                <p className="text-muted-foreground">{seller.profile.bio}</p>
              </div>
            )}
            
            {seller.profile.breedSpecialty && (
              <div className="space-y-2">
                <h3 className="font-medium">Breed Specialty</h3>
                <p className="text-muted-foreground">{seller.profile.breedSpecialty}</p>
              </div>
            )}

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
    </div>
  );
}
