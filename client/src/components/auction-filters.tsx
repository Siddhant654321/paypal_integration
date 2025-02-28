
import { useState, useEffect } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// Filter options
const speciesOptions = [
  { value: "crustacean", label: "Crustacean" },
  { value: "fish", label: "Fish" },
  { value: "coral", label: "Coral" },
  { value: "invertebrate", label: "Invertebrate" },
  { value: "plant", label: "Plant" },
];

const categoryOptions = [
  { value: "livestock", label: "Livestock" },
  { value: "equipment", label: "Equipment" },
  { value: "supply", label: "Supply" },
  { value: "decoration", label: "Decoration" },
];

const sortOptions = [
  { value: "endingSoon", label: "Ending Soon" },
  { value: "priceAsc", label: "Price: Low to High" },
  { value: "priceDesc", label: "Price: High to Low" },
  { value: "newest", label: "Newest" },
];

export default function AuctionFilters({ filters, onFilterChange }) {
  return (
    <div className="grid gap-4 md:grid-cols-4">
      <div className="w-full">
        <Label htmlFor="species" className="mb-2 block">Species</Label>
        <Select
          value={filters.species || "all"}
          onValueChange={(value) => onFilterChange({ ...filters, species: value === "all" ? "" : value })}
        >
          <SelectTrigger id="species">
            <SelectValue placeholder="All species" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Species</SelectItem>
            {speciesOptions.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="w-full">
        <Label htmlFor="category" className="mb-2 block">Category</Label>
        <Select
          value={filters.category || "all"}
          onValueChange={(value) => onFilterChange({ ...filters, category: value === "all" ? "" : value })}
        >
          <SelectTrigger id="category">
            <SelectValue placeholder="All categories" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {categoryOptions.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="w-full md:w-auto">
        <Label htmlFor="searchTerm" className="mb-2 block">Search</Label>
        <Input
          id="searchTerm"
          placeholder="Search auctions..."
          value={filters.searchTerm || ""}
          onChange={(e) => onFilterChange({ ...filters, searchTerm: e.target.value })}
        />
      </div>

      <div className="w-full md:w-auto">
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
  );
}
