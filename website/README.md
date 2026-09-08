# Pointee landing page

The production page implements the approved **01 + A** direction: a text-free component gallery behind the Ancho wordmark. Entering the gallery moves the wordmark aside and transfers its hand to a flipped, tip-aligned cursor. Leaving restores the title and native cursor. The interaction starts with no selection; click exposes the toolbar, and Edit opens contextual controls.

## Run and build

Use Node 22.12+ or Node 24. From this directory:

```sh
npm ci
npm run dev
npm run check
npm run build
```

Development runs on `http://127.0.0.1:4180`. To inspect built files instead, stop development and run `npm run preview` (same port). Vite rebuilds the production page into `dist/`.

The website has its own package and lockfile. It does not alter the extension's root package, test harnesses, or packaging script. Earlier design explorations remain under `prototypes/` and are not included in the production output.

## Implementation

- Static HTML/CSS with [Motion](https://motion.dev/docs/animate) for interruptible hand transfer. Once transferred, the cursor tracks pointer coordinates directly. Native controls handle selection and editing; no React runtime is needed.
- Static gallery and install link work without JavaScript. Interaction activates after the module loads. Keyboard focus and touch enter the demo without taking over a cursor. Reduced motion skips the hand flight; blur/visibility changes restore the system cursor.
- The demo is scoped to its own sample DOM. Source paths in copied context are illustrative; no agent is connected and no user's source files are changed. Screenshot downloads a PNG using the existing, locally bundled html2canvas-pro library, loaded only on demand.
- `src/geometry.js` computes external element gaps. Overlapping or contained elements do not get a fabricated zero-gap measurement.
- Ancho and the logo are user-provided assets. Geist's bundled license and html2canvas-pro's embedded license remain with their assets.

## Vercel setup

Import the repository into Vercel and select **Root Directory: `website`**. The committed configuration uses **Other** as the framework preset, `npm run build` as the build command and `dist` as the output directory. See [Vercel's configuration reference](https://vercel.com/docs/project-configuration/vercel-json).

Canonical and social image URLs use `SITE_URL`, if provided, or Vercel's `VERCEL_PROJECT_PRODUCTION_URL` system variable. Keep [system environment variables exposed](https://vercel.com/docs/environment-variables/system-environment-variables). Local builds omit domain-specific metadata instead of guessing a domain. The repository banner is included as the social image.

Production is live at [pointee.vercel.app](https://pointee.vercel.app), in Vercel project `kddesign/pointee`.

The initial production deployment was created from this directory with the CLI. To deploy another version:

```sh
npx vercel deploy --project pointee --scope kddesign --prod --yes
```

Git-triggered deployments have not been connected. If enabling the repository integration later, set its Root Directory to `website`.

## Validation

`npm run check` runs JavaScript syntax validation and geometry boundary tests; `npm run build` verifies the production bundle. Browser checks on the built page cover cursor entry/exit, selection, contextual editing and copied token deltas. Responsive checks cover 390px and 1400px viewport widths with no horizontal overflow.
