/**
 * Where the owner can be. A stack, not URLs: she is in exactly one place at a
 * time and every destination is one tap from the drawer, so a restorable
 * address would be a concept without a use here.
 */
import { screens } from './model/screens';

export type Route =
  | { kind: 'home' }
  | { kind: 'screen'; id: string }
  /** One entry of a collection, by file name. */
  | { kind: 'entry'; id: string; file: string }
  /** A new entry in a collection. */
  | { kind: 'new'; id: string }
  | { kind: 'history' }
  | { kind: 'pending' }
  | { kind: 'preview' };

export function routeTitle(route: Route): string {
  switch (route.kind) {
    case 'home':
      return 'עריכת האתר';
    case 'history':
      return 'היסטוריה ושחזור';
    case 'pending':
      return 'שינויים שטרם פורסמו';
    case 'preview':
      return 'צפייה לפני פרסום';
    case 'new':
      return screens.find((s) => s.id === route.id)?.title ?? 'חדש';
    case 'screen':
    case 'entry':
      return screens.find((s) => s.id === route.id)?.title ?? 'עריכה';
  }
}

export const sameRoute = (a: Route, b: Route): boolean =>
  JSON.stringify(a) === JSON.stringify(b);

/* -------------------------------- navigation -------------------------------- */

/**
 * Back means "out of here", not "undo my last tap".
 *
 * Choosing a destination from the drawer **resets** the stack, because jumping
 * from one part of the site to an unrelated one does not build a trail the
 * owner would want to retrace: after editing the home page and jumping to
 * recommendations, Back should leave, not return to the home page.
 *
 * Drilling *within* something - a post inside its list, a preview of the screen
 * being edited - pushes, so Back steps out one level at a time.
 */
export type Stack = Route[];

export const HOME: Route = { kind: 'home' };

export const initialStack = (): Stack => [HOME];

/** Going deeper inside the current flow. */
export const push = (stack: Stack, route: Route): Stack => [...stack, route];

/** Going somewhere unrelated: the trail so far stops being useful. */
export const jump = (route: Route): Stack =>
  route.kind === 'home' ? [HOME] : [HOME, route];

export const back = (stack: Stack): Stack =>
  stack.length > 1 ? stack.slice(0, -1) : stack;

/** Swap the current screen without deepening - a wizard becoming its result. */
export const replaceTop = (stack: Stack, route: Route): Stack => [
  ...stack.slice(0, -1),
  route,
];

export const current = (stack: Stack): Route => stack[stack.length - 1];

export const canGoBack = (stack: Stack): boolean => stack.length > 1;
