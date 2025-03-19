// Previous imports remain unchanged
import { Switch, Route } from 'wouter'
import FAQPage from './pages/faq-page'
import NotFoundPage from './pages/not-found'
import SellerDashboard from './pages/seller-dashboard'
import ReviewOrderPage from './pages/review-order'; // Import the new component

export default function App() {
  return (
    <Switch>
      {/* Other routes remain unchanged */}
      <Route path="/seller-dashboard" component={SellerDashboard} />
      <Route path="/faq" component={FAQPage} />
      <Route path="/review-order" component={ReviewOrderPage} />
      {/* Route for /* should be last */}
      <Route component={NotFoundPage} />
    </Switch>
  )
}