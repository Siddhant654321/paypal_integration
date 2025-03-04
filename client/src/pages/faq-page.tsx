
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Card } from "@/components/ui/card";

export default function FAQPage() {
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
                    <p>Birds that maintain breed characteristics but may have minor imperfections. Perfect for backyard flocks.</p>
                  </div>
                  <div className="p-3 bg-primary/10 rounded-lg">
                    <h3 className="font-semibold">Mixed Breeds</h3>
                    <p>Cross-bred birds with a mix of characteristics from different breeds. Great for variety in your flock.</p>
                  </div>
                </div>
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
  );
}
