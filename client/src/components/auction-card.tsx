import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { type Auction } from "@shared/schema";
import { formatDistanceToNow } from "date-fns";
import { Link } from "wouter";

type Props = {
  auction: Auction;
  showStatus?: boolean;
};

export default function AuctionCard({ auction, showStatus }: Props) {
  const isActive = new Date() >= new Date(auction.startDate) && new Date() <= new Date(auction.endDate);

  return (
    <Card className="overflow-hidden">
      <img
        src={auction.imageUrl || (auction.images && auction.images.length > 0 ? auction.images[0] : '/placeholder-image.jpg')}
        alt={auction.title}
        className="w-full h-48 object-cover"
        onError={(e) => {
          e.currentTarget.src = '/placeholder-image.jpg';
        }}
      />
      <CardContent className="p-4">
        <div className="flex gap-2 mb-2">
          <Badge>{auction.species}</Badge>
          <Badge variant="outline">{auction.category}</Badge>
          {showStatus && (
            <Badge variant={auction.approved ? "default" : "secondary"}>
              {auction.approved ? "Approved" : "Pending Approval"}
            </Badge>
          )}
        </div>
        <h3 className="text-lg font-semibold mb-2">{auction.title}</h3>
        <p className="text-sm text-muted-foreground line-clamp-2">
          {auction.description}
        </p>
      </CardContent>
      <CardFooter className="p-4 pt-0 flex justify-between items-center">
        <div>
          <div className="font-semibold">${auction.currentPrice}</div>
          <div className="text-sm text-muted-foreground">
            {isActive
              ? `Ends ${formatDistanceToNow(new Date(auction.endDate), {
                  addSuffix: true,
                })}`
              : "Auction ended"}
          </div>
        </div>
        <Link href={`/auction/${auction.id}`}>
          <Button variant="secondary">View Details</Button>
        </Link>
      </CardFooter>
    </Card>
  );
}