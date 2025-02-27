import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";

type Filters = {
  species: string;
  category: string;
};

type Props = {
  filters: Filters;
  onFilterChange: (filters: Filters) => void;
};

export default function AuctionFilters({ filters, onFilterChange }: Props) {
  const species = ["Chicken", "Duck", "Turkey", "Quail", "Other"];
  const categories = [
    { value: "quality", label: "Show Quality/Purebred" },
    { value: "production", label: "Production/Mixed" },
    { value: "fun", label: "Fun/Hobby" },
  ];

  return (
    <Card className="bg-white/50 backdrop-blur-sm">
      <CardContent className="p-6">
        <div className="grid sm:grid-cols-2 gap-6">
          <div className="space-y-2">
            <Label htmlFor="species">Species</Label>
            <Select
              value={filters.species}
              onValueChange={(value) =>
                onFilterChange({ ...filters, species: value })
              }
            >
              <SelectTrigger id="species">
                <SelectValue placeholder="All Species" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">All Species</SelectItem>
                {species.map((s) => (
                  <SelectItem key={s} value={s.toLowerCase()}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="category">Category</Label>
            <Select
              value={filters.category}
              onValueChange={(value) =>
                onFilterChange({ ...filters, category: value })
              }
            >
              <SelectTrigger id="category">
                <SelectValue placeholder="All Categories" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">All Categories</SelectItem>
                {categories.map((c) => (
                  <SelectItem key={c.value} value={c.value}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
