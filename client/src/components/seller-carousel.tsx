import { User } from "@shared/schema";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@/components/ui/carousel";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Link } from "wouter";

interface SellerCarouselProps {
  sellers: User[];
}

export default function SellerCarousel({ sellers }: SellerCarouselProps) {
  if (!sellers.length) return null;

  return (
    <Carousel
      opts={{
        align: "start",
        loop: true,
      }}
      className="w-full"
    >
      <CarouselContent>
        {sellers.map((seller) => (
          <CarouselItem key={seller.id} className="md:basis-1/2 lg:basis-1/3">
            <Link href={`/seller/${seller.id}`}>
              <Card className="cursor-pointer hover:bg-accent/50 transition-colors">
                <CardContent className="flex items-center gap-4 p-6">
                  <Avatar className="h-12 w-12">
                    <AvatarImage
                      src={seller.profilePicture || undefined}
                      alt={seller.username}
                    />
                    <AvatarFallback>
                      {seller.username.slice(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <h3 className="font-semibold">{seller.username}</h3>
                    {seller.businessName && (
                      <p className="text-sm text-muted-foreground">
                        {seller.businessName}
                      </p>
                    )}
                    {seller.breedSpecialty && (
                      <Badge variant="secondary" className="mt-1">
                        {seller.breedSpecialty}
                      </Badge>
                    )}
                  </div>
                </CardContent>
              </Card>
            </Link>
          </CarouselItem>
        ))}
      </CarouselContent>
      <CarouselPrevious />
      <CarouselNext />
    </Carousel>
  );
}
