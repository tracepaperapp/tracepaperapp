module.exports = {
  content: ['../../**/*.html'], // Controleert alle HTML-bestanden in je project
  theme: {
    extend: {
      colors: {
        teal: {
          light: '#20B2AA',
          DEFAULT: '#008080',
          dark: '#005F5F',
          content: '#E0F2F1', // Toegevoegde lichte teal voor inhoud
        },
        accent: {
          yellow: '#FFC107',
          orange: '#FF5722',
        },
        gray: {
          light: '#F3F4F6',
          DEFAULT: '#9CA3AF',
          dark: '#374151',
        },
      },
    },
  },
  plugins: [require('daisyui')],
  daisyui: {
    themes: [
      {
        draftsman: {
          primary: '#008080',
          'primary-focus': '#005F5F',
          'primary-content': '#E0F2F1', // Lichte teal kleur voor content
          secondary: '#20B2AA',
          'secondary-focus': '#007373',
          'secondary-content': '#FFFFFF',
          accent: '#FFC107',
          'accent-focus': '#FF5722',
          'accent-content': '#000000',
          neutral: '#374151',
          'neutral-focus': '#111827',
          'neutral-content': '#FFFFFF',
          'base-100': '#F3F4F6',
          'base-content': '#1F2937',
          info: '#3ABFF8',
          success: '#36D399',
          warning: '#FBBD23',
          error: '#F87272',
        },
      },
    ],
  },
};