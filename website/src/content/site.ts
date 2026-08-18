export const languages = ['fr', 'en'] as const;
export type Language = (typeof languages)[number];

export const pageSlugs = ['features', 'self-hosting', 'documentation', 'roadmap', 'about', 'contact', 'legal', 'privacy', 'cookies'] as const;
export type PageSlug = (typeof pageSlugs)[number];

type Section = { title: string; body: string; bullets?: string[] };
type Page = { title: string; description: string; eyebrow: string; sections: Section[] };
type Benefit = { title: string; body: string; icon: 'import' | 'file' | 'history' | 'server' | 'shield' };

export const external = {
  app: 'https://app.cartavault.fr',
  docs: '/docs',
  github: 'https://github.com/FlynX9/CartaVault',
  issues: 'https://github.com/FlynX9/CartaVault/issues',
  email: 'mailto:contact@cartavault.fr',
};

export const copy: Record<Language, {
  skip: string; navLabel: string; menu: string; close: string; language: string;
  openApp: string;
  beta: { eyebrow: string; title: string; body: string; cancel: string; accept: string };
  nav: Record<'features' | 'self-hosting' | 'documentation' | 'roadmap', string>;
  footer: string; legal: string; privacy: string; cookies: string; contact: string;
  featuresShowcase: {
    primary: string; secondary: string; links: string[]; benefitsTitle: string;
    benefits: Benefit[];
  };
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
    skip: 'Aller au contenu', navLabel: 'Navigation principale', menu: 'Ouvrir le menu', close: 'Fermer le menu', language: 'EN', openApp: 'Application Beta',
    beta: {
      eyebrow: 'Version de démonstration',
      title: 'CartaVault est actuellement en bêta',
      body: 'Cette instance permet de découvrir CartaVault, mais elle reste expérimentale. Les données de démonstration ne sont ni sécurisées ni garanties et peuvent être modifiées, réinitialisées ou supprimées sans préavis : ne l’utilisez pas pour stocker des informations importantes ou sensibles.',
      cancel: 'Revenir au site',
      accept: 'J’accepte, ouvrir l’application',
    },
    nav: { features: 'Fonctionnalités', 'self-hosting': 'Auto-hébergement', documentation: 'Documentation', roadmap: 'Feuille de route' },
    footer: 'Cartographiez vos découvertes. Gardez le contrôle de vos données.', legal: 'Mentions légales', privacy: 'Confidentialité', cookies: 'Politique de cookies', contact: 'Contact',
    featuresShowcase: {
      primary: 'Essayer CartaVault', secondary: 'Voir la démonstration',
      links: ['Découvrir les cartes', 'Explorer les voyages', 'Comprendre le partage'],
      benefitsTitle: 'Une base solide, jusque dans les détails',
      benefits: [
        { title: 'Import et export avancés', body: 'KML, KMZ et données structurées.', icon: 'import' },
        { title: 'Exports professionnels', body: 'PDF illustrés, GPX et navigation.', icon: 'file' },
        { title: 'Historique complet', body: 'Des changements lisibles et auditables.', icon: 'history' },
        { title: 'Auto-hébergement', body: 'Une pile Docker claire et documentée.', icon: 'server' },
        { title: 'Privé par défaut', body: 'Vos cartes restent sous votre contrôle.', icon: 'shield' },
      ],
    },
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
      features: { title: 'Tout ce qu’il faut pour organiser, préparer et documenter vos lieux.', description: 'CartaVault réunit cartographie privée, fiches détaillées, préparation de voyages et collaboration dans un même espace.', eyebrow: 'Produit', sections: [
        { title: 'Cartes et lieux', body: 'Créez des cartes privées par pays et retrouvez chaque lieu dans une fiche structurée.', bullets: ['Recherche par texte, adresse ou coordonnées', 'Catégories, statuts, tags, notes et favoris', 'Photos, liens nommés, historique et corbeille', 'Import KML/KMZ et export KML/KMZ'] },
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
        { title: 'Cap actuel', body: 'Faire progresser la bêta publique : déploiement reproductible, sécurité, performances et qualité des voyages.' },
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
      privacy: { title: 'Politique de confidentialité', description: 'Comment le site marketing CartaVault traite les données personnelles.', eyebrow: 'Vie privée', sections: [
        { title: 'Champ d’application', body: 'Cette politique concerne uniquement le site cartavault.fr. L’application app.cartavault.fr et chaque instance auto-hébergée disposent de leurs propres paramètres, responsables de traitement et politiques applicables.' },
        { title: 'Responsable et contact', body: 'Le site est édité par FlynX9. Pour toute question relative à la confidentialité ou pour exercer vos droits, écrivez à contact@cartavault.fr.' },
        { title: 'Données traitées', body: 'Le site ne propose ni compte ni formulaire. Lorsque vous choisissez de nous contacter par e-mail, votre adresse, le contenu du message et les informations que vous fournissez sont traités uniquement pour répondre à votre demande.' },
        { title: 'Finalité et base légale', body: 'Les échanges par e-mail sont utilisés pour traiter les demandes, assurer le support et protéger le service. Le traitement repose sur notre intérêt légitime à répondre aux messages reçus et, selon le cas, sur les mesures précontractuelles demandées par la personne concernée.' },
        { title: 'Destinataires et conservation', body: 'Les messages sont accessibles uniquement aux personnes habilitées à répondre. Ils sont conservés pendant le temps nécessaire au suivi de la demande puis archivés ou supprimés selon les obligations applicables. Ils ne sont ni vendus ni utilisés à des fins publicitaires.' },
        { title: 'Journaux techniques', body: 'L’hébergeur peut traiter des données techniques telles que l’adresse IP, la date, la requête et les informations de sécurité afin de fournir, sécuriser et diagnostiquer le service. Ces journaux sont gérés selon les obligations et durées de conservation de l’hébergeur.' },
        { title: 'Vos droits', body: 'Vous pouvez demander l’accès, la rectification, l’effacement, la limitation ou l’opposition au traitement des données vous concernant. Contactez-nous à contact@cartavault.fr. Vous pouvez également saisir l’autorité de contrôle compétente, notamment la CNIL en France.' },
      ] },
      cookies: { title: 'Politique de cookies', description: 'Informations sur les cookies et traceurs du site cartavault.fr.', eyebrow: 'Cookies', sections: [
        { title: 'Aucun cookie non essentiel', body: 'Le site marketing CartaVault n’utilise pas de cookie publicitaire, de mesure d’audience, de personnalisation ni de traceur tiers. Il n’affiche donc pas de bannière de consentement pour ces finalités.' },
        { title: 'Cookies strictement nécessaires', body: 'À la date de cette politique, le site ne dépose pas de cookie fonctionnel propre. L’hébergeur ou les mécanismes de sécurité réseau peuvent toutefois traiter des données techniques nécessaires à la livraison et à la protection du site ; ils ne servent pas à vous suivre à des fins commerciales.' },
        { title: 'Liens externes et application', body: 'Les liens vers GitHub, l’application CartaVault et les autres services externes ouvrent leurs propres sites. Ces services appliquent leurs propres politiques de cookies. L’application app.cartavault.fr peut notamment utiliser des cookies de session et de sécurité nécessaires à son fonctionnement.' },
        { title: 'Gérer les cookies', body: 'Vous pouvez consulter, supprimer ou bloquer les cookies dans les paramètres de votre navigateur. Bloquer certains cookies nécessaires peut affecter le fonctionnement des services externes ou de l’application, mais pas la consultation normale de ce site marketing.' },
        { title: 'Mise à jour', body: 'Cette politique sera mise à jour avant l’ajout d’un outil de mesure, d’un service optionnel ou de tout traceur nécessitant une information ou un consentement.' },
      ] },
    },
  },
  en: {
    skip: 'Skip to content', navLabel: 'Main navigation', menu: 'Open menu', close: 'Close menu', language: 'FR', openApp: 'Beta Application',
    beta: {
      eyebrow: 'Demonstration release',
      title: 'CartaVault is currently in beta',
      body: 'This instance lets you explore CartaVault, but it remains experimental. Demo data is neither secured nor guaranteed and may be changed, reset or deleted without notice, so do not use it for important or sensitive information.',
      cancel: 'Return to the website',
      accept: 'I accept, open the application',
    },
    nav: { features: 'Features', 'self-hosting': 'Self-hosting', documentation: 'Documentation', roadmap: 'Roadmap' },
    footer: 'Map your discoveries. Keep control of your data.', legal: 'Legal notice', privacy: 'Privacy', cookies: 'Cookie policy', contact: 'Contact',
    featuresShowcase: {
      primary: 'Try CartaVault', secondary: 'View the demo',
      links: ['Discover maps', 'Explore trips', 'Understand sharing'],
      benefitsTitle: 'A solid foundation, down to the details',
      benefits: [
        { title: 'Advanced import and export', body: 'KML, KMZ and structured data.', icon: 'import' },
        { title: 'Professional exports', body: 'Illustrated PDFs, GPX and navigation.', icon: 'file' },
        { title: 'Complete history', body: 'Changes that remain clear and auditable.', icon: 'history' },
        { title: 'Self-hosting', body: 'A clear and documented Docker stack.', icon: 'server' },
        { title: 'Private by default', body: 'Your maps remain under your control.', icon: 'shield' },
      ],
    },
    home: {
      title: 'CartaVault — Your places, trips and data', description: 'CartaVault turns private maps and saved places into structured journeys in an open-source, self-hostable application.', eyebrow: 'Open-source personal mapping', hero: 'Remember every place. Shape every journey.', intro: 'A private map to collect, classify and retrieve points of interest, then organize them into day-by-day itineraries — without giving up control of your data.', primary: 'Explore on GitHub', secondary: 'See features', proof: ['Open source · MIT License', 'PostgreSQL + PostGIS', 'Docker · Self-contained setup'], placesTitle: 'A geographic memory that stays readable', placesBody: 'Import, search and classify places with categories, statuses, tags, regions and favorites. Lists, facets and markers remain efficient as maps grow.', tripsTitle: 'From discovery to itinerary in one workspace', tripsBody: 'Build days with drag and drop, plan nights, calculate routes, estimate time and export a travel-ready PDF.', collaborationTitle: 'Private by default, collaborative by choice', collaborationBody: 'Share a map with explicit roles, invite fellow travelers and transfer ownership without exposing other spaces.', hostingTitle: 'Choose how you run CartaVault', hostingBody: 'Self-hosting is available today. A simpler hosted offering is planned without taking away your ability to deploy at home.', self: 'Self-host today', cloud: 'Cloud planned', screenshotsTitle: 'A working product, not an abstract promise', ctaTitle: 'Ready to build your own atlas?', ctaBody: 'Explore the repository, deployment documentation and public roadmap.',
    },
    pages: {
      features: { title: 'Everything you need to organize, prepare and document your places.', description: 'CartaVault brings private maps, detailed place records, trip planning and collaboration into one workspace.', eyebrow: 'Product', sections: [
        { title: 'Maps and places', body: 'Create private country maps and retrieve every place from a structured record.', bullets: ['Text, address and coordinate search', 'Categories, statuses, tags, ratings and favorites', 'Photos, named links, history and trash', 'KML/KMZ import and KML/KMZ export'] },
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
        { title: 'Current focus', body: 'Advance the public beta: reproducible deployment, security, performance and high-quality trip planning.' },
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
      privacy: { title: 'Privacy policy', description: 'How the CartaVault marketing website processes personal data.', eyebrow: 'Privacy', sections: [
        { title: 'Scope', body: 'This policy applies only to cartavault.fr. The app.cartavault.fr application and each self-hosted instance have their own settings, controllers and applicable policies.' },
        { title: 'Controller and contact', body: 'This website is published by FlynX9. For privacy questions or to exercise your rights, email contact@cartavault.fr.' },
        { title: 'Data processed', body: 'The website provides no account or form. If you contact us by email, your address, message content and information you choose to provide are processed only to answer your request.' },
        { title: 'Purpose and legal basis', body: 'Email exchanges are used to handle requests, provide support and protect the service. Processing is based on our legitimate interest in answering received messages and, where applicable, steps requested before entering into a contract.' },
        { title: 'Recipients and retention', body: 'Messages are accessible only to people authorized to answer them. They are retained for the time needed to follow up on the request, then archived or deleted in accordance with applicable obligations. They are not sold or used for advertising.' },
        { title: 'Technical logs', body: 'The host may process technical data such as IP address, date, request and security information to deliver, secure and diagnose the service. These logs are handled under the host’s own legal obligations and retention periods.' },
        { title: 'Your rights', body: 'You may request access, correction, erasure, restriction or object to processing of your personal data. Contact us at contact@cartavault.fr. You may also lodge a complaint with the relevant supervisory authority.' },
      ] },
      cookies: { title: 'Cookie policy', description: 'Information about cookies and trackers on cartavault.fr.', eyebrow: 'Cookies', sections: [
        { title: 'No non-essential cookies', body: 'The CartaVault marketing website uses no advertising, analytics, personalization or third-party tracking cookie. It therefore does not display a consent banner for these purposes.' },
        { title: 'Strictly necessary technologies', body: 'At the date of this policy, the website does not set its own functional cookie. The host or network-security mechanisms may nevertheless process technical data needed to deliver and protect the website; it is not used for commercial tracking.' },
        { title: 'External links and application', body: 'Links to GitHub, the CartaVault application and other external services open their own websites. Those services apply their own cookie policies. app.cartavault.fr may in particular use session and security cookies required for its operation.' },
        { title: 'Managing cookies', body: 'You can inspect, delete or block cookies in your browser settings. Blocking necessary cookies may affect external services or the application, but not normal access to this marketing website.' },
        { title: 'Updates', body: 'This policy will be updated before adding analytics, an optional service or any tracker that requires notice or consent.' },
      ] },
    },
  },
};

export const href = (lang: Language, slug = '') => `/${lang}/${slug ? `${slug}/` : ''}`;
