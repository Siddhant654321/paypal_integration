// Previous imports remain unchanged
import { Switch, Route } from 'wouter'
import FAQPage from './pages/faq-page'
import NotFoundPage from './pages/not-found'
import SellerDashboard from './pages/seller-dashboard'
import AuctionPage from './pages/auction-page'; //Import needed for the new route

export default function App() {
  return (
    <Switch>
      {/* Other routes remain unchanged */}
      <Route path="/seller-dashboard" component={SellerDashboard} />
      <Route path="/auction/:id/:title?" element={<AuctionPage />} />
      <Route path="/faq" component={FAQPage} />
      {/* Route for /* should be last */}
      <Route component={NotFoundPage} />
    </Switch>
  )
}