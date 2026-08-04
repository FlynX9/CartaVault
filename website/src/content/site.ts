export const languages = ['fr', 'en'] as const;
export type Language = (typeof languages)[number];

export const pageSlugs = ['features', 'self-hosting', 'documentation', 'roadmap', 'about', 'contact', 'legal', 'privacy'] as const;
export type PageSlug = (typeof pageSlugs)[number];

type Section = { title: string; body: string; bullets?: string[] };
type Page = { title: string; description: string; eyebrow: string; sections: Section[] };

export const external = {
  app: 'https://app.cartavault.fr',
  docs: 'https://github.com/FlynX9/CartaVault/tree/master/docs',
  github: 'https://github.com/FlynX9/CartaVault',
  issues: 'https://github.com/FlynX9/CartaVault/issues',
  email: 'mailto:contact@cartavault.fr',
};

export const copy: Record<Language, {
  skip: string; navLabel: string; menu: string; close: string; language: string;
  nav: Record<'features' | 'self-hosting' | 'documentation' | 'roadmap', string>;
  footer: string; legal: string; privacy: string; contact: string;
  home: {
    title: string; description: string; eyebrow: string; hero: string; intro: string;
    primary: string; secondary: string; proof: string[];
    placesTitle: string; placesBody: string; tripsTitle: string; tripsBody: string;
    collaborationTitle: string; collaborationBody: string;
    hostingTitle: string; hostingBody: string; self: string; cloud: string;
    screenshotsTitle: string; ctaTitle: string; ctaBody: string;
  };
  pages: Record<PageSlug, Page>;
}> = {
  fr: {
    skip: 'Aller au contenu', navLabel: 'Navigation principale', menu: 'Ouvrir le menu', close: 'Fermer le menu', language: 'English',
    nav: { features: 'Fonctionnalités', 'self-hosting': 'Auto-hébergement', documentation: 'Documentation', roadmap: 'Feuille de route' },
    footer: 'Cartographiez vos découvertes. Gardez le contrôle de vos données.', legal: 'Mentions légales', privacy: 'Confidentialité', contact: 'Contact',
    home: {
      title: 'CartaVault — Vos lieux, vos voyages, vos données',
      description: 'CartaVault centralise vos lieux et transforme vos cartes privées en voyages structurés, dans une application open source auto-hébergeable.',
      eyebrow: 'Cartographie personnelle open source', hero: 'Gardez une trace de chaque lieu. Construisez chaque voyage.',
      intro: 'Une carte privée pour collecter, classer et retrouver vos points d’intérêt, puis les organiser en itinéraires jour par jour — sans abandonner la maîtrise de vos données.',
      primary: 'Découvrir sur GitHub', secondary: 'Voir les fonctionnalités',
      proof: ['Open source · Licence MIT', 'PostgreSQL + PostGIS', 'Docker · Installation autonome'],
      placesTitle: 'Une mémoire cartographique qui reste lisible', placesBody: 'Importez, recherchez et classez vos lieux par catégories, statuts, tags, régions et favoris. Les listes, facettes et marqueurs restent efficaces sur les grandes cartes.',
      tripsTitle: 'Du repérage au voyage, dans le même espace', tripsBody: 'Composez vos journées par glisser-déposer, planifiez les nuits, calculez les routes, estimez les temps et exportez un carnet PDF prêt à emporter.',
      collaborationTitle: 'Privé par défaut, collaboratif quand vous le décidez', collaborationBody: 'Partagez une carte avec des rôles explicites, invitez vos proches et transférez la propriété sans ouvrir vos autres espaces.',
      hostingTitle: 'Choisissez votre façon d’utiliser CartaVault', hostingBody: 'La version auto-hébergée est disponible aujourd’hui. Une offre cloud simplifiée est envisagée, sans retirer la liberté de déployer chez vous.', self: 'Auto-hébergé maintenant', cloud: 'Cloud à venir',
      screenshotsTitle: 'L’application, pas une promesse abstraite', ctaTitle: 'Prêt à bâtir votre propre atlas ?', ctaBody: 'Consultez le dépôt, la documentation de déploiement et la feuille de route publique.',
    },
    pages: {
      features: { title: 'Fonctionnalités', description: 'Cartes privées, lieux structurés, voyages et collaboration dans un même outil.', eyebrow: 'Produit', sections: [
        { title: 'Cartes et lieux', body: 'Créez des cartes par pays et centralisez des milliers de points d’intérêt.', bullets: ['Recherche par texte, adresse ou coordonnées', 'Catégories, statuts, tags, notes et favoris', 'Photos, liens nommés, historique et corbeille', 'Import KMZ et export KML/KMZ'] },
        { title: 'Sorties et voyages', body: 'Transformez une sélection de lieux en programme réaliste.', bullets: ['Jours, nuits, départ et arrivée', 'Routes, contraintes pays et optimisation', 'Chronologie interactive et mode aperçu', 'Exports PDF, GPX et liens de navigation'] },
        { title: 'Comptes et partage', body: 'Conservez des frontières d’accès claires.', bullets: ['Cartes privées et rôles propriétaire, éditeur, lecteur', 'Invitations et transfert de propriété', 'Préférences, sessions et quotas administrables', 'Audit des changements et notifications de sécurité'] },
      ] },
      'self-hosting': { title: 'Auto-hébergement', description: 'Déployez CartaVault avec une image applicative et PostGIS.', eyebrow: 'Déploiement', sections: [
        { title: 'Une pile volontairement simple', body: 'Le mode standard réunit l’API et l’interface dans une image, accompagnée de PostgreSQL/PostGIS. Redis et le worker restent une extension optionnelle.' },
        { title: 'Vous gardez les clés', body: 'Base, photos, sauvegardes et secrets restent dans votre infrastructure.', bullets: ['Docker Compose et Portainer', 'Migrations Alembic au démarrage', 'Sauvegarde et restauration documentées', 'Diagnostic d’instance réservé aux administrateurs'] },
        { title: 'Cloud CartaVault', body: 'Une offre hébergée pourra faciliter l’accès aux personnes qui ne souhaitent pas administrer un serveur. Elle est en préparation et n’est pas requise pour utiliser le logiciel.' },
      ] },
      documentation: { title: 'Documentation', description: 'Installer, administrer et contribuer à CartaVault.', eyebrow: 'Ressources', sections: [
        { title: 'Guides disponibles', body: 'La documentation technique vit avec le code et suit chaque version.', bullets: ['Installation Docker et Portainer', 'Migrations, sauvegarde et restauration', 'Sécurité et état de l’instance', 'E-mails, routage, imports et performances'] },
        { title: 'Besoin d’aide ?', body: 'Consultez les guides du dépôt, puis ouvrez une issue reproductible si le problème persiste.' },
      ] },
      roadmap: { title: 'Feuille de route', description: 'Une évolution publique, guidée par des issues vérifiables.', eyebrow: 'Projet', sections: [
        { title: 'Cap actuel', body: 'Stabiliser la bêta privée : déploiement reproductible, sécurité, performances et qualité des voyages.' },
        { title: 'Ensuite', body: 'Améliorer les imports, les exports, la collaboration et l’expérience mobile sans sacrifier l’auto-hébergement.' },
        { title: 'Suivre les décisions', body: 'Les fonctionnalités, anomalies et critères d’acceptation sont suivis publiquement sur GitHub.' },
      ] },
      about: { title: 'À propos', description: 'Pourquoi CartaVault existe et comment le projet avance.', eyebrow: 'CartaVault', sections: [
        { title: 'Un outil né d’un besoin concret', body: 'Les favoris dispersés, cartes partagées et feuilles de calcul rendent la préparation d’un voyage fragile. CartaVault réunit cette mémoire dans un espace cohérent.' },
        { title: 'Ouvert et vérifiable', body: 'Le code est publié sous licence MIT. Les changements sont testés, documentés et discutés dans le dépôt public.' },
      ] },
      contact: { title: 'Contact', description: 'Parler du projet, signaler un problème ou proposer une contribution.', eyebrow: 'Échangeons', sections: [
        { title: 'Questions générales', body: 'Écrivez à contact@cartavault.fr. Votre logiciel de messagerie s’ouvrira : aucune donnée n’est collectée par ce site.' },
        { title: 'Support et anomalies', body: 'Pour une demande technique, privilégiez une issue GitHub sans donnée personnelle, secret ou capture sensible.' },
      ] },
      legal: { title: 'Mentions légales', description: 'Informations légales relatives au site cartavault.fr.', eyebrow: 'Informations', sections: [
        { title: 'Éditeur', body: 'CartaVault est un projet open source édité sous le nom FlynX9. Responsable de publication : FlynX9. Contact : contact@cartavault.fr.' },
        { title: 'Hébergement', body: 'o2switch — Chemin des Pardiaux, 63000 Clermont-Ferrand, France — 04 44 44 60 40 — o2switch.fr.' },
        { title: 'Propriété intellectuelle', body: 'Le logiciel CartaVault est distribué sous licence MIT. Les marques, textes et éléments graphiques restent protégés par les droits de leurs titulaires.' },
        { title: 'Responsabilité', body: 'Les informations sont fournies à titre indicatif. Les fonctions et procédures peuvent évoluer pendant la phase bêta.' },
      ] },
      privacy: { title: 'Politique de confidentialité', description: 'Données traitées par le site marketing CartaVault.', eyebrow: 'Vie privée', sections: [
        { title: 'Un site statique et sobre', body: 'Ce site n’utilise aucun compte, formulaire, cookie publicitaire, outil de mesure d’audience ni traceur tiers.' },
        { title: 'Contact par e-mail', body: 'Le lien de contact ouvre votre logiciel de messagerie. Les données envoyées sont alors traitées uniquement pour répondre à votre demande et selon les règles de votre fournisseur de messagerie.' },
        { title: 'Journaux techniques', body: 'L’hébergeur peut conserver des journaux techniques nécessaires à la sécurité et au fonctionnement du service, selon ses obligations et durées propres.' },
        { title: 'Vos droits', body: 'Pour toute question ou demande relative à vos données : contact@cartavault.fr.' },
      ] },
    },
  },
  en: {
    skip: 'Skip to content', navLabel: 'Main navigation', menu: 'Open menu', close: 'Close menu', language: 'Français',
    nav: { features: 'Features', 'self-hosting': 'Self-hosting', documentation: 'Documentation', roadmap: 'Roadmap' },
    footer: 'Map your discoveries. Keep control of your data.', legal: 'Legal notice', privacy: 'Privacy', contact: 'Contact',
    home: {
      title: 'CartaVault — Your places, trips and data', description: 'CartaVault turns private maps and saved places into structured journeys in an open-source, self-hostable application.', eyebrow: 'Open-source personal mapping', hero: 'Remember every place. Shape every journey.', intro: 'A private map to collect, classify and retrieve points of interest, then organize them into day-by-day itineraries — without giving up control of your data.', primary: 'Explore on GitHub', secondary: 'See features', proof: ['Open source · MIT License', 'PostgreSQL + PostGIS', 'Docker · Self-contained setup'], placesTitle: 'A geographic memory that stays readable', placesBody: 'Import, search and classify places with categories, statuses, tags, regions and favorites. Lists, facets and markers remain efficient as maps grow.', tripsTitle: 'From discovery to itinerary in one workspace', tripsBody: 'Build days with drag and drop, plan nights, calculate routes, estimate time and export a travel-ready PDF.', collaborationTitle: 'Private by default, collaborative by choice', collaborationBody: 'Share a map with explicit roles, invite fellow travelers and transfer ownership without exposing other spaces.', hostingTitle: 'Choose how you run CartaVault', hostingBody: 'Self-hosting is available today. A simpler hosted offering is planned without taking away your ability to deploy at home.', self: 'Self-host today', cloud: 'Cloud planned', screenshotsTitle: 'A working product, not an abstract promise', ctaTitle: 'Ready to build your own atlas?', ctaBody: 'Explore the repository, deployment documentation and public roadmap.',
    },
    pages: {
      features: { title: 'Features', description: 'Private maps, structured places, trips and collaboration in one tool.', eyebrow: 'Product', sections: [
        { title: 'Maps and places', body: 'Create country maps and centralize thousands of points of interest.', bullets: ['Text, address and coordinate search', 'Categories, statuses, tags, ratings and favorites', 'Photos, named links, history and trash', 'KMZ import and KML/KMZ export'] },
        { title: 'Trips and outings', body: 'Turn saved places into a realistic schedule.', bullets: ['Days, nights, departure and arrival', 'Routes, country constraints and optimization', 'Interactive timeline and trip preview', 'PDF and GPX exports with navigation links'] },
        { title: 'Accounts and sharing', body: 'Keep access boundaries explicit.', bullets: ['Private maps with owner, editor and viewer roles', 'Invitations and ownership transfer', 'Preferences, sessions and admin quotas', 'Change history and security notifications'] },
      ] },
      'self-hosting': { title: 'Self-hosting', description: 'Deploy CartaVault with one application image and PostGIS.', eyebrow: 'Deployment', sections: [
        { title: 'A deliberately small stack', body: 'The standard mode combines API and interface in one image alongside PostgreSQL/PostGIS. Redis and the worker remain optional extensions.' },
        { title: 'You hold the keys', body: 'Database, photos, backups and secrets remain in your infrastructure.', bullets: ['Docker Compose and Portainer', 'Alembic migrations at startup', 'Documented backup and restore', 'Admin-only instance diagnostics'] },
        { title: 'CartaVault Cloud', body: 'A hosted offering may help people who do not want to administer a server. It is planned and is not required to use the software.' },
      ] },
      documentation: { title: 'Documentation', description: 'Install, administer and contribute to CartaVault.', eyebrow: 'Resources', sections: [
        { title: 'Available guides', body: 'Technical documentation lives with the code and follows every release.', bullets: ['Docker and Portainer installation', 'Migrations, backup and restore', 'Security and instance status', 'Email, routing, imports and performance'] },
        { title: 'Need help?', body: 'Read the repository guides, then open a reproducible issue if the problem remains.' },
      ] },
      roadmap: { title: 'Roadmap', description: 'Public development driven by verifiable issues.', eyebrow: 'Project', sections: [
        { title: 'Current focus', body: 'Stabilize the private beta: reproducible deployment, security, performance and high-quality trip planning.' },
        { title: 'Next', body: 'Improve imports, exports, collaboration and mobile use without sacrificing self-hosting.' },
        { title: 'Follow decisions', body: 'Features, bugs and acceptance criteria are tracked publicly on GitHub.' },
      ] },
      about: { title: 'About', description: 'Why CartaVault exists and how the project moves forward.', eyebrow: 'CartaVault', sections: [
        { title: 'Built from a practical need', body: 'Scattered bookmarks, shared maps and spreadsheets make travel planning fragile. CartaVault brings that memory into one coherent workspace.' },
        { title: 'Open and verifiable', body: 'The code is released under the MIT license. Changes are tested, documented and discussed in the public repository.' },
      ] },
      contact: { title: 'Contact', description: 'Discuss the project, report a problem or contribute.', eyebrow: 'Get in touch', sections: [
        { title: 'General questions', body: 'Email contact@cartavault.fr. Your mail application opens directly; this website collects no form data.' },
        { title: 'Support and bugs', body: 'For technical requests, prefer a GitHub issue without personal data, secrets or sensitive screenshots.' },
      ] },
      legal: { title: 'Legal notice', description: 'Legal information for cartavault.fr.', eyebrow: 'Information', sections: [
        { title: 'Publisher', body: 'CartaVault is an open-source project published under the name FlynX9. Publication manager: FlynX9. Contact: contact@cartavault.fr.' },
        { title: 'Hosting', body: 'o2switch — Chemin des Pardiaux, 63000 Clermont-Ferrand, France — +33 4 44 44 60 40 — o2switch.fr.' },
        { title: 'Intellectual property', body: 'CartaVault software is distributed under the MIT license. Trademarks, text and visual material remain protected by their respective owners.' },
        { title: 'Liability', body: 'Information is provided for guidance. Features and procedures may change during the beta period.' },
      ] },
      privacy: { title: 'Privacy policy', description: 'Data processing on the CartaVault marketing site.', eyebrow: 'Privacy', sections: [
        { title: 'A minimal static website', body: 'This site uses no account, form, advertising cookie, audience analytics or third-party tracker.' },
        { title: 'Email contact', body: 'The contact link opens your mail application. Sent data is processed only to answer your request and under your email provider’s rules.' },
        { title: 'Technical logs', body: 'The host may retain technical logs needed for service security and operation according to its own legal obligations and retention periods.' },
        { title: 'Your rights', body: 'For any question or data request: contact@cartavault.fr.' },
      ] },
    },
  },
};

export const href = (lang: Language, slug = '') => `/${lang}/${slug ? `${slug}/` : ''}`;
