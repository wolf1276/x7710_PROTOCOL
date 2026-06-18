import { useState } from "react";
import { Menu, X, ChevronDown } from "lucide-react";
import navbarlogo from "../../assets/navbarlogo.png";

export default function Navbar() {
  const [isOpen, setIsOpen] = useState(false);
  const [mobileResourcesOpen, setMobileResourcesOpen] = useState(false);
  const [mobileProductsOpen, setMobileProductsOpen] = useState(false);

  // Storing icon string classes for Lucide icons or simple SVG maps
  const resources = [
    { name: "Documentation", href: "#", icon: "BookOpen" },
    { name: "Github", href: "#", icon: "Github" },
    { name: "Architecture", href: "#", icon: "Cpu" },
    { name: "Whitepaper", href: "#", icon: "FileText" }
  ];

  const products = [
    { name: "Web Interface", href: "#", icon: "Layout" },
    { name: "Telegram Agent", href: "#", icon: "MessageSquare" },
    { name: "Smart Wallet", href: "#", icon: "Wallet" },
    { name: "API Access", href: "#", icon: "Key" }
  ];

  // Helper to render static monochrome SVG icons to avoid runtime import problems
  const getIconSvg = (iconName) => {
    switch (iconName) {
      case "BookOpen":
        return (
          <svg className="w-4 h-4 text-zinc-400 group-hover:text-black" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
          </svg>
        );
      case "Github":
        return (
          <svg className="w-4 h-4 text-zinc-400 group-hover:text-black" fill="currentColor" viewBox="0 0 24 24">
            <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482C19.138 20.197 22 16.44 22 12.017 22 6.484 17.522 2 12 2z" />
          </svg>
        );
      case "Cpu":
        return (
          <svg className="w-4 h-4 text-zinc-400 group-hover:text-black" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <rect x="4" y="4" width="16" height="16" rx="2" />
            <path strokeLinecap="round" d="M9 9h6v6H9zm0-5v1M15-5v1M9 19v1M15 19v1M4 9h1M4 15h1M19 9h1M19 15h1" />
          </svg>
        );
      case "FileText":
        return (
          <svg className="w-4 h-4 text-zinc-400 group-hover:text-black" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
        );
      case "Layout":
        return (
          <svg className="w-4 h-4 text-zinc-400 group-hover:text-black" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 9h18M9 21V9" />
          </svg>
        );
      case "MessageSquare":
        return (
          <svg className="w-4 h-4 text-zinc-400 group-hover:text-black" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
        );
      case "Wallet":
        return (
          <svg className="w-4 h-4 text-zinc-400 group-hover:text-black" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
          </svg>
        );
      case "Key":
        return (
          <svg className="w-4 h-4 text-zinc-400 group-hover:text-black" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 7a2 2 0 012 2m-2-2a2 2 0 00-2 2m2-2V5a2 2 0 10-4 0v2M5 13a3 3 0 106 0v-2m-6 2h.01M11 11h.01M16 19h.01" />
          </svg>
        );
      default:
        return null;
    }
  };

  return (
    <nav className="fixed top-0 left-0 w-full z-50 bg-white/70 backdrop-blur-md border-b border-zinc-200 py-4 px-8 md:px-16 lg:px-24 transition-all duration-300">
      <div className="max-w-[1400px] mx-auto flex items-center justify-between">
        {/* Logo (left) */}
        <div className="flex items-center">
          <img
            src={navbarlogo}
            alt="X7710 Logo"
            className="h-10 md:h-12 w-auto mix-blend-multiply object-contain"
          />
        </div>

        {/* Dropdowns + CTA (all together on the right) */}
        <div className="hidden md:flex items-center gap-10">
          {/* Products Dropdown */}
          <div className="relative group py-2">
            <button className="flex items-center gap-1.5 text-sm font-medium text-zinc-600 hover:text-black transition-colors duration-200 cursor-pointer">
              Products
              <ChevronDown className="w-4 h-4 transition-transform duration-300 group-hover:rotate-180 text-zinc-400 group-hover:text-black" />
            </button>
            
            {/* Dropdown Menu */}
            <div className="absolute top-full right-0 mt-2 w-56 bg-white border border-zinc-200 rounded-2xl shadow-lg opacity-0 invisible translate-y-2 group-hover:opacity-100 group-hover:visible group-hover:translate-y-0 transition-all duration-300 ease-out py-2 z-50">
              {products.map((item) => (
                <a
                  key={item.name}
                  href={item.href}
                  className="flex items-center gap-3 px-5 py-2.5 text-sm text-zinc-600 hover:text-black hover:bg-zinc-50 first:rounded-t-xl last:rounded-b-xl transition-colors duration-150"
                >
                  {getIconSvg(item.icon)}
                  {item.name}
                </a>
              ))}
            </div>
          </div>

          {/* Resources Dropdown */}
          <div className="relative group py-2">
            <button className="flex items-center gap-1.5 text-sm font-medium text-zinc-600 hover:text-black transition-colors duration-200 cursor-pointer">
              Resources
              <ChevronDown className="w-4 h-4 transition-transform duration-300 group-hover:rotate-180 text-zinc-400 group-hover:text-black" />
            </button>
            
            {/* Dropdown Menu */}
            <div className="absolute top-full right-0 mt-2 w-56 bg-white border border-zinc-200 rounded-2xl shadow-lg opacity-0 invisible translate-y-2 group-hover:opacity-100 group-hover:visible group-hover:translate-y-0 transition-all duration-300 ease-out py-2 z-50">
              {resources.map((item) => (
                <a
                  key={item.name}
                  href={item.href}
                  className="flex items-center gap-3 px-5 py-2.5 text-sm text-zinc-600 hover:text-black hover:bg-zinc-50 first:rounded-t-xl last:rounded-b-xl transition-colors duration-150"
                >
                  {getIconSvg(item.icon)}
                  {item.name}
                </a>
              ))}
            </div>
          </div>

          {/* Early Access Button with Arrow */}
          <button className="group/btn flex items-center gap-2 px-6 py-2.5 bg-black text-white text-sm font-medium rounded-full shadow-sm hover:scale-105 active:scale-95 transition-all duration-300 cursor-pointer">
            Early Access
            <svg 
              className="w-4 h-4 text-white transition-transform duration-300 group-hover/btn:translate-x-1" 
              fill="none" 
              stroke="currentColor" 
              strokeWidth="2.5" 
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
            </svg>
          </button>
        </div>

        {/* Mobile Menu Button */}
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="md:hidden text-zinc-800 focus:outline-none cursor-pointer"
        >
          {isOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
      </div>

      {/* Mobile Menu Drawer */}
      <div
        className={`md:hidden overflow-hidden transition-all duration-300 ease-in-out ${
          isOpen ? "max-h-[500px] mt-4 opacity-100" : "max-h-0 opacity-0 pointer-events-none"
        }`}
      >
        <div className="flex flex-col gap-4 py-4 border-t border-zinc-150">
          
          <div>
            <button
              onClick={() => setMobileProductsOpen(!mobileProductsOpen)}
              className="flex items-center justify-between w-full text-left text-zinc-700 font-medium py-2"
            >
              Products
              <ChevronDown
                className={`w-4 h-4 text-zinc-400 transition-transform duration-300 ${
                  mobileProductsOpen ? "rotate-180 text-black" : ""
                }`}
              />
            </button>
            <div
              className={`overflow-hidden transition-all duration-200 pl-4 ${
                mobileProductsOpen ? "max-h-[200px] mt-2" : "max-h-0"
              }`}
            >
              {products.map((item) => (
                <a
                  key={item.name}
                  href={item.href}
                  className="flex items-center gap-3 py-2 text-sm text-zinc-500 hover:text-black"
                >
                  {getIconSvg(item.icon)}
                  {item.name}
                </a>
              ))}
            </div>
          </div>

          <div>
            <button
              onClick={() => setMobileResourcesOpen(!mobileResourcesOpen)}
              className="flex items-center justify-between w-full text-left text-zinc-700 font-medium py-2"
            >
              Resources
              <ChevronDown
                className={`w-4 h-4 text-zinc-400 transition-transform duration-300 ${
                  mobileResourcesOpen ? "rotate-180 text-black" : ""
                }`}
              />
            </button>
            <div
              className={`overflow-hidden transition-all duration-200 pl-4 ${
                mobileResourcesOpen ? "max-h-[200px] mt-2" : "max-h-0"
              }`}
            >
              {resources.map((item) => (
                <a
                  key={item.name}
                  href={item.href}
                  className="flex items-center gap-3 py-2 text-sm text-zinc-500 hover:text-black"
                >
                  {getIconSvg(item.icon)}
                  {item.name}
                </a>
              ))}
            </div>
          </div>

          {/* Mobile CTA Button */}
          <div className="pt-4 border-t border-zinc-150">
            <button className="w-full py-3 bg-black text-white text-sm font-medium rounded-full shadow-sm hover:scale-[1.02] active:scale-98 transition-all duration-200">
              Early Access
            </button>
          </div>
        </div>
      </div>
    </nav>
  );
}
