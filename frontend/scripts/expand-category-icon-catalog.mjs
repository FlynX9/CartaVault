import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const catalogPath = resolve(root, '..', 'shared', 'category-icons.json')
const mdiPath = resolve(root, 'node_modules', '@iconify-icons', 'mdi')
const current = JSON.parse(readFileSync(catalogPath, 'utf8'))
const existingIds = new Set(current.map((entry) => entry.id))

const groups = [
  ['gastronomy', 120, ['food', 'silverware', 'restaurant', 'coffee', 'tea', 'bread', 'baguette', 'cake', 'cupcake', 'muffin', 'cookie', 'chef', 'glass', 'beer', 'wine', 'bottle-soda', 'fruit', 'apple', 'carrot', 'corn', 'cheese', 'hamburger', 'pizza', 'noodles', 'pasta', 'rice', 'sausage', 'grill', 'pot', 'kettle', 'blender', 'storefront', 'basket', 'avocado', 'candycane', 'chili', 'egg', 'ice-cream', 'peanut', 'popcorn', 'pretzel', 'taco']],
  ['photography', 45, ['camera', 'aperture', 'image', 'panorama', 'focus', 'film', 'video', 'drone', 'telescope', 'star-shooting', 'weather-night', 'weather-sunset', 'weather-sunset-up', 'weather-sunset-down', 'moon']],
  ['hiking', 14, ['hiking', 'walk', 'shoe', 'boot', 'backpack', 'sign-direction', 'sign-pole', 'trail', 'campfire', 'tent', 'compass', 'map-marker-distance', 'map-marker-path']],
  ['water', 46, ['water', 'wave', 'waves', 'waterfall', 'fountain', 'river', 'lake', 'hydro', 'dam', 'sprinkler', 'diving', 'swim', 'pool']],
  ['mountain', 18, ['mountain', 'terrain', 'summit', 'volcano', 'image-filter-hdr', 'landslide', 'snowflake', 'ski', 'climbing']],
  ['agriculture', 40, ['farm', 'tractor', 'barn', 'barley', 'wheat', 'corn', 'sprout', 'seed', 'greenhouse', 'watering', 'shovel', 'pitchfork', 'cow', 'pig', 'sheep', 'horse', 'bee', 'fruit', 'tree']],
  ['energy', 45, ['power', 'electric', 'electricity', 'transmission', 'solar', 'wind-turbine', 'battery', 'generator', 'lightning-bolt', 'oil', 'gas-cylinder', 'fuel', 'meter', 'transformer']],
  ['maritime', 19, ['boat', 'ferry', 'ship', 'sail', 'anchor', 'lighthouse', 'harbor', 'pier', 'buoy', 'submarine', 'canoe', 'kayak', 'rowing', 'yacht', 'fish']],
  ['sport', 67, ['soccer', 'football', 'basketball', 'baseball', 'tennis', 'badminton', 'volleyball', 'rugby', 'hockey', 'golf', 'stadium', 'run', 'bike', 'bicycle', 'swim', 'ski', 'snowboard', 'boxing', 'karate', 'weight', 'dumbbell', 'medal', 'trophy']],
  ['archaeology', 12, ['pillar', 'arch', 'ruin', 'amphitheater', 'excavator', 'shovel', 'pickaxe', 'grave', 'tomb', 'history', 'pot', 'treasure', 'fossil', 'bone', 'skull']],
  ['religion', 48, ['church', 'mosque', 'synagogue', 'temple', 'cross', 'grave', 'cemetery', 'coffin', 'menorah', 'prayer', 'meditation', 'star-david', 'om', 'khanda', 'islam', 'buddh', 'shrine']],
  ['military', 45, ['shield', 'tank', 'radar', 'target', 'bunker', 'fort', 'wall', 'security', 'watchtower', 'airplane', 'gun', 'pistol', 'sword', 'bomb', 'ammunition', 'parachute', 'flag']],
  ['health', 65, ['hospital', 'medical', 'medicine', 'medication', 'pill', 'pharmacy', 'ambulance', 'stethoscope', 'heart-pulse', 'doctor', 'nurse', 'tooth', 'wheelchair', 'rehab', 'thermometer', 'bandage', 'needle', 'spa', 'hot-tub', 'emergency']],
  ['education', 45, ['school', 'university', 'library', 'book-education', 'book-open', 'desk', 'teach', 'account-school', 'notebook', 'pencil', 'graduation', 'certificate', 'microscope', 'flask', 'research']],
  ['culture', 60, ['museum', 'theater', 'theatre', 'movie', 'cinema', 'palette', 'art', 'music', 'guitar', 'piano', 'microphone', 'drama', 'ticket', 'dance', 'library', 'book', 'sculpture']],
  ['accommodation', 35, ['hotel', 'bed', 'bunk', 'home', 'house', 'cabin', 'tent', 'camp', 'caravan', 'sofa', 'room-service', 'shower', 'bathtub', 'fireplace', 'key']],
  ['transport', 113, ['car', 'motorcycle', 'bicycle', 'train', 'rail', 'tram', 'subway', 'bus', 'airport', 'airplane', 'taxi', 'truck', 'parking', 'road', 'bridge', 'tunnel', 'traffic', 'cable-car', 'gondola', 'scooter', 'walk', 'ferry']],
  ['buildings', 90, ['home', 'house', 'building', 'office', 'castle', 'palace', 'tower', 'barn', 'warehouse', 'garage', 'greenhouse', 'hangar', 'skyscraper', 'roof', 'town-hall', 'courthouse', 'prison', 'lighthouse', 'windmill', 'water-tower', 'factory']],
  ['industry', 80, ['factory', 'warehouse', 'mine', 'mining', 'quarry', 'refinery', 'silo', 'crane', 'workshop', 'hammer', 'wrench', 'machinery', 'robot-industrial', 'chimney', 'pump', 'storage-tank', 'pipe', 'engine', 'cog', 'saw']],
  ['infrastructure', 65, ['bridge', 'tunnel', 'road', 'pipe', 'antenna', 'tower', 'water-pump', 'water-turbine', 'fire-hydrant', 'sewage', 'server', 'network', 'satellite', 'dam', 'construction', 'crane', 'road-variant']],
  ['nature', 93, ['tree', 'forest', 'flower', 'leaf', 'paw', 'bird', 'animal', 'fish', 'butterfly', 'bee', 'island', 'beach', 'cliff', 'valley', 'meadow', 'desert', 'rock', 'earth', 'weather', 'mushroom', 'pine']],
  ['access', 60, ['door', 'gate', 'lock', 'key', 'barrier', 'fence', 'alert', 'warning', 'security', 'cctv', 'surveillance', 'stairs', 'ladder', 'elevator', 'login', 'logout', 'entrance', 'exit', 'checkpoint', 'access-point']],
  ['urban', 55, ['city', 'bench', 'fountain', 'street', 'lamp', 'traffic-light', 'mailbox', 'statue', 'park', 'pedestrian', 'stairs', 'elevator', 'crosswalk', 'sign', 'recycle', 'trash', 'toilet']],
  ['commerce', 60, ['store', 'shop', 'shopping', 'cart', 'basket', 'cash', 'credit-card', 'bank', 'atm', 'market', 'fuel', 'repair', 'mechanic', 'charging', 'post', 'mail', 'scissors', 'briefcase']],
  ['administration', 35, ['account-tie', 'town-hall', 'bank', 'gavel', 'scale-balance', 'file-document', 'briefcase', 'shield-account', 'police', 'fire-station', 'passport', 'vote', 'government', 'office']],
  ['heritage', 50, ['castle', 'manor', 'palace', 'fort', 'church', 'monastery', 'memorial', 'monument', 'pillar', 'arch', 'history', 'clock', 'museum', 'grave', 'medal', 'trophy', 'bank-outline']],
  ['tourism', 50, ['map', 'compass', 'luggage', 'ticket', 'beach', 'landmark', 'binoculars', 'information', 'map-marker', 'passport', 'ferris-wheel', 'picnic', 'view', 'panorama', 'attraction']],
  ['other', 25, ['help', 'shape', 'tools', 'information', 'map-marker', 'dots', 'star', 'heart']],
]

const targetByGroup = new Map(groups.map(([id, target]) => [id, target]))
const stemsByGroup = new Map(groups.map(([id, , stems]) => [id, stems]))
const selected = [...current]
const selectedIds = new Set(existingIds)
const countByGroup = new Map(groups.map(([id]) => [id, current.filter((entry) => entry.group === id).length]))

const forbidden = /(^|[-])(off|remove|minus|plus|check|cancel|edit|sync|refresh|download|upload|import|export|settings|folder|file|clipboard|menu|harry|potion|doorbell|math|maths|ruler|greeting|skype|pumpkin)(-|$)|^(arrow|chevron|cursor|format|code|language-|microsoft|google|facebook|twitter|instagram|youtube|github|gitlab|npm|webpack|react)/
const excludedByGroup = {
  gastronomy: /broken|fragile|alert|empty|full|health|bugfood|keyboard|medicine|pill|spray|watering|pot-light|pot-mix|hamburger-(open|close)|car-front-glass|maker-(complete|done)/,
  photography: /add|broken|cog|play|switch|timer|retake|user|wireless|document|control|folders|library|message|lock|secure|move/,
  hiking: /add|ballet|formal|heel|cleat|truck|solar|sun/,
  water: /sawtooth|sine|square|triangle|thermometer|boiler|opacity|percent|recycle|reuse|filter|heater|polo|sprinkler-fire|pool-table|fountain-pen|z-wave|arrow|hand-wave/,
  mountain: /head|truck|transit|thermometer|approve|sun-snowflake/,
  archaeology: /pot-light|pot-mix|pot-steam|bottle|watering|fossil-fuel|weather-history/,
  buildings: /add|alert|analytics|automation|battery|chart|circle|climate|clock|cog|currency|export|flood|group-minus|lightning|lock|map-marker|percent|search|switch|thermometer|user|wireless/,
  transport: /paper-airplane|shield-airplane|shield-car|shopping-cart|pumpkin|sim-card|sd-card|id-card|identification-card/,
}
const files = readdirSync(mdiPath)
  .filter((file) => file.endsWith('.js') && !file.endsWith('.min.js'))
  .map((file) => file.slice(0, -3))
  .filter((name) => !forbidden.test(name))
  .sort((a, b) => a.localeCompare(b))

const exactLabels = {
  'waterfall': 'Cascade', 'camera': 'Appareil photo', 'camera-outline': 'Appareil photo (contour)',
  'image-filter-hdr': 'Panorama montagneux', 'binoculars': 'Point de vue', 'bread-slice': 'Boulangerie',
  'cupcake': 'Pâtisserie', 'basket': 'Marché', 'store': 'Épicerie', 'storefront': 'Commerce local',
  'hiking': 'Randonnée', 'tent': 'Camping', 'home-outline': 'Maison', 'hospital-building': 'Hôpital',
  'castle': 'Château', 'pillar': 'Colonne antique', 'arch': 'Arche historique', 'grave-stone': 'Tombe',
  'gas-station': 'Station-service', 'parking': 'Parking', 'ferry': 'Ferry', 'picnic': 'Aire de pique-nique',
  'map-marker-star': 'Site remarquable', 'weather-night': 'Photographie nocturne', 'telescope': 'Astronomie',
}
const words = {
  account: 'personne', alert: 'alerte', ambulance: 'ambulance', anchor: 'ancre', arch: 'arche',
  airplane: 'avion', airport: 'aéroport', apartment: 'appartement', bank: 'banque', barn: 'grange',
  barrier: 'barrière', beach: 'plage', bed: 'lit', bicycle: 'vélo', boat: 'bateau', book: 'livre',
  bridge: 'pont', building: 'bâtiment', bus: 'bus', cabin: 'refuge', camera: 'appareil photo',
  camp: 'camp', car: 'voiture', castle: 'château', cemetery: 'cimetière', chapel: 'chapelle',
  church: 'église', city: 'ville', clinic: 'clinique', coffee: 'café', compass: 'boussole',
  cross: 'croix', dam: 'barrage', door: 'porte', elevator: 'ascenseur', factory: 'usine',
  farm: 'ferme', ferry: 'ferry', fire: 'incendie', flower: 'fleur', food: 'restauration',
  forest: 'forêt', fort: 'fort', fountain: 'fontaine', fuel: 'carburant', garage: 'garage',
  gas: 'gaz', gate: 'portail', grave: 'tombe', greenhouse: 'serre', harbor: 'port',
  health: 'santé', hiking: 'randonnée', history: 'histoire', home: 'maison', hospital: 'hôpital',
  hotel: 'hôtel', house: 'maison', island: 'île', key: 'clé', lake: 'lac', landmark: 'monument',
  leaf: 'feuille', library: 'bibliothèque', lighthouse: 'phare', lock: 'verrou', map: 'carte',
  marker: 'repère', market: 'marché', medical: 'médical', memorial: 'mémorial', mine: 'mine',
  mosque: 'mosquée', mountain: 'montagne', museum: 'musée', office: 'bureau', oil: 'pétrole',
  outline: 'contour', palace: 'palais', park: 'parc', parking: 'parking', pharmacy: 'pharmacie',
  photo: 'photo', pier: 'jetée', pillar: 'colonne', pine: 'pin', police: 'police', pool: 'piscine',
  port: 'port', power: 'énergie', prison: 'prison', quarry: 'carrière', radar: 'radar', rail: 'rail',
  railway: 'ferroviaire', restaurant: 'restaurant', river: 'rivière', road: 'route', ruins: 'ruines',
  school: 'école', security: 'sécurité', shield: 'protection', shop: 'commerce', solar: 'solaire',
  spring: 'source', stairs: 'escaliers', station: 'station', store: 'magasin', street: 'rue',
  subway: 'métro', synagogue: 'synagogue', temple: 'temple', tent: 'tente', theater: 'théâtre',
  tower: 'tour', traffic: 'circulation', train: 'train', tram: 'tramway', tree: 'arbre',
  tunnel: 'tunnel', university: 'université', variant: 'variante', view: 'vue', village: 'village',
  volcano: 'volcan', walk: 'marche', warehouse: 'entrepôt', water: 'eau', waterfall: 'cascade',
  wave: 'vague', waves: 'vagues', wind: 'éolien', wine: 'vin', workshop: 'atelier',
}
Object.assign(words, {
  add: 'ajout', album: 'album', aperture: 'ouverture', apple: 'pomme', area: 'zone', auto: 'automatique', avocado: 'avocat',
  backpack: 'sac à dos', bakery: 'boulangerie', beer: 'bière', blender: 'mixeur', bone: 'os', bottle: 'bouteille', bread: 'pain',
  campfire: 'feu de camp', candycane: 'sucrerie', carrot: 'carotte', cheese: 'fromage', chef: 'chef', chili: 'piment', circle: 'cercle', climbing: 'escalade', cocktail: 'cocktail', cookie: 'biscuit', corn: 'maïs', country: 'pays', cupcake: 'pâtisserie',
  crossbones: 'croisés', description: 'description', direction: 'direction', directions: 'itinéraire', distance: 'distance', dive: 'plongée', diving: 'plongée', drop: 'goutte', egg: 'œuf', evaporation: 'évaporation', excavator: 'excavatrice',
  field: 'champ', film: 'film', filter: 'filtre', flow: 'écoulement', frame: 'cadre', fruit: 'fruit', glass: 'verre', grill: 'grill', hamburger: 'hamburger', human: 'personne',
  ice: 'glace', image: 'image', interior: 'intérieur', iris: 'iris', kettle: 'bouilloire', landslide: 'glissement de terrain', lens: 'objectif', local: 'local', location: 'emplacement',
  mist: 'brume', mix: 'mélange', moon: 'lune', move: 'déplacement', multiple: 'multiple', noodles: 'nouilles', open: 'ouvert', panorama: 'panorama', pasta: 'pâtes', pastry: 'pâtisserie', path: 'sentier', peanut: 'cacahuète',
  picnic: 'pique-nique', pizza: 'pizza', pole: 'poteau', popcorn: 'pop-corn', pot: 'marmite', pretzel: 'bretzel', producer: 'producteur', print: 'empreinte', rear: 'arrière', reel: 'bobine', rice: 'riz', rock: 'rocher', roll: 'pellicule', rose: 'rose',
  saver: 'économie', scuba: 'plongée', search: 'recherche', shimmer: 'brillant', shoe: 'chaussure', shopping: 'courses', silverware: 'couverts', ski: 'ski', skull: 'crâne', sneaker: 'basket', snowflake: 'neige', spoon: 'cuillère',
  star: 'étoile', steam: 'vapeur', summit: 'sommet', swim: 'nage', swimming: 'natation', taco: 'taco', tea: 'thé', temperature: 'température', transparent: 'transparent', treasure: 'trésor', truck: 'camion', tulip: 'tulipe', undercurrent: 'courant', video: 'vidéo',
})

const groupKeywords = {
  gastronomy: ['gastronomie', 'restaurant', 'alimentation'], photography: ['photo', 'photographie', 'image'],
  hiking: ['randonnée', 'sentier', 'outdoor'], water: ['eau', 'hydrographie'], mountain: ['montagne', 'relief'],
  agriculture: ['agriculture', 'ferme'], energy: ['énergie', 'réseau'], maritime: ['maritime', 'port'],
  sport: ['sport', 'loisir'], archaeology: ['archéologie', 'histoire', 'ruines'], buildings: ['bâtiment', 'architecture'],
  religion: ['religion', 'culte'], industry: ['industrie', 'urbex'], military: ['militaire', 'défense'],
  health: ['santé', 'soins'], education: ['enseignement', 'recherche'], culture: ['culture', 'art'],
  transport: ['transport', 'mobilité'], tourism: ['tourisme', 'visite'], infrastructure: ['infrastructure', 'équipement'],
  nature: ['nature', 'paysage'], access: ['accès', 'sécurité'], urban: ['urbain', 'ville'], commerce: ['commerce', 'service'],
  accommodation: ['hébergement', 'nuit'], administration: ['administration', 'service public'], heritage: ['patrimoine', 'historique'], other: ['divers'],
}

function labelFor(name) {
  if (exactLabels[name]) return exactLabels[name]
  const translated = name.split('-').map((word) => words[word] ?? word).join(' ')
  return translated.charAt(0).toLocaleUpperCase('fr-FR') + translated.slice(1)
}

for (const [group] of groups) {
  const target = targetByGroup.get(group)
  const stems = stemsByGroup.get(group)
  const candidates = files
    .filter((name) => !selectedIds.has(`mdi:${name}`) && !(excludedByGroup[group]?.test(name)) && stems.some((stem) => name === stem || name.startsWith(`${stem}-`) || name.endsWith(`-${stem}`) || name.includes(`-${stem}-`)))
    .sort((left, right) => {
      const leftNoise = left.split('-').length + (left.includes('outline') ? 1 : 0)
      const rightNoise = right.split('-').length + (right.includes('outline') ? 1 : 0)
      return leftNoise - rightNoise || left.localeCompare(right)
    })
  for (const name of candidates) {
    if ((countByGroup.get(group) ?? 0) >= target) break
    const id = `mdi:${name}`
    if (selectedIds.has(id)) continue
    let label = labelFor(name)
    const duplicate = selected.some((entry) => entry.group === group && entry.label.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase() === label.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase())
    if (duplicate) label = `${label} (${name})`
    const keywords = [...new Set([...groupKeywords[group], ...name.split('-'), ...name.split('-').map((word) => words[word]).filter(Boolean)])].slice(0, 10)
    selected.push({ id, label, group, keywords })
    selectedIds.add(id)
    countByGroup.set(group, (countByGroup.get(group) ?? 0) + 1)
  }
}

const unfilled = [...targetByGroup].filter(([group, target]) => (countByGroup.get(group) ?? 0) < target)
if (unfilled.length) throw new Error(`Unable to fill curated groups: ${unfilled.map(([group, target]) => `${group}=${countByGroup.get(group)}/${target}`).join(', ')}`)
if (selected.length !== 1500) throw new Error(`Expected exactly 1500 curated icons, received ${selected.length}`)

writeFileSync(catalogPath, `${JSON.stringify(selected, null, 2)}\n`, 'utf8')
console.log(`Expanded category icon catalog to ${selected.length} entries across ${countByGroup.size} groups.`)
