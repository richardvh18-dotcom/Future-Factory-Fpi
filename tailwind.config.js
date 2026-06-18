/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  theme: {
    extend: {
      keyframes: {
        'progress-indeterminate': {
          '0%':   { transform: 'translateX(-100%) scaleX(0.4)' },
          '50%':  { transform: 'translateX(50%)   scaleX(0.6)' },
          '100%': { transform: 'translateX(200%)  scaleX(0.4)' },
        },
      },
      animation: {
        'progress-indeterminate': 'progress-indeterminate 1.4s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};
