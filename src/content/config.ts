import { defineCollection, z } from 'astro:content';

const therapies = defineCollection({
  type: 'content',
  schema: z.object({
    title:             z.string(),
    kicker:            z.string(),
    accent:            z.enum(['psychotherapy', 'shiatsu', 'voice']),
    hero_image:        z.string(),
    teaser_image:      z.string().optional(),
    summary:           z.string(),
    order:             z.number(),
    related_blog_tags: z.array(z.string()).optional(),
  }),
});

const blog = defineCollection({
  type: 'content',
  schema: z.object({
    title:           z.string(),
    excerpt:         z.string(),
    date:            z.coerce.date(),
    cover:           z.string().optional(),
    tags:            z.array(z.string()).default([]),
    related_therapy: z.enum(['psychotherapy', 'shiatsu', 'voice']).optional(),
    draft:           z.boolean().default(false),
  }),
});

export const collections = { therapies, blog };
