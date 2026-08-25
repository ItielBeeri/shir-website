/// <reference path="../.astro/types.d.ts" />

interface Window {
  __lenis?: {
    stop: () => void;
    start: () => void;
    scrollTo: (target: any, options?: any) => void;
    [key: string]: any;
  };
}
