import { User } from "@shared/schema";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@/components/ui/carousel";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Card, CardContent } from "@/components/ui/card";
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
                    <AvatarFallback>
                      {seller.username.slice(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <h3 className="font-semibold">{seller.username}</h3>
                    <p className="text-sm text-muted-foreground">
                      {seller.email}
                    </p>
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