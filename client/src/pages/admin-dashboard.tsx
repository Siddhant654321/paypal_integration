// ... other imports ...

function ViewBidsDialog({ isOpen, onClose, auctionId, isLoading, bids }) {
  // ... other code ...

  return (
    <Dialog open={isOpen} onClose={onClose}>
      <DialogHeader>
        <DialogTitle>Manage bids for this auction</DialogTitle>
        <DialogDescription>
          Manage bids for this auction
        </DialogDescription>
      </DialogHeader>

      {isLoading ? (
        <div className="flex justify-center py-8">
          <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full"></div>
        </div>
      ) : bids && bids.length > 0 ? (
        <div className="space-y-3 max-h-[60vh] overflow-y-auto">
          {bids.map((bid) => (
            <div key={bid.id} className="flex items-center justify-between p-3 bg-muted rounded-lg">
              <div className="space-y-1">
                <div className="font-medium">${(bid.amount / 100).toFixed(2)}</div>
                <div className="text-sm text-muted-foreground">
                  {new Date(bid.timestamp).toLocaleString()}
                </div>
                <div className="text-sm font-medium">
                  Bidder: {bid.bidder?.username || "Unknown"}
                  {bid.bidder?.fullName && <span> ({bid.bidder.fullName})</span>}
                </div>
                {bid.bidder?.email && (
                  <div className="text-xs text-muted-foreground">
                    {bid.bidder.email}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="flex justify-center p-4">
          <p>No bids yet.</p> {/* Added for better UX */}
        </div>
      )}
    </Dialog>
  );
}

export default ViewBidsDialog;

// ... rest of the file ...