{bid.isWinningBid && (
                    <Badge className="ml-2">
                      {bid.auction.paymentStatus === "completed"
                        ? "Paid"
                        : "Winner"}
                    </Badge>
                  )}

                  {bid.requiresPayment && (
                    <Link href={`/auction/${bid.auction.id}/pay`}>
                      <Button size="sm" className="ml-2" variant="default">
                        <CreditCard className="mr-2 h-4 w-4" />
                        Pay Now
                      </Button>
                    </Link>
                  )}