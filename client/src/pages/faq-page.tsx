import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import { Card } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import { FC } from 'react'
import { Mail, Facebook, Instagram, Youtube, Globe } from "lucide-react"

const FAQPage: FC = () => {
  return (
    <div className="container mx-auto py-8 px-4">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-4xl font-bold text-center mb-8 bg-gradient-to-r from-primary to-[#1D3557] bg-clip-text text-transparent">
          Frequently Asked Questions
        </h1>

        <Card className="p-6 shadow-lg bg-gradient-to-br from-background/90 to-background border-2 border-[#43AA8B]/40">
          <Accordion type="single" collapsible className="space-y-4">
            <AccordionItem value="quality" className="border-2 border-[#FFBA08]/30 rounded-lg bg-background/50 hover:bg-background/80 transition-colors">
              <AccordionTrigger className="text-lg font-semibold px-4 text-[#1D3557]">
                What does "Quality" mean?
              </AccordionTrigger>
              <AccordionContent className="px-4 pb-4 space-y-2">
                <p className="mb-2">We categorize birds to help buyers and sellers find the best fit! Here's how we define them:</p>
                <div className="space-y-2">
                  <div className="p-3 bg-[#43AA8B]/10 rounded-lg border border-[#43AA8B]/20">
                    <h3 className="font-semibold text-[#1D3557]">Show Quality</h3>
                    <p>Birds bred to meet their breed standards, typically by active members of poultry clubs and organizations.</p>
                  </div>
                  <div className="p-3 bg-[#FFBA08]/10 rounded-lg border border-[#FFBA08]/20">
                    <h3 className="font-semibold text-[#1D3557]">Production & Purebred</h3>
                    <p>Birds that maintain breed characteristics but may have minor imperfections. Perfect for backyard flocks.</p>
                  </div>
                  <div className="p-3 bg-[#F77F00]/10 rounded-lg border border-[#F77F00]/20">
                    <h3 className="font-semibold text-[#1D3557]">Mixed Breeds</h3>
                    <p>Cross-bred birds with a mix of characteristics from different breeds. Great for variety in your flock.</p>
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="commission" className="border-2 rounded-lg bg-background/50 hover:bg-background/80 transition-colors">
              <AccordionTrigger className="text-lg font-semibold px-4">How does the auction site make money?</AccordionTrigger>
              <AccordionContent className="px-4 pb-4">
                We operate on a 10% commission from the final bid price. This helps cover platform costs, fund the annual Pips 'n Chicks Virtual Show, and promote the site on social media.
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="help" className="border-2 rounded-lg bg-background/50 hover:bg-background/80 transition-colors">
              <AccordionTrigger className="text-lg font-semibold px-4">I'm having issues. How can I get help?</AccordionTrigger>
              <AccordionContent className="px-4 pb-4">
                If you have any problems with an order, questions, or ideas for new features, email us at pipsnchicks@gmail.com. We're here to ensure the best experience for both buyers and sellers!
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="insurance" className="border-2 rounded-lg bg-background/50 hover:bg-background/80 transition-colors">
              <AccordionTrigger className="text-lg font-semibold px-4">What is the "insurance" system?</AccordionTrigger>
              <AccordionContent className="px-4 pb-4 space-y-2">
                <p>This is a new optional feature to protect buyers from shipping-related issues. If you purchase insurance and experience problems, we'll issue a full refund at no cost to you or the seller.</p>
                <p className="font-semibold mt-2">This covers:</p>
                <ul className="list-disc list-inside space-y-1 ml-4">
                  <li>Damaged or inviable eggs due to shipping mishaps</li>
                  <li>Shipping delays leading to lower hatch rates or sick birds</li>
                  <li>Live bird transport failures caused by postal issues</li>
                </ul>
                <p className="italic mt-2">Insurance is entirely optional but offers peace of mind for bidders.</p>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="shipping" className="border-2 border-[#43AA8B]/30 rounded-lg bg-background/50 hover:bg-background/80 transition-colors">
              <AccordionTrigger className="text-lg font-semibold px-4 text-[#1D3557]">
                Do auction prices include shipping?
              </AccordionTrigger>
              <AccordionContent className="px-4 pb-4">
                <p>Yes! Right now, all auction prices include shipping costs. While we are working on a dedicated live bird shipping system, it's still in development.</p>
                <p className="mt-2 text-[#1D3557]">If you need help setting your starting bid or reserve price, we offer an <span className="text-[#E63946] font-medium">AI tool</span> that calculates pricing based on market trends and your costs. Let us know if you'd like assistance!</p>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="payment" className="border-2 rounded-lg bg-background/50 hover:bg-background/80 transition-colors">
              <AccordionTrigger className="text-lg font-semibold px-4">How do payments work?</AccordionTrigger>
              <AccordionContent className="px-4 pb-4">
                <p>We use Stripe for secure payment processing. When you win an auction, you'll have 24 hours to complete your payment. We accept all major credit cards and digital wallets.</p>
                <p className="mt-2 text-muted-foreground">Sellers receive their payments within 2-3 business days after successful delivery confirmation.</p>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="auction-duration" className="border-2 rounded-lg bg-background/50 hover:bg-background/80 transition-colors">
              <AccordionTrigger className="text-lg font-semibold px-4">How long do auctions last?</AccordionTrigger>
              <AccordionContent className="px-4 pb-4">
                <p>Auction durations are set by sellers and typically run between 3-7 days. The exact end time is clearly displayed on each listing.</p>
                <p className="mt-2">We use automatic time extension: if a bid is placed in the last 5 minutes, the auction extends by 5 minutes to prevent sniping.</p>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="pricing" className="border-2 rounded-lg bg-background/50 hover:bg-background/80 transition-colors">
              <AccordionTrigger className="text-lg font-semibold px-4">How are prices determined?</AccordionTrigger>
              <AccordionContent className="px-4 pb-4">
                <p>Sellers set their starting prices and optional reserve prices. Our AI pricing tool can suggest optimal starting prices based on:</p>
                <ul className="list-disc list-inside space-y-1 ml-4 mt-2">
                  <li>Recent sales of similar birds</li>
                  <li>Seasonal market trends</li>
                  <li>Breed popularity and rarity</li>
                  <li>Quality category</li>
                </ul>
                <p className="mt-2 italic">Remember: The final price is determined by bidder interest and market demand!</p>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="bidding" className="border-2 rounded-lg bg-background/50 hover:bg-background/80 transition-colors">
              <AccordionTrigger className="text-lg font-semibold px-4">How does bidding work?</AccordionTrigger>
              <AccordionContent className="px-4 pb-4">
                <p>Bidding is straightforward:</p>
                <ul className="list-disc list-inside space-y-1 ml-4 mt-2">
                  <li>Enter your maximum bid amount</li>
                  <li>Our system will automatically bid up to your maximum</li>
                  <li>You'll receive notifications if you're outbid</li>
                  <li>Winner notification and payment instructions are sent automatically</li>
                </ul>
                <p className="mt-2 text-muted-foreground">Pro tip: Set up email notifications to stay updated on your bids!</p>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="seller-requirements" className="border-2 rounded-lg bg-background/50 hover:bg-background/80 transition-colors">
              <AccordionTrigger className="text-lg font-semibold px-4">What are the requirements for sellers?</AccordionTrigger>
              <AccordionContent className="px-4 pb-4">
                <p>To maintain quality standards, sellers must:</p>
                <ul className="list-disc list-inside space-y-1 ml-4 mt-2">
                  <li>Complete seller verification</li>
                  <li>Provide clear, recent photos of birds</li>
                  <li>Have appropriate shipping materials and experience</li>
                  <li>Maintain good feedback ratings</li>
                  <li>Follow our health and welfare guidelines</li>
                </ul>
                <p className="mt-2 italic">New sellers receive guidance and support throughout the process!</p>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </Card>

        {/* Terms and Conditions Section */}
        <div className="mt-16">
          <h2 className="text-3xl font-bold text-center mb-8 bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
            Terms and Conditions
          </h2>

          <Card className="p-6 shadow-lg bg-gradient-to-br from-background/80 to-background border-2">
            <div className="prose prose-sm max-w-none">
              <p className="text-lg mb-6">
                Everyone agrees to these terms and conditions by bidding, buying, consigning, or otherwise participating in any Pips 'n Chicks Auctions. Breaking any of these terms and conditions can result in a ban from the platform and voiding sales. All disputes between buyers and sellers on lots from Pips 'n Chicks Auctions will be mediated by Pips 'n Chicks, and Pips 'n Chicks' decisions will be final. Pips 'n Chicks also reserves the right to modify these terms and conditions at any time, and continued use of the platform constitutes acceptance of these changes.
              </p>

              <h3 className="text-xl font-semibold mt-8 mb-4">Eligibility</h3>
              <div className="bg-primary/5 p-4 rounded-lg mb-6">
                <p className="font-medium mb-2">Everyone must be over 18</p>
                <p>You must be at least 18 years old and legally able to enter a binding contract to participate in auctions as a buyer, bidder, or seller, or have a legal guardian acting on your behalf. By creating an account and bidding or consigning, you agree you are above the legal age limit.</p>
              </div>

              <h3 className="text-xl font-semibold mb-4">Auction Process</h3>
              <div className="bg-primary/5 p-4 rounded-lg mb-6">
                <ul className="space-y-4">
                  <li>Every bid must be a serious attempt to buy the lot.</li>
                  <li>All bids are binding and cannot be retracted. The highest bidder at the end of the auction is legally obligated to complete the purchase and considered the buyer.</li>
                  <li>All bids are made in standard USD, and must be made through the website by the direct buyer.</li>
                  <li>Bidders can sign up for notifications on any lot, which may be subject to technology delays due to no fault of Pips 'n Chicks or the consigner.</li>
                  <li>Sellers agree to ship or transport lots within 5 business days of auction close.</li>
                  <li>Auctions can be canceled prior to close for extenuating circumstances at the discretion of Pips 'n Chicks.</li>
                </ul>
              </div>

              <h3 className="text-xl font-semibold mb-4">Payments</h3>
              <div className="bg-primary/5 p-4 rounded-lg mb-6">
                <p className="font-medium mb-2">Everyone must pay and be paid timely. Fees are covered by the buyer.</p>
                <ul className="space-y-2">
                  <li>Buyers must make payment in full within 48 hours of winning the auction.</li>
                  <li>All bidding prices include shipping, handling, and packaging fees.</li>
                  <li>A 3.5% processing fee will be added to all credit and debit card charges.</li>
                  <li>Sellers receive 90% of the final bid price, paid upon auction end and tracking number submission.</li>
                </ul>
              </div>

              <h3 className="text-xl font-semibold mb-4">Shipping</h3>
              <div className="bg-primary/5 p-4 rounded-lg mb-6">
                <p className="font-medium mb-2">Pips 'n Chicks and the Sellers are not liable for post office damage or hatch rates.</p>
                <ul className="space-y-2">
                  <li>Sellers must package fertile eggs and birds according to industry standards and USPS guidelines.</li>
                  <li>All shipping is through USPS unless stated otherwise in the auction description.</li>
                  <li>Sellers must maintain NPIP status for interstate transport.</li>
                  <li>Lots become buyer property at auction close; buyer assumes all shipping risks.</li>
                  <li>No guarantees on shipping speed or hatch rates without insurance.</li>
                </ul>
              </div>

              <h3 className="text-xl font-semibold mb-4">Shipping Insurance</h3>
              <div className="bg-primary/5 p-4 rounded-lg mb-6">
                <p>Pips 'n Chicks offers optional shipping insurance for:</p>
                <ul className="list-disc list-inside space-y-2 mt-2">
                  <li>Severe shipping delays affecting viability</li>
                  <li>Lost or misrouted packages</li>
                  <li>Packages damaged by USPS handling</li>
                </ul>
                <p className="mt-4 italic">Insurance does not cover:</p>
                <ul className="list-disc list-inside space-y-2 mt-2">
                  <li>Low hatch rates not caused by shipping</li>
                  <li>Minor delays without viability impact</li>
                  <li>Issues unrelated to shipping</li>
                </ul>
              </div>
            </div>
          </Card>
        </div>

        {/* Contact Section */}
        <div className="mt-16 mb-8">
          <h2 className="text-3xl font-bold text-center mb-8 bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
            Contact Us
          </h2>

          <Card className="p-6 shadow-lg bg-gradient-to-br from-background/80 to-background border-2">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <a 
                href="mailto:pipsnchicks@gmail.com"
                className="flex items-center gap-2 p-4 rounded-lg hover:bg-primary/5 transition-colors"
              >
                <Mail className="h-5 w-5 text-primary" />
                <span>pipsnchicks@gmail.com</span>
              </a>

              <a 
                href="https://facebook.com/pipsnchicks"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 p-4 rounded-lg hover:bg-primary/5 transition-colors"
              >
                <Facebook className="h-5 w-5 text-primary" />
                <span>@pipsnchicks</span>
              </a>

              <a 
                href="https://instagram.com/pipsnchicks"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 p-4 rounded-lg hover:bg-primary/5 transition-colors"
              >
                <Instagram className="h-5 w-5 text-primary" />
                <span>@pipsnchicks</span>
              </a>

              <a 
                href="https://youtube.com/@pipsnchicks"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 p-4 rounded-lg hover:bg-primary/5 transition-colors"
              >
                <Youtube className="h-5 w-5 text-primary" />
                <span>@pipsnchicks</span>
              </a>

              <a 
                href="https://www.pipsnchicks.com"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 p-4 rounded-lg hover:bg-primary/5 transition-colors"
              >
                <Globe className="h-5 w-5 text-primary" />
                <span>www.pipsnchicks.com</span>
              </a>
            </div>
          </Card>
        </div>
      </div>
    </div>
  )
}

export default FAQPage