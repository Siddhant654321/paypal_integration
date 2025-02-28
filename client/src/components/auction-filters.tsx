import { useState } from "react";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search } from "lucide-react";

const species = ["", "Chicken", "Duck", "Goose", "Turkey", "Other"];
const categories = ["", "Eggs", "Chicks", "Adults", "Breeding Pairs", "Other"];
const sortOptions = [
  { value: "endingSoon", label: "Ending Soon" },
  { value: "priceAsc", label: "Price: Low to High" },
  { value: "priceDesc", label: "Price: High to Low" },
  { value: "newest", label: "Newest" },
];

interface AuctionFiltersProps {
  filters: {
    species: string;
    category: string;
    searchTerm?: string;
    sortBy?: string;
  };
  onFilterChange: (filters: {
    species: string;
    category: string;
    searchTerm?: string;
    sortBy?: string;
  }) => void;
}

export default function AuctionFilters({ filters, onFilterChange }: AuctionFiltersProps) {
  const [searchInput, setSearchInput] = useState(filters.searchTerm || "");

  const handleSearch = () => {
    onFilterChange({ ...filters, searchTerm: searchInput });
  };

  return (
    <div className="space-y-4 p-4 bg-muted rounded-lg">
      <div className="flex flex-col md:flex-row gap-4">
        <div className="w-full md:w-2/5 relative">
          <Label htmlFor="search" className="mb-2 block">Search</Label>
          <div className="flex">
            <Input
              id="search"
              placeholder="Search auctions..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              className="rounded-r-none"
            />
            <Button 
              onClick={handleSearch}
              className="rounded-l-none"
            >
              <Search className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="w-full md:w-1/5">
          <Label htmlFor="species" className="mb-2 block">Species</Label>
          <Select
            value={filters.species}
            onValueChange={(value) => onFilterChange({ ...filters, species: value })}
          >
            <SelectTrigger id="species">
              <SelectValue placeholder="All Species" />
            </SelectTrigger>
            <SelectContent>
              {species.map((s) => (
                <SelectItem key={s} value={s}>
                  {s || "All Species"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="w-full md:w-1/5">
          <Label htmlFor="category" className="mb-2 block">Category</Label>
          <Select
            value={filters.category}
            onValueChange={(value) => onFilterChange({ ...filters, category: value })}
          >
            <SelectTrigger id="category">
              <SelectValue placeholder="All Categories" />
            </SelectTrigger>
            <SelectContent>
              {categories.map((c) => (
                <SelectItem key={c} value={c}>
                  {c || "All Categories"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="w-full md:w-1/5">
          <Label htmlFor="sortBy" className="mb-2 block">Sort By</Label>
          <Select
            value={filters.sortBy || "default"}
            onValueChange={(value) => onFilterChange({ ...filters, sortBy: value })}
          >
            <SelectTrigger id="sortBy">
              <SelectValue placeholder="Sort by" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="default">Default</SelectItem>
              {sortOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );
}