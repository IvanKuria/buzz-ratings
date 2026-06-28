import { defineConfig } from 'wxt';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  srcDir: 'src',
  vite: () => ({
    plugins: [tailwindcss()],
  }),
  manifest: {
    name: 'BuzzRatings',
    version: '1.0.0',
    description:
      'View professor ratings and grade distributions while browsing Georgia Tech courses on OSCAR class search.',
    permissions: ['storage', 'sidePanel'],
    action: {},
    host_permissions: [
      'https://registration.banner.gatech.edu/*',
      'https://www.ratemyprofessors.com/*',
      'https://c4citk6s9k.execute-api.us-east-1.amazonaws.com/*',
    ],
    web_accessible_resources: [
      {
        resources: ['icons/app/*.png', 'images/*'],
        matches: ['https://registration.banner.gatech.edu/*'],
      },
    ],
    icons: {
      '16': 'icons/app/icon-16.png',
      '48': 'icons/app/icon-48.png',
      '128': 'icons/app/icon-128.png',
    },
  },
});
