# Create a detailed plan to build this website

## Focus
The plan shouldn't focus on the website content (text and images). The content will be filled manually later. Just use placeholder or dummy content or fillers for the content. Instead, these are the focus areas:
1. Website structure, including all pages, all their inter-links, shared components, etc.
2. Pages' visual structure
3. Visual design **This is the most important aspect of the plan. You should invest the vast majority of your planning effort in the visual design, to perfectly match the requirements below**

## Website structure
The website consists of the following pages:
1. Home page
2. About (extended over the short intro in the home page)
3. Blog
   3.1. Blog menu (maybe a tile link for every article. Can be something else - use your creativity)
   3.2. An example single blog post page
### Product pages
4. Physical psychotherapy
5. Shiatsu-based touch therapy
6. Voice opening and releasing

### Shared links - should gently appear somehow on all pages
- Phone link (`tel:`): `+972 052-520-1162`
- Whatsapp link to the same number
- Email link (`mailto:`): `shir.amitai1@gmail.com`
- Facebook: `https://www.facebook.com/shir.amitai`
- Biosynthesis psychotherapy school graduate page: `https://biosynthesis.co.il/%D7%A9%D7%99%D7%A8-%D7%90%D7%9E%D7%99%D7%AA%D7%99/`

### Home page content
The home page includes the following areas. Every area consists of a single paragraph, representing image, and a link to a dedicated page of that topic. Maybe the entire element can be the link:
   - Therapist (Shir) introduction
   - Physical psychotherapy (speech therapy)
   - Shiatsu-based touch therapy
   - Voice opening and releasing
   - Blog

## Visual design guidelines
- See the existing design in the already existing placeholder page and the background image, for reference and insparation.
- The overall experience must be stunning
- Use gentle animation and effects to make the scrolling and navigation experience be really cool and interesting. Examine the following websites to see not the tone and design language, but the cool things they do on scrolling and navigation:
  - https://viens-la.com/
  - https://aristidebenoist.com/
  - https://koto.com/
- I imagine a scrolling experience on the home page that goes through the various content area, while a theme image stays fixed in the background or moves slowlier than the main content, creating a soft, wrapping experience. But this is just a suggestion for inspiration, as a lead frontend designer you should suggest another stunning experience.
- The scrolling and navigation experience should be consistent across the entire website, with the necessary adjustment to the specific page content.
- Consider keep using the fonts currently in use in the placeholder page (this isn't a hard requirement)

### Design theme and atmosphere
For you to understand the desired theme and atmosphere, following are some instructions and references.

#### Website's owner general guidance 
בעיצוב- פניה למכנה משותף רחב שמשדר: מרחב רגיעה ונשימה, פשטות, סדר ויציבות לצד תנועה עדינה. רפרנס עלים וצבעי מים.

#### Website's owner reference websites - should NOT be strictly followed, but be used as loose inspiration only
- https://www.idogilat.com/
- https://daoism.co.il/

#### General description used to create the existing backgound image
התמונה צריכה לשדר בלי מילים את האנרגיה שהיא משדרת כמטפלת בשיחה ובמגע. (היא גם מטפלת שיאצו, וגם מוזיקאית ועושה עם אנשים תהליכי פתיחת קול, ומחברת את הכל באופן הוליסטי)
אני מדמיין משהו מאוד פשוט, אבסטרקטי, בצבעים רכים וחמים, אולי בסגנון צבעי מים, בלי צורות מוגדרות.
כשהיא תיארה את עיצוב האתר הרצוי בעיניה, היא השתמשה בתיאורים הבאים - לא צריך להיצמד דווקא אליהם, אבל הם מוסיפים לכיוון:
חם, רך, צבעוני, מרגיע, מעורר. היא מודעת למתח שבין מרגיע למעורר, ובכל זאת בחרה בשניהם.
צבעים פסטליים נעימים, תכלת ירוק סגלגל ורדרד, צהוב עדין/חול.. 
אדום כתום - פחות

#### The prompt used to create the existing background image
[Composition] A full-frame, seamless abstract watercolor background for a responsive website. Strictly NO text, no letters, no defined shapes, and no distinct objects. It should be an organic, breathing flow of soft, bleeding colors, resembling light and mist. Ensure the visual flow and textures are evenly distributed across the frame so it remains visually appealing even when cropped vertically for mobile screens. Aspect ratio 16:9.
[Style] Ethereal, dreamy, fluid watercolor technique. The color fields must blend seamlessly into each other, creating soft, diffuse gradients and soft-focus areas. The texture should resemble high-quality, cold-pressed watercolor paper, visible but not overwhelming. Natural, warm, diffuse lighting.
[Colors] A soft, warm, pastel color palette. Predominantly shades of seafoam green, pale teal, soft lavender, powder pink, and gentle sand/cream yellow. Explicitly avoid bright reds, intense oranges, or harsh dark tones. The colors should merge naturally without hard edges, creating a feeling of enveloping warmth and harmony.
[Atmosphere] Holistic, gentle, restorative, and softly vitalizing. A subtle tension and balance between calming (the cool tones) and gently awakening (the sand and pink tones), reflecting healing energy, flow, and human touch.

### Images
You should freely include images in your design, and you should distinguish between 2 types of images:
1. Content images - for example, Shir's portrait, various therapeis illustrations, etc. These images will be provided and integrated later, you should just keep an explicit place holder to them with a clear description of the intended image content.
2. Atmosphere images - for example, pages' background images, not-content-specific images to generaly create the desired atmosphere (like flowers/trees/leaves), decoration images, etc. These images will be generated by a dedicated generative AI model. You should provide the detailed, percise prompt for every such an image.

## Technical guidelines
The website is hosted on a simple hosting service like Cloudflare or Vercel.
- The final output must consists of static resources only. NO BACKEND OR SERVER CODE.
- Consider whether everything should be static from the begining, or some frontend framework may be benefitical. Remember that a stunning UX is a hard requirement, and consider if we must implement the website as an SPA to achive this (especially consider the experience of the navigation between pages, but also the overall experience)
- If you choose using a framework that requires a build process, it must be a process that is supported on the free plans of the hosting services like Cloudflare/Vercel/Netlify
- You can freely incorporate any UI/UX library to implement any part of the website, as long as it's provided under a free to use license (like MIT or similar) and it truely supports the implementation
- While meeting all the previous requirements, try to keep the website payload minimal 
- All pages should be highly inter-linked, as long as this makes sense. For example, all pages should link back to the home page. blog past pages should link to the blog menu page, and so on.
- The website must be fully responsive.
- The website must be fully accessible. Plan to implement every relevent accessibility feature.
- Highly prepare the website for SEO.

## Output
Output the plan into a single comprehensive and detailed `plan.md` file.
