"use client";

import { motion } from "framer-motion";
import { Shield, Brain, Zap, Lock, Globe, Server } from "lucide-react";

// Primary Split Features
const primaryFeatures = [
  {
    title: "Intelligence, Isolated.",
    description: "Every request is encrypted on your device and only decrypted inside a secure Nitro Enclave. We never see your data, and neither does the model provider.",
    image: "bg-gradient-to-br from-blue-500/20 to-purple-500/20", 
  }
];

// Secondary Grid Features
const secondaryFeatures = [
  { icon: Lock, title: "Nitro Enclaves", desc: "Hardware-isolated execution environments for maximum security." },
  { icon: Shield, title: "E2E Encryption", desc: "Client-side encryption ensures zero-knowledge privacy." },
  { icon: Zap, title: "Multi-Provider", desc: "Seamlessly switch between Hugging Face, RunPod, and AWS Bedrock." },
  { icon: Brain, title: "Long-term Memory", desc: "Securely stored context that grows with your conversations." },
  { icon: Server, title: "Custom Models", desc: "Bring your own fine-tuned models with low-code integration." },
  { icon: Globe, title: "Plug & Play", desc: "Easy tool integration for connecting AI to your workflows." },
];

export function Features() {
  return (
    <section id="features" className="py-32 px-6 bg-black">
      <div className="max-w-6xl mx-auto space-y-32">
        
        {/* Split View Section */}
        <div className="grid md:grid-cols-2 gap-16 items-center">
          <motion.div 
            initial={{ opacity: 0, x: -50 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8 }}
            className="relative aspect-square rounded-3xl overflow-hidden border border-white/10 bg-white/5"
          >
             <div className="absolute inset-0 bg-noise opacity-20" />
             {/* Visual representation of Enclave */}
             <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-2/3 h-2/3 bg-gradient-to-tr from-blue-500/30 to-purple-500/10 blur-3xl rounded-full" />
                <div className="relative z-10 flex flex-col items-center gap-4">
                  <Lock className="w-16 h-16 text-white/40" />
                  <div className="text-white/20 font-host text-xl font-bold tracking-widest text-center">
                    NITRO<br/>ENCLAVE
                  </div>
                </div>
             </div>
          </motion.div>

          <div className="space-y-12">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="space-y-6"
            >
              <h2 className="text-4xl md:text-6xl font-host text-white leading-tight">
                Your data, <br />
                <span className="text-white/40">strictly yours.</span>
              </h2>
              <p className="text-lg text-white/60 font-dm leading-relaxed">
                By leveraging AWS Nitro Enclaves, isol8 ensures that no one—not even us—can access your sensitive data during inference.
              </p>
            </motion.div>

            <ul className="space-y-6">
              {[
                "Client-side encryption before transmission",
                "Decryption only within isolated enclave hardware",
                "Ephemeral processing with zero logging"
              ].map((item, i) => (
                <motion.li 
                  key={i}
                  initial={{ opacity: 0, x: 20 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.1 }}
                  className="flex items-center gap-4 text-white/80 font-dm border-b border-white/5 pb-4"
                >
                  <span className="flex items-center justify-center w-8 h-8 rounded-full bg-white/10 text-xs font-mono">0{i+1}</span>
                  <span>{item}</span>
                </motion.li>
              ))}
            </ul>
          </div>
        </div>

        {/* Secondary Grid Section */}
        <div className="grid md:grid-cols-3 gap-6">
          {secondaryFeatures.map((f, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.05 }}
              className="p-6 rounded-2xl bg-white/5 border border-white/5 hover:border-white/10 hover:bg-white/[0.07] transition-all group"
            >
              <f.icon className="w-6 h-6 text-white/60 mb-4 group-hover:text-white transition-colors" />
              <h3 className="text-lg font-bold text-white mb-2 font-host">{f.title}</h3>
              <p className="text-sm text-white/50 font-dm">{f.desc}</p>
            </motion.div>
          ))}
        </div>

      </div>
    </section>
  );
}
