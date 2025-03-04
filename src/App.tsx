// Previous imports remain unchanged
import { Switch, Route } from 'wouter'
import FAQPage from './pages/faq-page'
import NotFoundPage from './pages/not-found'

export default function App() {
  return (
    <Switch>
      {/* Other routes remain unchanged */}
      <Route path="/faq" component={FAQPage} />
      {/* Route for /* should be last */}
      <Route component={NotFoundPage} />
    </Switch>
  )
}