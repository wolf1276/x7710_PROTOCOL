import { useState } from "react";
import { motion, useScroll, useMotionValueEvent } from "framer-motion";
import Navbar from "./sections/Navbar";
import Hero from "./sections/Hero";
import Protocol from "./sections/Protocol";
import Footer from "./sections/Footer";

export default function App() {
  const [percent, setPercent] = useState(0);
  const { scrollYProgress } = useScroll();

  useMotionValueEvent(scrollYProgress, "change", (latest) => {
    setPercent(Math.round(latest * 100));
  });

  return (
    <>
      {/* Right side page progressor */}
      <div className="fixed right-8 sm:right-10 top-1/2 -translate-y-1/2 hidden md:flex flex-col items-center gap-8 z-50 mix-blend-difference text-white font-mono">
        <div className="text-lg tracking-widest font-bold w-16 text-center">
          {String(percent).padStart(3, "0")}
        </div>
        <div className="w-[2px] h-48 bg-white/25 relative overflow-hidden">
          <motion.div
            className="absolute top-0 left-0 w-full bg-white origin-top"
            style={{ height: "100%", scaleY: scrollYProgress }}
          />
        </div>
        <div className="text-xs tracking-widest text-white/50 uppercase rotate-90 origin-center translate-y-4">
          Scroll
        </div>
      </div>

      <Navbar />
      <Hero />
      <Protocol />
      <Footer />
    </>
  );
}
