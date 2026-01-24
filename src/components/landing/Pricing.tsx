"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import { motion } from "framer-motion";
import { clsx } from "clsx";

const plans = [
  {
    name: "Standard",
    price: { monthly: 0, yearly: 0 },
    description: "For individuals exploring the power of AI.",
    features: ["Access to basic models", "Limited context window", "Standard support", "1 user"],
    cta: "Get Started",
    highlight: false,
  },
  {
    name: "Pro",
    price: { monthly: 19, yearly: 15 },
    description: "For professionals who need deep focus.",
    features: ["Access to all top-tier models", "Unlimited context window", "Priority support", "5 users", "Advanced privacy controls"],
    cta: "Upgrade to Pro",
    highlight: true,
  },
  {
    name: "Enterprise",
    price: { monthly: 49, yearly: 39 },
    description: "For teams requiring maximum security.",
    features: ["Custom model deployment", "SSO & Audit logs", "Dedicated success manager", "Unlimited users"],
    cta: "Contact Sales",
    highlight: false,
  },
];

export function Pricing() {
  const [isYearly, setIsYearly] = useState(false);

  return (
    <section id="pricing" className="py-24 px-6 relative bg-black">
       {/* Background Glow */}
       <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[600px] bg-blue-900/10 rounded-full blur-[120px] pointer-events-none" />

      <div className="max-w-6xl mx-auto relative z-10">
        <div className="text-center mb-16 space-y-6">
          <h2 className="text-4xl md:text-5xl font-host text-white">Pricing</h2>
          <p className="text-white/60 font-dm max-w-xl mx-auto">
            Simple, transparent pricing. No hidden fees. Cancel anytime.
          </p>

          {/* Toggle */}
          <div className="flex items-center justify-center gap-4 mt-8">
            <span className={clsx("text-sm transition-colors", !isYearly ? "text-white" : "text-white/40")}>Monthly</span>
            <button
              role="switch"
              aria-checked={isYearly}
              onClick={() => setIsYearly(!isYearly)}
              className="w-14 h-8 bg-white/10 rounded-full p-1 relative transition-colors hover:bg-white/20"
            >
              <motion.div
                animate={{ x: isYearly ? 24 : 0 }}
                transition={{ type: "spring", stiffness: 500, damping: 30 }}
                className="w-6 h-6 bg-white rounded-full shadow-lg"
              />
            </button>
            <span className={clsx("text-sm transition-colors", isYearly ? "text-white" : "text-white/40")}>
              Yearly <span className="text-xs text-blue-400 font-medium ml-1">(-20%)</span>
            </span>
          </div>
        </div>

        <div className="grid md:grid-cols-3 gap-8">
          {plans.map((plan, i) => (
            <motion.div
              key={plan.name}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.1 }}
              viewport={{ once: true }}
              className={clsx(
                "relative p-8 rounded-3xl border flex flex-col",
                plan.highlight
                  ? "bg-white/5 border-white/20 shadow-2xl shadow-blue-500/10"
                  : "bg-transparent border-white/10 hover:bg-white/5 transition-colors"
              )}
            >
              {plan.highlight && (
                <div className="absolute -top-4 left-1/2 -translate-x-1/2 px-4 py-1 bg-white text-black text-xs font-bold rounded-full">
                  Popular
                </div>
              )}

              <div className="mb-8">
                <h3 className="text-lg font-bold text-white mb-2">{plan.name}</h3>
                <div className="flex items-baseline gap-1">
                  <span className="text-4xl font-host text-white">
                    ${isYearly ? plan.price.yearly : plan.price.monthly}
                  </span>
                  <span className="text-white/40 text-sm">/mo</span>
                </div>
                <p className="text-white/40 text-sm mt-4">{plan.description}</p>
              </div>

              <ul className="space-y-4 mb-8 flex-1">
                {plan.features.map((feature, j) => (
                  <li key={j} className="flex items-start gap-3 text-sm text-white/80">
                    <Check className="w-4 h-4 text-white mt-0.5 shrink-0" />
                    {feature}
                  </li>
                ))}
              </ul>

              <button
                className={clsx(
                  "w-full py-3 rounded-full text-sm font-medium transition-transform active:scale-95",
                  plan.highlight
                    ? "bg-white text-black hover:bg-gray-100"
                    : "bg-white/10 text-white hover:bg-white/20"
                )}
              >
                {plan.cta}
              </button>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
