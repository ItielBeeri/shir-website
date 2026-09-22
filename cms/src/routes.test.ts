/**
 * Back is the only navigation the owner has to reason about, so the rule it
 * follows is pinned here rather than left implicit in the shell.
 */
import { describe, expect, it } from 'vitest';
import { back, canGoBack, current, initialStack, jump, push, replaceTop } from './routes';
import type { Stack } from './routes';

const screen = (id: string) => ({ kind: 'screen', id }) as const;

describe('navigation', () => {
  it('starts at home with nowhere to go back to', () => {
    const stack = initialStack();
    expect(current(stack)).toEqual({ kind: 'home' });
    expect(canGoBack(stack)).toBe(false);
  });

  it('a landing card, then Back, returns home', () => {
    const stack = push(initialStack(), screen('home'));
    expect(canGoBack(stack)).toBe(true);
    expect(current(back(stack))).toEqual({ kind: 'home' });
  });

  it('a drawer jump from another screen goes home on Back, not to that screen', () => {
    // home → דף הבית → (drawer) → המלצות
    let stack: Stack = push(initialStack(), screen('home'));
    stack = jump(screen('recommendations'));
    expect(current(stack)).toEqual(screen('recommendations'));
    expect(current(back(stack))).toEqual({ kind: 'home' });
  });

  it('repeated drawer jumps never deepen the stack', () => {
    let stack = initialStack();
    for (const id of ['home', 'images', 'recommendations', 'nav', 'site']) {
      stack = jump(screen(id));
    }
    expect(stack.length).toBe(2);
    expect(current(back(stack))).toEqual({ kind: 'home' });
  });

  it('a post inside its list steps back to the list, then home', () => {
    let stack = push(initialStack(), screen('blog'));
    stack = push(stack, { kind: 'entry', id: 'blog', file: 'a.mdx' });

    stack = back(stack);
    expect(current(stack)).toEqual(screen('blog'));
    stack = back(stack);
    expect(current(stack)).toEqual({ kind: 'home' });
  });

  it('preview returns to the screen it was opened from', () => {
    let stack = push(initialStack(), screen('home'));
    stack = push(stack, { kind: 'preview' });
    expect(current(back(stack))).toEqual(screen('home'));
  });

  it('the new-post wizard becomes the post without leaving a step behind', () => {
    let stack = push(initialStack(), { kind: 'new', id: 'blog-new' });
    stack = replaceTop(stack, { kind: 'entry', id: 'blog', file: 'new.mdx' });

    expect(stack.length).toBe(2);
    expect(current(back(stack))).toEqual({ kind: 'home' });
  });

  it('jumping home from the drawer collapses to home alone', () => {
    expect(jump({ kind: 'home' })).toEqual([{ kind: 'home' }]);
  });

  it('Back at home is a no-op rather than an error', () => {
    const stack = initialStack();
    expect(back(stack)).toEqual(stack);
  });
});
