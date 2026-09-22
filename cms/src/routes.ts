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
