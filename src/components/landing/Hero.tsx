"use client";

import Link from "next/link";
import Image from "next/image";
import { motion, useScroll, useTransform } from "framer-motion";
import { useRef } from "react";

export function Hero() {
  const containerRef = useRef(null);
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start start", "end start"],
  });

  const y = useTransform(scrollYProgress, [0, 1], ["0%", "50%"]);
  const opacity = useTransform(scrollYProgress, [0, 0.5], [1, 0]);

  return (
    <section ref={containerRef} className="relative flex flex-col items-center justify-center min-h-screen px-4 py-32 overflow-hidden bg-black">
      {/* Background Mountain - Parallax Layer */}
      <motion.div 
        style={{ y, opacity }}
        className="absolute inset-x-0 bottom-0 top-0 z-0 select-none pointer-events-none"
      >
        <Image
           src="/hero-mountain.png"
           alt="Atmospheric Mountain"
           fill
           priority
           className="object-cover object-center opacity-60 mix-blend-screen mask-gradient"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-transparent" />
      </motion.div>

      {/* Content - Foreground Layer */}
      <div className="relative z-10 max-w-4xl mx-auto text-center space-y-8 mt-[-10vh]">
        <motion.h1 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }} // Apple-like ease
          className="text-5xl md:text-8xl font-normal leading-[0.95] tracking-tighter text-white font-host mix-blend-overlay"
        >
          Intelligence, <br />
          <span className="text-white/50">Isolated.</span>
        </motion.h1>
        
        <motion.p 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
          className="max-w-xl mx-auto text-lg text-white/60 font-dm leading-relaxed"
        >
          End-to-end encrypted AI inference running in secure Nitro Enclaves. Your data is decrypted only inside the hardware-isolated environment.
        </motion.p>

        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1, delay: 0.4, ease: [0.16, 1, 0.3, 1] }}
          className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4"
        >
          <Link
            href="/chat"
            className="px-8 py-3 text-base font-medium text-black bg-white rounded-full hover:scale-105 transition-transform duration-300 shadow-xl shadow-white/10"
          >
            Start Encrypted Session
          </Link>
          <Link
            href="#features"
            className="px-8 py-3 text-base font-medium text-white border border-white/20 rounded-full hover:bg-white/5 transition-colors backdrop-blur-sm"
          >
            Explore Features
          </Link>
        </motion.div>
      </div>
    </section>
  );
}
