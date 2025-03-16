import React from 'react';
import { Link } from 'react-router-dom';

function NavBar() {
  return (
    <nav className="bg-lightNeutral p-4">
      <div className="container mx-auto flex justify-between items-center">
        <div className="flex items-center gap-2">
          <Link to="/" className="flex items-center">
            <img src="/logo.png" alt="Pips 'n Chicks Auctions" className="h-12 w-auto mr-2" />
            <span className="font-bold text-xl text-heading">Pips 'n Chicks</span>
          </Link>
        </div>
        <div className="flex items-center gap-4">
          <Link to="/auctions" className="text-primaryButton hover:text-hoverEffect">Browse Auctions</Link>
          <Link to="/sell" className="text-secondaryButton hover:text-hoverEffect">Sell Now</Link>
          <Link to="/profile" className="text-secondaryButton hover:text-hoverEffect">Profile</Link>
        </div>
      </div>
    </nav>
  );
}

export default NavBar;