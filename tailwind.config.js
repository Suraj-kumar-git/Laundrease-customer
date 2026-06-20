/** @type {import('tailwindcss').Config} */
module.exports = {
  // Tailwind v4
  darkMode: ["class"],
  theme: {
    extend: {
      // Keep your radius mapping to the CSS variable
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      // Retain your custom keyframes/animations if you use them via classes
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        "slide-in-right": {
          "0%": { transform: "translateX(100%)", opacity: "0" },
          "100%": { transform: "translateX(0)", opacity: "1" },
        },
        "slide-out-left": {
          "0%": { transform: "translateX(0)", opacity: "1" },
          "100%": { transform: "translateX(-100%)", opacity: "0" },
        },
        "fade-in": {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        "fade-out": {
          "0%": { opacity: "1" },
          "100%": { opacity: "0" },
        },
        "bounce-subtle": {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-5px)" },
        },
        "pulse-subtle": {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.7" },
        },
        "spin-slow": {
          "0%": { transform: "rotate(0deg)" },
          "100%": { transform: "rotate(360deg)" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "slide-in-right": "slide-in-right 0.3s ease-out",
        "slide-out-left": "slide-out-left 0.3s ease-out",
        "fade-in": "fade-in 0.3s ease-out",
        "fade-out": "fade-out 0.3s ease-out",
        "bounce-subtle": "bounce-subtle 2s infinite",
        "pulse-subtle": "pulse-subtle 2s infinite",
        "spin-slow": "spin-slow 3s linear infinite",
      },
      transitionProperty: {
        height: "height",
        spacing: "margin, padding",
      },
      boxShadow: {
        glow: "0 0 15px 2px rgba(139, 92, 246, 0.3)",
        "glow-strong": "0 0 20px 5px rgba(139, 92, 246, 0.5)",
        "inner-glow": "inset 0 0 15px 2px rgba(139, 92, 246, 0.2)",
      },
      backgroundImage: {
        "gradient-radial": "radial-gradient(var(--tw-gradient-stops))",
        "gradient-conic": "conic-gradient(from 180deg at 50% 50%, var(--tw-gradient-stops))",
        "gradient-mesh":
          "linear-gradient(to right bottom, #8b5cf6, #6366f1, #3b82f6, #0ea5e9, #06b6d4)",
      },
    },
  },
  // In Tailwind v4:
  // - Do not define `content` here.
  // - Do not add the animate plugin here; it's loaded via `@plugin "tailwindcss-animate";` in CSS.
};