import React from 'react';

const Footer = () => {
  return (
    <footer className="bg-base-200 border-t border-base-300 py-6 mt-16">
      <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row justify-between items-center text-sm text-base-content/70">
        <p className="mb-2 md:mb-0">
          &copy; {new Date().getFullYear()}. All rights reserved.
        </p>
        <div className="flex items-center space-x-2">
          <span className="text-base-content/60">Powered by</span>
          <a href="https://aditya-gupta.com.np" target="_blank" rel="noopener noreferrer">
            <img src="/Aadii.png" alt="Powered by Logo" className="h-12 w-auto" />
          </a>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
