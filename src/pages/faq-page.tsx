import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import { Card } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import { FC } from 'react'

const FAQPage: FC = () => {
  return (
    <div className="container mx-auto py-8 px-4">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-4xl font-bold text-center mb-8 bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
          Frequently Asked Questions
        </h1>

        <Card className="p-6 shadow-lg bg-gradient-to-br from-background/80 to-background border-2">
          <Accordion type="single" collapsible className="space-y-4">
            <AccordionItem value="quality" className="border-2 rounded-lg bg-background/50 hover:bg-background/80 transition-colors">
              <AccordionTrigger className="text-lg font-semibold px-4">What does "Quality" mean?</AccordionTrigger>
              <AccordionContent className="px-4 pb-4 space-y-2">
                <p className="mb-2">We categorize birds to help buyers and sellers find the best fit! Here's how we define them:</p>
                <div className="space-y-2">
                  <div className="p-3 bg-primary/10 rounded-lg">
                    <h3 className="font-semibold">Show Quality</h3>
                    <p>Birds bred to meet their breed standards, typically by active members of poultry clubs and organizations.</p>
                  </div>
                  <div className="p-3 bg-primary/10 rounded-lg">
                    <h3 className="font-semibold">Production & Purebred</h3>
                    <p>Purebred birds not bred for show but for production purposes. This includes breeds like Bresse and Cream Legbars, as well as most hatchery stock.</p>
                  </div>
                  <div className="p-3 bg-primary/10 rounded-lg">
                    <h3 className="font-semibold">Fun & Mixed</h3>
                    <p>Birds bred for unique traits, such as friendly personalities or colorful eggs, including barnyard mixes.</p>
                  </div>
                </div>
                <p className="mt-4 italic">Regardless of category, we prioritize sellers who uphold high standards of animal health, welfare, and customer satisfaction. For more details, check out our YouTube page!</p>
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

            <AccordionItem value="shipping" className="border-2 rounded-lg bg-background/50 hover:bg-background/80 transition-colors">
              <AccordionTrigger className="text-lg font-semibold px-4">Do auction prices include shipping?</AccordionTrigger>
              <AccordionContent className="px-4 pb-4">
                <p>Yes! Right now, all auction prices include shipping costs. While we are working on a dedicated live bird shipping system, it's still in development.</p>
                <p className="mt-2">If you need help setting your starting bid or reserve price, we offer an AI tool that calculates pricing based on market trends and your costs. Let us know if you'd like assistance!</p>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </Card>
      </div>
    </div>
  )
}

export default FAQPage