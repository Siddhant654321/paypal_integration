// Previous imports remain unchanged
import FAQPage from './pages/faq-page'

export default function App() {
  // Previous code remains unchanged until the Switch component
  <Switch>
    {/* Other routes remain unchanged */}
    <Route path="/faq">
      <FAQPage />
    </Route>
    {/* Route for /* should be last */}
    <Route>
      <NotFoundPage />
    </Route>
  </Switch>
  // Rest of the code remains unchanged
}
