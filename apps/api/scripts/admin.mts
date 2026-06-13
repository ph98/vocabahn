/**
 * AdminJS monitoring panel (dev tool) — browse/edit every table with a rich UI.
 *
 *   pnpm --filter @vocabahn/api admin      # http://localhost:3001/admin
 *
 * Runs standalone (express + @adminjs/prisma) on its own port, separate from the
 * NestJS API. This deliberately sidesteps the NestJS CommonJS ↔ AdminJS ESM
 * conflict; tsx runs this file as native ESM. Credentials come from .env
 * (ADMIN_EMAIL / ADMIN_PASSWORD / ADMIN_COOKIE_PASSWORD).
 */
import AdminJSExpress from '@adminjs/express';
import * as AdminJSPrisma from '@adminjs/prisma';
import { PrismaClient } from '@prisma/client';
import AdminJS, { Router as AdminRouter } from 'adminjs';
import express from 'express';
import path from 'node:path';

AdminJS.registerAdapter({
  Resource: AdminJSPrisma.Resource,
  Database: AdminJSPrisma.Database,
});

const prisma = new PrismaClient();
const port = Number(process.env.ADMIN_PORT ?? 3001);

// Group models into a readable navigation (PRD §5 data model layers)
const NAV = {
  lexicon: { name: 'Lexicon', icon: 'Book' },
  dictionary: { name: 'Dictionary', icon: 'BookOpen' },
  study: { name: 'Study', icon: 'Activity' },
  courses: { name: 'Courses', icon: 'List' },
  system: { name: 'System', icon: 'Settings' },
};

interface ResourceSpec {
  model: string;
  navigation: keyof typeof NAV;
  // properties to hide from the list view (kept on the detail/edit view)
  hideFromList?: string[];
  listProperties?: string[];
}

const SPECS: ResourceSpec[] = [
  { model: 'User', navigation: 'system' },
  {
    model: 'LexiconEntry',
    navigation: 'lexicon',
    listProperties: ['word', 'pos', 'gender', 'frequencyRank', 'ipa'],
    hideFromList: ['raw', 'etymology'],
  },
  { model: 'WordForm', navigation: 'lexicon', listProperties: ['form', 'tags', 'source'] },
  { model: 'WordSense', navigation: 'lexicon', listProperties: ['glosses', 'tags', 'topics'] },
  {
    model: 'DictionaryEntry',
    navigation: 'dictionary',
    listProperties: ['word', 'enrichmentStatus', 'translation', 'cefrLevel', 'updatedAt'],
  },
  { model: 'DictionaryExample', navigation: 'dictionary' },
  { model: 'ImageCredit', navigation: 'dictionary' },
  { model: 'Card', navigation: 'study', listProperties: ['userId', 'knownState', 'state', 'due', 'reps'] },
  { model: 'ReviewLog', navigation: 'study', listProperties: ['userId', 'rating', 'mode', 'reviewedAt'] },
  { model: 'KnowledgeScore', navigation: 'study' },
  { model: 'Course', navigation: 'courses' },
  { model: 'CourseWord', navigation: 'courses' },
  { model: 'UserCourse', navigation: 'courses' },
  { model: 'ContactMessage', navigation: 'system' },
];

function buildResource(spec: ResourceSpec) {
  const listShow = spec.listProperties
    ? Object.fromEntries(spec.listProperties.map((p) => [p, { isVisible: { list: true } }]))
    : {};
  const listHide = spec.hideFromList
    ? Object.fromEntries(
        spec.hideFromList.map((p) => [p, { isVisible: { list: false, show: true, edit: true, filter: false } }]),
      )
    : {};

  return {
    resource: { model: AdminJSPrisma.getModelByName(spec.model), client: prisma },
    options: {
      navigation: NAV[spec.navigation],
      properties: { ...listShow, ...listHide },
    },
  };
}

const admin = new AdminJS({
  rootPath: '/admin',
  resources: SPECS.map(buildResource),
  branding: {
    companyName: 'Vocabahn',
    withMadeWithLove: false,
  },
});

const authenticate = async (email: string, password: string) => {
  if (email === process.env.ADMIN_EMAIL && password === process.env.ADMIN_PASSWORD) {
    return { email };
  }
  return null;
};

const cookiePassword = process.env.ADMIN_COOKIE_PASSWORD;
if (!cookiePassword) {
  throw new Error('ADMIN_COOKIE_PASSWORD is not set in .env');
}

const router = AdminJSExpress.buildAuthenticatedRouter(
  admin,
  { authenticate, cookieName: 'vb_admin', cookiePassword },
  null,
  { resave: false, saveUninitialized: false, secret: cookiePassword },
);

const app = express();

// pnpm stores packages under node_modules/.pnpm/, and @adminjs/express serves its
// frontend bundles/fonts via res.sendFile() with the default dotfiles:'ignore' —
// which 404s every asset path containing the ".pnpm" dot-directory, leaving the UI
// blank. Serve AdminJS's static assets ourselves with dotfiles allowed, before the
// admin router so these handlers win (the dynamic components.bundle.js falls through).
const assetRouter = express.Router();
for (const asset of AdminRouter.assets) {
  assetRouter.get(asset.path, (_req, res) => {
    res.sendFile(path.resolve(asset.src), { dotfiles: 'allow' });
  });
}
app.use(admin.options.rootPath, assetRouter);

app.use(admin.options.rootPath, router);
app.listen(port, () => {
  console.log(`AdminJS running on http://localhost:${port}${admin.options.rootPath}`);
  console.log(`Sign in with ADMIN_EMAIL / ADMIN_PASSWORD from .env`);
});
