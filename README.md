# NWSS Course Guide 2027–2028 (prototype)

An interactive, searchable version of the New Westminster Secondary School Course Description Booklet, built for students and parents.

**What it does**
- **Explore Courses**: search all 225 courses by name, MyEd code, or keyword. You can filter by grade, subject area, and features such as required courses, Indigenous-focused courses, Honours, dual credit, application/audition, and course fees.
- **Course details**: the full description from the booklet, recommended preparation, notes, key facts, related courses, MyEd codes you can copy, and a shareable link to each course.
- **My Plan**: students save courses to Grades 9–12. The plan includes a graduation check, a credit counter, "Copy codes for MyEd", and Print/PDF. Plans are saved in the browser on that device only. Nothing is sent anywhere.
- **Graduation**: Dogwood requirements, required courses by grade (English and French Immersion), Indigenous-focused courses, graduation assessments, and Dual Dogwood.
- **Programs**: the IB Diploma (groups, pre-requisites, sample pathways), French Immersion, Dual Credit & Trades, Honours, Sports Academies, Performing Arts, and Online courses.
- **Get Started**: the 5 course-selection steps, the deadline, and a counsellor finder where students type their last name.

It is plain HTML/CSS/JS with no build step and no dependencies.

## Put it on GitHub Pages (about 5 minutes)

1. Create a new repository on GitHub, for example `nwss-course-guide`. It can be public or private. Pages on private repos needs a paid plan.
2. Click **Add file → Upload files**. Drag in **everything inside this folder**: `index.html`, `app.js`, `data.js`, `styles.css`, `README.md`, and the `assets` folder. Click **Commit changes**.
3. Go to **Settings → Pages**. Under "Build and deployment", set **Source: Deploy from a branch**, **Branch: main**, folder **/(root)**, then click **Save**.
4. Wait about a minute. Your site will be at `https://<your-username>.github.io/nwss-course-guide/`.

You can also open `index.html` straight from your computer by double-clicking it. It works offline, except for the web fonts and the school logo.

## Embedding in the school website (WordPress)

Once it's on GitHub Pages (or the district's server), add a **Custom HTML** block to a page:

```html
<iframe src="https://<your-username>.github.io/nwss-course-guide/" style="width:100%;height:90vh;border:0" title="NWSS Course Guide"></iframe>
```

## Editing content

- **Courses** are in `data.js` (`window.NWSS_DATA.courses`). Each course has `title`, `codes`, `grades`, `dept`, `sub`, `tags`, `desc` (paragraphs/bullets), `recommended`, `notes` and `facts`. Edit the text directly and save.
- **Deadline, counsellors, graduation text, IB groups and pathways, online courses** are in `NWSS_DATA.guide` in the same file.
- **Colours and fonts** are CSS variables at the top of `styles.css` (`--brand`, `--ink`, `--accent`, `--font-head`, `--font-body`). Change them to match the district brand exactly.
- **Tags** (`required`, `indigenous`, `honours`, `application`, `fee`, `dual`, `fullyear`, `ba`, `new`, `notoffered`) drive the filters. You can add or remove them per course.

## Notes

- The graduation check and credit counter are planning aids. They use simple matching rules, and counsellors confirm actual requirements.
- The school logo loads from newwestschools.ca. If it can't load, a text wordmark appears instead.
