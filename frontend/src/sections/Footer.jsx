import footerImg from "../assets/footer.png";
import navbarlogo from "../assets/navbarlogo.png";

export default function Footer() {
  const linkGroups = [
    {
      title: "Product",
      links: [
        { name: "Web Interface", href: "#" },
        { name: "Telegram Agent", href: "#" },
        { name: "Smart Wallet", href: "#" },
        { name: "API Access", href: "#" },
      ],
    },
    {
      title: "Infrastructure",
      links: [
        { name: "Policy Engine", href: "#" },
        { name: "Execution Router", href: "#" },
        { name: "Account Registry", href: "#" },
      ],
    },
    {
      title: "Developers",
      links: [
        { name: "Documentation", href: "#" },
        { name: "SDK", href: "#" },
        { name: "API Reference", href: "#" },
      ],
    },
  ];

  return (
    <footer className="relative bg-white border-t border-zinc-100 pt-20 pb-40 md:pb-48 lg:pb-56 overflow-hidden">
      <style>{`
        @keyframes revealGraphic {
          0% {
            opacity: 0;
            transform: translateY(50px);
          }
          100% {
            opacity: 1;
            transform: translateY(0px);
          }
        }
        .animate-reveal-graphic {
          animation: revealGraphic 1.8s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
      `}</style>
      {/* Content container layered above the graphic */}
      <div className="relative z-10 max-w-[1600px] mx-auto px-8 md:px-12 -left-70 pb-22">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-16 lg:gap-24">
          {/* Left Side: Logo, Headline, Links */}
          <div className="lg:col-span-6 flex flex-col justify-start gap-10">
            <div>
              {/* Logo */}
              <div className="flex items-center mb-8">
                <img
                  src={navbarlogo}
                  alt="X7710 Logo"
                  className="h-26 w-auto object-contain grayscale mix-blend-multiply"
                />
              </div>

              {/* Headline */}
              <h2 className="text-5xl md:text-6xl lg:text-[76px] font-bold tracking-tight text-zinc-900 leading-[1.15] mb-12 max-w-2xl">
                Define the rules.
                <br />
                Move the capital.
              </h2>
            </div>

            {/* Links Columns */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-8 md:gap-12">
              {linkGroups.map((group) => (
                <div key={group.title} className="flex flex-col gap-4">
                  <span className="text-xs font-mono font-bold tracking-[0.2em] text-zinc-400 uppercase">
                    {group.title}
                  </span>
                  <ul className="flex flex-col gap-3">
                    {group.links.map((link) => (
                      <li key={link.name}>
                        <a
                          href={link.href}
                          className="text-base font-medium text-zinc-600 hover:text-black transition-colors duration-200"
                        >
                          {link.name}
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}

              {/* Social Column */}
              <div className="flex flex-col gap-4">
                <span className="text-xs font-mono font-bold tracking-[0.2em] text-zinc-400 uppercase">
                  Social
                </span>
                <div>
                  <a
                    href="#"
                    aria-label="X (formerly Twitter)"
                    className="inline-block text-zinc-600 hover:text-black transition-colors duration-200"
                  >
                    <svg
                      className="w-5 h-5"
                      fill="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                    </svg>
                  </a>
                </div>
              </div>
            </div>
          </div>

          {/* Right Side: Waitlist Separator & Form */}
          <div className="lg:col-span-6 border-t lg:border-t-0 lg:border-l border-zinc-200 pt-16 lg:pt-0 lg:pl-16 flex flex-col justify-start">
            <span className="text-xs font-mono font-bold tracking-[0.2em] text-zinc-400 uppercase mb-6 block">
              Waitlist
            </span>

            <h3 className="text-4xl md:text-5xl font-bold tracking-tight text-zinc-900 leading-[1.2] mb-6 max-w-md">
              Be first to build
              <br />
              agent-controlled capital
            </h3>

            <p className="text-base md:text-lg text-zinc-500 font-light leading-relaxed mb-8 max-w-md">
              Get early access to X7710 and help shape the future of
              programmable finance.
            </p>

            <form
              onSubmit={(e) => e.preventDefault()}
              className="relative flex items-center justify-between border-b border-zinc-300 pb-2 max-w-lg group"
            >
              <input
                type="email"
                placeholder="you@domain.com"
                className="w-full bg-transparent text-zinc-900 placeholder-zinc-400 text-base md:text-lg font-light outline-none py-2 pr-10"
              />
              <button
                type="submit"
                aria-label="Submit Waitlist Email"
                className="absolute right-0 bottom-2.5 p-1 text-zinc-900 hover:text-black transition-colors duration-200 cursor-pointer"
              >
                <svg
                  className="w-5 h-5 transform transition-transform duration-300 group-hover:translate-x-0.5 group-hover:translate-y-0.5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M4.5 4.5l15 15m0 0H9.5m10 0v-10"
                  />
                </svg>
              </button>
            </form>
          </div>
        </div>
      </div>

      {/* Background Graphic: Oversized, cropped, layered underneath */}
      <div className="absolute bottom-20 left-380 -translate-x-1/2 w-[1800px] md:w-[2000px] lg:w-[2200px] pointer-events-none z-0 translate-y-[47%]">
        <img
          src={footerImg}
          alt="X7710 Graphic"
          className="w-full h-auto object-contain  m  animate-reveal-graphic"
        />
      </div>
    </footer>
  );
}
