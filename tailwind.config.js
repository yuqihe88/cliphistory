/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/renderer/**/*.{html,tsx,ts,jsx,js}',
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          50:  '#E3F2FD',
          100: '#BBDEFB',
          200: '#90CAF9',
          300: '#64B5F6',
          400: '#42A5F5',
          500: '#2196F3',
          600: '#1E88E5',
          700: '#1976D2',
        },
        neutral: {
          50:  '#FAFAFA',
          100: '#F5F5F5',
          200: '#EEEEEE',
          400: '#BDBDBD',
          600: '#757575',
          800: '#424242',
          900: '#212121',
        },
        danger: '#EF5350',
      },
      fontFamily: {
        sans: ['-apple-system', '"Microsoft YaHei"', 'sans-serif'],
      },
      fontSize: {
        'title': ['18px', { fontWeight: '600', lineHeight: '24px' }],
        'body': ['14px', { fontWeight: '400', lineHeight: '20px' }],
        'caption': ['12px', { fontWeight: '400', lineHeight: '16px' }],
        'button': ['13px', { fontWeight: '500', lineHeight: '18px' }],
      },
    },
  },
  plugins: [],
};
