import { Link } from 'wouter'

export function NavBar() {
  return (
    <nav className="border-b">
      <div className="container flex items-center justify-between py-4">
        <div className="flex items-center gap-4">
          <Link href="/faq" className="text-sm font-medium hover:text-primary transition-colors">
            FAQ
          </Link>
        </div>
      </div>
    </nav>
  )
}