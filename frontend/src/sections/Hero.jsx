import { useState, useEffect, useRef } from "react";
import hero from "../assets/hero.png";

const WORDS = ["GUARDRAILS.", "POLICIES.", "PERMISSIONS.", "LIMITS.", "CONTROL."];
const CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

export default function Hero() {
  const [index, setIndex] = useState(0);
  const [displayText, setDisplayText] = useState(WORDS[0]);
  const isFirstRender = useRef(true);

  // Rotate words every 3.5 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      setIndex((prevIndex) => (prevIndex + 1) % WORDS.length);
    }, 3500);
    return () => clearInterval(interval);
  }, []);

  // Scramble animation logic
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }

    const targetWord = WORDS[index];
    let iteration = 0;
    const maxIterations = targetWord.length;
    let intervalId;

    intervalId = setInterval(() => {
      setDisplayText(() => {
        return targetWord
          .split("")
          .map((char, charIdx) => {
            if (charIdx < iteration) {
              return targetWord[charIdx];
            }
            if (char === " " || char === ".") {
              return char;
            }
            return CHARS[Math.floor(Math.random() * CHARS.length)];
          })
          .join("");
      });

      iteration += 1 / 5;

      if (iteration >= maxIterations) {
        clearInterval(intervalId);
        setDisplayText(targetWord);
      }
    }, 40);

    return () => clearInterval(intervalId);
  }, [index]);

  return (
    <section className="relative min-h-screen bg-white text-zinc-900 flex items-center justify-center overflow-hidden py-20 lg:py-0 px-8 md:px-16 lg:px-24">
      <div className="max-w-[1400px] w-full mx-auto grid grid-cols-1 lg:grid-cols-5 gap-16 lg:gap-24 items-center">
        {/* Left Side: Large Monochrome AI Face Artwork (2 columns) */}
        <div className="lg:col-span-2 flex justify-center items-center h-[65vh] lg:h-[85vh] relative">
          <div className="w-full h-full relative overflow-visible flex items-center justify-center">
            <img
              src={hero}
              className="object-cover w-full h-full grayscale contrast-[1.15] brightness-[0.95]"
              alt="Stellar Garage AI Artwork"
              style={{ objectPosition: "center 30%" }}
            />
          </div>
        </div>

        {/* Right Side: Headline + Description + CTA (3 columns) */}
        <div className="lg:col-span-3 flex flex-col justify-center space-y-10 z-10 lg:pl-6">
          <div className="space-y-6">
            <span className="text-xs lg:text-sm font-mono tracking-[0.35em] text-zinc-400 uppercase block">
              Your agents need
            </span>
            <h1 className="text-6xl md:text-8xl lg:text-[100px] font-black tracking-[-0.05em] leading-[0.95] text-black uppercase relative min-h-[1.2em] w-full">
              <span className="absolute left-0 top-0 w-full block whitespace-nowrap">
                {displayText}
              </span>
            </h1>
          </div>

          <p className="max-w-xl text-lg lg:text-xl text-zinc-500 font-light leading-relaxed">
            Set the rules once. Let autonomous agents execute safely without giving up control of capital.
          </p>

          <div className="flex flex-col sm:flex-row gap-5 pt-4">
            <button className="px-10 py-5 bg-black text-white font-medium tracking-wide text-center cursor-pointer transition-colors duration-200 hover:bg-zinc-900">
              Read Docs
            </button>
            <button className="px-10 py-5 bg-transparent border border-zinc-200 text-zinc-800 font-medium tracking-wide text-center cursor-pointer transition-colors duration-200 hover:bg-zinc-50">
              View Specs
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
