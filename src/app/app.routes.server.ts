import { RenderMode, ServerRoute } from '@angular/ssr';

export const serverRoutes: ServerRoute[] = [
  {
    path: 'category/:slug',
    renderMode: RenderMode.Server,
  },
  {
    path: 'business/:slug',
    renderMode: RenderMode.Server,
  },
  {
    path: 'book/:slug',
    renderMode: RenderMode.Server,
  },
  {
    path: '**',
    renderMode: RenderMode.Server,
  },
];
